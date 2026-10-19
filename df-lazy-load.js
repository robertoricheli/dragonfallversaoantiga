/**
 * Dragonfall — carregamento lazy (VFX, director, partida).
 */
(function (global) {
    "use strict";

    const PHASE1_MODULES = [
        "js/df-view-session.js",
        "js/df-anim.js",
        "js/df-board-renderer.js",
        "js/df-input-controller.js",
        "js/df-combat-presenter.js",
        "js/df-mp-presenter.js",
        "js/df-online-session.js",
        "js/df-menu-controller.js",
        "js/df-ai-controller.js",
        "js/df-talent-ultimate-presenter.js",
        "js/df-phase1-wire.js",
    ];

    function phase1Scripts() {
        if (global.__DF_PHASE1_BUNDLE === false) return PHASE1_MODULES;
        return ["js/df-phase1-bundle.js"];
    }

    /** Scripts independentes — carregam em paralelo (menos tempo até JOGAR). */
    const GAME_VIEW_PARALLEL = [
        "js/df-presentation-bus.js",
        "js/df-vfx-runtime.js",
        "js/df-sprite-manifest.js",
        "js/df-gsap-bridge.js",
        "js/df-pixi-vfx.js",
        "js/df-pixi-hero-ult-vfx.js",
        "js/df-target-levitate.js",
        "js/df-vfx-engine.js",
        "js/df-hero-hub-vfx.js",
        "js/df-phase3-wire.js",
    ];

    const GAME_VIEW_DEPS = [
        ...GAME_VIEW_PARALLEL,
        ...phase1Scripts(),
    ];

    const GAME_HEAVY = [
        "js/df-sprite-vfx.js",
        "js/df-ultimate-director.js",
    ];

    const GAME_VIEW = "js/df-game-view.js";

    const loaded = new Set();
    let pixiPreloadPromise = null;

    function assetV() {
        return encodeURIComponent(global.__DF_GAME_V || "dev");
    }

    function loadScript(src) {
        const url = src + (src.includes("?") ? "&" : "?") + "v=" + assetV();
        if (loaded.has(url)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = url;
            s.async = true;
            s.onload = () => {
                loaded.add(url);
                resolve();
            };
            s.onerror = () => reject(new Error("Falha ao carregar " + src));
            document.head.appendChild(s);
        });
    }

    async function loadScriptsParallel(srcs, concurrency) {
        const list = srcs.filter(Boolean);
        const limit = Math.max(2, concurrency || 4);
        let i = 0;
        const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
            while (i < list.length) {
                const idx = i++;
                await loadScript(list[idx]);
            }
        });
        await Promise.all(workers);
    }

    /** Pré-carrega Pixi+GSAP em idle (menu) — evita CDN no primeiro ultimate. */
    function prefetchPixiEngine() {
        if (pixiPreloadPromise) return pixiPreloadPromise;
        pixiPreloadPromise = (async () => {
            try {
                await loadScriptsParallel([
                    "js/df-gsap-bridge.js",
                    "js/df-pixi-vfx.js",
        "js/df-pixi-hero-ult-vfx.js",
                    "js/df-vfx-engine.js",
                ], 3);
                await global.DfGsapBridge?.ensureGsap?.(true);
                await global.DfPixiVfx?.ensureApp?.(true);
            } catch (e) {
                pixiPreloadPromise = null;
            }
        })();
        return pixiPreloadPromise;
    }

    /** Liga DfUltimateDirector ↔ DfSpriteVfx após os scripts heavy existirem. */
    function wireHeavyVfx() {
        global.DfSpriteVfx?.wireUltimateDirector?.();
    }

    let heavyPromise = null;

    function isMobileBoot() {
        const hints = global.DfViewport?.getPerfHints?.();
        return !!(hints?.coarse || hints?.mobileDesktopFit || global.__dfFX?.mobile);
    }

    function isSlowNetwork() {
        try {
            const c = navigator.connection;
            if (c?.saveData) return true;
            const t = c?.effectiveType;
            return t === "slow-2g" || t === "2g" || t === "3g";
        } catch (e) { return false; }
    }

    /** Durante o início da partida: não aquecer Pixi/GSAP/sprites (main-thread livre). */
    let presentationWarmPaused = false;

    function pauseMatchPresentationWarm() {
        presentationWarmPaused = true;
    }

    function resumeMatchPresentationWarm() {
        presentationWarmPaused = false;
    }

    function isPresentationWarmPaused() {
        return !!presentationWarmPaused;
    }

    async function loadGameHeavy(opts = {}) {
        const forceVfxPreload = !!opts.forceVfxPreload;
        const skipCinematic = !!opts.skipCinematic || (!forceVfxPreload && presentationWarmPaused);
        if (heavyPromise && !forceVfxPreload && !opts.skipCinematic) return heavyPromise;
        const runHeavy = (async () => {
            await loadScriptsParallel(GAME_HEAVY, isMobileBoot() ? 3 : 2);
            wireHeavyVfx();
            void global.DfSpriteVfx?.init?.().catch((e) => {
                console.warn("[DF lazy] DfSpriteVfx.init", e);
            });
            if (skipCinematic) {
                void prefetchPixiEngine().catch(() => {});
                return;
            }
            const mobile = isMobileBoot();
            const slow = isSlowNetwork();
            const needFullWarm = forceVfxPreload || slow;
            if (needFullWarm || (!mobile && !slow)) {
                try {
                    await global.DfVfxEngine?.ensureCinematicReady?.({
                        maxMs: slow ? 15000 : (forceVfxPreload ? 8000 : 1500),
                        waitFull: needFullWarm || (!mobile && !slow),
                    });
                } catch (e) {
                    console.warn("[DF lazy] VfxEngine warmup", e);
                }
            } else {
                void prefetchPixiEngine().catch(() => {});
            }
        })().catch((err) => {
            if (!forceVfxPreload) heavyPromise = null;
            console.warn("[DF lazy] loadGameHeavy falhou", err);
            throw err;
        });
        if (!heavyPromise && !opts.skipCinematic) heavyPromise = runHeavy;
        const deferPreload = () => {
            if (forceVfxPreload || skipCinematic || presentationWarmPaused) return Promise.resolve();
            const mobile = isMobileBoot();
            if (mobile) {
                void prefetchPixiEngine().catch(() => {});
                if (typeof global.requestIdleCallback === "function") {
                    return new Promise((r) => global.requestIdleCallback(() => r(), { timeout: 1500 }));
                }
                return new Promise((r) => setTimeout(r, 1200));
            }
            const hints = global.DfViewport?.getPerfHints?.();
            if (!hints?.deferVfxPreload) return Promise.resolve();
            if (typeof global.requestIdleCallback === "function") {
                return new Promise((r) => global.requestIdleCallback(() => r(), { timeout: 8000 }));
            }
            return new Promise((r) => setTimeout(r, 800));
        };
        void (async () => {
            try {
                await deferPreload();
                if (presentationWarmPaused || skipCinematic) return;
                // No 1.º JOGAR (forceVfxPreload) também no mobile — evita “loading” in-game.
                if (isMobileBoot() && !forceVfxPreload) return;
                await global.DfSpriteVfx?.preloadAll?.();
            } catch (e) {
                console.warn("[DF lazy] preload VFX", e);
            }
        })();
        return forceVfxPreload || opts.skipCinematic ? runHeavy : heavyPromise;
    }

    let presentationReadyPromise = null;

    /** Prepara runtime GPU; forceVfxPreload=true no 1.º JOGAR (também no mobile). */
    function prepareMatchPresentation(opts = {}) {
        if (presentationWarmPaused && !opts.forceVfxPreload) {
            return Promise.resolve(false);
        }
        const forceVfx = !!opts.forceVfxPreload;
        if (presentationReadyPromise && !forceVfx) return presentationReadyPromise;
        const run = Promise.all([
            loadGameHeavy({ forceVfxPreload: forceVfx }),
            prefetchPixiEngine(),
        ]).then(async () => {
            if (forceVfx && !presentationWarmPaused) {
                try {
                    await global.DfSpriteVfx?.preloadAll?.();
                } catch (e) {
                    console.warn("[DF lazy] force VFX preload", e);
                }
            }
            return true;
        }).catch((err) => {
            presentationReadyPromise = null;
            console.warn("[DF lazy] prepareMatchPresentation", err);
            return false;
        });
        if (!presentationReadyPromise) presentationReadyPromise = run;
        return run;
    }

    let gameViewPromise = null;

    async function loadGameView() {
        if (global.__dfGameViewReady) return;
        if (!gameViewPromise) {
            gameViewPromise = (async () => {
                const parallel = isMobileBoot() ? 6 : 4;
                await loadScriptsParallel(GAME_VIEW_PARALLEL, parallel);
                for (const src of phase1Scripts()) await loadScript(src);
                await loadScript(GAME_VIEW);
            })()
                .then(() => {
                    if (typeof global.__dfWireGameViewUi === "function") {
                        global.__dfWireGameViewUi();
                    }
                    if (!global.__dfGameViewApi) {
                        throw new Error("df-game-view.js não exportou __dfGameViewApi");
                    }
                    global.__dfGameViewReady = true;
                })
                .catch((err) => {
                    gameViewPromise = null;
                    throw err;
                });
        }
        return gameViewPromise;
    }

    async function ensureBeforeMatch() {
        await loadGameView();
        await loadGameHeavy();
    }

    async function ensureGameView() {
        return loadGameView();
    }

    /** Prefetch VFX em background — reutiliza as mesmas promises do JOGAR. */
    function prefetchGameHeavy() {
        if (presentationReadyPromise) return presentationReadyPromise;
        return prepareMatchPresentation();
    }

    global.DfLazyLoad = {
        loadGameHeavy,
        loadGameView,
        ensureGameView,
        ensureBeforeMatch,
        prepareMatchPresentation,
        pauseMatchPresentationWarm,
        resumeMatchPresentationWarm,
        isPresentationWarmPaused,
        prefetchGameHeavy,
        prefetchPixiEngine,
        wireHeavyVfx,
        isMobileBoot,
        isSlowNetwork,
        GAME_HEAVY,
        GAME_VIEW,
    };
})(typeof window !== "undefined" ? window : globalThis);
