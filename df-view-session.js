/**
 * Dragonfall — View session (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        function dfLocalSeat() {
            return window.__DF_ONLINE ? (window.__DF_SEAT | 0) : 0;
        }
        
        function dfIsMyTurn() {
            // MP: durante END_TURN em voo bloqueia jogadas duplicadas, mas o banner
            // continua baseado em currentPlayer (não mente “vez do adversário”).
            if (window.__DF_ONLINE && window.__dfTurnEndingPending) {
                // Sticky: se o flag ficou preso, o banner mostra “SUA VEZ” (currentPlayer)
                // mas summon/ataque morrem — destrava após 2,2s.
                if (!window.__dfTurnEndingStuckAt) window.__dfTurnEndingStuckAt = Date.now();
                else if (Date.now() - (window.__dfTurnEndingStuckAt | 0) > 2200) {
                    console.warn("[DF] __dfTurnEndingPending sticky — force clear");
                    window.__dfTurnEndingPending = false;
                    window.__dfTurnEndingStuckAt = 0;
                    try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                } else {
                    return false;
                }
            } else {
                window.__dfTurnEndingStuckAt = 0;
            }
            const st = deps.getState();
            if (!st?.started || st.winner != null) return false;
            return st.currentPlayer === dfLocalSeat();
        }
        
        function dfPlayerForQuadrant(q) {
            return (window.__DF_ONLINE && window.__DF_SEAT === 1) ? (1 - q) : q;
        }
        
        function dfHumanSeat() {
            return window.__DF_ONLINE ? dfLocalSeat() : 0;
        }
        
        function dfOpponentSeat() {
            return window.__DF_ONLINE ? (1 - dfLocalSeat()) : 1;
        }
        
        function dfRivalPlayerIdx(pIdx) {
            for (let i = 0; i < (deps.getState().playersCount || 2); i++) {
                if (i !== (pIdx | 0)) return i;
            }
            return null;
        }
        
        function dfIsLocalPlayer(pIdx) {
            return (pIdx | 0) === dfHumanSeat();
        }
        
        function dfLocalPlayer() {
            return deps.getState().players?.[dfHumanSeat()] || null;
        }
        
        function dfQuadrantForPlayer(pIdx) {
            const n = deps.getState().playersCount || 2;
            for (let q = 0; q < n; q++) {
                if (dfPlayerForQuadrant(q) === (pIdx | 0)) return q;
            }
            return pIdx | 0;
        }
        global.__dfHud = {
            localSeat: () => dfLocalSeat(),
            currentPlayer: () => {
                const st = deps.getState();
                return st?.currentPlayer != null ? st.currentPlayer : null;
            },
            quadrantForPlayer: (p) => dfQuadrantForPlayer(p),
            isLocalPlayer: (p) => dfIsLocalPlayer(p),
            getPlayer: (p) => deps.getState()?.players?.[p] || null,
        };
        return {
            dfLocalSeat, dfIsMyTurn, dfPlayerForQuadrant, dfHumanSeat, dfOpponentSeat,
            dfRivalPlayerIdx, dfIsLocalPlayer, dfLocalPlayer, dfQuadrantForPlayer,
        };
    }

    global.DfViewSession = { create };
})(typeof window !== "undefined" ? window : globalThis);
