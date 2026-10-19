(function () {
    "use strict";

    const CONFIG = Object.freeze({
        "desktop-fullscreen": {
            w: 1280, h: 720,
            pass: { x: 0.092, y: 0.360, wPct: 0.105 },
        },
        "desktop-windowed": {
            w: 1280, h: 720,
            pass: { x: 0.060, y: 0.360, wPct: 0.105 },
        },
        mobile: {
            w: 1280, h: 720,
            pass: { x: 0.042, y: 0.360, wPct: 0.105 },
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

    function syncPassTurnPedestalPosition() {
        const slot = document.getElementById("df-pass-turn-pedestal");
        const game = document.getElementById("game");
        if (!slot || !game?.classList.contains("active")) return;
        if (window.DfLayoutDev?.isLocked?.(slot)) return;

        const art = resolveArt();
        const artSpec = { w: art.w, h: art.h, x: art.pass.x, y: art.pass.y, wPct: art.pass.wPct };
        if (window.DfLayout?.applyCombatPedestalCover?.(slot, artSpec, "pass")) return;
        syncSlotPercent(slot, game, art, art.pass, "pass");
    }

    function syncPassTurnPedestalState() {
        const slot = document.getElementById("df-pass-turn-pedestal");
        const btn = document.getElementById("pass-turn");
        const game = document.getElementById("game");
        if (!slot || !btn) return;

        syncPassTurnPedestalPosition();

        const st = window.__DF_ENGINE?.getRawState?.();
        const hud = window.__dfHud;
        const gameOn = !!(game?.classList.contains("active") && game.style.display !== "none");
        const matchLive = !!(st?.started);
        if (!gameOn || !matchLive) {
            slot.hidden = true;
            btn.disabled = true;
            lastMode = null;
            slot.classList.remove("df-pass-turn-game-over");
            return;
        }

        const gameOver = st.winner != null;
        if (gameOver) {
            slot.hidden = false;
            slot.removeAttribute("hidden");
            slot.classList.add("df-pass-turn-game-over");
            slot.classList.toggle("is-my-turn", true);
            slot.classList.toggle("is-opponent-turn", false);
            btn.classList.toggle("is-pass-active", true);
            btn.classList.toggle("is-wait-active", false);
            btn.disabled = true;
            btn.setAttribute("aria-label", "Passar a vez");
            lastMode = "over";
            return;
        }

        slot.classList.remove("df-pass-turn-game-over");
        const myTurn = hud?.isMyTurn?.() ?? (st?.currentPlayer === (hud?.localSeat?.() ?? 0));
        const mode = myTurn ? "my" : "opp";

        slot.hidden = false;
        slot.classList.toggle("is-my-turn", myTurn);
        slot.classList.toggle("is-opponent-turn", !myTurn);
        btn.classList.toggle("is-pass-active", myTurn);
        btn.classList.toggle("is-wait-active", !myTurn);
        btn.disabled = !myTurn;
        btn.setAttribute("aria-label", myTurn ? "Passar a vez" : "Aguarde — vez do adversário");

        if (lastMode != null && lastMode !== mode) {
            slot.classList.remove("df-pass-turn-swapping");
            void slot.offsetWidth;
            slot.classList.add("df-pass-turn-swapping");
            clearTimeout(swapTimer);
            swapTimer = setTimeout(() => slot.classList.remove("df-pass-turn-swapping"), 360);
        }
        lastMode = mode;
    }

    let lastMode = null;
    let swapTimer = 0;

    window.__dfSyncPassTurnPedestal = syncPassTurnPedestalState;

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncPassTurnPedestalState();
        });
    }

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("df-orientation-sync", scheduleSync, { passive: true });
    window.addEventListener("df-layout-sync", scheduleSync, { passive: true });
    document.addEventListener("fullscreenchange", scheduleSync, { passive: true });
    document.addEventListener("webkitfullscreenchange", scheduleSync, { passive: true });
    try {
        window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
    } catch (e) { /* */ }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleSync, { once: true });
    } else {
        scheduleSync();
    }
})();
