// Các màn hình chính. Mỗi hàm trả về HTML (đã thoát) cho vùng nội dung.
import * as store from './store.js';
import { html, raw, today, addDays, dayOf, weekdayName, fmtDate, fold, pad, vnNow, whenLabel } from './util.js';
import { taskRow, docRow, eventRow, genericRow, section, TABLE_META, quadrant, areaName } from './ui.js';

const isOpen = (v) => v.trang_thai !== 'Xong';
const byWhen = (f) => (a, b) => ((a[f] || '9999') < (b[f] || '9999') ? -1 : (a[f] || '9999') > (b[f] || '9999') ? 1 : 0);

// ---------------- Hôm nay ----------------
export function todayView() {
  const t = today();
  const in7 = addDays(t, 7);
  const tasks = store.all('viec').filter(isOpen);
  const overdue = tasks.filter((v) => v.han && dayOf(v.han) < t).sort(byWhen('han'));
  const due = tasks.filter((v) => dayOf(v.han) === t).sort(byWhen('han'));
  const shown = new Set([...overdue, ...due].map((v) => v.id));
  const q1 = tasks.filter((v) => v.gap && v.quan_trong && !shown.has(v.id)).sort(byWhen('han'));
  q1.forEach((v) => shown.add(v.id));
  const doing = tasks.filter((v) => v.trang_thai === 'Đang làm' && !shown.has(v.id));
  const soon = tasks.filter((v) => { const d = dayOf(v.han); return d > t && d <= in7 && !shown.has(v.id) && !doing.includes(v); }).sort(byWhen('han'));

  const events = store.all('su_kien').filter((e) => {
    const s = dayOf(e.bat_dau), en = dayOf(e.ket_thuc) || s;
    return (s <= t && en >= t) || (e.lap_lai && /FREQ=DAILY/.test(e.lap_lai) && s <= t);
  }).sort((a, b) => (a.bat_dau.slice(11) || '00') < (b.bat_dau.slice(11) || '00') ? -1 : 1);

  const docs = store.all('van_ban').filter((d) => d.trang_thai !== 'Xong' && d.vai_tro !== 'Xem để biết' && d.han_xu_ly && dayOf(d.han_xu_ly) <= in7).sort(byWhen('han_xu_ly'));
  const inbox = store.all('inbox').filter((i) => !i.da_xu_ly);

  const p = vnNow();
  const hello = p.h < 11 ? 'Chào buổi sáng' : p.h < 14 ? 'Chào buổi trưa' : p.h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const doneToday = store.all('viec').filter((v) => v.trang_thai === 'Xong' && (v.hoan_thanh_luc || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return html`
    <header class="page-head">
      <div><p class="eyebrow">${weekdayName(t, true)}, ${fmtDate(t, true)}</p><h1>${hello} 👋</h1></div>
      <div class="stat-row">
        <div class="stat ${overdue.length ? 'stat-red' : ''}"><b>${overdue.length}</b><span>quá hạn</span></div>
        <div class="stat"><b>${due.length}</b><span>hôm nay</span></div>
        <div class="stat stat-green"><b>${doneToday}</b><span>đã xong</span></div>
      </div>
    </header>
    <div class="grid">
      ${section('⏰ Quá hạn', overdue.map((v) => taskRow(v)))}
      ${section('📅 Hôm nay', [...events.map(eventRow), ...due.map((v) => taskRow(v))], { empty: 'Không có việc hay lịch nào hôm nay.' })}
      ${section('🔥 Gấp & Quan trọng', q1.map((v) => taskRow(v)))}
      ${section('🟡 Đang làm', doing.map((v) => taskRow(v)))}
      ${section('📄 Văn bản sắp hạn (7 ngày)', docs.map(docRow))}
      ${section('🗓 7 ngày tới', soon.map((v) => taskRow(v)))}
      ${inbox.length ? section('📥 Inbox chưa xử lý', inbox.slice(0, 7).map((r) => genericRow('inbox', r)), { more: html`<a class="more-link" href="#/bang/inbox">Xem tất cả →</a>` }) : ''}
    </div>`;
}

// ---------------- Việc ----------------
let taskMode = localStorage.getItem('bnth.taskMode') || 'list';
let taskFilter = { area: '', show: 'open' };

export function setTaskMode(m) { taskMode = m; localStorage.setItem('bnth.taskMode', m); }
export function setTaskFilter(k, v) { taskFilter[k] = v; }

export function tasksView() {
  let tasks = store.all('viec');
  if (taskFilter.area) tasks = tasks.filter((v) => v.linh_vuc_id === taskFilter.area);
  if (taskFilter.show === 'open') tasks = tasks.filter(isOpen);
  const areas = store.all('linh_vuc').sort((a, b) => (a.thu_tu || 99) - (b.thu_tu || 99));

  let body;
  if (taskMode === 'matrix') {
    const q = { q1: [], q2: [], q3: [], q4: [] };
    tasks.filter(isOpen).sort(byWhen('han')).forEach((v) => q[quadrant(v)].push(v));
    const box = (k, title, hint) => html`<section class="quad quad-${k}" data-drop-quad="${k}"><h3>${title}<small>${hint}</small></h3><ul class="list">${q[k].map((v) => taskRow(v))}</ul></section>`;
    body = html`<div class="matrix">
      ${box('q1', '🔥 Làm ngay', 'Gấp · Quan trọng')}${box('q2', '📌 Lên lịch', 'Quan trọng · Không gấp')}
      ${box('q3', '🤝 Giao / làm nhanh', 'Gấp · Không quan trọng')}${box('q4', '🧹 Để sau', 'Không gấp · Không quan trọng')}</div>`;
  } else if (taskMode === 'kanban') {
    const cols = ['Chưa bắt đầu', 'Đang làm', 'Chờ', 'Xong'];
    body = html`<div class="kanban">${cols.map((c) => {
      const items = tasks.filter((v) => v.trang_thai === c).sort(byWhen('han'));
      return html`<section class="kcol" data-drop-status="${c}"><h3>${c} <span class="count">${items.length}</span></h3><ul class="list">${items.slice(0, c === 'Xong' ? 15 : 200).map((v) => taskRow(v))}</ul></section>`;
    })}</div>`;
  } else {
    const t = today();
    const groups = [
      ['⏰ Quá hạn', (v) => v.han && dayOf(v.han) < t && isOpen(v)],
      ['📅 Hôm nay', (v) => dayOf(v.han) === t],
      ['🗓 Tuần này', (v) => { const d = dayOf(v.han); return d > t && d <= addDays(t, 7); }],
      ['🔭 Sau này', (v) => dayOf(v.han) > addDays(t, 7)],
      ['📝 Chưa có hạn', (v) => !v.han],
      ['✅ Đã xong (gần đây)', (v) => !isOpen(v) && dayOf(v.han) < t]
    ];
    const used = new Set();
    body = html`<div class="grid">${groups.map(([title, fn]) => {
      const items = tasks.filter((v) => !used.has(v.id) && fn(v)).sort(byWhen('han'));
      items.forEach((v) => used.add(v.id));
      return section(title, (title.startsWith('✅') ? items.slice(-20).reverse() : items).map((v) => taskRow(v)));
    })}</div>`;
  }

  return html`
    <header class="page-head"><h1>Việc</h1>
      <div class="seg" role="tablist">
        ${[['list', 'Danh sách'], ['matrix', 'Eisenhower'], ['kanban', 'Kanban']].map(([k, l]) => html`<button role="tab" class="${taskMode === k ? 'on' : ''}" data-task-mode="${k}">${l}</button>`)}
      </div>
    </header>
    <div class="filters">
      <select data-task-filter="area" aria-label="Lọc lĩnh vực"><option value="">Mọi lĩnh vực</option>${areas.map((a) => html`<option value="${a.id}" ${taskFilter.area === a.id ? raw('selected') : ''}>${a.bieu_tuong || ''} ${a.ten}</option>`)}</select>
      <select data-task-filter="show" aria-label="Lọc trạng thái"><option value="open" ${taskFilter.show === 'open' ? raw('selected') : ''}>Chưa xong</option><option value="all" ${taskFilter.show === 'all' ? raw('selected') : ''}>Tất cả</option></select>
      <button class="btn btn-ghost" data-new="viec">+ Việc mới</button>
    </div>
    ${body}`;
}

// ---------------- Văn bản ----------------
let docFilter = 'open';
export function setDocFilter(v) { docFilter = v; }

export function docsView() {
  let docs = store.all('van_ban');
  if (docFilter === 'open') docs = docs.filter((d) => d.trang_thai !== 'Xong');
  if (docFilter === 'lead') docs = docs.filter((d) => d.vai_tro === 'Chủ trì' && d.trang_thai !== 'Xong');
  if (docFilter === 'track') docs = docs.filter((d) => d.yeu_cau_dv_gui && d.trang_thai !== 'Xong');
  docs.sort((a, b) => ((a.han_xu_ly || '9999') < (b.han_xu_ly || '9999') ? -1 : 1));
  return html`
    <header class="page-head"><h1>Văn bản</h1>
      <div class="seg">${[['open', 'Đang xử lý'], ['lead', 'Chủ trì'], ['track', 'Thu đơn vị'], ['all', 'Tất cả']].map(([k, l]) => html`<button class="${docFilter === k ? 'on' : ''}" data-doc-filter="${k}">${l}</button>`)}</div>
    </header>
    <div class="filters"><button class="btn btn-ghost" data-new="van_ban">+ Văn bản mới</button></div>
    ${section(`${docs.length} văn bản`, docs.map(docRow), { count: false, empty: 'Không có văn bản nào.' })}`;
}

// ---------------- Lịch ----------------
let calMonth = today().slice(0, 7);
let calDay = today();
export function calNav(delta) {
  const [y, m] = calMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  calMonth = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function calPick(day) { calDay = day; calMonth = day.slice(0, 7); }

function itemsOn(day) {
  const tasks = store.all('viec').filter((v) => dayOf(v.han) === day);
  const docs = store.all('van_ban').filter((d) => dayOf(d.han_xu_ly) === day);
  const events = store.all('su_kien').filter((e) => {
    const s = dayOf(e.bat_dau), en = dayOf(e.ket_thuc) || s;
    if (s <= day && en >= day) return true;
    if (!e.lap_lai || s > day) return false;
    if (/FREQ=DAILY/.test(e.lap_lai)) return true;
    if (/FREQ=WEEKLY/.test(e.lap_lai)) return weekdayName(s) === weekdayName(day);
    if (/FREQ=MONTHLY/.test(e.lap_lai)) return s.slice(8) === day.slice(8);
    if (/FREQ=YEARLY/.test(e.lap_lai)) return s.slice(5) === day.slice(5);
    return false;
  });
  return { tasks, docs, events };
}

export function calendarView() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = `${calMonth}-01`;
  const startOffset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // tuần bắt đầu thứ Hai
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i - startOffset);
    if (i >= 35 && d.slice(0, 7) !== calMonth) break;
    const it = itemsOn(d);
    const dots = [
      ...it.events.slice(0, 2).map(() => 'ev'),
      ...it.tasks.filter((v) => isOpen(v)).slice(0, 3).map((v) => quadrant(v)),
      ...it.docs.slice(0, 2).map(() => 'doc')
    ];
    cells.push(html`<button class="day ${d.slice(0, 7) !== calMonth ? 'other' : ''} ${d === today() ? 'is-today' : ''} ${d === calDay ? 'is-picked' : ''}" data-cal-day="${d}">
      <span class="dnum">${+d.slice(8)}</span><span class="dots">${dots.map((c) => html`<i class="dot dot-${c}"></i>`)}</span></button>`);
  }
  const it = itemsOn(calDay);
  void daysInMonth;
  return html`
    <header class="page-head"><h1>Lịch</h1>
      <div class="cal-nav"><button class="icon-btn" data-cal-nav="-1" aria-label="Tháng trước">‹</button>
        <b>Tháng ${m}/${y}</b><button class="icon-btn" data-cal-nav="1" aria-label="Tháng sau">›</button>
        <button class="btn btn-ghost" data-cal-today>Hôm nay</button></div>
    </header>
    <div class="cal">
      <div class="cal-grid">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => html`<div class="wd">${w}</div>`)}${cells}</div>
      <div class="cal-legend"><span><i class="dot dot-ev"></i>Sự kiện</span><span><i class="dot dot-q1"></i>Gấp & QT</span><span><i class="dot dot-q2"></i>Quan trọng</span><span><i class="dot dot-doc"></i>Văn bản</span></div>
    </div>
    ${section(`${weekdayName(calDay, true)} ${fmtDate(calDay, true)}`, [
      ...it.events.sort((a, b) => (a.bat_dau.slice(11) < b.bat_dau.slice(11) ? -1 : 1)).map(eventRow),
      ...it.tasks.map((v) => taskRow(v)),
      ...it.docs.map(docRow)
    ], { empty: 'Trống. Chạm ＋ để thêm.', count: false })}`;
}

// ---------------- Tìm kiếm ----------------
export function searchView(q) {
  const hits = store.search(q);
  const groups = {};
  hits.forEach((h) => (groups[h.table] = groups[h.table] || []).push(h.rec));
  return html`
    <header class="page-head"><h1>Tìm kiếm</h1></header>
    <div class="search-box"><input id="search-input" type="search" placeholder="Gõ không cần dấu: lam thao, bao cao, pho…" value="${q}" autocomplete="off" enterkeyhint="search"></div>
    ${q ? (hits.length ? html`<div class="grid">${Object.entries(groups).map(([t, recs]) => section(`${TABLE_META[t].icon} ${TABLE_META[t].plural}`, recs.map((r) => (t === 'viec' ? taskRow(r) : t === 'van_ban' ? docRow(r) : t === 'su_kien' ? eventRow(r) : genericRow(t, r)))))}</div>`
      : html`<p class="empty big">Không thấy kết quả cho “${q}”.</p>`)
      : html`<p class="empty big">Tìm trong việc, văn bản, sự kiện, ghi chú, địa điểm, người liên hệ, dự án và inbox.</p>`}`;
}

// ---------------- Bảng chung ----------------
export function tableView(table) {
  const meta = TABLE_META[table];
  let recs = store.all(table);
  if (table === 'inbox') recs = recs.filter((r) => !r.da_xu_ly);
  if (table === 'don_vi') recs.sort((a, b) => (a.stt || 999) - (b.stt || 999));
  else recs.sort((a, b) => (b.ghim ? 1 : 0) - (a.ghim ? 1 : 0) || (a.updated_at < b.updated_at ? 1 : -1));
  if (table === 'du_an') {
    return html`<header class="page-head"><h1>${meta.icon} ${meta.plural}</h1></header>
      <div class="filters"><button class="btn btn-ghost" data-new="du_an">+ Dự án mới</button></div>
      <div class="grid">${recs.map((d) => {
        const tasks = store.all('viec').filter((v) => v.du_an_id === d.id);
        const done = tasks.filter((v) => !isOpen(v)).length;
        const pct = tasks.length ? Math.round((100 * done) / tasks.length) : 0;
        return html`<section class="card project" data-open="du_an/${d.id}"><h3 class="card-title">📁 ${d.ten}</h3>
          <p class="row-meta">${d.trang_thai}${d.han ? html` · hạn ${whenLabel(d.han)}` : ''}${d.linh_vuc_id ? html` · ${areaName(d.linh_vuc_id)}` : ''}</p>
          <div class="progress"><span style="width:${pct}%"></span><em>${done}/${tasks.length} việc</em></div></section>`;
      })}</div>`;
  }
  return html`<header class="page-head"><h1>${meta.icon} ${meta.plural}</h1></header>
    <div class="filters"><button class="btn btn-ghost" data-new="${table}">+ Thêm</button></div>
    ${section(`${recs.length} mục`, recs.map((r) => (table === 'su_kien' ? eventRow(r) : genericRow(table, r))), { count: false, empty: 'Chưa có gì ở đây.' })}`;
}

export function moreView() {
  const items = [['ghi_chu', 'Ghi chú'], ['inbox', 'Inbox'], ['du_an', 'Dự án'], ['dia_diem', 'Địa điểm'], ['nguoi', 'Người liên hệ'], ['su_kien', 'Sự kiện'], ['linh_vuc', 'Lĩnh vực'], ['don_vi', 'Đơn vị']];
  return html`<header class="page-head"><h1>Thêm</h1></header>
    <div class="tiles">${items.map(([t, l]) => {
      const n = t === 'inbox' ? store.all(t).filter((r) => !r.da_xu_ly).length : store.all(t).length;
      return html`<a class="tile" href="#/bang/${t}"><span class="tile-icon">${TABLE_META[t].icon}</span><span>${l}</span><em>${n}</em></a>`;
    })}</div>
    <p class="hint center">Dữ liệu được lưu trong Google Sheets của bạn và đồng bộ với lịch “🧠 Bộ não thứ hai”.</p>`;
}

export { fold };
