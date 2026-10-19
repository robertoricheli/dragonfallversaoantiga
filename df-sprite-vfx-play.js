/**
 * Dragonfall — VFX runtime (playUltimate / playFortify). Fase 1.6.
 * Requer df-sprite-vfx-core.js antes deste arquivo.
 */
(function (global) {
    "use strict";
    async function playPackUltimate(packId, opts, anim, cfg = {}) {
        if (!USE_MAGNIFIC_PACKS || !packId) return false;
        const impactId = `${packId}_impact`;
        const windupId = `${packId}_windup`;
        if (!hasSheet(impactId) && !hasSheet(windupId)) return false;

        const meta = recipesData?.packs?.[packId] || {};
        const sparkHue = meta.hue ?? 35;
        const ringColor = meta.ring ?? "rgba(255,220,120,0.9)";
        const to = cfg.target
            || (opts.targetP != null ? resolveTargetCenter(opts.targetP, opts.targetI) : null);
        const from = cfg.from || resolveOrigin(opts.casterP, opts.casterField ?? -1, false);
        const target = to || resolveQuadrantCenter(opts.casterP ?? 0, 0.5);

        if (cfg.sfx) try { global.window?.sfx?.(cfg.sfx); } catch (e) {}

        if (hasSheet(windupId)) {
            await playSheetAt(windupId, target.x, target.y, {
                scale: ULT_PROJ() * 0.82, fps: 24,
            }, anim);
            await wait(30);
        }
        if (hasSheet(`${packId}_proj`) && to) {
            await flyProjectile(`${packId}_proj`, from.x, from.y, to.x, to.y, {
                travelMs: fx().mobile ? 380 : 480,
                scale: ULT_PROJ(),
                trail: true,
                trailHue: sparkHue,
            }, anim);
        }
        if (hasSheet(impactId)) {
            await playImpactSequence(impactId, target.x, target.y, {
                scale: cfg.impactScale ?? ULT_IMPACT(),
                fps: 24,
                ringColor,
                ringScale: cfg.ringScale ?? 4.8,
                sparkHue,
                sparkCount: fx().mobile ? 10 : 14,
                flashColor: cfg.flashColor || `hsla(${sparkHue},100%,70%,0.32)`,
                flashStrength: cfg.flashStrength ?? 0.38,
                secondPass: false,
            }, anim);
        }
        if (hasSheet(`${packId}_aftermath`)) {
            await playSheetAt(`${packId}_aftermath`, target.x, target.y, {
                scale: ULT_PROJ() * 0.68, fps: 20,
            }, anim);
        }
        if (opts.targetP != null) tremorQuadrant(opts.targetP);
        spawnRingWave(target.x, target.y, ringColor, cfg.ringScale ?? 5.2, anim);
        screenFlash(target.x, target.y, cfg.flashColor || `hsla(${sparkHue},100%,70%,0.38)`, 0.42, 380);
        return true;
    }

    async function tryPack(type, opts, anim, cfg = {}) {
        if (!USE_MAGNIFIC_PACKS || !magnificReady) return false;
        const packId = packIdForType(type, opts);
        if (!packId) return false;
        const impactId = `${packId}_impact`;
        const windupId = `${packId}_windup`;
        if (!hasSheet(impactId) && !hasSheet(windupId) && !hasSheet(`${packId}_proj`)) return false;
        return playPackUltimate(packId, opts, anim, cfg);
    }

    async function init() {
        if (ready) return;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            bakeAllSheets();
            await loadMagnificSheets();
            ready = true;
        })();
        return initPromise;
    }

    function drawFrame(ctx, sheetId, frameIndex, destSize) {
        const sh = sheets[sheetId];
        if (!sh || !sh.canvas) return;
        const fi = frameIndex % sh.frames;
        ctx.clearRect(0, 0, destSize, destSize);
        ctx.drawImage(sh.canvas, fi * sh.size, 0, sh.size, sh.size, 0, 0, destSize, destSize);
    }

    function overlay(className, css) {
        const el = document.createElement("div");
        el.className = `df-vfx-overlay ${className || ""}`;
        el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z - 3};${css || ""}`;
        document.body.appendChild(el);
        return el;
    }

    function screenFlash(cx, cy, color, strength, ms) {
        const el = overlay("", `background:radial-gradient(circle at ${cx}px ${cy}px, ${color}, transparent 58%);opacity:${strength ?? 0.5};transition:opacity ${ms ?? 400}ms ease-out;mix-blend-mode:screen;`);
        requestAnimationFrame(() => { el.style.opacity = "0"; });
        setTimeout(() => el.remove(), (ms ?? 400) + 80);
    }

    function cinematicVignette(css, fadeMs) {
        const el = overlay("df-vfx-vignette", `${css};opacity:0;transition:opacity ${fadeMs ?? 350}ms ease-out;`);
        requestAnimationFrame(() => { el.style.opacity = "1"; });
        return el;
    }

    function spawnRingWave(x, y, color, maxScale, anim, delayMs = 0) {
        if (!anim.alive()) return;
        const el = document.createElement("div");
        const base = cardUnit(0.55);
        el.className = "df-sprite-vfx-layer";
        el.style.cssText =
            `position:fixed;left:${x}px;top:${y}px;width:${base}px;height:${base}px;border:3px solid ${color};` +
            `border-radius:50%;pointer-events:none;z-index:${Z - 2};transform:translate(-50%,-50%) scale(0.15);` +
            "opacity:0;box-shadow:0 0 28px currentColor;transition:transform 720ms cubic-bezier(.15,.95,.25,1),opacity 720ms ease-out;";
        document.body.appendChild(el);
        setTimeout(() => {
            if (!anim.alive()) { el.remove(); return; }
            requestAnimationFrame(() => {
                el.style.opacity = "0.95";
                el.style.transform = `translate(-50%,-50%) scale(${maxScale ?? 5})`;
                el.style.opacity = "0";
            });
        }, delayMs);
        setTimeout(() => el.remove(), 760 + delayMs);
    }

    function spawnRingBurst(x, y, color, maxScale, anim) {
        spawnRingWave(x, y, color, maxScale, anim, 0);
        spawnRingWave(x, y, color.replace(/[\d.]+\)$/, "0.55)"), (maxScale ?? 5) * 0.72, anim, 90);
        spawnRingWave(x, y, color.replace(/[\d.]+\)$/, "0.28)"), (maxScale ?? 5) * 0.48, anim, 180);
    }

    async function spawnSparkBurst(x, y, hue, count, anim) {
        if (!anim.alive()) return;
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 50 + Math.random() * 110;
            const s = 10 + Math.random() * 18;
            const cv = document.createElement("canvas");
            cv.width = s;
            cv.height = s;
            cv.style.cssText =
                `position:fixed;left:${x}px;top:${y}px;width:${s}px;height:${s}px;pointer-events:none;` +
                `z-index:${Z - 1};transform:translate(-50%,-50%);opacity:1;mix-blend-mode:screen;` +
                "transition:transform 560ms cubic-bezier(.2,.9,.3,1),opacity 560ms ease-out;";
            const ctx = cv.getContext("2d");
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0, `hsla(${hue + Math.random() * 20},100%,88%,1)`);
            g.addColorStop(0.5, `hsla(${hue},100%,58%,0.85)`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
            ctx.fill();
            document.body.appendChild(cv);
            requestAnimationFrame(() => {
                cv.style.transform = `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0.1)`;
                cv.style.opacity = "0";
            });
            setTimeout(() => cv.remove(), 540);
        }
        await wait(60);
    }

    async function playImpactSequence(sheetId, x, y, opts, anim) {
        const base = opts.scale ?? ULT_IMPACT();
        if (opts.preFlash) screenFlash(x, y, opts.preFlash, opts.preFlashStrength ?? 0.35, 160);
        await playSheetAt(sheetId, x, y, {
            ...opts,
            scale: base,
            fps: opts.fps ?? 26,
            blend: opts.blend ?? "screen",
            scalePulse: opts.scalePulse !== false,
        }, anim);
        if (!anim.alive()) return;
        if (opts.rings !== false) {
            spawnRingBurst(x, y, opts.ringColor ?? "rgba(255,220,120,0.9)", opts.ringScale ?? 6, anim);
        }
        await spawnSparkBurst(x, y, opts.sparkHue ?? 35, opts.sparkCount ?? 14, anim);
        if (opts.flashColor) screenFlash(x, y, opts.flashColor, opts.flashStrength ?? 0.55, opts.flashMs ?? 420);
        if (opts.secondPass !== false) {
            await wait(70);
            await playSheetAt(sheetId, x, y, {
                ...opts,
                scale: base * 0.78,
                fps: (opts.fps ?? 26) + 6,
                blend: opts.blend ?? "screen",
                scalePulse: false,
            }, anim);
        }
    }

    function makeCanvas(size) {
        const el = document.createElement("canvas");
        el.width = size;
        el.height = size;
        el.className = "df-sprite-vfx-layer";
        el.style.cssText =
            `position:fixed;pointer-events:none;z-index:${Z};width:${size}px;height:${size}px;` +
            "transform:translate(-50%,-50%);";
        document.body.appendChild(el);
        return el;
    }

    function spawnTrailParticle(x, y, hue, size, anim) {
        if (!anim.alive()) return;
        const s = size || (6 + Math.random() * 10);
        const cv = document.createElement("canvas");
        cv.width = s;
        cv.height = s;
        cv.className = "df-sprite-vfx-layer";
        cv.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${s}px;height:${s}px;pointer-events:none;z-index:${Z - 1};transform:translate(-50%,-50%);opacity:0.8;transition:opacity 350ms ease-out, transform 350ms ease-out;`;
        const ctx = cv.getContext("2d");
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, `hsla(${hue},100%,82%,0.9)`);
        g.addColorStop(0.55, `hsla(${hue},100%,55%,0.5)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
        ctx.fill();
        document.body.appendChild(cv);
        requestAnimationFrame(() => {
            cv.style.opacity = "0";
            cv.style.transform = "translate(-50%,-50%) scale(0.15)";
        });
        setTimeout(() => cv.remove(), 400);
    }

    async function playSheetAt(sheetId, x, y, opts, anim) {
        if (!anim.alive()) return;
        await init();
        const sh = sheets[sheetId];
        if (!sh) return;
        const scale = opts.scale ?? 1;
        const size = Math.round(sh.size * scale);
        const fps = opts.fps ?? (fx().mobile ? 24 : 30);
        const frameMs = 1000 / fps;
        const el = makeCanvas(size);
        el.style.left = x + "px";
        el.style.top = y + "px";
        if (opts.blend) el.style.mixBlendMode = opts.blend;
        const ctx = el.getContext("2d");
        ctx.globalCompositeOperation = opts.composite ?? "source-over";

        return new Promise((resolve) => {
            let f = 0;
            let last = performance.now();
            function step(now) {
                if (!anim.alive() || f >= sh.frames) {
                    el.remove();
                    resolve();
                    return;
                }
                if (now - last >= frameMs) {
                    drawFrame(ctx, sheetId, f, size);
                    if (opts.scalePulse && f < 3) {
                        const pulse = 1 + (1 - f / 3) * 0.18;
                        el.style.transform = `translate(-50%,-50%) scale(${pulse})`;
                    }
                    f++;
                    last = now;
                }
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }

    async function spawnLightningStrike(x, y, anim, opts = {}) {
        if (!anim.alive()) return;
        const bold = !!opts.bold;
        const compact = !!opts.compact;
        const fromY = opts.fromY ?? Math.max(8, y - window.innerHeight * (bold ? 0.52 : 0.38));
        const w = Math.round(cardUnit(bold ? 2.1 : compact ? 1.15 : 1.45));
        const h = Math.round(Math.max(cardUnit(bold ? 3.1 : compact ? 1.9 : 2.2), y - fromY + cardUnit(0.5)));
        const el = document.createElement("canvas");
        el.className = "df-sprite-vfx-layer";
        el.width = w;
        el.height = h;
        el.style.cssText =
            `position:fixed;left:${x - w / 2}px;top:${fromY}px;width:${w}px;height:${h}px;` +
            `pointer-events:none;z-index:${Z + 1};mix-blend-mode:screen;`;
        document.body.appendChild(el);
        const ctx = el.getContext("2d");
        const jitter = opts.jitter ?? Math.random();

        function drawVerticalBolt(alpha, j, pass) {
            const segments = bold ? 11 : 8;
            const lw = Math.max(bold ? 5 : 3, w * (bold ? 0.078 : 0.055));
            ctx.strokeStyle = pass === 0
                ? `rgba(245,252,255,${alpha})`
                : `rgba(180,220,255,${alpha * 0.55})`;
            ctx.lineWidth = pass === 0 ? lw : lw * 0.42;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(180,220,255,0.98)";
            ctx.shadowBlur = w * (bold ? 0.22 : 0.14);
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const ty = (i / segments) * h;
                const amp = bold ? 0.28 : 0.2;
                const tx = w / 2 + (i === 0 || i === segments ? 0 : Math.sin(i * 2.3 + j + pass) * w * amp);
                if (i === 0) ctx.moveTo(tx, ty);
                else ctx.lineTo(tx, ty);
            }
            ctx.stroke();
            if (alpha > 0.45) {
                ctx.lineWidth = Math.max(2, w * 0.028);
                ctx.beginPath();
                ctx.moveTo(w * 0.42, h * 0.32);
                ctx.lineTo(w * 0.08, h * 0.5);
                ctx.lineTo(w * 0.2, h * 0.66);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(w * 0.58, h * 0.38);
                ctx.lineTo(w * 0.88, h * 0.55);
                ctx.lineTo(w * 0.72, h * 0.72);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }

        const frames = bold ? 7 : 5;
        for (let f = 0; f < frames; f++) {
            if (!anim.alive()) break;
            ctx.clearRect(0, 0, w, h);
            const alpha = f < 2 ? 1 : 1 - (f - 2) / (frames - 2);
            drawVerticalBolt(alpha, jitter + f * 0.35, 0);
            if (bold) drawVerticalBolt(alpha * 0.7, jitter + f * 0.55 + 1.2, 1);
            if (f === 0) {
                screenFlash(x, y, opts.flashColor ?? "rgba(220,240,255,0.72)", bold ? 0.72 : 0.55, bold ? 200 : 140);
            }
            await wait(f < 2 ? (bold ? 28 : 32) : (bold ? 40 : 48));
        }
        el.remove();
    }

    async function playHeroUltimateGlow(casterP, ms = 1500) {
        const qIdx = global.dfQuadrantForPlayer?.(casterP) ?? casterP;
        const header = window.__dfQuadrantHeader?.(qIdx)
            || document.querySelector(`#quadrant-${qIdx} .quadrant-header`);
        const icon = header?.querySelector(".hero-icon");
        if (!icon) {
            await wait(ms);
            return;
        }
        icon.classList.add("hero-ult-windup-glow");
        header?.classList.add("hero-ult-windup-header");
        try { global.window?.sfx?.("ultimate_intro"); } catch (e) { /* */ }
        await wait(ms);
        icon.classList.remove("hero-ult-windup-glow");
        header?.classList.remove("hero-ult-windup-header");
    }

    async function playFuryBurst(ownerP, fieldIdx) {
        const el = global.getChampionDom?.(ownerP, fieldIdx);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const anim = beginAnim();
        screenFlash(cx, cy, "rgba(255,120,40,0.48)", 0.38, 240);
        spawnRingBurst(cx, cy, "rgba(255,90,30,0.92)", 5.5, anim);
        const burst = document.createElement("div");
        burst.className = "df-fury-burst";
        burst.textContent = "💢";
        burst.style.left = cx + "px";
        burst.style.top = (cy - r.height * 0.15) + "px";
        document.body.appendChild(burst);
        el.classList.add("fury-power-surge");
        await wait(520);
        burst.remove();
        el.classList.remove("fury-power-surge");
    }

    async function flyAlchemistPotion(x1, y1, x2, y2, anim, success) {
        await flyFallingPotionAt(x2, y2, anim, fx().mobile ? 520 : 640, null);
    }

    async function flyFallingPotion(targetP, targetI, anim, fallMs) {
        if (!anim.alive()) return;
        const c = resolveTargetCenter(targetP, targetI);
        const targetEl = global.getChampionDom?.(targetP, targetI);
        await flyFallingPotionAt(c.x, c.y, anim, fallMs, targetEl);
    }

    async function flyFallingPotionAt(cx, cy, anim, fallMs, targetEl) {
        if (!anim.alive()) return;
        const dur = fallMs ?? (fx().mobile ? 620 : 780);
        const fallFrom = Math.min(global.innerHeight * 0.62, fx().mobile ? 380 : 520);
        if (targetEl) targetEl.classList.add("ult-potion-pending");

        const potion = document.createElement("div");
        potion.className = "df-potion-drop df-potion-drop-emoji-wrap";
        potion.innerHTML =
            `<span class="df-potion-drop-emoji" aria-hidden="true">🧪</span>` +
            `<span class="df-potion-drop-bubbles" aria-hidden="true">⚗️</span>`;
        potion.style.left = cx + "px";
        potion.style.top = cy + "px";
        potion.style.setProperty("--fallFrom", `-${fallFrom}px`);
        potion.style.setProperty("--fallMs", dur + "ms");
        potion.style.setProperty("--spin", Math.round((Math.random() - 0.5) * 28) + "deg");
        document.body.appendChild(potion);

        await waitAnimEnd(potion, dur);
        if (!anim.alive()) {
            potion.remove();
            targetEl?.classList.remove("ult-potion-pending");
            return;
        }

        potion.classList.add("landed");
        const splash = document.createElement("div");
        splash.className = "df-potion-splash df-potion-splash-heavy";
        splash.style.left = cx + "px";
        splash.style.top = cy + "px";
        splash.textContent = "💧";
        splash.style.fontSize = "clamp(1.8rem, 5vw, 2.6rem)";
        splash.style.textAlign = "center";
        splash.style.lineHeight = "1";
        document.body.appendChild(splash);
        setTimeout(() => { try { splash.remove(); } catch (e) { /* */ } }, 720);
        await wait(160);
        potion.remove();
        targetEl?.classList.remove("ult-potion-pending");
    }

    function spawnPotionMiniStars(cx, cy, anim) {
        if (!anim.alive()) return;
        const n = fx().mobile ? 10 : 16;
        for (let i = 0; i < n; i++) {
            const s = document.createElement("div");
            s.className = "df-potion-spark-dot";
            const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 42 + Math.random() * 72;
            s.style.left = cx + "px";
            s.style.top = cy + "px";
            s.style.setProperty("--dx", Math.round(Math.cos(ang) * dist) + "px");
            s.style.setProperty("--dy", Math.round(-32 - Math.random() * 58) + "px");
            s.style.animationDelay = (i * 32) + "ms";
            document.body.appendChild(s);
            setTimeout(() => { try { s.remove(); } catch (e) { /* */ } }, 900);
        }
    }

    async function playPotionHitReaction(targetP, targetI, anim, success) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(420); return; }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;

        const outcome = document.createElement("div");
        outcome.className = "df-potion-outcome-burst" + (success ? " good" : " bad");
        outcome.style.left = cx + "px";
        outcome.style.top = cy + "px";
        document.body.appendChild(outcome);
        requestAnimationFrame(() => outcome.classList.add("revealed"));

        if (success) {
            el.classList.add("potion-buff-pop", "ult-potion-good");
            spawnRingBurst(cx, cy, "rgba(100,255,140,0.95)", 8, anim);
            spawnPotionMiniStars(cx, cy, anim);
            try { global.window?.sfx?.("buff_power"); } catch (e) { /* */ }
        } else {
            el.classList.add("potion-debuff-shake", "ult-potion-bad");
            spawnRingBurst(cx, cy, "rgba(180,80,255,0.88)", 6.5, anim);
            const ooze = document.createElement("div");
            ooze.className = "df-potion-fail-ooze";
            ooze.style.left = cx + "px";
            ooze.style.top = (cy + r.height * 0.18) + "px";
            document.body.appendChild(ooze);
            setTimeout(() => { try { ooze.remove(); } catch (e) { /* */ } }, 780);
        }

        await wait(success ? 560 : 680);
        outcome.classList.add("fade-out");
        await wait(300);
        outcome.remove();
        el.classList.remove("potion-buff-pop", "potion-debuff-shake", "ult-potion-good", "ult-potion-bad");
    }

    async function flyFallingBomb(cx, cy, anim, travelMs, opts = {}) {
        if (!anim.alive()) return;
        const fast = !!opts.fast;
        const dur = travelMs ?? (fast ? 300 : (fx().mobile ? 640 : 760));
        const fallFrom = fast ? Math.min(window.innerHeight * 0.22, 220) : Math.min(window.innerHeight * 0.48, 560);
        const bomb = document.createElement("div");
        bomb.className = "ult-bomb";
        bomb.textContent = "💣";
        bomb.style.left = cx + "px";
        bomb.style.top = cy + "px";
        bomb.style.transform = "translate(-50%, -50%)";
        bomb.style.setProperty("--fallFrom", `-${fallFrom}px`);
        bomb.style.animation = `bombFall ${dur}ms cubic-bezier(.35, 0, .8, .25) forwards`;
        document.body.appendChild(bomb);

        let fuseAlive = true;
        const stopSparks = () => { fuseAlive = false; };

        void (async () => {
            while (fuseAlive && anim.alive()) {
                const br = bomb.getBoundingClientRect();
                const s = document.createElement("div");
                s.className = "ult-fuse-spark";
                s.style.left = (br.left + br.width * 0.5 + (Math.random() - 0.5) * 14) + "px";
                s.style.top = (br.top + 6) + "px";
                s.style.setProperty("--sx", ((Math.random() - 0.5) * 50) + "px");
                s.style.setProperty("--sy", (-24 - Math.random() * 36) + "px");
                document.body.appendChild(s);
                setTimeout(() => s.remove(), 900);
                await wait(58);
            }
        
})(typeof window !== "undefined" ? window : globalThis);
