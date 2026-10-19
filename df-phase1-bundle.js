/**
 * Dragonfall — bundle Fase 1 (concatenação ordenada).
 * Gerado: node scripts/bundle-phase1.mjs
 */

/* ===== df-view-session.js ===== */
/**
 * Dragonfall — View session (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        function dfLocalSeat() {
            return window.__DF_ONLINE ? (window.__DF_SEAT | 0) : 0;
        }
        
        function dfIsMyTurn() {
            // MP: durante END_TURN em voo bloqueia jogadas duplicadas, mas o banner
            // continua baseado em currentPlayer (não mente “vez do adversário”).
            if (window.__DF_ONLINE && window.__dfTurnEndingPending) {
                // Sticky: se o flag ficou preso, o banner mostra “SUA VEZ” (currentPlayer)
                // mas summon/ataque morrem — destrava após 2,2s.
                if (!window.__dfTurnEndingStuckAt) window.__dfTurnEndingStuckAt = Date.now();
                else if (Date.now() - (window.__dfTurnEndingStuckAt | 0) > 2200) {
                    console.warn("[DF] __dfTurnEndingPending sticky — force clear");
                    window.__dfTurnEndingPending = false;
                    window.__dfTurnEndingStuckAt = 0;
                    try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                } else {
                    return false;
                }
            } else {
                window.__dfTurnEndingStuckAt = 0;
            }
            const st = deps.getState();
            if (!st?.started || st.winner != null) return false;
            return st.currentPlayer === dfLocalSeat();
        }
        
        function dfPlayerForQuadrant(q) {
            return (window.__DF_ONLINE && window.__DF_SEAT === 1) ? (1 - q) : q;
        }
        
        function dfHumanSeat() {
            return window.__DF_ONLINE ? dfLocalSeat() : 0;
        }
        
        function dfOpponentSeat() {
            return window.__DF_ONLINE ? (1 - dfLocalSeat()) : 1;
        }
        
        function dfRivalPlayerIdx(pIdx) {
            for (let i = 0; i < (deps.getState().playersCount || 2); i++) {
                if (i !== (pIdx | 0)) return i;
            }
            return null;
        }
        
        function dfIsLocalPlayer(pIdx) {
            return (pIdx | 0) === dfHumanSeat();
        }
        
        function dfLocalPlayer() {
            return deps.getState().players?.[dfHumanSeat()] || null;
        }
        
        function dfQuadrantForPlayer(pIdx) {
            const n = deps.getState().playersCount || 2;
            for (let q = 0; q < n; q++) {
                if (dfPlayerForQuadrant(q) === (pIdx | 0)) return q;
            }
            return pIdx | 0;
        }
        global.__dfHud = {
            localSeat: () => dfLocalSeat(),
            currentPlayer: () => {
                const st = deps.getState();
                return st?.currentPlayer != null ? st.currentPlayer : null;
            },
            quadrantForPlayer: (p) => dfQuadrantForPlayer(p),
            isLocalPlayer: (p) => dfIsLocalPlayer(p),
            getPlayer: (p) => deps.getState()?.players?.[p] || null,
        };
        return {
            dfLocalSeat, dfIsMyTurn, dfPlayerForQuadrant, dfHumanSeat, dfOpponentSeat,
            dfRivalPlayerIdx, dfIsLocalPlayer, dfLocalPlayer, dfQuadrantForPlayer,
        };
    }

    global.DfViewSession = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-anim.js ===== */
/**
 * Dragonfall — DfAnim (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        // ====================================================================
        // DF ANIM — motor unificado de VFX (Ult / Talento / Reação / Habilidade)
        // ====================================================================
        const DfAnim = (() => {
            const POOL_CAP = deps.FX.mobile ? 10 : (deps.FX.medium ? 28 : 36);
            const pools = new Map();
            function poolGet(tag, factory) {
                if (!pools.has(tag)) pools.set(tag, []);
                const pool = pools.get(tag);
                return pool.length ? pool.pop() : factory();
            }
            function poolPut(tag, el) {
                if (!el) return;
                try { el.remove(); } catch (e) {}
                el.removeAttribute("style");
                el.className = "";
                el.innerHTML = "";
                el.textContent = "";
                const pool = pools.get(tag) || [];
                if (pool.length < POOL_CAP) pool.push(el);
                pools.set(tag, pool);
            }
            const CATEGORIES = {
                ultimate: { sfx: "ultimate_intro", cls: "ult-cinema df-anim-ultimate", ms: 900 },
                talent:   { sfx: "card_draw",      cls: "ult-cinema df-anim-talent",   ms: 720 },
                reaction: { sfx: "card_draw",      cls: "ult-cinema df-anim-reaction", ms: 680 },
                skill:    { sfx: null,             cls: "ult-cinema df-anim-skill",    ms: 650 },
            };
            async function preAnimBanner(_opts = {}) {
                return;
                const cat = CATEGORIES[_opts.category] || CATEGORIES.skill;
                const theme = opts.theme || {};
                const color = theme.color || "#ffd060";
                const ring = theme.ring || "#fff8d0";
                const emoji = theme.emoji || "✨";
                const title = String(opts.title || "").toUpperCase();
                const subtitle = opts.subtitle || "";
                const isUlt = opts.category === "ultimate";
                const lite = deps.FX.liteVfx || (isUlt && deps.FX.medium);
                if (cat.sfx) try { window.sfx && window.sfx(cat.sfx); } catch (e) {}
                const ov = poolGet("df-pre-banner", () => document.createElement("div"));
                ov.className = cat.cls + (lite ? " df-anim-lite" : "");
                ov.style.setProperty("--ult-c", color);
                ov.style.setProperty("--ult-c2", ring);
                if (lite) {
                    ov.innerHTML =
                        `<div class="ult-banner df-lite-banner">` +
                            `<span class="df-lite-emoji">${emoji}</span>` +
                            `<div class="df-lite-text">` +
                                `<span class="df-lite-title">${title}</span>` +
                                (subtitle ? `<span class="df-lite-sub">${subtitle}</span>` : "") +
                            `</div>` +
                        `</div>`;
                } else {
                    const ringCount = deps.FX.medium ? 1 : 3;
                    const rings = Array.from({ length: ringCount }, () => "<span></span>").join("");
                    ov.innerHTML =
                        `<div class="ult-vignette"></div>` +
                        `<div class="ult-rings">${rings}</div>` +
                        `<div class="ult-banner">` +
                            `<div class="ult-emoji">${emoji}</div>` +
                            `<div class="ult-title">${title}</div>` +
                            (subtitle ? `<div class="ult-caster">${subtitle}</div>` : "") +
                        `</div>`;
                }
                document.body.appendChild(ov);
                const banner = ov.querySelector(".ult-banner");
                if (banner && !lite) {
                    banner.classList.add("ult-banner-punch");
                    setTimeout(() => banner.classList.remove("ult-banner-punch"), 380);
                }
                const holdMs = lite ? (isUlt ? 420 : 280) : (opts.duration ?? cat.ms);
                const outMs = lite ? 200 : (deps.FX.medium ? 420 : 560);
                await deps.wait(holdMs);
                ov.classList.add("ult-cinema-out");
                await deps.wait(outMs);
                poolPut("df-pre-banner", ov);
            }
            function mountVfxParticle(el, vx, vy) {
                const layout = global.DfLayout;
                const canvas = layout?.isCanvasFieldLayout?.();
                const root = canvas ? (layout.overlayRoot?.() || document.body) : document.body;
                if (el.parentNode !== root) root.appendChild(el);
                if (canvas) {
                    layout.prepareOverlay?.(el);
                    const p = layout.viewportToCanvas(vx, vy);
                    el.style.setProperty("position", "absolute", "important");
                    el.style.left = p.x + "px";
                    el.style.top = p.y + "px";
                    return;
                }
                el.style.position = "fixed";
                el.style.left = vx + "px";
                el.style.top = vy + "px";
            }
            function spawnParticle(x, y, glyph) {
                const p = poolGet("particle", () => {
                    const d = document.createElement("div");
                    d.className = "particle";
                    return d;
                });
                p.className = "particle";
                p.textContent = glyph || "✨";
                p.style.setProperty("--px", (Math.random() - 0.5) * 70 + "px");
                p.style.setProperty("--py", (Math.random() - 0.5) * 70 - 25 + "px");
                mountVfxParticle(p, x, y);
                setTimeout(() => poolPut("particle", p), 800);
            }
            function spawnParticles(x, y, count, glyph) {
                count = deps.FX.n(count);
                for (let i = 0; i < count; i++) {
                    spawnParticle(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24, glyph);
                }
            }
            function spawnTimed(className, setupFn, ms, factory) {
                const el = poolGet(className, factory || (() => document.createElement("div")));
                el.className = className;
                setupFn(el);
                const vx = parseFloat(el.style.left);
                const vy = parseFloat(el.style.top);
                if (global.DfLayout?.isCanvasFieldLayout?.() && Number.isFinite(vx) && Number.isFinite(vy)) {
                    mountVfxParticle(el, vx, vy);
                } else {
                    if (!el.style.position) el.style.position = "fixed";
                    document.body.appendChild(el);
                }
                setTimeout(() => poolPut(className, el), ms);
                return el;
            }
            /** Cria N partículas escaladas pelo deps.FX budget — evita loops
             *  com createElement/remove() que causam micro-travamentos. */
            function spawnBurst(count, className, setupFn, ms, factory) {
                const n = document.documentElement.classList.contains("df-ult-perf")
                    ? deps.FX.nUlt(count) : deps.FX.n(count);
                for (let i = 0; i < n; i++) {
                    const idx = i;
                    spawnTimed(className, (el) => setupFn(el, idx, n), ms, factory);
                }
            }
            async function waapi(el, keyframes, options) {
                if (!el?.animate) { await deps.wait(options?.duration || 280); return; }
                await el.animate(keyframes, options).finished.catch(() => {});
            }
            function themeForCard(card) {
                if (!card) return { color: "#ffd060", ring: "#fff8d0", emoji: "✨" };
                const n = (card.name || "").toUpperCase();
                if (n.includes("FOGO") || n.includes("EXPLOSA")) return { color: "#ff5a1c", ring: "#ffd060", emoji: "🔥" };
                if (n.includes("ZERO") || n.includes("GEL")) return { color: "#5fd0ff", ring: "#cef1ff", emoji: "❄️" };
                if (n.includes("AMEDRONT")) return { color: "#c068ff", ring: "#e8c0ff", emoji: "😨" };
                if (n.includes("BLOQUEAR") || n.includes("PROTEÇÃO")) return { color: "#3ee07a", ring: "#aaffcc", emoji: "🛡️" };
                if (n.includes("VENENOSA") || n.includes("BAFORADA")) return { color: "#6cff3a", ring: "#d4ff8a", emoji: "☠️" };
                if (n.includes("ACELERA")) return { color: "#ff4a1a", ring: "#ffd060", emoji: "👢" };
                if (n.includes("MISSEIS") || n.includes("MÍSSEIS")) return { color: "#ff3030", ring: "#ff9090", emoji: "🚀" };
                return { color: "#b46cff", ring: "#e2c0ff", emoji: "⚡" };
            }
            return { preAnimBanner, spawnParticles, spawnParticle, spawnTimed, spawnBurst, waapi, themeForCard, poolPut, CATEGORIES };
        })();
        window.__dfAnim = DfAnim;
        
        function spawnParticles(x, y, count = 6) {
            DfAnim.spawnParticles(x, y, count);
        }
        
        
        function spawnParticles(x, y, count = 6) { DfAnim.spawnParticles(x, y, count); }
        global.__dfAnim = DfAnim;
        return { DfAnim, spawnParticles };
    }

    global.DfAnimLib = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-board-renderer.js ===== */
/**
 * Dragonfall — Board renderer (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        if (typeof deps.$ !== "function") deps.$ = (id) => document.getElementById(id);
        function dfHumanSeat() { return deps.dfHumanSeat(); }
        function dfOpponentSeat() { return deps.dfOpponentSeat(); }
        function getSelectedHand() { return deps.getSelectedHand?.() ?? 0; }
        function setSelectedHand(v) { deps.setSelectedHand?.(v); }
        function getSelectedFieldIdx() { return deps.getSelectedFieldIdx?.() ?? 0; }
        function setSelectedFieldIdx(v) { deps.setSelectedFieldIdx?.(v); }
        function getPendingSummon() { return deps.getPendingSummon?.() ?? null; }
        const isResistente = (c) => deps.isResistente(c);
        const isPesadoDemais = (c) => deps.isPesadoDemais(c);
        const cannotHitResistente = (c) => deps.cannotHitResistente(c);
        const attackIsFree = (a) => deps.attackIsFree(a);
        const getAttackActionCost = (a, d) => deps.getAttackActionCost(a, d);
        const flashInsufficientActions = (...a) => deps.flashInsufficientActions(...a);
        const dfOnlineResolveCombatThenBroadcast = (...a) => deps.dfOnlineResolveCombatThenBroadcast(...a);
        const dropZoneAt = (...a) => deps.dropZoneAt?.(...a) ?? null;
        const dfCreateHandDragGhost = (...a) => deps.dfCreateHandDragGhost?.(...a) ?? null;
        const dfResizeHandDragGhost = (...a) => deps.dfResizeHandDragGhost?.(...a);
        const updateDropHighlight = (...a) => deps.updateDropHighlight?.(...a);
        const clearDropHighlight = (...a) => deps.clearDropHighlight?.(...a);
        const openCardZoom = (...a) => deps.openCardZoom?.(...a);
        const flashRuleBanner = (...a) => deps.flashRuleBanner?.(...a);
        const startTalentUse = (...a) => deps.startTalentUse?.(...a);
        const dfPlayerAction = (...a) => deps.dfPlayerAction?.(...a);
        const dfEndFieldDragVisual = (...a) => deps.dfEndFieldDragVisual?.(...a);
        const dfCreateFieldDragGhost = (...a) => deps.dfCreateFieldDragGhost?.(...a) ?? null;
        const dfLockFieldCardTransform = (...a) => deps.dfLockFieldCardTransform?.(...a);
        const canAttackerTargetDefender = (a, d) => DfRules.canAttackerTargetDefender(a, d);
        const onChampionClick = (...a) => deps.onChampionClick?.(...a);
        const checkWin = (...a) => deps.checkWin?.(...a);
        function getSelectedEnemyIdx() { return deps.getSelectedEnemyIdx?.() ?? 0; }
        function setSelectedEnemyIdx(v) { deps.setSelectedEnemyIdx?.(v); }

        /**
         * Centraliza a FILEIRA INTEIRA na linha vertical real do banner (arena).
         * Com n campeões a fileira cresce simetricamente para os dois lados:
         * o conjunto sempre parece alinhado ao centro, sem puxar para um lado.
         * O campo e o banner vivem em referenciais diferentes no canvas-fit/cover,
         * portanto 50% do próprio campo não é necessariamente o centro da arena.
         */
        function dfSyncFieldBannerAnchor(field, fieldLen) {
            if (!field?.isConnected) return;
            const apply = () => {
                if (!field.isConnected) return;
                const cards = field.querySelectorAll(":scope > .ccard");
                const n = Math.min(Math.max(0, fieldLen | 0), cards.length || (fieldLen | 0));
                if (!n) {
                    field.style.removeProperty("--df-field-anchor-pad");
                    return;
                }
                const banner = document.getElementById("df-turn-banner-pedestal");
                const fieldRect = field.getBoundingClientRect();
                const bannerRect = banner?.getBoundingClientRect?.();
                const cssFieldW = field.offsetWidth || fieldRect.width;
                if (!fieldRect.width || !cssFieldW) return;
                const visualScaleX = fieldRect.width / cssFieldW || 1;
                const firstCard = cards[0];
                const cardW = (firstCard && (firstCard.offsetWidth
                    || parseFloat(getComputedStyle(firstCard).width)))
                    || parseFloat(getComputedStyle(document.documentElement)
                        .getPropertyValue("--df-field-card-w"))
                    || 116;
                const fieldStyle = getComputedStyle(field);
                const gap = parseFloat(fieldStyle.columnGap || fieldStyle.gap) || 10;
                const rowW = (n * cardW) + ((n - 1) * gap);
                let targetLocalX;
                // MP / banner sem rect: centraliza na arena (50%).
                if (document.body.classList.contains("df-pvp-mode")
                    || window.__DF_ONLINE
                    || !bannerRect?.width
                    || banner?.hidden) {
                    targetLocalX = cssFieldW * 0.5;
                } else {
                    const bannerCx = bannerRect.left + bannerRect.width * 0.5;
                    targetLocalX = (bannerCx - fieldRect.left) / visualScaleX;
                }
                let pad = targetLocalX - (rowW * 0.5);
                // Não empurrar a fileira para fora (até 6 cartas).
                const maxPad = Math.max(0, cssFieldW - rowW);
                pad = Math.max(0, Math.min(maxPad, pad));
                field.style.setProperty("--df-field-anchor-pad", `${Math.round(pad * 100) / 100}px`);
            };
            apply();
            requestAnimationFrame(apply);
        }

        if (!global.__dfFieldBannerAnchorResizeWired) {
            global.__dfFieldBannerAnchorResizeWired = true;
            global.addEventListener("resize", () => {
                requestAnimationFrame(() => {
                    document.querySelectorAll("#game.active .quadrant-field[data-field-count]").forEach((field) => {
                        dfSyncFieldBannerAnchor(field, Number(field.dataset.fieldCount) || 0);
                    });
                });
            }, { passive: true });
        }

        /** Borda pulsante por fase — todo campeão selecionável ganha vt-* visível. */
        function dfPickValidTargetBorder(phase, ability, ultimate) {
            if (phase === "select-attacker") return "vt-green";
            if (phase === "select-defender") return "vt-red";
            if (phase === "target-ally") {
                if (ability === "investida") return "vt-orange";
                if (ability === "protecao") return "vt-blue";
                if (ability === "devorar") return "vt-red";
                if (ability === "ritualSacrifice" || ability === "ursificacao"
                    || ability === "imitar" || ability === "corromper") return "vt-purple";
                if (ability === "fortalecer" || ability === "fortalecerTalento") return "vt-green";
                return "vt-green";
            }
            if (phase === "target-champion") {
                if (ability === "explosao" || ability === "assassinar" || ability === "medoTalento"
                    || ability === "bolaDeFogo" || ability === "bolaDeFogoTalento") return "vt-red";
                if (ability === "baforadaVenenosa" || ability === "mordidaVenenosa") return "vt-green";
                if (ability === "rajadaCongelante" || ability === "zeroAbsoluto") return "vt-blue";
                if (ability === "transformarBichinho") return "vt-purple";
                if (ability === "corromper") return "vt-purple";
                return "vt-red";
            }
            if (phase === "ultimate-target") {
                if (ultimate === "pirate") return "vt-orange";
                if (ultimate === "ironGuard" || ultimate === "alquimista" || ultimate === "potion"
                    || ultimate === "iceWitch") return "vt-blue";
                if (ultimate === "linguarudo") return "vt-green";
                if (ultimate === "princesaSlime") return "vt-purple";
                if (ultimate === "vaughan" || ultimate === "valmont" || ultimate === "tecnomago"
                    || ultimate === "gancho" || ultimate === "hook" || ultimate === "sinistrela") return "vt-red";
                return "vt-red";
            }
            return "vt-green";
        }

        function dfSyncTargetingAttribute() {
            const phase = deps.getGamePhase();
            const on = ["target-champion", "target-ally", "ultimate-target", "select-attacker", "select-defender"].includes(phase);
            if (on) document.body.setAttribute("data-targeting", phase);
            else document.body.removeAttribute("data-targeting");
        }

        const TARGETING_HIGHLIGHT_CLASSES = [
            "valid-target", "target", "hl", "attacker", "drag-attack-target",
            "ritual-drag-target", "vt-red", "vt-green", "vt-blue", "vt-orange", "vt-purple",
            "df-target-levitating",
        ];

        /** Remove bordas/auras Pixi de alvo — após habilidade, ultimate ou destruição. */
        function purgeTargetingVisuals() {
            try { window.DfTargetLevitate?.stopAll?.(); } catch (e) { /* */ }
            document.querySelectorAll(".quadrant-field .ccard").forEach((el) => {
                let touched = false;
                TARGETING_HIGHLIGHT_CLASSES.forEach((cls) => {
                    if (el.classList.contains(cls)) {
                        el.classList.remove(cls);
                        touched = true;
                    }
                });
                if (touched || el.classList.contains("df-target-levitating")) {
                    el.classList.remove("df-target-levitating");
                    ["transform", "translate", "scale", "rotate", "will-change", "transform-origin"].forEach((p) => {
                        try { el.style.removeProperty(p); } catch (e2) { /* */ }
                    });
                    window.dfClearPlayerFieldHighlightInline?.(el);
                }
            });
            // Só derruba o atributo se a mira realmente acabou. Removê-lo durante
            // uma fase de mira ativa apagava a borda de todos os alvos.
            dfSyncTargetingAttribute();
            try { document.body.classList.remove("df-mp-targeting"); } catch (eMp) { /* */ }
        }

        /** Garante bordas coloridas nos alvos após re-render (onEnter + ultimate + ally). */
        function syncTargetingHighlights() {
            const phase = deps.getGamePhase();
            // O CSS da borda pulsante é ancorado em body[data-targeting]; sem o
            // atributo as classes valid-target/vt-* não pintam nada. Qualquer
            // purge no meio da mira removia o atributo e o destaque não voltava
            // (Bola de Fogo / Zero Absoluto sem campeões destacados).
            dfSyncTargetingAttribute();
            const td = deps.getTargetData() || {};
            let targets = null;
            if (phase === "target-champion" || phase === "ultimate-target") {
                targets = td.targets;
            } else if (phase === "target-ally") {
                targets = td.allyTargets;
            } else if (phase === "select-attacker") {
                // Atacantes prontos (não Cansado) — não purgar (antes sumiam).
                const owner = td.attackerOwner;
                const pl = deps.getState()?.players?.[owner];
                targets = (pl?.field || []).map((c, i) => ({ c, i }))
                    .filter((x) => x.c && !x.c.tapped && !x.c.frozen && !x.c.pulled)
                    .map((x) => ({ p: owner, i: x.i }));
            } else if (phase === "select-defender") {
                // Defensores: Cansado PODE ser atacado (manual).
                const atkOwner = td.attackerOwner;
                targets = [];
                const st = deps.getState();
                for (let ep = 0; ep < (st?.playersCount || 0); ep++) {
                    if (ep === atkOwner) continue;
                    (st.players[ep]?.field || []).forEach((c, i) => {
                        if (!c || c.shielded || c.pulled) return;
                        targets.push({ p: ep, i });
                    });
                }
            } else {
                // Fase normal: limpar órfãos (patch incremental preservava vt-*).
                if (document.querySelector(
                    ".quadrant-field .ccard.valid-target, .quadrant-field .ccard.vt-red, .quadrant-field .ccard.vt-green, .quadrant-field .ccard.vt-blue, .quadrant-field .ccard.vt-orange, .quadrant-field .ccard.vt-purple, .quadrant-field .ccard.df-target-levitating"
                )) {
                    purgeTargetingVisuals();
                }
                return;
            }
            if (!targets?.length) {
                purgeTargetingVisuals();
                return;
            }
            const vt = dfPickValidTargetBorder(phase, td.ability, td.ultimate);
            const ti = td.targetIndex | 0;
            // Remove highlights de quem saiu da lista, depois reaplica válidos.
            document.querySelectorAll(".quadrant-field .ccard.valid-target, .quadrant-field .ccard.hl, .quadrant-field .ccard.target").forEach((el) => {
                const p = Number(el.dataset.player);
                const i = Number(el.dataset.field);
                const still = targets.some((tg) => tg.p === p && tg.i === i);
                if (!still) {
                    TARGETING_HIGHLIGHT_CLASSES.forEach((cls) => el.classList.remove(cls));
                    window.dfClearPlayerFieldHighlightInline?.(el);
                }
            });
            targets.forEach((tg, idx) => {
                const el = getChampionDom(tg.p, tg.i);
                if (!el) return;
                ["vt-red", "vt-green", "vt-blue", "vt-orange", "vt-purple"].forEach((c) => el.classList.remove(c));
                el.classList.remove("valid-target", "target", "hl");
                el.classList.add("valid-target", vt);
                if (idx === ti && (phase === "target-ally" || phase === "target-champion" || phase === "ultimate-target")) {
                    el.classList.add(phase === "target-ally" ? "hl" : "target");
                }
                // Não zerar border/animation inline — CSS do Ritual/mira depende disso.
                // Só limpa lixo de selagem se ainda houver estilo residual conflitante.
                if (el.style.border || el.style.animation) {
                    window.dfClearPlayerFieldHighlightInline?.(el);
                }
            });
            // MP: HUD direita não engole clique no campeão da ponta durante mira/ataque.
            try {
                if (window.__DF_ONLINE || document.body.classList.contains("df-pvp-mode")) {
                    document.body.classList.add("df-mp-targeting");
                }
            } catch (eTg) { /* */ }
            window.DfTargetLevitate?.sync?.();
        }

        /** @deprecated alias */
        function syncTargetChampionHighlights() {
            syncTargetingHighlights();
        }
        let _uiCoalesce = 0;
        let _uiPendingVfx = false;
        let _uiVfxDeferSince = 0;
        let _quadRenderFp = [];
        let _lastWarmSig = "";
        let _lastWarmHandSig = "";
        let _lastWarmAt = 0;
        let _lastWarmTurn = -1;
        const gemAnimState = new Map();
        function getChampionDom(pIdx, fIdx) { return document.getElementById(`champ-${pIdx}-${fIdx}`); }

        /** Hit-test por proximidade ao centro — evita clique/zoom no irmão errado com levitate/z-index. */
        function dfNearestFieldCardAt(x, y, opts = {}) {
            const maxDist = opts.maxDist ?? 120;
            const onlyPlayer = opts.player;
            const excludeLocal = !!opts.excludeLocal;
            const pvp = !!(window.__DF_ONLINE || document.body.classList.contains("df-pvp-mode"));
            let best = null;
            let bestD = maxDist;
            let inside = null;
            let insideArea = Infinity;
            document.querySelectorAll(".quadrant-field > .ccard").forEach((el) => {
                if (!el.isConnected || el.style.visibility === "hidden") return;
                const tp = Number(el.dataset.player);
                const ti = Number(el.dataset.field);
                if (Number.isNaN(tp) || Number.isNaN(ti)) return;
                if (onlyPlayer != null && tp !== onlyPlayer) return;
                if (excludeLocal && deps.dfIsLocalPlayer(tp)) return;
                const r = el.getBoundingClientRect();
                if (!(r.width > 2 && r.height > 2)) return;
                // MP: margem horizontal extra — o campeão da ponta direita fica sob HUD
                // e o hit-box real é maior que o rect visual (borda/glow).
                const padX = pvp && excludeLocal ? 18 : 0;
                const padY = pvp && excludeLocal ? 10 : 0;
                if (x >= r.left - padX && x <= r.right + padX && y >= r.top - padY && y <= r.bottom + padY) {
                    const area = Math.max(1, (r.width + padX * 2) * (r.height + padY * 2));
                    // Com pad, preferir área menor; empate → índice maior (direita).
                    if (area < insideArea || (area === insideArea && inside && ti > inside.i)) {
                        insideArea = area;
                        inside = { p: tp, i: ti, el, dist: 0 };
                    }
                }
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const d = Math.hypot(x - cx, y - cy);
                // Empate: no MP adversário, preferir índice maior (direita) — antes
                // `ti < best.i` fazia o 5º campeão perder para o 4º.
                const better = d < bestD
                    || (d === bestD && best && (pvp && excludeLocal ? ti > best.i : ti < best.i));
                if (better) {
                    bestD = d;
                    best = { p: tp, i: ti, el, dist: d };
                }
            });
            return inside || best;
        }
        
        function dfInvalidateQuadrantFp(pIdx) {
            const qIdx = deps.dfQuadrantForPlayer(pIdx);
            if (qIdx >= 0) _quadRenderFp[qIdx] = "";
        }

        function dfInvalidateAllQuadrantFp() {
            _quadRenderFp.length = 0;
        }
        
        function getCardTypeClass(card) { return card.category === "talent" ? "type-talent" : "type-champion"; }
        
        function buildFlyCardHtml(c) {
            const tc = getCardTypeClass(c);
            const costCls = c.power === 0 ? " zero" : "";
            const badge = c.category === "talent"
                ? '<div class="talent-badge">TALENTO</div>' : '';
            return `<div class="hcard ${tc}"><div class="pow">${c.currentPower}</div>` +
                `<div class="nm">${c.name}</div>` +
                `<div class="cost${costCls}">${c.power === 0 ? "0" : c.currentPower}</div>${badge}</div>`;
        }
        
        function updateQuadrantVisibility() {
            for (let p = 0; p < 4; p++) {
                const q = deps.$(`quadrant-${p}`);
                if (!q) continue;
                if (p < deps.getState().playersCount) { q.classList.remove("hidden-quadrant"); } else { q.classList.add(
                        "hidden-quadrant"); }
            }
            const grid = deps.$("game-grid");
            if (grid) {
                grid.classList.toggle("mode-2", deps.getState().playersCount === 2);
                grid.classList.toggle("mode-3", deps.getState().playersCount === 3);
                grid.classList.toggle("mode-4", deps.getState().playersCount === 4);
            }
            // 4vs Lendário no celular em retrato: ativa a rotação CSS
            // pra rodar o tabuleiro automaticamente em paisagem. Só
            // entra se for celular (≤900px) e retrato; quando o
            // jogador girar o telefone, desliga sozinho.
            applyMode4Rotation();
        }
        
        function applyMode4Rotation() {
            document.body.classList.remove("mode-4-rotate");
        }
        
        function statusOverlayHtml(card) {
            if (!card) return "";
            const parts = [];
            const rod = (n) => n === 1 ? "rodada" : "rodadas";
            if (card.frozen) {
                parts.push(
                    `<div class="zoom-status frozen">` +
                        `<div class="zs-icon">❄️</div>` +
                        `<div class="zs-name">CONGELADO</div>` +
                    `</div>`
                );
            }
            if (card.shielded) {
                const t = card.shieldedTurns || 1;
                parts.push(
                    `<div class="zoom-status shield">` +
                        `<div class="zs-icon">🛡️</div>` +
                        `<div class="zs-name">PROTEGIDO</div>` +
                        `<div class="zs-sub">Imune a ataques • ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.barrier) {
                const perm = !!card.barrierPermanent;
                const t = perm ? null : (card.barrierTurns || 2);
                parts.push(
                    `<div class="zoom-status barrier">` +
                        `<div class="zs-icon">⬡</div>` +
                        `<div class="zs-name">BARREIRA</div>` +
                        `<div class="zs-sub">Bloqueia a 1ª redução de Poder • Imune a Transformar em Bichinho • ${perm ? "Duração: ∞" : `${t} ${rod(t)}`}</div>` +
                    `</div>`
                );
            }
            if (card.fireAura && (card.fireAuraTurns > 0 || card.fireAuraTurns === undefined)) {
                const t = card.fireAuraTurns || 3;
                parts.push(
                    `<div class="zoom-status fire-aura">` +
                        `<div class="zs-icon">🔥</div>` +
                        `<div class="zs-name">AURA DE FOGO</div>` +
                        `<div class="zs-sub">Ao morrer, -1 Poder em adversário aleatório • ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.burning && (card.burningTurns > 0 || card.burningTurns === undefined)) {
                const t = card.burningTurns || 4;
                parts.push(
                    `<div class="zoom-status em-chamas">` +
                        `<div class="zs-icon">🔥</div>` +
                        `<div class="zs-name">EM CHAMAS</div>` +
                        `<div class="zs-sub">−1 Poder após a manutenção do dono • ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.freeAttack) {
                parts.push(
                    `<div class="zoom-status charge">` +
                        `<div class="zs-icon">⚡</div>` +
                        `<div class="zs-name">INVESTIDA</div>` +
                        `<div class="zs-sub">Ataque livre disponível neste turno</div>` +
                    `</div>`
                );
            }
            if (card.fury) {
                const t = card.furyTurns || 1;
                const stacks = deps.DfRules?.getFuryStacks?.(card) || card.furyStacks || 1;
                parts.push(
                    `<div class="zoom-status fury">` +
                        `<div class="zs-icon">💢</div>` +
                        `<div class="zs-name">FÚRIA</div>` +
                        `<div class="zs-sub">+${stacks} Poder (${stacks} carga${stacks === 1 ? "" : "s"}) • ${t} ${rod(t)} restante${t === 1 ? "" : "s"}</div>` +
                    `</div>`
                );
            }
            if (card.silenced) {
                // Silêncio é PERMANENTE — duração infinita até a carta morrer.
                parts.push(
                    `<div class="zoom-status silenced">` +
                        `<div class="zs-icon">` +
                            `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">` +
                                `<path fill="#fff" stroke="#222" stroke-width="1.2" stroke-linejoin="round" ` +
                                    `d="M3 5 h18 a1 1 0 0 1 1 1 v10 a1 1 0 0 1 -1 1 H10 l-4 3 v-3 H3 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 z"/>` +
                                `<circle cx="8"  cy="11" r="1.5" fill="#222"/>` +
                                `<circle cx="12" cy="11" r="1.5" fill="#222"/>` +
                                `<circle cx="16" cy="11" r="1.5" fill="#222"/>` +
                            `</svg>` +
                        `</div>` +
                        `<div class="zs-name">SILÊNCIO</div>` +
                        `<div class="zs-sub">Sem habilidade • Duração: ∞ (permanente)</div>` +
                    `</div>`
                );
            }
            if (card.poisoned) {
                const t = card.poisonTurns || 1;
                parts.push(
                    `<div class="zoom-status poisoned">` +
                        `<div class="zs-icon">🐍</div>` +
                        `<div class="zs-name">ENVENENADO</div>` +
                        `<div class="zs-sub">Morre em ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.vulnerable) {
                parts.push(
                    `<div class="zoom-status vulnerable">` +
                        `<div class="zs-icon">☣️</div>` +
                        `<div class="zs-name">VULNERÁVEL</div>` +
                        `<div class="zs-sub">Destruído ao receber qualquer redução de Poder</div>` +
                    `</div>`
                );
            }
            if (card.pulled) {
                const t = card.pulledTurns || 1;
                parts.push(
                    `<div class="zoom-status pulled">` +
                        `<div class="zs-icon">🪝</div>` +
                        `<div class="zs-name">PUXADO</div>` +
                        `<div class="zs-sub">Não ataca nem é atacado • ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.foreverGrowth) {
                parts.push(
                    `<div class="zoom-status forever">` +
                        `<div class="zs-icon">💪</div>` +
                        `<div class="zs-name">FORÇA INFINITA</div>` +
                        `<div class="zs-sub">+1 Poder por rodada • Duração: ∞</div>` +
                    `</div>`
                );
            }
            if (card.wallBuff) {
                parts.push(
                    `<div class="zoom-status wall">` +
                        `<div class="zs-icon">🧱</div>` +
                        `<div class="zs-name">MURALHA</div>` +
                        `<div class="zs-sub">Proteção permanente — some ao perder Poder</div>` +
                    `</div>`
                );
            }
            if (card.guerraBuff) {
                const t = card.guerraBuffTurns || 1;
                parts.push(
                    `<div class="zoom-status war">` +
                        `<div class="zs-icon">⚔️</div>` +
                        `<div class="zs-name">SOBREPUJAR (GUERRA)</div>` +
                        `<div class="zs-sub">Empates viram vitória • ${t} ${rod(t)}</div>` +
                    `</div>`
                );
            }
            if (card.mimico) {
                const cop = card.mimicAbilityName || "—";
                const desc = card.mimicAbilityDesc || "";
                parts.push(
                    `<div class="zoom-status mimico">` +
                        `<div class="zs-icon">🎭</div>` +
                        `<div class="zs-name">MIMICO: ${cop}</div>` +
                        `<div class="zs-sub">${desc}</div>` +
                    `</div>`
                );
            }
            if (card.inspiracao) {
                parts.push(
                    `<div class="zoom-status inspiracao">` +
                        `<div class="zs-icon">✨</div>` +
                        `<div class="zs-name">INSPIRAÇÃO</div>` +
                        `<div class="zs-sub">+1 Poder enquanto adjacente ao inspirador</div>` +
                    `</div>`
                );
            }
            if (card.silencedInHand) {
                parts.push(
                    `<div class="zoom-status silenced">` +
                        `<div class="zs-icon">🔮</div>` +
                        `<div class="zs-name">MALDIÇÃO DOS SETE MARES</div>` +
                        `<div class="zs-sub">Se este Campeão for o próximo invocado, entrará SEM habilidade.</div>` +
                    `</div>`
                );
            }
            if (card.corruptedNoHonor) {
                parts.push(
                    `<div class="zoom-status no-honor">` +
                        `<div class="zs-icon">💀</div>` +
                        `<div class="zs-name">SEM HONRA</div>` +
                        `<div class="zs-sub">O jogador que destruir este Campeão não ganha PV • Enquanto permanecer em campo</div>` +
                    `</div>`
                );
            }
            if (card.tapped) {
                parts.push(
                    `<div class="zoom-status tired">` +
                        `<div class="zs-icon">😴</div>` +
                        `<div class="zs-name">CANSADO</div>` +
                        `<div class="zs-sub">Já atacou neste turno — não pode atacar de novo até o próximo turno</div>` +
                    `</div>`
                );
            }
            return parts.length ? `<div class="zoom-status-stack">${parts.join("")}</div>` : "";
        }
        
        function gemOverlayHtml(c, opts) {
            if (!c || typeof c.currentPower !== "number" || typeof c.basePower !== "number") return "";
            if (window.DfCardFace?.isComposed?.(c)) return "";
            const showGem = c.currentPower !== c.basePower && c.currentPower >= 1;
            const animate = !!(opts && opts.animate) && typeof c.uid === "number";
        
            if (!animate) {
                if (!showGem) return "";
                const n = Math.min(10, c.currentPower);
                return `<img class="gem-overlay" src="${window.dfAssetUrl(`gems/${n}.png`)}" alt="">`;
            }
        
            const prev = gemAnimState.get(c.uid);
            const prevPower = prev ? prev.power : c.basePower;
            const prevShowGem = prev ? prev.hadGem : false;
        
            let html = "";
            if (showGem) {
                let animClass = "";
                if (!prevShowGem || c.currentPower > prevPower) animClass = "gem-anim-buff";
                else if (c.currentPower < prevPower && !global.__dfSuppressPowGemAnim) animClass = "gem-anim-debuff";
                const n = Math.min(10, c.currentPower);
                html = `<img class="gem-overlay${animClass ? " " + animClass : ""}" src="${window.dfAssetUrl(`gems/${n}.png`)}" alt="">`;
            } else if (prevShowGem) {
                // Returned to base power: render a fading ghost of the
                // previous gem so the disappearance has a brief fade.
                const n = Math.min(10, prevPower);
                html = `<img class="gem-overlay gem-anim-fadeout" src="${window.dfAssetUrl(`gems/${n}.png`)}" alt="">`;
            }
        
            gemAnimState.set(c.uid, { power: c.currentPower, hadGem: showGem });
            return html;
        }
        
        function updateCardPreview() {
            /* Pré-visualização lateral removida — #preview-card-inner só
               existe pro zoom (openCardZoom). Não preencher em updateUI:
               se .preview-zoomed vazar de sessão anterior, vira carta
               gigante no centro no início da partida. */
        }
        
        function _cardFieldFlags(c) {
            if (!c) return "";
            return [
                c.tapped ? 1 : 0, c.frozen ? 1 : 0, c.freeAttack ? 1 : 0, c.shielded ? 1 : 0,
                c.barrier ? 1 : 0, c.vulnerable ? 1 : 0, c._summoning ? 1 : 0, c.silenced ? 1 : 0,
                c.poisoned ? 1 : 0, c.fury ? 1 : 0, c.pulled ? 1 : 0, c.inspiracao ? 1 : 0,
                c.mimico ? 1 : 0, c.wallBuff ? 1 : 0, c.guerraBuff ? 1 : 0, c.foreverGrowth ? 1 : 0,
                c.fireAura ? 1 : 0, c.burning ? 1 : 0, c.burningTurns || 0, c.corruptedNoHonor ? 1 : 0,
                c.currentPower, c.shieldedTurns || 0, c.frozenTurns || 0,
                c.barrierTurns || 0, c.poisonTurns || 0, c.furyTurns || 0, c.furyStacks || 0, c.guerraBuffTurns || 0,
            ].join("");
        }

        /** Só uid/nome/slots — mudança estrutural exige rebuild completo. */
        function _cardFieldStruct(c, i) {
            if (!c) return `${i}:`;
            return `${i}:${c.uid || c.name}`;
        }

        function buildStatusCrownHtml(c) {
            if (!c) return "";
            const crownIcons = [];
            if (c.shielded) {
                const permanent = !!c.shieldedPermanent || (c.shieldedTurns ?? 0) <= 0;
                const t = c.shieldedTurns || 1;
                crownIcons.push(
                    `<div class="status-icon shield" title="${permanent ? "Proteção permanente" : `Protegido (${t} ${t === 1 ? "rodada" : "rodadas"})`}">` +
                        `<span class="si-glyph">🛡</span>` +
                    `</div>`
                );
            }
            if (c.barrier) {
                const perm = !!c.barrierPermanent;
                const t = perm ? "∞" : (c.barrierTurns || 2);
                const tip = perm
                    ? "Barreira permanente — bloqueia 1ª redução de Poder; imune a Transformar em Bichinho"
                    : `Barreira — bloqueia 1ª redução de Poder (${t} ${t === 1 || t === "∞" ? "rodada" : "rodadas"})`;
                crownIcons.push(
                    `<div class="status-icon barrier" title="${tip}">` +
                        `<span class="si-glyph">⬡</span>` +
                    `</div>`
                );
            }
            if (c.fireAura && c.fireAuraTurns > 0) {
                const t = c.fireAuraTurns || 3;
                crownIcons.push(
                    `<div class="status-icon fire-aura" title="Aura de Fogo — ao morrer, -1 Poder em adversário (${t} ${t === 1 ? "rodada" : "rodadas"})">` +
                        `<span class="si-glyph">🔥</span>` +
                    `</div>`
                );
            }
            if (c.burning && c.burningTurns > 0) {
                const t = c.burningTurns || 4;
                crownIcons.push(
                    `<div class="status-icon em-chamas" title="Em Chamas — −1 Poder após a manutenção (${t} ${t === 1 ? "rodada" : "rodadas"})">` +
                        `<span class="si-glyph">🔥</span>` +
                        `<span class="si-counter">${t}</span>` +
                    `</div>`
                );
            }
            if (c.frozen) {
                const t = c.frozenTurns || 2;
                crownIcons.push(
                    `<div class="status-icon frozen" title="Congelado (${t} ${t === 1 ? "rodada" : "rodadas"})">` +
                        `<span class="si-glyph">❄</span>` +
                    `</div>`
                );
            }
            if (c.freeAttack) {
                crownIcons.push(
                    `<div class="status-icon charge" title="Investida: ataque livre neste turno">` +
                        `<span class="si-glyph">🪓</span>` +
                    `</div>`
                );
            }
            if (c.fury) {
                const t = c.furyTurns || 1;
                const stacks = deps.DfRules?.getFuryStacks?.(c) || c.furyStacks || 1;
                crownIcons.push(
                    `<div class="status-icon fury" title="Fúria — +${stacks} Poder, ${stacks} carga${stacks === 1 ? "" : "s"} (${t} ${t === 1 ? "rodada" : "rodadas"})">` +
                        `<span class="si-glyph">💢${stacks > 1 ? `<small>${stacks}</small>` : ""}</span>` +
                    `</div>`
                );
            }
            if (c.silenced) {
                crownIcons.push(
                    `<div class="status-icon silenced" title="Silêncio: sem habilidade (permanente)">` +
                        `<span class="si-glyph si-silence-bubble">` +
                            `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
                                `<path fill="#fff" stroke="#222" stroke-width="1.2" stroke-linejoin="round" ` +
                                    `d="M3 5 h18 a1 1 0 0 1 1 1 v10 a1 1 0 0 1 -1 1 H10 l-4 3 v-3 H3 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 z"/>` +
                                `<circle cx="8"  cy="11" r="1.5" fill="#222"/>` +
                                `<circle cx="12" cy="11" r="1.5" fill="#222"/>` +
                                `<circle cx="16" cy="11" r="1.5" fill="#222"/>` +
                            `</svg>` +
                        `</span>` +
                    `</div>`
                );
            }
            if (c.pulled) {
                const t = c.pulledTurns || 1;
                crownIcons.push(
                    `<div class="status-icon pulled" title="Puxado por ${t} rodada${t === 1 ? "" : "s"} — não ataca nem é atacado">` +
                        `<span class="si-glyph">🪝</span>` +
                    `</div>`
                );
            }
            if (c.tapped) {
                crownIcons.push(
                    `<div class="status-icon tired" title="Cansado — já atacou neste turno">` +
                        `<span class="si-glyph">😴</span>` +
                    `</div>`
                );
            }
            if (c.poisoned) {
                const t = c.poisonTurns || 1;
                crownIcons.push(
                    `<div class="status-icon poisoned" title="Envenenado — morre em ${t} rodada${t === 1 ? "" : "s"}">` +
                        `<span class="si-glyph">🐍</span>` +
                    `</div>`
                );
            }
            if (c.corruptedNoHonor) {
                crownIcons.push(
                    `<div class="status-icon no-honor" title="Sem Honra — o jogador que destruir este Campeão não ganha PV">` +
                        `<span class="si-glyph">💀</span>` +
                    `</div>`
                );
            }
            if (c.vulnerable) {
                crownIcons.push(
                    `<div class="status-icon vulnerable" title="Vulnerável — destruído ao receber qualquer redução de Poder">` +
                        `<span class="si-glyph">☣</span>` +
                    `</div>`
                );
            }
            if (c.foreverGrowth) {
                crownIcons.push(
                    `<div class="status-icon forever-growth" title="Força Infinita — +1 de Poder por rodada">` +
                        `<span class="si-glyph">💪</span>` +
                    `</div>`
                );
            }
            if (c.wallBuff) {
                crownIcons.push(
                    `<div class="status-icon wall-buff" title="Muralha — proteção permanente até perder Poder">` +
                        `<span class="si-glyph">🧱</span>` +
                    `</div>`
                );
            }
            if (c.guerraBuff) {
                const t = c.guerraBuffTurns || 1;
                crownIcons.push(
                    `<div class="status-icon guerra-buff" title="Guerra — Sobrepujar por ${t} rodada${t === 1 ? "" : "s"}">` +
                        `<span class="si-glyph">⚔️</span>` +
                    `</div>`
                );
            }
            if (c.mimico) {
                const cop = c.mimicAbilityName ? `: ${c.mimicAbilityName}` : "";
                crownIcons.push(
                    `<div class="status-icon mimico" title="Mimico — habilidade copiada${cop}">` +
                        `<span class="si-glyph">🎭</span>` +
                    `</div>`
                );
            }
            if (c.inspiracao) {
                crownIcons.push(
                    `<div class="status-icon inspiracao" title="Inspiração — +1 de Poder enquanto adjacente ao inspirador">` +
                        `<span class="si-glyph">✨</span>` +
                    `</div>`
                );
            }
            const crownN = crownIcons.length;
            if (!crownN) return "";
            const crownDensity = crownN >= 6 ? " status-crown-d6"
                : crownN >= 4 ? " status-crown-d4"
                : crownN >= 3 ? " status-crown-d3" : "";
            return `<div class="status-crown${crownDensity}">${crownIcons.join("")}</div>`;
        }

        function patchFieldCardDom(cd, c, p, i) {
            if (!cd || !c) return;
            // Durante summon-fly / _summoning: não reconstruir nem re-mostrar o slot alvo.
            if (c._summoning || cd.classList.contains("is-summoning")) {
                cd.classList.add("is-summoning");
                cd.style.visibility = "hidden";
                cd.style.opacity = "0";
                return;
            }
            if (document.querySelector(".summon-fly")
                && window.__dfLocalSummonUid
                && c.uid != null
                && String(c.uid) === String(window.__dfLocalSummonUid)) {
                cd.classList.add("is-summoning");
                cd.style.visibility = "hidden";
                cd.style.opacity = "0";
                return;
            }
            let extra = "ccard df-field-static " + getCardTypeClass(c);
            if (c.tapped) extra += " tapped";
            if (c.frozen) extra += " frozen";
            if (c.freeAttack) extra += " free-attack";
            if (c.shielded) extra += " shielded-aura";
            if (c.barrier) extra += " barrier-aura";
            if (c.vulnerable) extra += " vulnerable-aura";
            // Preserva classes de targeting/drag/combat aplicadas fora deste patch.
            const keep = ["hl", "valid-target", "target", "attacker", "combat-src-hidden",
                "field-drag-src", "field-present-landscape", "combat-animating",
                "df-target-levitating", "vt-red", "vt-green", "vt-blue", "vt-orange", "vt-purple",
                "ritual-drag-target", "drag-attack-target"];
            const kept = keep.filter((k) => cd.classList.contains(k));
            cd.className = extra + (kept.length ? " " + kept.join(" ") : "");
            cd.dataset.player = String(p);
            cd.dataset.field = String(i);
            if (c.uid != null) cd.dataset.uid = String(c.uid);

            if (window.DfCardFace?.isComposed?.(c)) {
                window.DfCardFace.updatePower(cd, c.currentPower, { animate: true });
            } else {
                const pow = cd.querySelector(".pow");
                if (pow) pow.textContent = String(c.currentPower);
            }
            const nm = cd.querySelector(".nm");
            if (nm && nm.textContent !== c.name) nm.textContent = c.name;

            const crownHtml = buildStatusCrownHtml(c);
            let crown = cd.querySelector(".status-crown");
            if (crownHtml) {
                if (crown) crown.outerHTML = crownHtml;
                else cd.insertAdjacentHTML("afterbegin", crownHtml);
            } else if (crown) {
                crown.remove();
            }

            const setTint = (cls, on) => {
                let el = cd.querySelector("." + cls);
                if (on && !el) {
                    const div = document.createElement("div");
                    div.className = cls;
                    cd.insertBefore(div, cd.firstChild);
                } else if (!on && el) el.remove();
            };
            setTint("frozen-tint", !!c.frozen);
            setTint("shield-tint", !!c.shielded);
            setTint("barrier-tint", !!c.barrier);

            try {
                const gem = gemOverlayHtml(c, { animate: true });
                let gemEl = cd.querySelector(".gem-overlay");
                if (gem) {
                    if (gemEl) gemEl.outerHTML = gem;
                    else cd.insertAdjacentHTML("beforeend", gem);
                } else if (gemEl) {
                    gemEl.remove();
                }
            } catch (e) { /* */ }
        }
        
        function quadrantRenderFingerprint(p, pl, ctx) {
            const { handDragLive, fieldDragLive } = ctx;
            // Estrutura (slots/uid) + status/poder — patch incremental cobre só status.
            const fieldStruct = (pl.field || []).map((c, i) => _cardFieldStruct(c, i)).join(";");
            const fieldStatus = (pl.field || []).map((c) => _cardFieldFlags(c)).join(";");
            const fieldSig = `${fieldStruct}#${fieldStatus}`;
            const handSig = deps.dfIsLocalPlayer(p)
                ? (pl.hand || []).map((c, i) =>
                    `${i}:${c.uid || c.name}:${c.currentPower}:${c.silencedInHand ? 1 : 0}`).join(";")
                : `ai:${pl.hand?.length || 0}`;
            const td = deps.getTargetData() || {};
            const phaseBits = [
                deps.getGamePhase(), deps.getState().currentPlayer, getSelectedHand(), getSelectedFieldIdx(),
                (deps.getGamePhase() === "target-ally" || deps.getGamePhase() === "target-champion" ||
                    deps.getGamePhase() === "ultimate-target" || deps.getGamePhase() === "summon-placement")
                    ? JSON.stringify(td) : "",
            ].join("|");
            const dragBits = [
                fieldDragLive && window.__dfFieldDrag?.player === p ? `f${window.__dfFieldDrag.fieldIdx}` : "",
                handDragLive && deps.dfIsLocalPlayer(p) && window.__dfHandDrag?.idx != null
                    ? `h${window.__dfHandDrag.idx}` : "",
            ].join("");
            const talentBits = deps.getState().activeTalent?.ownerP === p
                ? `t:${deps.getState().activeTalent.card?.name}` : "";
            return `${p}|${pl.actions}|${pl.vp}|${pl.skipDraw ? 1 : 0}|${pl.skipNextAction ? 1 : 0}|${fieldSig}|${handSig}|${phaseBits}|${dragBits}|${talentBits}`;
        }
        
        function scheduleWarmArts(names) {
            const sig = (names || []).slice().sort().join(",");
            const handSig = (deps.dfLocalPlayer()?.hand || []).map((c) => c.name).join(",");
            const turn = deps.getState()?.turnNumber | 0;
            const now = Date.now();
            // Debounce: no máximo 1× por turno (ou se a mão mudou), não a cada updateUI.
            const sameSig = sig && sig === _lastWarmSig;
            const sameHand = handSig === _lastWarmHandSig;
            if (sameSig && sameHand && turn === _lastWarmTurn && (now - _lastWarmAt) < 12000) return;
            if (sameSig && sameHand && (now - _lastWarmAt) < 2500) return;
            if (!sig) return;
            _lastWarmSig = sig;
            _lastWarmHandSig = handSig;
            _lastWarmAt = now;
            _lastWarmTurn = turn;
            const run = () => {
                if (deps.dfLocalPlayer()?.hand?.length) {
                    window.dfWarmCardArts(deps.dfLocalPlayer().hand.map((c) => c.name), "high");
                }
                const localNames = new Set(deps.dfLocalPlayer()?.hand?.map((c) => c.name) || []);
                const rest = names.filter((n) => !localNames.has(n));
                if (rest.length) window.dfWarmCardArts(rest, "low");
            };
            if (typeof requestIdleCallback === "function") {
                requestIdleCallback(run, { timeout: 900 });
            } else {
                setTimeout(run, 0);
            }
        }
        
        function renderAllQuadrants() {
            const combatFreeze = !!window.__dfCombatActive;
            const targetingPhase = ["target-champion", "target-ally", "ultimate-target", "select-attacker", "select-defender"]
                .includes(deps.getGamePhase());
            // Pausa observers durante rebuild (evita fan/lock MO reagindo a cada child).
            window.__dfPauseHandFanMO?.(true);
            window.__dfPauseFieldLockMO?.(true);
            try {
            // Limpa lixo visual de gestos anteriores que podem ter
            // ficado órfãos (drag-ghost de campeão, summon-fly, banner
            // "SEM AÇÕES PRA ATACAR" persistente, e opacidade reduzida
            // em qualquer .ccard que sobrou de drag cancelado pelo
            // browser sem disparar pointerup). Sem essa limpeza, o
            // jogador via:
            //   • banner "SEM AÇÕES" fantasma mesmo com ações de sobra;
            //   • carta no campo semi-transparente após drag/summon;
            //   • cópias fantasmas voando.
            const handDragLive = !!(window.__dfHandDrag?.active || window.__dfHandDrag?.pending);
            const fieldDragLive = !!window.__dfFieldDrag?.active;
            const summonAnimLive = !!(
                document.querySelector(".summon-fly")
                || (window._summonLock && document.querySelector(".ccard.is-summoning"))
            );
            document.querySelectorAll(".drag-ghost").forEach((el) => {
                if (handDragLive && el.classList.contains("drag-ghost-hand")) return;
                if (fieldDragLive && el.classList.contains("drag-ghost-field")) return;
                el.remove();
            });
            if (!summonAnimLive) {
                document.querySelectorAll(".summon-fly, .drag-no-actions-banner").forEach(el => el.remove());
            }
            if (!handDragLive && !fieldDragLive && !combatFreeze) {
                const summonAnimLive = !!(
                    document.querySelector(".summon-fly")
                    || document.querySelector(".ccard.is-summoning")
                );
                document.querySelectorAll(".ccard").forEach(el => {
                    if (el.classList.contains("combat-src-hidden") || el.classList.contains("is-summoning")
                        || el.classList.contains("combat-animating")) return;
                    // Não mexer em opacidade dos outros campeões durante invocação.
                    if (summonAnimLive) return;
                    if (el.style.opacity && el.style.opacity !== "" && el.style.opacity !== "1") {
                        el.style.opacity = "";
                    }
                    if (el.style.visibility === "hidden") {
                        el.style.visibility = "";
                    }
                });
                document.body.classList.remove("dragging-card");
            }
        
            // ===== Indicador de turno MOBILE (#mobile-turn-indicator) =====
            // Atualiza o texto do box flutuante entre os quadrantes
            // (visível só no mobile/tablet via CSS). Sempre presente
            // durante o combate — mostra de quem é a vez agora.
            const mti = deps.$("mobile-turn-indicator");
            if (mti && window.DfCombatUi?.showTurnBox?.() !== false) {
                const nameEl = mti.querySelector(".mti-name");
                if (deps.getState().started && deps.getState().winner === null && deps.getState().currentPlayer != null) {
                    const openingRaw = window.__dfMatchOpeningSeat;
                    const hasOpening = openingRaw === 0 || openingRaw === 1
                        || openingRaw === "0" || openingRaw === "1";
                    const turnCp = hasOpening
                        ? Number(openingRaw)
                        : deps.getState().currentPlayer;
                    const cur = deps.getState().players[turnCp];
                    const curName = cur?.name || `Jogador ${turnCp + 1}`;
                    if (nameEl) nameEl.textContent = curName;
                    mti.classList.toggle("is-player", turnCp === deps.dfLocalSeat());
                    mti.classList.toggle("is-ai", turnCp !== deps.dfLocalSeat());
                } else {
                    if (nameEl) nameEl.textContent = "—";
                    mti.classList.remove("is-player", "is-ai");
                }
            }

            if (typeof window.__dfSyncMobileHubDock === "function") {
                const gameEl = deps.$("game");
                const inGame = gameEl && (gameEl.classList.contains("active") || gameEl.style.display === "flex");
                window.__dfSyncMobileHubDock(inGame);
                const at = deps.getState().activeTalent;
                if (at?.card != null) positionTalentSpotlightLayer(at.ownerP);
            }
        
            for (let qIdx = 0; qIdx < deps.getState().playersCount; qIdx++) {
                const p = deps.dfPlayerForQuadrant(qIdx);
                const q = deps.$(`quadrant-${qIdx}`);
                if (!q) continue;
                const pl = deps.getState().players[p];
                const hero = pl.heroDef || deps.getHeroDef(pl.heroId);
        
                // Borda verde brilhante no quadrante do jogador da vez —
                // indicador visual de "é a vez dele" que substitui o
                // antigo turn-pill do topo.
                const openingRaw = window.__dfMatchOpeningSeat;
                const hasOpening = openingRaw === 0 || openingRaw === 1
                    || openingRaw === "0" || openingRaw === "1";
                const turnCp = hasOpening
                    ? Number(openingRaw)
                    : deps.getState().currentPlayer;
                q.classList.toggle("active-turn",
                    deps.getState().started && deps.getState().winner === null && p === turnCp);
        
                const header = window.__dfQuadrantHeader?.(q) || q.querySelector(".quadrant-header");
                const heroIcon = header.querySelector(".hero-icon");
                const heroName = header.querySelector(".hero-name");
                const vpBadge = header.querySelector(".vp-badge");
                const actionDots = header.querySelector(".action-dots");
                const heroStats = header.querySelector(".hero-stats");
        
                if (hero) {
                    const heroKey = hero.image ? `${hero.image}|${hero.name}` : `e|${hero.emoji}|${hero.name}`;
                    if (heroIcon.dataset.dfHeroKey !== heroKey) {
                        heroIcon.dataset.dfHeroKey = heroKey;
                        if (hero.image) {
                            const heroSrc = typeof window.dfAssetUrl === "function"
                                ? window.dfAssetUrl(String(hero.image).split("?")[0])
                                : hero.image;
                            heroIcon.innerHTML = `<img src="${heroSrc}" alt="${hero.name}" decoding="async" loading="eager" fetchpriority="${p === 0 ? "high" : "low"}">`;
                            window.dfPrefetchArtUrl?.(heroSrc, p === 0 ? "high" : "low");
                        } else {
                            heroIcon.textContent = hero.emoji;
                        }
                    }
                    if (heroName.textContent !== hero.name) heroName.textContent = hero.name;
                } else {
                    heroIcon.dataset.dfHeroKey = "";
                    heroIcon.textContent = "❓";
                    heroName.textContent = pl.name;
                }
                // Clique na imagem do herói abre o modal de informações
                // com a ultimate dele em destaque + registro do jogo.
                heroIcon.title = "Ver Ultimate e Registro do jogo";
                heroIcon.onclick = (ev) => { ev.stopPropagation(); deps.openHeroInfo(p); };
                heroName.style.cursor = "pointer";
                heroName.onclick = (ev) => { ev.stopPropagation(); deps.openHeroInfo(p); };
                const isTurnQ = deps.getState().started && deps.getState().winner === null && p === turnCp;
                heroIcon.classList.toggle("turn-hero-active", isTurnQ);
                heroName.classList.toggle("turn-hero-active", isTurnQ);
                header?.classList.toggle("hero-hub-active-turn", isTurnQ);
                heroStats?.classList.toggle("hero-hub-active-turn", isTurnQ);
        
                vpBadge.textContent = `PV: ${pl.vp}${pl.skipDraw ? " 💀" : ""}${pl.skipNextAction ? " ⏳" : ""}`;
        
                const inMobileHub = !!header?.closest("#mobile-hub-stack");
                const maxUlt = deps.getMaxUltimateUses(pl.heroId);
                const maxActionDots = deps.MAX_ACTIONS ?? 3;
                const shownActions = Math.max(0, Math.min(pl.actions ?? 0, maxActionDots));
                if (inMobileHub) {
                    const ultLeft = Math.max(0, maxUlt - (pl.ultimateUses ?? 0));
                    actionDots.className = "action-dots hub-stat-box hub-stat-box-actions";
                    actionDots.innerHTML =
                        `<span class="hub-stat-box-label">⚡ Ações</span>` +
                        `<span class="hub-stat-num hub-stat-num-actions">${shownActions}</span>`;
                    heroStats.className = "hero-stats hub-stat-box hub-stat-box-ult";
                    heroStats.style.cssText = "";
                    heroStats.innerHTML =
                        `<span class="hub-stat-box-label">🔮 Ultimates</span>` +
                        `<span class="hub-stat-num hub-stat-num-ult">${ultLeft}</span>`;
                } else {
                    actionDots.className = "action-dots";
                    let dotsHTML = '';
                    for (let i = 0; i < maxActionDots; i++) dotsHTML +=
                        `<span class="dot ${i < shownActions ? "on" : ""}"></span>`;
                    actionDots.innerHTML = dotsHTML;
                    heroStats.className = "hero-stats";
                    heroStats.style.cssText = "display:flex;gap:3px;";
                    let ultDotsHTML = '';
                    for (let i = 0; i < maxUlt; i++) ultDotsHTML +=
                        `<span class="udot ${i < pl.ultimateUses ? "used" : "available"}"></span>`;
                    heroStats.innerHTML = ultDotsHTML;
                }
        
                const renderCtx = { handDragLive, fieldDragLive };
                const quadFp = quadrantRenderFingerprint(p, pl, renderCtx);
                const skipQuadBody = _quadRenderFp[qIdx] === quadFp && !fieldDragLive && !handDragLive;
                _quadRenderFp[qIdx] = quadFp;
                if (combatFreeze || skipQuadBody) continue;
                // Congela o DOM da mão/campo local durante o arraste (pending OU active) —
                // senão updateUI reconstrói .hand-wrap e mata o pointer capture (1º drag falha).
                // Ainda assim atualiza joias de poder no campo (Crescimento MP).
                if (handDragLive && deps.dfIsLocalPlayer(p)) {
                    try {
                        const fieldEl = q.querySelector(".quadrant-field");
                        pl.field?.forEach((c, fi) => {
                            if (!c || c.currentPower == null || !fieldEl) return;
                            const wraps = fieldEl.querySelectorAll(".field-card, .df-field-card, [data-uid]");
                            const cardEl = wraps[fi];
                            if (!cardEl) return;
                            const powEl = cardEl.querySelector?.(".pow, .df-card-face-pow, .power");
                            if (powEl) powEl.textContent = String(c.currentPower | 0);
                            try { window.DfCardFace?.updatePower?.(cardEl, c.currentPower | 0); } catch (e2) { /* */ }
                        });
                    } catch (e) { /* */ }
                    try { window.dfApplyCardArtsFast?.(q); } catch (e) { /* */ }
                    continue;
                }
        
                const field = q.querySelector(".quadrant-field");
                const label = field.querySelector(".quadrant-field-label");
                pl.field?.forEach((c) => window.dfPrefetchCardArt?.(c.name));

                const tryPatchLocalField = () => {
                    const cards = [...field.querySelectorAll(":scope > .ccard")];
                    const len = pl.field?.length || 0;
                    if (cards.length !== len) return false;
                    for (let i = 0; i < len; i++) {
                        const c = pl.field[i];
                        const cd = cards[i];
                        const nm = cd.querySelector(".nm")?.textContent;
                        if (nm !== c.name) return false;
                        if (c.uid != null && cd.dataset.uid && cd.dataset.uid !== String(c.uid)) {
                            return false;
                        }
                    }
                    // Estrutura ok — patch poder/status sem innerHTML wipe.
                    for (let i = 0; i < len; i++) {
                        patchFieldCardDom(cards[i], pl.field[i], p, i);
                    }
                    return true;
                };
                if (tryPatchLocalField()) {
                    try {
                        field.dataset.fieldCount = String(pl.field?.length || 0);
                        dfSyncFieldBannerAnchor(field, pl.field?.length || 0);
                    } catch (e) { /* */ }
                    try { syncTargetingHighlights(); } catch (e2) { /* */ }
                } else {
                field.innerHTML = '';
                field.appendChild(label);
                q.classList.remove("summon-placing");
                const showSummonSlots = false;
                const fieldLen = pl.field.length;
                field.dataset.fieldCount = String(fieldLen);
                /* Centraliza a fileira inteira: metade da largura do conjunto à
                   esquerda do centro do campo (refinado depois pelo banner). */
                try {
                    const n = fieldLen | 0;
                    if (n <= 0) {
                        field.style.removeProperty("--df-field-anchor-pad");
                    } else {
                        const rootCs = getComputedStyle(document.documentElement);
                        const cardW = parseFloat(rootCs.getPropertyValue("--df-field-card-w")) || 116;
                        const gap = 10;
                        const rowW = (n * cardW) + ((n - 1) * gap);
                        field.style.setProperty("--df-field-anchor-pad", `calc(50% - ${rowW * 0.5}px)`);
                    }
                } catch (e) { /* */ }
                const humanSeat = deps.dfHumanSeat?.() ?? deps.dfLocalSeat?.() ?? 0;
                const playerDesktopField = p === humanSeat
                    && window.matchMedia?.("(min-width: 901px)")?.matches
                    && !document.documentElement.classList.contains("df-mobile");
                const fieldFrag = document.createDocumentFragment();
                pl.field.forEach((c, i) => {
                    if (showSummonSlots) field.appendChild(makeSummonInsertSlot(i, fieldLen));
                    const cd = document.createElement("div");
                    let extra = ''; if (c.tapped) extra += " tapped"; if (c.frozen) extra +=
                        " frozen"; if (c.freeAttack) extra += " free-attack"; if (c.shielded) extra += " shielded-aura";
                        if (c.barrier) extra += " barrier-aura";
                        if (c.vulnerable) extra += " vulnerable-aura";
                    cd.className = `ccard df-field-static ${getCardTypeClass(c)}${extra}`;
                    cd.id = `champ-${p}-${i}`;
                    cd.dataset.player = p;
                    cd.dataset.field = i;
                    if (c.uid != null) cd.dataset.uid = String(c.uid);
                    if (fieldLen >= 6 && i >= 5 && !window.DfLayout?.isCanvasFieldLayout?.()) {
                        if (!playerDesktopField) {
                            cd.classList.add("field-present-landscape");
                        }
                    }
                    // Anti-DUPLICAÇÃO durante invocação: a carta no
                    // campo fica invisível enquanto o clone .summon-fly
                    // voa da mão até o slot. Como updateUI() recria
                    // todo o quadrante, precisamos checar a flag aqui
                    // pra que re-renderes durante a animação NÃO
                    // mostrem a carta real por trás do clone (o bug
                    // do "campeão duplicado" reportado pelo usuário).
                    if (c._summoning) {
                        cd.classList.add("is-summoning");
                        cd.style.visibility = "hidden";
                        cd.style.opacity = "0";
                    }
                    if (fieldDragLive &&
                        window.__dfFieldDrag?.player === p &&
                        window.__dfFieldDrag?.fieldIdx === i) {
                        cd.classList.add("field-drag-src");
                        // Inline + classe: se body.dragging-card sumir no
                        // meio do gesto (re-render, blur), a fonte não
                        // reaparece por cima do fantasma (duplicata).
                        cd.style.visibility = "hidden";
                        cd.style.opacity = "0";
                        cd.style.pointerEvents = "none";
                    }
                    // Só esconde o slot DEPOIS que Pixi/clones estão visíveis
                    // (__dfCombatSourcesHidden). Esconder cedo = campeões sumindo
                    // no buraco entre warm e o 1º frame da cena.
                    const combatHide = window.__dfCombatActive;
                    const sourcesHidden = !!window.__dfCombatSourcesHidden;
                    const scareHide = window.__dfScareReturnActive;
                    if (scareHide
                        && scareHide.p === p && scareHide.i === i) {
                        cd.classList.add("scare-src-hidden", "combat-src-hidden");
                        cd.style.setProperty("visibility", "hidden", "important");
                        cd.style.setProperty("opacity", "0", "important");
                        cd.style.setProperty("pointer-events", "none", "important");
                    } else if (sourcesHidden && combatHide
                        && ((combatHide.attOwner === p && combatHide.attIdx === i)
                            || (combatHide.defOwner === p && combatHide.defIdx === i))
                        // Se o slot já é de OUTRO campeão (campo reordenou no meio
                        // da cena), esconder por índice fazia campeões vivos sumirem.
                        && (!combatHide.uids?.length || c.uid == null
                            || combatHide.uids.includes(String(c.uid)))) {
                        // updateUI recria o DOM — reaplica hide anti-duplicata.
                        cd.classList.add("combat-src-hidden");
                        cd.style.visibility = "hidden";
                        cd.style.opacity = "0";
                        cd.style.pointerEvents = "none";
                    }
                    /* Combate: reaplica ocultação nos slots do choque. */
                    // INVESTIDA agora vive na coroa (medalhão laranja),
                    // mesmo formato do escudo/floco — pedido do usuário
                    // pra padronizar o visual dos status.
                    const axeBadge    = '';
                    const statusCrown = buildStatusCrownHtml(c);
                    // Overlay azul translúcido cobrindo a arte quando o
                    // campeão está congelado — filho REAL (não pseudo)
                    // pra não colidir com `.ccard.has-art::after` (brilho
                    // dourado). Fica abaixo do .status-crown (z-index 4 vs 14).
                    const frozenTint = c.frozen ? '<div class="frozen-tint"></div>' : '';
                    const shieldTint = c.shielded ? '<div class="shield-tint"></div>' : '';
                    const barrierTint = c.barrier ? '<div class="barrier-tint"></div>' : '';
                    cd.innerHTML =
                        `${axeBadge}${shieldTint}${barrierTint}${frozenTint}${statusCrown}<div class="pow">${c.currentPower}</div><div class="nm">${c.name}</div>${gemOverlayHtml(c, {animate: true})}`;
                    if (window.DfCardFace?.isComposed?.(c)) {
                        window.DfCardFace.mount(cd, c, { power: c.currentPower, animate: true });
                    }
                    if (deps.getGamePhase() === "select-attacker" && deps.dfIsLocalPlayer(p) && i === getSelectedFieldIdx()) cd.classList
                        .add("hl");
                    if (deps.getGamePhase() === "select-attacker" && deps.dfIsLocalPlayer(p) && !c.tapped && !c.frozen && !c.pulled)
                        cd.classList.add("valid-target");
                    if (deps.getGamePhase() === "select-defender" && p !== deps.getTargetData().attackerOwner && i ===
                        getSelectedEnemyIdx() && p === deps.getTargetData().currentEnemyPlayer) cd.classList.add("hl");
                    if (deps.getGamePhase() === "select-defender" && p !== deps.getTargetData().attackerOwner && !c.shielded) {
                        // RESISTENTE não recebe borda verde como alvo válido
                        // quando o ataque é proibido (Sobrepujar/Investida) ou
                        // quando o atacante não tem Ações suficientes (precisa 2).
                        const att = deps.getState().players[deps.getTargetData().attackerOwner]?.field[deps.getTargetData().attackerIdx];
                        let allowed = true;
                        if (isResistente(c)) {
                            if (cannotHitResistente(att)) allowed = false;
                            else if (!att?.freeAttack && deps.getState().players[dfHumanSeat()]?.actions < 2) allowed = false;
                        }
                        if (allowed) cd.classList.add("valid-target");
                    }
                    if (deps.getGamePhase() === "target-champion") { const t = deps.getTargetData().targets[deps.getTargetData()
                            .targetIndex]; if (t && t.p === p && t.i === i) cd.classList.add(
                        "target");
                        if (deps.getTargetData().targets?.some(tg => tg.p === p && tg.i === i)) cd.classList.add("valid-target"); }
                    if (deps.getGamePhase() === "target-ally") { const t = deps.getTargetData().allyTargets[deps.getTargetData()
                            .targetIndex]; if (t && t.p === p && t.i === i) cd.classList.add("hl");
                        if (deps.getTargetData().allyTargets?.some(tg => tg.p === p && tg.i === i)) cd.classList.add("valid-target"); }
                    if (deps.getGamePhase() === "ultimate-target") { const t = deps.getTargetData().targets[deps.getTargetData()
                            .targetIndex]; if (t && t.p === p && t.i === i) cd.classList.add(
                        "target");
                        if (deps.getTargetData().targets?.some(tg => tg.p === p && tg.i === i)) cd.classList.add("valid-target"); }
                    if (deps.getGamePhase() === "select-defender" && p === deps.getTargetData().attackerOwner && i === deps.getTargetData()
                        .attackerIdx) cd.classList.add("attacker");
                    if (cd.classList.contains("valid-target")) {
                        const phase = deps.getGamePhase();
                        const td = deps.getTargetData() || {};
                        const vt = dfPickValidTargetBorder(phase, td.ability, td.ultimate);
                        if (vt) cd.classList.add(vt);
                        window.dfClearPlayerFieldHighlightInline?.(cd);
                    }
                    cd.addEventListener("click", (ev) => {
                        const isTargetPhase = ["target-champion", "target-ally", "ultimate-target"].includes(deps.getGamePhase());
                        if (!isTargetPhase && cd.dataset.fpFired === "1") {
                            cd.dataset.fpFired = "";
                            ev.preventDefault?.();
                            ev.stopPropagation?.();
                            return;
                        }
                        if (isTargetPhase) ev.stopPropagation();
                        // Mira/zoom: resolver pelo centro sob o clique (não só o node do topo).
                        let clickP = p;
                        let clickI = i;
                        if (isTargetPhase || !deps.dfIsLocalPlayer(p)) {
                            const near = dfNearestFieldCardAt(ev.clientX, ev.clientY, {
                                player: p,
                                maxDist: 90,
                            });
                            if (near && near.el) {
                                clickP = near.p;
                                clickI = near.i;
                            }
                        }
                        onChampionClick(clickP, clickI);
                    });
                    // Arrastar campeão próprio sobre inimigo inicia combate direto.
                    {
                        let fpFired = false, fSX = 0, fSY = 0;
                        let dragMode = false, dragGhost = null, dragPointerId = null;
                        // Pointer REALMENTE pressionado nesta carta (pointerdown→up).
                        // No desktop o mouse dispara pointermove só por HOVER (sem
                        // botão). Sem este flag, a distância até (fSX,fSY=0 antes do
                        // 1º pointerdown) estourava o threshold e iniciava o arrasto
                        // só passando o mouse — a carta sumia e o fantasma seguia o
                        // cursor (a carta em campo "mexia" e "duplicava").
                        let pointerDown = false;
                        // Alvo com snap ativo no último pointermove — no mobile o
                        // dedo costuma soltar longe do inimigo enquanto o fantasma
                        // já está encaixado no alvo; finishDrag usa este fallback.
                        let lastSnapTarget = null;
                        let hadSnapDuringDrag = false;
                        // Limiar baixo: o arrasto precisa “pegar” no primeiro movimento curto.
                        const dragThreshold = window.DfLayout?.isTouchGameplay?.() ? 5 : 7;
                        // Hold → arrasto. Hold longo para clique curto ainda abrir zoom.
                        const DRAG_HOLD_MS = 350;
                        let holdDragTimer = null;
                        let holdDragArmed = false;
                        // Rect ORIGINAL da carta (em coords de viewport) capturado
                        // no início do drag. Se o jogador soltar o dedo dentro
                        // desse retângulo, consideramos cancelamento — "voltei
                        // a carta pra posição inicial" igual o usuário pediu.
                        let originRect = null;
                        // Banner "SEM AÇÕES" overlay durante o drag quando não
                        // dá pra atacar — mostra de cara, sem precisar tentar
                        // soltar em alguém pra descobrir.
                        let noActionsBanner = null;
                        const fClear = () => {};
                        const clearHoldDragTimer = () => {
                            if (holdDragTimer) {
                                clearTimeout(holdDragTimer);
                                holdDragTimer = null;
                            }
                        };
                        const canStartDrag = () => {
                            deps.ensureTurnReady?.();
                            if (window.__DF_ONLINE && !deps.dfIsMyTurn()) {
                                try {
                                    window.__dfTurnEndingPending = false;
                                    window.__dfTurnEndingStuckAt = 0;
                                    if (!window.__dfOnlineMatchBoot) {
                                        window.__dfMatchOpeningSeat = null;
                                        window.__dfOnlineBootLockInput = false;
                                    }
                                    // Combate órfão bloqueava ataque com ações sobrando.
                                    if (!deps.dfIsCombatPresentationLive?.()) {
                                        try { deps.dfCombatForceCleanup?.(); } catch (eCf) { /* */ }
                                        window.__dfCombatActive = null;
                                        window.__dfCombatPending = null;
                                        document.body.classList.remove("df-combat-active");
                                    }
                                    deps.ensureTurnReady?.();
                                } catch (eU) { /* */ }
                            }
                            const cardBusy = cd.classList.contains("is-summoning")
                                || cd.classList.contains("df-summon-busy")
                                || cd.dataset.dfFieldAnimating === "1";
                            const phase = deps.getGamePhase();
                            const phaseOk = phase === "normal"
                                || (phase === "select-attacker"
                                    && deps.dfIsLocalPlayer(p)
                                    && getSelectedFieldIdx() === i);
                            return deps.dfIsLocalPlayer(p) && phaseOk &&
                                deps.dfIsMyTurn() && !getPendingSummon() && !cardBusy &&
                                !deps.dfIsCombatBlockingField?.() &&
                                !deps.getState().players[dfHumanSeat()].field[i]?.tapped &&
                                !deps.getState().players[dfHumanSeat()].field[i]?.frozen;
                        };
                        const hasActionsForAttack = () => {
                            const a = deps.getState().players[dfHumanSeat()]?.field[i];
                            return !!a && (a.freeAttack || deps.getState().players[dfHumanSeat()].actions >= 1);
                        };
                        const showNoActionsBanner = () => {
                            if (noActionsBanner) return;
                            const b = document.createElement("div");
                            b.className = "drag-no-actions-banner";
                            b.textContent = "⚠ SEM AÇÕES PRA ATACAR";
                            document.body.appendChild(b);
                            noActionsBanner = b;
                        };
                        const enterFieldDrag = (x, y) => {
                            dragMode = true;
                            fpFired = true; // suprime click
                            cd.dataset.fpFired = "1"; // p/ o click handler ler
                            window.dfMarkFieldCardDragging?.(cd, true);
                            document.body.classList.add("dragging-card");
                            try {
                                if (window.__DF_ONLINE || document.body.classList.contains("df-pvp-mode")) {
                                    document.body.classList.add("df-mp-field-drag");
                                }
                            } catch (eFd) { /* */ }
                            // Esconde a fonte via inline style — NÃO via
                            // classe global. Garante que mesmo se body.
                            // dragging-card ficar órfão, a cd só some
                            // quando ESTE drag específico realmente começa.
                            originRect = cd.getBoundingClientRect();
                            // Ghost no BODY (escapa stacking context dos
                            // quadrantes — sem isso, no mobile a carta
                            // arrastada renderiza ATRÁS do campo do
                            // oponente e o jogador não consegue atacar).
                            // Clona ANTES de esconder a fonte — cloneNode
                            // copia visibility:hidden e o fantasma sumia.
                            dragGhost = dfCreateFieldDragGhost(cd, x, y);
                            window.__dfFieldDrag = { player: p, fieldIdx: i, active: true };
                            cd.classList.add("field-drag-src");
                            cd.style.visibility = "hidden";
                            // NADA de banner "SEM AÇÕES" preventivo, nem
                            // ghost vermelho. Usuário pediu: deve poder
                            // arrastar livremente pelo mapa SEM nenhum
                            // aviso. O aviso só faz sentido se ele
                            // SOLTAR em cima de um inimigo (verificado
                            // em finishDrag → flashInsufficientActions).
                            // Antes, mostrar o aviso já no início do
                            // gesto travava a UX e confundia o jogador.
                        };
                        // Detecta sobre qual carta inimiga o dedo está agora.
                        // Ignora o próprio ghost (elementFromPoint pode bater nele).
                        const findEnemyCardAt = (x, y) => {
                            const pvp = !!(window.__DF_ONLINE || document.body.classList.contains("df-pvp-mode"));
                            let el = null;
                            let cc = null;
                            let tp = NaN;
                            let ti = NaN;
                            // Preferir stack completo: HUD / glow / moldura cobrem o .ccard
                            // da ponta direita no MP — elementFromPoint sozinho falha.
                            try {
                                const stack = typeof document.elementsFromPoint === "function"
                                    ? document.elementsFromPoint(x, y)
                                    : [document.elementFromPoint(x, y)];
                                for (let s = 0; s < (stack || []).length; s++) {
                                    const node = stack[s];
                                    if (!node || (dragGhost && (node === dragGhost || dragGhost.contains(node)))) continue;
                                    const hit = node.closest?.(".ccard");
                                    if (!hit || !hit.closest?.(".quadrant-field")) continue;
                                    const hp = Number(hit.dataset.player);
                                    const hi = Number(hit.dataset.field);
                                    if (Number.isNaN(hp) || Number.isNaN(hi) || deps.dfIsLocalPlayer(hp)) continue;
                                    cc = hit;
                                    tp = hp;
                                    ti = hi;
                                    el = node;
                                    break;
                                }
                            } catch (_) { /* */ }
                            if (!cc) {
                                el = document.elementFromPoint(x, y);
                                if (dragGhost && el && (el === dragGhost || dragGhost.contains(el))) {
                                    const prev = dragGhost.style.visibility;
                                    dragGhost.style.visibility = "hidden";
                                    el = document.elementFromPoint(x, y);
                                    dragGhost.style.visibility = prev;
                                }
                                cc = el?.closest?.(".ccard") || null;
                                tp = cc ? Number(cc.dataset.player) : NaN;
                                ti = cc ? Number(cc.dataset.field) : NaN;
                            }
                            // Fallback: centro mais próximo (levitate/z-index/HUD).
                            if (!cc || Number.isNaN(tp) || Number.isNaN(ti) || deps.dfIsLocalPlayer(tp)) {
                                const near = dfNearestFieldCardAt(x, y, {
                                    excludeLocal: true,
                                    maxDist: pvp ? 200 : 140,
                                });
                                if (!near) return null;
                                cc = near.el;
                                tp = near.p;
                                ti = near.i;
                            }
                            if (deps.dfIsLocalPlayer(tp)) return null;
                            const enemy = deps.getState().players[tp]?.field[ti];
                            if (!enemy || enemy.shielded || enemy.pulled) return null;
                            const att = deps.getState().players[dfHumanSeat()]?.field[i];
                            if (!canAttackerTargetDefender(att, enemy)) {
                                if (isPesadoDemais(att) && isResistente(enemy)) return null;
                                if (isResistente(enemy) && cannotHitResistente(att)) return null;
                                if (isResistente(enemy) && !attackIsFree(att) && deps.getState().players[dfHumanSeat()].actions < 2) return null;
                                if (isPesadoDemais(att) && !attackIsFree(att) && deps.getState().players[dfHumanSeat()].actions < 2) return null;
                                return null;
                            }
                            const atkCost = getAttackActionCost(att, enemy);
                            if (!attackIsFree(att) && deps.getState().players[dfHumanSeat()].actions < atkCost) return null;
                            return { p: tp, i: ti, el: cc };
                        };
                        // Detecta se o dedo voltou pra cima da carta original
                        // (cancelar ataque).
                        const isOverOrigin = (x, y) => {
                            if (!originRect) return false;
                            return x >= originRect.left && x <= originRect.right &&
                                   y >= originRect.top  && y <= originRect.bottom;
                        };
                        cd.addEventListener("pointerdown", (ev) => {
                            // Antes só aceitava toque ("touch"); agora aceita
                            // também mouse no desktop pra atacar arrastando.
                            if (ev.button !== undefined && ev.button !== 0) return;
                            deps.ensureTurnReady?.();
                            if (!deps.dfIsCombatPresentationLive?.()) {
                                document.querySelectorAll(".ccard.combat-src-hidden").forEach((el) => {
                                    deps.dfRestoreCombatFieldCard?.(el);
                                });
                            }
                            // Limpa banner "SEM AÇÕES" e qualquer drag-ghost
                            // órfão de um gesto anterior que não terminou
                            // direito (browser cancelou sem disparar
                            // pointerup/pointercancel). Sem isso o banner
                            // ficava fixo na tela mesmo com ações sobrando.
                            document.querySelectorAll(".drag-no-actions-banner, .drag-ghost")
                                .forEach(el => el.remove());
                            // Limpa estados ÓRFÃOS de drags anteriores que
                            // não terminaram direito (mouse saiu do iframe,
                            // pointerup perdido). Sem isso, body.dragging-
                            // card e cd.style.visibility ficavam fixos e
                            // o próximo click "sumia" as cartas.
                            document.body.classList.remove("dragging-card");
                            const combatBlocking = deps.dfIsCombatBlockingField?.() ?? !!window.__dfCombatActive;
                            document.querySelectorAll(".ccard").forEach(el => {
                                if (el.classList.contains("combat-animating") ||
                                    el.classList.contains("combat-src-hidden") ||
                                    combatBlocking) return;
                                if (el.style.visibility === "hidden") el.style.visibility = "";
                                if (el.style.opacity === "0") el.style.opacity = "";
                                el.style.pointerEvents = "";
                                el.classList.remove(
                                    "dragging-src", "field-dragging", "snap-enemy", "field-drag-src"
                                );
                            });
                            noActionsBanner = null;
                            fSX = ev.clientX; fSY = ev.clientY; fpFired = false;
                            cd.dataset.fpFired = "";
                            dragMode = false; dragGhost = null; dragPointerId = ev.pointerId;
                            pointerDown = true;
                            holdDragArmed = false;
                            clearHoldDragTimer();
                            originRect = null;
                            lastSnapTarget = null;
                            hadSnapDuringDrag = false;
                            if (canStartDrag()) {
                                try { cd.setPointerCapture(ev.pointerId); } catch {}
                                holdDragTimer = setTimeout(() => {
                                    holdDragTimer = null;
                                    if (!pointerDown || dragMode || fpFired) return;
                                    if (!canStartDrag()) return;
                                    holdDragArmed = true;
                                    enterFieldDrag(fSX, fSY);
                                }, DRAG_HOLD_MS);
                            }
                        });
                        cd.addEventListener("pointermove", (ev) => {
                            // HOVER NÃO ARRASTA. Só inicia o gesto se o pointer
                            // estiver de fato pressionado nesta carta (pointerdown
                            // ocorreu) e for o mesmo pointer. No mouse exigimos o
                            // botão pressionado (ev.buttons) — assim o simples
                            // hover do desktop nunca esconde a carta nem cria o
                            // fantasma. Auto-cura: se um pointerup foi perdido, o
                            // flag é zerado ao detectar o botão solto.
                            if (!dragMode) {
                                if (!pointerDown || ev.pointerId !== dragPointerId) return;
                                if (ev.pointerType === "mouse" && !(ev.buttons & 1)) {
                                    pointerDown = false;
                                    clearHoldDragTimer();
                                    return;
                                }
                            }
                            const dx = ev.clientX - fSX, dy = ev.clientY - fSY;
                            if (!dragMode && Math.hypot(dx, dy) > dragThreshold) {
                                clearHoldDragTimer();
                                fClear();
                                const previewOpen = document.getElementById("preview-backdrop")?.classList.contains("active");
                                const overlayOpen = document.querySelector(".overlay.active");
                                if (fpFired || previewOpen || overlayOpen) return;
                                if (canStartDrag()) {
                                    enterFieldDrag(ev.clientX, ev.clientY);
                                }
                            }
                            if (dragMode && dragGhost) {
                                const tgt = findEnemyCardAt(ev.clientX, ev.clientY);
                                let gx = ev.clientX, gy = ev.clientY;
                                if (tgt) {
                                    const r = tgt.el.getBoundingClientRect();
                                    const tx = r.left + r.width / 2;
                                    const ty = r.top  + r.height / 2;
                                    gx = tx * 0.7 + ev.clientX * 0.3;
                                    gy = ty * 0.7 + ev.clientY * 0.3;
                                }
                                window.DfLayout?.positionDragGhost?.(dragGhost, gx, gy);
                                dragGhost.classList.toggle("snap", !!tgt);
                                document.querySelectorAll(".ccard.drag-attack-target").forEach(el => el.classList.remove("drag-attack-target"));
                                if (tgt) {
                                    lastSnapTarget = { p: tgt.p, i: tgt.i, el: tgt.el };
                                    hadSnapDuringDrag = true;
                                    tgt.el.classList.add("drag-attack-target");
                                    window.DfTargetLevitate?.sync?.();
                                }
                            }
                        });
                        const resolveDragDropTarget = (clientX, clientY) => {
                            let tgt = findEnemyCardAt(clientX, clientY);
                            if (tgt) return tgt;
                            if (!lastSnapTarget?.el?.isConnected) return null;
                            const att = deps.getState().players[dfHumanSeat()]?.field[i];
                            const enemy = deps.getState().players[lastSnapTarget.p]?.field[lastSnapTarget.i];
                            if (!att || !enemy || enemy.shielded || enemy.pulled) return null;
                            if (!canAttackerTargetDefender(att, enemy)) return null;
                            const atkCost = getAttackActionCost(att, enemy);
                            if (!attackIsFree(att) && deps.getState().players[dfHumanSeat()].actions < atkCost) return null;
                            if (hadSnapDuringDrag) return lastSnapTarget;
                            const rect = lastSnapTarget.el.getBoundingClientRect();
                            const cx = rect.left + rect.width / 2;
                            const cy = rect.top + rect.height / 2;
                            const fingerDist = Math.hypot(clientX - cx, clientY - cy);
                            const touchLike = window.DfLayout?.isTouchGameplay?.();
                            const reachMult = touchLike ? 2.6 : 1.85;
                            const maxReach = Math.max(rect.width, rect.height) * reachMult;
                            if (fingerDist <= maxReach) return lastSnapTarget;
                            return findEnemyCardAt(cx, cy);
                        };
                        const finishDrag = (ev, cancelled) => {
                            fClear();
                            const hadDrag = dragMode;
                            const ghostRef = dragGhost;
                            dragMode = false;
                            dragGhost = null;
                            try { document.body.classList.remove("df-mp-field-drag"); } catch (eFd2) { /* */ }
                            // Fantasma some ANTES da carta-fonte reaparecer —
                            // evita o frame de duplicata ao cancelar o ataque.
                            if (ghostRef) {
                                try { ghostRef.remove(); } catch (_) {}
                            }
                            if (noActionsBanner) { noActionsBanner.remove(); noActionsBanner = null; }
                            if (!hadDrag || cancelled) {
                                dfEndFieldDragVisual();
                                return;
                            }
                            const attChamp = deps.getState().players[dfHumanSeat()].field[i];
                            if (!attChamp) {
                                dfEndFieldDragVisual();
                                return;
                            }
                            // Detecta DROP em Resistente ainda que findEnemyCardAt
                            // tenha bloqueado o snap — pra disparar o banner certo.
                            let dropBlocked = false;
                            {
                                const elU = document.elementFromPoint(ev.clientX, ev.clientY);
                                const ccU = elU?.closest?.(".ccard");
                                const dp = ccU ? Number(ccU.dataset.player) : NaN;
                                const di = ccU ? Number(ccU.dataset.field) : NaN;
                                const dropChamp = (!Number.isNaN(dp) && !Number.isNaN(di) && !deps.dfIsLocalPlayer(dp))
                                    ? deps.getState().players[dp]?.field[di] : null;
                                if (dropChamp && !dropChamp.shielded && !dropChamp.pulled) {
                                    if (isPesadoDemais(attChamp) && isResistente(dropChamp)) {
                                        flashRuleBanner("Banjo não pode atacar Campeões Resistentes.", "");
                                        dropBlocked = true;
                                    } else if (isResistente(dropChamp) && cannotHitResistente(attChamp)) {
                                        flashRuleBanner("Campeões com investida não podem atacar campeões Resistentes.", "");
                                        dropBlocked = true;
                                    } else {
                                        const dropCost = getAttackActionCost(attChamp, dropChamp);
                                        if (!attackIsFree(attChamp) && deps.getState().players[dfHumanSeat()].actions < dropCost) {
                                            if (dropCost >= 2 && isPesadoDemais(attChamp)) {
                                                flashRuleBanner("Você não tem ações suficientes para atacar com Banjo.",
                                                    `Banjo precisa de <b>2 Ações</b> para Atacar • Você tem <b>${deps.getState().players[dfHumanSeat()].actions}</b>`);
                                            } else if (dropCost === 2) {
                                                flashRuleBanner("Você não tem ações suficientes para atacá-lo.",
                                                    `Atacar um Campeão <b>Resistente</b> custa <b>2 Ações</b> • Você tem <b>${deps.getState().players[dfHumanSeat()].actions}</b>`);
                                            } else {
                                                flashInsufficientActions(1, deps.getState().players[dfHumanSeat()].actions, null);
                                            }
                                            dropBlocked = true;
                                        }
                                    }
                                }
                            }
                            if (dropBlocked) {
                                dfEndFieldDragVisual();
                                return;
                            }
                            const tgt = resolveDragDropTarget(ev.clientX, ev.clientY);
                            lastSnapTarget = null;
                            hadSnapDuringDrag = false;
                            if (!tgt) {
                                // Só cancela por "voltei à origem" se não havia alvo —
                                // no mobile o dedo solta longe do snap mesmo com fantasma encaixado.
                                if (isOverOrigin(ev.clientX, ev.clientY)) {
                                    dfEndFieldDragVisual();
                                    return;
                                }
                                dfEndFieldDragVisual();
                                return;
                            }
                            const tgtChamp = deps.getState().players[tgt.p].field[tgt.i];
                            const dragCost = getAttackActionCost(attChamp, tgtChamp);
                            if (!attackIsFree(attChamp) && deps.getState().players[dfHumanSeat()].actions < dragCost) {
                                if (dragCost >= 2 && isPesadoDemais(attChamp)) {
                                    flashRuleBanner("Você não tem ações suficientes para atacar com Banjo.",
                                        `Banjo precisa de <b>2 Ações</b> para Atacar • Você tem <b>${deps.getState().players[dfHumanSeat()].actions}</b>`);
                                } else if (dragCost === 2) {
                                    flashRuleBanner("Você não tem ações suficientes para atacá-lo.",
                                        `Atacar um Campeão <b>Resistente</b> custa <b>2 Ações</b> • Você tem <b>${deps.getState().players[dfHumanSeat()].actions}</b>`);
                                } else {
                                    flashInsufficientActions(1, deps.getState().players[dfHumanSeat()].actions, null);
                                }
                                dfEndFieldDragVisual();
                                return;
                            }
                            // NÃO remover drag-attack-target antes — dfEndFieldDragVisual
                            // precisa achar o alvo pra limpar glow/transform da levitação.
                            try { window.DfTargetLevitate?.stopAll?.(); } catch (_) { /* */ }
                            const attOwner = p;
                            const attIdx = i;
                            const defOwner = tgt.p;
                            const defIdx = tgt.i;
                            // Mesmo fluxo do clique no defensor (confirmEnter):
                            // gasta ação → resolveCombat (sem updateUI no meio).
                            if (!attackIsFree(attChamp)) deps.getState().players[attOwner].actions -= dragCost;
                            setSelectedFieldIdx(attIdx);
                            deps.setTargetData({ attackerOwner: attOwner, attackerIdx: attIdx, currentEnemyPlayer: defOwner });
                            setSelectedEnemyIdx(defIdx);
                            // Snap com cartas visíveis — ocultar antes quebra getBoundingClientRect no mobile.
                            dfEndFieldDragVisual();
                            document.querySelectorAll(".ccard.drag-attack-target, .ccard.df-target-levitating").forEach((el) => {
                                el.classList.remove("drag-attack-target", "df-target-levitating");
                                try { window.DfTargetLevitate?.stopOne?.(el); } catch (_) { /* */ }
                                ["transform", "translate", "scale", "rotate", "will-change", "transform-origin"].forEach((p) => {
                                    el.style.removeProperty(p);
                                });
                            });
                            void document.body.offsetHeight;
                            window.__dfCombatPreSnap = {
                                att: deps.dfCaptureFieldCardSnap?.(attOwner, attIdx),
                                def: deps.dfCaptureFieldCardSnap?.(defOwner, defIdx),
                            };
                            window.__dfCombatPending = { attOwner, attIdx, defOwner, defIdx };
                            const finishCombatUi = () => {
                                deps.setGamePhase("normal");
                                deps.setTargetData({});
                                updateUI();
                                checkWin();
                                window._lastDragEndAt = Date.now();
                            };
                            const refundDragAttack = () => {
                                if (!attackIsFree(attChamp)) deps.getState().players[attOwner].actions += dragCost;
                                window.__dfCombatPending = null;
                                window.__dfCombatPreSnap = null;
                                window.dfCombatForceCleanup?.({ attOwner, attIdx, defOwner, defIdx });
                            };
                            dfOnlineResolveCombatThenBroadcast(attOwner, attIdx, defOwner, defIdx)
                                .then((res) => {
                                    if (res?.ok === false) refundDragAttack();
                                    finishCombatUi();
                                })
                                .catch((combatErr) => {
                                    console.warn("[DF drag-attack]", combatErr);
                                    refundDragAttack();
                                    document.querySelectorAll(".battle-fly, .summon-fly, .drag-ghost").forEach((el) => el.remove());
                                    finishCombatUi();
                                });
                        };
                        cd.addEventListener("pointercancel", (ev) => {
                            pointerDown = false;
                            clearHoldDragTimer();
                            finishDrag(ev, true);
                            fpFired = false;
                        });
                        cd.addEventListener("pointerleave", () => { fClear(); });
                        cd.addEventListener("pointerup", (ev) => {
                            pointerDown = false;
                            const movedPx = Math.hypot(ev.clientX - fSX, ev.clientY - fSY);
                            const tapNoMove = movedPx <= 18;
                            clearHoldDragTimer();
                            try { cd.releasePointerCapture(ev.pointerId); } catch {}
                            // Aceita mouse + toque (desktop também atacar arrastando).
                            if (dragMode) {
                                // Hold armou sem mover (offline ou MP) → cancelar
                                // drag e seguir para zoom (tap ≠ ataque).
                                if (tapNoMove && holdDragArmed) {
                                    finishDrag(ev, true);
                                    holdDragArmed = false;
                                    fpFired = false;
                                    try {
                                        cd.style.visibility = "";
                                        cd.classList.remove("field-drag-src");
                                        document.body.classList.remove("dragging-card");
                                    } catch (eRest) { /* */ }
                                } else {
                                    finishDrag(ev, false);
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    return;
                                }
                            }
                            fClear();
                            // Só engole zoom se houve arrasto real (não tap).
                            if (fpFired && !tapNoMove) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                return;
                            }
                            if (holdDragArmed && !tapNoMove) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                return;
                            }
                            // Zoom em fase normal: não bloquear por activeTalent órfão
                            // (spotlight residual após talento). Mira continua via click handler.
                            if (deps.getGamePhase() === "normal" && tapNoMove) {
                                let zoomP = p;
                                let zoomI = i;
                                const near = dfNearestFieldCardAt(ev.clientX, ev.clientY, {
                                    player: p,
                                    maxDist: 90,
                                });
                                if (near) {
                                    zoomP = near.p;
                                    zoomI = near.i;
                                }
                                const card = deps.getState().players[zoomP]?.field[zoomI];
                                if (card) {
                                    window._lastZoomOpenAt = Date.now();
                                    if (ev.pointerType === "touch") window._lastZoomTouchAt = Date.now();
                                    openCardZoom(card);
                                    fpFired = true;
                                    cd.dataset.fpFired = "1";
                                    holdDragArmed = false;
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                }
                            }
                        }, true);
                        cd.addEventListener("click", (ev) => {
                            if (["target-champion", "target-ally", "ultimate-target"].includes(deps.getGamePhase())) return;
                            if (fpFired) { ev.preventDefault(); ev.stopPropagation(); fpFired = false; return; }
                            if (window._lastDragEndAt && Date.now() - window._lastDragEndAt < 400) {
                                ev.preventDefault(); ev.stopPropagation();
                            }
                        }, true);
                    }
                    dfLockFieldCardTransform(cd);
                    fieldFrag.appendChild(cd);
                    if (!window.DfCardFace?.isComposed?.(c)) {
                        window.dfAttachCardArt?.(cd, c.name);
                    }
                    dfLockFieldCardTransform(cd, { force: true });
                    if (playerDesktopField) {
                        window.dfSealPlayerFieldCard?.(cd);
                    }
                });
                field.appendChild(fieldFrag);
                dfSyncFieldBannerAnchor(field, fieldLen);
                if (showSummonSlots) field.appendChild(makeSummonInsertSlot(fieldLen, fieldLen));
                if (playerDesktopField) {
                    window.dfSealPlayerFieldRow?.(field);
                }
                } // end else full field rebuild
        
                const hand = window.DfLayout?.resolveQuadrantHand?.(q) || q.querySelector(".quadrant-hand");
                if (!hand) continue;
                const tryPatchLocalHand = () => {
                    if (!deps.dfIsLocalPlayer(p)) return false;
                    // Preserva listeners/capture do .hand-wrap sob arraste ativo.
                    if (handDragLive) return true;
                    let wraps = [...hand.children].filter((el) => el.classList?.contains("hand-wrap"));
                    const handLen = pl.hand?.length || 0;
                    // MP: ao invocar, a mão encolhe 1 — remove só o wrap sumido.
                    // Evita hand.innerHTML='' (flash verso / remount composed loading).
                    if (window.__DF_ONLINE && wraps.length === handLen + 1 && handLen >= 0) {
                        const uidSet = new Set(
                            (pl.hand || [])
                                .filter((c) => c?.uid != null)
                                .map((c) => String(c.uid)),
                        );
                        let orphan = null;
                        if (uidSet.size) {
                            orphan = wraps.find((w) => {
                                const u = w.dataset?.uid;
                                return u && !uidSet.has(u);
                            }) || null;
                        }
                        if (!orphan) {
                            const nameCount = Object.create(null);
                            for (const c of pl.hand || []) {
                                const nm = c?.name || "";
                                nameCount[nm] = (nameCount[nm] || 0) + 1;
                            }
                            for (const w of wraps) {
                                const nm = w.querySelector(".nm")?.textContent || "";
                                if ((nameCount[nm] || 0) > 0) nameCount[nm] -= 1;
                                else { orphan = w; break; }
                            }
                        }
                        if (orphan?.isConnected) {
                            try { orphan.remove(); } catch (eOrphan) { /* */ }
                            wraps = [...hand.children].filter((el) => el.classList?.contains("hand-wrap"));
                        }
                    }
                    if (wraps.length !== handLen) return false;
                    for (let i = 0; i < pl.hand.length; i++) {
                        const c = pl.hand[i];
                        const nm = wraps[i].querySelector(".nm")?.textContent;
                        if (nm !== c.name) return false;
                        if (c.uid != null && wraps[i].dataset.uid && wraps[i].dataset.uid !== String(c.uid)) {
                            return false;
                        }
                    }
                    pl.hand.forEach((c, i) => {
                        const w = wraps[i];
                        w.dataset.idx = String(i);
                        if (c.uid != null) w.dataset.uid = String(c.uid);
                        if (c.name != null) w.dataset.name = String(c.name);
                        w.classList.toggle("selected", i === getSelectedHand());
                        const hcardEl = w.querySelector(".hcard");
                        if (!hcardEl) return;
                        if (window.DfCardFace?.isComposed?.(c)) {
                            window.DfCardFace.updatePower(hcardEl, c.currentPower, { animate: true });
                        } else {
                            const pow = hcardEl.querySelector(".pow");
                            const cost = hcardEl.querySelector(".cost:not(.zero)");
                            if (pow) pow.textContent = String(c.currentPower);
                            if (cost) cost.textContent = String(c.currentPower);
                        }
                        hcardEl.classList.toggle("cursed-in-hand", !!c.silencedInHand);
                        let curseBadge = w.querySelector(".hand-curse-badge");
                        if (c.silencedInHand && !curseBadge) {
                            hcardEl.insertAdjacentHTML("beforeend",
                                `<div class="hand-curse-badge" title="Maldição dos Sete Mares — se este for o próximo Campeão invocado, entrará SEM habilidade">🔮</div>`);
                        } else if (!c.silencedInHand && curseBadge) {
                            curseBadge.remove();
                        }
                    });
                    return true;
                };
                if (tryPatchLocalHand()) {
                    if (window.__DF_ONLINE && window.__dfUpkeepDrawInFlight
                        && (window.__dfUpkeepDrawSeat === p || window.__dfUpkeepDrawSeat == null)) {
                        const wraps = [...hand.children].filter((el) => el.classList?.contains("hand-wrap"));
                        const last = wraps[wraps.length - 1];
                        if (last) last.classList.add("draw-pending");
                    }
                    if (pl.hand?.length) {
                        pl.hand.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    }
                    window.dfApplyCardArtsFast?.(q);
                    continue;
                }
                hand.innerHTML = '';
                if (deps.dfIsLocalPlayer(p)) {
                    // Índice vivo da carta tocada. O `i` das closures congela na
                    // criação do DOM, mas tryPatchLocalHand (MP) re-enumera
                    // dataset.idx sem recriar listeners — sem isso o gesto acaba
                    // lendo a carta vizinha (ou nenhuma, na ponta direita).
                    const resolveLiveHandIdx = (el, fallbackIdx) => {
                        const liveHand = deps.getState().players[p]?.hand;
                        if (!Array.isArray(liveHand) || !liveHand.length) return -1;
                        const uid = el?.dataset?.uid || "";
                        if (uid) {
                            const byUid = liveHand.findIndex((c) => c && String(c.uid ?? "") === uid);
                            if (byUid >= 0) return byUid;
                        }
                        const name = el?.dataset?.name || "";
                        const dsIdx = Number(el?.dataset?.idx);
                        if (Number.isFinite(dsIdx) && dsIdx >= 0 && dsIdx < liveHand.length
                            && (!name || String(liveHand[dsIdx]?.name ?? "") === name)) {
                            return dsIdx;
                        }
                        if (name) {
                            const byName = liveHand.findIndex((c) => c && String(c.name ?? "") === name);
                            if (byName >= 0) return byName;
                        }
                        if (Number.isFinite(fallbackIdx) && fallbackIdx >= 0 && fallbackIdx < liveHand.length) {
                            return fallbackIdx;
                        }
                        return -1;
                    };
                    const resolveLiveHandCard = (el, fallbackIdx) => {
                        const idx = resolveLiveHandIdx(el, fallbackIdx);
                        return idx < 0 ? null : (deps.getState().players[p]?.hand?.[idx] || null);
                    };
                    pl.hand.forEach((c, i) => {
                        const w = document.createElement("div");
                        w.className = `hand-wrap ${i === getSelectedHand() ? "selected" : ""}`;
                        // MP saque livre: último slot oculto durante o fly (sem flash).
                        if (window.__DF_ONLINE && window.__dfUpkeepDrawInFlight
                            && (window.__dfUpkeepDrawSeat === p || window.__dfUpkeepDrawSeat == null)
                            && i === pl.hand.length - 1) {
                            w.classList.add("draw-pending");
                        }
                        w.dataset.idx = i;
                        if (c.uid != null) w.dataset.uid = String(c.uid);
                        if (c.name != null) w.dataset.name = String(c.name);
                        const tc = getCardTypeClass(c);
                        const costCls = c.power === 0 ? " zero" : "";
                        const badge = c.category === "talent" ?
                            '<div class="talent-badge">TALENTO</div>' : '';
                        const curseBadge = c.silencedInHand ?
                            `<div class="hand-curse-badge" title="Maldição dos Sete Mares — se este for o próximo Campeão invocado, entrará SEM habilidade">🔮</div>` : '';
                        w.innerHTML =
                            `<div class="hcard ${tc}${c.silencedInHand ? ' cursed-in-hand' : ''}"><div class="pow">${c.currentPower}</div><div class="nm">${c.name}</div><div class="cost${costCls}">${c.power === 0 ? "0" : c.currentPower}</div>${badge}${curseBadge}${gemOverlayHtml(c, {animate: true})}</div>`;
                        if (handDragLive && window.__dfHandDrag?.idx === i) {
                            w.classList.add("dragging-src");
                        }
                        const hcardEl = w.querySelector(".hcard");
                        if (window.DfCardFace?.isComposed?.(c)) {
                            window.DfCardFace.mount(hcardEl, c, { power: c.currentPower });
                        } else {
                            window.dfAttachCardArt?.(hcardEl, c.name);
                        }
                        // Mesmo comportamento pra mouse e toque:
                        //   - Click/tap rápido (sem mover) → amplia (zoom).
                        //   - Pressionar e arrastar → fantasma segue o cursor/dedo.
                        //     Solta em:
                        //       • seu próprio campo → invoca campeão / usa talento
                        //       • sua própria mão ou qualquer outro lugar → cancela
                        //     Campos do oponente NÃO aceitam drop.
                        // Não existe mais menu "Invocar/Voltar" via Enter — pra
                        // invocar, sempre arrastar a carta pro campo.
                        let startX = 0, startY = 0, pType = "";
                        let drag = null; // { ghost, moved, captured, docEnd }
                        const clearDragDocListeners = () => {
                            if (drag?.docMove) {
                                document.removeEventListener("pointermove", drag.docMove, true);
                                drag.docMove = null;
                            }
                            if (!drag?.docEnd) return;
                            document.removeEventListener("pointerup", drag.docEnd, true);
                            document.removeEventListener("pointercancel", drag.docEnd, true);
                            drag.docEnd = null;
                        };
                        const enterDragMode = (clientX, clientY) => {
                            if (!drag || drag.moved) return;
                            deps.ensureTurnReady?.();
                            if (!deps.dfIsMyTurn() || deps.getGamePhase() !== "normal") return;
                            // SFX: "carta saindo da mão" — toca quando o gesto
                            // se converte em arrasto (independente de onde solta).
                            try { window.sfx && window.sfx("card_draw"); } catch (e) {}
                            // Garante que não sobrou nenhum fantasma órfão de
                            // um drag anterior (ex.: updateUI destruiu o `w`
                            // antigo no meio do arrasto).
                            cleanupOrphanGhosts();
                            const zone0 = dropZoneAt(clientX, clientY);
                            const g = dfCreateHandDragGhost(w, clientX, clientY, zone0 === "field");
                            if (!g) {
                                // Não marcar moved — senão finishTouch cancela como “drag falho”.
                                return;
                            }
                            drag.moved = true;
                            drag.ghost = g;
                            window._activeGhost = g;
                            document.body.classList.add("dragging-card");
                            w.classList.add("dragging-src");
                            window.__dfHandDrag = { idx: i, active: true, pending: false };
                            g.classList.toggle("snap", zone0 === "field");
                            updateDropHighlight(zone0, c.summonRitual || null);
                        };
                        const onDragPointerMove = (e) => {
                            if (!drag) return;
                            if (drag.pointerId != null && e.pointerId !== drag.pointerId) return;
                            const dx = e.clientX - startX, dy = e.clientY - startY;
                            // Touch: limiar ~4px (arrasto imediato); mouse ~7px.
                            const handDragThreshold = (window.DfLayout?.isTouchGameplay?.() || pType === "touch") ? 4 : 7;
                            if (!drag.moved && Math.hypot(dx, dy) > handDragThreshold) {
                                enterDragMode(e.clientX, e.clientY);
                            }
                            if (drag.moved && drag.ghost) {
                                window.DfLayout?.positionDragGhost?.(drag.ghost, e.clientX, e.clientY);
                                drag.ghost.dataset.ghostBorn = String(Date.now());
                                const zone = dropZoneAt(e.clientX, e.clientY);
                                const snap = zone === "field";
                                drag.ghost.classList.toggle("snap", snap);
                                if (drag.ghost._dfCardW && drag.ghost._dfCardH) {
                                    dfResizeHandDragGhost(
                                        drag.ghost, drag.ghost._dfCardW, drag.ghost._dfCardH, snap
                                    );
                                }
                                updateDropHighlight(zone, c.summonRitual || null);
                            }
                        };
                        w.addEventListener("pointerdown", (e) => {
                            pType = e.pointerType || "mouse";
                            startX = e.clientX; startY = e.clientY;
                            // Prefetch face cedo — summon fly mais fluido.
                            try {
                                const card = pl?.hand?.[i];
                                if (card?.name) {
                                    window.dfPrefetchCardArt?.(card.name);
                                    if (window.DfCardFace?.isComposed?.(card.name)) {
                                        void window.DfCardFace.warmFace?.(card, { power: card.currentPower ?? card.power }).catch?.(() => {});
                                    }
                                }
                            } catch (ePref) { /* */ }
                            // Touch: preventDefault remove o atraso do browser
                            // (long-press / scroll) — arrasto começa no 1º movimento.
                            if (pType === "touch") {
                                try { e.preventDefault(); } catch (err) { /* */ }
                            }
                            // Freeze hand DOM BEFORE fingerprint changes (setSelectedHand).
                            window.__dfHandDrag = { idx: i, active: false, pending: true };
                            // Desktop e mobile: sem movimento → zoom; com
                            // movimento → drag e solta no campo pra invocar.
                            // IMPORTANTE: não chamar updateUI() aqui — isso
                            // recriaria o elemento `w` e mataria os eventos
                            // pointermove/pointerup/click, travando todo o
                            // fluxo. Atualizamos só a classe visual `selected`
                            // direto, sem re-render.
                            if (getSelectedHand() !== i) {
                                setSelectedHand(i);
                                hand.querySelectorAll(".hand-wrap.selected").forEach(el => el.classList.remove("selected"));
                                w.classList.add("selected");
                            }
                            drag = { ghost: null, moved: false, pointerId: e.pointerId, captured: false, docEnd: null, docMove: null };
                            const onDocPointerEnd = (ev) => {
                                if (!drag) return;
                                if (drag.pointerId != null && ev.pointerId !== drag.pointerId) return;
                                finishTouch(ev, ev.type === "pointercancel");
                            };
                            drag.docEnd = onDocPointerEnd;
                            drag.docMove = onDragPointerMove;
                            document.addEventListener("pointerup", onDocPointerEnd, true);
                            document.addEventListener("pointercancel", onDocPointerEnd, true);
                            // pointermove no document: sobrevive se o .hand-wrap for destruído mid-gesture.
                            document.addEventListener("pointermove", onDragPointerMove, true);
                            try { w.setPointerCapture(e.pointerId); drag.captured = true; } catch {}
                        });
                        w.addEventListener("pointermove", onDragPointerMove);
                        const finishTouch = (e, cancelled) => {
                            if (!drag) return;
                            const wasDrag = drag.moved;
                            const ghost = drag.ghost;
                            // Avaliar zona ANTES de limpar flags — dropZoneAt prioriza
                            // campo só enquanto dragging-card / __dfHandDrag estão ativos.
                            const zoneEarly = (wasDrag && e && !cancelled)
                                ? dropZoneAt(e.clientX, e.clientY)
                                : null;
                            clearDragDocListeners();
                            if (drag.captured) { try { w.releasePointerCapture(drag.pointerId); } catch {} }
                            drag = null;
                            document.body.classList.remove("dragging-card");
                            w.classList.remove("dragging-src");
                            window.__dfHandDrag = null;
                            clearDropHighlight();
                            if (ghost) ghost.remove();
                            if (window._activeGhost === ghost) window._activeGhost = null;
                            if (cancelled) return;
                            if (wasDrag) {
                                // "Devolveu a carta pra mão" = arrastou e
                                // soltou fora do campo: mesmo SFX da pegada.
                                if (zoneEarly !== "field") {
                                    try { window.sfx && window.sfx("card_draw"); } catch (err) {}
                                }
                            }
                            if (!wasDrag) {
                                // tap simples → zoom imediato. preventDefault evita o
                                // "click fantasma" que o toque dispararia em seguida
                                // sobre o backdrop, fechando o zoom na mesma hora.
                                if (e && e.preventDefault) e.preventDefault();
                                // Marca o instante de abertura pra o handler de "click"
                                // logo abaixo NÃO chamar openCardZoom de novo — sem
                                // isso, o desktop disparava pointerup (abre) → click
                                // (abre de novo), o que clobberava o estado interno
                                // de preview (parent original salvo errado, animação
                                // remontada no meio) e deixava o card meio translúcido
                                // sem backdrop completo.
                                window._lastZoomOpenAt = Date.now();
                                if (e.pointerType === "touch") window._lastZoomTouchAt = Date.now();
                                const liveCard = resolveLiveHandCard(w, i);
                                if (liveCard) openCardZoom(liveCard);
                                if (e) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                                return;
                            }
                            // Marca que terminou um arrasto AGORA pra suprimir o
                            // evento "click" sintético que o navegador dispara
                            // logo após o pointerup (senão ele cai no listener
                            // de click abaixo e abre o zoom da carta vizinha,
                            // travando a seleção de alvo de talento).
                            window._lastDragEndAt = Date.now();
                            deps.ensureTurnReady?.();
                            // MP: se banner diz “sua vez” mas gate bloqueia, destrava e tenta de novo.
                            if (window.__DF_ONLINE && !deps.dfIsMyTurn()) {
                                try {
                                    window.__dfTurnEndingPending = false;
                                    window.__dfTurnEndingStuckAt = 0;
                                    if (!window.__dfOnlineMatchBoot) {
                                        window.__dfMatchOpeningSeat = null;
                                        window.__dfOnlineBootLockInput = false;
                                    }
                                    deps.ensureTurnReady?.();
                                } catch (eUnlock) { /* */ }
                            }
                            if (!deps.dfIsMyTurn()) {
                                // MP: drop no campo NÃO vira zoom — era “invocação fantasma”.
                                if (window.__DF_ONLINE) {
                                    if (zoneEarly === "field") {
                                        deps.floatText?.("Aguarde — sincronizando sua vez…", "warn center", 1800);
                                        try { void window.__dfOnline?.dfOnlineRollbackToServer?.(); } catch (eRb) { /* */ }
                                    } else {
                                        const liveCardPeek = resolveLiveHandCard(w, i);
                                        if (liveCardPeek) {
                                            window._lastZoomOpenAt = Date.now();
                                            if (e?.pointerType === "touch") window._lastZoomTouchAt = Date.now();
                                            openCardZoom(liveCardPeek);
                                        }
                                    }
                                    cleanupOrphanGhosts();
                                    return;
                                }
                                deps.floatText?.("Aguarde sua vez.", "warn center", 1400);
                                cleanupOrphanGhosts();
                                return;
                            }
                            if (deps.getGamePhase() !== "normal") {
                                if (deps.getGamePhase() === "target-champion" || deps.getGamePhase() === "ultimate-target") {
                                    deps.floatText?.("Selecione o alvo destacado antes de invocar outra carta.", "warn center", 2200);
                                } else if (deps.getGamePhase() === "summon-placement") {
                                    deps.floatText?.("Aguarde o posicionamento da invocação.", "warn center", 1600);
                                } else {
                                    deps.floatText?.("Aguarde o fim da manutenção ou feche menus abertos.", "warn center", 1800);
                                }
                                cleanupOrphanGhosts();
                                return;
                            }
                            const zone = zoneEarly;
                            cleanupOrphanGhosts();
                            if (zone !== "field") return; // solto na mão ou fora → cancela
                            const livePl = deps.getState().players[p];
                            const liveIdx = resolveLiveHandIdx(w, i);
                            const c = liveIdx < 0 ? null : livePl?.hand?.[liveIdx];
                            if (!c) return;
                            // A carta resolvida precisa ser a mesma que o jogador arrastou:
                            // se o wrap tem identidade e ela não bate, aborta em vez de
                            // invocar/usar a carta vizinha.
                            const wantUid = w.dataset.uid || "";
                            const wantName = w.dataset.name || "";
                            if ((wantUid && c.uid != null && String(c.uid) !== wantUid)
                                || (wantName && String(c.name ?? "") !== wantName)) {
                                console.warn("[DF hand drag] Card sync mismatch, aborting");
                                return;
                            }
                            if (c.category === "talent") {
                                if (c.subcategory === "reaction") {
                                    deps.floatText?.("Cartas Reação só podem ser usadas fora do seu turno.", "warn center", 2200);
                                    return;
                                }
                                cleanupOrphanGhosts();
                                document.querySelectorAll(".drag-ghost, .drag-ghost-hand").forEach((el) => el.remove());
                                startTalentUse(liveIdx);
                            }
                            else {
                                const T = DfProtocol?.ACTION_TYPES || {};
                                void dfPlayerAction(
                                    {
                                        type: T.SUMMON || "SUMMON",
                                        handIdx: liveIdx,
                                        playerId: p,
                                        cardName: c.name,
                                        uid: c.uid,
                                    },
                                    { dropPoint: { x: e.clientX, y: e.clientY }, fromHuman: true },
                                ).catch((summonErr) => {
                                    console.warn("[DF summon drag]", summonErr);
                                    window._summonLock = false;
                                    window.__dfSummonInFlight = false;
                                    document.querySelectorAll(".summon-fly, .drag-ghost").forEach((el) => el.remove());
                                });
                            }
                        };
                        w.addEventListener("pointerup", (e) => {
                            // Mouse e toque usam o mesmo finishTouch agora:
                            // sem arrastar → amplia; arrastando até o campo
                            // → invoca / usa talento.
                            finishTouch(e, false);
                        });
                        w.addEventListener("pointercancel", (e) => finishTouch(e, true));
                        // Caminho redundante (e à prova de falhas) pra ampliar com
                        // 1 toque/clique: se por algum motivo o pointerdown/up não
                        // gerar o zoom (ex.: o sistema disparar pointercancel no
                        // meio do toque, ou o jitter passar do limite), o evento
                        // 'click' ainda chega aqui e amplia. Quando o jogador
                        // estiver arrastando de verdade, drag.moved é true e o
                        // navegador não dispara 'click' — então não vaza zoom em
                        // cima do drop.
                        w.addEventListener("click", (e) => {
                            if (drag && drag.moved) return;
                            // Suprime o click sintético que dispara logo
                            // depois de um pointerup que terminou um arrasto.
                            if (window._lastDragEndAt && Date.now() - window._lastDragEndAt < 400) return;
                            // Suprime o click sintético que dispara logo
                            // depois de um pointerup normal (tap simples) —
                            // sem isso, openCardZoom rodava 2x e o estado
                            // interno do preview ficava inconsistente.
                            if (window._lastZoomOpenAt && Date.now() - window._lastZoomOpenAt < 400) return;
                            window._lastZoomOpenAt = Date.now();
                            const liveCardClick = resolveLiveHandCard(w, i);
                            if (liveCardClick) openCardZoom(liveCardClick);
                        });
                        hand.appendChild(w);
                    });
                    if (pl.hand?.length) {
                        pl.hand.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    }
                } else {
                    // Mão do oponente: mesmo wrapper .hand-wrap do jogador
                    // (sem interatividade) pra fanHand aplicar o leque.
                    // column-reverse no .ai-quadrant coloca a mão no topo;
                    // o leque curva via --fan-rot/--fan-y (sem rotação 180°).
                    for (let k = 0; k < pl.hand.length; k++) {
                        const w = document.createElement("div");
                        w.className = "hand-wrap ai-hand-wrap";
                        w.style.pointerEvents = "none";
                        if (window.__DF_ONLINE && window.__dfUpkeepDrawInFlight
                            && (window.__dfUpkeepDrawSeat === p || window.__dfUpkeepDrawSeat == null)
                            && k === pl.hand.length - 1) {
                            w.classList.add("draw-pending");
                        }
                        const b = document.createElement("div");
                        b.className = "ai-back";
                        b.style.pointerEvents = "none";
                        if (w.classList.contains("draw-pending")) b.classList.add("draw-pending");
                        w.appendChild(b);
                        hand.appendChild(w);
                    }
                }
                if (pl.hand?.length) {
                    pl.hand.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                }
                window.dfApplyCardArtsFast?.(q);
            }
            if (window.dfWarmCardArts) {
                const warm = new Set();
                deps.getState().players.forEach((pl) => {
                    pl.hand?.forEach((c) => warm.add(c.name));
                    pl.field?.forEach((c) => warm.add(c.name));
                });
                scheduleWarmArts([...warm]);
            }
            try {
                if (typeof window.__dfFanAllHands === "function") {
                    window.__dfFanAllHands();
                } else if (typeof window.__dfScheduleFan === "function") {
                    window.__dfScheduleFan();
                }
                try { window.DfLayout?.pinSpecialAiHandToGameTop?.(); } catch (e) { /* */ }
            } finally {
                /* fan já rodou com MO pausado */
            }
            try { syncTargetingHighlights(); } catch (e) { /* */ }
            } finally {
                window.__dfPauseHandFanMO?.(false);
                window.__dfPauseFieldLockMO?.(false);
            }
        }
        
        function cleanupOrphanGhosts() {
            dfEndFieldDragVisual();
            document.querySelectorAll(".drag-ghost, .drag-no-actions-banner").forEach(g => g.remove());
            // Reseta opacidade de qualquer .ccard que ficou em 0.25
            // por causa do enterFieldDrag (atacante). Sem isso, o
            // campeão no campo fica semi-transparente até o próximo
            // render completo.
            document.querySelectorAll(".ccard").forEach(el => {
                if (el.style.opacity && el.style.opacity !== "" && el.style.opacity !== "1") {
                    el.style.opacity = "";
                }
            });
            document.querySelectorAll(".ccard.drag-attack-target")
                .forEach(el => el.classList.remove("drag-attack-target"));
            window._activeGhost = null;
            window.__dfHandDrag = null;
            document.body.classList.remove("dragging-card");
            clearDropHighlight();
        }
        
        function _runUpdateUI() {
            if (!deps.getState().started) return;
            const handDragOn = !!(window.__dfHandDrag?.active || window.__dfHandDrag?.pending);
            const fieldDragOn = !!window.__dfFieldDrag?.active;
            if (document.querySelector(".drag-ghost") && !handDragOn && !fieldDragOn) {
                cleanupOrphanGhosts();
            }
            deps.recalcInspiracao();
            updateTurnPill();
            updateDeckDiscard();
            renderTalentSpotlightLayer();
            const combatLive = deps.dfIsCombatPresentationLive?.() ?? false;
            const targetingPhase = ["target-champion", "target-ally", "ultimate-target", "select-attacker", "select-defender"].includes(deps.getGamePhase());
            // Durante mira, NUNCA early-return — bordas valid-target precisam de render + sync.
            if ((window.__dfCombatActive || window.__dfCombatPending || combatLive) && !targetingPhase) {
                updateTargetBanner();
                try { window.__dfRefreshDesktopHeroPanels?.(); } catch (e) { /* */ }
                if (window.__dfCombatPending) {
                    updateTurnPill();
                    updateDeckDiscard();
                    deps.$("pass-turn").disabled = !deps.dfIsMyTurn() || deps.getAiBusy() || deps.getState().winner !== null;
                    try { window.__dfSyncPassTurnPedestal?.(); } catch (e) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                    try { window.__dfSyncCombatOpcoesPedestal?.(); } catch (e) { /* */ }
                    deps.$("end-turn").disabled = !deps.dfIsMyTurn() || deps.getGamePhase() === "menu" || deps.getGamePhase() === "detail" || deps.getGamePhase() === "discard";
                }
                return;
            }
            dfSyncTargetingAttribute();
            if (targetingPhase) deps.dfClosePreviewForTargeting();
            renderAllQuadrants();
            if (!window.__dfCombatActive && !fieldDragOn) {
                const desktopFieldLock = window.matchMedia?.("(min-width: 901px)")?.matches
                    && !document.documentElement.classList.contains("df-mobile");
                if (desktopFieldLock) {
                    window.dfStabilizeHandWraps?.();
                    window.dfSealPlayerFieldRow?.(document.querySelector("#quadrant-0 .quadrant-field"));
                }
                requestAnimationFrame(() => {
                    if (window.__dfCombatActive || window.__dfCombatPending) return;
                    window.dfStabilizeFieldCards?.(undefined, { force: true });
                });
            }
            if (targetingPhase) syncTargetingHighlights();
            updateTargetBanner();
            if (targetingPhase) {
                requestAnimationFrame(() => {
                    window.dfStabilizeFieldCards?.(undefined, { force: true });
                    syncTargetingHighlights();
                });
            }
            deps.$("end-turn").disabled = !deps.dfIsMyTurn() || deps.getGamePhase() === "menu" || deps.getGamePhase() === "detail" || deps.getGamePhase() === "discard";
            const menuBtn = deps.$("menu-btn");
            if (menuBtn) menuBtn.disabled = !deps.getState().started || deps.getState().winner !== null;
            deps.$("pass-turn").disabled = !deps.dfIsMyTurn() || deps.getAiBusy() || deps.getState().winner !== null;
            try { window.__dfSyncPassTurnPedestal?.(); } catch (e) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            try { window.__dfSyncCombatOpcoesPedestal?.(); } catch (e) { /* */ }
            const _pl0 = deps.dfLocalPlayer();
            const _hero0 = _pl0?.heroDef || (_pl0 ? deps.getHeroDef(_pl0.heroId) : null);
            const _maxUlt0 = _pl0 ? deps.getMaxUltimateUses(_pl0.heroId) : 0;
            const _canUlt = deps.getState().started && deps.dfIsMyTurn() && deps.getGamePhase() === "normal" && !!_hero0 &&
                _pl0.ultimateUses < _maxUlt0 && !_pl0.usedUltimateThisTurn && deps.getState().winner === null;
            const ultLegacy = deps.$("ultimate-btn");
            if (ultLegacy) ultLegacy.disabled = !_canUlt;
            const ultPed = document.getElementById("ultimate-pedestal-btn");
            if (ultPed) ultPed.disabled = !_canUlt;
            try { window.__dfSyncUltimatePedestalLite?.() ?? window.__dfSyncUltimatePedestal?.({ reposition: false }); } catch (e) { /* */ }
            if (typeof window.refreshMobileLayout === "function") window.refreshMobileLayout();
            deps.ensureTurnReady();
            deps.armPhaseWatchdog();
            if (!fieldDragOn && !window.__dfCombatActive && targetingPhase) {
                requestAnimationFrame(() => {
                    window.dfStabilizeFieldCards?.();
                    window.dfStabilizeHandWraps?.();
                    syncTargetingHighlights();
                    window.DfTargetLevitate?.sync?.();
                });
            }
            deps.dfSyncPesadeloShrouds();
            try { window.__dfRefreshDesktopHeroPanels?.(); } catch (e) { /* */ }
        }

        /** Talento ativo: canto superior esquerdo, à direita do botão Opções. */
        function resolveTalentAnchor(ownerP) {
            void ownerP;
            return document.getElementById("df-combat-opcoes-pedestal")
                || document.getElementById("combat-opcoes-btn")
                || document.getElementById("df-turn-banner-pedestal")
                || document.getElementById("desktop-turn-indicator")
                || resolveHeroHudPanel(ownerP);
        }

        function resolveHeroHudPanel(ownerP) {
            const localSeat = deps.dfLocalSeat?.() ?? deps.dfHumanSeat?.() ?? 0;
            const playersCount = deps.getState().playersCount ?? 2;
            if (playersCount === 2) {
                if (ownerP === localSeat) return document.getElementById("dlh-hero-player");
                return document.getElementById("dlh-hero-ai");
            }
            const qIdx = deps.dfQuadrantForPlayer?.(ownerP) ?? ownerP;
            return document.querySelector(`#quadrant-${qIdx} .quadrant-header`);
        }

        function isCanvasFitTalentLayout() {
            return document.documentElement.classList.contains("df-mobile-desktop-fit");
        }

        function viewportToTalentLayerCoords(vx, vy) {
            const toCanvas = window.DfLayout?.viewportToCanvas?.bind(window.DfLayout);
            if (isCanvasFitTalentLayout() && toCanvas) return toCanvas(vx, vy);
            return { x: vx, y: vy };
        }

        function ensureTalentSpotlightHost(layer, touchHud) {
            void touchHud;
            if (isCanvasFitTalentLayout()) {
                const root = document.getElementById("df-scale-root") || document.body;
                if (layer.parentElement !== root) root.appendChild(layer);
                layer.style.setProperty("overflow", "visible", "important");
                return;
            }
            const game = document.getElementById("game");
            if (game && layer.parentElement !== game) game.appendChild(layer);
        }

        function positionTalentSpotlightLayer(ownerP) {
            const layer = document.getElementById("talent-spotlight-layer");
            if (!layer) return;
            const anchor = resolveTalentAnchor(ownerP);
            if (!anchor) {
                layer.classList.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
                ensureTalentSpotlightHost(layer, false);
                layer.style.removeProperty("position");
                layer.style.removeProperty("z-index");
                layer.style.left = "50%";
                layer.style.top = "50%";
                layer.style.transform = "translate(-50%, -50%)";
                return;
            }
            const place = () => {
                const r = anchor.getBoundingClientRect();
                const gap = 28;
                const vw = global.innerWidth || 1024;
                const vh = global.innerHeight || 768;
                // À direita de Opções — canto superior esquerdo do combate.
                let cx = r.right + gap;
                const talentCard = layer.querySelector(".ccard.talent-in-play");
                const cardH = talentCard?.getBoundingClientRect?.().height || Math.min(vh * 0.3, 170);
                /* Garante a carta inteira abaixo da borda superior. */
                let cy = Math.max(r.bottom + 20, cardH * 0.5 + 12);
                const estW = Math.min(vw * 0.22, 180);
                const maxCx = r.right + Math.min(vw * 0.22, 168);
                if (cx > maxCx) cx = maxCx;
                const rowMin = cardH * 0.5 + 12;
                const rowMax = Math.max(rowMin, vh - cardH * 0.5 - 12);
                if (cy < rowMin) cy = rowMin;
                if (cy > rowMax) cy = rowMax;
                layer.classList.add("talent-spotlight-above-hud");
                layer.classList.remove("talent-spotlight-touch-hud");
                const canvasFit = isCanvasFitTalentLayout();
                if (canvasFit) {
                    ensureTalentSpotlightHost(layer, false);
                    const pt = viewportToTalentLayerCoords(cx, cy);
                    layer.style.setProperty("position", "absolute", "important");
                    layer.style.setProperty("left", `${Math.round(pt.x)}px`, "important");
                    layer.style.setProperty("top", `${Math.round(pt.y)}px`, "important");
                    layer.style.setProperty("transform", "translate(0, -50%)", "important");
                    layer.style.setProperty("z-index", "235", "important");
                    layer.style.removeProperty("overflow");
                    layer.style.removeProperty("pointer-events");
                    return;
                }
                if (layer.parentElement !== document.body) document.body.appendChild(layer);
                layer.style.setProperty("position", "fixed", "important");
                layer.style.setProperty("left", `${Math.round(cx)}px`, "important");
                layer.style.setProperty("top", `${Math.round(cy)}px`, "important");
                layer.style.setProperty("transform", "translate(0, -50%)", "important");
                layer.style.setProperty("z-index", "230", "important");
                layer.style.setProperty("pointer-events", "none", "important");
                layer.style.removeProperty("overflow");
            };
            place();
            if (!layer.dataset.hudResizeWired) {
                layer.dataset.hudResizeWired = "1";
                const syncActiveTalentHud = () => {
                    const at = deps.getState().activeTalent;
                    if (at?.card != null) positionTalentSpotlightLayer(at.ownerP);
                };
                window.addEventListener("resize", syncActiveTalentHud, { passive: true });
                window.addEventListener("df-layout-sync", syncActiveTalentHud, { passive: true });
                window.addEventListener("df-orientation-sync", syncActiveTalentHud, { passive: true });
                document.addEventListener("fullscreenchange", syncActiveTalentHud, { passive: true });
                try {
                    window.visualViewport?.addEventListener("resize", syncActiveTalentHud, { passive: true });
                    window.visualViewport?.addEventListener("scroll", syncActiveTalentHud, { passive: true });
                } catch (e) { /* */ }
            }
        }

        function renderTalentSpotlightLayer() {
            const layer = document.getElementById("talent-spotlight-layer");
            if (!layer) return;
            layer.replaceChildren();
            const at = deps.getState().activeTalent;
            if (!at?.card) {
                layer.setAttribute("aria-hidden", "true");
                layer.classList.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
                ensureTalentSpotlightHost(layer, false);
                layer.style.removeProperty("position");
                layer.style.removeProperty("z-index");
                layer.style.removeProperty("overflow");
                layer.style.removeProperty("pointer-events");
                layer.style.left = "";
                layer.style.top = "";
                layer.style.transform = "";
                return;
            }
            layer.setAttribute("aria-hidden", "false");
            const tc = getCardTypeClass(at.card);
            const tcd = document.createElement("div");
            tcd.className = `ccard ${tc} talent-in-play`;
            const pow = at.card.currentPower ?? at.card.power ?? 0;
            // `at.tag` permite reaproveitar este mesmo holofote para o RITUAL
            // (Ômega/Tiamate em evidência até o jogador escolher o sacrifício).
            const tag = at.tag || "TALENTO";
            tcd.innerHTML =
                `<div class="pow">${pow}</div><div class="nm">${at.card.name}</div><div class="talent-tag">${tag}</div>`;
            layer.appendChild(tcd);
            if (window.DfCardFace?.isComposed?.(at.card)) {
                window.DfCardFace.mount(tcd, at.card, { power: pow });
            } else {
                window.dfAttachCardArt?.(tcd, at.card.name);
            }
            positionTalentSpotlightLayer(at.ownerP);
            requestAnimationFrame(() => {
                positionTalentSpotlightLayer(at.ownerP);
                requestAnimationFrame(() => positionTalentSpotlightLayer(at.ownerP));
            });
        }

        window.__dfTalentSpotlightEl = function () {
            return document.querySelector("#talent-spotlight-layer .ccard.talent-in-play");
        };
        
        function updateUI(immediate) {
            if (!deps.getState().started) return;
            const force = immediate === true || (immediate && immediate.immediate);
            // Durante cena Pixi: adia rebuild DOM (bom p/ FPS).
            // NUNCA forceClear aqui — Zero Absoluto/combate passam de 2s e
            // o clear matava a animação (jogador “não via” o VFX).
            const pixiBusy = !force && !!(window.DfPixiVfx?.isAnySceneActive?.());
            if (pixiBusy) {
                if (!_uiVfxDeferSince) _uiVfxDeferSince = Date.now();
                _uiPendingVfx = true;
                updateTargetBanner();
                try { window.__dfRefreshDesktopHeroPanels?.(); } catch (e) { /* */ }
                // Contador órfão sem filhos no palco: só reconcilia (sem kill).
                if ((Date.now() - _uiVfxDeferSince) > 3500) {
                    const kids = window.DfPixiVfx?.stageChildCount?.() | 0;
                    if (kids === 0) {
                        try { window.DfPixiVfx?.reconcileSceneCounter?.(); } catch (e) { /* */ }
                        _uiVfxDeferSince = 0;
                        _uiPendingVfx = false;
                    }
                }
                return;
            }
            _uiVfxDeferSince = 0;
            if (force) {
                _uiCoalesce = 0;
                _uiPendingVfx = false;
                _runUpdateUI();
                return;
            }
            if (_uiCoalesce) return;
            _uiCoalesce = 1;
            queueMicrotask(() => {
                _uiCoalesce = 0;
                _runUpdateUI();
            });
        }
        
        function isSilentTargetBanner() {
            if (!deps.dfIsMyTurn()) return false;
            const phase = deps.getGamePhase();
            // Seleção de alvo: só bordas coloridas nos campeões válidos — sem caixa de texto.
            return phase === "target-champion" || phase === "target-ally" || phase === "ultimate-target";
        }
        
        function updateTargetBanner() {
            let banner = document.getElementById("target-banner");
            dfSyncTargetingAttribute();
            if (isSilentTargetBanner()) {
                if (banner) banner.remove();
                return;
            }
            let msg = "";
            if (deps.dfIsMyTurn()) {
                if (deps.getGamePhase() === "target-ally") {
                    const ab = deps.getTargetData().ability;
                    if (ab === "fortalecer" || ab === "fortalecerTalento") msg = "💪 FORTALECER — Qual Campeão aliado você quer Fortalecer? Clique no aliado destacado em verde (+1 Poder).";
                    else if (ab === "ursificacao") msg = "Escolha um Campeão aliado para transformar em Urso";
                    else if (ab === "devorar") msg = "🦷 DEVORAR — Escolha um Campeão aliado para destruir. O Poder dele será somado ao do invocador.";
                    else if (ab === "ritualSacrifice") msg = "🔥 RITUAL — Escolha o aliado a sacrificar. Toque fora dos destacados para cancelar.";
                    else msg = "Clique no Campeão ALIADO destacado em verde";
                } else if (deps.getGamePhase() === "summon-placement") {
                    msg = "📍 Posicione a invocação — toque ◂ ou ▶ ao lado do Campeão onde a carta deve entrar.";
                } else if (deps.getGamePhase() === "target-champion") {
                    const ab = deps.getTargetData().ability;
                    if (ab === "bolaDeFogo") msg = "🔥 BOLA DE FOGO — Escolha um Campeão adversário. O Poder dele será reduzido em 1 Ponto.";
                    else if (ab === "bolaDeFogoTalento") msg = "🔥 BOLA DE FOGO — Escolha um Campeão adversário. O Poder dele será reduzido em 1 Ponto.";
                    else if (ab === "explosao") msg = "💥 EXPLOSÃO — Em qual campeão você deseja utilizar a Explosão? (-2 Poder)";
                    else if (ab === "zeroAbsoluto") msg = "❄️ ZERO ABSOLUTO — Qual campeão você deseja Congelar? (3 rodadas; se já Congelado → destruído)";
                    else if (ab === "assassinar") msg = "🗡️ ASSASSINAR — Clique em um Campeão do adversário com Poder 1, para destruí-lo.";
                    else if (ab === "medoTalento") msg = "😨 AMEDRONTAR — Escolha um Campeão adversário com Poder ≤ 2 (destacado em vermelho). Ele ficará com medo e retornará à Mão do Herói que o invocou.";
                    else if (ab === "transformarBichinho") msg = "🪄 Qual Campeão deve virar um Bichinho?";
                    else if (ab === "baforadaVenenosa") msg = "☠️ BAFORADA VENENOSA — Escolha 1 Campeão adversário destacado em verde para Envenenar.";
                    else if (ab === "mordidaVenenosa") msg = "☠️ MORDIDA VENENOSA — Escolha 1 Campeão adversário destacado em verde para Envenenar (2 rodadas).";
                    else if (ab === "imitar") msg = "🎭 IMITAR — Escolha um Campeão para imitar a Habilidade";
                    else msg = "Clique no Campeão destacado em verde para usar a habilidade";
                } else if (deps.getGamePhase() === "ultimate-target") {
                    // Texto detalhado por tipo de ultimate, deixando claro
                    // EXATAMENTE o que vai acontecer.
                    const u = deps.getTargetData()?.ultimate;
                    if (u === "vaughan")        msg = "💣 BOMBA EXPLOSIVA — Escolha um Campeão adversário. Ele perde 1 ponto de Poder. Se chegar a 0 será destruído.";
                    else if (u === "iceWitch")  msg = "🧊 CONGELAR — Clique em um Campeão adversário, e ele ficará congelado por 3 rodadas. (Campeões Congelados não podem atacar)";
                    else if (u === "linguarudo") msg = "💪 FORTALECER — Clique em um Campeão aliado no seu Campo, e dê a ele +1 de Poder";
                    else if (u === "pirate")    msg = "🪓 INVESTIDA — Clique em um Campeão Aliado e dê a ele INVESTIDA. (Campeões com investida podem atacar durante seu turno como ação livre)";
                    else if (u === "ironGuard") msg = "🛡️ PROTEÇÃO — Clique em um Campeão aliado, e dê a ele Proteção por 1 rodada. (Campeões protegidos não podem ser Atacados)";
                    else if (u === "princesaSlime") msg = "🧪 TRAVESSURA — Escolha um Campeão de Poder 1 no seu campo para trocar de lugar com um Campeão adversário.";
                    else if (u === "valmont")    msg = "🧛 VAMPIRISMO — Escolha um Campeão adversário com Poder 2 ou mais. Ele perde 1 Poder e um aliado seu ganha 1 Poder.";
                    else if (u === "jekiro")     msg = "🔥🧊 FOGO E GELO — TODOS os Campeões adversários. Cada um: 50% Congela (2 rodadas) ou 50% recebe Bola de Fogo (-1 Poder).";
                    else if (u === "tecnomago") msg = "🌀 OUTRA DIMENSÃO — Escolha um Campeão adversário com Poder impresso 2 ou MENOS (ignora bônus de status) para BANIR.";
                    else if (u === "gancho" || u === "hook") msg = "🪝 PUXÃO — Escolha um Campeão adversário. Ele virá para o seu campo por 1 rodada.";
                    else if (u === "alquimista" || u === "potion") msg = "⚗️ POÇÃO — Escolha um Campeão seu. 55% de +1 Poder, 45% de -1 Poder.";
                    else                         msg = "✨ ULTIMATE — Escolha o Campeão alvo da habilidade.";
                } else if (deps.getGamePhase() === "select-attacker") {
                    msg = "⚔️ Clique no seu Campeão destacado em verde que vai ATACAR";
                } else if (deps.getGamePhase() === "select-defender") {
                    msg = "🛡️ Clique no Campeão ADVERSÁRIO destacado em verde que será ATACADO";
                }
            }
            if (msg) {
                if (!banner) {
                    banner = document.createElement("div");
                    banner.id = "target-banner";
                    document.body.appendChild(banner);
                }
                banner.textContent = msg;
                // Se a habilidade/ultimate atual alveja ALIADOS, o
                // banner sobe pro topo da tela (.target-allies) pra
                // não cobrir os campeões aliados embaixo. Para alvos
                // inimigos continua embaixo (já fora dos adversários).
                const u = deps.getTargetData()?.ultimate;
                const ab = deps.getTargetData()?.ability;
                const targetingAllies =
                    deps.getGamePhase() === "target-ally" ||
                    deps.getGamePhase() === "summon-placement" ||
                    (deps.getGamePhase() === "ultimate-target" && (u === "linguarudo" || u === "pirate" || u === "ironGuard" || u === "princesaSlime" || u === "alquimista" || u === "potion"));
                if (deps.getGamePhase() === "target-ally" && ab === "ursificacao") banner.classList.add("target-allies");
                banner.classList.toggle("target-allies", !!targetingAllies);
            } else if (banner) {
                banner.remove();
            }
        }
        
        function updateTurnPill() {}
        
        function updateDeckDiscard() {
            const p0 = deps.getState().players?.[0];
            const p1 = deps.getState().players?.[1];
            const localSeat = deps.dfLocalSeat?.() ?? deps.dfHumanSeat?.() ?? 0;
            const localPl = deps.getState().players?.[localSeat];
            deps.$("deck-count").textContent = p0?.deck?.length ?? 0;
            deps.$("discard-count").textContent = p0?.discard?.length ?? 0;
            const badgeCount = document.getElementById("df-deck-badge-count");
            const badgeAiCount = document.getElementById("df-deck-badge-ai-count");
            const pedCount = document.getElementById("df-deck-count-pedestal-num");
            if (badgeCount) badgeCount.textContent = localPl?.deck?.length ?? 0;
            if (pedCount) pedCount.textContent = localPl?.deck?.length ?? 0;
            if (badgeAiCount) badgeAiCount.textContent = p1?.deck?.length ?? 0;
            try { window.DfDeckBadge?.syncBuyState?.(); } catch (e) { /* */ }
            try { window.__dfSyncBuyCardPedestalLite?.(); } catch (e) { /* */ }
            try { window.__dfSyncActionsPedestalLite?.(); } catch (e) { /* */ }
            const deckAiEl = deps.$("deck-count-ai");
            const discardAiEl = deps.$("discard-count-ai");
            if (deckAiEl) deckAiEl.textContent = p1?.deck?.length ?? 0;
            if (discardAiEl) discardAiEl.textContent = p1?.discard?.length ?? 0;
            const n0 = p0?.name || "—";
            const n1 = p1?.name || "—";
            const deckAiPile = deps.$("deck-pile-ai");
            const discardAiPile = deps.$("discard-pile-ai");
            if (deckAiPile) deckAiPile.title = `Baralho de ${n1}`;
            if (discardAiPile) discardAiPile.title = `Descarte de ${n1}`;
            const deckAiLbl = deckAiPile?.querySelector(".deck-label");
            const discardAiLbl = discardAiPile?.querySelector(".discard-label");
            const mobileHud = !window.DfLayout?.isMobileDesktopFit?.()
                && window.DfLayout?.isTouchGameplay?.()
                && !window.matchMedia("(min-width: 901px)").matches;
            if (deckAiLbl) deckAiLbl.textContent = mobileHud ? "Baralho" : `Baralho · ${n1}`;
            if (discardAiLbl) discardAiLbl.textContent = mobileHud ? "Descarte" : `Descarte · ${n1}`;
            const discardP0 = deps.$("discard-pile");
            const deckEl = deps.$("deck-pile");
            if (discardP0) discardP0.title = `Descarte de ${n0} — clique para ver a lista`;
            if (deckEl) {
                deckEl.classList.remove("hand-full");
                deckEl.title = `Baralho de ${n0}`;
            }
        }
        window.__dfFlushUI = () => {
            _uiCoalesce = 0;
            _uiPendingVfx = false;
            _runUpdateUI();
        };
            window.__dfResetQuadCache = () => {
                _quadRenderFp.length = 0;
                _lastWarmSig = "";
                _lastWarmHandSig = "";
                _lastWarmAt = 0;
                _lastWarmTurn = -1;
            };
        window.dfPurgeTargetingVisuals = purgeTargetingVisuals;
        window.dfSyncTargetingHighlights = syncTargetingHighlights;
        return {
            updateUI, _runUpdateUI, renderAllQuadrants, updateTargetBanner, updateTurnPill,
            updateDeckDiscard, cleanupOrphanGhosts, getChampionDom, applyMode4Rotation,
            buildFlyCardHtml, updateQuadrantVisibility, dfInvalidateQuadrantFp, dfInvalidateAllQuadrantFp,
            getCardTypeClass, gemOverlayHtml, statusOverlayHtml,
        };
    }

    global.DfBoardRenderer = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-input-controller.js ===== */
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

/* ===== df-combat-presenter.js ===== */
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

/* ===== df-mp-presenter.js ===== */
/**
 * Dragonfall — presenter MP (Fase F): filas de apresentação por grupo.
 * Usado só sob window.__DF_ONLINE. vs-IA não carrega este módulo no path crítico.
 */
(function (global) {
    "use strict";

    // 4500ms cortava cenas Pixi que passam de 4s: o job era abortado no meio e o
    // adversário via um flash ou nada. O piso agora cobre a cena típica.
    const FX_TIMEOUT_MS = 6000;
    const FX_TIMEOUT_BUFF_MS = 8000;
    const FX_TIMEOUT_CRITICAL_MS = 10000;
    const BOARD_TIMEOUT_MS = 6500;
    const LONG_FX_KINDS = new Set([
        "strong_arm", "imitar", "legado", "vinganca", "desacelerar",
        "ursificacao", "transformar_bichinho", "hook", "fireAndIce",
        // Cenas de talento/habilidade com Pixi longo — não cortar em 6s.
        "zero_absoluto", "fumaca_toxica", "raio_duplo", "baforada_venenosa",
        "mordida_venenosa", "troca_injusta", "guardian", "corrupt",
        "maldicao_sete_mares", "pesadelo", "necromancia", "doppel_clone",
    ]);
    /** Combate / destruição / voos longos — nunca cortar em 2.5s. */
    const CRITICAL_FX_KINDS = new Set([
        "combat", "blocked_attack", "destroy", "assassinar", "devour",
        "scare_return", "incendiar", "misseis_magicos", "bola_de_fogo",
        "explosao", "poison_kill", "rajada_congelante_destroy",
        "dragon_token_summon", "summon", "combat_telegraph",
    ]);
    /** FX sem conflito de DOM — podem correr 2-wide sob backlog. */
    const SAFE_PARALLEL_FX = new Set(["card_draw", "poison", "land_impact"]);

    function createPresenter(opts = {}) {
        let fxQ = Promise.resolve();
        let fxQAlt = Promise.resolve();
        let boardQ = Promise.resolve();
        let lastQueueWaitMs = 0;
        let lastPresentStartAt = 0;
        let lastAbortAt = 0;
        let pendingCount = 0;
        let activeCount = 0;
        /** @type {Record<number, boolean>} */
        const talentDiscardPending = Object.create(null);

        function reset() {
            fxQ = Promise.resolve();
            fxQAlt = Promise.resolve();
            boardQ = Promise.resolve();
            lastQueueWaitMs = 0;
            lastAbortAt = Date.now();
            pendingCount = 0;
            activeCount = 0;
            Object.keys(talentDiscardPending).forEach((k) => { delete talentDiscardPending[k]; });
        }

        function baseTimeoutFor(group, kind) {
            if (group === "fx") {
                if (kind && CRITICAL_FX_KINDS.has(kind)) return FX_TIMEOUT_CRITICAL_MS;
                if (kind && LONG_FX_KINDS.has(kind)) return FX_TIMEOUT_BUFF_MS;
                return FX_TIMEOUT_MS;
            }
            if (kind && CRITICAL_FX_KINDS.has(kind)) return FX_TIMEOUT_CRITICAL_MS;
            return BOARD_TIMEOUT_MS;
        }

        function adaptiveTimeout(group, baseMs, kind) {
            const slow = !!(global.DfLazyLoad?.isSlowNetwork?.());
            const skew = lastPresentStartAt
                ? Math.max(0, Date.now() - lastPresentStartAt)
                : 0;
            const budget = global.__dfPresentBudgetMs || baseMs;
            const backlog = lastQueueWaitMs > 800 || skew > budget;
            let ms = baseMs | 0;
            if (kind && CRITICAL_FX_KINDS.has(kind)) {
                ms = Math.max(ms, FX_TIMEOUT_CRITICAL_MS);
            }
            if (group === "fx") {
                if (kind && LONG_FX_KINDS.has(kind)) {
                    ms = Math.max(ms, FX_TIMEOUT_BUFF_MS);
                }
                if (slow || backlog) {
                    ms = Math.max(ms, slow ? 9000 : 6500);
                }
            } else if (group === "board") {
                if (slow || backlog) {
                    ms = Math.max(ms, slow ? 9000 : 7500);
                }
            }
            return ms;
        }

        function flashCriticalFallback(kind) {
            if (!kind || !CRITICAL_FX_KINDS.has(kind)) return;
            try {
                global.DfPixiVfx?.sweepOrphanScenes?.();
            } catch (e) { /* */ }
            try {
                const layer = document.getElementById("df-vfx-layer")
                    || document.getElementById("game")
                    || document.body;
                if (!layer) return;
                const flash = document.createElement("div");
                flash.className = "df-mp-present-fallback";
                flash.dataset.ghostBorn = String(Date.now());
                flash.style.cssText =
                    "position:fixed;inset:0;pointer-events:none;z-index:9200;"
                    + "background:radial-gradient(circle at 50% 45%,rgba(255,200,80,.22),transparent 55%);"
                    + "opacity:0;transition:opacity 180ms ease;";
                layer.appendChild(flash);
                requestAnimationFrame(() => { flash.style.opacity = "1"; });
                setTimeout(() => {
                    flash.style.opacity = "0";
                    setTimeout(() => { try { flash.remove(); } catch (e2) { /* */ } }, 220);
                }, 280);
            } catch (e3) { /* */ }
            try {
                console.warn("[DfMpPresenter] PRESENT_TIMEOUT critical", kind);
            } catch (e4) { /* */ }
        }

        function enqueue(group, fn, timeoutMs, meta) {
            const kind = meta && meta.kind;
            const base = timeoutMs != null
                ? timeoutMs
                : baseTimeoutFor(group, kind);
            const timeout = adaptiveTimeout(group, base, kind);
            const started = Date.now();
            const job = { aborted: false, kind: kind || null, group };
            pendingCount++;

            const run = () => {
                lastQueueWaitMs = Date.now() - started;
                lastPresentStartAt = Date.now();
                pendingCount = Math.max(0, pendingCount - 1);
                if (job.aborted) return Promise.resolve();
                activeCount++;
                let timer = null;
                const timed = Promise.race([
                    Promise.resolve().then(() => fn(job)),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            job.aborted = true;
                            lastAbortAt = Date.now();
                            flashCriticalFallback(kind);
                            try {
                                global.DfPixiVfx?.sweepOrphanScenes?.();
                            } catch (e) { /* */ }
                            reject(new Error("PRESENT_TIMEOUT_" + group));
                        }, timeout);
                    }),
                ]);
                return timed.finally(() => {
                    if (timer) clearTimeout(timer);
                    activeCount = Math.max(0, activeCount - 1);
                });
            };

            if (group === "immediate") {
                return Promise.resolve().then(run).catch((e) => {
                    console.warn("[DfMpPresenter] immediate", e);
                });
            }
            if (group === "fx") {
                // 2-wide só para kinds sem conflito de DOM quando a fila está atrasada.
                const canParallel = !!(kind && SAFE_PARALLEL_FX.has(kind) && lastQueueWaitMs > 600);
                if (canParallel) {
                    // Alterna entre duas lanes leves.
                    const useAlt = lastQueueWaitMs % 2 === 1;
                    if (useAlt) {
                        fxQAlt = fxQAlt.then(run).catch((e) => console.warn("[DfMpPresenter] fx", e));
                        return fxQAlt;
                    }
                }
                fxQ = fxQ.then(run).catch((e) => console.warn("[DfMpPresenter] fx", e));
                return fxQ;
            }
            boardQ = boardQ.then(run).catch((e) => console.warn("[DfMpPresenter] board", e));
            return boardQ;
        }

        function groupForVisual(kind, explicit) {
            if (explicit === "fx" || explicit === "board" || explicit === "immediate") return explicit;
            // Telegraph não fica atrás de on-enter na fxQ.
            if (kind === "combat_telegraph") return "immediate";
            if (kind === "talent_cast" || kind === "talent_discard") return "board";
            const fx = opts.fxKinds;
            if (fx && fx.has(kind)) return "fx";
            return "board";
        }

        function markTalentCast(ownerP) {
            talentDiscardPending[ownerP | 0] = true;
        }

        function clearTalentPending(ownerP) {
            delete talentDiscardPending[ownerP | 0];
        }

        function hasTalentPending(ownerP) {
            return !!talentDiscardPending[ownerP | 0];
        }

        function isBusy() {
            return pendingCount > 0 || activeCount > 0;
        }

        function getPendingCount() {
            return pendingCount + activeCount;
        }

        function whenIdle(timeoutMs) {
            const budget = timeoutMs != null ? timeoutMs : 12000;
            if (!isBusy()) return Promise.resolve();
            const t0 = Date.now();
            return new Promise((resolve) => {
                const tick = () => {
                    if (!isBusy() || (Date.now() - t0) > budget) {
                        resolve();
                        return;
                    }
                    setTimeout(tick, 60);
                };
                tick();
            });
        }

        function getTelemetry() {
            return {
                queueWaitMs: lastQueueWaitMs,
                presentStartAt: lastPresentStartAt,
                presentSkewMs: lastPresentStartAt
                    ? Math.max(0, Date.now() - lastPresentStartAt)
                    : 0,
                lastAbortAt,
                pendingCount,
                activeCount,
                busy: isBusy(),
            };
        }

        function resolveFxTimeout(kind) {
            return adaptiveTimeout("fx", baseTimeoutFor("fx", kind), kind);
        }

        function resolveBoardTimeout(kind) {
            return adaptiveTimeout("board", baseTimeoutFor("board", kind), kind);
        }

        return {
            enqueue,
            groupForVisual,
            reset,
            markTalentCast,
            clearTalentPending,
            hasTalentPending,
            getTelemetry,
            resolveFxTimeout,
            resolveBoardTimeout,
            adaptiveTimeout,
            isBusy,
            getPendingCount,
            whenIdle,
            FX_TIMEOUT_MS,
            FX_TIMEOUT_BUFF_MS,
            FX_TIMEOUT_CRITICAL_MS,
            BOARD_TIMEOUT_MS,
            LONG_FX_KINDS,
            CRITICAL_FX_KINDS,
            SAFE_PARALLEL_FX,
        };
    }

    global.DfMpPresenter = { create: createPresenter };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-online-session.js ===== */
/**
 * Dragonfall — sessão online PvP (Fase 1.1 arquitetura).
 * Gerado por: node scripts/build-phase1-online.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        if (typeof deps.$ !== "function") deps.$ = (id) => document.getElementById(id);
        let dfNet = null;
        let dfOnlineHeroPicked = false;
        let dfOnlineReady = false;
        let dfOnlineSyncTimer = null;
        let dfQueueTimer = null;
        let dfQueueStartedAt = 0;
        let _dfReactiveBlockWaiter = null;
        let _dfReactiveProtectWaiter = null;
        let _dfReactiveCancelWaiter = null;
        let _dfLastRemoteSeq = 0;
        /** Fila serial para SUMMON / END_TURN / FIELD_COMMIT (evita abort presentGen). */
        let _dfSeqCriticalQ = Promise.resolve();
        /** Fila só da IA de desconexão — pacing dela não pode travar a jogada local. */
        let _dfAiPresentQ = Promise.resolve();
        let _dfAiLastPresentAt = 0;
        /**
         * Piso de orçamento por tipo de cena (ms) no replay de apresentação.
         *
         * O teto genérico (~4,2s) vale por VISUAL, mas cenas multi-alvo gastam o
         * tempo por ALVO. Sem piso próprio, o Raio Duplo (até 2,8s × 2 alvos)
         * tinha o segundo raio cortado e a habilidade parecia não acontecer.
         */
        const DF_PRESENT_KIND_FLOOR_MS = Object.freeze({
            raio_duplo: 7000,
            misseis_magicos: 7000,
            fumaca_toxica: 7000,
            zero_absoluto: 7000,
            baforada_venenosa: 6500,
            grito_de_guerra: 6000,
        });
        /** Cenas que chegam por mais de um caminho no MP — dedupe por conteúdo. */
        const DF_REPLAY_DEDUPE_KINDS = new Set(["necromancia", "poison_kill", "mordida_venenosa"]);
        const _dfReplayDedupeAt = new Map();
        /**
         * Reserva uma cena para apresentação. Retorna false se a mesma cena já
         * foi apresentada há pouco — é o que impede necromancia/veneno de rodar
         * duas vezes quando chegam por dois caminhos distintos.
         */
        function dfClaimReplayScene(kind, parts) {
            // Com uid, ele SOZINHO identifica a cena. Incluir o nome da carta
            // quebrava o dedupe do veneno: o caminho pré-reconcile não tinha o
            // nome (`card` vazio) e o replay tinha, gerando chaves diferentes —
            // por isso a destruição por Envenenado aparecia duas vezes no MP.
            const key = parts?.uid != null && parts.uid !== ""
                ? `${kind}:${parts.uid}`
                : [kind, "", parts?.card ?? "", parts?.p ?? "", parts?.i ?? ""].join(":");
            const now = Date.now();
            for (const [k, t] of _dfReplayDedupeAt) {
                if (now - t > 9000) _dfReplayDedupeAt.delete(k);
            }
            if (now - (_dfReplayDedupeAt.get(key) || 0) < 6000) return false;
            _dfReplayDedupeAt.set(key, now);
            return true;
        }
        /** Mutex boot MP: evita room_state + match_start duplicarem reveal/música/startTurn. */
        let _dfOnlineBootPromise = null;
        let _dfOnlineBootKey = null;
        let _dfBoardSyncTimer = null;
        let _dfPendingBoardAnim = null;
        let _dfRemoteBodyQ = Promise.resolve();
        /** @deprecated — use _dfPresenter groups (board/fx). Mantido como alias do board. */
        let _dfVisualQ = Promise.resolve();
        let _dfLastVisualPatchAt = 0;
        /** Evita replay_sync duplicado logo após reconnected (mesmo seq). */
        let _dfSkipNextReplaySyncSeq = null;
        let _dfLastVisualSeq = 0;
        let _dfLastAttackResolveSeq = 0;
        let _dfLastAckPresentSeq = 0;
        /** Após commit de talento: bloqueia revive de activeTalent órfão no reconcile até próximo TALENT_START. */
        let _dfMpTalentCommitted = false;
        /** Watchdogs por seat: limpam spotlight se talent_discard nunca chegar (MP only). */
        const _dfTalentSpotlightWatchdogs = Object.create(null);

        function dfOnlinePurgeTalentSpotlight(ownerP) {
            try {
                if (ownerP != null && _dfTalentSpotlightWatchdogs[ownerP]) {
                    clearTimeout(_dfTalentSpotlightWatchdogs[ownerP]);
                    delete _dfTalentSpotlightWatchdogs[ownerP];
                }
            } catch (e) { /* */ }
            try {
                const st = deps.getState();
                if (st) st.activeTalent = null;
            } catch (e) { /* */ }
            try {
                const layer = document.getElementById("talent-spotlight-layer");
                layer?.replaceChildren?.();
                layer?.classList?.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
            } catch (e) { /* */ }
            try {
                if (ownerP != null) _dfPresenter?.clearTalentPending?.(ownerP);
                else {
                    for (let i = 0; i < 4; i++) _dfPresenter?.clearTalentPending?.(i);
                }
            } catch (e) { /* */ }
            try { deps.updateUI?.(true); } catch (e) { /* */ }
        }

        function dfOnlineArmTalentSpotlightWatchdog(ownerP) {
            if (!window.__DF_ONLINE || ownerP == null) return;
            try {
                if (_dfTalentSpotlightWatchdogs[ownerP]) {
                    clearTimeout(_dfTalentSpotlightWatchdogs[ownerP]);
                }
            } catch (e) { /* */ }
            _dfTalentSpotlightWatchdogs[ownerP] = setTimeout(() => {
                delete _dfTalentSpotlightWatchdogs[ownerP];
                try {
                    const st = deps.getState();
                    if (!st?.activeTalent) {
                        _dfPresenter?.clearTalentPending?.(ownerP);
                        return;
                    }
                    if (st.activeTalent.ownerP !== ownerP) return;
                    console.warn("[DF online] talent spotlight watchdog — purge", ownerP);
                    dfOnlinePurgeTalentSpotlight(ownerP);
                } catch (e) { /* */ }
            }, 9000);
        }
        /** Anti-duplo feedback de reação no requester (ANSWER + resolveCombat). */
        const _dfReactiveFeedbackAt = { block: 0, protect: 0, cancel: 0 };
        /** Barreira de resync (reconnect) — evita remote_action durante apply. */
        let _dfResyncInProgress = false;
        let _dfPendingRemoteDuringResync = [];
        /** Seqs de ULTIMATE_PLAY já animados (evita duplo no reconnect). */
        const _dfUltReplaySeqs = new Set();
        let _dfStartTurnAfterResync = false;
        /** Após reconnect: aplica só snapshot — sem replay VFX acelerado das jogadas perdidas. */
        let _dfMpReconnectQuietUntil = 0;
        function dfOnlineArmReconnectQuiet(ms = 4000) {
            _dfMpReconnectQuietUntil = Date.now() + Math.max(500, ms | 0);
            try { window.__dfMpReconnectQuietUntil = _dfMpReconnectQuietUntil; } catch (e) { /* */ }
        }
        function dfOnlineInReconnectQuiet() {
            return Date.now() < (_dfMpReconnectQuietUntil | 0);
        }

        /** Fase 2: tipos agora autoritativos no servidor — não enviar snapshot. */
        const DF_MP_NOSNAP_TYPES = new Set([
            "ABILITY_TARGET",
            "ULTIMATE_TARGET",
            "MENU_CHOICE",
            "NECROMANCIA_PICK",
            "UNFREEZE_CONFIRM",
            "TALENT_TARGET",
            "REACTIVE_BLOCK_ANSWER",
            "REACTIVE_PROTECTION_ANSWER",
            "REACTIVE_CANCEL_ANSWER",
        ]);

        function dfOnlineBroadcastVisualAwait(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) {
                return Promise.resolve();
            }
            return dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => {
                return dfNet.sendAction({
                    type: "PLAY_VISUAL",
                    playerId: deps.dfLocalSeat(),
                    anim,
                }, null).catch((e2) => console.warn("[DF online] PRESENT/PLAY_VISUAL", e2 || e));
            });
        }

        /** Timeout do requester: tell (~560ms) + prompt 5s + RTT. */
        const DF_REACTIVE_ANSWER_TIMEOUT_MS = (typeof window !== "undefined" && window.__DF_ONLINE)
            ? 10000
            : 10000;
        function dfReactiveAnswerTimeoutMs() {
            return window.__DF_ONLINE ? 10000 : 10000;
        }
        /** Cancel Ultimate: prompt 5s + tell + margem de rede — não fail-open cego. */
        function dfReactiveCancelTimeoutMs() {
            return window.__DF_ONLINE ? 11000 : 10000;
        }

        /**
         * Mostra a carta reação ao peer frustrado (activeTalent + voo pro descarte).
         * MP-only — vs-IA já vê a carta no prompt local.
         */
        async function dfOnlineRevealReactiveCard(ownerP, cardName, talentEffect) {
            if (!window.__DF_ONLINE) return;
            const st = deps.getState();
            const fakeCard = {
                name: cardName || "Reação",
                category: "talent",
                subcategory: "reaction",
                talentEffect: talentEffect || null,
                power: 0,
                currentPower: 0,
            };
            st.activeTalent = { ownerP, card: fakeCard };
            try { deps.updateUI(); } catch (e) { /* */ }
            // Peer precisa ver a reação ~2s antes do fly-to-discard.
            const DF_REACTIVE_REVEAL_MS = 2000;
            try {
                await (deps.wait?.(DF_REACTIVE_REVEAL_MS)
                    || new Promise((r) => setTimeout(r, DF_REACTIVE_REVEAL_MS)));
            } catch (e) { /* */ }
            try {
                if (typeof deps.flyActiveTalentToDiscard === "function") {
                    await Promise.race([
                        deps.flyActiveTalentToDiscard(ownerP),
                        deps.wait?.(1200) || new Promise((r) => setTimeout(r, 1200)),
                    ]);
                } else {
                    await (deps.wait?.(400) || new Promise((r) => setTimeout(r, 400)));
                }
            } catch (e) { /* */ }
            try {
                if (deps.getState().activeTalent?.ownerP === ownerP) {
                    deps.getState().activeTalent = null;
                }
                deps.updateUI();
            } catch (e2) { /* */ }
        }

        /**
         * Feedback no seat do iniciador quando a reação do peer confirma.
         * MP-only. Dedup curto evita dobrar com PRESENT / resolveCombat.
         */
        async function dfOnlinePlayReactivePeerFeedback(kind, payload = {}) {
            if (!window.__DF_ONLINE) return;
            const now = Date.now();
            if (now - (_dfReactiveFeedbackAt[kind] || 0) < 2800) return;
            _dfReactiveFeedbackAt[kind] = now;
            const defOwner = payload.defenderPlayerId ?? payload.defOwner ?? 0;
            const defP = deps.getState().players[defOwner];
            const defName = defP?.name || "Oponente";
            try {
                if (kind === "block") {
                    const defIdx = payload.defenderIdx ?? payload.defIdx;
                    const defender = (defIdx != null)
                        ? (deps.getState().players[defOwner]?.field?.[defIdx] || null)
                        : null;
                    deps.log?.(`${defName} usou Bloquear Ataque — ataque cancelado!`);
                    deps.flashRuleBanner?.("🛡️ Ataque Bloqueado!", `${defName} usou Bloquear Ataque.`);
                    if (typeof deps.animateBlockedAttack === "function") {
                        await deps.animateBlockedAttack(defOwner, defender || { name: "Campeão" });
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "BLOQUEAR ATAQUE", "bloquearAtaque");
                } else if (kind === "protect") {
                    let defender = null;
                    if (payload.defenderUid != null) {
                        defender = defP?.field?.find((c) => c && c.uid === payload.defenderUid) || null;
                    }
                    if (!defender && payload.defenderName) {
                        defender = defP?.field?.find((c) => c && c.name === payload.defenderName) || null;
                    }
                    if (!defender) defender = { name: payload.defenderName || "Campeão" };
                    deps.log?.(`${defName} usou Proteção Divina!`);
                    deps.flashRuleBanner?.(
                        "✨ Proteção Divina!",
                        `${defName} protegeu ${defender.name || "seu Campeão"}.`,
                    );
                    if (typeof deps.animateDivineProtection === "function") {
                        await deps.animateDivineProtection(defOwner, defender);
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "PROTEÇÃO DIVINA", "protecaoDivina");
                } else if (kind === "cancel") {
                    const casterP = payload.casterP ?? payload.attOwner ?? deps.dfLocalSeat();
                    const hero = payload.ultimateName
                        ? { ultimateName: payload.ultimateName }
                        : (deps.getHeroDef?.(deps.getState().players[casterP]?.heroId)
                            || { ultimateName: "Ultimate" });
                    deps.log?.(`${defName} cancelou a Ultimate de ${deps.getState().players[casterP]?.name || "você"}!`);
                    deps.flashRuleBanner?.(
                        "🚫 Ultimate Cancelada!",
                        `${defName} usou Cancelar Ultimate.`,
                    );
                    if (typeof deps.animateCancelUltimate === "function") {
                        await deps.animateCancelUltimate(casterP, hero);
                    }
                    await dfOnlineRevealReactiveCard(defOwner, "CANCELAR ULTIMATE", "cancelarUltimate");
                }
            } catch (e) {
                console.warn("[DF online] reactive peer feedback", e);
            }
        }

        /** On-enter / talent VFX: fora da fila do summon (latência peer). */
        const DF_PARALLEL_VISUAL_KINDS = new Set([
            "pesadelo", "wings", "roubar", "desacelerar", "strong_arm",
            "bola_de_fogo", "assassinar", "maldicao_sete_mares",
            "devour", "imitar", "ursificacao", "transformar_bichinho", "fury",
            "fire_aura", "guardiao", "guardian", "fumaca_toxica", "raio_duplo",
            "explosao", "zero_absoluto", "barrier_grant", "baforada_venenosa",
            "incendiar", "mordida_venenosa", "poison", "land_impact", "card_draw",
            "combat_telegraph",
            "misseis_magicos", "divine_protection", "cancel_ultimate",
            "dragon_token_summon", "explosao_venenosa_burst",
            "blocked_attack", "vinganca", "necromancia", "thunder_discard",
            "aceleracao", "rajada_congelante", "rajada_congelante_destroy",
            "corrupt", "doppel_cast", "ritual_spotlight", "ritual_spotlight_clear",
            "legado",
        ]);
        // scare_return / doppel_clone: SERIAL via FIELD_COMMIT after_vfx (não parallel).
        // troca_injusta: SERIAL após land do SUMMON (precisa DOM nos dois slots).
        // talent_cast / talent_discard: SERIAL (board) — evita race discard-before-cast.

        const _dfPresenter = (typeof window !== "undefined" && window.DfMpPresenter)
            ? window.DfMpPresenter.create({ fxKinds: DF_PARALLEL_VISUAL_KINDS })
            : null;

        const DF_ONLINE_LOCK_PHASES = new Set([
            "menu", "reactive-block", "detail", "discard", "game-over",
        ]);
        const DF_ONLINE_PICK_PHASES = new Set([
            "select-attacker", "select-defender", "target-champion",
            "target-ally", "ultimate-target",
        ]);
        /** On-enter que devem esperar o land do summon no peer. */
        const DF_ON_ENTER_VISUAL_KINDS = new Set([
            "pesadelo", "wings", "roubar", "desacelerar", "strong_arm",
            "bola_de_fogo", "assassinar", "maldicao_sete_mares", "troca_injusta",
            "devour", "imitar", "transformar_bichinho", "fury",
            "fire_aura", "guardiao", "guardian", "fumaca_toxica", "raio_duplo",
            "incendiar", "mordida_venenosa", "poison", "corrupt",
        ]);
        // ursificacao: NÃO espera gate de summon — ally-target pós-invocação.
        let _dfPeerSummonGate = Promise.resolve();
        let _dfPeerSummonUntil = 0;
        const DF_STATUS_BOOL_KEYS = [
            "frozen", "tapped", "freeAttack", "shielded", "shieldedPermanent",
            "barrier", "barrierPermanent", "vulnerable", "silenced", "poisoned",
            "fury", "pulled", "inspiracao", "mimico", "wallBuff", "guerraBuff",
            "foreverGrowth", "fireAura", "burning", "corruptedNoHonor", "furyBonusActive",
        ];
        const DF_STATUS_NUM_KEYS = [
            "frozenTurns", "shieldedTurns", "barrierTurns", "poisonTurns",
            "furyTurns", "furyStacks", "guerraBuffTurns", "burningTurns",
            "fireAuraTurns", "currentPower", "poisonedByP", "burningByP",
        ];

        window.__DF_ROOM_HEROES = window.__DF_ROOM_HEROES || [null, null];

        /** Indicador discreto de rede (Fase 1) — um só, sem spam de toast. Só no MP. */
        function setNetStatusUi(status) {
            let el = document.getElementById("df-net-status");
            // vs-IA / hub: nunca mostrar Offline/Reconectando.
            if (!window.__DF_ONLINE) {
                if (el) {
                    el.style.opacity = "0";
                    el.textContent = "";
                }
                return;
            }
            if (!el) {
                el = document.createElement("div");
                el.id = "df-net-status";
                el.setAttribute("aria-live", "polite");
                el.style.cssText = [
                    "position:fixed", "top:10px", "right:10px", "z-index:9998",
                    "padding:6px 10px", "border-radius:8px", "font:600 12px/1.2 system-ui,sans-serif",
                    "pointer-events:none", "opacity:0", "transition:opacity .25s",
                    "background:rgba(12,14,20,.82)", "color:#e8eef8", "border:1px solid rgba(255,215,107,.35)",
                ].join(";");
                document.body.appendChild(el);
            }
            const map = {
                connected: { text: "", hide: true },
                reconnecting: { text: "Reconectando…", hide: false },
                offline: { text: "Offline", hide: false },
            };
            const m = map[status] || map.connected;
            if (m.hide) {
                el.style.opacity = "0";
                el.textContent = "";
                return;
            }
            el.textContent = m.text;
            el.style.opacity = "1";
            el.style.color = status === "offline" ? "#ffb4b4" : "#ffd76b";
        }

        /**
         * Sai do modo online (flags + UI de rede). Obrigatório antes de vs-IA
         * para a IA voltar a jogar e não aparecer Offline / servidor.
         */
        function dfClearOnlineMatchFlags(opts = {}) {
            // Mid-match PvP: leaveRoom = SURRENDER — só limpa se force ou partida já acabou.
            if (!opts.force && window.__DF_ONLINE) {
                try {
                    const st = deps.getState?.();
                    if (st?.started && st.winner == null && document.body.classList.contains("df-pvp-mode")) {
                        console.warn("[DF online] dfClearOnlineMatchFlags blocked mid-match");
                        return;
                    }
                } catch (e) { /* */ }
            }
            const leaveNet = opts.leaveNet !== false;
            window.__DF_ONLINE = false;
            window.__DF_SEAT = 0;
            window.__dfOnlineSkipMaintRules = false;
            window.__dfOnlineMatchBoot = false;
            window.__dfOnlinePickingHero = false;
            window.__dfSummonInFlight = false;
            window.__dfOnlineBootDone = false;
            window.__dfOnlineBootLockInput = false;
            window.__dfMatchBoardRevealedKey = null;
            window.__dfBattleMusicStartedKey = null;
            window.__dfLocalSummonUid = null;
            window.__dfLocalSummonAnimKey = null;
            try { deps.setApplyingRemote(false); } catch (e) { /* */ }
            document.body.classList.remove("df-online-seat-1", "df-pvp-mode", "df-peer-ai");
            window.__dfPeerAiActive = false;
            window.__dfPeerAiSeat = null;
            try {
                const b = document.getElementById("df-peer-ai-banner");
                if (b) b.hidden = true;
            } catch (e) { /* */ }
            setNetStatusUi("connected");
            const pill = document.getElementById("df-net-status");
            if (pill) {
                pill.style.opacity = "0";
                pill.textContent = "";
            }
            if (leaveNet) {
                try { dfPvPStopQueueTimer(); } catch (e) { /* */ }
                void (async () => {
                    try { await dfNet?.leaveQueue?.(); } catch (e) { /* */ }
                    // Hub / vs-IA: não abandonar assento por default (evita envenenar reconexão).
                    try {
                        await dfNet?.leaveRoom?.({
                            abandon: opts.abandon === true,
                            clearSession: opts.clearSession !== false,
                        });
                    } catch (e) { /* */ }
                })();
            }
        }

        function dfOnlineAwaitReactiveBlock(attOwner, attIdx, defOwner, defIdx) {
            return new Promise((resolve) => {
                // Prompt 5s + tell + RTT. ANSWER sai antes das animações do defensor.
                const tid = setTimeout(() => {
                    if (_dfReactiveBlockWaiter) {
                        _dfReactiveBlockWaiter.resolve(false);
                        _dfReactiveBlockWaiter = null;
                    }
                }, dfReactiveAnswerTimeoutMs());
                _dfReactiveBlockWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveBlockWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_BLOCK_QUERY",
                    attackerIdx: attIdx,
                    defenderPlayerId: defOwner,
                    defenderIdx: defIdx,
                });
            });
        }

        async function dfOnlineResolveReactiveBlock(attOwner, attIdx, defOwner, defIdx, attacker, defender) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) {
                return deps.offerReactiveBlock(attOwner, defOwner, attacker, defender);
            }
            if (defOwner === deps.dfLocalSeat()) {
                return deps.offerReactiveBlock(attOwner, defOwner, attacker, defender, { allowRemotePrompt: true });
            }
            if (attOwner !== deps.dfLocalSeat()) return false;
            // Sempre consulta o defensor — mão do peer é fog-of-war no cliente do atacante.
            return dfOnlineAwaitReactiveBlock(attOwner, attIdx, defOwner, defIdx);
        }

        /** Resposta imediata a REACTIVE_BLOCK_QUERY (fora da fila visual). */
        async function dfOnlineHandleReactiveBlockQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const hasBlock = !!defP?.hand?.some((c) => c && c.talentEffect === "bloquearAtaque");
            let blocked = false;
            if (hasBlock) {
                const attacker = deps.getState().players[envelope.fromSeat]?.field?.[act.attackerIdx];
                const defender = deps.getState().players[defOwner]?.field?.[act.defenderIdx];
                blocked = await deps.offerReactiveBlock(
                    envelope.fromSeat,
                    defOwner,
                    attacker,
                    defender,
                    { allowRemotePrompt: true },
                );
            }
            // ANSWER antes das animações — o atacante não pode timeout enquanto o VFX roda.
            dfOnlineSendNow({
                type: "REACTIVE_BLOCK_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!blocked,
                blocked: !!blocked,
                attackerIdx: act.attackerIdx,
                defenderPlayerId: defOwner,
                defenderIdx: act.defenderIdx,
                attOwner: envelope.fromSeat,
            });
            if (blocked) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "blocked_attack",
                        defOwner,
                        defIdx: act.defenderIdx,
                        cardName: "BLOQUEAR ATAQUE",
                        talentEffect: "bloquearAtaque",
                    });
                } catch (e) { /* */ }
            }
        }

        function dfOnlineAwaitReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate) {
            return new Promise((resolve) => {
                const tid = setTimeout(() => {
                    if (_dfReactiveProtectWaiter) {
                        _dfReactiveProtectWaiter.resolve(false);
                        _dfReactiveProtectWaiter = null;
                    }
                }, dfReactiveAnswerTimeoutMs());
                _dfReactiveProtectWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveProtectWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_PROTECTION_QUERY",
                    defenderPlayerId: defOwner,
                    sourceLabel: sourceLabel || null,
                    defenderName: defender?.name || null,
                    defenderUid: defender?.uid || null,
                    isUltimate: !!isUltimate,
                });
            });
        }

        async function dfOnlineResolveReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) {
                return deps.offerReactiveProtection(attOwner, defOwner, defender, sourceLabel, isUltimate);
            }
            if (defOwner === deps.dfLocalSeat()) {
                return deps.offerReactiveProtection(
                    attOwner, defOwner, defender, sourceLabel, isUltimate, { allowRemotePrompt: true },
                );
            }
            if (attOwner !== deps.dfLocalSeat()) return false;
            return dfOnlineAwaitReactiveProtect(attOwner, defOwner, defender, sourceLabel, isUltimate);
        }

        async function dfOnlineHandleReactiveProtectQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const hasProtect = !!defP?.hand?.some((c) => c && c.talentEffect === "protecaoDivina");
            let used = false;
            let defender = null;
            if (hasProtect) {
                if (act.defenderUid != null) {
                    defender = defP?.field?.find((c) => c && c.uid === act.defenderUid) || null;
                }
                if (!defender && act.defenderName) {
                    defender = defP?.field?.find((c) => c && c.name === act.defenderName) || null;
                }
                if (!defender) defender = { name: act.defenderName || "Campeão" };
                used = await deps.offerReactiveProtection(
                    envelope.fromSeat,
                    defOwner,
                    defender,
                    act.sourceLabel || "Redução de Poder",
                    !!act.isUltimate,
                    { allowRemotePrompt: true },
                );
            }
            dfOnlineSendNow({
                type: "REACTIVE_PROTECTION_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!used,
                protected: !!used,
                defenderPlayerId: defOwner,
                defenderIdx: (() => {
                    if (!defender?.uid) return act.defenderIdx ?? null;
                    const i = defP?.field?.findIndex((c) => c && c.uid === defender.uid);
                    return i >= 0 ? i : (act.defenderIdx ?? null);
                })(),
                defenderName: act.defenderName || null,
                defenderUid: act.defenderUid || defender?.uid || null,
                attOwner: envelope.fromSeat,
            });
            if (used) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "divine_protection",
                        defOwner,
                        defenderName: defender?.name || act.defenderName || null,
                        defenderUid: defender?.uid || act.defenderUid || null,
                        defenderPlayerId: defOwner,
                        cardName: "PROTEÇÃO DIVINA",
                        talentEffect: "protecaoDivina",
                    });
                } catch (e) { /* */ }
            }
        }

        function dfOnlineAwaitReactiveCancel(casterP, hero, defOwner) {
            return new Promise((resolve) => {
                const tid = setTimeout(() => {
                    if (_dfReactiveCancelWaiter) {
                        _dfReactiveCancelWaiter.resolve(false);
                        _dfReactiveCancelWaiter = null;
                    }
                }, dfReactiveCancelTimeoutMs());
                _dfReactiveCancelWaiter = {
                    resolve(v) {
                        clearTimeout(tid);
                        _dfReactiveCancelWaiter = null;
                        resolve(!!v);
                    },
                };
                dfOnlineSendNow({
                    type: "REACTIVE_CANCEL_QUERY",
                    defenderPlayerId: defOwner,
                    heroId: hero?.id || null,
                    ultimateName: hero?.ultimateName || null,
                });
            });
        }

        async function dfOnlineResolveReactiveCancel(casterP, hero, defOwner) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return false;
            // Overlay só via QUERY no holder — caster apenas aguarda ANSWER.
            if (casterP !== deps.dfLocalSeat()) return false;
            if (defOwner === deps.dfLocalSeat()) return false;
            return dfOnlineAwaitReactiveCancel(casterP, hero, defOwner);
        }

        async function dfOnlineHandleReactiveCancelQuery(envelope) {
            const act = envelope?.action;
            if (!act) return;
            const defOwner = act.defenderPlayerId;
            if (defOwner !== deps.dfLocalSeat()) return;
            const defP = deps.getState().players[defOwner];
            const handIdx = defP?.hand?.findIndex((c) => c && c.talentEffect === "cancelarUltimate") ?? -1;
            let cancelled = false;
            let hero = null;
            if (handIdx >= 0) {
                hero = act.ultimateName
                    ? { ultimateName: act.ultimateName, id: act.heroId }
                    : (deps.getHeroDef?.(deps.getState().players[envelope.fromSeat]?.heroId) || { ultimateName: "Ultimate" });
                cancelled = await deps.showHumanCancelUltimatePrompt(
                    defOwner, handIdx, envelope.fromSeat, hero,
                );
            }
            dfOnlineSendNow({
                type: "REACTIVE_CANCEL_ANSWER",
                queryFrom: envelope.fromSeat,
                use: !!cancelled,
                cancelled: !!cancelled,
                defenderPlayerId: defOwner,
                attOwner: envelope.fromSeat,
                ultimateName: act.ultimateName || null,
            });
            if (cancelled) {
                try {
                    await dfOnlineBroadcastVisualAwait({
                        kind: "cancel_ultimate",
                        casterP: envelope.fromSeat,
                        ultimateName: hero?.ultimateName || act.ultimateName || null,
                        cardName: "CANCELAR ULTIMATE",
                        talentEffect: "cancelarUltimate",
                    });
                } catch (e) { /* */ }
            }
        }

        /**
         * Aplica events / presentationEnvelope do motor.
         * Se opts.authApplied, só VFX (estado já veio no authoritativeState).
         */
        function dfOnlineApplyPresentationFromEvents(envelope, opts = {}) {
            const authApplied = !!opts.authApplied;
            const fromPresentation = envelope.presentationEnvelope;
            if (!authApplied && fromPresentation?.fieldPatches?.length) {
                dfOnlineApplyFieldPatches(fromPresentation.fieldPatches);
                deps.updateUI(true);
            }
            const events = envelope?.events;
            if (!authApplied && Array.isArray(events) && events.length) {
                const patches = [];
                for (const ev of events) {
                    if (!ev || typeof ev !== "object") continue;
                    if (ev.type === "STATUS_SET" && ev.targetP != null && ev.targetI != null) {
                        patches.push({
                            targetP: ev.targetP,
                            targetI: ev.targetI,
                            ...(ev.flags || {}),
                        });
                    } else if ((ev.type === "POWER_REDUCED" || ev.type === "VINGANCA_HIT"
                        || ev.type === "POWER_CHANGED")
                        && ev.targetP != null && ev.targetI != null) {
                        if (ev.removed || (ev.currentPower != null && ev.currentPower <= 0
                            && ev.type !== "POWER_CHANGED")) {
                            patches.push({ targetP: ev.targetP, targetI: ev.targetI, removed: true });
                        } else if (ev.currentPower != null) {
                            patches.push({
                                targetP: ev.targetP,
                                targetI: ev.targetI,
                                currentPower: ev.currentPower,
                            });
                        }
                    } else if (ev.type === "DESTROY" && ev.targetP != null && ev.targetI != null) {
                        patches.push({ targetP: ev.targetP, targetI: ev.targetI, removed: true });
                    }
                }
                if (patches.length) {
                    dfOnlineApplyFieldPatches(patches);
                    deps.updateUI(true);
                }
            }
            // Vingança / bursts: VFX a partir dos events (auth já mutou o board).
            if (Array.isArray(events)) {
                for (const ev of events) {
                    if (ev?.type === "ON_DESTROY_BURST" && ev.ability === "legado") {
                        for (const t of ev.applied || []) {
                            if (t?.p == null || t?.i == null) continue;
                            void dfOnlineReplayAnim({
                                kind: "legado",
                                ownerP: ev.ownerIdx,
                                targetP: t.p,
                                targetI: t.i,
                                powerAfter: t.currentPower,
                            });
                        }
                    }
                    if (ev?.type === "ON_DESTROY_BURST" && ev.ability === "vinganca") {
                        for (const t of ev.applied || []) {
                            if (t?.p == null || t?.i == null) continue;
                            void dfOnlineReplayAnim({
                                kind: "vinganca",
                                ownerP: ev.ownerIdx,
                                targetP: t.p,
                                targetI: t.i,
                                powerAfter: t.currentPower,
                            });
                        }
                    }
                }
            }
            if (fromPresentation?.visuals?.length && !authApplied) {
                const skipKinds = opts.skipVisualKinds instanceof Set
                    ? opts.skipVisualKinds
                    : (Array.isArray(opts.skipVisualKinds)
                        ? new Set(opts.skipVisualKinds)
                        : null);
                for (const vis of fromPresentation.visuals) {
                    if (!vis?.kind || vis.kind === "combat") continue;
                    if (skipKinds?.has(vis.kind)) continue;
                    void dfOnlineReplayAnim(vis);
                }
            }
        }

        function dfApplyRoomHeroState(data) {
            if (!data?.players) return;
            window.__DF_ROOM_HEROES = [
                data.players[0]?.heroId || null,
                data.players[1]?.heroId || null,
            ];
            dfRefreshHeroSelectLocks();
        }

        function dfOnlineHeroBlocked(heroId) {
            // Rankeado: mesmos heróis permitidos — não bloqueia.
            void heroId;
            return false;
        }

        function dfRefreshHeroSelectLocks() {
            const grid = deps.$("hero-grid");
            if (!grid) return;
            grid.querySelectorAll(".hero-card[data-hero-id]").forEach((card) => {
                card.classList.remove("hero-taken");
                const lab = card.querySelector(".hero-taken-label");
                if (lab) lab.textContent = "";
            });
        }

        function dfPvPStopQueueTimer() {
            if (dfQueueTimer) {
                clearInterval(dfQueueTimer);
                dfQueueTimer = null;
            }
        }

        function dfPvPStartQueueTimer() {
            dfQueueStartedAt = Date.now();
            dfPvPStopQueueTimer();
            const tick = () => {
                const el = deps.$("pvp-queue-seconds");
                if (el) el.textContent = String(Math.floor((Date.now() - dfQueueStartedAt) / 1000));
            };
            tick();
            dfQueueTimer = setInterval(tick, 250);
        }

        function dfPvPShowMatchFlash() {
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "";
            const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
            if (preset?.heroId) {
                setOnlineStatus("Match! Enviando herói e aguardando o adversário…");
            } else {
                setOnlineStatus("Match! Escolha seu herói.");
            }
        }

        function hideOnlineLobbyScreen() {
            dfPvPStopQueueTimer();
            window.__dfOnlinePickingHero = false;
            deps.setHeroSelectionMode( false);
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.classList.remove("active");
                lobby.style.display = "none";
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            deps.$("hero-select")?.classList.remove("active");
        }

        function dfEngineSnapshotFull() {
            if (!window.DfState) return null;
            return DfState.snapshot({
                state: deps.getState(),
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length ? deps.getTargetData() : null,
                pendingSummon: deps.getPendingSummon(), full: true,
            });
        }

        function dfEngineSnapshotLite() {
            if (!window.DfState) return null;
            return DfState.snapshot({
                state: deps.getState(),
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length ? deps.getTargetData() : null,
                pendingSummon: deps.getPendingSummon(), full: false,
            });
        }

        function dfOnlinePrefetchBoard() {
            if (!deps.getState()?.players) return;
            try {
                deps.getState().players.forEach((pl) => {
                    pl.hand?.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.field?.forEach((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.deck?.slice?.(0, 12)?.forEach?.((c) => window.dfPrefetchCardArt?.(c.name));
                    pl.discard?.slice(-6).forEach((c) => window.dfPrefetchCardArt?.(c.name));
                });
                // Catálogo completo só em idle (não trava o 1º turno).
                if (typeof deps.cardDefs !== "undefined") {
                    const rest = deps.cardDefs.filter((c) => !c.hidden).map((c) => c.name);
                    const sched = window.requestIdleCallback || ((fn) => setTimeout(fn, 900));
                    sched(() => {
                        rest.forEach((n) => window.dfPrefetchCardArt?.(n));
                    }, { timeout: 6000 });
                }
            } catch (e) {}
        }

        async function dfOnlineRemoteEndTurn(fromSeat) {
            if (deps.getState().winner !== null) return;
            const seat = fromSeat | 0;
            if (deps.getState().currentPlayer !== seat) return;
            deps.stopTimer();
            DfRules.applyWallBonusOnTurnEnd(deps.getState(), seat);
            let next = (seat + 1) % deps.getState().playersCount;
            if (next === 0) deps.getState().turnNumber = (deps.getState().turnNumber || 1) + 1;
            await deps.startTurn(next);
        }

        /**
         * Normaliza + replay visuals do presentationEnvelope / events (MP only).
         * Usado após SUMMON / ULTIMATE / END_TURN quando o servidor já aplicou o efeito.
         */
        function dfOnlineNormalizeVisual(vis) {
            if (!vis || typeof vis !== "object") return null;
            const kind = vis.kind || vis.visual;
            if (!kind || kind === "summon") return null;
            const out = { ...vis, kind };
            if (out.casterP == null && out.casterIdx != null) out.casterP = out.casterIdx;
            if (out.ownerP == null && out.casterIdx != null) out.ownerP = out.casterIdx;
            if (out.casterFieldIdx == null && out.fieldIdx != null) out.casterFieldIdx = out.fieldIdx;
            if (out.casterField == null && out.fieldIdx != null) out.casterField = out.fieldIdx;
            if (out.cardName == null && out.card != null) {
                out.cardName = typeof out.card === "string" ? out.card : (out.card.name || null);
            }
            if (kind === "em_chamas") out.kind = "incendiar";
            if (kind === "guardiao") out.kind = "guardian";
            return out;
        }

        async function dfOnlineReplayPresentationEnvelope(envelope, opts = {}) {
            if (!window.__DF_ONLINE) return;
            // Dedupe: mesmo seq não replaya 2× (ABILITY_TARGET actorPresent + await,
            // ou serverAi pre+present). Congela a UI e repete invocação/destruição.
            try {
                const seq = envelope?.seq != null ? (envelope.seq | 0) : 0;
                const dedupeKey = seq > 0
                    ? `pe:${seq}:${opts.authApplied ? 1 : 0}`
                    : "";
                if (dedupeKey) {
                    const now = Date.now();
                    const prev = window.__dfPeReplayAt || Object.create(null);
                    if (prev[dedupeKey] && (now - prev[dedupeKey]) < 8000) {
                        return;
                    }
                    prev[dedupeKey] = now;
                    // Limpa chaves velhas.
                    for (const k of Object.keys(prev)) {
                        if (now - prev[k] > 20000) delete prev[k];
                    }
                    window.__dfPeReplayAt = prev;
                }
            } catch (eDed) { /* */ }
            const pe = envelope?.presentationEnvelope;
            const fromPe = Array.isArray(pe?.visuals) ? pe.visuals : [];
            const fromEvents = [];
            if (!fromPe.length && Array.isArray(envelope?.events)) {
                for (const ev of envelope.events) {
                    if (!ev) continue;
                    if (ev.visual || ev.kind) fromEvents.push(ev);
                    else if (ev.type === "ROUBAR") fromEvents.push({ ...ev, kind: "roubar" });
                    else if (ev.type === "DESACELERAR") fromEvents.push({
                        ...ev,
                        kind: "desacelerar",
                        casterFieldIdx: ev.casterFieldIdx ?? ev.fieldIdx,
                    });
                    else if (ev.type === "MORDIDA_VENENOSA") fromEvents.push({
                        ...ev,
                        kind: "mordida_venenosa",
                    });
                    else if (ev.type === "PESADELO") fromEvents.push({ ...ev, kind: "pesadelo" });
                    else if (ev.type === "MALDICAO_SETE_MARES") fromEvents.push({ ...ev, kind: "maldicao_sete_mares" });
                    else if (ev.type === "FUMACA_TOXICA") fromEvents.push({ ...ev, kind: "fumaca_toxica" });
                    else if (ev.type === "NECROMANCIA") fromEvents.push({ ...ev, kind: "necromancia" });
                    else if (ev.type === "FORTALECER" || ev.type === "STRONG_ARM" || ev.type === "TALENT_FORTALECER") {
                        fromEvents.push({ ...ev, kind: "strong_arm" });
                    }
                    else if (ev.type === "IMITAR") fromEvents.push({ ...ev, kind: "imitar" });
                    else if (ev.type === "GRITO_DE_GUERRA" && Array.isArray(ev.applied)) {
                        const ownerP = ev.casterIdx ?? ev.ownerP ?? 0;
                        for (const t of ev.applied) {
                            if (t?.p == null || t?.i == null) continue;
                            fromEvents.push({
                                kind: "fury",
                                ownerP,
                                fieldIdx: t.i,
                                furyStacks: t.furyStacks,
                                fieldPatches: [{
                                    targetP: t.p,
                                    targetI: t.i,
                                    fury: true,
                                    furyStacks: t.furyStacks ?? 1,
                                }],
                            });
                        }
                    }
                    else if (ev.type === "DRAW" && ev.reason === "upkeep") {
                        // Dedicado em dfOnlinePlayUpkeepDrawFromEvents — não replayar.
                    }
                    else if (ev.type === "THUNDER_DISCARD") {
                        fromEvents.push({ ...ev, kind: "thunder_discard" });
                    }
                    else if (ev.type === "COMBAT" || ev.type === "COMBAT_RESOLVED" || ev.type === "ATTACK_RESOLVED") {
                        fromEvents.push({
                            ...ev,
                            kind: "combat",
                            attOwner: ev.attacker?.p,
                            attIdx: ev.attacker?.i,
                            defOwner: ev.defender?.p,
                            defIdx: ev.defender?.i,
                            killA: !!ev.outcome?.killA,
                            killD: !!ev.outcome?.killD,
                        });
                    }
                    else if (ev.type === "COMBAT_BLOCKED") {
                        fromEvents.push({
                            ...ev,
                            kind: "blocked_attack",
                            attOwner: ev.attacker?.p,
                            attIdx: ev.attacker?.i,
                            defOwner: ev.defender?.p,
                            defIdx: ev.defender?.i,
                        });
                    }
                    else if (ev.type === "TOKEN_INSERT" || ev.type === "DRAGON_TOKEN_SUMMON") {
                        fromEvents.push({
                            ...ev,
                            kind: "dragon_token_summon",
                            ownerP: ev.ownerP ?? ev.casterIdx,
                            fieldIdx: ev.fieldIdx ?? ev.insertIdx,
                        });
                    }
                    else if (ev.type === "DEVOUR") {
                        fromEvents.push({
                            ...ev,
                            kind: "devour",
                            targetP: ev.casterIdx,
                            targetI: ev.devouredI,
                            casterFieldIdx: ev.fieldIdx ?? ev.casterFieldIdx,
                        });
                    }
                    else if (ev.type === "DESTROY") {
                        // Devorar já tem visual próprio — DESTROY reason=devorar
                        // no índice pré-remoção remove o campeão errado pós-reconcile.
                        if (ev.reason === "devorar" || ev.reason === "devour") continue;
                        fromEvents.push({
                            ...ev,
                            kind: "destroy",
                            ownerIdx: ev.p ?? ev.targetP ?? ev.ownerIdx,
                            fieldIdx: ev.i ?? ev.targetI ?? ev.fieldIdx,
                        });
                    }
                    else if (ev.type === "POISON_KILL") {
                        fromEvents.push({
                            ...ev,
                            kind: "poison_kill",
                            ownerIdx: ev.p,
                            fieldIdx: ev.i,
                            uid: ev.uid,
                            name: ev.name,
                        });
                    }
                    else if (ev.type === "RAIO_DUPLO") {
                        fromEvents.push({
                            ...ev,
                            kind: "raio_duplo",
                            casterP: ev.casterIdx ?? ev.casterP,
                            picks: (ev.hits || []).map((h) => ({ p: h.p, i: h.i })),
                            hits: ev.hits || [],
                        });
                    }
                    else if (ev.type === "LEGADO") {
                        fromEvents.push({ ...ev, kind: "legado" });
                    }
                }
            }
            const listRaw = (fromPe.length ? fromPe : fromEvents)
                .map(dfOnlineNormalizeVisual)
                .filter(Boolean);
            
            // MP: dedup animações que podem ser processadas 2× (NECROMANCIA, MORDIDA, poison_kill)
            // quando server envia visual + cliente converte event. Usa card name + kind como chave.
            const visKindsToDedup = new Set(["necromancia", "mordida_venenosa", "poison_kill"]);
            const dedupSeenKeys = new Set();
            const listDedup = listRaw.filter((v) => {
                if (!visKindsToDedup.has(v.kind)) return true;
                const key = `${v.kind}:${v.cardName || v.card || ""}:${v.casterP ?? v.ownerP ?? ""}`;
                if (dedupSeenKeys.has(key)) return false;
                dedupSeenKeys.add(key);
                return true;
            });
            
            const list = listDedup.filter((v) => {
                if (v.kind !== "destroy") return true;
                if (v.reason === "devorar" || v.reason === "devour") return false;
                const devourSeen = listDedup.some((dv) => dv?.kind === "devour");
                if (devourSeen) return false;
                return true;
            });
            const skipKinds = opts.skipKinds instanceof Set ? opts.skipKinds : null;
            const authApplied = !!opts.authApplied;
            // Após reconcile autoritativo: Devorar já removeu a presa — não
            // reaplicar removed no índice pré-remoção (some aliado aleatório).
            const presentBudgetMs = opts.budgetMs != null
                ? (opts.budgetMs | 0)
                : (window.__dfPresentBudgetMs || 4500);
            const playOne = async (vis) => {
                if (skipKinds && skipKinds.has(vis.kind)) return;
                // Piso por tipo: cenas MULTI-ALVO gastam o orçamento por alvo. O
                // Raio Duplo, por exemplo, roda até 2,8s em cada um dos 2 alvos —
                // com o teto genérico de 4,2s o segundo raio era cortado e a
                // habilidade parecia "não ter acontecido".
                const kindFloor = DF_PRESENT_KIND_FLOOR_MS[vis.kind] || 0;
                const visBudgetMs = Math.max(presentBudgetMs, kindFloor);
                let play = vis;
                if (authApplied) {
                    play = { ...vis, _authApplied: true };
                    if (Array.isArray(play.fieldPatches) && play.fieldPatches.length) {
                        const kept = play.fieldPatches.filter((p) => !p?.removed);
                        play.fieldPatches = kept.length ? kept : null;
                    }
                }
                try {
                    await Promise.race([
                        dfOnlineReplayAnim(play),
                        new Promise((r) => setTimeout(r, Math.max(1200, visBudgetMs))),
                    ]);
                } catch (e) {
                    console.warn("[DF online] presentation visual", vis.kind, e);
                }
            };
            for (const vis of list) {
                await playOne(vis);
            }
        }

        /** Arma draw-pending ANTES de qualquer updateUI pós-END_TURN (evita flash da face). */
        function dfOnlineArmUpkeepDrawIfNeeded(events) {
            if (!window.__DF_ONLINE) return false;
            if (!Array.isArray(events) || !events.length) return false;
            const drawEv = events.find((e) => e?.type === "DRAW" && e.reason === "upkeep");
            if (!drawEv) return false;
            const pid = drawEv.playerId;
            if (pid !== 0 && pid !== 1) return false;
            window.__dfUpkeepDrawInFlight = true;
            window.__dfUpkeepDrawSeat = pid;
            window.__dfUpkeepDrawAt = Date.now();
            return true;
        }

        /**
         * Raio Duplo: captura snaps/coords ANTES do reconcile auth
         * (vítimas P1=0 já saíram do estado oficial).
         */
        function dfOnlineCaptureRaioDuploPreHits(events) {
            if (!window.__DF_ONLINE) return null;
            if (!Array.isArray(events) || !events.length) return null;
            const ev = events.find((e) => e && e.type === "RAIO_DUPLO");
            if (!ev || !Array.isArray(ev.hits) || !ev.hits.length) return null;
            return ev.hits.map((h) => {
                if (!h || h.p == null) return null;
                let liveI = h.i;
                const field = deps.getState?.()?.players?.[h.p]?.field || [];
                if (h.uid != null) {
                    const byUid = field.findIndex((c) => c && c.uid === h.uid);
                    if (byUid >= 0) liveI = byUid;
                }
                let snap = null;
                try {
                    snap = typeof deps.dfCaptureFieldCardSnap === "function"
                        ? deps.dfCaptureFieldCardSnap(h.p, liveI)
                        : null;
                } catch (eSnap) { /* */ }
                const el = deps.getChampionDom?.(h.p, liveI);
                const tr = el?.getBoundingClientRect?.();
                return {
                    p: h.p,
                    i: h.i,
                    liveI,
                    uid: h.uid || snap?.uid || null,
                    name: h.name || snap?.name || null,
                    before: h.before,
                    after: h.after,
                    cx: tr ? tr.left + tr.width / 2 : null,
                    cy: tr ? tr.top + tr.height / 2 : null,
                    snap,
                };
            }).filter(Boolean);
        }

        /**
         * Mortes por Envenenado no END_TURN — burst ANTES do reconcile
         * (cartas ainda no DOM local).
         */
        async function dfOnlinePlayPoisonKillsFromEvents(events) {
            if (!window.__DF_ONLINE) return false;
            if (!Array.isArray(events) || !events.length) return false;
            const kills = events.filter((e) => e && e.type === "POISON_KILL");
            if (!kills.length) return false;
            const victims = [];
            const preMap = new Map();
            for (const k of kills) {
                const p = k.p;
                const i = k.i;
                if (p == null || i == null) continue;
                let snap = null;
                try {
                    snap = typeof deps.dfCaptureFieldCardSnap === "function"
                        ? deps.dfCaptureFieldCardSnap(p, i)
                        : null;
                } catch (eSnap) { /* */ }
                const uid = k.uid || snap?.uid || null;
                // Reserva a cena: o presentationEnvelope do mesmo END_TURN traz
                // o visual poison_kill e repetiria a animação.
                if (!dfClaimReplayScene("poison_kill", { uid, p, i })) continue;
                victims.push({ p, i, uid, name: k.name });
                if (snap) {
                    if (uid != null) preMap.set(uid, snap);
                    preMap.set(`${p}:${i}`, snap);
                }
            }
            if (!victims.length) return false;
            try {
                if (typeof deps.playPoisonMaintenanceDeaths === "function") {
                    await deps.playPoisonMaintenanceDeaths(victims, preMap.size ? preMap : null);
                } else {
                    for (const v of victims) {
                        try {
                            const el = deps.getChampionDom?.(v.p, v.i);
                            const r = el?.getBoundingClientRect?.();
                            if (r && r.width >= 4 && window.DfPixiVfx?.playPoisonExplosionBurstScene) {
                                await window.DfPixiVfx.playPoisonExplosionBurstScene(
                                    r.left + r.width / 2,
                                    r.top + r.height / 2,
                                    { cinematic: true },
                                );
                            }
                        } catch (eBurst) { /* */ }
                        try {
                            await deps.playStandardDestroyVisual?.(v.p, v.i, { uid: v.uid });
                        } catch (eDes) { /* */ }
                    }
                }
            } catch (e) {
                console.warn("[DF online] poison kill VFX", e);
            }
            return true;
        }

        /** Força hide do último slot da mão do saque (pós-updateUI / mid-banner). */
        function dfOnlineMarkUpkeepDrawPending(pid) {
            if (!window.__DF_ONLINE) return;
            if (pid !== 0 && pid !== 1) return;
            try {
                const qIdx = typeof deps.dfQuadrantForPlayer === "function"
                    ? deps.dfQuadrantForPlayer(pid)
                    : pid;
                const q = document.getElementById(`quadrant-${qIdx}`);
                if (!q) return;
                const wraps = q.querySelectorAll(".quadrant-hand .hand-wrap");
                if (!wraps.length) return;
                const last = wraps[wraps.length - 1];
                last.classList.add("draw-pending");
                const face = last.querySelector(".hcard, .ai-back");
                if (face) face.classList.add("draw-pending");
            } catch (e) { /* */ }
        }

        /** Saque livre (upkeep) já no estado autoritativo — só anima o voo da carta. */
        async function dfOnlinePlayUpkeepDrawFromEvents(events) {
            if (!Array.isArray(events) || !events.length) return;
            const drawEv = events.find((e) => e?.type === "DRAW" && e.reason === "upkeep");
            if (!drawEv || typeof deps.drawAnimToPlayer !== "function") return;
            const pid = drawEv.playerId;
            if (pid !== 0 && pid !== 1) return;
            // Flag já pode ter sido armada antes do reconcile — reforça.
            window.__dfUpkeepDrawInFlight = true;
            window.__dfUpkeepDrawSeat = pid;
            window.__dfUpkeepDrawAt = Date.now();
            try {
                // Monta slot com draw-pending ANTES do paint (sem revelar a face).
                deps.updateUI?.(true);
                dfOnlineMarkUpkeepDrawPending(pid);
                await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                dfOnlineMarkUpkeepDrawPending(pid);
                deps.drawAnimToPlayer(pid);
                dfOnlineMarkUpkeepDrawPending(pid);
                if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
            } catch (e) {
                console.warn("[DF online] upkeep draw anim", e);
            } finally {
                window.__dfUpkeepDrawInFlight = false;
                window.__dfUpkeepDrawSeat = null;
                try {
                    document.querySelectorAll(".hand-wrap.draw-pending, .ai-back.draw-pending, .hcard.draw-pending")
                        .forEach((el) => el.classList.remove("draw-pending"));
                } catch (e2) { /* */ }
                try { deps.updateUI?.(true); } catch (e3) { /* */ }
            }
        }

        /**
         * Vitória no MP só se o servidor disser winner != null.
         * Evita tela de vitória falsa após SYNC/TALENT cosmético no peer.
         */
        function dfOnlineCheckWinFromAuthority(envelope) {
            if (!window.__DF_ONLINE) {
                deps.checkWin();
                return;
            }
            const st = deps.getState();
            const auth = envelope?.authoritativeState;
            if (auth?.players?.length) {
                if (auth.winner != null) {
                    st.winner = auth.winner;
                    deps.checkWin({ fromAuthority: true });
                } else {
                    // Só desfaz vitória se a autoridade também não tiver ninguém
                    // na pontuação alvo — envelope atrasado não apaga o resultado.
                    const wp = auth.winPoints ?? st.winPoints ?? 15;
                    const someoneAtTarget = auth.players.some((sp) => (sp?.vp | 0) >= wp);
                    if (st.winner != null && !someoneAtTarget) {
                        st.winner = null;
                        try { deps.cancelWinOverlay?.(); } catch (e) { /* */ }
                    }
                }
                return;
            }
            if (st.winner != null) deps.checkWin({ fromAuthority: true });
        }

        /**
         * END_TURN remoto: estado já veio do servidor (manutenção/saque aplicados).
         * Só orquestra UI/timer/banner via startTurn — sem reaplicar regras de manutenção.
         * @param {{ skipReconcile?: boolean }} [opts]
         */
        async function dfOnlineHandleRemoteEndTurn(envelope, opts = {}) {
            if (deps.getState().winner != null) return;
            deps.stopTimer();
            // Sincronizar CP + deadline ANTES de awaits cosméticos (evita split-brain / timer 0).
            const authCpEarly = envelope?.authoritativeState?.currentPlayer;
            if (authCpEarly === 0 || authCpEarly === 1) {
                try { deps.getState().currentPlayer = authCpEarly | 0; } catch (e) { /* */ }
            }
            if (envelope?.turnDeadline) {
                window.__dfTurnDeadline = envelope.turnDeadline | 0;
            } else if (!(window.__dfTurnDeadline > Date.now())) {
                window.__dfTurnDeadline = Date.now() + 70000;
            }
            try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            // Aguarda summon peer em voo (timeout curto) — evita stompar _summoning.
            try {
                await Promise.race([
                    _dfPeerSummonGate,
                    deps.wait?.(1200) || new Promise((r) => setTimeout(r, 1200)),
                ]);
            } catch (e) { /* */ }
            // Limpa combate/fila travada — senão o peer fica com turno certo e relógio velho.
            try { dfOnlineAbortCombatVisuals?.(); } catch (e) { /* */ }
            dfOnlineResetPresentQueue();
            try {
                const st = deps.getState();
                if (st.activeTalent) st.activeTalent = null;
                const layer = document.getElementById("talent-spotlight-layer");
                layer?.replaceChildren?.();
                layer?.classList?.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
            } catch (e) { /* */ }
            try { deps.setApplyingRemote(false); } catch (e) { /* */ }
            window.__dfTurnEndingPending = false;
            const authCp = envelope?.authoritativeState?.currentPlayer;
            if (!opts.skipReconcile) {
                const authState = envelope?.authoritativeState;
                // Veneno explode ANTES do reconcile (cartas ainda no campo).
                try { await dfOnlinePlayPoisonKillsFromEvents(envelope?.events); } catch (ePk) { /* */ }
                // Armar hide da carta de upkeep ANTES do 1º paint pós-reconcile.
                try { dfOnlineArmUpkeepDrawIfNeeded(envelope?.events); } catch (eArm) { /* */ }
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                        if (window.__dfUpkeepDrawInFlight) {
                            dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
                        }
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                } else if (envelope?.snapshot?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                        deps.updateUI(true);
                        if (window.__dfUpkeepDrawInFlight) {
                            dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
                        }
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
            }
            // Saque livre: anima DEPOIS do banner de PV e do updateUI — peer e ator.
            const nextPre = (authCp === 0 || authCp === 1)
                ? (authCp | 0)
                : deps.getState().currentPlayer;
            try {
                if (typeof deps.showPassiveVpMaintMessage === "function" && (nextPre === 0 || nextPre === 1)) {
                    const tn = deps.getState()?.turnNumber | 0;
                    if (tn > 1) await deps.showPassiveVpMaintMessage(nextPre);
                }
            } catch (e) {
                console.warn("[DF online] passive VP banner", e);
            }
            // Banner pode ter disparado updateUI — re-esconde a carta do saque.
            if (window.__dfUpkeepDrawInFlight) {
                dfOnlineMarkUpkeepDrawPending(window.__dfUpkeepDrawSeat);
            }
            let hadUpkeepDraw = false;
            try {
                hadUpkeepDraw = Array.isArray(envelope?.events)
                    && envelope.events.some((e) => e?.type === "DRAW" && e.reason === "upkeep");
                await dfOnlinePlayUpkeepDrawFromEvents(envelope?.events);
            } catch (e) {
                console.warn("[DF online] upkeep draw", e);
            }
            // Preferir CP do envelope — não reler após awaits (evita banner invertido).
            const next = (authCp === 0 || authCp === 1)
                ? (authCp | 0)
                : deps.getState().currentPlayer;
            if (next !== 0 && next !== 1) {
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (deps.getState().currentPlayer !== next) {
                try { deps.getState().currentPlayer = next; } catch (e) { /* */ }
            }
            // Crescimento / poder: força rebuild do campo + limpa drag stuck.
            try { window.__dfHandDrag = null; } catch (e) { /* */ }
            try { window.__dfResetQuadCache?.(); } catch (e) { /* */ }
            // Aplicar POWER_CHANGED dos events (auth pode ter power certo mas DOM stale).
            // MP: não replayar card_draw — já animado em dfOnlinePlayUpkeepDrawFromEvents.
            try {
                dfOnlineApplyPresentationFromEvents(envelope, {
                    authApplied: false,
                    skipVisualKinds: hadUpkeepDraw ? new Set(["card_draw"]) : null,
                });
            } catch (e) { /* */ }
            try { deps.updateUI?.(true); } catch (e) { /* */ }
            // Deadline do servidor (se veio no envelope / room).
            if (envelope?.turnDeadline) {
                window.__dfTurnDeadline = envelope.turnDeadline | 0;
            } else {
                window.__dfTurnDeadline = Date.now() + 70000;
            }
            const endSeq = envelope?.seq != null ? (envelope.seq | 0) : null;
            if (endSeq != null) window.__dfLastEndTurnStartSeq = endSeq;
            window.__dfOnlineSkipMaintRules = true;
            try {
                await deps.startTurn(next);
            } finally {
                window.__dfOnlineSkipMaintRules = false;
            }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
            dfOnlineCheckWinFromAuthority(envelope);
        }

        async function dfOnlineRollbackToServer() {
            try {
                const res = await dfNet?.getReplay?.(0);
                if (res?.ok && (res.gameState || res.snapshot)) {
                    // Silent reconcile mid-match — sem toast / sem startTurn extra.
                    await dfOnlineApplyReplaySync(res, { forceToast: false });
                    return true;
                }
                if (res?.authoritativeState?.players?.length) {
                    dfOnlineReconcileSnapshot(
                        { state: res.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                    return true;
                }
            } catch (e) {
                console.warn("[DF online] rollback", e);
            }
            return false;
        }

        function dfOnlineApplyFullSnapshot(snap) {
            if (!snap || !window.DfState) return;
            DfState.applySnapshot(deps.getState(), snap, { full: true });
            const ph = snap.phase || {};
            deps.setGamePhase( ph.gamePhase || "normal");
            deps.setTargetData( ph.targetData || {});
            deps.setPendingSummon( ph.pendingSummon || null);
        }

        function dfOnlineIsLocalPickPhase() {
            return window.__DF_ONLINE && !deps.getApplyingRemote() && deps.dfIsMyTurn()
                && DF_ONLINE_PICK_PHASES.has(deps.getGamePhase());
        }

        function dfOnlinePublishTalentStart(handIdx, extra = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) {
                return Promise.resolve({ ok: true, local: true });
            }
            _dfMpTalentCommitted = false;
            const seat = deps.dfLocalSeat();
            const card = extra.card || deps.getState().players[seat]?.hand?.[handIdx | 0];
            return dfOnlineSendActionAwait({
                type: "TALENT_START",
                handIdx: handIdx | 0,
                cardName: card?.name || null,
                uid: card?.uid || null,
                ability: extra.ability
                    || deps.getTargetData()?.ability
                    || card?.talentEffect
                    || deps.getState().activeTalent?.card?.talentEffect
                    || null,
                anim: {
                    kind: "talent_cast",
                    cardName: card?.name || null,
                    talentEffect: card?.talentEffect || null,
                    ownerP: seat,
                },
            }, { noSnap: true }).then((ack) => {
                if (ack?.authoritativeState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: ack.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                return ack;
            }).catch((e) => {
                console.warn("[DF online] TALENT_START", e);
                return { ok: false, error: e?.message || "TALENT_START_FAILED" };
            });
        }

        /**
         * Limpa activeTalent no servidor (pós-resolve). Sem reaplicar efeito.
         */
        function dfOnlinePublishTalentDiscard(ownerP, card) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) {
                return Promise.resolve({ ok: true, local: true });
            }
            _dfMpTalentCommitted = true;
            return dfOnlineSendActionAwait({
                type: "TALENT_DISCARD",
                playerId: ownerP | 0,
                cardName: card?.name || null,
                uid: card?.uid || null,
                talentEffect: card?.talentEffect || null,
            }, { noSnap: true }).then((ack) => {
                if (ack?.authoritativeState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: ack.authoritativeState, full: true },
                            { skipPhase: true, clearOrphanTalent: true },
                        );
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                return ack;
            }).catch((e) => {
                console.warn("[DF online] TALENT_DISCARD", e);
                return { ok: false, error: e?.message || "TALENT_DISCARD_FAILED" };
            });
        }

        /**
         * Commit autoritativo de status (veneno, barreira, gelo…) + VFX opcional.
         */
        async function dfOnlineCommitStatus(targetP, targetI, opts = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return { ok: true, local: true };
            const card = deps.getState().players[targetP]?.field?.[targetI];
            if (!card) return { ok: false, error: "NO_TARGET" };
            const statusPatch = dfOnlineStatusFieldPatch(targetP, targetI, card);
            if (opts.broadcast !== false) {
                dfOnlineBroadcastVisual({
                    kind: opts.kind || "status_sync",
                    ...(opts.anim || {}),
                    fieldPatches: [statusPatch],
                });
            }
            if (!dfNet?.connected) return { ok: false, error: "NOT_CONNECTED" };
            const flags = { ...statusPatch };
            delete flags.targetP;
            delete flags.targetI;
            return dfOnlineCommitMutations(
                [{ op: "setStatus", targetP, targetI, flags }],
                opts,
            );
        }

        /**
         * Um único FIELD_COMMIT com N mutations + um reconcile (evita clobber
         * entre commits sequenciais — Barreira multi-alvo, Devorar, etc.).
         */
        async function dfOnlineCommitMutations(mutations, opts = {}) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return { ok: true, local: true };
            if (!Array.isArray(mutations) || !mutations.length) return { ok: false, error: "NO_MUTATIONS" };
            if (!dfNet?.connected) return { ok: false, error: "NOT_CONNECTED" };
            const ack = await dfOnlineSendActionAwait({
                type: "FIELD_COMMIT",
                mutations,
            }, { noSnap: true });
            if (!ack || ack.ok === false) return ack || { ok: false };
            if (opts.reconcile !== false && ack.authoritativeState?.players?.length) {
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(
                        { state: ack.authoritativeState, full: true },
                        { skipPhase: true, ...(opts.reconcileOpts || {}) },
                    );
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
            }
            return ack;
        }

        function dfOnlineQueueRemoteVisual(anim) {
            if (!anim?.kind) return;
            const group = _dfPresenter
                ? _dfPresenter.groupForVisual(anim.kind, anim.parallelGroup)
                : (DF_PARALLEL_VISUAL_KINDS.has(anim.kind) ? "fx" : "board");
            const timeout = group === "fx"
                ? (_dfPresenter?.resolveFxTimeout?.(anim.kind)
                    ?? ( _dfPresenter?.LONG_FX_KINDS?.has?.(anim.kind)
                        ? (_dfPresenter?.FX_TIMEOUT_BUFF_MS || 6500)
                        : (_dfPresenter?.FX_TIMEOUT_MS || 2500)))
                : (_dfPresenter?.resolveBoardTimeout?.()
                    ?? (_dfPresenter?.BOARD_TIMEOUT_MS || 4000));
            if (_dfPresenter) {
                return _dfPresenter.enqueue(group, () => dfOnlineReplayAnim(anim), timeout, { kind: anim.kind });
            }
            _dfVisualQ = _dfVisualQ.then(async () => {
                await dfOnlineReplayAnim(anim);
            }).catch((e) => console.warn("[DF online] visual", e));
            return _dfVisualQ;
        }

        const DF_PRESENT_TIMEOUT_MS = 4000;

        function dfOnlineEnqueuePresent(fn, group = "board", meta) {
            const kind = meta && meta.kind;
            const timeout = group === "fx"
                ? (_dfPresenter?.resolveFxTimeout?.(kind)
                    ?? (_dfPresenter?.FX_TIMEOUT_MS || 2500))
                : (_dfPresenter?.resolveBoardTimeout?.()
                    ?? (_dfPresenter?.BOARD_TIMEOUT_MS || DF_PRESENT_TIMEOUT_MS));
            if (_dfPresenter) {
                return _dfPresenter.enqueue(group, fn, timeout, meta || { kind });
            }
            _dfVisualQ = _dfVisualQ
                .then(() => Promise.race([
                    Promise.resolve().then(fn),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error("PRESENT_TIMEOUT")), timeout);
                    }),
                ]))
                .catch((e) => console.warn("[DF online] present", e));
            return _dfVisualQ;
        }

        /** Destrava a fila visual (END_TURN / falha crítica). */
        let _dfPresentGen = 0;
        function dfOnlineClearSummoningFlags() {
            try {
                const players = deps.getState()?.players;
                if (!players) return;
                for (const p of players) {
                    const field = p?.field;
                    if (!Array.isArray(field)) continue;
                    for (const c of field) {
                        if (c && c._summoning) delete c._summoning;
                    }
                }
            } catch (e) { /* */ }
        }
        /**
         * Varre o DOM removendo `is-summoning` órfão (MP apenas).
         *
         * `patchFieldCardDom` mantém um slot oculto se a CLASSE existir, mesmo
         * quando o estado já limpou `_summoning`. Uma animação de invocação que
         * termine cedo (DOM ainda não montado, timeout do apresentador, exceção)
         * deixava a classe presa e o campeão invisível de forma permanente para
         * o adversário. Só limpa slots cujo estado NÃO está mais invocando, então
         * nunca revela uma animação em andamento.
         */
        function dfOnlineSweepOrphanSummoningDom() {
            if (!window.__DF_ONLINE) return;
            try {
                const players = deps.getState()?.players;
                if (!players) return;
                for (let p = 0; p < players.length; p++) {
                    const field = players[p]?.field;
                    if (!Array.isArray(field)) continue;
                    for (let i = 0; i < field.length; i++) {
                        const c = field[i];
                        if (!c || c._summoning) continue;
                        const el = typeof deps.getChampionDom === "function"
                            ? deps.getChampionDom(p, i)
                            : null;
                        if (!el) continue;
                        if (!el.classList.contains("is-summoning")
                            && el.style.visibility !== "hidden") continue;
                        el.classList.remove("is-summoning");
                        el.style.removeProperty("visibility");
                        el.style.removeProperty("opacity");
                    }
                }
            } catch (e) { /* */ }
        }

        function dfOnlineResetPresentQueue() {
            _dfPresentGen = (_dfPresentGen + 1) | 0;
            _dfVisualQ = Promise.resolve();
            try { _dfPresenter?.reset(); } catch (e) { /* */ }
            dfOnlineClearSummoningFlags();
            try { deps.updateUI?.(true); } catch (e) { /* */ }
            dfOnlineSweepOrphanSummoningDom();
        }

        /** Marca carta invocada como _summoning no estado ANTES do primeiro paint. */
        function dfOnlineMarkSummoningInState(state, fromSeat, action) {
            if (!state?.players?.[fromSeat]?.field) return null;
            const field = state.players[fromSeat].field;
            let insertIdx = action?.insertIdx;
            if (insertIdx == null || insertIdx < 0 || insertIdx >= field.length) {
                if (action?.cardName) {
                    insertIdx = field.findIndex((c) => c?.name === action.cardName && !c._summoning);
                }
                if (insertIdx == null || insertIdx < 0) insertIdx = field.length - 1;
            }
            insertIdx = Math.max(0, Math.min(insertIdx, field.length - 1));
            const card = field[insertIdx];
            if (card) card._summoning = true;
            return insertIdx;
        }

        /** Tokens de dragão (ult/habilidade): ocultar até animateDragonSummon (MP). */
        function dfOnlineMarkDragonTokensFromEvents(state, events) {
            if (!state?.players || !events?.length) return [];
            const marked = [];
            for (const e of events) {
                if (!e) continue;
                if (e.type !== "DRAGON_TOKEN_SUMMON" && e.type !== "TOKEN_INSERT"
                    && e.visual !== "dragon_token_summon") continue;
                const op = e.ownerP ?? e.casterIdx ?? e.playerId;
                if (op == null) continue;
                const field = state.players[op]?.field;
                if (!field?.length) continue;
                let idx = e.insertIdx != null ? (e.insertIdx | 0)
                    : (e.fieldIdx != null ? (e.fieldIdx | 0) : -1);
                if (e.uid) {
                    const byUid = field.findIndex((c) => c && String(c.uid) === String(e.uid));
                    if (byUid >= 0) idx = byUid;
                }
                if (idx < 0 || idx >= field.length) idx = field.length - 1;
                if (field[idx]) {
                    field[idx]._summoning = true;
                    marked.push({ ownerP: op | 0, idx });
                }
            }
            return marked;
        }

        async function dfOnlineAnimateMarkedDragonTokens(marked) {
            if (!marked?.length || typeof deps.animateDragonSummon !== "function") return;
            for (const m of marked) {
                try { await deps.animateDragonSummon(m.ownerP, m.idx); } catch (e) { /* */ }
                try {
                    const c = deps.getState()?.players?.[m.ownerP]?.field?.[m.idx];
                    if (c) delete c._summoning;
                } catch (e2) { /* */ }
            }
            try { deps.updateUI?.(true); } catch (e3) { /* */ }
            // O dragão precisa acabar VISÍVEL mesmo que o emerge tenha falhado.
            dfOnlineSweepOrphanSummoningDom();
        }
        try {
            window.dfOnlineMarkDragonTokensFromEvents = dfOnlineMarkDragonTokensFromEvents;
            window.dfOnlineAnimateMarkedDragonTokens = dfOnlineAnimateMarkedDragonTokens;
            window.dfOnlineArmUpkeepDrawIfNeeded = dfOnlineArmUpkeepDrawIfNeeded;
            window.dfOnlinePlayPoisonKillsFromEvents = dfOnlinePlayPoisonKillsFromEvents;
            window.dfOnlineMarkUpkeepDrawPending = dfOnlineMarkUpkeepDrawPending;
            window.dfOnlineCaptureRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits;
        } catch (e) { /* */ }

        /**
         * Apresentação remota serial: VFX e estado na ordem correta.
         * Gated: só peer (fromSeat !== local).
         */
        async function dfOnlinePresentRemote(envelope) {
            if (!envelope) return;
            const act = envelope.action;
            const actType = act?.type;
            const seq = envelope.seq != null ? envelope.seq : 0;

            if (actType === "PLAY_VISUAL" && act?.anim?.kind) {
                if (act.anim.fieldPatches?.length) {
                    _dfLastVisualPatchAt = Date.now();
                    _dfLastVisualSeq = Math.max(_dfLastVisualSeq, seq);
                }
                await dfOnlineReplayAnim(act.anim);
                return;
            }
            if (actType === "PRESENT" && act?.anim?.kind) {
                if (act.anim.fieldPatches?.length) {
                    _dfLastVisualPatchAt = Date.now();
                    _dfLastVisualSeq = Math.max(_dfLastVisualSeq, seq);
                }
                await dfOnlineReplayAnim(act.anim);
                return;
            }

            if (actType === "SUMMON" && act) {
                const presentGen = _dfPresentGen;
                const authState = envelope.authoritativeState;
                const snapState = envelope.snapshot?.state || envelope.snapshot;
                const stateSrc = authState?.players?.length ? authState
                    : (snapState?.players?.length ? snapState : null);
                let aborted = false;
                // Snaps de Raio Duplo enquanto as vítimas ainda estão no DOM.
                try {
                    window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                        envelope.events || [],
                    );
                } catch (eRaio) { window.__dfRaioDuploPreHits = null; }
                deps.setApplyingRemote(true);
                try {
                    if (stateSrc) {
                        const clone = JSON.parse(JSON.stringify(stateSrc));
                        dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                        // Grito de Guerra: esconder fúria até o burst (auth já veio com fury).
                        try {
                            const grito = (envelope.events || []).find((e) => e?.type === "GRITO_DE_GUERRA");
                            for (const t of grito?.applied || []) {
                                const card = clone.players?.[t.p]?.field?.[t.i];
                                if (!card) continue;
                                card.fury = false;
                                card.furyStacks = 0;
                                if (card.statuses) {
                                    try { delete card.statuses.fury; } catch (e) { /* */ }
                                }
                            }
                        } catch (e) { /* */ }
                        // Invocar Dragão: marcar Filhote _summoning até animateDragonSummon.
                        try {
                            const tokEv = (envelope.events || []).find((e) =>
                                e?.type === "TOKEN_INSERT"
                                || e?.type === "DRAGON_TOKEN_SUMMON"
                                || e?.visual === "dragon_token_summon");
                            if (tokEv) {
                                const op = tokEv.ownerP ?? tokEv.casterIdx ?? envelope.fromSeat;
                                const field = clone.players?.[op]?.field;
                                if (field?.length) {
                                    const idx = tokEv.insertIdx != null
                                        ? (tokEv.insertIdx | 0)
                                        : field.length - 1;
                                    if (field[idx]) field[idx]._summoning = true;
                                }
                            }
                        } catch (e) { /* */ }
                        dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                        // _summoning já no state — updateUI esconde a carta no slot.
                        deps.updateUI();
                    }
                } finally {
                    deps.setApplyingRemote(false);
                }
                try {
                    if (presentGen !== _dfPresentGen) {
                        aborted = true;
                        return;
                    }
                    _dfPeerSummonUntil = Date.now() + 2800;
                    _dfPeerSummonGate = (async () => {
                        await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                    })();
                    try { await _dfPeerSummonGate; } catch (e) { /* */ }
                    if (presentGen !== _dfPresentGen) {
                        aborted = true;
                        return;
                    }
                    // On-enter já resolvido no servidor — replay VFX (Roubar, Maldição, etc.).
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, {
                            skipKinds: new Set(["summon", "land_impact"]),
                            authApplied: true,
                        });
                    } catch (e) { /* */ }
                    try { window.__dfRaioDuploPreHits = null; } catch (eClr) { /* */ }
                } finally {
                    // Sempre limpa _summoning — mesmo se END_TURN abortou o presentGen.
                    dfOnlineClearSummoningFlags();
                    try {
                        document.querySelectorAll(".ccard.combat-src-hidden, .ccard.field-drag-src").forEach((el) => {
                            el.classList.remove("combat-src-hidden", "field-drag-src");
                            if (el.style.visibility === "hidden") el.style.visibility = "";
                            if (el.style.opacity === "0") el.style.opacity = "";
                        });
                    } catch (eVis) { /* */ }
                    try { deps.updateUI?.(true); } catch (e) { /* */ }
                    // Campo peer: se auth tem carta e DOM ficou vazio, força rebuild.
                    try {
                        dfOnlineEnsurePeerFieldVisible(envelope.fromSeat, authState || stateSrc);
                    } catch (eField) { /* */ }
                    if (aborted) {
                        _dfPeerSummonGate = Promise.resolve();
                        _dfPeerSummonUntil = 0;
                    }
                    // Prefetch texturas do campo (combate peer mais rápido).
                    try {
                        const players = deps.getState()?.players || [];
                        for (const pl of players) {
                            (pl?.field || []).forEach((c) => {
                                if (c?.name) window.dfPrefetchCardArt?.(c.name);
                            });
                        }
                    } catch (e4) { /* */ }
                }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "SYNC_STATE") {
                // Cosmético: nunca clobber board com authoritativeState stale.
                const skipAuth = true;
                const pe = envelope.presentationEnvelope;
                if (pe?.fieldPatches?.length) {
                    dfOnlineApplyFieldPatches(pe.fieldPatches);
                    deps.updateUI();
                }
                if (pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) await dfOnlineReplayAnim(vis);
                    }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim(act.anim);
                }
                void skipAuth;
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "FIELD_COMMIT") {
                // after_vfx: VFX → fieldPatches/auth → UI (não vazar status antes do FX).
                const authState = envelope.authoritativeState;
                const pe = envelope.presentationEnvelope;
                const defer = !!(pe?.applyPolicy === "after_vfx" || pe?.deferBoardApply);
                if (defer && pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) {
                            try {
                                await dfOnlineReplayAnim({ ...vis, fieldPatches: null, _authApplied: false });
                            } catch (e) { /* */ }
                        }
                    }
                    deps.setApplyingRemote(true);
                    try {
                        if (authState?.players?.length) {
                            dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        } else if (pe?.fieldPatches?.length) {
                            dfOnlineApplyFieldPatches(pe.fieldPatches);
                        }
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                    return;
                }
                // with_vfx / sem envelope: auth primeiro (compat).
                deps.setApplyingRemote(true);
                try {
                    if (authState?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI();
                    } else if (pe?.fieldPatches?.length) {
                        dfOnlineApplyFieldPatches(pe.fieldPatches);
                        deps.updateUI();
                    }
                } finally {
                    deps.setApplyingRemote(false);
                }
                if (pe?.visuals?.length) {
                    for (const vis of pe.visuals) {
                        if (vis?.kind) await dfOnlineReplayAnim({ ...vis, fieldPatches: null });
                    }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim({ ...act.anim, fieldPatches: null });
                }
                dfOnlineApplyPresentationFromEvents(envelope, { authApplied: !!authState?.players?.length });
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "ATTACK_RESOLVE") {
                const pe = envelope.presentationEnvelope;
                // Preferir anim da action; senão envelope do motor (COMBAT / COMBAT_BLOCKED).
                let anim = act?.anim;
                if (!anim?.kind && Array.isArray(pe?.visuals)) {
                    anim = pe.visuals.find((v) => v && (v.kind === "combat" || v.kind === "blocked_attack"))
                        || null;
                }
                const authState = envelope.authoritativeState;
                const blocked = !!(act?.blocked || envelope.blocked || anim?.kind === "blocked_attack");
                const telKey = anim?.kind === "combat"
                    ? `${anim.attOwner}:${anim.attIdx}>${anim.defOwner}:${anim.defIdx}`
                    : (act?.attOwner != null
                        ? `${act.attOwner ?? act.attackerIdx}:${act.attackerIdx}>${act.defenderPlayerId}:${act.defenderIdx}`
                        : null);
                const telegraphBusy = !!window.__dfCombatTelegraphStarted
                    && (!telKey || window.__dfCombatTelegraphKey === telKey);

                if (blocked) {
                    try { await window.__dfCombatTelegraphPromise; } catch (e) { /* */ }
                    dfOnlineAbortCombatVisuals();
                    try {
                        deps.dfCombatForceCleanup?.({
                            attOwner: anim?.attOwner ?? act?.attOwner,
                            attIdx: anim?.attIdx ?? act?.attackerIdx,
                            defOwner: anim?.defOwner ?? act?.defenderPlayerId,
                            defIdx: anim?.defIdx ?? act?.defenderIdx,
                        });
                    } catch (e) { /* */ }
                    // VFX blocked_attack antes do auth (quando ainda não veio via PRESENT).
                    try {
                        const blockVis = (anim?.kind === "blocked_attack" ? anim : null)
                            || pe?.visuals?.find((v) => v?.kind === "blocked_attack")
                            || {
                                kind: "blocked_attack",
                                defOwner: act?.defenderPlayerId,
                                defIdx: act?.defenderIdx,
                                attOwner: act?.attOwner ?? act?.attackerIdx,
                                attIdx: act?.attackerIdx,
                            };
                        await dfOnlineReplayAnim({ ...blockVis, fieldPatches: null });
                    } catch (e) { /* */ }
                    deps.setApplyingRemote(true);
                    try {
                        if (authState?.players?.length) {
                            dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        }
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    window.__dfCombatTelegraphStarted = false;
                    window.__dfCombatTelegraphPromise = null;
                    window.__dfCombatTelegraphKey = null;
                    window.__dfCombatActive = null;
                    dfOnlineFlushDeferredReconcile();
                    dfOnlineCheckWinFromAuthority(envelope);
                    return;
                }

                // Tell curto do telegraph — não pula a cinemática real.
                if (telegraphBusy && window.__dfCombatTelegraphPromise) {
                    try { await window.__dfCombatTelegraphPromise; } catch (e) { /* */ }
                }

                let combatPreSnap = null;
                if (anim?.kind === "combat" && anim.attOwner != null && anim.defOwner != null) {
                    combatPreSnap = {
                        att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx) || null,
                        def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx) || null,
                    };
                    window.__dfCombatActive = {
                        attOwner: anim.attOwner,
                        attIdx: anim.attIdx,
                        defOwner: anim.defOwner,
                        defIdx: anim.defIdx,
                        uids: dfCombatPairUids(anim),
                    };
                    if (combatPreSnap) window.__dfCombatPreSnap = combatPreSnap;
                }

                const preField = deps.captureFieldForPostDestroy?.();

                // VFX primeiro (ghosts); autoridade depois — evita sumiço mid-anim.
                if (anim?.kind === "combat") {
                    // Peer sync rápido só com backlog extremo (não cortar combate em 3G “normal”).
                    try {
                        const tel = _dfPresenter?.getTelemetry?.() || {};
                        const skew = tel.presentSkewMs || 0;
                        const wait = tel.queueWaitMs || 0;
                        const budget = window.__dfPresentBudgetMs || 4500;
                        window.__dfMpPeerCombatFast = !!(wait > 2500 && skew > budget * 1.5);
                    } catch (e) {
                        window.__dfMpPeerCombatFast = false;
                    }
                    try {
                        await dfOnlineReplayAnim({ ...anim, fieldPatches: null, _authApplied: false });
                    } finally {
                        window.__dfMpPeerCombatFast = false;
                    }
                } else {
                    dfOnlineAbortCombatVisuals();
                }

                deps.setApplyingRemote(true);
                try {
                    if (authState?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                    } else if (pe?.fieldPatches?.length) {
                        dfOnlineApplyFieldPatches(pe.fieldPatches);
                    }
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }

                const attOwner = anim?.attOwner ?? act?.attOwner ?? null;
                const attIdx = anim?.attIdx ?? act?.attackerIdx ?? null;
                const defOwner = anim?.defOwner ?? act?.defenderPlayerId ?? null;
                const defIdx = anim?.defIdx ?? act?.defenderIdx ?? null;
                const killA = !!(anim?.killA ?? act?.killA);
                const killD = !!(anim?.killD ?? act?.killD);
                if (!killA && attOwner != null && attIdx != null) {
                    dfOnlineApplyFieldPatches([{
                        targetP: attOwner,
                        targetI: attIdx,
                        tapped: true,
                        freeAttack: false,
                    }]);
                }
                try {
                    deps.dfCombatForceCleanup?.({
                        attOwner, attIdx, defOwner, defIdx, killA, killD,
                    });
                } catch (e) { /* */ }
                deps.updateUI(true);
                if (preField) {
                    try {
                        // visualOnly: onDestroy autoritativo já veio no authState;
                        // Vingança/explosões: só VFX via replayOnDestroyBurstVisual.
                        deps.replayPostDestroyAfterAuthority?.(preField, { visualOnly: true });
                    } catch (e) { /* */ }
                }
                window.__dfCombatTelegraphStarted = false;
                window.__dfCombatTelegraphPromise = null;
                window.__dfCombatTelegraphKey = null;
                window.__dfCombatActive = null;
                dfOnlineFlushDeferredReconcile();
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            if (actType === "DRAW_CARD") {
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                // Peer: updateUI já rodou — anima compra (mão/DOM prontos).
                const pid = act?.playerId ?? envelope.fromSeat;
                if ((pid === 0 || pid === 1) && typeof deps.drawAnimToPlayer === "function") {
                    try {
                        deps.updateUI?.(true);
                        // rAF: garante nós da mão no DOM antes do fly.
                        await new Promise((r) => requestAnimationFrame(() => r()));
                        deps.drawAnimToPlayer(pid);
                        if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
                    } catch (e) {
                        console.warn("[DF online] DRAW_CARD anim", e);
                    }
                } else if (act?.anim?.kind === "card_draw") {
                    await dfOnlineReplayAnim(act.anim);
                }
                return;
            }
            if (actType === "TALENT_START") {
                _dfMpTalentCommitted = false;
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                return;
            }
            if (actType === "TALENT_DISCARD") {
                _dfMpTalentCommitted = true;
                const discardOwner = act?.ownerP ?? envelope.fromSeat ?? null;
                await dfOnlineApplyAuthoritativeStateAsync(envelope);
                dfOnlinePurgeTalentSpotlight(discardOwner);
                return;
            }
            if (actType === "ABILITY_TARGET") {
                // VFX primeiro (Devorar/Incendiar/Imitar) — auth depois, senão presa some.
                const pe = envelope.presentationEnvelope;
                const hasVisuals = !!(pe?.visuals?.length || act?.anim?.kind
                    || (envelope.events || []).some((e) => e?.visual || e?.type === "DEVOUR"
                        || e?.type === "INCENDIAR" || e?.type === "IMITAR"));
                if (hasVisuals) {
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, { authApplied: false });
                    } catch (e) {
                        console.warn("[DF online] ABILITY_TARGET present", e);
                    }
                }
                const authState = envelope.authoritativeState;
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }

            // Fallback: autoridade genérica
            await dfOnlineApplyAuthoritativeStateAsync(envelope);
        }

        async function dfOnlineApplyAuthoritativeStateAsync(envelope) {
            const act = envelope.action;
            const actType = act?.type;
            const authState = envelope.authoritativeState;
            if (authState?.players?.length) {
                deps.setApplyingRemote(true);
                try {
                    if (actType === "SUMMON" && act) {
                        const clone = JSON.parse(JSON.stringify(authState));
                        dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                        dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                    } else {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                    }
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                if (Array.isArray(envelope.events) && envelope.events.length) {
                    window.__DF_MATCH_EVENT_LOG = window.__DF_MATCH_EVENT_LOG || [];
                    window.__DF_MATCH_EVENT_LOG.push({
                        seq: envelope.seq,
                        seat: envelope.fromSeat,
                        action: act,
                        events: envelope.events,
                    });
                }
                if (actType === "SUMMON" && act) {
                    try {
                        window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                            envelope.events || [],
                        );
                    } catch (eRaio2) { /* */ }
                    _dfPeerSummonUntil = Date.now() + 2800;
                    _dfPeerSummonGate = (async () => {
                        await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                    })();
                    try { await _dfPeerSummonGate; } catch (e) { /* */ }
                    try {
                        await dfOnlineReplayPresentationEnvelope(envelope, {
                            skipKinds: new Set(["summon", "land_impact"]),
                            authApplied: true,
                        });
                    } catch (e) { /* */ }
                    try { window.__dfRaioDuploPreHits = null; } catch (eClr2) { /* */ }
                } else if (act?.anim?.kind) {
                    await dfOnlineReplayAnim(act.anim);
                }
                // DRAW_CARD pago: peer anima via PLAY_VISUAL card_draw (não aqui).
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (actType === "SUMMON" && act && envelope.snapshot?.players?.length) {
                try {
                    window.__dfRaioDuploPreHits = dfOnlineCaptureRaioDuploPreHits(
                        envelope.events || [],
                    );
                } catch (eRaio3) { /* */ }
                deps.setApplyingRemote(true);
                try {
                    const raw = envelope.snapshot.state || envelope.snapshot;
                    const clone = JSON.parse(JSON.stringify(raw));
                    dfOnlineMarkSummoningInState(clone, envelope.fromSeat, act);
                    dfOnlineReconcileSnapshot({ state: clone, full: true }, { skipPhase: true });
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                _dfPeerSummonUntil = Date.now() + 2800;
                _dfPeerSummonGate = (async () => {
                    await dfOnlineReplaySummonVisual(act, envelope.fromSeat, null);
                })();
                try { await _dfPeerSummonGate; } catch (e) { /* */ }
                try {
                    await dfOnlineReplayPresentationEnvelope(envelope, {
                        skipKinds: new Set(["summon", "land_impact"]),
                        authApplied: true,
                    });
                } catch (e) { /* */ }
                try { window.__dfRaioDuploPreHits = null; } catch (eClr3) { /* */ }
                dfOnlineCheckWinFromAuthority(envelope);
                return;
            }
            if (dfOnlineShouldApplySnapshot(envelope)) {
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
            }
            if (act?.anim?.kind) await dfOnlineReplayAnim(act.anim);
            dfOnlineCheckWinFromAuthority(envelope);
        }

        function dfOnlineApplyAuthoritativeState(envelope) {
            // Sync path: enfileira apresentação (não bloqueia o caller síncrono).
            void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope));
        }

        function dfOnlineApplyAttackResolve(envelope) {
            // Prioridade: combate não fica atrás de summon/on-enter longos.
            void dfOnlinePresentRemote({
                ...envelope,
                action: { ...(envelope.action || {}), type: "ATTACK_RESOLVE" },
            }).catch((e) => console.warn("[DF online] ATTACK_RESOLVE present", e));
        }

        function dfOnlineUnwrapReplayState(replay) {
            if (!replay) return null;
            if (replay.gameState?.players?.length) return replay.gameState;
            if (replay.snapshot?.state?.players?.length) return replay.snapshot.state;
            if (replay.snapshot?.players?.length) return replay.snapshot;
            return null;
        }

        function dfOnlineUnwrapSnap(snap) {
            if (!snap) return null;
            if (snap.players?.length) return snap;
            if (snap.state?.players?.length) {
                return { ...snap.state, full: snap.full ?? true, phase: snap.phase };
            }
            return null;
        }

        function dfOnlineSyncTurnTimerFromPayload(payload) {
            if (!window.__DF_ONLINE || !payload) return;
            try {
                if (payload.serverNow != null || payload.serverTime != null) {
                    const serverNow = (payload.serverNow || payload.serverTime) | 0;
                    window.__dfServerClock = { serverNow, clientAt: Date.now() };
                    window.__dfServerNow = serverNow;
                }
                const deadline = payload.turnDeadline != null
                    ? (payload.turnDeadline | 0)
                    : (payload.state?.turnDeadline != null ? (payload.state.turnDeadline | 0) : 0);
                if (deadline > 0) window.__dfTurnDeadline = deadline;
                if (deps.getState()?.started && deps.getState()?.winner == null) {
                    deps.startTimer?.();
                }
            } catch (e) { /* */ }
        }

        function dfOnlineReconcileSnapshot(snap, opts = {}) {
            const unwrapped = dfOnlineUnwrapSnap(snap);
            if (!unwrapped?.players?.length || !window.DfState) return;
            // Durante combate no peer: não aplicar SYNC/END stale (revive).
            if (window.__dfCombatActive && opts.deferIfCombat) {
                window.__dfDeferredReconcile = { snap, opts };
                return;
            }
            // MP: defer full reconcile enquanto presenter/combate/scare estão vivos.
            if (window.__DF_ONLINE && !opts.forceAuthoritative && !opts.skipPresentBusyCheck
                && dfOnlinePresentationBusy()) {
                const prevSeq = window.__dfDeferredReconcile?.envelope?.seq
                    ?? window.__dfDeferredReconcile?.seq
                    ?? 0;
                const curSeq = opts.seq != null ? (opts.seq | 0) : (Date.now());
                if (!window.__dfDeferredReconcile || curSeq >= (prevSeq | 0)) {
                    window.__dfDeferredReconcile = { snap, opts, seq: curSeq, kind: "AUTH_BUSY" };
                }
                dfOnlineScheduleDeferredFlush();
                return;
            }
            // Pós-commit MP: não ressuscitar activeTalent órfão do servidor.
            if (window.__DF_ONLINE
                && (_dfMpTalentCommitted || opts.clearOrphanTalent)
                && !deps.getState().activeTalent
                && unwrapped.activeTalent
                && !dfOnlineIsLocalPickPhase()) {
                unwrapped.activeTalent = null;
            }
            // Mira de talento/ultimate: não restaurar se o commit já limpou activeTalent
            // (ex.: Explosão) — senão o destaque fica preso após o resolve.
            const protectLocal = !opts.forceAuthoritative
                && dfOnlineIsLocalPickPhase() && !opts.clearLocalPick;
            const saved = protectLocal ? {
                gamePhase: deps.getGamePhase(),
                targetData: deps.getTargetData() && Object.keys(deps.getTargetData()).length
                    ? JSON.parse(JSON.stringify(deps.getTargetData())) : {},
                activeTalent: deps.getState().activeTalent
                    ? { ownerP: deps.getState().activeTalent.ownerP, card: { ...deps.getState().activeTalent.card } }
                    : null,
            } : null;
            const forceCp = opts.forceCurrentPlayer;
            // MP: proteger mão local durante/logo após saque livre (evita carta sumir).
            let savedLocalHand = null;
            const localSeat = typeof deps.dfLocalSeat === "function" ? deps.dfLocalSeat() : (window.__DF_SEAT | 0);
            if (window.__DF_ONLINE && !opts.forceAuthoritative && (localSeat === 0 || localSeat === 1)) {
                const localHand = deps.getState()?.players?.[localSeat]?.hand;
                const upkeepHot = !!window.__dfUpkeepDrawInFlight
                    || (window.__dfUpkeepDrawAt && (Date.now() - window.__dfUpkeepDrawAt) < 2500
                        && window.__dfUpkeepDrawSeat === localSeat);
                if (upkeepHot && Array.isArray(localHand) && localHand.length) {
                    savedLocalHand = localHand.map((c) => (c ? { ...c } : c));
                }
            }
            DfState.applySnapshot(deps.getState(), unwrapped, { full: !!unwrapped.full || !!snap?.full });
            if (forceCp === 0 || forceCp === 1) deps.getState().currentPlayer = forceCp;
            // Recusar downgrade de mão local pós-upkeep (snapshot stale).
            if (savedLocalHand && window.__DF_ONLINE) {
                try {
                    const pl = deps.getState()?.players?.[localSeat];
                    const incoming = pl?.hand;
                    if (Array.isArray(incoming) && incoming.length < savedLocalHand.length) {
                        pl.hand = savedLocalHand;
                    }
                } catch (e) { /* */ }
            } else if (window.__DF_ONLINE && (localSeat === 0 || localSeat === 1)) {
                try {
                    const pl = deps.getState()?.players?.[localSeat];
                    const prevLen = opts._prevLocalHandLen;
                    const upkeepRecent = window.__dfUpkeepDrawAt
                        && (Date.now() - window.__dfUpkeepDrawAt) < 4000
                        && window.__dfUpkeepDrawSeat === localSeat;
                    if (upkeepRecent && prevLen != null && Array.isArray(pl?.hand)
                        && pl.hand.length < prevLen) {
                        /* leave as-is if we didn't save — best effort already applied */
                    }
                } catch (e) { /* */ }
            }
            if (opts.clearLocalPick) {
                deps.setGamePhase("normal");
                deps.setTargetData({});
                try { deps.dfPurgeTargetingVisuals?.(); } catch (e) { /* */ }
            }
            if (protectLocal && saved) {
                // Mantém mira/talento local, mas NÃO descarta o estado do tabuleiro
                // (poder, mão, turno) — senão o peer fica dessincronizado.
                // Se o auth já removeu o talento ativo, não reaplicar mira fantasma.
                if (unwrapped.activeTalent == null && saved.gamePhase
                    && (saved.gamePhase === "target-champion" || saved.gamePhase === "target-ally")) {
                    deps.setGamePhase("normal");
                    deps.setTargetData({});
                    try { deps.dfPurgeTargetingVisuals?.(); } catch (e) { /* */ }
                    return;
                }
                deps.setGamePhase(saved.gamePhase);
                deps.setTargetData(saved.targetData);
                deps.getState().activeTalent = saved.activeTalent;
                return;
            }
            const ph = snap.phase || {};
            if (!opts.skipPhase && ph.gamePhase) {
                // Peer: nunca herdar mira/target do oponente (Rei Gelado / on-enter).
                if (deps.getApplyingRemote() && DF_ONLINE_PICK_PHASES.has(ph.gamePhase)) {
                    /* ignore pick phase from remote snapshot */
                } else if (deps.getApplyingRemote() && DF_ONLINE_LOCK_PHASES.has(ph.gamePhase)) {
                    if (deps.getGamePhase() === "menu" || DF_ONLINE_LOCK_PHASES.has(deps.getGamePhase())) {
                        deps.setGamePhase( "normal");
                    }
                } else {
                    deps.setGamePhase( ph.gamePhase);
                }
            }
            if (ph.targetData !== undefined) {
                if (deps.getApplyingRemote() && DF_ONLINE_PICK_PHASES.has(ph.gamePhase || "")) {
                    /* ignore remote targeting */
                } else {
                    deps.setTargetData( ph.targetData || {});
                }
            }
            if (ph.pendingSummon !== undefined) deps.setPendingSummon( ph.pendingSummon);
            // Mira local MP: re-sync levitate após reconcile (não stopAll → cartas pequeninas).
            try {
                if (DF_ONLINE_PICK_PHASES.has(deps.getGamePhase?.() || "")) {
                    window.DfTargetLevitate?.sync?.();
                }
            } catch (e) { /* */ }
        }

        /**
         * Patch de poder (ou remoção se ≤ 0) para PLAY_VISUAL — MP-only peer sync.
         * Espelha o padrão Bola de Fogo / Explosão.
         */
        function dfOnlinePatchPower(targetP, targetI, currentPower) {
            const pow = currentPower | 0;
            if (pow <= 0) return [{ targetP, targetI, removed: true }];
            return [{ targetP, targetI, currentPower: pow }];
        }

        /**
         * Snapshot de status de um campeão para fieldPatches (coroa no peer).
         * Só inclui chaves presentes / booleanas relevantes.
         */
        function dfOnlineStatusFieldPatch(targetP, targetI, card) {
            const c = card || {};
            const patch = { targetP, targetI };
            const boolKeys = [
                "frozen", "tapped", "freeAttack", "shielded", "shieldedPermanent",
                "barrier", "barrierPermanent", "vulnerable", "silenced", "poisoned",
                "fury", "pulled", "inspiracao", "mimico", "wallBuff", "guerraBuff",
                "foreverGrowth", "fireAura", "burning", "corruptedNoHonor", "furyBonusActive",
            ];
            for (const k of boolKeys) {
                if (c[k] != null) patch[k] = !!c[k];
            }
            const numKeys = [
                "frozenTurns", "shieldedTurns", "barrierTurns", "poisonTurns",
                "furyTurns", "furyStacks", "guerraBuffTurns", "burningTurns",
                "fireAuraTurns", "currentPower", "poisonedByP",
            ];
            for (const k of numKeys) {
                if (c[k] != null) patch[k] = c[k] | 0;
            }
            return patch;
        }

        /** Aplica patches de campo vindos de PLAY_VISUAL (poder/status/remoção). */
        function dfOnlineApplyFieldPatches(patches) {
            if (!Array.isArray(patches) || !patches.length) return;
            const st = deps.getState();
            let changed = false;
            // Remoções no mesmo campo: índice alto → baixo (evita shift).
            const ordered = patches.slice().sort((a, b) => {
                const ar = !!(a && a.removed);
                const br = !!(b && b.removed);
                if (ar !== br) return ar ? 1 : -1;
                if (ar && br) {
                    if ((a.targetP | 0) !== (b.targetP | 0)) return (a.targetP | 0) - (b.targetP | 0);
                    return (b.targetI | 0) - (a.targetI | 0);
                }
                return 0;
            });
            for (const patch of ordered) {
                if (!patch || patch.targetP == null) continue;
                const field = st.players[patch.targetP]?.field;
                if (!field) continue;
                if (patch.insert && patch.card) {
                    const idx = patch.targetI != null
                        ? Math.max(0, Math.min(patch.targetI | 0, field.length))
                        : field.length;
                    const card = { ...patch.card };
                    if (!card.uid) card.uid = `tok-${Date.now()}-${idx}`;
                    if (card.currentPower == null) card.currentPower = card.power ?? 0;
                    field.splice(idx, 0, card);
                    changed = true;
                    continue;
                }
                if (patch.targetI == null) continue;
                if (patch.removed) {
                    if (field[patch.targetI]) {
                        field.splice(patch.targetI, 1);
                        changed = true;
                    }
                    continue;
                }
                const c = field[patch.targetI];
                if (!c) continue;
                if (patch.currentPower != null && c.currentPower !== patch.currentPower) {
                    c.currentPower = patch.currentPower;
                    changed = true;
                }
                const assignBool = (key) => {
                    if (patch[key] != null) { c[key] = !!patch[key]; changed = true; }
                };
                const assignNum = (key) => {
                    if (patch[key] != null) { c[key] = patch[key] | 0; changed = true; }
                };
                const assignAny = (key) => {
                    if (Object.prototype.hasOwnProperty.call(patch, key)) {
                        c[key] = patch[key];
                        changed = true;
                    }
                };
                assignBool("frozen");
                assignNum("frozenTurns");
                assignBool("tapped");
                assignBool("freeAttack");
                assignBool("shielded");
                assignBool("shieldedPermanent");
                assignNum("shieldedTurns");
                assignBool("barrier");
                assignBool("barrierPermanent");
                assignNum("barrierTurns");
                assignBool("vulnerable");
                assignBool("silenced");
                assignBool("poisoned");
                assignNum("poisonTurns");
                assignNum("poisonedByP");
                assignBool("fury");
                assignBool("furyBonusActive");
                assignNum("furyTurns");
                assignNum("furyStacks");
                assignBool("pulled");
                assignBool("inspiracao");
                assignBool("mimico");
                assignBool("wallBuff");
                assignBool("guerraBuff");
                assignNum("guerraBuffTurns");
                assignBool("foreverGrowth");
                assignBool("fireAura");
                assignNum("fireAuraTurns");
                assignBool("burning");
                assignNum("burningTurns");
                assignBool("corruptedNoHonor");
                // Transformações (ex.: Ursificação) precisam sincronizar identidade completa.
                assignAny("name");
                assignAny("power");
                assignAny("basePower");
                assignAny("abilityType");
                assignAny("abilityName");
                assignAny("abilityDesc");
                assignAny("onEnter");
                assignAny("onDestroy");
                assignAny("talentEffect");
                assignAny("summonRitual");
                assignAny("constantEffect");
                assignAny("isToken");
                assignAny("hidden");
                assignAny("mimicAbilityName");
                assignAny("mimicAbilityDesc");
                assignAny("mimicOnEnter");
                assignAny("mimicOnDestroy");
                assignAny("mimicSourceName");
                assignAny("mimicConstantEffect");
                if (patch.vpCaster != null && st.players[patch.vpCaster]) {
                    st.players[patch.vpCaster].vp = patch.vpAfter ?? st.players[patch.vpCaster].vp;
                    changed = true;
                }
            }
            if (changed) deps.updateUI();
        }

        async function dfOnlineBroadcastUltimatePlay(pIdx, hero, targetP, targetI) {
            if (!window.__DF_ONLINE || !dfNet?.connected || deps.getApplyingRemote()) return null;
            try {
                const ackRes = await dfNet.sendAction({
                    type: "ULTIMATE_PLAY",
                    playerId: pIdx,
                    heroId: hero?.id || deps.getState().players[pIdx]?.heroId,
                    ultimateType: hero?.ultimateType,
                    targetP: targetP ?? null,
                    targetI: targetI ?? null,
                });
                if (ackRes?.ok === false) {
                    const err = String(ackRes.error || "");
                    if (err === "ULTIMATE_CANCELLED" || err === "ULTIMATE_CANCEL_PENDING") {
                        deps.floatText("Ultimate cancelada!", "info center", 2200);
                    } else {
                        deps.floatText("Ultimate rejeitada pelo servidor.", "warn center", 2200);
                    }
                    return ackRes;
                }
                // Não reconcilia aqui — o ator anima primeiro (estado pré-ACK), depois aplica.
                return ackRes;
            } catch (e) {
                console.warn("[DF online] ULTIMATE_PLAY", e);
                return null;
            }
        }

        async function dfOnlineReplayUltimate(action) {
            const run = async () => {
                await deps.ensureVfxReady();
                const pIdx = action.playerId;
                const hero = deps.getHeroDef(action.heroId) || deps.getState().players[pIdx]?.heroDef;
                if (!hero || action.ultimateType == null) return;
                const tp = action.targetP;
                const ti = action.targetI;
                const ut = action.ultimateType || hero.ultimateType;
                switch (ut) {
                    case "targetEnemy":
                        if (tp != null && ti != null) await deps.ultimateCinematicFireball(pIdx, tp, ti, hero);
                        break;
                    case "targetEnemyFreeze":
                        if (tp != null && ti != null) await deps.ultimateCinematicFreeze(pIdx, tp, ti, hero);
                        break;
                    case "targetAlly":
                        if (tp != null && ti != null) await deps.ultimateCinematicFortify(pIdx, tp, ti, hero);
                        break;
                    case "targetAllyFreeAttack":
                        if (tp != null && ti != null) await deps.ultimateCinematicCharge(pIdx, tp, ti, hero);
                        break;
                    case "targetAllyShield":
                        if (tp != null && ti != null) await deps.ultimateCinematicShield(pIdx, tp, ti, hero);
                        break;
                    case "drawCard":
                        if (window.__DF_ONLINE) {
                            try {
                                await window.DfVfxEngine?.ensureCinematicReady?.({
                                    waitFull: true,
                                    maxMs: 12000,
                                });
                            } catch (e) { /* */ }
                            try {
                                await deps.ensureVfxReady?.({ waitFull: true });
                            } catch (e2) { /* */ }
                        }
                        await deps.ultimateCinematicConjure(pIdx, hero);
                        break;
                    case "trickerySwap": {
                        const swapFromEvent = (action.swapEnemyP != null && action.swapEnemyI != null)
                            ? { p: action.swapEnemyP, i: action.swapEnemyI }
                            : null;
                        const swap = swapFromEvent || deps.pickTrickerySwapTarget(pIdx);
                        if (swap && tp != null && ti != null) {
                            await deps.ultimateCinematicTrickery(pIdx, tp, ti, swap.p, swap.i, hero);
                        }
                        break;
                    }
                    case "summonDragon":
                        await deps.ultimateCinematicBloodDragon(pIdx, hero);
                        break;
                    case "hook": {
                        const hookEv = (Array.isArray(action._events) ? action._events : [])
                            .find((e) => e?.type === "HOOK_STEAL");
                        const hp = tp ?? action.fromP ?? hookEv?.fromP;
                        const hi = ti ?? action.fromI ?? hookEv?.fromI;
                        if (hp != null && hi != null) await deps.ultimateCinematicHook(pIdx, hp, hi, hero);
                        break;
                    }
                    case "potion": {
                        if (tp == null || ti == null) break;
                        const evs = Array.isArray(action._events) ? action._events : [];
                        let potionOk = true;
                        if (evs.some((e) => e?.type === "POTION_FAIL")) potionOk = false;
                        else if (evs.some((e) => e?.type === "POTION_SUCCESS")) potionOk = true;
                        else if (typeof action.potionSuccess === "boolean") potionOk = action.potionSuccess;
                        else if (typeof action.success === "boolean") potionOk = action.success;
                        await deps.ultimateCinematicPotion(pIdx, tp, ti, hero, potionOk);
                        break;
                    }
                    case "vampirism": {
                        const allies = deps.getState().players[pIdx]?.field?.map((c, i) => i).filter((i) => {
                            const c = deps.getState().players[pIdx].field[i];
                            return c && deps.allyTargetCanGainPower(c);
                        }) || [];
                        const allyI = allies[0] ?? 0;
                        if (tp != null && ti != null) await deps.ultimateCinematicVampirism(pIdx, tp, ti, allyI, hero);
                        break;
                    }
                    case "banish":
                        if (tp != null && ti != null) await deps.ultimateCinematicBanish(pIdx, tp, ti, hero);
                        break;
                    case "thunderDiscard":
                        await deps.ultimateCinematicThunder(pIdx, hero);
                        if (typeof deps.animateThunderDiscardFromHand === "function") {
                            const discards = [];
                            const evs = Array.isArray(action._events) ? action._events : [];
                            for (const ev of evs) {
                                if (ev?.type !== "THUNDER_DISCARD") continue;
                                const ep = ev.playerId;
                                const cardName = typeof ev.card === "string" ? ev.card : ev.card?.name;
                                const hand = deps.getState().players[ep]?.hand || [];
                                let idx = hand.findIndex((c) => c && c.name === cardName);
                                if (idx < 0) idx = hand.length ? hand.length - 1 : -1;
                                if (ep != null && idx >= 0) discards.push({ ep, idx });
                            }
                            if (!discards.length) {
                                for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                    if (ep === pIdx) continue;
                                    const len = deps.getState().players[ep]?.hand?.length || 0;
                                    if (len > 0) discards.push({ ep, idx: len - 1 });
                                }
                            }
                            await deps.wait?.(140);
                            discards.sort((a, b) => b.idx - a.idx);
                            for (const d of discards) {
                                try {
                                    await deps.animateThunderDiscardFromHand(d.ep, d.idx);
                                } catch (e) { /* */ }
                            }
                        }
                        break;
                    case "wallProtect":
                        await deps.ultimateCinematicWall(pIdx, hero);
                        break;
                    case "poison":
                        if (tp != null && ti != null) await deps.ultimateCinematicPoison(pIdx, tp, ti, hero);
                        break;
                    case "infinitePower": {
                        // Pré-auth: foreverGrowth ainda não está no state — mirar aliados válidos.
                        const mightTargets = [];
                        const field = deps.getState().players[pIdx]?.field || [];
                        field.forEach((c, i) => {
                            if (!c) return;
                            if (c.foreverGrowth
                                || (typeof deps.allyTargetCanGainPower === "function"
                                    ? deps.allyTargetCanGainPower(c)
                                    : true)) {
                                mightTargets.push({ targetP: pIdx, targetI: i });
                            }
                        });
                        if (!mightTargets.length) {
                            field.forEach((_, i) => mightTargets.push({ targetP: pIdx, targetI: i }));
                        }
                        await deps.ultimateCinematicMight(pIdx, mightTargets, hero);
                        break;
                    }
                    case "scareReturn":
                        if (tp != null && ti != null) await deps.ultimateCinematicScare(pIdx, tp, ti, hero);
                        break;
                    case "cometStarfall":
                        await deps.ultimateCinematicComet(pIdx, hero);
                        break;
                    case "warOverpower":
                        await deps.ultimateCinematicWar(pIdx, hero);
                        break;
                    case "fireAndIce": {
                        // Baforada/gelo POR campeão (não só o 1º). Usa events do motor.
                        const evs = Array.isArray(action._events) ? action._events : [];
                        const freezeKeys = new Set();
                        const hits = [];
                        for (const ev of evs) {
                            if (ev?.type === "FREEZE" && (ev.source === "fireAndIce" || !ev.source)) {
                                const key = `${ev.targetP}|${ev.targetI}|${ev.uid || ""}`;
                                freezeKeys.add(`${ev.targetP}|${ev.uid || ev.targetI}`);
                                hits.push({
                                    kind: "freeze",
                                    p: ev.targetP,
                                    i: ev.targetI,
                                    uid: ev.uid || null,
                                });
                            }
                        }
                        for (const ev of evs) {
                            if (ev?.type === "FIRE_AND_ICE_BURN"
                                || (ev?.type === "DESTROY" && ev?.reason === "fireAndIce")
                                || (ev?.type === "CHAMPION_DESTROYED" && ev?.reason === "fireAndIce")) {
                                hits.push({
                                    kind: "burn",
                                    p: ev.targetP ?? ev.ownerIdx ?? ev.ownerP,
                                    i: ev.targetI ?? ev.fieldIdx,
                                    uid: ev.uid || null,
                                    destroyed: !!(ev.type === "DESTROY" || ev.type === "CHAMPION_DESTROYED"
                                        || ev.destroyed),
                                });
                            }
                        }
                        // Sem events de burn: qualquer inimigo não congelado = baforada (pré-auth).
                        if (!hits.some((h) => h.kind === "burn")) {
                            for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                if (ep === pIdx) continue;
                                (deps.getState().players[ep]?.field || []).forEach((c, i) => {
                                    if (!c) return;
                                    const k = `${ep}|${c.uid || i}`;
                                    const frozenHit = hits.some((h) =>
                                        h.kind === "freeze"
                                        && (h.uid ? h.uid === c.uid : (h.p === ep && h.i === i)));
                                    if (frozenHit || freezeKeys.has(k)) return;
                                    if (c.frozen && action._preAuth) return;
                                    hits.push({ kind: "burn", p: ep, i, uid: c.uid || null });
                                });
                            }
                        }
                        // Fallback total: um efeito por inimigo (gelo) se events vazios.
                        if (!hits.length) {
                            for (let ep = 0; ep < (deps.getState().playersCount || 2); ep++) {
                                if (ep === pIdx) continue;
                                (deps.getState().players[ep]?.field || []).forEach((c, i) => {
                                    if (c) hits.push({ kind: "freeze", p: ep, i, uid: c.uid || null });
                                });
                            }
                        }
                        hits.sort((a, b) => {
                            const elA = deps.getChampionDom?.(a.p, a.i);
                            const elB = deps.getChampionDom?.(b.p, b.i);
                            const xA = elA?.getBoundingClientRect?.()?.left ?? a.p * 1000 + a.i;
                            const xB = elB?.getBoundingClientRect?.()?.left ?? b.p * 1000 + b.i;
                            return xA - xB;
                        });
                        for (const hit of hits) {
                            if (hit.p == null || hit.i == null) continue;
                            if (hit.kind === "freeze") {
                                await deps.ultimateCinematicFireAndIceFreeze(pIdx, hit.p, hit.i, hero);
                            } else {
                                await deps.ultimateCinematicFireAndIceBurn(pIdx, hit.p, hit.i, hero);
                                if (global.__dfPendingDestroyVisual) {
                                    try {
                                        await global.__dfPendingDestroyVisual;
                                    } catch (e) { /* */ }
                                    global.__dfPendingDestroyVisual = null;
                                }
                            }
                        }
                        break;
                    }
                    case "resurrect": {
                        await deps.ensureVfxReady();
                        // Paladino manda targetI null — resolve do event SUMMON / slot revivido.
                        let reviveI = ti;
                        if (reviveI == null && Array.isArray(action._events)) {
                            const summ = action._events.find((e) =>
                                e?.type === "SUMMON"
                                || e?.type === "PALADINO_ULT"
                                || e?.type === "RESURRECT"
                                || e?.visual === "resurrect");
                            if (summ?.targetI != null) reviveI = summ.targetI;
                            else if (summ?.fieldIdx != null) reviveI = summ.fieldIdx;
                            else if (summ?.i != null) reviveI = summ.i;
                        }
                        if (reviveI == null) {
                            const field = deps.getState().players[pIdx]?.field || [];
                            reviveI = field.length ? field.length - 1 : null;
                        }
                        if (reviveI == null) break;
                        if (typeof deps.animateResurrectImpact === "function") {
                            await deps.animateResurrectImpact(pIdx, reviveI, hero);
                        } else if (window.DfUltimateDirector?.play) {
                            await window.DfUltimateDirector.play("resurrect", {
                                casterP: pIdx, targetP: pIdx, targetI: reviveI, hero,
                            });
                        } else if (window.DfSpriteVfx?.playUltimate) {
                            await window.DfSpriteVfx.playUltimate("resurrect", {
                                casterP: pIdx, targetP: pIdx, targetI: reviveI,
                            });
                        }
                        break;
                    }
                    default:
                        break;
                }
            };
            // MP: mesmo warm Pixi/GSAP do path offline (2ª+ Conjuração Eurávia).
            if (typeof deps.ultVfx === "function") {
                await deps.ultVfx(run);
            } else {
                await run();
            }
        }

        function dfOnlineShouldApplySnapshot(envelope) {
            if (!envelope?.snapshot?.players?.length) return false;
            const seq = envelope.seq;
            if (seq != null && seq <= _dfLastRemoteSeq) return false;
            if (seq != null) _dfLastRemoteSeq = Math.max(_dfLastRemoteSeq, seq);
            return true;
        }

        function dfOnlineConfirmAppliedSeq(seq) {
            if (seq == null) return;
            _dfLastRemoteSeq = Math.max(_dfLastRemoteSeq | 0, seq | 0);
            try { window.__dfAppliedRemoteSeq = _dfLastRemoteSeq; } catch (e) { /* */ }
            try { dfNet?.confirmAppliedSeq?.(seq); } catch (e2) { /* */ }
        }

        /**
         * Materializa stateDiff → authoritativeState (Fase 5).
         * @returns {boolean} false se precisa resync (baseSeq desconhecido).
         */
        function dfOnlineMaterializeStateDiff(envelope) {
            if (!envelope || envelope.authoritativeState?.players?.length) return true;
            const diff = envelope.stateDiff;
            if (!diff) return true;
            if (diff.full) {
                if (diff.state?.players?.length) {
                    envelope.authoritativeState = diff.state;
                } else if (diff.full && envelope.snapshot?.state?.players?.length) {
                    envelope.authoritativeState = envelope.snapshot.state;
                }
                return true;
            }
            if (!Array.isArray(diff.patches) || !diff.patches.length) return true;
            const baseSeq = diff.baseSeq | 0;
            if (baseSeq !== (_dfLastRemoteSeq | 0)) {
                console.warn("[DF online] stateDiff baseSeq mismatch", baseSeq, _dfLastRemoteSeq);
                return false;
            }
            if (!window.DfState?.applyPatches) return false;
            const next = window.DfState.applyPatches(deps.getState(), diff.patches);
            if (!next?.players?.length) return false;
            envelope.authoritativeState = next;
            return true;
        }

        async function dfOnlineGapFillFromApplied(reason) {
            const fromSeq = _dfLastRemoteSeq | 0;
            try {
                const r = await dfNet?.getReplay?.(fromSeq);
                if (r && (r.entries?.length || r.state || r.gameState || r.authoritativeState)) {
                    // Sempre preferir snapshot final — NÃO reapresentar N entries
                    // (era a causa do “fast-forward” ao voltar à partida).
                    await dfOnlineApplyReplaySync(
                        { ...(r || {}), gapFill: true },
                        { gapFill: true, snapshotOnly: true },
                    );
                    return true;
                }
            } catch (e) {
                console.warn("[DF online] gapFill", reason, e);
            }
            try { await dfOnlineRollbackToServer(); } catch (e2) { /* */ }
            return false;
        }

        function dfOnlineEnqueueSeqCritical(fn, label) {
            const run = _dfSeqCriticalQ.then(async () => {
                try { await fn(); } catch (e) {
                    console.warn("[DF online] seqCritical", label || "", e);
                }
            });
            _dfSeqCriticalQ = run.catch(() => {});
            return run;
        }

        /**
         * Fila exclusiva da IA de desconexão. As pausas de ritmo dela não podem
         * ficar na mesma fila da apresentação do peer humano — senão a jogada
         * local espera segundos atrás do pacing da IA.
         */
        function dfOnlineEnqueueAiPresent(fn, label) {
            const run = _dfAiPresentQ.then(async () => {
                try { await fn(); } catch (e) {
                    console.warn("[DF online] aiPresent", label || "", e);
                }
            });
            _dfAiPresentQ = run.catch(() => {});
            return run;
        }

        /** Após SUMMON: se o DOM do peer divergir do auth, rebuild + gap-fill. */
        function dfOnlineEnsurePeerFieldVisible(ownerSeat, authState) {
            if (!window.__DF_ONLINE) return;
            if (ownerSeat !== 0 && ownerSeat !== 1) return;
            const authField = authState?.players?.[ownerSeat]?.field;
            if (!Array.isArray(authField)) return;
            const authN = authField.filter(Boolean).length;
            const localN = (deps.getState()?.players?.[ownerSeat]?.field || []).filter(Boolean).length;
            const qIdx = typeof deps.dfQuadrantForPlayer === "function"
                ? deps.dfQuadrantForPlayer(ownerSeat)
                : ownerSeat;
            const domN = document.querySelectorAll(
                `#quadrant-${qIdx} .quadrant-field .ccard:not(.combat-src-hidden)`,
            ).length;
            if (authN > 0 && (localN < authN || domN < authN)) {
                console.warn("[DF online] peer field gap", { ownerSeat, authN, localN, domN });
                if (authState?.players?.length) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot({ state: authState, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                }
                if (domN < authN) {
                    void dfOnlineGapFillFromApplied("peer_field_gap");
                }
            }
        }

        /** uids do par em combate — hide por índice escondia campeão vivo quando o campo reordenava. */
        function dfCombatPairUids(anim) {
            try {
                const st = deps.getState?.();
                return [
                    st?.players?.[anim.attOwner]?.field?.[anim.attIdx]?.uid,
                    st?.players?.[anim.defOwner]?.field?.[anim.defIdx]?.uid,
                ].filter((u) => u != null).map(String);
            } catch (e) { return []; }
        }

        function dfOnlineAbortCombatVisuals() {
            window.__dfCombatActive = null;
            window.__dfCombatTelegraphStarted = false;
            window.__dfCombatTelegraphPromise = null;
            document.body.classList.remove("df-combat-active");
            document.documentElement.removeAttribute("data-df-combat-pending");
            window.__dfCombatPending = null;
            deps.dfCombatMobileDim(false);
            document.querySelectorAll(
                ".battle-fly, .combat-snap-ghost, .combat-def-ghost, .combat-att-ghost, " +
                ".combat-hitstop-flash, .combat-speed-line, .combat-spark, .combat-impact-ring, " +
                ".combat-clash-shockwave, .combat-clash-text, .combat-cross-slash, .combat-dust, " +
                ".combat-flash, .combat-slash, .combat-mobile-dim, .combat-mobile-ring",
            ).forEach((n) => n.remove());
            document.querySelectorAll(".ccard").forEach((el) => {
                if (!el.classList.contains("combat-animating") && !el.classList.contains("combat-src-hidden")) return;
                deps.dfRestoreCombatFieldCard(el);
            });
            try { deps.dfCombatForceCleanup?.(); } catch (e) { /* */ }
            try { deps.ensureTurnReady?.(); } catch (e2) { /* */ }
        }

        function dfOnlinePresentationBusy() {
            if (!window.__DF_ONLINE) return false;
            if (window.__dfCombatActive || window.__dfCombatPending) return true;
            if (window.__dfScareReturnActive) return true;
            try {
                if (_dfPresenter?.isBusy?.()) return true;
            } catch (e) { /* */ }
            return false;
        }

        let _dfDeferredFlushTimer = null;
        function dfOnlineScheduleDeferredFlush() {
            if (!window.__DF_ONLINE) return;
            if (_dfDeferredFlushTimer) return;
            _dfDeferredFlushTimer = setTimeout(() => {
                _dfDeferredFlushTimer = null;
                void (async () => {
                    try {
                        if (_dfPresenter?.whenIdle) {
                            await _dfPresenter.whenIdle(14000);
                        } else {
                            await (deps.wait?.(400) || new Promise((r) => setTimeout(r, 400)));
                        }
                    } catch (e) { /* */ }
                    // Ainda busy (combate/scare): reagenda.
                    if (dfOnlinePresentationBusy() && window.__dfDeferredReconcile) {
                        dfOnlineScheduleDeferredFlush();
                        return;
                    }
                    dfOnlineFlushDeferredReconcile();
                })();
            }, 80);
        }

        /** Aplica SYNC deferido durante combate (após limpeza). */
        function dfOnlineFlushDeferredReconcile() {
            const deferred = window.__dfDeferredReconcile;
            window.__dfDeferredReconcile = null;
            if (!deferred) return;
            try {
                if (deferred.kind === "SYNC_STATE" && deferred.envelope) {
                    const deferredSeq = deferred.envelope?.seq != null ? (deferred.envelope.seq | 0) : 0;
                    // Evita revive: ignora SYNC antigo que chegou antes do ATTACK_RESOLVE.
                    if (deferredSeq && _dfLastAttackResolveSeq && deferredSeq <= _dfLastAttackResolveSeq) {
                        return;
                    }
                    const auth = deferred.envelope.authoritativeState;
                    if (auth?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot(
                                { state: auth, full: true },
                                { skipPhase: true, skipPresentBusyCheck: true, forceAuthoritative: true },
                            );
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                } else if (deferred.kind === "AUTH_BUSY" && deferred.snap) {
                    dfOnlineReconcileSnapshot(deferred.snap, {
                        ...(deferred.opts || {}),
                        skipPresentBusyCheck: true,
                        forceAuthoritative: true,
                    });
                    deps.updateUI(true);
                } else if (deferred.snap) {
                    dfOnlineReconcileSnapshot(deferred.snap, {
                        ...(deferred.opts || {}),
                        skipPresentBusyCheck: true,
                    });
                    deps.updateUI(true);
                }
            } catch (e) {
                console.warn("[DF online] flush deferred", e);
            }
        }

        /** Evita spam de “falha ao enviar” quando o socket oscila. */
        function dfOnlineThrottledFailToast(err) {
            if (!window.__DF_ONLINE) return;
            const e = String(err || "");
            const now = Date.now();
            if (dfOnlineThrottledFailToast._t && now - dfOnlineThrottledFailToast._t < 6500) return;
            dfOnlineThrottledFailToast._t = now;
            if (e === "ACK_TIMEOUT" || e === "TIMEOUT") {
                // Silencioso — combate/ACK lento ≠ queda de conexão.
                return;
            }
            if (e === "NOT_CONNECTED" || e === "NOT_ONLINE") {
                deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2400);
                return;
            }
            if (e === "SERVER_BUSY") {
                deps.floatText("Servidor ocupado — tente de novo em instantes.", "warn center", 2200);
                return;
            }
            if (e === "RATE_LIMIT" || e === "SYNC_RATE") {
                deps.floatText("Aguarde um instante — servidor ocupado.", "warn center", 1800);
                return;
            }
            deps.floatText("Falha ao enviar jogada ao servidor.", "warn center", 2200);
        }

        function dfOnlineScheduleBoardSync(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return;
            if (!dfNet?.connected) return;
            if (anim) _dfPendingBoardAnim = anim;
            clearTimeout(_dfBoardSyncTimer);
            // Cap: coalescing ≥120ms evita flood de SYNC_STATE.
            _dfBoardSyncTimer = setTimeout(() => {
                _dfBoardSyncTimer = null;
                if (!dfNet?.connected) return;
                const a = _dfPendingBoardAnim;
                _dfPendingBoardAnim = null;
                dfOnlineBroadcastAction({
                    type: "SYNC_STATE",
                    playerId: deps.dfLocalSeat(),
                    anim: a || undefined,
                });
            }, 120);
        }

        function dfOnlineSendNow(action, anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) return;
            clearTimeout(_dfBoardSyncTimer);
            _dfBoardSyncTimer = null;
            _dfPendingBoardAnim = null;
            const payload = { ...action, playerId: deps.dfLocalSeat() };
            if (anim) payload.anim = anim;
            const snap = DF_MP_NOSNAP_TYPES.has(payload.type) ? null : dfEngineSnapshotLite();
            const isSync = payload.type === "SYNC_STATE" || payload.type === "PLAY_VISUAL";
            dfNet.sendAction(payload, snap).then(async (ackRes) => {
                if (ackRes?.ok === false) {
                    if (!isSync) {
                        dfOnlineThrottledFailToast(ackRes.error || "REJECTED");
                    }
                    if (ackRes?.authoritativeState?.players?.length) {
                        if (!window.__dfSummonInFlight) {
                            dfOnlineReconcileSnapshot(
                                { state: ackRes.authoritativeState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI();
                        }
                    } else if (!isSync) {
                        await dfOnlineRollbackToServer();
                    }
                }
            }).catch(async (e) => {
                console.warn("[DF online] sendAction", e);
                if (!isSync) {
                    dfOnlineThrottledFailToast(e?.message || "SEND_FAILED");
                    if (!window.__dfSummonInFlight) await dfOnlineRollbackToServer();
                }
            });
        }

        /** Envia ação e espera ACK (invocação online). */
        async function dfOnlineSendActionAwait(action, opts = {}) {
            if (!window.__DF_ONLINE || !dfNet?.connected) {
                return { ok: false, error: "NOT_ONLINE" };
            }
            // Passar turno / desistir nunca ficam atrás de present remoto.
            // Com a IA do peer no controle, a apresentação dela nunca segura a
            // jogada local: durante o turno do humano não há ação remota a esperar.
            const aiPeerMyTurn = !!window.__dfPeerAiActive && deps.dfIsMyTurn?.() === true;
            const forceThrough = action?.type === "END_TURN" || action?.type === "SURRENDER"
                || opts.force || aiPeerMyTurn;
            // applyingRemote sticky bloqueava SUMMON/ATTACK com falso "NOT_ONLINE".
            // Espera breve; se persistir, destrava (só MP) e segue.
            if (deps.getApplyingRemote() && !forceThrough) {
                const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));
                const t0 = Date.now();
                // MP: quando IA do peer está ativa (após desconexão), reduzir timeout
                // para evitar lag nas ações do jogador. Max 350ms vs 900ms normal.
                const maxWait = (window.__dfPeerAiActive ? 350 : 900);
                while (deps.getApplyingRemote() && Date.now() - t0 < maxWait) {
                    await waitMs(40);
                }
                if (deps.getApplyingRemote()) {
                    console.warn("[DF online] applyingRemote sticky — force clear before send", action?.type);
                    try { deps.setApplyingRemote(false); } catch (eClr) { /* */ }
                }
            }
            const payload = { ...action, playerId: deps.dfLocalSeat() };
            const snap = (opts.noSnap || DF_MP_NOSNAP_TYPES.has(action?.type))
                ? null
                : (opts.full ? dfEngineSnapshotFull() : dfEngineSnapshotLite());
            try {
                let ackRes = await dfNet.sendAction(payload, snap);
                const seatLost = ackRes?.ok === false && (
                    ackRes.error === "NOT_IN_ROOM"
                    || ackRes.error === "NO_SEAT"
                    || ackRes.error === "NOT_PLAYING"
                );
                if (seatLost) {
                    const rec = await dfOnlineRecoverMatchSeat();
                    if (rec?.ok) {
                        ackRes = await dfNet.sendAction(payload, snap);
                    }
                }
                // MP: avançar seq no ACK — sem isso stateDiff do peer falha (baseSeq mismatch).
                if (ackRes?.ok && ackRes.seq != null) {
                    dfOnlineConfirmAppliedSeq(ackRes.seq);
                }
                // Fase A: ator replaya envelope quando o path local pediu (ex. on-enter server-first).
                // NÃO dispara se o caller vai awaitar o mesmo envelope (evita VFX×2 + freeze).
                if (opts.actorPresent && !opts.skipActorPresentFire
                    && ackRes?.ok && ackRes.presentationEnvelope?.visuals?.length) {
                    const seq = ackRes.seq | 0;
                    if (seq > _dfLastAckPresentSeq) {
                        _dfLastAckPresentSeq = seq;
                        try {
                            void dfOnlineReplayPresentationEnvelope(ackRes, {
                                authApplied: true,
                                skipKinds: opts.presentSkipKinds || null,
                            }).catch((e) => console.warn("[DF online] actor present", e));
                        } catch (e) { /* */ }
                    }
                }
                return ackRes || { ok: false, error: "NO_ACK" };
            } catch (e) {
                console.warn("[DF online] sendActionAwait", e);
                return { ok: false, error: e?.message || "SEND_FAILED" };
            }
        }

        function dfOnlineBroadcastPresent(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) return;
            dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => console.warn("[DF online] PRESENT", e));
        }

        function dfOnlineFlushBoardSync(anim) {
            dfOnlineSendNow({ type: "SYNC_STATE" }, anim || _dfPendingBoardAnim);
            _dfPendingBoardAnim = null;
        }

        function dfOnlineApplyIncomingSnapshot(envelope) {
            if (!dfOnlineShouldApplySnapshot(envelope)) return;
            deps.setApplyingRemote(true);
            try {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
            } finally {
                deps.setApplyingRemote(false);
            }
        }

        function dfOnlineBroadcastVisual(anim) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected || !anim?.kind) return;
            // PRESENT (Fase A) — mesmo contrato UI-only; peer não aplica snapshot.
            dfNet.sendAction({
                type: "PRESENT",
                playerId: deps.dfLocalSeat(),
                anim,
            }, null).catch((e) => {
                // Fallback legado se servidor antigo.
                dfNet.sendAction({
                    type: "PLAY_VISUAL",
                    playerId: deps.dfLocalSeat(),
                    anim,
                }, null).catch((e2) => console.warn("[DF online] PRESENT/PLAY_VISUAL", e2 || e));
            });
        }

        function dfOnlineBroadcastState() {
            if (!window.__DF_ONLINE || deps.getApplyingRemote() || !dfNet?.connected) return;
            // Após VFX com fieldPatches: não flood SYNC que clobbera o peer.
            if (Date.now() - _dfLastVisualPatchAt < 400) return;
            dfOnlineSendNow({ type: "SYNC_STATE" });
        }

        async function dfOnlineReplayAnim(anim) {
            if (!anim?.kind) return;
            // MP: a mesma cena chega por dois caminhos (PRESENT + envelope da ação,
            // ou burst dedicado + presentationEnvelope). Seqs diferentes, então o
            // dedupe por seq não pega — aqui deduplica por conteúdo.
            if (window.__DF_ONLINE && DF_REPLAY_DEDUPE_KINDS.has(anim.kind)
                && !dfClaimReplayScene(anim.kind, {
                    uid: anim.uid,
                    card: anim.cardName ?? anim.card,
                    p: anim.casterP ?? anim.casterIdx ?? anim.ownerIdx ?? anim.p,
                    i: anim.targetI ?? anim.fieldIdx ?? anim.i,
                })) {
                return;
            }
            try {
                // Combate: capturar snaps ANTES dos fieldPatches (senão o defensor some).
                let combatPreSnap = null;
                if (anim.kind === "combat" && anim.attOwner != null && anim.defOwner != null) {
                    combatPreSnap = {
                        att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx) || null,
                        def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx) || null,
                    };
                }
                // Patches de estado: adiar removals / power mutators até depois do VFX
                // (Bola/Assassinar/Fortalecer — evita alvo invisível mid-anim no peer).
                const deferPatchKinds = new Set([
                    "bola_de_fogo", "assassinar", "strong_arm", "explosao", "destroy",
                    "incendiar", "vinganca", "misseis_magicos", "scare_return",
                    "devour", "transformar_bichinho", "ursificacao",
                    "rajada_congelante", "rajada_congelante_destroy", "raio_duplo", "imitar",
                    "corrupt", "fury", "doppel_clone",
                ]);
                const deferredPatches = (anim.fieldPatches && deferPatchKinds.has(anim.kind))
                    ? anim.fieldPatches
                    : null;
                let deferredConsumed = false;
                if (anim.fieldPatches && !deferredPatches) {
                    dfOnlineApplyFieldPatches(anim.fieldPatches);
                }
                switch (anim.kind) {
                    case "scare_return": {
                        if (anim.targetP == null || anim.targetI == null) break;
                        // MP dedupe: caster já voou localmente; peer não deve repetir 2×.
                        try {
                            const sk = `scare:${anim.targetP}|${anim.targetI}|${anim.cardSnap?.uid || anim.cardName || ""}`;
                            const now = Date.now();
                            if (window.__dfScareReturnKey === sk && (now - (window.__dfScareReturnAt | 0)) < 2200) {
                                break;
                            }
                            window.__dfScareReturnKey = sk;
                            window.__dfScareReturnAt = now;
                        } catch (eDedup) { /* */ }
                        let snap = anim.cardSnap || null;
                        if (!snap && anim.cardName) {
                            snap = {
                                name: anim.cardName,
                                category: anim.category || "champion",
                                currentPower: anim.currentPower ?? anim.power ?? 0,
                                power: anim.power ?? anim.currentPower ?? 0,
                                basePower: anim.basePower ?? 0,
                                tapped: false,
                                isToken: !!anim.isToken,
                                abilityName: anim.abilityName || null,
                                abilityDesc: anim.abilityDesc || null,
                                abilityType: anim.abilityType || null,
                            };
                        }
                        // Peer: esconde DOM do campo no START (antes do burst/fly).
                        try {
                            const fieldEl = deps.getChampionDom?.(anim.targetP, anim.targetI);
                            if (fieldEl) {
                                fieldEl.classList.add("combat-src-hidden");
                                fieldEl.style.visibility = "hidden";
                                fieldEl.style.opacity = "0";
                                fieldEl.style.pointerEvents = "none";
                            }
                        } catch (e0) { /* */ }
                        await deps.playScareReturnVisual(
                            anim.targetP, anim.targetI, snap, anim.talentOwnerP,
                            {
                                hideFieldFirst: true,
                                handInsertIdx: anim.handInsertIdx != null
                                    ? (anim.handInsertIdx | 0)
                                    : undefined,
                            },
                        );
                        break;
                    }
                    case "ursificacao":
                        if (anim.allyP != null && anim.allyI != null) {
                            await deps.playUrsificacaoVisual(anim.allyP, anim.allyI);
                        }
                        break;
                    case "aceleracao":
                        if (anim.ownerP != null && anim.actionsAfter != null && deps.getState().players[anim.ownerP]) {
                            deps.getState().players[anim.ownerP].actions = anim.actionsAfter | 0;
                            deps.updateUI(true);
                        }
                        if (anim.ownerP != null && typeof deps.animateAceleracao === "function") {
                            try { await deps.animateAceleracao(anim.ownerP); } catch (e) { /* */ }
                        }
                        break;
                    case "destroy":
                        if (anim.ownerIdx != null && anim.fieldIdx != null) {
                            // Dedupe destruição (IA disconnect / present×2).
                            try {
                                const dk = `des:${anim.ownerIdx}|${anim.fieldIdx}|${anim.uid || anim.name || ""}`;
                                const now = Date.now();
                                if (window.__dfDestroyReplayKey === dk
                                    && (now - (window.__dfDestroyReplayAt | 0)) < 2200) {
                                    break;
                                }
                                window.__dfDestroyReplayKey = dk;
                                window.__dfDestroyReplayAt = now;
                            } catch (eDedDes) { /* */ }
                            let deathSnap = null;
                            let deathEl = null;
                            try {
                                deathSnap = typeof deps.dfCaptureFieldCardSnap === "function"
                                    ? deps.dfCaptureFieldCardSnap(anim.ownerIdx, anim.fieldIdx)
                                    : null;
                                deathEl = deps.getChampionDom(anim.ownerIdx, anim.fieldIdx);
                            } catch (eSnap) { /* */ }
                            if (!anim.fieldPatches) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.ownerIdx,
                                    targetI: anim.fieldIdx,
                                    removed: true,
                                }]);
                            }
                            if (deathSnap || deathEl) {
                                try {
                                    if (typeof deps.playChampionDestroyVisual === "function") {
                                        await deps.playChampionDestroyVisual(
                                            deathSnap,
                                            deathEl?.isConnected ? deathEl : null,
                                        );
                                    } else {
                                        deps.triggerChampionShatter?.(deathEl);
                                        await deps.wait(680);
                                    }
                                } catch (eDes) {
                                    deps.triggerChampionShatter?.(deathEl);
                                    await deps.wait(420);
                                }
                            } else {
                                await deps.wait(420);
                            }
                        }
                        break;
                    case "combat_telegraph": {
                        // Tell curto compartilhado — marca clock p/ ATTACK_RESOLVE alinhar.
                        if (anim.defOwner == null || anim.defIdx == null) break;
                        const telKey = `${anim.attOwner}:${anim.attIdx}>${anim.defOwner}:${anim.defIdx}`;
                        window.__dfCombatTelegraphKey = telKey;
                        window.__dfCombatTelegraphStarted = true;
                        const tellRun = (async () => {
                            const defEl = deps.getChampionDom(anim.defOwner, anim.defIdx);
                            const attEl = anim.attOwner != null && anim.attIdx != null
                                ? deps.getChampionDom(anim.attOwner, anim.attIdx)
                                : null;
                            if (defEl) defEl.classList.add("df-combat-telegraph-def");
                            if (attEl) attEl.classList.add("df-combat-telegraph-att");
                            await deps.wait(280);
                            if (defEl) defEl.classList.remove("df-combat-telegraph-def");
                            if (attEl) attEl.classList.remove("df-combat-telegraph-att");
                        })();
                        window.__dfCombatTelegraphPromise = tellRun;
                        await tellRun;
                        break;
                    }
                    case "talent_cast": {
                        const cardName = anim.cardName || "Talento";
                        const ownerP = anim.ownerP ?? 0;
                        const fakeCard = {
                            name: cardName,
                            category: "talent",
                            talentEffect: anim.talentEffect || null,
                            power: 0,
                            currentPower: 0,
                        };
                        const st = deps.getState();
                        if (!st.activeTalent) {
                            st.activeTalent = { ownerP, card: fakeCard };
                        }
                        try { _dfPresenter?.markTalentCast(ownerP); } catch (e) { /* */ }
                        dfOnlineArmTalentSpotlightWatchdog(ownerP);
                        deps.updateUI();
                        try {
                            if (anim.talentEffect === "doppelganger"
                                && typeof deps.animateDoppelgangerTalentCast === "function") {
                                try { await deps.animateDoppelgangerTalentCast(ownerP); } catch (e0) { /* */ }
                            } else if (deps.getDfAnim?.()?.preAnimBanner) {
                                await deps.getDfAnim().preAnimBanner({
                                    category: "talent",
                                    title: cardName,
                                    subtitle: "Carta de Talento",
                                    theme: deps.getDfAnim().themeForCard?.(fakeCard)
                                        || { color: "#c9a0ff", ring: "#e8d4ff", emoji: "✨" },
                                });
                            }
                            // Peer: waits curtos — não empilhar 2.5s atrás do board.
                            const peerTalent = window.__DF_ONLINE && ownerP !== deps.dfLocalSeat();
                            await deps.wait(peerTalent ? 280 : 900);
                        } catch (e) { /* */ }
                        // Auto-clear só se discard nunca chegar — NÃO limpar enquanto
                        // o ator ainda mira (hasTalentPending até talent_discard).
                        try {
                            const peerTalent = window.__DF_ONLINE && ownerP !== deps.dfLocalSeat();
                            await deps.wait(peerTalent ? 600 : 1600);
                            if (_dfPresenter?.hasTalentPending?.(ownerP)) {
                                break;
                            }
                            const st2 = deps.getState();
                            if (st2.activeTalent
                                && (st2.activeTalent.ownerP === ownerP
                                    || st2.activeTalent.card?.name === cardName)) {
                                try {
                                    if (typeof deps.flyActiveTalentToDiscard === "function") {
                                        await Promise.race([
                                            deps.flyActiveTalentToDiscard(ownerP),
                                            deps.wait(1200),
                                        ]);
                                    }
                                } catch (e2) { /* */ }
                                st2.activeTalent = null;
                                try {
                                    const layer = document.getElementById("talent-spotlight-layer");
                                    layer?.replaceChildren?.();
                                    layer?.classList?.remove(
                                        "talent-spotlight-above-hud",
                                        "talent-spotlight-touch-hud",
                                    );
                                } catch (e3) { /* */ }
                                try { _dfPresenter?.clearTalentPending(ownerP); } catch (e4) { /* */ }
                                deps.updateUI();
                            }
                        } catch (e) { /* */ }
                        break;
                    }
                    case "talent_discard": {
                        const ownerP = anim.ownerP ?? 0;
                        const st = deps.getState();
                        _dfMpTalentCommitted = true;
                        try {
                            if (st.activeTalent?.ownerP === ownerP || st.activeTalent) {
                                try {
                                    if (typeof deps.flyActiveTalentToDiscard === "function") {
                                        await Promise.race([
                                            deps.flyActiveTalentToDiscard(ownerP),
                                            deps.wait(1200),
                                        ]);
                                    }
                                } catch (e) { /* */ }
                            }
                        } catch (e) { /* */ }
                        dfOnlinePurgeTalentSpotlight(ownerP);
                        break;
                    }
                    case "dragon_token_summon": {
                        const ownerP = anim.ownerP ?? 0;
                        const field = deps.getState().players[ownerP]?.field;
                        let idx = anim.insertIdx;
                        if (anim.card && field) {
                            const already = field.findIndex((c) => c?.uid && anim.card.uid && c.uid === anim.card.uid);
                            if (already < 0) {
                                idx = idx != null
                                    ? Math.max(0, Math.min(idx | 0, field.length))
                                    : field.length;
                                const card = { ...anim.card, _summoning: true };
                                if (card.currentPower == null) card.currentPower = card.power ?? 0;
                                field.splice(idx, 0, card);
                            } else {
                                idx = already;
                                if (field[idx]) field[idx]._summoning = true;
                            }
                            deps.updateUI();
                        }
                        if (idx != null && typeof deps.animateDragonSummon === "function") {
                            try { await deps.animateDragonSummon(ownerP, idx); } catch (e) { /* */ }
                        }
                        try {
                            const c = deps.getState().players[ownerP]?.field?.[idx];
                            if (c) c._summoning = false;
                            deps.updateUI?.(true);
                        } catch (e) { /* */ }
                        break;
                    }
                    case "doppel_cast": {
                        const ownerP = anim.ownerP ?? 0;
                        const cardName = anim.cardName || "Duplicar";
                        const st = deps.getState();
                        if (!st.activeTalent) {
                            st.activeTalent = {
                                ownerP,
                                card: {
                                    name: cardName,
                                    category: "talent",
                                    talentEffect: "doppelganger",
                                    power: 0,
                                    currentPower: 0,
                                },
                            };
                            deps.updateUI();
                        }
                        if (typeof deps.animateDoppelgangerTalentCast === "function") {
                            try { await deps.animateDoppelgangerTalentCast(ownerP); } catch (e) { /* */ }
                        }
                        break;
                    }
                    case "doppel_clone": {
                        const ownerP = anim.ownerP ?? 0;
                        const field = deps.getState().players[ownerP]?.field;
                        let idx = anim.insertIdx;
                        if (anim.card && field) {
                            const already = field.findIndex((c) => c?.uid && anim.card.uid && c.uid === anim.card.uid);
                            if (already < 0) {
                                idx = idx != null
                                    ? Math.max(0, Math.min(idx | 0, field.length))
                                    : field.length;
                                const card = { ...anim.card };
                                if (card.currentPower == null) card.currentPower = card.power ?? 0;
                                field.splice(idx, 0, card);
                            } else {
                                idx = already;
                            }
                            deps.updateUI();
                        }
                        const srcI = anim.sourceI;
                        if (idx != null && srcI != null && typeof deps.animateDoppelgangerClone === "function") {
                            try { await deps.animateDoppelgangerClone(ownerP, srcI, idx); } catch (e) { /* */ }
                        }
                        break;
                    }
                    case "ritual_spotlight": {
                        const ownerP = anim.ownerP ?? 0;
                        const card = anim.card || {
                            name: anim.cardName || "Ritual",
                            category: "champion",
                            summonRitual: anim.summonRitual ?? null,
                            power: anim.power ?? 0,
                            currentPower: anim.power ?? 0,
                        };
                        deps.getState().activeTalent = {
                            ownerP,
                            card,
                            tag: "RITUAL",
                            noDiscard: true,
                        };
                        deps.updateUI();
                        break;
                    }
                    case "ritual_spotlight_clear": {
                        const st = deps.getState();
                        if (st.activeTalent?.tag === "RITUAL"
                            || (anim.ownerP != null && st.activeTalent?.ownerP === anim.ownerP)) {
                            st.activeTalent = null;
                            try {
                                const layer = document.getElementById("talent-spotlight-layer");
                                layer?.replaceChildren?.();
                                layer?.classList?.remove(
                                    "talent-spotlight-above-hud",
                                    "talent-spotlight-touch-hud",
                                );
                            } catch (e) { /* */ }
                            deps.updateUI();
                        }
                        break;
                    }
                    case "devour":
                        if (anim.targetP != null && anim.targetI != null) {
                            // Animar com presa ainda no DOM; patches removed só depois.
                            // Nunca ocultar outros slots do mesmo campo (só a presa).
                            // Se auth já aplicou o splice, NÃO reaplicar removed (índice stale).
                            const authDone = !!anim._authApplied;
                            try {
                                const preyEl = deps.getChampionDom?.(anim.targetP, anim.targetI);
                                if (preyEl) preyEl.dataset.dfDevourPrey = "1";
                            } catch (eMark) { /* */ }
                            await deps.animateDevour(anim.targetP, anim.targetI);
                            if (!authDone) {
                                if (deferredPatches?.length) {
                                    dfOnlineApplyFieldPatches(deferredPatches);
                                    deferredConsumed = true;
                                } else if (anim.fieldPatches?.length) {
                                    dfOnlineApplyFieldPatches(anim.fieldPatches);
                                }
                            } else if (deferredPatches?.length) {
                                // Só power/status — sem removed.
                                const safe = deferredPatches.filter((p) => !p?.removed);
                                if (safe.length) dfOnlineApplyFieldPatches(safe);
                                deferredConsumed = true;
                            }
                            try {
                                // Restaurar qualquer campeão do campo que não seja a presa.
                                const field = deps.getState?.()?.players?.[anim.targetP]?.field || [];
                                for (let i = 0; i < field.length; i++) {
                                    const el = deps.getChampionDom?.(anim.targetP, i);
                                    if (!el || el.dataset?.dfDevourPrey === "1") continue;
                                    el.classList.remove("combat-animating", "combat-src-hidden");
                                    el.style.removeProperty("visibility");
                                    el.style.removeProperty("opacity");
                                    el.style.removeProperty("pointer-events");
                                }
                            } catch (eRest) { /* */ }
                            try { deps.updateUI?.(true); } catch (e) { /* */ }
                        }
                        break;
                    case "poison_kill": {
                        // Morte por Envenenado na manutenção — burst + shatter.
                        // Preferir snap pré-reconcile (anim.cardSnap / preDom).
                        const pkP = anim.ownerIdx ?? anim.p ?? anim.targetP;
                        const pkI = anim.fieldIdx ?? anim.i ?? anim.targetI;
                        if (pkP != null && pkI != null
                            && typeof deps.playPoisonMaintenanceDeaths === "function") {
                            const victims = [{
                                p: pkP,
                                i: pkI,
                                uid: anim.uid,
                                name: anim.name,
                            }];
                            let preMap = null;
                            if (anim.cardSnap) {
                                preMap = new Map();
                                if (anim.uid != null) preMap.set(anim.uid, anim.cardSnap);
                                preMap.set(`${pkP}:${pkI}`, anim.cardSnap);
                            }
                            await deps.playPoisonMaintenanceDeaths(victims, preMap);
                        } else if (pkP != null && pkI != null) {
                            try {
                                const el = deps.getChampionDom?.(pkP, pkI);
                                const r = el?.getBoundingClientRect?.();
                                if (r && r.width >= 4
                                    && window.DfPixiVfx?.playPoisonExplosionBurstScene) {
                                    await window.DfPixiVfx.playPoisonExplosionBurstScene(
                                        r.left + r.width / 2,
                                        r.top + r.height / 2,
                                        { cinematic: true },
                                    );
                                }
                            } catch (ePk) { /* */ }
                            try {
                                await deps.playStandardDestroyVisual?.(pkP, pkI, {
                                    uid: anim.uid,
                                });
                            } catch (eDes) { /* */ }
                        }
                        break;
                    }
                    case "assassinar":
                        if (anim.casterP != null && anim.targetP != null) {
                            await deps.playAssassinarVisual(
                                anim.casterP,
                                anim.casterField,
                                anim.targetP,
                                anim.targetI,
                            );
                            if (!deferredPatches && !anim.fieldPatches && anim.targetI != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    removed: true,
                                }]);
                            }
                        }
                        break;
                    case "imitar":
                        if (anim.allyP != null && anim.casterP != null) {
                            await deps.animateImitar(
                                anim.allyP,
                                anim.allyI,
                                anim.casterP,
                                anim.casterFieldIdx,
                            );
                            // Ícone/nome imitado na hora (não esperar sync tardio).
                            if (deferredPatches?.length) {
                                dfOnlineApplyFieldPatches(deferredPatches);
                                deferredConsumed = true;
                            } else if (anim.fieldPatches?.length) {
                                dfOnlineApplyFieldPatches(anim.fieldPatches);
                            } else if (anim.casterP != null && anim.casterFieldIdx != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.casterP,
                                    targetI: anim.casterFieldIdx,
                                    mimico: true,
                                    mimicAbilityName: anim.mimicAbilityName || "Habilidade",
                                    mimicSourceName: anim.mimicSourceName || "",
                                    abilityName: anim.mimicAbilityName || null,
                                }]);
                            }
                            try { deps.updateUI?.(true); } catch (e) { /* */ }
                            const mim = anim.mimicAbilityName || "Habilidade";
                            const src = anim.mimicSourceName || "";
                            deps.floatText(
                                src ? `🎭 Imitou ${mim} (${src})` : `🎭 Imitou ${mim}`,
                                "info center",
                                2200,
                            );
                        }
                        break;
                    case "rajada_congelante":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateIce(anim.targetP, anim.targetI);
                        }
                        break;
                    case "corrupt":
                        if (anim.targetP != null && anim.targetI != null) {
                            const el = deps.getChampionDom(anim.targetP, anim.targetI);
                            if (el && window.DfVfxEngine?.wantsGpuPresentation?.()
                                && typeof window.DfPixiVfx?.playCorruptScene === "function") {
                                const r = el.getBoundingClientRect();
                                try {
                                    await window.DfPixiVfx.playCorruptScene(
                                        r.left + r.width / 2,
                                        r.top + r.height / 2,
                                        { cinematic: true },
                                    );
                                } catch (e) { /* */ }
                            }
                            deps.updateUI(true);
                        }
                        break;
                    case "rajada_congelante_destroy":
                        if (anim.targetP != null && anim.targetI != null) {
                            if (typeof deps.playFreezeShatterDestroyVisual === "function") {
                                await deps.playFreezeShatterDestroyVisual(anim.targetP, anim.targetI, {});
                            } else {
                                const el = deps.getChampionDom(anim.targetP, anim.targetI);
                                deps.triggerChampionShatter(el);
                                await deps.wait(420);
                            }
                        }
                        break;
                    case "bola_de_fogo":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playBolaDeFogoVisual(
                                anim.casterP ?? 0,
                                anim.casterField ?? -1,
                                anim.targetP,
                                anim.targetI,
                                !!anim.fromTalent,
                                anim.originOverride || null,
                            );
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    currentPower: anim.powerAfter,
                                }]);
                            }
                        }
                        break;
                    case "explosao":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playExplosaoVisual(anim.casterP ?? 0, anim.targetP, anim.targetI);
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    currentPower: anim.powerAfter,
                                }]);
                            }
                        }
                        break;
                    case "zero_absoluto":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.playZeroAbsolutoVisual(
                                anim.casterP ?? 0,
                                anim.targetP,
                                anim.targetI,
                                { wasFrozen: !!anim.wasFrozen },
                            );
                        }
                        break;
                    case "blocked_attack":
                        dfOnlineAbortCombatVisuals();
                        try {
                            deps.dfCombatForceCleanup?.({
                                defOwner: anim.defOwner,
                                defIdx: anim.defIdx,
                            });
                        } catch (e) { /* */ }
                        if (anim.defOwner != null) {
                            const def = anim.defIdx != null
                                ? deps.getState().players[anim.defOwner]?.field[anim.defIdx]
                                : null;
                            if (def || anim.defIdx != null) {
                                await deps.animateBlockedAttack(
                                    anim.defOwner,
                                    def || { name: "Campeão" },
                                );
                            }
                            await dfOnlineRevealReactiveCard(
                                anim.defOwner,
                                anim.cardName || "BLOQUEAR ATAQUE",
                                anim.talentEffect || "bloquearAtaque",
                            );
                        }
                        deps.updateUI(true);
                        break;
                    case "divine_protection":
                        if (anim.defOwner != null) {
                            const field = deps.getState().players[anim.defOwner]?.field || [];
                            let def = null;
                            if (anim.defenderUid != null) {
                                def = field.find((c) => c && c.uid === anim.defenderUid) || null;
                            }
                            if (!def && anim.defenderName) {
                                def = field.find((c) => c && c.name === anim.defenderName) || null;
                            }
                            if (!def) def = field[0] || { name: anim.defenderName || "Campeão" };
                            if (typeof deps.animateDivineProtection === "function") {
                                try { await deps.animateDivineProtection(anim.defOwner, def); } catch (e) { /* */ }
                            }
                        }
                        break;
                    case "cancel_ultimate":
                        if (typeof deps.animateCancelUltimate === "function") {
                            try {
                                await deps.animateCancelUltimate(
                                    anim.casterP ?? 0,
                                    { ultimateName: anim.ultimateName || "Ultimate" },
                                );
                            } catch (e) { /* */ }
                        }
                        break;
                    case "misseis_magicos":
                        if (!anim.skipVisual) {
                            if (typeof deps.playMisseisMagicosPeerVisual === "function") {
                                try {
                                    await deps.playMisseisMagicosPeerVisual(anim.ownerP ?? 0, anim.strikes || null);
                                } catch (e) { /* */ }
                            } else if (typeof deps.runMisseisMagicosTalent === "function" && anim.cosmetic) {
                                try { await deps.runMisseisMagicosTalent(anim.ownerP ?? 0); } catch (e) { /* */ }
                            }
                        }
                        deps.updateUI(true);
                        break;
                    case "strong_arm":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateStrongArm(anim.targetP, anim.targetI, {
                                casterP: anim.casterP,
                                casterField: anim.casterField ?? anim.casterFieldIdx,
                                forceDomFallback: true,
                                fromTalent: !!anim.fromTalent,
                            });
                            if (!deferredPatches && !anim.fieldPatches && anim.powerAfter != null) {
                                dfOnlineApplyFieldPatches(dfOnlinePatchPower(
                                    anim.targetP, anim.targetI, anim.powerAfter,
                                ));
                            }
                        }
                        break;
                    case "explosao_venenosa_burst": {
                        const applied = anim.applied || [];
                        if (applied.length && typeof deps.animateExplosaoVenenosaTargets === "function") {
                            try {
                                await deps.animateExplosaoVenenosaTargets(applied);
                            } catch (e) { /* */ }
                        }
                        deps.updateUI(true);
                        break;
                    }
                    case "combat": {
                        if (anim.attOwner == null || anim.defOwner == null) break;
                        const combatSnap = combatPreSnap?.att && combatPreSnap?.def
                            ? combatPreSnap
                            : {
                                att: deps.dfCaptureFieldCardSnap?.(anim.attOwner, anim.attIdx),
                                def: deps.dfCaptureFieldCardSnap?.(anim.defOwner, anim.defIdx),
                            };
                        const out = {
                            killA: !!anim.killA,
                            killD: !!anim.killD,
                            swords: anim.killD ? ["d"] : anim.killA ? ["a"] : [],
                            over: false,
                            pvTo: null,
                        };
                        document.body.classList.add("df-combat-active");
                        window.__dfCombatActive = { attOwner: anim.attOwner, attIdx: anim.attIdx, defOwner: anim.defOwner, defIdx: anim.defIdx, uids: dfCombatPairUids(anim) };
                        let combatPromise = null;
                        try {
                            combatPromise = deps.dfInstallPhase3().runCombat(() =>
                                deps.animateCombat(anim.attOwner, anim.attIdx, anim.defOwner, anim.defIdx, out, combatSnap)
                            );
                            // Peer lento extremo: orçamento curto, sem cortar combate a 900ms.
                            if (window.__dfMpPeerCombatFast) {
                                await Promise.race([
                                    combatPromise,
                                    deps.wait?.(1800) || new Promise((r) => setTimeout(r, 1800)),
                                ]);
                            } else {
                                await combatPromise;
                            }
                        } finally {
                            // Com o orçamento curto do peer a animação pode seguir
                            // viva após o await. Liberar os flags aqui deixava o
                            // updateUI reconstruir o campo no meio da cinemática —
                            // as cartas sumiam. Só solta quando ela termina.
                            const releaseCombatFlags = () => {
                                window.__dfCombatActive = null;
                                document.body.classList.remove("df-combat-active");
                            };
                            if (combatPromise && typeof combatPromise.then === "function") {
                                let released = false;
                                const releaseOnce = () => {
                                    if (released) return;
                                    released = true;
                                    releaseCombatFlags();
                                };
                                combatPromise.then(releaseOnce, releaseOnce);
                                setTimeout(releaseOnce, 15000);
                            } else {
                                releaseCombatFlags();
                            }
                        }
                        break;
                    }
                    case "fumaca_toxica":
                        if ((anim.casterP != null || anim.casterIdx != null) && anim.picks?.length) {
                            await deps.playFumacaToxicaVisual(
                                anim.casterP ?? anim.casterIdx,
                                anim.casterFieldIdx ?? anim.fieldIdx ?? 0,
                                anim.picks,
                            );
                        }
                        break;
                    case "raio_duplo":
                        {
                            const picks = anim.picks?.length
                                ? anim.picks
                                : (anim.hits || []).map((h) => ({ p: h.p, i: h.i }));
                            const preHits = Array.isArray(window.__dfRaioDuploPreHits)
                                ? window.__dfRaioDuploPreHits
                                : (Array.isArray(anim.hits) ? anim.hits : []);
                            if ((anim.casterP != null || anim.casterIdx != null) && picks?.length) {
                                const cp = anim.casterP ?? anim.casterIdx;
                                for (const { p, i } of picks) {
                                    const pre = preHits.find((h) => h
                                        && ((h.uid != null && deps.getState?.()?.players?.[p]?.field?.[i]?.uid === h.uid)
                                            || (h.p === p && (h.i === i || h.liveI === i))))
                                        || preHits.find((h) => h && h.p === p)
                                        || null;
                                    const cx = pre?.cx ?? null;
                                    const cy = pre?.cy ?? null;
                                    try {
                                        await deps.animateRaioDuploStrike(cp, p, i, { cx, cy });
                                    } catch (eStrike) {
                                        console.warn("[DF online] raio_duplo strike", eStrike);
                                    }
                                    const after = pre?.after;
                                    const killed = after != null
                                        ? ((after | 0) <= 0)
                                        : !!(anim.fieldPatches || []).some((fp) =>
                                            fp && fp.targetP === p && fp.removed
                                            && (fp.targetI === i || fp.targetI === pre?.i));
                                    if (killed && pre?.snap && typeof deps.playChampionDestroyVisual === "function") {
                                        try {
                                            await deps.playChampionDestroyVisual(pre.snap, null);
                                        } catch (eKill) { /* */ }
                                    } else if (killed && typeof deps.playStandardDestroyVisual === "function") {
                                        try {
                                            await deps.playStandardDestroyVisual(p, i, { uid: pre?.uid });
                                        } catch (eKill2) { /* */ }
                                    }
                                }
                            }
                            try { window.__dfRaioDuploPreHits = null; } catch (eClr) { /* */ }
                        }
                        break;
                    case "wings":
                        if (anim.casterIdx != null) await deps.animateWings(anim.casterIdx);
                        break;
                    case "card_draw": {
                        const pid = anim.playerId;
                        // Dedup MP: saque livre já voou via dfOnlinePlayUpkeepDrawFromEvents.
                        if (window.__DF_ONLINE
                            && (pid === 0 || pid === 1)
                            && window.__dfUpkeepDrawSeat === pid
                            && window.__dfUpkeepDrawAt
                            && (Date.now() - window.__dfUpkeepDrawAt) < 3000) {
                            break;
                        }
                        if ((pid === 0 || pid === 1) && typeof deps.drawAnimToPlayer === "function") {
                            deps.drawAnimToPlayer(pid);
                            if (typeof deps.waitDrawAnim === "function") await deps.waitDrawAnim();
                        }
                        break;
                    }
                    case "pesadelo":
                        if (anim.targetIdx != null) {
                            await deps.playPesadeloSmokeVisual(anim.targetIdx, anim.casterIdx);
                            deps.dfSyncPesadeloShrouds();
                        }
                        break;
                    case "roubar":
                        if (anim.casterIdx != null && anim.targetIdx != null) {
                            try { deps.updateUI?.({ immediate: true }); } catch (e) { /* */ }
                            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                            const steal = anim.cardSnap || anim.card;
                            await deps.animateRoubar(anim.casterIdx, anim.targetIdx, steal, {
                                originRect: anim.originRect || null,
                            });
                        }
                        break;
                    case "desacelerar":
                        if (anim.targetIdx != null) {
                            await deps.animateDesacelerar(
                                anim.casterIdx ?? 0,
                                anim.casterFieldIdx ?? anim.fieldIdx ?? -1,
                                anim.targetIdx,
                            );
                        }
                        break;
                    case "mordida_venenosa":
                    case "poison":
                        if (anim.targetP != null && anim.targetI != null
                            && typeof deps.animateMordidaVenenosa === "function") {
                            await deps.animateMordidaVenenosa(anim.targetP, anim.targetI);
                        }
                        break;
                    case "barrier_grant":
                        if (anim.ownerP != null && anim.indices?.length) {
                            await deps.animateBarrierGrant(anim.ownerP, anim.indices);
                        }
                        break;
                    // Barreira bloqueou uma redução de Poder. Sem este case o
                    // adversário só via o Poder "não cair", sem entender por quê.
                    case "barrier_block": {
                        const bp = anim.targetP ?? anim.ownerP;
                        const bi = anim.targetI ?? anim.fieldIdx;
                        if (bp != null && bi != null
                            && typeof deps.animateBarrierBlock === "function") {
                            await deps.animateBarrierBlock(bp, bi);
                        }
                        break;
                    }
                    // Proteção concedida (Defensor / Guardião). Reaproveita o
                    // visual de Barreira, que é o mesmo brilho de escudo.
                    case "shield": {
                        const sp = anim.ownerP ?? anim.casterP ?? anim.casterIdx;
                        const idxs = anim.indices?.length
                            ? anim.indices
                            : (anim.fieldIdx != null ? [anim.fieldIdx]
                                : (anim.targetI != null ? [anim.targetI] : null));
                        if (sp != null && idxs?.length
                            && typeof deps.animateBarrierGrant === "function") {
                            await deps.animateBarrierGrant(sp, idxs);
                        }
                        break;
                    }
                    // Só status mudou (Congelado, Envenenado, Vulnerável…). Os
                    // fieldPatches já foram aplicados acima; aqui garantimos que
                    // o tabuleiro repinte os ícones em vez de cair no default
                    // silencioso, que deixava o adversário sem feedback algum.
                    case "status_sync":
                        try { deps.updateUI?.(); } catch (eSs) { /* */ }
                        break;
                    case "fire_aura":
                        if (anim.ownerP != null && anim.indices?.length) {
                            await deps.animateAuraDeFogoGrant(anim.ownerP, anim.indices);
                        }
                        break;
                    case "baforada_venenosa":
                        if (anim.ownerP != null && anim.targetP != null && anim.targetI != null) {
                            await deps.animateBaforadaVenenosa(anim.ownerP, [{ p: anim.targetP, i: anim.targetI }]);
                        }
                        break;
                    case "maldicao_sete_mares":
                        if (anim.casterIdx != null) {
                            // Peer: aplica Silêncio na mão se o auth ainda não pintou.
                            try {
                                const st = deps.getState();
                                const cIdx = anim.casterIdx;
                                for (let p = 0; p < (st.playersCount || st.players?.length || 0); p++) {
                                    if (p === cIdx) continue;
                                    const opp = st.players[p];
                                    if (!opp) continue;
                                    opp.maldicaoForgetNext = true;
                                    (opp.hand || []).forEach((card) => {
                                        if (card?.category === "champion") card.silencedInHand = true;
                                    });
                                }
                                deps.updateUI?.(true);
                            } catch (eM) { /* */ }
                            await deps.animateMaldicaoSeteMares(anim.casterIdx);
                        }
                        break;
                    case "guardian":
                        if (anim.casterP != null && anim.picks?.length) {
                            await deps.animateGuardiao(anim.casterP, anim.picks);
                        }
                        break;
                    case "fury":
                        if (anim.ownerP != null && anim.fieldIdx != null) {
                            const el = deps.getChampionDom(anim.ownerP, anim.fieldIdx);
                            if (el) {
                                el.classList.add("fury-flash");
                                setTimeout(() => el.classList.remove("fury-flash"), 900);
                            }
                            if (window.DfSpriteVfx?.playFuryBurst) {
                                await window.DfSpriteVfx.playFuryBurst(anim.ownerP, anim.fieldIdx);
                            } else {
                                await deps.wait(500);
                            }
                            deps.updateUI();
                        }
                        break;
                    case "incendiar":
                        if (anim.targetP != null && anim.targetI != null) {
                            await deps.animateIncendiarGrant(anim.targetP, anim.targetI, {
                                casterP: anim.casterP,
                                casterField: anim.casterFieldIdx,
                            });
                            if (deferredPatches?.length) {
                                dfOnlineApplyFieldPatches(deferredPatches);
                                deferredConsumed = true;
                            } else if (anim.fieldPatches?.length) {
                                dfOnlineApplyFieldPatches(anim.fieldPatches);
                            } else {
                                dfOnlineApplyFieldPatches([{
                                    targetP: anim.targetP,
                                    targetI: anim.targetI,
                                    burning: true,
                                    burningTurns: anim.burningTurns ?? 4,
                                    burningByP: anim.burningByP ?? anim.casterP,
                                }]);
                            }
                            deps.updateUI(true);
                        }
                        break;
                    case "vinganca":
                        if (anim.targetP != null && anim.targetI != null) {
                            try {
                                if (typeof deps.playVingancaVisual === "function") {
                                    await deps.playVingancaVisual(
                                        anim.ownerP, anim.ownerI, anim.targetP, anim.targetI,
                                    );
                                } else if (typeof deps.animateStrongArm === "function") {
                                    await deps.wait(400);
                                }
                            } catch (e) { /* */ }
                            deps.updateUI();
                        }
                        break;
                    case "legado":
                        if (anim.targetP != null && anim.targetI != null) {
                            try {
                                if (typeof deps.animateLegado === "function") {
                                    await deps.animateLegado(anim.targetP, anim.targetI);
                                } else if (typeof deps.triggerLegado === "function") {
                                    await deps.triggerLegado(anim.ownerP ?? anim.targetP, { visualOnly: true });
                                }
                            } catch (e) { /* */ }
                            deps.updateUI(true);
                        }
                        break;
                    case "troca_injusta":
                        if (anim.casterP != null && anim.enemyP != null) {
                            await deps.animateTrocaInjusta(
                                anim.casterP, anim.casterFieldIdx ?? 0, anim.enemyP, anim.enemyI,
                                anim.preRects || null,
                            );
                        }
                        break;
                    case "land_impact":
                        if (anim.ownerP != null && anim.fieldIdx != null) {
                            await deps.championLandImpact(anim.ownerP, anim.fieldIdx);
                        }
                        break;
                    case "transformar_bichinho":
                        if (anim.targetP != null && anim.targetI != null) {
                            const puff = await deps.playTransformarBichinhoVisual(
                                anim.targetP, anim.targetI, !!anim.success,
                            );
                            await deps.dismissTransformPuff(puff);
                        }
                        break;
                    case "necromancia":
                        if ((anim.casterP != null || anim.casterIdx != null)
                            && (anim.cardName || anim.card)) {
                            const card = anim.cardName
                                ? { name: anim.cardName }
                                : (typeof anim.card === "string" ? { name: anim.card } : anim.card);
                            await deps.animateNecromanciaFlyToHand(
                                anim.casterP ?? anim.casterIdx,
                                card,
                            );
                        }
                        break;
                    case "thunder_discard": {
                        const opp = anim.opponentId ?? anim.targetPlayer ?? anim.playerId;
                        const idxs = Array.isArray(anim.handIndices) ? anim.handIndices
                            : (anim.handIdx != null ? [anim.handIdx] : []);
                        if (typeof deps.animateThunderDiscardFromHand === "function" && idxs.length) {
                            const sorted = idxs.slice().sort((a, b) => b - a);
                            for (const hi of sorted) {
                                try {
                                    await deps.animateThunderDiscardFromHand(opp, hi);
                                } catch (e) { /* */ }
                            }
                        } else if (typeof deps.animateThunderDiscardFromHand === "function"
                            && anim.cardName && opp != null) {
                            // Fallback: anima o topo da mão do oponente.
                            const handLen = deps.getState().players[opp]?.hand?.length ?? 0;
                            if (handLen > 0) {
                                await deps.animateThunderDiscardFromHand(opp, handLen - 1);
                            }
                        }
                        break;
                    }
                    default:
                        break;
                }
                if (deferredPatches?.length && !deferredConsumed) {
                    dfOnlineApplyFieldPatches(deferredPatches);
                    deps.updateUI(true);
                }
            } catch (e) {
                console.warn("[DF online] replay anim", e);
            }
        }

        async function dfOnlineReplaySummonLand(action, fromSeat) {
            const insertIdx = action.insertIdx != null ? action.insertIdx : -1;
            let fIdx = insertIdx;
            if (fIdx < 0 || fIdx >= (deps.getState().players[fromSeat]?.field?.length || 0)) {
                fIdx = (deps.getState().players[fromSeat]?.field?.length || 1) - 1;
            }
            if (fIdx >= 0) await deps.championLandImpact(fromSeat, fIdx);
        }

        async function dfOnlineReplaySummonVisual(action, fromSeat, _snapIgnored) {
            // Ator local já anima via summonAnimation — não repetir o fly.
            if (fromSeat === deps.dfLocalSeat()
                && (window.__dfSummonInFlight
                    || (action?.uid && String(action.uid) === String(window.__dfLocalSummonUid || ""))
                    || (action?.cardName && window.__dfLocalSummonAnimKey
                        && String(window.__dfLocalSummonAnimKey).includes(String(action.cardName))))) {
                return;
            }
            // Dedupe: mesma invocação em <2,5s (serverAi present duplicado).
            try {
                const sk = `sumV:${fromSeat}|${action?.uid || ""}|${action?.cardName || ""}|${action?.insertIdx ?? ""}`;
                const now = Date.now();
                if (window.__dfSummonReplayKey === sk
                    && (now - (window.__dfSummonReplayAt | 0)) < 2500) {
                    return;
                }
                window.__dfSummonReplayKey = sk;
                window.__dfSummonReplayAt = now;
            } catch (eSumDed) { /* */ }
            const liveField = deps.getState().players[fromSeat]?.field || [];
            let insertIdx = action.insertIdx;
            if (insertIdx == null || insertIdx < 0) {
                if (action.cardName) {
                    insertIdx = liveField.findIndex((c) => c?.name === action.cardName);
                }
                if (insertIdx == null || insertIdx < 0) {
                    insertIdx = Math.max(0, liveField.length - 1);
                }
            }
            insertIdx = Math.min(insertIdx, Math.max(0, liveField.length - 1));
            const placed = liveField[insertIdx];
            const card = placed
                || (action.cardName
                    ? { name: action.cardName, category: "champion", power: 1, currentPower: 1 }
                    : null);
            if (!card) {
                await dfOnlineReplaySummonLand(action, fromSeat);
                return;
            }
            try {
                if (card.name) window.dfPrefetchCardArt?.(card.name);
            } catch (e) { /* */ }

            const qIdx = deps.dfQuadrantForPlayer(fromSeat);
            const q = deps.$(`quadrant-${qIdx}`);
            const handDiv = q?.querySelector(".quadrant-hand");
            const handRect = handDiv?.getBoundingClientRect?.();
            let summonSrc = null;
            if (handRect && handRect.width > 0 && handRect.height > 0) {
                summonSrc = {
                    x: handRect.left + handRect.width * 0.35,
                    y: handRect.top,
                    cx: handRect.left + handRect.width * 0.5,
                    cy: handRect.top + handRect.height * 0.5,
                    w: Math.min(90, handRect.width * 0.22),
                    h: Math.min(126, handRect.height * 0.9),
                    html: deps.buildFlyCardHtml(card),
                    isPlayerHand: false,
                };
            } else {
                // Fallback: centro do campo do invocador (adversário ainda vê o voo).
                const fieldEl = q?.querySelector(".quadrant-field");
                const fr = fieldEl?.getBoundingClientRect?.();
                if (fr && fr.width > 0) {
                    summonSrc = {
                        x: fr.left + fr.width * 0.5 - 40,
                        y: fr.top + fr.height * 0.15,
                        cx: fr.left + fr.width * 0.5,
                        cy: fr.top + fr.height * 0.2,
                        w: 72,
                        h: 100,
                        html: deps.buildFlyCardHtml(card),
                        isPlayerHand: false,
                    };
                }
            }
            if (placed) placed._summoning = true;
            deps.updateUI();
            // Layout flush (igual summon local) — sem isso getBoundingClientRect
            // do slot ainda é 0×0 e o .summon-fly nasce no canto (0,0).
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            let destReady = false;
            for (let attempt = 0; attempt < 6 && !destReady; attempt++) {
                const el = deps.getChampionDom?.(fromSeat, insertIdx)
                    || (typeof document !== "undefined" ? document.getElementById(`champ-${fromSeat}-${insertIdx}`) : null);
                const r = el?.getBoundingClientRect?.();
                if (r && r.width > 4 && r.height > 4) destReady = true;
                else await new Promise((res) => requestAnimationFrame(res));
            }
            try {
                window.sfx && window.sfx("champion_summon");
                window.sfx && window.sfx("champion_summon", { gain: 0.45, delay: 0.085 });
            } catch (e) { /* */ }
            window._summonLock = true;
            try {
                if (summonSrc) {
                    await deps.summonAnimation(fromSeat, insertIdx, summonSrc);
                    await deps.championLandImpact(fromSeat, insertIdx);
                } else {
                    await deps.championLandImpact(fromSeat, insertIdx);
                }
            } finally {
                window._summonLock = false;
            }
            if (placed) delete placed._summoning;
            deps.updateUI();
        }

        function dfOnlineQueueSync(actionType) {
            if (!window.__DF_ONLINE || deps.getApplyingRemote()) return;
            if (actionType !== "SYNC_STATE") return;
            clearTimeout(dfOnlineSyncTimer);
            dfOnlineSyncTimer = setTimeout(() => {
                dfOnlineBroadcastAction({
                    type: "SYNC_STATE",
                    playerId: deps.dfLocalSeat(),
                }, { full: true });
            }, 120);
        }

        function setOnlineStatus(msg, isErr) {
            const el = deps.$("online-status");
            if (!el) return;
            el.textContent = msg;
            el.style.color = isErr ? "#ff8a7a" : "#bbb";
        }

        function showOnlineLobby() {
            if (deps.getState()?.started && window.__DF_ONLINE) return;
            ["main", "play-menu", "hero-select", "objective-select", "ai-mode-select"].forEach((id) => {
                deps.$(id)?.classList.remove("active");
            });
            try {
                const g = deps.$("game");
                if (g) {
                    g.classList.remove("active", "arena-ready");
                    g.style.display = "none";
                }
                document.body.classList.remove("df-arena-visible");
                document.documentElement.classList.remove("df-combat-canvas");
                document.documentElement.setAttribute("data-df-menu-bg", "hero");
            } catch (eGame) { /* */ }
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.style.display = "";
                lobby.classList.add("active");
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            const urlIn = deps.$("online-server-url");
            if (urlIn) {
                urlIn.value =
                    localStorage.getItem("dragonfall:server") ||
                    window.__DF_DEFAULT_SERVER__ ||
                    DfNetClient?.defaultServerUrl?.() ||
                    "http://localhost:8787";
            }
            setOnlineStatus("Conectando… Pode levar até 1 minuto na primeira vez.");
            // Mesmo fundo DESOLAÇÃO da seleção de herói (mobile sem caixa preta).
            void (async () => {
                try {
                    document.documentElement.setAttribute("data-df-menu-bg", "hero");
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncLetterboxBg?.();
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                } catch (eBg) { /* */ }
            })();
        }

        async function dfPvPEnterQueue() {
            if (!dfNet) await initDfNet();
            if (!dfNet) return;
            // A espera na fila é a melhor janela para esquentar Pixi/GSAP: no MP o
            // orçamento de "cinematic ready" é curto e o Pixi frio fazia a primeira
            // animação da partida ser descartada sem aviso.
            try { window.__dfPrewarmVfxEngine?.("pvp-queue"); } catch (e) { /* */ }
            dfPvPStartQueueTimer();
            setOnlineStatus("Procurando oponente…");
            try {
                const res = await dfNet.joinQueue();
                if (res.matched) {
                    dfPvPStopQueueTimer();
                    window.__DF_SEAT = res.seat | 0;
                    dfPvPShowMatchFlash();
                    // Ranked preset: match_found handler envia o herói — não abrir #hero-select.
                    const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                    if (!preset?.heroId) {
                        setTimeout(() => showOnlineHeroSelect(), 800);
                    }
                }
            } catch (e) {
                setOnlineStatus("Erro na fila: " + (e.message || e), true);
            }
        }

        /** Standby — ative __DF_FEATURE_FLAGS__.rankedUi antes de expor o botão. */
        async function dfPvPEnterRankedQueue() {
            if (!window.__DF_FEATURE_FLAGS__?.rankedUi) {
                setOnlineStatus("Ranked em standby — API pronta, UI desligada.", true);
                return;
            }
            if (!dfNet) await initDfNet();
            if (!dfNet) return;
            dfPvPStartQueueTimer();
            setOnlineStatus("Fila ranked…");
            try {
                const res = await dfNet.joinRankedQueue();
                if (res.matched) {
                    dfPvPStopQueueTimer();
                    window.__DF_SEAT = res.seat | 0;
                    dfPvPShowMatchFlash();
                    const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                    if (!preset?.heroId) {
                        setTimeout(() => showOnlineHeroSelect(), 800);
                    }
                }
            } catch (e) {
                setOnlineStatus("Erro na fila ranked: " + (e.message || e), true);
            }
        }

        function dfNetServerUrl() {
            const el = deps.$("online-server-url");
            const fromInput = el?.value?.trim();
            if (fromInput) return fromInput.replace(/\/$/, "");
            return DfNetClient?.defaultServerUrl?.() || "http://localhost:8787";
        }

        async function initDfNet() {
            if (!window.DfNetClient) {
                setOnlineStatus("Cliente de rede não carregou (df-net-client.js).", true);
                return null;
            }
            dfNet = window.DfNetClient.create({
                serverUrl: dfNetServerUrl(),
                onEvent: (event, data) => dfOnlineOnNetEvent(event, data),
            });
                deps.bindNet(dfNet);
            setOnlineStatus("Conectando… Pode levar até 1 minuto na primeira vez.");
            try {
                await dfNet.connect();
                setOnlineStatus(`Conectado ao servidor (${dfNet.serverUrl}).`);
            } catch (e) {
                setOnlineStatus(
                    "Não foi possível conectar. Aguarde até 1 minuto e tente de novo, ou verifique a URL do servidor.",
                    true,
                );
                dfNet = null;
                deps.bindNet(null);
            }
            return dfNet;
        }

        function dfOnlineApplyArenaFromServer(data, label) {
            const arenaId = data?.arenaScenarioId
                || data?.gameState?.arenaScenarioId
                || data?.snapshot?.state?.arenaScenarioId
                || data?.snapshot?.arenaScenarioId
                || null;
            if (!arenaId) {
                console.warn("[DF online] arenaScenarioId ausente — sem sorteio local.", label || "");
                return null;
            }
            try {
                window.DfLayout?.setMatchArenaId?.(arenaId);
                window.__DF_MATCH_ARENA_ID = arenaId;
            } catch (e) { /* */ }
            return arenaId;
        }

        async function dfOnlineApplyReplaySync(replay, opts = {}) {
            if (!replay) return { ok: false, error: "NO_REPLAY" };
            const isReconnect = !!(opts.reconnect || replay.reconnected);
            const snapshotOnly = !!(opts.snapshotOnly || isReconnect);
            // Gap-fill / reconnect: só avança para o tip + snapshot — sem
            // reapresentar cada entry (evita turnos acelerados ao voltar).
            if (replay.gapFill && (snapshotOnly || Array.isArray(replay.entries))) {
                const tipSeq = replay.seq ?? replay.actionSeq;
                if (!snapshotOnly && Array.isArray(replay.entries) && replay.entries.length
                    && deps.getState()?.started) {
                    for (const entry of replay.entries) {
                        try {
                            const env = entry?.envelope || entry;
                            if (env?.action || env?.authoritativeState) {
                                dfOnlineApplyRemote(env);
                            }
                        } catch (e) { /* */ }
                    }
                }
                if (tipSeq != null) dfOnlineConfirmAppliedSeq(tipSeq);
                if (replay.gameState?.players?.length || replay.snapshot || replay.authoritativeState) {
                    const inner = dfOnlineUnwrapReplayState(replay);
                    if (inner?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot({ state: inner, full: true }, {
                                skipPhase: true,
                                forceAuthoritative: snapshotOnly,
                            });
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                }
                if (snapshotOnly) {
                    try { dfOnlineResetPresentQueue(); } catch (eRq) { /* */ }
                    try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq) { /* */ }
                    _dfPendingRemoteDuringResync = [];
                    if (isReconnect) dfOnlineArmReconnectQuiet(4500);
                }
                return { ok: true, gapFill: true, snapshotOnly };
            }
            _dfResyncInProgress = true;
            _dfPendingRemoteDuringResync = [];
            _dfStartTurnAfterResync = false;
            if (isReconnect) dfOnlineArmReconnectQuiet(4500);
            // Timeout: não prender remote_action para sempre.
            const resyncWatch = setTimeout(() => {
                if (!_dfResyncInProgress) return;
                console.warn("[DF online] resync timeout — liberando fila");
                _dfResyncInProgress = false;
                // Reconnect: descarta backlog — snapshot já é o estado atual.
                if (isReconnect || dfOnlineInReconnectQuiet()) {
                    _dfPendingRemoteDuringResync = [];
                    return;
                }
                const pending = _dfPendingRemoteDuringResync.splice(0);
                for (const env of pending) {
                    try { dfOnlineApplyRemote(env); } catch (e) { /* */ }
                }
            }, 12000);
            try {
                try { dfOnlineAbortCombatVisuals(); } catch (e) { /* */ }
                try { dfOnlineResetPresentQueue(); } catch (e) { /* */ }
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }

            const seq = replay.seq ?? replay.actionSeq;
            if (seq != null) dfOnlineConfirmAppliedSeq(seq);
            dfOnlineApplyArenaFromServer(replay, "replay_sync");
            const inner = dfOnlineUnwrapReplayState(replay);
            if (!inner?.players?.length) {
                if (Array.isArray(replay.entries) && replay.entries.length) {
                    deps.log(`Replay: ${replay.entries.length} evento(s) no log (estado via snapshot).`);
                }
                return { ok: false, error: "NO_GAME_STATE" };
            }
            deps.setApplyingRemote(true);
            try {
                window.__DF_ONLINE = true;
                if (replay.yourSeat != null) window.__DF_SEAT = replay.yourSeat | 0;
                else if (dfNet?.seat != null) window.__DF_SEAT = dfNet.seat | 0;
                if (replay.deckSeed != null) window.__DF_DECK_SEED = replay.deckSeed;
                document.body.classList.add("df-pvp-mode");
                document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                // Hub/splash não pode ficar por cima do tabuleiro (tela preta).
                try {
                    const hub = deps.$("df-hub-splash-layer");
                    if (hub) {
                        hub.setAttribute("aria-hidden", "true");
                        hub.style.display = "none";
                    }
                    window.dfPauseHubBackdrop?.({ releaseMobileDecoder: false });
                } catch (e) { /* */ }
                hideOnlineLobbyScreen();
                deps.$("main")?.classList.remove("active");
                deps.$("play-menu")?.classList.remove("active");
                deps.$("df-play-mode")?.classList.remove("active");
                deps.$("opcoes")?.classList.remove("active");
                deps.$("update-overlay")?.classList.remove("active");
                window.dfShowUpdateOverlay?.(false);
                window.dfShowMenuLoadBar?.(false);

                const needBoot = !deps.getState()?.started
                    || !deps.getState()?.players?.length
                    || deps.getState().playersCount < 2;
                // match_start em curso: não reentrar via replay (anti double-boot).
                if (window.__dfOnlineMatchBoot || window.__dfOnlineBootLockInput) {
                    if (!needBoot && inner?.players?.length) {
                        dfOnlineReconcileSnapshot({ state: inner, full: true }, { skipPhase: true });
                        deps.updateUI(true);
                    }
                    return { ok: true, deferred: true };
                }
                if (needBoot) {
                    const heroIds = replay.heroIds
                        || [inner.players[0]?.heroId, inner.players[1]?.heroId];
                    const h0 = heroIds?.[0] || inner.players[0]?.heroId || "dragon";
                    const h1 = heroIds?.[1] || inner.players[1]?.heroId || "dragon";
                    deps.setSelectedMode?.(2);
                    deps.setSelectedWinPoints?.(inner.winPoints || 15);
                    deps.resetState(2, [h0, h1]);
                }
                dfOnlineReconcileSnapshot(
                    { state: inner, full: true },
                    { skipPhase: true, forceAuthoritative: !!opts.reconnect },
                );
                deps.getState().started = true;
                // Limpa flags de apresentação que escondem campeões no DOM.
                try { dfOnlineClearSummoningFlags(); } catch (e) { /* */ }
                try { dfOnlineAbortCombatVisuals(); } catch (e) { /* */ }
                deps.revealMatchBoard();
                const g = deps.$("game");
                if (g) {
                    g.style.display = "flex";
                    g.classList.add("active", "arena-ready");
                    g.removeAttribute("hidden");
                }
                document.body.classList.add("df-arena-visible");
                deps.updateUI(true);
                deps.checkWin({ fromAuthority: true });
                // Toast + startTurn só em retomada real (reconnect / cold boot),
                // não em rollback silencioso mid-partida (evita "Partida restaurada" falso
                // e startTurn duplicado → desync de turno).
                const coldOrReconnect = !!replay.reconnected
                    || !!opts?.forceToast
                    || !!(needBoot);
                const isReconnectResync = !!opts.reconnect || !!replay.reconnected;
                if (coldOrReconnect
                    && deps.getState().started
                    && deps.getState().winner === null) {
                    if (isReconnectResync) {
                        deps.floatText("Partida restaurada — você voltou ao combate!", "vp center", 2800);
                        deps.log("Estado restaurado (snapshot autoritativo).");
                        dfOnlineSyncTurnTimerFromPayload(replay);
                    } else {
                        deps.floatText("Partida restaurada — você voltou ao combate!", "vp center", 2800);
                        deps.log("Estado restaurado (snapshot autoritativo).");
                        _dfStartTurnAfterResync = true;
                    }
                } else if (deps.getState().started && deps.getState().winner === null) {
                    // Rollback silencioso: alinhar banner + relógio (evita timer preso em 0).
                    try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                    try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                    dfOnlineSyncTurnTimerFromPayload(replay);
                }
                // Replay VFX de ultimate recente no gap (ex.: Eurávia Conjuração).
                // Reconnect: NÃO — jogador deve ver só o estado atual.
                try {
                    if (!isReconnect && !dfOnlineInReconnectQuiet()) {
                        const entries = Array.isArray(replay.entries) ? replay.entries : [];
                        for (const ent of entries.slice(-8)) {
                            const a = ent?.action || ent;
                            if (!a || a.type !== "ULTIMATE_PLAY") continue;
                            const s = ent?.seq != null ? (ent.seq | 0) : null;
                            if (s != null && _dfUltReplaySeqs.has(s)) continue;
                            if (s != null) _dfUltReplaySeqs.add(s);
                            if (a.ultimateType === "drawCard" || a.ultimateType) {
                                void dfOnlineReplayUltimate({
                                    ...a,
                                    playerId: ent.fromSeat ?? a.playerId,
                                    _events: ent.events || [],
                                }).catch(() => {});
                                break;
                            }
                        }
                    }
                } catch (e) { /* */ }
            } finally {
                deps.setApplyingRemote(false);
            }
            return { ok: true };
            } finally {
                try { clearTimeout(resyncWatch); } catch (e) { /* */ }
                _dfResyncInProgress = false;
                // Reconnect / quiet: descarta backlog — evita “acelerar” turnos perdidos.
                if (isReconnect || dfOnlineInReconnectQuiet()) {
                    _dfPendingRemoteDuringResync = [];
                    try { dfOnlineResetPresentQueue(); } catch (eRq2) { /* */ }
                    try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq2) { /* */ }
                    try { deps.setApplyingRemote(false); } catch (eAr) { /* */ }
                }
                const pending = _dfPendingRemoteDuringResync.splice(0);
                // Após resync: um startTurn só (não empilhar com END_TURN remoto).
                if (_dfStartTurnAfterResync) {
                    _dfStartTurnAfterResync = false;
                    window.__dfOnlineSkipMaintRules = true;
                    try {
                        const cp = deps.getState().currentPlayer;
                        if (cp === 0 || cp === 1) await deps.startTurn?.(cp);
                    } catch (e) { /* */ }
                    finally {
                        window.__dfOnlineSkipMaintRules = false;
                    }
                }
                for (const env of pending) {
                    try { dfOnlineApplyRemote(env); } catch (e) { /* */ }
                }
            }
        }

        /**
         * MP: reassumir assento (persistência dragonfall:pvp) sem ir ao Hub.
         * Usado quando o socket perdeu a sala (NOT_IN_ROOM) ou o jogador voltou.
         */
        async function dfOnlineRecoverMatchSeat() {
            if (dfOnlineRecoverMatchSeat._busy) return dfOnlineRecoverMatchSeat._busy;
            const saved = (typeof window.DfNetClient?.readPersistedSession === "function")
                ? window.DfNetClient.readPersistedSession()
                : null;
            if (!saved?.code) return { ok: false, error: "NO_SESSION" };
            dfOnlineRecoverMatchSeat._busy = (async () => {
                try {
                    if (!dfNet) {
                        try { await initDfNet(); } catch (eN) { /* */ }
                    }
                    if (!dfNet?.tryResumeSession) return { ok: false, error: "NO_NET" };
                    window.__DF_ONLINE = true;
                    document.body.classList.add("df-pvp-mode");
                    const res = await dfNet.tryResumeSession();
                    if (!res?.ok) return res || { ok: false, error: "RESUME_FAILED" };
                    if (res.seat != null) window.__DF_SEAT = res.seat | 0;
                    document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                    if (res.replay) {
                        try {
                            await dfOnlineApplyReplaySync(res.replay, { forceToast: false, reconnect: true });
                        } catch (eR) { /* */ }
                    }
                    try {
                        const g = deps.$("game");
                        if (deps.getState()?.started && g) {
                            deps.revealMatchBoard?.();
                            g.style.display = "flex";
                            g.classList.add("active", "arena-ready");
                            g.removeAttribute("hidden");
                            document.body.classList.add("df-arena-visible", "df-pvp-mode");
                            deps.$("main")?.classList.remove("active");
                            deps.$("play-menu")?.classList.remove("active");
                            const hub = deps.$("df-hub-splash-layer");
                            if (hub) {
                                hub.setAttribute("aria-hidden", "true");
                                hub.style.display = "none";
                            }
                        }
                    } catch (eUi) { /* */ }
                    try { deps.updateUI?.(true); } catch (eU) { /* */ }
                    return res;
                } finally {
                    dfOnlineRecoverMatchSeat._busy = null;
                }
            })();
            return dfOnlineRecoverMatchSeat._busy;
        }

        /** Escape: tela preta / resume falho — volta ao hub sem travar. */
        async function dfOnlineForceExitStuckMatch(reason, opts = {}) {
            console.warn("[DF online] force exit stuck", reason || "");
            const seatErr = reason === "NOT_PLAYING" || reason === "NOT_IN_ROOM" || reason === "NO_SEAT";
            if (seatErr && opts.hard !== true && opts.clearSession !== true) {
                try {
                    const rec = await dfOnlineRecoverMatchSeat();
                    if (rec?.ok) {
                        deps.floatText("Reconectado à partida.", "info center", 1800);
                        return;
                    }
                    if (rec?.error && rec.error !== "ROOM_NOT_FOUND" && rec.error !== "NO_SESSION") {
                        deps.floatText("Reconectando à partida…", "warn center", 2200);
                        return;
                    }
                } catch (eRec) { /* segue saída */ }
            }
            const hard = opts.hard !== false && (
                reason === "ROOM_NOT_FOUND"
                || reason === "NOT_PLAYING"
                || opts.clearSession === true
            );
            try { deps.stopTimer?.(); } catch (e) { /* */ }
            if (hard) {
                try { await dfNet?.leaveRoom?.({ abandon: true, clearSession: true }); } catch (e) { /* */ }
                try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
            } else {
                // Falha transitória: sai da UI sem abandonar assento no servidor.
                try { await dfNet?.leaveRoom?.({ abandon: false, clearSession: false }); } catch (e) { /* */ }
            }
            // Sempre limpa flags MP no hub — evita pill Offline preso.
            try {
                dfClearOnlineMatchFlags({
                    force: true,
                    leaveNet: false,
                    clearSession: hard,
                    abandon: false,
                });
            } catch (e) {
                window.__DF_ONLINE = false;
                window.__dfTurnEndingPending = false;
                window.__dfPeerAiActive = false;
                document.body.classList.remove("df-pvp-mode", "df-online-seat-1", "df-arena-visible", "df-peer-ai");
            }
            const g = deps.$("game");
            if (g) {
                g.style.display = "none";
                g.classList.remove("active", "arena-ready");
            }
            try {
                const st = deps.getState();
                if (st) {
                    st.started = false;
                    st.winner = null;
                }
            } catch (e) { /* */ }
            hideOnlineLobbyScreen();
            deps.$("menu-overlay")?.classList.remove("active");
            deps.$("win-overlay")?.classList.remove("active");
            document.documentElement.classList.remove("df-win-active");
            try { deps.showPlayMenu?.(); } catch (e) { /* */ }
            deps.floatText(
                hard
                    ? "Não foi possível restaurar a partida — voltando ao menu."
                    : "Falha ao restaurar — tente de novo em instantes.",
                "warn center",
                3600,
            );
        }

        function dfOnlineSetPeerAiUi(active, seat) {
            // MP: IA do servidor pode assumir, mas SEM banner / texto "IA jogando…".
            window.__dfPeerAiActive = !!active;
            window.__dfPeerAiSeat = active ? (seat | 0) : null;
            document.body.classList.toggle("df-peer-ai", !!active);
            try {
                const banner = document.getElementById("df-peer-ai-banner");
                if (banner) {
                    banner.hidden = true;
                    banner.remove();
                }
            } catch (e) { /* */ }
        }

        /**
         * Boot: se há dragonfall:pvp, reconecta direto na partida (MP only).
         */
        async function dfTryResumePvpSession() {
            const saved = (typeof window.DfNetClient?.readPersistedSession === "function")
                ? window.DfNetClient.readPersistedSession()
                : null;
            if (!saved?.code) return { ok: false, error: "NO_SESSION" };
            deps.floatText("Reconectando à partida…", "info center", 2200);
            if (!dfNet) {
                try { await initDfNet(); } catch (e) { /* */ }
            }
            if (!dfNet?.tryResumeSession) return { ok: false, error: "NO_NET" };
            window.__DF_ONLINE = true;
            document.body.classList.add("df-pvp-mode");
            const res = await dfNet.tryResumeSession();
            if (!res?.ok) {
                const gone = res?.error === "ROOM_NOT_FOUND" || res?.error === "NO_SESSION";
                try {
                    dfClearOnlineMatchFlags({
                        force: true,
                        leaveNet: false,
                        clearSession: gone,
                        abandon: false,
                    });
                } catch (e) {
                    window.__DF_ONLINE = false;
                    document.body.classList.remove("df-pvp-mode");
                }
                if (gone) {
                    deps.floatText("Partida online não encontrada (expirou ou já terminou).", "warn center", 3200);
                    try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
                } else {
                    deps.floatText("Servidor ocupado — tente reconectar em instantes.", "warn center", 3200);
                }
                return res;
            }
            if (res.seat != null) window.__DF_SEAT = res.seat | 0;

            // Lobby / sem combate: não esconder o hub (evita tela preta).
            if (res.status && res.status !== "playing") {
                window.__DF_ONLINE = false;
                document.body.classList.remove("df-pvp-mode");
                try { window.DfNetClient?.clearPersistedSession?.(); } catch (e) { /* */ }
                try { await dfNet?.leaveRoom?.({ abandon: false, clearSession: true }); } catch (e) { /* */ }
                return { ok: false, error: "NOT_PLAYING" };
            }

            let replay = res.replay;
            for (let attempt = 0; attempt < 3; attempt++) {
                if (dfOnlineUnwrapReplayState(replay)?.players?.length) break;
                try {
                    await deps.wait?.(350 * (attempt + 1));
                    const more = await dfNet.getReplay?.(0);
                    if (more?.ok) replay = more;
                } catch (e) { /* */ }
            }

            const applied = await dfOnlineApplyReplaySync(
                { ...(replay || {}), reconnected: true },
                { forceToast: true },
            );
            if (!applied?.ok || !deps.getState()?.started) {
                await dfOnlineForceExitStuckMatch(applied?.error || "RESUME_NO_BOARD", {
                    hard: false,
                    clearSession: false,
                });
                return { ok: false, error: applied?.error || "RESUME_NO_BOARD" };
            }
            const g = deps.$("game");
            if (!g?.classList.contains("active")) {
                await dfOnlineForceExitStuckMatch("GAME_NOT_VISIBLE", { hard: false, clearSession: false });
                return { ok: false, error: "GAME_NOT_VISIBLE" };
            }
            return { ok: true, seat: res.seat, code: res.code };
        }

        async function dfOnlineOnNetEvent(event, data) {
            // Fora de partida online: não poluir vs-IA com Offline / toasts / remote_action.
            // Lobby ainda precisa de match_found / match_start / heroes / room_state.
            if (!window.__DF_ONLINE) {
                const lobbyOk = event === "match_found" || event === "ranked_match_found"
                    || event === "match_start" || event === "hello" || event === "version_mismatch"
                    || event === "heroes_update" || event === "room_state" || event === "queue_update"
                    || event === "ranked_queue_update" || event === "replay_sync" || event === "reconnected"
                    || event === "connected" || event === "net_status";
                if (!lobbyOk) {
                    const pill = document.getElementById("df-net-status");
                    if (pill) {
                        pill.style.opacity = "0";
                        pill.textContent = "";
                    }
                    return;
                }
            }
            if (event === "version_mismatch") {
                const local = data?.local || window.__DF_DISPLAY_VERSION || "?";
                const remote = data?.server || "?";
                const now = Date.now();
                if (!dfOnlineOnNetEvent._lastVerToast || now - dfOnlineOnNetEvent._lastVerToast > 8000) {
                    dfOnlineOnNetEvent._lastVerToast = now;
                    deps.floatText(
                        `Versão do jogo (${local}) ≠ servidor (${remote}). Atualize o servidor / o jogo antes de jogar online.`,
                        "warn center",
                        5200,
                    );
                }
                deps.log(`Incompatível: cliente ${local}, servidor ${remote}.`);
                return;
            }
            if (event === "hello" && data?.gameVersion) {
                const local = window.__DF_DISPLAY_VERSION || "";
                if (local && data.gameVersion !== local) {
                    // version_mismatch já notifica — evita toast duplicado.
                    return;
                }
                return;
            }
            if (event === "reconnected") {
                dfOnlineOnNetEvent._discSince = 0;
                dfOnlineThrottledFailToast._disc = 0;
                setNetStatusUi("connected");
                deps.floatText("Reconectado ao servidor.", "info center", 1800);
                // Seat só do ACK do servidor (yourSeat / dfNet.seat após join_room).
                if (data?.yourSeat != null) window.__DF_SEAT = data.yourSeat | 0;
                else if (data?.seat != null) window.__DF_SEAT = data.seat | 0;
                else if (dfNet?.seat != null) window.__DF_SEAT = dfNet.seat | 0;
                document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
                document.body.classList.add("df-pvp-mode");
                window.__DF_ONLINE = true;
                // Antes de aplicar: corta filas de present (evita fast-forward).
                try { dfOnlineResetPresentQueue(); } catch (ePre) { /* */ }
                try { _dfSeqCriticalQ = Promise.resolve(); } catch (eSq) { /* */ }
                _dfPendingRemoteDuringResync = [];
                dfOnlineArmReconnectQuiet(5000);
                try { deps.setApplyingRemote(false); } catch (eAr0) { /* */ }
                if (data?.replay?.gameState || data?.replay?.snapshot) {
                    _dfSkipNextReplaySyncSeq = data.replay.seq != null ? (data.replay.seq | 0) : -1;
                    await dfOnlineApplyReplaySync(
                        {
                            ...data.replay,
                            reconnected: true,
                            yourSeat: window.__DF_SEAT,
                            turnDeadline: data.turnDeadline ?? data.replay.turnDeadline ?? null,
                        },
                        { forceToast: true, reconnect: true, snapshotOnly: true },
                    );
                } else {
                const board = data?.gameState || data?.snapshot;
                if (board && (board.players?.length || board.gameState || board.snapshot)) {
                    await dfOnlineApplyReplaySync(
                        { ...(typeof board === "object" ? board : {}), ...data, reconnected: true },
                        { forceToast: true, reconnect: true, snapshotOnly: true },
                    );
                } else {
                    // Reconnect sem board no envelope — puxa replay completo.
                    try {
                        const more = await dfNet?.getReplay?.(0);
                        if (more?.ok || more?.gameState || more?.snapshot) {
                            await dfOnlineApplyReplaySync(
                                { ...(more || {}), reconnected: true, yourSeat: window.__DF_SEAT },
                                { forceToast: true, reconnect: true, snapshotOnly: true },
                            );
                        }
                    } catch (e) { /* */ }
                }
                }
                // Garante tabuleiro visível (mesmo path de dfOnlineApplyReplaySync).
                try {
                    const g = deps.$("game");
                    if (deps.getState()?.started) {
                        deps.revealMatchBoard?.();
                        if (g) {
                            g.style.display = "flex";
                            g.classList.add("active", "arena-ready");
                            g.removeAttribute("hidden");
                        }
                        document.body.classList.add("df-arena-visible");
                        deps.$("main")?.classList.remove("active");
                        deps.$("play-menu")?.classList.remove("active");
                        const hub = deps.$("df-hub-splash-layer");
                        if (hub) {
                            hub.setAttribute("aria-hidden", "true");
                            hub.style.display = "none";
                        }
                        window.dfPauseHubBackdrop?.({ releaseMobileDecoder: false });
                    }
                } catch (eReveal) { /* */ }
                // Assert turno: seat local vs currentPlayer autoritativo.
                try {
                    const cp = deps.getState()?.currentPlayer;
                    const seat = deps.dfLocalSeat?.() ?? window.__DF_SEAT;
                    if ((cp === 0 || cp === 1) && (seat === 0 || seat === 1)) {
                        const mine = cp === seat;
                        if (!!deps.dfIsMyTurn?.() !== mine) {
                            console.warn("[DF online] turn/seat drift after reconnect — rollback");
                            await dfOnlineRollbackToServer();
                        }
                    }
                } catch (e) { /* */ }
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                return;
            }
            if (event === "turn_deadline") {
                dfOnlineSyncTurnTimerFromPayload(data);
                return;
            }
            if (event === "net_status") {
                setNetStatusUi(data?.status || "connected");
                return;
            }
            if (event === "server_restarting") {
                setNetStatusUi("reconnecting");
                deps.floatText("Servidor reiniciando — reconectando…", "warn center", 2800);
                return;
            }
            if (event === "connected") {
                dfOnlineOnNetEvent._discSince = 0;
                setNetStatusUi("connected");
                return;
            }
            // connect_error transitório (Socket.IO ainda tenta) — sem toast.
            if (event === "connect_error") {
                if (data?.transient) {
                    setNetStatusUi("reconnecting");
                    return;
                }
                const now = Date.now();
                if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                    dfOnlineThrottledFailToast._disc = now;
                    if (window.__DF_ONLINE && deps.getState()?.started) {
                        setNetStatusUi("offline");
                        deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                    }
                }
                return;
            }
            if (event === "disconnected") {
                // Reconexão automática em curso: não assuste o jogador a cada blip de rede.
                if (data?.willReconnect) {
                    setNetStatusUi("reconnecting");
                    const now = Date.now();
                    if (!dfOnlineOnNetEvent._discSince) dfOnlineOnNetEvent._discSince = now;
                    // Só avisa se ficar >4s sem voltar (evita “Sem conexão” fantasma o jogo todo).
                    if (now - dfOnlineOnNetEvent._discSince < 4000) return;
                    if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                        dfOnlineThrottledFailToast._disc = now;
                        if (window.__DF_ONLINE && deps.getState()?.started) {
                            deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                        }
                    }
                    return;
                }
                setNetStatusUi("offline");
                const now = Date.now();
                if (!dfOnlineThrottledFailToast._disc || now - dfOnlineThrottledFailToast._disc > 20000) {
                    dfOnlineThrottledFailToast._disc = now;
                    if (window.__DF_ONLINE && deps.getState()?.started) {
                        deps.floatText("Sem conexão com o servidor — reconectando…", "warn center", 2600);
                    }
                }
                return;
            }
            if (event === "replay_sync") {
                if (_dfSkipNextReplaySyncSeq != null) {
                    const skipSeq = _dfSkipNextReplaySyncSeq;
                    _dfSkipNextReplaySyncSeq = null;
                    const incomingSeq = data?.seq != null ? (data.seq | 0) : null;
                    if (skipSeq === -1 || (incomingSeq != null && incomingSeq === skipSeq)) {
                        dfOnlineSyncTurnTimerFromPayload(data);
                        try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                        try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                        return;
                    }
                }
                // Mid-match push: reconcile silencioso (sem toast / startTurn).
                await dfOnlineApplyReplaySync(data, { forceToast: false });
                try { window.__dfTurnEndingPending = false; } catch (e) { /* */ }
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (e) { /* */ }
                return;
            }
            if (event === "match_found" || event === "ranked_match_found") {
                if (data?.seatToken) {
                    try {
                        const code = data.code || dfNet?.roomCode;
                        const seat = data.seat != null ? data.seat : dfNet?.seat;
                        localStorage.setItem("dragonfall:pvp", JSON.stringify({
                            code,
                            seat,
                            seatToken: data.seatToken,
                        }));
                    } catch (e) { /* */ }
                }
                dfPvPStopQueueTimer();
                window.__DF_SEAT = data.seat | 0;
                dfApplyRoomHeroState(data);
                deps.heroDefs.forEach((h) => { if (h.image) window.dfPrefetchArtUrl?.(h.image, "low"); });
                dfPvPShowMatchFlash();
                const preset = window.__DF_RANKED_PRESET || window.DfRankedSetup?.getPreset?.();
                if (preset?.heroId) {
                    setTimeout(() => {
                        void (async () => {
                            try {
                                deps.setSelectedHeroId(preset.heroId);
                                await dfNet.setHero(preset.heroId, {
                                    deckCardNames: preset.deckCardNames || null,
                                });
                                setOnlineStatus("Herói enviado. Aguardando o adversário…");
                            } catch (e) {
                                setOnlineStatus("Erro ao enviar herói: " + (e.message || e), true);
                                showOnlineHeroSelect();
                            }
                        })();
                    }, 600);
                } else {
                    setTimeout(() => showOnlineHeroSelect(), 800);
                }
                return;
            }
            if (event === "match_start") {
                if (data?.seatToken) {
                    try {
                        const seat = data.yourSeat != null ? data.yourSeat : window.__DF_SEAT;
                        localStorage.setItem("dragonfall:pvp", JSON.stringify({
                            code: data.code || dfNet?.roomCode,
                            seat,
                            seatToken: data.seatToken,
                        }));
                    } catch (e) { /* */ }
                }
                hideOnlineLobbyScreen();
                await startOnlineMatch(data);
                return;
            }
            if (event === "room_state") {
                dfApplyRoomHeroState(data);
                if (data?.arenaScenarioId) {
                    dfOnlineApplyArenaFromServer(data, "room_state");
                }
                if (data?.status === "playing") {
                    hideOnlineLobbyScreen();
                    // Cold-boot só via match_start (nunca room_state) — evita
                    // double reveal/música/startTurn quando os eventos chegam juntos.
                    if (window.__dfOnlineMatchBoot || window.__dfOnlineBootLockInput
                        || window.__dfOnlineBootDone || _dfOnlineBootPromise) {
                        return;
                    }
                    // Já em partida: no máximo reconcile silencioso se estado veio.
                    if (deps.getState()?.started && data.gameState?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot(
                                { state: data.gameState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI?.(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                }
                return;
            }
            if (event === "late_action_ack") {
                // ACK chegou depois do timeout — reconciliar se o turno/estado divergiu.
                const late = data?.ack;
                if (!late?.authoritativeState?.players?.length) return;
                const lateSeq = late.seq != null ? (late.seq | 0) : (data?.seq != null ? (data.seq | 0) : null);
                // Já orquestrou startTurn para este END_TURN — só reconciliar estado.
                if (late?.action?.type === "END_TURN"
                    && lateSeq != null
                    && lateSeq === (window.__dfLastEndTurnStartSeq | 0)) {
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: late.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    return;
                }
                if (window.__dfTurnEndingPending) {
                    // Actor ainda processando END_TURN — só aplica estado, sem startTurn duplicado.
                    deps.setApplyingRemote(true);
                    try {
                        dfOnlineReconcileSnapshot(
                            { state: late.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                        deps.updateUI();
                    } finally {
                        deps.setApplyingRemote(false);
                    }
                    return;
                }
                const beforeCp = deps.getState()?.currentPlayer;
                const afterCp = late.authoritativeState.currentPlayer;
                deps.setApplyingRemote(true);
                try {
                    dfOnlineReconcileSnapshot(
                        { state: late.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                } finally {
                    deps.setApplyingRemote(false);
                }
                if ((beforeCp === 0 || beforeCp === 1)
                    && (afterCp === 0 || afterCp === 1)
                    && beforeCp !== afterCp) {
                    if (lateSeq != null) window.__dfLastEndTurnStartSeq = lateSeq;
                    window.__dfOnlineSkipMaintRules = true;
                    void deps.startTurn(afterCp).finally(() => {
                        window.__dfOnlineSkipMaintRules = false;
                    });
                }
                return;
            }
            if (event === "remote_action") {
                void dfOnlineApplyRemote(data);
                return;
            }
            if (event === "peer_ai_control") {
                dfOnlineSyncTurnTimerFromPayload(data);
                if (data?.active) {
                    dfOnlineSetPeerAiUi(true, data.seat);
                    // Sem toast de IA — takeover silencioso.
                } else {
                    const local = typeof deps.dfLocalSeat === "function"
                        ? deps.dfLocalSeat()
                        : (window.__DF_SEAT | 0);
                    const seatCleared = data?.seat != null ? (data.seat | 0) : null;
                    const wasLocalSeat = seatCleared != null && seatCleared === (local | 0);
                    dfOnlineSetPeerAiUi(false);
                    // MP-only: limpa filas de apresentação e libera input.
                    try { _dfPresenter?.reset?.(); } catch (eReset) { /* */ }
                    try { deps.ensureTurnReady?.(); } catch (eReady) { /* */ }
                    try { deps.updateUI?.(true); } catch (eUi) { /* */ }
                    if (wasLocalSeat) {
                        deps.floatText("Você reassumiu o controle da partida.", "info center", 2200);
                        deps.log("Controle humano restaurado (IA desligada).");
                        // Se é a vez do assento local, garante timer/input.
                        try {
                            if (deps.getState()?.currentPlayer === local) {
                                deps.startTimer?.();
                            }
                        } catch (eT) { /* */ }
                    } else {
                        deps.floatText("Oponente voltou à partida.", "info center", 2200);
                        deps.log("Oponente reconectou.");
                    }
                }
                return;
            }
            if (event === "peer_disconnected" || event === "peer_left") {
                // Pós-vitória: sair do menu NÃO é desistência.
                const st = deps.getState();
                const matchAlreadyOver = st?.winner != null
                    || deps.getGamePhase?.() === "game-over"
                    || !!document.getElementById("win-overlay")?.classList?.contains("active");
                if (matchAlreadyOver) {
                    return;
                }
                dfOnlineSyncTurnTimerFromPayload(data);
                if (data?.forfeit || (data?.winner != null && !data?.abandoned && !data?.canReconnect)) {
                    deps.floatText("Oponente desistiu — você venceu!", "vp center", 3200);
                    deps.log("Oponente desistiu da partida.");
                    if (deps.getState()?.started) {
                        const winner = data?.winner != null
                            ? (data.winner | 0)
                            : (data?.seat != null ? (1 - (data.seat | 0)) : deps.dfLocalSeat());
                        deps.getState().winner = winner;
                        deps.stopTimer();
                        deps.checkWin({ delayMs: 0 });
                        try { deps.showWin?.(); } catch (e) { /* */ }
                    }
                    return;
                }
                if (data?.canReconnect || data?.abandoned) {
                    deps.floatText(
                        data?.abandoned
                            ? "Oponente desconectou."
                            : "Oponente desconectou — pode voltar em instantes.",
                        "warn center",
                        3200,
                    );
                    deps.log(data?.abandoned
                        ? "Oponente abandonou (servidor assume)."
                        : "Oponente desconectou (reconexão possível).");
                    // Alinha estado/timer com o servidor (evita relógio em 0).
                    try {
                        const rolled = await dfOnlineRollbackToServer?.();
                        if (!rolled) void dfOnlineRecoverMatchSeat();
                    } catch (e1) {
                        try { void dfOnlineRecoverMatchSeat(); } catch (e2) { /* */ }
                    }
                    return;
                }
                deps.floatText("Oponente desconectou.", "warn center", 2600);
                deps.log("Oponente saiu da sala.");
            }
        }

        async function dfOnlineApplyRemoteBody(envelope) {
            const useSnapshot = envelope.snapshot?.players?.length;
            const act = envelope.action;
            const actType = act?.type;
            if (actType === "END_TURN") {
                await dfOnlineHandleRemoteEndTurn(envelope);
                return;
            }
            if (actType === "TALENT_START" && useSnapshot) {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
                return;
            }
            if (actType === "REACTIVE_BLOCK_QUERY" && act) {
                await dfOnlineHandleReactiveBlockQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_BLOCK_ANSWER" && act) {
                if (_dfReactiveBlockWaiter) {
                    _dfReactiveBlockWaiter.resolve(!!act.blocked);
                }
                return;
            }
            if (actType === "REACTIVE_PROTECTION_QUERY" && act) {
                await dfOnlineHandleReactiveProtectQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_PROTECTION_ANSWER" && act) {
                if (_dfReactiveProtectWaiter) {
                    _dfReactiveProtectWaiter.resolve(!!act.protected || !!act.use);
                }
                return;
            }
            if (actType === "REACTIVE_CANCEL_QUERY" && act) {
                await dfOnlineHandleReactiveCancelQuery(envelope);
                return;
            }
            if (actType === "REACTIVE_CANCEL_ANSWER" && act) {
                if (_dfReactiveCancelWaiter) {
                    _dfReactiveCancelWaiter.resolve(!!act.cancelled || !!act.use);
                }
                return;
            }
            if (useSnapshot) {
                dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                deps.updateUI();
            }
            const anim = act?.anim;
            if (anim?.kind) dfOnlineQueueRemoteVisual(anim);
            dfOnlineCheckWinFromAuthority(envelope);
        }

        function dfOnlineApplyRemote(envelope) {
            if (!envelope) return;
            if (_dfResyncInProgress) {
                const t = envelope.action?.type;
                if (t === "SURRENDER") {
                    // SURRENDER sempre processa
                } else {
                    _dfPendingRemoteDuringResync.push(envelope);
                    return;
                }
            }
            // Quiet pós-reconnect: só materializa estado — sem fila de VFX
            // (senão o cliente “acelera” turnos até o presente).
            if (dfOnlineInReconnectQuiet()) {
                const quietSeq = envelope.seq != null ? (envelope.seq | 0) : null;
                if (quietSeq != null && quietSeq <= (_dfLastRemoteSeq | 0)) return;
                try {
                    if (!dfOnlineMaterializeStateDiff(envelope)) {
                        // Sem patch válido: puxa tip silencioso depois.
                        if (quietSeq != null) dfOnlineConfirmAppliedSeq(quietSeq);
                        void dfOnlineGapFillFromApplied("reconnect_quiet");
                        return;
                    }
                    if (quietSeq != null) dfOnlineConfirmAppliedSeq(quietSeq);
                    const auth = envelope.authoritativeState;
                    if (auth?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            dfOnlineReconcileSnapshot({ state: auth, full: true }, { skipPhase: true });
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                } catch (eQ) {
                    console.warn("[DF online] reconnect quiet apply", eQ);
                }
                return;
            }
            const actType = envelope.action?.type;
            const authCp = envelope.authoritativeState?.currentPlayer;
            const seq = envelope.seq != null ? (envelope.seq | 0) : null;
            // Eco do próprio ACK: ignorar. END_TURN forçado / seq adiantado: reconciliar.
            if (envelope.fromSeat === deps.dfLocalSeat()) {
                const st = deps.getState();
                const seqAhead = seq != null && seq > (_dfLastRemoteSeq | 0);
                const cpDrift = (authCp === 0 || authCp === 1)
                    && authCp !== st?.currentPlayer;
                const turnDrift = envelope.authoritativeState?.turnNumber != null
                    && (envelope.authoritativeState.turnNumber | 0) !== (st?.turnNumber | 0);
                if (actType === "END_TURN"
                    && (envelope.forced || seqAhead || cpDrift || turnDrift)
                    && (authCp === 0 || authCp === 1 || envelope.forced)) {
                    // segue — precisa sincronizar
                } else {
                    return;
                }
            }
            // Idempotência peer: descarta seq já aplicado.
            if (seq != null && seq <= _dfLastRemoteSeq) return;
            // Materializar patches antes de avançar seq / apresentar.
            if (!dfOnlineMaterializeStateDiff(envelope)) {
                // PRESENT/PLAY_VISUAL: nunca dropar o VFX — replay anim mesmo sem patch.
                if ((actType === "PLAY_VISUAL" || actType === "PRESENT")
                    && envelope.action?.anim?.kind) {
                    if (seq != null) dfOnlineConfirmAppliedSeq(seq);
                    const kind = envelope.action.anim.kind;
                    const anim = envelope.action.anim;
                    void dfOnlineEnqueuePresent(() => dfOnlineReplayAnim(anim), "fx", { kind })
                        .catch((e) => console.warn("[DF online] PRESENT gap visual", e));
                    void dfOnlineGapFillFromApplied(actType + "_stateDiff");
                    return;
                }
                // SUMMON/END_TURN: gap-fill síncrono na fila (não dropar sem recuperar).
                if (actType === "SUMMON" || actType === "END_TURN"
                    || actType === "FIELD_COMMIT" || actType === "DRAW_CARD") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlineGapFillFromApplied(actType + "_stateDiff");
                    }, actType + "-gap");
                } else {
                    void dfOnlineGapFillFromApplied(actType || "remote");
                }
                return;
            }
            if (seq != null) dfOnlineConfirmAppliedSeq(seq);

            // IA disconnect: UMA fila serial + pausas estilo vs-IA (gap ≥1,5s).
            // Sem isso: várias ações em <2s, cartas sumindo e ataque atrasado.
            // Perguntas/respostas reativas NUNCA entram nesta fila: o atacante
            // está bloqueado esperando a ANSWER, e enfileirá-la atrás das pausas
            // da IA recriaria o congelamento de vários segundos.
            const isReactiveType = typeof actType === "string"
                && actType.startsWith("REACTIVE_");
            if (envelope.serverAi && actType
                && actType !== "PLAY_VISUAL" && actType !== "PRESENT"
                && actType !== "SURRENDER" && !isReactiveType) {
                void dfOnlineEnqueueAiPresent(async () => {
                    const waitMs = (ms) => deps.wait?.(ms) || new Promise((r) => setTimeout(r, ms));
                    // O servidor já espaça as ações da IA (~2,5s). A pausa aqui só
                    // cobre rajadas (gap-fill / reconexão): espera o que falta pro
                    // gap alvo em vez de somar em cima da espera que já houve.
                    const paceGap = async (targetMs) => {
                        const since = Date.now() - (_dfAiLastPresentAt || 0);
                        const left = Math.min(targetMs, targetMs - since);
                        if (left > 0) await waitMs(left);
                        _dfAiLastPresentAt = Date.now();
                    };
                    try {
                        if (actType === "ATTACK_RESOLVE") {
                            await dfOnlinePresentRemote({
                                ...envelope,
                                action: { ...(envelope.action || {}), type: "ATTACK_RESOLVE" },
                            });
                            await paceGap(1100);
                            return;
                        }
                        if (actType === "END_TURN") {
                            // A vez volta pro humano na hora; o gate do summon da
                            // IA só atrasava o início do turno dele.
                            try {
                                await Promise.race([
                                    _dfPeerSummonGate,
                                    waitMs(600),
                                ]);
                            } catch (eEt) { /* */ }
                            await dfOnlineHandleRemoteEndTurn(envelope);
                            _dfAiLastPresentAt = Date.now();
                            return;
                        }
                        await dfOnlinePresentRemote(envelope);
                        const pauseMs = actType === "SUMMON" ? 2300
                            : (actType === "ABILITY_TARGET" || actType === "TALENT_TARGET") ? 1700
                            : actType === "ULTIMATE_PLAY" ? 2100
                            : actType === "TALENT_START" ? 1400
                            : 1500;
                        await paceGap(pauseMs);
                    } catch (eAi) {
                        console.warn("[DF online] serverAi present", actType, eAi);
                    }
                }, `serverAi:${actType}`);
                return;
            }

            if ((actType === "PLAY_VISUAL" || actType === "PRESENT") && envelope.action?.anim?.kind) {
                // Nunca aplicar snapshot de PLAY_VISUAL/PRESENT — costuma ser estado pré-efeito.
                const kind = envelope.action.anim.kind;
                // On-enter: paralelo à fila do summon (peer vê VFX junto do land).
                if (DF_PARALLEL_VISUAL_KINDS.has(kind)) {
                    if (envelope.action.anim.fieldPatches?.length) {
                        _dfLastVisualPatchAt = Date.now();
                        _dfLastVisualSeq = Math.max(_dfLastVisualSeq, envelope.seq | 0);
                    }
                    const run = async () => {
                        if (DF_ON_ENTER_VISUAL_KINDS.has(kind) && Date.now() < _dfPeerSummonUntil) {
                            try { await _dfPeerSummonGate; } catch (e) { /* */ }
                        }
                        await dfOnlineReplayAnim(envelope.action.anim);
                    };
                    if (_dfPresenter) {
                        const fxTo = _dfPresenter.resolveFxTimeout?.(kind)
                            ?? (["strong_arm", "imitar", "legado", "vinganca", "desacelerar"].includes(kind)
                                ? (_dfPresenter.FX_TIMEOUT_BUFF_MS || 6500)
                                : _dfPresenter.FX_TIMEOUT_MS);
                        void _dfPresenter.enqueue("fx", run, fxTo, { kind })
                            .catch((e) => console.warn("[DF online] parallel visual", e));
                    } else {
                        void run().catch((e) =>
                            console.warn("[DF online] parallel visual", e));
                    }
                    return;
                }
                // talent_cast / discard / board: fila board serializada.
                void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope), "board", { kind });
                return;
            }

            if (actType === "ULTIMATE_PLAY" && envelope.action) {
                const preField = deps.captureFieldForPostDestroy?.();
                const trick = (envelope.events || []).find((e) => e?.type === "TRICKERY_SWAP");
                const ultSeq = envelope.seq != null ? (envelope.seq | 0) : null;
                if (ultSeq != null) _dfUltReplaySeqs.add(ultSeq);
                const ut = envelope.action.ultimateType;
                // drawCard (Eurávia): defer auth até após cinemática — mão não “pula” a carta.
                // hook (Gancho): defer para o pull ver o campeão no campo de origem.
                // cometStarfall: defer para shatter dos mortos após o cometa (não sumir seco).
                const deferAuth = ut === "drawCard" || ut === "hook" || ut === "resurrect"
                    || ut === "summonDragon" || ut === "cometStarfall" || ut === "banish"
                    || ut === "fireAndIce" || ut === "infinitePower";
                const authState = envelope.authoritativeState;
                const applyAuth = () => {
                    if (authState?.players?.length) {
                        deps.setApplyingRemote(true);
                        try {
                            if (ut === "summonDragon") {
                                dfOnlineMarkDragonTokensFromEvents(authState, envelope.events);
                            }
                            dfOnlineReconcileSnapshot(
                                { state: authState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI(true);
                        } finally {
                            deps.setApplyingRemote(false);
                        }
                    } else if (envelope.snapshot) {
                        dfOnlineApplyIncomingSnapshot(envelope);
                    }
                };
                if (!deferAuth) applyAuth();
                const hookSteal = (envelope.events || []).find((e) => e?.type === "HOOK_STEAL");
                const runUlt = async () => {
                    try {
                        await dfOnlineReplayUltimate({
                            ...envelope.action,
                            playerId: envelope.fromSeat,
                            swapEnemyP: trick?.enemyP,
                            swapEnemyI: trick?.enemyI,
                            fromP: hookSteal?.fromP,
                            fromI: hookSteal?.fromI,
                            _events: envelope.events || [],
                        });
                    } catch (e) {
                        console.warn("[DF online] ULTIMATE_PLAY cinematic", e);
                    }
                    if (deferAuth) applyAuth();
                    if (ut === "summonDragon") {
                        const marked = [];
                        try {
                            const st = deps.getState();
                            for (const e of (envelope.events || [])) {
                                if (e?.type !== "DRAGON_TOKEN_SUMMON" && e?.visual !== "dragon_token_summon") continue;
                                const op = e.ownerP ?? e.casterIdx ?? e.playerId ?? envelope.fromSeat;
                                const field = st?.players?.[op]?.field;
                                if (!field?.length) continue;
                                let idx = e.insertIdx != null ? (e.insertIdx | 0) : field.length - 1;
                                if (e.uid) {
                                    const byUid = field.findIndex((c) => c && String(c.uid) === String(e.uid));
                                    if (byUid >= 0) idx = byUid;
                                }
                                if (field[idx]) {
                                    field[idx]._summoning = true;
                                    marked.push({ ownerP: op | 0, idx });
                                }
                            }
                        } catch (eM) { /* */ }
                        try { deps.updateUI?.(true); } catch (eU) { /* */ }
                        try {
                            await dfOnlineAnimateMarkedDragonTokens(marked);
                        } finally {
                            // Paridade com o `finally` do SUMMON: se a cinemática
                            // for abortada (timeout do apresentador) o Dragão Azul
                            // não pode ficar invisível para o adversário.
                            dfOnlineClearSummoningFlags();
                            try { deps.updateUI?.(true); } catch (eU2) { /* */ }
                            dfOnlineSweepOrphanSummoningDom();
                            dfOnlineEnsurePeerFieldVisible(
                                envelope.fromSeat,
                                envelope.authoritativeState,
                            );
                        }
                    }
                    if (preField) {
                        try {
                            deps.replayPostDestroyAfterAuthority?.(preField, { visualOnly: true });
                        } catch (e) { /* */ }
                    }
                    dfOnlineCheckWinFromAuthority(envelope);
                };
                // Serializa na fila board (timeout ≥ conjure) — evita sweep mid-cinemática.
                const ultTimeout = (ut === "drawCard" || ut === "hook" || ut === "summonDragon") ? 9000 : 8000;
                if (_dfPresenter?.enqueue) {
                    void _dfPresenter.enqueue("board", runUlt, ultTimeout);
                } else {
                    void runUlt();
                }
                return;
            }

            if (actType === "SURRENDER") {
                // Vitória/derrota imediata — não deixa o peer continuar jogando.
                if (envelope.authoritativeState?.players?.length) {
                    dfOnlineApplyAuthoritativeState(envelope);
                }
                const st = deps.getState();
                if (st?.started && st.winner == null) {
                    const from = envelope.fromSeat | 0;
                    st.winner = (from + 1) % (st.playersCount || 2);
                }
                deps.stopTimer();
                deps.floatText(
                    envelope.fromSeat === deps.dfLocalSeat()
                        ? "Você desistiu."
                        : "Oponente desistiu — você venceu!",
                    "vp center",
                    2800,
                );
                deps.checkWin({ delayMs: 0 });
                try { deps.showWin?.(); } catch (e) { /* */ }
                return;
            }

            if (actType === "SYNC_STATE" || actType === "SUMMON" || actType === "TALENT_START"
                || actType === "TALENT_DISCARD" || actType === "ABILITY_TARGET"
                || actType === "DRAW_CARD" || actType === "FIELD_COMMIT") {
                if (window.__dfCombatActive && actType === "SYNC_STATE") {
                    // Deferir SYNC durante combate — evita revive.
                    const prevSeq = window.__dfDeferredReconcile?.envelope?.seq | 0;
                    const curSeq = envelope?.seq | 0;
                    if (!window.__dfDeferredReconcile || curSeq >= prevSeq) {
                        window.__dfDeferredReconcile = { envelope, kind: "SYNC_STATE" };
                    }
                    return;
                }
                // SYNC cosmético: só presentation — sem auth clobber.
                if (actType === "SYNC_STATE") {
                    void dfOnlineEnqueuePresent(() => dfOnlinePresentRemote(envelope));
                    return;
                }
                // SUMMON/FIELD_COMMIT/…: fila serial (humano/peer). serverAi já
                // foi tratado acima — não duplicar.
                if (actType === "DRAW_CARD" || actType === "SUMMON"
                    || actType === "FIELD_COMMIT" || actType === "TALENT_START"
                    || actType === "ABILITY_TARGET") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlinePresentRemote(envelope);
                    }, actType);
                    return;
                }
                if (actType === "TALENT_DISCARD") {
                    void dfOnlineEnqueueSeqCritical(async () => {
                        await dfOnlinePresentRemote(envelope);
                    }, "TALENT_DISCARD");
                    return;
                }
                dfOnlineApplyAuthoritativeState(envelope);
                return;
            }

            if (actType === "END_TURN") {
                // Serial: espera SUMMON em voo; aplica CP no início do handler.
                void dfOnlineEnqueueSeqCritical(async () => {
                    try {
                        await Promise.race([
                            _dfPeerSummonGate,
                            deps.wait?.(1500) || new Promise((r) => setTimeout(r, 1500)),
                        ]);
                    } catch (e) { /* */ }
                    await dfOnlineHandleRemoteEndTurn(envelope);
                }, "END_TURN");
                return;
            }

            if (actType === "ATTACK_RESOLVE" && envelope.action) {
                if (seq != null) _dfLastAttackResolveSeq = Math.max(_dfLastAttackResolveSeq, seq | 0);
                dfOnlineApplyAttackResolve(envelope);
                return;
            }

            // Reação: processar NA HORA (fora da fila visual) — senão o atacante
            // espera 2–5s atrás de summon/on-enter enquanto o QUERY envelhece.
            if (actType === "REACTIVE_BLOCK_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveBlockQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_BLOCK_QUERY", e);
                        // Fail-open: não deixar o atacante no timeout.
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_BLOCK_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                blocked: false,
                                attackerIdx: envelope.action.attackerIdx,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                defenderIdx: envelope.action.defenderIdx,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_BLOCK_ANSWER" && envelope.action) {
                const blocked = !!envelope.action.blocked;
                // Resolver waiter ANTES do VFX — senão timeout fail-open.
                if (_dfReactiveBlockWaiter) {
                    _dfReactiveBlockWaiter.resolve(blocked);
                }
                void (async () => {
                    if (blocked && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("block", envelope.action);
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_PROTECTION_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveProtectQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_PROTECTION_QUERY", e);
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_PROTECTION_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                protected: false,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_PROTECTION_ANSWER" && envelope.action) {
                const used = !!envelope.action.protected || !!envelope.action.use;
                if (_dfReactiveProtectWaiter) {
                    _dfReactiveProtectWaiter.resolve(used);
                }
                void (async () => {
                    if (used && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("protect", envelope.action);
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_CANCEL_QUERY" && envelope.action) {
                void (async () => {
                    try {
                        await dfOnlineHandleReactiveCancelQuery(envelope);
                    } catch (e) {
                        console.warn("[DF online] REACTIVE_CANCEL_QUERY", e);
                        try {
                            dfOnlineSendNow({
                                type: "REACTIVE_CANCEL_ANSWER",
                                queryFrom: envelope.fromSeat,
                                use: false,
                                cancelled: false,
                                defenderPlayerId: envelope.action.defenderPlayerId,
                                attOwner: envelope.fromSeat,
                            });
                        } catch (e2) { /* */ }
                    }
                })();
                return;
            }
            if (actType === "REACTIVE_CANCEL_ANSWER" && envelope.action) {
                const cancelled = !!envelope.action.cancelled || !!envelope.action.use;
                if (_dfReactiveCancelWaiter) {
                    _dfReactiveCancelWaiter.resolve(cancelled);
                }
                void (async () => {
                    if (cancelled && envelope.fromSeat !== deps.dfLocalSeat()) {
                        if (envelope.authoritativeState?.players?.length) {
                            try {
                                dfOnlineReconcileSnapshot(
                                    { state: envelope.authoritativeState, full: true },
                                    { skipPhase: true },
                                );
                                deps.updateUI();
                            } catch (e) { /* */ }
                        }
                        await dfOnlinePlayReactivePeerFeedback("cancel", {
                            ...envelope.action,
                            casterP: envelope.action.attOwner ?? deps.dfLocalSeat(),
                        });
                    }
                })();
                return;
            }

            _dfRemoteBodyQ = _dfRemoteBodyQ.then(async () => {
                deps.setApplyingRemote(true);
                try {
                    await dfOnlineApplyRemoteBody(envelope);
                } catch (e) {
                    console.warn("[DF online] remote_action", e);
                    if (envelope.snapshot?.players?.length) {
                        try {
                            dfOnlineReconcileSnapshot(envelope.snapshot, { skipPhase: true });
                            deps.updateUI();
                        } catch (e2) {}
                    }
                } finally {
                    deps.setApplyingRemote(false);
                    document.querySelectorAll(".phase-blocker").forEach((el) => el.remove());
                    if (deps.getState().started && deps.getState().winner === null && deps.getGamePhase() === "menu") {
                        deps.setGamePhase( "normal");
                    }
                }
            });
        }

        function dfOnlineBroadcastAction(action, opts = {}) {
            if (!window.__DF_ONLINE || !dfNet?.connected || deps.getApplyingRemote()) return;
            action.playerId = deps.dfLocalSeat();
            const snap = (opts.noSnap || DF_MP_NOSNAP_TYPES.has(action.type))
                ? null
                : (opts.full ? dfEngineSnapshotFull() : dfEngineSnapshotLite());
            const isSync = action.type === "SYNC_STATE" || action.type === "PLAY_VISUAL";
            const isLocalSummon = action.type === "SUMMON" && window.__dfSummonInFlight;
            dfNet.sendAction(action, snap).then(async (ackRes) => {
                if (ackRes?.ok === false) {
                    if (!isSync) {
                        dfOnlineThrottledFailToast(ackRes.error || "REJECTED");
                    }
                    if (ackRes?.authoritativeState?.players?.length) {
                        if (!isLocalSummon) {
                            dfOnlineReconcileSnapshot(
                                { state: ackRes.authoritativeState, full: true },
                                { skipPhase: true },
                            );
                            deps.updateUI();
                        }
                    } else if (!isSync) {
                        await dfOnlineRollbackToServer();
                    }
                    return;
                }
                if (ackRes?.authoritativeState?.players?.length && !isLocalSummon) {
                    dfOnlineReconcileSnapshot(
                        { state: ackRes.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                }
            }).catch(async (e) => {
                console.warn("[DF online] sendAction", e);
                if (!isSync) {
                    dfOnlineThrottledFailToast(e?.message || "SEND_FAILED");
                    if (!isLocalSummon) await dfOnlineRollbackToServer();
                }
            });
        }

        async function startOnlineMatch(data) {
            const bootKey = [
                data?.code || dfNet?.roomCode || "",
                data?.deckSeed != null ? data.deckSeed : "",
                data?.yourSeat != null ? data.yourSeat : window.__DF_SEAT,
            ].join("|");
            // Já bootou esta partida — ignora match_start duplicado.
            if (window.__dfOnlineBootDone && _dfOnlineBootKey === bootKey) {
                return;
            }
            if (_dfOnlineBootPromise && _dfOnlineBootKey === bootKey) {
                try { await _dfOnlineBootPromise; } catch (e) { /* */ }
                return;
            }
            _dfOnlineBootKey = bootKey;
            const run = (async () => {
            hideOnlineLobbyScreen();
            window.__DF_ONLINE = true;
            window.__DF_SEAT = data.yourSeat | 0;
            window.__DF_DECK_SEED = data.deckSeed != null ? data.deckSeed : null;
            window.__dfOnlineBootDone = false;
            window.__dfOnlineBootLockInput = true;
            _dfLastRemoteSeq = 0;
            _dfSeqCriticalQ = Promise.resolve();
            try {
                window.__dfAppliedRemoteSeq = 0;
                dfNet?.resetAppliedSeq?.();
            } catch (e) { /* */ }
            dfOnlineApplyArenaFromServer(data, "match_start");
            document.body.classList.add("df-pvp-mode");
            document.body.classList.toggle("df-online-seat-1", window.__DF_SEAT === 1);
            deps.setSelectedMode( 2);
            deps.setSelectedWinPoints( 15);
            const heroIds = data.heroIds || [];
            deps.$("objective-select")?.classList.remove("active");
            // Evita 2º reset de BGM se room_state/replay já revelou a arena.
            window.__dfSkipNextBattleMusicReset = !!window.__dfMatchBoardRevealedKey
                && window.__dfMatchBoardRevealedKey === String(window.__DF_DECK_SEED || bootKey);
            deps.resetState(2, heroIds);
            // CRÍTICO: resetState deixa currentPlayer=0. Se o adversário começa,
            // reveal+warm (vários segundos) mostrava "SUA VEZ" sem relógio e
            // só depois transferia o turno — regressão de abertura.
            // Number(): JSON/"1" falhava em === 1 e caía no opener=0 (falso SUA VEZ).
            const rawFirst = data.firstPlayer ?? data.gameState?.currentPlayer ?? 0;
            const opener = Number(rawFirst) === 1 ? 1 : 0;
            try {
                const st = deps.getState();
                if (st) st.currentPlayer = opener;
            } catch (eCp0) { /* */ }
            window.__dfMatchOpeningSeat = opener;
            window.__dfOnlineMatchBoot = true;
            window.__dfMatchBoot = true;
            window.__dfOnlineSkipMaintRules = true;
            try { deps.setGamePhase?.("menu"); } catch (ePh) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan0) { /* */ }
            // Adia reconcile autoritativo: 1s com mão de 4, depois aplica gameState
            // (já com saque livre do 1º jogador no servidor).
            const pendingAuth = data.gameState?.players?.length ? data.gameState : null;
            dfOnlinePrefetchBoard();
            // Uma revelação + música por partida (deckSeed).
            const revealKey = String(window.__DF_DECK_SEED != null ? window.__DF_DECK_SEED : bootKey);
            if (window.__dfMatchBoardRevealedKey !== revealKey) {
                window.__dfMatchBoardRevealedKey = revealKey;
                deps.revealMatchBoard();
            } else {
                // Arena já visível — só garante UI sem reiniciar BGM.
                try {
                    const g = deps.$("game");
                    if (g) {
                        g.style.display = "flex";
                        g.classList.add("active", "arena-ready");
                    }
                    document.body.classList.add("df-arena-visible");
                    deps.updateUI?.(true);
                } catch (e) { /* */ }
            }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan1) { /* */ }
            // Warm em paralelo (não bloqueia) — evita desync de início entre PCs.
            try { deps.warmMatchArtsBeforeStart(); } catch (eWarm0) { /* */ }
            try { deps.updateUI?.(true); } catch (eUi) { /* */ }
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan2) { /* */ }
            deps.log("Partida online iniciada!");
            const firstName = deps.getState().players[opener]?.name || "?";
            deps.floatText(
                `🎲 ${firstName.toUpperCase()} COMEÇA!`,
                opener === deps.dfLocalSeat() ? "vp center" : "info center",
                1800,
            );
            deps.log(`🎲 Sorteio: ${firstName} começa!`);
            // Boot MP sincronizado: NÃO esperar warm de artes (varia por PC/rede
            // e atrasava só o 1º jogador). Ambos aplicam o snapshot e liberam
            // o turno no mesmo ritmo curto.
            try {
                deps.updateUI?.(true);
                // Aplica estado autoritativo JÁ (saque livre incluso no servidor).
                if (pendingAuth) {
                    const clientHand = deps.getState().players[opener]?.hand?.length || 0;
                    const authHand = pendingAuth.players?.[opener]?.hand?.length || 0;
                    const shouldAnimDraw = authHand > clientHand
                        || (authHand >= 5 && clientHand <= 4);
                    dfOnlineReconcileSnapshot({ state: pendingAuth, full: true }, { skipPhase: true });
                    try {
                        const st2 = deps.getState();
                        if (st2) st2.currentPlayer = opener;
                    } catch (eCp1) { /* */ }
                    // Animação do saque: cosmético, timeout curto e igual nos dois.
                    if (shouldAnimDraw && typeof deps.drawAnimToPlayer === "function") {
                        window.__dfUpkeepDrawInFlight = true;
                        window.__dfUpkeepDrawSeat = opener;
                        window.__dfUpkeepDrawAt = Date.now();
                        try {
                            deps.updateUI?.(true);
                            await new Promise((r) => requestAnimationFrame(() => r()));
                            deps.drawAnimToPlayer(opener);
                            const drawWait = typeof deps.waitDrawAnim === "function"
                                ? deps.waitDrawAnim()
                                : Promise.resolve();
                            await Promise.race([
                                drawWait,
                                new Promise((r) => setTimeout(r, 900)),
                            ]);
                        } finally {
                            window.__dfUpkeepDrawInFlight = false;
                            window.__dfUpkeepDrawSeat = null;
                            try {
                                document.querySelectorAll(".hand-wrap.draw-pending, .ai-back.draw-pending")
                                    .forEach((el) => el.classList.remove("draw-pending"));
                            } catch (e1) { /* */ }
                        }
                    } else {
                        deps.updateUI?.(true);
                    }
                }
                // Ritmo fixo curto (não depende de disco/rede) — os dois clientes
                // chegam ao startTurn quase juntos.
                if (typeof deps.wait === "function") await deps.wait(280);
                else await new Promise((r) => setTimeout(r, 280));
                try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan3) { /* */ }
                await deps.startTurn(opener);
                // Warm de artes em background — não bloqueia o turno jogável.
                try {
                    deps.warmMatchArtsBeforeStart?.();
                    void deps.awaitCriticalMatchArts?.(
                        window.DfLazyLoad?.isSlowNetwork?.() ? 8000 : 4000,
                    ).then(() => {
                        try { deps.updateUI?.(true); } catch (eUi2) { /* */ }
                    });
                } catch (eWarm2) { /* */ }
            } finally {
                window.__dfOnlineSkipMaintRules = false;
                window.__dfOnlineMatchBoot = false;
                window.__dfMatchBoot = false;
                window.__dfOnlineBootLockInput = false;
                window.__dfOnlineBootDone = true;
                window.__dfMatchOpeningSeat = null;
            }
            deps.updateUI();
            try { window.__dfSyncTurnBannerPedestal?.(); } catch (eBan4) { /* */ }
            })();
            _dfOnlineBootPromise = run;
            try {
                await run;
            } finally {
                if (_dfOnlineBootPromise === run) _dfOnlineBootPromise = null;
            }
        }

        function showOnlineHeroSelect() {
            window.__dfOnlinePickingHero = true;
            deps.setHeroSelectionMode( true);
            deps.setObjectiveSelectionMode( false);
            dfOnlineHeroPicked = false;
            // MP: esconder lobby/flash antes da seleção — o gradiente do lobby
            // ficava no stage e apagava a arte DESOLAÇÃO (só no fluxo online).
            const lobby = deps.$("online-lobby");
            if (lobby) {
                lobby.classList.remove("active");
                lobby.style.display = "none";
            }
            const flash = deps.$("pvp-match-flash");
            if (flash) flash.style.display = "none";
            deps.$("main")?.classList.remove("active");
            deps.$("play-menu")?.classList.remove("active");
            deps.$("df-play-mode")?.classList.remove("active");
            // Desktop tela cheia: #game.active residual bloqueava DESOLAÇÃO
            // (:not(:has(#game.active)) + sync limpava o inline).
            try {
                const g = deps.$("game");
                if (g) {
                    g.classList.remove("active", "arena-ready");
                    g.style.display = "none";
                }
                document.body.classList.remove("df-arena-visible");
                document.documentElement.classList.remove("df-combat-canvas");
                document.documentElement.setAttribute("data-df-menu-bg", "hero");
            } catch (eGame) { /* */ }
            void (async () => {
                try {
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                } catch (e) { /* */ }
                try { deps.showHeroSelect(); } catch (eShow) { /* */ }
                // Esperar #hero-select.active — sync antes disso limpa o inline
                // e deixa só o navy (#0a0608) no desktop fullscreen.
                for (let i = 0; i < 24; i++) {
                    if (deps.$("hero-select")?.classList?.contains("active")) break;
                    await new Promise((r) => setTimeout(r, 40));
                }
                try {
                    document.documentElement.setAttribute("data-df-menu-bg", "hero");
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncLetterboxBg?.();
                    await window.DfLayout?.ensureMenuBgReady?.("bg/DESOLAÇÃO.png");
                    window.dfSyncMobileBackdrop?.();
                } catch (e2) { /* */ }
            })();
            window.__dfOnlineSelectHero = async (heroId) => {
                if (dfOnlineHeroBlocked(heroId)) {
                    const hn = deps.getHeroDef(heroId)?.name || "Este campeão";
                    deps.floatText(`${hn} não pode ser selecionado — já foi escolhido pelo adversário.`, "warn center", 2800);
                    return;
                }
                window.__dfOnlinePickingHero = false;
                deps.setHeroSelectionMode( false);
                if (!dfNet?.connected) return;
                deps.setSelectedHeroId( heroId);
                deps.$("hero-select")?.classList.remove("active");
                dfOnlineHeroPicked = true;
                try {
                    await dfNet.setHero(heroId);
                    if (deps.getState().started) {
                        hideOnlineLobbyScreen();
                        return;
                    }
                    setOnlineStatus("Herói escolhido. Aguardando o adversário…");
                    const lobby = deps.$("online-lobby");
                    if (lobby) {
                        lobby.style.display = "";
                        lobby.classList.add("active");
                    }
                    if (deps.$("pvp-match-flash")) deps.$("pvp-match-flash").style.display = "none";
                } catch (e) {
                    if (e?.message === "HERO_TAKEN") {
                        deps.floatText("Este campeão já foi escolhido pelo adversário.", "warn center", 2800);
                        deps.setHeroSelectionMode( true);
                        window.__dfOnlinePickingHero = true;
                        deps.showHeroSelect();
                        return;
                    }
                    setOnlineStatus("Erro ao enviar herói: " + (e.message || e), true);
                    const lobby = deps.$("online-lobby");
                    if (lobby) {
                        lobby.style.display = "";
                        lobby.classList.add("active");
                    }
                }
            };
        }
        function getNet() { return dfNet; }

        return {
            getNet,
            dfOnlineAwaitReactiveBlock,
            dfOnlineResolveReactiveBlock,
            dfOnlineAwaitReactiveProtect,
            dfOnlineResolveReactiveProtect,
            dfOnlineAwaitReactiveCancel,
            dfOnlineResolveReactiveCancel,
            dfApplyRoomHeroState,
            dfOnlineHeroBlocked,
            dfRefreshHeroSelectLocks,
            dfPvPStopQueueTimer,
            dfPvPStartQueueTimer,
            dfPvPShowMatchFlash,
            hideOnlineLobbyScreen,
            dfEngineSnapshotFull,
            dfEngineSnapshotLite,
            dfOnlinePrefetchBoard,
            dfOnlineRemoteEndTurn,
            dfOnlineHandleRemoteEndTurn,
            dfOnlinePlayUpkeepDrawFromEvents,
            dfOnlineArmUpkeepDrawIfNeeded,
            dfOnlinePlayPoisonKillsFromEvents,
            dfOnlineCaptureRaioDuploPreHits,
            dfOnlineMarkUpkeepDrawPending,
            dfOnlineReplayPresentationEnvelope,
            dfOnlineCheckWinFromAuthority,
            dfOnlineRollbackToServer,
            dfOnlineApplyFullSnapshot,
            dfOnlineIsLocalPickPhase,
            dfOnlinePublishTalentStart,
            dfOnlinePublishTalentDiscard,
            dfOnlineCommitStatus,
            dfOnlineCommitMutations,
            dfOnlineQueueRemoteVisual,
            dfOnlineReconcileSnapshot,
            dfOnlineBroadcastUltimatePlay,
            dfOnlineReplayUltimate,
            dfOnlineShouldApplySnapshot,
            dfOnlineAbortCombatVisuals,
            dfOnlineFlushDeferredReconcile,
            dfOnlineApplyAttackResolve,
            dfOnlineScheduleBoardSync,
            dfOnlineSendNow,
            dfOnlineSendActionAwait,
            dfOnlineFlushBoardSync,
            dfOnlineApplyIncomingSnapshot,
            dfOnlineApplyAuthoritativeState,
            dfOnlineBroadcastVisual,
            dfOnlineBroadcastVisualAwait,
            dfOnlineBroadcastPresent,
            dfOnlineBroadcastState,
            dfOnlinePlayReactivePeerFeedback,
            getPresentTelemetry: () => _dfPresenter?.getTelemetry?.() || null,
            dfOnlineApplyFieldPatches,
            dfOnlinePatchPower,
            dfOnlineStatusFieldPatch,
            dfOnlineReplayAnim,
            dfOnlineReplaySummonLand,
            dfOnlineReplaySummonVisual,
            dfOnlineQueueSync,
            setOnlineStatus,
            dfClearOnlineMatchFlags,
            showOnlineLobby,
            dfPvPEnterQueue,
            dfPvPEnterRankedQueue,
            dfNetServerUrl,
            initDfNet,
            dfOnlineApplyReplaySync,
            dfTryResumePvpSession,
            dfOnlineRecoverMatchSeat,
            dfOnlineForceExitStuckMatch,
            dfOnlineResetPresentQueue,
            dfOnlineOnNetEvent,
            dfOnlineApplyRemoteBody,
            dfOnlineApplyRemote,
            dfOnlineBroadcastAction,
            startOnlineMatch,
            showOnlineHeroSelect,
        };
    }

    global.DfOnlineSession = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-menu-controller.js ===== */
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

/* ===== df-ai-controller.js ===== */
/**
 * Dragonfall — AI controller (Fase 1 arquitetura).
 * Gerado por scripts/build-phase1-*.mjs — não edite manualmente.
 */
(function (global) {
    "use strict";

    function create(deps) {
        const DfRules = deps.DfRules;
        const DfEngine = global.DfEngine;
        const isOverpower = (c) => DfRules.isOverpower(c);
        const isResistente = (c) => DfRules.isResistente(c);
        const isCrescimentoDragon = (c) => DfRules.isCrescimentoDragon(c);
        const championPrintedPower = (c) => DfRules.championPrintedPower(c);
        const pickHookTarget = (...a) => deps.pickHookTarget(...a);
        const castExplosao = (...a) => deps.castExplosao(...a);
        const gatherAllFieldTargets = (...a) => deps.gatherAllFieldTargets(...a);
        const cloneCard = (...a) => deps.cloneCard(...a);
        const playScareReturnVisual = (...a) => deps.playScareReturnVisual(...a);
        const awaitTalentSpotlight = (...a) => deps.awaitTalentSpotlight(...a);
        const paladinoRevive = (...a) => deps.paladinoRevive(...a);
        const resolveTalentDoppelganger = (...a) => deps.resolveTalentDoppelganger(...a);
        const resolveTalentFortalecer = (...a) => deps.resolveTalentFortalecer(...a);
        const resolveTalentBarreira = (...a) => deps.resolveTalentBarreira(...a);
        const resolveTalentAceleracao = (...a) => deps.resolveTalentAceleracao(...a);
        const resolveTalentBaforadaVenenosa = (...a) => deps.resolveTalentBaforadaVenenosa(...a);
        const resolveTalentMisseisMagicos = (...a) => deps.resolveTalentMisseisMagicos(...a);
        const MAX_ACTIONS = deps.MAX_ACTIONS;
        function aiHasNoHonor(c) {
            if (DfRules?.hasNoHonor) return DfRules.hasNoHonor(c);
            return !!c && !c.silenced && (c.corruptedNoHonor || c.onDestroy === "noHonor");
        }

        /** Pausa entre ações da IA — ≥1,5s após VFX/invocação (pedido do autor). */
        async function aiPause() {
            if (global.__DF_SIM_MODE) return;
            const genAtStart = deps.getMatchGeneration();
            // Espera invocação/combate/fila terminar — senão a próxima ação
            // começa “por cima” e parece simultânea.
            const drainStart = Date.now();
            while (Date.now() - drainStart < 10000) {
                if (genAtStart !== deps.getMatchGeneration()) return;
                if (!deps.getState()?.started) return;
                const summonBusy = !!(global._summonLock || global.__dfSummonInFlight
                    || global.document?.querySelector?.(".summon-fly, .ccard.is-summoning"));
                const combatBusy = !!(global.__dfCombatActive
                    || global.document?.body?.classList?.contains("df-combat-active"));
                let busBusy = false;
                try {
                    busBusy = !!global.DfPresentationBus?.isBusy?.();
                } catch (eBus) { /* */ }
                if (!summonBusy && !combatBusy && !busBusy) break;
                try {
                    const bus = global.DfPresentationBus;
                    if (bus?.isBusy?.() && typeof bus.flush === "function") {
                        await Promise.race([bus.flush(), deps.wait(500)]);
                    } else {
                        await deps.wait(120);
                    }
                } catch (eFlush) {
                    await deps.wait(120);
                }
            }
            if (genAtStart !== deps.getMatchGeneration()) return;
            const gapMs = Math.max(1500, Number(deps.AI_GAP) > 0 ? Number(deps.AI_GAP) : 1500);
            await deps.wait(gapMs);
        }

        /** Serializa turnos da IA — reinícios deixavam aiBusy órfão e lançavam turnos em paralelo. */
        let _aiTurnSerial = 0;

        let aiHardProfile = null;
        let aiHardLoadPromise = null;
        const DEVOUR_OK_CONSTANT_NAMES = new Set(["BICHINHO FOFINHO", "BANJO", "O CHEFÃO"]);
        const AI_BUFF_POWER_CAP = 4;
        function aiShouldReactiveBlock(attacker, defender) {
            if (!attacker || !defender) return false;
            let out;
            try { out = deps.combatOutcome(attacker, defender); } catch (e) { return false; }
            if (!out || !out.killD) return false;
            let valueDef = (defender.currentPower ?? defender.power ?? 1);
            if (defender.grows) valueDef += 2;
            if (defender.over) valueDef += 2;
            const attPow = attacker.currentPower ?? attacker.power ?? 1;
            return valueDef >= 2 || attPow >= 3;
        }

        function aiShouldReactiveProtect(defender) {
            if (!defender) return false;
            const pow = defender.currentPower ?? defender.power ?? 1;
            if (pow <= 1) return true;
            if (defender.grows) return true;
            if (defender.over) return true;
            return pow >= 2;
        }

        async function aiPickOnEnterResolution(ability, casterIdx, fieldIdx) {
            if (ability === "pesadelo") {
                const t = aiChoosePesadelo(casterIdx);
                return t != null ? { targetPlayerIdx: t } : null;
            }
            if (ability === "roubar") {
                const t = aiChooseRoubar(casterIdx);
                return t != null ? { targetPlayerIdx: t } : null;
            }
            if (ability === "desacelerar") {
                const t = aiChooseDesacelerar(casterIdx);
                return t != null ? { targetPlayerIdx: t } : null;
            }
            if (ability === "bolaDeFogo") {
                const t = aiResolveBolaDeFogo(casterIdx);
                return t ? { targetP: t.p, targetI: t.i } : null;
            }
            if (ability === "assassinar") {
                const t = aiResolveAssassinar(casterIdx);
                return t ? { targetP: t.p, targetI: t.i } : null;
            }
            if (ability === "mordidaVenenosa") {
                // Jamais envenenar Poder 1; também evita quem a IA pode matar neste turno.
                const avoid = aiStatusAvoidSet(casterIdx);
                const targets = deps.gatherEnemyTargets(casterIdx, (c) => {
                    if (!c || c.poisoned) return false;
                    return (c.currentPower ?? c.power ?? 0) > 1;
                }).filter((t) => !avoid.has(t.p + ":" + t.i));
                if (!targets.length) return null;
                const t = targets.sort((a, b) => {
                    const ca = deps.getState().players[a.p]?.field?.[a.i];
                    const cb = deps.getState().players[b.p]?.field?.[b.i];
                    return (cb?.currentPower ?? 0) - (ca?.currentPower ?? 0);
                })[0];
                return t ? { targetP: t.p, targetI: t.i } : null;
            }
            if (ability === "incendiar") {
                const avoid = aiStatusAvoidSet(casterIdx);
                const targets = deps.gatherEnemyTargets(casterIdx, () => true)
                    .filter((t) => !avoid.has(t.p + ":" + t.i));
                if (!targets.length) return null;
                let best = targets[0];
                let bestScore = -Infinity;
                targets.forEach((t) => {
                    const c = deps.getState().players[t.p]?.field?.[t.i];
                    if (!c) return;
                    let s = (c.currentPower || 0) * 12;
                    if (c.burning) s -= 25;
                    if (isCrescimentoDragon(c) || c.foreverGrowth) s += 18;
                    if (s > bestScore) {
                        bestScore = s;
                        best = t;
                    }
                });
                return { targetP: best.p, targetI: best.i };
            }
            if (ability === "rajadaCongelante") {
                // Já congelado → destrói (vale a pena). Congelar novo: evita quem matará neste turno.
                const avoid = aiStatusAvoidSet(casterIdx);
                const all = deps.gatherEnemyTargets(casterIdx, () => true);
                const frozen = all.filter(({ p, i }) => deps.getState().players[p]?.field?.[i]?.frozen);
                if (frozen.length) {
                    frozen.sort((a, b) => {
                        const ca = deps.getState().players[a.p]?.field?.[a.i];
                        const cb = deps.getState().players[b.p]?.field?.[b.i];
                        return (cb?.currentPower ?? 0) - (ca?.currentPower ?? 0);
                    });
                    return { targetP: frozen[0].p, targetI: frozen[0].i };
                }
                const freezeTargets = all.filter(({ p, i }) => !avoid.has(p + ":" + i));
                if (!freezeTargets.length) return null;
                freezeTargets.sort((a, b) => {
                    const ca = deps.getState().players[a.p]?.field?.[a.i];
                    const cb = deps.getState().players[b.p]?.field?.[b.i];
                    return (cb?.currentPower ?? 0) - (ca?.currentPower ?? 0);
                });
                return { targetP: freezeTargets[0].p, targetI: freezeTargets[0].i };
            }
            if (ability === "fortalecer") {
                const t = aiResolveFortalecer(casterIdx, fieldIdx);
                return t != null ? { targetI: t } : null;
            }
            if (ability === "devorar") {
                const t = aiResolveDevorar(casterIdx, fieldIdx);
                return t != null ? { targetI: t } : null;
            }
            if (ability === "transformarBichinho") {
                const t = aiResolveTransformarBichinho(casterIdx);
                return t ? { targetP: t.p, targetI: t.i, success: Math.random() < 0.90 } : null;
            }
            if (ability === "imitar") {
                const allies = deps.gatherImitableAllies(casterIdx, fieldIdx);
                const t = aiResolveImitar(casterIdx, fieldIdx, allies);
                return t ? { targetI: t.i } : null;
            }
            if (ability === "ursificacao") {
                const t = aiResolveUrsificacao(casterIdx, fieldIdx);
                return t != null ? { targetI: t } : null;
            }
            if (ability === "corromper") {
                // Nunca Corromper em quem já tem Sem Honra (nativo ou status).
                const allies = deps.gatherAllyTargets(casterIdx, fieldIdx, (c) => !aiHasNoHonor(c));
                if (!allies.length) return null;
                let best = allies[0];
                let bestScore = -Infinity;
                allies.forEach((t) => {
                    const c = deps.getState().players[t.p]?.field?.[t.i];
                    if (!c || aiHasNoHonor(c)) return;
                    let s = (c.currentPower || 0) * 10;
                    if (isOverpower(c) || isResistente(c) || isCrescimentoDragon(c)) s += 8;
                    if (s > bestScore) {
                        bestScore = s;
                        best = t;
                    }
                });
                if (bestScore === -Infinity) return null;
                return { targetI: best.i };
            }
            return null;
        }

        function aiResolveNecromancia(picks) {
            let best = picks[0], bestScore = -Infinity;
            picks.forEach(c => {
                let s = 0;
                if (c.category === "champion") s += 30 + (c.basePower || c.power || 0) * 8;
                else if (c.category === "talent") {
                    const t = c.talentEffect;
                    if (t === "bolaDeFogoTalento") s += 25;
                    else if (t === "medoTalento") s += 22;
                    else if (t === "protecaoDivina") s += 20;
                    else if (t === "bloquearAtaque") s += 18;
                    else s += 10;
                }
                if (s > bestScore) { bestScore = s; best = c; }
            });
            return best;
        }

        function aiResolveImitar(casterIdx, exclude, allyTargets) {
            if (!allyTargets || !allyTargets.length) return null;
            const onEnterPriority = {
                "assassinar": 100, "transformarBichinho": 90, "bolaDeFogo": 80,
                "devorar": 70, "fortalecer": 60, "rapidez": 55, "invokeDragon": 50, "invokeCubicDragon": 52,
                "ursificacao": 48, "guardiao": 45, "furia": 42, "fumacaToxica": 75,
                "auraDeFogo": 72, "incendiar": 76, "raioDuplo": 78, "auraAntiMagia": 50, "corromper": 38,
                "mordidaVenenosa": 68, "gritoDeGuerra": 62,
                "pesadelo": 40, "roubar": 35, "desacelerar": 30, "maldicaoSeteMares": 25,
                "imitar": 0,
            };
            const onDestroyPriority = {
                "legado": 20, "vinganca": 18, "noHonor": 15,
                "explosaoGelo": 22, "explosaoVenenosa": 21, "furiaLegado": 23,
            };
            const hasAssassinarP1 = !!(DfRules?.hasAssassinarTarget?.(deps.getState(), casterIdx));
            // Prefere copiar onEnter acionável; constantes (ex.: Resistente)
            // só quando não há outra opção.
            const withOnEnter = allyTargets.filter(t => {
                const c = deps.getState().players[t.p].field[t.i];
                return c && c.onEnter;
            });
            const pool = withOnEnter.length ? withOnEnter : allyTargets;
            const scored = pool.map(t => {
                const c = deps.getState().players[t.p].field[t.i];
                let s = 0;
                if (c.onEnter && onEnterPriority[c.onEnter] !== undefined) s += onEnterPriority[c.onEnter];
                if (c.onDestroy && onDestroyPriority[c.onDestroy] !== undefined) s += onDestroyPriority[c.onDestroy];
                // Nunca priorizar Assassinar sem Campeão P1 no oponente — jogada inútil.
                if (c.onEnter === "assassinar" && !hasAssassinarP1) s -= 220;
                if (!c.onEnter && c.abilityType === "constant") s -= 40;
                s += (c.currentPower || 0);
                return { t, s };
            }).filter((row) => {
                const c = deps.getState().players[row.t.p].field[row.t.i];
                if (c?.onEnter === "assassinar" && !hasAssassinarP1) return false;
                return true;
            });
            if (!scored.length) {
                // Sem Assassinar: ainda pode copiar outra habilidade.
                const fallback = pool.map(t => {
                    const c = deps.getState().players[t.p].field[t.i];
                    if (c?.onEnter === "assassinar") return null;
                    let s = (c?.currentPower || 0);
                    if (c?.onEnter && onEnterPriority[c.onEnter] !== undefined) s += onEnterPriority[c.onEnter];
                    if (c?.onDestroy && onDestroyPriority[c.onDestroy] !== undefined) s += onDestroyPriority[c.onDestroy];
                    return { t, s };
                }).filter(Boolean);
                fallback.sort((a, b) => b.s - a.s);
                return fallback[0]?.t || null;
            }
            scored.sort((a, b) => b.s - a.s);
            return scored[0].t;
        }

        function aiDevourTargetScore(c) {
            let s = (c.currentPower || 0) * 5;
            if (c.tapped) s += 6;
            if (c.frozen) s += 5;
            if (isOverpower(c)) s -= 8;
            if (isResistente(c)) s -= 6;
            const isInstant = c.abilityType === "instant" && !!(c.onEnter || c.onDestroy);
            const isConstant = c.abilityType === "constant";
            if (isInstant) s += 95;
            if (isConstant && DEVOUR_OK_CONSTANT_NAMES.has(c.name)) s += 18;
            else if (isConstant) s -= 120;
            return s;
        }

        function aiResolveDevorar(casterIdx, exclude) {
            const valid = deps.getState().players[casterIdx].field.map((c, i) => ({ c, i }))
                .filter(x => x.i !== exclude && !x.c.inspiracao);
            if (!valid.length) return null;
            valid.sort((a, b) => aiDevourTargetScore(b.c) - aiDevourTargetScore(a.c));
            if (aiDevourTargetScore(valid[0].c) >= -40) return valid[0].i;
            valid.sort((a, b) => aiDevourTargetScore(a.c) - aiDevourTargetScore(b.c));
            return valid[0].i;
        }

        function aiPickRitualSacrifice(pIdx, reqPow) {
            const valid = deps.getState().players[pIdx].field.map((c, i) => ({ c, i })).filter(x => x.c.currentPower === reqPow);
            if (!valid.length) return null;
            valid.sort((a, b) => {
                const sa = (a.c.tapped ? 10 : 0) + (a.c.frozen ? 10 : 0)
                    - (isOverpower(a.c) ? 8 : 0) - (isResistente(a.c) ? 6 : 0)
                    - (a.c.basePower * 2);
                const sb = (b.c.tapped ? 10 : 0) + (b.c.frozen ? 10 : 0)
                    - (isOverpower(b.c) ? 8 : 0) - (isResistente(b.c) ? 6 : 0)
                    - (b.c.basePower * 2);
                return sb - sa;
            });
            return valid[0].i;
        }

        function aiRitualSacrificeAvoidSet(pIdx) {
            const set = new Set();
            const pl = deps.getState().players[pIdx];
            if (!pl || pl.field.length >= deps.MAX_FIELD) return set;
            for (const c of pl.hand) {
                if (!c?.summonRitual) continue;
                const req = c.summonRitual;
                if (!pl.field.some((f) => f && f.currentPower === req)) continue;
                const sacIdx = aiPickRitualSacrifice(pIdx, req);
                if (sacIdx != null) set.add(pIdx + ":" + sacIdx);
            }
            return set;
        }

        function aiOpponentHasPowerAtLeast(pIdx, threshold) {
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === pIdx) continue;
                const f = deps.getState().players[p] && deps.getState().players[p].field;
                if (f && f.some(c => c && c.currentPower >= threshold)) return true;
            }
            return false;
        }

        function aiAllyBuffAllowed(pIdx, champ) {
            if (!champ) return false;
            if (champ.currentPower < AI_BUFF_POWER_CAP) return true;
            // Já está em Poder >= 4: só permite se o adversário também
            // tiver um Campeão Poder >= 4 em campo.
            return aiOpponentHasPowerAtLeast(pIdx, AI_BUFF_POWER_CAP);
        }

        function aiResolveFortalecer(casterIdx, exclude) {
            const field = deps.getState().players[casterIdx].field;
            if (!field.length) return null;
            // Maior poder inimigo não exausto/congelado
            let maxEnemyPow = 0;
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === casterIdx) continue;
                deps.getState().players[p].field.forEach(c => {
                    if (c.tapped || c.frozen) return;
                    if (c.currentPower > maxEnemyPow) maxEnemyPow = c.currentPower;
                });
            }
            let best = null, bestScore = -Infinity;
            field.forEach((c, i) => {
                if (i === exclude) return;
                // RESTRIÇÃO DE BUFF DA IA: não fortalece quem já tem
                // Poder >= 4 (salvo se o adversário também tiver um
                // Campeão Poder >= 4 — ver aiAllyBuffAllowed).
                if (!aiAllyBuffAllowed(casterIdx, c)) return;
                // (Resistente PODE receber +Poder a partir desta versão —
                // restrição antiga removida; ver allyTargetCanGainPower.)
                // NÃO pulamos congelados: o +1 de Poder é permanente e
                // continua quando o campeão descongela, então fortalecer
                // um aliado congelado segue sendo uma jogada válida e
                // muitas vezes a melhor opção (tira do Poder 1, evita
                // Assassinar/Bola de Fogo quando descongelar). Só damos
                // uma penalidade leve pra preferir não-congelados quando
                // o score restante for empatado.
                let s = c.currentPower * 2;
                if (c.frozen) s -= 3;
                // Empate com ameaça inimiga: +1 vira vencedor da próxima luta
                if (maxEnemyPow > 0 && c.currentPower === maxEnemyPow) s += 25;
                // Tirar do poder 1 (vulnerável a Assassinar / Bola de Fogo)
                if (c.currentPower === 1) s += 12;
                // Snowball: Sobrepujar fica praticamente invencível
                if (isOverpower(c)) s += 10;
                // Filhote já cresce sozinho — bônus moderado
                if (isCrescimentoDragon(c)) s += (c.name === "DRAGÃO AZUL" || c.name === "DRAGÃO CÚBICO") ? 10 : 6;
                if (s > bestScore) { bestScore = s; best = i; }
            });
            if (best != null) return best;
            // Fallback: qualquer aliado além do invocador (habilidade instantânea).
            for (let i = 0; i < field.length; i++) {
                if (i !== exclude) return i;
            }
            return null;
        }

        function aiChoosePesadelo(casterIdx) {
            // Pesadelo NÃO é acumulativa — se o alvo já estiver com
            // skipDraw=true, jogar de novo não muda nada. Então a IA
            // só escolhe entre adversários que NÃO estejam afetados.
            // Se todo mundo já tá afetado, retorna null e o caster
            // não dispara o efeito (espera passar o turno).
            let best = null,
                bestScore = -1;
            for (let i = 0; i < deps.getState().playersCount; i++) {
                if (i === casterIdx || deps.getState().players[i].skipDraw) continue;
                const score = deps.getState().players[i].vp * 10 + deps.getState().players[i].field.length;
                if (score > bestScore) { bestScore = score;
                    best = i; }
            }
            return best;
        }

        function aiHasPesadeloTarget(casterIdx) {
            return DfRules.hasPesadeloTarget(deps.getState(), casterIdx);
        }

        function aiHasRoubarTarget(casterIdx) {
            return DfRules.hasRoubarTarget(deps.getState(), casterIdx);
        }

        function aiChooseRoubar(casterIdx) {
            // Prioriza adversário com MAIS cartas (rouba quem está
            // com vantagem de carta). Em empate, prefere o humano se
            // a IA estiver perdendo no placar.
            let best = null, bestScore = -1;
            const humanAdv = deps.getPlayerVpAdvantageOverHuman(casterIdx);
            for (let i = 0; i < deps.getState().playersCount; i++) {
                if (i === casterIdx) continue;
                const handLen = deps.getState().players[i].hand?.length || 0;
                if (handLen <= 0) continue;
                let score = handLen * 10;
                if (i === 0 && aiPeeksPlayerSecrets()) score += aiHumanHandThreatTotal() * 0.35;
                if (i === 0 && humanAdv <= 0) score += 5;
                if (score > bestScore) { bestScore = score; best = i; }
            }
            return best;
        }

        function aiHasDesacelerarTarget(casterIdx) {
            return DfRules.hasDesacelerarTarget(deps.getState(), casterIdx);
        }

        function aiChooseDesacelerar(casterIdx) {
            // Prioriza o adversário com mais PV (mais ameaçador).
            // Em empate, prefere o humano se a IA está atrás no placar.
            let best = null, bestScore = -1;
            const humanAdv = deps.getPlayerVpAdvantageOverHuman(casterIdx);
            for (let i = 0; i < deps.getState().playersCount; i++) {
                if (i === casterIdx || deps.getState().players[i].skipNextAction) continue;
                let score = deps.getState().players[i].vp * 10 + deps.getState().players[i].field.length;
                if (i === 0 && humanAdv <= 0) score += 5;
                if (score > bestScore) { bestScore = score; best = i; }
            }
            return best;
        }

        function aiPickCongelarTarget(casterIdx) {
            const avoid = aiStatusAvoidSet(casterIdx);
            const enemies = [];
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === casterIdx) continue;
                deps.getState().players[ep].field.forEach((c, i) => {
                    if (!c.frozen && !avoid.has(ep + ":" + i)) {
                        enemies.push({ p: ep, i, power: c.currentPower ?? c.power ?? 0 });
                    }
                });
            }
            if (!enemies.length) return null;
            const strong = enemies.filter((e) => e.power >= 2);
            const pool = strong.length ? strong : enemies;
            pool.sort((a, b) => {
                if (a.p === 0 && b.p !== 0) return -1;
                if (a.p !== 0 && b.p === 0) return 1;
                return b.power - a.power;
            });
            return pool[0];
        }

        function aiResolveZeroAbsoluto(casterIdx) {
            let best = null, bestScore = -Infinity;
            const humanAdv = deps.getPlayerVpAdvantageOverHuman(casterIdx);
            const avoid = aiStatusAvoidSet(casterIdx);
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === casterIdx) continue;
                deps.getState().players[p].field.forEach((c, i) => {
                    // NUNCA gastar Zero Absoluto em Poder 1 que não esteja
                    // congelado: o efeito normal só CONGELA (3 rodadas) —
                    // não mata. Em Poder 1, congelar é praticamente nada
                    // (já é o pior atacante possível) e desperdiça a carta.
                    // EXCEÇÃO: se o alvo JÁ está congelado, Zero Absoluto
                    // o DESTRÓI direto — vale, mesmo em Poder 1.
                    if (c.currentPower <= 1 && !c.frozen) return;
                    // Congelar (não destruir) quem a IA já matará neste turno é desperdício.
                    if (!c.frozen && avoid.has(p + ":" + i)) return;
                    let s = c.currentPower * 4;
                    if (c.frozen) s += 80; // destrói na hora
                    if (isOverpower(c)) s += 10;
                    if (isCrescimentoDragon(c)) s += (c.name === "DRAGÃO AZUL" || c.name === "DRAGÃO CÚBICO") ? 16 : 12;
                    if (p === 0) s += 5 + Math.max(0, humanAdv) * 3;
                    if (s > bestScore) { bestScore = s; best = { p, i }; }
                });
            }
            return best;
        }

        function aiResolveBolaDeFogo(casterIdx, opts) {
            let best = null, bestScore = -Infinity;
            const minPower = (opts && opts.minPower) || 1;
            const humanAdv = deps.getPlayerVpAdvantageOverHuman(casterIdx);
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === casterIdx) continue;
                deps.getState().players[p].field.forEach((c, i) => {
                    // Filtro opcional de poder mínimo (ex.: Explosão
                    // pula Campeão de Poder 1 — pedido do usuário).
                    if (c.currentPower < minPower) return;
                    // Proteção NÃO bloqueia redução de poder por Bola de Fogo —
                    // só impede ATAQUES. Portanto, alvos com escudo são válidos.
                    let s = c.currentPower * 8;
                    if (c.currentPower === 1) s += 30;                   // mata na hora
                    if (isCrescimentoDragon(c)) s += (c.name === "DRAGÃO AZUL" || c.name === "DRAGÃO CÚBICO") ? 22 : 18;
                    if (isOverpower(c)) s += 12;
                    if (aiHasNoHonor(c) && c.currentPower > 1) s -= 6;
                    if (p === 0) s += 5 + Math.max(0, humanAdv) * 3;
                    if (s > bestScore) {
                        bestScore = s;
                        best = { p, i, pow: c.currentPower };
                    }
                });
            }
            return best;
        }

        function aiResolveAssassinar(casterIdx) {
            const valid = [];
            const humanAdv = deps.getPlayerVpAdvantageOverHuman(casterIdx);
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === casterIdx) continue;
                deps.getState().players[p].field.forEach((c, i) => {
                    // Proteção só bloqueia ataques; Assassinar é destruição.
                    if (c.currentPower !== 1) return;
                    valid.push({
                        p, i,
                        noHonor: aiHasNoHonor(c),
                        grows: isCrescimentoDragon(c),
                        over: isOverpower(c)
                    });
                });
            }
            if (!valid.length) return null;
            valid.sort((a, b) => {
                const sa = (a.grows ? 30 : 0) + (a.over ? 12 : 0) + (a.p === 0 ? 4 + Math.max(0, humanAdv) * 2 : 0);
                const sb = (b.grows ? 30 : 0) + (b.over ? 12 : 0) + (b.p === 0 ? 4 + Math.max(0, humanAdv) * 2 : 0);
                return sb - sa;
            });
            return valid[0];
        }

        function aiResolveTransformarBichinho(casterIdx) {
            // Prioridade do usuário: SEMPRE preferir um inimigo Poder ≥ 3
            // antes de qualquer Poder = 2 (transformar P3+ em bichinho
            // representa muito mais valor — o roll de 80% sucesso vira P1
            // ou menos). Só cai pra Poder = 2 se não houver nenhum ≥ 3.
            // Proteção NÃO bloqueia Transformar — só Barreira.
            let bestStrong = null, bestStrongPow = -Infinity;
            let bestWeak = null, bestWeakPow = -Infinity;
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === casterIdx) continue;
                deps.getState().players[p].field.forEach((c, i) => {
                    if (!c || c.barrier) return;
                    if ((c.currentPower ?? 0) < 2) return;
                    if (c.currentPower >= 3) {
                        if (c.currentPower > bestStrongPow) { bestStrongPow = c.currentPower; bestStrong = { p, i }; }
                    } else if (c.currentPower === 2) {
                        if (c.currentPower > bestWeakPow) { bestWeakPow = c.currentPower; bestWeak = { p, i }; }
                    }
                });
            }
            return bestStrong || bestWeak;
        }

        function aiResolveUrsificacao(casterIdx, exclude) {
            const allies = deps.gatherAllyTargets(casterIdx, exclude, () => true);
            if (!allies.length) return null;
            allies.sort((a, b) => {
                const ca = deps.getState().players[a.p].field[a.i];
                const cb = deps.getState().players[b.p].field[b.i];
                return (ca?.currentPower || 0) - (cb?.currentPower || 0);
            });
            return allies[0].i;
        }

        function aiChampionDyingSoon(targetP, targetI, aiIdx) {
            if (aiPoisonAvoidSet(aiIdx).has(targetP + ":" + targetI)) return true;
            const ch = deps.getState().players[targetP]?.field[targetI];
            if (!ch) return false;
            if (ch.poisoned && ch.poisonTurns <= 1) return true;
            return false;
        }

        function aiMedoTargetOk(targetP, targetI, aiIdx) {
            const humanSeat = deps.dfHumanSeat?.() ?? deps.dfLocalSeat?.() ?? 0;
            if (targetP !== humanSeat || targetP === aiIdx) return false;
            const ch = deps.getState().players[targetP]?.field[targetI];
            if (!ch || ch.shielded || ch.pulled) return false;
            if (ch.currentPower !== 2) return false;
            return !aiChampionDyingSoon(targetP, targetI, aiIdx);
        }

        /** Campeões que a IA pode destruir limpo neste turno — não gastar status neles. */
        function aiPoisonAvoidSet(pIdx) {
            return aiStatusAvoidSet(pIdx);
        }

        function aiStatusAvoidSet(pIdx) {
            const set = new Set();
            const pl = deps.getState().players[pIdx];
            if (!pl) return set;
            const attackers = pl.field.filter(c => c && !c.tapped && !c.frozen && !c.pulled);
            if (!attackers.length) return set;
            const aiActions = pl.actions;
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === pIdx) continue;
                deps.getState().players[ep].field.forEach((d, di) => {
                    if (!d) return;
                    const defObj = {
                        currentPower: d.currentPower,
                        abilityName: isOverpower(d) ? "Sobrepujar"
                            : (isResistente(d) ? "Resistente" : ""),
                        name: d.name
                    };
                    for (const atk of attackers) {
                        if (!deps.canAttackerTargetDefender(atk, d)) continue;
                        const isFree = deps.attackIsFree(atk);
                        const atkCost = deps.getAttackActionCost(atk, d);
                        if (!isFree && aiActions < atkCost) continue;
                        if (!aiShouldAttack(pIdx, atk, defObj, ep, isFree)) continue;
                        if (deps.combatOutcome(atk, defObj).killD) { set.add(ep + ":" + di); break; }
                    }
                });
            }
            return set;
        }

        function aiShouldCancelUltimate(casterP, hero) {
            return !!hero;
        }

        function aiGetFieldCount(pIdx) { return deps.getState().players[pIdx].field.length; }

        function aiTotalEnemyFieldCount(pIdx) {
            let n = 0;
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === pIdx) continue;
                n += aiGetFieldCount(ep);
            }
            return n;
        }

        function aiChampionSummonCost(c) {
            return DfRules.championSummonCost(c);
        }

        function aiCanPlayNecromancia(pIdx) {
            return DfRules.hasNecromanciaTarget(deps.getState(), pIdx);
        }

        function aiCanPlayTrocaInjusta(pIdx) {
            return DfRules.hasTrocaInjustaTarget(deps.getState(), pIdx);
        }

        function aiOnEnterNeedsEnemy(onEnter) {
            return DfRules.onEnterNeedsEnemy(onEnter);
        }

        /** Adversário com Campeão de Poder > 1 (Fumaça Tóxica: IA evita priorizar só-P1). */
        function aiEnemyHasNonP1Champion(pIdx) {
            return DfRules.gatherEnemyTargets(deps.getState(), pIdx, (c) => {
                const pow = c.currentPower ?? c.power ?? 0;
                return pow > 1;
            }).length > 0;
        }

        function aiSelectPlainSummon(pIdx, preferNoEnemyWaste = false) {
            const p = deps.getState().players[pIdx];
            if (p.field.length >= deps.MAX_FIELD) return null;
            const noEnemies = aiTotalEnemyFieldCount(pIdx) === 0;
            const summonCtx = DfRules.summonContextForPlayer(deps.getState(), pIdx);
            const picks = p.hand.map((c, i) => ({ c, i })).filter(({ c, i }) => {
                if (!DfRules.canSummon(deps.getState(), pIdx, i, {
                    ...summonCtx,
                    avoidEnemyOnEnterWaste: preferNoEnemyWaste && noEnemies,
                }).ok) return false;
                if (aiIsRecompensaDupla(c)) {
                    const actionsAfter = (p.actions ?? 0) - aiChampionSummonCost(c);
                    return aiRecompensaDuplaCanKillSameTurn(pIdx, c, actionsAfter);
                }
                return true;
            });
            if (!picks.length) return null;
            if (preferNoEnemyWaste || noEnemies) {
                picks.sort((a, b) =>
                    aiChampionSummonCost(a.c) - aiChampionSummonCost(b.c) ||
                    (b.c.power ?? 0) - (a.c.power ?? 0));
            } else {
                picks.sort((a, b) =>
                    aiChampionSummonCost(b.c) - aiChampionSummonCost(a.c) ||
                    (a.c.power ?? 0) - (b.c.power ?? 0));
            }
            return picks[0].i;
        }

        function aiUseTrainedProfile() {
            return !!(aiHardProfile && aiHardProfile.version >= 1);
        }

        function aiUseHardWeights() {
            return aiUseTrainedProfile();
        }

        function aiPeeksPlayerSecrets() {
            return deps.getAiDifficulty() === "hard";
        }

        function aiThreatScoreCard(card) {
            if (!card) return 0;
            let s = (card.currentPower ?? card.power ?? 0) * 3;
            if (card.category === "talent") s += 12;
            if (card.onEnter === "bolaDeFogo" || card.talentEffect === "bolaDeFogoTalento") s += 18;
            if (card.talentEffect === "explosao") s += 16;
            if (card.talentEffect === "zeroAbsoluto") s += 14;
            if (card.onEnter === "assassinar") s += 15;
            if (card.onEnter === "mordidaVenenosa") s += 14;
            if (card.onEnter === "incendiar") s += 15;
            if (card.constantEffect === "iniciativa") s += 10;
            if (card.onEnter === "gritoDeGuerra") s += 10;
            if (card.onEnter === "roubar") s += 8;
            if (card.onEnter === "pesadelo" || card.talentEffect === "medoTalento") s += 10;
            if (card.talentEffect === "bloquearAtaque") s += 20;
            if (card.talentEffect === "protecaoDivina") s += 17;
            if (card.talentEffect === "cancelarUltimate") s += 14;
            if (card.onEnter === "invokeDragon" || card.onEnter === "invokeCubicDragon") s += 16;
            if (card.summonRitual) s += 22;
            if (card.abilityName === "Sobrepujar") s += 8;
            return s;
        }

        function aiHumanHandThreatTotal() {
            if (!aiPeeksPlayerSecrets()) return 0;
            const hand = deps.getState().players[0]?.hand || [];
            return hand.reduce((sum, c) => sum + aiThreatScoreCard(c), 0);
        }

        function aiHumanHasTalentEffect(effect) {
            if (!aiPeeksPlayerSecrets() || !effect) return false;
            return (deps.getState().players[0]?.hand || []).some((c) => c.talentEffect === effect);
        }

        function aiHumanDeckNext(n) {
            if (!aiPeeksPlayerSecrets()) return [];
            const deck = deps.getState().players[0]?.deck;
            if (!deck?.length) return [];
            const count = Math.min(n, deck.length);
            return deck.slice(-count).reverse();
        }

        function aiPickStealFromHand(hand) {
            if (!hand?.length) return 0;
            if (!aiPeeksPlayerSecrets()) return Math.floor(Math.random() * hand.length);
            let best = 0, bestS = -Infinity;
            hand.forEach((c, i) => {
                const sc = aiThreatScoreCard(c);
                if (sc > bestS) { bestS = sc; best = i; }
            });
            return best;
        }

        function aiAtk(key, fallback) {
            if (aiUseHardWeights() && aiHardProfile.attack && aiHardProfile.attack[key] != null)
                return aiHardProfile.attack[key];
            return fallback;
        }

        function aiEnt(key, fallback) {
            if (aiUseHardWeights() && aiHardProfile.onEnter && aiHardProfile.onEnter[key] != null)
                return aiHardProfile.onEnter[key];
            return fallback;
        }

        function aiG(key, fallback) {
            if (aiUseHardWeights() && aiHardProfile.globals && aiHardProfile.globals[key] != null)
                return aiHardProfile.globals[key];
            return fallback;
        }

        function aiHeroWeight(heroId) {
            if (!aiUseHardWeights() || !aiHardProfile.heroes) return 1;
            const h = aiHardProfile.heroes[heroId];
            return h && h.weight != null ? h.weight : 1;
        }

        async function loadAiHardProfile() {
            if (aiHardProfile && aiHardProfile.version >= 1) return aiHardProfile;
            if (aiHardLoadPromise) return aiHardLoadPromise;
            aiHardLoadPromise = (async () => {
                try {
                    const url = new URL("ai-hard.json", location.href);
                    url.searchParams.set("_", String(Date.now()));
                    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
                    const t = setTimeout(() => { try { ctrl?.abort(); } catch (eAb) { /* */ } }, 1600);
                    const r = await fetch(url.toString(), {
                        cache: "no-store",
                        signal: ctrl?.signal,
                    });
                    clearTimeout(t);
                    if (r.ok) aiHardProfile = await r.json();
                } catch (e) { /* offline / arquivo ausente / timeout */ }
                if (!aiHardProfile || aiHardProfile.version < 1) aiHardProfile = null;
                window.__DF_AI_HARD_PROFILE = aiHardProfile;
                updateAiHardStatusHint();
                return aiHardProfile;
            })();
            return aiHardLoadPromise;
        }

        function updateAiHardStatusHint() {
            /* Perfil da IA (partidas simuladas etc.) não é exibido ao jogador. */
            const onAiModeScreen = deps.$("ai-mode-select")?.classList.contains("active");
            if (onAiModeScreen) loadAiHardProfile();
        }

        function setAiDifficulty(diff) {
            deps.setAiDifficulty("hard");
            window.__DF_AI_DIFFICULTY = "hard";
            try { localStorage.setItem(deps.AI_DIFF_STORAGE, "hard"); } catch (e) {}
            deps.setAiModeSelectionIdx(1);
            updateAiModeSelection();
            updateAiHardStatusHint();
            loadAiHardProfile();
        }

        function updateAiModeSelection() {
            const hBtn = deps.$("btn-ai-mode-hard");
            if (hBtn) hBtn.classList.toggle("selected", true);
            updateAiHardStatusHint();
        }

        function showAiModeSelect() {
            if (global.DfTrainingSetup?.open) {
                void global.DfTrainingSetup.open({ fromHub: false });
                return;
            }
            // Tela legada aposentada — aguarda o lobby único carregar.
            let tries = 0;
            const timer = setInterval(() => {
                if (global.DfTrainingSetup?.open) {
                    clearInterval(timer);
                    void global.DfTrainingSetup.open({ fromHub: false });
                } else if (++tries > 40) {
                    clearInterval(timer);
                    try { global.location.reload(); } catch (e) { /* */ }
                }
            }, 50);
        }

        async function startAiDuel(diff) {
            // Entrada vs-IA: force limpa flags MP (partida online já não está ativa).
            try {
                window.__dfOnline?.dfClearOnlineMatchFlags?.({ leaveNet: true, force: true });
            } catch (e) { /* */ }
            try { deps.dfEnsureLocalPlayMode?.(); } catch (e) { /* */ }
            setAiDifficulty("hard");
            await loadAiHardProfile();
            deps.$("ai-mode-select").classList.remove("active");
            deps.setSelectedMode( 2);
            deps.showHeroSelect();
        }

        function aiIsRecompensaDupla(c) {
            if (!c || c.silenced) return false;
            if (DfRules?.combatVictoryPointReward) {
                return DfRules.combatVictoryPointReward(c) >= 2;
            }
            return c.constantEffect === "recompensaDupla"
                || c.abilityName === "Recompensa Dupla";
        }

        /**
         * Manual §17: GAMER/ARCADIA só devem ser invocados se puderem
         * destruir em combate no mesmo turno (ações restantes + alvo limpo).
         */
        function aiRecompensaDuplaCanKillSameTurn(pIdx, card, actionsAfter) {
            if (!card || !aiIsRecompensaDupla(card)) return false;
            const acts = actionsAfter ?? 0;
            if (acts < 1) return false;
            const st = deps.getState();
            for (let ep = 0; ep < st.playersCount; ep++) {
                if (ep === pIdx) continue;
                const field = st.players[ep]?.field || [];
                for (let di = 0; di < field.length; di++) {
                    const d = field[di];
                    if (!d || d.shielded || d.pulled) continue;
                    if (!deps.canAttackerTargetDefender(card, d)) continue;
                    const isFree = deps.attackIsFree(card);
                    const cost = deps.getAttackActionCost(card, d);
                    if (!isFree && acts < cost) continue;
                    if (!aiShouldAttack(pIdx, card, d, ep, isFree)) continue;
                    let outcome;
                    try { outcome = deps.combatOutcome(card, d); } catch (e) { continue; }
                    if (outcome?.killD && !outcome?.killA) return true;
                }
            }
            return false;
        }

        function aiOpponentNextPassiveVp(enemyP) {
            const n = aiGetFieldCount(enemyP);
            if (DfRules?.computePassiveVpGain) return DfRules.computePassiveVpGain(n);
            return Math.min(Math.max(0, n), 2);
        }

        function aiOwnNextPassiveVp(pIdx) {
            const n = aiGetFieldCount(pIdx);
            if (DfRules?.computePassiveVpGain) return DfRules.computePassiveVpGain(n);
            return Math.min(Math.max(0, n), 2);
        }

        function aiHumanSeat() {
            return typeof deps.dfHumanSeat === "function" ? deps.dfHumanSeat() : 0;
        }

        /** Humano a ≤2 PV da vitória contando passivo do próximo turno (+1 kill possível). */
        function aiHumanNearWin(pIdx) {
            const human = aiHumanSeat();
            if (human === pIdx) return false;
            const st = deps.getState();
            const hp = st.players[human];
            if (!hp) return false;
            const nextPassive = aiOpponentNextPassiveVp(human);
            return (hp.vp + nextPassive + 1) >= st.winPoints;
        }

        function aiEvaluatePosition(pIdx) {
            const st = deps.getState();
            const pl = st.players[pIdx];
            const human = aiHumanSeat();
            const raceMul = aiG("vpRaceMul", 1);
            let score = (pl?.vp || 0) * 12 * raceMul;
            score += aiOwnNextPassiveVp(pIdx) * 18 * raceMul;
            if (human !== pIdx) {
                score -= aiOpponentNextPassiveVp(human) * 22 * raceMul;
                score -= (st.players[human]?.vp || 0) * 10 * raceMul;
                score += (aiGetFieldCount(pIdx) - aiGetFieldCount(human)) * 6;
                if (aiPeeksPlayerSecrets()) {
                    score -= aiHumanHandThreatTotal() * 0.35;
                }
            }
            return score;
        }

        /**
         * Bônus por negar PV passivo do adversário ao matar um campeão.
         * near-win humano: crítico (acima de qualquer summon de encher campo).
         */
        function aiDenyPassiveScore(pIdx, tgtP, tgtI) {
            if (tgtP === pIdx) return 0;
            const st = deps.getState();
            const enemy = st.players[tgtP];
            if (!enemy) return 0;
            const beforeN = enemy.field.length;
            const beforePassive = DfRules?.computePassiveVpGain
                ? DfRules.computePassiveVpGain(beforeN)
                : Math.min(beforeN, 2);
            const afterPassive = DfRules?.computePassiveVpGain
                ? DfRules.computePassiveVpGain(Math.max(0, beforeN - 1))
                : Math.min(Math.max(0, beforeN - 1), 2);
            const denied = beforePassive - afterPassive;
            let score = denied * aiAtk("denyPassivePerVp", 80);
            if (beforeN === 1) score += aiAtk("denyLastChampionBonus", 120);
            else if (beforeN === 2 && denied > 0) score += aiAtk("denyCapDropBonus", 55);
            const human = aiHumanSeat();
            if (tgtP === human) {
                const nearWin = (enemy.vp + beforePassive + 1) >= st.winPoints
                    || (enemy.vp + 1) >= st.winPoints;
                if (nearWin) score += aiAtk("denyNearWinBonus", 2200);
                else if (enemy.vp + beforePassive >= st.winPoints - 2) {
                    score += aiAtk("denyCloseWinBonus", 400);
                }
            }
            return score;
        }

        function aiShouldAttack(pIdx, attacker, defender, defenderP, isFree) {
            const overA = isOverpower(attacker);
            const overD = isOverpower(defender);
            const aPow = attacker.currentPower ?? attacker.power ?? 0;
            const dPow = defender.currentPower ?? defender.power ?? 0;

            if (aPow < dPow) return false;
            // Manual §17: IA jamais ataca campeão de Poder igual com Sobrepujar
            // (habilidade ou Guerra) — o adversário ganha PV sem perder o defensor.
            if (overD && aPow <= dPow) return false;
            if (aPow === dPow && overD) return false;
            if (aPow === dPow && overA && overD) return false;

            if (aPow > dPow) return true;
            if (aPow === dPow && overA && !overD) return true;

            if (aPow === dPow && !overA && !overD) {
                // Troca mútua (ambos morrem, 0 PV): só quando vantajosa.
                const fc = aiGetFieldCount(pIdx);
                const human = aiHumanSeat();
                const enemyFc = defenderP != null ? aiGetFieldCount(defenderP) : 0;
                const humanAdvantage = deps.getPlayerVpAdvantageOverHuman(pIdx);
                const isHumanTarget = defenderP === human;
                const defGrowsDangerous = isCrescimentoDragon(defender) && dPow >= 2;
                const nearWin = isHumanTarget && aiHumanNearWin(pIdx);
                const aiNearWin = aiVpNeeded(pIdx) <= 2;
                const boardLead = fc > enemyFc;

                if (fc <= 1 && !nearWin) return false;

                const tradeMul = aiG("tradeAcceptMul", 1);
                const strictTrade = tradeMul < 0.92;
                const minTradePow = strictTrade ? (tradeMul < 0.82 ? 4 : 3) : 2;

                if (isFree && (dPow >= 2 || isHumanTarget || defGrowsDangerous)) return true;
                if (dPow >= minTradePow) return true;
                if (defGrowsDangerous) return true;
                // Campo maior + troca ainda deixa vantagem ou passivo ≥1.
                if (boardLead && fc >= 2 && (fc - 1) >= enemyFc) return true;
                if (boardLead && fc >= 3 && (fc - 1) >= 1) return true;
                if (nearWin && isHumanTarget) return true;
                if (aiNearWin && isHumanTarget && fc >= 2) return true;
                if (isHumanTarget && humanAdvantage >= (strictTrade ? 3 : 2) && fc >= 2) return true;
                if (fc >= 3 && (dPow >= 2 || !!defender.onDestroy || defGrowsDangerous)) return true;
                if (fc >= 5 && !strictTrade) return true;

                return false;
            }

            return false;
        }

        function aiVpNeeded(pIdx) {
            return Math.max(0, deps.getState().winPoints - deps.getState().players[pIdx].vp);
        }

        function aiAttackVpGain(attChamp, defChamp) {
            if (!attChamp || !defChamp) return 0;
            const outcome = deps.combatOutcome(attChamp, defChamp);
            if (!outcome.killD || outcome.killA) return 0;
            if (aiHasNoHonor(defChamp)) return 0;
            if (DfRules?.combatVictoryPointReward) {
                return DfRules.combatVictoryPointReward(attChamp) || 0;
            }
            return aiIsRecompensaDupla(attChamp) ? 2 : 1;
        }

        function aiAttackWinsGame(pIdx, move) {
            const pl = deps.getState().players[pIdx];
            const att = pl.field[move?.atkIdx];
            const def = deps.getState().players[move?.tgtP]?.field[move?.tgtI];
            if (!att || !def) return false;
            return pl.vp + aiAttackVpGain(att, def) >= deps.getState().winPoints;
        }

        function aiHasUrgentDenyOrKill(pIdx) {
            const move = aiSelectBestAttack(pIdx);
            if (!move) return false;
            if (aiAttackWinsGame(pIdx, move)) return true;
            const pl = deps.getState().players[pIdx];
            const att = pl.field[move.atkIdx];
            const def = deps.getState().players[move.tgtP]?.field[move.tgtI];
            if (!att || !def) return false;
            const outcome = deps.combatOutcome(att, def);
            if (!(outcome.killD && !outcome.killA)) return false;
            if (aiDenyPassiveScore(pIdx, move.tgtP, move.tgtI) >= 400) return true;
            if (aiHumanNearWin(pIdx) && move.tgtP === aiHumanSeat()) return true;
            return false;
        }

        async function aiExecuteAttack(pIdx, attackMove) {
            const p = deps.getState().players[pIdx];
            const attChamp = p.field[attackMove.atkIdx];
            const defChamp = deps.getState().players[attackMove.tgtP]?.field[attackMove.tgtI];
            const isFree = deps.attackIsFree(attChamp);
            const aiCost = deps.getAttackActionCost(attChamp, defChamp);
            if (!isFree && p.actions < aiCost) return false;
            if (!isFree) p.actions -= aiCost;
            await deps.resolveCombat(pIdx, attackMove.atkIdx, attackMove.tgtP, attackMove.tgtI);
            await aiPause();
            return true;
        }

        function aiLegalActions(pIdx) {
            const engine = global.DfEngine || DfEngine;
            if (!engine?.listLegalActions) {
                console.warn("[DF aiLegalActions] DfEngine indisponível");
                return [];
            }
            return engine.listLegalActions(deps.getState(), pIdx, {
                strictFumacaToxica: true,
                avoidEnemyOnEnterWaste: aiTotalEnemyFieldCount(pIdx) === 0,
                allowWastedOnEnter: false,
            });
        }

        function aiActionKey(action) {
            const t = action?.type || "";
            if (t === "SUMMON") return `SUMMON:${action.handIdx}`;
            if (t === "ATTACK_RESOLVE") {
                return `ATTACK:${action.attackerIdx}:${action.defenderPlayerId}:${action.defenderIdx}`;
            }
            return t;
        }

        function aiPrepTurn(pIdx) {
            deps.ensureTurnReady?.();
            // NÃO forceReset a cada ação — isso abortava combate/invocação e
            // fazia a IA parecer “instantânea”. Só limpa órfãos se estiver
            // travado sem cena ativa.
            const bus = global.DfPresentationBus;
            const combatLive = !!(global.__dfCombatActive
                || global.document?.body?.classList?.contains("df-combat-active"));
            if (!combatLive && bus?.isBusy?.()) {
                const stuck = String(bus.current?.() || "");
                // Só destrava se não for combate/destruição em andamento.
                if (!stuck.startsWith("combat") && !stuck.startsWith("destruction")) {
                    deps.dfEnsurePresentationUnblocked?.("ai-turn-stale");
                }
            }
            window._summonLock = false;
            deps.setPendingSummon(null);
            deps.setTargetData({});
            const phase = deps.getGamePhase();
            if (phase !== "game-over") {
                deps.setGamePhase("normal");
            }
        }

        function aiPickBestLegalActionExcluding(pIdx, minScore, excluded) {
            const skip = excluded || new Set();
            const legal = aiLegalActions(pIdx).filter((a) => {
                const t = a.type;
                if (t === "END_TURN" || t === deps.DfProtocol?.ACTION_TYPES?.END_TURN) return false;
                return !skip.has(aiActionKey(a));
            });
            let best = null;
            let bestScore = -Infinity;
            for (const a of legal) {
                const s = aiScoreLegalAction(pIdx, a);
                if (s > bestScore) {
                    bestScore = s;
                    best = a;
                }
            }
            if (!best || bestScore < minScore) return null;
            return best;
        }

        async function aiPerformBestAction(pIdx, minScore, excluded) {
            const tried = excluded || new Set();
            for (let attempt = 0; attempt < 10; attempt++) {
                aiPrepTurn(pIdx);
                const threshold = attempt < 6 ? minScore : 1;
                const action = aiPickBestLegalActionExcluding(pIdx, threshold, tried);
                if (!action) return false;
                tried.add(aiActionKey(action));
                const ok = await aiExecuteLegalAction(pIdx, action);
                if (ok) return true;
            }
            return false;
        }

        function aiScoreSummonHandIdx(pIdx, handIdx) {
            // Kill/deny urgente: não compete com summons de "encher campo".
            if (aiHasUrgentDenyOrKill(pIdx)) return -50;
            const p = deps.getState().players[pIdx];
            const card = p?.hand?.[handIdx];
            if (!card || card.category !== "champion") return -9999;
            const cost = aiChampionSummonCost(card);
            const actionsAfter = (p.actions ?? 0) - cost;
            if (aiIsRecompensaDupla(card)
                && !aiRecompensaDuplaCanKillSameTurn(pIdx, card, actionsAfter)) {
                return -9999;
            }
            const best = aiSelectBestSummon(pIdx);
            if (best === handIdx) {
                return 800 + (aiIsRecompensaDupla(card) ? 80 : 0);
            }
            const plain = aiSelectPlainSummon(pIdx, true);
            if (plain === handIdx) return 400;
            const fc = aiGetFieldCount(pIdx);
            const enemyFc = aiTotalEnemyFieldCount(pIdx);
            // Campo vazio / sem inimigos: qualquer summon legal ≫ compra.
            if (fc === 0 || enemyFc === 0) {
                return 520 + (card.currentPower ?? card.power ?? 0) * 4;
            }
            if (fc >= 2) return -20;
            return (card.currentPower ?? card.power ?? 0) * 3;
        }

        function aiScoreAttackAction(pIdx, action) {
            const pl = deps.getState().players[pIdx];
            const att = pl?.field?.[action.attackerIdx];
            const def = deps.getState().players[action.defenderPlayerId]?.field?.[action.defenderIdx];
            if (!att || !def || def.shielded || def.pulled) return -9999;
            if (!deps.canAttackerTargetDefender(att, def)) return -9999;
            const isFree = deps.attackIsFree(att);
            const cost = deps.getAttackActionCost(att, def);
            if (!isFree && (pl.actions ?? 0) < cost) return -9999;
            if (!aiShouldAttack(pIdx, att, def, action.defenderPlayerId, isFree)) return -9999;
            const move = {
                atkIdx: action.attackerIdx,
                tgtP: action.defenderPlayerId,
                tgtI: action.defenderIdx,
            };
            if (aiAttackWinsGame(pIdx, move)) return 10000;
            const outcome = deps.combatOutcome(att, def);
            const deny = (outcome.killD && !outcome.killA)
                ? aiDenyPassiveScore(pIdx, move.tgtP, move.tgtI)
                : 0;
            if (deny >= 2000) return 2500 + deny;
            if (deny >= 400) return 1200 + deny;
            const best = aiSelectBestAttack(pIdx);
            const isBest = best && best.atkIdx === move.atkIdx
                && best.tgtP === move.tgtP && best.tgtI === move.tgtI;
            if (outcome.killD && !outcome.killA) {
                const vpGain = aiAttackVpGain(att, def);
                let score = isBest ? 920 : 700;
                score += vpGain * 40;
                score += deny;
                score += Math.max(0, aiEvaluatePosition(pIdx) * 0.15);
                if (aiIsRecompensaDupla(att)) score += 80;
                return score;
            }
            if (isBest) return 900;
            return 40 + Math.max(0, deny);
        }

        function aiScoreLegalAction(pIdx, action) {
            const T = deps.DfProtocol?.ACTION_TYPES || {};
            if (action.type === T.END_TURN || action.type === "END_TURN") return -9999;
            if (action.type === T.DRAW_CARD || action.type === "DRAW_CARD") {
                const p = deps.getState().players[pIdx];
                if (!p.deck.length || p.hand.length >= deps.MAX_HAND) return -9999;
                if (aiHasUrgentDenyOrKill(pIdx)) return -100;
                if (aiHumanNearWin(pIdx)) return -80;
                // Com summon legal e campo vazio (ou board inimigo vazio): não preferir compra.
                const fc = aiGetFieldCount(pIdx);
                const enemyFc = aiTotalEnemyFieldCount(pIdx);
                if ((fc === 0 || enemyFc === 0)
                    && (aiSelectBestSummon(pIdx) != null || aiSelectPlainSummon(pIdx, true) != null)) {
                    return -40;
                }
                if (!aiSelectBestAttack(pIdx) && aiGetFieldCount(pIdx) >= deps.MAX_FIELD) return 14;
                return 8;
            }
            if (action.type === T.SUMMON || action.type === "SUMMON") {
                return aiScoreSummonHandIdx(pIdx, action.handIdx);
            }
            if (action.type === T.ATTACK_RESOLVE || action.type === "ATTACK_RESOLVE") {
                return aiScoreAttackAction(pIdx, action);
            }
            return 0;
        }

        function aiPickBestLegalAction(pIdx, minScore = 5) {
            const legal = aiLegalActions(pIdx).filter((a) => {
                const t = a.type;
                return t !== "END_TURN" && t !== deps.DfProtocol?.ACTION_TYPES?.END_TURN;
            });
            let best = null;
            let bestScore = -Infinity;
            for (const a of legal) {
                const s = aiScoreLegalAction(pIdx, a);
                if (s > bestScore) {
                    bestScore = s;
                    best = a;
                }
            }
            if (!best || bestScore < minScore) return null;
            return best;
        }

        async function aiExecuteLegalAction(pIdx, action) {
            const T = deps.DfProtocol?.ACTION_TYPES || {};
            const isSummon = action.type === T.SUMMON || action.type === "SUMMON";
            const summonCard = isSummon
                ? deps.getState().players[pIdx]?.hand?.[action.handIdx]
                : null;
            const result = await deps.dfDispatch(
                { ...action, playerId: pIdx },
                {
                    fromHuman: false,
                    broadcast: false,
                    avoidEnemyOnEnterWaste: aiTotalEnemyFieldCount(pIdx) === 0,
                },
            );
            if (!result?.ok) {
                console.warn("[DF aiExecuteLegalAction]", action?.type, result?.error || result?.phase);
                return false;
            }
            if (action.type === T.DRAW_CARD || action.type === "DRAW_CARD") {
                deps.log(`${deps.getState().players[pIdx].name} comprou uma carta.`);
            } else if (isSummon && summonCard?.onEnter === "gritoDeGuerra") {
                await aiPerformGritoFuryChain(pIdx);
            } else if (isSummon) {
                // Após qualquer invocação: se sobram ações, atacar (esp. Recompensa Dupla).
                await aiPerformPostSummonAttackChain(pIdx, {
                    preferRecompensaDupla: aiIsRecompensaDupla(summonCard),
                    summonedName: summonCard?.name || null,
                });
            }
            return true;
        }

        function aiSelectBestAttack(pIdx) {
            const pl = deps.getState().players[pIdx];
            const hero = pl.heroDef || deps.getHeroDef(pl.heroId);
            const maxUlt = deps.getMaxUltimateUses(pl.heroId);
            const isPirateWithUltimate = hero && hero.id === 'pirate' &&
                pl.ultimateUses < maxUlt && !pl.usedUltimateThisTurn;

            let attackers = deps.getState().players[pIdx].field.map((c, i) => ({ c, i })).filter(x => !x.c.tapped && !x.c
                .frozen && !x.c.pulled);
            if (!attackers.length) return null;

            if (isPirateWithUltimate && attackers.length >= 2) {
                attackers.sort((a, b) => b.c.currentPower - a.c.currentPower);
                attackers = attackers.slice(1);
                if (!attackers.length) return null;
            }

            const enemies = [];
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === pIdx) continue;
                deps.getState().players[ep].field.forEach((c, i) => {
                    if (c.shielded || c.pulled) return;
                    enemies.push({
                        p: ep, i,
                        power: c.currentPower,
                        name: c.name,
                        over: isOverpower(c),
                        noHonor: aiHasNoHonor(c),
                        grows: isCrescimentoDragon(c),
                        resistente: isResistente(c)
                    });
                });
            }
            if (!enemies.length) return null;
            const humanAdvantage = deps.getPlayerVpAdvantageOverHuman(pIdx);
            const fc = aiGetFieldCount(pIdx);
            const aiActions = deps.getState().players[pIdx].actions;

            // REGRA: campeão com Sobrepujar DEVE atacar quando pode.
            // Restringe o pool de atacantes só pros Sobrepujar primeiro;
            // se nenhum tiver alvo viável (passou pelo aiShouldAttack
            // + ofereceu algum score), aí sim cai pra todos os outros.
            const sobrepujarAttackers = attackers.filter(a => isOverpower(a.c));
            const searchPools = sobrepujarAttackers.length
                ? [sobrepujarAttackers, attackers.filter(a => !isOverpower(a.c))]
                : [attackers];

            let bestScore = -Infinity, bestMove = null;
            for (const pool of searchPools) {
                bestScore = -Infinity; bestMove = null;
            for (const atk of pool) {
                const aPow = atk.c.currentPower;
                const overA = isOverpower(atk.c);
                const isFree = deps.attackIsFree(atk.c);
                for (const def of enemies) {
                    if (!deps.canAttackerTargetDefender(atk.c, deps.getState().players[def.p].field[def.i])) continue;
                    // RESISTENTE: custa 2 Ações; IA precisa ter o orçamento.
                    const atkCost = deps.getAttackActionCost(atk.c, deps.getState().players[def.p].field[def.i]);
                    if (!isFree && aiActions < atkCost) continue;
                    const defCard = deps.getState().players[def.p].field[def.i];
                    if (!defCard) continue;
                    if (!aiShouldAttack(pIdx, atk.c, defCard, def.p, isFree)) continue;
                    const outcome = deps.combatOutcome(atk.c, defCard);
                    let score = 0;

                    if (outcome.killD && !outcome.killA) {
                        const vpGain = aiAttackVpGain(atk.c, defCard);
                        // Vitória limpa: ganhamos PV (Recompensa Dupla = 2) e
                        // mantemos o campeão. Excelente.
                        score += aiAtk("cleanKillBase", 30) + def.power * aiAtk("cleanKillPerDefPower", 10);
                        score += vpGain * aiAtk("vpGainMul", 22);
                        score += aiDenyPassiveScore(pIdx, def.p, def.i);
                        if (fc === 1) score += aiAtk("lastChampionBonus", 45);
                        if (def.grows) score += aiAtk("growingDragonBonus", 18);
                        if (def.over) score += aiAtk("sobrepujarDefBonus", 12);
                        if (def.noHonor) score -= aiAtk("noHonorPenalty", 18);
                        if (def.p === 0) score += aiAtk("freeAttackBonus", 8) + Math.max(0, humanAdvantage) * 4;
                        if (overA) score += aiEnt("sobrepujar", 6);
                    if (atk.c.guerraBuff) score += 85;
                        if (aiIsRecompensaDupla(atk.c)) score += aiAtk("recompensaDuplaAttackBonus", 55);
                        if (aPow >= 3) score += 5;
                        score += Math.max(0, aPow - def.power - 1) * 12;
                        const vpNeed = aiVpNeeded(pIdx);
                        if (vpNeed > 0 && vpNeed <= 3) score += aiAtk("vpNeedBonus", 35);
                        if (pl.vp + vpGain >= deps.getState().winPoints) score += aiAtk("winNowBonus", 500);
                    } else if (outcome.killD && outcome.killA) {
                        const tradeMul = aiG("tradeAcceptMul", 1);
                        score += def.power * aiAtk("tradeKillPerPower", 5) * tradeMul;
                        score += aiDenyPassiveScore(pIdx, def.p, def.i) * 0.45 * tradeMul;
                        if (def.grows) score += 14 * tradeMul;
                        if (def.over) score += 10 * tradeMul;
                        if (def.noHonor) score -= aiAtk("tradePenalty", 12);
                        if (def.p === 0 && humanAdvantage >= 2) score += 12 * tradeMul;
                        if (def.p === 0 && aiHumanNearWin(pIdx)) score += 40 * tradeMul;
                        if (aPow >= 3) score -= 14;
                        if (overA) score -= 12;
                    }
                    if (isFree) score += aiAtk("freeAttackBonus", 8);
                    if (def.p === 0 && humanAdvantage >= 1) score += 5;
                    if (aiPeeksPlayerSecrets() && def.p === 0) {
                        const winsNow = pl.vp + aiAttackVpGain(atk.c, deps.getState().players[def.p].field[def.i]) >= deps.getState().winPoints;
                        if (!winsNow) {
                            if (aiHumanHasTalentEffect("bloquearAtaque")) score -= 24;
                            if (aiHumanHasTalentEffect("protecaoDivina")) score -= 18;
                        }
                        const nextDraw = aiHumanDeckNext(1)[0];
                        if (nextDraw && aiThreatScoreCard(nextDraw) >= 20) score += 6;
                    }
                    // Empate sobrepujar (ninguém morre) já barrado em aiShouldAttack.

                    // RESISTENTE / Pesado Demais custam 2 Ações: penaliza levemente.
                    if (atkCost >= 2 && !isFree) score -= 8;
                    score *= aiG("attackScoreMul", 1);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { atkIdx: atk.i, tgtP: def.p, tgtI: def.i, resistente: !!def.resistente };
                    }
                }
            }
                // Achou ataque viável neste pool? Para aqui — não cai
                // pro pool sem-Sobrepujar (a regra é: Sobrepujar ataca
                // primeiro, sempre que tiver alvo válido).
                if (bestMove) break;
            }
            return bestMove;
        }

        function aiSelectBestSummon(pIdx) {
            const p = deps.getState().players[pIdx];
            const fcSelf = aiGetFieldCount(pIdx);
            let enemyFc = 0;
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === pIdx) continue;
                enemyFc += aiGetFieldCount(ep);
            }
            const summonCtx = DfRules.summonContextForPlayer(deps.getState(), pIdx);
            const affordable = p.hand.map((c, i) => ({ c, i })).filter((x) =>
                x.c.category === "champion" &&
                DfRules.canSummon(deps.getState(), pIdx, x.i, {
                    ...summonCtx,
                    strictFumacaToxica: true,
                }).ok);
            if (!affordable.length) return null;
            const fc = fcSelf;
            const humanAdvantage = deps.getPlayerVpAdvantageOverHuman(pIdx);
            const needPassiveVp = humanAdvantage <= -2 || p.vp < deps.getState().players[0].vp - 2
                || fc < 2;
            const needDeny = aiHumanNearWin(pIdx) || aiHasUrgentDenyOrKill(pIdx);
            const needTempoKill = !!aiSelectBestAttack(pIdx);
            const enemyHasP1 = (() => {
                for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                    if (ep === pIdx) continue;
                    if (deps.getState().players[ep].field.some((c) =>
                        (c.currentPower ?? c.power ?? 0) === 1)) return true;
                }
                return false;
            })();
            let bestScore = -Infinity,
                bestIdx = null;
            const summonMul = aiG("summonScoreMul", 1);
            for (const item of affordable) {
                const cost = aiChampionSummonCost(item.c);
                const actionsAfter = (p.actions ?? 0) - cost;
                let score = item.c.currentPower * 4 * summonMul;
                // Se há kill limpo agora e o summon gasta as ações do ataque, penaliza.
                if (needTempoKill && actionsAfter < 1 && !item.c.summonRitual) {
                    score -= aiEnt("summonBlocksKillPenalty", 55);
                }
                if (needDeny && actionsAfter < 1 && cost >= 2) {
                    score -= aiEnt("summonBlocksDenyPenalty", 90);
                }
                if (item.c.onEnter === "invokeDragon" || item.c.onEnter === "invokeCubicDragon")
                    score += aiEnt("invokeDragon", 10);
                if (item.c.onEnter === "rapidez") {
                    score += aiEnt("rapidez", 12);
                    // Rapidez libera +1 ação → ataque no mesmo turno.
                    if (enemyFc > 0 && (actionsAfter + 1) >= 1) {
                        score += aiEnt("rapidezAttackFollowUp", 28);
                    }
                }
                if (item.c.onEnter === "fortalecer" && fc > 0) score += aiEnt("fortalecer", 9);
                if (item.c.onEnter === "devorar" && fc > 0) {
                    const devourAllies = deps.getState().players[pIdx].field.filter((c) => c && !c.inspiracao);
                    let bestDevourVal = 0;
                    let hasInstantDevour = false;
                    devourAllies.forEach((c) => {
                        bestDevourVal = Math.max(bestDevourVal, aiDevourTargetScore(c));
                        if (c.abilityType === "instant" && !!(c.onEnter || c.onDestroy)) hasInstantDevour = true;
                    });
                    score += aiEnt("devourar", 8) + bestDevourVal * 0.25;
                    if (hasInstantDevour) score += aiEnt("devourInstantBonus", 40);
                }
                if (item.c.summonRitual) {
                    score += aiEnt("summonRitual", 22) + item.c.power * 4;
                }
                if (item.c.onEnter === "bolaDeFogo") score += aiEnt("bolaDeFogo", 13);
                if (item.c.onEnter === "fumacaToxica" && enemyFc > 0) {
                    if (aiEnemyHasNonP1Champion(pIdx)) score += aiEnt("fumacaToxica", 14);
                    else score -= aiEnt("fumacaOnlyP1Penalty", 16);
                }
                if (item.c.onEnter === "raioDuplo" && enemyFc > 0) score += aiEnt("raioDuplo", 15);
                if (item.c.onEnter === "auraDeFogo" && fc > 0) score += aiEnt("auraDeFogo", 12);
                if (item.c.onEnter === "incendiar" && enemyFc > 0) score += aiEnt("incendiar", 14);
                if (item.c.constantEffect === "iniciativa") score += aiEnt("iniciativa", 10);
                if (item.c.onEnter === "auraAntiMagia") score += aiEnt("auraAntiMagia", 10);
                if (item.c.onEnter === "assassinar") {
                    score += aiEnt("assassinar", 15);
                    if (enemyHasP1) score += aiEnt("assassinarHasP1Bonus", 35);
                    else score -= aiEnt("assassinarNoP1Penalty", 12);
                }
                if (item.c.onEnter === "mordidaVenenosa" && enemyFc > 0) {
                    if (aiEnemyHasNonP1Champion(pIdx)) score += aiEnt("mordidaVenenosa", 13);
                    else score -= aiEnt("mordidaOnlyP1Penalty", 18);
                }
                if (item.c.onEnter === "gritoDeGuerra" && fc > 0) {
                    if (enemyFc > 0 && actionsAfter >= 1) {
                        score += aiEnt("gritoDeGuerra", 11 + fc * 3);
                    } else {
                        score -= aiEnt("gritoNoFollowUpPenalty", 14);
                    }
                }
                if (item.c.onEnter === "corromper") {
                    const corruptTargets = deps.gatherAllyTargets?.(pIdx, -1, (c) => !aiHasNoHonor(c))
                        || [];
                    if (corruptTargets.length > 0) score += aiEnt("corromper", 8);
                    else score -= aiEnt("corromperNoTargetPenalty", 10);
                }
                if (item.c.onEnter === "pesadelo") {
                    if (aiHasPesadeloTarget(pIdx)) score += aiEnt("pesadelo", 7);
                    else score -= 6;
                }
                if (item.c.onEnter === "roubar") {
                    if (aiHasRoubarTarget(pIdx)) {
                        score += aiEnt("roubar", 10);
                        if (aiPeeksPlayerSecrets()) score += aiHumanHandThreatTotal() * 0.25;
                    } else score -= 8;
                }
                if (item.c.onEnter === "desacelerar") {
                    if (aiHasDesacelerarTarget(pIdx)) score += aiEnt("desacelerar", 9);
                    else score -= 6;
                }
                if (item.c.abilityName === "Sobrepujar") score += aiEnt("sobrepujar", 6);
                // Sinergia onEnter/estado: cada invocacao precisa de motivo no jogo atual.
                let synergy = 0;
                if (aiIsRecompensaDupla(item.c)) {
                    // Hard gate §17: sem kill limpo no mesmo turno → não invoca.
                    if (!aiRecompensaDuplaCanKillSameTurn(pIdx, item.c, actionsAfter)) {
                        continue;
                    }
                    synergy += aiEnt("recompensaDuplaSummonBonus", 48);
                    if (enemyHasP1) synergy += 22;
                    score += aiEnt("recompensaDuplaAttackBonus", 55) * 0.35;
                }
                if (item.c.onEnter === "rapidez" && enemyFc > 0 && (actionsAfter + 1) >= 1) synergy += 28;
                if (item.c.onEnter === "assassinar" && enemyHasP1) synergy += 35;
                if (item.c.onEnter === "gritoDeGuerra" && fc > 0 && enemyFc > 0 && actionsAfter >= 1) synergy += 11 + fc * 3;
                if (item.c.onEnter === "devorar" && fc > 0) synergy += 20;
                if (item.c.onEnter === "fortalecer" && fc > 0) synergy += 9;
                if (item.c.onEnter === "bolaDeFogo" && enemyFc > 0) synergy += 13;
                if (item.c.onEnter === "mordidaVenenosa" && enemyFc > 0) synergy += 10;
                if (item.c.onEnter === "roubar" && aiHasRoubarTarget(pIdx)) synergy += 10;
                if (item.c.onEnter === "invokeDragon" || item.c.onEnter === "invokeCubicDragon") synergy += 10;
                if (item.c.onEnter === "rajadaCongelante" && enemyFc > 0) synergy += 12;
                score += synergy;
                if (fc >= 2) {
                    const bodyOnly = !item.c.onEnter && !aiIsRecompensaDupla(item.c) && !item.c.summonRitual
                        && item.c.abilityType !== "constant";
                    if (bodyOnly || synergy < 12) score -= aiEnt("vanityFillNoSynergyPenalty", 120);
                    if (!needPassiveVp && synergy < 20 && !needDeny) score -= aiEnt("fillAfterPassiveCapPenalty", 75);
                    // Com passivo no teto, exige sinergia clara ou vira “invocar por invocar”.
                    if (synergy < 18 && !item.c.summonRitual && !needPassiveVp) {
                        score -= 40;
                    }
                } else if (fc === 1 && !item.c.onEnter && synergy < 8 && enemyFc > 0 && needTempoKill) {
                    score -= aiEnt("plainBodyBlocksTempoPenalty", 25);
                }
                // Passivo próprio: só recompensa encher campo se ainda precisa (cap 2).
                if (fc < 4) score += aiEnt("fieldSlotBonus", 14) * (fc < 2 ? 1 : 0.45);
                if (needPassiveVp && fc < 2) {
                    score += aiEnt("passiveVpBoardBonus", 26);
                } else if (fc < 2) {
                    score += aiEnt("passiveVpBoardBonus", 26) * 0.5;
                } else if (fc >= 2 && needTempoKill) {
                    score -= aiEnt("fillBoardWhenKillExistsPenalty", 40);
                }
                if (needPassiveVp && fc < 4) score += aiEnt("needPassiveVpBonus", 18);
                if (enemyFc === 0) {
                    score += aiEnt("emptyEnemyBoardBonus", 28);
                    if (!item.c.onEnter || item.c.onEnter === "rapidez" || item.c.onEnter === "auraAntiMagia") {
                        score += aiEnt("emptyEnemyPlainBonus", 22);
                    }
                }
                if (humanAdvantage >= 3 && item.c.onEnter === "bolaDeFogo") score += 10;
                if (humanAdvantage >= 3 && item.c.onEnter === "assassinar") score += 12;
                if (aiPeeksPlayerSecrets()) {
                    const upcoming = aiHumanDeckNext(2).reduce((s, c) => s + aiThreatScoreCard(c), 0);
                    if (upcoming >= 28 && item.c.onEnter === "bolaDeFogo") score += 8;
                    if (upcoming >= 32 && item.c.onEnter === "assassinar") score += 10;
                    if (aiHumanHandThreatTotal() >= 35 && fc < 3) score += 6;
                    // Não invocar em vanidade se o humano tem remoção barata e já temos corpo.
                    if (fc >= 2 && aiHumanHandThreatTotal() >= 40 && synergy < 15) {
                        score -= 18;
                    }
                }
                score += Math.max(-20, Math.min(30, aiEvaluatePosition(pIdx) * 0.08));
                if (score > bestScore) { bestScore = score;
                    bestIdx = item.i; }
            }
            return bestIdx;
        }

        async function aiPerformGuerraChain(pIdx) {
            const pl = deps.getState().players[pIdx];
            if (!pl) return;
            let guard = 12;
            while (guard-- > 0 && pl.actions > 0 && deps.getState().winner == null
                && deps.getState().currentPlayer === pIdx) {
                const hasGuerra = pl.field.some((c) => c?.guerraBuff && !c.tapped && !c.frozen && !c.pulled);
                if (!hasGuerra) break;
                const move = aiSelectBestAttack(pIdx);
                if (!move) break;
                const att = pl.field[move.atkIdx];
                if (!att?.guerraBuff) break;
                const def = deps.getState().players[move.tgtP]?.field[move.tgtI];
                const isFree = deps.attackIsFree(att);
                const cost = deps.getAttackActionCost(att, def);
                if (!isFree && pl.actions < cost) break;
                await aiPause();
                if (!(await aiExecuteAttack(pIdx, move))) break;
                deps.updateUI();
            }
        }

        /** Após Grito de Guerra: atacar com aliados que receberam Fúria neste turno. */
        async function aiPerformGritoFuryChain(pIdx) {
            const pl = deps.getState().players[pIdx];
            if (!pl) return;
            let guard = 12;
            while (guard-- > 0 && pl.actions > 0 && deps.getState().winner == null
                && deps.getState().currentPlayer === pIdx) {
                const furyReady = pl.field.some((c) => c?.fury && !c.tapped && !c.frozen && !c.pulled);
                if (!furyReady) break;
                const move = aiSelectBestAttack(pIdx);
                if (!move) break;
                const att = pl.field[move.atkIdx];
                if (!att?.fury) {
                    // Melhor ataque global não é com Fúria — força um ataque de aliado furioso se houver.
                    let bestFury = null;
                    let bestScore = -Infinity;
                    pl.field.forEach((c, atkIdx) => {
                        if (!c?.fury || c.tapped || c.frozen || c.pulled) return;
                        for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                            if (ep === pIdx) continue;
                            deps.getState().players[ep].field.forEach((d, di) => {
                                if (!d || d.shielded || d.pulled) return;
                                if (!deps.canAttackerTargetDefender(c, d)) return;
                                const isFree = deps.attackIsFree(c);
                                const cost = deps.getAttackActionCost(c, d);
                                if (!isFree && pl.actions < cost) return;
                                if (!aiShouldAttack(pIdx, c, d, ep, isFree)) return;
                                const outcome = deps.combatOutcome(c, d);
                                let s = outcome.killD ? (d.currentPower || 0) * 10 + 20 : (d.currentPower || 0);
                                if (outcome.killA && !outcome.killD) s -= 30;
                                if (s > bestScore) {
                                    bestScore = s;
                                    bestFury = { atkIdx, tgtP: ep, tgtI: di };
                                }
                            });
                        }
                    });
                    if (!bestFury) break;
                    await aiPause();
                    if (!(await aiExecuteAttack(pIdx, bestFury))) break;
                    deps.updateUI();
                    continue;
                }
                const def = deps.getState().players[move.tgtP]?.field[move.tgtI];
                const isFree = deps.attackIsFree(att);
                const cost = deps.getAttackActionCost(att, def);
                if (!isFree && pl.actions < cost) break;
                await aiPause();
                if (!(await aiExecuteAttack(pIdx, move))) break;
                deps.updateUI();
            }
        }

        /**
         * Após invocar: se sobram ações, atacar imediatamente (esp. GAMER/ARCADIA).
         * Espelha o padrão do Grito de Guerra — não desperdiçar tempo no campo.
         */
        async function aiPerformPostSummonAttackChain(pIdx, opts = {}) {
            const pl = deps.getState().players[pIdx];
            if (!pl || (pl.actions ?? 0) <= 0) return;
            const preferDupla = !!opts.preferRecompensaDupla;
            const summonedName = opts.summonedName || null;
            let guard = 8;
            while (guard-- > 0 && pl.actions > 0 && deps.getState().winner == null
                && deps.getState().currentPlayer === pIdx) {
                let move = aiSelectBestAttack(pIdx);
                if (preferDupla || summonedName) {
                    // Preferir atacar com o recém-invocado / Recompensa Dupla se houver clean kill.
                    let bestDupla = null;
                    let bestScore = -Infinity;
                    pl.field.forEach((c, atkIdx) => {
                        if (!c || c.tapped || c.frozen || c.pulled) return;
                        const isPreferred = (preferDupla && aiIsRecompensaDupla(c))
                            || (summonedName && c.name === summonedName);
                        if (!isPreferred && preferDupla) return;
                        for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                            if (ep === pIdx) continue;
                            deps.getState().players[ep].field.forEach((d, di) => {
                                if (!d || d.shielded || d.pulled) return;
                                if (!deps.canAttackerTargetDefender(c, d)) return;
                                const isFree = deps.attackIsFree(c);
                                const cost = deps.getAttackActionCost(c, d);
                                if (!isFree && pl.actions < cost) return;
                                if (!aiShouldAttack(pIdx, c, d, ep, isFree)) return;
                                const outcome = deps.combatOutcome(c, d);
                                if (!(outcome.killD && !outcome.killA)) return;
                                let s = aiAttackVpGain(c, d) * 40
                                    + (d.currentPower || 0) * 10
                                    + aiDenyPassiveScore(pIdx, ep, di);
                                if (aiIsRecompensaDupla(c)) s += 50;
                                if (s > bestScore) {
                                    bestScore = s;
                                    bestDupla = { atkIdx, tgtP: ep, tgtI: di };
                                }
                            });
                        }
                    });
                    if (bestDupla) move = bestDupla;
                }
                if (!move) break;
                const att = pl.field[move.atkIdx];
                const def = deps.getState().players[move.tgtP]?.field[move.tgtI];
                if (!att || !def) break;
                const outcome = deps.combatOutcome(att, def);
                // Só encadear se for kill limpo, deny urgente, ou Recompensa Dupla vantajosa.
                const deny = outcome.killD && !outcome.killA
                    ? aiDenyPassiveScore(pIdx, move.tgtP, move.tgtI)
                    : 0;
                const worth = (outcome.killD && !outcome.killA)
                    || deny >= 400
                    || aiAttackWinsGame(pIdx, move)
                    || (preferDupla && outcome.killD && !outcome.killA);
                if (!worth && !preferDupla) break;
                if (!worth) break;
                const isFree = deps.attackIsFree(att);
                const cost = deps.getAttackActionCost(att, def);
                if (!isFree && pl.actions < cost) break;
                await aiPause();
                if (!(await aiExecuteAttack(pIdx, move))) break;
                deps.updateUI();
                // Uma cadeia típica: um ataque pós-summon; mais se ainda urgente.
                if (!aiHasUrgentDenyOrKill(pIdx) && !preferDupla) break;
            }
        }

        async function aiPerformFreeAttack(pIdx, champIdx) {
            await aiPause();
            const champ = deps.getState().players[pIdx].field[champIdx];
            if (!champ || champ.tapped || champ.frozen) return;
            const enemies = [];
            for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                if (ep === pIdx) continue;
                deps.getState().players[ep].field.forEach((c, i) => {
                    if (c.shielded) return;
                    // RESISTENTE não pode ser atacado por Investida (freeAttack).
                    if (isResistente(c)) return;
                    enemies.push({
                        p: ep, i, power: c.currentPower, name: c.name,
                        over: isOverpower(c),
                        noHonor: aiHasNoHonor(c),
                        grows: isCrescimentoDragon(c)
                    });
                });
            }
            if (!enemies.length) return;
            const humanAdvantage = deps.getPlayerVpAdvantageOverHuman(pIdx);
            let bestMove = null, bestScore = -Infinity;
            for (const def of enemies) {
                const defCard = deps.getState().players[def.p]?.field[def.i];
                if (!defCard) continue;
                // Saque livre não custa ação; usa a mesma gatekeeper com isFree=true
                if (!aiShouldAttack(pIdx, champ, defCard, def.p, true)) continue;
                const outcome = deps.combatOutcome(champ, defCard);
                let score = 0;
                if (outcome.killD && !outcome.killA) {
                    score += aiAtk("cleanKillBase", 28) + def.power * aiAtk("cleanKillPerDefPower", 10);
                    if (def.grows) score += aiAtk("growingDragonBonus", 16);
                    if (def.over) score += aiAtk("sobrepujarDefBonus", 10);
                    if (def.noHonor) score -= aiAtk("noHonorPenalty", 18);
                    if (def.p === 0) score += 10 + Math.max(0, humanAdvantage) * 4;
                } else if (outcome.killD && outcome.killA) {
                    const tradeMul = aiG("tradeAcceptMul", 1);
                    score += def.power * aiAtk("tradeKillPerPower", 6) * tradeMul;
                    if (def.grows) score += 12 * tradeMul;
                    if (def.over) score += 8 * tradeMul;
                    if (def.noHonor) score -= aiAtk("tradePenalty", 10);
                    if (def.p === 0) score += 8;
                }
                if (score > bestScore) { bestScore = score; bestMove = def; }
            }
            if (bestMove) {
                await deps.resolveCombat(pIdx, champIdx, bestMove.p, bestMove.i);
            }
        }

        async function aiUseUltimate(pIdx, forceEndOfTurn = false) {
            if (deps.getState().currentPlayer !== pIdx) return false;
            const pl = deps.getState().players[pIdx]; const hero = pl
                .heroDef || deps.getHeroDef(pl.heroId); const maxUlt = deps.getMaxUltimateUses(pl.heroId); if (!hero || pl
                    .ultimateUses >= maxUlt || pl.usedUltimateThisTurn) return false;
            if (hero.id === 'iceWitch' || hero.id === 'pirate') { if (!forceEndOfTurn) return false; }
            if (hero.ultimateType === "targetEnemy") { const t = aiResolveBolaDeFogo(pIdx); if (t) {
                await deps.executeUltimate(pIdx, t.p, t.i);
                return true;
            } } else if (hero.ultimateType === "targetEnemyFreeze") { if (!forceEndOfTurn)
                    return false;
                const t = aiPickCongelarTarget(pIdx);
                if (t) {
                    await deps.executeUltimate(pIdx, t.p, t.i);
                    return true;
                } } else if (hero.ultimateType === "targetAlly") {
                    const field = deps.getState().players[pIdx].field;
                    if (!field.length) return false;
                    const bestIdx = aiResolveFortalecer(pIdx, -1);
                    if (bestIdx === null || bestIdx === undefined) return false;
                    await deps.executeUltimate(pIdx, pIdx, bestIdx);
                    return true;
                } else if (hero.ultimateType === "targetAllyFreeAttack") { if (!forceEndOfTurn)
                    return false;
                    const field = deps.getState().players[pIdx].field.filter(c => !c.tapped && !c.frozen && !deps.cannotReceiveInvestida(c));
                    if (field.length) {
                        const enemies = [];
                        for (let pp = 0; pp < deps.getState().playersCount; pp++) {
                            if (pp === pIdx) continue;
                            deps.getState().players[pp].field.forEach((ec, ei) => {
                                if (!ec.shielded) enemies.push({ p: pp, i: ei, c: ec });
                            });
                        }
                        const canBeat = (att, def) => {
                            if (att.currentPower > def.currentPower) return true;
                            if (att.currentPower === def.currentPower && isOverpower(att)) return true;
                            return false;
                        };
                        const viable = field.filter(att => enemies.some(en => canBeat(att, en.c)));
                        if (!viable.length) return false;
                        const best = viable.reduce((a, b) => a.currentPower > b.currentPower ? a : b);
                        const idx = deps.getState().players[pIdx].field.indexOf(best);
                        await deps.executeUltimate(pIdx, pIdx, idx);
                        if (deps.getState().players[pIdx].field[idx]?.freeAttack) {
                            await aiPerformFreeAttack(pIdx, idx);
                        }
                        return true;
                    } } else if (hero.ultimateType ===
                    "targetAllyShield") {
                    const field = deps.getState().players[pIdx].field;
                    if (!field.length) return false;
                    const ritualAvoid = aiRitualSacrificeAvoidSet(pIdx);
                    const candidates = field.map((c, i) => ({ c, i }))
                        .filter(({ c, i }) => c && !ritualAvoid.has(pIdx + ":" + i));
                    if (!candidates.length) return false;
                    let weakest = candidates[0].c;
                    let weakestIdx = candidates[0].i;
                    for (let k = 1; k < candidates.length; k++) {
                        if (candidates[k].c.currentPower < weakest.currentPower) {
                            weakest = candidates[k].c;
                            weakestIdx = candidates[k].i;
                        }
                    }
                    if (weakest.currentPower > 2 && candidates.some(({ c }) => c.currentPower >= 3)) {
                        for (const { c, i } of candidates) {
                            if (c.currentPower > weakest.currentPower) {
                                weakest = c;
                                weakestIdx = i;
                                break;
                            }
                        }
                    }
                    await deps.executeUltimate(pIdx, pIdx, weakestIdx);
                    return true;
                } else if (hero.ultimateType === "drawCard") {
                    const ultBias = aiG("ultimateBias", 1);
                    const handThresh = ultBias >= 1.12 ? 4 : (ultBias >= 1.05 ? 3 : 3);
                    const drawOk = pl.hand.length < handThresh || pl.actions > 0 ||
                        (ultBias >= 1.15 && pl.hand.length < deps.MAX_HAND - 1);
                    if (drawOk && pl.hand.length < deps.MAX_HAND) {
                    await deps.executeUltimate(pIdx, null, null);
                    return true; } } else if (hero.ultimateType === "trickerySwap") {
                    // PRINCESA SLIME — Travessura (IA):
                    // 1) Precisa de aliado Poder 1 no próprio campo.
                    // 2) Precisa de adversário Poder ≥ 2 ou aliado já está "morto-vivo".
                    // Heurística: usar quando existe alvo Poder 2 ou maior (ótimo
                    // ganho de poder). Caso contrário (só alvos Poder 1), guarda
                    // a ult — trocar P1 por P1 não vale a pena.
                    const myField = deps.getState().players[pIdx].field;
                    const power1Allies = [];
                    myField.forEach((c, i) => { if (c.currentPower === 1) power1Allies.push(i); });
                    if (!power1Allies.length) return false;
                    // Tem inimigo Poder ≥ 2 desbloqueado?
                    let hasGoodTarget = false;
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        for (const ec of deps.getState().players[ep].field) {
                            if (!ec.shielded && ec.currentPower >= 2) { hasGoodTarget = true; break; }
                        }
                        if (hasGoodTarget) break;
                    }
                    if (!hasGoodTarget) return false;
                    const swap = deps.pickTrickerySwapTarget(pIdx);
                    if (!swap) return false;
                    const allyI = power1Allies[Math.floor(Math.random() * power1Allies.length)];
                    await deps.executeUltimate(pIdx, pIdx, allyI);
                    return true;
                } else if (hero.ultimateType === "thunderDiscard") {
                    let anyHasCard = false;
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        if (deps.getState().players[ep].hand.length > 0) { anyHasCard = true; break; }
                    }
                    if (!anyHasCard) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "fireAndIce") {
                    // JEKIRO (IA) — Fogo e Gelo AOE: afeta adversários
                    // sem Envenenado; cada um 50% congelado / 50% bola de
                    // fogo. Nunca usa se o jogador principal tem ≤1 Campeão
                    // nem se só restam alvos já Envenenados.
                    const humanField = deps.getState().players[0]?.field || [];
                    const humanChamps = humanField.filter((c) => !!c).length;
                    if (humanChamps <= 1) return false;
                    const enemies = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach((c, i) => {
                            if (c && !c.poisoned) enemies.push({ p: ep, i, uid: c.uid });
                        });
                    }
                    if (!enemies.length) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "summonDragon") {
                    if (pl.field.length >= deps.MAX_FIELD) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "hook") {
                    if (!pickHookTarget(pIdx)) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "resurrect") {
                    if (pl.field.length >= deps.MAX_FIELD) return false;
                    const pick = deps.pickPaladinoRandomPower2Discard(pIdx);
                    if (!pick) return false;
                    const begun = await deps.beginUltimate(pIdx);
                    if (!begun.proceed) return !!begun.cancelled;
                    await paladinoRevive(pIdx, pick, begun.hero);
                    return true;
                } else if (hero.ultimateType === "potion") {
                    // ALQUIMISTA (IA) — Poção Improvável (NOVA regra: 60% +2 / 40% -1):
                    //   • Aceita aliado com QUALQUER Poder ≥ 1 (filtra apenas
                    //     Resistente via allyTargetCanGainPower).
                    //   • Prefere o de MAIOR Poder (snowball +2 num topo já alto).
                    const cands = [];
                    pl.field.forEach((c, i) => {
                        // RESTRIÇÃO (task 1): a IA NUNCA usa a Poção em
                        // Campeão com Poder >= 4, salvo se o adversário
                        // também tiver um Campeão Poder >= 4 em campo.
                        if (deps.allyTargetCanGainPower(c) && aiAllyBuffAllowed(pIdx, c)) {
                            cands.push({ i, pow: c.currentPower });
                        }
                    });
                    if (!cands.length) return false;
                    cands.sort((a, b) => b.pow - a.pow);
                    const pick = cands[0];
                    await deps.executeUltimate(pIdx, pIdx, pick.i);
                    return true;
                } else if (hero.ultimateType === "vampirism") {
                    // VALMONT (IA) — alvo inimigo Poder ≥ 2 (preferindo o
                    // maior pra reduzir ameaça); aliado aleatório ganha +1.
                    const enemies = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach((c, i) => {
                            if (!c.shielded && !c.pulled && c.currentPower >= 2) {
                                enemies.push({ p: ep, i, pow: c.currentPower });
                            }
                        });
                    }
                    if (!enemies.length) return false;
                    const allies = [];
                    // RESTRIÇÃO DE BUFF DA IA: o aliado que ganha +1 não
                    // pode já estar em Poder >= 4 (salvo adversário >= 4).
                    pl.field.forEach((c, i) => {
                        if (deps.allyTargetCanGainPower(c) && aiAllyBuffAllowed(pIdx, c)) allies.push(i);
                    });
                    if (!allies.length) return false;
                    enemies.sort((a, b) => b.pow - a.pow);
                    const tgt = enemies[0];
                    await deps.executeUltimate(pIdx, tgt.p, tgt.i);
                    return true;
                } else if (hero.ultimateType === "banish") {
                    const pool = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach((c, i) => {
                            if (c.shielded || c.pulled) return;
                            if (!deps.championBanishable(c)) return;
                            const noHonor = aiHasNoHonor(c);
                            pool.push({ p: ep, i, pow: championPrintedPower(c), noHonor });
                        });
                    }
                    if (!pool.length) return false;
                    pool.sort((a, b) => (b.pow - a.pow) || (a.noHonor - b.noHonor));
                    const tgt = pool[0];
                    await deps.executeUltimate(pIdx, tgt.p, tgt.i);
                    return true;
                } else if (hero.ultimateType === "wallProtect") {
                    if (!pl.field.length) return false;
                    if (!pl.field.some((c) => c && !c.wallBuff)) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "poison") {
                    const enemies = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach((c, i) => {
                            if (!c.poisoned && !c.pulled && (c.currentPower ?? c.power ?? 0) > 1) {
                                enemies.push({ p: ep, i, pow: c.currentPower });
                            }
                        });
                    }
                    if (!enemies.length) return false;
                    enemies.sort((a, b) => b.pow - a.pow);
                    const tgt = enemies[0];
                    if (!deps.getState().players[tgt.p].field[tgt.i]) return false;
                    await deps.executeUltimate(pIdx, tgt.p, tgt.i);
                    return true;
                } else if (hero.ultimateType === "infinitePower") {
                    let firstIdx = -1, count = 0;
                    pl.field.forEach((c, i) => {
                        if (deps.allyTargetCanGainPower(c) && !c.foreverGrowth && aiAllyBuffAllowed(pIdx, c)) {
                            count++;
                            if (firstIdx < 0) firstIdx = i;
                        }
                    });
                    if (count < 2) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "scareReturn") {
                    const enemies = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach((c, i) => {
                            if (aiMedoTargetOk(ep, i, pIdx)) {
                                enemies.push({ p: ep, i, pow: c.currentPower });
                            }
                        });
                    }
                    if (!enemies.length) return false;
                    enemies.sort((a, b) => b.pow - a.pow);
                    const tgt = enemies[0];
                    await deps.executeUltimate(pIdx, tgt.p, tgt.i);
                    return true;
                } else if (hero.ultimateType === "cometStarfall") {
                    // ESTRELAR (IA) — Cometa Estrelar (regra do usuário):
                    // Avalia custo-benefício e dispara em três cenários:
                    //   A) Poucos aliados (≤ 2) e adversário com > 2
                    //      Campeões — vira a maré quebrando o campo dele.
                    //   B) Adversário com > 4 Campeões e perda aliada baixa
                    //      (allyKills ≤ 1) — quebra um campo lotado com
                    //      pouca perda própria.
                    //   C) Clássico — enemyKills ≥ 3 OU (≥ 2 e maior que
                    //      allyKills): PV puro.
                    let allyCount = pl.field.length;
                    let maxEnemyCount = 0;
                    let enemyKills = 0, allyKills = 0;
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep !== pIdx) maxEnemyCount = Math.max(maxEnemyCount, deps.getState().players[ep].field.length);
                        deps.getState().players[ep].field.forEach(c => {
                            if (c.currentPower === 1 && !c.shielded) {
                                if (ep === pIdx) allyKills++; else enemyKills++;
                            }
                        });
                    }
                    const scenarioA = allyCount <= 2 && maxEnemyCount >= 2 && enemyKills >= 1;
                    const scenarioB = maxEnemyCount >= 3 && enemyKills >= 1 && allyKills <= 2;
                    const scenarioC = enemyKills + allyKills >= 3 && enemyKills >= allyKills;
                    const classic   = enemyKills >= 2 || (enemyKills >= 1 && enemyKills > allyKills);
                    const lateGame  = (pl.ultimateCharges || 0) >= 2 && enemyKills >= 1;
                    if (!(scenarioA || scenarioB || scenarioC || classic || lateGame)) return false;
                    await deps.executeUltimate(pIdx, null, null);
                    return true;
                } else if (hero.ultimateType === "warOverpower") {
                    // VIOLÊNCIA (IA) — Guerra (regra do usuário):
                    //   1) Durante o próprio turno (!forceEndOfTurn): usa
                    //      pra ATACAR no mesmo turno — só dispara se há
                    //      aliado destapado/não-overpower que empate em
                    //      Poder com algum inimigo (Sobrepujar converte
                    //      empate em vitória, abrindo a possibilidade de
                    //      ataque imediato).
                    //   2) No fim do turno (forceEndOfTurn): usa pra
                    //      PROTEGER aliados fora do turno — um aliado
                    //      Poder 2 com Sobrepujar só pode ser atacado por
                    //      Poder ≥ 3, então qualquer aliado que empate
                    //      em Poder com um inimigo justifica o uso.
                    const allies = pl.field;
                    if (!allies.length) return false;
                    const enemies = [];
                    for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                        if (ep === pIdx) continue;
                        deps.getState().players[ep].field.forEach(c => {
                            if (!c.shielded && !c.pulled) enemies.push(c);
                        });
                    }
                    if (!enemies.length) return false;
                    if (forceEndOfTurn && pl.actions > 0) return false;
                    if (!forceEndOfTurn) {
                        // Caso 1 — VIOLÊNCIA AGRESSIVA (regra do usuário): a IA
                        // deve usar Guerra DURANTE o turno pra abrir cadeia de
                        // ataques. Dispara em qualquer um destes cenários:
                        //   (a) tem aliado destapado/não-overpower que empate em
                        //       Poder com um inimigo (Sobrepujar converte empate
                        //       em vitória — ataque imediato OK);
                        //   (b) tem 2+ aliados destapados/não-overpower com Poder
                        //       suficiente pra abater ao menos 1 inimigo (Guerra
                        //       transforma cada um deles num "Sobrepujar
                        //       temporário" e habilita uma sequência de ataques
                        //       no MESMO turno — grande vantagem).
                        const fightReady = allies.filter(a => !a.tapped && !a.frozen && !a.pulled && !isOverpower(a));
                        const tieNeedsGuerra = fightReady.some((a) => enemies.some((e) => {
                            if (e.currentPower !== a.currentPower) return false;
                            const out = deps.combatOutcome(a, e);
                            return out.killA && out.killD;
                        }));
                        const canAttackWin = fightReady.some((a) => enemies.some((e) => {
                            if (e.currentPower !== a.currentPower) return false;
                            const out = deps.combatOutcome(a, e);
                            return out.killD && !out.killA;
                        }));
                        const tieMatchups = fightReady.reduce((acc, a) => acc + enemies.filter(e => e.currentPower === a.currentPower).length, 0);
                        const multiAttack = fightReady.length >= 2 && tieMatchups >= 2;
                        if (!tieNeedsGuerra && !canAttackWin && !multiAttack) return false;
                    } else {
                        // Caso 2: proteção — qualquer empate em Poder
                        // entre aliado sem Sobrepujar e inimigo já vale.
                        const wouldProtect = allies.some(a => !isOverpower(a) &&
                            enemies.some(e => e.currentPower === a.currentPower));
                        if (!wouldProtect) return false;
                    }
                    await deps.executeUltimate(pIdx, null, null);
                    if (!forceEndOfTurn) await aiPerformGuerraChain(pIdx);
                    return true;
                } return false; }

        async function aiUseTalents(pIdx) { const p = deps.getState().players[pIdx]; let used = false; for (let i = p.hand.length -
                1; i >= 0; i--) { const c = p.hand[i]; if (c.category !== "talent") continue; if (c.talentEffect ===
                    "bolaDeFogoTalento") { const t = aiResolveBolaDeFogo(pIdx); if (t) { await aiPause(); p.hand.splice(
                        i, 1);
                    // Coloca a carta no campo do IA (todos veem) por ~1.4s antes do efeito.
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Bola de Fogo!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    const originOverride = deps.dfCaptureTalentCardOrigin(pIdx);
                    deps.pushDiscard(pIdx, c);
                    deps.getState().activeTalent = null;
                    deps.updateUI();
                    await deps.castBolaDeFogo(pIdx, -1, t.p, t.i, true, originOverride);
                    used = true;
                    if (deps.getState().winner) return used; } }
                // EXPLOSÃO (Talento) — reaproveita aiResolveBolaDeFogo
                // como heurística de alvo (Campeão inimigo mais valioso
                // / próximo de morrer), só que -2 em vez de -1.
                if (c.talentEffect === "explosao") {
                    // CUSTO 1 — IA precisa ter ação disponível.
                    const cost = c.currentPower || c.power || 0;
                    if (p.actions < cost) continue;
                    // REGRA (usuário): a IA NUNCA usa Explosão em
                    // Campeão de Poder 1. Explosão tira -2 e mataria
                    // qualquer Poder 1 — desperdício, já que o custo
                    // de uma carta talento por um Poder 1 é ruim.
                    // Filtra alvos Poder 1 antes de escolher.
                    const t = aiResolveBolaDeFogo(pIdx, { minPower: 2 });
                    if (t) {
                        await aiPause();
                        p.hand.splice(i, 1);
                        if (cost > 0) p.actions = Math.max(0, p.actions - cost);
                        deps.getState().activeTalent = { ownerP: pIdx, card: c };
                        deps.log(`${p.name} usou Talento Explosão!`);
                        try { window.sfx && window.sfx("explosao"); } catch (e) {}
                        deps.updateUI();
                        await awaitTalentSpotlight();
                        deps.pushDiscard(pIdx, c);
                        deps.getState().activeTalent = null;
                        deps.updateUI();
                        await castExplosao(pIdx, t.p, t.i);
                        used = true;
                        if (deps.getState().winner) return used;
                    }
                }
                // ZERO ABSOLUTO (Talento) — prioriza inimigo JÁ congelado
                // (destrói); senão, congela o de maior currentPower.
                if (c.talentEffect === "zeroAbsoluto") {
                    const t = aiResolveZeroAbsoluto(pIdx);
                    if (t) {
                        await aiPause();
                        p.hand.splice(i, 1);
                        deps.getState().activeTalent = { ownerP: pIdx, card: c };
                        deps.log(`${p.name} usou Talento Zero Absoluto!`);
                        try { window.sfx && window.sfx("zero_absoluto"); } catch (e) {}
                        deps.updateUI();
                        await awaitTalentSpotlight();
                        deps.pushDiscard(pIdx, c);
                        deps.getState().activeTalent = null;
                        deps.updateUI();
                        await deps.castZeroAbsoluto(pIdx, t.p, t.i);
                        used = true;
                        if (deps.getState().winner) return used;
                    }
                }
                if (c.talentEffect === "doppelganger") {
                    const cost = c.currentPower || c.power || 0;
                    if (p.actions < cost) continue;
                    const allies = deps.gatherAllyTargets(pIdx, -1, ch => ch && ch.currentPower === 2);
                    if (!allies.length || p.field.length >= deps.MAX_FIELD) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    if (cost > 0) p.actions = Math.max(0, p.actions - cost);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Doppelganger!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    await resolveTalentDoppelganger(pIdx);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "fortalecerTalento") {
                    const t = aiResolveFortalecer(pIdx, -1);
                    if (t === null) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Fortalecer!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    await resolveTalentFortalecer(pIdx, t);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "barreira") {
                    const allies = deps.gatherAllyTargets(pIdx, -1, () => true);
                    const needBarrier = allies.filter((t) => {
                        const ch = deps.getState().players[t.p]?.field[t.i];
                        return ch && !ch.barrier && !ch.barrierPermanent;
                    });
                    if (!needBarrier.length) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Barreira!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    await resolveTalentBarreira(pIdx);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "aceleracao") {
                    if (p.actions >= MAX_ACTIONS) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Aceleração!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    await resolveTalentAceleracao(pIdx);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "baforadaVenenosa") {
                    const allEnemies = deps.gatherEnemyTargets(pIdx, () => true);
                    if (!allEnemies.length) continue;
                    // NUNCA em já Envenenado; NUNCA em quem a IA mata neste turno.
                    const avoid = aiPoisonAvoidSet(pIdx);
                    const safe = allEnemies.filter((t) => {
                        if (avoid.has(t.p + ":" + t.i)) return false;
                        const ch = deps.getState().players[t.p]?.field[t.i];
                        return ch && !ch.poisoned && (ch.currentPower ?? ch.power ?? 0) > 1;
                    });
                    if (!safe.length) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Baforada Venenosa!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    const pick = safe[Math.floor(Math.random() * safe.length)];
                    await resolveTalentBaforadaVenenosa(pIdx, pick.p, pick.i);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "missemagicos") {
                    const cost = c.currentPower || c.power || 0;
                    if (p.actions < cost) continue;
                    if (!deps.gatherEnemyTargets(pIdx, () => true).length) continue;
                    await aiPause();
                    p.hand.splice(i, 1);
                    if (cost > 0) p.actions = Math.max(0, p.actions - cost);
                    deps.getState().activeTalent = { ownerP: pIdx, card: c };
                    deps.log(`${p.name} usou Talento Mísseis Mágicos!`);
                    deps.updateUI();
                    await awaitTalentSpotlight();
                    await resolveTalentMisseisMagicos(pIdx);
                    used = true;
                    if (deps.getState().winner) return used;
                }
                if (c.talentEffect === "medoTalento") { const
                        all = gatherAllFieldTargets().filter(t => aiMedoTargetOk(t.p, t.i, pIdx)); if (all.length) { const humanAdvantage =
                        deps.getPlayerVpAdvantageOverHuman(pIdx); let best = all[0]; for (const t of all) { const champ =
                                deps.getState().players[t.p].field[t.i]; if (!champ) continue; let score = champ
                                .currentPower; if (humanAdvantage >= 3 && t.p === 0) score += 20; if (score > (
                                    deps.getState().players[best.p].field[best.i]?.currentPower || 0) + (best.p === 0 &&
                                    humanAdvantage >= 3 ? 20 : 0)) best = t; }
                        await aiPause();
                        p.hand.splice(i, 1);
                        deps.getState().activeTalent = { ownerP: pIdx, card: c };
                        deps.log(`${p.name} usou Talento Medo!`);
                        deps.updateUI();
                        await awaitTalentSpotlight();
                        const target = deps.getState().players[best.p].field[best.i]; if (
                            target) {
                            const targetSnap = cloneCard(target);
                            try { window.sfx && window.sfx("scare"); } catch (e) {}
                            await playScareReturnVisual(best.p, best.i, targetSnap, pIdx);
                            if (typeof deps.applyScareReturnToHand === "function") {
                                deps.applyScareReturnToHand(best.p, best.i, targetSnap);
                            } else {
                                deps.getState().players[best.p].field.splice(best.i, 1);
                                deps.getState().players[best.p].hand.push(deps.buildScareReturnHandCard(targetSnap));
                            }
                            await deps.commitActiveTalent(pIdx);
                            deps.updateUI({ immediate: true });
                            window.dfStabilizeFieldCards?.();
                            /* (Removido por pedido do usuário: o
                               floatText "MEDO!" não aparece mais.) */ }
                        used = true;
                        if (deps.getState().winner) return used; } } } return used; }

        /** Manual §18: tenta pontuar quando a heurística principal não acha jogada. */
        async function aiTryScoreFallback(pIdx) {
            const T = deps.DfProtocol?.ACTION_TYPES || {};
            const pl = deps.getState().players[pIdx];
            if (!pl || (pl.actions ?? 0) <= 0) return false;

            const atk = aiSelectBestAttack(pIdx);
            if (atk) {
                const ok = await aiExecuteLegalAction(pIdx, {
                    type: T.ATTACK_RESOLVE || "ATTACK_RESOLVE",
                    playerId: pIdx,
                    attackerIdx: atk.atkIdx,
                    defenderPlayerId: atk.tgtP,
                    defenderIdx: atk.tgtI,
                });
                if (ok) return true;
            }

            let summonIdx = aiSelectBestSummon(pIdx);
            if (summonIdx == null) summonIdx = aiSelectPlainSummon(pIdx, true);
            if (summonIdx != null) {
                const ok = await aiExecuteLegalAction(pIdx, {
                    type: T.SUMMON || "SUMMON",
                    playerId: pIdx,
                    handIdx: summonIdx,
                });
                if (ok) return true;
            }

            if (pl.deck.length && pl.hand.length < deps.MAX_HAND && (pl.actions ?? 0) >= 1) {
                // Não gastar a última chance só em compra se ainda dá pra invocar.
                const fc = aiGetFieldCount(pIdx);
                const canSummonNow = aiSelectBestSummon(pIdx) != null
                    || aiSelectPlainSummon(pIdx, true) != null;
                if (canSummonNow && fc === 0) return false;
                const ok = await aiExecuteLegalAction(pIdx, {
                    type: T.DRAW_CARD || "DRAW_CARD",
                    playerId: pIdx,
                });
                if (ok) return true;
            }
            return false;
        }

        async function aiSpendRemainingActions(pIdx) {
            const T = deps.DfProtocol?.ACTION_TYPES || {};
            let guard = 12;
            while (guard-- > 0 && (deps.getState().players[pIdx]?.actions ?? 0) > 0
                && deps.getState().winner == null) {
                await aiPause();
                let acted = await aiPerformBestAction(pIdx, 1);
                if (!acted) acted = await aiTryScoreFallback(pIdx);
                if (!acted) {
                    const pl = deps.getState().players[pIdx];
                    const canBuy = global.DfRules?.canBuyCard?.(deps.getState(), pIdx)?.ok;
                    if (canBuy) {
                        acted = await aiExecuteLegalAction(pIdx, {
                            type: T.DRAW_CARD || "DRAW_CARD",
                            playerId: pIdx,
                        });
                    }
                }
                if (!acted) break;
                deps.updateUI();
            }
        }

        async function aiTakeTurn(pIdx) {
            if (!deps.getState().started) return;
            // Nunca liberar aiBusy órfão e seguir — isso criava turnos em paralelo
            // após vários reinícios (Ultimate+compra+invocações juntos).
            if (deps.getAiBusy()) {
                console.warn("[DF aiTakeTurn] IA já em andamento — ignorando chamada sobreposta");
                return;
            }
            const mySerial = ++_aiTurnSerial;
            const gen = deps.getMatchGeneration();
            deps.setAiBusy(true);
            let turnEnded = false;
            let aiAborted = false;
            const aiStillOwnsTurn = () => deps.getState().started && gen === deps.getMatchGeneration()
                && mySerial === _aiTurnSerial
                && deps.getState().currentPlayer === pIdx && deps.getState().winner === null && !aiAborted;
            const endAiTurn = async () => {
                if (turnEnded) return;
                turnEnded = true;
                if (deps.getState().started && gen === deps.getMatchGeneration()
                    && mySerial === _aiTurnSerial
                    && deps.getState().currentPlayer === pIdx && deps.getState().winner === null) {
                    const T = deps.DfProtocol?.ACTION_TYPES || {};
                    await deps.dfDispatch({ type: T.END_TURN || "END_TURN", playerId: pIdx }, { fromHuman: false, broadcast: false });
                }
            };
            const watchdogMs = window.__DF_SIM_MODE ? 8000 : 52000;
            const watchdog = setTimeout(() => {
                console.warn("[DF aiTakeTurn] watchdog — abortando turno IA");
                aiAborted = true;
                deps.setAiBusy(false);
                void endAiTurn();
            }, watchdogMs);
            try {
            // Limpeza só no início do turno (não a cada ação).
            deps.ensureTurnReady?.();
            if (window.__dfCombatActive) {
                deps.dfCombatForceCleanup?.(window.__dfCombatActive);
            }
            try { window.DfPresentationBus?.forceReset?.(); } catch (e) { /* */ }
            aiPrepTurn(pIdx);
            const p = deps.getState().players[pIdx]; const hero = p.heroDef || deps.getHeroDef(p.heroId); const isIceWitch =
                hero && hero.id === 'iceWitch'; const isPirate = hero && hero.id === 'pirate';
            // Pausa inicial: o jogador vê o banner/relógio antes da 1ª jogada.
            await aiPause();
            await aiUseTalents(pIdx);
            if (!aiStillOwnsTurn()) return;
            if (!isIceWitch && !isPirate) {
                await aiPause();
                await aiUseUltimate(pIdx, false);
            }
            if (!aiStillOwnsTurn()) return;
            deps.updateUI();
            const emptyEnemyBoard = aiTotalEnemyFieldCount(pIdx) === 0;

            let scoreFloor = emptyEnemyBoard ? 1 : 5;
            while (aiStillOwnsTurn()
                && deps.getState().players[pIdx].actions > 0) {
                await aiPause();
                let acted = await aiPerformBestAction(pIdx, scoreFloor);
                if (!acted && scoreFloor > 0) {
                    scoreFloor = 0;
                    acted = await aiPerformBestAction(pIdx, 0);
                }
                if (!acted) acted = await aiTryScoreFallback(pIdx);
                if (!acted) break;
                scoreFloor = emptyEnemyBoard ? 1 : 5;
                deps.updateUI();
            }
            if (!aiStillOwnsTurn()) return;
            await aiSpendRemainingActions(pIdx);
            if (!aiStillOwnsTurn()) return;
            await aiPause();
            await aiUseUltimate(pIdx, true);
            deps.updateUI();
            } catch (aiErr) {
                console.warn("[DF aiTakeTurn]", aiErr);
            } finally {
                clearTimeout(watchdog);
                aiAborted = true;
                if (mySerial === _aiTurnSerial) deps.setAiBusy(false);
            }
            if (mySerial === _aiTurnSerial) await endAiTurn();
        }

        return {
            aiShouldReactiveBlock,
            aiShouldReactiveProtect,
            aiPickOnEnterResolution,
            aiResolveNecromancia,
            aiResolveImitar,
            aiDevourTargetScore,
            aiResolveDevorar,
            aiPickRitualSacrifice,
            aiRitualSacrificeAvoidSet,
            aiOpponentHasPowerAtLeast,
            aiAllyBuffAllowed,
            aiResolveFortalecer,
            aiChoosePesadelo,
            aiHasPesadeloTarget,
            aiHasRoubarTarget,
            aiChooseRoubar,
            aiHasDesacelerarTarget,
            aiChooseDesacelerar,
            aiPickCongelarTarget,
            aiResolveZeroAbsoluto,
            aiResolveBolaDeFogo,
            aiResolveAssassinar,
            aiResolveTransformarBichinho,
            aiResolveUrsificacao,
            aiChampionDyingSoon,
            aiMedoTargetOk,
            aiPoisonAvoidSet,
            aiStatusAvoidSet,
            aiShouldCancelUltimate,
            aiGetFieldCount,
            aiTotalEnemyFieldCount,
            aiChampionSummonCost,
            aiCanPlayNecromancia,
            aiCanPlayTrocaInjusta,
            aiOnEnterNeedsEnemy,
            aiSelectPlainSummon,
            aiUseTrainedProfile,
            aiUseHardWeights,
            aiPeeksPlayerSecrets,
            aiThreatScoreCard,
            aiHumanHandThreatTotal,
            aiHumanHasTalentEffect,
            aiHumanDeckNext,
            aiPickStealFromHand,
            aiAtk,
            aiEnt,
            aiG,
            aiHeroWeight,
            loadAiHardProfile,
            updateAiHardStatusHint,
            setAiDifficulty,
            updateAiModeSelection,
            showAiModeSelect,
            startAiDuel,
            aiShouldAttack,
            aiVpNeeded,
            aiIsRecompensaDupla,
            aiRecompensaDuplaCanKillSameTurn,
            aiOpponentNextPassiveVp,
            aiOwnNextPassiveVp,
            aiHumanNearWin,
            aiEvaluatePosition,
            aiDenyPassiveScore,
            aiHasUrgentDenyOrKill,
            aiAttackVpGain,
            aiAttackWinsGame,
            aiExecuteAttack,
            aiLegalActions,
            aiScoreSummonHandIdx,
            aiScoreAttackAction,
            aiScoreLegalAction,
            aiPickBestLegalAction,
            aiExecuteLegalAction,
            aiSelectBestAttack,
            aiSelectBestSummon,
            aiPerformGuerraChain,
            aiPerformGritoFuryChain,
            aiPerformPostSummonAttackChain,
            aiPerformFreeAttack,
            aiUseUltimate,
            aiUseTalents,
            aiTakeTurn,
        };
    }

    global.DfAiController = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-talent-ultimate-presenter.js ===== */
/**
 * Dragonfall — Talent / Ultimate presenter (Fase 1 arquitetura).
 * Gerado por scripts/build-phase1-*.mjs — não edite manualmente.
 */
(function (global) {
    "use strict";

    function create(deps) {
        const allyTargetCanGainPower = (c) => deps.allyTargetCanGainPower(c);
        function dfChampionPower(champ) {
            return champ?.currentPower ?? champ?.power ?? champ?.basePower ?? 0;
        }
        function dfBumpChampionPower(champ, delta) {
            if (!champ || !delta) return;
            champ.currentPower = dfChampionPower(champ) + delta;
        }
        const cubicDragonDef = deps.cubicDragonDef;
        const getSpriteVfx = () => deps.DfSpriteVfx || global.DfSpriteVfx || window.DfSpriteVfx;
        const animateMissileStrike = (...a) => deps.animateMissileStrike(...a);
        const playTrickerySwapVisual = (...a) => deps.playTrickerySwapVisual(...a);
        const playAlchemistPotionVisual = (...a) => deps.playAlchemistPotionVisual(...a);
        const animateThunderDiscardFromHand = (...a) => deps.animateThunderDiscardFromHand(...a);
        const buildScareReturnHandCard = (...a) => deps.buildScareReturnHandCard(...a);
        const cloneCard = (...a) => deps.cloneCard(...a);
        const triggerChampionShatter = (...a) => deps.triggerChampionShatter(...a);

        async function playUltCinematic(fn) {
            if (typeof deps.ultVfx === "function") {
                await deps.ultVfx(fn);
                return;
            }
            await fn();
        }

        function cancelUltimateTargetSelection() {
            if (deps.getGamePhase() !== "ultimate-target" || !deps.dfIsMyTurn()) return;
            deps.setGamePhase("normal");
            deps.setTargetData({});
            try { deps.dfPurgeTargetingVisuals?.(); } catch (e) { /* */ }
            try { window.dfPurgeTargetingVisuals?.(); } catch (e2) { /* */ }
            deps.log("Ultimate cancelada.");
            deps.updateUI();
        }

        function enterUltimateTargetPhase(pid, hero, targets, logMsg) {
            deps.setGamePhase("ultimate-target");
            deps.setTargetData({ ultimate: hero.id, caster: pid, targets, targetIndex: 0 });
            deps.dfInvalidateAllQuadrantFp?.();
            targets.forEach(({ p }) => deps.dfInvalidateQuadrantFp?.(p));
            document.body.setAttribute("data-targeting", "ultimate-target");
            deps.log(logMsg);
            deps.updateUI({ immediate: true });
        }

        function startUltimate() {
            const pid = deps.dfLocalSeat();
            if (!deps.dfIsMyTurn()) return;
            // Limpa mira/talento órfão (vs-IA / local) antes do gate — evita Ultimate/Comprar mudos.
            const stuckPhases = ["target-champion", "target-ally", "ultimate-target",
                "select-attacker", "select-defender"];
            const phaseNow = deps.getGamePhase();
            if (stuckPhases.includes(phaseNow)) {
                try { deps.abortActiveTalent?.(); } catch (e) { /* */ }
                try { deps.dfDismissTargetingPhase?.(); } catch (e2) { /* */ }
                try { deps.dfPurgeTargetingVisuals?.(); } catch (e3) { /* */ }
                try { window.dfPurgeTargetingVisuals?.(); } catch (e4) { /* */ }
                deps.setGamePhase("normal");
                deps.setTargetData({});
            }
            if (deps.getGamePhase() !== "normal") {
                deps.floatText?.("Termine a ação atual antes de usar a Ultimate.", "warn center", 1800);
                return;
            }
            void deps.ensureVfxReady?.();
            void window.DfVfxEngine?.ensureCinematicReady?.().catch(() => false);
            deps.dfEnsurePresentationUnblocked?.("ultimate-start");
            deps.dfPurgeDesacelerarVfx?.();
            try { window.DfUltimateDirector?.purgeUltimateVfx?.(); } catch (e) { /* */ }
            try { window.DfPresentationBus?.forceReset?.(); } catch (e) { /* */ }
            deps.dfClosePreviewForTargeting();
            const pl = deps.getState().players[pid];
            const hero = pl.heroDef || deps.getHeroDef(pl.heroId);
            const maxUlt = deps.getMaxUltimateUses(pl.heroId);
            if (!hero || pl.ultimateUses >= maxUlt || pl.usedUltimateThisTurn) {
                deps.floatText?.(
                    pl.usedUltimateThisTurn
                        ? "Ultimate já usada neste turno."
                        : "Sem usos de Ultimate restantes.",
                    "warn center",
                    1800,
                );
                return;
            }
            if (hero.ultimateType === "targetEnemy") {
                const targets = deps.gatherEnemyTargets(pid, () => true);
                if (!targets.length) {
                    deps.floatText?.("Sem alvos.", "warn center", 1600);
                    deps.log("Sem alvos.");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    targets,
                    `Clique no campeão adversário destacado em VERMELHO para usar ${hero.ultimateName}.`);
            } else if (hero.ultimateType === "targetEnemyFreeze") {
                const targets = deps.gatherEnemyTargets(pid, (c) => !c.frozen);
                if (!targets.length) {
                    deps.floatText?.("Todos já congelados.", "warn center", 1800);
                    deps.log("Todos já congelados.");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    targets,
                    `Clique no campeão adversário destacado em AZUL e congele-o por 3 rodadas.`);
            } else if (hero.ultimateType === "targetAlly") {
                const targets = deps.gatherAllyTargets(pid, -1, allyTargetCanGainPower);
                if (!targets.length) {
                    deps.floatText?.("Nenhum aliado pode receber +Poder.", "warn center", 1800);
                    deps.log("Nenhum aliado pode receber +Poder.");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    targets,
                    `Clique no campeão aliado destacado em verde e dê +1 de Poder a ele.`);
            } else if (hero.ultimateType === "targetAllyFreeAttack") {
                const targets = deps.gatherAllyTargets(
                    pid, -1, (c) => !deps.cannotReceiveInvestida(c)).filter((t) => !deps.getState().players[pid].field[t.i].tapped && !deps.getState().players[pid].field[t.i]
                    .frozen);
                if (!targets.length) {
                    deps.floatText?.("Sem aliados disponíveis para Investida.", "warn center", 1800);
                    deps.log("Sem aliados disponíveis para Investida (Banjo não pode receber).");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    targets,
                    `Clique no campeão aliado destacado em verde — ele vai atacar de graça neste turno.`);
            } else if (hero.ultimateType === "targetAllyShield") {
                const targets = deps.gatherAllyTargets(pid, -1);
                if (!targets.length) {
                    deps.floatText?.("Sem aliados.", "warn center", 1600);
                    deps.log("Sem aliados.");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    targets,
                    `Clique no campeão aliado destacado em verde e proteja-o por 1 rodada.`);
            } else if (hero.ultimateType === "trickerySwap") {
                // PRINCESA SLIME — Travessura: precisa de aliado Poder 1 no
                // próprio campo. Se não tiver, mostra aviso central e aborta
                // (NÃO consome uso de ultimate).
                const power1Allies = [];
                deps.getState().players[pid].field.forEach((c, i) => {
                    if (c.currentPower === 1) power1Allies.push({ p: pid, i });
                });
                if (!power1Allies.length) {
                    deps.floatText("Não há Campeões de poder 1 no seu campo para usar a Travessura.", "warn center", 2400);
                    deps.log("Travessura: sem Campeões de Poder 1 no seu campo.");
                    return;
                }
                // Pré-valida que existe pelo menos 1 adversário trocável,
                // pra não consumir uso quando não dá pra resolver a troca.
                // Proteção bloqueia somente ataques.
                if (!deps.pickTrickerySwapTarget(pid)) {
                    deps.floatText("Não há Campeões adversários disponíveis para a Travessura.", "warn center", 2400);
                    deps.log("Travessura: sem Campeões adversários disponíveis.");
                    return;
                }
                enterUltimateTargetPhase(pid, hero,
                    power1Allies,
                    "Escolha um campeão de poder 1 no seu campo para usar a travessura!");
            } else if (hero.ultimateType === "thunderDiscard") {
                // THOR — Trovoada: efeito global, sem alvo. Resolve direto.
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "drawCard") {
                // EURÁVIA — Conjuração: bloqueia ANTES de gastar o uso
                // quando a mão já está no teto (8 cartas). deps.drawCard()
                // retorna false silenciosamente, então sem este guard
                // a Ult era consumida sem efeito.
                if (pl.hand.length >= deps.MAX_HAND) {
                    deps.floatText("Você já tem cartas demais em mãos.", "warn center", 2200);
                    deps.log("Conjuração: mão cheia (8/8).");
                    return;
                }
                executeUltimate(pid, null, null);
            }
            else if (hero.ultimateType === "fireAndIce") {
                // JEKIRO — Fogo e Gelo: AOE sem escolha de alvo. Afeta
                // TODOS os campeões adversários; cada um tem 50% de chance
                // de ser congelado por 2 rodadas e 50% de receber Bola
                // de Fogo (-1 Poder). Apenas um dos dois efeitos por
                // alvo. Bloqueia se não houver nenhum adversário em campo.
                const targets = deps.gatherEnemyTargets(pid, () => true);
                if (!targets.length) {
                    deps.floatText("Sem Campeões adversários em campo.", "warn center", 1800);
                    deps.log("Fogo e Gelo: sem alvos.");
                    return;
                }
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "summonDragon") {
                // SANGUE DE DRAGÃO — invoca FILHOTE como ação livre.
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "hook") {
                // GANCHO — Puxão: rouba PERMANENTEMENTE um Campeão
                // adversário aleatório com Poder < 3. Sem escolha de
                // alvo — o próprio ult sorteia.
                // REGRA (usuário): o Gancho IGNORA status — Proteção
                // Divina, Resistente, Veneno, qualquer status; o ÚNICO
                // critério é Poder ≤ 2. Não filtrar por `shielded` aqui.
                const targets = deps.gatherEnemyTargets(pid, c => c.currentPower < 3);
                if (!targets.length) {
                    deps.floatText("Nenhum adversário com Poder menor que 3.", "warn center", 2200);
                    deps.log("Puxão: sem alvos com Poder < 3.");
                    return;
                }
                // REGRA (usuário): Puxão IGNORA o limite de campo.
                // O Gancho sempre consegue puxar o adversário, mesmo
                // que o campo do caster já esteja lotado.
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "resurrect") {
                if (pl.field.length >= deps.MAX_FIELD) {
                    deps.notifyFieldFull(pid);
                    return;
                }
                const pick = deps.pickPaladinoRandomPower2Discard(pid);
                if (!pick) {
                    deps.floatText("Nenhum Campeão de Poder 2 no descarte.", "warn center", 2200);
                    deps.log("O Retorno do Herói: sem Campeão de Poder 2 no descarte.");
                    return;
                }
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "potion") {
                // ALQUIMISTA — escolhe Campeão SEU pra apostar.
                // Resistente não pode ser alvo (regra: imune à Poção).
                // NOVA regra (usuário): 60% +2 Poder, 40% -1 Poder.
                const allies = deps.gatherAllyTargets(pid, -1, allyTargetCanGainPower);
                if (!allies.length) {
                    deps.floatText("Sem Campeões no seu campo.", "warn center", 1800);
                    return;
                }
                deps.setGamePhase( "ultimate-target");
                deps.setTargetData( { ultimate: hero.id, caster: pid, targets: allies, targetIndex: 0 });
                deps.log("Qual Campeão deseja usar a Poção Improvável? (60% +2 Poder, 40% -1 Poder)");
                deps.updateUI();
            } else if (hero.ultimateType === "vampirism") {
                // VALMONT — Vampirismo: alvo adversário com Poder ≥ 2.
                const targets = deps.gatherEnemyTargets(pid, c => c.currentPower >= 2);
                if (!targets.length) {
                    deps.floatText("Nenhum Campeão adversário com Poder 2 ou mais.", "warn center", 2200);
                    deps.log("Vampirismo: sem alvos com Poder ≥ 2.");
                    return;
                }
                // Também precisa de pelo menos 1 aliado pra receber o +1
                // (regra do enunciado: aliado aleatório ganha +1). Se não
                // há aliado, ainda assim aplica o -1 no inimigo (efeito
                // parcial) — pra não consumir uso à toa, exigimos aliado.
                const allies = deps.gatherAllyTargets(pid, -1, allyTargetCanGainPower);
                if (!allies.length) {
                    deps.floatText("Você precisa de um Campeão aliado pra absorver o Poder.", "warn center", 2200);
                    deps.log("Vampirismo: sem aliado que possa ganhar +Poder.");
                    return;
                }
                deps.setGamePhase( "ultimate-target");
                deps.setTargetData( { ultimate: hero.id, caster: pid, targets, targetIndex: 0 });
                // Apenas UMA caixa de texto: floatText curto (sem o
                // ult-prompt-box duplicado). A animação cinematográfica
                // do Vampirismo já mostra o intro banner próprio.
                deps.log("Qual Campeão você quer usar o Vampirismo? (Campeões com Poder 2 ou mais)");
                deps.updateUI();
            } else if (hero.ultimateType === "banish") {
                // TECNOMAGO — Outra Dimensão: Poder impresso ≤ 2 (ignora Inspiração etc.)
                const targets = deps.gatherEnemyTargets(pid, c => deps.championBanishable(c));
                if (!targets.length) {
                    deps.floatText("Nenhum Campeão adversário com Poder 2 ou menos.", "warn center", 2200);
                    deps.log("Outra Dimensão: sem alvos com Poder ≤ 2.");
                    return;
                }
                deps.setGamePhase( "ultimate-target");
                deps.setTargetData( { ultimate: hero.id, caster: pid, targets, targetIndex: 0 });
                deps.log("Escolha um Campeão adversário com Poder 2 ou menos para Banir.");
                deps.updateUI();
            } else if (hero.ultimateType === "wallProtect") {
                // ALEXANDER — Muralha: sem alvo. Aplica +1 imediatamente
                // em todos os aliados em campo; reverte no início do
                // próximo turno do Alexander.
                if (!pl.field.length) {
                    deps.floatText("Você precisa de pelo menos 1 aliado em campo.", "warn center", 2200);
                    deps.log("Muralha: sem aliados em campo.");
                    return;
                }
                const needsWall = pl.field.some((c) => c && !c.wallBuff);
                if (!needsWall) {
                    deps.floatText("Todos os aliados já têm Muralha.", "warn center", 1800);
                    return;
                }
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "poison") {
                // QUIMERA — Envenenar: alvo adversário ainda não envenenado.
                // REGRA (usuário): Proteção NÃO bloqueia Envenenar — só
                // bloqueia ataques e reduções de Poder. Status (veneno,
                // congelar etc.) passa por cima de Proteção.
                const targets = deps.gatherEnemyTargets(pid, c => !c.poisoned);
                if (!targets.length) {
                    deps.floatText("Nenhum adversário disponível pra envenenar.", "warn center", 2200);
                    deps.log("Envenenar: sem alvos.");
                    return;
                }
                deps.setGamePhase( "ultimate-target");
                deps.setTargetData( { ultimate: hero.id, caster: pid, targets, targetIndex: 0 });
                deps.log("Escolha um Campeão adversário pra envenenar (morre em 2 rodadas).");
                deps.updateUI();
            } else if (hero.ultimateType === "infinitePower") {
                // HÉRCULES — Força Infinita (NOVA regra: afeta TODOS os
                // aliados em campo). Sem seleção de alvo — resolve direto.
                const anyValid = pl.field.some(c => deps.allyTargetCanGainPower(c) && !c.foreverGrowth);
                if (!anyValid) {
                    deps.floatText("Nenhum aliado pode receber Força Infinita.", "warn center", 2200);
                    deps.log("Força Infinita: sem aliados válidos.");
                    return;
                }
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "scareReturn") {
                // SINISTRELA — Amedrontar (ult): alvo adversário Poder ≤ 2.
                const targets = deps.gatherEnemyTargets(pid, c => c.currentPower <= 2);
                if (!targets.length) {
                    deps.floatText("Nenhum Campeão adversário com Poder 2 ou menos.", "warn center", 2200);
                    deps.log("Amedrontar (Sinistrela): sem alvos.");
                    return;
                }
                deps.setGamePhase( "ultimate-target");
                deps.setTargetData( { ultimate: hero.id, caster: pid, targets, targetIndex: 0 });
                deps.log("Escolha um Campeão adversário (Poder ≤ 2) pra devolver à mão do dono.");
                deps.updateUI();
            } else if (hero.ultimateType === "cometStarfall") {
                // ESTRELAR — efeito global, sem seleção.
                executeUltimate(pid, null, null);
            } else if (hero.ultimateType === "warOverpower") {
                // VIOLÊNCIA — Guerra: precisa de pelo menos 1 aliado em
                // campo, senão a ult seria desperdiçada (consome uso
                // sem efeito). Bloqueia ANTES de gastar a carga.
                if (!pl.field.length) {
                    deps.floatText("Sem aliados em campo pra Guerra.", "warn center", 2200);
                    deps.log("Guerra: nenhum aliado em campo.");
                    return;
                }
                executeUltimate(pid, null, null);
            }
        }

        async function beginUltimate(pIdx) {
            if (deps.getState().currentPlayer !== pIdx) {
                return { proceed: false, hero: null, cancelled: false };
            }
            const pl = deps.getState().players[pIdx];
            const hero = pl.heroDef || deps.getHeroDef(pl.heroId);
            const maxUlt = deps.getMaxUltimateUses(pl.heroId);
            if (!hero || pl.ultimateUses >= maxUlt || pl.usedUltimateThisTurn) {
                return { proceed: false, hero: null, cancelled: false };
            }
            // MP: não gastar uso até a janela de Cancelar Ultimate fechar.
            const onlineUlt = !!(window.__DF_ONLINE && !deps.getApplyingRemote?.());
            if (!onlineUlt) {
                pl.ultimateUses++;
                pl.usedUltimateThisTurn = true;
            }
            deps.log(`${pl.name} usou Ultimate: ${hero.ultimateName}!`);
            if (await deps.offerCancelUltimate(pIdx, hero)) {
                if (onlineUlt) {
                    // Cancel confirmado — não gasta uso no cliente; servidor já sabe.
                    deps.log(`Ultimate cancelada.`);
                } else {
                    deps.log(`Ultimate cancelada — o uso foi consumido mesmo assim.`);
                }
                deps.updateUI();
                return { proceed: false, hero, cancelled: true };
            }
            if (onlineUlt) {
                pl.ultimateUses++;
                pl.usedUltimateThisTurn = true;
            }
            return { proceed: true, hero, cancelled: false };
        }

        async function executeUltimate(pIdx, targetP, targetI) {
            if (deps.getState().currentPlayer !== pIdx) return;
            deps.dfEnsurePresentationUnblocked?.("ultimate-exec");
            const begun = await beginUltimate(pIdx);
            if (!begun.proceed) return;
            const pl = deps.getState().players[pIdx];
            const hero = begun.hero;
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                // MP-only: VFX/ACK pendurados não podem travar input até o fim do turno.
                const dfMpUnblockUltimate = () => {
                    try { deps.dfEnsurePresentationUnblocked?.("ultimate-mp-finally"); } catch (eU) { /* */ }
                    try { window.DfPresentationBus?.forceReset?.(); } catch (eB) { /* */ }
                    try { window.DfUltimateDirector?.purgeUltimateVfx?.(); } catch (eP) { /* */ }
                    try { document.documentElement.classList.remove("df-ult-cinematic"); } catch (eC) { /* */ }
                    try { deps.setGamePhase?.("normal"); } catch (eG) { /* */ }
                    try { deps.setTargetData?.({}); } catch (eT) { /* */ }
                    try { deps.dfPurgeTargetingVisuals?.(); } catch (eV) { /* */ }
                    try { window.dfPurgeTargetingVisuals?.(); } catch (eW) { /* */ }
                    try { deps.updateUI?.(); } catch (eUi) { /* */ }
                };
                try {
                const preField = deps.captureFieldForPostDestroy?.();
                const ackRes = await deps.dfOnlineBroadcastUltimatePlay(pIdx, hero, targetP, targetI);
                if (ackRes?.ok === false) return;
                // Cinemática com estado pré-ACK (ex.: Travessura da Princesa Slime).
                const replayMs = hero?.ultimateType === "targetAllyShield" ? 5200 : 9000;
                await Promise.race([
                    deps.dfOnlineReplayUltimate({
                        playerId: pIdx,
                        heroId: hero.id,
                        ultimateType: hero.ultimateType,
                        targetP: targetP ?? null,
                        targetI: targetI ?? null,
                        swapEnemyP: ackRes?.events?.find?.((e) => e?.type === "TRICKERY_SWAP")?.enemyP,
                        swapEnemyI: ackRes?.events?.find?.((e) => e?.type === "TRICKERY_SWAP")?.enemyI,
                        fromP: ackRes?.events?.find?.((e) => e?.type === "HOOK_STEAL")?.fromP,
                        fromI: ackRes?.events?.find?.((e) => e?.type === "HOOK_STEAL")?.fromI,
                        _events: ackRes?.events || [],
                        _preAuth: true,
                    }),
                    (typeof deps.wait === "function"
                        ? deps.wait(replayMs)
                        : new Promise((r) => setTimeout(r, replayMs))),
                ]);
                if (ackRes?.authoritativeState?.players?.length) {
                    // Ultimate Invocar Dragão: ocultar token até animateDragonSummon.
                    if (hero.ultimateType === "summonDragon") {
                        try {
                            window.dfOnlineMarkDragonTokensFromEvents?.(
                                ackRes.authoritativeState,
                                ackRes.events || [],
                            );
                        } catch (eM) { /* */ }
                    }
                    deps.dfOnlineReconcileSnapshot?.(
                        { state: ackRes.authoritativeState, full: true },
                        { skipPhase: true },
                    );
                    deps.updateUI();
                    if (hero.ultimateType === "summonDragon") {
                        const marked = [];
                        try {
                            const st = deps.getState();
                            for (const e of (ackRes.events || [])) {
                                if (e?.type !== "DRAGON_TOKEN_SUMMON" && e?.visual !== "dragon_token_summon") continue;
                                const op = e.ownerP ?? e.casterIdx ?? e.playerId ?? pIdx;
                                const field = st?.players?.[op]?.field;
                                if (!field?.length) continue;
                                let idx = e.insertIdx != null ? (e.insertIdx | 0) : field.length - 1;
                                if (e.uid) {
                                    const byUid = field.findIndex((c) => c && String(c.uid) === String(e.uid));
                                    if (byUid >= 0) idx = byUid;
                                }
                                if (field[idx]) marked.push({ ownerP: op | 0, idx });
                            }
                        } catch (eF) { /* */ }
                        try {
                            await window.dfOnlineAnimateMarkedDragonTokens?.(marked);
                        } catch (eA) { /* */ }
                    }
                }
                if (preField) deps.replayPostDestroyAfterAuthority?.(preField, { visualOnly: true });
                } finally {
                    dfMpUnblockUltimate();
                }
                return;
            }
            deps.dfBeginUltPerf();
            try {
            if (hero.ultimateType === "targetEnemy") {
                const cinematic = global.DfVfxEngine?.wantsUltimateCinematic?.()
                    || global.DfVfxEngine?.wantsCinematic?.()
                    || global.DfVfxSettings?.getMode?.() === "full";
                const preTarget = deps.getState().players[targetP].field[targetI];
                const willDestroy = !!preTarget && preTarget.currentPower <= 1;
                await deps.ultVfx(
                    () => ultimateCinematicFireball(pIdx, targetP, targetI, hero, willDestroy),
                    { fast: !cinematic },
                );
                const t = deps.getState().players[targetP].field[targetI]; if (!t) return;
                if (await deps.offerReactiveProtection(pIdx, targetP, t, hero.ultimateName || "Ultimate", true)) {
                    deps.updateUI(); deps.checkWin(); return;
                }
                if (await deps.consumeBarrierIfAny(targetP, targetI, hero.ultimateName || "Ultimate")) {
                    deps.updateUI(); deps.checkWin(); return;
                }
                global.__dfSuppressPowGemAnim = true;
                try {
                    deps.reduceChampionPower(t, 1, targetP, targetI);
                    if (t.currentPower <= 0) {
                        deps.destroyChampion(targetP, targetI, pIdx, "ultimate", { deferShatter: willDestroy });
                    }
                    deps.updateUI(); deps.checkWin();
                } finally {
                    global.__dfSuppressPowGemAnim = false;
                }
            } else if (hero.ultimateType === "targetEnemyFreeze") {
                const t = deps.getState().players[targetP].field[targetI]; if (!t) return;
                const freezeTurns = hero.id === "iceWitch" ? 3 : 2;
                t.frozen = true; t.frozenTurns = freezeTurns;
                await playUltCinematic(() => ultimateCinematicFreeze(pIdx, targetP, targetI, hero));
                deps.log(`${t.name} congelado por ${freezeTurns} rodadas!`);
                deps.updateUI();
            } else if (hero.ultimateType === "targetAlly") {
                const t = deps.getState().players[targetP].field[targetI]; if (!t) return;
                const cur = t.currentPower ?? t.power ?? t.basePower ?? 0;
                t.currentPower = cur + 1;
                await playUltCinematic(() => ultimateCinematicFortify(pIdx, targetP, targetI, hero));
                deps.log(`${t.name} +1 poder!`);
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "targetAllyFreeAttack") {
                const t = deps.getState().players[targetP].field[targetI]; if (!t) return;
                if (deps.cannotReceiveInvestida(t)) {
                    deps.flashRuleBanner("Banjo não pode receber Investida.", "O Urso Banjo é <b>Pesado Demais</b> — não aceita Investida.");
                    deps.updateUI();
                    return;
                }
                t.freeAttack = true;
                await playUltCinematic(() => ultimateCinematicCharge(pIdx, targetP, targetI, hero));
                deps.log(`${t.name} ganhou Investida!`);
                deps.updateUI();
            } else if (hero.ultimateType === "targetAllyShield") {
                const t = deps.getState().players[targetP].field[targetI]; if (!t) return;
                t.shielded = true; t.shieldedTurns = 1;
                await playUltCinematic(() => ultimateCinematicShield(pIdx, targetP, targetI, hero));
                deps.log(`${t.name} está protegido por 1 rodada!`);
                deps.updateUI();
            } else if (hero.ultimateType === "drawCard") {
                // Conjuração já voa portal→mão; drawCard(true) disparava
                // drawAnimToPlayer (2ª carta da borda) = duplicata visual.
                await playUltCinematic(() => ultimateCinematicConjure(pIdx, hero));
                deps.drawCard(pIdx, false);
                deps.log(`${pl.name} comprou uma carta!`);
                deps.updateUI();
            } else if (hero.ultimateType === "trickerySwap") {
                // targetP === pIdx, targetI === índice do aliado Poder 1 escolhido.
                const swap = deps.pickTrickerySwapTarget(pIdx);
                if (!swap) {
                    // Defesa: deveria ter sido barrado em startUltimate / aiUseUltimate
                    deps.log("Travessura: sem alvo adversário disponível.");
                    return;
                }
                await playUltCinematic(() => ultimateCinematicTrickery(pIdx, targetP, targetI, swap.p, swap.i, hero));
                deps.performTrickerySwap(pIdx, targetI, swap.p, swap.i);
                deps.log(`${pl.name} usou Travessura — troca de lugares!`);
                deps.updateUI();
                deps.checkWin();
            } else if (hero.ultimateType === "fireAndIce") {
                // JEKIRO — Fogo e Gelo (AOE): TODOS os Campeões
                // adversários são sorteados individualmente — 50% de
                // chance de CONGELAR (2 rodadas) e 50% de receber
                // BOLA DE FOGO (-1 Poder). Cada alvo recebe APENAS
                // UM dos dois efeitos. Snapshot prévio garante que
                // efeitos não se sobreponham se a contagem mudar.
                // Ordem visual: primeiro todos os congelamentos,
                // depois todas as queimas (fica mais legível).
                // SEM ultimateIntroBanner aqui — as cinemáticas helpers
                // (Freeze/Burn) já chamam o intro banner. Chamar de novo
                // criava banner duplicado.
                // Ordem visual: esquerda → direita (posição na tela); cada alvo
                // recebe congelamento OU baforada de fogo (50/50), um de cada vez.
                const enemies = [];
                const humanSeat = deps.dfHumanSeat?.() ?? deps.dfLocalSeat?.() ?? 0;
                const aiCasting = !window.__DF_ONLINE && pIdx !== humanSeat;
                for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                    if (ep === pIdx) continue;
                    deps.getState().players[ep].field.forEach((c, i) => {
                        if (!c) return;
                        // IA: não aplica Fogo e Gelo em já Envenenados.
                        if (aiCasting && c.poisoned) return;
                        const el = deps.getChampionDom?.(ep, i);
                        const tr = el?.getBoundingClientRect?.();
                        const sortX = tr ? tr.left + tr.width / 2 : ep * 1000 + i;
                        enemies.push({ p: ep, i, uid: c.uid, sortX });
                    });
                }
                enemies.sort((a, b) => a.sortX - b.sortX);

                const findEnemySlot = (slot) => {
                    const arr = deps.getState().players[slot.p]?.field || [];
                    for (let k = 0; k < arr.length; k++) {
                        if (arr[k]?.uid === slot.uid) return { p: slot.p, i: k };
                    }
                    return null;
                };

                for (const eSlot of enemies) {
                    const loc = findEnemySlot(eSlot);
                    if (!loc) continue;
                    const a = deps.getState().players[loc.p]?.field[loc.i];
                    if (!a || a.uid !== eSlot.uid) continue;
                    const targetUid = eSlot.uid;

                    if (Math.random() < 0.5) {
                        await playUltCinematic(() => ultimateCinematicFireAndIceFreeze(pIdx, loc.p, loc.i, hero, {
                            onBreathImpact: () => {
                                const hit = findEnemySlot(eSlot);
                                if (!hit) return;
                                const t = deps.getState().players[hit.p]?.field[hit.i];
                                if (!t || t.uid !== targetUid) return;
                                t.frozen = true;
                                t.frozenTurns = 2;
                                deps.log(`${t.name} congelado por 2 rodadas! (Fogo e Gelo)`);
                                deps.updateUI();
                            },
                        }));
                        continue;
                    }

                    if (await deps.offerReactiveProtection(pIdx, loc.p, a, hero.ultimateName, true)) {
                        deps.updateUI(); deps.checkWin();
                        continue;
                    }
                    if (await deps.consumeBarrierIfAny(loc.p, loc.i, hero.ultimateName || "Fogo e Gelo")) {
                        deps.updateUI(); deps.checkWin();
                        continue;
                    }
                    await playUltCinematic(() => ultimateCinematicFireAndIceBurn(pIdx, loc.p, loc.i, hero, {
                        onBreathImpact: () => {
                            const hit = findEnemySlot(eSlot);
                            if (!hit) return;
                            const b = deps.getState().players[hit.p]?.field[hit.i];
                            if (!b || b.uid !== targetUid) return;
                            deps.reduceChampionPower(b, 1, hit.p, hit.i);
                            deps.log(`${b.name} recebeu uma Baforada de Fogo! -1 Poder. (Fogo e Gelo)`);
                            if (b.currentPower <= 0) {
                                deps.destroyChampion(hit.p, hit.i, pIdx, "fireAndIce");
                            }
                            deps.updateUI();
                            deps.checkWin();
                        },
                    }));
                    if (global.__dfPendingDestroyVisual) {
                        try { await global.__dfPendingDestroyVisual; } catch (e) { /* */ }
                        global.__dfPendingDestroyVisual = null;
                    }
                }
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "summonDragon") {
                // SANGUE DE DRAGÃO — invoca Dragão Cúbico como ação livre.
                if (pl.field.length >= deps.MAX_FIELD) {
                    deps.notifyFieldFull(pIdx);
                    return;
                }
                await playUltCinematic(() => ultimateCinematicBloodDragon(pIdx, hero));
                await deps.summonDragonToken(pIdx, cubicDragonDef);
            } else if (hero.ultimateType === "hook") {
                // GANCHO — Puxão: sorteia 1 adversário com Poder < 3
                // (65% chance de Poder 1, 35% de Poder 2) e o ROUBA
                // PERMANENTEMENTE pro campo do caster. Máx 2 usos.
                // REGRA (usuário): Puxão IGNORA o limite de campo —
                // o Gancho rouba mesmo se o caster já tem o campo lotado.
                const stolen = deps.pickHookTarget(pIdx);
                if (!stolen) {
                    deps.log("Puxão: sem alvos válidos.");
                    return;
                }
                const srcOwner = stolen.p, srcIdx = stolen.i;
                const tgt = deps.getState().players[srcOwner].field[srcIdx];
                if (!tgt) return;
                await playUltCinematic(() => ultimateCinematicHook(pIdx, srcOwner, srcIdx, hero));
                deps.getState().players[srcOwner].field.splice(srcIdx, 1);
                // Roubo PERMANENTE: limpa flags de pulled, marca tapped
                // (não pode atacar no mesmo turno em que foi roubado).
                tgt.pulled = false;
                tgt.pulledFromOwner = -1;
                tgt.pulledTurns = 0;
                // Buffs específicos do dono original morrem na troca de
                // dono (Guerra/Sobrepujar temporário). Sem isso, um
                // Campeão buffado roubado manteria Sobrepujar pra sempre,
                // já que a limpeza só roda no campo do caster original.
                tgt.guerraBuff = false;
                tgt.guerraBuffTurns = 0;
                tgt.tapped = true;
                pl.field.push(tgt);
                deps.log(`${pl.name} roubou ${tgt.name} PERMANENTEMENTE com Puxão!`);
                // SEM floatText: aviso amarelo/vermelho proibido durante Ultimates.
                deps.updateUI();
                deps.checkWin();
            } else if (hero.ultimateType === "resurrect") {
                if (pl.field.length >= deps.MAX_FIELD) {
                    deps.notifyFieldFull(pIdx);
                    return;
                }
                const pick = deps.pickPaladinoRandomPower2Discard(pIdx);
                if (!pick) { deps.log("O Retorno do Herói: sem Campeão de Poder 2 no descarte."); return; }
                await deps.paladinoRevive(pIdx, pick, hero);
            } else if (hero.ultimateType === "potion") {
                // ALQUIMISTA — 60% +2 / 40% -1 no Campeão escolhido (regra usuário).
                const t = deps.getState().players[targetP]?.field[targetI];
                if (!t) return;
                const success = Math.random() < 0.60;
                await playUltCinematic(() => ultimateCinematicPotion(pIdx, targetP, targetI, hero, success));
                if (success) {
                    t.currentPower += 2;
                    deps.log(`${t.name} bebeu a poção e ganhou +2 de Poder!`);
                    // SEM floatText: aviso amarelo/verde proibido durante Ultimates.
                } else {
                    if (await deps.consumeBarrierIfAny(targetP, targetI, hero.ultimateName || "Poção")) {
                        deps.updateUI(); deps.checkWin(); return;
                    }
                    deps.reduceChampionPower(t, 1, targetP, targetI);
                    deps.log(`${t.name} bebeu a poção errada e perdeu 1 de Poder!`);
                    // SEM floatText "-1 Poder" aqui: o usuário pediu pra
                    // remover qualquer aviso amarelo/vermelho durante
                    // Ults/Habilidades/Talentos. A animação da ult já
                    // comunica o resultado.
                    if (t.currentPower <= 0) deps.destroyChampion(targetP, targetI, pIdx, "ultimate");
                }
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "vampirism") {
                // VALMONT — Vampirismo: -1 Poder no alvo escolhido + aliado
                // aleatório (que possa ganhar Poder) recebe +1. Animação
                // mostra sangue fluindo do inimigo pro aliado.
                const enemy = deps.getState().players[targetP]?.field[targetI];
                if (!enemy) return;
                // Reativa: Proteção Divina NÃO bloqueia mais Ultimates
                // (nova regra). Mantemos a chamada por consistência;
                // a função retorna false cedo quando isUltimate=true.
                if (await deps.offerReactiveProtection(pIdx, targetP, enemy, hero.ultimateName, true)) {
                    deps.updateUI(); deps.checkWin(); return;
                }
                // Sorteia o aliado que vai absorver o poder.
                const allies = [];
                pl.field.forEach((c, i) => { if (deps.allyTargetCanGainPower(c)) allies.push(i); });
                if (!allies.length) {
                    // Defesa: deveria ter sido barrado em startUltimate.
                    deps.reduceChampionPower(enemy, 1, targetP, targetI);
                    if (enemy.currentPower <= 0) deps.destroyChampion(targetP, targetI, pIdx, "ultimate");
                    deps.updateUI(); deps.checkWin(); return;
                }
                const allyI = allies[Math.floor(Math.random() * allies.length)];
                await playUltCinematic(() => ultimateCinematicVampirism(pIdx, targetP, targetI, allyI, hero));
                deps.reduceChampionPower(enemy, 1, targetP, targetI);
                const ally = pl.field[allyI];
                if (ally) ally.currentPower += 1;
                deps.log(`${pl.name} usou Vampirismo: ${enemy.name} -1 Poder, ${ally ? ally.name : "aliado"} +1 Poder!`);
                if (enemy.currentPower <= 0) deps.destroyChampion(targetP, targetI, pIdx, "ultimate");
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "banish") {
                // TECNOMAGO — Outra Dimensão: BANE o Campeão (não vai pro
                // descarte) — não dá PV, não dispara "Sem Honra", não
                // atualiza lastDestroyedSummon (a carta deixou de existir).
                const enemy = deps.getState().players[targetP]?.field[targetI];
                if (!enemy) return;
                if (!deps.championBanishable(enemy)) {
                    deps.log("Outra Dimensão: alvo precisa ter Poder impresso ≤ 2.");
                    deps.floatText("Alvo inválido (Poder impresso > 2).", "warn center", 1800);
                    return;
                }
                // Reativa: Proteção Divina NÃO bloqueia mais Ultimates
                // (nova regra). Retorna false cedo dentro da função.
                if (await deps.offerReactiveProtection(pIdx, targetP, enemy, hero.ultimateName, true)) {
                    deps.updateUI(); deps.checkWin(); return;
                }
                // Banir ≠ destruição: só a cinemática do buraco negro
                // (sem estilhaço). Manual: carta some da dimensão.
                await playUltCinematic(() => ultimateCinematicBanish(pIdx, targetP, targetI, hero));
                deps.getState().players[targetP].field.splice(targetI, 1);
                deps.log(`${pl.name} BANIU ${enemy.name} para outra dimensão!`);
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "thunderDiscard") {
                // TROVOADA (Thor): raio primeiro; depois cada carta sai
                // visualmente da MÃO e voa pro descarte (sem texto/banner).
                await playUltCinematic(() => ultimateCinematicThunder(pIdx, hero));
                await deps.wait(140);
                const discards = [];
                for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                    if (ep === pIdx) continue;
                    const opp = deps.getState().players[ep];
                    if (!opp.hand.length) continue;
                    const idx = Math.floor(Math.random() * opp.hand.length);
                    discards.push({ ep, idx, card: opp.hand[idx] });
                }
                for (const d of discards) {
                    await animateThunderDiscardFromHand(d.ep, d.idx);
                    const opp = deps.getState().players[d.ep];
                    const removed = opp.hand.splice(d.idx, 1)[0];
                    deps.pushDiscard(d.ep, removed);
                    deps.log(`⚡ ${opp.name} descartou ${removed.name} da MÃO.`);
                }
                deps.updateUI();
            } else if (hero.ultimateType === "wallProtect") {
                // ALEXANDER — Muralha:
                //   • Cast: marca status `wallBuff` permanente nos aliados.
                //   • Fim do turno do dono: +1 Poder fora do turno.
                //   • Início do turno do dono: −1 só em quem tem wallBuff.
                //   • Status eterno até o Campeão perder Poder (≥1).
                pl.wallActive = pl.field.some((c) => c && c.wallBuff);
                pl.wallCasterIdx = pIdx;
                for (const c of pl.field) {
                    if (!c || c.wallBuff) continue;
                    c.wallBuff = true;
                    c.wallBuffApplied = false;
                    c.wallBuffReveal = true;
                    pl.wallActive = true;
                }
                deps.log(`${pl.name} ergueu a MURALHA — aliados ficam protegidos!`);
                await playUltCinematic(() => ultimateCinematicWall(pIdx, hero));
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "poison") {
                // Quimera — Envenenar: animação primeiro (baforada), depois status.
                const t = deps.getState().players[targetP]?.field[targetI];
                if (!t) return;
                await playUltCinematic(() => ultimateCinematicPoison(pIdx, targetP, targetI, hero));
                t.poisoned = true;
                t.poisonTurns = 2;
                t.poisonedByP = pIdx;
                deps.log(`${t.name} foi ENVENENADO — morrerá em 2 rodadas!`);
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "infinitePower") {
                // HÉRCULES — Força Infinita (NOVA regra do usuário):
                // TODOS os aliados em campo recebem o status foreverGrowth
                // (+1 Poder por rodada permanente). Sem +1 imediato; o
                // bônus começa na próxima manutenção do dono.
                const buffedTargets = [];
                let count = 0;
                pl.field.forEach((c, i) => {
                    if (deps.allyTargetCanGainPower(c) && !c.foreverGrowth) {
                        c.foreverGrowth = true;
                        buffedTargets.push({ targetP: pIdx, targetI: i });
                        count++;
                    }
                });
                deps.log(`${pl.name} usou FORÇA INFINITA — ${count} aliado(s) ganharam +1 Poder a cada rodada!`);
                await playUltCinematic(() => ultimateCinematicMight(pIdx, buffedTargets, hero));
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "scareReturn") {
                // SINISTRELA — Amedrontar (ult): devolve Campeão
                // adversário (Poder ≤ 2) à mão do dono.
                const t = deps.getState().players[targetP]?.field[targetI];
                if (!t) return;
                deps.log(`${t.name} foi AMEDRONTADO e volta pra mão do dono!`);
                await playUltCinematic(() => ultimateCinematicScare(pIdx, targetP, targetI, hero));
                await deps.resolveScareReturn(pIdx, targetP, targetI, true);
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "cometStarfall") {
                // ESTRELAR — Cometa Estrelar: cometa cai, TODOS perdem 1
                // Poder. PV só pelos adversários destruídos (próprios não
                // dão PV — passamos killerIdx=null nesses casos).
                await playUltCinematic(() => ultimateCinematicComet(pIdx, hero));
                // Aplica -1 e coleta lista de mortos (de trás pra frente
                // por field pra não bagunçar índices). Reativa Proteção
                // Divina pode bloquear o -1 caso a caso.
                let enemyKills = 0;
                let allyKills = 0;
                for (let ep = 0; ep < deps.getState().playersCount; ep++) {
                    const fld = deps.getState().players[ep].field;
                    for (let i = fld.length - 1; i >= 0; i--) {
                        const c = fld[i];
                        if (!c) continue;
                        if (typeof c.currentPower !== "number") {
                            c.currentPower = c.basePower ?? c.power ?? 0;
                        }
                        if (await deps.offerReactiveProtection(pIdx, ep, c, hero.ultimateName, true)) continue;
                        if (await deps.consumeBarrierIfAny(ep, i, hero.ultimateName || "Cometa Estrelar")) continue;
                        deps.reduceChampionPower(c, 1, ep, i);
                        if (c.currentPower <= 0) {
                            const isEnemy = ep !== pIdx;
                            if (isEnemy) { enemyKills++; deps.destroyChampion(ep, i, pIdx, "cometStarfall"); }
                            else { allyKills++; deps.destroyChampion(ep, i, null, "cometStarfall"); }
                            if (global.__dfPendingDestroyVisual) {
                                await global.__dfPendingDestroyVisual;
                                global.__dfPendingDestroyVisual = null;
                            }
                        }
                    }
                }
                deps.log(`☄️ Cometa Estrelar destruiu ${enemyKills} adversário(s) e ${allyKills} aliado(s).`);
                if (enemyKills >= 3) {
                    deps.floatText(`☄️ ${enemyKills} adversários destruídos!`, "vp center", 2000);
                }
                deps.updateUI(); deps.checkWin();
            } else if (hero.ultimateType === "warOverpower") {
                // VIOLÊNCIA — Guerra: impacto roxo + fumaça em cada aliado,
                // depois o status Sobrepujar aparece na coroa.
                await playUltCinematic(() => ultimateCinematicWar(pIdx, hero));
                let count = 0;
                pl.field.forEach(c => {
                    c.guerraBuff = true;
                    c.guerraBuffTurns = 1;
                    count++;
                });
                pl.guerraActive = true;
                deps.log(`⚔️ GUERRA! ${count} aliado(s) ganharam Sobrepujar por 1 rodada.`);
                deps.updateUI();
                await dfAnimateGuerraStatusReveal(pIdx);
                deps.checkWin();
            }
            } finally {
                deps.dfEndUltPerf();
            }
        }

        async function ultimateIntroBanner(hero, theme) {
            if (!hero) return;
            const t = theme || {};
            await deps.getDfAnim().preAnimBanner({
                category: "ultimate",
                title: hero.ultimateName || "",
                subtitle: hero.name || "",
                theme: {
                    emoji: t.emoji || hero.emoji || "✨",
                    color: t.color || "#ffd060",
                    ring: t.ring || "#fff8d0",
                },
            });
        }

        async function ultimateCinematicBomb(pIdx, targetP, targetI, hero, willDestroy = false) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("targetEnemy", {
                casterP: pIdx,
                targetP,
                targetI,
                willDestroy,
                ultimateName: hero?.ultimateName,
                casterName: hero?.name,
            });
        }

        async function ultimateCinematicFireball(pIdx, targetP, targetI, hero, willDestroy = false) {
            return ultimateCinematicBomb(pIdx, targetP, targetI, hero, willDestroy);
        }

        async function ultimateCinematicFreeze(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("targetEnemyFreeze", { casterP: pIdx, targetP, targetI });
        }

        async function ultimateCinematicFortify(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playFortify({
                casterP: pIdx,
                casterField: -1,
                targetP,
                targetI,
                premium: true,
            });
        }

        async function ultimateCinematicCharge(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("targetAllyFreeAttack", { casterP: pIdx, targetP, targetI });
        }

        async function ultimateCinematicShield(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("targetAllyShield", { casterP: pIdx, targetP, targetI });
        }

        async function ultimateCinematicConjure(pIdx, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("drawCard", { casterP: pIdx });
        }

        async function ultimateCinematicTrickery(pIdx, allyP, allyI, enemyP, enemyI, hero) {
            try { window.sfx && window.sfx("magic"); } catch (e) {}
            await playTrickerySwapVisual(allyP, allyI, enemyP, enemyI);
        }

        async function ultimateCinematicThunder(pIdx, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            // Pedido do autor: o raio cai bem no CENTRO do campo de batalha
            // (antes era um raio por quadrante). Usamos o centro do tabuleiro
            // (game-grid) e marcamos TODOS os oponentes em `tremorAll` para o
            // tremor/efeito continuar atingindo cada um deles.
            const grid = document.getElementById("game-grid")
                || document.getElementById("game-board")
                || document.getElementById("game");
            const r = grid?.getBoundingClientRect();
            const cx = r && r.width ? r.left + r.width / 2 : window.innerWidth / 2;
            const cy = r && r.height ? r.top + r.height / 2 : window.innerHeight / 2;
            const oppQuadrants = [];
            for (let p = 0; p < deps.getState().playersCount; p++) {
                if (p === pIdx) continue;
                oppQuadrants.push(p);
            }
            const strikePoints = [{ x: cx, y: cy, p: oppQuadrants[0] ?? pIdx, tremorAll: oppQuadrants }];
            await SV.playUltimate("thunderDiscard", { casterP: pIdx, strikePoints });
        }

        async function ultimateCinematicComet(pIdx, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("cometStarfall", {
                casterP: pIdx,
                playersCount: deps.getState().playersCount,
            });
        }

        async function ultimateCinematicWall(pIdx, hero) {
            const fieldTargets = [];
            deps.getState().players[pIdx].field.forEach((c, i) => {
                if (c?.wallBuff && c.wallBuffReveal === false) {
                    fieldTargets.push({ targetP: pIdx, targetI: i });
                }
            });
            const pixiTargets = fieldTargets.map((t) => {
                const el = deps.getChampionDom(t.targetP, t.targetI);
                const tr = el?.getBoundingClientRect?.() || { left: 0, top: 0, width: 48, height: 68 };
                return {
                    x: tr.left + tr.width / 2,
                    y: tr.top + tr.height / 2,
                };
            });
            const gpuWall = window.DfVfxEngine?.wantsGpuPresentation?.()
                && typeof window.DfPixiVfx?.playWallProtectScene === "function";
            if (gpuWall && pixiTargets.length) {
                try { window.sfx && window.sfx("wall"); } catch (e) { /* */ }
                await window.DfPixiVfx.playWallProtectScene({ targets: pixiTargets, cinematic: true });
            }
            const SV = getSpriteVfx();
            if (!SV) {
                fieldTargets.forEach((t) => deps.revealWallBuffOnCard?.(t.targetP, t.targetI));
                return;
            }
            await SV.playUltimate("wallProtect", {
                casterP: pIdx,
                fieldTargets,
                onWallStoneHit: deps.revealWallBuffOnCard,
            });
        }

        async function ultimateCinematicPoison(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("poison", { casterP: pIdx, targetP, targetI });
        }

        async function ultimateCinematicMight(pIdx, fieldTargets, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            const targets = Array.isArray(fieldTargets) ? fieldTargets
                : (fieldTargets?.targetI != null
                    ? [{ targetP: pIdx, targetI: fieldTargets.targetI }]
                    : []);
            await SV.playUltimate("infinitePower", { casterP: pIdx, fieldTargets: targets });
        }

        async function ultimateCinematicScare(pIdx, targetP, targetI, hero) {
            const t = deps.getState().players[targetP]?.field[targetI];
            if (!t) return;
            await deps.playScareReturnVisual(
                targetP, targetI, deps.dfScareCardSnapFromState(t), null, { ultimate: true },
            );
        }

        async function ultimateCinematicWar(pIdx, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            const fieldTargets = [];
            deps.getState().players[pIdx].field.forEach((c, i) => fieldTargets.push({ targetP: pIdx, targetI: i }));
            await SV.playUltimate("warOverpower", { casterP: pIdx, fieldTargets });
        }

        async function ultimateCinematicFireAndIceFreeze(pIdx, targetP, targetI, hero, extra = {}) {
            let impactDone = false;
            const onImpact = () => {
                if (impactDone) return;
                impactDone = true;
                try { extra.onBreathImpact?.(); } catch (e) { /* */ }
            };
            await deps.ensureVfxReady?.();
            try {
                await global.DfVfxEngine?.ensureCinematicReady?.({ waitFull: true, maxMs: 8000 });
            } catch (e) { /* */ }
            // Preferir director/Pixi (baforada); SpriteVfx só encaminha ao director.
            const dir = global.DfUltimateDirector;
            if (dir?.play) {
                if (!dir.isReady?.()) dir.ensureInstalled?.();
                await dir.play("fireAndIceFreeze", {
                    casterP: pIdx, targetP, targetI, hero,
                    onBreathImpact: onImpact, cinematic: true,
                });
                onImpact();
                return;
            }
            const engine = global.DfVfxEngine;
            if (engine?.playUltimate) {
                await engine.playUltimate("fireAndIceFreeze", {
                    casterP: pIdx, targetP, targetI,
                    onBreathImpact: onImpact,
                });
                onImpact();
                return;
            }
            const SV = getSpriteVfx();
            if (SV?.playUltimate) {
                await SV.playUltimate("fireAndIceFreeze", {
                    casterP: pIdx, targetP, targetI,
                    onBreathImpact: onImpact,
                });
            }
            onImpact();
        }

        async function ultimateCinematicFireAndIceBurn(pIdx, targetP, targetI, hero, extra = {}) {
            let impactDone = false;
            const onImpact = () => {
                if (impactDone) return;
                impactDone = true;
                try { extra.onBreathImpact?.(); } catch (e) { /* */ }
            };
            await deps.ensureVfxReady?.();
            try {
                await global.DfVfxEngine?.ensureCinematicReady?.({ waitFull: true, maxMs: 8000 });
            } catch (e) { /* */ }
            const dir = global.DfUltimateDirector;
            if (dir?.play) {
                if (!dir.isReady?.()) dir.ensureInstalled?.();
                await dir.play("fireAndIceBurn", {
                    casterP: pIdx, targetP, targetI, hero,
                    onBreathImpact: onImpact, cinematic: true,
                });
                onImpact();
                return;
            }
            const engine = global.DfVfxEngine;
            if (engine?.playUltimate) {
                await engine.playUltimate("fireAndIceBurn", {
                    casterP: pIdx, targetP, targetI,
                    onBreathImpact: onImpact,
                });
                onImpact();
                return;
            }
            const SV = getSpriteVfx();
            if (SV?.playUltimate) {
                await SV.playUltimate("fireAndIceBurn", {
                    casterP: pIdx, targetP, targetI,
                    onBreathImpact: onImpact,
                });
            }
            onImpact();
        }

        async function ultimateCinematicBloodDragon(pIdx, hero) {
            await deps.ensureVfxReady?.();
            await window.DfVfxEngine?.ensureCinematicReady?.({ maxMs: 8000 }).catch(() => false);
            deps.dfEnsurePresentationUnblocked?.("ultimate-summonDragon");
            const slot = deps.getState().players[pIdx]?.field?.length ?? 0;
            const SV = getSpriteVfx();
            if (SV?.playUltimate) {
                await SV.playUltimate("summonDragon", { casterP: pIdx, fieldSlot: slot });
                return;
            }
            let cx = null;
            let cy = null;
            const q = document.getElementById(`quadrant-${deps.dfQuadrantForPlayer?.(pIdx) ?? pIdx}`);
            const qr = q?.getBoundingClientRect?.();
            if (qr && qr.width > 4) {
                cx = qr.left + qr.width * 0.5;
                cy = qr.top + qr.height * 0.42;
            }
            if (cx != null && typeof window.DfPixiVfx?.playDragonMeteorScene === "function") {
                await window.DfPixiVfx.playDragonMeteorScene({ cx, cy, cinematic: true });
            }
        }

        async function ultimateCinematicHook(pIdx, targetP, targetI, hero) {
            const SV = getSpriteVfx();
            if (!SV) return;
            const destSlot = deps.getState().players[pIdx]?.field?.length ?? 0;
            await SV.playUltimate("hook", { casterP: pIdx, targetP, targetI, destSlot });
        }

        async function ultimateCinematicPotion(pIdx, targetP, targetI, hero, success) {
            deps.updateUI(true);
            await deps.wait(60);
            try { await deps.ensureVfxReady?.(); } catch (e) { /* */ }
            const SV = getSpriteVfx();
            let ran = false;
            if (SV?.playUltimate) {
                try {
                    const ret = await SV.playUltimate("potion", {
                        casterP: pIdx, targetP, targetI, success: !!success,
                    });
                    ran = ret !== false;
                } catch (e) {
                    ran = false;
                }
            }
            if (!ran) {
                await playAlchemistPotionVisual(targetP, targetI, !!success);
            }
        }

        async function ultimateCinematicVampirism(pIdx, enemyP, enemyI, allyI, hero) {
            try { await deps.ensureVfxReady?.(); } catch (e) { /* */ }
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("vampirism", {
                casterP: pIdx, enemyP, enemyI, allyI,
                targetP: enemyP, targetI: enemyI,
            });
        }

        async function ultimateCinematicBanish(pIdx, targetP, targetI, hero) {
            try { await deps.ensureVfxReady?.(); } catch (e) { /* */ }
            const SV = getSpriteVfx();
            if (!SV) return;
            await SV.playUltimate("banish", { casterP: pIdx, targetP, targetI });
        }

        async function dfAnimateGuerraStatusReveal(pIdx) {
            const icons = [];
            deps.getState().players[pIdx]?.field.forEach((c, i) => {
                if (!c.guerraBuff) return;
                const el = deps.getChampionDom(pIdx, i);
                const icon = el?.querySelector(".status-icon.guerra-buff");
                if (icon) icons.push(icon);
            });
            if (!icons.length) return;
            icons.forEach((icon, i) => {
                setTimeout(() => {
                    icon.classList.add("guerra-status-reveal");
                    setTimeout(() => icon.classList.remove("guerra-status-reveal"), 820);
                }, i * 90);
            });
            await deps.wait((window.__dfFX?.mobile) ? 520 : 680);
        }

        async function commitActiveTalent(ownerP, flyToDiscard = true, fieldLingerMs = deps.DF_TALENT_DISCARD_LINGER_MS) {
            const at = deps.getState().activeTalent;
            if (!at?.card || at.ownerP !== ownerP) return null;
            const card = at.card;
            let discardBroadcast = false;
            try {
                if (fieldLingerMs > 0) {
                    deps.updateUI();
                    const el = window.__dfTalentSpotlightEl?.();
                    el?.classList.add("talent-spotlight-active");
                    await deps.wait(fieldLingerMs);
                    el?.classList.remove("talent-spotlight-active");
                }
                if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                    deps.dfOnlineBroadcastVisual?.({
                        kind: "talent_discard",
                        ownerP,
                        cardName: card.name || null,
                        talentEffect: card.talentEffect || null,
                    });
                    discardBroadcast = true;
                }
                if (flyToDiscard) {
                    try {
                        await Promise.race([
                            deps.flyActiveTalentToDiscard(ownerP),
                            deps.wait(2200),
                        ]);
                    } catch (e) {}
                }
            } finally {
                if (window.__DF_ONLINE && !deps.getApplyingRemote() && !discardBroadcast) {
                    try {
                        deps.dfOnlineBroadcastVisual?.({
                            kind: "talent_discard",
                            ownerP,
                            cardName: card.name || null,
                            talentEffect: card.talentEffect || null,
                        });
                    } catch (e) { /* */ }
                }
                try { deps.pushDiscard(ownerP, card); } catch (e) { /* */ }
                deps.getState().activeTalent = null;
                if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                    try {
                        void deps.dfOnlinePublishTalentDiscard?.(ownerP, card);
                    } catch (e) { /* */ }
                }
                try {
                    const layer = document.getElementById("talent-spotlight-layer");
                    layer?.replaceChildren?.();
                    layer?.classList?.remove("talent-spotlight-above-hud", "talent-spotlight-touch-hud");
                } catch (e) { /* */ }
                deps.dfInvalidateQuadrantFp(ownerP);
                deps.updateUI(true);
            }
            return card;
        }

        async function resolveTalentBolaDeFogo(_handIdx, targetP, targetI) {
            const ownerP = deps.getState().activeTalent?.ownerP ?? deps.dfHumanSeat();
            const originOverride = deps.dfCaptureTalentCardOrigin(ownerP);
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "bolaDeFogoTalento") return;
            try { window.sfx && window.sfx("fireball"); } catch (e) {}
            deps.log("Talento Bola de Fogo!");
            try {
                await deps.ensureVfxReady?.();
                await global.DfSpriteVfx?.init?.();
                await deps.castBolaDeFogo(ownerP, -1, targetP, targetI, true, originOverride);
            } finally {
                await commitActiveTalent(ownerP);
            }
        }

        async function resolveTalentExplosao(_handIdx, targetP, targetI) {
            const ownerP = deps.getState().activeTalent?.ownerP ?? deps.dfLocalSeat();
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "explosao") return;
            // Limpa mira antes do resolve — evita destaque preso / protectLocal.
            try {
                deps.setGamePhase?.("normal");
                deps.setTargetData?.({});
                deps.dfPurgeTargetingVisuals?.();
            } catch (e) { /* */ }
            if (!deps.getApplyingRemote()) {
                await deps.getDfAnim().preAnimBanner({
                    category: "talent",
                    title: card.name,
                    subtitle: "Carta de Talento",
                    theme: deps.getDfAnim().themeForCard(card),
                });
            }
            // Custo já debitado no TALENT_START (servidor / mão). Não debitar de novo no PvP.
            if (!(window.__DF_ONLINE && !deps.getApplyingRemote())) {
                const cost = card.currentPower || card.power || 0;
                if (cost > 0) deps.getState().players[ownerP].actions = Math.max(0, deps.getState().players[ownerP].actions - cost);
            }
            try { window.sfx && window.sfx("explosao"); } catch (e) {}
            deps.log("💥 Talento EXPLOSÃO!");
            const pvp = window.__DF_ONLINE && !deps.getApplyingRemote();
            if (pvp) {
                const pre = deps.getState().players[targetP]?.field[targetI];
                const prePow = pre?.currentPower ?? pre?.power ?? 0;
                const nextPow = Math.max(0, prePow - 2);
                deps.dfOnlineBroadcastVisual({
                    kind: "explosao",
                    casterP: ownerP,
                    targetP,
                    targetI,
                    powerAfter: nextPow,
                    fieldPatches: nextPow <= 0
                        ? [{ targetP, targetI, removed: true }]
                        : [{ targetP, targetI, currentPower: nextPow }],
                });
                try {
                    if (typeof deps.castExplosao === "function") {
                        await deps.castExplosao(ownerP, targetP, targetI);
                    } else {
                        await deps.playExplosaoVisual?.(ownerP, targetP, targetI);
                        await deps.applyExplosaoMechanics(ownerP, targetP, targetI);
                    }
                } finally {
                    await commitActiveTalent(ownerP);
                }
                deps.setGamePhase?.("normal");
                deps.setTargetData?.({});
                deps.dfPurgeTargetingVisuals?.();
            } else {
                try {
                    if (typeof deps.castExplosao === "function") {
                        await deps.castExplosao(ownerP, targetP, targetI);
                    } else {
                        await deps.playExplosaoVisual?.(ownerP, targetP, targetI);
                        await deps.applyExplosaoMechanics(ownerP, targetP, targetI);
                    }
                } finally {
                    await commitActiveTalent(ownerP);
                }
            }
            deps.updateUI();
            deps.checkWin();
        }

        async function resolveTalentZeroAbsoluto(_handIdx, targetP, targetI) {
            const ownerP = deps.getState().activeTalent?.ownerP ?? deps.dfLocalSeat();
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "zeroAbsoluto") return;
            if (!deps.getApplyingRemote()) {
                await deps.getDfAnim().preAnimBanner({
                    category: "talent",
                    title: card.name,
                    subtitle: "Carta de Talento",
                    theme: deps.getDfAnim().themeForCard(card),
                });
            }
            try { window.sfx && window.sfx("zero_absoluto"); } catch (e) {}
            deps.log("❄️ Talento ZERO ABSOLUTO!");
            const pvp = window.__DF_ONLINE && !deps.getApplyingRemote();
            if (pvp) {
                const pre = deps.getState().players[targetP]?.field[targetI];
                const wasFrozen = !!(pre && pre.frozen);
                const fieldPatches = wasFrozen
                    ? [{ targetP, targetI, removed: true }]
                    : [{ targetP, targetI, frozen: true, frozenTurns: 3 }];
                deps.dfOnlineBroadcastVisual({
                    kind: "zero_absoluto", casterP: ownerP, targetP, targetI, wasFrozen,
                    fieldPatches,
                });
                try {
                    await deps.playZeroAbsolutoVisual(ownerP, targetP, targetI, { wasFrozen });
                    await deps.applyZeroAbsolutoMechanics(ownerP, targetP, targetI);
                } finally {
                    await commitActiveTalent(ownerP);
                }
            } else {
                try {
                    await deps.castZeroAbsoluto(ownerP, targetP, targetI);
                } finally {
                    await commitActiveTalent(ownerP);
                }
            }
            deps.updateUI();
            deps.checkWin();
        }

        async function resolveTalentDoppelganger(ownerP) {
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "doppelganger") return;
            await deps.getDfAnim().preAnimBanner({
                category: "talent",
                title: card.name,
                subtitle: "Carta de Talento",
                theme: { color: "#ff3030", ring: "#ff9090", emoji: "👥" },
            });
            await deps.animateDoppelgangerTalentCast(ownerP);
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                deps.dfOnlineBroadcastVisual?.({
                    kind: "doppel_cast",
                    ownerP,
                    cardName: card.name,
                    talentEffect: "doppelganger",
                });
            }
            const allies = deps.gatherAllyTargets(ownerP, -1, ch => ch && ch.currentPower === 2);
            if (!allies.length || deps.getState().players[ownerP].field.length >= deps.MAX_FIELD) {
                deps.log("Doppelganger: sem alvo ou campo cheio.");
                await commitActiveTalent(ownerP);
                deps.updateUI();
                return;
            }
            const pick = allies[Math.floor(Math.random() * allies.length)];
            const src = deps.getState().players[ownerP].field[pick.i];
            if (!src) {
                await commitActiveTalent(ownerP);
                deps.updateUI();
                return;
            }
            const dup = deps.duplicateFieldChampion(src);
            if (deps.hasConstantInvestida(dup) && deps.getState().currentPlayer === ownerP) dup.freeAttack = true;
            deps.getState().players[ownerP].field.push(dup);
            const newIdx = deps.getState().players[ownerP].field.length - 1;
            deps.log(`${deps.getState().players[ownerP].name} duplicou ${src.name} (Doppelganger)!`);
            deps.updateUI();
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                const cardSnap = JSON.parse(JSON.stringify(dup));
                // Só FIELD_COMMIT com after_vfx — sem PRESENT paralelo (peer via
                // presentationEnvelope.visuals → VFX → auth).
                try {
                    if (typeof deps.dfOnlineSendActionAwait === "function") {
                        const ack = await deps.dfOnlineSendActionAwait({
                            type: "FIELD_COMMIT",
                            mutations: [{
                                op: "insertToken",
                                targetP: ownerP,
                                targetI: newIdx,
                                card: cardSnap,
                            }],
                            anim: {
                                kind: "doppel_clone",
                                ownerP,
                                sourceI: pick.i,
                                insertIdx: newIdx,
                                card: cardSnap,
                                fieldPatches: [{ targetP: ownerP, targetI: newIdx, insert: cardSnap }],
                            },
                        }, { noSnap: true });
                        if (ack?.authoritativeState?.players?.length) {
                            deps.dfOnlineReconcileSnapshot?.(
                                { state: ack.authoritativeState, full: true },
                                { skipPhase: true },
                            );
                        }
                    }
                } catch (e) {
                    console.warn("[DF online] doppelganger FIELD_COMMIT", e);
                }
            }
            await deps.animateDoppelgangerClone(ownerP, pick.i, newIdx);
            deps.updateUI();
            deps.checkWin();
            await commitActiveTalent(ownerP);
        }

        async function resolveTalentFortalecer(targetP, targetI) {
            const ownerP = deps.getState().activeTalent?.ownerP ?? 0;
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "fortalecerTalento") return;
            if (!deps.dfMatchAlive()) return;
            try { deps.dfDismissTargetingPhase?.(); } catch (e) { /* */ }
            try { deps.dfPurgeTargetingVisuals?.(); } catch (e2) { /* */ }
            const t = deps.getState().players[targetP]?.field[targetI];
            if (!t) return;
            dfBumpChampionPower(t, 1);
            deps.log(`${deps.getState().players[ownerP].name} fortaleceu ${t.name} (+1 Poder)!`);
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                deps.dfOnlineBroadcastVisual({
                    kind: "strong_arm",
                    targetP,
                    targetI,
                    powerAfter: t.currentPower,
                    casterP: ownerP,
                    fromTalent: true,
                    fieldPatches: [{ targetP, targetI, currentPower: t.currentPower }],
                });
                if (typeof deps.dfOnlineCommitStatus === "function") {
                    void deps.dfOnlineCommitStatus(targetP, targetI, { broadcast: false });
                }
                // MP: VFX + commit do talento sem bloquear o clique (anti-freeze).
                void (async () => {
                    try {
                        await deps.animateStrongArm(targetP, targetI, { casterP: ownerP, fromTalent: true });
                    } catch (e) { /* */ }
                    try { deps.updateUI(); } catch (e2) { /* */ }
                    try { deps.checkWin(); } catch (e3) { /* */ }
                    try { await commitActiveTalent(ownerP); } catch (e4) { /* */ }
                })();
                return;
            }
            await deps.animateStrongArm(targetP, targetI, { casterP: ownerP, fromTalent: true });
            deps.updateUI();
            deps.checkWin();
            await commitActiveTalent(ownerP);
            // FIELD_COMMIT setStatus persiste o +1 no servidor.
        }

        async function resolveTalentBarreira(ownerP) {
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "barreira") return;
            const allies = deps.gatherAllyTargets(ownerP, -1, () => true);
            if (!allies.length) {
                await commitActiveTalent(ownerP);
                return;
            }
            const withoutBarrier = allies.filter((t) => {
                const ch = deps.getState().players[t.p]?.field[t.i];
                return ch && !ch.barrier && !ch.barrierPermanent;
            });
            const pool = withoutBarrier.slice();
            if (!pool.length) {
                deps.log("Barreira: todos os aliados já têm Barreira.");
                await commitActiveTalent(ownerP);
                return;
            }
            const picks = pool;
            const indices = [];
            for (const pick of picks) {
                const ch = deps.getState().players[pick.p]?.field[pick.i];
                if (ch) {
                    deps.grantBarrier(ch, 2);
                    indices.push(pick.i);
                }
            }
            const names = picks.map(p => deps.getState().players[p.p]?.field[p.i]?.name).filter(Boolean).join(", ");
            deps.log(`${deps.getState().players[ownerP].name} concedeu Barreira a ${names || "todos os aliados"}!`);
            deps.updateUI();
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                const fieldPatches = indices.map((i) => {
                    const ch = deps.getState().players[ownerP]?.field[i];
                    return {
                        targetP: ownerP,
                        targetI: i,
                        barrier: true,
                        barrierPermanent: false,
                        barrierTurns: ch?.barrierTurns ?? 2,
                    };
                });
                deps.dfOnlineBroadcastVisual({ kind: "barrier_grant", ownerP, indices, fieldPatches });
            }
            await deps.animateBarrierGrant(ownerP, indices);
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                try {
                    const mutations = indices.map((i) => {
                        const ch = deps.getState().players[ownerP]?.field[i];
                        return {
                            op: "setStatus",
                            targetP: ownerP,
                            targetI: i,
                            flags: {
                                barrier: true,
                                barrierPermanent: false,
                                barrierTurns: ch?.barrierTurns ?? 2,
                            },
                        };
                    });
                    if (typeof deps.dfOnlineCommitMutations === "function") {
                        await deps.dfOnlineCommitMutations(mutations, { reconcile: true });
                    } else if (typeof deps.dfOnlineCommitStatus === "function") {
                        for (const i of indices) {
                            await deps.dfOnlineCommitStatus(ownerP, i, { broadcast: false });
                        }
                    }
                } catch (e) {
                    console.warn("[DF online] barreira FIELD_COMMIT", e);
                }
            }
            deps.updateUI();
            deps.checkWin();
            await commitActiveTalent(ownerP, true, 0);
            // Sem SYNC_STATE imediato — fieldPatches + batch commit sincronizam barreira.
        }

        async function resolveTalentAceleracao(ownerP) {
            const card = deps.getState().activeTalent?.card;
            if (!card || card.talentEffect !== "aceleracao") return;
            await deps.getDfAnim().preAnimBanner({
                category: "talent",
                title: card.name,
                subtitle: "Carta de Talento",
                theme: { color: "#ff4a1a", ring: "#ffd060", emoji: "👢" },
            });
            deps.getState().players[ownerP].actions += 1;
            const actionsAfter = deps.getState().players[ownerP].actions | 0;
            deps.log(`${deps.getState().players[ownerP].name} ganhou +1 Ação neste turno (Aceleração)!`);
            deps.updateUI();
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                deps.dfOnlineBroadcastVisual({
                    kind: "aceleracao",
                    ownerP,
                    actionsAfter,
                });
            }
            await deps.animateAceleracao(ownerP);
            deps.updateUI();
            if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                try {
                    if (typeof deps.dfOnlineCommitMutations === "function") {
                        await deps.dfOnlineCommitMutations([{
                            op: "setActions",
                            targetP: ownerP,
                            actions: actionsAfter,
                        }], { reconcile: true });
                    }
                } catch (e) {
                    console.warn("[DF online] aceleracao FIELD_COMMIT", e);
                }
            }
            // MP: não SYNC_STATE (clobber + vitória falsa no peer). TALENT_START já foi publicado.
            if (!(window.__DF_ONLINE && !deps.getApplyingRemote())) {
                deps.checkWin();
            }
            await commitActiveTalent(ownerP);
        }

        async function resolveTalentBaforadaVenenosa(ownerP, targetP, targetI) {
            const cardRef = deps.getState().activeTalent?.card;
            if (!cardRef || cardRef.talentEffect !== "baforadaVenenosa") return;
            try { deps.dfDismissTargetingPhase?.(); } catch (e) { /* */ }
            try { deps.dfPurgeTargetingVisuals?.(); } catch (e2) { /* */ }
            let pick = null;
            if (targetP != null && targetI != null) {
                pick = { p: targetP, i: targetI };
            } else if (deps.getState().players[ownerP]?.isAI) {
                const avoid = deps.aiPoisonAvoidSet(ownerP);
                const pool = deps.gatherEnemyTargets(ownerP, () => true)
                    .filter((t) => {
                        if (avoid.has(t.p + ":" + t.i)) return false;
                        const ch = deps.getState().players[t.p]?.field[t.i];
                        return ch && (ch.currentPower ?? ch.power ?? 0) > 1;
                    });
                if (!pool.length) { deps.updateUI(); return; }
                pool.sort((a, b) => {
                    const ca = deps.getState().players[a.p]?.field[a.i];
                    const cb = deps.getState().players[b.p]?.field[b.i];
                    return (cb?.currentPower || 0) - (ca?.currentPower || 0);
                });
                pick = pool[0];
            }
            if (!pick) { deps.updateUI(); return; }
            const ch = deps.getState().players[pick.p]?.field[pick.i];
            if (!ch) { deps.updateUI(); return; }
            const pvp = window.__DF_ONLINE && !deps.getApplyingRemote();
            if (!deps.getApplyingRemote()) {
                await deps.getDfAnim().preAnimBanner({
                    category: "talent",
                    title: cardRef.name,
                    subtitle: "Carta de Talento",
                    theme: { color: "#6cff3a", ring: "#d4ff8a", emoji: "☠️" },
                });
            }
            deps.applyPoisonStatus(ownerP, pick.p, pick.i);
            if (pvp) {
                const poisoned = deps.getState().players[pick.p]?.field[pick.i];
                deps.dfOnlineBroadcastVisual({
                    kind: "baforada_venenosa", ownerP, targetP: pick.p, targetI: pick.i,
                    fieldPatches: [{
                        targetP: pick.p,
                        targetI: pick.i,
                        poisoned: true,
                        poisonTurns: poisoned?.poisonTurns ?? 2,
                        poisonedByP: ownerP,
                    }],
                });
            }
            deps.log(`${deps.getState().players[ownerP].name} envenenou ${ch.name}!`);
            deps.updateUI();
            await deps.animateBaforadaVenenosa(ownerP, [pick]);
            deps.updateUI();
            deps.checkWin();
            await commitActiveTalent(ownerP);
            // Sem SYNC_STATE imediato após fieldPatches de veneno.
        }

        async function resolveTalentMisseisMagicos(ownerP) {
            const at = deps.getState().activeTalent;
            if (!at?.card || at.ownerP !== ownerP || at.card.talentEffect !== "missemagicos") return;
            try {
                await deps.getDfAnim().preAnimBanner({
                    category: "talent",
                    title: at.card.name,
                    subtitle: "Carta de Talento",
                    theme: { color: "#ff3030", ring: "#ff9090", emoji: "🚀" },
                });
                try { window.sfx && window.sfx("explosao"); } catch (e) {}
                if (!deps.gatherEnemyTargets(ownerP, () => true).length) return;
                // Peer: VFX em paralelo; poder via FIELD_COMMIT após a barragem (runMisseis).
                if (window.__DF_ONLINE && !deps.getApplyingRemote()) {
                    deps.dfOnlineBroadcastVisual?.({
                        kind: "misseis_magicos",
                        ownerP,
                    });
                }
                await deps.runMisseisMagicosTalent(ownerP);
                deps.checkWin();
            } finally {
                await commitActiveTalent(ownerP, true, 0);
                deps.updateUI();
            }
        }

        async function resolveTalentMedo(_handIdx, targetP, targetI) {
            const ownerP = deps.getState().activeTalent?.ownerP ?? deps.dfHumanSeat();
            const talentCard = deps.getState().activeTalent?.card;
            if (!talentCard || talentCard.talentEffect !== "medoTalento") return;
            const target = deps.getState().players[targetP].field[targetI];
            if (!target) return;
            const targetSnap = cloneCard(target);
            const targetName = target.name;
            const pvp = window.__DF_ONLINE && !deps.getApplyingRemote();
            const handInsertIdx = deps.getState().players[targetP]?.hand?.length ?? 0;
            try {
                // MP: VFX com carta ainda no campo; mutação só após FIELD_COMMIT ACK.
                await deps.playScareReturnVisual(targetP, targetI, targetSnap, ownerP, {
                    hideFieldFirst: !!pvp,
                    handInsertIdx,
                });
                if (!pvp) {
                    if (typeof deps.applyScareReturnToHand === "function") {
                        deps.applyScareReturnToHand(targetP, targetI, targetSnap);
                    } else {
                        deps.getState().players[targetP].field.splice(targetI, 1);
                        deps.getState().players[targetP].hand.push(buildScareReturnHandCard(targetSnap));
                    }
                }
            } finally {
                if (!pvp) await commitActiveTalent(ownerP);
            }
            deps.log(`Amedrontar: ${targetName} retornou à mão.`);
            if (!pvp) {
                await new Promise((r) => requestAnimationFrame(r));
                deps.updateUI({ immediate: true });
                deps.checkWin();
                window.dfStabilizeFieldCards?.();
                return;
            }
            // MP: commit autoritativo; peer/caster reconciliam após VFX (after_vfx).
            try {
                if (typeof deps.dfOnlineSendActionAwait === "function") {
                    const handCard = typeof deps.buildScareReturnHandCard === "function"
                        ? deps.buildScareReturnHandCard(targetSnap)
                        : { ...targetSnap, tapped: false };
                    const ack = await deps.dfOnlineSendActionAwait({
                        type: "FIELD_COMMIT",
                        mutations: [{
                            op: "returnToHand",
                            targetP,
                            targetI,
                            handCard,
                        }],
                        anim: {
                            kind: "scare_return",
                            targetP,
                            targetI,
                            handInsertIdx,
                            cardName: targetSnap.name,
                            cardSnap: targetSnap,
                            category: targetSnap.category || "champion",
                            currentPower: targetSnap.currentPower ?? targetSnap.power ?? 0,
                            power: targetSnap.power ?? targetSnap.currentPower ?? 0,
                            basePower: targetSnap.basePower ?? 0,
                            isToken: !!targetSnap.isToken,
                            abilityName: targetSnap.abilityName || null,
                            abilityDesc: targetSnap.abilityDesc || null,
                            abilityType: targetSnap.abilityType || null,
                            talentOwnerP: ownerP,
                            fieldPatches: [{ targetP, targetI, removed: true }],
                        },
                    }, { noSnap: true });
                    if (ack?.authoritativeState?.players?.length) {
                        deps.dfOnlineReconcileSnapshot?.(
                            { state: ack.authoritativeState, full: true },
                            { skipPhase: true },
                        );
                    } else if (typeof deps.applyScareReturnToHand === "function") {
                        deps.applyScareReturnToHand(targetP, targetI, targetSnap);
                    }
                }
            } catch (e) {
                console.warn("[DF online] medo FIELD_COMMIT", e);
                try {
                    deps.applyScareReturnToHand?.(targetP, targetI, targetSnap);
                } catch (e2) { /* */ }
            }
            await commitActiveTalent(ownerP);
            deps.updateUI({ immediate: true });
            deps.checkWin();
            window.dfStabilizeFieldCards?.();
        }

        return {
            cancelUltimateTargetSelection,
            startUltimate,
            beginUltimate,
            executeUltimate,
            ultimateIntroBanner,
            ultimateCinematicBomb,
            ultimateCinematicFireball,
            ultimateCinematicFreeze,
            ultimateCinematicFortify,
            ultimateCinematicCharge,
            ultimateCinematicShield,
            ultimateCinematicConjure,
            ultimateCinematicTrickery,
            ultimateCinematicThunder,
            ultimateCinematicComet,
            ultimateCinematicWall,
            ultimateCinematicPoison,
            ultimateCinematicMight,
            ultimateCinematicScare,
            ultimateCinematicWar,
            ultimateCinematicFireAndIceFreeze,
            ultimateCinematicFireAndIceBurn,
            ultimateCinematicBloodDragon,
            ultimateCinematicHook,
            ultimateCinematicPotion,
            ultimateCinematicVampirism,
            ultimateCinematicBanish,
            dfAnimateGuerraStatusReveal,
            commitActiveTalent,
            resolveTalentBolaDeFogo,
            resolveTalentExplosao,
            resolveTalentZeroAbsoluto,
            resolveTalentDoppelganger,
            resolveTalentFortalecer,
            resolveTalentBarreira,
            resolveTalentAceleracao,
            resolveTalentBaforadaVenenosa,
            resolveTalentMisseisMagicos,
            resolveTalentMedo,
        };
    }

    global.DfTalentUltimatePresenter = { create };
})(typeof window !== "undefined" ? window : globalThis);

/* ===== df-phase1-wire.js ===== */
/**
 * Dragonfall — Fase 1 wire (liga módulos view).
 */
(function (global) {
    "use strict";

    function wire(deps) {
        const session = global.DfViewSession.create({ getState: deps.getState });
        const anim = global.DfAnimLib.create({ FX: deps.FX, wait: deps.wait });
        const inputApi = {};
        const board = global.DfBoardRenderer.create({
            getState: deps.getState,
            getGamePhase: deps.getGamePhase,
            getTargetData: deps.getTargetData,
            getAiBusy: deps.getAiBusy,
            $: deps.$,
            MAX_HAND: deps.MAX_HAND,
            MAX_FIELD: deps.MAX_FIELD,
            MAX_ACTIONS: deps.MAX_ACTIONS,
            getSelectedHand: deps.getSelectedHand,
            setSelectedHand: deps.setSelectedHand,
            getSelectedFieldIdx: deps.getSelectedFieldIdx,
            setSelectedFieldIdx: deps.setSelectedFieldIdx,
            getPendingSummon: deps.getPendingSummon,
            setPendingSummon: deps.setPendingSummon,
            getSelectedEnemyIdx: deps.getSelectedEnemyIdx,
            setSelectedEnemyIdx: deps.setSelectedEnemyIdx,
            setGamePhase: deps.setGamePhase,
            setTargetData: deps.setTargetData,
            onChampionClick: deps.onChampionClick,
            checkWin: deps.checkWin,
            isResistente: deps.isResistente,
            isPesadoDemais: deps.isPesadoDemais,
            cannotHitResistente: deps.cannotHitResistente,
            attackIsFree: deps.attackIsFree,
            getAttackActionCost: deps.getAttackActionCost,
            flashInsufficientActions: deps.flashInsufficientActions,
            dfOnlineResolveCombatThenBroadcast: deps.dfOnlineResolveCombatThenBroadcast,
            dfLocalSeat: session.dfLocalSeat,
            dfIsMyTurn: session.dfIsMyTurn,
            dfPlayerForQuadrant: session.dfPlayerForQuadrant,
            dfIsLocalPlayer: session.dfIsLocalPlayer,
            dfLocalPlayer: session.dfLocalPlayer,
            dfQuadrantForPlayer: session.dfQuadrantForPlayer,
            dfHumanSeat: session.dfHumanSeat,
            dfOpponentSeat: session.dfOpponentSeat,
            getHeroDef: deps.getHeroDef,
            getMaxUltimateUses: deps.getMaxUltimateUses,
            openHeroInfo: deps.openHeroInfo,
            recalcInspiracao: deps.recalcInspiracao,
            ensureTurnReady: deps.ensureTurnReady,
            dfIsCombatBlockingField: deps.dfIsCombatBlockingField,
            armPhaseWatchdog: deps.armPhaseWatchdog,
            dfSyncPesadeloShrouds: deps.dfSyncPesadeloShrouds,
            dfClosePreviewForTargeting: () => inputApi.dfClosePreviewForTargeting?.(),
            log: deps.log,
            floatText: deps.floatText,
            dropZoneAt: (...a) => inputApi.dropZoneAt?.(...a),
            dfCreateHandDragGhost: (...a) => inputApi.dfCreateHandDragGhost?.(...a),
            dfResizeHandDragGhost: (...a) => inputApi.dfResizeHandDragGhost?.(...a),
            updateDropHighlight: (...a) => inputApi.updateDropHighlight?.(...a),
            clearDropHighlight: (...a) => inputApi.clearDropHighlight?.(...a),
            openCardZoom: (...a) => inputApi.openCardZoom?.(...a),
            dfEndFieldDragVisual: (...a) => inputApi.dfEndFieldDragVisual?.(...a),
            dfCaptureFieldCardSnap: deps.dfCaptureFieldCardSnap,
            dfHideCombatFieldPair: deps.dfHideCombatFieldPair,
            dfCreateFieldDragGhost: (...a) => inputApi.dfCreateFieldDragGhost?.(...a),
            dfLockFieldCardTransform: (...a) => inputApi.dfLockFieldCardTransform?.(...a),
            flashRuleBanner: deps.flashRuleBanner,
            startTalentUse: deps.startTalentUse,
            dfPlayerAction: deps.dfPlayerAction,
        });
        const combat = global.DfCombatPresenter.create({
            wait: deps.wait,
            FX: deps.FX,
            getState: deps.getState,
            getChampionDom: board.getChampionDom,
            spawnParticles: anim.spawnParticles,
            DfAnim: anim.DfAnim,
        });
        const input = global.DfInputController.create({
            getState: deps.getState,
            getGamePhase: deps.getGamePhase,
            getTargetData: deps.getTargetData,
            $: deps.$,
            dfIsMyTurn: session.dfIsMyTurn,
            dfIsLocalPlayer: session.dfIsLocalPlayer,
            dfLocalSeat: session.dfLocalSeat,
            dfHumanSeat: session.dfHumanSeat,
            dfPlayerForQuadrant: session.dfPlayerForQuadrant,
            log: deps.log,
            floatText: deps.floatText,
            updateUI: board.updateUI,
            dfPlayerAction: deps.dfPlayerAction,
            cleanupOrphanGhosts: board.cleanupOrphanGhosts,
            getChampionDom: board.getChampionDom,
            getCardTypeClass: board.getCardTypeClass,
            gemOverlayHtml: board.gemOverlayHtml,
            statusOverlayHtml: board.statusOverlayHtml,
        });
        Object.assign(inputApi, {
            dropZoneAt: input.dropZoneAt,
            dfCreateHandDragGhost: input.dfCreateHandDragGhost,
            dfResizeHandDragGhost: input.dfResizeHandDragGhost,
            updateDropHighlight: input.updateDropHighlight,
            clearDropHighlight: input.clearDropHighlight,
            openCardZoom: input.openCardZoom,
            dfCreateFieldDragGhost: input.dfCreateFieldDragGhost,
            dfEndFieldDragVisual: input.dfEndFieldDragVisual,
            dfLockFieldCardTransform: input.dfLockFieldCardTransform,
            dfClosePreviewForTargeting: input.dfClosePreviewForTargeting,
        });
        input.installGlobalPointerSafety();
        window.dfStabilizeFieldCards = input.dfStabilizeFieldCards;
        window.dfLockFieldCardTransform = input.dfLockFieldCardTransform;
        window.dfKillFieldCardMotion = input.dfKillFieldCardMotion;
        window.dfCapturePosicaoFixaCampo = input.dfCapturePosicaoFixaCampo;
        window.dfEnforcePosicaoFixaCampo = input.dfEnforcePosicaoFixaCampo;
        window.dfBeginFieldSummonBusy = input.dfBeginFieldSummonBusy;
        window.dfEndFieldSummonBusy = input.dfEndFieldSummonBusy;
        window.dfMarkFieldCardDragging = input.dfMarkFieldCardDragging;
        window.dfScheduleFieldRowLock = input.dfScheduleFieldRowLock;
        window.dfSealPlayerFieldRow = input.dfSealPlayerFieldRow;
        window.dfClearPlayerFieldHighlightInline = input.dfClearPlayerFieldHighlightInline;
        window.dfSealPlayerFieldCard = input.dfSealPlayerFieldCard;
        window.dfApplyPlayerFieldGridSlot = input.dfApplyPlayerFieldGridSlot;
        window.dfStabilizeHandWraps = input.dfStabilizeHandWraps;
        window.dfEndFieldDragVisual = input.dfEndFieldDragVisual;
        window.dfCombatForceCleanup = combat.dfCombatForceCleanup;
        window.dfCombatVisualCleanup = combat.dfCombatVisualCleanup;
        window.dfRestoreCombatFieldCard = combat.dfRestoreCombatFieldCard;
        return Object.assign({}, session, anim, board, combat, input);
    }

    global.DfPhase1Wire = { wire };
})(typeof window !== "undefined" ? window : globalThis);
