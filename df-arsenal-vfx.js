/**
 * Dragonfall — VFX do Arsenal (arraste + encaixe): GSAP.
 */
(function (global) {
    "use strict";

    const GSAP_LOCAL = "js/vendor/gsap.min.js";
    let gsapPromise = null;
    /** @type {HTMLElement | null} */
    let mountedGhostEl = null;

    function assetUrl(rel) {
        const v = encodeURIComponent(global.__DF_GAME_V || "dev");
        return rel + (rel.includes("?") ? "&" : "?") + "v=" + v;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = global.document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Falha ao carregar " + src));
            global.document.head.appendChild(s);
        });
    }

    async function ensureGsap() {
        if (global.gsap) return global.gsap;
        if (global.DfGsapBridge?.ensureGsap) {
            const g = await global.DfGsapBridge.ensureGsap(true);
            if (g) return g;
        }
        if (!gsapPromise) {
            gsapPromise = loadScript(assetUrl(GSAP_LOCAL)).then(() => global.gsap || null);
        }
        return gsapPromise;
    }

    async function prefetch() {
        await ensureGsap().catch(() => {});
    }

    function layoutApi() {
        return global.DfLayout || null;
    }

    function viewportRectToGhostSpace(rect) {
        if (!rect) return null;
        const layout = layoutApi();
        if (layout?.viewportRectToCanvas) {
            const cr = layout.viewportRectToCanvas(rect);
            return {
                left: cr.left,
                top: cr.top,
                width: cr.width,
                height: cr.height,
                cx: cr.left + cr.width / 2,
                cy: cr.top + cr.height / 2,
            };
        }
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
        };
    }

    function rectOf(el) {
        const r = el?.getBoundingClientRect?.();
        if (!r) return null;
        return viewportRectToGhostSpace(r);
    }

    function mountGhost(ghost) {
        if (!ghost) return;
        if (mountedGhostEl === ghost && ghost.parentNode) return;
        const layout = layoutApi();
        if (layout?.appendDragGhost) {
            layout.appendDragGhost(ghost);
            ghost.style.setProperty("position", "absolute", "important");
        } else if (ghost.parentNode !== global.document.body) {
            global.document.body.appendChild(ghost);
            ghost.style.position = "fixed";
        }
        ghost.style.setProperty("z-index", "100005", "important");
        ghost.style.margin = "0";
        ghost.style.transform = "translate(-50%, -50%)";
        ghost.style.willChange = "left, top";
        mountedGhostEl = ghost;
    }

    function resetGhostMount() {
        mountedGhostEl = null;
    }

    function moveGhost(ghost, clientX, clientY) {
        if (!ghost) return;
        const layout = layoutApi();
        if (layout?.positionDragGhost) {
            layout.positionDragGhost(ghost, clientX, clientY);
            return;
        }
        ghost.style.left = `${clientX}px`;
        ghost.style.top = `${clientY}px`;
    }

    function placeGhost(ghost, clientX, clientY, w, h) {
        if (!ghost) return;
        mountGhost(ghost);
        if (w != null && h != null) {
            ghost.style.width = `${Math.max(24, w)}px`;
            ghost.style.height = `${Math.max(34, h)}px`;
        }
        moveGhost(ghost, clientX, clientY);
    }

    function tweenTo(gsap, ghost, targetEl, duration, minSize) {
        const tr = rectOf(targetEl);
        if (!tr) return null;
        const curW = parseFloat(ghost?.style?.width) || tr.width;
        const curH = parseFloat(ghost?.style?.height) || tr.height;
        const minW = Math.max(minSize?.width || 0, curW, 24);
        const minH = Math.max(minSize?.height || 0, curH, 34);
        const w = Math.max(tr.width, minW);
        const h = Math.max(tr.height, minH);
        return gsap.to(ghost, {
            left: tr.cx,
            top: tr.cy,
            width: w,
            height: h,
            duration,
            ease: "power2.out",
        });
    }

    async function animateGhostTo(ghost, targetEl, minSize) {
        const gsap = await ensureGsap();
        if (!ghost || !targetEl || !gsap) return false;
        mountGhost(ghost);
        return new Promise((resolve) => {
            const tw = tweenTo(gsap, ghost, targetEl, 0.28, minSize);
            if (!tw) {
                resolve(false);
                return;
            }
            tw.eventCallback("onComplete", () => resolve(true));
            tw.eventCallback("onInterrupt", () => resolve(false));
        });
    }

    async function animateGhostBack(ghost, sourceEl, minSize) {
        const gsap = await ensureGsap();
        if (!ghost || !sourceEl || !gsap) return false;
        mountGhost(ghost);
        return new Promise((resolve) => {
            const tw = tweenTo(gsap, ghost, sourceEl, 0.24, minSize);
            if (!tw) {
                resolve(false);
                return;
            }
            tw.eventCallback("onComplete", () => resolve(true));
            tw.eventCallback("onInterrupt", () => resolve(false));
        });
    }

    /** Pulso no slot de destino — desktop (GSAP). */
    async function playSlotSettle(slotEl) {
        const gsap = await ensureGsap();
        if (!gsap || !slotEl) return;
        slotEl.classList.add("is-settle-flash");
        return new Promise((resolve) => {
            gsap.fromTo(slotEl,
                { scale: 0.9, opacity: 0.55 },
                {
                    scale: 1,
                    opacity: 1,
                    duration: 0.2,
                    ease: "power2.out",
                    onComplete: () => {
                        slotEl.classList.remove("is-settle-flash");
                        gsap.set(slotEl, { clearProps: "transform,opacity" });
                        resolve();
                    },
                    onInterrupt: () => {
                        slotEl.classList.remove("is-settle-flash");
                        gsap.set(slotEl, { clearProps: "transform,opacity" });
                        resolve();
                    },
                }
            );
        });
    }

    /** Pulso leve no mobile — CSS, sem bloquear o thread. */
    function flashSlotSettle(slotEl) {
        if (!slotEl) return;
        slotEl.classList.remove("is-settle-flash");
        void slotEl.offsetWidth;
        slotEl.classList.add("is-settle-flash");
        global.setTimeout(() => slotEl.classList.remove("is-settle-flash"), 160);
    }

    function killGhost(ghost) {
        try {
            if (ghost) {
                global.gsap?.killTweensOf?.(ghost);
                ghost.style.willChange = "";
            }
            global.gsap?.killTweensOf?.("#df-arsenal-drag-ghost");
        } catch (e) { /* */ }
        if (!ghost || mountedGhostEl === ghost) resetGhostMount();
    }

    function killAll() {
        killGhost(global.document.getElementById("df-arsenal-drag-ghost"));
        try {
            global.document.querySelectorAll(".df-arsenal-slot.is-settle-flash").forEach((el) => {
                global.gsap?.killTweensOf?.(el);
                el.classList.remove("is-settle-flash");
                global.gsap?.set?.(el, { clearProps: "transform,opacity" });
            });
        } catch (e) { /* */ }
    }

    function destroyPixi() { /* legado — Pixi removido do Arsenal */ }

    global.DfArsenalVfx = Object.freeze({
        prefetch,
        ensureGsap,
        viewportRectToGhostSpace,
        mountGhost,
        moveGhost,
        placeGhost,
        animateGhostTo,
        animateGhostBack,
        playSlotSettle,
        flashSlotSettle,
        killGhost,
        killAll,
        resetGhostMount,
        destroyPixi,
    });
})(typeof window !== "undefined" ? window : globalThis);
