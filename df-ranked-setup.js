/**
 * Dragonfall — lobby Rankeado Online (baralho sem objetivo → herói → fila).
 * Telas dedicadas (#df-ranked-setup / #df-ranked-hero-select) — não altera vs IA.
 */
(function (global) {
    "use strict";

    const PREFS_KEY = "df_ranked_setup_prefs_v1";
    const $ = (id) => global.document.getElementById(id);

    let wired = false;
    let state = {
        playerDeckMode: "random",
        playerDeckIdx: 0,
    };

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function loadPrefs() {
        try {
            const raw = global.localStorage?.getItem(PREFS_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p.playerDeckMode === "custom" || p.playerDeckMode === "random") {
                state.playerDeckMode = p.playerDeckMode;
            }
            if (Number.isFinite(p.playerDeckIdx) && p.playerDeckIdx >= 0 && p.playerDeckIdx < 5) {
                state.playerDeckIdx = p.playerDeckIdx;
            }
        } catch (e) { /* */ }
    }

    function savePrefs() {
        try {
            global.localStorage?.setItem(PREFS_KEY, JSON.stringify({
                playerDeckMode: state.playerDeckMode,
                playerDeckIdx: state.playerDeckIdx,
            }));
        } catch (e) { /* */ }
    }

    function toast(msg) {
        const el = $("df-ranked-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("is-visible");
        global.clearTimeout(toast._t);
        toast._t = global.setTimeout(() => el.classList.remove("is-visible"), 2800);
    }

    function setChoice(value) {
        global.document.querySelectorAll("[data-df-ranked-group=\"playerDeck\"]").forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.value === value);
        });
    }

    function renderDeckList() {
        const host = $("df-ranked-deck-list");
        if (!host) return;
        const decks = global.DfTrainingDecks?.listCustomDecksForUi?.() || [];
        const show = state.playerDeckMode === "custom";
        host.hidden = !show;
        if (!show) return;

        const firstPlayable = decks.find((d) => d.playable)?.index ?? -1;
        const current = decks.find((d) => d.index === state.playerDeckIdx);
        if (!current?.playable && firstPlayable >= 0) {
            state.playerDeckIdx = firstPlayable;
        }

        host.innerHTML = decks.map((d) => {
            const sel = d.index === state.playerDeckIdx ? " selected" : "";
            const inc = d.playable ? "" : " is-incomplete";
            const badge = d.complete
                ? `<span class="df-training-deck-badge">24/24</span>`
                : `<span class="df-training-deck-badge warn">${d.filled}/24</span>`;
            return `<button type="button" class="df-training-deck-item${sel}${inc}" data-deck-idx="${d.index}"${d.playable ? "" : " disabled"}>
                <span>${escapeHtml(d.name)}</span>${badge}
            </button>`;
        }).join("");

        host.querySelectorAll(".df-training-deck-item:not([disabled])").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.playerDeckIdx = Number(btn.dataset.deckIdx);
                syncUi();
                savePrefs();
            });
        });
    }

    function syncUi() {
        renderDeckList();
        setChoice(state.playerDeckMode);
        const hint = $("df-ranked-deck-hint");
        if (hint) {
            hint.textContent = state.playerDeckMode === "random"
                ? "Um baralho aleatório com 24 cartas únicas será montado para você."
                : "Escolha um baralho do Arsenal com 10 a 24 cartas.";
        }
        const adv = $("df-ranked-advance");
        if (adv) {
            let ok = true;
            if (state.playerDeckMode === "custom") {
                const decks = global.DfTrainingDecks?.listCustomDecksForUi?.() || [];
                const d = decks.find((x) => x.index === state.playerDeckIdx);
                ok = !!d?.playable;
            }
            adv.disabled = !ok;
        }
    }

    function onChoiceClick(e) {
        const btn = e.target.closest("[data-df-ranked-group]");
        if (!btn) return;
        if (btn.dataset.dfRankedGroup === "playerDeck") {
            state.playerDeckMode = btn.dataset.value === "custom" ? "custom" : "random";
            syncUi();
            savePrefs();
        }
    }

    function resolveDeckNames() {
        const resolved = global.DfTrainingDecks?.resolve?.({
            winPoints: 15,
            aiDifficulty: "hard",
            playerDeckMode: state.playerDeckMode,
            playerDeckIdx: state.playerDeckIdx,
            aiDeckMode: "random",
        });
        if (!resolved?.ok) return null;
        const playerDeck = resolved.decks?.[0];
        if (Array.isArray(playerDeck)) {
            return playerDeck.map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean);
        }
        return null;
    }

    function populateHeroGrid() {
        const grid = $("df-ranked-hero-grid");
        if (!grid) return;
        const heroes = global.DfData?.heroDefs || [];
        grid.innerHTML = "";

        const randomCard = global.document.createElement("div");
        randomCard.className = "hero-card";
        randomCard.dataset.heroId = "__random__";
        randomCard.innerHTML = `<div class="hero-portrait" style="display:flex;align-items:center;justify-content:center;font-size:2.5rem">🎲</div>
            <div class="hero-name">Herói Aleatório</div>
            <div class="hero-ult-type">SURPRESA</div>
            <div class="hero-ult-name">Sorteio</div>
            <div class="hero-ult-desc">Joga com um herói escolhido aleatoriamente entre todos os disponíveis no jogo.</div>`;
        randomCard.addEventListener("click", () => {
            const pool = heroes.filter((h) => h?.id);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            if (pick) void selectHeroAndQueue(pick.id);
        });
        grid.appendChild(randomCard);

        heroes.forEach((h) => {
            if (!h?.id) return;
            const card = global.document.createElement("div");
            card.className = "hero-card";
            card.dataset.heroId = h.id;
            const imgSrc = h.image
                ? (typeof global.dfAssetUrl === "function" ? global.dfAssetUrl(h.image) : h.image)
                : "";
            const img = imgSrc
                ? `<img class="hero-portrait" src="${escapeHtml(imgSrc)}" alt="" draggable="false" loading="eager" decoding="async">`
                : `<div class="hero-portrait"></div>`;
            card.innerHTML = `${img}
                <div class="hero-name">${escapeHtml(h.name || h.id)}</div>
                <div class="hero-ult-type">ULTIMATE</div>
                <div class="hero-ult-name">${escapeHtml(h.ultimateName || "")}</div>
                <div class="hero-ult-desc">${escapeHtml(h.ultimateDesc || "")}</div>`;
            card.addEventListener("click", () => { void selectHeroAndQueue(h.id); });
            grid.appendChild(card);
        });
        try { global.dfRewriteDomAssets?.(grid); } catch (e) { /* */ }
        try {
            heroes.forEach((h) => {
                if (h?.image) global.dfPrefetchArtUrl?.(h.image, "low");
            });
        } catch (e) { /* */ }
    }

    async function selectHeroAndQueue(heroId) {
        const deckNames = global.__DF_RANKED_DECK_NAMES;
        if (!deckNames?.length) {
            toast("Monte o baralho antes de escolher o herói.");
            openSetup();
            return;
        }
        global.__DF_RANKED_HERO_ID = heroId;
        global.__DF_RANKED_PRESET = { heroId, deckCardNames: deckNames };
        $("df-ranked-hero-select")?.classList.remove("active");
        if (typeof global.__dfShowOnlineLobbyAndQueue === "function") {
            await global.__dfShowOnlineLobbyAndQueue();
        }
    }

    function openHeroSelect() {
        $("df-ranked-setup")?.classList.remove("active");
        populateHeroGrid();
        $("df-ranked-hero-select")?.classList.add("active");
        try { global.DfLayout?.syncMenuIllustratedBg?.(); } catch (e) { /* */ }
        try { global.dfSyncMobileBackdrop?.(); } catch (e) { /* */ }
    }

    function advance() {
        const resolved = global.DfTrainingDecks?.resolve?.({
            winPoints: 15,
            aiDifficulty: "hard",
            playerDeckMode: state.playerDeckMode,
            playerDeckIdx: state.playerDeckIdx,
            aiDeckMode: "random",
        });
        if (!resolved?.ok) {
            if (resolved?.error === "INCOMPLETE_DECK") {
                toast("Adicione pelo menos 10 cartas no Arsenal antes de usar este baralho.");
            } else {
                toast("Não foi possível montar o baralho. Tente outra opção.");
            }
            return;
        }
        const names = resolveDeckNames();
        if (!names?.length) {
            toast("Baralho inválido.");
            return;
        }
        savePrefs();
        global.__DF_RANKED_DECK_NAMES = names;
        openHeroSelect();
    }

    function backToPlayMode() {
        $("df-ranked-setup")?.classList.remove("active");
        $("df-ranked-hero-select")?.classList.remove("active");
        try { global.document.body.classList.remove("df-training-open"); } catch (e) { /* */ }
        global.__DF_RANKED_DECK_NAMES = null;
        global.__DF_RANKED_HERO_ID = null;
        global.__DF_RANKED_PRESET = null;
        if (typeof global.__dfGameViewApi?.openPlayModeSelect === "function") {
            void global.__dfGameViewApi.openPlayModeSelect();
        } else {
            $("df-play-mode")?.classList.add("active");
        }
    }

    function wire() {
        if (wired) return;
        wired = true;
        $("df-ranked-setup")?.addEventListener("click", onChoiceClick);
        $("df-ranked-advance")?.addEventListener("click", () => advance());
        $("df-ranked-back")?.addEventListener("click", backToPlayMode);
        $("btn-ranked-hero-back")?.addEventListener("click", () => {
            $("df-ranked-hero-select")?.classList.remove("active");
            openSetup();
        });
    }

    function revealPanelsNow() {
        global.document.querySelectorAll("#df-ranked-setup .df-training-panel").forEach((p) => {
            p.classList.remove("is-reveal");
            p.style.opacity = "1";
            p.style.transform = "";
        });
    }

    function openSetup() {
        wire();
        loadPrefs();
        ["main", "play-menu", "df-play-mode", "online-lobby", "hero-select",
            "df-training-setup", "df-ranked-hero-select"].forEach((id) => {
            $(id)?.classList.remove("active");
        });
        syncUi();
        $("df-ranked-setup")?.classList.add("active");
        // Painéis nascem com .is-reveal (opacity:0) — igual ao Treino, revelar na abertura.
        revealPanelsNow();
        try {
            global.document.documentElement.setAttribute("data-df-menu-bg", "training");
        } catch (e) { /* */ }
        try {
            global.document.body.classList.add("df-training-open");
        } catch (e) { /* */ }
        try { global.DfLayout?.syncMenuIllustratedBg?.(); } catch (e) { /* */ }
        try { global.dfSyncMobileBackdrop?.(); } catch (e) { /* */ }
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
    }

    global.DfRankedSetup = {
        open: openSetup,
        openHeroSelect,
        getPreset: () => global.__DF_RANKED_PRESET || null,
    };
})(typeof window !== "undefined" ? window : globalThis);
