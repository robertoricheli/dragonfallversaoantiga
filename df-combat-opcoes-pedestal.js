(function () {
    "use strict";

    const CONFIG = Object.freeze({
        "desktop-fullscreen": {
            w: 1280, h: 720,
            opcoes: { x: 0.068, y: 0.052, wPct: 0.085 },
        },
        "desktop-windowed": {
            w: 1280, h: 720,
            opcoes: { x: 0.068, y: 0.065, wPct: 0.085 },
        },
        mobile: {
            w: 1280, h: 720,
            opcoes: { x: 0.052, y: 0.065, wPct: 0.085 },
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

    function syncOpcoesPedestalPosition() {
        const slot = document.getElementById("df-combat-opcoes-pedestal");
        const game = document.getElementById("game");
        if (!slot || !game?.classList.contains("active")) return;
        if (window.DfLayoutDev?.isLocked?.(slot)) return;

        const art = resolveArt();
        const artSpec = { w: art.w, h: art.h, x: art.opcoes.x, y: art.opcoes.y, wPct: art.opcoes.wPct };
        if (window.DfLayout?.applyCombatPedestalCover?.(slot, artSpec, "opcoes")) return;
        syncSlotPercent(slot, game, art, art.opcoes, "opcoes");
    }

    function shouldMountCombatOpcoesOverlay() {
        const game = document.getElementById("game");
        return !!(game?.classList.contains("active") && game.style.display !== "none");
    }

    let opcoesHome = null;
    let opcoesScrim = null;

    function ensureOpcoesScrim() {
        if (opcoesScrim?.isConnected) return opcoesScrim;
        opcoesScrim = document.getElementById("df-opcoes-combat-scrim");
        if (!opcoesScrim) {
            opcoesScrim = document.createElement("div");
            opcoesScrim.id = "df-opcoes-combat-scrim";
            opcoesScrim.setAttribute("aria-hidden", "true");
            document.body.appendChild(opcoesScrim);
        }
        return opcoesScrim;
    }

    function showOpcoesScrim() {
        const scrim = ensureOpcoesScrim();
        scrim.hidden = false;
        scrim.removeAttribute("hidden");
    }

    function hideOpcoesScrim() {
        if (!opcoesScrim) return;
        opcoesScrim.hidden = true;
        opcoesScrim.setAttribute("hidden", "");
    }

    function saveOpcoesHome(el) {
        if (!opcoesHome && el?.parentElement) {
            opcoesHome = { parent: el.parentElement, next: el.nextSibling };
        }
    }

    function pausePixiForCombatOpcoes() {
        try {
            const pixi = window.DfPixiVfx;
            if (!pixi?.ensureApp) return;
            const maybe = pixi.ensureApp();
            const stop = (a) => {
                try {
                    if (a?.ticker?.started) a.ticker.stop();
                } catch (e) { /* */ }
            };
            if (maybe && typeof maybe.then === "function") maybe.then(stop).catch(() => {});
            else stop(maybe);
        } catch (e) { /* */ }
    }

    function resumePixiAfterCombatOpcoes() {
        try {
            const pixi = window.DfPixiVfx;
            if (!pixi?.ensureApp) return;
            const maybe = pixi.ensureApp();
            const start = (a) => {
                try {
                    if (a?.stage?.children?.length > 0 && a.ticker && !a.ticker.started) {
                        a.ticker.start();
                    }
                } catch (e) { /* */ }
            };
            if (maybe && typeof maybe.then === "function") maybe.then(start).catch(() => {});
            else start(maybe);
        } catch (e) { /* */ }
    }

    function mountCombatOpcoesOverlay() {
        const opcoes = document.getElementById("opcoes");
        if (!opcoes || !shouldMountCombatOpcoesOverlay()) return;
        saveOpcoesHome(opcoes);
        showOpcoesScrim();
        if (opcoes.parentElement !== document.body) document.body.appendChild(opcoes);
        opcoes.classList.add("df-opcoes-combat-overlay");
        document.documentElement.classList.add("df-opcoes-combat-open");
        pausePixiForCombatOpcoes();
    }

    function unmountCombatOpcoesOverlay() {
        const opcoes = document.getElementById("opcoes");
        hideOpcoesScrim();
        document.documentElement.classList.remove("df-opcoes-combat-open");
        resumePixiAfterCombatOpcoes();
        if (!opcoes) return;
        opcoes.classList.remove("df-opcoes-combat-overlay");
        if (opcoesHome?.parent) {
            opcoesHome.parent.insertBefore(opcoes, opcoesHome.next);
        }
    }

    function openCombatOpcoes() {
        const st = window.__DF_ENGINE?.getRawState?.();
        const localSeat = window.__DF_SEAT ?? 0;
        const localPl = st?.players?.[localSeat];
        if (!localPl || localPl.isAI) return;
        window.__dfOpcoesReturnTo = "game";
        const opcoes = document.getElementById("opcoes");
        if (opcoes) opcoes.classList.add("active");
        mountCombatOpcoesOverlay();
        try { window.__dfShowOpcoesFromCombat?.(); } catch (e) { /* */ }
    }

    function syncCombatOpcoesPedestalState() {
        const slot = document.getElementById("df-combat-opcoes-pedestal");
        const game = document.getElementById("game");
        if (!slot) return;

        syncOpcoesPedestalPosition();

        const st = window.__DF_ENGINE?.getRawState?.();
        const show = !!(game?.classList.contains("active") && game.style.display !== "none"
            && st?.started);
        slot.hidden = !show;
        if (show) slot.removeAttribute("hidden");
        slot.setAttribute("aria-hidden", show ? "false" : "true");
        const btn = document.getElementById("combat-opcoes-btn");
        if (btn) {
            const localSeat = window.__DF_SEAT ?? 0;
            const localPl = st?.players?.[localSeat];
            const humanOnly = !!(localPl && !localPl.isAI);
            const ended = st?.winner != null;
            btn.disabled = !humanOnly || ended;
        }
    }

    window.__dfSyncCombatOpcoesPedestal = syncCombatOpcoesPedestalState;
    window.__dfOpenCombatOpcoes = openCombatOpcoes;
    window.__dfUnmountCombatOpcoesOverlay = unmountCombatOpcoesOverlay;

    let _syncRaf = 0;
    function scheduleSync() {
        if (_syncRaf) return;
        _syncRaf = requestAnimationFrame(() => {
            _syncRaf = 0;
            syncCombatOpcoesPedestalState();
        });
    }

    function wireClick() {
        const btn = document.getElementById("combat-opcoes-btn");
        if (!btn || btn.dataset.dfOpcoesWired === "1") return;
        btn.dataset.dfOpcoesWired = "1";
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openCombatOpcoes();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { wireClick(); scheduleSync(); }, { once: true });
    } else {
        wireClick();
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
