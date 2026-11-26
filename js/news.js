// Tin chính không quảng cáo: máy chủ lấy RSS (Báo Chính phủ, VnExpress, Tuổi Trẻ, BBC Tiếng Việt), lọc PR/giật gân, gộp tin trùng.
// App đọc danh sách đã chọn (lệnh tin_moi), lưu tạm trên máy 15 phút. Chạm tiêu đề = mở bài; nút 🔖 = lưu vào Ghi chú (Inbox).
import * as store from './store.js';
import { call } from './api.js';
import { html, raw } from './util.js';
import { toast, errorToast } from './ui.js';

const KEY = 'bnth.news';
let cache = null;
try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { cache = null; }
let loading = false;
const subs = new Set();
export const onNews = (fn) => subs.add(fn);

/** Lấy tin nếu bản trên máy đã cũ (>15 phút). Bản trên máy chủ cũ quá 50 phút thì nhờ máy chủ lấy lại. */
export function ensureNews() {
  if (loading || !navigator.onLine) return;
  if (cache && Date.now() - (cache.at || 0) < 15 * 60e3) return;
  loading = true;
  const stale = cache && cache.luc && Date.now() - new Date(cache.luc).getTime() > 50 * 60e3;
  call(stale || !cache ? 'tin_cap_nhat' : 'tin_moi').catch(() => call('tin_moi')).then((d) => {
    if (!d || !Array.isArray(d.items)) return;
    cache = { luc: d.luc, items: d.items, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(cache));
    subs.forEach((fn) => fn());
  }).catch(() => {}).finally(() => { loading = false; });
}

function ago(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} phút trước` : m < 24 * 60 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
}

function row(it, i) {
  return html`<li class="nw-row">
    <a class="nw-main" href="${it.link}" target="_blank" rel="noopener noreferrer"><b>${it.tieu_de}</b>
      <small>${it.nguon}${it.cung?.length ? ` · cùng ${it.cung.join(', ')}` : ''} · ${ago(it.luc)}</small></a>
    <button class="nw-save" data-news-save="${i}" aria-label="Lưu vào ghi chú" title="Lưu vào ghi chú">🔖</button></li>`;
}

export function newsCard() {
  ensureNews();
  const items = cache?.items || [];
  if (!items.length) return raw('');
  return html`<section class="card news">
    <div class="nw-head"><h3 class="card-title">📰 Tin chính</h3><small class="row-meta">không quảng cáo${cache.luc ? ` · ${new Date(cache.luc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}</small></div>
    <ul class="nw-list">${items.slice(0, 5).map(row)}</ul>
    ${items.length > 5 ? html`<details class="nw-more"><summary>Xem thêm ${items.length - 5} tin</summary><ul class="nw-list">${items.slice(5).map((it, i) => row(it, i + 5))}</ul></details>` : ''}
    <p class="hint nw-tip">Mở bài trên trình duyệt: bật “Chế độ đọc” để ẩn quảng cáo của trang báo.</p>
  </section>`;
}

export async function saveNews(i) {
  const it = cache?.items?.[+i];
  if (!it) return;
  try {
    await store.create('ghi_chu', { tieu_de: it.tieu_de, url: it.link, noi_dung: [it.tom_tat, 'Nguồn: ' + it.nguon].filter(Boolean).join('\n\n'), loai: 'Liên kết', nhan: ['#0_Inbox'] });
    toast('Đã lưu tin vào Ghi chú (Inbox)', { kind: 'ok' });
  } catch (e) { errorToast(e); }
}
