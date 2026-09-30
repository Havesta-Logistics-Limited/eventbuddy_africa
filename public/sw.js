/* eventbuddy service worker — offline shell for event-day staff screens.
 *
 * Deliberately small and conservative. It does two things:
 *   1. Serves the last-seen version of a page when the network is gone, so a
 *      staff phone that locks or reloads at a venue still opens /collect and
 *      /checkin instead of the browser's dinosaur.
 *   2. Flushes the offline lead queue from a background sync, so leads can
 *      leave the device with no tab open (Chrome/Android; iOS has no
 *      Background Sync and relies on the in-page sync instead).
 *
 * It never caches API responses — stale event data at a door is worse than no
 * data — and never caches a non-GET request.
 */

const VERSION = "v1";
const SHELL = `eventbuddy-shell-${VERSION}`;
const ASSETS = `eventbuddy-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API reads must never be served stale — a cached roster or lead list at a
  // door would be actively misleading.
  if (url.pathname.startsWith("/api/")) return;

  // Build assets are content-hashed, so cache-first is always safe.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Pages: network first (so staff always get the current build when online),
  // falling back to the last copy we saw of that exact page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/collect").then((c) => c || Response.error()))
        )
    );
  }
});

/* ---- background flush of the offline lead queue ------------------------- */

const DB_NAME = "eventbuddy-offline";
const STORE = "pending_leads";

function openDb() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function readQueue(db) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function removeFromQueue(db, id) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function flushLeads() {
  const db = await openDb();
  if (!db) return;
  const queue = await readQueue(db);
  for (const lead of queue) {
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead.data),
      });
      // 400 is permanent — drop it rather than retry forever. Anything else
      // transient is left in place for the next sync.
      if (res.ok || res.status === 400) await removeFromQueue(db, lead.id);
      else break;
    } catch {
      break; // still offline; the sync will be retried by the browser
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "eventbuddy-flush-leads") event.waitUntil(flushLeads());
});

self.addEventListener("message", (event) => {
  if (event.data === "flush-leads") event.waitUntil(flushLeads());
});
