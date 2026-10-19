(function () {
    "use strict";

    /** Círculo laranja do pedestal direito (jogador). */
    const DECK_BADGE_ART = { w: 1920, h: 1080, x: 0.922, y: 0.448, wPct: 0.084 };
    /** Círculo do pedestal superior direito (baralho da IA). */
    const AI_DECK_BADGE_ART = { w: 1920, h: 1080, x: 0.922, y: 0.108, wPct: 0.084 };

    function root() {
        return document.getElementById("df-deck-badge");
    }

    function rootAi() {
        return document.getElementById("df-deck-badge-ai");
    }

    function isDesktopMouseFullscreen() {
        const doc = document;
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return false;
        if (window.DfLayout?.isTouchGameplay?.()) return false;
        return !window.matchMedia?.("(pointer: coarse)")?.matches;
    }

    function shouldArenaAnchorDeckBadge() {
        if (!window.DfLayout?.isMobileDesktopFit?.()) return false;
        return !!(window.DfLayout?.isMobileUserAgent?.()
            || window.matchMedia?.("(pointer: coarse)")?.matches
            || window.DfLayout?.isDesktopWindowedViewport?.()
            || isDesktopMouseFullscreen());
    }

    function resolvedDeckBadgeArt() {
        let ax = DECK_BADGE_ART.x;
        let ay = DECK_BADGE_ART.y;
        let wPct = DECK_BADGE_ART.wPct;
        ax += 0.008;
        ay += 0.034;
        wPct += 0.012;
        if (window.DfLayout?.isDesktopWindowedViewport?.()) {
            ax += -0.012;
            ay += 0.043;
            wPct += -0.011;
        } else if (isDesktopMouseFullscreen()) {
            ax += 0.020;
            ay += 0.070;
            wPct += -0.004;
        } else {
            ax += 0.008;
            ay += 0.018;
            wPct += -0.008;
        }
        return { w: DECK_BADGE_ART.w, h: DECK_BADGE_ART.h, x: ax, y: ay, wPct };
    }

    function resolvedAiDeckBadgeArt() {
        let ax = AI_DECK_BADGE_ART.x;
        let ay = AI_DECK_BADGE_ART.y;
        let wPct = AI_DECK_BADGE_ART.wPct;
        ax += 0.008;
        ay += 0.028;
        wPct += 0.010;
        if (window.DfLayout?.isDesktopWindowedViewport?.()) {
            ax += -0.010;
            ay += 0.018;
            wPct += -0.010;
        } else if (isDesktopMouseFullscreen()) {
            ax += 0.018;
            ay += 0.032;
            wPct += -0.004;
        } else {
            ax += 0.006;
            ay += 0.012;
            wPct += -0.006;
        }
        return { w: AI_DECK_BADGE_ART.w, h: AI_DECK_BADGE_ART.h, x: ax, y: ay, wPct };
    }

    function isMobileArenaAnchor() {
        return shouldArenaAnchorDeckBadge()
            && !window.DfLayout?.isDesktopWindowedViewport?.();
    }

    function isDesktopWindowedAnchor() {
        return !!window.DfLayout?.isDesktopWindowedViewport?.();
    }

    function clearArenaAnchor(el) {
        if (!el) return;
        el.classList.remove("df-deck-badge-arena-anchor");
        el.classList.remove("df-deck-badge-desktop-windowed");
        el.classList.remove("df-deck-badge-desktop-fullscreen");
        el.classList.remove("df-deck-badge-ai-anchor");
        delete el.dataset.dfDeckBadgeSync;
        el.style.removeProperty("position");
        el.style.removeProperty("left");
        el.style.removeProperty("top");
        el.style.removeProperty("transform");
        el.style.removeProperty("z-index");
        el.style.removeProperty("width");
        const hud = document.getElementById("desktop-right-hud");
        if (hud && el.parentElement !== hud && el.id === "df-deck-badge") hud.appendChild(el);
        if (hud && el.parentElement !== hud && el.id === "df-deck-badge-ai") hud.appendChild(el);
    }

    function applyArenaAnchor(el, art, opts) {
        if (window.DfLayoutDev?.isLocked?.(el)) return;
        const metrics = window.DfLayout?.stageCoverMetrics?.bind(window.DfLayout);
        if (!metrics) return;
        const m = metrics(art.w, art.h);
        const cx = m.ox + art.x * m.rw;
        const cy = m.oy + art.y * m.rh;
        const framePx = art.wPct * m.rw;
        const body = document.body;
        if (el.parentElement !== body) body.appendChild(el);
        el.classList.add("df-deck-badge-arena-anchor");
        el.classList.toggle("df-deck-badge-desktop-windowed", !!window.DfLayout?.isDesktopWindowedViewport?.());
        el.classList.toggle("df-deck-badge-desktop-fullscreen", isDesktopMouseFullscreen());
        if (opts?.ai) el.classList.add("df-deck-badge-ai-anchor");
        el.dataset.dfDeckBadgeSync = "stage-cover";
        el.style.setProperty("position", "fixed", "important");
        el.style.setProperty("left", cx.toFixed(2) + "px", "important");
        el.style.setProperty("top", cy.toFixed(2) + "px", "important");
        const xBias = opts?.xBias ?? "10px";
        const yBias = opts?.yBias ?? "40px";
        el.style.setProperty("--df-deck-badge-arena-x-bias", xBias, "important");
        el.style.setProperty("--df-deck-badge-arena-y-bias", yBias, "important");
        el.style.setProperty(
            "transform",
            "translate(calc(-50% + var(--df-deck-badge-arena-x-bias, 10px)), calc(-50% + var(--df-deck-badge-arena-y-bias, 40px)))",
            "important"
        );
        el.style.setProperty("z-index", opts?.zIndex ?? "214", "important");
        el.style.setProperty("--df-deck-badge-size", framePx.toFixed(1) + "px", "important");
        el.style.removeProperty("right");
        el.style.removeProperty("bottom");
        el.style.removeProperty("margin-bottom");
        el.style.removeProperty("width");
    }

    function syncDeckBadgePosition() {
        const el = root();
        const elAi = rootAi();
        const game = document.getElementById("game");
        if (!el || !game?.classList.contains("active") || game.style.display === "none") {
            if (el) {
                el.hidden = true;
                el.setAttribute("aria-hidden", "true");
                clearArenaAnchor(el);
            }
            if (elAi) {
                elAi.hidden = true;
                elAi.setAttribute("aria-hidden", "true");
                clearArenaAnchor(elAi);
            }
            return;
        }
        if (el) {
            el.hidden = true;
            el.setAttribute("aria-hidden", "true");
            clearArenaAnchor(el);
        }
        if (elAi) {
            elAi.hidden = true;
            elAi.setAttribute("aria-hidden", "true");
            clearArenaAnchor(elAi);
        }
    }

    function syncVisibility() {
        const el = root();
        const elAi = rootAi();
        const game = document.getElementById("game");
        const show = !!(game?.classList.contains("active") && game.style.display !== "none");
        if (el) {
            el.hidden = true;
            el.setAttribute("aria-hidden", "true");
            clearArenaAnchor(el);
        }
        if (elAi) {
            elAi.hidden = true;
            elAi.setAttribute("aria-hidden", "true");
            clearArenaAnchor(elAi);
        }
    }

    function watchGameScreen() {
        const game = document.getElementById("game");
        if (!game || game.dataset.dfDeckBadgeObs === "1") return;
        game.dataset.dfDeckBadgeObs = "1";
        const obs = new MutationObserver(() => syncDeckBadge());
        obs.observe(game, { attributes: true, attributeFilter: ["class", "style"] });
    }

    function syncBuyButtonState() {
        const el = root();
        if (!el || el.hidden) return;
        const probe = window.__dfDeckBadgeBuyState;
        let canBuy = false;
        let handFull = false;
        if (typeof probe === "function") {
            const st = probe();
            canBuy = !!st?.canBuy;
            handFull = !!st?.handFull;
        }
        el.classList.toggle("df-deck-badge-can-buy", canBuy);
        el.classList.toggle("df-deck-badge-hand-full", handFull);
        el.classList.toggle("df-deck-badge-disabled", !canBuy);
        el.setAttribute("aria-disabled", canBuy ? "false" : "true");
        el.title = canBuy
            ? "Comprar 1 carta (1 ação)"
            : (handFull ? "Mão cheia — não é possível comprar" : "Comprar carta indisponível");
    }

    function onBuyClick(ev) {
        const el = root();
        if (!el || el.hidden || el.classList.contains("df-deck-badge-disabled")) return;
        if (el.classList.contains("df-deck-badge-hand-full")) {
            try { window.__dfDeckBadgeBuyBlocked?.("hand_full"); } catch (e) { /* */ }
            return;
        }
        if (!el.classList.contains("df-deck-badge-can-buy")) return;
        ev.preventDefault();
        ev.stopPropagation();
        try { window.__dfDeckBadgeBuyClick?.(); } catch (e) { /* */ }
    }

    function syncDeckBadge() {
        syncVisibility();
        syncDeckBadgePosition();
        syncBuyButtonState();
    }

    let _syncRaf = 0;

    function scheduleSync() {
        syncDeckBadge();
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncDeckBadge();
        });
    }

    window.DfDeckBadge = Object.freeze({
        sync: syncDeckBadge,
        syncVisibility,
        syncPosition: syncDeckBadgePosition,
        syncBuyState: syncBuyButtonState,
    });

    document.addEventListener("click", (ev) => {
        const el = root();
        if (!el || el.hidden || !ev.target.closest("#df-deck-badge")) return;
        onBuyClick(ev);
    }, true);

    document.addEventListener("keydown", (ev) => {
        const el = root();
        if (!el || el.hidden || ev.key !== "Enter" && ev.key !== " ") return;
        if (document.activeElement !== el) return;
        onBuyClick(ev);
    });

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("df-layout-sync", scheduleSync, { passive: true });
    window.addEventListener("df-orientation-sync", scheduleSync, { passive: true });
    document.addEventListener("fullscreenchange", scheduleSync, { passive: true });
    document.addEventListener("webkitfullscreenchange", scheduleSync, { passive: true });
    try {
        window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
    } catch (e) { /* */ }

    document.addEventListener("DOMContentLoaded", () => {
        watchGameScreen();
        scheduleSync();
    }, { once: true });
    if (document.readyState !== "loading") {
        watchGameScreen();
        scheduleSync();
    }
})();
