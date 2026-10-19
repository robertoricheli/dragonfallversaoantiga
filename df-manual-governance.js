/**
 * Dragonfall — Governança do Manual Oficial
 *
 * O jogo DEVE obedecer docs/MANUAL-DO-JOGO.md.
 * O manual SÓ é alterado quando o AUTOR pedir mudança de regra/mecânica/conteúdo.
 * Correções de bug, refactors e melhorias visuais NÃO alteram o manual por iniciativa do agente.
 */
(function (global) {
    "use strict";

    const DfManualGovernance = Object.freeze({
        /** Caminho relativo à raiz do pacote web (artifacts/dragonfall/). */
        manualPath: "docs/MANUAL-DO-JOGO.md",
        architecturePath: "docs/MANUAL-ARQUITETURA.md",
        /** Política: manual atualizado apenas por pedido explícito do autor. */
        updatePolicy: "user-request-only",
        /** Notas de atualização visíveis ao jogador (máximo). */
        releaseNotesMax: 15,
        /** Ordem de autoridade para regras de gameplay. */
        authorityOrder: [
            "docs/MANUAL-DO-JOGO.md",
            "js/df-rules.js",
            "js/df-data.js",
            "js/df-effects-resolve.js",
            "js/df-engine.js",
            "js/df-game-view.js",
        ],
        /**
         * Antes de mudar gameplay: leia o manual e preserve tudo que não foi pedido.
         * Se o pedido do autor conflitar com o manual, atualize o manual NO MESMO PR.
         */
        workflow: Object.freeze({
            onUserGameplayChange: [
                "Ler MANUAL-DO-JOGO.md (seções afetadas)",
                "Implementar código sem quebrar outras regras do manual",
                "Atualizar manual somente nas partes pedidas pelo autor",
                "Rodar npm run df:test:rules (e df:verify:boot se tocou em UI)",
                "Registrar em releaseNotes (df-game-view.js)",
            ],
            onBugfixOrPolish: [
                "Ler manual — restaurar comportamento documentado",
                "NÃO editar manual salvo pedido explícito do autor",
                "Rodar npm run df:verify:boot se tocou em scripts do browser",
            ],
            /** Migração de face composta (carta existente): só abilityDesc + composedFace. */
            onComposedFaceMigration: [
                "classifyChange(presentation) — não editar MANUAL-DO-JOGO.md",
                "df-data: composedFace:true; manter abilityDesc existente (texto já está na carta)",
                "Só alterar abilityDesc se o autor enviar texto novo",
                "Confirmar bg/{NOME}.png antes do build",
                "DF_DISPLAY_VERSION + df:build + df:verify:sync",
                "SOP: docs/FACES-COMPOSTAS-SOP.md",
            ],
            /** Carta nova com briefing do autor. */
            onNewCardBriefing: [
                "classifyChange(gameplay) — dados + efeitos + seções do manual",
                "composedFace:true + arte em bg/{NOME}.png",
                "df:test:rules + versão + df:build + df:verify:sync",
                "SOP: docs/FACES-COMPOSTAS-SOP.md",
            ],
        }),
        /**
         * Classifica o pedido para decidir se o manual pode ser editado.
         * @param {"gameplay"|"presentation"|"bugfix"|"architecture"} kind
         */
        classifyChange(kind) {
            const manualEditable = kind === "gameplay";
            return Object.freeze({
                kind,
                manualEditable,
                mustReadManual: true,
                mustRunRulesTests: kind === "gameplay",
                mustRunBootVerify: kind !== "architecture",
            });
        },
        /** Falha cedo se governança não carregou (evita ReferenceError silencioso depois). */
        assertBoot() {
            if (!global.__DF_MANUAL_PATH) {
                throw new Error("[DfManualGovernance] Boot falhou: __DF_MANUAL_PATH ausente.");
            }
            if (!global.DfManualGovernance) {
                throw new Error("[DfManualGovernance] Boot falhou: DfManualGovernance ausente.");
            }
        },
    });

    global.DfManualGovernance = DfManualGovernance;
    global.__DF_MANUAL_PATH = DfManualGovernance.manualPath;
    DfManualGovernance.assertBoot();
})(typeof window !== "undefined" ? window : globalThis);
