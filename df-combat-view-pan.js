/**
 * Mobile — pan desativado no combate (autor: toque move tela só em menus).
 * Mantém reset do transform órfão ao sair do combate.
 */
(function (global) {
    "use strict";

    function panTarget() {
        return global.document?.getElementById("desktop-scale-root")
            || global.document?.getElementById("df-scale-root");
    }

    function resetPan() {
        const el = panTarget();
        if (el) {
            el.style.removeProperty("transform");
            el.style.removeProperty("-webkit-transform");
        }
    }

    global.__dfResetCombatViewPan = resetPan;

    if (global.document) {
        global.addEventListener("df-orientation-sync", resetPan, { passive: true });
    }
})(typeof window !== "undefined" ? window : globalThis);
