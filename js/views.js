// Các màn hình chính. Mỗi hàm trả về HTML (đã thoát) cho vùng nội dung.
import * as store from './store.js';
import { html, raw, today, addDays, dayOf, weekdayName, fmtDate, fold, pad, vnNow, whenLabel } from './util.js';
import { taskRow, docRow, eventRow, genericRow, section, TABLE_META, quadrant, areaName } from './ui.js';
import { lunarInfo, hourChiIndex } from './lunar.js';
import { icon } from './icons.js';
import { upcomingTripCard } from './travel.js';
import { habitStrip, todaySessions } from './training.js';
import { todayReviewCards } from './review.js';
import * as gcal from './extcal.js';
import { flashStrip } from './flashcards.js';
import { weeklyCta } from './weekly.js';
import * as weather from './weather.js';

const isOpen = (v) => v.trang_thai !== 'Xong';
const byWhen = (f) => (a, b) => ((a[f] || '9999') < (b[f] || '9999') ? -1 : (a[f] || '9999') > (b[f] || '9999') ? 1 : 0);

// ---------------- Hôm nay ----------------
let todayTab = localStorage.getItem('bnth.todayTab') || 'tat_ca';   // tat_ca | ca_nhan | doffice
let statFilter = '';                                                  // '' | quahan | homnay | daxong
export function setTodayTab(t) { todayTab = t; statFilter = ''; localStorage.setItem('bnth.todayTab', t); }
export function setStatFilter(f) { statFilter = statFilter === f ? '' : f; }

// Phân loại D-Office (công việc cơ quan) và cá nhân.
const DOF_TITLE = /^\s*(\[Doffice\]|\[P3\]|PC:|EVN:|NPC:)/i;
const isDofTask = (v) => v.nguon === 'Doffice' || (v.van_ban_ids || []).length > 0;
const isDofEvent = (e) => e.nguon === 'Doffice' || !!e.doffice_id || DOF_TITLE.test(e.ten || '');
const isMine = (title) => /\[P3\]/.test(title || '');
const isUpper = (title) => /^\s*(\[Doffice\]\s*)?(\[P3\]\s*)?(EVN|NPC):/i.test(title || ''); // lịch cấp trên: không hiện (chỉ lấy lịch công ty)
const inTab = (isDof) => todayTab === 'tat_ca' || (todayTab === 'doffice' ? isDof : !isDof);

export function todayView() {
  const t = today();
  const in7 = addDays(t, 7);
  const allTasks = store.all('viec');
  const tasks = allTasks.filter(isOpen).filter((v) => inTab(isDofTask(v)));
  const overdue = tasks.filter((v) => v.han && dayOf(v.han) < t).sort(byWhen('han'));
  const due = tasks.filter((v) => dayOf(v.han) === t).sort(byWhen('han'));
  const shown = new Set([...overdue, ...due].map((v) => v.id));
  const q1 = tasks.filter((v) => v.gap && v.quan_trong && !shown.has(v.id)).sort(byWhen('han'));
  q1.forEach((v) => shown.add(v.id));
  const doing = tasks.filter((v) => v.trang_thai === 'Đang làm' && !shown.has(v.id));
  const soon = tasks.filter((v) => { const d = dayOf(v.han); return d > t && d <= in7 && !shown.has(v.id) && !doing.includes(v); }).sort(byWhen('han'));
  const doneToday = allTasks.filter((v) => v.trang_thai === 'Xong' && inTab(isDofTask(v)) && (v.hoan_thanh_luc || '').slice(0, 10) === new Date().toISOString().slice(0, 10));

  // Lịch hôm nay: sự kiện trong app + lịch Google khác; bỏ lịch cấp trên.
  const events = store.all('su_kien').filter((e) => e.trang_thai !== 'Hủy').filter((e) => {
    const st = dayOf(e.bat_dau), en = dayOf(e.ket_thuc) || st;
    return (st <= t && en >= t) || (e.lap_lai && /FREQ=DAILY/.test(e.lap_lai) && st <= t);
  }).filter((e) => !isUpper(e.ten) && inTab(isDofEvent(e)));
  const [gTu, gDen] = gridRange(t.slice(0, 7));
  const gToday = gcal.eventsOn(t, gcal.eventsIn(gTu, gDen)).filter((e) => !isUpper(e.ten) && inTab(DOF_TITLE.test(e.ten)));
  const items = [...events.map((e) => ({ k: gcal.timeKey(e.bat_dau), mine: !isDofEvent(e) || isMine(e.ten), row: eventRow(e) })),
    ...gToday.map((e) => ({ k: gcal.timeKey(e.bat_dau), mine: !DOF_TITLE.test(e.ten) || isMine(e.ten), row: gcal.gcalRow(e) }))]
    .sort((a, b) => (a.k < b.k ? -1 : 1));
  const mineRows = items.filter((x) => x.mine).map((x) => x.row);
  const otherRows = items.filter((x) => !x.mine).map((x) => x.row);

  const docs = store.all('van_ban').filter((d) => todayTab !== 'ca_nhan' && d.trang_thai !== 'Xong' && d.vai_tro !== 'Xem để biết' && d.han_xu_ly && dayOf(d.han_xu_ly) <= in7).sort(byWhen('han_xu_ly'));
  const inbox = store.all('inbox').filter((i) => !i.da_xu_ly);
  const personal = todayTab !== 'doffice';

  const p = vnNow();
  const hello = p.h < 11 ? 'Chào buổi sáng' : p.h < 14 ? 'Chào buổi trưa' : p.h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const todayCount = due.length + items.length;
  const stat = (k, n, label, cls = '') => html`<button class="stat ${cls} ${statFilter === k ? 'on' : ''}" data-stat="${k}" aria-pressed="${statFilter === k}"><b>${n}</b><span>${label}</span></button>`;
  const agenda = html`${mineRows}${otherRows.length ? html`<li class="row more-company"><details><summary>${otherRows.length} lịch công ty khác</summary><ul class="list">${otherRows}</ul></details></li>` : ''}`;
  const agendaSection = section('Lịch & việc hôm nay', [...(items.length ? [agenda] : []), ...due.map((v) => taskRow(v))], { empty: 'Không có việc hay lịch nào hôm nay.', count: false, limit: 0 });

  let body;
  if (statFilter === 'quahan') body = section('Quá hạn', overdue.map((v) => taskRow(v)), { empty: 'Không có việc quá hạn 👏' });
  else if (statFilter === 'homnay') body = agendaSection;
  else if (statFilter === 'daxong') body = section('Đã xong hôm nay', doneToday.map((v) => taskRow(v)), { empty: 'Chưa xong việc nào hôm nay.' });
  else body = html`
      ${section('Quá hạn', overdue.map((v) => taskRow(v)), { limit: 5 })}
      ${agendaSection}
      ${section('Gấp & Quan trọng', q1.map((v) => taskRow(v)), { limit: 5 })}
      ${section('Đang làm', doing.map((v) => taskRow(v)), { limit: 5 })}
      ${section('Văn bản sắp hạn (7 ngày)', docs.map(docRow), { limit: 5 })}
      ${section('7 ngày tới', soon.map((v) => taskRow(v)), { limit: 5 })}
      ${personal && inbox.length ? section('Inbox chưa xử lý', inbox.slice(0, 5).map((r) => genericRow('inbox', r)), { more: html`<a class="more-link" href="#/bang/inbox">Xem tất cả →</a>` }) : ''}`;

  return html`
    ${topCard(t)}
    <div class="seg today-tabs">${[['tat_ca', 'Tất cả'], ['ca_nhan', 'Cá nhân'], ['doffice', 'D-Office']].map(([k, l]) => html`<button class="${todayTab === k ? 'on' : ''}" data-today-tab="${k}">${l}</button>`)}</div>
    <div class="stat-row stat-bar">
      ${stat('quahan', overdue.length, 'quá hạn', overdue.length ? 'stat-red' : '')}
      ${stat('homnay', todayCount, 'hôm nay')}
      ${stat('daxong', doneToday.length, 'đã xong', 'stat-green')}
    </div>
    ${statFilter ? html`<p class="hint filter-hint">Đang lọc. Chạm lại ô số để xem đầy đủ.</p>` : ''}
    ${!statFilter ? weeklyCta() : ''}
    ${personal && !statFilter ? html`${todayReviewCards()}${upcomingTripCard()}${habitStrip()}` : ''}
    <div class="grid today-grid">
      ${personal && !statFilter ? html`${todaySessions()}${flashStrip({ compact: true })}` : ''}
      ${body}
    </div>`;
}

/** Thẻ đầu trang: chào + ngày + âm lịch (chạm xem chi tiết) + thời tiết (chạm xem theo giờ) + một hàng nhắc. */
function topCard(t) {
  const l = lunarInfo(t);
  const p = vnNow();
  const hello = p.h < 11 ? 'Chào buổi sáng' : p.h < 14 ? 'Chào buổi trưa' : p.h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const evening = p.h >= 18;
  const w = weather.summary(evening ? 1 : 0);
  const chips = [];
  if (w && w.umbrella) chips.push(html`<span class="tt-chip rain">☔ Mang ô · mưa ${w.rainWork}%${evening ? ' (mai)' : ''}</span>`);
  else if (w && w.maybeRain) chips.push(html`<span class="tt-chip maybe">🌂 Có thể mưa ${w.rainWork}%</span>`);
  if (w) chips.push(html`<span class="tt-chip">👕 ${w.clothes.split(',')[0]}</span>`);
  return html`<section class="card today-top">
    <div class="tt-main">
      <div class="tt-left">
        <p class="tt-date">${weekdayName(t, true)}, ${fmtDate(t)}</p>
        <h1 class="tt-hello">${hello}</h1>
        <button class="linklike tt-lunar" data-lunar="${t}">🌙 ${l.label} ÂL · <b class="${l.hoangDao ? 'good' : 'bad'}">${l.hoangDao ? 'Hoàng đạo' : 'Hắc đạo'}</b>${l.le ? html` · <b class="le">${l.le}</b>` : ''}</button>
      </div>
      <button class="tt-wx" data-weather aria-label="Chi tiết thời tiết">
        ${w ? html`<span class="tt-temp">${w.icon}<b>${w.now !== null ? w.now : w.tmax}°</b></span><small>${evening ? 'Mai · ' : ''}${w.tmin}–${w.tmax}°</small>` : html`<small>Thời tiết…</small>`}
      </button>
    </div>
    ${chips.length ? html`<div class="tt-chips">${chips}</div>` : ''}
  </section>`;
}

/** Bảng thời tiết chi tiết: theo giờ hôm nay/ngày mai + chọn vị trí. */
export function weatherDetail() {
  const loc = weather.location();
  const day = (i) => {
    const w = weather.summary(i); const hs = weather.hourly(i);
    if (!w) return '';
    return html`<h4>${i ? 'Ngày mai' : 'Hôm nay'} · ${w.text} · ${w.tmin}–${w.tmax}°</h4>
      <div class="wx-hours">${hs.map((x) => html`<div class="wx-h"><small>${x.h}h</small><span>${x.icon}</span><b>${x.temp}°</b><i class="wx-rain" style="--r:${x.rain}%"></i><small class="${x.rain >= 70 ? 'rain' : ''}">${x.rain}%</small></div>`)}</div>
      <p class="row-meta">👕 ${w.clothes}${w.umbrella ? ' · ☔ nhớ mang ô' : ''}</p>`;
  };
  return html`<div class="wx">${day(0)}${day(1)}
    <p class="row-meta">📍 ${loc.ten} · <button class="linklike" data-weather-loc>${loc.ten === 'Việt Trì' ? 'Dùng vị trí hiện tại' : 'Về Việt Trì'}</button></p>
    <p class="hint">Nguồn: Open-Meteo. Bản tin 6:30 sáng trên điện thoại cũng nhắc mang ô khi mưa từ 70%.</p></div>`;
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

/** Ô đầu và ô cuối của lưới tháng (thứ Hai → Chủ nhật). */
function gridRange(month) {
  const first = `${month}-01`;
  const off = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const [y, m] = month.split('-').map(Number);
  const last = `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  const offEnd = (7 - ((new Date(last + 'T00:00:00Z').getUTCDay() + 6) % 7) - 1);
  return [addDays(first, -off), addDays(last, offEnd)];
}

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
  return { tasks, docs, events, g: gcal.eventsOn(day, gList) };
}
let gList = [];

export function calendarView() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = `${calMonth}-01`;
  const startOffset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // tuần bắt đầu thứ Hai
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [gTu, gDen] = gridRange(calMonth);
  gList = gcal.eventsIn(gTu, gDen);
  const gErr = gcal.lastError(gTu, gDen);
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
    const gdots = it.g.slice(0, Math.max(0, 5 - dots.length)).map((e) => gcal.calOf(e.lich_id).mau);
    const lu = lunarInfo(d);
    cells.push(html`<button class="day ${d.slice(0, 7) !== calMonth ? 'other' : ''} ${d === today() ? 'is-today' : ''} ${d === calDay ? 'is-picked' : ''} ${lu.special ? 'lunar-special' : ''}" data-cal-day="${d}" title="${lu.label} ${lu.le}">
      <span class="dnum">${+d.slice(8)}</span><span class="dlunar ${lu.hoangDao ? 'hd' : ''}">${lu.day === 1 ? lu.label : lu.day}</span><span class="dots">${dots.map((c) => html`<i class="dot dot-${c}"></i>`)}${gdots.map((c) => html`<i class="dot" style="background:${c}"></i>`)}</span></button>`);
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
      <div class="cal-legend"><span><b class="hd-mark">16</b> ngày âm · xanh = hoàng đạo</span><span><i class="dot dot-ev"></i>Sự kiện</span><span><i class="dot dot-q1"></i>Gấp & QT</span><span><i class="dot dot-q2"></i>Quan trọng</span><span><i class="dot dot-doc"></i>Văn bản</span><span><i class="dot dot-gcal"></i>Lịch Google khác</span></div>
      ${gErr ? html`<p class="hint">⚠️ ${gErr}.</p>` : ''}
    </div>
    ${lunarCard(calDay, { compact: true })}
    ${section(`${weekdayName(calDay, true)} ${fmtDate(calDay, true)}`, [
      ...[...it.events.map((e) => [gcal.timeKey(e.bat_dau), eventRow(e)]), ...it.g.map((e) => [gcal.timeKey(e.bat_dau), gcal.gcalRow(e)])]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]),
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
    ${q ? (hits.length ? html`<div class="grid">${Object.entries(groups).map(([t, recs]) => section(TABLE_META[t].plural, recs.map((r) => (t === 'viec' ? taskRow(r) : t === 'van_ban' ? docRow(r) : t === 'su_kien' ? eventRow(r) : genericRow(t, r)))))}</div>`
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
    return html`<header class="page-head"><h1>${meta.plural}</h1></header>
      <div class="filters"><button class="btn btn-ghost" data-new="du_an">+ Dự án mới</button></div>
      <div class="grid">${recs.map((d) => {
        const tasks = store.all('viec').filter((v) => v.du_an_id === d.id);
        const done = tasks.filter((v) => !isOpen(v)).length;
        const pct = tasks.length ? Math.round((100 * done) / tasks.length) : 0;
        return html`<section class="card project" data-open="du_an/${d.id}"><h3 class="card-title">${icon('folder')} ${d.ten}</h3>
          <p class="row-meta">${d.trang_thai}${d.han ? html` · hạn ${whenLabel(d.han)}` : ''}${d.linh_vuc_id ? html` · ${areaName(d.linh_vuc_id)}` : ''}</p>
          <div class="progress"><span style="width:${pct}%"></span><em>${done}/${tasks.length} việc</em></div>
          ${d.cau_hemingway ? html`<p class="hemingway">➡️ <b>Lần sau bắt đầu:</b> ${d.cau_hemingway}</p>` : d.trang_thai === 'Đang làm' ? html`<p class="hint">Chưa có “cầu Hemingway”: dừng lại thì ghi một dòng lần sau bắt đầu từ đâu.</p>` : ''}
          ${(() => { const nx = tasks.filter((v) => v.trang_thai !== 'Xong').sort((a, b) => ((a.han || '9') < (b.han || '9') ? -1 : 1))[0]; return nx ? html`<p class="row-meta">Việc tiếp theo: ${nx.ten}</p>` : ''; })()}
          ${store.all('ghi_chu').filter((n) => n.du_an_id === d.id).length ? html`<p class="row-meta">🗒 ${store.all('ghi_chu').filter((n) => n.du_an_id === d.id).length} ghi chú gắn dự án</p>` : ''}</section>`;
      })}</div>`;
  }
  return html`<header class="page-head"><h1>${meta.plural}</h1></header>
    <div class="filters"><button class="btn btn-ghost" data-new="${table}">+ Thêm</button></div>
    ${section(`${recs.length} mục`, recs.map((r) => (table === 'su_kien' ? eventRow(r) : genericRow(table, r))), { count: false, empty: 'Chưa có gì ở đây.' })}`;
}

export function moreView() {
  const items = [['tu-sach', 'Tủ sách'], ['on-tuan', 'Ôn tuần'], ['nhat-ky', 'Nhật ký & tâm trạng'], ['ren-luyen', 'Rèn luyện'], ['cai-dat', 'Cài đặt'], ['hanh-trinh', 'Hành trình'], ['lich', 'Lịch'], ['inbox', 'Inbox'], ['du_an', 'Dự án'], ['dia_diem', 'Địa điểm'], ['nguoi', 'Người liên hệ'], ['su_kien', 'Sự kiện'], ['linh_vuc', 'Lĩnh vực'], ['don_vi', 'Đơn vị']];
  return html`<header class="page-head"><h1>Thêm</h1></header>
    <div class="tiles">${items.map(([t, l]) => {
      if (t === 'tu-sach') return html`<a class="tile" href="#/tu-sach"><span class="tile-icon">${icon('book')}</span><span>${l}</span><em>${store.all('sach').filter((b) => b.trang_thai === 'Đã đọc' && String(b.xong_ngay || '').startsWith(today().slice(0, 4))).length} cuốn năm nay</em></a>`;
      if (t === 'on-tuan') return html`<a class="tile" href="#/on-tuan"><span class="tile-icon">${icon('calendar')}</span><span>${l}</span><em>15 phút chiều thứ 6</em></a>`;
      if (t === 'nhat-ky') return html`<a class="tile" href="#/nhat-ky"><span class="tile-icon">${icon('moon')}</span><span>${l}</span><em>tổng kết cuối ngày</em></a>`;
      if (t === 'ren-luyen') return html`<a class="tile" href="#/ren-luyen"><span class="tile-icon">${icon('spark')}</span><span>${l}</span><em>thói quen, lộ trình</em></a>`;
      if (t === 'cai-dat') return html`<a class="tile" href="#/cai-dat"><span class="tile-icon">${icon('settings')}</span><span>${l}</span><em>giao diện, cỡ chữ</em></a>`;
      if (t === 'hanh-trinh') return html`<a class="tile" href="#/hanh-trinh"><span class="tile-icon">${icon('travel')}</span><span>${l}</span><em>${store.all('chuyen_di').length} chuyến</em></a>`;
      if (t === 'lich') return html`<a class="tile" href="#/lich"><span class="tile-icon">${icon('calendar')}</span><span>${l}</span><em>tháng này</em></a>`;
      const n = t === 'inbox' ? store.all(t).filter((r) => !r.da_xu_ly).length : store.all(t).length;
      return html`<a class="tile" href="#/bang/${t}"><span class="tile-icon">${icon(TABLE_META[t].ic)}</span><span>${l}</span><em>${n}</em></a>`;
    })}</div>
    <p class="hint center">Dữ liệu được lưu trong Google Sheets của bạn và đồng bộ với lịch “🧠 Bộ não thứ hai”.</p>`;
}

export { fold };

// ---------------- Âm lịch ----------------
export function lunarChip(ymd) {
  const l = lunarInfo(ymd);
  return html`<button class="lunar-chip" data-lunar="${ymd}">🌙 ${l.label} ${l.canChiYear} · ngày ${l.canChiDay} · <b class="${l.hoangDao ? 'good' : 'bad'}">${l.hoangDao ? 'Hoàng đạo' : 'Hắc đạo'}</b>${l.le ? html` · <b class="le">${l.le}</b>` : ''}</button>`;
}

export function lunarCard(ymd, { compact = false } = {}) {
  const l = lunarInfo(ymd);
  const isToday = ymd === today();
  const nowIdx = isToday ? hourChiIndex(vnNow().h) : -1;
  return html`<section class="card lunar-card" data-lunar="${ymd}">
    <h3 class="card-title">${icon('moon')} Âm lịch ${compact ? html`<span class="muted-inline">${l.label} · ngày ${l.canChiDay}</span>` : ''}${l.le ? html` <span class="tag tag-le">${l.le}</span>` : ''}</h3>
    ${compact ? '' : html`<p class="lunar-line"><b>${l.label}</b> năm ${l.canChiYear} · tháng ${l.canChiMonth} · ngày ${l.canChiDay}</p>`}
    <p class="lunar-line">${l.hoangDao ? html`<span class="good">● Ngày hoàng đạo</span>` : html`<span class="bad">● Ngày hắc đạo</span>`} (${l.than}) · trực <b>${l.truc}</b> · tiết <b>${l.tietKhi}</b></p>
    <div class="hours">${l.goodHours.map((h) => html`<span class="hour ${CHI_INDEX[h.chi] === nowIdx ? 'now' : ''}">${h.chi} <small>${h.range}h</small></span>`)}</div>
    <p class="lunar-line small"><span class="good">Nên:</span> ${l.nen}</p>
    <p class="lunar-line small"><span class="bad">Tránh:</span> ${l.tranh}</p>
  </section>`;
}
const CHI_INDEX = { 'Tý': 0, 'Sửu': 1, 'Dần': 2, 'Mão': 3, 'Thìn': 4, 'Tỵ': 5, 'Ngọ': 6, 'Mùi': 7, 'Thân': 8, 'Dậu': 9, 'Tuất': 10, 'Hợi': 11 };

/** Chi tiết âm lịch đầy đủ (mở trong bảng trượt). */
export function lunarDetail(ymd) {
  const l = lunarInfo(ymd);
  return html`<div class="lunar-detail">
    <p class="big-lunar">${l.label}<small>${l.leap ? 'tháng nhuận · ' : ''}năm ${l.canChiYear}</small></p>
    <table class="kv">
      <tr><th>Dương lịch</th><td>${weekdayName(ymd, true)}, ${fmtDate(ymd, true)}</td></tr>
      <tr><th>Ngày</th><td>${l.canChiDay}</td></tr><tr><th>Tháng</th><td>${l.canChiMonth}</td></tr><tr><th>Năm</th><td>${l.canChiYear}</td></tr>
      <tr><th>Tiết khí</th><td>${l.tietKhi}</td></tr>
      <tr><th>Ngày</th><td>${l.hoangDao ? html`<span class="good">Hoàng đạo</span>` : html`<span class="bad">Hắc đạo</span>`} · ${l.than}</td></tr>
      <tr><th>Trực</th><td>${l.truc}</td></tr>
      ${l.le ? html`<tr><th>Ngày lễ</th><td>${l.le}</td></tr>` : ''}
    </table>
    <h4>Giờ trong ngày</h4>
    <div class="hours all">${l.hours.map((h) => html`<span class="hour ${h.good ? 'good-h' : 'bad-h'}">${h.chi}<small>${h.range}h · ${h.than}</small></span>`)}</div>
    <h4>Việc nên làm</h4><p>${l.nen}</p>
    <h4>Nên tránh</h4><p>${l.tranh}</p>
    <p class="hint">Theo lịch vạn niên truyền thống (ngày/giờ hoàng đạo theo 12 thần, 12 trực). Mỗi sách lịch có thể ghi hơi khác, chỉ để tham khảo.</p>
  </div>`;
}
