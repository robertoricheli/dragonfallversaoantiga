/* Carregador de arte no HEAD — roda antes do jogo; não depende do filtro KNOWN. */
    (function () {
        const CARD_ART_DIR = "cards/v2/";
        const key = (n) => String(n).replace(/ /g, "_");
        const preferWebp = () => {
            try {
                if (window.__DF_WEBP_OK === false) return false;
                if (window.__DF_WEBP_OK === true) return true;
                const c = document.createElement("canvas");
                return c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
            } catch (e) { return false; }
        };
        const cardArtQuery = (name) => {
            const k = key(name);
            const h = (typeof window.__DF_CARD_HASHES === "object" && window.__DF_CARD_HASHES)
                ? (window.__DF_CARD_HASHES[k] || window.__DF_CARD_HASHES[name]) : "";
            // Só hash da arte — URL estável entre builds; SW/precache batem o mesmo ?v=.
            if (h) return `?v=${encodeURIComponent(String(h))}`;
            const v = window.__DF_CARD_ART_V || "";
            if (v && v !== "0" && v !== "dev") return `?v=${encodeURIComponent(v)}`;
            return "";
        };
        const PORTRAIT_DIR = "cards/portraits/";
        const portraitQuery = (name) => {
            const k = key(name);
            const h = (typeof window.__DF_PORTRAIT_HASHES === "object" && window.__DF_PORTRAIT_HASHES)
                ? (window.__DF_PORTRAIT_HASHES[k] || window.__DF_PORTRAIT_HASHES[name]) : "";
            if (h) return `?v=${encodeURIComponent(String(h))}`;
            const v = window.__DF_CARD_ART_V || "";
            if (v && v !== "0" && v !== "dev") return `?v=${encodeURIComponent(v)}`;
            return "";
        };
        /** URLs de arte a prefetchar — faces compostas usam portraits, nunca v2. */
        const pathsFor = (name) => {
            if (window.DfCardFace?.isComposed?.(name)) {
                const k = key(name);
                const q = portraitQuery(name);
                const paths = [];
                if (preferWebp()) paths.push(`${PORTRAIT_DIR}${k}.webp${q}`);
                paths.push(`${PORTRAIT_DIR}${k}.png${q}`, `${PORTRAIT_DIR}${k}.png`);
                return paths;
            }
            const k = key(name);
            const q = cardArtQuery(name);
            const paths = [];
            if (preferWebp()) {
                paths.push(`${CARD_ART_DIR}${k}.webp${q}`);
            }
            paths.push(
                `${CARD_ART_DIR}${k}.png${q}`,
                `${CARD_ART_DIR}${k}.png`,
            );
            return paths;
        };
        const FRAME_RELS = [
            "bg/MOLDURA PRINCIPAL CAMPEÃO FINAL.png",
            "bg/MOLDURA PRINCIPAL TALENTO FINAL.png",
            "bg/MOLDURA PRINCIPAL REAÇÃO FINAL.png",
        ];
        function composedFrameUrls() {
            return FRAME_RELS.map((rel) => {
                if (typeof window.dfAssetUrl === "function") return window.dfAssetUrl(rel);
                return rel.split("/").map((p) => encodeURIComponent(p)).join("/");
            });
        }
        window.dfEnsureComposedFrames = function () {
            return loadArtUrlsBatched(composedFrameUrls());
        };
        const _artUrlCache = new Map();
        const _prefetchCache = new Set();
        const _prefetchLoaded = new Set();

        function cacheArtUrl(url) {
            if (!url) return Promise.reject();
            const hit = _artUrlCache.get(url);
            if (hit instanceof HTMLImageElement) return Promise.resolve(hit);
            if (hit && typeof hit.then === "function") return hit;
            const p = new Promise((resolve, reject) => {
                const im = new Image();
                try { im.fetchPriority = "high"; im.decoding = "async"; } catch (e) {}
                let settled = false;
                const done = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    _artUrlCache.set(url, im);
                    resolve(im);
                };
                const fail = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    _artUrlCache.delete(url);
                    reject(new Error("art"));
                };
                const timer = setTimeout(fail, 12000);
                im.onload = () => {
                    if (im.decode) im.decode().then(done).catch(done);
                    else done();
                };
                im.onerror = fail;
                im.src = url;
                if (im.complete && im.naturalWidth > 0) {
                    if (im.decode) im.decode().then(done).catch(done);
                    else done();
                }
            });
            _artUrlCache.set(url, p);
            return p;
        }

        function artBatchSize() {
            try {
                const mobile = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
                const et = navigator.connection?.effectiveType;
                if (et === "4g") return mobile ? 24 : 32;
                if (mobile) return 18;
                const mem = navigator.deviceMemory || 8;
                return mem <= 4 ? 14 : 22;
            } catch (e) { return 12; }
        }

        async function loadArtUrlsBatched(urls) {
            const batch = artBatchSize();
            for (let i = 0; i < urls.length; i += batch) {
                const chunk = urls.slice(i, i + batch);
                await Promise.all(chunk.map((u) => cacheArtUrl(u).catch(() => {})));
            }
        }

        window.dfEnsureArtsLoaded = function (names) {
            const urls = [];
            const seen = new Set();
            let needsFrames = false;
            (names || []).forEach((name) => {
                if (!name) return;
                _prefetchCache.add(name);
                if (window.DfCardFace?.isComposed?.(name)) needsFrames = true;
                // Prefetch primary + fallback (webp→png) para evitar atraso no onerror.
                pathsFor(name).slice(0, 2).forEach((u) => {
                    if (u && !seen.has(u)) {
                        seen.add(u);
                        urls.push(u);
                    }
                });
            });
            if (needsFrames) {
                composedFrameUrls().forEach((u) => {
                    if (u && !seen.has(u)) {
                        seen.add(u);
                        urls.push(u);
                    }
                });
            }
            return loadArtUrlsBatched(urls).then(() => {
                (names || []).forEach((n) => { if (n) _prefetchLoaded.add(n); });
            });
        };

        window.dfPrefetchCardArt = function (name) {
            if (!name) return;
            _prefetchCache.add(name);
            const url = pathsFor(name)[0];
            cacheArtUrl(url).then(() => _prefetchLoaded.add(name)).catch(() => _prefetchLoaded.add(name));
        };
        /** Aguarda arte primária da carta antes de VFX Pixi (invocação/combate). */
        window.dfAwaitCardArtReady = async function (name) {
            if (!name) return false;
            _prefetchCache.add(name);
            const url = pathsFor(name)[0];
            if (!url) return false;
            try {
                await cacheArtUrl(url);
                _prefetchLoaded.add(name);
                return true;
            } catch (e) {
                _prefetchLoaded.add(name);
                return false;
            }
        };
        window.dfCardArtIsWarm = function (name) {
            if (!name) return false;
            const url = pathsFor(name)[0];
            const hit = _artUrlCache.get(url);
            return _prefetchLoaded.has(name) || hit instanceof HTMLImageElement;
        };

        function isPlayerDesktopFieldCard(el) {
            try {
                return !!(el?.closest?.("#quadrant-0 .quadrant-field")
                    && window.matchMedia?.("(min-width: 901px)")?.matches
                    && !document.documentElement.classList.contains("df-mobile"));
            } catch (e) { return false; }
        }

        function applyPlayerDesktopFieldArtLayer(el) {
            if (!isPlayerDesktopFieldCard(el)) return;
            if (el.classList.contains("df-summon-busy") || el.classList.contains("is-summoning")
                || el.classList.contains("df-summon-settle") || el.classList.contains("field-drag-src")
                || el.classList.contains("field-dragging")) return;
            window.dfSealPlayerFieldCard?.(el);
        }

        /** Campo (todos os quadrantes): só <img> — evita fantasma vertical+horizontal no tapped. */
        function applyFieldArtLayer(el) {
            if (!el?.closest?.(".quadrant-field")) return;
            el.style.removeProperty("--card-art");
            if (isPlayerDesktopFieldCard(el)) {
                applyPlayerDesktopFieldArtLayer(el);
            }
        }

        function attach(el, name) {
            if (!el || !name) return;
            // Cartas compostas: nunca injetar PNG antiga de cards/v2.
            if (window.DfCardFace?.isComposed?.(name)) return;
            const tries = pathsFor(name);
            const ver = cardArtQuery(name) || "0";
            if (el.dataset.artName === name && el.dataset.artVersion === ver) {
                if (el.classList.contains("art-ready")) return;
                if (el.classList.contains("art-loading")) return;
            }
            const artWarm = window.dfCardArtIsWarm?.(name);
            const isField = !!el.closest?.(".quadrant-field");
            const playerDesktopField = isPlayerDesktopFieldCard(el);
            const primaryUrl = tries[0];
            const cachedHit = primaryUrl ? _artUrlCache.get(primaryUrl) : null;

            if (artWarm && cachedHit instanceof HTMLImageElement && cachedHit.complete && cachedHit.naturalWidth > 0) {
                el.dataset.artName = name;
                el.dataset.artVersion = ver;
                el.classList.remove("art-loading");
                el.classList.add("has-art", "art-ready");
                let img = el.querySelector(":scope > img.card-art-bg");
                if (!img) {
                    img = document.createElement("img");
                    img.className = "card-art-bg";
                    img.alt = "";
                    img.draggable = false;
                    img.decoding = "async";
                    try {
                        img.loading = "eager";
                        img.fetchPriority = "high";
                    } catch (e) { /* */ }
                    el.insertBefore(img, el.firstChild);
                }
                img.style.cssText =
                    "position:absolute;inset:0;width:100%;height:100%;max-width:100%;max-height:100%;" +
                    "object-fit:cover;pointer-events:none;display:block;opacity:1;";
                if (img.src !== primaryUrl) img.src = primaryUrl;
                if (isField) {
                    applyFieldArtLayer(el);
                    if (el.dataset.dfFieldLocked !== "1") {
                        window.dfStabilizeFieldCards?.(el);
                    }
                } else {
                    el.style.setProperty("--card-art", `url("${primaryUrl.replace(/"/g, "%22")}")`);
                }
                return;
            }

            el.classList.remove("has-art", "art-ready", "art-loading");
            if (!artWarm) {
                el.classList.add("art-loading");
            } else if (isField) {
                el.classList.add("art-loading", "art-field-pending");
            }
            el.style.removeProperty("--card-art");
            el.dataset.artName = name;
            el.dataset.artVersion = ver;
            let img = el.querySelector(":scope > img.card-art-bg");
            if (!img) {
                img = document.createElement("img");
                img.className = "card-art-bg";
                img.alt = "";
                img.draggable = false;
                img.decoding = "async";
                try {
                    img.loading = "eager";
                    img.fetchPriority = "high";
                } catch (e) {}
                /* Inline no mesmo frame — evita 1 frame com PNG no tamanho natural (742px). */
                img.style.cssText =
                    "position:absolute;inset:0;width:100%;height:100%;max-width:100%;max-height:100%;" +
                    "object-fit:cover;pointer-events:none;display:block;opacity:0;";
                el.insertBefore(img, el.firstChild);
            }
            let idx = 0;
            const fail = () => {
                el.classList.remove("has-art", "art-ready", "art-loading");
                if (img.parentNode === el) img.remove();
                el.style.removeProperty("--card-art");
                delete el.dataset.artName;
                delete el.dataset.artVersion;
            };
            const ready = () => {
                el.classList.remove("art-loading");
                el.classList.add("has-art", "art-ready");
                const u = tries[Math.min(idx, tries.length - 1)];
                img.style.opacity = "";
                if (isField) {
                    applyFieldArtLayer(el);
                    if (el.dataset.dfFieldLocked !== "1") {
                        window.dfStabilizeFieldCards?.(el);
                    }
                } else {
                    el.style.setProperty("--card-art", `url("${u.replace(/"/g, "%22")}")`);
                }
            };
            const finishDecode = () => {
                if (img.decode) img.decode().then(ready).catch(ready);
                else ready();
            };
            const bindUrl = (url) => {
                img.onerror = () => { idx += 1; load(); };
                img.onload = finishDecode;
                if (img.src !== url) img.src = url;
                if (img.complete && img.naturalWidth > 0) finishDecode();
            };
            const load = () => {
                if (idx >= tries.length) { fail(); return; }
                const url = tries[idx];
                const hit = _artUrlCache.get(url);
                if (hit instanceof HTMLImageElement) {
                    bindUrl(url);
                    return;
                }
                if (hit && typeof hit.then === "function") {
                    hit.then(() => bindUrl(url)).catch(() => { idx += 1; load(); });
                    return;
                }
                cacheArtUrl(url).then(() => bindUrl(url)).catch(() => { idx += 1; load(); });
            };
            const cached = _artUrlCache.get(tries[0]);
            if (cached instanceof HTMLImageElement && cached.complete && cached.naturalWidth > 0) {
                bindUrl(tries[0]);
            } else {
                load();
            }
        }
        window.dfAttachCardArt = attach;
        window.dfCardArtPaths = pathsFor;
        /** URL primária da arte (v2 + hash + fallback cards/) — lista, zoom e pré-load. */
        window.dfPrimaryCardArtSrc = function (name) {
            if (!name) return "";
            // Face composta: dataURL da moldura+textos (nunca cards/v2).
            if (window.DfCardFace?.isComposed?.(name)) {
                return window.DfCardFace.getFaceDataUrl?.(name) || "";
            }
            const urls = window.dfResolveCardArtUrls?.(name);
            return urls?.[0] || "";
        };
        window.dfResolveCardArtUrls = function (name) {
            if (!name) return [];
            const baseHref = (document.querySelector("base")?.getAttribute("href")) || "./";
            let base;
            try { base = new URL(baseHref, location.href); } catch (e) { base = null; }
            return pathsFor(name).map((rel) => {
                if (!rel) return "";
                if (!base) return rel;
                try { return new URL(rel.replace(/^\.\//, ""), base).href; } catch (e) { return rel; }
            }).filter(Boolean);
        };
        window.dfCardListImgFail = function (img) {
            let urls;
            try { urls = JSON.parse(img.dataset.paths || "[]"); } catch (e) { return; }
            const i = (parseInt(img.dataset.pathIdx, 10) || 0) + 1;
            if (i >= urls.length) {
                img.classList.add("card-list-face-fail");
                return;
            }
            img.dataset.pathIdx = String(i);
            img.src = urls[i];
        };
        /** Lista de cartas: <img> com URLs absolutas + fallback (evita pipeline art-loading preso no verso). */
        window.dfCardListFaceImgHtml = function (name) {
            const urls = window.dfResolveCardArtUrls(name);
            if (!urls.length) return "";
            const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
            const pathsAttr = esc(JSON.stringify(urls));
            return `<img class="card-list-face" src="${esc(urls[0])}" alt="" loading="eager" decoding="async" draggable="false" ` +
                `data-path-idx="0" data-paths="${pathsAttr}" ` +
                `onerror="window.dfCardListImgFail&&window.dfCardListImgFail(this)">`;
        };
        const CARD_ART_HOST_SEL = ".ccard, .hcard, .preview-card, .card-list-thumb, .card-zoom-thumb";
        window.applyCardArt = function (el) {
            if (!el) return;
            if (el.classList?.contains("has-composed-face") || el.querySelector?.(":scope > .df-card-face")) return;
            const nm = el.querySelector(".nm");
            const name = nm ? nm.textContent.trim() : (el.getAttribute("data-card-name") || "");
            if (window.DfCardFace?.isComposed?.(name)) return;
            attach(el, name);
        };
        window.applyCardArtTree = function (root) {
            if (!root || root.nodeType !== 1) return;
            if (root.matches?.(CARD_ART_HOST_SEL)) window.applyCardArt(root);
            root.querySelectorAll?.(CARD_ART_HOST_SEL).forEach(window.applyCardArt);
        };
        /** PvP: só cartas novas sem arte decodificada — evita varrer o tabuleiro inteiro. */
        window.dfApplyCardArtsFast = function (root) {
            if (!root || root.nodeType !== 1) return;
            const sel = ".ccard:not(.art-ready), .hcard:not(.art-ready), .preview-card:not(.art-ready), .card-list-thumb:not(.art-ready), .card-zoom-thumb:not(.art-ready)";
            if (root.matches?.(CARD_ART_HOST_SEL) && !root.classList.contains("art-ready")) {
                window.applyCardArt(root);
            }
            root.querySelectorAll?.(sel).forEach(window.applyCardArt);
        };
        document.documentElement.dataset.dfArtLoader = "img-head-v1";
        window.__dfBootCacheArtUrl = cacheArtUrl;
        window.__dfBootArtIsLoaded = function (url) {
            const hit = _artUrlCache.get(url);
            return hit instanceof HTMLImageElement;
        };
    })();
