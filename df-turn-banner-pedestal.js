(function () {
    "use strict";

    /** Banner central — pill CSS (SUA VEZ / VEZ DO ADVERSÁRIO), não placa pedra. */
    const SPECIAL = Object.freeze({
        w: 1280, h: 720,
        banner: { x: 0.500, y: 0.500, wPct: 0.115 },
    });
    const CONFIG = Object.freeze({
        "desktop-fullscreen": SPECIAL,
        "desktop-windowed": SPECIAL,
        mobile: SPECIAL,
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

    function syncBannerPosition() {
        const slot = document.getElementById("df-turn-banner-pedestal");
        const game = document.getElementById("game");
        if (!slot || !game?.classList.contains("active")) return;
        if (window.DfLayoutDev?.isLocked?.(slot)) return;

        const art = resolveArt();
        const point = art.banner;
        const artSpec = { w: art.w, h: art.h, x: point.x, y: point.y, wPct: point.wPct };
        if (window.DfLayout?.applyCombatPedestalCover?.(slot, artSpec, "turn-banner")) return;

        const stage = document.getElementById("game") || document.documentElement;
        const m = arenaCoverMetrics(stage, art.w, art.h);
        const gr = game.getBoundingClientRect();
        const cx = m.rect.left + m.ox + point.x * m.rw;
        const cy = m.rect.top + m.oy + point.y * m.rh;
        const lx = ((cx - gr.left) / Math.max(1, gr.width)) * 100;
        const ly = ((cy - gr.top) / Math.max(1, gr.height)) * 100;
        if (slot.parentElement !== game) game.appendChild(slot);
        slot.style.setProperty("--df-turn-banner-pedestal-x", lx.toFixed(2) + "%");
        slot.style.setProperty("--df-turn-banner-pedestal-y", ly.toFixed(2) + "%");
        slot.style.setProperty("--df-turn-banner-pedestal-w", (point.wPct * 100).toFixed(1) + "%");
        slot.style.removeProperty("left");
        slot.style.removeProperty("top");
        slot.style.removeProperty("width");
        slot.style.removeProperty("position");
        slot.style.removeProperty("transform");
        slot.style.removeProperty("z-index");
        delete slot.dataset.dfPedestalSync;
    }

    function syncTurnBannerPedestalState(opts) {
        const slot = document.getElementById("df-turn-banner-pedestal");
        const game = document.getElementById("game");
        if (!slot) return;

        if (opts?.reposition !== false) syncBannerPosition();

        const st = window.__DF_ENGINE?.getRawState?.();
        const hud = window.__dfHud;
        const inCombat = !!(game?.classList.contains("active") && game.style.display !== "none" && st?.started);
        const active = inCombat && st?.currentPlayer != null;

        if (!active) {
            slot.hidden = true;
            slot.setAttribute("hidden", "");
            slot.setAttribute("aria-hidden", "true");
            return;
        }

        const localSeat = Number(hud?.localSeat?.() ?? window.__DF_SEAT ?? 0);
        const localPl = st.players?.[localSeat];
        const cp = Number(st.currentPlayer);
        const online = !!window.__DF_ONLINE;
        // MP: enquanto passa a vez, não mostrar "SUA VEZ" do assento que está saindo.
        const endingPending = online && !!window.__dfTurnEndingPending;
        // Opening seat (0|1|"0"|"1") prevalece até startTurn limpar o flag.
        const openingRaw = window.__dfMatchOpeningSeat;
        const hasOpening = openingRaw === 0 || openingRaw === 1
            || openingRaw === "0" || openingRaw === "1";
        const effectiveCp = hasOpening ? Number(openingRaw) : cp;
        // PvP: ambos isAI=false — turno do oponente humano usa a face adversária.
        const isYourTurn = !endingPending
            && Number.isFinite(effectiveCp) && effectiveCp === localSeat && !!(localPl && !localPl.isAI);
        const isOpponentTurn = endingPending
            || (Number.isFinite(effectiveCp) && effectiveCp !== localSeat);
        const isAiTurn = isOpponentTurn && !!(
            st.players?.[effectiveCp]?.isAI || online
        );

        if (!isYourTurn && !isAiTurn) {
            slot.hidden = true;
            slot.setAttribute("hidden", "");
            slot.setAttribute("aria-hidden", "true");
            return;
        }

        slot.hidden = false;
        slot.removeAttribute("hidden");
        slot.setAttribute("aria-hidden", "false");
        slot.classList.toggle("is-your-turn", !!isYourTurn);
        slot.classList.toggle("is-ai-turn", !!(isAiTurn && !isYourTurn));
    }

    window.__dfSyncTurnBannerPedestal = syncTurnBannerPedestalState;

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncTurnBannerPedestalState();
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
