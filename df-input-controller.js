/**
 * Dragonfall — Input controller (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        if (typeof deps.$ !== "function") deps.$ = (id) => document.getElementById(id);
        const getChampionDom = (...a) => deps.getChampionDom(...a);
        const getCardTypeClass = (card) => deps.getCardTypeClass(card);
        const gemOverlayHtml = (...a) => deps.gemOverlayHtml(...a);
        const statusOverlayHtml = (...a) => deps.statusOverlayHtml(...a);
        let previewZoomed = false;
        let _previewOriginalParent = null;
        let _backdropOriginalParent = null;
        let _previewOpenedAt = 0;

        function previewOverlayRoot() {
            /* Zoom sempre no body (fixed @ 99999) — acima do canvas #df-scale-root
               e acima do HUD de pedra (@ 98400), sem ficar preso ao stacking do fit. */
            return document.body;
        }

        function syncPreviewWindowState() {
            window.__dfPreviewZoomed = previewZoomed;
            window.__dfPreviewOpenedAt = _previewOpenedAt;
        }

        function openPreviewZoom() {
            const inner = deps.$("preview-card-inner");
            const backdrop = deps.$("preview-backdrop");
            if (!inner || !backdrop) return;
            const wasClosed = !previewZoomed;
            if (wasClosed) {
                // IMPORTANTE: nunca salvar document.body como "parent original".
                const container = deps.$("card-preview-container");
                const candidateParent = inner.parentNode;
                _previewOriginalParent = (candidateParent && candidateParent !== document.body)
                    ? candidateParent
                    : container;
                const candidateBackdropParent = backdrop.parentNode;
                _backdropOriginalParent = (candidateBackdropParent && candidateBackdropParent !== document.body)
                    ? candidateBackdropParent
                    : container;
            }
            if (!inner.classList.contains("preview-zoomed")) {
                inner.classList.add("preview-zoomed");
            }
            inner.style.rotate = "0deg";
            previewZoomed = true;
            _previewOpenedAt = Date.now();
            // SEMPRE força backdrop + card pro body E re-aplica .active +
            // marca body.preview-open. Isso roda EM TODA chamada de
            // openPreviewZoom (não só na primeira), garantindo que mesmo
            // quando openCardZoom é invocado com o preview já aberto
            // (ex: clicar numa segunda carta), o backdrop volta a cobrir
            // o jogo. Sem isso, abrir um segundo zoom enquanto o primeiro
            // ainda estava ativo deixava o card grande visível MAS sem o
            // fundo escuro — o tabuleiro vazava atrás.
            const zoomRoot = previewOverlayRoot();
            if (backdrop.parentNode !== zoomRoot) zoomRoot.appendChild(backdrop);
            if (inner.parentNode !== zoomRoot) zoomRoot.appendChild(inner);
            const mobileFit = !!window.DfLayout?.isMobileDesktopFit?.();
            if (mobileFit) {
                /* Sem dim escuro (mão/ações ficam legíveis), mas o backdrop
                   precisa receber clique pra fechar o zoom — senão só fecha
                   clicando na carta ampliada. */
                backdrop.classList.add("active");
                backdrop.classList.add("preview-backdrop-clear");
                backdrop.style.display = "block";
                backdrop.style.pointerEvents = "auto";
                backdrop.style.background = "transparent";
                backdrop.style.backdropFilter = "none";
                backdrop.style.webkitBackdropFilter = "none";
                backdrop.style.opacity = "1";
            } else {
                backdrop.classList.remove("preview-backdrop-clear");
                backdrop.classList.add("active");
                backdrop.style.display = "block";
                backdrop.style.pointerEvents = "auto";
                backdrop.style.removeProperty("background");
                backdrop.style.removeProperty("backdrop-filter");
                backdrop.style.removeProperty("-webkit-backdrop-filter");
                backdrop.style.removeProperty("opacity");
            }
            inner.style.pointerEvents = "auto";
            document.body.classList.add("preview-open");
            syncPreviewWindowState();
            try { window.__dfSyncActionsPedestalLite?.(); } catch (e) { /* */ }
            try { window.__dfSyncTurnClock?.(); } catch (e) { /* */ }
        }
        
        function resetPreviewHost() {
            closePreviewZoom();
            const inner = deps.$("preview-card-inner");
            if (inner) {
                inner.className = "preview-card";
                inner.innerHTML = "";
                inner.style.opacity = "";
                inner.style.visibility = "";
                inner.classList.remove("preview-art-loading", "has-art", "art-ready", "art-loading");
                inner.style.removeProperty("--card-art");
            }
        }
        
        function closePreviewZoom() {
            const inner = deps.$("preview-card-inner");
            const backdrop = deps.$("preview-backdrop");
            if (!inner || !backdrop) return;
            inner.classList.remove("preview-zoomed");
            // Limpa visibility setado pelo decode-gate do openCardZoom
            // pra próximo zoom não nascer invisível por acidente.
            inner.style.visibility = "";
            inner.style.opacity = "";
            inner.classList.remove("preview-art-loading");
            ["transform", "rotate", "scale", "translate", "animation", "transition", "will-change"]
                .forEach((p) => inner.style.removeProperty(p));
            backdrop.classList.remove("active");
            backdrop.classList.remove("preview-backdrop-clear");
            backdrop.style.display = "";
            backdrop.style.removeProperty("background");
            backdrop.style.removeProperty("backdrop-filter");
            backdrop.style.removeProperty("-webkit-backdrop-filter");
            backdrop.style.removeProperty("opacity");
            backdrop.style.removeProperty("pointer-events");
            document.body.classList.remove("preview-open");
            syncPreviewWindowState();
            try { window.__dfSyncActionsPedestal?.(); } catch (e) { /* */ }
            try { window.__dfSyncTurnClock?.(); } catch (e) { /* */ }
            // NÃO devolvemos mais pro container — desde bootPreviewToBody,
            // inner e backdrop ficam permanentemente em <body>. O CSS
            // `body > #preview-card-inner:not(.preview-zoomed) {display:none}`
            // esconde o inner quando o zoom fecha. Isso elimina toda a
            // classe de bugs em que um ancestral com `transform`/`filter`
            // capturava o `position:fixed` do .preview-zoomed e jogava o
            // card pra um canto da tela (ex: visto na imagem onde
            // "Elementista" ampliada aparecia no quadrante do jogador
            // em vez de centralizada).
            previewZoomed = false;
            requestAnimationFrame(() => {
                window.dfStabilizeFieldCards?.();
                requestAnimationFrame(() => window.dfStabilizeFieldCards?.());
            });
        }
        
        function bootPreviewToBody() {
            const inner = deps.$("preview-card-inner");
            const backdrop = deps.$("preview-backdrop");
            const zoomRoot = previewOverlayRoot();
            if (inner && inner.parentNode !== zoomRoot) zoomRoot.appendChild(inner);
            if (backdrop && backdrop.parentNode !== zoomRoot) zoomRoot.appendChild(backdrop);
        }
        
        function togglePreviewZoom() {
            if (previewZoomed) closePreviewZoom(); else openPreviewZoom();
        }
        
        function dfIsDesktopSummonUI() {
            return window.matchMedia("(min-width: 901px)").matches &&
                !document.documentElement.classList.contains("df-mobile");
        }
        
        function dropZoneAt(x, y) {
            const localSeat = window.__dfHud?.localSeat?.() ?? 0;
            const qIdx = window.__dfHud?.quadrantForPlayer?.(localSeat) ?? localSeat;
            const q = document.getElementById(`quadrant-${qIdx}`);
            if (!q) return null;
            const field = q.querySelector(".quadrant-field");
            const hand = q.querySelector(".quadrant-hand");
            const hit = (el) => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            };
            const hitOwnFieldCard = () => {
                if (!field) return false;
                for (const c of field.querySelectorAll(".ccard")) {
                    const r = c.getBoundingClientRect();
                    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
                }
                return false;
            };
            const grid = document.getElementById("game-grid");
            const gridFieldBand = () => {
                if (!grid) return false;
                const gr = grid.getBoundingClientRect();
                const bandTop = gr.top + gr.height * (dfIsDesktopSummonUI() ? 0.50 : 0.25);
                return x >= gr.left && x <= gr.right && y >= bandTop && y <= gr.bottom;
            };
            const handDragging = (document.body.classList.contains("dragging-card")
                    && !!window.__dfHandDrag?.active)
                || !!window.__dfHandDrag?.pending;
            if (handDragging) {
                // Mão primeiro: devolver a carta à mão cancela a invocação.
                if (hit(hand)) return "hand";
                const el = document.elementFromPoint(x, y);
                if (el?.closest?.(".quadrant-hand, .hand-wrap")) return "hand";
                if (hitOwnFieldCard()) return "field";
                if (el?.closest?.(`#quadrant-${qIdx} .quadrant-field`)) return "field";
                if (hit(field)) return "field";
                if (gridFieldBand()) return "field";
                return null;
            }
            if (hit(hand)) return "hand";
            // Desktop: metade inferior do tabuleiro aceita invocação
            // (não só a faixa .quadrant-field). A mão cancela o gesto.
            if (dfIsDesktopSummonUI()) {
                if (gridFieldBand()) return "field";
                if (hit(q)) return "field";
                return null;
            }
            // Mobile/tablet: faixa ampla do tabuleiro + .quadrant-field
            if (gridFieldBand()) return "field";
            if (hit(field)) return "field";
            return null;
        }
        
        function dfHandDragScale(snap) {
            const coarse = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
            if (snap) return coarse ? 1.12 : 1.25;
            return coarse ? 1.08 : 1.15;
        }

        function dfIsOnlinePvpDrag() {
            return !!(window.__DF_ONLINE || document.body.classList.contains("df-pvp-mode"));
        }
        
        function dfMeasureHandCardEl(cardEl) {
            if (!cardEl) return { w: 60, h: 84 };
            const r = cardEl.getBoundingClientRect();
            let w = Math.max(28, Math.round(cardEl.offsetWidth || r.width || 60));
            let h = Math.max(40, Math.round(cardEl.offsetHeight || r.height || 84));
            // MP: fantasma vai para body+fixed (px de viewport). offsetWidth é
            // px do canvas; com #df-scale-root o clone ficava esticado/errado.
            if (dfIsOnlinePvpDrag()) {
                let scale = 1;
                try { scale = window.DfLayout?.desktopFitScale?.() || 1; } catch (eS) { /* */ }
                if (!(scale > 0.2 && scale < 8)) scale = 1;
                w = Math.max(28, Math.round(w * scale));
                h = Math.max(40, Math.round(h * scale));
            }
            return { w, h };
        }
        
        function dfResizeHandDragGhost(ghost, cardW, cardH, snap) {
            if (!ghost) return;
            const sc = dfHandDragScale(snap);
            ghost.style.width = `${Math.round(cardW * sc)}px`;
            ghost.style.height = `${Math.round(cardH * sc)}px`;
        }
        
        function dfResolveHandCardForGhost(handWrap, srcCard) {
            let card = null;
            let idx = NaN;
            try {
                idx = parseInt(handWrap?.dataset?.idx ?? handWrap?.dataset?.handIdx ?? "", 10);
            } catch (eIdx) { /* */ }
            try {
                const seat = window.__DF_ONLINE ? (window.__DF_SEAT | 0) : 0;
                card = window.__DF_ENGINE?.getRawState?.()?.players?.[seat]?.hand?.[idx]
                    || deps?.getState?.()?.players?.[seat]?.hand?.[idx]
                    || null;
            } catch (eCard) { /* */ }
            const nmSrc = srcCard?.querySelector?.(".nm");
            const faceName = srcCard?.querySelector?.(".df-card-face")?.getAttribute("data-card-name")
                || srcCard?.querySelector?.(".df-card-face__name")?.textContent
                || "";
            const name = (card?.name || nmSrc?.textContent || faceName || "").trim();
            let pow = NaN;
            if (card) pow = +(card.currentPower ?? card.power);
            if (!Number.isFinite(pow)) {
                try {
                    const dataPow = srcCard?.dataset?.pow ?? handWrap?.dataset?.pow;
                    if (dataPow != null) pow = parseInt(dataPow, 10);
                } catch (ePow) { /* */ }
            }
            return { card, name, pow, idx };
        }

        /** MP: captura face já visível na mão — evita fantasma transparente. */
        function dfRasterizeLiveHandFace(srcCard, cardName, pow) {
            try {
                const liveCanvas = srcCard?.querySelector?.(".df-card-face canvas, canvas.df-card-face__canvas");
                if (liveCanvas && liveCanvas.width > 2 && liveCanvas.height > 2) {
                    return liveCanvas.toDataURL("image/png");
                }
            } catch (eC) { /* */ }
            try {
                const art = srcCard?.querySelector?.(".df-card-face__art");
                const frame = srcCard?.querySelector?.(".df-card-face__frame");
                if (art?.complete && art.naturalWidth > 0) {
                    const w = 372;
                    const h = 520;
                    const c = document.createElement("canvas");
                    c.width = w;
                    c.height = h;
                    const ctx = c.getContext("2d");
                    if (ctx) {
                        ctx.fillStyle = "#122033";
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(art, 0, 0, w, h);
                        if (frame?.complete && frame.naturalWidth > 0) {
                            ctx.drawImage(frame, 0, 0, w, h);
                        }
                        const powEl = srcCard.querySelector(".df-card-face__power");
                        if (powEl && Number.isFinite(+pow)) {
                            /* poder já está na arte assada quando há bake; aqui
                               só o retrato+moldura — suficiente vs transparente. */
                        }
                        return c.toDataURL("image/png");
                    }
                }
            } catch (eArt) { /* */ }
            try {
                if (cardName && typeof window.DfCardFace?.getFaceDataUrl === "function") {
                    const url = window.DfCardFace.getFaceDataUrl(
                        cardName,
                        Number.isFinite(+pow) ? +pow : undefined,
                    );
                    if (url) return url;
                }
            } catch (eUrl) { /* */ }
            return "";
        }

        function dfCreateHandDragGhost(handWrap, clientX, clientY, snap) {
            const srcCard = handWrap?.querySelector(".hcard") || handWrap?.querySelector(".ccard");
            if (!srcCard) return null;
            let { w: cardW, h: cardH } = dfMeasureHandCardEl(srcCard);
            /* Forçar 5:7 — offsetWidth ok, mas nunca confiar em AABB curto. */
            const aspect = 5 / 7;
            if (cardW / cardH > aspect * 1.08) cardH = Math.round(cardW / aspect);
            else if (cardW / cardH < aspect * 0.92) cardW = Math.round(cardH * aspect);
            const g = document.createElement("div");
            g.className = "drag-ghost drag-ghost-hand";
            g.dataset.activeDrag = "1";
            g.dataset.ghostBorn = String(Date.now());
            /* SEMPRE body+fixed: #df-scale-root tem overflow:hidden e corta
               o fantasma na borda inferior da mão (carta “fatiada”). */
            g.style.cssText =
                `position:fixed;left:${clientX}px;top:${clientY}px;` +
                `z-index:99990;pointer-events:none;overflow:visible;` +
                `transform:translate(-50%,-50%);box-sizing:border-box;`;
            dfResizeHandDragGhost(g, cardW, cardH, snap);
            const pvpDrag = dfIsOnlinePvpDrag();
            const resolved = dfResolveHandCardForGhost(handWrap, srcCard);
            const cardNameEarly = resolved.name;
            let powVal = resolved.pow;
            // MP: NUNCA usar has-composed-face no fantasma (CSS esconde arte /
            // deixa loading transparente). Preferir bake completo (textos),
            // clone da face ao vivo, e só então retrato — nunca arte sem placa.
            if (pvpDrag && cardNameEarly && window.DfCardFace?.isComposed?.(cardNameEarly)) {
                const host = document.createElement("div");
                host.className = "hcard has-art art-ready df-pvp-hand-ghost-face";
                host.style.cssText =
                    `position:absolute;left:50%;top:50%;width:${cardW}px;height:${cardH}px;` +
                    `transform:translate(-50%,-50%);margin:0;flex:none;box-sizing:border-box;` +
                    `overflow:hidden;aspect-ratio:5/7;contain:none;container-type:size;` +
                    `opacity:1;visibility:visible;background:#1a2838;`;
                const safePow = Number.isFinite(powVal) ? powVal : undefined;
                let painted = false;
                // 1) Bitmap assado completo (nome/poder/habilidade).
                try {
                    const baked = typeof window.DfCardFace.getFaceDataUrl === "function"
                        ? window.DfCardFace.getFaceDataUrl(cardNameEarly, safePow)
                        : null;
                    if (baked) {
                        const img = document.createElement("img");
                        img.className = "df-ghost-face-img";
                        img.alt = "";
                        img.src = baked;
                        img.draggable = false;
                        img.style.cssText =
                            "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;" +
                            "pointer-events:none;opacity:1;visibility:visible;display:block;";
                        host.appendChild(img);
                        painted = true;
                    }
                } catch (eBake) { /* */ }
                // 2) Clone da face já montada na mão (textos intactos).
                if (!painted) {
                    const liveFace = srcCard.querySelector(":scope > .df-card-face");
                    if (liveFace) {
                        const faceClone = liveFace.cloneNode(true);
                        faceClone.classList.remove("df-card-face--loading");
                        faceClone.style.cssText =
                            "position:absolute;inset:0;width:100%;height:100%;opacity:1;" +
                            "visibility:visible;display:block;contain:none;pointer-events:none;";
                        faceClone.querySelectorAll("img").forEach((im) => {
                            im.style.opacity = "1";
                            im.style.visibility = "visible";
                            im.style.display = "block";
                        });
                        host.appendChild(faceClone);
                        painted = true;
                    }
                }
                // 3) Último recurso: attach art (melhor que fantasma vazio).
                if (!painted) {
                    try {
                        window.dfAttachCardArt?.(host, cardNameEarly);
                        painted = true;
                    } catch (eArt) { /* */ }
                }
                g.style.setProperty("opacity", "1", "important");
                g.style.setProperty("visibility", "visible", "important");
                g.appendChild(host);
                document.body.appendChild(g);
                g._dfCardW = cardW;
                g._dfCardH = cardH;
                g._dfViewportGhost = "1";
                g.dataset.dfViewportGhost = "1";
                // Warm bake async — se chegar, troca o fallback pelo bitmap completo.
                if (cardNameEarly && typeof window.DfCardFace?.warmFace === "function") {
                    void window.DfCardFace.warmFace(
                        { name: cardNameEarly, currentPower: safePow, power: safePow },
                        { power: safePow },
                    ).then((url) => {
                        if (!url || !g.isConnected) return;
                        const img = g.querySelector("img.df-ghost-face-img");
                        if (img) {
                            img.src = url;
                            return;
                        }
                        const hostEl = g.querySelector(".df-pvp-hand-ghost-face");
                        if (!hostEl) return;
                        hostEl.replaceChildren();
                        const ni = document.createElement("img");
                        ni.className = "df-ghost-face-img";
                        ni.src = url;
                        ni.alt = "";
                        ni.draggable = false;
                        ni.style.cssText =
                            "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;" +
                            "pointer-events:none;opacity:1;visibility:visible;display:block;";
                        hostEl.appendChild(ni);
                    }).catch(() => {});
                }
                return g;
            }
            const clone = srcCard.cloneNode(true);
            clone.style.width = `${cardW}px`;
            clone.style.height = `${cardH}px`;
            clone.style.maxWidth = "none";
            clone.style.maxHeight = "none";
            clone.style.margin = "0";
            clone.style.flex = "none";
            clone.style.boxSizing = "border-box";
            clone.style.setProperty("overflow", pvpDrag ? "hidden" : "visible", "important");
            clone.style.setProperty("aspect-ratio", "5 / 7", "important");
            if (pvpDrag) {
                clone.style.setProperty("contain", "none", "important");
                clone.style.setProperty("transform", "none", "important");
                clone.style.setProperty("rotate", "none", "important");
                clone.style.removeProperty("--fan-x");
                clone.style.removeProperty("--fan-y");
                clone.style.removeProperty("--fan-rot");
            }
            g.appendChild(clone);
            document.body.appendChild(g);
            const nm = clone.querySelector(".nm");
            const cardName = nm ? nm.textContent.trim() : "";
            const powEl = clone.querySelector(".pow");
            const facePow = clone.querySelector(".df-card-face__power[data-pow], .df-card-face__power");
            powVal = NaN;
            if (facePow?.dataset?.pow != null) powVal = parseInt(facePow.dataset.pow, 10);
            if (!Number.isFinite(powVal) && facePow?.textContent) powVal = parseInt(facePow.textContent, 10);
            if (!Number.isFinite(powVal) && powEl?.textContent) powVal = parseInt(powEl.textContent, 10);
            // Face composta esconde .pow — ler poder do estado da mão / data-pow / catálogo.
            if (!Number.isFinite(powVal)) {
                try {
                    const dataPow = srcCard?.dataset?.pow ?? handWrap?.dataset?.pow;
                    if (dataPow != null) powVal = parseInt(dataPow, 10);
                } catch (e) { /* */ }
            }
            if (!Number.isFinite(powVal)) {
                try {
                    const idx = parseInt(handWrap?.dataset?.idx ?? handWrap?.dataset?.handIdx ?? "", 10);
                    const seat = window.__DF_ONLINE ? (window.__DF_SEAT | 0) : 0;
                    const handCard = window.__DF_ENGINE?.getRawState?.()?.players?.[seat]?.hand?.[idx]
                        || deps?.getState?.()?.players?.[seat]?.hand?.[idx];
                    if (handCard) {
                        powVal = +(handCard.currentPower ?? handCard.power);
                    }
                } catch (e) { /* */ }
            }
            if (!Number.isFinite(powVal) && cardName) {
                try {
                    const cat = (window.DfData?.cardDefs || window.cardDefs || [])
                        .find?.((x) => x && x.name === cardName);
                    if (cat && Number.isFinite(+cat.power)) powVal = +cat.power;
                } catch (e) { /* */ }
            }
            if (cardName && window.DfCardFace?.isComposed?.(cardName)) {
                try {
                    const safePow = Number.isFinite(powVal) ? powVal : undefined;
                    clone.classList.add("has-composed-face", "has-art", "art-ready");
                    clone.classList.remove("df-card-face--loading", "art-loading", "preview-art-loading");
                    clone.style.setProperty("background", "transparent", "important");
                    const existingFace = clone.querySelector(".df-card-face");
                    if (existingFace) {
                        // cloneNode já trouxe a face — remount → loading preto.
                        existingFace.style.opacity = "1";
                        existingFace.style.visibility = "visible";
                    } else {
                        const cached = typeof window.DfCardFace.getFaceDataUrl === "function"
                            ? window.DfCardFace.getFaceDataUrl(cardName, safePow)
                            : null;
                        if (cached) {
                            const img = document.createElement("img");
                            img.className = "card-art-bg";
                            img.alt = "";
                            img.src = cached;
                            img.style.cssText =
                                "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;";
                            clone.insertBefore(img, clone.firstChild);
                        } else {
                            window.DfCardFace.mount(
                                clone,
                                { name: cardName, currentPower: safePow, power: safePow },
                                { power: safePow },
                            );
                            clone.classList.remove("df-card-face--loading", "art-loading");
                            clone.classList.add("art-ready");
                            const face = clone.querySelector(".df-card-face");
                            if (face) face.style.opacity = "1";
                        }
                    }
                } catch (e) {
                    window.dfAttachCardArt?.(clone, cardName);
                }
            } else if (cardName && window.dfAttachCardArt) {
                window.dfAttachCardArt(clone, cardName);
            } else {
                window.applyCardArtTree?.(g);
            }
            clone.querySelectorAll("img.card-art-bg").forEach((im) => {
                im.style.cssText =
                    "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;";
            });
            g._dfCardW = cardW;
            g._dfCardH = cardH;
            g._dfViewportGhost = "1";
            g.dataset.dfViewportGhost = "1";
            return g;
        }
        
        function dfCleanupFieldDragGhost() {
            document.querySelectorAll(".drag-ghost-field, .drag-ghost.drag-attacker").forEach((g) => g.remove());
        }

        function dfKillFieldCardMotion(el) {
            if (!el) return;
            try { global.DfGsapBridge?.killTweensOf?.(el); } catch (e) { /* */ }
            try { global.gsap?.killTweensOf?.(el); } catch (e) { /* */ }
            global.DfTargetLevitate?.stopOne?.(el);
        }

        /** Guarda trava de layout pós-dfLockFieldCardTransform (âncora do campo). */
        function dfCapturePosicaoFixaCampo(el) {
            if (!el?.matches?.(".quadrant-field .ccard")) return;
            const r = el.getBoundingClientRect();
            el.posicaoFixaCampo = {
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                transform: el.style.getPropertyValue("transform") || "none",
                marginLeft: el.style.getPropertyValue("margin-left") || "0px",
                marginRight: el.style.getPropertyValue("margin-right") || "0px",
                marginTop: el.style.getPropertyValue("margin-top") || "0px",
            };
            el.dataset.dfPosicaoFixa = "1";
        }

        function dfFieldCardDriftPx(el) {
            const anchor = el?.posicaoFixaCampo;
            if (!anchor) return 0;
            const r = el.getBoundingClientRect();
            return Math.max(
                Math.abs(r.left - anchor.left),
                Math.abs(r.top - anchor.top),
            );
        }

        function dfEnforcePosicaoFixaCampo(el) {
            if (!el?.matches?.(".quadrant-field .ccard")) return;
            if (el.estaSendoArrastada || el.classList.contains("field-drag-src") || el.classList.contains("field-dragging")) return;
            if (el.dataset.dfFieldAnimating === "1" || el.classList.contains("is-summoning") || el.classList.contains("df-summon-busy")) return;
            if (el.classList.contains("df-target-levitating") || el.classList.contains("df-summon-settle")) return;
            if (el.classList.contains("land-impact")) return;
            if (!el.posicaoFixaCampo) {
                dfLockFieldCardTransform(el);
                dfCapturePosicaoFixaCampo(el);
                return;
            }
            if (dfFieldCardDriftPx(el) < 3) return;
            dfKillFieldCardMotion(el);
            dfLockFieldCardTransform(el, { force: true });
            dfCapturePosicaoFixaCampo(el);
        }

        function dfSetFieldCardInteractive(el, on) {
            if (!el) return;
            if (on) {
                el.style.pointerEvents = "";
                delete el.dataset.dfFieldAnimating;
                el.estaAnimando = false;
            } else {
                el.style.pointerEvents = "none";
                el.dataset.dfFieldAnimating = "1";
                el.estaAnimando = true;
            }
        }

        function dfBeginFieldSummonBusy(el) {
            if (!el) return;
            dfSetFieldCardInteractive(el, false);
            el.classList.add("df-summon-busy");
        }

        function dfEndFieldSummonBusy(el) {
            if (!el) return;
            el.classList.remove("df-summon-busy", "df-summon-settle", "land-impact");
            dfKillFieldCardMotion(el);
            ["transform", "translate", "scale", "rotate", "top", "left", "transition", "filter"].forEach((p) => {
                el.style.removeProperty(p);
            });
            delete el.dataset.dfFieldLocked;
            delete el.dataset.dfFieldLockSig;
            if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(el)) {
                dfSealPlayerFieldCard(el);
            } else {
                dfLockFieldCardTransform(el, { force: true });
                dfCapturePosicaoFixaCampo(el);
            }
            dfSetFieldCardInteractive(el, true);
            el.estaSendoArrastada = false;
        }

        function dfMarkFieldCardDragging(el, on) {
            if (!el) return;
            el.estaSendoArrastada = !!on;
        }
        
        function dfEndFieldDragVisual(opts = {}) {
            const keepHidden = !!opts.keepSourcesHiddenForCombat;
            dfCleanupFieldDragGhost();
            window.__dfFieldDrag = null;
            document.body.classList.remove("dragging-card");
            try { global.DfTargetLevitate?.stopAll?.(); } catch (e) { /* */ }
            document.querySelectorAll(
                ".ccard.field-drag-src, .ccard.field-dragging, .ccard.snap-enemy, .ccard.drag-attack-target, .ccard.df-target-levitating"
            ).forEach((el) => {
                el.classList.remove(
                    "field-dragging", "snap-enemy", "dragging-src",
                    "field-drag-src", "drag-attack-target", "df-target-levitating"
                );
                dfKillFieldCardMotion(el);
                el.estaSendoArrastada = false;
                ["transform", "translate", "scale", "rotate", "will-change", "transform-origin"].forEach((p) => {
                    el.style.removeProperty(p);
                });
                if (keepHidden) {
                    el.classList.add("combat-src-hidden");
                    el.style.visibility = "hidden";
                    el.style.opacity = "0";
                    el.style.pointerEvents = "none";
                } else {
                    el.style.visibility = "";
                    el.style.opacity = "";
                    el.style.pointerEvents = "";
                    dfEnforcePosicaoFixaCampo(el);
                }
            });
            dfStabilizeFieldCards();
        }
        
        function dfTappedFieldMarginPx() {
            try {
                if (window.matchMedia("(min-width: 901px)").matches) return 18;
                if (window.matchMedia("(max-width: 900px)").matches) return 12;
            } catch (e) { /* */ }
            return 9;
        }
        
        function dfFieldLockSignature(el) {
            return [
                el.classList.contains("tapped") ? "1" : "0",
                el.classList.contains("field-present-landscape") ? "1" : "0",
            ].join("|");
        }

        /** Invocação/drag/combate podem zerar style.transform e remover a trava !important. */
        function dfFieldLockInlineIntact(el) {
            if (el.style.getPropertyPriority("transform") !== "important") return false;
            const marginOk = el.style.getPropertyPriority("margin-top") === "important"
                || el.style.getPropertyPriority("margin") === "important";
            if (!marginOk) return false;
            if (el.style.getPropertyPriority("translate") !== "important") return false;
            if (el.style.getPropertyPriority("transition") !== "important") return false;
            try {
                const cs = getComputedStyle(el);
                if (cs.animationName && cs.animationName !== "none") return false;
            } catch (e) { /* */ }
            const val = (el.style.getPropertyValue("transform") || "").trim();
            /* Tapped no campo do jogador fica VERTICAL — qualquer scale/translate
               órfão do combate deixa o campeão minúsculo. Exigir identidade. */
            if (el.classList.contains("tapped")) {
                if (val && val !== "none") return false;
                try {
                    const cs = getComputedStyle(el);
                    const tr = cs.transform;
                    if (tr && tr !== "none" && !/^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(tr)) {
                        return false;
                    }
                } catch (e) { /* */ }
                return true;
            }
            if (!dfIsCanvasFieldLayout() && el.classList.contains("field-present-landscape")) {
                return val.includes("rotate(-90deg)");
            }
            return val === "none";
        }

        function dfFieldLockScope(root) {
            if (!root) return null;
            if (root.matches?.(".quadrant-field")) return root;
            return root.closest?.(".quadrant-field") || null;
        }

        function dfInstallFieldHoverLock() {
            const game = document.getElementById("game");
            if (!game || game.dataset.dfFieldHoverLock === "1") return;
            /* Desktop #quadrant-0: trava só via CSS + render — pointerover removido (causava jitter). */
            game.dataset.dfFieldHoverLock = "1";
        }

        let _fieldLockObserver = null;
        const _fieldLockObserverPending = new Set();
        let _fieldSealDepth = 0;
        let _fieldLockMoPaused = false;
        window.__dfPauseFieldLockMO = (paused) => {
            _fieldLockMoPaused = !!paused;
        };

        function dfQueueFieldLockFromObserver(el) {
            if (_fieldSealDepth > 0 || _fieldLockMoPaused) return;
            if (!el?.matches?.(".quadrant-field .ccard")) return;
            /* Campo do jogador (desktop): selagem só no render / fim de invocação / hover — não via observer. */
            if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(el)) return;
            if (el.dataset.dfFieldLocked === "1" && dfFieldLockInlineIntact(el)
                && el.dataset.dfFieldLockSig === dfFieldLockSignature(el)) {
                return;
            }
            _fieldLockObserverPending.add(el);
            requestAnimationFrame(() => {
                const batch = [..._fieldLockObserverPending];
                _fieldLockObserverPending.clear();
                batch.forEach((node) => dfStabilizeFieldCards(node));
            });
        }

        function dfEnsureFieldLockObserver() {
            dfInstallFieldHoverLock();
            dfInstallPlayerFieldPointerGuard();
            if (_fieldLockObserver) return;
            const game = document.getElementById("game");
            if (!game) return;
            _fieldLockObserver = new MutationObserver((mutations) => {
                if (_fieldSealDepth > 0 || _fieldLockMoPaused) return;
                if (window.__dfMpTargetResolve) return;
                for (const m of mutations) {
                    if (m.type === "attributes" && m.target.matches?.(".quadrant-field .ccard")) {
                        if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(m.target)) {
                            continue;
                        }
                        if (m.attributeName === "style"
                            && m.target.dataset.dfFieldLocked === "1" && dfFieldLockInlineIntact(m.target)
                            && m.target.dataset.dfFieldLockSig === dfFieldLockSignature(m.target)) {
                            continue;
                        }
                        dfQueueFieldLockFromObserver(m.target);
                        return;
                    }
                    if (m.type === "childList") {
                        for (const n of m.addedNodes) {
                            if (n.nodeType !== 1) continue;
                            if (n.matches?.(".quadrant-field .ccard")) {
                                if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(n)) {
                                    requestAnimationFrame(() => {
                                        if (n.isConnected) dfSealPlayerFieldCard(n);
                                    });
                                    return;
                                }
                                dfQueueFieldLockFromObserver(n);
                                return;
                            }
                            const nested = n.querySelector?.(".quadrant-field .ccard");
                            if (nested) {
                                if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(nested)) {
                                    requestAnimationFrame(() => {
                                        if (nested.isConnected) dfSealPlayerFieldCard(nested);
                                    });
                                    return;
                                }
                                dfQueueFieldLockFromObserver(nested);
                                return;
                            }
                        }
                    }
                }
            });
            _fieldLockObserver.observe(game, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["class", "style"],
            });
        }

        function dfIsCanvasFieldLayout() {
            return !!(window.DfLayout?.isCanvasFieldLayout?.()
                || window.DfLayout?.isMobileDesktopFit?.());
        }

        function dfIsDesktopPlayerFieldLock() {
            try {
                if (document.documentElement.classList.contains("df-mobile")) return false;
                if (window.DfLayout?.isDesktopLayout?.()) return true;
                return window.matchMedia("(min-width: 901px)").matches;
            } catch (e) { return false; }
        }

        function dfIsPlayerQuadrantFieldCard(el) {
            return !!el?.matches?.("#quadrant-0 .quadrant-field .ccard");
        }

        function dfIsPlayerFieldHighlight(el) {
            if (!dfIsPlayerQuadrantFieldCard(el)) return false;
            return el.classList.contains("valid-target")
                || el.classList.contains("target")
                || el.classList.contains("ritual-drag-target")
                || el.classList.contains("drag-attack-target")
                || el.classList.contains("df-target-levitating");
        }

        function dfClearPlayerFieldHighlightInline(el) {
            if (!dfIsDesktopPlayerFieldLock() || !dfIsPlayerQuadrantFieldCard(el)) return;
            ["border", "border-color", "border-width", "border-style", "box-shadow", "animation"].forEach((p) => {
                el.style.removeProperty(p);
            });
        }

        function dfFieldCardSizePx(el) {
            try {
                const field = el?.closest?.(".quadrant-field");
                const cs = getComputedStyle(field || document.documentElement);
                const w = parseFloat(cs.getPropertyValue("--df-field-card-w"));
                const h = parseFloat(cs.getPropertyValue("--df-field-card-h"));
                return {
                    width: w > 40 ? Math.round(w) : 90,
                    height: h > 50 ? Math.round(h) : 126,
                };
            } catch (e) { /* */ }
            return { width: 90, height: 126 };
        }

        function dfFieldCardFlexBasisPx(el) {
            return dfFieldCardSizePx(el).width;
        }

        /** Só dimensões do slot — sem travar transform (mira/levitação GSAP). */
        function dfApplyPlayerFieldGridSlotSize(el) {
            if (!dfIsDesktopPlayerFieldLock() || !dfIsPlayerQuadrantFieldCard(el)) return;
            ["grid-column", "grid-row", "top", "left", "right", "bottom"].forEach((p) => {
                el.style.removeProperty(p);
            });
            const { width: slotW, height: slotH } = dfFieldCardSizePx(el);
            el.style.setProperty("position", "relative", "important");
            el.style.setProperty("flex", `0 0 ${slotW}px`, "important");
            el.style.setProperty("width", slotW + "px", "important");
            el.style.setProperty("min-width", slotW + "px", "important");
            el.style.setProperty("max-width", slotW + "px", "important");
            el.style.setProperty("height", slotH + "px", "important");
            el.style.setProperty("min-height", slotH + "px", "important");
            el.style.setProperty("max-height", slotH + "px", "important");
            el.style.setProperty("--fan-rot", "0deg", "important");
            el.style.setProperty("--fan-x", "0px", "important");
            el.style.setProperty("--fan-y", "0px", "important");
            el.style.setProperty("--fan-stack", "auto", "important");
            el.style.setProperty("margin-left", "0", "important");
            el.style.setProperty("margin-right", "0", "important");
            el.style.setProperty("margin-top", "0", "important");
            el.style.setProperty("margin-bottom", "0", "important");
        }

        function dfApplyPlayerFieldGridSlot(el) {
            dfApplyPlayerFieldGridSlotSize(el);
            if (!dfIsDesktopPlayerFieldLock() || !dfIsPlayerQuadrantFieldCard(el)) return;
            el.style.setProperty("transform", "none", "important");
            el.style.setProperty("translate", "none", "important");
            el.style.setProperty("scale", "1", "important");
            el.style.setProperty("rotate", "none", "important");
        }

        function dfPlayerFieldCardNeedsReseal(el) {
            if (!el?.matches?.("#quadrant-0 .quadrant-field .ccard")) return false;
            if (dfIsPlayerFieldHighlight(el)) return false;
            if (!el.classList.contains("df-player-field-sealed")) return true;
            if (!dfFieldLockInlineIntact(el)) return true;
            try {
                const cs = getComputedStyle(el);
                const tr = cs.transform;
                if (tr && tr !== "none" && !tr.startsWith("matrix(1, 0, 0, 1, 0, 0)")) return true;
                const rot = cs.rotate;
                if (rot && rot !== "none" && rot !== "0deg") return true;
                const sc = cs.scale;
                if (sc && sc !== "none" && sc !== "1") return true;
                const fanRot = cs.getPropertyValue("--fan-rot").trim();
                if (fanRot && fanRot !== "0deg" && fanRot !== "0") return true;
                /* Slot menor que o token do campo = regressão pós-ataque. */
                const { width: slotW, height: slotH } = dfFieldCardSizePx(el);
                if (el.offsetWidth > 0 && el.offsetWidth < slotW * 0.85) return true;
                if (el.offsetHeight > 0 && el.offsetHeight < slotH * 0.85) return true;
            } catch (e) { /* */ }
            return false;
        }

        function dfSealPlayerFieldCard(el) {
            if (!dfIsDesktopPlayerFieldLock() || !dfIsPlayerQuadrantFieldCard(el)) return;
            // Mira: mantém tamanho do campo; não trava transform (GSAP / borda).
            if (dfIsPlayerFieldHighlight(el)) {
                dfApplyPlayerFieldGridSlotSize(el);
                return;
            }
            if (el.classList.contains("field-drag-src") || el.classList.contains("field-dragging")
                || el.classList.contains("combat-animating") || el.classList.contains("is-summoning")
                || el.classList.contains("df-summon-busy") || el.classList.contains("df-summon-settle")
                || el.classList.contains("land-impact")) return;
            const sealSig = dfFieldLockSignature(el);
            if (el.dataset.dfPlayerFieldSealed === sealSig && el.dataset.dfFieldLocked === "1"
                && el.classList.contains("df-player-field-sealed") && dfFieldLockInlineIntact(el)
                && !dfPlayerFieldCardNeedsReseal(el)) return;
            _fieldSealDepth++;
            try {
            el.classList.add("df-player-field-sealed");
            el.classList.remove("df-summon-settle", "land-impact", "field-present-landscape");
            el.style.removeProperty("--card-art");
            el.style.setProperty("--fan-rot", "0deg", "important");
            el.style.setProperty("--fan-x", "0px", "important");
            el.style.setProperty("--fan-y", "0px", "important");
            el.style.setProperty("--fan-stack", "auto", "important");
            dfKillFieldCardMotion(el);
            el.querySelectorAll("img.card-art-bg").forEach((img) => {
                img.style.removeProperty("transform");
                img.style.removeProperty("opacity");
            });
            dfLockFieldCardTransform(el, { force: true });
            el.dataset.dfPlayerFieldSealed = sealSig;
            } finally {
                _fieldSealDepth--;
            }
        }

        function dfInstallPlayerFieldPointerGuard() {
            const field = document.querySelector("#quadrant-0 .quadrant-field");
            if (!field || field.dataset.dfPlayerFieldGuard === "1") return;
            field.dataset.dfPlayerFieldGuard = "1";
            /* Desktop: trava só via CSS + render/fan — sem pointerover (causava fantasma/duplicata). */
        }

        function dfSealPlayerFieldRow(fieldEl) {
            if (!fieldEl || !dfIsDesktopPlayerFieldLock()) return;
            dfInstallPlayerFieldPointerGuard();
            fieldEl.querySelectorAll(":scope > .ccard").forEach((el) => {
                if (el.classList.contains("field-drag-src") || el.classList.contains("field-dragging")
                    || el.classList.contains("combat-animating") || el.classList.contains("is-summoning")
                    || el.classList.contains("df-summon-busy") || el.classList.contains("df-summon-settle")
                    || dfIsPlayerFieldHighlight(el)) return;
                dfSealPlayerFieldCard(el);
            });
        }

        function dfLockFieldCardTransform(el, opts = {}) {
            if (!el?.matches?.(".quadrant-field .ccard")) return;
            if (el.classList.contains("combat-animating") ||
                el.classList.contains("combat-src-hidden") ||
                el.classList.contains("is-summoning") ||
                el.classList.contains("df-summon-busy") ||
                el.classList.contains("df-summon-settle") ||
                el.classList.contains("land-impact") ||
                el.classList.contains("field-drag-src") ||
                el.classList.contains("field-dragging") ||
                el.classList.contains("counting-bounce") ||
                el.classList.contains("counting-bounce-tapped")) return;
            /* Levitação GSAP (alvos destacados) controla transform — não travar. */
            if (el.classList.contains("df-target-levitating") ||
                el.classList.contains("valid-target") ||
                el.classList.contains("ritual-drag-target") ||
                el.classList.contains("drag-attack-target")) return;
            const lockSig = dfFieldLockSignature(el);
            if (!opts.force && el.dataset.dfFieldLocked === "1" && el.dataset.dfFieldLockSig === lockSig
                && dfFieldLockInlineIntact(el)) return;
            el.classList.remove("impact", "land-impact");
            ["animation", "filter", "opacity", "visibility",
             "top", "left", "margin-top"].forEach((p) => {
                el.style.removeProperty(p);
            });
            el.style.setProperty("animation", "none", "important");
            el.style.setProperty("transition", "none", "important");
            el.style.setProperty("will-change", "auto", "important");
            if (el.classList.contains("valid-target") || el.classList.contains("target")) {
                el.style.removeProperty("box-shadow");
                el.style.removeProperty("animation");
            } else if (!el.classList.contains("has-art")) {
                el.style.setProperty("box-shadow", "var(--shadow-card)", "important");
            } else {
                el.style.removeProperty("box-shadow");
            }
            const playerFieldDesktop = dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(el);
            if (playerFieldDesktop) {
                el.style.removeProperty("box-shadow");
            }
            const tapped = el.classList.contains("tapped");
            const canvasField = dfIsCanvasFieldLayout();
            const landscape = !canvasField && !tapped && el.classList.contains("field-present-landscape") && !playerFieldDesktop;
            if (tapped) {
                el.style.setProperty("margin-left", "0", "important");
                el.style.setProperty("margin-right", "0", "important");
                el.style.setProperty("margin-top", "0", "important");
                el.style.setProperty("margin-bottom", "0", "important");
                el.style.setProperty("transform", "none", "important");
                el.style.setProperty("translate", "none", "important");
                el.style.setProperty("scale", "1", "important");
                el.style.setProperty("rotate", "none", "important");
                el.style.removeProperty("filter");
                /* Cansado no campo do jogador: MESMO slot 5:7 dos demais.
                   Antes pulava dfApplyPlayerFieldGridSlot → atacante minúsculo. */
                if (playerFieldDesktop) {
                    el.style.setProperty("flex", `0 0 ${dfFieldCardFlexBasisPx(el)}px`, "important");
                    el.style.setProperty("position", "relative", "important");
                    el.style.setProperty("inset", "auto", "important");
                    el.style.removeProperty("top");
                    el.style.removeProperty("left");
                    el.style.removeProperty("right");
                    el.style.removeProperty("bottom");
                    dfApplyPlayerFieldGridSlot(el);
                } else {
                    const slotW = dfFieldCardFlexBasisPx(el);
                    const rootCs = getComputedStyle(document.documentElement);
                    const slotH = parseFloat(rootCs.getPropertyValue("--df-field-card-h")) || 126;
                    el.style.setProperty("flex-shrink", "0", "important");
                    el.style.setProperty("flex-grow", "0", "important");
                    el.style.setProperty("flex-basis", slotW + "px", "important");
                    el.style.setProperty("width", slotW + "px", "important");
                    el.style.setProperty("min-width", slotW + "px", "important");
                    el.style.setProperty("max-width", slotW + "px", "important");
                    el.style.setProperty("height", slotH + "px", "important");
                    el.style.setProperty("min-height", slotH + "px", "important");
                    el.style.setProperty("max-height", slotH + "px", "important");
                }
            } else if (landscape) {
                el.style.removeProperty("filter");
                const m = dfTappedFieldMarginPx() + "px";
                el.style.setProperty("margin-left", m, "important");
                el.style.setProperty("margin-right", m, "important");
                el.style.setProperty("margin-top", "0", "important");
                el.style.setProperty("margin-bottom", "0", "important");
                el.style.setProperty("transform", "rotate(-90deg)", "important");
                el.style.removeProperty("rotate");
                el.style.removeProperty("translate");
                el.style.setProperty("scale", "1", "important");
            } else {
                el.style.removeProperty("filter");
                el.style.setProperty("margin-left", "0", "important");
                el.style.setProperty("margin-right", "0", "important");
                el.style.setProperty("margin-top", "0", "important");
                el.style.setProperty("margin-bottom", "0", "important");
                if (!playerFieldDesktop) {
                    const slotW = dfFieldCardFlexBasisPx(el);
                    const rootCs = getComputedStyle(document.documentElement);
                    const slotH = parseFloat(rootCs.getPropertyValue("--df-field-card-h")) || 126;
                    el.style.setProperty("flex-shrink", "0", "important");
                    el.style.setProperty("flex-grow", "0", "important");
                    el.style.setProperty("flex-basis", slotW + "px", "important");
                    el.style.setProperty("width", slotW + "px", "important");
                    el.style.setProperty("min-width", slotW + "px", "important");
                    el.style.setProperty("max-width", slotW + "px", "important");
                    el.style.setProperty("height", slotH + "px", "important");
                    el.style.setProperty("min-height", slotH + "px", "important");
                    el.style.setProperty("max-height", slotH + "px", "important");
                } else {
                    el.style.setProperty("flex", `0 0 ${dfFieldCardFlexBasisPx(el)}px`, "important");
                    el.style.setProperty("position", "relative", "important");
                }
                el.style.setProperty("z-index", "auto", "important");
                el.style.setProperty("transform", "none", "important");
                el.style.setProperty("translate", "none", "important");
                el.style.setProperty("scale", "1", "important");
                el.style.setProperty("rotate", "none", "important");
                if (playerFieldDesktop) {
                    el.style.setProperty("inset", "auto", "important");
                    el.style.removeProperty("top");
                    el.style.removeProperty("left");
                    el.style.removeProperty("right");
                    el.style.removeProperty("bottom");
                    dfApplyPlayerFieldGridSlot(el);
                }
            }
            if (playerFieldDesktop && el.classList.contains("has-art") && !dfIsPlayerFieldHighlight(el)) {
                // Durante invocação: não zerar fundo dos outros campeões (flash transparente).
                const summonLive = !!(
                    el.classList.contains("is-summoning")
                    || document.querySelector(".summon-fly, .ccard.is-summoning")
                );
                if (!summonLive || el.classList.contains("is-summoning")) {
                    el.style.setProperty("background", "none", "important");
                    el.style.setProperty("background-image", "none", "important");
                    el.style.setProperty("background-color", "transparent", "important");
                    el.style.setProperty("border-color", "transparent", "important");
                    el.style.setProperty("box-shadow", "none", "important");
                    el.style.removeProperty("--card-art");
                    el.style.setProperty("overflow", "hidden", "important");
                    el.classList.remove("field-present-landscape");
                }
            }
            el.querySelectorAll("img.card-art-bg").forEach((img) => {
                img.style.setProperty("transform", "none", "important");
            });
            el.dataset.dfFieldLocked = "1";
            el.dataset.dfFieldLockSig = lockSig;
            if (!el.classList.contains("df-target-levitating")) {
                dfCapturePosicaoFixaCampo(el);
            }
        }
        
        function dfIsPlayerHandWrap(el) {
            return !!el?.closest?.("#quadrant-0") && !el?.classList?.contains("ai-hand-wrap");
        }
        
        function dfLockHandWrapTransform(el) {
            if (!el?.matches?.(".hand-wrap")) return;
            if (el.closest?.(".quadrant-field")) return;
            if (el.classList.contains("dragging-src")) return;
            el.style.setProperty("transition", "none", "important");
            el.style.setProperty("transform",
                "translate3d(var(--fan-x), var(--fan-y), 0) rotateZ(var(--fan-rot))", "important");
            el.style.setProperty("z-index", "var(--fan-stack, auto)", "important");
            el.style.setProperty("filter", "none", "important");
            el.querySelectorAll(".hcard").forEach((hc) => {
                hc.style.setProperty("transform", "none", "important");
                hc.style.setProperty("transition", "none", "important");
                hc.style.setProperty("filter", "none", "important");
            });
        }
        
        function dfScheduleFieldRowLock(root) {
            const card = root?.matches?.(".quadrant-field .ccard") ? root : null;
            if (!card) return;
            const field = card.closest(".quadrant-field");
            const sealOne = (el) => {
                if (!el?.isConnected) return;
                if (el.classList.contains("df-summon-busy") || el.classList.contains("is-summoning")) {
                    dfEndFieldSummonBusy(el);
                    return;
                }
                el.classList.remove("df-summon-settle", "land-impact");
                dfKillFieldCardMotion(el);
                dfLockFieldCardTransform(el, { force: true });
                dfCapturePosicaoFixaCampo(el);
            };
            const seal = () => {
                if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(card)) {
                    requestAnimationFrame(() => dfSealPlayerFieldCard(card));
                    return;
                }
                sealOne(card);
            };
            if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(card)) {
                seal();
                return;
            }
            seal();
            requestAnimationFrame(seal);
        }

        function dfStabilizeFieldCards(root, opts = {}) {
            if (!opts.force && (
                window.__dfCombatActive ||
                window.__dfCombatPending ||
                window.__dfIsCombatPresentationLive?.()
            )) {
                return;
            }
            dfEnsureFieldLockObserver();
            const sel = ".quadrant-field .ccard";
            const list = root
                ? (root.matches?.(sel) ? [root] : [...(root.querySelectorAll?.(sel) || [])])
                : [...document.querySelectorAll(sel)];
            list.forEach((el) => {
                // Mira ativa: só selar dimensões — sem re-lock de transform.
                if (el.classList?.contains("valid-target")
                    || el.classList?.contains("df-target-levitating")
                    || el.classList?.contains("target")
                    || el.classList?.contains("ritual-drag-target")
                    || el.classList?.contains("drag-attack-target")) {
                    if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(el)) {
                        dfApplyPlayerFieldGridSlotSize(el);
                    }
                    return;
                }
                if (dfIsDesktopPlayerFieldLock() && dfIsPlayerQuadrantFieldCard(el)) {
                    dfSealPlayerFieldCard(el);
                    return;
                }
                dfLockFieldCardTransform(el, opts);
            });
        }
        
        function dfStabilizeHandWraps(root) {
            const sel = ".hand-wrap.ai-hand-wrap, #quadrant-1 .hand-wrap, #quadrant-2 .hand-wrap, #quadrant-3 .hand-wrap";
            const list = root
                ? (root.matches?.(".hand-wrap") && !dfIsPlayerHandWrap(root)
                    ? [root]
                    : [...(root.querySelectorAll?.(sel) || [])])
                : [...document.querySelectorAll(sel)];
            list.forEach((el) => dfLockHandWrapTransform(el));
        }
        
        function dfClosePreviewForTargeting() {
            closePreviewZoom();
        }
        
        function dfCreateFieldDragGhost(ccardEl, clientX, clientY) {
            if (!ccardEl) return null;
            const { w: cardW, h: cardH } = dfMeasureHandCardEl(ccardEl);
            const scale = 1.1;
            const g = document.createElement("div");
            g.className = "drag-ghost drag-ghost-field drag-attacker";
            g.dataset.activeDrag = "1";
            g.dataset.ghostBorn = String(Date.now());
            g.style.left = `${clientX}px`;
            g.style.top = `${clientY}px`;
            g.style.width = `${Math.round(cardW * scale)}px`;
            g.style.height = `${Math.round(cardH * scale)}px`;
            const clone = ccardEl.cloneNode(true);
            clone.style.width = `${cardW}px`;
            clone.style.height = `${cardH}px`;
            clone.style.position = "absolute";
            clone.style.left = "50%";
            clone.style.bottom = "0";
            clone.style.transform = "translateX(-50%)";
            clone.style.margin = "0";
            clone.style.overflow = "visible";
            clone.style.boxSizing = "border-box";
            clone.style.visibility = "visible";
            clone.style.opacity = "1";
            g.appendChild(clone);
            if (window.DfLayout?.appendDragGhost) {
                window.DfLayout.appendDragGhost(g);
                window.DfLayout.positionDragGhost(g, clientX, clientY);
            } else {
                document.body.appendChild(g);
            }
            const nm = clone.querySelector(".nm");
            const cardName = nm ? nm.textContent.trim() : "";
            if (cardName && window.dfAttachCardArt) {
                window.dfAttachCardArt(clone, cardName);
            } else {
                window.applyCardArtTree?.(g);
            }
            clone.querySelectorAll("img.card-art-bg").forEach((im) => {
                im.style.cssText =
                    "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;";
            });
            g._dfCardW = cardW;
            g._dfCardH = cardH;
            return g;
        }
        
        function fieldInsertIndexAt(clientX, clientY) {
            const pIdx = deps.dfHumanSeat?.() ?? deps.dfLocalSeat?.() ?? 0;
            const qIdx = window.__dfHud?.quadrantForPlayer?.(pIdx) ?? pIdx;
            const field = document.querySelector(`#quadrant-${qIdx} .quadrant-field`);
            if (!field) return deps.getState().players[pIdx]?.field?.length || 0;
            const cards = [...field.querySelectorAll(".ccard")].filter((el) => {
                if (el.classList.contains("is-summoning")) return false;
                const st = getComputedStyle(el);
                return st.visibility !== "hidden" && st.opacity !== "0";
            });
            if (!cards.length) return 0;
            for (let i = 0; i < cards.length; i++) {
                const r = cards[i].getBoundingClientRect();
                const mid = r.left + r.width / 2;
                if (clientX < mid) return i;
            }
            return cards.length;
        }
        
        function dfClearRitualDragHighlight() {
            document.body.removeAttribute("data-dragging-ritual");
            document.querySelectorAll(".ccard.ritual-drag-target").forEach((el) => {
                el.classList.remove("ritual-drag-target");
            });
            window.DfTargetLevitate?.sync?.();
        }
        
        function dfSyncRitualDragHighlight(zone, reqPow) {
            dfClearRitualDragHighlight();
            if (reqPow == null) {
                document.body.removeAttribute("data-dragging-ritual");
                return;
            }
            document.body.dataset.draggingRitual = String(reqPow);
            const pIdx = deps.dfHumanSeat();
            const indices = DfRules.listRitualSacrificeIndices(deps.getState(), pIdx, reqPow);
            for (const i of indices) {
                const el = getChampionDom(pIdx, i);
                if (el) el.classList.add("ritual-drag-target");
            }
            window.DfTargetLevitate?.sync?.();
        }
        
        function updateDropHighlight(zone, ritualPow) {
            const q = document.getElementById("quadrant-0");
            if (!q) return;
            const field = q.querySelector(".quadrant-field");
            const hand = q.querySelector(".quadrant-hand");
            field?.classList.toggle("drop-target", zone === "field");
            hand?.classList.toggle("drop-target", zone === "hand");
            dfSyncRitualDragHighlight(zone, ritualPow ?? null);
        }
        
        function clearDropHighlight() {
            const q = document.getElementById("quadrant-0");
            if (!q) return;
            q.querySelector(".quadrant-field")?.classList.remove("drop-target");
            q.querySelector(".quadrant-hand")?.classList.remove("drop-target");
            dfClearRitualDragHighlight();
        }
        
        function openCardZoom(card) {
            if (!card) return;
            if (["target-champion", "target-ally", "ultimate-target",
                 "select-attacker", "select-defender"].includes(deps.getGamePhase())) return;
            const inner = deps.$("preview-card-inner");
            if (!inner) return;
            const tc = getCardTypeClass(card);
            const catLabel = card.category === "talent" ? "TALENTO" : "CAMPEÃO";
            const costCls = card.power === 0 ? " zero" : "";
            // Preserva .preview-zoomed se já estiver aberto (clicar em outra
            // carta com o zoom ativo não pode tirar a classe — senão o
            // openPreviewZoom abaixo trata como "abertura nova" e salva o
            // parent errado, deixando o card vazado no canto da tela ao
            // fechar). applyCardArtTree depois adiciona .has-art se preciso.
            inner.className = `preview-card ${tc}`;
            inner.classList.add("preview-art-loading");

            if (window.DfCardFace?.isComposed?.(card)) {
                inner.innerHTML = `
                    <div class="pow">${card.currentPower}</div>
                    <div class="nm">${card.name}</div>
                    ${statusOverlayHtml(card)}
                `;
                window.DfCardFace.mount(inner, card, { power: card.currentPower });
                inner.classList.remove("preview-art-loading");
                inner.style.opacity = "1";
                inner.style.visibility = "visible";
                openPreviewZoom();
                return;
            }

            inner.innerHTML = `
                <div class="pow">${card.currentPower}</div>
                <div class="nm">${card.name}</div>
                <div class="cat">[${catLabel}]</div>
                <div class="ability-desc">${card.abilityDesc || "Sem habilidade ativa."}</div>
                <div class="cost-badge${costCls}">${card.power === 0 ? "0" : card.currentPower}</div>
                ${gemOverlayHtml(card)}
                ${statusOverlayHtml(card)}
            `;
            window.applyCardArtTree?.(inner);
            // Cartas com PNG: usa <img> dedicada no zoom — no mobile o
            // background-image do CSS ainda deixava aparecer o gradiente
            // azul de fallback (.type-champion) como "carta fantasma".
            let artSrc = null;
            if (inner.classList.contains("has-art")) {
                const artUrl = inner.style.getPropertyValue("--card-art");
                const m = artUrl && artUrl.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
                artSrc = m ? m[1] : null;
                if (artSrc) {
                    inner.insertAdjacentHTML(
                        "afterbegin",
                        `<img class="preview-art-full" src="${artSrc}" alt="${card.name || ""}" draggable="false">`,
                    );
                }
            }
            // BUG ANTIGO: o zoom aparecia ANTES do PNG da arte estar
            // decodificado/pintado pelo browser — o usuário via uma
            // "carta azul pálida" (o fallback do .preview-card sem arte)
            // por uns frames até a textura aparecer. Mesmo com Image()
            // .decode() o cache do CSS `background-image` decodifica
            // separado, então no mobile dava pra ver o flash azul.
            //
            // Evita "fantasma" azul: carta invisível até a arte PNG estar pronta.
            const mobileFit = !!window.DfLayout?.isMobileDesktopFit?.();
            inner.style.opacity = mobileFit ? "1" : "0";
            inner.style.visibility = "visible";
            openPreviewZoom();
            if (artSrc && !mobileFit) {
                const artImg = inner.querySelector(".preview-art-full");
                const myToken = (openCardZoom._token = (openCardZoom._token || 0) + 1);
                let revealed = false;
                const reveal = () => {
                    if (revealed) return;
                    revealed = true;
                    if (openCardZoom._token !== myToken) return;
                    const cur = inner.querySelector(".preview-art-full");
                    if (!cur || cur.getAttribute("src") !== artSrc) return;
                    inner.classList.remove("preview-art-loading");
                    inner.style.opacity = "1";
                };
                const paintThenReveal = () => {
                    requestAnimationFrame(() => requestAnimationFrame(reveal));
                };
                // Cap de 600ms — em redes ruins/imagens não
                // cacheadas, ainda revelamos pra não travar.
                const t = setTimeout(reveal, 600);
                const finalize = () => { clearTimeout(t); paintThenReveal(); };
                if (artImg && artImg.complete && artImg.naturalWidth > 0) {
                    finalize();
                } else if (artImg && artImg.decode) {
                    artImg.decode().then(finalize).catch(finalize);
                } else if (artImg) {
                    artImg.onload = finalize;
                    artImg.onerror = finalize;
                } else {
                    const img = new Image();
                    img.src = artSrc;
                    if (img.decode) {
                        img.decode().then(finalize).catch(finalize);
                    } else if (img.complete) {
                        finalize();
                    } else {
                        img.onload = finalize;
                        img.onerror = finalize;
                    }
                }
            } else {
                inner.classList.remove("preview-art-loading");
                inner.style.opacity = "1";
            }
        }
        function installGlobalPointerSafety() {
            dfEnsureFieldLockObserver();
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", bootPreviewToBody, { once: true });
            } else {
                bootPreviewToBody();
            }
            window.addEventListener("pointerup", () => {
                setTimeout(() => {
                    if (document.querySelector(".drag-ghost-field") || window.__dfFieldDrag?.active) dfEndFieldDragVisual();
                    const handGhost = document.querySelector(".drag-ghost-hand[data-active-drag], .drag-ghost-hand");
                    const handOrphan = (document.body.classList.contains("dragging-card")
                        || window.__dfHandDrag?.active
                        || window.__dfHandDrag?.pending
                        || document.querySelector(".hand-wrap.dragging-src"))
                        && !handGhost && !window.__dfFieldDrag?.active;
                    if (handOrphan) {
                        document.body.classList.remove("dragging-card");
                        window.__dfHandDrag = null;
                        document.querySelectorAll(".hand-wrap.dragging-src").forEach((el) => {
                            el.classList.remove("dragging-src");
                            el.style.visibility = "";
                        });
                    }
                    if (document.body.classList.contains("dragging-card") && handGhost) return;
                    if (window._activeGhost && !document.body.contains(window._activeGhost)) window._activeGhost = null;
                    if (document.querySelector(".drag-ghost, .drag-no-actions-banner")) deps.cleanupOrphanGhosts();
                }, 50);
            });
            window.addEventListener("pointercancel", deps.cleanupOrphanGhosts);
            window.addEventListener("blur", deps.cleanupOrphanGhosts);
            document.addEventListener("mouseleave", (e) => {
                if (!e.relatedTarget && !e.toElement) deps.cleanupOrphanGhosts();
            });
            const coarsePointer = () => !!(window.DfLayout?.isCoarsePointer?.()
                || window.matchMedia("(pointer: coarse)").matches);
            document.addEventListener("pointerout", (e) => {
                if (!coarsePointer()) return;
                if (e.pointerType === "mouse") return;
                if (e.relatedTarget) return;
                if (document.body.classList.contains("dragging-card")
                    || window.__dfHandDrag?.active
                    || window.__dfHandDrag?.pending
                    || window.__dfFieldDrag?.active) return;
                deps.cleanupOrphanGhosts();
            });
        }
        return {
            installGlobalPointerSafety, dropZoneAt, dfCreateHandDragGhost, dfResizeHandDragGhost,
            dfCreateFieldDragGhost, dfEndFieldDragVisual, dfStabilizeFieldCards, dfScheduleFieldRowLock, dfStabilizeHandWraps,
            dfLockFieldCardTransform, dfKillFieldCardMotion, dfCapturePosicaoFixaCampo, dfEnforcePosicaoFixaCampo,
            dfSetFieldCardInteractive, dfBeginFieldSummonBusy, dfEndFieldSummonBusy, dfMarkFieldCardDragging,
            dfSealPlayerFieldRow, dfClearPlayerFieldHighlightInline, dfIsPlayerFieldHighlight,
            dfSealPlayerFieldCard, dfApplyPlayerFieldGridSlot,
            dfClosePreviewForTargeting, resetPreviewHost, openCardZoom, openPreviewZoom, closePreviewZoom, togglePreviewZoom,
            updateDropHighlight, clearDropHighlight, fieldInsertIndexAt,
        };
    }

    global.DfInputController = { create };
})(typeof window !== "undefined" ? window : globalThis);
