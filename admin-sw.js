/* ===================================================================
   admin-sw.js — Service Worker | معاذ كيدز
   الإصدار: 4.0
   - الشبكة أولاً (دائماً أحدث نسخة من الموقع واللوحة)
   - الكاش فقط كاحتياط عند انقطاع الإنترنت
   =================================================================== */

const CACHE_NAME = 'mk-cache-v4';
const OFFLINE_PAGE = 'admin.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_PAGE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Supabase والخطوط وغيرها: مباشرة
  if (url.pathname.endsWith('/admin-sw.js')) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => {
          if (hit) return hit;
          if (req.destination === 'document') return caches.match(OFFLINE_PAGE);
          return Response.error();
        })
      )
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
