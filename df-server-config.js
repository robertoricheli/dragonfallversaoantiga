/**
 * URL padrão do servidor multiplayer + contas (Render).
 * Prioridade PvP: ?df_server= → localStorage → este arquivo → localhost
 */
(function (global) {
    "use strict";
    const defaultServer = "https://artifacts-dragonfall-public.onrender.com";
    global.__DF_DEFAULT_SERVER__ = global.__DF_DEFAULT_SERVER__ || defaultServer;
    global.__DF_AUTH_RENDER__ = global.__DF_AUTH_RENDER__ || defaultServer;

    if (!global.__DF_AUTH_API__) {
        try {
            const loc = global.location;
            const proto = loc?.protocol || "";
            if (proto === "http:" || proto === "https:") {
                // Sempre mesma origem: Netlify e serve-local fazem proxy /auth → Render (um único Postgres).
                global.__DF_AUTH_API__ = String(loc.origin || "").replace(/\/$/, "");
            } else {
                global.__DF_AUTH_API__ = defaultServer;
            }
        } catch (e) {
            global.__DF_AUTH_API__ = defaultServer;
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
