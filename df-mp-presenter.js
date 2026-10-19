/**
 * Dragonfall — presenter MP (Fase F): filas de apresentação por grupo.
 * Usado só sob window.__DF_ONLINE. vs-IA não carrega este módulo no path crítico.
 */
(function (global) {
    "use strict";

    // 4500ms cortava cenas Pixi que passam de 4s: o job era abortado no meio e o
    // adversário via um flash ou nada. O piso agora cobre a cena típica.
    const FX_TIMEOUT_MS = 6000;
    const FX_TIMEOUT_BUFF_MS = 8000;
    const FX_TIMEOUT_CRITICAL_MS = 10000;
    const BOARD_TIMEOUT_MS = 6500;
    const LONG_FX_KINDS = new Set([
        "strong_arm", "imitar", "legado", "vinganca", "desacelerar",
        "ursificacao", "transformar_bichinho", "hook", "fireAndIce",
        // Cenas de talento/habilidade com Pixi longo — não cortar em 6s.
        "zero_absoluto", "fumaca_toxica", "raio_duplo", "baforada_venenosa",
        "mordida_venenosa", "troca_injusta", "guardian", "corrupt",
        "maldicao_sete_mares", "pesadelo", "necromancia", "doppel_clone",
    ]);
    /** Combate / destruição / voos longos — nunca cortar em 2.5s. */
    const CRITICAL_FX_KINDS = new Set([
        "combat", "blocked_attack", "destroy", "assassinar", "devour",
        "scare_return", "incendiar", "misseis_magicos", "bola_de_fogo",
        "explosao", "poison_kill", "rajada_congelante_destroy",
        "dragon_token_summon", "summon", "combat_telegraph",
    ]);
    /** FX sem conflito de DOM — podem correr 2-wide sob backlog. */
    const SAFE_PARALLEL_FX = new Set(["card_draw", "poison", "land_impact"]);

    function createPresenter(opts = {}) {
        let fxQ = Promise.resolve();
        let fxQAlt = Promise.resolve();
        let boardQ = Promise.resolve();
        let lastQueueWaitMs = 0;
        let lastPresentStartAt = 0;
        let lastAbortAt = 0;
        let pendingCount = 0;
        let activeCount = 0;
        /** @type {Record<number, boolean>} */
        const talentDiscardPending = Object.create(null);

        function reset() {
            fxQ = Promise.resolve();
            fxQAlt = Promise.resolve();
            boardQ = Promise.resolve();
            lastQueueWaitMs = 0;
            lastAbortAt = Date.now();
            pendingCount = 0;
            activeCount = 0;
            Object.keys(talentDiscardPending).forEach((k) => { delete talentDiscardPending[k]; });
        }

        function baseTimeoutFor(group, kind) {
            if (group === "fx") {
                if (kind && CRITICAL_FX_KINDS.has(kind)) return FX_TIMEOUT_CRITICAL_MS;
                if (kind && LONG_FX_KINDS.has(kind)) return FX_TIMEOUT_BUFF_MS;
                return FX_TIMEOUT_MS;
            }
            if (kind && CRITICAL_FX_KINDS.has(kind)) return FX_TIMEOUT_CRITICAL_MS;
            return BOARD_TIMEOUT_MS;
        }

        function adaptiveTimeout(group, baseMs, kind) {
            const slow = !!(global.DfLazyLoad?.isSlowNetwork?.());
            const skew = lastPresentStartAt
                ? Math.max(0, Date.now() - lastPresentStartAt)
                : 0;
            const budget = global.__dfPresentBudgetMs || baseMs;
            const backlog = lastQueueWaitMs > 800 || skew > budget;
            let ms = baseMs | 0;
            if (kind && CRITICAL_FX_KINDS.has(kind)) {
                ms = Math.max(ms, FX_TIMEOUT_CRITICAL_MS);
            }
            if (group === "fx") {
                if (kind && LONG_FX_KINDS.has(kind)) {
                    ms = Math.max(ms, FX_TIMEOUT_BUFF_MS);
                }
                if (slow || backlog) {
                    ms = Math.max(ms, slow ? 9000 : 6500);
                }
            } else if (group === "board") {
                if (slow || backlog) {
                    ms = Math.max(ms, slow ? 9000 : 7500);
                }
            }
            return ms;
        }

        function flashCriticalFallback(kind) {
            if (!kind || !CRITICAL_FX_KINDS.has(kind)) return;
            try {
                global.DfPixiVfx?.sweepOrphanScenes?.();
            } catch (e) { /* */ }
            try {
                const layer = document.getElementById("df-vfx-layer")
                    || document.getElementById("game")
                    || document.body;
                if (!layer) return;
                const flash = document.createElement("div");
                flash.className = "df-mp-present-fallback";
                flash.dataset.ghostBorn = String(Date.now());
                flash.style.cssText =
                    "position:fixed;inset:0;pointer-events:none;z-index:9200;"
                    + "background:radial-gradient(circle at 50% 45%,rgba(255,200,80,.22),transparent 55%);"
                    + "opacity:0;transition:opacity 180ms ease;";
                layer.appendChild(flash);
                requestAnimationFrame(() => { flash.style.opacity = "1"; });
                setTimeout(() => {
                    flash.style.opacity = "0";
                    setTimeout(() => { try { flash.remove(); } catch (e2) { /* */ } }, 220);
                }, 280);
            } catch (e3) { /* */ }
            try {
                console.warn("[DfMpPresenter] PRESENT_TIMEOUT critical", kind);
            } catch (e4) { /* */ }
        }

        function enqueue(group, fn, timeoutMs, meta) {
            const kind = meta && meta.kind;
            const base = timeoutMs != null
                ? timeoutMs
                : baseTimeoutFor(group, kind);
            const timeout = adaptiveTimeout(group, base, kind);
            const started = Date.now();
            const job = { aborted: false, kind: kind || null, group };
            pendingCount++;

            const run = () => {
                lastQueueWaitMs = Date.now() - started;
                lastPresentStartAt = Date.now();
                pendingCount = Math.max(0, pendingCount - 1);
                if (job.aborted) return Promise.resolve();
                activeCount++;
                let timer = null;
                const timed = Promise.race([
                    Promise.resolve().then(() => fn(job)),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            job.aborted = true;
                            lastAbortAt = Date.now();
                            flashCriticalFallback(kind);
                            try {
                                global.DfPixiVfx?.sweepOrphanScenes?.();
                            } catch (e) { /* */ }
                            reject(new Error("PRESENT_TIMEOUT_" + group));
                        }, timeout);
                    }),
                ]);
                return timed.finally(() => {
                    if (timer) clearTimeout(timer);
                    activeCount = Math.max(0, activeCount - 1);
                });
            };

            if (group === "immediate") {
                return Promise.resolve().then(run).catch((e) => {
                    console.warn("[DfMpPresenter] immediate", e);
                });
            }
            if (group === "fx") {
                // 2-wide só para kinds sem conflito de DOM quando a fila está atrasada.
                const canParallel = !!(kind && SAFE_PARALLEL_FX.has(kind) && lastQueueWaitMs > 600);
                if (canParallel) {
                    // Alterna entre duas lanes leves.
                    const useAlt = lastQueueWaitMs % 2 === 1;
                    if (useAlt) {
                        fxQAlt = fxQAlt.then(run).catch((e) => console.warn("[DfMpPresenter] fx", e));
                        return fxQAlt;
                    }
                }
                fxQ = fxQ.then(run).catch((e) => console.warn("[DfMpPresenter] fx", e));
                return fxQ;
            }
            boardQ = boardQ.then(run).catch((e) => console.warn("[DfMpPresenter] board", e));
            return boardQ;
        }

        function groupForVisual(kind, explicit) {
            if (explicit === "fx" || explicit === "board" || explicit === "immediate") return explicit;
            // Telegraph não fica atrás de on-enter na fxQ.
            if (kind === "combat_telegraph") return "immediate";
            if (kind === "talent_cast" || kind === "talent_discard") return "board";
            const fx = opts.fxKinds;
            if (fx && fx.has(kind)) return "fx";
            return "board";
        }

        function markTalentCast(ownerP) {
            talentDiscardPending[ownerP | 0] = true;
        }

        function clearTalentPending(ownerP) {
            delete talentDiscardPending[ownerP | 0];
        }

        function hasTalentPending(ownerP) {
            return !!talentDiscardPending[ownerP | 0];
        }

        function isBusy() {
            return pendingCount > 0 || activeCount > 0;
        }

        function getPendingCount() {
            return pendingCount + activeCount;
        }

        function whenIdle(timeoutMs) {
            const budget = timeoutMs != null ? timeoutMs : 12000;
            if (!isBusy()) return Promise.resolve();
            const t0 = Date.now();
            return new Promise((resolve) => {
                const tick = () => {
                    if (!isBusy() || (Date.now() - t0) > budget) {
                        resolve();
                        return;
                    }
                    setTimeout(tick, 60);
                };
                tick();
            });
        }

        function getTelemetry() {
            return {
                queueWaitMs: lastQueueWaitMs,
                presentStartAt: lastPresentStartAt,
                presentSkewMs: lastPresentStartAt
                    ? Math.max(0, Date.now() - lastPresentStartAt)
                    : 0,
                lastAbortAt,
                pendingCount,
                activeCount,
                busy: isBusy(),
            };
        }

        function resolveFxTimeout(kind) {
            return adaptiveTimeout("fx", baseTimeoutFor("fx", kind), kind);
        }

        function resolveBoardTimeout(kind) {
            return adaptiveTimeout("board", baseTimeoutFor("board", kind), kind);
        }

        return {
            enqueue,
            groupForVisual,
            reset,
            markTalentCast,
            clearTalentPending,
            hasTalentPending,
            getTelemetry,
            resolveFxTimeout,
            resolveBoardTimeout,
            adaptiveTimeout,
            isBusy,
            getPendingCount,
            whenIdle,
            FX_TIMEOUT_MS,
            FX_TIMEOUT_BUFF_MS,
            FX_TIMEOUT_CRITICAL_MS,
            BOARD_TIMEOUT_MS,
            LONG_FX_KINDS,
            CRITICAL_FX_KINDS,
            SAFE_PARALLEL_FX,
        };
    }

    global.DfMpPresenter = { create: createPresenter };
})(typeof window !== "undefined" ? window : globalThis);
