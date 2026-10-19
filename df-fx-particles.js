(function () {
/* ========================================================
           VISUAL FX — partículas de fogo/poeira + leque na mão.
           Esse script é cosmético; se quebrar, o jogo continua
           funcionando normalmente.
           ======================================================== */
        (function () {
            // ---- 1. Canvas de partículas (embers + dust) ----------
            const canvas = document.getElementById("fx-particles");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const isTouchDev = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
            let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, isTouchDev ? 1.25 : 2);
            function resize() {
                const fit = document.documentElement.classList.contains("df-mobile-desktop-fit");
                const scale = document.getElementById("df-scale-root");
                if (fit && scale && scale.clientWidth > 0 && scale.clientHeight > 0) {
                    W = scale.clientWidth;
                    H = scale.clientHeight;
                } else {
                    const vv = window.visualViewport;
                    W = Math.round(vv?.width || window.innerWidth || 0);
                    H = Math.round(vv?.height || window.innerHeight || 0);
                }
                canvas.width = W * dpr; canvas.height = H * dpr;
                canvas.style.width = W + "px"; canvas.style.height = H + "px";
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            resize();
            window.addEventListener("resize", resize);

            const EMBERS = [];
            const DUSTS = [];
            const EMBER_MAX = isTouchDev ? 6 : 32;
            const DUST_MAX = isTouchDev ? 4 : 24;
            let fxPaused = false;
            let fxRafId = 0;

            function spawnEmber() {
                EMBERS.push({
                    x: Math.random() * W,
                    y: H + 10,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.6 - Math.random() * 1.2,
                    life: 0,
                    maxLife: 220 + Math.random() * 160,
                    size: 1.2 + Math.random() * 1.8,
                    hue: 18 + Math.random() * 22,
                });
            }
            function spawnDust() {
                DUSTS.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    vx: (Math.random() - 0.5) * 0.25,
                    vy: (Math.random() - 0.3) * 0.18,
                    life: 0,
                    maxLife: 480 + Math.random() * 320,
                    size: 14 + Math.random() * 22,
                    alpha: 0.05 + Math.random() * 0.08,
                });
            }
            for (let i = 0; i < EMBER_MAX; i++) spawnEmber();
            for (let i = 0; i < DUST_MAX; i++) spawnDust();

            function scheduleTick() {
                if (fxRafId) return;
                fxRafId = requestAnimationFrame(tick);
            }
            function tick() {
                fxRafId = 0;
                // Pausa total: NÃO agenda o próximo frame (evita loop 60fps vazio
                // durante combate no mobile / aba em segundo plano).
                if (fxPaused) {
                    try { ctx.clearRect(0, 0, W, H); } catch (e) { /* */ }
                    return;
                }
                ctx.clearRect(0, 0, W, H);
                // Dust (low, soft)
                for (let i = DUSTS.length - 1; i >= 0; i--) {
                    const d = DUSTS[i];
                    d.life++;
                    d.x += d.vx; d.y += d.vy;
                    const t = d.life / d.maxLife;
                    if (t >= 1 || d.x < -40 || d.x > W + 40 || d.y < -40 || d.y > H + 40) {
                        DUSTS.splice(i, 1); spawnDust(); continue;
                    }
                    const a = d.alpha * Math.sin(t * Math.PI);
                    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
                    g.addColorStop(0, `rgba(255, 200, 140, ${a})`);
                    g.addColorStop(1, `rgba(255, 200, 140, 0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Embers (rising bright sparks)
                for (let i = EMBERS.length - 1; i >= 0; i--) {
                    const e = EMBERS[i];
                    e.life++;
                    e.x += e.vx + Math.sin((e.life + e.maxLife) * 0.03) * 0.18;
                    e.y += e.vy;
                    e.vy -= 0.002; // sobe acelerando levemente
                    const t = e.life / e.maxLife;
                    if (t >= 1 || e.y < -10) {
                        EMBERS.splice(i, 1); spawnEmber(); continue;
                    }
                    const a = Math.sin(t * Math.PI) * 0.95;
                    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 4);
                    g.addColorStop(0, `hsla(${e.hue}, 100%, 70%, ${a})`);
                    g.addColorStop(0.4, `hsla(${e.hue - 4}, 100%, 55%, ${a * 0.5})`);
                    g.addColorStop(1, `hsla(${e.hue - 10}, 100%, 40%, 0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.size * 4, 0, Math.PI * 2);
                    ctx.fill();
                    // núcleo brilhante
                    ctx.fillStyle = `hsla(${e.hue + 10}, 100%, 92%, ${a})`;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                scheduleTick();
            }
            scheduleTick();

            // Pausa partículas ambientes no combate (todas as plataformas) e
            // com a aba oculta — libera GPU para VFX de combate no celular.
            (function watchCombatFxPause() {
                const gameEl = document.getElementById("game");
                if (!gameEl) return;
                const sync = () => {
                    const mobileFit = !!(window.__DF_MOBILE_FIT_LOCKED
                        || window.DfLayout?.isMobileDesktopFit?.()
                        || document.documentElement.classList.contains("df-mobile-desktop-fit"));
                    const inBattle = gameEl.classList.contains("active") ||
                        gameEl.style.display === "flex" || gameEl.style.display === "block";
                    const wasPaused = fxPaused;
                    fxPaused = inBattle || !!document.hidden;
                    if (!mobileFit) {
                        document.documentElement.classList.toggle("df-mobile-in-game", isTouchDev && inBattle);
                    } else {
                        document.documentElement.classList.remove("df-mobile-in-game");
                    }
                    if (wasPaused && !fxPaused) scheduleTick();
                    if (inBattle && typeof window.__dfFanAllHands === "function") {
                        window.__dfFanAllHands();
                    }
                };
                new MutationObserver(sync).observe(gameEl, { attributes: true, attributeFilter: ["style", "class"] });
                document.addEventListener("visibilitychange", sync, { passive: true });
                sync();
            })();

            // Opção A — canvas único 1280×720; sem layout vertical adaptativo (df-mobile / hub dock).
            (function setupMobileLayoutStubs() {
                window.__dfQuadrantHeader = function (qOrIdx) {
                    const qIdx = typeof qOrIdx === "number"
                        ? qOrIdx
                        : parseInt(String(qOrIdx?.id || "").replace("quadrant-", ""), 10);
                    if (!Number.isFinite(qIdx)) return null;
                    const q = typeof qOrIdx === "object" && qOrIdx?.querySelector
                        ? qOrIdx
                        : document.getElementById(`quadrant-${qIdx}`);
                    return q?.querySelector(".quadrant-header") || null;
                };
                window.__dfSyncMobileHubDock = function () { /* noop — Opção A */ };
                window.refreshMobileLayout = function () { /* noop — Opção A */ };
            })();

            /** arena-desktop — linha vertical no meio (x=0.5); rachadura horizontal divide os campos. */
            const ARENA_DESKTOP = { w: 1024, h: 512, crackY: 0.478 };
            /** DESKTOP2.png — fundo do combate; rachadura ~centro da arte (mobile: canvas 1280×720). */
            const ARENA_COMBAT_BG = { w: 1920, h: 1080, crackY: 0.488 };

            function isCanvasDesktopFit() {
                return !!(window.DfLayout?.isMobileDesktopFit?.()
                    || document.documentElement.classList.contains("df-mobile-desktop-fit"));
            }

            function arenaViewportCenterX() {
                if (isCanvasDesktopFit()) {
                    const scale = document.getElementById("df-scale-root");
                    if (scale) {
                        const r = scale.getBoundingClientRect();
                        return r.left + r.width / 2;
                    }
                }
                const vv = window.visualViewport;
                const vw = vv?.width ?? window.innerWidth;
                const offL = vv?.offsetLeft ?? 0;
                return offL + vw / 2;
            }

            function arenaCoverMetrics(el, artW, artH) {
                const r = el.getBoundingClientRect();
                const ia = artW / artH;
                const ga = r.width / Math.max(1, r.height);
                let rw, rh, ox, oy;
                if (ga > ia) {
                    rh = r.height;
                    rw = rh * ia;
                    ox = (r.width - rw) / 2;
                    oy = 0;
                } else {
                    rw = r.width;
                    rh = rw / ia;
                    ox = 0;
                    oy = (r.height - rh) / 2;
                }
                return { rect: r, rw, rh, ox, oy };
            }

            /** Deslocamento horizontal pra alinhar o centro do tabuleiro à linha vertical da arena. */
            function measureArenaCenterShift() {
                const grid = document.getElementById("game-grid");
                if (!grid) return 0;
                const cs = getComputedStyle(grid);
                const padL = parseFloat(cs.paddingLeft) || 0;
                const padR = parseFloat(cs.paddingRight) || 0;
                if (isCanvasDesktopFit()) {
                    const contentCx = padL + (grid.clientWidth - padL - padR) / 2;
                    const arenaCx = grid.clientWidth / 2;
                    return arenaCx - contentCx;
                }
                const r = grid.getBoundingClientRect();
                const contentCx = r.left + padL + (r.width - padL - padR) / 2;
                return arenaViewportCenterX() - contentCx;
            }

            function arenaViewportCoverMetrics(artW, artH) {
                const vv = window.visualViewport;
                const vw = vv?.width ?? window.innerWidth;
                const vh = vv?.height ?? window.innerHeight;
                const offT = vv?.offsetTop ?? 0;
                const offL = vv?.offsetLeft ?? 0;
                const ia = artW / artH;
                const va = vw / Math.max(1, vh);
                let rw, rh, ox, oy;
                if (va > ia) {
                    rw = vw;
                    rh = vw / ia;
                    ox = offL;
                    oy = offT + (vh - rh) / 2;
                } else {
                    rh = vh;
                    rw = vh * ia;
                    ox = offL + (vw - rw) / 2;
                    oy = offT;
                }
                return { rw, rh, ox, oy };
            }

            function desktopArenaCrackY() {
                const game = document.getElementById("game");
                if (!game) return 0;
                if (isCanvasDesktopFit()) {
                    const art = ARENA_COMBAT_BG;
                    /* Mobile canvas fit: fundo DESKTOP2.png está no #df-rotate-stage (viewport cover). */
                    const stage = document.getElementById("df-rotate-stage");
                    if (stage) {
                        const m = arenaCoverMetrics(stage, art.w, art.h);
                        return m.rect.top + m.oy + m.rh * art.crackY;
                    }
                    const scale = document.getElementById("df-scale-root");
                    if (scale) {
                        const m = arenaCoverMetrics(scale, art.w, art.h);
                        return m.rect.top + m.oy + m.rh * art.crackY;
                    }
                }
                const bgFixed = getComputedStyle(game).backgroundAttachment === "fixed";
                if (bgFixed) {
                    const m = arenaViewportCoverMetrics(ARENA_DESKTOP.w, ARENA_DESKTOP.h);
                    return m.oy + m.rh * ARENA_DESKTOP.crackY;
                }
                const m = arenaCoverMetrics(game, ARENA_DESKTOP.w, ARENA_DESKTOP.h);
                return m.rect.top + m.oy + m.rh * ARENA_DESKTOP.crackY;
            }

            function parseLayoutPx(cs, name, fallback) {
                const n = parseFloat(cs.getPropertyValue(name));
                return Number.isFinite(n) ? n : fallback;
            }

            function readTranslateY(el) {
                if (!el) return 0;
                const t = getComputedStyle(el).transform;
                if (!t || t === "none") return 0;
                if (t.startsWith("matrix3d(")) {
                    const p = t.slice(9, -1).split(",").map((s) => parseFloat(s.trim()));
                    return Number.isFinite(p[13]) ? p[13] : 0;
                }
                if (t.startsWith("matrix(")) {
                    const p = t.slice(7, -1).split(",").map((s) => parseFloat(s.trim()));
                    return Number.isFinite(p[5]) ? p[5] : 0;
                }
                return 0;
            }

            /** IA acima da rachadura; jogador abaixo; mão IA sem encostar no campo. */
            function applyFieldCrackNudge(opts) {
                const root = document.documentElement;
                const cs = getComputedStyle(root);
                const canvasFit = isCanvasDesktopFit();
                const gap = opts.gap ?? 14;
                const aiGap = opts.aiGap ?? gap;
                const playerGap = opts.playerGap ?? gap;
                const aiField = document.querySelector("#quadrant-1 .quadrant-field");
                const playerField = document.querySelector("#quadrant-0 .quadrant-field");
                if (!aiField || !playerField) return;

                const curAi = parseLayoutPx(cs, "--df-ai-field-y-nudge", canvasFit ? -18 : 0);
                const curPlayer = parseLayoutPx(cs, "--df-player-field-y-nudge", 0);
                const curAiBias = parseLayoutPx(cs, "--df-ai-field-y-bias", canvasFit ? -18 : -4);
                const curPlayerBias = parseLayoutPx(cs, "--df-player-field-y-bias", canvasFit ? 4 : -8);
                const aiRect = aiField.getBoundingClientRect();
                const playerRect = playerField.getBoundingClientRect();
                const aiBottom = aiRect.bottom - readTranslateY(aiField);
                const playerTop = playerRect.top - readTranslateY(playerField);

                let aiNudge = Math.round(opts.aiLimitY - aiGap - aiBottom - curAiBias);
                const playerNudge = Math.round(opts.playerLimitY + playerGap - playerTop - curPlayerBias);

                const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
                const aiClamped = clamp(aiNudge, -240, 240);
                const playerClamped = clamp(playerNudge, -240, 240);
                if (canvasFit) {
                    root.style.removeProperty("--df-ai-field-y-nudge");
                    root.style.removeProperty("--df-player-field-y-nudge");
                } else {
                    if (Math.abs(aiClamped - curAi) >= 2) {
                        root.style.setProperty("--df-ai-field-y-nudge", aiClamped + "px");
                    }
                    if (Math.abs(playerClamped - curPlayer) >= 2) {
                        root.style.setProperty("--df-player-field-y-nudge", playerClamped + "px");
                    }
                }
            }

            function syncFieldCrackAlignment(opts) {
                applyFieldCrackNudge(opts);
                requestAnimationFrame(() => applyFieldCrackNudge(opts));
            }

            /** Regra universal: mãos/campo no eixo vertical da arte; rachadura divide IA/jogador. */
            function syncArenaAlignment() {
                const root = document.documentElement;
                const game = document.getElementById("game");
                const grid = document.getElementById("game-grid");
                const inGame = game && (game.classList.contains("active") || game.style.display === "flex");
                const isDuel = inGame && !!grid?.classList.contains("mode-2");
                const isMobile = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches
                    && !(window.__DF_FORCE_DESKTOP_LAYOUT || window.DfLayout?.isMobileDesktopFit?.());

                if (!isDuel) {
                    root.style.removeProperty("--df-arena-center-x");
                    root.style.removeProperty("--df-d-ai-fr");
                    root.style.removeProperty("--df-d-player-fr");
                    root.style.removeProperty("--df-ai-field-y-nudge");
                    root.style.removeProperty("--df-player-field-y-nudge");
                    return;
                }

                const canvasFit = isCanvasDesktopFit();
                const shift = measureArenaCenterShift();
                root.style.setProperty(
                    "--df-arena-center-x",
                    Math.abs(shift) >= 0.25 ? shift.toFixed(1) + "px" : "0px"
                );

                if (canvasFit && grid && grid.clientHeight > 80) {
                    const crackRatio = ARENA_COMBAT_BG.crackY;
                    root.style.setProperty("--df-d-ai-fr", crackRatio.toFixed(4) + "fr");
                    root.style.setProperty("--df-d-player-fr", (1 - crackRatio).toFixed(4) + "fr");
                    if (!root.dataset.dfArenaGridLock) {
                        root.dataset.dfArenaGridLock = "1";
                        clearPlayerHandFanCaches();
                    }
                    const crackY = desktopArenaCrackY();
                    syncFieldCrackAlignment({
                        aiLimitY: crackY,
                        playerLimitY: crackY,
                        aiGap: 36,
                        playerGap: 8,
                    });
                } else if ((!isMobile || canvasFit) && grid && grid.clientHeight > 80) {
                    const crackY = desktopArenaCrackY();
                    const gridR = grid.getBoundingClientRect();
                    const aiZoneH = Math.max(72, crackY - gridR.top);
                    const playerZoneH = Math.max(72, gridR.bottom - crackY);
                    const total = aiZoneH + playerZoneH;
                    const aiFr = aiZoneH / total;
                    const arenaReady = document.body.classList.contains("df-arena-visible")
                        || grid.classList.contains("arena-ready");
                    if (!root.dataset.dfArenaGridLock && arenaReady) {
                        root.style.setProperty("--df-d-ai-fr", aiFr.toFixed(4) + "fr");
                        root.style.setProperty("--df-d-player-fr", (1 - aiFr).toFixed(4) + "fr");
                        root.dataset.dfArenaGridLock = "1";
                        clearPlayerHandFanCaches();
                    }
                    syncFieldCrackAlignment({ aiLimitY: crackY, playerLimitY: crackY, aiGap: 18, playerGap: 8 });
                } else if (isMobile && grid && grid.clientHeight > 60) {
                    root.style.removeProperty("--df-d-ai-fr");
                    root.style.removeProperty("--df-d-player-fr");
                    const band = measureWoodBand(grid);
                    syncFieldCrackAlignment({
                        aiLimitY: band.woodTop,
                        playerLimitY: band.woodBot,
                        gap: 8,
                    });
                } else {
                    root.style.removeProperty("--df-d-ai-fr");
                    root.style.removeProperty("--df-d-player-fr");
                }
                try { window.__dfSyncPassTurnPedestal?.(); } catch (e) { /* */ }
            }

            window.__dfSyncArenaAlignment = syncArenaAlignment;
            window.__dfArenaBoardCenter = function dfArenaBoardCenter() {
                return { x: arenaViewportCenterX(), y: desktopArenaCrackY() };
            };

            // ---- 2. Fanning da mão do jogador (leque) ------------
            let playerHandLayoutSession = 0;
            function readHandCardMetrics(cards, forAI) {
                const rootCs = getComputedStyle(document.documentElement);
                const fromRoot = (name, fb) => {
                    const n = parseFloat(rootCs.getPropertyValue(name));
                    return Number.isFinite(n) && n > 0 ? n : fb;
                };
                const inner = cards[0]?.querySelector?.(forAI ? ".ai-back" : ".hcard") || cards[0];
                const defW = forAI ? 58 : fromRoot("--df-hand-card-w", 80);
                const defH = forAI ? 81 : fromRoot("--df-hand-card-h", 112);
                return {
                    w: defW || inner?.offsetWidth || (forAI ? 58 : 80),
                    h: defH || inner?.offsetHeight || (forAI ? 81 : 112),
                };
            }
            function applyFanCardState(c, state) {
                if (!c || c.closest?.(".quadrant-field")) return;
                if (c._fanRestoreRaf) cancelAnimationFrame(c._fanRestoreRaf);
                c.style.setProperty("transition", "none", "important");
                c.style.setProperty("--fan-rot", state.rot);
                c.style.setProperty("--fan-y", state.y);
                c.style.setProperty("--fan-x", state.x || "0px");
                c.style.marginLeft = state.marginLeft;
                c.style.setProperty("--fan-stack", state.stack);
                c.style.setProperty("z-index", state.stack, "important");
                void c.offsetWidth;
            }
            function applyPlayerHandPanX(handEl) {
                const shift = measureArenaCenterShift();
                const mode = window.DfLayout?.combatArenaMode?.() || "mobile";
                const bias = {
                    mobile: 64,
                    "desktop-windowed": 31,
                    "desktop-fullscreen": 33,
                }[mode] ?? 29;
                const total = shift + bias;
                handEl.style.setProperty(
                    "--df-hand-pan-x",
                    Math.abs(total) >= 0.25 ? total.toFixed(1) + "px" : "0px"
                );
            }
            function applyPlayerHandFanCache(handEl, cache) {
                const live = handEl.querySelectorAll(":scope > .hand-wrap");
                if (live.length !== cache.states.length) return false;
                handEl.style.setProperty("transition", "none", "important");
                live.forEach((c, i) => applyFanCardState(c, cache.states[i]));
                applyPlayerHandPanX(handEl);
                handEl.style.removeProperty("--df-hand-pad-b");
                const hv = cache.handVars || {};
                if (hv.fanScale) {
                    handEl.style.setProperty("--df-hand-fan-scale", hv.fanScale);
                } else {
                    handEl.style.removeProperty("--df-hand-fan-scale");
                }
                window.dfStabilizeHandWraps?.(handEl);
                return true;
            }
            function clearPlayerHandFanCaches() {
                playerHandLayoutSession++;
                document.querySelectorAll("#quadrant-0 .quadrant-hand").forEach((el) => {
                    delete el._dfFanCache;
                    delete el.dataset.dfHandLayoutKey;
                    el.style.removeProperty("--df-hand-pad-b");
                });
            }
            window.__dfClearPlayerHandFanCaches = clearPlayerHandFanCaches;

            /** Mão IA no topo: ~metade visível, encostada na borda superior. */
            const F11_AI_HAND_EXTRA_UP_PX = 52;

            function fitAIHandF11TopAlign(handEl) {
                const mode = window.DfLayout?.combatArenaMode?.() || "mobile";
                if (mode !== "desktop-fullscreen") {
                    handEl.style.removeProperty("--df-ai-hand-f11-gap");
                    return;
                }
                const anchor = document.getElementById("df-scale-root");
                if (!anchor) return;
                const measureTop = () => {
                    const card = handEl.querySelector(":scope > .hand-wrap") || handEl;
                    return card.getBoundingClientRect().top - anchor.getBoundingClientRect().top;
                };
                const apply = (pass) => {
                    const gap = measureTop();
                    const lift = Math.max(0, gap) + F11_AI_HAND_EXTRA_UP_PX;
                    handEl.style.setProperty("--df-ai-hand-f11-gap", lift.toFixed(1) + "px");
                    if (pass < 2) requestAnimationFrame(() => apply(pass + 1));
                };
                requestAnimationFrame(() => apply(0));
            }

            function fitAIHandInQuadrant(handEl, cards) {
                const metrics = readHandCardMetrics(cards, true);
                const mode = window.DfLayout?.combatArenaMode?.() || "mobile";
                const isF11 = mode === "desktop-fullscreen";
                const extraLift = {
                    mobile: 36,
                    "desktop-windowed": 32,
                    "desktop-fullscreen": 30,
                }[mode] ?? 20;
                const liftFrac = isF11 ? 0.72 : 0.70;
                const visibleFrac = isF11 ? 0.55 : 0.50;
                const visibleH = isF11
                    ? Math.max(36, Math.round(metrics.h * visibleFrac))
                    : Math.max(36, Math.round(metrics.h * visibleFrac));
                const lift = Math.max(42, Math.round(metrics.h * liftFrac)) + extraLift;
                handEl.style.setProperty("--df-ai-hand-visible-h", visibleH + "px");
                handEl.style.setProperty("--df-ai-hand-lift", lift + "px");
                handEl.style.removeProperty("--df-ai-hand-clip-h");
                handEl.style.removeProperty("--df-ai-hand-nudge-y");
                handEl.style.removeProperty("--df-ai-hand-slot-h");
                if (isF11) fitAIHandF11TopAlign(handEl);
                else handEl.style.removeProperty("--df-ai-hand-f11-gap");
            }

            function fanAIHandLandscape(handEl, cards, n) {
                const metrics = readHandCardMetrics(cards, true);
                const cardW = metrics.w;
                const cardH = metrics.h;
                const baseRot = 180;
                let maxSpread = n <= 1 ? 0 : Math.min(26, 6 + n * 1.55);
                if (n === 2) maxSpread = 12;
                else if (n === 3) maxSpread = Math.min(16, maxSpread);
                const yCurve = n >= 8 ? 9 : (n >= 6 ? 8 : (n >= 4 ? 7 : (n <= 3 ? 8 : 6)));
                const edgeBoost = 3.5;

                let overlap = 0;
                if (n > 1) {
                    const visibleFrac = n >= 8 ? 0.30 : (n >= 6 ? 0.31 : (n <= 3 ? 0.36 : 0.33));
                    const visibleStrip = Math.max(16, Math.round(cardW * visibleFrac));
                    overlap = Math.max(0, cardW - visibleStrip);
                    const handW = handEl.clientWidth
                        || handEl.closest("#game-grid")?.clientWidth
                        || 800;
                    const targetW = Math.max(220, handW * 0.86);
                    const rotRad = (maxSpread * Math.PI) / 180;
                    const wing = Math.sin(rotRad) * cardH * 0.42 + cardW * 0.04;
                    const needed = cardW - (targetW - wing * 2 - cardW) / (n - 1);
                    overlap = Math.min(cardW * 0.84, Math.max(overlap, needed));
                }

                handEl.style.setProperty("transition", "none", "important");
                handEl.style.removeProperty("--df-hand-fan-scale");
                handEl.style.removeProperty("--df-hand-pad-b");
                handEl.style.removeProperty("--df-hand-pan-y");
                applyPlayerHandPanX(handEl);

                cards.forEach((c, i) => {
                    const rel = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
                    const rot = baseRot - rel * maxSpread;
                    const edge = Math.abs(rel);
                    const yOff = -(edge * edge * yCurve + edge * edgeBoost);
                    const devRad = ((rot - baseRot) * Math.PI) / 180;
                    const xOff = -Math.sin(devRad) * cardH * 0.36;
                    applyFanCardState(c, {
                        rot: rot.toFixed(2) + "deg",
                        y: yOff.toFixed(2) + "px",
                        x: xOff.toFixed(2) + "px",
                        marginLeft: i === 0 ? "0px" : `-${Math.round(overlap)}px`,
                        stack: String(i + 1),
                    });
                });
                window.dfStabilizeHandWraps?.(handEl);
                fitAIHandInQuadrant(handEl, cards);
            }

            function fanHand(handEl) {
                if (!handEl) return;
                const cards = handEl.querySelectorAll(":scope > .hand-wrap");
                const n = cards.length;
                if (n === 0) return;
                const isAI = cards[0].classList.contains("ai-hand-wrap");
                if (isAI) {
                    fanAIHandLandscape(handEl, cards, n);
                    return;
                }
                const isMobileFit = !!(window.DfLayout?.isMobileDesktopFit?.());
                const isCanvasFitHand = isMobileFit;
                const isCanvasFitAI = isAI && isMobileFit;
                const isMobile = !isMobileFit
                    && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
                const isPlayerMainHand = !isAI && !!handEl.closest("#quadrant-0");
                const playerLayoutKey = isPlayerMainHand
                    ? `${playerHandLayoutSession}:${isMobile ? "m" : "d"}:${n}`
                    : "";
                if (isPlayerMainHand && handEl._dfFanCache?.layoutKey === playerLayoutKey) {
                    applyPlayerHandFanCache(handEl, handEl._dfFanCache);
                    return;
                }
                // MÃO DO JOGADOR NO DESKTOP: agora também em LEQUE
                // (a pedido do usuário). Usa parâmetros parecidos com
                // o leque do mobile, mas ajustados pras cartas BEM
                // MAIORES do desktop (96x134) — mesma curva da mão da
                // IA pra dar coerência visual entre os dois lados.
                const useSmallAI = isAI && isMobile && !isMobileFit;
                // DESKTOP player: leque MAIS REDONDO (pedido do
                // usuário) — ângulo maior nas pontas + parábola mais
                // marcada (ver yOff abaixo) dão uma curva mais
                // pronunciada, sem virar um meio-círculo completo.
                let maxSpread = n <= 1 ? 0 : (isCanvasFitAI || (isCanvasFitHand && isPlayerMainHand)
                    ? Math.min(26, 9 + n * 2.2)
                    : (useSmallAI
                    /* DESKTOP oponente: leque CLARO (igual ao do jogador),
                       mas com as cartas separadas (ver overlap abaixo) pra
                       não empilhar. Ângulo generoso pra formar o arco. */
                    ? Math.min(26, 9 + n * 2.2)
                    : (isMobile
                        ? Math.min(26, 8 + n * 1.8)
                        /* DESKTOP player: ângulo reduzido pra acompanhar
                           a curva mais sutil (40 -> 28). */
                        : Math.min(28, 10 + n * 1.9))));
                /* Mobile jogador: leque mais aberto e curvado (legibilidade). */
                if (isMobile && !isAI) {
                    if (n >= 8) maxSpread = Math.min(24, Math.max(15, maxSpread));
                    else if (n >= 7) maxSpread = Math.min(24, Math.max(13, maxSpread));
                    else if (n >= 6) maxSpread = Math.min(22, Math.max(11, maxSpread));
                }
                let overlap;
                if (n <= 1) overlap = 0;
                /* AI desktop: versos compactos; leque curva pra CIMA
                   (mão ancorada no topo do quadrante). */
                else if (isCanvasFitAI) {
                    const metrics = readHandCardMetrics(cards, true);
                    const cardW = metrics.w;
                    const cardH = metrics.h;
                    const handW = handEl.clientWidth
                        || handEl.closest("#game-grid")?.clientWidth
                        || 800;
                    const targetW = Math.max(240, handW * 0.9);
                    const rotRad = (maxSpread * Math.PI) / 180;
                    const wing = Math.sin(rotRad) * cardH * 1.8 + cardW * 0.08;
                    const visibleFrac = n >= 8 ? 0.34 : (n >= 7 ? 0.38 : (n >= 5 ? 0.40 : 0.44));
                    const visibleStrip = Math.max(20, Math.round(cardW * visibleFrac));
                    const baseOverlap = Math.min(Math.round(cardW * 0.72), cardW - visibleStrip);
                    const needed = n > 1 ? cardW - (targetW - wing * 2 - cardW) / (n - 1) : 0;
                    overlap = Math.min(cardW * 0.88, Math.max(baseOverlap, needed));
                }
                else if (useSmallAI) {
                    const innerCard = cards[0].querySelector(".ai-back") || cards[0];
                    const cardW = innerCard.offsetWidth || 50;
                    const visibleStrip = Math.max(20, Math.min(32, Math.round(cardW * 0.4)));
                    overlap = Math.max(8, Math.min(Math.round(cardW * 0.7), cardW - visibleStrip));
                }
                else if (isMobile || (isCanvasFitHand && isPlayerMainHand)) {
                    const metrics = readHandCardMetrics(cards, isAI);
                    const cardW = metrics.w;
                    const cardH = metrics.h;
                    const vw = isMobileFit
                        ? 1280
                        : (window.visualViewport?.width || window.innerWidth);
                    const rotRad = (maxSpread * Math.PI) / 180;
                    const wingMult = isAI ? 1.8 : 1.8;
                    const wing = Math.sin(rotRad) * cardH * wingMult + cardW * 0.08;
                    const sidePad = !isAI && n >= 8 ? 14 : 12;
                    const targetW = vw - sidePad * 2 - wing * 2;
                    const visibleFrac = !isAI
                        ? (n >= 8 ? 0.42 : (n >= 7 ? 0.44 : (n >= 5 ? 0.48 : 0.52)))
                        : (n >= 8 ? 0.30 : (n >= 7 ? 0.34 : (n >= 5 ? 0.38 : 0.42)));
                    const visibleStrip = Math.max(18, Math.round(cardW * visibleFrac));
                    const baseOverlap = Math.min(Math.round(cardW * 0.82), cardW - visibleStrip);
                    const needed = cardW - (targetW - cardW) / (n - 1);
                    overlap = Math.min(cardW * 0.86, Math.max(baseOverlap, needed));
                    if (!isAI) {
                        const estW = cardW + (n - 1) * (cardW - overlap) + wing * 2;
                        const minScale = n >= 8 ? 0.88 : 0.92;
                        const handScale = estW > targetW + 2 ? Math.max(minScale, targetW / estW) : 1;
                        if (handScale < 0.999) {
                            handEl.style.setProperty("--df-hand-fan-scale", handScale.toFixed(3));
                        } else {
                            handEl.style.removeProperty("--df-hand-fan-scale");
                        }
                    }
                }
                /* DESKTOP player: overlap ajustado à viewport — evita corte lateral. */
                else {
                    const metrics = readHandCardMetrics(cards, false);
                    const cardW = metrics.w;
                    const cardH = metrics.h;
                    const vv = window.visualViewport;
                    const vw = vv?.width ?? window.innerWidth;
                    const rotRad = (maxSpread * Math.PI) / 180;
                    const wing = Math.sin(rotRad) * cardH * 1.8 + cardW * 0.08;
                    const sidePad = 14;
                    const targetW = vw - sidePad * 2 - wing * 2;
                    const visibleFrac = n >= 8 ? 0.40 : (n >= 7 ? 0.42 : (n >= 5 ? 0.46 : 0.50));
                    const visibleStrip = Math.max(32, Math.round(cardW * visibleFrac));
                    const baseOverlap = Math.min(Math.round(cardW * 0.80), cardW - visibleStrip);
                    const needed = cardW - (targetW - cardW) / (n - 1);
                    overlap = Math.min(cardW * 0.88, Math.max(baseOverlap, needed));
                }
                // Curva do leque (yOff) — multiplicador maior no
                // DESKTOP player pra deixar o arco redondo. Reduzido
                // a pedido do usuário (22 -> 10): leque mais SUTIL
                // pra ocupar menos espaço vertical e devolver altura
                // pras cartas do campo.
                const isDesktopPlayer = !isAI && !isMobile && !isCanvasFitHand;
                // AI desktop: curva PRA BAIXO — junto com o pivô abaixo
                // (transform-origin 50% 180%) aprofunda o DOMO (centro mais
                // alto, pontas mais baixas). NUNCA usar curva negativa aqui:
                // subia as pontas ("vale"), que era a reclamação do usuário.
                let yCurve = isDesktopPlayer ? (n >= 8 ? 4 : (n >= 7 ? 6 : 10)) : (useSmallAI ? 7 : 3);
                if (isCanvasFitAI) {
                    yCurve = n >= 8 ? 6 : (n >= 7 ? 5 : 7);
                } else if ((isMobile || isCanvasFitHand) && !isAI) {
                    yCurve = n >= 8 ? 7 : (n >= 7 ? 6 : (n >= 5 ? 5 : 4));
                } else if ((isMobile || isCanvasFitHand) && isAI) {
                    yCurve = n >= 8 ? 5 : (n >= 7 ? 4 : 3);
                }
                // ySign +1 = empurra as pontas PRA BAIXO. Antes era -1 pro
                // AI (pontas pra cima) — invertido pra corrigir o "vale".
                const ySign = 1;
                handEl.style.setProperty("transition", "none", "important");
                const setHandVar = (name, val) => {
                    const cur = handEl.style.getPropertyValue(name);
                    if (cur !== val) handEl.style.setProperty(name, val);
                };
                const measureHandSpan = () => {
                    let minL = Infinity, maxR = -Infinity;
                    cards.forEach((c) => {
                        const r = c.getBoundingClientRect();
                        if (r.width < 2) return;
                        minL = Math.min(minL, r.left);
                        maxR = Math.max(maxR, r.right);
                    });
                    return Number.isFinite(minL) ? { minL, maxR } : null;
                };
                /* Mesmo eixo horizontal do campo (--df-arena-center-x): fixo
                   por layout, não recalculado pelo bbox do leque — evita
                   que a mão “ande” quando cartas entram/saem. */
                const centerHandOnArenaLine = () => {
                    applyPlayerHandPanX(handEl);
                };
                const cardStates = [];
                cards.forEach((c, i) => {
                    const rel = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
                    const rot = rel * maxSpread;
                    const yOff = Math.abs(rel) * Math.abs(rel) * yCurve;
                    const state = {
                        rot: rot.toFixed(2) + "deg",
                        y: (ySign * yOff).toFixed(2) + "px",
                        x: "0px",
                        marginLeft: i === 0 ? "0px" : `-${overlap}px`,
                        stack: String(i + 1),
                    };
                    cardStates.push(state);
                    applyFanCardState(c, state);
                });
                /* Centraliza mãos na linha vertical da arena (eixo horizontal do campo). */
                if (!isAI && n >= 1) {
                    const centerHand = () => {
                        centerHandOnArenaLine();
                        // Posição vertical fixa via CSS (--df-hand-nudge-y,
                        // padding do quadrante) — medição de overflow variava
                        // entre partidas e deslocava a mão.
                        handEl.style.removeProperty("--df-hand-pad-b");
                        if (isMobile && n > 1) {
                            const metrics = readHandCardMetrics(cards, false);
                            const cardW = metrics.w;
                            const cardH = metrics.h;
                            const vw = window.visualViewport?.width || window.innerWidth;
                            const rotRad = (maxSpread * Math.PI) / 180;
                            const wing = Math.sin(rotRad) * cardH * 1.8 + cardW * 0.08;
                            const sidePad = n >= 8 ? 14 : 12;
                            const targetW = vw - sidePad * 2 - wing * 2;
                            const estW = cardW + (n - 1) * (cardW - overlap) + wing * 2;
                            const minScale = n >= 8 ? 0.88 : 0.92;
                            const needScale = estW > targetW + 2
                                ? Math.max(minScale, targetW / estW)
                                : 1;
                            if (needScale < 0.999) {
                                handEl.style.setProperty("--df-hand-fan-scale", needScale.toFixed(3));
                            } else {
                                handEl.style.removeProperty("--df-hand-fan-scale");
                            }
                        } else {
                            handEl.style.removeProperty("--df-hand-fan-scale");
                        }
                    };
                    centerHand();
                    const gameActive = !!document.getElementById("game")?.classList.contains("active");
                    const arenaReady = document.body.classList.contains("df-arena-visible")
                        || document.getElementById("game-grid")?.classList.contains("arena-ready");
                    if (isPlayerMainHand && gameActive && arenaReady) {
                        handEl._dfFanCache = {
                            layoutKey: playerLayoutKey,
                            states: cardStates,
                            handVars: {
                                fanScale: handEl.style.getPropertyValue("--df-hand-fan-scale") || "",
                            },
                        };
                    }
                }
                window.dfStabilizeHandWraps?.(handEl);
            }

            let fanMoPaused = false;
            window.__dfPauseHandFanMO = (paused) => {
                fanMoPaused = !!paused;
            };

            // Observa mudanças nas mãos e re-aplica o leque.
            // Só fanning para o quadrante do jogador (#quadrant-0).
            let _playerFieldSealAfterFan = null;
            function fanAllHands() {
                syncArenaAlignment();
                document.querySelectorAll(".quadrant-hand").forEach(fanHand);
                window.dfStabilizeHandWraps?.();
                /* O leque muda a rotação/altura visível dos versos — repinar depois
                   dele mantém a mão da IA colada na borda superior. */
                try { window.DfLayout?.pinSpecialAiHandToGameTop?.(); } catch (e) { /* */ }
                const sealPlayerField = () => {
                    try {
                        if (!window.matchMedia("(min-width: 901px)").matches
                            || document.documentElement.classList.contains("df-mobile")) return;
                        const field = document.querySelector("#quadrant-0 .quadrant-field");
                        if (field) window.dfSealPlayerFieldRow?.(field);
                    } catch (e) { /* */ }
                };
                sealPlayerField();
                requestAnimationFrame(sealPlayerField);
                if (_playerFieldSealAfterFan) clearTimeout(_playerFieldSealAfterFan);
                _playerFieldSealAfterFan = setTimeout(() => {
                    _playerFieldSealAfterFan = null;
                    sealPlayerField();
                }, 48);
            }
            window.__dfFanAllHands = fanAllHands;
            // PERF: coalesce calls into a single rAF tick. updateUI
            // rebuilds .quadrant-hand innerHTML and appends N
            // .hand-wrap children — antes o MO disparava fanAllHands
            // N+1 vezes por compra, causando lag visível na renderização
            // da mão. Agora um único frame consolida tudo.
            let fanPending = false;
            function scheduleFan() {
                if (fanPending || fanMoPaused) return;
                fanPending = true;
                requestAnimationFrame(() => {
                    fanPending = false;
                    if (fanMoPaused) return;
                    fanAllHands();
                });
            }
            window.__dfScheduleFan = scheduleFan;
            const mo = new MutationObserver((muts) => {
                if (fanMoPaused) return;
                let need = false;
                for (const m of muts) {
                    if (m.target.classList?.contains("quadrant-hand") ||
                        m.target.closest?.(".quadrant-hand")) { need = true; break; }
                }
                if (need) scheduleFan();
            });
            // Quando o game start, começa a observar.
            function startObserving() {
                const grid = document.getElementById("game-grid");
                if (!grid) { setTimeout(startObserving, 300); return; }
                mo.observe(grid, { childList: true, subtree: true });
                fanAllHands();
            }
            startObserving();
            window.addEventListener("resize", () => {
                delete document.documentElement.dataset.dfArenaGridLock;
                clearPlayerHandFanCaches();
                syncArenaAlignment();
                fanAllHands();
            });
        })();
})();
