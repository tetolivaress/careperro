/* Lokal service worker: app shell + static assets cache so the image tools work offline. */
const VERSION = "v1";
const SHELL = `lokal-shell-${VERSION}`;
const RUNTIME = `lokal-runtime-${VERSION}`;
const CDN = `lokal-cdn-${VERSION}`;
const PRECACHE = ["/", "/es/", "/en/", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME, CDN].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCdn(url) {
  return url.hostname === "unpkg.com" || url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never touch analytics or non-http(s) schemes.
  if (url.pathname.startsWith("/_vercel/")) return;
  if (!url.protocol.startsWith("http")) return;

  // Large CDN assets (ffmpeg, tesseract, fonts): cache-first, they are immutable by version.
  if (isCdn(url)) {
    event.respondWith(
      caches.open(CDN).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages and everything else: network-first with cache fallback (stale copy beats an error page offline).
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const res = await fetch(req);
        if (res.ok && (req.mode === "navigate" || req.destination === "image" || req.destination === "script" || req.destination === "style")) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const hit = (await cache.match(req)) || (req.mode === "navigate" ? await caches.match("/es/") : undefined);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
