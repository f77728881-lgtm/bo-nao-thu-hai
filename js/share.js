// Nhận nội dung chia sẻ từ app khác (Zalo, Tin nhắn, Chrome, Google Maps…) vào Bộ não.
// Android: app khai báo share_target trong manifest → hệ điều hành mở  ./?share_text=…&share_url=…
// iPhone: Phím tắt "Gửi vào Bộ não" mở  ./?text=…  (Safari chưa hỗ trợ share_target).
import * as store from './store.js';
import { html, esc } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { MAIN_LABELS } from './notes.js';

const PENDING = 'bnth.pendingShare';
const MAPS_RE = /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i;
const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Đọc tham số chia sẻ trên địa chỉ, cất lại rồi xóa khỏi thanh địa chỉ. */
export function captureShare() {
  const q = new URLSearchParams(location.search);
  const title = q.get('share_title') || q.get('title') || '';
  const text = q.get('share_text') || q.get('text') || '';
  const url = q.get('share_url') || q.get('url') || '';
  if (!title && !text && !url) return;
  localStorage.setItem(PENDING, JSON.stringify({ title, text, url, at: Date.now() }));
  const keep = new URLSearchParams();
  if (q.has('demo')) keep.set('demo', '');
  history.replaceState(null, '', location.pathname + (keep.toString() ? '?' + keep.toString().replace('=', '') : '') + '#/ghi-chu');
}

function parseShare(s) {
  const all = [s.title, s.text, s.url].filter(Boolean).join('\n');
  const link = s.url || (all.match(URL_RE) || [])[0] || '';
  const textOnly = (s.text || '').replace(link, '').trim();
  const isMaps = MAPS_RE.test(link) || MAPS_RE.test(all);
  let lat = null, lng = null;
  const m = all.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || all.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (m) { lat = +m[1]; lng = +m[2]; }
  const firstLine = (s.title || textOnly.split('\n')[0] || '').trim();
  return { all, link, textOnly, isMaps, lat, lng, firstLine };
}

/** Mở bảng chọn nơi lưu nếu có nội dung chia sẻ đang chờ. */
export function handlePendingShare() {
  let s;
  try { s = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch { s = null; }
  if (!s) return;
  if (Date.now() - s.at > 24 * 3600e3) { localStorage.removeItem(PENDING); return; }
  const p = parseShare(s);
  let target = p.isMaps ? 'place' : 'note:#0_Inbox';

  const box = document.createElement('div');
  box.className = 'share-box';
  const render = () => {
    box.innerHTML = html`
      <div class="share-preview">${p.firstLine ? html`<b>${p.firstLine}</b>` : ''}<p>${(p.textOnly || '').slice(0, 600)}</p>${p.link ? html`<a href="${p.link}" target="_blank" rel="noopener">${p.link.slice(0, 80)}</a>` : ''}</div>
      <h4>Lưu vào</h4>
      <div class="opts">
        ${MAIN_LABELS.map((l) => html`<button class="opt ${target === 'note:' + l.key ? 'on' : ''}" data-target="note:${l.key}">${icon(l.ic)} Ghi chú ${l.key}</button>`)}
        <button class="opt ${target === 'task' ? 'on' : ''}" data-target="task">${icon('task')} Việc cần làm</button>
        <button class="opt ${target === 'place' ? 'on' : ''}" data-target="place">${icon('place')} Địa điểm${p.isMaps ? ' (link Maps)' : ''}</button>
      </div>
      <div class="form-actions"><button class="btn btn-ghost" data-cancel>Bỏ qua</button><span class="spacer"></span><button class="btn btn-primary" data-save>Lưu</button></div>`.__raw;
    box.querySelectorAll('[data-target]').forEach((b) => b.onclick = () => { target = b.dataset.target; render(); });
    box.querySelector('[data-cancel]').onclick = () => { localStorage.removeItem(PENDING); sheet.close(); };
    box.querySelector('[data-save]').onclick = save;
  };
  const sheet = openSheet(box, { title: 'Nhận nội dung chia sẻ' });

  async function save() {
    localStorage.removeItem(PENDING);
    sheet.close();
    try {
      if (target === 'task') {
        await store.create('viec', { ten: (p.firstLine || p.textOnly || p.link).slice(0, 200), mo_ta: p.all, nguon: 'Tự nhập' });
        toast('Đã lưu thành việc', { kind: 'ok' });
      } else if (target === 'place') {
        const data = { ten: (p.firstLine && !URL_RE.test(p.firstLine) ? p.firstLine : 'Địa điểm từ link chia sẻ').slice(0, 200), link_goc: p.link, trang_thai: 'Muốn đến', ghi_chu: p.textOnly };
        if (p.lat !== null) { data.lat = p.lat; data.lng = p.lng; }
        await store.create('dia_diem', data);
        toast('Đã lưu địa điểm (Muốn đến)', { kind: 'ok' });
      } else {
        const label = target.split(':')[1];
        const data = { tieu_de: p.firstLine.slice(0, 200), noi_dung: p.textOnly || (p.firstLine ? '' : p.all), nhan: [label], loai: p.link && !p.textOnly ? 'Liên kết' : 'Ghi chú' };
        if (p.link) data.url = p.link;
        if (data.tieu_de === data.noi_dung) data.tieu_de = '';
        await store.create('ghi_chu', data);
        toast(`Đã lưu vào ${label}`, { kind: 'ok' });
      }
    } catch (err) { errorToast(err); }
  }
  render();
}

export { esc };
