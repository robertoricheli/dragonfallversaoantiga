/**
 * DfUltimateDirector — orquestra ultimates em 4 camadas (vignette / canvas / DfAnim / carta).
 */
(function (global) {
    "use strict";

    let ctx = null;

    function R(id) {
        return global.DfUltimateRecipes?.[id];
    }

    function fx() {
        return ctx?.fx() || { mobile: false, liteVfx: false, n: (x) => x, nUlt: (x) => x };
    }

    function ultVfxRoot() {
        return global.DfLayout?.overlayRoot?.() || global.document.body;
    }

    function ultVfxCanvasFly() {
        return ultVfxRoot() !== global.document.body;
    }

    function ultVfxMapPoint(vx, vy) {
        if (!ultVfxCanvasFly()) return { x: vx, y: vy };
        return global.DfLayout?.viewportToCanvas?.(vx, vy) || { x: vx, y: vy };
    }

    function ultVfxMount(el) {
        const root = ultVfxRoot();
        if (el.parentNode !== root) root.appendChild(el);
        if (ultVfxCanvasFly()) global.DfLayout?.prepareOverlay?.(el);
        return el;
    }

    function ultVfxPlace(el, vx, vy) {
        ultVfxMount(el);
        const p = ultVfxMapPoint(vx, vy);
        el.style.position = ultVfxCanvasFly() ? "absolute" : "fixed";
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
        return p;
    }

    function timingSum(recipe) {
        const t = recipe.timings || {};
        return ["anticipate", "vignetteIn", "windup", "travel", "impact", "linger", "stagger"]
            .reduce((s, k) => s + (t[k] || 0), 0);
    }

    function extraSceneMs(type, recipe, opts) {
        const t = recipe.timings || {};
        const hit = (t.impact || 0) + (t.stagger || 0);
        if (type === "thunderDiscard") {
            const n = opts.strikePoints?.length || 1;
            return Math.max(0, n - 1) * hit + (t.impact || 0);
        }
        if (type === "cometStarfall") {
            return 4 * (t.stagger || 0) + (t.travel || 0) + (t.impact || 0);
        }
        if (type === "warOverpower" || type === "wallProtect" || type === "infinitePower") {
            const n = opts.fieldTargets?.length || 2;
            return Math.max(0, n - 1) * hit;
        }
        if (type === "fireAndIceFreeze" || type === "fireAndIceBurn") return 0;
        return 0;
    }

    function tms(recipe, phase) {
        const base = recipe.timings?.[phase] ?? 0;
        if (!base) return 0;
        const f = fx();
        let ms = base;
        if (f.liteVfx) ms = Math.max(35, Math.round(base * 0.72));
        else if (f.mobile) ms = Math.max(45, Math.round(base * 0.86));
        if (recipe._durScale) {
            const floor = phase === "linger" ? 70 : 32;
            ms = Math.max(floor, Math.round(ms * recipe._durScale));
        }
        return ms;
    }

    /**
     * Director 2.0 — timeline sequencial windup → travel → impact → linger.
     * Cada fase pode ter handler async; ausente = wait proporcional.
     */
    async function playTimeline(recipe, handlers, anim) {
        const order = ["anticipate", "vignetteIn", "windup", "travel", "impact", "stagger", "linger"];
        for (const phase of order) {
            const ms = tms(recipe, phase);
            if (ms <= 0) continue;
            const fn = handlers?.[phase];
            if (typeof fn === "function") {
                await fn(ms, phase, anim);
            } else if (ctx?.wait) {
                await ctx.wait(ms);
            }
        }
    }

    function playSfx(recipe, phase) {
        const id = recipe.sfx?.[phase];
        if (id) try { global.window?.sfx?.(id); } catch (e) { /* */ }
    }

    function dfAnim() {
        return global.__dfAnim;
    }

    function recipeGlyph(recipe, phase) {
        if (!recipe) return "✨";
        if (phase === "impact") return recipe.impactEmoji || recipe.emoji || "✨";
        return recipe.emoji || recipe.impactEmoji || "✨";
    }

    function spawnEmojiSplash(x, y, emoji, anim) {
        if (!anim.alive() || !emoji) return;
        const el = document.createElement("div");
        el.className = "df-ult-emoji-splash";
        el.textContent = emoji;
        ultVfxPlace(el, x, y);
        setTimeout(() => { try { el.remove(); } catch (e) { /* */ } }, 980);
    }

    async function playEmojiIntro(recipe, opts) {
        const lib = dfAnim();
        if (!lib?.preAnimBanner || opts?.skipIntro || recipe?.skipIntro || recipe?.pngOnly) return;
        const heroEmoji = recipeGlyph(recipe, "windup");
        await lib.preAnimBanner({
            category: "ultimate",
            title: opts.ultimateName || opts.ultimateTitle || "",
            subtitle: opts.casterName || "",
            theme: {
                emoji: heroEmoji,
                color: `hsl(${recipe.hue ?? 42}, 90%, 65%)`,
                ring: recipe.ringColor || "#ffe8a0",
            },
            duration: Math.min(760, tms(recipe, "anticipate") + 520) || 700,
        });
    }

    function openBg(recipe) {
        if (recipe.skyClass) {
            const sky = ctx.domSky(recipe.skyClass);
            return { sky, vignette: null };
        }
        if (recipe.vignette) {
            return { sky: null, vignette: ctx.cinematicVignette(recipe.vignette, tms(recipe, "vignetteIn") || 260) };
        }
        return { sky: null, vignette: null };
    }

    function fadeBgOut(bg) {
        if (bg?.sky) {
            try {
                bg.sky.style.animation = "none";
                bg.sky.classList.add("ult-sky-out");
                bg.sky.style.opacity = "0";
            } catch (e) { /* */ }
            setTimeout(() => { try { bg.sky.remove(); } catch (e) { /* */ } }, 480);
        }
        if (bg?.vignette) {
            try { bg.vignette.style.opacity = "0"; } catch (e) { /* */ }
            setTimeout(() => { try { bg.vignette.remove(); } catch (e) { /* */ } }, 420);
        }
    }

    function closeBg(bg) {
        fadeBgOut(bg);
    }

    /** Remove céus/vignettes órfãos — evita paleta vermelha presa após crash ou reinício. */
    function purgeUltimateVfx() {
        const sel = [
            ".ult-skyRed", ".ult-skyIce", ".ult-skyGreen", ".ult-skyRage", ".ult-skyGold", ".ult-skyArcane",
            ".cancel-ult-sky", "[class^='ult-sky']",
            ".df-vfx-overlay", ".df-vfx-vignette",
            ".df-shield-dome", ".df-ult-anticipate", ".df-ult-particle",
            ".df-freeze-encase", ".df-freeze-shard", ".df-fortify-chevron",
            ".df-fortify-aura-emit", ".df-fortify-aura-inner", ".df-fortify-aura-bloom",
            ".df-fortify-pulse-blob", ".df-fortify-mote", ".df-fortify-anticipate",
            ".df-poison-slime-coat", ".df-poison-slime-drip", ".df-poison-slime-splat",
            ".df-explosion-blob", ".df-explosion-ember",
            ".df-might-divine-inner", ".df-might-divine-emit", ".df-might-pulse-blob",
            ".df-might-infuse-glow", ".df-might-mote", ".df-might-icon-reveal",
            ".df-investida-fire-core", ".df-investida-fire-jet", ".df-investida-badge",
            ".df-vamp-blood-beam", ".df-vamp-blood-drop", ".df-vamp-blood-splash",
            ".df-vamp-blood-svg", ".df-vamp-stream-glow", ".df-vamp-stream-core",
            ".df-vamp-stream-head", ".df-vamp-source-burst", ".df-vamp-source-spurt",
            ".df-vamp-blood-pellet", ".df-vamp-dest-burst",
            ".df-blue-meteor", ".df-blue-meteor-trail", ".df-blue-meteor-crater",
            ".df-blue-meteor-flash", ".df-blue-meteor-shock", ".df-cubic-dragon-hatch",
            ".df-poison-acid-ray", ".df-poison-acid-core", ".df-acid-explosion",
            ".df-bastion-light-pillar", ".df-bastion-shield-dome",
            ".df-fortify-light-pillar", ".df-fortify-aura-sustain",
            ".df-investida-fire-trail", ".df-investida-axe-fly",
            ".df-investida-fire-burst", ".df-investida-fire-blob",
            ".ult-meteor-sky", ".ult-meteor-starfield", ".ult-meteor", ".ult-meteor-spark",
            ".ult-meteor-flash", ".ult-meteor-shock",
            ".ult-war-sky",             ".ult-wall-sky", ".ult-wall-bricks", ".ult-wall-banner",
            ".ult-wall-field-glow", ".df-wall-shield-rise", ".df-wall-impact-dust",
            ".df-wall-stone-drop", ".df-wall-stone-impact", ".df-wall-stone-chip",
            ".df-poison-slime-fly", ".df-poison-slime-burst",
            ".df-poison-slime-png-fly", ".df-poison-slime-png-fly-inner",
            ".df-poison-slime-smoke-trail", ".df-poison-slime-smoke",
            ".df-poison-slime-png-impact-anchor", ".df-poison-slime-png-impact-img",
            ".df-fireball-meteor", ".df-toxic-beam", ".df-toxic-wash",
            ".df-war-sword-clash", ".df-war-purple-burst",
            ".df-hook-head-fly", ".df-hook-chain-rope", ".df-hook-pull-card",
            ".df-hook-emoji-fly", ".df-hook-snag-burst", ".df-hook-pull-glow", ".df-hook-yank-card",
            ".ult-blackhole", ".ult-banished", ".ult-banish-vortex", ".ult-banish-local-veil",
            ".ult-meteor-crater", ".ult-meteor-banner",
            ".ult-meteor-flying", ".df-slime-flying",
            ".ult-bomb", ".ult-bigBoom", ".ult-ember", ".ult-fuse-spark",
            ".df-ult-emoji-splash",
            ".df-potion-drop", ".df-potion-splash", ".df-potion-outcome-emoji",
            ".df-potion-mini-star", ".df-potion-fail-ooze", ".ult-potion-vial",
            ".pesadelo-smoke-burst", ".pesadelo-smoke-puff", ".pesadelo-smoke-emoji",
            ".pesadelo-field-smoke-host", ".pesadelo-smoke-puff-local",
        ].join(",");
        document.querySelectorAll(sel).forEach((el) => { try { el.remove(); } catch (e) { /* */ } });
        try { global.DfPixiVfx?.clearStage?.(); } catch (e) { /* */ }
        try { global.DfGsapBridge?.killAll?.(); } catch (e) { /* */ }
    }

    /** Limpa VFX órfãos (ultimates/animações presas) sem interromper combate ativo. */
    function sweepOrphans() {
        try { global.document?.documentElement?.classList?.remove("df-ult-cinematic"); } catch (e) { /* */ }
        document.querySelectorAll(
            ".death-ghost, .death-halo, .death-shard, .combat-snap-ghost, .summon-fly, .df-vfx-overlay, " +
            ".no-honor-burst, .legado-rays, .legado-hammer-fx"
        ).forEach((el) => { try { el.remove(); } catch (e) { /* */ } });
        try { global.__dfPurgeDestroyArtifacts?.(); } catch (e) { /* */ }
        if (!global.__dfCombatActive && !global.DfPixiVfx?.isCombatSceneActive?.()) {
            try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
            try { global.DfPixiVfx?.clearStage?.(); } catch (e) { /* */ }
        }
        document.querySelectorAll(".ccard.combat-animating").forEach((el) => {
            try { el.remove(); } catch (e) { /* */ }
        });
    }

    function spawnFortifyChevron(x, y, anim) {
        if (!anim.alive()) return;
        const unit = ctx.cardUnit?.(0.42) || 34;
        for (let i = 0; i < 3; i++) {
            const chev = document.createElement("div");
            chev.className = "df-fortify-chevron";
            const off = (i - 1) * unit * 0.55;
            chev.style.left = (x + off) + "px";
            chev.style.top = (y - unit * (0.38 + i * 0.12)) + "px";
            chev.style.animationDelay = (i * 90) + "ms";
            chev.style.transform = `translate(-50%, -50%) scale(${0.72 + i * 0.18})`;
            document.body.appendChild(chev);
            setTimeout(() => { try { chev.remove(); } catch (e) { /* */ } }, 920 + i * 90);
        }
    }

    /** Pulso suave no alvo — sem borda/anel (evita traços verdes). */
    function spawnFortifyAnticipate(x, y, anim, ms) {
        if (!anim.alive()) return;
        const size = Math.round(ctx.cardUnit?.(1.05) || 72);
        const el = document.createElement("div");
        el.className = "df-fortify-anticipate";
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.style.width = size + "px";
        el.style.height = size + "px";
        el.style.animationDuration = (ms ?? 200) + "ms";
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (e) { /* */ } }, (ms ?? 200) + 80);
    }

    function spawnShieldDome(x, y, anim, recipe) {
        if (!anim.alive()) return null;
        const w = Math.round((ctx.cardUnit?.(1.35) || 96));
        const h = Math.round(w * 1.22);
        const el = document.createElement("div");
        el.className = "df-shield-dome";
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.style.left = x + "px";
        el.style.top = (y - h * 0.08) + "px";
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (e) { /* */ } }, 1100);
        frontBurst(x, y, recipe, anim, recipeGlyph(recipe, "impact"));
        return el;
    }

    async function anticipate(x, y, recipe, anim) {
        if (!anim.alive()) return;
        playSfx(recipe, "anticipate");
        const size = ctx.cardUnit(0.5);
        const el = document.createElement("div");
        el.className = "df-ult-anticipate";
        el.style.cssText =
            `width:${size}px;height:${size}px;` +
            `border:2px solid hsla(${recipe.hue},90%,70%,0.85);border-radius:50%;pointer-events:none;` +
            `z-index:${ctx.Z - 1};transform:translate(-50%,-50%) scale(1.35);opacity:0.9;` +
            "transition:transform 180ms cubic-bezier(.4,0,.9,.6),opacity 180ms ease-out;";
        ultVfxPlace(el, x, y);
        requestAnimationFrame(() => {
            el.style.transform = "translate(-50%,-50%) scale(0.55)";
            el.style.opacity = "0.35";
        });
        setTimeout(() => el.remove(), 220);
        await ctx.wait(tms(recipe, "anticipate"));
    }

    function applyCardReaction(targetP, targetI, recipe, extraClasses, extraMs) {
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) return;
        const classes = extraClasses || recipe.cardClasses || [];
        for (const c of classes) el.classList.add(c);
        const dur = extraMs ?? recipe.cardClassMs ?? 1200;
        if (recipe.cardScalePunch !== false && el.animate) {
            el.animate(
                [{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }],
                { duration: 300, easing: "cubic-bezier(.2,.9,.3,1)" },
            ).catch(() => {});
        }
        if (classes.length) {
            setTimeout(() => { for (const c of classes) el.classList.remove(c); }, dur);
        }
    }

    function applyBanishVisual(targetP, targetI) {
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) return;
        el.style.transition = "opacity 480ms, filter 480ms";
        el.style.opacity = "0.12";
        el.style.filter = "brightness(0.35) saturate(0.25)";
        setTimeout(() => {
            el.style.opacity = "";
            el.style.filter = "";
            el.style.transition = "";
        }, 540);
    }

    function frontBurst(x, y, recipe, anim, glyph) {
        if (!anim.alive() || recipe?.noEmojiFx) return;
        const lib = dfAnim();
        const count = fx().nUlt(recipe.frontBurstCount ?? 8);
        const g = glyph || recipeGlyph(recipe, "impact");
        spawnEmojiSplash(x, y, recipeGlyph(recipe, "windup"), anim);
        if (lib?.spawnBurst) {
            lib.spawnBurst(count, "df-ult-particle df-ult-emoji-particle", (el, i, n) => {
                const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
                const dist = 45 + Math.random() * 75;
                el.textContent = g;
                const p = ultVfxMapPoint(x, y);
                el.style.left = p.x + "px";
                el.style.top = p.y + "px";
                if (ultVfxCanvasFly()) {
                    el.style.position = "absolute";
                    ultVfxMount(el);
                }
                el.style.setProperty("--px", Math.cos(ang) * dist + "px");
                el.style.setProperty("--py", Math.sin(ang) * dist + "px");
                el.style.color = `hsl(${recipe.hue + Math.random() * 18}, 95%, 78%)`;
            }, 880, () => {
                const d = document.createElement("div");
                d.className = "df-ult-particle df-ult-emoji-particle";
                return d;
            });
        } else if (lib?.spawnParticles) {
            lib.spawnParticles(x, y, count, g);
        }
    }

    async function impactAt(recipe, sheetId, x, y, anim, overrides = {}) {
        playSfx(recipe, "impact");
        const pixi = global.DfPixiVfx;
        const canvasP = ctx.playImpactSequence(sheetId, x, y, {
            scale: overrides.scale ?? ctx.ULT_IMPACT(),
            fps: overrides.fps ?? 28,
            ringColor: recipe.ringColor,
            ringScale: recipe.ringScale ?? 5.8,
            sparkHue: recipe.sparkHue ?? recipe.hue,
            sparkCount: fx().nUlt(recipe.sparkCount ?? 12),
            flashColor: recipe.flashColor,
            secondPass: overrides.secondPass ?? recipe.secondPass ?? false,
            preFlash: overrides.preFlash,
            blend: "screen",
            scalePulse: true,
        }, anim);
        const layers = [canvasP];
        if (pixi?.canUse?.()) {
            layers.push(pixi.playUltimateImpact(x, y, recipe, overrides));
            if (overrides.ultimateType) {
                layers.push(pixi.playUltimateSprite(overrides.ultimateType, x, y, recipe));
            } else if (recipe?.id) {
                layers.push(pixi.playUltimateSprite(recipe.id, x, y, recipe));
            }
        }
        await Promise.all(layers);
        if (recipe.tremor && overrides.targetP != null) ctx.tremorQuadrant(overrides.targetP);
    }

    async function pixiUltSprite(ultimateType, x, y, recipe, opts = {}) {
        const pixi = global.DfPixiVfx;
        const id = global.DfSpriteManifest?.spriteForUltimate?.(ultimateType);
        if (!pixi?.canUse?.() || !id) return false;
        return pixi.playSprite(id, x, y, {
            durationMs: opts.durationMs ?? (tms(recipe, "impact") || 720),
        });
    }

    function cometImpactPoints(mobile) {
        const grid = document.getElementById("game-grid");
        const gr = grid?.getBoundingClientRect() || {
            left: 0, top: 0, width: global.innerWidth, height: global.innerHeight,
        };
        return mobile
            ? [
                [gr.left + gr.width * 0.35, gr.top + gr.height * 0.45],
                [gr.left + gr.width * 0.65, gr.top + gr.height * 0.5],
                [gr.left + gr.width * 0.5, gr.top + gr.height * 0.62],
            ]
            : [
                [gr.left + gr.width * 0.28, gr.top + gr.height * 0.38],
                [gr.left + gr.width * 0.72, gr.top + gr.height * 0.42],
                [gr.left + gr.width * 0.5, gr.top + gr.height * 0.58],
                [gr.left + gr.width * 0.38, gr.top + gr.height * 0.68],
                [gr.left + gr.width * 0.62, gr.top + gr.height * 0.52],
            ];
    }

    /* ===================== GSAP + PIXI (padrão reutilizável) ===================== */

    /** Mapa type → função Pixi dedicada (expandir para as outras ultimates). */
    const GSAP_PIXI_SCENES = {
        targetEnemy: "playBombUltimateScene",
        targetAlly: "playFortifyUltimateScene",
        targetEnemyFreeze: "playFreezeUltimateScene",
        drawCard: "playConjureUltimateScene",
        poison: "playPoisonUltimateScene",
        vampirism: "playVampirismUltimateScene",
        warOverpower: "playWarUltimateScene",
        targetAllyShield: "playShieldDomeScene",
        trickerySwap: "playTrickerySwapScene",
        potion: "playPotionUltimateScene",
        cometStarfall: "playCometStarfallScene",
        resurrect: "playPaladinResurrectScene",
        banish: "playBanishUltimateScene",
    };

    /**
     * Verifica se GSAP+Pixi estão prontos para cena cinematográfica.
     * @param {string} [sceneKey] — ultimateType em GSAP_PIXI_SCENES
     */
    function gsapPixiReady(sceneKey) {
        if (global.__dfVfxQuality && global.__dfVfxQuality !== "full") return false;
        const gsap = global.DfGsapBridge;
        const pixi = global.DfPixiVfx;
        if (!gsap || !pixi) return false;
        if (!gsap.canUse?.() || !pixi.canUse?.()) return false;
        if (sceneKey) {
            const fnName = GSAP_PIXI_SCENES[sceneKey];
            if (!fnName || typeof pixi[fnName] !== "function") return false;
        }
        return true;
    }

    /**
     * Executa cena GSAP+Pixi com cleanup garantido (padrão para as 21 ultimates).
     * @param {string} type — ultimateType
     * @param {object} recipe
     * @param {object} opts — opts do director
     * @param {object} anim
     * @param {(scene: object) => Promise<void>} run — corpo da cena
     * @returns {Promise<boolean>} true se rodou via GSAP
     */
    async function playGsapUltimateScene(type, recipe, opts, anim, run) {
        const engine = global.DfVfxEngine;
        const pixi = global.DfPixiVfx;
        const fnName = GSAP_PIXI_SCENES[type];
        if (!fnName || typeof pixi?.[fnName] !== "function") return false;

                const ready = engine?.ensureCinematicReady
            ? await Promise.race([
                engine.ensureCinematicReady({ waitFull: true, maxMs: 10000 }),
                // Aparelhos lentos: a 1ª ultimate não pode cair no fallback “invisível”.
                new Promise((r) => setTimeout(() => r(false), 8000)),
            ])
            : gsapPixiReady(type);
        if (!ready) {
            // Última tentativa síncrona antes do fallback DOM.
            try {
                await global.DfGsapBridge?.ensureGsap?.(true);
                await global.DfPixiVfx?.ensureApp?.(true);
                if (gsapPixiReady(type)) {
                    /* continua abaixo */
                } else if (engine?.wantsUltimateCinematic?.() || engine?.wantsCinematic?.()) {
                    console.warn("[DfUltimateDirector] GSAP/Pixi indisponível:", type, {
                        mode: global.DfVfxSettings?.getMode?.(),
                        gsap: !!global.gsap,
                        pixi: !!global.DfPixiVfx?.canUse?.(),
                    });
                    return false;
                } else {
                    return false;
                }
            } catch (retryErr) {
                if (engine?.wantsUltimateCinematic?.() || engine?.wantsCinematic?.()) {
                    console.warn("[DfUltimateDirector] GSAP/Pixi indisponível:", type, retryErr);
                }
                return false;
            }
        } else if (!gsapPixiReady(type)) {
            return false;
        }

        const gsap = global.DfGsapBridge;
        if (!gsap) return false;
        const group = `ult:${type}:${Date.now()}`;
        gsap.setActiveGroup(group);
        try {
            document.documentElement.classList.add("df-ult-cinematic");
            const outcome = await run({
                gsap,
                pixi,
                recipe,
                opts,
                anim,
                tms: (phase) => tms(recipe, phase),
                playSfx: (phase) => playSfx(recipe, phase),
            });
            return outcome !== false;
        } catch (e) {
            console.warn("[DfUltimateDirector] GSAP scene", type, e);
            return false;
        } finally {
            document.documentElement.classList.remove("df-ult-cinematic");
            gsap.clearActiveGroup(group);
            sweepOrphans();
        }
    }

    /* ===================== CENAS POR ULTIMATE ===================== */

    /** Após explosão da bomba — estilhaço + voo ao descarte (mesma sequência, sem 2ª animação solta). */
    async function playBombDestroyTail(opts, anim) {
        if (!opts?.willDestroy || !anim.alive()) return;
        const targetP = opts.targetP;
        const targetI = opts.targetI;
        const snap = global.dfCaptureFieldCardSnap?.(targetP, targetI);
        const el = global.getChampionDom?.(targetP, targetI);
        if (!snap && !el) return;

        await ctx.wait(120);

        if (el) {
            el.classList.remove("ult-target-flash");
            el.classList.add("combat-src-hidden");
            el.style.visibility = "hidden";
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
        }

        const rect = el?.getBoundingClientRect?.();
        const cx = snap?.cx ?? (rect ? rect.left + rect.width / 2 : 0);
        const cy = snap?.cy ?? (rect ? rect.top + rect.height / 2 : 0);

        try { global.window?.sfx?.("champion_destroy"); } catch (e) { /* */ }

        // UMA única animação de destruição para a bomba. Antes rodava o burst
        // (playShatter) E TAMBÉM __dfFlyFieldCardToDiscard (→ playCardDestroy),
        // que re-renderizava a carta e estilhaçava de novo — muitas vezes com o
        // placeholder AZUL quando a textura não estava pronta (a "2ª animação
        // solta" do print). A carta já está escondida acima, então o burst GPU
        // basta. Sem a 2ª chamada, acaba a animação dupla e o resíduo azul.
        const pixi = global.DfPixiVfx;
        if (global.DfVfxEngine?.wantsGpuPresentation?.() && pixi?.playShatter) {
            await pixi.playShatter(cx, cy, { count: fx().n(22) });
        } else if (typeof global.__dfTriggerChampionShatter === "function") {
            await global.__dfTriggerChampionShatter(el, snap);
        }
        opts._bombDestroyVisualDone = true;
    }

    async function sceneBomb(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const from = opts.casterP != null ? ctx.resolveHandCenter(opts.casterP) : null;
        const fast = !!recipe.fastBomb;
        const gsapT = recipe.gsapTimings || {};
        const willDestroy = !!opts.willDestroy;

        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("targetEnemy", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playBombUltimateScene(to.x, to.y, recipe, {
                    cinematic: true,
                    travelMs: gsapT.travel ?? 940,
                    impactMs: gsapT.impact ?? 920,
                    lingerMs: gsapT.linger ?? 480,
                    windupMs: gsapT.windup ?? 200,
                    fromX: from?.x,
                    fromY: from?.y,
                    anim,
                    onImpact: () => {
                        scene.playSfx("impact");
                        ctx.tremorQuadrant(opts.targetP);
                    },
                });
                if (!ok || !anim.alive()) return false;
                await playBombDestroyTail(opts, anim);
                return true;
            });
        }
        if (ranGsap) return;

        const noEmoji = tryCinematic;
        if (noEmoji && !ranGsap) {
            console.warn("[DfUltimateDirector] Bomba: GSAP falhou — fallback sem emoji (só canvas).", {
                mode: global.DfVfxSettings?.getMode?.(),
                quality: global.__dfVfxQuality,
                gsap: !!global.gsap,
                pixi: !!global.DfPixiVfx?.canUse?.(),
            });
        }

        try {
            await playTimeline(recipe, {
                windup: async () => { playSfx(recipe, "windup"); },
                travel: async (ms) => {
                    if (noEmoji) {
                        await ctx.wait(ms || tms(recipe, "travel") || 700);
                        return;
                    }
                    await ctx.flyFallingBomb(to.x, to.y, anim, ms || tms(recipe, "travel"), { fast });
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    const pixi = global.DfPixiVfx;
                    const boomP = ctx.playBombExplosionAt(to.x, to.y, anim, recipe, { fast });
                    if (pixi?.canUse?.()) {
                        await Promise.all([
                            pixi.playUltimateImpact(to.x, to.y, recipe, { fast }),
                            boomP,
                        ]);
                    } else {
                        await boomP;
                    }
                    if (!anim.alive()) return;
                    if (!fast && !noEmoji) frontBurst(to.x, to.y, recipe, anim);
                    ctx.tremorQuadrant(opts.targetP);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
            await playBombDestroyTail(opts, anim);
        } catch (e) { /* */ }
    }

    /**
     * Âncora de alvo aliado (Fortalecer): a animação nasce SEMPRE sobre o campeão.
     * Ordem: elemento vivo por uid → elemento por índice → âncora capturada no
     * disparo. Só cai no fallback genérico se o campeão não existir mais no DOM.
     */
    function resolveAllyAnchor(opts) {
        const uid = opts?.targetUid;
        let el = null;
        if (uid != null) {
            try {
                el = global.document.querySelector(`.ccard[data-uid="${uid}"]`);
            } catch (e) { el = null; }
        }
        if (!el) el = global.getChampionDom?.(opts?.targetP, opts?.targetI) || null;
        const r = el?.getBoundingClientRect?.();
        if (r && r.width > 2 && r.height > 2) {
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.46 };
        }
        const a = opts?.targetAnchor;
        if (Number.isFinite(a?.x) && Number.isFinite(a?.y)) return { x: a.x, y: a.y };
        return ctx.resolveTargetCenter(opts?.targetP, opts?.targetI);
    }

    async function sceneFortify(opts, anim, recipe) {
        const to = resolveAllyAnchor(opts);
        const from = ctx.resolveHandCenter?.(opts.casterP) || {
            x: global.innerWidth / 2,
            y: Math.max(60, global.innerHeight * 0.14),
        };
        const gsapT = recipe.gsapTimings || {};
        let cardReacted = false;

        const tryCinematic = global.DfVfxEngine?.wantsGpuPresentation?.()
            || global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("targetAlly", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playFortifyUltimateScene(to.x, to.y, recipe, {
                    cinematic: true,
                    fromX: from.x,
                    fromY: from.y,
                    windupMs: gsapT.windup ?? 480,
                    travelMs: gsapT.travel ?? 720,
                    impactMs: gsapT.impact ?? 900,
                    lingerMs: gsapT.linger ?? 400,
                    anim,
                    onImpact: () => {
                        scene.playSfx("impact");
                        if (!cardReacted && anim.alive()) {
                            applyCardReaction(opts.targetP, opts.targetI, recipe);
                            cardReacted = true;
                        }
                        spawnFortifyChevron(to.x, to.y, anim);
                        ctx.screenFlash(to.x, to.y, recipe.flashColor ?? "rgba(60,255,140,0.45)", 0.44, 320);
                        ctx.buffPulse(opts.targetP, opts.targetI);
                    },
                });
                if (!ok || !anim.alive()) return false;
                if (!cardReacted) applyCardReaction(opts.targetP, opts.targetI, recipe);
                return true;
            });
        }
        if (ranGsap) return;

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.spawnFortifyLightPillar(
                        opts.targetP, opts.targetI, anim,
                        ms || tms(recipe, "windup") || tms(recipe, "anticipate") || 660,
                    );
                },
                impact: async (ms) => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    await ctx.spawnFortifyAuraFromChampion(opts.targetP, opts.targetI, anim, ms || tms(recipe, "impact"));
                    ctx.screenFlash(to.x, to.y, recipe.flashColor, 0.44, 320);
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    spawnFortifyChevron(to.x, to.y, anim);
                    ctx.buffPulse(opts.targetP, opts.targetI);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneFreeze(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const from = opts.casterP != null ? ctx.resolveHandCenter?.(opts.casterP) : null;
        const gsapT = recipe.gsapTimings || {};
        let cardReacted = false;

        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("targetEnemyFreeze", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playFreezeUltimateScene(to.x, to.y, recipe, {
                    cinematic: true,
                    fromX: from?.x,
                    fromY: from?.y,
                    windupMs: gsapT.windup ?? 360,
                    travelMs: gsapT.travel ?? 820,
                    impactMs: gsapT.impact ?? 1000,
                    lingerMs: gsapT.linger ?? 0,
                    anim,
                    onImpact: () => {
                        scene.playSfx("impact");
                        if (!cardReacted && anim.alive()) {
                            applyCardReaction(opts.targetP, opts.targetI, recipe);
                            cardReacted = true;
                        }
                        ctx.screenFlash(to.x, to.y, recipe.flashColor ?? "rgba(180,240,255,0.48)", 0.42, 340);
                        ctx.tremorQuadrant(opts.targetP);
                        frontBurst(to.x, to.y, recipe, anim);
                    },
                });
                if (!ok || !anim.alive()) return false;
                if (!cardReacted) applyCardReaction(opts.targetP, opts.targetI, recipe);
                return true;
            });
        }
        if (ranGsap) return;

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async () => {
                    playSfx(recipe, "windup");
                    await anticipate(to.x, to.y, recipe, anim);
                },
                travel: async (ms) => {
                    await ctx.freezeEncaseChampion(opts.targetP, opts.targetI, anim, ms || tms(recipe, "travel"));
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    await impactAt(recipe, recipe.sheets.impact, to.x, to.y, anim, {
                        targetP: opts.targetP,
                        preFlash: "rgba(180,240,255,0.38)",
                        secondPass: false,
                        fps: 32,
                    });
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    frontBurst(to.x, to.y, recipe, anim);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneCharge(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const from = ctx.resolveHandCenter(opts.casterP);
        const bg = openBg(recipe);
        const pixi = global.DfPixiVfx;
        const gpu = global.DfVfxEngine?.wantsGpuPresentation?.() && pixi?.playPistolThrowScene;
        try {
            if (gpu) {
                // INVESTIDA (Tina Punker): pistola colorida arremessada → brilho → status.
                playSfx(recipe, "windup");
                await pixi.playPistolThrowScene({
                    cx: to.x,
                    cy: to.y,
                    cinematic: true,
                    onImpact: () => {
                        playSfx(recipe, "impact");
                        if (opts.targetP != null) ctx.tremorQuadrant(opts.targetP);
                    },
                });
                // O status só aparece DEPOIS da aura (pedido do autor).
                applyCardReaction(opts.targetP, opts.targetI, recipe);
                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                return;
            }
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                travel: async (ms) => {
                    await ctx.flyInvestidaAxe(from.x, from.y, to.x, to.y, anim, ms || tms(recipe, "travel"));
                },
                impact: async (ms) => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    await ctx.spawnInvestidaFireImpact(opts.targetP, opts.targetI, anim, ms || tms(recipe, "impact"));
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    frontBurst(to.x, to.y, recipe, anim);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneShield(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);

        // GPU cartoon (Hearthstone): pilar de luz + domo hexagonal toon.
        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        if (tryCinematic) {
            let reacted = false;
            const ran = await playGsapUltimateScene("targetAllyShield", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                return await scene.pixi.playShieldDomeScene({
                    cx: to.x, cy: to.y, cinematic: true,
                    onImpact: () => {
                        scene.playSfx("impact");
                        if (!reacted && anim.alive()) {
                            applyCardReaction(opts.targetP, opts.targetI, recipe);
                            const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                            if (el) {
                                el.classList.add("barrier-aura");
                                setTimeout(() => el.classList.remove("barrier-aura"), recipe.cardClassMs ?? 2400);
                            }
                            reacted = true;
                        }
                    },
                });
            });
            if (ran) {
                if (!reacted && anim.alive()) {
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                    if (el) {
                        el.classList.add("barrier-aura");
                        setTimeout(() => el.classList.remove("barrier-aura"), recipe.cardClassMs ?? 2400);
                    }
                }
                return;
            }
        }

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async () => {
                    playSfx(recipe, "windup");
                    await anticipate(to.x, to.y, recipe, anim);
                    await ctx.spawnBastionLightPillar(opts.targetP, opts.targetI, anim, tms(recipe, "windup"));
                },
                impact: async (ms) => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    await ctx.spawnBastionShieldDome(opts.targetP, opts.targetI, anim, ms || tms(recipe, "impact"));
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                    if (el) {
                        el.classList.add("barrier-aura");
                        setTimeout(() => el.classList.remove("barrier-aura"), recipe.cardClassMs ?? 2400);
                    }
                    frontBurst(to.x, to.y, recipe, anim);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneThunder(opts, anim, recipe) {
        const points = opts.strikePoints || [];
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                stagger: async () => {
                    const stagger = tms(recipe, "stagger");
                    const pixi = global.DfPixiVfx;
                    const gpu = global.DfVfxEngine?.wantsGpuPresentation?.() && pixi?.playThunderStrikeScene;
                    for (let i = 0; i < points.length; i++) {
                        if (!anim.alive()) break;
                        const pt = points[i];
                        if (i > 0) await ctx.wait(stagger);
                        if (gpu) {
                            try {
                                await pixi.playThunderStrikeScene({
                                    cx: pt.x,
                                    cy: pt.y,
                                    cinematic: true,
                                    seed: i * 2.1 + 0.5,
                                    onImpact: () => {
                                        if (recipe.tremor) {
                                            const list = pt.tremorAll
                                                || (pt.p != null ? [pt.p] : []);
                                            list.forEach((pp) => ctx.tremorQuadrant(pp));
                                        }
                                    },
                                });
                            } finally {
                                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                            }
                        } else {
                            if (pixi?.canUse?.()) {
                                await pixi.playLightningStrike(pt.x, pt.y, { height: 240 + i * 20 });
                            }
                            await pixiUltSprite("thunderDiscard", pt.x, pt.y, recipe, {
                                durationMs: tms(recipe, "impact") || 520,
                            });
                            await ctx.spawnLightningStrike(pt.x, pt.y, anim, {
                                jitter: i * 1.7,
                                bold: true,
                                flashColor: "rgba(220,240,255,0.78)",
                            });
                            await impactAt(recipe, recipe.sheets.impact, pt.x, pt.y, anim, {
                                targetP: pt.p,
                                preFlash: "rgba(200,230,255,0.42)",
                                scale: fx().mobile ? 1.42 : 1.78,
                                ringScale: recipe.ringScale ?? 7.2,
                                fps: 34,
                                secondPass: false,
                            });
                        }
                    }
                },
                linger: async (ms) => { await ctx.wait(ms || tms(recipe, "linger")); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneComet(opts, anim, recipe) {
        const mobile = fx().mobile;
        let sky = null;
        let stars = null;
        const grRef = { gr: null };
        try {
            const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
                || global.DfVfxEngine?.wantsCinematic?.()
                || global.DfVfxSettings?.getMode?.() === "full";
            if (tryCinematic && typeof global.DfPixiVfx?.playCometStarfallScene === "function") {
                playSfx(recipe, "windup");
                const impacts = cometImpactPoints(mobile);
                const ok = await global.DfPixiVfx.playCometStarfallScene({
                    cinematic: true,
                    impacts,
                });
                if (ok) {
                    playSfx(recipe, "impact");
                    if (recipe.globalTremor && !mobile) {
                        for (let p = 0; p < (opts.playersCount || 4); p++) ctx.tremorQuadrant(p);
                    }
                    return;
                }
            }
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    if (!mobile && !recipe?.noEmojiFx) {
                        const banner = document.createElement("div");
                        banner.className = "ult-meteor-banner";
                        banner.textContent = "COMETA ESTRELAR";
                        document.body.appendChild(banner);
                        setTimeout(() => { try { banner.remove(); } catch (e) { /* */ } }, 1200);
                    }
                    if (!mobile) {
                        sky = ctx.domSky("ult-meteor-sky");
                        stars = ctx.domSky("ult-meteor-starfield");
                    }
                    await ctx.wait(Math.round((ms || tms(recipe, "anticipate")) * (mobile ? 0.55 : 1)));
                    const grid = document.getElementById("game-grid");
                    grRef.gr = grid?.getBoundingClientRect() || {
                        left: 0, top: 0, width: global.innerWidth, height: global.innerHeight,
                    };
                },
                travel: async () => {
                    const impacts = cometImpactPoints(mobile);
                    const travel = Math.round(tms(recipe, "travel") * (mobile ? 0.78 : 1));
                    const stagger = Math.round(tms(recipe, "stagger") * (mobile ? 0.65 : 1));
                    for (let i = 0; i < impacts.length; i++) {
                        if (!anim.alive()) break;
                        await ctx.wait(i * stagger);
                        const [ex, ey] = impacts[i];
                        const sx = ex + (Math.random() - 0.5) * (mobile ? 70 : 120);
                        const sy = Math.max(6, (grRef.gr?.top ?? 0) - 40 - Math.random() * (mobile ? 60 : 100));
                        await ctx.flySkyMeteor(sx, sy, ex, ey, anim, travel);
                        if (!anim.alive()) break;
                        ctx.spawnMeteorGroundHit(ex, ey, anim, recipe);
                        await pixiUltSprite("cometStarfall", ex, ey, recipe, { durationMs: 520 });
                    }
                },
                impact: async () => {
                    const gr = grRef.gr || {
                        left: 0, top: 0, width: global.innerWidth, height: global.innerHeight,
                    };
                    if (recipe.globalTremor && !mobile) {
                        for (let p = 0; p < (opts.playersCount || 4); p++) ctx.tremorQuadrant(p);
                    }
                    ctx.screenFlash(gr.left + gr.width / 2, gr.top + gr.height / 2,
                        recipe.flashColor ?? "rgba(255,200,80,0.45)", mobile ? 0.28 : 0.38, mobile ? 240 : 340);
                },
                linger: async (ms) => {
                    sky?.classList.add("fade-out");
                    stars?.classList.add("fade-out");
                    setTimeout(() => { try { sky?.remove(); stars?.remove(); } catch (e) { /* */ } }, 420);
                    await ctx.wait(Math.round((ms || tms(recipe, "linger")) * (mobile ? 0.45 : 1)));
                },
            }, anim);
        } catch (e) { /* */ }
    }

    async function sceneFireIceFreeze(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        let breathImpactDone = false;
        const applyBreathImpact = () => {
            if (breathImpactDone) return;
            breathImpactDone = true;
            if (typeof opts.onBreathImpact === "function") {
                try { opts.onBreathImpact(); } catch (e) { /* */ }
            }
        };
        // JEKIRO (Fogo e Gelo): baforada de GELO de dragão no campeão congelado.
        const gpuBreath = global.DfVfxEngine?.wantsGpuPresentation?.()
            && typeof global.DfPixiVfx?.playDragonBreathScene === "function";
        if (gpuBreath) {
            playSfx(recipe, "windup");
            let reacted = false;
            const react = () => {
                if (!reacted && anim.alive()) { reacted = true; applyCardReaction(opts.targetP, opts.targetI, recipe); }
            };
            const onBreathHit = () => {
                playSfx(recipe, "impact");
                react();
                applyBreathImpact();
            };
            const ran = await global.DfPixiVfx.playDragonBreathScene({
                cx: to.x, cy: to.y, mode: "ice", cinematic: true, sweepFromLeft: true,
                onImpact: onBreathHit,
            });
            if (ran) { react(); try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ } return; }
        }
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async () => { await anticipate(to.x, to.y, recipe, anim); },
                impact: async () => {
                    if (global.DfVfxEngine?.wantsGpuPresentation?.()
                        && typeof global.DfPixiVfx?.playFireIceImpactScene === "function") {
                        global.DfPixiVfx.playFireIceImpactScene({ cx: to.x, cy: to.y, mode: "ice", cinematic: true });
                    }
                    await impactAt(recipe, recipe.sheets.impact, to.x, to.y, anim, { targetP: opts.targetP });
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    applyBreathImpact();
                    frontBurst(to.x, to.y, recipe, anim, recipeGlyph(recipe, "impact"));
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
            applyBreathImpact();
        }
    }

    async function sceneFireIceBurn(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        let breathImpactDone = false;
        const applyBreathImpact = () => {
            if (breathImpactDone) return;
            breathImpactDone = true;
            if (typeof opts.onBreathImpact === "function") {
                try { opts.onBreathImpact(); } catch (e) { /* */ }
            }
        };
        // JEKIRO (Fogo e Gelo): baforada de FOGO de dragão em quem perde poder (mesmo roteiro do gelo).
        const gpuBreath = global.DfVfxEngine?.wantsGpuPresentation?.()
            && typeof global.DfPixiVfx?.playDragonBreathScene === "function";
        if (gpuBreath) {
            playSfx(recipe, "windup");
            let reacted = false;
            const react = () => {
                if (!reacted && anim.alive()) { reacted = true; applyCardReaction(opts.targetP, opts.targetI, recipe); }
            };
            const onBreathHit = () => {
                playSfx(recipe, "impact");
                react();
                applyBreathImpact();
            };
            const ran = await global.DfPixiVfx.playDragonBreathScene({
                cx: to.x, cy: to.y, mode: "fire", cinematic: true, sweepFromLeft: true,
                onImpact: onBreathHit,
            });
            if (ran) { react(); try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ } return; }
        }
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async () => { await anticipate(to.x, to.y, recipe, anim); },
                impact: async () => {
                    playSfx(recipe, "impact");
                    if (global.DfPixiVfx?.playDragonBreathScene) {
                        await global.DfPixiVfx.playDragonBreathScene({
                            cx: to.x, cy: to.y, mode: "fire", cinematic: true,
                            onImpact: applyBreathImpact,
                        });
                    }
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    applyBreathImpact();
                    frontBurst(to.x, to.y, recipe, anim, recipeGlyph(recipe, "impact"));
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
            applyBreathImpact();
        }
    }

    async function sceneWar(opts, anim, recipe) {
        const targets = opts.fieldTargets || [];
        const gsapT = recipe.gsapTimings || {};
        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic && targets.length) {
            ranGsap = await playGsapUltimateScene("warOverpower", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const mappedTargets = targets.map((t) => {
                    const c = ctx.resolveTargetCenter(t.targetP, t.targetI);
                    return { x: c.x, y: c.y, targetP: t.targetP, targetI: t.targetI };
                });
                const ok = await scene.pixi.playWarUltimateScene(recipe, {
                    cinematic: true,
                    targets: mappedTargets,
                    windupMs: gsapT.windup ?? 420,
                    staggerMs: tms(recipe, "stagger") || 380,
                    impactMs: gsapT.impact ?? 680,
                    lingerMs: gsapT.linger ?? 380,
                    anim,
                    onTargetImpact: (idx) => {
                        if (!anim.alive()) return;
                        scene.playSfx("impact");
                        const t = targets[idx];
                        if (!t) return;
                        applyCardReaction(t.targetP, t.targetI, recipe, ["ult-war-impact"], 720);
                        ctx.buffPulse(t.targetP, t.targetI);
                    },
                });
                if (!ok || !anim.alive()) return false;
                ctx.screenFlash(global.innerWidth / 2, global.innerHeight * 0.44,
                    recipe.flashColor ?? "rgba(150,80,255,0.48)", 0.42, 400);
                return true;
            });
        }
        if (ranGsap) return;

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                impact: async () => {
                    const stagger = tms(recipe, "stagger");
                    for (let i = 0; i < targets.length; i++) {
                        if (!anim.alive()) break;
                        const t = targets[i];
                        if (i > 0) await ctx.wait(stagger);
                        playSfx(recipe, "impact");
                        await ctx.spawnWarPurpleImpactAndSmoke(t.targetP, t.targetI, anim, recipe);
                        applyCardReaction(t.targetP, t.targetI, recipe, ["ult-war-impact"], 720);
                    }
                    if (anim.alive()) {
                        ctx.screenFlash(global.innerWidth / 2, global.innerHeight * 0.44,
                            "rgba(150,80,255,0.48)", 0.42, 400);
                    }
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneMight(opts, anim, recipe) {
        const targets = opts.fieldTargets || [];
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                impact: async (ms) => {
                    const auraMs = ms || tms(recipe, "impact");
                    const stagger = tms(recipe, "stagger");
                    for (let i = 0; i < targets.length; i++) {
                        if (!anim.alive()) break;
                        const t = targets[i];
                        if (i > 0) await ctx.wait(stagger);
                        playSfx(recipe, "impact");
                        await ctx.spawnMightDivineAuraFromChampion(t.targetP, t.targetI, anim, auraMs);
                        applyCardReaction(t.targetP, t.targetI, recipe);
                        const c = ctx.resolveTargetCenter(t.targetP, t.targetI);
                        frontBurst(c.x, c.y, recipe, anim);
                        ctx.buffPulse(t.targetP, t.targetI);
                    }
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneVamp(opts, anim, recipe) {
        const enemyP = opts.enemyP ?? opts.targetP;
        const enemyI = opts.enemyI ?? opts.targetI;
        const allyI = opts.allyI ?? 0;
        const enemy = ctx.resolveTargetCenter(enemyP, enemyI);
        const ally = ctx.resolveTargetCenter(opts.casterP, allyI);
        const gsapT = recipe.gsapTimings || {};
        let cardReacted = false;

        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("vampirism", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playVampirismUltimateScene(
                    enemy.x, enemy.y, ally.x, ally.y, recipe, {
                        cinematic: true,
                        windupMs: gsapT.windup ?? 320,
                        travelMs: gsapT.travel ?? 1300,
                        impactMs: gsapT.impact ?? 720,
                        lingerMs: gsapT.linger ?? 520,
                        anim,
                        enemyP, enemyI,
                        allyP: opts.casterP, allyI,
                        onImpact: () => {
                            scene.playSfx("impact");
                            if (!cardReacted && anim.alive()) {
                                applyCardReaction(enemyP, enemyI, recipe, ["ult-target-flash", "ult-vamp-bleed"]);
                                applyCardReaction(opts.casterP, allyI, recipe,
                                    recipe.allyCardClasses ?? ["ult-vamp-absorb", "ult-vamp-receive"]);
                                cardReacted = true;
                            }
                            ctx.screenFlash((enemy.x + ally.x) / 2, (enemy.y + ally.y) / 2,
                                recipe.flashColor ?? "rgba(255,40,70,0.48)", 0.42, 360);
                            ctx.tremorQuadrant(enemyP);
                            ctx.tremorQuadrant(opts.casterP);
                        },
                    },
                );
                if (!ok || !anim.alive()) return false;
                if (!cardReacted) {
                    applyCardReaction(enemyP, enemyI, recipe, ["ult-target-flash", "ult-vamp-bleed"]);
                    applyCardReaction(opts.casterP, allyI, recipe,
                        recipe.allyCardClasses ?? ["ult-vamp-absorb", "ult-vamp-receive"]);
                }
                return true;
            });
        }
        if (ranGsap) return;

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(Math.round((ms || tms(recipe, "anticipate")) * 0.65));
                },
                travel: async (ms) => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    const streamMs = ms || Math.round(tms(recipe, "travel") + tms(recipe, "impact") * 0.85);
                    await ctx.spawnVampBloodStream(enemyP, enemyI, opts.casterP, allyI, anim, streamMs);
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    applyCardReaction(enemyP, enemyI, recipe, ["ult-target-flash", "ult-vamp-bleed"]);
                    applyCardReaction(opts.casterP, allyI, recipe, recipe.allyCardClasses ?? ["ult-vamp-absorb", "ult-vamp-receive"]);
                    ctx.screenFlash((enemy.x + ally.x) / 2, (enemy.y + ally.y) / 2,
                        recipe.flashColor ?? "rgba(255,40,70,0.48)", 0.42, 360);
                    frontBurst(ally.x, ally.y, recipe, anim, "🩸");
                },
                linger: async (ms) => { await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.55)); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneTrickery(opts, anim, recipe) {
        const a = ctx.resolveTargetCenter(opts.allyP, opts.allyI);
        const e = ctx.resolveTargetCenter(opts.enemyP, opts.enemyI);
        let bg = null;
        try {
            await playTimeline(recipe, {
                windup: async () => {
                    playSfx(recipe, "windup");
                    bg = openBg(recipe);
                    if (bg) {
                        bg.style.opacity = "1";
                        anim.onDone(() => { try { bg?.remove(); } catch (err) { /* */ } });
                    }
                    await ctx.wait(Math.round(tms(recipe, "anticipate") * 0.45));
                },
                travel: async () => {
                    // Overlay GPU de gosma cartoon (Hearthstone) em paralelo à
                    // troca real das cartas (DOM). Não bloqueia o swap.
                    let gooPromise = null;
                    const wantsGpu = global.DfVfxEngine?.wantsGpuPresentation?.()
                        && typeof global.DfPixiVfx?.playTrickerySwapScene === "function";
                    if (wantsGpu) {
                        gooPromise = global.DfPixiVfx.playTrickerySwapScene({
                            ax: a.x, ay: a.y, bx: e.x, by: e.y, cinematic: true,
                        });
                    }
                    if (global.__dfPlayTrickerySwapVisual) {
                        await global.__dfPlayTrickerySwapVisual(
                            opts.allyP, opts.allyI, opts.enemyP, opts.enemyI,
                        );
                    } else if (global.animateChampionFlyToHand) {
                        await global.animateChampionFlyToHand(opts.enemyP, opts.enemyI, opts.targetCard);
                    } else {
                        await anticipate((a.x + e.x) / 2, (a.y + e.y) / 2, recipe, anim);
                    }
                    if (gooPromise) { try { await gooPromise; } catch (err) { /* */ } }
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    ctx.screenFlash((a.x + e.x) / 2, (a.y + e.y) / 2,
                        recipe.flashColor ?? "rgba(200,110,255,0.55)", 0.58, 420);
                },
                linger: async (ms) => {
                    await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.55));
                },
            }, anim);
        } finally {
            if (bg) closeBg(bg);
        }
    }

    async function sceneHook(opts, anim, recipe) {
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                travel: async () => {
                    await ctx.animateHookPullChampion(
                        opts.casterP, opts.targetP, opts.targetI, anim, recipe,
                        { destSlot: opts.destSlot },
                    );
                },
                impact: async () => { playSfx(recipe, "impact"); },
                linger: async (ms) => { await ctx.wait(ms || tms(recipe, "linger")); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    function purgeBanishFx() {
        document.querySelectorAll(
            ".ult-blackhole, .ult-banish-vortex, .ult-banish-local-veil, .ult-banish-fly"
        ).forEach((el) => { try { el.remove(); } catch (e) { /* */ } });
    }

    async function sceneBanish(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const champEl = global.getChampionDom?.(opts.targetP, opts.targetI);
        const fieldCard = global.getState?.()?.players?.[opts.targetP]?.field?.[opts.targetI] || null;
        const cardName = opts.cardName
            || champEl?.querySelector?.(".nm")?.textContent?.trim()
            || fieldCard?.name
            || null;
        const cardPower = opts.currentPower ?? opts.power
            ?? fieldCard?.currentPower ?? fieldCard?.power ?? null;
        if (cardName && global.DfCardFace?.isComposed?.(cardName) && global.DfCardFace.warmFace) {
            try {
                await Promise.race([
                    global.DfCardFace.warmFace(
                        { name: cardName, currentPower: cardPower, power: cardPower },
                        { power: cardPower },
                    ),
                    new Promise((r) => setTimeout(() => r(""), 900)),
                ]);
            } catch (e) { /* */ }
        }
        const gsapT = recipe.gsapTimings || {};
        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("banish", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                let sucked = false;
                const ok = await scene.pixi.playBanishUltimateScene(to.x, to.y, recipe, {
                    cinematic: true,
                    windupMs: gsapT.windup ?? 280,
                    travelMs: gsapT.travel ?? 850,
                    impactMs: gsapT.impact ?? 420,
                    lingerMs: gsapT.linger ?? 280,
                    anim,
                    cardName,
                    currentPower: cardPower,
                    power: cardPower,
                    targetP: opts.targetP,
                    targetI: opts.targetI,
                    onSuck: () => {
                        if (sucked || !anim.alive()) return;
                        sucked = true;
                        const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                        if (el) {
                            el.style.visibility = "hidden";
                            el.style.opacity = "0";
                            el.style.pointerEvents = "none";
                        }
                    },
                    onImpact: () => {
                        scene.playSfx("impact");
                        applyCardReaction(opts.targetP, opts.targetI, recipe);
                    },
                });
                if (!ok || !anim.alive()) return false;
                if (!sucked) {
                    const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                    if (el) {
                        el.style.visibility = "hidden";
                        el.style.opacity = "0";
                    }
                }
                ctx.screenFlash(to.x, to.y, "rgba(120,60,255,0.55)", 0.42, 260);
                return true;
            });
        }
        if (ranGsap) {
            purgeBanishFx();
            return;
        }
        let localVeil = null;
        try {
            await playTimeline(recipe, {
                windup: async () => {
                    playSfx(recipe, "windup");
                    localVeil = document.createElement("div");
                    localVeil.className = "ult-banish-local-veil";
                    localVeil.style.left = (to.x - 90) + "px";
                    localVeil.style.top = (to.y - 70) + "px";
                    document.body.appendChild(localVeil);
                    requestAnimationFrame(() => localVeil.classList.add("active"));
                    const suckMs = fx().mobile ? 680 : 820;
                    ctx.spawnBanishPortal(to.x, to.y, anim, suckMs + 120);
                    ctx.spawnBanishVortex(to.x, to.y, anim);
                    await ctx.wait(fx().mobile ? 160 : 200);
                },
                travel: async () => {
                    if (!anim.alive()) return;
                    await ctx.applyBanishPortalSuck(opts.targetP, opts.targetI, to.x, to.y, anim);
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    await pixiUltSprite("banish", to.x, to.y, recipe);
                    ctx.screenFlash(to.x, to.y, "rgba(120,60,255,0.55)", 0.42, 260);
                    applyCardReaction(opts.targetP, opts.targetI, recipe);
                    frontBurst(to.x, to.y, recipe, anim, "🌀");
                },
                linger: async (ms) => {
                    await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.28));
                },
            }, anim);
        } finally {
            localVeil?.classList.remove("active");
            try { localVeil?.remove(); } catch (e) { /* */ }
            purgeBanishFx();
        }
    }

    async function sceneScare(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        await playTimeline(recipe, {
            windup: async () => { playSfx(recipe, "windup"); },
            travel: async () => {
                if (global.playScareReturnVisual) {
                    await global.playScareReturnVisual(
                        opts.targetP, opts.targetI, opts.targetCard, null, { ultimate: true },
                    );
                } else if (global.animateChampionFlyToHand) {
                    await global.animateChampionFlyToHand(opts.targetP, opts.targetI, opts.targetCard);
                } else {
                    await anticipate(to.x, to.y, recipe, anim);
                }
            },
            impact: async () => {
                if (!global.playScareReturnVisual && !global.animateChampionFlyToHand) {
                    ctx.screenFlash(to.x, to.y, recipe.flashColor, 0.42, 280);
                    await ctx.wait(tms(recipe, "impact"));
                }
                await pixiUltSprite("scareReturn", to.x, to.y, recipe, { durationMs: 680 });
            },
            linger: async (ms) => {
                await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.35));
            },
        }, anim);
    }

    async function sceneConjure(opts, anim, recipe) {
        const hand = ctx.resolveHandCenter(opts.casterP);
        // EURÁVIA (Conjuração): pedido do autor — a cena ocorre no CENTRO da
        // tela (não mais no lado do invocador). O portal abre no centro e a
        // carta conjurada voa de lá para a mão do jogador.
        const cx = (global.innerWidth || 1024) / 2;
        const cy = (global.innerHeight || 768) * 0.46;
        const gsapT = recipe.gsapTimings || {};

        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("drawCard", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playConjureUltimateScene(cx, cy, recipe, {
                    cinematic: true,
                    handX: hand.x,
                    handY: hand.y,
                    windupMs: gsapT.windup ?? 380,
                    portalMs: gsapT.portal ?? 720,
                    travelMs: gsapT.travel ?? 880,
                    impactMs: gsapT.impact ?? 520,
                    lingerMs: gsapT.linger ?? 360,
                    anim,
                    onImpact: () => scene.playSfx("impact"),
                });
                if (!ok || !anim.alive()) return false;
                return true;
            });
        }
        if (ranGsap) return;

        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                anticipate: async (ms) => {
                    playSfx(recipe, "windup");
                    await ctx.wait(ms || tms(recipe, "anticipate"));
                },
                windup: async () => {
                    await impactAt(recipe, recipe.sheets.impact, cx, cy, anim, {
                        scale: fx().mobile ? 1.55 : 1.92,
                        secondPass: recipe.secondPass,
                    });
                    await ctx.wait(120);
                },
                travel: async (ms) => {
                    await ctx.flyMysticCard(cx, cy, hand.x, hand.y, anim, ms || tms(recipe, "travel"));
                },
                impact: async () => { playSfx(recipe, "impact"); },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneDragon(opts, anim, recipe) {
        const slot = opts.fieldSlot != null
            ? ctx.resolveFieldSlotCenter(opts.casterP, opts.fieldSlot)
            : ctx.resolveQuadrantCenter(opts.casterP, 0.48);
        // SANGUE DE DRAGÃO: meteoro imponente cai → Dragão Cúbico surge no campo.
        const gpuMeteor = global.DfVfxEngine?.wantsGpuPresentation?.()
            && typeof global.DfPixiVfx?.playDragonMeteorScene === "function";
        if (gpuMeteor) {
            playSfx(recipe, "windup");
            const ran = await global.DfPixiVfx.playDragonMeteorScene({
                cx: slot.x, cy: slot.y, cinematic: true,
                onImpact: () => { playSfx(recipe, "impact"); try { ctx.tremorQuadrant(opts.casterP); } catch (e) { /* */ } },
            });
            if (ran) {
                return;
            }
        }
        const bg = openBg(recipe);
        try {
            await playTimeline(recipe, {
                windup: async () => {
                    playSfx(recipe, "windup");
                    await anticipate(slot.x, slot.y, recipe, anim);
                },
                travel: async (ms) => {
                    await ctx.flyBlueDragonMeteor(slot.x, slot.y, anim, ms || tms(recipe, "travel"));
                },
                impact: async () => {
                    if (!anim.alive()) return;
                    playSfx(recipe, "impact");
                    ctx.spawnBlueDragonMeteorImpact(slot.x, slot.y, anim, recipe);
                    ctx.tremorQuadrant(opts.casterP);
                    await ctx.wait(tms(recipe, "linger") || 400);
                },
                linger: async (ms) => { await ctx.wait(ms); },
            }, anim);
        } finally {
            closeBg(bg);
        }
    }

    async function sceneResurrect(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const gsapT = recipe.gsapTimings || {};
        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("resurrect", recipe, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playPaladinResurrectScene(to.x, to.y, recipe, {
                    cinematic: true,
                    windupMs: gsapT.windup ?? 400,
                    impactMs: gsapT.impact ?? 620,
                    lingerMs: gsapT.linger ?? 400,
                    anim,
                    onImpact: () => {
                        scene.playSfx("impact");
                        applyCardReaction(opts.targetP, opts.targetI, recipe);
                        ctx.buffPulse(opts.targetP, opts.targetI);
                    },
                });
                if (!ok || !anim.alive()) return false;
                ctx.screenFlash(to.x, to.y, recipe.flashColor ?? "rgba(255,230,150,0.62)", 0.52, 360);
                return true;
            });
        }
        if (ranGsap) return;

        await playTimeline(recipe, {
            windup: async () => {
                playSfx(recipe, "windup");
                ctx.screenFlash(to.x, to.y, "rgba(255,240,180,0.55)", 0.38, 280);
                await ctx.playHolyPillarResurrect(to.x, to.y, anim);
            },
            impact: async () => {
                applyCardReaction(opts.targetP, opts.targetI, recipe);
                ctx.buffPulse(opts.targetP, opts.targetI);
                ctx.screenFlash(to.x, to.y, recipe.flashColor ?? "rgba(255,230,150,0.62)", 0.52, 360);
                frontBurst(to.x, to.y, recipe, anim, "✨");
                spawnEmojiSplash(to.x, to.y - 20, recipeGlyph(recipe, "windup"), anim);
            },
            linger: async (ms) => { await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.75)); },
        }, anim);
    }

    async function scenePotion(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const success = !!opts.success;
        const recipeOut = {
            ...recipe,
            impactEmoji: success ? "✨" : "💀",
            hue: success ? 120 : 280,
            ringColor: success ? "rgba(80,255,120,0.9)" : "rgba(180,70,255,0.9)",
            flashColor: success ? "rgba(60,220,60,0.45)" : "rgba(160,50,220,0.48)",
            sparkHue: success ? 120 : 280,
        };
        const gsapT = recipeOut.gsapTimings || {};
        const tryCinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || global.DfVfxSettings?.getMode?.() === "full";
        let ranGsap = false;
        if (tryCinematic) {
            ranGsap = await playGsapUltimateScene("potion", recipeOut, opts, anim, async (scene) => {
                scene.playSfx("windup");
                const ok = await scene.pixi.playPotionUltimateScene(to.x, to.y, recipeOut, {
                    cinematic: true,
                    success,
                    windupMs: gsapT.windup ?? 280,
                    travelMs: gsapT.travel ?? 720,
                    impactMs: gsapT.impact ?? 480,
                    lingerMs: gsapT.linger ?? 420,
                    anim,
                    onImpact: () => {
                        scene.playSfx("impact");
                        ctx.tremorQuadrant(opts.casterP);
                        applyCardReaction(opts.targetP, opts.targetI, recipeOut,
                            success ? ["ult-potion-good"] : ["ult-potion-bad"]);
                        if (success) ctx.buffPulse(opts.targetP, opts.targetI);
                    },
                });
                if (!ok || !anim.alive()) return false;
                ctx.screenFlash(to.x, to.y,
                    success ? "rgba(80,255,120,0.58)" : "rgba(200,70,255,0.48)",
                    success ? 0.52 : 0.44, fx().mobile ? 280 : 340);
                return true;
            });
        }
        if (ranGsap) {
            // Reforça ✨/💀 na carta mesmo após GSAP (pedido do manual).
            try {
                await ctx.playPotionHitReaction?.(opts.targetP, opts.targetI, anim, success);
            } catch (e) { /* */ }
            applyCardReaction(opts.targetP, opts.targetI, recipeOut,
                success ? ["ult-potion-good"] : ["ult-potion-bad"]);
            return;
        }

        await playTimeline(recipeOut, {
            anticipate: async (ms) => {
                playSfx(recipeOut, "windup");
                await ctx.wait(Math.round((ms || tms(recipeOut, "anticipate")) * 0.55));
            },
            travel: async (ms) => {
                const fallMs = ms || Math.round(tms(recipeOut, "travel") * 1.08) || (fx().mobile ? 620 : 780);
                await ctx.flyFallingPotion(opts.targetP, opts.targetI, anim, fallMs);
            },
            impact: async () => {
                if (!anim.alive()) return;
                playSfx(recipeOut, "impact");
                ctx.screenFlash(to.x, to.y,
                    success ? "rgba(80,255,120,0.58)" : "rgba(200,70,255,0.48)",
                    success ? 0.52 : 0.44, fx().mobile ? 280 : 340);
                ctx.tremorQuadrant(opts.casterP);
                await ctx.playPotionHitReaction(opts.targetP, opts.targetI, anim, success);
                applyCardReaction(opts.targetP, opts.targetI, recipeOut, success ? ["ult-potion-good"] : ["ult-potion-bad"]);
                if (success) ctx.buffPulse(opts.targetP, opts.targetI);
            },
            linger: async (ms) => { await ctx.wait(Math.round((ms || tms(recipeOut, "linger")) * 0.5)); },
        }, anim);
    }

    async function sceneWall(opts, anim, recipe) {
        const targets = opts.fieldTargets || [];
        if (!targets.length) return;
        await playTimeline(recipe, {
            anticipate: async (ms) => {
                playSfx(recipe, "windup");
                await ctx.wait(Math.round((ms || tms(recipe, "anticipate")) * 0.35));
            },
            impact: async () => {
                const stagger = Math.round(tms(recipe, "stagger") * 0.55);
                const fallMs = Math.round(tms(recipe, "travel") * 0.9) || (fx().mobile ? 440 : 540);
                const impactMs = Math.round(tms(recipe, "impact") * 0.55) || (fx().mobile ? 280 : 340);
                for (let i = 0; i < targets.length; i++) {
                    if (!anim.alive()) break;
                    const t = targets[i];
                    if (i > 0) await ctx.wait(stagger);
                    if (i === 0) playSfx(recipe, "impact");
                    const c = ctx.resolveTargetCenter(t.targetP, t.targetI);
                    await ctx.spawnFallingWallStone(t.targetP, t.targetI, anim, fallMs, {
                        impactMs,
                        onImpact: opts.onWallStoneHit,
                    });
                    await pixiUltSprite("wallProtect", c.x, c.y, recipe, { durationMs: impactMs + 120 });
                }
            },
            linger: async (ms) => {
                await ctx.wait(Math.round((ms || tms(recipe, "linger")) * 0.4));
            },
        }, anim);
    }

    async function scenePoison(opts, anim, recipe) {
        const to = ctx.resolveTargetCenter(opts.targetP, opts.targetI);
        const from = ctx.resolveHandCenter(opts.casterP);
        playSfx(recipe, "windup");

        // Quimera = Baforada Venenosa (breath) em qualidade ultimate — Pixi+GSAP.
        try {
            await global.DfVfxEngine?.ensureCinematicReady?.({ waitFull: true, maxMs: 10000 });
        } catch (e) { /* */ }

        const pixi = global.DfPixiVfx;
        if (pixi?.playDragonBreathScene && anim.alive()) {
            try {
                const splash = document.createElement("div");
                splash.className = "df-ult-emoji-splash";
                splash.textContent = recipe.emoji || "🐍";
                splash.style.left = to.x + "px";
                splash.style.top = (to.y - 36) + "px";
                splash.style.filter = "drop-shadow(0 0 22px rgba(60,255,90,0.95))";
                document.body.appendChild(splash);
                setTimeout(() => { try { splash.remove(); } catch (e) { /* */ } }, 1100);
            } catch (e) { /* */ }

            const ok = await pixi.playDragonBreathScene({
                mode: "poison",
                cx: to.x,
                cy: to.y,
                cinematic: true,
                ultimate: true,
                sweepFromLeft: true,
                fromX: from?.x,
                fromY: from?.y,
                onImpact: () => {
                    playSfx(recipe, "impact");
                    ctx.tremorQuadrant?.(opts.targetP);
                },
            });
            if (ok && anim.alive()) {
                const el = global.getChampionDom?.(opts.targetP, opts.targetI);
                if (el) {
                    el.classList.add("poison-flash");
                    setTimeout(() => el.classList.remove("poison-flash"), 1400);
                }
                await ctx.wait(tms(recipe, "linger") || 400);
                return;
            }
        }

        // Fallback: rota PNG / baforada legacy
        if (ctx.flyPoisonSlimePngSequence && anim.alive()) {
            await ctx.flyPoisonSlimePngSequence(
                from.x, from.y, to.x, to.y, anim,
                recipe.timings?.travel ?? 1100,
                { targetP: opts.targetP, targetI: opts.targetI, pngOnly: true },
            );
            const el = global.getChampionDom?.(opts.targetP, opts.targetI);
            if (el) {
                el.classList.add("poison-flash");
                setTimeout(() => el.classList.remove("poison-flash"), 1200);
            }
            return;
        }
        if (ctx.spawnPoisonSlimeCoat && anim.alive()) {
            await ctx.spawnPoisonSlimeCoat(opts.targetP, opts.targetI, anim, 900);
        }
    }

    const SCENES = {
        targetEnemy: sceneBomb,
        targetAlly: sceneFortify,
        targetEnemyFreeze: sceneFreeze,
        targetAllyFreeAttack: sceneCharge,
        targetAllyShield: sceneShield,
        thunderDiscard: sceneThunder,
        cometStarfall: sceneComet,
        fireAndIceFreeze: sceneFireIceFreeze,
        fireAndIceBurn: sceneFireIceBurn,
        warOverpower: sceneWar,
        infinitePower: sceneMight,
        vampirism: sceneVamp,
        trickerySwap: sceneTrickery,
        hook: sceneHook,
        banish: sceneBanish,
        scareReturn: sceneScare,
        drawCard: sceneConjure,
        summonDragon: sceneDragon,
        resurrect: sceneResurrect,
        potion: scenePotion,
        wallProtect: sceneWall,
        poison: scenePoison,
    };

    function isReady() {
        return !!ctx;
    }

    function ensureInstalled() {
        if (ctx) return true;
        global.DfSpriteVfx?.wireUltimateDirector?.();
        return !!ctx;
    }

    async function play(type, opts) {
        if (!ensureInstalled()) {
            console.warn("[DfUltimateDirector] VFX heavy não carregou — ultimate omitida:", type);
            return;
        }
        const recipe = R(type);
        const scene = SCENES[type];
        if (!recipe || !scene) {
            console.warn("[DfUltimateDirector] receita/cena ausente:", type);
            return;
        }
        const anim = ctx.beginAnim();
        if (!anim.alive()) return;
        void ctx.init?.();
        const targetMs = recipe.durationMs ?? 2000;
        const nominal = timingSum(recipe) + extraSceneMs(type, recipe, opts);
        if (!recipe.pngOnly) {
            recipe._durScale = targetMs / Math.max(nominal, 480);
        }
        const t0 = performance.now();
        try {
            const fast = !!recipe.fastBomb;
            const glowMs = recipe.heroGlowMs;
            if (opts.casterP != null && ctx.playHeroUltimateGlow && !fast && !recipe.skipHeroGlow
                && typeof glowMs === "number" && glowMs > 0) {
                void ctx.playHeroUltimateGlow(opts.casterP, glowMs);
            }
            void playEmojiIntro(recipe, opts);
            await scene(opts, anim, recipe);
            return true;
        } catch (e) {
            console.warn("[DfUltimateDirector]", type, e);
            return false;
        } finally {
            delete recipe._durScale;
            if (!recipe.skipDurationPad && !recipe.fastBomb) {
                const remain = targetMs - (performance.now() - t0);
                if (remain > 10) await ctx.wait(remain);
            }
            purgeUltimateVfx();
        }
    }

    function install(vfxCtx) {
        ctx = vfxCtx;
    }

    global.DfUltimateDirector = {
        install, play, purgeUltimateVfx, sweepOrphans, tms, playTimeline, playGsapUltimateScene, gsapPixiReady,
        R, isReady, ensureInstalled, GSAP_PIXI_SCENES,
    };

    // df-sprite-vfx carrega antes deste script — religa o director aqui.
    global.DfSpriteVfx?.wireUltimateDirector?.();
})(typeof window !== "undefined" ? window : globalThis);
