/**
 * Dragonfall — Menu controller (Fase 1 arquitetura).
 */
(function (global) {
    "use strict";

    function create(deps) {
        let _playUpdating = false;
        if (typeof deps.$ !== "function") deps.$ = (id) => document.getElementById(id);

        function updateMainMenuSelection() {
            deps.$("btn-main-play").classList.toggle("selected", deps.getMenuSelection() === 0);
            deps.$("btn-main-opcoes").classList.toggle("selected", deps.getMenuSelection() === 1);
            deps.$("btn-main-notes").classList.toggle("selected", deps.getMenuSelection() === 2);
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        }

        function showMainMenu() {
            ["play-menu","df-play-mode","ai-mode-select","release-notes","opcoes","card-list","df-arsenal","df-training-setup","mercado-screen","online-lobby","hero-select","objective-select","mode"].forEach(id => {
                const el = deps.$(id); if (el) el.classList.remove("active");
            });
            deps.$("main").classList.add("active");
            deps.setMenuSelection(0);
            updateMainMenuSelection();
            const hub = deps.$("df-hub-splash-layer");
            if (hub) hub.setAttribute("aria-hidden", "true");
            try { global.DfDeckBadge?.sync?.(); } catch (e) { /* */ }
        }

        function suspendHubForMenuOverlay() {
            const hub = deps.$("df-hub-splash-layer");
            if (hub) {
                hub.setAttribute("aria-hidden", "true");
                hub.style.display = "none";
            }
            global.dfPauseHubBackdrop?.();
            global.dfSyncMobileBackdrop?.();
        }

        function showOpcoes() {
            const fromHub = deps.$("play-menu")?.classList.contains("active");
            global.__dfOpcoesReturnTo = fromHub ? "hub" : "main";
            if (fromHub) suspendHubForMenuOverlay();
            deps.$("main").classList.remove("active");
            deps.$("play-menu").classList.remove("active");
            deps.$("opcoes").classList.add("active");
            try {
                const hubMusic = document.getElementById("hub-music");
                const menuMusic = document.getElementById("menu-music");
                if (fromHub && hubMusic) {
                    if (menuMusic && !menuMusic.paused) menuMusic.pause();
                    if (hubMusic.paused) hubMusic.play().catch(() => {});
                }
            } catch (e) { /* */ }
        }

        function showPlayMenu() {
            deps.$("main").classList.remove("active");
            deps.$("df-play-mode")?.classList.remove("active");
            deps.$("play-menu").classList.add("active");
            global.document?.documentElement?.removeAttribute?.("data-df-menu-bg");
            global.dfEnsureHubVideo?.() || global.DfHubSplash?.ensureCurrent?.();
            const hub = deps.$("df-hub-splash-layer");
            if (hub) {
                hub.setAttribute("aria-hidden", "false");
                hub.style.removeProperty("display");
                hub.style.removeProperty("visibility");
            }
            global.dfSyncMobileBackdrop?.();
            try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
            global.dfPlayHubVideo?.();
            try { global.DfDeckBadge?.sync?.(); } catch (e) { /* */ }
        }

        function syncReleaseNotesBadge() {
            const ver = global.__DF_DISPLAY_VERSION || deps.getDisplayVersion() || "";
            const btn = deps.$("btn-main-notes");
            if (!btn || !ver) return;
            const seen = localStorage.getItem("df_seen_release_" + ver) === "1";
            btn.classList.toggle("has-release-news", !seen);
            btn.textContent = seen
                ? "📋 Notas da Atualização"
                : "📋 Notas da Atualização · NOVO";
        }

        function showReleaseNotes() {
            const fromHub = deps.$("play-menu")?.classList.contains("active");
            global.__dfReleaseNotesReturnTo = fromHub ? "hub" : "main";
            if (fromHub) suspendHubForMenuOverlay();
            const ver = global.__DF_DISPLAY_VERSION || deps.getDisplayVersion() || "—";
            const rv = deps.$("release-notes-version");
            if (rv) {
                rv.textContent = "Versão " + ver;
                rv.classList.add("release-notes-version-live");
            }
            const root = deps.$("release-notes-list");
            const items = deps.getReleaseNotes().slice(0, deps.getReleaseNotesMax());
            root.innerHTML = items.map((n, i) => `
                <div class="release-note-item${i === 0 ? " release-note-latest" : ""}">
                    ${i === 0 ? '<div class="release-note-badge">Última atualização</div>' : ""}
                    <div class="release-note-version">v${escapeHtml(n.version)}<span class="release-note-date">${escapeHtml(n.date)}</span></div>
                    <div class="release-note-body"><ul>${n.changes.map(c => `<li>${c}</li>`).join("")}</ul></div>
                </div>
            `).join("");
            if (ver && ver !== "—") {
                try { localStorage.setItem("df_seen_release_" + ver, "1"); } catch (e) { /* */ }
            }
            syncReleaseNotesBadge();
            deps.$("main").classList.remove("active");
            deps.$("play-menu").classList.remove("active");
            deps.$("release-notes").classList.add("active");
            try {
                const fromHub = global.__dfReleaseNotesReturnTo === "hub";
                const hubMusic = document.getElementById("hub-music");
                const menuMusic = document.getElementById("menu-music");
                if (fromHub && hubMusic) {
                    if (menuMusic && !menuMusic.paused) menuMusic.pause();
                    if (hubMusic.paused) hubMusic.play().catch(() => {});
                }
            } catch (e) { /* */ }
        }

        function showCardList(initialCat) {
            if (global.DfArsenal?.open) {
                void global.DfArsenal.open({ filter: initialCat === "reaction" ? "reaction" : initialCat === "talent" ? "talent" : initialCat === "all" ? "all" : "champion" });
                return;
            }
            deps.$("play-menu").classList.remove("active");
            deps.$("card-list").classList.add("active");
            setCardListCategory(initialCat || "champion");
        }

        function cardListTypeClass(c) {
            return c.category === "talent" ? "type-talent" : "type-champion";
        }

        function paintCardListArts(_root, names) {
            if (names?.length) {
                names.forEach((n) => global.dfPrefetchCardArt?.(n));
                if (global.dfEnsureArtsLoaded) void global.dfEnsureArtsLoaded(names);
            }
        }

        function setCardListCategory(cat) {
            document.querySelectorAll("#card-list .card-tab").forEach(t => {
                t.classList.toggle("selected", t.dataset.cat === cat);
            });
            let items = [];
            const dedup = (arr) => {
                const seen = new Set();
                return arr.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true));
            };
            if (cat === "champion") {
                const unique = dedup(deps.cardDefs.filter(c => c.category === "champion" && !c.hidden));
                const byAbility = {};
                unique.forEach(c => { (byAbility[c.abilityName] = byAbility[c.abilityName] || []).push(c); });
                Object.keys(byAbility)
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .forEach(ab => {
                        items.push({ type: "group", label: ab });
                        byAbility[ab]
                            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                            .forEach(c => items.push({ type: "card", card: c }));
                    });
            } else if (cat === "talent") {
                const unique = dedup(deps.cardDefs.filter(c => c.category === "talent" && c.subcategory !== "reaction"));
                unique.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                      .forEach(c => items.push({ type: "card", card: c }));
            } else if (cat === "reaction") {
                const unique = dedup(deps.cardDefs.filter(c => c.subcategory === "reaction"));
                unique.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                      .forEach(c => items.push({ type: "card", card: c }));
            }
            const grid = deps.$("card-list-grid");
            grid.innerHTML = items.map(it => {
                if (it.type === "group") return `<div class="card-list-group">${escapeHtml(it.label)}</div>`;
                const c = it.card;
                const tc = cardListTypeClass(c);
                const faceImg = (global.DfCardFace?.isComposed?.(c))
                    ? `<div class="card-list-face df-card-face-host">${global.DfCardFace.buildHtml(c)}</div>`
                    : (global.dfCardListFaceImgHtml ? global.dfCardListFaceImgHtml(c.name) : "");
                return `<div class="card-list-item" data-cardname="${escapeHtml(c.name)}">
                    <div class="card-list-thumb ${tc}" data-card-name="${escapeHtml(c.name)}">
                        ${faceImg}
                    </div>
                    <div class="clib-name">${escapeHtml(c.name)}</div>
                </div>`;
            }).join("");
            const cardNames = items.filter((it) => it.type === "card").map((it) => it.card.name);
            paintCardListArts(grid, cardNames);
            grid.querySelectorAll(".card-list-item").forEach(el => {
                el.addEventListener("click", () => openCardListZoom(el.dataset.cardname));
            });
        }

        function openCardListZoom(cardName) {
            const c = deps.cardDefs.find(d => d.name === cardName);
            if (!c) return;
            const overlay = deps.$("card-zoom-overlay");
            const tc = cardListTypeClass(c);
            const typeLabel = c.subcategory === "reaction" ? "Reação"
                            : c.category === "talent" ? "Talento" : "Campeão";
            const powerLine = c.category === "champion"
                ? `<div style="color:#ffd76b;margin-bottom:4px">⚔️ Poder ${c.power}</div>` : "";
            const zoomFace = (global.DfCardFace?.isComposed?.(c))
                ? `<div class="card-list-face df-card-face-host">${global.DfCardFace.buildHtml(c)}</div>`
                : (global.dfCardListFaceImgHtml ? global.dfCardListFaceImgHtml(c.name) : "");
            overlay.innerHTML = `
                <div class="card-zoom-thumb ${tc}" data-card-name="${escapeHtml(c.name)}">
                    ${zoomFace}
                </div>
                <div class="card-zoom-detail">
                    <div class="czd-title">${escapeHtml(c.name)} <span style="opacity:0.7;font-size:0.8rem">(${typeLabel})</span></div>
                    ${powerLine}
                    <div class="czd-ability">${escapeHtml(c.abilityName || "")}</div>
                    <div class="czd-desc">${escapeHtml(c.abilityDesc || "")}</div>
                    <div class="czd-close">(toque pra fechar)</div>
                </div>`;
            paintCardListArts(overlay, [c.name]);
            overlay.classList.add("active");
            overlay.onclick = () => overlay.classList.remove("active");
        }

        async function bootToHubAfterAuth() {
            const isLocal = /^127\.0\.0\.1$|^localhost$/i.test(location.hostname)
                && (location.port === "5173" || location.port === "");
            const isMobile = !!(global.DfLazyLoad?.isMobileBoot?.()
                || global.matchMedia?.("(pointer: coarse)")?.matches);
            // Revisita com cache: não esperar minutos. Primeira vez pode demorar mais.
            const assetsReady = (() => {
                try {
                    const key = "df_assets_ready_v";
                    const build = global.__DF_GAME_V || "dev";
                    return global.localStorage?.getItem(key) === build;
                } catch (e) { return false; }
            })();
            const updateMs = isLocal ? 20000
                : (assetsReady ? (isMobile ? 8000 : 6000)
                    : (isMobile ? 300000 : 180000));
            const player = global.DfAuthClient?.getCachedPlayer?.();
            if (player) {
                global.DfAuthUi?.announceEnteringAs?.(player);
            }
            global.dfEnsureMenuSplashForLoad?.();
            global.dfBeginMenuLoadBar?.();
            global.DfAuthUi?.hideAllAuth?.();
            global.dfSetUpdateUi?.(assetsReady ? 50 : 30, player
                ? ("Entrando como " + (global.DfAuthUi?.accountLabelFor?.(player) || "jogador") + "…")
                : (assetsReady ? "Abrindo do cache offline…"
                    : (isLocal ? "Preparando atualização…" : "Baixando o jogo para offline…")));
            // Pulse NÃO inventa progresso: só acompanha o % real do precache.
            // Inventar 97% cedo fazia a barra “travar” no fim enquanto o download ainda rodava.
            let pulse = assetsReady ? 40 : 8;
            const pulseEvery = isMobile ? 700 : 500;
            const pulseId = global.setInterval(() => {
                const cur = Number(global.__DF_MENU_LOAD_PCT__ || 0);
                if (cur > pulse) {
                    pulse = cur;
                } else if (cur < 8 && pulse < 12) {
                    // Só no boot inicial, antes do primeiro PRECACHE_PROGRESS.
                    pulse = Math.min(12, pulse + 0.4);
                }
                try { global.dfSetMenuLoadPct?.(pulse); } catch (e) { /* */ }
            }, pulseEvery);
            try {
                // Pixi/GSAP em paralelo — não bloqueia a barra nem o Hub.
                void global.DfLazyLoad?.prepareMatchPresentation?.();
                let upd = null;
                try {
                    upd = await Promise.race([
                        global.dfEnsureGameUpdate?.({}) || Promise.resolve(),
                        new Promise((_, reject) => global.setTimeout(
                            () => reject(new Error("TIMEOUT_UPDATE")),
                            updateMs,
                        )),
                    ]);
                } catch (updErr) {
                    const msg = (updErr && updErr.message) ? String(updErr.message) : String(updErr);
                    if (msg.includes("TIMEOUT")) {
                        if (assetsReady) {
                            global.dfSetUpdateUi?.(94, "Abrindo com arquivos em cache…");
                            upd = { mode: "cache-timeout" };
                        } else {
                            global.dfSetUpdateUi?.(0, "Download ainda incompleto. Toque em JOGAR de novo.");
                            throw updErr;
                        }
                    } else {
                        throw updErr;
                    }
                }
                if (upd && upd.mode === "reload") return;
                if (global.DfAppGate?.runBeforePlayMenu) {
                    await Promise.race([
                        global.DfAppGate.runBeforePlayMenu(),
                        new Promise((r) => global.setTimeout(r, 400)),
                    ]);
                }
                global.dfSetUpdateUi?.(100, "Pronto!");
                await new Promise((r) => setTimeout(r, 40));
                // MP: partida em andamento no servidor → volta direto ao combate.
                let resumed = false;
                try {
                    const saved = global.DfNetClient?.readPersistedSession?.();
                    if (saved?.code && typeof global.dfTryResumePvpSession === "function") {
                        global.dfSetUpdateUi?.(96, "Reconectando à partida online…");
                        const r = await global.dfTryResumePvpSession();
                        resumed = !!(r && r.ok);
                    } else if (saved?.code && typeof window.__dfOnline?.dfTryResumePvpSession === "function") {
                        const r = await window.__dfOnline.dfTryResumePvpSession();
                        resumed = !!(r && r.ok);
                    }
                } catch (e) { /* hub normal */ }
                if (resumed) {
                    const g = deps.$("game");
                    const revealBoard = () => {
                        try {
                            deps.revealMatchBoard?.();
                            if (g) {
                                g.style.display = "flex";
                                g.classList.add("active", "arena-ready");
                                g.removeAttribute("hidden");
                            }
                            document.body.classList.add("df-arena-visible", "df-pvp-mode");
                            deps.$("main")?.classList.remove("active");
                            deps.$("play-menu")?.classList.remove("active");
                            const hub = deps.$("df-hub-splash-layer");
                            if (hub) {
                                hub.setAttribute("aria-hidden", "true");
                                hub.style.display = "none";
                            }
                            global.dfPauseHubBackdrop?.();
                            deps.updateUI?.(true);
                        } catch (e) { /* */ }
                    };
                    let stOk = !!(deps.getState?.()?.started && g?.classList.contains("active"));
                    if (!stOk && deps.getState?.()?.started) {
                        // Retry reveal (mesmo caminho de dfOnlineApplyReplaySync).
                        revealBoard();
                        stOk = !!(deps.getState?.()?.started && g?.classList.contains("active"));
                    }
                    if (!stOk) {
                        // Ainda sem tabuleiro: 2ª tentativa curta, sem limpar sessão.
                        try {
                            await new Promise((r) => setTimeout(r, 400));
                            const more = await (typeof global.dfTryResumePvpSession === "function"
                                ? global.dfTryResumePvpSession()
                                : window.__dfOnline?.dfTryResumePvpSession?.());
                            if (more?.ok) {
                                revealBoard();
                                stOk = !!(deps.getState?.()?.started && g?.classList.contains("active"));
                            }
                        } catch (e2) { /* */ }
                    }
                    if (!stOk) {
                        // Soft fail: mantém sessão persistida; volta ao hub sem abandonar.
                        deps.$("main")?.classList.remove("active");
                        showPlayMenu();
                        return;
                    }
                    deps.$("main")?.classList.remove("active");
                    deps.$("play-menu")?.classList.remove("active");
                    try {
                        const hub = deps.$("df-hub-splash-layer");
                        if (hub) {
                            hub.setAttribute("aria-hidden", "true");
                            hub.style.display = "none";
                        }
                        global.dfPauseHubBackdrop?.();
                    } catch (e) { /* */ }
                    return;
                }
                deps.$("main")?.classList.remove("active");
                showPlayMenu();
                try { global.dfLockSoftKeyboardLayout?.(false); } catch (e) { /* */ }
                try { global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
                global.DfAuthUi?.syncHubProfile?.();
                global.DfHubSplash?.applySaved?.();
                global.dfPlayHubVideo?.();
                try { global.DfProfileAssets?.prefetch?.(); } catch (e) { /* */ }
                try { global.dfScheduleCosmeticVideoPrecache?.(); } catch (e) { /* */ }
            } catch (e) {
                const msg = (e && e.message) ? e.message : String(e);
                global.dfSetUpdateUi?.(0, "Não foi possível iniciar. " + msg);
                await new Promise((r) => setTimeout(r, 1800));
                throw e;
            } finally {
                global.clearInterval(pulseId);
                global.dfShowMenuLoadBar?.(false);
                global.dfShowUpdateOverlay?.(false);
            }
        }

        async function onMainPlayClick() {
            if (_playUpdating) return;
            _playUpdating = true;
            try {
                global.DfMobileImmersive?.enterFullscreenFromGesture?.();
                global.dfBeginMenuLoadBar?.();
                global.dfSetMenuLoadPct?.(18, "Verificando conta…");
                // Cache-first: não trava 20–40s em /auth/me na internet lenta.
                let session = await global.DfAuthClient?.ensureSession?.({
                    preferCache: true,
                    timeoutMs: 6000,
                    maxAttempts: 1,
                });
                if (!session) {
                    deps.$("main")?.classList.remove("active");
                    global.dfShowMenuLoadBar?.(false);
                    await global.DfAuthUi?.openGate?.();
                    session = await global.DfAuthClient?.ensureSession?.({
                        preferCache: true,
                        timeoutMs: 6000,
                        maxAttempts: 1,
                    }) || global.DfAuthClient?.getCachedPlayer?.();
                    if (!session) {
                        global.dfShowMenuLoadBar?.(false);
                        deps.$("main")?.classList.add("active");
                        return;
                    }
                }
                await bootToHubAfterAuth();
            } catch (e) {
                console.warn("[DF] onMainPlayClick", e);
            } finally {
                _playUpdating = false;
            }
        }

        return {
            updateMainMenuSelection,
            escapeHtml,
            showMainMenu,
            showOpcoes,
            showPlayMenu,
            suspendHubForMenuOverlay,
            syncReleaseNotesBadge,
            showReleaseNotes,
            showCardList,
            cardListTypeClass,
            paintCardListArts,
            setCardListCategory,
            openCardListZoom,
            onMainPlayClick,
            bootToHubAfterAuth,
        };
    }

    global.DfMenuController = { create };
})(typeof window !== "undefined" ? window : globalThis);
