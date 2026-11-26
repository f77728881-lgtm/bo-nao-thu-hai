// Việc kiểu Lời nhắc (Reminders) của iPhone, sắp theo PARA.
// Ô lọc nhanh: Hôm nay · Có hạn · Tất cả · D-Office · Chưa xếp · Đã xong.
// "Danh sách của tôi" = dự án đang chạy + lĩnh vực, chia nhóm Công việc / Cá nhân. Gõ thẳng "＋ Lời nhắc mới" cuối danh sách.
import * as store from './store.js';
import { html, raw, today, addDays, dayOf, fmtDate, weekdayName, whenLabel, fold } from './util.js';
import { toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { parse } from './quickadd.js';

const KEY = 'bnth.taskList';
let cur = localStorage.getItem(KEY) || 'today';
let mobileList = false;          // điện thoại: đang xem bên trong một danh sách
let showDone = false;
export const openTaskList = (k) => { cur = k; mobileList = true; localStorage.setItem(KEY, k); };

const open = (v) => v.trang_thai !== 'Xong';
const isDof = (v) => (v.van_ban_ids || []).length > 0;
const areaOf = (v) => v.linh_vuc_id || (v.du_an_id && store.get('du_an', v.du_an_id)?.linh_vuc_id) || '';
const ACTIVE = ['Đang làm', 'Tạm dừng'];

const SMART = [
  { k: 'today', name: 'Hôm nay', ic: 'today', color: '#007aff', f: (v) => open(v) && v.han && dayOf(v.han) <= today() },
  { k: 'sched', name: 'Có hạn', ic: 'calendar', color: '#ff3b30', f: (v) => open(v) && !!v.han },
  { k: 'all', name: 'Tất cả', ic: 'inbox', color: '#636366', f: open },
  { k: 'dof', name: 'D-Office', ic: 'doc', color: '#af52de', f: (v) => open(v) && isDof(v) },
  { k: 'loose', name: 'Chưa xếp', ic: 'list', color: '#ff9500', f: (v) => open(v) && !v.du_an_id && !v.linh_vuc_id },
  { k: 'done', name: 'Đã xong', ic: 'check', color: '#8e8e93', f: (v) => !open(v) }
];

/** Danh sách của tôi: dự án đang chạy và lĩnh vực, nhóm Công việc / Cá nhân. */
function myLists() {
  const areas = store.all('linh_vuc').sort((a, b) => (a.thu_tu || 99) - (b.thu_tu || 99));
  const nhom = (a) => (a?.nhom === 'Cá nhân' ? 'Cá nhân' : 'Công việc');
  const projects = store.all('du_an').filter((d) => ACTIVE.includes(d.trang_thai));
  const groups = { 'Công việc': [], 'Cá nhân': [] };
  projects.forEach((d) => groups[nhom(store.get('linh_vuc', d.linh_vuc_id))].push({ k: 'p:' + d.id, name: d.ten, kind: 'p', rec: d }));
  areas.forEach((a) => groups[nhom(a)].push({ k: 'a:' + a.id, name: a.ten, kind: 'a', rec: a }));
  return groups;
}
function listFilter(k) {
  const s = SMART.find((x) => x.k === k);
  if (s) return s.f;
  const [t, id] = k.split(':');
  if (t === 'p') return (v) => v.du_an_id === id;
  if (t === 'a') return (v) => !v.du_an_id && areaOf(v) === id; // việc trong dự án hiện ở danh sách dự án
  return open;
}
function listMeta(k) {
  const s = SMART.find((x) => x.k === k);
  if (s) return { name: s.name, color: s.color, smart: true };
  const [t, id] = k.split(':');
  const r = store.get(t === 'p' ? 'du_an' : 'linh_vuc', id);
  if (!r) return { name: 'Tất cả', color: '#636366', smart: true, gone: true };
  return { name: r.ten, color: t === 'p' ? '#34c759' : '#007aff', smart: false, rec: r, kind: t };
}

const byWhen = (a, b) => ((a.han || '9999') < (b.han || '9999') ? -1 : (a.han || '9999') > (b.han || '9999') ? 1 : (a.created_at < b.created_at ? -1 : 1));

function reminderRow(v, { context = true } = {}) {
  const done = !open(v);
  const late = !done && v.han && dayOf(v.han) < today();
  const proj = v.du_an_id && store.get('du_an', v.du_an_id);
  const area = !proj && areaOf(v) ? store.get('linh_vuc', areaOf(v)) : null;
  const note = String(v.mo_ta || '').replace(/^Tự tạo từ văn bản\s*/, '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  return html`<li class="rm-row ${done ? 'done' : ''} ${v._pending ? 'is-pending' : ''}">
    <button class="rm-check ${v.gap && v.quan_trong && !done ? 'hot' : ''}" data-toggle-task="${v.id}" aria-label="${done ? 'Bỏ đánh dấu' : 'Xong'}">${done ? raw('<i></i>') : ''}</button>
    <div class="rm-main" data-open="viec/${v.id}">
      <div class="rm-title">${v.gap && v.quan_trong && !done ? html`<b class="rm-flag">!!</b> ` : v.quan_trong && !done ? html`<b class="rm-flag">!</b> ` : ''}${v.ten}</div>
      ${note ? html`<div class="rm-note">${note.slice(0, 120)}</div>` : ''}
      <div class="rm-meta">${v.han ? html`<span class="${late ? 'late' : ''}">${whenLabel(v.han, { overdue: !done })}</span>` : ''}${context && proj ? html`<span>📁 ${proj.ten}</span>` : ''}${context && area ? html`<span>${area.bieu_tuong || '🗂'} ${area.ten}</span>` : ''}${isDof(v) ? html`<span>D-Office</span>` : ''}</div>
    </div>
    <button class="rm-info" data-open="viec/${v.id}" aria-label="Chi tiết">${icon('dots')}</button>
  </li>`;
}

function listBody(k) {
  const meta = listMeta(k);
  const f = listFilter(k);
  const all = store.all('viec').filter((v) => f(v));
  const doneN = k === 'done' ? 0 : store.all('viec').filter((v) => !open(v) && (meta.smart ? false : f(v))).length;
  let items = k === 'done' ? all.sort((a, b) => ((a.hoan_thanh_luc || a.updated_at) < (b.hoan_thanh_luc || b.updated_at) ? 1 : -1)).slice(0, 150)
    : all.filter((v) => (showDone ? true : open(v))).sort(byWhen);
  let groups;
  if (k === 'sched' || k === 'today') {
    const g = {};
    items.forEach((v) => {
      const d = dayOf(v.han);
      const lab = d < today() ? 'Quá hạn' : d === today() ? 'Hôm nay' : d === addDays(today(), 1) ? 'Ngày mai' : `${weekdayName(d, true)}, ${fmtDate(d)}`;
      (g[lab] = g[lab] || []).push(v);
    });
    groups = Object.entries(g);
  } else if (k === 'all' || k === 'loose' || k === 'dof') {
    const g = {};
    items.forEach((v) => { const p = v.du_an_id && store.get('du_an', v.du_an_id); const a = !p && areaOf(v) && store.get('linh_vuc', areaOf(v)); const lab = p ? '📁 ' + p.ten : a ? (a.bieu_tuong || '🗂') + ' ' + a.ten : 'Chưa xếp'; (g[lab] = g[lab] || []).push(v); });
    groups = Object.entries(g).sort((a, b) => (a[0] === 'Chưa xếp' ? -1 : b[0] === 'Chưa xếp' ? 1 : fold(a[0]).localeCompare(fold(b[0]))));
  } else groups = [['', items]];
  const r = meta.rec;
  return html`
    <header class="rm-head"><button class="rm-back" data-rm-back>‹ Danh sách</button>
      <h1 style="color:${meta.color}">${meta.name}</h1>
      ${meta.kind === 'p' && r ? html`<p class="rm-sub">${r.ket_qua ? `🎯 ${r.ket_qua}` : ''}${r.han ? ` · hạn ${fmtDate(r.han)}` : ''}${r.cau_hemingway ? html`<br>➡️ Lần sau: ${r.cau_hemingway}` : ''} <button class="link" data-open="du_an/${r.id}">Sửa dự án</button></p>` : ''}
      ${k !== 'done' ? html`<p class="rm-count">${all.filter((v) => !open(v)).length + doneN} đã xong · <button class="link" data-rm-showdone>${showDone ? 'Ẩn' : 'Hiện'}</button></p>` : ''}
    </header>
    ${groups.map(([lab, list]) => html`${lab ? html`<h4 class="rm-g">${lab}</h4>` : ''}<ul class="rm-list">${list.map((v) => reminderRow(v, { context: meta.smart }))}</ul>`)}
    ${!items.length ? html`<p class="rm-empty">${k === 'done' ? 'Chưa có việc đã xong.' : 'Không có lời nhắc.'}</p>` : ''}
    ${k !== 'done' ? html`<div class="rm-add"><span class="rm-check ghost"></span><input class="rm-new" data-rm-new placeholder="＋ Lời nhắc mới (vd: nộp báo cáo thứ 6 15h)" enterkeyhint="done" autocomplete="off"></div>` : ''}`;
}

export function tasksView() {
  if (!SMART.some((s) => s.k === cur) && !listMeta(cur).rec) cur = 'today';
  const all = store.all('viec');
  const groups = myLists();
  const count = (k) => all.filter(listFilter(k)).filter((v) => (k === 'done' ? true : open(v))).length;
  const side = html`<div class="rm-side">
    <div class="rm-tiles">${SMART.map((s) => html`<button class="rm-tile ${cur === s.k ? 'on' : ''}" data-rm-list="${s.k}"><span class="rm-ti" style="background:${s.color}">${icon(s.ic)}</span><b>${s.k === 'done' ? '' : count(s.k)}</b><span class="rm-tn">${s.name}</span></button>`)}</div>
    ${Object.entries(groups).map(([g, lists]) => lists.length ? html`<h4 class="rm-lg">${g}</h4><ul class="rm-lists">${lists.map((l) => html`<li><button class="rm-li ${cur === l.k ? 'on' : ''}" data-rm-list="${l.k}"><span class="rm-ti sm" style="background:${l.kind === 'p' ? '#34c759' : '#007aff'}">${l.kind === 'p' ? icon('folder') : raw(`<span class="rm-emo">${l.rec.bieu_tuong || '•'}</span>`)}</span><span class="rm-ln">${l.name}</span><em>${count(l.k) || ''}</em></button></li>`)}</ul>` : '')}
    <div class="rm-side-foot"><button class="link" data-new="du_an">＋ Dự án</button><button class="link" data-new="linh_vuc">＋ Lĩnh vực</button></div>
  </div>`;
  return html`<div class="rm ${mobileList ? 'in-list' : ''}">${side}<section class="rm-body">${listBody(cur)}</section></div>`;
}

export function bindTasks(root, rerender) {
  root.querySelectorAll('[data-rm-list]').forEach((b) => b.addEventListener('click', () => { openTaskList(b.dataset.rmList); showDone = false; rerender(); window.scrollTo(0, 0); }));
  root.querySelector('[data-rm-back]')?.addEventListener('click', () => { mobileList = false; rerender(); });
  root.querySelector('[data-rm-showdone]')?.addEventListener('click', () => { showDone = !showDone; rerender(); });
  const inp = root.querySelector('[data-rm-new]');
  inp?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    e.preventDefault();
    const p = parse(inp.value, { areas: store.all('linh_vuc'), projects: store.all('du_an') });
    const data = { ten: (p.title || inp.value).trim(), ...(p.type === 'viec' || !p.type ? p.data : {}) };
    data.ten = data.ten || inp.value.trim();
    delete data.tieu_de; delete data.noi_dung;
    const [t, id] = cur.split(':');
    if (t === 'p') { data.du_an_id = id; const pr = store.get('du_an', id); if (pr?.linh_vuc_id && !data.linh_vuc_id) data.linh_vuc_id = pr.linh_vuc_id; }
    if (t === 'a' && !data.linh_vuc_id) data.linh_vuc_id = id;
    if (cur === 'today' && !data.han) data.han = today();
    inp.value = '';
    try { await store.create('viec', data); toast('Đã thêm lời nhắc', { kind: 'ok' }); } catch (err) { errorToast(err); }
    setTimeout(() => document.querySelector('[data-rm-new]')?.focus(), 120);
  });
}
