// Nhận nội dung chia sẻ từ app khác (Zalo, Tin nhắn, Chrome, Google Maps…) vào Bộ não.
// Android: app khai báo share_target trong manifest → hệ điều hành mở  ./?share_text=…&share_url=…
// iPhone: Phím tắt "Gửi vào Bộ não" mở  ./?text=…  (Safari chưa hỗ trợ share_target).
import * as store from './store.js';
import { html, esc } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { MAIN_LABELS } from './notes.js';
import { parse as parseQuick } from './quickadd.js';
import { today } from './util.js';

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
  // Đọc ngày giờ trong nội dung (vd "họp 14h ngày 28/11 tại phòng họp 3") để đề xuất lên lịch / nhắc nhở
  const qa = parseQuick((p.textOnly || p.firstLine || '').replace(/\s+/g, ' ').slice(0, 500), { areas: store.all('linh_vuc'), projects: store.all('du_an') });
  const when = (qa.chips.find((c) => c.k === 'when') || {}).v || '';
  const ev = {
    ten: (qa.title || p.firstLine || 'Lịch từ tin nhắn').slice(0, 120),
    ngay: when ? when.slice(0, 10) : today(),
    gio: when && when.length > 10 ? when.slice(11, 16) : '',
    phut: 60, nhac: 30, dia_diem: qa.data.dia_diem || ''
  };
  const at = !ev.dia_diem && ev.ten.match(/^(.*?)\s+(?:tại|ở)\s+(.{3,80})$/i);
  if (at) { ev.ten = at[1]; ev.dia_diem = at[2]; }
  if (qa.data.ket_thuc && ev.gio) {
    const [h1, m1] = ev.gio.split(':').map(Number), [h2, m2] = qa.data.ket_thuc.slice(11, 16).split(':').map(Number);
    ev.phut = Math.max(15, h2 * 60 + m2 - h1 * 60 - m1);
  }
  let target = p.isMaps ? 'place' : when ? (ev.gio ? 'event' : 'task') : 'note:#0_Inbox';

  const box = document.createElement('div');
  box.className = 'share-box';
  const render = () => {
    box.innerHTML = html`
      <div class="share-preview">${p.firstLine && p.firstLine !== p.textOnly ? html`<b>${p.firstLine}</b>` : ''}<p>${(p.textOnly || '').slice(0, 600)}</p>${p.link ? html`<a href="${p.link}" target="_blank" rel="noopener">${p.link.slice(0, 80)}</a>` : ''}</div>
      <h4>Lưu vào</h4>
      <div class="opts">
        ${MAIN_LABELS.map((l) => html`<button class="opt ${target === 'note:' + l.key ? 'on' : ''}" data-target="note:${l.key}">${icon(l.ic)} Ghi chú ${l.key}</button>`)}
        <button class="opt ${target === 'event' ? 'on' : ''}" data-target="event">${icon('calendar')} Lên lịch${when ? ' (có ngày giờ)' : ''}</button>
        <button class="opt ${target === 'task' ? 'on' : ''}" data-target="task">${icon('task')} Việc cần làm (nhắc hạn)</button>
        <button class="opt ${target === 'place' ? 'on' : ''}" data-target="place">${icon('place')} Địa điểm${p.isMaps ? ' (link Maps)' : ''}</button>
      </div>
      ${target === 'event' || target === 'task' ? html`<div class="share-when">
        <div class="field"><label>${target === 'event' ? 'Tên sự kiện' : 'Tên việc'}</label><input data-f="ten" value="${ev.ten}"></div>
        <div class="when"><input type="date" data-f="ngay" value="${ev.ngay}" aria-label="Ngày"><input type="time" data-f="gio" value="${ev.gio}" aria-label="Giờ"></div>
        ${target === 'event' ? html`<div class="when"><label class="mini-f">Dài <input type="number" min="5" step="5" data-f="phut" value="${ev.phut}"> phút</label><label class="mini-f">Nhắc trước <input type="number" min="0" step="5" data-f="nhac" value="${ev.nhac}"> phút</label></div>
        <div class="field"><label>Địa điểm</label><input data-f="dia_diem" value="${ev.dia_diem}"></div>` : html`<p class="hint">Có giờ thì lịch nhắc trước 30 phút; chỉ có ngày thì nhắc 8:00 hôm trước.</p>`}
      </div>` : ''}
      <div class="form-actions"><button class="btn btn-ghost" data-cancel>Bỏ qua</button><span class="spacer"></span><button class="btn btn-primary" data-save>Lưu</button></div>`.__raw;
    box.querySelectorAll('[data-f]').forEach((i) => i.oninput = () => { ev[i.dataset.f] = i.type === 'number' ? +i.value : i.value; });
    box.querySelectorAll('[data-target]').forEach((b) => b.onclick = () => { target = b.dataset.target; render(); });
    box.querySelector('[data-cancel]').onclick = () => { localStorage.removeItem(PENDING); sheet.close(); };
    box.querySelector('[data-save]').onclick = save;
  };
  const sheet = openSheet(box, { title: 'Nhận nội dung chia sẻ' });

  async function save() {
    localStorage.removeItem(PENDING);
    sheet.close();
    try {
      if (target === 'event') {
        const start = ev.gio ? `${ev.ngay}T${ev.gio}` : ev.ngay;
        const data = { ten: ev.ten || 'Lịch từ tin nhắn', bat_dau: start, mo_ta: p.all, loai: 'Khác', nhac_truoc_phut: ev.nhac };
        if (ev.gio) {
          const [h, m] = ev.gio.split(':').map(Number); const end = h * 60 + m + (ev.phut || 60);
          if (end < 1440) data.ket_thuc = `${ev.ngay}T${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
        }
        if (ev.dia_diem) data.dia_diem = ev.dia_diem;
        await store.create('su_kien', data);
        toast(`Đã lên lịch ${ev.ngay.split('-').reverse().slice(0, 2).join('/')}${ev.gio ? ' ' + ev.gio : ''} · nhắc trước ${ev.nhac} phút`, { kind: 'ok' });
      } else if (target === 'task') {
        const data = { ten: (ev.ten || p.firstLine || p.textOnly || p.link).slice(0, 200), mo_ta: p.all };
        if (when || ev.ngay !== today() || ev.gio) data.han = ev.gio ? `${ev.ngay}T${ev.gio}` : ev.ngay;
        await store.create('viec', data);
        toast(data.han ? 'Đã lưu việc, lịch sẽ nhắc trước hạn' : 'Đã lưu thành việc', { kind: 'ok' });
      } else if (target === 'place' && p.isMaps && p.link && navigator.onLine) {
        // Máy chủ mở link rút gọn, lấy tên, toạ độ, địa chỉ chuẩn từ Google Maps
        try {
          const r = await store.action('dia_diem_tu_link', { url: p.link, ghi_chu: p.textOnly, trang_thai: 'Muốn đến' });
          toast(`Đã lưu ${r.item.ten}${r.item.dia_chi ? ' · ' + r.item.dia_chi.split(',').slice(0, 2).join(',') : ''}`, { kind: 'ok' });
          return;
        } catch (e) { /* mất mạng hoặc lỗi: lưu bản đơn giản bên dưới */ }
        await store.create('dia_diem', { ten: (p.firstLine && !URL_RE.test(p.firstLine) ? p.firstLine : 'Địa điểm từ link chia sẻ').slice(0, 200), link_goc: p.link, trang_thai: 'Muốn đến', ghi_chu: p.textOnly });
        toast('Đã lưu địa điểm (sẽ bổ sung địa chỉ khi có mạng)', { kind: 'ok' });
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
