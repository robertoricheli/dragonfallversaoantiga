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
