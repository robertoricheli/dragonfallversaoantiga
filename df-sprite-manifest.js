/**
 * Dragonfall — catálogo de sprites importados (Fase 3).
 * PNGs dedicados em vfx/ult-* (Fase 3).
 */
(function (global) {
    "use strict";

    const CATALOG = Object.freeze({
        bomb_impact: { path: "ult-bomb/impact.png", scale: 1.32, role: "impact" },
        ice_impact: { path: "ult-ice/impact.png", scale: 1.24, tint: 0xffffff, role: "impact" },
        poison_travel: { path: "ult-poison/travel.png", scale: 1.18, role: "fly" },
        poison_impact: { path: "ult-poison/impact.png", scale: 1.28, role: "impact" },
        comet_impact: { path: "ult-comet/impact.png", scale: 1.4, role: "impact" },
        wall_stone: { path: "ult-wall/stone.png", scale: 1.15, role: "impact" },
        banish_void: { path: "ult-banish/void.png", scale: 1.3, tint: 0xcc88ff, role: "impact" },
        scare_mist: { path: "ult-scare/mist.png", scale: 1.2, tint: 0xddaaee, role: "impact" },
        thunder_strike: { path: "ult-thunder/strike.png", scale: 1.35, role: "impact" },
        /** Gosma envenenar — mesmos PNGs que ult-poison (Fase 3 unificado) */
        poison_slime_fly: { path: "ult-poison/travel.png", scale: 1.18, role: "fly" },
        poison_slime_impact: { path: "ult-poison/impact.png", scale: 1.28, role: "impact" },
    });

    const ULTIMATE_SPRITES = Object.freeze({
        targetEnemy: "bomb_impact",
        targetEnemyFreeze: "ice_impact",
        poison: "poison_impact",
        cometStarfall: "comet_impact",
        wallProtect: "wall_stone",
        banish: "banish_void",
        scareReturn: "scare_mist",
        thunderDiscard: "thunder_strike",
    });

    function get(id) {
        return CATALOG[id] || null;
    }

    function spriteForUltimate(type) {
        return ULTIMATE_SPRITES[type] || null;
    }

    function spriteEntryForUltimate(type) {
        const id = spriteForUltimate(type);
        return id ? get(id) : null;
    }

    function resolveUrl(relativePath) {
        const base = global.__dfVfxBase || "vfx/";
        const rel = base + relativePath;
        if (typeof global.dfAssetUrl === "function") return global.dfAssetUrl(rel);
        return rel + "?v=" + encodeURIComponent(global.__DF_GAME_V || "1");
    }

    global.DfSpriteManifest = {
        CATALOG,
        ULTIMATE_SPRITES,
        get,
        spriteForUltimate,
        spriteEntryForUltimate,
        resolveUrl,
    };
})(typeof window !== "undefined" ? window : globalThis);
