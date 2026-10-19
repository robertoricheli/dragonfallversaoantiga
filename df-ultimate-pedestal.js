(function () {
    "use strict";

    /** Layout Especial — coords no canvas (CSS tokens sobrescrevem por modo). */
    const BASE = Object.freeze({
        w: 1280, h: 720,
        btn: { x: 0.930, y: 0.380, wPct: 0.082 },
        count: { x: 0.930, y: 0.520, wPct: 0.055 },
    });
    const CONFIG = Object.freeze({
        "desktop-fullscreen": {
            ...BASE,
            btn: { x: 0.922, y: 0.420, wPct: 0.082 },
            count: { x: 0.922, y: 0.555, wPct: 0.055 },
        },
        "desktop-windowed": {
            ...BASE,
            btn: { x: 0.942, y: 0.410, wPct: 0.082 },
            count: { x: 0.942, y: 0.545, wPct: 0.055 },
        },
        mobile: {
            ...BASE,
            btn: { x: 0.962, y: 0.430, wPct: 0.082 },
            count: { x: 0.962, y: 0.565, wPct: 0.055 },
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

    function syncUltimatePedestalPosition() {
        const art = resolveArt();
        syncSlotPosition("df-ultimate-pedestal", art.btn, "ult");
    }

    function resolveMaxUltimateUses(heroId) {
        if (window.DfUltimateResolve?.getMaxUltimateUses) {
            return window.DfUltimateResolve.getMaxUltimateUses(heroId);
        }
        const four = new Set([
            "vaughan", "linguarudo", "pirate", "euravia",
            "ironGuard", "thor",
        ]);
        const three = new Set([
            "iceWitch", "princesaSlime", "jekiro", "sangueDragao", "gancho",
            "paladino", "alquimista", "valmont", "tecnomago",
            "quimera", "hercules", "sinistrela", "estrelar",
        ]);
        if (four.has(heroId)) return 4;
        if (three.has(heroId)) return 3;
        return 4;
    }

    function resolveUltimateRemaining() {
        const st = window.__DF_ENGINE?.getRawState?.() ?? window.__dfGetState?.();
        const hud = window.__dfHud;
        const localSeat = hud?.localSeat?.() ?? (window.__DF_SEAT | 0);
        const pl = hud?.getPlayer?.(localSeat) || st?.players?.[localSeat];
        if (!pl?.heroId) return 0;
        const maxUlt = resolveMaxUltimateUses(pl.heroId);
        return Math.max(0, maxUlt - (pl.ultimateUses ?? 0));
    }

    function syncUltimateCount() {
        const num = document.getElementById("df-ultimate-count-pedestal-num");
        if (!num) return;
        num.textContent = String(resolveUltimateRemaining());
    }

    function syncUltimatePedestalState(opts) {
        const reposition = opts?.reposition !== false;
        const slot = document.getElementById("df-ultimate-pedestal");
        const countSlot = document.getElementById("df-ultimate-count-pedestal");
        const btn = document.getElementById("ultimate-pedestal-btn");
        const legacy = document.getElementById("ultimate-btn");
        const game = document.getElementById("game");
        if (!slot || !btn) return;

        const show = !!(game?.classList.contains("active") && game.style.display !== "none");
        if (countSlot) {
            countSlot.hidden = true;
            countSlot.setAttribute("aria-hidden", "true");
        }
        if (!show) {
            slot.hidden = true;
            btn.disabled = true;
            slot.classList.add("is-disabled");
            slot.classList.remove("df-ultimate-can-use", "is-opponent-turn");
            slot.classList.add("df-ultimate-disabled");
            if (legacy) legacy.disabled = true;
            return;
        }

        if (reposition) syncUltimatePedestalPosition();
        syncUltimateCount();

        const st = window.__DF_ENGINE?.getRawState?.() ?? window.__dfGetState?.();
        const hud = window.__dfHud;
        const matchLive = !!(st?.started);
        if (!matchLive) {
            slot.hidden = true;
            btn.disabled = true;
            slot.classList.add("is-disabled");
            slot.classList.remove("df-ultimate-can-use", "is-opponent-turn");
            slot.classList.add("df-ultimate-disabled");
            if (legacy) legacy.disabled = true;
            return;
        }

        slot.hidden = false;
        if (st.winner != null) {
            btn.disabled = true;
            slot.classList.add("is-disabled", "df-ultimate-disabled");
            slot.classList.remove("df-ultimate-can-use");
            slot.classList.add("is-opponent-turn");
            if (legacy) legacy.disabled = true;
            return;
        }

        const localSeat = hud?.localSeat?.() ?? (window.__DF_SEAT | 0);
        const pl = hud?.getPlayer?.(localSeat) || st?.players?.[localSeat];
        const heroDef = pl?.heroDef || (pl?.heroId && window.__dfHudGetHero?.(pl.heroId));
        const maxUlt = pl?.heroId ? resolveMaxUltimateUses(pl.heroId) : 0;
        const phase = window.__dfGetGamePhase?.() ?? window.__dfGamePhase ?? "normal";
        const myTurn = matchLive && (st?.currentPlayer === localSeat);
        const canUlt = myTurn && phase === "normal" && !!heroDef && pl
            && (pl.ultimateUses ?? 0) < maxUlt
            && !pl.usedUltimateThisTurn;

        btn.disabled = !canUlt;
        slot.classList.toggle("df-ultimate-can-use", canUlt);
        slot.classList.toggle("df-ultimate-disabled", !canUlt);
        slot.classList.toggle("is-disabled", !myTurn);
        slot.classList.toggle("is-opponent-turn", !myTurn);
        btn.title = canUlt
            ? "Use sua Ultimate (sem custo de ação)"
            : "Ultimate indisponível";
        if (legacy) legacy.disabled = !canUlt;
    }

    window.__dfSyncUltimatePedestal = syncUltimatePedestalState;
    window.__dfSyncUltimatePedestalLite = () => syncUltimatePedestalState({ reposition: false });

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncUltimatePedestalState();
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
        document.addEventListener("DOMContentLoaded", () => {
            scheduleSync();
            wireUltimatePressFx();
        }, { once: true });
    } else {
        scheduleSync();
        wireUltimatePressFx();
    }

    /** Animação sutil de clique quando a Ultimate está disponível. */
    function wireUltimatePressFx() {
        const btn = document.getElementById("ultimate-pedestal-btn");
        const slot = document.getElementById("df-ultimate-pedestal");
        if (!btn || !slot || btn.dataset.dfUltPressFx) return;
        btn.dataset.dfUltPressFx = "1";
        let pressTimer = 0;
        btn.addEventListener("pointerdown", (ev) => {
            if (btn.disabled || !slot.classList.contains("df-ultimate-can-use")) return;
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            slot.classList.add("df-ultimate-pressing");
            clearTimeout(pressTimer);
        }, { passive: true });
        const release = () => {
            clearTimeout(pressTimer);
            pressTimer = setTimeout(() => slot.classList.remove("df-ultimate-pressing"), 220);
        };
        btn.addEventListener("pointerup", release, { passive: true });
        btn.addEventListener("pointercancel", release, { passive: true });
    }
})();
