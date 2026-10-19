/**
 * Dragonfall — baralhos do modo Treinamento.
 * Jogador: 10–24 cartas únicas. IA: sempre 24 cartas únicas.
 */
(function (global) {
    "use strict";

    const DECK_SIZE = 24;
    const MIN_PLAYER_DECK_SIZE = 10;
    const DECK_COUNT = 5;
    const STORAGE_KEY = "df_custom_decks_v1";

    function getCardDefs() {
        return global.DfData?.cardDefs || [];
    }

    function playableCards() {
        return getCardDefs().filter((c) => c && !c.hidden);
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function defaultDecks() {
        return Array.from({ length: DECK_COUNT }, (_, i) => ({
            name: `Baralho ${i + 1}`,
            cards: Array(DECK_SIZE).fill(null),
        }));
    }

    function normalizeDecks(raw) {
        const base = defaultDecks();
        if (!Array.isArray(raw)) return base;
        return base.map((d, i) => {
            const entry = raw[i] || d;
            const cards = Array.isArray(entry.cards) ? entry.cards.slice(0, DECK_SIZE) : [];
            while (cards.length < DECK_SIZE) cards.push(null);
            let name = String(entry.name || "").trim() || `Baralho ${i + 1}`;
            if (name.length > 32) name = name.slice(0, 32);
            const valid = cards.map((n) => {
                let nm = n != null ? String(n).trim() : "";
                if (!nm) return null;
                if (global.DfData && typeof global.DfData.resolveCardName === "function") {
                    nm = global.DfData.resolveCardName(nm);
                }
                const c = playableCards().find((x) => x.name === nm);
                return c ? nm : null;
            });
            return { name, cards: valid };
        });
    }

    function loadCustomDecks() {
        const player = global.DfAuthClient?.getCachedPlayer?.();
        if (player?.customDecks && Array.isArray(player.customDecks)) {
            return normalizeDecks(player.customDecks);
        }
        try {
            const raw = global.localStorage?.getItem(STORAGE_KEY);
            if (!raw) return defaultDecks();
            return normalizeDecks(JSON.parse(raw));
        } catch (e) {
            return defaultDecks();
        }
    }

    function deckFilledCount(deck) {
        return deck.cards.filter(Boolean).length;
    }

    function isDeckComplete(deck) {
        return deckFilledCount(deck) === DECK_SIZE;
    }

    function isDeckPlayable(deck) {
        const filled = deckFilledCount(deck);
        return filled >= MIN_PLAYER_DECK_SIZE && filled <= DECK_SIZE;
    }

    function buildRandomDeck(size) {
        const pool = playableCards().slice();
        shuffle(pool);
        const picked = [];
        const seen = new Set();
        for (const c of pool) {
            if (seen.has(c.name)) continue;
            seen.add(c.name);
            picked.push(c.name);
            if (picked.length >= size) break;
        }
        return picked;
    }

    /**
     * @param {{ winPoints: number, aiDifficulty: string, playerDeckMode: string, playerDeckIdx: number, aiDeckMode: string }} config
     */
    function resolve(config) {
        if (!config) return { ok: false, error: "NO_CONFIG" };
        let playerCards;
        if (config.playerDeckMode === "random") {
            playerCards = buildRandomDeck(DECK_SIZE);
        } else {
            const decks = loadCustomDecks();
            const idx = Number.isFinite(config.playerDeckIdx) ? config.playerDeckIdx : 0;
            const deck = decks[idx] || decks[0];
            if (!deck || !isDeckPlayable(deck)) {
                return { ok: false, error: "INCOMPLETE_DECK", deckName: deck?.name || "" };
            }
            playerCards = deck.cards.filter(Boolean);
        }
        if (playerCards.length < MIN_PLAYER_DECK_SIZE || playerCards.length > DECK_SIZE) {
            return { ok: false, error: "BAD_PLAYER_DECK" };
        }
        const unique = new Set(playerCards);
        if (unique.size !== playerCards.length) {
            return { ok: false, error: "DUPLICATE_CARDS" };
        }

        /* IA: sempre baralho aleatório de 24 (pedido do autor — sem espelhado). */
        const aiCards = buildRandomDeck(DECK_SIZE);
        return {
            ok: true,
            decks: [playerCards, aiCards],
            aiDeckMode: "random",
        };
    }

    function listCustomDecksForUi() {
        return loadCustomDecks().map((d, i) => ({
            index: i,
            name: d.name,
            filled: deckFilledCount(d),
            playable: isDeckPlayable(d),
            complete: isDeckComplete(d),
        }));
    }

    global.DfTrainingDecks = Object.freeze({
        DECK_SIZE,
        MIN_PLAYER_DECK_SIZE,
        loadCustomDecks,
        listCustomDecksForUi,
        isDeckPlayable,
        isDeckComplete,
        buildRandomDeck,
        resolve,
    });
})(typeof window !== "undefined" ? window : globalThis);
