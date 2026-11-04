/* sw.js — Service Worker សម្រាប់ទំព័របុគ្គលិក (PWA)
 * - ឃ្លាំងសម្បត្តិ (cache) តែឯកសារឋិតិវន្ត ដូច្នេះបើកលឿន និងបើកបានពេលអ៊ីនធឺណិតខ្សោយ
 * - មិន cache ការហៅ Supabase/API ទេ (ទិន្នន័យវត្តមាន/ប្រាក់ខែត្រូវតែថ្មីជានិច្ច)
 * - ទទួលដំណឹង Web Push ពេលបិទកម្មវិធី
 * ពេលកែ employee.html/css/js ត្រូវប្តូរលេខ CACHE_VERSION ដើម្បីឱ្យទូរស័ព្ទយកថ្មី
 */
const CACHE_VERSION = 'emp-pwa-v2';
const PRECACHE = [
  './employee.html',
  './style.css',
  './employee-modern.css',
  './employee-modern.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.all(PRECACHE.map(url => cache.add(url).catch(() => { /* ឯកសារខ្លះមិនមាន → រំលង */ })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, CDN, fonts → ទុកឱ្យ browser ដោះស្រាយ

  // ទំព័រ HTML៖ យកពី network មុន (ទទួលកំណែថ្មី) បើគ្មានអ៊ីនធឺណិតទើបយកពី cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put('./employee.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./employee.html'))
    );
    return;
  }

  // ឯកសារឋិតិវន្ត៖ ប្រើ cache ភ្លាម ហើយអាប់ដេតក្រោយ (stale-while-revalidate)
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ---- Web Push ----
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'ដំណឹងថ្មី', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'ដំណឹងថ្មី';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'announcement',
    renotify: true,
    data: { url: data.url || './employee.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './employee.html', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});
