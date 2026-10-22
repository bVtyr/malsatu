/* MalSatu service worker: app-shell кэш, stale-while-revalidate для API-справочников, офлайн-страница, Background Sync черновиков, push. */
const VERSION = "malsatu-v2";
const SHELL = ["/", "/ru", "/kk", "/manifest.json", "/icons/icon-192.svg", "/offline.html"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
async function trim(cache, max) { const keys = await cache.keys(); if (keys.length > max) for (const k of keys.slice(0, keys.length - max)) await cache.delete(k); }
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const isRef = /\/api\/v1\/(regions|categories|breeds|document-types)$/.test(url.pathname);
  const isImg = e.request.destination === "image";
  if (isRef || isImg) {
    e.respondWith(caches.open(VERSION).then(async (c) => { const cached = await c.match(e.request); const net = fetch(e.request).then((r) => { if (r.ok) { c.put(e.request, r.clone()); trim(c, 150); } return r; }).catch(() => cached); return cached || net; }));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(async () => (await caches.match(e.request)) || (await caches.match("/offline.html"))));
  }
});
self.addEventListener("sync", (e) => { if (e.tag === "sync-drafts") e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "SYNC_DRAFTS" })))); });
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "MalSatu", body: "" };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icons/icon-192.svg", data: d.data }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = d.conversationId ? `/chat/${d.conversationId}` : d.listingId ? `/listing/${d.listingId}` : d.dealId ? `/deals/${d.dealId}` : "/"; // локаль подставит middleware
  e.waitUntil(self.clients.openWindow(url));
});
