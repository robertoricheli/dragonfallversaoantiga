/**
 * Dragonfall — assets do perfil (fallback de avatar; chrome PNG aposentado na UI v2).
 */
(function (global) {
    "use strict";

    const BG = "bg/";
    const FILES = Object.freeze({
        florabellaPortrait: "heroes/florisbella.png",
    });

    function url(key) {
        const file = FILES[key] || key;
        const rel = file.startsWith("heroes/") ? file : ("bg/" + file);
        return global.dfAssetUrl ? global.dfAssetUrl(rel) : rel;
    }

    function loadOne(src) {
        if (global.dfPrefetchArtUrl) {
            const p = global.dfPrefetchArtUrl(src, "high");
            if (p && typeof p.then === "function") return p.catch(() => false);
        }
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.fetchPriority = "high";
            const done = (ok) => resolve(!!ok);
            img.onload = () => {
                if (img.decode) img.decode().then(() => done(true)).catch(() => done(true));
                else done(true);
            };
            img.onerror = () => done(false);
            img.src = src;
        });
    }

    function prefetchAvatarFallback() {
        void loadOne(url("florabellaPortrait"));
    }

    /** Mantido por compat — UI v2 não pré-carrega chrome PNG. */
    function prefetch() {
        prefetchAvatarFallback();
    }

    async function prefetchReady(opts = {}) {
        const tasks = [loadOne(url("florabellaPortrait"))];
        if (opts.avatarUrl) tasks.push(loadOne(opts.avatarUrl));
        else if (opts.heroImage) {
            const src = global.dfAssetUrl
                ? global.dfAssetUrl(opts.heroImage)
                : opts.heroImage;
            tasks.push(loadOne(src));
        }
        await Promise.all(tasks);
        return true;
    }

    if (global.document) {
        const kick = () => {
            try { prefetchAvatarFallback(); } catch (e) { /* */ }
        };
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", kick, { once: true });
        } else {
            kick();
        }
    }

    global.DfProfileAssets = Object.freeze({
        url,
        prefetch,
        prefetchAvatarFallback,
        prefetchReady,
        FILES,
    });
})(typeof window !== "undefined" ? window : globalThis);
