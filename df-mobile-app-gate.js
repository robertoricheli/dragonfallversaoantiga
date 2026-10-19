/**
 * Dragonfall — tela cheia automática (boot + Jogar), sem UI de PWA.
 */
(function (global) {
    "use strict";

    function isMobileFit() {
        return !!(global.DfLayout?.isMobileDesktopFit?.()
            || global.document?.documentElement?.classList?.contains("df-mobile-desktop-fit"));
    }

    function isStandalone() {
        try {
            if (global.navigator?.standalone === true) return true;
            return global.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
        } catch (e) {
            return false;
        }
    }

    async function runBeforePlayMenu() {
        if (!isMobileFit()) return "skip";
        try { global.DfMobileImmersive?.enterFullscreenFromGesture?.(); } catch (e) { /* */ }
        // Nunca pedir instalação de app — só imersão (tela cheia).
        return "immersive";
    }

    function runOnBoot() {
        if (!isMobileFit() || isStandalone()) return;
        global.DfMobileImmersive?.bootEnterImmersive?.();
    }

    global.DfAppGate = Object.freeze({
        runBeforePlayMenu,
        runOnBoot,
    });
})(typeof window !== "undefined" ? window : globalThis);
