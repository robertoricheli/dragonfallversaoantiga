/**
 * Dragonfall — PWA técnico (cache/offline). NUNCA pede instalação ao jogador.
 * O jogo roda no navegador; assets baixam ao clicar JOGAR.
 *
 * Nota: o bloqueio crítico de beforeinstallprompt também está inline no <head>
 * (race em dados móveis). Aqui reforçamos e nunca chamamos prompt().
 */
(function (global) {
    "use strict";

    function isMobilePlay() {
        return !!(global.DfLayout?.isMobileDesktopFit?.()
            || global.DfLayout?.isMobileUserAgent?.()
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

    function blockInstallPrompt(e) {
        try { e.preventDefault(); } catch (err) { /* */ }
        try { e.stopImmediatePropagation?.(); } catch (err2) { /* */ }
    }

    global.addEventListener("beforeinstallprompt", blockInstallPrompt, true);
    global.addEventListener("beforeinstallprompt", blockInstallPrompt, false);

    function boot() {
        if (isStandalone()) {
            try { global.DfMobileImmersive?.tryFullscreen?.(); } catch (e) { /* */ }
        }
    }

    if (global.document) {
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
    }

    global.DfPwaInstall = Object.freeze({
        isStandalone,
        isMobilePlay,
        /** Compat — nunca mostra diálogo de instalação. */
        trySilentInstall: async () => false,
    });
})(typeof window !== "undefined" ? window : globalThis);
