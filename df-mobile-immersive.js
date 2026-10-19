/**
 * Dragonfall — tela cheia no canvas fit (mobile + desktop F11).
 * Mobile: entra em FS no boot + primeiro gesto; restaura ao voltar do background.
 * Não re-pede FS se já estiver em tela cheia (evita o banner preto do Chrome
 * no meio da partida). Overlay de gesto só no hub — nunca sobre o tabuleiro.
 */
(function (global) {
    "use strict";

    function isCanvasFitImmersive() {
        return !!(global.DfLayout?.isMobileDesktopFit?.()
            || global.document?.documentElement?.classList?.contains("df-mobile-desktop-fit"));
    }

    function isTouchCanvasDevice() {
        if (!isCanvasFitImmersive()) return false;
        try {
            if (global.DfLayout?.isCoarsePointer?.()) return true;
            if ((global.navigator?.maxTouchPoints | 0) > 0) return true;
            if ("ontouchstart" in global) return true;
        } catch (e) { /* */ }
        return false;
    }

    function isStandalone() {
        try {
            if (global.navigator?.standalone === true) return true;
            return global.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
        } catch (e) {
            return false;
        }
    }

    function isFullscreen() {
        return !!(global.document?.fullscreenElement
            || global.document?.webkitFullscreenElement);
    }

    function isMatchBoardVisible() {
        try {
            const g = global.document?.getElementById?.("game");
            return !!(g && g.classList.contains("active"));
        } catch (e) {
            return false;
        }
    }

    function usesCssPortraitLayout() {
        return !!(global.DfLayout?.shouldUsePortraitLandscapeLayout?.()
            || global.document?.documentElement?.classList?.contains("df-portrait-landscape"));
    }

    async function tryLockLandscape() {
        if (usesCssPortraitLayout()) return;
        try {
            const o = global.screen?.orientation;
            if (o?.lock) await o.lock("landscape");
        } catch (e) { /* */ }
    }

    function syncAfterFullscreen() {
        try { global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
    }

    function requestFs(root) {
        if (root.requestFullscreen) {
            try {
                return root.requestFullscreen({ navigationUI: "hide" });
            } catch (e) {
                return root.requestFullscreen();
            }
        }
        if (root.webkitRequestFullscreen) return root.webkitRequestFullscreen();
        if (root.webkitEnterFullscreen) return root.webkitEnterFullscreen();
        return null;
    }

    /** Chamada síncrona dentro de gesto — preserva user activation do browser. */
    function enterFullscreenFromGesture() {
        if (!isCanvasFitImmersive() || isFullscreen()) return isFullscreen();
        const root = global.document?.documentElement;
        if (!root) return false;
        try {
            const p = requestFs(root);
            if (p && typeof p.then === "function") {
                p.then(() => {
                    syncAfterFullscreen();
                    if (!usesCssPortraitLayout()) void tryLockLandscape();
                    disarmBootGesture();
                    removeBootOverlay();
                }).catch(() => { /* */ });
            }
            if (isFullscreen()) {
                syncAfterFullscreen();
                disarmBootGesture();
                removeBootOverlay();
            }
            return isFullscreen();
        } catch (e) {
            return false;
        }
    }

    async function tryFullscreen() {
        if (!isCanvasFitImmersive()) return false;
        if (isFullscreen()) {
            if (!usesCssPortraitLayout()) await tryLockLandscape();
            return true;
        }
        if (enterFullscreenFromGesture()) return true;
        return false;
    }

    let restoreFsHandler = null;
    let bootGestureHandler = null;
    let bootOverlay = null;

    function disarmClickToRestoreFullscreen() {
        if (restoreFsHandler) {
            global.removeEventListener("click", restoreFsHandler, true);
            global.removeEventListener("touchstart", restoreFsHandler, true);
            restoreFsHandler = null;
        }
    }

    function armClickToRestoreFullscreen() {
        if (!isCanvasFitImmersive() || isFullscreen()) return;
        disarmClickToRestoreFullscreen();
        restoreFsHandler = () => {
            if (isFullscreen()) {
                disarmClickToRestoreFullscreen();
                return;
            }
            if (!isCanvasFitImmersive()) return;
            enterFullscreenFromGesture();
            if (isFullscreen()) disarmClickToRestoreFullscreen();
        };
        global.addEventListener("click", restoreFsHandler, { capture: true, passive: true });
        global.addEventListener("touchstart", restoreFsHandler, { capture: true, passive: true });
    }

    function onFullscreenChange() {
        if (!isCanvasFitImmersive()) return;
        syncAfterFullscreen();
        if (isFullscreen()) {
            disarmBootGesture();
            removeBootOverlay();
            disarmClickToRestoreFullscreen();
        } else {
            armClickToRestoreFullscreen();
            armBootGestureUntilEntered();
        }
    }

    function resumeFullscreen() {
        if (!isTouchCanvasDevice() || isStandalone()) return;
        if (!isCanvasFitImmersive()) return;
        if (isFullscreen()) {
            removeBootOverlay();
            return;
        }
        if (enterFullscreenFromGesture()) return;
        void tryFullscreen().then((ok) => {
            if (ok) {
                removeBootOverlay();
                return;
            }
            armBootGestureUntilEntered();
            if (!isMatchBoardVisible()) mountBootOverlayIfNeeded();
        });
    }

    function onVisibilityChange() {
        const doc = global.document;
        if (!doc || doc.hidden) return;
        setTimeout(() => {
            if (!isFullscreen()) {
                armClickToRestoreFullscreen();
                armBootGestureUntilEntered();
            }
            resumeFullscreen();
        }, 60);
    }

    function onPageShow() {
        setTimeout(resumeFullscreen, 40);
    }

    function disarmBootGesture() {
        if (!bootGestureHandler) return;
        global.document?.removeEventListener("touchstart", bootGestureHandler, true);
        global.document?.removeEventListener("pointerdown", bootGestureHandler, true);
        bootGestureHandler = null;
    }

    function onBootGesture() {
        if (!isTouchCanvasDevice() || isStandalone()) return;
        if (isFullscreen()) {
            disarmBootGesture();
            removeBootOverlay();
            return;
        }
        enterFullscreenFromGesture();
    }

    function armBootGestureUntilEntered() {
        if (!isTouchCanvasDevice() || isStandalone() || isFullscreen()) return;
        if (bootGestureHandler) return;
        bootGestureHandler = onBootGesture;
        global.document?.addEventListener("touchstart", bootGestureHandler, { capture: true, passive: true });
        global.document?.addEventListener("pointerdown", bootGestureHandler, { capture: true, passive: true });
    }

    function removeBootOverlay() {
        if (!bootOverlay) return;
        try { bootOverlay.remove(); } catch (e) { /* */ }
        bootOverlay = null;
        try {
            global.document?.getElementById?.("df-mobile-fs-entry")?.remove?.();
        } catch (e2) { /* */ }
    }

    function dismissTouchBlockers() {
        // Só tira overlay que bloqueia toque. NUNCA sai de tela cheia.
        removeBootOverlay();
        if (isFullscreen()) {
            disarmBootGesture();
            disarmClickToRestoreFullscreen();
        }
    }

    function mountBootOverlayIfNeeded() {
        if (!isTouchCanvasDevice() || isStandalone() || isFullscreen()) return;
        if (isMatchBoardVisible()) return;
        if (bootOverlay || !global.document?.body) return;
        const el = global.document.createElement("div");
        el.id = "df-mobile-fs-entry";
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = [
            "position:fixed", "inset:0", "z-index:2147483645",
            "background:transparent", "touch-action:manipulation",
            "pointer-events:auto", "opacity:0",
        ].join(";");
        const onFirst = () => {
            enterFullscreenFromGesture();
            el.style.pointerEvents = "none";
            setTimeout(removeBootOverlay, 80);
        };
        el.addEventListener("touchstart", onFirst, { capture: true, passive: true });
        el.addEventListener("pointerdown", onFirst, { capture: true, passive: true });
        global.document.body.appendChild(el);
        bootOverlay = el;
    }

    function bootEnterImmersive() {
        if (!isTouchCanvasDevice() || isStandalone()) {
            if (isStandalone()) syncAfterFullscreen();
            return;
        }
        try { global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
        void tryFullscreen().then((ok) => {
            if (!ok) {
                mountBootOverlayIfNeeded();
                armBootGestureUntilEntered();
            }
        });
        if (!usesCssPortraitLayout()) void tryLockLandscape();
    }

    function scheduleBoot() {
        const run = () => {
            requestAnimationFrame(() => {
                bootEnterImmersive();
            });
        };
        if (global.document?.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", run, { once: true });
        } else {
            run();
        }
        global.addEventListener("load", () => {
            if (!isFullscreen()) bootEnterImmersive();
        }, { once: true });
    }

    global.addEventListener("orientationchange", () => {
        setTimeout(() => {
            if (!isCanvasFitImmersive()) return;
            if (!usesCssPortraitLayout()) void tryLockLandscape();
            if (isTouchCanvasDevice() && !isFullscreen()) resumeFullscreen();
        }, 120);
    }, { passive: true });

    if (global.document) {
        global.document.addEventListener("fullscreenchange", onFullscreenChange);
        global.document.addEventListener("webkitfullscreenchange", onFullscreenChange);
        global.document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
    }
    global.addEventListener("pageshow", onPageShow, { passive: true });
    global.addEventListener("focus", () => {
        if (isTouchCanvasDevice()) resumeFullscreen();
    }, { passive: true });

    scheduleBoot();

    global.DfMobileImmersive = Object.freeze({
        isStandalone,
        tryFullscreen,
        enterFullscreenFromGesture,
        armClickToRestoreFullscreen,
        resumeFullscreen,
        bootEnterImmersive,
        dismissTouchBlockers,
    });
})(typeof window !== "undefined" ? window : globalThis);
