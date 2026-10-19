/**
 * Dragonfall — garante que o cliente sempre usa a versão mais recente
 * (localhost :5173 e Netlify). Compara version.json com __DF_GAME_V no HTML.
 */
(function (global) {
    "use strict";

    const ATTEMPTS_KEY = "df_ver_attempts";
    const MAX_ATTEMPTS = 8;

    /** Servidor local (serve-local.mjs) já serve HTML + version.json sincronizados. */
    function isLocalDevServer() {
        try {
            const h = global.location?.hostname || "";
            return /^127\.0\.0\.1$|^localhost$/i.test(h);
        } catch (e) {
            return false;
        }
    }

    function readLocal() {
        return {
            build: global.__DF_GAME_V || "dev",
            display: global.__DF_DISPLAY_VERSION || "",
        };
    }

    async function fetchRemote() {
        try {
            const url = new URL("version.json", global.location.href);
            url.searchParams.set("_", String(Date.now()));
            const r = await global.fetch(url.toString(), {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
            });
            if (!r.ok) return null;
            return await r.json();
        } catch (e) {
            return null;
        }
    }

    function isStale(remote, local) {
        if (!remote || !local) return false;
        if (remote.displayVersion && local.display &&
            remote.displayVersion !== local.display) return true;
        if (local.build === "dev") return false;
        if (remote.build && remote.build !== local.build) return true;
        if (remote.sourceHash && remote.sourceHash !== local.build) return true;
        return false;
    }

    /** Partida em andamento — nunca recarregar no meio do jogo. */
    function isMatchActive() {
        const game = global.document?.getElementById("game");
        return !!(game && game.classList.contains("active"));
    }

    async function purgeCaches() {
        try { global.localStorage?.removeItem("df_pwa_build_v"); } catch (e) { /* */ }
        try { global.localStorage?.removeItem("df_assets_ready_v"); } catch (e) { /* */ }
        try {
            if (global.caches) {
                const MEDIA = "dragonfall-media";
                const keys = await global.caches.keys();
                // Preserva artes/vídeos já baixados; só limpa runtime + caches legados.
                await Promise.all(
                    keys
                        .filter((k) => k !== MEDIA)
                        .map((k) => global.caches.delete(k)),
                );
            }
        } catch (e) { /* */ }
        try {
            if (global.navigator?.serviceWorker) {
                const regs = await global.navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
        } catch (e) { /* */ }
    }

    async function hardRefresh(reason, build) {
        if (isLocalDevServer()) return false;
        const attempts = parseInt(global.sessionStorage?.getItem(ATTEMPTS_KEY) || "0", 10);
        if (attempts >= MAX_ATTEMPTS) {
            const el = global.document?.getElementById("df-build-tag");
            if (el) {
                el.innerHTML =
                    "Versão desatualizada — " +
                    '<a href="refresh.html" style="color:#ffd86b">clique aqui para atualizar</a>';
            }
            return false;
        }
        try { global.sessionStorage?.setItem(ATTEMPTS_KEY, String(attempts + 1)); } catch (e) { /* */ }
        await purgeCaches();
        const q = build || Date.now();
        try {
            global.location.replace(global.location.pathname + "?v=" + encodeURIComponent(q));
        } catch (e) {
            global.location.replace("refresh.html");
        }
        return true;
    }

    /**
     * @param {{ reload?: boolean }} [opts]
     */
    async function check(opts = {}) {
        const local = readLocal();
        const remote = await fetchRemote();
        const stale = isStale(remote, local);
        if (stale && opts.reload !== false && !isLocalDevServer()) {
            await hardRefresh("Nova versão no servidor. Atualizando…", remote?.build);
            return { stale: true, remote, local, reloaded: true };
        }
        if (!stale) {
            try { global.sessionStorage?.removeItem(ATTEMPTS_KEY); } catch (e) { /* */ }
        }
        return { stale, remote, local, reloaded: false };
    }

    let pollId = null;

    function startPolling(intervalMs) {
        // Com pacote offline pronto: checagem bem rara (só no menu principal).
        let assetsReady = false;
        try {
            const build = global.__DF_GAME_V || "dev";
            assetsReady = global.localStorage?.getItem("df_assets_ready_v") === build;
        } catch (e) { /* */ }
        const ms = assetsReady
            ? Math.max(intervalMs || 15000, 120000)
            : (intervalMs || 15000);
        stopPolling();
        pollId = global.setInterval(() => {
            if (global.document?.hidden) return;
            if (isMatchActive()) return;
            const main = global.document?.getElementById("main");
            const play = global.document?.getElementById("play-menu");
            // Só no menu inicial — nunca no hub/partida (evita jank em internet lenta).
            if (play && play.classList.contains("active")) return;
            if (main && !main.classList.contains("active")) return;
            check({ reload: true }).catch(() => {});
        }, ms);
    }

    function stopPolling() {
        if (pollId != null) {
            global.clearInterval(pollId);
            pollId = null;
        }
    }

    global.DfVersionGuard = {
        check,
        hardRefresh,
        purgeCaches,
        fetchRemote,
        isStale,
        isMatchActive,
        readLocal,
        startPolling,
        stopPolling,
    };

    if (!isLocalDevServer()) {
        fetchRemote().then((remote) => {
            if (isStale(remote, readLocal())) {
                hardRefresh("Atualizando para a versão mais recente…", remote?.build);
            } else {
                try { global.sessionStorage?.removeItem(ATTEMPTS_KEY); } catch (e) { /* */ }
            }
        }).catch(() => {});

        global.addEventListener?.("focus", () => {
            if (isMatchActive()) return;
            check({ reload: true }).catch(() => {});
        });
    }
})(typeof window !== "undefined" ? window : globalThis);
