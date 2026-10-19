/**
 * Dragonfall — hub: fundos estáticos (PNG) selecionáveis no perfil.
 * Vídeos de fundo foram removidos para carregamento rápido.
 */
(function (global) {
    "use strict";

    const BG_PREFIX = "bg/";
    const STORAGE_KEY = "dragonfall:hubBgId";
    const DEFAULT_ID = "reino-encantado";

    /** IDs antigos (vídeo) → fundo estático válido. */
    const LEGACY_BG_MAP = Object.freeze({
        "vila-dos-cristais": DEFAULT_ID,
    });

    const HUB_BACKGROUNDS = Object.freeze([
        { id: "reino-encantado", name: "REINO ENCANTADO", image: "REINO ENCANTADO.png", thumb: "hub-thumbs/reino-encantado.jpg" },
        { id: "frente-de-batalha", name: "FRENTE DE BATALHA", image: "FRENTE DE BATALHA.png", thumb: "hub-thumbs/frente-de-batalha.jpg" },
        { id: "cidade-steampunk", name: "CIDADE STEAMPUNK", image: "CIDADE STEAMPUNK.png", thumb: "hub-thumbs/cidade-steampunk.jpg" },
        { id: "abismo-ametista", name: "ABISMO AMETISTA", image: "ABISMO AMETISTA.png", thumb: "hub-thumbs/abismo-ametista.jpg" },
        { id: "arcadia", name: "REINO DE ARCADIA", image: "REINO DE ARCADIA.png", thumb: "hub-thumbs/arcadia.jpg" },
        { id: "montanha-flamejante", name: "MONTANHA FLAMEJANTE", image: "MONTANHA FLAMEJANTE.png", thumb: "hub-thumbs/montanha-flamejante.jpg" },
        { id: "masmorra-sem-fim", name: "MASMORRA SEM FIM", image: "MASMORRA SEM FIM.png", thumb: "hub-thumbs/masmorra-sem-fim.jpg" },
        { id: "bosque-dos-elfos", name: "BOSQUE DOS ELFOS", image: "BOSQUE DOS ELFOS.png", thumb: "hub-thumbs/bosque-dos-elfos.jpg" },
    ]);

    const BG_BY_ID = Object.freeze(
        HUB_BACKGROUNDS.reduce((acc, bg) => {
            acc[bg.id] = bg;
            return acc;
        }, {}),
    );

    function url(rel) {
        try {
            return new URL(rel, global.document?.baseURI || global.location?.href || "/").toString();
        } catch (e) {
            return rel;
        }
    }

    function bgAsset(fileName) {
        if (!fileName) return "";
        let rel = fileName;
        if (!/^https?:\/\//i.test(fileName) && !fileName.startsWith("bg/")) {
            rel = BG_PREFIX + fileName;
        }
        if (typeof global.dfAssetUrl === "function" && !/^https?:\/\//i.test(rel)) {
            rel = global.dfAssetUrl(rel.split("?")[0]);
        }
        return url(rel);
    }

    function imageFile(bg) {
        return bg?.image || bg?.poster || "";
    }

    function imageUrl(bg) {
        return bgAsset(imageFile(bg));
    }

    function thumbUrl(bg) {
        if (!bg) return imageUrl(getHubBackground(DEFAULT_ID));
        if (bg.thumb) return bgAsset(bg.thumb);
        return imageUrl(bg);
    }

    function listHubBackgrounds() {
        return HUB_BACKGROUNDS.slice();
    }

    function isValidHubBackgroundId(id) {
        return !!(id && (BG_BY_ID[id] || LEGACY_BG_MAP[id]));
    }

    function normalizeHubBackgroundId(id) {
        const raw = String(id || "").trim();
        if (BG_BY_ID[raw]) return raw;
        if (LEGACY_BG_MAP[raw]) return LEGACY_BG_MAP[raw];
        return DEFAULT_ID;
    }

    function getHubBackground(bgId) {
        return BG_BY_ID[normalizeHubBackgroundId(bgId)] || BG_BY_ID[DEFAULT_ID];
    }

    function storeHubBackgroundId(bgId) {
        const id = normalizeHubBackgroundId(bgId);
        try { global.localStorage?.setItem(STORAGE_KEY, id); } catch (e) { /* */ }
        return id;
    }

    function readLocalHubBackgroundIdOnly() {
        try {
            const raw = global.localStorage?.getItem(STORAGE_KEY);
            if (raw && (BG_BY_ID[raw] || LEGACY_BG_MAP[raw])) return normalizeHubBackgroundId(raw);
        } catch (e) { /* */ }
        return null;
    }

    function readStoredHubBackgroundId() {
        const local = readLocalHubBackgroundIdOnly();
        if (local) return local;
        return DEFAULT_ID;
    }

    function isTouchMobileUi() {
        const root = global.document?.documentElement;
        return !!root?.classList?.contains("df-touch-ui")
            && !root.classList.contains("df-desktop-windowed")
            && !root.classList.contains("df-desktop-fullscreen");
    }

    function usesMobileBackdropHost() {
        return isTouchMobileUi();
    }

    function getHubBgEl() {
        return global.document?.getElementById("df-hub-splash-bg")
            || global.document?.getElementById("df-hub-splash-video")
            || global.document?.querySelector("#df-hub-splash-layer .hub-splash-bg");
    }

    function getProfileBackdropEl() {
        return global.document?.getElementById("df-profile-backdrop-img")
            || global.document?.getElementById("df-profile-backdrop-video");
    }

    function getMobileBgEl() {
        return global.document?.getElementById("df-mobile-bg-img")
            || global.document?.getElementById("df-mobile-bg-video");
    }

    function ensureMobileBgHost() {
        const host = global.document?.getElementById("df-mobile-bg-host");
        if (!host) return null;
        let el = getMobileBgEl();
        if (!el) {
            el = global.document.createElement("img");
            el.id = "df-mobile-bg-img";
            el.className = "df-mobile-bg-video df-mobile-bg-img";
            el.alt = "";
            el.decoding = "async";
            el.setAttribute("aria-hidden", "true");
            host.appendChild(el);
        }
        return host;
    }

    function setImgSrc(el, bg) {
        if (!el || !bg) return;
        const src = imageUrl(bg);
        el.dataset.dfHubBgId = bg.id;
        el.dataset.dfCanonicalSrc = src;
        if (el.tagName === "VIDEO") {
            try { el.pause?.(); } catch (e) { /* */ }
            el.removeAttribute("src");
            el.querySelectorAll?.("source")?.forEach?.((s) => s.remove());
            // Vídeo legado: usa poster estático se ainda for VIDEO.
            el.setAttribute("poster", src);
            el.style.backgroundImage = `url("${src}")`;
            el.style.backgroundSize = "cover";
            el.style.backgroundPosition = "center";
            return;
        }
        if (el.getAttribute("src") !== src) el.src = src;
    }

    function syncHubVideoStrip() {
        const strip = global.document?.getElementById("df-hub-video-strip");
        if (strip) {
            strip.classList.add("hidden");
            strip.setAttribute("aria-hidden", "true");
        }
    }

    function applyHubBackground(bgId) {
        const bg = getHubBackground(bgId);
        const hubEl = getHubBgEl();
        const profileEl = getProfileBackdropEl();
        setImgSrc(hubEl, bg);
        setImgSrc(profileEl, bg);
        if (usesMobileBackdropHost()) {
            ensureMobileBgHost();
            setImgSrc(getMobileBgEl(), bg);
            syncMobileBackdropVisibility();
        }
        syncHubVideoStrip();
        return bg;
    }

    function applySavedHubBackground() {
        return applyHubBackground(readStoredHubBackgroundId());
    }

    function setHubBackground(bgId) {
        if (!isValidHubBackgroundId(bgId) && !LEGACY_BG_MAP[bgId]) return null;
        const id = storeHubBackgroundId(bgId);
        return applyHubBackground(id);
    }

    function syncFromPlayer(player) {
        const id = player?.hubBackgroundId;
        if (id && (isValidHubBackgroundId(id) || LEGACY_BG_MAP[id])) {
            storeHubBackgroundId(id);
            applyHubBackground(id);
            return normalizeHubBackgroundId(id);
        }
        return applySavedHubBackground()?.id || DEFAULT_ID;
    }

    function syncMobileBackdropVisibility() {
        if (!usesMobileBackdropHost()) return;
        const host = ensureMobileBgHost();
        if (!host) return;

        const playMenu = global.document?.getElementById("play-menu");
        const game = global.document?.getElementById("game");
        const profileOpen = global.document?.documentElement?.classList?.contains("df-profile-open");
        const opcoesOpen = !!global.document?.getElementById("opcoes")?.classList?.contains("active");
        const notesOpen = !!global.document?.getElementById("release-notes")?.classList?.contains("active");
        const trainingOpen = !!global.document?.body?.classList?.contains("df-training-open")
            || !!global.document?.getElementById("df-training-setup")?.classList?.contains("active");
        const arsenalOpen = !!global.document?.body?.classList?.contains("df-arsenal-open");
        const hubActive = !!playMenu?.classList?.contains("active") && !game?.classList?.contains("active")
            && !opcoesOpen && !notesOpen && !trainingOpen && !arsenalOpen;

        host.classList.toggle("is-profile-visible", !!profileOpen);
        host.classList.toggle("is-hub-visible", hubActive && !profileOpen);
        host.setAttribute("aria-hidden", (profileOpen || hubActive) ? "false" : "true");

        if (profileOpen || hubActive) {
            const bg = getHubBackground(readStoredHubBackgroundId());
            setImgSrc(getMobileBgEl(), bg);
        }

        // Telas ilustradas (Jogar/Treino/Herói/Arsenal): a arte cobre o
        // viewport pelo #df-rotate-stage — evita barras pretas nas bordas.
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
    }

    function prefetchHubBg(opts = {}) {
        const current = getHubBackground(readStoredHubBackgroundId());
        const arts = [imageUrl(current)];
        HUB_BACKGROUNDS.forEach((bg) => {
            arts.push(thumbUrl(bg));
            arts.push(imageUrl(bg));
        });
        const unique = [...new Set(arts.filter(Boolean))];
        for (const src of unique) {
            if (opts.currentOnly && src !== imageUrl(current) && src !== thumbUrl(current)) continue;
            if (global.dfPrefetchArtUrl) {
                void global.dfPrefetchArtUrl(src, "low");
                continue;
            }
            const img = new Image();
            img.decoding = "async";
            img.src = src;
        }
    }

    function ensureCurrentHubBackground() {
        const bg = applySavedHubBackground();
        prefetchHubBg({ currentOnly: true });
        return bg;
    }

    /** Decode rápido do fundo atual (substitui espera de vídeo). */
    function preloadHubBackgroundReady(bump) {
        const bg = getHubBackground(readStoredHubBackgroundId());
        const src = imageUrl(bg);
        return new Promise((resolve) => {
            const img = new Image();
            let done = false;
            const finish = (ok) => {
                if (done) return;
                done = true;
                try { bump?.(ok ? 1 : 0); } catch (e) { /* */ }
                resolve(!!ok);
            };
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = src;
            global.setTimeout(() => finish(img.complete && img.naturalWidth > 0), 2500);
        });
    }

    function wireHubLayer() {
        const layer = global.document?.getElementById("df-hub-splash-layer");
        if (!layer || layer.dataset.dfHubLayerWired === "1") return;
        layer.dataset.dfHubLayerWired = "1";
        const onHubVisible = () => {
            if (layer.getAttribute("aria-hidden") !== "false") return;
            ensureCurrentHubBackground();
            syncMobileBackdropVisibility();
        };
        new MutationObserver(onHubVisible).observe(layer, {
            attributes: true,
            attributeFilter: ["aria-hidden"],
        });
    }

    function wireHubBackdropLifecycle() {
        if (global.document?.documentElement?.dataset?.dfHubBackdropWired === "1") return;
        if (global.document?.documentElement) {
            global.document.documentElement.dataset.dfHubBackdropWired = "1";
        }
        const watchIds = ["game", "play-menu", "df-play-mode", "df-training-setup", "hero-select", "df-arsenal", "mode", "objective-select", "ai-mode-select"];
        watchIds.forEach((id) => {
            const el = global.document?.getElementById(id);
            if (!el) return;
            new MutationObserver(() => syncMobileBackdropVisibility())
                .observe(el, { attributes: true, attributeFilter: ["class"] });
        });
        global.document?.addEventListener?.("visibilitychange", () => {
            if (!global.document.hidden) syncMobileBackdropVisibility();
        });
    }

    function boot() {
        if (usesMobileBackdropHost()) ensureMobileBgHost();
        ensureCurrentHubBackground();
        wireHubLayer();
        wireHubBackdropLifecycle();
        syncMobileBackdropVisibility();
    }

    if (global.document) {
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
    }

    // Compat: APIs antigas de vídeo viram no-op / prefetch de imagem.
    global.dfPrefetchHubBg = prefetchHubBg;
    global.dfEnsureHubVideo = ensureCurrentHubBackground;
    global.dfPreloadHubVideoReady = preloadHubBackgroundReady;
    global.dfPlayHubVideo = function dfPlayHubVideo() {
        ensureCurrentHubBackground();
        syncMobileBackdropVisibility();
    };
    global.dfPauseHubBackdrop = function dfPauseHubBackdrop() { /* static — noop */ };
    global.dfSyncMobileBackdrop = syncMobileBackdropVisibility;

    global.DfHubSplash = Object.freeze({
        list: listHubBackgrounds,
        get: getHubBackground,
        isValidId: isValidHubBackgroundId,
        readSavedId: readStoredHubBackgroundId,
        readLocalId: readLocalHubBackgroundIdOnly,
        apply: applyHubBackground,
        applySaved: applySavedHubBackground,
        set: setHubBackground,
        syncFromPlayer,
        syncMobileBackdrop: syncMobileBackdropVisibility,
        prefetchVideo: function prefetchVideo(id) {
            const bg = getHubBackground(id);
            const src = imageUrl(bg);
            if (global.dfPrefetchArtUrl) void global.dfPrefetchArtUrl(src, "high");
            else {
                const img = new Image();
                img.src = src;
            }
        },
        prefetchAllVideos: function prefetchAllVideos() {
            // Só fundo atual + thumbs do picker — evita baixar todos os BGs full-res.
            prefetchHubBg({ currentOnly: true });
        },
        prefetchVideosForPicker: function prefetchVideosForPicker() {
            // Só miniaturas (não baixa todos os fundos em full-res).
            const list = HUB_BACKGROUNDS || [];
            for (const bg of list) {
                const src = thumbUrl(bg);
                if (!src) continue;
                if (global.dfPrefetchArtUrl) void global.dfPrefetchArtUrl(src, "low");
                else {
                    const img = new Image();
                    img.decoding = "async";
                    img.src = src;
                }
            }
        },
        thumbUrl,
        ensureCurrent: ensureCurrentHubBackground,
        bgAsset,
        imageUrl,
        storeHubBackgroundId,
        DEFAULT_ID,
        STORAGE_KEY,
    });
})(typeof window !== "undefined" ? window : globalThis);
