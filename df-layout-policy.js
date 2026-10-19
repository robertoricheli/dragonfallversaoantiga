/**
 * Dragonfall — Política de layout universal desktop.
 * Canvas 1280×720 letterbox em todas as plataformas (desktop, tablet, mobile).
 * Fullscreen e janela usam o mesmo caminho de escala (sem layout nativo alternativo).
 */
(function (global) {
    "use strict";

    const FORCE_DESKTOP_LAYOUT = true;
    const DESKTOP_LAYOUT_W = 1280;
    const DESKTOP_LAYOUT_H = 720;
    const DEFAULT_VIEWPORT =
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    const VP_DEBOUNCE_MS = 50;
    const KEYBOARD_VV_RATIO = 0.74;
    let layoutViewportLock = null;

    function isSoftwareKeyboardLikelyOpen() {
        try {
            const vv = global.visualViewport;
            const ih = global.innerHeight | 0;
            if (!vv || !ih) return false;
            return Math.round(vv.height) < Math.round(ih * KEYBOARD_VV_RATIO);
        } catch (e) { return false; }
    }

    function shouldFreezeLayoutViewportForKeyboard() {
        const doc = global.document;
        if (!doc || !needsMobileDesktopViewport()) return false;
        if (!isTouchLikeDevice() && !isMobileUserAgent()) return false;
        if (doc.documentElement?.classList?.contains("df-soft-keyboard-lock")) return true;
        if (!isSoftwareKeyboardLikelyOpen()) {
            layoutViewportLock = null;
            return false;
        }
        const ae = doc.activeElement;
        const tag = ae?.tagName || "";
        return tag === "INPUT" || tag === "TEXTAREA";
    }

    function layoutViewportForFit() {
        const iw = global.innerWidth | 0;
        const ih = global.innerHeight | 0;
        const vv = global.visualViewport;
        const freeze = shouldFreezeLayoutViewportForKeyboard() || isSoftwareKeyboardLikelyOpen();
        if (freeze) {
            if (!layoutViewportLock) {
                layoutViewportLock = {
                    vw: Math.round(vv?.width || iw),
                    vh: ih,
                };
            }
            return layoutViewportLock;
        }
        layoutViewportLock = null;
        return {
            vw: Math.round(vv?.width || iw),
            vh: Math.round(vv?.height || ih),
        };
    }

    function lockSoftKeyboardLayout(on) {
        const root = global.document?.documentElement;
        if (!root) return;
        root.classList.toggle("df-soft-keyboard-lock", !!on);
        if (!on) layoutViewportLock = null;
        onViewportChangeImmediate();
    }

    global.dfLockSoftKeyboardLayout = lockSoftKeyboardLayout;

    function viewportDebounceMs() {
        return needsMobileDesktopViewport() ? 280 : VP_DEBOUNCE_MS;
    }

    /** Orientação física: somente vw/vh (visualViewport ou innerWidth/innerHeight). */
    function capturePhysicalViewport() {
        try {
            const fit = layoutViewportForFit();
            let vw = fit.vw;
            let vh = fit.vh;
            if (!vw || !vh) {
                const vv = global.visualViewport;
                if (vv && vv.width > 0 && vv.height > 0) {
                    vw = Math.round(vv.width);
                    vh = Math.round(vv.height);
                } else {
                    vw = global.innerWidth | 0;
                    vh = global.innerHeight | 0;
                }
            }
            if (!vw || !vh) return;
            const portrait = vh > vw;
            global.__DF_PHYSICAL_PW = Math.min(vw, vh);
            global.__DF_PHYSICAL_PH = Math.max(vw, vh);
            global.__DF_PHYSICAL_VW = vw;
            global.__DF_PHYSICAL_VH = vh;
            global.__DF_PHYSICAL_PORTRAIT = portrait;
        } catch (e) { /* */ }
    }

    capturePhysicalViewport();

    if (!(global.__DF_DEVICE_PW > 0)) {
        try {
            const sw = global.screen?.width | 0;
            const sh = global.screen?.height | 0;
            if (sw > 0 && sh > 0) {
                global.__DF_DEVICE_PW = Math.min(sw, sh);
                global.__DF_DEVICE_PH = Math.max(sw, sh);
            }
        } catch (e) { /* */ }
    }

    function isLayoutMobileQuery(query) {
        const q = String(query || "").toLowerCase().replace(/\s+/g, " ");
        if (!q) return false;
        if (q.includes("max-width") && q.includes("900")) return true;
        if (q.includes("orientation") && q.includes("portrait") && q.includes("900")) return true;
        if (q.includes("pointer: coarse")) return true;
        return false;
    }

    function isDesktopLayoutQuery(query) {
        const q = String(query || "").toLowerCase().replace(/\s+/g, " ");
        if (!q) return false;
        return q.includes("min-width") && q.includes("901");
    }

    function visibleViewportSize() {
        capturePhysicalViewport();
        try {
            const vv = global.visualViewport;
            const iw = Math.round(vv?.width || global.innerWidth || 0);
            const ih = Math.round(vv?.height || global.innerHeight || 0);
            if (iw > 0 && ih > 0) return { iw, ih };
        } catch (e) { /* */ }
        return {
            iw: global.innerWidth | 0,
            ih: global.innerHeight | 0,
        };
    }

    /** Canvas só quando a janela não cabe o layout desktop 1280×720. */
    function viewportNeedsCanvasFit() {
        const { iw, ih } = visibleViewportSize();
        const cw = global.document?.documentElement?.clientWidth | 0;
        const ch = global.document?.documentElement?.clientHeight | 0;
        if (cw > 0 && ch > 0 && (cw < DESKTOP_LAYOUT_W || ch < DESKTOP_LAYOUT_H)) return true;
        if (iw <= 0 || ih <= 0) return false;
        return iw < DESKTOP_LAYOUT_W || ih < DESKTOP_LAYOUT_H;
    }

    function fitViewportShortEdge() {
        const { iw, ih } = visibleViewportSize();
        return Math.min(iw, ih) || 0;
    }

    function devicePhysicalShortEdge() {
        return fitViewportShortEdge();
    }

    function isMobileUserAgent() {
        try {
            if (navigator.userAgentData?.mobile === true) return true;
            const ua = String(navigator.userAgent || "");
            if (/Android|webOS|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
            if (global.navigator?.platform === "MacIntel" && (navigator.maxTouchPoints | 0) > 1) return true;
        } catch (e) { /* */ }
        return false;
    }

    function isTouchLikeDevice() {
        try {
            if ((navigator.maxTouchPoints | 0) > 0) return true;
            if ("ontouchstart" in global) return true;
            const native = global.__DF_NATIVE_MATCH_MEDIA || global.matchMedia?.bind(global);
            if (native && native("(pointer: coarse)").matches) return true;
        } catch (e) { /* */ }
        return false;
    }

    function lockMobileDesktopFit() {
        global.__DF_MOBILE_FIT_LOCKED = true;
        try { global.sessionStorage?.setItem("df_mobile_fit", "1"); } catch (e) { /* */ }
    }

    function recoverMobileFitLock() {
        if (!FORCE_DESKTOP_LAYOUT) return false;
        lockMobileDesktopFit();
        return true;
    }

    function needsMobileDesktopViewport() {
        if (!FORCE_DESKTOP_LAYOUT) return false;
        lockMobileDesktopFit();
        return true;
    }

    /**
     * Fundos de combate aleatórios — mesma pintura em todas as versões.
     * Em breve o catálogo pode crescer; o id da partida fica em __DF_MATCH_ARENA_ID.
     */
    const COMBAT_ARENA_SCENARIOS = Object.freeze([
        Object.freeze({ id: "floresta-runica", rel: "bg/FLORESTA RUNICA.png" }),
        Object.freeze({ id: "ceu-e-inferno", rel: "bg/CÉU E INFERNO.png" }),
        Object.freeze({ id: "arena-cristal", rel: "bg/ARENA CRISTAL.png" }),
        Object.freeze({ id: "deserto-sem-fim", rel: "bg/DESERTO SEM FIM.png" }),
        Object.freeze({ id: "o-fundo-do-mar", rel: "bg/O FUNDO DO MAR.png" }),
        Object.freeze({ id: "castelo-da-alianca", rel: "bg/CASTELO DA ALIANÇA.png" }),
    ]);
    const COMBAT_ARENA_BY_ID = Object.freeze(
        Object.fromEntries(COMBAT_ARENA_SCENARIOS.map((s) => [s.id, s])),
    );
    const COMBAT_ARENA_DEFAULT_ID = COMBAT_ARENA_SCENARIOS[0].id;

    function normalizeCombatArenaId(id) {
        const key = String(id || "").trim();
        return COMBAT_ARENA_BY_ID[key] ? key : COMBAT_ARENA_DEFAULT_ID;
    }

    function pickCombatArenaId() {
        const i = Math.floor(Math.random() * COMBAT_ARENA_SCENARIOS.length);
        return COMBAT_ARENA_SCENARIOS[i]?.id || COMBAT_ARENA_DEFAULT_ID;
    }

    function setMatchArenaId(id) {
        const next = normalizeCombatArenaId(id);
        global.__DF_MATCH_ARENA_ID = next;
        return next;
    }

    function getMatchArenaId() {
        return normalizeCombatArenaId(global.__DF_MATCH_ARENA_ID);
    }

    function arenaRelForScenario(id) {
        const sc = COMBAT_ARENA_BY_ID[normalizeCombatArenaId(id)];
        return sc?.rel || COMBAT_ARENA_SCENARIOS[0].rel;
    }

    /** mobile | desktop-windowed | desktop-fullscreen */
    function combatArenaMode() {
        if (isMobileUserAgent() || shouldDockHudToViewportEdges()) return "mobile";
        if (isDesktopWindowedViewport()) return "desktop-windowed";
        return "desktop-fullscreen";
    }

    function arenaBgRelForMode(mode) {
        void mode;
        return arenaRelForScenario(getMatchArenaId());
    }

    function arenaBgRel() {
        return arenaBgRelForMode(combatArenaMode());
    }

    /** URL canônica (content-hash / WebP) — mesma do SW precache. */
    function arenaBgUrl(mode) {
        const rel = (mode ? arenaBgRelForMode(mode) : arenaBgRel()).split("?")[0];
        if (typeof global.dfAssetUrl === "function") return global.dfAssetUrl(rel);
        return rel;
    }

    function listCombatArenaScenarios() {
        return COMBAT_ARENA_SCENARIOS.slice();
    }

    function applyCombatArenaModeClasses(root) {
        if (!root?.classList) return;
        const combat = isCombatActive();
        const mode = combat ? combatArenaMode() : null;
        root.classList.toggle("df-arena-mobile", mode === "mobile");
        root.classList.toggle("df-arena-desktop-windowed", mode === "desktop-windowed");
        root.classList.toggle("df-arena-desktop-fullscreen", mode === "desktop-fullscreen");
        root.classList.toggle("df-combat-special", !!combat);
    }

    /** Layout Especial: pedestais ficam absolute no #game (não fixed/cover no body). */
    function useCombatSpecialLayout() {
        return isCombatActive();
    }

    /* Telas de menu ilustradas: arte no viewport inteiro (#df-rotate-stage + html),
       igual HUB/combate. data-df-menu-bg é a fonte única (evita :has() competindo
       quando sobram várias .active). Ordem = prioridade da tela da frente. */
    const MENU_ILLUSTRATED_BG = [
        { id: "hero-select", key: "hero", rel: "bg/DESOLAÇÃO.png" },
        { id: "df-ranked-hero-select", key: "hero", rel: "bg/DESOLAÇÃO.png" },
        { id: "online-lobby", key: "hero", rel: "bg/DESOLAÇÃO.png" },
        { id: "df-training-setup", key: "training", rel: "bg/A GUERRA.png" },
        { id: "df-ranked-setup", key: "training", rel: "bg/A GUERRA.png" },
        { id: "df-play-mode", key: "play", rel: "bg/FUNDO DE COMBATE.png" },
        { id: "df-arsenal", key: "arsenal", rel: "bg/SALA DE ARSENAL.png" },
    ];

    function menuBgAssetUrl(rel) {
        const clean = String(rel || "").split("?")[0];
        if (!clean) return null;
        // Pacote slim remove PNG quando há WebP — preferir .webp.
        let tryRel = clean;
        if (/\.png$/i.test(clean)) {
            const webpRel = clean.replace(/\.png$/i, ".webp");
            try {
                if (typeof global.dfAssetUrl === "function") {
                    const w = global.dfAssetUrl(webpRel);
                    if (w) tryRel = webpRel;
                } else {
                    tryRel = webpRel;
                }
            } catch (e) {
                tryRel = webpRel;
            }
        }
        if (typeof global.dfAssetUrl === "function") {
            try { return global.dfAssetUrl(tryRel); } catch (e) { /* */ }
        }
        return tryRel.split("/").map((p) => encodeURIComponent(p)).join("/");
    }

    /**
     * Prefetch + decode da URL canônica do fundo de menu e pinta stage/html
     * antes da tela virar .active (Image.decode não aquece CSS background-image).
     * @param {string} rel
     * @returns {Promise<string|null>} URL usada
     */
        async function ensureMenuBgReady(rel) {
        const url = menuBgAssetUrl(rel);
        if (!url) return null;
        if (typeof global.dfPrefetchArtUrl === "function") {
            try { await global.dfPrefetchArtUrl(url, "high"); } catch (e) { /* */ }
        }
        await new Promise((resolve) => {
            try {
                const img = new Image();
                img.decoding = "async";
                const done = () => resolve();
                img.onload = async () => {
                    try { await img.decode?.(); } catch (e) { /* */ }
                    done();
                };
                img.onerror = done;
                img.src = url;
                if (img.complete && img.naturalWidth > 0) {
                    Promise.resolve(img.decode?.()).catch(() => {}).finally(done);
                }
            } catch (e) {
                resolve();
            }
        });
        const doc = global.document;
        if (doc) {
            const bgVal = `#0a0608 url("${url}") center center / cover no-repeat`;
            try {
                doc.documentElement.style.setProperty("background", bgVal, "important");
                const stage = doc.getElementById("df-rotate-stage");
                if (stage) stage.style.setProperty("background", bgVal, "important");
                // Pintar a tela-alvo mesmo ANTES de .active (openHeroSelect
                // chama ensureMenuBgReady e só depois adiciona .active).
                const paintIds = [];
                const relLow = String(rel || "").toLowerCase();
                if (relLow.includes("desola")) paintIds.push("hero-select", "df-ranked-hero-select", "online-lobby");
                else if (relLow.includes("guerra")) paintIds.push("df-training-setup", "df-ranked-setup");
                else if (relLow.includes("arsenal")) paintIds.push("df-arsenal");
                else if (relLow.includes("combate") || relLow.includes("fundo")) paintIds.push("df-play-mode");
                for (const id of paintIds) {
                    const el = doc.getElementById(id);
                    if (!el) continue;
                    el.style.setProperty("background", bgVal, "important");
                    el.style.setProperty("background-image", `url("${url}")`, "important");
                    el.style.setProperty("background-size", "cover", "important");
                    el.style.setProperty("background-position", "center center", "important");
                    el.style.setProperty("background-repeat", "no-repeat", "important");
                    el.style.setProperty("background-color", "#0a0608", "important");
                }
                for (const id of ["hero-select", "df-ranked-hero-select", "online-lobby", "df-training-setup", "df-arsenal", "df-play-mode"]) {
                    const el = doc.getElementById(id);
                    if (!el || !el.classList.contains("active")) continue;
                    if (paintIds.includes(id)) continue;
                    el.style.setProperty("background", bgVal, "important");
                    el.style.setProperty("background-size", "cover", "important");
                    el.style.setProperty("background-position", "center center", "important");
                    el.style.setProperty("background-repeat", "no-repeat", "important");
                }
            } catch (e) { /* */ }
        }
        return url;
    }

    function activeMenuIllustrated(doc) {
        if (isCombatActive()) return null;
        for (const m of MENU_ILLUSTRATED_BG) {
            const el = doc.getElementById(m.id);
            if (el && el.classList.contains("active")) return m;
        }
        return null;
    }

    function clearCombatLetterboxBg() {
        const doc = global.document;
        if (!doc || !needsMobileDesktopViewport()) return;
        const stage = doc.getElementById("df-rotate-stage");
        const root = doc.documentElement;
        const game = doc.getElementById("game");
        const playMenu = doc.getElementById("play-menu");
        const active = activeMenuIllustrated(doc);
        const menuBg = active ? menuBgAssetUrl(active.rel) : null;
        const hubShowing = !!(playMenu && playMenu.classList.contains("active") && !isCombatActive());

        const clearScreenInline = (el) => {
            if (!el) return;
            el.style.removeProperty("background");
            el.style.removeProperty("background-size");
            el.style.removeProperty("background-position");
            el.style.removeProperty("background-repeat");
            el.style.removeProperty("background-color");
            el.style.removeProperty("background-image");
        };

        /* Em combate, este sincronizador só deve retirar restos dos menus.
           Nunca pode apagar a arena — inclusive quando o modal final está ativo. */
        if (isCombatActive()) {
            root.removeAttribute("data-df-menu-bg");
            for (const m of MENU_ILLUSTRATED_BG) {
                clearScreenInline(doc.getElementById(m.id));
            }
            pinCombatCanvas();
            return;
        }

        if (active && menuBg) {
            const bgVal = `#0a0608 url("${menuBg}") center center / cover no-repeat`;
            root.setAttribute("data-df-menu-bg", active.key);
            root.style.setProperty("background", bgVal, "important");
            if (stage) stage.style.setProperty("background", bgVal, "important");
            for (const m of MENU_ILLUSTRATED_BG) {
                const el = doc.getElementById(m.id);
                if (!el) continue;
                if (m.id === active.id || m.key === active.key) {
                    el.style.setProperty("background", bgVal, "important");
                    el.style.setProperty("background-image", `url("${menuBg}")`, "important");
                    el.style.setProperty("background-size", "cover", "important");
                    el.style.setProperty("background-position", "center center", "important");
                    el.style.setProperty("background-repeat", "no-repeat", "important");
                    el.style.setProperty("background-color", "#0a0608", "important");
                } else {
                    clearScreenInline(el);
                }
            }
        } else if (root.getAttribute("data-df-menu-bg") === "hero") {
            // MP: hero-select ainda a ativar — NÃO limpar DESOLAÇÃO (race do sync).
            const heroUrl = menuBgAssetUrl("bg/DESOLAÇÃO.png");
            if (heroUrl) {
                const bgVal = `#0a0608 url("${heroUrl}") center center / cover no-repeat`;
                root.style.setProperty("background", bgVal, "important");
                if (stage) stage.style.setProperty("background", bgVal, "important");
                for (const id of ["hero-select", "df-ranked-hero-select", "online-lobby"]) {
                    const el = doc.getElementById(id);
                    if (!el) continue;
                    el.style.setProperty("background", bgVal, "important");
                    el.style.setProperty("background-image", `url("${heroUrl}")`, "important");
                    el.style.setProperty("background-size", "cover", "important");
                    el.style.setProperty("background-position", "center center", "important");
                    el.style.setProperty("background-repeat", "no-repeat", "important");
                }
            }
        } else {
            // Voltar ao HUB / menus sem arte própria: NÃO pintar preto no stage —
            // isso cobria o hub (ou deixava a tela escura). Limpa overlays.
            root.removeAttribute("data-df-menu-bg");
            root.style.removeProperty("background");
            if (stage) {
                if (hubShowing) {
                    stage.style.setProperty("background", "transparent", "important");
                } else {
                    stage.style.removeProperty("background");
                }
            }
            for (const m of MENU_ILLUSTRATED_BG) {
                clearScreenInline(doc.getElementById(m.id));
            }
        }

        if (game && !isCombatActive()) {
            game.style.removeProperty("background-image");
            game.style.setProperty("background-color", "#0e0806", "important");
        }
    }
    global.dfSyncLetterboxBg = clearCombatLetterboxBg;

    /** Retrato físico em touch: paisagem lógica imediata (rotate CSS, sem pedir ao jogador). */
    function shouldUsePortraitLandscapeLayout() {
        if (!needsMobileDesktopViewport()) return false;
        if (!isTouchLikeDevice() && !isMobileUserAgent()) return false;
        return isPhysicalPortrait();
    }

    function syncPortraitLandscapeClass(root) {
        if (!root?.classList) return;
        root.classList.toggle("df-portrait-landscape", shouldUsePortraitLandscapeLayout());
    }

    function forceCanvasFitClasses() {
        if (!needsMobileDesktopViewport()) return;
        const root = global.document?.documentElement;
        if (!root?.classList) return;
        root.classList.add("df-mobile-desktop-fit", "df-desktop-canvas", "df-desktop-universal");
        syncPortraitLandscapeClass(root);
    }

    function clearCanvasChromeInline() {
        const doc = global.document;
        if (!doc) return;
        const sel = [
            "#top-bar", "#bottom-bar",
            "#desktop-logo", "#desktop-left-hud", "#desktop-right-hud", "#desktop-turn-indicator",
        ];
        for (const s of sel) {
            doc.querySelectorAll(s).forEach((el) => {
                el.style.removeProperty("display");
                el.style.removeProperty("visibility");
            });
        }
        const stage = doc.getElementById("df-rotate-stage");
        const scale = doc.getElementById("df-scale-root");
        if (stage) {
            stage.style.removeProperty("width");
            stage.style.removeProperty("height");
            stage.style.removeProperty("left");
            stage.style.removeProperty("top");
            stage.style.removeProperty("transform");
            stage.style.removeProperty("background");
            stage.style.removeProperty("display");
            stage.style.removeProperty("overflow");
        }
        if (doc.documentElement) {
            doc.documentElement.style.removeProperty("background");
        }
        if (scale) {
            scale.style.removeProperty("transform");
            scale.style.removeProperty("-webkit-transform");
            scale.style.removeProperty("transform-origin");
            scale.style.removeProperty("width");
            scale.style.removeProperty("height");
            scale.style.removeProperty("flex");
        }
    }

    /** Espaço visível para letterbox do canvas 1280×720; em retrato físico usa eixos trocados (paisagem lógica). */
    function canvasFitSpace() {
        const vis = visibleViewportDims();
        if (!vis) {
            const iw = global.innerWidth | 0;
            const ih = global.innerHeight | 0;
            const portrait = ih > iw;
            if (portrait && needsMobileDesktopViewport()) {
                return { fw: Math.max(iw, ih), fh: Math.min(iw, ih), portrait: true };
            }
            return { fw: iw, fh: ih, portrait };
        }
        if (shouldUsePortraitLandscapeLayout()) {
            return { fw: vis.vh, fh: vis.vw, portrait: true };
        }
        return { fw: vis.vw, fh: vis.vh, portrait: vis.portrait };
    }

    function isPhysicalPortrait() {
        const vis = visibleViewportDims();
        return vis ? vis.portrait : !!global.__DF_PHYSICAL_PORTRAIT;
    }

    /** Transform no #df-scale-root — letterbox Hearthstone (stage = flex viewport, scale no canvas). */
    function applyMobileStageTransform(root, scaleNum) {
        const doc = global.document;
        if (!doc || !needsMobileDesktopViewport()) return;
        const stage = doc.getElementById("df-rotate-stage");
        const scale = doc.getElementById("df-scale-root");
        if (!stage || !scale) return;
        const vis = visibleViewportDims();
        if (!vis) return;
        syncPortraitLandscapeClass(root);
        const usePortraitLayout = shouldUsePortraitLandscapeLayout();
        const fit = scaleNum > 0 ? scaleNum : desktopFitScale();
        const { vw, vh } = vis;
        root?.style?.setProperty("--df-vv-w", vw + "px");
        root?.style?.setProperty("--df-vv-h", vh + "px");
        root?.style?.setProperty("--df-fit-scale", fit.toFixed(5));
        stage.style.setProperty("position", "fixed", "important");
        // Desktop combate / layout especial: overflow visível — hubs, mãos e pedestais
        // não podem ser cortados (mobile com dock também clipava botões nas bordas).
        const specialCombat = useCombatSpecialLayout() && isCombatActive();
        const desktopCombatOverflow = isCombatActive() && !shouldDockHudToViewportEdges();
        const allowCombatOverflow = desktopCombatOverflow || specialCombat;
        stage.style.setProperty(
            "overflow",
            allowCombatOverflow ? "visible" : "hidden",
            "important",
        );
        stage.style.removeProperty("-webkit-overflow-scrolling");
        stage.style.removeProperty("touch-action");
        if (allowCombatOverflow) {
            scale.style.setProperty("overflow", "visible", "important");
            const gameEl = document.getElementById("game");
            if (gameEl) gameEl.style.setProperty("overflow", "visible", "important");
        } else {
            scale.style.removeProperty("overflow");
        }
        stage.style.setProperty("display", "flex", "important");
        stage.style.setProperty("align-items", "center", "important");
        stage.style.setProperty("justify-content", "center", "important");
        if (usePortraitLayout) {
            stage.style.setProperty("inset", "auto", "important");
            stage.style.setProperty("left", "0", "important");
            stage.style.setProperty("top", "0", "important");
            stage.style.removeProperty("right");
            stage.style.removeProperty("bottom");
            stage.style.setProperty("width", "100dvh", "important");
            stage.style.setProperty("height", "100dvw", "important");
            stage.style.setProperty("transform", "rotate(90deg) translateY(-100%)", "important");
            stage.style.setProperty("-webkit-transform", "rotate(90deg) translateY(-100%)", "important");
            stage.style.setProperty("transform-origin", "top left", "important");
            stage.style.setProperty("-webkit-transform-origin", "top left", "important");
        } else {
            stage.style.setProperty("inset", "0", "important");
            stage.style.setProperty("width", "100%", "important");
            stage.style.setProperty("height", "100%", "important");
            stage.style.removeProperty("left");
            stage.style.removeProperty("top");
            stage.style.removeProperty("right");
            stage.style.removeProperty("bottom");
            stage.style.setProperty("transform", "none", "important");
            stage.style.setProperty("-webkit-transform", "none", "important");
        }
        scale.style.setProperty("width", DESKTOP_LAYOUT_W + "px", "important");
        scale.style.setProperty("height", DESKTOP_LAYOUT_H + "px", "important");
        scale.style.setProperty("flex", "0 0 auto", "important");
        scale.style.setProperty(
            "transform",
            "scale(" + fit + ")",
            "important"
        );
        scale.style.setProperty(
            "-webkit-transform",
            "scale(" + fit + ")",
            "important"
        );
        scale.style.setProperty("transform-origin", "center center", "important");
        scale.style.setProperty("-webkit-transform-origin", "center center", "important");
    }

    /** D3: neutraliza position:fixed dentro do canvas (VFX de combate). */
    let _banFixedLast = 0;
    function banFixedInCanvas() {
        if (!needsMobileDesktopViewport()) return;
        const now = Date.now();
        const throttleMs = shouldUsePortraitLandscapeLayout() ? 2000 : 750;
        if (now - _banFixedLast < throttleMs) return;
        _banFixedLast = now;
        const doc = global.document;
        const stage = doc?.getElementById("df-rotate-stage");
        if (!stage) return;
        const hudIds = [
            "desktop-logo", "desktop-left-hud", "desktop-right-hud",
            "desktop-turn-indicator", "desktop-timer", "game",
        ];
        const previewOpen = global.document?.body?.classList?.contains("preview-open");
        for (const id of hudIds) {
            const el = doc.getElementById(id);
            if (el) el.style.setProperty("position", "absolute", "important");
        }
        if (!previewOpen) {
            for (const id of ["preview-card-inner", "preview-backdrop"]) {
                const el = doc.getElementById(id);
                if (el) el.style.setProperty("position", "absolute", "important");
            }
        }
        const nodes = stage.querySelectorAll("*");
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.id === "df-ultimate-pedestal" || el.id === "df-ultimate-count-pedestal"
                || el.id === "df-pass-turn-pedestal"
                || el.id === "df-buy-card-pedestal" || el.id === "df-deck-count-pedestal"
                || el.id === "block-overlay") continue;
            const st = global.getComputedStyle(el);
            if (st.position !== "fixed") continue;
            if (st.display === "none" || st.visibility === "hidden") continue;
            el.style.setProperty("position", "absolute", "important");
        }
    }

    /** Fallback cover via visualViewport quando o stage ainda não existe. */
    function viewportCoverMetrics(artW, artH) {
        const vis = visibleViewportDims();
        const vw = vis?.vw ?? global.innerWidth | 0;
        const vh = vis?.vh ?? global.innerHeight | 0;
        const offT = global.visualViewport?.offsetTop ?? 0;
        const offL = global.visualViewport?.offsetLeft ?? 0;
        const ia = artW / artH;
        const va = vw / Math.max(1, vh);
        let rw, rh, boxOx, boxOy;
        if (va > ia) {
            rw = vw;
            rh = vw / ia;
            boxOx = 0;
            boxOy = (vh - rh) / 2;
        } else {
            rh = vh;
            rw = vh * ia;
            boxOx = (vw - rw) / 2;
            boxOy = 0;
        }
        return { rw, rh, ox: offL + boxOx, oy: offT + boxOy };
    }

    /** Pós-fullscreen: stage rect pode ficar landscape enquanto visualViewport já é retrato. */
    function stageRectMatchesViewport() {
        const vis = visibleViewportDims();
        const stage = global.document?.getElementById("df-rotate-stage");
        if (!vis || !stage) return true;
        const r = stage.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        const stageLand = r.width > r.height;
        const visLand = !vis.portrait;
        return stageLand === visLand;
    }

    /** Cover do CAMPO DE BATALHA — caixa do #df-rotate-stage (mesmo referencial do fundo pintado). */
    function stageCoverMetrics(artW, artH) {
        const stage = global.document?.getElementById("df-rotate-stage");
        if (!stage || !stageRectMatchesViewport()) return viewportCoverMetrics(artW, artH);
        const r = stage.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return viewportCoverMetrics(artW, artH);
        const ia = artW / artH;
        const ga = r.width / Math.max(1, r.height);
        let rw, rh, ox, oy;
        if (ga > ia) {
            rh = r.height;
            rw = rh * ia;
            ox = r.left + (r.width - rw) / 2;
            oy = r.top;
        } else {
            rw = r.width;
            rh = rw / ia;
            ox = r.left;
            oy = r.top + (r.height - rh) / 2;
        }
        return { rw, rh, ox, oy };
    }

    /** Rect visual do canvas escalado — fallback quando getBoundingClientRect está defasado. */
    function scaleRootVisualRect() {
        const doc = global.document;
        const scale = doc?.getElementById("df-scale-root");
        if (!scale) return null;
        const sr = scale.getBoundingClientRect();
        if (!needsMobileDesktopViewport()) return sr;
        const vis = visibleViewportDims();
        if (!vis || sr.width < 1 || sr.height < 1) return sr;
        const fit = desktopFitScale();
        if (!(fit > 0)) return sr;
        const usePortrait = shouldUsePortraitLandscapeLayout();
        const expectW = usePortrait ? DESKTOP_LAYOUT_H * fit : DESKTOP_LAYOUT_W * fit;
        const expectH = usePortrait ? DESKTOP_LAYOUT_W * fit : DESKTOP_LAYOUT_H * fit;
        const stale = !stageRectMatchesViewport()
            || Math.abs(sr.width - expectW) > 4
            || Math.abs(sr.height - expectH) > 4;
        if (!stale) return sr;
        const offT = global.visualViewport?.offsetTop ?? 0;
        const offL = global.visualViewport?.offsetLeft ?? 0;
        const left = offL + (vis.vw - expectW) / 2;
        const top = offT + (vis.vh - expectH) / 2;
        return {
            left,
            top,
            right: left + expectW,
            bottom: top + expectH,
            width: expectW,
            height: expectH,
        };
    }

    /** Mapeamento afim viewport→canvas (3 cantos) — correto com rotação CSS em retrato. */
    let _affineGen = 0;
    let _affineCache = null;

    function invalidateCanvasAffine() {
        _affineGen += 1;
        _affineCache = null;
    }

    function getCanvasAffine() {
        if (_affineCache && _affineCache.gen === _affineGen) return _affineCache.m;
        const m = buildCanvasAffine();
        _affineCache = { gen: _affineGen, m };
        return m;
    }

    function buildCanvasAffine() {
        const scale = global.document?.getElementById("df-scale-root");
        if (!scale || !needsMobileDesktopViewport()) return null;
        const W = DESKTOP_LAYOUT_W;
        const H = DESKTOP_LAYOUT_H;
        const probe = (lx, ly) => {
            const el = global.document.createElement("div");
            el.setAttribute("aria-hidden", "true");
            el.style.cssText =
                "position:absolute;left:" + lx + "px;top:" + ly + "px;width:0;height:0;" +
                "overflow:hidden;visibility:hidden;pointer-events:none;box-sizing:border-box;";
            scale.appendChild(el);
            const r = el.getBoundingClientRect();
            const pt = { x: r.left, y: r.top };
            scale.removeChild(el);
            return pt;
        };
        try {
            const p00 = probe(0, 0);
            const pW0 = probe(W, 0);
            const p0H = probe(0, H);
            const a11 = (pW0.x - p00.x) / W;
            const a12 = (p0H.x - p00.x) / H;
            const a21 = (pW0.y - p00.y) / W;
            const a22 = (p0H.y - p00.y) / H;
            const det = a11 * a22 - a12 * a21;
            if (Math.abs(det) < 1e-8) return null;
            return { p00, a11, a12, a21, a22, det };
        } catch (e) {
            return null;
        }
    }

    function canvasAffineMap() {
        return getCanvasAffine();
    }

    /** Ajuste fino — alinhamento aos círculos de pedra (normalizado 0–1 no cover; desktop + mobile). */
    const PEDESTAL_ART_NUDGE = Object.freeze({
        ult: { dx: 0.019, dy: 0.030, dw: 0.024 },
        ultct: { dx: 0.002, dy: 0.010, dw: 0 },
        pass: { dx: -0.027, dy: -0.006, dw: 0 },
        buy: { dx: 0, dy: 0.012, dw: 0 },
        deckct: { dx: 0.004, dy: 0.008, dw: 0 },
        actlbl: { dx: 0, dy: 0.004, dw: 0 },
        actct: { dx: 0.002, dy: 0.004, dw: 0 },
    });

    /** Desktop janela (sem F11/fullscreen): cover ≠ tela cheia — corrige desvio lateral nos pedestais. */
    const PEDESTAL_WINDOWED_NUDGE = Object.freeze({
        ult: { dx: -0.029, dy: 0.018, dw: -0.008 },
        ultct: { dx: -0.008, dy: 0.012, dw: -0.004 },
        pass: { dx: 0.042, dy: 0, dw: -0.018 },
        buy: { dx: 0.012, dy: 0.010, dw: -0.006 },
        deckct: { dx: 0.010, dy: 0.008, dw: -0.004 },
        actlbl: { dx: 0.008, dy: 0.006, dw: -0.006 },
        actct: { dx: 0.006, dy: 0.006, dw: -0.004 },
    });

    /** Mobile + desktop tela cheia (F11): Passar/Vez — um pouco menor; dx fino à esquerda. */
    const PEDESTAL_MOBILE_FS_NUDGE = Object.freeze({
        pass: { dx: 0.002, dy: 0, dw: -0.011 },
        buy: { dx: -0.006, dy: 0.014, dw: -0.008 },
        deckct: { dx: -0.004, dy: 0.010, dw: -0.004 },
        ult: { dx: -0.012, dy: 0.006, dw: -0.018 },
        ultct: { dx: -0.004, dy: 0.008, dw: -0.004 },
        actlbl: { dx: -0.004, dy: 0.006, dw: -0.006 },
        actct: { dx: -0.003, dy: 0.006, dw: -0.004 },
    });

    /** Desktop mouse em F11 — folga extra no canvas 720px (evita corte nas bordas). */
    function desktopCombatHudInsets() {
        if (shouldDockHudToViewportEdges()) {
            return { logoTop: "12px", turnTop: "14px", hubBottom: "4px" };
        }
        if (isBrowserFullscreen() && !isTouchLikeDevice()) {
            // F11: hubs bem mais baixos (antes 96px deixava folga morta enorme).
            return { logoTop: "48px", turnTop: "52px", hubBottom: "4px" };
        }
        return { logoTop: "12px", turnTop: "14px", hubBottom: "16px" };
    }

    function isBrowserFullscreen() {
        const doc = global.document;
        if (doc?.fullscreenElement || doc?.webkitFullscreenElement) return true;
        // F11 no desktop NÃO preenche fullscreenElement — detectar viewport ≈ tela
        // para Netlify e localhost usarem o MESMO layout de tela cheia.
        try {
            if (isTouchLikeDevice() || isMobileUserAgent()) return false;
            const sw = global.screen?.width || 0;
            const sh = global.screen?.height || 0;
            if (sw < 800 || sh < 500) return false;
            const vw = global.innerWidth || 0;
            const vh = global.innerHeight || 0;
            return vw >= sw - 24 && vh >= sh - 48;
        } catch (e) {
            return false;
        }
    }

    function isDesktopWindowedViewport() {
        if (isMobileUserAgent()) return false;
        if (isBrowserFullscreen()) return false;
        const native = global.__DF_NATIVE_MATCH_MEDIA || global.matchMedia?.bind(global);
        if (native && native("(pointer: coarse)").matches) return false;
        return true;
    }

    /** Dock nos cantos do viewport — só touch em paisagem física (retrato gira o stage inteiro). */
    function shouldDockHudToViewportEdges() {
        if (shouldUsePortraitLandscapeLayout()) return false;
        return isTouchLikeDevice() || isMobileUserAgent();
    }

    /**
     * Pedestais Ultimate / Passar — position:fixed no viewport (cover do fundo).
     * Reparent para body; não passa pelo banFixedInCanvas do stage.
     */
    function applyCombatPedestalCover(slot, art, varPrefix) {
        /* Layout especial: tokens CSS por modo — não deixar sync JS sobrescrever (cortava botões no mobile). */
        if (useCombatSpecialLayout()) {
            if (slot) {
                const game = document.getElementById("game");
                if (game && slot.parentElement !== game) game.appendChild(slot);
                if (varPrefix) {
                    slot.style.removeProperty("--df-" + varPrefix + "-pedestal-x");
                    slot.style.removeProperty("--df-" + varPrefix + "-pedestal-y");
                    slot.style.removeProperty("--df-" + varPrefix + "-pedestal-w");
                }
                slot.style.removeProperty("left");
                slot.style.removeProperty("top");
                slot.style.removeProperty("width");
                slot.style.removeProperty("position");
                slot.style.removeProperty("transform");
                slot.style.removeProperty("z-index");
                delete slot.dataset.dfPedestalSync;
            }
            return true;
        }
        if (!slot || !needsMobileDesktopViewport()) return false;
        if (global.DfLayoutDev?.isLocked?.(slot)) return true;
        if (shouldUsePortraitLandscapeLayout()) return false;
        const body = global.document?.body;
        if (!body) return false;
        const m = stageCoverMetrics(art.w, art.h);
        let ax = art.x;
        let ay = art.y;
        let wPct = art.wPct;
        if (varPrefix) {
            const n = PEDESTAL_ART_NUDGE[varPrefix];
            if (n) {
                ax += n.dx ?? 0;
                ay += n.dy ?? 0;
                wPct += n.dw ?? 0;
            }
            if (isDesktopWindowedViewport()) {
                const wn = PEDESTAL_WINDOWED_NUDGE[varPrefix];
                if (wn) {
                    ax += wn.dx ?? 0;
                    ay += wn.dy ?? 0;
                    wPct += wn.dw ?? 0;
                }
            } else {
                const mf = PEDESTAL_MOBILE_FS_NUDGE[varPrefix];
                if (mf) {
                    ax += mf.dx ?? 0;
                    ay += mf.dy ?? 0;
                    wPct += mf.dw ?? 0;
                }
            }
        }
        const cx = m.ox + ax * m.rw;
        const cy = m.oy + ay * m.rh;
        const w = wPct * m.rw;
        if (slot.parentElement !== body) body.appendChild(slot);
        slot.style.setProperty("position", "fixed", "important");
        slot.style.setProperty("left", cx.toFixed(2) + "px", "important");
        slot.style.setProperty("top", cy.toFixed(2) + "px", "important");
        slot.style.setProperty("width", w.toFixed(2) + "px", "important");
        slot.style.setProperty("transform", "translate(-50%, -50%)", "important");
        slot.style.setProperty("z-index", "180", "important");
        slot.dataset.dfPedestalSync = "stage-cover";
        if (varPrefix) {
            slot.style.removeProperty("--df-" + varPrefix + "-pedestal-x");
            slot.style.removeProperty("--df-" + varPrefix + "-pedestal-y");
            slot.style.removeProperty("--df-" + varPrefix + "-pedestal-w");
        }
        return true;
    }

    function syncCombatPedestals() {
        try { global.__dfSyncUltimatePedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncPassTurnPedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncBuyCardPedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncCombatOpcoesPedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncActionsPedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
        try { global.__dfSyncTurnClock?.(); } catch (e) { /* */ }
        try { global.DfDeckBadge?.syncPosition?.(); } catch (e) { /* */ }
    }

    /**
     * Canvas fit: HUD e partículas permanecem em #df-scale-root (nunca reparent p/ #game).
     * Desktop nativo sem fit: combate mantém HUD/fx em #game (layout viewport fixo).
     */
    function ensureHudInsideScaleRoot() {
        const doc = global.document;
        if (!doc?.body) return;
        const scale = doc.getElementById("df-scale-root");
        const game = doc.getElementById("game");
        if (!scale) return;
        const fit = needsMobileDesktopViewport();
        const combat = isCombatActive();
        const hudParent = fit ? scale : (combat && game ? game : scale);
        const ids = [
            "desktop-logo", "desktop-left-hud",
            "desktop-right-hud", "desktop-turn-indicator",
        ];
        for (const id of ids) {
            const el = doc.getElementById(id);
            if (el && el.parentElement !== hudParent) {
                hudParent.appendChild(el);
            }
        }
        if (fit) {
            const previewOpen = doc.body?.classList?.contains("preview-open");
            const previewIds = ["preview-card-inner", "preview-backdrop"];
            for (const id of previewIds) {
                const el = doc.getElementById(id);
                if (!el || el.parentElement === scale) continue;
                if (previewOpen) continue;
                scale.appendChild(el);
            }
        }
        const fx = doc.getElementById("fx-particles");
        if (!fx) return;
        if (fit) {
            if (fx.parentElement !== scale) {
                scale.insertBefore(fx, scale.firstChild);
            }
        } else if (combat && game && fx.parentElement !== game) {
            game.insertBefore(fx, game.firstChild);
        } else if (!combat && fx.parentElement !== scale) {
            scale.insertBefore(fx, scale.firstChild);
        }
    }

    function resetMobileHudDockTransforms() {
        if (!needsMobileDesktopViewport()) return;
        const doc = global.document;
        const root = doc?.documentElement;
        if (!root) return;
        root.style.removeProperty("--df-mobile-hud-dock-tx");
        root.style.removeProperty("--df-mobile-right-hud-dock-tx");
        root.style.removeProperty("--df-mobile-right-hud-dock-ty");
        root.style.removeProperty("--df-mobile-turn-dock-tx");
        for (const id of [
            "desktop-logo", "desktop-left-hud",
            "desktop-right-hud", "desktop-turn-indicator",
        ]) {
            const el = doc.getElementById(id);
            if (el) el.style.removeProperty("transform");
        }
    }

    /**
     * Mobile combate: desloca menu + hubs para a borda esquerda da tela sem sair do canvas
     * (translateX compensa letterbox; evita left negativo + overflow:hidden).
     */
    function dockMobileLeftHudInCanvas(edgePx) {
        if (!needsMobileDesktopViewport() || !isCombatActive()) return;
        const doc = global.document;
        const scaleRoot = doc.getElementById("df-scale-root");
        const root = doc.documentElement;
        if (!scaleRoot || !root) return;
        if (!shouldDockHudToViewportEdges()) {
            root.style.removeProperty("--df-mobile-hud-dock-tx");
            for (const id of ["desktop-logo", "desktop-left-hud"]) {
                const el = doc.getElementById(id);
                if (el) el.style.removeProperty("transform");
            }
            return;
        }
        const fit = desktopFitScale();
        if (!(fit > 0)) return;
        const sr = scaleRootVisualRect() || scaleRoot.getBoundingClientRect();
        const edge = Number.isFinite(edgePx) ? edgePx : 4;
        const baseLeft = 6;
        // Nunca empurrar o hub da IA para fora do canvas (evita corte na letterbox).
        const shiftX = Math.max((edge - sr.left) / fit - baseLeft, 0);
        const txPx = Math.abs(shiftX) < 0.35
            ? "0px"
            : Math.round(shiftX) + "px";
        root.style.setProperty("--df-mobile-hud-dock-tx", txPx);
        for (const id of ["desktop-logo", "desktop-left-hud"]) {
            const el = doc.getElementById(id);
            if (!el) continue;
            if (global.DfLayoutDev?.isLocked?.(el)) continue;
            if (txPx === "0px") {
                el.style.removeProperty("transform");
            } else {
                el.style.setProperty("transform", "translateX(" + txPx + ")", "important");
            }
        }
    }

    /** Mobile combate: hub do jogador encostado na borda direita/inferior (letterbox). */
    function dockMobileRightHudInCanvas(edgePx, bottomEdgePx) {
        if (!needsMobileDesktopViewport() || !isCombatActive()) return;
        const doc = global.document;
        const scaleRoot = doc.getElementById("df-scale-root");
        const root = doc.documentElement;
        const el = doc.getElementById("desktop-right-hud");
        if (!scaleRoot || !root || !el) return;
        if (global.DfLayoutDev?.isLocked?.(el)) return;
        if (!shouldDockHudToViewportEdges()) {
            root.style.removeProperty("--df-mobile-right-hud-dock-tx");
            root.style.removeProperty("--df-mobile-right-hud-dock-ty");
            el.style.removeProperty("transform");
            return;
        }
        const fit = desktopFitScale();
        if (!(fit > 0)) return;
        const sr = scaleRootVisualRect() || scaleRoot.getBoundingClientRect();
        const edge = Number.isFinite(edgePx) ? edgePx : 6;
        const bottomEdge = Number.isFinite(bottomEdgePx) ? bottomEdgePx : 6;
        const baseRight = 6;
        const baseBottom = 4;
        const vis = visibleViewportDims();
        const vw = vis?.vw ?? global.innerWidth;
        const vh = vis?.vh ?? global.innerHeight;
        const shiftX = (vw - edge - sr.right) / fit + baseRight;
        const shiftY = (vh - bottomEdge - sr.bottom) / fit + baseBottom;
        const txPx = Math.abs(shiftX) < 0.35
            ? "0px"
            : Math.round(shiftX) + "px";
        const tyPx = Math.abs(shiftY) < 0.35
            ? "0px"
            : Math.round(shiftY) + "px";
        root.style.setProperty("--df-mobile-right-hud-dock-tx", txPx);
        root.style.setProperty("--df-mobile-right-hud-dock-ty", tyPx);
        if (txPx === "0px" && tyPx === "0px") {
            el.style.removeProperty("transform");
        } else {
            el.style.setProperty(
                "transform",
                "translate(" + txPx + ", " + tyPx + ")",
                "important",
            );
        }
    }

    /** Mobile combate: pill “Turno de…” encostada na borda direita da tela (canvas + translateX). */
    function dockMobileTurnIndicatorInCanvas(edgePx) {
        if (!needsMobileDesktopViewport() || !isCombatActive()) return;
        const doc = global.document;
        const scaleRoot = doc.getElementById("df-scale-root");
        const root = doc.documentElement;
        const el = doc.getElementById("desktop-turn-indicator");
        if (!scaleRoot || !root || !el) return;
        if (global.DfLayoutDev?.isLocked?.(el)) return;
        if (!shouldDockHudToViewportEdges()) {
            root.style.removeProperty("--df-mobile-turn-dock-tx");
            el.style.removeProperty("transform");
            return;
        }
        const fit = desktopFitScale();
        if (!(fit > 0)) return;
        const sr = scaleRootVisualRect() || scaleRoot.getBoundingClientRect();
        const edge = Number.isFinite(edgePx) ? edgePx : 14;
        const baseRight = 12;
        const vis = visibleViewportDims();
        const vw = vis?.vw ?? global.innerWidth;
        const shiftX = (vw - edge - sr.right) / fit + baseRight;
        const txPx = Math.abs(shiftX) < 0.35
            ? "0px"
            : Math.round(shiftX) + "px";
        root.style.setProperty("--df-mobile-turn-dock-tx", txPx);
        if (txPx === "0px") {
            el.style.removeProperty("transform");
        } else {
            el.style.setProperty("transform", "translateX(" + txPx + ")", "important");
        }
    }

    /** Fix iOS/Safari + pós-fullscreen: arena + canvas scale + HUD no canvas (inline). */
    function pinCombatCanvas() {
        if (!needsMobileDesktopViewport() || !isCombatActive()) return;
        const doc = global.document;
        const game = doc.getElementById("game");
        const stage = doc.getElementById("df-rotate-stage");
        const scaleRoot = doc.getElementById("df-scale-root");
        const root = doc.documentElement;
        if (!game || !stage || !scaleRoot || !root) return;
        const fit = desktopFitScale();
        if (!(fit > 0)) return;
        applyCombatArenaModeClasses(root);
        applyMobileStageTransform(root, fit);
        const arenaSize = (combatArenaMode() === "desktop-fullscreen") ? "cover" : "100% 100%";
        const arenaBg = `#0a0608 url("${arenaBgUrl()}") center center / ${arenaSize} no-repeat`;
        stage.style.setProperty("background", arenaBg, "important");
        root.style.setProperty("background", arenaBg, "important");
        game.style.setProperty("position", "absolute", "important");
        game.style.setProperty("inset", "0", "important");
        game.style.setProperty("width", "100%", "important");
        game.style.setProperty("height", "100%", "important");
        game.style.setProperty("max-height", "none", "important");
        scaleRoot.style.setProperty("background", "transparent", "important");
        game.style.setProperty("background", "transparent", "important");
        ensureHudInsideScaleRoot();
        const hudInsets = desktopCombatHudInsets();
        // Desktop (não-touch): encosta os hubs na borda inferior REAL da tela,
        // compensando as barras do letterbox (canvas centralizado). O hub do
        // jogador (direita) também vai até a borda direita da tela na janela.
        let hubBottomVal = hudInsets.hubBottom;
        let playerRightVal = "6px";
        let leftHudLeftVal = "6px";
        /* Layout Especial: hubs nas margens do canvas (safe 24px), nunca fora do frame. */
        if (useCombatSpecialLayout()) {
            hubBottomVal = "24px";
            leftHudLeftVal = "24px";
            playerRightVal = "24px";
        } else if (!shouldDockHudToViewportEdges()) {
            if (isBrowserFullscreen() && !isTouchLikeDevice()) {
                hubBottomVal = hudInsets.hubBottom || "4px";
                leftHudLeftVal = "14px";
                playerRightVal = "8px";
            } else {
                const sr = scaleRootVisualRect() || scaleRoot.getBoundingClientRect();
                const vis = visibleViewportDims();
                const vw = vis?.vw ?? global.innerWidth;
                const vh = vis?.vh ?? global.innerHeight;
                const barBottom = Math.max((vh - sr.bottom) / fit, 0);
                hubBottomVal = Math.round(Math.max(12, barBottom + 8)) + "px";
                if (isDesktopWindowedViewport()) {
                    const barRight = Math.max((vw - sr.right) / fit, 0);
                    playerRightVal = Math.round(-(Math.max(36, barRight + 36))) + "px";
                }
            }
        }
        const hudPos = {
            "desktop-logo": { top: useCombatSpecialLayout() ? "24px" : hudInsets.logoTop, left: useCombatSpecialLayout() ? "24px" : "6px", right: "", bottom: "" },
            "desktop-left-hud": { top: "", left: leftHudLeftVal, right: "", bottom: hubBottomVal },
            "desktop-right-hud": { top: "", left: "", right: playerRightVal, bottom: hubBottomVal },
            "desktop-turn-indicator": { top: hudInsets.turnTop, left: "", right: "12px", bottom: "" },
        };
        for (const [id, pos] of Object.entries(hudPos)) {
            const el = doc.getElementById(id);
            if (!el) continue;
            el.style.setProperty("position", "absolute", "important");
            if (pos.top) el.style.setProperty("top", pos.top, "important");
            else el.style.removeProperty("top");
            if (pos.left) el.style.setProperty("left", pos.left, "important");
            else el.style.removeProperty("left");
            if (pos.right) el.style.setProperty("right", pos.right, "important");
            else el.style.removeProperty("right");
            if (pos.bottom) el.style.setProperty("bottom", pos.bottom, "important");
            else el.style.removeProperty("bottom");
        }
        banFixedInCanvas();
        if (shouldDockHudToViewportEdges()) {
            dockMobileLeftHudInCanvas(12);
            dockMobileRightHudInCanvas(4, 0);
            dockMobileTurnIndicatorInCanvas(14);
        } else {
            resetMobileHudDockTransforms();
        }
        pinSpecialAiHandToGameTop();
        try { global.__dfSyncArenaAlignment?.(); } catch (e) { /* */ }
        try { global.__dfScheduleFan?.(); } catch (e) { /* */ }
        syncCombatPedestals();
        try { global.DfMobileImmersive?.dismissTouchBlockers?.(); } catch (e) { /* */ }
    }

    /**
     * Mão da IA encostada na borda superior da tela.
     *
     * A mão CONTINUA dentro de #quadrant-1 (fora de .ai-quadrant o CSS base do verso
     * é 28×40 — foi o que deixou as cartas minúsculas). O que a segurava no meio do
     * campo era o padding vertical do tabuleiro em %: padding em porcentagem resolve
     * pela LARGURA do canvas (1280), ou seja ~141px, e `top: 0` no quadrante começa
     * depois disso. Aqui o offset é devolvido em px de layout (negativo).
     */
    function resolveQuadrantHand(q) {
        if (!q) return null;
        const local = q.querySelector?.(".quadrant-hand");
        if (local) return local;
        if (q.id === "quadrant-1" || q.classList?.contains("ai-quadrant")) {
            return global.document?.querySelector?.('#game > .quadrant-hand[data-df-ai-hand="1"]') || null;
        }
        return null;
    }

    const AI_HAND_PIN_PROPS = ["top", "left", "right", "bottom", "position", "transform",
        "translate", "z-index", "margin-left", "margin-right", "margin-top", "width",
        "max-width", "height", "min-height", "max-height", "padding", "overflow",
        "align-items", "justify-content"];

    function pinSpecialAiHandToGameTop() {
        const doc = global.document;
        const game = doc?.getElementById("game");
        const q1 = doc?.getElementById("quadrant-1");
        const hand = q1?.querySelector?.(".quadrant-hand")
            || doc?.querySelector?.('#game > .quadrant-hand[data-df-ai-hand="1"]');
        if (!hand) return;
        /* Versões anteriores reparentavam a mão para #game — devolve ao quadrante,
           senão o verso perde o CSS de .ai-quadrant e encolhe. */
        if (q1 && hand.parentElement !== q1) {
            const field = q1.querySelector(".quadrant-field");
            if (field && field.nextSibling) q1.insertBefore(hand, field.nextSibling);
            else q1.appendChild(hand);
            delete hand.dataset.dfAiHand;
        }
        if (!useCombatSpecialLayout() || !isCombatActive() || !game) {
            if (hand.dataset.dfAiHandPinned) {
                AI_HAND_PIN_PROPS.forEach((p) => hand.style.removeProperty(p));
                delete hand.dataset.dfAiHandPinned;
            }
            return;
        }
        hand.style.setProperty("position", "absolute", "important");
        hand.style.setProperty("left", "50%", "important");
        hand.style.setProperty("right", "auto", "important");
        hand.style.setProperty("bottom", "auto", "important");
        hand.style.setProperty("width", "max-content", "important");
        hand.style.setProperty("max-width", "96%", "important");
        hand.style.setProperty("height", "auto", "important");
        hand.style.setProperty("min-height", "0", "important");
        hand.style.setProperty("max-height", "none", "important");
        hand.style.setProperty("margin-left", "0", "important");
        hand.style.setProperty("margin-right", "0", "important");
        hand.style.setProperty("margin-top", "0", "important");
        hand.style.setProperty("padding", "0", "important");
        hand.style.setProperty("transform", "translateX(-50%)", "important");
        hand.style.setProperty("translate", "none", "important");
        hand.style.setProperty("z-index", "60", "important");
        hand.style.setProperty("justify-content", "center", "important");
        hand.style.setProperty("align-items", "flex-start", "important");
        hand.style.setProperty("overflow", "visible", "important");
        hand.dataset.dfAiHandPinned = "1";
        /* Retrato girado: o eixo vertical da tela é o horizontal do layout —
           medir por rect daria o eixo errado. O CSS já traz o valor em px de layout. */
        if (shouldUsePortraitLandscapeLayout()) {
            hand.style.removeProperty("top");
            return;
        }
        const rect = hand.getBoundingClientRect();
        if (!(rect.height > 1)) return;
        /* Escala real de layout→tela medida no próprio elemento (o canvas em cover
           não bate com desktopFitScale). */
        let scale = hand.offsetHeight > 4 ? rect.height / hand.offsetHeight : 0;
        if (!(scale > 0.2 && scale < 8)) scale = desktopFitScale();
        if (!(scale > 0)) return;
        /* Os versos giram 180° com pivô na base (.ai-hand-wrap → transform-origin
           50% 100%), então aparecem uma altura de carta ABAIXO da caixa da mão.
           Mede o topo visível real em vez de assumir o deslocamento. */
        let cardTop = Infinity;
        hand.querySelectorAll(".ai-back, .hcard").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.height > 4 && r.width > 4) cardTop = Math.min(cardTop, r.top);
        });
        if (!Number.isFinite(cardTop)) cardTop = rect.top;
        const curTop = parseFloat(global.getComputedStyle(hand).top) || 0;
        /* Mantém apenas a parte inferior dos versos visível: pedido global para
           a mão da IA ficar bem mais acima da borda superior. */
        const targetTop = -32;
        const next = curTop + (targetTop - cardTop) / scale;
        if (!Number.isFinite(next) || next < -900 || next > 400) return;
        hand.style.setProperty("top", next.toFixed(1) + "px", "important");
    }

    function isCombatActive() {
        const doc = global.document;
        const game = doc?.getElementById("game");
        if (!(game && game.classList.contains("active"))) return false;
        // Menu ilustrado na frente (ex.: seleção de herói MP): NÃO tratar como
        // combate — senão dfSyncLetterboxBg limpa DESOLAÇÃO e o CSS
        // :not(:has(#game.active)) deixa de pintar o fundo.
        for (const id of [
            "hero-select", "df-ranked-hero-select",
            "df-training-setup", "df-ranked-setup",
            "df-arsenal", "df-play-mode",
        ]) {
            if (doc.getElementById(id)?.classList.contains("active")) return false;
        }
        return true;
    }

    function enforceMobileChrome() {
        forceCanvasFitClasses();
        if (!needsMobileDesktopViewport()) return;
        const root = global.document?.documentElement;
        if (!root) return;
        const combat = isCombatActive();
        root.classList.add("df-mobile-desktop-fit");
        root.classList.toggle("df-desktop-universal", true);
        root.classList.remove("df-mobile", "df-mobile-in-game");
        root.classList.toggle("df-desktop-canvas", true);
        root.classList.remove("df-auto-landscape");
        syncPortraitLandscapeClass(root);
        root.classList.toggle("df-combat-canvas", combat);
        root.classList.toggle("df-touch-ui", isTouchLikeDevice() || isMobileUserAgent());
        try { global.__dfResetCombatViewPan?.(); } catch (e) { /* */ }
        const barHideSel = ["#top-bar", "#bottom-bar"];
        const menuHideSel = [
            "#desktop-logo", "#desktop-left-hud", "#desktop-right-hud", "#desktop-turn-indicator",
        ];

        if (combat) {
            for (const sel of barHideSel) {
                global.document.querySelectorAll(sel).forEach((el) => {
                    el.style.setProperty("display", "none", "important");
                    el.setAttribute("aria-hidden", "true");
                });
            }
            const ui = global.DfCombatUi;
            const showMenu = ui?.showMenuButton?.() !== false;
            const showHubs = ui?.showHeroHubs?.() !== false;
            const showTurn = ui?.showTurnBox?.() !== false;
            const showFlex = [];
            if (showMenu) showFlex.push("#desktop-logo");
            if (showHubs) {
                showFlex.push("#desktop-left-hud", "#desktop-right-hud");
            } else if (global.document.getElementById("df-deck-badge")) {
                showFlex.push("#desktop-right-hud");
            }
            for (const sel of showFlex) {
                const el = global.document.querySelector(sel);
                if (!el) continue;
                el.style.setProperty("display", "flex", "important");
                el.style.setProperty("visibility", "visible", "important");
                el.setAttribute("aria-hidden", "false");
            }
            if (!showMenu && !showHubs) {
                for (const sel of ["#desktop-logo", "#desktop-left-hud"]) {
                    const el = global.document.querySelector(sel);
                    if (!el) continue;
                    el.style.setProperty("display", "none", "important");
                    el.style.setProperty("visibility", "hidden", "important");
                    el.setAttribute("aria-hidden", "true");
                }
            }
            const turn = global.document.getElementById("desktop-turn-indicator");
            if (turn) {
                if (showTurn) {
                    turn.style.setProperty("display", "block", "important");
                    turn.style.setProperty("visibility", "visible", "important");
                    turn.setAttribute("aria-hidden", "false");
                } else {
                    turn.style.setProperty("display", "none", "important");
                    turn.style.setProperty("visibility", "hidden", "important");
                    turn.setAttribute("aria-hidden", "true");
                }
            }
        } else {
            for (const sel of barHideSel) {
                global.document.querySelectorAll(sel).forEach((el) => {
                    el.style.setProperty("display", "none", "important");
                    el.setAttribute("aria-hidden", "true");
                });
            }
            global.document.querySelectorAll(menuHideSel.join(",")).forEach((el) => {
                el.style.setProperty("display", "none", "important");
                el.style.setProperty("visibility", "hidden", "important");
                el.setAttribute("aria-hidden", "true");
            });
            clearCombatLetterboxBg();
        }
        if (combat && isTouchLikeDevice()) {
            try { void global.DfOrientation?.tryLockLandscape?.(); } catch (e) { /* */ }
        }
        if (combat) {
            pinCombatCanvas();
            banFixedInCanvas();
            pinSpecialAiHandToGameTop();
        }
        try { global.__dfSyncMobileHubDock?.(false); } catch (e) { /* */ }
    }

    function logicalLayoutDims() {
        const vis = visibleViewportDims();
        const portrait = vis ? vis.portrait : !!global.__DF_PHYSICAL_PORTRAIT;
        return {
            lw: global.__DF_PHYSICAL_VW || vis?.vw || global.innerWidth | 0,
            lh: global.__DF_PHYSICAL_VH || vis?.vh || global.innerHeight | 0,
            portrait,
        };
    }

    function visibleViewportDims() {
        try {
            const fit = layoutViewportForFit();
            const vw = fit.vw;
            const vh = fit.vh;
            if (!vw || !vh) return null;
            const portrait = vh > vw;
            return { vw, vh, portrait };
        } catch (e) { /* */ }
        return null;
    }

    /** Fit letterbox: canvas 1280×720 inteiro visível — preenche 16:9; barras só se aspect ≠ 16:9. */
    function desktopFitScale() {
        if (!needsMobileDesktopViewport()) return 1;
        const { fw, fh } = canvasFitSpace();
        if (!fw || !fh) return 1;
        return Math.min(fw / DESKTOP_LAYOUT_W, fh / DESKTOP_LAYOUT_H);
    }

    function applyRootLayoutClasses(root) {
        if (!root?.classList) return;
        const fit = needsMobileDesktopViewport();
        const combat = fit && isCombatActive();
        root.classList.toggle("df-mobile-desktop-fit", fit);
        root.classList.toggle("df-desktop-universal", fit);
        root.classList.toggle("df-combat-canvas", combat);
        root.classList.toggle("df-desktop-canvas", fit);
        root.classList.toggle("df-desktop-windowed", fit && isDesktopWindowedViewport());
        root.classList.toggle(
            "df-desktop-fullscreen",
            fit && isBrowserFullscreen() && !isTouchLikeDevice(),
        );
        root.classList.toggle(
            "df-hud-dock-viewport",
            fit && shouldDockHudToViewportEdges(),
        );
        root.classList.toggle(
            "df-mobile-browser-chrome",
            fit && isTouchLikeDevice() && !isBrowserFullscreen(),
        );
        applyCombatArenaModeClasses(root);
        root.classList.toggle("df-touch-ui", isTouchLikeDevice() || isMobileUserAgent());
        root.classList.remove("df-auto-landscape");
        syncPortraitLandscapeClass(root);
        if (fit) {
            const pw = global.__DF_PHYSICAL_PW || 0;
            const ph = global.__DF_PHYSICAL_PH || 0;
            if (pw) root.style.setProperty("--df-pw", pw + "px");
            if (ph) root.style.setProperty("--df-ph", ph + "px");
        } else {
            root.style.removeProperty("--df-pw");
            root.style.removeProperty("--df-ph");
        }
    }

    function syncDesktopLayoutViewport() {
        invalidateCanvasAffine();
        forceCanvasFitClasses();
        if (!global.document || typeof global.document.querySelector !== "function") return;
        const meta = global.document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        const root = global.document.documentElement;
        if (!needsMobileDesktopViewport()) return;
        applyRootLayoutClasses(root);
        const scaleNum = desktopFitScale();
        const scale = scaleNum.toFixed(5);
        meta.setAttribute("content", DEFAULT_VIEWPORT);
        meta.dataset.dfVpPatched = "1";
        root?.style?.setProperty("--df-fit-scale", scale);
        const vis = visibleViewportDims();
        if (vis) {
            root?.style?.setProperty("--df-vv-w", vis.vw + "px");
            root?.style?.setProperty("--df-vv-h", vis.vh + "px");
        }
        root?.style?.setProperty("--df-layout-w", DESKTOP_LAYOUT_W + "px");
        root?.style?.setProperty("--df-layout-h", DESKTOP_LAYOUT_H + "px");
        global.__DF_DESKTOP_FIT_SCALE = scale;
        applyMobileStageTransform(root, scaleNum);
        if (global.document.body) {
            ensureHudInsideScaleRoot();
            enforceMobileChrome();
            if (isCombatActive()) {
                pinCombatCanvas();
                banFixedInCanvas();
                pinSpecialAiHandToGameTop();
            }
        }
    }

    function makeFalseMediaQuery(query) {
        return {
            media: query,
            matches: false,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() { return true; },
        };
    }

    function makeTrueMediaQuery(query) {
        return {
            media: query,
            matches: true,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() { return true; },
        };
    }

    if (FORCE_DESKTOP_LAYOUT && global.matchMedia) {
        const nativeMatchMedia = global.matchMedia.bind(global);
        global.matchMedia = function patchedMatchMedia(query) {
            if (needsMobileDesktopViewport()) {
                if (isLayoutMobileQuery(query)) return makeFalseMediaQuery(query);
            }
            return nativeMatchMedia(query);
        };
        global.__DF_NATIVE_MATCH_MEDIA = nativeMatchMedia;
    }

    const DfLayout = Object.freeze({
        forceDesktopLayout: FORCE_DESKTOP_LAYOUT,
        isDesktopLayout() { return FORCE_DESKTOP_LAYOUT; },
        isMobileLayout() { return !FORCE_DESKTOP_LAYOUT; },
        isMobileViewport() { return false; },
        isCoarsePointer() {
            return global.__DF_NATIVE_MATCH_MEDIA
                ? global.__DF_NATIVE_MATCH_MEDIA("(pointer: coarse)").matches
                : false;
        },
        isTouchGameplay() {
            return isTouchLikeDevice();
        },
        isCanvasFieldLayout() {
            return needsMobileDesktopViewport();
        },
        isNarrowViewportPreview() {
            return viewportNeedsCanvasFit();
        },
        isMobileDesktopFit() {
            return needsMobileDesktopViewport();
        },
        arenaBgRel,
        arenaBgRelForMode,
        arenaBgUrl,
        menuBgUrl: menuBgAssetUrl,
        ensureMenuBgReady,
        combatArenaMode,
        pickCombatArenaId,
        setMatchArenaId,
        getMatchArenaId,
        listCombatArenaScenarios,
        useCombatSpecialLayout,
        resolveQuadrantHand,
        pinSpecialAiHandToGameTop,
        isMobileUserAgent() {
            return isMobileUserAgent();
        },
        isPhysicalPortrait() {
            capturePhysicalViewport();
            const vis = visibleViewportDims();
            return vis ? vis.portrait : !!global.__DF_PHYSICAL_PORTRAIT;
        },
        isPortraitRotated() { return shouldUsePortraitLandscapeLayout(); },
        /** @deprecated */
        isPortraitBlocked() { return false; },
        isPortraitLandscape() { return shouldUsePortraitLandscapeLayout(); },
        shouldUsePortraitLandscapeLayout,
        refreshViewport() {
            global.DfViewport?.schedule?.();
        },
        syncLayoutViewport: syncDesktopLayoutViewport,
        enforceMobileChrome,
        desktopFitScale,
        viewportCoverMetrics,
        stageCoverMetrics,
        scaleRootVisualRect,
        applyCombatPedestalCover,
        isDesktopWindowedViewport,
        syncCombatPedestals,
        recoverMobilePostFullscreen,
        /** Overlays (maint-box, float, splash) no canvas 1280×720 — não no viewport. */
        overlayRoot() {
            if (!needsMobileDesktopViewport()) return global.document.body;
            return global.document.getElementById("df-scale-root") || global.document.body;
        },
        viewportToCanvas(vx, vy) {
            if (!needsMobileDesktopViewport()) return { x: vx, y: vy };
            const m = canvasAffineMap();
            if (m) {
                const dx = vx - m.p00.x;
                const dy = vy - m.p00.y;
                const cx = (m.a22 * dx - m.a12 * dy) / m.det;
                const cy = (-m.a21 * dx + m.a11 * dy) / m.det;
                if (Number.isFinite(cx) && Number.isFinite(cy)) {
                    return { x: cx, y: cy };
                }
            }
            const scale = global.document.getElementById("df-scale-root");
            if (!scale) return { x: vx, y: vy };
            const sr = scaleRootVisualRect() || scale.getBoundingClientRect();
            if (sr.width < 1 || sr.height < 1) return { x: vx, y: vy };
            return {
                x: ((vx - sr.left) / sr.width) * DESKTOP_LAYOUT_W,
                y: ((vy - sr.top) / sr.height) * DESKTOP_LAYOUT_H,
            };
        },
        /** Retângulo viewport → canvas (largura/altura para sprites e combate). */
        viewportRectToCanvas(rect) {
            if (!rect) return rect;
            if (!needsMobileDesktopViewport()) {
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                };
            }
            const tl = this.viewportToCanvas(rect.left, rect.top);
            const br = this.viewportToCanvas(
                rect.left + (rect.width ?? 0),
                rect.top + (rect.height ?? 0),
            );
            return {
                left: tl.x,
                top: tl.y,
                width: br.x - tl.x,
                height: br.y - tl.y,
            };
        },
        invalidateCanvasAffine,
        prepareOverlay(el) {
            if (!el || !needsMobileDesktopViewport()) return;
            el.style.setProperty("position", "absolute", "important");
        },
        appendDragGhost(el) {
            if (!el) return;
            const root = this.overlayRoot();
            root.appendChild(el);
            el.style.setProperty("z-index", "99990", "important");
        },
        positionDragGhost(el, clientX, clientY) {
            if (!el) return;
            /* Fantasma da mão em body+fixed — não reanexar ao scale-root (corta). */
            if (el._dfViewportGhost || el.dataset?.dfViewportGhost === "1"
                || (el.classList?.contains("drag-ghost-hand") && el.parentNode === global.document.body)) {
                el.style.setProperty("position", "fixed", "important");
                el.style.left = `${clientX}px`;
                el.style.top = `${clientY}px`;
                return;
            }
            const root = this.overlayRoot();
            if (root === global.document.body) {
                el.style.setProperty("position", "fixed", "important");
                el.style.left = `${clientX}px`;
                el.style.top = `${clientY}px`;
                return;
            }
            if (el.parentNode !== root) this.appendDragGhost(el);
            const pt = this.viewportToCanvas(clientX, clientY);
            el.style.setProperty("position", "absolute", "important");
            el.style.left = `${pt.x}px`;
            el.style.top = `${pt.y}px`;
        },
        lockSoftKeyboardLayout,
    });

    global.__DF_FORCE_DESKTOP_LAYOUT = FORCE_DESKTOP_LAYOUT;
    global.__DF_DESKTOP_LAYOUT_W = DESKTOP_LAYOUT_W;
    global.__DF_DESKTOP_LAYOUT_H = DESKTOP_LAYOUT_H;
    global.DfLayout = DfLayout;

    const root = global.document?.documentElement;
    if (root && root.classList) {
        applyRootLayoutClasses(root);
        syncDesktopLayoutViewport();
    }

    let vpTimer = null;
    function onViewportChangeImmediate() {
        capturePhysicalViewport();
        recoverMobileFitLock();
        syncDesktopLayoutViewport();
        try { global.DfViewport?.schedule?.(); } catch (e) { /* */ }
    }

    function onViewportChange() {
        if (vpTimer) clearTimeout(vpTimer);
        vpTimer = setTimeout(() => {
            vpTimer = null;
            onViewportChangeImmediate();
        }, viewportDebounceMs());
    }

    /** Pós-ESC no mobile: barra do browser + orientação — re-sync em fases até o letterbox estabilizar. */
    const POST_FS_MOBILE_MS = [0, 60, 160, 340, 580];
    let _postFsGen = 0;

    function recoverMobilePostFullscreen() {
        if (!needsMobileDesktopViewport() || !isTouchLikeDevice()) return;
        const gen = ++_postFsGen;
        try { global.scrollTo(0, 0); } catch (e) { /* */ }
        capturePhysicalViewport();
        forceCanvasFitClasses();
        resetMobileHudDockTransforms();
        const root = global.document?.documentElement;
        if (root) {
            root.classList.toggle("df-mobile-browser-chrome", !isBrowserFullscreen());
        }
        const runPhase = () => {
            if (gen !== _postFsGen) return;
            capturePhysicalViewport();
            onViewportChangeImmediate();
            if (!isCombatActive()) return;
            pinCombatCanvas();
            syncCombatPedestals();
            try { global.DfOrientation?.sync?.(); } catch (e) { /* */ }
        };
        for (const ms of POST_FS_MOBILE_MS) {
            if (ms === 0) {
                requestAnimationFrame(() => requestAnimationFrame(runPhase));
            } else {
                setTimeout(runPhase, ms);
            }
        }
    }

    /** ESC/F11: resize debounced pode perder o 1º clique — sync imediato no fullscreen. */
    function onFullscreenChange() {
        if (vpTimer) {
            clearTimeout(vpTimer);
            vpTimer = null;
        }
        const root = global.document?.documentElement;
        if (root) {
            root.classList.toggle(
                "df-mobile-browser-chrome",
                isTouchLikeDevice() && !isBrowserFullscreen(),
            );
            applyCombatArenaModeClasses(root);
        }
        if (!isBrowserFullscreen() && isTouchLikeDevice()) {
            recoverMobilePostFullscreen();
            return;
        }
        requestAnimationFrame(() => {
            onViewportChangeImmediate();
            if (isCombatActive()) {
                requestAnimationFrame(() => {
                    pinCombatCanvas();
                    requestAnimationFrame(syncCombatPedestals);
                });
            }
        });
    }

    if (global.document && typeof global.document.addEventListener === "function") {
        const onDomReady = () => {
            ensureHudInsideScaleRoot();
            onViewportChangeImmediate();
            const game = global.document.getElementById("game");
            if (game) {
                new MutationObserver(() => {
                    onViewportChangeImmediate();
                    if (isCombatActive()) {
                        requestAnimationFrame(() => pinCombatCanvas());
                    }
                }).observe(game, { attributes: true, attributeFilter: ["class"] });
            }
        };
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
        } else {
            onDomReady();
        }
        global.document.addEventListener("fullscreenchange", onFullscreenChange);
        global.document.addEventListener("webkitfullscreenchange", onFullscreenChange);
        global.addEventListener("orientationchange", onViewportChange, { passive: true });
        global.addEventListener("resize", onViewportChange, { passive: true });
        if (global.visualViewport) {
            global.visualViewport.addEventListener("resize", onViewportChange, { passive: true });
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
