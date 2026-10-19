(function () {
// ====================================================================
        // DESKTOP HUD WIRING
        // --------------------------------------------------------------------
        // Hubs de herói nos cantos inferiores (IA esquerda, jogador direita).
        // Ultimate no pedestal esquerdo; pass-turn no pedestal direito.
        // Sem hub de Comprar/Descarte/Ultimate no canto direito.
        // ====================================================================
        (function setupDesktopHUD() {
            const useDesktopHud = () =>
                window.__DF_MOBILE_FIT_LOCKED
                || window.DfLayout?.isMobileDesktopFit?.()
                || document.documentElement.classList.contains("df-mobile-desktop-fit")
                || window.matchMedia("(min-width: 901px)").matches;
            const mqWide = {
                matches: true,
                addEventListener(_type, fn) {
                    if (typeof fn === "function") window.addEventListener("resize", fn);
                },
            };

            const wireOnce = () => {
                if (!useDesktopHud()) return;
                const pass = document.getElementById("pass-turn");
                const pedestal = document.getElementById("df-pass-turn-pedestal");
                const ultSlot = document.getElementById("df-ultimate-pedestal");
                const ultBtn = document.getElementById("ultimate-pedestal-btn");
                const game = document.getElementById("game");
                if (pass && pedestal && pass.parentElement !== pedestal) {
                    pedestal.appendChild(pass);
                }
                if (ultBtn && ultSlot && ultBtn.parentElement !== ultSlot) {
                    ultSlot.appendChild(ultBtn);
                }
                const right = document.getElementById("desktop-right-hud");
                if (right?.dataset.wired === "1") return;
                if (right) right.dataset.wired = "1";
                const triggerMenu = () => {
                    if (typeof window.__dfOpenGameMenu === "function") window.__dfOpenGameMenu();
                    else {
                        const btn = document.getElementById("end-turn");
                        if (btn && !btn.disabled) btn.click();
                    }
                };
                const logo = document.getElementById("desktop-logo");
                if (logo && !logo.dataset.wired && window.DfCombatUi?.showMenuButton?.() !== false) {
                    logo.dataset.wired = "1";
                    logo.addEventListener("click", triggerMenu);
                    logo.addEventListener("keydown", (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            triggerMenu();
                        }
                    });
                }
            };

    function fitHeroHubName(nameEl) {
                if (!nameEl) return;
                const panel = nameEl.closest(".dlh-hero-panel");
                const info = nameEl.closest(".dlhp-info");
                if (!info || !panel) return;
                nameEl.style.removeProperty("font-size");
                const portrait = panel.querySelector(".dlhp-portrait");
                const panelStyle = window.getComputedStyle(panel);
                const gap = parseFloat(panelStyle.columnGap || panelStyle.gap || "8") || 8;
                const padX = (parseFloat(panelStyle.paddingLeft) || 0) + (parseFloat(panelStyle.paddingRight) || 0);
                const portraitW = portrait?.getBoundingClientRect().width || 108;
                const panelW = panel.getBoundingClientRect().width || 0;
                const maxW = Math.max(
                    56,
                    (panelW > 0 ? panelW - portraitW - gap - padX - 4 : info.clientWidth - 2)
                );
                const isDesktopFs = document.documentElement.classList.contains("df-desktop-fullscreen");
                let sizePx = isDesktopFs ? 13.5 : 14;
                const floor = isDesktopFs ? 9 : 8;
                nameEl.style.setProperty("font-size", sizePx + "px", "important");
                while (sizePx > floor && nameEl.scrollWidth > maxW) {
                    sizePx -= 0.5;
                    nameEl.style.setProperty("font-size", sizePx + "px", "important");
                }
            }

            function scheduleFitHeroHubNames() {
                window.requestAnimationFrame(() => {
                    document.querySelectorAll(".dlh-hero-panel .dlhp-name").forEach(fitHeroHubName);
                });
            }

            function lookupHeroDef(heroId) {
                if (!heroId) return null;
                if (typeof window.__dfHudGetHero === "function") {
                    const h = window.__dfHudGetHero(heroId);
                    if (h) return h;
                }
                const defs = window.DfData?.heroDefs;
                if (!defs) return null;
                const raw = defs.find((h) => h.id === heroId);
                if (!raw) return null;
                const image = raw.image
                    ? (window.dfAssetUrl?.(raw.image) || raw.image)
                    : raw.image;
                return { ...raw, image };
            }

            function resolveHeroHubPayload(player, hud) {
                const st = window.__DF_ENGINE?.getRawState?.() || null;
                const pl = hud?.getPlayer?.(player) || st?.players?.[player] || null;
                const qIdx = hud?.quadrantForPlayer?.(player) ?? player;
                const q = document.getElementById(`quadrant-${qIdx}`);
                const header = window.__dfQuadrantHeader?.(q) || q?.querySelector(".quadrant-header");
                const heroIconEl = header?.querySelector(".hero-icon");
                const heroImg = heroIconEl?.querySelector("img");

                const hero = pl?.heroDef || lookupHeroDef(pl?.heroId);
                let imgSrc = hero?.image || heroImg?.currentSrc || heroImg?.src || "";
                let heroName = hero?.name
                    || header?.querySelector(".hero-name")?.textContent?.trim()
                    || pl?.name
                    || "";
                let heroEmoji = hero?.emoji || "";
                if (!heroEmoji && heroIconEl && !heroImg) {
                    heroEmoji = heroIconEl.textContent?.trim() || "";
                }

                return { pl, heroName: heroName || "—", imgSrc, heroEmoji, qIdx };
            }

            function applyHeroHubPortrait(portrait, imgSrc, heroEmoji) {
                if (!portrait) return;
                const img = portrait.querySelector(".dlhp-portrait-img");
                const emoji = portrait.querySelector(".dlhp-portrait-emoji");
                portrait.style.setProperty("background-size", "cover", "important");
                portrait.style.setProperty("background-position", "center top", "important");
                portrait.style.setProperty("background-repeat", "no-repeat", "important");
                portrait.style.setProperty("background-color", "#1a0c14", "important");
                if (!imgSrc) {
                    portrait.style.setProperty("background-image", "none", "important");
                    if (img) {
                        img.removeAttribute("src");
                        img.hidden = true;
                    }
                    if (emoji) {
                        emoji.hidden = false;
                        emoji.textContent = heroEmoji || "❓";
                    } else if (!img) {
                        portrait.textContent = heroEmoji || "❓";
                    }
                    return;
                }
                portrait.style.setProperty("background-image", `url(${JSON.stringify(imgSrc)})`, "important");
                if (img) {
                    img.src = imgSrc;
                    img.hidden = false;
                }
                if (emoji) emoji.hidden = true;
            }

            const openHeroHubInfo = (hubRole) => (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                // Resolve seat no clique — wire no boot usava seat 0 e travava
                // dataset.wired (MP seat 1 via hubs trocados).
                const hud = window.__dfHud;
                const localSeat = hud?.localSeat?.()
                    ?? (window.__DF_ONLINE ? (window.__DF_SEAT | 0) : 0);
                const playerIdx = hubRole === "opp" ? (1 - localSeat) : localSeat;
                if (typeof window.__dfOpenHeroInfo === "function") {
                    window.__dfOpenHeroInfo(playerIdx);
                    return;
                }
                const qIdx = hud?.quadrantForPlayer?.(playerIdx) ?? playerIdx;
                const ic = document.querySelector(
                    `#quadrant-${qIdx} .quadrant-header .hero-icon`
                );
                if (ic) ic.click();
            };

            const updateHeroPanels = () => {
                if (window.DfCombatUi?.showHeroHubs?.() === false) return;
                const hud = window.__dfHud;
                const localSeat = hud?.localSeat?.() ?? (window.__DF_SEAT | 0);
                const oppSeat = 1 - localSeat;
                const st = window.__DF_ENGINE?.getRawState?.();
                const cp = hud?.currentPlayer?.();
                const active = (st?.started && st?.winner == null)
                    ? (st?.currentPlayer ?? cp ?? -1)
                    : -1;
                const panels = [
                    { panel: document.getElementById("dlh-hero-player"), player: localSeat, hubRole: "local" },
                    { panel: document.getElementById("dlh-hero-ai"),     player: oppSeat, hubRole: "opp" },
                ];
                for (const { panel, player, hubRole } of panels) {
                    if (!panel) continue;
                    const { pl, heroName, imgSrc, heroEmoji, qIdx } = resolveHeroHubPayload(player, hud);

                    const portrait = panel.querySelector(".dlhp-portrait");
                    const portraitHit = panel.querySelector(".dlhp-portrait-hit");
                    if (portrait) {
                        applyHeroHubPortrait(portrait, imgSrc, heroEmoji);
                    }
                    if (portraitHit && !portraitHit.dataset.wired) {
                        portraitHit.dataset.wired = "1";
                        portraitHit.dataset.hubRole = hubRole;
                        portraitHit.addEventListener("click", openHeroHubInfo(hubRole));
                    } else if (portraitHit) {
                        portraitHit.dataset.hubRole = hubRole;
                    }
                    const nameEl = panel.querySelector(".dlhp-name");
                    if (nameEl) {
                        nameEl.textContent = heroName;
                        nameEl.style.removeProperty("font-size");
                        fitHeroHubName(nameEl);
                        if (!nameEl.dataset.wired) {
                            nameEl.dataset.wired = "1";
                            nameEl.dataset.hubRole = hubRole;
                            nameEl.addEventListener("click", openHeroHubInfo(hubRole));
                        } else {
                            nameEl.dataset.hubRole = hubRole;
                        }
                    }
                    const vpEl = panel.querySelector(".dlhp-vp");
                    if (vpEl) {
                        const q = document.getElementById(`quadrant-${qIdx}`);
                        const header = q?.querySelector(".quadrant-header");
                        vpEl.textContent = pl ? String(pl.vp) : (header?.querySelector(".vp-badge")?.textContent?.replace(/\s*[💀⏳]/g, "").replace(/^PV:\s*/i, "").trim() || "0");
                    }
                    const statusEl = panel.querySelector(".dlhp-status");
                    if (statusEl) {
                        const icons = [];
                        if (pl?.skipDraw) icons.push("💀");
                        if (pl?.skipNextAction) icons.push("⏳");
                        statusEl.textContent = icons.join(" ");
                        statusEl.hidden = icons.length === 0;
                        statusEl.setAttribute("aria-hidden", icons.length ? "false" : "true");
                    }
                    panel.classList.toggle("is-active-turn", active >= 0 && player === active);
                }
                scheduleFitHeroHubNames();
            };

            const updateIndicator = () => {
                if (window.DfCombatUi?.showTurnBox?.() === false) return;
                const ind = document.getElementById("desktop-turn-indicator");
                if (!ind) return;
                const hud = window.__dfHud;
                const st = window.__DF_ENGINE?.getRawState?.();
                const cp = hud?.currentPlayer?.() ?? st?.currentPlayer;
                if (cp == null || st?.started === false) {
                    ind.classList.add("dti-hidden");
                    return;
                }
                ind.classList.remove("dti-hidden");
                const pl = hud?.getPlayer?.(cp) || st?.players?.[cp];
                const heroDef = pl?.heroDef || (pl?.heroId && window.__dfHudGetHero?.(pl.heroId));
                const qIdx = hud?.quadrantForPlayer?.(cp) ?? cp;
                const activeQ = document.getElementById(`quadrant-${qIdx}`);
                const heroImg = activeQ?.querySelector(".hero-icon img");
                const heroEmoji = activeQ?.querySelector(".hero-icon")?.textContent?.trim() || heroDef?.emoji || "";
                const isYou = hud?.isLocalPlayer?.(cp) ?? (cp === 0);
                const nameEl = ind.querySelector(".dti-name");
                const actionsEl = ind.querySelector(".dti-actions-num");
                const portrait = ind.querySelector(".dti-portrait");
                if (nameEl) nameEl.textContent = isYou ? "Sua Vez" : "Vez do adversário";
                if (actionsEl) {
                    actionsEl.textContent = String(Math.max(0, pl?.actions ?? 0));
                }
                if (portrait) {
                    const imgSrc = heroDef?.image || heroImg?.src;
                    if (imgSrc) {
                        portrait.style.backgroundImage = `url("${imgSrc}")`;
                        portrait.textContent = "";
                    } else {
                        portrait.style.backgroundImage = "";
                        portrait.textContent = heroEmoji.trim() || "❓";
                        portrait.style.display = "flex";
                        portrait.style.alignItems = "center";
                        portrait.style.justifyContent = "center";
                        portrait.style.fontSize = "1.6rem";
                    }
                }
                ind.classList.toggle("is-you", isYou);
                ind.classList.toggle("is-enemy", !isYou);
            };

            const refreshAll = () => {
                updateIndicator();
                updateHeroPanels();
                try { window.__dfSyncPassTurnPedestal?.(); } catch (e) { /* */ }
                try { window.__dfSyncUltimatePedestal?.(); } catch (e) { /* */ }
                try { window.__dfSyncActionsPedestal?.(); } catch (e) { /* */ }
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            };
            window.__dfRefreshDesktopHeroPanels = refreshAll;
            let refreshTimer = 0;
            const scheduleRefresh = () => {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(refreshAll, 80);
            };
            const init = () => {
                wireOnce();
                refreshAll();
                const grid = document.getElementById("game-grid");
                if (grid) {
                    const obs = new MutationObserver(() => scheduleRefresh());
                    obs.observe(grid, {
                        attributes: true,
                        attributeFilter: ["class"],
                        subtree: true,
                        childList: true,
                        characterData: true,
                    });
                }
                const gameEl = document.getElementById("game");
                if (gameEl && !gameEl.dataset.dlhpObs) {
                    gameEl.dataset.dlhpObs = "1";
                    new MutationObserver(() => {
                        if (gameEl.classList.contains("active")) scheduleRefresh();
                    }).observe(gameEl, { attributes: true, attributeFilter: ["class"] });
                }
            };

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", init, { once: true });
            } else {
                init();
            }
            mqWide.addEventListener("change", () => {
                if (useDesktopHud()) init();
            });
            window.addEventListener("df-orientation-sync", () => {
                if (useDesktopHud()) wireOnce();
            }, { passive: true });
            window.addEventListener("df-layout-sync", () => {
                if (useDesktopHud()) scheduleRefresh();
            }, { passive: true });
            window.addEventListener("resize", () => {
                if (useDesktopHud()) {
                    wireOnce();
                    scheduleFitHeroHubNames();
                }
            }, { passive: true });
        })();

        // DESKTOP — escala via DfViewport (--df-hud-scale); limpa transform legado.
        (function setupDesktopViewportFit() {
            function clearScale() {
                const root = document.getElementById("desktop-scale-root");
                if (!root) return;
                root.style.transform = "";
                root.style.width = "";
                root.style.height = "";
                window.DfViewport?.schedule?.();
            }
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", clearScale, { once: true });
            } else {
                clearScale();
            }
            window.addEventListener("resize", clearScale, { passive: true });
        })();
})();
