/**
 * Dragonfall — paisagem física prioritária (Hearthstone): lock no boot + gesto + combate.
 * Orientação detectada somente por vw/vh (visualViewport ou innerWidth/innerHeight).
 */
(function (global) {
    "use strict";

    function isTouchPlayDevice() {
        try {
            if (global.DfLayout?.isCoarsePointer?.()) return true;
            if ((navigator.maxTouchPoints | 0) > 0) return true;
            if ("ontouchstart" in global) return true;
        } catch (e) { /* */ }
        return false;
    }

    /** Retrato físico: somente dimensões visíveis (nunca matchMedia nem screen). */
    function isPortrait() {
        if (global.DfLayout?.isPhysicalPortrait) {
            return global.DfLayout.isPhysicalPortrait();
        }
        try {
            const vv = global.visualViewport;
            const vw = Math.round(vv?.width || global.innerWidth || 0);
            const vh = Math.round(vv?.height || global.innerHeight || 0);
            if (vw > 0 && vh > 0) return vh > vw;
        } catch (e) { /* */ }
        return (global.innerHeight || 0) > (global.innerWidth || 0);
    }

    function shouldForceLandscape() {
        return isTouchPlayDevice();
    }

    let lockPending = false;
    let lastLockAt = 0;
    const LOCK_COOLDOWN_MS = 800;

    async function tryLockLandscape() {
        const now = Date.now();
        if (lockPending || now - lastLockAt < LOCK_COOLDOWN_MS) return;
        lockPending = true;
        lastLockAt = now;
        try {
            const o = global.screen?.orientation;
            if (o?.lock) {
                await o.lock("landscape");
                global.document?.documentElement?.classList?.add("df-auto-landscape");
                return;
            }
            const legacy = global.screen;
            if (typeof legacy.lockOrientation === "function") {
                if (legacy.lockOrientation("landscape")) {
                    global.document?.documentElement?.classList?.add("df-auto-landscape");
                }
            } else if (typeof legacy.mozLockOrientation === "function") {
                legacy.mozLockOrientation("landscape");
            } else if (typeof legacy.msLockOrientation === "function") {
                legacy.msLockOrientation("landscape");
            }
        } catch (e) { /* */ } finally {
            lockPending = false;
        }
    }

    let docWasHidden = false;
    let resumeTimer = null;
    let resizeTimer = null;

    function sync() {
        const root = global.document?.documentElement;
        if (!root) return;
        const fit = global.DfLayout?.isMobileDesktopFit?.() ?? false;
        const touch = isTouchPlayDevice();
        const portraitLayout = global.DfLayout?.shouldUsePortraitLandscapeLayout?.()
            ?? (isPortrait() && fit);
        root.classList.remove("df-portrait-block");
        root.dataset.dfOrientation = portraitLayout ? "portrait" : "landscape";
        if (!portraitLayout) root.classList.add("df-auto-landscape");
        else root.classList.remove("df-auto-landscape");
        if (portraitLayout) root.classList.add("df-portrait-landscape");
        else root.classList.remove("df-portrait-landscape");
        const pw = global.__DF_PHYSICAL_PW || 0;
        const ph = global.__DF_PHYSICAL_PH || 0;
        if (pw) root.style.setProperty("--df-pw", pw + "px");
        if (ph) root.style.setProperty("--df-ph", ph + "px");
        if (touch && (fit || global.DfLayout?.isMobileUserAgent?.())) {
            void tryLockLandscape();
        }
        try { global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
        try { global.DfViewport?.schedule?.(); } catch (e) { /* */ }
        try { global.dispatchEvent(new Event("df-orientation-sync")); } catch (e) { /* */ }
    }

    function onVisibilityChange() {
        const doc = global.document;
        if (!doc) return;
        if (doc.hidden) {
            docWasHidden = true;
            return;
        }
        if (!docWasHidden) return;
        docWasHidden = false;
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            requestAnimationFrame(() => sync());
        }, 40);
    }

    function scheduleResizeSync() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            sync();
        }, 220);
    }

    function onFirstGesture() {
        global.DfMobileImmersive?.enterFullscreenFromGesture?.();
        if (!global.DfLayout?.shouldUsePortraitLandscapeLayout?.()) {
            void tryLockLandscape();
        }
    }

    global.DfOrientation = Object.freeze({
        isTouchPlayDevice,
        isPortrait,
        shouldForceLandscape,
        sync,
        tryLockLandscape,
        mountLayoutStage() { /* stage permanente no HTML */ },
    });

    if (global.document) {
        const boot = () => {
            sync();
            global.addEventListener("pointerdown", onFirstGesture, { capture: true, passive: true });
            global.addEventListener("touchstart", onFirstGesture, { capture: true, passive: true });
            global.document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
        };
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
        sync();
        global.addEventListener("resize", scheduleResizeSync, { passive: true });
        global.addEventListener("orientationchange", () => setTimeout(sync, 120), { passive: true });
    }
})(typeof window !== "undefined" ? window : globalThis);
