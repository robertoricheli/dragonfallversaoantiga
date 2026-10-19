/**
 * DfSpriteVfx — ultimates em canvas procedural + cinemáticas DOM.
 * PNGs Magnific desativados (geravam grids/storyboards ilegíveis).
 */
(function (global) {
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

    function vfxRoot() {
        return global.DfLayout?.overlayRoot?.() || global.document.body;
    }

    function vfxCanvasFly() {
        return vfxRoot() !== global.document.body;
    }

    function vfxMapPoint(vx, vy) {
        if (!vfxCanvasFly()) return { x: vx, y: vy };
        return global.DfLayout?.viewportToCanvas?.(vx, vy) || { x: vx, y: vy };
    }

    function vfxMount(el) {
        const root = vfxRoot();
        if (el.parentNode !== root) root.appendChild(el);
        if (vfxCanvasFly()) {
            global.DfLayout?.prepareOverlay?.(el);
            if (el.dataset.dfVfxMapped !== "1") {
                const left = parseFloat(el.style.left);
                const top = parseFloat(el.style.top);
                if (Number.isFinite(left) && Number.isFinite(top)) {
                    const w = parseFloat(el.style.width);
                    const h = parseFloat(el.style.height);
                    const p = vfxMapPoint(left, top);
                    el.style.left = p.x + "px";
                    el.style.top = p.y + "px";
                    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
                        const sz = vfxMapSize(w, h);
                        el.style.width = sz.width + "px";
                        el.style.height = sz.height + "px";
                    }
                    el.dataset.dfVfxMapped = "1";
                }
            }
        }
        return el;
    }

    function vfxOverlayPos() {
        return vfxCanvasFly() ? "absolute" : "fixed";
    }

    /**
     * Camadas de AMBIÊNCIA de tela cheia (céu/vignette/wash/flash) precisam
     * cobrir o VIEWPORT INTEIRO — inclusive as laterais (letterbox) fora do
     * #df-scale-root. Se montadas no scale-root (transform), `position:fixed`
     * passa a ser relativo ao scale-root e o efeito só escurece o MEIO da
     * tela. Por isso montamos SEMPRE no body com `position:fixed; inset:0`.
     */
    function vfxFullscreenMount(el) {
        const body = global.document.body;
        if (el.parentNode !== body) body.appendChild(el);
        el.style.setProperty("position", "fixed", "important");
        el.style.setProperty("inset", "0", "important");
        el.dataset.dfVfxMapped = "1";
        el.dataset.dfVfxFullscreen = "1";
        return el;
    }

    function vfxPlace(el, vx, vy) {
        if (el.parentNode !== vfxRoot()) vfxMount(el);
        const p = vfxMapPoint(vx, vy);
        el.style.position = vfxOverlayPos();
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
        el.dataset.dfVfxMapped = "1";
        return p;
    }

    function vfxSetPoint(el, vx, vy) {
        return vfxPlace(el, vx, vy);
    }

    function vfxMapSize(w, h) {
        if (!vfxCanvasFly() || !global.DfLayout?.viewportRectToCanvas) {
            return { width: w, height: h };
        }
        const box = global.DfLayout.viewportRectToCanvas({ left: 0, top: 0, width: w, height: h });
        return { width: Math.abs(box.width), height: Math.abs(box.height) };
    }

    /** Elementos com transform: translate(-50%, -50%) — centro no campeão. */
    function vfxPlaceCenter(el, cx, cy, w, h) {
        const p = vfxPlace(el, cx, cy);
        if (w > 0 && h > 0) {
            const sz = vfxMapSize(w, h);
            el.style.width = Math.round(sz.width) + "px";
            el.style.height = Math.round(sz.height) + "px";
        }
        return p;
    }

    /** Elementos com transform: translate(-50%, -100%) — base inferior no ponto. */
    function vfxPlaceBottomCenter(el, cx, baseY, w, h) {
        const p = vfxPlace(el, cx, baseY);
        if (w > 0 && h > 0) {
            const sz = vfxMapSize(w, h);
            el.style.width = Math.round(sz.width) + "px";
            el.style.height = Math.round(sz.height) + "px";
        }
        return p;
    }

    function championAnchorRect(targetP, targetI) {
        const el = global.getChampionDom?.(targetP, targetI);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 2 && r.height > 2) return r;
        }
        return global.championVisualRect?.(targetP, targetI) || null;
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

    /**
     * URL de asset de VFX. OBRIGATÓRIO passar por dfAssetUrl: o build publica
     * WebP e apaga o PNG irmão, então montar "vfx/…/x.png" à mão dá 404 e a
     * animação morre em silêncio (Princesa Slime não aparecia por isso).
     */
    function vfxAssetUrl(relFromVfxBase) {
        const base = resolveVfxBase();
        const full = base + relFromVfxBase;
        // dfAssetUrl ignora URLs absolutas (http:/data:/blob:), e resolveVfxBase
        // devolve absoluto. Passar o caminho RELATIVO é o que permite a troca
        // .png → .webp; com o absoluto o PNG apagado pelo build dava 404.
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

    function vfxViewportRect(r) {
        if (!vfxCanvasFly() || !r) return r;
        const tl = vfxMapPoint(r.left, r.top);
        const br = vfxMapPoint(r.right, r.bottom);
        return {
            left: tl.x,
            top: tl.y,
            width: br.x - tl.x,
            height: br.y - tl.y,
            right: br.x,
            bottom: br.y,
        };
    }

    function overlay(className, css) {
        const el = document.createElement("div");
        el.className = `df-vfx-overlay ${className || ""}`;
        el.style.cssText = `pointer-events:none;z-index:${Z - 3};${css || ""}`;
        // Ambiência de tela cheia → body + position:fixed;inset:0 (cobre laterais).
        vfxFullscreenMount(el);
        return el;
    }

    function screenFlash(cx, cy, color, strength, ms) {
        // overlay() agora é fixo no viewport → usa coordenadas de viewport direto
        // (sem mapear p/ canvas), senão o centro do flash sai do lugar.
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
        const p = vfxPlace(el, x, y);
        const pos = vfxCanvasFly() ? "absolute" : "fixed";
        el.style.cssText =
            `position:${pos};left:${p.x}px;top:${p.y}px;width:${base}px;height:${base}px;border:3px solid ${color};` +
            `border-radius:50%;pointer-events:none;z-index:${Z - 2};transform:translate(-50%,-50%) scale(0.15);` +
            "opacity:0;box-shadow:0 0 28px currentColor;transition:transform 720ms cubic-bezier(.15,.95,.25,1),opacity 720ms ease-out;";
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
            const p0 = vfxMapPoint(x, y);
            cv.style.cssText =
                `position:${vfxPos()};left:${p0.x}px;top:${p0.y}px;width:${s}px;height:${s}px;pointer-events:none;` +
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
            vfxMount(cv);
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
            `pointer-events:none;z-index:${Z};width:${size}px;height:${size}px;` +
            "transform:translate(-50%,-50%);background:transparent;";
        vfxMount(el);
        return el;
    }

    function spawnTrailParticle(x, y, hue, size, anim) {
        if (!anim.alive()) return;
        const s = size || (6 + Math.random() * 10);
        const cv = document.createElement("canvas");
        cv.width = s;
        cv.height = s;
        cv.className = "df-sprite-vfx-layer";
        const p = vfxMapPoint(x, y);
        cv.style.cssText = `position:${vfxCanvasFly() ? "absolute" : "fixed"};left:${p.x}px;top:${p.y}px;width:${s}px;height:${s}px;pointer-events:none;z-index:${Z - 1};transform:translate(-50%,-50%);opacity:0.8;transition:opacity 350ms ease-out, transform 350ms ease-out;`;
        const ctx = cv.getContext("2d");
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, `hsla(${hue},100%,82%,0.9)`);
        g.addColorStop(0.55, `hsla(${hue},100%,55%,0.5)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
        ctx.fill();
        vfxMount(cv);
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
        vfxPlace(el, x, y);
        if (opts.blend) el.style.mixBlendMode = opts.blend;
        else el.style.mixBlendMode = "screen";
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
        const p0 = vfxMapPoint(x - w / 2, fromY);
        el.style.cssText =
            `position:${vfxPos()};left:${p0.x}px;top:${p0.y}px;width:${w}px;height:${h}px;` +
            `pointer-events:none;z-index:${Z + 1};mix-blend-mode:screen;`;
        vfxMount(el);
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
        vfxMount(burst);
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
        vfxMount(potion);

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
        vfxMount(splash);
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
            vfxMount(s);
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
        vfxMount(outcome);
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
            vfxMount(ooze);
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
        vfxMount(bomb);

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
                vfxMount(s);
                setTimeout(() => s.remove(), 900);
                await wait(58);
            }
        })();

        await wait(dur);
        stopSparks();
        bomb.classList.add("impact");
        await wait(fast ? 50 : 140);
        bomb.classList.remove("impact");
        bomb.classList.add("exploding");
        await wait(fast ? 60 : 200);
        bomb.remove();
    }

    function spawnExplosionBlobs(x, y, anim) {
        if (!anim.alive()) return;
        const hues = [
            "rgba(255, 240, 180, 0.55)",
            "rgba(255, 170, 55, 0.48)",
            "rgba(255, 95, 35, 0.38)",
            "rgba(80, 35, 22, 0.32)",
        ];
        for (let i = 0; i < hues.length; i++) {
            const blob = document.createElement("div");
            const sz = Math.round(cardUnit(1.1 + i * 0.55));
            blob.className = "df-explosion-blob";
            blob.style.left = x + "px";
            blob.style.top = y + "px";
            blob.style.width = sz + "px";
            blob.style.height = sz + "px";
            blob.style.background = `radial-gradient(circle, ${hues[i]} 0%, transparent 72%)`;
            blob.style.animationDelay = (i * 55) + "ms";
            vfxMount(blob);
            setTimeout(() => { try { blob.remove(); } catch (e) { /* */ } }, 780);
        }
    }

    function spawnExplosionEmbers(x, y, count, anim) {
        if (!anim.alive()) return;
        for (let i = 0; i < count; i++) {
            const em = document.createElement("div");
            em.className = "df-explosion-ember";
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 55 + Math.random() * 95;
            em.style.left = x + "px";
            em.style.top = y + "px";
            em.style.setProperty("--px", (Math.cos(ang) * dist) + "px");
            em.style.setProperty("--py", (Math.sin(ang) * dist) + "px");
            em.style.animationDelay = (Math.random() * 80) + "ms";
            vfxMount(em);
            setTimeout(() => { try { em.remove(); } catch (e) { /* */ } }, 720);
        }
    }

    async function playBombExplosionAt(x, y, anim, recipe, opts = {}) {
        if (!anim.alive()) return;
        const fast = !!opts.fast || !!recipe?.fastBomb;
        domBigBoom(x, y, fast ? 420 : 780);
        spawnExplosionBlobs(x, y, anim);
        screenFlash(x, y, recipe?.flashColor ?? "rgba(255,200,80,0.72)", fast ? 0.52 : 0.68, fast ? 220 : 420);
        if (fast) {
            await playSheetAt("bomb_explosion_ult", x, y, {
                scale: fx().mobile ? 1.35 : 1.55,
                fps: 42,
                blend: "screen",
                scalePulse: false,
            }, anim);
        } else {
            await playSheetAt("bomb_explosion_ult", x, y, {
                scale: fx().mobile ? 1.75 : 2.15,
                fps: 30,
                blend: "screen",
                scalePulse: true,
            }, anim);
        }
        if (!anim.alive()) return;
        spawnExplosionEmbers(x, y, fx().nUlt(fast ? 6 : (recipe?.frontBurstCount ?? 12)), anim);
        await wait(fast ? 30 : 80);
    }

    async function flyInvestidaAxe(x1, y1, x2, y2, anim, ms) {
        if (!anim.alive()) return;
        const travelMs = ms ?? (fx().mobile ? 460 : 560);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy) || 1;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const trail = document.createElement("div");
        trail.className = "df-investida-fire-trail";
        trail.style.left = x1 + "px";
        trail.style.top = y1 + "px";
        trail.style.width = dist + "px";
        trail.style.transform = `translate(-2px, -50%) rotate(${ang}deg)`;
        trail.style.setProperty("--fly-ms", travelMs + "ms");
        vfxMount(trail);
        const axe = document.createElement("div");
        axe.className = "df-investida-axe-fly";
        axe.textContent = "🪓";
        axe.style.left = x1 + "px";
        axe.style.top = y1 + "px";
        axe.style.setProperty("--dx", dx + "px");
        axe.style.setProperty("--dy", dy + "px");
        axe.style.setProperty("--fly-ms", travelMs + "ms");
        axe.style.setProperty("--rot", (ang + 52) + "deg");
        vfxMount(axe);
        await waitAnimEnd(axe, travelMs);
        trail.remove();
        axe.remove();
    }

    async function spawnInvestidaFireImpact(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const dur = ms ?? (fx().mobile ? 680 : 820);
        if (!el) {
            await wait(dur);
            return;
        }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        el.classList.add("ult-investida-channel");
        const burst = document.createElement("div");
        const bsz = Math.round(cardUnit(fx().mobile ? 3.2 : 4.1));
        burst.className = "df-investida-fire-burst";
        burst.style.width = bsz + "px";
        burst.style.height = bsz + "px";
        burst.style.left = cx + "px";
        burst.style.top = cy + "px";
        burst.style.setProperty("--burst-ms", dur + "ms");
        vfxMount(burst);
        setTimeout(() => { try { burst.remove(); } catch (e) { /* */ } }, dur + 120);
        const core = document.createElement("div");
        core.className = "df-investida-fire-core";
        core.style.left = cx + "px";
        core.style.top = (cy + r.height * 0.12) + "px";
        core.style.width = Math.round(r.width * 1.35) + "px";
        core.style.height = Math.round(r.height * 1.55) + "px";
        vfxMount(core);
        setTimeout(() => { try { core.remove(); } catch (e) { /* */ } }, dur + 80);
        const hues = [
            "rgba(255, 240, 160, 0.72)",
            "rgba(255, 140, 40, 0.55)",
            "rgba(255, 70, 15, 0.38)",
        ];
        hues.forEach((col, i) => {
            const blob = document.createElement("div");
            const sz = Math.round(cardUnit(1.6 + i * 0.65));
            blob.className = "df-investida-fire-blob";
            blob.style.left = cx + "px";
            blob.style.top = cy + "px";
            blob.style.width = sz + "px";
            blob.style.height = sz + "px";
            blob.style.background = `radial-gradient(circle, ${col} 0%, transparent 72%)`;
            blob.style.animationDelay = (i * 55) + "ms";
            vfxMount(blob);
            setTimeout(() => blob.remove(), 900);
        });
        screenFlash(cx, cy, "rgba(255,150,50,0.58)", 0.52, 340);
        await waitAnimEnd(burst, dur);
        el.classList.remove("ult-investida-channel");
    }

    async function spawnInvestidaFireFromChampion(targetP, targetI, anim, ms) {
        await spawnInvestidaFireImpact(targetP, targetI, anim, ms);
    }

    async function spawnVampBloodStream(enemyP, enemyI, allyP, allyI, anim, ms) {
        if (!anim.alive()) return;
        const from = resolveTargetCenter(enemyP, enemyI);
        const to = resolveTargetCenter(allyP, allyI);
        const dur = ms ?? (fx().mobile ? 880 : 1020);
        const enemyEl = global.getChampionDom?.(enemyP, enemyI);
        const allyEl = global.getChampionDom?.(allyP, allyI);
        if (enemyEl) enemyEl.classList.add("ult-vamp-bleed");
        if (allyEl) allyEl.classList.add("ult-vamp-receive");

        const fromM = vfxMapPoint(from.x, from.y);
        const toM = vfxMapPoint(to.x, to.y);
        const lift = Math.min(140, Math.max(48, Math.abs(toM.x - fromM.x) * 0.22 + 36));
        const ctrlX = (fromM.x + toM.x) / 2 + (Math.random() - 0.5) * 28;
        const ctrlY = Math.min(fromM.y, toM.y) - lift;
        const pathD = `M ${fromM.x} ${fromM.y} Q ${ctrlX} ${ctrlY} ${toM.x} ${toM.y}`;

        const svgNs = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNs, "svg");
        svg.setAttribute("class", "df-vamp-blood-svg");
        svg.style.cssText = `position:${vfxPos()};inset:0;width:100%;height:100%;z-index:98514;pointer-events:none;overflow:visible;`;
        vfxMount(svg);

        const glowPath = document.createElementNS(svgNs, "path");
        glowPath.setAttribute("d", pathD);
        glowPath.setAttribute("class", "df-vamp-stream-glow");
        glowPath.setAttribute("fill", "none");
        glowPath.setAttribute("stroke-linecap", "round");

        const streamPath = document.createElementNS(svgNs, "path");
        streamPath.setAttribute("d", pathD);
        streamPath.setAttribute("class", "df-vamp-stream-core");
        streamPath.setAttribute("fill", "none");
        streamPath.setAttribute("stroke-linecap", "round");

        const headPath = document.createElementNS(svgNs, "path");
        headPath.setAttribute("d", pathD);
        headPath.setAttribute("class", "df-vamp-stream-head");
        headPath.setAttribute("fill", "none");
        headPath.setAttribute("stroke-linecap", "round");

        svg.appendChild(glowPath);
        svg.appendChild(streamPath);
        svg.appendChild(headPath);
        vfxMount(svg);

        const pathLen = streamPath.getTotalLength?.() || 420;
        [glowPath, streamPath, headPath].forEach((p) => {
            p.style.strokeDasharray = String(pathLen);
            p.style.strokeDashoffset = String(pathLen);
            p.style.setProperty("--vamp-len", String(pathLen));
        });
        streamPath.style.setProperty("--vamp-ms", dur + "ms");
        glowPath.style.setProperty("--vamp-ms", dur + "ms");
        headPath.style.setProperty("--vamp-ms", dur + "ms");

        const sourceBurst = document.createElement("div");
        sourceBurst.className = "df-vamp-source-burst";
        sourceBurst.style.left = from.x + "px";
        sourceBurst.style.top = from.y + "px";
        vfxMount(sourceBurst);
        setTimeout(() => { try { sourceBurst.remove(); } catch (e) { /* */ } }, 920);

        const spurtN = fx().mobile ? 7 : 11;
        for (let i = 0; i < spurtN; i++) {
            const spurt = document.createElement("div");
            spurt.className = "df-vamp-source-spurt";
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
            const dist = 22 + Math.random() * 38;
            spurt.style.left = from.x + "px";
            spurt.style.top = from.y + "px";
            spurt.style.setProperty("--sx", Math.round(Math.cos(ang) * dist) + "px");
            spurt.style.setProperty("--sy", Math.round(Math.sin(ang) * dist) + "px");
            spurt.style.animationDelay = (i * 42) + "ms";
            vfxMount(spurt);
            setTimeout(() => { try { spurt.remove(); } catch (e) { /* */ } }, 780);
        }

        screenFlash(from.x, from.y, "rgba(255,35,55,0.55)", 0.5, 300);
        tremorQuadrant(enemyP);

        const dropN = fx().nUlt(fx().mobile ? 16 : 24);
        const dropStagger = Math.round(dur / (dropN + 2));
        for (let i = 0; i < dropN; i++) {
            if (!anim.alive()) break;
            const drop = document.createElement("div");
            drop.className = "df-vamp-blood-pellet";
            const t0 = 0.08 + (i / dropN) * 0.82;
            const pt = streamPath.getPointAtLength?.(pathLen * t0) || { x: from.x, y: from.y };
            drop.style.left = pt.x + "px";
            drop.style.top = pt.y + "px";
            drop.style.setProperty("--vamp-t", t0.toFixed(3));
            drop.style.setProperty("--vamp-ms", dur + "ms");
            drop.style.animationDelay = (i * dropStagger) + "ms";
            vfxMount(drop);
            setTimeout(() => { try { drop.remove(); } catch (e) { /* */ } }, dur + 200);
        }

        await wait(Math.round(dur * 0.88));
        if (!anim.alive()) {
            svg.remove();
            if (enemyEl) enemyEl.classList.remove("ult-vamp-bleed");
            if (allyEl) allyEl.classList.remove("ult-vamp-receive");
            return;
        }

        const destBurst = document.createElement("div");
        destBurst.className = "df-vamp-dest-burst";
        destBurst.style.left = to.x + "px";
        destBurst.style.top = to.y + "px";
        vfxMount(destBurst);
        setTimeout(() => { try { destBurst.remove(); } catch (e) { /* */ } }, 880);

        const splashTo = document.createElement("div");
        splashTo.className = "df-vamp-blood-splash df-vamp-blood-splash-lg";
        splashTo.style.left = to.x + "px";
        splashTo.style.top = to.y + "px";
        vfxMount(splashTo);
        setTimeout(() => { try { splashTo.remove(); } catch (e) { /* */ } }, 920);

        screenFlash(to.x, to.y, "rgba(255,45,75,0.62)", 0.55, 380);
        tremorQuadrant(allyP);

        await wait(Math.round(dur * 0.18));
        svg.remove();
        if (enemyEl) enemyEl.classList.remove("ult-vamp-bleed");
        if (allyEl) allyEl.classList.remove("ult-vamp-receive");
    }

    async function flyBlueDragonMeteor(cx, cy, anim, travelMs) {
        if (!anim.alive()) return;
        const dur = travelMs ?? (fx().mobile ? 560 : 680);
        const fallFrom = Math.max(280, Math.min(window.innerHeight * 0.58, cy + 180));
        const size = fx().mobile ? 46 : 62;
        const meteor = document.createElement("div");
        meteor.className = "df-blue-meteor df-blue-meteor-fly";
        meteor.style.width = size + "px";
        meteor.style.height = size + "px";
        meteor.style.left = cx + "px";
        meteor.style.top = cy + "px";
        meteor.style.setProperty("--fallFrom", `-${fallFrom}px`);
        meteor.style.setProperty("--fall-ms", dur + "ms");
        vfxMount(meteor);
        await waitAnimEnd(meteor, dur);
        meteor.remove();
    }

    function spawnBlueDragonMeteorImpact(x, y, anim, recipe) {
        if (!anim.alive()) return;
        const flash = document.createElement("div");
        flash.className = "df-blue-meteor-flash";
        flash.style.left = x + "px";
        flash.style.top = y + "px";
        vfxMount(flash);
        setTimeout(() => flash.remove(), 720);
        const shock = document.createElement("div");
        shock.className = "df-blue-meteor-shock";
        shock.style.left = x + "px";
        shock.style.top = y + "px";
        vfxMount(shock);
        setTimeout(() => shock.remove(), 980);
        const crater = document.createElement("div");
        crater.className = "df-blue-meteor-crater";
        crater.style.left = x + "px";
        crater.style.top = y + "px";
        vfxMount(crater);
        setTimeout(() => crater.remove(), 1100);
        screenFlash(x, y, recipe?.flashColor ?? "rgba(100,190,255,0.62)", 0.55, 360);
        spawnRingBurst(x, y, recipe?.ringColor ?? "rgba(120,210,255,0.9)", 11, anim);
        const hues = ["rgba(200, 240, 255, 0.58)", "rgba(60, 150, 255, 0.42)"];
        hues.forEach((col, i) => {
            const blob = document.createElement("div");
            const sz = Math.round(cardUnit(1.5 + i * 0.55));
            blob.className = "df-explosion-blob";
            blob.style.left = x + "px";
            blob.style.top = y + "px";
            blob.style.width = sz + "px";
            blob.style.height = sz + "px";
            blob.style.background = `radial-gradient(circle, ${col} 0%, transparent 72%)`;
            blob.style.animationDelay = (i * 45) + "ms";
            vfxMount(blob);
            setTimeout(() => blob.remove(), 820);
        });
    }

    async function spawnCubicDragonHatch(x, y, anim) {
        if (!anim.alive()) return;
        const cube = document.createElement("div");
        const sz = Math.round(cardUnit(fx().mobile ? 1.35 : 1.75));
        cube.className = "df-cubic-dragon-hatch";
        cube.style.width = sz + "px";
        cube.style.height = sz + "px";
        cube.style.left = x + "px";
        cube.style.top = y + "px";
        vfxMount(cube);
        screenFlash(x, y, "rgba(120,210,255,0.48)", 0.42, 320);
        try { global.window?.sfx?.("dragon_roar"); } catch (e) { /* */ }
        await waitAnimEnd(cube, fx().mobile ? 720 : 900);
        cube.remove();
    }

    async function flyPoisonAcidRay(x1, y1, x2, y2, anim, ms) {
        if (!anim.alive()) return;
        const travelMs = ms ?? (fx().mobile ? 420 : 520);
        const dist = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const core = document.createElement("div");
        core.className = "df-poison-acid-core";
        core.style.left = x1 + "px";
        core.style.top = y1 + "px";
        core.style.setProperty("--dx", (x2 - x1) + "px");
        core.style.setProperty("--dy", (y2 - y1) + "px");
        core.style.setProperty("--fly-ms", travelMs + "ms");
        vfxMount(core);
        const beam = document.createElement("div");
        beam.className = "df-poison-acid-ray";
        beam.style.left = x1 + "px";
        beam.style.top = y1 + "px";
        beam.style.width = dist + "px";
        beam.style.transform = `translate(-2px, -50%) rotate(${ang}deg)`;
        beam.style.setProperty("--fly-ms", travelMs + "ms");
        vfxMount(beam);
        await waitAnimEnd(core, travelMs);
        core.remove();
        beam.remove();
    }

    async function spawnAcidExplosion(x, y, targetP, targetI, anim, recipe) {
        if (!anim.alive()) return;
        const burst = document.createElement("div");
        const sz = Math.round(cardUnit(fx().mobile ? 2.8 : 3.6));
        burst.className = "df-acid-explosion";
        burst.style.width = sz + "px";
        burst.style.height = sz + "px";
        burst.style.left = x + "px";
        burst.style.top = y + "px";
        vfxMount(burst);
        setTimeout(() => burst.remove(), 900);
        spawnPoisonSlimeBurst(x, y, anim, recipe);
        screenFlash(x, y, recipe?.flashColor ?? "rgba(60,220,60,0.55)", 0.52, 300);
        const el = global.getChampionDom?.(targetP, targetI);
        if (el) {
            el.classList.add("df-acid-hit");
            setTimeout(() => el.classList.remove("df-acid-hit"), 880);
        }
        await wait(fx().mobile ? 280 : 360);
    }

    async function spawnBastionLightPillar(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(ms ?? 600); return; }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const baseY = r.top + r.height;
        const pillar = document.createElement("div");
        pillar.className = "df-bastion-light-pillar";
        pillar.style.left = cx + "px";
        pillar.style.top = baseY + "px";
        pillar.style.height = Math.round(r.height * 2.4) + "px";
        pillar.style.width = Math.round(r.width * 0.55) + "px";
        pillar.style.setProperty("--pillar-ms", (ms ?? 680) + "ms");
        vfxMount(pillar);
        screenFlash(cx, r.top + r.height * 0.45, "rgba(120,200,255,0.38)", 0.32, 260);
        await waitAnimEnd(pillar, ms ?? 680);
        pillar.style.transition = "opacity 0.35s ease-out";
        pillar.style.opacity = "0";
        setTimeout(() => pillar.remove(), 380);
    }

    async function spawnBastionShieldDome(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(ms ?? 520); return; }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dome = document.createElement("div");
        dome.className = "df-bastion-shield-dome";
        dome.style.width = Math.round(r.width * 1.35) + "px";
        dome.style.height = Math.round(r.height * 1.42) + "px";
        dome.style.left = cx + "px";
        dome.style.top = cy + "px";
        dome.style.setProperty("--dome-ms", (ms ?? 620) + "ms");
        vfxMount(dome);
        spawnRingBurst(cx, cy, "rgba(120,200,255,0.88)", 6.5, anim);
        screenFlash(cx, cy, "rgba(180,230,255,0.35)", 0.28, 240);
        await waitAnimEnd(dome, ms ?? 620);
        dome.style.transition = "opacity 0.4s ease-out";
        dome.style.opacity = "0";
        setTimeout(() => { try { dome.remove(); } catch (e) { /* */ } }, 420);
    }

    /** Gosma venenosa — voo em arco via CSS (GPU), sem rAF por frame. */
    async function flyPoisonSlimeBlob(x1, y1, x2, y2, anim, ms) {
        if (!anim.alive()) return;
        const travelMs = ms ?? (fx().mobile ? 460 : 560);
        const size = Math.round(cardUnit(fx().mobile ? 1.55 : 2.15));
        const blob = document.createElement("div");
        blob.className = "df-poison-slime-fly df-slime-flying";
        blob.style.width = size + "px";
        blob.style.height = Math.round(size * 0.82) + "px";
        blob.style.left = x1 + "px";
        blob.style.top = y1 + "px";
        blob.style.setProperty("--dx", (x2 - x1) + "px");
        blob.style.setProperty("--dy", (y2 - y1) + "px");
        blob.style.setProperty("--arc", Math.min(120, Math.abs(y2 - y1) * 0.38 + 56) + "px");
        blob.style.setProperty("--fly-ms", travelMs + "ms");
        vfxMount(blob);
        await waitAnimEnd(blob, travelMs);
        blob.remove();
    }

    function spawnPoisonSlimeBurst(x, y, anim, recipe) {
        if (!anim.alive()) return;
        const burst = document.createElement("div");
        const sz = Math.round(cardUnit(fx().mobile ? 2.6 : 3.4));
        burst.className = "df-poison-slime-burst";
        burst.style.width = sz + "px";
        burst.style.height = sz + "px";
        burst.style.left = x + "px";
        burst.style.top = y + "px";
        vfxMount(burst);
        setTimeout(() => { try { burst.remove(); } catch (e) { /* */ } }, 820);
        const hues = [
            "rgba(140, 255, 90, 0.62)",
            "rgba(60, 200, 45, 0.48)",
        ];
        hues.forEach((col, i) => {
            const p = document.createElement("div");
            const ps = Math.round(cardUnit(1.1 + i * 0.55));
            const p0 = vfxMapPoint(x, y);
            p.style.cssText =
                `position:${vfxPos()};left:${p0.x}px;top:${p0.y}px;width:${ps}px;height:${ps}px;` +
                `border-radius:50%;pointer-events:none;z-index:98520;contain:strict;` +
                `background:radial-gradient(circle,${col},transparent 72%);` +
                `transform:translate(-50%,-50%) scale(0.3);` +
                `animation:poisonSlimeBurst 0.72s ease-out ${i * 40}ms forwards;`;
            vfxMount(p);
            setTimeout(() => p.remove(), 760);
        });
        spawnRingBurst(x, y, recipe?.ringColor ?? "rgba(80,255,80,0.85)", 9.5, anim);
    }

    function poisonSlimePngUrl(frame) {
        const rel = frame <= 2 ? "ult-poison/travel.png" : "ult-poison/impact.png";
        return vfxAssetUrl(rel);
    }

    async function ensurePoisonSlimePng(frame) {
        if (poisonSlimePngCache[frame]) return poisonSlimePngCache[frame];
        const url = poisonSlimePngUrl(frame);
        const probe = await loadImage(url);
        const meta = {
            url,
            w: probe.naturalWidth || probe.width || 512,
            h: probe.naturalHeight || probe.height || 384,
        };
        poisonSlimePngCache[frame] = meta;
        return meta;
    }

    /** Largura da carta-alvo (ou referência do tabuleiro) para escalar PNGs proporcionalmente. */
    function poisonSlimeCardWidth(targetP, targetI) {
        const cardEl = (targetP != null && targetI != null)
            ? global.getChampionDom?.(targetP, targetI)
            : null;
        const ref = cardEl || document.querySelector(".ccard, .champion-card, .hcard");
        if (ref) return ref.getBoundingClientRect().width;
        return fx().mobile ? 58 : 72;
    }

    /** proj-1 ~118% da carta; proj-3 ~128% (impacto). */
    function poisonSlimePngSize(role, targetP, targetI) {
        const cw = poisonSlimeCardWidth(targetP, targetI);
        const mob = fx().mobile;
        if (role === "fly") return Math.round(cw * (mob ? 1.06 : 1.18));
        return Math.round(cw * (mob ? 1.14 : 1.28));
    }

    /** Bulbo (frente) aponta para a esquerda no PNG; cauda + fumaça à direita. */
    function poisonSlimeFlyRotation(dx, dy) {
        return Math.atan2(dy, dx) * 180 / Math.PI + 180;
    }

    function poisonSlimeFlyPad(sizeW, sizeH) {
        return Math.round(Math.max(sizeW, sizeH) * 0.24);
    }

    function appendPoisonSlimeFlySmoke(parent) {
        const trail = document.createElement("div");
        trail.className = "df-poison-slime-smoke-trail";
        parent.appendChild(trail);
        for (let i = 0; i < 4; i++) {
            const puff = document.createElement("div");
            puff.className = "df-poison-slime-smoke df-poison-slime-smoke-" + (i + 1);
            trail.appendChild(puff);
        }
    }

    function poisonSlimeImgEl(meta, className, sizeW) {
        const img = document.createElement("img");
        img.className = className;
        img.src = meta.url;
        img.draggable = false;
        img.alt = "";
        const aspect = meta.h / meta.w;
        const sizeH = Math.round(sizeW * aspect);
        img.style.width = sizeW + "px";
        img.style.height = sizeH + "px";
        img.style.objectFit = "contain";
        return img;
    }

    async function preloadPoisonSlimePngs() {
        if (!USE_POISON_SLIME_PNG) return;
        await Promise.all([1, 3].map((f) =>
            ensurePoisonSlimePng(f).catch((e) => {
                console.warn("[DfSpriteVfx] preload poison slime", f, e);
            })
        ));
    }

    /** Gosma venenosa PNG — proj-1 percurso direto ao alvo; proj-3 explode (zoom-out) no contato. */
    async function flyPoisonSlimePngSequence(x1, y1, x2, y2, anim, ms, opts) {
        if (!USE_POISON_SLIME_PNG || !anim.alive()) return false;
        await init();
        if (opts?.casterP != null) {
            const from = resolveHandCenter(opts.casterP);
            x1 = from.x;
            y1 = from.y;
        }
        if (opts?.targetP != null && opts?.targetI != null) {
            const to = resolveTargetCenter(opts.targetP, opts.targetI);
            x2 = to.x;
            y2 = to.y;
        }
        let meta1;
        try {
            meta1 = await ensurePoisonSlimePng(1);
        } catch (e) {
            console.warn("[DfSpriteVfx] poison slime PNG load failed:", e);
            return false;
        }
        const travelMs = ms ?? POISON_SLIME_TRAVEL_MS;
        const p1 = vfxMapPoint(x1, y1);
        const p2 = vfxMapPoint(x2, y2);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const rotDeg = poisonSlimeFlyRotation(dx, dy);
        const targetP = opts?.targetP;
        const targetI = opts?.targetI;
        const sizeW = poisonSlimePngSize("fly", targetP, targetI);
        const aspect = meta1.h / meta1.w;
        const sizeH = Math.round(sizeW * aspect);
        const pad = poisonSlimeFlyPad(sizeW, sizeH);

        const fly = document.createElement("div");
        fly.className = "df-poison-slime-png-fly";
        fly.style.setProperty("--x1", p1.x + "px");
        fly.style.setProperty("--y1", p1.y + "px");
        fly.style.setProperty("--x2", p2.x + "px");
        fly.style.setProperty("--y2", p2.y + "px");
        fly.style.setProperty("--rot", rotDeg + "deg");
        fly.style.setProperty("--fly-ms", travelMs + "ms");
        if (vfxCanvasFly()) {
            fly.style.position = "absolute";
            vfxMount(fly);
        } else {
            fly.style.position = "fixed";
            vfxMount(fly);
        }

        const inner = document.createElement("div");
        inner.className = "df-poison-slime-png-fly-inner";
        inner.style.setProperty("--rot", rotDeg + "deg");
        inner.style.setProperty("--slime-w", sizeW + "px");
        inner.style.setProperty("--slime-h", sizeH + "px");
        inner.style.setProperty("--pad", pad + "px");
        appendPoisonSlimeFlySmoke(inner);

        const img = document.createElement("img");
        img.className = "df-poison-slime-png-fly-img";
        img.src = meta1.url;
        img.draggable = false;
        img.alt = "";
        inner.appendChild(img);
        fly.appendChild(inner);

        await waitAnimEnd(fly, travelMs);
        fly.remove();

        await spawnPoisonSlimePngImpact(x2, y2, anim, opts);

        if (!opts?.pngOnly && targetP != null && targetI != null) {
            const el = global.getChampionDom?.(targetP, targetI);
            if (el) {
                el.classList.add("poison-flash");
                setTimeout(() => el.classList.remove("poison-flash"), 1200);
            }
        }
        return true;
    }

    async function spawnPoisonSlimePngImpact(x, y, anim, opts) {
        const frameMs = opts?.impactFrameMs ?? POISON_SLIME_IMPACT_FRAME_MS;
        let meta;
        try {
            meta = await ensurePoisonSlimePng(3);
        } catch (e) {
            console.warn("[DfSpriteVfx] poison impact PNG failed:", e);
            return;
        }
        const targetP = opts?.targetP;
        const targetI = opts?.targetI;
        const sizeW = poisonSlimePngSize("impact", targetP, targetI);
        const aspect = meta.h / meta.w;
        const sizeH = Math.round(sizeW * aspect);

        const anchor = document.createElement("div");
        anchor.className = "df-poison-slime-png-impact-anchor";
        vfxPlace(anchor, x, y);

        const img = document.createElement("img");
        img.className = "df-poison-slime-png-impact-img";
        img.src = meta.url;
        img.draggable = false;
        img.alt = "";
        img.style.width = sizeW + "px";
        img.style.height = sizeH + "px";
        img.style.setProperty("--impact-ms", frameMs + "ms");
        anchor.appendChild(img);
        void anchor.offsetHeight;
        await waitAnimEnd(img, frameMs);
        anchor.remove();
        if (!opts?.pngOnly && opts?.flashColor) {
            screenFlash(x, y, opts.flashColor, 0.4, 260);
        }
    }

    /** API pública — Baforada Venenosa e outros talentos. */
    async function playPoisonSlimePng(fromX, fromY, toX, toY, opts) {
        const anim = beginAnim();
        try { global.window?.sfx?.("poison"); } catch (e) { /* */ }
        return flyPoisonSlimePngSequence(fromX, fromY, toX, toY, anim, opts?.travelMs, opts);
    }

    function spawnBanishVortex(x, y, anim) {
        if (!anim.alive()) return;
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement("div");
            ring.className = "ult-banish-vortex";
            ring.style.left = x + "px";
            ring.style.top = y + "px";
            ring.style.animationDelay = (i * 110) + "ms";
            vfxMount(ring);
            setTimeout(() => { try { ring.remove(); } catch (e) { /* */ } }, 1300);
        }
    }

    function spawnBanishPortal(x, y, anim, ms) {
        if (!anim.alive()) return;
        const hole = document.createElement("div");
        hole.className = "ult-blackhole ult-blackhole-open";
        const sz = Math.round(cardUnit(fx().mobile ? 2.8 : 3.6));
        hole.style.width = sz + "px";
        hole.style.height = sz + "px";
        hole.style.left = x + "px";
        hole.style.top = y + "px";
        hole.style.transform = "translate(-50%, -50%)";
        vfxMount(hole);
        const dur = Math.max(320, ms ?? 820);
        setTimeout(() => {
            if (!hole.isConnected) return;
            hole.style.transition = "opacity 0.28s ease-out, transform 0.28s ease-out";
            hole.style.opacity = "0";
            hole.style.transform = "translate(-50%, -50%) scale(0.12)";
            setTimeout(() => { try { hole.remove(); } catch (e) { /* */ } }, 300);
        }, dur);
        anim._banishPortal = hole;
    }

    async function applyBanishPortalSuck(targetP, targetI, portalX, portalY, anim) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(420); return; }
        const fieldCard = global.getState?.()?.players?.[targetP]?.field?.[targetI] || null;
        const cardName = fieldCard?.name
            || el.querySelector?.(".nm")?.textContent?.trim()
            || null;
        const cardPower = fieldCard?.currentPower ?? fieldCard?.power ?? null;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const lr = vfxViewportRect(r);
        const pc = vfxMapPoint(cx, cy);
        const portalC = vfxMapPoint(portalX, portalY);
        el.style.visibility = "hidden";
        const fly = el.cloneNode(true);
        fly.className = fly.className.replace(/\bvalid-target\b/g, "").trim() + " ult-banish-fly";
        fly.style.cssText =
            `position:${vfxPos()};left:${lr.left}px;top:${lr.top}px;width:${lr.width}px;height:${lr.height}px;` +
            `z-index:9710;pointer-events:none;margin:0;transform:none;opacity:1;`;
        vfxMount(fly);
        try {
            if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                if (global.DfCardFace.warmFace) {
                    await Promise.race([
                        global.DfCardFace.warmFace(
                            { name: cardName, currentPower: cardPower, power: cardPower },
                            { power: cardPower },
                        ),
                        new Promise((r2) => setTimeout(() => r2(""), 600)),
                    ]);
                }
                const faceUrl = global.DfCardFace.getFaceDataUrl?.(cardName, cardPower)
                    || global.dfPrimaryCardArtSrc?.(cardName)
                    || "";
                if (faceUrl) {
                    fly.innerHTML = "";
                    const img = document.createElement("img");
                    img.src = faceUrl;
                    img.alt = cardName;
                    img.draggable = false;
                    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;border-radius:inherit;";
                    fly.appendChild(img);
                } else {
                    global.applyCardArtTree?.(fly);
                }
            } else {
                global.applyCardArtTree?.(fly);
            }
        } catch (e) {
            try { global.applyCardArtTree?.(fly); } catch (e2) { /* */ }
        }
        const dur = fx().mobile ? 680 : 820;
        const dx = portalC.x - pc.x;
        const dy = portalC.y - pc.y;
        const animFly = fly.animate([
            { transform: "translate(0,0) scale(1)", opacity: 1, filter: "brightness(1)" },
            { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(0.72)`, opacity: 0.92, filter: "brightness(0.85) hue-rotate(240deg)" },
            { transform: `translate(${dx}px, ${dy}px) scale(0.05)`, opacity: 0, filter: "brightness(0.4) hue-rotate(260deg) blur(2px)" },
        ], { duration: dur, easing: "cubic-bezier(0.55, 0, 0.85, 0.36)", fill: "forwards" });
        await animFly.finished.catch(() => {});
        fly.remove();
        el.style.visibility = "";
        el.style.opacity = "";
        el.style.filter = "";
        el.style.transition = "";
    }

    /** Meteoro caindo do céu — animação CSS pura (sem sparks por frame). */
    async function flySkyMeteor(x1, y1, x2, y2, anim, ms) {
        if (!anim.alive()) return;
        const travelMs = ms ?? (fx().mobile ? 480 : 560);
        const size = fx().mobile ? 36 : 52;
        const meteor = document.createElement("div");
        meteor.className = "ult-meteor ult-meteor-flying";
        meteor.style.width = size + "px";
        meteor.style.height = size + "px";
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        meteor.style.setProperty("--tail-angle", (ang + 180) + "deg");
        meteor.style.setProperty("--dx", (x2 - x1) + "px");
        meteor.style.setProperty("--dy", (y2 - y1) + "px");
        meteor.style.setProperty("--fly-ms", travelMs + "ms");
        meteor.style.left = x1 + "px";
        meteor.style.top = y1 + "px";
        vfxMount(meteor);
        await waitAnimEnd(meteor, travelMs);
        meteor.remove();
    }

    function spawnMeteorGroundHit(x, y, anim, recipe) {
        if (!anim.alive()) return;
        try { global.window?.sfx?.("comet"); } catch (e) { /* */ }
        const mobile = fx().mobile;
        const flash = document.createElement("div");
        flash.className = mobile ? "ult-meteor-flash" : "ult-meteor-flash ult-meteor-flash-heavy";
        flash.style.setProperty("--ix", ((x / global.innerWidth) * 100) + "%");
        flash.style.setProperty("--iy", ((y / global.innerHeight) * 100) + "%");
        vfxMount(flash);
        setTimeout(() => flash.remove(), mobile ? 480 : 620);
        const shock = document.createElement("div");
        shock.className = mobile ? "ult-meteor-shock" : "ult-meteor-shock ult-meteor-shock-heavy";
        shock.style.left = x + "px";
        shock.style.top = y + "px";
        vfxMount(shock);
        setTimeout(() => shock.remove(), mobile ? 720 : 980);
        if (!mobile) {
            const crater = document.createElement("div");
            crater.className = "ult-meteor-crater";
            crater.style.left = x + "px";
            crater.style.top = y + "px";
            vfxMount(crater);
            setTimeout(() => crater.remove(), 1100);
        }
        screenFlash(x, y, recipe?.flashColor ?? "rgba(255,200,80,0.62)", mobile ? 0.32 : 0.52, mobile ? 220 : 300);
        spawnRingBurst(x, y, recipe?.ringColor ?? "rgba(255,220,100,0.9)", mobile ? 7 : 11, anim);
        const hues = mobile
            ? ["rgba(255, 200, 100, 0.45)"]
            : ["rgba(255, 240, 180, 0.58)", "rgba(255, 95, 35, 0.42)"];
        hues.forEach((col, i) => {
            const blob = document.createElement("div");
            const sz = Math.round(cardUnit(mobile ? 1.3 : 1.6 + i * 0.6));
            blob.className = "df-explosion-blob";
            blob.style.left = x + "px";
            blob.style.top = y + "px";
            blob.style.width = sz + "px";
            blob.style.height = sz + "px";
            blob.style.background = `radial-gradient(circle, ${col} 0%, transparent 72%)`;
            blob.style.animationDelay = (i * 45) + "ms";
            vfxMount(blob);
            setTimeout(() => blob.remove(), mobile ? 620 : 820);
        });
    }

    async function spawnAllyWallShield(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(280); return; }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const baseY = r.top + r.height;
        const wall = document.createElement("div");
        wall.className = "df-wall-shield-rise";
        wall.style.width = Math.round(r.width * 1.28) + "px";
        wall.style.height = Math.round(r.height * 1.18) + "px";
        wall.style.left = cx + "px";
        wall.style.top = baseY + "px";
        vfxMount(wall);
        el.classList.add("ult-wall-ally");
        spawnRingBurst(cx, r.top + r.height * 0.45, "rgba(160,180,210,0.75)", 6.5, anim);
        const blockMs = Math.min(ms ?? 520, fx().mobile ? 380 : 460);
        await waitAnimEnd(wall, blockMs);
        wall.style.transition = "opacity 0.35s ease-out";
        wall.style.opacity = "0";
        setTimeout(() => {
            try { wall.remove(); } catch (e) { /* */ }
            el.classList.remove("ult-wall-ally");
        }, 360);
    }

    function spawnWallStoneImpact(cx, cy, anim) {
        if (!anim.alive()) return;
        const dust = document.createElement("div");
        dust.className = "df-wall-stone-impact";
        dust.style.left = cx + "px";
        dust.style.top = cy + "px";
        vfxMount(dust);
        setTimeout(() => { try { dust.remove(); } catch (e) { /* */ } }, 820);

        const chipN = fx().mobile ? 5 : 8;
        for (let i = 0; i < chipN; i++) {
            const chip = document.createElement("div");
            chip.className = "df-wall-stone-chip";
            const ang = (i / chipN) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = 28 + Math.random() * 42;
            chip.style.left = cx + "px";
            chip.style.top = cy + "px";
            chip.style.setProperty("--dx", Math.round(Math.cos(ang) * dist) + "px");
            chip.style.setProperty("--dy", Math.round(-18 - Math.random() * 38) + "px");
            chip.style.setProperty("--rot", Math.round((Math.random() - 0.5) * 140) + "deg");
            chip.style.animationDelay = (i * 28) + "ms";
            vfxMount(chip);
            setTimeout(() => { try { chip.remove(); } catch (e) { /* */ } }, 720);
        }
    }

    async function spawnFallingWallStone(targetP, targetI, anim, fallMs, opts = {}) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const impactMs = opts.impactMs ?? (fx().mobile ? 280 : 340);
        let cx;
        let landY;
        let cardW = cardUnit(3.2);
        if (el) {
            const r = el.getBoundingClientRect();
            cx = r.left + r.width / 2;
            landY = r.top + r.height * 0.42;
            cardW = Math.max(Math.round(r.width * 0.38), cardUnit(2.4));
            el.classList.add("ult-wall-stone-pending");
        } else {
            await wait(fallMs + impactMs);
            if (typeof opts.onImpact === "function") opts.onImpact(targetP, targetI);
            return;
        }

        const fallFrom = Math.min(global.innerHeight * 0.52, fx().mobile ? 360 : 480);
        const stone = document.createElement("div");
        stone.className = "df-wall-stone-drop";
        stone.style.left = cx + "px";
        stone.style.top = landY + "px";
        stone.style.width = cardW + "px";
        stone.style.height = Math.round(cardW * 0.82) + "px";
        stone.style.setProperty("--fallFrom", `-${fallFrom}px`);
        stone.style.setProperty("--fallMs", fallMs + "ms");
        stone.style.setProperty("--spin", Math.round((Math.random() - 0.5) * 50) + "deg");
        vfxMount(stone);

        await waitAnimEnd(stone, fallMs);
        if (!anim.alive()) {
            stone.remove();
            el.classList.remove("ult-wall-stone-pending");
            return;
        }

        stone.classList.add("landed");
        el.classList.add("ult-wall-stone-hit");
        spawnWallStoneImpact(cx, landY, anim);
        spawnRingBurst(cx, landY, "rgba(150, 155, 168, 0.72)", 5.5, anim);

        if (typeof opts.onImpact === "function") {
            opts.onImpact(targetP, targetI);
        }

        await wait(impactMs);
        stone.remove();
        el.classList.remove("ult-wall-stone-pending", "ult-wall-stone-hit");
    }

    async function freezeEncaseChampion(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const dur = ms ?? 800;
        if (!el) {
            await wait(dur);
            return;
        }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        el.classList.add("ult-freezing");

        const encase = document.createElement("div");
        encase.className = "df-freeze-encase";
        encase.style.width = Math.round(r.width * 1.1) + "px";
        encase.style.height = Math.round(r.height * 1.1) + "px";
        encase.style.left = cx + "px";
        encase.style.top = cy + "px";
        vfxMount(encase);

        const shardN = fx().nUlt(10);
        for (let i = 0; i < shardN; i++) {
            if (!anim.alive()) break;
            const shard = document.createElement("div");
            shard.className = "df-freeze-shard";
            const ang = (i / shardN) * Math.PI * 2;
            const dist = r.width * 0.35;
            shard.style.left = (cx + Math.cos(ang) * dist * 0.3) + "px";
            shard.style.top = (cy + Math.sin(ang) * dist * 0.3) + "px";
            shard.style.setProperty("--fx", Math.cos(ang) * 18 + "px");
            shard.style.setProperty("--fy", Math.sin(ang) * 18 + "px");
            shard.style.animationDelay = (i * 45) + "ms";
            vfxMount(shard);
            setTimeout(() => shard.remove(), dur + 200);
        }

        await wait(dur);
        encase.style.opacity = "0";
        encase.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => {
            try { encase.remove(); el.classList.remove("ult-freezing"); } catch (e) { /* */ }
        }, 320);
    }

    async function spawnFortifyLightPillar(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const r = championAnchorRect(targetP, targetI);
        if (!r) { await wait(ms ?? 640); return; }
        const cx = r.left + r.width / 2;
        const baseY = r.top + r.height;
        const pillar = document.createElement("div");
        pillar.className = "df-fortify-light-pillar";
        pillar.style.setProperty("--pillar-ms", (ms ?? 680) + "ms");
        vfxPlaceBottomCenter(
            pillar, cx, baseY,
            Math.round(r.width * 0.62),
            Math.round(r.height * 2.8),
        );
        screenFlash(cx, r.top + r.height * 0.42, "rgba(80,255,130,0.42)", 0.38, 300);
        await waitAnimEnd(pillar, ms ?? 680);
        pillar.style.transition = "opacity 0.35s ease-out";
        pillar.style.opacity = "0";
        setTimeout(() => pillar.remove(), 380);
    }

    /** Aura verde fortalecedora sobre o campeão — sem traços/raios. */
    async function spawnFortifyAuraFromChampion(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const dur = ms ?? (fx().mobile ? 820 : 980);
        const r = championAnchorRect(targetP, targetI);
        if (!r) {
            await wait(dur);
            return;
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (el) el.classList.add("ult-fortify-channel");

        const sustain = document.createElement("div");
        sustain.className = "df-fortify-aura-sustain";
        sustain.style.setProperty("--aura-ms", dur + "ms");
        vfxPlaceCenter(sustain, cx, cy, Math.round(r.width * 1.45), Math.round(r.height * 1.5));

        const inner = document.createElement("div");
        inner.className = "df-fortify-aura-inner";
        inner.style.setProperty("--aura-ms", dur + "ms");
        vfxPlaceCenter(inner, cx, cy, Math.round(r.width * 1.28), Math.round(r.height * 1.28));

        const shell = document.createElement("div");
        shell.className = "df-fortify-aura-emit";
        shell.style.setProperty("--aura-ms", dur + "ms");
        vfxPlaceCenter(shell, cx, cy, Math.round(r.width * 1.18), Math.round(r.height * 1.18));

        for (let blob = 0; blob < 3; blob++) {
            const pulse = document.createElement("div");
            pulse.className = "df-fortify-pulse-blob";
            const sz = Math.round(r.width * (1.25 + blob * 0.42));
            pulse.style.animationDelay = (blob * 130) + "ms";
            pulse.style.setProperty("--aura-ms", Math.round(dur * 0.95) + "ms");
            vfxPlaceCenter(pulse, cx, cy, sz, sz);
            setTimeout(() => { try { pulse.remove(); } catch (e) { /* */ } }, dur + 240);
        }

        const bloom = document.createElement("div");
        bloom.className = "df-fortify-aura-bloom";
        bloom.style.setProperty("--aura-ms", Math.round(dur * 0.75) + "ms");
        vfxPlaceCenter(bloom, cx, cy, Math.round(r.width * 1.1), Math.round(r.height * 1.1));
        setTimeout(() => { try { bloom.remove(); } catch (e) { /* */ } }, dur + 120);

        screenFlash(cx, cy, "rgba(55, 255, 130, 0.42)", 0.44, 320);
        await waitAnimEnd(sustain, dur);
        sustain.style.opacity = shell.style.opacity = inner.style.opacity = "0";
        sustain.style.transition = shell.style.transition = inner.style.transition = "opacity 0.35s ease-out";
        setTimeout(() => {
            try {
                sustain.remove();
                shell.remove();
                inner.remove();
                el?.classList.remove("ult-fortify-channel");
            } catch (e) { /* */ }
        }, 360);
    }

    async function playFortifyBuffVfx(targetP, targetI, anim, timings) {
        if (!anim.alive()) return;
        const pillarMs = timings?.windup ?? timings?.anticipate ?? (fx().mobile ? 520 : 660);
        const auraMs = timings?.impact ?? (fx().mobile ? 760 : 920);
        await spawnFortifyLightPillar(targetP, targetI, anim, pillarMs);
        if (!anim.alive()) return;
        await spawnFortifyAuraFromChampion(targetP, targetI, anim, auraMs);
    }

    /** Gosma venenosa grudando no campeão (Quimera — Envenenar). */
    async function spawnPoisonSlimeCoat(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const dur = ms ?? 820;
        if (!el) {
            await wait(dur);
            return;
        }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const baseY = r.top + r.height * 0.72;
        el.classList.add("ult-poison-coated");

        const coat = document.createElement("div");
        coat.className = "df-poison-slime-coat";
        coat.style.left = cx + "px";
        coat.style.top = baseY + "px";
        coat.style.width = Math.round(r.width * 1.08) + "px";
        coat.style.height = Math.round(r.height * 0.55) + "px";
        coat.style.animationDuration = dur + "ms";
        vfxMount(coat);

        const splat = document.createElement("div");
        splat.className = "df-poison-slime-splat";
        splat.style.left = cx + "px";
        splat.style.top = (r.top + r.height * 0.58) + "px";
        splat.style.animationDuration = Math.round(dur * 0.55) + "ms";
        vfxMount(splat);
        setTimeout(() => { try { splat.remove(); } catch (e) { /* */ } }, dur);

        const dripN = fx().liteVfx ? 3 : fx().nUlt(4);
        for (let i = 0; i < dripN; i++) {
            if (!anim.alive()) break;
            const drip = document.createElement("div");
            drip.className = "df-poison-slime-drip";
            drip.style.left = (cx + (Math.random() - 0.5) * r.width * 0.7) + "px";
            drip.style.top = baseY + "px";
            drip.style.setProperty("--fall", (28 + Math.random() * 42) + "px");
            drip.style.animationDelay = (60 + i * 90) + "ms";
            drip.style.animationDuration = Math.round(dur * 0.7) + "ms";
            vfxMount(drip);
            setTimeout(() => { try { drip.remove(); } catch (e) { /* */ } }, dur + 120);
        }

        screenFlash(cx, baseY, "rgba(70, 220, 55, 0.32)", 0.34, 200);
        const blockMs = Math.min(dur, fx().mobile ? 280 : 360);
        await wait(blockMs);
        setTimeout(() => {
            coat.style.opacity = "0";
            coat.style.transition = "opacity 0.3s ease-out";
            setTimeout(() => {
                try {
                    coat.remove();
                    el.classList.remove("ult-poison-coated");
                } catch (e) { /* */ }
            }, 320);
        }, Math.max(0, dur - blockMs));
    }

    /** Aura divina dourada + infusão + ícone 💪 (Hércules — Força Infinita). */
    async function spawnMightDivineAuraFromChampion(targetP, targetI, anim, ms) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const dur = ms ?? 880;
        if (!el) {
            await wait(dur);
            return;
        }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const baseY = cy + r.height * 0.28;
        el.classList.add("ult-might-channel");

        const inner = document.createElement("div");
        inner.className = "df-might-divine-inner";
        inner.style.left = cx + "px";
        inner.style.top = cy + "px";
        inner.style.width = Math.round(r.width * 1.14) + "px";
        inner.style.height = Math.round(r.height * 1.14) + "px";
        inner.style.animationDuration = dur + "ms";
        vfxMount(inner);

        const shell = document.createElement("div");
        shell.className = "df-might-divine-emit";
        shell.style.left = cx + "px";
        shell.style.top = cy + "px";
        shell.style.width = Math.round(r.width * 1.06) + "px";
        shell.style.height = Math.round(r.height * 1.06) + "px";
        shell.style.animationDuration = dur + "ms";
        vfxMount(shell);

        for (let blob = 0; blob < 2; blob++) {
            const pulse = document.createElement("div");
            pulse.className = "df-might-pulse-blob";
            const sz = Math.round(r.width * (1.05 + blob * 0.32));
            pulse.style.left = cx + "px";
            pulse.style.top = cy + "px";
            pulse.style.width = sz + "px";
            pulse.style.height = sz + "px";
            pulse.style.animationDelay = (blob * 140) + "ms";
            pulse.style.animationDuration = Math.round(dur * 0.9) + "ms";
            vfxMount(pulse);
            setTimeout(() => { try { pulse.remove(); } catch (e) { /* */ } }, dur + 200);
        }

        const infuse = document.createElement("div");
        infuse.className = "df-might-infuse-glow";
        infuse.style.left = cx + "px";
        infuse.style.top = baseY + "px";
        infuse.style.width = Math.round(r.width * 0.95) + "px";
        infuse.style.height = Math.round(r.height * 0.7) + "px";
        infuse.style.animationDuration = Math.round(dur * 0.75) + "ms";
        vfxMount(infuse);
        setTimeout(() => { try { infuse.remove(); } catch (e) { /* */ } }, dur + 80);

        const moteN = fx().nUlt(8);
        for (let i = 0; i < moteN; i++) {
            if (!anim.alive()) break;
            const mote = document.createElement("div");
            mote.className = "df-might-mote";
            const ox = (Math.random() - 0.5) * r.width * 0.8;
            mote.style.left = (cx + ox) + "px";
            mote.style.top = baseY + "px";
            mote.style.setProperty("--lift", (-(45 + Math.random() * 65)) + "px");
            mote.style.setProperty("--drift", ((Math.random() - 0.5) * 22) + "px");
            mote.style.animationDelay = (120 + i * 75) + "ms";
            mote.style.animationDuration = Math.round(dur * 0.72) + "ms";
            vfxMount(mote);
            setTimeout(() => { try { mote.remove(); } catch (e) { /* */ } }, dur + 140);
        }

        await wait(Math.round(dur * 0.58));
        if (!anim.alive()) return;

        const icon = document.createElement("div");
        icon.className = "df-might-icon-reveal";
        icon.innerHTML = '<span class="si-glyph">💪</span>';
        icon.style.left = cx + "px";
        icon.style.top = (r.top - 8) + "px";
        icon.style.animationDuration = Math.round(dur * 0.48) + "ms";
        vfxMount(icon);
        screenFlash(cx, cy, "rgba(255, 220, 120, 0.28)", 0.3, 200);

        await wait(Math.round(dur * 0.42));
        shell.style.opacity = "0";
        inner.style.opacity = "0";
        shell.style.transition = inner.style.transition = "opacity 0.28s ease-out";
        setTimeout(() => {
            try {
                shell.remove();
                inner.remove();
                icon.remove();
                el.classList.remove("ult-might-channel");
            } catch (e) { /* */ }
        }, 300);
    }

    const IMPACT_SCALE = () => (fx().mobile ? 1.05 : 1.35);
    const PROJ_SCALE = () => (fx().mobile ? 0.62 : 0.78);
    const ULT_IMPACT = () => (fx().mobile ? 1.28 : 1.58);
    const ULT_PROJ = () => (fx().mobile ? 0.78 : 0.92);

    async function flyProjectile(sheetId, x1, y1, x2, y2, opts, anim) {
        if (!anim.alive()) return;
        await init();
        const sh = sheets[sheetId];
        if (!sh) return;
        const travelMs = opts.travelMs ?? (fx().mobile ? 420 : 540);
        const scale = opts.scale ?? 0.55;
        const size = Math.round(sh.size * scale);
        const el = makeCanvas(size);
        const ctx = el.getContext("2d");
        const mp1 = vfxMapPoint(x1, y1);
        const mp2 = vfxMapPoint(x2, y2);
        const start = performance.now();
        let lastFrame = -1;
        const easeFn = opts.ease === "in" ? (p) => p * p : smoothstep;
        const trailHue = opts.trailHue ?? 22;
        let lastTrail = 0;

        return new Promise((resolve) => {
            function tick(now) {
                if (!anim.alive()) { el.remove(); resolve(); return; }
                const p = Math.min(1, (now - start) / travelMs);
                const e = easeFn(p);
                const x = mp1.x + (mp2.x - mp1.x) * e;
                let y = mp1.y + (mp2.y - mp1.y) * e;
                if (opts.arc) {
                    const arcH = typeof opts.arc === "number" ? opts.arc : 72;
                    y -= arcH * 4 * e * (1 - e);
                }
                el.style.position = vfxOverlayPos();
                el.style.left = x + "px";
                el.style.top = y + "px";
                const fi = Math.floor(p * sh.frames * 2) % sh.frames;
                if (fi !== lastFrame) {
                    drawFrame(ctx, sheetId, fi, size);
                    lastFrame = fi;
                }
                if (opts.trail && now - lastTrail > 32) {
                    const vx = x1 + (x2 - x1) * e;
                    const vy = y1 + (y2 - y1) * e;
                    spawnTrailParticle(vx, vy, trailHue, 6 + Math.random() * 8, anim);
                    lastTrail = now;
                }
                if (p < 1) requestAnimationFrame(tick);
                else { el.remove(); resolve(); }
            }
            requestAnimationFrame(tick);
        });
    }

    async function flyBeam(sheetId, x1, y1, x2, y2, opts, anim) {
        if (!anim.alive()) return;
        await init();
        const sh = sheets[sheetId];
        if (!sh) return;
        const scale = opts.scale ?? 0.65;
        const size = Math.round(sh.size * scale);
        const el = makeCanvas(size);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const midVx = (x1 + x2) / 2;
        const midVy = (y1 + y2) / 2;
        const mpMid = vfxMapPoint(midVx, midVy);
        el.style.position = vfxOverlayPos();
        el.style.left = mpMid.x + "px";
        el.style.top = mpMid.y + "px";
        el.style.transform = `translate(-50%,-50%) rotate(${ang}deg) scaleX(${len / size})`;
        const ctx = el.getContext("2d");
        const fps = opts.fps ?? 28;
        for (let f = 0; f < sh.frames; f++) {
            if (!anim.alive()) break;
            drawFrame(ctx, sheetId, f, size);
            await wait(1000 / fps);
        }
        el.remove();
    }

    function tremorQuadrant(targetP) {
        const q = document.getElementById(`quadrant-${global.dfQuadrantForPlayer?.(targetP) ?? targetP}`);
        if (!q) return;
        q.classList.remove("ground-tremor");
        void q.offsetWidth;
        q.classList.add("ground-tremor");
        setTimeout(() => q.classList.remove("ground-tremor"), 520);
    }

    function resolveTargetCenter(targetP, targetI) {
        const r = championAnchorRect(targetP, targetI);
        if (r) {
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.46 };
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    function resolveOrigin(casterP, casterFieldIdx, fromTalent) {
        const qId = global.dfQuadrantForPlayer?.(casterP) ?? casterP;
        if (casterFieldIdx != null && casterFieldIdx >= 0) {
            const el = global.getChampionDom?.(casterP, casterFieldIdx);
            if (el) {
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            const vr = global.championVisualRect?.(casterP, casterFieldIdx);
            if (vr) {
                return {
                    x: vr.left + (vr.width || 48) / 2,
                    y: vr.top + (vr.height || 68) / 2,
                };
            }
        }
        if (fromTalent || casterFieldIdx === -1) {
            const spotlight = window.__dfTalentSpotlightEl?.();
            if (spotlight) {
                const r = spotlight.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
        }
        if (fromTalent) {
            const q = document.getElementById(`quadrant-${qId}`);
            const selected = q?.querySelector(".quadrant-hand .ccard.selected, .quadrant-hand .hcard.selected, .quadrant-hand [data-selected='true']");
            if (selected) {
                const r = selected.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            const handCards = q?.querySelectorAll(".quadrant-hand .ccard, .quadrant-hand .hcard, .quadrant-hand .hand-card");
            if (handCards?.length) {
                const mid = handCards[Math.floor(handCards.length / 2)];
                const r = mid.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            const handCard = q?.querySelector(".quadrant-hand .ccard, .quadrant-hand .hcard, .quadrant-hand .hand-card, .quadrant-hand .ai-back");
            if (handCard) {
                const r = handCard.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            const hand = q?.querySelector(".quadrant-hand");
            if (hand) {
                const r = hand.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height * 0.42 };
            }
        }
        const heroQ = document.getElementById(`quadrant-${qId}`);
        const header = window.__dfQuadrantHeader?.(qId);
        const icon = heroQ?.querySelector(".hero-icon") || header?.querySelector(".hero-icon") || header;
        if (icon) {
            const r = icon.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return resolveQuadrantCenter(casterP, fromTalent ? 0.82 : 0.38);
    }

    function resolveFieldSlotCenter(casterP, slotIdx) {
        const el = global.getChampionDom?.(casterP, slotIdx);
        if (el) {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        const vr = global.championVisualRect?.(casterP, slotIdx);
        if (vr) {
            return {
                x: vr.left + (vr.width || 48) / 2,
                y: vr.top + (vr.height || 68) / 2,
            };
        }
        return resolveQuadrantCenter(casterP, 0.48);
    }

    function resolveQuadrantCenter(p, yFrac) {
        const q = document.getElementById(`quadrant-${global.dfQuadrantForPlayer?.(p) ?? p}`);
        if (!q) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const r = q.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * (yFrac ?? 0.4) };
    }

    function buffPulse(targetP, targetI) {
        const el = global.getChampionDom?.(targetP, targetI);
        if (el) {
            el.classList.add("buff-aura");
            setTimeout(() => el.classList.remove("buff-aura"), 1400);
        }
    }

    function resolveHandCenter(p) {
        const q = document.getElementById(`quadrant-${global.dfQuadrantForPlayer?.(p) ?? p}`);
        const hand = q?.querySelector(".quadrant-hand");
        if (hand) {
            const r = hand.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
        }
        return resolveQuadrantCenter(p, 0.88);
    }

    /** Carta mística voando (portal → mão) — verso real via dfAssetUrl (webp no Netlify). */
    async function flyMysticCard(x1, y1, x2, y2, anim, ms) {
        if (!anim.alive()) return;
        const el = document.createElement("div");
        const w = Math.round(cardUnit(0.85));
        const h = Math.round(w * 1.38);
        el.className = "df-sprite-vfx-layer df-mystic-card-fly";
        const p0 = vfxMapPoint(x1, y1);
        const versoUrl = (typeof global.dfAssetUrl === "function")
            ? global.dfAssetUrl("verso.png")
            : "verso.png";
        el.style.cssText =
            `position:${vfxPos()};left:${p0.x}px;top:${p0.y}px;width:${w}px;height:${h}px;` +
            `z-index:${Z + 2};pointer-events:none;transform:translate(-50%,-50%);` +
            "border-radius:8px;border:2px solid #c8d8ff;" +
            `background:#0a0f1c url('${versoUrl}') center/cover no-repeat;` +
            "box-shadow:0 0 24px rgba(200,150,255,0.85),0 0 48px rgba(140,80,255,0.45);";
        vfxMount(el);
        const start = performance.now();
        const dur = ms ?? 680;
        return new Promise((resolve) => {
            function tick(now) {
                if (!anim.alive()) { el.remove(); resolve(); return; }
                const p = Math.min(1, (now - start) / dur);
                const e = smoothstep(p);
                const lift = -50 * Math.sin(Math.PI * e);
                const x = lerp(x1, x2, e);
                const y = lerp(y1, y2, e) + lift;
                el.style.left = x + "px";
                el.style.top = y + "px";
                el.style.transform = `translate(-50%,-50%) rotate(${-12 + e * 24}deg) scale(${0.7 + e * 0.35})`;
                if (p < 1) requestAnimationFrame(tick);
                else {
                    screenFlash(x2, y2, "rgba(200,150,255,0.45)", 0.4, 320);
                    el.remove();
                    resolve();
                }
            }
            requestAnimationFrame(tick);
        });
    }

    async function playDivineGreenBurst(x, y, anim) {
        const scale = fx().mobile ? 1.65 : 2.1;
        const vig = cinematicVignette(
            "background:radial-gradient(ellipse at 50% 60%, rgba(40,255,120,0.45), rgba(0,40,20,0.72))",
            320,
        );
        await playImpactSequence("divine_green", x, y, {
            scale,
            fps: 24,
            ringColor: "rgba(100,255,160,0.95)",
            ringScale: 7,
            sparkHue: 135,
            sparkCount: 18,
            flashColor: "rgba(60,255,140,0.55)",
            flashStrength: 0.6,
        }, anim);
        vig.style.opacity = "0";
        setTimeout(() => vig.remove(), 420);
    }

    async function playHolyPillarResurrect(x, y, anim) {
        const sky = cinematicVignette(
            "background:radial-gradient(ellipse at 50% 70%, rgba(255,230,150,0.55), rgba(40,30,10,0.75))",
            400,
        );
        await playImpactSequence("holy_pillar", x, y, {
            scale: fx().mobile ? 1.75 : 2.2,
            fps: 22,
            ringColor: "rgba(255,240,180,0.95)",
            ringScale: 6.5,
            sparkHue: 48,
            sparkCount: 20,
            flashColor: "rgba(255,245,210,0.65)",
            flashStrength: 0.65,
        }, anim);
        sky.style.opacity = "0";
        setTimeout(() => sky.remove(), 480);
    }

    function resolveDeckOrigin(casterP) {
        const humanSeat = global.dfHumanSeat?.() ?? 0;
        const isHuman = casterP === humanSeat;
        const candidates = isHuman
            ? ["#bottom-bar #deck-pile", "#deck-pile"]
            : ["#deck-pile-ai", "#top-bar #deck-pile-ai"];
        for (const sel of candidates) {
            const deckEl = document.querySelector(sel);
            if (!deckEl) continue;
            const r = deckEl.getBoundingClientRect();
            if (r.width > 1 && r.height > 1) {
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
        }
        return resolveQuadrantCenter(casterP, isHuman ? 0.88 : 0.12);
    }

    async function playFireball(opts) {
        const anim = beginAnim();
        if (!anim.alive()) return false;
        await init();
        const to = (opts.toX != null && opts.toY != null)
            ? { x: opts.toX, y: opts.toY }
            : resolveTargetCenter(opts.targetP, opts.targetI);
        if (to?.x == null || to?.y == null) return false;
        const fromTalent = !!opts.fromTalent;
        const casterField = opts.casterField ?? opts.casterFieldIdx ?? -1;
        let from;
        let handOrigin = false;
        let fieldOrigin = false;
        let deckOrigin = false;

        if (opts.fromX != null && opts.fromY != null) {
            from = { x: opts.fromX, y: opts.fromY };
            handOrigin = fromTalent || !!(opts.originOverride);
            fieldOrigin = !handOrigin && casterField >= 0;
        } else if (opts.originOverride?.x != null && opts.originOverride?.y != null) {
            from = opts.originOverride;
            handOrigin = true;
        } else if (fromTalent) {
            from = resolveOrigin(opts.casterP, -1, true);
            handOrigin = true;
        } else if (casterField >= 0) {
            from = resolveOrigin(opts.casterP, casterField, false);
            fieldOrigin = true;
        } else {
            from = resolveDeckOrigin(opts.casterP);
            deckOrigin = true;
        }
        if (from?.x == null || from?.y == null) return false;
        try { global.window?.sfx?.("fireball"); } catch (e) {}

        const pixi = global.DfPixiVfx;
        const sceneBusy = !!(pixi?.isAnySceneActive?.() || pixi?.isCombatSceneActive?.());
        const wantsGpu = !sceneBusy && (
            global.DfVfxEngine?.wantsGpuPresentation?.()
            || global.DfVfxEngine?.wantsCinematic?.()
            || pixi?.canUse?.()
        );
        if (wantsGpu && pixi?.playFireballScene) {
            try {
                const ok = await pixi.playFireballScene({
                    fromX: from.x,
                    fromY: from.y,
                    toX: to.x,
                    toY: to.y,
                    fromTalent,
                    handOrigin,
                    fieldOrigin,
                    deckOrigin,
                    cinematic: true,
                    onImpact: () => tremorQuadrant(opts.targetP),
                });
                if (ok) return true;
            } catch (ePixi) {
                console.warn("[DF] playFireballScene falhou", ePixi);
            }
        }

        // Fallback DOM obrigatório (cena Pixi ocupada/abort).
        const charge = document.createElement("div");
        charge.className = "df-fireball-charge";
        vfxPlace(charge, from.x, from.y);
        await wait(fx().mobile ? 160 : 220);
        charge.remove();

        await flyProjectile("fire_proj", from.x, from.y, to.x, to.y, {
            travelMs: fx().mobile ? 440 : 520,
            scale: PROJ_SCALE() * (fx().mobile ? 1.38 : 1.52),
            trail: true,
            trailHue: 18,
            arc: fx().mobile ? 48 : 64,
        }, anim);

        domBigBoom(to.x, to.y, 980);
        screenFlash(to.x, to.y, "rgba(255,160,60,0.78)", 0.68, 380);
        spawnRingBurst(to.x, to.y, "rgba(255,120,40,0.95)", 14, anim);
        await playSheetAt("fire_impact", to.x, to.y, {
            scale: IMPACT_SCALE() * (fx().mobile ? 1.32 : 1.55),
            fps: 30,
            blend: "screen",
        }, anim);
        tremorQuadrant(opts.targetP);
        await wait(fx().mobile ? 70 : 100);
        return true;
    }

    async function playToxicSmoke(opts) {
        const anim = beginAnim();
        if (!anim.alive()) return;
        const casterP = opts.casterP;
        const picks = opts.picks || [];
        const casterEl = global.getChampionDom?.(casterP, opts.casterFieldIdx ?? 0);
        const cr = casterEl
            ? casterEl.getBoundingClientRect()
            : resolveQuadrantCenter(casterP, 0.42);
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        try { global.window?.sfx?.("poison"); } catch (e) {}

        const wash = overlay("df-toxic-wash",
            "background:radial-gradient(circle at 50% 45%, rgba(90,220,80,0.32), rgba(40,10,60,0.55));" +
            "opacity:0;transition:opacity 280ms ease-out;mix-blend-mode:screen;");
        requestAnimationFrame(() => { wash.style.opacity = "1"; });

        const core = document.createElement("div");
        core.className = "fumaca-toxic-cloud fumaca-toxic-core";
        core.style.left = cx + "px";
        core.style.top = cy + "px";
        core.style.width = (fx().mobile ? 140 : 180) + "px";
        core.style.height = core.style.width;
        vfxMount(core);
        setTimeout(() => core.remove(), 1600);

        for (const { p, i } of picks) {
            if (!anim.alive()) break;
            const el = global.getChampionDom?.(p, i);
            if (!el) continue;
            const tr = el.getBoundingClientRect();
            const tx = tr.left + tr.width / 2;
            const ty = tr.top + tr.height / 2;
            const dx = tx - cx;
            const dy = ty - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const rot = Math.atan2(dy, dx) * 180 / Math.PI;
            const beam = document.createElement("div");
            beam.className = "df-toxic-beam";
            beam.style.left = cx + "px";
            beam.style.top = cy + "px";
            beam.style.width = dist + "px";
            beam.style.setProperty("--rot", rot + "deg");
            vfxMount(beam);
            setTimeout(() => beam.remove(), 1100);
            const cloud = document.createElement("div");
            cloud.className = "fumaca-toxic-cloud";
            cloud.style.left = tx + "px";
            cloud.style.top = ty + "px";
            cloud.style.width = (fx().mobile ? 130 : 170) + "px";
            cloud.style.height = cloud.style.width;
            vfxMount(cloud);
            setTimeout(() => cloud.remove(), 1500);
            screenFlash(tx, ty, "rgba(120,255,90,0.38)", 0.32, 240);
            spawnRingBurst(tx, ty, "rgba(100,220,80,0.85)", 7, anim);
            el.classList.add("poison-flash");
            setTimeout(() => el.classList.remove("poison-flash"), 1200);
        }

        wash.style.opacity = "0";
        setTimeout(() => wash.remove(), 360);
        await wait(fx().mobile ? 900 : 1100);
    }

    async function spawnWarSwordClash(anim, recipe) {
        if (!anim.alive()) return;
        const cx = global.innerWidth / 2;
        const cy = global.innerHeight * 0.42;
        const clash = document.createElement("div");
        clash.className = "df-war-sword-clash";
        clash.style.left = cx + "px";
        clash.style.top = cy + "px";
        vfxMount(clash);
        screenFlash(cx, cy, recipe?.flashColor ?? "rgba(255,80,50,0.55)", 0.48, 300);
        try { global.window?.sfx?.("combat_clash"); } catch (e) { /* */ }
        await waitAnimEnd(clash, fx().mobile ? 720 : 880);
        clash.remove();
    }

    function spawnWarPurpleImpact(x, y, anim, recipe) {
        if (!anim.alive()) return;
        const burst = document.createElement("div");
        burst.className = "df-war-purple-burst";
        burst.style.left = x + "px";
        burst.style.top = y + "px";
        vfxMount(burst);
        setTimeout(() => burst.remove(), 920);
        spawnRingBurst(x, y, "rgba(160,90,255,0.9)", 8.5, anim);
        screenFlash(x, y, "rgba(140,70,255,0.42)", 0.34, 220);
    }

    async function spawnWarPurpleImpactAndSmoke(targetP, targetI, anim, recipe) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        const c = el
            ? (() => {
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            })()
            : resolveTargetCenter(targetP, targetI);
        spawnWarPurpleImpact(c.x, c.y, anim, recipe);
        if (el) {
            el.classList.add("ult-war-impact");
            setTimeout(() => el.classList.remove("ult-war-impact"), 780);
        }
        const fr = el?.getBoundingClientRect();
        if (fr) {
            const host = document.createElement("div");
            host.className = "df-war-purple-smoke-host";
            host.style.cssText =
                `left:${fr.left}px;top:${fr.top}px;width:${fr.width}px;height:${fr.height}px;`;
            const puffN = fx().mobile ? 10 : 14;
            for (let i = 0; i < puffN; i++) {
                const puff = document.createElement("div");
                puff.className = "df-war-purple-smoke-puff";
                const ang = (i / puffN) * Math.PI * 2 + Math.random() * 0.5;
                const dist = 18 + Math.random() * 42;
                const size = 48 + Math.random() * 72;
                puff.style.left = (fr.width / 2 + Math.cos(ang) * 12) + "px";
                puff.style.top = (fr.height / 2 + Math.sin(ang) * 10) + "px";
                puff.style.width = size + "px";
                puff.style.height = size + "px";
                puff.style.setProperty("--dx", (Math.cos(ang) * dist) + "px");
                puff.style.setProperty("--dy", (-50 - Math.random() * 70) + "px");
                puff.style.setProperty("--sc", (1.8 + Math.random() * 1.2).toFixed(2));
                puff.style.setProperty("--dur", (0.85 + Math.random() * 0.45) + "s");
                puff.style.animationDelay = (i * 28) + "ms";
                host.appendChild(puff);
            }
            vfxMount(host);
            setTimeout(() => { try { host.remove(); } catch (e) { /* */ } }, 1100);
        }
        await wait(fx().mobile ? 620 : 760);
    }

    function spawnHookSnagBurst(x, y, anim) {
        if (!anim.alive()) return;
        const burst = document.createElement("div");
        burst.className = "df-hook-snag-burst";
        burst.style.left = x + "px";
        burst.style.top = y + "px";
        vfxMount(burst);
        setTimeout(() => { try { burst.remove(); } catch (e) { /* */ } }, 820);
        const hues = ["rgba(255, 230, 150, 0.62)", "rgba(255, 170, 50, 0.42)"];
        hues.forEach((col, i) => {
            const blob = document.createElement("div");
            const sz = Math.round(cardUnit(1.35 + i * 0.5));
            blob.className = "df-explosion-blob";
            blob.style.left = x + "px";
            blob.style.top = y + "px";
            blob.style.width = sz + "px";
            blob.style.height = sz + "px";
            blob.style.background = `radial-gradient(circle, ${col} 0%, transparent 72%)`;
            blob.style.animationDelay = (i * 40) + "ms";
            vfxMount(blob);
            setTimeout(() => blob.remove(), 760);
        });
    }

    async function animateHookPullChampion(casterP, targetP, targetI, anim, recipe, opts = {}) {
        if (!anim.alive()) return;
        const el = global.getChampionDom?.(targetP, targetI);
        if (!el) { await wait(600); return; }
        const fromR = el.getBoundingClientRect();
        const from = resolveHandCenter(casterP);
        const dest = opts?.destSlot != null
            ? resolveFieldSlotCenter(casterP, opts.destSlot)
            : resolveQuadrantCenter(casterP, 0.52);
        const tcx = fromR.left + fromR.width / 2;
        const tcy = fromR.top + fromR.height / 2;

        // GANCHO (Puxão) — versão Pixi+GSAP: o gancho/corrente voa, finca no
        // alvo e o PUXA fluidamente para o campo. A carta DOM é movida em
        // sincronia com a corrente (onPull). Fallback DOM logo abaixo.
        const gpuHook = global.DfVfxEngine?.wantsGpuPresentation?.()
            && typeof global.DfPixiVfx?.playHookPullScene === "function";
        if (gpuHook) {
            const w = fromR.width; const h = fromR.height;
            const hookOrigParent = el.parentNode;
            const hookOrigNext = el.nextSibling;
            let snagged = false;
            const placeCard = (vx, vy) => {
                el.style.left = (vx - w / 2) + "px";
                el.style.top = (vy - h / 2) + "px";
            };
            const onSnag = () => {
                if (snagged) return; snagged = true;
                try { global.window?.sfx?.("hook_pull"); } catch (e) { /* */ }
                screenFlash(tcx, tcy, recipe?.flashColor ?? "rgba(255,200,90,0.48)", 0.46, 300);
                try { global.document.body.appendChild(el); } catch (e) { /* */ }
                el.classList.add("hook-pulled-active", "hook-impact-shake");
                el.style.position = "fixed";
                el.style.left = fromR.left + "px";
                el.style.top = fromR.top + "px";
                el.style.width = w + "px";
                el.style.height = h + "px";
                el.style.margin = "0";
                el.style.overflow = "visible";
                el.style.pointerEvents = "none";
                el.style.zIndex = "100120";
                setTimeout(() => el.classList.remove("hook-impact-shake"), 420);
            };
            const ran = await global.DfPixiVfx.playHookPullScene({
                fromX: from.x, fromY: from.y, toX: tcx, toY: tcy,
                destX: dest.x, destY: dest.y, cinematic: true,
                onSnag,
                onPull: (t) => {
                    if (!snagged) onSnag();
                    placeCard(tcx + (dest.x - tcx) * t, tcy + (dest.y - tcy) * t);
                },
            });
            if (ran) {
                el.classList.remove("hook-pulled-active", "df-hook-yank-card");
                el.classList.add("combat-src-hidden");
                el.style.visibility = "hidden";
                el.style.opacity = "0";
                ["position", "left", "top", "width", "height", "margin", "overflow", "zIndex",
                 "pointerEvents", "transform"].forEach((p) => el.style.removeProperty(p));
                if (hookOrigParent) {
                    try { hookOrigParent.insertBefore(el, hookOrigNext); }
                    catch (e) { try { hookOrigParent.appendChild(el); } catch (e2) { /* */ } }
                }
                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                return;
            }
            // GPU falhou — desfaz qualquer reparent e cai no fallback DOM.
            try {
                el.classList.remove("hook-pulled-active");
                ["position", "left", "top", "width", "height", "margin", "overflow", "zIndex", "pointerEvents", "transform"].forEach((p) => el.style.removeProperty(p));
                if (hookOrigParent && el.parentNode === global.document.body) hookOrigParent.insertBefore(el, hookOrigNext);
            } catch (e) { /* */ }
        }

        const travelMs = fx().mobile ? 460 : 580;
        const yankMs = fx().mobile ? 720 : 880;
        const arcLift = -Math.min(120, Math.max(60, Math.abs(tcy - from.y) * 0.22));

        const hook = document.createElement("div");
        hook.className = "df-hook-emoji-fly";
        hook.textContent = "🪝";
        hook.style.left = from.x + "px";
        hook.style.top = from.y + "px";
        hook.style.setProperty("--dx", (tcx - from.x) + "px");
        hook.style.setProperty("--dy", (tcy - from.y) + "px");
        hook.style.setProperty("--arc", arcLift + "px");
        hook.style.setProperty("--fly-ms", travelMs + "ms");
        vfxMount(hook);
        await waitAnimEnd(hook, travelMs);
        hook.remove();

        spawnHookSnagBurst(tcx, tcy, anim);
        screenFlash(tcx, tcy, recipe?.flashColor ?? "rgba(255,200,90,0.48)", 0.46, 300);
        el.classList.add("hook-impact-shake");
        setTimeout(() => el.classList.remove("hook-impact-shake"), 420);
        await wait(fx().mobile ? 80 : 120);
        if (!anim.alive()) return;

        const glow = document.createElement("div");
        glow.className = "df-hook-pull-glow";
        vfxSetPoint(glow, tcx, tcy);
        setTimeout(() => { try { glow.remove(); } catch (e) { /* */ } }, 900);

        const pullDx = dest.x - tcx;
        const pullDy = dest.y - tcy;
        // A carta roubada aparecia "cortada" porque position:fixed dentro do
        // #df-scale-root (que tem transform/overflow) ficava ancorado/clipado
        // ao tabuleiro, não ao viewport. Reparentamos a carta para o <body>
        // durante o puxão (coords já são de viewport) e restauramos depois.
        const hookOrigParent = el.parentNode;
        const hookOrigNext = el.nextSibling;
        try { global.document.body.appendChild(el); } catch (e) { /* */ }
        el.classList.add("hook-pulled-active");
        el.style.position = "fixed";
        el.style.left = fromR.left + "px";
        el.style.top = fromR.top + "px";
        el.style.width = fromR.width + "px";
        el.style.height = fromR.height + "px";
        el.style.margin = "0";
        el.style.overflow = "visible";
        el.style.pointerEvents = "none";
        el.style.setProperty("--pull-dx", pullDx + "px");
        el.style.setProperty("--pull-dy", pullDy + "px");
        el.style.setProperty("--yank-ms", yankMs + "ms");
        el.classList.add("df-hook-yank-card");
        try { global.window?.sfx?.("hook_pull"); } catch (e) { /* */ }

        await waitAnimEnd(el, yankMs);
        el.classList.remove("hook-pulled-active", "df-hook-yank-card");
        el.classList.add("combat-src-hidden");
        el.style.visibility = "hidden";
        el.style.opacity = "0";
        ["position", "left", "top", "width", "height", "margin", "overflow", "zIndex", "pointerEvents",
         "--pull-dx", "--pull-dy", "--yank-ms", "transform"].forEach((p) => el.style.removeProperty(p));
        // Restaura o nó à posição original do DOM para o próximo updateUI reconciliar.
        if (hookOrigParent) {
            try { hookOrigParent.insertBefore(el, hookOrigNext); }
            catch (e) { try { hookOrigParent.appendChild(el); } catch (e2) { /* */ } }
        }
    }

    async function playFortify(opts) {
        const anim = beginAnim();
        if (!anim.alive()) return false;
        await init();
        if (opts.premium !== false && !opts.fromTalent) {
            // Ultimate / habilidade de campeão: cena Pixi completa.
            const r = await global.DfUltimateDirector?.play("targetAlly", opts);
            return r !== false;
        }
        try { global.window?.sfx?.("buff_power"); } catch (e) {}
        await playFortifyBuffVfx(opts.targetP, opts.targetI, anim, {
            windup: fx().mobile ? 500 : 640,
            impact: fx().mobile ? 740 : 900,
            targetAnchor: opts.targetAnchor || null,
        });
        if (!anim.alive()) return false;
        buffPulse(opts.targetP, opts.targetI);
        await wait(100);
        return true;
    }

    function domSky(className) {
        const el = document.createElement("div");
        el.className = className;
        // Céus de ultimate (.ult-sky*) escurecem a TELA TODA → body fixo,
        // nunca dentro do #df-scale-root (que só cobre o meio).
        vfxFullscreenMount(el);
        return el;
    }

    function domBigBoom(cx, cy, removeMs = 720) {
        const boomSize = Math.round(cardUnit(4.5));
        const boom = document.createElement("div");
        boom.className = "ult-bigBoom";
        boom.style.width = boomSize + "px";
        boom.style.height = boomSize + "px";
        vfxPlace(boom, cx, cy);
        setTimeout(() => boom.remove(), removeMs);
        return boom;
    }

    function domEmberBurst(cx, cy, count, anim) {
        for (let i = 0; i < count; i++) {
            if (!anim.alive()) break;
            const e = document.createElement("div");
            e.className = "ult-ember";
            e.textContent = "✨";
            e.style.left = cx + "px";
            e.style.top = cy + "px";
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 60 + Math.random() * 100;
            e.style.setProperty("--px", Math.cos(ang) * dist + "px");
            e.style.setProperty("--py", Math.sin(ang) * dist + "px");
            vfxMount(e);
            setTimeout(() => e.remove(), 1400);
        }
    }

    async function playBombUltimate(opts) {
        void global.DfVfxEngine?.ensureCinematicReady?.({ maxMs: 1200 });
        return global.DfUltimateDirector?.play("targetEnemy", opts);
    }

    async function playCurseSea(handRects) {
        const anim = beginAnim();
        if (!anim.alive()) return;
        await init();
        try { global.window?.sfx?.("maldicao"); } catch (e) {}

        const tint = cinematicVignette(
            "background:linear-gradient(180deg,rgba(20,100,160,0.45),rgba(5,20,45,0.82))",
            320,
        );

        for (const { r } of handRects) {
            if (!anim.alive()) break;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const scale = Math.max(0.85, Math.min(1.35, (r.width + 50) / 200));
            await playImpactSequence("sea_curse", cx, cy, {
                scale: scale * 1.15,
                fps: 22,
                ringColor: "rgba(80,220,255,0.9)",
                ringScale: 5,
                sparkHue: 195,
                sparkCount: 12,
                flashColor: "rgba(100,220,255,0.35)",
                secondPass: false,
            }, anim);
        }

        tint.style.opacity = "0";
        setTimeout(() => tint.remove(), 400);
        await wait(100);
    }

    async function playUltimateLegacy(type, opts = {}) {
        if (!global.DfUltimateDirector?.isReady?.()) {
            wireUltimateDirector();
            global.DfUltimateDirector?.ensureInstalled?.();
        }
        if (global.DfUltimateDirector?.play) {
            return global.DfUltimateDirector.play(type, opts);
        }
        console.warn("[DfSpriteVfx] DfUltimateDirector ausente:", type);
    }

    async function playUltimate(type, opts = {}) {
        return playUltimateLegacy(type, opts);
    }

    async function preloadAll() {
        await init();
        await preloadPoisonSlimePngs();
    }

    /** Exporta sheets canvas (ferramenta de build — não usado em runtime). */
    async function exportBakedPackSheets() {
        await init();
        const list = [];
        for (const [id, sh] of Object.entries(sheets)) {
            if (!sh.canvas) continue;
            list.push({
                id,
                frames: sh.frames,
                size: sh.size,
                dataUrl: sh.canvas.toDataURL("image/png"),
            });
        }
        return list;
    }

    function wireUltimateDirector() {
        if (!global.DfUltimateDirector) return;
        global.DfUltimateDirector.install({
            init,
            wait,
            beginAnim,
            fx,
            cardUnit,
            Z,
            resolveTargetCenter,
            resolveOrigin,
            resolveQuadrantCenter,
            resolveHandCenter,
            playSheetAt,
            playImpactSequence,
            flyProjectile,
            flyBeam,
            flyFallingBomb,
            playBombExplosionAt,
            flyBlueDragonMeteor,
            spawnBlueDragonMeteorImpact,
            spawnCubicDragonHatch,
            flyPoisonAcidRay,
            spawnAcidExplosion,
            flyPoisonSlimeBlob,
            spawnPoisonSlimeBurst,
            flyPoisonSlimePngSequence,
            spawnPoisonSlimePngImpact,
            playPoisonSlimePng,
            spawnBastionLightPillar,
            spawnBastionShieldDome,
            spawnBanishPortal,
            spawnBanishVortex,
            applyBanishPortalSuck,
            flySkyMeteor,
            spawnMeteorGroundHit,
            spawnAllyWallShield,
            spawnFallingWallStone,
            freezeEncaseChampion,
            spawnFortifyLightPillar,
            spawnFortifyAuraFromChampion,
            playFortifyBuffVfx,
            flyInvestidaAxe,
            spawnInvestidaFireImpact,
            spawnPoisonSlimeCoat,
            spawnMightDivineAuraFromChampion,
            spawnInvestidaFireFromChampion,
            spawnVampBloodStream,
            resolveFieldSlotCenter,
            spawnLightningStrike,
            playHeroUltimateGlow,
            flyAlchemistPotion,
            flyFallingPotion,
            playPotionHitReaction,
            spawnRingBurst,
            spawnSparkBurst,
            screenFlash,
            cinematicVignette,
            overlay,
            domSky,
            domBigBoom,
            domEmberBurst,
            tremorQuadrant,
            buffPulse,
            playFireball,
            playHolyPillarResurrect,
            playDivineGreenBurst,
            flyMysticCard,
            playToxicSmoke,
            spawnWarSwordClash,
            spawnWarPurpleImpact,
            spawnWarPurpleImpactAndSmoke,
            animateHookPullChampion,
            ULT_IMPACT,
            ULT_PROJ,
            IMPACT_SCALE,
            PROJ_SCALE,
        });
    }
    wireUltimateDirector();

    async function getBakedSheet(sheetId) {
        await init();
        const sh = sheets[sheetId];
        if (!sh?.canvas) return null;
        return { canvas: sh.canvas, frames: sh.frames, size: sh.size };
    }

    global.DfSpriteVfx = {
        VFX_ENGINE,
        purgeUltimateVfx: () => global.DfUltimateDirector?.purgeUltimateVfx?.(),
        init,
        preloadAll,
        getBakedSheet,
        exportBakedPackSheets,
        beginAnim,
        playFortifyBuffVfx,
        playFireball,
        playToxicSmoke,
        playFortify,
        playBombUltimate,
        playCurseSea,
        playUltimate,
        playPoisonSlimePng,
        preloadPoisonSlimePngs,
        spawnLightningStrike,
        playHeroUltimateGlow,
        playFuryBurst,
        flyAlchemistPotion,
        playPotionHitReaction,
        playUltimateLegacy,
        _playUltimateLegacy: playUltimateLegacy,
        _resolveTargetCenter: resolveTargetCenter,
        _resolveOrigin: resolveOrigin,
        _resolveQuadrantCenter: resolveQuadrantCenter,
        _resolveHandCenter: resolveHandCenter,
        _cinematicVignette: cinematicVignette,
        _playSheetAt: playSheetAt,
        _playImpactSequence: playImpactSequence,
        _flyProjectile: flyProjectile,
        _flyBeam: flyBeam,
        _flyMysticCard: flyMysticCard,
        _tremorQuadrant: tremorQuadrant,
        _buffPulse: buffPulse,
        configure(hooks) {
            if (!hooks) return;
            if (hooks.getChampionDom) global.getChampionDom = hooks.getChampionDom;
            if (hooks.championVisualRect) global.championVisualRect = hooks.championVisualRect;
            if (hooks.quadrantForPlayer) global.dfQuadrantForPlayer = hooks.quadrantForPlayer;
            if (hooks.humanSeat) global.dfHumanSeat = hooks.humanSeat;
            if (hooks.matchAlive) global.__dfMatchAlive = hooks.matchAlive;
            if (hooks.vfxBase) global.__dfVfxBase = hooks.vfxBase;
            else resolveVfxBase();
        },
        wireUltimateDirector,
    };
})(typeof window !== "undefined" ? window : globalThis);