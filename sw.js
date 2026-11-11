/* sw.js — Service Worker សម្រាប់ទំព័របុគ្គលិក (PWA)
 * - ឃ្លាំងសម្បត្តិ (cache) តែឯកសារឋិតិវន្ត ដូច្នេះបើកលឿន និងបើកបានពេលអ៊ីនធឺណិតខ្សោយ
 * - មិន cache ការហៅ Supabase/API ទេ (ទិន្នន័យវត្តមាន/ប្រាក់ខែត្រូវតែថ្មីជានិច្ច)
 * - ទទួលដំណឹង Web Push ពេលបិទកម្មវិធី
 * ពេលកែ employee.html/css/js ត្រូវប្តូរលេខ CACHE_VERSION ដើម្បីឱ្យទូរស័ព្ទយកថ្មី
 */
const CACHE_VERSION = 'emp-pwa-v3';
const PRECACHE = [
  './employee.html',
  './style.css',
  './employee-modern.css',
  './employee-modern.js',
  './manifest.webmanifest',
  './icon/icon-192.png',
  './icon/icon-512.png',
  './icon/apple-touch-icon.png'
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
  if (url.pathname.endsWith('employee-version.json')) return;  // ឯកសារកំណែ៖ ត្រូវតែថ្មីជានិច្ច (មិន cache)

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

  // JS/CSS៖ យកពី network មុន (ទទួលកំណែថ្មីភ្លាមៗ គ្មានចាំបាច់បើក ២ ដង) បើយឺតលើស 4 វិនាទី ឬគ្មានអ៊ីនធឺណិត → យកពី cache
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      new Promise(resolve => {
        let settled = false;
        const fromCache = () => caches.match(req).then(c => { if (!settled && c) { settled = true; resolve(c); } });
        const timer = setTimeout(fromCache, 4000);
        fetch(req).then(res => {
          clearTimeout(timer);
          if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {}); }
          if (!settled) { settled = true; resolve(res); }
        }).catch(() => { clearTimeout(timer); caches.match(req).then(c => { if (!settled) { settled = true; resolve(c || Response.error()); } }); });
      })
    );
    return;
  }

  // រូបភាព/ឯកសារផ្សេង៖ ប្រើ cache ភ្លាម ហើយអាប់ដេតក្រោយ (stale-while-revalidate)
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
    icon: './icon/icon-192.png',
    badge: './icon/icon-192.png',
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
