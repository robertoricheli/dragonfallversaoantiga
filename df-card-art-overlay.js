(function () {
// Card art overlay: applies the PNG art to each rendered card.
        // Exposed as window.applyCardArtTree(root) — called explicitly from
        // the render functions (renderAllQuadrants, updateCardPreview,
        // openCardDetail). No MutationObservers, so there is no risk of
        // feedback loops or render-storm performance issues.
        (function () {
            const TALENTS = new Set(["BOLA DE FOGO", "AMEDRONTAR", "BLOQUEAR ATAQUE", "PROTEÇÃO DIVINA", "EXPLOSÃO", "ZERO ABSOLUTO", "FORTALECER", "DUPLICAR", "CANCELAR ULTIMATE", "BARREIRA", "BAFORADA VENENOSA", "ACELERAÇÃO", "MÍSSEIS MÁGICOS"]);
            const KNOWN = new Set([
                "CAVALEIRO DA NOITE", "REI CAVEIRA", "AKASHA", "SUCCUBUS",
                "WYVERN", "FERAGROSS",
                "LILITH", "ELEMENTISTA", "VEGA", "MIRA OCULTA",
                "A DUELISTA", "POPPY", "GAROU", "PISTOLEIRA NEON",
                "FAUNO", "GAIA", "FILHOTE DE DRAGÃO", "DRAGÃO AZUL",
                "COME PEDRA", "CROCOLOSSO",
                "TAGARELA", "RAZIEL",
                "MAGA DO TEMPO",
                "TIRÂNICO", "CARNIVORA", "ÔMEGA", "TIAMAT",
                "APRENDIZ DE ARQUIMAGO", "BOLHAS", "MÁSCARA DA MORTE",
                "BARBALONGA", "BEATRIX", "BICHINHO FOFINHO", "BOLA DE PELOS",
                "ENIGMA", "FIONA", "FÚRIA VERMELHA", "LICH",
                "PRINCESA AURORA", "GRISELDA", "CAVALEIRA BRINQUEDO",
                "DIANA", "OVELINA", "OLAF", "URSA", "ARCANJO", "AMIGÃO", "BANJO",
                "TOXINA", "MANDAGORA", "MARTIS",
                "ANTI-MAGOS", "SOLDADO DO FUTURO", "CALCIFER", "EFREET", "BOLT",
                "O CHEFÃO", "WU-KONG",
                "PANDA", "MENINA URSO", "TEMPESTA", "PANTEÃO",
                "JAY O BRIGÃO", "LEONA",
                "DRAGÃO DE DUAS CABEÇAS", "TREINADORA DE DRAGÕES",
                "GAMER", "ARCADIA",
                "BATEDOR FEROZ", "HELA",
                "NOBRE ELFA", "MAGO DE GELO", "SIR DUNKAN",
                "TIGRE DE GELO", "TUBARÃO BORRIFANTE", "VIOLÊNCIA", "VIPER",
                "BOLA DE FOGO", "AMEDRONTAR", "BLOQUEAR ATAQUE", "PROTEÇÃO DIVINA",
                "EXPLOSÃO", "ZERO ABSOLUTO", "FORTALECER", "DUPLICAR", "CANCELAR ULTIMATE", "BARREIRA",
                "BAFORADA VENENOSA", "ACELERAÇÃO", "MÍSSEIS MÁGICOS",
            ]);
            const base = (document.querySelector('base')?.getAttribute('href')) || './';
            const CARD_ART_V = (typeof window.__DF_CARD_ART_V === "string" && window.__DF_CARD_ART_V)
                ? window.__DF_CARD_ART_V : "0";
            /** Pasta v2 quebra cache antigo de /cards/*.png no mobile/PWA. */
            const CARD_ART_DIR = "cards/v2/";
            function cardFileKey(name) { return name.replace(/ /g, "_"); }
            function cardArtQuery(name) {
                const key = cardFileKey(name);
                const h = (typeof window.__DF_CARD_HASHES === "object" && window.__DF_CARD_HASHES)
                    ? (window.__DF_CARD_HASHES[key] || window.__DF_CARD_HASHES[name]) : "";
                // Paridade com SW + df-card-art-boot: só hash da arte (?v=), sem buildId.
                if (h) return `?v=${encodeURIComponent(String(h))}`;
                if (CARD_ART_V && CARD_ART_V !== "0" && CARD_ART_V !== "dev") {
                    return `?v=${encodeURIComponent(CARD_ART_V)}`;
                }
                return "";
            }
            function resolveAssetUrl(relPath) {
                if (!relPath) return "";
                if (/^https?:\/\//i.test(relPath)) return relPath;
                const baseHref = (document.querySelector("base")?.getAttribute("href")) || "./";
                try {
                    return new URL(relPath.replace(/^\.\//, ""), new URL(baseHref, location.href)).href;
                } catch (e) {
                    return `${base.replace(/\/$/, "")}/${relPath.replace(/^\//, "")}`;
                }
            }
            function cardSrc(name) {
                if (window.dfResolveCardArtUrls) {
                    const u = window.dfResolveCardArtUrls(name);
                    if (u[0]) return u[0];
                }
                if (window.dfCardArtPaths) {
                    return resolveAssetUrl(window.dfCardArtPaths(name)[0]);
                }
                const rel = `${CARD_ART_DIR}${cardFileKey(name)}.png${cardArtQuery(name)}`;
                return resolveAssetUrl(rel);
            }
            function cardSrcFallbacks(name) {
                if (window.dfCardArtPaths) {
                    return window.dfCardArtPaths(name).map((rel) => resolveAssetUrl(rel));
                }
                const key = cardFileKey(name);
                const q = cardArtQuery(name);
                const urls = [
                    resolveAssetUrl(`${CARD_ART_DIR}${key}.png${q}`),
                    resolveAssetUrl(`${CARD_ART_DIR}${key}.png`),
                    resolveAssetUrl(`cards/${key}.png`),
                ];
                return [...new Set(urls.filter(Boolean))];
            }
            function cssUrl(href) {
                return `url("${String(href).replace(/"/g, "%22")}")`;
            }
            function artUrl(name) {
                return cssUrl(cardSrc(name));
            }
            window.dfCardSrc = cardSrc;
            const ART_CACHE = new Map();
            const ART_CACHE_MAX = 120;
            function artCacheTouch(full, entry) {
                if (!full || !entry) return;
                if (ART_CACHE.has(full)) ART_CACHE.delete(full);
                ART_CACHE.set(full, entry);
                while (ART_CACHE.size > ART_CACHE_MAX) {
                    const oldest = ART_CACHE.keys().next().value;
                    if (oldest === undefined) break;
                    const ev = ART_CACHE.get(oldest);
                    ART_CACHE.delete(oldest);
                    try { if (ev) ev.img = null; } catch (e) { /* */ }
                }
            }
            const HERO_IMAGES = [
                "heroes/rei_bomba.png", "heroes/frosty.png", "heroes/florisbella.png",
                "heroes/tina_punker.png", "heroes/euravia.png", "heroes/bastion.png",
                "heroes/princesa_slime.png", "heroes/thor.png", "heroes/jekiro.png",
                "heroes/sangue_de_dragao.png", "heroes/gancho.png", "heroes/paladino.png",
                "heroes/alquimista.png", "heroes/valmont.png", "heroes/tecnomago.png",
                "heroes/quimera.png", "heroes/hercules.png",
                "heroes/sinistrela.png", "heroes/estrelar.png",
            ];
            const isMobileArt = () => window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
            window.__dfMobileArtDefer = isMobileArt();

            function mobileBatchSize() {
                try {
                    const c = navigator.connection;
                    if (c?.saveData) return 2;
                    const t = c?.effectiveType;
                    if (t === "slow-2g" || t === "2g") return 2;
                    if (t === "3g") return 3;
                } catch (e) {}
                // Mobile: lotes menores liberam banda/GPU para a mão + campo.
                return isMobileArt() ? 4 : 14;
            }

            function prefetchArtUrl(url, priority) {
                if (!url) return Promise.resolve(false);
                const full = resolveAssetUrl(url);
                if (window.__dfBootCacheArtUrl) {
                    const bootHit = window.__dfBootArtIsLoaded?.(full);
                    if (bootHit) return Promise.resolve(true);
                    return window.__dfBootCacheArtUrl(full)
                        .then(() => true)
                        .catch(() => false);
                }
                const hit = ART_CACHE.get(full);
                if (hit?.state === "ok") {
                    artCacheTouch(full, hit);
                    return Promise.resolve(true);
                }
                if (hit?.state === "loading") return hit.promise;
                const slowNet = !!(window.DfLazyLoad?.isSlowNetwork?.());
                // Rede lenta: se o SW já tem o byte, marca ok sem segundo Image().
            if (slowNet && typeof caches !== "undefined" && caches.match) {
                    const swHitP = caches.match(full, { ignoreSearch: false })
                        .then(async (res) => {
                            if (!res || !res.ok) return false;
                            try {
                                const blob = await res.blob();
                                if (blob && typeof createImageBitmap === "function") {
                                    const bmp = await createImageBitmap(blob);
                                    bmp.close?.();
                                }
                            } catch (e) { /* decode opcional */ }
                            const entryOk = { state: "ok", promise: Promise.resolve(true), img: null };
                            artCacheTouch(full, entryOk);
                            return true;
                        })
                        .catch(() => false);
                    // Só evita Image() se houver hit; senão segue o fluxo normal.
                    const entry = { state: "loading", promise: null };
                    const p = swHitP.then((ok) => {
                        if (ok) return true;
                        return new Promise((resolve) => {
                            const img = new Image();
                            try {
                                img.decoding = "async";
                                img.loading = priority === "high" ? "eager" : "lazy";
                                img.fetchPriority = priority === "high" ? "high" : "low";
                            } catch {}
                            const done = (okImg) => {
                                entry.state = okImg ? "ok" : "fail";
                                if (okImg) entry.img = img;
                                artCacheTouch(full, entry);
                                resolve(!!okImg);
                            };
                            img.onload = () => {
                                if (img.decode) {
                                    img.decode().then(() => done(true)).catch(() => done(true));
                                } else done(true);
                            };
                            img.onerror = () => done(false);
                            img.src = full;
                        });
                    });
                    entry.promise = p;
                    artCacheTouch(full, entry);
                    return p;
                }
                const entry = { state: "loading", promise: null };
                const p = new Promise((resolve) => {
                    const img = new Image();
                    try {
                        img.decoding = "async";
                        img.loading = priority === "high" ? "eager" : "lazy";
                        img.fetchPriority = priority === "high" ? "high" : "low";
                    } catch {}
                    const done = (ok) => {
                        entry.state = ok ? "ok" : "fail";
                        if (ok) entry.img = img;
                        artCacheTouch(full, entry);
                        resolve(!!ok);
                    };
                    img.onload = () => {
                        if (img.decode) {
                            img.decode().then(() => done(true)).catch(() => done(true));
                        } else done(true);
                    };
                    img.onerror = () => done(false);
                    img.src = full;
                });
                entry.promise = p;
                artCacheTouch(full, entry);
                return p;
            }
            window.dfPrefetchArtUrl = prefetchArtUrl;
            window.dfWarmArenaBg = function dfWarmArenaBg(opts) {
                const layout = window.DfLayout;
                const currentOnly = !!(opts && opts.currentOnly);
                const warmAllScenarios = !!(opts && opts.allScenarios);
                const tasks = [];
                if (warmAllScenarios && typeof layout?.listCombatArenaScenarios === "function") {
                    const scenarios = layout.listCombatArenaScenarios() || [];
                    for (const sc of scenarios) {
                        const rel = typeof window.dfAssetUrl === "function"
                            ? window.dfAssetUrl(String(sc.rel || "").split("?")[0])
                            : String(sc.rel || "");
                        if (!rel) continue;
                        const full = /^https?:\/\//i.test(rel) ? rel : resolveAssetUrl(rel);
                        tasks.push(prefetchArtUrl(full, "high"));
                    }
                } else {
                    const modes = currentOnly
                        ? [layout?.combatArenaMode?.() || "desktop-windowed"]
                        : ["mobile", "desktop-windowed", "desktop-fullscreen"];
                    for (const mode of modes) {
                        const rel = layout?.arenaBgUrl?.(mode)
                            || (typeof window.dfAssetUrl === "function"
                                ? window.dfAssetUrl((layout?.arenaBgRelForMode?.(mode) || "bg/FLORESTA RUNICA.png").split("?")[0])
                                : (layout?.arenaBgRelForMode?.(mode) || "bg/FLORESTA RUNICA.png"));
                        const full = /^https?:\/\//i.test(rel) ? rel : resolveAssetUrl(rel);
                        tasks.push(prefetchArtUrl(full, "high"));
                    }
                }
                return Promise.all(tasks).then(() => true).catch(() => false);
            };
            window.dfWarmHeroArts = function dfWarmHeroArts() {
                return Promise.all(
                    HERO_IMAGES.map((p) => {
                        const rel = typeof window.dfAssetUrl === "function" ? window.dfAssetUrl(p) : p;
                        return prefetchArtUrl(resolveAssetUrl(rel), "high");
                    }),
                ).then(() => true).catch(() => false);
            };

            function warmCardArt(name, priority) {
                if (!name) return;
                const prio = priority || "low";
                // Compostas: dfCardArtPaths → portraits; legado → cards/v2.
                const rels = window.dfCardArtPaths ? window.dfCardArtPaths(name) : cardSrcFallbacks(name);
                rels.slice(0, 2).forEach((rel) => prefetchArtUrl(rel, prio));
                if (window.DfCardFace?.isComposed?.(name)) {
                    void window.dfEnsureComposedFrames?.();
                }
            }

            function apply(el) {
                if (!el) return;
                const nmEl = el.querySelector(".nm");
                const name = nmEl ? nmEl.textContent.trim() : "";
                if (!name) return;
                if (window.dfAttachCardArt) {
                    window.dfAttachCardArt(el, name);
                    el.classList.toggle("type-talent", TALENTS.has(name));
                    const prio = isMobileArt()
                        ? (el.closest("#quadrant-0") ? "high" : "low")
                        : "high";
                    warmCardArt(name, prio);
                    return;
                }
            }
            if (!window.applyCardArt) window.applyCardArt = apply;
            if (!window.applyCardArtTree) {
                window.applyCardArtTree = function (root) {
                    if (!root || root.nodeType !== 1) return;
                    if (root.matches?.(".ccard, .hcard, .preview-card")) apply(root);
                    root.querySelectorAll?.(".ccard, .hcard, .preview-card").forEach(apply);
                };
            }
            window.dfWarmCardArts = function (names, priority) {
                if (!names || !names.length) return;
                const prio = priority || (isMobileArt() ? "low" : "high");
                names.forEach((n) => warmCardArt(n, prio));
            };

            let matchWarmStarted = false;
            function allPlayableCardNames() {
                const hashes = window.__DF_CARD_HASHES;
                if (hashes && typeof hashes === "object") {
                    const names = Object.keys(hashes).map((k) => String(k).replace(/_/g, " "));
                    if (names.length) return names;
                }
                return [...KNOWN];
            }
            window.allPlayableCardNames = allPlayableCardNames;
            function runCardUrlBatches(urls, priority, gapMs) {
                let idx = 0;
                const batch = mobileBatchSize();
                const run = () => {
                    const slice = urls.slice(idx, idx + batch);
                    idx += batch;
                    if (!slice.length) return;
                    Promise.all(slice.map((u) => prefetchArtUrl(u, priority))).then(() => {
                        if (idx < urls.length) {
                            const sched = window.requestIdleCallback || ((fn) => setTimeout(fn, gapMs));
                            sched(run);
                        }
                    });
                };
                run();
            }
            window.dfPreloadAllCardArts = function () {
                const names = allPlayableCardNames();
                if (window.dfEnsureArtsLoaded) {
                    return window.dfEnsureArtsLoaded(names);
                }
                const urls = names.map((n) => cardSrc(n));
                return Promise.all(urls.map((u) => prefetchArtUrl(u, "high"))).then(() => {});
            };
            function primaryArtUrl(name) {
                if (window.dfCardArtPaths) {
                    const p = window.dfCardArtPaths(name);
                    if (p?.[0]) return resolveAssetUrl(p[0]);
                }
                return cardSrc(name);
            }
            window.dfScheduleMatchArtWarm = function () {
                // Coordenador: em slow net, adia catálogo nos primeiros ~30s / até turno 2.
                try {
                    if (window.__dfMatchArtCoord?.catalogDeferred) return;
                } catch (e) { /* */ }
                if (matchWarmStarted) return;
                matchWarmStarted = true;
                const mobile = isMobileArt();
                void window.dfEnsureComposedFrames?.();
                const urls = allPlayableCardNames().map((n) => primaryArtUrl(n));
                const start = () => runCardUrlBatches(urls, "low", mobile ? 40 : 12);
                const sched = window.requestIdleCallback || ((fn) => setTimeout(fn, 900));
                sched(start, { timeout: 5000 });
            };

            /** Coordena warm de catálogo vs mão/campo no início da partida. */
            (function installMatchArtCoordinator() {
                let catalogDeferred = false;
                let revealAt = 0;
                let pendingCatalog = false;
                function onBoardReveal() {
                    revealAt = Date.now();
                    const slow = !!(window.DfLazyLoad?.isSlowNetwork?.());
                    catalogDeferred = !!slow;
                    if (slow) {
                        matchWarmStarted = false; // permite agendar depois
                        pendingCatalog = true;
                    }
                }
                function allowCatalogWarm() {
                    catalogDeferred = false;
                    if (pendingCatalog || !matchWarmStarted) {
                        pendingCatalog = false;
                        try { window.dfScheduleMatchArtWarm?.(); } catch (e) { /* */ }
                    }
                }
                function deferCatalogForLocalTurn() {
                    if (!(window.DfLazyLoad?.isSlowNetwork?.())) return;
                    catalogDeferred = true;
                    pendingCatalog = true;
                }
                function shouldDeferCatalog() {
                    if (!catalogDeferred) return false;
                    const turn = (typeof state !== "undefined" && state?.turnNumber) | 0;
                    if (turn >= 2 && !pendingCatalog) {
                        allowCatalogWarm();
                        return false;
                    }
                    if (revealAt && Date.now() - revealAt > 30000 && turn >= 2) {
                        allowCatalogWarm();
                        return false;
                    }
                    return true;
                }
                Object.defineProperty(window, "__dfMatchArtCoord", {
                    configurable: true,
                    enumerable: false,
                    value: {
                        get catalogDeferred() { return shouldDeferCatalog(); },
                        onBoardReveal,
                        allowCatalogWarm,
                        deferCatalogForLocalTurn,
                    },
                });
            })();

            window.dfWarmMatchDeck = function () {
                const handNames = [];
                if (typeof state !== "undefined" && state.players) {
                    // Ambos os baralhos em jogo (mão + campo).
                    state.players.forEach((pl) => {
                        pl.hand?.forEach((c) => handNames.push(c.name));
                        pl.field?.forEach((c) => handNames.push(c.name));
                        pl.deck?.slice?.(0, 12)?.forEach?.((c) => handNames.push(c.name));
                    });
                }
                handNames.forEach((n) => window.dfPrefetchCardArt?.(n));
                void window.dfEnsureComposedFrames?.();
                if (window.dfEnsureArtsLoaded && handNames.length) {
                    window.dfEnsureArtsLoaded(handNames);
                }
                const handUrls = [...new Set(handNames)].map((n) => primaryArtUrl(n));
                if (handUrls.length) {
                    Promise.all(handUrls.map((u) => prefetchArtUrl(u, "high")));
                }
                if (window.__dfMatchArtCoord?.catalogDeferred) return;
                const rest = allPlayableCardNames()
                    .filter((n) => !handNames.includes(n))
                    .map((n) => primaryArtUrl(n));
                const mobile = isMobileArt();
                // Resto do catálogo só em idle — não compete com o 1º turno.
                const startRest = () => runCardUrlBatches(rest, mobile ? "low" : "low", mobile ? 48 : 12);
                const sched = window.requestIdleCallback || ((fn) => setTimeout(fn, 800));
                sched(startRest, { timeout: 6000 });
            };

            const bootApply = () => {
                const root = document.getElementById("main") || document.body;
                window.applyCardArtTree(root);
            };
            if (isMobileArt()) {
                requestAnimationFrame(bootApply);
            } else {
                bootApply();
            }

            /* Pré-cache leve no boot; cartas/heróis completos no JOGAR (dfEnsureGameUpdate). */
            (function preloadAllArt() {
                const asset = (rel) => {
                    const r = typeof window.dfAssetUrl === "function" ? window.dfAssetUrl(String(rel).split("?")[0]) : rel;
                    return resolveAssetUrl(r);
                };
                HERO_IMAGES.forEach((p) => prefetchArtUrl(asset(p), "low"));
                for (let i = 1; i <= 10; i++) prefetchArtUrl(asset(`gems/${i}.png`), "low");
                prefetchArtUrl(asset("verso.png"), "high");
                prefetchArtUrl(asset("logo.png"), "low");
                // Só a arena do modo atual — não as 3 resoluções de uma vez.
                const mode = window.DfLayout?.combatArenaMode?.() || "desktop-windowed";
                const rel = window.DfLayout?.arenaBgUrl?.(mode)
                    || window.DfLayout?.arenaBgRelForMode?.(mode)
                    || "bg/CAMPO-DESKTOP-SEM-TELA-CHEIA.png";
                prefetchArtUrl(asset(rel), "high");
            })();
        })();
})();
