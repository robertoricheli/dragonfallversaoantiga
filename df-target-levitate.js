/**

 * Dragonfall — zoom in/out suave em campeões com borda destacada (Pixi + GSAP).

 */

(function (global) {

    "use strict";



    const HIGHLIGHT_SEL =

        ".quadrant-field .ccard.valid-target, " +

        ".quadrant-field .ccard.ritual-drag-target, " +

        ".quadrant-field .ccard.drag-attack-target";



    const ZOOM_MIN = 1;

    const ZOOM_MAX = 1.14;



    /** @type {Map<HTMLElement, { tw: object|null, pixi: object|null }>} */

    const active = new Map();

    /** @type {Set<HTMLElement>} */

    const pending = new Set();

    let observer = null;

    let syncQueued = false;

    let paused = false;

    /** @type {(() => void)|null} */

    let sceneFrameEnd = null;



    function isHighlight(el) {

        if (!el?.classList) return false;

        if (!el.closest(".quadrant-field")) return false;

        if (el.classList.contains("combat-animating") || el.classList.contains("field-drag-src")) return false;

        return el.classList.contains("valid-target")

            || el.classList.contains("ritual-drag-target")

            || el.classList.contains("drag-attack-target");

    }



    function borderColor(el) {

        if (el.classList.contains("vt-red")) return 0xff5555;

        if (el.classList.contains("vt-green")) return 0x55ff88;

        if (el.classList.contains("vt-blue")) return 0x55aaff;

        if (el.classList.contains("vt-orange")) return 0xffaa44;

        if (el.classList.contains("vt-purple") || el.classList.contains("ritual-drag-target")) return 0xcc66ff;

        if (el.classList.contains("drag-attack-target")) return 0xff6666;

        return 0x66ff99;

    }



    function baseRotation(el) {
        // Cansado permanece VERTICAL (manual). Alvo de ataque/talento
        // jamais gira para horizontal durante o destaque.
        if (el.classList.contains("tapped")) return 0;
        if (el.classList.contains("drag-attack-target")) return 0;
        if (el.classList.contains("valid-target") || el.classList.contains("ritual-drag-target")) return 0;

        if (window.DfLayout?.isCanvasFieldLayout?.()) return 0;

        if (el.classList.contains("field-present-landscape")) return -90;

        return 0;

    }



    function applyTransform(el, scale, rot) {

        const parts = [];

        if (rot) parts.push(`rotate(${rot}deg)`);

        if (Math.abs(scale - 1) > 0.0005) parts.push(`scale(${scale.toFixed(4)})`);

        const t = parts.length ? parts.join(" ") : "none";

        el.style.setProperty("transform-origin", "50% 50%", "important");

        el.style.setProperty("transform", t, "important");

        el.style.setProperty("translate", "none", "important");

        el.style.setProperty("scale", "1", "important");

        el.style.setProperty("rotate", "none", "important");

        el.style.setProperty("will-change", "transform", "important");

    }



    function clearTransform(el) {

        ["transform", "transform-origin", "translate", "scale", "rotate", "will-change"].forEach((p) => {

            el.style.removeProperty(p);

        });

    }



    function mapAuraPoint(vx, vy) {

        const map = global.DfPixiVfx?.mapScenePoint;

        if (map) return map(vx, vy);

        if (global.DfLayout?.isCanvasFieldLayout?.()) {

            const game = global.document.getElementById("game");

            const r = game?.getBoundingClientRect?.();

            if (r) return { x: vx - r.left, y: vy - r.top };

        }

        return { x: vx, y: vy };

    }



    function ensurePixiScene(app) {

        if (sceneFrameEnd || !app) return;

        const frame = global.DfPixiVfx?.pixiSceneFrame?.(app);

        if (frame?.end) sceneFrameEnd = frame.end;

    }



    function releasePixiScene() {

        if (active.size > 0 || pending.size > 0 || !sceneFrameEnd) return;

        try { sceneFrameEnd(); } catch (e) { /* */ }

        sceneFrameEnd = null;

    }



    function destroyPixiAura(pixi) {

        pixi?.tickerOff?.();

        try { pixi?.container?.destroy?.({ children: true }); } catch (e) { /* */ }

    }



    async function attachPixiAura(el, color, app) {

        if (!app || !global.PIXI) return null;

        ensurePixiScene(app);

        const PIXI = global.PIXI;

        const container = new PIXI.Container();

        const glow = new PIXI.Graphics();

        glow.alpha = 0.5;

        container.addChild(glow);

        app.stage.addChild(container);



        const state = { scale: 1, w: 40, h: 56 };

        const redraw = () => {

            const s = state.scale;

            const hw = (state.w * s) / 2;

            const hh = (state.h * s) / 2;

            glow.clear();

            // NÃO desenhar contorno (lineStyle) aqui: a borda colorida da carta
            // já vem do CSS (.ccard.valid-target). Desenhar um anel Pixi por cima
            // criava a "borda duplicada dentro da carta". Mantemos só um brilho
            // suave de halo (preenchimento translúcido), sem segunda borda.

            glow.beginFill(color, 0.10 + (s - 1) * 0.22);

            glow.drawRoundedRect(-hw, -hh, hw * 2, hh * 2, 12 * s);

            glow.endFill();

        };

        redraw();



        const tick = () => {

            if (!el.isConnected || !isHighlight(el)) {

                stopOne(el);

                return;

            }

            const r = el.getBoundingClientRect();

            if (r.width < 2 || r.height < 2) {

                container.visible = false;

                return;

            }

            container.visible = true;

            state.w = r.width * 1.04;

            state.h = r.height * 1.02;

            redraw();

            const pt = mapAuraPoint(r.left + r.width / 2, r.top + r.height / 2);

            container.x = pt.x;

            container.y = pt.y;

        };

        tick();

        const rt = global.DfVfxRuntime;

        const tickerOff = rt?.registerTicker ? rt.registerTicker(tick) : null;

        return { container, state, tickerOff };

    }



    function stopOne(el) {

        const st = active.get(el);

        if (!st) return;

        st.tw?.kill?.();

        destroyPixiAura(st.pixi);

        clearTransform(el);

        el.classList.remove("df-target-levitating");

        delete el.dataset.dfFieldLocked;

        active.delete(el);

        pending.delete(el);

        global.dfStabilizeFieldCards?.(el);

        releasePixiScene();

    }



    async function startOne(el) {

        if (active.has(el) || pending.has(el) || !isHighlight(el)) return;

        pending.add(el);



        el.classList.add("df-target-levitating");

        delete el.dataset.dfFieldLocked;



        const rot = baseRotation(el);

        if (el.classList.contains("tapped")) {

            const m = (global.dfTappedFieldMarginPx?.() ?? 18) + "px";

            el.style.setProperty("margin-left", m, "important");

            el.style.setProperty("margin-right", m, "important");

        }



        try {

            const gsap = await global.DfGsapBridge?.ensureGsap?.(true);

            if (!gsap || !el.isConnected || !isHighlight(el)) {

                el.classList.remove("df-target-levitating");

                return;

            }



            const app = await global.DfPixiVfx?.ensureApp?.(true);

            if (!app || !el.isConnected || !isHighlight(el)) {

                el.classList.remove("df-target-levitating");

                return;

            }



            const color = borderColor(el);

            const pixi = await attachPixiAura(el, color, app);

            if (!el.isConnected || !isHighlight(el)) {

                destroyPixiAura(pixi);

                el.classList.remove("df-target-levitating");

                return;

            }



            const proxy = { scale: ZOOM_MIN };

            applyTransform(el, ZOOM_MIN, rot);



            const tw = gsap.to(proxy, {

                scale: ZOOM_MAX,

                duration: 1.35,

                yoyo: true,

                repeat: -1,

                ease: "sine.inOut",

                onUpdate: () => {

                    if (!el.isConnected) return;

                    applyTransform(el, proxy.scale, rot);

                    if (pixi) pixi.state.scale = proxy.scale;

                },

            });



            active.set(el, { tw, pixi });

        } finally {

            pending.delete(el);

        }

    }



    function sync() {

        syncQueued = false;

        if (paused) return;

        ensureObserver();

        const els = [...document.querySelectorAll(HIGHLIGHT_SEL)].filter(isHighlight);

        for (const el of els) {

            if (!active.has(el) && !pending.has(el)) void startOne(el);

        }

        for (const el of [...active.keys()]) {

            if (!el.isConnected || !isHighlight(el)) stopOne(el);

        }

    }



    function queueSync() {

        if (paused || syncQueued) return;

        if (global.__dfMpTargetResolve) return;

        syncQueued = true;

        requestAnimationFrame(() => {

            requestAnimationFrame(sync);

        });

    }



    function stopAll() {

        for (const el of [...active.keys()]) stopOne(el);

        pending.clear();

        releasePixiScene();

    }



    function pause(on) {

        paused = !!on;

        if (paused) {

            stopAll();

            if (observer) {

                try { observer.disconnect(); } catch (e) { /* */ }

                observer = null;

            }

            syncQueued = false;

        } else {

            ensureObserver();

            queueSync();

        }

    }



    function ensureObserver() {

        if (paused) return;

        const game = document.getElementById("game");

        if (!game) return;

        if (observer) return;

        observer = new MutationObserver(queueSync);

        observer.observe(game, {

            subtree: true,

            childList: true,

            attributes: true,

            attributeFilter: ["class"],

        });

    }



    function init() {

        ensureObserver();

        queueSync();

    }



    global.DfTargetLevitate = { sync: queueSync, stopAll, stopOne, pause, init };



    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init, { once: true });

    } else {

        init();

    }

})(typeof window !== "undefined" ? window : globalThis);

