/**
 * Dragonfall — sessão online PvP (Fase 1.1 arquitetura).
 * Gerado por: node scripts/build-phase1-online.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        if (typeof deps.$ !== "function") deps.$ = (id) => document.getElementById(id);
        let dfNet = null;
        let dfOnlineHeroPicked = false;
        let dfOnlineReady = false;
        let dfOnlineSyncTimer = null;
        let dfQueueTimer = null;
        let dfQueueStartedAt = 0;
        let _dfReactiveBlockWaiter = null;
        let _dfReactiveProtectWaiter = null;
        let _dfReactiveCancelWaiter = null;
        let _dfLastRemoteSeq = 0;
        /** Fila serial para SUMMON / END_TURN / FIELD_COMMIT (evita abort presentGen). */
        let _dfSeqCriticalQ = Promise.resolve();
        /** Fila só da IA de desconexão — pacing dela não pode travar a jogada local. */
        let _dfAiPresentQ = Promise.resolve();
        let _dfAiLastPresentAt = 0;
        /**
         * Piso de orçamento por tipo de cena (ms) no replay de apresentação.
         *
         * O teto genérico (~4,2s) vale por VISUAL, mas cenas multi-alvo gastam o
         * tempo por ALVO. Sem piso próprio, o Raio Duplo (até 2,8s × 2 alvos)
         * tinha o segundo raio cortado e a habilidade parecia não acontecer.
         */
        const DF_PRESENT_KIND_FLOOR_MS = Object.freeze({
            raio_duplo: 7000,
            misseis_magicos: 7000,
            fumaca_toxica: 7000,
            zero_absoluto: 7000,
            baforada_venenosa: 6500,
            grito_de_guerra: 6000,
        });
        /** Cenas que chegam por mais de um caminho no MP — dedupe por conteúdo. */
        const DF_REPLAY_DEDUPE_KINDS = new Set(["necromancia", "poison_kill", "mordida_venenosa"]);
        const _dfReplayDedupeAt = new Map();
        /**
         * Reserva uma cena para apresentação. Retorna false se a mesma cena já
         * foi apresentada há pouco — é o que impede necromancia/veneno de rodar
         * duas vezes quando chegam por dois caminhos distintos.
         */
        function dfClaimReplayScene(kind, parts) {
            // Com uid, ele SOZINHO identifica a cena. Incluir o nome da carta
            // quebrava o dedupe do veneno: o caminho pré-reconcile não tinha o
            // nome (`card` vazio) e o replay tinha, gerando chaves diferentes —
            // por isso a destruição por Envenenado aparecia duas vezes no MP.
            const key = parts?.uid != null && parts.uid !== ""
                ? `${kind}:${parts.uid}`
                : [kind, "", parts?.card ?? "", parts?.p ?? "", parts?.i ?? ""].join(":");
            const now = Date.now();
            for (const [k, t] of _dfReplayDedupeAt) {
                if (now - t > 9000) _dfReplayDedupeAt.delete(k);
            }
            if (now - (_dfReplayDedupeAt.get(key) || 0) < 6000) return false;
            _dfReplayDedupeAt.set(key, now);
            return true;
        }
        /** Mutex boot MP: evita room_state + match_start duplicarem reveal/música/startTurn. */
        let _dfOnlineBootPromise = null;
        let _dfOnlineBootKey = null;
        let _dfBoardSyncTimer = null;
        let _dfPendingBoardAnim = null;
        let _dfRemoteBodyQ = Promise.resolve();
        /** @deprecated — use _dfPresenter groups (board/fx). Mantido como alias do board. */
        let _dfVisualQ = Promise.resolve();
        let _dfLastVisualPatchAt = 0;
        /** Evita replay_sync duplicado logo após reconnected (mesmo seq). */
        let _dfSkipNextReplaySyncSeq = null;
        let _dfLastVisualSeq = 0;
        let _dfLastAttackResolveSeq = 0;
        let _dfLastAckPresentSeq = 0;
        /** Após commit de talento: bloqueia revive de activeTalent órfão no reconcile até próximo TALENT_START. */
        let _dfMpTalentCommitted = false;
        /** Watchdogs por seat: limpam spotlight se talent_discard nunca chegar (MP only). */
        const _dfTalentSpotlightWatchdogs = Object.create(null);

        function dfOnlinePurgeTalentSpotlight(ownerP) {
            try {
                if (ownerP != null && _dfTalentSpotlightWatchdogs[ownerP]) {
                    clearTimeout(_dfTalentSpotlightWatchdogs[ownerP]);
                    delete _dfTalentSpotlightWatchdogs[ownerP];
                }
            } catch (e) { /* */ }
            try {
                const st = deps.getState();
                if (st) st.activeTalent = null;
            } catch (e) { /* */ }
            try {
                const layer = document.getElementById("talent-spotlight-layer");
                layer?.replaceChildren?.();
                layer?.classList?.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
            } catch (e) { /* */ }
            try {
                if (ownerP != null) _dfPresenter?.clearTalentPending?.(ownerP);
                else {
                    for (let i = 0; i < 4; i++) _dfPresenter?.clearTalentPending?.(i);
                }
            } catch (e) { /* */ }
            try { deps.updateUI?.(true); } catch (e) { /* */ }
        }

        function dfOnlineArmTalentSpotlightWatchdog(ownerP) {
            if (!window.__DF_ONLINE || ownerP == null) return;
            try {
                if (_dfTalentSpotlightWatchdogs[ownerP]) {
                    clearTimeout(_dfTalentSpotlightWatchdogs[ownerP]);
                }
            } catch (e) { /* */ }
            _dfTalentSpotlightWatchdogs[ownerP] = setTimeout(() => {
                delete _dfTalentSpotlightWatchdogs[ownerP];
                try {
                    const st = deps.getState();
                    if (!st?.activeTalent) {
                        _dfPresenter?.clearTalentPending?.(ownerP);
                        return;
                    }
                    if (st.activeTalent.ownerP !== ownerP) return;
                    console.warn("[DF online] talent spotlight watchdog — purge", ownerP);
                    dfOnlinePurgeTalentSpotlight(ownerP);
                } catch (e) { /* */ }
            }, 9000);
        }
        /** Anti-duplo feedback de reação no requester (ANSWER + resolveCombat). */
        const _dfReactiveFeedbackAt = { block: 0, protect: 0, cancel: 0 };
        /** Barreira de resync (reconnect) — evita remote_action durante apply. */
        let _dfResyncInProgress = false;
        let _dfPendingRemoteDuringResync = [];
        /** Seqs de ULTIMATE_PLAY já animados (evita duplo no reconnect). */
        const _dfUltReplaySeqs = new Set();
        let _dfStartTurnAfterResync = false;
        /** Após reconnect: aplica só snapshot — sem replay VFX acelerado das jogadas perdidas. */
        let _dfMpReconnectQuietUntil = 0;
        function dfOnlineArmReconnectQuiet(ms = 4000) {
            _dfMpReconnectQuietUntil = Date.now() + Math.max(500, ms | 0);
            try { window.__dfMpReconnectQuietUntil = _dfMpReconnectQuietUntil; } catch (e) { /* */ }
        }
        function dfOnlineInReconnectQuiet() {
            return Date.now() < (_dfMpReconnectQuietUntil | 0);
        }

        /** Fase 2: tipos agora autoritativos no servidor — não enviar snapshot. */
        const DF_MP_NOSNAP_TYPES = new Set([
            "ABILITY_TARGET",
            "ULTIMATE_TARGET",
            "MENU_CHOICE",
            "NECROMANCIA_PICK",
            "UNFREEZE_CONFIRM",
            "TALENT_TARGET",
            "REACTIVE_BLOCK_ANSWER",
            "REACTIVE_PROTECTION_ANSWER",
            "REACTIVE_CANCEL_ANSWER",
        ]);

        function dfOnlineBroadcastVisualAwait(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) {
                return Promise.resolve();
            }
            return dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => {
                return dfNet.sendAction({
                    type: "PLAY_VISUAL",
                    playerId: deps.dfLocalSeat(),
                    anim,
                }, null).catch((e2) => console.warn("[DF online] PRESENT/PLAY_VISUAL", e2 || e));
            });
        }

        /** Timeout do requester: tell (~560ms) + prompt 5s + RTT. */
        const DF_REACTIVE_ANSWER_TIMEOUT_MS = (typeof window !== "undefined" && window.__DF_ONLINE)
            ? 10000
            : 10000;
        function dfReactiveAnswerTimeoutMs() {
            return window.__DF_ONLINE ? 10000 : 10000;
        }
        /** Cancel Ultimate: prompt 5s + tell + margem de rede — não fail-open cego. */
        function dfReactiveCancelTimeoutMs() {
            return window.__DF_ONLINE ? 11000 : 10000;
        }

        /**
         * Mostra a carta reação ao peer frustrado (activeTalent + voo pro descarte).
         * MP-only — vs-IA já vê a carta no prompt local.
         */
        async function dfOnlineRevealReactiveCard(ownerP, cardName, talentEffect) {
            if (!window.__DF_ONLINE) return;
            const st = deps.getState();
            const fakeCard = {
                name: cardName || "Reação",
                category: "talent",
                subcategory: "reaction",
                talentEffect: talentEffect || null,
                power: 0,
                currentPower: 0,
            };
            st.activeTalent = { ownerP, card: fakeCard };
            try { deps.updateUI(); } catch (e) { /* */ }
            // Peer precisa ver a reação ~2s antes do fly-to-discard.
            const DF_REACTIVE_REVEAL_MS = 2000;
            try {
                await (deps.wait?.(DF_REACTIVE_REVEAL_MS)
                    || new Promise((r) => setTimeout(r, DF_REACTIVE_REVEAL_MS)));
            } catch (e) { /* */ }
            try {
                if (typeof deps.flyActiveTalentToDiscard === "function") {
                    await Promise.race([
                        deps.flyActiveTalentToDiscard(ownerP),
                        deps.wait?.(1200) || new Promise((r) => setTimeout(r, 1200)),
                    ]);
                } else {
                    await (deps.wait?.(400) || new Promise((r) => setTimeout(r, 400)));
                }
            } catch (e) { /* */ }
            try {
                if (deps.getState().activeTalent?.ownerP === ownerP) {
                    deps.getState().activeTalent = null;
                }
                deps.updateUI();
            } catch (e2) { /* */ }
        }

        /**
         * Feedback no seat do iniciador quando a reação do peer confirma.
         * MP-only. Dedup curto evita dobrar com PRESENT / resolveCombat.
         */
        async function dfOnlinePlayReactivePeerFeedback(kind, payload = {}) {
            if (!window.__DF_ONLINE) return;
            const now = Date.now();
            if (now - (_dfReactiveFeedbackAt[kind] || 0) < 2800) return;
            _dfReactiveFeedbackAt[kind] = now;
            const defOwner = payload.defenderPlayerId ?? payload.defOwner ?? 0;
            const defP = deps.getState().players[defOwner];
            const defName = defP?.name || "Oponente";
            try {
                if (kind === "block") {
                    const defIdx = payload.defenderIdx ?? payload.defIdx;
                    const defender = (defIdx != null)
                        ? (deps.getState().players[defOwner]?.field?.[defIdx] || null)
                        : null;
                    deps.log?.(`${defName} usou Bloquear Ataque — ataque cancelado!`);
                    deps.flashRuleBanner?.("🛡️ Ataque Bloqueado!", `${defName} usou Bloquear Ataque.`);
                    if (typeof deps.animateBlockedAttack === "function") {
                        await deps.animateBlockedAttack(defOwner, defender || { name: "Campeão" });
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "BLOQUEAR ATAQUE", "bloquearAtaque");
                } else if (kind === "protect") {
                    let defender = null;
                    if (payload.defenderUid != null) {
                        defender = defP?.field?.find((c) => c && c.uid === payload.defenderUid) || null;
                    }
                    if (!defender && payload.defenderName) {
                        defender = defP?.field?.find((c) => c && c.name === payload.defenderName) || null;
                    }
                    if (!defender) defender = { name: payload.defenderName || "Campeão" };
                    deps.log?.(`${defName} usou Proteção Divina!`);
                    deps.flashRuleBanner?.(
                        "✨ Proteção Divina!",
                        `${defName} protegeu ${defender.name || "seu Campeão"}.`,
                    );
                    if (typeof deps.animateDivineProtection === "function") {
                        await deps.animateDivineProtection(defOwner, defender);
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "PROTEÇÃO DIVINA", "protecaoDivina");
                } else if (kind === "cancel") {
                    const casterP = payload.casterP ?? payload.attOwner ?? deps.dfLocalSeat();
                    const hero = payload.ultimateName
                        ? { ultimateName: payload.ultimateName }
                        : (deps.getHeroDef?.(deps.getState().players[casterP]?.heroId)
                            || { ultimateName: "Ultimate" });
                    deps.log?.(`${defName} cancelou a Ultimate de ${deps.getState().players[casterP]?.name || "você"}!`);
                    deps.flashRuleBanner?.(
                        "🚫 Ultimate Cancelada!",
                        `${defName} usou Cancelar Ultimate.`,
                    );
                    if (typeof deps.animateCancelUltimate === "function") {
                        await deps.animateCancelUltimate(casterP, hero);
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "CANCELAR ULTIMATE", "cancelarUltimate");
                }
            } catch (e) {
                console.warn("[DF online] reactive peer feedback", e);
            }
        }

        /** On-enter / talent VFX: fora da fila do summon (latência peer). */
        const DF_PARALLEL_VISUAL_KINDS = new Set([
            "pesadelo", "wings", "roubar", "desacelerar", "strong_arm",
            "bola_de_fogo", "assassinar", "maldicao_sete_mares",
            "devour", "imitar", "ursificacao", "transformar_bichinho", "fury",
            "fire_aura", "guardiao", "guardian", "fumaca_toxica", "raio_duplo",
            "explosao", "zero_absoluto", "barrier_grant", "baforada_venenosa",
            "incendiar", "mordida_venenosa", "poison", "land_impact", "card_draw",
            "combat_telegraph",
            "misseis_magicos", "divine_protection", "cancel_ultimate",
            "dragon_token_summon", "explosao_venenosa_burst",
            "blocked_attack", "vinganca", "necromancia", "thunder_discard",
            "aceleracao", "rajada_congelante", "rajada_congelante_destroy",
            "corrupt", "doppel_cast", "ritual_spotlight", "ritual_spotlight_clear",
            "legado",
        ]);
        // scare_return / doppel_clone: SERIAL via FIELD_COMMIT after_vfx (não parallel).
        // troca_injusta: SERIAL após land do SUMMON (precisa DOM nos dois slots).
        // talent_cast / talent_discard: SERIAL (board) — evita race discard-before-cast.

        const _dfPresenter = (typeof window !== "undefined" && window.DfMpPresenter)
            ? window.DfMpPresenter.create({ fxKinds: DF_PARALLEL_VISUAL_KINDS })
            : null;

        const DF_ONLINE_LOCK_PHASES = new Set([
            "menu", "reactive-block", "detail", "discard", "game-over",
        ]);
        const DF_ONLINE_PICK_PHASES = new Set([
            "select-attacker", "select-defender", "target-champion",
            "target-ally", "ultimate-target",
        ]);
        /** On-enter que devem esperar o land do summon no peer. */
        const DF_ON_ENTER_VISUAL_KINDS = new Set([
            "pesadelo", "wings", "roubar", "desacelerar", "strong_arm",
            "bola_de_fogo", "assassinar", "maldicao_sete_mares", "troca_injusta",
            "devour", "imitar", "transformar_bichinho", "fury",
            "fire_aura", "guardiao", "guardian", "fumaca_toxica", "raio_duplo",
            "incendiar", "mordida_venenosa", "poison", "corrupt",
        ]);
        // ursificacao: NÃO espera gate de summon — ally-target pós-invocação.
        let _dfPeerSummonGate = Promise.resolve();
        let _dfPeerSummonUntil = 0;
        const DF_STATUS_BOOL_KEYS = [
            "frozen", "tapped", "freeAttack", "shielded", "shieldedPermanent",
            "barrier", "barrierPermanent", "vulnerable", "silenced", "poisoned",
            "fury", "pulled", "inspiracao", "mimico", "wallBuff", "guerraBuff",
            "foreverGrowth", "fireAura", "burning", "corruptedNoHonor", "furyBonusActive",
        ];
        const DF_STATUS_NUM_KEYS = [
            "frozenTurns", "shieldedTurns", "barrierTurns", "poisonTurns",
            "furyTurns", "furyStacks", "guerraBuffTurns", "burningTurns",
            "fireAuraTurns", "currentPower", "poisonedByP", "burningByP",
        ];

        window.__DF_ROOM_HEROES = window.__DF_ROOM_HEROES || [null, null];

        /** Indicador discreto de rede (Fase 1) — um só, sem spam de toast. Só no MP. */
        function setNetStatusUi(status) {
            let el = document.getElementById("df-net-status");
            // vs-IA / hub: nunca mostrar Offline/Reconectando.
            if (!window.__DF_ONLINE) {
                if (el) {
                    el.style.opacity = "0";
                    el.textContent = "";
                }
                return;
            }
            if (!el) {
                el = document.createElement("div");
                el.id = "df-net-status";
                el.setAttribute("aria-live", "polite");
                el.style.cssText = [
                    "position:fixed", "top:10px", "right:10px", "z-index:9998",
                    "padding:6px 10px", "border-radius:8px", "font:600 12px/1.2 system-ui,sans-serif",
                    "pointer-events:none", "opacity:0", "transition:opacity .25s",
                    "background:rgba(12,14,20,.82)", "color:#e8eef8", "border:1px solid rgba(255,215,107,.35)",
                ].join(";");
                document.body.appendChild(el);
            }
            const map = {
                connected: { text: "", hide: true },
                reconnecting: { text: "Reconectando…", hide: false },
                offline: { text: "Offline", hide: false },
            };
            const m = map[status] || map.connected;
            if (m.hide) {
                el.style.opacity = "0";
                el.textContent = "";
                return;
            }
            el.textContent = m.text;
            el.style.opacity = "1";
            el.style.color = status === "offline" ? "#ffb4b4" : "#ffd76b";
        }

        /**
         * Sai do modo online (flags + UI de rede). Obrigatório antes de vs-IA
         * para a IA voltar a jogar e não aparecer Offline / servidor.
         */
        function dfClearOnlineMatchFlags(opts = {}) {
            // Mid-match PvP: leaveRoom = SURRENDER — só limpa se force ou partida já acabou.
            if (!opts.force && window.__DF_ONLINE) {
                try {
                    const st = deps.getState?.();
                    if (st?.started && st.winner == null && document.body.classList.contains("df-pvp-mode")) {
                        console.warn("[DF online] dfClearOnlineMatchFlags blocked mid-match");
                        return;
                    }
                } catch (e) { /* */ }
            }
            const leaveNet = opts.leaveNet !== false;
            window.__DF_ONLINE = false;
            window.__DF_SEAT = 0;
            window.__dfOnlineSkipMaintRules = false;
            window.__dfOnlineMatchBoot = false;
            window.__dfOnlinePickingHero = false;
            window.__dfSummonInFlight = false;
            window.__dfOnlineBootDone = false;
            window.__dfOnlineBootLockInput = false;
            window.__dfMatchBoardRevealedKey = null;
            window.__dfBattleMusicStartedKey = null;
            window.__dfLocalSummonUid = null;
            window.__dfLocalSummonAnimKey = null;
            try { deps.setApplyingRemote(false); } catch (e) { /* */ }
            document.body.classList.remove("df-online-seat-1", "df-pvp-mode", "df-peer-ai");
            window.__dfPeerAiActive = false;
            window.__dfPeerAiSeat = null;
            try {
                const b = document.getElementById("df-peer-ai-banner");
                if (b) b.hidden = true;
            } catch (e) { /* */ }
            setNetStatusUi("connected");
            const pill = document.getElementById("df-net-status");
            if (pill) {
                pill.style.opacity = "0";
                pill.textContent = "";
            }
            if (leaveNet) {
                try { dfPvPStopQueueTimer(); } catch (e) { /* */ }
                void (async () => {
                    try { await dfNet?.leaveQueue?.(); } catch (e) { /* */ }
                    // Hub / vs-IA: não abandonar assento por default (evita envenenar reconexão).
                    try {
                        await dfNet?.leaveRoom?.({
                            abandon: opts.abandon === true,
                            clearSession: opts.clearSession !== false,
                        });
                    } catch (e) { /* */ }
                })();
            }
        }

        function dfOnlineAwaitReactiveBlock(attOwner, attIdx, defOwner, defIdx) {
            return new Promise((resolve) => {
                // Prompt 5s + tell + RTT. ANSWER sai antes das animações do defensor.
                const tid = setTimeout(() => {
                    if (_dfReactiveBlockWaiter) {
                        _dfReactiveBlockWaiter.resolve(false);
                        _dfReactiveBlockWaiter = null;
                    }
                }, dfReactiveAnswerTimeoutMs());
                _dfReactiveBlockWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveBlockWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_BLOCK_QUERY",
                    attackerIdx: attIdx,
                    defenderPlayerId: defOwner,
                    defenderIdx: defIdx,
                });
            });
        }

        async function dfOnlineResolveReactiveBlock(attOwner, attIdx, defOwner, defIdx, attacker, defender) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) {
                return deps.offerReactiveBlock(attOwner, defOwner, attacker, defender);
            }
            if (defOwner === deps.dfLocalSeat()) {
                return deps.offerReactiveBlock(attOwner, defOwner, attacker, defender, { allowRemotePrompt: true });
            }
            if (attOwner !== deps.dfLocalSeat()) return false;
            // Sempre consulta o defensor — mão do peer é fog-of-war no cliente do atacante.
            return dfOnlineAwaitReactiveBlock(attOwner, attIdx, defOwner, defIdx);
        }

        /** Resposta imediata a REACTIVE_BLOCK_QUERY (fora da fila visual). */
        async function dfOnlineHandleReactiveBlockQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const hasBlock = !!defP?.hand?.some((c) => c && c.talentEffect === "bloquearAtaque");
            let blocked = false;
            if (hasBlock) {
                const attacker = deps.getState().players[envelope.fromSeat]?.field?.[act.attackerIdx];
                const defender = deps.getState().players[defOwner]?.field?.[act.defenderIdx];
                blocked = await deps.offerReactiveBlock(
                    envelope.fromSeat,
                    defOwner,
                    attacker,
                    defender,
                    { allowRemotePrompt: true },
                );
            }
            // ANSWER antes das animações — o atacante não pode timeout enquanto o VFX roda.
            dfOnlineSendNow({
                type: "REACTIVE_BLOCK_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!blocked,
                blocked: !!blocked,
                attackerIdx: act.attackerIdx,
                defenderPlayerId: defOwner,
                defenderIdx: act.defenderIdx,
                attOwner: envelope.fromSeat,
            });
            if (blocked) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "blocked_attack",
                        defOwner,
                        defIdx: act.defenderIdx,
                        cardName: "BLOQUEAR ATAQUE",
                        talentEffect: "bloquearAtaque",
                    });
                } catch (e) { /* */ }
            }
        }

        function dfOnlineAwaitReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate) {
            return new Promise((resolve) => {
                const tid = setTimeout(() => {
                    if (_dfReactiveProtectWaiter) {
                        _dfReactiveProtectWaiter.resolve(false);
                        _dfReactiveProtectWaiter = null;
                    }
                }, dfReactiveAnswerTimeoutMs());
                _dfReactiveProtectWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveProtectWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_PROTECTION_QUERY",
                    defenderPlayerId: defOwner,
                    sourceLabel: sourceLabel || null,
                    defenderName: defender?.name || null,
                    defenderUid: defender?.uid || null,
                    isUltimate: !!isUltimate,
                });
            });
        }

        async function dfOnlineResolveReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) {
                return deps.offerReactiveProtection(attOwner, defOwner, defender, sourceLabel, isUltimate);
            }
            if (defOwner === deps.dfLocalSeat()) {
                return deps.offerReactiveProtection(
                    attOwner, defOwner, defender, sourceLabel, isUltimate, { allowRemotePrompt: true },
                );
            }
            if (attOwner !== deps.dfLocalSeat()) return false;
            return dfOnlineAwaitReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate);
        }

        async function dfOnlineHandleReactiveProtectQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const hasProtect = !!defP?.hand?.some((c) => c && c.talentEffect === "protecaoDivina");
            let used = false;
            let defender = null;
            if (hasProtect) {
                if (act.defenderUid != null) {
                    defender = defP?.field?.find((c) => c && c.uid === act.defenderUid) || null;
                }
                if (!defender && act.defenderName) {
                    defender = defP?.field?.find((c) => c && c.name === act.defenderName) || null;
                }
                if (!defender) defender = { name: act.defenderName || "Campeão" };
                used = await deps.offerReactiveProtection(
                    envelope.fromSeat,
                    defOwner,
                    defender,
                    act.sourceLabel || "Redução de Poder",
                    !!act.isUltimate,
                    { allowRemotePrompt: true },
                );
            }
            dfOnlineSendNow({
                type: "REACTIVE_PROTECTION_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!used,
                protected: !!used,
                defenderPlayerId: defOwner,
                defenderIdx: (() => {
                    if (!defender?.uid) return act.defenderIdx ?? null;
                    const i = defP?.field?.findIndex((c) => c && c.uid === defender.uid);
                    return i >= 0 ? i : (act.defenderIdx ?? null);
                })(),
                defenderName: act.defenderName || null,
                defenderUid: act.defenderUid || defender?.uid || null,
                attOwner: envelope.fromSeat,
            });
            if (used) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "divine_protection",
                        defOwner,
                        defenderName: defender?.name || act.defenderName || null,
                        defenderUid: defender?.uid || act.defenderUid || null,
                        defenderPlayerId: defOwner,
                        cardName: "PROTEÇÃO DIVINA",
                        talentEffect: "protecaoDivina",
                    });
                } catch (e) { /* */ }
            }
        }

        function dfOnlineAwaitReactiveCancel(casterP, hero, defOwner) {
            return new Promise((resolve) => {
                const tid = setTimeout(() => {
                    if (_dfReactiveCancelWaiter) {
                        _dfReactiveCancelWaiter.resolve(false);
                        _dfReactiveCancelWaiter = null;
                    }
                }, dfReactiveCancelTimeoutMs());
                _dfReactiveCancelWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveCancelWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_CANCEL_QUERY",
                    defenderPlayerId: defOwner,
                    heroId: hero?.id || null,
                    ultimateName: hero?.ultimateName || null,
                });
            });
        }

        async function dfOnlineResolveReactiveCancel(casterP, hero, defOwner) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return false;
            // Overlay só via QUERY no holder — caster apenas aguarda ANSWER.
            if (casterP !== deps.dfLocalSeat()) return false;
            if (defOwner === deps.dfLocalSeat()) return false;
            return dfOnlineAwaitReactiveCancel(casterP, hero, defOwner);
        }

        async function dfOnlineHandleReactiveCancelQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const handIdx = defP?.hand?.findIndex((c) => c && c.talentEffect === "cancelarUltimate") ?? -1;
            let cancelled = false;
            let hero = null;
            if (handIdx >= 0) {
                hero = act.ultimateName
                    ? { ultimateName: act.ultimateName, id: act.heroId }
                    : (deps.getHeroDef?.(deps.getState().players[envelope.fromSeat]?.heroId) || { ultimateName: "Ultimate" });
                cancelled = await deps.showHumanCancelUltimatePrompt(
                    defOwner, handIdx, envelope.fromSeat, hero,
                );
            }
            dfOnlineSendNow({
                type: "REACTIVE_CANCEL_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!cancelled,
                cancelled: !!cancelled,
                defenderPlayerId: defOwner,
                attOwner: envelope.fromSeat,
                ultimateName: act.ultimateName || null,
            });
            if (cancelled) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "cancel_ultimate",
                        casterP: envelope.fromSeat,
                        ultimateName: hero?.ultimateName || act.ultimateName || null,
                        cardName: "CANCELAR ULTIMATE",
                        talentEffect: "cancelarUltimate",
                    });
                } catch (e) { /* */ }
            }
        }

        /**
         * Aplica events / presentationEnvelope do motor.
         * Se opts.authApplied, só VFX (estado já veio no authoritativeState).
         */
        function dfOnlineApplyPresentationFromEvents(envelope, opts = {}) {
            const authApplied = !!opts.authApplied;
            const fromPresentation = envelope.presentationEnvelope;
            if (!authApplied && fromPresentation?.fieldPatches?.length) {
                dfOnlineApplyFieldPatches(fromPresentation.fieldPatches);
                deps.updateUI(true);
            }
            const events = envelope?.events;
            if (!authApplied && Array.isArray(events) && events.length) {
                const patches = [];
                for (const ev of events) {
                    if (!ev || typeof ev !== "object") continue;
                    if (ev.type === "STATUS_SET" && ev.targetP != null && ev.targetI != null) {
                        patches.push({
                            targetP: ev.targetP,
                            targetI: ev.targetI,
                            ...(ev.flags || {}),
                        });
                    } else if ((ev.type === "POWER_REDUCED" || ev.type === "VINGANCA_HIT"
                        || ev.type === "POWER_CHANGED")
                        && ev.targetP != null && ev.targetI != null) {
                        if (ev.removed || (ev.currentPower != null && ev.currentPower <= 0
                            && ev.type !== "POWER_CHANGED")) {
                            patches.push({ targetP: ev.targetP, targetI: ev.targetI, removed: true });
                        } else if (ev.currentPower != null) {
                            patches.push({
                                targetP: ev.targetP,
                                targetI: ev.targetI,
                                currentPower: ev.currentPower,
                            });
                        }
                    } else if (ev.type === "DESTROY" && ev.targetP != null && ev.targetI != null) {
                        patches.push({ targetP: ev.targetP, targetI: ev.targetI, removed: true });
                    }
                }
                if (patches.length) {
                    dfOnlineApplyFieldPatches(patches);
                    deps.updateUI(true);
                }
            }
            // Vingança / bursts: VFX a partir dos events (auth já mutou o board).
            if (Array.isArray(events)) {
                for (const ev of events) {
                    if (ev?.type === "ON_DESTROY_BURST" && ev.ability === "legado") {
                        for (const t of ev.applied || []) {
                            if (t?.p == null || t?.i == null) continue;
                            void dfOnlineReplayAnim({
                                kind: "legado",
                                ownerP: ev.ownerIdx,
                                targetP: t.p,
                                targetI: t.i,
                                powerAfter: t.currentPower,
                            });
                        }
                    }
                    if (ev?.type === "ON_DESTROY_BURST" && ev.ability === "vinganca") {
                        for (const t of ev.applied || []) {
                            if (t?.p == null || t?.i == null) continue;
                            void dfOnlineReplayAnim({
                                kind: "vinganca",
                                ownerP: ev.ownerIdx,
                                targetP: t.p,
                                targetI: t.i,
                                powerAfter: t.currentPower,
                            });
                        }
                    }
                }
            }
            if (fromPresentation?.visuals?.length && !authApplied) {
                const skipKinds = opts.skipVisualKinds instanceof Set
                    ? opts.skipVisualKinds
                    : (Array.isArray(opts.skipVisualKinds)
                        ? new Set(opts.skipVisualKinds)
                        : null);
                for (const vis of fromPresentation.visuals) {
                    if (!vis?.kind || vis.kind === "combat") continue;
                    if (skipKinds?.has(vis.kind)) continue;
                    void dfOnlineReplayAnim(vis);
                }
            }
        }

        function dfApplyRoomHeroState(data) {
            if (!data?.players) return;
            window.__DF_ROOM_HEROES = [
                data.players[0]?.heroId || null,
                data.players[1]?.heroId || null,
            ];
            dfRefreshHeroSelectLocks();
        }

        function dfOnlineHeroBlocked(heroId) {
            // Rankeado: mesmos heróis permitidos — não bloqueia.
            void heroId;
            return false;
        }

        function dfRefreshHeroSelectLocks() {
            const grid = deps.$("hero-grid");
            if (!grid) return;
            grid.querySelectorAll(".hero-card[data-hero-id]").forEach((card) => {
                card.classList.remove("hero-taken");
                const lab = card.querySelector(".hero-taken-label");
                if (lab) lab.textContent = "";
            });
        }

        function dfPvPStopQueueTimer() {
            if (dfQueueTimer) {
                clearInterval(dfQueueTimer);
                dfQueueTimer = null;
            }
        }

        function dfPvPStartQueueTimer() {
            dfQueueStartedAt = Date.now();
            dfPvPStopQueueTimer();
            const tick = () => {
                const el = deps.$("pvp-queue-seconds");
                if (el) el.textContent = String(Math.floor((Date.now() - dfQueueStartedAt) / 1000));
            };
            tick();
            dfQueueTimer = setInterval(tick, 250);
        }

        function dfPvPShowMatchFlash() {
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "";
            const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
            if (preset?.heroId) {
                setOnlineStatus("Match! Enviando herói e aguardando o adversário…");
            } else {
                setOnlineStatus("Match! Escolha seu herói.");
            }
        }

        function hideOnlineLobbyScreen() {
            dfPvPStopQueueTimer();
            window.__dfOnlinePickingHero = false;
            deps.setHeroSelectionMode( false);
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.classList.remove("active");
                lobby.style.display = "none";
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            deps.$("hero-select")?.classList.remove("active");
        }

        function dfEngineSnapshotFull() {
            if (!window.DfState) return null;
            return DfState.snapshot({
                state: deps.getState(),
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length ? deps.getTargetData() : null,
                pendingSummon: deps.getPendingSummon(), full: true,
            });
        }

        function dfEngineSnapshotLite() {
            if (!window.DfState) return null;
            return DfState.snapshot({
                state: deps.getState(),
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length ? deps.getTargetData() : null,
                pendingSummon: deps.getPendingSummon(), full: false,
            });
        }

        function dfOnlinePrefetchBoard() {
            if (!deps.getState()?.players) return;
            try {
                deps.getState().players.forEach((pl) => {
                    pl.hand?.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.field?.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.deck?.slice?.(0, 12)?.forEach?.((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.discard?.slice(-6).forEach((c) => window.dfPrefetchCardArt?.(c.name));
                });
                // Catálogo completo só em idle (não trava o 1º turno).
                if (typeof deps.cardDefs !== "undefined") {
                    const rest = deps.cardDefs.filter((c) => !c.hidden).map((c) => c.name);
                    const sched = window.requestIdleCallback || ((fn) => setTimeout(fn, 900));
                    sched(() => {
                        rest.forEach((n) => window.dfPrefetchCardArt?.(n));
                    }, { timeout: 6000 });
                }
            } catch (e) {}
        }

        async function dfOnlineRemoteEndTurn(fromSeat) {
            if (deps.getState().winner !== null) return;
            const seat = fromSeat | 0;
            if (deps.getState().currentPlayer !== seat) return;
            deps.stopTimer();
            DfRules.applyWallBonusOnTurnEnd(deps.getState(), seat);
            let next = (seat + 1) % deps.getState().playersCount;
            if (next === 0) deps.getState().turnNumber = (deps.getState().turnNumber || 1) + 1;
            await deps.startTurn(next);
        }

        /**
         * Normaliza + replay visuals do presentationEnvelope / events (MP only).
         * Usado após SUMMON / ULTIMATE / END_TURN quando o servidor já aplicou o efeito.
         */
        function dfOnlineNormalizeVisual(vis) {
            if (!vis || typeof vis !== "object") return null;
            const kind = vis.kind || vis.visual;
            if (!kind || kind === "summon") return null;
            const out = { ...vis, kind };
            if (out.casterP == null && out.casterIdx != null) out.casterP = out.casterIdx;
            if (out.ownerP == null && out.casterIdx != null) out.ownerP = out.casterIdx;
            if (out.casterFieldIdx == null && out.fieldIdx != null) out.casterFieldIdx = out.fieldIdx;
            if (out.casterField == null && out.fieldIdx != null) out.casterField = out.fieldIdx;
            if (out.cardName == null && out.card != null) {
                out.cardName = typeof out.card === "string" ? out.card : (out.card.name || null);
            }
            if (kind === "em_chamas") out.kind = "incendiar";
            if (kind === "guardiao") out.kind = "guardian";
            return out;
        }

        async function dfOnlineReplayPresentationEnvelope(envelope, opts = {}) {
            if (!window.__DF_ONLINE) return;
            // Dedupe: mesmo seq não replaya 2× (ABILITY_TARGET actorPresent + await,
            // ou serverAi pre+present). Congela a UI e repete invocação/destruição.
            try {
                const seq = envelope?.seq != null ? (envelope.seq | 0) : 0;
                const dedupeKey = seq > 0
                    ? `pe:${seq}:${opts.authApplied ? 1 : 0}`
                    : "";
                if (dedupeKey) {
                    const now = Date.now();
                    const prev = window.__dfPeReplayAt || Object.create(null);
                    if (prev[dedupeKey] && (now - prev[dedupeKey]) < 8000) {
                        return;
                    }
                    prev[dedupeKey] = now;
                    // Limpa chaves velhas.
                    for (const k of Object.keys(prev)) {
                        if (now - prev[k] > 20000) delete prev[k];
                    }
                    window.__dfPeReplayAt = prev;
                }
            } catch (eDed) { /* */ }
            const pe = envelope?.presentationEnvelope;
            const fromPe = Array.isArray(pe?.visuals) ? pe.visuals : [];
            const fromEvents = [];
            if (!fromPe.length && Array.isArray(envelope?.events)) {
                for (const ev of envelope.events) {
                    if (!ev) continue;
                    if (ev.visual || ev.kind) fromEvents.push(ev);
                    else if (ev.type === "ROUBAR") fromEvents.push({ ...ev, kind: "roubar" });
                    else if (ev.type === "DESACELERAR") fromEvents.push({
                        ...ev,
                        kind: "desacelerar",
                        casterFieldIdx: ev.casterFieldIdx ?? ev.fieldIdx,
                    });
                    else if (ev.type === "MORDIDA_VENENOSA") fromEvents.push({
                        ...ev,
                        kind: "mordida_venenosa",
                    });
                    else if (ev.type === "PESADELO") fromEvents.push({ ...ev, kind: "pesadelo" });
                    else if (ev.type === "MALDICAO_SETE_MARES") fromEvents.push({ ...ev, kind: "maldicao_sete_mares" });
                    else if (ev.type === "FUMACA_TOXICA") fromEvents.push({ ...ev, kind: "fumaca_toxica" });
                    else if (ev.type === "NECROMANCIA") fromEvents.push({ ...ev, kind: "necromancia" });
                    else if (ev.type === "FORTALECER" || ev.type === "STRONG_ARM" || ev.type === "TALENT_FORTALECER") {
                        fromEvents.push({ ...ev, kind: "strong_arm" });
                    }
                    else if (ev.type === "IMITAR") fromEvents.push({ ...ev, kind: "imitar" });
                    else if (ev.type === "GRITO_DE_GUERRA" && Array.isArray(ev.applied)) {
                        const ownerP = ev.casterIdx ?? ev.ownerP ?? 0;
                        for (const t of ev.applied) {
                            if (t?.p == null || t?.i == null) continue;
                            fromEvents.push({
                                kind: "fury",
                                ownerP,
                                fieldIdx: t.i,
                                furyStacks: t.furyStacks,
                                fieldPatches: [{
                                    targetP: t.p,
                                    targetI: t.i,
                                    fury: true,
                                    furyStacks: t.furyStacks ?? 1,
                                }],
                            });
                        }
                    }
                    else if (ev.type === "DRAW" && ev.reason === "upkeep") {
                        // Dedicado em dfOnlinePlayUpkeepDrawFromEvents — não replayar.
                    }
                    else if (ev.type === "THUNDER_DISCARD") {
                        fromEvents.push({ ...ev, kind: "thunder_discard" });
                    }
                    else if (ev.type === "COMBAT" || ev.type === "COMBAT_RESOLVED" || ev.type === "ATTACK_RESOLVED") {
                        fromEvents.push({
                            ...ev,
                            kind: "combat",
                            attOwner: ev.attacker?.p,
                            attIdx: ev.attacker?.i,
                            defOwner: ev.defender?.p,
                            defIdx: ev.defender?.i,
                            killA: !!ev.outcome?.killA,
                            killD: !!ev.outcome?.killD,
                        });
                    }
                    else if (ev.type === "COMBAT_BLOCKED") {
                        fromEvents.push({
                            ...ev,
                            kind: "blocked_attack",
                            attOwner: ev.attacker?.p,
                            attIdx: ev.attacker?.i,
                            defOwner: ev.defender?.p,
                            defIdx: ev.defender?.i,
                        });
                    }
                    else if (ev.type === "TOKEN_INSERT" || ev.type === "DRAGON_TOKEN_SUMMON") {
                        fromEvents.push({
                            ...ev,
                            kind: "dragon_token_summon",
                            ownerP: ev.ownerP ?? ev.casterIdx,
                            fieldIdx: ev.fieldIdx ?? ev.insertIdx,
                        });
                    }
                    else if (ev.type === "DEVOUR") {
                        fromEvents.push({
                            ...ev,
                            kind: "devour",
                            targetP: ev.casterIdx,
                            targetI: ev.devouredI,
                            casterFieldIdx: ev.fieldIdx ?? ev.casterFieldIdx,
                        });
                    }
                    else if (ev.type === "DESTROY") {
                        // Devorar já tem visual próprio — DESTROY reason=devorar
                        // no índice pré-remoção remove o campeão errado pós-reconcile.
                        if (ev.reason === "devorar" || ev.reason === "devour") continue;
                        fromEvents.push({
                            ...ev,
                            kind: "destroy",
                            ownerIdx: ev.p ?? ev.targetP ?? ev.ownerIdx,
                            fieldIdx: ev.i ?? ev.targetI ?? ev.fieldIdx,
                        });
                    }
                    else if (ev.type === "POISON_KILL") {
                        fromEvents.push({
                            ...ev,
                            kind: "poison_kill",
                            ownerIdx: ev.p,
                            fieldIdx: ev.i,
                            uid: ev.uid,
                            name: ev.name,
                        });
                    }
                    else if (ev.type === "RAIO_DUPLO") {
                        fromEvents.push({
                            ...ev,
                            kind: "raio_duplo",
                            casterP: ev.casterIdx ?? ev.casterP,
                            picks: (ev.hits || []).map((h) => ({ p: h.p, i: h.i })),
                            hits: ev.hits || [],
                        });
                    }
                    else if (ev.type === "LEGADO") {
                        fromEvents.push({ ...ev, kind: "legado" });
                    }
                }
            }
            const listRaw = (fromPe.length ? fromPe : fromEvents)
                .map(dfOnlineNormalizeVisual)
                .filter(Boolean);
            
            // MP: dedup animações que podem ser processadas 2× (NECROMANCIA, MORDIDA, poison_kill)
            // quando server envia visual + cliente converte event. Usa card name + kind como chave.
            const visKindsToDedup = new Set(["necromancia", "mordida_venenosa", "poison_kill"]);
            const dedupSeenKeys = new Set();
            const listDedup = listRaw.filter((v) => {
                if (!visKindsToDedup.has(v.kind)) return true;
                const key = `${v.kind}:${v.cardName || v.card || ""}:${v.casterP ?? v.ownerP ?? ""}`;
                if (dedupSeenKeys.has(key)) return false;
                dedupSeenKeys.add(key);
                return true;
            });
            
            const list = listDedup.filter((v) => {
                if (v.kind !== "destroy") return true;
                if (v.reason === "devorar" || v.reason === "devour") return false;
                const devourSeen = listDedup.some((dv) => dv?.kind === "devour");
                if (devourSeen) return false;
                return true;
            });
            const skipKinds = opts.skipKinds instanceof Set ? opts.skipKinds : null;
            const authApplied = !!opts.authApplied;
            // Após reconcile autoritativo: Devorar já removeu a presa — não
            // reaplicar removed no índice pré-remoção (some aliado aleatório).
            const presentBudgetMs = opts.budgetMs != null
                ? (opts.budgetMs | 0)
                : (window.__dfPresentBudgetMs || 4500);
            const playOne = async (vis) => {
                if (skipKinds && skipKinds.has(vis.kind)) return;
                // Piso por tipo: cenas MULTI-ALVO gastam o orçamento por alvo. O
                // Raio Duplo, por exemplo, roda até 2,8s em cada um dos 2 alvos —
                // com o teto genérico de 4,2s o segundo raio era cortado e a
                // habilidade parecia "não ter acontecido".
                const kindFloor = DF_PRESENT_KIND_FLOOR_MS[vis.kind] || 0;
                const visBudgetMs = Math.max(presentBudgetMs, kindFloor);
                let play = vis;
                if (authApplied) {
                    play = { ...vis, _authApplied: true };
                    if (Array.isArray(play.fieldPatches) && play.fieldPatches.length) {
                        const kept = play.fieldPatches.filter((p) => !p?.removed);
                        play.fieldPatches = kept.length ? kept : null;
                    }
                }
                try {
                    await Promise.race([
                        dfOnlineReplayAnim(play),
                        new Promise((r) => setTimeout(r, Math.max(1200, visBudgetMs))),
                    ]);
                } catch (e) {
                    console.warn("[DF online] presentation visual", vis.kind, e);
                }
            };
            for (const vis of list) {
                await playOne(vis);
            }
        }

        /** Arma draw-pending ANTES de qualquer updateUI pós-END_TURN (evita flash da face). */
        function dfOnlineArmUpkeepDrawIfNeeded(events) {
            if (!window.__DF_ONLINE) return false;
            if (!Array.isArray(events) || !events.length) return false;
            const drawEv = events.find((e) => e?.type === "DRAW" && e.reason === "upkeep");
            if (!drawEv) return false;
            const pid = drawEv.playerId;
            if (pid !== 0 && pid !== 1) return false;
            window.__dfUpkeepDrawInFlight = true;
            window.__dfUpkeepDrawSeat = pid;
            window.__dfUpkeepDrawAt = Date.now();
            return true;
        }

        /**
         * Raio Duplo: captura snaps/coords ANTES do reconcile auth
         * (vítimas P1=0 já saíram do estado oficial).
         */
        function dfOnlineCaptureRaioDuploPreHits(events) {
            if (!window.__DF_ONLINE) return null;
            if (!Array.isArray(events) || !events.length) return null;
            const ev = events.find((e) => e && e.type === "RAIO_DUPLO");
            if (!ev || !Array.isArray(ev.hits) || !ev.hits.length) return null;
            return ev.hits.map((h) => {
                if (!h || h.p == null) return null;
                let liveI = h.i;
                const field = deps.getState?.()?.players?.[h.p]?.field || [];
                if (h.uid != null) {
                    const byUid = field.findIndex((c) => c && c.uid === h.uid);
                    if (byUid >= 0) liveI = byUid;
                }
                let snap = null;
                try {
                    snap = typeof deps.dfCaptureFieldCardSnap === "function"
                        ? deps.dfCaptureFieldCardSnap(h.p, liveI)
                        : null;
                } catch (eSnap) { /* */ }
                const el = deps.getChampionDom?.(h.p, liveI);
                const tr = el?.getBoundingClientRect?.();
                return {
                    p: h.p,
                    i: h.i,
                    liveI,
                    uid: h.uid || snap?.uid || null,
                    name: h.name || snap?.name || null,
                    before: h.before,
                    after: h.after,
                    cx: tr ? tr.left + tr.width / 2 : null,
                    cy: tr ? tr.top + tr.height / 2 : null,
                    snap,
                };
            }).filter(Boolean);
        }

        /**
         * Mortes por Envenenado no END_TURN — burst ANTES do reconcile
         * (cartas ainda no DOM local).
         */
        async function dfOnlinePlayPoisonKillsFromEvents(events) {
            if (!window.__DF_ONLINE) return false;
            if (!Array.isArray(events) || !events.length) return false;
            const kills = events.filter((e) => e && e.type === "POISON_KILL");
            if (!kills.length) return false;
            const victims = [];
            const preMap = new Map();
            for (const k of kills) {
                const p = k.p;
                const i = k.i;
                if (p == null || i == null) continue;
                let snap = null;
                try {
                    snap = typeof deps.dfCaptureFieldCardSnap === "function"
                        ? deps.dfCaptureFieldCardSnap(p, i)
                        : null;
                } catch (eSnap) { /* */ }
                const uid = k.uid || snap?.uid || null;
                // Reserva a cena: o presentationEnvelope do mesmo END_TURN traz
                // o visual poison_kill e repetiria a animação.
                if (!dfClaimReplayScene("poison_kill", { uid, p, i })) continue;
                victims.push({ p, i, uid, name: k.name });
                if (snap) {
                    if (uid != null) preMap.set(uid, snap);
                    preMap.set(`${p}:${i}`, snap);
                }
            }
            if (!victims.length) return false;
            try {
                if (typeof deps.playPoisonMaintenanceDeaths === "function") {
                    await deps.playPoisonMaintenanceDeaths(victims, preMap.size ? preMap : null);
                } else {
                    for (const v of victims) {
                        try {
                            const el = deps.getChampionDom?.(v.p, v.i);
                            const r = el?.getBoundingClientRect?.();
                            if (r && r.width >= 4 && window.DfPixiVfx?.playPoisonExplosionBurstScene) {
                                await window.DfPixiVfx.playPoisonExplosionBurstScene(
                                    r.left + r.width / 2,
                                    r.top + r.height / 2,
                                    { cinematic: true },
                                );
                            }
                        } catch (eBurst) { /* */ }
                        try {
                            await deps.playStandardDestroyVisual?.(v.p, v.i, { uid: v.uid });
                        } catch (eDes) { /* */ }
                    }
                }
            } catch (e) {
                console.warn("[DF online] poison kill VFX", e);
            }
            return true;
        }

        /** Força hide do último slot da mão do saque (pós-updateUI / mid-banner). */
        function dfOnlineMarkUpkeepDrawPending(pid) {
            if (!window.__DF_ONLINE) return;
            if (pid !== 0 && pid !== 1) return;
            try {
                const qIdx = typeof deps.dfQuadrantForPlayer === "function"
                    ? deps.dfQuadrantForPlayer(pid)
                    : pid;
                const q = document.getElementById(`quadrant-${qIdx}`);
                if (!q) return;
                const wraps = q.querySelectorAll(".quadrant-hand .hand-wrap");
                if (!wraps.length) return;
                const last = wraps[wraps.length - 1];
                last.classList.add("draw-pending");
                const face = last.querySelector(".hcard, .ai-back");
                if (face) face.classList.add("draw-pending");
            } catch (e) { /* */ }
        }

        /** Saque livre (upkeep) já no estado autoritativo — só anima o voo da carta. */
        async function dfOnlinePlayUpkeepDrawFromEvents(events) {
            if (!Array.isArray(events) || !events.length) return;
            const drawEv = events.find((e) => e?.type === "DRAW" && e.reason === "upkeep");
            if (!drawEv || typeof deps.drawAnimToPlayer !== "function") return;
            const pid = drawEv.playerId;
            if (pid !== 0 && pid !== 1) return;
            // Flag já pode ter sido armada antes do reconcile — reforça.
            window.__dfUpkeepDrawInFlight = true;
            window.__dfUpkeepDrawSeat = pid;
            window.__dfUpkeepDrawAt = Date.now();
            try {
                // Monta slot com draw-pending ANTES do paint (sem revelar a face).
                deps.updateUI?.(true);
                dfOnlineMarkUpkeepDrawPending(pid);
                await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                dfOnlineMarkUpkeepDrawPending(pid);
                deps.drawAnimToPlayer(pid);
                dfOnlineMarkUpkeepDrawPending(pid);
                if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
            } catch (e) {
                console.warn("[DF online] upkeep draw anim", e);
            } finally {
                window.__dfUpkeepDrawInFlight = false;
                window.__dfUpkeepDrawSeat = null;
                try {
                    document.querySelectorAll(".hand-wrap.draw-pending, .ai-back.draw-pending, .hcard.draw-pending")
                        .forEach((el) => el.classList.remove("draw-pending"));
                } catch (e2) { /* */ }
                try { deps.updateUI?.(true); } catch (e3) { /* */ }
            }
        }

        /**
         * Vitória no MP só se o servidor disser winner != null.
         * Evita tela de vitória falsa após SYNC/TALENT cosmético no peer.
         */
        function dfOnlineCheckWinFromAuthority(envelope) {
            if (!window.__DF_ONLINE) {
                deps.checkWin();
                return;
            }
            const st = deps.getState();
            const auth = envelope?.authoritativeState;
            if (auth?.players?.length) {
                if (auth.winner != null) {
                    st.winner = auth.winner;
                    deps.checkWin({ fromAuthority: true });
                } else {
                    // Só desfaz vitória se a autoridade também não tiver ninguém
                    // na pontuação alvo — envelope atrasado não apaga o resultado.
                    const wp = auth.winPoints ?? st.winPoints ?? 15;
                    const someoneAtTarget = auth.players.some((sp) => (sp?.vp | 0) >= wp);
                    if (st.winner != null && !someoneAtTarget) {
                        st.winner = null;
                        try { deps.cancelWinOverlay?.(); } catch (e) { /* */ }
                    }
                }
                return;
            }
            if (st.winner != null) deps.checkWin({ fromAuthority: true });
        }

        /**
         * END_TURN remoto: estado já veio do servidor (manutenção/saque aplicados).
         * Só orquestra UI/timer/banner via startTurn — sem reaplicar regras de manutenção.
         * @param {{ skipReconcile?: boolean }} [opts]
         */
        async function dfOnlineHandleRemoteEndTurn(envelope, opts = {}) {
            if (deps.getState().winner != null) return;
            deps.stopTimer();
            // Sincronizar CP + deadline ANTES de awaits cosméticos (evita split-brain / timer 0).
            const authCpEarly = envelope?.authoritativeState?.currentPlayer;
            if (authCpEarly === 0 || authCpEarly === 1) {
                try { deps.getState().currentPlayer = authCpEarly | 0; } catch (e) { /* */ }
            }
            if (envelope?.turnDeadline) {
                window.__dfTurnDeadline = envelope.turnDeadline | 0;
            } else if (!(window.__dfTurnDeadline > Date.now())) {
                window.__dfTurnDeadline = Date.now() + 70000;
            }
            try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            // Aguarda summon peer em voo (timeout curto) — evita stompar _summoning.
            try {
                await Promise.race([
                    _dfPeerSummonGate,
                    deps.wait?.(1200) || new Promise((r) => setTimeout(r, 1200)),
                ]);
            } catch (e) { /* */ }
            // Limpa combate/fila travada — senão o peer fica com turno certo e relógio velho.
            try { dfOnlineAbortCombatVisuals?.(); } catch (e) { /* */ }
            dfOnlineResetPresentQueue();
            try {
                const st = deps.getState();
                if (st.activeTalent) st.activeTalent = null;
                const layer = document.getElementById("talent-spotlight-layer");
                layer?.replaceChildren?.();
                layer?.classList?.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
            } catch (e) { /* */ }
            try { deps.setApplyingRemote(false); } catch (e) { /* */ }
            window.__dfTurnEndingPending = false;
            const authCp = envelope?.authoritativeState?.currentPlayer;
            if (!opts.skipReconcile) {
                const authState = envelope?.authoritativeState;
                // Veneno explode ANTES do reconcile (cartas ainda no campo).
                try { await dfOnlinePlayPoisonKillsFromEvents(envelope?.events); } catch (ePk) { /* */ }
                // Armar hide da carta de upkeep ANTES do 1º paint pós-reconcile.
                try { dfOnlineArmUpkeepDrawIfNeeded(envelope?.events); } catch (eArm) { /* */ }
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                        if (window.__dfUpkeepDrawInFlight) {
                            dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
                        }
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                } else if (envelope?.snapshot?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                        deps.updateUI(true);
                        if (window.__dfUpkeepDrawInFlight) {
                            dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
                        }
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
            }
            // Saque livre: anima DEPOIS do banner de PV e do updateUI — peer e ator.
            const nextPre = (authCp === 0 || authCp === 1)
                ? (authCp | 0)
                : deps.getState().currentPlayer;
            try {
                if (typeof deps.showPassiveVpMaintMessage === "function" && (nextPre === 0 || nextPre === 1)) {
                    const tn = deps.getState()?.turnNumber | 0;
                    if (tn > 1) await deps.showPassiveVpMaintMessage(nextPre);
                }
            } catch (e) {
                console.warn("[DF online] passive VP banner", e);
            }
            // Banner pode ter disparado updateUI — re-esconde a carta do saque.
            if (window.__dfUpkeepDrawInFlight) {
                dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
            }
            let hadUpkeepDraw = false;
            try {
                hadUpkeepDraw = Array.isArray(envelope?.events)
                    && envelope.events.some((e) => e?.type === "DRAW" && e.reason === "upkeep");
                await dfOnlinePlayUpkeepDrawFromEvents(envelope?.events);
            } catch (e) {
                console.warn("[DF online] upkeep draw", e);
            }
            // Preferir CP do envelope — não reler após awaits (evita banner invertido).
            const next = (authCp === 0 || authCp === 1)
                ? (authCp | 0)
                : deps.getState().currentPlayer;
            if (next !== 0 && next !== 1) {
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (deps.getState().currentPlayer !== next) {
                try { deps.getState().currentPlayer = next; } catch (e) { /* */ }
            }
            // Crescimento / poder: força rebuild do campo + limpa drag stuck.
            try { window.__dfHandDrag = null; } catch (e) { /* */ }
            try { window.__dfResetQuadCache?.(); } catch (e) { /* */ }
            // Aplicar POWER_CHANGED dos events (auth pode ter power certo mas DOM stale).
            // MP: não replayar card_draw — já animado em dfOnlinePlayUpkeepDrawFromEvents.
            try {
                dfOnlineApplyPresentationFromEvents(envelope, {
                    authApplied: false,
                    skipVisualKinds: hadUpkeepDraw ? new Set(["card_draw"]) : null,
                });
            } catch (e) { /* */ }
            try { deps.updateUI?.(true); } catch (e) { /* */ }
            // Deadline do servidor (se veio no envelope / room).
            if (envelope?.turnDeadline) {
                window.__dfTurnDeadline = envelope.turnDeadline | 0;
            } else {
                window.__dfTurnDeadline = Date.now() + 70000;
            }
            const endSeq = envelope?.seq != null ? (envelope.seq | 0) : null;
            if (endSeq != null) window.__dfLastEndTurnStartSeq = endSeq;
            window.__dfOnlineSkipMaintRules = true;
            try {
                await deps.startTurn(next);
            } finally {
                window.__dfOnlineSkipMaintRules = false;
            }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            dfOnlineCheckWinFromAuthority(envelope);
        }

        async function dfOnlineRollbackToServer() {
            try {
                const res = await dfNet?.getReplay?.(0);
                if (res?.ok && (res.gameState || res.snapshot)) {
                    // Silent reconcile mid-match — sem toast / sem startTurn extra.
                    await dfOnlineApplyReplaySync(res, { forceToast: false });
                    return true;
                }
                if (res?.authoritativeState?.players?.length) {
                    dfOnlineReconcileSnapshot(
                        { state: res.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                    return true;
                }
            } catch (e) {
                console.warn("[DF online] rollback", e);
            }
            return false;
        }

        function dfOnlineApplyFullSnapshot(snap) {
            if (!snap || !window.DfState) return;
            DfState.applySnapshot(deps.getState(), snap, { full: true });
            const ph = snap.phase || {};
            deps.setGamePhase( ph.gamePhase || "normal");
            deps.setTargetData( ph.targetData || {});
            deps.setPendingSummon( ph.pendingSummon || null);
        }

        function dfOnlineIsLocalPickPhase() {
            return window.__DF_ONLINE && !deps.getApplyingRemote() && deps.dfIsMyTurn()
                && DF_ONLINE_PICK_PHASES.has(deps.getGamePhase());
        }

        function dfOnlinePublishTalentStart(handIdx, extra = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) {
                return Promise.resolve({ ok: true, local: true });
            }
            _dfMpTalentCommitted = false;
            const seat = deps.dfLocalSeat();
            const card = extra.card || deps.getState().players[seat]?.hand?.[handIdx | 0];
            return dfOnlineSendActionAwait({
                type: "TALENT_START",
                handIdx: handIdx | 0,
                cardName: card?.name || null,
                uid: card?.uid || null,
                ability: extra.ability
                    || deps.getTargetData()?.ability
                    || card?.talentEffect
                    || deps.getState().activeTalent?.card?.talentEffect
                    || null,
                anim: {
                    kind: "talent_cast",
                    cardName: card?.name || null,
                    talentEffect: card?.talentEffect || null,
                    ownerP: seat,
                },
            }, { noSnap: true }).then((ack) => {
                if (ack?.authoritativeState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: ack.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                return ack;
            }).catch((e) => {
                console.warn("[DF online] TALENT_START", e);
                return { ok: false, error: e?.message || "TALENT_START_FAILED" };
            });
        }

        /**
         * Limpa activeTalent no servidor (pós-resolve). Sem reaplicar efeito.
         */
        function dfOnlinePublishTalentDiscard(ownerP, card) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) {
                return Promise.resolve({ ok: true, local: true });
            }
            _dfMpTalentCommitted = true;
            return dfOnlineSendActionAwait({
                type: "TALENT_DISCARD",
                playerId: ownerP | 0,
                cardName: card?.name || null,
                uid: card?.uid || null,
                talentEffect: card?.talentEffect || null,
            }, { noSnap: true }).then((ack) => {
                if (ack?.authoritativeState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: ack.authoritativeState, full: true },
                            { skipPhase: true, clearOrphanTalent: true },
                        );
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                return ack;
            }).catch((e) => {
                console.warn("[DF online] TALENT_DISCARD", e);
                return { ok: false, error: e?.message || "TALENT_DISCARD_FAILED" };
            });
        }

        /**
         * Commit autoritativo de status (veneno, barreira, gelo…) + VFX opcional.
         */
        async function dfOnlineCommitStatus(targetP, targetI, opts = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return { ok: true, local: true };
            const card = deps.getState().players[targetP]?.field?.[targetI];
            if (!card) return { ok: false, error: "NO_TARGET" };
            const statusPatch = dfOnlineStatusFieldPatch(targetP, targetI, card);
            if (opts.broadcast !== false) {
                dfOnlineBroadcastVisual({
                    kind: opts.kind || "status_sync",
                    ...(opts.anim || {}),
                    fieldPatches: [statusPatch],
                });
            }
            if (!dfNet?.connected) return { ok: false, error: "NOT_CONNECTED" };
            const flags = { ...statusPatch };
            delete flags.targetP;
            delete flags.targetI;
            return dfOnlineCommitMutations(
                [{ op: "setStatus", targetP, targetI, flags }],
                opts,
            );
        }

        /**
         * Um único FIELD_COMMIT com N mutations + um reconcile (evita clobber
         * entre commits sequenciais — Barreira multi-alvo, Devorar, etc.).
         */
        async function dfOnlineCommitMutations(mutations, opts = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return { ok: true, local: true };
            if (!Array.isArray(mutations) || !mutations.length) return { ok: false, error: "NO_MUTATIONS" };
            if (!dfNet?.connected) return { ok: false, error: "NOT_CONNECTED" };
            const ack = await dfOnlineSendActionAwait({
                type: "FIELD_COMMIT",
                mutations,
            }, { noSnap: true });
            if (!ack || ack.ok === false) return ack || { ok: false };
            if (opts.reconcile !== false && ack.authoritativeState?.players?.length) {
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(
                        { state: ack.authoritativeState, full: true },
                        { skipPhase: true, ...(opts.reconcileOpts || {}) },
                    );
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
            }
            return ack;
        }

        function dfOnlineQueueRemoteVisual(anim) {
            if (!anim?.kind) return;
            const group = _dfPresenter
                ? _dfPresenter.groupForVisual(anim.kind, anim.parallelGroup)
                : (DF_PARALLEL_VISUAL_KINDS.has(anim.kind) ? "fx" : "board");
            const timeout = group === "fx"
                ? (_dfPresenter?.resolveFxTimeout?.(anim.kind)
                    ?? ( _dfPresenter?.LONG_FX_KINDS?.has?.(anim.kind)
                        ? (_dfPresenter?.FX_TIMEOUT_BUFF_MS || 6500)
                        : (_dfPresenter?.FX_TIMEOUT_MS || 2500)))
                : (_dfPresenter?.resolveBoardTimeout?.()
                    ?? (_dfPresenter?.BOARD_TIMEOUT_MS || 4000));
            if (_dfPresenter) {
                return _dfPresenter.enqueue(group, () => dfOnlineReplayAnim(anim), timeout, { kind: anim.kind });
            }
            _dfVisualQ = _dfVisualQ.then(async () => {
                await dfOnlineReplayAnim(anim);
            }).catch((e) => console.warn("[DF online] visual", e));
            return _dfVisualQ;
        }

        const DF_PRESENT_TIMEOUT_MS = 4000;

        function dfOnlineEnqueuePresent(fn, group = "board", meta) {
            const kind = meta && meta.kind;
            const timeout = group === "fx"
                ? (_dfPresenter?.resolveFxTimeout?.(kind)
                    ?? (_dfPresenter?.FX_TIMEOUT_MS || 2500))
                : (_dfPresenter?.resolveBoardTimeout?.()
                    ?? (_dfPresenter?.BOARD_TIMEOUT_MS || DF_PRESENT_TIMEOUT_MS));
            if (_dfPresenter) {
                return _dfPresenter.enqueue(group, fn, timeout, meta || { kind });
            }
            _dfVisualQ = _dfVisualQ
                .then(() => Promise.race([
                    Promise.resolve().then(fn),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error("PRESENT_TIMEOUT")), timeout);
                    }),
                ]))
                .catch((e) => console.warn("[DF online] present", e));
            return _dfVisualQ;
        }

        /** Destrava a fila visual (END_TURN / falha crítica). */
        let _dfPresentGen = 0;
        function dfOnlineClearSummoningFlags() {
            try {
                const players = deps.getState()?.players;
                if (!players) return;
                for (const p of players) {
                    const field = p?.field;
                    if (!Array.isArray(field)) continue;
                    for (const c of field) {
                        if (c && c._summoning) delete c._summoning;
                    }
                }
            } catch (e) { /* */ }
        }
        /**
         * Varre o DOM removendo `is-summoning` órfão (MP apenas).
         *
         * `patchFieldCardDom` mantém um slot oculto se a CLASSE existir, mesmo
         * quando o estado já limpou `_summoning`. Uma animação de invocação que
         * termine cedo (DOM ainda não montado, timeout do apresentador, exceção)
         * deixava a classe presa e o campeão invisível de forma permanente para
         * o adversário. Só limpa slots cujo estado NÃO está mais invocando, então
         * nunca revela uma animação em andamento.
         */
        function dfOnlineSweepOrphanSummoningDom() {
            if (!window.__DF_ONLINE) return;
            try {
                const players = deps.getState()?.players;
                if (!players) return;
                for (let p = 0; p < players.length; p++) {
                    const field = players[p]?.field;
                    if (!Array.isArray(field)) continue;
                    for (let i = 0; i < field.length; i++) {
                        const c = field[i];
                        if (!c || c._summoning) continue;
                        const el = typeof deps.getChampionDom === "function"
                            ? deps.getChampionDom(p, i)
                            : null;
                        if (!el) continue;
                        if (!el.classList.contains("is-summoning")
                            && el.style.visibility !== "hidden") continue;
                        el.classList.remove("is-summoning");
                        el.style.removeProperty("visibility");
                        el.style.removeProperty("opacity");
                    }
                }
            } catch (e) { /* */ }
        }

        function dfOnlineResetPresentQueue() {
            _dfPresentGen = (_dfPresentGen + 1) | 0;
            _dfVisualQ = Promise.resolve();
            try { _dfPresenter?.reset(); } catch (e) { /* */ }
            dfOnlineClearSummoningFlags();
            try { deps.updateUI?.(true); } catch (e) { /* */ }
            dfOnlineSweepOrphanSummoningDom();
        }

        /** Marca carta invocada como _summoning no estado ANTES do primeiro paint. */
        function dfOnlineMarkSummoningInState(state, fromSeat, action) {
            if (!state?.players?.[fromSeat]?.field) return null;
            const field = state.players[fromSeat].field;
            let insertIdx = action?.insertIdx;
            if (insertIdx == null || insertIdx < 0 || insertIdx >= field.length) {
                if (action?.cardName) {
                    insertIdx = field.findIndex((c) => c?.name === action.cardName && !c._summoning);
                }
                if (insertIdx == null || insertIdx < 0) insertIdx = field.length - 1;
            }
            insertIdx = Math.max(0, Math.min(insertIdx, field.length - 1));
            const card = field[insertIdx];
            if (card) card._summoning = true;
            return insertIdx;
        }

        /** Tokens de dragão (ult/habilidade): ocultar até animateDragonSummon (MP). */
        function dfOnlineMarkDragonTokensFromEvents(state, events) {
            if (!state?.players || !events?.length) return [];
            const marked = [];
            for (const e of events) {
                if (!e) continue;
                if (e.type !== "DRAGON_TOKEN_SUMMON" && e.type !== "TOKEN_INSERT"
                    && e.visual !== "dragon_token_summon") continue;
                const op = e.ownerP ?? e.casterIdx ?? e.playerId;
                if (op == null) continue;
                const field = state.players[op]?.field;
                if (!field?.length) continue;
                let idx = e.insertIdx != null ? (e.insertIdx | 0)
                    : (e.fieldIdx != null ? (e.fieldIdx | 0) : -1);
                if (e.uid) {
                    const byUid = field.findIndex((c) => c && String(c.uid) === String(e.uid));
                    if (byUid >= 0) idx = byUid;
                }
                if (idx < 0 || idx >= field.length) idx = field.length - 1;
                if (field[idx]) {
                    field[idx]._summoning = true;
                    marked.push({ ownerP: op | 0, idx });
                }
            }
            return marked;
        }

        async function dfOnlineAnimateMarkedDragonTokens(marked) {
            if (!marked?.length || typeof deps.animateDragonSummon !== "function") return;
            for (const m of marked) {
                try { await deps.animateDragonSummon(m.ownerP, m.idx); } catch (e) { /* */ }
                try {
                    const c = deps.getState()?.players?.[m.ownerP]?.field?.[m.idx];
                    if (c) delete c._summoning;
                } catch (e2) { /* */ }
            }
            try { deps.updateUI?.(true); } catch (e3) { /* */ }
            // O dragão precisa acabar VISÍVEL mesmo que o emerge tenha falhado.
            dfOnlineSweepOrphanSummoningDom();
        }
        try {
            window.dfOnlineMarkDragonTokensFromEvents = dfOnlineMarkDragonTokensFromEvents;
            window.dfOnlineAnimateMarkedDragonTokens = dfOnlineAnimateMarkedDragonTokens;
            window.dfOnlineArmUpkeepDrawIfNeeded = dfOnlineArmUpkeepDrawIfNeeded;
            window.dfOnlinePlayPoisonKillsFromEvents = dfOnlinePlayPoisonKillsFromEvents;
            window.dfOnlineMarkUpkeepDrawPending = dfOnlineMarkUpkeepDrawPending;
            window.dfOnlineCaptureRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits;
        } catch (e) { /* */ }

        /**
         * Apresentação remota serial: VFX e estado na ordem correta.
         * Gated: só peer (fromSeat !== local).
         */
        async function dfOnlinePresentRemote(envelope) {
            if (!envelope) return;
            const act = envelope.action;
            const actType = act?.type;
            const seq = envelope.seq != null ? envelope.seq : 0;

            if (actType === "PLAY_VISUAL" && act?.anim?.kind) {
                if (act.anim.fieldPatches?.length) {
                    _dfLastVisualPatchAt = Date.now();
                    _dfLastVisualSeq = Math.max(_dfLastVisualSeq, seq);
                }
                await dfOnlineReplayAnim(act.anim);
                return;
            }
            if (actType === "PRESENT" && act?.anim?.kind) {
                if (act.anim.fieldPatches?.length) {
                    _dfLastVisualPatchAt = Date.now();
                    _dfLastVisualSeq = Math.max(_dfLastVisualSeq, seq);
                }
                await dfOnlineReplayAnim(act.anim);
                return;
            }

            if (actType === "SUMMON" && act) {
                const presentGen = _dfPresentGen;
                const authState = envelope.authoritativeState;
                const snapState = envelope.snapshot?.state || envelope.snapshot;
                const stateSrc = authState?.players?.length ? authState
                    : (snapState?.players?.length ? snapState : null);
                let aborted = false;
                // Snaps de Raio Duplo enquanto as vítimas ainda estão no DOM.
                try {
                    window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                        envelope.events || [],
                    );
                } catch (eRaio) { window.__dfRaioDuploPreHits = null; }
                deps.setApplyingRemote(true);
                try {
                    if (stateSrc) {
                        const clone = JSON.parse(JSON.stringify(stateSrc));
                        dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                        // Grito de Guerra: esconder fúria até o burst (auth já veio com fury).
                        try {
                            const grito = (envelope.events || []).find((e) => e?.type === "GRITO_DE_GUERRA");
                            for (const t of grito?.applied || []) {
                                const card = clone.players?.[t.p]?.field?.[t.i];
                                if (!card) continue;
                                card.fury = false;
                                card.furyStacks = 0;
                                if (card.statuses) {
                                    try { delete card.statuses.fury; } catch (e) { /* */ }
                                }
                            }
                        } catch (e) { /* */ }
                        // Invocar Dragão: marcar Filhote _summoning até animateDragonSummon.
                        try {
                            const tokEv = (envelope.events || []).find((e) =>
                                e?.type === "TOKEN_INSERT"
                                || e?.type === "DRAGON_TOKEN_SUMMON"
                                || e?.visual === "dragon_token_summon");
                            if (tokEv) {
                                const op = tokEv.ownerP ?? tokEv.casterIdx ?? envelope.fromSeat;
                                const field = clone.players?.[op]?.field;
                                if (field?.length) {
                                    const idx = tokEv.insertIdx != null
                                        ? (tokEv.insertIdx | 0)
                                        : field.length - 1;
                                    if (field[idx]) field[idx]._summoning = true;
                                }
                            }
                        } catch (e) { /* */ }
                        dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                        // _summoning já no state — updateUI esconde a carta no slot.
                        deps.updateUI();
                    }
                } finally {
                    deps.setApplyingRemote(false);
                }
                try {
                    if (presentGen !== _dfPresentGen) {
                        aborted = true;
                        return;
                    }
                    _dfPeerSummonUntil = Date.now() + 2800;
                    _dfPeerSummonGate = (async () => {
                        await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                    })();
                    try { await _dfPeerSummonGate; } catch (e) { /* */ }
                    if (presentGen !== _dfPresentGen) {
                        aborted = true;
                        return;
                    }
                    // On-enter já resolvido no servidor — replay VFX (Roubar, Maldição, etc.).
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, {
                            skipKinds: new Set(["summon", "land_impact"]),
                            authApplied: true,
                        });
                    } catch (e) { /* */ }
                    try { window.__dfRaioDuploPreHits = null; } catch (eClr) { /* */ }
                } finally {
                    // Sempre limpa _summoning — mesmo se END_TURN abortou o presentGen.
                    dfOnlineClearSummoningFlags();
                    try {
                        document.querySelectorAll(".ccard.combat-src-hidden, .ccard.field-drag-src").forEach((el) => {
                            el.classList.remove("combat-src-hidden", "field-drag-src");
                            if (el.style.visibility === "hidden") el.style.visibility = "";
                            if (el.style.opacity === "0") el.style.opacity = "";
                        });
                    } catch (eVis) { /* */ }
                    try { deps.updateUI?.(true); } catch (e) { /* */ }
                    // Campo peer: se auth tem carta e DOM ficou vazio, força rebuild.
                    try {
                        dfOnlineEnsurePeerFieldVisible(envelope.fromSeat, authState || stateSrc);
                    } catch (eField) { /* */ }
                    if (aborted) {
                        _dfPeerSummonGate = Promise.resolve();
                        _dfPeerSummonUntil = 0;
                    }
                    // Prefetch texturas do campo (combate peer mais rápido).
                    try {
                        const players = deps.getState()?.players || [];
                        for (const pl of players) {
                            (pl?.field || []).forEach((c) => {
                                if (c?.name) window.dfPrefetchCardArt?.(c.name);
                            });
                        }
                    } catch (e4) { /* */ }
                }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "SYNC_STATE") {
                // Cosmético: nunca clobber board com authoritativeState stale.
                const skipAuth = true;
                const pe = envelope.presentationEnvelope;
                if (pe?.fieldPatches?.length) {
                    dfOnlineApplyFieldPatches(pe.fieldPatches);
                    deps.updateUI();
                }
                if (pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) await dfOnlineReplayAnim(vis);
                    }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim(act.anim);
                }
                void skipAuth;
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "FIELD_COMMIT") {
                // after_vfx: VFX → fieldPatches/auth → UI (não vazar status antes do FX).
                const authState = envelope.authoritativeState;
                const pe = envelope.presentationEnvelope;
                const defer = !!(pe?.applyPolicy === "after_vfx" || pe?.deferBoardApply);
                if (defer && pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) {
                            try {
                                await dfOnlineReplayAnim({ ...vis, fieldPatches: null, _authApplied: false });
                            } catch (e) { /* */ }
                        }
                    }
                    deps.setApplyingRemote(true);
                    try {
                        if (authState?.players?.length) {
                            dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        } else if (pe?.fieldPatches?.length) {
                            dfOnlineApplyFieldPatches(pe.fieldPatches);
                        }
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                    return;
                }
                // with_vfx / sem envelope: auth primeiro (compat).
                deps.setApplyingRemote(true);
                try {
                    if (authState?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI();
                    } else if (pe?.fieldPatches?.length) {
                        dfOnlineApplyFieldPatches(pe.fieldPatches);
                        deps.updateUI();
                    }
                } finally {
                    deps.setApplyingRemote(false);
                }
                if (pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) await dfOnlineReplayAnim({ ...vis, fieldPatches: null });
                    }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim({ ...act.anim, fieldPatches: null });
                }
                dfOnlineApplyPresentationFromEvents(envelope, { authApplied: !!authState?.players?.length });
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "ATTACK_RESOLVE") {
                const pe = envelope.presentationEnvelope;
                // Preferir anim da action; senão envelope do motor (COMBAT / COMBAT_BLOCKED).
                let anim = act?.anim;
                if (!anim?.kind && Array.isArray(pe?.visuals)) {
                    anim = pe.visuals.find((v) => v && (v.kind === "combat" || v.kind === "blocked_attack"))
                        || null;
                }
                const authState = envelope.authoritativeState;
                const blocked = !!(act?.blocked || envelope.blocked || anim?.kind === "blocked_attack");
                const telKey = anim?.kind === "combat"
                    ? `${anim.attOwner}:${anim.attIdx}>${anim.defOwner}:${anim.defIdx}`
                    : (act?.attOwner != null
                        ? `${act.attOwner ?? act.attackerIdx}:${act.attackerIdx}>${act.defenderPlayerId}:${act.defenderIdx}`
                        : null);
                const telegraphBusy = !!window.__dfCombatTelegraphStarted
                    && (!telKey || window.__dfCombatTelegraphKey === telKey);

                if (blocked) {
                    try { await window.__dfCombatTelegraphPromise; } catch (e) { /* */ }
                    dfOnlineAbortCombatVisuals();
                    try {
                        deps.dfCombatForceCleanup?.({
                            attOwner: anim?.attOwner ?? act?.attOwner,
                            attIdx: anim?.attIdx ?? act?.attackerIdx,
                            defOwner: anim?.defOwner ?? act?.defenderPlayerId,
                            defIdx: anim?.defIdx ?? act?.defenderIdx,
                        });
                    } catch (e) { /* */ }
                    // VFX blocked_attack antes do auth (quando ainda não veio via PRESENT).
                    try {
                        const blockVis = (anim?.kind === "blocked_attack" ? anim : null)
                            || pe?.visuals?.find((v) => v?.kind === "blocked_attack")
                            || {
                                kind: "blocked_attack",
                                defOwner: act?.defenderPlayerId,
                                defIdx: act?.defenderIdx,
                                attOwner: act?.attOwner ?? act?.attackerIdx,
                                attIdx: act?.attackerIdx,
                            };
                        await dfOnlineReplayAnim({ ...blockVis, fieldPatches: null });
                    } catch (e) { /* */ }
                    deps.setApplyingRemote(true);
                    try {
                        if (authState?.players?.length) {
                            dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        }
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    window.__dfCombatTelegraphStarted = false;
                    window.__dfCombatTelegraphPromise = null;
                    window.__dfCombatTelegraphKey = null;
                    window.__dfCombatActive = null;
                    dfOnlineFlushDeferredReconcile();
                    dfOnlineCheckWinFromAuthority(envelope);
                    return;
                }

                // Tell curto do telegraph — não pula a cinemática real.
                if (telegraphBusy && window.__dfCombatTelegraphPromise) {
                    try { await window.__dfCombatTelegraphPromise; } catch (e) { /* */ }
                }

                let combatPreSnap = null;
                if (anim?.kind === "combat" && anim.attOwner != null && anim.defOwner != null) {
                    combatPreSnap = {
                        att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx) || null,
                        def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx) || null,
                    };
                    window.__dfCombatActive = {
                        attOwner: anim.attOwner,
                        attIdx: anim.attIdx,
                        defOwner: anim.defOwner,
                        defIdx: anim.defIdx,
                        uids: dfCombatPairUids(anim),
                    };
                    if (combatPreSnap) window.__dfCombatPreSnap = combatPreSnap;
                }

                const preField = deps.captureFieldForPostDestroy?.();

                // VFX primeiro (ghosts); autoridade depois — evita sumiço mid-anim.
                if (anim?.kind === "combat") {
                    // Peer sync rápido só com backlog extremo (não cortar combate em 3G “normal”).
                    try {
                        const tel = _dfPresenter?.getTelemetry?.() || {};
                        const skew = tel.presentSkewMs || 0;
                        const wait = tel.queueWaitMs || 0;
                        const budget = window.__dfPresentBudgetMs || 4500;
                        window.__dfMpPeerCombatFast = !!(wait > 2500 && skew > budget * 1.5);
                    } catch (e) {
                        window.__dfMpPeerCombatFast = false;
                    }
                    try {
                        await dfOnlineReplayAnim({ ...anim, fieldPatches: null, _authApplied: false });
                    } finally {
                        window.__dfMpPeerCombatFast = false;
                    }
                } else {
                    dfOnlineAbortCombatVisuals();
                }

                deps.setApplyingRemote(true);
                try {
                    if (authState?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                    } else if (pe?.fieldPatches?.length) {
                        dfOnlineApplyFieldPatches(pe.fieldPatches);
                    }
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }

                const attOwner = anim?.attOwner ?? act?.attOwner ?? null;
                const attIdx = anim?.attIdx ?? act?.attackerIdx ?? null;
                const defOwner = anim?.defOwner ?? act?.defenderPlayerId ?? null;
                const defIdx = anim?.defIdx ?? act?.defenderIdx ?? null;
                const killA = !!(anim?.killA ?? act?.killA);
                const killD = !!(anim?.killD ?? act?.killD);
                if (!killA && attOwner != null && attIdx != null) {
                    dfOnlineApplyFieldPatches([{
                        targetP: attOwner,
                        targetI: attIdx,
                        tapped: true,
                        freeAttack: false,
                    }]);
                }
                try {
                    deps.dfCombatForceCleanup?.({
                        attOwner, attIdx, defOwner, defIdx, killA, killD,
                    });
                } catch (e) { /* */ }
                deps.updateUI(true);
                if (preField) {
                    try {
                        // visualOnly: onDestroy autoritativo já veio no authState;
                        // Vingança/explosões: só VFX via replayOnDestroyBurstVisual.
                        deps.replayPostDestroyAfterAuthority?.(preField, { visualOnly: true });
                    } catch (e) { /* */ }
                }
                window.__dfCombatTelegraphStarted = false;
                window.__dfCombatTelegraphPromise = null;
                window.__dfCombatTelegraphKey = null;
                window.__dfCombatActive = null;
                dfOnlineFlushDeferredReconcile();
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "DRAW_CARD") {
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                // Peer: updateUI já rodou — anima compra (mão/DOM prontos).
                const pid = act?.playerId ?? envelope.fromSeat;
                if ((pid === 0 || pid === 1) && typeof deps.drawAnimToPlayer === "function") {
                    try {
                        deps.updateUI?.(true);
                        // rAF: garante nós da mão no DOM antes do fly.
                        await new Promise((r) => requestAnimationFrame(() => r()));
                        deps.drawAnimToPlayer(pid);
                        if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
                    } catch (e) {
                        console.warn("[DF online] DRAW_CARD anim", e);
                    }
                } else if (act?.anim?.kind === "card_draw") {
                    await dfOnlineReplayAnim(act.anim);
                }
                return;
            }
            if (actType === "TALENT_START") {
                _dfMpTalentCommitted = false;
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                return;
            }
            if (actType === "TALENT_DISCARD") {
                _dfMpTalentCommitted = true;
                const discardOwner = act?.ownerP ?? envelope.fromSeat ?? null;
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                dfOnlinePurgeTalentSpotlight(discardOwner);
                return;
            }
            if (actType === "ABILITY_TARGET") {
                // VFX primeiro (Devorar/Incendiar/Imitar) — auth depois, senão presa some.
                const pe = envelope.presentationEnvelope;
                const hasVisuals = !!(pe?.visuals?.length || act?.anim?.kind
                    || (envelope.events || []).some((e) => e?.visual || e?.type === "DEVOUR"
                        || e?.type === "INCENDIAR" || e?.type === "IMITAR"));
                if (hasVisuals) {
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, { authApplied: false });
                    } catch (e) {
                        console.warn("[DF online] ABILITY_TARGET present", e);
                    }
                }
                const authState = envelope.authoritativeState;
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            // Fallback: autoridade genérica
            await dfOnlineApplyAuthoritativeStateAsync(envelope);
        }

        async function dfOnlineApplyAuthoritativeStateAsync(envelope) {
            const act = envelope.action;
            const actType = act?.type;
            const authState = envelope.authoritativeState;
            if (authState?.players?.length) {
                deps.setApplyingRemote(true);
                try {
                    if (actType === "SUMMON" && act) {
                        const clone = JSON.parse(JSON.stringify(authState));
                        dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                        dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                    } else {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                    }
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                if (Array.isArray(envelope.events) && envelope.events.length) {
                    window.__DF_MATCH_EVENT_LOG = window.__DF_MATCH_EVENT_LOG || [];
                    window.__DF_MATCH_EVENT_LOG.push({
                        seq: envelope.seq,
                        seat: envelope.fromSeat,
                        action: act,
                        events: envelope.events,
                    });
                }
                if (actType === "SUMMON" && act) {
                    try {
                        window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                            envelope.events || [],
                        );
                    } catch (eRaio2) { /* */ }
                    _dfPeerSummonUntil = Date.now() + 2800;
                    _dfPeerSummonGate = (async () => {
                        await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                    })();
                    try { await _dfPeerSummonGate; } catch (e) { /* */ }
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, {
                            skipKinds: new Set(["summon", "land_impact"]),
                            authApplied: true,
                        });
                    } catch (e) { /* */ }
                    try { window.__dfRaioDuploPreHits = null; } catch (eClr2) { /* */ }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim(act.anim);
                }
                // DRAW_CARD pago: peer anima via PLAY_VISUAL card_draw (não aqui).
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (actType === "SUMMON" && act && envelope.snapshot?.players?.length) {
                try {
                    window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                        envelope.events || [],
                    );
                } catch (eRaio3) { /* */ }
                deps.setApplyingRemote(true);
                try {
                    const raw = envelope.snapshot.state || envelope.snapshot;
                    const clone = JSON.parse(JSON.stringify(raw));
                    dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                    dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                _dfPeerSummonUntil = Date.now() + 2800;
                _dfPeerSummonGate = (async () => {
                    await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                })();
                try { await _dfPeerSummonGate; } catch (e) { /* */ }
                try {
                    await dfOnlineReplayPresentationEnvelope(envelope, {
                        skipKinds: new Set(["summon", "land_impact"]),
                        authApplied: true,
                    });
                } catch (e) { /* */ }
                try { window.__dfRaioDuploPreHits = null; } catch (eClr3) { /* */ }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (dfOnlineShouldApplySnapshot(envelope)) {
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
            }
            if (act?.anim?.kind) await dfOnlineReplayAnim(act.anim);
            dfOnlineCheckWinFromAuthority(envelope);
        }

        function dfOnlineApplyAuthoritativeState(envelope) {
            // Sync path: enfileira apresentação (não bloqueia o caller síncrono).
            void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope));
        }

        function dfOnlineApplyAttackResolve(envelope) {
            // Prioridade: combate não fica atrás de summon/on-enter longos.
            void dfOnlinePresentRemote({
                ...envelope,
                action: { ...(envelope.action || {}), type: "ATTACK_RESOLVE" },
            }).catch((e) => console.warn("[DF online] ATTACK_RESOLVE present", e));
        }

        function dfOnlineUnwrapReplayState(replay) {
            if (!replay) return null;
            if (replay.gameState?.players?.length) return replay.gameState;
            if (replay.snapshot?.state?.players?.length) return replay.snapshot.state;
            if (replay.snapshot?.players?.length) return replay.snapshot;
            return null;
        }

        function dfOnlineUnwrapSnap(snap) {
            if (!snap) return null;
            if (snap.players?.length) return snap;
            if (snap.state?.players?.length) {
                return { ...snap.state, full: snap.full ?? true, phase: snap.phase };
            }
            return null;
        }

        function dfOnlineSyncTurnTimerFromPayload(payload) {
            if (!window.__DF_ONLINE || !payload) return;
            try {
                if (payload.serverNow != null || payload.serverTime != null) {
                    const serverNow = (payload.serverNow || payload.serverTime) | 0;
                    window.__dfServerClock = { serverNow, clientAt: Date.now() };
                    window.__dfServerNow = serverNow;
                }
                const deadline = payload.turnDeadline != null
                    ? (payload.turnDeadline | 0)
                    : (payload.state?.turnDeadline != null ? (payload.state.turnDeadline | 0) : 0);
                if (deadline > 0) window.__dfTurnDeadline = deadline;
                if (deps.getState()?.started && deps.getState()?.winner == null) {
                    deps.startTimer?.();
                }
            } catch (e) { /* */ }
        }

        function dfOnlineReconcileSnapshot(snap, opts = {}) {
            const unwrapped = dfOnlineUnwrapSnap(snap);
            if (!unwrapped?.players?.length || !window.DfState) return;
            // Durante combate no peer: não aplicar SYNC/END stale (revive).
            if (window.__dfCombatActive && opts.deferIfCombat) {
                window.__dfDeferredReconcile = { snap, opts };
                return;
            }
            // MP: defer full reconcile enquanto presenter/combate/scare estão vivos.
            if (window.__DF_ONLINE && !opts.forceAuthoritative && !opts.skipPresentBusyCheck
                && dfOnlinePresentationBusy()) {
                const prevSeq = window.__dfDeferredReconcile?.envelope?.seq
                    ?? window.__dfDeferredReconcile?.seq
                    ?? 0;
                const curSeq = opts.seq != null ? (opts.seq | 0) : (Date.now());
                if (!window.__dfDeferredReconcile || curSeq >= (prevSeq | 0)) {
                    window.__dfDeferredReconcile = { snap, opts, seq: curSeq, kind: "AUTH_BUSY" };
                }
                dfOnlineScheduleDeferredFlush();
                return;
            }
            // Pós-commit MP: não ressuscitar activeTalent órfão do servidor.
            if (window.__DF_ONLINE
                && (_dfMpTalentCommitted || opts.clearOrphanTalent)
                && !deps.getState().activeTalent
                && unwrapped.activeTalent
                && !dfOnlineIsLocalPickPhase()) {
                unwrapped.activeTalent = null;
            }
            // Mira de talento/ultimate: não restaurar se o commit já limpou activeTalent
            // (ex.: Explosão) — senão o destaque fica preso após o resolve.
            const protectLocal = !opts.forceAuthoritative
                && dfOnlineIsLocalPickPhase() && !opts.clearLocalPick;
            const saved = protectLocal ? {
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length
                    ? JSON.parse(JSON.stringify(deps.getTargetData())) : {},
                activeTalent: deps.getState().activeTalent
                    ? { ownerP: deps.getState().activeTalent.ownerP, card: { ...deps.getState().activeTalent.card } }
                    : null,
            } : null;
            const forceCp = opts.forceCurrentPlayer;
            // MP: proteger mão local durante/logo após saque livre (evita carta sumir).
            let savedLocalHand = null;
            const localSeat = typeof deps.dfLocalSeat === "function" ? deps.dfLocalSeat() : (window.__DF_SEAT | 0);
            if (window.__DF_ONLINE && !opts.forceAuthoritative && (localSeat === 0 || localSeat === 1)) {
                const localHand = deps.getState()?.players?.[localSeat]?.hand;
                const upkeepHot = !!window.__dfUpkeepDrawInFlight
                    || (window.__dfUpkeepDrawAt && (Date.now() - window.__dfUpkeepDrawAt) < 2500
                        && window.__dfUpkeepDrawSeat === localSeat);
                if (upkeepHot && Array.isArray(localHand) && localHand.length) {
                    savedLocalHand = localHand.map((c) => (c ? { ...c } : c));
                }
            }
            DfState.applySnapshot(deps.getState(), unwrapped, { full: !!unwrapped.full || !!snap?.full });
            if (forceCp === 0 || forceCp === 1) deps.getState().currentPlayer = forceCp;
            // Recusar downgrade de mão local pós-upkeep (snapshot stale).
            if (savedLocalHand && window.__DF_ONLINE) {
                try {
                    const pl = deps.getState()?.players?.[localSeat];
                    const incoming = pl?.hand;
                    if (Array.isArray(incoming) && incoming.length < savedLocalHand.length) {
                        pl.hand = savedLocalHand;
                    }
                } catch (e) { /* */ }
            } else if (window.__DF_ONLINE && (localSeat === 0 || localSeat === 1)) {
                try {
                    const pl = deps.getState()?.players?.[localSeat];
                    const prevLen = opts._prevLocalHandLen;
                    const upkeepRecent = window.__dfUpkeepDrawAt
                        && (Date.now() - window.__dfUpkeepDrawAt) < 4000
                        && window.__dfUpkeepDrawSeat === localSeat;
                    if (upkeepRecent && prevLen != null && Array.isArray(pl?.hand)
                        && pl.hand.length < prevLen) {
                        /* leave as-is if we didn't save — best effort already applied */
                    }
                } catch (e) { /* */ }
            }
            if (opts.clearLocalPick) {
                deps.setGamePhase("normal");
                deps.setTargetData({});
                try { deps.dfPurgeTargetingVisuals?.(); } catch (e) { /* */ }
            }
            if (protectLocal && saved) {
                // Mantém mira/talento local, mas NÃO descarta o estado do tabuleiro
                // (poder, mão, turno) — senão o peer fica dessincronizado.
                // Se o auth já removeu o talento ativo, não reaplicar mira fantasma.
                if (unwrapped.activeTalent == null && saved.gamePhase
                    && (saved.gamePhase === "target-champion" || saved.gamePhase === "target-ally")) {
                    deps.setGamePhase("normal");
                    deps.setTargetData({});
                    try { deps.dfPurgeTargetingVisuals?.(); } catch (e) { /* */ }
                    return;
                }
                deps.setGamePhase(saved.gamePhase);
                deps.setTargetData(saved.targetData);
                deps.getState().activeTalent = saved.activeTalent;
                return;
            }
            const ph = snap.phase || {};
            if (!opts.skipPhase && ph.gamePhase) {
                // Peer: nunca herdar mira/target do oponente (Rei Gelado / on-enter).
                if (deps.getApplyingRemote() && DF_ONLINE_PICK_PHASES.has(ph.gamePhase)) {
                    /* ignore pick phase from remote snapshot */
                } else if (deps.getApplyingRemote() && DF_ONLINE_LOCK_PHASES.has(ph.gamePhase)) {
                    if (deps.getGamePhase() === "menu" || DF_ONLINE_LOCK_PHASES.has(deps.getGamePhase())) {
                        deps.setGamePhase( "normal");
                    }
                } else {
                    deps.setGamePhase( ph.gamePhase);
                }
            }
            if (ph.targetData !== undefined) {
                if (deps.getApplyingRemote() && DF_ONLINE_PICK_PHASES.has(ph.gamePhase || "")) {
                    /* ignore remote targeting */
                } else {
                    deps.setTargetData( ph.targetData || {});
                }
            }
            if (ph.pendingSummon !== undefined) deps.setPendingSummon( ph.pendingSummon);
            // Mira local MP: re-sync levitate após reconcile (não stopAll → cartas pequeninas).
            try {
                if (DF_ONLINE_PICK_PHASES.has(deps.getGamePhase?.() || "")) {
                    window.DfTargetLevitate?.sync?.();
                }
            } catch (e) { /* */ }
        }

        /**
         * Patch de poder (ou remoção se ≤ 0) para PLAY_VISUAL — MP-only peer sync.
         * Espelha o padrão Bola de Fogo / Explosão.
         */
        function dfOnlinePatchPower(targetP, targetI, currentPower) {
            const pow = currentPower | 0;
            if (pow <= 0) return [{ targetP, targetI, removed: true }];
            return [{ targetP, targetI, currentPower: pow }];
        }

        /**
         * Snapshot de status de um campeão para fieldPatches (coroa no peer).
         * Só inclui chaves presentes / booleanas relevantes.
         */
        function dfOnlineStatusFieldPatch(targetP, targetI, card) {
            const c = card || {};
            const patch = { targetP, targetI };
            const boolKeys = [
                "frozen", "tapped", "freeAttack", "shielded", "shieldedPermanent",
                "barrier", "barrierPermanent", "vulnerable", "silenced", "poisoned",
                "fury", "pulled", "inspiracao", "mimico", "wallBuff", "guerraBuff",
                "foreverGrowth", "fireAura", "burning", "corruptedNoHonor", "furyBonusActive",
            ];
            for (const k of boolKeys) {
                if (c[k] != null) patch[k] = !!c[k];
            }
            const numKeys = [
                "frozenTurns", "shieldedTurns", "barrierTurns", "poisonTurns",
                "furyTurns", "furyStacks", "guerraBuffTurns", "burningTurns",
                "fireAuraTurns", "currentPower", "poisonedByP",
            ];
            for (const k of numKeys) {
                if (c[k] != null) patch[k] = c[k] | 0;
            }
            return patch;
        }

        /** Aplica patches de campo vindos de PLAY_VISUAL (poder/status/remoção). */
        function dfOnlineApplyFieldPatches(patches) {
            if (!Array.isArray(patches) || !patches.length) return;
            const st = deps.getState();
            let changed = false;
            // Remoções no mesmo campo: índice alto → baixo (evita shift).
            const ordered = patches.slice().sort((a, b) => {
                const ar = !!(a && a.removed);
                const br = !!(b && b.removed);
                if (ar !== br) return ar ? 1 : -1;
                if (ar && br) {
                    if ((a.targetP | 0) !== (b.targetP | 0)) return (a.targetP | 0) - (b.targetP | 0);
                    return (b.targetI | 0) - (a.targetI | 0);
                }
                return 0;
            });
            for (const patch of ordered) {
                if (!patch || patch.targetP == null) continue;
                const field = st.players[patch.targetP]?.field;
                if (!field) continue;
                if (patch.insert && patch.card) {
                    const idx = patch.targetI != null
                        ? Math.max(0, Math.min(patch.targetI | 0, field.length))
                        : field.length;
                    const card = { ...patch.card };
                    if (!card.uid) card.uid = `tok-${Date.now()}-${idx}`;
                    if (card.currentPower == null) card.currentPower = card.power ?? 0;
                    field.splice(idx, 0, card);
                    changed = true;
                    continue;
                }
                if (patch.targetI == null) continue;
                if (patch.removed) {
                    if (field[patch.targetI]) {
                        field.splice(patch.targetI, 1);
                        changed = true;
                    }
                    continue;
                }
                const c = field[patch.targetI];
                if (!c) continue;
                if (patch.currentPower != null && c.currentPower !== patch.currentPower) {
                    c.currentPower = patch.currentPower;
                    changed = true;
                }
                const assignBool = (key) => {
                    if (patch[key] != null) { c[key] = !!patch[key]; changed = true; }
                };
                const assignNum = (key) => {
                    if (patch[key] != null) { c[key] = patch[key] | 0; changed = true; }
                };
                const assignAny = (key) => {
                    if (Object.prototype.hasOwnProperty.call(patch, key)) {
                        c[key] = patch[key];
                        changed = true;
                    }
                };
                assignBool("frozen");
                assignNum("frozenTurns");
                assignBool("tapped");
                assignBool("freeAttack");
                assignBool("shielded");
                assignBool("shieldedPermanent");
                assignNum("shieldedTurns");
                assignBool("barrier");
                assignBool("barrierPermanent");
                assignNum("barrierTurns");
                assignBool("vulnerable");
                assignBool("silenced");
                assignBool("poisoned");
                assignNum("poisonTurns");
                assignNum("poisonedByP");
                assignBool("fury");
                assignBool("furyBonusActive");
                assignNum("furyTurns");
                assignNum("furyStacks");
                assignBool("pulled");
                assignBool("inspiracao");
                assignBool("mimico");
                assignBool("wallBuff");
                assignBool("guerraBuff");
                assignNum("guerraBuffTurns");
                assignBool("foreverGrowth");
                assignBool("fireAura");
                assignNum("fireAuraTurns");
                assignBool("burning");
                assignNum("burningTurns");
                assignBool("corruptedNoHonor");
                // Transformações (ex.: Ursificação) precisam sincronizar identidade completa.
                assignAny("name");
                assignAny("power");
                assignAny("basePower");
                assignAny("abilityType");
                assignAny("abilityName");
                assignAny("abilityDesc");
                assignAny("onEnter");
                assignAny("onDestroy");
                assignAny("talentEffect");
                assignAny("summonRitual");
                assignAny("constantEffect");
                assignAny("isToken");
                assignAny("hidden");
                assignAny("mimicAbilityName");
                assignAny("mimicAbilityDesc");
                assignAny("mimicOnEnter");
                assignAny("mimicOnDestroy");
                assignAny("mimicSourceName");
                assignAny("mimicConstantEffect");
                if (patch.vpCaster != null && st.players[patch.vpCaster]) {
                    st.players[patch.vpCaster].vp = patch.vpAfter ?? st.players[patch.vpCaster].vp;
                    changed = true;
                }
            }
            if (changed) deps.updateUI();
        }

        async function dfOnlineBroadcastUltimatePlay(pIdx, hero, targetP, targetI) {
            if (!window.__DF_ONLINE || !dfNet?.connected || deps.getApplyingRemote()) return null;
            try {
                const ackRes = await dfNet.sendAction({
                    type: "ULTIMATE_PLAY",
                    playerId: pIdx,
                    heroId: hero?.id || deps.getState().players[pIdx]?.heroId,
                    ultimateType: hero?.ultimateType,
                    targetP: targetP ?? null,
                    targetI: targetI ?? null,
                });
                if (ackRes?.ok === false) {
                    const err = String(ackRes.error || "");
                    if (err === "ULTIMATE_CANCELLED" || err === "ULTIMATE_CANCEL_PENDING") {
                        deps.floatText("Ultimate cancelada!", "info center", 2200);
                    } else {
                        deps.floatText("Ultimate rejeitada pelo servidor.", "warn center", 2200);
                    }
                    return ackRes;
                }
                // Não reconcilia aqui — o ator anima primeiro (estado pré-ACK), depois aplica.
                return ackRes;
            } catch (e) {
                console.warn("[DF online] ULTIMATE_PLAY", e);
                return null;
            }
        }

        async function dfOnlineReplayUltimate(action) {
            const run = async () => {
                await deps.ensureVfxReady();
                const pIdx = action.playerId;
                const hero = deps.getHeroDef(action.heroId) || deps.getState().players[pIdx]?.heroDef;
                if (!hero || action.ultimateType == null) return;
                const tp = action.targetP;
                const ti = action.targetI;
                const ut = action.ultimateType || hero.ultimateType;
                switch (ut) {
                    case "targetEnemy":
                        if (tp != null && ti != null) await deps.ultimateCinematicFireball(pIdx, tp, ti, hero);
                        break;
                    case "targetEnemyFreeze":
                        if (tp != null && ti != null) await deps.ultimateCinematicFreeze(pIdx, tp, ti, hero);
                        break;
                    case "targetAlly":
                        if (tp != null && ti != null) await deps.ultimateCinematicFortify(pIdx, tp, ti, hero);
                        break;
                    case "targetAllyFreeAttack":
                        if (tp != null && ti != null) await deps.ultimateCinematicCharge(pIdx, tp, ti, hero);
                        break;
                    case "targetAllyShield":
                        if (tp != null && ti != null) await deps.ultimateCinematicShield(pIdx, tp, ti, hero);
                        break;
                    case "drawCard":
                        if (window.__DF_ONLINE) {
                            try {
                                await window.DfVfxEngine?.ensureCinematicReady?.({
                                    waitFull: true,
                                    maxMs: 12000,
                                });
                            } catch (e) { /* */ }
                            try {
                                await deps.ensureVfxReady?.({ waitFull: true });
                            } catch (e2) { /* */ }
                        }
                        await deps.ultimateCinematicConjure(pIdx, hero);
                        break;
                    case "trickerySwap": {
                        const swapFromEvent = (action.swapEnemyP != null && action.swapEnemyI != null)
                            ? { p: action.swapEnemyP, i: action.swapEnemyI }
                            : null;
                        const swap = swapFromEvent || deps.pickTrickerySwapTarget(pIdx);
                        if (swap && tp != null && ti != null) {
                            await deps.ultimateCinematicTrickery(pIdx, tp, ti, swap.p, swap.i, hero);
                        }
                        break;
                    }
                    case "summonDragon":
                        await deps.ultimateCinematicBloodDragon(pIdx, hero);
                        break;
                    case "hook": {
                        const hookEv = (Array.isArray(action._events) ? action._events : [])
                            .find((e) => e?.type === "HOOK_STEAL");
                        const hp = tp ?? action.fromP ?? hookEv?.fromP;
                        const hi = ti ?? action.fromI ?? hookEv?.fromI;
                        if (hp != null && hi != null) await deps.ultimateCinematicHook(pIdx, hp, hi, hero);
                        break;
                    }
                    case "potion": {
                        if (tp == null || ti == null) break;
                        const evs = Array.isArray(action._events) ? action._events : [];
                        let potionOk = true;
                        if (evs.some((e) => e?.type === "POTION_FAIL")) potionOk = false;
                        else if (evs.some((e) => e?.type === "POTION_SUCCESS")) potionOk = true;
                        else if (typeof action.potionSuccess === "boolean") potionOk = action.potionSuccess;
                        else if (typeof action.success === "boolean") potionOk = action.success;
                        await deps.ultimateCinematicPotion(pIdx, tp, ti, hero, potionOk);
                        break;
                    }
                    case "vampirism": {
                        const allies = deps.getState().players[pIdx]?.field?.map((c, i) => i).filter((i) => {
                            const c = deps.getState().players[pIdx].field[i];
                            return c && deps.allyTargetCanGainPower(c);
                        }) || [];
                        const allyI = allies[0] ?? 0;
                        if (tp != null && ti != null) await deps.ultimateCinematicVampirism(pIdx, tp, ti, allyI, hero);
                        break;
                    }
                    case "banish":
                        if (tp != null && ti != null) await deps.ultimateCinematicBanish(pIdx, tp, ti, hero);
                        break;
                    case "thunderDiscard":
                        await deps.ultimateCinematicThunder(pIdx, hero);
                        if (typeof deps.animateThunderDiscardFromHand === "function") {
                            const discards = [];
                            const evs = Array.isArray(action._events) ? action._events : [];
                            for (const ev of evs) {
                                if (ev?.type !== "THUNDER_DISCARD") continue;
                                const ep = ev.playerId;
                                const cardName = typeof ev.card === "string" ? ev.card : ev.card?.name;
                                const hand = deps.getState().players[ep]?.hand || [];
                                let idx = hand.findIndex((c) => c && c.name === cardName);
                                if (idx < 0) idx = hand.length ? hand.length - 1 : -1;
                                if (ep != null && idx >= 0) discards.push({ ep, idx });
                            }
                            if (!discards.length) {
                                for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                    if (ep === pIdx) continue;
                                    const len = deps.getState().players[ep]?.hand?.length || 0;
                                    if (len > 0) discards.push({ ep, idx: len - 1 });
                                }
                            }
                            await deps.wait?.(140);
                            discards.sort((a, b) => b.idx - a.idx);
                            for (const d of discards) {
                                try {
                                    await deps.animateThunderDiscardFromHand(d.ep, d.idx);
                                } catch (e) { /* */ }
                            }
                        }
                        break;
                    case "wallProtect":
                        await deps.ultimateCinematicWall(pIdx, hero);
                        break;
                    case "poison":
                        if (tp != null && ti != null) await deps.ultimateCinematicPoison(pIdx, tp, ti, hero);
                        break;
                    case "infinitePower": {
                        // Pré-auth: foreverGrowth ainda não está no state — mirar aliados válidos.
                        const mightTargets = [];
                        const field = deps.getState().players[pIdx]?.field || [];
                        field.forEach((c, i) => {
                            if (!c) return;
                            if (c.foreverGrowth
                                || (typeof deps.allyTargetCanGainPower === "function"
                                    ? deps.allyTargetCanGainPower(c)
                                    : true)) {
                                mightTargets.push({ targetP: pIdx, targetI: i });
                            }
                        });
                        if (!mightTargets.length) {
                            field.forEach((_, i) => mightTargets.push({ targetP: pIdx, targetI: i }));
                        }
                        await deps.ultimateCinematicMight(pIdx, mightTargets, hero);
                        break;
                    }
                    case "scareReturn":
                        if (tp != null && ti != null) await deps.ultimateCinematicScare(pIdx, tp, ti, hero);
                        break;
                    case "cometStarfall":
                        await deps.ultimateCinematicComet(pIdx, hero);
                        break;
                    case "warOverpower":
                        await deps.ultimateCinematicWar(pIdx, hero);
                        break;
                    case "fireAndIce": {
                        // Baforada/gelo POR campeão (não só o 1º). Usa events do motor.
                        const evs = Array.isArray(action._events) ? action._events : [];
                        const freezeKeys = new Set();
                        const hits = [];
                        for (const ev of evs) {
                            if (ev?.type === "FREEZE" && (ev.source === "fireAndIce" || !ev.source)) {
                                const key = `${ev.targetP}|${ev.targetI}|${ev.uid || ""}`;
                                freezeKeys.add(`${ev.targetP}|${ev.uid || ev.targetI}`);
                                hits.push({
                                    kind: "freeze",
                                    p: ev.targetP,
                                    i: ev.targetI,
                                    uid: ev.uid || null,
                                });
                            }
                        }
                        for (const ev of evs) {
                            if (ev?.type === "FIRE_AND_ICE_BURN"
                                || (ev?.type === "DESTROY" && ev?.reason === "fireAndIce")
                                || (ev?.type === "CHAMPION_DESTROYED" && ev?.reason === "fireAndIce")) {
                                hits.push({
                                    kind: "burn",
                                    p: ev.targetP ?? ev.ownerIdx ?? ev.ownerP,
                                    i: ev.targetI ?? ev.fieldIdx,
                                    uid: ev.uid || null,
                                    destroyed: !!(ev.type === "DESTROY" || ev.type === "CHAMPION_DESTROYED"
                                        || ev.destroyed),
                                });
                            }
                        }
                        // Sem events de burn: qualquer inimigo não congelado = baforada (pré-auth).
                        if (!hits.some((h) => h.kind === "burn")) {
                            for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                if (ep === pIdx) continue;
                                (deps.getState().players[ep]?.field || []).forEach((c, i) => {
                                    if (!c) return;
                                    const k = `${ep}|${c.uid || i}`;
                                    const frozenHit = hits.some((h) =>
                                        h.kind === "freeze"
                                        && (h.uid ? h.uid === c.uid : (h.p === ep && h.i === i)));
                                    if (frozenHit || freezeKeys.has(k)) return;
                                    if (c.frozen && action._preAuth) return;
                                    hits.push({ kind: "burn", p: ep, i, uid: c.uid || null });
                                });
                            }
                        }
                        // Fallback total: um efeito por inimigo (gelo) se events vazios.
                        if (!hits.length) {
                            for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                if (ep === pIdx) continue;
                                (deps.getState().players[ep]?.field || []).forEach((c, i) => {
                                    if (c) hits.push({ kind: "freeze", p: ep, i, uid: c.uid || null });
                                });
                            }
                        }
                        hits.sort((a, b) => {
                            const elA = deps.getChampionDom?.(a.p, a.i);
                            const elB = deps.getChampionDom?.(b.p, b.i);
                            const xA = elA?.getBoundingClientRect?.()?.left ?? a.p * 1000 + a.i;
                            const xB = elB?.getBoundingClientRect?.()?.left ?? b.p * 1000 + b.i;
                            return xA - xB;
                        });
                        for (const hit of hits) {
                            if (hit.p == null || hit.i == null) continue;
                            if (hit.kind === "freeze") {
                                await deps.ultimateCinematicFireAndIceFreeze(pIdx, hit.p, hit.i, hero);
                            } else {
                                await deps.ultimateCinematicFireAndIceBurn(pIdx, hit.p, hit.i, hero);
                                if (global.__dfPendingDestroyVisual) {
                                    try {
                                        await global.__dfPendingDestroyVisual;
                                    } catch (e) { /* */ }
                                    global.__dfPendingDestroyVisual = null;
                                }
                            }
                        }
                        break;
                    }
                    case "resurrect": {
                        await deps.ensureVfxReady();
                        // Paladino manda targetI null — resolve do event SUMMON / slot revivido.
                        let reviveI = ti;
                        if (reviveI == null && Array.isArray(action._events)) {
                            const summ = action._events.find((e) =>
                                e?.type === "SUMMON"
                                || e?.type === "PALADINO_ULT"
                                || e?.type === "RESURRECT"
                                || e?.visual === "resurrect");
                            if (summ?.targetI != null) reviveI = summ.targetI;
                            else if (summ?.fieldIdx != null) reviveI = summ.fieldIdx;
                            else if (summ?.i != null) reviveI = summ.i;
                        }
                        if (reviveI == null) {
                            const field = deps.getState().players[pIdx]?.field || [];
                            reviveI = field.length ? field.length - 1 : null;
                        }
                        if (reviveI == null) break;
                        if (typeof deps.animateResurrectImpact === "function") {
                            await deps.animateResurrectImpact(pIdx, reviveI, hero);
                        } else if (window.DfUltimateDirector?.play) {
                            await window.DfUltimateDirector.play("resurrect", {
                                casterP: pIdx, targetP: pIdx, targetI: reviveI, hero,
                            });
                        } else if (window.DfSpriteVfx?.playUltimate) {
                            await window.DfSpriteVfx.playUltimate("resurrect", {
                                casterP: pIdx, targetP: pIdx, targetI: reviveI,
                            });
                        }
                        break;
                    }
                    default:
                        break;
                }
            };
            // MP: mesmo warm Pixi/GSAP do path offline (2ª+ Conjuração Eurávia).
            if (typeof deps.ultVfx === "function") {
                await deps.ultVfx(run);
            } else {
                await run();
            }
        }

        function dfOnlineShouldApplySnapshot(envelope) {
            if (!envelope?.snapshot?.players?.length) return false;
            const seq = envelope.seq;
            if (seq != null && seq <= _dfLastRemoteSeq) return false;
            if (seq != null) _dfLastRemoteSeq = Math.max(_dfLastRemoteSeq, seq);
            return true;
        }

        function dfOnlineConfirmAppliedSeq(seq) {
            if (seq == null) return;
            _dfLastRemoteSeq = Math.max(_dfLastRemoteSeq | 0, seq | 0);
            try { window.__dfAppliedRemoteSeq = _dfLastRemoteSeq; } catch (e) { /* */ }
            try { dfNet?.confirmAppliedSeq?.(seq); } catch (e2) { /* */ }
        }

        /**
         * Materializa stateDiff → authoritativeState (Fase 5).
         * @returns {boolean} false se precisa resync (baseSeq desconhecido).
         */
        function dfOnlineMaterializeStateDiff(envelope) {
            if (!envelope || envelope.authoritativeState?.players?.length) return true;
            const diff = envelope.stateDiff;
            if (!diff) return true;
            if (diff.full) {
                if (diff.state?.players?.length) {
                    envelope.authoritativeState = diff.state;
                } else if (diff.full && envelope.snapshot?.state?.players?.length) {
                    envelope.authoritativeState = envelope.snapshot.state;
                }
                return true;
            }
            if (!Array.isArray(diff.patches) || !diff.patches.length) return true;
            const baseSeq = diff.baseSeq | 0;
            if (baseSeq !== (_dfLastRemoteSeq | 0)) {
                console.warn("[DF online] stateDiff baseSeq mismatch", baseSeq, _dfLastRemoteSeq);
                return false;
            }
            if (!window.DfState?.applyPatches) return false;
            const next = window.DfState.applyPatches(deps.getState(), diff.patches);
            if (!next?.players?.length) return false;
            envelope.authoritativeState = next;
            return true;
        }

        async function dfOnlineGapFillFromApplied(reason) {
            const fromSeq = _dfLastRemoteSeq | 0;
            try {
                const r = await dfNet?.getReplay?.(fromSeq);
                if (r && (r.entries?.length || r.state || r.gameState || r.authoritativeState)) {
                    // Sempre preferir snapshot final — NÃO reapresentar N entries
                    // (era a causa do “fast-forward” ao voltar à partida).
                    await dfOnlineApplyReplaySync(
                        { ...(r || {}), gapFill: true },
                        { gapFill: true, snapshotOnly: true },
                    );
                    return true;
                }
            } catch (e) {
                console.warn("[DF online] gapFill", reason, e);
            }
            try { await dfOnlineRollbackToServer(); } catch (e2) { /* */ }
            return false;
        }

        function dfOnlineEnqueueSeqCritical(fn, label) {
            const run = _dfSeqCriticalQ.then(async () => {
                try { await fn(); } catch (e) {
                    console.warn("[DF online] seqCritical", label || "", e);
                }
            });
            _dfSeqCriticalQ = run.catch(() => {});
            return run;
        }

        /**
         * Fila exclusiva da IA de desconexão. As pausas de ritmo dela não podem
         * ficar na mesma fila da apresentação do peer humano — senão a jogada
         * local espera segundos atrás do pacing da IA.
         */
        function dfOnlineEnqueueAiPresent(fn, label) {
            const run = _dfAiPresentQ.then(async () => {
                try { await fn(); } catch (e) {
                    console.warn("[DF online] aiPresent", label || "", e);
                }
            });
            _dfAiPresentQ = run.catch(() => {});
            return run;
        }

        /** Após SUMMON: se o DOM do peer divergir do auth, rebuild + gap-fill. */
        function dfOnlineEnsurePeerFieldVisible(ownerSeat, authState) {
            if (!window.__DF_ONLINE) return;
            if (ownerSeat !== 0 && ownerSeat !== 1) return;
            const authField = authState?.players?.[ownerSeat]?.field;
            if (!Array.isArray(authField)) return;
            const authN = authField.filter(Boolean).length;
            const localN = (deps.getState()?.players?.[ownerSeat]?.field || []).filter(Boolean).length;
            const qIdx = typeof deps.dfQuadrantForPlayer === "function"
                ? deps.dfQuadrantForPlayer(ownerSeat)
                : ownerSeat;
            const domN = document.querySelectorAll(
                `#quadrant-${qIdx} .quadrant-field .ccard:not(.combat-src-hidden)`,
            ).length;
            if (authN > 0 && (localN < authN || domN < authN)) {
                console.warn("[DF online] peer field gap", { ownerSeat, authN, localN, domN });
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                if (domN < authN) {
                    void dfOnlineGapFillFromApplied("peer_field_gap");
                }
            }
        }

        /** uids do par em combate — hide por índice escondia campeão vivo quando o campo reordenava. */
        function dfCombatPairUids(anim) {
            try {
                const st = deps.getState?.();
                return [
                    st?.players?.[anim.attOwner]?.field?.[anim.attIdx]?.uid,
                    st?.players?.[anim.defOwner]?.field?.[anim.defIdx]?.uid,
                ].filter((u) => u != null).map(String);
            } catch (e) { return []; }
        }

        function dfOnlineAbortCombatVisuals() {
            window.__dfCombatActive = null;
            window.__dfCombatTelegraphStarted = false;
            window.__dfCombatTelegraphPromise = null;
            document.body.classList.remove("df-combat-active");
            document.documentElement.removeAttribute("data-df-combat-pending");
            window.__dfCombatPending = null;
            deps.dfCombatMobileDim(false);
            document.querySelectorAll(
                ".battle-fly, .combat-snap-ghost, .combat-def-ghost, .combat-att-ghost, " +
                ".combat-hitstop-flash, .combat-speed-line, .combat-spark, .combat-impact-ring, " +
                ".combat-clash-shockwave, .combat-clash-text, .combat-cross-slash, .combat-dust, " +
                ".combat-flash, .combat-slash, .combat-mobile-dim, .combat-mobile-ring",
            ).forEach((n) => n.remove());
            document.querySelectorAll(".ccard").forEach((el) => {
                if (!el.classList.contains("combat-animating") && !el.classList.contains("combat-src-hidden")) return;
                deps.dfRestoreCombatFieldCard(el);
            });
            try { deps.dfCombatForceCleanup?.(); } catch (e) { /* */ }
            try { deps.ensureTurnReady?.(); } catch (e2) { /* */ }
        }

        function dfOnlinePresentationBusy() {
            if (!window.__DF_ONLINE) return false;
            if (window.__dfCombatActive || window.__dfCombatPending) return true;
            if (window.__dfScareReturnActive) return true;
            try {
                if (_dfPresenter?.isBusy?.()) return true;
            } catch (e) { /* */ }
            return false;
        }

        let _dfDeferredFlushTimer = null;
        function dfOnlineScheduleDeferredFlush() {
            if (!window.__DF_ONLINE) return;
            if (_dfDeferredFlushTimer) return;
            _dfDeferredFlushTimer = setTimeout(() => {
                _dfDeferredFlushTimer = null;
                void (async () => {
                    try {
                        if (_dfPresenter?.whenIdle) {
                            await _dfPresenter.whenIdle(14000);
                        } else {
                            await (deps.wait?.(400) || new Promise((r) => setTimeout(r, 400)));
                        }
                    } catch (e) { /* */ }
                    // Ainda busy (combate/scare): reagenda.
                    if (dfOnlinePresentationBusy() && window.__dfDeferredReconcile) {
                        dfOnlineScheduleDeferredFlush();
                        return;
                    }
                    dfOnlineFlushDeferredReconcile();
                })();
            }, 80);
        }

        /** Aplica SYNC deferido durante combate (após limpeza). */
        function dfOnlineFlushDeferredReconcile() {
            const deferred = window.__dfDeferredReconcile;
            window.__dfDeferredReconcile = null;
            if (!deferred) return;
            try {
                if (deferred.kind === "SYNC_STATE" && deferred.envelope) {
                    const deferredSeq = deferred.envelope?.seq != null ? (deferred.envelope.seq | 0) : 0;
                    // Evita revive: ignora SYNC antigo que chegou antes do ATTACK_RESOLVE.
                    if (deferredSeq && _dfLastAttackResolveSeq && deferredSeq <= _dfLastAttackResolveSeq) {
                        return;
                    }
                    const auth = deferred.envelope.authoritativeState;
                    if (auth?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot(
                                { state: auth, full: true },
                                { skipPhase: true, skipPresentBusyCheck: true, forceAuthoritative: true },
                            );
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                } else if (deferred.kind === "AUTH_BUSY" && deferred.snap) {
                    dfOnlineReconcileSnapshot(deferred.snap, {
                        ...(deferred.opts || {}),
                        skipPresentBusyCheck: true,
                        forceAuthoritative: true,
                    });
                    deps.updateUI(true);
                } else if (deferred.snap) {
                    dfOnlineReconcileSnapshot(deferred.snap, {
                        ...(deferred.opts || {}),
                        skipPresentBusyCheck: true,
                    });
                    deps.updateUI(true);
                }
            } catch (e) {
                console.warn("[DF online] flush deferred", e);
            }
        }

        /** Evita spam de “falha ao enviar” quando o socket oscila. */
        function dfOnlineThrottledFailToast(err) {
            if (!window.__DF_ONLINE) return;
            const e = String(err || "");
            const now = Date.now();
            if (dfOnlineThrottledFailToast._t && now - dfOnlineThrottledFailToast._t < 6500) return;
            dfOnlineThrottledFailToast._t = now;
            if (e === "ACK_TIMEOUT" || e === "TIMEOUT") {
                // Silencioso — combate/ACK lento ≠ queda de conexão.
                return;
            }
            if (e === "NOT_CONNECTED" || e === "NOT_ONLINE") {
                deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2400);
                return;
            }
            if (e === "SERVER_BUSY") {
                deps.floatText("Servidor ocupado — tente de novo em instantes.", "warn center", 2200);
                return;
            }
            if (e === "RATE_LIMIT" || e === "SYNC_RATE") {
                deps.floatText("Aguarde um instante — servidor ocupado.", "warn center", 1800);
                return;
            }
            deps.floatText("Falha ao enviar jogada ao servidor.", "warn center", 2200);
        }

        function dfOnlineScheduleBoardSync(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return;
            if (!dfNet?.connected) return;
            if (anim) _dfPendingBoardAnim = anim;
            clearTimeout(_dfBoardSyncTimer);
            // Cap: coalescing ≥120ms evita flood de SYNC_STATE.
            _dfBoardSyncTimer = setTimeout(() => {
                _dfBoardSyncTimer = null;
                if (!dfNet?.connected) return;
                const a = _dfPendingBoardAnim;
                _dfPendingBoardAnim = null;
                dfOnlineBroadcastAction({
                    type: "SYNC_STATE",
                    playerId: deps.dfLocalSeat(),
                    anim: a || undefined,
                });
            }, 120);
        }

        function dfOnlineSendNow(action, anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) return;
            clearTimeout(_dfBoardSyncTimer);
            _dfBoardSyncTimer = null;
            _dfPendingBoardAnim = null;
            const payload = { ...action, playerId: deps.dfLocalSeat() };
            if (anim) payload.anim = anim;
            const snap = DF_MP_NOSNAP_TYPES.has(payload.type) ? null : dfEngineSnapshotLite();
            const isSync = payload.type === "SYNC_STATE" || payload.type === "PLAY_VISUAL";
            dfNet.sendAction(payload, snap).then(async (ackRes) => {
                if (ackRes?.ok === false) {
                    if (!isSync) {
                        dfOnlineThrottledFailToast(ackRes.error || "REJECTED");
                    }
                    if (ackRes?.authoritativeState?.players?.length) {
                        if (!window.__dfSummonInFlight) {
                            dfOnlineReconcileSnapshot(
                                { state: ackRes.authoritativeState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI();
                        }
                    } else if (!isSync) {
                        await dfOnlineRollbackToServer();
                    }
                }
            }).catch(async (e) => {
                console.warn("[DF online] sendAction", e);
                if (!isSync) {
                    dfOnlineThrottledFailToast(e?.message || "SEND_FAILED");
                    if (!window.__dfSummonInFlight) await dfOnlineRollbackToServer();
                }
            });
        }

        /** Envia ação e espera ACK (invocação online). */
        async function dfOnlineSendActionAwait(action, opts = {}) {
            if (!window.__DF_ONLINE || !dfNet?.connected) {
                return { ok: false, error: "NOT_ONLINE" };
            }
            // Passar turno / desistir nunca ficam atrás de present remoto.
            // Com a IA do peer no controle, a apresentação dela nunca segura a
            // jogada local: durante o turno do humano não há ação remota a esperar.
            const aiPeerMyTurn = !!window.__dfPeerAiActive && deps.dfIsMyTurn?.() === true;
            const forceThrough = action?.type === "END_TURN" || action?.type === "SURRENDER"
                || opts.force || aiPeerMyTurn;
            // applyingRemote sticky bloqueava SUMMON/ATTACK com falso "NOT_ONLINE".
            // Espera breve; se persistir, destrava (só MP) e segue.
            if (deps.getApplyingRemote() && !forceThrough) {
                const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));
                const t0 = Date.now();
                // MP: quando IA do peer está ativa (após desconexão), reduzir timeout
                // para evitar lag nas ações do jogador. Max 350ms vs 900ms normal.
                const maxWait = (window.__dfPeerAiActive ? 350 : 900);
                while (deps.getApplyingRemote() && Date.now() - t0 < maxWait) {
                    await waitMs(40);
                }
                if (deps.getApplyingRemote()) {
                    console.warn("[DF online] applyingRemote sticky — force clear before send", action?.type);
                    try { deps.setApplyingRemote(false); } catch (eClr) { /* */ }
                }
            }
            const payload = { ...action, playerId: deps.dfLocalSeat() };
            const snap = (opts.noSnap || DF_MP_NOSNAP_TYPES.has(action?.type))
                ? null
                : (opts.full ? dfEngineSnapshotFull() : dfEngineSnapshotLite());
            try {
                let ackRes = await dfNet.sendAction(payload, snap);
                const seatLost = ackRes?.ok === false && (
                    ackRes.error === "NOT_IN_ROOM"
                    || ackRes.error === "NO_SEAT"
                    || ackRes.error === "NOT_PLAYING"
                );
                if (seatLost) {
                    const rec = await dfOnlineRecoverMatchSeat();
                    if (rec?.ok) {
                        ackRes = await dfNet.sendAction(payload, snap);
                    }
                }
                // MP: avançar seq no ACK — sem isso stateDiff do peer falha (baseSeq mismatch).
                if (ackRes?.ok && ackRes.seq != null) {
                    dfOnlineConfirmAppliedSeq(ackRes.seq);
                }
                // Fase A: ator replaya envelope quando o path local pediu (ex. on-enter server-first).
                // NÃO dispara se o caller vai awaitar o mesmo envelope (evita VFX×2 + freeze).
                if (opts.actorPresent && !opts.skipActorPresentFire
                    && ackRes?.ok && ackRes.presentationEnvelope?.visuals?.length) {
                    const seq = ackRes.seq | 0;
                    if (seq > _dfLastAckPresentSeq) {
                        _dfLastAckPresentSeq = seq;
                        try {
                            void dfOnlineReplayPresentationEnvelope(ackRes, {
                                authApplied: true,
                                skipKinds: opts.presentSkipKinds || null,
                            }).catch((e) => console.warn("[DF online] actor present", e));
                        } catch (e) { /* */ }
                    }
                }
                return ackRes || { ok: false, error: "NO_ACK" };
            } catch (e) {
                console.warn("[DF online] sendActionAwait", e);
                return { ok: false, error: e?.message || "SEND_FAILED" };
            }
        }

        function dfOnlineBroadcastPresent(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) return;
            dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => console.warn("[DF online] PRESENT", e));
        }

        function dfOnlineFlushBoardSync(anim) {
            dfOnlineSendNow({ type: "SYNC_STATE" }, anim || _dfPendingBoardAnim);
            _dfPendingBoardAnim = null;
        }

        function dfOnlineApplyIncomingSnapshot(envelope) {
            if (!dfOnlineShouldApplySnapshot(envelope)) return;
            deps.setApplyingRemote(true);
            try {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
            } finally {
                deps.setApplyingRemote(false);
            }
        }

        function dfOnlineBroadcastVisual(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) return;
            // PRESENT (Fase A) — mesmo contrato UI-only; peer não aplica snapshot.
            dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => {
                // Fallback legado se servidor antigo.
                dfNet.sendAction({
                    type: "PLAY_VISUAL",
                    playerId: deps.dfLocalSeat(),
                    anim,
                }, null).catch((e2) => console.warn("[DF online] PRESENT/PLAY_VISUAL", e2 || e));
            });
        }

        function dfOnlineBroadcastState() {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) return;
            // Após VFX com fieldPatches: não flood SYNC que clobbera o peer.
            if (Date.now() - _dfLastVisualPatchAt < 400) return;
            dfOnlineSendNow({ type: "SYNC_STATE" });
        }

        async function dfOnlineReplayAnim(anim) {
            if (!anim?.kind) return;
            // MP: a mesma cena chega por dois caminhos (PRESENT + envelope da ação,
            // ou burst dedicado + presentationEnvelope). Seqs diferentes, então o
            // dedupe por seq não pega — aqui deduplica por conteúdo.
            if (window.__DF_ONLINE && DF_REPLAY_DEDUPE_KINDS.has(anim.kind)
                && !dfClaimReplayScene(anim.kind, {
                    uid: anim.uid,
                    card: anim.cardName ?? anim.card,
                    p: anim.casterP ?? anim.casterIdx ?? anim.ownerIdx ?? anim.p,
                    i: anim.targetI ?? anim.fieldIdx ?? anim.i,
                })) {
                return;
            }
            try {
                // Combate: capturar snaps ANTES dos fieldPatches (senão o defensor some).
                let combatPreSnap = null;
                if (anim.kind === "combat" && anim.attOwner != null && anim.defOwner != null) {
                    combatPreSnap = {
                        att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx) || null,
                        def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx) || null,
                    };
                }
                // Patches de estado: adiar removals / power mutators até depois do VFX
                // (Bola/Assassinar/Fortalecer — evita alvo invisível mid-anim no peer).
                const deferPatchKinds = new Set([
                    "bola_de_fogo", "assassinar", "strong_arm", "explosao", "destroy",
                    "incendiar", "vinganca", "misseis_magicos", "scare_return",
                    "devour", "transformar_bichinho", "ursificacao",
                    "rajada_congelante", "rajada_congelante_destroy", "raio_duplo", "imitar",
                    "corrupt", "fury", "doppel_clone",
                ]);
                const deferredPatches = (anim.fieldPatches && deferPatchKinds.has(anim.kind))
                    ? anim.fieldPatches
                    : null;
                let deferredConsumed = false;
                if (anim.fieldPatches && !deferredPatches) {
                    dfOnlineApplyFieldPatches(anim.fieldPatches);
                }
                switch (anim.kind) {
                    case "scare_return": {
                        if (anim.targetP == null || anim.targetI == null) break;
                        // MP dedupe: caster já voou localmente; peer não deve repetir 2×.
                        try {
                            const sk = `scare:${anim.targetP}|${anim.targetI}|${anim.cardSnap?.uid || anim.cardName || ""}`;
                            const now = Date.now();
                            if (window.__dfScareReturnKey === sk && (now - (window.__dfScareReturnAt | 0)) < 2200) {
                                break;
                            }
                            window.__dfScareReturnKey = sk;
                            window.__dfScareReturnAt = now;
                        } catch (eDedup) { /* */ }
                        let snap = anim.cardSnap || null;
                        if (!snap && anim.cardName) {
                            snap = {
                                name: anim.cardName,
                                category: anim.category || "champion",
                                currentPower: anim.currentPower ?? anim.power ?? 0,
                                power: anim.power ?? anim.currentPower ?? 0,
                                basePower: anim.basePower ?? 0,
                                tapped: false,
                                isToken: !!anim.isToken,
                                abilityName: anim.abilityName || null,
                                abilityDesc: anim.abilityDesc || null,
                                abilityType: anim.abilityType || null,
                            };
                        }
                        // Peer: esconde DOM do campo no START (antes do burst/fly).
                        try {
                            const fieldEl = deps.getChampionDom?.(anim.targetP, anim.targetI);
                            if (fieldEl) {
                                fieldEl.classList.add("combat-src-hidden");
                                fieldEl.style.visibility = "hidden";
                                fieldEl.style.opacity = "0";
                                fieldEl.style.pointerEvents = "none";
                            }
                        } catch (e0) { /* */ }
                        await deps.playScareReturnVisual(
                            anim.targetP, anim.targetI, snap, anim.talentOwnerP,
                            {
                                hideFieldFirst: true,
                                handInsertIdx: anim.handInsertIdx != null
                                    ? (anim.handInsertIdx | 0)
                                    : undefined,
                            },
                        );
                        break;
                    }
                    case "ursificacao":
                        if (anim.allyP != null && anim.allyI != null) {
                            await deps.playUrsificacaoVisual(anim.allyP, anim.allyI);
                        }
                        break;
                    case "aceleracao":
                        if (anim.ownerP != null && anim.actionsAfter != null && deps.getState().players[anim.ownerP]) {
                            deps.getState().players[anim.ownerP].actions = anim.actionsAfter | 0;
                            deps.updateUI(true);
                        }
                        if (anim.ownerP != null && typeof deps.animateAceleracao === "function") {
                            try { await deps.animateAceleracao(anim.ownerP); } catch (e) { /* */ }
                        }
                        break;
                    case "destroy":
                        if (anim.ownerIdx != null && anim.fieldIdx != null) {
                            // Dedupe destruição (IA disconnect / present×2).
                            try {
                                const dk = `des:${anim.ownerIdx}|${anim.fieldIdx}|${anim.uid || anim.name || ""}`;
                                const now = Date.now();
                                if (window.__dfDestroyReplayKey === dk
                                    && (now - (window.__dfDestroyReplayAt | 0)) < 2200) {
                                    break;
                                }
                                window.__dfDestroyReplayKey = dk;
                                window.__dfDestroyReplayAt = now;
                            } catch (eDedDes) { /* */ }
                            let deathSnap = null;
                            let deathEl = null;
                            try {
                                deathSnap = typeof deps.dfCaptureFieldCardSnap === "function"
                                    ? deps.dfCaptureFieldCardSnap(anim.ownerIdx, anim.fieldIdx)
                                    : null;
                                deathEl = deps.getChampionDom(anim.ownerIdx, anim.fieldIdx);
                            } catch (eSnap) { /* */ }
                            if (!anim.fieldPatches) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.ownerIdx,
                                    targetI: anim.fieldIdx,
                                    removed: true,
                                }]);
                            }
                            if (deathSnap || deathEl) {
                                try {
                                    if (typeof deps.playChampionDestroyVisual === "function") {
                                        await deps.playChampionDestroyVisual(
                                            deathSnap,
                                            deathEl?.isConnected ? deathEl : null,
                                        );
                                    } else {
                                        deps.triggerChampionShatter?.(deathEl);
                                        await deps.wait(680);
                                    }
                                } catch (eDes) {
                                    deps.triggerChampionShatter?.(deathEl);
                                    await deps.wait(420);
                                }
                            } else {
                                await deps.wait(420);
                            }
                        }
                        break;
                    case "combat_telegraph": {
                        // Tell curto compartilhado — marca clock p/ ATTACK_RESOLVE alinhar.
                        if (anim.defOwner == null || anim.defIdx == null) break;
                        const telKey = `${anim.attOwner}:${anim.attIdx}>${anim.defOwner}:${anim.defIdx}`;
                        window.__dfCombatTelegraphKey = telKey;
                        window.__dfCombatTelegraphStarted = true;
                        const tellRun = (async () => {
                            const defEl = deps.getChampionDom(anim.defOwner, anim.defIdx);
                            const attEl = anim.attOwner != null && anim.attIdx != null
                                ? deps.getChampionDom(anim.attOwner, anim.attIdx)
                                : null;
                            if (defEl) defEl.classList.add("df-combat-telegraph-def");
                            if (attEl) attEl.classList.add("df-combat-telegraph-att");
                            await deps.wait(280);
                            if (defEl) defEl.classList.remove("df-combat-telegraph-def");
                            if (attEl) attEl.classList.remove("df-combat-telegraph-att");
                        })();
                        window.__dfCombatTelegraphPromise = tellRun;
                        await tellRun;
                        break;
                    }
                    case "talent_cast": {
                        const cardName = anim.cardName || "Talento";
                        const ownerP = anim.ownerP ?? 0;
                        const fakeCard = {
                            name: cardName,
                            category: "talent",
                            talentEffect: anim.talentEffect || null,
                            power: 0,
                            currentPower: 0,
                        };
                        const st = deps.getState();
                        if (!st.activeTalent) {
                            st.activeTalent = { ownerP, card: fakeCard };
                        }
                        try { _dfPresenter?.markTalentCast(ownerP); } catch (e) { /* */ }
                        dfOnlineArmTalentSpotlightWatchdog(ownerP);
                        deps.updateUI();
                        try {
                            if (anim.talentEffect === "doppelganger"
                                && typeof deps.animateDoppelgangerTalentCast === "function") {
                                try { await deps.animateDoppelgangerTalentCast(ownerP); } catch (e0) { /* */ }
                            } else if (deps.getDfAnim?.()?.preAnimBanner) {
                                await deps.getDfAnim().preAnimBanner({
                                    category: "talent",
                                    title: cardName,
                                    subtitle: "Carta de Talento",
                                    theme: deps.getDfAnim().themeForCard?.(fakeCard)
                                        || { color: "#c9a0ff", ring: "#e8d4ff", emoji: "✨" },
                                });
                            }
                            // Peer: waits curtos — não empilhar 2.5s atrás do board.
                            const peerTalent = window.__DF_ONLINE && ownerP !== deps.dfLocalSeat();
                            await deps.wait(peerTalent ? 280 : 900);
                        } catch (e) { /* */ }
                        // Auto-clear só se discard nunca chegar — NÃO limpar enquanto
                        // o ator ainda mira (hasTalentPending até talent_discard).
                        try {
                            const peerTalent = window.__DF_ONLINE && ownerP !== deps.dfLocalSeat();
                            await deps.wait(peerTalent ? 600 : 1600);
                            if (_dfPresenter?.hasTalentPending?.(ownerP)) {
                                break;
                            }
                            const st2 = deps.getState();
                            if (st2.activeTalent
                                && (st2.activeTalent.ownerP === ownerP
                                    || st2.activeTalent.card?.name === cardName)) {
                                try {
                                    if (typeof deps.flyActiveTalentToDiscard === "function") {
                                        await Promise.race([
                                            deps.flyActiveTalentToDiscard(ownerP),
                                            deps.wait(1200),
                                        ]);
                                    }
                                } catch (e2) { /* */ }
                                st2.activeTalent = null;
                                try {
                                    const layer = document.getElementById("talent-spotlight-layer");
                                    layer?.replaceChildren?.();
                                    layer?.classList?.remove(
                                        "talent-spotlight-above-hud",
                                        "talent-spotlight-touch-hud",
                                    );
                                } catch (e3) { /* */ }
                                try { _dfPresenter?.clearTalentPending(ownerP); } catch (e4) { /* */ }
                                deps.updateUI();
                            }
                        } catch (e) { /* */ }
                        break;
                    }
                    case "talent_discard": {
                        const ownerP = anim.ownerP ?? 0;
                        const st = deps.getState();
                        _dfMpTalentCommitted = true;
                        try {
                            if (st.activeTalent?.ownerP === ownerP || st.activeTalent) {
                                try {
                                    if (typeof deps.flyActiveTalentToDiscard === "function") {
                                        await Promise.race([
                                            deps.flyActiveTalentToDiscard(ownerP),
                                            deps.wait(1200),
                                        ]);
                                    }
                                } catch (e) { /* */ }
                            }
                        } catch (e) { /* */ }
                        dfOnlinePurgeTalentSpotlight(ownerP);
                        break;
                    }
                    case "dragon_token_summon": {
                        const ownerP = anim.ownerP ?? 0;
                        const field = deps.getState().players[ownerP]?.field;
                        let idx = anim.insertIdx;
                        if (anim.card && field) {
                            const already = field.findIndex((c) => c?.uid && anim.card.uid && c.uid === anim.card.uid);
                            if (already < 0) {
                                idx = idx != null
                                    ? Math.max(0, Math.min(idx | 0, field.length))
                                    : field.length;
                                const card = { ...anim.card, _summoning: true };
                                if (card.currentPower == null) card.currentPower = card.power ?? 0;
                                field.splice(idx, 0, card);
                            } else {
                                idx = already;
                                if (field[idx]) field[idx]._summoning = true;
                            }
                            deps.updateUI();
                        }
                        if (idx != null && typeof deps.animateDragonSummon === "function") {
                            try { await deps.animateDragonSummon(ownerP, idx); } catch (e) { /* */ }
                        }
                        try {
                            const c = deps.getState().players[ownerP]?.field?.[idx];
                            if (c) c._summoning = false;
                            deps.updateUI?.(true);
                        } catch (e) { /* */ }
                        break;
                    }
                    case "doppel_cast": {
                        const ownerP = anim.ownerP ?? 0;
                        const cardName = anim.cardName || "Duplicar";
                        const st = deps.getState();
                        if (!st.activeTalent) {
                            st.activeTalent = {
                                ownerP,
                                card: {
                                    name: cardName,
                                    category: "talent",
                                    talentEffect: "doppelganger",
                                    power: 0,
                                    currentPower: 0,
                                },
                            };
                            deps.updateUI();
                        }
                        if (typeof deps.animateDoppelgangerTalentCast === "function") {
                            try { await deps.animateDoppelgangerTalentCast(ownerP); } catch (e) { /* */ }
                        }
                        break;
                    }
                    case "doppel_clone": {
                        const ownerP = anim.ownerP ?? 0;
                        const field = deps.getState().players[ownerP]?.field;
                        let idx = anim.insertIdx;
                        if (anim.card && field) {
                            const already = field.findIndex((c) => c?.uid && anim.card.uid && c.uid === anim.card.uid);
                            if (already < 0) {
                                idx = idx != null
                                    ? Math.max(0, Math.min(idx | 0, field.length))
                                    : field.length;
                                const card = { ...anim.card };
                                if (card.currentPower == null) card.currentPower = card.power ?? 0;
                                field.splice(idx, 0, card);
                            } else {
                                idx = already;
                            }
                            deps.updateUI();
                        }
                        const srcI = anim.sourceI;
                        if (idx != null && srcI != null && typeof deps.animateDoppelgangerClone === "function") {
                            try { await deps.animateDoppelgangerClone(ownerP, srcI, idx); } catch (e) { /* */ }
                        }
                        break;
                    }
                    case "ritual_spotlight": {
                        const ownerP = anim.ownerP ?? 0;
                        const card = anim.card || {
                            name: anim.cardName || "Ritual",
                            category: "champion",
                            summonRitual: anim.summonRitual ?? null,
                            power: anim.power ?? 0,
                            currentPower: anim.power ?? 0,
                        };
                        deps.getState().activeTalent = {
                            ownerP,
                            card,
                            tag: "RITUAL",
                            noDiscard: true,
                        };
                        deps.updateUI();
                        break;
                    }
                    case "ritual_spotlight_clear": {
                        const st = deps.getState();
                        if (st.activeTalent?.tag === "RITUAL"
                            || (anim.ownerP != null && st.activeTalent?.ownerP === anim.ownerP)) {
                            st.activeTalent = null;
                            try {
                                const layer = document.getElementById("talent-spotlight-layer");
                                layer?.replaceChildren?.();
                                layer?.classList?.remove(
                                    "talent-spotlight-above-hud",
                                    "talent-spotlight-touch-hud",
                                );
                            } catch (e) { /* */ }
                            deps.updateUI();
                        }
                        break;
                    }
                    case "devour":
                        if (anim.targetP != null && anim.targetI != null) {
                            // Animar com presa ainda no DOM; patches removed só depois.
                            // Nunca ocultar outros slots do mesmo campo (só a presa).
                            // Se auth já aplicou o splice, NÃO reaplicar removed (índice stale).
                            const authDone = !!anim._authApplied;
                            try {
                                const preyEl = deps.getChampionDom?.(anim.targetP, anim.targetI);
                                if (preyEl) preyEl.dataset.dfDevourPrey = "1";
                            } catch (eMark) { /* */ }
                            await deps.animateDevour(anim.targetP, anim.targetI);
                            if (!authDone) {
                                if (deferredPatches?.length) {
                                    dfOnlineApplyFieldPatches(deferredPatches);
                                    deferredConsumed = true;
                                } else if (anim.fieldPatches?.length) {
                                    dfOnlineApplyFieldPatches(anim.fieldPatches);
                                }
                            } else if (deferredPatches?.length) {
                                // Só power/status — sem removed.
                                const safe = deferredPatches.filter((p) => !p?.removed);
                                if (safe.length) dfOnlineApplyFieldPatches(safe);
                                deferredConsumed = true;
                            }
                            try {
                                // Restaurar qualquer campeão do campo que não seja a presa.
                                const field = deps.getState?.()?.players?.[anim.targetP]?.field || [];
                                for (let i = 0; i < field.length; i++) {
                                    const el = deps.getChampionDom?.(anim.targetP, i);
                                    if (!el || el.dataset?.dfDevourPrey === "1") continue;
                                    el.classList.remove("combat-animating", "combat-src-hidden");
                                    el.style.removeProperty("visibility");
                                    el.style.removeProperty("opacity");
                                    el.style.removeProperty("pointer-events");
                                }
                            } catch (eRest) { /* */ }
                            try { deps.updateUI?.(true); } catch (e) { /* */ }
                        }
                        break;
                    case "poison_kill": {
                        // Morte por Envenenado na manutenção — burst + shatter.
                        // Preferir snap pré-reconcile (anim.cardSnap / preDom).
                        const pkP = anim.ownerIdx ?? anim.p ?? anim.targetP;
                        const pkI = anim.fieldIdx ?? anim.i ?? anim.targetI;
                        if (pkP != null && pkI != null
                            && typeof deps.playPoisonMaintenanceDeaths === "function") {
                            const victims = [{
                                p: pkP,
                                i: pkI,
                                uid: anim.uid,
                                name: anim.name,
                            }];
                            let preMap = null;
                            if (anim.cardSnap) {
                                preMap = new Map();
                                if (anim.uid != null) preMap.set(anim.uid, anim.cardSnap);
                                preMap.set(`${pkP}:${pkI}`, anim.cardSnap);
                            }
                            await deps.playPoisonMaintenanceDeaths(victims, preMap);
                        } else if (pkP != null && pkI != null) {
                            try {
                                const el = deps.getChampionDom?.(pkP, pkI);
                                const r = el?.getBoundingClientRect?.();
                                if (r && r.width >= 4
                                    && window.DfPixiVfx?.playPoisonExplosionBurstScene) {
                                    await window.DfPixiVfx.playPoisonExplosionBurstScene(
                                        r.left + r.width / 2,
                                        r.top + r.height / 2,
                                        { cinematic: true },
                                    );
                                }
                            } catch (ePk) { /* */ }
                            try {
                                await deps.playStandardDestroyVisual?.(pkP, pkI, {
                                    uid: anim.uid,
                                });
                            } catch (eDes) { /* */ }
                        }
                        break;
                    }
                    case "assassinar":
                        if (anim.casterP != null && anim.targetP != null) {
                            await deps.playAssassinarVisual(
                                anim.casterP,
                                anim.casterField,
                                anim.targetP,
                                anim.targetI,
                            );
                            if (!deferredPatches && !anim.fieldPatches && anim.targetI != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    removed: true,
                                }]);
                            }
                        }
                        break;
                    case "imitar":
                        if (anim.allyP != null && anim.casterP != null) {
                            await deps.animateImitar(
                                anim.allyP,
                                anim.allyI,
                                anim.casterP,
                                anim.casterFieldIdx,
                            );
                            // Ícone/nome imitado na hora (não esperar sync tardio).
                            if (deferredPatches?.length) {
                                dfOnlineApplyFieldPatches(deferredPatches);
                                deferredConsumed = true;
                            } else if (anim.fieldPatches?.length) {
                                dfOnlineApplyFieldPatches(anim.fieldPatches);
                            } else if (anim.casterP != null && anim.casterFieldIdx != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.casterP,
                                    targetI: anim.casterFieldIdx,
                                    mimico: true,
                                    mimicAbilityName: anim.mimicAbilityName || "Habilidade",
                                    mimicSourceName: anim.mimicSourceName || "",
                                    abilityName: anim.mimicAbilityName || null,
                                }]);
                            }
                            try { deps.updateUI?.(true); } catch (e) { /* */ }
                            const mim = anim.mimicAbilityName || "Habilidade";
                            const src = anim.mimicSourceName || "";
                            deps.floatText(
                                src ? `🎭 Imitou ${mim} (${src})` : `🎭 Imitou ${mim}`,
                                "info center",
                                2200,
                            );
                        }
                        break;
                    case "rajada_congelante":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateIce(anim.targetP, anim.targetI);
                        }
                        break;
                    case "corrupt":
                        if (anim.targetP != null && anim.targetI != null) {
                            const el = deps.getChampionDom(anim.targetP, anim.targetI);
                            if (el && window.DfVfxEngine?.wantsGpuPresentation?.()
                                && typeof window.DfPixiVfx?.playCorruptScene === "function") {
                                const r = el.getBoundingClientRect();
                                try {
                                    await window.DfPixiVfx.playCorruptScene(
                                        r.left + r.width / 2,
                                        r.top + r.height / 2,
                                        { cinematic: true },
                                    );
                                } catch (e) { /* */ }
                            }
                            deps.updateUI(true);
                        }
                        break;
                    case "rajada_congelante_destroy":
                        if (anim.targetP != null && anim.targetI != null) {
                            if (typeof deps.playFreezeShatterDestroyVisual === "function") {
                                await deps.playFreezeShatterDestroyVisual(anim.targetP, anim.targetI, {});
                            } else {
                                const el = deps.getChampionDom(anim.targetP, anim.targetI);
                                deps.triggerChampionShatter(el);
                                await deps.wait(420);
                            }
                        }
                        break;
                    case "bola_de_fogo":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playBolaDeFogoVisual(
                                anim.casterP ?? 0,
                                anim.casterField ?? -1,
                                anim.targetP,
                                anim.targetI,
                                !!anim.fromTalent,
                                anim.originOverride || null,
                            );
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    currentPower: anim.powerAfter,
                                }]);
                            }
                        }
                        break;
                    case "explosao":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playExplosaoVisual(anim.casterP ?? 0, anim.targetP, anim.targetI);
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    currentPower: anim.powerAfter,
                                }]);
                            }
                        }
                        break;
                    case "zero_absoluto":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playZeroAbsolutoVisual(
                                anim.casterP ?? 0,
                                anim.targetP,
                                anim.targetI,
                                { wasFrozen: !!anim.wasFrozen },
                            );
                        }
                        break;
                    case "blocked_attack":
                        dfOnlineAbortCombatVisuals();
                        try {
                            deps.dfCombatForceCleanup?.({
                                defOwner: anim.defOwner,
                                defIdx: anim.defIdx,
                            });
                        } catch (e) { /* */ }
                        if (anim.defOwner != null) {
                            const def = anim.defIdx != null
                                ? deps.getState().players[anim.defOwner]?.field[anim.defIdx]
                                : null;
                            if (def || anim.defIdx != null) {
                                await deps.animateBlockedAttack(
                                    anim.defOwner,
                                    def || { name: "Campeão" },
                                );
                            }
                            await dfOnlineRevealReactiveCard(
                                anim.defOwner,
                                anim.cardName || "BLOQUEAR ATAQUE",
                                anim.talentEffect || "bloquearAtaque",
                            );
                        }
                        deps.updateUI(true);
                        break;
                    case "divine_protection":
                        if (anim.defOwner != null) {
                            const field = deps.getState().players[anim.defOwner]?.field || [];
                            let def = null;
                            if (anim.defenderUid != null) {
                                def = field.find((c) => c && c.uid === anim.defenderUid) || null;
                            }
                            if (!def && anim.defenderName) {
                                def = field.find((c) => c && c.name === anim.defenderName) || null;
                            }
                            if (!def) def = field[0] || { name: anim.defenderName || "Campeão" };
                            if (typeof deps.animateDivineProtection === "function") {
                                try { await deps.animateDivineProtection(anim.defOwner, def); } catch (e) { /* */ }
                            }
                        }
                        break;
                    case "cancel_ultimate":
                        if (typeof deps.animateCancelUltimate === "function") {
                            try {
                                await deps.animateCancelUltimate(
                                    anim.casterP ?? 0,
                                    { ultimateName: anim.ultimateName || "Ultimate" },
                                );
                            } catch (e) { /* */ }
                        }
                        break;
                    case "misseis_magicos":
                        if (!anim.skipVisual) {
                            if (typeof deps.playMisseisMagicosPeerVisual === "function") {
                                try {
                                    await deps.playMisseisMagicosPeerVisual(anim.ownerP ?? 0, anim.strikes || null);
                                } catch (e) { /* */ }
                            } else if (typeof deps.runMisseisMagicosTalent === "function" && anim.cosmetic) {
                                try { await deps.runMisseisMagicosTalent(anim.ownerP ?? 0); } catch (e) { /* */ }
                            }
                        }
                        deps.updateUI(true);
                        break;
                    case "strong_arm":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateStrongArm(anim.targetP, anim.targetI, {
                                casterP: anim.casterP,
                                casterField: anim.casterField ?? anim.casterFieldIdx,
                                forceDomFallback: true,
                                fromTalent: !!anim.fromTalent,
                            });
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches(dfOnlinePatchPower(
                                    anim.targetP, anim.targetI, anim.powerAfter,
                                ));
                            }
                        }
                        break;
                    case "explosao_venenosa_burst": {
                        const applied = anim.applied || [];
                        if (applied.length && typeof deps.animateExplosaoVenenosaTargets === "function") {
                            try {
                                await deps.animateExplosaoVenenosaTargets(applied);
                            } catch (e) { /* */ }
                        }
                        deps.updateUI(true);
                        break;
                    }
                    case "combat": {
                        if (anim.attOwner == null || anim.defOwner == null) break;
                        const combatSnap = combatPreSnap?.att && combatPreSnap?.def
                            ? combatPreSnap
                            : {
                                att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx),
                                def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx),
                            };
                        const out = {
                            killA: !!anim.killA,
                            killD: !!anim.killD,
                            swords: anim.killD ? ["d"] : anim.killA ? ["a"] : [],
                            over: false,
                            pvTo: null,
                        };
                        document.body.classList.add("df-combat-active");
                        window.__dfCombatActive = { attOwner: anim.attOwner, attIdx: anim.attIdx, defOwner: anim.defOwner, defIdx: anim.defIdx, uids: dfCombatPairUids(anim) };
                        let combatPromise = null;
                        try {
                            combatPromise = deps.dfInstallPhase3().runCombat(() =>
                                deps.animateCombat(anim.attOwner, anim.attIdx, anim.defOwner, anim.defIdx, out, combatSnap)
                            );
                            // Peer lento extremo: orçamento curto, sem cortar combate a 900ms.
                            if (window.__dfMpPeerCombatFast) {
                                await Promise.race([
                                    combatPromise,
                                    deps.wait?.(1800) || new Promise((r) => setTimeout(r, 1800)),
                                ]);
                            } else {
                                await combatPromise;
                            }
                        } finally {
                            // Com o orçamento curto do peer a animação pode seguir
                            // viva após o await. Liberar os flags aqui deixava o
                            // updateUI reconstruir o campo no meio da cinemática —
                            // as cartas sumiam. Só solta quando ela termina.
                            const releaseCombatFlags = () => {
                                window.__dfCombatActive = null;
                                document.body.classList.remove("df-combat-active");
                            };
                            if (combatPromise && typeof combatPromise.then === "function") {
                                let released = false;
                                const releaseOnce = () => {
                                    if (released) return;
                                    released = true;
                                    releaseCombatFlags();
                                };
                                combatPromise.then(releaseOnce, releaseOnce);
                                setTimeout(releaseOnce, 15000);
                            } else {
                                releaseCombatFlags();
                            }
                        }
                        break;
                    }
                    case "fumaca_toxica":
                        if ((anim.casterP != null || anim.casterIdx != null) && anim.picks?.length) {
                            await deps.playFumacaToxicaVisual(
                                anim.casterP ?? anim.casterIdx,
                                anim.casterFieldIdx ?? anim.fieldIdx ?? 0,
                                anim.picks,
                            );
                        }
                        break;
                    case "raio_duplo":
                        {
                            const picks = anim.picks?.length
                                ? anim.picks
                                : (anim.hits || []).map((h) => ({ p: h.p, i: h.i }));
                            const preHits = Array.isArray(window.__dfRaioDuploPreHits)
                                ? window.__dfRaioDuploPreHits
                                : (Array.isArray(anim.hits) ? anim.hits : []);
                            if ((anim.casterP != null || anim.casterIdx != null) && picks?.length) {
                                const cp = anim.casterP ?? anim.casterIdx;
                                for (const { p, i } of picks) {
                                    const pre = preHits.find((h) => h
                                        && ((h.uid != null && deps.getState?.()?.players?.[p]?.field?.[i]?.uid === h.uid)
                                            || (h.p === p && (h.i === i || h.liveI === i))))
                                        || preHits.find((h) => h && h.p === p)
                                        || null;
                                    const cx = pre?.cx ?? null;
                                    const cy = pre?.cy ?? null;
                                    try {
                                        await deps.animateRaioDuploStrike(cp, p, i, { cx, cy });
                                    } catch (eStrike) {
                                        console.warn("[DF online] raio_duplo strike", eStrike);
                                    }
                                    const after = pre?.after;
                                    const killed = after != null
                                        ? ((after | 0) <= 0)
                                        : !!(anim.fieldPatches || []).some((fp) =>
                                            fp && fp.targetP === p && fp.removed
                                            && (fp.targetI === i || fp.targetI === pre?.i));
                                    if (killed && pre?.snap && typeof deps.playChampionDestroyVisual === "function") {
                                        try {
                                            await deps.playChampionDestroyVisual(pre.snap, null);
                                        } catch (eKill) { /* */ }
                                    } else if (killed && typeof deps.playStandardDestroyVisual === "function") {
                                        try {
                                            await deps.playStandardDestroyVisual(p, i, { uid: pre?.uid });
                                        } catch (eKill2) { /* */ }
                                    }
                                }
                            }
                            try { window.__dfRaioDuploPreHits = null; } catch (eClr) { /* */ }
                        }
                        break;
                    case "wings":
                        if (anim.casterIdx != null) await deps.animateWings(anim.casterIdx);
                        break;
                    case "card_draw": {
                        const pid = anim.playerId;
                        // Dedup MP: saque livre já voou via dfOnlinePlayUpkeepDrawFromEvents.
                        if (window.__DF_ONLINE
                            && (pid === 0 || pid === 1)
                            && window.__dfUpkeepDrawSeat === pid
                            && window.__dfUpkeepDrawAt
                            && (Date.now() - window.__dfUpkeepDrawAt) < 3000) {
                            break;
                        }
                        if ((pid === 0 || pid === 1) && typeof deps.drawAnimToPlayer === "function") {
                            deps.drawAnimToPlayer(pid);
                            if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
                        }
                        break;
                    }
                    case "pesadelo":
                        if (anim.targetIdx != null) {
                            await deps.playPesadeloSmokeVisual(anim.targetIdx, anim.casterIdx);
                            deps.dfSyncPesadeloShrouds();
                        }
                        break;
                    case "roubar":
                        if (anim.casterIdx != null && anim.targetIdx != null) {
                            try { deps.updateUI?.({ immediate: true }); } catch (e) { /* */ }
                            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                            const steal = anim.cardSnap || anim.card;
                            await deps.animateRoubar(anim.casterIdx, anim.targetIdx, steal, {
                                originRect: anim.originRect || null,
                            });
                        }
                        break;
                    case "desacelerar":
                        if (anim.targetIdx != null) {
                            await deps.animateDesacelerar(
                                anim.casterIdx ?? 0,
                                anim.casterFieldIdx ?? anim.fieldIdx ?? -1,
                                anim.targetIdx,
                            );
                        }
                        break;
                    case "mordida_venenosa":
                    case "poison":
                        if (anim.targetP != null && anim.targetI != null
                            && typeof deps.animateMordidaVenenosa === "function") {
                            await deps.animateMordidaVenenosa(anim.targetP, anim.targetI);
                        }
                        break;
                    case "barrier_grant":
                        if (anim.ownerP != null && anim.indices?.length) {
                            await deps.animateBarrierGrant(anim.ownerP, anim.indices);
                        }
                        break;
                    // Barreira bloqueou uma redução de Poder. Sem este case o
                    // adversário só via o Poder "não cair", sem entender por quê.
                    case "barrier_block": {
                        const bp = anim.targetP ?? anim.ownerP;
                        const bi = anim.targetI ?? anim.fieldIdx;
                        if (bp != null && bi != null
                            && typeof deps.animateBarrierBlock === "function") {
                            await deps.animateBarrierBlock(bp, bi);
                        }
                        break;
                    }
                    // Proteção concedida (Defensor / Guardião). Reaproveita o
                    // visual de Barreira, que é o mesmo brilho de escudo.
                    case "shield": {
                        const sp = anim.ownerP ?? anim.casterP ?? anim.casterIdx;
                        const idxs = anim.indices?.length
                            ? anim.indices
                            : (anim.fieldIdx != null ? [anim.fieldIdx]
                                : (anim.targetI != null ? [anim.targetI] : null));
                        if (sp != null && idxs?.length
                            && typeof deps.animateBarrierGrant === "function") {
                            await deps.animateBarrierGrant(sp, idxs);
                        }
                        break;
                    }
                    // Só status mudou (Congelado, Envenenado, Vulnerável…). Os
                    // fieldPatches já foram aplicados acima; aqui garantimos que
                    // o tabuleiro repinte os ícones em vez de cair no default
                    // silencioso, que deixava o adversário sem feedback algum.
                    case "status_sync":
                        try { deps.updateUI?.(); } catch (eSs) { /* */ }
                        break;
                    case "fire_aura":
                        if (anim.ownerP != null && anim.indices?.length) {
                            await deps.animateAuraDeFogoGrant(anim.ownerP, anim.indices);
                        }
                        break;
                    case "baforada_venenosa":
                        if (anim.ownerP != null && anim.targetP != null && anim.targetI != null) {
                            await deps.animateBaforadaVenenosa(anim.ownerP, [{ p: anim.targetP, i: anim.targetI }]);
                        }
                        break;
                    case "maldicao_sete_mares":
                        if (anim.casterIdx != null) {
                            // Peer: aplica Silêncio na mão se o auth ainda não pintou.
                            try {
                                const st = deps.getState();
                                const cIdx = anim.casterIdx;
                                for (let p = 0; p < (st.playersCount || st.players?.length || 0); p++) {
                                    if (p === cIdx) continue;
                                    const opp = st.players[p];
                                    if (!opp) continue;
                                    opp.maldicaoForgetNext = true;
                                    (opp.hand || []).forEach((card) => {
                                        if (card?.category === "champion") card.silencedInHand = true;
                                    });
                                }
                                deps.updateUI?.(true);
                            } catch (eM) { /* */ }
                            await deps.animateMaldicaoSeteMares(anim.casterIdx);
                        }
                        break;
                    case "guardian":
                        if (anim.casterP != null && anim.picks?.length) {
                            await deps.animateGuardiao(anim.casterP, anim.picks);
                        }
                        break;
                    case "fury":
                        if (anim.ownerP != null && anim.fieldIdx != null) {
                            const el = deps.getChampionDom(anim.ownerP, anim.fieldIdx);
                            if (el) {
                                el.classList.add("fury-flash");
                                setTimeout(() => el.classList.remove("fury-flash"), 900);
                            }
                            if (window.DfSpriteVfx?.playFuryBurst) {
                                await window.DfSpriteVfx.playFuryBurst(anim.ownerP, anim.fieldIdx);
                            } else {
                                await deps.wait(500);
                            }
                            deps.updateUI();
                        }
                        break;
                    case "incendiar":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateIncendiarGrant(anim.targetP, anim.targetI, {
                                casterP: anim.casterP,
                                casterField: anim.casterFieldIdx,
                            });
                            if (deferredPatches?.length) {
                                dfOnlineApplyFieldPatches(deferredPatches);
                                deferredConsumed = true;
                            } else if (anim.fieldPatches?.length) {
                                dfOnlineApplyFieldPatches(anim.fieldPatches);
                            } else {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    burning: true,
                                    burningTurns: anim.burningTurns ?? 4,
                                    burningByP: anim.burningByP ?? anim.casterP,
                                }]);
                            }
                            deps.updateUI(true);
                        }
                        break;
                    case "vinganca":
                        if (anim.targetP != null && anim.targetI != null) {
                            try {
                                if (typeof deps.playVingancaVisual === "function") {
                                    await deps.playVingancaVisual(
                                        anim.ownerP, anim.ownerI, anim.targetP, anim.targetI,
                                    );
                                } else if (typeof deps.animateStrongArm === "function") {
                                    await deps.wait(400);
                                }
                            } catch (e) { /* */ }
                            deps.updateUI();
                        }
                        break;
                    case "legado":
                        if (anim.targetP != null && anim.targetI != null) {
                            try {
                                if (typeof deps.animateLegado === "function") {
                                    await deps.animateLegado(anim.targetP, anim.targetI);
                                } else if (typeof deps.triggerLegado === "function") {
                                    await deps.triggerLegado(anim.ownerP ?? anim.targetP, { visualOnly: true });
                                }
                            } catch (e) { /* */ }
                            deps.updateUI(true);
                        }
                        break;
                    case "troca_injusta":
                        if (anim.casterP != null && anim.enemyP != null) {
                            await deps.animateTrocaInjusta(
                                anim.casterP, anim.casterFieldIdx ?? 0, anim.enemyP, anim.enemyI,
                                anim.preRects || null,
                            );
                        }
                        break;
                    case "land_impact":
                        if (anim.ownerP != null && anim.fieldIdx != null) {
                            await deps.championLandImpact(anim.ownerP, anim.fieldIdx);
                        }
                        break;
                    case "transformar_bichinho":
                        if (anim.targetP != null && anim.targetI != null) {
                            const puff = await deps.playTransformarBichinhoVisual(
                                anim.targetP, anim.targetI, !!anim.success,
                            );
                            await deps.dismissTransformPuff(puff);
                        }
                        break;
                    case "necromancia":
                        if ((anim.casterP != null || anim.casterIdx != null)
                            && (anim.cardName || anim.card)) {
                            const card = anim.cardName
                                ? { name: anim.cardName }
                                : (typeof anim.card === "string" ? { name: anim.card } : anim.card);
                            await deps.animateNecromanciaFlyToHand(
                                anim.casterP ?? anim.casterIdx,
                                card,
                            );
                        }
                        break;
                    case "thunder_discard": {
                        const opp = anim.opponentId ?? anim.targetPlayer ?? anim.playerId;
                        const idxs = Array.isArray(anim.handIndices) ? anim.handIndices
                            : (anim.handIdx != null ? [anim.handIdx] : []);
                        if (typeof deps.animateThunderDiscardFromHand === "function" && idxs.length) {
                            const sorted = idxs.slice().sort((a, b) => b - a);
                            for (const hi of sorted) {
                                try {
                                    await deps.animateThunderDiscardFromHand(opp, hi);
                                } catch (e) { /* */ }
                            }
                        } else if (typeof deps.animateThunderDiscardFromHand === "function"
                            && anim.cardName && opp != null) {
                            // Fallback: anima o topo da mão do oponente.
                            const handLen = deps.getState().players[opp]?.hand?.length ?? 0;
                            if (handLen > 0) {
                                await deps.animateThunderDiscardFromHand(opp, handLen - 1);
                            }
                        }
                        break;
                    }
                    default:
                        break;
                }
                if (deferredPatches?.length && !deferredConsumed) {
                    dfOnlineApplyFieldPatches(deferredPatches);
                    deps.updateUI(true);
                }
            } catch (e) {
                console.warn("[DF online] replay anim", e);
            }
        }

        async function dfOnlineReplaySummonLand(action, fromSeat) {
            const insertIdx = action.insertIdx != null ? action.insertIdx : -1;
            let fIdx = insertIdx;
            if (fIdx < 0 || fIdx >= (deps.getState().players[fromSeat]?.field?.length || 0)) {
                fIdx = (deps.getState().players[fromSeat]?.field?.length || 1) - 1;
            }
            if (fIdx >= 0) await deps.championLandImpact(fromSeat, fIdx);
        }

        async function dfOnlineReplaySummonVisual(action, fromSeat, _snapIgnored) {
            // Ator local já anima via summonAnimation — não repetir o fly.
            if (fromSeat === deps.dfLocalSeat()
                && (window.__dfSummonInFlight
                    || (action?.uid && String(action.uid) === String(window.__dfLocalSummonUid || ""))
                    || (action?.cardName && window.__dfLocalSummonAnimKey
                        && String(window.__dfLocalSummonAnimKey).includes(String(action.cardName))))) {
                return;
            }
            // Dedupe: mesma invocação em <2,5s (serverAi present duplicado).
            try {
                const sk = `sumV:${fromSeat}|${action?.uid || ""}|${action?.cardName || ""}|${action?.insertIdx ?? ""}`;
                const now = Date.now();
                if (window.__dfSummonReplayKey === sk
                    && (now - (window.__dfSummonReplayAt | 0)) < 2500) {
                    return;
                }
                window.__dfSummonReplayKey = sk;
                window.__dfSummonReplayAt = now;
            } catch (eSumDed) { /* */ }
            const liveField = deps.getState().players[fromSeat]?.field || [];
            let insertIdx = action.insertIdx;
            if (insertIdx == null || insertIdx < 0) {
                if (action.cardName) {
                    insertIdx = liveField.findIndex((c) => c?.name === action.cardName);
                }
                if (insertIdx == null || insertIdx < 0) {
                    insertIdx = Math.max(0, liveField.length - 1);
                }
            }
            insertIdx = Math.min(insertIdx, Math.max(0, liveField.length - 1));
            const placed = liveField[insertIdx];
            const card = placed
                || (action.cardName
                    ? { name: action.cardName, category: "champion", power: 1, currentPower: 1 }
                    : null);
            if (!card) {
                await dfOnlineReplaySummonLand(action, fromSeat);
                return;
            }
            try {
                if (card.name) window.dfPrefetchCardArt?.(card.name);
            } catch (e) { /* */ }

            const qIdx = deps.dfQuadrantForPlayer(fromSeat);
            const q = deps.$(`quadrant-${qIdx}`);
            const handDiv = q?.querySelector(".quadrant-hand");
            const handRect = handDiv?.getBoundingClientRect?.();
            let summonSrc = null;
            if (handRect && handRect.width > 0 && handRect.height > 0) {
                summonSrc = {
                    x: handRect.left + handRect.width * 0.35,
                    y: handRect.top,
                    cx: handRect.left + handRect.width * 0.5,
                    cy: handRect.top + handRect.height * 0.5,
                    w: Math.min(90, handRect.width * 0.22),
                    h: Math.min(126, handRect.height * 0.9),
                    html: deps.buildFlyCardHtml(card),
                    isPlayerHand: false,
                };
            } else {
                // Fallback: centro do campo do invocador (adversário ainda vê o voo).
                const fieldEl = q?.querySelector(".quadrant-field");
                const fr = fieldEl?.getBoundingClientRect?.();
                if (fr && fr.width > 0) {
                    summonSrc = {
                        x: fr.left + fr.width * 0.5 - 40,
                        y: fr.top + fr.height * 0.15,
                        cx: fr.left + fr.width * 0.5,
                        cy: fr.top + fr.height * 0.2,
                        w: 72,
                        h: 100,
                        html: deps.buildFlyCardHtml(card),
                        isPlayerHand: false,
                    };
                }
            }
            if (placed) placed._summoning = true;
            deps.updateUI();
            // Layout flush (igual summon local) — sem isso getBoundingClientRect
            // do slot ainda é 0×0 e o .summon-fly nasce no canto (0,0).
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            let destReady = false;
            for (let attempt = 0; attempt < 6 && !destReady; attempt++) {
                const el = deps.getChampionDom?.(fromSeat, insertIdx)
                    || (typeof document !== "undefined" ? document.getElementById(`champ-${fromSeat}-${insertIdx}`) : null);
                const r = el?.getBoundingClientRect?.();
                if (r && r.width > 4 && r.height > 4) destReady = true;
                else await new Promise((res) => requestAnimationFrame(res));
            }
            try {
                window.sfx && window.sfx("champion_summon");
                window.sfx && window.sfx("champion_summon", { gain: 0.45, delay: 0.085 });
            } catch (e) { /* */ }
            window._summonLock = true;
            try {
                if (summonSrc) {
                    await deps.summonAnimation(fromSeat, insertIdx, summonSrc);
                    await deps.championLandImpact(fromSeat, insertIdx);
                } else {
                    await deps.championLandImpact(fromSeat, insertIdx);
                }
            } finally {
                window._summonLock = false;
            }
            if (placed) delete placed._summoning;
            deps.updateUI();
        }

        function dfOnlineQueueSync(actionType) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return;
            if (actionType !== "SYNC_STATE") return;
            clearTimeout(dfOnlineSyncTimer);
            dfOnlineSyncTimer = setTimeout(() => {
                dfOnlineBroadcastAction({
                    type: "SYNC_STATE",
                    playerId: deps.dfLocalSeat(),
                }, { full: true });
            }, 120);
        }

        function setOnlineStatus(msg, isErr) {
            const el = deps.$("online-status");
            if (!el) return;
            el.textContent = msg;
            el.style.color = isErr ? "#ff8a7a" : "#bbb";
        }

        function showOnlineLobby() {
            if (deps.getState()?.started && window.__DF_ONLINE) return;
            ["main", "play-menu", "hero-select", "objective-select", "ai-mode-select"].forEach((id) => {
                deps.$(id)?.classList.remove("active");
            });
            try {
                const g = deps.$("game");
                if (g) {
                    g.classList.remove("active", "arena-ready");
                    g.style.display = "none";
                }
                document.body.classList.remove("df-arena-visible");
                document.documentElement.classList.remove("df-combat-canvas");
                document.documentElement.setAttribute("data-df-menu-bg", "hero");
            } catch (eGame) { /* */ }
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.style.display = "";
                lobby.classList.add("active");
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            const urlIn = deps.$("online-server-url");
            if (urlIn) {
                urlIn.value =
                    localStorage.getItem("dragonfall:server") ||
                    window.__DF_DEFAULT_SERVER__ ||
                    DfNetClient?.defaultServerUrl?.() ||
                    "http://localhost:8787";
            }
            setOnlineStatus("Conectando… Pode levar até 1 minuto na primeira vez.");
            // Mesmo fundo DESOLAÇÃO da seleção de herói (mobile sem caixa preta).
            void (async () => {
                try {
                    document.documentElement.setAttribute("data-df-menu-bg", "hero");
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncLetterboxBg?.();
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                } catch (eBg) { /* */ }
            })();
        }

        async function dfPvPEnterQueue() {
            if (!dfNet) await initDfNet();
            if (!dfNet) return;
            // A espera na fila é a melhor janela para esquentar Pixi/GSAP: no MP o
            // orçamento de "cinematic ready" é curto e o Pixi frio fazia a primeira
            // animação da partida ser descartada sem aviso.
            try { window.__dfPrewarmVfxEngine?.("pvp-queue"); } catch (e) { /* */ }
            dfPvPStartQueueTimer();
            setOnlineStatus("Procurando oponente…");
            try {
                const res = await dfNet.joinQueue();
                if (res.matched) {
                    dfPvPStopQueueTimer();
                    window.__DF_SEAT = res.seat | 0;
                    dfPvPShowMatchFlash();
                    // Ranked preset: match_found handler envia o herói — não abrir #hero-select.
                    const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                    if (!preset?.heroId) {
                        setTimeout(() => showOnlineHeroSelect(), 800);
                    }
                }
            } catch (e) {
                setOnlineStatus("Erro na fila: " + (e.message || e), true);
            }
        }

        /** Standby — ative __DF_FEATURE_FLAGS__.rankedUi antes de expor o botão. */
        async function dfPvPEnterRankedQueue() {
            if (!window.__DF_FEATURE_FLAGS__?.rankedUi) {
                setOnlineStatus("Ranked em standby — API pronta, UI desligada.", true);
                return;
            }
            if (!dfNet) await initDfNet();
            if (!dfNet) return;
            dfPvPStartQueueTimer();
            setOnlineStatus("Fila ranked…");
            try {
                const res = await dfNet.joinRankedQueue();
                if (res.matched) {
                    dfPvPStopQueueTimer();
                    window.__DF_SEAT = res.seat | 0;
                    dfPvPShowMatchFlash();
                    const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                    if (!preset?.heroId) {
                        setTimeout(() => showOnlineHeroSelect(), 800);
                    }
                }
            } catch (e) {
                setOnlineStatus("Erro na fila ranked: " + (e.message || e), true);
            }
        }

        function dfNetServerUrl() {
            const el = deps.$("online-server-url");
            const fromInput = el?.value?.trim();
            if (fromInput) return fromInput.replace(/\/$/, "");
            return DfNetClient?.defaultServerUrl?.() || "http://localhost:8787";
        }

        async function initDfNet() {
            if (!window.DfNetClient) {
                setOnlineStatus("Cliente de rede não carregou (df-net-client.js).", true);
                return null;
            }
            dfNet = window.DfNetClient.create({
                serverUrl: dfNetServerUrl(),
                onEvent: (event, data) => dfOnlineOnNetEvent(event, data),
            });
                deps.bindNet(dfNet);
            setOnlineStatus("Conectando… Pode levar até 1 minuto na primeira vez.");
            try {
                await dfNet.connect();
                setOnlineStatus(`Conectado ao servidor (${dfNet.serverUrl}).`);
            } catch (e) {
                setOnlineStatus(
                    "Não foi possível conectar. Aguarde até 1 minuto e tente de novo, ou verifique a URL do servidor.",
                    true,
                );
                dfNet = null;
                deps.bindNet(null);
            }
            return dfNet;
        }

        function dfOnlineApplyArenaFromServer(data, label) {
            const arenaId = data?.arenaScenarioId
                || data?.gameState?.arenaScenarioId
                || data?.snapshot?.state?.arenaScenarioId
                || data?.snapshot?.arenaScenarioId
                || null;
            if (!arenaId) {
                console.warn("[DF online] arenaScenarioId ausente — sem sorteio local.", label || "");
                return null;
            }
            try {
                window.DfLayout?.setMatchArenaId?.(arenaId);
                window.__DF_MATCH_ARENA_ID = arenaId;
            } catch (e) { /* */ }
            return arenaId;
        }

        async function dfOnlineApplyReplaySync(replay, opts = {}) {
            if (!replay) return { ok: false, error: "NO_REPLAY" };
            const isReconnect = !!(opts.reconnect || replay.reconnected);
            const snapshotOnly = !!(opts.snapshotOnly || isReconnect);
            // Gap-fill / reconnect: só avança para o tip + snapshot — sem
            // reapresentar cada entry (evita turnos acelerados ao voltar).
            if (replay.gapFill && (snapshotOnly || Array.isArray(replay.entries))) {
                const tipSeq = replay.seq ?? replay.actionSeq;
                if (!snapshotOnly && Array.isArray(replay.entries) && replay.entries.length
                    && deps.getState()?.started) {
                    for (const entry of replay.entries) {
                        try {
                            const env = entry?.envelope || entry;
                            if (env?.action || env?.authoritativeState) {
                                dfOnlineApplyRemote(env);
                            }
                        } catch (e) { /* */ }
                    }
                }
                if (tipSeq != null) dfOnlineConfirmAppliedSeq(tipSeq);
                if (replay.gameState?.players?.length || replay.snapshot || replay.authoritativeState) {
                    const inner = dfOnlineUnwrapReplayState(replay);
                    if (inner?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot({ state: inner, full: true }, {
                                skipPhase: true,
                                forceAuthoritative: snapshotOnly,
                            });
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                }
                if (snapshotOnly) {
                    try { dfOnlineResetPresentQueue(); } catch (eRq) { /* */ }
                    try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq) { /* */ }
                    _dfPendingRemoteDuringResync = [];
                    if (isReconnect) dfOnlineArmReconnectQuiet(4500);
                }
                return { ok: true, gapFill: true, snapshotOnly };
            }
            _dfResyncInProgress = true;
            _dfPendingRemoteDuringResync = [];
            _dfStartTurnAfterResync = false;
            if (isReconnect) dfOnlineArmReconnectQuiet(4500);
            // Timeout: não prender remote_action para sempre.
            const resyncWatch = setTimeout(() => {
                if (!_dfResyncInProgress) return;
                console.warn("[DF online] resync timeout — liberando fila");
                _dfResyncInProgress = false;
                // Reconnect: descarta backlog — snapshot já é o estado atual.
                if (isReconnect || dfOnlineInReconnectQuiet()) {
                    _dfPendingRemoteDuringResync = [];
                    return;
                }
                const pending = _dfPendingRemoteDuringResync.splice(0);
                for (const env of pending) {
                    try { dfOnlineApplyRemote(env); } catch (e) { /* */ }
                }
            }, 12000);
            try {
                try { dfOnlineAbortCombatVisuals(); } catch (e) { /* */ }
                try { dfOnlineResetPresentQueue(); } catch (e) { /* */ }
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }

            const seq = replay.seq ?? replay.actionSeq;
            if (seq != null) dfOnlineConfirmAppliedSeq(seq);
            dfOnlineApplyArenaFromServer(replay, "replay_sync");
            const inner = dfOnlineUnwrapReplayState(replay);
            if (!inner?.players?.length) {
                if (Array.isArray(replay.entries) && replay.entries.length) {
                    deps.log(`Replay: ${replay.entries.length} evento(s) no log (estado via snapshot).`);
                }
                return { ok: false, error: "NO_GAME_STATE" };
            }
            deps.setApplyingRemote(true);
            try {
                window.__DF_ONLINE = true;
                if (replay.yourSeat != null) window.__DF_SEAT = replay.yourSeat | 0;
                else if (dfNet?.seat != null) window.__DF_SEAT = dfNet.seat | 0;
                if (replay.deckSeed != null) window.__DF_DECK_SEED = replay.deckSeed;
                document.body.classList.add("df-pvp-mode");
                document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                // Hub/splash não pode ficar por cima do tabuleiro (tela preta).
                try {
                    const hub = deps.$("df-hub-splash-layer");
                    if (hub) {
                        hub.setAttribute("aria-hidden", "true");
                        hub.style.display = "none";
                    }
                    window.dfPauseHubBackdrop?.({ releaseMobileDecoder: false });
                } catch (e) { /* */ }
                hideOnlineLobbyScreen();
                deps.$("main")?.classList.remove("active");
                deps.$("play-menu")?.classList.remove("active");
                deps.$("df-play-mode")?.classList.remove("active");
                deps.$("opcoes")?.classList.remove("active");
                deps.$("update-overlay")?.classList.remove("active");
                window.dfShowUpdateOverlay?.(false);
                window.dfShowMenuLoadBar?.(false);

                const needBoot = !deps.getState()?.started
                    || !deps.getState()?.players?.length
                    || deps.getState().playersCount < 2;
                // match_start em curso: não reentrar via replay (anti double-boot).
                if (window.__dfOnlineMatchBoot || window.__dfOnlineBootLockInput) {
                    if (!needBoot && inner?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: inner, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    }
                    return { ok: true, deferred: true };
                }
                if (needBoot) {
                    const heroIds = replay.heroIds
                        || [inner.players[0]?.heroId, inner.players[1]?.heroId];
                    const h0 = heroIds?.[0] || inner.players[0]?.heroId || "dragon";
                    const h1 = heroIds?.[1] || inner.players[1]?.heroId || "dragon";
                    deps.setSelectedMode?.(2);
                    deps.setSelectedWinPoints?.(inner.winPoints || 15);
                    deps.resetState(2, [h0, h1]);
                }
                dfOnlineReconcileSnapshot(
                    { state: inner, full: true },
                    { skipPhase: true, forceAuthoritative: !!opts.reconnect },
                );
                deps.getState().started = true;
                // Limpa flags de apresentação que escondem campeões no DOM.
                try { dfOnlineClearSummoningFlags(); } catch (e) { /* */ }
                try { dfOnlineAbortCombatVisuals(); } catch (e) { /* */ }
                deps.revealMatchBoard();
                const g = deps.$("game");
                if (g) {
                    g.style.display = "flex";
                    g.classList.add("active", "arena-ready");
                    g.removeAttribute("hidden");
                }
                document.body.classList.add("df-arena-visible");
                deps.updateUI(true);
                deps.checkWin({ fromAuthority: true });
                // Toast + startTurn só em retomada real (reconnect / cold boot),
                // não em rollback silencioso mid-partida (evita "Partida restaurada" falso
                // e startTurn duplicado → desync de turno).
                const coldOrReconnect = !!replay.reconnected
                    || !!opts?.forceToast
                    || !!(needBoot);
                const isReconnectResync = !!opts.reconnect || !!replay.reconnected;
                if (coldOrReconnect
                    && deps.getState().started
                    && deps.getState().winner === null) {
                    if (isReconnectResync) {
                        deps.floatText("Partida restaurada — você voltou ao combate!", "vp center", 2800);
                        deps.log("Estado restaurado (snapshot autoritativo).");
                        dfOnlineSyncTurnTimerFromPayload(replay);
                    } else {
                        deps.floatText("Partida restaurada — você voltou ao combate!", "vp center", 2800);
                        deps.log("Estado restaurado (snapshot autoritativo).");
                        _dfStartTurnAfterResync = true;
                    }
                } else if (deps.getState().started && deps.getState().winner === null) {
                    // Rollback silencioso: alinhar banner + relógio (evita timer preso em 0).
                    try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                    try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                    dfOnlineSyncTurnTimerFromPayload(replay);
                }
                // Replay VFX de ultimate recente no gap (ex.: Eurávia Conjuração).
                // Reconnect: NÃO — jogador deve ver só o estado atual.
                try {
                    if (!isReconnect && !dfOnlineInReconnectQuiet()) {
                        const entries = Array.isArray(replay.entries) ? replay.entries : [];
                        for (const ent of entries.slice(-8)) {
                            const a = ent?.action || ent;
                            if (!a || a.type !== "ULTIMATE_PLAY") continue;
                            const s = ent?.seq != null ? (ent.seq | 0) : null;
                            if (s != null && _dfUltReplaySeqs.has(s)) continue;
                            if (s != null) _dfUltReplaySeqs.add(s);
                            if (a.ultimateType === "drawCard" || a.ultimateType) {
                                void dfOnlineReplayUltimate({
                                    ...a,
                                    playerId: ent.fromSeat ?? a.playerId,
                                    _events: ent.events || [],
                                }).catch(() => {});
                                break;
                            }
                        }
                    }
                } catch (e) { /* */ }
            } finally {
                deps.setApplyingRemote(false);
            }
            return { ok: true };
            } finally {
                try { clearTimeout(resyncWatch); } catch (e) { /* */ }
                _dfResyncInProgress = false;
                // Reconnect / quiet: descarta backlog — evita “acelerar” turnos perdidos.
                if (isReconnect || dfOnlineInReconnectQuiet()) {
                    _dfPendingRemoteDuringResync = [];
                    try { dfOnlineResetPresentQueue(); } catch (eRq2) { /* */ }
                    try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq2) { /* */ }
                    try { deps.setApplyingRemote(false); } catch (eAr) { /* */ }
                }
                const pending = _dfPendingRemoteDuringResync.splice(0);
                // Após resync: um startTurn só (não empilhar com END_TURN remoto).
                if (_dfStartTurnAfterResync) {
                    _dfStartTurnAfterResync = false;
                    window.__dfOnlineSkipMaintRules = true;
                    try {
                        const cp = deps.getState().currentPlayer;
                        if (cp === 0 || cp === 1) await deps.startTurn?.(cp);
                    } catch (e) { /* */ }
                    finally {
                        window.__dfOnlineSkipMaintRules = false;
                    }
                }
                for (const env of pending) {
                    try { dfOnlineApplyRemote(env); } catch (e) { /* */ }
                }
            }
        }

        /**
         * MP: reassumir assento (persistência dragonfall:pvp) sem ir ao Hub.
         * Usado quando o socket perdeu a sala (NOT_IN_ROOM) ou o jogador voltou.
         */
        async function dfOnlineRecoverMatchSeat() {
            if (dfOnlineRecoverMatchSeat._busy) return dfOnlineRecoverMatchSeat._busy;
            const saved = (typeof window.DfNetClient?.readPersistedSession === "function")
                ? window.DfNetClient.readPersistedSession()
                : null;
            if (!saved?.code) return { ok: false, error: "NO_SESSION" };
            dfOnlineRecoverMatchSeat._busy = (async () => {
                try {
                    if (!dfNet) {
                        try { await initDfNet(); } catch (eN) { /* */ }
                    }
                    if (!dfNet?.tryResumeSession) return { ok: false, error: "NO_NET" };
                    window.__DF_ONLINE = true;
                    document.body.classList.add("df-pvp-mode");
                    const res = await dfNet.tryResumeSession();
                    if (!res?.ok) return res || { ok: false, error: "RESUME_FAILED" };
                    if (res.seat != null) window.__DF_SEAT = res.seat | 0;
                    document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                    if (res.replay) {
                        try {
                            await dfOnlineApplyReplaySync(res.replay, { forceToast: false, reconnect: true });
                        } catch (eR) { /* */ }
                    }
                    try {
                        const g = deps.$("game");
                        if (deps.getState()?.started && g) {
                            deps.revealMatchBoard?.();
                            g.style.display = "flex";
                            g.classList.add("active", "arena-ready");
                            g.removeAttribute("hidden");
                            document.body.classList.add("df-arena-visible", "df-pvp-mode");
                            deps.$("main")?.classList.remove("active");
                            deps.$("play-menu")?.classList.remove("active");
                            const hub = deps.$("df-hub-splash-layer");
                            if (hub) {
                                hub.setAttribute("aria-hidden", "true");
                                hub.style.display = "none";
                            }
                        }
                    } catch (eUi) { /* */ }
                    try { deps.updateUI?.(true); } catch (eU) { /* */ }
                    return res;
                } finally {
                    dfOnlineRecoverMatchSeat._busy = null;
                }
            })();
            return dfOnlineRecoverMatchSeat._busy;
        }

        /** Escape: tela preta / resume falho — volta ao hub sem travar. */
        async function dfOnlineForceExitStuckMatch(reason, opts = {}) {
            console.warn("[DF online] force exit stuck", reason || "");
            const seatErr = reason === "NOT_PLAYING" || reason === "NOT_IN_ROOM" || reason === "NO_SEAT";
            if (seatErr && opts.hard !== true && opts.clearSession !== true) {
                try {
                    const rec = await dfOnlineRecoverMatchSeat();
                    if (rec?.ok) {
                        deps.floatText("Reconectado à partida.", "info center", 1800);
                        return;
                    }
                    if (rec?.error && rec.error !== "ROOM_NOT_FOUND" && rec.error !== "NO_SESSION") {
                        deps.floatText("Reconectando à partida…", "warn center", 2200);
                        return;
                    }
                } catch (eRec) { /* segue saída */ }
            }
            const hard = opts.hard !== false && (
                reason === "ROOM_NOT_FOUND"
                || reason === "NOT_PLAYING"
                || opts.clearSession === true
            );
            try { deps.stopTimer?.(); } catch (e) { /* */ }
            if (hard) {
                try { await dfNet?.leaveRoom?.({ abandon: true, clearSession: true }); } catch (e) { /* */ }
                try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
            } else {
                // Falha transitória: sai da UI sem abandonar assento no servidor.
                try { await dfNet?.leaveRoom?.({ abandon: false, clearSession: false }); } catch (e) { /* */ }
            }
            // Sempre limpa flags MP no hub — evita pill Offline preso.
            try {
                dfClearOnlineMatchFlags({
                    force: true,
                    leaveNet: false,
                    clearSession: hard,
                    abandon: false,
                });
            } catch (e) {
                window.__DF_ONLINE = false;
                window.__dfTurnEndingPending = false;
                window.__dfPeerAiActive = false;
                document.body.classList.remove("df-pvp-mode", "df-online-seat-1", "df-arena-visible", "df-peer-ai");
            }
            const g = deps.$("game");
            if (g) {
                g.style.display = "none";
                g.classList.remove("active", "arena-ready");
            }
            try {
                const st = deps.getState();
                if (st) {
                    st.started = false;
                    st.winner = null;
                }
            } catch (e) { /* */ }
            hideOnlineLobbyScreen();
            deps.$("menu-overlay")?.classList.remove("active");
            deps.$("win-overlay")?.classList.remove("active");
            document.documentElement.classList.remove("df-win-active");
            try { deps.showPlayMenu?.(); } catch (e) { /* */ }
            deps.floatText(
                hard
                    ? "Não foi possível restaurar a partida — voltando ao menu."
                    : "Falha ao restaurar — tente de novo em instantes.",
                "warn center",
                3600,
            );
        }

        function dfOnlineSetPeerAiUi(active, seat) {
            // MP: IA do servidor pode assumir, mas SEM banner / texto "IA jogando…".
            window.__dfPeerAiActive = !!active;
            window.__dfPeerAiSeat = active ? (seat | 0) : null;
            document.body.classList.toggle("df-peer-ai", !!active);
            try {
                const banner = document.getElementById("df-peer-ai-banner");
                if (banner) {
                    banner.hidden = true;
                    banner.remove();
                }
            } catch (e) { /* */ }
        }

        /**
         * Boot: se há dragonfall:pvp, reconecta direto na partida (MP only).
         */
        async function dfTryResumePvpSession() {
            const saved = (typeof window.DfNetClient?.readPersistedSession === "function")
                ? window.DfNetClient.readPersistedSession()
                : null;
            if (!saved?.code) return { ok: false, error: "NO_SESSION" };
            deps.floatText("Reconectando à partida…", "info center", 2200);
            if (!dfNet) {
                try { await initDfNet(); } catch (e) { /* */ }
            }
            if (!dfNet?.tryResumeSession) return { ok: false, error: "NO_NET" };
            window.__DF_ONLINE = true;
            document.body.classList.add("df-pvp-mode");
            const res = await dfNet.tryResumeSession();
            if (!res?.ok) {
                const gone = res?.error === "ROOM_NOT_FOUND" || res?.error === "NO_SESSION";
                try {
                    dfClearOnlineMatchFlags({
                        force: true,
                        leaveNet: false,
                        clearSession: gone,
                        abandon: false,
                    });
                } catch (e) {
                    window.__DF_ONLINE = false;
                    document.body.classList.remove("df-pvp-mode");
                }
                if (gone) {
                    deps.floatText("Partida online não encontrada (expirou ou já terminou).", "warn center", 3200);
                    try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
                } else {
                    deps.floatText("Servidor ocupado — tente reconectar em instantes.", "warn center", 3200);
                }
                return res;
            }
            if (res.seat != null) window.__DF_SEAT = res.seat | 0;

            // Lobby / sem combate: não esconder o hub (evita tela preta).
            if (res.status && res.status !== "playing") {
                window.__DF_ONLINE = false;
                document.body.classList.remove("df-pvp-mode");
                try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
                try { await dfNet?.leaveRoom?.({ abandon: false, clearSession: true }); } catch (e) { /* */ }
                return { ok: false, error: "NOT_PLAYING" };
            }

            let replay = res.replay;
            for (let attempt = 0; attempt < 3; attempt++) {
                if (dfOnlineUnwrapReplayState(replay)?.players?.length) break;
                try {
                    await deps.wait?.(350 * (attempt + 1));
                    const more = await dfNet.getReplay?.(0);
                    if (more?.ok) replay = more;
                } catch (e) { /* */ }
            }

            const applied = await dfOnlineApplyReplaySync(
                { ...(replay || {}), reconnected: true },
                { forceToast: true },
            );
            if (!applied?.ok || !deps.getState()?.started) {
                await dfOnlineForceExitStuckMatch(applied?.error || "RESUME_NO_BOARD", {
                    hard: false,
                    clearSession: false,
                });
                return { ok: false, error: applied?.error || "RESUME_NO_BOARD" };
            }
            const g = deps.$("game");
            if (!g?.classList.contains("active")) {
                await dfOnlineForceExitStuckMatch("GAME_NOT_VISIBLE", { hard: false, clearSession: false });
                return { ok: false, error: "GAME_NOT_VISIBLE" };
            }
            return { ok: true, seat: res.seat, code: res.code };
        }

        async function dfOnlineOnNetEvent(event, data) {
            // Fora de partida online: não poluir vs-IA com Offline / toasts / remote_action.
            // Lobby ainda precisa de match_found / match_start / heroes / room_state.
            if (!window.__DF_ONLINE) {
                const lobbyOk = event === "match_found" || event === "ranked_match_found"
                    || event === "match_start" || event === "hello" || event === "version_mismatch"
                    || event === "heroes_update" || event === "room_state" || event === "queue_update"
                    || event === "ranked_queue_update" || event === "replay_sync" || event === "reconnected"
                    || event === "connected" || event === "net_status";
                if (!lobbyOk) {
                    const pill = document.getElementById("df-net-status");
                    if (pill) {
                        pill.style.opacity = "0";
                        pill.textContent = "";
                    }
                    return;
                }
            }
            if (event === "version_mismatch") {
                const local = data?.local || window.__DF_DISPLAY_VERSION || "?";
                const remote = data?.server || "?";
                const now = Date.now();
                if (!dfOnlineOnNetEvent._lastVerToast || now - dfOnlineOnNetEvent._lastVerToast > 8000) {
                    dfOnlineOnNetEvent._lastVerToast = now;
                    deps.floatText(
                        `Versão do jogo (${local}) ≠ servidor (${remote}). Atualize o servidor / o jogo antes de jogar online.`,
                        "warn center",
                        5200,
                    );
                }
                deps.log(`Incompatível: cliente ${local}, servidor ${remote}.`);
                return;
            }
            if (event === "hello" && data?.gameVersion) {
                const local = window.__DF_DISPLAY_VERSION || "";
                if (local && data.gameVersion !== local) {
                    // version_mismatch já notifica — evita toast duplicado.
                    return;
                }
                return;
            }
            if (event === "reconnected") {
                dfOnlineOnNetEvent._discSince = 0;
                dfOnlineThrottledFailToast._disc = 0;
                setNetStatusUi("connected");
                deps.floatText("Reconectado ao servidor.", "info center", 1800);
                // Seat só do ACK do servidor (yourSeat / dfNet.seat após join_room).
                if (data?.yourSeat != null) window.__DF_SEAT = data.yourSeat | 0;
                else if (data?.seat != null) window.__DF_SEAT = data.seat | 0;
                else if (dfNet?.seat != null) window.__DF_SEAT = dfNet.seat | 0;
                document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                document.body.classList.add("df-pvp-mode");
                window.__DF_ONLINE = true;
                // Antes de aplicar: corta filas de present (evita fast-forward).
                try { dfOnlineResetPresentQueue(); } catch (ePre) { /* */ }
                try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq) { /* */ }
                _dfPendingRemoteDuringResync = [];
                dfOnlineArmReconnectQuiet(5000);
                try { deps.setApplyingRemote(false); } catch (eAr0) { /* */ }
                if (data?.replay?.gameState || data?.replay?.snapshot) {
                    _dfSkipNextReplaySyncSeq = data.replay.seq != null ? (data.replay.seq | 0) : -1;
                    await dfOnlineApplyReplaySync(
                        {
                            ...data.replay,
                            reconnected: true,
                            yourSeat: window.__DF_SEAT,
                            turnDeadline: data.turnDeadline ?? data.replay.turnDeadline ?? null,
                        },
                        { forceToast: true, reconnect: true, snapshotOnly: true },
                    );
                } else {
                const board = data?.gameState || data?.snapshot;
                if (board && (board.players?.length || board.gameState || board.snapshot)) {
                    await dfOnlineApplyReplaySync(
                        { ...(typeof board === "object" ? board : {}), ...data, reconnected: true },
                        { forceToast: true, reconnect: true, snapshotOnly: true },
                    );
                } else {
                    // Reconnect sem board no envelope — puxa replay completo.
                    try {
                        const more = await dfNet?.getReplay?.(0);
                        if (more?.ok || more?.gameState || more?.snapshot) {
                            await dfOnlineApplyReplaySync(
                                { ...(more || {}), reconnected: true, yourSeat: window.__DF_SEAT },
                                { forceToast: true, reconnect: true, snapshotOnly: true },
                            );
                        }
                    } catch (e) { /* */ }
                }
                }
                // Garante tabuleiro visível (mesmo path de dfOnlineApplyReplaySync).
                try {
                    const g = deps.$("game");
                    if (deps.getState()?.started) {
                        deps.revealMatchBoard?.();
                        if (g) {
                            g.style.display = "flex";
                            g.classList.add("active", "arena-ready");
                            g.removeAttribute("hidden");
                        }
                        document.body.classList.add("df-arena-visible");
                        deps.$("main")?.classList.remove("active");
                        deps.$("play-menu")?.classList.remove("active");
                        const hub = deps.$("df-hub-splash-layer");
                        if (hub) {
                            hub.setAttribute("aria-hidden", "true");
                            hub.style.display = "none";
                        }
                        window.dfPauseHubBackdrop?.({ releaseMobileDecoder: false });
                    }
                } catch (eReveal) { /* */ }
                // Assert turno: seat local vs currentPlayer autoritativo.
                try {
                    const cp = deps.getState()?.currentPlayer;
                    const seat = deps.dfLocalSeat?.() ?? window.__DF_SEAT;
                    if ((cp === 0 || cp === 1) && (seat === 0 || seat === 1)) {
                        const mine = cp === seat;
                        if (!!deps.dfIsMyTurn?.() !== mine) {
                            console.warn("[DF online] turn/seat drift after reconnect — rollback");
                            await dfOnlineRollbackToServer();
                        }
                    }
                } catch (e) { /* */ }
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                return;
            }
            if (event === "turn_deadline") {
                dfOnlineSyncTurnTimerFromPayload(data);
                return;
            }
            if (event === "net_status") {
                setNetStatusUi(data?.status || "connected");
                return;
            }
            if (event === "server_restarting") {
                setNetStatusUi("reconnecting");
                deps.floatText("Servidor reiniciando — reconectando…", "warn center", 2800);
                return;
            }
            if (event === "connected") {
                dfOnlineOnNetEvent._discSince = 0;
                setNetStatusUi("connected");
                return;
            }
            // connect_error transitório (Socket.IO ainda tenta) — sem toast.
            if (event === "connect_error") {
                if (data?.transient) {
                    setNetStatusUi("reconnecting");
                    return;
                }
                const now = Date.now();
                if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                    dfOnlineThrottledFailToast._disc = now;
                    if (window.__DF_ONLINE && deps.getState()?.started) {
                        setNetStatusUi("offline");
                        deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                    }
                }
                return;
            }
            if (event === "disconnected") {
                // Reconexão automática em curso: não assuste o jogador a cada blip de rede.
                if (data?.willReconnect) {
                    setNetStatusUi("reconnecting");
                    const now = Date.now();
                    if (!dfOnlineOnNetEvent._discSince) dfOnlineOnNetEvent._discSince = now;
                    // Só avisa se ficar >4s sem voltar (evita “Sem conexão” fantasma o jogo todo).
                    if (now - dfOnlineOnNetEvent._discSince < 4000) return;
                    if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                        dfOnlineThrottledFailToast._disc = now;
                        if (window.__DF_ONLINE && deps.getState()?.started) {
                            deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                        }
                    }
                    return;
                }
                setNetStatusUi("offline");
                const now = Date.now();
                if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                    dfOnlineThrottledFailToast._disc = now;
                    if (window.__DF_ONLINE && deps.getState()?.started) {
                        deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                    }
                }
                return;
            }
            if (event === "replay_sync") {
                if (_dfSkipNextReplaySyncSeq != null) {
                    const skipSeq = _dfSkipNextReplaySyncSeq;
                    _dfSkipNextReplaySyncSeq = null;
                    const incomingSeq = data?.seq != null ? (data.seq | 0) : null;
                    if (skipSeq === -1 || (incomingSeq != null && incomingSeq === skipSeq)) {
                        dfOnlineSyncTurnTimerFromPayload(data);
                        try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                        try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                        return;
                    }
                }
                // Mid-match push: reconcile silencioso (sem toast / startTurn).
                await dfOnlineApplyReplaySync(data, { forceToast: false });
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                return;
            }
            if (event === "match_found" || event === "ranked_match_found") {
                if (data?.seatToken) {
                    try {
                        const code = data.code || dfNet?.roomCode;
                        const seat = data.seat != null ? data.seat : dfNet?.seat;
                        localStorage.setItem("dragonfall:pvp", JSON.stringify({
                            code,
                            seat,
                            seatToken: data.seatToken,
                        }));
                    } catch (e) { /* */ }
                }
                dfPvPStopQueueTimer();
                window.__DF_SEAT = data.seat | 0;
                dfApplyRoomHeroState(data);
                deps.heroDefs.forEach((h) => { if (h.image) window.dfPrefetchArtUrl?.(h.image, "low"); });
                dfPvPShowMatchFlash();
                const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                if (preset?.heroId) {
                    setTimeout(() => {
                        void (async () => {
                            try {
                                deps.setSelectedHeroId(preset.heroId);
                                await dfNet.setHero(preset.heroId, {
                                    deckCardNames: preset.deckCardNames || null,
                                });
                                setOnlineStatus("Herói enviado. Aguardando o adversário…");
                            } catch (e) {
                                setOnlineStatus("Erro ao enviar herói: " + (e.message || e), true);
                                showOnlineHeroSelect();
                            }
                        })();
                    }, 600);
                } else {
                    setTimeout(() => showOnlineHeroSelect(), 800);
                }
                return;
            }
            if (event === "match_start") {
                if (data?.seatToken) {
                    try {
                        const seat = data.yourSeat != null ? data.yourSeat : window.__DF_SEAT;
                        localStorage.setItem("dragonfall:pvp", JSON.stringify({
                            code: data.code || dfNet?.roomCode,
                            seat,
                            seatToken: data.seatToken,
                        }));
                    } catch (e) { /* */ }
                }
                hideOnlineLobbyScreen();
                await startOnlineMatch(data);
                return;
            }
            if (event === "room_state") {
                dfApplyRoomHeroState(data);
                if (data?.arenaScenarioId) {
                    dfOnlineApplyArenaFromServer(data, "room_state");
                }
                if (data?.status === "playing") {
                    hideOnlineLobbyScreen();
                    // Cold-boot só via match_start (nunca room_state) — evita
                    // double reveal/música/startTurn quando os eventos chegam juntos.
                    if (window.__dfOnlineMatchBoot || window.__dfOnlineBootLockInput
                        || window.__dfOnlineBootDone || _dfOnlineBootPromise) {
                        return;
                    }
                    // Já em partida: no máximo reconcile silencioso se estado veio.
                    if (deps.getState()?.started && data.gameState?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot(
                                { state: data.gameState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI?.(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                }
                return;
            }
            if (event === "late_action_ack") {
                // ACK chegou depois do timeout — reconciliar se o turno/estado divergiu.
                const late = data?.ack;
                if (!late?.authoritativeState?.players?.length) return;
                const lateSeq = late.seq != null ? (late.seq | 0) : (data?.seq != null ? (data.seq | 0) : null);
                // Já orquestrou startTurn para este END_TURN — só reconciliar estado.
                if (late?.action?.type === "END_TURN"
                    && lateSeq != null
                    && lateSeq === (window.__dfLastEndTurnStartSeq | 0)) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: late.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    return;
                }
                if (window.__dfTurnEndingPending) {
                    // Actor ainda processando END_TURN — só aplica estado, sem startTurn duplicado.
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: late.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    return;
                }
                const beforeCp = deps.getState()?.currentPlayer;
                const afterCp = late.authoritativeState.currentPlayer;
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(
                        { state: late.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                if ((beforeCp === 0 || beforeCp === 1)
                    && (afterCp === 0 || afterCp === 1)
                    && beforeCp !== afterCp) {
                    if (lateSeq != null) window.__dfLastEndTurnStartSeq = lateSeq;
                    window.__dfOnlineSkipMaintRules = true;
                    void deps.startTurn(afterCp).finally(() => {
                        window.__dfOnlineSkipMaintRules = false;
                    });
                }
                return;
            }
            if (event === "remote_action") {
                void dfOnlineApplyRemote(data);
                return;
            }
            if (event === "peer_ai_control") {
                dfOnlineSyncTurnTimerFromPayload(data);
                if (data?.active) {
                    dfOnlineSetPeerAiUi(true, data.seat);
                    // Sem toast de IA — takeover silencioso.
                } else {
                    const local = typeof deps.dfLocalSeat === "function"
                        ? deps.dfLocalSeat()
                        : (window.__DF_SEAT | 0);
                    const seatCleared = data?.seat != null ? (data.seat | 0) : null;
                    const wasLocalSeat = seatCleared != null && seatCleared === (local | 0);
                    dfOnlineSetPeerAiUi(false);
                    // MP-only: limpa filas de apresentação e libera input.
                    try { _dfPresenter?.reset?.(); } catch (eReset) { /* */ }
                    try { deps.ensureTurnReady?.(); } catch (eReady) { /* */ }
                    try { deps.updateUI?.(true); } catch (eUi) { /* */ }
                    if (wasLocalSeat) {
                        deps.floatText("Você reassumiu o controle da partida.", "info center", 2200);
                        deps.log("Controle humano restaurado (IA desligada).");
                        // Se é a vez do assento local, garante timer/input.
                        try {
                            if (deps.getState()?.currentPlayer === local) {
                                deps.startTimer?.();
                            }
                        } catch (eT) { /* */ }
                    } else {
                        deps.floatText("Oponente voltou à partida.", "info center", 2200);
                        deps.log("Oponente reconectou.");
                    }
                }
                return;
            }
            if (event === "peer_disconnected" || event === "peer_left") {
                // Pós-vitória: sair do menu NÃO é desistência.
                const st = deps.getState();
                const matchAlreadyOver = st?.winner != null
                    || deps.getGamePhase?.() === "game-over"
                    || !!document.getElementById("win-overlay")?.classList?.contains("active");
                if (matchAlreadyOver) {
                    return;
                }
                dfOnlineSyncTurnTimerFromPayload(data);
                if (data?.forfeit || (data?.winner != null && !data?.abandoned && !data?.canReconnect)) {
                    deps.floatText("Oponente desistiu — você venceu!", "vp center", 3200);
                    deps.log("Oponente desistiu da partida.");
                    if (deps.getState()?.started) {
                        const winner = data?.winner != null
                            ? (data.winner | 0)
                            : (data?.seat != null ? (1 - (data.seat | 0)) : deps.dfLocalSeat());
                        deps.getState().winner = winner;
                        deps.stopTimer();
                        deps.checkWin({ delayMs: 0 });
                        try { deps.showWin?.(); } catch (e) { /* */ }
                    }
                    return;
                }
                if (data?.canReconnect || data?.abandoned) {
                    deps.floatText(
                        data?.abandoned
                            ? "Oponente desconectou."
                            : "Oponente desconectou — pode voltar em instantes.",
                        "warn center",
                        3200,
                    );
                    deps.log(data?.abandoned
                        ? "Oponente abandonou (servidor assume)."
                        : "Oponente desconectou (reconexão possível).");
                    // Alinha estado/timer com o servidor (evita relógio em 0).
                    try {
                        const rolled = await dfOnlineRollbackToServer?.();
                        if (!rolled) void dfOnlineRecoverMatchSeat();
                    } catch (e1) {
                        try { void dfOnlineRecoverMatchSeat(); } catch (e2) { /* */ }
                    }
                    return;
                }
                deps.floatText("Oponente desconectou.", "warn center", 2600);
                deps.log("Oponente saiu da sala.");
            }
        }

        async function dfOnlineApplyRemoteBody(envelope) {
            const useSnapshot = envelope.snapshot?.players?.length;
            const act = envelope.action;
            const actType = act?.type;
            if (actType === "END_TURN") {
                await dfOnlineHandleRemoteEndTurn(envelope);
                return;
            }
            if (actType === "TALENT_START" && useSnapshot) {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
                return;
            }
            if (actType === "REACTIVE_BLOCK_QUERY" && act) {
                await dfOnlineHandleReactiveBlockQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_BLOCK_ANSWER" && act) {
                if (_dfReactiveBlockWaiter) {
                    _dfReactiveBlockWaiter.resolve(!!act.blocked);
                }
                return;
            }
            if (actType === "REACTIVE_PROTECTION_QUERY" && act) {
                await dfOnlineHandleReactiveProtectQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_PROTECTION_ANSWER" && act) {
                if (_dfReactiveProtectWaiter) {
                    _dfReactiveProtectWaiter.resolve(!!act.protected || !!act.use);
                }
                return;
            }
            if (actType === "REACTIVE_CANCEL_QUERY" && act) {
                await dfOnlineHandleReactiveCancelQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_CANCEL_ANSWER" && act) {
                if (_dfReactiveCancelWaiter) {
                    _dfReactiveCancelWaiter.resolve(!!act.cancelled || !!act.use);
                }
                return;
            }
            if (useSnapshot) {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
            }
            const anim = act?.anim;
            if (anim?.kind) dfOnlineQueueRemoteVisual(anim);
            dfOnlineCheckWinFromAuthority(envelope);
        }

        function dfOnlineApplyRemote(envelope) {
            if (!envelope) return;
            if (_dfResyncInProgress) {
                const t = envelope.action?.type;
                if (t === "SURRENDER") {
                    // SURRENDER sempre processa
                } else {
                    _dfPendingRemoteDuringResync.push(envelope);
                    return;
                }
            }
            // Quiet pós-reconnect: só materializa estado — sem fila de VFX
            // (senão o cliente “acelera” turnos até o presente).
            if (dfOnlineInReconnectQuiet()) {
                const quietSeq = envelope.seq != null ? (envelope.seq | 0) : null;
                if (quietSeq != null && quietSeq <= (_dfLastRemoteSeq | 0)) return;
                try {
                    if (!dfOnlineMaterializeStateDiff(envelope)) {
                        // Sem patch válido: puxa tip silencioso depois.
                        if (quietSeq != null) dfOnlineConfirmAppliedSeq(quietSeq);
                        void dfOnlineGapFillFromApplied("reconnect_quiet");
                        return;
                    }
                    if (quietSeq != null) dfOnlineConfirmAppliedSeq(quietSeq);
                    const auth = envelope.authoritativeState;
                    if (auth?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot({ state: auth, full: true }, { skipPhase: true });
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                } catch (eQ) {
                    console.warn("[DF online] reconnect quiet apply", eQ);
                }
                return;
            }
            const actType = envelope.action?.type;
            const authCp = envelope.authoritativeState?.currentPlayer;
            const seq = envelope.seq != null ? (envelope.seq | 0) : null;
            // Eco do próprio ACK: ignorar. END_TURN forçado / seq adiantado: reconciliar.
            if (envelope.fromSeat === deps.dfLocalSeat()) {
                const st = deps.getState();
                const seqAhead = seq != null && seq > (_dfLastRemoteSeq | 0);
                const cpDrift = (authCp === 0 || authCp === 1)
                    && authCp !== st?.currentPlayer;
                const turnDrift = envelope.authoritativeState?.turnNumber != null
                    && (envelope.authoritativeState.turnNumber | 0) !== (st?.turnNumber | 0);
                if (actType === "END_TURN"
                    && (envelope.forced || seqAhead || cpDrift || turnDrift)
                    && (authCp === 0 || authCp === 1 || envelope.forced)) {
                    // segue — precisa sincronizar
                } else {
                    return;
                }
            }
            // Idempotência peer: descarta seq já aplicado.
            if (seq != null && seq <= _dfLastRemoteSeq) return;
            // Materializar patches antes de avançar seq / apresentar.
            if (!dfOnlineMaterializeStateDiff(envelope)) {
                // PRESENT/PLAY_VISUAL: nunca dropar o VFX — replay anim mesmo sem patch.
                if ((actType === "PLAY_VISUAL" || actType === "PRESENT")
                    && envelope.action?.anim?.kind) {
                    if (seq != null) dfOnlineConfirmAppliedSeq(seq);
                    const kind = envelope.action.anim.kind;
                    const anim = envelope.action.anim;
                    void dfOnlineEnqueuePresent(() => dfOnlineReplayAnim(anim), "fx", { kind })
                        .catch((e) => console.warn("[DF online] PRESENT gap visual", e));
                    void dfOnlineGapFillFromApplied(actType + "_stateDiff");
                    return;
                }
                // SUMMON/END_TURN: gap-fill síncrono na fila (não dropar sem recuperar).
                if (actType === "SUMMON" || actType === "END_TURN"
                    || actType === "FIELD_COMMIT" || actType === "DRAW_CARD") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlineGapFillFromApplied(actType + "_stateDiff");
                    }, actType + "-gap");
                } else {
                    void dfOnlineGapFillFromApplied(actType || "remote");
                }
                return;
            }
            if (seq != null) dfOnlineConfirmAppliedSeq(seq);

            // IA disconnect: UMA fila serial + pausas estilo vs-IA (gap ≥1,5s).
            // Sem isso: várias ações em <2s, cartas sumindo e ataque atrasado.
            // Perguntas/respostas reativas NUNCA entram nesta fila: o atacante
            // está bloqueado esperando a ANSWER, e enfileirá-la atrás das pausas
            // da IA recriaria o congelamento de vários segundos.
            const isReactiveType = typeof actType === "string"
                && actType.startsWith("REACTIVE_");
            if (envelope.serverAi && actType
                && actType !== "PLAY_VISUAL" && actType !== "PRESENT"
                && actType !== "SURRENDER" && !isReactiveType) {
                void dfOnlineEnqueueAiPresent(async () => {
                    const waitMs = (ms) => deps.wait?.(ms) || new Promise((r) => setTimeout(r, ms));
                    // O servidor já espaça as ações da IA (~2,5s). A pausa aqui só
                    // cobre rajadas (gap-fill / reconexão): espera o que falta pro
                    // gap alvo em vez de somar em cima da espera que já houve.
                    const paceGap = async (targetMs) => {
                        const since = Date.now() - (_dfAiLastPresentAt || 0);
                        const left = Math.min(targetMs, targetMs - since);
                        if (left > 0) await waitMs(left);
                        _dfAiLastPresentAt = Date.now();
                    };
                    try {
                        if (actType === "ATTACK_RESOLVE") {
                            await dfOnlinePresentRemote({
                                ...envelope,
                                action: { ...(envelope.action || {}), type: "ATTACK_RESOLVE" },
                            });
                            await paceGap(1100);
                            return;
                        }
                        if (actType === "END_TURN") {
                            // A vez volta pro humano na hora; o gate do summon da
                            // IA só atrasava o início do turno dele.
                            try {
                                await Promise.race([
                                    _dfPeerSummonGate,
                                    waitMs(600),
                                ]);
                            } catch (eEt) { /* */ }
                            await dfOnlineHandleRemoteEndTurn(envelope);
                            _dfAiLastPresentAt = Date.now();
                            return;
                        }
                        await dfOnlinePresentRemote(envelope);
                        const pauseMs = actType === "SUMMON" ? 2300
                            : (actType === "ABILITY_TARGET" || actType === "TALENT_TARGET") ? 1700
                            : actType === "ULTIMATE_PLAY" ? 2100
                            : actType === "TALENT_START" ? 1400
                            : 1500;
                        await paceGap(pauseMs);
                    } catch (eAi) {
                        console.warn("[DF online] serverAi present", actType, eAi);
                    }
                }, `serverAi:${actType}`);
                return;
            }

            if ((actType === "PLAY_VISUAL" || actType === "PRESENT") && envelope.action?.anim?.kind) {
                // Nunca aplicar snapshot de PLAY_VISUAL/PRESENT — costuma ser estado pré-efeito.
                const kind = envelope.action.anim.kind;
                // On-enter: paralelo à fila do summon (peer vê VFX junto do land).
                if (DF_PARALLEL_VISUAL_KINDS.has(kind)) {
                    if (envelope.action.anim.fieldPatches?.length) {
                        _dfLastVisualPatchAt = Date.now();
                        _dfLastVisualSeq = Math.max(_dfLastVisualSeq, envelope.seq | 0);
                    }
                    const run = async () => {
                        if (DF_ON_ENTER_VISUAL_KINDS.has(kind) && Date.now() < _dfPeerSummonUntil) {
                            try { await _dfPeerSummonGate; } catch (e) { /* */ }
                        }
                        await dfOnlineReplayAnim(envelope.action.anim);
                    };
                    if (_dfPresenter) {
                        const fxTo = _dfPresenter.resolveFxTimeout?.(kind)
                            ?? (["strong_arm", "imitar", "legado", "vinganca", "desacelerar"].includes(kind)
                                ? (_dfPresenter.FX_TIMEOUT_BUFF_MS || 6500)
                                : _dfPresenter.FX_TIMEOUT_MS);
                        void _dfPresenter.enqueue("fx", run, fxTo, { kind })
                            .catch((e) => console.warn("[DF online] parallel visual", e));
                    } else {
                        void run().catch((e) =>
                            console.warn("[DF online] parallel visual", e));
                    }
                    return;
                }
                // talent_cast / discard / board: fila board serializada.
                void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope), "board", { kind });
                return;
            }

            if (actType === "ULTIMATE_PLAY" && envelope.action) {
                const preField = deps.captureFieldForPostDestroy?.();
                const trick = (envelope.events || []).find((e) => e?.type === "TRICKERY_SWAP");
                const ultSeq = envelope.seq != null ? (envelope.seq | 0) : null;
                if (ultSeq != null) _dfUltReplaySeqs.add(ultSeq);
                const ut = envelope.action.ultimateType;
                // drawCard (Eurávia): defer auth até após cinemática — mão não “pula” a carta.
                // hook (Gancho): defer para o pull ver o campeão no campo de origem.
                // cometStarfall: defer para shatter dos mortos após o cometa (não sumir seco).
                const deferAuth = ut === "drawCard" || ut === "hook" || ut === "resurrect"
                    || ut === "summonDragon" || ut === "cometStarfall" || ut === "banish"
                    || ut === "fireAndIce" || ut === "infinitePower";
                const authState = envelope.authoritativeState;
                const applyAuth = () => {
                    if (authState?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            if (ut === "summonDragon") {
                                dfOnlineMarkDragonTokensFromEvents(authState, envelope.events);
                            }
                            dfOnlineReconcileSnapshot(
                                { state: authState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    } else if (envelope.snapshot) {
                        dfOnlineApplyIncomingSnapshot(envelope);
                    }
                };
                if (!deferAuth) applyAuth();
                const hookSteal = (envelope.events || []).find((e) => e?.type === "HOOK_STEAL");
                const runUlt = async () => {
                    try {
                        await dfOnlineReplayUltimate({
                            ...envelope.action,
                            playerId: envelope.fromSeat,
                            swapEnemyP: trick?.enemyP,
                            swapEnemyI: trick?.enemyI,
                            fromP: hookSteal?.fromP,
                            fromI: hookSteal?.fromI,
                            _events: envelope.events || [],
                        });
                    } catch (e) {
                        console.warn("[DF online] ULTIMATE_PLAY cinematic", e);
                    }
                    if (deferAuth) applyAuth();
                    if (ut === "summonDragon") {
                        const marked = [];
                        try {
                            const st = deps.getState();
                            for (const e of (envelope.events || [])) {
                                if (e?.type !== "DRAGON_TOKEN_SUMMON" && e?.visual !== "dragon_token_summon") continue;
                                const op = e.ownerP ?? e.casterIdx ?? e.playerId ?? envelope.fromSeat;
                                const field = st?.players?.[op]?.field;
                                if (!field?.length) continue;
                                let idx = e.insertIdx != null ? (e.insertIdx | 0) : field.length - 1;
                                if (e.uid) {
                                    const byUid = field.findIndex((c) => c && String(c.uid) === String(e.uid));
                                    if (byUid >= 0) idx = byUid;
                                }
                                if (field[idx]) {
                                    field[idx]._summoning = true;
                                    marked.push({ ownerP: op | 0, idx });
                                }
                            }
                        } catch (eM) { /* */ }
                        try { deps.updateUI?.(true); } catch (eU) { /* */ }
                        try {
                            await dfOnlineAnimateMarkedDragonTokens(marked);
                        } finally {
                            // Paridade com o `finally` do SUMMON: se a cinemática
                            // for abortada (timeout do apresentador) o Dragão Azul
                            // não pode ficar invisível para o adversário.
                            dfOnlineClearSummoningFlags();
                            try { deps.updateUI?.(true); } catch (eU2) { /* */ }
                            dfOnlineSweepOrphanSummoningDom();
                            dfOnlineEnsurePeerFieldVisible(
                                envelope.fromSeat,
                                envelope.authoritativeState,
                            );
                        }
                    }
                    if (preField) {
                        try {
                            deps.replayPostDestroyAfterAuthority?.(preField, { visualOnly: true });
                        } catch (e) { /* */ }
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                };
                // Serializa na fila board (timeout ≥ conjure) — evita sweep mid-cinemática.
                const ultTimeout = (ut === "drawCard" || ut === "hook" || ut === "summonDragon") ? 9000 : 8000;
                if (_dfPresenter?.enqueue) {
                    void _dfPresenter.enqueue("board", runUlt, ultTimeout);
                } else {
                    void runUlt();
                }
                return;
            }

            if (actType === "SURRENDER") {
                // Vitória/derrota imediata — não deixa o peer continuar jogando.
                if (envelope.authoritativeState?.players?.length) {
                    dfOnlineApplyAuthoritativeState(envelope);
                }
                const st = deps.getState();
                if (st?.started && st.winner == null) {
                    const from = envelope.fromSeat | 0;
                    st.winner = (from + 1) % (st.playersCount || 2);
                }
                deps.stopTimer();
                deps.floatText(
                    envelope.fromSeat === deps.dfLocalSeat()
                        ? "Você desistiu."
                        : "Oponente desistiu — você venceu!",
                    "vp center",
                    2800,
                );
                deps.checkWin({ delayMs: 0 });
                try { deps.showWin?.(); } catch (e) { /* */ }
                return;
            }

            if (actType === "SYNC_STATE" || actType === "SUMMON" || actType === "TALENT_START"
                || actType === "TALENT_DISCARD" || actType === "ABILITY_TARGET"
                || actType === "DRAW_CARD" || actType === "FIELD_COMMIT") {
                if (window.__dfCombatActive && actType === "SYNC_STATE") {
                    // Deferir SYNC durante combate — evita revive.
                    const prevSeq = window.__dfDeferredReconcile?.envelope?.seq | 0;
                    const curSeq = envelope?.seq | 0;
                    if (!window.__dfDeferredReconcile || curSeq >= prevSeq) {
                        window.__dfDeferredReconcile = { envelope, kind: "SYNC_STATE" };
                    }
                    return;
                }
                // SYNC cosmético: só presentation — sem auth clobber.
                if (actType === "SYNC_STATE") {
                    void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope));
                    return;
                }
                // SUMMON/FIELD_COMMIT/…: fila serial (humano/peer). serverAi já
                // foi tratado acima — não duplicar.
                if (actType === "DRAW_CARD" || actType === "SUMMON"
                    || actType === "FIELD_COMMIT" || actType === "TALENT_START"
                    || actType === "ABILITY_TARGET") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlinePresentRemote(envelope);
                    }, actType);
                    return;
                }
                if (actType === "TALENT_DISCARD") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlinePresentRemote(envelope);
                    }, "TALENT_DISCARD");
                    return;
                }
                dfOnlineApplyAuthoritativeState(envelope);
                return;
            }

            if (actType === "END_TURN") {
                // Serial: espera SUMMON em voo; aplica CP no início do handler.
                void dfOnlineEnqueueSeqCritical(async () => {
                    try {
                        await Promise.race([
                            _dfPeerSummonGate,
                            deps.wait?.(1500) || new Promise((r) => setTimeout(r, 1500)),
                        ]);
                    } catch (e) { /* */ }
                    await dfOnlineHandleRemoteEndTurn(envelope);
                }, "END_TURN");
                return;
            }

            if (actType === "ATTACK_RESOLVE" && envelope.action) {
                if (seq != null) _dfLastAttackResolveSeq = Math.max(_dfLastAttackResolveSeq, seq | 0);
                dfOnlineApplyAttackResolve(envelope);
                return;
            }

            // Reação: processar NA HORA (fora da fila visual) — senão o atacante
            // espera 2–5s atrás de summon/on-enter enquanto o QUERY envelhece.
            if (actType === "REACTIVE_BLOCK_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveBlockQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_BLOCK_QUERY", e);
                        // Fail-open: não deixar o atacante no timeout.
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_BLOCK_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                blocked: false,
                                attackerIdx: envelope.action.attackerIdx,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                defenderIdx: envelope.action.defenderIdx,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_BLOCK_ANSWER" && envelope.action) {
                const blocked = !!envelope.action.blocked;
                // Resolver waiter ANTES do VFX — senão timeout fail-open.
                if (_dfReactiveBlockWaiter) {
                    _dfReactiveBlockWaiter.resolve(blocked);
                }
                void (async () => {
                    if (blocked && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("block", envelope.action);
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_PROTECTION_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveProtectQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_PROTECTION_QUERY", e);
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_PROTECTION_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                protected: false,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_PROTECTION_ANSWER" && envelope.action) {
                const used = !!envelope.action.protected || !!envelope.action.use;
                if (_dfReactiveProtectWaiter) {
                    _dfReactiveProtectWaiter.resolve(used);
                }
                void (async () => {
                    if (used && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("protect", envelope.action);
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_CANCEL_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveCancelQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_CANCEL_QUERY", e);
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_CANCEL_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                cancelled: false,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_CANCEL_ANSWER" && envelope.action) {
                const cancelled = !!envelope.action.cancelled || !!envelope.action.use;
                if (_dfReactiveCancelWaiter) {
                    _dfReactiveCancelWaiter.resolve(cancelled);
                }
                void (async () => {
                    if (cancelled && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("cancel", {
                            ...envelope.action,
                            casterP: envelope.action.attOwner ?? deps.dfLocalSeat(),
                        });
                    }
                })();
                return;
            }

            _dfRemoteBodyQ = _dfRemoteBodyQ.then(async () => {
                deps.setApplyingRemote(true);
                try {
                    await dfOnlineApplyRemoteBody(envelope);
                } catch (e) {
                    console.warn("[DF online] remote_action", e);
                    if (envelope.snapshot?.players?.length) {
                        try {
                            dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                            deps.updateUI();
                        } catch (e2) {}
                    }
                } finally {
                    deps.setApplyingRemote(false);
                    document.querySelectorAll(".phase-blocker").forEach((el) => el.remove());
                    if (deps.getState().started && deps.getState().winner === null && deps.getGamePhase() === "menu") {
                        deps.setGamePhase( "normal");
                    }
                }
            });
        }

        function dfOnlineBroadcastAction(action, opts = {}) {
            if (!window.__DF_ONLINE || !dfNet?.connected || deps.getApplyingRemote()) return;
            action.playerId = deps.dfLocalSeat();
            const snap = (opts.noSnap || DF_MP_NOSNAP_TYPES.has(action.type))
                ? null
                : (opts.full ? dfEngineSnapshotFull() : dfEngineSnapshotLite());
            const isSync = action.type === "SYNC_STATE" || action.type === "PLAY_VISUAL";
            const isLocalSummon = action.type === "SUMMON" && window.__dfSummonInFlight;
            dfNet.sendAction(action, snap).then(async (ackRes) => {
                if (ackRes?.ok === false) {
                    if (!isSync) {
                        dfOnlineThrottledFailToast(ackRes.error || "REJECTED");
                    }
                    if (ackRes?.authoritativeState?.players?.length) {
                        if (!isLocalSummon) {
                            dfOnlineReconcileSnapshot(
                                { state: ackRes.authoritativeState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI();
                        }
                    } else if (!isSync) {
                        await dfOnlineRollbackToServer();
                    }
                    return;
                }
                if (ackRes?.authoritativeState?.players?.length && !isLocalSummon) {
                    dfOnlineReconcileSnapshot(
                        { state: ackRes.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                }
            }).catch(async (e) => {
                console.warn("[DF online] sendAction", e);
                if (!isSync) {
                    dfOnlineThrottledFailToast(e?.message || "SEND_FAILED");
                    if (!isLocalSummon) await dfOnlineRollbackToServer();
                }
            });
        }

        async function startOnlineMatch(data) {
            const bootKey = [
                data?.code || dfNet?.roomCode || "",
                data?.deckSeed != null ? data.deckSeed : "",
                data?.yourSeat != null ? data.yourSeat : window.__DF_SEAT,
            ].join("|");
            // Já bootou esta partida — ignora match_start duplicado.
            if (window.__dfOnlineBootDone && _dfOnlineBootKey === bootKey) {
                return;
            }
            if (_dfOnlineBootPromise && _dfOnlineBootKey === bootKey) {
                try { await _dfOnlineBootPromise; } catch (e) { /* */ }
                return;
            }
            _dfOnlineBootKey = bootKey;
            const run = (async () => {
            hideOnlineLobbyScreen();
            window.__DF_ONLINE = true;
            window.__DF_SEAT = data.yourSeat | 0;
            window.__DF_DECK_SEED = data.deckSeed != null ? data.deckSeed : null;
            window.__dfOnlineBootDone = false;
            window.__dfOnlineBootLockInput = true;
            _dfLastRemoteSeq = 0;
            _dfSeqCriticalQ = Promise.resolve();
            try {
                window.__dfAppliedRemoteSeq = 0;
                dfNet?.resetAppliedSeq?.();
            } catch (e) { /* */ }
            dfOnlineApplyArenaFromServer(data, "match_start");
            document.body.classList.add("df-pvp-mode");
            document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
            deps.setSelectedMode( 2);
            deps.setSelectedWinPoints( 15);
            const heroIds = data.heroIds || [];
            deps.$("objective-select")?.classList.remove("active");
            // Evita 2º reset de BGM se room_state/replay já revelou a arena.
            window.__dfSkipNextBattleMusicReset = !!window.__dfMatchBoardRevealedKey
                && window.__dfMatchBoardRevealedKey === String(window.__DF_DECK_SEED || bootKey);
            deps.resetState(2, heroIds);
            // CRÍTICO: resetState deixa currentPlayer=0. Se o adversário começa,
            // reveal+warm (vários segundos) mostrava "SUA VEZ" sem relógio e
            // só depois transferia o turno — regressão de abertura.
            // Number(): JSON/"1" falhava em === 1 e caía no opener=0 (falso SUA VEZ).
            const rawFirst = data.firstPlayer ?? data.gameState?.currentPlayer ?? 0;
            const opener = Number(rawFirst) === 1 ? 1 : 0;
            try {
                const st = deps.getState();
                if (st) st.currentPlayer = opener;
            } catch (eCp0) { /* */ }
            window.__dfMatchOpeningSeat = opener;
            window.__dfOnlineMatchBoot = true;
            window.__dfMatchBoot = true;
            window.__dfOnlineSkipMaintRules = true;
            try { deps.setGamePhase?.("menu"); } catch (ePh) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan0) { /* */ }
            // Adia reconcile autoritativo: 1s com mão de 4, depois aplica gameState
            // (já com saque livre do 1º jogador no servidor).
            const pendingAuth = data.gameState?.players?.length ? data.gameState : null;
            dfOnlinePrefetchBoard();
            // Uma revelação + música por partida (deckSeed).
            const revealKey = String(window.__DF_DECK_SEED != null ? window.__DF_DECK_SEED : bootKey);
            if (window.__dfMatchBoardRevealedKey !== revealKey) {
                window.__dfMatchBoardRevealedKey = revealKey;
                deps.revealMatchBoard();
            } else {
                // Arena já visível — só garante UI sem reiniciar BGM.
                try {
                    const g = deps.$("game");
                    if (g) {
                        g.style.display = "flex";
                        g.classList.add("active", "arena-ready");
                    }
                    document.body.classList.add("df-arena-visible");
                    deps.updateUI?.(true);
                } catch (e) { /* */ }
            }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan1) { /* */ }
            // Warm em paralelo (não bloqueia) — evita desync de início entre PCs.
            try { deps.warmMatchArtsBeforeStart(); } catch (eWarm0) { /* */ }
            try { deps.updateUI?.(true); } catch (eUi) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan2) { /* */ }
            deps.log("Partida online iniciada!");
            const firstName = deps.getState().players[opener]?.name || "?";
            deps.floatText(
                `🎲 ${firstName.toUpperCase()} COMEÇA!`,
                opener === deps.dfLocalSeat() ? "vp center" : "info center",
                1800,
            );
            deps.log(`🎲 Sorteio: ${firstName} começa!`);
            // Boot MP sincronizado: NÃO esperar warm de artes (varia por PC/rede
            // e atrasava só o 1º jogador). Ambos aplicam o snapshot e liberam
            // o turno no mesmo ritmo curto.
            try {
                deps.updateUI?.(true);
                // Aplica estado autoritativo JÁ (saque livre incluso no servidor).
                if (pendingAuth) {
                    const clientHand = deps.getState().players[opener]?.hand?.length || 0;
                    const authHand = pendingAuth.players?.[opener]?.hand?.length || 0;
                    const shouldAnimDraw = authHand > clientHand
                        || (authHand >= 5 && clientHand <= 4);
                    dfOnlineReconcileSnapshot({ state: pendingAuth, full: true }, { skipPhase: true });
                    try {
                        const st2 = deps.getState();
                        if (st2) st2.currentPlayer = opener;
                    } catch (eCp1) { /* */ }
                    // Animação do saque: cosmético, timeout curto e igual nos dois.
                    if (shouldAnimDraw && typeof deps.drawAnimToPlayer === "function") {
                        window.__dfUpkeepDrawInFlight = true;
                        window.__dfUpkeepDrawSeat = opener;
                        window.__dfUpkeepDrawAt = Date.now();
                        try {
                            deps.updateUI?.(true);
                            await new Promise((r) => requestAnimationFrame(() => r()));
                            deps.drawAnimToPlayer(opener);
                            const drawWait = typeof deps.waitDrawAnim === "function"
                                ? deps.waitDrawAnim()
                                : Promise.resolve();
                            await Promise.race([
                                drawWait,
                                new Promise((r) => setTimeout(r, 900)),
                            ]);
                        } finally {
                            window.__dfUpkeepDrawInFlight = false;
                            window.__dfUpkeepDrawSeat = null;
                            try {
                                document.querySelectorAll(".hand-wrap.draw-pending, .ai-back.draw-pending")
                                    .forEach((el) => el.classList.remove("draw-pending"));
                            } catch (e1) { /* */ }
                        }
                    } else {
                        deps.updateUI?.(true);
                    }
                }
                // Ritmo fixo curto (não depende de disco/rede) — os dois clientes
                // chegam ao startTurn quase juntos.
                if (typeof deps.wait === "function") await deps.wait(280);
                else await new Promise((r) => setTimeout(r, 280));
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan3) { /* */ }
                await deps.startTurn(opener);
                // Warm de artes em background — não bloqueia o turno jogável.
                try {
                    deps.warmMatchArtsBeforeStart?.();
                    void deps.awaitCriticalMatchArts?.(
                        window.DfLazyLoad?.isSlowNetwork?.() ? 8000 : 4000,
                    ).then(() => {
                        try { deps.updateUI?.(true); } catch (eUi2) { /* */ }
                    });
                } catch (eWarm2) { /* */ }
            } finally {
                window.__dfOnlineSkipMaintRules = false;
                window.__dfOnlineMatchBoot = false;
                window.__dfMatchBoot = false;
                window.__dfOnlineBootLockInput = false;
                window.__dfOnlineBootDone = true;
                window.__dfMatchOpeningSeat = null;
            }
            deps.updateUI();
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan4) { /* */ }
            })();
            _dfOnlineBootPromise = run;
            try {
                await run;
            } finally {
                if (_dfOnlineBootPromise === run) _dfOnlineBootPromise = null;
            }
        }

        function showOnlineHeroSelect() {
            window.__dfOnlinePickingHero = true;
            deps.setHeroSelectionMode( true);
            deps.setObjectiveSelectionMode( false);
            dfOnlineHeroPicked = false;
            // MP: esconder lobby/flash antes da seleção — o gradiente do lobby
            // ficava no stage e apagava a arte DESOLAÇÃO (só no fluxo online).
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.classList.remove("active");
                lobby.style.display = "none";
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            deps.$("main")?.classList.remove("active");
            deps.$("play-menu")?.classList.remove("active");
            deps.$("df-play-mode")?.classList.remove("active");
            // Desktop tela cheia: #game.active residual bloqueava DESOLAÇÃO
            // (:not(:has(#game.active)) + sync limpava o inline).
            try {
                const g = deps.$("game");
                if (g) {
                    g.classList.remove("active", "arena-ready");
                    g.style.display = "none";
                }
                document.body.classList.remove("df-arena-visible");
                document.documentElement.classList.remove("df-combat-canvas");
                document.documentElement.setAttribute("data-df-menu-bg", "hero");
            } catch (eGame) { /* */ }
            void (async () => {
                try {
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                } catch (e) { /* */ }
                try { deps.showHeroSelect(); } catch (eShow) { /* */ }
                // Esperar #hero-select.active — sync antes disso limpa o inline
                // e deixa só o navy (#0a0608) no desktop fullscreen.
                for (let i = 0; i < 24; i++) {
                    if (deps.$("hero-select")?.classList?.contains("active")) break;
                    await new Promise((r) => setTimeout(r, 40));
                }
                try {
                    document.documentElement.setAttribute("data-df-menu-bg", "hero");
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncLetterboxBg?.();
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncMobileBackdrop?.();
                } catch (e2) { /* */ }
            })();
            window.__dfOnlineSelectHero = async (heroId) => {
                if (dfOnlineHeroBlocked(heroId)) {
                    const hn = deps.getHeroDef(heroId)?.name || "Este campeão";
                    deps.floatText(`${hn} não pode ser selecionado — já foi escolhido pelo adversário.`, "warn center", 2800);
                    return;
                }
                window.__dfOnlinePickingHero = false;
                deps.setHeroSelectionMode( false);
                if (!dfNet?.connected) return;
                deps.setSelectedHeroId( heroId);
                deps.$("hero-select")?.classList.remove("active");
                dfOnlineHeroPicked = true;
                try {
                    await dfNet.setHero(heroId);
                    if (deps.getState().started) {
                        hideOnlineLobbyScreen();
                        return;
                    }
                    setOnlineStatus("Herói escolhido. Aguardando o adversário…");
                    const lobby = deps.$("online-lobby");
                    if (lobby) {
                        lobby.style.display = "";
                        lobby.classList.add("active");
                    }
                    if (deps.$("pvp-match-flash")) deps.$("pvp-match-flash").style.display = "none";
                } catch (e) {
                    if (e?.message === "HERO_TAKEN") {
                        deps.floatText("Este campeão já foi escolhido pelo adversário.", "warn center", 2800);
                        deps.setHeroSelectionMode( true);
                        window.__dfOnlinePickingHero = true;
                        deps.showHeroSelect();
                        return;
                    }
                    setOnlineStatus("Erro ao enviar herói: " + (e.message || e), true);
                    const lobby = deps.$("online-lobby");
                    if (lobby) {
                        lobby.style.display = "";
                        lobby.classList.add("active");
                    }
                }
            };
        }
        function getNet() { return dfNet; }

        return {
            getNet,
            dfOnlineAwaitReactiveBlock,
            dfOnlineResolveReactiveBlock,
            dfOnlineAwaitReactiveProtect,
            dfOnlineResolveReactiveProtect,
            dfOnlineAwaitReactiveCancel,
            dfOnlineResolveReactiveCancel,
            dfApplyRoomHeroState,
            dfOnlineHeroBlocked,
            dfRefreshHeroSelectLocks,
            dfPvPStopQueueTimer,
            dfPvPStartQueueTimer,
            dfPvPShowMatchFlash,
            hideOnlineLobbyScreen,
            dfEngineSnapshotFull,
            dfEngineSnapshotLite,
            dfOnlinePrefetchBoard,
            dfOnlineRemoteEndTurn,
            dfOnlineHandleRemoteEndTurn,
            dfOnlinePlayUpkeepDrawFromEvents,
            dfOnlineArmUpkeepDrawIfNeeded,
            dfOnlinePlayPoisonKillsFromEvents,
            dfOnlineCaptureRaioDuploPreHits,
            dfOnlineMarkUpkeepDrawPending,
            dfOnlineReplayPresentationEnvelope,
            dfOnlineCheckWinFromAuthority,
            dfOnlineRollbackToServer,
            dfOnlineApplyFullSnapshot,
            dfOnlineIsLocalPickPhase,
            dfOnlinePublishTalentStart,
            dfOnlinePublishTalentDiscard,
            dfOnlineCommitStatus,
            dfOnlineCommitMutations,
            dfOnlineQueueRemoteVisual,
            dfOnlineReconcileSnapshot,
            dfOnlineBroadcastUltimatePlay,
            dfOnlineReplayUltimate,
            dfOnlineShouldApplySnapshot,
            dfOnlineAbortCombatVisuals,
            dfOnlineFlushDeferredReconcile,
            dfOnlineApplyAttackResolve,
            dfOnlineScheduleBoardSync,
            dfOnlineSendNow,
            dfOnlineSendActionAwait,
            dfOnlineFlushBoardSync,
            dfOnlineApplyIncomingSnapshot,
            dfOnlineApplyAuthoritativeState,
            dfOnlineBroadcastVisual,
            dfOnlineBroadcastVisualAwait,
            dfOnlineBroadcastPresent,
            dfOnlineBroadcastState,
            dfOnlinePlayReactivePeerFeedback,
            getPresentTelemetry: () => _dfPresenter?.getTelemetry?.() || null,
            dfOnlineApplyFieldPatches,
            dfOnlinePatchPower,
            dfOnlineStatusFieldPatch,
            dfOnlineReplayAnim,
            dfOnlineReplaySummonLand,
            dfOnlineReplaySummonVisual,
            dfOnlineQueueSync,
            setOnlineStatus,
            dfClearOnlineMatchFlags,
            showOnlineLobby,
            dfPvPEnterQueue,
            dfPvPEnterRankedQueue,
            dfNetServerUrl,
            initDfNet,
            dfOnlineApplyReplaySync,
            dfTryResumePvpSession,
            dfOnlineRecoverMatchSeat,
            dfOnlineForceExitStuckMatch,
            dfOnlineResetPresentQueue,
            dfOnlineOnNetEvent,
            dfOnlineApplyRemoteBody,
            dfOnlineApplyRemote,
            dfOnlineBroadcastAction,
            startOnlineMatch,
            showOnlineHeroSelect,
        };
    }

    global.DfOnlineSession = { create };
})(typeof window !== "undefined" ? window : globalThis);
