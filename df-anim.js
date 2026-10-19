/**
 * Dragonfall — DfAnim (Fase 1 arquitetura).
 * Gerado por: node scripts/build-phase1-modules.mjs
 */
(function (global) {
    "use strict";

    function create(deps) {
        // ====================================================================
        // DF ANIM — motor unificado de VFX (Ult / Talento / Reação / Habilidade)
        // ====================================================================
        const DfAnim = (() => {
            const POOL_CAP = deps.FX.mobile ? 10 : (deps.FX.medium ? 28 : 36);
            const pools = new Map();
            function poolGet(tag, factory) {
                if (!pools.has(tag)) pools.set(tag, []);
                const pool = pools.get(tag);
                return pool.length ? pool.pop() : factory();
            }
            function poolPut(tag, el) {
                if (!el) return;
                try { el.remove(); } catch (e) {}
                el.removeAttribute("style");
                el.className = "";
                el.innerHTML = "";
                el.textContent = "";
                const pool = pools.get(tag) || [];
                if (pool.length < POOL_CAP) pool.push(el);
                pools.set(tag, pool);
            }
            const CATEGORIES = {
                ultimate: { sfx: "ultimate_intro", cls: "ult-cinema df-anim-ultimate", ms: 900 },
                talent:   { sfx: "card_draw",      cls: "ult-cinema df-anim-talent",   ms: 720 },
                reaction: { sfx: "card_draw",      cls: "ult-cinema df-anim-reaction", ms: 680 },
                skill:    { sfx: null,             cls: "ult-cinema df-anim-skill",    ms: 650 },
            };
            async function preAnimBanner(_opts = {}) {
                return;
                const cat = CATEGORIES[_opts.category] || CATEGORIES.skill;
                const theme = opts.theme || {};
                const color = theme.color || "#ffd060";
                const ring = theme.ring || "#fff8d0";
                const emoji = theme.emoji || "✨";
                const title = String(opts.title || "").toUpperCase();
                const subtitle = opts.subtitle || "";
                const isUlt = opts.category === "ultimate";
                const lite = deps.FX.liteVfx || (isUlt && deps.FX.medium);
                if (cat.sfx) try { window.sfx && window.sfx(cat.sfx); } catch (e) {}
                const ov = poolGet("df-pre-banner", () => document.createElement("div"));
                ov.className = cat.cls + (lite ? " df-anim-lite" : "");
                ov.style.setProperty("--ult-c", color);
                ov.style.setProperty("--ult-c2", ring);
                if (lite) {
                    ov.innerHTML =
                        `<div class="ult-banner df-lite-banner">` +
                            `<span class="df-lite-emoji">${emoji}</span>` +
                            `<div class="df-lite-text">` +
                                `<span class="df-lite-title">${title}</span>` +
                                (subtitle ? `<span class="df-lite-sub">${subtitle}</span>` : "") +
                            `</div>` +
                        `</div>`;
                } else {
                    const ringCount = deps.FX.medium ? 1 : 3;
                    const rings = Array.from({ length: ringCount }, () => "<span></span>").join("");
                    ov.innerHTML =
                        `<div class="ult-vignette"></div>` +
                        `<div class="ult-rings">${rings}</div>` +
                        `<div class="ult-banner">` +
                            `<div class="ult-emoji">${emoji}</div>` +
                            `<div class="ult-title">${title}</div>` +
                            (subtitle ? `<div class="ult-caster">${subtitle}</div>` : "") +
                        `</div>`;
                }
                document.body.appendChild(ov);
                const banner = ov.querySelector(".ult-banner");
                if (banner && !lite) {
                    banner.classList.add("ult-banner-punch");
                    setTimeout(() => banner.classList.remove("ult-banner-punch"), 380);
                }
                const holdMs = lite ? (isUlt ? 420 : 280) : (opts.duration ?? cat.ms);
                const outMs = lite ? 200 : (deps.FX.medium ? 420 : 560);
                await deps.wait(holdMs);
                ov.classList.add("ult-cinema-out");
                await deps.wait(outMs);
                poolPut("df-pre-banner", ov);
            }
            function mountVfxParticle(el, vx, vy) {
                const layout = global.DfLayout;
                const canvas = layout?.isCanvasFieldLayout?.();
                const root = canvas ? (layout.overlayRoot?.() || document.body) : document.body;
                if (el.parentNode !== root) root.appendChild(el);
                if (canvas) {
                    layout.prepareOverlay?.(el);
                    const p = layout.viewportToCanvas(vx, vy);
                    el.style.setProperty("position", "absolute", "important");
                    el.style.left = p.x + "px";
                    el.style.top = p.y + "px";
                    return;
                }
                el.style.position = "fixed";
                el.style.left = vx + "px";
                el.style.top = vy + "px";
            }
            function spawnParticle(x, y, glyph) {
                const p = poolGet("particle", () => {
                    const d = document.createElement("div");
                    d.className = "particle";
                    return d;
                });
                p.className = "particle";
                p.textContent = glyph || "✨";
                p.style.setProperty("--px", (Math.random() - 0.5) * 70 + "px");
                p.style.setProperty("--py", (Math.random() - 0.5) * 70 - 25 + "px");
                mountVfxParticle(p, x, y);
                setTimeout(() => poolPut("particle", p), 800);
            }
            function spawnParticles(x, y, count, glyph) {
                count = deps.FX.n(count);
                for (let i = 0; i < count; i++) {
                    spawnParticle(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24, glyph);
                }
            }
            function spawnTimed(className, setupFn, ms, factory) {
                const el = poolGet(className, factory || (() => document.createElement("div")));
                el.className = className;
                setupFn(el);
                const vx = parseFloat(el.style.left);
                const vy = parseFloat(el.style.top);
                if (global.DfLayout?.isCanvasFieldLayout?.() && Number.isFinite(vx) && Number.isFinite(vy)) {
                    mountVfxParticle(el, vx, vy);
                } else {
                    if (!el.style.position) el.style.position = "fixed";
                    document.body.appendChild(el);
                }
                setTimeout(() => poolPut(className, el), ms);
                return el;
            }
            /** Cria N partículas escaladas pelo deps.FX budget — evita loops
             *  com createElement/remove() que causam micro-travamentos. */
            function spawnBurst(count, className, setupFn, ms, factory) {
                const n = document.documentElement.classList.contains("df-ult-perf")
                    ? deps.FX.nUlt(count) : deps.FX.n(count);
                for (let i = 0; i < n; i++) {
                    const idx = i;
                    spawnTimed(className, (el) => setupFn(el, idx, n), ms, factory);
                }
            }
            async function waapi(el, keyframes, options) {
                if (!el?.animate) { await deps.wait(options?.duration || 280); return; }
                await el.animate(keyframes, options).finished.catch(() => {});
            }
            function themeForCard(card) {
                if (!card) return { color: "#ffd060", ring: "#fff8d0", emoji: "✨" };
                const n = (card.name || "").toUpperCase();
                if (n.includes("FOGO") || n.includes("EXPLOSA")) return { color: "#ff5a1c", ring: "#ffd060", emoji: "🔥" };
                if (n.includes("ZERO") || n.includes("GEL")) return { color: "#5fd0ff", ring: "#cef1ff", emoji: "❄️" };
                if (n.includes("AMEDRONT")) return { color: "#c068ff", ring: "#e8c0ff", emoji: "😨" };
                if (n.includes("BLOQUEAR") || n.includes("PROTEÇÃO")) return { color: "#3ee07a", ring: "#aaffcc", emoji: "🛡️" };
                if (n.includes("VENENOSA") || n.includes("BAFORADA")) return { color: "#6cff3a", ring: "#d4ff8a", emoji: "☠️" };
                if (n.includes("ACELERA")) return { color: "#ff4a1a", ring: "#ffd060", emoji: "👢" };
                if (n.includes("MISSEIS") || n.includes("MÍSSEIS")) return { color: "#ff3030", ring: "#ff9090", emoji: "🚀" };
                return { color: "#b46cff", ring: "#e2c0ff", emoji: "⚡" };
            }
            return { preAnimBanner, spawnParticles, spawnParticle, spawnTimed, spawnBurst, waapi, themeForCard, poolPut, CATEGORIES };
        })();
        window.__dfAnim = DfAnim;
        
        function spawnParticles(x, y, count = 6) {
            DfAnim.spawnParticles(x, y, count);
        }
        
        
        function spawnParticles(x, y, count = 6) { DfAnim.spawnParticles(x, y, count); }
        global.__dfAnim = DfAnim;
        return { DfAnim, spawnParticles };
    }

    global.DfAnimLib = { create };
})(typeof window !== "undefined" ? window : globalThis);
