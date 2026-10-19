/**
 * Dragonfall — PresentationBus (Fase 3).
 * Fila serial de animações: combate → destruição → ultimate → misc.
 */
(function (global) {
    "use strict";

    const PRIORITY = Object.freeze({
        low: 10,
        normal: 50,
        ultimate: 70,
        destruction: 75,
        combat: 80,
        critical: 90,
    });

    /** @type {{ label: string, priority: number, fn: () => Promise<unknown> }[]} */
    const queue = [];
    let pumping = false;
    let currentLabel = null;

    function insertJob(job) {
        let i = 0;
        while (i < queue.length && queue[i].priority >= job.priority) i++;
        queue.splice(i, 0, job);
    }

    async function pump() {
        if (pumping) return;
        pumping = true;
        while (queue.length) {
            const job = queue.shift();
            currentLabel = job.label;
            try {
                await job.fn();
            } catch (e) {
                console.warn("[DF PresentationBus]", job.label, e);
            }
            currentLabel = null;
        }
        pumping = false;
        try { global.__dfPresentationDrain?.(); } catch (e) { /* */ }
    }

    /**
     * Enfileira tarefa de apresentação (uma de cada vez).
     * @param {string} label
     * @param {() => Promise<unknown>} fn
     * @param {{ priority?: number }} [opts]
     */
    function run(label, fn, opts = {}) {
        return new Promise((resolve, reject) => {
            const lbl = String(label || "presentation");
            if (pumping && currentLabel && String(currentLabel).startsWith("ultimate") && lbl.startsWith("ultimate")) {
                (async () => {
                    try { resolve(await fn()); } catch (e) { reject(e); }
                })();
                return;
            }
            insertJob({
                label: lbl,
                priority: opts.priority ?? PRIORITY.normal,
                fn: async () => {
                    try {
                        resolve(await fn());
                    } catch (e) {
                        reject(e);
                        throw e;
                    }
                },
            });
            pump();
        });
    }

    function isBusy() {
        return pumping || queue.length > 0;
    }

    function flush() {
        return new Promise((resolve) => {
            if (!isBusy()) { resolve(); return; }
            const prev = global.__dfPresentationDrain;
            global.__dfPresentationDrain = () => {
                global.__dfPresentationDrain = prev;
                if (prev) try { prev(); } catch (e) { /* */ }
                resolve();
            };
        });
    }

    function forceReset() {
        queue.length = 0;
        pumping = false;
        currentLabel = null;
        try { global.__dfPresentationDrain?.(); } catch (e) { /* */ }
    }

    global.DfPresentationBus = {
        run,
        isBusy,
        flush,
        forceReset,
        current: () => currentLabel,
        PRIORITY,
    };
})(typeof window !== "undefined" ? window : globalThis);
