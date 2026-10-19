(function () {
// ====================================================================
        // GLOBAL DRAG SAFETY NET
        // --------------------------------------------------------------------
        // Bug recorrente no DESKTOP: campeões somem do campo "ao passar o
        // mouse". Causa raiz: o gesto de arrastar carta usa
        //   - body.classList.add("dragging-card")
        //   - cd.style.visibility = "hidden"     (esconde a fonte)
        //   - .dragging-src / .field-dragging classes
        // pra esconder a carta-fonte enquanto o ghost voa pelo mapa. Quando o
        // browser ENGOLE o pointerup (mouse sai do iframe, alt-tab, foco perde
        // pro DevTools, modal de bloqueio do navegador, etc.), o finishDrag
        // NUNCA roda e a carta fica permanentemente invisível — mesmo após
        // updateUI re-renderizar, novos drags herdam o body.dragging-card
        // órfão e qualquer hover acidental que dispare enterFieldDrag esconde
        // mais cartas que nunca restauram.
        //
        // Este script instala uma rede de segurança GLOBAL que roda
        // independente da lógica de drag de cada carta. Sempre que o usuário
        // solta o botão em qualquer lugar do documento, perde foco da janela,
        // troca de aba, ou simplesmente fica ~250ms parado sem nenhum drag
        // ativo, ele força a restauração de TODAS as .ccard (visibility="",
        // remove classes de drag, remove ghosts órfãos, remove banner).
        //
        // É deliberadamente AGRESSIVO: prefere uma carta extra visível
        // (no pior caso, o "duplo" momentâneo durante drag) a uma carta
        // permanentemente sumida. Usuário foi explícito: cartas em campo
        // NÃO PODEM SUMIR.
        // ====================================================================
        (function installDragSafetyNet() {
            let lastButtons = 0;
            window.addEventListener("pointerdown", (ev) => { lastButtons = ev.buttons || 0; }, true);
            window.addEventListener("pointermove", (ev) => { lastButtons = ev.buttons || 0; }, true);
            window.addEventListener("pointerup", (ev) => { lastButtons = ev.buttons || 0; }, true);
            window.addEventListener("mouseup", (ev) => { lastButtons = ev.buttons || 0; }, true);
            window.addEventListener("touchend", () => { lastButtons = 0; }, true);
            window.addEventListener("touchcancel", () => { lastButtons = 0; }, true);
            const handDragGhostLive = () =>
                !!document.querySelector(".drag-ghost-hand[data-active-drag], .drag-ghost-hand");

            const handDragOrphaned = () => {
                if (lastButtons !== 0) return false;
                const handFlags = document.body.classList.contains("dragging-card")
                    || window.__dfHandDrag?.active
                    || document.querySelector(".hand-wrap.dragging-src");
                return handFlags && !handDragGhostLive()
                    && !window.__dfFieldDrag?.active
                    && !document.querySelector(".drag-ghost-field[data-active-drag]");
            };

            const forceClearHandDrag = () => {
                document.querySelectorAll(".drag-ghost-hand, .drag-ghost").forEach((el) => el.remove());
                document.body.classList.remove("dragging-card");
                window.__dfHandDrag = null;
                window._activeGhost = null;
                document.querySelectorAll(".hand-wrap").forEach((el) => {
                    if (el.style.visibility === "hidden") el.style.visibility = "";
                    el.classList.remove("dragging-src");
                });
            };

            const dragGestureLive = () => {
                if (handDragOrphaned()) return false;
                return document.body.classList.contains("dragging-card")
                    || window.__dfHandDrag?.active
                    || window.__dfFieldDrag?.active
                    || handDragGhostLive()
                    || !!document.querySelector(".drag-ghost[data-active-drag]");
            };

            const restoreAll = () => {
                try {
                    if (handDragOrphaned()) {
                        forceClearHandDrag();
                        return;
                    }
                    if (dragGestureLive()) return;
                    if (lastButtons !== 0) return;
                    if (window.__dfCombatPending || window.__dfCombatActive
                        || document.body.classList.contains("df-combat-active")) {
                        return;
                    }
                    const combatLive = window.__dfIsCombatPresentationLive?.()
                        ?? !!document.querySelector(".battle-fly, .combat-animating, .ccard.combat-src-hidden");
                    if (combatLive) return;
                    // Campo: fantasma some antes da fonte (dfEndFieldDragVisual).
                    if (typeof window.dfEndFieldDragVisual === "function") window.dfEndFieldDragVisual();
                    document.querySelectorAll(".drag-ghost, .drag-no-actions-banner").forEach(el => el.remove());
                    document.body.classList.remove("dragging-card");
                    window.__dfHandDrag = null;
                    document.querySelectorAll(".ccard").forEach(el => {
                        if (el.classList.contains("combat-animating")) return;
                        if (el.classList.contains("combat-src-hidden")) {
                            window.dfRestoreCombatFieldCard?.(el);
                            return;
                        }
                        if (el.style.visibility === "hidden") el.style.visibility = "";
                        if (el.style.opacity === "0") el.style.opacity = "";
                        el.style.pointerEvents = "";
                        el.classList.remove(
                            "dragging-src",
                            "field-dragging",
                            "field-drag-src",
                            "snap-enemy",
                            "drag-attack-target"
                        );
                    });
                    document.querySelectorAll(".hand-wrap").forEach(el => {
                        if (el.style.visibility === "hidden") el.style.visibility = "";
                        el.classList.remove("dragging-src");
                    });
                } catch (e) { /* noop — segurança cosmética */ }
            };

            // Qualquer pointerup/cancel/leave EM QUALQUER LUGAR da janela
            // dispara restauração. Captura true pra rodar antes de handlers
            // específicos que possam stopPropagation.
            const onEnd = () => {
                // Atraso curto: finishDrag da carta capturada roda no mesmo
                // pointerup; depois garantimos que nenhum ghost sobrou.
                setTimeout(restoreAll, 16);
            };
            window.addEventListener("pointerup", onEnd, true);
            window.addEventListener("pointercancel", onEnd, true);
            window.addEventListener("mouseup", onEnd, true);
            window.addEventListener("touchend", onEnd, true);
            window.addEventListener("touchcancel", onEnd, true);
            window.addEventListener("blur", restoreAll);
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) restoreAll();
            });

            // Heartbeat: a cada 400ms, se NÃO houver mouse pressionado E
            // existir alguma .ccard escondida, restaura. Isso pega o caso
            // patológico onde até o pointerup foi engolido pelo browser
            // (mouse saiu do iframe e nunca voltou ao foco). buttons===0 no
            // último pointermove é o sinal de que o usuário não está
            // arrastando AGORA — então qualquer escondido é órfão.
            let combatStuckSince = 0;
            let summonLockStuckSince = 0;
            setInterval(() => {
                if (window.__dfCombatPending) {
                    combatStuckSince = 0;
                    return;
                }
                const combat = window.__dfCombatActive;
                const combatLive = window.__dfIsCombatPresentationLive?.()
                    ?? !!document.querySelector(".battle-fly, .combat-animating, .ccard.combat-src-hidden");
                if (combat || document.body.classList.contains("df-combat-active")) {
                    if (!combatLive) {
                        window.dfCombatForceCleanup?.(combat || undefined);
                        combatStuckSince = 0;
                        return;
                    }
                    if (!combatStuckSince) combatStuckSince = Date.now();
                    else if (Date.now() - combatStuckSince > 3500) {
                        console.warn("[DF] combate preso — forçando cleanup");
                        window.dfCombatForceCleanup?.(combat || undefined);
                        combatStuckSince = 0;
                    }
                    return;
                }
                combatStuckSince = 0;
                const summonLive = window._summonLock && (
                    !!document.querySelector(".summon-fly") ||
                    !!document.querySelector(".ccard.is-summoning")
                );
                if (window._summonLock && !summonLive && !window.DfPresentationBus?.isBusy?.()) {
                    if (!summonLockStuckSince) summonLockStuckSince = Date.now();
                    else if (Date.now() - summonLockStuckSince > 2500) {
                        console.warn("[DF] invocação presa — liberando _summonLock");
                        window._summonLock = false;
                        summonLockStuckSince = 0;
                    }
                } else {
                    summonLockStuckSince = 0;
                }
                // Não purgar durante animação ativa (~2s) — só órfãos velhos.
                {
                    const animActive = !!window.__dfDesacelerarAnimActive;
                    const started = window.__dfDesacelerarAnimStartedAt | 0;
                    const ageOk = started > 0 && (Date.now() - started) < 3000;
                    const hasOrphan = !!document.querySelector(
                        ".desacelerar-quadrant-veil, .quadrant.desacelerar-afflicted",
                    );
                    if (hasOrphan && !animActive && !ageOk) {
                        window.dfPurgeDesacelerarVfx?.();
                    }
                }
                if (lastButtons !== 0) return; // ainda arrastando
                if (handDragOrphaned()) {
                    forceClearHandDrag();
                    return;
                }
                const hiddenHand = document.querySelector(".hand-wrap.dragging-src");
                const hiddenCard = document.querySelector(
                    ".ccard[style*='visibility']:not(.combat-animating):not(.combat-src-hidden)"
                );
                if (!hiddenCard && !hiddenHand) {
                    // Nada escondido. Ainda assim, limpa body.dragging-card
                    // órfão pra não deixar pseudo-classes presas.
                    if (document.body.classList.contains("dragging-card") &&
                        !document.querySelector(".drag-ghost")) {
                        document.body.classList.remove("dragging-card");
                        window.__dfHandDrag = null;
                    }
                    return;
                }
                restoreAll();
            }, 700);
        })();
})();
