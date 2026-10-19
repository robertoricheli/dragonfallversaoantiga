/**
 * Dragonfall — snapshot de estado para rede (Passo 5A / 9).
 */
(function (global) {
    "use strict";

    const PLAYER_EXTRA_KEYS = [
        "maldicaoForgetNext",
        "wallActive",
        "necromanciaPending",
    ];

    /**
     * @param {object|null} card
     */
    function cloneCard(card) {
        if (!card) return null;
        try {
            return JSON.parse(JSON.stringify(card));
        } catch (e) {
            return { ...card };
        }
    }

    /**
     * @param {object} pl
     * @param {{ full?: boolean }} [opts]
     */
    function clonePlayer(pl, opts = {}) {
        if (!pl) return null;
        const out = {
            name: pl.name,
            isAI: !!pl.isAI,
            heroId: pl.heroId,
            vp: pl.vp,
            actions: pl.actions,
            skipDraw: !!pl.skipDraw,
            skipNextAction: !!pl.skipNextAction,
            ultimateUses: pl.ultimateUses,
            usedUltimateThisTurn: !!pl.usedUltimateThisTurn,
            hand: (pl.hand || []).map(cloneCard),
            field: (pl.field || []).map(cloneCard),
            deckCount: Array.isArray(pl.deck) ? pl.deck.length : 0,
            discard: (pl.discard || []).map(cloneCard),
            onEnterUsedThisTurn: Array.isArray(pl.onEnterUsedThisTurn)
                ? [...pl.onEnterUsedThisTurn]
                : [],
            lastDestroyedSummon: cloneCard(pl.lastDestroyedSummon),
            destroyedChampions: (pl.destroyedChampions || []).map(cloneCard),
        };
        if (opts.full && Array.isArray(pl.deck)) {
            out.deck = pl.deck.map(cloneCard);
        }
        for (const k of PLAYER_EXTRA_KEYS) {
            if (pl[k] !== undefined) out[k] = pl[k];
        }
        return out;
    }

    /**
     * @param {object} opts
     */
    function snapshot(opts) {
        const state = opts.state || {};
        const full = !!opts.full;
        const snap = {
            protocolVersion: 2,
            full,
            started: !!state.started,
            currentPlayer: state.currentPlayer ?? 0,
            playersCount: state.playersCount ?? 2,
            turnNumber: state.turnNumber ?? 1,
            winPoints: state.winPoints ?? 15,
            winner: state.winner ?? null,
            activeTalent: opts.activeTalent != null
                ? opts.activeTalent
                : state.activeTalent
                    ? {
                          ownerP: state.activeTalent.ownerP,
                          card: cloneCard(state.activeTalent.card),
                      }
                    : null,
            players: (state.players || []).map((p) => clonePlayer(p, { full })),
            phase: {
                gamePhase: opts.gamePhase || "normal",
                targetData: opts.targetData ? JSON.parse(JSON.stringify(opts.targetData)) : null,
                pendingSummon: opts.pendingSummon
                    ? JSON.parse(JSON.stringify(opts.pendingSummon))
                    : null,
            },
        };
        return snap;
    }

    /**
     * @param {object} state
     * @param {object} snap
     * @param {{ full?: boolean }} [opts]
     */
    function applySnapshot(state, snap, opts = {}) {
        if (!state || !snap) return state;
        const full = opts.full || snap.full;
        state.started = snap.started;
        state.currentPlayer = snap.currentPlayer;
        state.playersCount = snap.playersCount;
        state.turnNumber = snap.turnNumber;
        state.winPoints = snap.winPoints ?? state.winPoints ?? 15;
        state.winner = snap.winner ?? null;
        state.activeTalent = snap.activeTalent || null;
        if (snap.players && state.players) {
            for (let i = 0; i < snap.players.length; i++) {
                const sp = snap.players[i];
                const pl = state.players[i];
                if (!pl || !sp) continue;
                pl.vp = sp.vp != null ? sp.vp : (pl.vp ?? 0);
                pl.actions = sp.actions;
                pl.skipDraw = sp.skipDraw;
                pl.skipNextAction = sp.skipNextAction;
                pl.ultimateUses = sp.ultimateUses;
                pl.usedUltimateThisTurn = sp.usedUltimateThisTurn;
                pl.hand = (sp.hand || []).map(cloneCard);
                pl.field = (sp.field || []).map(cloneCard);
                pl.discard = (sp.discard || []).map(cloneCard);
                pl.onEnterUsedThisTurn = sp.onEnterUsedThisTurn || [];
                pl.lastDestroyedSummon = cloneCard(sp.lastDestroyedSummon);
                pl.destroyedChampions = (sp.destroyedChampions || []).map(cloneCard);
                if (full && sp.deck) {
                    pl.deck = sp.deck.map(cloneCard);
                } else if (Array.isArray(pl.deck) && typeof sp.deckCount === "number") {
                    while (pl.deck.length > sp.deckCount) pl.deck.pop();
                }
                for (const k of PLAYER_EXTRA_KEYS) {
                    if (sp[k] !== undefined) pl[k] = sp[k];
                }
            }
        }
        return state;
    }

    function setPath(obj, path, value) {
        const parts = String(path).split(".");
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            const idx = /^\d+$/.test(key) ? Number(key) : key;
            const nextKey = parts[i + 1];
            const nextIsIdx = /^\d+$/.test(nextKey);
            if (cur[idx] == null || typeof cur[idx] !== "object") {
                cur[idx] = nextIsIdx ? [] : {};
            }
            cur = cur[idx];
        }
        const last = parts[parts.length - 1];
        const lastKey = /^\d+$/.test(last) ? Number(last) : last;
        cur[lastKey] = value;
    }

    /**
     * Aplica stateDiff.patches (Fase 5) sobre um clone do estado.
     * @returns {object|null}
     */
    function applyPatches(state, patches) {
        if (!state || !Array.isArray(patches)) return null;
        let next;
        try {
            next = JSON.parse(JSON.stringify(state));
        } catch (e) {
            return null;
        }
        for (const p of patches) {
            if (!p || p.op !== "set" || typeof p.path !== "string") continue;
            setPath(next, p.path, p.value);
        }
        return next;
    }

    const DfState = {
        snapshot,
        applySnapshot,
        applyPatches,
        cloneCard,
        clonePlayer,
    };

    global.DfState = DfState;
})(typeof window !== "undefined" ? window : globalThis);
