(function () {
/* ============================================================
           ENGINE DE ÁUDIO — Dragonfall
           ------------------------------------------------------------
           Sistema unificado de SFX + voz dos Campeões.
           - Web Audio API com pool de AudioBuffers (latência baixa).
           - 3 sliders no menu Opções: Geral, Música, SFX. (Vozes
             usam o canal SFX para coerência com a expectativa do
             usuário de "3 controles".)
           - Persistência em localStorage (chave dragonfall:audio).
           - Destrava no mobile no 1º clique/toque do usuário.
           - Falha silenciosa: se o arquivo não existir, não toca
             nada e não polui o console (404 silenciosos esperados
             enquanto a biblioteca de áudio ainda está sendo gerada).
           - Hooks expostos:
                window.sfx(key)               → toca audio/sfx/<key>.mp3
                window.voice(...)             → NO-OP (vozes removidas pelo usuário)
           ============================================================ */
        (function () {
            const STORAGE_KEY = "dragonfall:audio";
            const DEFAULTS = { master: 1.0, music: 0.55, sfx: 0.85, muted: false };
            const state = Object.assign({}, DEFAULTS);
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
                if (saved && typeof saved === "object") Object.assign(state, saved);
            } catch (e) {}

            let ctx = null;
            let masterGain = null;
            let sfxGain = null;
            const bufferCache = new Map();   // url -> Promise<AudioBuffer|null>
            const knownMissing = new Set();  // urls already known to 404

            function ensureCtx() {
                if (ctx) return ctx;
                try {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return null;
                    ctx = new AC();
                    masterGain = ctx.createGain();
                    sfxGain = ctx.createGain();
                    sfxGain.connect(masterGain);
                    masterGain.connect(ctx.destination);
                    applyVolumes();
                } catch (e) { ctx = null; }
                return ctx;
            }

            function applyVolumes() {
                if (masterGain) masterGain.gain.value = state.muted ? 0 : state.master;
                if (sfxGain)    sfxGain.gain.value    = state.sfx;
                // Música ainda usa os elementos <audio> nativos —
                // os scripts de menu/battle já leem window.audioState.
                const menu = document.getElementById("menu-music");
                const hub = document.getElementById("hub-music");
                const battle = document.getElementById("battle-music");
                const musicVol = (state.muted ? 0 : state.master) * state.music;
                if (menu)   menu.volume = musicVol;
                if (hub)    hub.volume = musicVol;
                if (battle) battle.volume = musicVol;
            }
            function save() {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
            }

            async function loadBuffer(url) {
                if (knownMissing.has(url)) return null;
                if (bufferCache.has(url)) return bufferCache.get(url);
                const p = (async () => {
                    if (!ensureCtx()) return null;
                    try {
                        const resp = await fetch(url, { cache: "force-cache" });
                        if (!resp.ok) { knownMissing.add(url); return null; }
                        const arr = await resp.arrayBuffer();
                        return await new Promise((resolve) => {
                            ctx.decodeAudioData(arr, resolve, () => resolve(null));
                        });
                    } catch (e) { knownMissing.add(url); return null; }
                })();
                bufferCache.set(url, p);
                return p;
            }

            function playUrl(url, opts) {
                opts = opts || {};
                if (!ensureCtx()) return;
                loadBuffer(url).then(buf => {
                    if (!buf || !ctx) return;
                    try {
                        const src = ctx.createBufferSource();
                        src.buffer = buf;
                        // Voz pode ter ganho próprio pra equalizar volume com SFX.
                        if (opts.gain != null) {
                            const g = ctx.createGain();
                            g.gain.value = opts.gain;
                            src.connect(g); g.connect(sfxGain);
                        } else {
                            src.connect(sfxGain);
                        }
                        if (opts.delay) src.start(ctx.currentTime + opts.delay);
                        else src.start(0);
                    } catch (e) {}
                });
            }

            function slugify(name) {
                return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
            }

            function dfIsMenuScreenActive() {
                return ["main", "play-menu", "df-play-mode", "ai-mode-select", "release-notes", "opcoes", "card-list", "df-arsenal", "df-training-setup",
                    "mode", "hero-select", "objective-select", "mercado-screen", "online-lobby"]
                    .some((id) => {
                        const el = document.getElementById(id);
                        return el && el.classList.contains("active");
                    });
            }

            function dfIsCombatActive() {
                const game = document.getElementById("game");
                return !!(game && game.classList.contains("active"));
            }

            window.sfx = function (key, opts) {
                if (!key) return;
                try {
                    // Combate ativo: SFX sempre (mobile incluído). Fora do combate,
                    // touch/mobile suprime SFX nas telas de menu (evita ruído ao navegar).
                    if (!dfIsCombatActive() && dfIsMenuScreenActive()) {
                        const touchLike = window.DfLayout?.isMobileDesktopFit?.()
                            || window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
                        if (touchLike) return;
                    }
                } catch (e) { /* */ }
                playUrl(`audio/sfx/${key}.mp3`, opts);
            };
            // Vozes dos Campeões foram REMOVIDAS por decisão do usuário —
            // os arquivos não existem mais e a função é um no-op pra manter
            // a API estável caso algum hook antigo ainda chame voice().
            window.voice = function () { /* no-op */ };
            window.audioState = state;
            window.audioApplyVolumes = applyVolumes;
            window.audioSave = save;

            // === Destrava o AudioContext no 1º gesto do usuário (mobile). ===
            function unlock() {
                ensureCtx();
                if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
            }
            ["pointerdown", "touchstart", "keydown", "click"].forEach(ev =>
                document.addEventListener(ev, unlock, { capture: true, passive: true })
            );

            // ============================================================
            // MOBILE BACKGROUND FIX — suspende TUDO quando a aba é
            // escondida/minimizada. Antes: o AudioContext continuava
            // rodando + buffers acumulados + <audio> da música travavam
            // o iOS Safari/Android Chrome em segundo plano e congelavam
            // o aparelho. Agora: visibilitychange + pagehide pausam o
            // contexto E os elementos <audio>. Em "visible" resumimos só
            // o contexto; a música retoma quando o usuário voltar à tela
            // que toca música (menu/battle), já que esses scripts chamam
            // play() ativamente em transições de tela.
            // ============================================================
            let wasMusicPlaying = { menu: false, battle: false };
            function pauseAllAudio() {
                try { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); } catch (e) {}
                const menu   = document.getElementById("menu-music");
                const hub    = document.getElementById("hub-music");
                const battle = document.getElementById("battle-music");
                if (menu)   { wasMusicPlaying.menu   = !menu.paused;   try { menu.pause(); }   catch (e) {} }
                if (hub)    { try { hub.pause(); } catch (e) {} }
                if (battle) { wasMusicPlaying.battle = !battle.paused; try { battle.pause(); } catch (e) {} }
            }
            function resumeAudioCtx() {
                try { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); } catch (e) {}
                // Música: retoma só o que estava tocando, e só se ainda
                // estiver na tela correspondente (evita música do menu
                // tocando em cima da de batalha, etc.).
                const menu   = document.getElementById("menu-music");
                const hub    = document.getElementById("hub-music");
                const battle = document.getElementById("battle-music");
                const menuVisible = document.getElementById("menu-screen") &&
                                    !document.getElementById("menu-screen").classList.contains("hidden");
                if (menu && wasMusicPlaying.menu && menuVisible) {
                    menu.play().catch(() => {});
                }
                if (battle && wasMusicPlaying.battle && !menuVisible) {
                    battle.play().catch(() => {});
                }
            }
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") pauseAllAudio();
                else if (document.visibilityState === "visible") resumeAudioCtx();
            });
            // pagehide cobre swipe-up / fechar aba / lock-screen no iOS
            // (visibilitychange às vezes não dispara nesses casos).
            window.addEventListener("pagehide",  pauseAllAudio);
            window.addEventListener("pageshow",  resumeAudioCtx);
            window.addEventListener("blur",      pauseAllAudio);

            // Cap defensivo no cache de buffers — antes podia crescer
            // indefinidamente com arquivos grandes (vozes), o que era
            // outra causa do travamento mobile.
            const MAX_CACHED_BUFFERS = 60;
            const _origLoad = loadBuffer;
            // (loadBuffer já é declarada acima; o cap real é feito
            // limpando o cache quando passa do limite.)
            function _trimCache() {
                if (bufferCache.size > MAX_CACHED_BUFFERS) {
                    // Remove os mais antigos (Map preserva ordem de inserção).
                    const drop = bufferCache.size - MAX_CACHED_BUFFERS;
                    let i = 0;
                    for (const k of bufferCache.keys()) {
                        if (i++ >= drop) break;
                        bufferCache.delete(k);
                    }
                }
            }
            // Trim periódico leve.
            setInterval(_trimCache, 30000);

            // (REMOVIDO por pedido do usuário) Antes: todo clique em
            // qualquer .menu-btn disparava ui_click. Agora os botões do
            // menu principal são silenciosos — nenhum SFX universal de UI.

            // === Wire dos sliders quando o DOM estiver pronto. ===
            function wireSliders() {
                const m = document.getElementById("opt-vol-master");
                const mu = document.getElementById("opt-vol-music");
                const sx = document.getElementById("opt-vol-sfx");
                if (!m || !mu || !sx) return false;
                const mv = document.getElementById("opt-vol-master-val");
                const muv = document.getElementById("opt-vol-music-val");
                const sxv = document.getElementById("opt-vol-sfx-val");
                m.value  = Math.round(state.master * 100);
                mu.value = Math.round(state.music  * 100);
                sx.value = Math.round(state.sfx    * 100);
                if (mv)  mv.textContent  = m.value + "%";
                if (muv) muv.textContent = mu.value + "%";
                if (sxv) sxv.textContent = sx.value + "%";
                const lastDemo = { sfx: 0 };
                m.addEventListener("input", () => {
                    state.master = m.value / 100;
                    if (mv) mv.textContent = m.value + "%";
                    applyVolumes(); save();
                });
                mu.addEventListener("input", () => {
                    state.music = mu.value / 100;
                    if (muv) muv.textContent = mu.value + "%";
                    applyVolumes(); save();
                });
                sx.addEventListener("input", () => {
                    state.sfx = sx.value / 100;
                    if (sxv) sxv.textContent = sx.value + "%";
                    applyVolumes(); save();
                    // Demo audível ao mexer no slider de SFX (throttled).
                    const now = Date.now();
                    if (now - lastDemo.sfx > 200) {
                        lastDemo.sfx = now;
                        window.sfx("ui_click");
                    }
                });
                return true;
            }
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", wireSliders);
            } else { wireSliders(); }
            // Aplica os volumes salvos assim que os <audio> elementos existirem.
            applyVolumes();
        })();
})();
