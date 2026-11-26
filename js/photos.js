// Ảnh đính kèm ghi chú: nén ngay trên máy (cạnh dài 1600px, ~200 KB) + ảnh thu nhỏ (~20 KB),
// gửi ngầm lên kho ảnh Cloudflare R2 qua máy chủ. Mất mạng thì ảnh nằm trong hàng chờ (IndexedDB) và gửi lại sau.
// Ghi chú chỉ lưu mã ảnh (trường anh); ảnh không đi qua đồng bộ dữ liệu nên app vẫn nhanh.
import * as store from './store.js';
import { CONFIG } from './config.js';
import { Auth, isDemo } from './api.js';
import { html } from './util.js';
import { toast } from './ui.js';

const BASE = (CONFIG.API_URL || '').replace(/\/api\/?$/, '');
const FULL = { max: 1600, q: 0.8 }, THUMB = { max: 360, q: 0.7 };
const demoUrls = new Map();

export const fullUrl = (id) => (demoUrls.get(id)?.full) || `${BASE}/anh/${id}`;
export const thumbUrl = (id) => (demoUrls.get(id)?.thumb) || `${BASE}/anh/${id}-t`;

// ---------------- Nén ảnh ----------------
async function toBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* thử cách khác */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function encode(canvas, q) {
  return new Promise((res) => canvas.toBlob((b) => {
    if (b && b.type === 'image/webp') return res(b);
    canvas.toBlob((j) => res(j), 'image/jpeg', q); // Safari cũ không nén được WebP
  }, 'image/webp', q));
}
async function shrink(bmp, { max, q }) {
  const w = bmp.width, h = bmp.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return encode(c, q);
}
export async function compress(file) {
  const bmp = await toBitmap(file);
  const [full, thumb] = [await shrink(bmp, FULL), await shrink(bmp, THUMB)];
  bmp.close?.();
  return { full, thumb };
}

// ---------------- Hàng chờ (IndexedDB) ----------------
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(isDemo() ? 'bnth-anh-demo' : 'bnth-anh', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'lid' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function qAll() { const d = await db(); return new Promise((res) => { const r = d.transaction('q').objectStore('q').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); }
async function qPut(item) { const d = await db(); return new Promise((res) => { const t = d.transaction('q', 'readwrite'); t.objectStore('q').put(item); t.oncomplete = res; t.onerror = res; }); }
async function qDel(lid) { const d = await db(); return new Promise((res) => { const t = d.transaction('q', 'readwrite'); t.objectStore('q').delete(lid); t.oncomplete = res; t.onerror = res; }); }

const pendingUrls = new Map(); // lid → object URL ảnh thu nhỏ (hiện ngay khi chưa gửi xong)
let cache = [];
export const pendingFor = (noteId) => cache.filter((x) => x.noteId === noteId).map((x) => {
  if (!pendingUrls.has(x.lid)) pendingUrls.set(x.lid, URL.createObjectURL(x.thumb));
  return { lid: x.lid, url: pendingUrls.get(x.lid) };
});
const listeners = new Set();
export const onPhotos = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

/** Thêm ảnh cho một ghi chú đã có id. */
export async function addPhotos(noteId, files) {
  let n = 0;
  for (const f of files) {
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name || '')) continue;
    try {
      const { full, thumb } = await compress(f);
      const item = { lid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, noteId, full, thumb, at: Date.now() };
      await qPut(item); cache.push(item); n++;
    } catch (e) { toast('Không đọc được ảnh ' + (f.name || '') + '. Thử chụp lại hoặc chọn ảnh JPG/PNG.', { kind: 'error' }); }
  }
  emit();
  if (n) process();
  return n;
}

async function upload(blob, id) {
  const auth = Auth.session ? 's:' + Auth.session : 't:' + Auth.token;
  const r = await fetch(`${BASE}/anh`, { method: 'POST', headers: { 'content-type': blob.type, 'x-bnth-auth': auth, ...(id ? { 'x-bnth-id': id } : {}) }, body: blob });
  const j = await r.json().catch(() => ({ ok: false, error: { message: 'Máy chủ ảnh trả lời lạ (' + r.status + ')' } }));
  if (!j.ok) { const e = new Error(j.error?.message || 'Gửi ảnh lỗi'); e.code = j.error?.code; throw e; }
  return j.data.id;
}

/** Gửi ngay một ảnh (bìa sách…): trả mã ảnh. Cần mạng. */
export async function uploadNow(file) {
  const { full, thumb } = await compress(file);
  if (isDemo()) {
    const id = 'demo/' + Date.now().toString(36);
    demoUrls.set(id, { full: URL.createObjectURL(full), thumb: URL.createObjectURL(thumb) });
    return id;
  }
  if (!navigator.onLine) throw new Error('Cần có mạng để tải ảnh bìa.');
  const id = await upload(full);
  await upload(thumb, id);
  return id;
}

let running = null;
export function process() {
  if (running) return running;
  running = (async () => {
    cache = await qAll();
    for (const item of [...cache].sort((a, b) => a.at - b.at)) {
      const realId = store.tmpMap.get(item.noteId) || item.noteId;
      const note = store.get('ghi_chu', realId);
      if (!note || String(realId).startsWith('tmp-')) continue;
      let id;
      try {
        if (isDemo()) {
          id = 'demo/' + item.lid;
          demoUrls.set(id, { full: URL.createObjectURL(item.full), thumb: URL.createObjectURL(item.thumb) });
        } else {
          if (!navigator.onLine || !Auth.valid()) break;
          id = await upload(item.full);
          await upload(item.thumb, id);
        }
      } catch (e) {
        if (e.code === 'CHUA_BAT_KHO') { toast('Kho ảnh chưa bật trên máy chủ. Ảnh vẫn được giữ trên máy, sẽ gửi khi kho sẵn sàng.', { kind: 'error', ms: 6000 }); break; }
        if (e.code === 'QUA_LON' || e.code === 'SAI_DINH_DANG') { await qDel(item.lid); toast(e.message, { kind: 'error' }); continue; }
        break; // mất mạng / lỗi tạm: để lần sau
      }
      const cur = store.get('ghi_chu', realId);
      await store.update('ghi_chu', realId, { anh: [...(cur?.anh || []), id] }).catch(() => {});
      await qDel(item.lid);
      cache = cache.filter((x) => x.lid !== item.lid);
      if (pendingUrls.has(item.lid)) { URL.revokeObjectURL(pendingUrls.get(item.lid)); pendingUrls.delete(item.lid); }
      emit();
    }
  })().finally(() => { running = null; });
  return running;
}

export function startPhotoQueue() {
  qAll().then((all) => { cache = all; if (all.length) process(); }).catch(() => {});
  window.addEventListener('online', () => process());
  setInterval(() => { if (cache.length && document.visibilityState === 'visible') process(); }, 60000);
}

// ---------------- Hiển thị ----------------
export function stripHtml(n, { editable = false } = {}) {
  const ids = n?.anh || [];
  const pend = n?.id ? pendingFor(n.id) : [];
  if (!ids.length && !pend.length) return '';
  return html`<div class="photo-strip ${editable ? 'edit' : ''}">${ids.map((id) => html`<button class="ph" data-photo="${id}" data-note-of="${n.id}"><img src="${thumbUrl(id)}" alt="Ảnh" loading="lazy" decoding="async"></button>`)}${pend.map((p) => html`<span class="ph pending" title="Đang chờ gửi"><img src="${p.url}" alt="Ảnh chờ gửi"><i>⏳</i></span>`)}</div>`;
}

export function openPhoto(id, noteId) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = html`<img src="${fullUrl(id)}" alt="Ảnh đính kèm">
    <div class="lb-bar"><a class="btn" href="${fullUrl(id)}" target="_blank" rel="noopener">Mở ảnh gốc</a>${noteId ? html`<button class="btn" data-unlink>Gỡ khỏi ghi chú</button>` : ''}<button class="btn btn-primary" data-lb-close>Đóng</button></div>`.__raw;
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-lb-close]')) close(); });
  box.querySelector('[data-unlink]')?.addEventListener('click', async () => {
    if (!confirm('Gỡ ảnh này khỏi ghi chú? (Ảnh vẫn còn trong kho, không mất hẳn.)')) return;
    const n = store.get('ghi_chu', noteId);
    close();
    await store.update('ghi_chu', noteId, { anh: (n?.anh || []).filter((x) => x !== id) }).catch(() => {});
    emit();
    toast('Đã gỡ ảnh');
  });
  document.body.appendChild(box);
}
