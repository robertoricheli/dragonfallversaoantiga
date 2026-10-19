/**
 * Dragonfall — bridge GSAP (CDN lazy) para timelines de VFX.
 * Ativa em qualidade "full"; lite/mobile explícitos usam loops legacy.
 */
(function (global) {
    "use strict";

    const GSAP_LOCAL = "js/vendor/gsap.min.js";
    const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js";

    /** @type {"full"|"lite"|"mobile"} */
    let quality = "full";
    let loadPromise = null;
    /** @type {Set<import("gsap").core.Timeline | import("gsap").core.Tween>} */
    const activeTweens = new Set();
    let activeGroup = "df-vfx";

    function prefersReduced() {
        try {
            return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
        } catch (e) {
            return false;
        }
    }

    function setQuality(q) {
        const mode = global.DfVfxSettings?.getMode?.() ?? "auto";
        // Em auto/completo, ignore "lite" vindos de hints de device — senão
        // killAll() apaga a timeline no meio da animação (FX “invisível”).
        if ((mode === "auto" || mode === "full")
            && global.DfVfxEngine?.wantsGpuPresentation?.() !== false
            && !prefersReduced()) {
            quality = "full";
            return;
        }
        quality = q || "full";
        if (quality !== "full") killAll();
    }

    function canUse() {
        if (prefersReduced()) return false;
        const mode = global.DfVfxSettings?.getMode?.() ?? "auto";
        if (mode === "lite" || mode === "mobile") return false;
        if (global.DfVfxEngine?.wantsGpuPresentation?.() === false) return false;
        return quality === "full";
    }

    function assetUrl(rel) {
        const v = encodeURIComponent(global.__DF_GAME_V || "dev");
        return rel + (rel.includes("?") ? "&" : "?") + "v=" + v;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (global.gsap) { resolve(); return; }
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("GSAP load failed"));
            document.head.appendChild(s);
        });
    }

    async function loadGsapScript() {
        if (global.gsap) return;
        try {
            await loadScript(assetUrl(GSAP_LOCAL));
        } catch (e) {
            if (global.navigator && global.navigator.onLine === false) throw e;
            await loadScript(GSAP_CDN);
        }
    }

    async function ensureGsap(force) {
        if (force) quality = "full";
        if (!force && !canUse()) return null;
        if (global.gsap) return global.gsap;
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            await loadGsapScript();
            const gsap = global.gsap;
            if (!gsap?.timeline) throw new Error("gsap.timeline missing");
            gsap.defaults({ ease: "power2.out", overwrite: "auto" });
            return gsap;
        })().catch((err) => {
            loadPromise = null;
            console.warn("[DF GsapBridge]", err);
            return null;
        });
        return loadPromise;
    }

    function track(tw) {
        if (tw) activeTweens.add(tw);
        return tw;
    }

    function untrack(tw) {
        if (tw) activeTweens.delete(tw);
    }

    function killAll() {
        activeTweens.forEach((tw) => {
            try { tw.kill?.(); } catch (e) { /* */ }
        });
        activeTweens.clear();
        try { global.gsap?.globalTimeline?.clear?.(); } catch (e) { /* */ }
        try { global.gsap?.killTweensOf?.("*"); } catch (e) { /* */ }
    }

    /** Mata tweens órfãos num alvo DOM/Pixi antes de reancorar a carta. */
    function killTweensOf(...targets) {
        try {
            if (global.gsap?.killTweensOf) global.gsap.killTweensOf(...targets);
        } catch (e) { /* */ }
    }

    /** gsap.to rastreado — preferir isto a gsap.to cru em cenas Pixi. */
    function to(target, vars) {
        const gsap = global.gsap;
        if (!gsap || !target) return null;
        const tw = gsap.to(target, vars);
        track(tw);
        const finish = () => untrack(tw);
        try {
            tw.eventCallback("onComplete", finish);
            tw.eventCallback("onInterrupt", finish);
        } catch (e) { /* */ }
        return tw;
    }

    function setActiveGroup(id) {
        activeGroup = id || "df-vfx";
    }

    function clearActiveGroup(id) {
        if (activeGroup === id) activeGroup = "df-vfx";
    }

    /**
     * Timeline GSAP com cleanup automático.
     * @param {import("gsap").TimelineVars} [vars]
     */
    async function createTimeline(vars = {}, force) {
        const gsap = await ensureGsap(force);
        if (!gsap) return null;
        const tl = gsap.timeline({
            ...vars,
            data: { group: activeGroup, ...(vars.data || {}) },
        });
        track(tl);
        const origKill = tl.kill.bind(tl);
        tl.kill = (...args) => {
            untrack(tl);
            return origKill(...args);
        };
        tl.eventCallback("onComplete", () => untrack(tl));
        return tl;
    }

    /**
     * Promessa que resolve quando a timeline termina (ou é interrompida).
     * @param {import("gsap").core.Timeline} tl
     */
    function timelineToPromise(tl) {
        if (!tl) return Promise.resolve(false);
        return new Promise((resolve) => {
            const finish = () => {
                untrack(tl);
                resolve(true);
            };
            tl.eventCallback("onComplete", finish);
            tl.eventCallback("onInterrupt", finish);
        });
    }

    /**
     * Loop de efeito Pixi — substitui rAF manual quando GSAP disponível.
     * @param {number} durationMs
     * @param {(t: number, elapsed: number, dt: number) => void} onFrame
     * @param {() => void} [onDone]
     */
    async function runEffect(durationMs, onFrame, onDone) {
        const gsap = await ensureGsap();
        if (!gsap || durationMs <= 0) return false;
        const proxy = { t: 0 };
        const tw = track(gsap.to(proxy, {
            t: 1,
            duration: durationMs / 1000,
            ease: "none",
            onUpdate: () => onFrame(proxy.t, proxy.t * durationMs, 16),
            onComplete: () => {
                untrack(tw);
                try { onDone?.(); } catch (e) { /* */ }
            },
            onInterrupt: () => {
                untrack(tw);
                try { onDone?.(); } catch (e) { /* */ }
            },
        }));
        return new Promise((resolve) => {
            tw.eventCallback("onComplete", () => resolve(true));
            tw.eventCallback("onInterrupt", () => resolve(true));
        });
    }

    /**
     * Tween promisificado (DOM ou Pixi display objects).
     * @param {object} target
     * @param {import("gsap").TweenVars} vars
     * @param {{ durationMs?: number }} [opts]
     */
    async function tweenTo(target, vars, opts = {}) {
        const gsap = await ensureGsap();
        if (!gsap || !target) return false;
        const dur = opts.durationMs != null ? opts.durationMs / 1000 : vars.duration;
        return new Promise((resolve) => {
            const tw = track(gsap.to(target, {
                ...vars,
                duration: dur ?? vars.duration ?? 0.5,
                onComplete: () => { untrack(tw); resolve(true); },
                onInterrupt: () => { untrack(tw); resolve(true); },
            }));
        });
    }

    /**
     * Executa fases sequenciais como timeline GSAP (padrão director).
     * @param {{ [phase: string]: number }} timingsMs — ms por fase
     * @param {string[]} order — ordem das fases
     * @param {{ [phase: string]: (ms: number) => (void|Promise<void>) }} handlers
     */
    async function playPhases(timingsMs, order, handlers) {
        const gsap = await ensureGsap();
        if (!gsap) return false;
        const tl = await createTimeline({ paused: true });
        if (!tl) return false;

        for (const phase of order) {
            const ms = timingsMs[phase] ?? 0;
            if (ms <= 0) continue;
            const fn = handlers[phase];
            if (typeof fn !== "function") {
                tl.to({}, { duration: ms / 1000 });
                continue;
            }
            tl.add(async () => {
                await fn(ms);
            });
        }

        tl.play();
        await timelineToPromise(tl);
        return true;
    }

    global.DfGsapBridge = {
        setQuality,
        canUse,
        ensureGsap,
        createTimeline,
        timelineToPromise,
        runEffect,
        tweenTo,
        to,
        playPhases,
        killAll,
        killTweensOf,
        track,
        untrack,
        setActiveGroup,
        clearActiveGroup,
    };
})(typeof window !== "undefined" ? window : globalThis);
