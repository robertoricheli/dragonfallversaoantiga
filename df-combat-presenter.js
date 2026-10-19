/**
 * Dragonfall — Combat presenter (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        const DfAnim = deps.DfAnim || global.__dfAnim;
        const spawnParticles = deps.spawnParticles
            || ((x, y, count) => { try { DfAnim?.spawnParticles?.(x, y, count); } catch (e) {} });
        function deathDomRoot() {
            return global.DfLayout?.overlayRoot?.() || global.document.body;
        }

        function deathDomUsesCanvas() {
            return deathDomRoot() !== global.document.body;
        }

        function deathDomScale() {
            if (!deathDomUsesCanvas() || !global.DfLayout?.viewportToCanvas) return 1;
            const o = global.DfLayout.viewportToCanvas(0, 0);
            const u = global.DfLayout.viewportToCanvas(100, 0);
            return Math.max(0.01, Math.abs(u.x - o.x) / 100);
        }

        function deathDomBox(left, top, width, height) {
            if (!deathDomUsesCanvas() || !global.DfLayout?.viewportToCanvas) {
                return { left, top, width, height };
            }
            const tl = global.DfLayout.viewportToCanvas(left, top);
            const br = global.DfLayout.viewportToCanvas(left + width, top + height);
            return {
                left: tl.x,
                top: tl.y,
                width: Math.max(4, br.x - tl.x),
                height: Math.max(4, br.y - tl.y),
            };
        }

        function deathDomMount(el, left, top, width, height, zIndex) {
            const root = deathDomRoot();
            const box = deathDomBox(left, top, width, height);
            if (deathDomUsesCanvas()) global.DfLayout?.prepareOverlay?.(el);
            el.style.setProperty("position", deathDomUsesCanvas() ? "absolute" : "fixed", "important");
            el.style.left = box.left + "px";
            el.style.top = box.top + "px";
            if (width != null) el.style.width = box.width + "px";
            if (height != null) el.style.height = box.height + "px";
            if (zIndex != null) el.style.zIndex = String(zIndex);
            root.appendChild(el);
            return box;
        }

        /** Destruição DOM — viewport + fixed (evita achatamento no canvas fit mobile). */
        function destroyShatterUsesViewport() {
            return true;
        }

        function mountDestroyOverlay(el, left, top, width, height, zIndex) {
            const layout = global.DfLayout;
            if (layout?.isCanvasFieldLayout?.()) {
                const root = layout.overlayRoot();
                const box = layout.viewportRectToCanvas({
                    left, top, width: width ?? 0, height: height ?? 0,
                });
                root.appendChild(el);
                layout.prepareOverlay(el);
                el.style.setProperty("position", "absolute", "important");
                el.style.left = `${box.left}px`;
                el.style.top = `${box.top}px`;
                if (width != null) el.style.width = `${box.width}px`;
                if (height != null) el.style.height = `${box.height}px`;
                if (zIndex != null) el.style.zIndex = String(zIndex);
                el.style.pointerEvents = "none";
                el.style.overflow = "visible";
                return box;
            }
            el.style.setProperty("position", "fixed", "important");
            el.style.left = left + "px";
            el.style.top = top + "px";
            if (width != null) el.style.width = width + "px";
            if (height != null) el.style.height = height + "px";
            if (zIndex != null) el.style.zIndex = String(zIndex);
            el.style.pointerEvents = "none";
            el.style.overflow = "visible";
            global.document.body.appendChild(el);
            return { left, top, width, height };
        }

        function resolveDestroyArt(snap) {
            let artSrc = snap?.artSrc || null;
            const cardName = snap?.cardName || null;
            if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                const pow = snap?.currentPower ?? snap?.power ?? snap?.basePower;
                artSrc = global.DfCardFace.getFaceDataUrl?.(cardName, pow)
                    || (artSrc && String(artSrc).indexOf("data:image") === 0 ? artSrc : null);
                return { cardName, artSrc };
            }
            if ((!artSrc || artSrc.length < 4) && cardName && global.dfPrimaryCardArtSrc) {
                artSrc = global.dfPrimaryCardArtSrc(cardName) || null;
            }
            if ((!artSrc || artSrc.length < 4) && snap?.cardArtCss) {
                const m = snap.cardArtCss.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
                if (m?.[1]) artSrc = m[1];
            }
            return { cardName, artSrc };
        }

        function triggerChampionShatter(domEl, snap) {
            if (!domEl && !snap) return Promise.resolve();
            let rect = domEl?.getBoundingClientRect?.();
            if (!rect || rect.width < 4) {
                if (snap?.width > 4 && snap?.height > 4) {
                    rect = {
                        left: snap.left, top: snap.top,
                        width: snap.width, height: snap.height,
                    };
                } else {
                    return Promise.resolve();
                }
            }
            const cx = snap?.cx ?? (rect.left + rect.width / 2);
            const cy = snap?.cy ?? (rect.top + rect.height / 2);
            const snapData = snap || {
                cx, cy,
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
            };

            if (!global.DfPixiVfx?.isCombatSceneActive?.()) {
                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                try { global.DfPixiVfx?.clearStage?.(); } catch (e) { /* */ }
            }

            // Modo Leve/Mínimo ou reduced-motion → estilhaço DOM. Caso contrário, Pixi (paridade).
            const wantsGpu = !!global.DfVfxEngine?.wantsGpuPresentation?.();
            if (!wantsGpu) {
                return triggerChampionShatterDom(domEl, cx, cy, rect, snap);
            }

            // Tamanho da carta em coordenadas do canvas (canvas-fit em todas as plataformas).
            let pixiSnap = snapData;
            try {
                const canvasRect = global.DfLayout?.viewportRectToCanvas?.(rect);
                if (canvasRect && Math.abs(canvasRect.width) > 4 && Math.abs(canvasRect.height) > 4) {
                    pixiSnap = Object.assign({}, snapData, {
                        combatW: Math.abs(canvasRect.width),
                        combatH: Math.abs(canvasRect.height),
                    });
                }
            } catch (e) { /* usa snapData */ }

            // Some com a carta REAL no exato instante do estilhaço — o Pixi
            // desenha a carta (do snapshot) estilhaçando no lugar dela. Sem
            // isso, a carta do DOM continuava embaixo/depois do efeito e
            // deixava um RASTRO (borda / carta "cortada") no campo após a
            // animação. `combat-animating` isenta a carta da rede de
            // segurança (df-drag-safety) que senão restauraria a visibility
            // no meio do efeito, e some no próximo render.
            const hideSrc = domEl?.isConnected ? domEl : null;
            if (hideSrc) {
                hideSrc.classList.add("combat-animating");
                hideSrc.style.setProperty("visibility", "hidden", "important");
                hideSrc.style.setProperty("opacity", "0", "important");
                hideSrc.style.setProperty("pointer-events", "none", "important");
            }

            const pixiTry = (async () => {
                try {
                    const engine = global.DfVfxEngine;
                    if (engine?.playCardDestroy) {
                        const capMs = deps.FX.mobile ? 2200 : 1400;
                        const ok = await Promise.race([
                            engine.playCardDestroy({ cx, cy, snap: pixiSnap, fx: deps.FX, combatKill: true }),
                            new Promise((r) => setTimeout(() => r(false), capMs)),
                        ]);
                        if (ok) return true;
                    }
                } catch (e) { /* fallback DOM */ }
                return false;
            })();

            return pixiTry.then((usedPixi) => {
                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                if (usedPixi) {
                    try { global.__dfPurgeDestroyArtifacts?.(); } catch (e) { /* */ }
                    return;
                }
                // Pixi não rolou → restaura a carta pro fallback DOM poder
                // cloná-la visível (cloneNode copia visibility:hidden).
                if (hideSrc) {
                    hideSrc.classList.remove("combat-animating");
                    hideSrc.style.removeProperty("visibility");
                    hideSrc.style.removeProperty("opacity");
                    hideSrc.style.removeProperty("pointer-events");
                }
                return triggerChampionShatterDom(domEl, cx, cy, rect, snap).then(() => {
                    try { global.__dfPurgeDestroyArtifacts?.(); } catch (e) { /* */ }
                });
            });
        }

        /** Remove fantasmas/rastros de destruição — nada pode ficar no campo após o efeito. */
        function purgeDestroyArtifacts() {
            document.querySelectorAll(
                ".death-ghost, .death-halo, .death-shard, .combat-snap-ghost, .barrier-shatter-ring"
            ).forEach((el) => { try { el.remove(); } catch (e) { /* */ } });
            // Fantasmas de combate órfãos (fora do campo) — NUNCA remover .quadrant-field .ccard.
            document.querySelectorAll(".battle-fly").forEach((el) => {
                if (el.closest?.(".quadrant-field")) return;
                try { el.remove(); } catch (e) { /* */ }
            });
            document.querySelectorAll(".ccard.combat-animating").forEach((el) => {
                if (el.closest?.(".quadrant-field")) {
                    try { dfRestoreCombatFieldCard(el); } catch (e) { /* */ }
                    return;
                }
                try { el.remove(); } catch (e) { /* */ }
            });
            if (!global.DfPixiVfx?.isCombatSceneActive?.()) {
                try { global.DfPixiVfx?.sweepOrphanScenes?.(); } catch (e) { /* */ }
                try { global.DfPixiVfx?.clearStage?.(); } catch (e) { /* */ }
            }
        }
        global.__dfPurgeDestroyArtifacts = purgeDestroyArtifacts;

        function triggerChampionShatterDom(domEl, cx, cy, rectIn, snap) {
            const rect = rectIn || domEl?.getBoundingClientRect?.();
            if (!rect || rect.width < 4) return Promise.resolve();
            if (cx == null) cx = rect.left + rect.width / 2;
            if (cy == null) cy = rect.top + rect.height / 2;
            const useViewport = destroyShatterUsesViewport();
            const unit = useViewport ? 1 : deathDomScale();
            const haloW = 180;
            const haloH = 180;
        
            // Clone da carta morrendo (já que o original some no próximo render).
            let ghost;
            const { cardName, artSrc } = resolveDestroyArt(snap);
            const useArtDom = summonFlyIsMobile() && !!artSrc;
            if (useArtDom) {
                ghost = document.createElement("div");
                ghost.className = "death-ghost death-ghost-art";
                const frame = document.createElement("div");
                frame.className = "summon-fly-frame";
                const img = document.createElement("img");
                img.className = "card-art-bg";
                img.src = artSrc;
                img.alt = "";
                // Art já pré-carregada no boot e pintada no campo → decode
                // assíncrono evita travar a thread no 1º frame da animação.
                img.decoding = "async";
                img.loading = "eager";
                frame.appendChild(img);
                ghost.appendChild(frame);
                if (snap?.currentPower != null) {
                    const pow = document.createElement("div");
                    pow.className = "pow";
                    pow.textContent = String(snap.currentPower);
                    ghost.appendChild(pow);
                }
            } else if (domEl?.isConnected) {
                ghost = domEl.cloneNode(true);
            } else if (snap?.outerHTML && !summonFlyIsMobile()) {
                ghost = document.createElement("div");
                ghost.innerHTML = snap.outerHTML;
                const inner = ghost.firstElementChild;
                if (inner) {
                    inner.style.width = "100%";
                    inner.style.height = "100%";
                    inner.style.margin = "0";
                }
                try { window.applyCardArtTree?.(ghost); } catch (e) { /* */ }
            } else if (cardName) {
                ghost = document.createElement("div");
                ghost.className = "ccard type-champion has-art art-ready";
                ghost.innerHTML =
                    `<div class="pow">${snap.currentPower ?? 0}</div>` +
                    `<div class="nm">${cardName}</div>`;
                try {
                    if (window.dfAttachCardArt) window.dfAttachCardArt(ghost, cardName);
                    else if (window.applyCardArtTree) window.applyCardArtTree(ghost);
                } catch (e) { /* */ }
            } else {
                return Promise.resolve();
            }
            const ghostFace = ghost.classList?.contains("ccard") || ghost.classList?.contains("death-ghost-art")
                ? ghost
                : ghost.querySelector(".ccard") || ghost;
            ghostFace.classList.remove(
                "hl", "attacker", "target", "valid-target", "combat-charging",
                "tapped", "frozen", "field-dragging", "dragging-src",
                "snap-enemy", "drag-attack-target", "shielded-aura",
                "free-attack", "buff-aura"
            );
            if (!ghostFace.classList.contains("death-ghost-art")) {
                ghostFace.classList.add("death-ghost");
            }
            ghost.style.pointerEvents = "none";
            ghost.style.transform = "";
            ghost.style.filter = "";
            ghost.style.animation = "";
            if (ghostFace !== ghost) {
                ghostFace.style.transform = "";
                ghostFace.style.filter = "";
                ghostFace.style.animation = "";
            }
            mountDestroyOverlay(ghost, rect.left, rect.top, rect.width, rect.height, 350);
            if (domEl?.isConnected) {
                domEl.classList.add("combat-src-hidden");
                domEl.style.visibility = "hidden";
                domEl.style.opacity = "0";
                domEl.style.pointerEvents = "none";
            }
            ghost.style.zIndex = String((window.__dfAnimZ = (window.__dfAnimZ || 9860) + 2));
        
            // Halo dourado expandindo
            const halo = document.createElement("div");
            halo.className = "death-halo";
            mountDestroyOverlay(halo, cx - haloW / 2, cy - haloH / 2, haloW, haloH, 345);
        
            // Estilhaços coloridos voando em todas as direções
            // Estilhaços: SEM diamante 💎 — usuário pediu pra remover.
            const shards = ["✨","💫","⭐","🌟","✨","🔥","✨","⚡"];
            for (let i = 0; i < 22; i++) {
                const s = document.createElement("div");
                s.className = "death-shard";
                s.textContent = shards[i % shards.length];
                const ang = (Math.PI * 2 * i) / 22 + (Math.random() - 0.5) * 0.4;
                const dist = (100 + Math.random() * 100) * unit;
                mountDestroyOverlay(s, cx, cy, null, null, 360);
                s.style.left = (useViewport ? cx : (deathDomBox(cx, cy, 0, 0).left)) + "px";
                s.style.top = (useViewport ? cy : (deathDomBox(cx, cy, 0, 0).top)) + "px";
                s.style.setProperty("--px", (Math.cos(ang) * dist) + "px");
                s.style.setProperty("--py", (Math.sin(ang) * dist - 30 * unit) + "px");
                s.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
                s.style.animationDelay = (i * 12) + "ms";
                if (unit !== 1) s.style.fontSize = (1.5 * unit) + "rem";
                setTimeout(() => s.remove(), 1100);
            }
        
            const dur = deps.FX.mobile ? 820 : 900;
            return new Promise((resolve) => {
                setTimeout(() => {
                    halo.remove();
                    ghost.remove();
                    resolve();
                }, dur);
            });
        }
        
        /** Invocação voa direto ao slot final (layout do campo é que parte do centro). */
        const DF_SUMMON_FLY_ASPECT = 5 / 7;

        /** Tamanho da carta no voo — sempre o tamanho do slot de campo (sem gigante). */
        function summonFlyCardSize(src, destRect, destEl) {
            const aspect = DF_SUMMON_FLY_ASPECT;
            const root = global.document.documentElement;
            const cs = global.getComputedStyle(root);
            const fieldW = parseFloat(cs.getPropertyValue("--df-field-card-w")) || 90;
            const fieldH = parseFloat(cs.getPropertyValue("--df-field-card-h")) || 126;
            let fit = 1;
            if (global.DfLayout?.isCanvasFieldLayout?.()) {
                const scaleRoot = global.document.getElementById("df-scale-root");
                const sr = scaleRoot?.getBoundingClientRect();
                const layoutW = global.__DF_DESKTOP_LAYOUT_W || 1280;
                if (sr?.width > 0) fit = sr.width / layoutW;
            }
            // Fixo no tamanho de campo — nunca usa AABB da mão/leque (causava carta gigante).
            let destW = Math.max(40, Math.min(120, fieldW * fit));
            let destH = Math.max(56, Math.min(168, fieldH * fit));
            if (destRect?.width > 4 && destRect?.height > 4) {
                const short = Math.min(destRect.width, destRect.height);
                // Só usa o rect do slot se for razoável (não o campo inteiro).
                if (short >= 36 && short <= 140) {
                    if (destEl?.classList?.contains("tapped") || destRect.width > destRect.height * 1.05) {
                        destW = short;
                        destH = short / aspect;
                    } else {
                        destW = Math.min(destW, destRect.width);
                        destH = Math.min(destH, destRect.height);
                    }
                }
            }
            const ratio = destW / destH;
            if (ratio > aspect * 1.05) destH = destW / aspect;
            else if (ratio < aspect * 0.95) destW = destH * aspect;

            return {
                w: Math.max(40, Math.round(destW)),
                h: Math.max(56, Math.round(destH)),
                handW: Math.max(40, Math.round(destW)),
                handH: Math.max(56, Math.round(destH)),
            };
        }

        function revealSummonedFieldCard(pIdx, fIdx, mo) {
            try {
                const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                if (card?._summoning) delete card._summoning;
            } catch (e) { /* */ }
            const el = deps.getChampionDom(pIdx, fIdx)
                || global.document.getElementById(`champ-${pIdx}-${fIdx}`);
            if (!el) return;
            el.classList.remove("is-summoning", "df-summon-busy", "df-summon-settle");
            el.style.visibility = "";
            el.style.opacity = "";
            el.style.pointerEvents = "";
            el.style.removeProperty("transform");
            window.dfEndFieldSummonBusy?.(el);
            requestAnimationFrame(() => {
                window.__dfScheduleFan?.();
                requestAnimationFrame(() => {
                    window.dfScheduleFieldRowLock?.(el);
                });
            });
            if (mo) { try { mo.disconnect(); } catch (e) { /* */ } }
        }

        function summonFlyRoot() {
            return global.DfLayout?.overlayRoot?.() || global.document.body;
        }

        function summonUsesCanvasFly() {
            return summonFlyRoot() !== global.document.body;
        }

        /** Invocação DOM — sempre viewport + fixed (evita achatamento no canvas 1280×720 mobile). */
        function summonFlyDomViewport() {
            return true;
        }

        /** Mobile/touch — FX.mobile é false no canvas fit (isDesktopLayout). */
        function summonFlyIsMobile() {
            if (global.DfLayout?.isCanvasFieldLayout?.()) return true;
            if (global.DfLayout?.isMobileUserAgent?.()) return true;
            if (global.DfLayout?.isTouchGameplay?.()) return true;
            if (deps.FX?.mobile || deps.FX?.coarse) return true;
            try {
                return global.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
            } catch (e) { return false; }
        }

        function resolveSummonFlyArt(src, pIdx, fIdx, pow) {
            let cardName = src?.cardName || null;
            let artSrc = src?.artSrc || null;
            if (!cardName) {
                const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                if (card?.name) cardName = card.name;
            }
            if (!cardName && src?.html) {
                const nm = src.html.match(/class="nm"[^>]*>([^<]+)/i);
                if (nm?.[1]) cardName = nm[1].trim();
            }
            if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                // Só face composta — nunca cards/v2. Poder atual: está assado na textura.
                artSrc = global.DfCardFace.getFaceDataUrl?.(cardName, pow)
                    || (artSrc && String(artSrc).indexOf("data:image") === 0 ? artSrc : null);
                return { cardName, artSrc };
            }
            if ((!artSrc || artSrc.length < 4) && cardName && global.dfPrimaryCardArtSrc) {
                artSrc = global.dfPrimaryCardArtSrc(cardName) || null;
            }
            if ((!artSrc || artSrc.length < 4) && src?.html) {
                const m = src.html.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
                if (m?.[1]) artSrc = m[1];
            }
            return { cardName, artSrc };
        }

        /** Invocação: sempre carta completa — nunca path art-only (corta a face). */
        function summonFlyUseArtDom(_artSrc, _cardName) {
            return false;
        }

        async function summonAnimation(pIdx, fIdx, src) {
            const dest = deps.getChampionDom(pIdx, fIdx)
                || global.document.getElementById(`champ-${pIdx}-${fIdx}`);
            if (!dest || !src) {
                // Sem origem/destino: ainda precisa revelar slot _summoning.
                try {
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (card?._summoning) delete card._summoning;
                } catch (e) { /* */ }
                const live = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(`champ-${pIdx}-${fIdx}`);
                if (live) {
                    live.classList.remove("is-summoning", "df-summon-busy", "df-summon-settle");
                    live.style.visibility = "";
                    live.style.opacity = "";
                    live.style.pointerEvents = "";
                    window.dfEndFieldSummonBusy?.(live);
                }
                return;
            }

            const animKey = String(src.uid || src.cardName || `${pIdx}-${fIdx}`);
            // Anti double-fly: mesma invocação não anima duas vezes.
            if (window.__dfLocalSummonAnimKey === animKey && Date.now() < (window.__dfLocalSummonAnimUntil | 0)) {
                // Se a 1ª chamada travou após hide, revela o slot.
                try {
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (card?._summoning) delete card._summoning;
                } catch (e) { /* */ }
                const live = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(`champ-${pIdx}-${fIdx}`)
                    || dest;
                if (live) {
                    live.classList.remove("is-summoning", "df-summon-busy", "df-summon-settle");
                    live.style.visibility = "";
                    live.style.opacity = "";
                    live.style.pointerEvents = "";
                    window.dfEndFieldSummonBusy?.(live);
                }
                return;
            }
            window.__dfLocalSummonAnimKey = animKey;
            window.__dfLocalSummonAnimUntil = Date.now() + 4500;

            /* Poder do campeão que está entrando — o clone do voo precisa mostrar o
               valor ATUAL (fortalecido/reduzido), não o impresso na carta. */
            const liveCard = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx] || null;
            const summonPow = src?.currentPower
                ?? liveCard?.currentPower
                ?? liveCard?.power
                ?? null;
            const summonBasePow = liveCard?.basePower ?? liveCard?.power ?? summonPow;

            let { cardName, artSrc } = resolveSummonFlyArt(src, pIdx, fIdx, summonPow);

            let fieldHidden = false;
            const hideFieldCard = () => {
                if (fieldHidden) return;
                fieldHidden = true;
                try {
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (card) card._summoning = true;
                } catch (e) { /* */ }
                const live = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(`champ-${pIdx}-${fIdx}`)
                    || dest;
                if (!live) return;
                live.classList.add("is-summoning");
                live.style.visibility = "hidden";
                live.style.opacity = "0";
                live.style.pointerEvents = "none";
                window.dfBeginFieldSummonBusy?.(live);
            };
            // Esconde o slot ANTES do warm — senão a carta aparece no campo
            // antes do fly (regressão MP). Arte do fly vem do warm/cache.
            hideFieldCard();

            // Warm adaptativo — slow net dá mais tempo; slot já oculto.
            const warmMs = global.DfLazyLoad?.isSlowNetwork?.() ? 1800 : 600;
            try {
                if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                    const cached = global.DfCardFace.getFaceDataUrl?.(cardName, summonPow);
                    if (cached) {
                        artSrc = cached;
                    } else {
                        const warmP = global.DfCardFace.warmFace?.(
                            { name: cardName, currentPower: summonPow, power: summonBasePow },
                            { power: summonPow },
                        );
                        if (warmP && typeof warmP.then === "function") {
                            artSrc = await Promise.race([
                                warmP.then((u) => u || artSrc || ""),
                                new Promise((r) => setTimeout(() => r(artSrc || ""), warmMs)),
                            ]);
                        }
                    }
                } else if (cardName && global.dfAwaitCardArtReady) {
                    await Promise.race([
                        global.dfAwaitCardArtReady(cardName).catch(() => {}),
                        new Promise((r) => setTimeout(r, warmMs)),
                    ]);
                    if (!artSrc || artSrc.length < 4) {
                        artSrc = global.dfPrimaryCardArtSrc?.(cardName) || artSrc;
                    }
                }
                if (artSrc && global.dfPrefetchArtUrl && String(artSrc).indexOf("data:") !== 0) {
                    void global.dfPrefetchArtUrl(artSrc, "high").catch(() => {});
                }
            } catch (eWarm) { /* segue com fallback */ }
            hideFieldCard();

            const fieldParent = dest.parentElement;
            const fieldEl = dest.closest(".quadrant-field");
            const targetId = `champ-${pIdx}-${fIdx}`;
            let mo = null;
            let summonRevealed = false;
            if (fieldParent && typeof MutationObserver !== "undefined") {
                mo = new MutationObserver(() => {
                    if (summonRevealed || !fieldHidden) return;
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (!card?._summoning) return;
                    const live = global.document.getElementById(targetId);
                    if (live && !live.classList.contains("is-summoning")) {
                        live.classList.add("is-summoning");
                        live.style.visibility = "hidden";
                        live.style.opacity = "0";
                    }
                });
                mo.observe(fieldParent, { childList: true, subtree: true });
            }

            const revealAndStopMo = () => {
                summonRevealed = true;
                revealSummonedFieldCard(pIdx, fIdx, mo);
            };
            const forceRevealFieldCard = () => {
                try {
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (card?._summoning) delete card._summoning;
                } catch (e) { /* */ }
                const live = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(targetId);
                if (!live) return;
                if (!live.classList.contains("is-summoning") && live.style.visibility !== "hidden") return;
                live.classList.remove("is-summoning", "df-summon-busy", "df-summon-settle");
                live.style.visibility = "";
                live.style.opacity = "";
                live.style.pointerEvents = "";
                live.style.removeProperty("transform");
                window.dfEndFieldSummonBusy?.(live);
            };
            // Safety: nunca deixar carta oculta >2.2s (vs-IA e MP).
            const safetyReveal = setTimeout(() => {
                if (!summonRevealed) {
                    revealAndStopMo();
                    forceRevealFieldCard();
                }
                try {
                    global.document.querySelectorAll(".summon-fly").forEach((el) => el.remove());
                } catch (eSf) { /* */ }
            }, 2200);

            let rect = dest.getBoundingClientRect();
            if (rect.width < 4 || rect.height < 4) {
                await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                const liveDest = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(`champ-${pIdx}-${fIdx}`);
                if (liveDest) rect = liveDest.getBoundingClientRect();
            }
            if (rect.width < 4 || rect.height < 4) {
                const fieldBox = (fieldEl || dest.closest?.(".quadrant-field"))?.getBoundingClientRect?.();
                if (fieldBox && fieldBox.width > 4) {
                    rect = {
                        left: fieldBox.left + fieldBox.width * 0.5 - 40,
                        top: fieldBox.top + fieldBox.height * 0.28,
                        width: 80,
                        height: 112,
                        right: 0,
                        bottom: 0,
                        x: 0,
                        y: 0,
                        toJSON() {},
                    };
                } else {
                    // Sem destino válido — evita clone fantasma no canto (0,0).
                    clearTimeout(safetyReveal);
                    revealAndStopMo();
                    forceRevealFieldCard();
                    return;
                }
            }
            const flySize = summonFlyCardSize(src, rect, dest);
            /* Voo direto ao slot final — o layout flex centrado cuida da ordem a partir do centro. */
            const destCX = rect.left + rect.width / 2;
            const destCY = rect.top + rect.height / 2;
        
            const srcCX = src.cx ?? (src.x + (src.w || rect.width) / 2);
            const srcCY = src.cy ?? (src.y + (src.h || rect.height) / 2);

            /* Pixi+GSAP quando GPU (mesmo contexto mão→arco→slot); DOM = fallback. */
            let usedPixi = false;
            if (global.DfVfxEngine?.wantsGpuPresentation?.()
                && typeof global.DfPixiVfx?.playSummonDropScene === "function") {
                // Esconde o slot ANTES do bake async — senão DOM+Pixi coexistem
                // sob FPS baixo / warmFace lento.
                hideFieldCard();
                try {
                    const pixiP = global.DfPixiVfx.playSummonDropScene({
                        srcCX,
                        srcCY,
                        destCX,
                        destCY,
                        cardW: flySize.w,
                        cardH: flySize.h,
                        cardName,
                        artSrc,
                        currentPower: summonPow,
                        basePower: summonBasePow,
                        power: summonPow,
                        cinematic: true,
                        onFlyReady: () => {
                            hideFieldCard();
                        },
                        // No pouso: revela o slot DOM no mesmo instante em que o Pixi some.
                        onImpact: () => {
                            revealAndStopMo();
                            forceRevealFieldCard();
                        },
                    });
                    // Nunca bloquear o jogo se Pixi/GSAP travar (bug principal vs-IA).
                    const raced = await Promise.race([
                        pixiP.then((ok) => (ok ? "ok" : "fail")),
                        new Promise((r) => setTimeout(() => r("timeout"), 3200)),
                    ]);
                    if (raced === "ok") {
                        usedPixi = true;
                    } else {
                        usedPixi = false;
                        try { global.DfPixiVfx?.forceClearStage?.(); } catch (eClr) { /* */ }
                        try { global.DfGsapBridge?.killAll?.(); } catch (eKill) { /* */ }
                        if (raced === "timeout") {
                            console.warn("[DF summon Pixi] timeout — fallback DOM");
                        }
                    }
                } catch (e) {
                    console.warn("[DF summon Pixi]", e);
                    usedPixi = false;
                    try { global.DfPixiVfx?.forceClearStage?.(); } catch (eClr2) { /* */ }
                }
            }

            if (usedPixi) {
                clearTimeout(safetyReveal);
                if (!summonRevealed) {
                    revealAndStopMo();
                    forceRevealFieldCard();
                }
                return;
            }

            // Pixi falhou após hide — restaura para o fallback DOM voar sem “buraco”.
            if (fieldHidden) {
                try {
                    const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx];
                    if (card?._summoning) delete card._summoning;
                } catch (e) { /* */ }
                fieldHidden = false;
                summonRevealed = false;
                const live = deps.getChampionDom(pIdx, fIdx)
                    || global.document.getElementById(targetId)
                    || dest;
                if (live) {
                    live.classList.remove("is-summoning", "df-summon-busy", "df-summon-settle");
                    live.style.visibility = "";
                    live.style.opacity = "";
                    live.style.pointerEvents = "";
                    window.dfEndFieldSummonBusy?.(live);
                }
            }

            // DOM fallback: esconde o slot assim que o fly começa.
            hideFieldCard();
        
            const fly = document.createElement("div");
            fly.className = "summon-fly summon-fly-fullface";
            try { fly.dataset.ghostBorn = String(Date.now()); } catch (eBorn) { /* */ }

            /* Sempre textura assada (ou arte) em caixa 5:7 — sem clone da mão
               nem object-fit:cover que cortava o retrato. */
            let flyArtImg = null;
            const faceUrl = (cardName && global.DfCardFace?.isComposed?.(cardName))
                ? (artSrc || global.DfCardFace.getFaceDataUrl?.(cardName, summonPow) || "")
                : (artSrc || "");
            if (faceUrl) {
                const img = document.createElement("img");
                img.className = "summon-fly-face-img";
                img.src = faceUrl;
                img.alt = cardName || "";
                img.decoding = "async";
                img.loading = "eager";
                img.draggable = false;
                fly.appendChild(img);
                flyArtImg = img;
            } else if (src?.html) {
                fly.innerHTML = src.html;
                const innerEl = fly.firstElementChild;
                if (innerEl) {
                    innerEl.style.setProperty("width", "100%", "important");
                    innerEl.style.setProperty("height", "100%", "important");
                    innerEl.style.setProperty("min-width", "0", "important");
                    innerEl.style.setProperty("min-height", "0", "important");
                    innerEl.style.setProperty("max-width", "none", "important");
                    innerEl.style.setProperty("max-height", "none", "important");
                    innerEl.style.margin = "0";
                    innerEl.style.transform = "none";
                    innerEl.style.borderRadius = "inherit";
                    innerEl.style.opacity = "1";
                    innerEl.style.overflow = "visible";
                }
                try { window.applyCardArtTree?.(fly); } catch (e) {}
                if (cardName && global.DfCardFace?.isComposed?.(cardName)) {
                    try {
                        const faceHost = fly.querySelector(".hcard, .ccard") || fly;
                        faceHost.classList.add("has-composed-face", "has-art", "art-ready");
                        global.DfCardFace.mount(
                            faceHost,
                            { name: cardName, currentPower: summonPow, power: summonBasePow },
                            { power: summonPow },
                        );
                    } catch (e) { /* */ }
                }
            } else if (cardName && deps.buildFlyCardHtml) {
                const card = deps.getState?.()?.players?.[pIdx]?.field?.[fIdx]
                    || { name: cardName, category: "champion", power: 1, currentPower: 1 };
                fly.innerHTML = deps.buildFlyCardHtml(card);
                try { window.applyCardArtTree?.(fly); } catch (e) {}
                if (global.DfCardFace?.isComposed?.(cardName)) {
                    try {
                        const faceHost = fly.querySelector(".hcard, .ccard") || fly;
                        faceHost.classList.add("has-composed-face", "has-art", "art-ready");
                        global.DfCardFace.mount(
                            faceHost,
                            { name: cardName, currentPower: summonPow, power: summonBasePow },
                            { power: summonPow },
                        );
                    } catch (e) { /* */ }
                }
            } else {
                fly.innerHTML =
                    `<div class="hcard type-champion"><div class="pow">?</div></div>`;
            }
        
            // Pedido do autor: tamanho constante no voo (sem crescer/encolher).
            const startScale = 1;
            const mobileSummon = summonFlyIsMobile();
            const FLY_MS = mobileSummon
                ? 720
                : (window.__DF_ONLINE ? 520 : (deps.FX.mobile ? 480 : 580));
            const lift = Math.max(56, Math.min(140, Math.abs(destCY - srcCY) * 0.38 + 64));
            const apexX = srcCX + (destCX - srcCX) * 0.52;
            const apexY = Math.min(srcCY, destCY) - lift;
            const useViewportFly = summonFlyDomViewport();
            const flyRoot = useViewportFly ? global.document.body : summonFlyRoot();
            const flyPos = useViewportFly ? "fixed" : (summonUsesCanvasFly() ? "absolute" : "fixed");
            const toFlyPt = (vx, vy) => {
                if (useViewportFly) return { x: vx, y: vy };
                if (summonUsesCanvasFly()) {
                    return global.DfLayout?.viewportToCanvas?.(vx, vy) || { x: vx, y: vy };
                }
                return { x: vx, y: vy };
            };
            const destPt = toFlyPt(destCX, destCY);
            const srcPt = toFlyPt(srcCX, srcCY);
            const apexPt = toFlyPt(apexX, apexY);
            const flyLeft = useViewportFly ? destCX : destPt.x;
            const flyTop = useViewportFly ? destCY : destPt.y;
            const startTX = (useViewportFly ? srcCX : srcPt.x) - (useViewportFly ? destCX : destPt.x);
            const startTY = (useViewportFly ? srcCY : srcPt.y) - (useViewportFly ? destCY : destPt.y);
            const apexTX = (useViewportFly ? apexX : apexPt.x) - (useViewportFly ? destCX : destPt.x);
            const apexTY = (useViewportFly ? apexY : apexPt.y) - (useViewportFly ? destCY : destPt.y);
            const t0 =
                `translate(-50%,-50%) translate3d(${startTX}px,${startTY}px,0) scale(1)`;
            const tMid =
                `translate(-50%,-50%) translate3d(${apexTX}px,${apexTY}px,0) scale(1)`;
            const tLand =
                `translate(-50%,-50%) translate3d(0px,0px,0) scale(1)`;
            const tSettle = "translate(-50%,-50%) translate3d(0px,0px,0) scale(1)";
            const sizeCss = `width:${flySize.w}px;height:${flySize.h}px;aspect-ratio:${DF_SUMMON_FLY_ASPECT};`;
        
            fly.style.cssText =
                `position:${flyPos};left:${flyLeft}px;top:${flyTop}px;` +
                sizeCss +
                `box-sizing:border-box;` +
                `z-index:9600;pointer-events:none;` +
                `transform-origin:center center;will-change:transform,opacity;` +
                `transform:${t0};` +
                `opacity:1;border-radius:10px;overflow:visible;` +
                `filter:drop-shadow(0 8px 18px rgba(0,0,0,0.5));`;
            flyRoot.appendChild(fly);
            if (!useViewportFly && summonUsesCanvasFly()) global.DfLayout?.prepareOverlay?.(fly);
            fly.querySelectorAll(".hcard, .ccard").forEach(el => {
                el.classList.add("art-ready");
                el.style.setProperty("width", "100%", "important");
                el.style.setProperty("height", "100%", "important");
                el.style.setProperty("min-width", "0", "important");
                el.style.setProperty("min-height", "0", "important");
                el.style.setProperty("max-width", "none", "important");
                el.style.setProperty("max-height", "none", "important");
                el.style.boxShadow = "none";
                el.style.filter = "none";
                el.style.overflow = "visible";
            });
            fly.querySelectorAll("img.summon-fly-face-img").forEach((img) => {
                img.style.cssText =
                    "display:block;width:100%;height:100%;object-fit:contain;" +
                    "object-position:center;border-radius:inherit;pointer-events:none;";
            });
            fly.querySelectorAll("img.card-art-bg").forEach(img => {
                img.style.opacity = "1";
                img.style.display = "block";
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "contain";
                img.style.imageRendering = "auto";
            });
        
            try {
                await new Promise(r => requestAnimationFrame(r));
                if (flyArtImg) {
                    if (!flyArtImg.complete) {
                        await new Promise((resolve) => {
                            flyArtImg.addEventListener("load", resolve, { once: true });
                            flyArtImg.addEventListener("error", resolve, { once: true });
                            setTimeout(resolve, 120);
                        });
                    }
                    try { await flyArtImg.decode(); } catch (e) { /* */ }
                }
        
                // Mesmo roteiro (mesmos offsets e transforms), easing POR TRECHO.
                // Antes um único cubic-bezier global cobria os 5 keyframes, o que
                // quebrava a velocidade no ápice e na aterrissagem — daí a sensação
                // de rigidez. Com easing por segmento (e "linear" no nível da
                // animação, pra não somar duas curvas) o movimento fica contínuo.
                const flyAnim = fly.animate([
                    { transform: t0, opacity: 1, offset: 0, easing: "linear" },
                    { transform: t0, opacity: 1, offset: 0.06, easing: "cubic-bezier(0.34, 0.00, 0.44, 1.00)" },
                    { transform: tMid, opacity: 1, offset: 0.48, easing: "cubic-bezier(0.46, 0.03, 0.52, 0.96)" },
                    { transform: tLand, opacity: 1, offset: 0.9, easing: "cubic-bezier(0.22, 1.00, 0.36, 1.00)" },
                    { transform: tSettle, opacity: 1, offset: 1 },
                ], {
                    duration: FLY_MS,
                    easing: "linear",
                    fill: "forwards",
                });
                // Sem loop getComputedStyle por frame (custo alto / stutter).
                await Promise.race([
                    flyAnim.finished.catch(() => {}),
                    deps.wait(FLY_MS + 400),
                ]);

                revealAndStopMo();
        
                await fly.animate([{ opacity: 1 }, { opacity: 0 }], {
                    duration: 50, fill: "forwards",
                }).finished.catch(() => {});
            } finally {
                clearTimeout(safetyReveal);
                fly.style.willChange = "auto";
                if (fly.parentNode) fly.remove();
                if (mo) { try { mo.disconnect(); } catch (e) { /* */ } }
                if (!summonRevealed) revealAndStopMo();
                forceRevealFieldCard();
            }
            // Impacto fica em championLandImpact — sem partículas duplicadas no fly.
        }
        
        /** Geometria de choque em viewport — larguras em px de tela (não canvas). */
        function dfCombatMeetGeometry(ax, ay, dx, dy, attW, defW) {
            let ux = dx - ax;
            let uy = dy - ay;
            const dist = Math.hypot(ux, uy);
            if (dist < 1) {
                ux = 1;
                uy = 0;
            } else {
                ux /= dist;
                uy /= dist;
            }
            const clashX = ax + ux * dist * 0.5;
            const clashY = ay + uy * dist * 0.5;
            const attHalfW = Math.max(4, attW * 0.5);
            const defHalfW = Math.max(4, defW * 0.5);
            return {
                ax, ay, dx, dy,
                attEndX: clashX - ux * attHalfW,
                attEndY: clashY - uy * attHalfW,
                defEndX: clashX + ux * defHalfW,
                defEndY: clashY + uy * defHalfW,
                clashX, clashY,
                ux, uy,
                attHalf: attHalfW,
                defHalf: defHalfW,
            };
        }
        
        function combatEaseOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
        
        function combatEaseInOutQuint(t) {
            return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
        }
        
        function combatEaseOutBack(t) {
            const c1 = 1.70158, c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }
        
        function dfCombatTappedBase(el) {
            return "";
        }
        
        function dfRestoreCombatFieldCard(el) {
            if (!el) return;
            el.classList.remove(
                "combat-animating", "attacker-combat", "defender-combat",
                "combat-src-hidden", "is-summoning"
            );
            el.style.zIndex = "";
            el.style.display = "";
            // hideCombatSourcesNow grava com "important" — atribuir "" não é
            // garantia de remoção; sem removeProperty a carta ficava invisível
            // quando a cena Pixi abortava e o fallback DOM assumia.
            ["visibility", "opacity", "pointer-events"].forEach((prop) => {
                el.style.removeProperty(prop);
            });
            ["transition", "will-change", "transform", "animation", "filter",
             "translate", "scale", "rotate", "transform-origin"].forEach((p) => el.style.removeProperty(p));
            el.style.setProperty("transform", "none", "important");
            el.style.setProperty("scale", "1", "important");
            el.style.setProperty("translate", "none", "important");
            el.style.setProperty("rotate", "none", "important");
            el.querySelectorAll("img.card-art-bg").forEach((img) => {
                img.style.removeProperty("transform");
            });
            el.querySelectorAll(".df-card-face__power, .pow").forEach((pow) => {
                pow.style.removeProperty("transform");
            });
            if (el.classList.contains("tapped")) {
                el.style.setProperty("transform", "none", "important");
                el.style.removeProperty("filter");
            }
            el.style.removeProperty("--card-art");
            delete el.dataset.dfFieldLocked;
            delete el.dataset.dfFieldLockSig;
            delete el.dataset.dfPlayerFieldSealed;
            /* Sempre reaplicar slot 5:7 — tapped no #quadrant-0 antes pulava o reseal. */
            window.dfApplyPlayerFieldGridSlot?.(el);
            window.dfLockFieldCardTransform?.(el, { force: true });
            window.dfSealPlayerFieldCard?.(el);
            window.dfStabilizeFieldCards?.(el, { force: true });
        }
        
        function animateCombatFieldCard(el, originCx, originCy, x0, y0, x1, y1, duration, easeFn, opts = {}) {
            if (!el) return Promise.resolve();
            const arc = opts.arc ?? Math.min(48, Math.hypot(x1 - x0, y1 - y0) * 0.16);
            const scalePeak = opts.scalePeak ?? 1.07;
            const lean = opts.lean ?? 0;
            try { global.DfTargetLevitate?.stopOne?.(el); } catch (e) { /* */ }
            el.classList.add("combat-animating");
            delete el.dataset.dfFieldLocked;
            // Limpa a trava do campo. NÃO setar translate/scale/rotate individuais
            // com !important — isso anula transform: translate(...) e o ataque
            // fica visualmente parado até o timeout de 14s.
            ["transform", "translate", "scale", "rotate", "will-change", "transform-origin", "transition"].forEach((p) => {
                el.style.removeProperty(p);
            });
            const t0 = performance.now();
            const dur = Math.max(16, Number(duration) || 300);
            const hardResetMotion = () => {
                el.style.setProperty("transform", "none", "important");
                el.style.setProperty("scale", "1", "important");
                el.style.setProperty("translate", "none", "important");
                el.style.setProperty("rotate", "none", "important");
                el.querySelectorAll?.(".df-card-face__power").forEach((pow) => {
                    pow.style.transform = "";
                });
            };
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    /* Timeout precoce NÃO pode deixar translate/scale órfãos
                       (campeão atacante ficava minúsculo no campo). */
                    hardResetMotion();
                    resolve();
                };
                function tick(now) {
                    if (done) return;
                    const raw = Math.min(1, (now - t0) / dur);
                    const e = typeof easeFn === "function" ? easeFn(raw) : raw;
                    const cx = x0 + (x1 - x0) * e;
                    const cy = y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * arc;
                    const tx = cx - originCx;
                    const ty = cy - originCy;
                    const sc = 1 + (scalePeak - 1) * Math.sin(Math.PI * e);
                    const rot = lean * Math.sin(Math.PI * e);
                    el.style.setProperty(
                        "transform",
                        `translate(${tx}px, ${ty}px) scale(${sc}) rotate(${rot}deg)`,
                        "important",
                    );
                    el.querySelectorAll?.(".df-card-face__power").forEach((pow) => {
                        pow.style.transform = "";
                    });
                    if (raw < 1) requestAnimationFrame(tick);
                    else {
                        hardResetMotion();
                        finish();
                    }
                }
                requestAnimationFrame(tick);
                setTimeout(finish, Math.max(280, dur + 140));
            });
        }
        
        function animateCombatFly(el, x0, y0, x1, y1, duration, easeFn, opts = {}) {
            const dist = Math.hypot(x1 - x0, y1 - y0);
            const arcMax = deps.FX.mobile ? 28 : 90;
            const arc = opts.arc ?? Math.min(arcMax, dist * (deps.FX.mobile ? 0.12 : 0.22));
            const scalePeak = opts.scalePeak ?? (deps.FX.mobile ? 1.08 : 1.22);
            const t0 = performance.now();
            el.style.willChange = "transform";
            const toFly = (x, y) => {
                const layout = global.DfLayout;
                if (layout?.isCanvasFieldLayout?.()) return layout.viewportToCanvas(x, y);
                return { x, y };
            };
            const flyFinish = (el, x1, y1, sc) => {
                const p = toFly(x1, y1);
                el.style.transform =
                    `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${sc ?? 1})`;
                const powEl = el.querySelector?.(".df-card-face__power, .pow");
                if (powEl) powEl.style.transform = "";
            };
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    flyFinish(el, x1, y1, 1);
                    el.style.willChange = "auto";
                    resolve();
                };
                function tick(now) {
                    if (done) return;
                    const raw = Math.min(1, (now - t0) / duration);
                    const e = easeFn(raw);
                    const x = x0 + (x1 - x0) * e;
                    const y = y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * arc;
                    const sc = 1 + (scalePeak - 1) * Math.sin(Math.PI * e);
                    const p = toFly(x, y);
                    el.style.transform =
                        `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${sc})`;
                    // Poder composto: nunca counter-scale (deforma o gem).
                    const facePow = el.querySelector?.(".df-card-face__power");
                    if (facePow) {
                        facePow.style.transform = "";
                    } else {
                        const legacy = el.querySelector?.(".pow, .summon-fly-pow-overlay");
                        if (legacy) {
                            const inv = sc ? (1 / sc) : 1;
                            legacy.style.transform = `scale(${inv})`;
                            legacy.style.transformOrigin = "center center";
                        }
                    }
                    if (raw < 1) requestAnimationFrame(tick);
                    else finish();
                }
                requestAnimationFrame(tick);
                setTimeout(finish, Math.max(280, duration + 140));
            });
        }
        
        function spawnCombatSpeedLines(x0, y0, x1, y1, color) {
            if (deps.FX.liteVfx) return;
            const ang = Math.atan2(y1 - y0, x1 - x0);
            const len = Math.hypot(x1 - x0, y1 - y0);
            for (let i = 0; i < 5; i++) {
                const line = document.createElement("div");
                line.className = "combat-speed-line";
                const t = 0.15 + i * 0.14;
                const lx = x0 + (x1 - x0) * t;
                const ly = y0 + (y1 - y0) * t;
                line.style.left = lx + "px";
                line.style.top = ly + "px";
                line.style.width = (len * 0.22) + "px";
                line.style.transform = `rotate(${ang * 180 / Math.PI}deg)`;
                if (color) line.style.background = color;
                line.style.animationDelay = (i * 28) + "ms";
                document.body.appendChild(line);
                setTimeout(() => line.remove(), 380);
            }
        }
        
        function spawnCombatImpactLite(mx, my, outcome) {
            const flash = document.createElement("div");
            flash.className = "combat-flash" + (deps.FX.mobile ? " combat-flash-mobile" : "");
            flash.style.left = (mx - (deps.FX.mobile ? 90 : 130)) + "px";
            flash.style.top = (my - (deps.FX.mobile ? 90 : 130)) + "px";
            document.body.appendChild(flash);
            let clashLabel = "⚔️ CLASH!";
            let clashClass = "combat-clash-text";
            if (outcome.over) { clashLabel = ""; clashClass += " over"; }
            else if (outcome.killA && outcome.killD) { clashLabel = "⚡ EMPATE!"; clashClass += " stale"; }
            if (deps.FX.mobile) clashClass += " combat-clash-mobile";
            let clashTxt = null;
            if (clashLabel) {
                clashTxt = document.createElement("div");
                clashTxt.className = clashClass;
                clashTxt.textContent = clashLabel;
                clashTxt.style.left = mx + "px";
                clashTxt.style.top = (my - (deps.FX.mobile ? 52 : 40)) + "px";
                document.body.appendChild(clashTxt);
            }
            if (deps.FX.mobile) {
                const ring = document.createElement("div");
                ring.className = "combat-mobile-ring";
                ring.style.left = mx + "px";
                ring.style.top = my + "px";
                document.body.appendChild(ring);
                setTimeout(() => ring.remove(), 420);
            }
            try { window.sfx && window.sfx("combat_clash"); } catch (e) {}
            return { flash, slash1: null, slash2: null, clashTxt, hitstop: null };
        }
        
        function spawnCombatImpact(mx, my, outcome, lite = false) {
            if (lite) return spawnCombatImpactLite(mx, my, outcome);

            const pixi = global.DfPixiVfx;
            const pixiFull = pixi?.canUse?.();
            if (pixiFull) {
                void pixi.playCombatClash(mx, my, outcome);
            }

            const isHeavy = outcome.over || (outcome.killA && outcome.killD);
            const qHit = document.elementFromPoint(mx, my)?.closest?.(".player-quadrant, .quadrant-field");
            if (qHit && !deps.FX.liteVfx) {
                qHit.classList.remove("ground-tremor");
                void qHit.offsetWidth;
                qHit.classList.add("ground-tremor");
                setTimeout(() => qHit.classList.remove("ground-tremor"), isHeavy ? 420 : 360);
            }

            let slash1 = null, slash2 = null;
            if (!pixiFull) {
                const shockwaveCount = deps.FX.n(2);
                for (let i = 0; i < shockwaveCount; i++) {
                    DfAnim.spawnTimed("combat-clash-shockwave", (sw) => {
                        sw.style.left = mx + "px";
                        sw.style.top = my + "px";
                    }, 780, () => {
                        const d = document.createElement("div");
                        d.className = "combat-clash-shockwave";
                        return d;
                    });
                }
                DfAnim.spawnTimed("combat-impact-ring", (ring) => {
                    ring.style.left = mx + "px";
                    ring.style.top = my + "px";
                }, 580, () => {
                    const d = document.createElement("div");
                    d.className = "combat-impact-ring";
                    return d;
                });
            }

            if (!deps.FX.liteVfx && !pixiFull) {
                slash1 = document.createElement("div");
                slash1.className = "combat-cross-slash s1";
                slash1.style.left = mx + "px";
                slash1.style.top = my + "px";
                document.body.appendChild(slash1);
                slash2 = document.createElement("div");
                slash2.className = "combat-cross-slash s2";
                slash2.style.left = mx + "px";
                slash2.style.top = my + "px";
                document.body.appendChild(slash2);
            }

            const flash = document.createElement("div");
            flash.className = "combat-flash" + (pixiFull ? " combat-flash-pixi" : "");
            flash.style.left = (mx - (pixiFull ? 90 : 130)) + "px";
            flash.style.top = (my - (pixiFull ? 90 : 130)) + "px";
            if (pixiFull) flash.style.opacity = "0.55";
            document.body.appendChild(flash);

            let clashLabel = "⚔️ CLASH!";
            let clashClass = "combat-clash-text";
            if (outcome.over) { clashLabel = ""; clashClass += " over"; }
            else if (outcome.killA && outcome.killD) { clashLabel = "⚡ EMPATE!"; clashClass += " stale"; }

            let clashTxt = null;
            if (clashLabel) {
                clashTxt = document.createElement("div");
                clashTxt.className = clashClass;
                clashTxt.textContent = clashLabel;
                clashTxt.style.left = mx + "px";
                clashTxt.style.top = (my - 40) + "px";
                document.body.appendChild(clashTxt);
            }

            if (!pixiFull) {
                DfAnim.spawnBurst(deps.FX.n(10), "combat-spark", (spark, i, n) => {
                    spark.style.left = mx + "px";
                    spark.style.top = my + "px";
                    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
                    const dist = 60 + Math.random() * 120;
                    spark.style.setProperty("--px", (Math.cos(ang) * dist) + "px");
                    spark.style.setProperty("--py", (Math.sin(ang) * dist - 15) + "px");
                    spark.style.animationDelay = (Math.random() * 40) + "ms";
                }, 620, () => {
                    const d = document.createElement("div");
                    d.className = "combat-spark";
                    return d;
                });
            }

            try { window.sfx && window.sfx("combat_clash"); } catch (e) {}

            return { flash, slash1, slash2, clashTxt, hitstop: null };
        }
        
        function dfCombatPurgeFlyGhosts() {
            document.querySelectorAll(
                ".battle-fly, .combat-discard-fly, .combat-snap-ghost, " +
                ".combat-def-ghost, .combat-att-ghost, .combat-speed-line, " +
                ".combat-flash, .combat-clash-text, .combat-cross-slash, " +
                ".combat-impact-ring, .combat-clash-shockwave, .combat-hitstop-flash, " +
                ".combat-spark, .combat-mobile-dim, .df-scare-fly-wrap, " +
                ".summon-fly, .drag-ghost-hand"
            ).forEach((n) => n.remove());
        }

        function dfCombatPurgeGhosts() {
            dfCombatPurgeFlyGhosts();
            document.querySelectorAll(".death-ghost, .death-halo, .death-shard").forEach((n) => n.remove());
        }

        /** Remove só clones/impacto — não restaura cartas do campo (evita duplicata mobile). */
        function dfCombatVisualCleanup() {
            dfCombatMobileDim(false);
            dfCombatPurgeFlyGhosts();
        }

        /** Restaura tabuleiro se cinemática de combate travar ou abortar. */
        function dfCombatForceCleanup(opts = {}) {
            const { attOwner, attIdx, defOwner, defIdx, restoreSources = true, killA, killD } = opts;
            try { global.DfGsapBridge?.killAll?.(); } catch (e) { /* */ }
            try { global.DfPixiVfx?.clearStage?.(); } catch (e) { /* */ }
            dfCombatMobileDim(false);
            dfCombatPurgeFlyGhosts();
            if (restoreSources) {
            document.querySelectorAll(".ccard.combat-src-hidden, .ccard.is-summoning").forEach((el) => {
                dfRestoreCombatFieldCard(el);
            });
            try {
                deps.getState?.()?.players?.forEach((pl) => {
                    pl?.field?.forEach((c) => {
                        if (c?._summoning) delete c._summoning;
                    });
                });
            } catch (e) { /* */ }
            if (attOwner != null && attIdx != null && !killA) {
                const el = deps.getChampionDom?.(attOwner, attIdx);
                if (el) dfRestoreCombatFieldCard(el);
            }
            if (defOwner != null && defIdx != null && !killD) {
                const el = deps.getChampionDom?.(defOwner, defIdx);
                if (el) dfRestoreCombatFieldCard(el);
            }
            }
            window.__dfCombatActive = null;
            window.__dfCombatPending = null;
            window.__dfCombatSourcesHidden = false;
            document.documentElement.removeAttribute("data-df-combat-pending");
            document.body.classList.remove("df-combat-active", "dragging-card");
            try { window.DfPixiVfx?.abortCombatScene?.(); } catch (e) { /* */ }
            try { window.DfPresentationBus?.forceReset?.(); } catch (e) { /* */ }
            try { window.__dfRefreshDesktopHeroPanels?.(); } catch (e) { /* */ }
            try { window.DfHeroHubVfx?.sync?.(); } catch (e) { /* */ }
            window.dfStabilizeFieldCards?.();
        }
        
        function dfCombatMobileDim(show) {
            /* Autor: sem escurecer a tela durante combate. */
            const existing = document.querySelector(".combat-mobile-dim");
            if (existing) existing.remove();
            document.documentElement.classList.remove("df-combat-mobile");
        }
        
        function dfCombatSnapFromEl(el, fallback) {
            let snap = null;
            const m = el?.id?.match(/^champ-(\d+)-(\d+)$/);
            if (fallback?.outerHTML) snap = fallback;
            else if (m) snap = dfCaptureFieldCardSnap(+m[1], +m[2]);
            else if (fallback) snap = fallback;
            if (snap && (snap.pIdx != null && snap.fIdx != null)) {
                const card = deps.getState().players[snap.pIdx]?.field?.[snap.fIdx];
                if (card) {
                    snap.currentPower = card.currentPower ?? card.power ?? 0;
                    snap.basePower = card.basePower ?? card.power ?? snap.currentPower;
                }
            }
            return snap;
        }

        /**
         * Combate GPU (Pixi+GSAP) — sem clones DOM .battle-fly.
         * @returns {Promise<boolean>}
         */
        async function runCombatPixiScene(opts) {
            const {
                attSnap, defSnap, geo, outcome,
                discardAtt, discardDef, onImpact, onHideSources,
            } = opts || {};
            if (!attSnap || !geo) return false;
            if (!global.DfVfxEngine?.wantsGpuPresentation?.()) return false;
            const pixi = global.DfPixiVfx;
            if (!pixi?.playCombatScene) return false;
            const fx = deps.FX;
            // Hang curto: se Pixi não termina, ABORTA a cena (senão
            // restore DOM + Pixi ainda voando = duplicata).
            const hangMs = (fx?.mobile || fx?.lowEnd) ? 4500 : 6000;
            try {
                let hangFired = false;
                let hangTimer = null;
                const sceneP = pixi.playCombatScene({
                    attSnap, defSnap, geo, outcome,
                    discardAtt, discardDef, onImpact, onHideSources,
                    fx,
                });
                const ok = await Promise.race([
                    Promise.resolve(sceneP).then((v) => {
                        if (hangTimer) clearTimeout(hangTimer);
                        return v;
                    }).catch((e) => {
                        if (hangTimer) clearTimeout(hangTimer);
                        console.warn("[DfCombatPresenter] Pixi combat", e);
                        return false;
                    }),
                    new Promise((resolve) => {
                        hangTimer = setTimeout(() => {
                            hangFired = true;
                            console.warn("[DfCombatPresenter] Pixi combat hang — abort + fallback DOM");
                            try { pixi.abortCombatScene?.(); } catch (e2) { /* */ }
                            resolve(false);
                        }, hangMs);
                    }),
                ]);
                if (hangTimer) clearTimeout(hangTimer);
                if (hangFired || !ok) {
                    try { pixi.abortCombatScene?.(); } catch (eAb) { /* */ }
                    // Espera o finally do Pixi limpar o stage — senão DOM+sprite = duplicata.
                    const t0 = Date.now();
                    while (pixi.isCombatSceneActive?.() && Date.now() - t0 < 400) {
                        await new Promise((r) => setTimeout(r, 40));
                    }
                    try { pixi.forceClearStage?.({ force: false }); } catch (eFc) { /* */ }
                }
                return !!ok && !hangFired;
            } catch (e) {
                console.warn("[DfCombatPresenter] Pixi combat", e);
                return false;
            }
        }

        return {
            triggerChampionShatter, summonAnimation, animateCombatFly, animateCombatFieldCard,
            spawnCombatImpact, spawnCombatImpactLite, dfCombatMeetGeometry, dfCombatPurgeGhosts,
            dfCombatPurgeFlyGhosts, dfCombatVisualCleanup,
            dfCombatForceCleanup, dfRestoreCombatFieldCard, dfCombatMobileDim, dfCombatSnapFromEl, runCombatPixiScene,
        };
    }

    global.DfCombatPresenter = { create };
})(typeof window !== "undefined" ? window : globalThis);
