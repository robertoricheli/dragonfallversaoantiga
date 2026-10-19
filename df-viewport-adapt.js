/**
 * Dragonfall — adaptação de viewport + dicas de performance (apresentação).
 * Mantém layout desktop universal; ajusta escala/tokens por celular, tablet e desktop.
 */
(function (global) {
    "use strict";

    const LAYOUT = Object.freeze({
        desktop: {
            fieldW: 90, fieldH: 126, fieldGap: 10,
            handW: 80, handH: 112, handMinH: 158,
            padTop: 20, padRight: 300, padBottom: 30, padLeft: 180,
            gridPad: "20px 16px 30px 16px",
            gridMaxW: "1200px",
            hudScale: 1,
        },
        tablet: {
            fieldW: 76, fieldH: 106, fieldGap: 8,
            handW: 72, handH: 100, handMinH: 142,
            padTop: 52, padRight: 148, padBottom: 12, padLeft: 96,
            gridPad: "14px 10px 22px 10px",
            gridMaxW: "100%",
            hudScale: 0.92,
        },
        phone: {
            fieldW: 58, fieldH: 81, fieldGap: 5,
            handW: 62, handH: 87, handMinH: 124,
            padTop: 28, padRight: 64, padBottom: 8, padLeft: 48,
            gridPad: "8px 6px 14px 6px",
            gridMaxW: "100%",
            hudScale: 0.84,
        },
    });

    let cached = null;
    let rafPending = false;

    function readViewport() {
        const vv = global.visualViewport;
        let vw = Math.round(vv?.width || global.innerWidth || 1280);
        let vh = Math.round(vv?.height || global.innerHeight || 720);
        const portrait = global.DfOrientation?.isPortrait?.() ?? (vh > vw);
        const mobileDesktopFit = !!(global.DfLayout?.isMobileDesktopFit?.()
            || global.document?.documentElement?.classList?.contains("df-mobile-desktop-fit"));
        const coarse = !!(global.DfLayout?.isCoarsePointer?.()
            || global.__DF_NATIVE_MATCH_MEDIA?.("(pointer: coarse)")?.matches);
        const mem = navigator.deviceMemory || 8;
        const cores = navigator.hardwareConcurrency || 8;
        const reduced = (() => {
            try {
                return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
            } catch (e) {
                return false;
            }
        })();

        let layoutTier = "desktop";
        if (mobileDesktopFit) {
            layoutTier = "desktop";
        } else if (vw <= 900 || vh <= 500) {
            layoutTier = "phone";
        } else if (vw <= 1180 && vh <= 680) {
            layoutTier = "tablet";
        }

        let perfTier = "high";
        if (reduced || mem <= 3 || cores <= 3) perfTier = "low";
        else if (coarse || mem <= 4 || cores <= 4 || (!mobileDesktopFit && (vw < 1050 || vh < 620))) perfTier = "medium";

        const gpu = (perfTier === "low" || reduced) ? "lite" : "full";
        // gpu:"lite" = orçamento (partículas/DPR). NÃO desliga Pixi no Automático —
        // ver DfVfxSettings.detectAuto / DfPixiVfx.setQuality.
        const particleFactor = perfTier === "low" ? 0.42 : (perfTier === "medium" ? 0.72 : 1);
        // Mobile/coarse: DPR 1.5 (ou 1.25 no low) — mesma qualidade visual de
        // cartas/arte; só corta overdraw do WebGL (FPS bem maior no celular).
        const pixiDprCap = perfTier === "low"
            ? 1.25
            : ((perfTier === "medium" || coarse) ? 1.5 : 2);

        return {
            vw, vh, coarse, mem, cores, reduced, portrait,
            forceLandscape: false,
            mobileDesktopFit,
            layoutTier, perfTier, gpu, particleFactor, pixiDprCap,
            pixiAA: perfTier === "high" && !coarse,
            deferVfxPreload: perfTier !== "high",
        };
    }

    function applyTokens(hints) {
        const root = global.document?.documentElement;
        if (!root) return;
        const tokBase = LAYOUT[hints.layoutTier] || LAYOUT.desktop;
        /* Pedido do autor: +20% sobre os tamanhos efetivos anteriores do canvas-fit.
           Campo: 97×136 → 116×163; mão principal: 96×134 → 115×161. */
        const requestedCardScale = 1.2;
        const mobileFieldScale = 1.2 * 0.9 * requestedCardScale;
        const tok = hints.mobileDesktopFit ? {
            fieldW: Math.round(tokBase.fieldW * mobileFieldScale),
            fieldH: Math.round(tokBase.fieldH * mobileFieldScale),
            fieldGap: Math.round(tokBase.fieldGap * mobileFieldScale),
            handW: Math.round(tokBase.handW * 1.2 * requestedCardScale),
            handH: Math.round(tokBase.handH * 1.2 * requestedCardScale),
            handMinH: Math.round(tokBase.handMinH * 1.2 * requestedCardScale),
            padTop: tokBase.padTop,
            padRight: tokBase.padRight,
            padBottom: tokBase.padBottom,
            padLeft: tokBase.padLeft,
            gridPad: tokBase.gridPad,
            gridMaxW: tokBase.gridMaxW,
            hudScale: tokBase.hudScale,
        } : tokBase;

        root.classList.remove("df-vp-desktop", "df-vp-tablet", "df-vp-phone");
        root.classList.add("df-vp-" + hints.layoutTier);
        root.dataset.dfVpLayout = hints.layoutTier;
        root.dataset.dfPerfTier = hints.perfTier;

        const hudScale = tok.hudScale;

        const style = root.style;
        style.setProperty("--df-field-card-w", tok.fieldW + "px");
        style.setProperty("--df-field-card-h", tok.fieldH + "px");
        style.setProperty("--df-field-card-gap", tok.fieldGap + "px");
        style.setProperty("--df-field-tap-margin", ((tok.fieldH - tok.fieldW) / 2).toFixed(2) + "px");
        style.setProperty("--df-hand-card-w", tok.handW + "px");
        style.setProperty("--df-hand-card-h", tok.handH + "px");
        style.setProperty("--df-hand-min-h", tok.handMinH + "px");
        style.setProperty("--df-game-pad-top", tok.padTop + "px");
        style.setProperty("--df-game-pad-right", tok.padRight + "px");
        style.setProperty("--df-game-pad-bottom", tok.padBottom + "px");
        style.setProperty("--df-game-pad-left", tok.padLeft + "px");
        style.setProperty("--df-game-grid-pad", tok.gridPad);
        style.setProperty("--df-game-grid-max-w", tok.gridMaxW);
        style.setProperty("--df-hud-scale", String(hudScale));
        style.setProperty("--df-ui-scale", String(hudScale));
    }

    function measure() {
        cached = readViewport();
        applyTokens(cached);
        try { global.__dfSyncArenaAlignment?.(); } catch (e) { /* */ }
        try { global.__dfScheduleFan?.(); } catch (e) { /* */ }
        try { global.DfVfxEngine?.syncFromRuntime?.(); } catch (e) { /* */ }
        try {
            if (global.__dfFX && global.DfVfxSettings?.applyToFx) {
                global.DfVfxSettings.applyToFx(global.__dfFX);
            }
        } catch (e) { /* */ }
        return cached;
    }

    function schedule() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            measure();
        });
    }

    function getPerfHints() {
        return cached || measure();
    }

    function getLayoutTier() {
        return getPerfHints().layoutTier;
    }

    global.DfViewport = Object.freeze({
        measure,
        schedule,
        getPerfHints,
        getLayoutTier,
        LAYOUT,
    });

    if (global.document) {
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", measure, { once: true });
        } else {
            measure();
        }
        global.addEventListener("resize", schedule, { passive: true });
        global.addEventListener("orientationchange", schedule, { passive: true });
        global.addEventListener("df-orientation-sync", schedule, { passive: true });
        if (global.visualViewport) {
            global.visualViewport.addEventListener("resize", schedule, { passive: true });
            global.visualViewport.addEventListener("scroll", schedule, { passive: true });
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
