/**
 * Dragonfall — Modo dev de layout (localhost apenas).
 * Ativar: ?df_layout=1 ou Ctrl+Shift+L
 * Foco: combate (HUD, pedestais, arena) + hub + menu splash.
 */
(function (global) {
    "use strict";

    const STORAGE_KEY = "df_layout_dev_state";
    const LOCK_ATTR = "data-df-layout-dev-lock";

    function isLocalHost() {
        const h = global.location?.hostname || "";
        return /^(localhost|127\.0\.0\.1)$/i.test(h);
    }

    function queryEnabled() {
        try {
            return new URLSearchParams(global.location.search).has("df_layout");
        } catch (e) {
            return false;
        }
    }

    const SCREENS = Object.freeze({
        combat: "combate",
        hub: "hub",
        menu: "menu",
    });

    /** @type {Array<{ id: string, label: string, screen: string, unit: "percent"|"canvas-px"|"viewport-px", parentId?: string, props: string[], cssSelector: string, cssFile: string }>} */
    const TARGETS = [
        /* —— Combate: arena —— */
        {
            id: "game-grid",
            label: "Grade da arena (padding)",
            screen: "combat",
            unit: "padding",
            props: ["padding"],
            cssSelector: "html.df-mobile-desktop-fit.df-combat-canvas #game.active #game-grid.mode-2",
            cssFile: "css/df-canvas-shield.css",
        },
        /* —— Combate: HUD —— */
        {
            id: "desktop-logo",
            label: "Logo / menu combate",
            screen: "combat",
            unit: "canvas-px",
            props: ["top", "left", "width", "height"],
            cssSelector: "html.df-mobile-desktop-fit:has(#game.active) #df-scale-root #desktop-logo",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "desktop-left-hud",
            label: "Hub herói IA (esq.)",
            screen: "combat",
            unit: "canvas-px",
            props: ["bottom", "left"],
            cssSelector: "html.df-mobile-desktop-fit:has(#game.active) #df-scale-root #desktop-left-hud",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "desktop-right-hud",
            label: "Hub herói jogador (dir.)",
            screen: "combat",
            unit: "canvas-px",
            props: ["bottom", "right", "left", "width"],
            cssSelector: "html.df-mobile-desktop-fit:has(#game.active) #df-scale-root #desktop-right-hud",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "desktop-turn-indicator",
            label: "Relógio de turno",
            screen: "combat",
            unit: "canvas-px",
            props: ["top", "right"],
            cssSelector: "html.df-mobile-desktop-fit:has(#game.active) #df-scale-root #desktop-turn-indicator",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "quadrant-0-hand",
            selector: "#quadrant-0 .quadrant-hand",
            label: "Mão do jogador",
            screen: "combat",
            unit: "transform-drag",
            props: ["transform"],
            cssSelector: "html.df-mobile-desktop-fit.df-combat-canvas #quadrant-0 .quadrant-hand",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "quadrant-1-hand",
            selector: "#quadrant-1 .quadrant-hand",
            label: "Mão da IA",
            screen: "combat",
            unit: "transform-drag",
            props: ["transform"],
            cssSelector: "html.df-mobile-desktop-fit.df-combat-canvas .ai-quadrant .quadrant-hand",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "quadrant-0-field",
            selector: "#quadrant-0 .quadrant-field",
            label: "Campo do jogador",
            screen: "combat",
            unit: "transform-drag",
            props: ["transform"],
            cssSelector: "html.df-mobile-desktop-fit #quadrant-0 .quadrant-field",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "quadrant-1-field",
            selector: "#quadrant-1 .quadrant-field",
            label: "Campo da IA",
            screen: "combat",
            unit: "transform-drag",
            props: ["transform"],
            cssSelector: "html.df-mobile-desktop-fit .ai-quadrant .quadrant-field",
            cssFile: "css/df-canvas-shield.css",
        },
        {
            id: "df-ultimate-count-pedestal",
            label: "Número — ultimates",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width", "font-size"],
            cssSelector: "#df-ultimate-count-pedestal",
            cssFile: "css/df-ultimate-pedestal.css",
        },
        {
            id: "df-deck-count-pedestal",
            label: "Número — baralho",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width", "font-size"],
            cssSelector: "#df-deck-count-pedestal",
            cssFile: "css/df-buy-card-pedestal.css",
        },
        {
            id: "df-actions-label-pedestal",
            label: "Rótulo — Ações",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width", "font-size"],
            cssSelector: "#df-actions-label-pedestal",
            cssFile: "css/df-actions-pedestal.css",
        },
        {
            id: "df-actions-count-pedestal",
            label: "Número — ações",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width", "font-size"],
            cssSelector: "#df-actions-count-pedestal",
            cssFile: "css/df-actions-pedestal.css",
        },
        /* —— Combate: pedestais —— */
        {
            id: "df-pass-turn-pedestal",
            label: "Pedestal passar vez",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "html.df-mobile-desktop-fit body > #df-pass-turn-pedestal[data-df-pedestal-sync=\"stage-cover\"]",
            cssFile: "css/df-pass-turn-pedestal.css",
        },
        {
            id: "df-ultimate-pedestal",
            label: "Pedestal ultimate",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "#df-ultimate-pedestal",
            cssFile: "css/df-ultimate-pedestal.css",
        },
        {
            id: "df-buy-card-pedestal",
            label: "Pedestal comprar carta",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "#df-buy-card-pedestal",
            cssFile: "css/df-buy-card-pedestal.css",
        },
        {
            id: "df-combat-opcoes-pedestal",
            label: "Pedestal opções (combate)",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "#df-combat-opcoes-pedestal",
            cssFile: "css/df-combat-opcoes-pedestal.css",
        },
        {
            id: "df-deck-badge",
            label: "Badge baralho jogador",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "#df-deck-badge",
            cssFile: "css/df-deck-badge.css",
        },
        {
            id: "df-deck-badge-ai",
            label: "Badge baralho IA",
            screen: "combat",
            unit: "viewport-px",
            props: ["left", "top", "width"],
            cssSelector: "#df-deck-badge-ai",
            cssFile: "css/df-deck-badge.css",
        },
        /* —— Hub —— */
        {
            id: "btn-hub-mercado",
            label: "Hub — Mercado",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "bottom", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-mercado",
            cssFile: "css/df-game-menu.css",
        },
        {
            id: "btn-hub-jogar",
            label: "Hub — Jogar",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "bottom", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-jogar",
            cssFile: "css/df-game-menu.css",
        },
        {
            id: "btn-hub-arsenal",
            label: "Hub — Arsenal",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "bottom", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-arsenal",
            cssFile: "css/df-game-menu.css",
        },
        {
            id: "btn-hub-opcoes",
            label: "Hub — Opções",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "top", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-opcoes",
            cssFile: "css/df-game-menu.css",
        },
        {
            id: "btn-hub-notas",
            label: "Hub — Notas",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "top", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-notas",
            cssFile: "css/df-game-menu.css",
        },
        {
            id: "hub-splash-btn-profile",
            label: "Hub — Perfil",
            screen: "hub",
            unit: "percent",
            parentId: "df-hub-splash-layer",
            props: ["left", "top", "width"],
            cssSelector: "#df-hub-splash-layer .hub-splash-btn-profile",
            cssFile: "css/df-game-menu.css",
        },
        /* —— Menu splash —— */
        {
            id: "btn-main-play",
            label: "Menu — Jogar",
            screen: "menu",
            unit: "percent",
            parentId: "df-menu-splash-layer",
            props: ["left", "bottom", "width"],
            cssSelector: "#df-menu-splash-layer #btn-main-play.main-play-btn",
            cssFile: "css/df-game-menu.css",
        },
    ];

    const COMBAT_VARS = [
        { name: "--df-d-ai-fr", label: "Zona IA (fr)", step: 0.01, fr: true },
        { name: "--df-d-player-fr", label: "Zona jogador (fr)", step: 0.01, fr: true },
        { name: "--df-field-card-w", label: "Carta no campo — largura", step: 1, suffix: "px" },
        { name: "--df-field-card-h", label: "Carta no campo — altura", step: 1, suffix: "px" },
        { name: "--df-hand-card-w", label: "Carta na mão — largura", step: 1, suffix: "px" },
        { name: "--df-hand-card-h", label: "Carta na mão — altura", step: 1, suffix: "px" },
        { name: "--df-player-hand-y-nudge", label: "Mão jogador Y", step: 1, suffix: "px" },
        { name: "--df-ai-hand-lift", label: "Mão IA lift", step: 1, suffix: "px" },
        { name: "--df-ai-hand-visible-h", label: "Mão IA — altura visível", step: 1, suffix: "px" },
        { name: "--df-player-field-y-bias", label: "Campo jogador Y", step: 1, suffix: "px" },
        { name: "--df-ai-field-y-bias", label: "Campo IA Y", step: 1, suffix: "px" },
        { name: "--df-player-field-y-nudge", label: "Campo jogador nudge", step: 1, suffix: "px" },
        { name: "--df-ai-field-y-nudge", label: "Campo IA nudge", step: 1, suffix: "px" },
        { name: "--df-ai-field-hand-gap", label: "Gap IA campo/mão", step: 1, suffix: "px" },
        { name: "--df-player-field-hand-gap", label: "Gap jogador campo/mão", step: 1, suffix: "px" },
        { name: "--df-hand-pan-x", label: "Mão — pan horizontal", step: 1, suffix: "px" },
        { name: "--df-arena-center-x", label: "Centro arena X", step: 1, suffix: "px" },
        { name: "--df-hero-hub-max-w", label: "Largura máx. hub", step: 1, suffix: "px" },
        { name: "--df-ultct-slot-size", label: "Fonte nº ultimate", step: 1, suffix: "px" },
        { name: "--df-deck-badge-size", label: "Tamanho badge baralho", step: 1, suffix: "px" },
    ];

    const targetById = new Map(TARGETS.map((t) => [t.id, t]));

    let active = false;
    let panelVisible = true;
    let currentScreen = "combat";
    let selectedId = null;
    let dragState = null;
    let resizeState = null;
    let combatPreviewActive = false;
    let panelEl = null;
    let exportTa = null;

    const state = {
        elements: {},
        vars: {},
    };

    function isLocked(el) {
        return !!(el && el.getAttribute(LOCK_ATTR) === "1");
    }

    function lockEl(el) {
        if (el) el.setAttribute(LOCK_ATTR, "1");
    }

    function loadState() {
        try {
            const raw = global.sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed?.elements) state.elements = parsed.elements;
            if (parsed?.vars) state.vars = parsed.vars;
        } catch (e) { /* */ }
    }

    function saveState() {
        try {
            global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* */ }
    }

    function canvasScale() {
        const s = global.DfLayout?.desktopFitScale?.();
        return Number.isFinite(s) && s > 0 ? s : 1;
    }

    function getEl(id) {
        const cfg = targetById.get(id);
        if (cfg?.selector) return global.document.querySelector(cfg.selector);
        if (id === "hub-splash-btn-profile") {
            return global.document.querySelector("#df-hub-splash-layer .hub-splash-btn-profile");
        }
        return global.document.getElementById(id);
    }

    function targetNodeId(node) {
        if (!node) return "";
        const tagged = node.getAttribute?.("data-df-layout-dev-id");
        if (tagged) return tagged;
        if (node.id) return node.id;
        if (node.classList?.contains("hub-splash-btn-profile")) return "hub-splash-btn-profile";
        return "";
    }

    function readTransformTranslate(el) {
        try {
            const m = new DOMMatrix(global.getComputedStyle(el).transform);
            return { x: m.m41, y: m.m42 };
        } catch (e) {
            return { x: 0, y: 0 };
        }
    }

    function readStyleValue(el, prop) {
        const inline = el.style.getPropertyValue(prop);
        if (inline) return inline.trim();
        const cs = global.getComputedStyle(el);
        const v = cs.getPropertyValue(prop);
        if (prop === "padding" && v) return v.trim();
        if (v && v !== "auto" && v !== "none") return v.trim();
        return "";
    }

    function captureElementState(id) {
        const el = getEl(id);
        const cfg = targetById.get(id);
        if (!el || !cfg) return null;
        const snap = {};
        for (const p of cfg.props) {
            snap[p] = readStyleValue(el, p);
        }
        if (cfg.unit === "viewport-px" && (!snap.left || !snap.top)) {
            const r = el.getBoundingClientRect();
            if (!snap.left) snap.left = formatPx(r.left + r.width / 2);
            if (!snap.top) snap.top = formatPx(r.top + r.height / 2);
            if (!snap.width && r.width > 0) snap.width = formatPx(r.width);
        }
        if (cfg.unit === "canvas-px") {
            const scale = canvasScale();
            const parent = el.offsetParent || global.document.getElementById("df-scale-root");
            if (parent) {
                const pr = parent.getBoundingClientRect();
                const r = el.getBoundingClientRect();
                if (!snap.left && snap.right == null && snap.bottom != null) {
                    snap.left = formatPx((r.left - pr.left) / scale);
                } else if (!snap.left) {
                    snap.left = formatPx((r.left - pr.left) / scale);
                }
                if (!snap.top && snap.bottom != null) {
                    snap.bottom = formatPx((pr.bottom - r.bottom) / scale);
                } else if (!snap.top) {
                    snap.top = formatPx((r.top - pr.top) / scale);
                }
            }
        }
        if (cfg.unit === "transform-drag") {
            const t = readTransformTranslate(el);
            if (!snap.transform) {
                snap.transform = "translate(" + formatPx(t.x) + ", " + formatPx(t.y) + ")";
            }
        }
        return snap;
    }

    function applyElementState(id, snap, lock) {
        const el = getEl(id);
        const cfg = targetById.get(id);
        if (!el || !cfg || !snap) return;
        if (cfg.unit === "percent" || cfg.unit === "canvas-px" || cfg.unit === "viewport-px") {
            el.style.setProperty("position", "absolute", "important");
        }
        for (const [prop, val] of Object.entries(snap)) {
            if (val == null || val === "") {
                el.style.removeProperty(prop);
            } else {
                el.style.setProperty(prop, val, "important");
            }
        }
        if (cfg.unit === "viewport-px") {
            el.style.setProperty("transform", "translate(-50%, -50%)", "important");
            el.dataset.dfPedestalSync = "stage-cover";
        }
        if (lock) lockEl(el);
        el.setAttribute("data-df-layout-dev-target", "1");
        el.setAttribute("data-df-layout-dev-id", id);
        state.elements[id] = { ...snap };
        saveState();
        refreshExport();
    }

    function restoreAllElements() {
        for (const [id, snap] of Object.entries(state.elements)) {
            applyElementState(id, snap, true);
        }
    }

    function applyCombatVars() {
        const root = global.document.documentElement;
        for (const [name, val] of Object.entries(state.vars)) {
            if (val == null || val === "") root.style.removeProperty(name);
            else root.style.setProperty(name, val);
        }
    }

    function restoreVars() {
        for (const v of COMBAT_VARS) {
            if (state.vars[v.name] != null) continue;
            const cs = global.getComputedStyle(global.document.documentElement);
            const cur = cs.getPropertyValue(v.name).trim();
            if (cur) state.vars[v.name] = cur;
        }
        applyCombatVars();
    }

    function detectAnchors(el) {
        const cs = global.getComputedStyle(el);
        return {
            h: cs.left !== "auto" ? "left" : "right",
            v: cs.top !== "auto" ? "top" : "bottom",
        };
    }

    function parsePx(val) {
        const n = parseFloat(val);
        return Number.isFinite(n) ? n : 0;
    }

    function parsePercent(val) {
        const n = parseFloat(String(val).replace("%", ""));
        return Number.isFinite(n) ? n : 0;
    }

    function formatPercent(n) {
        return (Math.round(n * 100) / 100) + "%";
    }

    function formatPx(n) {
        return Math.round(n) + "px";
    }

    function onPointerDown(e) {
        if (!active) return;
        const t = e.target.closest("[data-df-layout-dev-target]");
        if (!t || panelEl?.contains(t)) return;
        const id = targetNodeId(t);
        if (!id || !targetById.get(id)) return;
        const cfg = targetById.get(id);
        if (cfg.screen !== currentScreen) return;

        if (e.target.closest(".df-layout-dev-resize-handle")) {
            startResize(e, id, t);
            return;
        }

        selectTarget(id);
        startDrag(e, id, t);
    }

    function startDrag(e, id, el) {
        e.preventDefault();
        e.stopPropagation();
        const cfg = targetById.get(id);
        const anchors = detectAnchors(el);
        const snap = captureElementState(id) || {};
        const dragExtra = {};
        if (cfg.unit === "transform-drag") {
            dragExtra.startTransform = readTransformTranslate(el);
        }
        dragState = {
            id,
            el,
            cfg,
            anchors,
            startX: e.clientX,
            startY: e.clientY,
            startSnap: { ...snap },
            ...dragExtra,
        };
        lockEl(el);
        global.document.addEventListener("pointermove", onPointerMove, true);
        global.document.addEventListener("pointerup", onPointerUp, true);
    }

    function startResize(e, id, el) {
        e.preventDefault();
        e.stopPropagation();
        const cfg = targetById.get(id);
        if (!cfg.props.includes("width")) return;
        resizeState = {
            id,
            el,
            cfg,
            startX: e.clientX,
            startW: el.getBoundingClientRect().width,
            startSnap: captureElementState(id) || {},
        };
        lockEl(el);
        global.document.addEventListener("pointermove", onResizeMove, true);
        global.document.addEventListener("pointerup", onResizeUp, true);
    }

    function onPointerMove(e) {
        if (!dragState) return;
        e.preventDefault();
        const { id, el, cfg, anchors, startX, startY, startSnap } = dragState;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const snap = { ...startSnap };

        if (cfg.unit === "percent") {
            const parent = global.document.getElementById(cfg.parentId || "df-hub-splash-layer");
            if (!parent) return;
            const pr = parent.getBoundingClientRect();
            const hProp = anchors.h;
            const vProp = anchors.v;
            if (hProp === "left" && startSnap.left) {
                snap.left = formatPercent(parsePercent(startSnap.left) + (dx / pr.width) * 100);
            } else if (hProp === "right" && startSnap.right) {
                snap.right = formatPercent(parsePercent(startSnap.right) - (dx / pr.width) * 100);
            } else if (startSnap.left) {
                snap.left = formatPercent(parsePercent(startSnap.left) + (dx / pr.width) * 100);
            }
            if (vProp === "top" && startSnap.top) {
                snap.top = formatPercent(parsePercent(startSnap.top) + (dy / pr.height) * 100);
            } else if (vProp === "bottom" && startSnap.bottom) {
                snap.bottom = formatPercent(parsePercent(startSnap.bottom) - (dy / pr.height) * 100);
            } else if (startSnap.bottom) {
                snap.bottom = formatPercent(parsePercent(startSnap.bottom) - (dy / pr.height) * 100);
            }
        } else if (cfg.unit === "canvas-px") {
            const scale = canvasScale();
            const hProp = anchors.h;
            const vProp = anchors.v;
            if (hProp === "left") {
                snap.left = formatPx(parsePx(startSnap.left || "0") + dx / scale);
            } else if (startSnap.right) {
                snap.right = formatPx(parsePx(startSnap.right || "0") - dx / scale);
            }
            if (vProp === "top") {
                snap.top = formatPx(parsePx(startSnap.top || "0") + dy / scale);
            } else if (startSnap.bottom) {
                snap.bottom = formatPx(parsePx(startSnap.bottom || "0") - dy / scale);
            }
        } else if (cfg.unit === "viewport-px") {
            snap.left = formatPx(parsePx(startSnap.left || "0") + dx);
            snap.top = formatPx(parsePx(startSnap.top || "0") + dy);
            el.style.setProperty("position", "fixed", "important");
            if (!snap.fontSize && !startSnap["font-size"]) {
                el.style.setProperty("transform", "translate(-50%, -50%)", "important");
            }
        } else if (cfg.unit === "transform-drag") {
            const scale = canvasScale();
            const st = dragState.startTransform || { x: 0, y: 0 };
            snap.transform = "translate("
                + formatPx(st.x + dx / scale) + ", "
                + formatPx(st.y + dy / scale) + ")";
        } else if (cfg.unit === "padding") {
            /* padding editado só via painel */
        }

        applyElementState(id, snap, true);
        updatePropInputs(id);
    }

    function onPointerUp() {
        dragState = null;
        global.document.removeEventListener("pointermove", onPointerMove, true);
        global.document.removeEventListener("pointerup", onPointerUp, true);
    }

    function onResizeMove(e) {
        if (!resizeState) return;
        e.preventDefault();
        const { id, el, cfg, startX, startW, startSnap } = resizeState;
        const dx = e.clientX - startX;
        const snap = { ...startSnap };

        if (cfg.unit === "percent") {
            const parent = global.document.getElementById(cfg.parentId || "df-hub-splash-layer");
            if (!parent) return;
            const pr = parent.getBoundingClientRect();
            const w0 = startW / pr.width * 100;
            snap.width = formatPercent(w0 + (dx / pr.width) * 100);
        } else if (cfg.unit === "canvas-px" || cfg.unit === "viewport-px") {
            const scale = cfg.unit === "viewport-px" ? 1 : canvasScale();
            snap.width = formatPx(startW / scale + dx / scale);
        }

        applyElementState(id, snap, true);
        updatePropInputs(id);
    }

    function onResizeUp() {
        resizeState = null;
        global.document.removeEventListener("pointermove", onResizeMove, true);
        global.document.removeEventListener("pointerup", onResizeUp, true);
    }

    function selectTarget(id) {
        selectedId = id;
        global.document.querySelectorAll("[data-df-layout-dev-target]").forEach((n) => {
            n.classList.toggle("df-layout-dev-selected", targetNodeId(n) === id);
        });
        renderTargetList();
        updatePropInputs(id);
    }

    function updatePropInputs(id) {
        const cfg = targetById.get(id);
        const propRoot = panelEl?.querySelector(".df-ld-props");
        if (!cfg || !propRoot) return;
        propRoot.innerHTML = "";
        const snap = state.elements[id] || captureElementState(id) || {};
        for (const p of cfg.props) {
            const label = global.document.createElement("label");
            label.textContent = p;
            const input = global.document.createElement("input");
            input.type = "text";
            input.value = snap[p] || "";
            input.dataset.prop = p;
            input.addEventListener("change", () => {
                const next = { ...(state.elements[id] || captureElementState(id) || {}) };
                next[p] = input.value.trim();
                applyElementState(id, next, true);
                refreshExport();
            });
            propRoot.appendChild(label);
            propRoot.appendChild(input);
        }
    }

    function buildCssForTarget(id) {
        const cfg = targetById.get(id);
        const snap = state.elements[id];
        if (!cfg || !snap) return "";
        const lines = Object.entries(snap)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => "    " + k + ": " + v + " !important;");
        if (!lines.length) return "";
        return "/* " + cfg.cssFile + " */\n" + cfg.cssSelector + " {\n" + lines.join("\n") + "\n}\n";
    }

    function buildVarsCss() {
        const lines = Object.entries(state.vars)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => "    " + k + ": " + v + ";");
        if (!lines.length) return "";
        return "/* css/df-canvas-shield.css — html.df-mobile-desktop-fit */\nhtml.df-mobile-desktop-fit {\n"
            + lines.join("\n") + "\n}\n";
    }

    function buildFullExportCss() {
        const parts = [];
        for (const id of Object.keys(state.elements)) {
            const block = buildCssForTarget(id);
            if (block) parts.push(block);
        }
        const varsBlock = buildVarsCss();
        if (varsBlock) parts.push(varsBlock);
        return parts.join("\n");
    }

    async function saveLayoutToProject() {
        const css = buildFullExportCss();
        if (!css.trim()) {
            setSaveStatus("Nada para salvar — arraste ou ajuste algo primeiro.", true);
            return;
        }
        setSaveStatus("Salvando…", false);
        try {
            const res = await fetch("/__df/dev/layout-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ css, rebuild: true }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Falha no servidor");
            }
            try { global.sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* */ }
            setSaveStatus(
                "Salvo em css/df-layout-author.css"
                + (data.version ? " · v" + data.version : "")
                + " — recarregando…",
                false,
            );
            global.setTimeout(() => global.location.reload(), 900);
        } catch (e) {
            setSaveStatus(
                "Use npm run df:serve (não abra arquivo direto). " + (e?.message || ""),
                true,
            );
        }
    }

    function setSaveStatus(msg, isError) {
        const el = panelEl?.querySelector("#df-ld-save-status");
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? "#ff9a9a" : "#9fd4ff";
    }

    function seedPreviewCard(parent, className, w, h) {
        const c = global.document.createElement("div");
        c.className = className;
        c.setAttribute("data-df-layout-preview", "1");
        c.style.width = w || "var(--df-hand-card-w, 108px)";
        c.style.height = h || "var(--df-hand-card-h, 150px)";
        c.style.background = "url('verso.png') center/cover no-repeat";
        c.style.borderRadius = "8px";
        c.style.border = "2px solid rgba(255,255,255,0.25)";
        c.style.flexShrink = "0";
        parent.appendChild(c);
        return c;
    }

    function enterCombatPreview() {
        const game = global.document.getElementById("game");
        const grid = global.document.getElementById("game-grid");
        if (!game || !grid) return;
        combatPreviewActive = true;
        global.document.documentElement.classList.add("df-combat-canvas", "df-layout-dev-combat-preview");
        global.document.querySelectorAll("#df-scale-root > .screen").forEach((s) => s.classList.remove("active"));
        game.classList.add("active");
        game.style.display = "";
        grid.classList.add("mode-2");

        const show = (id) => {
            const el = global.document.getElementById(id);
            if (!el) return;
            el.hidden = false;
            el.removeAttribute("hidden");
            el.style.visibility = "visible";
        };
        [
            "desktop-logo", "desktop-left-hud", "desktop-right-hud", "desktop-turn-indicator",
            "df-pass-turn-pedestal", "df-ultimate-pedestal", "df-buy-card-pedestal", "df-combat-opcoes-pedestal",
            "df-ultimate-count-pedestal", "df-deck-count-pedestal",
            "df-actions-label-pedestal", "df-actions-count-pedestal",
            "df-deck-badge-ai",
        ].forEach(show);

        const pHand = global.document.querySelector("#quadrant-0 .quadrant-hand");
        const aHand = global.document.querySelector("#quadrant-1 .quadrant-hand");
        const pField = global.document.querySelector("#quadrant-0 .quadrant-field");
        const aField = global.document.querySelector("#quadrant-1 .quadrant-field");

        if (pHand && !pHand.querySelector("[data-df-layout-preview]")) {
            for (let i = 0; i < 5; i++) seedPreviewCard(pHand, "hcard");
        }
        if (aHand && !aHand.querySelector("[data-df-layout-preview]")) {
            for (let i = 0; i < 4; i++) seedPreviewCard(aHand, "ai-back", "70px", "97px");
        }
        if (pField && !pField.querySelector("[data-df-layout-preview]")) {
            for (let i = 0; i < 3; i++) seedPreviewCard(pField, "ccard", "var(--df-field-card-w,97px)", "var(--df-field-card-h,136px)");
        }
        if (aField && !aField.querySelector("[data-df-layout-preview]")) {
            for (let i = 0; i < 2; i++) seedPreviewCard(aField, "ccard", "var(--df-field-card-w,97px)", "var(--df-field-card-h,136px)");
        }

        const ultNum = global.document.getElementById("df-ultimate-count-pedestal-num");
        if (ultNum) ultNum.textContent = "2";
        const deckNum = global.document.getElementById("df-deck-count-pedestal-num");
        if (deckNum) deckNum.textContent = "24";
        const actNum = global.document.getElementById("df-actions-count-pedestal-num");
        if (actNum) actNum.textContent = "3";

        try { global.window.__dfScheduleFan?.(); } catch (e) { /* */ }
        try { global.DfLayout?.syncCombatPedestals?.(); } catch (e) { /* */ }
        try { global.DfLayout?.pinCombatCanvas?.(); } catch (e) { /* */ }

        setScreen("combat");
        setSaveStatus("Preview de combate ativo — arraste mãos, campo, números e HUD.", false);
    }

    function refreshExport() {
        if (!exportTa) return;
        exportTa.value = buildFullExportCss()
            || "/* Nenhuma alteração ainda — use Preview de combate, arraste elementos ou ajuste variáveis. */";
    }

    function copyExport() {
        const text = exportTa?.value || "";
        if (global.navigator.clipboard?.writeText) {
            global.navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        if (!exportTa) return;
        exportTa.focus();
        exportTa.select();
        try { global.document.execCommand("copy"); } catch (e) { /* */ }
    }

    function resetSelection() {
        if (!selectedId) return;
        const el = getEl(selectedId);
        if (el) {
            el.removeAttribute(LOCK_ATTR);
            const cfg = targetById.get(selectedId);
            if (cfg) {
                for (const p of cfg.props) el.style.removeProperty(p);
            }
        }
        delete state.elements[selectedId];
        saveState();
        selectedId = null;
        refreshExport();
        renderTargetList();
        panelEl.querySelector(".df-ld-props").innerHTML = "";
    }

    function resetAll() {
        for (const id of Object.keys(state.elements)) {
            const el = getEl(id);
            if (el) {
                el.removeAttribute(LOCK_ATTR);
                const cfg = targetById.get(id);
                if (cfg) for (const p of cfg.props) el.style.removeProperty(p);
            }
        }
        state.elements = {};
        state.vars = {};
        global.document.documentElement.classList.remove(
            "df-layout-dev-screen-combat", "df-layout-dev-screen-hub", "df-layout-dev-screen-menu",
        );
        saveState();
        selectedId = null;
        restoreVars();
        refreshExport();
        renderTargetList();
    }

    function setScreen(screen) {
        currentScreen = screen;
        const root = global.document.documentElement;
        root.classList.remove("df-layout-dev-screen-combat", "df-layout-dev-screen-hub", "df-layout-dev-screen-menu");
        root.classList.add("df-layout-dev-screen-" + screen);
        renderTargetList();
        markTargets();
    }

    function markTargets() {
        for (const cfg of TARGETS) {
            const el = getEl(cfg.id);
            if (!el) continue;
            if (cfg.screen === currentScreen) {
                el.setAttribute("data-df-layout-dev-target", "1");
                el.setAttribute("data-df-layout-dev-id", cfg.id);
                if (!el.querySelector(".df-layout-dev-resize-handle") && cfg.props.includes("width")) {
                    const handle = global.document.createElement("span");
                    handle.className = "df-layout-dev-resize-handle";
                    handle.setAttribute("aria-hidden", "true");
                    el.style.position = el.style.position || "absolute";
                    if (getComputedStyle(el).position === "static") {
                        el.style.setProperty("position", "relative", "important");
                    }
                    el.appendChild(handle);
                }
            } else {
                el.removeAttribute("data-df-layout-dev-target");
                el.classList.remove("df-layout-dev-selected");
            }
        }
    }

    function renderTargetList() {
        const list = panelEl?.querySelector(".df-ld-list");
        if (!list) return;
        list.innerHTML = "";
        for (const cfg of TARGETS.filter((t) => t.screen === currentScreen)) {
            const btn = global.document.createElement("button");
            btn.type = "button";
            btn.className = "df-ld-item" + (selectedId === cfg.id ? " is-selected" : "");
            btn.textContent = cfg.label + (state.elements[cfg.id] ? " •" : "");
            btn.addEventListener("click", () => selectTarget(cfg.id));
            list.appendChild(btn);
        }
    }

    function renderVarInputs() {
        const root = panelEl?.querySelector(".df-ld-vars");
        if (!root) return;
        root.innerHTML = "";
        if (currentScreen !== "combat") {
            root.parentElement.style.display = "none";
            return;
        }
        root.parentElement.style.display = "";
        for (const v of COMBAT_VARS) {
            const label = global.document.createElement("label");
            label.textContent = v.label;
            const input = global.document.createElement("input");
            input.type = "number";
            input.step = String(v.step);
            const raw = state.vars[v.name] || global.getComputedStyle(global.document.documentElement)
                .getPropertyValue(v.name).trim().replace(/px$/, "").replace(/fr$/, "");
            input.value = raw || "";
            input.addEventListener("change", () => {
                let val = input.value.trim();
                if (!val) {
                    delete state.vars[v.name];
                    global.document.documentElement.style.removeProperty(v.name);
                } else {
                    if (v.suffix === "px") val = val + "px";
                    else if (v.fr) val = val + "fr";
                    state.vars[v.name] = val;
                    global.document.documentElement.style.setProperty(v.name, val);
                }
                saveState();
                refreshExport();
            });
            root.appendChild(label);
            root.appendChild(input);
        }
    }

    function buildPanel() {
        panelEl = global.document.createElement("div");
        panelEl.id = "df-layout-dev-panel";
        panelEl.innerHTML = [
            "<header><span>Layout Dev</span><button type=\"button\" class=\"df-ld-btn\" id=\"df-ld-toggle\" title=\"Ocultar\">−</button></header>",
            "<div class=\"df-ld-hint\">Arraste os elementos na tela. Ctrl+Shift+L alterna o painel. Cole o CSS exportado no arquivo indicado.</div>",
            "<section><h3>Combate</h3>",
            "<div class=\"df-ld-actions\" style=\"margin-bottom:8px\">",
            "<button type=\"button\" class=\"df-ld-btn df-ld-btn-primary\" id=\"df-ld-preview-combat\">Abrir preview de combate</button>",
            "</div>",
            "<p class=\"df-ld-hint\" style=\"padding:0;margin:0 0 8px\">Preview coloca cartas fictícias na mão e no campo para você posicionar.</p>",
            "</section>",
            "<section><h3>Tela</h3><div class=\"df-ld-tabs\">",
            "<button type=\"button\" class=\"df-ld-tab is-active\" data-screen=\"combat\">Combate</button>",
            "<button type=\"button\" class=\"df-ld-tab\" data-screen=\"hub\">Hub</button>",
            "<button type=\"button\" class=\"df-ld-tab\" data-screen=\"menu\">Menu</button>",
            "</div></section>",
            "<section><h3>Elementos</h3><div class=\"df-ld-list\"></div></section>",
            "<section><h3>Propriedades</h3><div class=\"df-ld-props\"></div></section>",
            "<section><h3>Variáveis do combate</h3><div class=\"df-ld-props df-ld-vars\"></div></section>",
            "<section><h3>Exportar CSS</h3>",
            "<textarea readonly spellcheck=\"false\"></textarea>",
            "<div class=\"df-ld-actions\">",
            "<button type=\"button\" class=\"df-ld-btn df-ld-btn-primary df-ld-btn-save\" id=\"df-ld-save\">Salvar no jogo</button>",
            "<button type=\"button\" class=\"df-ld-btn df-ld-btn-primary\" id=\"df-ld-copy\">Copiar CSS</button>",
            "<button type=\"button\" class=\"df-ld-btn\" id=\"df-ld-reset-sel\">Reset seleção</button>",
            "<button type=\"button\" class=\"df-ld-btn\" id=\"df-ld-reset-all\">Reset tudo</button>",
            "</div>",
            "<p id=\"df-ld-save-status\" class=\"df-ld-hint\" style=\"padding:8px 0 0;margin:0\"></p>",
            "</section>",
        ].join("");
        global.document.body.appendChild(panelEl);
        exportTa = panelEl.querySelector("textarea");

        panelEl.querySelectorAll(".df-ld-tab").forEach((btn) => {
            btn.addEventListener("click", () => {
                panelEl.querySelectorAll(".df-ld-tab").forEach((b) => b.classList.remove("is-active"));
                btn.classList.add("is-active");
                setScreen(btn.dataset.screen);
                renderVarInputs();
            });
        });

        panelEl.querySelector("#df-ld-copy").addEventListener("click", copyExport);
        panelEl.querySelector("#df-ld-save").addEventListener("click", () => { saveLayoutToProject(); });
        panelEl.querySelector("#df-ld-preview-combat").addEventListener("click", enterCombatPreview);
        panelEl.querySelector("#df-ld-reset-sel").addEventListener("click", resetSelection);
        panelEl.querySelector("#df-ld-reset-all").addEventListener("click", resetAll);
        panelEl.querySelector("#df-ld-toggle").addEventListener("click", () => {
            panelVisible = !panelVisible;
            panelEl.classList.toggle("df-layout-dev-panel-hidden", !panelVisible);
        });
    }

    function enable() {
        if (active) return;
        active = true;
        global.__DF_LAYOUT_DEV_ACTIVE = true;
        loadState();
        global.document.documentElement.classList.add("df-layout-dev-active");
        buildPanel();
        setScreen("combat");
        restoreAllElements();
        restoreVars();
        markTargets();
        renderVarInputs();
        refreshExport();

        global.document.addEventListener("pointerdown", onPointerDown, true);
        try { global.sessionStorage.setItem("df_layout_dev", "1"); } catch (e) { /* */ }

        global.document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
                e.preventDefault();
                if (!active && isLocalHost()) {
                    enable();
                    return;
                }
                panelVisible = !panelVisible;
                panelEl?.classList.toggle("df-layout-dev-panel-hidden", !panelVisible);
            }
        });
    }

    function shouldBoot() {
        if (!isLocalHost()) return false;
        if (queryEnabled()) return true;
        try {
            return global.sessionStorage.getItem("df_layout_dev") === "1";
        } catch (e) {
            return false;
        }
    }

    const DfLayoutDev = Object.freeze({
        isActive: () => active,
        isLocked,
        lock: lockEl,
        targets: TARGETS,
    });

    global.DfLayoutDev = DfLayoutDev;

    function boot() {
        if (!shouldBoot()) return;
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", enable);
        } else {
            enable();
        }
    }

    boot();
})(typeof window !== "undefined" ? window : globalThis);
