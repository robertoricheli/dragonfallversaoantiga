(function () {
    "use strict";

    /** Mobile — relógio ao lado do número de Ações (runa do topo do campo). */
    const MOBILE_ART = Object.freeze({
        w: 2979,
        h: 1344,
        x: 0.823,
        y: 0.159,
        wPct: 0.086,
    });

    const PIXI_CDN = "https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js";
    const CX = 32;
    const CY = 32;
    const R = 26;

    let app = null;
    let gfx = null;
    let domDial = null;
    let domFallback = false;
    let loadPromise = null;
    let visible = false;
    let progress = 0;
    let urgent = false;

    function isMobileMode() {
        return window.DfLayout?.combatArenaMode?.() === "mobile";
    }

    function mountEl() {
        return document.getElementById("df-arena-clock-pixi-mount");
    }

    function loadPixiScript() {
        return new Promise((resolve, reject) => {
            if (window.PIXI) { resolve(); return; }
            const s = document.createElement("script");
            s.src = PIXI_CDN;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Pixi load failed"));
            document.head.appendChild(s);
        });
    }

    async function ensureGsap() {
        if (window.DfGsapBridge?.ensureGsap) {
            await window.DfGsapBridge.ensureGsap(true);
        }
        return window.gsap || null;
    }

    function wedgePath(deg) {
        if (deg < 0.5) return "";
        const endRad = ((deg - 90) * Math.PI) / 180;
        const ex = CX + R * Math.cos(endRad);
        const ey = CY + R * Math.sin(endRad);
        const large = deg > 180 ? 1 : 0;
        return `M ${CX} ${CY} L ${CX} ${CY - R} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
    }

    function drawWedgePixi(g, radius, deg, isUrgent) {
        g.clear();
        if (deg < 0.5) return;
        const start = -Math.PI / 2;
        const end = start + (deg * Math.PI) / 180;
        g.beginFill(isUrgent ? 0xff6040 : 0xe09830, isUrgent ? 0.92 : 0.88);
        g.moveTo(0, 0);
        g.arc(0, 0, radius * 0.86, start, end);
        g.lineTo(0, 0);
        g.endFill();
    }

    function buildClockGfx(PIXI, size) {
        const root = new PIXI.Container();
        const cx = size / 2;
        const cy = size / 2;
        root.position.set(cx, cy);
        const radius = size * 0.41;

        const wedge = new PIXI.Graphics();
        const ticks = new PIXI.Graphics();
        ticks.lineStyle(1.4, 0x4a2818, 0.85);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            ticks.moveTo(Math.cos(a) * (radius - 5), Math.sin(a) * (radius - 5));
            ticks.lineTo(Math.cos(a) * (radius - 11), Math.sin(a) * (radius - 11));
        }

        const hand = new PIXI.Container();
        const handLine = new PIXI.Graphics();
        handLine.lineStyle(Math.max(3, radius * 0.1), 0x4a2818, 1);
        handLine.moveTo(0, 3);
        handLine.lineTo(0, -radius * 0.7);
        const hub = new PIXI.Graphics();
        hub.beginFill(0x4a2818);
        hub.drawCircle(0, 0, radius * 0.085);
        hub.endFill();
        hand.addChild(handLine, hub);

        root.addChild(wedge, ticks, hand);
        return { root, wedge, hand, R: radius, cx, cy };
    }

    function ensureDialEl(mount) {
        let dial = mount.querySelector(".df-arena-clock-pixi-dial");
        if (!dial) {
            dial = document.createElement("div");
            dial.className = "df-arena-clock-pixi-dial";
            dial.setAttribute("aria-hidden", "true");
            mount.insertBefore(dial, mount.firstChild);
        }
        return dial;
    }

    function ensureSecondsEl(mount) {
        let sec = mount.querySelector(".df-arena-clock-pixi-sec");
        if (!sec) {
            sec = document.createElement("span");
            sec.className = "df-arena-clock-pixi-sec";
            sec.setAttribute("aria-live", "off");
            mount.appendChild(sec);
        }
        return sec;
    }

    function ensureDomDial(mount) {
        const dial = ensureDialEl(mount);
        dial.querySelector("canvas")?.remove();
        let svg = dial.querySelector(".df-arena-clock-dom-svg");
        if (!svg) {
            const NS = "http://www.w3.org/2000/svg";
            svg = document.createElementNS(NS, "svg");
            svg.setAttribute("class", "df-arena-clock-dom-svg");
            svg.setAttribute("viewBox", "0 0 64 64");
            svg.setAttribute("aria-hidden", "true");
            svg.innerHTML =
                '<defs>' +
                '<linearGradient id="df-mobile-clock-wedge-fill" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0%" stop-color="#8b5a28"/>' +
                '<stop offset="55%" stop-color="#d4a040"/>' +
                '<stop offset="100%" stop-color="#f0c868"/>' +
                '</linearGradient>' +
                '<linearGradient id="df-mobile-clock-wedge-urgent" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0%" stop-color="#8b1a12"/>' +
                '<stop offset="100%" stop-color="#ff7040"/>' +
                '</linearGradient>' +
                '</defs>' +
                '<circle cx="32" cy="8.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="43.5" cy="11.8" r="1.4" fill="#4a2818"/>' +
                '<circle cx="52.2" cy="20.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="55.5" cy="32" r="1.4" fill="#4a2818"/>' +
                '<circle cx="52.2" cy="43.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="43.5" cy="52.2" r="1.4" fill="#4a2818"/>' +
                '<circle cx="32" cy="55.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="20.5" cy="52.2" r="1.4" fill="#4a2818"/>' +
                '<circle cx="11.8" cy="43.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="8.5" cy="32" r="1.4" fill="#4a2818"/>' +
                '<circle cx="11.8" cy="20.5" r="1.4" fill="#4a2818"/>' +
                '<circle cx="20.5" cy="11.8" r="1.4" fill="#4a2818"/>' +
                '<path class="df-arena-clock-wedge-path" fill="url(#df-mobile-clock-wedge-fill)" opacity="0.88"/>' +
                '<g class="df-arena-clock-hand-g">' +
                '<line x1="32" y1="34" x2="32" y2="10" stroke="#4a2818" stroke-width="3.5" stroke-linecap="round"/>' +
                '<circle cx="32" cy="34" r="2.8" fill="#4a2818"/>' +
                '</g>';
            dial.appendChild(svg);
        }
        domDial = {
            wedge: svg.querySelector(".df-arena-clock-wedge-path"),
            hand: svg.querySelector(".df-arena-clock-hand-g"),
        };
        return domDial;
    }

    function setDomProgress(p) {
        if (!domDial) return;
        const deg = Math.min(1, Math.max(0, p)) * 360;
        if (domDial.wedge) {
            domDial.wedge.setAttribute("d", wedgePath(deg));
            domDial.wedge.setAttribute("fill", urgent
                ? "url(#df-mobile-clock-wedge-urgent)"
                : "url(#df-mobile-clock-wedge-fill)");
        }
        if (domDial.hand) {
            domDial.hand.setAttribute("transform", `rotate(${deg.toFixed(2)} ${CX} ${CY})`);
        }
    }

    async function ensurePixiClock() {
        if (app) return app;
        if (loadPromise) return loadPromise;
        const el = mountEl();
        if (!el) return null;
        const dial = ensureDialEl(el);

        loadPromise = (async () => {
            try {
                await loadPixiScript();
                await ensureGsap();
                const PIXI = window.PIXI;
                if (!PIXI?.Application) return null;

                const size = 96;
                const a = new PIXI.Application({
                    width: size,
                    height: size,
                    backgroundAlpha: 0,
                    antialias: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                    autoDensity: true,
                });
                dial.querySelector(".df-arena-clock-dom-svg")?.remove();
                dial.innerHTML = "";
                a.view.style.cssText = "display:block;width:100%;height:100%;pointer-events:none;";
                dial.appendChild(a.view);

                gfx = buildClockGfx(PIXI, size);
                a.stage.addChild(gfx.root);
                app = a;
                domFallback = false;
                domDial = null;
                resizeToMount();
                return a;
            } catch (e) {
                console.warn("[DfArenaClockPixi]", e);
                return null;
            } finally {
                loadPromise = null;
            }
        })();
        return loadPromise;
    }

    function activateDomFallback() {
        const el = mountEl();
        if (!el) return false;
        if (app?.destroy) {
            try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch (e) { /* */ }
        }
        app = null;
        gfx = null;
        domFallback = true;
        ensureDomDial(el);
        setDomProgress(progress);
        return true;
    }

    function resizeToMount() {
        const el = mountEl();
        const dial = el?.querySelector(".df-arena-clock-pixi-dial");
        if (!app?.renderer || !el || !dial || el.hidden || domFallback) return;
        const px = parseFloat(getComputedStyle(dial).width)
            || parseFloat(el.style.getPropertyValue("--df-clock-pixi-size"))
            || 96;
        const size = Math.max(48, Math.round(px));
        if (Math.abs(app.renderer.width - size) > 1) {
            app.renderer.resize(size, size);
            if (gfx) {
                app.stage.removeChild(gfx.root);
                gfx = buildClockGfx(window.PIXI, size);
                app.stage.addChild(gfx.root);
                setProgress(progress, { instant: true });
            }
        }
    }

    function syncSecondsFromDom() {
        const mount = mountEl();
        const sec = mount ? ensureSecondsEl(mount) : null;
        const d = document.getElementById("timer-display");
        const next = String(d?.textContent ?? "--");
        if (sec && sec.textContent !== next) sec.textContent = next;
        const nextUrgent = !!d?.classList.contains("urgent");
        if (nextUrgent !== urgent) {
            urgent = nextUrgent;
            if (sec) sec.classList.toggle("is-urgent", urgent);
            if (domFallback) setDomProgress(progress);
            else if (gfx) drawWedgePixi(gfx.wedge, gfx.R, progress * 360, urgent);
        }
    }

    function setProgress(p, opts) {
        progress = Math.min(1, Math.max(0, p));
        if (domFallback) {
            setDomProgress(progress);
            return;
        }
        if (!gfx) return;
        const deg = progress * 360;
        drawWedgePixi(gfx.wedge, gfx.R, deg, urgent);
        const rot = (deg * Math.PI) / 180;
        const gsap = window.gsap;
        if (gsap && !opts?.instant) {
            gsap.killTweensOf(gfx.hand);
            gsap.to(gfx.hand, { rotation: rot, duration: 0.45, ease: "power3.out" });
            gsap.fromTo(
                gfx.hand.scale,
                { x: 1.06, y: 1.06 },
                { x: 1, y: 1, duration: 0.35, ease: "back.out(2)" }
            );
        } else {
            gfx.hand.rotation = rot;
        }
    }

    function syncPosition() {
        const el = mountEl();
        const game = document.getElementById("game");
        if (!el || !visible || !game?.classList.contains("active") || !isMobileMode()) return;

        const art = {
            w: MOBILE_ART.w,
            h: MOBILE_ART.h,
            x: MOBILE_ART.x,
            y: MOBILE_ART.y,
            wPct: MOBILE_ART.wPct,
        };
        if (window.DfLayout?.applyCombatPedestalCover?.(el, art, null)) {
            el.dataset.dfPedestalSync = "stage-cover";
            el.style.setProperty("z-index", "221", "important");
            requestAnimationFrame(() => {
                const shellPx = parseFloat(el.style.width) || el.getBoundingClientRect().width;
                if (shellPx > 4) {
                    const dial = ensureDialEl(el);
                    el.style.setProperty("--df-clock-pixi-size", shellPx.toFixed(1) + "px");
                    dial.style.width = shellPx.toFixed(1) + "px";
                    dial.style.height = shellPx.toFixed(1) + "px";
                    el.style.setProperty("width", "auto", "important");
                    el.style.setProperty("height", "auto", "important");
                    resizeToMount();
                }
            });
        }
    }

    function showMount() {
        const el = mountEl();
        const dom = document.getElementById("desktop-timer");
        if (el) {
            el.hidden = false;
            el.setAttribute("aria-hidden", "false");
            el.classList.add("df-arena-clock-pixi-mount--live");
            ensureDialEl(el);
            ensureSecondsEl(el);
        }
        document.documentElement.classList.add("df-mobile-arena-clock-live");
        if (dom) {
            dom.classList.add("df-arena-clock--pixi");
            dom.hidden = true;
            dom.setAttribute("aria-hidden", "true");
        }
    }

    function hideMount(opts) {
        const el = mountEl();
        if (el && !opts?.keepHidden) {
            el.hidden = true;
            el.setAttribute("aria-hidden", "true");
            el.classList.remove("df-arena-clock-pixi-mount--live");
        }
        document.documentElement.classList.remove("df-mobile-arena-clock-live");
        document.getElementById("desktop-timer")?.classList.remove("df-arena-clock--pixi", "df-arena-clock--pixi-fallback");
    }

    async function start(_durationSec, show) {
        stop({ keepHidden: !show });
        if (!show || !isMobileMode()) return false;

        visible = true;
        showMount();

        // DOM/SVG — evita segundo contexto WebGL competindo com VFX Pixi da partida.
        activateDomFallback();

        syncPosition();
        syncSecondsFromDom();
        setProgress(0, { instant: true });
        return true;
    }

    function stop(opts) {
        visible = false;
        progress = 0;
        domFallback = false;
        domDial = null;
        hideMount(opts);
        if (gfx) setProgress(0, { instant: true });
    }

    window.DfArenaClockPixi = Object.freeze({
        isMobileMode,
        start,
        stop,
        setProgress,
        syncPosition,
        syncSeconds: syncSecondsFromDom,
    });

    window.addEventListener("resize", () => {
        if (visible) syncPosition();
    }, { passive: true });
    window.addEventListener("df-layout-sync", () => {
        if (visible) syncPosition();
    }, { passive: true });

    setInterval(() => {
        if (visible) syncSecondsFromDom();
    }, 200);
})();
