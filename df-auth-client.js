/**
 * Dragonfall — cliente de autenticação (e-mail + senha + token persistente).
 *
 * Sync multi-dispositivo:
 * - Com login, a nuvem (/auth/me + profileRevision) é a fonte da verdade no PULL.
 * - Se este aparelho tiver perfil MAIS RICO (XP/nível/baralhos/fundo), FAZ PUSH
 *   antes de qualquer pull — nunca apagar Manowar/nível alto com snapshot velho do PC.
 * - localStorage só é espelho; outbox guarda falhas de rede para reenviar.
 */
(function (global) {
    "use strict";

    const TOKEN_KEY = "dragonfall:authToken";
    const PLAYER_KEY = "dragonfall:authPlayer";
    const OUTBOX_KEY = "dragonfall:profileOutbox";
    const LIVE_SYNC_INTERVAL_MS = 8000;
    const LIVE_SYNC_MIN_GAP_MS = 4000;

    /** Último player retornado pela API — baseline para sync (não o cache mesclado). */
    let lastServerSnapshot = null;
    let localProfileDirty = false;

    let arsenalSessionDirty = false;

    function markArsenalSessionDirty() {
        arsenalSessionDirty = true;
        markLocalProfileDirty();
    }

    function clearArsenalSessionDirty() {
        arsenalSessionDirty = false;
    }

    function shouldBlockAuthoritativeProfilePull() {
        if (hasOutboxPending()) return true;
        if (global.document?.body?.classList?.contains("df-arsenal-open")) return true;
        return false;
    }

    function mergeRemoteProfileFields(serverPlayer, opts = {}) {
        if (!serverPlayer) return null;
        const cached = getCachedPlayer();
        if (!cached) return null;

        const patch = {};
        if (serverPlayer.hubBackgroundId
            && global.DfHubSplash?.isValidId?.(serverPlayer.hubBackgroundId)
            && serverPlayer.hubBackgroundId !== cached.hubBackgroundId) {
            patch.hubBackgroundId = serverPlayer.hubBackgroundId;
        }
        if (serverPlayer.avatarHeroId && serverPlayer.avatarHeroId !== cached.avatarHeroId) {
            patch.avatarHeroId = serverPlayer.avatarHeroId;
        }
        if (serverPlayer.displayName != null && serverPlayer.displayName !== cached.displayName) {
            patch.displayName = serverPlayer.displayName;
        }
        if (serverPlayer.displayNameLocked != null
            && serverPlayer.displayNameLocked !== cached.displayNameLocked) {
            patch.displayNameLocked = serverPlayer.displayNameLocked;
        }
        const serverXp = Math.max(0, Number(serverPlayer.totalXp) | 0);
        const cachedXp = Math.max(0, Number(cached.totalXp) | 0);
        if (serverXp !== cachedXp) {
            patch.totalXp = serverXp;
            patch.level = serverPlayer.level;
        }
        if (!opts.skipDecks && Array.isArray(serverPlayer.customDecks)) {
            const serverFp = decksFingerprint(serverPlayer.customDecks);
            const cachedFp = decksFingerprint(cached.customDecks);
            if (serverFp !== cachedFp) {
                patch.customDecks = serverPlayer.customDecks;
            }
        }
        if (!Object.keys(patch).length) return cached;

        const serverRev = Number(serverPlayer.profileRevision ?? 0);
        const merged = {
            ...cached,
            ...patch,
            profileRevision: serverRev,
        };
        applyServerPlayer(merged);
        persistLocalFromPlayer(merged);
        return merged;
    }

    function clearLocalProfileDirty() {
        localProfileDirty = false;
    }

    function markLocalProfileDirty() {
        localProfileDirty = true;
    }

    function isLocalProfileDirty() {
        return localProfileDirty || hasOutboxPending();
    }

    /** Mesma conta (id ou e-mail) — nunca misturar Betorich com conta nova. */
    function sameAccount(a, b) {
        if (!a || !b) return false;
        if (a.id && b.id && String(a.id) === String(b.id)) return true;
        const ea = String(a.email || "").trim().toLowerCase();
        const eb = String(b.email || "").trim().toLowerCase();
        return !!(ea && eb && ea === eb);
    }

    /** Invalida /auth/me e liveSync em voo ao trocar de conta. */
    let accountEpoch = 0;
    function bumpAccountEpoch() {
        accountEpoch = (accountEpoch + 1) >>> 0;
        return accountEpoch;
    }
    function currentAccountEpoch() {
        return accountEpoch;
    }

    /**
     * Limpa espelho local da sessão anterior (player, baralhos, fundo, outbox, rankedId).
     * Obrigatório em register/login/logout — senão a conta antiga “vence” a nova.
     */
    function clearDeviceAccountLocalState(opts = {}) {
        bumpAccountEpoch();
        lastServerSnapshot = null;
        clearLocalProfileDirty();
        clearArsenalSessionDirty();
        writeOutbox(null);
        lastLocalProfilePushFp = "";
        lastLocalProfilePushAt = 0;
        try {
            global.localStorage?.removeItem(PLAYER_KEY);
            global.localStorage?.removeItem("df_custom_decks_v1");
            global.localStorage?.removeItem("dragonfall:hubBgId");
            // Ranked legado por aparelho — não deve seguir a próxima conta no mesmo browser.
            global.localStorage?.removeItem("dragonfall:rankedId");
            if (!opts.keepToken) global.localStorage?.removeItem(TOKEN_KEY);
        } catch (e) { /* */ }
        try {
            global.DfArsenal?.onProfileDecksSync?.({ customDecks: [] });
        } catch (e) { /* */ }
        try {
            global.DfAuthUi?.syncHubProfile?.();
        } catch (e) { /* */ }
    }

    /** Aplica o player da API sem misturar cache de outra conta. */
    function adoptServerAccount(serverPlayer) {
        if (!serverPlayer) {
            applyServerPlayer(null);
            return null;
        }
        // customDecks null na nuvem = conta sem baralhos — grava lista vazia no aparelho.
        const normalized = {
            ...serverPlayer,
            customDecks: Array.isArray(serverPlayer.customDecks)
                ? serverPlayer.customDecks
                : normalizeDecksForServer(null),
        };
        rememberServerSnapshot(normalized);
        applyServerPlayer(normalized, { pullOnly: true });
        persistLocalFromPlayer(normalized);
        clearLocalProfileDirty();
        clearArsenalSessionDirty();
        syncUiFromPlayer(getCachedPlayer() || normalized);
        return getCachedPlayer() || normalized;
    }

    function rememberServerSnapshot(p) {
        if (p && p.id) lastServerSnapshot = { ...p };
    }

    function getLastServerSnapshot() {
        return lastServerSnapshot ? { ...lastServerSnapshot } : null;
    }

    function resolveApiBase() {
        try {
            const q = new URLSearchParams(global.location?.search || "");
            const fromQ = q.get("df_auth_api");
            if (fromQ) return fromQ.replace(/\/$/, "");
        } catch (e) { /* */ }
        if (global.__DF_AUTH_API__) {
            return String(global.__DF_AUTH_API__).replace(/\/$/, "");
        }
        try {
            const loc = global.location;
            if (loc && (loc.protocol === "http:" || loc.protocol === "https:")) {
                const host = loc.hostname || "";
                const port = loc.port || "";
                const origin = String(loc.origin || "").replace(/\/$/, "");
                const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
                const isPrivateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
                if (port === "5173" && (isLocalHost || isPrivateLan)) return origin;
                if (loc.protocol === "https:") return origin;
            }
        } catch (e) { /* */ }
        if (global.__DF_AUTH_RENDER__) {
            return String(global.__DF_AUTH_RENDER__).replace(/\/$/, "");
        }
        if (global.__DF_DEFAULT_SERVER__) {
            return String(global.__DF_DEFAULT_SERVER__).replace(/\/$/, "");
        }
        return "http://127.0.0.1:8787";
    }

    function playerSyncFingerprint(p) {
        if (!p) return "";
        let decksFp = "";
        try {
            if (Array.isArray(p.customDecks)) {
                decksFp = p.customDecks.map((d) => {
                    const cards = Array.isArray(d?.cards) ? d.cards : [];
                    return `${d?.name || ""}|${cards.filter(Boolean).join(",")}`;
                }).join(";;");
            }
        } catch (e) { /* */ }
        return [
            p.id || "",
            p.hubBackgroundId || "",
            p.avatarHeroId || "",
            p.displayName || "",
            p.displayNameLocked ? "1" : "0",
            String(p.level || ""),
            String(p.totalXp || ""),
            String(p.profileRevision ?? ""),
            decksFp,
        ].join("|");
    }

    function getToken() {
        try { return global.localStorage?.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }

    function setToken(tok) {
        try {
            if (tok) global.localStorage?.setItem(TOKEN_KEY, tok);
            else global.localStorage?.removeItem(TOKEN_KEY);
        } catch (e) { /* */ }
    }

    function readOutbox() {
        try {
            const raw = global.localStorage?.getItem(OUTBOX_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function writeOutbox(patch) {
        try {
            if (!patch || !Object.keys(patch).length) {
                global.localStorage?.removeItem(OUTBOX_KEY);
                return;
            }
            global.localStorage?.setItem(OUTBOX_KEY, JSON.stringify(patch));
        } catch (e) { /* */ }
    }

    function hasOutboxPending() {
        const ob = readOutbox();
        return !!(ob && Object.keys(ob).length);
    }

    let lastLocalProfilePushFp = "";
    let lastLocalProfilePushAt = 0;

    function markLocalProfilePush(player) {
        if (!player) return;
        lastLocalProfilePushFp = playerSyncFingerprint(player);
        lastLocalProfilePushAt = Date.now();
    }

    function patchCachedPlayerFields(fields) {
        const c = getCachedPlayer();
        if (!c || !fields) return null;
        const next = { ...c, ...fields };
        try {
            global.localStorage?.setItem(PLAYER_KEY, JSON.stringify(next));
        } catch (e) { /* */ }
        return next;
    }

    let loginInProgress = false;

    function notifyRemoteProfileApplied(p, prevSnap, opts = {}) {
        if (!p) return;
        // Nunca dar reload completo — PC e mobile devem refletir hub/avatar/baralhos ao vivo.
        syncUiFromPlayer(p);
        if (opts.deferUiReload || loginInProgress) return;

        const prev = prevSnap || {};
        const hubChanged = (p.hubBackgroundId || "") !== (prev.hubBackgroundId || "");
        const decksChanged = decksFingerprint(p.customDecks) !== decksFingerprint(prev.customDecks);
        const avatarChanged = (p.avatarHeroId || "") !== (prev.avatarHeroId || "");
        const fp = playerSyncFingerprint(p);
        if (Date.now() - lastLocalProfilePushAt < 5000 && fp === lastLocalProfilePushFp) {
            return;
        }

        try {
            if (global.document?.getElementById("game")?.classList?.contains("active")) return;

            if (hubChanged) {
                global.dfSyncMobileBackdrop?.();
                global.dfPlayHubVideo?.();
            }
            if (decksChanged) {
                global.DfArsenal?.onProfileDecksSync?.(p);
            }
            if (avatarChanged || hubChanged || decksChanged) {
                global.DfAuthUi?.syncHubProfile?.();
                const profileOpen = global.document?.documentElement?.classList?.contains("df-profile-open");
                if (profileOpen) {
                    global.DfAuthUi?.refreshProfileMainUI?.(p);
                }
            }
            if (global.document?.body?.classList?.contains("df-arsenal-open")) {
                void global.DfArsenal?.syncDecksFromCloud?.();
            }
        } catch (e) { /* */ }
    }

    function buildAccountPushFromLocal(serverPlayerHint) {
        const cached = getCachedPlayer();
        const serverRef = serverPlayerHint || lastServerSnapshot || cached;
        const patch = {};
        const hubId = global.DfHubSplash?.readLocalId?.()
            || cached?.hubBackgroundId
            || serverRef?.hubBackgroundId;
        if (hubId && global.DfHubSplash?.isValidId?.(hubId)) {
            patch.hubBackgroundId = hubId;
        }
        if (cached?.avatarHeroId) patch.avatarHeroId = cached.avatarHeroId;
        const decks = readLocalDecksRaw() || cached?.customDecks;
        patch.customDecks = normalizeDecksForServer(decks);
        const localXp = Math.max(0, Number(cached?.totalXp) | 0);
        const serverXp = Math.max(0, Number(serverRef?.totalXp) | 0);
        // Só envia XP se for maior que o da nuvem (não comparar consigo mesmo).
        if (serverRef && serverRef !== cached && localXp > serverXp) {
            patch.xpTotal = localXp;
        } else if (serverPlayerHint && localXp > Math.max(0, Number(serverPlayerHint.totalXp) | 0)) {
            patch.xpTotal = localXp;
        }
        return patch;
    }

    async function refreshServerRevision() {
        if (!getToken()) return null;
        const data = await api("/auth/me");
        if (data?.player) rememberServerSnapshot(data.player);
        return data?.player || null;
    }

    function profileConflictPlayer(err) {
        return err?.player || err?.data?.player || null;
    }

    async function saveHubToServer(hubBackgroundId) {
        if (!getToken() || !hubBackgroundId) return null;
        const serverRef = lastServerSnapshot || getCachedPlayer();
        const body = {
            hubBackgroundId,
            profileRevision: serverRef?.profileRevision,
        };
        const player = await updateProfile(body, { force: true, serverPlayer: serverRef });
        markLocalProfilePush(player);
        const hubOut = player?.hubBackgroundId || hubBackgroundId;
        patchCachedPlayerFields({ hubBackgroundId: hubOut });
        global.DfHubSplash?.storeHubBackgroundId?.(hubOut);
        if (player) rememberServerSnapshot(player);
        // UI ao vivo — sem liveSync agressivo (evita corrida / reload).
        syncUiFromPlayer(getCachedPlayer() || player);
        return player || patchCachedPlayerFields({ hubBackgroundId: hubOut });
    }

    async function saveDecksToServer(rawDecks) {
        if (!getToken()) return null;
        const normalized = normalizeDecksForServer(rawDecks);
        const serverRef = lastServerSnapshot || getCachedPlayer();
        const body = {
            customDecks: normalized,
            profileRevision: serverRef?.profileRevision,
        };
        const player = await updateProfile(body, { force: true, serverPlayer: serverRef });
        markLocalProfilePush(player);
        const decksOut = Array.isArray(player?.customDecks) ? player.customDecks : normalized;
        patchCachedPlayerFields({ customDecks: decksOut });
        try {
            global.localStorage?.setItem("df_custom_decks_v1", JSON.stringify(normalizeDecksForServer(decksOut)));
        } catch (err) { /* */ }
        if (player) rememberServerSnapshot(player);
        global.DfArsenal?.onProfileDecksSync?.({ ...(player || {}), customDecks: decksOut });
        return player || patchCachedPlayerFields({ customDecks: decksOut });
    }

    async function saveAvatarToServer(avatarHeroId) {
        if (!getToken() || !avatarHeroId) return null;
        const serverRef = lastServerSnapshot || getCachedPlayer();
        const body = {
            avatarHeroId,
            profileRevision: serverRef?.profileRevision,
        };
        const player = await updateProfile(body, { force: true, serverPlayer: serverRef });
        markLocalProfilePush(player);
        patchCachedPlayerFields({ avatarHeroId: player?.avatarHeroId || avatarHeroId });
        if (player) rememberServerSnapshot(player);
        syncUiFromPlayer(getCachedPlayer() || player);
        return player;
    }

    async function pushAccountToServer(opts = {}) {
        if (!getToken()) return null;
        const serverRef = opts.serverPlayer || lastServerSnapshot || getCachedPlayer();
        const patch = buildAccountPushFromLocal(opts.serverPlayer || lastServerSnapshot);
        if (!Object.keys(patch).length) return getCachedPlayer();
        if (serverRef?.profileRevision != null && patch.profileRevision == null) {
            patch.profileRevision = serverRef.profileRevision;
        }
        return updateProfile(patch, { force: true, serverPlayer: serverRef, ...opts }).then((p) => {
            markLocalProfilePush(p);
            return p;
        });
    }

    function mergeServerPlayerForPull(serverPlayer, cached) {
        if (!serverPlayer) return null;
        // Conta diferente no cache = resposta stale de sessão anterior — NÃO sobrescrever.
        if (cached && (cached.id || cached.email) && !sameAccount(cached, serverPlayer)) {
            return { ...cached };
        }
        if (!cached) return { ...serverPlayer };
        const serverRev = Number(serverPlayer.profileRevision ?? 0);
        const cachedRev = Number(cached.profileRevision ?? 0);
        // Servidor mais novo: sempre vence (PC e mobile iguais).
        if (serverRev > cachedRev) return { ...serverPlayer };
        // Cache “à frente” sem dirty: ainda assim o servidor é a verdade no pull;
        // o push (outbox / migrate) sobe o local se for realmente mais rico.
        if (serverRev < cachedRev && isLocalProfileDirty()) {
            return {
                ...serverPlayer,
                ...cached,
                profileRevision: cachedRev,
                level: cached.level ?? serverPlayer.level,
                totalXp: cached.totalXp ?? serverPlayer.totalXp,
            };
        }
        const merged = { ...serverPlayer, profileRevision: serverRev };
        // Só preenche buracos vazios do servidor — nunca substitui baralho/fundo
        // já salvos na nuvem por um localStorage antigo do outro aparelho.
        // hub null na mesma revisão: mantém o cache (liveSync stale não apaga save recente).
        if (!merged.hubBackgroundId && cached.hubBackgroundId
            && global.DfHubSplash?.isValidId?.(cached.hubBackgroundId)
            && (isLocalProfileDirty() || hasOutboxPending() || serverRev <= cachedRev)) {
            merged.hubBackgroundId = cached.hubBackgroundId;
        }
        const serverDecksFilled = deckFilledCount(serverPlayer.customDecks);
        const localDecks = readBestLocalDecks(cached);
        const localDecksFilled = deckFilledCount(localDecks);
        if (localDecksFilled > 0 && serverDecksFilled === 0
            && (isLocalProfileDirty() || hasOutboxPending() || arsenalSessionDirty)) {
            merged.customDecks = localDecks;
        } else if (serverDecksFilled === 0) {
            merged.customDecks = Array.isArray(serverPlayer.customDecks)
                ? serverPlayer.customDecks
                : normalizeDecksForServer(null);
        }
        const serverXp = Math.max(0, Number(serverPlayer.totalXp) | 0);
        const cachedXp = Math.max(0, Number(cached.totalXp) | 0);
        if (serverXp >= cachedXp) {
            merged.totalXp = serverXp;
            if (serverPlayer.level != null) merged.level = serverPlayer.level;
            if (serverPlayer.xpInLevel != null) merged.xpInLevel = serverPlayer.xpInLevel;
            if (serverPlayer.xpToNext != null) merged.xpToNext = serverPlayer.xpToNext;
        } else if (isLocalProfileDirty()) {
            merged.totalXp = cachedXp;
            merged.level = cached.level ?? merged.level;
        }
        return merged;
    }

    async function applyAuthoritativeServerState(serverPlayer, prevSnap) {
        return ingestServerPlayer(serverPlayer, prevSnap);
    }

    /**
     * Após /auth/me: sobe perfil local rico, senão aplica a nuvem por completo.
     */
    async function ingestServerPlayer(serverPlayer, prevSnap) {
        if (!serverPlayer) {
            applyServerPlayer(null);
            return null;
        }
        const epochAtStart = currentAccountEpoch();
        const cachedNow = getCachedPlayer();
        // Resposta de /auth/me da conta anterior (race pós-login/registro).
        if (cachedNow && (cachedNow.id || cachedNow.email) && !sameAccount(cachedNow, serverPlayer)) {
            return cachedNow;
        }
        const snapBefore = prevSnap ? { ...prevSnap } : (lastServerSnapshot ? { ...lastServerSnapshot } : null);
        const arsenalOpen = global.document?.body?.classList?.contains("df-arsenal-open");
        const editingDecks = arsenalOpen && arsenalSessionDirty;

        if (editingDecks) {
            rememberServerSnapshot(serverPlayer);
            mergeRemoteProfileFields(serverPlayer, { skipDecks: true });
            return getCachedPlayer() || serverPlayer;
        }

        if (hasOutboxPending()) {
            const flushed = await flushOutbox();
            if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
            if (flushed && !localAuthorityBeatsServer(flushed)) {
                return flushed;
            }
        }

        // Só sobe a conta inteira quando ESTE aparelho é claramente mais avançado.
        // Dirty sozinho NÃO pode mandar LEGAL/nível 2 por cima de Manowar/nível 5.
        if (localAuthorityBeatsServer(serverPlayer)) {
            if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
            rememberServerSnapshot(serverPlayer);
            try {
                const pushed = await pushAccountToServer({ serverPlayer, force: true });
                if (pushed) {
                    clearLocalProfileDirty();
                    clearArsenalSessionDirty();
                    persistLocalFromPlayer(pushed);
                    notifyRemoteProfileApplied(pushed, snapBefore);
                    syncUiFromPlayer(pushed);
                    return pushed;
                }
            } catch (e) {
                console.warn("[DfAuthClient] push perfil rico falhou:", e?.code || e?.message || e);
            }
            // Mantém o local rico visível; não aplica o snapshot pobre da nuvem.
            const cached = getCachedPlayer();
            const localPatch = buildLocalProfilePatch(cached, serverPlayer);
            const kept = mergeLocalRicher(serverPlayer, localPatch, cached) || cached || serverPlayer;
            applyServerPlayer(kept, { pullOnly: true, fromLocalMerge: true });
            try {
                const localDecks = readBestLocalDecks(kept);
                if (deckFilledCount(localDecks) > 0) {
                    global.localStorage?.setItem("df_custom_decks_v1", JSON.stringify(localDecks));
                    kept.customDecks = localDecks;
                    global.localStorage?.setItem(PLAYER_KEY, JSON.stringify(kept));
                }
                const hub = global.DfHubSplash?.readLocalId?.() || kept.hubBackgroundId;
                if (hub && global.DfHubSplash?.isValidId?.(hub)) {
                    global.DfHubSplash.storeHubBackgroundId(hub);
                    kept.hubBackgroundId = hub;
                }
            } catch (err) { /* */ }
            syncUiFromPlayer(kept);
            return kept;
        }

        if (isLocalProfileDirty()) {
            const pushedDiff = await pushLocalProfileDiff(serverPlayer);
            if (pushedDiff && localAuthorityBeatsServer(serverPlayer) === false) {
                // Diff aplicado ou servidor já rico — segue para pull limpo abaixo
            }
        }

        rememberServerSnapshot(serverPlayer);
        if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
        const merged = mergeServerPlayerForPull(serverPlayer, getCachedPlayer());
        applyServerPlayer(merged, { pullOnly: true });
        persistLocalFromPlayer(merged);
        clearLocalProfileDirty();
        clearArsenalSessionDirty();
        const applied = getCachedPlayer() || merged;
        const hubChanged = (applied?.hubBackgroundId || "") !== (snapBefore?.hubBackgroundId || "");
        const decksChanged = decksFingerprint(applied?.customDecks)
            !== decksFingerprint(snapBefore?.customDecks);
        const revChanged = Number(serverPlayer.profileRevision ?? 0) !== Number(snapBefore?.profileRevision ?? 0);
        if (hubChanged || decksChanged || revChanged) {
            notifyRemoteProfileApplied(applied, snapBefore);
        }
        return applied || serverPlayer;
    }

    function persistLocalFromPlayer(p) {
        if (!p) return;
        try {
            if (p.hubBackgroundId && global.DfHubSplash?.isValidId?.(p.hubBackgroundId)) {
                global.DfHubSplash.storeHubBackgroundId(p.hubBackgroundId);
            } else if (!p.hubBackgroundId) {
                try { global.localStorage?.removeItem("dragonfall:hubBgId"); } catch (e2) { /* */ }
            }
            const decksNorm = Array.isArray(p.customDecks)
                ? normalizeDecksForServer(p.customDecks)
                : normalizeDecksForServer(null);
            global.localStorage?.setItem("df_custom_decks_v1", JSON.stringify(decksNorm));
            global.DfArsenal?.onProfileDecksSync?.({ ...p, customDecks: decksNorm });
        } catch (e) { /* */ }
    }

    function serverProfileIsSparse(p) {
        if (!p) return true;
        return deckFilledCount(p.customDecks) === 0
            && !p.hubBackgroundId
            && !p.avatarHeroId;
    }

    /** Pontuação de autoridade: nível/XP + baralhos nomeados + fundo ≠ padrão. */
    function profileAuthorityScore(player, decksOverride) {
        if (!player && !decksOverride) return 0;
        const decks = decksOverride != null ? decksOverride : player?.customDecks;
        const level = Math.max(1, Number(player?.level) | 0);
        const totalXp = Math.max(0, Number(player?.totalXp) | 0);
        let score = level * 80;
        score += totalXp * 3;
        score += deckFilledCount(decks) * 2;
        if (Array.isArray(decks)) {
            for (const d of decks) {
                const n = String(d?.name || "").trim();
                if (n && !/^Baralho\s*\d+$/i.test(n)) score += 25;
            }
        }
        const bg = player?.hubBackgroundId;
        if (bg && bg !== "vila-dos-cristais" && global.DfHubSplash?.isValidId?.(bg)) {
            score += 20;
        }
        if (player?.avatarHeroId) score += 4;
        if (player?.displayName) score += 4;
        return score;
    }

    function localAuthorityBeatsServer(serverPlayer) {
        if (!serverPlayer) return localDecksHaveData() || !!global.DfHubSplash?.readLocalId?.();
        const cached = getCachedPlayer();
        // Conta diferente no cache (ex.: cadastro novo com Betorich ainda no aparelho).
        if (cached && (cached.id || cached.email) && !sameAccount(cached, serverPlayer)) {
            return false;
        }
        // Outro aparelho avançou a revision na nuvem: pull, salvo edição pendente neste aparelho.
        {
            const serverRev = Number(serverPlayer.profileRevision ?? 0);
            const cachedRev = Number(cached?.profileRevision ?? 0);
            if (serverRev > cachedRev
                && !isLocalProfileDirty()
                && !hasOutboxPending()
                && !arsenalSessionDirty) {
                return false;
            }
        }
        const localDecks = readBestLocalDecks(cached);
        const localHub = global.DfHubSplash?.readLocalId?.() || cached?.hubBackgroundId;
        const localLevel = Math.max(
            Math.max(1, Number(cached?.level) | 0),
            Math.max(1, Number(global.DfProfileXp?.statsFromTotalXp?.(cached?.totalXp || 0)?.level) | 0),
        );
        const localView = {
            ...(cached || {}),
            hubBackgroundId: localHub || cached?.hubBackgroundId,
            customDecks: localDecks,
            totalXp: Math.max(0, Number(cached?.totalXp) | 0),
            level: localLevel,
        };
        const localScore = profileAuthorityScore(localView, localDecks);
        const serverScore = profileAuthorityScore(serverPlayer);
        const localXp = Math.max(0, Number(cached?.totalXp) | 0);
        const serverXp = Math.max(0, Number(serverPlayer.totalXp) | 0);
        const serverLevel = Math.max(1, Number(serverPlayer.level) | 0);
        const localFilled = deckFilledCount(localDecks);
        const serverFilled = deckFilledCount(serverPlayer.customDecks);
        const localFp = decksFingerprint(localDecks);
        const serverFp = decksFingerprint(serverPlayer.customDecks);

        if (localLevel > serverLevel) return true;
        if (localXp > serverXp) return true;
        // Nuvem vazia: só sobe residual se houver edição pendente nestes aparelho.
        // Sem dirty/outbox → conta nova / pull limpo (nunca herdar outra conta).
        if (serverProfileIsSparse(serverPlayer) && (localFilled > 0 || !!localHub)) {
            if (cached && (cached.id || cached.email) && !sameAccount(cached, serverPlayer)) {
                return false;
            }
            return !!(isLocalProfileDirty() || hasOutboxPending() || arsenalSessionDirty);
        }
        // Mais cartas no local só vencem com edição pendente (senão é residual).
        if (localFilled > serverFilled
            && (isLocalProfileDirty() || hasOutboxPending() || arsenalSessionDirty)) {
            return true;
        }
        if (localFilled > serverFilled) return false;
        if (localFp && serverFp && localFp !== serverFp && localFilled > 0) {
            if (localFilled < serverFilled) return false;
            const serverRev = Number(serverPlayer.profileRevision ?? 0);
            const cachedRev = Number(cached?.profileRevision ?? 0);
            // Outro aparelho salvou na nuvem depois → pull.
            if (serverRev > cachedRev) return false;
            // Edição local pendente (Arsenal/renomear) com mesmo nº de cartas.
            if (isLocalProfileDirty() || hasOutboxPending() || arsenalSessionDirty) return true;
            return false;
        }
        if (localScore >= serverScore + 40) return true;
        return false;
    }

    function localIsRicherThanServer(serverPlayer) {
        return localAuthorityBeatsServer(serverPlayer);
    }

    function shouldMigrateLocalToServer(serverPlayer) {
        if (!serverPlayer) return hasOutboxPending();
        if (hasOutboxPending()) return true;
        if (isLocalProfileDirty() || arsenalSessionDirty) {
            return localAuthorityBeatsServer(serverPlayer);
        }
        // Sem edição pendente: NÃO migrar residual de outra conta / localStorage antigo
        // para conta nova (nuvem vazia). Só sobe se a autoridade local for clara.
        if (localAuthorityBeatsServer(serverPlayer)) return true;
        return false;
    }

    function shouldPushToServer(serverPlayer) {
        return shouldMigrateLocalToServer(serverPlayer);
    }

    function syncUiFromPlayer(p) {
        global.DfHubSplash?.syncFromPlayer?.(p);
        global.DfAuthUi?.syncHubProfile?.();
        const profileOpen = global.document?.documentElement?.classList?.contains("df-profile-open");
        if (profileOpen) {
            global.DfAuthUi?.refreshProfileMainUI?.(p);
        }
    }

    function applyServerPlayer(p, opts = {}) {
        if (!p) {
            lastServerSnapshot = null;
            clearLocalProfileDirty();
            try { global.localStorage?.removeItem(PLAYER_KEY); } catch (e) { /* */ }
            return;
        }
        if (!opts.fromLocalMerge && !opts.pullOnly) rememberServerSnapshot(p);
        const merged = p;
        try {
            const prevRaw = global.localStorage?.getItem(PLAYER_KEY);
            let prevFp = "";
            try {
                prevFp = playerSyncFingerprint(prevRaw ? JSON.parse(prevRaw) : null);
            } catch (e) { /* */ }
            const nextFp = playerSyncFingerprint(merged);
            global.localStorage?.setItem(PLAYER_KEY, JSON.stringify(merged));
            if (Array.isArray(merged.customDecks)) {
                global.DfArsenal?.onProfileDecksSync?.(merged);
            }
            if (nextFp !== prevFp) syncUiFromPlayer(merged);
            else {
                global.DfAuthUi?.syncHubProfile?.();
            }
        } catch (e) { /* */ }
        return merged;
    }

    function mergePlayerWithLocalDeviceState(serverPlayer) {
        if (!serverPlayer) return null;
        const cached = getCachedPlayer();
        const localPatch = buildLocalProfilePatch(cached, serverPlayer);
        return mergeLocalRicher(serverPlayer, localPatch, cached) || serverPlayer;
    }

    function getCachedPlayer() {
        try {
            const raw = global.localStorage?.getItem(PLAYER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    async function api(path, opts = {}) {
        const primary = resolveApiBase();
        const renderBase = String(global.__DF_AUTH_RENDER__ || global.__DF_DEFAULT_SERVER__ || "")
            .replace(/\/$/, "");
        const bases = [primary];
        if (renderBase && renderBase !== primary) bases.push(renderBase);
        const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
        const tok = getToken();
        if (tok) headers.Authorization = "Bearer " + tok;
        const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 12000;
        const maxAttempts = opts.maxAttempts != null ? Math.max(1, opts.maxAttempts | 0) : 2;
        let lastErr = null;

        for (let bi = 0; bi < bases.length; bi++) {
            const base = bases[bi];
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
                let timer = 0;
                if (ctrl && timeoutMs > 0) {
                    timer = global.setTimeout(() => {
                        try { ctrl.abort(); } catch (e) { /* */ }
                    }, timeoutMs);
                }
                try {
                    const r = await fetch(base + path, {
                        method: opts.method || "GET",
                        headers,
                        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
                        cache: "no-store",
                        signal: ctrl?.signal,
                    });
                    if (timer) global.clearTimeout(timer);
                    let data = null;
                    try { data = await r.json(); } catch (e) { data = null; }
                    if (!r.ok) {
                        const code = data?.error
                            || (r.status === 401 && String(path).includes("/login") ? "INVALID_CREDENTIALS" : null)
                            || (r.status === 401 ? "UNAUTHORIZED" : null)
                            || (r.status === 502 ? "AUTH_PROXY_FAILED" : null)
                            || (r.status === 429 ? "FORGOT_COOLDOWN" : null)
                            || (r.status === 503 ? "SERVER_UNAVAILABLE" : null)
                            || "REQUEST_FAILED";
                        const err = new Error(code);
                        err.code = code;
                        err.status = r.status;
                        err.data = data;
                        // Proxy Netlify morto → tenta Render direto.
                        if ((r.status === 502 || r.status === 503 || r.status === 504)
                            && bi < bases.length - 1) {
                            lastErr = err;
                            break;
                        }
                        throw err;
                    }
                    if (data == null) {
                        const err = new Error("BAD_RESPONSE");
                        err.code = "BAD_RESPONSE";
                        err.status = r.status;
                        throw err;
                    }
                    return data;
                } catch (e) {
                    if (timer) global.clearTimeout(timer);
                    lastErr = e;
                    if (e?.status && e.status !== 502 && e.status !== 503 && e.status !== 504
                        && e.code !== "NETWORK_ERROR") {
                        throw e;
                    }
                    if (!e?.status && e?.code !== "NETWORK_ERROR" && e?.name !== "AbortError") {
                        const err = new Error("NETWORK_ERROR");
                        err.code = "NETWORK_ERROR";
                        lastErr = err;
                    } else if (e?.name === "AbortError") {
                        const err = new Error("NETWORK_ERROR");
                        err.code = "NETWORK_ERROR";
                        lastErr = err;
                    }
                    if (attempt + 1 < maxAttempts) {
                        await new Promise((res) => global.setTimeout(res, 280));
                        continue;
                    }
                }
            }
        }
        if (lastErr) throw lastErr;
        const err = new Error("NETWORK_ERROR");
        err.code = "NETWORK_ERROR";
        throw err;
    }

    function deckFilledCount(decks) {
        if (!Array.isArray(decks)) return 0;
        return decks.reduce((n, d) => {
            const cards = Array.isArray(d?.cards) ? d.cards : [];
            return n + cards.filter(Boolean).length;
        }, 0);
    }

    function readLocalDecksRaw() {
        try {
            const raw = global.localStorage?.getItem("df_custom_decks_v1");
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function readBestLocalDecks(cachedPlayer) {
        const storage = readLocalDecksRaw();
        const storageNorm = normalizeDecksForServer(storage);
        const cachedNorm = normalizeDecksForServer(cachedPlayer?.customDecks);
        const storageFilled = deckFilledCount(storageNorm);
        const cachedFilled = deckFilledCount(cachedNorm);
        if (storageFilled >= cachedFilled && storageFilled > 0) return storageNorm;
        if (cachedFilled > 0) return cachedNorm;
        return storageNorm;
    }

    function localDecksHaveData() {
        return deckFilledCount(readLocalDecksRaw()) > 0;
    }

    function normalizeDecksForServer(raw) {
        const DECK_COUNT = 5;
        const DECK_SIZE = 24;
        const base = Array.from({ length: DECK_COUNT }, (_, i) => ({
            name: `Baralho ${i + 1}`,
            cards: Array(DECK_SIZE).fill(null),
        }));
        if (!Array.isArray(raw)) return base;
        return base.map((d, i) => {
            const entry = raw[i] || d;
            let name = String(entry?.name || "").trim() || `Baralho ${i + 1}`;
            if (name.length > 32) name = name.slice(0, 32);
            const cardsIn = Array.isArray(entry?.cards) ? entry.cards.slice(0, DECK_SIZE) : [];
            const cards = Array.from({ length: DECK_SIZE }, (_, s) => {
                const c = cardsIn[s];
                if (c == null || c === "") return null;
                let name = String(c).trim().slice(0, 80);
                if (typeof DfData !== "undefined" && DfData && typeof DfData.resolveCardName === "function") {
                    name = DfData.resolveCardName(name);
                } else if (typeof globalThis !== "undefined" && globalThis.DfData?.resolveCardName) {
                    name = globalThis.DfData.resolveCardName(name);
                }
                return name || null;
            });
            return { name, cards };
        });
    }

    /** Quanto o perfil está “preenchido” — usado para decidir se local ou servidor vence. */
    function profileCompleteness(player) {
        return profileAuthorityScore(player);
    }

    function buildLocalProfilePatch(cachedPlayer, serverPlayer) {
        const cached = cachedPlayer || getCachedPlayer();
        const patch = {};

        const localBg = global.DfHubSplash?.readLocalId?.();
        const bgCandidate = localBg && global.DfHubSplash?.isValidId?.(localBg)
            ? localBg
            : (cached?.hubBackgroundId && global.DfHubSplash?.isValidId?.(cached.hubBackgroundId)
                ? cached.hubBackgroundId
                : null);
        if (bgCandidate && global.DfHubSplash?.isValidId?.(bgCandidate)) {
            patch.hubBackgroundId = bgCandidate;
        }

        if (cached?.avatarHeroId) {
            patch.avatarHeroId = cached.avatarHeroId;
        }
        if (cached?.displayName && String(cached.displayName).trim()) {
            patch.displayName = String(cached.displayName).trim();
        }

        const storageDecks = readLocalDecksRaw();
        const cachedDecks = cached?.customDecks;
        const storageCount = deckFilledCount(storageDecks);
        const cachedCount = deckFilledCount(cachedDecks);
        const decks = storageCount >= cachedCount ? storageDecks : cachedDecks;
        const normalizedLocal = normalizeDecksForServer(decks);
        const normalizedServer = normalizeDecksForServer(serverPlayer?.customDecks);
        if (decksFingerprint(normalizedLocal) !== decksFingerprint(normalizedServer)) {
            patch.customDecks = normalizedLocal;
        }

        const localXp = Math.max(0, Number(cached?.totalXp) | 0);
        const serverXp = Math.max(0, Number(serverPlayer?.totalXp) | 0);
        if (localXp > serverXp) {
            patch.xpTotal = localXp;
        }
        return patch;
    }

    function decksFingerprint(decks) {
        if (!Array.isArray(decks)) return "";
        return decks.map((d) => {
            const cards = Array.isArray(d?.cards) ? d.cards : [];
            return `${String(d?.name || "").trim()}|${cards.filter(Boolean).join(",")}`;
        }).join(";;");
    }

    function sanitizeProfilePatch(serverPlayer, patch) {
        if (!patch) return {};
        const baseline = serverPlayer || lastServerSnapshot;
        if (!baseline) return { ...patch };
        const body = { ...patch };
        if (baseline.displayNameLocked) {
            delete body.displayName;
        } else if (body.displayName && body.displayName === baseline.displayName) {
            delete body.displayName;
        }
        if (body.avatarHeroId && body.avatarHeroId === baseline.avatarHeroId) {
            delete body.avatarHeroId;
        }
        if (body.hubBackgroundId && body.hubBackgroundId === baseline.hubBackgroundId) {
            delete body.hubBackgroundId;
        }
        if (body.customDecks) {
            const patchFp = decksFingerprint(body.customDecks);
            const baseFp = decksFingerprint(baseline.customDecks);
            if (!patchFp || patchFp === baseFp) {
                delete body.customDecks;
            }
        }
        const serverXp = Math.max(0, Number(baseline.totalXp) | 0);
        const patchXp = Math.max(0, Number(body.xpTotal) | 0);
        if (!patchXp || patchXp <= serverXp) {
            delete body.xpTotal;
        }
        return body;
    }

    function profileNeedsPush(serverPlayer, localPatch) {
        const baseline = serverPlayer || lastServerSnapshot;
        if (!baseline || !localPatch || !Object.keys(localPatch).length) return false;
        if (localPatch.hubBackgroundId && localPatch.hubBackgroundId !== baseline.hubBackgroundId) return true;
        if (localPatch.avatarHeroId && localPatch.avatarHeroId !== baseline.avatarHeroId) return true;
        if (localPatch.displayName && localPatch.displayName !== baseline.displayName
            && !baseline.displayNameLocked) return true;
        if (localPatch.customDecks) {
            const patchFp = decksFingerprint(localPatch.customDecks);
            const baseFp = decksFingerprint(baseline.customDecks);
            if (patchFp && patchFp !== baseFp) return true;
            if (deckFilledCount(localPatch.customDecks) > deckFilledCount(baseline.customDecks)) return true;
        }
        const localXp = Math.max(0, Number(localPatch.xpTotal) | 0);
        const serverXp = Math.max(0, Number(baseline.totalXp) | 0);
        if (localXp > serverXp) return true;
        const merged = { ...baseline, ...localPatch };
        return profileCompleteness(merged) > profileCompleteness(baseline);
    }

    function mergeLocalRicher(serverPlayer, localPatch, cachedBefore) {
        if (!serverPlayer) return null;
        // Se a nuvem já é a autoridade, não mascarar com localStorage velho.
        if (!localAuthorityBeatsServer(serverPlayer) && !isLocalProfileDirty()) {
            return { ...serverPlayer };
        }
        const merged = { ...serverPlayer };
        if (localPatch.hubBackgroundId) merged.hubBackgroundId = localPatch.hubBackgroundId;
        if (localPatch.avatarHeroId) merged.avatarHeroId = localPatch.avatarHeroId;
        if (localPatch.displayName) merged.displayName = localPatch.displayName;
        if (localPatch.customDecks) {
            const patchFp = decksFingerprint(localPatch.customDecks);
            const baseFp = decksFingerprint(serverPlayer.customDecks);
            if (patchFp && patchFp !== baseFp) {
                merged.customDecks = localPatch.customDecks;
            }
        }
        const localXp = Math.max(
            Math.max(0, Number(localPatch.xpTotal) | 0),
            Math.max(0, Number(cachedBefore?.totalXp) | 0),
        );
        const serverXp = Math.max(0, Number(serverPlayer.totalXp) | 0);
        if (localXp > serverXp) {
            merged.totalXp = localXp;
            const stats = global.DfProfileXp?.statsFromTotalXp?.(localXp);
            if (stats) {
                merged.level = stats.level;
                merged.xpInLevel = stats.xpInLevel;
                merged.xpToNext = stats.xpToNext;
            }
        }
        return merged;
    }

    async function pushLocalProfileDiff(serverPlayer) {
        if (!getToken() || !serverPlayer) return null;
        const cachedBefore = getCachedPlayer();
        const localPatch = buildLocalProfilePatch(cachedBefore, serverPlayer);
        if (!profileNeedsPush(serverPlayer, localPatch)) return getCachedPlayer();

        let body = localProfileDirty
            ? { ...localPatch }
            : sanitizeProfilePatch(serverPlayer, { ...localPatch });
        if (serverPlayer.profileRevision != null) {
            body.profileRevision = serverPlayer.profileRevision;
        }
        const onlyRev = Object.keys(body).length === 1 && body.profileRevision != null;
        if (!Object.keys(body).length || onlyRev) return getCachedPlayer();

        try {
            return await updateProfile(body, {
                fromReconcile: true,
                serverPlayer,
                force: !!localProfileDirty,
            });
        } catch (e) {
            if (e?.status === 403 && e?.code === "NAME_LOCKED" && body.displayName) {
                delete body.displayName;
                if (Object.keys(body).length > (body.profileRevision != null ? 1 : 0)) {
                    try {
                        return await updateProfile(body, { fromReconcile: true, serverPlayer });
                    } catch (e2) {
                        e = e2;
                    }
                }
            }
            if (e?.status === 409 && (e?.data?.player || e?.player)) {
                applyServerPlayer(e.data?.player || e.player);
                const conflictPlayer = e.data?.player || e.player;
                const retryBody = { ...body, profileRevision: conflictPlayer.profileRevision };
                try {
                    const player = await updateProfile(retryBody, {
                        fromReconcile: true,
                        serverPlayer: conflictPlayer,
                        force: true,
                        _retried409: true,
                    });
                    return player;
                } catch (e2) {
                    const ob = sanitizeProfilePatch(conflictPlayer, { ...(readOutbox() || {}), ...localPatch });
                    writeOutbox(ob);
                    return null;
                }
            }
            console.warn("[DfAuthClient] profile push failed:", e?.code || e?.message || e);
            const ob = sanitizeProfilePatch(serverPlayer, { ...(readOutbox() || {}), ...localPatch });
            writeOutbox(ob);
            return null;
        }
    }

    /**
     * Após login ou boot: mescla dados locais com servidor e envia diferenças à nuvem.
     */
    async function reconcileProfileWithServer(serverPlayer, opts = {}) {
        return ingestServerPlayer(serverPlayer, lastServerSnapshot ? { ...lastServerSnapshot } : null);
    }

    async function flushOutbox() {
        if (!getToken()) return null;
        const pending = readOutbox();
        if (!pending || !Object.keys(pending).length) return getCachedPlayer();
        const serverRef = lastServerSnapshot || getCachedPlayer();
        const body = sanitizeProfilePatch(serverRef, pending);
        if (!Object.keys(body).length) {
            writeOutbox(null);
            return getCachedPlayer();
        }
        try {
            const player = await updateProfile(body, {
                fromOutbox: true,
                serverPlayer: serverRef,
                force: true,
            });
            writeOutbox(null);
            return player;
        } catch (e) {
            if (e?.status === 403 && e?.code === "NAME_LOCKED" && body.displayName) {
                delete body.displayName;
                try {
                    const player = await updateProfile(body, { fromOutbox: true, serverPlayer: serverRef });
                    writeOutbox(null);
                    return player;
                } catch (e2) {
                    e = e2;
                }
            }
            if (e?.status === 409 && (e?.data?.player || e?.player)) {
                applyServerPlayer(e.data?.player || e.player);
                const conflictPlayer = e.data?.player || e.player;
                const retryBody = { ...body, profileRevision: conflictPlayer.profileRevision };
                try {
                    const player = await updateProfile(retryBody, {
                        fromOutbox: true,
                        serverPlayer: conflictPlayer,
                        force: true,
                        _retried409: true,
                    });
                    writeOutbox(null);
                    return player;
                } catch (e2) {
                    writeOutbox(body);
                    return conflictPlayer;
                }
            }
            return null;
        }
    }

    async function register(email, password) {
        const cleanEmail = String(email || "").trim();
        const cleanPassword = String(password || "");
        // Flush curto da conta anterior — não trava o botão por 30s.
        if (getToken() && hasOutboxPending()) {
            try {
                await Promise.race([
                    flushOutbox(),
                    new Promise((r) => global.setTimeout(r, 1200)),
                ]);
            } catch (e) { /* */ }
        }
        const data = await api("/auth/register", {
            method: "POST",
            body: { email: cleanEmail, password: cleanPassword },
            timeoutMs: 10000,
            maxAttempts: 1,
        });
        if (!data?.token) {
            const err = new Error("LOGIN_NO_TOKEN");
            err.code = "LOGIN_NO_TOKEN";
            throw err;
        }
        // Só limpa depois do sucesso — falha de rede não apaga a sessão atual.
        clearDeviceAccountLocalState();
        setToken(data.token);
        bootMigrationDone = true;
        return adoptServerAccount(data.player);
    }

    async function login(email, password) {
        const cleanEmail = String(email || "").trim();
        const cleanPassword = String(password || "");
        loginInProgress = true;
        try {
            if (getToken() && hasOutboxPending()) {
                try {
                    await Promise.race([
                        flushOutbox(),
                        new Promise((r) => global.setTimeout(r, 1200)),
                    ]);
                } catch (e) { /* */ }
            }
            const data = await api("/auth/login", {
                method: "POST",
                body: { email: cleanEmail, password: cleanPassword },
                timeoutMs: 10000,
                maxAttempts: 1,
            });
            if (!data?.token) {
                const err = new Error("LOGIN_NO_TOKEN");
                err.code = "LOGIN_NO_TOKEN";
                throw err;
            }
            // Limpa só após sucesso — evita freeze longo com sessão já apagada.
            clearDeviceAccountLocalState();
            setToken(data.token);
            bootMigrationDone = true;
            const player = adoptServerAccount(data.player);
            void (async () => {
                try {
                    await flushOutbox();
                    await liveSyncNow(true);
                } catch (e) {
                    console.warn("[DfAuthClient] post-login sync:", e?.code || e?.message || e);
                }
            })();
            return player;
        } finally {
            loginInProgress = false;
        }
    }

    async function forgotPassword(email) {
        const data = await api("/auth/forgot-password", {
            method: "POST",
            body: { email },
        });
        return { sent: !!data?.sent };
    }

    async function fetchMe(opts = {}) {
        const prevSnap = lastServerSnapshot ? { ...lastServerSnapshot } : null;
        const data = await api("/auth/me");
        if (opts.reconcile) {
            return reconcileProfileWithServer(data.player);
        }
        return applyAuthoritativeServerState(data.player, prevSnap);
    }

    let bootMigrationDone = false;

    async function ensureSession(opts = {}) {
        const tok = getToken();
        if (!tok) return null;
        const cached = getCachedPlayer();
        // JOGAR em internet lenta: abre com cache e sincroniza em 2º plano.
        if (opts.preferCache && cached?.id) {
            void (async () => {
                try {
                    const prevSnap = lastServerSnapshot ? { ...lastServerSnapshot } : null;
                    const data = await api("/auth/me", { timeoutMs: 8000, maxAttempts: 1 });
                    bootMigrationDone = true;
                    await ingestServerPlayer(data.player, prevSnap);
                    await flushOutbox();
                } catch (e) { /* offline ok */ }
            })();
            return cached;
        }
        try {
            const prevSnap = lastServerSnapshot ? { ...lastServerSnapshot } : null;
            const data = await api("/auth/me", {
                timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 8000,
                maxAttempts: opts.maxAttempts != null ? opts.maxAttempts : 1,
            });
            bootMigrationDone = true;
            const player = await ingestServerPlayer(data.player, prevSnap);
            await flushOutbox();
            return player;
        } catch (e) {
            if (e?.status === 401 || e?.code === "INVALID_TOKEN" || e?.code === "UNAUTHORIZED") {
                setToken("");
                applyServerPlayer(null);
                return null;
            }
            // Rede lenta/offline: mantém sessão local se o token ainda existe.
            return cached;
        }
    }

    async function changePassword(currentPassword, newPassword) {
        await api("/auth/change-password", {
            method: "POST",
            body: { currentPassword, newPassword },
        });
    }

    async function awardMatchXp({ matchType, outcome, aiDifficulty }) {
        const body = { matchType, outcome, aiDifficulty };
        try {
            const data = await api("/auth/match-xp", {
                method: "POST",
                body,
            });
            applyServerPlayer(data.player);
            return data;
        } catch (e) {
            if (e?.status === 409 && e?.data?.player) {
                applyServerPlayer(e.data.player);
                const data = await api("/auth/match-xp", {
                    method: "POST",
                    body,
                });
                applyServerPlayer(data.player);
                return data;
            }
            throw e;
        }
    }

    let profilePushInFlight = 0;

    async function updateProfile(patch, opts = {}) {
        const cached = getCachedPlayer();
        const serverRef = opts.serverPlayer || lastServerSnapshot;
        let body = opts.force
            ? { ...patch }
            : sanitizeProfilePatch(serverRef, { ...patch });
        if (body.displayName && serverRef?.displayNameLocked) {
            delete body.displayName;
        }
        if (serverRef?.profileRevision != null && body.profileRevision == null) {
            body.profileRevision = serverRef.profileRevision;
        } else if (cached?.profileRevision != null && body.profileRevision == null) {
            body.profileRevision = cached.profileRevision;
        }
        const onlyRev = Object.keys(body).length === 1 && body.profileRevision != null;
        if (!Object.keys(body).length || onlyRev) {
            return cached;
        }
        profilePushInFlight++;
        try {
            const data = await api("/auth/profile", {
                method: "PATCH",
                body,
                timeoutMs: 8000,
                maxAttempts: 1,
            });
            clearLocalProfileDirty();
            applyServerPlayer(data.player);
            markLocalProfilePush(data.player);
            if (!opts.fromOutbox) writeOutbox(null);
            return data.player;
        } catch (e) {
            const conflictPlayer = profileConflictPlayer(e);
            if (e?.status === 409 && conflictPlayer) {
                applyServerPlayer(conflictPlayer);
                if (!opts.fromOutbox) writeOutbox(null);
                if (opts.force && !opts._retried409) {
                    const retryBody = { ...patch, profileRevision: conflictPlayer.profileRevision };
                    return updateProfile(retryBody, {
                        ...opts,
                        serverPlayer: conflictPlayer,
                        _retried409: true,
                    });
                }
                const err = new Error("PROFILE_CONFLICT");
                err.code = "PROFILE_CONFLICT";
                err.status = 409;
                err.player = conflictPlayer;
                throw err;
            }
            if (e?.code === "NETWORK_ERROR" && !opts.fromOutbox) {
                const mergedPatch = sanitizeProfilePatch(serverRef, { ...(readOutbox() || {}), ...patch });
                delete mergedPatch.profileRevision;
                writeOutbox(mergedPatch);
                // Optimistic: mantém nome/avatar/fundo/baralhos visíveis no aparelho.
                if (cached) {
                    const optimistic = {
                        ...cached,
                        ...mergedPatch,
                        customDecks: mergedPatch.customDecks != null
                            ? mergedPatch.customDecks
                            : cached.customDecks,
                    };
                    applyServerPlayer(optimistic, { pullOnly: true, fromLocalMerge: true });
                    persistLocalFromPlayer(optimistic);
                    markLocalProfileDirty();
                    return optimistic;
                }
            }
            throw e;
        } finally {
            profilePushInFlight = Math.max(0, profilePushInFlight - 1);
        }
    }

    async function logout() {
        const tok = getToken();
        // 1) Flush rápido enquanto o token ainda vale (UI já mostrou feedback).
        if (tok && hasOutboxPending()) {
            try {
                await Promise.race([
                    flushOutbox(),
                    new Promise((r) => global.setTimeout(r, 2500)),
                ]);
            } catch (e) { /* */ }
        }
        // 2) Limpa local na hora — UI não espera a rede.
        clearDeviceAccountLocalState();
        try { global.DfAuthUi?.syncHubProfile?.(); } catch (e) { /* */ }
        // 3) Avisa o servidor em background (timeout curto).
        if (tok) {
            void (async () => {
                try {
                    await api("/auth/logout", {
                        method: "POST",
                        timeoutMs: 4000,
                        maxAttempts: 1,
                        headers: { Authorization: "Bearer " + tok },
                    });
                } catch (e) { /* */ }
            })();
        }
    }

    let liveSyncTimer = null;
    let liveSyncInFlight = false;
    let liveSyncLastAt = 0;

    async function liveSyncNow(force) {
        if (!getToken()) return null;
        if (profilePushInFlight > 0) return getCachedPlayer();
        // Em partida local: não competir com CPU/rede/FPS.
        try {
            const game = global.document?.getElementById("game");
            if (game && game.classList.contains("active") && !force) return null;
        } catch (e) { /* */ }
        if (!force && global.navigator && global.navigator.onLine === false) return getCachedPlayer();
        const outboxPending = hasOutboxPending();
        if (!force && !outboxPending && global.document?.hidden) return null;
        const now = Date.now();
        if (!force && !outboxPending && (liveSyncInFlight || (now - liveSyncLastAt) < LIVE_SYNC_MIN_GAP_MS)) {
            return null;
        }
        liveSyncInFlight = true;
        liveSyncLastAt = now;
        const epochAtStart = currentAccountEpoch();
        try {
            if (outboxPending) {
                const flushed = await flushOutbox();
                if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
                if (flushed) return flushed;
            }
            const me = await fetchMe();
            if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
            return me;
        } catch (e) {
            if (epochAtStart !== currentAccountEpoch()) return getCachedPlayer();
            if (e?.status === 401 || e?.code === "INVALID_TOKEN" || e?.code === "UNAUTHORIZED") {
                setToken("");
                applyServerPlayer(null);
            }
            return null;
        } finally {
            liveSyncInFlight = false;
        }
    }

    function setupLiveSync() {
        if (!global.addEventListener) return;
        if (liveSyncTimer) return;
        liveSyncTimer = global.setInterval(() => {
            void liveSyncNow(false);
        }, LIVE_SYNC_INTERVAL_MS);
        global.document?.addEventListener?.("visibilitychange", () => {
            if (!global.document?.hidden) void liveSyncNow(true);
        });
        global.addEventListener("focus", () => { void liveSyncNow(true); });
        global.addEventListener("online", () => { void liveSyncNow(true); });
        global.addEventListener("pageshow", () => { void liveSyncNow(true); });
    }

    function setupUnloadFlush() {
        const flush = () => {
            if (!getToken() || !hasOutboxPending()) return;
            const patch = readOutbox();
            if (!patch) return;
            const body = JSON.stringify({
                ...patch,
                profileRevision: getCachedPlayer()?.profileRevision ?? patch.profileRevision,
            });
            const url = resolveApiBase() + "/auth/profile";
            const headers = {
                "Content-Type": "application/json",
                Authorization: "Bearer " + getToken(),
            };
            try {
                if (typeof global.navigator?.sendBeacon === "function") {
                    const blob = new Blob([body], { type: "application/json" });
                    // sendBeacon não envia Authorization; usa keepalive fetch.
                }
                if (typeof global.fetch === "function") {
                    void global.fetch(url, {
                        method: "PATCH",
                        headers,
                        body,
                        keepalive: true,
                        cache: "no-store",
                    });
                    return;
                }
            } catch (e) { /* */ }
            void flushOutbox();
        };
        global.addEventListener?.("pagehide", flush);
        global.addEventListener?.("beforeunload", flush);
    }

    global.DfAuthClient = Object.freeze({
        resolveApiBase,
        getToken,
        getCachedPlayer,
        getLastServerSnapshot,
        pushLocalProfileDiff,
        pushAccountToServer,
        saveHubToServer,
        saveDecksToServer,
        saveAvatarToServer,
        patchCachedPlayerFields,
        markLocalProfileDirty,
        markArsenalSessionDirty,
        clearArsenalSessionDirty,
        clearLocalProfileDirty,
        register,
        login,
        forgotPassword,
        changePassword,
        ensureSession,
        updateProfile,
        awardMatchXp,
        logout,
        fetchMe,
        liveSyncNow,
        flushOutbox,
        hasOutboxPending,
        isLocalProfileDirty,
        isArsenalSessionDirty: () => arsenalSessionDirty,
    });

    try {
        setupLiveSync();
        setupUnloadFlush();
        void ensureSession().then(() => liveSyncNow(true));
    } catch (e) {
        try { console.warn("[DfAuthClient] init deferido:", e?.message || e); } catch (err) { /* */ }
    }
})(typeof window !== "undefined" ? window : globalThis);
