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
