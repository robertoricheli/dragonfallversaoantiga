(function () {
    "use strict";

    /** Relógio visível novamente — agora SÓ o número (estilo pedra), sem disco/ponteiro. */
    const CLOCK_UI_VISIBLE = true;
    /** Novo relógio = contagem regressiva 70→0 apenas com número (todas as versões). */
    const NUMERIC_ONLY = true;

    /** Layout Especial — relógio canto superior direito. */
    const SPECIAL = Object.freeze({
        w: 1280, h: 720,
        point: { x: 0.940, y: 0.090, wPct: 0.055 },
    });
    const CONFIG = Object.freeze({
        "desktop-fullscreen": SPECIAL,
        "desktop-windowed": SPECIAL,
        mobile: SPECIAL,
    });

    /** Sem nudges no layout especial (posição já correta). */
    const CLOCK_NUDGE = { dx: 0, dy: 0, dw: 0 };
    const CLOCK_MOBILE_NUDGE = { dx: 0, dy: 0, dw: 0 };
    const CLOCK_WINDOWED_NUDGE = { dx: 0, dy: 0, dw: 0 };
    const CLOCK_SIZE_SCALE = 1.5;

    const CX = 32;
    const CY = 32;
    const R = 26;

    let rafId = 0;
    let startTs = 0;
    let durationMs = 70000;
    let running = false;
    let mobilePixiActive = false;

    function root() {
        return document.getElementById("desktop-timer");
    }

    function usesMobilePixi() {
        return window.DfArenaClockPixi?.isMobileMode?.() === true;
    }

    function resolveArt() {
        const mode = window.DfLayout?.combatArenaMode?.() || "desktop-fullscreen";
        const base = CONFIG[mode] || CONFIG["desktop-fullscreen"];
        let ax = base.point.x;
        let ay = base.point.y;
        let wPct = base.point.wPct;
        ax += CLOCK_NUDGE.dx;
        ay += CLOCK_NUDGE.dy;
        wPct += CLOCK_NUDGE.dw;
        if (mode === "mobile") {
            ax += CLOCK_MOBILE_NUDGE.dx;
            ay += CLOCK_MOBILE_NUDGE.dy;
            wPct += CLOCK_MOBILE_NUDGE.dw;
        }
        if (window.DfLayout?.isDesktopWindowedViewport?.()) {
            ax += CLOCK_WINDOWED_NUDGE.dx;
            ay += CLOCK_WINDOWED_NUDGE.dy;
            wPct += CLOCK_WINDOWED_NUDGE.dw;
        }
        wPct *= CLOCK_SIZE_SCALE;
        return { w: base.w, h: base.h, x: ax, y: ay, wPct };
    }

    function wedgePath(deg) {
        if (deg < 0.5) return "";
        const endRad = ((deg - 90) * Math.PI) / 180;
        const ex = CX + R * Math.cos(endRad);
        const ey = CY + R * Math.sin(endRad);
        const large = deg > 180 ? 1 : 0;
        return `M ${CX} ${CY} L ${CX} ${CY - R} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
    }

    function setDomProgress(p) {
        const el = root();
        if (!el) return;
        const deg = Math.min(1, Math.max(0, p)) * 360;
        const wedge = el.querySelector(".df-arena-clock-wedge-path");
        const hand = el.querySelector(".df-arena-clock-hand-g");
        if (wedge) {
            wedge.setAttribute("d", wedgePath(deg));
            wedge.setAttribute("fill", el.classList.contains("is-urgent")
                ? "url(#df-clock-wedge-urgent)"
                : "url(#df-clock-wedge-fill)");
        }
        if (hand) {
            hand.setAttribute("transform", `rotate(${deg.toFixed(2)} ${CX} ${CY})`);
        }
    }

    function setProgress(p) {
        if (mobilePixiActive) {
            window.DfArenaClockPixi?.setProgress?.(p);
            return;
        }
        setDomProgress(p);
    }

    function applyShellSize(slot, shellPx) {
        if (!Number.isFinite(shellPx) || shellPx <= 0) return;
        slot.style.setProperty("--df-clock-shell-size", shellPx.toFixed(1) + "px");
    }

    function arenaCoverMetrics(el, artW, artH) {
        const r = el.getBoundingClientRect();
        const ia = artW / artH;
        const ga = r.width / Math.max(1, r.height);
        let rw, rh, ox, oy;
        if (ga > ia) {
            rh = r.height;
            rw = rh * ia;
            ox = (r.width - rw) / 2;
            oy = 0;
        } else {
            rw = r.width;
            rh = rw / ia;
            ox = 0;
            oy = (r.height - rh) / 2;
        }
        return { rect: r, rw, rh, ox, oy };
    }

    /**
     * Acima do véu do zoom (backdrop 99980), abaixo da carta/status (99999).
     * Se ficar ≤ backdrop, o número do turno some sob o dim.
     */
    const HUD_BEHIND_PREVIEW_Z = "99985";

    function hudBehindModalLayer() {
        return document.body?.classList?.contains("preview-open")
            || document.body?.classList?.contains("df-hero-info-open");
    }

    function clockZIndex() {
        if (hudBehindModalLayer()) return HUD_BEHIND_PREVIEW_Z;
        return "221";
    }

    function revealNumericClock(slot) {
        slot.hidden = false;
        slot.setAttribute("aria-hidden", "false");
        const num = slot.querySelector("#timer-display");
        if (num) {
            num.style.setProperty("display", "block", "important");
            num.style.setProperty("visibility", "visible", "important");
            num.style.setProperty("opacity", "1", "important");
        }
    }

    /**
     * Zoom / hub do herói: NÃO mover o número.
     * Antes syncNumericClockOnPedestal ia para a pedra antiga (esquerda)
     * e cobria "Passar Vez". Aqui só reforça z-index e visibilidade.
     */
    function freezeNumericClockBehindModal(slot) {
        if (document.body?.classList?.contains("df-hero-info-open")) {
            slot.hidden = true;
            slot.setAttribute("aria-hidden", "true");
            return true;
        }
        slot.style.setProperty("z-index", HUD_BEHIND_PREVIEW_Z, "important");
        revealNumericClock(slot);
        // Já ancorado à direita das Ações (ou fallback) — não recalcula.
        if (slot.dataset.dfClockNumeric === "actions-right"
            || slot.dataset.dfClockNumeric === "art-fallback") {
            return true;
        }
        // Sem posição ainda: deixa syncNumericClockPosition calcular uma vez.
        return false;
    }

    function syncNumericClockPosition() {
        const slot = root();
        const game = document.getElementById("game");
        if (!slot || slot.hidden || !game?.classList.contains("active")) return;

        const behindModal = hudBehindModalLayer();
        if (behindModal && freezeNumericClockBehindModal(slot)) return;

        /* Layout Especial: canto superior direito, absolute no #game / scale-root. */
        if (window.DfLayout?.useCombatSpecialLayout?.()) {
            const scale = document.getElementById("df-scale-root");
            const host = (scale && game.parentElement === scale) ? scale : game;
            if (slot.parentElement !== host) host.appendChild(slot);
            slot.style.setProperty("position", "absolute", "important");
            slot.style.setProperty("left", "auto", "important");
            slot.style.setProperty("right", "24px", "important");
            slot.style.setProperty("top", "24px", "important");
            slot.style.setProperty("bottom", "auto", "important");
            slot.style.setProperty("transform", "none", "important");
            slot.style.setProperty("width", "auto", "important");
            slot.style.setProperty("height", "auto", "important");
            slot.style.setProperty("z-index", "220", "important");
            slot.style.removeProperty("--df-clock-shell-size");
            delete slot.dataset.dfClockSync;
            slot.dataset.dfClockNumeric = "special-top-right";
            revealNumericClock(slot);
            return;
        }

        const actCount = document.getElementById("df-actions-count-pedestal");
        const actLabel = document.getElementById("df-actions-label-pedestal");
        let anchor = (!actCount?.hidden && actCount) ? actCount : null;
        if (!anchor && actLabel && !actLabel.hidden) anchor = actLabel;
        if (!anchor) {
            // Fallback raro: à direita do contador de ações via métricas do campo,
            // NUNCA na pedra esquerda (Passar Vez).
            const arFake = actCount?.getBoundingClientRect?.();
            if (arFake && arFake.width >= 1) {
                anchor = actCount;
            }
        }
        if (!anchor) {
            // Último recurso: topo-centro do campo (longe do Passar Vez).
            const gr = game.getBoundingClientRect();
            const cx = gr.left + gr.width * 0.62;
            const cy = gr.top + gr.height * 0.12;
            const body = document.body;
            if (slot.parentElement !== body) body.appendChild(slot);
            slot.style.setProperty("position", "fixed", "important");
            slot.style.setProperty("left", cx.toFixed(2) + "px", "important");
            slot.style.setProperty("top", cy.toFixed(2) + "px", "important");
            slot.style.setProperty("transform", "translate(-50%, -50%)", "important");
            slot.style.setProperty("z-index", clockZIndex(), "important");
            slot.dataset.dfClockNumeric = "art-fallback";
            revealNumericClock(slot);
            return;
        }

        const ar = anchor.getBoundingClientRect();
        if (ar.width < 1 || ar.height < 1) return;

        const mode = window.DfLayout?.combatArenaMode?.() || "desktop-fullscreen";
        const modeExtra = mode === "mobile" ? 0.62 : mode === "desktop-windowed" ? 0.72 : 0.76;
        const modePxNudge = mode === "mobile" ? 42 : mode === "desktop-windowed" ? 62 : 52;
        const modePyNudge = mode === "mobile" ? 8 : mode === "desktop-windowed" ? 16 : 18;
        const gap = Math.max(8, ar.width * (0.22 + modeExtra)) + modePxNudge;
        const cx = ar.right + gap - 2;
        const cy = ar.top + ar.height / 2 + modePyNudge;
        const body = document.body;

        if (slot.parentElement !== body) body.appendChild(slot);
        slot.style.setProperty("position", "fixed", "important");
        slot.style.setProperty("left", cx.toFixed(2) + "px", "important");
        slot.style.setProperty("top", cy.toFixed(2) + "px", "important");
        slot.style.setProperty("transform", "translate(0, -50%)", "important");
        slot.style.setProperty("width", "auto", "important");
        slot.style.setProperty("height", "auto", "important");
        slot.style.setProperty("z-index", clockZIndex(), "important");
        slot.style.removeProperty("--df-clock-shell-size");
        slot.style.removeProperty("right");
        slot.style.removeProperty("bottom");
        delete slot.dataset.dfClockSync;
        slot.dataset.dfClockNumeric = "actions-right";
        revealNumericClock(slot);
    }

    function syncDomTurnClockPosition() {
        if (NUMERIC_ONLY) {
            syncNumericClockPosition();
            return;
        }
        const slot = root();
        const game = document.getElementById("game");
        if (!slot || slot.hidden || !game?.classList.contains("active")) return;

        const art = resolveArt();
        const artSpec = { w: art.w, h: art.h, x: art.x, y: art.y, wPct: art.wPct };

        if (window.DfLayout?.applyCombatPedestalCover?.(slot, artSpec, null)) {
            slot.style.setProperty("z-index", "139", "important");
            slot.style.removeProperty("height");
            const shellPx = parseFloat(slot.style.width);
            applyShellSize(slot, shellPx);
            slot.style.removeProperty("width");
            slot.dataset.dfClockSync = "stage-cover";
            return;
        }

        const stage = document.getElementById("game") || document.documentElement;
        const m = arenaCoverMetrics(stage, art.w, art.h);
        const gr = game.getBoundingClientRect();
        const cx = m.rect.left + m.ox + art.x * m.rw;
        const cy = m.rect.top + m.oy + art.y * m.rh;
        const lx = ((cx - gr.left) / Math.max(1, gr.width)) * 100;
        const ly = ((cy - gr.top) / Math.max(1, gr.height)) * 100;
        const shellPx = art.wPct * m.rw;

        if (slot.parentElement !== game) game.appendChild(slot);
        slot.style.setProperty("position", "absolute", "important");
        slot.style.setProperty("left", lx.toFixed(2) + "%", "important");
        slot.style.setProperty("top", ly.toFixed(2) + "%", "important");
        slot.style.setProperty("transform", "translate(-50%, -50%)", "important");
        slot.style.setProperty("width", "auto", "important");
        slot.style.setProperty("height", "auto", "important");
        slot.style.setProperty("z-index", "139", "important");
        applyShellSize(slot, shellPx);
        slot.style.removeProperty("right");
        slot.style.removeProperty("bottom");
        delete slot.dataset.dfClockSync;
    }

    function syncTurnClockPosition() {
        if (mobilePixiActive) {
            window.DfArenaClockPixi?.syncPosition?.();
            return;
        }
        if (usesMobilePixi() && root()?.classList.contains("df-arena-clock--pixi-fallback")) {
            syncDomTurnClockPosition();
            return;
        }
        syncDomTurnClockPosition();
    }

    function tick() {
        if (!running) return;
        const elapsed = performance.now() - startTs;
        const p = elapsed / durationMs;
        setProgress(p);
        if (p < 1) {
            rafId = requestAnimationFrame(tick);
        } else {
            setProgress(1);
        }
    }

    function scheduleSync() {
        if (NUMERIC_ONLY) {
            try { window.__dfSyncActionsPedestal?.(); } catch (e) { /* */ }
        }
        syncTurnClockPosition();
        requestAnimationFrame(() => syncTurnClockPosition());
    }

    function beginDomClock(el, show) {
        if (!el || !show) return;
        el.hidden = false;
        el.setAttribute("aria-hidden", "false");
        el.classList.remove("df-arena-clock--pixi", "df-arena-clock--pixi-fallback");
        scheduleSync();
    }

    async function startMobilePixi(durationSec, show) {
        const el = root();
        durationMs = Math.max(1000, (durationSec || 70) * 1000);
        if (!show || !el) return;

        mobilePixiActive = false;
        el.classList.remove("df-arena-clock--pixi", "df-arena-clock--pixi-fallback");
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");

        const ok = await window.DfArenaClockPixi?.start?.(durationSec, show);
        mobilePixiActive = !!ok;

        if (!ok) {
            el.classList.add("df-arena-clock--pixi-fallback");
            beginDomClock(el, show);
        }

        startTs = performance.now();
        running = true;
        setProgress(0);
        rafId = requestAnimationFrame(tick);
    }

    function start(durationSec, show) {
        if (!CLOCK_UI_VISIBLE) show = false;
        const el = root();
        if (!el) return;
        durationMs = Math.max(1000, (durationSec || 70) * 1000);
        if (!show) {
            stop({ keepHidden: true });
            return;
        }

            if (NUMERIC_ONLY) {
            // Relógio numérico: só mostra/posiciona o número (estilo pedra).
            // Layout Especial / HUB: o tempo vive nos hubs — não revelar #desktop-timer.
            running = false;
            mobilePixiActive = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            el.classList.remove("df-arena-clock--pixi", "df-arena-clock--pixi-fallback", "is-urgent");
            el.classList.add("df-arena-clock--numeric");
            const hubOwnsTimer = !!(window.DfCombatUi?.showHeroHubs?.()
                || window.DfLayout?.useCombatSpecialLayout?.());
            if (hubOwnsTimer) {
                el.hidden = true;
                el.setAttribute("hidden", "");
                el.setAttribute("aria-hidden", "true");
                return;
            }
            el.hidden = false;
            el.setAttribute("aria-hidden", "false");
            scheduleSync();
            return;
        }

        stop({ keepHidden: false });

        if (usesMobilePixi()) {
            void startMobilePixi(durationSec, show);
            return;
        }

        mobilePixiActive = false;
        beginDomClock(el, show);
        startTs = performance.now();
        running = true;
        setProgress(0);
        rafId = requestAnimationFrame(tick);
    }

    function stop(opts) {
        running = false;
        mobilePixiActive = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        window.DfArenaClockPixi?.stop?.(opts);
        const el = root();
        if (!el) return;
        if (!opts?.keepHidden) {
            el.hidden = true;
            el.setAttribute("aria-hidden", "true");
        } else {
            el.hidden = false;
            el.setAttribute("aria-hidden", "false");
            scheduleSync();
        }
        el.classList.remove("is-urgent", "df-arena-clock--pixi", "df-arena-clock--pixi-fallback");
        setProgress(0);
    }

    function syncTurnClock() {
        syncTurnClockPosition();
    }

    window.DfTurnClock = Object.freeze({
        start,
        stop,
        setProgress,
        syncPosition: syncTurnClockPosition,
    });
    window.__dfSyncTurnClock = syncTurnClock;

    function scheduleSyncPassive() {
        scheduleSync();
    }

    window.addEventListener("resize", scheduleSyncPassive, { passive: true });
    window.addEventListener("df-orientation-sync", scheduleSyncPassive, { passive: true });
    window.addEventListener("df-layout-sync", scheduleSyncPassive, { passive: true });
    document.addEventListener("fullscreenchange", scheduleSyncPassive, { passive: true });
    document.addEventListener("webkitfullscreenchange", scheduleSyncPassive, { passive: true });
    try {
        window.visualViewport?.addEventListener("resize", scheduleSyncPassive, { passive: true });
        window.visualViewport?.addEventListener("scroll", scheduleSyncPassive, { passive: true });
    } catch (e) { /* */ }

    if (NUMERIC_ONLY) {
        document.documentElement?.classList.add("df-clock-numeric");
    } else if (!CLOCK_UI_VISIBLE) {
        document.documentElement?.classList.add("df-turn-clock-ui-off");
    }
})();
