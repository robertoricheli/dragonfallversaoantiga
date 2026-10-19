/**
 * Barra "Carregando" no splash MENU-PRINCIPAL — mesma posição do botão JOGAR.
 * Progresso monotônico (nunca volta) com status detalhado + % dentro da barra.
 */
(function (global) {
    "use strict";

    let visible = false;
    let targetPct = 0;
    let displayPct = 0;
    let animFrame = 0;
    let statusText = "Preparando…";

    function els() {
        return {
            wrap: global.document?.getElementById("df-menu-load-bar"),
            fill: global.document?.getElementById("df-menu-load-bar-fill"),
            track: global.document?.getElementById("df-menu-load-track"),
            pct: global.document?.getElementById("df-menu-load-pct"),
            status: global.document?.getElementById("df-menu-load-status"),
            btn: global.document?.getElementById("btn-main-play"),
        };
    }

    function paintDisplayPct(pct) {
        const clamped = Math.min(100, Math.max(0, Math.round(pct)));
        const { fill, track, pct: pctEl, status } = els();
        if (fill) fill.style.width = clamped + "%";
        if (pctEl) pctEl.textContent = clamped + "%";
        if (status && statusText) status.textContent = statusText;
        if (track) {
            track.setAttribute("aria-valuenow", String(clamped));
            track.setAttribute("aria-valuetext", clamped + "% — " + (statusText || "Carregando"));
        }
    }

    function stopAnim() {
        if (animFrame) {
            global.cancelAnimationFrame?.(animFrame);
            animFrame = 0;
        }
    }

    function tickAnim() {
        animFrame = 0;
        if (!visible) return;
        const diff = targetPct - displayPct;
        if (diff >= 0.4) {
            displayPct += Math.min(diff, Math.max(0.8, diff * 0.18));
            paintDisplayPct(displayPct);
        } else if (displayPct < targetPct) {
            displayPct = targetPct;
            paintDisplayPct(displayPct);
        }
        if (visible && displayPct < 100) {
            animFrame = global.requestAnimationFrame(tickAnim);
        }
    }

    function ensureAnim() {
        if (!animFrame) animFrame = global.requestAnimationFrame(tickAnim);
    }

    function showMenuLoadBar(on, opts) {
        const reset = !(opts && opts.reset === false);
        if (on && visible && !reset) return;
        visible = !!on;
        const { wrap, btn } = els();
        if (wrap) {
            wrap.classList.toggle("active", visible);
            wrap.setAttribute("aria-hidden", visible ? "false" : "true");
        }
        if (btn) {
            btn.classList.toggle("is-loading", visible);
            btn.hidden = visible;
            if (!visible) btn.removeAttribute("hidden");
        }
        if (visible && reset) {
            targetPct = 0;
            displayPct = 0;
            statusText = "Preparando…";
            paintDisplayPct(0);
            ensureAnim();
        } else if (!visible) {
            stopAnim();
        }
    }

    function beginMenuLoadBar() {
        if (!visible) showMenuLoadBar(true, { reset: true });
        ensureAnim();
    }

    function setMenuLoadPct(pct, status) {
        const next = Math.min(100, Math.max(0, Number(pct) || 0));
        if (typeof status === "string" && status.trim()) {
            statusText = status.trim().replace(/\s+/g, " ").slice(0, 96);
            const { status: statusEl } = els();
            if (statusEl) statusEl.textContent = statusText;
        }
        if (next <= targetPct && next <= displayPct && status == null) return;
        targetPct = Math.max(targetPct, next);
        if (displayPct > targetPct) targetPct = displayPct;
        // Em dados móveis, não deixar a barra “presa” em 0% enquanto o download anda.
        if (targetPct - displayPct > 8) {
            displayPct = Math.max(displayPct, targetPct - 6);
        }
        paintDisplayPct(displayPct);
        ensureAnim();
    }

    function setMenuLoadStatus(msg) {
        if (typeof msg !== "string" || !msg.trim()) return;
        statusText = msg.trim().replace(/\s+/g, " ").slice(0, 96);
        const { status } = els();
        if (status) status.textContent = statusText;
    }

    function ensureMenuSplashForLoad() {
        const main = global.document?.getElementById("main");
        if (!main) return;
        main.classList.add("active", "main-splash-screen");
    }

    global.dfShowMenuLoadBar = showMenuLoadBar;
    global.dfBeginMenuLoadBar = beginMenuLoadBar;
    global.dfSetMenuLoadPct = setMenuLoadPct;
    global.dfSetMenuLoadStatus = setMenuLoadStatus;
    global.dfEnsureMenuSplashForLoad = ensureMenuSplashForLoad;
})(typeof window !== "undefined" ? window : globalThis);
