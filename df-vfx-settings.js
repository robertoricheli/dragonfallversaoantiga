/**
 * Dragonfall — preferências de qualidade visual (Fase 3).
 * Persistência: localStorage dragonfall:vfx
 * Modos: auto | full | lite | mobile (Mínimo)
 */
(function (global) {
    "use strict";

    const STORAGE_KEY = "dragonfall:vfx";
    const VALID = new Set(["auto", "full", "lite", "mobile"]);
    const DEFAULTS = { qualityMode: "auto" };
    /** @type {{ qualityMode: "auto"|"full"|"lite"|"mobile" }} */
    const state = Object.assign({}, DEFAULTS);

    try {
        const saved = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null");
        if (saved?.qualityMode && VALID.has(saved.qualityMode)) {
            state.qualityMode = saved.qualityMode;
        }
    } catch (e) { /* */ }

    const FACTORS = {
        full: { factor: 1, ultFactor: 0.72, liteVfx: false },
        lite: { factor: 0.72, ultFactor: 0.55, liteVfx: true },
        mobile: { factor: 0.3, ultFactor: 0.32, liteVfx: true },
    };

    const QUALITY_LABELS = {
        full: "Completo (Pixi + GPU)",
        lite: "Leve",
        mobile: "Mínimo",
        auto: "Automático",
    };

    const PREVIEW_BASE_FX = Object.freeze({
        mobile: false,
        lowEnd: false,
        reduced: false,
        medium: false,
        liteVfx: false,
        factor: 1,
        ultFactor: 0.72,
    });

    let previewRaf = 0;
    let previewRunning = false;
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, hue: number }[]} */
    let previewParticles = [];
    let previewCtx = null;
    let previewCanvas = null;
    let previewObs = null;

    function detectAuto(fx) {
        if (!fx) return "full";
        // Só reduced-motion desliga GPU no Automático. perfTier low/medium
        // reduz partículas/DPR via FX.factor + hints — NUNCA mata Pixi/GSAP
        // (senão as animações “não aparecem” / travam no 1º frame).
        if (fx.reduced) return "lite";
        return "full";
    }

    function getMode() {
        return state.qualityMode;
    }

    function getEffectiveQuality(fx) {
        if (state.qualityMode === "auto") return detectAuto(fx || previewFxRef());
        if (state.qualityMode === "lite") return "lite";
        if (state.qualityMode === "mobile") return "mobile";
        return "full";
    }

    function previewFxRef() {
        return global.__dfFX || PREVIEW_BASE_FX;
    }

    function particleBudget(q) {
        const f = FACTORS[q] || FACTORS.full;
        return Math.max(4, Math.round(36 * f.factor));
    }

    function save() {
        try { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* */ }
    }

    function setMode(mode) {
        const next = VALID.has(mode) ? mode : "auto";
        state.qualityMode = next;
        save();
        const fx = global.__dfFX;
        if (fx) applyToFx(fx);
        if (typeof global.__dfOnVfxQualityChange === "function") {
            global.__dfOnVfxQualityChange(getEffectiveQuality(fx));
        }
        try { refreshPreview(); } catch (e) { /* */ }
        return state.qualityMode;
    }

    /** Aplica override de qualidade no objeto FX do jogo. */
    function applyToFx(fx) {
        if (!fx) return fx;
        const q = getEffectiveQuality(fx);
        if (!fx._baseFactor) {
            fx._baseFactor = fx.factor;
            fx._baseUltFactor = fx.ultFactor;
            fx._baseLiteVfx = fx.liteVfx;
        }

        fx.vfxQuality = q;
        fx.vfxQualityMode = state.qualityMode;

        if (state.qualityMode === "auto" && q === "full") {
            // Conserva orçamento do dispositivo (particleFactor / lowEnd).
            fx.liteVfx = !!fx.reduced;
            fx.factor = fx._baseFactor;
            fx.ultFactor = fx._baseUltFactor;
        } else {
            const f = FACTORS[q] || FACTORS.full;
            fx.liteVfx = f.liteVfx;
            fx.factor = f.factor;
            fx.ultFactor = f.ultFactor;
        }

        global.__dfVfxQuality = q;
        try { global.DfVfxRuntime?.install?.(fx); } catch (e) { /* */ }
        try { global.DfVfxEngine?.setTier?.(q); } catch (e) { /* */ }
        return fx;
    }

    function spawnPreviewBurst() {
        const q = getEffectiveQuality(previewFxRef());
        const budget = particleBudget(q);
        const w = previewCanvas?.width || 320;
        const h = previewCanvas?.height || 72;
        const cx = w * 0.5;
        const cy = h * 0.52;
        previewParticles = [];
        for (let i = 0; i < budget; i++) {
            const ang = (Math.PI * 2 * i) / budget + (Math.random() - 0.5) * 0.35;
            const spd = 0.55 + Math.random() * (q === "mobile" ? 0.9 : 1.6);
            previewParticles.push({
                x: cx + (Math.random() - 0.5) * 8,
                y: cy + (Math.random() - 0.5) * 6,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 0.25,
                life: 1,
                hue: 95 + Math.random() * 40,
            });
        }
    }

    function refreshPreviewLabel() {
        if (typeof document?.getElementById !== "function") return;
        const label = document.getElementById("opt-vfx-preview-label");
        if (!label) return;
        const eff = getEffectiveQuality(previewFxRef());
        const budget = particleBudget(eff);
        const effName = QUALITY_LABELS[eff] || eff;
        if (state.qualityMode === "auto") {
            label.textContent = "Automático → " + effName + " · ~" + budget + " partículas";
        } else {
            label.textContent = (QUALITY_LABELS[state.qualityMode] || state.qualityMode) + " · ~" + budget + " partículas";
        }
    }

    function drawPreviewFrame() {
        if (!previewCtx || !previewCanvas) return;
        const w = previewCanvas.width;
        const h = previewCanvas.height;
        previewCtx.clearRect(0, 0, w, h);
        previewCtx.fillStyle = "rgba(8, 14, 10, 0.35)";
        previewCtx.fillRect(0, 0, w, h);

        let alive = 0;
        for (const p of previewParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.018;
            p.life -= 0.014;
            if (p.life <= 0) continue;
            alive++;
            const alpha = Math.min(1, p.life * 1.35);
            previewCtx.beginPath();
            previewCtx.fillStyle = "hsla(" + p.hue + ", 72%, 62%, " + alpha + ")";
            previewCtx.arc(p.x, p.y, 2 + alpha * 2.2, 0, Math.PI * 2);
            previewCtx.fill();
        }
        if (alive === 0) spawnPreviewBurst();
    }

    function previewLoop() {
        if (!previewRunning) return;
        drawPreviewFrame();
        previewRaf = global.requestAnimationFrame(previewLoop);
    }

    function refreshPreview() {
        refreshPreviewLabel();
        if (previewRunning) spawnPreviewBurst();
    }

    function startPreview() {
        if (typeof document?.getElementById !== "function") return;
        previewCanvas = document.getElementById("opt-vfx-preview-canvas");
        if (!previewCanvas || typeof previewCanvas.getContext !== "function") return;
        previewCtx = previewCanvas.getContext("2d");
        if (!previewCtx) return;
        if (previewRunning) {
            refreshPreview();
            return;
        }
        previewRunning = true;
        spawnPreviewBurst();
        previewLoop();
    }

    function stopPreview() {
        previewRunning = false;
        if (previewRaf) {
            global.cancelAnimationFrame(previewRaf);
            previewRaf = 0;
        }
        previewParticles = [];
        if (previewCtx && previewCanvas) {
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        }
    }

    function wirePreviewVisibility() {
        if (typeof document?.getElementById !== "function") return;
        const opcoes = document.getElementById("opcoes");
        if (!opcoes || previewObs) return;
        previewObs = new MutationObserver(() => {
            if (opcoes.classList.contains("active")) startPreview();
            else stopPreview();
        });
        previewObs.observe(opcoes, { attributes: true, attributeFilter: ["class"] });
        if (opcoes.classList.contains("active")) startPreview();
    }

    function wireOptionsUI() {
        const fx = global.__dfFX;
        if (fx) applyToFx(fx);
        try { wirePreviewVisibility(); } catch (e) { /* */ }
        if (typeof document?.querySelectorAll === "function") {
            document.querySelectorAll("[data-df-vfx-mode]").forEach((el) => {
                if (el.__dfVfxWired) return;
                el.__dfVfxWired = true;
                el.addEventListener("click", () => {
                    const mode = el.getAttribute("data-df-vfx-mode");
                    setMode(mode);
                    document.querySelectorAll("[data-df-vfx-mode]").forEach((b) => {
                        b.classList.toggle("active", b.getAttribute("data-df-vfx-mode") === state.qualityMode);
                    });
                });
                el.classList.toggle("active", el.getAttribute("data-df-vfx-mode") === state.qualityMode);
            });
        }
        refreshPreviewLabel();
        return true;
    }

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", wireOptionsUI);
        } else {
            wireOptionsUI();
        }
    }

    global.DfVfxSettings = {
        getMode,
        setMode,
        getEffectiveQuality,
        applyToFx,
        detectAuto,
        wireOptionsUI,
        startPreview,
        stopPreview,
        refreshPreview,
    };
})(typeof window !== "undefined" ? window : globalThis);
