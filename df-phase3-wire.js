/**
 * Dragonfall — Fase 3 wire (PresentationBus + VFX runtime).
 */
(function (global) {
    "use strict";

    function install(deps) {
        if (global.DfVfxRuntime?.install) {
            global.DfVfxRuntime.install(deps.FX);
        }

        const bus = global.DfPresentationBus;

        function runCombat(fn) {
            if (!bus) return fn();
            return bus.run("combat", fn, { priority: bus.PRIORITY.combat });
        }

        function runDestruction(fn) {
            if (!bus) return fn();
            return bus.run("destruction", fn, { priority: bus.PRIORITY.destruction });
        }

        function runUltimate(label, fn) {
            if (!bus) return fn();
            return bus.run(label || "ultimate", fn, { priority: bus.PRIORITY.ultimate });
        }

        function runPresentation(label, fn, priority) {
            if (!bus) return fn();
            return bus.run(label, fn, { priority: priority ?? bus.PRIORITY.normal });
        }

        function patchUltimateDirector() {
            const dir = global.DfUltimateDirector;
            if (!dir || dir.__dfBusPatched || !bus) return;
            const orig = dir.play.bind(dir);
            dir.play = (type, opts) => {
                const cur = bus.current?.();
                if (cur && String(cur).startsWith("ultimate")) {
                    return orig(type, opts);
                }
                return bus.run(`ultimate:${type}`, () => orig(type, opts), { priority: bus.PRIORITY.ultimate });
            };
            dir.__dfBusPatched = true;
        }

        return {
            runCombat,
            runDestruction,
            runUltimate,
            runPresentation,
            patchUltimateDirector,
            isBusy: () => bus?.isBusy?.() ?? false,
        };
    }

    global.DfPhase3Wire = { install };
})(typeof window !== "undefined" ? window : globalThis);
