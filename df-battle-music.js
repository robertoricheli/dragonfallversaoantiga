(function () {
// Battle music: toca apenas no combate e faz loop em 02:27.
        (function () {
            const music = document.getElementById('battle-music');
            if (!music) return;
            const LOOP_START = 0;
            const LOOP_END = 147; // 02:27
            music.loop = false;
            music.volume = 0.45;

            const gameEl = document.getElementById('game');
            if (!gameEl) return;

            function inBattle() {
                return gameEl.style.display && gameEl.style.display !== 'none';
            }

            // Reinicia no início da faixa ao entrar em combate.
            function forceStartOffset() {
                try { music.currentTime = LOOP_START; } catch (e) { /* metadata not ready */ }
            }

            window.__dfResetBattleMusic = function () {
                forceStartOffset();
                wasInBattle = inBattle();
                if (wasInBattle) {
                    // Re-arranca já do offset canônico.
                    music.play().catch(() => {});
                } else if (!music.paused) {
                    music.pause();
                }
            };

            music.addEventListener('loadedmetadata', () => { forceStartOffset(); });
            music.addEventListener('ended', () => {
                try { music.currentTime = LOOP_START; } catch (e) {}
                music.play().catch(() => {});
            });
            music.addEventListener('timeupdate', () => {
                if (!inBattle() || music.paused) return;
                if (music.currentTime >= LOOP_END) {
                    try { music.currentTime = LOOP_START; } catch (e) {}
                    music.play().catch(() => {});
                }
            });

            let wasInBattle = false;
            function update() {
                const nowIn = inBattle();
                if (nowIn) {
                    if (music.preload === "none") music.preload = "auto";
                    if (music.readyState < 1) {
                        try { music.load(); } catch (e) { /* */ }
                    }
                    // Transição "fora → dentro" da batalha = nova partida/restart.
                    if (!wasInBattle) forceStartOffset();
                    if (music.paused) music.play().catch(() => {});
                } else {
                    if (!music.paused) music.pause();
                }
                wasInBattle = nowIn;
            }

            const unlock = () => { update(); };
            ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev =>
                document.addEventListener(ev, unlock, { once: false, capture: true })
            );

            new MutationObserver(update).observe(gameEl, { attributes: true, attributeFilter: ['style', 'class'] });
            update();
        })();
})();
