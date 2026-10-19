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
