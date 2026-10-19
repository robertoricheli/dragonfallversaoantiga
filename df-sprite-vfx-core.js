/**
 * Dragonfall — VFX procedural (canvas bake / draw). Fase 1.6.
 */
(function (global) {
    "use strict";

    "use strict";

    const Z = 98500;
    /** false = só animações canvas/DOM do motor (qualidade estável). */
    const USE_MAGNIFIC_PACKS = false;
    /** Teste: gosma venenosa PNG (proj 1→2 voo, 3→4 impacto). Reverter = false. */
    const USE_POISON_SLIME_PNG = true;
    /** 4 frames: 1→2 voo (1,8s) + 3→4 impacto (0,6s cada) = 3s total */
    const POISON_SLIME_TRAVEL_MS = 1100;
    const POISON_SLIME_IMPACT_FRAME_MS = 1500;
    const poisonSlimePngCache = {};
    const VFX_ENGINE = USE_MAGNIFIC_PACKS ? "magnific-sprite-v2" : "procedural-canvas-v3";
    const sheets = {};
    let ready = false;
    let initPromise = null;
    let recipesData = null;
    let magnificReady = false;

    function fx() {
        return global.__dfFX || { mobile: false, liteVfx: false, n: (x) => x };
    }

    function wait(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    /** Espera fim de animação CSS sem bloquear o main thread com rAF por frame. */
    function waitAnimEnd(el, fallbackMs) {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                el.removeEventListener("animationend", onEnd);
                resolve();
            };
            const onEnd = (ev) => {
                if (ev.target === el) finish();
            };
            el.addEventListener("animationend", onEnd);
            setTimeout(finish, (fallbackMs ?? 600) + 60);
        });
    }

    /** Cede um frame ao browser entre rajadas de DOM pesado. */
    function vfxYield() {
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    /** Só aborta se a partida terminou — não usar matchGen stale. */
    function beginAnim() {
        return {
            alive() {
                return global.__dfMatchAlive?.() !== false;
            },
        };
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    /** Escala relativa ao tamanho da carta (~70–90 px no alvo). */
    function cardUnit(mult = 1) {
        const el = document.querySelector(".ccard, .champion-card, .hcard");
        const w = el ? el.getBoundingClientRect().width : (fx().mobile ? 58 : 72);
        const base = Math.max(52, Math.min(88, w * 0.92));
        return Math.round(base * mult);
    }

    function bakeSheet(id, frameCount, size, drawFrame) {
        const cv = document.createElement("canvas");
        cv.width = size * frameCount;
        cv.height = size;
        const ctx = cv.getContext("2d");
        for (let f = 0; f < frameCount; f++) {
            ctx.save();
            ctx.translate(f * size + size / 2, size / 2);
            drawFrame(ctx, f, frameCount, size);
            ctx.restore();
        }
        sheets[id] = { canvas: cv, frames: frameCount, size, baked: true };
    }

    /** Garante sheets 100% canvas — nunca PNG Magnific/storyboard. */
    function forceProceduralSheet(id, frameCount, size, drawFrame) {
        delete sheets[id];
        bakeSheet(id, frameCount, size, drawFrame);
    }

    /* ========== Desenhos procedurais compactos (anime stylized) ========== */

    function radialGlow(ctx, r, inner, outer) {
        const g = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
        g.addColorStop(0, inner);
        g.addColorStop(0.45, outer);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
    }

    function impactCore(ctx, size, t, inner, outer) {
        if (t > 0.22) return;
        const k = 1 - t / 0.22;
        radialGlow(ctx, size * 0.24 * k, inner, outer);
    }

    function drawZigBolt(ctx, size, alpha, jitter) {
        const pts = [
            [0, -0.42],
            [-0.1 + jitter * 0.04, -0.22],
            [0.08 - jitter * 0.03, -0.08],
            [-0.07 + jitter * 0.05, 0.08],
            [0.06, 0.24],
            [-0.04, 0.42],
        ];
        ctx.strokeStyle = `rgba(235,248,255,${alpha})`;
        ctx.lineWidth = size * 0.042;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(180,220,255,0.95)";
        ctx.shadowBlur = size * 0.1;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const px = pts[i][0] * size;
            const py = pts[i][1] * size;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        if (alpha > 0.45) {
            ctx.lineWidth = size * 0.018;
            ctx.beginPath();
            ctx.moveTo(-size * 0.07, -size * 0.06);
            ctx.lineTo(-size * 0.24, size * 0.04);
            ctx.lineTo(-size * 0.2, size * 0.16);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    function drawCrystalShard(ctx, ang, len, size, alpha) {
        ctx.save();
        ctx.translate(Math.cos(ang) * len * 0.55, Math.sin(ang) * len * 0.55);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = `rgba(210,245,255,${alpha})`;
        ctx.strokeStyle = `rgba(140,220,255,${alpha * 0.85})`;
        ctx.lineWidth = size * 0.008;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.05);
        ctx.lineTo(size * 0.028, 0);
        ctx.lineTo(0, size * 0.05);
        ctx.lineTo(-size * 0.028, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function drawFireProj(ctx, f, n, size) {
        const t = f / n;
        const r = size * 0.14 * (0.92 + 0.08 * Math.sin(t * Math.PI * 4));
        radialGlow(ctx, r * 2.2, "rgba(255,255,220,1)", "rgba(255,120,30,0.75)");
        radialGlow(ctx, r * 1.1, "rgba(255,240,180,1)", "rgba(255,60,10,0.5)");
    }

    function drawFireImpact(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.92;
        impactCore(ctx, size, t, "rgba(255,255,245,0.98)", "rgba(255,150,40,0)");
        if (t > 0.2 && t < 0.75) {
            radialGlow(ctx, size * (0.08 + (t - 0.2) * 0.22), `rgba(80,40,20,${(1 - t) * 0.35})`, "rgba(0,0,0,0)");
        }
        const ringR = size * (0.06 + t * 0.32);
        ctx.strokeStyle = `rgba(255,160,50,${alpha})`;
        ctx.lineWidth = size * 0.04;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,180,${alpha * 0.45})`;
        ctx.lineWidth = size * 0.018;
        ctx.beginPath();
        ctx.arc(0, 0, ringR * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 + t * 1.5;
            const len = size * 0.08 * (1 - t);
            ctx.strokeStyle = `rgba(255,200,80,${alpha * 0.7})`;
            ctx.lineWidth = size * 0.012;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * ringR * 0.5, Math.sin(ang) * ringR * 0.5);
            ctx.lineTo(Math.cos(ang) * (ringR * 0.5 + len), Math.sin(ang) * (ringR * 0.5 + len));
            ctx.stroke();
        }
    }

    function drawBombImpact(ctx, f, n, size) {
        drawFireImpact(ctx, f, n, size);
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        radialGlow(ctx, size * (0.1 + t * 0.28), `rgba(255, 200, 80, ${alpha * 0.55})`, "rgba(80, 20, 0, 0)");
    }

    function drawBombBall(ctx, f, n, size) {
        const r = size * 0.17;
        const hg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r * 1.1);
        hg.addColorStop(0, "rgba(110,110,110,1)");
        hg.addColorStop(0.55, "rgba(35,35,35,1)");
        hg.addColorStop(1, "rgba(12,12,12,1)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(200,160,90,0.95)";
        ctx.lineWidth = size * 0.014;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.35, -r * 1.35, r * 0.1, -r * 1.55);
        ctx.stroke();
        radialGlow(ctx, size * 0.07, "rgba(255,220,100,0.95)", "rgba(255,80,20,0)");
    }

    function drawBombExplosionUlt(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        impactCore(ctx, size, t * 0.82, "rgba(255, 255, 252, 1)", "rgba(255, 150, 45, 0)");
        for (let layer = 0; layer < 4; layer++) {
            const r = size * (0.08 + t * (0.14 + layer * 0.1));
            const a = alpha * (0.82 - layer * 0.17);
            radialGlow(
                ctx,
                r,
                `rgba(255, ${215 - layer * 35}, ${70 - layer * 12}, ${a})`,
                "rgba(120, 25, 0, 0)",
            );
        }
        if (t > 0.18 && t < 0.92) {
            for (let s = 0; s < 5; s++) {
                const ang = (s / 5) * Math.PI * 2 + t * 0.45;
                const dist = size * (0.1 + t * 0.34);
                ctx.save();
                ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.85);
                radialGlow(
                    ctx,
                    size * (0.05 + t * 0.09),
                    `rgba(55, 32, 22, ${(1 - t) * 0.42})`,
                    "rgba(0, 0, 0, 0)",
                );
                ctx.restore();
            }
        }
        for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * Math.PI * 2 + t * 0.35;
            const len = size * (0.07 + t * 0.4);
            ctx.fillStyle = `rgba(255, ${175 + (i % 4) * 15}, 55, ${alpha * 0.78})`;
            ctx.beginPath();
            ctx.ellipse(
                Math.cos(ang) * len,
                Math.sin(ang) * len,
                size * 0.02,
                size * 0.032,
                ang,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    function drawDivineGreen(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.78;
        radialGlow(ctx, size * (0.14 + t * 0.06), "rgba(210,255,235,0.95)", "rgba(30,180,90,0)");
        for (let band = 0; band < 6; band++) {
            const y = (band - 2.5) * size * 0.07;
            ctx.strokeStyle = `rgba(100,255,160,${alpha * (0.75 - band * 0.06)})`;
            ctx.lineWidth = size * 0.03;
            ctx.beginPath();
            const w = size * (0.18 + t * 0.12);
            ctx.moveTo(-w, y);
            ctx.bezierCurveTo(-w * 0.25, y - size * 0.07, w * 0.25, y + size * 0.07, w, y);
            ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,255,210,${alpha * 0.55})`;
        ctx.lineWidth = size * 0.018;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.12 + t * 0.38), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawHolyPillar(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.8;
        const g = ctx.createLinearGradient(0, size * 0.46, 0, -size * 0.46);
        g.addColorStop(0, "rgba(255,220,140,0)");
        g.addColorStop(0.2, `rgba(255,240,200,${alpha * 0.75})`);
        g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-size * 0.14, -size * 0.46, size * 0.28, size * 0.92);
        radialGlow(ctx, size * 0.16 * (1 - t * 0.25), "rgba(255,252,230,1)", "rgba(255,190,70,0)");
        ctx.strokeStyle = `rgba(255,240,180,${alpha * 0.5})`;
        ctx.lineWidth = size * 0.014;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.14 + t * 0.32), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawPortalMystic(ctx, f, n, size) {
        const t = f / n;
        const pulse = 0.88 + 0.12 * Math.sin(t * Math.PI * 4);
        ctx.strokeStyle = "rgba(170,110,255,0.95)";
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.24 * pulse, size * 0.15 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(220,180,255,0.7)";
        ctx.lineWidth = size * 0.016;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.15 * pulse, size * 0.24 * pulse, Math.PI / 2, 0, Math.PI * 2);
        ctx.stroke();
        radialGlow(ctx, size * 0.14, "rgba(210,160,255,0.8)", "rgba(50,0,120,0)");
    }

    function drawWarRoar(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.82;
        ctx.fillStyle = `rgba(50,15,15,${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(0, -size * 0.08, size * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-size * 0.16, size * 0.02, size * 0.32, size * 0.2);
        for (let w = 0; w < 4; w++) {
            ctx.strokeStyle = `rgba(255,70,45,${alpha * (0.75 - w * 0.12)})`;
            ctx.lineWidth = size * 0.022;
            ctx.beginPath();
            ctx.arc(0, size * 0.04, size * (0.14 + t * 0.38 + w * 0.07), -0.55, 0.55);
            ctx.stroke();
        }
        radialGlow(ctx, size * 0.12, "rgba(255,110,70,0.65)", "rgba(100,15,15,0)");
    }

    function drawFortifyProj(ctx, f, n, size) {
        const t = f / n;
        const r = size * 0.13 * (1 + 0.06 * Math.sin(t * Math.PI * 5));
        radialGlow(ctx, r * 2, "rgba(240,255,250,1)", "rgba(60,220,120,0.7)");
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 + t * 2;
            ctx.strokeStyle = "rgba(160,255,200,0.55)";
            ctx.lineWidth = size * 0.015;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * r * 1.5, Math.sin(ang) * r * 1.5);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    }

    function drawFortifyImpact(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        if (t < 0.1) radialGlow(ctx, size * 0.2, "rgba(220,255,240,0.9)", "rgba(60,200,120,0)");
        const ringR = size * (0.07 + t * 0.34);
        ctx.strokeStyle = `rgba(100,255,160,${alpha})`;
        ctx.lineWidth = size * 0.032;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,200,${alpha * 0.4})`;
        ctx.lineWidth = size * 0.016;
        ctx.beginPath();
        ctx.arc(0, 0, ringR * 1.08, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawFortifyImpactPremium(ctx, f, n, size) {
        drawFortifyImpact(ctx, f, n, size);
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(255,230,150,${(1 - t) * 0.45})`;
        ctx.lineWidth = size * 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.12 + t * 0.36), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawSeaCurse(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        for (let w = 0; w < 3; w++) {
            const phase = t + w * 0.15;
            const ringR = size * (0.08 + phase * 0.38);
            ctx.strokeStyle = `rgba(80,200,255,${alpha * (0.7 - w * 0.15)})`;
            ctx.lineWidth = size * (0.028 - w * 0.006);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();
        }
        radialGlow(ctx, size * 0.12 * (1 - t), "rgba(180,240,255,0.6)", "rgba(20,100,180,0)");
    }

    function drawIceBurst(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        impactCore(ctx, size, t, "rgba(240,252,255,0.95)", "rgba(120,210,255,0)");
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + 0.2 + t * 0.4;
            const len = size * (0.06 + t * 0.28);
            drawCrystalShard(ctx, ang, len, size, alpha);
            ctx.strokeStyle = `rgba(180,235,255,${alpha * 0.65})`;
            ctx.lineWidth = size * 0.012;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
            ctx.stroke();
        }
        ctx.strokeStyle = `rgba(140,220,255,${alpha * 0.7})`;
        ctx.lineWidth = size * 0.022;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.05 + t * 0.28), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawChargeBurst(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + t * 2;
            ctx.strokeStyle = `rgba(255,160,50,${alpha})`;
            ctx.lineWidth = size * 0.025;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * size * (0.08 + t * 0.3), Math.sin(ang) * size * (0.08 + t * 0.3));
            ctx.stroke();
        }
        radialGlow(ctx, size * 0.1 * (1 - t * 0.5), "rgba(255,220,150,0.8)", "rgba(255,100,20,0)");
    }

    function drawShieldBurst(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        const r = size * (0.12 + t * 0.08);
        ctx.strokeStyle = `rgba(255,220,80,${alpha})`;
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.9, -r * 0.2, 0, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,200,${alpha * 0.5})`;
        ctx.lineWidth = size * 0.012;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.14 + t * 0.12), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawArcanePortal(ctx, f, n, size) {
        const t = f / n;
        const r = size * (0.1 + 0.04 * Math.sin(t * Math.PI * 2));
        ctx.strokeStyle = "rgba(180,100,255,0.85)";
        ctx.lineWidth = size * 0.022;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.4, r, t * Math.PI * 2, 0, Math.PI * 2);
        ctx.stroke();
        radialGlow(ctx, r * 1.2, "rgba(220,180,255,0.7)", "rgba(80,20,160,0)");
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + t * 3;
            ctx.fillStyle = "rgba(200,150,255,0.6)";
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, size * 0.012, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawSwapArc(ctx, f, n, size) {
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(200,80,255,${1 - t * 0.7})`;
        ctx.lineWidth = size * 0.025;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.28, -Math.PI * 0.8, Math.PI * 0.8);
        ctx.stroke();
        radialGlow(ctx, size * 0.08, "rgba(255,150,255,0.7)", "rgba(120,40,200,0)");
    }

    function drawLightningHit(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        if (t < 0.18) impactCore(ctx, size, t, "rgba(255,255,255,0.95)", "rgba(160,210,255,0)");
        drawZigBolt(ctx, size, alpha, f * 0.7);
        if (t < 0.35) {
            ctx.strokeStyle = `rgba(255,255,255,${(1 - t / 0.35) * 0.55})`;
            ctx.lineWidth = size * 0.07;
            ctx.beginPath();
            ctx.moveTo(0, -size * 0.38);
            ctx.lineTo(0, size * 0.38);
            ctx.stroke();
        }
    }

    function drawDragonSummon(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.8;
        const portalR = size * (0.1 + t * 0.22);
        ctx.strokeStyle = `rgba(255,140,90,${alpha * 0.9})`;
        ctx.lineWidth = size * 0.028;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.06, portalR * 1.1, portalR * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        radialGlow(ctx, size * (0.1 + t * 0.18), "rgba(255,140,100,0.85)", "rgba(140,20,10,0)");
        ctx.fillStyle = `rgba(220,50,35,${alpha * 0.75})`;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.2);
        ctx.quadraticCurveTo(size * 0.22, -size * 0.08, size * 0.18, size * 0.12);
        ctx.lineTo(0, size * 0.06);
        ctx.quadraticCurveTo(-size * 0.22, -size * 0.08, 0, -size * 0.2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,200,140,${alpha})`;
        ctx.lineWidth = size * 0.014;
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2 - Math.PI / 2 + t * 1.2;
            ctx.beginPath();
            ctx.moveTo(0, -size * 0.04);
            ctx.lineTo(Math.cos(ang) * size * 0.28, Math.sin(ang) * size * 0.22);
            ctx.stroke();
        }
    }

    function drawHookChain(ctx, f, n, size) {
        const t = f / (n - 1);
        ctx.strokeStyle = "rgba(200,160,80,0.9)";
        ctx.lineWidth = size * 0.022;
        for (let i = 0; i < 4; i++) {
            const y = -size * 0.2 + i * size * 0.12;
            ctx.beginPath();
            ctx.arc(0, y, size * 0.045, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = `rgba(220,180,90,${1 - t * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(size * 0.04, size * 0.22);
        ctx.lineTo(-size * 0.04, size * 0.22);
        ctx.lineTo(0, size * 0.32);
        ctx.fill();
    }

    function drawResurrectLight(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        const g = ctx.createLinearGradient(0, size * 0.35, 0, -size * 0.35);
        g.addColorStop(0, "rgba(255,240,180,0)");
        g.addColorStop(0.4, `rgba(255,230,140,${alpha * 0.8})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-size * 0.08, -size * 0.35, size * 0.16, size * 0.7);
        radialGlow(ctx, size * 0.12 * (1 - t * 0.3), "rgba(255,250,220,0.9)", "rgba(255,200,80,0)");
    }

    function drawPotionBurst(ctx, f, n, size, fail) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        const hue = fail ? "180,80,255" : "80,255,120";
        radialGlow(ctx, size * (0.1 + t * 0.05), `rgba(${hue.split(",")[0]},${hue.split(",")[1]},${hue.split(",")[2]},0.85)`, "rgba(0,0,0,0)");
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const len = size * (0.06 + t * 0.2);
            ctx.fillStyle = `rgba(${hue},${alpha * 0.7})`;
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * len, Math.sin(ang) * len, size * 0.018, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawVampDrain(ctx, f, n, size) {
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(255,60,80,${0.85 - t * 0.7})`;
        ctx.lineWidth = size * 0.028;
        ctx.beginPath();
        ctx.moveTo(-size * 0.35, 0);
        ctx.quadraticCurveTo(0, -size * 0.15 * Math.sin(t * Math.PI), size * 0.35, 0);
        ctx.stroke();
        radialGlow(ctx, size * 0.08, "rgba(255,100,120,0.7)", "rgba(120,0,20,0)");
    }

    function drawVoidBanish(ctx, f, n, size) {
        const t = f / (n - 1);
        const r = size * (0.18 - t * 0.12);
        ctx.strokeStyle = `rgba(140,80,255,${0.9 - t * 0.8})`;
        ctx.lineWidth = size * 0.022;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, t * Math.PI * 4, t * Math.PI * 4 + Math.PI * 1.6);
        ctx.stroke();
        radialGlow(ctx, r * 0.6, "rgba(80,40,180,0.5)", "rgba(0,0,0,0)");
    }

    function drawWallRune(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        ctx.strokeStyle = `rgba(255,210,120,${alpha})`;
        ctx.lineWidth = size * 0.018;
        ctx.strokeRect(-size * 0.14, -size * 0.18, size * 0.28, size * 0.36);
        ctx.beginPath();
        ctx.moveTo(-size * 0.14, -size * 0.06);
        ctx.lineTo(size * 0.14, -size * 0.06);
        ctx.moveTo(0, -size * 0.18);
        ctx.lineTo(0, size * 0.18);
        ctx.stroke();
    }

    function drawPoisonSlimeProj(ctx, f, n, size) {
        const t = f / n;
        const wobble = Math.sin(t * Math.PI * 5) * 0.12;
        const r = size * (0.22 + wobble);
        ctx.fillStyle = "rgba(45, 175, 35, 0.92)";
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const rad = r * (0.82 + Math.sin(ang * 3.2 + t * 7) * 0.18);
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad * (1.12 + Math.sin(t * Math.PI) * 0.08);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        radialGlow(ctx, r * 0.55, "rgba(200, 255, 130, 0.75)", "rgba(30, 120, 25, 0)");
        ctx.fillStyle = "rgba(25, 95, 20, 0.55)";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.35, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawPoisonSlimeSplat(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        const spread = size * (0.12 + t * 0.38);
        ctx.fillStyle = `rgba(55, 200, 45, ${alpha * 0.88})`;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
            const ang = (i / 12) * Math.PI * 2;
            const drip = i % 3 === 0 ? 1.28 : 0.92;
            const rad = spread * drip * (0.75 + Math.sin(ang * 2.5) * 0.2);
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad * 0.82 + size * t * 0.06;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        radialGlow(ctx, spread * 0.35, `rgba(170, 255, 110, ${alpha * 0.65})`, "rgba(20, 70, 15, 0)");
        for (let d = 0; d < 5; d++) {
            const ang = (d / 5) * Math.PI * 2 + 0.4;
            const len = spread * (0.55 + t * 0.45);
            ctx.fillStyle = `rgba(70, 210, 55, ${alpha * 0.7})`;
            ctx.beginPath();
            ctx.ellipse(
                Math.cos(ang) * len * 0.9,
                Math.sin(ang) * len * 0.55 + size * 0.08,
                size * 0.028,
                size * 0.05 + t * size * 0.04,
                ang,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    function drawPoisonBurst(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        radialGlow(ctx, size * (0.08 + t * 0.12), "rgba(120,255,80,0.65)", "rgba(20,80,20,0)");
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 + 0.5;
            const len = size * (0.05 + t * 0.25);
            ctx.fillStyle = `rgba(80,220,60,${alpha * 0.75})`;
            ctx.beginPath();
            ctx.ellipse(Math.cos(ang) * len, Math.sin(ang) * len, size * 0.012, size * 0.022, ang, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawMightPulse(ctx, f, n, size) {
        drawFortifyImpact(ctx, f, n, size);
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(255,220,80,${(1 - t) * 0.55})`;
        ctx.lineWidth = size * 0.024;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.1 + t * 0.3), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawScareBurst(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        radialGlow(ctx, size * (0.14 - t * 0.06), "rgba(180,100,255,0.55)", "rgba(40,0,80,0)");
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2 + 0.3;
            ctx.strokeStyle = `rgba(220,180,255,${alpha * 0.6})`;
            ctx.lineWidth = size * 0.012;
            ctx.beginPath();
            ctx.moveTo(0, size * 0.05);
            ctx.quadraticCurveTo(Math.cos(ang) * size * 0.12, -size * 0.2, Math.cos(ang) * size * 0.08, -size * 0.35);
            ctx.stroke();
        }
    }

    function drawCometImpact(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.9;
        impactCore(ctx, size, t, "rgba(255,255,230,0.98)", "rgba(255,150,40,0)");
        radialGlow(ctx, size * (0.1 + t * 0.28), `rgba(255,200,80,${alpha * 0.7})`, "rgba(80,30,10,0)");
        if (t < 0.35) {
            radialGlow(ctx, size * (0.06 + t * 0.14), `rgba(255,240,200,${(1 - t / 0.35) * 0.85})`, "rgba(0,0,0,0)");
        }
    }

    function drawWarAura(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        ctx.strokeStyle = `rgba(255,80,60,${alpha})`;
        ctx.lineWidth = size * 0.028;
        ctx.beginPath();
        ctx.moveTo(-size * 0.12, size * 0.08);
        ctx.lineTo(0, -size * 0.12);
        ctx.lineTo(size * 0.12, size * 0.08);
        ctx.stroke();
        radialGlow(ctx, size * 0.1, "rgba(255,120,80,0.5)", "rgba(120,20,20,0)");
    }

    function drawIceCometProj(ctx, f, n, size) {
        const t = f / n;
        const len = size * (0.12 + t * 0.18);
        ctx.fillStyle = "rgba(210,245,255,0.95)";
        ctx.beginPath();
        ctx.moveTo(0, -len);
        ctx.lineTo(size * 0.05, 0);
        ctx.lineTo(0, size * 0.04);
        ctx.lineTo(-size * 0.05, 0);
        ctx.closePath();
        ctx.fill();
        radialGlow(ctx, size * 0.06, "rgba(230,250,255,0.9)", "rgba(100,200,255,0)");
    }

    function drawFortifyOrb(ctx, f, n, size) {
        drawFortifyProj(ctx, f, n, size);
        const t = f / n;
        radialGlow(ctx, size * (0.1 + t * 0.06), "rgba(180,255,210,0.85)", "rgba(40,180,90,0)");
    }

    function drawFortifyWindup(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.75;
        radialGlow(ctx, size * (0.06 + t * 0.1), `rgba(200,255,220,${alpha})`, "rgba(60,200,120,0)");
        ctx.strokeStyle = `rgba(120,255,170,${alpha * 0.7})`;
        ctx.lineWidth = size * 0.016;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.08 + t * 0.14), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawChargeBolt(ctx, f, n, size) {
        const t = f / n;
        radialGlow(ctx, size * 0.14, "rgba(255,220,150,0.95)", "rgba(255,100,30,0)");
        ctx.strokeStyle = "rgba(255,180,80,0.85)";
        ctx.lineWidth = size * 0.022;
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, 0);
        ctx.lineTo(size * 0.22, 0);
        ctx.stroke();
    }

    function drawChargeSlash(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        impactCore(ctx, size, t, "rgba(255,240,200,0.9)", "rgba(255,120,40,0)");
        ctx.strokeStyle = `rgba(255,160,50,${alpha})`;
        ctx.lineWidth = size * 0.032;
        ctx.beginPath();
        ctx.moveTo(-size * 0.28, size * 0.1);
        ctx.lineTo(size * 0.28, -size * 0.18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, -size * 0.05);
        ctx.lineTo(size * 0.22, size * 0.15);
        ctx.stroke();
    }

    function drawShieldWindup(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.8;
        ctx.strokeStyle = `rgba(255,230,120,${alpha * 0.75})`;
        ctx.lineWidth = size * 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.1 + t * 0.12), 0, Math.PI * 2);
        ctx.stroke();
        radialGlow(ctx, size * 0.08, `rgba(255,240,180,${alpha * 0.5})`, "rgba(0,0,0,0)");
    }

    function drawShieldDome(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.78;
        const grow = 0.12 + t * 0.22;
        impactCore(ctx, size, t * 0.7, "rgba(255,252,230,0.9)", "rgba(255,200,80,0)");
        ctx.strokeStyle = `rgba(255,230,120,${alpha * 0.95})`;
        ctx.lineWidth = size * 0.028;
        ctx.beginPath();
        ctx.moveTo(-size * grow, size * 0.1);
        ctx.quadraticCurveTo(0, -size * grow * 1.15, size * grow, size * 0.1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,245,210,${alpha * 0.55})`;
        ctx.lineWidth = size * 0.012;
        ctx.beginPath();
        ctx.arc(0, size * 0.06, size * grow * 0.92, Math.PI, 0);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI + Math.PI;
            const rx = Math.cos(ang) * size * grow * 0.75;
            const ry = Math.sin(ang) * size * grow * 0.45 + size * 0.05;
            ctx.fillStyle = `rgba(255,240,180,${alpha * 0.45})`;
            ctx.beginPath();
            ctx.arc(rx, ry, size * 0.014, 0, Math.PI * 2);
            ctx.fill();
        }
        radialGlow(ctx, size * grow * 0.65, `rgba(255,230,140,${alpha * 0.4})`, "rgba(0,0,0,0)");
    }

    function drawCometStreak(ctx, f, n, size) {
        const t = f / n;
        const len = size * (0.2 + t * 0.25);
        radialGlow(ctx, size * 0.1, "rgba(255,250,220,0.95)", "rgba(255,180,60,0)");
        ctx.strokeStyle = "rgba(255,220,120,0.9)";
        ctx.lineWidth = size * 0.028;
        ctx.beginPath();
        ctx.moveTo(0, len * 0.5);
        ctx.lineTo(0, -len * 0.5);
        ctx.stroke();
    }

    function drawMightInfuse(ctx, f, n, size) {
        drawMightPulse(ctx, f, n, size);
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        for (let i = 0; i < 4; i++) {
            const y = size * (0.12 - i * 0.08);
            ctx.strokeStyle = `rgba(255,230,120,${alpha * (0.7 - i * 0.12)})`;
            ctx.lineWidth = size * 0.014;
            ctx.beginPath();
            ctx.moveTo(-size * 0.06, y);
            ctx.lineTo(size * 0.06, y - size * 0.04);
            ctx.stroke();
        }
    }

    function drawVampSiphon(ctx, f, n, size) {
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(255,50,70,${0.9 - t * 0.7})`;
        ctx.lineWidth = size * 0.032;
        ctx.beginPath();
        ctx.moveTo(-size * 0.38, 0);
        ctx.bezierCurveTo(-size * 0.1, -size * 0.2, size * 0.1, size * 0.2, size * 0.38, 0);
        ctx.stroke();
        radialGlow(ctx, size * 0.09, "rgba(255,80,100,0.75)", "rgba(80,0,20,0)");
    }

    function drawTrickeryPortal(ctx, f, n, size) {
        drawSwapArc(ctx, f, n, size);
        const t = f / (n - 1);
        ctx.strokeStyle = `rgba(220,150,255,${(1 - t) * 0.8})`;
        ctx.lineWidth = size * 0.018;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.22, size * 0.14, t * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawHookGrapple(ctx, f, n, size) {
        drawHookChain(ctx, f, n, size);
        const t = f / n;
        ctx.fillStyle = "rgba(220,180,90,0.9)";
        ctx.beginPath();
        ctx.moveTo(size * 0.12, -size * 0.05);
        ctx.lineTo(size * 0.22, size * 0.02);
        ctx.lineTo(size * 0.1, size * 0.08);
        ctx.closePath();
        ctx.fill();
    }

    function drawVoidWindup(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.75;
        radialGlow(ctx, size * (0.05 + t * 0.12), `rgba(160,100,255,${alpha})`, "rgba(40,0,80,0)");
        ctx.strokeStyle = `rgba(180,120,255,${alpha * 0.65})`;
        ctx.lineWidth = size * 0.016;
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.1 + t * 0.1), t * 3, t * 3 + Math.PI * 1.4);
        ctx.stroke();
    }

    function drawScareWave(ctx, f, n, size) {
        drawScareBurst(ctx, f, n, size);
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        radialGlow(ctx, size * (0.12 + t * 0.38), `rgba(200,140,255,${alpha * 0.55})`, "rgba(0,0,0,0)");
        radialGlow(ctx, size * (0.08 + t * 0.22), `rgba(120,60,200,${alpha * 0.35})`, "rgba(0,0,0,0)");
    }

    function drawConjureSwirl(ctx, f, n, size) {
        drawArcanePortal(ctx, f, n, size);
        const t = f / n;
        ctx.strokeStyle = "rgba(200,140,255,0.85)";
        ctx.lineWidth = size * 0.02;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.2, size * 0.12, t * Math.PI * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawDragonMeteorImpact(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        impactCore(ctx, size, t * 0.9, "rgba(220,245,255,0.98)", "rgba(60,150,255,0)");
        const craterR = size * (0.08 + t * 0.34);
        ctx.fillStyle = `rgba(20,60,140,${alpha * 0.55})`;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.06, craterR * 1.15, craterR * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        radialGlow(ctx, size * (0.14 + t * 0.32), `rgba(140,220,255,${alpha * 0.55})`, "rgba(0,0,0,0)");
        if (t > 0.15 && t < 0.8) {
            radialGlow(ctx, size * (0.08 + (t - 0.15) * 0.22), `rgba(80,180,255,${(1 - t) * 0.42})`, "rgba(0,0,0,0)");
        }
    }

    function drawDragonEgg(ctx, f, n, size) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.78;
        ctx.fillStyle = `rgba(200,60,40,${alpha * 0.85})`;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.04, size * 0.12, size * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,180,120,${alpha})`;
        ctx.lineWidth = size * 0.014;
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2 + t;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * size * 0.2, Math.sin(ang) * size * 0.16);
            ctx.stroke();
        }
    }

    function drawWallBrick(ctx, f, n, size) {
        drawWallRune(ctx, f, n, size);
        const t = f / (n - 1);
        const alpha = 1 - t * 0.85;
        ctx.fillStyle = `rgba(180,140,80,${alpha * 0.55})`;
        ctx.fillRect(-size * 0.16, -size * 0.2, size * 0.32, size * 0.1);
        ctx.fillRect(-size * 0.1, -size * 0.08, size * 0.2, size * 0.1);
    }

    function drawPoisonCloud(ctx, f, n, size) {
        drawPoisonBurst(ctx, f, n, size);
        const t = f / (n - 1);
        const alpha = 1 - t * 0.88;
        radialGlow(ctx, size * (0.1 + t * 0.14), `rgba(80,220,60,${alpha * 0.45})`, "rgba(20,60,20,0)");
    }

    /** Fallback genérico por fase (proj/windup/impact/aftermath) com matiz do pack. */
    function drawGenericPhase(ctx, f, n, size, phaseName, hue) {
        const t = f / (n - 1);
        const alpha = 1 - t * 0.82;
        const h = hue ?? 30;
        if (phaseName === "proj") {
            const r = size * (0.08 + t * 0.12);
            radialGlow(ctx, r * 1.8, `hsla(${h},100%,88%,0.95)`, `hsla(${h},100%,50%,0)`);
            radialGlow(ctx, r, `hsla(${h},100%,75%,0.9)`, `hsla(${h},90%,40%,0)`);
        } else if (phaseName === "windup") {
            const r = size * (0.04 + t * 0.14);
            radialGlow(ctx, r * 2, `hsla(${h},100%,92%,0.85)`, `hsla(${h},100%,45%,0)`);
            ctx.strokeStyle = `hsla(${h},100%,70%,${alpha * 0.7})`;
            ctx.lineWidth = size * 0.022;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (phaseName === "impact") {
            if (t < 0.15) radialGlow(ctx, size * 0.2, `hsla(${h},100%,95%,0.95)`, `hsla(${h},100%,50%,0)`);
            const ringR = size * (0.06 + t * 0.42);
            ctx.strokeStyle = `hsla(${h},100%,65%,${alpha})`;
            ctx.lineWidth = size * 0.038;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2 + t;
                const len = size * (0.06 + t * 0.32);
                ctx.strokeStyle = `hsla(${h},100%,75%,${alpha * 0.75})`;
                ctx.lineWidth = size * 0.018;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
                ctx.stroke();
            }
        } else {
            const r = size * (0.12 + t * 0.08) * (1 - t * 0.5);
            radialGlow(ctx, r, `hsla(${h},80%,60%,${alpha * 0.5})`, "rgba(0,0,0,0)");
            for (let i = 0; i < 5; i++) {
                const ang = (i / 5) * Math.PI * 2;
                ctx.fillStyle = `hsla(${h},100%,70%,${alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(Math.cos(ang) * r * 0.8, Math.sin(ang) * r * 0.8, size * 0.014, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function bakeAllSheets() {
        for (const k of Object.keys(sheets)) delete sheets[k];
        const S = 96;
        const S2 = 112;
        const defs = [
            ["fire_proj", 6, S, drawFireProj],
            ["fire_impact", 14, S, drawFireImpact],
            ["bomb_impact", 16, S2, drawBombImpact],
            ["bomb_ball", 6, S, drawBombBall],
            ["bomb_explosion_ult", 20, 128, drawBombExplosionUlt],
            ["divine_green", 18, 128, drawDivineGreen],
            ["holy_pillar", 18, 128, drawHolyPillar],
            ["portal_mystic", 16, S2, drawPortalMystic],
            ["war_roar", 14, S2, drawWarRoar],
            ["fortify_proj", 6, S, drawFortifyProj],
            ["fortify_impact", 14, S, drawFortifyImpact],
            ["fortify_impact_premium", 18, S2, drawFortifyImpactPremium],
            ["sea_curse", 14, S, drawSeaCurse],
            ["ice_burst", 14, S, drawIceBurst],
            ["charge_burst", 12, S, drawChargeBurst],
            ["shield_burst", 14, S, drawShieldBurst],
            ["arcane_portal", 16, S2, drawArcanePortal],
            ["swap_arc", 10, S, drawSwapArc],
            ["lightning_hit", 10, S, drawLightningHit],
            ["dragon_summon", 16, S2, drawDragonSummon],
            ["hook_chain", 8, S, drawHookChain],
            ["resurrect_light", 14, S, drawResurrectLight],
            ["potion_ok", 12, S, drawPotionBurst],
            ["potion_fail", 12, S, (c, f, n, sz) => drawPotionBurst(c, f, n, sz, true)],
            ["vamp_drain", 12, S, drawVampDrain],
            ["void_banish", 14, S, drawVoidBanish],
            ["wall_rune", 12, S, drawWallRune],
            ["poison_burst", 14, S, drawPoisonBurst],
            ["poison_slime_proj", 8, S, drawPoisonSlimeProj],
            ["poison_slime_splat", 16, S2, drawPoisonSlimeSplat],
            ["might_pulse", 14, S, drawMightPulse],
            ["scare_burst", 14, S, drawScareBurst],
            ["comet_impact", 16, S2, drawCometImpact],
            ["war_aura", 12, S, drawWarAura],
            ["ice_comet_proj", 6, S, drawIceCometProj],
            ["fortify_orb", 6, S, drawFortifyOrb],
            ["fortify_windup", 10, S, drawFortifyWindup],
            ["charge_bolt", 6, S, drawChargeBolt],
            ["charge_slash", 12, S, drawChargeSlash],
            ["shield_windup", 10, S, drawShieldWindup],
            ["shield_dome", 14, S, drawShieldDome],
            ["comet_streak", 6, S, drawCometStreak],
            ["might_infuse", 14, S, drawMightInfuse],
            ["vamp_siphon", 12, S, drawVampSiphon],
            ["trickery_portal", 10, S, drawTrickeryPortal],
            ["hook_grapple", 8, S, drawHookGrapple],
            ["void_windup", 10, S, drawVoidWindup],
            ["scare_wave", 14, S, drawScareWave],
            ["conjure_swirl", 16, S2, drawConjureSwirl],
            ["dragon_egg", 12, S, drawDragonEgg],
            ["dragon_meteor_impact", 18, S2, drawDragonMeteorImpact],
            ["wall_brick", 12, S, drawWallBrick],
            ["poison_cloud", 14, S, drawPoisonCloud],
        ];
        for (const [id, frames, size, draw] of defs) {
            forceProceduralSheet(id, frames, size, draw);
        }
    }

    function resolveVfxBase() {
        if (global.__dfVfxBase) return global.__dfVfxBase;
        try {
            const page = String(global.location?.href || "").replace(/[#?].*$/, "");
            const dir = page.replace(/[^/]*$/, "");
            global.__dfVfxBase = dir + "vfx/";
            return global.__dfVfxBase;
        } catch (e) {
            global.__dfVfxBase = "vfx/";
            return global.__dfVfxBase;
        }
    }

    /** VFX asset via dfAssetUrl — o build publica WebP e apaga o PNG irmão. */
    function vfxAssetUrl(relFromVfxBase) {
        const base = resolveVfxBase();
        const full = base + relFromVfxBase;
        // Caminho RELATIVO: dfAssetUrl ignora URLs absolutas e é ele quem troca
        // .png por .webp (o build apaga o PNG irmão).
        if (typeof global.dfAssetUrl === "function") {
            let rel = full;
            try {
                const origin = global.location?.origin;
                if (origin && rel.startsWith(origin)) rel = rel.slice(origin.length);
                rel = rel.replace(/^\/+/, "");
                const marker = rel.lastIndexOf("vfx/");
                if (marker > 0) rel = rel.slice(marker);
            } catch (eRel) { rel = "vfx/" + relFromVfxBase; }
            try { return global.dfAssetUrl(rel); } catch (e) { /* */ }
        }
        const ver = encodeURIComponent(global.__DF_GAME_V || global.__DF_DISPLAY_VERSION || "1");
        return full + (full.includes("?") ? "&" : "?") + "v=" + ver;
    }

    function loadImage(src) {
        return new Promise((res, rej) => {
            const img = new Image();
            try {
                const abs = new URL(src, global.location?.href || undefined);
                if (abs.origin !== global.location?.origin) img.crossOrigin = "anonymous";
            } catch (e) { /* same-origin relative */ }
            img.onload = () => res(img);
            img.onerror = () => rej(new Error("img fail: " + src));
            img.src = src;
        });
    }

    function chromaKeyBlack(ctx, x, y, w, h) {
        const data = ctx.getImageData(x, y, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i];
            const g = px[i + 1];
            const b = px[i + 2];
            if (r < 24 && g < 24 && b < 24) px[i + 3] = 0;
        }
        ctx.putImageData(data, x, y);
    }

    function sheetCanvasHasContent(cv, frameW, frames) {
        const ctx = cv.getContext("2d");
        if (!ctx) return false;
        let visible = 0;
        for (let f = 0; f < frames; f++) {
            const data = ctx.getImageData(f * frameW, 0, frameW, frameW).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 20) {
                    visible++;
                    if (visible > 32) return true;
                }
            }
        }
        return false;
    }

    function hasSheet(id) {
        return !!sheets[id]?.canvas;
    }

    function packIdForType(type, opts) {
        if (type === "potion") return opts?.success ? "potion_ok" : "potion_fail";
        return recipesData?.typeToPack?.[type] || null;
    }

    function purgeMagnificSheets() {
        for (const id of Object.keys(sheets)) {
            if (sheets[id]?.source === "magnific") delete sheets[id];
        }
        magnificReady = false;
    }

    async function loadMagnificSheets() {
        if (!USE_MAGNIFIC_PACKS) {
            purgeMagnificSheets();
            return false;
        }
        try {
            const base = resolveVfxBase();
            const recipesRes = await fetch(base + "ultimate-recipes.json");
            if (!recipesRes.ok) {
                console.warn("[DfSpriteVfx] recipes fetch failed:", base);
                return false;
            }
            recipesData = await recipesRes.json();
            if (!recipesData.useMagnificPacks) return false;

            const manRes = await fetch(base + "manifest.json");
            if (!manRes.ok) {
                console.warn("[DfSpriteVfx] manifest fetch failed:", base);
                return false;
            }
            const man = await manRes.json();
            const displaySize = recipesData.displayFrameSize || 128;
            let loaded = 0;

            for (const [id, entry] of Object.entries(man)) {
                if (!entry?.file || entry.validated === false) continue;
                try {
                    const src = vfxAssetUrl(entry.file);
                    const img = await loadImage(src);
                    const frames = entry.frames || 8;
                    const srcFrame = entry.size || Math.floor(img.width / frames);
                    const cv = document.createElement("canvas");
                    cv.width = displaySize * frames;
                    cv.height = displaySize;
                    const ctx = cv.getContext("2d");
                    for (let f = 0; f < frames; f++) {
                        const dx = f * displaySize;
                        ctx.clearRect(dx, 0, displaySize, displaySize);
                        ctx.drawImage(
                            img, f * srcFrame, 0, srcFrame, srcFrame,
                            dx, 0, displaySize, displaySize,
                        );
                        chromaKeyBlack(ctx, dx, 0, displaySize, displaySize);
                    }
                    if (!sheetCanvasHasContent(cv, displaySize, frames)) {
                        console.warn("[DfSpriteVfx] sheet empty after chroma:", id);
                        continue;
                    }
                    sheets[id] = { canvas: cv, frames, size: displaySize, baked: true, source: "magnific" };
                    loaded++;
                } catch (sheetErr) {
                    console.warn("[DfSpriteVfx] sheet skip:", id, sheetErr);
                }
            }
            magnificReady = loaded > 0;
            if (loaded) console.info("[DfSpriteVfx] Magnific sheets loaded:", loaded);
            return magnificReady;
        } catch (e) {
            console.warn("[DfSpriteVfx] Magnific load:", e);
            return false;
        }
    }


    global.__DfSpriteVfxCoreReady = true;
})(typeof window !== "undefined" ? window : globalThis);
