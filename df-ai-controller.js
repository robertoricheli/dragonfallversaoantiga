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
