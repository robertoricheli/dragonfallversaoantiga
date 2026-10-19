/**
 * Dragonfall — menu splash: opcional @2x em retina (só se o arquivo existir de fato).
 */
(function (global) {
    "use strict";

    function url(p) {
        return global.dfAssetUrl ? global.dfAssetUrl(p) : p;
    }

    function tryHiRes(img, base, w1x, h1x) {
        if (!img) return;
        const lo = url(`bg/${base}.png`);
        const dpr = global.devicePixelRatio || 1;
        if (dpr < 1.5) return;

        const hi = url(`bg/${base}@2x.png`);
        const probe = new Image();
        probe.onload = () => {
            img.src = hi;
            img.width = w1x * 2;
            img.height = h1x * 2;
        };
        probe.onerror = () => { /* mantém 1x */ };
        probe.src = hi;
    }

    function wireFallback(img, base) {
        if (!img) return;
        const lo = url(`bg/${base}.png`);
        img.addEventListener("error", () => {
            if (img.dataset.dfSplashFallback === "1") return;
            img.dataset.dfSplashFallback = "1";
            img.src = lo;
        }, { once: true });
    }

    function boot() {
        const layer = global.document?.getElementById("df-menu-splash-layer");
        if (!layer) return;
        const bg = layer.querySelector(".main-splash-bg");
        const btn = layer.querySelector(".main-play-btn-art");
        wireFallback(bg, "MENU-PRINCIPAL");
        wireFallback(btn, "BOTAO-JOGAR");
        tryHiRes(bg, "MENU-PRINCIPAL", 1024, 434);
        tryHiRes(btn, "BOTAO-JOGAR", 1024, 361);
    }

    if (global.document) {
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
