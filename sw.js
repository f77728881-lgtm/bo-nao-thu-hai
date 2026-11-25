// Service worker: lưu sẵn khung app để mở được khi mất mạng. Dữ liệu nằm ở IndexedDB, không ở đây.
// Đổi VERSION mỗi lần cập nhật giao diện để máy tải bản mới.
const VERSION = 'bnth-v1.1.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/notes.js', './js/settings.js', './js/icons.js', './js/share.js', './js/prompts.js', './js/training.js', './js/review.js', './js/travel.js', './js/lunar.js', './js/api.js', './js/config.js', './js/form.js', './js/quickadd.js', './js/store.js', './js/ui.js', './js/util.js', './js/views.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Font chữ: lấy từ bộ nhớ trước (dùng được khi mất mạng)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION + '-fonts').then((c) => c.put(e.request, copy)); return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return; // API Google, đăng nhập: luôn đi mạng
  // Mạng trước (để luôn có bản mới), mất mạng thì dùng bản đã lưu.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

// ---------------- Thông báo đẩy ----------------
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'Bộ não thứ hai', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Bộ não thứ hai', {
    body: m.body || '', tag: m.tag || undefined, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { url: m.url || '#/hom-nay' }, renotify: false
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./' + (e.notification.data && e.notification.data.url || '#/hom-nay'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { c.focus(); return c.navigate(target); } }
    return self.clients.openWindow(target);
  }));
});
