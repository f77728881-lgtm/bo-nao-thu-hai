// Tùy chỉnh giao diện: sáng/tối, cỡ chữ, màu nhấn. Lưu trên máy (localStorage).
import * as gcal from './extcal.js';
import { html } from './util.js';
import * as store from './store.js';
import { Auth, isDemo } from './api.js';
import { icon } from './icons.js';

const KEY = 'bnth.prefs';
export const ACCENTS = [
  ['teal', 'Xanh ngọc', '#0d9488'], ['blue', 'Xanh dương', '#2563eb'], ['violet', 'Tím', '#7c3aed'],
  ['orange', 'Cam đất', '#ea580c'], ['rose', 'Hồng', '#e11d48'], ['navy', 'Xanh than', '#1d3557']
];
const DEFAULTS = { theme: 'auto', size: 'm', accent: 'teal' };

export function prefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Gắn thuộc tính lên <html> để CSS đổi theo. */
export function applyPrefs(p = prefs()) {
  const root = document.documentElement;
  const dark = p.theme === 'dark' || (p.theme === 'auto' && media.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.size = p.size;
  root.dataset.accent = p.accent;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#0f141b' : '#f5f6f8');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.removeAttribute('media'); m.content = bg; });
}
media.addEventListener?.('change', () => applyPrefs());

export function setPref(k, v) {
  const p = { ...prefs(), [k]: v };
  localStorage.setItem(KEY, JSON.stringify(p));
  applyPrefs(p);
}

const backup = { loaded: false, data: null, msg: '' };
const doff = { loaded: false, data: null, msg: '', busy: false };
function dofficeCard() {
  const d = doff.data;
  const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
  let line = 'Chưa nhập tài khoản. App sẽ tự lấy văn bản Chủ trì/Phối hợp và lịch tuần công ty lúc 7:30 và 13:30 mỗi ngày.';
  if (d && d.da_cai) {
    line = d.ok === false
      ? `⚠️ Lần chạy ${when(d.luc)} lỗi: ${d.loi}`
      : d.luc ? `✅ Lần chạy ${when(d.luc)}: ${d.so_dong ?? 0} văn bản đang giao${d.moi?.length ? `, ${d.moi.length} mới` : ''}${d.lich ? ` · lịch tuần ${d.lich.so_lich} mục` : ''}.` : 'Đã lưu tài khoản, chưa chạy lần nào.';
  }
  return html`<section class="card settings">
    <h3 class="card-title">${icon('doc')} D-Office</h3>
    <p class="row-meta">${line}</p>
    ${d && d.loi_lich ? html`<p class="hint">Lịch tuần: ${d.loi_lich}</p>` : ''}
    <form class="doffice-form" data-doffice-form autocomplete="off">
      <label>Tên đăng nhập<input name="username" value="${d?.tai_khoan || ''}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label>Mật khẩu ${d?.da_cai ? html`<i class="hint">(để trống = giữ mật khẩu cũ)</i>` : ''}<input name="password" type="password" autocomplete="new-password"></label>
      <div class="opts"><button class="btn" type="submit" ${doff.busy ? 'disabled' : ''}>${doff.busy ? 'Đang kiểm tra…' : d?.da_cai ? 'Cập nhật & kiểm tra' : 'Lưu & kiểm tra'}</button>
        ${d?.da_cai ? html`<button class="btn btn-ghost" type="button" data-doffice-run ${doff.busy ? 'disabled' : ''}>Lấy ngay</button><button class="btn btn-ghost" type="button" data-doffice-del>Xóa tài khoản</button>` : ''}</div>
    </form>
    ${doff.msg ? html`<p class="hint">${doff.msg}</p>` : ''}
    <p class="hint">Mật khẩu chỉ lưu trên máy chủ Google của anh, app không hiện lại. Đổi mật khẩu D-Office (90 ngày) thì nhập mật khẩu mới ở đây. Chỉ đọc, không xử lý gì trên D-Office.</p>
  </section>`;
}
const fmt = (iso) => new Date(iso).toLocaleString('vi-VN');
function backupLine() {
  const r = backup.data;
  if (!r) return 'Tự sao lưu mỗi Chủ nhật 22:00, giữ 6 bản gần nhất trong Google Drive của bạn.';
  return r.moi_nhat ? `Bản gần nhất: ${fmt(r.moi_nhat.luc)} · ${r.so_ban}/${r.toi_da} bản. Tự sao lưu mỗi Chủ nhật 22:00.`
    : 'Chưa có bản sao lưu nào. Tự sao lưu mỗi Chủ nhật 22:00.';
}

export function settingsView() {
  const p = prefs();
  const s = store.getState();
  const opt = (k, v, label, extra = '') => html`<button class="opt ${p[k] === v ? 'on' : ''}" data-pref="${k}:${v}">${extra}${label}</button>`;
  return html`
    <header class="page-head"><h1>Cài đặt</h1></header>
    <div class="grid">
      <section class="card settings">
        <h3 class="card-title">${icon('sun')} Giao diện</h3>
        <div class="opts">${opt('theme', 'light', 'Sáng')}${opt('theme', 'dark', 'Tối')}${opt('theme', 'auto', 'Theo máy')}</div>
        <h3 class="card-title">${icon('type')} Cỡ chữ</h3>
        <div class="opts">${opt('size', 'm', 'Vừa')}${opt('size', 'l', 'Lớn')}${opt('size', 'xl', 'Rất lớn')}</div>
        <p class="preview-text">Xem trước: Họp giao ban lúc 8:00 tại phòng họp tầng 3.</p>
        <h3 class="card-title">${icon('palette')} Màu nhấn</h3>
        <div class="opts swatches">${ACCENTS.map(([k, label, c]) => html`<button class="opt accent ${p.accent === k ? 'on' : ''}" data-pref="accent:${k}" title="${label}"><i style="background:${c}"></i>${label}</button>`)}</div>
      </section>
      <section class="card settings">
        <h3 class="card-title">${icon('refresh')} Đồng bộ</h3>
        <p class="row-meta">${isDemo() ? 'Bản demo (dữ liệu mẫu).' : Auth.email ? `Đăng nhập: ${Auth.email}` : 'Chưa đăng nhập.'}</p>
        <p class="row-meta">Lần đồng bộ cuối: ${s.lastSync ? new Date(s.lastSync).toLocaleString('vi-VN') : 'chưa có'}${s.outbox.length ? ` · ${s.outbox.length} thay đổi chờ gửi` : ''}</p>
        <div class="opts"><button class="btn btn-ghost" data-sync-now>Đồng bộ ngay</button>${!isDemo() && Auth.email ? html`<button class="btn btn-ghost" data-logout>Đăng xuất</button>` : ''}</div>
        <p class="hint">Cài đặt giao diện lưu riêng trên từng máy.</p>
      </section>
      ${isDemo() ? '' : dofficeCard()}
      <section class="card settings">
        <h3 class="card-title">${icon('calendar')} Lịch Google hiển thị</h3>
        <p class="row-meta">Sự kiện từ các lịch này hiện chung trên màn Lịch và Hôm nay (chỉ xem; chạm để mở trong Google Calendar).</p>
        ${gcal.listCalendars().length ? html`<ul class="cal-list">${gcal.listCalendars().map((c) => html`<li><label><input type="checkbox" data-gcal="${c.id}" ${gcal.isShown(c) ? 'checked' : ''}><span class="sw" style="background:${c.mau}"></span>${c.ten}${c.chinh ? ' (chính)' : ''}</label></li>`)}</ul>`
          : html`<p class="hint">Mở màn Lịch một lần để tải danh sách lịch.</p>`}
      </section>
      <section class="card settings">
        <h3 class="card-title">${icon('folder')} Sao lưu dữ liệu</h3>
        <p class="row-meta">${backupLine()}</p>
        <div class="opts"><button class="btn btn-ghost" data-backup-now>Sao lưu ngay</button></div>
        ${backup.msg ? html`<p class="hint">${backup.msg}</p>` : ''}
        ${backup.data && backup.data.ban_sao.length ? html`<ul class="backup-list">${backup.data.ban_sao.map((b) => html`<li><a href="${b.url}" target="_blank" rel="noopener">${b.ten} · ${fmt(b.luc)}</a></li>`)}</ul>` : ''}
      </section>
    </div>`;
}

export function bindSettings(root, rerender) {
  root.querySelectorAll('[data-pref]').forEach((b) => b.addEventListener('click', () => {
    const [k, v] = b.dataset.pref.split(':'); setPref(k, v); rerender();
  }));
  root.querySelector('[data-sync-now]')?.addEventListener('click', () => store.sync());
  root.querySelectorAll('[data-gcal]').forEach((cb) => cb.addEventListener('change', () => gcal.setShown(cb.dataset.gcal, cb.checked)));
  if (!isDemo() && !doff.loaded) {
    doff.loaded = true;
    store.action('doffice_trang_thai', {}).then((r) => { doff.data = r; rerender(); }).catch(() => {});
  }
  const dofRun = async (action, payload, okMsg) => {
    doff.busy = true; doff.msg = ''; rerender();
    try { doff.data = await store.action(action, payload); doff.msg = doff.data.ok === false ? '' : okMsg; }
    catch (err) { doff.msg = 'Lỗi: ' + (err.message || err); }
    doff.busy = false; rerender();
  };
  root.querySelector('[data-doffice-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dofRun('doffice_tai_khoan', { username: String(f.get('username') || '').trim(), password: String(f.get('password') || '') }, 'Đăng nhập được. Đã lấy văn bản và lịch tuần.');
  });
  root.querySelector('[data-doffice-run]')?.addEventListener('click', () => dofRun('doffice_dong_bo', {}, 'Đã lấy xong.'));
  root.querySelector('[data-doffice-del]')?.addEventListener('click', () => {
    if (confirm('Xóa tài khoản D-Office khỏi máy chủ và dừng tự cập nhật?')) dofRun('doffice_tai_khoan', { xoa: true }, 'Đã xóa tài khoản D-Office.');
  });
  if (!backup.loaded) {
    backup.loaded = true;
    store.action('sao_luu', {}).then((r) => { backup.data = r; rerender(); }).catch(() => {});
  }
  root.querySelector('[data-backup-now]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Đang sao lưu…';
    try { backup.data = await store.action('sao_luu', { chay: true }); backup.msg = 'Đã sao lưu xong.'; }
    catch (err) { backup.msg = 'Sao lưu lỗi: ' + (err.message || err); }
    rerender();
  });
  root.querySelector('[data-logout]')?.addEventListener('click', () => {
    Auth.clear();
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    location.hash = '#/hom-nay';
    location.reload();
  });
}
