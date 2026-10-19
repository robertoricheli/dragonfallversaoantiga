/**
 * Dragonfall — motor VFX unificado (GSAP + Pixi).
 * Ponto único para animações cinematográficas (ultimates, combate, destruição…).
 * Novas animações devem usar DfVfxEngine / DfPixiVfx — não DOM/CSS legacy.
 */
(function (global) {
    "use strict";

    const LOCAL_GSAP = "js/vendor/gsap.min.js";
    const CDN_GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js";
    const CINEMATIC_READY_MS = 400;
    const CINEMATIC_FULL_MS = 18000;

    function waitMs(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function adaptiveCinematicRaceMs() {
        try {
            if (global.DfLazyLoad?.isSlowNetwork?.()) return 6000;
        } catch (e) { /* */ }
        return CINEMATIC_READY_MS;
    }

    function raceCinematicReady(promise, maxMs) {
        const cap = typeof maxMs === "number" ? maxMs : CINEMATIC_READY_MS;
        return Promise.race([
            promise,
            waitMs(cap).then(() => false),
        ]);
    }

    /** @type {"full"|"lite"|"mobile"} */
    let tier = "full";
    let initPromise = null;

    function assetUrl(rel) {
        if (typeof global.dfAssetUrl === "function") return global.dfAssetUrl(rel);
        const v = encodeURIComponent(global.__DF_GAME_V || "dev");
        return rel + (rel.includes("?") ? "&" : "?") + "v=" + v;
    }

    function prefersReduced() {
        try {
            return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Apresentação GPU (Pixi+GSAP)? Paridade mobile/tablet/desktop no modo Automático.
     * Só desliga se jogador escolheu Leve/Mínimo ou prefers-reduced-motion.
     */
    function wantsGpuPresentation() {
        const mode = global.DfVfxSettings?.getMode?.() ?? "auto";
        if (mode === "lite" || mode === "mobile") return false;
        if (prefersReduced()) return false;
        return true;
    }

    function wantsCinematic() {
        return wantsGpuPresentation();
    }

    function wantsUltimateCinematic() {
        return wantsGpuPresentation();
    }

    function isCinematic() {
        return wantsCinematic();
    }

    function setTier(q) {
        tier = q || "full";
        try {
            document.documentElement.dataset.dfVfxTier = wantsCinematic() ? "cinematic" : tier;
        } catch (e) { /* */ }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (global.gsap && src.includes("gsap")) { resolve(); return; }
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("script load failed: " + src));
            document.head.appendChild(s);
        });
    }

    async function loadGsap() {
        if (global.gsap?.timeline) return global.gsap;
        try {
            await loadScript(assetUrl(LOCAL_GSAP));
        } catch (e) {
            if (global.navigator && global.navigator.onLine === false) throw e;
            console.warn("[DfVfxEngine] GSAP local falhou, tentando CDN", e);
            await loadScript(CDN_GSAP);
        }
        const gsap = global.gsap;
        if (!gsap?.timeline) throw new Error("GSAP indisponível");
        gsap.defaults({ ease: "power2.out", overwrite: "auto" });
        return gsap;
    }

    function forceGpuTier() {
        // Sempre "full" quando o jogador quer GPU (auto/completo).
        // hints.gpu === "lite" só reduz partículas/DPR — nunca destrói Pixi
        // nem mata timelines GSAP no meio da cena.
        if (!wantsGpuPresentation()) {
            setTier("lite");
            global.__dfVfxQuality = "lite";
            try { global.DfGsapBridge?.setQuality?.("lite"); } catch (e) { /* */ }
            try { global.DfPixiVfx?.setQuality?.("lite"); } catch (e) { /* */ }
            return;
        }
        setTier("full");
        global.__dfVfxQuality = "full";
        try { global.DfGsapBridge?.setQuality?.("full"); } catch (e) { /* */ }
        try { global.DfPixiVfx?.setQuality?.("full"); } catch (e) { /* */ }
    }

    /**
     * Garante GSAP + Pixi prontos para cena cinematográfica.
     * @returns {Promise<boolean>}
     */
    async function ensureCinematicReady(opts = {}) {
        if (!wantsUltimateCinematic()) return false;
        try {
            if (global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;
        } catch (e) { /* */ }

        const waitFull = !!opts.waitFull;
        const maxMs = typeof opts.maxMs === "number" ? opts.maxMs : CINEMATIC_FULL_MS;
        // Sem waitFull, um maxMs explícito do chamador vale como teto de espera.
        // Antes ele era descartado e a corrida caía nos 400ms padrão — tempo
        // insuficiente pro Pixi frio, então a cena era considerada "não pronta"
        // e a animação não aparecia na primeira vez.
        const raceMs = typeof opts.raceMs === "number"
            ? opts.raceMs
            : Math.max(adaptiveCinematicRaceMs(),
                typeof opts.maxMs === "number" ? opts.maxMs : 0);
        // waitFull NÃO ignora maxMs — senão o 1º turno trava 10–18s no desktop.
        const awaitReady = (p) => (waitFull
            ? raceCinematicReady(p, maxMs)
            : raceCinematicReady(p, raceMs));
        if (initPromise) {
            return awaitReady(initPromise);
        }
        initPromise = (async () => {
            try {
                forceGpuTier();
                await loadGsap();
                if (global.DfGsapBridge?.ensureGsap) {
                    await global.DfGsapBridge.ensureGsap(true);
                }
                const app = await global.DfPixiVfx?.ensureApp?.(true);
                if (!app || !global.PIXI) {
                    throw new Error("Pixi Application indisponível");
                }
                return true;
            } catch (err) {
                initPromise = null;
                console.warn("[DfVfxEngine] cinematic ready falhou", err);
                return false;
            }
        })();
        return awaitReady(initPromise);
    }

    async function playUltimate(type, opts = {}) {
        const ready = await ensureCinematicReady({ waitFull: true, maxMs: CINEMATIC_FULL_MS });
        if (!ready) return false;
        try {
            const pixi = global.DfPixiVfx;
            if (pixi?.ensureApp && pixi?.ensurePixiViewportLayout) {
                const a = await pixi.ensureApp(true);
                pixi.ensurePixiViewportLayout(a);
            }
        } catch (e) { /* */ }
        const dir = global.DfUltimateDirector;
        if (!dir?.play) {
            console.warn("[DfVfxEngine] director ausente:", type);
            return false;
        }
        if (!dir.isReady?.()) dir.ensureInstalled?.();
        await dir.play(type, { ...opts, cinematic: true });
        return true;
    }

    function syncFromRuntime() {
        const q = global.__dfVfxQuality || global.DfVfxRuntime?.quality?.() || "full";
        setTier(q);
    }

    async function playCombat(opts = {}) {
        const ready = await ensureCinematicReady({
            waitFull: !!opts.waitFull,
            maxMs: opts.waitFull ? CINEMATIC_FULL_MS : undefined,
            raceMs: opts.waitFull ? undefined : CINEMATIC_READY_MS,
        });
        if (!ready) return false;
        const pixi = global.DfPixiVfx;
        if (!pixi?.playCombatScene) return false;
        try {
            return await pixi.playCombatScene(opts);
        } catch (e) {
            console.warn("[DfVfxEngine] playCombat", e);
            return false;
        }
    }

    async function playCardDestroy(opts = {}) {
        const { cx, cy, snap, fx } = opts;
        if (cx == null || cy == null) return false;
        const pixi = global.DfPixiVfx;
        if (!pixi?.playCardDestroy) return false;
        try {
            forceGpuTier();
            await loadGsap();
            if (global.DfGsapBridge?.ensureGsap) {
                await global.DfGsapBridge.ensureGsap(true);
            }
            await global.DfPixiVfx?.ensureApp?.(true);
            return await pixi.playCardDestroy(cx, cy, snap, {
                force: true,
                fx: fx || global.__dfFX,
                combatKill: true,
            });
        } catch (e) {
            console.warn("[DfVfxEngine] playCardDestroy", e);
            return false;
        }
    }

    async function playSummon(opts = {}) {
        if (!wantsGpuPresentation()) return false;
        const pixi = global.DfPixiVfx;
        if (!pixi?.playSummonDropScene) return false;
        try {
            // 1º summon: garantir Pixi+GSAP prontos (igual combate) — evita fly vazio.
            await ensureCinematicReady({
                waitFull: false,
                maxMs: adaptiveCinematicRaceMs(),
            });
            forceGpuTier();
            return await pixi.playSummonDropScene(opts);
        } catch (e) {
            console.warn("[DfVfxEngine] playSummon", e);
            return false;
        }
    }

    global.DfVfxEngine = {
        wantsGpuPresentation,
        wantsCinematic,
        wantsUltimateCinematic,
        isCinematic,
        setTier,
        syncFromRuntime,
        ensureCinematicReady,
        forceGpuTier,
        playUltimate,
        playCombat,
        playSummon,
        playCardDestroy,
        ultimateTimeoutMs(fastUlt) {
            if (wantsUltimateCinematic()) return 14000;
            return fastUlt ? 2200 : 9000;
        },
    };

    syncFromRuntime();
})(typeof window !== "undefined" ? window : globalThis);
