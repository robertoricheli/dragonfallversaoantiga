/**
 * Dragonfall — VFX runtime unificado (Fase 3).
 * Loop rAF único + modos full / lite / mobile + escala adaptativa de FPS.
 */
(function (global) {
    "use strict";

    /** @type {"full"|"lite"|"mobile"} */
    let quality = "full";
    let fxRef = null;
    /** @type {Set<(ts: number, q: string) => void>} */
    const tickers = new Set();
    let rafId = 0;
    let lastTs = 0;

    /** Escala ao vivo: partículas e DPR sob pressão de frame. */
    let particleScale = 1;
    let dprScale = 1;
    let badStreak = 0;
    let goodStreak = 0;
    let sampleAcc = 0;
    let sampleN = 0;
    let lastAdaptTs = 0;

    function detectQuality(fx) {
        if (fx?.vfxQuality) return fx.vfxQuality;
        if (!fx) return "full";
        if (fx.reduced) return "lite";
        return "full";
    }

    function applyQualityClass(q) {
        const root = document.documentElement;
        root.dataset.dfVfxQuality = q;
        root.classList.toggle("df-vfx-full", q === "full");
        root.classList.toggle("df-vfx-lite", q === "lite");
        root.classList.toggle("df-vfx-mobile", q === "mobile");
    }

    function noteFrameTime(dt) {
        if (!(dt > 0) || dt > 250) return;
        sampleAcc += dt;
        sampleN++;
        if (sampleN < 8) return;
        const avg = sampleAcc / sampleN;
        sampleAcc = 0;
        sampleN = 0;
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (now - lastAdaptTs < 400) return;
        lastAdaptTs = now;

        // >28ms ≈ <36fps — reduz carga sem desligar GPU.
        if (avg > 28) {
            badStreak++;
            goodStreak = 0;
            if (badStreak >= 2) {
                particleScale = Math.max(0.4, particleScale * 0.82);
                dprScale = Math.max(0.65, dprScale * 0.9);
                badStreak = 0;
            }
        } else if (avg < 18) {
            goodStreak++;
            badStreak = 0;
            if (goodStreak >= 4) {
                particleScale = Math.min(1, particleScale + 0.08);
                dprScale = Math.min(1, dprScale + 0.05);
                goodStreak = 0;
            }
        } else {
            badStreak = 0;
            goodStreak = 0;
        }
    }

    function tick(ts) {
        // Sem tickers ativos → encerra o loop (não queima CPU/bateria a 60fps
        // entre animações). registerTicker() reinicia via ensureLoop().
        if (tickers.size === 0) { rafId = 0; lastTs = 0; return; }
        rafId = global.requestAnimationFrame(tick);
        const dt = lastTs ? ts - lastTs : 16;
        lastTs = ts;
        noteFrameTime(dt);
        tickers.forEach((fn) => {
            try { fn(ts, dt, quality); } catch (e) { /* cosmético */ }
        });
    }

    function ensureLoop() {
        if (rafId || typeof global.requestAnimationFrame !== "function") return;
        rafId = global.requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (!rafId) return;
        global.cancelAnimationFrame(rafId);
        rafId = 0;
        lastTs = 0;
    }

    function onVisibility() {
        if (global.document?.hidden) stopLoop();
        else if (tickers.size > 0) ensureLoop();
    }

    try {
        global.document?.addEventListener?.("visibilitychange", onVisibility);
    } catch (e) { /* */ }

    function install(fx) {
        fxRef = fx;
        quality = detectQuality(fx);
        applyQualityClass(quality);
        global.__dfVfxQuality = quality;
        try { global.DfPixiVfx?.setQuality?.(quality); } catch (e) { /* */ }
        try { global.DfGsapBridge?.setQuality?.(quality); } catch (e) { /* */ }
        try { global.DfVfxEngine?.setTier?.(quality); } catch (e) { /* */ }
        ensureLoop();
    }

    /** @param {(ts: number, dt: number, q: string) => void} fn */
    function registerTicker(fn) {
        tickers.add(fn);
        ensureLoop();
        return () => tickers.delete(fn);
    }

    function n(count) {
        if (!fxRef?.n) return Math.max(2, Math.round(count * particleScale));
        const base = fxRef.n(count);
        if (particleScale >= 0.99) return base;
        return Math.max(2, Math.round(base * particleScale));
    }

    function nUlt(count) {
        if (!fxRef?.nUlt) return Math.max(1, Math.round(count * particleScale));
        const base = fxRef.nUlt(count);
        if (particleScale >= 0.99) return base;
        return Math.max(1, Math.round(base * particleScale));
    }

    function resetAdaptive() {
        particleScale = 1;
        dprScale = 1;
        badStreak = 0;
        goodStreak = 0;
        sampleAcc = 0;
        sampleN = 0;
    }

    global.DfVfxRuntime = {
        install,
        quality: () => quality,
        registerTicker,
        stopLoop,
        n,
        nUlt,
        fx: () => fxRef,
        isFull: () => quality === "full",
        isLite: () => quality === "lite",
        isMobile: () => quality === "mobile",
        particleScale: () => particleScale,
        dprScale: () => dprScale,
        noteFrameTime,
        resetAdaptive,
    };
})(typeof window !== "undefined" ? window : globalThis);
