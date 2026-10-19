(function () {
(function () {
            const music = document.getElementById('menu-music');
            const hubMusic = document.getElementById('hub-music');
            if (!music && !hubMusic) return;
            if (music) music.volume = 0.55;
            if (hubMusic) hubMusic.volume = 0.55;
            if (hubMusic) hubMusic.loop = true;
            const battleMusic = document.getElementById('battle-music');

            const gameEl = document.getElementById('game');
            // Toca a música do menu em TODAS as telas fora do gameplay.
            // Só silencia quando o #game está visível (partida em andamento).
            const menuScreenIds = ['main', 'play-menu', 'df-play-mode', 'ai-mode-select', 'release-notes',
                'opcoes', 'card-list', 'df-arsenal', 'df-training-setup', 'mode', 'hero-select', 'objective-select',
                'mercado-screen', 'online-lobby'];

            function inMenuFlow() {
                if (!gameEl) return true;
                const gameVisible = gameEl.style.display && gameEl.style.display !== 'none';
                if (gameVisible) return false;
                return menuScreenIds.some(id => {
                    const el = document.getElementById(id);
                    return el && el.classList.contains('active');
                });
            }

            function inHubFlow() {
                if (!gameEl) return false;
                const gameVisible = gameEl.style.display && gameEl.style.display !== 'none';
                if (gameVisible) return false;
                // Opções / Notas abertas a partir do Hub: mantém HUB MUSIC.
                try {
                    if (window.__dfOpcoesReturnTo === "hub") {
                        const op = document.getElementById("opcoes");
                        if (op && op.classList.contains("active")) return true;
                    }
                    if (window.__dfReleaseNotesReturnTo === "hub") {
                        const rn = document.getElementById("release-notes");
                        if (rn && rn.classList.contains("active")) return true;
                    }
                } catch (e) { /* */ }
                const profileOpen = document.documentElement.classList.contains('df-profile-open');
                if (profileOpen) return true;
                if (document.body.classList.contains('df-arsenal-open')) return true;
                if (document.body.classList.contains('df-training-open')) return true;
                const hubLayer = document.getElementById('df-hub-splash-layer');
                const profile = document.getElementById('df-profile-layer');
                const hubVisible = !!(hubLayer && hubLayer.getAttribute('aria-hidden') === 'false');
                const profileVisible = !!(profile && profile.classList.contains('active'));
                if (hubVisible || profileVisible) return true;
                return ['mercado-screen', 'mode', 'hero-select',
                    'objective-select', 'online-lobby', 'ai-mode-select', 'play-menu', 'df-play-mode', 'df-arsenal', 'df-training-setup']
                    .some(id => {
                        const el = document.getElementById(id);
                        return el && el.classList.contains('active');
                    });
            }

            function update() {
                const menuOn = inMenuFlow() && !inHubFlow();
                const hubOn = inHubFlow();

                if (menuOn) {
                    if (music && music.paused) music.play().catch(() => {});
                } else {
                    if (music && !music.paused) music.pause();
                }

                if (hubOn) {
                    if (hubMusic) {
                        if (hubMusic.preload === "none") hubMusic.preload = "auto";
                        if (hubMusic.readyState < 1) {
                            try { hubMusic.load(); } catch (e) { /* */ }
                        }
                        if (hubMusic.paused) hubMusic.play().catch(() => {});
                    }
                } else {
                    if (hubMusic && !hubMusic.paused) hubMusic.pause();
                }

                // Garante que em combate só a trilha de batalha toca.
                if (battleMusic && gameEl && gameEl.classList.contains('active')) {
                    if (music && !music.paused) music.pause();
                    if (hubMusic && !hubMusic.paused) hubMusic.pause();
                }
            }

            // Tentativa IMEDIATA de tocar a música do menu assim que o
            // script carrega — o usuário quer música no instante que o
            // jogo abre. Se o browser bloquear (políticas de autoplay),
            // o handler de primeiro input abaixo recupera no 1º gesto.
            try {
                if (music && music.paused) music.play().catch(() => {});
                if (hubMusic && inHubFlow() && hubMusic.paused) hubMusic.play().catch(() => {});
            } catch (e) {}
            // Tenta de novo em loadedmetadata / DOMContentLoaded —
            // alguns browsers permitem autoplay quando o áudio já está
            // pronto pra tocar antes do primeiro frame visível.
            if (music) {
                music.addEventListener('loadedmetadata', () => {
                    try { if (music.paused && inMenuFlow() && !inHubFlow()) music.play().catch(() => {}); } catch (e) {}
                });
            }
            if (hubMusic) {
                hubMusic.addEventListener('loadedmetadata', () => {
                    try { if (hubMusic.paused && inHubFlow()) hubMusic.play().catch(() => {}); } catch (e) {}
                });
            }
            document.addEventListener('DOMContentLoaded', () => {
                try {
                    if (music && music.paused && inMenuFlow() && !inHubFlow()) music.play().catch(() => {});
                    if (hubMusic && hubMusic.paused && inHubFlow()) hubMusic.play().catch(() => {});
                } catch (e) {}
            });

            // Browsers block autoplay until the user interacts — start music on first input.
            const unlock = () => { update(); };
            ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev =>
                document.addEventListener(ev, unlock, { once: true, capture: true })
            );

            // Watch the game container and ALL menu screens for visibility changes.
            const obsOpts = { attributes: true, attributeFilter: ['style', 'class', 'aria-hidden'] };
            const watchIds = ['game', 'df-hub-splash-layer', 'df-profile-layer', ...menuScreenIds];
            watchIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) new MutationObserver(update).observe(el, obsOpts);
            });
            if (document.body) {
                new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
            }

            window.__dfMenuMusicSync = update;
            update();
        })();
})();
