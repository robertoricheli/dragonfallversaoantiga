/**
 * Dragonfall — scroll na grade de heróis (mobile).
 * Scroll nativo; eixo customizado só no canvas rotacionado (retrato físico).
 */
(function (global) {
    "use strict";

    const SCROLL_THRESHOLD = 4;
    let state = null;

    function heroScreenActive() {
        const hs = global.document?.getElementById("hero-select");
        const game = global.document?.getElementById("game");
        return !!(hs?.classList.contains("active") && !game?.classList.contains("active"));
    }

    function needsAxisScroll() {
        return !!global.document?.documentElement?.classList?.contains("df-portrait-landscape");
    }

    function computeScrollAxis(grid) {
        const r = grid.getBoundingClientRect();
        const cw = Math.max(1, grid.clientWidth);
        const ch = Math.max(1, grid.clientHeight);
        const map = (lx, ly) => ({
            x: r.left + (lx / cw) * r.width,
            y: r.top + (ly / ch) * r.height,
        });
        const p0 = map(cw * 0.5, 0);
        const p1 = map(cw * 0.5, Math.min(80, ch));
        let ax = p1.x - p0.x;
        let ay = p1.y - p0.y;
        const len = Math.hypot(ax, ay) || 1;
        return { ax: ax / len, ay: ay / len };
    }

    function syncScrollMode() {
        const grid = global.document?.getElementById("hero-grid");
        if (!grid) return;
        const axis = needsAxisScroll();
        grid.classList.toggle("df-hero-grid-touch-axis", axis);
        if (!axis) {
            grid.style.touchAction = "pan-y";
            grid.style.webkitOverflowScrolling = "touch";
            grid.style.overflowY = "auto";
        }
    }

    function onPtrDown(e) {
        if (!heroScreenActive() || e.pointerType === "mouse") return;
        if (!needsAxisScroll()) return;
        const grid = e.currentTarget;
        const axis = computeScrollAxis(grid);
        state = {
            el: grid,
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            ax: axis.ax,
            ay: axis.ay,
            scrolling: false,
        };
        try { grid.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    }

    function onPtrMove(e) {
        if (!state || e.pointerId !== state.id || !needsAxisScroll()) return;
        const total = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
        if (!state.scrolling && total < SCROLL_THRESHOLD) return;
        state.scrolling = true;
        const mdx = e.clientX - state.lastX;
        const mdy = e.clientY - state.lastY;
        state.el.scrollTop += mdx * state.ax + mdy * state.ay;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        e.preventDefault();
    }

    function onPtrEnd(e) {
        if (!state || e.pointerId !== state.id) return;
        try { state.el.releasePointerCapture(e.pointerId); } catch (err) { /* */ }
        if (!state.scrolling) {
            const card = e.target?.closest?.(".hero-card");
            if (card) card.click();
        }
        state = null;
    }

    function bindGrid(grid) {
        if (!grid || grid.dataset.dfHeroScrollBound === "1") return;
        grid.dataset.dfHeroScrollBound = "1";
        grid.addEventListener("pointerdown", onPtrDown, { passive: true });
        grid.addEventListener("pointermove", onPtrMove, { passive: false });
        grid.addEventListener("pointerup", onPtrEnd, { passive: true });
        grid.addEventListener("pointercancel", onPtrEnd, { passive: true });
        syncScrollMode();
    }

    function ensureBound() {
        bindGrid(global.document?.getElementById("hero-grid"));
        syncScrollMode();
    }

    function watchHeroSelect() {
        const hs = global.document?.getElementById("hero-select");
        if (!hs || hs.dataset.dfHeroScrollWatch === "1") return;
        hs.dataset.dfHeroScrollWatch = "1";
        const obs = new MutationObserver(() => {
            if (hs.classList.contains("active")) ensureBound();
        });
        obs.observe(hs, { attributes: true, attributeFilter: ["class"] });
    }

    if (global.document) {
        const boot = () => {
            ensureBound();
            watchHeroSelect();
        };
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
        global.addEventListener("df-orientation-sync", syncScrollMode, { passive: true });
        global.addEventListener("df-layout-sync", syncScrollMode, { passive: true });
    }

    global.__dfEnsureHeroGridScroll = ensureBound;
})(typeof window !== "undefined" ? window : globalThis);
