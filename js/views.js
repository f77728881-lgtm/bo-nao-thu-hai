// Các màn hình chính. Mỗi hàm trả về HTML (đã thoát) cho vùng nội dung.
import * as store from './store.js';
import { html, raw, today, addDays, dayOf, weekdayName, fmtDate, fold, pad, vnNow, whenLabel } from './util.js';
import { taskRow, docRow, eventRow, genericRow, section, TABLE_META, quadrant, areaName } from './ui.js';
import { lunarInfo, hourChiIndex } from './lunar.js';
import { icon } from './icons.js';
import { todayReadCard } from './reading.js';
import { marketChips } from './market.js';
import { upcomingTripCard } from './travel.js';
import { habitStrip, sessionRows } from './training.js';
import { todayPriorities, closeDayCard } from './review.js';
import { newsCard } from './news.js';
import * as gcal from './extcal.js';
import { flashRow } from './flashcards.js';
import { weeklyCta } from './weekly.js';
import * as weather from './weather.js';
import { hrSubtitle, hrForSearch, answerHtml, hrHitsHtml } from './hr.js';
import { financeSummary, tien } from './finance.js';
const financeSub = () => { const s = financeSummary(today().slice(0, 7)); return store.all('danh_muc').length ? `tháng này chi ${tien(s.chi)}${s.cho_duyet ? ' · ' + s.cho_duyet + ' chờ duyệt' : ''}` : 'thu chi, ngân sách'; };
import { understand, hrHits, BOOK, BOOK_IDS, tipOfDay } from './ask.js';

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
      ${section('Văn bản sắp hạn (7 ngày)', docs.map(docRow), { limit: 5 })}
      ${personal && inbox.length ? section('Inbox chưa xử lý', inbox.slice(0, 5).map((r) => genericRow('inbox', r)), { more: html`<a class="more-link" href="#/bang/inbox">Xem tất cả →</a>` }) : ''}`;

  return html`
    ${topCard(t)}
    ${todayReadCard()}
    <div class="seg today-tabs">${[['tat_ca', 'Tất cả'], ['ca_nhan', 'Cá nhân'], ['doffice', 'D-Office']].map(([k, l]) => html`<button class="${todayTab === k ? 'on' : ''}" data-today-tab="${k}">${l}</button>`)}</div>
    <div class="stat-row stat-bar">
      ${stat('quahan', overdue.length, 'quá hạn', overdue.length ? 'stat-red' : '')}
      ${stat('homnay', todayCount, 'hôm nay')}
      ${stat('daxong', doneToday.length, 'đã xong', 'stat-green')}
    </div>
    ${statFilter ? html`<p class="hint filter-hint">Đang lọc. Chạm lại ô số để xem đầy đủ.</p>` : ''}
    ${!statFilter ? weeklyCta() : ''}
    ${!statFilter ? askTipCard() : ''}
    ${personal && !statFilter ? html`${focusCard()}${upcomingTripCard()}${habitStrip()}` : ''}
    <div class="grid today-grid">${body}</div>
    ${personal && !statFilter ? html`${newsCard()}${closeDayCard()}` : ''}`;
}

/** Ưu tiên hôm nay: 3 việc chọn từ tối qua + buổi học/tập + câu cần ôn — gom một chỗ, gọn. */
function focusCard() {
  const pri = todayPriorities();
  const rows = [...sessionRows(), flashRow()].filter(Boolean);
  if (!pri.length && !rows.length) return raw('');
  return html`<section class="card focus">
    <h3 class="card-title">${icon('spark')} Ưu tiên hôm nay</h3>
    ${pri.length ? html`<ol class="pri-list">${pri.map((v) => html`<li class="${v.trang_thai === 'Xong' ? 'is-done' : ''}" data-open="viec/${v.id}">${v.trang_thai === 'Xong' ? '✓ ' : ''}${v.ten}</li>`)}</ol>`
      : html`<p class="hint">Tối nay khi Khép lại ngày, chọn 3 việc quan trọng nhất cho ngày mai — sáng ra sẽ hiện ở đây.</p>`}
    ${rows.length ? html`<h4 class="focus-sub">Học & tập</h4><ul class="list">${rows}</ul>` : ''}
  </section>`;
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
  const mk = marketChips();
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
    ${chips.length || mk.length ? html`<div class="tt-chips">${chips.length ? html`<div class="tt-g wx">${chips}</div>` : ''}${mk.length ? html`<div class="tt-g mk">${mk}</div>` : ''}</div>` : ''}
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

/** Gợi ý lĩnh vực cho văn bản theo từ khóa (chỉ gợi ý những lĩnh vực đang có). */
const AREA_RULES = [
  [/tuyen dung|thi tuyen|tiep nhan ho so|tuyen lao dong/, /tuyen dung/],
  [/dao tao|boi huan|huan luyen|sat hach|e-?learning|boi duong/, /dao tao/],
  [/luong|bhxh|bao hiem|phu cap|thu nhap|che do|nang bac/, /luong|bhxh/],
  [/dieu dong|tiep nhan|bo tri cong viec|lao dong|bhld|bao ho|trang phuc|noi quy|ky luat|thoi viec|nghi huu|hop dong/, /lao dong/],
  [/uy quyen|to chuc|bo may|co cau|bo nhiem|quy hoach|can bo|phan cong|mo hinh/, /mo hinh|to chuc/],
  [/thi dua|khen thuong/, /thi dua|khen/],
  [/bao cao/, /bao cao/]
];
export function suggestArea(d) {
  const t = fold([d.trich_yeu, d.so_hieu, d.but_phe].join(' '));
  const areas = store.all('linh_vuc');
  for (const [kw, nameRe] of AREA_RULES) {
    if (!kw.test(t)) continue;
    const a = areas.find((x) => nameRe.test(fold(x.ten)));
    if (a) return a;
  }
  return null;
}
function weekBucket(han) {
  if (!han) return 'Chưa có hạn';
  const d = dayOf(han), t = today();
  if (d < t) return 'Quá hạn';
  const wd = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const sun = addDays(t, 6 - wd), nextSun = addDays(sun, 7);
  return d <= sun ? 'Tuần này' : d <= nextSun ? 'Tuần sau' : 'Sau đó';
}
function docItem(d) {
  const area = d.linh_vuc_id && store.get('linh_vuc', d.linh_vuc_id);
  const sug = !area && d.trang_thai !== 'Xong' ? suggestArea(d) : null;
  const task = store.all('viec').find((v) => (v.van_ban_ids || []).includes(d.id));
  const proj = task?.du_an_id && store.get('du_an', task.du_an_id);
  return html`${docRow(d)}<li class="doc-para">${area ? html`<span class="tag">${area.bieu_tuong || '🗂'} ${area.ten}</span>` : sug ? html`<button class="chip sug" data-doc-area="${d.id}|${sug.id}">Gợi ý: ${sug.bieu_tuong || ''} ${sug.ten} ✓</button>` : html`<button class="chip" data-open="van_ban/${d.id}">＋ Chọn lĩnh vực</button>`}${proj ? html`<span class="tag">📁 ${proj.ten}</span>` : task ? html`<span class="tag">${task.trang_thai === 'Xong' ? '✓ việc xong' : '⏳ ' + task.trang_thai}</span>` : ''}</li>`;
}
export function docsView() {
  const f = ['open', 'track', 'info', 'done'].includes(docFilter) ? docFilter : 'open';
  const all = store.all('van_ban');
  const pick = {
    open: (d) => d.trang_thai !== 'Xong' && (d.vai_tro === 'Chủ trì' || d.vai_tro === 'Phối hợp'),
    track: (d) => d.trang_thai !== 'Xong' && d.yeu_cau_dv_gui,
    info: (d) => d.trang_thai !== 'Xong' && d.vai_tro !== 'Chủ trì' && d.vai_tro !== 'Phối hợp',
    done: (d) => d.trang_thai === 'Xong'
  };
  let docs = all.filter(pick[f]);
  let body;
  if (f === 'open') {
    docs.sort((a, b) => ((a.han_xu_ly || '9999') < (b.han_xu_ly || '9999') ? -1 : 1));
    const order = ['Quá hạn', 'Tuần này', 'Tuần sau', 'Sau đó', 'Chưa có hạn'];
    const g = {}; docs.forEach((d) => (g[weekBucket(d.han_xu_ly)] = g[weekBucket(d.han_xu_ly)] || []).push(d));
    body = order.filter((k) => g[k]).map((k) => section(k, g[k].map(docItem), { count: true }));
    if (!docs.length) body = html`<p class="empty big">Không còn văn bản cần xử lý 👏</p>`;
  } else {
    docs.sort((a, b) => (f === 'done' ? ((a.updated_at < b.updated_at) ? 1 : -1) : ((a.han_xu_ly || '9999') < (b.han_xu_ly || '9999') ? -1 : 1)));
    body = section(`${docs.length} văn bản`, (f === 'done' ? docs.slice(0, 100) : docs).map(f === 'done' ? docRow : docItem), { count: false, empty: 'Không có văn bản nào.' });
  }
  const n = (k) => all.filter(pick[k]).length;
  return html`
    <header class="page-head"><h1>Văn bản</h1><div class="filters" style="margin:0"><button class="btn btn-ghost" data-new="van_ban">＋ Văn bản</button></div></header>
    <div class="seg doc-tabs">${[['open', 'Cần làm'], ['track', 'Theo dõi'], ['info', 'Để biết'], ['done', 'Xong']].map(([k, l]) => html`<button class="${f === k ? 'on' : ''}" data-doc-filter="${k}">${l}${k !== 'done' && n(k) ? html` <small>${n(k)}</small>` : ''}</button>`)}</div>
    ${f === 'open' ? html`<p class="hint">Văn bản là đầu vào; việc là hành động. Xếp lĩnh vực cho từng văn bản (chạm gợi ý ✓). Văn bản nhiều bước → mở văn bản, chọn “Thành dự án”.</p>` : ''}
    ${body}`;
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

// Lớp lịch: 🏢 công ty (D-Office) · 👤 cá nhân · 🔔 lời nhắc (việc/hạn văn bản, mặc định tắt: đã có ở màn Việc)
const LAYERS_KEY = 'bnth.calLayers';
let layers = (() => { try { return { co: true, ca: true, nh: false, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || '{}') }; } catch { return { co: true, ca: true, nh: false }; } })();
export function toggleLayer(k) { layers = { ...layers, [k]: !layers[k] }; localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)); }
const COMPANY_CAL = /lịch công ty/i;
function itemsOn(day) {
  const allTasks = store.all('viec').filter((v) => dayOf(v.han) === day);
  const allDocs = store.all('van_ban').filter((d) => dayOf(d.han_xu_ly) === day);
  const tasks = layers.nh ? allTasks : [];
  const docs = layers.nh ? allDocs : [];
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
  const ev2 = events.filter((e) => (isDofEvent(e) ? layers.co : layers.ca));
  const g = gcal.eventsOn(day, gList).filter((e) => !COMPANY_CAL.test(gcal.calOf(e.lich_id)?.ten || '') && (DOF_TITLE.test(e.ten || '') ? layers.co : layers.ca));
  const remind = allTasks.filter((v) => v.trang_thai !== 'Xong').length + allDocs.filter((d) => d.trang_thai !== 'Xong' && !store.all('viec').some((v) => (v.van_ban_ids || []).includes(d.id))).length;
  return { tasks, docs, events: ev2, g, remind };
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
    <div class="cal-layers">${[['co', '🏢 Công ty'], ['ca', '👤 Cá nhân'], ['nh', '🔔 Lời nhắc']].map(([k, l]) => html`<button class="chip ${layers[k] ? 'on' : ''}" data-cal-layer="${k}">${l}</button>`)}</div>
    ${lunarCard(calDay, { compact: true })}
    ${section(`${weekdayName(calDay, true)} ${fmtDate(calDay, true)}`, [
      ...[...it.events.map((e) => [gcal.timeKey(e.bat_dau), eventRow(e)]), ...it.g.map((e) => [gcal.timeKey(e.bat_dau), gcal.gcalRow(e)])]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]),
      ...it.tasks.map((v) => taskRow(v)),
      ...it.docs.map(docRow),
      ...(!layers.nh && it.remind ? [html`<li class="row cal-remind"><a href="#/viec" data-rm-goto="sched">🔔 ${it.remind} lời nhắc đến hạn ngày này →</a></li>`] : [])
    ], { empty: 'Không có lịch. Chạm ＋ để thêm.', count: false })}`;
}

// ---------------- Tìm kiếm ----------------
// ---------------- Hỏi nhanh: sổ tay câu hỏi, mẫu đã dùng, mẹo mỗi ngày ----------------
const USED_KEY = 'bnth.askUsed';
export const askUsed = () => { try { return JSON.parse(localStorage.getItem(USED_KEY) || '[]'); } catch (e) { return []; } };
function markUsed(id) {
  if (!id) return;
  const u = askUsed();
  if (!u.includes(id)) { u.push(id); localStorage.setItem(USED_KEY, JSON.stringify(u)); }
}
function askTipCard() {
  if (localStorage.getItem('bnth.askTip') === today()) return '';
  const used = askUsed();
  const [, q, note] = tipOfDay(used, today());
  return html`<div class="ask-tip"><span>💡</span><button class="ask-tip-q" data-ask-go="${q}"><small>Hỏi thử trong ô Tìm · đã dùng ${used.filter((x) => BOOK_IDS.includes(x)).length}/${BOOK_IDS.length} mẫu</small><b>“${q}”</b>${note ? html`<small>${note}</small>` : ''}</button><button class="icon-btn sm" data-ask-tip-off aria-label="Ẩn hôm nay">✕</button></div>`;
}
function askBook() {
  const used = askUsed();
  const n = used.filter((x) => BOOK_IDS.includes(x)).length;
  return html`<div class="ask-book-h"><h4 class="ios-g">Sổ tay câu hỏi</h4><small>${n}/${BOOK_IDS.length} mẫu đã dùng</small></div>
    <div class="ask-prog"><i style="width:${Math.round(n / BOOK_IDS.length * 100)}%"></i></div>
    ${BOOK.map(([g, xs]) => html`<h5 class="hr-sub">${g}</h5><ul class="ios-list ask-list">${xs.map(([id, q, note]) => html`<li><button class="ask-row" data-ask="${q}"><span class="ask-ok ${used.includes(id) ? 'on' : ''}">${used.includes(id) ? '✓' : ''}</span><span class="ios-t">${q}${note ? html`<small>${note}</small>` : ''}</span><span class="ios-chev">›</span></button></li>`)}</ul>`)}
    <p class="hint">Mẹo: gõ không dấu cũng được; đổi tên đơn vị, người, tháng, ngày tùy ý. Câu nào app chưa hiểu thì vẫn tìm khắp dữ liệu như bình thường.</p>`;
}
const pick = (table, list) => list.map((r) => (table === 'viec' ? taskRow(r) : table === 'van_ban' ? docRow(r) : table === 'su_kien' ? eventRow(r) : genericRow(table, r)));
const sortOf = { viec: 'han', van_ban: 'han_xu_ly' };
function lifeCard(a) {
  const head = (ic, t, n) => html`<div class="ans-h"><span>${ic} ${t}</span>${n !== undefined ? html`<small>${n}</small>` : ''}</div>`;
  const ICON = { viec: '✅', van_ban: '📄', su_kien: '📅', ghi_chu: '🗒', inbox: '📥', du_an: '📁', sach: '📚', dia_diem: '📍', chuyen_di: '🧳', buoi_hoc: '🎓', nhat_ky_ngay: '🌙' };
  const lst = (t, list) => (list.length ? html`<ul class="list">${pick(t, sortOf[t] ? list.slice().sort(byWhen(sortOf[t])) : list).slice(0, 40)}</ul>` : html`<p class="empty">Không có.</p>`);
  if (a.kind === 'list') return html`<section class="ans">${head(ICON[a.table] || '🔎', a.tieu_de, a.list.length)}${lst(a.table, a.list)}</section>`;
  if (a.kind === 'hom_nay') return html`<section class="ans">${head('☀️', 'Hôm nay')}
    <h5 class="hr-sub">Lịch <small>${a.su_kien.length}</small></h5>${lst('su_kien', a.su_kien)}
    <h5 class="hr-sub">Việc hôm nay <small>${a.viec.length}</small></h5>${lst('viec', a.viec)}
    ${a.qua_han.length ? html`<h5 class="hr-sub">Quá hạn <small>${a.qua_han.length}</small></h5>${lst('viec', a.qua_han)}` : ''}
    ${a.van_ban.length ? html`<h5 class="hr-sub">Văn bản hạn trong 3 ngày <small>${a.van_ban.length}</small></h5>${lst('van_ban', a.van_ban)}` : ''}</section>`;
  if (a.kind === 'stats') return html`<section class="ans">${head('📊', a.tieu_de)}<div class="hr-kpis">${a.items.map(([v, l]) => html`<div class="hr-kpi"><b>${v}</b><small>${l}</small></div>`)}</div>
    ${a.list && a.list.length ? html`<div style="margin-top:10px">${lst(a.table, a.list)}</div>` : ''}</section>`;
  if (a.kind === 'thoi_quen') return html`<section class="ans">${head('🔁', a.tieu_de, a.items.filter((x) => x.xong).length + '/' + a.items.length)}
    <ul class="ios-list hr-kv">${a.items.map((x) => html`<li><span>${x.xong ? '✅' : '⚪️'} ${x.ten}</span><small>${x.chuoi ? '🔥 ' + x.chuoi + ' ngày' : ''}</small></li>`)}</ul></section>`;
  if (a.kind === 'the_hoc') return html`<section class="ans">${head('🀄', a.tieu_de, a.list.length)}
    ${a.list.length ? html`<ul class="ios-list hr-kv">${a.list.slice(0, 30).map((c) => html`<li><span><b>${c.cau}</b> ${c.pinyin ? html`<small>${c.pinyin}</small>` : ''}</span><small>${c.nghia || ''}</small></li>`)}</ul>` : html`<p class="empty">Hôm nay không có câu đến hạn ôn.</p>`}
    ${a.hay_quen.length ? html`<h5 class="hr-sub">Hay quên</h5><ul class="ios-list hr-kv">${a.hay_quen.map((c) => html`<li><span><b>${c.cau}</b> <small>${c.nghia || ''}</small></span><small>quên ${c.so_lan_quen} lần</small></li>`)}</ul>` : ''}
    <button class="link" data-flash="review">Ôn ngay ›</button></section>`;
  if (a.kind === 'danh_ba') return html`<section class="ans">${head('📇', a.tieu_de, a.nguoi.length + a.don_vi.length)}
    ${a.nguoi.length || a.don_vi.length ? html`<ul class="ios-list hr-kv">${a.nguoi.map((n) => html`<li><span>${n.ten}<small class="hr-d">${[n.chuc_vu, n.don_vi].filter(Boolean).join(' · ')}</small></span>${n.dien_thoai ? html`<a class="ans-tel" href="tel:${n.dien_thoai}">📞 ${n.dien_thoai}</a>` : html`<small>${n.email || ''}</small>`}</li>`)}
      ${a.don_vi.map((d) => html`<li><span>${d.ten}<small class="hr-d">${d.dau_moi ? 'Đầu mối: ' + d.dau_moi : ''}</small></span>${d.dien_thoai ? html`<a class="ans-tel" href="tel:${d.dien_thoai}">📞 ${d.dien_thoai}</a>` : html`<small>${d.email || ''}</small>`}</li>`)}</ul>` : html`<p class="empty">Không thấy trong danh bạ.</p>`}</section>`;
  if (a.kind === 'chua_gui') {
    const vb = Object.fromEntries(a.van_ban.map((d) => [d.id, d]));
    const dv = Object.fromEntries(store.all('don_vi').map((d) => [d.id, d]));
    const by = {}; a.list.forEach((x) => { (by[x.van_ban_id] = by[x.van_ban_id] || []).push(x); });
    return html`<section class="ans">${head('📮', a.tieu_de, a.list.length)}
      ${Object.keys(by).length ? Object.entries(by).map(([id, xs]) => html`<h5 class="hr-sub">${vb[id] ? vb[id].so_hieu + ' · ' + (vb[id].trich_yeu || '') : 'Văn bản'} <small>${xs.length}</small></h5>
        <p class="hr-note">${xs.map((x) => (dv[x.don_vi_id] || {}).ten || x.ten || '?').join(', ')}</p>`) : html`<p class="empty">Các đơn vị đã gửi đủ.</p>`}</section>`;
  }
  if (a.kind === 'gia') return html`<section class="ans">${head('💰', 'Tỉ giá & giá vàng')}<div class="tt-chips">${marketChips()}</div><button class="link" data-market>Chi tiết ›</button></section>`;
  return '';
}

export function searchView(q, rerender) {
  return html`
    <header class="page-head"><h1>Tìm kiếm</h1></header>
    <div class="search-box"><input id="search-input" type="search" placeholder="Tìm hoặc hỏi: định biên Cẩm Khê, QĐ 3887…" value="${q}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></div>
    <div id="search-results">${searchResults(q, rerender)}</div>`;
}

/** Phần kết quả (cập nhật riêng khi gõ, không vẽ lại ô gõ để bộ gõ tiếng Việt không bị ngắt). */
export function searchResults(q, rerender) {
  q = String(q || '').trim();
  const hr = hrForSearch(rerender);
  const ans = q ? understand(q, { hr, now: today(), all: (t) => store.all(t) }) : null;
  if (ans) markUsed(ans.mau);
  const hits = store.search(q);
  const groups = {};
  hits.forEach((h) => (groups[h.table] = groups[h.table] || []).push(h.rec));
  const HR_KINDS = ['don_vi', 'quyet_dinh', 'tong_quan', 'ho_so', 'bao_cao_cc', 'lanh_dao', 'cbql_tong', 'tieu_chuan', 'cho_so_lieu'];
  const hh = q && (!ans || !HR_KINDS.includes(ans.kind)) ? hrHits(q, hr) : { qd: [], don_vi: [], ho_so: [] };
  const hrN = hh.qd.length + hh.don_vi.length + hh.ho_so.length;
  const card = !ans ? '' : HR_KINDS.includes(ans.kind) ? answerHtml(ans) : lifeCard(ans);
  return html`${card}
    ${q ? (hits.length || hrN ? html`${hrN ? hrHitsHtml(hh) : ''}<div class="grid">${Object.entries(groups).map(([t, recs]) => section(TABLE_META[t].plural, recs.map((r) => (t === 'viec' ? taskRow(r) : t === 'van_ban' ? docRow(r) : t === 'su_kien' ? eventRow(r) : genericRow(t, r)))))}</div>`
      : ans ? '' : html`<p class="empty big">Không thấy kết quả cho “${q}”.</p>`)
      : askBook()}`;
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

/** Mục Thêm: danh sách nhóm kiểu Cài đặt iPhone, mỗi thứ một lối vào (không trùng với PARA). */
export function moreView() {
  const n = (t, f) => store.all(t).filter(f || (() => true)).length;
  const activeP = n('du_an', (d) => d.trang_thai === 'Đang làm' || d.trang_thai === 'Tạm dừng');
  const groups = [
    ['Công việc', [
      ['#/nhan-su', 'people', 'Nhân sự', hrSubtitle()]]],
    ['Tài chính', [
      ['#/tai-chinh', 'cash', 'Tài chính', financeSub()]]],
    ['Sắp xếp', [
      ['#/para', 'grid', 'Bản đồ PARA', `${activeP} dự án · ${n('linh_vuc')} lĩnh vực · chuyến đi`],
      ['#/bang/inbox', 'inbox', 'Inbox', `${n('inbox', (r) => !r.da_xu_ly)} chưa xử lý`],
      ['#/on-tuan', 'calendar', 'Ôn tuần', '15 phút chiều thứ 6']]],
    ['Bản thân', [
      ['#/tu-sach', 'book', 'Tủ sách', `${n('sach', (b) => b.trang_thai === 'Đã đọc' && String(b.xong_ngay || '').startsWith(today().slice(0, 4)))} cuốn năm nay`],
      ['#/ren-luyen', 'spark', 'Rèn luyện', 'thói quen, lộ trình học & tập'],
      ['#/nhat-ky', 'moon', 'Nhật ký & tâm trạng', 'tổng kết cuối ngày'],
      ['#/hanh-trinh', 'travel', 'Hành trình & địa điểm', `${n('chuyen_di')} chuyến · ${n('dia_diem')} địa điểm`]]],
    ['Tiện ích', [
      ['#/lich', 'calendar', 'Lịch & sự kiện', 'tháng này, lịch Google'],
      ['market', 'cash', 'Tỉ giá & vàng', 'USD, SJC, nhẫn 999.9'],
      ['#/danh-ba', 'user', 'Danh bạ', `${n('nguoi')} người · ${n('don_vi')} đơn vị`],
      ['#/cai-dat', 'settings', 'Cài đặt', 'giao diện, thông báo, D-Office']]]
  ];
  const row = ([href, ic, label, sub]) => href === 'market'
    ? html`<li><button class="ios-row" data-market><span class="ios-ic">${icon(ic)}</span><span class="ios-t">${label}<small>${sub}</small></span><span class="ios-chev">›</span></button></li>`
    : html`<li><a class="ios-row" href="${href}"><span class="ios-ic">${icon(ic)}</span><span class="ios-t">${label}<small>${sub}</small></span><span class="ios-chev">›</span></a></li>`;
  return html`<header class="page-head"><h1>Thêm</h1></header>
    ${groups.map(([g, rows]) => html`<h4 class="ios-g">${g}</h4><ul class="ios-list">${rows.map(row)}</ul>`)}
    <p class="hint center">Dự án, lĩnh vực và chuyến đi nằm trong Bản đồ PARA; sự kiện nằm trong Lịch; địa điểm nằm trong Hành trình.</p>`;
}

/** Danh bạ: Người liên hệ (gắn vào việc) + Đơn vị (47 đơn vị trực thuộc, dùng để theo dõi đơn vị gửi văn bản). */
let contactTab = 'nguoi';
export const setContactTab = (t) => { contactTab = t; };
export function contactsView() {
  const t = contactTab;
  let recs = store.all(t);
  if (t === 'don_vi') recs.sort((a, b) => (a.stt || 999) - (b.stt || 999));
  else recs.sort((a, b) => fold(a.ten || '').localeCompare(fold(b.ten || '')));
  return html`<header class="page-head"><h1>Danh bạ</h1><div class="filters" style="margin:0"><button class="btn btn-ghost" data-new="${t}">＋ ${t === 'nguoi' ? 'Người' : 'Đơn vị'}</button></div></header>
    <div class="seg" style="margin-bottom:10px">${[['nguoi', 'Người liên hệ'], ['don_vi', 'Đơn vị']].map(([k, l]) => html`<button class="${t === k ? 'on' : ''}" data-contact-tab="${k}">${l} <small>${store.all(k).length}</small></button>`)}</div>
    <p class="hint">${t === 'nguoi' ? 'Số điện thoại, chức vụ, đơn vị của người hay làm việc cùng. Gắn vào việc (mục “Người liên quan”) để biết cần gọi ai; Claude cũng tra được (“SĐT anh Hùng?”).' : 'Danh sách đơn vị trực thuộc. Dùng khi một văn bản yêu cầu các đơn vị gửi báo cáo: mở văn bản → chạm từng đơn vị để đánh dấu đã gửi.'}</p>
    ${section(`${recs.length} mục`, recs.map((r) => genericRow(t, r)), { count: false, empty: 'Chưa có gì ở đây.' })}`;
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
