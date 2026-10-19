/**
 * Dragonfall — destaque sutil do hub do herói na vez (GSAP + Pixi).
 */
(function (global) {
    "use strict";

    const PANEL_IDS = ["dlh-hero-player", "dlh-hero-ai"];
    const tweens = new Map();
    const pixiGlows = new Map();
    const activePanels = new Set();
    let rafId = 0;
    let resizeBound = false;

    function prefersReduced() {
        try {
            return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
        } catch (e) {
            return false;
        }
    }

    function wantsGpu() {
        try {
            return global.DfVfxEngine?.wantsGpuPresentation?.() === true;
        } catch (e) {
            return false;
        }
    }

    function panelIsAi(panel) {
        return panel?.id === "dlh-hero-ai";
    }

    function glowColor(isAi) {
        return isAi ? 0xff8878 : 0x78f082;
    }

    function glowIsLive(id) {
        const glow = pixiGlows.get(id);
        return !!(glow && !glow.destroyed && glow.parent);
    }

    function invalidatePixiHubLayer(app) {
        if (!app) return;
        const layer = app.__dfHeroHubLayer;
        if (layer && (!layer.parent || layer.destroyed)) {
            app.__dfHeroHubLayer = null;
        }
    }

    function onPixiStageCleared() {
        for (const id of [...pixiGlows.keys()]) {
            if (!glowIsLive(id)) pixiGlows.delete(id);
        }
        sync();
    }

    function clearPanelVfx(panel) {
        if (!panel) return;
        const tw = tweens.get(panel.id);
        if (tw) {
            try { tw.kill(); } catch (e) { /* */ }
            tweens.delete(panel.id);
        }
        panel.classList.remove("df-hub-turn-vfx-fallback");
        panel.style.removeProperty("transform");
        activePanels.delete(panel.id);
        const glow = pixiGlows.get(panel.id);
        if (glow) {
            try {
                glow.parent?.removeChild(glow);
                glow.destroy({ children: true });
            } catch (e) { /* */ }
            pixiGlows.delete(panel.id);
        }
        stopLoopIfIdle();
    }

    function stopLoopIfIdle() {
        if (activePanels.size === 0 && rafId) {
            global.cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    function usePixiHubTurnGlow() {
        if (!wantsGpu()) return false;
        // Desktop janela: borda CSS no painel — anel Pixi desincroniza com o canvas escalado.
        if (global.DfLayout?.isDesktopWindowedViewport?.()) return false;
        // Retrato físico: rotação CSS — anel Pixi no campo; só fallback CSS no painel.
        if (global.DfLayout?.shouldUsePortraitLandscapeLayout?.()) return false;
        return true;
    }

    /** Viewport → coordenadas do stage Pixi (clip combate 1280×720 ou tela cheia). */
    function viewportToPixiStage(vx, vy) {
        if (global.DfLayout?.isCanvasFieldLayout?.() && global.DfLayout?.viewportToCanvas) {
            return global.DfLayout.viewportToCanvas(vx, vy);
        }
        const view = global.document.querySelector(".df-pixi-vfx-canvas.df-pixi-combat-clip");
        if (!view) return { x: vx, y: vy };
        const cr = view.getBoundingClientRect();
        return { x: vx - cr.left, y: vy - cr.top };
    }

    function positionPixiGlow(glow, panel, isAi) {
        const ring = glow.__ring;
        if (!ring || !panel) return;
        const r = panel.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const pulse = glow.__pulse?.s ?? 1;
        const pad = 5;
        let w = (r.width + pad * 2) * pulse;
        let h = (r.height + pad * 2) * pulse;
        const alpha = glow.__pulse?.a ?? 0.55;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (global.DfLayout?.isCanvasFieldLayout?.() && global.DfLayout?.viewportToCanvas) {
            const tl = global.DfLayout.viewportToCanvas(r.left, r.top);
            const br = global.DfLayout.viewportToCanvas(r.right, r.bottom);
            w = (Math.abs(br.x - tl.x) + pad * 2) * pulse;
            h = (Math.abs(br.y - tl.y) + pad * 2) * pulse;
        }
        const pt = viewportToPixiStage(cx, cy);
        glow.position.set(pt.x, pt.y);
        ring.clear();
        ring.lineStyle(2.5, glowColor(isAi), alpha);
        ring.drawRoundedRect(-w / 2, -h / 2, w, h, 16);
    }

    function tickPixiGlows() {
        for (const id of activePanels) {
            const panel = global.document.getElementById(id);
            const glow = pixiGlows.get(id);
            if (panel && glow) positionPixiGlow(glow, panel, panelIsAi(panel));
        }
        if (activePanels.size > 0) {
            rafId = global.requestAnimationFrame(tickPixiGlows);
        } else {
            rafId = 0;
        }
    }

    function ensurePixiLoop() {
        if (rafId || activePanels.size === 0) return;
        rafId = global.requestAnimationFrame(tickPixiGlows);
    }

    async function ensurePixiLayer() {
        const pixi = global.DfPixiVfx;
        if (!wantsGpu() || !pixi?.ensureApp) return null;
        const app = await pixi.ensureApp(false);
        if (!app?.stage || !global.PIXI) return null;
        invalidatePixiHubLayer(app);
        if (!app.__dfHeroHubLayer) {
            const layer = new global.PIXI.Container();
            layer.name = "df-hero-hub-turn";
            layer.eventMode = "none";
            layer.interactiveChildren = false;
            app.stage.addChild(layer);
            app.__dfHeroHubLayer = layer;
        }
        return app.__dfHeroHubLayer;
    }

    async function mountPixiGlow(panel) {
        const layer = await ensurePixiLayer();
        if (!layer || !panel) return;
        let glow = pixiGlows.get(panel.id);
        if (glow && !glowIsLive(panel.id)) {
            pixiGlows.delete(panel.id);
            glow = null;
        }
        if (!glow) {
            const ring = new global.PIXI.Graphics();
            glow = new global.PIXI.Container();
            glow.__ring = ring;
            glow.__pulse = { s: 1, a: 0.5 };
            glow.addChild(ring);
            layer.addChild(glow);
            pixiGlows.set(panel.id, glow);
            const gsap = await global.DfGsapBridge?.ensureGsap?.(false);
            if (gsap) {
                gsap.to(glow.__pulse, {
                    s: 1.05,
                    a: 0.82,
                    duration: 1.35,
                    yoyo: true,
                    repeat: -1,
                    ease: "sine.inOut",
                });
            }
        }
        positionPixiGlow(glow, panel, panelIsAi(panel));
    }

    async function startDomPulse(panel, subtle) {
        const gsap = await global.DfGsapBridge?.ensureGsap?.(false);
        if (gsap && global.DfGsapBridge?.canUse?.()) {
            const scale = subtle ? 1.016 : 1.028;
            const tw = gsap.to(panel, {
                scale,
                duration: 1.3,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                transformOrigin: "50% 50%",
            });
            tweens.set(panel.id, tw);
            return;
        }
        panel.classList.add("df-hub-turn-vfx-fallback");
    }

    async function activatePanel(panel) {
        if (!panel) return;
        clearPanelVfx(panel);
        activePanels.add(panel.id);
        if (prefersReduced()) return;
        const usePixi = usePixiHubTurnGlow();
        if (usePixi) {
            await mountPixiGlow(panel);
            await startDomPulse(panel, true);
        } else {
            panel.classList.add("df-hub-turn-vfx-fallback");
        }
        ensurePixiLoop();
        bindResize();
    }

    function bindResize() {
        if (resizeBound) return;
        resizeBound = true;
        global.addEventListener("resize", () => sync(), { passive: true });
        global.addEventListener("df-orientation-sync", () => sync(), { passive: true });
        global.addEventListener("df-layout-sync", () => sync(), { passive: true });
        global.document?.addEventListener?.("fullscreenchange", () => sync(), { passive: true });
        global.document?.addEventListener?.("webkitfullscreenchange", () => sync(), { passive: true });
        global.addEventListener("df-pixi-stage-cleared", () => onPixiStageCleared(), { passive: true });
    }

    function sync() {
        if (global.DfLayout?.useCombatSpecialLayout?.()) {
            killAll();
            return;
        }
        for (const id of PANEL_IDS) {
            const panel = global.document.getElementById(id);
            if (!panel) continue;
            const active = panel.classList.contains("is-active-turn");
            if (!active) {
                if (activePanels.has(id) || tweens.has(id) || pixiGlows.has(id)) {
                    clearPanelVfx(panel);
                }
                continue;
            }
            if (prefersReduced()) continue;
            const wantPixi = usePixiHubTurnGlow();
            if (!wantPixi && pixiGlows.has(id)) {
                clearPanelVfx(panel);
            }
            const needsMount = !activePanels.has(id) || (wantPixi && !glowIsLive(id));
            if (needsMount) {
                void activatePanel(panel);
            } else if (wantPixi && glowIsLive(id)) {
                positionPixiGlow(pixiGlows.get(id), panel, panelIsAi(panel));
            } else if (!wantPixi && !panel.classList.contains("df-hub-turn-vfx-fallback")) {
                panel.classList.add("df-hub-turn-vfx-fallback");
            }
        }
    }

    function killAll() {
        for (const id of [...activePanels]) {
            clearPanelVfx(global.document.getElementById(id));
        }
        activePanels.clear();
        stopLoopIfIdle();
    }

    function onVisibility() {
        if (global.document?.hidden) {
            killAll();
            try { global.gsap?.globalTimeline?.pause?.(); } catch (e) { /* */ }
            return;
        }
        try { global.gsap?.globalTimeline?.resume?.(); } catch (e) { /* */ }
        sync();
    }

    try {
        global.document?.addEventListener?.("visibilitychange", onVisibility, { passive: true });
    } catch (e) { /* */ }

    global.DfHeroHubVfx = {
        sync,
        killAll,
    };
})(typeof window !== "undefined" ? window : globalThis);
