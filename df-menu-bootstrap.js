/**
 * Dragonfall — shell do menu (leve). Carrega df-game-view.js sob demanda.
 */
(function (global) {
    "use strict";

    global.__DF_DEFER_GAME_VIEW = true;

    let menuSelection = 0;
    let menuWired = false;

    function $(id) {
        return document.getElementById(id);
    }

    function updateMainMenuSelection() {
        $("btn-main-play")?.classList.toggle("selected", menuSelection === 0);
        $("btn-main-opcoes")?.classList.toggle("selected", menuSelection === 1);
        $("btn-main-notes")?.classList.toggle("selected", menuSelection === 2);
    }

    function setPlayButtonLoading(loading) {
        const btn = $("btn-main-play");
        if (!btn) return;
        btn.disabled = !!loading;
        btn.classList.toggle("is-loading", !!loading);
        btn.setAttribute("aria-busy", loading ? "true" : "false");
    }

    function showMenuError(msg) {
        const status = $("offline-status");
        if (!status) return;
        status.style.display = "block";
        status.style.color = "#ff9090";
        status.textContent = msg;
    }

    function clearMenuError() {
        const status = $("offline-status");
        if (!status) return;
        status.style.display = "none";
        status.textContent = "";
    }

    function dfNeedsLocalServer() {
        try {
            return location.protocol === "file:";
        } catch (e) {
            return false;
        }
    }

    function dfLocalServerHint() {
        return "Abra o jogo pelo servidor local: http://127.0.0.1:5173/ (rode jogar-local.bat).";
    }

    async function ensureView() {
        if (dfNeedsLocalServer()) {
            throw new Error(dfLocalServerHint());
        }
        const load = global.DfLazyLoad?.ensureGameView
            ? global.DfLazyLoad.ensureGameView()
            : Promise.reject(new Error("DfLazyLoad indisponível"));
        const slowDevice = global.matchMedia?.("(max-width: 900px), (pointer: coarse)")?.matches;
        const loadTimeoutMs = slowDevice ? 90000 : 45000;
        await Promise.race([
            load,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(
                    "Tempo esgotado ao carregar o jogo. Recarregue a página ou use http://127.0.0.1:5173/"
                )), loadTimeoutMs);
            }),
        ]);
        if (!global.__dfGameViewApi) {
            throw new Error("Partida não inicializou — recarregue a página");
        }
        // Só Pixi/GSAP no idle — o pacote heavy completa no JOGAR (sem trabalho duplicado).
        void global.DfLazyLoad?.prefetchPixiEngine?.();
    }

    async function withView(fn, opts = {}) {
        const showLoad = opts.showLoad !== false;
        try {
            if (showLoad) setPlayButtonLoading(true);
            global.dfSetMenuLoadPct?.(8, "Carregando motor…");
            await ensureView();
            global.dfSetMenuLoadPct?.(28, "Motor pronto…");
            if (showLoad) setPlayButtonLoading(false);
            clearMenuError();
            return await fn?.();
        } catch (e) {
            if (showLoad) setPlayButtonLoading(false);
            throw e;
        }
    }

    function wireMenuButtons() {
        if (menuWired) return;
        menuWired = true;

        document.addEventListener("keydown", (e) => {
            const main = $("main");
            if (!main?.classList.contains("active")) return;
            if (e.key === "Enter") {
                e.preventDefault();
                $("btn-main-play")?.click();
            }
        });

        $("btn-main-play")?.addEventListener("click", () => {
            global.dfBeginMenuLoadBar?.();
            withView(async () => {
                const api = global.__dfGameViewApi;
                if (!api) throw new Error("Partida não inicializou — recarregue a página");
                if (typeof api.onMainPlay === "function") {
                    await api.onMainPlay();
                    if (typeof api.prepPlayMenuBackground === "function") {
                        void api.prepPlayMenuBackground();
                    }
                    return;
                }
                if (typeof api.showPlayMenu === "function") {
                    await api.showPlayMenu();
                    return;
                }
            }, { showLoad: !global.__dfGameViewReady })
                .then(() => { try { sessionStorage.removeItem("df_pending_play"); } catch (e) {} })
                .catch((e) => {
                    try { sessionStorage.removeItem("df_pending_play"); } catch (e2) {}
                    global.dfShowMenuLoadBar?.(false);
                    console.error("[DF menu] Jogar", e);
                    showMenuError(
                        (e && e.message) ? e.message : "Falha ao carregar a partida. Toque Jogar de novo."
                    );
                });
        });
        $("btn-main-opcoes")?.addEventListener("click", () => {
            withView(() => global.__dfGameViewApi?.showOpcoes?.(), { showLoad: false }).catch((e) => {
                console.error("[DF menu] Opções", e);
            });
        });
        $("btn-main-notes")?.addEventListener("click", () => {
            withView(() => global.__dfGameViewApi?.showReleaseNotes?.(), { showLoad: false }).catch((e) => {
                console.error("[DF menu] Notas", e);
            });
        });

        updateMainMenuSelection();

        if (global.DfVersionGuard && global.__DF_GAME_V !== "dev") {
            global.DfVersionGuard.startPolling(15000);
        }
    }

    function scheduleIdleVfxPrefetch() {
        const slow = global.DfLazyLoad?.isSlowNetwork?.();
        const mobile = global.DfLazyLoad?.isMobileBoot?.()
            || global.matchMedia?.("(pointer: coarse)")?.matches;
        const run = () => {
            if (slow) return;
            // Idle = só runtime GPU. Heavy/sprites ficam no JOGAR (prepareMatchPresentation).
            void global.DfLazyLoad?.prefetchPixiEngine?.();
        };
        const timeout = mobile ? 22000 : (slow ? 14000 : 7000);
        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(run, { timeout });
        } else {
            global.setTimeout(run, mobile ? 8000 : 2500);
        }
    }

    function scheduleGameViewPreload() {
        const mobile = global.DfLazyLoad?.isMobileBoot?.()
            || global.matchMedia?.("(max-width: 900px), (pointer: coarse)")?.matches;
        if (!mobile || global.__dfGameViewReady) return;
        const run = () => {
            if (global.__dfGameViewReady) return;
            void ensureView().catch(() => {});
        };
        global.setTimeout(run, 600);
        ["touchstart", "pointerdown", "click"].forEach((ev) => {
            global.document?.addEventListener(ev, run, { once: true, capture: true });
        });
    }

    function onMenuReady() {
        wireMenuButtons();
        scheduleGameViewPreload();
        scheduleIdleVfxPrefetch();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onMenuReady);
    } else {
        onMenuReady();
    }

    if (global.__DF_SIM_MODE) {
        ensureView().catch((e) => console.warn("[DF menu] sim boot", e));
    }

    if (dfNeedsLocalServer()) {
        showMenuError(dfLocalServerHint());
    }

    /** Retoma play-menu após reload do SW durante lazy-load. */
    if (sessionStorage.getItem("df_pending_play") === "1") {
        sessionStorage.removeItem("df_pending_play");
        setTimeout(() => {
            withView(async () => {
                const api = global.__dfGameViewApi;
                if (api?.showPlayMenu) await api.showPlayMenu();
                else await api?.onMainPlay?.();
            }, { showLoad: false }).catch((e) => {
                console.warn("[DF menu] resume play", e);
                showMenuError((e && e.message) ? e.message : "Falha ao retomar. Toque Jogar.");
            });
        }, 100);
    }
})(typeof window !== "undefined" ? window : globalThis);
