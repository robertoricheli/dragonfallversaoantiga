/**
 * Dragonfall — navegação touch (mobile): deslize horizontal preciso;
 * scroll vertical nativo preservado em listas/menus.
 */
(function (global) {
    "use strict";

    const SWIPE_MIN_PX = 52;
    const HORIZONTAL_DOMINANCE = 1.65;
    let ctx = null;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let startTarget = null;
    let verticalScroll = false;

    function isCoarse() {
        if (ctx?.isCoarse) return !!ctx.isCoarse();
        try {
            return global.DfLayout?.isCoarsePointer?.()
                || global.matchMedia?.("(pointer: coarse)")?.matches;
        } catch (e) { return false; }
    }

    function isScrollableArea(el) {
        if (!el) return false;
        if (global.document?.getElementById("game")?.classList.contains("active")) return false;
        if (!!el.closest?.("#hero-select.active .hero-grid, #hero-select.active, [data-df-scroll-area]")) {
            return true;
        }
        return false;
    }

    function onTouchStart(e) {
        if (!isCoarse() || !ctx) return;
        const t = e.touches?.[0];
        if (!t) return;
        if (isScrollableArea(e.target)) {
            tracking = false;
            return;
        }
        startX = t.clientX;
        startY = t.clientY;
        startTarget = e.target;
        verticalScroll = false;
        tracking = true;

        if (global.document?.getElementById("game")?.classList.contains("active")
            && ctx.game?.active?.()) {
            if (e.target?.closest?.(".hcard, .ccard, .quadrant-field, .hand-wrap, .quadrant-hand")) {
                tracking = false;
            }
            return;
        }

        const screen = ctx.pickActiveScreen?.();
        if (!screen) { tracking = false; return; }
        const root = global.document.querySelector(screen.root);
        if (!root?.classList.contains("active") || !root.contains(e.target)) {
            tracking = false;
        }
    }

    function onTouchMove(e) {
        if (!tracking) return;
        const t = e.touches?.[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (isScrollableArea(startTarget) && dy > dx + 8) {
            verticalScroll = true;
            tracking = false;
        } else if (dy > dx * HORIZONTAL_DOMINANCE) {
            tracking = false;
        }
    }

    function onTouchEnd(e) {
        if (!tracking || verticalScroll) {
            tracking = false;
            return;
        }
        tracking = false;
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < SWIPE_MIN_PX) return;
        if (Math.abs(dy) > Math.abs(dx) / HORIZONTAL_DOMINANCE) return;

        const delta = dx < 0 ? 1 : -1;

        if (global.document?.getElementById("game")?.classList.contains("active")
            && ctx.game?.active?.()) {
            if (startTarget?.closest?.(".hcard, .ccard, .quadrant-field, .hand-wrap")) return;
            ctx.game.cycleTarget?.(delta);
            return;
        }

        const screen = ctx.pickActiveScreen?.();
        if (!screen) return;
        const root = global.document.querySelector(screen.root);
        if (!root?.contains(startTarget)) return;
        screen.step?.(delta);
    }

    function install(nextCtx) {
        ctx = nextCtx || null;
    }

    if (global.document) {
        global.document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
        global.document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
        global.document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    }

    global.DfTouchNav = Object.freeze({ install, isCoarse });
})(typeof window !== "undefined" ? window : globalThis);
