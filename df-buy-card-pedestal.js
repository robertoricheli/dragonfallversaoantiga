(function () {
    "use strict";

    const CONFIG = Object.freeze({
        "desktop-fullscreen": {
            w: 1280, h: 720,
            buy: { x: 0.092, y: 0.550, wPct: 0.105 },
            count: { x: 0.092, y: 0.670, wPct: 0.052 },
        },
        "desktop-windowed": {
            w: 1280, h: 720,
            buy: { x: 0.060, y: 0.550, wPct: 0.105 },
            count: { x: 0.060, y: 0.670, wPct: 0.052 },
        },
        mobile: {
            w: 1280, h: 720,
            buy: { x: 0.042, y: 0.550, wPct: 0.105 },
            count: { x: 0.042, y: 0.670, wPct: 0.052 },
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

    function syncBuyCardPedestalPosition() {
        const art = resolveArt();
        syncSlotPosition("df-buy-card-pedestal", art.buy, "buy");
    }

    function syncBuyButtonState() {
        const slot = document.getElementById("df-buy-card-pedestal");
        const btn = document.getElementById("buy-card-pedestal-btn");
        if (!slot || !btn || slot.hidden) return;

        const st = window.__DF_ENGINE?.getRawState?.();
        const gameOver = st?.winner != null;
        if (gameOver) {
            slot.classList.add("df-buy-card-disabled", "df-buy-card-off-turn");
            slot.classList.remove("df-buy-card-can-buy", "df-buy-card-hand-full");
            btn.disabled = true;
            btn.setAttribute("aria-disabled", "true");
            return;
        }

        const probe = window.__dfDeckBadgeBuyState;
        let canBuy = false;
        let handFull = false;
        let buySt = null;
        if (typeof probe === "function") {
            buySt = probe();
            canBuy = !!buySt?.canBuy;
            handFull = !!buySt?.handFull;
        }

        slot.classList.toggle("df-buy-card-can-buy", canBuy);
        slot.classList.toggle("df-buy-card-hand-full", handFull);
        slot.classList.toggle("df-buy-card-disabled", !canBuy);
        slot.classList.toggle("df-buy-card-off-turn", !canBuy && !!buySt?.offTurn);
        btn.disabled = !canBuy;
        btn.setAttribute("aria-disabled", canBuy ? "false" : "true");
        btn.title = canBuy
            ? "Comprar 1 carta (1 ação)"
            : (handFull ? "Mão cheia — não é possível comprar" : "Comprar carta indisponível");
    }

    function syncDeckCountPedestalState(opts) {
        const reposition = opts?.reposition !== false;
        const buySlot = document.getElementById("df-buy-card-pedestal");
        const countSlot = document.getElementById("df-deck-count-pedestal");
        const game = document.getElementById("game");
        if (!countSlot) return;

        const show = !!(game?.classList.contains("active") && game.style.display !== "none");
        if (buySlot) {
            buySlot.hidden = !show;
            buySlot.setAttribute("aria-hidden", show ? "false" : "true");
        }
        countSlot.hidden = true;
        countSlot.setAttribute("aria-hidden", "true");
        if (!show) return;

        if (reposition) syncBuyCardPedestalPosition();
        syncBuyButtonState();
    }

    function onBuyClick(ev) {
        const slot = document.getElementById("df-buy-card-pedestal");
        const btn = document.getElementById("buy-card-pedestal-btn");
        if (!slot || slot.hidden || !btn || btn.disabled) return;
        if (slot.classList.contains("df-buy-card-hand-full")) {
            try { window.__dfDeckBadgeBuyBlocked?.("hand_full"); } catch (e) { /* */ }
            return;
        }
        if (!slot.classList.contains("df-buy-card-can-buy")) return;
        ev.preventDefault();
        ev.stopPropagation();
        try { window.__dfDeckBadgeBuyClick?.(); } catch (e) { /* */ }
    }

    window.__dfSyncBuyCardPedestal = syncDeckCountPedestalState;
    window.__dfSyncBuyCardPedestalLite = () => syncDeckCountPedestalState({ reposition: false });

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncDeckCountPedestalState();
        });
    }

    document.addEventListener("click", (ev) => {
        if (!ev.target.closest("#buy-card-pedestal-btn")) return;
        onBuyClick(ev);
    }, true);

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
