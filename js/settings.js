// Tùy chỉnh giao diện: sáng/tối, cỡ chữ, màu nhấn. Lưu trên máy (localStorage).
import * as gcal from './extcal.js';
import { html } from './util.js';
import * as store from './store.js';
import { Auth, isDemo } from './api.js';
import { icon } from './icons.js';

const KEY = 'bnth.prefs';
export const ACCENTS = [
  ['ios', 'Xanh iOS', '#007aff'], ['teal', 'Xanh ngọc', '#0d9488'], ['blue', 'Xanh dương', '#2563eb'], ['violet', 'Tím', '#7c3aed'],
  ['orange', 'Cam đất', '#ea580c'], ['rose', 'Hồng', '#e11d48'], ['navy', 'Xanh than', '#1d3557']
];
const DEFAULTS = { theme: 'auto', size: 'm', accent: 'ios' };
// Một lần: chuyển màu nhấn mặc định cũ (xanh ngọc) sang giao diện iOS.
try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!localStorage.getItem('bnth.ios1')) { if (o.accent === 'teal') { o.accent = 'ios'; localStorage.setItem(KEY, JSON.stringify(o)); } localStorage.setItem('bnth.ios1', '1'); } } catch (e) { /* bỏ qua */ }

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
const devs = { loaded: false, items: null, msg: '' };
const push = { state: '', msg: '', busy: false, loai: JSON.parse(localStorage.getItem('bnth.push.loai') || '{"sang":true,"thoi_quen":true,"doffice":true}') };
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64uToU8(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
async function pushSub() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
function pushCard() {
  const on = push.state === 'on';
  const opt = (k, l) => html`<label class="ref-opt"><input type="checkbox" data-push-loai="${k}" ${push.loai[k] ? 'checked' : ''} ${on ? '' : 'disabled'}> ${l}</label>`;
  return html`<section class="card settings">
    <h3 class="card-title">${icon('spark')} Thông báo trên máy này</h3>
    ${!pushSupported() ? html`<p class="hint">Trình duyệt này chưa hỗ trợ thông báo. Trên iPhone: thêm app vào Màn hình chính rồi mở từ đó.</p>`
      : html`<p class="row-meta">${on ? '✅ Đang bật' : push.state === 'denied' ? '⛔ Đã bị chặn trong cài đặt trình duyệt' : 'Đang tắt'}</p>
      <div class="cal-list">${opt('sang', 'Bản tin 6:30: thời tiết, nhắc mang ô, việc hôm nay')}${opt('thoi_quen', 'Nhắc thói quen đúng giờ (nếu chưa làm)')}${opt('doffice', 'Văn bản / lịch tuần D-Office mới')}</div>
      <div class="opts">${on ? html`<button class="btn btn-ghost" data-push-test ${push.busy ? 'disabled' : ''}>Gửi thử</button><button class="btn btn-ghost" data-push-off>Tắt</button>`
        : html`<button class="btn" data-push-on ${push.busy || push.state === 'denied' ? 'disabled' : ''}>Bật thông báo</button>`}</div>`}
    ${push.msg ? html`<p class="hint">${push.msg}</p>` : ''}
  </section>`;
}
function devicesCard() {
  const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
  return html`<section class="card settings">
    <h3 class="card-title">${icon('user')} Thiết bị đang đăng nhập</h3>
    <p class="row-meta">Mỗi thiết bị giữ đăng nhập 90 ngày, không phải bấm đăng nhập lại.</p>
    ${devs.items ? html`<ul class="backup-list">${devs.items.map((d) => html`<li>${d.ten}${d.hien_tai ? ' (máy này)' : ''} · dùng ${when(d.dung)} · hết hạn ${new Date(d.het_han).toLocaleDateString('vi-VN')}
      ${d.hien_tai ? '' : html` <button class="btn btn-ghost btn-xs" data-dev-off="${d.id}">Đăng xuất</button>`}</li>`)}</ul>` : html`<p class="hint">Đang tải…</p>`}
    ${devs.items && devs.items.length > 1 ? html`<div class="opts"><button class="btn btn-ghost" data-dev-others>Đăng xuất các thiết bị khác</button></div>` : ''}
    ${devs.msg ? html`<p class="hint">${devs.msg}</p>` : ''}
  </section>`;
}
const doff = { loaded: false, data: null, msg: '', busy: false, key: '' };
function dofficeCard() {
  const d = doff.data;
  const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
  let line = 'Chưa nhập tài khoản. Máy tính của anh sẽ tự lấy văn bản Chủ trì/Phối hợp và lịch tuần công ty lúc 8:00 và 14:00 (thứ 2–6), lỡ giờ thì lấy bù khi máy bật.';
  if (d && d.da_cai) {
    if (d.ok === false) line = `⚠️ ${when(d.luc)}: ${d.loi}`;
    else if (d.luc_ok) line = `✅ ${d.may || 'Máy tính'} lấy lúc ${when(d.luc_ok)}: ${d.so_dong ?? 0} văn bản đang giao${d.moi?.length ? `, ${d.moi.length} mới` : ''}${d.lich ? ` · lịch tuần ${d.lich.so_lich} mục` : ''}.`;
    else line = 'Đã lưu tài khoản. Máy tính đang bật sẽ lấy trong vòng 15 phút.';
  }
  const mays = Object.entries(d?.may_tinh || {}).sort((a, b) => (a[1] < b[1] ? 1 : -1));
  return html`<section class="card settings">
    <h3 class="card-title">${icon('doc')} D-Office</h3>
    <p class="row-meta">${line}</p>
    ${d?.da_cai && d.can_lay && d.ok !== false ? html`<p class="hint">Đang chờ máy tính bật để lấy khung giờ gần nhất.</p>` : ''}
    ${d && d.loi_lich ? html`<p class="hint">Lịch tuần: ${d.loi_lich}</p>` : ''}
    <form class="doffice-form" data-doffice-form autocomplete="off">
      <label>Tên đăng nhập<input name="username" value="${d?.tai_khoan || ''}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label>Mật khẩu ${d?.da_cai ? html`<i class="hint">(để trống = giữ mật khẩu cũ)</i>` : ''}<input name="password" type="password" autocomplete="new-password"></label>
      <div class="opts"><button class="btn" type="submit" ${doff.busy ? 'disabled' : ''}>${doff.busy ? 'Đang lưu…' : d?.da_cai ? 'Cập nhật' : 'Lưu'}</button>
        ${d?.da_cai ? html`<button class="btn btn-ghost" type="button" data-doffice-run ${doff.busy ? 'disabled' : ''}>Lấy ngay</button><button class="btn btn-ghost" type="button" data-doffice-del>Xóa tài khoản</button>` : ''}</div>
    </form>
    ${doff.msg ? html`<p class="hint">${doff.msg}</p>` : ''}
    <h3 class="card-title">Máy tính lấy D-Office</h3>
    ${mays.length ? html`<ul class="backup-list">${mays.map(([m, t]) => html`<li>${m} · liên lạc ${when(t)}</li>`)}</ul>` : html`<p class="hint">Chưa có máy nào liên lạc.</p>`}
    <div class="opts"><button class="btn btn-ghost" type="button" data-doffice-key>Khóa cho máy Windows</button></div>
    ${doff.key ? html`<div class="key-box"><p class="hint">1) Trên máy Windows mở <b>PowerShell</b>, dán lệnh:</p>
      <code class="copyable" data-copy="irm https://f77728881-lgtm.github.io/bo-nao-thu-hai/may-tinh/cai-dat-windows.ps1 | iex">irm https://f77728881-lgtm.github.io/bo-nao-thu-hai/may-tinh/cai-dat-windows.ps1 | iex</code>
      <p class="hint">2) Khi được hỏi "Khoa may tinh", dán khóa này (giữ bí mật):</p>
      <code class="copyable" data-copy="${doff.key}">${doff.key.slice(0, 6)}…${doff.key.slice(-4)} (chạm để sao chép)</code></div>` : ''}
    <p class="hint">Mật khẩu chỉ lưu trên máy chủ Google của anh, app không hiện lại. Đổi mật khẩu D-Office (90 ngày) thì nhập mật khẩu mới ở đây, các máy tự dùng mật khẩu mới. Sai mật khẩu thì tạm dừng để không bị khóa tài khoản. Chỉ đọc D-Office.</p>
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
      ${isDemo() ? '' : pushCard()}
      ${isDemo() ? '' : devicesCard()}
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
  if (!isDemo() && pushSupported() && !push.state) {
    push.state = Notification.permission === 'denied' ? 'denied' : 'checking';
    pushSub().then((sub) => { push.state = sub && Notification.permission === 'granted' ? 'on' : (Notification.permission === 'denied' ? 'denied' : 'off'); rerender(); }).catch(() => { push.state = 'off'; rerender(); });
  }
  const registerPush = async () => {
    const sub = await pushSub();
    if (sub) await store.action('thong_bao_dang_ky', { sub: sub.toJSON(), thiet_bi: navigator.userAgent.includes('Android') ? 'Android' : navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Máy tính', loai: push.loai });
  };
  root.querySelector('[data-push-on]')?.addEventListener('click', async () => {
    push.busy = true; push.msg = ''; rerender();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { push.state = perm === 'denied' ? 'denied' : 'off'; push.msg = 'Chưa được cho phép thông báo.'; }
      else {
        const { pub } = await store.action('thong_bao_khoa', {});
        const reg = await navigator.serviceWorker.ready;
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToU8(pub) });
        await registerPush();
        push.state = 'on'; push.msg = 'Đã bật. Bấm “Gửi thử” để kiểm tra.';
      }
    } catch (e) { push.msg = 'Lỗi: ' + (e.message || e); }
    push.busy = false; rerender();
  });
  root.querySelector('[data-push-test]')?.addEventListener('click', async () => {
    push.busy = true; rerender();
    try { const r = await store.action('thong_bao_thu', {}); push.msg = r.gui ? 'Đã gửi thử, thông báo sẽ hiện trong vài giây.' : 'Chưa có thiết bị nào đăng ký.'; }
    catch (e) { push.msg = 'Lỗi: ' + (e.message || e); }
    push.busy = false; rerender();
  });
  root.querySelector('[data-push-off]')?.addEventListener('click', async () => {
    try { const sub = await pushSub(); if (sub) { await store.action('thong_bao_huy', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch { /* bỏ qua */ }
    push.state = 'off'; push.msg = 'Đã tắt thông báo trên máy này.'; rerender();
  });
  root.querySelectorAll('[data-push-loai]').forEach((cb) => cb.addEventListener('change', () => {
    push.loai[cb.dataset.pushLoai] = cb.checked; localStorage.setItem('bnth.push.loai', JSON.stringify(push.loai)); registerPush().catch(() => {});
  }));
  const loadDevs = () => store.action('phien_ds', {}).then((r) => { devs.items = r.items; rerender(); }).catch(() => {});
  if (!isDemo() && !devs.loaded && Auth.session) { devs.loaded = true; loadDevs(); }
  root.querySelectorAll('[data-dev-off]').forEach((b) => b.addEventListener('click', async () => {
    await store.action('phien_huy', { id: b.dataset.devOff }).catch(() => {}); devs.msg = 'Đã đăng xuất thiết bị đó.'; loadDevs();
  }));
  root.querySelector('[data-dev-others]')?.addEventListener('click', async () => {
    if (!confirm('Đăng xuất tất cả thiết bị khác?')) return;
    await store.action('phien_huy', { tat_ca: true, tru_may_nay: true }).catch(() => {}); devs.msg = 'Đã đăng xuất các thiết bị khác.'; loadDevs();
  });
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
    dofRun('doffice_tai_khoan', { username: String(f.get('username') || '').trim(), password: String(f.get('password') || '') }, 'Đã lưu. Máy tính đang bật sẽ đăng nhập và lấy trong vòng 15 phút, kết quả hiện ở đây.');
  });
  root.querySelector('[data-doffice-run]')?.addEventListener('click', () => dofRun('doffice_dong_bo', {}, 'Đã gửi yêu cầu. Máy tính đang bật sẽ lấy trong vòng 15 phút.'));
  root.querySelector('[data-doffice-key]')?.addEventListener('click', async () => {
    try { doff.key = (await store.action('doffice_khoa_may', {})).khoa; } catch (err) { doff.msg = 'Lỗi: ' + (err.message || err); }
    rerender();
  });
  root.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.dataset.copy); el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); } catch { /* trình duyệt chặn */ }
  }));
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
  root.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try { if (Auth.session) await store.action('phien_huy', { hien_tai: true }); } catch { /* vẫn đăng xuất trên máy */ }
    Auth.clear();
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    location.hash = '#/hom-nay';
    location.reload();
  });
}
