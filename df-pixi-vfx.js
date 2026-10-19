/**
 * Dragonfall — camada PixiJS opcional (Fase 3).
 * Camada PixiJS (Fase 3) — paridade visual mobile/tablet/desktop via GSAP+Pixi.
 */
(function (global) {
    "use strict";

    const LOCAL_PIXI = "js/vendor/pixi.min.js";
    const PIXI_CDN = "https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js";
    const Z = 98450;
    const COMBAT_Z = 100100;
    const CANVAS_W = 1280;
    const CANVAS_H = 720;
    /** @type {{ left: number, top: number, width: number, height: number } | null} */
    let combatClipRect = null;
    // Cenas cinematográficas (ultimates) precisam cobrir a TELA INTEIRA, inclusive
    // as laterais/letterbox fora do tabuleiro. Quando ativo, o Pixi é montado em
    // <body> (fixed; inset:0) no viewport inteiro e as coords passam a ser de
    // viewport (mapeamento identidade), em vez de ficarem presas ao #df-scale-root.
    let pixiFullscreenScene = false;

    function canvasFieldLayout() {
        return !!global.DfLayout?.isCanvasFieldLayout?.();
    }

    function scenePixels() {
        if (pixiFullscreenScene) return { w: global.innerWidth, h: global.innerHeight };
        if (canvasFieldLayout()) return { w: CANVAS_W, h: CANVAS_H };
        return { w: global.innerWidth, h: global.innerHeight };
    }

    function pixiParent() {
        if (canvasFieldLayout()) {
            return global.document.getElementById("df-scale-root") || global.document.body;
        }
        return global.document.body;
    }

    function mountPixiView(a) {
        const p = pixiParent();
        if (a?.view && a.view.parentNode !== p) p.appendChild(a.view);
        return p;
    }

    function pixiLayerStyle(z) {
        if (canvasFieldLayout()) {
            return "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:" + z;
        }
        return "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:" + z;
    }

    /** Mostra/esconde o canvas conforme o palco tem conteúdo (evita cenas invisíveis após clearStage). */
    function syncPixiCanvasVisibility(a) {
        const target = a || app;
        const view = target?.view;
        const stage = target?.stage;
        if (!view || !stage) return;
        const hasContent = stage.children.length > 0;
        view.style.visibility = hasContent ? "visible" : "hidden";
        view.style.opacity = hasContent ? "1" : "0";
        if (hasContent) {
            try { if (target.ticker && !target.ticker.started) target.ticker.start(); } catch (e) { /* */ }
        }
    }

    function installStageVisibilityHook(a) {
        if (!a?.stage || a.stage.__dfVisHook) return;
        a.stage.__dfVisHook = true;
        const sync = () => syncPixiCanvasVisibility(a);
        const wrap = (orig) => function (...args) {
            const r = orig.apply(this, args);
            sync();
            return r;
        };
        a.stage.addChild = wrap(a.stage.addChild.bind(a.stage));
        if (typeof a.stage.addChildAt === "function") {
            a.stage.addChildAt = wrap(a.stage.addChildAt.bind(a.stage));
        }
    }

    function resizePixiRenderer(a, w, h) {
        if (!a?.renderer) return;
        const hints = global.DfViewport?.getPerfHints?.();
        const dprCap = hints?.pixiDprCap ?? 2;
        const adapt = global.DfVfxRuntime?.dprScale?.() ?? 1;
        const res = Math.min(global.devicePixelRatio || 1, dprCap) * adapt;
        if (Math.abs(a.renderer.resolution - res) > 0.04) a.renderer.resolution = res;
        a.renderer.resize(w, h);
    }

    /** @type {"full"|"lite"|"mobile"} */
    let quality = "full";
    /** @type {import("pixi.js").Application | null} */
    let app = null;
    let loadPromise = null;
    let pendingQualityDestroy = false;

    function presentationWantsGpu() {
        try {
            if (global.DfVfxEngine?.wantsGpuPresentation) {
                return !!global.DfVfxEngine.wantsGpuPresentation();
            }
        } catch (e) { /* */ }
        const mode = global.DfVfxSettings?.getMode?.() ?? "auto";
        return mode !== "lite" && mode !== "mobile";
    }

    function setQuality(q) {
        // Automático/Completo: nunca destruir a Application por hint de device.
        // Partículas/DPR já escalam via FX.factor + pixiDprCap + adaptive FPS.
        if (presentationWantsGpu() && (q === "full" || q === "lite")) {
            quality = "full";
            pendingQualityDestroy = false;
            return;
        }
        quality = q || "full";
        if (quality === "full") {
            pendingQualityDestroy = false;
            return;
        }
        if (isAnySceneActive()) {
            pendingQualityDestroy = true;
            return;
        }
        destroyAppForLite();
    }

    function destroyAppForLite() {
        pendingQualityDestroy = false;
        if (!app) return;
        try {
            app.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch (e) { /* */ }
        app = null;
        loadPromise = null;
    }

    function resolveForceQuality() {
        return presentationWantsGpu() ? "full" : "lite";
    }

    function canUse() {
        return quality === "full" || presentationWantsGpu();
    }

    function n(count) {
        return global.DfVfxRuntime?.n?.(count) ?? count;
    }

    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0; let g = 0; let b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        const toByte = (v) => Math.round((v + m) * 255);
        return (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
    }

    function themeFromRecipe(recipe) {
        const hue = recipe?.hue ?? 42;
        return {
            hue,
            core: hslToHex(hue, 92, 62),
            ring: hslToHex(hue + 12, 88, 78),
            spark: hslToHex(hue + 24, 95, 72),
            flash: hslToHex(hue, 70, 92),
        };
    }

    function assetUrl(rel) {
        if (typeof global.dfAssetUrl === "function") return global.dfAssetUrl(rel);
        const v = encodeURIComponent(global.__DF_GAME_V || "dev");
        return rel + (rel.includes("?") ? "&" : "?") + "v=" + v;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (global.PIXI) { resolve(); return; }
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Pixi load failed"));
            document.head.appendChild(s);
        });
    }

    async function loadPixiLib() {
        if (global.PIXI?.Application) return global.PIXI;
        try {
            await loadScript(assetUrl(LOCAL_PIXI));
        } catch (e) {
            if (global.navigator && global.navigator.onLine === false) throw e;
            console.warn("[DfPixiVfx] Pixi local falhou, tentando CDN", e);
            await loadScript(PIXI_CDN);
        }
        if (!global.PIXI?.Application) throw new Error("PIXI.Application missing");
        return global.PIXI;
    }

    function syncRendererResolution(a) {
        if (!a?.renderer) return;
        /* Cena fullscreen (invocação mão→campo, ultimates): coords = viewport.
           NÃO voltar a 1280×720 — loadTexture/ensureApp no meio do voo
           redimensionava o buffer e a carta saía CORTADA na borda inferior. */
        if (pixiFullscreenScene || a.__dfFullscreenScene) {
            resizePixiRenderer(a, global.innerWidth, global.innerHeight);
            return;
        }
        if (canvasFieldLayout()) {
            resizePixiRenderer(a, CANVAS_W, CANVAS_H);
            return;
        }
        const hints = global.DfViewport?.getPerfHints?.();
        const dprCap = hints?.pixiDprCap ?? 2;
        const adapt = global.DfVfxRuntime?.dprScale?.() ?? 1;
        const nextRes = Math.min(global.devicePixelRatio || 1, dprCap) * adapt;
        const useAA = hints?.pixiAA !== false;
        try {
            if (a.renderer.antialias !== useAA) a.renderer.antialias = useAA;
            if (Math.abs(a.renderer.resolution - nextRes) > 0.04) {
                a.renderer.resolution = nextRes;
                a.renderer.resize(global.innerWidth, global.innerHeight);
            }
        } catch (e) { /* */ }
    }

    async function ensureApp(force) {
        if (!force && !canUse()) return null;
        if (force && presentationWantsGpu()) quality = "full";
        else if (force) quality = resolveForceQuality();
        if (app) {
            installStageVisibilityHook(app);
            // Só reposiciona/redimensiona quando NENHUMA cena está ativa.
            // Resize WebGL no meio do voo = hitch + animação cortada/invisível.
            if (!combatSceneActive && targetSceneActive === 0) {
                ensurePixiViewportLayout(app);
                syncRendererResolution(app);
            }
            // O ticker é parado em clearStage() quando o palco esvazia; toda
            // cena passa por ensureApp(), então reiniciamos aqui.
            try { if (app.ticker && !app.ticker.started) app.ticker.start(); } catch (e) { /* */ }
            return app;
        }
        if (loadPromise) return loadPromise;
        const hints = global.DfViewport?.getPerfHints?.();
        const dprCap = hints?.pixiDprCap ?? 2;
        const useAA = hints?.pixiAA !== false;
        const adapt = global.DfVfxRuntime?.dprScale?.() ?? 1;
        loadPromise = (async () => {
            const PIXI = await loadPixiLib();
            const a = new PIXI.Application({
                width: canvasFieldLayout() ? CANVAS_W : global.innerWidth,
                height: canvasFieldLayout() ? CANVAS_H : global.innerHeight,
                backgroundAlpha: 0,
                antialias: useAA,
                resolution: Math.min(global.devicePixelRatio || 1, dprCap) * adapt,
                autoDensity: true,
                powerPreference: hints?.perfTier === "low" ? "low-power" : "high-performance",
            });
            a.view.className = "df-pixi-vfx-canvas";
            a.view.style.cssText = pixiLayerStyle(Z);
            mountPixiView(a);
            if (canvasFieldLayout()) resizePixiRenderer(a, CANVAS_W, CANVAS_H);
            const onResize = () => {
                if (combatSceneActive || targetSceneActive > 0) return;
                syncRendererResolution(a);
            };
            global.addEventListener("resize", onResize);
            a.__dfResize = onResize;
            app = a;
            installStageVisibilityHook(a);
            return a;
        })().catch((err) => {
            loadPromise = null;
            console.warn("[DF PixiVfx]", err);
            return null;
        });
        return loadPromise;
    }

    function runEffect(durationMs, onFrame, onDone) {
        const gsapBridge = global.DfGsapBridge;
        if (gsapBridge?.canUse?.()) {
            return gsapBridge.runEffect(durationMs, onFrame, onDone);
        }
        return new Promise((resolve) => {
            const t0 = performance.now();
            const step = (ts, dt) => {
                const elapsed = ts - t0;
                const t = Math.min(1, elapsed / durationMs);
                onFrame(t, elapsed, dt || 16);
                if (elapsed >= durationMs) {
                    off?.();
                    try { onDone?.(); } catch (e) { /* */ }
                    resolve(true);
                }
            };
            const rt = global.DfVfxRuntime;
            const off = rt?.registerTicker ? rt.registerTicker(step) : null;
            if (!off) {
                const iv = setInterval(() => step(performance.now(), 16), 16);
                setTimeout(() => {
                    clearInterval(iv);
                    try { onDone?.(); } catch (e) { /* */ }
                    resolve(true);
                }, durationMs + 40);
            }
        });
    }

    /**
     * Explosão temática (ultimates) — anéis + partículas + flash central.
     */
    async function playImpactBurst(cx, cy, opts = {}) {
        if (!canUse()) return false;
        const a = await ensureApp();
        if (!a || !global.PIXI) return false;

        const frame = pixiSceneFrame(a);
        const mp = frame.map(cx, cy);
        cx = mp.x;
        cy = mp.y;

        const PIXI = global.PIXI;
        const theme = opts.theme || themeFromRecipe(opts.recipe || { hue: opts.hue ?? 42 });
        const container = new PIXI.Container();
        a.stage.addChild(container);

        const intensity = opts.intensity ?? 1;
        const dur = opts.durationMs ?? 880;
        const ringCount = opts.rings ?? 3;
        const count = opts.particleCount ?? n(28);

        const rings = [];
        for (let i = 0; i < ringCount; i++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(2.5 - i * 0.4, theme.ring, 0.75 - i * 0.15);
            ring.drawCircle(0, 0, 18 + i * 8);
            ring.x = cx;
            ring.y = cy;
            ring.scale.set(0.2);
            container.addChild(ring);
            rings.push(ring);
        }

        const flash = new PIXI.Graphics();
        flash.beginFill(theme.flash, 0.55);
        flash.drawCircle(0, 0, 36 * intensity);
        flash.endFill();
        flash.x = cx;
        flash.y = cy;
        flash.scale.set(0.15);
        container.addChild(flash);

        /** @type {{ g: PIXI.Graphics, vx: number, vy: number, life: number, vr: number }[]} */
        const parts = [];
        for (let i = 0; i < count; i++) {
            const g = new PIXI.Graphics();
            const r = 1.2 + Math.random() * 3.2;
            g.beginFill(i % 3 === 0 ? theme.core : theme.spark, 0.88);
            g.drawCircle(0, 0, r);
            g.endFill();
            g.x = cx;
            g.y = cy;
            const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const spd = (2 + Math.random() * 4.5) * intensity;
            parts.push({
                g,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 1,
                life: 1,
                vr: (Math.random() - 0.5) * 0.18,
            });
            container.addChild(g);
        }

        await runEffect(dur, (t) => {
            rings.forEach((ring, i) => {
                ring.scale.set(0.2 + t * (2.8 + i * 0.9) * intensity);
                ring.alpha = Math.max(0, 0.75 - t * 1.1);
            });
            flash.scale.set(0.15 + t * 2.4 * intensity);
            flash.alpha = Math.max(0, 0.55 * (1 - t * 1.25));
            parts.forEach((p) => {
                p.g.x += p.vx;
                p.g.y += p.vy;
                p.vy += 0.06;
                p.life -= 0.017;
                p.g.rotation += p.vr;
                p.g.alpha = Math.max(0, p.life);
            });
        }, () => {
            try { container.destroy({ children: true }); } catch (e) { /* */ }
            frame.end();
        });
        return true;
    }

    async function playUltimateImpact(cx, cy, recipe, opts = {}) {
        const fast = !!opts.fast || !!recipe?.fastBomb;
        return playImpactBurst(cx, cy, {
            recipe,
            durationMs: fast ? 480 : 920,
            particleCount: fast ? n(16) : n(30),
            rings: fast ? 2 : 3,
            intensity: fast ? 0.9 : 1.15,
        });
    }

    /** Raio vertical — fallback leve (raio duplo / legado). */
    async function playLightningStrike(cx, cy, opts = {}) {
        if (opts.cinematic && global.DfGsapBridge) {
            return playThunderStrikeScene({ cx, cy, cinematic: true, fast: !!opts.fast });
        }
        if (!canUse()) return false;
        const a = await ensureApp();
        if (!a || !global.PIXI) return false;

        const PIXI = global.PIXI;
        const container = new PIXI.Container();
        a.stage.addChild(container);

        const bolt = new PIXI.Graphics();
        bolt.lineStyle(3, 0xe8f4ff, 0.95);
        const top = cy - (opts.height ?? 220);
        bolt.moveTo(cx, top);
        let x = cx;
        let y = top;
        const segs = 7;
        for (let i = 1; i <= segs; i++) {
            x += (Math.random() - 0.5) * 28;
            y += (cy - top) / segs;
            bolt.lineTo(x, y);
        }
        bolt.lineTo(cx, cy);
        container.addChild(bolt);

        const flash = new PIXI.Graphics();
        flash.beginFill(0xd0ecff, 0.5);
        flash.drawCircle(0, 0, 44);
        flash.endFill();
        flash.x = cx;
        flash.y = cy;
        container.addChild(flash);

        const dur = opts.durationMs ?? 420;
        await runEffect(dur, (t) => {
            bolt.alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) * 1.4);
            flash.scale.set(0.3 + t * 2.2);
            flash.alpha = Math.max(0, 0.5 * (1 - t));
        }, () => {
            try { container.destroy({ children: true }); } catch (e) { /* */ }
        });
        return true;
    }

    /** Desenha raio em zigue-zague (procedural, sem emoji). */
    function drawLightningBoltPath(g, unit, topY, bottomY, cx, seed, widthMul) {
        const segs = 12;
        const h = bottomY - topY;
        const w = unit * 0.22 * widthMul;
        g.moveTo(cx, topY);
        let x = cx;
        let y = topY;
        for (let i = 1; i <= segs; i++) {
            const t = i / segs;
            y = topY + h * t;
            const amp = unit * (0.38 - t * 0.12) * widthMul;
            x = cx + Math.sin(i * 2.45 + seed) * amp;
            if (i === segs) { x = cx; y = bottomY; }
            g.lineTo(x, y);
        }
        if (widthMul > 0.55) {
            const branchY = topY + h * 0.42;
            g.moveTo(cx + unit * 0.08, branchY);
            g.lineTo(cx - unit * 0.42, branchY + unit * 0.22);
            g.lineTo(cx - unit * 0.18, branchY + unit * 0.38);
            g.moveTo(cx - unit * 0.05, branchY + unit * 0.12);
            g.lineTo(cx + unit * 0.38, branchY + unit * 0.32);
        }
    }

    /** Vinheta escura nas bordas — sem faixa azul em tela cheia. */
    function makeEdgeVignette(PIXI, strength) {
        const g = new PIXI.Graphics();
        const { w, h } = scenePixels();
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        for (let i = 0; i < 6; i++) {
            const t = i / 5;
            const r = maxR * (0.55 + t * 0.45);
            g.beginFill(0x020208, (strength ?? 0.28) * (0.12 + t * 0.22));
            g.drawCircle(cx, cy, r);
            g.endFill();
        }
        g.alpha = 0;
        return g;
    }

    /** Nuvem elétrica localizada acima do alvo (não banda horizontal). */
    function makeThunderCloud(PIXI, x, y, unit) {
        const c = new PIXI.Container();
        c.x = x;
        c.y = y;
        for (let i = 0; i < 5; i++) {
            const puff = new PIXI.Graphics();
            const rx = unit * (0.35 + Math.random() * 0.55);
            const ry = unit * (0.12 + Math.random() * 0.18);
            puff.beginFill(i % 2 ? 0x334466 : 0x1a2233, 0.55);
            puff.drawEllipse((Math.random() - 0.5) * unit * 0.6, (Math.random() - 0.5) * unit * 0.15, rx, ry);
            puff.endFill();
            c.addChild(puff);
        }
        const glow = new PIXI.Graphics();
        glow.beginFill(0xaaccff, 0.22);
        glow.drawEllipse(0, unit * 0.05, unit * 0.85, unit * 0.22);
        glow.endFill();
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        c.addChild(glow);
        c.alpha = 0;
        return c;
    }

    function makeBoltLayers(PIXI, unit, topY, bottomY, cx, seed, widthMul) {
        const wrap = new PIXI.Container();
        const glow = new PIXI.Graphics();
        glow.lineStyle(unit * 0.14 * widthMul, 0x4488cc, 0.45);
        drawLightningBoltPath(glow, unit, topY, bottomY, cx, seed, 1.35 * widthMul);
        glow.alpha = 0;
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(glow);
        const outer = new PIXI.Graphics();
        outer.lineStyle(unit * 0.09 * widthMul, 0x88ccff, 0.92);
        drawLightningBoltPath(outer, unit, topY, bottomY, cx, seed, 1 * widthMul);
        outer.alpha = 0;
        wrap.addChild(outer);
        const core = new PIXI.Graphics();
        core.lineStyle(unit * 0.038 * widthMul, 0xffffff, 1);
        drawLightningBoltPath(core, unit, topY, bottomY, cx, seed + 0.4, 0.72 * widthMul);
        core.alpha = 0;
        if (PIXI.BLEND_MODES) core.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(core);
        wrap.__glow = glow;
        wrap.__outer = outer;
        wrap.__core = core;
        return wrap;
    }

    /** Explosão Bomba Explosiva — camadas quentes estilo Hearthstone. */
    function buildBombExplosion(PIXI, theme, unit) {
        const root = new PIXI.Container();
        const frames = [];
        const frameCount = 18;
        for (let f = 0; f < frameCount; f++) {
            const t = f / (frameCount - 1);
            const g = new PIXI.Graphics();
            const fade = 1 - t * 0.9;
            const coreR = unit * (0.08 + t * 0.52);
            g.beginFill(0xffffee, fade * 0.92);
            g.drawCircle(0, 0, coreR * 0.28);
            g.endFill();
            g.beginFill(0xffee55, fade * 0.88);
            g.drawCircle(0, 0, coreR * 0.5);
            g.endFill();
            g.beginFill(theme.core, fade * 0.82);
            g.drawCircle(0, 0, coreR * 0.78);
            g.endFill();
            g.beginFill(0xff4400, fade * 0.68);
            g.drawCircle(0, 0, coreR * 1.02);
            g.endFill();
            g.beginFill(0x3a1208, fade * 0.5);
            g.drawCircle(0, 0, coreR * 1.25);
            g.endFill();
            for (let i = 0; i < 12; i++) {
                const ang = (i / 12) * Math.PI * 2 + t * 0.5;
                const dist = unit * (0.1 + t * 0.55);
                g.beginFill(i % 2 ? theme.spark : 0xff6622, fade * 0.75);
                g.drawCircle(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.85, unit * (0.02 + t * 0.05));
                g.endFill();
            }
            g.visible = f === 0;
            g.alpha = 0;
            root.addChild(g);
            frames.push(g);
        }
        return { root, frames, frameCount };
    }

    function makeBombCinematicWash(PIXI) {
        const { w, h } = scenePixels();
        const g = makeEdgeVignette(PIXI, 0.22);
        g.beginFill(0x1a0400, 0.12);
        g.drawRect(0, 0, w, h);
        g.endFill();
        return g;
    }

    function makeBloodDrop(PIXI, unit) {
        const g = new PIXI.Graphics();
        const r = unit * (0.018 + Math.random() * 0.045);
        g.beginFill(Math.random() > 0.3 ? 0xcc1010 : 0x880808, 0.92);
        g.drawEllipse(0, 0, r * 0.85, r * 1.35);
        g.endFill();
        return g;
    }

    function quadBezier(p0, p1, p2, t) {
        const u = 1 - t;
        return {
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        };
    }

    function makePoisonCinematicWash(PIXI) {
        const { w, h } = scenePixels();
        const g = makeEdgeVignette(PIXI, 0.26);
        g.beginFill(0x041a06, 0.2);
        g.drawRect(0, 0, w, h);
        g.endFill();
        g.alpha = 0;
        return g;
    }

    function makeVampCinematicWash(PIXI) {
        const { w, h } = scenePixels();
        const g = makeEdgeVignette(PIXI, 0.28);
        g.beginFill(0x1a0008, 0.22);
        g.drawRect(0, 0, w, h);
        g.endFill();
        g.alpha = 0;
        return g;
    }

    function makeSlimeBlob(PIXI, unit, sc) {
        const g = new PIXI.Graphics();
        const r = unit * 0.3 * (sc || 1);
        g.beginFill(0x2daf23, 0.94);
        for (let i = 0; i <= 12; i++) {
            const ang = (i / 12) * Math.PI * 2;
            const wob = 0.82 + Math.sin(ang * 3.5) * 0.16;
            const px = Math.cos(ang) * r * wob;
            const py = Math.sin(ang) * r * wob * 1.08;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.closePath();
        g.endFill();
        g.beginFill(0xc8ff82, 0.58);
        g.drawEllipse(-r * 0.18, -r * 0.12, r * 0.42, r * 0.26);
        g.endFill();
        g.beginFill(0x1a5f14, 0.65);
        g.drawEllipse(0, r * 0.26, r * 0.52, r * 0.18);
        g.endFill();
        return g;
    }

    function buildPoisonExplosion(PIXI, theme, unit) {
        const root = new PIXI.Container();
        const frames = [];
        const frameCount = 16;
        for (let f = 0; f < frameCount; f++) {
            const t = f / (frameCount - 1);
            const g = new PIXI.Graphics();
            const fade = 1 - t * 0.92;
            const coreR = unit * (0.1 + t * 0.48);
            g.beginFill(0xe8ffb0, fade * 0.9);
            g.drawCircle(0, 0, coreR * 0.3);
            g.endFill();
            g.beginFill(theme.flash, fade * 0.85);
            g.drawCircle(0, 0, coreR * 0.55);
            g.endFill();
            g.beginFill(theme.core, fade * 0.8);
            g.drawCircle(0, 0, coreR * 0.82);
            g.endFill();
            g.beginFill(0x3bc428, fade * 0.65);
            g.drawCircle(0, 0, coreR * 1.05);
            g.endFill();
            for (let i = 0; i < 10; i++) {
                const ang = (i / 10) * Math.PI * 2 + t * 0.6;
                const dist = unit * (0.08 + t * 0.52);
                g.beginFill(i % 2 ? 0x7aff55 : theme.spark, fade * 0.72);
                g.drawEllipse(
                    Math.cos(ang) * dist,
                    Math.sin(ang) * dist * 0.78 + unit * t * 0.04,
                    unit * (0.03 + t * 0.06),
                    unit * (0.04 + t * 0.08),
                );
                g.endFill();
            }
            g.visible = f === 0;
            g.alpha = 0;
            root.addChild(g);
            frames.push(g);
        }
        return { root, frames, frameCount };
    }

    function makeAcidPool(PIXI, unit) {
        const root = new PIXI.Container();
        const pool = new PIXI.Graphics();
        pool.beginFill(0x2a9018, 0.82);
        pool.drawEllipse(0, 0, unit * 1.18, unit * 0.44);
        pool.endFill();
        pool.beginFill(0x6ee848, 0.48);
        pool.drawEllipse(0, -unit * 0.06, unit * 0.85, unit * 0.26);
        pool.endFill();
        pool.beginFill(0x1a6010, 0.7);
        pool.drawEllipse(0, unit * 0.1, unit * 0.98, unit * 0.2);
        pool.endFill();
        root.addChild(pool);
        const bubbles = [];
        for (let i = 0; i < 10; i++) {
            const b = new PIXI.Graphics();
            const br = unit * (0.022 + Math.random() * 0.038);
            b.beginFill(0xb8ff90, 0.75);
            b.drawCircle(0, 0, br);
            b.endFill();
            b.x = (Math.random() - 0.5) * unit * 0.95;
            b.y = (Math.random() - 0.5) * unit * 0.18;
            b.alpha = 0;
            root.addChild(b);
            bubbles.push(b);
        }
        root.scale.set(0.15);
        root.alpha = 0;
        return { root, bubbles };
    }

    /** Desenha arco de sangue (glow + núcleo) ao longo de curva quadrática. */
    function drawBloodArc(PIXI, p0, p1, p2, unit, width, color, alpha) {
        const g = new PIXI.Graphics();
        const steps = 28;
        g.lineStyle(width, color, alpha);
        g.moveTo(p0.x, p0.y);
        for (let i = 1; i <= steps; i++) {
            const pt = quadBezier(p0, p1, p2, i / steps);
            g.lineTo(pt.x, pt.y);
        }
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    function buildVingancaSword(PIXI, unit) {
        const sword = new PIXI.Container();
        const blade = new PIXI.Graphics();
        blade.beginFill(0xe8ecf8);
        blade.moveTo(0, -unit * 1.55);
        blade.lineTo(unit * 0.2, unit * 0.38);
        blade.lineTo(-unit * 0.2, unit * 0.38);
        blade.closePath();
        blade.endFill();
        blade.beginFill(0xffffff, 0.55);
        blade.moveTo(0, -unit * 1.35);
        blade.lineTo(unit * 0.08, unit * 0.1);
        blade.lineTo(-unit * 0.08, unit * 0.1);
        blade.closePath();
        blade.endFill();
        sword.addChild(blade);
        const guard = new PIXI.Graphics();
        guard.beginFill(0x8a2020);
        guard.drawRect(-unit * 0.32, unit * 0.34, unit * 0.64, unit * 0.1);
        guard.endFill();
        sword.addChild(guard);
        const grip = new PIXI.Graphics();
        grip.beginFill(0x2a1010);
        grip.drawRect(-unit * 0.1, unit * 0.42, unit * 0.2, unit * 0.38);
        grip.endFill();
        sword.addChild(grip);
        const trail = new PIXI.Graphics();
        trail.beginFill(0xff3030, 0.35);
        trail.drawEllipse(-unit * 0.55, 0, unit * 1.1, unit * 0.22);
        trail.endFill();
        if (PIXI.BLEND_MODES) trail.blendMode = PIXI.BLEND_MODES.ADD;
        trail.alpha = 0;
        sword.addChild(trail);
        sword.__trail = trail;
        sword.pivot.set(0, unit * 0.55);
        return sword;
    }

    /**
     * Thor — Trovoada cinematográfica (Pixi+GSAP).
     * Raio vertical do céu, flash localizado, ondas elétricas — sem faixa azul.
     */
    async function playThunderStrikeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        const fast = !!opts.fast && !cinematic;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        // Cena cinematográfica do THOR cobre o VIEWPORT inteiro (pedido do autor:
        // o raio não pode ficar preso ao retângulo do tabuleiro nem deixar faixas
        // pretas). Em fullscreen o map é identidade; fora dele, alinha ao clip.
        const frame = pixiSceneFrame(a, cinematic);
        const _thM = frame.map(cx, cy);
        cx = _thM.x;
        cy = _thM.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe({ hue: opts.hue ?? 210 });
        const unit = cardUnit(1);
        const topY = Math.max(8, cy - Math.min(global.innerHeight * 0.62, unit * 8.5));
        const seed = opts.seed ?? Math.random() * 6;

        const anticipateMs = opts.anticipateMs ?? (cinematic ? 380 : (fast ? 80 : 160));
        const strikeMs = opts.strikeMs ?? (cinematic ? 160 : 80);
        const impactMs = opts.impactMs ?? (cinematic ? 980 : (fast ? 360 : 580));
        const lingerMs = opts.lingerMs ?? (cinematic ? 520 : (fast ? 80 : 240));

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        const edgeVignette = cinematic ? makeEdgeVignette(PIXI, 0.24) : null;
        if (edgeVignette) container.addChild(edgeVignette);

        const cloud = makeThunderCloud(PIXI, cx, topY - unit * 0.35, unit);
        container.addChild(cloud);

        const boltWrap = new PIXI.Container();
        container.addChild(boltWrap);

        const mainBolt = makeBoltLayers(PIXI, unit, topY, cy, cx, seed, 1);
        boltWrap.addChild(mainBolt);
        const forkBolts = [];
        if (cinematic) {
            for (let fi = 0; fi < 2; fi++) {
                const offX = (fi === 0 ? -1 : 1) * unit * (0.55 + fi * 0.2);
                const fork = makeBoltLayers(PIXI, unit, topY + unit * 0.8, cy + unit * 0.15, cx + offX, seed + fi * 2.7 + 1.1, 0.62);
                fork.alpha = 0;
                boltWrap.addChild(fork);
                forkBolts.push(fork);
            }
        }

        const impactRoot = new PIXI.Container();
        impactRoot.x = cx;
        impactRoot.y = cy;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const impactBloom = makeSoftBloom(PIXI, theme, unit, cinematic ? 1.45 : 0.95);
        impactBloom.alpha = 0;
        impactRoot.addChild(impactBloom);

        const impactSheet = await sheetTextures(PIXI, "lightning_hit");
        if (impactSheet?.frames?.length) {
            const impactSprite = new PIXI.AnimatedSprite(impactSheet.frames);
            impactSprite.anchor.set(0.5);
            impactSprite.loop = false;
            const impactSc = sheetScale(unit, impactSheet.meta.size, cinematic ? 3.6 : 2);
            impactSprite.scale.set(impactSc * 0.12);
            impactSprite.alpha = 0;
            if (PIXI.BLEND_MODES) impactSprite.blendMode = PIXI.BLEND_MODES.ADD;
            impactRoot.addChild(impactSprite);
            impactRoot.__impactSprite = impactSprite;
            impactRoot.__impactSheet = impactSheet;
            impactRoot.__impactPeak = impactSc;
        }

        const shockRings = [];
        for (let i = 0; i < (cinematic ? 5 : 2); i++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2, unit * 0.028) - i * 0.28, theme.ring, 0.92 - i * 0.1);
            ring.drawCircle(0, 0, unit * (0.18 + i * 0.07));
            ring.scale.set(0.08);
            ring.alpha = 0;
            impactRoot.addChild(ring);
            shockRings.push(ring);
        }

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.98);
        flashCore.drawCircle(0, 0, unit * 0.38);
        flashCore.endFill();
        flashCore.scale.set(0.04);
        flashCore.alpha = 0;
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const sparkCount = n(cinematic ? 52 : (fast ? 12 : 24));
        const sparks = [];
        for (let i = 0; i < sparkCount; i++) {
            const g = makeEmber(PIXI, theme, unit, i % 4 === 0);
            g.visible = false;
            container.addChild(g);
            sparks.push({ g, vx: 0, vy: 0, vr: 0, drag: 0.986 });
        }

        const anticipateDur = anticipateMs / 1000;
        const strikeDur = strikeMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const shakeProxy = { t: 0 };
        const partProxy = { t: 0 };
        const flickerProxy = { p: 0 };

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            frame.end();
            return false;
        }

        if (edgeVignette) {
            tl.to(edgeVignette, { alpha: 1, duration: anticipateDur * 0.5, ease: "sine.out" }, 0);
        }
        tl.to(cloud, { alpha: cinematic ? 0.88 : 0.55, duration: anticipateDur * 0.65, ease: "sine.out" }, 0);
        tl.to(cloud.scale, { x: 1.12, y: 1.08, duration: anticipateDur, ease: "sine.inOut" }, 0);

        const strikeAt = anticipateDur;
        tl.addLabel("strike", strikeAt);
        tl.to(mainBolt.__glow, { alpha: 0.9, duration: 0.03 }, "strike");
        tl.to(mainBolt.__outer, { alpha: 1, duration: 0.025 }, "strike");
        tl.to(mainBolt.__core, { alpha: 1, duration: 0.018 }, "strike");
        forkBolts.forEach((fork, fi) => {
            tl.to(fork, { alpha: 0.75, duration: 0.03 }, `strike+=${0.02 + fi * 0.015}`);
            tl.to(fork.__glow, { alpha: 0.65, duration: 0.03 }, `strike+=${0.02 + fi * 0.015}`);
            tl.to(fork.__outer, { alpha: 0.85, duration: 0.025 }, `strike+=${0.02 + fi * 0.015}`);
            tl.to(fork.__core, { alpha: 0.9, duration: 0.02 }, `strike+=${0.02 + fi * 0.015}`);
        });
        tl.to(flickerProxy, {
            p: 1,
            duration: strikeDur * 0.85,
            ease: "none",
            onUpdate: () => {
                const flick = 0.55 + Math.sin(flickerProxy.p * 48) * 0.45;
                mainBolt.__core.alpha = flick;
                mainBolt.__outer.alpha = flick * 0.92;
            },
        }, "strike");
        tl.to(mainBolt.__glow, { alpha: 0, duration: strikeDur * 0.5 }, `strike+=${strikeDur * 0.15}`);
        tl.to(mainBolt.__outer, { alpha: 0, duration: strikeDur * 0.45 }, `strike+=${strikeDur * 0.18}`);
        tl.to(mainBolt.__core, { alpha: 0, duration: strikeDur * 0.4 }, `strike+=${strikeDur * 0.2}`);
        forkBolts.forEach((fork) => {
            tl.to(fork, { alpha: 0, duration: strikeDur * 0.35 }, `strike+=${strikeDur * 0.12}`);
        });
        tl.to(cloud, { alpha: 0, duration: strikeDur * 0.55, ease: "power2.out" }, `strike+=${strikeDur * 0.08}`);

        const impactAt = strikeAt + strikeDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
        }, "impact");
        tl.to({}, { duration: cinematic ? 0.05 : 0.03 }, "impact");

        if (impactRoot.__impactSprite && impactRoot.__impactSheet) {
            const peak = impactRoot.__impactPeak;
            const sheet = impactRoot.__impactSheet;
            const spr = impactRoot.__impactSprite;
            tl.to(spr, { alpha: 1, duration: 0.04 }, "impact");
            tl.to(spr.scale, { x: peak, y: peak, duration: impactDur * 0.5, ease: "power3.out" }, "impact");
            tl.to({}, {
                duration: impactDur * 0.65,
                onUpdate() {
                    const prog = this.progress();
                    const fi = Math.min(sheet.frames.length - 1, Math.floor(prog * sheet.frames.length));
                    spr.texture = sheet.frames[fi];
                },
            }, "impact");
            tl.to(spr, { alpha: 0, duration: impactDur * 0.24 }, `impact+=${impactDur * 0.48}`);
        }

        tl.to(impactBloom, { alpha: 0.85, duration: 0.05 }, "impact");
        tl.to(impactBloom.scale, { x: 1.35, y: 1.35, duration: impactDur * 0.35, ease: "power2.out" }, "impact");
        tl.to(impactBloom, { alpha: 0, duration: impactDur * 0.38 }, `impact+=${impactDur * 0.12}`);

        shockRings.forEach((ring, i) => {
            const off = i * 0.042;
            tl.to(ring, { alpha: 0.92 - i * 0.08, duration: 0.04 }, `impact+=${off}`);
            tl.to(ring.scale, {
                x: cinematic ? 4.8 + i * 1.0 : 2.8 + i * 0.65,
                y: cinematic ? 4.8 + i * 1.0 : 2.8 + i * 0.65,
                duration: impactDur * 0.55, ease: "power2.out",
            }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: impactDur * 0.34 }, `impact+=${0.15 + off}`);
        });

        tl.to(flashCore, { alpha: 1, duration: 0.025 }, "impact");
        tl.to(flashCore.scale, {
            x: cinematic ? 6.2 : 3.6, y: cinematic ? 6.2 : 3.6,
            duration: impactDur * 0.26, ease: "power2.out",
        }, "impact");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.32 }, `impact+=${impactDur * 0.08}`);

        tl.to(shakeWrap.scale, {
            x: cinematic ? 1.045 : 1.028, y: cinematic ? 1.045 : 1.028,
            duration: 0.05, ease: "power2.out",
        }, "impact");
        tl.to(shakeWrap.scale, { x: 1, y: 1, duration: 0.34, ease: "power2.out" }, `impact+=0.05`);

        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.48 : 0.28,
            ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeProxy.t) * (cinematic ? 16 : 9);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "impact");

        tl.add(() => {
            sparks.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / sparks.length + (Math.random() - 0.5) * 0.55;
                const spd = (cinematic ? 7 : 3.8) + Math.random() * (cinematic ? 12 : 5.5);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - (cinematic ? 5 : 2.8);
                p.vr = (Math.random() - 0.5) * 0.4;
                p.g.visible = true;
                p.g.x = cx + (Math.random() - 0.5) * unit * 0.3;
                p.g.y = cy + (Math.random() - 0.5) * unit * 0.25;
                p.g.alpha = 1;
            });
        }, "impact");

        tl.to(partProxy, {
            t: 1,
            duration: lingerDur + impactDur * 0.28,
            ease: "none",
            onUpdate: () => {
                sparks.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.11;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.05);
                });
            },
        }, "impact");

        if (edgeVignette) {
            tl.to(edgeVignette, { alpha: 0, duration: lingerDur * 0.7, ease: "power2.out" }, `impact+=${impactDur * 0.18}`);
        }

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        const thunderMaxSec = (anticipateMs + strikeMs + impactMs + lingerMs) / 1000 + 0.6;
        try {
            await awaitPixiTimeline(tl, shakeWrap, thunderMaxSec);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * RAIO DUPLO (onEnter) — dois raios em zigue-zague no alvo.
     * Pixi.js + GSAP, impacto elétrico divertido (nível Hearthstone).
     * ============================================================ */
    async function playRaioDuploStrikeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;

        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy);
        cx = m.x; cy = m.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe({ hue: 205 });
        const unit = cardUnit(1);
        const topY = Math.max(8, cy - Math.min(global.innerHeight * 0.48, unit * 6.5));
        const seed = opts.seed ?? Math.random() * 6;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        const skyFlash = new PIXI.Graphics();
        const scene = scenePixels();
        skyFlash.beginFill(0x1a2848, 0.35);
        skyFlash.drawRect(0, 0, scene.w, scene.h);
        skyFlash.endFill();
        skyFlash.alpha = 0;
        root.addChild(skyFlash);

        const cloud = makeThunderCloud(PIXI, cx, topY - unit * 0.3, unit);
        root.addChild(cloud);

        const bolts = [];
        const offsets = cinematic ? [-unit * 0.42, unit * 0.38] : [-unit * 0.28, unit * 0.24];
        offsets.forEach((offX, bi) => {
            const bolt = makeBoltLayers(PIXI, unit, topY, cy, cx + offX, seed + bi * 2.3, bi === 0 ? 1 : 0.78);
            bolt.alpha = 0;
            root.addChild(bolt);
            bolts.push(bolt);
        });

        const targetBloom = makeSoftBloom(PIXI, theme, unit, cinematic ? 1.35 : 0.95);
        targetBloom.x = cx;
        targetBloom.y = cy;
        targetBloom.alpha = 0;
        root.addChild(targetBloom);

        const shockRings = [];
        for (let ri = 0; ri < 3; ri++) {
            const ring = new PIXI.Graphics();
            ring.beginFill(0x88d8ff, 0.35 - ri * 0.06);
            ring.drawEllipse(0, 0, unit * (0.65 + ri * 0.14), unit * (0.5 + ri * 0.11));
            ring.endFill();
            if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
            ring.x = cx; ring.y = cy; ring.alpha = 0; ring.scale.set(0.2);
            root.addChild(ring);
            shockRings.push(ring);
        }

        const sparkN = n(cinematic ? 36 : 18);
        const sparks = [];
        for (let i = 0; i < sparkN; i++) {
            const sp = makeSoftOrb(PIXI, i % 2 ? 0xe8f8ff : 0x66ccff, unit * (0.04 + Math.random() * 0.08), 0.88);
            sp.visible = false;
            root.addChild(sp);
            sparks.push({ g: sp, vx: 0, vy: 0, vr: 0 });
        }

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.95);
        flashCore.drawCircle(0, 0, unit * 0.35);
        flashCore.endFill();
        flashCore.x = cx; flashCore.y = cy;
        flashCore.alpha = 0; flashCore.scale.set(0.05);
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(flashCore);

        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const windup = cinematic ? 0.28 : 0.14;
            tl.to(skyFlash, { alpha: 0.7, duration: windup * 0.5, ease: "sine.out" }, 0);
            tl.to(cloud, { alpha: 0.85, duration: windup * 0.6, ease: "sine.out" }, 0);
            tl.to(targetBloom, { alpha: 0.5, duration: windup, ease: "sine.out" }, 0);

            const strikeAt = windup * 0.85;
            tl.addLabel("strike", strikeAt);
            bolts.forEach((bolt, bi) => {
                const off = bi * 0.06;
                tl.to(bolt.__glow, { alpha: 0.85, duration: 0.03 }, `strike+=${off}`);
                tl.to(bolt.__outer, { alpha: 1, duration: 0.025 }, `strike+=${off}`);
                tl.to(bolt.__core, { alpha: 1, duration: 0.02 }, `strike+=${off}`);
                tl.to(bolt, { alpha: 1, duration: 0.02 }, `strike+=${off}`);
                tl.to(bolt.__glow, { alpha: 0, duration: 0.22, ease: "power2.out" }, `strike+=${0.08 + off}`);
                tl.to(bolt.__outer, { alpha: 0, duration: 0.2, ease: "power2.out" }, `strike+=${0.1 + off}`);
                tl.to(bolt.__core, { alpha: 0, duration: 0.18, ease: "power2.out" }, `strike+=${0.12 + off}`);
            });

            tl.to(flashCore, { alpha: 1, duration: 0.04 }, "strike+=0.1");
            tl.to(flashCore.scale, { x: 5.5, y: 5.5, duration: 0.28, ease: "power2.out" }, "strike+=0.1");
            tl.to(flashCore, { alpha: 0, duration: 0.32, ease: "power2.out" }, "strike+=0.18");

            tl.to(targetBloom, { alpha: 0.95, duration: 0.06 }, "strike+=0.08");
            tl.to(targetBloom.scale, { x: 1.8, y: 1.8, duration: 0.42, ease: "power2.out" }, "strike+=0.08");
            tl.to(targetBloom, { alpha: 0, duration: 0.45, ease: "power2.out" }, "strike+=0.35");

            shockRings.forEach((ring, ri) => {
                const off = 0.1 + ri * 0.05;
                tl.to(ring, { alpha: 0.88, duration: 0.06 }, `strike+=${off}`);
                tl.to(ring.scale, { x: 3 + ri * 0.4, y: 2.5 + ri * 0.35, duration: 0.5, ease: "power2.out" }, `strike+=${off}`);
                tl.to(ring, { alpha: 0, duration: 0.32, ease: "power2.out" }, `strike+=${0.25 + off}`);
            });

            tl.add(() => {
                sparks.forEach((p, i) => {
                    const ang = (Math.PI * 2 * i) / sparks.length + (Math.random() - 0.5) * 0.5;
                    const spd = 4 + Math.random() * (cinematic ? 10 : 6);
                    p.vx = Math.cos(ang) * spd;
                    p.vy = Math.sin(ang) * spd - 3;
                    p.vr = (Math.random() - 0.5) * 0.4;
                    p.g.visible = true;
                    p.g.x = cx; p.g.y = cy; p.g.alpha = 1;
                });
            }, "strike+=0.12");

            const partProxy = { t: 0 };
            tl.to(partProxy, {
                t: 1, duration: 0.65, ease: "power2.out",
                onUpdate: () => {
                    sparks.forEach((p) => {
                        p.g.x += p.vx; p.g.y += p.vy; p.vy += 0.2;
                        p.g.rotation += p.vr;
                        p.g.alpha = Math.max(0, 1 - partProxy.t * 1.15);
                    });
                },
            }, "strike+=0.12");

            tl.to(skyFlash, { alpha: 0, duration: 0.4, ease: "power2.out" }, "strike+=0.25");
            tl.to(cloud, { alpha: 0, duration: 0.35, ease: "power2.out" }, "strike+=0.2");

            tl.to(shakeWrap, {
                x: unit * 0.12, duration: 0.03, yoyo: true, repeat: cinematic ? 6 : 4, ease: "power1.inOut",
            }, "strike+=0.1");

            tl.add(() => {
                shakeWrap.x = 0; shakeWrap.y = 0;
                try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            });

            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 2.2 : 1.4);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * INCENDIAR — labareda que acerta o Campeão em cheio e o deixa
     * pegando fogo. A mesma chama, em versão curta, reaparece a cada
     * −1 Poder do status Em Chamas.
     * ============================================================ */

    /** Silhueta de labareda (base em 0,0, ponta em -h). */
    function flameSilhouette(w, h, wobble) {
        const pts = [];
        const N = 16;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const bulge = Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.3);
            pts.push(w * bulge * (1 + wobble * Math.sin(t * 6.1)), -h * t);
        }
        for (let i = N; i >= 0; i--) {
            const t = i / N;
            const bulge = Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.3);
            pts.push(-w * bulge * (1 - wobble * Math.sin(t * 5.3)), -h * t);
        }
        return pts;
    }

    function makeFlameTongue(PIXI, w, h) {
        const g = new PIXI.Graphics();
        const layer = (col, alpha, sw, sh, wob) => {
            g.beginFill(col, alpha);
            g.drawPolygon(flameSilhouette(sw, sh, wob));
            g.endFill();
        };
        layer(0xff2a04, 0.55, w, h, 0.16);
        layer(0xff6a10, 0.72, w * 0.76, h * 0.84, 0.1);
        layer(0xffb52a, 0.8, w * 0.48, h * 0.58, 0.08);
        layer(0xfff0b0, 0.85, w * 0.22, h * 0.3, 0.05);
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Fogo cobrindo a carta: línguas de chama + brasa quente por baixo. */
    function buildCardBurn(PIXI, cardW, cardH, count) {
        const c = new PIXI.Container();
        const glow = dfSprite(PIXI, dfGlowTex(PIXI, 0xff5a10, 0x2a0600), true);
        glow.scale.set((cardW * 1.75) / 256);
        glow.alpha = 0;
        c.addChild(glow);
        const tongues = [];
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const w = cardW * (0.15 + Math.random() * 0.1);
            const h = cardH * (0.48 + Math.random() * 0.42);
            const g = makeFlameTongue(PIXI, w, h);
            g.x = (t - 0.5) * cardW * 0.78 + (Math.random() - 0.5) * cardW * 0.08;
            g.y = cardH * (0.24 + Math.random() * 0.14);
            g.alpha = 0;
            c.addChild(g);
            tongues.push({
                g,
                baseX: g.x,
                phase: Math.random() * Math.PI * 2,
                sway: cardW * (0.02 + Math.random() * 0.03),
                rate: 2.6 + Math.random() * 1.8,
            });
        }
        c.__tongues = tongues;
        c.__glow = glow;
        return c;
    }

    /** Anima o fogo da carta a partir de `state.amp` (0..1). */
    function tickCardBurn(burn, phase, amp) {
        const a = Math.max(0, amp);
        burn.__glow.alpha = 0.55 * a;
        burn.__tongues.forEach((tg, i) => {
            const ph = phase * tg.rate + tg.phase + i * 0.5;
            const flick = 0.76 + Math.sin(ph) * 0.24;
            tg.g.alpha = a * (0.72 + Math.sin(ph * 1.6) * 0.28);
            tg.g.scale.set(a * (0.9 + Math.sin(ph * 1.3) * 0.12), a * flick);
            tg.g.x = tg.baseX + Math.sin(ph * 0.7) * tg.sway;
        });
    }

    /**
     * Labareda do Incendiar. `short: true` → só o fogo curto sobre a
     * carta (tick de −1 Poder), sem o projétil de chama.
     */
    async function playIncendiarFlameScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;

        const cx0 = opts.cx ?? opts.x;
        const cy0 = opts.cy ?? opts.y;
        if (cx0 == null || cy0 == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const short = !!opts.short;
        const frame = pixiSceneFrame(a, true);
        try {
            const m = frame.map(cx0, cy0);
            const cx = m.x;
            const cy = m.y;
            const unit = cardUnit(1);
            let cardW = unit * 0.95;
            let cardH = unit * 1.32;
            if (Number(opts.w) > 4 && Number(opts.h) > 4) {
                const p0 = frame.map(cx0 - opts.w / 2, cy0 - opts.h / 2);
                const p1 = frame.map(cx0 + opts.w / 2, cy0 + opts.h / 2);
                cardW = Math.abs(p1.x - p0.x) || cardW;
                cardH = Math.abs(p1.y - p0.y) || cardH;
            }
            const theme = themeFromRecipe({ hue: 18 });

            const shakeWrap = new PIXI.Container();
            a.stage.addChild(shakeWrap);
            const root = new PIXI.Container();
            shakeWrap.addChild(root);

            const burn = buildCardBurn(PIXI, cardW, cardH, n(short ? 5 : 7));
            burn.x = cx;
            burn.y = cy;
            root.addChild(burn);

            const flash = new PIXI.Graphics();
            flash.beginFill(0xfff0c0, 0.95);
            flash.drawCircle(0, 0, cardW * 0.42);
            flash.endFill();
            flash.x = cx; flash.y = cy;
            flash.alpha = 0; flash.scale.set(0.2);
            if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(flash);

            const ring = dfSprite(PIXI, dfRingTex(PIXI, 0xff8a30), true);
            ring.x = cx; ring.y = cy;
            ring.alpha = 0;
            ring.scale.set((cardW * 0.5) / 256);
            root.addChild(ring);

            // Projétil: labareda alongada indo de frente contra a carta.
            let jet = null;
            let jetFromX = cx;
            let jetFromY = cy - cardH * 1.9;
            if (!short) {
                if (Number.isFinite(opts.fromX) && Number.isFinite(opts.fromY)) {
                    const fm = frame.map(opts.fromX, opts.fromY);
                    jetFromX = fm.x; jetFromY = fm.y;
                }
                jet = makeFlameTongue(PIXI, cardW * 0.42, cardH * 1.25);
                jet.x = jetFromX;
                jet.y = jetFromY;
                jet.alpha = 0;
                jet.scale.set(0.45);
                jet.rotation = Math.atan2(cy - jetFromY, cx - jetFromX) - Math.PI / 2;
                root.addChild(jet);
            }

            const emberN = n(short ? 8 : 18);
            const embers = [];
            for (let i = 0; i < emberN; i++) {
                const sh = makeFireShard(PIXI, theme, unit);
                sh.visible = false;
                root.addChild(sh);
                embers.push({ g: sh, vx: 0, vy: 0, vr: 0 });
            }

            const tl = await gsapBridge.createTimeline();
            if (!tl) {
                try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
                return false;
            }

            const travel = short ? 0 : (cinematic ? 0.32 : 0.24);
            const hold = short ? (cinematic ? 0.34 : 0.24) : (cinematic ? 0.62 : 0.44);
            const state = { amp: 0 };
            const impactAt = travel;

            if (jet) {
                tl.to(jet, { alpha: 1, duration: 0.08, ease: "sine.out" }, 0);
                tl.to(jet, {
                    x: cx, y: cy + cardH * 0.18,
                    duration: travel, ease: "power2.in",
                }, 0);
                tl.to(jet.scale, { x: 1.15, y: 1.35, duration: travel, ease: "power2.in" }, 0);
                tl.add(() => { jet.visible = false; }, impactAt);
            }

            tl.to(flash, { alpha: 1, duration: 0.05, ease: "power2.out" }, impactAt);
            tl.to(flash.scale, { x: short ? 1.4 : 2.3, y: short ? 1.4 : 2.3, duration: 0.3, ease: "power3.out" }, impactAt);
            tl.to(flash, { alpha: 0, duration: 0.3, ease: "power2.in" }, impactAt + 0.07);
            tl.to(ring, { alpha: short ? 0.5 : 0.85, duration: 0.06 }, impactAt);
            tl.to(ring.scale, {
                x: (cardW * (short ? 1.5 : 2.6)) / 256,
                y: (cardW * (short ? 1.5 : 2.6)) / 256,
                duration: 0.42, ease: "power2.out",
            }, impactAt);
            tl.to(ring, { alpha: 0, duration: 0.32, ease: "power2.in" }, impactAt + 0.14);

            tl.to(state, { amp: 1, duration: 0.16, ease: "back.out(1.5)" }, impactAt);
            tl.to(state, { amp: 0, duration: 0.34, ease: "power2.in" }, impactAt + 0.16 + hold);

            const burnDur = 0.16 + hold + 0.34;
            const flickProxy = { t: 0 };
            tl.to(flickProxy, {
                t: 1, duration: burnDur, ease: "none",
                onUpdate: () => tickCardBurn(burn, flickProxy.t * burnDur * Math.PI * 2, state.amp),
            }, impactAt);

            tl.add(() => {
                embers.forEach((p) => {
                    const ang = -Math.PI / 2 + (Math.random() - 0.5) * (short ? 1.1 : 2.2);
                    const spd = (short ? 2 : 3.4) + Math.random() * (short ? 2.4 : 4.6);
                    p.vx = Math.cos(ang) * spd;
                    p.vy = Math.sin(ang) * spd;
                    p.vr = (Math.random() - 0.5) * 0.35;
                    p.g.visible = true;
                    p.g.x = cx + (Math.random() - 0.5) * cardW * 0.8;
                    p.g.y = cy + cardH * 0.2 - Math.random() * cardH * 0.2;
                    p.g.alpha = 1;
                });
            }, impactAt);
            const emberProxy = { t: 0 };
            tl.to(emberProxy, {
                t: 1, duration: burnDur * 0.9, ease: "none",
                onUpdate: () => {
                    embers.forEach((p) => {
                        p.g.x += p.vx;
                        p.g.y += p.vy;
                        p.vy -= 0.11;
                        p.vx *= 0.985;
                        p.g.rotation += p.vr;
                        p.g.alpha = Math.max(0, 1 - emberProxy.t * 1.12);
                    });
                },
            }, impactAt);

            if (!short) {
                tl.to(shakeWrap, {
                    x: unit * 0.08, duration: 0.035,
                    yoyo: true, repeat: cinematic ? 5 : 3, ease: "power1.inOut",
                }, impactAt);
            }

            tl.add(() => {
                shakeWrap.x = 0; shakeWrap.y = 0;
                try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            });

            await awaitPixiTimeline(tl, shakeWrap, impactAt + burnDur + 0.5);
            return true;
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
    }

    /* ============================================================
     * TINA PUNKER — INVESTIDA: machado laranja GIGANTE cai sobre o
     * campeão aliado, o chão racha e uma aura cerca o campeão por ~1s.
     * Builders cartoon (contorno escuro grosso + laranja saturado).
     * ============================================================ */

    /** Machado laranja gigante (cabo + lâmina grande). Origem (0,0) = fio que crava no chão. */
    function makeGiantAxe(PIXI, size) {
        const c = new PIXI.Container();
        const outline = Math.max(3, size * 0.03);

        // Cabo de madeira (atrás da lâmina).
        const handle = new PIXI.Graphics();
        const hw = size * 0.15;
        handle.lineStyle(outline * 0.9, 0x2a1606, 1);
        handle.beginFill(0x7a4a22, 1);
        handle.drawRoundedRect(-hw / 2, -size * 2.7, hw, size * 2.55, hw * 0.5);
        handle.endFill();
        // Faixa clara no cabo.
        handle.beginFill(0x9a6a36, 0.9);
        handle.drawRoundedRect(-hw * 0.16, -size * 2.6, hw * 0.22, size * 2.3, hw * 0.2);
        handle.endFill();
        c.addChild(handle);

        // Pomo no topo do cabo.
        const pommel = new PIXI.Graphics();
        pommel.lineStyle(outline * 0.8, 0x2a1606, 1);
        pommel.beginFill(0x52606b, 1);
        pommel.drawCircle(0, -size * 2.72, hw * 0.7);
        pommel.endFill();
        c.addChild(pommel);

        // Lâmina laranja grande (crescente). Fio voltado para baixo (y positivo).
        const bw = size * 1.18;
        const blade = new PIXI.Graphics();
        blade.lineStyle(outline, 0x3a1c08, 1);
        blade.beginFill(0xff7a18, 1);
        blade.moveTo(-bw * 0.14, -size * 0.66);
        blade.lineTo(-bw * 0.52, -size * 0.2);
        blade.quadraticCurveTo(-bw * 0.66, size * 0.02, -bw * 0.36, size * 0.06);
        blade.quadraticCurveTo(0, size * 0.2, bw * 0.36, size * 0.06);
        blade.quadraticCurveTo(bw * 0.66, size * 0.02, bw * 0.52, -size * 0.2);
        blade.lineTo(bw * 0.14, -size * 0.66);
        blade.closePath();
        blade.endFill();
        // Brilho claro do fio.
        blade.beginFill(0xffc066, 0.92);
        blade.moveTo(-bw * 0.3, -size * 0.04);
        blade.quadraticCurveTo(0, size * 0.12, bw * 0.3, -size * 0.04);
        blade.quadraticCurveTo(0, size * 0.02, -bw * 0.3, -size * 0.04);
        blade.endFill();
        c.addChild(blade);

        // Colar metálico onde a lâmina encontra o cabo.
        const collar = new PIXI.Graphics();
        collar.lineStyle(outline * 0.8, 0x2a1606, 1);
        collar.beginFill(0x6b7780, 1);
        collar.drawRoundedRect(-hw * 0.95, -size * 0.78, hw * 1.9, size * 0.3, hw * 0.3);
        collar.endFill();
        c.addChild(collar);

        return c;
    }

    /** Rachaduras escuras com núcleo laranja brilhante, irradiando do impacto. */
    function makeGroundCrackGfx(PIXI, unit, theme) {
        const c = new PIXI.Container();
        const dark = new PIXI.Graphics();
        const glow = new PIXI.Graphics();
        const arms = 8;
        for (let i = 0; i < arms; i++) {
            const baseAng = (i / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const segs = 3 + Math.floor(Math.random() * 2);
            const len = unit * (1.5 + Math.random() * 1.1);
            let x = 0;
            let y = 0;
            dark.lineStyle(Math.max(2.5, unit * 0.06), 0x140a04, 0.94);
            glow.lineStyle(Math.max(1.2, unit * 0.025), theme.core, 0.85);
            dark.moveTo(0, 0);
            glow.moveTo(0, 0);
            for (let s = 0; s < segs; s++) {
                const stepAng = baseAng + (Math.random() - 0.5) * 0.55;
                const sl = len / segs;
                x += Math.cos(stepAng) * sl;
                y += Math.sin(stepAng) * sl;
                dark.lineTo(x, y);
                glow.lineTo(x, y);
            }
        }
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        c.addChild(dark);
        c.addChild(glow);
        return c;
    }

    /** Aura vertical que abraça a carta do campeão. */
    function makeAuraRing(PIXI, theme, r) {
        const c = new PIXI.Container();
        const glow = new PIXI.Graphics();
        glow.beginFill(theme.spark, 0.14);
        glow.drawEllipse(0, 0, r * 0.95, r * 1.28);
        glow.endFill();
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        c.addChild(glow);
        const ring = new PIXI.Graphics();
        ring.lineStyle(Math.max(3, r * 0.07), theme.ring, 0.95);
        ring.drawEllipse(0, 0, r * 0.78, r * 1.1);
        if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
        c.addChild(ring);
        const ring2 = new PIXI.Graphics();
        ring2.lineStyle(Math.max(2, r * 0.04), theme.core, 0.82);
        ring2.drawEllipse(0, 0, r * 0.58, r * 0.86);
        if (PIXI.BLEND_MODES) ring2.blendMode = PIXI.BLEND_MODES.ADD;
        c.addChild(ring2);
        return c;
    }

    /** Pistola colorida (Tina Punker — Investida). Detalhes metálicos + acentos arco-íris. */
    function makeColorfulPistol(PIXI, unit) {
        const root = new PIXI.Container();
        const ow = Math.max(1.8, unit * 0.045);

        const grip = new PIXI.Graphics();
        grip.lineStyle(ow, 0x2a0838, 1);
        grip.beginFill(0xff3d9a, 1);
        grip.drawRoundedRect(-unit * 0.13, unit * 0.02, unit * 0.26, unit * 0.52, unit * 0.07);
        grip.endFill();
        grip.beginFill(0xff7ec8, 0.65);
        grip.drawRoundedRect(-unit * 0.09, unit * 0.06, unit * 0.1, unit * 0.38, unit * 0.04);
        grip.endFill();
        root.addChild(grip);

        const frameG = new PIXI.Graphics();
        frameG.lineStyle(ow, 0x1a2848, 1);
        frameG.beginFill(0x48d4ff, 1);
        frameG.drawRoundedRect(-unit * 0.11, -unit * 0.08, unit * 0.38, unit * 0.18, unit * 0.05);
        frameG.endFill();
        frameG.beginFill(0xffe566, 1);
        frameG.drawRect(unit * 0.12, -unit * 0.04, unit * 0.08, unit * 0.06);
        frameG.endFill();
        root.addChild(frameG);

        const barrel = new PIXI.Graphics();
        barrel.lineStyle(ow, 0x1a1020, 1);
        barrel.beginFill(0x3a3a48, 1);
        barrel.drawRoundedRect(unit * 0.18, -unit * 0.055, unit * 0.42, unit * 0.11, unit * 0.03);
        barrel.endFill();
        barrel.beginFill(0x9aa0b8, 0.55);
        barrel.drawRect(unit * 0.22, -unit * 0.04, unit * 0.28, unit * 0.03);
        barrel.endFill();
        barrel.beginFill(0xff6b6b, 1);
        barrel.drawRect(unit * 0.52, -unit * 0.05, unit * 0.06, unit * 0.1);
        barrel.endFill();
        root.addChild(barrel);

        const guard = new PIXI.Graphics();
        guard.lineStyle(ow, 0x5a3a08, 1);
        guard.beginFill(0xffd76b, 1);
        guard.drawEllipse(-unit * 0.02, unit * 0.02, unit * 0.11, unit * 0.14);
        guard.endFill();
        root.addChild(guard);

        const gem = new PIXI.Graphics();
        gem.beginFill(0x66ffcc, 1);
        gem.drawCircle(unit * 0.04, -unit * 0.01, unit * 0.045);
        gem.endFill();
        gem.beginFill(0xffffff, 0.7);
        gem.drawCircle(unit * 0.03, -unit * 0.025, unit * 0.015);
        gem.endFill();
        if (PIXI.BLEND_MODES) gem.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(gem);

        root.pivot.set(unit * 0.12, unit * 0.24);
        return root;
    }

    /** Pistola cinematográfica (Tina Punker) — só preenchimentos suaves, sem contornos. */
    function makeCinematicPistol(PIXI, unit) {
        const root = new PIXI.Container();
        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.22);
        shadow.drawEllipse(unit * 0.14, unit * 0.3, unit * 0.34, unit * 0.11);
        shadow.endFill();
        root.addChild(shadow);

        const grip = new PIXI.Graphics();
        grip.beginFill(0x6a1048, 0.45);
        grip.drawRoundedRect(-unit * 0.14, unit * 0.04, unit * 0.28, unit * 0.52, unit * 0.08);
        grip.beginFill(0xff2d8a, 0.94);
        grip.drawRoundedRect(-unit * 0.12, unit * 0.06, unit * 0.24, unit * 0.48, unit * 0.07);
        grip.beginFill(0xff9cd8, 0.38);
        grip.drawRoundedRect(-unit * 0.08, unit * 0.1, unit * 0.1, unit * 0.36, unit * 0.05);
        grip.endFill();
        root.addChild(grip);

        const body = new PIXI.Graphics();
        body.beginFill(0x1a5088, 0.55);
        body.drawRoundedRect(-unit * 0.12, -unit * 0.1, unit * 0.42, unit * 0.22, unit * 0.06);
        body.beginFill(0x3cc8f0, 0.92);
        body.drawRoundedRect(-unit * 0.1, -unit * 0.08, unit * 0.38, unit * 0.18, unit * 0.05);
        body.beginFill(0xb8f4ff, 0.42);
        body.drawEllipse(unit * 0.06, -unit * 0.02, unit * 0.14, unit * 0.055);
        body.endFill();
        root.addChild(body);

        const barrel = new PIXI.Graphics();
        barrel.beginFill(0x12121c, 0.92);
        barrel.drawRoundedRect(unit * 0.2, -unit * 0.055, unit * 0.46, unit * 0.11, unit * 0.025);
        barrel.beginFill(0x8a90a8, 0.4);
        barrel.drawRoundedRect(unit * 0.24, -unit * 0.038, unit * 0.34, unit * 0.045, unit * 0.015);
        barrel.beginFill(0xff3a3a, 0.88);
        barrel.drawEllipse(unit * 0.6, 0, unit * 0.045, unit * 0.065);
        barrel.endFill();
        root.addChild(barrel);

        const guardBloom = makeSoftOrb(PIXI, 0xffd050, unit * 0.09, 0.55);
        guardBloom.x = unit * 0.02; guardBloom.y = unit * 0.05;
        root.addChild(guardBloom);
        const gem = makeSoftOrb(PIXI, 0x66ffcc, unit * 0.055, 0.92);
        gem.x = unit * 0.05; gem.y = -unit * 0.02;
        root.addChild(gem);

        root.pivot.set(unit * 0.12, unit * 0.24);
        return root;
    }

    const DF_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

    /** Texto emoji Pixi — presas, símbolos e ícones de impacto. */
    function makeEmojiText(PIXI, glyph, fontSize, opts = {}) {
        const t = new PIXI.Text(glyph, {
            fontFamily: DF_EMOJI_FONT,
            fontSize: Math.max(12, fontSize),
            fill: opts.fill ?? 0xffffff,
            align: "center",
        });
        t.anchor.set(0.5);
        if (opts.rotation) t.rotation = opts.rotation;
        if (opts.scaleY != null) t.scale.y = opts.scaleY;
        return t;
    }

    /** Presa individual — esmalte com brilho (sem contorno cartoon). */
    function makePredatorFang(PIXI, w, h, upper) {
        const c = new PIXI.Container();
        const sgn = upper ? 1 : -1;
        const tipY = sgn * h;
        const g = new PIXI.Graphics();
        g.beginFill(0x6a1020, 0.38);
        g.drawPolygon([-w * 1.15, 0, w * 1.15, 0, w * 0.4, tipY * 0.58, 0, tipY * 1.02, -w * 0.4, tipY * 0.58]);
        g.endFill();
        g.beginFill(0xf0e6dc, 0.96);
        g.drawPolygon([-w, 0, w, 0, w * 0.24, tipY * 0.52, 0, tipY, -w * 0.24, tipY * 0.52]);
        g.endFill();
        g.beginFill(0xffffff, 0.42);
        g.drawPolygon([-w * 0.12, tipY * 0.12, -w * 0.04, tipY * 0.72, w * 0.02, tipY * 0.38]);
        g.endFill();
        c.addChild(g);
        return c;
    }

    /** Mandíbula de predador — presas volumétricas + glow (Devorar, sem cartoon). */
    function makeDevourJaw(PIXI, unit, upper) {
        const jaw = new PIXI.Container();
        const sgn = upper ? 1 : -1;
        const span = unit * 2.72;

        const backGlow = dfSprite(PIXI, dfGlowTex(PIXI, 0x6a1830, 0x120008), true);
        backGlow.scale.set(unit * 0.0055, unit * 0.0032);
        backGlow.y = sgn * unit * 0.14;
        backGlow.alpha = 0.72;
        jaw.addChild(backGlow);

        const gumShade = new PIXI.Graphics();
        gumShade.beginFill(upper ? 0x4a1424 : 0x360e1a, 0.62);
        gumShade.drawEllipse(0, sgn * unit * 0.2, span * 0.43, unit * 0.26);
        gumShade.endFill();
        gumShade.beginFill(upper ? 0x7a2840 : 0x5a1c30, 0.28);
        gumShade.drawEllipse(0, sgn * unit * 0.12, span * 0.32, unit * 0.14);
        gumShade.endFill();
        jaw.addChild(gumShade);

        const fangRow = new PIXI.Container();
        const fangN = 11;
        for (let i = 0; i < fangN; i++) {
            const t = i / (fangN - 1);
            const fx = -span * 0.44 + t * span * 0.88;
            const centerBoost = 1 - Math.abs(t - 0.5) * 0.55;
            const fh = unit * (0.36 + (i % 2 === 0 ? 0.1 : 0) + centerBoost * 0.12);
            const fw = unit * (0.065 + (i % 3 === 1 ? 0.018 : 0));
            const fang = makePredatorFang(PIXI, fw, fh, upper);
            fang.x = fx;
            fang.y = sgn * unit * 0.02;
            fangRow.addChild(fang);
        }
        jaw.addChild(fangRow);

        const edgeSheen = dfSprite(PIXI, dfGlowTex(PIXI, 0xff8090, 0x2a0810), true);
        edgeSheen.scale.set(span * 0.0022, unit * 0.0014);
        edgeSheen.y = sgn * unit * 0.06;
        edgeSheen.alpha = 0.38;
        if (PIXI.BLEND_MODES) edgeSheen.blendMode = PIXI.BLEND_MODES.ADD;
        jaw.addChild(edgeSheen);

        return jaw;
    }

    /**
     * INVESTIDA — Tina Punker: pistola cinematográfica arremessada → brilho → status.
     * opts: { cx, cy, cinematic, onImpact, onShine }
     */
    async function playPistolThrowScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const frame = pixiSceneFrame(a, cinematic);
        const _m = frame.map(cx, cy);
        cx = _m.x;
        cy = _m.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe({ hue: 42 });
        const unit = cardUnit(1);
        const scene = scenePixels();

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        const wash = new PIXI.Graphics();
        wash.beginFill(0x1a1008, 0.32);
        wash.drawRect(0, 0, scene.w, scene.h);
        wash.endFill();
        wash.alpha = 0;
        container.addChild(wash);

        const targetGlow = new PIXI.Container();
        targetGlow.x = cx; targetGlow.y = cy;
        [1.5, 1.1, 0.75].forEach((sc, i) => {
            const b = makeSoftBloom(PIXI, theme, unit, sc);
            b.alpha = 0.35 + i * 0.15;
            targetGlow.addChild(b);
        });
        targetGlow.alpha = 0;
        targetGlow.scale.set(1.4);
        container.addChild(targetGlow);

        const pistolUnit = unit * 1.4;
        const pistol = makeCinematicPistol(PIXI, pistolUnit);
        const fromRight = cx < scene.w * 0.5;
        const startX = cx + (fromRight ? scene.w * 0.34 : -scene.w * 0.34);
        const startY = cy + scene.h * 0.36;
        pistol.x = startX;
        pistol.y = startY;
        pistol.rotation = fromRight ? -1.35 : 1.35;
        pistol.alpha = 0;
        pistol.scale.set(0.7);
        container.addChild(pistol);

        const trailOrbs = [];
        const trailN = n(cinematic ? 12 : 7);
        for (let i = 0; i < trailN; i++) {
            const o = makeSoftOrb(PIXI, i % 2 ? 0xffe566 : 0xff8cc8, unit * 0.07, 0.65);
            o.visible = false;
            container.addChild(o);
            trailOrbs.push(o);
        }

        const shineRoot = new PIXI.Container();
        shineRoot.x = cx; shineRoot.y = cy;
        container.addChild(shineRoot);

        const shineLayers = [1.9, 1.35, 0.9].map((sc) => {
            const b = makeSoftBloom(PIXI, theme, unit, sc);
            b.alpha = 0;
            shineRoot.addChild(b);
            return b;
        });

        const sparkles = [];
        const sparkN = n(cinematic ? 24 : 14);
        for (let i = 0; i < sparkN; i++) {
            const col = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? 0xffe566 : 0xff8cc8);
            const g = makeSoftOrb(PIXI, col, unit * (0.04 + Math.random() * 0.06), 0.88);
            g.visible = false;
            shineRoot.addChild(g);
            sparkles.push({ g, ang: Math.random() * Math.PI * 2, dist: unit * (0.35 + Math.random() * 1.1) });
        }

        const hitBloom = makeSoftOrb(PIXI, 0xffffff, unit * 0.32, 0.95);
        hitBloom.alpha = 0; hitBloom.scale.set(0.15);
        shineRoot.addChild(hitBloom);

        const throwProxy = { t: 0 };
        const shineProxy = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            frame.end();
            return false;
        }

        tl.to(wash, { alpha: 1, duration: 0.24, ease: "sine.out" }, 0);
        tl.to(targetGlow, { alpha: 1, duration: 0.22, ease: "sine.out" }, 0);
        tl.to(targetGlow.scale, { x: 1, y: 1, duration: 0.32, ease: "power2.out" }, 0);
        tl.to(pistol, { alpha: 1, duration: 0.14 }, 0.08);
        tl.to(pistol.scale, { x: 1, y: 1, duration: 0.24, ease: "back.out(2)" }, 0.08);

        const throwAt = 0.26;
        tl.addLabel("throw", throwAt);
        tl.to(throwProxy, {
            t: 1,
            duration: cinematic ? 0.52 : 0.38,
            ease: "power2.inOut",
            onUpdate: () => {
                const t = throwProxy.t;
                const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const arc = Math.sin(t * Math.PI) * unit * 2.1;
                pistol.x = startX + (cx - startX) * easeT;
                pistol.y = startY + (cy - startY) * easeT - arc;
                pistol.rotation = (fromRight ? -1.35 : 1.35) + t * Math.PI * 2.4;
                trailOrbs.forEach((o, i) => {
                    const lag = Math.max(0, t - i * 0.045);
                    if (lag <= 0) { o.visible = false; return; }
                    o.visible = true;
                    const lt = lag / Math.max(0.001, t);
                    o.x = startX + (cx - startX) * lt;
                    o.y = startY + (cy - startY) * lt - Math.sin(lt * Math.PI) * unit * 2.1;
                    o.alpha = 0.7 * (1 - i / trailN);
                });
            },
        }, "throw");

        const hitAt = throwAt + (cinematic ? 0.52 : 0.38);
        tl.addLabel("hit", hitAt);
        tl.add(() => {
            pistol.visible = false;
            trailOrbs.forEach((o) => { o.visible = false; });
            if (typeof opts.onImpact === "function") {
                try { opts.onImpact(); } catch (e) { /* */ }
            }
        }, "hit");
        tl.to(targetGlow, { alpha: 0, duration: 0.14 }, "hit");
        tl.to(hitBloom, { alpha: 1, duration: 0.05 }, "hit");
        tl.to(hitBloom.scale, { x: 3.2, y: 3.2, duration: 0.18, ease: "power2.out" }, "hit");
        tl.to(hitBloom, { alpha: 0, duration: 0.22 }, "hit+=0.06");

        const shineAt = hitAt + 0.08;
        tl.addLabel("shine", shineAt);
        tl.add(() => {
            if (typeof opts.onShine === "function") { try { opts.onShine(); } catch (e) { /* */ } }
            sparkles.forEach((p) => {
                p.g.visible = true;
                p.g.x = Math.cos(p.ang) * p.dist * 0.15;
                p.g.y = Math.sin(p.ang) * p.dist * 0.15;
                p.g.alpha = 1;
            });
        }, "shine");
        shineLayers.forEach((b, i) => {
            tl.to(b, { alpha: 0.85 - i * 0.12, duration: 0.16 }, `shine+=${i * 0.04}`);
            tl.to(b.scale, { x: 1.2 + i * 0.08, y: 1.2 + i * 0.08, duration: 0.45, ease: "power2.out" }, `shine+=${i * 0.04}`);
        });
        tl.to(shineProxy, {
            t: 1,
            duration: cinematic ? 0.95 : 0.72,
            ease: "none",
            onUpdate: () => {
                const t = shineProxy.t;
                const pulse = 1 + Math.sin(t * Math.PI * 4) * 0.07;
                shineLayers.forEach((b, i) => {
                    b.scale.set((1.2 + i * 0.08) * pulse);
                    b.alpha = (0.85 - i * 0.12) * (1 - t * 0.55);
                });
                sparkles.forEach((p) => {
                    const lp = Math.min(1, t * 1.35);
                    p.g.x = Math.cos(p.ang) * p.dist * lp;
                    p.g.y = Math.sin(p.ang) * p.dist * lp;
                    p.g.alpha = Math.max(0, 1 - t * 1.05);
                    p.g.scale.set(0.8 + lp * 0.5);
                });
            },
        }, "shine");

        const endAt = shineAt + (cinematic ? 1.0 : 0.78);
        shineLayers.forEach((b) => {
            tl.to(b, { alpha: 0, duration: 0.32, ease: "power2.out" }, endAt);
        });
        tl.to(wash, { alpha: 0, duration: 0.34, ease: "power2.out" }, endAt);

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });

        const maxSec = cinematic ? 2.6 : 1.95;
        try {
            await awaitPixiTimeline(tl, shakeWrap, maxSec);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /** @deprecated alias — Tina Punker usa playPistolThrowScene. */    /** @deprecated alias — Tina Punker usa playPistolThrowScene. */
    async function playAxeDropScene(opts = {}) {
        return playPistolThrowScene(opts);
    }

    /* ============================================================
     * SEM HONRA — um portal sombrio se abre e o campeão foge por ele.
     * Pixi+GSAP, tela cheia. O chamador (df-game-view) anima a carta
     * (clone DOM) entrando no portal via opts.onOpen (aguardado).
     * ============================================================ */
    async function playPortalEscapeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const sceneCoords = !!opts.sceneCoords;
        let frame = null;
        if (sceneCoords) {
            beginPixiTargetScene(a);
        } else {
            frame = pixiSceneFrame(a, true);
            const m = frame.map(cx, cy);
            cx = m.x; cy = m.y;
        }

        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const tweens = [];
        const T = (target, vars) => { const tw = gsap.to(target, vars); tweens.push(tw); return tw; };

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const portal = new PIXI.Container();
            portal.x = cx; portal.y = cy;
            portal.alpha = 0;
            portal.scale.set(0.06);
            root.addChild(portal);

            const R = unit * 1.3;
            const voidMark = makeEmojiText(PIXI, "🕳️", unit * 0.72);
            voidMark.alpha = 0;
            portal.addChild(voidMark);

            const glow = dfSprite(PIXI, dfGlowTex(PIXI, 0x7b3cff, 0x1a0538), true);
            glow.scale.set(R * 0.012, R * 0.014);
            portal.addChild(glow);

            const core = new PIXI.Graphics();
            core.beginFill(0x06030f, 0.92);
            core.drawEllipse(0, 0, R * 0.82, R * 1.06);
            core.endFill();
            core.beginFill(0x3a1170, 0.48);
            core.drawEllipse(0, 0, R * 0.52, R * 0.72);
            core.endFill();
            portal.addChild(core);

            const swirlLayers = [];
            for (let i = 0; i < 4; i++) {
                const sl = dfSprite(PIXI, dfGlowTex(PIXI, i % 2 ? 0x55e6ff : 0xc08cff, 0x0a0218), true);
                sl.scale.set(0.28 + i * 0.14);
                sl.alpha = 0.42 - i * 0.08;
                portal.addChild(sl);
                swirlLayers.push(sl);
            }

            const rimGlow = dfSprite(PIXI, dfSparkTex(PIXI, 0xb98cff), true);
            rimGlow.scale.set(R * 0.0048);
            rimGlow.alpha = 0.65;
            portal.addChild(rimGlow);

            const sparks = [];
            const sparkCount = cinematic ? 24 : 12;
            for (let i = 0; i < sparkCount; i++) {
                const g = makeEmber(PIXI, { spark: 0xc8a0ff, core: 0x7b3cff }, unit, i % 4 === 0);
                g.visible = false;
                portal.addChild(g);
                sparks.push(g);
            }
            sparks.forEach((g) => {
                const ang = Math.random() * Math.PI * 2;
                const d = R * (1.25 + Math.random() * 0.75);
                g.x = Math.cos(ang) * d;
                g.y = Math.sin(ang) * d * 1.2;
                g.visible = true;
                g.alpha = 0.95;
            });

            T(portal, { alpha: 1, duration: 0.16, ease: "sine.out" });
            T(portal.scale, { x: 1, y: 1, duration: 0.38, ease: "back.out(1.7)" });
            T(voidMark, { alpha: 0.88, duration: 0.22, ease: "sine.out" }, 0.08);
            swirlLayers.forEach((sl, si) => {
                T(sl, { rotation: Math.PI * (si % 2 ? -3.2 : 3.2), duration: 2.4, ease: "none" });
            });
            T(rimGlow, { rotation: "-=4.5", duration: 2.4, ease: "none" });
            const sp = { t: 0 };
            T(sp, {
                t: 1, duration: 2.4, ease: "none",
                onUpdate: () => {
                    sparks.forEach((g) => {
                        g.x *= 0.942; g.y *= 0.942;
                        g.alpha *= 0.991;
                        g.rotation += 0.28;
                    });
                },
            });

            await sleep(380);
            if (typeof opts.onOpen === "function") {
                try { await opts.onOpen(); } catch (e) { /* */ }
            }
            await sleep(150);

            await new Promise((res) => {
                T(rimGlow, { rotation: "-=2", duration: 0.28, ease: "power2.in" });
                T(voidMark, { alpha: 0, duration: 0.28, ease: "power2.in" });
                T(portal.scale, { x: 0.02, y: 0.02, duration: 0.28, ease: "back.in(1.5)" });
                T(portal, { alpha: 0, duration: 0.28, ease: "power2.in", onComplete: res });
            });
        } catch (e) {
            /* */
        } finally {
            tweens.forEach((tw) => { try { tw.kill(); } catch (e) { /* */ } });
            try { root.destroy({ children: true }); } catch (e) { /* */ }
            if (frame) frame.end();
            else if (sceneCoords) endPixiTargetScene(a);
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * BASTION — Proteção: pilar volumétrico + domo de vidro sagrado.
     * Cinemático Hearthstone (Pixi + GSAP).
     * ============================================================ */
    async function playShieldDomeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const scene = scenePixels();
        const theme = { core: 0xffe27a, spark: 0xffd24a, flash: 0xfff4c2, ring: 0xffe9a0 };

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const skyWash = new PIXI.Graphics();
            skyWash.beginFill(0x1a1408, 0.35);
            skyWash.drawRect(0, 0, scene.w, scene.h);
            skyWash.endFill();
            skyWash.alpha = 0;
            root.addChild(skyWash);

            const pillarWrap = new PIXI.Container();
            pillarWrap.x = cx; pillarWrap.y = cy;
            for (let i = 0; i < 5; i++) {
                const band = new PIXI.Graphics();
                const w = unit * (1.35 - i * 0.22);
                const col = i % 2 === 0 ? 0xffe27a : 0xffffff;
                band.beginFill(col, 0.08 + i * 0.05);
                band.drawRect(-w / 2, -scene.h, w, scene.h);
                band.endFill();
                if (PIXI.BLEND_MODES) band.blendMode = PIXI.BLEND_MODES.ADD;
                pillarWrap.addChild(band);
            }
            pillarWrap.alpha = 0;
            pillarWrap.scale.set(1, 0.15);
            root.addChild(pillarWrap);

            const ripples = [];
            for (let r = 0; r < 3; r++) {
                const ring = new PIXI.Graphics();
                ring.lineStyle(Math.max(1.5, unit * 0.028), 0xffe9a0, 0.55 - r * 0.12);
                ring.drawEllipse(0, 0, unit * (0.7 + r * 0.35), unit * (0.22 + r * 0.08));
                ring.x = cx; ring.y = cy + unit * 0.48;
                ring.alpha = 0;
                ring.scale.set(0.3);
                root.addChild(ring);
                ripples.push(ring);
            }

            const groundGlow = makeSoftBloom(PIXI, theme, unit, 1.25);
            groundGlow.x = cx; groundGlow.y = cy + unit * 0.5;
            groundGlow.alpha = 0;
            root.addChild(groundGlow);

            const dome = new PIXI.Container();
            dome.x = cx; dome.y = cy;
            dome.alpha = 0;
            dome.scale.set(0.18);
            root.addChild(dome);
            const domeLayers = [
                { rx: 1.12, ry: 1.02, col: 0x66ccff, a: 0.1 },
                { rx: 1.0, ry: 0.92, col: 0x9fe8ff, a: 0.14 },
                { rx: 0.86, ry: 0.78, col: 0xffffff, a: 0.18 },
            ];
            const domeGfx = [];
            domeLayers.forEach((L) => {
                const g = new PIXI.Graphics();
                g.beginFill(L.col, L.a);
                g.drawEllipse(0, 0, unit * L.rx, unit * L.ry);
                g.endFill();
                if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
                dome.addChild(g);
                domeGfx.push(g);
            });
            const domeRim = new PIXI.Graphics();
            domeRim.lineStyle(Math.max(2, unit * 0.04), 0xd4f4ff, 0.75);
            domeRim.drawEllipse(0, 0, unit * 1.08, unit * 0.98);
            domeRim.lineStyle(Math.max(1, unit * 0.018), 0xffffff, 0.5);
            domeRim.drawEllipse(0, 0, unit * 0.92, unit * 0.84);
            if (PIXI.BLEND_MODES) domeRim.blendMode = PIXI.BLEND_MODES.ADD;
            dome.addChild(domeRim);

            const runeRing = new PIXI.Container();
            runeRing.x = cx; runeRing.y = cy + unit * 0.44;
            runeRing.alpha = 0;
            runeRing.scale.set(0.25, 0.1);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const seg = new PIXI.Graphics();
                seg.lineStyle(Math.max(2, unit * 0.035), 0xffe27a, 0.85);
                seg.arc(0, 0, unit * 0.78, ang - 0.18, ang + 0.18);
                runeRing.addChild(seg);
            }
            root.addChild(runeRing);

            const bloom = makeSoftBloom(PIXI, theme, unit, 1.55);
            bloom.x = cx; bloom.y = cy; bloom.alpha = 0;
            root.addChild(bloom);

            tl.to(skyWash, { alpha: 1, duration: 0.22 }, 0);
            tl.to(pillarWrap, { alpha: 1, duration: 0.2 }, 0);
            tl.to(pillarWrap.scale, { x: 1, y: 1, duration: 0.38, ease: "power3.out" }, 0);
            ripples.forEach((ring, ri) => {
                tl.to(ring, { alpha: 0.85, duration: 0.18 }, 0.12 + ri * 0.08);
                tl.to(ring.scale, { x: 1.6 + ri * 0.2, y: 1.6 + ri * 0.2, duration: 0.55, ease: "power2.out" }, 0.12 + ri * 0.08);
                tl.to(ring, { alpha: 0, duration: 0.35, ease: "power2.out" }, 0.45 + ri * 0.08);
            });
            tl.to(groundGlow, { alpha: 0.9, duration: 0.28 }, 0.14);
            tl.addLabel("form", 0.36);
            tl.to(bloom, { alpha: 1, duration: 0.16 }, "form");
            tl.to(bloom.scale, { x: 1.7, y: 1.7, duration: 0.44, ease: "power2.out" }, "form");
            tl.to(bloom, { alpha: 0, duration: 0.48, ease: "power2.out" }, "form+=0.2");
            tl.to(dome, { alpha: 1, duration: 0.18 }, "form");
            tl.to(dome.scale, { x: 1, y: 1, duration: 0.56, ease: "back.out(1.7)" }, "form");
            tl.to(runeRing, { alpha: 0.92, duration: 0.22 }, "form");
            tl.to(runeRing.scale, { x: 1, y: 0.38, duration: 0.42, ease: "power2.out" }, "form");
            tl.to(runeRing, { rotation: Math.PI * 1.6, duration: 1.8, ease: "none" }, "form");
            if (typeof opts.onImpact === "function") {
                tl.add(() => { try { opts.onImpact(); } catch (e) { /* */ } }, "form+=0.12");
            }
            tl.to({}, {
                duration: 1.05,
                onUpdate: function () {
                    const p = this.progress();
                    const s = 1 + Math.sin(p * Math.PI * 4) * 0.04;
                    dome.scale.x = s; dome.scale.y = s;
                    domeGfx.forEach((g, gi) => { g.alpha = 0.85 + Math.sin(p * Math.PI * 6 + gi) * 0.12; });
                },
            }, "form+=0.42");
            tl.to(pillarWrap, { alpha: 0, duration: 0.48, ease: "power2.out" }, "form+=0.32");
            const outAt = "form+=1.6";
            tl.to(dome, { alpha: 0, duration: 0.45, ease: "power2.out" }, outAt);
            tl.to(runeRing, { alpha: 0, duration: 0.45, ease: "power2.out" }, outAt);
            tl.to(groundGlow, { alpha: 0, duration: 0.45 }, outAt);
            tl.to(skyWash, { alpha: 0, duration: 0.45 }, outAt);

            await awaitPixiTimeline(tl, root, 3.8);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * PRINCESA SLIME    /* ============================================================
     * PRINCESA SLIME — Travessura: dois portais de gosma trocam os
     * campeões; blobs verdes viajam em arco com respingos (cartoon).
     * ============================================================ */
    async function playTrickerySwapScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let ax = opts.ax; let ay = opts.ay; let bx = opts.bx; let by = opts.by;
        if (ax == null || ay == null || bx == null || by == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const ma = frame.map(ax, ay); const mb = frame.map(bx, by);
        ax = ma.x; ay = ma.y; bx = mb.x; by = mb.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const GREEN = 0x7ee23a; const DARK = 0x1f6b1a; const LIME = 0xc8ff7a;

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const makeGooPool = (x, y) => {
                const c = new PIXI.Container();
                c.x = x; c.y = y; c.alpha = 0; c.scale.set(0.1);
                const glow = new PIXI.Graphics();
                glow.beginFill(GREEN, 0.25); glow.drawEllipse(0, 0, unit * 0.95, unit * 0.34); glow.endFill();
                if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
                c.addChild(glow);
                const pool = new PIXI.Graphics();
                pool.beginFill(DARK, 0.95); pool.drawEllipse(0, 0, unit * 0.72, unit * 0.26); pool.endFill();
                pool.beginFill(GREEN, 0.9); pool.drawEllipse(0, 0, unit * 0.6, unit * 0.2); pool.endFill();
                pool.beginFill(LIME, 0.55); pool.drawEllipse(-unit * 0.12, -unit * 0.04, unit * 0.22, unit * 0.08); pool.endFill();
                c.addChild(pool);
                root.addChild(c);
                return c;
            };
            const poolA = makeGooPool(ax, ay + unit * 0.42);
            const poolB = makeGooPool(bx, by + unit * 0.42);

            const makeBlob = (x, y) => {
                const c = new PIXI.Container();
                c.x = x; c.y = y; c.alpha = 0; c.scale.set(0.3);
                const body = new PIXI.Graphics();
                body.lineStyle(Math.max(2, unit * 0.05), DARK, 1);
                body.beginFill(GREEN, 1); body.drawCircle(0, 0, unit * 0.4); body.endFill();
                body.beginFill(LIME, 0.7); body.drawCircle(-unit * 0.12, -unit * 0.14, unit * 0.12); body.endFill();
                body.beginFill(0xffffff, 0.8); body.drawCircle(-unit * 0.16, -unit * 0.16, unit * 0.05); body.endFill();
                c.addChild(body);
                root.addChild(c);
                return c;
            };
            const blobA = makeBlob(ax, ay);
            const blobB = makeBlob(bx, by);

            const arcLift = Math.max(unit * 1.1, Math.abs(bx - ax) * 0.22);
            const midX1 = (ax + bx) / 2; const midY1 = Math.min(ay, by) - arcLift;

            tl.to([poolA, poolB], { alpha: 1, duration: 0.2 }, 0);
            tl.to([poolA.scale, poolB.scale], { x: 1, y: 1, duration: 0.34, ease: "back.out(1.8)" }, 0);
            tl.addLabel("dive", 0.34);
            tl.to([blobA, blobB], { alpha: 1, duration: 0.14 }, "dive");
            tl.to([blobA.scale, blobB.scale], { x: 1, y: 1, duration: 0.26, ease: "back.out(2.2)" }, "dive");
            // mergulham (squash) e viajam em arco trocando de lado
            tl.addLabel("travel", 0.7);
            tl.to(blobA, {
                duration: 0.62, ease: "sine.inOut",
                onUpdate: function () {
                    const p = this.progress();
                    const q = 1 - p;
                    blobA.x = q * q * ax + 2 * q * p * midX1 + p * p * bx;
                    blobA.y = q * q * ay + 2 * q * p * midY1 + p * p * by;
                    blobA.scale.x = 1 + Math.sin(p * Math.PI) * 0.3;
                    blobA.scale.y = 1 - Math.sin(p * Math.PI) * 0.18;
                    blobA.rotation = p * 1.2;
                },
            }, "travel");
            const midY2 = Math.max(ay, by) + arcLift * 0.5;
            tl.to(blobB, {
                duration: 0.62, ease: "sine.inOut",
                onUpdate: function () {
                    const p = this.progress();
                    const q = 1 - p;
                    blobB.x = q * q * bx + 2 * q * p * midX1 + p * p * ax;
                    blobB.y = q * q * by + 2 * q * p * midY2 + p * p * ay;
                    blobB.scale.x = 1 + Math.sin(p * Math.PI) * 0.3;
                    blobB.scale.y = 1 - Math.sin(p * Math.PI) * 0.18;
                    blobB.rotation = -p * 1.2;
                },
            }, "travel");
            // respingos ao chegar
            tl.addLabel("splash", 1.32);
            tl.add(() => {
                spawnCartoonImpact(root, PIXI, gsap, bx, by, GREEN, DARK, unit, { sizeMult: 1.0, stars: cinematic ? 8 : 4, spikes: 10 });
                spawnCartoonImpact(root, PIXI, gsap, ax, ay, GREEN, DARK, unit, { sizeMult: 1.0, stars: cinematic ? 8 : 4, spikes: 10 });
                if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            }, "splash");
            tl.to([blobA, blobB], { alpha: 0, duration: 0.22, ease: "power2.in" }, "splash+=0.05");
            tl.to([poolA, poolB], { alpha: 0, duration: 0.4, ease: "power2.out" }, "splash+=0.25");
            tl.to([poolA.scale, poolB.scale], { x: 0.1, y: 0.1, duration: 0.4, ease: "back.in(1.4)" }, "splash+=0.25");
            // Mantém o root vivo até os respingos cartoon (~1.05s) terminarem.
            tl.to({}, { duration: 0.05 }, "splash+=1.1");

            await awaitPixiTimeline(tl, root, 3.0);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * CAVALEIRA BRINQUEDO — Troca Injusta: arcos divertidos com trilhas
     * mágicas e estalo no meio (Pixi + GSAP, nível Hearthstone).
     * ============================================================ */
    async function playTrocaInjustaScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let ax = opts.ax; let ay = opts.ay; let bx = opts.bx; let by = opts.by;
        if (ax == null || ay == null || bx == null || by == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const ma = frame.map(ax, ay); const mb = frame.map(bx, by);
        ax = ma.x; ay = ma.y; bx = mb.x; by = mb.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const PINK = 0xff7ad4; const GOLD = 0xffe27a; const LAV = 0xc8a0ff;

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const makeOrb = (col) => {
                const c = new PIXI.Container();
                const glow = makeSoftOrb(PIXI, col, unit * 0.38, 0.55);
                c.addChild(glow);
                const core = makeSoftOrb(PIXI, 0xffffff, unit * 0.14, 0.9);
                c.addChild(core);
                c.alpha = 0; c.scale.set(0.35);
                root.addChild(c);
                return c;
            };
            const orbA = makeOrb(PINK);
            const orbB = makeOrb(LAV);
            orbA.x = ax; orbA.y = ay;
            orbB.x = bx; orbB.y = by;

            const trails = [];
            const trailN = n(cinematic ? 14 : 8);
            for (let i = 0; i < trailN; i++) {
                const t = makeSoftOrb(PIXI, i % 2 === 0 ? PINK : GOLD, unit * 0.08, 0.7);
                t.alpha = 0; root.addChild(t);
                trails.push(t);
            }

            const arcLift = Math.max(unit * 1.35, Math.abs(bx - ax) * 0.28);
            const midX = (ax + bx) / 2;
            const midY = Math.min(ay, by) - arcLift;
            const midY2 = Math.max(ay, by) + arcLift * 0.45;

            tl.addLabel("go", 0.08);
            tl.to([orbA, orbB], { alpha: 1, duration: 0.16 }, "go");
            tl.to([orbA.scale, orbB.scale], { x: 1, y: 1, duration: 0.28, ease: "back.out(2.4)" }, "go");
            tl.addLabel("swap", 0.42);
            tl.to(orbA, {
                duration: 0.72, ease: "sine.inOut",
                onUpdate: function () {
                    const p = this.progress();
                    const q = 1 - p;
                    orbA.x = q * q * ax + 2 * q * p * midX + p * p * bx;
                    orbA.y = q * q * ay + 2 * q * p * midY + p * p * by;
                    orbA.rotation = p * Math.PI * 2.2;
                    orbA.scale.x = 1 + Math.sin(p * Math.PI) * 0.35;
                    orbA.scale.y = 1 - Math.sin(p * Math.PI) * 0.2;
                    trails.forEach((tr, ti) => {
                        const lag = Math.max(0, p - ti * 0.04);
                        const lq = 1 - lag;
                        tr.x = lq * lq * ax + 2 * lq * lag * midX + lag * lag * bx;
                        tr.y = lq * lq * ay + 2 * lq * lag * midY + lag * lag * by;
                        tr.alpha = lag > 0 ? 0.55 * (1 - ti / trailN) : 0;
                    });
                },
            }, "swap");
            tl.to(orbB, {
                duration: 0.72, ease: "sine.inOut",
                onUpdate: function () {
                    const p = this.progress();
                    const q = 1 - p;
                    orbB.x = q * q * bx + 2 * q * p * midX + p * p * ax;
                    orbB.y = q * q * by + 2 * q * p * midY2 + p * p * ay;
                    orbB.rotation = -p * Math.PI * 2.2;
                    orbB.scale.x = 1 + Math.sin(p * Math.PI) * 0.35;
                    orbB.scale.y = 1 - Math.sin(p * Math.PI) * 0.2;
                },
            }, "swap");

            const burst = makeSoftBloom(PIXI, { core: GOLD, spark: PINK, flash: 0xffffff, ring: LAV }, unit, 1.6);
            burst.x = midX; burst.y = (ay + by) / 2 - arcLift * 0.35;
            burst.alpha = 0; burst.scale.set(0.2);
            root.addChild(burst);
            tl.addLabel("pop", 1.14);
            tl.to(burst, { alpha: 1, duration: 0.1 }, "pop");
            tl.to(burst.scale, { x: 1.5, y: 1.5, duration: 0.34, ease: "power2.out" }, "pop");
            tl.to(burst, { alpha: 0, duration: 0.38, ease: "power2.out" }, "pop+=0.12");
            tl.add(() => {
                if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            }, "pop+=0.06");
            tl.to([orbA, orbB], { alpha: 0, duration: 0.22, ease: "power2.in" }, "pop+=0.08");
            tl.to(trails, { alpha: 0, duration: 0.3 }, "pop+=0.1");

            await awaitPixiTimeline(tl, root, 2.4);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * JEKIRO — Fogo e Gelo: impacto cartoon por alvo.
     * mode 'fire' → explosão laranja com estilhaços; 'ice' → cristal
     * de gelo facetado + flocos. Localizado (sem tela cheia).
     * ============================================================ */
    async function playFireIceImpactScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const mode = opts.mode === "ice" ? "ice" : "fire";
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, false);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            if (mode === "fire") {
                const fill = 0xffb02a; const outline = 0x7a2a00;
                const bloom = makeSoftBloom(PIXI, { core: 0xffd24a, spark: 0xff7a1c, flash: 0xfff0b0 }, unit, 1.1);
                bloom.x = cx; bloom.y = cy; bloom.alpha = 0;
                root.addChild(bloom);
                tl.to(bloom, { alpha: 1, duration: 0.1 }, 0);
                tl.to(bloom.scale, { x: 1.5, y: 1.5, duration: 0.4, ease: "power2.out" }, 0);
                tl.to(bloom, { alpha: 0, duration: 0.45, ease: "power2.out" }, 0.15);
                tl.add(() => {
                    spawnCartoonImpact(root, PIXI, gsap, cx, cy, fill, outline, unit, { sizeMult: 1.15, stars: cinematic ? 9 : 5, spikes: 12 });
                    for (let i = 0; i < (cinematic ? 14 : 7); i++) {
                        const sh = makeFireShard(PIXI, { core: 0xff7a1c, spark: 0xffd24a, ring: 0xff5500 }, unit);
                        sh.x = cx; sh.y = cy;
                        root.addChild(sh);
                        const ang = Math.random() * Math.PI * 2;
                        const dist = unit * (0.7 + Math.random() * 1.3);
                        const md = 0.5 + Math.random() * 0.3;
                        gsap.to(sh, { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist, rotation: (Math.random() - 0.5) * 6, duration: md, ease: "power2.out", onComplete: () => { try { sh.destroy(); } catch (e) { /* */ } } });
                        gsap.to(sh, { alpha: 0, duration: 0.26, delay: Math.max(0, md - 0.26), ease: "power1.in" });
                    }
                }, 0.04);
            } else {
                const crystal = buildToonIceCrystal(PIXI, unit, 1.15);
                crystal.x = cx; crystal.y = cy; crystal.alpha = 0; crystal.scale.set(0.2);
                crystal.rotation = -0.2;
                root.addChild(crystal);
                tl.to(crystal, { alpha: 1, duration: 0.14 }, 0);
                tl.to(crystal.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(2.0)" }, 0);
                tl.to(crystal, { rotation: 0.05, duration: 0.5, ease: "power2.out" }, 0);
                tl.add(() => {
                    spawnCartoonImpact(root, PIXI, gsap, cx, cy, 0xbfefff, 0x2a7da8, unit, { burst: false, sizeMult: 1.2, stars: 0 });
                    spawnToonPopStars(root, PIXI, gsap, cx, cy, 0xeaffff, 0x2a7da8, unit, cinematic ? 8 : 4);
                    for (let i = 0; i < (cinematic ? 8 : 4); i++) {
                        const fl = buildToonSnowflake(PIXI, unit, 0.4 + Math.random() * 0.4);
                        fl.x = cx + (Math.random() - 0.5) * unit; fl.y = cy + (Math.random() - 0.5) * unit;
                        fl.alpha = 0; root.addChild(fl);
                        const md = 0.9 + Math.random() * 0.4;
                        gsap.to(fl, { alpha: 0.95, duration: 0.18 });
                        gsap.to(fl, { y: fl.y + unit * 0.8, rotation: (Math.random() - 0.5) * 2, duration: md, ease: "sine.in", onComplete: () => { try { fl.destroy(); } catch (e) { /* */ } } });
                        gsap.to(fl, { alpha: 0, duration: 0.34, delay: Math.max(0, md - 0.34), ease: "power1.in" });
                    }
                }, 0.1);
                tl.to(crystal, { alpha: 0, duration: 0.5, ease: "power2.out" }, 1.1);
            }

            // Garante que o root só seja destruído após as partículas cartoon
            // (spawnCartoonImpact/estilhaços ~1.1s) terminarem.
            tl.to({}, { duration: 0.05 }, 1.3);
            await awaitPixiTimeline(tl, root, 2.2);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * TEXTURAS PROCEDURAIS SUAVES (estilo Hearthstone) — geradas em
     * <canvas> com gradientes radiais e cacheadas. Evitam o "look" de
     * vetor chapado: brilhos volumétricos, faíscas, fumaça billowy,
     * anéis de choque e rastros. Reutilizadas por PESADELO/EXPLOSÃO.
     * ============================================================ */
    const __dfVfxTexCache = new Map();
    const __sheetTexCache = new Map();
    const VFX_TEX_CACHE_MAX = 64;
    const CARD_TEX_CACHE_MAX = 48;
    const SHEET_TEX_CACHE_MAX = 12;

    function dfDestroyPixiTexture(tex) {
        if (!tex) return;
        try {
            if (typeof tex.destroy === "function") tex.destroy(true);
            else if (tex.baseTexture?.destroy) tex.baseTexture.destroy(true);
        } catch (e) { /* */ }
    }

    function dfEvictOldestMapEntry(map, max, onEvict) {
        while (map.size > max) {
            const key = map.keys().next().value;
            if (key === undefined) break;
            const val = map.get(key);
            map.delete(key);
            try { onEvict?.(val, key); } catch (e) { /* */ }
        }
    }

    function dfUnloadPixiAsset(url) {
        if (!url) return;
        try {
            const Assets = global.PIXI?.Assets;
            if (Assets?.unload) {
                const p = Assets.unload(url);
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) { /* */ }
    }

    function trimTextureCaches() {
        dfEvictOldestMapEntry(__dfVfxTexCache, VFX_TEX_CACHE_MAX, dfDestroyPixiTexture);
        dfEvictOldestMapEntry(texCache, CARD_TEX_CACHE_MAX, (p, url) => {
            dfUnloadPixiAsset(url);
            if (p && typeof p.then === "function") {
                p.then((tex) => dfDestroyPixiTexture(tex)).catch(() => {});
            } else {
                dfDestroyPixiTexture(p);
            }
        });
        dfEvictOldestMapEntry(__sheetTexCache, SHEET_TEX_CACHE_MAX, (entry) => {
            try { entry?.base?.destroy?.(); } catch (e) { /* */ }
            entry?.frames?.forEach((t) => dfDestroyPixiTexture(t));
        });
        try { global.DfPixiVfx?.trimUltTextureCaches?.(); } catch (e) { /* */ }
    }
    function dfHexRgb(hex) {
        return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    }
    function dfRgba(hex, a) {
        const c = dfHexRgb(hex);
        return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
    }
    function dfMakeTex(PIXI, key, size, paint) {
        const cached = __dfVfxTexCache.get(key);
        if (cached && !cached.destroyed) return cached;
        const cv = document.createElement("canvas");
        cv.width = size; cv.height = size;
        const ctx = cv.getContext("2d");
        paint(ctx, size);
        const tex = PIXI.Texture.from(cv);
        __dfVfxTexCache.set(key, tex);
        dfEvictOldestMapEntry(__dfVfxTexCache, VFX_TEX_CACHE_MAX, dfDestroyPixiTexture);
        return tex;
    }
    function dfGlowTex(PIXI, coreHex, edgeHex) {
        return dfMakeTex(PIXI, "glow_" + coreHex + "_" + edgeHex, 256, (ctx, s) => {
            const r = s / 2;
            const g = ctx.createRadialGradient(r, r, 0, r, r, r);
            g.addColorStop(0, dfRgba(0xffffff, 1));
            g.addColorStop(0.16, dfRgba(coreHex, 0.96));
            g.addColorStop(0.46, dfRgba(edgeHex, 0.52));
            g.addColorStop(1, dfRgba(edgeHex, 0));
            ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
        });
    }
    function dfSparkTex(PIXI, coreHex) {
        return dfMakeTex(PIXI, "spark_" + coreHex, 128, (ctx, s) => {
            const r = s / 2;
            const g = ctx.createRadialGradient(r, r, 0, r, r, r);
            g.addColorStop(0, dfRgba(0xffffff, 1));
            g.addColorStop(0.3, dfRgba(coreHex, 0.92));
            g.addColorStop(1, dfRgba(coreHex, 0));
            ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
        });
    }
    function dfSmokeTex(PIXI, tintHex) {
        return dfMakeTex(PIXI, "smoke_" + tintHex, 256, (ctx, s) => {
            for (let i = 0; i < 7; i++) {
                const bx = s * (0.3 + Math.random() * 0.4);
                const by = s * (0.3 + Math.random() * 0.4);
                const br = s * (0.16 + Math.random() * 0.22);
                const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
                g.addColorStop(0, dfRgba(tintHex, 0.42));
                g.addColorStop(1, dfRgba(tintHex, 0));
                ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
            }
        });
    }
    function dfRingTex(PIXI, colHex) {
        return dfMakeTex(PIXI, "ring_" + colHex, 256, (ctx, s) => {
            const r = s / 2;
            const g = ctx.createRadialGradient(r, r, r * 0.52, r, r, r);
            g.addColorStop(0, dfRgba(colHex, 0));
            g.addColorStop(0.68, dfRgba(colHex, 0.7));
            g.addColorStop(0.85, dfRgba(0xffffff, 0.55));
            g.addColorStop(0.95, dfRgba(colHex, 0.35));
            g.addColorStop(1, dfRgba(colHex, 0));
            ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
        });
    }
    function dfStreakTex(PIXI, colHex) {
        return dfMakeTex(PIXI, "streak_" + colHex, 256, (ctx, s) => {
            const g = ctx.createLinearGradient(0, 0, s, 0);
            g.addColorStop(0, dfRgba(colHex, 0));
            g.addColorStop(0.72, dfRgba(colHex, 0.55));
            g.addColorStop(1, dfRgba(0xffffff, 0.95));
            ctx.fillStyle = g;
            const h = s * 0.16;
            ctx.fillRect(0, (s - h) / 2, s, h);
        });
    }
    function dfSkullTex(PIXI, glowHex) {
        return dfMakeTex(PIXI, "skull_" + glowHex, 256, (ctx, s) => {
            const cx = s / 2;
            ctx.save();
            try { ctx.filter = "blur(3px)"; } catch (e) { /* */ }
            const halo = ctx.createRadialGradient(cx, s * 0.44, 0, cx, s * 0.44, s * 0.5);
            halo.addColorStop(0, dfRgba(glowHex, 0.5));
            halo.addColorStop(1, dfRgba(glowHex, 0));
            ctx.fillStyle = halo; ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = dfRgba(0xffffff, 0.9);
            ctx.beginPath();
            ctx.ellipse(cx, s * 0.4, s * 0.26, s * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.16, s * 0.58);
            ctx.quadraticCurveTo(cx, s * 0.84, cx + s * 0.16, s * 0.58);
            ctx.lineTo(cx + s * 0.12, s * 0.7);
            ctx.quadraticCurveTo(cx, s * 0.8, cx - s * 0.12, s * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.globalCompositeOperation = "destination-out";
            ctx.beginPath();
            ctx.ellipse(cx - s * 0.11, s * 0.4, s * 0.075, s * 0.095, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx + s * 0.11, s * 0.4, s * 0.075, s * 0.095, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx, s * 0.46);
            ctx.lineTo(cx - s * 0.045, s * 0.55);
            ctx.lineTo(cx + s * 0.045, s * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
        });
    }
    function dfSprite(PIXI, tex, add) {
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5);
        if (add && PIXI.BLEND_MODES) sp.blendMode = PIXI.BLEND_MODES.ADD;
        return sp;
    }

    /* ============================================================
     * PESADELO — invocação sombria cinematográfica: implosão de almas,
     * núcleo do abismo, ondas de choque, vórtice de fumaça roxa e uma
     * caveira fantasma etérea. Texturas suaves (sem vetor chapado).
     * ============================================================ */
    async function playNightmareScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const PUR = 0x8a3cff;
        const DEEP = 0x2a0a5a;
        const GHOST = 0xc8a8ff;
        const EYE = 0xff3a6a;

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const vignette = makeEdgeVignette(PIXI, 0.52);
            root.addChild(vignette);
            tl.to(vignette, { alpha: 1, duration: 0.55, ease: "sine.out" }, 0);

            const abyssCore = dfSprite(PIXI, dfGlowTex(PIXI, PUR, DEEP), true);
            abyssCore.x = cx; abyssCore.y = cy; abyssCore.alpha = 0;
            abyssCore.scale.set(0.05);
            root.addChild(abyssCore);

            const soulSparks = [];
            const soulN = n(cinematic ? 48 : 24);
            for (let i = 0; i < soulN; i++) {
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, i % 3 ? GHOST : PUR), true);
                const ang = Math.random() * Math.PI * 2;
                const dist = unit * (1.8 + Math.random() * 2.8);
                sp.x = cx + Math.cos(ang) * dist;
                sp.y = cy + Math.sin(ang) * dist;
                sp.alpha = 0;
                sp.scale.set(0.2 + Math.random() * 0.35);
                root.addChild(sp);
                soulSparks.push({ sp, ang, dist, delay: Math.random() * 0.35 });
            }

            const smokePlumes = [];
            const smokeN = n(cinematic ? 14 : 8);
            for (let i = 0; i < smokeN; i++) {
                const sm = dfSprite(PIXI, dfSmokeTex(PIXI, i % 2 ? 0x4a2080 : 0x2a1050), false);
                sm.x = cx + (Math.random() - 0.5) * unit * 1.6;
                sm.y = cy + unit * (0.2 + Math.random() * 0.5);
                sm.alpha = 0;
                sm.scale.set(0.3 + Math.random() * 0.5);
                root.addChild(sm);
                smokePlumes.push(sm);
            }

            const vortexWrap = new PIXI.Container();
            vortexWrap.x = cx; vortexWrap.y = cy; vortexWrap.alpha = 0;
            root.addChild(vortexWrap);
            const vortexLayers = [];
            for (let vi = 0; vi < 4; vi++) {
                const vl = dfSprite(PIXI, dfGlowTex(PIXI, vi % 2 ? PUR : DEEP, 0x0a0218), true);
                vl.scale.set(0.5 + vi * 0.35);
                vl.alpha = 0.35 - vi * 0.06;
                vortexWrap.addChild(vl);
                vortexLayers.push(vl);
            }

            const skullWrap = new PIXI.Container();
            skullWrap.x = cx; skullWrap.y = cy + unit * 0.5; skullWrap.alpha = 0;
            skullWrap.scale.set(0.2);
            root.addChild(skullWrap);
            const skullSprite = dfSprite(PIXI, dfSkullTex(PIXI, GHOST), false);
            skullSprite.scale.set(unit * 0.0045);
            skullWrap.addChild(skullSprite);
            const skullGlow = dfSprite(PIXI, dfGlowTex(PIXI, GHOST, PUR), true);
            skullGlow.scale.set(unit * 0.005);
            skullGlow.alpha = 0.6;
            skullWrap.addChildAt(skullGlow, 0);
            const eyeL = dfSprite(PIXI, dfSparkTex(PIXI, EYE), true);
            eyeL.x = -unit * 0.11; eyeL.y = -unit * 0.04;
            eyeL.scale.set(unit * 0.0018); eyeL.alpha = 0;
            skullWrap.addChild(eyeL);
            const eyeR = dfSprite(PIXI, dfSparkTex(PIXI, EYE), true);
            eyeR.x = unit * 0.11; eyeR.y = -unit * 0.04;
            eyeR.scale.set(unit * 0.0018); eyeR.alpha = 0;
            skullWrap.addChild(eyeR);

            const mistOrbs = [];
            const mistN = n(cinematic ? 16 : 10);
            for (let i = 0; i < mistN; i++) {
                const orb = dfSprite(PIXI, dfSparkTex(PIXI, i % 2 ? GHOST : PUR), true);
                const ang = (i / mistN) * Math.PI * 2 + Math.random() * 0.4;
                const dist = unit * (0.35 + Math.random() * 1.1);
                orb.x = cx + Math.cos(ang) * dist;
                orb.y = cy + Math.sin(ang) * dist;
                orb.alpha = 0;
                orb.scale.set(0.15 + Math.random() * 0.25);
                root.addChild(orb);
                mistOrbs.push({ orb, ang, dist, delay: Math.random() * 0.22 });
            }

            tl.addLabel("build", 0);
            tl.to(abyssCore, { alpha: 0.95, duration: 0.12 }, "build");
            tl.to(abyssCore.scale, { x: 2.8, y: 2.8, duration: 0.55, ease: "power3.out" }, "build");
            tl.to(abyssCore, { alpha: 0, duration: 0.45, ease: "power2.in" }, "build+=0.35");

            soulSparks.forEach((s) => {
                const at = 0.08 + s.delay;
                tl.to(s.sp, { alpha: 1, duration: 0.15 }, at);
                tl.to(s.sp, { x: cx, y: cy, duration: 0.55, ease: "power3.in" }, at);
                tl.to(s.sp.scale, { x: 0.05, y: 0.05, duration: 0.55, ease: "power3.in" }, at);
                tl.to(s.sp, { alpha: 0, duration: 0.12 }, at + 0.48);
            });

            tl.addLabel("vortex", 0.45);
            tl.to(vortexWrap, { alpha: 1, duration: 0.25 }, "vortex");
            vortexLayers.forEach((vl, vi) => {
                tl.to(vl, { rotation: Math.PI * (vi % 2 ? -2.5 : 2.5), duration: 2.2, ease: "none" }, "vortex");
            });

            smokePlumes.forEach((sm, si) => {
                const at = 0.5 + si * 0.04;
                tl.to(sm, { alpha: 0.65, duration: 0.22 }, at);
                tl.to(sm, {
                    y: sm.y - unit * (1.2 + si * 0.15),
                    x: sm.x + (Math.random() - 0.5) * unit * 0.6,
                    duration: 1.4,
                    ease: "sine.out",
                }, at);
                tl.to(sm.scale, { x: sm.scale.x * 2.8, y: sm.scale.y * 2.8, duration: 1.4, ease: "sine.out" }, at);
                tl.to(sm, { alpha: 0, duration: 0.5, ease: "power1.in" }, at + 1.0);
            });

            tl.addLabel("skull", 0.75);
            tl.to(skullWrap, { alpha: 1, duration: 0.22 }, "skull");
            tl.to(skullWrap, { y: cy - unit * 0.15, duration: 0.7, ease: "power2.out" }, "skull");
            tl.to(skullWrap.scale, { x: 1, y: 1, duration: 0.55, ease: "back.out(1.8)" }, "skull");
            tl.to(eyeL, { alpha: 1, duration: 0.15 }, "skull+=0.25");
            tl.to(eyeR, { alpha: 1, duration: 0.15 }, "skull+=0.25");
            tl.to(eyeL.scale, { x: eyeL.scale.x * 1.4, y: eyeL.scale.y * 1.4, duration: 0.3, yoyo: true, repeat: 3 }, "skull+=0.3");
            tl.to(eyeR.scale, { x: eyeR.scale.x * 1.4, y: eyeR.scale.y * 1.4, duration: 0.3, yoyo: true, repeat: 3 }, "skull+=0.3");

            mistOrbs.forEach((m, mi) => {
                const at = 0.72 + m.delay + mi * 0.018;
                tl.to(m.orb, { alpha: 0.85, duration: 0.14 }, at);
                tl.to(m.orb, {
                    x: cx + Math.cos(m.ang) * m.dist * 0.15,
                    y: cy + Math.sin(m.ang) * m.dist * 0.15,
                    duration: 0.62,
                    ease: "power2.inOut",
                }, at);
                tl.to(m.orb.scale, { x: 0.04, y: 0.04, duration: 0.62, ease: "power2.in" }, at);
                tl.to(m.orb, { alpha: 0, duration: 0.2, ease: "power1.in" }, at + 0.48);
            });

            tl.to({}, {
                duration: 0.72,
                onUpdate: function () {
                    const p = this.progress();
                    skullWrap.y = cy - unit * 0.15 + Math.sin(p * Math.PI * 4) * unit * 0.05;
                },
            }, "skull+=0.45");

            const outAt = "skull+=1.05";
            tl.to(skullWrap, { alpha: 0, y: cy - unit * 0.9, duration: 0.42, ease: "power2.in" }, outAt);
            tl.to(vortexWrap, { alpha: 0, duration: 0.38, ease: "power2.in" }, outAt);
            tl.to(vortexWrap.scale, { x: 0.05, y: 0.05, duration: 0.38, ease: "back.in(1.5)" }, outAt);
            tl.to(vignette, { alpha: 0, duration: 0.48, ease: "power2.out" }, outAt);

            await awaitPixiTimeline(tl, root, 2.95);
        } finally {
            try { root.destroy?.({ children: true }); } catch (e) { /* */ }
            try { if (root.parent) root.parent.removeChild(root); } catch (e) { /* */ }
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * EXPLOSÃO (talento) — detonação cinematográfica estilo Hearthstone.
     * Flash volumétrico, núcleo de fogo, ondas de choque texturizadas,
     * brasas/estilhaços, fumaça billowy e rastros de calor. Sem vetor.
     * ============================================================ */
    async function playExplosionScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const FIRE = 0xff6020;
        const CORE = 0xfff0c8;
        const EMBER = 0xff9040;

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const scene = scenePixels();
            const vignette = new PIXI.Graphics();
            vignette.beginFill(0x1a0800, 0.38);
            vignette.drawRect(0, 0, scene.w, scene.h);
            vignette.endFill();
            vignette.alpha = 0;
            root.addChildAt(vignette, 0);

            const shockWrap = new PIXI.Container();
            root.addChild(shockWrap);

            const boomEmoji = new PIXI.Text("💥", {
                fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
                fontSize: Math.round(unit * (cinematic ? 2.4 : 1.6)),
            });
            boomEmoji.anchor.set(0.5);
            boomEmoji.x = cx;
            boomEmoji.y = cy;
            boomEmoji.alpha = 0;
            boomEmoji.scale.set(0.2);
            root.addChild(boomEmoji);

            const flashWash = dfSprite(PIXI, dfGlowTex(PIXI, CORE, FIRE), true);
            flashWash.x = cx; flashWash.y = cy; flashWash.alpha = 0;
            flashWash.scale.set(0.08);
            root.addChild(flashWash);

            const fireCore = dfSprite(PIXI, dfGlowTex(PIXI, CORE, FIRE), true);
            fireCore.x = cx; fireCore.y = cy; fireCore.alpha = 0;
            fireCore.scale.set(0.12);
            root.addChild(fireCore);

            const outerBloom = dfSprite(PIXI, dfGlowTex(PIXI, FIRE, 0xff2000), true);
            outerBloom.x = cx; outerBloom.y = cy; outerBloom.alpha = 0;
            outerBloom.scale.set(0.15);
            root.addChild(outerBloom);

            const shockRings = [];
            for (let ri = 0; ri < 4; ri++) {
                const col = ri % 2 === 0 ? 0xffa040 : 0xff6020;
                const ring = dfSprite(PIXI, dfRingTex(PIXI, col), true);
                ring.x = cx; ring.y = cy; ring.alpha = 0; ring.scale.set(0.2);
                root.addChild(ring);
                shockRings.push(ring);
            }

            const embers = [];
            const emberN = n(cinematic ? 36 : 20);
            for (let i = 0; i < emberN; i++) {
                const col = i % 4 === 0 ? CORE : (i % 4 === 1 ? EMBER : (i % 4 === 2 ? FIRE : 0xff3010));
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, col), true);
                sp.x = cx; sp.y = cy; sp.alpha = 0;
                sp.scale.set(0.15 + Math.random() * 0.35);
                root.addChild(sp);
                const ang = Math.random() * Math.PI * 2;
                const dist = unit * (0.5 + Math.random() * 2.8);
                embers.push({ sp, ang, dist, lift: 0.4 + Math.random() * 1.2, delay: Math.random() * 0.04 });
            }

            const shards = [];
            const shardN = n(cinematic ? 18 : 10);
            for (let i = 0; i < shardN; i++) {
                const sh = dfSprite(PIXI, dfStreakTex(PIXI, i % 2 ? FIRE : CORE), true);
                sh.x = cx; sh.y = cy; sh.alpha = 0;
                sh.rotation = Math.random() * Math.PI * 2;
                sh.scale.set(0.08, 0.03);
                root.addChild(sh);
                const ang = Math.random() * Math.PI * 2;
                const dist = unit * (0.8 + Math.random() * 2.0);
                shards.push({ sh, ang, dist, delay: Math.random() * 0.06 });
            }

            const polyShards = [];
            const polyN = n(cinematic ? 12 : 8);
            for (let i = 0; i < polyN; i++) {
                const pg = new PIXI.Graphics();
                const col = i % 2 ? 0xff8040 : 0xffc060;
                pg.beginFill(col, 0.92);
                const w = unit * (0.06 + Math.random() * 0.12);
                const h = unit * (0.04 + Math.random() * 0.08);
                pg.drawPolygon([-w / 2, 0, w / 2, 0, 0, -h]);
                pg.endFill();
                pg.x = cx; pg.y = cy; pg.alpha = 0;
                pg.rotation = Math.random() * Math.PI * 2;
                root.addChild(pg);
                const ang = Math.random() * Math.PI * 2;
                polyShards.push({
                    g: pg, ang,
                    dist: unit * (0.6 + Math.random() * 2.4),
                    vr: (Math.random() - 0.5) * 0.9,
                });
            }

            const smokePlumes = [];
            const smokeN = n(cinematic ? 12 : 8);
            for (let i = 0; i < smokeN; i++) {
                const sm = dfSprite(PIXI, dfSmokeTex(PIXI, i % 2 ? 0x554433 : 0x332211), false);
                sm.x = cx + (Math.random() - 0.5) * unit * 0.9;
                sm.y = cy + unit * 0.05;
                sm.alpha = 0;
                sm.scale.set(0.35 + Math.random() * 0.45);
                root.addChild(sm);
                smokePlumes.push(sm);
            }

            const heatWisps = [];
            for (let i = 0; i < 6; i++) {
                const hw = dfSprite(PIXI, dfStreakTex(PIXI, EMBER), true);
                hw.x = cx; hw.y = cy; hw.alpha = 0;
                hw.rotation = (i / 6) * Math.PI * 2 + Math.PI * 0.5;
                hw.scale.set(0.06, 0.025);
                root.addChild(hw);
                heatWisps.push(hw);
            }

            tl.addLabel("impact", 0);
            // Detonação legível (~1,35s); root só some após minSec (awaitPixiTimeline).
            const boomDur = Math.max(1.2, Math.min(2.2, Number(opts.durationSec) || 1.35));
            const hold = { t: 0 };
            tl.to(hold, { t: 1, duration: boomDur, ease: "none" }, 0);

            tl.to(vignette, { alpha: 1, duration: 0.1, ease: "power2.out" }, "impact");
            tl.to(vignette, { alpha: 0.55, duration: 0.35, ease: "power2.out" }, "impact+=0.12");
            tl.to(vignette, { alpha: 0, duration: 0.55, ease: "power2.in" }, "impact+=0.75");
            tl.to(flashWash, { alpha: 1, duration: 0.05 }, "impact");
            tl.to(flashWash.scale, { x: 3.6, y: 3.6, duration: 0.75, ease: "power3.out" }, "impact");
            tl.to(flashWash, { alpha: 0, duration: 0.55, ease: "power2.out" }, "impact+=0.35");

            tl.to(fireCore, { alpha: 1, duration: 0.06 }, "impact");
            tl.to(fireCore.scale, { x: 2.35, y: 2.35, duration: 0.75, ease: "power3.out" }, "impact");
            tl.to(fireCore, { alpha: 0, duration: 0.55, ease: "power2.in" }, "impact+=0.55");

            tl.to(outerBloom, { alpha: 0.9, duration: 0.08 }, "impact+=0.03");
            tl.to(outerBloom.scale, { x: 3.2, y: 3.2, duration: 1.0, ease: "power2.out" }, "impact+=0.03");
            tl.to(outerBloom, { alpha: 0, duration: 0.6, ease: "power2.out" }, "impact+=0.65");

            tl.to(boomEmoji, { alpha: 1, duration: 0.08 }, "impact+=0.03");
            tl.to(boomEmoji.scale, { x: 1.4, y: 1.4, duration: 0.45, ease: "back.out(2.5)" }, "impact+=0.03");
            tl.to(boomEmoji, { alpha: 0.9, duration: 0.45, ease: "none" }, "impact+=0.5");
            tl.to(boomEmoji, { alpha: 0, duration: 0.35, ease: "power2.in" }, "impact+=1.0");

            tl.to(shockWrap, {
                x: unit * 0.12, duration: 0.05, yoyo: true, repeat: 9, ease: "power1.inOut",
            }, "impact");

            shockRings.forEach((ring, ri) => {
                const at = 0.05 + ri * 0.1;
                tl.to(ring, { alpha: 0.95, duration: 0.1 }, at);
                tl.to(ring.scale, { x: 3.8 + ri * 0.35, y: 3.8 + ri * 0.35, duration: 1.05, ease: "power2.out" }, at);
                tl.to(ring, { alpha: 0, duration: 0.7, ease: "power2.out" }, at + 0.45);
            });

            tl.add(() => {
                if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (err) { /* */ } }
            }, 0.35);

            embers.forEach((e) => {
                const at = 0.08 + e.delay;
                tl.to(e.sp, { alpha: 1, duration: 0.08 }, at);
                tl.to(e.sp, {
                    x: cx + Math.cos(e.ang) * e.dist,
                    y: cy + Math.sin(e.ang) * e.dist * 0.85 - unit * e.lift,
                    duration: 1.15,
                    ease: "power2.out",
                }, at);
                tl.to(e.sp.scale, { x: e.sp.scale.x * 0.4, y: e.sp.scale.y * 0.4, duration: 1.15, ease: "power2.out" }, at);
                tl.to(e.sp, { alpha: 0, duration: 0.55, ease: "power1.in" }, at + 0.7);
            });

            shards.forEach((s) => {
                const at = 0.07 + s.delay;
                tl.to(s.sh, { alpha: 0.95, duration: 0.06 }, at);
                tl.to(s.sh, {
                    x: cx + Math.cos(s.ang) * s.dist,
                    y: cy + Math.sin(s.ang) * s.dist * 0.8,
                    duration: 0.95,
                    ease: "power3.out",
                }, at);
                tl.to(s.sh.scale, { x: unit * 0.014, y: unit * 0.004, duration: 0.95, ease: "power3.out" }, at);
                tl.to(s.sh, { alpha: 0, duration: 0.5, ease: "power2.in" }, at + 0.55);
            });

            polyShards.forEach((p, pi) => {
                const at = 0.08 + pi * 0.015;
                tl.to(p.g, { alpha: 1, duration: 0.06 }, at);
                tl.to(p.g, {
                    x: cx + Math.cos(p.ang) * p.dist,
                    y: cy + Math.sin(p.ang) * p.dist * 0.75 - unit * 0.15,
                    rotation: p.g.rotation + p.vr * 4,
                    duration: 1.05,
                    ease: "power3.out",
                }, at);
                tl.to(p.g, { alpha: 0, duration: 0.5, ease: "power2.in" }, at + 0.6);
            });

            heatWisps.forEach((hw, wi) => {
                const at = 0.1 + wi * 0.04;
                tl.to(hw, { alpha: 0.75, duration: 0.14 }, at);
                tl.to(hw.scale, { x: unit * 0.018, y: unit * 0.005, duration: 0.85, ease: "power2.out" }, at);
                tl.to(hw, { alpha: 0, duration: 0.55, ease: "power2.in" }, at + 0.45);
            });

            smokePlumes.forEach((sm, si) => {
                const at = 0.15 + si * 0.035;
                tl.to(sm, { alpha: 0.55, duration: 0.2 }, at);
                tl.to(sm, {
                    y: sm.y - unit * (0.65 + si * 0.08),
                    x: sm.x + (Math.random() - 0.5) * unit * 0.45,
                    duration: 0.95,
                    ease: "sine.out",
                }, at);
                tl.to(sm.scale, { x: sm.scale.x * 2.2, y: sm.scale.y * 2.2, duration: 0.95, ease: "sine.out" }, at);
                tl.to(sm, { alpha: 0, duration: 0.4, ease: "power1.in" }, at + 0.6);
            });

            const sparkBurst = [];
            const sparkN = n(cinematic ? 36 : 18);
            for (let i = 0; i < sparkN; i++) {
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, i % 3 === 0 ? CORE : FIRE), true);
                sp.x = cx; sp.y = cy; sp.alpha = 0;
                sp.scale.set(0.08 + Math.random() * 0.2);
                root.addChild(sp);
                const ang = Math.random() * Math.PI * 2;
                sparkBurst.push({
                    sp, ang,
                    dist: unit * (1.2 + Math.random() * 3.4),
                    delay: 0.1 + Math.random() * 0.14,
                });
            }
            sparkBurst.forEach((s) => {
                const at = s.delay;
                tl.to(s.sp, { alpha: 1, duration: 0.05 }, at);
                tl.to(s.sp, {
                    x: cx + Math.cos(s.ang) * s.dist,
                    y: cy + Math.sin(s.ang) * s.dist * 0.65 - unit * 0.35,
                    duration: 1.2,
                    ease: "power3.out",
                }, at);
                tl.to(s.sp, { alpha: 0, duration: 0.6, ease: "power2.in" }, at + 0.55);
            });

            const debrisChunks = [];
            const debrisN = n(cinematic ? 22 : 12);
            for (let i = 0; i < debrisN; i++) {
                const dg = new PIXI.Graphics();
                const col = i % 3 === 0 ? 0x553322 : (i % 3 === 1 ? 0x774433 : 0x332211);
                dg.beginFill(col, 0.88);
                const sz = unit * (0.05 + Math.random() * 0.14);
                dg.drawRect(-sz / 2, -sz / 2, sz, sz * (0.6 + Math.random() * 0.5));
                dg.endFill();
                dg.x = cx; dg.y = cy; dg.alpha = 0;
                dg.rotation = Math.random() * Math.PI * 2;
                root.addChild(dg);
                const ang = Math.random() * Math.PI * 2;
                debrisChunks.push({
                    g: dg, ang,
                    dist: unit * (0.5 + Math.random() * 2.2),
                    vr: (Math.random() - 0.5) * 1.4,
                    delay: 0.12 + Math.random() * 0.1,
                });
            }
            debrisChunks.forEach((d) => {
                const at = d.delay;
                tl.to(d.g, { alpha: 0.95, duration: 0.06 }, at);
                tl.to(d.g, {
                    x: cx + Math.cos(d.ang) * d.dist,
                    y: cy + Math.sin(d.ang) * d.dist * 0.7 + unit * 0.25,
                    rotation: d.g.rotation + d.vr * 5,
                    duration: 1.15,
                    ease: "power2.out",
                }, at);
                tl.to(d.g, { alpha: 0, duration: 0.55, ease: "power1.in" }, at + 0.7);
            });

            tl.to(shockWrap, {
                x: -unit * 0.1, y: unit * 0.06, duration: 0.06, yoyo: true, repeat: 5, ease: "power1.inOut",
            }, "impact+=0.45");

            const afterFlash = dfSprite(PIXI, dfGlowTex(PIXI, FIRE, 0xff1000), true);
            afterFlash.x = cx; afterFlash.y = cy; afterFlash.alpha = 0;
            afterFlash.scale.set(0.05);
            root.addChild(afterFlash);
            tl.to(afterFlash, { alpha: 0.7, duration: 0.08 }, "impact+=0.5");
            tl.to(afterFlash.scale, { x: 2.4, y: 2.4, duration: 0.7, ease: "power2.out" }, "impact+=0.5");
            tl.to(afterFlash, { alpha: 0, duration: 0.55, ease: "power2.in" }, "impact+=0.85");

            // Encerra com o núcleo ainda legível; sem cauda longa antes do destroy.
            await awaitPixiTimeline(tl, root, boomDur + 0.2, { minSec: Math.min(boomDur, 1.15) });
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * EXPLOSÃO — pancada cartoon completa: "BOOM!", anéis toon,
     * estilhaços de fogo, brasas e estrelinhas (tela cheia).
     * ============================================================ */
    async function playToonExplosionScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const theme = { core: 0xffd24a, spark: 0xff7a1c, flash: 0xfff0b0, ring: 0xffae3a };
        const fill = 0xffc23a; const outline = 0x7a2a00;

        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const flash = new PIXI.Graphics();
            const scd = scenePixels();
            flash.beginFill(0xffd27a, 0.32);
            flash.drawRect(0, 0, scd.w, scd.h);
            flash.endFill();
            flash.alpha = 0;
            if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(flash);
            // Âncora ~1,5s — mesma duração do talento EXPLOSÃO.
            const boomDur = Math.max(1.35, Math.min(2.2, Number(opts.durationSec) || 1.5));
            const hold = { t: 0 };
            tl.to(hold, { t: 1, duration: boomDur, ease: "none" }, 0);
            tl.to(flash, { alpha: 1, duration: 0.08 }, 0);
            tl.to(flash, { alpha: 0, duration: 0.55, ease: "power2.out" }, 0.08);

            const bloom = makeSoftBloom(PIXI, theme, unit, 1.4);
            bloom.x = cx; bloom.y = cy; bloom.alpha = 0;
            root.addChild(bloom);
            tl.to(bloom, { alpha: 1, duration: 0.1 }, 0);
            tl.to(bloom.scale, { x: 2.2, y: 2.2, duration: 0.85, ease: "power2.out" }, 0);
            tl.to(bloom, { alpha: 0, duration: 0.85, ease: "power2.out" }, 0.28);

            // núcleo branco-quente
            const coreBall = new PIXI.Graphics();
            coreBall.beginFill(0xffffff, 1); coreBall.drawCircle(0, 0, unit * 0.5); coreBall.endFill();
            coreBall.beginFill(0xffd24a, 0.9); coreBall.drawCircle(0, 0, unit * 0.34); coreBall.endFill();
            if (PIXI.BLEND_MODES) coreBall.blendMode = PIXI.BLEND_MODES.ADD;
            coreBall.x = cx; coreBall.y = cy; coreBall.alpha = 0; coreBall.scale.set(0.2);
            root.addChild(coreBall);
            tl.to(coreBall, { alpha: 1, duration: 0.08 }, 0);
            tl.to(coreBall.scale, { x: 1.4, y: 1.4, duration: 0.5, ease: "power2.out" }, 0);
            tl.to(coreBall, { alpha: 0, duration: 0.65, ease: "power2.out" }, 0.28);

            tl.add(() => {
                spawnCartoonImpact(root, PIXI, gsap, cx, cy, fill, outline, unit, { sizeMult: 1.7, stars: cinematic ? 12 : 6, spikes: 14 });
                // segundo anel atrasado
                const ring2 = makeToonRing(PIXI, 0xff7a1c, outline, unit, 1.3);
                ring2.x = cx; ring2.y = cy; ring2.alpha = 0; ring2.scale.set(0.2);
                root.addChild(ring2);
                gsap.to(ring2, { alpha: 0.9, duration: 0.1, delay: 0.12 });
                gsap.to(ring2.scale, { x: 4.4, y: 4.4, duration: 1.0, delay: 0.12, ease: "power2.out" });
                gsap.to(ring2, { alpha: 0, duration: 0.55, delay: 0.65, onComplete: () => { try { ring2.destroy(); } catch (e) { /* */ } } });
                // estilhaços de fogo + brasas
                for (let i = 0; i < (cinematic ? 22 : 11); i++) {
                    const sh = makeFireShard(PIXI, { core: 0xff7a1c, spark: 0xffd24a, ring: 0xff5500 }, unit);
                    sh.x = cx; sh.y = cy; root.addChild(sh);
                    const ang = Math.random() * Math.PI * 2;
                    const dist = unit * (0.9 + Math.random() * 1.8);
                    const md = 0.9 + Math.random() * 0.5;
                    gsap.to(sh, { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist, rotation: (Math.random() - 0.5) * 7, duration: md, ease: "power2.out", onComplete: () => { try { sh.destroy(); } catch (e) { /* */ } } });
                    gsap.to(sh, { alpha: 0, duration: 0.4, delay: Math.max(0, md - 0.4), ease: "power1.in" });
                }
                for (let i = 0; i < (cinematic ? 16 : 8); i++) {
                    const em = makeEmber(PIXI, theme, unit, i % 3 === 0);
                    em.x = cx; em.y = cy; root.addChild(em);
                    const ang = Math.random() * Math.PI * 2;
                    const dist = unit * (0.6 + Math.random() * 2.0);
                    const md = 1.05 + Math.random() * 0.55;
                    gsap.to(em, { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist - unit * 0.5, duration: md, ease: "power1.out", onComplete: () => { try { em.destroy(); } catch (e) { /* */ } } });
                    gsap.to(em, { alpha: 0, duration: 0.45, delay: Math.max(0, md - 0.45), ease: "power1.in" });
                }
            }, 0.03);

            // fumaça residual
            tl.add(() => {
                for (let i = 0; i < (cinematic ? 9 : 5); i++) {
                    const pf = makeSmokePuff(PIXI, unit * 1.5, false);
                    pf.x = cx + (Math.random() - 0.5) * unit * 1.2;
                    pf.y = cy + (Math.random() - 0.5) * unit * 0.6;
                    pf.alpha = 0; pf.scale.set(0.6); root.addChild(pf);
                    gsap.to(pf, { alpha: 0.5, duration: 0.28 });
                    gsap.to(pf, { y: pf.y - unit * 1.2, duration: 1.55, ease: "sine.out", onComplete: () => { try { pf.destroy(); } catch (e) { /* */ } } });
                    gsap.to(pf.scale, { x: 2.2, y: 2.2, duration: 1.55, ease: "sine.out" });
                    gsap.to(pf, { alpha: 0, duration: 0.65, delay: 0.9, ease: "power1.in" });
                }
            }, 0.28);

            await awaitPixiTimeline(tl, root, boomDur + 0.55, { minSec: boomDur });
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /** Choque de combate (Hearthstone) — bloom + anéis + faíscas radiais e direcionais ao longo do eixo. */
    async function playCombatClash(cx, cy, outcome = {}, opts = {}) {
        const force = !!opts.force;
        if (!force && !canUse()) return false;
        const a = await ensureApp(force || !!opts.cinematic);
        if (!a || !global.PIXI) return false;

        const PIXI = global.PIXI;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(force || !!opts.cinematic);
        const perfFx = opts.fx || global.__dfFX;
        const mobile = !!(perfFx?.mobile || perfFx?.coarse || perfFx?.lowEnd);
        const heavy = !!(outcome.over || (outcome.killA && outcome.killD));
        const boost = opts.intensity ?? 1;
        const angle = opts.angle ?? 0;
        const unit = cardUnit(1);
        const container = new PIXI.Container();
        a.stage.addChild(container);

        const core = heavy ? 0xff5050 : 0xffc040;
        const ringCol = heavy ? 0xffb0b0 : 0xffe8a0;

        const bloom = new PIXI.Graphics();
        bloom.beginFill(heavy ? 0xff8060 : 0xffd070, heavy ? 0.5 : 0.42);
        bloom.drawCircle(0, 0, unit * (heavy ? 0.7 : 0.55) * boost);
        bloom.endFill();
        bloom.x = cx;
        bloom.y = cy;
        bloom.alpha = 0;
        bloom.scale.set(0.3);
        if (PIXI.BLEND_MODES) bloom.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(bloom);

        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, heavy ? 0.98 : (mobile ? 0.9 : 0.85));
        flash.drawCircle(0, 0, unit * (heavy ? (mobile ? 0.44 : 0.38) : (mobile ? 0.34 : 0.28)) * boost);
        flash.endFill();
        flash.x = cx;
        flash.y = cy;
        flash.alpha = 0;
        if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(flash);

        const rings = [];
        const ringN = heavy ? 5 : 4;
        for (let i = 0; i < ringN; i++) {
            const r = new PIXI.Graphics();
            r.lineStyle(Math.max(2.5, unit * 0.03) - i * 0.32, ringCol, 0.9 - i * 0.12);
            r.drawCircle(0, 0, unit * (0.18 + i * 0.06));
            r.x = cx;
            r.y = cy;
            r.scale.set(0.15);
            r.alpha = 0;
            if (PIXI.BLEND_MODES) r.blendMode = PIXI.BLEND_MODES.ADD;
            container.addChild(r);
            rings.push(r);
        }

        const slash = new PIXI.Graphics();
        slash.lineStyle(Math.max(3, unit * 0.034), 0xffffff, 0.92);
        slash.moveTo(-unit * 0.6, 0);
        slash.lineTo(unit * 0.6, 0);
        slash.moveTo(0, -unit * 0.6);
        slash.lineTo(0, unit * 0.6);
        slash.x = cx;
        slash.y = cy;
        slash.rotation = angle;
        slash.alpha = 0;
        if (PIXI.BLEND_MODES) slash.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(slash);

        const sparks = [];
        const sparkN = n(Math.round((heavy ? (mobile ? 36 : 30) : (mobile ? 28 : 20)) * boost));
        for (let i = 0; i < sparkN; i++) {
            const g = new PIXI.Graphics();
            const pr = unit * (0.022 + Math.random() * (mobile ? 0.06 : 0.05));
            g.beginFill(i % 2 ? core : 0xfff8e0, 0.95);
            g.drawCircle(0, 0, pr);
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx;
            g.y = cy;
            const ang = (Math.PI * 2 * i) / sparkN + (Math.random() - 0.5) * 0.35;
            const spd = (4 + Math.random() * (heavy ? (mobile ? 11 : 9) : (mobile ? 8 : 6))) * boost;
            sparks.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1.5, vr: (Math.random() - 0.5) * 0.3, life: 1 });
            container.addChild(g);
        }

        // Faíscas direcionais (lascas de metal) disparadas ao longo do eixo do combate, dos dois lados.
        const streaks = [];
        const streakN = n(mobile ? 10 : 14);
        for (let i = 0; i < streakN; i++) {
            const g = new PIXI.Graphics();
            const len = unit * (0.12 + Math.random() * 0.18);
            const wid = Math.max(1.5, unit * 0.016);
            g.beginFill(0xfff4d0, 0.95);
            g.drawRoundedRect(-len, -wid / 2, len, wid, wid);
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx;
            g.y = cy;
            const dir = angle + (i % 2 === 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
            g.rotation = dir;
            const spd = (6 + Math.random() * (mobile ? 10 : 13)) * boost;
            streaks.push({ g, vx: Math.cos(dir) * spd, vy: Math.sin(dir) * spd, life: 1 });
            container.addChild(g);
        }

        const dur = heavy ? (mobile ? 0.7 : 0.64) : (mobile ? 0.56 : 0.5);
        if (gsap && gsapBridge) {
            const tl = gsap.timeline();
            tl.to(bloom, { alpha: 1, duration: 0.05 }, 0);
            tl.to(bloom.scale, { x: (heavy ? 2.6 : 2) * boost, y: (heavy ? 2.6 : 2) * boost, duration: dur * 0.5, ease: "power2.out" }, 0);
            tl.to(bloom, { alpha: 0, duration: dur * 0.5, ease: "power2.in" }, dur * 0.22);
            tl.to(flash, { alpha: 1, duration: 0.04 }, 0);
            tl.to(flash.scale, { x: (heavy ? 5 : 3.6) * boost, y: (heavy ? 5 : 3.6) * boost, duration: dur * 0.32, ease: "power3.out" }, 0);
            tl.to(flash, { alpha: 0, duration: dur * 0.4 }, dur * 0.2);
            rings.forEach((r, i) => {
                const off = i * 0.045;
                tl.to(r, { alpha: 0.9 - i * 0.08, duration: 0.05 }, off);
                tl.to(r.scale, { x: (heavy ? 5.4 + i : 3.9 + i * 0.8) * boost, y: (heavy ? 5.4 + i : 3.9 + i * 0.8) * boost, duration: dur * 0.55, ease: "power3.out" }, off);
                tl.to(r, { alpha: 0, duration: dur * 0.35 }, off + dur * 0.25);
            });
            tl.to(slash, { alpha: 1, duration: 0.05 }, 0);
            tl.to(slash.scale, { x: 1.9, y: 1.9, duration: dur * 0.5, ease: "power2.out" }, 0.04);
            tl.to(slash, { alpha: 0, duration: dur * 0.4 }, dur * 0.14);
            const proxy = { t: 0 };
            tl.to(proxy, {
                t: 1, duration: dur, ease: "none",
                onUpdate: () => {
                    sparks.forEach((s) => {
                        s.g.x += s.vx; s.g.y += s.vy; s.vy += 0.14;
                        s.life -= 0.02; s.g.rotation += s.vr;
                        s.g.alpha = Math.max(0, s.life);
                    });
                    streaks.forEach((s) => {
                        s.g.x += s.vx; s.g.y += s.vy; s.vx *= 0.92; s.vy *= 0.92;
                        s.life -= 0.04; s.g.alpha = Math.max(0, s.life);
                    });
                },
            }, 0);
            await awaitPixiTimeline(tl, container, dur + 0.65);
        } else {
            await runEffect(dur * 1000, (t) => {
                flash.alpha = t < 0.08 ? t / 0.08 : Math.max(0, 1 - (t - 0.08) * 1.4);
                flash.scale.set(0.3 + t * 3);
                rings.forEach((r, i) => {
                    const lt = Math.max(0, t - i * 0.08);
                    r.scale.set(0.15 + lt * 3.5);
                    r.alpha = Math.max(0, 0.85 - lt * 1.1);
                });
                slash.alpha = Math.max(0, 1 - t * 1.4);
                sparks.forEach((s) => {
                    s.g.x += s.vx; s.g.y += s.vy; s.life -= 0.022;
                    s.g.alpha = Math.max(0, s.life);
                });
                streaks.forEach((s) => {
                    s.g.x += s.vx; s.g.y += s.vy; s.life -= 0.04;
                    s.g.alpha = Math.max(0, s.life);
                });
            }, () => {});
        }
        try { container.destroy({ children: true }); } catch (e) { /* */ }
        return true;
    }

    /**
     * Estilhaço GPU — burst curto (partículas).
     */
    async function playShatter(cx, cy, opts = {}) {
        return playImpactBurst(cx, cy, {
            hue: opts.hue ?? 42,
            durationMs: opts.durationMs ?? 880,
            particleCount: opts.count ?? n(22),
            rings: 2,
            intensity: 0.95,
        });
    }

    /**
     * Rede de rachaduras (Hearthstone) — segmentos ramificados a partir do ponto de impacto.
     * Coordenadas locais à carta (origem no canto superior-esquerdo); revelados em stagger na tensão.
     */
    function buildCrackNetwork(PIXI, w, h, impactX, impactY, unit) {
        const container = new PIXI.Container();
        const segments = [];
        const lineMain = Math.max(1.3, unit * 0.018);
        const lineFork = Math.max(1, unit * 0.012);
        const branches = 5 + Math.floor(Math.random() * 2);
        const maxR = Math.hypot(w, h) * 0.62;
        for (let b = 0; b < branches; b++) {
            let x = impactX;
            let y = impactY;
            let ang = (Math.PI * 2 * b) / branches + (Math.random() - 0.5) * 0.7;
            const steps = 3 + Math.floor(Math.random() * 3);
            let travelled = 0;
            for (let s = 0; s < steps; s++) {
                const len = (w * 0.1) + Math.random() * (w * 0.16);
                const nx = x + Math.cos(ang) * len;
                const ny = y + Math.sin(ang) * len;
                const g = new PIXI.Graphics();
                g.lineStyle(lineMain * (1 - s / (steps + 1)), 0xfff4d8, 0.96);
                g.moveTo(x, y);
                g.lineTo(nx, ny);
                g.alpha = 0;
                if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
                container.addChild(g);
                segments.push(g);
                if (Math.random() < 0.45 && s > 0) {
                    const fa = ang + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.8);
                    const fl = len * (0.45 + Math.random() * 0.4);
                    const fg = new PIXI.Graphics();
                    fg.lineStyle(lineFork, 0xffe7b0, 0.82);
                    fg.moveTo(x, y);
                    fg.lineTo(x + Math.cos(fa) * fl, y + Math.sin(fa) * fl);
                    fg.alpha = 0;
                    if (PIXI.BLEND_MODES) fg.blendMode = PIXI.BLEND_MODES.ADD;
                    container.addChild(fg);
                    segments.push(fg);
                }
                x = nx;
                y = ny;
                ang += (Math.random() - 0.5) * 0.9;
                travelled += len;
                if (travelled > maxR) break;
            }
        }
        return { container, segments };
    }

    /**
     * Estilhaços texturizados (Hearthstone) — grade jitterada de quadriláteros como SimpleMesh:
     * cada peça mostra o pedaço correto da arte da carta e voa do ponto de impacto.
     * Retorna null se SimpleMesh indisponível (cai no fallback de sprites/máscaras).
     */
    function buildMeshShards(PIXI, tex, w, h, cardLeft, cardTop, impactX, impactY, opts = {}) {
        if (!PIXI.SimpleMesh || !tex) return null;
        const cols = Math.max(2, opts.cols ?? 5);
        const rows = Math.max(2, opts.rows ?? 6);
        const jitter = opts.jitter ?? 0.34;
        const baseSpeed = opts.speed ?? 5.4;
        const cellW = w / cols;
        const cellH = h / rows;
        const pts = [];
        for (let r = 0; r <= rows; r++) {
            const row = [];
            for (let c = 0; c <= cols; c++) {
                let px = c * cellW;
                let py = r * cellH;
                if (r > 0 && c > 0 && r < rows && c < cols) {
                    px += (Math.random() - 0.5) * cellW * jitter;
                    py += (Math.random() - 0.5) * cellH * jitter;
                }
                row.push({ x: px, y: py });
            }
            pts.push(row);
        }
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        const shards = [];
        const halfSpan = Math.max(w, h) * 0.5;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const A = pts[r][c];
                const B = pts[r][c + 1];
                const C = pts[r + 1][c + 1];
                const D = pts[r + 1][c];
                const mx = (A.x + B.x + C.x + D.x) / 4;
                const my = (A.y + B.y + C.y + D.y) / 4;
                const verts = new Float32Array([
                    A.x - mx, A.y - my,
                    B.x - mx, B.y - my,
                    C.x - mx, C.y - my,
                    D.x - mx, D.y - my,
                ]);
                const uvs = new Float32Array([
                    A.x / w, A.y / h,
                    B.x / w, B.y / h,
                    C.x / w, C.y / h,
                    D.x / w, D.y / h,
                ]);
                let mesh;
                try {
                    mesh = new PIXI.SimpleMesh(tex, verts, uvs, indices);
                } catch (e) {
                    return null;
                }
                const sx = cardLeft + mx;
                const sy = cardTop + my;
                mesh.x = sx;
                mesh.y = sy;
                mesh.alpha = 0;
                const dx = sx - impactX;
                const dy = sy - impactY;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const dirx = dx / dist;
                const diry = dy / dist;
                const norm = Math.min(1.4, dist / halfSpan);
                const spd = baseSpeed * (0.5 + norm) * (0.82 + Math.random() * 0.5);
                shards.push({
                    spr: mesh,
                    vx: dirx * spd + (Math.random() - 0.5) * 1.8,
                    vy: diry * spd - (2.2 + Math.random() * 2.8),
                    vr: (Math.random() - 0.5) * 0.55,
                });
            }
        }
        return shards;
    }

    /**
     * Destruição de campeão estilo Hearthstone — tensão com rachaduras, flash e hit-stop,
     * estilhaços texturizados (malha irregular), ondas de choque, faíscas, brasas e fumaça.
     */
    async function playCardDestroy(cx, cy, snap, opts = {}) {
        const force = !!opts.force;
        if (!force && !canUse()) return false;
        setQuality("full");
        global.DfGsapBridge?.setQuality?.("full");
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const perfFx = opts.fx || global.__dfFX;
        const mobile = !!(perfFx?.mobile || perfFx?.coarse || perfFx?.lowEnd);
        const combatKill = !!opts.combatKill || !!opts.cinematic;
        const w = snap?.combatW ?? snap?.width ?? 72;
        const h = snap?.combatH ?? snap?.height ?? 100;
        const unit = cardUnit(1);
        const radius = Math.max(6, w * 0.08);
        const totalDur = combatKill ? (mobile ? 0.74 : 0.9) : (mobile ? 0.82 : 1.02);
        const shatterAt = combatKill ? 0.1 : 0.2;
        const sceneCoords = !!opts.sceneCoords;
        let sceneFrame = null;
        const inBarrage = !!_magicMissilesBarrage;

        try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }

        let shakeWrap = null;
        let cardTex = null;
        let tl = null;
        try {
        if (sceneCoords && !inBarrage) {
            beginPixiTargetScene(a);
        } else if (sceneCoords && inBarrage) {
            pixiFullscreenScene = true;
            syncPixiFullscreenScene(a);
        } else {
            sceneFrame = pixiSceneFrame(a);
            const mp = sceneFrame.map(cx, cy);
            cx = mp.x;
            cy = mp.y;
        }

        shakeWrap = new PIXI.Container();
        getVfxStageParent(a).addChild(shakeWrap);
        const wrap = new PIXI.Container();
        shakeWrap.addChild(wrap);

        let card = opts.existingCard;
        if (card && card.destroyed) card = null;
        if (card) {
            card.x = cx;
            card.y = cy;
            card.visible = true;
            card.alpha = 1;
            card.rotation = 0;
            card.scale.set(1, 1);
            wrap.addChild(card);
        } else {
            card = await buildCombatCardSprite(PIXI, snap, w, h);
            card.x = cx;
            card.y = cy;
            wrap.addChild(card);
        }

        const glow = new PIXI.Graphics();
        glow.beginFill(0xffb830, 0.42);
        glow.drawRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, radius + 5);
        glow.endFill();
        glow.x = cx;
        glow.y = cy;
        glow.alpha = 0;
        glow.scale.set(0.88);
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(glow);

        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, 1);
        flash.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
        flash.endFill();
        flash.x = cx;
        flash.y = cy;
        flash.alpha = 0;
        if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(flash);

        const ring = new PIXI.Graphics();
        ring.lineStyle(Math.max(2.5, unit * 0.03), 0xffe8a0, 0.92);
        ring.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
        ring.x = cx;
        ring.y = cy;
        ring.alpha = 0;
        ring.scale.set(0.9);
        if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(ring);

        const shock = [];
        const shockN = mobile ? 2 : 3;
        for (let i = 0; i < shockN; i++) {
            const sg = new PIXI.Graphics();
            sg.lineStyle(Math.max(2, unit * 0.03) - i * 0.4, 0xffe6a0, 0.9 - i * 0.12);
            sg.drawCircle(0, 0, unit * (0.22 + i * 0.08));
            sg.x = cx;
            sg.y = cy;
            sg.alpha = 0;
            sg.scale.set(0.2);
            if (PIXI.BLEND_MODES) sg.blendMode = PIXI.BLEND_MODES.ADD;
            wrap.addChild(sg);
            shock.push(sg);
        }

        const crackImpactX = w * (0.42 + Math.random() * 0.16);
        const crackImpactY = h * (0.4 + Math.random() * 0.18);
        const crackNet = buildCrackNetwork(PIXI, w, h, crackImpactX, crackImpactY, unit);
        crackNet.container.x = cx - w / 2;
        crackNet.container.y = cy - h / 2;
        wrap.addChild(crackNet.container);

        const shardLayer = new PIXI.Container();
        wrap.addChild(shardLayer);

        const skipCap = !!(opts.skipGenerateTexture || (combatKill && opts.existingCard));
        if (!skipCap) {
        try {
            const capWrap = new PIXI.Container();
            const capCard = await buildCombatCardSprite(PIXI, snap, w, h);
            capCard.x = w / 2;
            capCard.y = h / 2;
            capWrap.addChild(capCard);
            const texRes = a.renderer.resolution || 1;
            cardTex = await Promise.race([
                Promise.resolve(a.renderer.generateTexture(capWrap, {
                    width: w,
                    height: h,
                    resolution: texRes,
                })),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error("destroy tex timeout")),
                    mobile ? 900 : 420,
                )),
            ]);
            try { capWrap.destroy({ children: true }); } catch (e) { /* */ }
        } catch (e) { /* fallback sem captura */ }
        }

        const cols = mobile ? 4 : 5;
        const rows = mobile ? 5 : 6;
        const cardLeft = cx - w / 2;
        const cardTop = cy - h / 2;
        let shards = cardTex
            ? buildMeshShards(PIXI, cardTex, w, h, cardLeft, cardTop, cx, cy, {
                cols, rows, speed: mobile ? 4.6 : 5.8,
            })
            : null;
        if (shards) {
            shards.forEach((sh) => shardLayer.addChild(sh.spr));
        } else {
            shards = [];
            const cellW = w / cols;
            const cellH = h / rows;
            if (cardTex) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const frame = new PIXI.Rectangle(c * cellW, r * cellH, cellW, cellH);
                        const shardTex = new PIXI.Texture(cardTex.baseTexture, frame);
                        const spr = new PIXI.Sprite(shardTex);
                        spr.anchor.set(0.5);
                        spr.x = cx + (c + 0.5) * cellW - w / 2;
                        spr.y = cy + (r + 0.5) * cellH - h / 2;
                        spr.alpha = 0;
                        const dx = spr.x - cx;
                        const dy = spr.y - cy;
                        const dist = Math.max(1, Math.hypot(dx, dy));
                        const spd = 2.8 + Math.random() * (mobile ? 3.2 : 5.2);
                        shardLayer.addChild(spr);
                        shards.push({
                            spr,
                            vx: (dx / dist) * spd + (Math.random() - 0.5) * 1.4,
                            vy: (dy / dist) * spd - 3.2 + (Math.random() - 0.5) * 1.1,
                            vr: (Math.random() - 0.5) * 0.55,
                        });
                    }
                }
            } else {
                for (let side = 0; side < 2; side++) {
                    const spr = await buildCombatCardSprite(PIXI, snap, w, h);
                    spr.x = cx;
                    spr.y = cy;
                    spr.alpha = 0;
                    const mask = new PIXI.Graphics();
                    if (side === 0) {
                        mask.beginFill(0xffffff);
                        mask.drawPolygon([
                            -w / 2, -h / 2,
                            w * 0.08, -h / 2,
                            -w / 2, h / 2,
                        ]);
                        mask.endFill();
                    } else {
                        mask.beginFill(0xffffff);
                        mask.drawPolygon([
                            w * 0.08, -h / 2,
                            w / 2, -h / 2,
                            w / 2, h / 2,
                            -w / 2, h / 2,
                        ]);
                        mask.endFill();
                    }
                    spr.mask = mask;
                    mask.x = cx;
                    mask.y = cy;
                    wrap.addChild(mask);
                    shardLayer.addChild(spr);
                    shards.push({
                        spr,
                        vx: side === 0 ? -4.5 : 4.5,
                        vy: -1.5 + Math.random(),
                        vr: side === 0 ? -0.6 : 0.6,
                    });
                }
            }
        }

        const sparks = [];
        const dust = [];
        const sparkN = n(combatKill ? (mobile ? 26 : 38) : (mobile ? 18 : 30));
        for (let i = 0; i < sparkN; i++) {
            const g = new PIXI.Graphics();
            const pr = unit * (0.01 + Math.random() * 0.02);
            g.beginFill(i % 4 === 0 ? 0xffa030 : 0xfff8d8, 0.98);
            g.drawCircle(0, 0, pr);
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx;
            g.y = cy;
            g.alpha = 0;
            wrap.addChild(g);
            const ang = (Math.PI * 2 * i) / sparkN + (Math.random() - 0.5) * 0.55;
            const spd = 4 + Math.random() * (mobile ? 7 : 10);
            sparks.push({
                g,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 2.2,
                vr: (Math.random() - 0.5) * 0.4,
                life: 0,
            });
        }
        const dustN = n(mobile ? 8 : 14);
        for (let i = 0; i < dustN; i++) {
            const g = new PIXI.Graphics();
            g.beginFill(0xd8c8a0, 0.55);
            g.drawCircle(0, 0, unit * (0.025 + Math.random() * 0.04));
            g.endFill();
            g.x = cx + (Math.random() - 0.5) * w * 0.5;
            g.y = cy + (Math.random() - 0.5) * h * 0.5;
            g.alpha = 0;
            wrap.addChild(g);
            dust.push({
                g,
                vx: (Math.random() - 0.5) * 2.2,
                vy: -1.5 - Math.random() * 2.5,
                life: 0,
            });
        }

        const embers = [];
        const emberN = n(mobile ? 10 : 16);
        for (let i = 0; i < emberN; i++) {
            const g = new PIXI.Graphics();
            g.beginFill(i % 3 === 0 ? 0xffcf6a : 0xff8a2a, 0.95);
            g.drawCircle(0, 0, unit * (0.015 + Math.random() * 0.03));
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx + (Math.random() - 0.5) * w * 0.6;
            g.y = cy + (Math.random() - 0.5) * h * 0.6;
            g.alpha = 0;
            wrap.addChild(g);
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
            const spd = 1.6 + Math.random() * 3.2;
            embers.push({
                g,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 1.4,
                life: 0,
                flick: Math.random() * 6,
            });
        }
        const smoke = [];
        const smokeN = n(mobile ? 5 : 9);
        for (let i = 0; i < smokeN; i++) {
            const g = makeSmokePuff(PIXI, unit, false);
            g.x = cx + (Math.random() - 0.5) * w * 0.55;
            g.y = cy + (Math.random() - 0.5) * h * 0.45;
            g.alpha = 0;
            g.scale.set(0.4 + Math.random() * 0.4);
            wrap.addChild(g);
            smoke.push({
                g,
                vx: (Math.random() - 0.5) * 1.4,
                vy: -1 - Math.random() * 1.8,
                life: 0,
                grow: 1 + Math.random() * 0.8,
            });
        }

        tl = await gsapBridge.createTimeline({}, true);
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        tl.to(card.scale, { x: combatKill ? 1.06 : 1.05, y: combatKill ? 1.06 : 1.05, duration: shatterAt, ease: "power1.inOut" }, 0);
        tl.to(glow, { alpha: combatKill ? 0.8 : 0.72, duration: shatterAt * 0.9, ease: "sine.out" }, 0);
        tl.to(glow.scale, { x: 1.12, y: 1.12, duration: shatterAt, ease: "sine.out" }, 0);
        if (crackNet.segments.length) {
            tl.to(crackNet.segments, {
                alpha: 1,
                duration: Math.max(0.04, shatterAt * 0.5),
                ease: "none",
                stagger: { each: Math.max(0.004, (shatterAt * 0.85) / crackNet.segments.length), from: "start" },
            }, 0);
        }
        const tremorProxy = { p: 0 };
        tl.to(tremorProxy, {
            p: 1,
            duration: shatterAt,
            ease: "none",
            onUpdate: () => {
                const s = tremorProxy.p * (mobile ? 2.4 : 3.2);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, 0);

        tl.to(card.scale, { x: 1.16, y: 1.16, duration: 0.05, ease: "expo.out" }, shatterAt - 0.04);
        tl.to(flash, { alpha: 1, duration: 0.03, ease: "power2.in" }, shatterAt - 0.02);
        tl.to(flash.scale, { x: 1.24, y: 1.24, duration: 0.09, ease: "expo.out" }, shatterAt - 0.02);

        tl.to(shakeWrap, { x: -6, duration: 0.026, ease: "none" }, shatterAt);
        tl.to(shakeWrap, { x: 7, duration: 0.026, ease: "none" }, shatterAt + 0.026);
        tl.to(shakeWrap, { x: -3, duration: 0.026, ease: "none" }, shatterAt + 0.052);
        tl.to(shakeWrap, { x: 0, y: 0, duration: 0.04, ease: "power2.out" }, shatterAt + 0.078);

        shock.forEach((sg, i) => {
            const off = i * 0.05;
            tl.to(sg, { alpha: 0.85 - i * 0.12, duration: 0.04 }, shatterAt + off);
            tl.to(sg.scale, {
                x: (mobile ? 3.6 : 4.6) + i * 1.1, y: (mobile ? 3.6 : 4.6) + i * 1.1,
                duration: totalDur * 0.5, ease: "power2.out",
            }, shatterAt + off);
            tl.to(sg, { alpha: 0, duration: totalDur * 0.34, ease: "power2.in" }, shatterAt + off + totalDur * 0.16);
        });

        tl.to(ring, { alpha: 0.9, duration: 0.03 }, shatterAt);
        tl.to(ring.scale, { x: 1.7, y: 1.7, duration: totalDur * 0.4, ease: "power2.out" }, shatterAt);
        tl.to(ring, { alpha: 0, duration: totalDur * 0.3, ease: "power2.in" }, shatterAt + totalDur * 0.14);

        tl.add(() => {
            card.visible = false;
            crackNet.container.visible = false;
            glow.visible = false;
            shards.forEach((sh) => { sh.spr.alpha = 1; });
            sparks.forEach((s) => { s.g.alpha = 1; s.life = 1; });
            dust.forEach((d) => { d.g.alpha = 0.7; d.life = 1; });
            embers.forEach((e) => { e.g.alpha = 1; e.life = 1; });
            smoke.forEach((sm) => { sm.g.alpha = 0.5; sm.life = 1; });
            try { global.sfx?.("champion_destroy"); } catch (e) { /* */ }
        }, shatterAt);

        const fxProxy = { t: 0 };
        tl.to(fxProxy, {
            t: 1,
            duration: totalDur - shatterAt,
            ease: "none",
            onUpdate: () => {
                const t = fxProxy.t;
                const fade = Math.max(0, 1 - t * t * 1.05);
                shards.forEach((sh) => {
                    sh.spr.x += sh.vx;
                    sh.spr.y += sh.vy;
                    sh.vy += 0.26;
                    sh.vx *= 0.97;
                    sh.vy *= 0.97;
                    sh.spr.rotation += sh.vr;
                    sh.spr.alpha = fade;
                    const sc = 1 - t * 0.28;
                    sh.spr.scale.set(sc, sc);
                });
                sparks.forEach((s) => {
                    s.g.x += s.vx;
                    s.g.y += s.vy;
                    s.vy += 0.18;
                    s.g.rotation += s.vr;
                    s.life -= 0.026;
                    s.g.alpha = Math.max(0, s.life);
                });
                dust.forEach((d) => {
                    d.g.x += d.vx;
                    d.g.y += d.vy;
                    d.vy += 0.08;
                    d.life -= 0.018;
                    d.g.alpha = Math.max(0, d.life * 0.65);
                });
                embers.forEach((e) => {
                    e.g.x += e.vx;
                    e.g.y += e.vy;
                    e.vy += 0.05;
                    e.vx *= 0.985;
                    e.life -= 0.02;
                    e.flick += 0.5;
                    e.g.alpha = Math.max(0, e.life) * (0.6 + Math.sin(e.flick) * 0.4);
                });
                smoke.forEach((sm) => {
                    sm.g.x += sm.vx;
                    sm.g.y += sm.vy;
                    sm.vy *= 0.99;
                    sm.life -= 0.014;
                    const gsc = sm.g.scale.x + 0.02 * sm.grow;
                    sm.g.scale.set(gsc, gsc);
                    sm.g.alpha = Math.max(0, sm.life) * 0.42;
                });
                flash.alpha = Math.max(0, 0.85 * (1 - t * 2.2));
            },
        }, shatterAt);

        tl.to(flash, { alpha: 0, duration: totalDur * 0.22, ease: "power2.in" }, shatterAt + 0.05);

        const played = await combatPhaseTimeout(
            gsapBridge.timelineToPromise(tl),
            totalDur + 0.28,
        );
        return !!played;
        } catch (e) {
            console.warn("[playCardDestroy]", e);
            return false;
        } finally {
            try { tl?.kill?.(); } catch (e) { /* */ }
            try { if (cardTex) cardTex.destroy(true); } catch (e) { /* */ }
            try { shakeWrap?.destroy({ children: true }); } catch (e) { /* */ }
            if (sceneFrame) sceneFrame.end();
            else if (sceneCoords && !inBarrage) endPixiTargetScene(a);
            if (inBarrage) {
                pixiFullscreenScene = true;
                syncPixiFullscreenScene(a);
                try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
                clearNonBarrageStageChildren();
            } else {
                sweepOrphanScenes();
            }
        }
    }

    function resolveCardArtUrl(cardName, snap) {
        const name = cardName || snap?.cardName || snap?.name;
        return artUrlFromSnap({
            ...(snap && typeof snap === "object" ? snap : {}),
            name,
            cardName: name,
        });
    }

    function artUrlFromSnap(snap) {
        if (!snap) return null;
        const cardName = snap.cardName || snap.name;
        if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
            // Face COM o Poder assado: o número fica idêntico ao da carta parada
            // e acompanha a carta na animação (sem badge separado que deforma).
            const pow = snap.currentPower ?? snap.power ?? snap.basePower;
            const baked = global.DfCardFace.getFaceDataUrl?.(cardName, pow);
            if (baked) return baked;
            if (snap.artSrc && String(snap.artSrc).indexOf("data:image") === 0) return snap.artSrc;
            return null;
        }
        if (snap.artSrc) return snap.artSrc;
        const m = snap.cardArtCss?.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
        if (m?.[1]) return m[1];
        if (cardName && global.dfPrimaryCardArtSrc) return global.dfPrimaryCardArtSrc(cardName);
        return null;
    }

    /**
     * Fallback: só quando não há textura de face (placeholder). Mesmas ratios do
     * canvas de `df-card-face` (renderToCanvas) — sem contorno preto e sem
     * counter-scale, pra o número não mudar de aparência durante a animação.
     */
    function attachCombatStaticPowerBadge(PIXI, root, w, h, powVal) {
        if (powVal == null || !Number.isFinite(+powVal) || !PIXI?.Text) return;
        const badge = new PIXI.Text(String(+powVal), {
            fontFamily: 'Fredoka, "Segoe UI", Arial, sans-serif',
            fontWeight: "800",
            fontSize: Math.max(10, Math.round(h * 0.075)),
            fill: 0xffffff,
            align: "center",
        });
        badge.anchor.set(0.5);
        badge.x = -w / 2 + w * 0.105;
        badge.y = -h / 2 + h * 0.083;
        badge.dfStaticPower = true;
        root.addChild(badge);
    }

    /** O Poder acompanha a carta (escala junto) — nunca counter-scale. */
    function syncCombatStaticPower(_card) { /* no-op */ }

    async function buildCombatCardSprite(PIXI, snap, w, h, buildOpts = {}) {
        const root = new PIXI.Container();
        const radius = Math.max(6, w * 0.08);
        const url = artUrlFromSnap(snap);
        const texWait = buildOpts.texWaitSec ?? 0.85;

        const powVal = snap?.currentPower ?? snap?.power;
        const base = snap?.basePower ?? snap?.power ?? powVal;
        const cardName = snap?.cardName || snap?.name;
        const composed = global.DfCardFace?.isComposed?.(cardName || snap);

        if (composed && global.DfCardFace) {
            // Face COM o Poder assado: idêntica à carta parada, sem badge à parte.
            const faceOpts = { power: powVal };
            const bake = global.DfCardFace.getFaceBakeSource?.(cardName, powVal, faceOpts);
            if (bake && PIXI?.Texture?.from) {
                try {
                    const tex = PIXI.Texture.from(bake);
                    if (tex) {
                        const mask = new PIXI.Graphics();
                        mask.beginFill(0xffffff);
                        mask.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
                        mask.endFill();
                        root.addChild(mask);
                        const art = new PIXI.Sprite(tex);
                        art.anchor.set(0.5);
                        art.width = w;
                        art.height = h;
                        art.mask = mask;
                        root.addChild(art);
                        root.visible = true;
                        root.alpha = 1;
                        return root;
                    }
                } catch (e) { /* fallback dataURL */ }
            }
            let faceUrl = global.DfCardFace.getFaceDataUrl?.(cardName, powVal, faceOpts) || null;
            if (!faceUrl && global.DfCardFace.warmFace) {
                try {
                    faceUrl = await Promise.race([
                        global.DfCardFace.warmFace(
                            { ...(snap || {}), name: cardName, currentPower: powVal, power: base },
                            faceOpts,
                        ),
                        combatWaitSec(texWait).then(() => ""),
                    ]) || null;
                } catch (e) { faceUrl = null; }
            }
            // Após warm, preferir bake (ImageBitmap) antes de dataURL.
            const bake2 = global.DfCardFace.getFaceBakeSource?.(cardName, powVal, faceOpts);
            if (bake2 && PIXI?.Texture?.from) {
                try {
                    const tex = PIXI.Texture.from(bake2);
                    if (tex) {
                        const mask = new PIXI.Graphics();
                        mask.beginFill(0xffffff);
                        mask.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
                        mask.endFill();
                        root.addChild(mask);
                        const art = new PIXI.Sprite(tex);
                        art.anchor.set(0.5);
                        art.width = w;
                        art.height = h;
                        art.mask = mask;
                        root.addChild(art);
                        root.visible = true;
                        root.alpha = 1;
                        return root;
                    }
                } catch (e) { /* */ }
            }
            if (faceUrl) {
                const tex = await Promise.race([
                    loadTexture(faceUrl),
                    combatWaitSec(texWait).then(() => null),
                ]);
                if (tex) {
                    const mask = new PIXI.Graphics();
                    mask.beginFill(0xffffff);
                    mask.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
                    mask.endFill();
                    root.addChild(mask);
                    const art = new PIXI.Sprite(tex);
                    art.anchor.set(0.5);
                    art.width = w;
                    art.height = h;
                    art.mask = mask;
                    root.addChild(art);
                    root.visible = true;
                    root.alpha = 1;
                    return root;
                }
            }
            // Placeholder neutro — sem arte antiga v2.
            if (!root.children.length) {
                const frame = new PIXI.Graphics();
                frame.lineStyle(2, 0x5a9ed4, 1);
                frame.beginFill(0x3a6fa0, 1);
                frame.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
                frame.endFill();
                root.addChild(frame);
                attachCombatStaticPowerBadge(PIXI, root, w, h, powVal);
            }
            return root;
        }

        if (url) {
            const tex = await Promise.race([
                loadTexture(url),
                combatWaitSec(texWait).then(() => null),
            ]);
            if (tex) {
                const mask = new PIXI.Graphics();
                mask.beginFill(0xffffff);
                mask.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
                mask.endFill();
                root.addChild(mask);

                const art = new PIXI.Sprite(tex);
                art.anchor.set(0.5);
                const frameW = tex.orig?.width ?? tex.frame?.width ?? tex.width ?? 1;
                const frameH = tex.orig?.height ?? tex.frame?.height ?? tex.height ?? 1;
                // "contain": a carta inteira aparece no voo/combate. Com "cover"
                // uma arte de proporção diferente entrava cortada.
                const scale = Math.min(w / frameW, h / frameH);
                art.scale.set(scale);
                art.mask = mask;
                root.addChild(art);
                root.visible = true;
                root.alpha = 1;
            }
        }

        if (!root.children.length) {
            const frame = new PIXI.Graphics();
            frame.lineStyle(2, 0x5a9ed4, 1);
            frame.beginFill(0x3a6fa0, 1);
            frame.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
            frame.endFill();
            root.addChild(frame);
        }

        // Joias só em cartas legadas (PNG completa). Compostas já mostram o número na face.
        if (!composed && powVal != null && Number.isFinite(+powVal) && +powVal !== +base && global.dfAssetUrl) {
            const gemN = Math.min(10, Math.max(1, +powVal));
            try {
                const gemUrl = global.dfAssetUrl(`gems/${gemN}.png`);
                if (gemUrl) {
                    const gemTex = await Promise.race([
                        loadTexture(gemUrl),
                        combatWaitSec(0.35).then(() => null),
                    ]);
                    if (gemTex) {
                        const gemSize = w * 0.24;
                        const gem = new PIXI.Sprite(gemTex);
                        gem.anchor.set(0.5);
                        gem.scale.set(gemSize / Math.max(gemTex.width, 1));
                        gem.x = -w / 2 + w * 0.01 + gemSize * 0.5;
                        gem.y = -h / 2 + h * 0.015 + gemSize * 0.5;
                        root.addChild(gem);
                    }
                }
            } catch (e) { /* */ }
        }

        return root;
    }

    /** Invocação — sprite vivo (sem rasterizar; evita achatamento/pixelização no mobile). */
    async function buildSummonFlySprite(PIXI, _renderer, snap, w, h) {
        return buildCombatCardSprite(PIXI, snap, w, h, { texWaitSec: 2.5 });
    }

    function scheduleCardFly(tl, card, x0, y0, x1, y1, duration, opts, position) {
        const arc = opts.arc ?? 36;
        const scalePeak = opts.scalePeak ?? 1.14;
        const skipScale = opts.skipScale === true;
        const lean = opts.lean ?? 0;
        const faceRot = opts.faceRot ?? null;
        const keepUpright = opts.keepUpright === true;
        const proxy = { p: 0 };
        const baseSc = card.scale?.x ?? 1;
        const rot0 = card.rotation ?? 0;
        const rot1 = faceRot != null ? faceRot : rot0;
        tl.to(proxy, {
            p: 1,
            duration,
            ease: opts.ease || "power2.inOut",
            onUpdate: () => {
                const e = proxy.p;
                card.x = x0 + (x1 - x0) * e;
                card.y = y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * arc;
                if (keepUpright) {
                    card.rotation = 0;
                } else if (faceRot != null) {
                    card.rotation = rot0 + (rot1 - rot0) * e;
                } else if (lean) {
                    card.rotation = (lean * Math.sin(Math.PI * e) * Math.PI) / 180;
                } else {
                    card.rotation = 0;
                }
                if (!skipScale) {
                    card.scale.set(baseSc * (1 + (scalePeak - 1) * Math.sin(Math.PI * e)));
                }
                syncCombatStaticPower(card);
            },
        }, position);
    }

    function combatWaitSec(sec) {
        return new Promise((r) => setTimeout(r, Math.max(0, sec * 1000)));
    }

    function combatPhaseTimeout(promise, sec) {
        return Promise.race([
            promise.then(() => true, () => false),
            combatWaitSec(sec).then(() => false),
        ]);
    }

    /**
     * Toda cena Pixi+GSAP DEVE usar isto: se a timeline travar (aba em
     * background, GSAP morto, race timeout), o container é destruído na mesma.
     * opts.minSec — não destrói o root antes deste tempo (animações que
     * precisam "respirar" na tela, ex.: Explosão ~2s).
     */
    async function awaitPixiTimeline(tl, root, maxSec, opts = {}) {
        const gsapBridge = global.DfGsapBridge;
        const destroyRoot = opts.destroyRoot !== false;
        const minSec = Math.max(0, Number(opts.minSec) || 0);
        const maxMs = Math.max(500, Math.round((maxSec ?? 3) * 1000));
        const minMs = Math.round(minSec * 1000);
        const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        let watchdog = 0;
        try {
            if (!tl || !gsapBridge) return false;
            await Promise.race([
                gsapBridge.timelineToPromise(tl),
                new Promise((res) => { watchdog = setTimeout(res, maxMs); }),
            ]);
            if (minMs > 0) {
                const elapsed = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0;
                if (elapsed < minMs) {
                    await new Promise((res) => global.setTimeout(res, minMs - elapsed));
                }
            }
            return true;
        } catch (e) {
            return false;
        } finally {
            if (watchdog) clearTimeout(watchdog);
            try { tl?.kill?.(); } catch (e) { /* */ }
            if (destroyRoot && root) {
                try { root.destroy?.({ children: true }); } catch (e) { /* */ }
            }
        }
    }

    /** Remove containers Pixi órfãos quando não há combate em curso. */
    function sweepOrphanScenes() {
        if (combatSceneActive) return;
        try {
            if (global.document?.body?.classList?.contains("df-ult-cinematic")) return;
        } catch (e) { /* */ }
        if (_magicMissilesBarrage) {
            clearNonBarrageStageChildren();
            return;
        }
        const kids = app?.stage?.children?.length || 0;
        // Watchdog: contador preso sem filhos, ou idle demasiado longo.
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (targetSceneActive > 0 && kids === 0) {
            targetSceneActive = 0;
            targetSceneStartedAt = 0;
            pixiFullscreenScene = false;
            try { if (app) ensurePixiViewportLayout(app); } catch (e) { /* */ }
            return;
        }
        if (targetSceneActive > 0 && targetSceneStartedAt > 0 && (now - targetSceneStartedAt) > 12000) {
            targetSceneActive = 0;
            targetSceneStartedAt = 0;
            try { clearStage(); } catch (e) { /* */ }
            try { global.DfGsapBridge?.killAll?.(); } catch (e) { /* */ }
            return;
        }
        // Cena ultimate/alvo ativa: NÃO limpar o palco (Eurávia mid-flight).
        if (targetSceneActive > 0) return;
        if (!kids) return;
        try { clearStage(); } catch (e) { /* */ }
    }

    /** Palco pai para VFX — durante barragem, filhos vão no wrap (não no stage raiz). */
    function getVfxStageParent(a) {
        if (_magicMissilesBarrage?.wrap) return _magicMissilesBarrage.wrap;
        return a?.stage;
    }

    /** Limpa filhos do stage exceto o wrap da barragem de Mísseis Mágicos. */
    function clearNonBarrageStageChildren() {
        if (!app?.stage) return;
        const keep = _magicMissilesBarrage?.wrap;
        if (!keep) return;
        try {
            const orphans = app.stage.children.filter((ch) => ch !== keep);
            orphans.forEach((ch) => {
                app.stage.removeChild(ch);
                try { ch.destroy?.({ children: true }); } catch (e) { /* */ }
            });
            if (orphans.length > 0) {
                try { app.renderer?.render?.(app.stage); } catch (e) { /* */ }
            }
        } catch (e) { /* */ }
    }

    let combatSceneActive = false;

    function isCombatSceneActive() {
        return combatSceneActive;
    }

    /** Abort hard do combate GPU — para hang/fallback sem deixar sprite voando (duplicata). */
    function abortCombatScene() {
        combatSceneActive = false;
        try { global.DfGsapBridge?.killAll?.(); } catch (e) { /* */ }
        try { clearStage(); } catch (e) { /* */ }
        try {
            const a = app;
            if (a?.view) {
                // MP: não ocultar o canvas se o DOM está oculto — pode deixar
                // campeões invisíveis (tela preta) se a animação falhar durante
                // ocultação. Deixar visível pra fallback restaurar correctamente.
                a.view.style.opacity = "1";
                a.view.style.visibility = "visible";
            }
        } catch (e) { /* */ }
        try { ensurePixiViewportLayout?.(app); } catch (e) { /* */ }
        if (pendingQualityDestroy && quality !== "full") destroyAppForLite();
        try { global.__dfFlushUI?.(); } catch (e) { /* */ }
    }

    // Conta cenas Pixi de alvo (ultimates/habilidades/invocação) em andamento.
    // Balanceado por beginPixiTargetScene/endPixiTargetScene (e pelo
    // DfTargetLevitate, que pareia pixiSceneFrame + frame.end()).
    let targetSceneActive = 0;
    let targetSceneStartedAt = 0;
    function isAnySceneActive() {
        return combatSceneActive || targetSceneActive > 0;
    }
    function reconcileSceneCounter() {
        const kids = app?.stage?.children?.length || 0;
        if (combatSceneActive || _magicMissilesBarrage) return targetSceneActive;
        if (kids === 0 && targetSceneActive !== 0) {
            targetSceneActive = 0;
            targetSceneStartedAt = 0;
        }
        return targetSceneActive;
    }
    function stageChildCount() {
        return app?.stage?.children?.length || 0;
    }
    /** Limpa o palco Pixi à força. force:true ignora contador preso (anti-freeze). */
    function forceClearStage(opts) {
        const hard = !!(opts && opts.force);
        // Nunca apagar a barragem de Mísseis no meio da sequência (salvo hard).
        if (_magicMissilesBarrage && !hard) {
            clearNonBarrageStageChildren();
            return;
        }
        if (!hard) {
            try {
                if (targetSceneActive > 0) {
                    const age = targetSceneStartedAt
                        ? ((typeof performance !== "undefined" && performance.now)
                            ? performance.now() : Date.now()) - targetSceneStartedAt
                        : 99999;
                    // Cena viva recente: não limpar. Contador órfão (>5s): limpa.
                    if (age < 5000) return;
                }
                if (global.document?.body?.classList?.contains("df-ult-cinematic")) {
                    const age = targetSceneStartedAt
                        ? ((typeof performance !== "undefined" && performance.now)
                            ? performance.now() : Date.now()) - targetSceneStartedAt
                        : 99999;
                    if (age < 8000) return;
                }
            } catch (e) { /* */ }
        }
        if (hard && _magicMissilesBarrage) {
            try { _magicMissilesBarrage = null; } catch (e) { /* */ }
        }
        try { clearStage(); } catch (e) { /* */ }
        combatSceneActive = false;
        targetSceneActive = 0;
        targetSceneStartedAt = 0;
        pixiFullscreenScene = false;
        try { global.DfGsapBridge?.killAll?.(); } catch (e) { /* */ }
        trimTextureCaches();
        try {
            const a = app;
            if (a?.view) {
                a.view.style.pointerEvents = "none";
                a.view.style.opacity = "0";
            }
        } catch (e) { /* */ }
        try { ensurePixiViewportLayout?.(app); } catch (e) { /* */ }
        try { global.__dfFlushUI?.(); } catch (e) { /* */ }
    }

    function getCombatClipRect() {
        if (pixiFullscreenScene) {
            return { left: 0, top: 0, width: global.innerWidth, height: global.innerHeight };
        }
        if (canvasFieldLayout()) {
            return { left: 0, top: 0, width: CANVAS_W, height: CANVAS_H };
        }
        if (!global.DfLayout?.isCanvasFieldLayout?.()) return null;
        const game = global.document.getElementById("game");
        const anchor = (game && game.classList.contains("active")) ? game : global.document.getElementById("df-scale-root");
        const r = anchor?.getBoundingClientRect?.();
        if (!r || r.width < 8 || r.height < 8) return null;
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    }

    function mapCombatPoint(vx, vy, rect) {
        // Cena cinematográfica em tela cheia: Pixi cobre o viewport → identidade.
        if (pixiFullscreenScene) return { x: vx, y: vy };
        if (canvasFieldLayout() && global.DfLayout?.viewportToCanvas) {
            return global.DfLayout.viewportToCanvas(vx, vy);
        }
        const r = rect || combatClipRect;
        if (!r) return { x: vx, y: vy };
        return { x: vx - r.left, y: vy - r.top };
    }

    function mapCombatGeo(geo) {
        if (!combatClipRect || !geo) return geo;
        const pt = (x, y) => mapCombatPoint(x, y, combatClipRect);
        const a0 = pt(geo.ax, geo.ay);
        const d0 = pt(geo.dx, geo.dy);
        const ae = pt(geo.attEndX, geo.attEndY);
        const de = pt(geo.defEndX, geo.defEndY);
        const cl = pt(geo.clashX, geo.clashY);
        return Object.assign({}, geo, {
            ax: a0.x, ay: a0.y,
            dx: d0.x, dy: d0.y,
            attEndX: ae.x, attEndY: ae.y,
            defEndX: de.x, defEndY: de.y,
            clashX: cl.x, clashY: cl.y,
        });
    }

    /** Choque borda-a-borda em coords canvas (após map dos centros). */
    function computeCanvasCombatMeet(ax, ay, dx, dy, attW, defW) {
        let ux = dx - ax;
        let uy = dy - ay;
        const dist = Math.hypot(ux, uy);
        if (dist < 1) {
            ux = 1;
            uy = 0;
        } else {
            ux /= dist;
            uy /= dist;
        }
        const clashX = ax + ux * dist * 0.5;
        const clashY = ay + uy * dist * 0.5;
        const attHalf = Math.max(4, attW * 0.5);
        const defHalf = Math.max(4, defW * 0.5);
        const attEndX = clashX - ux * attHalf;
        const attEndY = clashY - uy * attHalf;
        const defEndX = clashX + ux * defHalf;
        const defEndY = clashY + uy * defHalf;
        return {
            ax, ay, dx, dy,
            attEndX, attEndY, defEndX, defEndY,
            clashX, clashY,
            travelAtt: Math.hypot(attEndX - ax, attEndY - ay),
            travelDef: Math.hypot(defEndX - dx, defEndY - dy),
        };
    }

    function mapScenePoint(vx, vy) {
        if (pixiFullscreenScene || _magicMissilesBarrage) return { x: vx, y: vy };
        return mapCombatPoint(vx, vy, combatClipRect);
    }

    function mapSceneCoords(fromX, fromY, toX, toY) {
        const a = mapScenePoint(fromX, fromY);
        const b = mapScenePoint(toX, toY);
        return { fromX: a.x, fromY: a.y, toX: b.x, toY: b.y };
    }

    /** Alinha Pixi ao retângulo do jogo no canvas fit (mesma base do combate). */
    function beginPixiTargetScene(a, fullscreen) {
        targetSceneActive++;
        if (targetSceneActive === 1 || !targetSceneStartedAt) {
            targetSceneStartedAt = (typeof performance !== "undefined" && performance.now)
                ? performance.now() : Date.now();
        }
        try {
            // Monitora FPS do ticker Pixi só enquanto há cena (alimenta adaptive).
            if (a?.ticker && !a.__dfAdaptHook) {
                a.__dfAdaptHook = true;
                a.ticker.add(() => {
                    try {
                        const dt = a.ticker.deltaMS || 16;
                        global.DfVfxRuntime?.noteFrameTime?.(dt);
                    } catch (e) { /* */ }
                });
            }
        } catch (e) { /* */ }
        try { syncPixiCanvasVisibility(a || app); } catch (e) { /* */ }
        if (fullscreen) {
            pixiFullscreenScene = true;
            syncPixiFullscreenScene(a);
            return true;
        }
        pixiFullscreenScene = false;
        if (global.DfLayout?.isCanvasFieldLayout?.()) {
            syncPixiCombatClip(a);
            return true;
        }
        ensurePixiViewportLayout(a);
        return false;
    }

    function endPixiTargetScene(a) {
        if (targetSceneActive > 0) targetSceneActive--;
        if (targetSceneActive <= 0) {
            targetSceneActive = 0;
            targetSceneStartedAt = 0;
        }
        if (combatSceneActive) return;
        // Não desmontar o layout fullscreen enquanto OUTRA cena ainda roda
        // (cenas sobrepostas re-montavam o canvas no meio da animação → a
        // ultimate "não aparecia"). Só refaz o layout quando ninguém mais usa.
        if (targetSceneActive > 0) return;
        ensurePixiViewportLayout(a);
        // Renderiza um quadro com o palco já vazio — sem isto o back-buffer
        // WebGL preserva o último frame da cena (animação "presa" na tela).
        try { a?.renderer?.render?.(a.stage); } catch (e) { /* */ }
        if (pendingQualityDestroy && quality !== "full") destroyAppForLite();
        try { global.__dfFlushUI?.(); } catch (e) { /* */ }
    }

    /**
     * Clip canvas fit + mapeamento viewport→local para cenas Pixi (ultimates, habilidades, invocação).
     * @param {boolean} [fullscreen] cena cinematográfica que cobre o viewport inteiro.
     */
    function pixiSceneFrame(a, fullscreen) {
        beginPixiTargetScene(a, fullscreen);
        const clip = getCombatClipRect();
        let clipW = clip?.width ?? global.innerWidth;
        let clipH = clip?.height ?? global.innerHeight;
        // Fullscreen/cinematic: overlays cobrem o renderer inteiro, não o combat clip
        // (senão a vinheta fica só no canto superior esquerdo).
        if (fullscreen || pixiFullscreenScene) {
            try {
                clipW = a?.screen?.width || a?.renderer?.width || scenePixels().w || global.innerWidth;
                clipH = a?.screen?.height || a?.renderer?.height || scenePixels().h || global.innerHeight;
            } catch (e) {
                const sp = scenePixels();
                clipW = sp.w || global.innerWidth;
                clipH = sp.h || global.innerHeight;
            }
        }
        return {
            map(x, y) { return mapScenePoint(x, y); },
            clipW,
            clipH,
            fullscreen: !!fullscreen,
            end() { endPixiTargetScene(a); },
        };
    }

    function bindCombatClipResize(a) {
        if (!a || a.__dfCombatClipBound) return;
        const fn = () => {
            if (a.__dfCombatClip) syncPixiCombatClip(a);
        };
        a.__dfCombatClipBound = fn;
        global.addEventListener("resize", fn);
        try { global.visualViewport?.addEventListener("resize", fn); } catch (e) { /* */ }
        try { global.visualViewport?.addEventListener("scroll", fn); } catch (e) { /* */ }
        try { global.addEventListener("df-orientation-sync", fn, { passive: true }); } catch (e) { /* */ }
    }

    function unbindCombatClipResize(a) {
        if (!a?.__dfCombatClipBound) return;
        const fn = a.__dfCombatClipBound;
        global.removeEventListener("resize", fn);
        try { global.visualViewport?.removeEventListener("resize", fn); } catch (e) { /* */ }
        try { global.visualViewport?.removeEventListener("scroll", fn); } catch (e) { /* */ }
        try { global.removeEventListener("df-orientation-sync", fn); } catch (e) { /* */ }
        a.__dfCombatClipBound = null;
    }

    /** Mobile canvas fit: Pixi clipado ao retângulo do jogo (coords locais = getBoundingClientRect − anchor). */
    function syncPixiCombatClip(a) {
        pixiFullscreenScene = false;
        if (canvasFieldLayout()) {
            mountPixiView(a);
            combatClipRect = { left: 0, top: 0, width: CANVAS_W, height: CANVAS_H };
            a.view.className = "df-pixi-vfx-canvas df-pixi-combat-clip";
            a.view.style.cssText = pixiLayerStyle(COMBAT_Z);
            resizePixiRenderer(a, CANVAS_W, CANVAS_H);
            a.__dfCombatClip = true;
            bindCombatClipResize(a);
            return true;
        }
        const r = getCombatClipRect();
        if (!r || !a?.view || !a.renderer) {
            combatClipRect = null;
            a.__dfCombatClip = false;
            return false;
        }
        combatClipRect = r;
        try {
            if (a.view.parentNode !== global.document.body) {
                global.document.body.appendChild(a.view);
            }
            a.view.className = "df-pixi-vfx-canvas df-pixi-combat-clip";
            a.view.style.cssText =
                "position:fixed;left:" + r.left + "px;top:" + r.top + "px;" +
                "width:" + r.width + "px;height:" + r.height + "px;" +
                "pointer-events:none;z-index:" + COMBAT_Z + ";";
            const hints = global.DfViewport?.getPerfHints?.();
            const dprCap = hints?.pixiDprCap ?? 2;
            const res = Math.min(global.devicePixelRatio || 1, dprCap);
            if (Math.abs(a.renderer.resolution - res) > 0.04) {
                a.renderer.resolution = res;
            }
            a.renderer.resize(r.width, r.height);
            a.__dfCombatClip = true;
            bindCombatClipResize(a);
        } catch (e) { /* */ }
        return true;
    }

    function ensurePixiViewportLayout(a) {
        if (!a?.view || !a.renderer) return;
        try {
            unbindCombatClipResize(a);
            combatClipRect = null;
            pixiFullscreenScene = false;
            mountPixiView(a);
            a.view.className = "df-pixi-vfx-canvas";
            a.view.style.cssText = pixiLayerStyle(Z);
            syncRendererResolution(a);
            a.__dfCombatCanvas = false;
            a.__dfCombatClip = false;
            a.__dfFullscreenScene = false;
        } catch (e) { /* */ }
    }

    /** Monta o Pixi cobrindo o VIEWPORT inteiro (cenas cinematográficas de ultimate). */
    function syncPixiFullscreenScene(a) {
        try {
            if (a.view.parentNode !== global.document.body) {
                global.document.body.appendChild(a.view);
            }
            a.view.className = "df-pixi-vfx-canvas df-pixi-fullscreen-scene";
            a.view.style.cssText =
                "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:" + COMBAT_Z + ";";
            resizePixiRenderer(a, global.innerWidth, global.innerHeight);
            combatClipRect = { left: 0, top: 0, width: global.innerWidth, height: global.innerHeight };
            a.__dfFullscreenScene = true;
            a.__dfCombatClip = false;
        } catch (e) { /* */ }
    }

    function ensureCombatImpactSeparation(attHitX, attHitY, defHitX, defHitY, attW, defW, mobile) {
        const dx = defHitX - attHitX;
        const dy = defHitY - attHitY;
        const dist = Math.hypot(dx, dy) || 1;
        const need = (attW + defW) * 0.5 + (mobile ? 10 : 4);
        if (dist >= need) return { attHitX, attHitY, defHitX, defHitY };
        const ux = dx / dist;
        const uy = dy / dist;
        const push = (need - dist) * 0.5;
        return {
            attHitX: attHitX - ux * push,
            attHitY: attHitY - uy * push,
            defHitX: defHitX + ux * push,
            defHitY: defHitY + uy * push,
        };
    }

    function detachCombatCard(root, card) {
        if (!card) return;
        try {
            if (card.parent === root) root.removeChild(card);
            card.destroy({ children: true });
        } catch (e) { /* */ }
    }

    function reparentCombatCard(root, card) {
        if (!card) return;
        try {
            if (card.parent === root) root.removeChild(card);
        } catch (e) { /* */ }
    }

    async function playCombatKillDestroy(card, cx, cy, snap, perfFx, pixiApp, side) {
        if (!snap) return;
        if (snap.onDestroy === "noHonor" && !snap.silenced && card) {
            const gsapBridge = global.DfGsapBridge;
            const gsap = await gsapBridge?.ensureGsap?.(true);
            if (gsap) {
                card.x = cx;
                card.y = cy;
                card.visible = true;
                card.alpha = 1;
                try { getVfxStageParent(pixiApp)?.addChild(card); } catch (e) { /* */ }
                const flee = () => new Promise((resolve) => {
                    gsap.to(card.scale, { x: 0.04, y: 0.04, duration: 0.64, ease: "power2.in" });
                    gsap.to(card, {
                        x: cx, y: cy, rotation: "+=540", alpha: 0,
                        duration: 0.64, ease: "power2.in",
                        onComplete: () => {
                            try { card.destroy({ children: true }); } catch (err) { /* */ }
                            resolve();
                        },
                    });
                });
                const ran = await playPortalEscapeScene({
                    cx, cy, cinematic: true, sceneCoords: true, onOpen: flee,
                });
                if (!ran) await flee();
                const shown = global.__dfCombatKillVisual || (global.__dfCombatKillVisual = {});
                if (side === "att") shown.att = true;
                else if (side === "def") shown.def = true;
                return;
            }
        }
        if (card && pixiApp?.stage) {
            card.x = cx;
            card.y = cy;
            card.visible = true;
            card.alpha = 1;
            try { getVfxStageParent(pixiApp).addChild(card); } catch (e) { /* */ }
        }
        const mobile = !!(perfFx?.mobile || perfFx?.coarse || perfFx?.lowEnd);
        if (card) {
            let fastCommitted = false;
            const fastDur = (mobile ? 0.66 : 0.8) + 0.55 + 0.45;
            const fastOk = await combatPhaseTimeout(
                playCombatFastDestroy(card, cx, cy, snap, pixiApp, mobile, {
                    onCommit: () => { fastCommitted = true; },
                }),
                fastDur,
            );
            if (fastOk || fastCommitted) {
                const shown = global.__dfCombatKillVisual || (global.__dfCombatKillVisual = {});
                if (side === "att") shown.att = true;
                else if (side === "def") shown.def = true;
                return;
            }
            try { card.destroy({ children: true }); } catch (e) { /* */ }
            card = null;
        }
        const ok = await playCardDestroy(cx, cy, snap, {
            force: true,
            fx: perfFx,
            combatKill: true,
            existingCard: card || undefined,
            skipGenerateTexture: true,
            sceneCoords: true,
        });
        if (ok) {
            const shown = global.__dfCombatKillVisual || (global.__dfCombatKillVisual = {});
            if (side === "att") shown.att = true;
            else if (side === "def") shown.def = true;
            return;
        }
        if (card) {
            try { card.destroy({ children: true }); } catch (e) { /* */ }
        }
        const fn = global.__dfTriggerChampionShatter;
        if (typeof fn === "function") {
            await fn(null, Object.assign({}, snap, { cx, cy }));
            const shown = global.__dfCombatKillVisual || (global.__dfCombatKillVisual = {});
            if (side === "att") shown.att = true;
            else if (side === "def") shown.def = true;
        }
    }

    /**
     * Destruição de campeão fora do combate — mesmo pipeline do estilhaço pós-combate
     * (playCombatFastDestroy → playCardDestroy combatKill), evitando animação cortada/bugada.
     */
    async function playChampionCombatDestroy(snap, opts = {}) {
        if (!snap || !global.DfVfxEngine?.wantsGpuPresentation?.()) return false;
        setQuality("full");
        global.DfGsapBridge?.setQuality?.("full");
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const perfFx = opts.fx || global.__dfFX;
        let cx = opts.cx ?? snap.cx;
        let cy = opts.cy ?? snap.cy;
        if (cx == null || cy == null) return false;

        const cardW = snap.combatW ?? snap.width ?? 72;
        const cardH = snap.combatH ?? snap.height ?? 100;
        const PIXI = global.PIXI;

        if (!combatSceneActive && !_magicMissilesBarrage) {
            try { sweepOrphanScenes(); } catch (e) { /* */ }
        }

        const inBarrage = !!_magicMissilesBarrage;
        if (!inBarrage) {
            beginPixiTargetScene(a);
        } else {
            // Barragem é fullscreen — NÃO chamar syncPixiCombatClip (remonta o
            // canvas e congela 💥 / estilhaços no meio da sequência).
            ensureMagicMissilesBarrageScene();
        }
        let card = null;
        try {
            try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
            if (inBarrage) {
                const mp = mapScenePoint(cx, cy);
                cx = mp.x;
                cy = mp.y;
            } else if (global.DfLayout?.isCanvasFieldLayout?.()) {
                syncPixiCombatClip(a);
                const pt = mapCombatPoint(cx, cy, combatClipRect);
                cx = pt.x;
                cy = pt.y;
            } else {
                const mp = mapScenePoint(cx, cy);
                cx = mp.x;
                cy = mp.y;
            }

            card = await buildCombatCardSprite(PIXI, snap, cardW, cardH, { texWaitSec: inBarrage ? 0.35 : 1.0 });
            await playCombatKillDestroy(card, cx, cy, snap, perfFx, a, null);
            return true;
        } catch (e) {
            console.warn("[playChampionCombatDestroy]", e);
            try { card?.destroy?.({ children: true }); } catch (err) { /* */ }
            return false;
        } finally {
            if (!inBarrage) endPixiTargetScene(a);
            if (!combatSceneActive && !_magicMissilesBarrage) {
                try { sweepOrphanScenes(); } catch (e) { /* */ }
            } else if (_magicMissilesBarrage) {
                ensureMagicMissilesBarrageScene();
                clearNonBarrageStageChildren();
            }
        }
    }

    /** Estilhaço GPU curto no combate — sem generateTexture (evita travamento mobile). */
    async function playCombatFastDestroy(card, cx, cy, snap, pixiApp, mobile, hooks = {}) {
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = pixiApp || await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge || !card) return false;

        const PIXI = global.PIXI;
        const w = snap?.combatW ?? snap?.width ?? 72;
        const h = snap?.combatH ?? snap?.height ?? 100;
        const unit = cardUnit(1);
        const totalDur = mobile ? 0.66 : 0.8;
        const shatterAt = 0.09;

        const wrap = new PIXI.Container();
        getVfxStageParent(a).addChild(wrap);

        card.x = cx;
        card.y = cy;
        card.visible = true;
        card.alpha = 1;
        card.rotation = 0;
        card.scale.set(1, 1);
        wrap.addChild(card);

        const perfFx = hooks.fx || global.__dfFX;
        const skipGpuTex = mobile || perfFx?.lowEnd || perfFx?.liteVfx;
        let cardTex = null;
        if (!skipGpuTex && PIXI.SimpleMesh) {
            try {
                const texRes = a.renderer.resolution || 1;
                cardTex = await Promise.race([
                    Promise.resolve(a.renderer.generateTexture(card, {
                        region: new PIXI.Rectangle(-w / 2, -h / 2, w, h),
                        resolution: texRes,
                    })),
                    new Promise((_, reject) => setTimeout(
                        () => reject(new Error("fast tex timeout")), mobile ? 240 : 180,
                    )),
                ]);
            } catch (e) { cardTex = null; }
        }

        const glow = new PIXI.Graphics();
        glow.beginFill(0xffb830, 0.4);
        glow.drawRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, Math.max(6, w * 0.08) + 5);
        glow.endFill();
        glow.x = cx;
        glow.y = cy;
        glow.alpha = 0;
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(glow);

        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, 1);
        flash.drawRoundedRect(-w / 2, -h / 2, w, h, Math.max(6, w * 0.08));
        flash.endFill();
        flash.x = cx;
        flash.y = cy;
        flash.alpha = 0;
        if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(flash);

        const shock = [];
        for (let i = 0; i < (mobile ? 2 : 3); i++) {
            const sg = new PIXI.Graphics();
            sg.lineStyle(Math.max(2, unit * 0.03) - i * 0.4, 0xffe6a0, 0.88 - i * 0.12);
            sg.drawCircle(0, 0, unit * (0.22 + i * 0.08));
            sg.x = cx;
            sg.y = cy;
            sg.alpha = 0;
            sg.scale.set(0.2);
            if (PIXI.BLEND_MODES) sg.blendMode = PIXI.BLEND_MODES.ADD;
            wrap.addChild(sg);
            shock.push(sg);
        }

        const crackNet = buildCrackNetwork(PIXI, w, h, w * 0.5, h * 0.46, unit);
        crackNet.container.x = cx - w / 2;
        crackNet.container.y = cy - h / 2;
        wrap.addChild(crackNet.container);

        const shardLayer = new PIXI.Container();
        wrap.addChild(shardLayer);

        let shards = cardTex
            ? buildMeshShards(PIXI, cardTex, w, h, cx - w / 2, cy - h / 2, cx, cy, {
                cols: mobile ? 4 : 5, rows: mobile ? 5 : 6, speed: mobile ? 4.8 : 6,
            })
            : null;
        if (shards) {
            shards.forEach((sh) => shardLayer.addChild(sh.spr));
        } else {
            shards = [];
            try {
                const fbWrap = new PIXI.Container();
                const fbCard = await buildCombatCardSprite(PIXI, snap, w, h, { texWaitSec: 0.45 });
                fbCard.x = w / 2;
                fbCard.y = h / 2;
                fbWrap.addChild(fbCard);
                const fbTex = await Promise.race([
                    Promise.resolve(a.renderer.generateTexture(fbWrap, {
                        width: w,
                        height: h,
                        resolution: a.renderer.resolution || 1,
                    })),
                    new Promise((_, reject) => setTimeout(
                        () => reject(new Error("fb tex timeout")), mobile ? 320 : 260,
                    )),
                ]);
                try { fbWrap.destroy({ children: true }); } catch (e) { /* */ }
                const meshShards = buildMeshShards(PIXI, fbTex, w, h, cx - w / 2, cy - h / 2, cx, cy, {
                    cols: mobile ? 4 : 5, rows: mobile ? 5 : 6, speed: mobile ? 4.8 : 6,
                });
                if (meshShards?.length) {
                    shards = meshShards;
                    shards.forEach((sh) => shardLayer.addChild(sh.spr));
                } else {
                    try { fbTex.destroy(true); } catch (e) { /* */ }
                }
            } catch (e) { /* */ }
        }

        const sparks = [];
        const sparkN = n(mobile ? 24 : 34);
        for (let i = 0; i < sparkN; i++) {
            const g = new PIXI.Graphics();
            g.beginFill(i % 3 === 0 ? 0xffa030 : 0xfff8d8, 0.98);
            g.drawCircle(0, 0, unit * (0.012 + Math.random() * 0.028));
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx;
            g.y = cy;
            g.alpha = 0;
            wrap.addChild(g);
            const ang = (Math.PI * 2 * i) / sparkN + (Math.random() - 0.5) * 0.4;
            const spd = 3.6 + Math.random() * (mobile ? 8 : 11);
            sparks.push({
                g,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 2.4,
                vr: (Math.random() - 0.5) * 0.35,
                life: 0,
            });
        }
        const embers = [];
        const emberN = n(mobile ? 8 : 12);
        for (let i = 0; i < emberN; i++) {
            const g = new PIXI.Graphics();
            g.beginFill(i % 3 === 0 ? 0xffcf6a : 0xff8a2a, 0.95);
            g.drawCircle(0, 0, unit * (0.015 + Math.random() * 0.028));
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            g.x = cx + (Math.random() - 0.5) * w * 0.5;
            g.y = cy + (Math.random() - 0.5) * h * 0.5;
            g.alpha = 0;
            wrap.addChild(g);
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
            const spd = 1.5 + Math.random() * 3;
            embers.push({
                g,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 1.3,
                life: 0,
                flick: Math.random() * 6,
            });
        }

        const tl = await gsapBridge.createTimeline({}, true);
        if (!tl) {
            try { wrap.destroy({ children: true }); } catch (e) { /* */ }
            try { if (cardTex) cardTex.destroy(true); } catch (e) { /* */ }
            return false;
        }
        try { hooks.onCommit?.(); } catch (e) { /* */ }

        tl.to(card.scale, { x: 1.06, y: 1.06, duration: shatterAt, ease: "power1.inOut" }, 0);
        tl.to(glow, { alpha: 0.78, duration: shatterAt * 0.9, ease: "sine.out" }, 0);
        if (crackNet.segments.length) {
            tl.to(crackNet.segments, {
                alpha: 1,
                duration: Math.max(0.03, shatterAt * 0.5),
                ease: "none",
                stagger: { each: Math.max(0.004, (shatterAt * 0.8) / crackNet.segments.length), from: "start" },
            }, 0);
        }
        tl.to(card.scale, { x: 1.14, y: 1.14, duration: 0.05, ease: "expo.out" }, shatterAt - 0.03);
        tl.to(flash, { alpha: 1, duration: 0.03, ease: "power2.in" }, shatterAt - 0.02);
        tl.to(flash.scale, { x: 1.2, y: 1.2, duration: 0.08, ease: "expo.out" }, shatterAt - 0.02);

        shock.forEach((sg, i) => {
            const off = i * 0.05;
            tl.to(sg, { alpha: 0.82 - i * 0.12, duration: 0.04 }, shatterAt + off);
            tl.to(sg.scale, {
                x: (mobile ? 3.4 : 4.4) + i, y: (mobile ? 3.4 : 4.4) + i,
                duration: totalDur * 0.5, ease: "power2.out",
            }, shatterAt + off);
            tl.to(sg, { alpha: 0, duration: totalDur * 0.32, ease: "power2.in" }, shatterAt + off + totalDur * 0.16);
        });

        tl.add(() => {
            card.visible = false;
            crackNet.container.visible = false;
            glow.visible = false;
            shards.forEach((sh) => { sh.spr.alpha = 1; });
            sparks.forEach((s) => { s.g.alpha = 1; s.life = 1; });
            embers.forEach((e) => { e.g.alpha = 1; e.life = 1; });
            try { global.sfx?.("champion_destroy"); } catch (e) { /* */ }
        }, shatterAt);

        const fxProxy = { t: 0 };
        tl.to(fxProxy, {
            t: 1,
            duration: totalDur - shatterAt,
            ease: "none",
            onUpdate: () => {
                const t = fxProxy.t;
                const fade = Math.max(0, 1 - t * 1.1);
                shards.forEach((sh) => {
                    sh.spr.x += sh.vx;
                    sh.spr.y += sh.vy;
                    sh.vy += 0.25;
                    sh.vx *= 0.97;
                    sh.vy *= 0.97;
                    sh.spr.rotation += sh.vr;
                    sh.spr.alpha = fade;
                    const sc = 1 - t * 0.26;
                    sh.spr.scale.set(sc, sc);
                });
                sparks.forEach((s) => {
                    s.g.x += s.vx;
                    s.g.y += s.vy;
                    s.vy += 0.16;
                    s.life -= 0.028;
                    s.g.alpha = Math.max(0, s.life);
                });
                embers.forEach((e) => {
                    e.g.x += e.vx;
                    e.g.y += e.vy;
                    e.vy += 0.05;
                    e.vx *= 0.985;
                    e.life -= 0.022;
                    e.flick += 0.5;
                    e.g.alpha = Math.max(0, e.life) * (0.6 + Math.sin(e.flick) * 0.4);
                });
                flash.alpha = Math.max(0, 0.9 * (1 - t * 2.4));
            },
        }, shatterAt);

        await awaitPixiTimeline(tl, wrap, totalDur + 0.55);
        try { if (cardTex) cardTex.destroy(true); } catch (e) { /* */ }
        try { wrap.destroy({ children: true }); } catch (e) { /* */ }
        if (_magicMissilesBarrage) {
            pixiFullscreenScene = true;
            syncPixiFullscreenScene(a);
            clearNonBarrageStageChildren();
        } else {
            sweepOrphanScenes();
        }
        return true;
    }

    async function combatImpactShake(shakeWrap, gsapBridge, mobile) {
        const tl = await gsapBridge.createTimeline({}, true);
        if (!tl) return;
        // Impulse curto e determinístico (sem Math.random) — impacto firme, sem tremor amador.
        const amp = mobile ? 7 : 9;
        shakeWrap.scale?.set?.(1, 1);
        tl.to(shakeWrap.scale, {
            x: mobile ? 1.02 : 1.018,
            y: mobile ? 1.02 : 1.018,
            duration: 0.045,
            ease: "power3.out",
        }, 0);
        const shake = { p: 0 };
        tl.to(shake, {
            p: 1,
            duration: mobile ? 0.18 : 0.22,
            ease: "power2.out",
            onUpdate: () => {
                const damp = (1 - shake.p) * (1 - shake.p);
                const wave = Math.sin(shake.p * Math.PI * 3.2);
                shakeWrap.x = wave * amp * damp;
                shakeWrap.y = Math.sin(shake.p * Math.PI * 2.4 + 0.7) * amp * 0.55 * damp;
            },
        }, 0);
        tl.to(shakeWrap.scale, { x: 1, y: 1, duration: mobile ? 0.2 : 0.24, ease: "power2.out" }, 0.04);
        tl.to(shakeWrap, { x: 0, y: 0, duration: 0.12, ease: "power3.out" }, ">-0.06");
        await awaitPixiTimeline(tl, null, mobile ? 0.4 : 0.48, { destroyRoot: false });
        try { shakeWrap.x = 0; shakeWrap.y = 0; } catch (e) { /* */ }
    }

    /** Faixas de velocidade Pixi durante a arrancada — reforço visual no mobile. */
    function spawnCombatRushStreaks(root, PIXI, x0, y0, x1, y1, mobile) {
        if (!root || !PIXI) return [];
        const streaks = [];
        const unit = cardUnit(1);
        const ang = Math.atan2(y1 - y0, x1 - x0);
        const count = mobile ? 4 : 3;
        for (let i = 0; i < count; i++) {
            const g = new PIXI.Graphics();
            const w = 10 + i * (mobile ? 5 : 4);
            const h = Math.max(2, unit * 0.01);
            g.beginFill(i % 2 ? 0xffe8a8 : 0xffffff, mobile ? 0.42 : 0.34);
            g.drawRoundedRect(-w, -h / 2, w, h, h);
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            const t = 0.18 + (i / count) * 0.48;
            g.x = x0 + (x1 - x0) * t;
            g.y = y0 + (y1 - y0) * t;
            g.rotation = ang + Math.PI;
            g.alpha = 0;
            root.addChildAt(g, 0);
            streaks.push(g);
        }
        return streaks;
    }

    function fadeCombatRushStreaks(gsap, streaks, dur = 0.14) {
        if (!gsap || !streaks?.length) return;
        streaks.forEach((g) => {
            gsap.to(g, { alpha: 0, duration: dur, ease: "power1.out", onComplete: () => {
                try { g.destroy(); } catch (e) { /* */ }
            } });
        });
    }

    async function combatReturnOne(gsapBridge, card, x0, y0, x1, y1, dur, mobile) {
        const tl = await gsapBridge.createTimeline({}, true);
        if (!tl) return;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const returnArc = Math.min(36, Math.max(10, dist * 0.1));
        scheduleCardFly(tl, card, x0, y0, x1, y1, dur, {
            arc: returnArc,
            scalePeak: 1.015,
            skipScale: false,
            keepUpright: true,
            ease: "power3.out",
        });
        await awaitPixiTimeline(tl, null, dur + 0.35, { destroyRoot: false });
    }

    async function combatRecoilBoth(gsapBridge, attCard, defCard, attHitX, attHitY, defHitX, defHitY, ax, ay, dx, dy, mobile) {
        const recoilDur = mobile ? 0.18 : 0.22;
        const returnDur = mobile ? 0.36 : 0.44;
        const returnArc = mobile ? 8 : 12;
        const attBackX = attHitX + (ax - attHitX) * 0.28;
        const attBackY = attHitY + (ay - attHitY) * 0.28;
        const defBackX = defHitX + (dx - defHitX) * 0.28;
        const defBackY = defHitY + (dy - defHitY) * 0.28;
        const tl = await gsapBridge.createTimeline({}, true);
        if (!tl) return;
        scheduleCardFly(tl, attCard, attHitX, attHitY, attBackX, attBackY, recoilDur, {
            arc: 0, scalePeak: 1, keepUpright: true, ease: "power3.out",
        });
        scheduleCardFly(tl, defCard, defHitX, defHitY, defBackX, defBackY, recoilDur, {
            arc: 0, scalePeak: 1, keepUpright: true, ease: "power3.out",
        });
        scheduleCardFly(tl, attCard, attBackX, attBackY, ax, ay, returnDur, {
            arc: returnArc, scalePeak: 1, keepUpright: true, ease: "power3.out",
        }, recoilDur);
        scheduleCardFly(tl, defCard, defBackX, defBackY, dx, dy, returnDur, {
            arc: returnArc, scalePeak: 1, keepUpright: true, ease: "power3.out",
        }, recoilDur);
        await awaitPixiTimeline(tl, null, recoilDur + returnDur + 0.35, { destroyRoot: false });
    }

    /** Mata tweens órfãos que congelam ou duplicam cartas Pixi entre combates. */
    function combatKillCardTweens(gsap, card) {
        if (!gsap || !card) return;
        try {
            gsap.killTweensOf(card);
            if (card.scale) gsap.killTweensOf(card.scale);
            if (card.position) gsap.killTweensOf(card.position);
        } catch (e) { /* */ }
    }

    function combatClearAnimFlags(cartaAtacante, cartaAlvo) {
        if (cartaAtacante) {
            cartaAtacante.estaAnimando = false;
            delete cartaAtacante._dfOrigemX;
            delete cartaAtacante._dfOrigemY;
        }
        if (cartaAlvo) {
            cartaAlvo.estaAnimando = false;
            delete cartaAlvo._dfOrigemX;
            delete cartaAlvo._dfOrigemY;
        }
    }

    function combatDestroyPixiCard(gsap, card) {
        if (!card) return;
        combatKillCardTweens(gsap, card);
        try {
            if (card.parent) card.parent.removeChild(card);
            card.destroy({ children: true });
        } catch (e) { /* */ }
    }

    /**
     * Ataque Pixi+GSAP com timeline única — evita duplicata, congelamento e sumiço.
     * @param {PIXI.Container} cartaAtacante sprite Pixi do atacante
     * @param {PIXI.Container|null} cartaAlvo sprite Pixi do defensor (opcional)
     * @param {object} opts
     * @returns {Promise<boolean>}
     */
    async function animarAtaque(cartaAtacante, cartaAlvo, opts = {}) {
        const {
            gsap,
            gsapBridge,
            impactX,
            impactY,
            origemX,
            origemY,
            alvoImpactX,
            alvoImpactY,
            alvoOrigemX,
            alvoOrigemY,
            alvoDerrotado = false,
            atacanteDerrotado = false,
            mobile = false,
            onImpact,
            onAposImpacto,
            destruirAlvo,
            destruirAtacante,
            rushStreakRoot = null,
            rushStreakPIXI = null,
            onChargeStart,
        } = opts;

        if (!cartaAtacante || !gsap || !gsapBridge) return false;

        combatKillCardTweens(gsap, cartaAtacante);
        combatKillCardTweens(gsap, cartaAlvo);

        const attOx = origemX ?? cartaAtacante.x;
        const attOy = origemY ?? cartaAtacante.y;
        cartaAtacante._dfOrigemX = attOx;
        cartaAtacante._dfOrigemY = attOy;
        cartaAtacante.estaAnimando = true;

        let defOx = 0;
        let defOy = 0;
        let defVivo = !!cartaAlvo;
        if (cartaAlvo) {
            defOx = alvoOrigemX ?? cartaAlvo.x;
            defOy = alvoOrigemY ?? cartaAlvo.y;
            cartaAlvo._dfOrigemX = defOx;
            cartaAlvo._dfOrigemY = defOy;
            cartaAlvo.estaAnimando = true;
        }

        const attHitX = impactX ?? (cartaAlvo?.x ?? attOx);
        const attHitY = impactY ?? (cartaAlvo?.y ?? attOy);
        const defHitX = alvoImpactX ?? defOx;
        const defHitY = alvoImpactY ?? defOy;

        const rushStreaks = [];
        if (rushStreakRoot && rushStreakPIXI) {
            rushStreaks.push(...spawnCombatRushStreaks(
                rushStreakRoot, rushStreakPIXI, attOx, attOy, attHitX, attHitY, mobile,
            ));
            if (cartaAlvo && (defHitX !== defOx || defHitY !== defOy)) {
                rushStreaks.push(...spawnCombatRushStreaks(
                    rushStreakRoot, rushStreakPIXI, defOx, defOy, defHitX, defHitY, mobile,
                ));
            }
            rushStreaks.forEach((g, i) => {
                gsap.to(g, { alpha: mobile ? 0.72 : 0.58, duration: 0.08, delay: i * 0.012, ease: "power1.out" });
            });
        }

        const cleanup = () => {
            fadeCombatRushStreaks(gsap, rushStreaks, 0.08);
            combatClearAnimFlags(
                cartaAtacante?.parent && !cartaAtacante?.destroyed ? cartaAtacante : null,
                defVivo && cartaAlvo?.parent && !cartaAlvo?.destroyed ? cartaAlvo : null,
            );
        };

        const returnDur = mobile ? 0.38 : 0.46;

        try {
            const attDist = Math.hypot(attHitX - attOx, attHitY - attOy);
            const defDist = cartaAlvo
                ? Math.hypot(defHitX - defOx, defHitY - defOy)
                : 0;
            const rushDur = mobile
                ? Math.min(0.52, 0.32 + Math.max(attDist, defDist) / 560)
                : Math.min(0.64, 0.38 + Math.max(attDist, defDist) / 520);
            const rushArc = Math.min(56, Math.max(16, Math.max(attDist, defDist) * 0.12));
            const rushFly = {
                arc: rushArc,
                scalePeak: 1.025,
                skipScale: false,
                keepUpright: true,
                ease: "power3.inOut",
            };

            // Anticipação (wind-up) — atacante recua e comprime; defensor se prepara, antes da arrancada.
            let rushFromX = attOx;
            let rushFromY = attOy;
            const windDist = Math.hypot(attHitX - attOx, attHitY - attOy);
            if (windDist > 24) {
                const ndx = (attHitX - attOx) / windDist;
                const ndy = (attHitY - attOy) / windDist;
                const back = Math.min(mobile ? 10 : 14, windDist * 0.09);
                rushFromX = attOx - ndx * back;
                rushFromY = attOy - ndy * back;
                const windTl = await gsapBridge.createTimeline({}, true);
                if (windTl) {
                    const windDur = mobile ? 0.12 : 0.16;
                    // Escala UNIFORME — squash x≠y encolhia o número de Poder.
                    windTl.to(cartaAtacante, { x: rushFromX, y: rushFromY, duration: windDur, ease: "power2.out" }, 0);
                    windTl.to(cartaAtacante.scale, {
                        x: 1.03, y: 1.03, duration: windDur, ease: "power2.out",
                        onUpdate: () => syncCombatStaticPower(cartaAtacante),
                    }, 0);
                    if (cartaAlvo) {
                        windTl.to(cartaAlvo.scale, {
                            x: 1.015, y: 1.015, duration: windDur, ease: "power2.out",
                            onUpdate: () => syncCombatStaticPower(cartaAlvo),
                        }, 0);
                    }
                    await combatPhaseTimeout(gsapBridge.timelineToPromise(windTl), mobile ? 0.28 : 0.34);
                }
                cartaAtacante.scale?.set?.(1, 1);
                syncCombatStaticPower(cartaAtacante);
                if (cartaAlvo) {
                    cartaAlvo.scale?.set?.(1, 1);
                    syncCombatStaticPower(cartaAlvo);
                }
            }

            const rushTl = await gsapBridge.createTimeline({}, true);
            if (!rushTl) {
                cleanup();
                return false;
            }

            scheduleCardFly(rushTl, cartaAtacante, rushFromX, rushFromY, attHitX, attHitY, rushDur, rushFly, 0);
            if (cartaAlvo && (defHitX !== defOx || defHitY !== defOy)) {
                scheduleCardFly(rushTl, cartaAlvo, defOx, defOy, defHitX, defHitY, rushDur, rushFly, 0);
            }
            rushTl.add(() => {
                fadeCombatRushStreaks(gsap, rushStreaks, 0.04);
                if (typeof onImpact === "function") onImpact();
            }, rushDur);

            if (typeof onChargeStart === "function") {
                onChargeStart();
            }

            await combatPhaseTimeout(
                gsapBridge.timelineToPromise(rushTl),
                mobile ? 1.05 : 1.25,
            );

            if (typeof onAposImpacto === "function") {
                await combatPhaseTimeout(onAposImpacto(), mobile ? 0.88 : 1.05);
            }

            if (alvoDerrotado && cartaAlvo) {
                const dead = cartaAlvo;
                defVivo = false;
                if (typeof destruirAlvo === "function") {
                    await combatPhaseTimeout(destruirAlvo(dead, defHitX, defHitY), mobile ? 1.75 : 1.45);
                } else {
                    await combatPhaseTimeout(new Promise((resolve) => {
                        gsap.to(dead.scale, {
                            x: 0, y: 0, duration: 0.35, ease: "power2.in",
                            onComplete: () => {
                                combatDestroyPixiCard(gsap, dead);
                                resolve(true);
                            },
                        });
                    }), 0.55);
                }
            }

            if (atacanteDerrotado && cartaAtacante) {
                const dead = cartaAtacante;
                if (typeof destruirAtacante === "function") {
                    await combatPhaseTimeout(destruirAtacante(dead, attHitX, attHitY), mobile ? 1.75 : 1.45);
                } else {
                    await combatPhaseTimeout(new Promise((resolve) => {
                        gsap.to(dead.scale, {
                            x: 0, y: 0, duration: 0.35, ease: "power2.in",
                            onComplete: () => {
                                combatDestroyPixiCard(gsap, dead);
                                resolve(true);
                            },
                        });
                    }), 0.55);
                }
            }

            const survivorAtt = !!(cartaAtacante?.parent && !cartaAtacante?.destroyed && !atacanteDerrotado);
            const survivorDef = !!(cartaAlvo?.parent && !cartaAlvo?.destroyed && !alvoDerrotado);

            if (survivorAtt && survivorDef) {
                await combatPhaseTimeout(
                    combatRecoilBoth(
                        gsapBridge, cartaAtacante, cartaAlvo,
                        attHitX, attHitY, defHitX, defHitY,
                        attOx, attOy, defOx, defOy, mobile,
                    ),
                    mobile ? 1.15 : 1.35,
                );
            } else if (survivorAtt) {
                const retOk = await combatPhaseTimeout(
                    combatReturnOne(gsapBridge, cartaAtacante, attHitX, attHitY, attOx, attOy, returnDur, mobile),
                    mobile ? 0.85 : 1.0,
                );
                if (!retOk && cartaAtacante?.parent && !cartaAtacante?.destroyed) {
                    cartaAtacante.x = attOx;
                    cartaAtacante.y = attOy;
                    cartaAtacante.scale?.set?.(1, 1);
                    cartaAtacante.rotation = 0;
                }
            } else if (survivorDef) {
                const retOk = await combatPhaseTimeout(
                    combatReturnOne(gsapBridge, cartaAlvo, defHitX, defHitY, defOx, defOy, returnDur, mobile),
                    mobile ? 0.85 : 1.0,
                );
                if (!retOk && cartaAlvo?.parent && !cartaAlvo?.destroyed) {
                    cartaAlvo.x = defOx;
                    cartaAlvo.y = defOy;
                    cartaAlvo.scale?.set?.(1, 1);
                    cartaAlvo.rotation = 0;
                }
            }

            cleanup();
            return true;
        } catch (e) {
            console.warn("[animarAtaque]", e);
            combatKillCardTweens(gsap, cartaAtacante);
            combatKillCardTweens(gsap, cartaAlvo);
            cleanup();
            return false;
        }
    }

    /**
     * Combate Pixi+GSAP estilo Hearthstone — arrancada, choque borda-a-borda,
     * estilhaço imediato do derrotado, retorno fluido do sobrevivente.
     */
    function combatTexWaitSec() {
        // Peer MP: não esperar 5.5s de textura — ator/vs-IA intactos.
        try {
            if (global.__DF_ONLINE && (global.__dfMpPeerCombatFast || global.__dfOnlineApplyingRemote)) {
                return 0.35;
            }
        } catch (e) { /* */ }
        try {
            if (global.DfLazyLoad?.isSlowNetwork?.()) return 5.5;
        } catch (e) { /* */ }
        return 1.4;
    }

    async function playCombatScene(opts = {}) {
        const {
            attSnap, defSnap, geo, outcome = {}, onImpact: onImpactCb, fx, onHideSources,
            onShowSources,
        } = opts || {};

        if (!global.DfVfxEngine?.wantsGpuPresentation?.()) return false;
        setQuality("full");
        global.DfGsapBridge?.setQuality?.("full");
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        if (global.DfLayout?.isCanvasFieldLayout?.()) {
            syncPixiCombatClip(a);
        } else {
            ensurePixiViewportLayout(a);
        }

        const PIXI = global.PIXI;
        if (!attSnap || !geo) return false;

        const perfFx = fx || global.__dfFX;
        const mobileCombat = !!(perfFx?.mobile || perfFx?.coarse || perfFx?.lowEnd);
        const killD = !!outcome.killD;
        const killA = !!outcome.killA;

        const mappedGeo = mapCombatGeo(geo);
        const attW = attSnap.combatW ?? attSnap.width ?? 72;
        const attH = attSnap.combatH ?? attSnap.height ?? 100;
        const defW = defSnap?.combatW ?? defSnap?.width ?? attW;
        const defH = defSnap?.combatH ?? defSnap?.height ?? attH;

        const attCx = attSnap.cx ?? geo.ax;
        const attCy = attSnap.cy ?? geo.ay;
        const defCx = defSnap?.cx ?? geo.dx;
        const defCy = defSnap?.cy ?? geo.dy;
        const a0 = mapCombatPoint(attCx, attCy, combatClipRect);
        const d0 = defSnap ? mapCombatPoint(defCx, defCy, combatClipRect) : a0;
        const meet = computeCanvasCombatMeet(a0.x, a0.y, d0.x, d0.y, attW, defW);
        if (Math.max(meet.travelAtt, meet.travelDef) < 4) {
            const boost = Math.max(20, Math.min(attW, defW) * 0.22);
            const ux = meet.clashX !== a0.x || meet.clashY !== a0.y
                ? (meet.clashX - a0.x) / Math.max(1, Math.hypot(meet.clashX - a0.x, meet.clashY - a0.y))
                : 1;
            const uy = meet.clashX !== a0.x || meet.clashY !== a0.y
                ? (meet.clashY - a0.y) / Math.max(1, Math.hypot(meet.clashX - a0.x, meet.clashY - a0.y))
                : 0;
            meet.attEndX = meet.clashX - ux * boost;
            meet.attEndY = meet.clashY - uy * boost;
            meet.defEndX = meet.clashX + ux * boost;
            meet.defEndY = meet.clashY + uy * boost;
            meet.travelAtt = Math.hypot(meet.attEndX - meet.ax, meet.attEndY - meet.ay);
            meet.travelDef = Math.hypot(meet.defEndX - meet.dx, meet.defEndY - meet.dy);
        }

        const ax = meet.ax;
        const ay = meet.ay;
        const dx = meet.dx;
        const dy = meet.dy;
        const clashX = meet.clashX;
        const clashY = meet.clashY;
        let attHitX = meet.attEndX;
        let attHitY = meet.attEndY;
        let defHitX = meet.defEndX;
        let defHitY = meet.defEndY;
        const sep = ensureCombatImpactSeparation(attHitX, attHitY, defHitX, defHitY, attW, defW, mobileCombat);
        attHitX = sep.attHitX;
        attHitY = sep.attHitY;
        defHitX = sep.defHitX;
        defHitY = sep.defHitY;

        let shakeWrap = null;
        let root = null;
        let attCard = null;
        let defCard = null;
        combatSceneActive = true;

        try {
            try { if (a.renderer) a.renderer.clearBeforeRender = false; } catch (e) { /* */ }
            try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
            if (a.view) {
                a.view.style.visibility = "visible";
                a.view.style.opacity = "1";
            }

            // Não esconder DOM antes dos sprites (MP e offline) — onHideSources
            // roda só depois que att/def têm arte no canvas.
            void 0;

            const attUrl = artUrlFromSnap(attSnap);
            const defUrl = defSnap ? artUrlFromSnap(defSnap) : null;
            if (attUrl) await loadTexture(attUrl).catch(() => {});
            if (defUrl) await loadTexture(defUrl).catch(() => {});

            try { clearStage(); } catch (e) { /* */ }

            shakeWrap = new PIXI.Container();
            a.stage.addChild(shakeWrap);
            root = new PIXI.Container();
            shakeWrap.addChild(root);

            attCard = await buildCombatCardSprite(PIXI, attSnap, attW, attH, { texWaitSec: combatTexWaitSec() });
            attCard.x = ax;
            attCard.y = ay;
            attCard.rotation = 0;
            attCard.visible = true;
            attCard.alpha = 1;
            attCard.scale?.set?.(1, 1);
            root.addChild(attCard);

            if (defSnap) {
                defCard = await buildCombatCardSprite(PIXI, defSnap, defW, defH, { texWaitSec: combatTexWaitSec() });
                defCard.x = dx;
                defCard.y = dy;
                defCard.rotation = 0;
                defCard.visible = true;
                defCard.alpha = 1;
                defCard.scale?.set?.(1, 1);
                root.addChild(defCard);
            }

            const spriteHasArt = (spr) => {
                if (!spr?.children?.length) return false;
                return spr.children.some((ch) => {
                    try {
                        return !!(ch?.texture && ch.texture.baseTexture && !ch.texture.baseTexture?.destroyed);
                    } catch (e) { return false; }
                });
            };
            // Sem arte real → aborta (caller restaura DOM e usa fallback).
            if (!spriteHasArt(attCard) || (defSnap && defCard && !spriteHasArt(defCard))) {
                try { shakeWrap?.destroy({ children: true }); } catch (e) { /* */ }
                shakeWrap = null;
                try { clearStage(); } catch (e) { /* */ }
                return false;
            }

            try { a.renderer?.render?.(a.stage); } catch (e) { /* */ }
            await new Promise((r) => requestAnimationFrame(r));
            try { a.renderer?.render?.(a.stage); } catch (e) { /* */ }

            if (!spriteHasArt(attCard) || (defSnap && defCard && !spriteHasArt(defCard))) {
                try { shakeWrap?.destroy({ children: true }); } catch (e) { /* */ }
                shakeWrap = null;
                try { clearStage(); } catch (e) { /* */ }
                return false;
            }

            // MP (+ offline seguro): ocultar DOM só agora — Pixi já mostra as cartas.
            if (typeof onHideSources === "function") {
                try { onHideSources(); } catch (e) { /* */ }
            }
            // Re-esconde no próximo frame (updateUI MP pode recriar .ccard).
            try {
                requestAnimationFrame(() => {
                    try { onHideSources?.(); } catch (e2) { /* */ }
                });
            } catch (eRaf) { /* */ }

            const ok = await animarAtaque(attCard, defCard, {
                gsap,
                gsapBridge,
                mobile: mobileCombat,
                origemX: ax,
                origemY: ay,
                alvoOrigemX: dx,
                alvoOrigemY: dy,
                impactX: attHitX,
                impactY: attHitY,
                alvoImpactX: defHitX,
                alvoImpactY: defHitY,
                alvoDerrotado: killD,
                atacanteDerrotado: killA,
                rushStreakRoot: root,
                rushStreakPIXI: PIXI,
                onImpact: () => {
                    if (typeof onImpactCb === "function") onImpactCb();
                },
                    onAposImpacto: async () => {
                    const clashAngle = Math.atan2(defHitY - attHitY, defHitX - attHitX);
                    await combatWaitSec(mobileCombat ? 0.02 : 0.03);
                    await playCombatClash(clashX, clashY, outcome, {
                        force: true,
                        cinematic: true,
                        fx: perfFx,
                        intensity: 1.15,
                        angle: clashAngle,
                    });
                    await combatImpactShake(shakeWrap, gsapBridge, mobileCombat);
                    await combatWaitSec(mobileCombat ? 0.03 : 0.04);
                },
                destruirAlvo: (killD && defSnap)
                    ? async (dead, x, y) => {
                        reparentCombatCard(root, dead);
                        await playCombatKillDestroy(dead, x, y, defSnap, perfFx, a, "def");
                    }
                    : undefined,
                destruirAtacante: (killA && attSnap)
                    ? async (dead, x, y) => {
                        reparentCombatCard(root, dead);
                        await playCombatKillDestroy(dead, x, y, attSnap, perfFx, a, "att");
                    }
                    : undefined,
            });

            return ok;
        } catch (e) {
            console.warn("[playCombatScene]", e);
            return false;
        } finally {
            combatSceneActive = false;
            ensurePixiViewportLayout(a);
            try { if (a.renderer) a.renderer.clearBeforeRender = true; } catch (e) { /* */ }
            // Devolver o DOM ANTES de destruir os sprites: entre clearStage() e o
            // finally do chamador os campeões ficavam sem Pixi e sem DOM — era o
            // "campeão desaparecendo" no fim da animação de combate.
            try { onShowSources?.(); } catch (eShow) { /* */ }
            try { shakeWrap?.destroy({ children: true }); } catch (e) { /* */ }
            try { clearStage(); } catch (e) { /* */ }
            if (pendingQualityDestroy && quality !== "full") destroyAppForLite();
            try { global.__dfFlushUI?.(); } catch (e) { /* */ }
        }
    }

    function clearStage() {
        if (!app?.stage) return;
        // Preserva o wrap da barragem — clearStage genérico no meio dos
        // mísseis destruía o container e o resto da sequência sumia.
        const keep = _magicMissilesBarrage?.wrap;
        try {
            const kids = app.stage.children.slice();
            kids.forEach((ch) => {
                if (keep && ch === keep) return;
                try { app.stage.removeChild(ch); } catch (e) { /* */ }
                try { ch.destroy?.({ children: true }); } catch (e) { /* */ }
            });
            if (!keep) app.__dfHeroHubLayer = null;
        } catch (e) { /* */ }
        // CRÍTICO: renderiza UM quadro com o palco vazio ANTES de parar o
        // ticker. Sem isto, o back-buffer do WebGL preserva o último frame
        // renderizado — é a causa de animações "presas" na tela (ex.: ultimate
        // do Frosty) e do fantasma da carta (retrato Pixi atrás da carta
        // deitada após atacar). Esvaziar o stage não limpa o canvas sozinho.
        try { app.renderer?.render?.(app.stage); } catch (e) { /* */ }
        try { syncPixiCanvasVisibility(app); } catch (e) { /* */ }
        // Palco vazio → para o ticker para não renderizar frames em branco a
        // 60fps entre cenas (economia de CPU/GPU/bateria, sobretudo mobile).
        // ensureApp() reinicia o ticker em toda nova cena; o hub re-sincroniza
        // via o evento df-pixi-stage-cleared abaixo.
        // Com barragem ativa, NÃO para o ticker (próximo míssil ainda usa).
        try {
            if (!keep && app.ticker && app.ticker.started && app.stage.children.length === 0) {
                app.ticker.stop();
            }
        } catch (e) { /* */ }
        if (keep) return;
        try {
            global.dispatchEvent?.(new CustomEvent("df-pixi-stage-cleared"));
        } catch (e) { /* */ }
        if (app.stage.children.length === 0) trimTextureCaches();
    }

    function destroy() {
        if (app?.__dfResize) global.removeEventListener("resize", app.__dfResize);
        try { app?.destroy?.(true, { children: true, texture: true, baseTexture: true }); } catch (e) { /* */ }
        app = null;
        loadPromise = null;
    }

    // Aba em segundo plano: para o ticker Pixi (mobile não gasta GPU em idle).
    try {
        global.document?.addEventListener?.("visibilitychange", () => {
            const root = global.document?.documentElement;
            if (root) root.classList.toggle("df-page-hidden", !!global.document.hidden);
            if (!app?.ticker) return;
            if (global.document.hidden) {
                try { app.ticker.stop(); } catch (e) { /* */ }
                return;
            }
            try {
                if (app.stage?.children?.length > 0 && !app.ticker.started) app.ticker.start();
            } catch (e) { /* */ }
        }, { passive: true });
    } catch (e) { /* */ }

    const texCache = new Map();

    async function loadTexture(url) {
        if (texCache.has(url)) return texCache.get(url);
        const a = await ensureApp();
        if (!a || !global.PIXI) return null;
        const PIXI = global.PIXI;
        const p = (async () => {
            let tex = null;
            if (PIXI.Assets?.load) {
                try { tex = await PIXI.Assets.load(url); } catch (e) { /* fallback */ }
            }
            if (!tex) {
                tex = await new Promise((resolve, reject) => {
                    const bt = PIXI.BaseTexture.from(url);
                    if (bt.valid) { resolve(new PIXI.Texture(bt)); return; }
                    bt.once("loaded", () => resolve(new PIXI.Texture(bt)));
                    bt.once("error", reject);
                });
            }
            if (tex?.baseTexture) {
                tex.baseTexture.scaleMode = PIXI.SCALE_MODES?.LINEAR ?? tex.baseTexture.scaleMode;
            }
            return tex;
        })().catch((err) => {
            texCache.delete(url);
            console.warn("[DF PixiVfx] texture", url, err);
            return null;
        });
        texCache.set(url, p);
        dfEvictOldestMapEntry(texCache, CARD_TEX_CACHE_MAX, (entry, evictUrl) => {
            dfUnloadPixiAsset(evictUrl);
            if (entry && typeof entry.then === "function") {
                entry.then((tex) => dfDestroyPixiTexture(tex)).catch(() => {});
            } else {
                dfDestroyPixiTexture(entry);
            }
        });
        return p;
    }

    /**
     * Sprite PNG importado (catálogo DfSpriteManifest).
     */
    async function playSprite(spriteId, cx, cy, opts = {}) {
        if (!canUse()) return false;
        const manifest = global.DfSpriteManifest;
        const entry = manifest?.get?.(spriteId);
        if (!entry) return false;
        const a = await ensureApp();
        if (!a || !global.PIXI) return false;

        const frame = pixiSceneFrame(a);
        const mp = frame.map(cx, cy);
        cx = mp.x;
        cy = mp.y;

        const url = manifest.resolveUrl(entry.path);
        const tex = await loadTexture(url);
        if (!tex) {
            frame.end();
            return false;
        }

        const PIXI = global.PIXI;
        const container = new PIXI.Container();
        a.stage.addChild(container);

        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.x = cx;
        sprite.y = cy;
        if (entry.tint) sprite.tint = entry.tint;
        const cardRef = document.querySelector(".ccard, .champion-card");
        const cardW = cardRef ? cardRef.getBoundingClientRect().width : 72;
        const targetW = cardW * (entry.scale ?? 1.2) * (opts.scaleMult ?? 1);
        const baseScale = targetW / Math.max(1, tex.width);
        sprite.alpha = 0;
        sprite.scale.set(baseScale * 0.35);
        container.addChild(sprite);

        const dur = opts.durationMs ?? 720;
        await runEffect(dur, (t) => {
            const pop = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) * 0.55;
            sprite.alpha = Math.min(1, pop * 1.1);
            sprite.scale.set(baseScale * (0.35 + pop * 0.85));
        }, () => {
            try { container.destroy({ children: true }); } catch (e) { /* */ }
            frame.end();
        });
        return true;
    }

    async function playUltimateSprite(ultimateType, cx, cy, recipe) {
        const manifest = global.DfSpriteManifest;
        const spriteId = manifest?.spriteForUltimate?.(ultimateType);
        if (!spriteId) return false;
        return playSprite(spriteId, cx, cy, {
            durationMs: recipe?.timings?.impact ?? 800,
        });
    }

    function cardUnit(mult = 1) {
        const el = document.querySelector(".ccard, .champion-card, .hcard");
        let w = el ? el.getBoundingClientRect().width : 72;
        // Em tela cheia (cinematic) usamos px de viewport direto — NÃO mapear p/
        // canvas, senão a unidade fica pequena demais frente ao viewport grande.
        if (!pixiFullscreenScene && canvasFieldLayout() && global.DfLayout?.viewportRectToCanvas && el) {
            const r = el.getBoundingClientRect();
            const box = global.DfLayout.viewportRectToCanvas(r);
            w = Math.abs(box.width);
        }
        const base = Math.max(52, Math.min(96, w * 0.95));
        return base * mult;
    }

    /** Texturas de sprite sheet procedural (DfSpriteVfx) — cacheadas por sheetId. */
    async function sheetTextures(PIXI, sheetId) {
        const cached = __sheetTexCache.get(sheetId);
        if (cached?.frames?.length) return cached;
        const sh = await global.DfSpriteVfx?.getBakedSheet?.(sheetId);
        if (!sh?.canvas) return null;
        const base = PIXI.BaseTexture.from(sh.canvas);
        const frames = [];
        for (let f = 0; f < sh.frames; f++) {
            frames.push(new PIXI.Texture(base, new PIXI.Rectangle(f * sh.size, 0, sh.size, sh.size)));
        }
        const pack = { frames, meta: sh, base };
        __sheetTexCache.set(sheetId, pack);
        dfEvictOldestMapEntry(__sheetTexCache, SHEET_TEX_CACHE_MAX, (entry) => {
            try { entry?.base?.destroy?.(); } catch (e) { /* */ }
            entry?.frames?.forEach((t) => dfDestroyPixiTexture(t));
        });
        return pack;
    }

    function sheetScale(unit, sheetSize, mult = 1) {
        return (unit * mult) / Math.max(1, sheetSize);
    }

    /** Partícula de fumaça/faísca reutilizável. */
    function makeSmokePuff(PIXI, unit, warm) {
        const g = new PIXI.Graphics();
        const r = unit * (warm ? 0.04 + Math.random() * 0.07 : 0.06 + Math.random() * 0.14);
        const col = warm
            ? (Math.random() > 0.5 ? 0xffaa44 : 0xff6622)
            : (Math.random() > 0.4 ? 0x665544 : 0x443322);
        g.beginFill(col, warm ? 0.92 : 0.55);
        g.drawCircle(0, 0, r);
        g.endFill();
        if (warm && PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    function makeEmber(PIXI, theme, unit, large) {
        const g = new PIXI.Graphics();
        const r = unit * (large ? 0.055 + Math.random() * 0.09 : 0.028 + Math.random() * 0.055);
        const col = Math.random() > 0.35 ? theme.spark : (Math.random() > 0.5 ? theme.core : 0xff4400);
        g.beginFill(col, 0.95);
        if (large) {
            g.drawEllipse(0, 0, r * 1.4, r);
        } else {
            g.drawCircle(0, 0, r);
        }
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    function makeDebris(PIXI, unit) {
        const g = new PIXI.Graphics();
        const r = unit * (0.035 + Math.random() * 0.06);
        g.beginFill(0x2a1810, 0.88);
        g.drawEllipse(0, 0, r * 1.6, r);
        g.endFill();
        return g;
    }

    /** Estilhaço angular de fogo — impacto dramático. */
    function makeFireShard(PIXI, theme, unit) {
        const g = new PIXI.Graphics();
        const len = unit * (0.08 + Math.random() * 0.14);
        const wid = unit * (0.025 + Math.random() * 0.035);
        const col = Math.random() > 0.4 ? 0xff5500 : (Math.random() > 0.5 ? 0xffcc22 : 0x9a1820);
        g.beginFill(col, 0.92);
        g.drawPolygon([
            -wid / 2, -len / 2,
            wid / 2, -len / 2,
            wid * 0.3, len / 2,
            -wid * 0.3, len / 2,
        ]);
        g.endFill();
        g.beginFill(0xffffcc, 0.45);
        g.drawPolygon([-wid * 0.15, -len * 0.35, wid * 0.15, -len * 0.35, 0, len * 0.2]);
        g.endFill();
        g.__shard = true;
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Fragmento carbonizado — contraste no impacto. */
    function makeCharShard(PIXI, unit) {
        const g = new PIXI.Graphics();
        const len = unit * (0.05 + Math.random() * 0.11);
        const wid = unit * (0.018 + Math.random() * 0.028);
        const col = Math.random() > 0.45 ? 0x2a1810 : 0x120808;
        g.beginFill(col, 0.92);
        g.drawPolygon([
            -wid / 2, -len / 2,
            wid / 2, -len / 2,
            wid * 0.35, len / 2,
            -wid * 0.25, len / 2,
        ]);
        g.endFill();
        g.__shard = true;
        g.__char = true;
        return g;
    }

    /** Silhueta luminosa da carta na mão — origem do talento. */
    function makeHandOriginGlow(PIXI, theme, unit) {
        const wrap = new PIXI.Container();
        const cardW = unit * 0.58;
        const cardH = unit * 0.82;
        const bloom = makeSoftBloom(PIXI, theme, unit, 1.05);
        bloom.alpha = 0.55;
        wrap.addChild(bloom);
        const glow = new PIXI.Graphics();
        glow.beginFill(theme.core, 0.22);
        glow.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, unit * 0.045);
        glow.endFill();
        glow.lineStyle(unit * 0.02, theme.ring, 0.82);
        glow.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, unit * 0.045);
        wrap.addChild(glow);
        const inner = new PIXI.Graphics();
        inner.beginFill(0xffffcc, 0.35);
        inner.drawRoundedRect(-cardW * 0.22, -cardH * 0.28, cardW * 0.44, cardH * 0.56, unit * 0.03);
        inner.endFill();
        if (PIXI.BLEND_MODES) inner.blendMode = PIXI.BLEND_MODES.ADD;
        wrap.addChild(inner);
        return wrap;
    }

    /** Cauda de chama alongada no projétil. */
    function makeFlameStreak(PIXI, theme, unit, streakLen) {
        const g = new PIXI.Graphics();
        const w = unit * (0.028 + Math.random() * 0.022);
        const len = streakLen || unit * (0.35 + Math.random() * 0.45);
        g.beginFill(theme.spark, 0.88);
        g.moveTo(0, 0);
        g.lineTo(-w, -len);
        g.lineTo(w, -len);
        g.closePath();
        g.endFill();
        g.beginFill(0xffffaa, 0.55);
        g.moveTo(0, 0);
        g.lineTo(-w * 0.35, -len * 0.62);
        g.lineTo(w * 0.35, -len * 0.62);
        g.closePath();
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Nuvem de fumaça volumétrica (impacto / rastro). */
    function makeSmokePlume(PIXI, unit, dark) {
        const g = new PIXI.Graphics();
        const r = unit * (0.12 + Math.random() * 0.26);
        const col = dark
            ? (0x2a1828 + Math.floor(Math.random() * 0x0c0808))
            : (0x554433 + Math.floor(Math.random() * 0x151515));
        g.beginFill(col, dark ? 0.68 : 0.5);
        g.drawEllipse(0, 0, r, r * (0.58 + Math.random() * 0.38));
        g.endFill();
        if (!dark) {
            g.beginFill(0x776655, 0.28);
            g.drawEllipse(0, r * 0.12, r * 0.72, r * 0.38);
            g.endFill();
        }
        return g;
    }

    /** Partícula verde suave — só preenchimento (sem estrelas/traços). */
    function makeFortifySpark(PIXI, theme, unit, large) {
        const g = new PIXI.Graphics();
        const r = unit * (large ? 0.055 + Math.random() * 0.05 : 0.022 + Math.random() * 0.038);
        const col = Math.random() > 0.4 ? theme.flash : theme.spark;
        g.beginFill(col, large ? 0.78 : 0.88);
        g.drawCircle(0, 0, r);
        g.endFill();
        if (large) {
            g.beginFill(0xffffff, 0.42);
            g.drawCircle(0, 0, r * 0.45);
            g.endFill();
        }
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Halo difuso — círculo preenchido (sem lineStyle). */
    function makeSoftBloom(PIXI, theme, unit, scale) {
        const g = new PIXI.Graphics();
        const r = unit * scale;
        g.beginFill(theme.spark, 0.18);
        g.drawCircle(0, 0, r);
        g.endFill();
        g.beginFill(theme.flash, 0.32);
        g.drawCircle(0, 0, r * 0.55);
        g.endFill();
        g.beginFill(0xffffff, 0.22);
        g.drawCircle(0, 0, r * 0.22);
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /* ============================================================
     * Builders CARTOON "Hearthstone" — contornos grossos escuros,
     * cores saturadas e brilhos chapados (sem ADD nos contornos).
     * Reutilizados pelas ultimates (Bomba, Fortalecer, Conjurar, Congelar).
     * ============================================================ */

    /** Estrela cartoon de 5 pontas com contorno grosso. */
    function makeToonStar(PIXI, fillColor, outlineColor, unit, sizeMult = 1) {
        const g = new PIXI.Graphics();
        const R = unit * 0.17 * sizeMult;
        const r = R * 0.46;
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const rad = i % 2 === 0 ? R : r;
            pts.push(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        g.lineStyle(Math.max(1.5, unit * 0.032), outlineColor, 1);
        g.beginFill(fillColor, 1);
        g.drawPolygon(pts);
        g.endFill();
        g.beginFill(0xffffff, 0.72);
        g.drawCircle(-R * 0.16, -R * 0.2, R * 0.2);
        g.endFill();
        return g;
    }

    /** Explosão cômica "BAM!" — estrela pontuda dupla com contorno escuro. */
    function buildComicBurst(PIXI, fillColor, outlineColor, unit, spikes = 12, sizeMult = 1) {
        const g = new PIXI.Graphics();
        const R = unit * 0.95 * sizeMult;
        const total = spikes * 2;
        const pts = [];
        for (let i = 0; i < total; i++) {
            const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
            const rad = i % 2 === 0 ? R : R * (0.52 + (i % 4 === 0 ? 0.08 : 0));
            pts.push(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        g.lineStyle(Math.max(2, unit * 0.05), outlineColor, 1);
        g.beginFill(fillColor, 1);
        g.drawPolygon(pts);
        g.endFill();
        const inner = pts.map((v) => v * 0.58);
        g.beginFill(0xffffff, 0.58);
        g.drawPolygon(inner);
        g.endFill();
        return g;
    }

    /** Anel toon grosso (onda de choque) com contorno escuro + miolo claro. */
    function makeToonRing(PIXI, fillColor, outlineColor, unit, radiusMult = 1) {
        const g = new PIXI.Graphics();
        const R = unit * 0.5 * radiusMult;
        g.lineStyle(Math.max(3, unit * 0.085), outlineColor, 0.95);
        g.drawCircle(0, 0, R);
        g.lineStyle(Math.max(2, unit * 0.052), fillColor, 1);
        g.drawCircle(0, 0, R);
        return g;
    }

    /** Tween Pixi rastreado no bridge (killAll / forceClearStage limpam). */
    function dfGsapTo(gsap, target, vars) {
        const bridge = global.DfGsapBridge;
        if (bridge?.to) return bridge.to(target, vars);
        if (bridge?.track && gsap?.to) return bridge.track(gsap.to(target, vars));
        return gsap?.to?.(target, vars);
    }

    /** Dispara estrelinhas cartoon saltitantes a partir de (cx,cy). */
    function spawnToonPopStars(container, PIXI, gsap, cx, cy, fillColor, outlineColor, unit, count) {
        for (let i = 0; i < count; i++) {
            const st = makeToonStar(PIXI, fillColor, outlineColor, unit, 0.55 + Math.random() * 0.7);
            st.x = cx + (Math.random() - 0.5) * unit * 0.5;
            st.y = cy + (Math.random() - 0.5) * unit * 0.42;
            st.alpha = 0;
            st.scale.set(0.1);
            st.rotation = (Math.random() - 0.5) * 1.1;
            container.addChild(st);
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const dist = unit * (0.75 + Math.random() * 1.35);
            dfGsapTo(gsap, st, { alpha: 1, duration: 0.1 });
            dfGsapTo(gsap, st.scale, { x: 1, y: 1, duration: 0.34, ease: "back.out(2.6)" });
            dfGsapTo(gsap, st, {
                x: st.x + Math.cos(ang) * dist,
                y: st.y + Math.sin(ang) * dist,
                rotation: st.rotation + (Math.random() - 0.5) * 2.4,
                duration: 0.62 + Math.random() * 0.4,
                ease: "power2.out",
            });
            dfGsapTo(gsap, st, {
                alpha: 0,
                duration: 0.32,
                delay: 0.46,
                onComplete: () => { try { st.destroy(); } catch (e) { /* */ } },
            });
        }
    }

    /** Pancada cartoon completa: "BAM" + anel toon + estrelinhas (impacto Hearthstone). */
    function spawnCartoonImpact(container, PIXI, gsap, cx, cy, fillColor, outlineColor, unit, opts = {}) {
        const sizeMult = opts.sizeMult ?? 1;
        const stars = opts.stars ?? 8;
        if (opts.burst !== false) {
            const burst = buildComicBurst(PIXI, fillColor, outlineColor, unit, opts.spikes ?? 12, sizeMult);
            burst.x = cx; burst.y = cy; burst.alpha = 0; burst.scale.set(0.1);
            burst.rotation = (Math.random() - 0.5) * 0.5;
            container.addChild(burst);
            dfGsapTo(gsap, burst, { alpha: 1, duration: 0.08 });
            dfGsapTo(gsap, burst.scale, { x: 1.05 * sizeMult, y: 1.05 * sizeMult, duration: 0.26, ease: "back.out(2.2)" });
            dfGsapTo(gsap, burst, { rotation: burst.rotation + 0.3, duration: 0.62, ease: "sine.out" });
            dfGsapTo(gsap, burst, {
                alpha: 0, duration: 0.3, delay: 0.24,
                onComplete: () => { try { burst.destroy(); } catch (e) { /* */ } },
            });
        }
        const ring = makeToonRing(PIXI, fillColor, outlineColor, unit, sizeMult);
        ring.x = cx; ring.y = cy; ring.alpha = 0; ring.scale.set(0.15);
        container.addChild(ring);
        dfGsapTo(gsap, ring, { alpha: 0.95, duration: 0.06 });
        dfGsapTo(gsap, ring.scale, { x: 3.2 * sizeMult, y: 3.2 * sizeMult, duration: 0.55, ease: "power2.out" });
        dfGsapTo(gsap, ring, {
            alpha: 0, duration: 0.34, delay: 0.2,
            onComplete: () => { try { ring.destroy(); } catch (e) { /* */ } },
        });
        spawnToonPopStars(container, PIXI, gsap, cx, cy, fillColor, outlineColor, unit, stars);
    }

    /** Impacto suave (blooms + ondas) — sem estrela pontuda nem contorno cartoon. */
    function addSoftImpactToTimeline(tl, parent, PIXI, theme, unit, cinematic, label, colors) {
        const core = colors?.core ?? theme.core;
        const flash = colors?.flash ?? theme.flash;
        const local = new PIXI.Container();
        local.x = colors?.x ?? 0;
        local.y = colors?.y ?? 0;
        parent.addChild(local);

        const wash = new PIXI.Graphics();
        wash.beginFill(flash, 0.42);
        wash.drawCircle(0, 0, unit * 1.4);
        wash.endFill();
        if (PIXI.BLEND_MODES) wash.blendMode = PIXI.BLEND_MODES.ADD;
        wash.alpha = 0;
        wash.scale.set(0.15);
        local.addChild(wash);

        const blooms = [];
        for (let i = 0; i < (cinematic ? 3 : 2); i++) {
            const b = makeSoftBloom(PIXI, theme, unit, 1.15 + i * 0.28);
            b.alpha = 0;
            b.scale.set(0.18);
            local.addChild(b);
            blooms.push(b);
        }
        const rings = [];
        for (let ri = 0; ri < 3; ri++) {
            const ring = new PIXI.Graphics();
            ring.beginFill(core, 0.32 - ri * 0.06);
            ring.drawEllipse(0, 0, unit * (0.65 + ri * 0.16), unit * (0.5 + ri * 0.13));
            ring.endFill();
            if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
            ring.alpha = 0;
            ring.scale.set(0.2);
            local.addChild(ring);
            rings.push(ring);
        }

        tl.to(wash, { alpha: 0.9, duration: 0.05 }, label);
        tl.to(wash.scale, { x: 2.4, y: 2.4, duration: 0.38, ease: "power2.out" }, label);
        tl.to(wash, { alpha: 0, duration: 0.32, ease: "power2.out" }, `${label}+=0.1`);

        blooms.forEach((b, i) => {
            const off = i * 0.04;
            tl.to(b, { alpha: 0.92 - i * 0.12, duration: 0.06 }, `${label}+=${off}`);
            tl.to(b.scale, { x: 2.1 + i * 0.35, y: 2.1 + i * 0.35, duration: 0.42, ease: "power2.out" }, `${label}+=${off}`);
            tl.to(b, { alpha: 0, duration: 0.34, ease: "power2.out" }, `${label}+=${0.14 + off}`);
        });
        rings.forEach((ring, ri) => {
            const off = ri * 0.05;
            tl.to(ring, { alpha: 0.82, duration: 0.06 }, `${label}+=${off}`);
            tl.to(ring.scale, { x: 2.8 + ri * 0.45, y: 2.4 + ri * 0.38, duration: 0.52, ease: "power2.out" }, `${label}+=${off}`);
            tl.to(ring, { alpha: 0, duration: 0.3, ease: "power2.out" }, `${label}+=${0.2 + off}`);
        });
        tl.add(() => { try { local.destroy({ children: true }); } catch (e) { /* */ } }, `${label}+=0.65`);
    }

    /** Fogo + fumaça no impacto (Rei Bomba) — timeline, sem estrela cartoon. */
    function addFireBurstToTimeline(tl, parent, smokeParent, PIXI, theme, unit, cinematic, label, cx, cy) {
        const fireTheme = themeFromRecipe({ hue: 22 });
        addSoftImpactToTimeline(tl, parent, PIXI, fireTheme, unit, cinematic, label, { x: cx, y: cy, core: 0xff7020, flash: 0xffe080 });

        const emberN = n(cinematic ? 28 : 14);
        const embers = [];
        for (let i = 0; i < emberN; i++) {
            const em = makeSoftOrb(PIXI, i % 3 === 0 ? 0xfff4c8 : 0xff5020, unit * (0.05 + Math.random() * 0.09), 0.9);
            em.x = cx; em.y = cy; em.visible = false;
            parent.addChild(em);
            const ang = Math.random() * Math.PI * 2;
            embers.push({ g: em, ang, dist: unit * (0.5 + Math.random() * 2), lift: 0.2 + Math.random() * 0.8 });
        }
        const smokeN = n(cinematic ? 8 : 4);
        const smokes = [];
        for (let si = 0; si < smokeN; si++) {
            const sm = makeSmokePuff(PIXI, unit * 1.3, true);
            sm.x = cx + (Math.random() - 0.5) * unit * 0.6;
            sm.y = cy + unit * 0.05;
            sm.alpha = 0;
            sm.scale.set(0.35);
            smokeParent.addChild(sm);
            smokes.push(sm);
        }

        tl.add(() => {
            embers.forEach((e) => { e.g.visible = true; e.g.alpha = 1; });
        }, label);
        tl.to({}, {
            duration: 0.7,
            ease: "power2.out",
            onUpdate: function () {
                const p = this.progress();
                embers.forEach((e) => {
                    e.g.x = cx + Math.cos(e.ang) * e.dist * p;
                    e.g.y = cy + Math.sin(e.ang) * e.dist * p * 0.85 - unit * e.lift * p;
                    e.g.alpha = Math.max(0, 1 - p * 1.1);
                });
            },
        }, label);
        smokes.forEach((sm, idx) => {
            const at = `${label}+=${0.08 + idx * 0.04}`;
            tl.to(sm, { alpha: 0.6, duration: 0.16 }, at);
            tl.to(sm.scale, { x: 2, y: 2, duration: 0.85, ease: "sine.out" }, at);
            tl.to(sm, { y: sm.y - unit * (0.8 + idx * 0.12), duration: 0.85, ease: "sine.out" }, at);
            tl.to(sm, { alpha: 0, duration: 0.4, ease: "power2.in" }, `${at}+=0.5`);
        });
    }

    /** Floco de neve cartoon (projétil de Congelar). */
    function buildToonSnowflake(PIXI, unit, sizeMult = 1) {
        const root = new PIXI.Container();
        const outline = 0x2a7da8;
        const R = unit * 0.42 * sizeMult;
        const arms = new PIXI.Graphics();
        arms.lineStyle(Math.max(2.4, unit * 0.06), outline, 1);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            arms.moveTo(0, 0);
            arms.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
            const bx = Math.cos(ang) * R * 0.6;
            const by = Math.sin(ang) * R * 0.6;
            arms.moveTo(bx, by);
            arms.lineTo(bx + Math.cos(ang + 0.9) * R * 0.26, by + Math.sin(ang + 0.9) * R * 0.26);
            arms.moveTo(bx, by);
            arms.lineTo(bx + Math.cos(ang - 0.9) * R * 0.26, by + Math.sin(ang - 0.9) * R * 0.26);
        }
        root.addChild(arms);
        const armsW = new PIXI.Graphics();
        armsW.lineStyle(Math.max(1.2, unit * 0.026), 0xffffff, 0.95);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            armsW.moveTo(0, 0);
            armsW.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
        }
        root.addChild(armsW);
        const hub = new PIXI.Graphics();
        hub.lineStyle(Math.max(1.6, unit * 0.034), outline, 1);
        hub.beginFill(0xeaffff, 1);
        hub.drawCircle(0, 0, unit * 0.1 * sizeMult);
        hub.endFill();
        hub.beginFill(0xffffff, 0.85);
        hub.drawCircle(-unit * 0.03, -unit * 0.03, unit * 0.04);
        hub.endFill();
        root.addChild(hub);
        return root;
    }

    /** Cristal de gelo cartoon que encapsula o alvo (hexágono facetado). */
    function buildToonIceCrystal(PIXI, unit, sizeMult = 1) {
        const root = new PIXI.Container();
        const w = unit * 1.2 * sizeMult;
        const h = unit * 1.62 * sizeMult;
        const outline = 0x1f6e93;
        const hex = [
            0, -h * 0.5,
            w * 0.5, -h * 0.24,
            w * 0.5, h * 0.24,
            0, h * 0.5,
            -w * 0.5, h * 0.24,
            -w * 0.5, -h * 0.24,
        ];
        const halo = new PIXI.Graphics();
        halo.beginFill(0x9fe9ff, 0.2);
        halo.drawCircle(0, 0, w * 0.82);
        halo.endFill();
        if (PIXI.BLEND_MODES) halo.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(halo);
        const body = new PIXI.Graphics();
        body.lineStyle(Math.max(2.6, unit * 0.06), outline, 1);
        body.beginFill(0x8fe3ff, 0.9);
        body.drawPolygon(hex);
        body.endFill();
        root.addChild(body);
        const facet = new PIXI.Graphics();
        facet.beginFill(0xcdf4ff, 0.85);
        facet.drawPolygon([0, -h * 0.5, w * 0.5, -h * 0.24, 0, h * 0.08, -w * 0.5, -h * 0.24]);
        facet.endFill();
        facet.beginFill(0xb4ecff, 0.55);
        facet.drawPolygon([0, h * 0.08, w * 0.5, h * 0.24, 0, h * 0.5, -w * 0.5, h * 0.24]);
        facet.endFill();
        root.addChild(facet);
        const shine = new PIXI.Graphics();
        shine.beginFill(0xffffff, 0.9);
        shine.drawPolygon([-w * 0.2, -h * 0.4, -w * 0.06, -h * 0.4, -w * 0.26, h * 0.18, -w * 0.4, h * 0.18]);
        shine.endFill();
        shine.beginFill(0xffffff, 0.52);
        shine.drawPolygon([w * 0.12, -h * 0.28, w * 0.22, -h * 0.28, w * 0.04, h * 0.24, -w * 0.06, h * 0.24]);
        shine.endFill();
        root.addChild(shine);
        return { root, body, facet, shine, halo, w, h };
    }

    /** Lasca/diamante de gelo cartoon para partículas. */
    function makeFrostSpeck(PIXI, unit, large) {
        const g = new PIXI.Graphics();
        const outline = 0x2a7da8;
        const r = unit * (large ? 0.06 + Math.random() * 0.05 : 0.03 + Math.random() * 0.04);
        g.lineStyle(Math.max(1, unit * 0.02), outline, 0.9);
        g.beginFill(Math.random() > 0.5 ? 0xeaffff : 0xb4ecff, 1);
        g.drawPolygon([0, -r * 1.5, r, 0, 0, r * 1.5, -r, 0]);
        g.endFill();
        return g;
    }

    /** Glifo RPG de fortalecimento — losango ou seta de poder (só fills). */
    function makePowerGlyph(PIXI, theme, unit, variant) {
        const g = new PIXI.Graphics();
        const s = unit * (0.1 + Math.random() * 0.06);
        const v = variant ?? (Math.random() > 0.45 ? "diamond" : "arrow");
        if (v === "arrow") {
            g.beginFill(theme.flash, 0.82);
            g.drawPolygon([0, -s, s * 0.55, s * 0.15, s * 0.28, s * 0.15, s * 0.28, s, -s * 0.28, s, -s * 0.28, s * 0.15, -s * 0.55, s * 0.15]);
            g.endFill();
            g.beginFill(0xffffff, 0.38);
            g.drawPolygon([0, -s * 0.72, s * 0.22, s * 0.12, -s * 0.22, s * 0.12]);
            g.endFill();
        } else {
            g.beginFill(theme.flash, 0.82);
            g.drawPolygon([0, -s, s * 0.72, 0, 0, s, -s * 0.72, 0]);
            g.endFill();
            g.beginFill(theme.core, 0.55);
            g.drawPolygon([0, -s * 0.55, s * 0.4, 0, 0, s * 0.55, -s * 0.4, 0]);
            g.endFill();
        }
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Anel de runa preenchido — aura RPG sem traços. */
    function makeFortifyRuneRing(PIXI, theme, unit) {
        const g = new PIXI.Graphics();
        const r = unit * 0.72;
        g.beginFill(theme.core, 0.12);
        g.drawCircle(0, 0, r);
        g.endFill();
        g.beginFill(theme.flash, 0.22);
        g.drawCircle(0, 0, r * 0.62);
        g.endFill();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const gx = Math.cos(ang) * r * 0.78;
            const gy = Math.sin(ang) * r * 0.78;
            const dot = unit * 0.045;
            g.beginFill(i % 2 ? theme.flash : 0xffffff, 0.65);
            g.drawCircle(gx, gy, dot);
            g.endFill();
        }
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Pilar de luz divino + poça no chão — só fills. */
    function buildFortifyPillar(PIXI, theme, unit, pillarH) {
        const root = new PIXI.Container();

        const pool = new PIXI.Graphics();
        pool.beginFill(theme.core, 0.38);
        pool.drawEllipse(0, unit * 0.1, unit * 1.05, unit * 0.32);
        pool.endFill();
        pool.beginFill(theme.flash, 0.28);
        pool.drawEllipse(0, unit * 0.06, unit * 0.62, unit * 0.18);
        pool.endFill();
        if (PIXI.BLEND_MODES) pool.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(pool);

        for (let band = 0; band < 7; band++) {
            const w = unit * (0.58 - band * 0.065);
            const col = band < 2 ? 0xffffff : (band < 4 ? theme.flash : theme.spark);
            const a = 0.42 - band * 0.045;
            const beam = new PIXI.Graphics();
            beam.beginFill(col, a);
            beam.drawRoundedRect(-w / 2, -pillarH, w, pillarH, w * 0.2);
            beam.endFill();
            if (PIXI.BLEND_MODES && band < 5) beam.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(beam);
        }

        const crown = new PIXI.Graphics();
        crown.beginFill(theme.flash, 0.62);
        crown.drawEllipse(0, -pillarH + unit * 0.12, unit * 0.48, unit * 0.2);
        crown.endFill();
        crown.beginFill(0xffffff, 0.38);
        crown.drawEllipse(0, -pillarH + unit * 0.1, unit * 0.22, unit * 0.1);
        crown.endFill();
        if (PIXI.BLEND_MODES) crown.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(crown);

        return root;
    }

    /** Bloom verde procedural — fallback se sheet de impacto ausente. */
    function buildProceduralFortifyBloom(PIXI, theme, unit) {
        const root = new PIXI.Container();
        const frames = [];
        const frameCount = 16;
        for (let f = 0; f < frameCount; f++) {
            const t = f / (frameCount - 1);
            const g = new PIXI.Graphics();
            const alpha = 1 - t * 0.88;
            const coreR = unit * (0.1 + t * 0.32);
            g.beginFill(theme.flash, alpha * 0.85);
            g.drawCircle(0, 0, coreR * 0.4);
            g.endFill();
            for (let layer = 0; layer < 4; layer++) {
                const r = unit * (0.08 + t * (0.18 + layer * 0.1));
                g.beginFill(layer < 2 ? theme.core : theme.spark, alpha * (0.72 - layer * 0.14));
                g.drawCircle(0, -unit * t * 0.12, r);
                g.endFill();
            }
            for (let i = 0; i < 12; i++) {
                const ang = (i / 12) * Math.PI * 2 + t * 0.5;
                const dist = unit * (0.06 + t * 0.38);
                const pr = unit * (0.014 + t * 0.035);
                g.beginFill(i % 2 ? theme.spark : theme.core, alpha * 0.8);
                g.drawCircle(
                    Math.cos(ang) * dist,
                    Math.sin(ang) * dist * 0.55 - unit * t * 0.22,
                    pr,
                );
                g.endFill();
            }
            g.visible = f === 0;
            g.alpha = 0;
            root.addChild(g);
            frames.push(g);
        }
        return { root, frames, frameCount };
    }

    /** Explosão procedural em camadas — fallback genérico. */
    function buildProceduralExplosion(PIXI, theme, unit) {
        const root = new PIXI.Container();
        const frames = [];
        const frameCount = 14;
        for (let f = 0; f < frameCount; f++) {
            const t = f / (frameCount - 1);
            const g = new PIXI.Graphics();
            const alpha = 1 - t * 0.92;
            const coreR = unit * (0.12 + t * 0.38);
            g.beginFill(theme.flash, alpha * 0.9);
            g.drawCircle(0, 0, coreR * 0.35);
            g.endFill();
            for (let layer = 0; layer < 5; layer++) {
                const r = unit * (0.1 + t * (0.22 + layer * 0.12));
                const col = layer < 2 ? theme.core : (layer < 4 ? theme.spark : 0x4a2010);
                g.beginFill(col, alpha * (0.78 - layer * 0.12));
                g.drawCircle(0, 0, r);
                g.endFill();
            }
            for (let i = 0; i < 10; i++) {
                const ang = (i / 10) * Math.PI * 2 + t * 0.4;
                const dist = unit * (0.08 + t * 0.42);
                const pr = unit * (0.018 + t * 0.04);
                g.beginFill(i % 2 ? theme.spark : theme.core, alpha * 0.82);
                g.drawCircle(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.88, pr);
                g.endFill();
            }
            g.visible = f === 0;
            g.alpha = 0;
            root.addChild(g);
            frames.push(g);
        }
        return { root, frames, frameCount };
    }

    /** Explosão Bola de Fogo — ondas de fogo, estilhaços e fumaça (sem flash de tela pesado). */
    function buildFireballExplosion(PIXI, theme, unit) {
        const root = new PIXI.Container();
        const frames = [];
        const frameCount = 20;
        for (let f = 0; f < frameCount; f++) {
            const t = f / (frameCount - 1);
            const g = new PIXI.Graphics();
            const fade = 1 - t * 0.92;
            const coreR = unit * (0.06 + t * 0.48);

            g.beginFill(0xffffee, fade * 0.9);
            g.drawCircle(0, 0, coreR * 0.32);
            g.endFill();
            g.beginFill(0xffee44, fade * 0.85);
            g.drawCircle(0, 0, coreR * 0.55);
            g.endFill();
            g.beginFill(0xff6600, fade * 0.78);
            g.drawCircle(0, 0, coreR * 0.82);
            g.endFill();
            g.beginFill(0xff3300, fade * 0.62);
            g.drawCircle(0, 0, coreR * 1.05);
            g.endFill();
            g.beginFill(0x8a1820, fade * 0.45);
            g.drawCircle(0, 0, coreR * 1.22);
            g.endFill();

            const ringR = unit * (0.18 + t * 0.72);
            g.lineStyle(unit * 0.028, 0xffaa33, fade * 0.7);
            g.drawCircle(0, 0, ringR);
            g.lineStyle(unit * 0.018, 0xff4400, fade * 0.45);
            g.drawCircle(0, 0, ringR * 0.72);

            const tongueN = 10 + Math.floor(t * 8);
            for (let i = 0; i < tongueN; i++) {
                const ang = (i / tongueN) * Math.PI * 2 + t * 0.6;
                const dist = unit * (0.12 + t * (0.58 + (i % 3) * 0.1));
                const len = unit * (0.1 + t * 0.42);
                const wid = unit * (0.03 + t * 0.05);
                const tx = Math.cos(ang) * dist;
                const ty = Math.sin(ang) * dist * 0.88;
                const col = i % 3 === 0 ? 0xffcc22 : (i % 3 === 1 ? 0xff5500 : 0xaa1820);
                g.beginFill(col, fade * 0.85);
                g.drawPolygon([
                    tx, ty,
                    tx + Math.cos(ang + 0.38) * len, ty + Math.sin(ang + 0.38) * len,
                    tx + Math.cos(ang - 0.38) * len, ty + Math.sin(ang - 0.38) * len,
                ]);
                g.endFill();
            }

            const shardN = 18;
            for (let i = 0; i < shardN; i++) {
                const ang = (i / shardN) * Math.PI * 2 + t * 0.85;
                const dist = unit * (0.08 + t * 0.62);
                const pr = unit * (0.018 + t * 0.045);
                const col = i % 2 ? 0xff6622 : 0xffaa33;
                g.beginFill(col, fade * 0.88);
                g.drawCircle(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.9, pr);
                g.endFill();
            }

            if (t > 0.18) {
                const smokeT = (t - 0.18) / 0.82;
                const smokeR = unit * (0.16 + smokeT * 0.72);
                g.beginFill(0x1a1018, (1 - smokeT) * 0.5);
                g.drawEllipse(0, unit * 0.06, smokeR, smokeR * 0.5);
                g.endFill();
                g.beginFill(0x3a2838, (1 - smokeT) * 0.32);
                g.drawEllipse(0, -unit * 0.1, smokeR * 0.68, smokeR * 0.34);
                g.endFill();
            }

            g.visible = f === 0;
            g.alpha = 0;
            root.addChild(g);
            frames.push(g);
        }
        return { root, frames, frameCount };
    }

    /**
     * Projétil Bola de Fogo — cometa cartoon (cabeça +X, cauda −X), estilo referência Hearthstone.
     * Camadas: glow, corpo vermelho-laranja, línguas de chama, cabeça amarela, núcleo branco, contorno, faísca.
     */
    function buildReferenceFireballProjectile(PIXI, unit) {
        const root = new PIXI.Container();
        const u = unit;
        const hx = u * 0.34;
        const hr = u * 0.31;
        const silhouette = [
            hx + hr * 0.74, -hr * 0.50,
            hx + hr * 0.20, -hr * 0.90,
            -u * 0.12, -u * 0.32,
            -u * 0.38, -u * 0.26,
            -u * 0.64, -u * 0.38,
            -u * 0.48, -u * 0.12,
            -u * 0.84, -u * 0.18,
            -u * 0.98, -u * 0.03,
            -u * 0.84, u * 0.14,
            -u * 0.70, u * 0.32,
            -u * 0.46, u * 0.22,
            -u * 0.20, u * 0.34,
            hx - hr * 0.06, hr * 0.80,
            hx + hr * 0.70, hr * 0.48,
        ];

        const aura = new PIXI.Graphics();
        aura.beginFill(0xff3311, 0.10);
        aura.drawCircle(hx * 0.55, 0, u * 0.82);
        aura.endFill();
        aura.beginFill(0xff5511, 0.16);
        aura.drawCircle(hx * 0.70, -u * 0.02, u * 0.58);
        aura.endFill();
        aura.beginFill(0xff8822, 0.22);
        aura.drawCircle(hx, -u * 0.02, u * 0.42);
        aura.endFill();
        if (PIXI.BLEND_MODES) aura.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(aura);
        root.__aura = aura;

        const body = new PIXI.Graphics();
        body.beginFill(0xff4400, 1);
        body.drawPolygon(silhouette);
        body.endFill();
        body.beginFill(0xff6600, 0.94);
        body.drawPolygon([
            hx + hr * 0.48, -hr * 0.34,
            hx + hr * 0.06, -hr * 0.64,
            -u * 0.24, -u * 0.20,
            -u * 0.60, -u * 0.24,
            -u * 0.74, -u * 0.05,
            -u * 0.60, u * 0.20,
            -u * 0.30, u * 0.22,
            hx - hr * 0.04, hr * 0.54,
            hx + hr * 0.44, hr * 0.30,
        ]);
        body.endFill();
        root.addChild(body);

        const tailTongues = new PIXI.Container();
        const tongueSpecs = [
            { x1: u * 0.12, y1: 0, x2: -u * 0.96, y2: -u * 0.05, bulge: u * 0.15, col: 0xff5500 },
            { x1: u * 0.08, y1: u * 0.15, x2: -u * 0.78, y2: u * 0.32, bulge: u * 0.12, col: 0xff6622 },
            { x1: u * 0.10, y1: -u * 0.17, x2: -u * 0.66, y2: -u * 0.34, bulge: u * 0.11, col: 0xff5500 },
            { x1: u * 0.14, y1: u * 0.24, x2: -u * 0.54, y2: u * 0.18, bulge: u * 0.09, col: 0xff7722 },
        ];
        tongueSpecs.forEach((spec, i) => {
            const tg = new PIXI.Graphics();
            const mx = (spec.x1 + spec.x2) * 0.5;
            const my = (spec.y1 + spec.y2) * 0.5;
            const dx = spec.x2 - spec.x1;
            const dy = spec.y2 - spec.y1;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * spec.bulge;
            const ny = (dx / len) * spec.bulge;
            tg.beginFill(spec.col, 0.94);
            tg.moveTo(spec.x1, spec.y1);
            tg.quadraticCurveTo(mx + nx, my + ny, spec.x2, spec.y2);
            tg.quadraticCurveTo(mx - nx * 0.35, my - ny * 0.35, spec.x1, spec.y1);
            tg.closePath();
            tg.endFill();
            tg.beginFill(0xffaa33, 0.58);
            tg.moveTo(spec.x1, spec.y1);
            tg.quadraticCurveTo(mx + nx * 0.55, my + ny * 0.55, spec.x2, spec.y2);
            tg.quadraticCurveTo(mx - nx * 0.2, my - ny * 0.2, spec.x1, spec.y1);
            tg.closePath();
            tg.endFill();
            tg.__phase = i * 0.85;
            tailTongues.addChild(tg);
        });
        root.addChild(tailTongues);
        root.__tailTongues = tailTongues;

        const headLayer = new PIXI.Graphics();
        headLayer.beginFill(0xffcc22, 1);
        headLayer.drawCircle(hx, 0, hr);
        headLayer.endFill();
        headLayer.beginFill(0xffee55, 0.94);
        headLayer.drawCircle(hx, -u * 0.03, hr * 0.80);
        headLayer.endFill();
        headLayer.beginFill(0xffff88, 0.88);
        headLayer.drawCircle(hx + u * 0.02, -u * 0.04, hr * 0.58);
        headLayer.endFill();
        root.addChild(headLayer);
        root.__head = headLayer;

        const core = new PIXI.Graphics();
        core.beginFill(0xffffee, 1);
        core.drawCircle(hx + u * 0.02, -u * 0.02, hr * 0.40);
        core.endFill();
        core.beginFill(0xffffff, 0.92);
        core.drawCircle(hx + u * 0.03, -u * 0.03, hr * 0.22);
        core.endFill();
        if (PIXI.BLEND_MODES) core.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(core);
        root.__core = core;

        const outline = new PIXI.Graphics();
        outline.lineStyle(u * 0.046, 0xcc1100, 1);
        outline.moveTo(silhouette[0], silhouette[1]);
        for (let i = 2; i < silhouette.length; i += 2) outline.lineTo(silhouette[i], silhouette[i + 1]);
        outline.closePath();
        outline.drawCircle(hx, 0, hr * 1.05);
        root.addChild(outline);

        const spark = new PIXI.Graphics();
        spark.beginFill(0xff6622, 1);
        spark.drawPolygon([-u * 1.12, 0, -u * 1.24, -u * 0.08, -u * 1.16, u * 0.06]);
        spark.endFill();
        spark.beginFill(0xffaa33, 0.88);
        spark.drawCircle(-u * 1.14, -u * 0.01, u * 0.050);
        spark.endFill();
        root.addChild(spark);
        root.__spark = spark;

        const embers = new PIXI.Container();
        for (let i = 0; i < 8; i++) {
            const ex = -u * (0.36 + i * 0.09);
            const ey = (i % 3 - 1) * u * 0.09;
            const eg = new PIXI.Graphics();
            eg.beginFill(i % 2 ? 0xff6622 : 0xff4400, 0.9);
            eg.drawCircle(ex, ey, u * (0.016 + (i % 3) * 0.011));
            eg.endFill();
            eg.__phase = i * 0.7;
            eg.__ox = ex;
            eg.__oy = ey;
            embers.addChild(eg);
        }
        root.addChild(embers);
        root.__embers = embers;

        root.pivot.set(0, 0);
        root.__u = u;
        return root;
    }

    /** Mira vermelha no alvo — telegraph estilo Hearthstone. */
    function makeFireballTargetReticle(PIXI, unit) {
        const c = new PIXI.Container();
        const outer = new PIXI.Graphics();
        outer.lineStyle(unit * 0.034, 0xff2222, 0.92);
        outer.drawCircle(0, 0, unit * 0.74);
        const inner = new PIXI.Graphics();
        inner.lineStyle(unit * 0.020, 0xff7744, 0.78);
        inner.drawCircle(0, 0, unit * 0.50);
        const cross = new PIXI.Graphics();
        cross.lineStyle(unit * 0.014, 0xffaa66, 0.55);
        const cs = unit * 0.22;
        cross.moveTo(-cs, 0); cross.lineTo(cs, 0);
        cross.moveTo(0, -cs); cross.lineTo(0, cs);
        c.addChild(outer, inner, cross);
        c.__outer = outer;
        c.__inner = inner;
        return c;
    }

    /** Vinheta quente — foco cinematográfico na cena. */
    function makeFireballCinematicWash(PIXI) {
        const { w, h } = scenePixels();
        const g = new PIXI.Graphics();
        g.beginFill(0x1a0400, 0.38);
        g.drawRect(0, 0, w, h);
        g.endFill();
        g.alpha = 0;
        return g;
    }

    /** Segmento de cauda cometa durante o voo. */
    function makeCometTrailBlob(PIXI, theme, unit, intensity) {
        const g = new PIXI.Graphics();
        const w = unit * (0.20 + intensity * 0.22);
        const h = unit * (0.07 + intensity * 0.06);
        g.beginFill(theme.spark, 0.28 + intensity * 0.22);
        g.drawEllipse(0, 0, w, h);
        g.endFill();
        g.beginFill(0xffffaa, 0.18 + intensity * 0.14);
        g.drawEllipse(w * 0.15, 0, w * 0.45, h * 0.55);
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Flicker da cauda, brasas e núcleo — voo animado. */
    function tickReferenceFireballFlicker(root, t) {
        if (!root) return;
        const u = root.__u || 1;
        const pulse = Math.sin(t * 26) * 0.5 + 0.5;
        if (root.__aura) {
            root.__aura.scale.set(1 + pulse * 0.04, 1 + pulse * 0.05);
            root.__aura.alpha = 0.55 + pulse * 0.35;
        }
        root.__tailTongues?.children?.forEach((tg) => {
            const ph = tg.__phase ?? 0;
            const pulse = Math.sin(t * 24 + ph) * 0.5 + 0.5;
            tg.scale.set(1 + pulse * 0.06, 1 + pulse * 0.08);
            tg.alpha = 0.88 + pulse * 0.12;
        });
        if (root.__core) {
            root.__core.scale.set(1 + Math.sin(t * 34) * 0.1);
        }
        if (root.__head) {
            const hp = Math.sin(t * 20) * 0.5 + 0.5;
            root.__head.scale.set(1 + hp * 0.04);
        }
        root.__embers?.children?.forEach((eg) => {
            const ph = eg.__phase ?? 0;
            eg.x = (eg.__ox ?? 0) + Math.sin(t * 32 + ph) * u * 0.05;
            eg.y = (eg.__oy ?? 0) + Math.cos(t * 28 + ph) * u * 0.04 - Math.sin(t * 20) * u * 0.025;
            eg.alpha = 0.75 + Math.sin(t * 36 + ph) * 0.25;
            eg.scale.set(0.8 + Math.sin(t * 30 + ph) * 0.18);
        });
        if (root.__spark) {
            root.__spark.x = Math.sin(t * 32) * u * 0.04;
            root.__spark.alpha = 0.78 + Math.sin(t * 28) * 0.22;
        }
    }

    /** @deprecated alias — mantido para chamadas legadas internas. */
    function buildCartoonFireballProjectile(PIXI, unit, theme) {
        return buildReferenceFireballProjectile(PIXI, unit);
    }

    function tickCartoonFireballFlicker(root, t) {
        tickReferenceFireballFlicker(root, t);
    }

    /**
     * Bola de Fogo — cena Pixi+GSAP (qualidade Hearthstone).
     *
     * Roteiro cinematográfico:
     *  1. TELEGRAPH (0–680ms) — vinheta quente, mira vermelha no alvo, energia converge na origem.
     *  2. CAST (680–760ms)     — anel de liberação, orbe cresce e dispara.
     *  3. FLIGHT (760–1340ms)  — aceleração power3.in, cometa esticado, rastro luminoso, alvo pulsa.
     *  4. IMPACT (1340–2620ms) — hit-stop, flash, explosão em camadas + sprite, ondas, tremor, zoom punch.
     *  5. AFTERMATH (2620+)    — brasas, fumaça, marca de queimadura, fade.
     */
    async function playFireballScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxEngine?.wantsGpuPresentation?.()
            || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const fromX0 = opts.fromX;
        const fromY0 = opts.fromY;
        const toX0 = opts.toX;
        const toY0 = opts.toY;
        if (fromX0 == null || fromY0 == null || toX0 == null || toY0 == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playFireballScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        const fromTalent = !!opts.fromTalent;
        const handOrigin = !!opts.handOrigin;
        const useFullscreenScene = cinematic && (fromTalent || handOrigin);
        beginPixiTargetScene(a, useFullscreenScene);
        const mapped = mapSceneCoords(fromX0, fromY0, toX0, toY0);
        let fromX = mapped.fromX;
        let fromY = mapped.fromY;
        let toX = mapped.toX;
        let toY = mapped.toY;

        try {
        await global.DfSpriteVfx?.init?.();

        const PIXI = global.PIXI;
        const fireTheme = themeFromRecipe({ hue: opts.hue ?? 18 });
        const fieldOrigin = !!opts.fieldOrigin;
        const deckOrigin = !!opts.deckOrigin || (!handOrigin && !fieldOrigin && !fromTalent);
        const fast = !!opts.fast && !cinematic;
        const unit = cardUnit(1);

        const windupMs = opts.windupMs ?? (cinematic
            ? (handOrigin ? 720 : (fieldOrigin ? 640 : (fromTalent ? 680 : 600)))
            : (fast ? 140 : 240));
        const travelMs = opts.travelMs ?? (cinematic ? 580 : (fast ? 400 : 520));
        const impactMs = opts.impactMs ?? (cinematic ? 1280 : (fast ? 360 : 720));
        const lingerMs = opts.lingerMs ?? (cinematic ? 980 : (fast ? 120 : 380));

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        let cinematicWash = null;
        if (cinematic) {
            cinematicWash = makeFireballCinematicWash(PIXI);
            container.addChild(cinematicWash);
        }

        const screenFlash = new PIXI.Graphics();
        screenFlash.beginFill(0xff8844, 0.22);
        const scene0 = scenePixels();
        screenFlash.drawRect(0, 0, scene0.w, scene0.h);
        screenFlash.endFill();
        screenFlash.alpha = 0;
        if (PIXI.BLEND_MODES) screenFlash.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(screenFlash);

        const chargeRoot = new PIXI.Container();
        chargeRoot.x = fromX;
        chargeRoot.y = fromY;
        container.addChild(chargeRoot);

        let handGlow = null;
        if (handOrigin || deckOrigin || fieldOrigin) {
            handGlow = makeHandOriginGlow(PIXI, fireTheme, unit);
            handGlow.alpha = 0;
            handGlow.scale.set(fieldOrigin ? 0.92 : (deckOrigin ? 0.72 : 0.88));
            chargeRoot.addChild(handGlow);
        }

        const chargeBloom = makeSoftBloom(PIXI, fireTheme, unit, handOrigin ? 1.25 : (fromTalent ? 1.1 : 0.75));
        chargeBloom.alpha = 0;
        chargeRoot.addChild(chargeBloom);

        const chargeRing = new PIXI.Graphics();
        chargeRing.lineStyle(unit * 0.028, fireTheme.ring, 0.85);
        chargeRing.drawCircle(0, 0, unit * 0.42);
        chargeRing.scale.set(0.2);
        chargeRing.alpha = 0;
        chargeRoot.addChild(chargeRing);

        const wispsContainer = new PIXI.Container();
        chargeRoot.addChild(wispsContainer);

        const refScale = cinematic ? (handOrigin ? 1.18 : (fieldOrigin ? 1.08 : 1.02)) : 0.86;
        const chargeOrb = buildReferenceFireballProjectile(PIXI, unit);
        chargeOrb.alpha = 0;
        chargeOrb.scale.set(0.18);
        chargeRoot.addChild(chargeOrb);

        const targetReticle = makeFireballTargetReticle(PIXI, unit);
        targetReticle.x = toX;
        targetReticle.y = toY;
        targetReticle.alpha = 0;
        targetReticle.scale.set(1.35);
        container.addChild(targetReticle);

        const targetGlow = new PIXI.Graphics();
        targetGlow.beginFill(fireTheme.core, 0.25);
        targetGlow.drawCircle(0, 0, unit * 0.58);
        targetGlow.endFill();
        targetGlow.x = toX;
        targetGlow.y = toY;
        targetGlow.alpha = 0;
        targetGlow.scale.set(0.3);
        container.addChild(targetGlow);

        const groundShadow = new PIXI.Graphics();
        groundShadow.beginFill(0x000000, 0.38);
        groundShadow.drawEllipse(0, 0, unit * 0.42, unit * 0.14);
        groundShadow.endFill();
        groundShadow.x = toX;
        groundShadow.y = toY;
        groundShadow.alpha = 0;
        groundShadow.visible = false;
        groundShadow.scale.set(0.2);
        container.addChild(groundShadow);

        const projWrap = new PIXI.Container();
        projWrap.x = fromX;
        projWrap.y = fromY;
        projWrap.alpha = 0;
        projWrap.scale.set(0.55);
        container.addChild(projWrap);

        let baseProjScale = refScale;
        const projVisual = buildReferenceFireballProjectile(PIXI, unit);
        projVisual.scale.set(baseProjScale * 0.68);
        projWrap.addChild(projVisual);

        const projHalo = projVisual.__aura;
        const flameStreaks = [];

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const smokeTrailContainer = new PIXI.Container();
        container.addChild(smokeTrailContainer);

        const impactRoot = new PIXI.Container();
        impactRoot.x = toX;
        impactRoot.y = toY;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const explData = buildFireballExplosion(PIXI, fireTheme, unit);
        explData.root.alpha = 0;
        impactRoot.addChild(explData.root);

        const impactSheet = await sheetTextures(PIXI, "fire_impact");
        let impactSprite = null;
        if (impactSheet?.frames?.length) {
            impactSprite = new PIXI.AnimatedSprite(impactSheet.frames);
            impactSprite.anchor.set(0.5);
            impactSprite.loop = false;
            const impactSc = sheetScale(unit, impactSheet.meta.size, cinematic ? 3.4 : 2.1);
            impactSprite.scale.set(impactSc * 0.14);
            impactSprite.alpha = 0;
            if (PIXI.BLEND_MODES) impactSprite.blendMode = PIXI.BLEND_MODES.ADD;
            impactRoot.addChild(impactSprite);
        }

        const shockRings = [];
        const ringCount = cinematic ? 5 : 3;
        for (let i = 0; i < ringCount; i++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2, unit * 0.024) - i * 0.35, fireTheme.ring, 0.9 - i * 0.12);
            ring.drawCircle(0, 0, unit * (0.2 + i * 0.07));
            ring.scale.set(0.1);
            ring.alpha = 0;
            impactRoot.addChild(ring);
            shockRings.push(ring);
        }

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.95);
        flashCore.drawCircle(0, 0, unit * 0.32);
        flashCore.endFill();
        flashCore.scale.set(0.05);
        flashCore.alpha = 0;
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const scorch = new PIXI.Graphics();
        scorch.beginFill(0x1a0800, 0.55);
        scorch.drawEllipse(0, unit * 0.06, unit * 0.95, unit * 0.38);
        scorch.endFill();
        scorch.beginFill(0x3a1808, 0.35);
        scorch.drawEllipse(0, unit * 0.04, unit * 0.55, unit * 0.22);
        scorch.endFill();
        scorch.alpha = 0;
        impactRoot.addChild(scorch);

        const emberCount = n(cinematic ? 118 : (fast ? 28 : 52));
        const shardCount = cinematic ? 46 : 14;
        const charShardCount = cinematic ? 16 : 5;
        const debrisCount = cinematic ? 12 : 4;
        const smokeCount = cinematic ? 58 : 18;
        const plumeCount = cinematic ? 18 : 6;
        const particles = [];
        for (let i = 0; i < emberCount + shardCount + charShardCount + debrisCount; i++) {
            let g;
            if (i < emberCount) {
                g = makeEmber(PIXI, fireTheme, unit, i % 5 === 0);
            } else if (i < emberCount + shardCount) {
                g = makeFireShard(PIXI, fireTheme, unit);
            } else if (i < emberCount + shardCount + charShardCount) {
                g = makeCharShard(PIXI, unit);
            } else {
                g = makeDebris(PIXI, unit);
                g.__debris = true;
            }
            g.visible = false;
            container.addChild(g);
            particles.push({
                g, vx: 0, vy: 0, vr: 0,
                drag: g.__shard ? 0.962 : (g.__debris ? 0.975 : 0.992),
                kind: i < emberCount ? "ember"
                    : i < emberCount + shardCount ? "shard"
                    : i < emberCount + shardCount + charShardCount ? "char" : "debris",
            });
        }

        const smokeParts = [];
        for (let i = 0; i < smokeCount; i++) {
            const g = makeSmokePlume(PIXI, unit, i % 4 === 0);
            g.visible = false;
            container.addChild(g);
            smokeParts.push({ g, vx: 0, vy: 0, vr: 0, drag: 0.984 });
        }

        const plumeParts = [];
        for (let i = 0; i < plumeCount; i++) {
            const g = makeSmokePlume(PIXI, unit, true);
            g.visible = false;
            container.addChild(g);
            plumeParts.push({ g, vx: 0, vy: 0, vr: 0, drag: 0.988, rise: 0 });
        }

        const dist = Math.hypot(toX - fromX, toY - fromY);
        const flightDx = toX - fromX;
        const flightDy = toY - fromY;
        const flightAngle = Math.atan2(flightDy, flightDx);
        chargeOrb.rotation = flightAngle;
        projWrap.rotation = flightAngle;
        const arcLift = 0;

        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const shakeProxy = { t: 0 };
        const partProxy = { t: 0 };
        const smokeProxy = { t: 0 };

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        let wispInterval = 0;
        let lastCometTrailT = 0;
        const spawnHeatWisp = () => {
            const w = makeSmokePuff(PIXI, unit, true);
            w.x = (Math.random() - 0.5) * unit * 0.35;
            w.y = unit * 0.1;
            wispsContainer.addChild(w);
            gsap.to(w, {
                alpha: 0,
                y: w.y - unit * (0.35 + Math.random() * 0.55),
                x: w.x + (Math.random() - 0.5) * unit * 0.3,
                scale: { x: 1.6, y: 1.6 },
                duration: 0.35 + Math.random() * 0.3,
                ease: "sine.out",
                onComplete: () => { try { w.destroy(); } catch (e) { /* */ } },
            });
        };

        const spawnHandSpark = () => {
            const sp = makeEmber(PIXI, fireTheme, unit, Math.random() > 0.65);
            sp.x = (Math.random() - 0.5) * unit * 0.42;
            sp.y = (Math.random() - 0.5) * unit * 0.28;
            wispsContainer.addChild(sp);
            gsap.to(sp, {
                alpha: 0,
                y: sp.y - unit * (0.25 + Math.random() * 0.45),
                x: sp.x + (Math.random() - 0.5) * unit * 0.35,
                scale: { x: 1.4, y: 1.4 },
                duration: 0.32 + Math.random() * 0.28,
                ease: "sine.out",
                onComplete: () => { try { sp.destroy(); } catch (e) { /* */ } },
            });
        };

        if (cinematicWash) {
            tl.to(cinematicWash, { alpha: 0.72, duration: windupDur * 0.55, ease: "power1.in" }, 0);
            tl.to(cinematicWash, { alpha: 0.18, duration: travelDur * 0.45, ease: "sine.out" }, windupDur);
            tl.to(cinematicWash, { alpha: 0, duration: lingerDur * 0.55, ease: "power2.out" }, `impact+=${impactDur * 0.35}`);
        }
        tl.to(targetReticle, { alpha: cinematic ? 0.95 : 0.72, duration: windupDur * 0.35, ease: "power2.out" }, 0);
        tl.to(targetReticle.scale, {
            x: 1, y: 1, duration: windupDur * 0.85, ease: "back.out(1.4)",
        }, 0);
        if (handGlow) {
            tl.to(handGlow, { alpha: 1, duration: windupDur * 0.35, ease: "power2.out" }, 0);
            tl.to(handGlow.scale, {
                x: 1.08, y: 1.08, duration: windupDur * 0.7, ease: "sine.inOut",
            }, 0);
            tl.to(handGlow, { alpha: 0.35, duration: windupDur * 0.25 }, windupDur * 0.65);
        }
        tl.to(chargeBloom, { alpha: cinematic ? 0.95 : 0.72, duration: windupDur * 0.5, ease: "power2.out" }, 0);
        tl.to(chargeBloom.scale, {
            x: handOrigin ? 1.5 : (fromTalent ? 1.35 : 1.1),
            y: handOrigin ? 1.5 : (fromTalent ? 1.35 : 1.1),
            duration: windupDur, ease: "sine.inOut",
        }, 0);
        tl.to(chargeRing, { alpha: 0.85, duration: windupDur * 0.35 }, 0);
        tl.to(chargeRing.scale, {
            x: fromTalent ? 2.2 : 1.65, y: fromTalent ? 2.2 : 1.65,
            duration: windupDur, ease: "power2.out",
        }, 0);
        tl.to(chargeRing, { alpha: 0, duration: windupDur * 0.35 }, windupDur * 0.55);
        tl.to(chargeOrb, { alpha: cinematic ? 0.98 : 0.78, duration: windupDur * 0.4, ease: "power2.out" }, 0);
        tl.to(chargeOrb.scale, {
            x: baseProjScale * 0.88, y: baseProjScale * 0.88,
            duration: windupDur, ease: "power2.inOut",
        }, 0);
        tl.add(() => {
            tickReferenceFireballFlicker(chargeOrb, windupDur * 0.5);
        }, windupDur * 0.35);
        tl.add(() => {
            wispInterval = setInterval(spawnHeatWisp, cinematic ? 38 : 70);
            if (handOrigin) {
                for (let i = 0; i < (cinematic ? 10 : 4); i++) spawnHandSpark();
            }
        }, 0);
        tl.to(targetGlow, { alpha: 0.4, duration: windupDur * 0.6, ease: "sine.out" }, windupDur * 0.2);
        tl.to(targetGlow.scale, { x: 0.7, y: 0.7, duration: windupDur * 0.8, ease: "sine.inOut" }, windupDur * 0.15);

        const travelStart = windupDur;
        tl.add(() => {
            if (wispInterval) clearInterval(wispInterval);
            chargeRoot.visible = false;
            projWrap.rotation = flightAngle;
            projWrap.__lastX = fromX;
            projWrap.__lastY = fromY;
        }, travelStart);
        tl.to(projWrap, { alpha: 1, duration: 0.08 }, travelStart);
        tl.fromTo(projWrap.scale, { x: 0.55, y: 0.55 }, {
            x: 1, y: 1, duration: 0.14, ease: "back.out(2.2)",
        }, travelStart);
        tl.to(targetReticle, { alpha: 0, duration: travelDur * 0.35, ease: "power1.in" }, travelStart);
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: "power3.in",
            onUpdate: () => {
                const t = travelProxy.p;
                const easeT = t * t * t;
                projWrap.x = fromX + flightDx * easeT;
                projWrap.y = fromY + flightDy * easeT;

                tickReferenceFireballFlicker(projVisual, t);

                const grow = cinematic ? 0.48 : 0.24;
                const sc = baseProjScale * (0.62 + easeT * (0.38 + grow));
                projVisual.scale.set(sc);

                if (projHalo) {
                    projHalo.scale.set(0.92 + easeT * 0.48, 0.88 + easeT * 0.52);
                }

                if (easeT - lastCometTrailT > 0.022) {
                    lastCometTrailT = easeT;
                    const blob = makeCometTrailBlob(PIXI, fireTheme, unit, easeT);
                    const tailOff = unit * (0.48 + easeT * 0.38);
                    blob.x = projWrap.x - Math.cos(flightAngle) * tailOff;
                    blob.y = projWrap.y - Math.sin(flightAngle) * tailOff;
                    blob.rotation = flightAngle;
                    trailContainer.addChild(blob);
                    gsap.to(blob, {
                        alpha: 0,
                        x: blob.x - Math.cos(flightAngle) * unit * 0.28,
                        y: blob.y - Math.sin(flightAngle) * unit * 0.28,
                        duration: 0.32 + easeT * 0.18,
                        ease: "power1.out",
                        onComplete: () => { try { blob.destroy(); } catch (e) { /* */ } },
                    });
                }

                groundShadow.x = toX + (fromX - toX) * (1 - t);
                groundShadow.y = toY + unit * 0.1 + (fromY - toY) * (1 - t) * 0.15;
                groundShadow.alpha = Math.min(0.55, t * 0.65);
                groundShadow.scale.set(0.2 + t * 1.1, 0.2 + t * 0.85);

                targetGlow.alpha = 0.35 + t * 0.55;
                targetGlow.scale.set(0.3 + t * 1.1);

                if (t > 0.01 && Math.random() < (cinematic ? 0.92 : 0.55)) {
                    const warm = Math.random() > 0.35;
                    const tr = warm
                        ? makeEmber(PIXI, fireTheme, unit, Math.random() > 0.7)
                        : makeFlameStreak(PIXI, fireTheme, unit, unit * (0.18 + Math.random() * 0.28));
                    const tailOff = unit * (0.55 + Math.random() * 0.35);
                    tr.x = projWrap.x - Math.cos(flightAngle) * tailOff;
                    tr.y = projWrap.y - Math.sin(flightAngle) * tailOff;
                    trailContainer.addChild(tr);
                    gsap.to(tr, {
                        alpha: 0,
                        x: tr.x - Math.cos(flightAngle) * unit * (0.35 + Math.random() * 0.45),
                        y: tr.y - Math.sin(flightAngle) * unit * (0.35 + Math.random() * 0.45) + unit * 0.06,
                        scale: { x: warm ? 1.35 : 1.15, y: warm ? 1.35 : 1.25 },
                        duration: 0.28 + Math.random() * 0.32,
                        ease: "power1.out",
                        onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
                    });
                }
                if (cinematic && t > 0.03 && Math.random() < 0.38) {
                    const sm = makeSmokePlume(PIXI, unit, true);
                    sm.x = projWrap.x;
                    sm.y = projWrap.y + unit * 0.18;
                    smokeTrailContainer.addChild(sm);
                    gsap.to(sm, {
                        alpha: 0,
                        y: sm.y + unit * (0.35 + Math.random() * 0.75),
                        x: sm.x + (Math.random() - 0.5) * unit * 0.65,
                        scale: { x: 2.4, y: 2.4 },
                        duration: 0.75 + Math.random() * 0.55,
                        ease: "sine.out",
                        onComplete: () => { try { sm.destroy(); } catch (e) { /* */ } },
                    });
                }
            },
        }, travelStart + 0.02);

        const impactAt = travelStart + 0.02 + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            projWrap.visible = false;
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
        }, "impact");
        tl.to({}, { duration: cinematic ? 0.058 : 0.03 }, "impact");

        tl.to(screenFlash, { alpha: cinematic ? 0.38 : 0.22, duration: 0.04 }, "impact");
        tl.to(screenFlash, {
            alpha: 0, duration: impactDur * 0.28, ease: "power2.out",
        }, `impact+=${impactDur * 0.06}`);

        const explPeakSc = cinematic ? 1.48 : 1.0;
        tl.to(explData.root, { alpha: 1, duration: 0.04 }, "impact");
        tl.to({}, {
            duration: impactDur * 0.82,
            onUpdate() {
                const prog = this.progress();
                const fi = Math.min(explData.frameCount - 1, Math.floor(prog * explData.frameCount));
                explData.frames.forEach((fr, idx) => {
                    fr.visible = idx === fi;
                    fr.alpha = idx === fi ? 1 : 0;
                });
                const sc = 0.55 + prog * explPeakSc;
                explData.root.scale.set(sc);
            },
        }, "impact");
        tl.to(explData.root, { alpha: 0, duration: impactDur * 0.28 }, `impact+=${impactDur * 0.52}`);

        if (impactSprite && impactSheet) {
            const peakSc = sheetScale(unit, impactSheet.meta.size, cinematic ? 3.4 : 2.1);
            tl.to(impactSprite, { alpha: 1, duration: 0.04 }, "impact");
            tl.to(impactSprite.scale, {
                x: peakSc, y: peakSc, duration: impactDur * 0.52, ease: "power3.out",
            }, "impact");
            tl.to({}, {
                duration: impactDur * 0.65,
                onUpdate() {
                    const prog = this.progress();
                    const fi = Math.min(impactSheet.frames.length - 1, Math.floor(prog * impactSheet.frames.length));
                    impactSprite.texture = impactSheet.frames[fi];
                },
            }, "impact");
            tl.to(impactSprite, { alpha: 0, duration: impactDur * 0.22 }, `impact+=${impactDur * 0.48}`);
        }

        shockRings.forEach((ring, i) => {
            const off = i * 0.05;
            const peak = cinematic ? 3.8 + i * 0.95 : 2.4 + i * 0.6;
            tl.to(ring, { alpha: 0.88 - i * 0.1, duration: 0.05 }, `impact+=${off}`);
            tl.to(ring.scale, {
                x: peak, y: peak, duration: impactDur * 0.58, ease: "power2.out",
            }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: impactDur * 0.35 }, `impact+=${0.12 + off}`);
        });

        tl.to(flashCore, { alpha: 1, duration: 0.04 }, "impact");
        tl.to(flashCore.scale, {
            x: cinematic ? 6.8 : 3.6, y: cinematic ? 6.8 : 3.6,
            duration: impactDur * 0.28, ease: "power2.out",
        }, "impact");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.32 }, `impact+=${impactDur * 0.1}`);

        tl.to(shakeWrap.scale, {
            x: cinematic ? 1.05 : 1.03, y: cinematic ? 1.05 : 1.03,
            duration: 0.06, ease: "power2.out",
        }, "impact");
        tl.to(shakeWrap.scale, {
            x: 1, y: 1, duration: 0.38, ease: "power2.out",
        }, `impact+=0.06`);

        tl.to(scorch, { alpha: cinematic ? 0.78 : 0.5, duration: 0.08 }, "impact");
        tl.to(scorch, { alpha: 0, duration: lingerDur * 0.85, ease: "power1.in" }, `impact+=${impactDur * 0.25}`);

        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.52 : 0.28,
            ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeProxy.t) * (cinematic ? 16 : 9);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "impact");

        tl.add(() => {
            particles.forEach((p, i) => {
                const kind = p.kind || "ember";
                const isChar = kind === "char";
                const isShard = kind === "shard";
                const isDebris = kind === "debris";
                const ang = (Math.PI * 2 * i) / particles.length + (Math.random() - 0.5) * (isShard ? 0.28 : 0.55);
                let spd;
                if (isChar) {
                    spd = (cinematic ? 5.5 : 3.2) + Math.random() * (cinematic ? 7.5 : 4.2);
                } else if (isShard) {
                    spd = (cinematic ? 10 : 4.5) + Math.random() * (cinematic ? 12 : 5.5);
                } else if (isDebris) {
                    spd = (cinematic ? 4 : 2.2) + Math.random() * (cinematic ? 5 : 3);
                } else {
                    spd = (cinematic ? 5.5 : 3) + Math.random() * (cinematic ? 11 : 5.5);
                }
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - (isShard ? 3.4 : (isChar ? 2 : (isDebris ? 1.2 : 3.8)));
                p.vr = (Math.random() - 0.5) * (isShard ? 0.55 : (isChar ? 0.38 : 0.3));
                p.g.visible = true;
                p.g.x = toX + (Math.random() - 0.5) * unit * (isShard ? 0.38 : 0.22);
                p.g.y = toY + (Math.random() - 0.5) * unit * 0.22;
                p.g.alpha = 1;
            });
            smokeParts.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / smokeParts.length + (Math.random() - 0.5) * 0.9;
                const spd = (cinematic ? 2.2 : 1.1) + Math.random() * 2.6;
                p.vx = Math.cos(ang) * spd * 0.55;
                p.vy = -Math.abs(Math.sin(ang)) * spd - (cinematic ? 2.2 : 0.9);
                p.vr = (Math.random() - 0.5) * 0.1;
                p.g.visible = true;
                p.g.x = toX + (Math.random() - 0.5) * unit * 0.65;
                p.g.y = toY + unit * 0.05;
                p.g.alpha = cinematic ? 0.82 : 0.55;
                p.g.scale.set(cinematic ? 2.0 : 1.2);
            });
            plumeParts.forEach((p, i) => {
                p.vx = (Math.random() - 0.5) * 0.8;
                p.vy = -(cinematic ? 2.8 : 1.4) - Math.random() * 1.2;
                p.vr = (Math.random() - 0.5) * 0.06;
                p.rise = cinematic ? 1.15 : 0.7;
                p.g.visible = true;
                p.g.x = toX + (Math.random() - 0.5) * unit * 0.4;
                p.g.y = toY - unit * 0.05;
                p.g.alpha = cinematic ? 0.88 : 0.62;
                p.g.scale.set(cinematic ? 1.4 + i * 0.12 : 1.0);
            });
        }, "impact");

        tl.to(partProxy, {
            t: 1,
            duration: lingerDur + impactDur * 0.3,
            ease: "none",
            onUpdate: () => {
                particles.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += p.g.__shard ? 0.14 : 0.09;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.08);
                });
            },
        }, "impact");

        tl.to(smokeProxy, {
            t: 1,
            duration: lingerDur + impactDur * 0.5,
            ease: "none",
            onUpdate: () => {
                smokeParts.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy -= 0.05;
                    p.vx *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, (cinematic ? 0.82 : 0.55) * (1 - smokeProxy.t * 0.92));
                    const sc = (cinematic ? 2.0 : 1.2) + smokeProxy.t * (cinematic ? 3.2 : 1.6);
                    p.g.scale.set(sc);
                });
                plumeParts.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy *= 0.992;
                    p.vy -= p.rise * 0.06;
                    p.vx *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, (cinematic ? 0.88 : 0.62) * (1 - smokeProxy.t * 0.88));
                    const sc = (cinematic ? 1.4 : 1.0) + smokeProxy.t * (cinematic ? 3.5 : 1.8);
                    p.g.scale.set(sc);
                });
            },
        }, "impact");

        tl.to(targetGlow, { alpha: 0, duration: lingerDur * 0.55 }, `impact+=${impactDur * 0.18}`);
        tl.to(groundShadow, { alpha: 0, duration: lingerDur * 0.45 }, `impact+=${impactDur * 0.12}`);

        tl.add(() => {
            if (wispInterval) clearInterval(wispInterval);
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            endPixiTargetScene(a);
        }
    }

    /**
     * Rei Bomba — cena Pixi+GSAP cinematográfica.
     * Sprites bomb_ball + bomb_explosion_ult, partículas visíveis, queda lenta, impacto dramático.
     */
    async function playBombUltimateScene(cx, cy, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playBombUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, cinematic);
        const targetM = frame.map(cx, cy);
        cx = targetM.x;
        cy = targetM.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const fast = !cinematic && (!!opts.fast || !!recipe?.fastBomb);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 320) : 0);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 1400) : (fast ? 300 : 700));
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 1100) : (fast ? 220 : 600));
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 720) : (fast ? 50 : 280));
        const unit = cardUnit(1);
        let fromX = opts.fromX ?? cx;
        let fromY = opts.fromY ?? cy;
        if (opts.fromX != null && opts.fromY != null) {
            const fm = frame.map(fromX, fromY);
            fromX = fm.x;
            fromY = fm.y;
        }
        const handOrigin = opts.fromX != null && opts.fromY != null;
        try {
        const scene = scenePixels();
        const fallFrom = handOrigin
            ? 0
            : (cinematic
                ? Math.min(scene.h * 0.72, 820)
                : (fast ? Math.min(scene.h * 0.22, 220) : Math.min(scene.h * 0.48, 560)));
        const arcLift = handOrigin
            ? Math.max(unit * 0.55, Math.min(unit * 2.2, Math.abs(fromY - cy) * 0.35 + unit * 0.65))
            : 0;
        const apexX = handOrigin ? fromX + (cx - fromX) * 0.48 : cx;
        const apexY = handOrigin ? Math.min(fromY, cy) - arcLift : (cy - fallFrom);

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        let cinematicWash = null;
        if (cinematic) {
            cinematicWash = makeBombCinematicWash(PIXI);
            container.addChild(cinematicWash);
        }

        const targetReticle = new PIXI.Graphics();
        targetReticle.lineStyle(unit * 0.028, theme.ring, 0.85);
        targetReticle.drawCircle(0, 0, unit * 0.72);
        targetReticle.x = cx;
        targetReticle.y = cy;
        targetReticle.alpha = 0;
        targetReticle.scale.set(1.2);
        container.addChild(targetReticle);

        const groundShadow = new PIXI.Graphics();
        groundShadow.beginFill(0x000000, 0.42);
        groundShadow.drawEllipse(0, 0, unit * 0.55, unit * 0.18);
        groundShadow.endFill();
        groundShadow.x = cx;
        groundShadow.y = cy + unit * 0.08;
        groundShadow.alpha = 0;
        groundShadow.scale.set(0.25);
        container.addChild(groundShadow);

        const targetGlow = new PIXI.Graphics();
        targetGlow.beginFill(theme.core, 0.28);
        targetGlow.drawCircle(0, 0, unit * 0.65);
        targetGlow.endFill();
        targetGlow.x = cx;
        targetGlow.y = cy;
        targetGlow.alpha = 0;
        targetGlow.scale.set(0.4);
        container.addChild(targetGlow);

        const bombWrap = new PIXI.Container();
        bombWrap.x = handOrigin ? fromX : cx;
        bombWrap.y = handOrigin ? fromY : (cy - fallFrom);
        bombWrap.alpha = 0;
        container.addChild(bombWrap);

        const bombSheet = await sheetTextures(PIXI, "bomb_ball");
        let bombVisual;
        if (bombSheet?.frames?.length) {
            bombVisual = new PIXI.Sprite(bombSheet.frames[0]);
            bombVisual.anchor.set(0.5);
            const sc = sheetScale(unit, bombSheet.meta.size, cinematic ? 2.35 : 1.2);
            bombVisual.scale.set(sc);
            bombWrap.addChild(bombVisual);
        } else {
            const body = new PIXI.Graphics();
            const bombR = unit * (cinematic ? 0.5 : 0.28);
            body.beginFill(0x2a2218, 1);
            body.drawCircle(0, 0, bombR);
            body.endFill();
            body.beginFill(0x8a7a62, 0.5);
            body.drawCircle(-bombR * 0.28, -bombR * 0.32, bombR * 0.42);
            body.endFill();
            bombWrap.addChild(body);
            bombVisual = body;
        }

        const fuseSpark = new PIXI.Container();
        bombWrap.addChild(fuseSpark);

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const impactRoot = new PIXI.Container();
        impactRoot.x = cx;
        impactRoot.y = cy;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const explSheet = await sheetTextures(PIXI, "bomb_explosion_ult");
        let explSprite = null;
        const procExplData = buildBombExplosion(PIXI, theme, unit);
        procExplData.root.alpha = 0;
        impactRoot.addChild(procExplData.root);
        if (explSheet?.frames?.length) {
            explSprite = new PIXI.AnimatedSprite(explSheet.frames);
            explSprite.anchor.set(0.5);
            explSprite.loop = false;
            const explSc = sheetScale(unit, explSheet.meta.size, cinematic ? 4.0 : 2.1);
            explSprite.scale.set(explSc * 0.15);
            explSprite.alpha = 0;
            impactRoot.addChild(explSprite);
        }

        const impactBloom = makeSoftBloom(PIXI, theme, unit, cinematic ? 1.55 : 0.9);
        impactBloom.alpha = 0;
        impactRoot.addChild(impactBloom);

        const smokeContainer = new PIXI.Container();
        container.addChild(smokeContainer);

        const shockRings = [];
        for (let i = 0; i < (cinematic ? 5 : 2); i++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2.5, unit * 0.028) - i * 0.4, theme.ring, 0.85 - i * 0.15);
            ring.drawCircle(0, 0, unit * (0.22 + i * 0.08));
            ring.scale.set(0.12);
            ring.alpha = 0;
            impactRoot.addChild(ring);
            shockRings.push(ring);
        }

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.95);
        flashCore.drawCircle(0, 0, unit * 0.35);
        flashCore.endFill();
        flashCore.scale.set(0.05);
        flashCore.alpha = 0;
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const emberCount = n(cinematic ? 72 : (fast ? 14 : 32));
        const debrisCount = cinematic ? 22 : 6;
        /** @type {{ g: PIXI.Graphics, vx: number, vy: number, vr: number, drag: number }[]} */
        const particles = [];
        for (let i = 0; i < emberCount + debrisCount; i++) {
            const large = i < emberCount && i % 5 === 0;
            const g = i < emberCount ? makeEmber(PIXI, theme, unit, large) : makeDebris(PIXI, unit);
            g.x = cx;
            g.y = cy;
            g.visible = false;
            container.addChild(g);
            particles.push({
                g, vx: 0, vy: 0, vr: 0,
                drag: i < emberCount ? 0.992 : 0.978,
            });
        }

        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const shakeProxy = { t: 0 };
        const spinTurns = cinematic ? 3.2 : (fast ? 0.6 : 1.4);
        const baseBombScale = bombVisual.scale?.x ?? 1;

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        if (cinematicWash) {
            tl.to(cinematicWash, { alpha: 1, duration: 0.42, ease: "sine.out" }, 0);
            tl.to(cinematicWash, { alpha: 0, duration: 1.05, ease: "power2.out" }, (windupMs + travelMs + impactMs * 0.35) / 1000);
        }

        let fuseInterval = 0;
        const spawnFuseSpark = () => {
            const sp = makeSmokePuff(PIXI, unit, true);
            const off = unit * (cinematic ? 0.95 : 0.55);
            sp.x = off * 0.2;
            sp.y = -off;
            fuseSpark.addChild(sp);
            gsap.to(sp, {
                alpha: 0,
                x: sp.x + (Math.random() - 0.5) * unit * 0.25,
                y: sp.y - unit * (0.12 + Math.random() * 0.2),
                duration: 0.22 + Math.random() * 0.18,
                onComplete: () => { try { sp.destroy(); } catch (e) { /* */ } },
            });
        };

        if (windupDur > 0) {
            tl.to(targetGlow, { alpha: 0.55, duration: windupDur * 0.6, ease: "sine.out" }, 0);
            tl.to(targetGlow.scale, { x: 0.85, y: 0.85, duration: windupDur, ease: "sine.inOut" }, 0);
            tl.to(targetReticle, { alpha: cinematic ? 0.75 : 0.45, duration: windupDur * 0.55, ease: "sine.out" }, 0);
            tl.to(targetReticle.scale, { x: 0.92, y: 0.92, duration: windupDur, ease: "sine.inOut" }, 0);
            tl.add(() => {
                fuseInterval = setInterval(spawnFuseSpark, cinematic ? 55 : 90);
            }, 0);
        }

        const travelStart = windupDur;
        tl.to(bombWrap, { alpha: 1, duration: 0.18 }, travelStart);
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: handOrigin ? "power1.in" : (cinematic ? "power2.in" : "power2.in"),
            onUpdate: () => {
                const t = travelProxy.p;
                if (handOrigin) {
                    const easeT = t * t * (3 - 2 * t);
                    const u = 1 - easeT;
                    bombWrap.x = u * u * fromX + 2 * u * easeT * apexX + easeT * easeT * cx;
                    bombWrap.y = u * u * fromY + 2 * u * easeT * apexY + easeT * easeT * cy;
                    bombWrap.x += Math.sin(t * Math.PI * 1.1) * (cinematic ? 18 : 8);
                } else {
                    const easeT = t * t;
                    bombWrap.y = (cy - fallFrom) + fallFrom * easeT;
                    bombWrap.x = cx + Math.sin(t * Math.PI * 1.15) * (cinematic ? 42 : 12);
                }
                bombWrap.rotation = t * Math.PI * 2 * spinTurns;
                const grow = cinematic ? 0.75 : 0.35;
                if (bombVisual.scale) {
                    bombVisual.scale.set(baseBombScale * (1 + t * grow));
                }
                groundShadow.alpha = Math.min(0.62, t * 0.75);
                groundShadow.scale.set(0.25 + t * 1.35, 0.25 + t * 1.05);
                targetGlow.alpha = 0.35 + t * 0.45;
                targetGlow.scale.set(0.4 + t * 0.95);

                if (t > 0.04 && Math.random() < (cinematic ? 0.78 : 0.4)) {
                    const tr = makeSmokePuff(PIXI, unit, t < 0.65 && Math.random() > 0.35);
                    tr.x = bombWrap.x + (Math.random() - 0.5) * unit * 0.35;
                    tr.y = bombWrap.y + unit * 0.35;
                    trailContainer.addChild(tr);
                    gsap.to(tr, {
                        alpha: 0,
                        x: tr.x + (Math.random() - 0.5) * unit * 0.55,
                        y: tr.y + unit * (0.25 + Math.random() * 0.65),
                        scale: { x: 1.8, y: 1.8 },
                        duration: 0.55 + Math.random() * 0.45,
                        ease: "power1.out",
                        onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
                    });
                }
            },
        }, travelStart + 0.02);

        const impactAt = travelStart + 0.02 + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            if (fuseInterval) clearInterval(fuseInterval);
            bombWrap.visible = false;
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
            if (cinematic) {
                for (let si = 0; si < 8; si++) {
                    const sm = makeSmokePuff(PIXI, unit, false);
                    sm.x = cx + (Math.random() - 0.5) * unit * 0.5;
                    sm.y = cy + unit * 0.05;
                    sm.scale.set(1.2 + Math.random() * 1.4);
                    smokeContainer.addChild(sm);
                    gsap.to(sm, {
                        alpha: 0,
                        y: sm.y - unit * (0.8 + Math.random() * 1.2),
                        scale: { x: sm.scale.x * 2.2, y: sm.scale.y * 2.2 },
                        duration: 1.1 + Math.random() * 0.6,
                        ease: "power1.out",
                        onComplete: () => { try { sm.destroy(); } catch (e) { /* */ } },
                    });
                }
            }
        }, "impact");

        addFireBurstToTimeline(tl, container, smokeContainer, PIXI, theme, unit, cinematic, "impact", cx, cy);

        tl.to(procExplData.root, { alpha: 1, duration: 0.04 }, "impact");
        tl.to({}, {
            duration: impactDur * 0.68,
            onUpdate() {
                const prog = this.progress();
                const fi = Math.min(procExplData.frameCount - 1, Math.floor(prog * procExplData.frameCount));
                procExplData.frames.forEach((fr, idx) => {
                    fr.visible = idx === fi;
                    fr.alpha = idx === fi ? 1 : 0;
                });
            },
        }, "impact");
        tl.to(procExplData.root, { alpha: 0, duration: impactDur * 0.32 }, `impact+=${impactDur * 0.52}`);

        if (explSprite) {
            const peakSc = sheetScale(unit, explSheet.meta.size, cinematic ? 4.0 : 2.1);
            tl.to(explSprite, { alpha: 1, duration: 0.05 }, "impact");
            tl.to(explSprite.scale, {
                x: peakSc, y: peakSc, duration: impactDur * 0.55, ease: "power3.out",
            }, "impact");
            tl.to({}, {
                duration: impactDur * 0.72,
                onUpdate() {
                    const prog = this.progress();
                    const fi = Math.min(explSheet.frames.length - 1, Math.floor(prog * explSheet.frames.length));
                    explSprite.texture = explSheet.frames[fi];
                },
            }, "impact");
            tl.to(explSprite, { alpha: 0, duration: impactDur * 0.28 }, `impact+=${impactDur * 0.5}`);
        }

        tl.to(impactBloom, { alpha: 0.9, duration: 0.05 }, "impact");
        tl.to(impactBloom.scale, { x: 1.4, y: 1.4, duration: impactDur * 0.32, ease: "power2.out" }, "impact");
        tl.to(impactBloom, { alpha: 0, duration: impactDur * 0.38 }, `impact+=${impactDur * 0.14}`);

        shockRings.forEach((ring, i) => {
            const off = i * 0.06;
            const peak = cinematic ? 5.0 + i * 1.35 : 2.8 + i * 0.7;
            tl.to(ring, { alpha: 0.9 - i * 0.12, duration: 0.06 }, `impact+=${off}`);
            tl.to(ring.scale, { x: peak, y: peak, duration: impactDur * 0.62, ease: "power2.out" }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: impactDur * 0.38 }, `impact+=${0.14 + off}`);
        });

        tl.to(flashCore, { alpha: 1, duration: 0.04 }, "impact");
        tl.to(flashCore.scale, {
            x: cinematic ? 8.5 : 4.2, y: cinematic ? 8.5 : 4.2,
            duration: impactDur * 0.28, ease: "power2.out",
        }, "impact");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.35 }, `impact+=${impactDur * 0.12}`);

        tl.to(shakeWrap.scale, {
            x: cinematic ? 1.05 : 1.028, y: cinematic ? 1.05 : 1.028,
            duration: 0.05, ease: "power2.out",
        }, "impact");
        tl.to(shakeWrap.scale, { x: 1, y: 1, duration: 0.36, ease: "power2.out" }, `impact+=0.05`);

        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.58 : 0.28,
            ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeProxy.t) * (cinematic ? 26 : 10);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "impact");

        const partProxy = { t: 0 };
        tl.add(() => {
            particles.forEach((p, i) => {
                const isEmber = i < emberCount;
                const ang = (Math.PI * 2 * i) / particles.length + (Math.random() - 0.5) * 0.55;
                const spd = (isEmber ? (cinematic ? 6 : 3) : (cinematic ? 4 : 2))
                    + Math.random() * (isEmber ? (cinematic ? 11 : 6) : 4);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - (isEmber ? (cinematic ? 4 : 2) : 1.2);
                p.vr = (Math.random() - 0.5) * 0.35;
                p.g.visible = true;
                p.g.x = cx;
                p.g.y = cy;
                p.g.alpha = 1;
            });
        }, "impact");
        tl.to(partProxy, {
            t: 1,
            duration: lingerDur + impactDur * 0.35,
            ease: "none",
            onUpdate: () => {
                particles.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.11;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.05);
                });
            },
        }, "impact");

        tl.to(targetGlow, { alpha: 0, duration: lingerDur * 0.6 }, `impact+=${impactDur * 0.2}`);
        tl.to(targetReticle, { alpha: 0, duration: lingerDur * 0.35 }, `impact+=${impactDur * 0.15}`);
        tl.to(groundShadow, { alpha: 0, duration: lingerDur * 0.5 }, `impact+=${impactDur * 0.15}`);

        tl.add(() => {
            if (fuseInterval) clearInterval(fuseInterval);
            shakeWrap.x = 0;
            shakeWrap.y = 0;
            shakeWrap.scale.set(1);
            if (cinematicWash) { try { gsap.killTweensOf(cinematicWash); } catch (e) { /* */ } }
            try { gsap.killTweensOf(container); } catch (e) { /* */ }
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            frame.end();
        }
    }

    /**
     * Florisbella — Fortalecer: cena Pixi+GSAP cinematográfica.
     * Pilar de luz verde, orbe descendente, glifos RPG, anel de runa e bloom de impacto — sem traços/linhas.
     */
    async function playFortifyUltimateScene(cx, cy, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playFortifyUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, cinematic);
        const targetM = frame.map(cx, cy);
        cx = targetM.x;
        cy = targetM.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 480) : 280);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 720) : 420);
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 900) : 520);
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 400) : 200);
        const unit = cardUnit(1);
        let fromX = opts.fromX ?? cx;
        let fromY = opts.fromY ?? Math.max(48, cy - Math.min(global.innerHeight * 0.55, 420));
        if (opts.fromX != null && opts.fromY != null) {
            const fm = frame.map(fromX, fromY);
            fromX = fm.x;
            fromY = fm.y;
        } else {
            fromY = Math.max(48, cy - Math.min(frame.clipH * 0.55, 420));
        }
        const skyY = Math.min(fromY - unit * 1.2, cy - Math.min(frame.clipH * 0.62, 480));

        try {

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        let skyWash = null;
        if (cinematic) {
            const scene1 = scenePixels();
            skyWash = new PIXI.Graphics();
            skyWash.beginFill(0x041a0c, 0.42);
            skyWash.drawRect(0, 0, scene1.w, scene1.h);
            skyWash.endFill();
            skyWash.alpha = 0;
            container.addChild(skyWash);
        }

        const pillarH = Math.max(unit * 4.2, cy - skyY + unit * 0.85);
        const pillar = buildFortifyPillar(PIXI, theme, unit, pillarH);
        pillar.x = cx;
        pillar.y = cy + unit * 0.12;
        pillar.alpha = 0;
        pillar.scale.y = 0.04;
        container.addChild(pillar);

        const targetGlow = makeSoftBloom(PIXI, theme, unit, 0.95);
        targetGlow.x = cx;
        targetGlow.y = cy;
        targetGlow.alpha = 0;
        targetGlow.scale.set(0.4);
        container.addChild(targetGlow);

        const empowerAura = makeSoftBloom(PIXI, theme, unit, 1.35);
        empowerAura.x = cx;
        empowerAura.y = cy;
        empowerAura.alpha = 0;
        empowerAura.scale.set(0.5);
        container.addChild(empowerAura);

        const pillarSparkles = [];
        const sparkleN = n(cinematic ? 28 : 14);
        for (let i = 0; i < sparkleN; i++) {
            const sp = makeFortifySpark(PIXI, theme, unit, i % 5 === 0);
            sp.x = cx + (Math.random() - 0.5) * unit * 0.35;
            sp.y = cy - Math.random() * pillarH * 0.92;
            sp.alpha = 0;
            container.addChild(sp);
            pillarSparkles.push(sp);
        }

        const powerGlyphs = [];
        const glyphN = n(cinematic ? 12 : 7);
        for (let i = 0; i < glyphN; i++) {
            const variant = i % 3 === 0 ? "arrow" : "diamond";
            const gl = makePowerGlyph(PIXI, theme, unit, variant);
            gl.x = cx;
            gl.y = cy;
            gl.alpha = 0;
            gl.rotation = (i / glyphN) * Math.PI * 2;
            container.addChild(gl);
            powerGlyphs.push({
                g: gl,
                ang: (i / glyphN) * Math.PI * 2,
                lift: unit * (0.45 + Math.random() * 0.75),
            });
        }

        const runeRing = makeFortifyRuneRing(PIXI, theme, unit);
        runeRing.x = cx;
        runeRing.y = cy;
        runeRing.alpha = 0;
        runeRing.scale.set(0.35);
        container.addChild(runeRing);

        const orbWrap = new PIXI.Container();
        orbWrap.x = fromX;
        orbWrap.y = skyY - unit * 0.8;
        orbWrap.alpha = 0;
        container.addChild(orbWrap);

        const orbSheet = await sheetTextures(PIXI, "fortify_orb");
        let orbVisual;
        if (orbSheet?.frames?.length) {
            orbVisual = new PIXI.AnimatedSprite(orbSheet.frames);
            orbVisual.anchor.set(0.5);
            orbVisual.animationSpeed = cinematic ? 0.42 : 0.28;
            orbVisual.play();
            const sc = sheetScale(unit, orbSheet.meta.size, cinematic ? 2.1 : 1.35);
            orbVisual.scale.set(sc);
            orbWrap.addChild(orbVisual);
        } else {
            const body = new PIXI.Graphics();
            const r = unit * (cinematic ? 0.38 : 0.26);
            body.beginFill(theme.core, 0.95);
            body.drawCircle(0, 0, r);
            body.endFill();
            body.beginFill(theme.flash, 0.55);
            body.drawCircle(-r * 0.22, -r * 0.28, r * 0.45);
            body.endFill();
            if (PIXI.BLEND_MODES) body.blendMode = PIXI.BLEND_MODES.ADD;
            orbWrap.addChild(body);
            orbVisual = body;
        }

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const impactRoot = new PIXI.Container();
        impactRoot.x = cx;
        impactRoot.y = cy;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const impactSheet = await sheetTextures(PIXI, "fortify_impact_premium")
            || await sheetTextures(PIXI, "fortify_impact");
        let impactSprite = null;
        let procBloom = null;
        if (impactSheet?.frames?.length) {
            impactSprite = new PIXI.AnimatedSprite(impactSheet.frames);
            impactSprite.anchor.set(0.5);
            impactSprite.loop = false;
            const impSc = sheetScale(unit, impactSheet.meta.size, cinematic ? 3.2 : 2);
            impactSprite.scale.set(impSc * 0.12);
            impactSprite.alpha = 0;
            impactRoot.addChild(impactSprite);
        } else {
            procBloom = buildProceduralFortifyBloom(PIXI, theme, unit);
            procBloom.root.alpha = 0;
            impactRoot.addChild(procBloom.root);
        }

        const impactBlooms = [];
        for (let i = 0; i < (cinematic ? 5 : 3); i++) {
            const bloom = makeSoftBloom(PIXI, theme, unit, 0.28 + i * 0.12);
            // Filho de impactRoot (já em cx,cy) → coordenada LOCAL. Usar cx/cy
            // aqui duplicava a explosão em (2cx, 2cy), longe do campeão.
            bloom.x = 0;
            bloom.y = 0;
            bloom.alpha = 0;
            bloom.scale.set(0.15);
            impactRoot.addChild(bloom);
            impactBlooms.push(bloom);
        }

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.92);
        flashCore.drawCircle(0, 0, unit * 0.32);
        flashCore.endFill();
        flashCore.scale.set(0.04);
        flashCore.alpha = 0;
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const sustainHalos = [];
        for (let i = 0; i < (cinematic ? 3 : 2); i++) {
            const halo = makeSoftBloom(PIXI, theme, unit, 0.75 + i * 0.22);
            halo.x = cx;
            halo.y = cy;
            halo.alpha = 0;
            halo.scale.set(0.55 + i * 0.08);
            container.addChild(halo);
            sustainHalos.push(halo);
        }

        const moteCount = n(cinematic ? 48 : 20);
        /** @type {{ g: PIXI.Graphics, vx: number, vy: number, vr: number, drag: number }[]} */
        const particles = [];
        for (let i = 0; i < moteCount; i++) {
            const g = makeFortifySpark(PIXI, theme, unit, i % 7 === 0);
            g.x = cx;
            g.y = cy;
            g.visible = false;
            container.addChild(g);
            particles.push({
                g, vx: 0, vy: 0, vr: 0,
                drag: 0.992,
            });
        }

        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const sparkleProxy = { t: 0 };
        const shakeProxy = { t: 0 };
        const baseOrbScale = orbVisual.scale?.x ?? 1;

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        if (skyWash) {
            tl.to(skyWash, { alpha: 0.58, duration: 0.38, ease: "sine.out" }, 0);
            tl.to(skyWash, { alpha: 0, duration: 0.95, ease: "power2.out" }, (windupMs + travelMs + impactMs * 0.35) / 1000);
        }

        const spawnTrail = (x, y, bright) => {
            const tr = makeFortifySpark(PIXI, theme, unit, bright);
            tr.x = x + (Math.random() - 0.5) * unit * 0.22;
            tr.y = y + unit * 0.06;
            tr.alpha = bright ? 0.95 : 0.7;
            trailContainer.addChild(tr);
            gsap.to(tr, {
                alpha: 0,
                x: tr.x + (Math.random() - 0.5) * unit * 0.35,
                y: tr.y - unit * (0.45 + Math.random() * 0.65),
                duration: 0.5 + Math.random() * 0.4,
                ease: "sine.out",
                onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
            });
        };

        tl.to(pillar, { alpha: cinematic ? 0.92 : 0.72, duration: windupDur * 0.4, ease: "power2.out" }, 0);
        tl.to(pillar.scale, { y: 1, duration: windupDur * 0.9, ease: "power3.out" }, 0);
        tl.to(targetGlow, { alpha: 0.55, duration: windupDur * 0.5, ease: "sine.out" }, 0);
        tl.to(targetGlow.scale, { x: 1, y: 1, duration: windupDur, ease: "sine.inOut" }, 0);
        tl.to(empowerAura, { alpha: 0.35, duration: windupDur * 0.55, ease: "sine.out" }, 0.08);
        tl.to(empowerAura.scale, { x: 0.85, y: 0.85, duration: windupDur, ease: "sine.inOut" }, 0.08);
        tl.to(runeRing, { alpha: cinematic ? 0.72 : 0.48, duration: windupDur * 0.45, ease: "sine.out" }, 0.04);
        tl.to(runeRing.scale, { x: 0.95, y: 0.95, duration: windupDur, ease: "sine.inOut" }, 0.04);
        tl.to(runeRing, { rotation: Math.PI * 0.35, duration: windupDur + travelDur, ease: "none" }, 0);
        tl.to(orbWrap, { alpha: 1, duration: 0.28, ease: "sine.out" }, 0.06);
        tl.to(sparkleProxy, {
            t: 1,
            duration: windupDur + travelDur * 0.85,
            ease: "none",
            onUpdate: () => {
                pillarSparkles.forEach((sp, i) => {
                    const phase = (sparkleProxy.t + i * 0.07) % 1;
                    sp.alpha = Math.sin(phase * Math.PI) * 0.85;
                    sp.y -= unit * 0.018;
                    if (sp.y < cy - pillarH) {
                        sp.y = cy + unit * 0.05;
                        sp.x = cx + (Math.random() - 0.5) * unit * 0.38;
                    }
                });
            },
        }, 0);

        const travelStart = windupDur;
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: "power2.inOut",
            onUpdate: () => {
                const t = travelProxy.p;
                const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const spiral = Math.sin(t * Math.PI * 3.2) * unit * (cinematic ? 0.42 : 0.22);
                orbWrap.x = fromX + (cx - fromX) * easeT + spiral;
                orbWrap.y = skyY + (cy - skyY) * easeT - Math.sin(t * Math.PI) * unit * (cinematic ? 0.55 : 0.28);
                orbWrap.rotation = t * Math.PI * (cinematic ? 2.8 : 1.6);
                if (orbVisual.scale) {
                    orbVisual.scale.set(baseOrbScale * (1 + t * (cinematic ? 0.35 : 0.18)));
                }
                pillar.alpha = Math.max(0.35, 0.95 - t * 0.25);
                targetGlow.alpha = 0.55 + t * 0.42;
                targetGlow.scale.set(0.85 + t * 0.65);
                empowerAura.alpha = 0.35 + t * 0.45;
                empowerAura.scale.set(0.85 + t * 0.35);

                if (t > 0.04 && Math.random() < (cinematic ? 0.68 : 0.35)) {
                    spawnTrail(orbWrap.x, orbWrap.y, t > 0.5);
                }
            },
        }, travelStart);

        const impactAt = travelStart + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            orbWrap.visible = false;
            orbWrap.alpha = 0;
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
            addSoftImpactToTimeline(tl, impactRoot, PIXI, theme, unit, cinematic, "impact", { core: 0x9bffc0, flash: 0xe8fff0 });
        }, "impact");

        powerGlyphs.forEach((pg, i) => {
            const off = i * 0.04;
            tl.to(pg.g, { alpha: 0.95, duration: 0.12 }, `impact+=${off}`);
            tl.to(pg.g, {
                x: cx + Math.cos(pg.ang) * unit * 0.15,
                y: cy - pg.lift,
                rotation: pg.g.rotation + Math.PI * 0.5,
                duration: impactDur * 0.55 + lingerDur * 0.35,
                ease: "power2.out",
            }, `impact+=${off}`);
            tl.to(pg.g, { alpha: 0, duration: lingerDur * 0.45 }, `impact+=${impactDur * 0.35 + off}`);
        });

        if (impactSprite && impactSheet) {
            const peakSc = sheetScale(unit, impactSheet.meta.size, cinematic ? 3.2 : 2);
            tl.to(impactSprite, { alpha: 1, duration: 0.05 }, "impact");
            tl.to(impactSprite.scale, {
                x: peakSc, y: peakSc, duration: impactDur * 0.5, ease: "power3.out",
            }, "impact");
            tl.to({}, {
                duration: impactDur * 0.68,
                onUpdate() {
                    const prog = this.progress();
                    const fi = Math.min(impactSheet.frames.length - 1, Math.floor(prog * impactSheet.frames.length));
                    impactSprite.texture = impactSheet.frames[fi];
                },
            }, "impact");
            tl.to(impactSprite, { alpha: 0, duration: impactDur * 0.32 }, `impact+=${impactDur * 0.48}`);
        } else if (procBloom) {
            procBloom.frames.forEach((fr, fi) => {
                const off = (fi / procBloom.frameCount) * impactDur * 0.62;
                tl.add(() => {
                    procBloom.frames.forEach((f) => { f.visible = false; f.alpha = 0; });
                    fr.visible = true;
                }, `impact+=${off}`);
                tl.to(fr, { alpha: 0.92 - fi * 0.04, duration: impactDur * 0.08 }, `impact+=${off}`);
            });
            tl.to(procBloom.root, { alpha: 0, duration: impactDur * 0.28 }, `impact+=${impactDur * 0.55}`);
        }

        impactBlooms.forEach((bloom, i) => {
            const off = i * 0.06;
            const peak = cinematic ? 3.2 + i * 0.85 : 2.1 + i * 0.5;
            tl.to(bloom, { alpha: 0.75 - i * 0.1, duration: 0.08 }, `impact+=${off}`);
            tl.to(bloom.scale, { x: peak, y: peak * 0.88, duration: impactDur * 0.55, ease: "power2.out" }, `impact+=${off}`);
            tl.to(bloom, { alpha: 0, duration: impactDur * 0.38 }, `impact+=${0.14 + off}`);
        });

        tl.to(flashCore, { alpha: 1, duration: 0.05 }, "impact");
        tl.to(flashCore.scale, {
            x: cinematic ? 5.8 : 3.5, y: cinematic ? 5.2 : 3.1,
            duration: impactDur * 0.28, ease: "power2.out",
        }, "impact");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.34 }, `impact+=${impactDur * 0.1}`);

        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.42 : 0.24,
            ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeProxy.t) * (cinematic ? 14 : 7);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "impact");

        tl.to(runeRing, { alpha: 0.88, duration: 0.1 }, "impact");
        tl.to(runeRing.scale, {
            x: cinematic ? 1.35 : 1.05, y: cinematic ? 1.35 : 1.05,
            duration: impactDur * 0.42, ease: "power2.out",
        }, "impact");
        tl.to(runeRing, { alpha: 0, duration: lingerDur * 0.65 }, `impact+=${impactDur * 0.35}`);

        sustainHalos.forEach((halo, i) => {
            const off = 0.1 + i * 0.14;
            tl.to(halo, { alpha: 0.7 - i * 0.12, duration: 0.14 }, `impact+=${off}`);
            tl.to(halo.scale, {
                x: 1.22 + i * 0.18, y: 1.22 + i * 0.18,
                duration: impactDur * 0.45 + lingerDur * 0.35,
                ease: "sine.out",
            }, `impact+=${off}`);
            tl.to(halo, { alpha: 0, duration: lingerDur * 0.55 }, `impact+=${impactDur * 0.42 + off}`);
        });

        const partProxy = { t: 0 };
        tl.add(() => {
            particles.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / particles.length + (Math.random() - 0.5) * 0.45;
                const spd = (cinematic ? 3.5 : 2) + Math.random() * (cinematic ? 5 : 3);
                p.vx = Math.cos(ang) * spd * 0.42;
                p.vy = -Math.abs(Math.sin(ang)) * spd - (cinematic ? 4.2 : 2.2);
                p.vr = (Math.random() - 0.5) * 0.22;
                p.g.visible = true;
                p.g.x = cx + (Math.random() - 0.5) * unit * 0.35;
                p.g.y = cy + unit * 0.08;
                p.g.alpha = 1;
            });
        }, "impact");
        tl.to(partProxy, {
            t: 1,
            duration: lingerDur + impactDur * 0.45,
            ease: "none",
            onUpdate: () => {
                particles.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy -= 0.05;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.05);
                });
            },
        }, "impact");

        tl.to(pillar, { alpha: 0, duration: lingerDur * 0.7 }, `impact+=${impactDur * 0.15}`);
        tl.to(targetGlow, { alpha: 0, duration: lingerDur * 0.75 }, `impact+=${impactDur * 0.2}`);
        tl.to(empowerAura, { alpha: 0, duration: lingerDur * 0.8 }, `impact+=${impactDur * 0.25}`);

        tl.add(() => {
            shakeWrap.x = 0;
            shakeWrap.y = 0;
            if (skyWash) { try { gsap.killTweensOf(skyWash); } catch (e) { /* */ } }
            try { gsap.killTweensOf(container); } catch (e) { /* */ }
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            frame.end();
        }
    }

    /** Partícula violeta — só preenchimento. */
    function makeConjureSpark(PIXI, theme, unit, large) {
        const g = new PIXI.Graphics();
        const r = unit * (large ? 0.05 + Math.random() * 0.055 : 0.02 + Math.random() * 0.04);
        const col = Math.random() > 0.35 ? theme.flash : theme.spark;
        g.beginFill(col, large ? 0.82 : 0.9);
        g.drawCircle(0, 0, r);
        g.endFill();
        if (large) {
            g.beginFill(0xffffff, 0.45);
            g.drawCircle(0, 0, r * 0.42);
            g.endFill();
        }
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    /** Portal arcano preenchido (elipses + runas — sem lineStyle). */
    function buildArcanePortal(PIXI, theme, unit) {
        const root = new PIXI.Container();

        const pool = new PIXI.Graphics();
        pool.beginFill(theme.core, 0.28);
        pool.drawEllipse(0, unit * 0.06, unit * 1.05, unit * 0.38);
        pool.endFill();
        if (PIXI.BLEND_MODES) pool.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(pool);

        for (let band = 0; band < 6; band++) {
            const w = unit * (1.05 - band * 0.12);
            const h = unit * (0.62 - band * 0.07);
            const col = band < 2 ? 0xffffff : (band < 4 ? theme.flash : theme.spark);
            const beam = new PIXI.Graphics();
            beam.beginFill(col, 0.38 - band * 0.05);
            beam.drawEllipse(0, 0, w, h);
            beam.endFill();
            if (PIXI.BLEND_MODES && band < 4) beam.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(beam);
        }

        const core = new PIXI.Graphics();
        core.beginFill(0xffffff, 0.72);
        core.drawEllipse(0, 0, unit * 0.22, unit * 0.14);
        core.endFill();
        core.beginFill(theme.flash, 0.55);
        core.drawEllipse(0, 0, unit * 0.38, unit * 0.22);
        core.endFill();
        if (PIXI.BLEND_MODES) core.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(core);

        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const dot = new PIXI.Graphics();
            dot.beginFill(i % 2 ? theme.flash : 0xffffff, 0.75);
            dot.drawCircle(
                Math.cos(ang) * unit * 0.52,
                Math.sin(ang) * unit * 0.32,
                unit * (0.035 + (i % 3) * 0.012),
            );
            dot.endFill();
            root.addChild(dot);
        }

        return root;
    }

    /** Carta com verso real (verso.png) + brilho místico. */
    async function buildCardBackSprite(PIXI, w, h, theme) {
        const root = new PIXI.Container();
        const radius = Math.max(6, w * 0.08);

        const glow = new PIXI.Graphics();
        glow.beginFill(theme.core, 0.32);
        glow.drawRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, radius + 5);
        glow.endFill();
        glow.beginFill(theme.flash, 0.18);
        glow.drawRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, radius + 2);
        glow.endFill();
        if (PIXI.BLEND_MODES) glow.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(glow);

        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
        mask.endFill();
        root.addChild(mask);

        const tex = await loadTexture(assetUrl("verso.png"));
        if (tex) {
            const art = new PIXI.Sprite(tex);
            art.anchor.set(0.5);
            art.scale.set(Math.max(w / tex.width, h / tex.height));
            art.mask = mask;
            root.addChild(art);
        } else {
            const fb = new PIXI.Graphics();
            fb.beginFill(0x12081f, 1);
            fb.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
            fb.endFill();
            fb.beginFill(theme.flash, 0.35);
            fb.drawRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, radius - 2);
            fb.endFill();
            root.addChild(fb);
        }
        return root;
    }

    /**
     * Eurávia — Conjuração: portal arcano abre; carta (verso) emerge e voa à mão com fluidez.
     */
    async function playConjureUltimateScene(portalX, portalY, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playConjureUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        let handX = opts.handX ?? portalX;
        let handY = opts.handY ?? portalY + 120;

        const frame = pixiSceneFrame(a, cinematic);
        const portalM = frame.map(portalX, portalY);
        portalX = portalM.x;
        portalY = portalM.y;
        const handM = frame.map(handX, handY);
        handX = handM.x;
        handY = handM.y;

        try {
        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 380) : 220);
        const portalMs = opts.portalMs ?? (cinematic ? (gsapT.portal ?? 720) : 420);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 880) : 520);
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 520) : 320);
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 360) : 180);
        const unit = cardUnit(1);

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        if (cinematic) {
            const skyWash = new PIXI.Graphics();
            skyWash.beginFill(0x0a0218, 0.48);
            skyWash.drawRect(0, 0, frame.clipW, frame.clipH);
            skyWash.endFill();
            skyWash.alpha = 0;
            container.addChild(skyWash);
            gsap.to(skyWash, { alpha: 0.62, duration: 0.35, ease: "sine.out" });
            gsap.to(skyWash, {
                alpha: 0,
                duration: 1.1,
                ease: "power2.out",
                delay: (windupMs + portalMs + travelMs * 0.55) / 1000,
            });
        }

        const portalWrap = new PIXI.Container();
        portalWrap.x = portalX;
        portalWrap.y = portalY;
        portalWrap.alpha = 0;
        portalWrap.scale.set(0.04);
        container.addChild(portalWrap);

        const portalProc = buildArcanePortal(PIXI, theme, unit);
        portalWrap.addChild(portalProc);

        const portalSheet = await sheetTextures(PIXI, recipe?.sheets?.portal || "arcane_portal");
        let portalSprite = null;
        if (portalSheet?.frames?.length) {
            portalSprite = new PIXI.AnimatedSprite(portalSheet.frames);
            portalSprite.anchor.set(0.5);
            portalSprite.animationSpeed = cinematic ? 0.38 : 0.24;
            portalSprite.play();
            const pSc = sheetScale(unit, portalSheet.meta.size, cinematic ? 2.4 : 1.55);
            portalSprite.scale.set(pSc);
            if (PIXI.BLEND_MODES) portalSprite.blendMode = PIXI.BLEND_MODES.ADD;
            portalWrap.addChild(portalSprite);
        }

        const swirlSheet = await sheetTextures(PIXI, recipe?.sheets?.impact || "conjure_swirl");
        let swirlSprite = null;
        if (swirlSheet?.frames?.length) {
            swirlSprite = new PIXI.AnimatedSprite(swirlSheet.frames);
            swirlSprite.anchor.set(0.5);
            swirlSprite.loop = false;
            swirlSprite.alpha = 0;
            const swSc = sheetScale(unit, swirlSheet.meta.size, cinematic ? 2.2 : 1.4);
            swirlSprite.scale.set(swSc * 0.15);
            portalWrap.addChild(swirlSprite);
        }

        const portalBloom = makeSoftBloom(PIXI, theme, unit, 1.15);
        portalBloom.alpha = 0;
        portalWrap.addChildAt(portalBloom, 0);

        const portalSparks = [];
        const sparkN = n(cinematic ? 22 : 12);
        for (let i = 0; i < sparkN; i++) {
            const sp = makeConjureSpark(PIXI, theme, unit, i % 4 === 0);
            const ang = (i / sparkN) * Math.PI * 2;
            sp.x = Math.cos(ang) * unit * (0.35 + Math.random() * 0.35);
            sp.y = Math.sin(ang) * unit * (0.22 + Math.random() * 0.22);
            sp.alpha = 0;
            portalWrap.addChild(sp);
            portalSparks.push(sp);
        }

        const cardW = Math.round(unit * 0.85);
        const cardH = Math.round(cardW * 1.38);
        const cardWrap = new PIXI.Container();
        cardWrap.x = portalX;
        cardWrap.y = portalY;
        cardWrap.alpha = 0;
        cardWrap.scale.set(0.08);
        cardWrap.visible = false;
        container.addChild(cardWrap);

        const cardVisual = await buildCardBackSprite(PIXI, cardW, cardH, theme);
        cardWrap.addChild(cardVisual);

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const handBloom = makeSoftBloom(PIXI, theme, unit, 0.85);
        handBloom.x = handX;
        handBloom.y = handY;
        handBloom.alpha = 0;
        handBloom.scale.set(0.2);
        container.addChild(handBloom);

        const handFlash = new PIXI.Graphics();
        handFlash.beginFill(0xffffff, 0.88);
        handFlash.drawCircle(0, 0, unit * 0.28);
        handFlash.endFill();
        handFlash.x = handX;
        handFlash.y = handY;
        handFlash.alpha = 0;
        handFlash.scale.set(0.05);
        if (PIXI.BLEND_MODES) handFlash.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(handFlash);

        const windupDur = windupMs / 1000;
        const portalDur = portalMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const sparkleProxy = { t: 0 };
        const portalSpin = { r: 0 };

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        const spawnTrail = (x, y, bright) => {
            const tr = makeConjureSpark(PIXI, theme, unit, bright);
            tr.x = x + (Math.random() - 0.5) * unit * 0.2;
            tr.y = y + unit * 0.04;
            tr.alpha = bright ? 0.92 : 0.68;
            trailContainer.addChild(tr);
            gsap.to(tr, {
                alpha: 0,
                x: tr.x + (Math.random() - 0.5) * unit * 0.4,
                y: tr.y - unit * (0.35 + Math.random() * 0.55),
                duration: 0.45 + Math.random() * 0.35,
                ease: "sine.out",
                onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
            });
        };

        tl.to(portalWrap, { alpha: cinematic ? 0.95 : 0.78, duration: windupDur * 0.45, ease: "power2.out" }, 0);
        tl.to(portalWrap.scale, { x: 1.08, y: 1.08, duration: windupDur + portalDur * 0.65, ease: "power3.out" }, 0);
        tl.to(portalBloom, { alpha: cinematic ? 0.55 : 0.38, duration: windupDur * 0.5, ease: "sine.out" }, 0);
        tl.to(portalSpin, {
            r: Math.PI * (cinematic ? 1.8 : 1.1),
            duration: windupDur + portalDur + travelDur * 0.35,
            ease: "none",
            onUpdate: () => { portalWrap.rotation = portalSpin.r; },
        }, 0);
        tl.to(sparkleProxy, {
            t: 1,
            duration: windupDur + portalDur + travelDur * 0.7,
            ease: "none",
            onUpdate: () => {
                portalSparks.forEach((sp, i) => {
                    const phase = (sparkleProxy.t + i * 0.09) % 1;
                    sp.alpha = Math.sin(phase * Math.PI) * 0.82;
                    sp.rotation = sparkleProxy.t * Math.PI * 2 + i;
                });
            },
        }, 0);

        const portalOpenAt = windupDur * 0.35;
        tl.to(portalWrap.scale, { x: 1, y: 1, duration: portalDur * 0.35, ease: "elastic.out(1, 0.55)" }, portalOpenAt);

        if (swirlSprite && swirlSheet) {
            const peakSw = sheetScale(unit, swirlSheet.meta.size, cinematic ? 2.2 : 1.4);
            tl.to(swirlSprite, { alpha: 0.92, duration: 0.08 }, portalOpenAt);
            tl.to(swirlSprite.scale, { x: peakSw, y: peakSw, duration: portalDur * 0.42, ease: "power2.out" }, portalOpenAt);
            tl.to({}, {
                duration: portalDur * 0.5,
                onUpdate() {
                    const prog = this.progress();
                    const fi = Math.min(swirlSheet.frames.length - 1, Math.floor(prog * swirlSheet.frames.length));
                    swirlSprite.texture = swirlSheet.frames[fi];
                },
            }, portalOpenAt);
            tl.to(swirlSprite, { alpha: 0, duration: portalDur * 0.28 }, `+=${portalDur * 0.22}`);
        }

        const emergeAt = portalOpenAt + portalDur * 0.42;
        tl.addLabel("emerge", emergeAt);
        tl.add(() => {
            cardWrap.visible = true;
        }, "emerge");
        tl.to(cardWrap, { alpha: 1, duration: 0.18, ease: "sine.out" }, "emerge");
        tl.to(cardWrap.scale, {
            x: cinematic ? 0.92 : 0.78, y: cinematic ? 0.92 : 0.78,
            duration: portalDur * 0.38, ease: "back.out(1.6)",
        }, "emerge");
        tl.to(cardWrap, {
            y: portalY - unit * (cinematic ? 0.18 : 0.1),
            duration: portalDur * 0.32, ease: "power2.out",
        }, "emerge");

        const travelStart = emergeAt + portalDur * 0.28;
        tl.addLabel("travel", travelStart);
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: "power2.inOut",
            onUpdate: () => {
                const t = travelProxy.p;
                const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const lift = -unit * (cinematic ? 0.72 : 0.42) * Math.sin(Math.PI * easeT);
                const wobble = Math.sin(t * Math.PI * 2.8) * unit * (cinematic ? 0.08 : 0.04) * (1 - t);
                cardWrap.x = portalX + (handX - portalX) * easeT + wobble;
                cardWrap.y = portalY + (handY - portalY) * easeT + lift;
                cardWrap.rotation = (-0.32 + easeT * 0.52) * (cinematic ? 1 : 0.65);
                const sc = (cinematic ? 0.92 : 0.78) + Math.sin(Math.PI * easeT) * (cinematic ? 0.14 : 0.08);
                cardWrap.scale.set(sc);

                portalWrap.alpha = Math.max(0, 0.95 - t * 1.05);
                portalWrap.scale.set(Math.max(0.15, 1 - t * 0.82));

                if (t > 0.02 && Math.random() < (cinematic ? 0.62 : 0.32)) {
                    spawnTrail(cardWrap.x, cardWrap.y, t > 0.45);
                }
            },
        }, "travel");

        const arriveAt = travelStart + travelDur;
        tl.addLabel("arrive", arriveAt);
        tl.add(() => {
            cardWrap.visible = false;
            if (typeof opts.onImpact === "function") opts.onImpact();
            const impactWrap = new PIXI.Container();
            impactWrap.x = handX;
            impactWrap.y = handY;
            container.addChild(impactWrap);
            const bloom = makeSoftBloom(PIXI, theme, unit, 1.15);
            bloom.alpha = 0;
            impactWrap.addChild(bloom);
            gsap.to(bloom, { alpha: cinematic ? 0.78 : 0.55, duration: 0.1 });
            gsap.to(bloom.scale, {
                x: cinematic ? 1.55 : 1.2, y: cinematic ? 1.55 : 1.2,
                duration: impactDur * 0.38, ease: "power2.out",
            });
            gsap.to(bloom, {
                alpha: 0, duration: impactDur * 0.42, delay: 0.12,
                onComplete: () => { try { impactWrap.destroy({ children: true }); } catch (e) { /* */ } },
            });
        }, "arrive");

        tl.to(handBloom, { alpha: cinematic ? 0.78 : 0.55, duration: 0.1 }, "arrive");
        tl.to(handBloom.scale, {
            x: cinematic ? 1.45 : 1.1, y: cinematic ? 1.45 : 1.1,
            duration: impactDur * 0.42, ease: "power2.out",
        }, "arrive");
        tl.to(handBloom, { alpha: 0, duration: lingerDur * 0.65 }, `arrive+=${impactDur * 0.28}`);

        tl.to(handFlash, { alpha: 1, duration: 0.05 }, "arrive");
        tl.to(handFlash.scale, {
            x: cinematic ? 4.2 : 2.6, y: cinematic ? 4.2 : 2.6,
            duration: impactDur * 0.32, ease: "power2.out",
        }, "arrive");
        tl.to(handFlash, { alpha: 0, duration: impactDur * 0.38 }, `arrive+=${impactDur * 0.08}`);

        tl.to(portalWrap, { alpha: 0, duration: lingerDur * 0.55 }, `arrive+=${impactDur * 0.12}`);
        tl.to(portalWrap.scale, { x: 0.02, y: 0.02, duration: lingerDur * 0.5, ease: "power2.in" }, `arrive+=${impactDur * 0.08}`);

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            frame.end();
        }
    }

    /**
     * Frosty — Congelar: cena Pixi+GSAP cartoon (estilo Hearthstone).
     * Floco gigante desce girando → cristal de gelo facetado encapsula o alvo
     * (squash & stretch) → onda de frost + estrelinhas + lascas de gelo.
     * Mesmo roteiro do manual ("casca de gelo no alvo").
     */
    async function playFreezeUltimateScene(cx, cy, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playFreezeUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, cinematic);
        const targetM = frame.map(cx, cy);
        cx = targetM.x;
        cy = targetM.y;

        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 360) : 220);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 820) : 460);
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 1000) : 540);
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 0) : 0);
        const unit = cardUnit(1);
        let fromX = opts.fromX ?? cx;
        let fromY = opts.fromY ?? cy;
        if (opts.fromX != null && opts.fromY != null) {
            const fm = frame.map(fromX, fromY);
            fromX = fm.x;
            fromY = fm.y;
        }
        const skyY = Math.min(fromY - unit * 0.8, cy - Math.min(frame.clipH * 0.55, 420));

        /** @type {PIXI.Container|null} */
        let shakeWrap = null;
        /** @type {{ g: PIXI.Graphics }[]} */
        let particles = [];
        /** @type {PIXI.DisplayObject[]} */
        let mistSparks = [];
        /** @type {import('gsap').Tween[]} */
        let orphanTweens = [];

        try {
        shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        const targetGlow = makeSoftBloom(PIXI, theme, unit, 0.95);
        targetGlow.x = cx;
        targetGlow.y = cy;
        targetGlow.alpha = 0;
        targetGlow.scale.set(0.4);
        container.addChild(targetGlow);

        const targetRing = makeToonRing(PIXI, 0xd9f7ff, 0x2a7da8, unit, 1.5);
        targetRing.x = cx;
        targetRing.y = cy;
        targetRing.alpha = 0;
        targetRing.scale.set(1.2);
        container.addChild(targetRing);

        const groundShadow = new PIXI.Graphics();
        groundShadow.beginFill(0x0a2a40, 0.4);
        groundShadow.drawEllipse(0, 0, unit * 0.55, unit * 0.18);
        groundShadow.endFill();
        groundShadow.x = cx;
        groundShadow.y = cy + unit * 0.1;
        groundShadow.alpha = 0;
        groundShadow.scale.set(0.25);
        container.addChild(groundShadow);

        const mistSparksArr = [];
        const mistN = n(cinematic ? 18 : 10);
        for (let i = 0; i < mistN; i++) {
            const sp = makeFrostSpeck(PIXI, unit, i % 5 === 0);
            sp.x = cx + (Math.random() - 0.5) * unit * 0.95;
            sp.y = cy + unit * (0.1 + Math.random() * 0.3);
            sp.alpha = 0;
            container.addChild(sp);
            mistSparksArr.push(sp);
        }
        mistSparks = mistSparksArr;

        const flakeWrap = new PIXI.Container();
        flakeWrap.x = fromX;
        flakeWrap.y = skyY - unit * 0.6;
        flakeWrap.alpha = 0;
        container.addChild(flakeWrap);
        const flake = buildToonSnowflake(PIXI, unit, cinematic ? 1.15 : 0.85);
        flakeWrap.addChild(flake);

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const impactRoot = new PIXI.Container();
        impactRoot.x = cx;
        impactRoot.y = cy;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const crystalData = buildToonIceCrystal(PIXI, unit, cinematic ? 1.0 : 0.8);
        crystalData.root.alpha = 0;
        crystalData.root.scale.set(0.1);
        impactRoot.addChild(crystalData.root);

        const frostRing = makeToonRing(PIXI, 0xeaffff, 0x2a7da8, unit, 1);
        frostRing.alpha = 0;
        frostRing.scale.set(0.15);
        impactRoot.addChild(frostRing);

        const frostRing2 = makeToonRing(PIXI, 0xbff0ff, 0x1f6e93, unit, 0.7);
        frostRing2.alpha = 0;
        frostRing2.scale.set(0.1);
        impactRoot.addChild(frostRing2);

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.95);
        flashCore.drawCircle(0, 0, unit * 0.32);
        flashCore.endFill();
        flashCore.scale.set(0.05);
        flashCore.alpha = 0;
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const speckCount = n(cinematic ? 40 : 18);
        /** @type {{ g: PIXI.Graphics, vx: number, vy: number, vr: number, drag: number }[]} */
        const partsArr = [];
        for (let i = 0; i < speckCount; i++) {
            const g = makeFrostSpeck(PIXI, unit, i % 6 === 0);
            g.x = cx;
            g.y = cy;
            g.visible = false;
            container.addChild(g);
            partsArr.push({ g, vx: 0, vy: 0, vr: 0, drag: 0.985 });
        }
        particles = partsArr;

        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const mistProxy = { t: 0 };
        const shakeProxy = { t: 0 };
        orphanTweens = [];
        const trackTween = (tw) => { if (tw) orphanTweens.push(tw); return tw; };

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        const spawnTrail = (x, y) => {
            const tr = makeFrostSpeck(PIXI, unit, Math.random() > 0.7);
            tr.x = x + (Math.random() - 0.5) * unit * 0.2;
            tr.y = y + unit * 0.05;
            trailContainer.addChild(tr);
            trackTween(gsap.to(tr, {
                alpha: 0,
                x: tr.x + (Math.random() - 0.5) * unit * 0.4,
                y: tr.y + unit * (0.25 + Math.random() * 0.4),
                rotation: (Math.random() - 0.5) * 3,
                duration: 0.5 + Math.random() * 0.35,
                ease: "sine.out",
                onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
            }));
        };

        tl.to(targetGlow, { alpha: 0.5, duration: windupDur * 0.6, ease: "sine.out" }, 0);
        tl.to(targetGlow.scale, { x: 0.9, y: 0.9, duration: windupDur, ease: "sine.inOut" }, 0);
        tl.to(targetRing, { alpha: cinematic ? 0.8 : 0.5, duration: windupDur * 0.5, ease: "sine.out" }, 0);
        tl.to(targetRing.scale, { x: 0.95, y: 0.95, duration: windupDur, ease: "back.out(1.6)" }, 0);
        tl.to(targetRing, { rotation: Math.PI * 0.5, duration: windupDur + travelDur, ease: "none" }, 0);
        tl.to(flakeWrap, { alpha: 1, duration: 0.22, ease: "sine.out" }, 0.05);
        tl.to(mistProxy, {
            t: 1,
            duration: windupDur + travelDur,
            ease: "none",
            onUpdate: () => {
                mistSparks.forEach((sp, i) => {
                    const phase = (mistProxy.t + i * 0.08) % 1;
                    sp.alpha = Math.sin(phase * Math.PI) * 0.8;
                    sp.y -= unit * 0.014;
                    sp.rotation += 0.04;
                    if (sp.y < cy - unit * 1.4) {
                        sp.y = cy + unit * (0.1 + Math.random() * 0.2);
                        sp.x = cx + (Math.random() - 0.5) * unit * 0.95;
                    }
                });
            },
        }, 0);

        const travelStart = windupDur;
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: "power2.in",
            onUpdate: () => {
                const t = travelProxy.p;
                const easeT = t * t;
                const horiz = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                flakeWrap.x = fromX + (cx - fromX) * horiz + Math.sin(t * Math.PI * 2) * unit * (cinematic ? 0.22 : 0.12);
                flakeWrap.y = (skyY - unit * 0.6) + (cy - (skyY - unit * 0.6)) * easeT;
                flakeWrap.rotation = t * Math.PI * (cinematic ? 4 : 2.4);
                flakeWrap.scale.set(0.7 + t * 0.5);
                groundShadow.alpha = Math.min(0.55, t * 0.7);
                groundShadow.scale.set(0.25 + t * 1.3, 0.25 + t * 1.0);
                targetGlow.alpha = 0.4 + t * 0.45;
                targetGlow.scale.set(0.85 + t * 0.7);
                if (t > 0.05 && Math.random() < (cinematic ? 0.7 : 0.4)) spawnTrail(flakeWrap.x, flakeWrap.y);
            },
        }, travelStart);

        const impactAt = travelStart + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            mistSparks.forEach((sp) => { sp.alpha = 0; });
            mistProxy.t = 1;
        }, "impact");
        tl.add(() => {
            flakeWrap.visible = false;
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
            spawnToonPopStars(container, PIXI, gsap, cx, cy, 0xeaffff, 0x2a7da8, unit, cinematic ? 9 : 5);
            particles.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / particles.length + (Math.random() - 0.5) * 0.5;
                const spd = (cinematic ? 4 : 2.4) + Math.random() * (cinematic ? 7 : 4);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - (cinematic ? 3 : 1.6);
                p.vr = (Math.random() - 0.5) * 0.4;
                p.g.visible = true;
                p.g.x = cx;
                p.g.y = cy;
                p.g.alpha = 1;
            });
        }, "impact");

        tl.to(flashCore, { alpha: 1, duration: 0.04 }, "impact");
        tl.to(flashCore.scale, {
            x: cinematic ? 7 : 4, y: cinematic ? 7 : 4,
            duration: impactDur * 0.26, ease: "power2.out",
        }, "impact");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.34 }, `impact+=${impactDur * 0.1}`);

        tl.to(crystalData.root, { alpha: 1, duration: 0.08 }, "impact");
        tl.to(crystalData.root.scale, {
            x: 1.12, y: 1.12, duration: impactDur * 0.34, ease: "back.out(2.4)",
        }, "impact");
        tl.to(crystalData.root.scale, {
            x: 1, y: 1, duration: impactDur * 0.2, ease: "power2.inOut",
        }, `impact+=${impactDur * 0.34}`);
        tl.to(crystalData.shine, {
            alpha: 0.3, duration: impactDur * 0.5, yoyo: true, repeat: 1, ease: "sine.inOut",
        }, `impact+=${impactDur * 0.5}`);

        [frostRing, frostRing2].forEach((ring, i) => {
            const off = i * 0.05;
            const peak = cinematic ? (3.6 - i * 0.9) : (2.4 - i * 0.6);
            tl.to(ring, { alpha: 0.9 - i * 0.2, duration: 0.06 }, `impact+=${off}`);
            tl.to(ring.scale, { x: peak, y: peak, duration: impactDur * 0.6, ease: "power2.out" }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: impactDur * 0.36 }, `impact+=${0.14 + off}`);
        });

        tl.to(shakeWrap.scale, {
            x: cinematic ? 1.04 : 1.02, y: cinematic ? 1.04 : 1.02,
            duration: 0.05, ease: "power2.out",
        }, "impact");
        tl.to(shakeWrap.scale, { x: 1, y: 1, duration: 0.34, ease: "power2.out" }, `impact+=0.05`);
        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.5 : 0.28,
            ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeProxy.t) * (cinematic ? 18 : 8);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "impact");

        const partProxy = { t: 0 };
        const freezeDoneAt = impactDur * 0.56;
        tl.to(partProxy, {
            t: 1,
            duration: Math.min(lingerDur + impactDur * 0.2, impactDur * 0.35),
            ease: "none",
            onUpdate: () => {
                particles.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.13;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.2);
                });
            },
        }, "impact");

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        }, `impact+=${freezeDoneAt}`);

        const maxSec = travelStart + travelDur + freezeDoneAt + 0.35;
        await awaitPixiTimeline(tl, shakeWrap, maxSec);
        sweepOrphanScenes();
        return true;
        } finally {
            try { orphanTweens.forEach((tw) => tw?.kill?.()); } catch (e) { /* */ }
            try { gsap?.killTweensOf?.(mistSparks); } catch (e) { /* */ }
            try { gsap?.killTweensOf?.(particles.map((p) => p.g)); } catch (e) { /* */ }
            try { shakeWrap?.destroy?.({ children: true }); } catch (e) { /* */ }
            frame.end();
        }
    }

    /** Partícula de poeira no impacto da invocação. */
    function makeSummonDust(PIXI, unit) {
        const g = new PIXI.Graphics();
        const r = unit * (0.018 + Math.random() * 0.04);
        const col = Math.random() > 0.5 ? 0xd4a85a : 0x8a6a3a;
        g.beginFill(col, 0.75);
        g.drawCircle(0, 0, r);
        g.endFill();
        return g;
    }

    /**
     * Invocação — carta solta da mão, arco alto e queda com peso no slot.
     * Camada Pixi acima do campo: não encosta visualmente nos outros campeões.
     */
    async function playSummonDropScene(opts = {}) {
        if (!global.DfVfxEngine?.wantsGpuPresentation?.() && !canUse()) return false;
        setQuality("full");
        global.DfGsapBridge?.setQuality?.("full");

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const srcCX0 = opts.srcCX;
        const srcCY0 = opts.srcCY;
        const destCX0 = opts.destCX;
        const destCY0 = opts.destCY;
        if (srcCX0 == null || srcCY0 == null || destCX0 == null || destCY0 == null) return false;

        /* Fullscreen: a mão do jogador fica na borda inferior do canvas
           1280×720; com clip de combate a carta Pixi saía CORTADA. A IA
           nasce no topo (ainda dentro do clip) — por isso só o humano
           via o regressão. Viewport inteiro = carta completa mão→campo. */
        beginPixiTargetScene(a, true);
        const srcPt = mapScenePoint(srcCX0, srcCY0);
        const destPt = mapScenePoint(destCX0, destCY0);
        const srcCX = srcPt.x;
        const srcCY = srcPt.y;
        const destCX = destPt.x;
        const destCY = destPt.y;

        try {
        // Esconde DOM o quanto antes (antes de warm/bake async).
        if (typeof opts.onFlyReady === "function") {
            try { opts.onFlyReady(); } catch (eReady) { /* */ }
        }
        const cinematic = opts.cinematic !== false;
        const cardAspect = 5 / 7;
        let cardW = Math.max(40, Math.round(Number(opts.cardW) || Number(opts.srcW) || 72));
        let cardH = Math.max(56, Math.round(Number(opts.cardH) || Number(opts.srcH) || Math.round(cardW / cardAspect)));
        /* Tamanhos já vêm em px de viewport (GBR / flySize). Em fullscreen
           NÃO converter via viewportRectToCanvas — isso era do modo clip. */
        const ratio = cardW / cardH;
        if (ratio > cardAspect * 1.05) cardH = Math.round(cardW / cardAspect);
        else if (ratio < cardAspect * 0.95) cardW = Math.round(cardH * cardAspect);
        const unit = Math.max(52, Math.min(cardW, cardH) * 0.95);
        const releaseMs = opts.releaseMs ?? (cinematic ? 160 : 100);
        const flightMs = opts.flightMs ?? (cinematic ? 780 : 480);
        const impactMs = opts.impactMs ?? (cinematic ? 380 : 240);
        const lingerMs = opts.lingerMs ?? (cinematic ? 140 : 90);

        // Poder mostrado na face assada: sempre o ATUAL (buff/debuff incluído).
        const summonPow = opts.currentPower ?? opts.power ?? opts.basePower;
        const faceBake = (opts.cardName && global.DfCardFace?.isComposed?.(opts.cardName))
            ? global.DfCardFace.getFaceBakeSource?.(opts.cardName, summonPow)
            : null;
        let artUrl = (() => {
            if (faceBake) return null; // textura direta via bake
            if (opts.cardName && global.DfCardFace?.isComposed?.(opts.cardName)) {
                return global.DfCardFace.getFaceDataUrl?.(opts.cardName, summonPow)
                    || (opts.artSrc && String(opts.artSrc).indexOf("data:image") === 0 ? opts.artSrc : null);
            }
            return opts.artSrc || (opts.cardName && global.dfPrimaryCardArtSrc?.(opts.cardName));
        })();
        // Evitar double-warm: se bake/artSrc/cache já existe, não bake de novo.
        const hasReadyArt = !!(faceBake || (artUrl && String(artUrl).length > 8));
        if (!hasReadyArt && opts.cardName && global.DfCardFace?.isComposed?.(opts.cardName)) {
            const warmMs = global.DfLazyLoad?.isSlowNetwork?.() ? 1800 : 700;
            try {
                const warmP = global.DfCardFace.warmFace?.(
                    { name: opts.cardName, currentPower: summonPow, power: opts.basePower ?? summonPow },
                    { power: summonPow },
                );
                if (warmP && typeof warmP.then === "function") {
                    artUrl = await Promise.race([
                        warmP.then((u) => u || artUrl || ""),
                        new Promise((r) => setTimeout(() => r(artUrl || ""), warmMs)),
                    ]);
                }
            } catch (e) { /* */ }
        } else if (!hasReadyArt && artUrl && global.dfPrefetchArtUrl) {
            void global.dfPrefetchArtUrl(artUrl, "high").catch(() => {});
        } else if (!hasReadyArt && opts.cardName && global.dfAwaitCardArtReady) {
            await Promise.race([
                global.dfAwaitCardArtReady(opts.cardName).catch(() => {}),
                new Promise((r) => setTimeout(r, 600)),
            ]);
        }
        const bakeAfter = faceBake
            || (opts.cardName && global.DfCardFace?.getFaceBakeSource?.(opts.cardName, summonPow));
        if (!bakeAfter && artUrl && String(artUrl).indexOf("data:") !== 0) {
            await loadTexture(artUrl).catch(() => {});
        }

        const snap = {
            cardName: opts.cardName,
            artSrc: (opts.cardName && global.DfCardFace?.isComposed?.(opts.cardName))
                ? (global.DfCardFace.getFaceDataUrl?.(opts.cardName, summonPow) || artUrl || opts.artSrc || null)
                : (artUrl || opts.artSrc),
            _faceBake: bakeAfter || null,
            width: cardW,
            height: cardH,
            currentPower: opts.currentPower,
            basePower: opts.basePower,
            power: opts.power,
        };

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        const cardWrap = new PIXI.Container();
        cardWrap.x = srcCX;
        cardWrap.y = srcCY;
        root.addChild(cardWrap);

        const cardVisual = await Promise.race([
            buildSummonFlySprite(PIXI, a.renderer, snap, cardW, cardH),
            new Promise((r) => setTimeout(() => r(null), 1800)),
        ]);
        if (!cardVisual) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }
        cardWrap.addChild(cardVisual);
        cardWrap.rotation = 0;
        cardWrap.scale.set(1, 1);
        cardWrap.visible = true;
        cardWrap.alpha = 1;
        // onFlyReady já disparado no início da cena (antes do bake).

        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.35);
        shadow.drawEllipse(0, unit * 0.42, unit * 0.38, unit * 0.1);
        shadow.endFill();
        shadow.alpha = 0;
        cardWrap.addChild(shadow);

        const trailRoot = new PIXI.Container();
        root.addChild(trailRoot);

        const impactRoot = new PIXI.Container();
        impactRoot.x = destCX;
        impactRoot.y = destCY;
        impactRoot.visible = false;
        root.addChild(impactRoot);

        const theme = { hue: 42, core: 0xffc84a, ring: 0xffe08a, spark: 0xffaa44, flash: 0xfff4d0 };
        const shockBloom = makeSoftBloom(PIXI, theme, unit, 0.65);
        shockBloom.alpha = 0;
        impactRoot.addChild(shockBloom);

        const flashCore = new PIXI.Graphics();
        flashCore.beginFill(0xffffff, 0.85);
        flashCore.drawCircle(0, 0, unit * 0.22);
        flashCore.endFill();
        flashCore.alpha = 0;
        flashCore.scale.set(0.05);
        if (PIXI.BLEND_MODES) flashCore.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flashCore);

        const dustN = n(cinematic ? 18 : 10);
        const dustParts = [];
        for (let i = 0; i < dustN; i++) {
            const d = makeSummonDust(PIXI, unit);
            d.visible = false;
            impactRoot.addChild(d);
            dustParts.push({ g: d, vx: 0, vy: 0 });
        }

        const lift = Math.max(unit * 0.55, Math.min(unit * 1.35, Math.abs(destCY - srcCY) * 0.28 + unit * 0.45));
        const apexX = srcCX + (destCX - srcCX) * 0.5;
        const apexY = Math.min(srcCY, destCY) - lift;
        const startScale = 1;
        const releaseLiftY = srcCY - unit * 0.08;

        const releaseDur = releaseMs / 1000;
        const flightDur = flightMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;
        const flightProxy = { p: 0 };
        const shakeProxy = { t: 0 };

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        cardWrap.scale.set(startScale);

        tl.to(cardWrap, {
            y: releaseLiftY,
            duration: releaseDur * 0.5,
            ease: "power2.out",
        }, 0);
        tl.to(cardWrap, {
            x: srcCX + (destCX - srcCX) * 0.04,
            duration: releaseDur * 0.55,
            ease: "sine.out",
        }, 0);

        const flightStart = releaseDur * 0.72;
        tl.to(flightProxy, {
            p: 1,
            duration: flightDur,
            // Easing aplicado UMA vez: a curva do tween somada ao smoothstep
            // abaixo dava um "power6" na prática (arranca e freia demais, com
            // meio muito rápido) — era a rigidez percebida na invocação.
            ease: "none",
            onUpdate: () => {
                const t = flightProxy.p;
                const easeT = t * t * (3 - 2 * t);
                const u = 1 - easeT;
                cardWrap.x = u * u * srcCX + 2 * u * easeT * apexX + easeT * easeT * destCX;
                cardWrap.y = u * u * releaseLiftY + 2 * u * easeT * apexY + easeT * easeT * destCY;
                cardWrap.rotation = 0;
                cardWrap.scale.set(1);
                shadow.alpha = Math.min(0.48, easeT * 0.62);
                shadow.scale.set(0.55 + easeT * 0.95, 0.55 + easeT * 0.62);
            },
        }, flightStart);

        const landAt = flightStart + flightDur;
        tl.addLabel("land", landAt);
        tl.add(() => {
            // Revela o DOM ANTES de esconder o Pixi — senão a carta some ~0,5s no pouso.
            if (typeof opts.onImpact === "function") {
                try { opts.onImpact(); } catch (eImpact) { /* */ }
            }
            cardWrap.visible = false;
            impactRoot.visible = true;
        }, "land");

        // Impulse determinístico (sem Math.random) — mesmo polish do combate.
        tl.to(shakeProxy, {
            t: 1,
            duration: cinematic ? 0.2 : 0.14,
            ease: "power2.out",
            onUpdate: () => {
                const damp = (1 - shakeProxy.t) * (1 - shakeProxy.t);
                const amp = (cinematic ? 8 : 5) * damp;
                shakeWrap.x = Math.sin(shakeProxy.t * Math.PI * 3.2) * amp;
                shakeWrap.y = Math.sin(shakeProxy.t * Math.PI * 2.4 + 0.7) * amp * 0.55;
            },
        }, "land");
        tl.to(shakeWrap, { x: 0, y: 0, duration: 0.1, ease: "power3.out" }, "land+=0.12");

        tl.to(shockBloom, { alpha: 0.72, duration: 0.06 }, "land");
        tl.to(shockBloom.scale, {
            x: cinematic ? 2.4 : 1.6, y: cinematic ? 2.1 : 1.4,
            duration: impactDur * 0.42, ease: "power2.out",
        }, "land");
        tl.to(shockBloom, { alpha: 0, duration: impactDur * 0.38 }, `land+=${impactDur * 0.18}`);

        tl.to(flashCore, { alpha: 0.9, duration: 0.04 }, "land");
        tl.to(flashCore.scale, {
            x: cinematic ? 3.8 : 2.4, y: cinematic ? 3.2 : 2.1,
            duration: impactDur * 0.28, ease: "power2.out",
        }, "land");
        tl.to(flashCore, { alpha: 0, duration: impactDur * 0.32 }, `land+=${impactDur * 0.1}`);

        tl.add(() => {
            dustParts.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / dustParts.length + (Math.random() - 0.5) * 0.5;
                const spd = (cinematic ? 2.8 : 1.8) + Math.random() * (cinematic ? 4 : 2.5);
                p.vx = Math.cos(ang) * spd;
                p.vy = -Math.abs(Math.sin(ang)) * spd * 0.55 - (cinematic ? 2.2 : 1.2);
                p.g.visible = true;
                p.g.x = (Math.random() - 0.5) * unit * 0.35;
                p.g.y = unit * 0.12;
                p.g.alpha = 1;
            });
        }, "land");

        const dustProxy = { t: 0 };
        tl.to(dustProxy, {
            t: 1,
            duration: impactDur * 0.65 + lingerDur,
            ease: "none",
            onUpdate: () => {
                dustParts.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.08;
                    p.vx *= 0.96;
                    p.g.alpha = Math.max(0, 1 - dustProxy.t * 1.1);
                });
            },
        }, "land");

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        const totalSec = (releaseMs + flightMs + impactMs + lingerMs) / 1000 + 1.2;
        const ok = await combatPhaseTimeout(gsapBridge.timelineToPromise(tl), totalSec);
        if (!ok && typeof opts.onImpact === "function") {
            try { opts.onImpact(); } catch (e) { /* */ }
        }
        return ok;
        } finally {
            endPixiTargetScene(a);
        }
    }

    /** Prisma de gelo cinematográfico (só fills suaves — sem contorno cartoon). */
    function makeCinematicIcePrism(PIXI, w, h) {
        const root = new PIXI.Container();
        const halo = makeSoftBloom(PIXI, { core: 0xc8f0ff, spark: 0x88d8ff, flash: 0xffffff, ring: 0x4aa8d8 }, Math.max(w, h) * 0.01, 1.35);
        root.addChild(halo);
        const shell = new PIXI.Graphics();
        const hw = w * 0.55; const hh = h * 0.62;
        shell.beginFill(0x9fe9ff, 0.42);
        shell.drawPolygon([0, -hh, hw * 0.88, -hh * 0.35, hw, hh * 0.2, 0, hh, -hw, hh * 0.2, -hw * 0.88, -hh * 0.35]);
        shell.endFill();
        shell.beginFill(0xe8fbff, 0.55);
        shell.drawPolygon([0, -hh * 0.92, hw * 0.42, -hh * 0.42, 0, hh * 0.08, -hw * 0.42, -hh * 0.42]);
        shell.endFill();
        shell.beginFill(0xffffff, 0.38);
        shell.drawPolygon([-hw * 0.22, -hh * 0.55, -hw * 0.06, -hh * 0.55, -hw * 0.28, hh * 0.12, -hw * 0.42, hh * 0.12]);
        shell.endFill();
        if (PIXI.BLEND_MODES) shell.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(shell);
        return { root, halo, shell };
    }

    /* ============================================================
     * ZERO ABSOLUTO (talento) — frio absoluto no alvo.
     * Pilar de gelo, prisma encapsulando, estilhaço se já congelado.
     * ============================================================ */
    async function playZeroAbsolutoScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x; let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const wasFrozen = !!opts.wasFrozen;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const cardW = opts.w ?? unit * 2.4;
        const cardH = opts.h ?? unit * 3.2;
        const iceTheme = themeFromRecipe({ hue: 200 });

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);
        try {
            const scene = scenePixels();
            const coldWash = new PIXI.Graphics();
            coldWash.beginFill(0x0a2840, 0.45);
            coldWash.drawRect(0, 0, scene.w, scene.h);
            coldWash.endFill();
            coldWash.alpha = 0;
            root.addChild(coldWash);

            const pillar = new PIXI.Graphics();
            pillar.beginFill(0xb8ecff, 0.35);
            pillar.drawRect(-unit * 0.22, -scene.h * 0.55, unit * 0.44, scene.h * 0.55);
            pillar.endFill();
            pillar.beginFill(0xffffff, 0.5);
            pillar.drawRect(-unit * 0.08, -scene.h * 0.55, unit * 0.16, scene.h * 0.55);
            pillar.endFill();
            if (PIXI.BLEND_MODES) pillar.blendMode = PIXI.BLEND_MODES.ADD;
            pillar.x = cx; pillar.y = cy; pillar.alpha = 0; pillar.scale.y = 0.05;
            root.addChild(pillar);

            const frostRings = [];
            for (let ri = 0; ri < 4; ri++) {
                const ring = new PIXI.Graphics();
                ring.beginFill(ri % 2 ? 0x88d8ff : 0xc8f4ff, 0.32 - ri * 0.05);
                ring.drawEllipse(0, 0, unit * (0.7 + ri * 0.18), unit * (0.55 + ri * 0.14));
                ring.endFill();
                if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
                ring.x = cx; ring.y = cy; ring.alpha = 0; ring.scale.set(0.2);
                root.addChild(ring);
                frostRings.push(ring);
            }

            const targetBloom = makeSoftBloom(PIXI, iceTheme, unit, cinematic ? 1.6 : 1.1);
            targetBloom.x = cx; targetBloom.y = cy; targetBloom.alpha = 0;
            root.addChild(targetBloom);

            const prism = makeCinematicIcePrism(PIXI, cardW, cardH);
            prism.root.x = cx; prism.root.y = cy;
            prism.root.alpha = 0; prism.root.scale.set(0.15);
            root.addChild(prism.root);

            const orbitFlakes = [];
            const flakeN = n(cinematic ? 16 : 10);
            for (let i = 0; i < flakeN; i++) {
                const sp = makeSoftOrb(PIXI, i % 3 === 0 ? 0xffffff : 0xa8e8ff, unit * (0.04 + Math.random() * 0.07), 0.85);
                sp.x = cx; sp.y = cy; sp.alpha = 0;
                root.addChild(sp);
                orbitFlakes.push({ g: sp, ang: Math.random() * Math.PI * 2, rad: unit * (0.8 + Math.random() * 2.2), spd: 0.8 + Math.random() * 1.4 });
            }

            const shards = [];
            const shardN = n(cinematic ? 18 : 12);
            for (let i = 0; i < shardN; i++) {
                const sh = makeSoftOrb(PIXI, 0xd8f8ff, unit * (0.05 + Math.random() * 0.1), 0.9);
                sh.visible = false; root.addChild(sh);
                shards.push({ g: sh, vx: 0, vy: 0, vr: 0 });
            }

            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            tl.to(coldWash, { alpha: 0.75, duration: 0.22, ease: "sine.out" }, 0);
            tl.to(pillar, { alpha: 0.9, duration: 0.08 }, 0.12);
            tl.to(pillar.scale, { y: 1, duration: 0.38, ease: "power3.in" }, 0.12);
            tl.to(pillar, { alpha: 0, duration: 0.35, ease: "power2.out" }, 0.42);

            frostRings.forEach((ring, ri) => {
                const at = 0.28 + ri * 0.06;
                tl.to(ring, { alpha: 0.85, duration: 0.08 }, at);
                tl.to(ring.scale, { x: 3.2 + ri * 0.4, y: 2.6 + ri * 0.35, duration: 0.55, ease: "power2.out" }, at);
                tl.to(ring, { alpha: 0, duration: 0.35, ease: "power2.out" }, at + 0.28);
            });

            tl.to(targetBloom, { alpha: 0.95, duration: 0.1 }, 0.35);
            tl.to(targetBloom.scale, { x: 1.7, y: 1.7, duration: 0.45, ease: "power2.out" }, 0.35);

            const encaseAt = 0.42;
            tl.addLabel("encase", encaseAt);
            tl.to(prism.root, { alpha: 1, duration: 0.12 }, "encase");
            tl.to(prism.root.scale, { x: 1, y: 1, duration: 0.48, ease: "back.out(1.6)" }, "encase");

            const orbitProxy = { t: 0 };
            tl.to(orbitProxy, {
                t: 1, duration: 0.7, ease: "sine.out",
                onUpdate: () => {
                    orbitFlakes.forEach((o) => {
                        o.ang += 0.08 * o.spd;
                        const pull = 1 - orbitProxy.t * 0.65;
                        o.g.x = cx + Math.cos(o.ang) * o.rad * pull;
                        o.g.y = cy + Math.sin(o.ang) * o.rad * pull * 0.85;
                        o.g.alpha = Math.min(1, orbitProxy.t * 1.4) * (1 - orbitProxy.t * 0.35);
                    });
                },
            }, 0.2);

            if (wasFrozen) {
                const shatterAt = encaseAt + 0.55;
                tl.addLabel("shatter", shatterAt);
                tl.to(prism.root.scale, { x: 1.35, y: 1.35, duration: 0.12, ease: "power2.in" }, "shatter");
                tl.to(prism.root, { alpha: 0, duration: 0.08 }, "shatter+=0.1");
                tl.to(targetBloom, { alpha: 1, duration: 0.06 }, "shatter");
                tl.to(targetBloom.scale, { x: 2.4, y: 2.4, duration: 0.28, ease: "power2.out" }, "shatter");
                tl.add(() => {
                    shards.forEach((p) => {
                        const ang = Math.random() * Math.PI * 2;
                        const spd = 5 + Math.random() * (cinematic ? 14 : 8);
                        p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd - 4;
                        p.vr = (Math.random() - 0.5) * 0.5;
                        p.g.visible = true; p.g.x = cx; p.g.y = cy; p.g.alpha = 1;
                    });
                }, "shatter");
                const shardProxy = { t: 0 };
                tl.to(shardProxy, {
                    t: 1, duration: 0.75, ease: "power2.out",
                    onUpdate: () => {
                        shards.forEach((p) => {
                            p.g.x += p.vx; p.g.y += p.vy; p.vy += 0.28;
                            p.g.rotation += p.vr;
                            p.g.alpha = Math.max(0, 1 - shardProxy.t * 1.2);
                        });
                    },
                }, "shatter");
                tl.to(shakeWrap, {
                    x: unit * 0.14, duration: 0.03, yoyo: true, repeat: 7, ease: "power1.inOut",
                }, "shatter");
            } else {
                tl.to(prism.root, { alpha: 0.88, duration: 0.35, ease: "sine.inOut" }, encaseAt + 0.55);
                tl.to(targetBloom, { alpha: 0.35, duration: 0.5, ease: "power2.out" }, encaseAt + 0.65);
            }

            const fadeStart = wasFrozen ? encaseAt + 1.35 : encaseAt + 1.1;
            tl.to(coldWash, { alpha: 0, duration: 0.45, ease: "power2.out" }, fadeStart);
            tl.to(targetBloom, { alpha: 0, duration: 0.4, ease: "power2.out" }, fadeStart);
            if (!wasFrozen) tl.to(prism.root, { alpha: 0, duration: 0.4, ease: "power2.out" }, fadeStart);

            await awaitPixiTimeline(tl, shakeWrap, wasFrozen ? 2.4 : 2.0);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /**
     * Congelado 2× — prisma de gelo estoura com estilhaços e o campeão some.
     * Usado quando Rajada/efeito destrói um alvo já congelado.
     */
    async function playIceShatterDestroyScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const ICE = 0xa8e8ff;
        const CORE = 0xeef9ff;
        const DEEP = 0x2a78c8;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) {
                try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
                frame.end();
                return false;
            }
            const scene = scenePixels();
            const wash = new PIXI.Graphics();
            wash.beginFill(0x0a2038, 0.42);
            wash.drawRect(0, 0, scene.w, scene.h);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);

            const bloom = makeSoftBloom(PIXI, { core: CORE, spark: ICE, flash: 0xffffff, ring: DEEP }, unit, 1.35);
            bloom.x = cx; bloom.y = cy; bloom.alpha = 0;
            root.addChild(bloom);

            const prism = new PIXI.Graphics();
            prism.beginFill(ICE, 0.92);
            const pw = Math.max(unit * 0.55, (opts.w || unit) * 0.55);
            const ph = Math.max(unit * 0.75, (opts.h || unit * 1.3) * 0.55);
            prism.drawPolygon([
                -pw * 0.15, -ph * 0.55,
                pw * 0.35, -ph * 0.45,
                pw * 0.55, ph * 0.1,
                pw * 0.2, ph * 0.55,
                -pw * 0.35, ph * 0.5,
                -pw * 0.55, 0,
            ]);
            prism.endFill();
            prism.lineStyle(Math.max(2, unit * 0.04), CORE, 0.95);
            prism.drawPolygon([
                -pw * 0.15, -ph * 0.55,
                pw * 0.35, -ph * 0.45,
                pw * 0.55, ph * 0.1,
                pw * 0.2, ph * 0.55,
                -pw * 0.35, ph * 0.5,
                -pw * 0.55, 0,
            ]);
            prism.x = cx; prism.y = cy;
            prism.alpha = 0;
            prism.scale.set(0.2);
            prism.rotation = -0.18;
            root.addChild(prism);

            const shards = [];
            const shardN = n(cinematic ? 28 : 16);
            for (let i = 0; i < shardN; i++) {
                const g = new PIXI.Graphics();
                const col = i % 3 === 0 ? CORE : (i % 3 === 1 ? ICE : DEEP);
                g.beginFill(col, 0.95);
                const sw = unit * (0.04 + Math.random() * 0.1);
                const sh = unit * (0.08 + Math.random() * 0.16);
                g.drawPolygon([-sw / 2, 0, sw / 2, 0, 0, -sh]);
                g.endFill();
                g.x = cx; g.y = cy; g.alpha = 0; g.visible = false;
                root.addChild(g);
                shards.push({ g, vx: 0, vy: 0, vr: 0 });
            }

            const flakes = [];
            for (let i = 0; i < n(cinematic ? 18 : 10); i++) {
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, i % 2 ? CORE : ICE), true);
                sp.x = cx; sp.y = cy; sp.alpha = 0;
                sp.scale.set(0.12 + Math.random() * 0.28);
                root.addChild(sp);
                flakes.push(sp);
            }

            tl.to(wash, { alpha: 1, duration: 0.12 }, 0);
            tl.to(bloom, { alpha: 1, duration: 0.14 }, 0.05);
            tl.to(bloom.scale, { x: 1.8, y: 1.8, duration: 0.35, ease: "power2.out" }, 0.05);
            tl.to(prism, { alpha: 1, duration: 0.12 }, 0.08);
            tl.to(prism.scale, { x: 1.15, y: 1.15, duration: 0.38, ease: "back.out(1.8)" }, 0.08);
            tl.to(prism, { rotation: 0.08, duration: 0.38, ease: "sine.out" }, 0.08);

            const shatterAt = 0.52;
            tl.addLabel("shatter", shatterAt);
            tl.to(prism.scale, { x: 1.55, y: 1.55, duration: 0.1, ease: "power2.in" }, "shatter");
            tl.to(prism, { alpha: 0, duration: 0.08 }, "shatter+=0.08");
            tl.to(bloom, { alpha: 1, duration: 0.06 }, "shatter");
            tl.to(bloom.scale, { x: 2.8, y: 2.8, duration: 0.4, ease: "power2.out" }, "shatter");
            tl.add(() => {
                shards.forEach((p) => {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 7 + Math.random() * (cinematic ? 16 : 9);
                    p.vx = Math.cos(ang) * spd;
                    p.vy = Math.sin(ang) * spd - 5;
                    p.vr = (Math.random() - 0.5) * 0.55;
                    p.g.visible = true;
                    p.g.x = cx;
                    p.g.y = cy;
                    p.g.alpha = 1;
                });
                flakes.forEach((sp) => {
                    sp.alpha = 1;
                });
            }, "shatter");
            const proxy = { t: 0 };
            tl.to(proxy, {
                t: 1, duration: 0.95, ease: "power2.out",
                onUpdate: () => {
                    shards.forEach((p) => {
                        p.g.x += p.vx;
                        p.g.y += p.vy;
                        p.vy += 0.32;
                        p.g.rotation += p.vr;
                        p.g.alpha = Math.max(0, 1 - proxy.t * 1.15);
                    });
                    flakes.forEach((sp, i) => {
                        const ang = (i / flakes.length) * Math.PI * 2;
                        const dist = unit * (0.9 + proxy.t * 2.4);
                        sp.x = cx + Math.cos(ang) * dist;
                        sp.y = cy + Math.sin(ang) * dist * 0.75 - unit * proxy.t * 0.4;
                        sp.alpha = Math.max(0, 1 - proxy.t * 1.1);
                    });
                },
            }, "shatter");
            tl.to(shakeWrap, {
                x: unit * 0.16, duration: 0.03, yoyo: true, repeat: 10, ease: "power1.inOut",
            }, "shatter");
            tl.to(wash, { alpha: 0, duration: 0.45, ease: "power2.out" }, "shatter+=0.55");
            tl.to(bloom, { alpha: 0, duration: 0.4, ease: "power2.out" }, "shatter+=0.5");
            if (typeof opts.onImpact === "function") {
                tl.add(() => { try { opts.onImpact(); } catch (e) { /* */ } }, "shatter+=0.12");
            }

            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 2.1 : 1.55, { minSec: cinematic ? 1.35 : 1.0 });
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /** Coroa dourada volumétrica — LEGADO. */
    function makeLegadoCrown(PIXI, unit) {
        const c = new PIXI.Container();
        const glow = makeSoftBloom(PIXI, { core: 0xffe080, spark: 0xffc040, flash: 0xffffff, ring: 0xc89020 }, unit, 1.1);
        c.addChild(glow);
        const band = new PIXI.Graphics();
        band.beginFill(0xc8a030, 1);
        band.drawRoundedRect(-unit * 0.55, unit * 0.05, unit * 1.1, unit * 0.22, unit * 0.06);
        band.endFill();
        c.addChild(band);
        const spikes = new PIXI.Graphics();
        spikes.beginFill(0xffd050, 1);
        [-0.48, -0.24, 0, 0.24, 0.48].forEach((sx) => {
            spikes.drawPolygon([sx * unit, unit * 0.05, sx * unit + unit * 0.1, -unit * 0.42, sx * unit - unit * 0.1, unit * 0.05]);
        });
        spikes.endFill();
        spikes.beginFill(0xffe8a0, 0.85);
        spikes.drawCircle(0, -unit * 0.18, unit * 0.1);
        spikes.endFill();
        c.addChild(spikes);
        return c;
    }

    /** LEGADO — coroa desce, martelo real desce e fortalece o aliado. */
    async function playLegadoHammerScene(opts = {}) {
        const cinematic = opts.cinematic !== false && (
            global.DfVfxEngine?.wantsGpuPresentation?.()
            || global.DfVfxEngine?.wantsCinematic?.()
        );
        if (!cinematic && !canUse()) return false;
        const toX = opts.toX;
        const toY = opts.toY;
        if (toX == null || toY == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m = frame.map(toX, toY);
        const toX2 = m.x; const toY2 = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const goldTheme = themeFromRecipe({ hue: 42 });

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        const scene = scenePixels();
        const ray = new PIXI.Graphics();
        ray.beginFill(0xffe8a0, 0.22);
        ray.moveTo(toX2 - unit * 0.35, 0);
        ray.lineTo(toX2 + unit * 0.35, 0);
        ray.lineTo(toX2 + unit * 0.9, toY2 - unit * 0.2);
        ray.lineTo(toX2 - unit * 0.9, toY2 - unit * 0.2);
        ray.closePath();
        ray.endFill();
        if (PIXI.BLEND_MODES) ray.blendMode = PIXI.BLEND_MODES.ADD;
        ray.alpha = 0;
        root.addChild(ray);

        const title = new PIXI.Text("LEGADO", {
            fontFamily: "Cinzel, Georgia, serif",
            fontSize: Math.max(26, unit * 0.48),
            fontWeight: "900",
            fill: 0xffe8a0,
            stroke: 0x6a4808,
            strokeThickness: Math.max(3, unit * 0.04),
            letterSpacing: unit * 0.08,
            dropShadow: true,
            dropShadowColor: 0xffa020,
            dropShadowBlur: unit * 0.2,
            dropShadowDistance: 0,
        });
        title.anchor.set(0.5);
        title.x = scene.w / 2;
        title.y = scene.h * 0.13;
        title.alpha = 0;
        title.scale.set(0.5);
        root.addChild(title);

        const crown = makeLegadoCrown(PIXI, unit);
        crown.x = toX2;
        crown.y = toY2 - unit * 3.6;
        crown.alpha = 0;
        crown.scale.set(0.4);
        root.addChild(crown);

        const groundGlow = makeSoftBloom(PIXI, goldTheme, unit, 1.35);
        groundGlow.x = toX2;
        groundGlow.y = toY2;
        groundGlow.alpha = 0;
        root.addChild(groundGlow);

        const hammer = new PIXI.Container();
        const head = new PIXI.Graphics();
        head.beginFill(0x8a6a3a);
        head.drawRoundedRect(-unit * 0.62, -unit * 0.28, unit * 1.24, unit * 0.56, unit * 0.08);
        head.endFill();
        head.beginFill(0xffd050, 0.9);
        head.drawRoundedRect(-unit * 0.68, -unit * 0.34, unit * 1.36, unit * 0.14, unit * 0.04);
        head.endFill();
        head.beginFill(0xc8a040, 0.85);
        head.drawRect(-unit * 0.14, unit * 0.26, unit * 0.28, unit * 1.05);
        head.endFill();
        hammer.addChild(head);
        const hammerBloom = makeSoftBloom(PIXI, goldTheme, unit, 0.75);
        hammer.addChild(hammerBloom);
        hammer.pivot.set(0, unit * 0.55);
        hammer.x = toX2;
        hammer.y = toY2 - unit * 3.2;
        hammer.rotation = -0.42;
        hammer.alpha = 0;
        root.addChild(hammer);

        const shockRings = [];
        for (let ri = 0; ri < 3; ri++) {
            const ring = new PIXI.Graphics();
            ring.beginFill(ri % 2 ? 0xffc040 : 0xffe080, 0.38 - ri * 0.08);
            ring.drawEllipse(0, 0, unit * (0.8 + ri * 0.2), unit * (0.55 + ri * 0.15));
            ring.endFill();
            if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
            ring.x = toX2; ring.y = toY2; ring.alpha = 0; ring.scale.set(0.2);
            root.addChild(ring);
            shockRings.push(ring);
        }

        const plusOne = new PIXI.Text("+1", {
            fontFamily: "Cinzel, Georgia, serif",
            fontSize: Math.max(32, unit * 0.72),
            fontWeight: "900",
            fill: 0xffffff,
            stroke: 0xffa020,
            strokeThickness: Math.max(4, unit * 0.05),
            dropShadow: true,
            dropShadowColor: 0xffd050,
            dropShadowBlur: unit * 0.25,
            dropShadowDistance: 0,
        });
        plusOne.anchor.set(0.5);
        plusOne.x = toX2;
        plusOne.y = toY2 - unit * 0.5;
        plusOne.alpha = 0;
        plusOne.scale.set(0.3);
        root.addChild(plusOne);

        const sparks = [];
        const sparkN = n(cinematic ? 24 : 14);
        for (let i = 0; i < sparkN; i++) {
            const sp = makeSoftOrb(PIXI, i % 2 ? 0xffe080 : 0xffa030, unit * (0.06 + Math.random() * 0.1), 0.88);
            sp.x = toX2; sp.y = toY2; sp.alpha = 0;
            root.addChild(sp);
            sparks.push({ g: sp, ang: (i / sparkN) * Math.PI * 2 + Math.random() * 0.4, dist: unit * (0.6 + Math.random() * 1.4), lift: 0.5 + Math.random() * 1.2 });
        }

        const tl = gsap.timeline();
        const windup = cinematic ? 0.38 : 0.22;
        tl.to(ray, { alpha: 0.85, duration: windup * 0.6, ease: "sine.out" }, 0);
        tl.to(title, { alpha: 1, duration: 0.16, ease: "power2.out" }, 0.04);
        tl.to(title.scale, { x: 1, y: 1, duration: windup, ease: "back.out(2.2)" }, 0.04);
        tl.to(crown, { alpha: 1, duration: 0.14 }, 0.08);
        tl.to(crown, { y: toY2 - unit * 1.1, duration: windup, ease: "power2.in" }, 0.08);
        tl.to(crown.scale, { x: 1, y: 1, duration: windup, ease: "back.out(1.8)" }, 0.08);
        tl.to(hammer, { alpha: 1, duration: 0.1 }, windup * 0.35);
        tl.to(hammer, { y: toY2 - unit * 0.2, rotation: 0.05, duration: windup * 0.9, ease: "power2.in" }, windup * 0.35);

        const impactAt = windup * 1.2;
        tl.addLabel("impact", impactAt);
        tl.to(crown, { alpha: 0, duration: 0.12, ease: "power2.in" }, "impact");
        tl.to(hammer, { y: toY2 + unit * 0.08, rotation: 0.28, duration: 0.07, ease: "power4.in" }, "impact");
        tl.to(groundGlow, { alpha: 0.95, duration: 0.06 }, "impact");
        tl.to(groundGlow.scale, { x: 1.8, y: 1.8, duration: 0.42, ease: "power2.out" }, "impact");
        tl.to(groundGlow, { alpha: 0, duration: 0.45, ease: "power2.out" }, "impact+=0.15");

        shockRings.forEach((ring, ri) => {
            const off = ri * 0.05;
            tl.to(ring, { alpha: 0.9, duration: 0.06 }, `impact+=${off}`);
            tl.to(ring.scale, { x: 3.5 + ri * 0.5, y: 2.8 + ri * 0.4, duration: 0.55, ease: "power2.out" }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: 0.35, ease: "power2.out" }, `impact+=${0.22 + off}`);
        });

        tl.to(plusOne, { alpha: 1, duration: 0.08 }, "impact+=0.06");
        tl.to(plusOne.scale, { x: 1.15, y: 1.15, duration: 0.35, ease: "back.out(2.5)" }, "impact+=0.06");
        tl.to(plusOne, { y: toY2 - unit * 1.8, alpha: 0, duration: 0.65, ease: "power2.out" }, "impact+=0.2");

        sparks.forEach((sp, idx) => {
            tl.to(sp.g, { alpha: 1, duration: 0.04 }, impactAt + 0.04 + idx * 0.006);
            tl.to(sp.g, {
                x: toX2 + Math.cos(sp.ang) * sp.dist,
                y: toY2 + Math.sin(sp.ang) * sp.dist * 0.7 - unit * sp.lift,
                alpha: 0,
                duration: 0.65 + Math.random() * 0.3,
                ease: "power2.out",
            }, impactAt + 0.04);
        });

        tl.to(hammer, { alpha: 0, duration: 0.3, ease: "power2.in" }, "impact+=0.12");
        tl.to(title, { alpha: 0, duration: 0.35, ease: "power2.in" }, "impact+=0.25");
        tl.to(ray, { alpha: 0, duration: 0.4, ease: "power2.out" }, "impact+=0.2");
        tl.to(shakeWrap, {
            x: unit * 0.14, duration: 0.035, yoyo: true, repeat: cinematic ? 7 : 5, ease: "power1.inOut",
        }, "impact");

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        await awaitPixiTimeline(tl, shakeWrap, cinematic ? 2.4 : 1.6);
        sweepOrphanScenes();
        return true;
    }

    /** VINGANÇA — corte cinematográfico estilo Hearthstone (Pixi+GSAP). */
    async function playVingancaSwordScene(opts = {}) {
        const cinematic = opts.cinematic !== false && (
            global.DfVfxEngine?.wantsGpuPresentation?.()
            || global.DfVfxEngine?.wantsCinematic?.()
        );
        if (!cinematic && !canUse()) return false;
        if (opts.toX == null || opts.toY == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        // Viewport → espaço do canvas (igual Legado); sem map o impacto cai fora do alvo.
        const frame = pixiSceneFrame(a, cinematic);
        const mapped = frame.map(opts.toX, opts.toY);
        const toX = mapped.x;
        const toY = mapped.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const vTheme = themeFromRecipe({ hue: 0 });

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        const edgeVig = cinematic ? makeEdgeVignette(PIXI, 0.26) : null;
        if (edgeVig) {
            const scene2 = scenePixels();
            edgeVig.beginFill(0x1a0000, 0.15);
            edgeVig.drawRect(0, 0, scene2.w, scene2.h);
            edgeVig.endFill();
            edgeVig.alpha = 0;
            root.addChild(edgeVig);
        }

        const title = new PIXI.Text("VINGANÇA", {
            fontFamily: "Cinzel, Georgia, serif",
            fontSize: Math.max(28, unit * 0.52),
            fontWeight: "900",
            fill: 0xffd0d0,
            stroke: 0x660000,
            strokeThickness: Math.max(3, unit * 0.04),
            letterSpacing: unit * 0.06,
            dropShadow: true,
            dropShadowColor: 0xff2020,
            dropShadowBlur: unit * 0.18,
            dropShadowDistance: 0,
        });
        title.anchor.set(0.5);
        const scene3 = scenePixels();
        title.x = scene3.w / 2;
        title.y = scene3.h * 0.14;
        title.alpha = 0;
        title.scale.set(0.55);
        root.addChild(title);

        const targetBloom = makeSoftBloom(PIXI, vTheme, unit, 0.85);
        targetBloom.x = toX;
        targetBloom.y = toY;
        targetBloom.alpha = 0;
        root.addChild(targetBloom);

        const furySwirl = [];
        const swirlN = n(cinematic ? 20 : 10);
        for (let fi = 0; fi < swirlN; fi++) {
            const em = makeSoftOrb(PIXI, fi % 2 ? 0xff3030 : 0xff8080, unit * (0.05 + Math.random() * 0.08), 0.75);
            em.x = toX + (Math.random() - 0.5) * unit * 3.5;
            em.y = toY + (Math.random() - 0.5) * unit * 2.5;
            em.alpha = 0;
            root.addChild(em);
            furySwirl.push({ g: em, tx: toX, ty: toY, delay: Math.random() * 0.15 });
        }

        const crimsonPulse = new PIXI.Graphics();
        crimsonPulse.beginFill(0xff2020, 0.35);
        crimsonPulse.drawCircle(0, 0, unit * 1.2);
        crimsonPulse.endFill();
        if (PIXI.BLEND_MODES) crimsonPulse.blendMode = PIXI.BLEND_MODES.ADD;
        crimsonPulse.x = toX;
        crimsonPulse.y = toY;
        crimsonPulse.alpha = 0;
        crimsonPulse.scale.set(0.3);
        root.addChild(crimsonPulse);

        const slashArcs = [];
        for (let si = 0; si < (cinematic ? 3 : 2); si++) {
            const arc = new PIXI.Graphics();
            const rot = si === 0 ? -0.55 : (si === 1 ? 0.45 : 0.05);
            arc.beginFill(0xff2020, 0.55);
            arc.moveTo(-unit * 1.5, -unit * 0.08);
            arc.lineTo(unit * 1.5, unit * 0.08);
            arc.lineTo(unit * 1.35, unit * 0.22);
            arc.lineTo(-unit * 1.35, -unit * 0.06);
            arc.closePath();
            arc.endFill();
            arc.beginFill(0xffffff, 0.35);
            arc.moveTo(-unit * 1.1, -unit * 0.04);
            arc.lineTo(unit * 1.1, unit * 0.04);
            arc.lineTo(unit * 0.95, unit * 0.1);
            arc.lineTo(-unit * 0.95, -unit * 0.02);
            arc.closePath();
            arc.endFill();
            if (PIXI.BLEND_MODES) arc.blendMode = PIXI.BLEND_MODES.ADD;
            arc.x = toX;
            arc.y = toY;
            arc.rotation = rot;
            arc.alpha = 0;
            arc.scale.set(0.4);
            root.addChild(arc);
            slashArcs.push(arc);
        }

        const sword = buildVingancaSword(PIXI, unit);
        sword.x = toX - unit * 2.0;
        sword.y = toY - unit * 1.4;
        sword.rotation = -1.05;
        sword.alpha = 0;
        root.addChild(sword);

        const ghostTrails = [];
        for (let gi = 0; gi < (cinematic ? 4 : 2); gi++) {
            const ghost = buildVingancaSword(PIXI, unit);
            ghost.alpha = 0;
            root.addChild(ghost);
            ghostTrails.push(ghost);
        }

        const bloodPool = new PIXI.Graphics();
        bloodPool.beginFill(0x990808, 0.62);
        bloodPool.drawEllipse(0, 0, unit * 1.05, unit * 0.38);
        bloodPool.endFill();
        bloodPool.beginFill(0xcc1010, 0.45);
        bloodPool.drawEllipse(0, unit * 0.05, unit * 0.72, unit * 0.22);
        bloodPool.endFill();
        bloodPool.x = toX;
        bloodPool.y = toY + unit * 0.08;
        bloodPool.alpha = 0;
        root.addChild(bloodPool);

        const bloodCount = n(cinematic ? 52 : 22);
        const bloodParts = [];
        for (let i = 0; i < bloodCount; i++) {
            const drop = makeBloodDrop(PIXI, unit);
            drop.visible = false;
            root.addChild(drop);
            bloodParts.push({ g: drop, vx: 0, vy: 0, vr: 0 });
        }

        const impactFlash = new PIXI.Graphics();
        impactFlash.beginFill(0xff4040, 0.55);
        impactFlash.drawCircle(0, 0, unit * 0.55);
        impactFlash.endFill();
        impactFlash.x = toX;
        impactFlash.y = toY;
        impactFlash.alpha = 0;
        if (PIXI.BLEND_MODES) impactFlash.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(impactFlash);

        const tl = gsap.timeline();
        const windup = cinematic ? 0.42 : 0.18;
        const slashDur = cinematic ? 0.2 : 0.14;

        furySwirl.forEach((em, fi) => {
            tl.to(em.g, { alpha: 0.9, duration: 0.12 }, fi * 0.012);
            tl.to(em.g, { x: em.tx, y: em.ty, duration: windup * 0.85, ease: "power2.in" }, fi * 0.012);
            tl.to(em.g, { alpha: 0, duration: 0.18 }, windup * 0.75);
        });

        if (edgeVig) tl.to(edgeVig, { alpha: 1, duration: windup * 0.55, ease: "sine.out" }, 0);
        tl.to(crimsonPulse, { alpha: 0.75, duration: windup * 0.4, ease: "sine.out" }, 0);
        tl.to(crimsonPulse.scale, { x: 2.2, y: 2.2, duration: windup, ease: "sine.inOut" }, 0);
        tl.to(title, { alpha: 1, duration: 0.18, ease: "power2.out" }, 0);
        tl.to(title.scale, { x: 1, y: 1, duration: windup, ease: "back.out(2.2)" }, 0);
        tl.to(targetBloom, { alpha: 0.7, duration: windup * 0.7, ease: "sine.out" }, 0);
        tl.to(targetBloom.scale, { x: 1.15, y: 1.15, duration: windup, ease: "sine.inOut" }, 0);

        const slashAt = windup * 0.82;
        tl.addLabel("slash", slashAt);
        tl.to(crimsonPulse, { alpha: 0, duration: 0.12 }, "slash");
        tl.to(sword, { alpha: 1, duration: 0.06 }, "slash");
        tl.to(sword, {
            x: toX + unit * 1.65,
            y: toY + unit * 1.15,
            rotation: 0.72,
            duration: slashDur,
            ease: "power3.in",
            onUpdate() {
                if (sword.__trail) sword.__trail.alpha = 0.55 + Math.random() * 0.35;
                ghostTrails.forEach((gh, idx) => {
                    gh.x = sword.x - idx * unit * 0.18;
                    gh.y = sword.y - idx * unit * 0.12;
                    gh.rotation = sword.rotation + idx * 0.05;
                    gh.alpha = Math.max(0, 0.45 - idx * 0.12);
                });
            },
        }, "slash");

        if (cinematic) {
            const slash2At = slashAt + slashDur * 0.55;
            tl.to(sword, {
                x: toX - unit * 1.4,
                y: toY + unit * 0.9,
                rotation: -0.85,
                duration: slashDur * 0.85,
                ease: "power3.inOut",
            }, slash2At);
        }

        slashArcs.forEach((arc, i) => {
            const off = i * 0.07;
            tl.to(arc, { alpha: 0.95, duration: 0.05 }, `slash+=${slashDur * 0.5 + off}`);
            tl.to(arc.scale, { x: 1.45, y: 1.45, duration: 0.14, ease: "power2.out" }, `slash+=${slashDur * 0.5 + off}`);
            tl.to(arc, { alpha: 0, duration: 0.32, ease: "power2.out" }, `slash+=${slashDur * 0.68 + off}`);
        });

        tl.to(impactFlash, { alpha: 0.85, duration: 0.04 }, `slash+=${slashDur * 0.88}`);
        tl.to(impactFlash.scale, { x: 2.4, y: 2.4, duration: 0.18, ease: "power2.out" }, `slash+=${slashDur * 0.88}`);
        tl.to(impactFlash, { alpha: 0, duration: 0.32 }, `slash+=${slashDur * 0.95}`);

        tl.to(bloodPool, { alpha: 0.82, duration: 0.06 }, `slash+=${slashDur * 0.9}`);
        tl.to(bloodPool, { alpha: 0, duration: 0.55, ease: "power2.out" }, `slash+=${slashDur * 1.05}`);

        tl.add(() => {
            bloodParts.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / bloodParts.length + (Math.random() - 0.5) * 0.6;
                const spd = 3 + Math.random() * (cinematic ? 9 : 5);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - 2.5;
                p.vr = (Math.random() - 0.5) * 0.3;
                p.g.visible = true;
                p.g.x = toX + (Math.random() - 0.5) * unit * 0.35;
                p.g.y = toY + (Math.random() - 0.5) * unit * 0.2;
                p.g.alpha = 1;
            });
        }, `slash+=${slashDur * 0.9}`);

        const bloodProxy = { t: 0 };
        tl.to(bloodProxy, {
            t: 1,
            duration: cinematic ? 0.72 : 0.45,
            ease: "none",
            onUpdate: () => {
                bloodParts.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.14;
                    p.vx *= 0.96;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - bloodProxy.t * 1.15);
                });
            },
        }, `slash+=${slashDur * 0.9}`);

        tl.to(sword, { alpha: 0, duration: 0.22 }, `slash+=${slashDur * 0.75}`);
        ghostTrails.forEach((gh) => tl.to(gh, { alpha: 0, duration: 0.18 }, `slash+=${slashDur * 0.8}`));
        tl.to(title, { alpha: 0, duration: 0.35, ease: "power2.in" }, `slash+=${slashDur * 0.5}`);
        if (edgeVig) tl.to(edgeVig, { alpha: 0, duration: 0.45, ease: "power2.out" }, `slash+=${slashDur * 0.85}`);
        tl.to(targetBloom, { alpha: 0, duration: 0.4 }, `slash+=${slashDur * 0.7}`);

        tl.to(shakeWrap, {
            x: unit * 0.14,
            duration: 0.03,
            yoyo: true,
            repeat: cinematic ? 9 : 5,
            ease: "power1.inOut",
        }, `slash+=${slashDur * 0.82}`);

        await awaitPixiTimeline(tl, shakeWrap, cinematic ? 2.6 : 1.5);
        sweepOrphanScenes();
        return true;
    }

    /**
     * Explosão Venenosa (on-destroy) — burst tóxico centrado no campeão afetado
     * (não reutiliza baforada/projétil). Shockwave + partículas + poça residual.
     */
    async function playPoisonExplosionBurstScene(cx, cy, opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playPoisonExplosionBurstScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        const PIXI = global.PIXI;
        const frame = pixiSceneFrame(a, cinematic);
        const mapped = frame.map(cx, cy);
        cx = mapped.x;
        cy = mapped.y;
        const unit = cardUnit(1);
        const GREEN = 0x7ee23a;
        const LIME = 0xc8ff7a;
        const DARK = 0x143a12;
        const TOXIC = 0x9bff4a;
        const VIOLET = 0x6b2fa0;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        root.x = cx;
        root.y = cy;
        shakeWrap.addChild(root);

        try {
            const groundGlow = makeSoftBloom(PIXI, {
                core: GREEN, spark: LIME, flash: 0xe8ffb0, ring: TOXIC,
            }, unit, cinematic ? 1.85 : 1.25);
            groundGlow.alpha = 0;
            groundGlow.scale.set(0.15);
            root.addChild(groundGlow);

            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2, unit * 0.045), LIME, 0.95);
            ring.drawCircle(0, 0, unit * 0.22);
            ring.alpha = 0;
            root.addChild(ring);

            const ring2 = new PIXI.Graphics();
            ring2.lineStyle(Math.max(1.5, unit * 0.03), TOXIC, 0.7);
            ring2.drawCircle(0, 0, unit * 0.18);
            ring2.alpha = 0;
            root.addChild(ring2);

            const coreFlash = new PIXI.Graphics();
            coreFlash.beginFill(0xffffff, 1);
            coreFlash.drawCircle(0, 0, unit * 0.28);
            coreFlash.endFill();
            coreFlash.beginFill(LIME, 0.95);
            coreFlash.drawCircle(0, 0, unit * 0.18);
            coreFlash.endFill();
            if (PIXI.BLEND_MODES) coreFlash.blendMode = PIXI.BLEND_MODES.ADD;
            coreFlash.alpha = 0;
            coreFlash.scale.set(0.2);
            root.addChild(coreFlash);

            // Coluna de explosão vertical — deixa claro que o burst está NO campeão.
            const column = new PIXI.Graphics();
            column.beginFill(LIME, 0.55);
            column.drawEllipse(0, -unit * 0.15, unit * 0.22, unit * 0.85);
            column.endFill();
            column.beginFill(GREEN, 0.7);
            column.drawEllipse(0, -unit * 0.35, unit * 0.14, unit * 0.55);
            column.endFill();
            column.beginFill(0xffffff, 0.35);
            column.drawEllipse(0, -unit * 0.5, unit * 0.07, unit * 0.28);
            column.endFill();
            if (PIXI.BLEND_MODES) column.blendMode = PIXI.BLEND_MODES.ADD;
            column.alpha = 0;
            column.scale.set(0.2, 0.15);
            root.addChild(column);

            const shardN = cinematic ? 12 : 7;
            const shards = [];
            for (let i = 0; i < shardN; i++) {
                const s = new PIXI.Graphics();
                const len = unit * (0.18 + Math.random() * 0.22);
                s.beginFill(i % 2 ? LIME : TOXIC, 0.95);
                s.moveTo(0, 0);
                s.lineTo(len * 0.22, -len);
                s.lineTo(-len * 0.18, -len * 0.55);
                s.closePath();
                s.endFill();
                s.alpha = 0;
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
                s.rotation = ang + Math.PI / 2;
                s._vx = Math.cos(ang);
                s._vy = Math.sin(ang);
                s._dist = unit * (0.7 + Math.random() * 1.3);
                root.addChild(s);
                shards.push(s);
            }

            const dropletCount = cinematic ? 22 : 14;
            const droplets = [];
            for (let i = 0; i < dropletCount; i++) {
                const d = new PIXI.Graphics();
                const sz = unit * (0.04 + Math.random() * 0.07);
                d.beginFill(i % 3 === 0 ? VIOLET : (i % 2 === 0 ? GREEN : LIME), 1);
                d.drawCircle(0, 0, sz);
                d.endFill();
                d.beginFill(0xffffff, 0.35);
                d.drawCircle(-sz * 0.25, -sz * 0.3, sz * 0.28);
                d.endFill();
                d.alpha = 0;
                const ang = (i / dropletCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                d._vx = Math.cos(ang);
                d._vy = Math.sin(ang);
                d._dist = unit * (0.55 + Math.random() * 1.15);
                root.addChild(d);
                droplets.push(d);
            }

            const pool = new PIXI.Graphics();
            pool.beginFill(DARK, 0.55);
            pool.drawEllipse(0, unit * 0.22, unit * 0.55, unit * 0.18);
            pool.endFill();
            pool.beginFill(GREEN, 0.75);
            pool.drawEllipse(0, unit * 0.2, unit * 0.42, unit * 0.13);
            pool.endFill();
            pool.beginFill(LIME, 0.45);
            pool.drawEllipse(-unit * 0.08, unit * 0.16, unit * 0.18, unit * 0.06);
            pool.endFill();
            pool.alpha = 0;
            pool.scale.set(0.2);
            root.addChild(pool);

            const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
            const poisonTheme = { core: LIME, spark: GREEN, flash: 0xe8ffb0, ring: TOXIC, hue: 96 };
            addSoftImpactToTimeline(tl, root, PIXI, poisonTheme, unit, cinematic, 0, {
                core: LIME, flash: 0xe8ffb0,
            });

            tl.to(coreFlash, { alpha: 1, duration: 0.06 }, 0);
            tl.to(coreFlash.scale, { x: 1.55, y: 1.55, duration: 0.14, ease: "back.out(2)" }, 0);
            tl.to(coreFlash, { alpha: 0, duration: 0.32, ease: "power2.in" }, 0.1);

            tl.to(column, { alpha: 1, duration: 0.06 }, 0.02);
            tl.to(column.scale, { x: 1.15, y: 1.55, duration: 0.22, ease: "power3.out" }, 0.02);
            tl.to(column, { alpha: 0, y: -unit * 0.55, duration: 0.45, ease: "power2.in" }, 0.22);

            tl.to(groundGlow, { alpha: 1, duration: 0.08 }, 0);
            tl.to(groundGlow.scale, { x: 1.45, y: 1.45, duration: 0.42, ease: "power3.out" }, 0);
            tl.to(groundGlow, { alpha: 0, duration: 0.55, ease: "sine.in" }, 0.32);

            tl.to(ring, { alpha: 1, duration: 0.05 }, 0.02);
            tl.to(ring.scale, { x: 5.0, y: 5.0, duration: 0.52, ease: "power3.out" }, 0.02);
            tl.to(ring, { alpha: 0, duration: 0.35 }, 0.24);

            tl.to(ring2, { alpha: 0.95, duration: 0.05 }, 0.08);
            tl.to(ring2.scale, { x: 6.2, y: 6.2, duration: 0.58, ease: "power2.out" }, 0.08);
            tl.to(ring2, { alpha: 0, duration: 0.38 }, 0.3);

            shards.forEach((s, i) => {
                const t0 = 0.03 + i * 0.015;
                tl.to(s, { alpha: 1, duration: 0.04 }, t0);
                tl.to(s, {
                    x: s._vx * s._dist,
                    y: s._vy * s._dist,
                    duration: 0.4,
                    ease: "power2.out",
                }, t0);
                tl.to(s, { alpha: 0, duration: 0.28, ease: "power2.in" }, t0 + 0.28);
            });

            droplets.forEach((d, i) => {
                const t0 = 0.04 + i * 0.012;
                tl.to(d, { alpha: 1, duration: 0.05 }, t0);
                tl.to(d, {
                    x: d._vx * d._dist,
                    y: d._vy * d._dist - unit * 0.15,
                    duration: 0.42,
                    ease: "power2.out",
                }, t0);
                tl.to(d, {
                    y: `+=${unit * 0.35}`,
                    alpha: 0,
                    duration: 0.38,
                    ease: "power2.in",
                }, t0 + 0.28);
            });

            tl.to(pool, { alpha: 1, duration: 0.12 }, 0.18);
            tl.to(pool.scale, { x: 1.15, y: 1.15, duration: 0.35, ease: "back.out(1.4)" }, 0.18);
            tl.to(pool, { alpha: 0, duration: 0.55, ease: "sine.in" }, 0.78);

            if (cinematic && shakeWrap) {
                tl.to(shakeWrap, { x: "+=8", duration: 0.04, yoyo: true, repeat: 6 }, 0);
            }

            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 1.7 : 1.15);
            sweepOrphanScenes();
            return true;
        } catch (e) {
            console.warn("[DF PixiVfx] playPoisonExplosionBurstScene", e);
            try { shakeWrap.destroy({ children: true }); } catch (_) { /* */ }
            return false;
        }
    }

    /**
     * Mordida Venenosa — mandíbulas verde-tóxicas fecham no campeão, jorro de veneno,
     * e só então o status Envenenado aparece (flash no DOM após a cena).
     */
    async function playPoisonBiteScene(cx, cy, opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playPoisonBiteScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        const PIXI = global.PIXI;
        const frame = pixiSceneFrame(a, cinematic);
        const mapped = frame.map(cx, cy);
        cx = mapped.x;
        cy = mapped.y;
        const unit = cardUnit(1);
        const GREEN = 0x4ae84a;
        const LIME = 0xb8ff66;
        const DARK = 0x0e2a10;
        const VIOLET = 0x6b2fa0;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        root.x = cx;
        root.y = cy;
        shakeWrap.addChild(root);

        try {
            const vignette = new PIXI.Graphics();
            vignette.beginFill(DARK, 0.38);
            vignette.drawCircle(0, 0, unit * 2.2);
            vignette.endFill();
            vignette.alpha = 0;
            root.addChild(vignette);

            // Presas via emoji (sem mandíbula cartoon).
            const fangRow = (upper) => {
                const row = new PIXI.Container();
                const nF = 5;
                for (let i = 0; i < nF; i++) {
                    const fang = makeEmojiText(PIXI, "🦷", unit * (0.42 + (i === 2 ? 0.08 : 0)), {
                        scaleY: upper ? 1 : -1,
                    });
                    fang.x = (i - 2) * unit * 0.38;
                    fang.y = 0;
                    fang.alpha = 0.95;
                    row.addChild(fang);
                }
                return row;
            };
            const upper = fangRow(true);
            upper.y = -unit * 2.2;
            upper.alpha = 0;
            root.addChild(upper);

            const lower = fangRow(false);
            lower.y = unit * 2.2;
            lower.alpha = 0;
            root.addChild(lower);

            const venomAura = makeSoftBloom(PIXI, {
                core: GREEN, spark: LIME, flash: 0xe8ffb0, ring: GREEN,
            }, unit, 1.35);
            venomAura.alpha = 0;
            venomAura.scale.set(0.25);
            root.addChild(venomAura);

            const spitN = cinematic ? 16 : 10;
            const spit = [];
            for (let i = 0; i < spitN; i++) {
                const d = new PIXI.Graphics();
                const sz = unit * (0.045 + Math.random() * 0.08);
                d.beginFill(i % 3 === 0 ? VIOLET : (i % 2 ? GREEN : LIME), 1);
                d.drawCircle(0, 0, sz);
                d.endFill();
                d.beginFill(0xffffff, 0.3);
                d.drawCircle(-sz * 0.2, -sz * 0.25, sz * 0.3);
                d.endFill();
                d.alpha = 0;
                const ang = (i / spitN) * Math.PI * 2 + Math.random() * 0.5;
                d._vx = Math.cos(ang);
                d._vy = Math.sin(ang);
                d._dist = unit * (0.45 + Math.random() * 1.05);
                root.addChild(d);
                spit.push(d);
            }

            const pool = new PIXI.Graphics();
            pool.beginFill(DARK, 0.6);
            pool.drawEllipse(0, unit * 0.28, unit * 0.5, unit * 0.16);
            pool.endFill();
            pool.beginFill(GREEN, 0.8);
            pool.drawEllipse(0, unit * 0.25, unit * 0.38, unit * 0.12);
            pool.endFill();
            pool.beginFill(LIME, 0.5);
            pool.drawEllipse(-unit * 0.06, unit * 0.2, unit * 0.16, unit * 0.05);
            pool.endFill();
            pool.alpha = 0;
            pool.scale.set(0.15);
            root.addChild(pool);

            const chompFlash = new PIXI.Graphics();
            chompFlash.beginFill(0xffffff, 1);
            chompFlash.drawCircle(0, 0, unit * 0.32);
            chompFlash.endFill();
            chompFlash.beginFill(LIME, 0.95);
            chompFlash.drawCircle(0, 0, unit * 0.22);
            chompFlash.endFill();
            if (PIXI.BLEND_MODES) chompFlash.blendMode = PIXI.BLEND_MODES.ADD;
            chompFlash.alpha = 0;
            chompFlash.scale.set(0.2);
            root.addChild(chompFlash);

            // Névoa tóxica leve (sem emoji de cobra) — sinaliza mordida venenosa.
            const venomMist = makeSoftBloom(PIXI, {
                core: GREEN, spark: LIME, flash: 0xd8ff90, ring: 0x3a8a20,
            }, unit, 1.1);
            venomMist.alpha = 0;
            venomMist.scale.set(0.35);
            root.addChild(venomMist);

            const dripN = cinematic ? 8 : 5;
            const drips = [];
            for (let i = 0; i < dripN; i++) {
                const d = new PIXI.Graphics();
                const sz = unit * (0.035 + Math.random() * 0.04);
                d.beginFill(i % 2 ? LIME : GREEN, 0.9);
                d.drawEllipse(0, 0, sz * 0.7, sz * 1.15);
                d.endFill();
                d.alpha = 0;
                d.x = (Math.random() - 0.5) * unit * 0.55;
                d.y = -unit * 0.15;
                root.addChild(d);
                drips.push(d);
            }

            const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

            tl.to(vignette, { alpha: 1, duration: 0.18 }, 0);
            tl.to(upper, { alpha: 1, duration: 0.12 }, 0.05);
            tl.to(lower, { alpha: 1, duration: 0.12 }, 0.05);
            tl.to(upper, { y: -unit * 1.35, duration: 0.28, ease: "power3.out" }, 0.05);
            tl.to(lower, { y: unit * 1.35, duration: 0.28, ease: "power3.out" }, 0.05);
            tl.to(venomAura, { alpha: 0.85, duration: 0.2 }, 0.1);
            tl.to(venomAura.scale, { x: 0.9, y: 0.9, duration: 0.35 }, 0.1);

            const snapT = 0.38;
            tl.to(upper, { y: -unit * 0.28, duration: 0.1, ease: "power4.in" }, snapT);
            tl.to(lower, { y: unit * 0.28, duration: 0.1, ease: "power4.in" }, snapT);
            tl.to(chompFlash, { alpha: 1, duration: 0.05 }, snapT + 0.08);
            tl.to(chompFlash.scale, { x: 1.4, y: 1.4, duration: 0.12, ease: "power2.out" }, snapT + 0.08);
            tl.to(chompFlash, { alpha: 0, duration: 0.22, ease: "power2.in" }, snapT + 0.18);
            tl.to(venomMist, { alpha: 0.9, duration: 0.12 }, snapT + 0.1);
            tl.to(venomMist.scale, { x: 1.25, y: 1.25, duration: 0.4, ease: "power2.out" }, snapT + 0.1);
            drips.forEach((d, i) => {
                const t0 = snapT + 0.12 + i * 0.03;
                tl.to(d, { alpha: 0.95, duration: 0.06 }, t0);
                tl.to(d, { y: unit * (0.35 + Math.random() * 0.35), duration: 0.45, ease: "power2.in" }, t0);
                tl.to(d, { alpha: 0, duration: 0.2 }, t0 + 0.28);
            });
            if (cinematic) {
                tl.to(shakeWrap, { x: "+=6", duration: 0.04, yoyo: true, repeat: 4 }, snapT + 0.08);
            }

            const venomT = snapT + 0.18;
            spit.forEach((d, i) => {
                const t0 = venomT + i * 0.014;
                tl.to(d, { alpha: 1, duration: 0.05 }, t0);
                tl.to(d, {
                    x: d._vx * d._dist,
                    y: d._vy * d._dist - unit * 0.12,
                    duration: 0.38,
                    ease: "power2.out",
                }, t0);
                tl.to(d, {
                    y: `+=${unit * 0.4}`,
                    alpha: 0,
                    duration: 0.36,
                    ease: "power2.in",
                }, t0 + 0.26);
            });
            tl.to(pool, { alpha: 1, duration: 0.14 }, venomT + 0.12);
            tl.to(pool.scale, { x: 1, y: 1, duration: 0.32, ease: "power2.out" }, venomT + 0.12);
            tl.to(venomAura.scale, { x: 1.35, y: 1.35, duration: 0.4 }, venomT);
            tl.to(venomAura, { alpha: 0, duration: 0.45, ease: "sine.in" }, venomT + 0.35);
            tl.to(venomMist, { alpha: 0, duration: 0.4, ease: "sine.in" }, venomT + 0.3);

            const outT = venomT + 0.55;
            tl.to(upper, { y: -unit * 2.4, alpha: 0, duration: 0.28, ease: "power2.in" }, outT);
            tl.to(lower, { y: unit * 2.4, alpha: 0, duration: 0.28, ease: "power2.in" }, outT);
            tl.to(pool, { alpha: 0, duration: 0.4, ease: "sine.in" }, outT + 0.1);
            tl.to(vignette, { alpha: 0, duration: 0.35 }, outT + 0.05);

            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 1.85 : 1.25);
            sweepOrphanScenes();
            return true;
        } catch (e) {
            console.warn("[DF PixiVfx] playPoisonBiteScene", e);
            try { shakeWrap.destroy({ children: true }); } catch (_) { /* */ }
            return false;
        }
    }

    /**
     * Corromper — aura sombria profissional (sem cartoon): pulso violeta, véu e selo Sem Honra.
     */
    async function playCorruptScene(cx, cy, opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const frame = pixiSceneFrame(a, cinematic);
        const mapped = frame.map(cx, cy);
        cx = mapped.x;
        cy = mapped.y;
        const unit = cardUnit(1);
        const VIOLET = 0x6b2fa0;
        const MAGENTA = 0xc05090;
        const DARK = 0x120818;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        root.x = cx;
        root.y = cy;
        shakeWrap.addChild(root);

        try {
            const veil = new PIXI.Graphics();
            veil.beginFill(DARK, 0.55);
            veil.drawCircle(0, 0, unit * 2.1);
            veil.endFill();
            veil.alpha = 0;
            root.addChild(veil);

            const aura = makeSoftBloom(PIXI, {
                core: VIOLET, spark: MAGENTA, flash: 0xf0c0e0, ring: VIOLET,
            }, unit, 1.55);
            aura.alpha = 0;
            aura.scale.set(0.2);
            root.addChild(aura);

            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2, unit * 0.04), MAGENTA, 0.85);
            ring.drawCircle(0, 0, unit * 0.35);
            ring.alpha = 0;
            root.addChild(ring);

            const wisps = [];
            const wN = cinematic ? 14 : 9;
            for (let i = 0; i < wN; i++) {
                const w = new PIXI.Graphics();
                w.beginFill(i % 2 ? VIOLET : MAGENTA, 0.85);
                w.drawCircle(0, 0, unit * (0.04 + Math.random() * 0.05));
                w.endFill();
                w.alpha = 0;
                const ang = (i / wN) * Math.PI * 2;
                w._vx = Math.cos(ang);
                w._vy = Math.sin(ang);
                w._dist = unit * (0.5 + Math.random() * 0.9);
                root.addChild(w);
                wisps.push(w);
            }

            const seal = makeEmojiText(PIXI, "💀", unit * 0.62);
            seal.alpha = 0;
            seal.scale.set(0.25);
            root.addChild(seal);

            const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
            tl.to(veil, { alpha: 1, duration: 0.22 }, 0);
            tl.to(aura, { alpha: 1, duration: 0.18 }, 0.08);
            tl.to(aura.scale, { x: 1.15, y: 1.15, duration: 0.55, ease: "power3.out" }, 0.08);
            tl.to(ring, { alpha: 1, duration: 0.1 }, 0.15);
            tl.to(ring.scale, { x: 3.6, y: 3.6, duration: 0.7, ease: "power2.out" }, 0.15);
            tl.to(ring, { alpha: 0, duration: 0.35 }, 0.5);
            wisps.forEach((w, i) => {
                const t0 = 0.12 + i * 0.02;
                tl.to(w, { alpha: 1, duration: 0.08 }, t0);
                tl.to(w, {
                    x: w._vx * w._dist,
                    y: w._vy * w._dist,
                    duration: 0.55,
                    ease: "power2.out",
                }, t0);
                tl.to(w, { alpha: 0, duration: 0.35 }, t0 + 0.35);
            });
            tl.to(seal, { alpha: 1, duration: 0.12 }, 0.35);
            tl.to(seal.scale, { x: 1.1, y: 1.1, duration: 0.35, ease: "power2.out" }, 0.35);
            tl.to(seal, { alpha: 0, duration: 0.4, ease: "sine.in" }, 0.85);
            tl.to(aura, { alpha: 0, duration: 0.45 }, 0.75);
            tl.to(veil, { alpha: 0, duration: 0.4 }, 0.8);
            if (cinematic) {
                tl.to(shakeWrap, { x: "+=4", duration: 0.05, yoyo: true, repeat: 3 }, 0.35);
            }
            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 1.55 : 1.05);
            sweepOrphanScenes();
            return true;
        } catch (e) {
            console.warn("[DF PixiVfx] playCorruptScene", e);
            try { shakeWrap.destroy({ children: true }); } catch (_) { /* */ }
            return false;
        }
    }

    /**
     * Poção Improvável (Alquimista) — frasco em arco, splash suave, ✨/💀 (sem cartoon).
     */
    async function playPotionUltimateScene(cx, cy, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const frame = pixiSceneFrame(a, cinematic);
        const mapped = frame.map(cx, cy);
        cx = mapped.x;
        cy = mapped.y;
        const success = !!opts.success;
        const unit = cardUnit(1);
        const GOOD = 0x5ae878;
        const BAD = 0xb050e0;
        const accent = success ? GOOD : BAD;
        const windupMs = opts.windupMs ?? (cinematic ? 280 : 80);
        const travelMs = opts.travelMs ?? (cinematic ? 720 : 420);
        const impactMs = opts.impactMs ?? (cinematic ? 480 : 280);
        const lingerMs = opts.lingerMs ?? (cinematic ? 260 : 120);

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        try {
            const fromX = cx + unit * (Math.random() > 0.5 ? -1.8 : 1.8);
            const fromY = cy - unit * 2.8;

            const vial = makeEmojiText(PIXI, "🧪", unit * 0.72);
            vial.x = fromX;
            vial.y = fromY;
            vial.alpha = 0;
            vial.scale.set(0.4);
            root.addChild(vial);

            const trail = makeSoftBloom(PIXI, {
                core: accent, spark: 0xffffff, flash: accent, ring: accent,
            }, unit, 0.7);
            trail.x = fromX;
            trail.y = fromY;
            trail.alpha = 0;
            root.addChild(trail);

            const splash = makeSoftBloom(PIXI, {
                core: accent, spark: 0xffffff, flash: 0xffffff, ring: accent,
            }, unit, 1.4);
            splash.x = cx;
            splash.y = cy;
            splash.alpha = 0;
            splash.scale.set(0.15);
            root.addChild(splash);

            const outcome = makeEmojiText(PIXI, success ? "✨" : "💀", unit * 1.15);
            outcome.x = cx;
            outcome.y = cy - unit * 0.35;
            outcome.alpha = 0;
            outcome.scale.set(0.3);
            root.addChild(outcome);

            const droplets = [];
            for (let i = 0; i < (cinematic ? 12 : 7); i++) {
                const d = new PIXI.Graphics();
                d.beginFill(accent, 0.9);
                d.drawCircle(0, 0, unit * (0.03 + Math.random() * 0.04));
                d.endFill();
                d.alpha = 0;
                d.x = cx;
                d.y = cy;
                const ang = (i / 12) * Math.PI * 2;
                d._vx = Math.cos(ang);
                d._vy = Math.sin(ang);
                d._dist = unit * (0.4 + Math.random() * 0.7);
                root.addChild(d);
                droplets.push(d);
            }

            const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
            const w = windupMs / 1000;
            const t = travelMs / 1000;
            const imp = impactMs / 1000;
            const lin = lingerMs / 1000;

            tl.to(vial, { alpha: 1, duration: 0.12 }, 0);
            tl.to(vial.scale, { x: 1, y: 1, duration: Math.max(0.12, w) }, 0);
            tl.to(trail, { alpha: 0.7, duration: 0.1 }, 0.05);

            const midX = (fromX + cx) / 2 + unit * 0.35;
            const midY = Math.min(fromY, cy) - unit * 1.1;
            tl.to(vial, { x: midX, y: midY, duration: t * 0.45, ease: "power1.out" }, w);
            tl.to(vial, { x: cx, y: cy, duration: t * 0.55, ease: "power2.in" }, w + t * 0.45);
            tl.to(trail, { x: cx, y: cy, duration: t, ease: "power1.inOut" }, w);
            tl.to(vial, { rotation: 0.8, duration: t }, w);

            const hitT = w + t;
            tl.add(() => { try { opts.onImpact?.(); } catch (_) { /* */ } }, hitT);
            tl.to(vial, { alpha: 0, scale: 0.2, duration: 0.12 }, hitT);
            tl.to(splash, { alpha: 1, duration: 0.08 }, hitT);
            tl.to(splash.scale, { x: 1.35, y: 1.35, duration: imp * 0.55, ease: "power3.out" }, hitT);
            tl.to(splash, { alpha: 0, duration: imp * 0.5 }, hitT + imp * 0.4);
            droplets.forEach((d, i) => {
                const t0 = hitT + i * 0.012;
                tl.to(d, { alpha: 1, duration: 0.05 }, t0);
                tl.to(d, {
                    x: cx + d._vx * d._dist,
                    y: cy + d._vy * d._dist,
                    duration: 0.4,
                    ease: "power2.out",
                }, t0);
                tl.to(d, { alpha: 0, duration: 0.28 }, t0 + 0.28);
            });
            tl.to(outcome, { alpha: 1, duration: 0.1 }, hitT + 0.08);
            tl.to(outcome.scale, { x: 1.35, y: 1.35, duration: 0.35, ease: "back.out(2.2)" }, hitT + 0.08);
            tl.to(outcome, { y: cy - unit * 1.15, alpha: 0, duration: 0.7, ease: "power2.in" }, hitT + 0.55);
            tl.to({}, { duration: Math.max(lin, 0.55) }, hitT + imp);

            if (cinematic) {
                tl.to(shakeWrap, { x: "+=5", duration: 0.04, yoyo: true, repeat: 4 }, hitT);
            }

            await awaitPixiTimeline(tl, shakeWrap, cinematic ? 2.2 : 1.4);
            sweepOrphanScenes();
            return true;
        } catch (e) {
            console.warn("[DF PixiVfx] playPotionUltimateScene", e);
            try { shakeWrap.destroy({ children: true }); } catch (_) { /* */ }
            return false;
        }
    }

    /**
     * Cometa Estrelar — chuva de meteoros + impactos suaves no tabuleiro (sem cartoon).
     * opts.impacts: Array<[x,y]> em coords de viewport; se vazio, gera pontos no centro.
     */
    async function playCometStarfallScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        const PIXI = global.PIXI;
        const frame = pixiSceneFrame(a, cinematic);
        const unit = cardUnit(1);
        const GOLD = 0xffc050;
        const ORANGE = 0xff7020;
        const WHITE = 0xfff0c8;

        let impacts = Array.isArray(opts.impacts) ? opts.impacts : [];
        if (!impacts.length) {
            const scene = scenePixels();
            const cx = scene.w * 0.5;
            const cy = scene.h * 0.48;
            const n = cinematic ? 7 : 5;
            for (let i = 0; i < n; i++) {
                impacts.push([
                    cx + (Math.random() - 0.5) * scene.w * 0.55,
                    cy + (Math.random() - 0.5) * scene.h * 0.35,
                ]);
            }
        }
        impacts = impacts.map(([x, y]) => {
            const m = frame.map(x, y);
            return [m.x, m.y];
        });

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const root = new PIXI.Container();
        shakeWrap.addChild(root);

        try {
            const skyWash = new PIXI.Graphics();
            skyWash.beginFill(0x100818, 0.45);
            skyWash.drawRect(0, 0, frame.clipW || scenePixels().w, frame.clipH || scenePixels().h);
            skyWash.endFill();
            skyWash.alpha = 0;
            skyWash.eventMode = "none";
            root.addChild(skyWash);

            const stars = [];
            for (let i = 0; i < (cinematic ? 18 : 10); i++) {
                const st = makeEmojiText(PIXI, "⭐", unit * (0.18 + Math.random() * 0.22));
                st.x = Math.random() * (frame.clipW || scenePixels().w);
                st.y = Math.random() * (frame.clipH || scenePixels().h) * 0.45;
                st.alpha = 0;
                root.addChild(st);
                stars.push(st);
            }

            const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
            tl.to(skyWash, { alpha: 1, duration: 0.25 }, 0);
            stars.forEach((st, i) => {
                tl.to(st, { alpha: 0.55 + Math.random() * 0.35, duration: 0.2 }, 0.05 + i * 0.02);
            });

            impacts.forEach((pt, i) => {
                const [tx, ty] = pt;
                const sx = tx + (Math.random() - 0.5) * unit * 2.5;
                const sy = ty - unit * (2.8 + Math.random() * 1.8);
                const t0 = 0.28 + i * 0.14;

                const comet = new PIXI.Container();
                comet.x = sx;
                comet.y = sy;
                comet.alpha = 0;
                root.addChild(comet);

                const head = makeSoftBloom(PIXI, {
                    core: GOLD, spark: ORANGE, flash: WHITE, ring: GOLD,
                }, unit, 0.85);
                comet.addChild(head);

                const glyph = makeEmojiText(PIXI, "☄️", unit * 0.55);
                // MP: meteoros apontados para baixo. Offline: alinhados à trajetória.
                if (global.window?.__DF_ONLINE || opts.meteorsPointDown) {
                    glyph.rotation = Math.PI;
                } else {
                    glyph.rotation = Math.atan2(ty - sy, tx - sx) + Math.PI / 2;
                }
                comet.addChild(glyph);

                const impactBloom = makeSoftBloom(PIXI, {
                    core: ORANGE, spark: GOLD, flash: WHITE, ring: GOLD,
                }, unit, 1.35);
                impactBloom.x = tx;
                impactBloom.y = ty;
                impactBloom.alpha = 0;
                impactBloom.scale.set(0.15);
                root.addChild(impactBloom);

                const ring = new PIXI.Graphics();
                ring.lineStyle(Math.max(1.5, unit * 0.03), GOLD, 0.9);
                ring.drawCircle(0, 0, unit * 0.2);
                ring.x = tx;
                ring.y = ty;
                ring.alpha = 0;
                root.addChild(ring);

                tl.to(comet, { alpha: 1, duration: 0.08 }, t0);
                tl.to(comet, { x: tx, y: ty, duration: 0.38, ease: "power2.in" }, t0);
                tl.to(comet, { alpha: 0, duration: 0.08 }, t0 + 0.36);
                tl.to(impactBloom, { alpha: 1, duration: 0.06 }, t0 + 0.36);
                tl.to(impactBloom.scale, { x: 1.4, y: 1.4, duration: 0.35, ease: "power3.out" }, t0 + 0.36);
                tl.to(impactBloom, { alpha: 0, duration: 0.4 }, t0 + 0.55);
                tl.to(ring, { alpha: 1, duration: 0.05 }, t0 + 0.36);
                tl.to(ring.scale, { x: 4.5, y: 4.5, duration: 0.45, ease: "power2.out" }, t0 + 0.36);
                tl.to(ring, { alpha: 0, duration: 0.3 }, t0 + 0.55);
            });

            const endT = 0.28 + impacts.length * 0.14 + 0.7
                + ((global.window?.__DF_ONLINE || opts.extendMs) ? 0.5 : 0);
            if (cinematic) {
                tl.to(shakeWrap, { x: "+=7", duration: 0.04, yoyo: true, repeat: 8 }, 0.5);
            }
            tl.to(skyWash, { alpha: 0, duration: 0.4 }, endT - 0.2);
            stars.forEach((st) => {
                tl.to(st, { alpha: 0, duration: 0.3 }, endT - 0.25);
            });

            const awaitCap = (cinematic ? 2.4 : 1.6)
                + ((global.window?.__DF_ONLINE || opts.extendMs) ? 0.5 : 0);
            await awaitPixiTimeline(tl, shakeWrap, awaitCap);
            sweepOrphanScenes();
            return true;
        } catch (e) {
            console.warn("[DF PixiVfx] playCometStarfallScene", e);
            try { shakeWrap.destroy({ children: true }); } catch (_) { /* */ }
            return false;
        }
    }

    /**
     * Quimera — Envenenar: gosma voa ao alvo, explode, vira poça de ácido; status após a poça.
     */
    async function playPoisonUltimateScene(cx, cy, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playPoisonUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, cinematic);
        const targetM = frame.map(cx, cy);
        cx = targetM.x;
        cy = targetM.y;
        let fromX = opts.fromX ?? cx;
        let fromY = opts.fromY ?? cy;
        if (opts.fromX != null && opts.fromY != null) {
            const fm = frame.map(fromX, fromY);
            fromX = fm.x;
            fromY = fm.y;
        }
        const handOrigin = opts.fromX != null && opts.fromY != null;

        try {
        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 300) : 0);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 1200) : 700);
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 900) : 520);
        const poolMs = opts.poolMs ?? (cinematic ? (gsapT.pool ?? 1300) : 720);
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 450) : 220);
        const unit = cardUnit(1);
        const arcLift = handOrigin
            ? Math.max(unit * 0.5, Math.min(unit * 2.4, Math.abs(fromY - cy) * 0.32 + unit * 0.7))
            : unit * 1.2;
        const apexX = handOrigin ? fromX + (cx - fromX) * 0.46 : cx;
        const apexY = handOrigin ? Math.min(fromY, cy) - arcLift : cy - arcLift;

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        const cinematicWash = cinematic ? makePoisonCinematicWash(PIXI) : null;
        if (cinematicWash) {
            container.addChild(cinematicWash);
            gsap.to(cinematicWash, { alpha: 1, duration: 0.38, ease: "sine.out" });
            gsap.to(cinematicWash, {
                alpha: 0,
                duration: 1.2,
                ease: "power2.out",
                delay: (windupMs + travelMs + impactMs + poolMs * 0.55) / 1000,
            });
        }

        const targetGlow = new PIXI.Graphics();
        targetGlow.beginFill(theme.core, 0.32);
        targetGlow.drawCircle(0, 0, unit * 0.68);
        targetGlow.endFill();
        targetGlow.x = cx;
        targetGlow.y = cy;
        targetGlow.alpha = 0;
        targetGlow.scale.set(0.35);
        container.addChild(targetGlow);

        const groundShadow = new PIXI.Graphics();
        groundShadow.beginFill(0x000000, 0.38);
        groundShadow.drawEllipse(0, 0, unit * 0.52, unit * 0.16);
        groundShadow.endFill();
        groundShadow.x = cx;
        groundShadow.y = cy + unit * 0.1;
        groundShadow.alpha = 0;
        groundShadow.scale.set(0.2);
        container.addChild(groundShadow);

        const slimeWrap = new PIXI.Container();
        slimeWrap.x = handOrigin ? fromX : cx;
        slimeWrap.y = handOrigin ? fromY : (cy - arcLift);
        slimeWrap.alpha = 0;
        container.addChild(slimeWrap);

        const slimeSheet = await sheetTextures(PIXI, "poison_slime_proj");
        let slimeVisual;
        if (slimeSheet?.frames?.length) {
            slimeVisual = new PIXI.AnimatedSprite(slimeSheet.frames);
            slimeVisual.anchor.set(0.5);
            slimeVisual.animationSpeed = cinematic ? 0.42 : 0.28;
            slimeVisual.play();
            const sc = sheetScale(unit, slimeSheet.meta.size, cinematic ? 2.6 : 1.5);
            slimeVisual.scale.set(sc);
            slimeWrap.addChild(slimeVisual);
        } else {
            slimeVisual = makeSlimeBlob(PIXI, unit, cinematic ? 1.15 : 0.85);
            slimeWrap.addChild(slimeVisual);
        }

        const trailContainer = new PIXI.Container();
        container.addChild(trailContainer);

        const impactRoot = new PIXI.Container();
        impactRoot.x = cx;
        impactRoot.y = cy;
        impactRoot.visible = false;
        container.addChild(impactRoot);

        const procExpl = buildPoisonExplosion(PIXI, theme, unit);
        procExpl.root.alpha = 0;
        impactRoot.addChild(procExpl.root);

        const splatSheet = await sheetTextures(PIXI, "poison_slime_splat");
        let splatSprite = null;
        if (splatSheet?.frames?.length) {
            splatSprite = new PIXI.AnimatedSprite(splatSheet.frames);
            splatSprite.anchor.set(0.5);
            splatSprite.loop = false;
            const splSc = sheetScale(unit, splatSheet.meta.size, cinematic ? 3.2 : 1.8);
            splatSprite.scale.set(splSc * 0.12);
            splatSprite.alpha = 0;
            impactRoot.addChild(splatSprite);
        }

        const impactBloom = makeSoftBloom(PIXI, theme, unit, cinematic ? 1.35 : 0.85);
        impactBloom.alpha = 0;
        impactRoot.addChild(impactBloom);

        const acidPool = makeAcidPool(PIXI, unit);
        acidPool.root.x = cx;
        acidPool.root.y = cy + unit * 0.14;
        acidPool.root.visible = false;
        container.addChild(acidPool.root);

        const splashParts = [];
        const splashN = n(cinematic ? 22 : 10);
        for (let i = 0; i < splashN; i++) {
            const sp = makeSlimeBlob(PIXI, unit, 0.35 + Math.random() * 0.25);
            sp.visible = false;
            container.addChild(sp);
            splashParts.push({ g: sp, vx: 0, vy: 0, vr: 0 });
        }

        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const poolDur = poolMs / 1000;
        const lingerDur = lingerMs / 1000;
        const travelProxy = { p: 0 };
        const baseSlimeScale = slimeVisual.scale?.x ?? 1;

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        if (windupDur > 0) {
            tl.to(targetGlow, { alpha: 0.6, duration: windupDur * 0.55, ease: "sine.out" }, 0);
            tl.to(targetGlow.scale, { x: 0.9, y: 0.9, duration: windupDur, ease: "sine.inOut" }, 0);
        }

        const travelStart = windupDur;
        tl.to(slimeWrap, { alpha: 1, duration: 0.16 }, travelStart);
        tl.to(travelProxy, {
            p: 1,
            duration: travelDur,
            ease: "power1.in",
            onUpdate: () => {
                const t = travelProxy.p;
                const easeT = t * t * (3 - 2 * t);
                const u = 1 - easeT;
                slimeWrap.x = u * u * fromX + 2 * u * easeT * apexX + easeT * easeT * cx;
                slimeWrap.y = u * u * fromY + 2 * u * easeT * apexY + easeT * easeT * cy;
                slimeWrap.rotation = Math.sin(t * Math.PI * 2.2) * 0.18;
                const wobble = 1 + Math.sin(t * Math.PI * 5) * 0.08;
                if (slimeVisual.scale) slimeVisual.scale.set(baseSlimeScale * wobble * (0.85 + t * 0.35));
                groundShadow.alpha = Math.min(0.58, t * 0.72);
                groundShadow.scale.set(0.2 + t * 1.28, 0.2 + t * 0.95);
                targetGlow.alpha = 0.3 + t * 0.5;
                targetGlow.scale.set(0.35 + t * 1.05);

                if (t > 0.05 && Math.random() < (cinematic ? 0.72 : 0.38)) {
                    const tr = new PIXI.Graphics();
                    tr.beginFill(0x55cc44, 0.42);
                    tr.drawCircle(0, 0, unit * (0.04 + Math.random() * 0.06));
                    tr.endFill();
                    tr.x = slimeWrap.x + (Math.random() - 0.5) * unit * 0.3;
                    tr.y = slimeWrap.y + unit * 0.2;
                    trailContainer.addChild(tr);
                    gsap.to(tr, {
                        alpha: 0,
                        x: tr.x + (Math.random() - 0.5) * unit * 0.5,
                        y: tr.y + unit * (0.3 + Math.random() * 0.5),
                        scale: { x: 1.6, y: 1.6 },
                        duration: 0.5 + Math.random() * 0.35,
                        ease: "power1.out",
                        onComplete: () => { try { tr.destroy(); } catch (e) { /* */ } },
                    });
                }
            },
        }, travelStart + 0.02);

        const impactAt = travelStart + 0.02 + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            slimeWrap.visible = false;
            impactRoot.visible = true;
            if (typeof opts.onImpact === "function") opts.onImpact();
        }, "impact");

        tl.to(procExpl.root, { alpha: 1, duration: 0.04 }, "impact");
        tl.to({}, {
            duration: impactDur * 0.65,
            onUpdate() {
                const prog = this.progress();
                const fi = Math.min(procExpl.frameCount - 1, Math.floor(prog * procExpl.frameCount));
                procExpl.frames.forEach((fr, idx) => {
                    fr.visible = idx === fi;
                    fr.alpha = idx === fi ? 1 : 0;
                });
            },
        }, "impact");
        tl.to(procExpl.root, { alpha: 0, duration: impactDur * 0.35 }, `impact+=${impactDur * 0.5}`);

        if (splatSprite) {
            const peakSc = sheetScale(unit, splatSheet.meta.size, cinematic ? 3.2 : 1.8);
            tl.to(splatSprite, { alpha: 1, duration: 0.05 }, "impact");
            tl.to(splatSprite.scale, {
                x: peakSc, y: peakSc, duration: impactDur * 0.5, ease: "power3.out",
            }, "impact");
            tl.to(splatSprite, { alpha: 0, duration: impactDur * 0.35 }, `impact+=${impactDur * 0.42}`);
        }

        tl.to(impactBloom, { alpha: 0.85, duration: 0.05 }, "impact");
        tl.to(impactBloom.scale, { x: 1.35, y: 1.35, duration: impactDur * 0.28, ease: "power2.out" }, "impact");
        tl.to(impactBloom, { alpha: 0, duration: impactDur * 0.32 }, `impact+=${impactDur * 0.12}`);

        const splashProxy = { t: 0 };
        tl.add(() => {
            splashParts.forEach((p, i) => {
                const ang = (Math.PI * 2 * i) / splashParts.length + (Math.random() - 0.5) * 0.5;
                const spd = (cinematic ? 5 : 3) + Math.random() * (cinematic ? 8 : 4);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - (cinematic ? 3 : 1.5);
                p.vr = (Math.random() - 0.5) * 0.25;
                p.g.visible = true;
                p.g.x = cx;
                p.g.y = cy;
                p.g.alpha = 1;
            });
        }, "impact");
        tl.to(splashProxy, {
            t: 1,
            duration: impactDur * 0.55,
            ease: "power2.out",
            onUpdate: () => {
                splashParts.forEach((p) => {
                    p.g.x += p.vx;
                    p.g.y += p.vy;
                    p.vy += 0.14;
                    p.vx *= 0.96;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - splashProxy.t * 1.2);
                });
            },
        }, "impact");

        tl.to(shakeWrap.scale, {
            x: cinematic ? 1.04 : 1.025, y: cinematic ? 1.04 : 1.025,
            duration: 0.05, ease: "power2.out",
        }, "impact");
        tl.to(shakeWrap.scale, { x: 1, y: 1, duration: 0.32, ease: "power2.out" }, `impact+=0.05`);

        const poolAt = impactAt + impactDur * 0.42;
        tl.addLabel("pool", poolAt);
        tl.add(() => { acidPool.root.visible = true; }, "pool");
        tl.to(acidPool.root, { alpha: 1, duration: 0.12 }, "pool");
        tl.to(acidPool.root.scale, {
            x: 1, y: 1, duration: poolDur * 0.55, ease: "elastic.out(1, 0.55)",
        }, "pool");
        acidPool.bubbles.forEach((b, i) => {
            tl.to(b, {
                alpha: 0.85,
                y: b.y - unit * (0.12 + Math.random() * 0.22),
                duration: 0.35 + Math.random() * 0.25,
                ease: "sine.out",
            }, `pool+=${0.08 + i * 0.05}`);
            tl.to(b, { alpha: 0, duration: 0.28, ease: "sine.in" }, `pool+=${poolDur * 0.35 + i * 0.04}`);
        });

        const statusAt = poolAt + poolDur * 0.82;
        tl.add(() => {
            if (typeof opts.onStatusReveal === "function") opts.onStatusReveal();
        }, statusAt);

        tl.to(acidPool.root, { alpha: 0, duration: lingerDur * 0.75, ease: "power2.in" }, statusAt);
        tl.to(targetGlow, { alpha: 0, duration: lingerDur * 0.5 }, statusAt);
        tl.to(groundShadow, { alpha: 0, duration: lingerDur * 0.45 }, statusAt);

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            frame.end();
        }
    }

    /**
     * Violência — Sobrecarga de Guerra: espadas fortalecem todos os aliados (VFX profissional).
     */
    async function playWarUltimateScene(recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playWarUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, !!cinematic);
        let targets = opts.targets || [];
        if (!targets.length && opts.cx != null && opts.cy != null) {
            targets = [{ x: opts.cx, y: opts.cy }];
        }
        if (!targets.length) {
            frame.end();
            return false;
        }

        const mapped = targets.map((t) => {
            const m = frame.map(t.x, t.y);
            return { x: m.x, y: m.y, targetP: t.targetP, targetI: t.targetI };
        });

        try {
            const PIXI = global.PIXI;
            const theme = themeFromRecipe(recipe);
            if (recipe?.hue != null) theme.hue = recipe.hue;
            const gsapT = recipe?.gsapTimings || {};
            const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 420) : 260);
            const staggerMs = opts.staggerMs ?? (recipe?.timings?.stagger ?? 380);
            const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 680) : 420);
            const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 380) : 200);
            const unit = cardUnit(1);
            const sp = scenePixels();

            const shakeWrap = new PIXI.Container();
            a.stage.addChild(shakeWrap);
            const container = new PIXI.Container();
            shakeWrap.addChild(container);

            if (cinematic) {
                const wash = new PIXI.Graphics();
                wash.beginFill(0x0a0018, 0.62);
                wash.drawRect(0, 0, sp.w, sp.h);
                wash.endFill();
                wash.alpha = 0;
                container.addChild(wash);
                const vignette = makeEdgeVignette(PIXI, 0.35);
                vignette.alpha = 0;
                container.addChild(vignette);
                const fadeOutAt = (windupMs + mapped.length * staggerMs + impactMs + lingerMs * 0.5) / 1000;
                gsap.to(wash, { alpha: 1, duration: 0.32, ease: "sine.out" });
                gsap.to(vignette, { alpha: 1, duration: 0.38, ease: "sine.out" });
                gsap.to(wash, { alpha: 0, duration: 0.45, ease: "sine.in", delay: fadeOutAt });
                gsap.to(vignette, { alpha: 0, duration: 0.5, ease: "sine.in", delay: fadeOutAt - 0.05 });
            }

            const tl = await gsapBridge.createTimeline();
            if (!tl) return false;

            const windupDur = windupMs / 1000;
            const staggerDur = Math.max(0.38, staggerMs / 1000);
            const impactDur = impactMs / 1000;

            if (windupDur > 0) {
                const centerGlow = makeSoftBloom(PIXI, theme, unit, 1.8);
                centerGlow.x = sp.w / 2;
                centerGlow.y = sp.h * 0.38;
                centerGlow.alpha = 0;
                container.addChild(centerGlow);
                tl.to(centerGlow, { alpha: 0.75, duration: windupDur * 0.5, ease: "sine.out" }, 0);
                tl.to(centerGlow.scale, { x: 2.2, y: 2.2, duration: windupDur, ease: "power2.out" }, 0);
                tl.to(centerGlow, { alpha: 0, duration: windupDur * 0.4, ease: "sine.in" }, windupDur * 0.55);
            }

            mapped.forEach((tgt, idx) => {
                const at = windupDur + idx * staggerDur;
                tl.add(() => {
                    const swordWrap = new PIXI.Container();
                    const bladeTrail = makeSoftBloom(PIXI, theme, unit, 0.9);
                    bladeTrail.alpha = 0.55;
                    swordWrap.addChild(bladeTrail);
                    const sword = new PIXI.Text("⚔️", {
                        fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
                        fontSize: Math.round(unit * (cinematic ? 2.1 : 1.5)),
                    });
                    sword.anchor.set(0.5, 0.85);
                    swordWrap.addChild(sword);
                    swordWrap.x = tgt.x;
                    swordWrap.y = Math.max(40, tgt.y - unit * 5.5);
                    swordWrap.alpha = 0;
                    swordWrap.scale.set(0.5);
                    container.addChild(swordWrap);

                    gsap.to(swordWrap, {
                        y: tgt.y - unit * 0.15,
                        alpha: 1,
                        duration: impactDur * 0.55,
                        ease: "power3.in",
                    });
                    gsap.to(swordWrap.scale, {
                        x: 1.25, y: 1.25,
                        duration: impactDur * 0.55,
                        ease: "power2.out",
                    });
                    gsap.to(swordWrap, {
                        duration: impactDur * 0.12,
                        delay: impactDur * 0.55,
                        ease: "power4.in",
                        y: tgt.y + unit * 0.08,
                        onComplete: () => {
                            if (typeof opts.onTargetImpact === "function") {
                                try { opts.onTargetImpact(idx, mapped[idx]); } catch (e) { /* */ }
                            }
                            const burst = makeSoftBloom(PIXI, theme, unit, cinematic ? 2.4 : 1.5);
                            burst.x = tgt.x;
                            burst.y = tgt.y;
                            burst.alpha = 0.95;
                            container.addChild(burst);
                            gsap.to(burst.scale, { x: 3.2, y: 3.2, duration: 0.38, ease: "power2.out" });
                            gsap.to(burst, { alpha: 0, duration: 0.42, delay: 0.06 });

                            const ring = new PIXI.Graphics();
                            ring.lineStyle(Math.max(2, unit * 0.05), 0xa060ff, 0.9);
                            ring.drawCircle(0, 0, unit * 0.55);
                            ring.x = tgt.x;
                            ring.y = tgt.y;
                            ring.alpha = 0.85;
                            ring.scale.set(0.4);
                            container.addChild(ring);
                            gsap.to(ring.scale, { x: 2.6, y: 2.6, duration: 0.55, ease: "power2.out" });
                            gsap.to(ring, { alpha: 0, duration: 0.48, delay: 0.12 });

                            const sparkN = n(cinematic ? 16 : 8);
                            for (let si = 0; si < sparkN; si++) {
                                const ang = (si / sparkN) * Math.PI * 2;
                                const spark = makeSoftOrb(PIXI, 0xc080ff, unit * 0.06, 0.8);
                                spark.x = tgt.x;
                                spark.y = tgt.y;
                                container.addChild(spark);
                                gsap.to(spark, {
                                    x: tgt.x + Math.cos(ang) * unit * (0.8 + Math.random() * 0.6),
                                    y: tgt.y + Math.sin(ang) * unit * (0.8 + Math.random() * 0.6),
                                    alpha: 0,
                                    duration: 0.45 + Math.random() * 0.25,
                                    ease: "power2.out",
                                });
                            }

                            const plus = new PIXI.Text("+1", {
                                fontFamily: '"Fredoka", "Trebuchet MS", sans-serif',
                                fontSize: Math.round(unit * 0.55),
                                fill: 0xe8d0ff,
                                fontWeight: "900",
                                stroke: 0x2a0040,
                                strokeThickness: Math.max(3, unit * 0.04),
                            });
                            plus.anchor.set(0.5);
                            plus.x = tgt.x;
                            plus.y = tgt.y - unit * 0.5;
                            plus.alpha = 0;
                            container.addChild(plus);
                            gsap.fromTo(plus, { alpha: 0, y: tgt.y - unit * 0.2 }, {
                                alpha: 1, y: tgt.y - unit * 1.1, duration: 0.55, ease: "power2.out",
                            });
                            gsap.to(plus, { alpha: 0, duration: 0.35, delay: 0.45 });
                            try { swordWrap.destroy({ children: true }); } catch (e) { /* */ }
                        },
                    });
                }, at);
            });

            const totalDur = windupDur + mapped.length * staggerDur + impactDur + lingerMs / 1000;
            tl.add(() => {
                try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            }, totalDur);

            await awaitPixiTimeline(tl, shakeWrap, totalDur + 0.5);
            sweepOrphanScenes();
            return true;
        } finally {
            frame.end();
        }
    }

    /**
     * Valmont — Vampirismo: sangue sai do inimigo e é sugado até o aliado (estilo Hearthstone).
     */
    async function playVampirismUltimateScene(fromX, fromY, toX, toY, recipe, opts = {}) {
        const wants = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || false;
        const cinematic = !!opts.cinematic || wants;
        if (cinematic) {
            setQuality("full");
            global.DfGsapBridge?.setQuality?.("full");
        } else if (!canUse()) {
            return false;
        }

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) {
            console.warn("[DF PixiVfx] playVampirismUltimateScene abort", {
                pixi: !!a, PIXI: !!global.PIXI, gsap: !!gsap,
            });
            return false;
        }

        await global.DfSpriteVfx?.init?.();

        const frame = pixiSceneFrame(a, !!cinematic);
        const fromM = frame.map(fromX, fromY);
        const toM = frame.map(toX, toY);
        fromX = fromM.x;
        fromY = fromM.y;
        toX = toM.x;
        toY = toM.y;

        try {
        const PIXI = global.PIXI;
        const theme = themeFromRecipe(recipe);
        const gsapT = recipe?.gsapTimings || {};
        const windupMs = opts.windupMs ?? (cinematic ? (gsapT.windup ?? 320) : 180);
        const travelMs = opts.travelMs ?? (cinematic ? (gsapT.travel ?? 1300) : 720);
        const impactMs = opts.impactMs ?? (cinematic ? (gsapT.impact ?? 720) : 420);
        const lingerMs = opts.lingerMs ?? (cinematic ? (gsapT.linger ?? 520) : 240);
        const unit = cardUnit(1);

        const p0 = { x: fromX, y: fromY };
        const p2 = { x: toX, y: toY };
        const lift = Math.min(160, Math.max(52, Math.abs(toX - fromX) * 0.22 + 44));
        const p1 = {
            x: (fromX + toX) / 2 + (Math.random() - 0.5) * 32,
            y: Math.min(fromY, toY) - lift,
        };

        const shakeWrap = new PIXI.Container();
        a.stage.addChild(shakeWrap);
        const container = new PIXI.Container();
        shakeWrap.addChild(container);

        const cinematicWash = cinematic ? makeVampCinematicWash(PIXI) : null;
        if (cinematicWash) {
            container.addChild(cinematicWash);
            gsap.to(cinematicWash, { alpha: 1, duration: 0.4, ease: "sine.out" });
            gsap.to(cinematicWash, {
                alpha: 0,
                duration: 1.15,
                ease: "power2.out",
                delay: (windupMs + travelMs + impactMs * 0.5) / 1000,
            });
        }

        const sourceBloom = makeSoftBloom(PIXI, theme, unit, 0.75);
        sourceBloom.x = fromX;
        sourceBloom.y = fromY;
        sourceBloom.alpha = 0;
        container.addChild(sourceBloom);

        const destBloom = makeSoftBloom(PIXI, theme, unit, 0.65);
        destBloom.x = toX;
        destBloom.y = toY;
        destBloom.alpha = 0;
        container.addChild(destBloom);

        const streamGlow = drawBloodArc(PIXI, p0, p1, p2, unit, unit * 0.14, 0x660010, 0.55);
        const streamCore = drawBloodArc(PIXI, p0, p1, p2, unit, unit * 0.06, 0xff2030, 0.92);
        streamGlow.alpha = 0;
        streamCore.alpha = 0;
        container.addChild(streamGlow);
        container.addChild(streamCore);

        const streamHead = new PIXI.Graphics();
        if (PIXI.BLEND_MODES) streamHead.blendMode = PIXI.BLEND_MODES.ADD;
        streamHead.alpha = 0;
        container.addChild(streamHead);

        const sourceBurst = new PIXI.Graphics();
        sourceBurst.beginFill(0xff3040, 0.75);
        sourceBurst.drawCircle(0, 0, unit * 0.22);
        sourceBurst.endFill();
        sourceBurst.x = fromX;
        sourceBurst.y = fromY;
        sourceBurst.alpha = 0;
        sourceBurst.scale.set(0.3);
        if (PIXI.BLEND_MODES) sourceBurst.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(sourceBurst);

        const destBurst = new PIXI.Graphics();
        destBurst.beginFill(0xff4050, 0.7);
        destBurst.drawCircle(0, 0, unit * 0.28);
        destBurst.endFill();
        destBurst.x = toX;
        destBurst.y = toY;
        destBurst.alpha = 0;
        destBurst.scale.set(0.2);
        if (PIXI.BLEND_MODES) destBurst.blendMode = PIXI.BLEND_MODES.ADD;
        container.addChild(destBurst);

        const spurtN = n(cinematic ? 14 : 7);
        const spurts = [];
        for (let i = 0; i < spurtN; i++) {
            const sp = makeBloodDrop(PIXI, unit);
            sp.x = fromX;
            sp.y = fromY;
            sp.alpha = 0;
            container.addChild(sp);
            spurts.push({
                g: sp,
                delay: i * 0.04,
                tOffset: 0.05 + (i / spurtN) * 0.82,
            });
        }

        const bloodEmojiN = n(cinematic ? 10 : 5);
        const bloodEmojis = [];
        for (let i = 0; i < bloodEmojiN; i++) {
            const drop = new PIXI.Text("🩸", {
                fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
                fontSize: Math.round(unit * (0.42 + (i % 3) * 0.08)),
            });
            drop.anchor.set(0.5);
            drop.x = fromX;
            drop.y = fromY;
            drop.alpha = 0;
            drop.visible = false;
            container.addChild(drop);
            bloodEmojis.push({
                g: drop,
                tOffset: 0.08 + (i / bloodEmojiN) * 0.78,
                spin: (Math.random() - 0.5) * 0.8,
            });
        }

        const pelletN = n(cinematic ? 28 : 14);
        const pellets = [];
        for (let i = 0; i < pelletN; i++) {
            const drop = makeBloodDrop(PIXI, unit);
            drop.visible = false;
            container.addChild(drop);
            pellets.push({
                g: drop,
                tOffset: (i / pelletN) * 0.75,
                wobble: (Math.random() - 0.5) * unit * 0.12,
            });
        }

        const streamProxy = { t: 0 };
        const windupDur = windupMs / 1000;
        const travelDur = travelMs / 1000;
        const impactDur = impactMs / 1000;
        const lingerDur = lingerMs / 1000;

        const tl = await gsapBridge.createTimeline();
        if (!tl) {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
            return false;
        }

        if (windupDur > 0) {
            tl.to(sourceBloom, { alpha: 0.75, duration: windupDur * 0.55, ease: "sine.out" }, 0);
            tl.to(sourceBloom.scale, { x: 1.1, y: 1.1, duration: windupDur, ease: "sine.inOut" }, 0);
            tl.to(sourceBurst, { alpha: 0.9, duration: windupDur * 0.4, ease: "power2.out" }, 0);
            tl.to(sourceBurst.scale, { x: 1.2, y: 1.2, duration: windupDur, ease: "elastic.out(1, 0.6)" }, 0);
        }

        const travelStart = windupDur;
        tl.addLabel("travel", travelStart);
        tl.to(streamGlow, { alpha: 0.7, duration: 0.18 }, "travel");
        tl.to(streamCore, { alpha: 1, duration: 0.14 }, "travel");
        tl.to(streamHead, { alpha: 1, duration: 0.12 }, "travel");

        tl.to(streamProxy, {
            t: 1,
            duration: travelDur,
            ease: "power1.inOut",
            onUpdate: () => {
                const headT = Math.min(1, streamProxy.t);
                const headPt = quadBezier(p0, p1, p2, headT);
                streamHead.clear();
                streamHead.beginFill(0xff5050, 0.9);
                streamHead.drawCircle(headPt.x, headPt.y, unit * 0.09);
                streamHead.endFill();
                streamHead.beginFill(0xffffff, 0.45);
                streamHead.drawCircle(headPt.x, headPt.y, unit * 0.04);
                streamHead.endFill();

                spurts.forEach((sp) => {
                    const localT = Math.max(0, Math.min(1, (streamProxy.t - sp.delay) * 1.15));
                    if (localT <= 0) { sp.g.alpha = 0; return; }
                    const pt = quadBezier(p0, p1, p2, localT);
                    const ang = Math.atan2(
                        quadBezier(p0, p1, p2, Math.min(1, localT + 0.02)).y - pt.y,
                        quadBezier(p0, p1, p2, Math.min(1, localT + 0.02)).x - pt.x,
                    );
                    sp.g.x = pt.x + Math.cos(ang + Math.PI / 2) * unit * 0.08;
                    sp.g.y = pt.y + Math.sin(ang + Math.PI / 2) * unit * 0.08;
                    sp.g.alpha = Math.min(1, localT * 2) * (1 - localT * 0.35);
                    sp.g.rotation = ang;
                });

                pellets.forEach((p) => {
                    const localT = (streamProxy.t - p.tOffset * 0.3) / 0.92;
                    if (localT < 0 || localT > 1) { p.g.visible = false; return; }
                    const pt = quadBezier(p0, p1, p2, localT);
                    p.g.visible = true;
                    p.g.x = pt.x + p.wobble * Math.sin(localT * Math.PI * 4);
                    p.g.y = pt.y + p.wobble * Math.cos(localT * Math.PI * 3);
                    p.g.alpha = 0.55 + Math.sin(localT * Math.PI) * 0.45;
                });

                bloodEmojis.forEach((be) => {
                    const localT = (streamProxy.t - be.tOffset * 0.25) / 0.88;
                    if (localT < 0 || localT > 1) { be.g.visible = false; return; }
                    const pt = quadBezier(p0, p1, p2, localT);
                    be.g.visible = true;
                    be.g.x = pt.x + Math.sin(localT * Math.PI * 5) * unit * 0.06;
                    be.g.y = pt.y + Math.cos(localT * Math.PI * 4) * unit * 0.05;
                    be.g.rotation = be.spin + localT * Math.PI * 2;
                    be.g.alpha = 0.65 + Math.sin(localT * Math.PI) * 0.35;
                });
            },
        }, "travel");

        const impactAt = travelStart + travelDur;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            if (typeof opts.onImpact === "function") opts.onImpact();
            for (let vi = 0; vi < (cinematic ? 3 : 2); vi++) {
                const pulse = makeSoftBloom(PIXI, theme, unit, 0.55 + vi * 0.15);
                pulse.x = toX; pulse.y = toY;
                pulse.alpha = 0.85;
                container.addChild(pulse);
                gsap.to(pulse.scale, { x: 1.8 + vi * 0.2, y: 1.8 + vi * 0.2, duration: 0.45, ease: "power2.out" });
                gsap.to(pulse, { alpha: 0, duration: 0.5, delay: 0.08, onComplete: () => { try { pulse.destroy(); } catch (e) { /* */ } } });
            }
        }, "impact");

        tl.to(destBloom, { alpha: 0.85, duration: 0.1, ease: "power2.out" }, "impact");
        tl.to(destBloom.scale, { x: 1.25, y: 1.25, duration: impactDur * 0.45, ease: "elastic.out(1, 0.5)" }, "impact");
        tl.to(destBurst, { alpha: 1, duration: 0.06 }, "impact");
        tl.to(destBurst.scale, { x: 1.5, y: 1.5, duration: impactDur * 0.35, ease: "power2.out" }, "impact");
        tl.to(destBurst, { alpha: 0, duration: impactDur * 0.4 }, `impact+=${impactDur * 0.2}`);

        tl.to(sourceBurst, { alpha: 0.35, duration: impactDur * 0.3 }, "impact");
        tl.to(streamCore, { alpha: 0.25, duration: impactDur * 0.55 }, "impact");
        tl.to(streamGlow, { alpha: 0, duration: impactDur * 0.45 }, "impact");
        tl.to(streamHead, { alpha: 0, duration: impactDur * 0.4 }, "impact");

        const absorbProxy = { t: 0 };
        tl.to(absorbProxy, {
            t: 1,
            duration: impactDur * 0.65,
            ease: "power2.in",
            onUpdate: () => {
                pellets.forEach((p) => {
                    if (!p.g.visible) return;
                    p.g.x += (toX - p.g.x) * 0.08;
                    p.g.y += (toY - p.g.y) * 0.08;
                    p.g.alpha = Math.max(0, 1 - absorbProxy.t);
                });
            },
        }, "impact");

        tl.to(shakeWrap, {
            x: unit * 0.08,
            duration: 0.04,
            yoyo: true,
            repeat: 4,
            ease: "power1.inOut",
        }, "impact");

        tl.to(destBloom, { alpha: 0, duration: lingerDur * 0.7, ease: "power2.in" }, `impact+=${impactDur * 0.35}`);
        tl.to(sourceBloom, { alpha: 0, duration: lingerDur * 0.55 }, `impact+=${impactDur * 0.3}`);

        tl.add(() => {
            try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ }
        });

        await awaitPixiTimeline(tl, shakeWrap, 4.5);
        sweepOrphanScenes();
        return true;
        } finally {
            frame.end();
        }
    }

    /* ============================================================
     * BUILDERS CARTOON adicionais — dragão, gancho, presas, caveira.
     * ============================================================ */

    /** Cabeça de dragão cartoon (focinho/maw apontando para baixo, +y). */
    function makeToonDragonHead(PIXI, unit, fire) {
        const root = new PIXI.Container();
        const body = fire ? 0x9a2d18 : 0x205a7a;
        const bodyHi = fire ? 0xd1492a : 0x3f86b8;
        const horn = fire ? 0xf0d8b0 : 0xdceff7;
        const eye = fire ? 0xffd23f : 0x9fe9ff;
        const outline = fire ? 0x2a0c04 : 0x0a2230;
        const ow = Math.max(2.5, unit * 0.06);

        const horns = new PIXI.Graphics();
        horns.lineStyle(ow, outline, 1);
        [-1, 1].forEach((s) => {
            horns.beginFill(horn, 1);
            horns.moveTo(s * unit * 0.5, -unit * 0.55);
            horns.lineTo(s * unit * 0.9, -unit * 1.18);
            horns.lineTo(s * unit * 0.98, -unit * 0.92);
            horns.lineTo(s * unit * 0.64, -unit * 0.4);
            horns.closePath();
            horns.endFill();
        });
        root.addChild(horns);

        const skull = new PIXI.Graphics();
        skull.lineStyle(ow, outline, 1);
        skull.beginFill(body, 1);
        skull.drawEllipse(0, -unit * 0.18, unit * 0.94, unit * 0.74);
        skull.endFill();
        skull.beginFill(bodyHi, 0.55);
        skull.drawEllipse(-unit * 0.2, -unit * 0.36, unit * 0.5, unit * 0.32);
        skull.endFill();
        root.addChild(skull);

        const snout = new PIXI.Graphics();
        snout.lineStyle(ow, outline, 1);
        snout.beginFill(body, 1);
        snout.moveTo(-unit * 0.7, unit * 0.08);
        snout.quadraticCurveTo(-unit * 0.5, unit * 0.52, 0, unit * 0.56);
        snout.quadraticCurveTo(unit * 0.5, unit * 0.52, unit * 0.7, unit * 0.08);
        snout.lineTo(unit * 0.55, -unit * 0.06);
        snout.lineTo(-unit * 0.55, -unit * 0.06);
        snout.closePath();
        snout.endFill();
        snout.beginFill(0xfffaf0, 1);
        for (let i = -2; i <= 2; i++) {
            const tx = i * unit * 0.22;
            snout.drawPolygon([tx - unit * 0.06, unit * 0.48, tx + unit * 0.06, unit * 0.48, tx, unit * 0.6]);
        }
        snout.endFill();
        snout.beginFill(outline, 0.85);
        snout.drawEllipse(-unit * 0.22, unit * 0.16, unit * 0.06, unit * 0.09);
        snout.drawEllipse(unit * 0.22, unit * 0.16, unit * 0.06, unit * 0.09);
        snout.endFill();
        root.addChild(snout);

        const jaw = new PIXI.Container();
        jaw.x = 0; jaw.y = unit * 0.48;
        const jawG = new PIXI.Graphics();
        jawG.lineStyle(ow, outline, 1);
        jawG.beginFill(fire ? 0x7a2010 : 0x163f57, 1);
        jawG.moveTo(-unit * 0.5, 0);
        jawG.quadraticCurveTo(-unit * 0.32, unit * 0.42, 0, unit * 0.46);
        jawG.quadraticCurveTo(unit * 0.32, unit * 0.42, unit * 0.5, 0);
        jawG.closePath();
        jawG.endFill();
        jawG.beginFill(0xfffaf0, 1);
        for (let i = -1; i <= 1; i++) {
            const tx = i * unit * 0.24;
            jawG.drawPolygon([tx - unit * 0.06, unit * 0.04, tx + unit * 0.06, unit * 0.04, tx, -unit * 0.08]);
        }
        jawG.endFill();
        jaw.addChild(jawG);
        root.addChild(jaw);

        const eyes = new PIXI.Graphics();
        [-1, 1].forEach((s) => {
            eyes.lineStyle(ow * 0.7, outline, 1);
            eyes.beginFill(0xfff7e0, 1);
            eyes.drawEllipse(s * unit * 0.34, -unit * 0.36, unit * 0.2, unit * 0.16);
            eyes.endFill();
            eyes.lineStyle(0);
            eyes.beginFill(eye, 1);
            eyes.drawCircle(s * unit * 0.38, -unit * 0.36, unit * 0.09);
            eyes.endFill();
            eyes.beginFill(outline, 1);
            eyes.drawCircle(s * unit * 0.4, -unit * 0.36, unit * 0.04);
            eyes.endFill();
        });
        root.addChild(eyes);

        return { root, jaw };
    }

    function makeSoftOrb(PIXI, color, radius, alpha = 0.85) {
        const g = new PIXI.Graphics();
        g.beginFill(color, alpha);
        g.drawCircle(0, 0, radius);
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    function breathModeKey(mode) {
        const m = String(mode || "ice").toLowerCase();
        if (m === "fire" || m === "burn") return "fire";
        if (m === "poison" || m === "venom") return "poison";
        return "ice";
    }

    function breathPalette(key) {
        if (key === "fire") return { outer: 0xff4a12, mid: 0xffa040, core: 0xfff0c8, vignette: 0.38, theme: { hue: 18 } };
        if (key === "poison") return { outer: 0x3ae84a, mid: 0x88ff66, core: 0xe8ffd0, vignette: 0.32, theme: { hue: 96 } };
        return { outer: 0x4ab8ff, mid: 0xb8eeff, core: 0xffffff, vignette: 0.34, theme: { hue: 200 } };
    }

    function makeBreathPuffCluster(PIXI, unit, palette) {
        const root = new PIXI.Container();
        const outline = palette.outer;
        const puffN = 7;
        for (let i = 0; i < puffN; i++) {
            const g = new PIXI.Graphics();
            const r = unit * (0.14 + Math.random() * 0.2);
            const px = (Math.random() - 0.5) * unit * 0.72;
            const py = unit * (0.02 + Math.random() * 0.28);
            g.lineStyle(Math.max(1.5, unit * 0.028), outline, 0.85);
            g.beginFill(i % 2 ? palette.mid : palette.core, 0.72);
            g.drawCircle(px, py, r);
            g.endFill();
            g.beginFill(0xffffff, 0.22);
            g.drawCircle(px - r * 0.28, py - r * 0.32, r * 0.38);
            g.endFill();
            root.addChild(g);
        }
        return root;
    }

    function makeCinematicMaw(PIXI, unit, palette) {
        const root = new PIXI.Container();
        const puffBase = makeBreathPuffCluster(PIXI, unit, palette);
        root.addChild(puffBase);
        const aura = makeSoftBloom(PIXI, palette.theme, unit, 1.6);
        aura.alpha = 0.42;
        root.addChild(aura);
        const mouth = new PIXI.Graphics();
        mouth.lineStyle(Math.max(2, unit * 0.03), palette.outer, 0.9);
        mouth.beginFill(0x0a0818, 0.55);
        mouth.drawEllipse(0, unit * 0.1, unit * 0.34, unit * 0.16);
        mouth.endFill();
        mouth.beginFill(palette.core, 0.45);
        mouth.drawEllipse(0, unit * 0.08, unit * 0.18, unit * 0.08);
        mouth.endFill();
        if (PIXI.BLEND_MODES) mouth.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(mouth);
        return { root, mouth, puffBase };
    }

    function makeFrostShell(PIXI, unit, theme) {
        const root = new PIXI.Container();
        [1.45, 1.1, 0.82].forEach((sc, i) => {
            const b = makeSoftBloom(PIXI, theme, unit, sc);
            b.alpha = 0.32 + i * 0.16;
            root.addChild(b);
        });
        const rim = new PIXI.Graphics();
        rim.beginFill(0xd9f7ff, 0.28);
        rim.drawEllipse(0, 0, unit * 1.02, unit * 0.9);
        rim.beginFill(0xffffff, 0.18);
        rim.drawEllipse(0, 0, unit * 0.7, unit * 0.62);
        rim.endFill();
        if (PIXI.BLEND_MODES) rim.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(rim);
        root.alpha = 0;
        root.scale.set(0.32);
        return root;
    }

    function makeHeatShell(PIXI, unit, theme) {
        const root = new PIXI.Container();
        [1.5, 1.12, 0.84].forEach((sc, i) => {
            const b = makeSoftBloom(PIXI, theme, unit, sc);
            b.alpha = 0.34 + i * 0.18;
            root.addChild(b);
        });
        const rim = new PIXI.Graphics();
        rim.beginFill(0xff9040, 0.35);
        rim.drawEllipse(0, 0, unit * 1.04, unit * 0.92);
        rim.beginFill(0xfff0c0, 0.22);
        rim.drawEllipse(0, 0, unit * 0.72, unit * 0.64);
        rim.endFill();
        if (PIXI.BLEND_MODES) rim.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(rim);
        root.alpha = 0;
        root.scale.set(0.3);
        return root;
    }

    function makeVenomShell(PIXI, unit, theme) {
        const root = new PIXI.Container();
        [1.42, 1.08, 0.8].forEach((sc, i) => {
            const b = makeSoftBloom(PIXI, theme, unit, sc);
            b.alpha = 0.3 + i * 0.17;
            root.addChild(b);
        });
        const drip = new PIXI.Graphics();
        drip.beginFill(0x4ae84a, 0.4);
        drip.drawEllipse(0, unit * 0.12, unit * 0.88, unit * 0.28);
        drip.endFill();
        if (PIXI.BLEND_MODES) drip.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(drip);
        root.alpha = 0;
        root.scale.set(0.3);
        return root;
    }

    /** Cone de baforada (fogo, gelo ou veneno) — pivô no topo (boca), abre para +y. */
    function makeBreathCone(PIXI, unit, len, halfW, modeOrFire) {
        const key = typeof modeOrFire === "boolean" ? (modeOrFire ? "fire" : "ice") : breathModeKey(modeOrFire);
        const pal = breathPalette(key);
        const outlineCol = key === "fire" ? 0xff3a10 : key === "poison" ? 0x1a6b12 : 0x2a8fd8;
        const ow = Math.max(2, unit * 0.034);
        const c = new PIXI.Container();
        const layer = (col, alpha, w, l, yoff, wobble, withOutline) => {
            const g = new PIXI.Graphics();
            const steps = key === "ice" ? 5 : 7;
            const pts = [];
            pts.push([0, yoff]);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const wx = w * (0.22 + t * 0.78) + Math.sin(t * Math.PI * (wobble || 1)) * w * 0.06;
                const ly = yoff + l * t;
                const sx = (i % 2 === 0 ? -1 : 1) * wx;
                pts.push([sx, ly]);
            }
            if (withOutline) {
                g.lineStyle(ow, outlineCol, 0.92);
                g.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
                g.lineTo(pts[0][0], pts[0][1]);
            }
            g.beginFill(col, alpha);
            g.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
            g.lineTo(pts[0][0], pts[0][1]);
            g.endFill();
            if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
            return g;
        };
        c.addChild(layer(pal.outer, key === "ice" ? 0.55 : 0.48, halfW * 1.1, len, 0, 2, true));
        c.addChild(layer(pal.mid, key === "ice" ? 0.68 : 0.62, halfW * 0.76, len * 0.97, unit * 0.04, 3, false));
        c.addChild(layer(pal.core, key === "ice" ? 0.9 : 0.82, halfW * 0.42, len * 0.92, unit * 0.08, 4, false));
        if (key === "fire") {
            c.addChild(layer(0xfff8e0, 0.75, halfW * 0.24, len * 0.86, unit * 0.12, 5, false));
        }
        if (key === "poison") {
            c.addChild(layer(0xd8ffb8, 0.65, halfW * 0.26, len * 0.88, unit * 0.1, 5, false));
        }
        if (key === "ice") {
            c.addChild(layer(0xffffff, 0.7, halfW * 0.2, len * 0.84, unit * 0.12, 5, false));
        }
        return c;
    }

    /** Gancho/âncora cartoon (argola no topo, ponta curva embaixo). */
    function makeToonHook(PIXI, unit) {
        const c = new PIXI.Container();
        const metal = 0xc7d0d8; const metalHi = 0xeef3f7; const outline = 0x26323c;
        const ow = Math.max(2.5, unit * 0.06);
        const shaft = new PIXI.Graphics();
        shaft.lineStyle(ow, outline, 1);
        shaft.beginFill(metal, 1);
        shaft.drawRoundedRect(-unit * 0.08, -unit * 0.52, unit * 0.16, unit * 0.72, unit * 0.05);
        shaft.endFill();
        shaft.lineStyle(ow, outline, 1);
        shaft.beginFill(0x000000, 0);
        shaft.drawCircle(0, -unit * 0.58, unit * 0.13);
        shaft.endFill();
        c.addChild(shaft);
        const hook = new PIXI.Graphics();
        hook.lineStyle(ow * 1.5, outline, 1);
        hook.moveTo(0, unit * 0.18);
        hook.quadraticCurveTo(unit * 0.04, unit * 0.58, -unit * 0.36, unit * 0.54);
        hook.quadraticCurveTo(-unit * 0.64, unit * 0.48, -unit * 0.44, unit * 0.18);
        c.addChild(hook);
        const hookHi = new PIXI.Graphics();
        hookHi.lineStyle(ow * 0.7, metalHi, 1);
        hookHi.moveTo(0, unit * 0.18);
        hookHi.quadraticCurveTo(unit * 0.04, unit * 0.58, -unit * 0.36, unit * 0.54);
        c.addChild(hookHi);
        const tip = new PIXI.Graphics();
        tip.lineStyle(ow, outline, 1);
        tip.beginFill(metalHi, 1);
        tip.drawPolygon([-unit * 0.44, unit * 0.08, -unit * 0.28, unit * 0.24, -unit * 0.52, unit * 0.28]);
        tip.endFill();
        c.addChild(tip);
        return c;
    }

    /** Dragão Cúbico cartoon (blocos com facetas) — Sangue de Dragão. */
    function makeCubicDragon(PIXI, unit) {
        const root = new PIXI.Container();
        const face = 0x3f8fd0; const top = 0x67b0e6; const side = 0x2a6ba0;
        const outline = 0x0a2238; const eye = 0x9ffcff; const horn = 0xe6f4ff;
        const ow = Math.max(2.5, unit * 0.05);
        const cube = (ccx, ccy, s, depth) => {
            const g = new PIXI.Graphics();
            g.lineStyle(ow, outline, 1);
            g.beginFill(face, 1); g.drawRect(ccx - s / 2, ccy - s / 2, s, s); g.endFill();
            g.beginFill(top, 1);
            g.drawPolygon([ccx - s / 2, ccy - s / 2, ccx - s / 2 + depth, ccy - s / 2 - depth, ccx + s / 2 + depth, ccy - s / 2 - depth, ccx + s / 2, ccy - s / 2]);
            g.endFill();
            g.beginFill(side, 1);
            g.drawPolygon([ccx + s / 2, ccy - s / 2, ccx + s / 2 + depth, ccy - s / 2 - depth, ccx + s / 2 + depth, ccy + s / 2 - depth, ccx + s / 2, ccy + s / 2]);
            g.endFill();
            return g;
        };
        const wings = new PIXI.Graphics();
        wings.lineStyle(ow, outline, 1);
        [-1, 1].forEach((s) => {
            wings.beginFill(side, 0.95);
            wings.drawPolygon([s * unit * 0.5, unit * 0.4, s * unit * 1.55, -unit * 0.25, s * unit * 1.32, unit * 0.95]);
            wings.endFill();
        });
        root.addChild(wings);
        root.addChild(cube(0, unit * 0.9, unit * 1.1, unit * 0.28));
        root.addChild(cube(-unit * 0.1, unit * 0.1, unit * 0.6, unit * 0.2));
        root.addChild(cube(0, -unit * 0.7, unit * 1.0, unit * 0.26));
        root.addChild(cube(unit * 0.52, -unit * 0.5, unit * 0.5, unit * 0.16));
        const horns = new PIXI.Graphics();
        horns.lineStyle(ow, outline, 1);
        [-1, 1].forEach((s) => {
            horns.beginFill(horn, 1);
            horns.drawPolygon([s * unit * 0.25, -unit * 1.1, s * unit * 0.46, -unit * 1.62, s * unit * 0.5, -unit * 1.22]);
            horns.endFill();
        });
        root.addChild(horns);
        const eyes = new PIXI.Graphics();
        eyes.beginFill(eye, 1);
        eyes.drawRect(unit * 0.04, -unit * 0.86, unit * 0.16, unit * 0.16);
        eyes.drawRect(unit * 0.4, -unit * 0.66, unit * 0.12, unit * 0.13);
        eyes.endFill();
        if (PIXI.BLEND_MODES) eyes.blendMode = PIXI.BLEND_MODES.ADD;
        root.addChild(eyes);
        return root;
    }

    /** Adaga cartoon (lâmina + guarda + cabo) apontando para +y. */
    function makeToonDagger(PIXI, unit) {
        const c = new PIXI.Container();
        const steel = 0xdfe7ee; const steelDk = 0x9aa7b2; const outline = 0x1c2730;
        const grip = 0x6a2a18; const gold = 0xf2c14e;
        const ow = Math.max(2.5, unit * 0.05);
        const blade = new PIXI.Graphics();
        blade.lineStyle(ow, outline, 1);
        blade.beginFill(steel, 1);
        blade.moveTo(-unit * 0.16, -unit * 0.1);
        blade.lineTo(unit * 0.16, -unit * 0.1);
        blade.lineTo(unit * 0.06, unit * 1.0);
        blade.lineTo(0, unit * 1.16);
        blade.lineTo(-unit * 0.06, unit * 1.0);
        blade.closePath();
        blade.endFill();
        blade.beginFill(steelDk, 0.7);
        blade.drawPolygon([unit * 0.02, -unit * 0.05, unit * 0.1, -unit * 0.05, unit * 0.03, unit * 0.95]);
        blade.endFill();
        c.addChild(blade);
        const guard = new PIXI.Graphics();
        guard.lineStyle(ow, outline, 1);
        guard.beginFill(gold, 1);
        guard.drawRoundedRect(-unit * 0.42, -unit * 0.22, unit * 0.84, unit * 0.16, unit * 0.06);
        guard.endFill();
        c.addChild(guard);
        const handle = new PIXI.Graphics();
        handle.lineStyle(ow, outline, 1);
        handle.beginFill(grip, 1);
        handle.drawRoundedRect(-unit * 0.1, -unit * 0.62, unit * 0.2, unit * 0.42, unit * 0.06);
        handle.endFill();
        handle.beginFill(gold, 1);
        handle.drawCircle(0, -unit * 0.66, unit * 0.1);
        handle.endFill();
        c.addChild(handle);
        return c;
    }

    /** Presa/mandíbula cartoon (semicírculo dentado) — legado ultimates. */
    function makeToonJaw(PIXI, unit, upper) {
        const c = new PIXI.Container();
        const flesh = upper ? 0x8e3b5a : 0x6f2c46;
        const fleshHi = upper ? 0xb5557a : 0x934060;
        const outline = 0x2a0a18; const teeth = 0xfff6ea;
        const ow = Math.max(3, unit * 0.07);
        const sgn = upper ? 1 : -1;
        const w = unit * 2.6; const h = unit * 1.1;
        const g = new PIXI.Graphics();
        g.lineStyle(ow, outline, 1);
        g.beginFill(flesh, 1);
        g.moveTo(-w / 2, 0);
        g.quadraticCurveTo(0, sgn * h * 1.3, w / 2, 0);
        g.lineTo(w / 2, -sgn * h * 0.5);
        g.quadraticCurveTo(0, sgn * h * 0.2, -w / 2, -sgn * h * 0.5);
        g.closePath();
        g.endFill();
        g.beginFill(fleshHi, 0.5);
        g.drawEllipse(0, sgn * h * 0.4, w * 0.36, h * 0.3);
        g.endFill();
        c.addChild(g);
        const tg = new PIXI.Graphics();
        tg.lineStyle(ow * 0.5, outline, 1);
        tg.beginFill(teeth, 1);
        const tn = 7;
        for (let i = 0; i < tn; i++) {
            const tx = -w * 0.42 + (i / (tn - 1)) * w * 0.84;
            const th = unit * (0.34 + (i % 2 === 0 ? 0.12 : 0));
            tg.drawPolygon([tx - unit * 0.12, 0, tx + unit * 0.12, 0, tx, sgn * th]);
        }
        tg.endFill();
        c.addChild(tg);
        return c;
    }

    /** Caveira cartoon (tóxica) — Fumaça Tóxica. */
    function makeToonSkull(PIXI, unit, tint) {
        const c = new PIXI.Container();
        const bone = tint || 0xd9f7c0; const outline = 0x1c3a12;
        const ow = Math.max(2, unit * 0.045);
        const g = new PIXI.Graphics();
        g.lineStyle(ow, outline, 1);
        g.beginFill(bone, 1);
        g.drawEllipse(0, -unit * 0.1, unit * 0.42, unit * 0.4);
        g.endFill();
        g.beginFill(bone, 1);
        g.drawRoundedRect(-unit * 0.24, unit * 0.16, unit * 0.48, unit * 0.26, unit * 0.08);
        g.endFill();
        g.beginFill(outline, 1);
        g.drawEllipse(-unit * 0.16, -unit * 0.1, unit * 0.13, unit * 0.16);
        g.drawEllipse(unit * 0.16, -unit * 0.1, unit * 0.13, unit * 0.16);
        g.drawPolygon([-unit * 0.05, unit * 0.06, unit * 0.05, unit * 0.06, 0, unit * 0.16]);
        g.endFill();
        g.lineStyle(ow * 0.8, outline, 1);
        for (let i = -1; i <= 1; i++) {
            g.moveTo(i * unit * 0.12, unit * 0.18);
            g.lineTo(i * unit * 0.12, unit * 0.4);
        }
        c.addChild(g);
        return c;
    }

    /** Nuvem tóxica verde (puff). */
    function makeToxicPuff(PIXI, unit, bright) {
        const g = new PIXI.Graphics();
        const r = unit * (bright ? 0.14 + Math.random() * 0.16 : 0.18 + Math.random() * 0.24);
        const col = bright
            ? (Math.random() > 0.5 ? 0x9be34a : 0xc6f06a)
            : (Math.random() > 0.5 ? 0x4f8a2a : 0x3a6b22);
        g.beginFill(col, bright ? 0.8 : 0.62);
        g.drawCircle(0, 0, r);
        g.endFill();
        g.beginFill(0xeaffc0, bright ? 0.3 : 0.16);
        g.drawCircle(-r * 0.3, -r * 0.3, r * 0.4);
        g.endFill();
        return g;
    }

    /* ============================================================
     * MÍSSEIS MÁGICOS — barragem fullscreen + projétil individual.
     * ============================================================ */
    let _magicMissilesBarrage = null;

    function isMagicMissilesBarrageActive() {
        return !!_magicMissilesBarrage;
    }

    async function beginMagicMissilesBarrage() {
        if (!global.DfVfxEngine?.wantsGpuPresentation?.()) return false;
        setQuality("full");
        global.DfGsapBridge?.setQuality?.("full");
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = await ensureApp(true);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const PIXI = global.PIXI;
        beginPixiTargetScene(a, true);
        try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
        const wrap = new PIXI.Container();
        a.stage.addChild(wrap);
        const sp = scenePixels();
        const wash = new PIXI.Graphics();
        wash.beginFill(0x120404, 0.74);
        wash.drawRect(0, 0, sp.w, sp.h);
        wash.endFill();
        wash.alpha = 0;
        wrap.addChild(wash);
        gsap.to(wash, { alpha: 1, duration: 0.28, ease: "sine.out" });
        const strikesLayer = new PIXI.Container();
        strikesLayer.name = "df-mm-strikes";
        const impactsLayer = new PIXI.Container();
        impactsLayer.name = "df-mm-impacts";
        // Explosões POR CIMA dos projéteis (senão o 💥 some sob o wrap do míssil).
        wrap.addChild(strikesLayer);
        wrap.addChild(impactsLayer);
        _magicMissilesBarrage = { a, wrap, wash, impactsLayer, strikesLayer, gsap, gsapBridge };
        return true;
    }

    function ensureMagicMissilesBarrageScene() {
        const b = _magicMissilesBarrage;
        if (!b?.a) return;
        pixiFullscreenScene = true;
        syncPixiFullscreenScene(b.a);
        try { if (b.a.ticker && !b.a.ticker.started) b.a.ticker.start(); } catch (e) { /* */ }
        try { b.a.renderer?.render?.(b.a.stage); } catch (e) { /* */ }
    }

    async function endMagicMissilesBarrage() {
        const barrage = _magicMissilesBarrage;
        _magicMissilesBarrage = null;
        if (!barrage) return;
        const { a, wrap, wash, gsap, impactsLayer, strikesLayer } = barrage;
        try {
            clearNonBarrageStageChildren();
            try {
                if (gsap) {
                    const killTree = (node) => {
                        if (!node) return;
                        try { gsap.killTweensOf(node); } catch (e) { /* */ }
                        try { if (node.scale) gsap.killTweensOf(node.scale); } catch (e) { /* */ }
                        try {
                            node.children?.forEach?.((ch) => killTree(ch));
                        } catch (e) { /* */ }
                    };
                    killTree(wrap);
                    killTree(impactsLayer);
                    killTree(strikesLayer);
                }
            } catch (e) { /* */ }
            // Limpa impactos/projéteis presos antes do fade do wash.
            try {
                while (impactsLayer?.children?.length) {
                    const ch = impactsLayer.children[0];
                    impactsLayer.removeChild(ch);
                    try { ch.destroy?.({ children: true }); } catch (e2) { /* */ }
                }
            } catch (e) { /* */ }
            try {
                while (strikesLayer?.children?.length) {
                    const ch = strikesLayer.children[0];
                    strikesLayer.removeChild(ch);
                    try { ch.destroy?.({ children: true }); } catch (e2) { /* */ }
                }
            } catch (e) { /* */ }
            if (gsap && wash && !wash.destroyed) {
                await Promise.race([
                    new Promise((resolve) => {
                        gsap.to(wash, {
                            alpha: 0, duration: 0.22, ease: "sine.in",
                            onComplete: resolve,
                            onInterrupt: resolve,
                        });
                    }),
                    new Promise((res) => global.setTimeout(res, 400)),
                ]);
            }
            try { wrap.destroy({ children: true }); } catch (e) { /* */ }
        } finally {
            endPixiTargetScene(a);
            try { clearStage(); } catch (e) { /* */ }
            try { if (a?.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
            try { a?.renderer?.render?.(a.stage); } catch (e) { /* */ }
            trimTextureCaches();
        }
    }

    /**
     * Míssil cinematográfico — origem (0,0) = PONTA do projétil.
     * Assim missile.x/y no alvo = impacto visual no centro da carta.
     */
    function makeCinematicMagicMissile(PIXI, unit, hit) {
        const body = new PIXI.Container();
        const coreCol = hit ? 0xff5530 : 0x5599ff;
        const tailCol = hit ? 0xffaa60 : 0xaaccff;
        const deepCol = hit ? 0x401008 : 0x081830;
        // Desloca o corpo para trás: ponta (faísca) fica em x≈0.
        const tipAt = 0;
        const nose = tipAt;
        const hullX = -unit * 0.16;
        const exhaustX = -unit * 0.56;

        const exhaust = dfSprite(PIXI, dfGlowTex(PIXI, tailCol, deepCol), true);
        exhaust.scale.set(unit * 0.005, unit * 0.0024);
        exhaust.x = exhaustX;
        exhaust.alpha = 0.78;
        body.addChild(exhaust);

        const hullGlow = dfSprite(PIXI, dfGlowTex(PIXI, coreCol, deepCol), true);
        hullGlow.scale.set(unit * 0.0028);
        hullGlow.x = hullX;
        body.addChild(hullGlow);

        const rocket = makeEmojiText(PIXI, "🚀", unit * 0.5);
        rocket.x = hullX + unit * 0.02;
        // O glifo 🚀 aponta para cima-direita (~-45°); +45° alinha a ponta
        // com +X, que é a direção de voo do corpo do projétil.
        rocket.rotation = Math.PI / 4;
        body.addChild(rocket);

        const sparkCore = dfSprite(PIXI, dfSparkTex(PIXI, 0xffffff), true);
        sparkCore.scale.set(unit * 0.0016);
        sparkCore.x = nose;
        sparkCore.alpha = 0.9;
        body.addChild(sparkCore);

        return body;
    }

    function spawnMissileImpactVfx(container, PIXI, gsap, endX, endY, hit, unit, labelText, cinematic, opts = {}) {
        if (!container || container.destroyed) return;
        const skipLabel = !!opts.skipLabel;
        const themeCore = hit ? 0xff6040 : 0x6688cc;
        const themeEdge = hit ? 0x401008 : 0x0a1830;
        const impactRoot = new PIXI.Container();
        impactRoot.x = endX;
        impactRoot.y = endY;
        impactRoot.zIndex = 50;
        container.sortableChildren = true;
        container.addChild(impactRoot);

        // Shockwave circular (visível mesmo se emoji falhar)
        const shock = new PIXI.Graphics();
        shock.lineStyle(Math.max(3, unit * 0.045), hit ? 0xffe8a0 : 0xc0d8ff, hit ? 0.95 : 0.7);
        shock.drawCircle(0, 0, unit * 0.12);
        shock.alpha = 0;
        if (PIXI.BLEND_MODES) shock.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(shock);
        gsap.fromTo(shock, { alpha: 0 }, { alpha: 1, duration: 0.05, ease: "power2.out" });
        gsap.to(shock.scale, { x: hit ? 3.4 : 2.4, y: hit ? 3.4 : 2.4, duration: 0.42, ease: "power3.out" });
        gsap.to(shock, { alpha: 0, duration: 0.36, delay: 0.08, ease: "power2.in" });

        const flash = new PIXI.Graphics();
        flash.beginFill(hit ? 0xfff4d0 : 0xd8e8ff, hit ? 0.98 : 0.62);
        flash.drawCircle(0, 0, unit * (hit ? 0.26 : 0.16));
        flash.endFill();
        flash.alpha = 0;
        if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flash);
        gsap.to(flash, { alpha: hit ? 1 : 0.72, duration: 0.05, ease: "power2.out" });
        gsap.to(flash.scale, { x: hit ? 2.4 : 1.7, y: hit ? 2.4 : 1.7, duration: 0.38, ease: "power3.out" });
        gsap.to(flash, { alpha: 0, duration: 0.42, delay: 0.08, ease: "power2.in" });

        for (let ri = 0; ri < (hit ? 3 : 2); ri++) {
            const ring = dfSprite(PIXI, dfRingTex(PIXI, hit ? 0xff9040 : 0x88aacc), true);
            ring.alpha = hit ? 0.95 : 0.58;
            ring.scale.set(unit * (0.0016 + ri * 0.0004));
            impactRoot.addChild(ring);
            gsap.to(ring.scale, {
                x: unit * (hit ? 0.022 : 0.014) + ri * unit * 0.004,
                y: unit * (hit ? 0.022 : 0.014) + ri * unit * 0.004,
                duration: 0.42 + ri * 0.06,
                ease: "power2.out",
                delay: ri * 0.03,
            });
            gsap.to(ring, { alpha: 0, duration: 0.42, delay: 0.06 + ri * 0.03, ease: "sine.in" });
        }

        const bloom = dfSprite(PIXI, dfGlowTex(PIXI, hit ? 0xfff0c0 : 0xc0d8ff, themeEdge), true);
        bloom.alpha = hit ? 1 : 0.78;
        bloom.scale.set(unit * 0.0032);
        impactRoot.addChild(bloom);
        gsap.to(bloom.scale, {
            x: unit * (hit ? 0.024 : 0.015),
            y: unit * (hit ? 0.024 : 0.015),
            duration: 0.38,
            ease: "power3.out",
        });
        gsap.to(bloom, { alpha: 0, duration: 0.48, delay: 0.1, ease: "power2.in" });

        if (hit) {
            // Segunda onda de fogo — explosão volumétrica (raio menor)
            const fireBall = dfSprite(PIXI, dfGlowTex(PIXI, 0xff5520, 0x280808), true);
            fireBall.alpha = 0.95;
            fireBall.scale.set(unit * 0.0022);
            impactRoot.addChild(fireBall);
            gsap.to(fireBall.scale, { x: unit * 0.018, y: unit * 0.018, duration: 0.28, ease: "power2.out" });
            gsap.to(fireBall, { alpha: 0, duration: 0.44, delay: 0.12, ease: "sine.in" });

            const burstN = n(cinematic ? 22 : 14);
            for (let i = 0; i < burstN; i++) {
                const col = i % 3 === 0 ? 0xffffaa : (i % 3 === 1 ? themeCore : 0xff9040);
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, col), true);
                sp.scale.set(unit * (0.0016 + Math.random() * 0.002));
                impactRoot.addChild(sp);
                const ang = (i / burstN) * Math.PI * 2 + Math.random() * 0.28;
                const dist = unit * (0.35 + Math.random() * 0.85);
                gsap.to(sp, {
                    x: Math.cos(ang) * dist,
                    y: Math.sin(ang) * dist - unit * 0.14,
                    alpha: 0,
                    rotation: (Math.random() - 0.5) * 2.8,
                    duration: 0.4 + Math.random() * 0.28,
                    ease: "power2.out",
                    onComplete: () => { try { sp.destroy(); } catch (e) { /* */ } },
                });
            }
            for (let si = 0; si < (cinematic ? 6 : 4); si++) {
                const sm = dfSprite(PIXI, dfSmokeTex(PIXI, si % 2 ? 0x884430 : 0x553322), true);
                sm.x = (Math.random() - 0.5) * unit * 0.22;
                sm.y = unit * 0.04;
                sm.alpha = 0.65;
                sm.scale.set(unit * 0.0022);
                impactRoot.addChild(sm);
                gsap.to(sm, {
                    y: sm.y - unit * (0.32 + si * 0.08),
                    alpha: 0,
                    duration: 0.58 + si * 0.07,
                    ease: "sine.out",
                    onComplete: () => { try { sm.destroy(); } catch (e) { /* */ } },
                });
                gsap.to(sm.scale, { x: sm.scale.x * 2.2, y: sm.scale.y * 2.2, duration: 0.65, ease: "sine.out" });
            }
        } else {
            for (let i = 0; i < 8; i++) {
                const puff = dfSprite(PIXI, dfSmokeTex(PIXI, 0x446688), true);
                puff.x = (Math.random() - 0.5) * unit * 0.5;
                puff.y = (Math.random() - 0.5) * unit * 0.32;
                puff.alpha = 0.55;
                puff.scale.set(unit * 0.0024);
                impactRoot.addChild(puff);
                gsap.to(puff, {
                    y: puff.y - unit * 0.32,
                    alpha: 0,
                    duration: 0.52 + i * 0.04,
                    ease: "sine.out",
                    onComplete: () => { try { puff.destroy(); } catch (e) { /* */ } },
                });
            }
        }

        const glyph = makeEmojiText(PIXI, hit ? "💥" : "✖️", unit * (hit ? 0.95 : 0.58));
        glyph.y = 0;
        glyph.alpha = 0;
        glyph.scale.set(0.15);
        impactRoot.addChild(glyph);
        gsap.to(glyph, { alpha: 1, duration: 0.06, ease: "power2.out" });
        gsap.to(glyph.scale, { x: 1.45, y: 1.45, duration: 0.28, ease: "back.out(2.8)" });
        gsap.to(glyph, { alpha: 0, duration: 0.4, delay: 0.62, ease: "sine.in" });

        if (!skipLabel && labelText) {
            const lbl = new PIXI.Text(labelText, {
                fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
                fontSize: Math.round(unit * (hit ? 0.42 : 0.36)),
                fill: hit ? 0xff7070 : 0xd0d8ea,
                fontWeight: "700",
                dropShadow: true,
                dropShadowColor: hit ? 0x200808 : 0x101828,
                dropShadowBlur: unit * 0.08,
                dropShadowDistance: unit * 0.03,
            });
            lbl.anchor.set(0.5);
            lbl.y = unit * 0.4;
            lbl.alpha = 0;
            lbl.scale.set(0.4);
            impactRoot.addChild(lbl);
            gsap.to(lbl, { alpha: 1, duration: 0.12, ease: "power2.out", delay: 0.05 });
            gsap.to(lbl.scale, { x: 1, y: 1, duration: 0.22, ease: "back.out(1.8)", delay: 0.05 });
            gsap.to(lbl, { alpha: 0, y: lbl.y - unit * 0.28, duration: 0.44, delay: 0.78, ease: "power2.in" });
        }

        // Cleanup com timeline rastreável (delayedCall órfão acumulava no globalTimeline → FPS caía).
        const cleanupSec = cinematic ? 0.72 : 0.55;
        const cleanupTl = gsap.timeline({
            onComplete: () => {
                try { gsap.killTweensOf(impactRoot); } catch (e) { /* */ }
                try {
                    impactRoot.children?.forEach?.((ch) => {
                        try { gsap.killTweensOf(ch); } catch (e2) { /* */ }
                        try { if (ch.scale) gsap.killTweensOf(ch.scale); } catch (e2) { /* */ }
                    });
                } catch (e) { /* */ }
                try { impactRoot.destroy({ children: true }); } catch (e) { /* */ }
            },
            onInterrupt: () => {
                try { impactRoot.destroy({ children: true }); } catch (e) { /* */ }
            },
        });
        cleanupTl.to({}, { duration: cleanupSec });
        try { global.DfGsapBridge?.track?.(cleanupTl); } catch (e) { /* */ }

        try { global.sfx?.(hit ? "explosao" : "combat_clash"); } catch (e) { /* */ }
    }

    async function spawnMagicMissileOutcomeLabel(vx, vy, labelText, hit = false) {
        const cinematic = true;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(true);
        const a = _magicMissilesBarrage?.a || await ensureApp(true);
        if (!a || !global.PIXI || !gsap) return false;
        const PIXI = global.PIXI;
        const mp = mapScenePoint(vx, vy);
        const unit = Math.max(cardUnit(1), Math.min(global.innerWidth || 800, global.innerHeight || 600) * 0.08);
        const parent = (_magicMissilesBarrage?.impactsLayer && !_magicMissilesBarrage.impactsLayer.destroyed)
            ? _magicMissilesBarrage.impactsLayer
            : a.stage;
        const lbl = new PIXI.Text(labelText || (hit ? "−1 PODER" : "BLOQUEADO!"), {
            fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
            fontSize: Math.round(unit * 0.38),
            fill: hit ? 0xff7070 : 0xd0d8ea,
            fontWeight: "700",
            dropShadow: true,
            dropShadowColor: hit ? 0x200808 : 0x101828,
            dropShadowBlur: unit * 0.08,
            dropShadowDistance: unit * 0.03,
        });
        lbl.anchor.set(0.5);
        lbl.x = mp.x;
        lbl.y = mp.y + unit * 0.4;
        lbl.alpha = 0;
        lbl.scale.set(0.4);
        parent.addChild(lbl);
        gsap.to(lbl, { alpha: 1, duration: 0.12, ease: "power2.out" });
        gsap.to(lbl.scale, { x: 1, y: 1, duration: 0.22, ease: "back.out(1.8)" });
        gsap.to(lbl, {
            alpha: 0, y: lbl.y - unit * 0.28, duration: 0.44, delay: 0.7, ease: "power2.in",
            onComplete: () => { try { lbl.destroy(); } catch (e) { /* */ } },
        });
        return true;
    }

    async function playMagicMissileStrikeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        const useBarrage = !!opts.barrage && !!_magicMissilesBarrage?.wrap
            && !_magicMissilesBarrage.wrap.destroyed;
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;

        let fromX = opts.fromX;
        let fromY = opts.fromY;
        let cx = opts.cx ?? opts.x;
        let cy = opts.cy ?? opts.y;
        if (fromX == null || fromY == null || cx == null || cy == null) return false;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = useBarrage ? _magicMissilesBarrage.a : await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;

        let frame = null;
        let ownFrame = false;
        if (useBarrage) {
            ensureMagicMissilesBarrageScene();
            if (!_magicMissilesBarrage?.wrap || _magicMissilesBarrage.wrap.destroyed) return false;
            // Reanexa wrap se clearStage/órfãos o tiraram do stage.
            if (_magicMissilesBarrage.wrap.parent !== a.stage) {
                try { a.stage.addChild(_magicMissilesBarrage.wrap); } catch (e) { /* */ }
            }
            const mpFrom = mapScenePoint(fromX, fromY);
            const mpTo = mapScenePoint(cx, cy);
            fromX = mpFrom.x; fromY = mpFrom.y;
            cx = mpTo.x; cy = mpTo.y;
        } else {
            frame = pixiSceneFrame(a, !!cinematic);
            ownFrame = true;
            const fm = frame.map(fromX, fromY);
            const tm = frame.map(cx, cy);
            fromX = fm.x; fromY = fm.y;
            cx = tm.x; cy = tm.y;
        }

        const PIXI = global.PIXI;
        const unit = useBarrage
            ? Math.max(cardUnit(1), Math.min(global.innerWidth || 800, global.innerHeight || 600) * 0.08)
            : cardUnit(1);
        const hit = opts.hit !== false;
        const labelText = opts.label || (hit ? "-1 PODER" : "FALHOU!");

        try {
            try { if (a.ticker && !a.ticker.started) a.ticker.start(); } catch (e) { /* */ }
            const strikeParent = useBarrage ? _magicMissilesBarrage.strikesLayer : a.stage;
            // Impacto SEMPRE em layer que sobrevive à destruição do projétil.
            const impactParent = useBarrage
                ? _magicMissilesBarrage.impactsLayer
                : a.stage;
            if (!strikeParent || strikeParent.destroyed) return false;
            const strikeWrap = new PIXI.Container();
            strikeParent.addChild(strikeWrap);
            const container = new PIXI.Container();
            strikeWrap.addChild(container);

            // Todo míssil crava a ponta no CENTRO exato da carta — acerto e
            // erro. O resultado (dano ou FALHOU!) muda só o VFX de impacto.
            const endX = cx;
            const endY = cy;
            const endDx = endX - fromX;
            const endDy = endY - fromY;

            const missile = new PIXI.Container();
            const rocket = makeCinematicMagicMissile(PIXI, unit, hit);
            missile.addChild(rocket);

            const trailGlow = dfSprite(PIXI, dfGlowTex(PIXI, hit ? 0xff8040 : 0x6699ff, hit ? 0x200808 : 0x081028), true);
            trailGlow.alpha = 0.55;
            trailGlow.scale.set(unit * 0.0028);
            trailGlow.x = -unit * 0.28;
            missile.addChildAt(trailGlow, 0);

            const sparkTrail = [];
            for (let si = 0; si < (cinematic ? 10 : 6); si++) {
                const sp = dfSprite(PIXI, dfSparkTex(PIXI, hit ? 0xffaa60 : 0x88ccff), true);
                sp.alpha = 0;
                sp.scale.set(unit * (0.0012 + si * 0.0003));
                container.addChild(sp);
                sparkTrail.push(sp);
            }
            missile.x = fromX;
            missile.y = fromY;
            missile.rotation = Math.atan2(endDy, endDx);
            missile.scale.set(1.05);
            container.addChild(missile);

            const travelDur = cinematic ? 0.74 : 0.56;
            const proxy = { t: 0 };
            let impactPromise = Promise.resolve();
            const tl = await gsapBridge.createTimeline();
            if (!tl) {
                try { strikeWrap.destroy({ children: true }); } catch (e) { /* */ }
                if (ownFrame) frame.end();
                return false;
            }

            tl.to(proxy, {
                t: 1,
                duration: travelDur,
                ease: "power2.in",
                onUpdate: () => {
                    const e = proxy.t;
                    // Arco leve some no final (e=1 → 0) para a ponta cravar no centro.
                    const arc = Math.sin(Math.PI * e) * unit * 0.045 * (1 - e);
                    const mx = fromX + endDx * e;
                    const my = fromY + endDy * e - arc;
                    missile.x = mx;
                    missile.y = my;
                    // Nariz travado na linha de voo: o projétil vai SEMPRE de
                    // frente para o alvo, nunca de lado.
                    missile.rotation = Math.atan2(endDy, endDx);
                    missile.scale.set(1.05 + e * 0.12);
                    trailGlow.alpha = 0.35 + (1 - e) * 0.55;
                    sparkTrail.forEach((sp, i) => {
                        const lag = Math.max(0, e - i * 0.06);
                        sp.x = fromX + endDx * lag;
                        sp.y = fromY + endDy * lag - Math.sin(Math.PI * lag) * unit * 0.02 * (1 - lag);
                        sp.alpha = 0.75 * (1 - lag);
                    });
                },
            }, 0);

            const impactAt = travelDur;
            tl.add(() => {
                // Ponta exatamente no centro no instante do impacto.
                missile.x = endX;
                missile.y = endY;
                missile.visible = false;
                sparkTrail.forEach((sp) => { sp.alpha = 0; });
                if (typeof opts.onImpact === "function") {
                    try {
                        const r = opts.onImpact();
                        impactPromise = r && typeof r.then === "function" ? r : Promise.resolve();
                    } catch (e) {
                        impactPromise = Promise.resolve();
                    }
                }
                const impactLayer = (impactParent && !impactParent.destroyed) ? impactParent : container;
                spawnMissileImpactVfx(
                    impactLayer, PIXI, gsap, endX, endY, hit, unit, labelText, cinematic,
                    { skipLabel: !!opts.deferImpactLabel },
                );
                try { a.renderer?.render?.(a.stage); } catch (e) { /* */ }
            }, impactAt);

            // Remover o projétil depois — NÃO o layer de impactos.
            tl.add(() => {
                try { strikeWrap.destroy({ children: true }); } catch (e) { /* */ }
            }, impactAt + 0.2);

            // Espera a timeline do vôo + deixa a explosão respirar na tela.
            await awaitPixiTimeline(tl, null, impactAt + 0.28, { destroyRoot: false });
            // Com Proteção/Barreira pós-impacto, aguardar a resolução completa
            // (prompt humano pode demorar). Senão, race curto só pra mecânica sync.
            try {
                if (impactPromise && typeof impactPromise.then === "function") {
                    if (opts.deferImpactLabel) {
                        await impactPromise;
                    } else {
                        await Promise.race([
                            impactPromise,
                            new Promise((res) => global.setTimeout(res, 120)),
                        ]);
                    }
                }
            } catch (e) { /* */ }
            if (useBarrage) {
                ensureMagicMissilesBarrageScene();
                // Limpa impactos antigos para não empilhar 💥 congelados.
                try {
                    const layer = _magicMissilesBarrage?.impactsLayer;
                    if (layer && layer.children.length > 2) {
                        const keep = layer.children.slice(-2);
                        const drop = layer.children.slice(0, -2);
                        drop.forEach((ch) => {
                            try { layer.removeChild(ch); } catch (e) { /* */ }
                            try { gsap.killTweensOf(ch); } catch (e) { /* */ }
                            try { ch.destroy?.({ children: true }); } catch (e) { /* */ }
                        });
                        void keep;
                    }
                } catch (e) { /* */ }
                await new Promise((res) => global.setTimeout(res, cinematic ? 220 : 160));
            } else {
                await new Promise((res) => global.setTimeout(res, cinematic ? 320 : 220));
                sweepOrphanScenes();
            }
            return true;
        } finally {
            if (ownFrame && frame) frame.end();
        }
    }

    /* ============================================================
     * DRAGON BREATH — Jekiro (ice/fire), Baforada Venenosa (poison).
     * Cinemático Hearthstone: presença off-screen + cone volumétrico.
     * ============================================================ */
    async function playDragonBreathScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x; let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const modeKey = breathModeKey(opts.mode);
        const pal = breathPalette(modeKey);
        const ultimate = !!opts.ultimate;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic || ultimate);
        const a = await ensureApp(cinematic || ultimate);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const scene = scenePixels();
        const theme = themeFromRecipe(pal.theme);

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const fromRight = opts.sweepFromLeft ? false : (opts.sweepFromRight ? true : cx < scene.w * 0.5);
        const hx = fromRight ? scene.w + unit * 2.6 : -unit * 2.6;
        const hy = Math.max(-unit * 0.8, Math.min(cy - unit * 4.2, scene.h * 0.08));
        const maw = makeCinematicMaw(PIXI, unit * (cinematic || ultimate ? (ultimate ? 2.15 : 1.85) : 1.5), pal);
        maw.root.x = hx; maw.root.y = hy; maw.root.alpha = 0; maw.root.scale.set(0.35);
        maw.root.rotation = fromRight ? -0.22 : 0.22;
        container.addChild(maw.root);

        const wash = new PIXI.Graphics();
        wash.beginFill(modeKey === "fire" ? 0x2a0a04 : modeKey === "poison" ? 0x081806 : 0x081620, pal.vignette);
        wash.drawRect(0, 0, scene.w, scene.h);
        wash.endFill();
        wash.alpha = 0;
        container.addChildAt(wash, 0);

        const mouthX = hx + (fromRight ? -unit * 0.55 : unit * 0.55);
        const mouthY = hy + unit * 0.5;
        const dx = cx - mouthX; const dy = cy - mouthY;
        const coneLen = Math.hypot(dx, dy) + unit * 0.45;
        const dirx = dx / coneLen; const diry = dy / coneLen;
        const cone = makeBreathCone(PIXI, unit, coneLen, unit * (modeKey === "ice" ? 1.15 : 1.32), modeKey);
        cone.x = mouthX; cone.y = mouthY;
        cone.rotation = Math.atan2(dy, dx) - Math.PI / 2;
        cone.alpha = 0; cone.scale.set(1, 0.02);
        container.addChild(cone);

        const wake = makeSoftBloom(PIXI, theme, unit, 1.1);
        wake.x = mouthX; wake.y = mouthY; wake.alpha = 0;
        container.addChild(wake);

        const parts = [];
        const partN = n((cinematic || ultimate) ? (ultimate ? 84 : 56) : 28);
        for (let i = 0; i < partN; i++) {
            const col = i % 4 === 0 ? pal.core : (i % 4 === 1 ? pal.mid : pal.outer);
            const g = makeSoftOrb(PIXI, col, unit * (0.04 + Math.random() * 0.12), 0.78);
            g.visible = false; container.addChild(g);
            parts.push({ g, off: Math.random(), spread: (Math.random() - 0.5), drift: (Math.random() - 0.5) * 0.6 });
        }

        const sparkN = n((cinematic || ultimate) ? (ultimate ? 28 : 16) : 8);
        const sparks = [];
        for (let si = 0; si < sparkN; si++) {
            const sg = makeSoftOrb(PIXI, pal.core, unit * (0.03 + Math.random() * 0.05), 0.9);
            sg.visible = false;
            container.addChild(sg);
            sparks.push({ g: sg, ang: Math.random() * Math.PI * 2, dist: 0.3 + Math.random() * 0.7 });
        }

        let targetFx = null;
        let targetStain = null;
        if (modeKey === "ice") {
            targetFx = makeFrostShell(PIXI, unit, theme);
            targetFx.x = cx; targetFx.y = cy;
            container.addChild(targetFx);
        } else if (modeKey === "fire") {
            targetFx = makeHeatShell(PIXI, unit, theme);
            targetFx.x = cx; targetFx.y = cy;
            container.addChild(targetFx);
            const stain = new PIXI.Graphics();
            stain.beginFill(0x2a0e06, 0.48);
            stain.drawEllipse(0, 0, unit * 0.92, unit * 0.36);
            stain.endFill();
            stain.x = cx; stain.y = cy + unit * 0.1; stain.alpha = 0;
            container.addChild(stain);
            targetStain = stain;
        } else {
            targetFx = makeVenomShell(PIXI, unit, theme);
            targetFx.x = cx; targetFx.y = cy;
            container.addChild(targetFx);
        }

        const emberN = modeKey === "fire" ? n(cinematic ? 20 : 10) : 0;
        const embers = [];
        for (let ei = 0; ei < emberN; ei++) {
            const em = makeSoftOrb(PIXI, ei % 2 ? 0xff6a1e : 0xffc040, unit * (0.05 + Math.random() * 0.08), 0.8);
            em.x = cx; em.y = cy; em.visible = false;
            container.addChild(em);
            embers.push({ g: em, ang: Math.random() * Math.PI * 2, spd: 0.4 + Math.random() * 0.8 });
        }

        const breathDur = ultimate ? 1.05 : (cinematic ? 0.78 : 0.54);
        const breathProxy = { t: 0 };
        const shakeP = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        tl.to(maw.root, { alpha: 1, duration: 0.2 }, 0);
        tl.to(wash, { alpha: cinematic ? 0.55 : 0.38, duration: 0.32, ease: "sine.out" }, 0);
        tl.to(maw.root.scale, { x: 1, y: 1, duration: 0.38, ease: "power3.out" }, 0);
        tl.to(maw.root, { y: hy - unit * 0.35, duration: 0.24, ease: "power2.out" }, 0.1);
        tl.to(maw.puffBase?.scale || maw.root.scale, { x: 1.15, y: 1.1, duration: 0.12, ease: "power2.out" }, 0.38);
        tl.to(maw.mouth.scale, { x: 1.35, y: 1.25, duration: 0.14, ease: "power2.out" }, 0.38);
        tl.to(maw.mouth.scale, { x: 1, y: 1, duration: 0.12, ease: "power2.in" }, 0.52);

        const breathAt = 0.58;
        tl.addLabel("breath", breathAt);
        tl.add(() => {
            if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            parts.forEach((p) => { p.g.visible = true; });
        }, "breath");
        tl.to(cone, { alpha: 1, duration: 0.1 }, "breath");
        tl.to(cone.scale, { x: 1, y: 1, duration: 0.18, ease: "power2.out" }, "breath");
        tl.to(wake, { alpha: 0.75, duration: 0.12 }, "breath");
        tl.to(wake.scale, { x: 1.4, y: 1.4, duration: breathDur * 0.9, ease: "power1.out" }, "breath");
        tl.to(wake, { alpha: 0, duration: 0.28, ease: "power2.out" }, `breath+=${breathDur * 0.55}`);
        tl.to(breathProxy, {
            t: 1, duration: breathDur, ease: "none",
            onUpdate: () => {
                cone.scale.x = 1 + Math.sin(breathProxy.t * Math.PI * 8) * 0.06;
                cone.alpha = 0.88 + Math.sin(breathProxy.t * Math.PI * 12) * 0.1;
                parts.forEach((p) => {
                    const lp = (breathProxy.t * 1.35 + p.off) % 1;
                    const px = mouthX + dx * lp;
                    const py = mouthY + dy * lp;
                    p.g.x = px + (-diry) * p.spread * unit * (0.25 + lp) * 1.4 + p.drift * unit * 0.2;
                    p.g.y = py + (dirx) * p.spread * unit * (0.25 + lp) * 1.4;
                    p.g.alpha = Math.sin(lp * Math.PI) * 0.95;
                    p.g.scale.set(0.45 + lp * 0.95);
                });
                if (breathProxy.t > 0.25) {
                    const sp = (breathProxy.t - 0.25) / 0.75;
                    sparks.forEach((s) => {
                        s.g.visible = true;
                        const dist = s.dist * unit * sp * 1.4;
                        s.g.x = cx + Math.cos(s.ang) * dist;
                        s.g.y = cy + Math.sin(s.ang) * dist;
                        s.g.alpha = Math.max(0, 1 - sp * 1.1);
                    });
                }
            },
        }, "breath");

        tl.to(shakeP, {
            t: 1, duration: 0.42, ease: "power2.out",
            onUpdate: () => { const sh = (1 - shakeP.t) * (cinematic ? 11 : 6); shakeWrap.x = (Math.random() - 0.5) * sh; shakeWrap.y = (Math.random() - 0.5) * sh; },
        }, `breath+=${breathDur * 0.22}`);

        if (targetFx) {
            tl.to(targetFx, { alpha: 1, duration: 0.14 }, `breath+=${breathDur * 0.28}`);
            tl.to(targetFx.scale, { x: 1, y: 1, duration: 0.34, ease: "power2.out" }, `breath+=${breathDur * 0.28}`);
        }
        if (targetStain) {
            tl.to(targetStain, { alpha: 0.72, duration: 0.16 }, `breath+=${breathDur * 0.32}`);
        }
        if (embers.length) {
            tl.add(() => { embers.forEach((e) => { e.g.visible = true; e.g.alpha = 1; }); }, `breath+=${breathDur * 0.3}`);
            tl.to({}, {
                duration: 0.45,
                onUpdate: function () {
                    const p = this.progress();
                    embers.forEach((e) => {
                        e.g.x = cx + Math.cos(e.ang) * unit * e.spd * p;
                        e.g.y = cy + Math.sin(e.ang) * unit * e.spd * p - unit * 0.2 * p;
                        e.g.alpha = Math.max(0, 1 - p * 1.2);
                    });
                },
            }, `breath+=${breathDur * 0.3}`);
        }

        tl.to(cone, { alpha: 0, duration: 0.26, ease: "power2.out" }, `breath+=${breathDur}`);
        tl.to(wash, { alpha: 0, duration: 0.38, ease: "power2.out" }, `breath+=${breathDur}`);
        tl.add(() => { parts.forEach((p) => { p.g.visible = false; }); }, `breath+=${breathDur + 0.22}`);
        tl.to(maw.root, { alpha: 0, y: hy - unit * 0.9, duration: 0.34, ease: "power2.in" }, `breath+=${breathDur + 0.14}`);
        if (targetFx) {
            tl.to(targetFx, { alpha: 0, duration: 0.38, ease: "power2.out" }, `breath+=${breathDur + 0.5}`);
        }
        if (targetStain) {
            tl.to(targetStain, { alpha: 0, duration: 0.4, ease: "power2.out" }, `breath+=${breathDur + 0.48}`);
        }

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        const maxSec = 0.65 + breathDur + 1.7;
        await awaitPixiTimeline(tl, shakeWrap, maxSec);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * SANGUE DE DRAGÃO — meteoro imponente → Dragão Cúbico surge.
     * ============================================================ */
    async function playDragonMeteorScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x; let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const scene = scenePixels();
        const theme = themeFromRecipe({ hue: 22 });

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const edgeVignette = makeEdgeVignette(PIXI, 0.42);
        container.addChild(edgeVignette);
        const skyWash = new PIXI.Graphics();
        skyWash.beginFill(0x1a0a04, 0.5);
        skyWash.drawRect(0, 0, scene.w, scene.h);
        skyWash.endFill();
        skyWash.alpha = 0;
        container.addChild(skyWash);

        // Meteoro: cauda + halo + núcleo rochoso.
        const meteor = new PIXI.Container();
        const tail = new PIXI.Graphics();
        const tlen = unit * 4.2;
        tail.beginFill(0xffb347, 0.5);
        tail.moveTo(0, 0);
        tail.lineTo(-unit * 0.5, -tlen);
        tail.lineTo(unit * 0.5, -tlen);
        tail.closePath();
        tail.endFill();
        tail.beginFill(0xffe9a8, 0.55);
        tail.moveTo(0, 0);
        tail.lineTo(-unit * 0.22, -tlen * 0.8);
        tail.lineTo(unit * 0.22, -tlen * 0.8);
        tail.closePath();
        tail.endFill();
        if (PIXI.BLEND_MODES) tail.blendMode = PIXI.BLEND_MODES.ADD;
        meteor.addChild(tail);
        const mhalo = makeSoftBloom(PIXI, theme, unit, 1.7);
        meteor.addChild(mhalo);
        const rock = new PIXI.Graphics();
        rock.lineStyle(Math.max(2, unit * 0.04), 0x1a0e06, 1);
        rock.beginFill(0x3a241a, 1);
        rock.drawPolygon([-unit * 0.7, -unit * 0.2, -unit * 0.3, -unit * 0.7, unit * 0.4, -unit * 0.6, unit * 0.75, 0, unit * 0.45, unit * 0.65, -unit * 0.35, unit * 0.6, -unit * 0.7, unit * 0.2]);
        rock.endFill();
        rock.beginFill(0xff7a1e, 0.9);
        rock.drawCircle(unit * 0.08, -unit * 0.05, unit * 0.22);
        rock.endFill();
        rock.beginFill(0x1a0e06, 0.8);
        rock.drawCircle(-unit * 0.3, unit * 0.18, unit * 0.1);
        rock.drawCircle(unit * 0.32, -unit * 0.32, unit * 0.08);
        rock.endFill();
        meteor.addChild(rock);
        const angle = Math.atan2(1, 0.42);
        const startX = cx - Math.cos(angle) * scene.h * 1.1;
        const startY = cy - Math.sin(angle) * scene.h * 1.1;
        meteor.x = startX; meteor.y = startY;
        meteor.rotation = angle - Math.PI / 2;
        meteor.alpha = 0;
        meteor.scale.set(cinematic ? 1.25 : 1);
        container.addChild(meteor);

        const impactRoot = new PIXI.Container(); impactRoot.x = cx; impactRoot.y = cy; container.addChild(impactRoot);
        const bloom = makeSoftBloom(PIXI, theme, unit, 2.2); bloom.alpha = 0; impactRoot.addChild(bloom);
        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, 0.96); flash.drawCircle(0, 0, unit * 0.6); flash.endFill();
        flash.scale.set(0.05); flash.alpha = 0;
        if (PIXI.BLEND_MODES) flash.blendMode = PIXI.BLEND_MODES.ADD;
        impactRoot.addChild(flash);
        const rings = [];
        for (let i = 0; i < (cinematic ? 5 : 3); i++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(2, unit * 0.035) - i * 0.3, theme.ring, 0.9 - i * 0.1);
            ring.drawCircle(0, 0, unit * (0.22 + i * 0.08));
            ring.scale.set(0.08); ring.alpha = 0;
            if (PIXI.BLEND_MODES) ring.blendMode = PIXI.BLEND_MODES.ADD;
            impactRoot.addChild(ring); rings.push(ring);
        }

        const debris = [];
        const debrisN = n(cinematic ? 40 : 18);
        for (let i = 0; i < debrisN; i++) {
            const g = (i % 3 === 0) ? makeDebris(PIXI, unit) : makeEmber(PIXI, theme, unit, i % 4 === 0);
            g.visible = false; container.addChild(g);
            debris.push({ g, vx: 0, vy: 0, vr: 0 });
        }
        const smoke = [];
        const smokeN = n(cinematic ? 14 : 8);
        for (let i = 0; i < smokeN; i++) {
            const g = makeSmokePlume(PIXI, unit, true);
            g.visible = false; container.addChild(g);
            smoke.push({ g, vx: 0, vy: 0 });
        }

        const travelMs = cinematic ? 620 : 420;
        const partProxy = { t: 0 };
        const shakeP = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        tl.to(edgeVignette, { alpha: 0.7, duration: 0.3, ease: "sine.out" }, 0);
        tl.to(skyWash, { alpha: 0.55, duration: 0.3, ease: "sine.out" }, 0);
        tl.to(meteor, { alpha: 1, duration: 0.12 }, 0);
        const travel = travelMs / 1000;
        tl.to(meteor, { x: cx, y: cy, duration: travel, ease: "power3.in" }, 0.1);

        const impactAt = 0.1 + travel;
        tl.addLabel("impact", impactAt);
        tl.add(() => {
            if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            meteor.visible = false;
            debris.forEach((p) => {
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
                const spd = (cinematic ? 11 : 6) + Math.random() * (cinematic ? 20 : 10);
                p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd - (cinematic ? 8 : 4);
                p.vr = (Math.random() - 0.5) * 0.6; p.g.visible = true;
                p.g.x = cx + (Math.random() - 0.5) * unit * 0.6; p.g.y = cy; p.g.alpha = 1;
            });
            smoke.forEach((p) => {
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
                const spd = 2 + Math.random() * 4;
                p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd - 2;
                p.g.visible = true; p.g.x = cx + (Math.random() - 0.5) * unit; p.g.y = cy; p.g.alpha = 0.9;
                p.g.scale.set(0.5 + Math.random() * 0.6);
            });
        }, "impact");
        tl.to(flash, { alpha: 1, duration: 0.04 }, "impact");
        tl.to(flash.scale, { x: 11, y: 11, duration: 0.34, ease: "power2.out" }, "impact");
        tl.to(flash, { alpha: 0, duration: 0.34 }, "impact+=0.1");
        tl.to(bloom, { alpha: 0.95, duration: 0.06 }, "impact");
        tl.to(bloom.scale, { x: 1.8, y: 1.8, duration: 0.4, ease: "power2.out" }, "impact");
        tl.to(bloom, { alpha: 0, duration: 0.45 }, "impact+=0.18");
        rings.forEach((ring, i) => {
            const off = i * 0.05;
            tl.to(ring, { alpha: 0.9 - i * 0.1, duration: 0.04 }, `impact+=${off}`);
            tl.to(ring.scale, { x: 7 + i * 1.3, y: (7 + i * 1.3) * 0.6, duration: 0.6, ease: "power2.out" }, `impact+=${off}`);
            tl.to(ring, { alpha: 0, duration: 0.4 }, `impact+=${0.18 + off}`);
        });
        tl.to(shakeP, {
            t: 1, duration: cinematic ? 0.6 : 0.36, ease: "power2.out",
            onUpdate: () => { const s = (1 - shakeP.t) * (cinematic ? 28 : 14); shakeWrap.x = (Math.random() - 0.5) * s; shakeWrap.y = (Math.random() - 0.5) * s; },
        }, "impact");
        tl.to(partProxy, {
            t: 1, duration: 0.9, ease: "none",
            onUpdate: () => {
                debris.forEach((p) => {
                    p.g.x += p.vx; p.g.y += p.vy; p.vy += 0.36; p.vx *= 0.98; p.vy *= 0.98;
                    p.g.rotation += p.vr; p.g.alpha = Math.max(0, 1 - partProxy.t * 1.05);
                });
                smoke.forEach((p) => {
                    p.g.x += p.vx; p.g.y += p.vy; p.vy *= 0.97; p.vx *= 0.98;
                    p.g.scale.x += 0.012; p.g.scale.y += 0.012;
                    p.g.alpha = Math.max(0, 0.9 - partProxy.t * 0.95);
                });
            },
        }, "impact");

        const fadeAt = impactAt + 0.95;
        tl.to(skyWash, { alpha: 0, duration: 0.45, ease: "power2.out" }, fadeAt);
        tl.to(edgeVignette, { alpha: 0, duration: 0.45, ease: "power2.out" }, fadeAt);

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        const maxSec = (0.1 + travel) + 1.45;
        await awaitPixiTimeline(tl, shakeWrap, maxSec);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * GANCHO (Puxão) — gancho voa, finca no alvo e o puxa pro campo.
     * onSnag() no instante do fisgar; onPull(t) durante o puxão (o
     * chamador move a carta DOM em sincronia, t já vem com ease).
     * ============================================================ */
    async function playHookPullScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        if (opts.fromX == null || opts.fromY == null || opts.toX == null || opts.toY == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const A = frame.map(opts.fromX, opts.fromY);
        const B = frame.map(opts.toX, opts.toY);
        const D = frame.map(opts.destX ?? opts.toX, opts.destY ?? opts.toY);
        const PIXI = global.PIXI;
        const unit = cardUnit(1);

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const chainG = new PIXI.Graphics();
        container.addChild(chainG);
        const hook = makeToonHook(PIXI, unit * 1.15);
        hook.x = A.x; hook.y = A.y; hook.rotation = Math.atan2(B.y - A.y, B.x - A.x) - Math.PI / 2;
        container.addChild(hook);

        const drawChain = (bx, by) => {
            chainG.clear();
            const dxc = bx - A.x; const dyc = by - A.y;
            const dist = Math.hypot(dxc, dyc) || 1;
            const ux = dxc / dist; const uy = dyc / dist;
            chainG.lineStyle(Math.max(4, unit * 0.1), 0x26323c, 1);
            chainG.moveTo(A.x, A.y); chainG.lineTo(bx, by);
            chainG.lineStyle(Math.max(2, unit * 0.05), 0xb6c2cc, 1);
            chainG.moveTo(A.x, A.y); chainG.lineTo(bx, by);
            const links = Math.max(3, Math.floor(dist / (unit * 0.34)));
            chainG.lineStyle(Math.max(1.5, unit * 0.03), 0x26323c, 1);
            chainG.beginFill(0xd5dde4, 1);
            for (let i = 1; i < links; i++) {
                const lx = A.x + ux * (dist * i / links);
                const ly = A.y + uy * (dist * i / links);
                chainG.drawCircle(lx, ly, unit * 0.07);
            }
            chainG.endFill();
        };

        const throwMs = opts.throwMs ?? (cinematic ? 420 : 320);
        const pullMs = opts.pullMs ?? (cinematic ? 760 : 560);
        const arcLift = -Math.min(unit * 1.6, Math.max(unit * 0.6, Math.abs(B.y - A.y) * 0.25));
        const throwProxy = { t: 0 };
        const pullProxy = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        // Arremesso do gancho (arco).
        tl.to(throwProxy, {
            t: 1, duration: throwMs / 1000, ease: "power2.in",
            onUpdate: () => {
                const t = throwProxy.t;
                const hx = A.x + (B.x - A.x) * t;
                const hy = A.y + (B.y - A.y) * t + arcLift * Math.sin(t * Math.PI);
                hook.x = hx; hook.y = hy;
                hook.rotation = Math.atan2(B.y - hy, B.x - hx) - Math.PI / 2;
                drawChain(hx, hy);
            },
        }, 0);

        const snagAt = throwMs / 1000;
        tl.add(() => {
            if (typeof opts.onSnag === "function") { try { opts.onSnag(); } catch (e) { /* */ } }
            // Sem estrela cartoon — só fisgada + tremor.
            shakeWrap.x = 0; shakeWrap.y = 0;
        }, snagAt);
        const snagShake = { t: 0 };
        tl.to(snagShake, {
            t: 1, duration: 0.26, ease: "power2.out",
            onUpdate: () => { const s = (1 - snagShake.t) * unit * 0.2; shakeWrap.x = (Math.random() - 0.5) * s; shakeWrap.y = (Math.random() - 0.5) * s; },
        }, snagAt);

        // Puxão: ponto de fisga viaja B → D; corrente encurta; carta segue (onPull).
        tl.to(pullProxy, {
            t: 1, duration: pullMs / 1000, ease: "power2.inOut",
            onUpdate: () => {
                const t = pullProxy.t;
                const gx = B.x + (D.x - B.x) * t;
                const gy = B.y + (D.y - B.y) * t;
                hook.x = gx; hook.y = gy;
                hook.rotation = Math.atan2(gy - A.y, gx - A.x) - Math.PI / 2;
                drawChain(gx, gy);
                if (typeof opts.onPull === "function") { try { opts.onPull(t); } catch (e) { /* */ } }
            },
        }, snagAt + 0.02);

        const landAt = snagAt + 0.02 + pullMs / 1000;
        tl.add(() => {
            // Sem impacto estrela cartoon na aterrissagem.
        }, landAt);
        tl.to(chainG, { alpha: 0, duration: 0.22, ease: "power2.out" }, landAt);
        tl.to(hook, { alpha: 0, duration: 0.22, ease: "power2.out" }, landAt);

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        const maxSec = (throwMs + pullMs) / 1000 + 1.2;
        await awaitPixiTimeline(tl, shakeWrap, maxSec);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * ASSASSINAR — adaga perfurando o alvo (Pixi+GSAP, sem traços cartoon).
     * Duração máxima ~3.35s.
     * ============================================================ */
    async function playAssassinScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x; let cy = opts.cy ?? opts.y;
        const fromX = opts.fromX ?? cx;
        const fromY = opts.fromY ?? cy;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const fm = frame.map(fromX, fromY);
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const theme = { core: 0xff3040, spark: 0xff8088, flash: 0xffffff, ring: 0x4a0810 };

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const vignette = new PIXI.Graphics();
        vignette.beginFill(0x120008, 0.42);
        const vw = frame.fullscreen
            ? (a.screen?.width || a.renderer?.width || frame.clipW)
            : frame.clipW;
        const vh = frame.fullscreen
            ? (a.screen?.height || a.renderer?.height || frame.clipH)
            : frame.clipH;
        vignette.drawRect(0, 0, vw, vh);
        vignette.endFill();
        vignette.alpha = 0;
        vignette.eventMode = "none";
        container.addChild(vignette);

        const daggerWrap = new PIXI.Container();
        daggerWrap.x = fm.x; daggerWrap.y = fm.y;
        daggerWrap.alpha = 0;
        container.addChild(daggerWrap);

        const daggerEmoji = new PIXI.Text("🗡️", {
            fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
            fontSize: Math.round(unit * 2.1),
        });
        daggerEmoji.anchor.set(0.5, 0.85);
        daggerWrap.addChild(daggerEmoji);

        const trailOrbs = [];
        for (let i = 0; i < 8; i++) {
            const o = makeSoftOrb(PIXI, 0xff5050, unit * (0.04 + i * 0.01), 0.55);
            o.alpha = 0;
            container.addChild(o);
            trailOrbs.push(o);
        }

        const hitBloom = makeSoftBloom(PIXI, theme, unit, 1.5);
        hitBloom.x = cx; hitBloom.y = cy;
        hitBloom.alpha = 0;
        container.addChild(hitBloom);

        const hitFlash = makeSoftOrb(PIXI, 0xffffff, unit * 0.38, 0.92);
        hitFlash.x = cx; hitFlash.y = cy;
        hitFlash.alpha = 0;
        container.addChild(hitFlash);

        const drops = [];
        const dropN = n(cinematic ? 28 : 18);
        for (let i = 0; i < dropN; i++) {
            const col = i % 3 === 0 ? 0xff3040 : (i % 3 === 1 ? 0xc81d1d : 0x8a0000);
            const g = makeSoftOrb(PIXI, col, unit * (0.03 + Math.random() * 0.05), 0.9);
            g.visible = false;
            container.addChild(g);
            drops.push({ g, vx: 0, vy: 0, vr: (Math.random() - 0.5) * 0.35 });
        }

        const partProxy = { t: 0 };
        const shakeP = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        const aimRot = Math.atan2(cy - fm.y, cx - fm.x) + Math.PI / 2;
        daggerWrap.rotation = aimRot - 0.6;

        tl.to(vignette, { alpha: 1, duration: 0.18, ease: "sine.out" }, 0);
        tl.to(daggerWrap, { alpha: 1, duration: 0.12 }, 0.04);
        tl.to(daggerWrap.scale, { x: 1.15, y: 1.15, duration: 0.2, ease: "back.out(1.6)" }, 0.04);
        tl.to(daggerWrap, {
            x: cx - unit * 0.08,
            y: cy - unit * 0.55,
            rotation: aimRot + 0.15,
            duration: 0.52,
            ease: "power2.out",
            onUpdate: () => {
                trailOrbs.forEach((o, i) => {
                    const lag = i / trailOrbs.length;
                    o.x = daggerWrap.x + (cx - daggerWrap.x) * lag * 0.35;
                    o.y = daggerWrap.y + (cy - daggerWrap.y) * lag * 0.35;
                    o.alpha = 0.45 * (1 - lag);
                });
            },
        }, 0.08);

        const hitAt = 0.94;
        tl.addLabel("hit", hitAt);
        tl.to(daggerWrap, {
            x: cx,
            y: cy,
            rotation: aimRot + 0.45,
            duration: 0.18,
            ease: "power4.in",
        }, hitAt - 0.18);

        tl.add(() => {
            if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            hitBloom.alpha = 1;
            hitFlash.alpha = 1;
            drops.forEach((p) => {
                const ang = Math.random() * Math.PI * 2;
                const spd = (cinematic ? 9 : 6) + Math.random() * (cinematic ? 14 : 9);
                p.vx = Math.cos(ang) * spd;
                p.vy = Math.sin(ang) * spd - 4;
                p.g.visible = true;
                p.g.x = cx;
                p.g.y = cy;
                p.g.alpha = 1;
            });
        }, "hit");

        tl.to(hitBloom, { alpha: 0, duration: 0.42, ease: "power2.out" }, "hit");
        tl.to(hitBloom.scale, { x: 2.2, y: 2.2, duration: 0.38, ease: "power2.out" }, "hit");
        tl.to(hitFlash, { alpha: 0, duration: 0.28, ease: "power2.out" }, "hit+=0.04");
        tl.to(hitFlash.scale, { x: 2.6, y: 2.6, duration: 0.3, ease: "power2.out" }, "hit");

        tl.to(shakeP, {
            t: 1, duration: 0.32, ease: "power2.out",
            onUpdate: () => {
                const s = (1 - shakeP.t) * (cinematic ? 16 : 10);
                shakeWrap.x = (Math.random() - 0.5) * s;
                shakeWrap.y = (Math.random() - 0.5) * s;
            },
        }, "hit");

        tl.to(partProxy, {
            t: 1, duration: 0.65, ease: "none",
            onUpdate: () => {
                drops.forEach((p) => {
                    p.g.x += p.vx; p.g.y += p.vy; p.vy += 0.45; p.vx *= 0.97;
                    p.g.rotation += p.vr;
                    p.g.alpha = Math.max(0, 1 - partProxy.t * 1.15);
                });
            },
        }, "hit");

        tl.to(daggerWrap, {
            x: cx + unit * 0.35,
            y: cy - unit * 1.1,
            alpha: 0,
            rotation: aimRot + 0.9,
            duration: 0.3,
            ease: "power2.in",
        }, "hit+=0.12");

        tl.to(vignette, { alpha: 0, duration: 0.35, ease: "sine.in" }, "hit+=0.22");
        tl.to(trailOrbs, { alpha: 0, duration: 0.25 }, "hit+=0.15");

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        await awaitPixiTimeline(tl, shakeWrap, 3.35);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * DEVORAR — mordida local sobre o campeão aliado (sem cartoon).
     * opts: { cx, cy, local, onImpact }
     * ============================================================ */
    async function playDevourScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const local = opts.local !== false;
        const cinematic = !local && (opts.cinematic !== false && (!!opts.cinematic || wants));
        if (!cinematic && !wants && !canUse()) return false;
        if (cinematic || wants) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let cx = opts.cx ?? opts.x; let cy = opts.cy ?? opts.y;
        if (cx == null || cy == null) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic || wants);
        const a = await ensureApp(cinematic || wants);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m = frame.map(cx, cy); cx = m.x; cy = m.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(local ? 0.92 : 1);
        const theme = themeFromRecipe({ hue: 350 });

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const clipR = unit * (local ? 2.55 : 2.9);
        const maskG = new PIXI.Graphics();
        maskG.beginFill(0xffffff, 1);
        maskG.drawCircle(cx, cy, clipR);
        maskG.endFill();
        container.addChild(maskG);
        container.mask = maskG;

        const biteRoot = new PIXI.Container();
        biteRoot.x = cx; biteRoot.y = cy;
        container.addChild(biteRoot);

        const abyssGlow = dfSprite(PIXI, dfGlowTex(PIXI, 0x3a0818, 0x000000), true);
        abyssGlow.alpha = 0;
        abyssGlow.scale.set(unit * 0.0065);
        biteRoot.addChild(abyssGlow);

        const throatGlow = makeSoftBloom(PIXI, theme, unit, 1.15);
        throatGlow.alpha = 0;
        biteRoot.addChild(throatGlow);

        const throatDark = dfSprite(PIXI, dfGlowTex(PIXI, 0x1a0208, 0x000000), true);
        throatDark.scale.set(unit * 0.0048, unit * 0.0032);
        throatDark.alpha = 0;
        biteRoot.addChild(throatDark);

        const jawScale = local ? 1.05 : 1.14;
        const upperJaw = makeDevourJaw(PIXI, unit * jawScale, true);
        upperJaw.y = -unit * 2.15;
        upperJaw.alpha = 0;
        biteRoot.addChild(upperJaw);

        const lowerJaw = makeDevourJaw(PIXI, unit * jawScale, false);
        lowerJaw.y = unit * 2.15;
        lowerJaw.alpha = 0;
        biteRoot.addChild(lowerJaw);

        const screenWash = new PIXI.Graphics();
        screenWash.beginFill(0x0a0006, 0.48);
        screenWash.drawCircle(0, 0, clipR * 1.05);
        screenWash.endFill();
        screenWash.alpha = 0;
        screenWash.eventMode = "none";
        biteRoot.addChildAt(screenWash, 0);

        const vignette = dfSprite(PIXI, dfGlowTex(PIXI, 0x4a0818, 0x000000), true);
        vignette.x = cx; vignette.y = cy;
        vignette.alpha = 0;
        vignette.scale.set(unit * 0.016, unit * 0.014);
        shakeWrap.addChild(vignette);

        const shockBloom = dfSprite(PIXI, dfGlowTex(PIXI, 0xff5070, 0x2a0810), true);
        shockBloom.x = cx; shockBloom.y = cy;
        shockBloom.alpha = 0;
        shockBloom.scale.set(unit * 0.002);
        container.addChild(shockBloom);

        const chompGlyphs = [];
        const glyphN = n(local ? 5 : 7);
        for (let i = 0; i < glyphN; i++) {
            const gt = makeEmojiText(PIXI, "🦷", unit * (0.38 + (i % 2) * 0.08), {
                scaleY: i % 2 ? -1 : 1,
            });
            gt.visible = false;
            gt.alpha = 0;
            biteRoot.addChild(gt);
            const ang = (i / glyphN) * Math.PI * 2 + 0.2;
            chompGlyphs.push({
                gt, ang,
                dist: unit * (0.55 + Math.random() * 0.75),
                vr: (Math.random() - 0.5) * 0.45,
            });
        }

        const approachMist = [];
        const mistApproachN = n(local ? 6 : 10);
        for (let i = 0; i < mistApproachN; i++) {
            const am = dfSprite(PIXI, dfSmokeTex(PIXI, i % 2 ? 0x5a1028 : 0x2a0818), true);
            am.alpha = 0;
            am.scale.set(unit * 0.0018);
            am.x = cx + (Math.random() - 0.5) * unit * 0.6;
            am.y = cy + (Math.random() - 0.5) * unit * 0.45;
            container.addChild(am);
            approachMist.push({ am, oy: am.y });
        }

        const fangSparks = [];
        const sparkN = n(local ? 16 : 24);
        for (let i = 0; i < sparkN; i++) {
            const col = i % 2 ? 0xffe8ec : 0xff4060;
            const sp = dfSprite(PIXI, dfSparkTex(PIXI, col), true);
            sp.visible = false;
            sp.scale.set(unit * 0.0018 + Math.random() * unit * 0.0012);
            biteRoot.addChild(sp);
            const ang = (i / sparkN) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            fangSparks.push({ sp, ang, dist: unit * (0.35 + Math.random() * 0.85), vr: (Math.random() - 0.5) * 0.5 });
        }

        const mistPuffs = [];
        const mistN = n(local ? 8 : 12);
        for (let i = 0; i < mistN; i++) {
            const m = dfSprite(PIXI, dfSmokeTex(PIXI, i % 2 ? 0x6a1028 : 0x3a0818), true);
            m.visible = false;
            m.alpha = 0;
            m.scale.set(unit * 0.0022);
            biteRoot.addChild(m);
            mistPuffs.push({ m, ox: (Math.random() - 0.5) * unit * 0.5, oy: (Math.random() - 0.5) * unit * 0.35 });
        }

        const droplets = [];
        const dropN = n(local ? 22 : 32);
        for (let i = 0; i < dropN; i++) {
            const col = i % 3 === 0 ? 0xff5070 : (i % 3 === 1 ? 0xffa0b8 : 0x8a1830);
            const g = makeSoftOrb(PIXI, col, unit * (0.03 + Math.random() * 0.05), 0.85);
            g.visible = false;
            biteRoot.addChild(g);
            const ang = Math.random() * Math.PI * 2;
            const dist = unit * (0.5 + Math.random() * 1.1);
            droplets.push({ g, sx: Math.cos(ang) * dist, sy: Math.sin(ang) * dist, vr: (Math.random() - 0.5) * 0.35 });
        }

        const flash = makeSoftOrb(PIXI, 0xffffff, unit * 0.42, 0.92);
        flash.alpha = 0; flash.scale.set(0.12);
        biteRoot.addChild(flash);

        const shakeP = { t: 0 };
        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        tl.to(screenWash, { alpha: 0.32, duration: 0.22, ease: "sine.out" }, 0);
        tl.to(vignette, { alpha: 0.58, duration: 0.22, ease: "sine.out" }, 0);
        approachMist.forEach((am, i) => {
            tl.to(am.am, { alpha: 0.42, duration: 0.28, ease: "sine.out" }, 0.04 + i * 0.025);
            tl.to(am.am.scale, { x: unit * 0.0038, y: unit * 0.0038, duration: 0.45, ease: "sine.out" }, 0.06 + i * 0.025);
        });
        tl.to(abyssGlow, { alpha: 0.65, duration: 0.2, ease: "sine.out" }, 0.02);
        tl.to(throatDark, { alpha: 0.72, duration: 0.18, ease: "sine.out" }, 0.04);
        tl.to(upperJaw, { alpha: 1, y: -unit * 0.68, duration: 0.32, ease: "power2.out" }, 0.04);
        tl.to(lowerJaw, { alpha: 1, y: unit * 0.68, duration: 0.32, ease: "power2.out" }, 0.04);
        tl.to(throatGlow, { alpha: 0.45, duration: 0.22 }, 0.08);

        const chompAt = 0.38;
        tl.addLabel("chomp", chompAt);
        tl.add(() => {
            if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }
            droplets.forEach((p) => {
                p.g.visible = true;
                p.g.x = p.sx; p.g.y = p.sy; p.g.alpha = 1;
            });
            fangSparks.forEach((fs) => {
                fs.sp.visible = true;
                fs.sp.x = Math.cos(fs.ang) * unit * 0.12;
                fs.sp.y = Math.sin(fs.ang) * unit * 0.12;
                fs.sp.alpha = 1;
            });
            mistPuffs.forEach((mp) => {
                mp.m.visible = true;
                mp.m.x = mp.ox; mp.m.y = mp.oy; mp.m.alpha = 0.55;
            });
            chompGlyphs.forEach((cg) => {
                cg.gt.visible = true;
                cg.gt.alpha = 0.92;
                cg.gt.x = Math.cos(cg.ang) * unit * 0.08;
                cg.gt.y = Math.sin(cg.ang) * unit * 0.08;
            });
            shockBloom.alpha = 0.95;
            shockBloom.scale.set(unit * 0.002);
        }, "chomp");
        tl.to(upperJaw, { y: -unit * 0.04, duration: 0.11, ease: "power3.in" }, "chomp");
        tl.to(lowerJaw, { y: unit * 0.04, duration: 0.11, ease: "power3.in" }, "chomp");
        tl.to(shockBloom.scale, { x: unit * 0.011, y: unit * 0.011, duration: 0.32, ease: "power2.out" }, "chomp");
        tl.to(shockBloom, { alpha: 0, duration: 0.32, ease: "power2.in" }, "chomp+=0.06");
        tl.to(flash, { alpha: 0.92, duration: 0.04 }, "chomp");
        tl.to(flash.scale, { x: 2.6, y: 2.6, duration: 0.14, ease: "power2.out" }, "chomp");
        tl.to(flash, { alpha: 0, duration: 0.22 }, "chomp+=0.06");
        tl.to(throatGlow, { alpha: 0.88, duration: 0.08 }, "chomp");
        tl.to(throatGlow.scale, { x: 1.45, y: 1.45, duration: 0.22, ease: "power2.out" }, "chomp");
        tl.to(shakeP, {
            t: 1, duration: 0.38, ease: "power2.out",
            onUpdate: () => {
                const sh = (1 - shakeP.t) * 11;
                shakeWrap.x = (Math.random() - 0.5) * sh;
                shakeWrap.y = (Math.random() - 0.5) * sh;
            },
        }, "chomp");
        tl.to({}, {
            duration: 0.52, ease: "power2.in",
            onUpdate: function () {
                const p = this.progress();
                droplets.forEach((d) => {
                    d.g.x = d.sx * (1 - p * 0.88);
                    d.g.y = d.sy * (1 - p * 0.88);
                    d.g.alpha = Math.max(0, 1 - p * 1.1);
                    d.g.rotation += d.vr;
                });
                fangSparks.forEach((fs) => {
                    fs.sp.x = Math.cos(fs.ang) * fs.dist * p;
                    fs.sp.y = Math.sin(fs.ang) * fs.dist * p;
                    fs.sp.alpha = Math.max(0, 1 - p * 1.15);
                    fs.sp.rotation += fs.vr;
                });
                mistPuffs.forEach((mp) => {
                    mp.m.y = mp.oy - p * unit * 0.55;
                    mp.m.alpha = Math.max(0, 0.55 * (1 - p * 0.95));
                    mp.m.scale.set(unit * (0.0022 + p * 0.0028));
                });
                chompGlyphs.forEach((cg) => {
                    cg.gt.x = Math.cos(cg.ang) * cg.dist * p;
                    cg.gt.y = Math.sin(cg.ang) * cg.dist * p;
                    cg.gt.alpha = Math.max(0, 0.92 * (1 - p * 1.05));
                    cg.gt.rotation += cg.vr;
                });
                approachMist.forEach((am) => {
                    am.am.y = am.oy - p * unit * 0.35;
                    am.am.alpha = Math.max(0, 0.42 * (1 - p));
                });
            },
        }, "chomp");

        tl.to(upperJaw, { y: -unit * 1.85, alpha: 0, duration: 0.28, ease: "power2.in" }, "chomp+=0.18");
        tl.to(lowerJaw, { y: unit * 1.85, alpha: 0, duration: 0.28, ease: "power2.in" }, "chomp+=0.18");
        tl.to(throatDark, { alpha: 0, duration: 0.3, ease: "power2.out" }, "chomp+=0.22");
        tl.to(abyssGlow, { alpha: 0, duration: 0.32, ease: "power2.out" }, "chomp+=0.22");
        tl.to(throatGlow, { alpha: 0, duration: 0.34, ease: "power2.out" }, "chomp+=0.24");
        tl.to(vignette, { alpha: 0, duration: 0.35, ease: "sine.in" }, "chomp+=0.2");
        tl.to(screenWash, { alpha: 0, duration: 0.38, ease: "sine.in" }, "chomp+=0.22");

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        await awaitPixiTimeline(tl, shakeWrap, 1.55);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * FUMAÇA TÓXICA — nuvens verdes borbulhantes + caveiras nos alvos.
     * opts.targets: [{ cx, cy }]
     * ============================================================ */
    async function playToxicSmokeScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        const targets = Array.isArray(opts.targets) ? opts.targets : [];
        if (!targets.length) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const TOX = 0x6bdc4a;
        const DEEP = 0x1a4020;
        const MIST = 0x9ef07a;

        try {
        const shakeWrap = new PIXI.Container(); a.stage.addChild(shakeWrap);
        const container = new PIXI.Container(); shakeWrap.addChild(container);

        const tl = await gsapBridge.createTimeline();
        if (!tl) { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

        const wash = dfSprite(PIXI, dfGlowTex(PIXI, MIST, DEEP), true);
        wash.alpha = 0; wash.scale.set(4.5, 3.2);
        const avgX = targets.reduce((s, t) => s + (t.cx ?? t.x ?? 0), 0) / targets.length;
        const avgY = targets.reduce((s, t) => s + (t.cy ?? t.y ?? 0), 0) / targets.length;
        const wm = frame.map(avgX, avgY);
        wash.x = wm.x; wash.y = wm.y;
        container.addChildAt(wash, 0);
        tl.to(wash, { alpha: 0.22, duration: 0.35, ease: "sine.out" }, 0);
        tl.to(wash, { alpha: 0, duration: 0.55, ease: "sine.in" }, 0.75);

        let maxEnd = 0;
        targets.forEach((tg, ti) => {
            const mp = frame.map(tg.cx ?? tg.x, tg.cy ?? tg.y);
            const tcx = mp.x; const tcy = mp.y;
            const baseAt = ti * 0.12;

            const bloom = dfSprite(PIXI, dfGlowTex(PIXI, TOX, DEEP), true);
            bloom.x = tcx; bloom.y = tcy; bloom.alpha = 0; bloom.scale.set(0.4);
            container.addChild(bloom);
            tl.to(bloom, { alpha: 0.85, duration: 0.22, ease: "power2.out" }, baseAt);
            tl.to(bloom.scale, { x: 2.4, y: 2.4, duration: 0.85, ease: "sine.out" }, baseAt);
            tl.to(bloom, { alpha: 0, duration: 0.45, ease: "power2.in" }, baseAt + 0.55);

            const ring = new PIXI.Graphics();
            ring.lineStyle(Math.max(1.5, unit * 0.035), MIST, 0.75);
            ring.drawCircle(0, 0, unit * 0.42);
            ring.x = tcx; ring.y = tcy; ring.alpha = 0; ring.scale.set(0.35);
            container.addChild(ring);
            tl.to(ring, { alpha: 0.9, duration: 0.15 }, baseAt + 0.08);
            tl.to(ring.scale, { x: 2.6, y: 2.6, duration: 0.72, ease: "power2.out" }, baseAt + 0.08);
            tl.to(ring, { alpha: 0, duration: 0.38, ease: "power2.in" }, baseAt + 0.5);

            const wispN = n(cinematic ? 16 : 10);
            for (let i = 0; i < wispN; i++) {
                const wisp = dfSprite(PIXI, dfGlowTex(PIXI, i % 3 ? MIST : TOX, DEEP), true);
                const ang = (Math.PI * 2 * i) / wispN + (Math.random() - 0.5) * 0.4;
                wisp.x = tcx + Math.cos(ang) * unit * 0.15;
                wisp.y = tcy + unit * 0.25;
                wisp.alpha = 0;
                wisp.scale.set(0.15 + Math.random() * 0.2);
                container.addChild(wisp);
                const rise = unit * (0.8 + Math.random() * 1.1);
                const drift = (Math.random() - 0.5) * unit * 0.9;
                const at = baseAt + i * 0.025;
                tl.to(wisp, { alpha: 0.75 + Math.random() * 0.2, duration: 0.2 }, at);
                tl.to(wisp, {
                    x: wisp.x + drift,
                    y: wisp.y - rise,
                    duration: 1.05 + Math.random() * 0.35,
                    ease: "sine.out",
                }, at);
                tl.to(wisp.scale, { x: wisp.scale.x * 1.8, y: wisp.scale.y * 1.8, duration: 0.9, ease: "sine.out" }, at);
                tl.to(wisp, { alpha: 0, duration: 0.35, ease: "power2.in" }, at + 0.75);
                maxEnd = Math.max(maxEnd, at + 1.15);
            }

            const orbN = n(cinematic ? 12 : 7);
            for (let i = 0; i < orbN; i++) {
                const orb = makeSoftOrb(PIXI, i % 2 ? TOX : MIST, unit * (0.06 + Math.random() * 0.05), 0.88);
                orb.x = tcx; orb.y = tcy + unit * 0.15; orb.visible = false;
                container.addChild(orb);
                const a2 = (Math.PI * 2 * i) / orbN;
                const dist = unit * (0.55 + Math.random() * 1.05);
                const at = baseAt + 0.12 + i * 0.02;
                tl.add(() => { orb.visible = true; }, at);
                tl.to(orb, {
                    x: tcx + Math.cos(a2) * dist,
                    y: tcy - unit * 0.35 + Math.sin(a2) * dist * 0.45,
                    alpha: 0,
                    duration: 0.75 + Math.random() * 0.35,
                    ease: "power2.out",
                }, at);
                maxEnd = Math.max(maxEnd, at + 1.0);
            }

            const skullAt = baseAt + 0.2;
            const skullEmoji = makeEmojiText(PIXI, "☣️", unit * 0.82);
            skullEmoji.x = tcx; skullEmoji.y = tcy + unit * 0.1; skullEmoji.alpha = 0; skullEmoji.scale.set(0.35);
            container.addChild(skullEmoji);
            tl.to(skullEmoji, { alpha: 1, duration: 0.18 }, skullAt);
            tl.to(skullEmoji.scale, { x: 1.05, y: 1.05, duration: 0.42, ease: "back.out(1.6)" }, skullAt);
            tl.to(skullEmoji, { y: skullEmoji.y - unit * 0.65, duration: 0.95, ease: "sine.out" }, skullAt);
            tl.to(skullEmoji, { alpha: 0, duration: 0.35, ease: "power2.in" }, skullAt + 0.65);

            maxEnd = Math.max(maxEnd, skullAt + 1.05);
        });
        if (typeof opts.onImpact === "function") { try { opts.onImpact(); } catch (e) { /* */ } }

        tl.add(() => { try { shakeWrap.destroy({ children: true }); } catch (e) { /* */ } });
        await awaitPixiTimeline(tl, shakeWrap, maxEnd + 1.2);
        sweepOrphanScenes();
        return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * ACELERAÇÃO (Talento) — bota em dash, rastro de fogo e faíscas.
     * opts: { fromX, fromY, midX, midY, toX, toY, cinematic }
     * ============================================================ */
    async function playAceleracaoScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let fromX = opts.fromX; let fromY = opts.fromY;
        let midX = opts.midX; let midY = opts.midY;
        let toX = opts.toX; let toY = opts.toY;
        if ([fromX, fromY, toX, toY].some((v) => v == null)) return false;
        if (midX == null) midX = (fromX + toX) / 2;
        if (midY == null) midY = (fromY + toY) / 2;

        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, cinematic);
        const m0 = frame.map(fromX, fromY);
        const mm = frame.map(midX, midY);
        const m1 = frame.map(toX, toY);
        fromX = m0.x; fromY = m0.y;
        midX = mm.x; midY = mm.y;
        toX = m1.x; toY = m1.y;

        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const FIRE = 0xff9030;
        const GOLD = 0xffd050;
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const wash = dfSprite(PIXI, dfGlowTex(PIXI, GOLD, 0x401808), true);
            wash.alpha = 0; wash.scale.set(3.8, 2.6);
            wash.x = (fromX + toX) / 2; wash.y = (fromY + toY) / 2;
            root.addChildAt(wash, 0);
            tl.to(wash, { alpha: 0.18, duration: 0.28, ease: "sine.out" }, 0);
            tl.to(wash, { alpha: 0, duration: 0.5, ease: "sine.in" }, 0.65);

            const boot = makeEmojiText(PIXI, "👢", unit * 0.95);
            boot.x = fromX; boot.y = fromY; boot.alpha = 0; boot.scale.set(0.5);
            root.addChild(boot);
            tl.to(boot, { alpha: 1, duration: 0.12 }, 0);
            tl.to(boot, { x: midX, y: midY, duration: 0.42, ease: "power2.in" }, 0.04);
            tl.to(boot, { x: toX, y: toY, duration: 0.4, ease: "power2.out" }, 0.46);
            tl.to(boot.scale, { x: 1.15, y: 1.15, duration: 0.35, ease: "back.out(1.4)" }, 0.04);
            tl.to(boot, { rotation: 0.45, duration: 0.82, ease: "sine.inOut" }, 0.04);
            tl.to(boot, { alpha: 0, duration: 0.22, ease: "power2.in" }, 0.72);

            const trailN = n(cinematic ? 14 : 9);
            for (let i = 0; i < trailN; i++) {
                const tr = dfSprite(PIXI, dfGlowTex(PIXI, i % 2 ? FIRE : GOLD, 0x501008), true);
                tr.alpha = 0;
                tr.scale.set(0.12 + (i % 3) * 0.04);
                root.addChild(tr);
                const t0 = 0.06 + i * 0.035;
                const px = fromX + (midX - fromX) * (i / trailN);
                const py = fromY + (midY - fromY) * (i / trailN);
                tr.x = px; tr.y = py;
                tl.to(tr, { alpha: 0.85, duration: 0.08 }, t0);
                tl.to(tr, {
                    x: px + (toX - fromX) * 0.35,
                    y: py + (toY - fromY) * 0.35 - unit * 0.08,
                    duration: 0.55,
                    ease: "power2.out",
                }, t0);
                tl.to(tr.scale, { x: tr.scale.x * 2.2, y: tr.scale.y * 0.55, duration: 0.5, ease: "sine.out" }, t0);
                tl.to(tr, { alpha: 0, duration: 0.25, ease: "power2.in" }, t0 + 0.38);
            }

            const sparkGlyphs = ["⚡", "💨", "✨"];
            for (let i = 0; i < n(cinematic ? 10 : 6); i++) {
                const sp = makeEmojiText(PIXI, sparkGlyphs[i % sparkGlyphs.length], unit * (0.42 + Math.random() * 0.28));
                sp.x = fromX + (Math.random() - 0.5) * unit * 0.4;
                sp.y = fromY + (Math.random() - 0.5) * unit * 0.25;
                sp.alpha = 0;
                root.addChild(sp);
                const at = 0.18 + i * 0.05;
                const ang = Math.atan2(toY - fromY, toX - fromX) + (Math.random() - 0.5) * 0.9;
                const dist = unit * (0.5 + Math.random() * 1.2);
                tl.to(sp, { alpha: 1, duration: 0.1 }, at);
                tl.to(sp, {
                    x: sp.x + Math.cos(ang) * dist,
                    y: sp.y + Math.sin(ang) * dist,
                    rotation: (Math.random() - 0.5) * 1.4,
                    duration: 0.62 + Math.random() * 0.25,
                    ease: "power2.out",
                }, at);
                tl.to(sp, { alpha: 0, duration: 0.28, ease: "power2.in" }, at + 0.45);
            }

            const burstAt = 0.78;
            const burst = dfSprite(PIXI, dfGlowTex(PIXI, GOLD, FIRE), true);
            burst.x = toX; burst.y = toY; burst.alpha = 0; burst.scale.set(0.25);
            root.addChild(burst);
            tl.to(burst, { alpha: 0.95, duration: 0.12 }, burstAt);
            tl.to(burst.scale, { x: 2.1, y: 2.1, duration: 0.48, ease: "power2.out" }, burstAt);
            tl.to(burst, { alpha: 0, duration: 0.35, ease: "power2.in" }, burstAt + 0.35);

            const bolt = makeEmojiText(PIXI, "⚡", unit * 1.05);
            bolt.x = toX; bolt.y = toY; bolt.alpha = 0; bolt.scale.set(0.2);
            root.addChild(bolt);
            tl.to(bolt, { alpha: 1, duration: 0.14 }, burstAt);
            tl.to(bolt.scale, { x: 1.2, y: 1.2, duration: 0.38, ease: "back.out(2)" }, burstAt);
            tl.to(bolt, { alpha: 0, duration: 0.32, ease: "power2.in" }, burstAt + 0.45);

            if (typeof opts.onImpact === "function") tl.add(() => { try { opts.onImpact(); } catch (e) { /* */ } }, burstAt);

            tl.add(() => { try { root.destroy({ children: true }); } catch (e) { /* */ } });
            await awaitPixiTimeline(tl, root, burstAt + 1.1);
            sweepOrphanScenes();
            return true;
        } finally { frame.end(); }
    }

    /* ============================================================
     * DESACELERAR — feixe temporal + relógio + ondas (Pixi+GSAP).
     * ============================================================ */
    async function playDesacelerarScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        let fromX = opts.fromX; let fromY = opts.fromY;
        let toX = opts.toX; let toY = opts.toY;
        if ([fromX, fromY, toX, toY].some((v) => v == null)) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const m0 = frame.map(fromX, fromY);
        const m1 = frame.map(toX, toY);
        fromX = m0.x; fromY = m0.y; toX = m1.x; toY = m1.y;
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const GOLD = 0xffd76a;
        const CYAN = 0x6ad4ff;
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const dx = toX - fromX; const dy = toY - fromY;
            const dist = Math.hypot(dx, dy) || 1;
            const ang = Math.atan2(dy, dx);

            const beamWrap = new PIXI.Container();
            beamWrap.x = fromX; beamWrap.y = fromY; beamWrap.rotation = ang;
            root.addChild(beamWrap);
            const beam = new PIXI.Graphics();
            beam.beginFill(CYAN, 0.55);
            beam.drawRoundedRect(0, -unit * 0.12, dist, unit * 0.24, unit * 0.08);
            beam.endFill();
            if (PIXI.BLEND_MODES) beam.blendMode = PIXI.BLEND_MODES.ADD;
            beam.scale.x = 0.02;
            beamWrap.addChild(beam);
            const beamCore = new PIXI.Graphics();
            beamCore.beginFill(GOLD, 0.85);
            beamCore.drawRoundedRect(0, -unit * 0.05, dist, unit * 0.1, unit * 0.04);
            beamCore.endFill();
            if (PIXI.BLEND_MODES) beamCore.blendMode = PIXI.BLEND_MODES.ADD;
            beamCore.scale.x = 0.02;
            beamWrap.addChild(beamCore);

            tl.to(beam.scale, { x: 1, duration: 0.55, ease: "power2.out" }, 0);
            tl.to(beamCore.scale, { x: 1, duration: 0.48, ease: "power2.out" }, 0.04);

            const ripple = new PIXI.Graphics();
            ripple.lineStyle(Math.max(2, unit * 0.04), CYAN, 0.85);
            ripple.drawCircle(0, 0, unit * 0.35);
            ripple.x = toX; ripple.y = toY; ripple.alpha = 0; ripple.scale.set(0.3);
            root.addChild(ripple);
            tl.to(ripple, { alpha: 1, duration: 0.12 }, 0.48);
            tl.to(ripple.scale, { x: 3.2, y: 3.2, duration: 0.65, ease: "power2.out" }, 0.48);
            tl.to(ripple, { alpha: 0, duration: 0.35, ease: "power2.in" }, 0.78);

            const clock = new PIXI.Container();
            clock.x = toX; clock.y = toY; clock.alpha = 0; clock.scale.set(0.28);
            root.addChild(clock);
            const clockEmoji = makeEmojiText(PIXI, "⏳", unit * 0.95);
            clockEmoji.alpha = 0.92;
            clock.addChild(clockEmoji);
            const face = new PIXI.Graphics();
            face.lineStyle(Math.max(2, unit * 0.05), GOLD, 0.95);
            face.beginFill(0x1a2840, 0.88);
            face.drawCircle(0, 0, unit * 0.62);
            face.endFill();
            clock.addChildAt(face, 0);
            const hour = new PIXI.Graphics();
            hour.beginFill(GOLD, 1);
            hour.drawRect(-unit * 0.04, -unit * 0.32, unit * 0.08, unit * 0.32);
            hour.endFill();
            hour.pivot.y = 0;
            clock.addChild(hour);
            const minute = new PIXI.Graphics();
            minute.beginFill(CYAN, 1);
            minute.drawRect(-unit * 0.035, -unit * 0.42, unit * 0.07, unit * 0.42);
            minute.endFill();
            minute.pivot.y = 0;
            clock.addChild(minute);

            tl.add(() => { if (typeof opts.onAfflict === "function") opts.onAfflict(); }, 0.72);
            tl.to(clock, { alpha: 1, duration: 0.22 }, 0.72);
            tl.to(clock.scale, { x: 1.15, y: 1.15, duration: 0.52, ease: "back.out(1.8)" }, 0.72);
            tl.to(clockEmoji, { rotation: Math.PI * 0.15, duration: 0.55, yoyo: true, repeat: 2, ease: "sine.inOut" }, 0.78);
            tl.to(hour, { rotation: -Math.PI * 0.35, duration: 0.65, ease: "power2.out" }, 0.78);
            tl.to(minute, { rotation: Math.PI * 1.1, duration: 0.78, ease: "power2.out" }, 0.78);

            const sparks = [];
            for (let i = 0; i < n(cinematic ? 14 : 8); i++) {
                const s = makeSoftOrb(PIXI, i % 2 ? GOLD : CYAN, unit * 0.07, 0.9);
                s.x = toX; s.y = toY; s.visible = false;
                root.addChild(s);
                const a2 = (Math.PI * 2 * i) / 14;
                sparks.push({ s, a: a2, d: unit * (0.5 + Math.random() * 1.4) });
            }
            tl.add(() => { sparks.forEach((sp) => { sp.s.visible = true; }); }, 0.82);
            tl.to({}, {
                duration: 0.75,
                ease: "power2.out",
                onUpdate: function () {
                    const p = this.progress();
                    sparks.forEach((sp) => {
                        sp.s.x = toX + Math.cos(sp.a) * sp.d * p;
                        sp.s.y = toY + Math.sin(sp.a) * sp.d * p * 0.85 - unit * 0.2 * p;
                        sp.s.alpha = Math.max(0, 1 - p * 1.1);
                    });
                },
            }, 0.82);

            await awaitPixiTimeline(tl, root, 3.0);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    /* ============================================================
     * MALDIÇÃO DOS SETE MARES — ondas oceânicas + runas (Pixi+GSAP).
     * ============================================================ */
    async function playMaldicaoSeteMaresScene(opts = {}) {
        const wants = global.DfVfxEngine?.wantsGpuPresentation?.() || false;
        const cinematic = opts.cinematic !== false && (!!opts.cinematic || wants);
        if (cinematic) { setQuality("full"); global.DfGsapBridge?.setQuality?.("full"); }
        else if (!canUse()) return false;
        const hits = opts.hits || [];
        if (!hits.length) return false;
        const gsapBridge = global.DfGsapBridge;
        const gsap = await gsapBridge?.ensureGsap?.(cinematic);
        const a = await ensureApp(cinematic);
        if (!a || !global.PIXI || !gsap || !gsapBridge) return false;
        const frame = pixiSceneFrame(a, true);
        const PIXI = global.PIXI;
        const unit = cardUnit(1);
        const SEA = 0x2a8cff;
        const DEEP = 0x0a2848;
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const tl = await gsapBridge.createTimeline();
            if (!tl) { try { root.destroy({ children: true }); } catch (e) { /* */ } frame.end(); return false; }

            const wash = new PIXI.Graphics();
            const scd = scenePixels();
            wash.beginFill(DEEP, 0.42);
            wash.drawRect(0, 0, scd.w, scd.h);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);
            tl.to(wash, { alpha: 1, duration: 0.35, ease: "sine.out" }, 0);

            let at = 0.15;
            hits.forEach((raw, hi) => {
                const m = frame.map(raw.cx, raw.cy);
                const cx = m.x; const cy = m.y;
                const wave = new PIXI.Graphics();
                wave.lineStyle(Math.max(2, unit * 0.05), SEA, 0.9);
                wave.drawEllipse(0, 0, unit * 0.9, unit * 0.45);
                wave.x = cx; wave.y = cy + unit * 0.35;
                wave.alpha = 0; wave.scale.set(0.25);
                root.addChild(wave);
                tl.to(wave, { alpha: 0.95, duration: 0.14 }, at);
                tl.to(wave.scale, { x: 3.6, y: 2.4, duration: 0.72, ease: "power2.out" }, at);
                tl.to(wave, { alpha: 0, duration: 0.38, ease: "power2.in" }, at + 0.42);

                const rune = new PIXI.Text("✦", {
                    fontFamily: "Cinzel, serif",
                    fontSize: Math.round(unit * 0.55),
                    fill: 0x9ae8ff,
                    fontWeight: "900",
                });
                rune.anchor.set(0.5);
                rune.x = cx; rune.y = cy - unit * 0.15;
                rune.alpha = 0; rune.scale.set(0.4);
                root.addChild(rune);
                tl.to(rune, { alpha: 1, duration: 0.16 }, at + 0.18);
                tl.to(rune.scale, { x: 1.15, y: 1.15, duration: 0.38, ease: "back.out(2)" }, at + 0.18);
                tl.to(rune, { alpha: 0, y: cy - unit * 0.55, duration: 0.55, ease: "sine.in" }, at + 0.55);

                const fieldW = raw.fieldW ?? unit * 3.2;
                const fieldH = raw.fieldH ?? unit * 2.4;
                const spreadX = Math.max(unit * 1.2, fieldW * 0.42);
                const spreadY = Math.max(unit * 0.8, fieldH * 0.35);

                const bubbleGlyphs = ["🫧", "💧", "🌊"];
                for (let b = 0; b < (cinematic ? 18 : 11); b++) {
                    const useEmoji = b % 3 !== 1;
                    let bub;
                    if (useEmoji) {
                        bub = makeEmojiText(PIXI, bubbleGlyphs[b % bubbleGlyphs.length], unit * (0.34 + Math.random() * 0.22));
                    } else {
                        bub = makeSoftOrb(PIXI, 0x7adfff, unit * (0.05 + Math.random() * 0.06), 0.82);
                    }
                    bub.x = cx + (Math.random() - 0.5) * spreadX * 2;
                    bub.y = cy + spreadY * 0.35 + (Math.random() - 0.5) * spreadY * 0.5;
                    bub.alpha = 0;
                    bub.scale?.set?.(0.35 + Math.random() * 0.25);
                    root.addChild(bub);
                    const bat = at + 0.12 + b * 0.022;
                    const rise = unit * (0.45 + Math.random() * 1.1);
                    tl.to(bub, { alpha: 0.9, duration: 0.14 }, bat);
                    tl.to(bub, {
                        x: bub.x + (Math.random() - 0.5) * unit * 0.35,
                        y: bub.y - rise,
                        duration: 0.75 + Math.random() * 0.45,
                        ease: "sine.out",
                    }, bat);
                    if (bub.scale) {
                        tl.to(bub.scale, { x: 1.05, y: 1.05, duration: 0.55, ease: "sine.out" }, bat);
                    }
                    tl.to(bub, { alpha: 0, duration: 0.32, ease: "power1.in" }, bat + 0.55);
                }

                const foam = makeEmojiText(PIXI, "🌊", unit * 0.72);
                foam.x = cx; foam.y = cy + spreadY * 0.2; foam.alpha = 0; foam.scale.set(0.4);
                root.addChild(foam);
                tl.to(foam, { alpha: 0.85, duration: 0.2 }, at + 0.08);
                tl.to(foam.scale, { x: 1.2, y: 1.2, duration: 0.5, ease: "back.out(1.6)" }, at + 0.08);
                tl.to(foam, { alpha: 0, y: cy - unit * 0.25, duration: 0.55, ease: "sine.in" }, at + 0.45);

                at += cinematic ? 0.42 : 0.34;
            });

            tl.to(wash, { alpha: 0, duration: 0.45, ease: "sine.in" }, at + 0.2);
            await awaitPixiTimeline(tl, root, at + 1.4);
        } finally {
            frame.end();
            sweepOrphanScenes();
        }
        return true;
    }

    global.DfPixiVfx = {
        setQuality,
        canUse,
        playShatter,
        playCardDestroy,
        playImpactBurst,
        playUltimateImpact,
        playLightningStrike,
        playThunderStrikeScene,
        playRaioDuploStrikeScene,
        playIncendiarFlameScene,
        playAxeDropScene,
        playPistolThrowScene,
        playPortalEscapeScene,
        playShieldDomeScene,
        playTrickerySwapScene,
        playTrocaInjustaScene,
        playFireIceImpactScene,
        playNightmareScene,
        playDesacelerarScene,
        playMaldicaoSeteMaresScene,
        playToonExplosionScene,
        playExplosionScene,
        playDragonBreathScene,
        playMagicMissileStrikeScene,
        spawnMagicMissileOutcomeLabel,
        beginMagicMissilesBarrage,
        endMagicMissilesBarrage,
        ensureMagicMissilesBarrageScene,
        isMagicMissilesBarrageActive,
        playDragonMeteorScene,
        playHookPullScene,
        playAssassinScene,
        playDevourScene,
        playToxicSmokeScene,
        playAceleracaoScene,
        playCombatClash,
        playCombatScene,
        abortCombatScene,
        playChampionCombatDestroy,
        animarAtaque,
        isCombatSceneActive,
        playSprite,
        playUltimateSprite,
        playBombUltimateScene,
        playFireballScene,
        playLegadoHammerScene,
        playVingancaSwordScene,
        playZeroAbsolutoScene,
        playIceShatterDestroyScene,
        playFortifyUltimateScene,
        playConjureUltimateScene,
        playFreezeUltimateScene,
        playPoisonUltimateScene,
        playPoisonExplosionBurstScene,
        playPoisonBiteScene,
        playCorruptScene,
        playPotionUltimateScene,
        playCometStarfallScene,
        playVampirismUltimateScene,
        playWarUltimateScene,
        playSummonDropScene,
        clearStage,
        sweepOrphanScenes,
        forceClearStage,
        trimTextureCaches,
        stageChildCount,
        isAnySceneActive,
        reconcileSceneCounter,
        isCombatSceneActive,
        reconcileSceneCounter,
        destroy,
        ensureApp,
        ensurePixiViewportLayout,
        pixiSceneFrame,
        mapScenePoint,
        themeFromRecipe,
        resolveCardArtUrl,
        syncPixiCanvasVisibility,
    };
})(typeof window !== "undefined" ? window : globalThis);
