/**
 * Dragonfall — Pixi+GSAP: ultimates Alquimista, Paladino, Valmont, Tecnomago;
 * hub Necromancia; voo Amedrontar.
 */
(function (global) {
    "use strict";

    function px() {
        const pixi = global.DfPixiVfx;
        const PIXI = global.PIXI;
        const gsapBridge = global.DfGsapBridge;
        return { pixi, PIXI, gsapBridge };
    }

    function cardUnit(scale) {
        const s = scale ?? 1;
        const vp = Math.min(global.innerWidth || 1280, global.innerHeight || 720);
        return Math.max(52, Math.min(110, vp * 0.082)) * s;
    }

    function quadBezier(p0, p1, p2, t) {
        const u = 1 - t;
        return {
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        };
    }

    function softOrb(PIXI, col, r, alpha) {
        const g = new PIXI.Graphics();
        g.beginFill(col, alpha ?? 0.75);
        g.drawCircle(0, 0, r);
        g.endFill();
        if (PIXI.BLEND_MODES) g.blendMode = PIXI.BLEND_MODES.ADD;
        return g;
    }

    function dfRgba(hex, a) {
        const r = (hex >> 16) & 255;
        const g = (hex >> 8) & 255;
        const b = hex & 255;
        return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }

    const __ultTexCache = new Map();
    const ULT_TEX_CACHE_MAX = 64;

    function trimUltTextureCaches() {
        while (__ultTexCache.size > ULT_TEX_CACHE_MAX) {
            const key = __ultTexCache.keys().next().value;
            if (key === undefined) break;
            const tex = __ultTexCache.get(key);
            __ultTexCache.delete(key);
            try { tex?.destroy?.(true); } catch (e) { /* */ }
        }
    }

    function ultMakeTex(PIXI, key, size, paint) {
        if (__ultTexCache.has(key)) return __ultTexCache.get(key);
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        paint(cv.getContext("2d"), size);
        const tex = PIXI.Texture.from(cv);
        __ultTexCache.set(key, tex);
        trimUltTextureCaches();
        return tex;
    }

    function ultGlowTex(PIXI, coreHex, edgeHex) {
        return ultMakeTex(PIXI, "ug_" + coreHex + "_" + edgeHex, 256, (ctx, s) => {
            const r = s / 2;
            const g = ctx.createRadialGradient(r, r, 0, r, r, r);
            g.addColorStop(0, dfRgba(0xffffff, 1));
            g.addColorStop(0.14, dfRgba(coreHex, 0.96));
            g.addColorStop(0.48, dfRgba(edgeHex, 0.5));
            g.addColorStop(1, dfRgba(edgeHex, 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        });
    }

    function ultSmokeTex(PIXI, tintHex) {
        return ultMakeTex(PIXI, "us_" + tintHex, 256, (ctx, s) => {
            for (let i = 0; i < 8; i++) {
                const bx = s * (0.25 + Math.random() * 0.5);
                const by = s * (0.25 + Math.random() * 0.5);
                const br = s * (0.14 + Math.random() * 0.24);
                const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
                g.addColorStop(0, dfRgba(tintHex, 0.45));
                g.addColorStop(1, dfRgba(tintHex, 0));
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, s, s);
            }
        });
    }

    function ultSprite(PIXI, tex, centered) {
        const s = new PIXI.Sprite(tex);
        if (centered) s.anchor.set(0.5);
        if (PIXI.BLEND_MODES) s.blendMode = PIXI.BLEND_MODES.ADD;
        return s;
    }

    function pulseRing(PIXI, unit, core, edge) {
        const c = new PIXI.Container();
        const bloom = ultSprite(PIXI, ultGlowTex(PIXI, core, edge), true);
        bloom.scale.set(unit * 0.0038);
        bloom.alpha = 0.75;
        c.addChild(bloom);
        const ring = new PIXI.Graphics();
        ring.lineStyle(Math.max(1.5, unit * 0.022), core, 0.55);
        ring.drawCircle(0, 0, unit * 0.52);
        ring.alpha = 0.65;
        c.addChild(ring);
        return c;
    }

    function makeProVial(PIXI, unit, liquidColor) {
        const root = new PIXI.Container();
        const glassHi = 0xe8f4ff;
        const glassLo = 0x8aa8c8;
        const cork = 0x8b5a2b;
        const ow = Math.max(1.5, unit * 0.028);

        const shadow = ultSprite(PIXI, ultGlowTex(PIXI, 0x102030, 0x000000), true);
        shadow.scale.set(unit * 0.004, unit * 0.002);
        shadow.y = unit * 0.42;
        shadow.alpha = 0.35;
        root.addChild(shadow);

        const body = new PIXI.Graphics();
        body.lineStyle(ow, 0x1a2838, 0.9);
        body.beginFill(glassLo, 0.35);
        body.drawRoundedRect(-unit * 0.15, -unit * 0.36, unit * 0.3, unit * 0.54, unit * 0.07);
        body.endFill();
        body.beginFill(glassHi, 0.22);
        body.drawRoundedRect(-unit * 0.11, -unit * 0.32, unit * 0.1, unit * 0.46, unit * 0.04);
        body.endFill();
        root.addChild(body);

        const liquid = new PIXI.Container();
        liquid.y = unit * 0.08;
        const liqG = new PIXI.Graphics();
        liqG.beginFill(liquidColor, 0.92);
        liqG.drawRoundedRect(-unit * 0.11, -unit * 0.06, unit * 0.22, unit * 0.24, unit * 0.05);
        liqG.endFill();
        liquid.addChild(liqG);
        const liqGlow = ultSprite(PIXI, ultGlowTex(PIXI, liquidColor, 0x081018), true);
        liqGlow.scale.set(unit * 0.0022, unit * 0.0016);
        liqGlow.y = unit * 0.04;
        liqGlow.alpha = 0.55;
        liquid.addChild(liqGlow);
        root.addChild(liquid);

        const corkG = new PIXI.Graphics();
        corkG.beginFill(cork, 1);
        corkG.drawRoundedRect(-unit * 0.06, -unit * 0.5, unit * 0.12, unit * 0.14, unit * 0.03);
        corkG.endFill();
        corkG.beginFill(0xa07040, 0.6);
        corkG.drawRect(-unit * 0.04, -unit * 0.48, unit * 0.08, unit * 0.04);
        corkG.endFill();
        root.addChild(corkG);

        const spec = new PIXI.Graphics();
        spec.beginFill(0xffffff, 0.55);
        spec.drawRoundedRect(-unit * 0.06, -unit * 0.28, unit * 0.03, unit * 0.22, unit * 0.015);
        spec.endFill();
        root.addChild(spec);

        const bubbles = [];
        for (let i = 0; i < 4; i++) {
            const b = softOrb(PIXI, 0xffffff, unit * (0.018 + i * 0.006), 0.5);
            b.x = (i - 1.5) * unit * 0.05;
            b.y = unit * 0.02 - i * unit * 0.03;
            liquid.addChild(b);
            bubbles.push(b);
        }
        return { root, liquid, bubbles };
    }

    function makeOutcomeGlyph(PIXI, unit, success) {
        const style = new PIXI.TextStyle({
            fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
            fontSize: Math.round(unit * 0.72),
            fill: success ? 0xffffcc : 0xffcccc,
            dropShadow: true,
            dropShadowColor: success ? 0x226633 : 0x440022,
            dropShadowBlur: 12,
            dropShadowDistance: 0,
        });
        const t = new PIXI.Text(success ? "✨" : "💀", style);
        t.anchor.set(0.5);
        t.alpha = 0;
        if (PIXI.BLEND_MODES) t.blendMode = PIXI.BLEND_MODES.ADD;
        return t;
    }

    function toonRing(PIXI, fill, outline, unit, mult) {
        const g = new PIXI.Graphics();
        const R = unit * 0.55 * (mult || 1);
        g.lineStyle(Math.max(2, unit * 0.04), outline, 1);
        g.beginFill(fill, 0.35);
        g.drawCircle(0, 0, R);
        g.endFill();
        g.lineStyle(Math.max(1.5, unit * 0.028), fill, 0.85);
        g.drawCircle(0, 0, R * 0.72);
        return g;
    }

    async function awaitTl(tl, root, maxSec) {
        const gsapBridge = global.DfGsapBridge;
        if (!tl || !gsapBridge) return false;
        try {
            await Promise.race([
                gsapBridge.timelineToPromise(tl),
                new Promise((r) => setTimeout(r, Math.max(500, (maxSec || 4) * 1000))),
            ]);
            return true;
        } finally {
            try { tl.kill?.(); } catch (e) { /* */ }
            try { root?.destroy?.({ children: true }); } catch (e) { /* */ }
        }
    }

    async function loadCardTexture(PIXI, source) {
        if (!source) return null;
        try {
            // Bake ImageBitmap / canvas / Texture — caminho quente das faces compostas.
            if (typeof source !== "string" && PIXI.Texture?.from) {
                return PIXI.Texture.from(source);
            }
            const url = source;
            // Faces compostas chegam como dataURL — Assets.load não resolve todos os
            // casos; Texture.from é o caminho confiável.
            if (String(url).startsWith("data:") && PIXI.Texture?.from) {
                return PIXI.Texture.from(url);
            }
            if (PIXI.Assets?.load) return await PIXI.Assets.load(url);
            if (PIXI.Texture?.from) return PIXI.Texture.from(url);
            const bt = PIXI.BaseTexture?.from?.(url);
            return bt ? new PIXI.Texture(bt) : null;
        } catch (e) {
            return null;
        }
    }

    async function resolvePixiCardArtUrl(cardName, power) {
        if (!cardName) return null;
        const Face = global.DfCardFace;
        const pow = power != null ? power : undefined;
        if (Face?.isComposed?.(cardName)) {
            if (Face.warmFace) {
                try {
                    await Promise.race([
                        Face.warmFace(
                            { name: cardName, currentPower: pow, power: pow },
                            { power: pow },
                        ),
                        new Promise((r) => setTimeout(() => r(""), 1200)),
                    ]);
                } catch (e) { /* */ }
            }
            let faceUrl = Face.getFaceDataUrl?.(cardName, pow) || null;
            if (faceUrl) return faceUrl;
        }
        if (global.dfPrimaryCardArtSrc) {
            const primary = global.dfPrimaryCardArtSrc(cardName);
            if (primary) return primary;
        }
        if (global.dfCardSrc) return global.dfCardSrc(cardName) || null;
        return null;
    }

    async function buildPixiCard(PIXI, unit, cardName, cardW, cardH, opts = {}) {
        const wrap = new PIXI.Container();
        const radius = Math.max(6, cardW * 0.08);
        const bg = new PIXI.Graphics();
        bg.lineStyle(Math.max(2, unit * 0.025), 0x3a6fa0, 1);
        bg.beginFill(0x0a1420, 1);
        bg.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radius);
        bg.endFill();
        wrap.addChild(bg);
        const pow = opts.currentPower ?? opts.power;
        const Face = global.DfCardFace;
        let tex = null;
        if (Face?.isComposed?.(cardName)) {
            if (Face.warmFace) {
                try {
                    await Promise.race([
                        Face.warmFace(
                            { name: cardName, currentPower: pow, power: pow },
                            { power: pow },
                        ),
                        new Promise((r) => setTimeout(() => r(""), 1200)),
                    ]);
                } catch (e) { /* */ }
            }
            const bake = Face.getFaceBakeSource?.(cardName, pow, { power: pow });
            if (bake) tex = await loadCardTexture(PIXI, bake);
            if (!tex) {
                const url = Face.getFaceDataUrl?.(cardName, pow) || null;
                if (url) tex = await loadCardTexture(PIXI, url);
            }
        }
        if (!tex) {
            const url = await resolvePixiCardArtUrl(cardName, pow);
            if (url) tex = await loadCardTexture(PIXI, url);
        }
        if (tex) {
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            mask.drawRoundedRect(-cardW / 2 + 3, -cardH / 2 + 3, cardW - 6, cardH - 6, radius - 2);
            mask.endFill();
            wrap.addChild(mask);
            const spr = new PIXI.Sprite(tex);
            spr.anchor.set(0.5);
            const fw = tex.orig?.width ?? tex.width ?? 1;
            const fh = tex.orig?.height ?? tex.height ?? 1;
            const sc = Math.min((cardW - 8) / fw, (cardH - 8) / fh);
            spr.scale.set(sc);
            spr.mask = mask;
            wrap.addChild(spr);
        }
        return wrap;
    }

    async function bootScene(cinematic) {
        const { pixi, PIXI, gsapBridge } = px();
        if (!pixi || !PIXI || !gsapBridge) return null;
        if (cinematic) {
            pixi.setQuality?.("full");
            gsapBridge.setQuality?.("full");
        } else if (!pixi.canUse?.()) return null;
        const gsap = await gsapBridge.ensureGsap?.(cinematic);
        const a = await pixi.ensureApp?.(cinematic);
        if (!a || !gsap) return null;
        await global.DfSpriteVfx?.init?.();
        const frame = pixi.pixiSceneFrame(a, cinematic);
        return { pixi, PIXI, gsap, gsapBridge, a, frame };
    }

    /** Alquimista — Poção Improvável: frasco cinematográfico, impacto volumétrico, ✨/💀. */
    async function playPotionUltimateScene(cx, cy, recipe, opts = {}) {
        const cinematic = !!opts.cinematic || global.DfVfxEngine?.wantsUltimateCinematic?.();
        const boot = await bootScene(cinematic);
        if (!boot) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        const m = frame.map(cx, cy);
        cx = m.x; cy = m.y;
        const success = opts.success !== false;
        const unit = cardUnit(1);
        const fromY = opts.fromY != null ? frame.map(cx, opts.fromY).y : Math.max(40, cy - frame.clipH * 0.52);
        const fromX = cx + unit * (cinematic ? 0.55 : 0.38);
        const coreCol = success ? 0x44ff88 : 0xbb55ff;
        const edgeCol = success ? 0x0a4020 : 0x2a0848;
        const flashCol = success ? 0xaaffcc : 0xdd88ff;
        const liqCol = success ? 0x38ee66 : 0xaa44ee;
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const vignette = ultSprite(PIXI, ultGlowTex(PIXI, edgeCol, 0x000000), true);
            vignette.x = frame.clipW / 2;
            vignette.y = frame.clipH / 2;
            vignette.scale.set(frame.clipW * 0.0042, frame.clipH * 0.0036);
            vignette.alpha = 0;
            root.addChild(vignette);

            const wash = new PIXI.Graphics();
            wash.beginFill(success ? 0x030f08 : 0x0c0614, 0.42);
            wash.drawRect(0, 0, frame.clipW, frame.clipH);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);

            const targetPulse = pulseRing(PIXI, unit, coreCol, edgeCol);
            targetPulse.x = cx; targetPulse.y = cy;
            targetPulse.alpha = 0;
            root.addChild(targetPulse);

            const targetBloom = ultSprite(PIXI, ultGlowTex(PIXI, coreCol, edgeCol), true);
            targetBloom.x = cx; targetBloom.y = cy;
            targetBloom.alpha = 0;
            targetBloom.scale.set(unit * 0.003);
            root.addChild(targetBloom);

            const orbitals = [];
            const orbN = cinematic ? 14 : 9;
            for (let i = 0; i < orbN; i++) {
                const o = softOrb(PIXI, i % 2 ? flashCol : coreCol, unit * (0.022 + (i % 3) * 0.008), 0.62);
                o.x = cx; o.y = cy; o.alpha = 0;
                root.addChild(o);
                orbitals.push({ o, ang: (i / orbN) * Math.PI * 2, rad: unit * (0.55 + (i % 4) * 0.12) });
            }

            const vial = makeProVial(PIXI, unit, liqCol);
            vial.root.x = fromX;
            vial.root.y = fromY;
            vial.root.alpha = 0;
            root.addChild(vial.root);

            const trailSmokes = [];
            const trailN = cinematic ? 12 : 8;
            for (let i = 0; i < trailN; i++) {
                const ts = ultSprite(PIXI, ultSmokeTex(PIXI, i % 2 ? coreCol : liqCol), true);
                ts.visible = false;
                ts.scale.set(unit * 0.0016);
                root.addChild(ts);
                trailSmokes.push(ts);
            }

            const outcomeGlyph = makeOutcomeGlyph(PIXI, unit, success);
            outcomeGlyph.x = cx; outcomeGlyph.y = cy - unit * 0.08;
            root.addChild(outcomeGlyph);

            const tl = await gsapBridge.createTimeline();
            if (!tl) return false;

            const dropDur = cinematic ? 0.78 : 0.62;
            const impactAt = 0.22 + dropDur;

            tl.to(vignette, { alpha: 0.55, duration: 0.35, ease: "sine.out" }, 0);
            tl.to(wash, { alpha: 1, duration: 0.28, ease: "sine.out" }, 0);
            tl.to(targetPulse, { alpha: 1, duration: 0.32, ease: "power2.out" }, 0.06);
            tl.to(targetPulse.scale, { x: 1.12, y: 1.12, duration: 0.55, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.1);
            tl.to(targetBloom, { alpha: 0.75, duration: 0.25, ease: "sine.out" }, 0.08);
            tl.to(targetBloom.scale, { x: unit * 0.0055, y: unit * 0.0055, duration: 0.65, ease: "sine.out" }, 0.08);

            orbitals.forEach((ob, i) => {
                tl.to(ob.o, { alpha: 0.75, duration: 0.2 }, 0.12 + i * 0.015);
                tl.to({}, {
                    duration: dropDur + 0.15,
                    ease: "none",
                    onUpdate: function () {
                        const p = this.progress();
                        const ang = ob.ang + p * Math.PI * 2.4;
                        ob.o.x = cx + Math.cos(ang) * ob.rad * (1 - p * 0.35);
                        ob.o.y = cy + Math.sin(ang) * ob.rad * 0.55 * (1 - p * 0.35);
                        ob.o.alpha = 0.75 * (1 - p * 0.85);
                    },
                }, 0.14 + i * 0.012);
            });

            tl.to(vial.root, { alpha: 1, duration: 0.14 }, 0.18);
            tl.to(vial.root, {
                duration: dropDur,
                ease: "power2.in",
                onUpdate: function () {
                    const p = this.progress();
                    const pos = quadBezier(
                        { x: fromX, y: fromY },
                        { x: (fromX + cx) / 2 + unit * 0.15, y: (fromY + cy) / 2 - unit * 0.35 },
                        { x: cx, y: cy },
                        p,
                    );
                    vial.root.x = pos.x;
                    vial.root.y = pos.y;
                    vial.root.rotation = p * (cinematic ? 0.65 : 0.45);
                    vial.liquid.rotation = Math.sin(p * 22) * 0.22;
                    vial.bubbles.forEach((b, bi) => {
                        b.y = unit * 0.02 - bi * unit * 0.03 + Math.sin(p * 16 + bi) * unit * 0.025;
                    });
                    trailSmokes.forEach((ts, ti) => {
                        if (p < ti / trailN) { ts.visible = false; return; }
                        ts.visible = true;
                        ts.x = pos.x + (Math.random() - 0.5) * unit * 0.08;
                        ts.y = pos.y - unit * 0.12 - ti * unit * 0.05;
                        ts.alpha = 0.35 + Math.sin(p * 10 + ti) * 0.15;
                        ts.scale.set(unit * (0.0014 + ti * 0.00025));
                    });
                },
            }, 0.22);

            tl.addLabel("impact", impactAt);
            tl.add(() => {
                if (typeof opts.onImpact === "function") opts.onImpact();
                vial.root.visible = false;
            }, "impact");

            tl.add(() => {
                const flash = ultSprite(PIXI, ultGlowTex(PIXI, flashCol, edgeCol), true);
                flash.x = cx; flash.y = cy;
                flash.scale.set(unit * 0.002);
                flash.alpha = 0.95;
                root.addChild(flash);
                gsap.to(flash.scale, { x: unit * 0.012, y: unit * 0.012, duration: 0.32, ease: "power2.out" });
                gsap.to(flash, { alpha: 0, duration: 0.38, delay: 0.08, onComplete: () => flash.destroy() });

                const shock = new PIXI.Graphics();
                shock.x = cx; shock.y = cy;
                shock.lineStyle(Math.max(2, unit * 0.035), flashCol, 0.9);
                shock.drawCircle(0, 0, unit * 0.06);
                root.addChild(shock);
                gsap.to(shock.scale, { x: 4.2, y: 4.2, duration: 0.38, ease: "power2.out" });
                gsap.to(shock, { alpha: 0, duration: 0.38, ease: "power2.in", onComplete: () => shock.destroy() });

                const burstN = cinematic ? 28 : 18;
                for (let i = 0; i < burstN; i++) {
                    const col = success
                        ? (i % 3 === 0 ? 0xffffaa : (i % 3 === 1 ? coreCol : 0x88ffaa))
                        : (i % 3 === 0 ? 0xffaaff : (i % 3 === 1 ? coreCol : 0x6622aa));
                    const p = ultSprite(PIXI, ultGlowTex(PIXI, col, edgeCol), true);
                    p.x = cx; p.y = cy;
                    p.scale.set(unit * (0.0012 + Math.random() * 0.0018));
                    root.addChild(p);
                    const ang = (i / burstN) * Math.PI * 2 + Math.random() * 0.3;
                    const dist = unit * (0.45 + Math.random() * 1.05);
                    gsap.to(p, {
                        x: cx + Math.cos(ang) * dist,
                        y: cy + Math.sin(ang) * dist - unit * (0.1 + Math.random() * 0.35),
                        alpha: 0,
                        rotation: (Math.random() - 0.5) * 2.5,
                        duration: 0.42 + Math.random() * 0.35,
                        ease: "power2.out",
                        onComplete: () => p.destroy(),
                    });
                }

                const smokeN = cinematic ? 10 : 7;
                for (let i = 0; i < smokeN; i++) {
                    const sm = ultSprite(PIXI, ultSmokeTex(PIXI, i % 2 ? coreCol : liqCol), true);
                    sm.x = cx + (Math.random() - 0.5) * unit * 0.35;
                    sm.y = cy + (Math.random() - 0.5) * unit * 0.2;
                    sm.alpha = 0.65;
                    sm.scale.set(unit * (0.002 + Math.random() * 0.002));
                    root.addChild(sm);
                    gsap.to(sm, {
                        y: sm.y - unit * (0.55 + Math.random() * 0.65),
                        x: sm.x + (Math.random() - 0.5) * unit * 0.4,
                        alpha: 0,
                        duration: 0.75 + Math.random() * 0.45,
                        ease: "sine.out",
                        onComplete: () => sm.destroy(),
                    });
                    gsap.to(sm.scale, {
                        x: sm.scale.x * 2.2,
                        y: sm.scale.y * 2.2,
                        duration: 0.85,
                        ease: "sine.out",
                    });
                }
            }, "impact");

            tl.to(outcomeGlyph, { alpha: 1, duration: 0.12, ease: "power2.out" }, "impact+=0.04");
            tl.to(outcomeGlyph.scale, { x: 1.35, y: 1.35, duration: 0.28, ease: "back.out(2.2)" }, "impact+=0.04");
            tl.to(outcomeGlyph, { alpha: 0, duration: 0.35, ease: "sine.in" }, "impact+=0.55");
            tl.to(outcomeGlyph.scale, { x: 1.6, y: 1.6, duration: 0.35, ease: "sine.in" }, "impact+=0.55");

            tl.to(targetPulse, { alpha: 0, duration: 0.4 }, "impact+=0.35");
            tl.to(targetBloom, { alpha: 0, duration: 0.45 }, "impact+=0.3");
            tl.to(wash, { alpha: 0, duration: 0.5 }, "impact+=0.65");
            tl.to(vignette, { alpha: 0, duration: 0.55, ease: "sine.in" }, "impact+=0.55");

            await awaitTl(tl, root, 4.2);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    /** Paladino — O Retorno do Herói: pilar dourado, carta ascende. */
    async function playPaladinResurrectScene(cx, cy, recipe, opts = {}) {
        const cinematic = !!opts.cinematic || global.DfVfxEngine?.wantsUltimateCinematic?.();
        const boot = await bootScene(cinematic);
        if (!boot) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        const m = frame.map(cx, cy);
        cx = m.x; cy = m.y;
        const unit = cardUnit(1);
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const wash = new PIXI.Graphics();
            wash.beginFill(0x1a1408, 0.45);
            wash.drawRect(0, 0, frame.clipW, frame.clipH);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);

            const pillar = new PIXI.Graphics();
            pillar.beginFill(0xffe8a0, 0.35);
            pillar.drawRect(-unit * 0.12, -unit * 3.2, unit * 0.24, unit * 3.4);
            pillar.endFill();
            pillar.x = cx; pillar.y = cy + unit * 0.5;
            pillar.scale.y = 0;
            pillar.alpha = 0;
            if (PIXI.BLEND_MODES) pillar.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(pillar);

            const halo = toonRing(PIXI, 0xffeebb, 0x8a7020, unit, 1.6);
            halo.x = cx; halo.y = cy;
            halo.alpha = 0;
            root.addChild(halo);

            const cardGlow = softOrb(PIXI, 0xfff4c8, unit * 0.35, 0.85);
            cardGlow.x = cx; cardGlow.y = cy + unit * 0.8;
            cardGlow.alpha = 0;
            root.addChild(cardGlow);

            const feathers = [];
            for (let i = 0; i < (cinematic ? 12 : 7); i++) {
                const f = softOrb(PIXI, 0xffffff, unit * 0.035, 0.7);
                f.x = cx + (Math.random() - 0.5) * unit * 0.6;
                f.y = cy + unit * 0.3;
                f.alpha = 0;
                root.addChild(f);
                feathers.push(f);
            }

            const tl = await gsapBridge.createTimeline();
            if (!tl) return false;

            tl.to(wash, { alpha: 1, duration: 0.3 }, 0);
            tl.to(pillar, { alpha: 0.9, duration: 0.2 }, 0.05);
            tl.to(pillar.scale, { y: 1, duration: cinematic ? 0.65 : 0.48, ease: "power2.out" }, 0.08);

            tl.to(halo, { alpha: 0.95, duration: 0.25, ease: "back.out(2)" }, 0.35);
            tl.to(halo.scale, { x: 1.15, y: 1.15, duration: 0.55, yoyo: true, repeat: 1 }, 0.35);

            tl.to(cardGlow, { alpha: 1, y: cy, duration: cinematic ? 0.75 : 0.58, ease: "power2.out" }, 0.42);
            tl.to(cardGlow.scale, { x: 1.35, y: 1.35, duration: 0.4, ease: "elastic.out(1, 0.5)" }, 0.75);

            feathers.forEach((f, i) => {
                tl.to(f, { alpha: 0.85, y: cy - unit * (0.8 + Math.random()), duration: 0.7 + i * 0.04, ease: "sine.out" }, 0.4 + i * 0.03);
                tl.to(f, { alpha: 0, duration: 0.35 }, 0.95 + i * 0.03);
            });

            tl.add(() => {
                if (typeof opts.onImpact === "function") opts.onImpact();
            }, 0.78);

            tl.to(wash, { alpha: 0, duration: 0.45 }, 1.05);
            tl.to(pillar, { alpha: 0, duration: 0.35 }, 1.0);
            tl.to(halo, { alpha: 0, duration: 0.35 }, 1.0);
            tl.to(cardGlow, { alpha: 0, duration: 0.3 }, 1.05);

            await awaitTl(tl, root, 3.2);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    /** Tecnomago — Outra Dimensão: singularidade profissional (Pixi+GSAP, sem cartoon). */
    async function playBanishUltimateScene(cx, cy, recipe, opts = {}) {
        const cinematic = !!opts.cinematic || global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.() || true;
        const boot = await bootScene(true);
        if (!boot) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        const m = frame.map(cx, cy);
        cx = m.x; cy = m.y;
        const unit = cardUnit(1);
        const cardW = unit * 0.98;
        const cardH = unit * 1.36;
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const wash = new PIXI.Graphics();
            wash.beginFill(0x010208, 0.78);
            wash.drawRect(0, 0, frame.clipW, frame.clipH);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);

            const portal = new PIXI.Container();
            portal.x = cx; portal.y = cy;
            portal.scale.set(0.04);
            portal.alpha = 0;
            root.addChild(portal);

            const R = unit * 1.55;
            const horizonGlow = softOrb(PIXI, 0x6633ff, R * 0.95, 0.42);
            if (PIXI.BLEND_MODES) horizonGlow.blendMode = PIXI.BLEND_MODES.ADD;
            portal.addChild(horizonGlow);

            const horizon = new PIXI.Graphics();
            horizon.beginFill(0x000000, 1);
            horizon.drawCircle(0, 0, R * 0.58);
            horizon.endFill();
            portal.addChild(horizon);

            const accretion = new PIXI.Graphics();
            for (let ring = 0; ring < 7; ring++) {
                const rr = R * (0.64 + ring * 0.1);
                const col = ring % 3 === 0 ? 0xaa66ff : (ring % 3 === 1 ? 0x44ddff : 0xff8844);
                accretion.lineStyle(Math.max(1.8, unit * 0.026), col, 0.62 - ring * 0.07);
                accretion.drawCircle(0, 0, rr);
            }
            if (PIXI.BLEND_MODES) accretion.blendMode = PIXI.BLEND_MODES.ADD;
            portal.addChild(accretion);

            const lens = new PIXI.Graphics();
            lens.lineStyle(Math.max(3.5, unit * 0.045), 0x9966ff, 0.82);
            lens.drawCircle(0, 0, R * 0.82);
            lens.lineStyle(Math.max(2.2, unit * 0.03), 0x66eeff, 0.55);
            lens.drawCircle(0, 0, R * 1.02);
            lens.lineStyle(Math.max(1.4, unit * 0.02), 0xffffff, 0.28);
            lens.drawCircle(0, 0, R * 1.18);
            if (PIXI.BLEND_MODES) lens.blendMode = PIXI.BLEND_MODES.ADD;
            portal.addChild(lens);

            // Emoji 🌀 — presença simbólica sem traço cartoon
            let glyph = null;
            try {
                glyph = new PIXI.Text("🌀", {
                    fontSize: Math.round(unit * 0.85),
                    fill: 0xffffff,
                    align: "center",
                });
                glyph.anchor.set(0.5);
                glyph.alpha = 0;
                glyph.y = -R * 0.15;
                portal.addChild(glyph);
            } catch (e) { /* */ }

            let cardWrap = null;
            let cardFromX = cx;
            let cardFromY = cy;
            const fieldCard = (opts.targetP != null && opts.targetI != null)
                ? global.getState?.()?.players?.[opts.targetP]?.field?.[opts.targetI]
                : null;
            const cardName = opts.cardName || fieldCard?.name || null;
            const cardPower = opts.currentPower ?? opts.power
                ?? fieldCard?.currentPower ?? fieldCard?.power ?? null;
            // Origem da carta no campo (MP: voa até o buraco negro).
            try {
                const el = (opts.targetP != null && opts.targetI != null)
                    ? global.getChampionDom?.(opts.targetP, opts.targetI)
                    : null;
                const r = el?.getBoundingClientRect?.();
                if (r && r.width > 4) {
                    const mapped = frame.map(r.left + r.width / 2, r.top + r.height / 2);
                    cardFromX = mapped.x;
                    cardFromY = mapped.y;
                } else if (opts.fromX != null && opts.fromY != null) {
                    const mapped = frame.map(opts.fromX, opts.fromY);
                    cardFromX = mapped.x;
                    cardFromY = mapped.y;
                }
            } catch (eFrom) { /* */ }
            if (cardName) {
                // Warm face composta antes do bake — evita carta genérica sem arte.
                try {
                    if (global.DfCardFace?.isComposed?.(cardName) && global.DfCardFace.warmFace) {
                        await Promise.race([
                            global.DfCardFace.warmFace(
                                { name: cardName, currentPower: cardPower, power: cardPower },
                                { power: cardPower },
                            ),
                            new Promise((r) => setTimeout(() => r(""), 900)),
                        ]);
                    }
                } catch (eWarm) { /* */ }
                cardWrap = await buildPixiCard(PIXI, unit, cardName, cardW, cardH, {
                    currentPower: cardPower,
                    power: cardPower,
                });
                const mpSuck = !!(global.window?.__DF_ONLINE || opts.suckFromField);
                cardWrap.x = mpSuck ? cardFromX : cx;
                cardWrap.y = mpSuck ? cardFromY : cy;
                cardWrap.alpha = 0;
                root.addChild(cardWrap);
            }

            const debris = [];
            const debrisN = 42;
            for (let i = 0; i < debrisN; i++) {
                const col = i % 4 === 0 ? 0xaa88ff : (i % 4 === 1 ? 0x66ddff : (i % 4 === 2 ? 0xffaa66 : 0xffffff));
                const p = softOrb(PIXI, col, unit * (0.02 + Math.random() * 0.055), 0.85);
                const ang = (i / debrisN) * Math.PI * 2 + Math.random() * 0.2;
                const dist0 = R * (1.15 + Math.random() * 0.75);
                p.x = cx + Math.cos(ang) * dist0;
                p.y = cy + Math.sin(ang) * dist0 * 0.82;
                p.alpha = 0;
                root.addChild(p);
                debris.push({ g: p, ang, dist: dist0, spin: 4 + Math.random() * 5 });
            }

            const shock = new PIXI.Graphics();
            shock.lineStyle(Math.max(2, unit * 0.03), 0xccbbff, 0.9);
            shock.drawCircle(0, 0, R * 0.4);
            shock.x = cx; shock.y = cy;
            shock.alpha = 0;
            shock.scale.set(0.3);
            if (PIXI.BLEND_MODES) shock.blendMode = PIXI.BLEND_MODES.ADD;
            root.addChild(shock);

            const suckProxy = { t: 0 };
            const tl = await gsapBridge.createTimeline();
            if (!tl) return false;

            tl.to(wash, { alpha: 1, duration: 0.4, ease: "sine.out" }, 0);
            tl.to(portal, { alpha: 1, duration: 0.28, ease: "power2.out" }, 0.08);
            tl.to(portal.scale, { x: 1, y: 1, duration: 0.72, ease: "power3.out" }, 0.1);
            if (glyph) {
                tl.to(glyph, { alpha: 0.92, duration: 0.22 }, 0.22);
                tl.to(glyph.scale, { x: 1.15, y: 1.15, duration: 0.55, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0.28);
            }
            tl.to(accretion, { rotation: Math.PI * 5.5, duration: 2.4, ease: "none" }, 0.12);
            tl.to(lens, { rotation: -Math.PI * 3.2, duration: 2.1, ease: "none" }, 0.14);
            tl.to(horizonGlow.scale, { x: 1.25, y: 1.25, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0.2);

            debris.forEach((p, i) => {
                tl.to(p.g, { alpha: 0.9, duration: 0.14 }, 0.18 + i * 0.01);
            });

            if (cardWrap) {
                tl.to(cardWrap, { alpha: 1, duration: 0.22, ease: "power2.out" }, 0.38);
                tl.to(cardWrap.scale, { x: 1.06, y: 1.06, duration: 0.28, ease: "power2.out" }, 0.38);
            }

            tl.add(() => {
                try { opts.onSuck?.(); } catch (e) { /* */ }
            }, 0.58);

            tl.to(suckProxy, {
                t: 1,
                duration: 1.15,
                ease: "power4.in",
                onUpdate: () => {
                    const t = suckProxy.t;
                    debris.forEach((p) => {
                        const d = p.dist * (1 - t * 0.99);
                        const ang = p.ang + t * p.spin;
                        p.g.x = cx + Math.cos(ang) * d;
                        p.g.y = cy + Math.sin(ang) * d * 0.86;
                        p.g.alpha = 0.9 * (1 - t * 0.95);
                        p.g.scale.set(Math.max(0.08, 1 - t * 0.85));
                    });
                    if (cardWrap) {
                        const ease = t * t * t;
                        const sc = Math.max(0.015, 1.06 - ease * 1.05);
                        // Interpola origem do campo → centro do buraco negro.
                        cardWrap.x = cardFromX + (cx - cardFromX) * ease;
                        cardWrap.y = cardFromY + (cy - cardFromY) * ease;
                        cardWrap.scale.set(sc);
                        cardWrap.rotation = ease * Math.PI * 3.4;
                        cardWrap.alpha = Math.max(0, 1 - ease * 0.98);
                    }
                    if (glyph) {
                        glyph.alpha = Math.max(0, 0.92 * (1 - t));
                        glyph.scale.set(1.15 * (1 - t * 0.7));
                    }
                    portal.scale.set(1 + t * 0.22, 1 + t * 0.22);
                },
            }, 0.58);

            tl.to(shock, { alpha: 0.95, duration: 0.12 }, 1.55);
            tl.to(shock.scale, { x: 2.8, y: 2.8, duration: 0.55, ease: "power3.out" }, 1.55);
            tl.to(shock, { alpha: 0, duration: 0.35 }, 1.75);

            tl.add(() => {
                if (typeof opts.onImpact === "function") opts.onImpact();
            }, 1.62);

            tl.to(portal.scale, { x: 0.03, y: 0.03, duration: 0.42, ease: "power3.in" }, 1.72);
            tl.to(portal, { alpha: 0, duration: 0.32 }, 1.92);
            tl.to(wash, { alpha: 0, duration: 0.5, ease: "power2.out" }, 1.8);
            if (cardWrap) tl.to(cardWrap, { alpha: 0, duration: 0.12 }, 1.65);

            await awaitTl(tl, root, 5.2);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    /** Valmont — Vampirismo: sangue flui do inimigo ao aliado. */
    async function playVampirismUltimateScene(ex, ey, ax, ay, recipe, opts = {}) {
        const cinematic = !!opts.cinematic || global.DfVfxEngine?.wantsUltimateCinematic?.();
        const boot = await bootScene(cinematic);
        if (!boot) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        const em = frame.map(ex, ey);
        const am = frame.map(ax, ay);
        ex = em.x; ey = em.y; ax = am.x; ay = am.y;
        const unit = cardUnit(1);
        const root = new PIXI.Container();
        a.stage.addChild(root);
        try {
            const wash = new PIXI.Graphics();
            wash.beginFill(0x180408, 0.52);
            wash.drawRect(0, 0, frame.clipW, frame.clipH);
            wash.endFill();
            wash.alpha = 0;
            root.addChild(wash);

            const enemyPulse = toonRing(PIXI, 0xff2244, 0x440008, unit, 1.25);
            enemyPulse.x = ex; enemyPulse.y = ey; enemyPulse.alpha = 0;
            root.addChild(enemyPulse);

            const allyPulse = toonRing(PIXI, 0xff6688, 0x220008, unit, 1.15);
            allyPulse.x = ax; allyPulse.y = ay; allyPulse.alpha = 0;
            root.addChild(allyPulse);

            const streamLayer = new PIXI.Container();
            root.addChild(streamLayer);

            const droplets = [];
            const dropN = cinematic ? 36 : 22;
            for (let i = 0; i < dropN; i++) {
                const d = softOrb(PIXI, i % 3 ? 0xff1133 : 0xcc0022, unit * (0.022 + Math.random() * 0.035), 0.92);
                d.visible = false;
                streamLayer.addChild(d);
                droplets.push({ g: d, lag: Math.random() * 0.35, size: 0.6 + Math.random() * 0.6 });
            }

            const midX = (ex + ax) / 2;
            const midY = Math.min(ey, ay) - unit * (cinematic ? 1.1 : 0.75);
            const streamProxy = { t: 0 };
            const tl = await gsapBridge.createTimeline();
            if (!tl) return false;

            tl.to(wash, { alpha: 1, duration: 0.28 }, 0);
            tl.to(enemyPulse, { alpha: 0.95, duration: 0.22, ease: "back.out(2)" }, 0.08);
            tl.to(enemyPulse.scale, { x: 1.2, y: 1.2, duration: 0.35, yoyo: true, repeat: 2 }, 0.12);

            tl.to(streamProxy, {
                t: 1,
                duration: cinematic ? 1.15 : 0.88,
                ease: "power1.inOut",
                onUpdate: () => {
                    const t = streamProxy.t;
                    droplets.forEach((d, i) => {
                        const pt = (t - d.lag);
                        if (pt <= 0 || pt > 1) { d.g.visible = false; return; }
                        d.g.visible = true;
                        const u = pt;
                        const bx = quadBezier({ x: ex, y: ey }, { x: midX, y: midY }, { x: ax, y: ay }, u);
                        d.g.x = bx.x + Math.sin(u * 14 + i) * unit * 0.04;
                        d.g.y = bx.y + Math.cos(u * 11 + i) * unit * 0.03;
                        d.g.alpha = Math.sin(Math.PI * u) * 0.95;
                        d.g.scale.set(d.size * (0.5 + u * 0.5));
                    });
                },
            }, 0.25);

            tl.add(() => {
                if (typeof opts.onImpact === "function") opts.onImpact();
            }, cinematic ? 1.05 : 0.82);

            tl.to(allyPulse, { alpha: 0.95, duration: 0.25, ease: "back.out(2.5)" }, cinematic ? 1.0 : 0.78);
            tl.to(allyPulse.scale, { x: 1.35, y: 1.35, duration: 0.42, ease: "elastic.out(1, 0.45)" }, cinematic ? 1.05 : 0.82);

            const burstN = cinematic ? 12 : 7;
            for (let i = 0; i < burstN; i++) {
                const b = softOrb(PIXI, 0xff4466, unit * 0.05, 0.85);
                b.x = ax; b.y = ay; b.alpha = 0;
                root.addChild(b);
                const ang = (i / burstN) * Math.PI * 2;
                tl.to(b, { alpha: 0.9, duration: 0.08 }, cinematic ? 1.08 : 0.85);
                tl.to(b, {
                    x: ax + Math.cos(ang) * unit * 0.55,
                    y: ay + Math.sin(ang) * unit * 0.45,
                    alpha: 0,
                    duration: 0.45,
                    ease: "power2.out",
                }, cinematic ? 1.08 : 0.85);
            }

            tl.to(enemyPulse, { alpha: 0, duration: 0.35 }, cinematic ? 1.35 : 1.05);
            tl.to(allyPulse, { alpha: 0, duration: 0.35 }, cinematic ? 1.45 : 1.15);
            tl.to(wash, { alpha: 0, duration: 0.42 }, cinematic ? 1.4 : 1.1);

            await awaitTl(tl, root, 3.8);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    /** Hub Necromancia — 4 cartas do descarte + escolha. Resolve com índice. */
    async function playNecromanciaHubScene(opts = {}) {
        const picks = (opts.picks || []).slice(0, 4);
        if (!picks.length) return -1;
        const cinematic = opts.cinematic !== false;
        global.DfPixiVfx?.setQuality?.("full");
        global.DfGsapBridge?.setQuality?.("full");
        const boot = await bootScene(true);
        if (!boot) return -1;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;

        // Limpa back-buffer (flash amarelo de VFX anteriores) antes do hub.
        try { pixi.clearStage?.(); } catch (e) { /* */ }
        try { a.renderer?.render?.(a.stage); } catch (e) { /* */ }

        return new Promise((resolve) => {
            let settled = false;
            const canvasView = a.view;
            const prevPointer = canvasView?.style?.pointerEvents || "";
            const finish = (idx) => {
                if (settled) return;
                settled = true;
                try { if (canvasView) canvasView.style.pointerEvents = prevPointer || "none"; } catch (e) { /* */ }
                try { root.destroy({ children: true }); } catch (e) { /* */ }
                try { frame.end(); } catch (e) { /* */ }
                try { pixi.clearStage?.(); } catch (e) { /* */ }
                try { pixi.sweepOrphanScenes?.(); } catch (e) { /* */ }
                resolve(idx);
            };

            const root = new PIXI.Container();
            root.eventMode = "static";
            a.stage.eventMode = "static";
            if (canvasView) canvasView.style.pointerEvents = "auto";
            a.stage.addChild(root);

            (async () => {
                try {
                    // Base opaca + vinheta roxa (não deixa sangrar flash amarelo).
                    const wash = new PIXI.Graphics();
                    wash.beginFill(0x000000, 1);
                    wash.drawRect(0, 0, frame.clipW, frame.clipH);
                    wash.endFill();
                    wash.beginFill(0x120818, 0.92);
                    wash.drawRect(0, 0, frame.clipW, frame.clipH);
                    wash.endFill();
                    wash.eventMode = "static";
                    root.addChild(wash);

                    const title = new PIXI.Text("Traga uma carta de volta para sua mão", {
                        fontFamily: "Cinzel, Georgia, serif",
                        fontSize: Math.round(Math.min(frame.clipW * 0.034, 36)),
                        fill: 0xe8d8ff,
                        fontWeight: "700",
                        align: "center",
                        wordWrap: true,
                        wordWrapWidth: frame.clipW * 0.88,
                    });
                    title.anchor.set(0.5, 0);
                    title.x = frame.clipW / 2;
                    title.y = frame.clipH * 0.06;
                    title.alpha = 0;
                    title.eventMode = "none";
                    root.addChild(title);

                    const slots = [];
                    const n = picks.length;
                    const gap = Math.max(10, frame.clipW * 0.014);
                    const cardW = Math.min(frame.clipW * (n <= 2 ? 0.22 : 0.15), 168);
                    const cardH = cardW * 1.38;
                    const totalW = n * cardW + (n - 1) * gap;
                    let startX = frame.clipW / 2 - totalW / 2 + cardW / 2;
                    const cardSrc = opts.cardSrc || ((name) => `cards/v2/${(name || "").replace(/\s+/g, "_")}.png`);

                    for (let i = 0; i < n; i++) {
                        const slot = new PIXI.Container();
                        slot.x = startX + i * (cardW + gap);
                        slot.y = frame.clipH * 0.52;
                        slot.alpha = 0;
                        slot.eventMode = "static";
                        slot.cursor = "pointer";
                        slot.hitArea = new PIXI.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH);

                        const frameG = new PIXI.Graphics();
                        frameG.lineStyle(3, 0x8a5cff, 1);
                        frameG.beginFill(0x1a1228, 0.95);
                        frameG.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
                        frameG.endFill();
                        frameG.eventMode = "none";
                        slot.addChild(frameG);

                        try {
                            const url = cardSrc(picks[i].name);
                            const tex = await loadCardTexture(PIXI, url);
                            if (tex) {
                                const spr = new PIXI.Sprite(tex);
                                spr.anchor.set(0.5);
                                const sc = Math.min((cardW - 10) / spr.width, (cardH - 10) / spr.height);
                                spr.scale.set(sc);
                                spr.eventMode = "none";
                                slot.addChildAt(spr, 1);
                            }
                        } catch (e) { /* fallback sem arte */ }

                        const pickIdx = i;
                        const onPick = () => {
                            if (settled) return;
                            slot.eventMode = "none";
                            const tl2 = gsap.timeline({ onComplete: () => finish(pickIdx) });
                            tl2.to(slot.scale, { x: 1.08, y: 1.08, duration: 0.18, ease: "back.out(2)" });
                            tl2.to(slot, { alpha: 0, duration: 0.22 }, 0.12);
                            tl2.to(title, { alpha: 0, duration: 0.2 }, 0);
                            tl2.to(wash, { alpha: 0, duration: 0.28 }, 0.08);
                            slots.forEach((s, j) => {
                                if (j !== pickIdx) tl2.to(s, { alpha: 0.25, duration: 0.2 }, 0);
                            });
                        };
                        slot.on("pointertap", onPick);

                        root.addChild(slot);
                        slots.push(slot);
                    }

                    const tl = await gsapBridge.createTimeline();
                    tl.to(title, { alpha: 1, duration: 0.35, ease: "power2.out" }, 0);
                    slots.forEach((s, i) => {
                        tl.fromTo(s, { y: frame.clipH * 0.6, alpha: 0 }, {
                            y: frame.clipH * 0.52,
                            alpha: 1,
                            duration: 0.42,
                            ease: "back.out(1.6)",
                        }, 0.12 + i * 0.08);
                    });
                    await awaitTl(tl, null, 60);
                } catch (e) {
                    finish(-1);
                }
            })();
        });
    }

    /** Amedrontar — voo contínuo campo → mão (sem clone DOM). */
    async function playScareReturnScene(opts = {}) {
        const isUlt = !!opts.ultimate;
        const cinematic = global.DfVfxEngine?.wantsGpuPresentation?.() !== false;
        const boot = await bootScene(cinematic);
        if (!boot) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        let fx = opts.fromX, fy = opts.fromY, tx = opts.toX, ty = opts.toY;
        if (fx == null || fy == null || tx == null || ty == null) return false;
        const fm = frame.map(fx, fy);
        const tm = frame.map(tx, ty);
        fx = fm.x; fy = fm.y; tx = tm.x; ty = tm.y;
        const unit = cardUnit(1);
        const root = new PIXI.Container();
        a.stage.addChild(root);

        if (typeof opts.onHideSource === "function") opts.onHideSource();

        try {
            const cardW = opts.cardW || unit * 0.9;
            const cardH = opts.cardH || unit * 1.26;
            const cardWrap = new PIXI.Container();
            cardWrap.x = fx; cardWrap.y = fy;
            root.addChild(cardWrap);

            const cardMask = new PIXI.Graphics();
            cardMask.beginFill(0xffffff);
            cardMask.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, unit * 0.06);
            cardMask.endFill();
            cardWrap.addChild(cardMask);

            // Face composta / PNG: resolve + aquece antes de animar.
            // Sem textura → false (DOM dfBuildScareFlyCard mostra a carta).
            const cardName = opts.cardName || opts.champName || "";
            const pow = opts.currentPower ?? opts.power;
            let tex = null;
            try {
                if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                    if (global.DfCardFace.warmFace) {
                        await Promise.race([
                            global.DfCardFace.warmFace(
                                { name: cardName, currentPower: pow, power: pow },
                                { power: pow },
                            ),
                            new Promise((r) => setTimeout(() => r(""), 900)),
                        ]);
                    }
                    const bake = global.DfCardFace.getFaceBakeSource?.(cardName, pow, { power: pow });
                    if (bake) tex = await loadCardTexture(PIXI, bake);
                    if (!tex) {
                        const bakedUrl = global.DfCardFace.getFaceDataUrl?.(cardName, pow) || null;
                        if (bakedUrl) tex = await loadCardTexture(PIXI, bakedUrl);
                    }
                }
                let cardSrc = opts.cardSrc;
                if (!tex && !cardSrc && cardName) {
                    cardSrc = await resolvePixiCardArtUrl(cardName, pow);
                }
                if (!tex && cardSrc) tex = await loadCardTexture(PIXI, cardSrc);
            } catch (e) { /* */ }
            if (!tex) {
                try { root.destroy?.({ children: true }); } catch (e2) { /* */ }
                try { pixi.sweepOrphanScenes?.(); } catch (e3) { /* */ }
                return false;
            }
            const spr = new PIXI.Sprite(tex);
            spr.anchor.set(0.5);
            const fw = tex.orig?.width ?? tex.width ?? 1;
            const fh = tex.orig?.height ?? tex.height ?? 1;
            const sc = Math.min((cardW - 4) / fw, (cardH - 4) / fh);
            spr.scale.set(sc);
            spr.mask = cardMask;
            cardWrap.addChild(spr);

            const fearOrbs = [];
            const orbN = isUlt ? 14 : 6;
            for (let i = 0; i < orbN; i++) {
                const o = softOrb(PIXI, isUlt ? 0xaa66ff : 0xcc88ff, unit * (isUlt ? 0.07 : 0.05), isUlt ? 0.82 : 0.65);
                o.x = fx; o.y = fy;
                o.alpha = 0;
                root.addChild(o);
                fearOrbs.push(o);
            }

            if (isUlt) {
                const pulse = softOrb(PIXI, 0x6622aa, unit * 0.35, 0.35);
                pulse.x = fx; pulse.y = fy; pulse.alpha = 0;
                root.addChild(pulse);
                const tlPulse = await gsapBridge.createTimeline();
                tlPulse.to(pulse, { alpha: 0.55, duration: 0.18 }, 0);
                tlPulse.to(pulse.scale, { x: 2.4, y: 2.4, duration: 0.55, ease: "power2.out" }, 0);
                tlPulse.to(pulse, { alpha: 0, duration: 0.35, ease: "power2.in" }, 0.28);
            }

            const p0 = { x: fx, y: fy };
            const p2 = { x: tx, y: ty };
            const lift = Math.min(isUlt ? 150 : 120, Math.max(40, Math.hypot(tx - fx, ty - fy) * (isUlt ? 0.28 : 0.22)));
            const p1 = { x: (fx + tx) / 2, y: Math.min(fy, ty) - lift };
            const flyProxy = { t: 0 };
            const dur = cinematic ? (isUlt ? 1.08 : 0.95) : (isUlt ? 0.92 : 0.78);

            const tl = await gsapBridge.createTimeline();
            fearOrbs.forEach((o, i) => {
                tl.to(o, { alpha: isUlt ? 0.92 : 0.8, duration: 0.12 }, i * 0.03);
            });
            tl.to(flyProxy, {
                t: 1,
                duration: dur,
                ease: "power1.inOut",
                onUpdate: () => {
                    const pt = quadBezier(p0, p1, p2, flyProxy.t);
                    cardWrap.x = pt.x;
                    cardWrap.y = pt.y;
                    const rot = (isUlt ? -16 : -12) * Math.sin(Math.PI * flyProxy.t);
                    const sc = 1.08 - flyProxy.t * (isUlt ? 0.1 : 0.14);
                    cardWrap.rotation = rot * (Math.PI / 180);
                    cardWrap.scale.set(sc);
                    fearOrbs.forEach((o, i) => {
                        const lag = Math.max(0, flyProxy.t - i * 0.05);
                        const lp = quadBezier(p0, p1, p2, lag);
                        o.x = lp.x + (Math.random() - 0.5) * unit * (isUlt ? 0.14 : 0.08);
                        o.y = lp.y + (Math.random() - 0.5) * unit * (isUlt ? 0.14 : 0.08);
                        o.alpha = (isUlt ? 0.78 : 0.65) * (1 - flyProxy.t);
                    });
                },
            }, isUlt ? 0.14 : 0.1);
            tl.to(cardWrap, { alpha: 0, duration: 0.12 }, dur + 0.08);

            await awaitTl(tl, root, dur + 1.2);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    /** Muralha (Alexander) — barreira Pixi+GSAP protegendo aliados. */
    async function playWallProtectScene(opts = {}) {
        const cinematic = global.DfVfxEngine?.wantsGpuPresentation?.() !== false;
        const boot = await bootScene(cinematic);
        if (!boot) return false;
        const targets = Array.isArray(opts.targets) ? opts.targets : [];
        if (!targets.length) return false;
        const { PIXI, gsap, gsapBridge, a, frame, pixi } = boot;
        const unit = cardUnit(1);
        const root = new PIXI.Container();
        a.stage.addChild(root);
        const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        try {
            const tl = await gsapBridge.createTimeline();
            targets.forEach((t, i) => {
                let cx = t.x, cy = t.y;
                if (cx == null || cy == null) return;
                const m = frame.map(cx, cy);
                cx = m.x; cy = m.y;
                const at = i * 0.12;

                const shieldGlow = new PIXI.Graphics();
                shieldGlow.beginFill(0x8ec4ff, 0.22);
                shieldGlow.drawCircle(0, 0, unit * 0.55);
                shieldGlow.endFill();
                if (PIXI.BLEND_MODES) shieldGlow.blendMode = PIXI.BLEND_MODES.ADD;
                shieldGlow.x = cx; shieldGlow.y = cy; shieldGlow.alpha = 0; shieldGlow.scale.set(0.35);
                root.addChild(shieldGlow);
                tl.to(shieldGlow, { alpha: 0.95, duration: 0.2 }, at);
                tl.to(shieldGlow.scale, { x: 1.8, y: 1.8, duration: 0.62, ease: "power2.out" }, at);
                tl.to(shieldGlow, { alpha: 0, duration: 0.42, ease: "power2.in" }, at + 0.45);

                const brick = new PIXI.Text("🧱", {
                    fontFamily: EMOJI_FONT,
                    fontSize: Math.round(unit * 0.95),
                });
                brick.anchor.set(0.5);
                brick.x = cx; brick.y = cy + unit * 0.22; brick.alpha = 0; brick.scale.set(0.25);
                root.addChild(brick);
                tl.to(brick, { alpha: 1, duration: 0.18 }, at + 0.06);
                tl.to(brick.scale, { x: 1.15, y: 1.15, duration: 0.48, ease: "back.out(2)" }, at + 0.06);
                tl.to(brick, { y: cy - unit * 0.08, duration: 0.55, ease: "sine.out" }, at + 0.06);
                tl.to(brick, { alpha: 0.92, duration: 0.35, ease: "sine.in" }, at + 0.75);

                for (let p = 0; p < (cinematic ? 10 : 6); p++) {
                    const orb = softOrb(PIXI, p % 2 ? 0xc8e4ff : 0xaaccff, unit * (0.05 + Math.random() * 0.05), 0.8);
                    orb.x = cx + (Math.random() - 0.5) * unit * 0.5;
                    orb.y = cy + unit * 0.15;
                    orb.alpha = 0;
                    root.addChild(orb);
                    const pat = at + 0.1 + p * 0.025;
                    tl.to(orb, { alpha: 0.85, duration: 0.12 }, pat);
                    tl.to(orb, {
                        x: orb.x + (Math.random() - 0.5) * unit * 0.6,
                        y: cy - unit * (0.35 + Math.random() * 0.5),
                        duration: 0.7 + Math.random() * 0.25,
                        ease: "sine.out",
                    }, pat);
                    tl.to(orb, { alpha: 0, duration: 0.28 }, pat + 0.55);
                }

                const ring = new PIXI.Graphics();
                ring.lineStyle(Math.max(2, unit * 0.035), 0xd8e4f0, 0.9);
                ring.drawCircle(0, 0, unit * 0.42);
                ring.x = cx; ring.y = cy; ring.alpha = 0; ring.scale.set(0.4);
                root.addChild(ring);
                tl.to(ring, { alpha: 0.85, duration: 0.14 }, at + 0.2);
                tl.to(ring.scale, { x: 1.7, y: 1.7, duration: 0.55, ease: "power2.out" }, at + 0.2);
                tl.to(ring, { alpha: 0, duration: 0.35 }, at + 0.55);
            });
            await awaitTl(tl, root, 1.5);
            pixi.sweepOrphanScenes?.();
            return true;
        } finally {
            frame.end();
        }
    }

    function attach() {
        const base = global.DfPixiVfx;
        if (!base) return false;
        Object.assign(base, {
            playPotionUltimateScene,
            playPaladinResurrectScene,
            playBanishUltimateScene,
            playVampirismUltimateScene,
            playNecromanciaHubScene,
            playScareReturnScene,
            playWallProtectScene,
            trimUltTextureCaches,
        });
        return true;
    }

    if (!attach()) {
        if (global.document?.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", () => attach(), { once: true });
        }
        global.addEventListener("load", () => attach(), { once: true });
    }
})(typeof window !== "undefined" ? window : globalThis);
