/**
 * Dragonfall — Arsenal: catálogo paginado + montagem de até 5 baralhos (10–24 cartas).
 */
(function (global) {
    "use strict";

    const PAGE_SIZE = 24;
    const DECK_SIZE = 24;
    const MIN_DECK_SAVE_SIZE = 10;
    const DECK_COUNT = 5;
    const STORAGE_KEY = "df_custom_decks_v1";
    const CLOUD_SAVE_DEBOUNCE_MS = 800;
    const ZOOM_SCALE_DESKTOP = 2.2;
    const ZOOM_SCALE_MOBILE = 3.2;
    const CARD_ASPECT = 744 / 1039;
    const DRAG_GHOST_MIN_W = 52;
    const DRAG_GHOST_MIN_H = 72;

    const $ = (id) => global.document.getElementById(id);

    let filter = "champion";
    let catalogPage = 0;
    let activeDeckIdx = 0;
    /** @type {{ name: string, cards: (string|null)[] }[]} */
    let decks = [];
    let catalogCards = [];
    let wired = false;
    let hubWired = false;
    let opening = false;
    let toastTimer = 0;
    let cloudSaveTimer = 0;
    let lastCloudFp = "";
    /** @type {null | object} */
    let ptrState = null;

    function isCoarsePointer() {
        return !!global.matchMedia?.("(pointer: coarse)")?.matches;
    }

    function isMobileArsenal() {
        return isMobileUi() || isCoarsePointer()
            || !!global.document.documentElement.classList.contains("df-mobile-desktop-fit");
    }

    /** @type {null | { side: string, card: string, deckSlot: number|null }} */
    let zoomContext = null;

    function handleCardTap(side, card, deckSlot) {
        if (!card) return;
        if (side === "catalog") {
            const deck = activeDeck();
            if (!deck) return;
            if (deckHasCard(deck, card)) {
                toast("Esta carta já está no baralho.");
                return;
            }
            addCardToDeck(card);
            return;
        }
        if (side === "deck" && deckSlot != null) {
            removeCardFromDeck(deckSlot);
        }
    }

    function findDeckSlotForCard(name) {
        const deck = activeDeck();
        if (!deck || !name) return -1;
        return deck.cards.findIndex((n) => n === name);
    }

    function syncZoomActionButtons() {
        const actionBtn = $("df-arsenal-zoom-action");
        if (!actionBtn || !zoomContext) return;
        const deck = activeDeck();
        const inDeck = !!(deck && deckHasCard(deck, zoomContext.card));
        const isRemove = zoomContext.side === "deck" || inDeck;
        actionBtn.textContent = isRemove ? "RETIRAR" : "ADICIONAR";
        actionBtn.classList.toggle("is-remove", isRemove);
        actionBtn.classList.toggle("is-add", !isRemove);
        if (!isRemove && deck && deckFilledCount(deck) >= DECK_SIZE) {
            actionBtn.disabled = true;
            actionBtn.setAttribute("aria-disabled", "true");
        } else {
            actionBtn.disabled = false;
            actionBtn.removeAttribute("aria-disabled");
        }
        zoomContext.mode = isRemove ? "remove" : "add";
        if (isRemove && (zoomContext.deckSlot == null || zoomContext.deckSlot < 0)) {
            zoomContext.deckSlot = findDeckSlotForCard(zoomContext.card);
        }
    }

    function hideDragGhost() { /* arraste removido */ }

    function clearPtrHighlights() { /* arraste removido */ }

    function isMobileUi() {
        return !!global.matchMedia?.("(max-width: 900px), (pointer: coarse)")?.matches;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function getCardDefs() {
        return global.DfData?.cardDefs || [];
    }

    function cardByName(name) {
        return getCardDefs().find((c) => c.name === name) || null;
    }

    function slotTypeClass(c) {
        if (!c) return "";
        if (c.subcategory === "reaction") return "type-reaction";
        if (c.category === "talent") return "type-talent";
        return "type-champion";
    }

    function defaultDecks() {
        return Array.from({ length: DECK_COUNT }, (_, i) => ({
            name: `Baralho ${i + 1}`,
            cards: Array(DECK_SIZE).fill(null),
        }));
    }

    function normalizeDeckEntry(raw, idx) {
        const cards = Array.isArray(raw?.cards) ? raw.cards.slice(0, DECK_SIZE) : [];
        while (cards.length < DECK_SIZE) cards.push(null);
        const valid = cards.map((n) => {
            let name = n != null ? String(n).trim() : "";
            if (!name) return null;
            if (global.DfData && typeof global.DfData.resolveCardName === "function") {
                name = global.DfData.resolveCardName(name);
            }
            const c = cardByName(name);
            return c && !c.hidden ? name : null;
        });
        let name = String(raw?.name || "").trim();
        if (!name) name = `Baralho ${idx + 1}`;
        if (name.length > 32) name = name.slice(0, 32);
        return { name, cards: valid };
    }

    function normalizeDecks(raw) {
        const base = defaultDecks();
        if (!Array.isArray(raw)) return base;
        return base.map((d, i) => normalizeDeckEntry(raw[i] || d, i));
    }

    function loadLocalDecks() {
        try {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultDecks();
            return normalizeDecks(JSON.parse(raw));
        } catch (e) {
            return defaultDecks();
        }
    }

    function saveLocalDecks(data) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* quota */ }
    }

    function decksFingerprint(data) {
        if (!Array.isArray(data)) return "";
        return data.map((d) => {
            const cards = Array.isArray(d?.cards) ? d.cards : [];
            const filled = cards.filter(Boolean).length;
            return `${String(d?.name || "").trim()}|${filled}|${cards.join(",")}`;
        }).join(";;");
    }

    function deckFilledCountDecks(data) {
        if (!Array.isArray(data)) return 0;
        return data.reduce((n, d) => {
            const cards = Array.isArray(d?.cards) ? d.cards : [];
            return n + cards.filter(Boolean).length;
        }, 0);
    }

    function decksFromPlayer(player) {
        const local = loadLocalDecks();
        const localFilled = deckFilledCountDecks(local);
        const loggedIn = !!global.DfAuthClient?.getToken?.();
        if (loggedIn) {
            const fetched = normalizeDecks(player?.customDecks || []);
            const fetchedFilled = deckFilledCountDecks(fetched);
            const fetchedFp = decksFingerprint(fetched);
            const localFp = decksFingerprint(local);
            const dirty = !!(global.DfAuthClient?.hasOutboxPending?.()
                || global.DfAuthClient?.isLocalProfileDirty?.()
                || global.DfAuthClient?.isArsenalSessionDirty?.());
            const serverRev = Number(player?.profileRevision ?? 0);
            const cachedRev = Number(global.DfAuthClient?.getCachedPlayer?.()?.profileRevision ?? 0);
            const serverNewer = serverRev > cachedRev;

            // Conta sem baralhos na nuvem: NÃO herdar localStorage de outra conta.
            if (fetchedFilled === 0) {
                if (dirty && localFilled > 0 && !serverNewer) {
                    saveLocalDecks(local);
                    lastCloudFp = localFp;
                    global.DfAuthClient?.patchCachedPlayerFields?.({ customDecks: local });
                    global.DfAuthClient?.markArsenalSessionDirty?.();
                    void pushDecksToCloud({ silent: true, force: true });
                    return local;
                }
                saveLocalDecks(fetched);
                lastCloudFp = fetchedFp;
                return fetched;
            }

            // Outro aparelho salvou depois (revision maior) → adota nuvem,
            // salvo edição local pendente com MAIS cartas (ex.: Manowar ainda não enviado).
            if (serverNewer && !(dirty && localFilled > fetchedFilled)) {
                saveLocalDecks(fetched);
                lastCloudFp = fetchedFp;
                return fetched;
            }

            // Conta reconcilada: nuvem vence, exceto se o local tiver MAIS cartas
            // e edição pendente (ex.: Manowar 24 no mobile vs LEGAL 10 na nuvem).
            if (localFilled > fetchedFilled && dirty) {
                saveLocalDecks(local);
                lastCloudFp = localFp;
                global.DfAuthClient?.patchCachedPlayerFields?.({ customDecks: local });
                global.DfAuthClient?.markArsenalSessionDirty?.();
                void pushDecksToCloud({ silent: true, force: true });
                return local;
            }
            saveLocalDecks(fetched);
            lastCloudFp = fetchedFp;
            return fetched;
        }
        if (player?.customDecks && Array.isArray(player.customDecks)) {
            const cloud = normalizeDecks(player.customDecks);
            if (deckFilledCountDecks(cloud) >= localFilled) {
                saveLocalDecks(cloud);
                lastCloudFp = decksFingerprint(cloud);
                return cloud;
            }
        }
        lastCloudFp = decksFingerprint(local);
        return local;
    }

    function applyDecksFromPlayer(player, opts = {}) {
        // null/undefined = conta sem baralhos → limpa memória e localStorage.
        const raw = Array.isArray(player?.customDecks) ? player.customDecks : [];
        if (!opts.force && $("df-arsenal")?.classList.contains("active")) return false;
        const next = normalizeDecks(raw);
        const prevFp = decksFingerprint(decks);
        const nextFp = decksFingerprint(next);
        if (prevFp === nextFp) {
            saveLocalDecks(decks);
            return false;
        }
        decks = next;
        saveLocalDecks(decks);
        lastCloudFp = decksFingerprint(decks);
        if (!opts.skipRender && $("df-arsenal")?.classList.contains("active")) {
            renderAll();
        }
        return true;
    }

    function catalogSlotReferenceRect() {
        const ref = global.document.querySelector("#df-arsenal-catalog-grid .df-arsenal-slot[data-card]");
        if (!ref) return null;
        const r = ref.getBoundingClientRect();
        if (r.width < 12 || r.height < 12) return null;
        return r;
    }

    function dragGhostSize(slotRect) {
        const ref = catalogSlotReferenceRect();
        const vfx = global.DfArsenalVfx;
        const toSpace = vfx?.viewportRectToGhostSpace || ((r) => r);
        const sr = slotRect ? toSpace(slotRect) : null;
        const rr = ref ? toSpace(ref) : null;
        const w = Math.max(DRAG_GHOST_MIN_W, sr?.width || 0, rr?.width || 0);
        const h = Math.max(DRAG_GHOST_MIN_H, sr?.height || 0, rr?.height || 0);
        return { width: w, height: h };
    }

    function activeDeck() {
        return decks[activeDeckIdx];
    }

    function buildCatalogList() {
        const defs = getCardDefs();
        const visible = defs
            .map((c, index) => ({ c, index }))
            .filter(({ c }) => !c.hidden);

        if (filter === "champion") {
            return visible.filter(({ c }) => c.category === "champion");
        }
        if (filter === "talent") {
            return visible.filter(({ c }) => c.category === "talent" && c.subcategory !== "reaction");
        }
        if (filter === "reaction") {
            return visible.filter(({ c }) => c.subcategory === "reaction");
        }
        return visible.slice().sort((a, b) => a.index - b.index);
    }

    function deckFilledCount(deck) {
        return deck.cards.filter(Boolean).length;
    }

    function firstEmptySlot(deck) {
        return deck.cards.findIndex((c) => !c);
    }

    function deckHasCard(deck, name) {
        return deck.cards.includes(name);
    }

    function toast(msg) {
        const el = $("df-arsenal-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("is-visible");
        global.clearTimeout(toastTimer);
        toastTimer = global.setTimeout(() => el.classList.remove("is-visible"), 2600);
    }

    function faceHtml(name) {
        if (global.DfCardFace?.isComposed?.(name)) {
            const def = global.DfCardFace.resolveDef(name);
            if (def) {
                return `<div class="card-list-face df-card-face-host" data-composed="1">${global.DfCardFace.buildHtml(def)}</div>`;
            }
        }
        if (!global.dfCardListFaceImgHtml) return "";
        let html = global.dfCardListFaceImgHtml(name);
        if (isMobileUi()) {
            html = html.replace('loading="eager"', 'loading="lazy"');
        }
        return html;
    }

    function slotInnerHtml(cardName) {
        return faceHtml(cardName);
    }

    function paintArts(root, names) {
        if (!root || !names?.length) return;
        const list = isMobileUi() ? names.slice(0, 8) : names;
        list.forEach((n) => global.dfPrefetchCardArt?.(n));
        if (!isMobileUi() && global.dfEnsureArtsLoaded) {
            void global.dfEnsureArtsLoaded(names).catch(() => {});
        }
    }

    /**
     * @param {{ keepLayer?: boolean }} [opts] `keepLayer` troca só o conteúdo da
     * carta, sem fechar o overlay — usado na navegação entre cartas ampliadas,
     * onde esconder e reabrir o layer causava um piscar do fundo escurecido.
     */
    function hideZoom(opts = {}) {
        zoomContext = null;
        const layer = $("df-arsenal-zoom-layer");
        const host = $("df-arsenal-zoom-host");
        const art = $("df-arsenal-zoom-art");
        if (layer && !opts.keepLayer) {
            layer.hidden = true;
            layer.classList.remove("is-open");
            layer.setAttribute("aria-hidden", "true");
            const home = $("df-arsenal");
            if (home && layer.parentNode !== home) {
                home.appendChild(layer);
            }
        }
        if (host) {
            host.querySelectorAll(".df-card-face").forEach((el) => el.remove());
            host.classList.remove("has-composed-face");
            host.style.width = "";
            host.style.height = "";
            host.style.maxWidth = "";
            host.style.maxHeight = "";
        }
        if (art) {
            art.hidden = false;
            art.removeAttribute("src");
            art.alt = "";
            art.style.width = "";
            art.style.height = "";
            art.style.maxWidth = "";
            art.style.maxHeight = "";
        }
        if (!opts.keepLayer) {
            global.document.body.classList.remove("df-arsenal-zoom-open");
        }
    }

    function zoomScaleForUi() {
        return isMobileArsenal() ? ZOOM_SCALE_MOBILE : ZOOM_SCALE_DESKTOP;
    }

    function applyZoomSize(refSlot, composed) {
        const host = $("df-arsenal-zoom-host") || $("df-arsenal-zoom-art");
        if (!host) return;

        // Sempre dimensionar em pixels de viewport (layer no body / fixed).
        // Reserva espaço para VOLTAR / ADICIONAR|RETIRAR abaixo da carta.
        const maxH = Math.min(global.innerHeight * 0.72, 640);
        const maxW = Math.min(global.innerWidth * 0.7, 520);
        let h = maxH;
        let w = h * CARD_ASPECT;
        if (w > maxW) {
            w = maxW;
            h = w / CARD_ASPECT;
        }
        if (!composed && refSlot) {
            const r = refSlot.getBoundingClientRect();
            if (r.width >= 8 && r.height >= 8) {
                const scale = zoomScaleForUi();
                let sw = Math.round(r.width * scale);
                let sh = Math.round(r.height * scale);
                if (sh > maxH) {
                    const f = maxH / sh;
                    sh = maxH;
                    sw = Math.round(sw * f);
                }
                if (sw > maxW) {
                    const f = maxW / sw;
                    sw = maxW;
                    sh = Math.round(sh * f);
                }
                // Se o slot está dentro do canvas escalado, rect já é viewport —
                // mas o host no body também é viewport: usar o maior entre
                // escala do slot e o porte desktop.
                if (sw >= w * 0.85 && sh >= h * 0.85) {
                    w = sw;
                    h = sh;
                }
            }
        }
        host.style.width = `${Math.round(w)}px`;
        host.style.height = `${Math.round(h)}px`;
        host.style.maxWidth = `${Math.round(w)}px`;
        host.style.maxHeight = `${Math.round(h)}px`;
    }

    function mountZoomLayerOnBody(layer) {
        if (!layer) return;
        if (layer.parentNode !== global.document.body) {
            global.document.body.appendChild(layer);
        }
    }

    /* ============================================================
     * Navegação da carta ampliada (setas / teclado / arraste)
     *
     * A sequência é sempre a MESMA que o jogador está vendo: no catálogo
     * respeita o filtro ativo (`catalogCards`), no baralho respeita a ordem
     * dos slots preenchidos. Assim ninguém precisa fechar e reabrir o zoom
     * para conhecer a carta seguinte.
     * ============================================================ */

    /** Sequência navegável do lado atual: [{ card, deckSlot }]. */
    function zoomSequence(side) {
        if (side === "deck") {
            const deck = decks[activeDeckIdx];
            if (!deck) return [];
            return deck.cards
                .map((name, slot) => (name ? { card: name, deckSlot: slot } : null))
                .filter(Boolean);
        }
        // Catálogo: lista completa do filtro, não só a página visível.
        if (!catalogCards.length) catalogCards = buildCatalogList();
        return catalogCards
            .filter((e) => e?.c?.name)
            .map((e) => ({ card: e.c.name, deckSlot: null }));
    }

    function zoomCanNavigate() {
        if (!zoomContext?.card) return false;
        return zoomSequence(zoomContext.side).length > 1;
    }

    /** Move `delta` posições na sequência, circulando nas pontas. */
    function zoomStep(delta) {
        if (!zoomContext?.card) return;
        const side = zoomContext.side;
        const seq = zoomSequence(side);
        if (seq.length < 2) return;

        let cur = -1;
        if (side === "deck" && zoomContext.deckSlot != null) {
            cur = seq.findIndex((e) => e.deckSlot === zoomContext.deckSlot);
        }
        if (cur < 0) cur = seq.findIndex((e) => e.card === zoomContext.card);
        if (cur < 0) cur = 0;

        const nextIdx = (cur + delta + seq.length) % seq.length;
        const next = seq[nextIdx];
        if (!next) return;

        // Catálogo: se a carta caiu em outra página, acompanha a paginação para
        // o grid atrás do zoom continuar coerente com o que está na tela.
        let refSlot = null;
        if (side === "catalog") {
            const page = Math.floor(nextIdx / PAGE_SIZE);
            if (page !== catalogPage) {
                catalogPage = page;
                renderCatalogGrid();
            }
        }
        const gridId = side === "deck" ? "df-arsenal-deck-grid" : "df-arsenal-catalog-grid";
        const grid = $(gridId);
        if (grid) {
            const sel = side === "deck"
                ? `.df-arsenal-slot[data-slot="${next.deckSlot}"]`
                : `.df-arsenal-slot[data-card="${cssEscape(next.card)}"]`;
            refSlot = grid.querySelector(sel);
        }

        const dirClass = delta > 0 ? "is-nav-next" : "is-nav-prev";
        showZoom(side, next.card, refSlot, next.deckSlot, { keepLayer: true });
        // Pista visual da direção; a classe se remove sozinha ao fim da animação.
        const dialog = $("df-arsenal-zoom-dialog");
        if (dialog) {
            dialog.classList.remove("is-nav-next", "is-nav-prev");
            void dialog.offsetWidth;
            dialog.classList.add(dirClass);
            global.setTimeout(() => dialog.classList.remove(dirClass), 260);
        }
        syncZoomNavButtons();
    }

    function cssEscape(v) {
        const s = String(v);
        if (global.CSS?.escape) return global.CSS.escape(s);
        return s.replace(/["\\]/g, "\\$&");
    }

    function syncZoomNavButtons() {
        const on = zoomCanNavigate();
        for (const id of ["df-arsenal-zoom-prev", "df-arsenal-zoom-next"]) {
            const btn = $(id);
            if (!btn) continue;
            btn.hidden = !on;
            btn.disabled = !on;
        }
    }

    /** Arraste horizontal para trocar de carta (mobile). */
    function wireZoomSwipe() {
        const dialog = $("df-arsenal-zoom-dialog");
        if (!dialog || dialog.dataset.dfSwipeWired === "1") return;
        dialog.dataset.dfSwipeWired = "1";
        const SWIPE_MIN_PX = 48;
        const DOMINANCE = 1.5;
        let sx = 0;
        let sy = 0;
        let tracking = false;

        dialog.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            // Botões tratam o próprio clique.
            if (e.target?.closest?.("button")) return;
            tracking = true;
            sx = e.clientX;
            sy = e.clientY;
        }, { passive: true });

        dialog.addEventListener("pointerup", (e) => {
            if (!tracking) return;
            tracking = false;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            if (Math.abs(dx) < SWIPE_MIN_PX) return;
            if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return;
            // Arrastar para a esquerda avança (carta vem da direita).
            zoomStep(dx < 0 ? 1 : -1);
        }, { passive: true });

        dialog.addEventListener("pointercancel", () => { tracking = false; }, { passive: true });
    }

    function showZoom(side, cardName, refSlot, deckSlot, opts = {}) {
        const c = cardByName(cardName);
        if (!c) return;
        const layer = $("df-arsenal-zoom-layer");
        const host = $("df-arsenal-zoom-host") || $("df-arsenal-zoom-art");
        const art = $("df-arsenal-zoom-art");
        if (!layer || !host) return;
        hideZoom({ keepLayer: !!opts.keepLayer });
        mountZoomLayerOnBody(layer);

        let resolvedSlot = deckSlot;
        if (resolvedSlot == null && side === "deck" && refSlot?.dataset?.slot != null) {
            resolvedSlot = Number(refSlot.dataset.slot);
        }
        zoomContext = {
            side: side || "catalog",
            card: cardName,
            deckSlot: Number.isFinite(resolvedSlot) ? resolvedSlot : null,
            mode: "add",
        };
        syncZoomActionButtons();

        // Limpa face composta anterior
        host.querySelectorAll?.(".df-card-face").forEach((el) => el.remove());
        host.classList?.remove("has-composed-face");

        if (global.DfCardFace?.isComposed?.(c) && host !== art) {
            if (art) {
                art.hidden = true;
                art.removeAttribute("src");
            }
            global.DfCardFace.mount(host, c, { power: c.power });
            host.classList.add("df-arsenal-zoom-art");
            layer.hidden = false;
            layer.classList.add("is-open");
            layer.setAttribute("aria-hidden", "false");
            global.document.body.classList.add("df-arsenal-zoom-open");
            wireZoomSwipe();
            syncZoomNavButtons();
            const slotRef = refSlot;
            if (slotRef) {
                global.requestAnimationFrame(() => applyZoomSize(slotRef, true));
            } else {
                global.requestAnimationFrame(() => applyZoomSize(null, true));
            }
            return;
        }

        const urls = global.dfResolveCardArtUrls?.(cardName) || [];
        const src = urls[0] || "";
        if (art) {
            art.hidden = false;
            if (src) {
                art.src = src;
                art.alt = c.name;
                paintArts(layer, [c.name]);
            } else {
                art.removeAttribute("src");
                art.alt = c.name;
            }
        }
        layer.hidden = false;
        layer.classList.add("is-open");
        layer.setAttribute("aria-hidden", "false");
        global.document.body.classList.add("df-arsenal-zoom-open");
        wireZoomSwipe();
        syncZoomNavButtons();
        const slotRef = refSlot;
        if (slotRef) {
            global.requestAnimationFrame(() => applyZoomSize(slotRef, false));
        } else {
            global.requestAnimationFrame(() => applyZoomSize(null, false));
        }
    }

    function hideDragGhost() {
        const ghost = $("df-arsenal-drag-ghost");
        if (!ghost) return;
        global.DfArsenalVfx?.killGhost?.(ghost);
        global.DfArsenalVfx?.resetGhostMount?.();
        ghost.hidden = true;
        ghost.setAttribute("aria-hidden", "true");
        ghost.innerHTML = "";
        ghost.style.width = "";
        ghost.style.height = "";
        ghost.style.left = "";
        ghost.style.top = "";
        ghost.style.position = "";
        ghost.style.transform = "";
        ghost.style.zIndex = "";
        const home = $("df-arsenal");
        if (home && ghost.parentNode !== home) {
            home.appendChild(ghost);
        }
    }

    function restorePtrSlotVisibility() {
        if (ptrState?.slot) ptrState.slot.style.visibility = "";
    }

    function spawnDragGhost() {
        if (!ptrState?.slot || !ptrState.card) return;
        const ghost = $("df-arsenal-drag-ghost");
        if (!ghost) return;
        const face = ptrState.slot.querySelector(".card-list-face");
        ghost.replaceChildren();
        if (face instanceof HTMLImageElement && face.complete && face.naturalWidth > 0) {
            const clone = face.cloneNode(true);
            clone.className = "df-arsenal-drag-ghost-art";
            clone.removeAttribute("loading");
            clone.draggable = false;
            ghost.appendChild(clone);
        } else {
            const urls = global.dfResolveCardArtUrls?.(ptrState.card) || [];
            const src = face?.getAttribute("src") || urls[0] || "";
            if (src) {
                const img = global.document.createElement("img");
                img.className = "df-arsenal-drag-ghost-art";
                img.src = src;
                img.alt = "";
                img.draggable = false;
                img.decoding = "sync";
                ghost.appendChild(img);
            } else {
                const fb = global.document.createElement("div");
                fb.className = "df-arsenal-drag-ghost-art df-arsenal-drag-ghost-fallback";
                ghost.appendChild(fb);
            }
        }
        ghost.hidden = false;
        ghost.setAttribute("aria-hidden", "false");
        const r = ptrState.slot.getBoundingClientRect();
        const ghostSize = dragGhostSize(r);
        ptrState.sourceRect = { ...r, width: ghostSize.width, height: ghostSize.height };
        global.DfArsenalVfx?.placeGhost?.(
            ghost,
            ptrState.lastX || r.left + r.width / 2,
            ptrState.lastY || r.top + r.height / 2,
            ghostSize.width,
            ghostSize.height
        );
        ptrState.slot.style.visibility = "hidden";
        ptrState.ghostEl = ghost;
    }

    function moveDragGhost(clientX, clientY) {
        if (!ptrState?.ghostEl) return;
        global.DfArsenalVfx?.moveGhost?.(ptrState.ghostEl, clientX, clientY);
    }

    function clearPtrHighlights() {
        if (ptrState?.highlightTarget) {
            ptrState.highlightTarget.classList.remove("is-drop-target", "is-dragging");
            ptrState.highlightTarget = null;
        }
        if (ptrState?.highlightPane) {
            $(ptrState.highlightPane)?.classList.remove("is-drag-over");
            ptrState.highlightPane = null;
        }
    }

    function updateDragHighlights(clientX, clientY) {
        if (!ptrState || (ptrState.mode !== "drag" && ptrState.mode !== "armed")) return;
        const target = slotUnderPoint(clientX, clientY);
        let paneId = "";
        if (ptrState.side === "catalog") {
            paneId = "df-arsenal-builder-pane";
        } else if (ptrState.side === "deck"
            && isInsidePane(clientX, clientY, "df-arsenal-catalog-pane")) {
            paneId = "df-arsenal-catalog-pane";
        }

        const prevTarget = ptrState.highlightTarget;
        const dropSlot = target?.dataset.side === "deck" ? target : null;
        if (dropSlot !== prevTarget) {
            prevTarget?.classList.remove("is-drop-target", "is-dragging");
            dropSlot?.classList.add("is-drop-target");
            ptrState.highlightTarget = dropSlot || null;
        }

        const prevPane = ptrState.highlightPane;
        if (paneId !== prevPane) {
            if (prevPane) $(prevPane)?.classList.remove("is-drag-over");
            if (paneId) $(paneId)?.classList.add("is-drag-over");
            ptrState.highlightPane = paneId || null;
        }
    }

    function scheduleDragHighlights(clientX, clientY) {
        if (highlightRaf) return;
        highlightRaf = global.requestAnimationFrame(() => {
            highlightRaf = 0;
            if (!ptrState) return;
            updateDragHighlights(clientX, clientY);
        });
    }

    function slotUnderPoint(x, y) {
        const el = global.document.elementFromPoint(x, y);
        return el?.closest?.(".df-arsenal-slot") || null;
    }

    function isInsidePane(x, y, paneId) {
        const el = global.document.elementFromPoint(x, y);
        return !!el?.closest?.(`#${paneId}`);
    }

    function findFirstEmptyDeckSlotEl() {
        return global.document.querySelector("#df-arsenal-deck-grid .df-arsenal-slot.is-empty[data-side='deck']");
    }

    function findCatalogSlotEl(cardName) {
        if (!cardName) return null;
        const grid = $("df-arsenal-catalog-grid");
        if (!grid) return null;
        return Array.from(grid.querySelectorAll(".df-arsenal-slot[data-card]"))
            .find((el) => el.dataset.card === cardName) || null;
    }

    function resolveDrop(clientX, clientY) {
        if (!ptrState?.card) return { ok: false };
        const target = slotUnderPoint(clientX, clientY);
        if (ptrState.side === "catalog") {
            if (ptrState.slot.classList.contains("is-in-deck")) return { ok: false };
            if (target?.dataset.side === "deck") {
                return { ok: true, kind: "add", targetEl: target, slot: Number(target.dataset.slot) };
            }
            if (isInsidePane(clientX, clientY, "df-arsenal-builder-pane")) {
                const empty = findFirstEmptyDeckSlotEl();
                if (!empty) return { ok: false, reason: "full" };
                return { ok: true, kind: "add", targetEl: empty, slot: Number(empty.dataset.slot) };
            }
            return { ok: false };
        }
        if (ptrState.side === "deck" && ptrState.deckSlot != null) {
            if (isInsidePane(clientX, clientY, "df-arsenal-catalog-pane") || target?.dataset.side === "catalog") {
                const catEl = findCatalogSlotEl(ptrState.card) || $("df-arsenal-catalog-pane");
                return { ok: true, kind: "remove", targetEl: catEl, deckSlot: ptrState.deckSlot };
            }
            if (target?.dataset.side === "deck" && target !== ptrState.slot) {
                return {
                    ok: true,
                    kind: "swap",
                    targetEl: target,
                    from: ptrState.deckSlot,
                    to: Number(target.dataset.slot),
                };
            }
            return { ok: false };
        }
        return { ok: false };
    }

    function settleSlotEl(drop) {
        if (!drop.ok) return null;
        if (drop.kind === "add" && Number.isFinite(drop.slot)) {
            return global.document.querySelector(
                `#df-arsenal-deck-grid .df-arsenal-slot[data-side='deck'][data-slot='${drop.slot}']`
            );
        }
        if (drop.kind === "remove" && ptrState?.card) {
            return findCatalogSlotEl(ptrState.card);
        }
        if (drop.kind === "swap" && Number.isFinite(drop.to)) {
            return global.document.querySelector(
                `#df-arsenal-deck-grid .df-arsenal-slot[data-side='deck'][data-slot='${drop.to}']`
            );
        }
        return drop.targetEl || null;
    }

    function applyDrop(drop) {
        if (!ptrState?.card) return false;
        if (drop.kind === "add") {
            return addCardToDeck(ptrState.card, drop.slot, { skipRender: true });
        }
        if (drop.kind === "remove") {
            removeCardFromDeck(drop.deckSlot, { skipRender: true });
            return true;
        }
        if (drop.kind === "swap") {
            const deck = activeDeck();
            if (!deck) return false;
            const fromIdx = drop.from;
            const toIdx = drop.to;
            if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return false;
            const target = global.document.querySelector(`#df-arsenal-deck-grid .df-arsenal-slot[data-side='deck'][data-slot='${toIdx}']`);
            if (!target) return false;
            if (!target.dataset.card) {
                deck.cards[toIdx] = ptrState.card;
                deck.cards[fromIdx] = null;
            } else {
                const other = target.dataset.card;
                deck.cards[fromIdx] = other;
                deck.cards[toIdx] = ptrState.card;
            }
            return true;
        }
        return false;
    }

    function updateDeckSaveBtn() {
        const deck = activeDeck();
        const saveBtn = $("df-arsenal-save-btn");
        if (saveBtn && deck) {
            const filled = deckFilledCount(deck);
            saveBtn.disabled = filled < MIN_DECK_SAVE_SIZE || filled > DECK_SIZE;
        }
    }

    function setCatalogInDeck(cardName, inDeck) {
        const grid = $("df-arsenal-catalog-grid");
        if (!grid || !cardName) return;
        grid.querySelectorAll(".df-arsenal-slot[data-card]").forEach((el) => {
            if (el.dataset.card === cardName) el.classList.toggle("is-in-deck", inDeck);
        });
    }

    function patchDeckSlot(slotIdx, cardName) {
        const el = global.document.querySelector(
            `#df-arsenal-deck-grid .df-arsenal-slot[data-side='deck'][data-slot='${slotIdx}']`
        );
        if (!el) return;
        if (!cardName) {
            el.className = "df-arsenal-slot is-empty";
            el.removeAttribute("data-card");
            el.removeAttribute("role");
            el.innerHTML = "";
            return;
        }
        const c = cardByName(cardName);
        el.className = `df-arsenal-slot ${slotTypeClass(c)}`;
        el.dataset.card = cardName;
        el.setAttribute("role", "button");
        el.innerHTML = slotInnerHtml(cardName);
        global.dfPrefetchCardArt?.(cardName);
    }

    function patchGridsAfterDrop(drop) {
        const deck = activeDeck();
        if (!deck || !drop.ok) return;
        const card = ptrState?.card;
        if (drop.kind === "add" && Number.isFinite(drop.slot)) {
            patchDeckSlot(drop.slot, card);
            setCatalogInDeck(card, true);
        } else if (drop.kind === "remove" && Number.isFinite(drop.deckSlot)) {
            patchDeckSlot(drop.deckSlot, null);
            setCatalogInDeck(card, false);
        } else if (drop.kind === "swap") {
            patchDeckSlot(drop.from, deck.cards[drop.from]);
            patchDeckSlot(drop.to, deck.cards[drop.to]);
        }
        fixSlotFaceSizing($("df-arsenal-deck-grid"));
        updateDeckSaveBtn();
    }

    function onGridClick(e) {
        if (!$("df-arsenal")?.classList.contains("active")) return;
        if ($("df-arsenal-zoom-layer")?.classList.contains("is-open")) return;

        const slot = e.target.closest?.(".df-arsenal-slot");
        if (!slot?.dataset.card) return;
        e.preventDefault();
        e.stopPropagation();
        const side = slot.dataset.side || "";
        const card = slot.dataset.card;
        const deckSlot = side === "deck" && slot.dataset.slot != null ? Number(slot.dataset.slot) : null;
        showZoom(side, card, slot, deckSlot);
    }

    function wireSlotClick(root) {
        if (!root || root.dataset.dfArsenalClick === "1") return;
        root.dataset.dfArsenalClick = "1";
        root.addEventListener("click", onGridClick);
    }

    function updateCatalogCount() {
        const el = $("df-arsenal-catalog-count");
        if (!el) return;
        const n = catalogCards.length;
        el.textContent = `${n} ${n === 1 ? "carta" : "cartas"}`;
    }

    function renderCatalogGrid() {
        catalogCards = buildCatalogList();
        updateCatalogCount();
        const totalPages = Math.max(1, Math.ceil(catalogCards.length / PAGE_SIZE));
        if (catalogPage >= totalPages) catalogPage = totalPages - 1;
        if (catalogPage < 0) catalogPage = 0;

        const start = catalogPage * PAGE_SIZE;
        const pageItems = catalogCards.slice(start, start + PAGE_SIZE);
        const grid = $("df-arsenal-catalog-grid");
        if (!grid) return;

        const deck = activeDeck();
        const slots = Array.from({ length: PAGE_SIZE }, (_, i) => {
            const entry = pageItems[i];
            if (!entry) {
                return `<div class="df-arsenal-slot is-empty" data-side="catalog" data-slot="${i}"></div>`;
            }
            const c = entry.c;
            const inDeck = deck && deckHasCard(deck, c.name);
            const inDeckCls = inDeck ? " is-in-deck" : "";
            return `<div class="df-arsenal-slot ${slotTypeClass(c)}${inDeckCls}" data-side="catalog" data-slot="${i}" data-card="${escapeHtml(c.name)}" role="button" tabindex="0" aria-label="${escapeHtml(c.name)}">
                ${slotInnerHtml(c.name)}
            </div>`;
        });
        grid.innerHTML = slots.join("");
        paintArts(grid, pageItems.map((e) => e.c.name));
        fixSlotFaceSizing(grid);
        const pageNames = pageItems.map((e) => e?.c?.name).filter(Boolean);
        if (pageNames.length && window.dfEnsureArtsLoaded) {
            void window.dfEnsureArtsLoaded(pageNames);
        }

        const label = $("df-arsenal-page-label");
        if (label) label.textContent = `PAGE ${catalogPage + 1}/${totalPages}`;
        const prev = $("df-arsenal-page-prev");
        const next = $("df-arsenal-page-next");
        if (prev) prev.disabled = catalogPage <= 0;
        if (next) next.disabled = catalogPage >= totalPages - 1;
    }

    function renderDeckGrid() {
        const deck = decks[activeDeckIdx];
        const grid = $("df-arsenal-deck-grid");
        if (!deck || !grid) return;

        const nameInput = $("df-arsenal-deck-name");
        if (nameInput && global.document.activeElement !== nameInput) {
            nameInput.value = deck.name;
        }

        grid.innerHTML = deck.cards.map((cardName, i) => {
            if (!cardName) {
                return `<div class="df-arsenal-slot is-empty" data-side="deck" data-slot="${i}"></div>`;
            }
            const c = cardByName(cardName);
            return `<div class="df-arsenal-slot ${slotTypeClass(c)}" data-side="deck" data-slot="${i}" data-card="${escapeHtml(cardName)}" role="button" tabindex="0">
                ${slotInnerHtml(cardName)}
            </div>`;
        }).join("");
        paintArts(grid, deck.cards.filter(Boolean));
        fixSlotFaceSizing(grid);

        const saveBtn = $("df-arsenal-save-btn");
        if (saveBtn) {
            updateDeckSaveBtn();
        }

        document.querySelectorAll(".df-arsenal-deck-tab").forEach((btn) => {
            btn.classList.toggle("selected", Number(btn.dataset.deck) === activeDeckIdx);
        });
    }

    function renderDeckTabs() {
        const host = $("df-arsenal-deck-tabs");
        if (!host) return;
        host.innerHTML = Array.from({ length: DECK_COUNT }, (_, i) =>
            `<button type="button" class="df-arsenal-deck-tab${i === activeDeckIdx ? " selected" : ""}" data-deck="${i}" role="tab" aria-label="Baralho ${i + 1}">${i + 1}</button>`
        ).join("");
    }

    function fixSlotFaceSizing(grid) {
        if (!grid) return;
        grid.querySelectorAll(".df-arsenal-slot[data-card] .card-list-face").forEach((img) => {
            img.removeAttribute("width");
            img.removeAttribute("height");
            img.style.removeProperty("width");
            img.style.removeProperty("height");
            img.style.removeProperty("max-width");
            img.style.removeProperty("max-height");
            img.style.removeProperty("transform");
        });
        void grid.offsetHeight;
    }

    function relayoutArsenalGrids() {
        fixSlotFaceSizing($("df-arsenal-catalog-grid"));
        fixSlotFaceSizing($("df-arsenal-deck-grid"));
        global.requestAnimationFrame(() => {
            fixSlotFaceSizing($("df-arsenal-catalog-grid"));
            fixSlotFaceSizing($("df-arsenal-deck-grid"));
        });
    }

    function renderAll() {
        renderCatalogGrid();
        renderDeckTabs();
        renderDeckGrid();
        if (isMobileArsenal()) {
            global.requestAnimationFrame(() => relayoutArsenalGrids());
        }
    }

    function restoreHubAfterArsenal() {
        const hub = $("df-hub-splash-layer");
        const menu = $("df-menu-splash-layer");
        if (hub) {
            hub.setAttribute("aria-hidden", "false");
            hub.style.removeProperty("display");
            hub.style.removeProperty("visibility");
        }
        if (menu) {
            menu.style.removeProperty("display");
            menu.style.removeProperty("visibility");
        }
        global.dfSyncMobileBackdrop?.();
        global.dfPlayHubVideo?.();
    }

    function showArsenalShell() {
        $("play-menu")?.classList.remove("active");
        $("main")?.classList.remove("active");
        $("df-play-mode")?.classList.remove("active");
        $("df-training-setup")?.classList.remove("active");
        $("hero-select")?.classList.remove("active");
        global.document.body.classList.remove("df-training-open");
        const hub = $("df-hub-splash-layer");
        if (hub) hub.setAttribute("aria-hidden", "true");
        global.document.body.classList.add("df-arsenal-open");
        $("df-arsenal")?.classList.add("active");
        global.DfMobileImmersive?.dismissTouchBlockers?.();
        global.dfPauseHubBackdrop?.();
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
        global.__dfMenuMusicSync?.();
    }

    function hideArsenalShell() {
        $("df-arsenal")?.classList.remove("active");
        global.document.body.classList.remove("df-arsenal-open");
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
    }

    function persistDraftToDeck() {
        const deck = decks[activeDeckIdx];
        const nameInput = $("df-arsenal-deck-name");
        if (deck && nameInput) {
            deck.name = String(nameInput.value || "").trim() || `Baralho ${activeDeckIdx + 1}`;
        }
    }

    function scheduleCloudDecksSave() {
        if (!global.DfAuthClient?.getToken?.()) return;
        global.clearTimeout(cloudSaveTimer);
        cloudSaveTimer = global.setTimeout(() => {
            void pushDecksToCloud({ silent: true });
        }, CLOUD_SAVE_DEBOUNCE_MS);
    }

    async function pushDecksToCloud(opts = {}) {
        persistDraftToDeck();
        saveLocalDecks(decks);
        if (!global.DfAuthClient?.getToken?.()) return false;
        const fp = decksFingerprint(decks);
        if (fp === lastCloudFp && !opts.force) return true;
        try {
            await global.DfAuthClient.saveDecksToServer?.(decks);
            lastCloudFp = fp;
            global.DfAuthClient?.clearArsenalSessionDirty?.();
            global.DfAuthClient?.clearLocalProfileDirty?.();
            if (!opts.silent) toast("Baralhos sincronizados com a conta.");
            return true;
        } catch (e) {
            if (!opts.silent) {
                const msg = e?.code === "NETWORK_ERROR"
                    ? "Sem conexão — alterações na fila para enviar depois."
                    : "Não foi possível sincronizar os baralhos agora.";
                toast(msg);
            }
            return false;
        }
    }

    function markDecksDirty() {
        saveLocalDecks(decks);
        global.DfAuthClient?.patchCachedPlayerFields?.({ customDecks: decks });
        global.DfAuthClient?.markArsenalSessionDirty?.();
        scheduleCloudDecksSave();
    }

    function switchDeck(idx) {
        if (idx < 0 || idx >= DECK_COUNT || idx === activeDeckIdx) return;
        persistDraftToDeck();
        hideZoom();
        activeDeckIdx = idx;
        renderAll();
    }

    function addCardToDeck(name, preferredSlot, opts = {}) {
        const deck = decks[activeDeckIdx];
        const c = cardByName(name);
        if (!deck || !c || c.hidden) return false;
        if (deckHasCard(deck, name)) {
            if (!opts.skipRender) toast("Esta carta já está no baralho.");
            return false;
        }
        let slot = preferredSlot;
        if (slot == null || slot < 0 || slot >= DECK_SIZE || deck.cards[slot]) {
            slot = firstEmptySlot(deck);
        }
        if (slot < 0) {
            if (!opts.skipRender) toast("Baralho cheio (24 cartas).");
            return false;
        }
        deck.cards[slot] = name;
        if (!opts.skipRender) {
            patchDeckSlot(slot, name);
            setCatalogInDeck(name, true);
            fixSlotFaceSizing($("df-arsenal-deck-grid"));
            updateDeckSaveBtn();
        }
        markDecksDirty();
        return true;
    }

    function removeCardFromDeck(slot, opts = {}) {
        const deck = decks[activeDeckIdx];
        if (!deck || slot < 0 || slot >= DECK_SIZE) return;
        const removed = deck.cards[slot];
        deck.cards[slot] = null;
        if (!opts.skipRender) {
            hideZoom();
            patchDeckSlot(slot, null);
            if (removed) setCatalogInDeck(removed, false);
            fixSlotFaceSizing($("df-arsenal-deck-grid"));
            updateDeckSaveBtn();
        }
        markDecksDirty();
    }

    async function saveActiveDeck() {
        persistDraftToDeck();
        const deck = decks[activeDeckIdx];
        const filled = deckFilledCount(deck);
        if (filled < MIN_DECK_SAVE_SIZE || filled > DECK_SIZE) {
            toast(`Adicione pelo menos ${MIN_DECK_SAVE_SIZE} cartas antes de salvar.`);
            return;
        }
        const btn = $("df-arsenal-save-btn");
        if (btn) btn.classList.add("is-busy");
        const payload = normalizeDecks(decks);
        decks = payload;
        saveLocalDecks(payload);
        lastCloudFp = decksFingerprint(payload);
        let cloudOk = false;
        let saveError = null;
        const loggedIn = !!global.DfAuthClient?.getToken?.();
        try {
            if (loggedIn) {
                const player = await global.DfAuthClient.saveDecksToServer?.(payload);
                if (player) {
                    if (Array.isArray(player.customDecks)) {
                        decks = normalizeDecks(player.customDecks);
                    }
                    saveLocalDecks(decks);
                    lastCloudFp = decksFingerprint(decks);
                    cloudOk = true;
                }
            }
        } catch (e) {
            saveError = e;
            console.warn("[DF Arsenal] save", e);
        } finally {
            if (btn) btn.classList.remove("is-busy");
        }
        if (cloudOk) {
            global.DfAuthClient?.clearArsenalSessionDirty?.();
            global.DfAuthClient?.clearLocalProfileDirty?.();
            toast(`Baralho "${deck.name}" salvo na conta.`);
            void global.DfAuthClient?.liveSyncNow?.(true);
        } else if (loggedIn) {
            const code = saveError?.code || "";
            const msg = code === "NETWORK_ERROR"
                ? `Baralho "${deck.name}" salvo neste aparelho — sem conexão com a nuvem.`
                : code === "PROFILE_CONFLICT"
                    ? `Baralho "${deck.name}" — conflito de sync; tente salvar de novo.`
                    : `Baralho "${deck.name}" salvo neste aparelho — não foi possível enviar à nuvem.`;
            toast(msg);
            global.DfAuthClient?.markArsenalSessionDirty?.();
            void pushDecksToCloud({ silent: true, force: true });
            void global.DfAuthClient?.flushOutbox?.();
        } else {
            toast(`Baralho "${deck.name}" salvo localmente — faça login para sincronizar.`);
        }
    }

    function hideDeleteConfirm() {
        const el = $("df-arsenal-delete-confirm");
        if (el) el.hidden = true;
    }

    function showDeleteConfirm() {
        const el = $("df-arsenal-delete-confirm");
        if (el) el.hidden = false;
    }

    function clearActiveDeck() {
        const deck = decks[activeDeckIdx];
        if (!deck) return;
        hideDeleteConfirm();
        deck.name = `Baralho ${activeDeckIdx + 1}`;
        deck.cards = Array(DECK_SIZE).fill(null);
        const nameInput = $("df-arsenal-deck-name");
        if (nameInput) nameInput.value = deck.name;
        markDecksDirty();
        renderAll();
        toast(`Baralho ${activeDeckIdx + 1} excluído.`);
        void pushDecksToCloud({ silent: true, force: true });
    }

    function wireSlotPointer(root) {
        wireSlotClick(root);
    }

    function wireEvents() {
        if (wired) return;
        wired = true;

        $("btn-arsenal-back")?.addEventListener("click", () => close());

        document.querySelectorAll(".df-arsenal-tab").forEach((btn) => {
            btn.addEventListener("click", () => {
                filter = btn.dataset.filter || "all";
                catalogPage = 0;
                hideZoom();
                document.querySelectorAll(".df-arsenal-tab").forEach((t) => t.classList.toggle("selected", t === btn));
                renderCatalogGrid();
            });
        });

        $("df-arsenal-page-prev")?.addEventListener("click", () => {
            hideZoom();
            if (catalogPage > 0) { catalogPage--; renderCatalogGrid(); }
        });
        $("df-arsenal-page-next")?.addEventListener("click", () => {
            hideZoom();
            const total = Math.max(1, Math.ceil(catalogCards.length / PAGE_SIZE));
            if (catalogPage < total - 1) { catalogPage++; renderCatalogGrid(); }
        });

        $("df-arsenal-deck-tabs")?.addEventListener("click", (e) => {
            const btn = e.target.closest?.(".df-arsenal-deck-tab");
            if (!btn) return;
            switchDeck(Number(btn.dataset.deck));
        });

        $("df-arsenal-save-btn")?.addEventListener("click", () => { void saveActiveDeck(); });
        $("df-arsenal-delete-btn")?.addEventListener("click", () => showDeleteConfirm());
        $("df-arsenal-delete-yes")?.addEventListener("click", () => clearActiveDeck());
        $("df-arsenal-delete-no")?.addEventListener("click", () => hideDeleteConfirm());

        const deckNameInput = $("df-arsenal-deck-name");
        let deckNameBeforeEdit = "";
        deckNameInput?.addEventListener("focus", () => {
            global.dfLockSoftKeyboardLayout?.(true);
            const deck = decks[activeDeckIdx];
            deckNameBeforeEdit = String(deck?.name || "").trim();
        });
        deckNameInput?.addEventListener("blur", () => {
            global.setTimeout(() => global.dfLockSoftKeyboardLayout?.(false), 150);
            persistDraftToDeck();
            const deck = decks[activeDeckIdx];
            const nextName = String(deck?.name || "").trim();
            if (nextName !== deckNameBeforeEdit) {
                markDecksDirty();
            }
        });

        wireSlotPointer($("df-arsenal-catalog-grid"));
        wireSlotPointer($("df-arsenal-deck-grid"));

        const zoomLayer = $("df-arsenal-zoom-layer");
        const closeZoomBackdrop = (e) => {
            if (!zoomLayer?.classList.contains("is-open")) return;
            if (e.target.closest?.("#df-arsenal-zoom-dialog")) return;
            e.preventDefault();
            e.stopPropagation();
            hideZoom();
        };
        zoomLayer?.addEventListener("click", closeZoomBackdrop);

        $("df-arsenal-zoom-back")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideZoom();
        });

        $("df-arsenal-zoom-action")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!zoomContext?.card) return;
            syncZoomActionButtons();
            if (zoomContext.mode === "remove") {
                let slot = zoomContext.deckSlot;
                if (slot == null || slot < 0) slot = findDeckSlotForCard(zoomContext.card);
                if (slot == null || slot < 0) {
                    toast("Carta não está no baralho.");
                    hideZoom();
                    return;
                }
                removeCardFromDeck(slot);
                return;
            }
            const ok = addCardToDeck(zoomContext.card);
            if (ok) hideZoom();
        });

        // Setas de navegação da carta ampliada. stopPropagation evita que o
        // clique chegue ao backdrop do layer, que fecharia o zoom.
        $("df-arsenal-zoom-prev")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoomStep(-1);
        });
        $("df-arsenal-zoom-next")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoomStep(1);
        });

        global.document.addEventListener("keydown", (e) => {
            if (!$("df-arsenal")?.classList.contains("active")) return;
            const zoomOpen = !!$("df-arsenal-zoom-layer")?.classList.contains("is-open");
            if (e.key === "Escape") {
                if (zoomOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    hideZoom();
                }
                return;
            }
            // Direcionais navegam entre cartas ampliadas (desktop). Captura +
            // stopPropagation para não vazar para os controles de partida.
            if (!zoomOpen) return;
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            zoomStep(e.key === "ArrowRight" ? 1 : -1);
        }, true);
    }

    function wireHubEntry() {
        if (hubWired) return;
        hubWired = true;
        $("btn-hub-arsenal")?.addEventListener("click", (e) => {
            e.preventDefault();
            void open({ filter: "champion" });
        });
    }

    async function syncDecksFromCloud() {
        if (!global.DfAuthClient?.getToken?.()) return;
        try {
            const player = await global.DfAuthClient.fetchMe?.();
            if (player && $("df-arsenal")?.classList.contains("active")) {
                applyDecksFromPlayer(player, { force: true });
            }
        } catch (e) { /* offline */ }
    }

    function onProfileDecksSync(player) {
        if (!player) return;
        if ($("df-arsenal")?.classList.contains("active")) return;
        applyDecksFromPlayer(player, { force: true });
    }

    async function open(opts = {}) {
        if (opening) return;
        opening = true;
        try {
            wireEvents();
            wireHubEntry();
            filter = opts.filter || "champion";
            catalogPage = 0;
            hideZoom();

            document.querySelectorAll(".df-arsenal-tab").forEach((t) => {
                t.classList.toggle("selected", t.dataset.filter === filter);
            });

            decks = loadLocalDecks();
            let player = global.DfAuthClient?.getCachedPlayer?.() || null;
            const online = typeof navigator === "undefined" || navigator.onLine !== false;
            if (online && global.DfAuthClient?.getToken?.()) {
                try {
                    // Pull forçado: baralho do outro aparelho (revision maior) antes de montar a UI.
                    player = await Promise.race([
                        global.DfAuthClient.fetchMe?.() || Promise.resolve(player),
                        new Promise((r) => global.setTimeout(() => r(player), 4000)),
                    ]) || player;
                } catch (e) { /* offline — usa cache/local */ }
            }
            decks = decksFromPlayer(player);

            showArsenalShell();

            void global.DfArsenalVfx?.prefetch?.();

            if (isMobileUi()) {
                requestAnimationFrame(() => renderAll());
            } else {
                renderAll();
            }
        } catch (e) {
            console.error("[DF Arsenal] open", e);
            hideArsenalShell();
            toast("Não foi possível abrir o Arsenal.");
        } finally {
            opening = false;
        }
    }

    function close() {
        hideZoom();
        hideDeleteConfirm();
        hideDragGhost();
        global.DfArsenalVfx?.killAll?.();
        global.DfArsenalVfx?.destroyPixi?.();
        clearPtrHighlights();
        ptrState = null;
        persistDraftToDeck();
        const loggedIn = !!global.DfAuthClient?.getToken?.();
        if (loggedIn) {
            saveLocalDecks(decks);
            global.DfAuthClient?.patchCachedPlayerFields?.({ customDecks: decks });
        }

        hideArsenalShell();

        global.clearTimeout(cloudSaveTimer);
        if (loggedIn) {
            void pushDecksToCloud({ silent: true, force: true }).then((ok) => {
                if (ok) {
                    global.DfAuthClient?.clearArsenalSessionDirty?.();
                    global.DfAuthClient?.clearLocalProfileDirty?.();
                    void global.DfAuthClient?.liveSyncNow?.(true);
                } else {
                    // Não limpar dirty nem puxar nuvem — evita apagar Manowar se o push falhou.
                    void global.DfAuthClient?.flushOutbox?.();
                }
            });
        }

        if (typeof global.__dfGameViewApi?.showPlayMenu === "function") {
            global.__dfGameViewApi.showPlayMenu();
        } else if (typeof global.showPlayMenu === "function") {
            global.showPlayMenu();
        } else {
            $("play-menu")?.classList.add("active");
            restoreHubAfterArsenal();
        }

        global.__dfMenuMusicSync?.();
    }

    function boot() {
        wireHubEntry();
    }

    if (global.document) {
        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", boot, { once: true });
        } else {
            boot();
        }
    }

    global.DfArsenal = Object.freeze({
        open,
        close,
        onProfileDecksSync,
        pushDecksToCloud,
        getActiveDeckCards: () => (activeDeck()?.cards || []).filter(Boolean),
        PAGE_SIZE,
        DECK_SIZE,
        MIN_DECK_SAVE_SIZE,
        DECK_COUNT,
        /** Pontos de teste da navegação da carta ampliada (scripts/test-df-arsenal-zoom-nav.mjs). */
        __test: {
            zoomSequence,
            zoomStep,
            zoomCanNavigate,
            getZoomContext: () => zoomContext,
            setZoomContext: (c) => { zoomContext = c ? { mode: "add", ...c } : null; },
            setFilter: (f) => { filter = f; catalogCards = buildCatalogList(); },
            setDecksForTest: (d) => { decks = d; activeDeckIdx = 0; },
        },
    });
})(typeof window !== "undefined" ? window : globalThis);
