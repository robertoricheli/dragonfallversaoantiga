/**
 * Feature flags — capacidades prontas no código, UI ligada quando o autor pedir.
 */
(function (global) {
    "use strict";
    const flags = Object.freeze({
        /** Ranked: API em DfNetClient.joinRankedQueue(); botão UI desligado até release. */
        rankedUi: true,
        /** Box de turno/ações (#desktop-turn-indicator, #mobile-turn-indicator). */
        combatTurnIndicatorUi: false,
        /** Hubs de herói (#desktop-left-hud, .dlh-hero-panel). */
        combatHeroHubUi: true,
        /** Botão de menu no combate (#desktop-logo, #end-turn). */
        combatMenuButtonUi: false,
    });
    global.__DF_FEATURE_FLAGS__ = flags;

    function applyCombatUiClasses() {
        const root = global.document?.documentElement;
        if (!root) return;
        root.classList.toggle("df-hide-combat-turn-box", !flags.combatTurnIndicatorUi);
        root.classList.toggle("df-hide-combat-hero-hubs", !flags.combatHeroHubUi);
        root.classList.toggle("df-hide-combat-menu-btn", !flags.combatMenuButtonUi);
    }

    global.DfCombatUi = Object.freeze({
        flags: () => flags,
        showTurnBox: () => flags.combatTurnIndicatorUi,
        showHeroHubs: () => flags.combatHeroHubUi,
        showMenuButton: () => flags.combatMenuButtonUi,
        apply: applyCombatUiClasses,
    });

    if (global.document?.documentElement) {
        applyCombatUiClasses();
    } else {
        global.document?.addEventListener?.("DOMContentLoaded", applyCombatUiClasses, { once: true });
    }
})(typeof window !== "undefined" ? window : globalThis);
