/* Dragonfall Service Worker — updates incrementais (1.47.62+).
 *
 * Estratégia:
 *  - dragonfall-runtime-<build>: HTML/JS/CSS/manifests (trocado a cada versão).
 *  - dragonfall-media: artes/áudio/vídeo (PERSISTENTE entre versões).
 *  - Com arquivo no cache: cache-first — internet lenta não trava.
 *  - HTML: network-first curto + fallback ao index cacheado.
 *  - version.json / manifests: network-only.
 *  - PRECACHE_CRITICAL: pacote jogável (sem .mp4); skip se ?h=/?v= já está no cache.
 *  - PRECACHE_COSMETIC: vídeos .mp4 opcionais em 2º plano (legado; fundos do hub são PNG).
 */
const CACHE_VERSION = "dragonfall-runtime-70a6141860e4";
const MEDIA_CACHE = "dragonfall-media";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./logo.png",
];

function isVersionMeta(pathname) {
  return (
    pathname.endsWith("/version.json") ||
    pathname.endsWith("/asset-manifest.json") ||
    pathname.endsWith("/asset-manifest-critical.json") ||
    pathname.endsWith("/asset-manifest-cosmetic.json") ||
    pathname.endsWith("/asset-manifest-after-hub.json") ||
    pathname.endsWith("/asset-manifest-match-ready.json") ||
    pathname.endsWith("/asset-content-hashes.json") ||
    pathname.endsWith("/card-hashes.json") ||
    pathname.endsWith("/BUILD.txt")
  );
}

function isMediaPath(pathname) {
  if (/\.(mp3|mp4|webm|png|jpe?g|webp|gif|svg|woff2?)$/i.test(pathname)) {
    if (/\/js\//.test(pathname) || /\/css\//.test(pathname)) return false;
    return true;
  }
  return /\/(cards|heroes|gems|champions|bg|fx|ui|vfx|audio)\//.test(pathname);
}

function isRuntimeAsset(pathname) {
  return /\/js\//.test(pathname) || /\/css\//.test(pathname);
}

function cacheNameForPath(pathname) {
  return isMediaPath(pathname) ? MEDIA_CACHE : CACHE_VERSION;
}

function urlLooksCacheable(pathname) {
  return /\.(png|jpe?g|webp|gif|svg|mp3|mp4|webm|json|js|css|txt|webmanifest|woff2?)$/i.test(pathname);
}

function isCacheableResponse(res, urlStr) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (
    ct.includes("image/") || ct.includes("audio/") || ct.includes("video/")
    || ct.includes("application/json") || ct.includes("manifest+json")
    || ct.includes("javascript") || ct.includes("text/css")
    || ct.includes("text/javascript") || ct.includes("application/octet-stream")
  ) return true;
  try {
    return urlLooksCacheable(new URL(urlStr).pathname);
  } catch (e) {
    return false;
  }
}

function shouldKeepCacheName(name) {
  if (name === MEDIA_CACHE) return true;
  if (name === CACHE_VERSION) return true;
  return false;
}

function contentQueryToken(url) {
  try {
    return url.searchParams.get("h") || url.searchParams.get("v") || "";
  } catch (e) {
    return "";
  }
}

async function matchCache(cache, req, opts) {
  let cached = await cache.match(req);
  if (cached) return cached;
  const exactQuery = !!(opts && opts.exactQuery);
  // Mesmo pathname + mesmo hash (?h= ou ?v=) — cobre migração SW↔runtime.
  try {
    const url = typeof req === "string" ? new URL(req) : new URL(req.url);
    const want = contentQueryToken(url);
    if (want) {
      const keys = await cache.keys();
      for (const key of keys) {
        try {
          const ku = new URL(key.url);
          if (ku.origin !== url.origin || ku.pathname !== url.pathname) continue;
          if (contentQueryToken(ku) === want) {
            const hit = await cache.match(key);
            if (hit) return hit;
          }
        } catch (e) { /* */ }
      }
      if (exactQuery) return null;
    }
  } catch (e) { /* */ }
  if (exactQuery) return null;
  // Sem hash na URL: ignoreSearch ok (legado).
  try {
    const url = typeof req === "string" ? new URL(req) : new URL(req.url);
    if (url.searchParams.has("h") || url.searchParams.has("v")) return null;
  } catch (e) { /* */ }
  try { cached = await cache.match(req, { ignoreSearch: true }); } catch (e) { /* */ }
  return cached;
}

/** Match em media + runtime. Precache usa exactQuery para respeitar ?h=. */
async function matchAnyAssetCache(urlStr, opts) {
  let pathname = "/";
  try { pathname = new URL(urlStr).pathname; } catch (e) { /* */ }
  const preferred = cacheNameForPath(pathname);
  const names = preferred === MEDIA_CACHE
    ? [MEDIA_CACHE, CACHE_VERSION]
    : [CACHE_VERSION, MEDIA_CACHE];
  for (const name of names) {
    try {
      const cache = await caches.open(name);
      const hit = await matchCache(cache, urlStr, opts);
      if (hit && isCacheableResponse(hit, urlStr)) return { cache, hit, name };
    } catch (e) { /* */ }
  }
  return null;
}

async function networkOnly(req) {
  return fetch(req, { cache: "no-store" });
}

async function networkFirstTimed(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const cachedPromise = matchCache(cache, req);
  let networkRes = null;
  let networkErr = null;
  const networkPromise = fetch(req, { cache: "no-store" })
    .then((res) => {
      networkRes = res;
      if (res && res.status === 200 && res.type === "basic" && isCacheableResponse(res, req.url)) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch((e) => {
      networkErr = e;
      return null;
    });

  const winner = await Promise.race([
    networkPromise,
    new Promise((r) => setTimeout(() => r("timeout"), timeoutMs || 2500)),
  ]);

  if (winner && winner !== "timeout" && networkRes) return networkRes;
  const cached = await cachedPromise;
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }
  if (networkRes) return networkRes;
  if (networkErr) throw networkErr;
  await networkPromise;
  if (networkRes) return networkRes;
  throw new Error("offline");
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await matchCache(cache, req);
  if (cached) {
    fetch(req, { cache: "no-store" })
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic" && isCacheableResponse(res, req.url)) {
          cache.put(req, res.clone()).catch(() => {});
        }
      })
      .catch(() => {});
    return cached;
  }
  // Fallback: media/runtime cruzado (ex.: rebuild com novo ?h=).
  const cross = await matchAnyAssetCache(req.url);
  if (cross && cross.hit) {
    cache.put(req, cross.hit.clone()).catch(() => {});
    return cross.hit;
  }
  const res = await fetch(req, { cache: "no-store" });
  if (res && res.status === 200 && res.type === "basic" && isCacheableResponse(res, req.url)) {
    cache.put(req, res.clone()).catch(() => {});
  }
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !shouldKeepCacheName(k))
          .map((k) => caches.delete(k)),
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate"
              || (req.headers.get("accept") || "").includes("text/html")
              || url.pathname.endsWith("/")
              || url.pathname.endsWith("index.html");

  if (isVersionMeta(url.pathname)) {
    event.respondWith(
      networkOnly(req).catch(() =>
        new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } })
      )
    );
    return;
  }

  if (isHTML) {
    event.respondWith(
      networkFirstTimed(req, CACHE_VERSION, 2500).catch(() =>
        caches.match("./index.html").then((c) =>
          c || new Response("Offline", { status: 503, statusText: "Offline" })
        )
      )
    );
    return;
  }

  const bucket = cacheNameForPath(url.pathname);
  if (isRuntimeAsset(url.pathname) || isMediaPath(url.pathname)
      || /\.(mp3|mp4|webm|json|png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      cacheFirst(req, bucket).catch(() =>
        new Response("", { status: 504, statusText: "Offline" })
      )
    );
    return;
  }

  event.respondWith(
    cacheFirst(req, bucket).catch(() => {
      if (req.mode === "navigate") return caches.match("./index.html");
      return new Response("", { status: 504, statusText: "Offline" });
    })
  );
});

function contentHashForRel(rel, contentHashes) {
  if (!contentHashes || typeof contentHashes !== "object") return null;
  const key = rel.startsWith("/") ? rel : ("/" + rel);
  return contentHashes[key] || contentHashes[rel] || null;
}

function buildPrecacheUrl(rel, base, buildId, cardHashes, contentHashes) {
  let u = new URL(rel, base).toString();
  const pathname = (() => {
    try { return new URL(u).pathname; } catch (e) { return rel; }
  })();

  // Cartas: mesmo ?v=<cardHash> que df-card-art-boot / dfAssetUrl (PNG e WebP).
  const cardM = pathname.match(/\/cards\/(?:v2\/)?([^/]+)\.(?:png|webp)$/i)
    || String(rel).match(/^\/cards\/(?:v2\/)?([^/]+)\.(?:png|webp)$/i);
  if (cardM && cardHashes && cardHashes[cardM[1]]) {
    u += (u.includes("?") ? "&" : "?") + "v=" + cardHashes[cardM[1]];
    return u;
  }

  if (isMediaPath(pathname)) {
    const h = contentHashForRel(rel, contentHashes);
    if (h) u += (u.includes("?") ? "&" : "?") + "h=" + h;
    return u;
  }

  if (/^\/js\/.+\.js$/i.test(rel) && buildId) {
    u += (u.includes("?") ? "&" : "?") + "v=" + buildId;
  } else if (/^\/css\/.+\.css$/i.test(rel) && buildId) {
    u += (u.includes("?") ? "&" : "?") + "v=" + buildId;
  }
  return u;
}

async function pruneMediaCache(keepUrls) {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const keys = await cache.keys();
    const keep = new Set(keepUrls.map((u) => {
      try {
        const x = new URL(u);
        return x.origin + x.pathname;
      } catch (e) {
        return u;
      }
    }));
    await Promise.all(keys.map(async (req) => {
      try {
        const x = new URL(req.url);
        const key = x.origin + x.pathname;
        if (!keep.has(key)) await cache.delete(req);
      } catch (e) { /* */ }
    }));
  } catch (e) { /* */ }
}

async function runPrecacheJob(client, opts) {
  const tier = (opts && opts.tier) || "critical";
  const force = !!(opts && opts.force);
  let manifestName = "asset-manifest-critical.json";
  if (tier === "cosmetic") manifestName = "asset-manifest-cosmetic.json";
  else if (tier === "after-hub") manifestName = "asset-manifest-after-hub.json";
  else if (tier === "match-ready") manifestName = "asset-manifest-match-ready.json";
  else if (tier === "full") manifestName = "asset-manifest.json";

  const manifestUrl = new URL("./" + manifestName, self.location.href).toString();
  let list;
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    list = await res.json();
  } catch (e) {
    const fullRes = await fetch(new URL("./asset-manifest.json", self.location.href).toString(), { cache: "no-store" });
    const full = await fullRes.json();
    if (tier === "cosmetic") list = full.filter((rel) => /\.mp4$/i.test(rel));
    else if (tier === "after-hub" || tier === "match-ready") list = full.filter((rel) => !/\.mp4$/i.test(rel));
    else if (tier === "critical") list = full.filter((rel) => !/\.mp4$/i.test(rel));
    else list = full;
  }

  let cardHashes = {};
  try {
    const hr = await fetch(new URL("./card-hashes.json", self.location.href).toString(), { cache: "no-store" });
    cardHashes = await hr.json();
  } catch (e) { /* ok */ }

  let contentHashes = {};
  try {
    const chr = await fetch(new URL("./asset-content-hashes.json", self.location.href).toString(), { cache: "no-store" });
    contentHashes = await chr.json();
  } catch (e) { /* ok — builds antigos */ }

  const base = new URL("./", self.location.href);
  const buildId = CACHE_VERSION.replace(/^dragonfall-runtime-/, "").replace(/^dragonfall-/, "");
  // After-hub / match-ready: portraits/molduras primeiro — cartas compostas no 1º paint.
  if ((tier === "after-hub" || tier === "match-ready") && Array.isArray(list)) {
    list = list.slice().sort((a, b) => {
      const rank = (rel) => {
        if (/\/cards\/portraits\//i.test(rel)) return 0;
        if (/MOLDURA PRINCIPAL/i.test(rel)) return 1;
        if (/\/cards\/v2\//i.test(rel)) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });
  }
  const urls = list.map((rel) => buildPrecacheUrl(rel, base, buildId, cardHashes, contentHashes));

  const runtimeCache = await caches.open(CACHE_VERSION);
  const mediaCache = await caches.open(MEDIA_CACHE);

  let done = 0;
  let failed = 0;
  let jsFailed = 0;
  let skipped = 0;
  let fetched = 0;
  const total = urls.length;
  let concurrency = tier === "critical" ? 8
    : (tier === "match-ready" ? 8
      : (tier === "after-hub" ? 8 : (tier === "cosmetic" ? 3 : 6)));
  const forcedConc = Number(opts && opts.concurrency);
  if (Number.isFinite(forcedConc) && forcedConc >= 1 && forcedConc <= 12) {
    concurrency = Math.floor(forcedConc);
  } else {
    // Rede lenta no SW: menos disputa com o warm do Hub / partida.
    try {
      const c = self.navigator && self.navigator.connection;
      const et = c && c.effectiveType;
      const slow = !!(c && (c.saveData || et === "slow-2g" || et === "2g" || et === "3g"));
      if (slow) {
        if (tier === "critical") concurrency = 4;
        else if (tier === "match-ready") concurrency = 3;
        else if (tier === "after-hub") concurrency = 2;
        else if (tier === "cosmetic") concurrency = 1;
        else concurrency = Math.min(concurrency, 3);
      }
    } catch (e) { /* */ }
  }
  let i = 0;

  function postProgress() {
    if (client && client.postMessage) {
      client.postMessage({
        type: "PRECACHE_PROGRESS",
        tier,
        done,
        total,
        failed,
        skipped,
        fetched,
      });
    }
  }

  async function worker() {
    while (i < urls.length) {
      const myI = i++;
      const u = urls[myI];
      let pathname = "/";
      try { pathname = new URL(u).pathname; } catch (e) { /* */ }
      const destCache = isMediaPath(pathname) ? mediaCache : runtimeCache;
      try {
        if (!force) {
          // Skip só com URL canônica exata (?h= / ?v=). ignoreSearch aqui
          // reutilizava bytes antigos sob hash novo — update “não baixava cartas”.
          const existing = await matchAnyAssetCache(u, { exactQuery: true });
          if (existing && existing.hit) {
            // Garante que está no bucket certo com a URL canônica atual (?h=).
            if (existing.name !== (isMediaPath(pathname) ? MEDIA_CACHE : CACHE_VERSION)
                || existing.hit.url !== u) {
              await destCache.put(u, existing.hit.clone());
            } else {
              const exact = await destCache.match(u);
              if (!exact) await destCache.put(u, existing.hit.clone());
            }
            skipped++;
            done++;
            postProgress();
            continue;
          }
        }
        let r = null;
        let lastErr = null;
        const attempts = tier === "critical" ? 3 : 2;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            r = await fetch(u, { cache: "no-store" });
            if (!isCacheableResponse(r, u)) {
              throw new Error("status " + (r && r.status));
            }
            break;
          } catch (err) {
            lastErr = err;
            r = null;
            if (attempt + 1 < attempts) {
              await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            }
          }
        }
        if (!r) throw lastErr || new Error("download failed");
        await destCache.put(u, r.clone());
        fetched++;
      } catch (e) {
        failed++;
        if (/\/js\/.+\.js/i.test(u)) jsFailed++;
        if (typeof console !== "undefined") console.warn("[SW precache] fail:", u, e);
      }
      done++;
      postProgress();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  // Remove mídia órfã não listada nos manifests (bloat).
  if (tier === "critical" || tier === "full" || tier === "cosmetic" || tier === "after-hub" || tier === "match-ready") {
    try {
      let allMedia = [];
      try {
        const fullRes = await fetch(new URL("./asset-manifest.json", self.location.href).toString(), { cache: "no-store" });
        const full = await fullRes.json();
        allMedia = full.filter((rel) => {
          try {
            return isMediaPath(new URL(rel, base).pathname);
          } catch (e) {
            return isMediaPath(rel);
          }
        }).map((rel) => buildPrecacheUrl(rel, base, buildId, cardHashes, contentHashes));
      } catch (e) {
        allMedia = urls.filter((u) => {
          try { return isMediaPath(new URL(u).pathname); } catch (err) { return false; }
        });
      }
      await pruneMediaCache(allMedia);
    } catch (e) { /* */ }
  }

  if (tier === "cosmetic") {
    if (client && client.postMessage) {
      client.postMessage({ type: "PRECACHE_DONE", tier, done, total, skipped, failed, fetched });
    }
    return;
  }

  if (failed > 0) {
    const err = failed + " arquivo(s) essencial(is) falharam (" + tier + ")";
    if (client && client.postMessage) {
      client.postMessage({
        type: "PRECACHE_ERROR",
        tier,
        error: err,
        done,
        total,
        failed,
        skipped,
        fetched,
        jsFailed,
      });
    }
    throw new Error(err);
  }
  if (client && client.postMessage) {
    client.postMessage({ type: "PRECACHE_DONE", tier, done, total, skipped, fetched });
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (
    data.type !== "PRECACHE_ALL"
    && data.type !== "PRECACHE_CRITICAL"
    && data.type !== "PRECACHE_COSMETIC"
    && data.type !== "PRECACHE_AFTER_HUB"
    && data.type !== "PRECACHE_MATCH_READY"
  ) return;
  const client = event.source;
  let tier = "critical";
  if (data.type === "PRECACHE_COSMETIC") tier = "cosmetic";
  else if (data.type === "PRECACHE_AFTER_HUB") tier = "after-hub";
  else if (data.type === "PRECACHE_MATCH_READY") tier = "match-ready";
  else if (data.type === "PRECACHE_ALL") {
    tier = data.tier === "cosmetic" ? "cosmetic"
      : (data.tier === "after-hub" ? "after-hub"
        : (data.tier === "match-ready" ? "match-ready" : "full"));
  } else if (data.tier === "cosmetic") tier = "cosmetic";
  else if (data.tier === "after-hub") tier = "after-hub";
  else if (data.tier === "match-ready") tier = "match-ready";
  else if (data.tier === "full") tier = "full";
  event.waitUntil(
    runPrecacheJob(client, {
      tier,
      force: !!data.force,
      concurrency: data.concurrency,
    }).catch((e) => {
      if (client && client.postMessage) {
        client.postMessage({
          type: "PRECACHE_ERROR",
          tier,
          error: String(e && e.message || e),
          done: 0,
          total: 0,
          failed: 1,
          skipped: 0,
          fetched: 0,
        });
      }
    })
  );
});
