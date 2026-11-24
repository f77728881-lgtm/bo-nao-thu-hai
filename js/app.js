// Khung app: điều hướng, thanh tab, nhập nhanh, đồng bộ định kỳ.
import { CONFIG } from './config.js';
import { Auth, isDemo } from './api.js';
import * as store from './store.js';
import * as V from './views.js';
import { openRecord } from './form.js';
import { parse } from './quickadd.js';
import { toast, errorToast, openSheet, closeSheet, TABLE_META } from './ui.js';
import { html, esc, whenLabel, debounce } from './util.js';

const main = document.getElementById('main');
let searchQ = '';

// ---------------- Điều hướng ----------------
const ROUTES = {
  'hom-nay': () => V.todayView(),
  viec: () => V.tasksView(),
  'van-ban': () => V.docsView(),
  lich: () => V.calendarView(),
  tim: () => V.searchView(searchQ),
  them: () => V.moreView(),
  bang: (t) => (TABLE_META[t] ? V.tableView(t) : V.moreView())
};

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parts.length ? parts : ['hom-nay'];
}

function render() {
  if (!Auth.valid() && !store.all('viec').length && !isDemo()) return renderLogin();
  const [route, arg] = parseHash();
  // Liên kết từ Google Calendar: #/viec/V-xxx → mở bản ghi
  if (arg && store.schema()?.[route.replace('-', '_')] && route !== 'bang') {
    const table = route.replace('-', '_');
    setTimeout(() => openRecord(table, arg), 0);
  }
  const view = ROUTES[route] || ROUTES['hom-nay'];
  const keepFocus = document.activeElement?.id === 'search-input';
  const caret = keepFocus ? document.activeElement.selectionStart : 0;
  main.innerHTML = view(arg).__raw;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === route || (route === 'bang' && a.dataset.route === 'them')));
  if (keepFocus || route === 'tim') {
    const inp = document.getElementById('search-input');
    if (inp) { inp.focus(); if (keepFocus) inp.setSelectionRange(caret, caret); }
  }
  renderStatus();
}

function renderLogin() {
  main.innerHTML = `<div class="login">
    <div class="login-logo">🧠</div>
    <h1>${esc(CONFIG.APP_NAME)}</h1>
    <p>Đăng nhập bằng tài khoản Google chủ sở hữu để mở dữ liệu của bạn.</p>
    <div id="gsi-btn"></div>
    ${CONFIG.GOOGLE_CLIENT_ID ? '' : '<p class="hint">Chưa cấu hình GOOGLE_CLIENT_ID trong web/js/config.js. Xem docs/GIAI_DOAN_2.md, hoặc mở <a href="?demo">bản demo</a>.</p>'}
  </div>`;
  Auth.renderButton(document.getElementById('gsi-btn'));
}

function renderStatus() {
  const s = store.getState();
  const el = document.getElementById('sync-status');
  let text, cls;
  if (s.syncing) { text = 'Đang đồng bộ…'; cls = 'busy'; }
  else if (!s.online) { text = s.outbox.length ? `Ngoại tuyến · ${s.outbox.length} thay đổi chờ gửi` : 'Ngoại tuyến'; cls = 'off'; }
  else if (!Auth.valid()) { text = 'Cần đăng nhập lại'; cls = 'warn'; }
  else if (s.error && s.error.code !== 'CANH_BAO') { text = 'Lỗi đồng bộ'; cls = 'warn'; }
  else { text = isDemo() ? 'Bản demo' : (s.lastSync ? 'Đã đồng bộ' : ''); cls = 'ok'; }
  el.textContent = text;
  el.className = `sync-status ${cls}`;
  el.title = s.error ? s.error.message : '';
}

// ---------------- Sự kiện giao diện ----------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-toggle-task],[data-open],[data-new],[data-task-mode],[data-doc-filter],[data-cal-day],[data-cal-nav],[data-cal-today],#sync-status,#fab');
  if (!t) return;
  if (t.closest('.sheet') && !t.matches('[data-toggle-task]')) return; // trong biểu mẫu tự xử lý
  if (t.matches('[data-toggle-task]')) {
    e.stopPropagation();
    const v = store.get('viec', t.dataset.toggleTask);
    if (!v) return;
    const done = v.trang_thai !== 'Xong';
    try {
      await store.update('viec', v.id, { trang_thai: done ? 'Xong' : 'Chưa bắt đầu' });
      if (done) toast(`Xong: ${v.ten}`, { kind: 'ok', actionLabel: 'Hoàn tác', onAction: () => store.update('viec', v.id, { trang_thai: v.trang_thai }) });
    } catch (err) { errorToast(err); }
    return;
  }
  if (t.matches('[data-open]')) { const [table, id] = t.dataset.open.split('/'); openRecord(table, id); return; }
  if (t.matches('[data-new]')) { openRecord(t.dataset.new, null); return; }
  if (t.matches('[data-task-mode]')) { V.setTaskMode(t.dataset.taskMode); render(); return; }
  if (t.matches('[data-doc-filter]')) { V.setDocFilter(t.dataset.docFilter); render(); return; }
  if (t.matches('[data-cal-day]')) { V.calPick(t.dataset.calDay); render(); return; }
  if (t.matches('[data-cal-nav]')) { V.calNav(+t.dataset.calNav); render(); return; }
  if (t.matches('[data-cal-today]')) { V.calPick(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)); render(); return; }
  if (t.id === 'sync-status') {
    if (!Auth.valid() && !isDemo()) { Auth.refresh(); return; }
    store.sync(); return;
  }
  if (t.id === 'fab') openQuickAdd();
});

document.addEventListener('change', (e) => {
  const f = e.target.closest('[data-task-filter]');
  if (f) { V.setTaskFilter(f.dataset.taskFilter, f.value); render(); }
});

const onSearch = debounce((q) => { searchQ = q; if (parseHash()[0] === 'tim') render(); }, 120);
document.addEventListener('input', (e) => { if (e.target.id === 'search-input') onSearch(e.target.value); });

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n' || e.key === '+') { e.preventDefault(); openQuickAdd(); }
  if (e.key === '/') { e.preventDefault(); location.hash = '#/tim'; }
});

// ---------------- Nhập nhanh ----------------
const TYPE_LABEL = { viec: '✅ Việc', su_kien: '📅 Sự kiện', ghi_chu: '🗒 Ghi chú', inbox: '📥 Inbox' };

function openQuickAdd() {
  const box = document.createElement('div');
  box.className = 'quick';
  box.innerHTML = `<textarea id="qa-input" rows="2" placeholder="Ví dụ: mai 9h họp giao ban @phòng họp #đào tạo !gấp" enterkeyhint="done"></textarea>
    <div class="qa-types">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button type="button" class="chip" data-qa-type="${k}">${l}</button>`).join('')}</div>
    <div class="qa-preview" aria-live="polite"></div>
    <p class="hint">Hiểu: hôm nay, mai, mốt, thứ 6, thứ 3 tuần sau, cuối tuần, 25/12 · 9h, 14h30, 3h chiều · 2 tiếng, 45p · #lĩnh vực · !gấp !qt · @địa điểm · tiền tố “việc:”, “ghi chú:”</p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-qa-full>Mở biểu mẫu đầy đủ</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-qa-save>Thêm</button></div>`;
  const sheet = openSheet(box, { title: 'Nhập nhanh' });
  const input = box.querySelector('#qa-input');
  let forced = null;
  let parsed = null;
  const update = () => {
    parsed = parse(input.value, { areas: store.all('linh_vuc'), projects: store.all('du_an') });
    if (forced) parsed = reshape(parsed, forced, input.value);
    box.querySelectorAll('[data-qa-type]').forEach((b) => b.classList.toggle('on', b.dataset.qaType === parsed.type));
    const c = parsed.chips.map((ch) => ({
      when: `🗓 ${whenLabel(ch.v, { overdue: false })}`, minutes: `⏱ ${ch.v} phút`, gap: '⚡ Gấp', qt: '⭐ Quan trọng',
      area: `🗂 ${ch.v}`, project: `📁 ${ch.v}`, place: `📍 ${ch.v}`
    })[ch.k]);
    box.querySelector('.qa-preview').innerHTML = input.value.trim()
      ? `<b>${esc(parsed.title || input.value)}</b> ${c.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ')}`
      : '';
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
  box.querySelectorAll('[data-qa-type]').forEach((b) => b.addEventListener('click', () => { forced = b.dataset.qaType; update(); input.focus(); }));
  box.querySelector('[data-qa-full]').addEventListener('click', () => { const p = parsed; sheet.close(); setTimeout(() => openRecord(p ? p.type : 'viec', null, p ? p.data : {}), 200); });
  box.querySelector('[data-qa-save]').addEventListener('click', save);
  async function save() {
    if (!input.value.trim()) return;
    const p = parsed;
    sheet.close();
    try {
      await store.create(p.type, p.data);
      toast(`Đã thêm ${TYPE_LABEL[p.type].slice(2).toLowerCase()}: ${p.title || p.data.noi_dung}`, { kind: 'ok' });
    } catch (err) { errorToast(err); }
  }
  setTimeout(() => input.focus(), 50);
}

/** Đổi loại theo lựa chọn của người dùng, giữ ngày giờ đã đọc. */
function reshape(p, type, raw) {
  if (p.type === type) return p;
  const when = p.chips.find((c) => c.k === 'when')?.v || '';
  const title = p.title || raw.trim();
  const data = {
    viec: { ten: title, han: when, gap: p.data.gap || false, quan_trong: p.data.quan_trong || false, linh_vuc_id: p.data.linh_vuc_id },
    su_kien: { ten: title, bat_dau: when || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), dia_diem: p.data.dia_diem || '' },
    ghi_chu: { tieu_de: title.slice(0, 80), noi_dung: raw.trim() },
    inbox: { noi_dung: raw.trim() }
  }[type];
  Object.keys(data).forEach((k) => (data[k] === undefined || data[k] === '') && delete data[k]);
  return { ...p, type, data };
}

// ---------------- Khởi động ----------------
async function start() {
  if (isDemo()) document.body.classList.add('demo');
  Auth.load();
  await store.init();
  store.subscribe(debounce(() => { if (!document.querySelector('.sheet-wrap')) render(); else renderStatus(); }, 60));
  Auth.onChange((ok) => { if (ok) store.sync(); render(); });
  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  render();
  Auth.init().then(() => {
    if (Auth.valid() || isDemo()) return;
    // Có dữ liệu trên máy: vẫn cho xem (ngoại tuyến), thử xin phiên mới lặng lẽ. Chưa có gì: hiện màn đăng nhập.
    if (!store.all('viec').length) renderLogin();
    if (Auth.hadSession()) Auth.refresh();
  }).catch(errorToast);
  if (Auth.valid()) store.sync();
  setInterval(() => { if (document.visibilityState === 'visible' && Auth.valid()) store.sync(); }, CONFIG.SYNC_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Auth.valid()) store.sync(); });

  if ('serviceWorker' in navigator && !isDemo() && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
export { html };
