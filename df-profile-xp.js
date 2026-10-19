/**
 * Dragonfall — XP e nível do jogador (perfil).
 * Para subir do nível L para L+1 são necessários (L+1) pontos de XP.
 * Recompensas: Online win 5 / lose 2; IA difícil win 3 / lose 1; IA normal win 2 / lose 1.
 */
(function (global) {
    "use strict";

    function xpRequiredForLevelUp(level) {
        const lv = Math.max(1, level | 0);
        return lv + 1;
    }

    function statsFromTotalXp(totalXp) {
        let level = 1;
        let remaining = Math.max(0, totalXp | 0);
        while (true) {
            const need = xpRequiredForLevelUp(level);
            if (remaining < need) {
                return {
                    level,
                    xpInLevel: remaining,
                    xpToNext: need,
                    totalXp: totalXp | 0,
                };
            }
            remaining -= need;
            level++;
        }
    }

    /**
     * @param {"pvp"|"ai"|"ai_hard"|"ai_normal"} matchType
     * @param {boolean} won
     */
    function matchXpGain(matchType, won) {
        const table = {
            ai: { win: 2, lose: 1 },
            ai_normal: { win: 2, lose: 1 },
            ai_hard: { win: 3, lose: 1 },
            pvp: { win: 5, lose: 2 },
        };
        const row = table[matchType];
        if (!row) return 0;
        return won ? row.win : row.lose;
    }

    /**
     * Normaliza matchType + dificuldade para a chave de tabela.
     * @param {{ matchType?: string, aiDifficulty?: string }} opts
     */
    function resolveMatchXpKey(opts = {}) {
        const mt = opts.matchType === "pvp" ? "pvp" : "ai";
        if (mt === "pvp") return "pvp";
        const diff = opts.aiDifficulty === "hard" ? "hard" : "normal";
        return diff === "hard" ? "ai_hard" : "ai_normal";
    }

    global.DfProfileXp = Object.freeze({
        xpRequiredForLevelUp,
        statsFromTotalXp,
        matchXpGain,
        resolveMatchXpKey,
    });
})(typeof window !== "undefined" ? window : globalThis);
