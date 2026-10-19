/**
 * Cliente Socket.IO — Dragonfall online (Passo 7/8)
 * Requer: <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
 */
(function (global) {
    "use strict";

    function defaultServerUrl() {
        try {
            const q = new URLSearchParams(global.location?.search || "");
            if (q.has("df_server")) return q.get("df_server");
            const saved = global.localStorage?.getItem("dragonfall:server");
            if (saved) return saved;
            if (global.__DF_DEFAULT_SERVER__) return String(global.__DF_DEFAULT_SERVER__).trim();
        } catch (e) {}
        return "http://localhost:8787";
    }

    function saveServerUrl(url) {
        const u = String(url || "").trim().replace(/\/$/, "");
        if (!u) return;
        try {
            global.localStorage?.setItem("dragonfall:server", u);
        } catch (e) {}
        return u;
    }

    function persistSession(code, seat, seatToken) {
        try {
            const payload = { code, seat };
            if (seatToken) payload.seatToken = seatToken;
            global.localStorage?.setItem("dragonfall:pvp", JSON.stringify(payload));
        } catch (e) {}
    }

    function readPersistedSession() {
        try {
            const raw = global.localStorage?.getItem("dragonfall:pvp");
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function clearPersistedSession() {
        try {
            global.localStorage?.removeItem("dragonfall:pvp");
        } catch (e) {}
    }

    function rankedPlayerId() {
        try {
            const authId = global.DfAuthClient?.getCachedPlayer?.()?.id;
            if (authId && typeof authId === "string") return authId;
            let id = global.localStorage?.getItem("dragonfall:rankedId");
            if (!id) {
                id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
                global.localStorage?.setItem("dragonfall:rankedId", id);
            }
            return id;
        } catch (e) {
            return `anon-${Date.now()}`;
        }
    }

    /**
     * @param {object} opts
     * @param {string} [opts.serverUrl]
     * @param {(event: string, data: unknown) => void} [opts.onEvent]
     */
    function createNetClient(opts = {}) {
        let serverUrl = opts.serverUrl || defaultServerUrl();
        let socket = null;
        let seat = null;
        let roomCode = null;
        let seatToken = null;
        let connected = false;
        let serverGameVersion = null;
        let lastActionSeq = 0;
        let connectPromise = null;
        let intentionalClose = false;
        let matchPingTimer = null;
        let actionQueue = Promise.resolve();
        const ACK_TIMEOUT_MS = 9000;
        const ULTIMATE_ACK_TIMEOUT_MS = 12000;
        const CRITICAL_TYPES = new Set([
            "END_TURN", "DRAW_CARD", "SUMMON", "SURRENDER",
            "ULTIMATE_PLAY", "ATTACK_RESOLVE", "TALENT_START",
            "REACTIVE_BLOCK_ANSWER", "REACTIVE_PROTECTION_ANSWER", "REACTIVE_CANCEL_ANSWER",
        ]);

        // Hidratar sessão PvP persistida (F5 / reabrir app).
        try {
            const saved = readPersistedSession();
            if (saved?.code) {
                roomCode = saved.code;
                if (saved.seat === 0 || saved.seat === 1) seat = saved.seat | 0;
                if (saved.seatToken) seatToken = saved.seatToken;
            }
        } catch (e) { /* */ }

        function emitLocal(event, data) {
            opts.onEvent?.(event, data);
        }

        function wireSocket(sock) {
            sock.on("hello", (data) => {
                serverGameVersion = data?.gameVersion || null;
                const localVer = global.__DF_DISPLAY_VERSION || "";
                if (serverGameVersion && localVer && serverGameVersion !== localVer) {
                    emitLocal("version_mismatch", { local: localVer, server: serverGameVersion });
                }
                emitLocal("hello", data);
            });
            let hadConnect = false;
            let rejoinInFlight = false;
            let lastRejoinAt = 0;
            function hydrateSessionFromPersist() {
                const saved = readPersistedSession();
                if (!saved?.code) return false;
                roomCode = saved.code;
                if (saved.seat === 0 || saved.seat === 1) seat = saved.seat | 0;
                if (saved.seatToken) seatToken = saved.seatToken;
                return true;
            }
            function rejoinAfterReconnect() {
                const now = Date.now();
                if (rejoinInFlight || (now - lastRejoinAt < 1500)) return;
                rejoinInFlight = true;
                lastRejoinAt = now;
                if (!roomCode) hydrateSessionFromPersist();
                if (!roomCode) {
                    rejoinInFlight = false;
                    return;
                }
                const preferSeat = seat;
                const tryJoin = (attempt) => ack("join_room", {
                    code: roomCode,
                    preferSeat,
                    seatToken: seatToken || undefined,
                }).then((res) => {
                    if ((!res || res.ok === false)
                        && attempt < 3
                        && res?.error !== "ROOM_NOT_FOUND"
                        && res?.error !== "BAD_SEAT_TOKEN") {
                        return new Promise((r) => setTimeout(r, 350 * attempt))
                            .then(() => tryJoin(attempt + 1));
                    }
                    if (!res || res.ok === false) {
                        emitLocal("reconnected", {
                            seat,
                            roomCode,
                            yourSeat: seat,
                            ok: false,
                            error: res?.error || "RESUME_FAILED",
                        });
                        return res;
                    }
                    if (res?.seat != null) seat = res.seat;
                    if (res?.code) roomCode = res.code;
                    if (res?.seatToken) seatToken = res.seatToken;
                    persistSession(roomCode, seat, seatToken);
                    startMatchPing();
                    // Só após ACK: seat/token/replay frescos — evita dessync de turno.
                    emitLocal("reconnected", {
                        seat,
                        roomCode,
                        yourSeat: seat,
                        seatToken,
                        gameState: res?.replay?.gameState || res?.gameState || null,
                        snapshot: res?.replay?.snapshot || res?.snapshot || null,
                        seq: res?.replay?.seq ?? res?.seq,
                        replay: res?.replay || null,
                        ok: true,
                    });
                    if (res?.replay) emitLocal("replay_sync", res.replay);
                    else {
                        ack("get_replay", { fromSeq: lastActionSeq }).then((r) => {
                            if (r?.seq != null) lastActionSeq = r.seq;
                            emitLocal("replay_sync", r);
                        }).catch(() => {});
                    }
                    return res;
                }).catch(() => {
                    if (attempt < 3) {
                        return new Promise((r) => setTimeout(r, 350 * attempt))
                            .then(() => tryJoin(attempt + 1));
                    }
                    return ack("get_replay", { fromSeq: lastActionSeq }).then((res) => {
                        if (res?.seq != null) lastActionSeq = res.seq;
                        emitLocal("reconnected", {
                            seat,
                            roomCode,
                            yourSeat: seat,
                            ok: false,
                        });
                        emitLocal("replay_sync", res);
                    }).catch(() => {
                        emitLocal("reconnected", {
                            seat,
                            roomCode,
                            yourSeat: seat,
                            ok: false,
                        });
                    });
                });
                tryJoin(1).finally(() => {
                    rejoinInFlight = false;
                });
            }
            // remove old finally that only set rejoinInFlight = false at end of catch path
            void 0;
            sock.on("server_restarting", (data) => {
                emitLocal("server_restarting", data || {});
                emitLocal("net_status", { status: "reconnecting" });
            });
            sock.on("connect", () => {
                const wasReconnect = hadConnect;
                hadConnect = true;
                connected = true;
                intentionalClose = false;
                emitLocal("connected", { serverUrl });
                emitLocal("net_status", { status: "connected" });
                if (wasReconnect) rejoinAfterReconnect();
                else if (roomCode) {
                    startMatchPing();
                    // Primeira conexão com sessão hidratada do localStorage.
                    if (!wasReconnect && seatToken) rejoinAfterReconnect();
                }
            });
            sock.on("disconnect", (reason) => {
                connected = false;
                stopMatchPing();
                // Blip de rede: NÃO limpa dragonfall:pvp — só leaveRoom/forfeit.
                const willReconnect = !intentionalClose && sock.active !== false
                    && reason !== "io client disconnect";
                emitLocal("disconnected", { reason: reason || "disconnect", willReconnect });
                emitLocal("net_status", {
                    status: willReconnect ? "reconnecting" : "offline",
                });
            });
            // Manager events (reconexão real).
            try {
                sock.io?.on?.("reconnect", () => {
                    connected = true;
                    rejoinAfterReconnect();
                });
                sock.io?.on?.("reconnect_attempt", () => {
                    emitLocal("reconnect_attempt", {});
                });
                sock.io?.on?.("reconnect_failed", () => {
                    emitLocal("reconnect_failed", {});
                });
            } catch (e) { /* */ }
            // connect_error durante retries NÃO derruba o cliente em toast — só falha dura.
            sock.on("connect_error", (err) => {
                connected = false;
                emitLocal("connect_error", {
                    message: err?.message || String(err),
                    transient: !!sock.active,
                });
            });
            sock.on("room_state", (data) => emitLocal("room_state", data));
            sock.on("match_found", (data) => emitLocal("match_found", data));
            sock.on("ranked_match_found", (data) => emitLocal("ranked_match_found", data));
            sock.on("ranked_result", (data) => emitLocal("ranked_result", data));
            sock.on("match_start", (data) => emitLocal("match_start", data));
            sock.on("remote_action", (data) => {
                // NÃO avançar lastActionSeq no receive — só após apply bem-sucedido
                // (confirmAppliedSeq). Senão gap-fill fica cego e o peer perde SUMMON.
                emitLocal("remote_action", data);
            });
            sock.on("peer_left", (data) => emitLocal("peer_left", data));
            sock.on("peer_disconnected", (data) => emitLocal("peer_disconnected", data));
            sock.on("peer_ai_control", (data) => emitLocal("peer_ai_control", data));
            sock.on("shard_redirect", (data) => {
                emitLocal("shard_redirect", data || {});
                if (data?.serverUrl) {
                    void reconnectToShard(data);
                }
            });
        }

        /** Fase 6: gateway/game redirect (MP only). */
        async function reconnectToShard(info) {
            const nextUrl = String(info?.serverUrl || "").trim().replace(/\/$/, "");
            if (!nextUrl || nextUrl === serverUrl) return { ok: false, error: "SAME_SHARD" };
            saveServerUrl(nextUrl);
            serverUrl = nextUrl;
            intentionalClose = true;
            try { stopMatchPing(); } catch (e) { /* */ }
            try { socket?.disconnect(); } catch (e) { /* */ }
            socket = null;
            connected = false;
            connectPromise = null;
            intentionalClose = false;
            emitLocal("net_status", { status: "redirecting", serverUrl: nextUrl });
            await connect();
            emitLocal("shard_connected", { serverUrl: nextUrl, roomCode: info?.roomCode || roomCode });
            if (info?.roomCode) {
                return joinRoomInternal(info.roomCode);
            }
            return { ok: true, redirected: true, serverUrl: nextUrl };
        }

        function joinRoomInternal(code) {
            const codeUp = String(code || "").trim().toUpperCase();
            const saved = readPersistedSession();
            const preferSeat = (saved?.code === codeUp) ? saved.seat : null;
            const tok = (saved?.code === codeUp) ? saved.seatToken : null;
            return ack("join_room", {
                code: codeUp,
                preferSeat,
                seatToken: tok || seatToken || undefined,
            }).then((res) => {
                if (res?.ok === false && (res.error === "WRONG_SHARD" || res.error === "WRONG_ROLE")
                    && res.serverUrl) {
                    return reconnectToShard(res);
                }
                if (res?.ok === false) return res;
                seat = res.seat;
                roomCode = res.code;
                if (res.seatToken) seatToken = res.seatToken;
                persistSession(roomCode, seat, seatToken);
                startMatchPing();
                if (res.replay?.seq != null) lastActionSeq = res.replay.seq;
                if (res.replay) emitLocal("replay_sync", res.replay);
                return res;
            });
        }

        function connect() {
            if (typeof global.io !== "function") {
                return Promise.reject(new Error("SOCKET_IO_NOT_LOADED"));
            }
            if (socket?.connected) {
                connected = true;
                return Promise.resolve({ connected: true, seat, roomCode });
            }
            // Já existe socket a reconectar — não criar outro (causava “Sem conexão” fantasma).
            if (socket && !intentionalClose) {
                if (connectPromise) return connectPromise;
                return new Promise((resolve, reject) => {
                    const onOk = () => {
                        cleanup();
                        connected = true;
                        resolve({ connected: true, seat, roomCode });
                    };
                    const onErr = (err) => {
                        // Mantém o socket; só rejeita se esgotar tentativas.
                        if (socket && socket.active === false) {
                            cleanup();
                            reject(err || new Error("CONNECT_FAILED"));
                        }
                    };
                    const cleanup = () => {
                        socket.off("connect", onOk);
                        socket.off("reconnect", onOk);
                        socket.off("reconnect_failed", onErr);
                    };
                    socket.once("connect", onOk);
                    socket.once("reconnect", onOk);
                    socket.once("reconnect_failed", onErr);
                    try { socket.connect(); } catch (e) { /* */ }
                });
            }
            if (connectPromise) return connectPromise;

            intentionalClose = false;
            connectPromise = new Promise((resolve, reject) => {
                let settled = false;
                socket = global.io(serverUrl, {
                    transports: ["websocket", "polling"],
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 600,
                    reconnectionDelayMax: 8000,
                    timeout: 20000,
                    forceNew: false,
                });
                wireSocket(socket);
                socket.on("connect", () => {
                    if (!settled) {
                        settled = true;
                        connectPromise = null;
                        resolve({ connected: true });
                    }
                });
                // Só falha a Promise inicial após esgotar / erro duro.
                const failOnce = (err) => {
                    if (settled) return;
                    // Não rejeita na 1ª connect_error — o manager ainda reconecta.
                    if (socket?.active !== false) return;
                    settled = true;
                    connectPromise = null;
                    reject(err || new Error("CONNECT_FAILED"));
                };
                socket.on("reconnect_failed", () => failOnce(new Error("RECONNECT_FAILED")));
                // Timeout de cortesia para a 1ª conexão (Render cold start ~1 min).
                setTimeout(() => {
                    if (!settled && !socket?.connected) {
                        // Ainda tenta em background; UI pode mostrar “conectando”.
                        emitLocal("connect_slow", { serverUrl });
                    }
                }, 25000);
            });
            return connectPromise;
        }

        function stopMatchPing() {
            if (matchPingTimer) {
                clearInterval(matchPingTimer);
                matchPingTimer = null;
            }
        }

        function startMatchPing() {
            stopMatchPing();
            if (!roomCode) return;
            matchPingTimer = setInterval(() => {
                if (!socket?.connected || !roomCode) return;
                try {
                    let telemetry = {};
                    try {
                        const online = global.__dfOnline;
                        const pres = online?.getPresentTelemetry?.()
                            || global.DfMpPresenter?._lastTelemetry
                            || null;
                        if (pres) {
                            telemetry = {
                                presentSkewMs: pres.presentSkewMs | 0,
                                queueWaitMs: pres.queueWaitMs | 0,
                            };
                        }
                    } catch (e) { /* */ }
                    socket.emit("match_ping", telemetry, (res) => {
                        if (!res?.ok) return;
                        if (res.turnDeadline) {
                            try {
                                global.__dfTurnDeadline = res.turnDeadline | 0;
                                emitLocal("turn_deadline", { turnDeadline: res.turnDeadline });
                            } catch (e) { /* */ }
                        }
                        if (res.serverNow != null || res.serverTime != null) {
                            try {
                                const serverNow = (res.serverNow || res.serverTime) | 0;
                                global.__dfServerNow = serverNow;
                                global.__dfServerClock = { serverNow, clientAt: Date.now() };
                                global.__dfLastSeq = res.lastSeq | 0;
                                global.__dfPresentBudgetMs = res.presentBudgetMs | 0;
                            } catch (e) { /* */ }
                        }
                        // Gap-fill: usar seq APLICADO (_dfLastRemoteSeq), não lastActionSeq.
                        try {
                            const serverSeq = res.lastSeq != null ? (res.lastSeq | 0) : 0;
                            const appliedSeq = (global.__dfAppliedRemoteSeq != null
                                ? (global.__dfAppliedRemoteSeq | 0)
                                : (lastActionSeq | 0));
                            if ((lastActionSeq | 0) !== appliedSeq) {
                                try {
                                    console.warn("[DF online] seq cursor drift", {
                                        lastActionSeq, appliedSeq, serverSeq,
                                    });
                                } catch (eLog) { /* */ }
                            }
                            const localSeq = appliedSeq;
                            const nowGap = Date.now();
                            if (serverSeq > localSeq && roomCode && socket?.connected
                                && (!rejoinAfterReconnect._lastGapAt || nowGap - rejoinAfterReconnect._lastGapAt > 4000)) {
                                rejoinAfterReconnect._lastGapAt = nowGap;
                                ack("get_replay", { fromSeq: localSeq }).then((r) => {
                                    if (r?.ok || r?.gameState || r?.entries?.length) {
                                        emitLocal("replay_sync", { ...(r || {}), gapFill: true });
                                    }
                                }).catch(() => {});
                            }
                        } catch (e) { /* */ }
                    });
                } catch (e) { /* */ }
            }, 5000);
        }

        function ack(event, payload, opts = {}) {
            const softFail = !!opts.softFail;
            const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : ACK_TIMEOUT_MS;
            return new Promise((resolve, reject) => {
                if (!socket?.connected) {
                    if (softFail) {
                        resolve({ ok: false, error: "NOT_CONNECTED" });
                        return;
                    }
                    reject(new Error("NOT_CONNECTED"));
                    return;
                }
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    if (softFail) resolve({ ok: false, error: "ACK_TIMEOUT" });
                    else reject(new Error("ACK_TIMEOUT"));
                }, timeoutMs);
                socket.emit(event, payload ?? {}, (res) => {
                    clearTimeout(timer);
                    if (settled) {
                        // ACK atrasado após timeout: ainda publica para o cliente
                        // reconciliar (END_TURN aplicado no servidor sem o cliente saber).
                        if (res?.ok && res.authoritativeState?.players?.length) {
                            try {
                                emitLocal("late_action_ack", {
                                    action: payload?.action || payload,
                                    ack: res,
                                });
                            } catch (e) { /* */ }
                        }
                        return;
                    }
                    settled = true;
                    if (res?.ok === false && !softFail) reject(new Error(res.error || "SERVER_ERROR"));
                    else resolve(res || { ok: false, error: "NO_ACK" });
                });
            });
        }

        function enqueueCritical(fn) {
            const run = actionQueue.then(fn, fn);
            actionQueue = run.catch(() => {});
            return run;
        }

        return {
            get serverUrl() { return serverUrl; },
            get connected() { return !!(connected && socket?.connected); },
            get seat() { return seat; },
            get roomCode() { return roomCode; },
            get seatToken() { return seatToken; },
            get serverGameVersion() { return serverGameVersion; },
            get lastActionSeq() { return lastActionSeq; },

            /** Confirma seq após apply bem-sucedido (MP gap-fill). */
            confirmAppliedSeq(seq) {
                if (seq == null) return;
                const s = seq | 0;
                lastActionSeq = Math.max(lastActionSeq | 0, s);
                try { global.__dfAppliedRemoteSeq = Math.max(global.__dfAppliedRemoteSeq | 0, s); } catch (e) { /* */ }
            },

            /** Novo match — zera cursores de seq (MP). */
            resetAppliedSeq() {
                lastActionSeq = 0;
                try { global.__dfAppliedRemoteSeq = 0; } catch (e) { /* */ }
            },

            connect,

            async joinQueue() {
                await connect();
                const res = await ack("join_queue");
                if (res.seat != null) seat = res.seat;
                if (res.code) roomCode = res.code;
                if (res.seatToken) seatToken = res.seatToken;
                if (res.code) persistSession(roomCode, seat, seatToken);
                return res;
            },

            leaveQueue() {
                return ack("leave_queue");
            },

            async joinRankedQueue(playerId) {
                await connect();
                const token = global.DfAuthClient?.getToken?.() || "";
                const res = await ack("join_ranked_queue", {
                    playerId: playerId || rankedPlayerId(),
                    token: token || undefined,
                });
                if (res.seat != null) seat = res.seat;
                if (res.code) roomCode = res.code;
                if (res.seatToken) seatToken = res.seatToken;
                return res;
            },

            leaveRankedQueue() {
                return ack("leave_ranked_queue");
            },

            getRankedProfile(playerId) {
                return ack("get_ranked_profile", { playerId: playerId || rankedPlayerId() });
            },

            async createRoom() {
                await connect();
                const res = await ack("create_room");
                if (res?.ok === false && (res.error === "WRONG_ROLE" || res.error === "WRONG_SHARD")
                    && res.serverUrl) {
                    await reconnectToShard(res);
                    return ack("create_room").then((r2) => {
                        if (r2?.ok === false) return r2;
                        seat = r2.seat;
                        roomCode = r2.code;
                        if (r2.seatToken) seatToken = r2.seatToken;
                        persistSession(roomCode, seat, seatToken);
                        return r2;
                    });
                }
                seat = res.seat;
                roomCode = res.code;
                if (res.seatToken) seatToken = res.seatToken;
                persistSession(roomCode, seat, seatToken);
                return res;
            },

            async joinRoom(code) {
                await connect();
                return joinRoomInternal(code);
            },

            setHero(heroId, extra = {}) {
                const payload = { heroId };
                if (Array.isArray(extra?.deckCardNames)) {
                    payload.deckCardNames = extra.deckCardNames.slice(0, 24);
                }
                return ack("set_hero", payload);
            },

            setWinPoints(winPoints) {
                return ack("set_win_points", { winPoints });
            },

            setReady(ready) {
                return ack("set_ready", { ready: !!ready });
            },

            startMatch() {
                return ack("start_match").then((res) => {
                    if (res?.seatToken) seatToken = res.seatToken;
                    startMatchPing();
                    return res;
                });
            },

            sendAction(action, snapshot) {
                const type = action?.type;
                const clientActionId = `${Date.now().toString(36)}-${(lastActionSeq | 0) + 1}-${Math.random().toString(36).slice(2, 8)}`;
                const timeoutMs = type === "ULTIMATE_PLAY" ? ULTIMATE_ACK_TIMEOUT_MS : ACK_TIMEOUT_MS;
                const run = () => ack("game_action", {
                    action,
                    snapshot: snapshot || null,
                    clientActionId,
                }, { softFail: true, timeoutMs }).then((res) => {
                    if (res?.seq != null) lastActionSeq = res.seq;
                    return res;
                });
                if (CRITICAL_TYPES.has(type)) return enqueueCritical(run);
                return run();
            },

            getReplay(fromSeq = 0) {
                return ack("get_replay", { fromSeq }).then((res) => {
                    // Não avançar lastActionSeq aqui — só após apply (confirmAppliedSeq).
                    if (res?.entries || res?.gameState || res?.snapshot) {
                        emitLocal("replay_sync", {
                            seq: res.seq,
                            entries: res.entries || [],
                            snapshot: res.snapshot || null,
                            gameState: res.gameState || null,
                            gapFill: !!res.gapFill || (fromSeq | 0) > 0,
                        });
                    }
                    return res;
                });
            },

            leaveRoom(opts = {}) {
                const payload = opts && typeof opts === "object" ? { ...opts } : {};
                // Mid-match sem forfeit = abandonar (IA assume o assento no servidor).
                if (payload.abandon !== false
                    && !payload.forfeit
                    && roomCode
                    && (global.__DF_ONLINE || global.document?.body?.classList?.contains("df-pvp-mode"))) {
                    payload.abandon = true;
                }
                intentionalClose = true;
                stopMatchPing();
                // Só limpa dragonfall:pvp em forfeit explícito ou clearSession:true.
                // Abandono (sair / queda) MANTÉM a sessão para o jogador voltar à partida.
                const clearSession = payload.clearSession === true || !!payload.forfeit;
                return ack("leave_room", payload).finally(() => {
                    seat = null;
                    roomCode = null;
                    seatToken = null;
                    if (clearSession) clearPersistedSession();
                    try { socket?.disconnect(); } catch (e) { /* */ }
                    connected = false;
                    connectPromise = null;
                });
            },

            /** Reentrada após F5 / reabrir app — join_room com tokens persistidos. */
            tryResumeSession() {
                const saved = readPersistedSession();
                if (!saved?.code) return Promise.resolve({ ok: false, error: "NO_SESSION" });
                roomCode = saved.code;
                if (saved.seat === 0 || saved.seat === 1) seat = saved.seat | 0;
                if (saved.seatToken) seatToken = saved.seatToken;
                return this.connect().then(() => ack("join_room", {
                    code: roomCode,
                    preferSeat: seat,
                    seatToken: seatToken || undefined,
                })).then((res) => {
                    if (!res || res.ok === false) {
                        const err = res?.error || "RESUME_FAILED";
                        if (err === "ROOM_NOT_FOUND" || err === "NO_SESSION") {
                            clearPersistedSession();
                            roomCode = null;
                            seat = null;
                            seatToken = null;
                        }
                        return { ok: false, error: err };
                    }
                    if (res.seat != null) seat = res.seat;
                    if (res.code) roomCode = res.code;
                    if (res.seatToken) seatToken = res.seatToken;
                    persistSession(roomCode, seat, seatToken);
                    startMatchPing();
                    // NÃO emitir replay_sync aqui — o caller aplica uma vez
                    // (emit + await em paralelo causava race → tela preta).
                    return {
                        ok: true,
                        replay: res.replay || null,
                        seat,
                        code: roomCode,
                        status: res.status || null,
                        reconnected: !!res.reconnected,
                    };
                }).catch((e) => {
                    // Rede / timeout: NÃO limpar dragonfall:pvp (retry no próximo boot).
                    return { ok: false, error: e?.message || "RESUME_FAILED", transient: true };
                });
            },

            readPersistedSession,
            clearPersistedSession,
        };
    }

    global.DfNetClient = {
        defaultServerUrl,
        saveServerUrl,
        create: createNetClient,
        readPersistedSession,
        clearPersistedSession,
    };
})(typeof window !== "undefined" ? window : globalThis);
