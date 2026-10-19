/**
 * Dragonfall — lobby do Modo Jogar vs IA (objetivo, baralho do jogador).
 * IA: sempre Difícil + baralho aleatório de 24 cartas (pedido do autor).
 */
(function (global) {
    "use strict";

    const AI_DIFF_STORAGE = "dragonfall:aiDifficulty";
    const PREFS_KEY = "df_training_setup_prefs_v1";

    const $ = (id) => global.document.getElementById(id);

    let wired = false;
    let state = {
        winPoints: 15,
        aiDifficulty: "hard",
        playerDeckMode: "random",
        playerDeckIdx: 0,
        aiDeckMode: "random",
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
            if (p.winPoints === 10 || p.winPoints === 15) state.winPoints = p.winPoints;
            if (p.playerDeckMode === "custom" || p.playerDeckMode === "random") state.playerDeckMode = p.playerDeckMode;
            if (Number.isFinite(p.playerDeckIdx) && p.playerDeckIdx >= 0 && p.playerDeckIdx < 5) {
                state.playerDeckIdx = p.playerDeckIdx;
            }
        } catch (e) { /* */ }
        state.aiDifficulty = "hard";
        state.aiDeckMode = "random";
    }

    function savePrefs() {
        try {
            global.localStorage?.setItem(PREFS_KEY, JSON.stringify({
                winPoints: state.winPoints,
                playerDeckMode: state.playerDeckMode,
                playerDeckIdx: state.playerDeckIdx,
                aiDifficulty: "hard",
                aiDeckMode: "random",
            }));
        } catch (e) { /* */ }
    }

    function toast(msg) {
        const el = $("df-training-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("is-visible");
        global.clearTimeout(toast._t);
        toast._t = global.setTimeout(() => el.classList.remove("is-visible"), 2800);
    }

    function setChoice(group, value) {
        global.document.querySelectorAll(`[data-df-training-group="${group}"]`).forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.value === value);
        });
    }

    function renderDeckList() {
        const host = $("df-training-deck-list");
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

    function selectedPlayerDeck() {
        if (state.playerDeckMode !== "custom") return null;
        const decks = global.DfTrainingDecks?.listCustomDecksForUi?.() || [];
        return decks.find((d) => d.index === state.playerDeckIdx) || null;
    }

    function syncUi() {
        renderDeckList();
        const selectedDeck = selectedPlayerDeck();

        state.aiDifficulty = "hard";
        state.aiDeckMode = "random";

        setChoice("winPoints", String(state.winPoints));
        setChoice("playerDeck", state.playerDeckMode);

        const hint = $("df-training-deck-hint");
        if (hint) {
            if (state.playerDeckMode === "custom") {
                hint.textContent = selectedDeck?.playable
                    ? `Seu baralho tem ${selectedDeck.filled} cartas (permitido: 10 a 24).`
                    : "O baralho precisa ter no mínimo 10 cartas. Edite no Arsenal.";
            } else {
                hint.textContent = "Um baralho aleatório com 24 cartas únicas será montado para você.";
            }
        }

        const advance = $("df-training-advance");
        if (advance) {
            let ok = true;
            if (state.playerDeckMode === "custom") {
                const decks = global.DfTrainingDecks?.listCustomDecksForUi?.() || [];
                const pick = decks.find((d) => d.index === state.playerDeckIdx);
                ok = !!(pick && pick.playable);
            }
            advance.disabled = !ok;
        }
    }

    function onChoiceClick(e) {
        const btn = e.target.closest?.("[data-df-training-group]");
        if (!btn || btn.disabled) return;
        const group = btn.dataset.dfTrainingGroup;
        const value = btn.dataset.value;
        if (group === "winPoints") state.winPoints = value === "10" ? 10 : 15;
        if (group === "playerDeck") state.playerDeckMode = value === "custom" ? "custom" : "random";
        syncUi();
        savePrefs();
    }

    function revealPanelsNow() {
        global.document.querySelectorAll("#df-training-setup .df-training-panel").forEach((p) => {
            p.classList.remove("is-reveal");
            p.style.opacity = "1";
            p.style.transform = "";
        });
    }

    async function animateIn() {
        const panels = global.document.querySelectorAll("#df-training-setup .df-training-panel");
        revealPanelsNow();
        let gsap = global.gsap || null;
        if (!gsap && global.DfGsapBridge?.ensureGsap) {
            try {
                gsap = await Promise.race([
                    global.DfGsapBridge.ensureGsap(true),
                    new Promise((r) => global.setTimeout(() => r(null), 900)),
                ]);
            } catch (e) {
                gsap = null;
            }
        }
        if (!gsap || !panels.length) return;
        try {
            gsap.fromTo(panels,
                { opacity: 0.85, y: 10 },
                { opacity: 1, y: 0, duration: 0.28, stagger: 0.05, ease: "power2.out" }
            );
        } catch (e) { /* */ }
    }

    function hideHub() {
        $("play-menu")?.classList.remove("active");
        $("df-play-mode")?.classList.remove("active");
        $("hero-select")?.classList.remove("active");
        $("df-arsenal")?.classList.remove("active");
        $("main")?.classList.remove("active");
        const hub = $("df-hub-splash-layer");
        if (hub) hub.setAttribute("aria-hidden", "true");
        global.document.body.classList.remove("df-arsenal-open");
        try { global.DfMobileImmersive?.dismissTouchBlockers?.(); } catch (e) { /* */ }
        try { global.dfPauseHubBackdrop?.({ releaseMobileDecoder: true }); } catch (e) { /* */ }
        try { global.dfSyncMobileBackdrop?.(); } catch (e) { /* */ }
    }

    function restoreHub() {
        $("df-training-setup")?.classList.remove("active");
        global.document.body.classList.remove("df-training-open");
        const fromHub = global.__dfTrainingFromHub;
        global.__dfTrainingFromHub = false;
        if (fromHub) {
            $("play-menu")?.classList.remove("active");
            $("main")?.classList.remove("active");
            $("df-play-mode")?.classList.add("active");
            const hub = $("df-hub-splash-layer");
            if (hub) {
                hub.setAttribute("aria-hidden", "true");
                hub.style.display = "none";
            }
            try { global.dfPauseHubBackdrop?.({ releaseMobileDecoder: true }); } catch (e) { /* */ }
        } else {
            $("df-play-mode")?.classList.remove("active");
            if (typeof global.__dfGameViewApi?.showPlayMenu === "function") {
                global.__dfGameViewApi.showPlayMenu();
            } else if (typeof global.showPlayMenu === "function") {
                global.showPlayMenu();
            } else {
                $("play-menu")?.classList.add("active");
                const hub = $("df-hub-splash-layer");
                if (hub) {
                    hub.setAttribute("aria-hidden", "false");
                    hub.style.removeProperty("display");
                    hub.style.removeProperty("visibility");
                }
            }
        }
        try { global.dfSyncMobileBackdrop?.(); } catch (e) { /* */ }
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
        try { global.dfPlayHubVideo?.(); } catch (e) { /* */ }
        global.__dfMenuMusicSync?.();
    }

    async function advance() {
        state.aiDifficulty = "hard";
        state.aiDeckMode = "random";
        const resolved = global.DfTrainingDecks?.resolve?.({
            winPoints: state.winPoints,
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

        savePrefs();
        try {
            global.localStorage?.setItem(AI_DIFF_STORAGE, "hard");
        } catch (e) { /* */ }

        global.__DF_TRAINING_CONFIG = {
            winPoints: state.winPoints,
            aiDifficulty: "hard",
            playerDeckMode: state.playerDeckMode,
            playerDeckIdx: state.playerDeckIdx,
            aiDeckMode: "random",
        };
        global.__DF_TRAINING_RESOLVED_DECKS = resolved.decks;

        $("df-training-setup")?.classList.remove("active");
        global.document.body.classList.remove("df-training-open");

        if (typeof global.__dfGameViewApi?.beginTrainingHeroSelect === "function") {
            await global.__dfGameViewApi.beginTrainingHeroSelect();
        } else if (typeof global.__dfGameViewApi?.showHeroSelect === "function") {
            global.__dfGameViewApi.setSelectedMode?.(2);
            global.__dfGameViewApi.setAiDifficulty?.("hard");
            global.__dfGameViewApi.showHeroSelect();
        }
    }

    function wire() {
        if (wired) return;
        wired = true;
        $("df-training-setup")?.addEventListener("click", onChoiceClick);
        $("df-training-advance")?.addEventListener("click", () => { void advance(); });
        $("df-training-back")?.addEventListener("click", () => {
            global.__DF_TRAINING_CONFIG = null;
            global.__DF_TRAINING_RESOLVED_DECKS = null;
            restoreHub();
        });
    }

    async function open(opts = {}) {
        try { global.DfMobileImmersive?.enterFullscreenFromGesture?.(); } catch (e) { /* */ }

        wire();
        loadPrefs();
        global.__dfTrainingFromHub = !!opts.fromHub;
        global.__DF_TRAINING_CONFIG = null;
        global.__DF_TRAINING_RESOLVED_DECKS = null;

        hideHub();
        syncUi();
        try {
            await global.DfLayout?.ensureMenuBgReady?.("bg/A GUERRA.png");
        } catch (e) { /* */ }
        $("df-training-setup")?.classList.add("active");
        global.document.body.classList.add("df-training-open");
        // hideHub sincroniza letterbox ANTES de .active — sem isto o fundo
        // (A GUERRA) fica transparente/preto com partículas do hub vazando.
        try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
        try { global.dfSyncMobileBackdrop?.(); } catch (e) { /* */ }
        revealPanelsNow();
        global.__dfMenuMusicSync?.();

        try { global.DfMobileImmersive?.armClickToRestoreFullscreen?.(); } catch (e) { /* */ }

        void global.DfAuthClient?.ensureSession?.().then(() => {
            syncUi();
        });

        global.requestAnimationFrame(() => {
            try { global.dfSyncLetterboxBg?.(); } catch (e) { /* */ }
            void animateIn();
        });
    }

    global.DfTrainingSetup = {
        open,
        syncUi,
    };
})(typeof window !== "undefined" ? window : globalThis);
