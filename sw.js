// Service worker: lưu sẵn khung app để mở được khi mất mạng. Dữ liệu nằm ở IndexedDB, không ở đây.
// Đổi VERSION mỗi lần cập nhật giao diện để máy tải bản mới.
const VERSION = 'bnth-v0.4.1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/notes.js', './js/travel.js', './js/lunar.js', './js/api.js', './js/config.js', './js/form.js', './js/quickadd.js', './js/store.js', './js/ui.js', './js/util.js', './js/views.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API Google, đăng nhập: luôn đi mạng
  // Mạng trước (để luôn có bản mới), mất mạng thì dùng bản đã lưu.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
