// Tùy chỉnh giao diện: sáng/tối, cỡ chữ, màu nhấn. Lưu trên máy (localStorage).
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
