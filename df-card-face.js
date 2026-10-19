/**
 * DfCardFace — face de carta composta em tempo real
 * (retrato atrás da moldura + textos de df-data).
 * Cartas com composedFace:true usam este módulo; as demais seguem PNG cards/v2.
 */
(function (global) {
    "use strict";

    const FRAME_FILES = {
        champion: "bg/MOLDURA PRINCIPAL CAMPEÃO FINAL.png",
        talent: "bg/MOLDURA PRINCIPAL TALENTO FINAL.png",
        reaction: "bg/MOLDURA PRINCIPAL REAÇÃO FINAL.png",
    };

    const TYPE_LABEL = {
        champion: "Campeão",
        talent: "Talento",
        reaction: "Reação",
    };

    const ABILITY_TYPE_LABEL = {
        instant: "Instantânea",
        constant: "Constante",
    };

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function assetUrl(rel) {
        if (!rel) return "";
        if (typeof global.dfAssetUrl === "function") {
            try {
                const u = global.dfAssetUrl(rel);
                if (u) return u;
            } catch (e) { /* */ }
        }
        return rel.split("/").map((p) => encodeURIComponent(p)).join("/");
    }

    function cardKey(name) {
        return String(name || "").replace(/ /g, "_");
    }

    function mergeCatalogFace(found, runtime) {
        if (!found) return runtime || null;
        if (!runtime || typeof runtime !== "object") return found;
        const merged = Object.assign({}, found, runtime);
        // Runtime/auth MP às vezes vem sem texto de face — nunca apagar a placa.
        if (!merged.abilityDesc && found.abilityDesc) merged.abilityDesc = found.abilityDesc;
        if (!merged.abilityName && found.abilityName) merged.abilityName = found.abilityName;
        if (merged.abilityType == null && found.abilityType != null) {
            merged.abilityType = found.abilityType;
        }
        if (merged.composedFace == null && found.composedFace != null) {
            merged.composedFace = found.composedFace;
        }
        return merged;
    }

    /**
     * WU-KONG / ENIGMA com Imitar: a face mostra o nome e a descrição da
     * habilidade COPIADA, não "Imitar". Os campos mimic* são a fonte confiável
     * (o sync do multiplayer sempre os envia).
     */
    function applyMimicFace(def, runtime) {
        if (!def || !runtime || !runtime.mimico) return def;
        const nm = runtime.mimicAbilityName;
        const ds = runtime.mimicAbilityDesc;
        if (!nm && !ds) return def;
        const out = Object.assign({}, def);
        if (nm) out.abilityName = nm;
        if (ds) out.abilityDesc = ds;
        if (runtime.abilityType) out.abilityType = runtime.abilityType;
        out.__mimicFace = `${nm || ""}|${ds || ""}`;
        return out;
    }

    /** Identidade da face para decidir se precisa remontar (nome + imitação). */
    function faceIdentity(def) {
        return `${def?.name || ""}${def?.__mimicFace ? "@" + def.__mimicFace : ""}`;
    }

    function resolveDef(cardOrDef) {
        if (!cardOrDef) return null;
        let name = typeof cardOrDef === "string" ? cardOrDef : cardOrDef.name;
        if (typeof global.DfData?.resolveCardName === "function") {
            name = global.DfData.resolveCardName(name);
        }
        const defs = global.DfData?.cardDefs || global.cardDefs || [];
        const found = defs.find((d) => d && d.name === name);
        if (found) {
            if (typeof cardOrDef === "object") {
                return applyMimicFace(mergeCatalogFace(found, cardOrDef), cardOrDef);
            }
            return found;
        }
        const baby = global.DfData?.babyDragonDef;
        const cubic = global.DfData?.cubicDragonDef;
        if (baby && baby.name === name) {
            return typeof cardOrDef === "object" ? mergeCatalogFace(baby, cardOrDef) : baby;
        }
        if (cubic && cubic.name === name) {
            return typeof cardOrDef === "object" ? mergeCatalogFace(cubic, cardOrDef) : cubic;
        }
        // Só use o objeto cru se já tiver texto de face completo.
        if (typeof cardOrDef === "object"
            && cardOrDef.composedFace != null
            && cardOrDef.category
            && (cardOrDef.abilityDesc || cardOrDef.abilityName || cardOrDef.category !== "champion")) {
            return cardOrDef;
        }
        return typeof cardOrDef === "object" ? cardOrDef : null;
    }

    function isComposed(cardOrNameOrDef) {
        const def = resolveDef(cardOrNameOrDef);
        if (def && def.composedFace) return true;
        if (typeof cardOrNameOrDef === "string") {
            const d = (global.DfData?.cardDefs || []).find((x) => x.name === cardOrNameOrDef);
            return !!(d && d.composedFace);
        }
        return false;
    }

    function faceVariant(def) {
        if (!def) return "champion";
        if (def.subcategory === "reaction") return "reaction";
        if (def.category === "talent") return "talent";
        return "champion";
    }

    function displayName(def) {
        if (def.displayName) return def.displayName;
        const n = String(def.name || "");
        return n.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }

    function powerValue(def, opts) {
        if (opts && opts.power != null && Number.isFinite(+opts.power)) return +opts.power;
        if (def.currentPower != null && Number.isFinite(+def.currentPower)) return +def.currentPower;
        if (def.power != null && Number.isFinite(+def.power)) return +def.power;
        // NaN / face sem .pow — fallback do catálogo.
        const nm = def && def.name;
        if (nm) {
            const cat = (global.DfData?.cardDefs || global.cardDefs || [])
                .find?.((x) => x && x.name === nm);
            if (cat && Number.isFinite(+cat.power)) return +cat.power;
        }
        return 0;
    }

    function abilityLine(def) {
        if (faceVariant(def) !== "champion") return "";
        const an = def.abilityName || "";
        const at = ABILITY_TYPE_LABEL[def.abilityType] || "";
        if (an && at) return `${an} - (${at})`;
        return an || "";
    }

    function formatDesc(text) {
        const raw = String(text || "");
        return esc(raw)
            .replace(/\r\n/g, "\n")
            .replace(/\n/g, "<br>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    function portraitUrls(name) {
        const k = cardKey(name);
        const q = (() => {
            const h = global.__DF_PORTRAIT_HASHES;
            if (h && (h[k] || h[name])) return `?v=${encodeURIComponent(h[k] || h[name])}`;
            if (global.__DF_CARD_ART_V) return `?v=${encodeURIComponent(global.__DF_CARD_ART_V)}`;
            return "";
        })();
        const preferWebp = () => {
            try {
                if (global.__DF_WEBP_OK === false) return false;
                if (global.__DF_WEBP_OK === true) return true;
                const c = document.createElement("canvas");
                return c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
            } catch (e) { return false; }
        };
        const urls = [];
        if (preferWebp()) urls.push(`cards/portraits/${k}.webp${q}`);
        urls.push(`cards/portraits/${k}.png${q}`, `cards/portraits/${k}.png`);
        // NUNCA cair em cards/v2 (PNG antiga completa) — evita flash da arte velha.
        return urls.map(assetUrl);
    }

    function frameUrl(variant) {
        return assetUrl(FRAME_FILES[variant] || FRAME_FILES.champion);
    }

    function buildHtml(cardOrDef, opts) {
        const def = resolveDef(cardOrDef);
        if (!def || !def.name) return "";
        const variant = faceVariant(def);
        const pow = powerValue(def, opts || {});
        const name = displayName(def);
        const ability = abilityLine(def);
        const desc = formatDesc(def.abilityDesc || "");
        const artUrls = portraitUrls(def.name);
        const art0 = artUrls[0] || "";
        const frame = frameUrl(variant);
        const pathsAttr = esc(JSON.stringify(artUrls));

        // Reduz a fonte quando o nome da carta (> 15) ou o nome da habilidade
        // (> 18) forem longos — evita corte/estouro na moldura.
        const nameLen = String(name || "").length;
        let nameCls = "";
        if (nameLen > 20) nameCls = " df-card-face__name--xlong";
        else if (nameLen > 15) nameCls = " df-card-face__name--long";
        const abilityNameLen = String(def.abilityName || "").length;
        let abilityCls = "";
        if (abilityNameLen > 26) abilityCls = " df-card-face__ability--xlong";
        else if (abilityNameLen > 18) abilityCls = " df-card-face__ability--long";

        return (
            `<div class="df-card-face df-card-face--${variant}" data-card-name="${esc(def.name)}" data-composed="1">` +
            `<div class="df-card-face__stage">` +
            `<div class="df-card-face__art-clip">` +
            `<img class="df-card-face__art" src="${esc(art0)}" alt="" draggable="false" decoding="async" ` +
            `data-path-idx="0" data-paths="${pathsAttr}" ` +
            `onerror="window.DfCardFace&&window.DfCardFace.onArtError(this)">` +
            `</div>` +
            `<img class="df-card-face__frame" src="${esc(frame)}" alt="" draggable="false" decoding="async">` +
            ((opts && opts.hidePower)
                ? ""
                : `<div class="df-card-face__power" data-pow="${pow}">${pow}</div>`) +
            `<div class="df-card-face__name${nameCls}">${esc(name)}</div>` +
            (ability ? `<div class="df-card-face__ability${abilityCls}">${esc(ability)}</div>` : "") +
            `<div class="df-card-face__desc">${desc}</div>` +
            `<div class="df-card-face__type">${esc(TYPE_LABEL[variant] || TYPE_LABEL.champion)}</div>` +
            `</div></div>`
        );
    }

    function onArtError(img) {
        if (!img) return;
        let urls;
        try { urls = JSON.parse(img.dataset.paths || "[]"); } catch (e) { return; }
        const i = (parseInt(img.dataset.pathIdx, 10) || 0) + 1;
        if (i >= urls.length) return;
        img.dataset.pathIdx = String(i);
        img.src = urls[i];
    }

    function mount(host, cardOrDef, opts) {
        if (!host) return null;
        const def = resolveDef(cardOrDef);
        if (!def || !isComposed(def)) return null;
        const existing = host.querySelector(":scope > .df-card-face");
        if (existing) {
            // Compara também a habilidade imitada: só o nome do campeão faria a
            // face do WU-KONG/ENIGMA continuar mostrando "Imitar" para sempre.
            const sameName = existing.getAttribute("data-card-face-id") === faceIdentity(def)
                || (!existing.hasAttribute("data-card-face-id")
                    && !def.__mimicFace
                    && (existing.getAttribute("data-card-name") === def.name
                        || existing.querySelector(".df-card-face__name")?.textContent === displayName(def)));
            if (sameName) {
                updatePower(host, powerValue(def, opts || {}), opts);
                // Já montada: se imagens prontas, art-ready; senão loading opaco.
                const art = existing.querySelector(".df-card-face__art");
                const frame = existing.querySelector(".df-card-face__frame");
                const ready = !!(art?.complete && frame?.complete);
                host.classList.add("has-composed-face", "has-art");
                if (ready) {
                    host.classList.add("art-ready");
                    host.classList.remove("df-card-face--loading", "art-loading");
                } else {
                    host.classList.add("df-card-face--loading");
                    host.classList.remove("art-ready");
                    markFaceImagesReady(host, existing);
                }
                return existing;
            }
            existing.remove();
        }
        const html = buildHtml(def, opts);
        host.insertAdjacentHTML("afterbegin", html);
        const face = host.querySelector(":scope > .df-card-face");
        if (face) {
            face.setAttribute("data-card-name", def.name);
            face.setAttribute("data-card-face-id", faceIdentity(def));
        }
        host.classList.add("has-composed-face", "has-art", "df-card-face--loading");
        host.classList.remove("art-ready", "art-loading", "preview-art-loading");
        markFaceImagesReady(host, face);
        // Mantém .nm oculto mas presente para lookups legados
        if (!host.querySelector(":scope > .nm")) {
            const nm = document.createElement("div");
            nm.className = "nm";
            nm.textContent = def.name;
            nm.hidden = true;
            host.appendChild(nm);
        } else {
            const nm = host.querySelector(":scope > .nm");
            if (nm) nm.textContent = def.name;
        }
        return face;
    }

    /** Só marca art-ready quando portrait + moldura decodificaram (evita moldura transparente). */
    function markFaceImagesReady(host, face) {
        if (!host || !face) return;
        const art = face.querySelector(".df-card-face__art");
        const frame = face.querySelector(".df-card-face__frame");
        const finish = () => {
            host.classList.remove("df-card-face--loading", "art-loading", "preview-art-loading");
            host.classList.add("art-ready");
        };
        const decodeOne = (img) => {
            if (!img) return Promise.resolve();
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            if (typeof img.decode === "function") {
                return img.decode().catch(() => new Promise((resolve) => {
                    img.addEventListener("load", resolve, { once: true });
                    img.addEventListener("error", resolve, { once: true });
                }));
            }
            return new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
            });
        };
        Promise.all([decodeOne(art), decodeOne(frame)]).then(finish).catch(finish);
        // Cinto de segurança — nunca ficar loading eterno.
        setTimeout(finish, 1200);
    }

    function updatePower(host, power, opts) {
        if (!host) return;
        const face = host.querySelector?.(".df-card-face") || (host.classList?.contains("df-card-face") ? host : null);
        if (!face) return;
        const el = face.querySelector(".df-card-face__power");
        if (!el) return;
        const n = Number(power);
        if (!Number.isFinite(n)) return;
        const prev = el.getAttribute("data-pow");
        el.textContent = String(n);
        el.setAttribute("data-pow", String(n));
        if (opts && opts.animate && prev != null && String(prev) !== String(n)) {
            el.classList.remove("df-card-face__power--flash");
            void el.offsetWidth;
            el.classList.add("df-card-face__power--flash");
        }
    }

    /** Textura canvas da face (Pixi / VFX). */
    function renderToCanvas(cardOrDef, opts) {
        const def = resolveDef(cardOrDef);
        if (!def) return Promise.reject(new Error("no def"));
        const w = (opts && opts.width) || 372;
        const h = (opts && opts.height) || 520;
        const variant = faceVariant(def);
        const pow = powerValue(def, opts || {});

        const loadImg = (url) => new Promise((resolve, reject) => {
            if (!url) return reject(new Error("url"));
            const im = new Image();
            im.crossOrigin = "anonymous";
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("img"));
            im.src = url;
        });

        const tryUrls = async (urls) => {
            for (const u of urls) {
                try { return await loadImg(u); } catch (e) { /* next */ }
            }
            return null;
        };

        return Promise.all([
            tryUrls(portraitUrls(def.name)),
            loadImg(frameUrl(variant)),
        ]).then(([art, frame]) => {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("ctx");

            // Arte na janela (mesmos % do CSS) — contain = imagem completa
            const isChamp = variant === "champion";
            const ax = w * (isChamp ? 0.11 : 0.11);
            const ay = h * (isChamp ? 0.14 : 0.16);
            const aw = w * (isChamp ? 0.78 : 0.78);
            const ah = h * (isChamp ? 0.555 : 0.565);
            if (art) {
                const scale = Math.min(aw / art.naturalWidth, ah / art.naturalHeight) * 1.1;
                const dw = art.naturalWidth * scale;
                const dh = art.naturalHeight * scale;
                const dx = ax + (aw - dw) / 2;
                const dy = ay + (ah - dh) / 2;
                ctx.save();
                ctx.beginPath();
                ctx.rect(ax - aw * 0.06, ay - ah * 0.06, aw * 1.12, ah * 1.12);
                ctx.clip();
                ctx.drawImage(art, dx, dy, dw, dh);
                ctx.restore();
            }

            if (frame) ctx.drawImage(frame, 0, 0, w, h);

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Poder — MESMAS medidas do CSS (.df-card-face__power): fonte 11.5% da
            // largura, centro em left+width/2 e top+height/2. Sem isto o número
            // muda de tamanho/posição quando a carta vira textura (voo/combate).
            if (!(opts && opts.hidePower)) {
                const powLeft = isChamp ? 0.042 : 0.044;
                const powCx = w * (powLeft + 0.165 / 2);
                const powCy = h * (0.031 + 0.118 / 2);
                ctx.save();
                ctx.font = `800 ${w * 0.115}px "Fredoka", "Segoe UI", Arial, sans-serif`;
                ctx.shadowColor = "rgba(0,0,0,0.45)";
                ctx.shadowOffsetY = w * 0.115 * 0.05;
                ctx.shadowBlur = w * 0.115 * 0.15;
                ctx.fillStyle = "#fff";
                ctx.fillText(String(pow), powCx, powCy);
                ctx.restore();
            }

            // Nome — encolhe se longo (> 15 chars), igual à face DOM.
            const name = displayName(def);
            let nameFontPx = Math.round(h * 0.038);
            if (name.length > 20) nameFontPx = Math.round(h * 0.0295);
            else if (name.length > 15) nameFontPx = Math.round(h * 0.0335);
            ctx.font = `700 ${nameFontPx}px "Fredoka", "Segoe UI", Arial, sans-serif`;
            if (isChamp) {
                ctx.fillStyle = "#fff";
            } else {
                ctx.fillStyle = "#4a2e18";
            }
            ctx.fillText(name, w * 0.56, h * 0.078, w * 0.7);

            if (isChamp) {
                const ab = abilityLine(def);
                if (ab) {
                    ctx.fillStyle = "#fff";
                    let abFontPx = Math.round(h * 0.026);
                    const abNameLen = String(def.abilityName || "").length;
                    if (abNameLen > 26) abFontPx = Math.round(h * 0.0205);
                    else if (abNameLen > 18) abFontPx = Math.round(h * 0.0232);
                    ctx.font = `600 ${abFontPx}px "Fredoka", "Segoe UI", Arial, sans-serif`;
                    ctx.fillText(ab, w * 0.5, h * 0.74, w * 0.78);
                }
            }

            // Descrição (quebra simples) — dentro do box branco
            const desc = String(def.abilityDesc || "");
            ctx.fillStyle = isChamp ? "#3a3a3a" : "#4a2e18";
            const fontSize = Math.round(h * 0.022);
            ctx.font = `600 ${fontSize}px "Fredoka", "Segoe UI", Arial, sans-serif`;
            const maxW = w * 0.74;
            const words = desc.split(/\s+/);
            const lines = [];
            let line = "";
            for (const word of words) {
                const test = line ? `${line} ${word}` : word;
                if (ctx.measureText(test).width > maxW && line) {
                    lines.push(line);
                    line = word;
                } else line = test;
            }
            if (line) lines.push(line);
            const startY = h * (isChamp ? 0.858 : 0.853);
            const lineH = fontSize * 1.18;
            const shown = lines.slice(0, 7);
            const blockH = shown.length * lineH;
            let y = startY - blockH / 2 + lineH / 2 + h * 0.008;
            for (const ln of shown) {
                ctx.fillText(ln, w * 0.5, y, maxW);
                y += lineH;
            }

            // Tipo da carta — as molduras FINAL deixam a placa inferior vazia.
            const typeColor = {
                champion: "#ffffff",
                talent: "#c4142e",
                reaction: "#43a51d",
            };
            const isChampionType = variant === "champion";
            ctx.font = `800 ${Math.round(h * (isChampionType ? 0.0228 : 0.028))}px "Fredoka", "Segoe UI", Arial, sans-serif`;
            ctx.fillStyle = typeColor[variant] || typeColor.champion;
            ctx.strokeStyle = isChampionType
                ? "rgba(0, 38, 88, 0.88)"
                : "rgba(255, 255, 255, 0.86)";
            ctx.lineWidth = Math.max(1, h * 0.0025);
            ctx.lineJoin = "round";
            const typeLabel = TYPE_LABEL[variant] || TYPE_LABEL.champion;
            ctx.strokeText(typeLabel, w * 0.5, h * 0.974, w * 0.29);
            ctx.fillText(typeLabel, w * 0.5, h * 0.974, w * 0.29);

            return canvas;
        });
    }

    /**
     * Cache de dataURL da face composta — summon/Pixi nunca usam cards/v2.
     * A chave inclui o PODER: o número está assado na textura, então um campeão
     * fortalecido precisa de uma entrada própria (senão o combate mostrava o
     * Poder base de quem foi buffado).
     */
    const _faceDataUrlCache = new Map();
    const _faceBakeCache = new Map(); // ImageBitmap | HTMLCanvasElement
    const _faceWarmPromises = new Map();
    const FACE_DATA_URL_CACHE_MAX = 48;
    const FACE_BAKE_CONCURRENCY = 3;
    let _faceBakeActive = 0;
    const _faceBakeWaiters = [];

    function faceCacheKey(name, pow, opts) {
        const hide = opts && opts.hidePower ? "#hidpow" : "";
        // A textura assada precisa distinguir a habilidade imitada, senão o
        // WU-KONG/ENIGMA reusa a face antiga ("Imitar") depois de copiar.
        const mimic = opts && opts.mimicFace ? `#${opts.mimicFace}` : "";
        return `${name}#${pow}${hide}${mimic}`;
    }

    function faceCacheTouch(key, url) {
        if (!key || !url) return;
        if (_faceDataUrlCache.has(key)) _faceDataUrlCache.delete(key);
        _faceDataUrlCache.set(key, url);
        while (_faceDataUrlCache.size > FACE_DATA_URL_CACHE_MAX) {
            const oldest = _faceDataUrlCache.keys().next().value;
            if (oldest === undefined) break;
            _faceDataUrlCache.delete(oldest);
            _faceBakeCache.delete(oldest);
        }
    }

    function faceBakeTouch(key, bake) {
        if (!key || !bake) return;
        if (_faceBakeCache.has(key)) _faceBakeCache.delete(key);
        _faceBakeCache.set(key, bake);
        while (_faceBakeCache.size > FACE_DATA_URL_CACHE_MAX) {
            const oldest = _faceBakeCache.keys().next().value;
            if (oldest === undefined) break;
            const old = _faceBakeCache.get(oldest);
            _faceBakeCache.delete(oldest);
            try { if (old && typeof old.close === "function") old.close(); } catch (e) { /* */ }
        }
    }

    function acquireFaceBakeSlot() {
        if (_faceBakeActive < FACE_BAKE_CONCURRENCY) {
            _faceBakeActive += 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            _faceBakeWaiters.push(resolve);
        }).then(() => {
            _faceBakeActive += 1;
        });
    }

    function releaseFaceBakeSlot() {
        _faceBakeActive = Math.max(0, _faceBakeActive - 1);
        const next = _faceBakeWaiters.shift();
        if (next) next();
    }

    function getFaceBakeSource(name, power, opts) {
        if (!name) return null;
        const def = resolveDef(name);
        if (!def) return null;
        const pow = (power != null && Number.isFinite(+power))
            ? +power
            : powerValue(def, {});
        const key = faceCacheKey(def.name, pow, opts);
        const bake = _faceBakeCache.get(key);
        if (bake) {
            faceBakeTouch(key, bake);
            return bake;
        }
        return null;
    }

    function getFaceDataUrl(name, power, opts) {
        if (!name) return "";
        const def = resolveDef(name);
        if (!def) return "";
        const pow = (power != null && Number.isFinite(+power))
            ? +power
            : powerValue(def, {});
        const key = faceCacheKey(def.name, pow, opts);
        const hit = _faceDataUrlCache.get(key);
        if (hit) {
            faceCacheTouch(key, hit);
            return hit;
        }
        // Lazy dataURL from bake (DOM fallback) — evita toDataURL no caminho quente.
        const bake = _faceBakeCache.get(key);
        if (bake) {
            try {
                let url = "";
                if (typeof HTMLCanvasElement !== "undefined" && bake instanceof HTMLCanvasElement) {
                    url = bake.toDataURL("image/png");
                } else if (typeof OffscreenCanvas !== "undefined" && bake instanceof OffscreenCanvas) {
                    /* skip — sync convert not available */
                } else if (typeof document !== "undefined" && bake) {
                    const c = document.createElement("canvas");
                    c.width = bake.width || 372;
                    c.height = bake.height || 520;
                    const ctx = c.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(bake, 0, 0);
                        url = c.toDataURL("image/png");
                    }
                }
                if (url) {
                    faceCacheTouch(key, url);
                    return url;
                }
            } catch (e) { /* */ }
        }
        return "";
    }

    function warmFace(cardOrDef, opts) {
        const def = resolveDef(cardOrDef);
        if (!def || !def.name || !isComposed(def)) return Promise.resolve("");
        const pow = powerValue(def, opts || {});
        // Imitação entra na chave: sem isso a textura de "Imitar" era reusada
        // depois do WU-KONG/ENIGMA copiar outra habilidade.
        if (def.__mimicFace) opts = Object.assign({}, opts, { mimicFace: def.__mimicFace });
        const key = faceCacheKey(def.name, pow, opts);
        const cached = _faceDataUrlCache.get(key);
        if (cached) {
            faceCacheTouch(key, cached);
            return Promise.resolve(cached);
        }
        if (_faceBakeCache.has(key)) {
            const url = getFaceDataUrl(def.name, pow, opts);
            if (url) return Promise.resolve(url);
        }
        let pending = _faceWarmPromises.get(key);
        if (pending) return pending;
        pending = (async () => {
            await acquireFaceBakeSlot();
            try {
                const canvas = await renderToCanvas(
                    def,
                    Object.assign({ width: 372, height: 520 }, opts || {}, { power: pow }),
                );
                let bake = canvas;
                try {
                    if (typeof createImageBitmap === "function") {
                        bake = await createImageBitmap(canvas);
                    }
                } catch (e) {
                    bake = canvas;
                }
                faceBakeTouch(key, bake);
                // dataURL só sob demanda (DOM); Pixi usa bake via getFaceBakeSource.
                let url = "";
                try { url = canvas.toDataURL("image/png"); } catch (e) { url = ""; }
                if (url) faceCacheTouch(key, url);
                return url;
            } catch (e) {
                return "";
            } finally {
                releaseFaceBakeSlot();
                _faceWarmPromises.delete(key);
            }
        })();
        _faceWarmPromises.set(key, pending);
        return pending;
    }

    /** Warm só nomes pedidos (mão/campo/baralho ativo) — não o catálogo inteiro. */
    function warmComposedFaces(names) {
        const list = Array.isArray(names) ? names : [];
        const seen = new Set();
        const jobs = [];
        for (const n of list) {
            const def = resolveDef(n);
            if (!def || !def.composedFace || !def.name || seen.has(def.name)) continue;
            seen.add(def.name);
            jobs.push(warmFace(def));
        }
        return Promise.all(jobs);
    }

    function warmAllComposedFaces() {
        const defs = global.DfData?.cardDefs || [];
        const extras = [global.DfData?.babyDragonDef, global.DfData?.cubicDragonDef].filter(Boolean);
        const names = [];
        const seen = new Set();
        for (const d of defs.concat(extras)) {
            if (!d || !d.composedFace || !d.name || seen.has(d.name)) continue;
            seen.add(d.name);
            names.push(d.name);
        }
        return warmComposedFaces(names);
    }

    // NÃO aquecer todas as faces no DOMContentLoaded — atrasava o boot.
    // warmFace / warmShellAssets / 1ª invocação aquecem sob demanda.

    const api = {
        FRAME_FILES,
        TYPE_LABEL,
        isComposed,
        resolveDef,
        faceVariant,
        buildHtml,
        mount,
        updatePower,
        portraitUrls,
        frameUrl,
        onArtError,
        renderToCanvas,
        displayName,
        powerValue,
        getFaceDataUrl,
        getFaceBakeSource,
        warmFace,
        warmComposedFaces,
        warmAllComposedFaces,
    };

    global.DfCardFace = api;
})(typeof window !== "undefined" ? window : globalThis);
