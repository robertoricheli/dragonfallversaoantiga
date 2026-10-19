(function () {
    "use strict";

    const CONFIG = Object.freeze({
        "desktop-fullscreen": {
            w: 1280, h: 720,
            label: { x: 0.892, y: 0.065, wPct: 0.058 },
            count: { x: 0.948, y: 0.065, wPct: 0.038 },
        },
        "desktop-windowed": {
            w: 1280, h: 720,
            label: { x: 0.885, y: 0.085, wPct: 0.058 },
            count: { x: 0.942, y: 0.085, wPct: 0.038 },
        },
        mobile: {
            w: 1280, h: 720,
            label: { x: 0.905, y: 0.085, wPct: 0.058 },
            count: { x: 0.960, y: 0.085, wPct: 0.038 },
        },
    });

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

    function resolveArt() {
        const mode = window.DfLayout?.combatArenaMode?.() || "desktop-fullscreen";
        return { mode, ...(CONFIG[mode] || CONFIG["desktop-fullscreen"]) };
    }

    function syncSlotPercent(slot, game, art, point, varPrefix) {
        const stage = document.getElementById("game") || document.documentElement;
        const m = arenaCoverMetrics(stage, art.w, art.h);
        const gr = game.getBoundingClientRect();
        const cx = m.rect.left + m.ox + point.x * m.rw;
        const cy = m.rect.top + m.oy + point.y * m.rh;
        const lx = ((cx - gr.left) / Math.max(1, gr.width)) * 100;
        const ly = ((cy - gr.top) / Math.max(1, gr.height)) * 100;
        if (slot.parentElement !== game) game.appendChild(slot);
        slot.style.setProperty("--df-" + varPrefix + "-pedestal-x", lx.toFixed(2) + "%");
        slot.style.setProperty("--df-" + varPrefix + "-pedestal-y", ly.toFixed(2) + "%");
        slot.style.setProperty("--df-" + varPrefix + "-pedestal-w", (point.wPct * 100).toFixed(1) + "%");
        slot.style.removeProperty("left");
        slot.style.removeProperty("top");
        slot.style.removeProperty("width");
        slot.style.removeProperty("position");
        slot.style.removeProperty("transform");
        slot.style.removeProperty("z-index");
        delete slot.dataset.dfPedestalSync;
    }

    function syncSlotPosition(slotId, point, varPrefix) {
        const slot = document.getElementById(slotId);
        const game = document.getElementById("game");
        if (!slot || !game?.classList.contains("active")) return;
        if (window.DfLayoutDev?.isLocked?.(slot)) return;

        const art = resolveArt();
        const artSpec = { w: art.w, h: art.h, x: point.x, y: point.y, wPct: point.wPct };
        if (window.DfLayout?.applyCombatPedestalCover?.(slot, artSpec, varPrefix)) return;
        syncSlotPercent(slot, game, art, point, varPrefix);
    }

    function syncActionsFontSizes() {
        const labelSlot = document.getElementById("df-actions-label-pedestal");
        const countSlot = document.getElementById("df-actions-count-pedestal");
        if (labelSlot && !labelSlot.hidden) {
            const w = labelSlot.getBoundingClientRect().width;
            if (w > 4) labelSlot.style.setProperty("--df-actlbl-slot-size", w.toFixed(1) + "px");
        }
        if (countSlot && !countSlot.hidden) {
            const w = countSlot.getBoundingClientRect().width;
            if (w > 4) countSlot.style.setProperty("--df-actct-slot-size", w.toFixed(1) + "px");
        }
    }

    function combatOverlayBlocksActionsHud() {
        // Contagem de ações permanece visível ao ampliar carta (só z-index abaixo do zoom).
        return false;
    }

    function hudBehindModalLayer() {
        return document.body?.classList?.contains("preview-open")
            || document.body?.classList?.contains("df-hero-info-open");
    }

    /**
     * Acima do véu do zoom (backdrop 99980), abaixo da carta/status (99999).
     * Se ficar ≤ backdrop, a contagem some sob o dim.
     */
    const HUD_BEHIND_PREVIEW_Z = "99985";

    function actionsPedestalZIndex() {
        if (hudBehindModalLayer()) return HUD_BEHIND_PREVIEW_Z;
        return "217";
    }

    function resolveActiveActions() {
        const st = window.__DF_ENGINE?.getRawState?.() || null;
        if (!st?.started) return null;
        if (combatOverlayBlocksActionsHud()) return null;
        const localSeat = window.__dfHud?.localSeat?.() ?? 0;
        const seat = st.winner != null ? localSeat : st.currentPlayer;
        if (seat == null) return null;
        const pl = st.players?.[seat];
        if (!pl) return null;
        const raw = Math.max(0, pl.actions ?? 0);
        if (raw <= 0) return 0;
        if (seat === localSeat && st.currentPlayer === localSeat && window.DfRules?.playerHasSpendableAction) {
            return window.DfRules.playerHasSpendableAction(st, seat) ? raw : 0;
        }
        return raw;
    }

    function syncActionsPedestalPosition() {
        const art = resolveArt();
        syncSlotPosition("df-actions-label-pedestal", art.label, "actlbl");
        syncSlotPosition("df-actions-count-pedestal", art.count, "actct");
        requestAnimationFrame(syncActionsFontSizes);
    }

    function reparentPedestalToGame(slot) {
        const game = document.getElementById("game");
        if (!game || !slot || slot.parentElement === game) return;
        delete slot.dataset.dfPedestalSync;
        game.appendChild(slot);
    }

    function syncActionsPedestalState(opts) {
        const previewOpen = document.body?.classList?.contains("preview-open");
        const heroInfoOpen = document.body?.classList?.contains("df-hero-info-open");
        const reposition = (previewOpen || heroInfoOpen) ? false : (opts?.reposition !== false);
        const labelSlot = document.getElementById("df-actions-label-pedestal");
        const countSlot = document.getElementById("df-actions-count-pedestal");
        const countNum = document.getElementById("df-actions-count-pedestal-num");
        const game = document.getElementById("game");
        if (!labelSlot || !countSlot) return;

        const show = !!(game?.classList.contains("active") && game.style.display !== "none");
        if (!show) {
            labelSlot.hidden = true;
            countSlot.hidden = true;
            return;
        }

        const actions = resolveActiveActions();
        if (actions == null) {
            labelSlot.hidden = true;
            countSlot.hidden = true;
            return;
        }
        if (countNum) countNum.textContent = String(actions);

        if (previewOpen || heroInfoOpen) {
            // Hub do herói: esconde HUD. Zoom de carta: mantém rótulo + número de Ações.
            if (heroInfoOpen) {
                labelSlot.hidden = true;
                countSlot.hidden = true;
                return;
            }
            labelSlot.hidden = false;
            countSlot.hidden = false;
            countSlot.style.setProperty("z-index", HUD_BEHIND_PREVIEW_Z, "important");
            labelSlot.style.setProperty("z-index", HUD_BEHIND_PREVIEW_Z, "important");
            syncActionsFontSizes();
            return;
        }

        labelSlot.hidden = false;
        countSlot.hidden = false;

        const z = actionsPedestalZIndex();
        labelSlot.style.setProperty("z-index", z, "important");
        countSlot.style.setProperty("z-index", z, "important");

        if (reposition) syncActionsPedestalPosition();
        else syncActionsFontSizes();
    }

    window.__dfSyncActionsPedestal = syncActionsPedestalState;
    window.__dfSyncActionsPedestalLite = () => syncActionsPedestalState({ reposition: false });
    window.__dfSyncActionsPedestalForce = () => syncActionsPedestalState({ reposition: true });

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncActionsPedestalState();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleSync, { once: true });
    } else {
        scheduleSync();
    }

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("df-orientation-sync", scheduleSync, { passive: true });
    window.addEventListener("df-layout-sync", scheduleSync, { passive: true });
    document.addEventListener("fullscreenchange", scheduleSync, { passive: true });
    document.addEventListener("webkitfullscreenchange", scheduleSync, { passive: true });
    try {
        window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
    } catch (e) { /* */ }
})();
