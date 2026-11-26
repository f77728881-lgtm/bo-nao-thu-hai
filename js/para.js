// Bản đồ PARA (Tiago Forte, "Building a Second Brain"): Dự án · Lĩnh vực · Tài nguyên · Lưu trữ.
// Một màn nhìn toàn cảnh: dự án đang chạy (có kết quả + hạn), ý tưởng để sau, lĩnh vực nào đang bị bỏ quên,
// tài nguyên theo chủ đề, và lưu trữ dự án xong bằng một chạm (việc + ghi chú đi theo, không mất gì).
import * as store from './store.js';
import { html, raw, today, diffDays, fmtDate, dayOf, fold } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { paraOf, setNotesTab } from './notes.js';
import { effectiveStatus } from './travel.js';

const ACTIVE = ['Đang làm', 'Tạm dừng'];
const openTasks = (f) => store.all('viec').filter((v) => v.trang_thai !== 'Xong' && f(v));
const notesOf = (f) => store.all('ghi_chu').filter(f);
const lastTouch = (list) => list.reduce((m, r) => ((r.updated_at || '') > m ? r.updated_at : m), '');

function projectCard(d) {
  const t = today();
  const tasks = openTasks((v) => v.du_an_id === d.id);
  const late = tasks.filter((v) => v.han && dayOf(v.han) < t).length;
  const notes = notesOf((n) => n.du_an_id === d.id).length;
  const area = d.linh_vuc_id ? store.get('linh_vuc', d.linh_vuc_id) : null;
  const left = d.han ? diffDays(t, d.han) : null;
  const missing = [!d.ket_qua && 'kết quả', !d.han && 'hạn'].filter(Boolean);
  return html`<article class="card pa-proj ${d.trang_thai === 'Tạm dừng' ? 'paused' : ''}">
    <div class="pa-head" data-open="du_an/${d.id}"><b>${d.ten}</b>
      <small class="row-meta">${area ? `${area.bieu_tuong || '🗂'} ${area.ten} · ` : ''}${d.trang_thai}${left !== null ? html` · <span class="${left < 0 ? 'pa-late' : left <= 3 ? 'pa-soon' : ''}">${left < 0 ? `trễ ${-left} ngày` : left === 0 ? 'hạn hôm nay' : `còn ${left} ngày`}</span>` : ''}</small></div>
    ${d.ket_qua ? html`<p class="pa-goal">🎯 ${d.ket_qua}</p>` : ''}
    ${missing.length ? html`<p class="pa-warn">Thiếu ${missing.join(' và ')} — dự án cần cả hai.</p>` : ''}
    ${d.cau_hemingway ? html`<p class="row-meta">➡️ Lần sau: ${d.cau_hemingway}</p>` : ''}
    <div class="pa-foot"><span class="row-meta">${tasks.length} việc mở${late ? html` · <b class="pa-late">${late} trễ</b>` : ''} · ${notes} ghi chú</span><span class="spacer"></span>
      <button class="btn btn-ghost" data-pa-done="${d.id}">✓ Xong & lưu trữ</button></div>
  </article>`;
}

export function paraView() {
  const t = today();
  const projects = store.all('du_an');
  const active = projects.filter((d) => ACTIVE.includes(d.trang_thai)).sort((a, b) => (a.han || '9') < (b.han || '9') ? -1 : 1);
  const later = projects.filter((d) => d.trang_thai === 'Ý tưởng');
  const allTrips = store.all('chuyen_di').map((t) => ({ ...t, _st: effectiveStatus(t) }));
  const trips = allTrips.filter((t) => ['Lên kế hoạch', 'Sẵn sàng', 'Đang đi'].includes(t._st)).sort((a, b) => ((a.tu_ngay || '9') < (b.tu_ngay || '9') ? -1 : 1));
  const pastTrips = allTrips.filter((t) => t._st === 'Đã đi').length;
  const done = projects.filter((d) => d.trang_thai === 'Xong').sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const areas = store.all('linh_vuc').sort((a, b) => (a.nhom || '').localeCompare(b.nhom || '') || (a.thu_tu || 99) - (b.thu_tu || 99));
  const notes = store.all('ghi_chu').filter((n) => !(n.nhan || []).includes('#Prompt'));
  const resources = {};
  notes.filter((n) => paraOf(n) === '@tai_nguyen').forEach((n) => {
    const k = (n.nhan || []).find((x) => !/^#/.test(x)) || 'Chưa có chủ đề';
    resources[k] = (resources[k] || 0) + 1;
  });
  const inboxN = notes.filter((n) => paraOf(n) === '#0_Inbox').length;
  const looseTasks = openTasks((v) => !v.du_an_id && !v.linh_vuc_id && !(v.van_ban_ids || []).length).length;

  const areaCard = (a) => {
    const ps = active.filter((d) => d.linh_vuc_id === a.id);
    const ts = openTasks((v) => v.linh_vuc_id === a.id || (v.du_an_id && store.get('du_an', v.du_an_id)?.linh_vuc_id === a.id));
    const ns = notes.filter((n) => n.linh_vuc_id === a.id);
    const habits = store.all('thoi_quen').filter((h) => h.linh_vuc_id === a.id && h.trang_thai === 'Đang theo');
    const programs = store.all('lo_trinh').filter((l) => l.linh_vuc_id === a.id && l.trang_thai === 'Đang học');
    const books = store.all('sach').filter((b) => b.linh_vuc_id === a.id && b.trang_thai === 'Đang đọc');
    const touched = lastTouch([...store.all('viec').filter((v) => v.linh_vuc_id === a.id), ...ns, ...projects.filter((d) => d.linh_vuc_id === a.id), ...store.all('diem_danh').filter((d) => habits.some((h) => h.id === d.thoi_quen_id))]);
    const idle = touched ? diffDays(touched.slice(0, 10), t) : null;
    return html`<article class="card pa-area">
      <div class="pa-head"><b>${a.bieu_tuong || '🗂'} ${a.ten}</b><small class="row-meta">${a.nhom || ''}</small></div>
      <p class="row-meta">${ps.length ? ps.map((d) => d.ten).join(' · ') : 'Không có dự án đang chạy'}</p>
      ${habits.length || programs.length || books.length ? html`<ul class="pa-items">
        ${habits.map((h) => html`<li data-open="thoi_quen/${h.id}">${h.bieu_tuong || '🔁'} ${h.ten}</li>`)}
        ${programs.map((l) => html`<li data-open="lo_trinh/${l.id}">🧭 ${l.ten}</li>`)}
        ${books.map((b) => html`<li data-book-link="${b.id}">📕 ${b.ten} · ${b.trang_hien_tai || 0}/${b.so_trang || '?'}</li>`)}</ul>` : ''}
      <p class="row-meta">${ts.length} việc mở · ${ns.length} ghi chú${idle !== null && idle > 30 ? html` · <b class="pa-soon">${idle} ngày chưa động tới</b>` : idle === null ? html` · <b class="pa-soon">chưa có gì</b>` : ''}</p>
    </article>`;
  };

  return html`
    <header class="page-head"><h1>Bản đồ PARA</h1><div class="filters" style="margin:0"><button class="btn" data-new="du_an">＋ Dự án</button></div></header>
    <p class="hint">Xếp mọi thứ theo nơi sẽ <b>dùng tới</b>: Dự án (có kết quả + hạn) → Lĩnh vực (trách nhiệm lâu dài) → Tài nguyên (chủ đề quan tâm) → Lưu trữ.</p>
    ${inboxN || looseTasks ? html`<p class="pa-inbox">📥 ${inboxN ? html`<a href="#/ghi-chu" data-pa-notes="#0_Inbox">${inboxN} ghi chú chưa xếp</a>` : ''}${inboxN && looseTasks ? ' · ' : ''}${looseTasks ? html`<a href="#/viec">${looseTasks} việc chưa gắn dự án/lĩnh vực</a>` : ''}</p>` : ''}

    <h2 class="pa-h">${icon('folder')} Dự án đang chạy <small>${active.length}${active.length > 12 ? ' — nhiều quá, nên dồn bớt sang “Để sau”' : ''}</small><span class="spacer"></span><a class="pa-link" href="#/bang/du_an">Tất cả</a></h2>
    ${active.length ? html`<div class="grid">${active.map(projectCard)}</div>` : html`<p class="empty">Chưa có dự án đang chạy. Dự án = một kết quả cụ thể + hạn chót (vd “Kế hoạch đào tạo 2027 được duyệt trước 15/12”).</p>`}

    ${trips.length ? html`<h3 class="pa-sub">✈️ Chuyến đi <small>dự án cá nhân có ngày đi – ngày về</small><span class="spacer"></span><a class="pa-link" href="#/hanh-trinh">Hành trình & địa điểm</a></h3>
      <ul class="list card">${trips.map((t) => html`<li class="row" data-trip="${t.id}"><div class="row-main"><div class="row-title">${t.ten}</div><div class="row-meta">${t._st}${t.tu_ngay ? ` · ${fmtDate(t.tu_ngay)}${t.den_ngay ? '–' + fmtDate(t.den_ngay) : ''}` : ''}${t.diem_den ? ` · ${t.diem_den}` : ''}</div></div></li>`)}</ul>`
      : html`<p class="pa-sub-empty">✈️ Chuyến đi cũng là dự án: <a class="pa-link" href="#/hanh-trinh">mở Hành trình & địa điểm</a></p>`}

    ${later.length ? html`<h2 class="pa-h">💤 Để sau <small>${later.length} ý tưởng chưa cam kết</small></h2>
      <ul class="list card">${later.map((d) => html`<li class="row"><div class="row-main" data-open="du_an/${d.id}"><div class="row-title">${d.ten}</div><div class="row-meta">${d.ket_qua || ''}</div></div><button class="btn btn-ghost" data-pa-start="${d.id}">▶ Bắt đầu</button></li>`)}</ul>` : ''}

    <h2 class="pa-h">${icon('grid')} Lĩnh vực <small>${areas.length} trách nhiệm lâu dài</small><span class="spacer"></span><a class="pa-link" href="#/bang/linh_vuc">Sửa</a><button class="pa-link btn-link" data-new="linh_vuc">＋ Thêm</button></h2>
    <div class="grid">${areas.map(areaCard)}</div>

    <h2 class="pa-h">${icon('book')} Tài nguyên <small>chủ đề quan tâm</small></h2>
    ${Object.keys(resources).length ? html`<div class="pa-chips">${Object.entries(resources).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<a class="chip" href="#/ghi-chu" data-pa-notes="@tai_nguyen">${k === 'Chưa có chủ đề' ? k : '🏷 ' + k} <em>${n}</em></a>`)}</div>` : html`<p class="empty">Chưa có. Ghi chú tham khảo (luật, mẫu văn bản, HSK…) để ở Tài nguyên kèm một nhãn chủ đề.</p>`}

    <h2 class="pa-h">${icon('list')} Lưu trữ <small>${done.length} dự án đã xong${pastTrips ? ` · ${pastTrips} chuyến đã đi` : ''}</small></h2>
    ${done.length ? html`<ul class="list card">${done.slice(0, 12).map((d) => html`<li class="row"><div class="row-main" data-open="du_an/${d.id}"><div class="row-title">${d.ten}</div><div class="row-meta">xong ${fmtDate((d.updated_at || '').slice(0, 10), true)} · ${notesOf((n) => n.du_an_id === d.id).length} ghi chú</div></div><button class="btn btn-ghost" data-pa-reopen="${d.id}">Mở lại</button></li>`)}</ul>` : html`<p class="empty">Dự án xong sẽ vào đây cùng việc và ghi chú của nó.</p>`}`;
}

function finishProject(id) {
  const d = store.get('du_an', id);
  if (!d) return;
  const tasks = openTasks((v) => v.du_an_id === id);
  const notes = notesOf((n) => n.du_an_id === id).length;
  const box = document.createElement('div');
  box.innerHTML = html`<p><b>${d.ten}</b> chuyển sang Lưu trữ. ${notes} ghi chú của dự án vào Lưu trữ theo, vẫn tìm lại được.</p>
    ${tasks.length ? html`<label class="switch"><input type="checkbox" data-pa-alltasks checked><span></span> Đánh dấu xong ${tasks.length} việc còn mở</label>` : ''}
    <label class="ne-lab2">Bài học / kết quả (không bắt buộc)<textarea data-pa-note rows="3" placeholder="Điều làm tốt, điều lần sau làm khác…"></textarea></label>
    <div class="form-actions"><span class="spacer"></span><button class="btn btn-primary" data-pa-ok>✓ Lưu trữ dự án</button></div>`.__raw;
  const sheet = openSheet(box, { title: 'Hoàn thành dự án' });
  box.querySelector('[data-pa-ok]').onclick = async () => {
    const closeTasks = box.querySelector('[data-pa-alltasks]')?.checked;
    const lesson = box.querySelector('[data-pa-note]').value.trim();
    sheet.close();
    try {
      await store.update('du_an', id, { trang_thai: 'Xong', ...(lesson ? { mo_ta: [d.mo_ta, 'Bài học: ' + lesson].filter(Boolean).join('\n\n') } : {}) });
      if (closeTasks) for (const v of tasks) await store.update('viec', v.id, { trang_thai: 'Xong' });
      toast(`🎉 Đã xong “${d.ten}”`, { kind: 'ok', actionLabel: 'Hoàn tác', onAction: () => store.update('du_an', id, { trang_thai: d.trang_thai }) });
    } catch (e) { errorToast(e); }
  };
}

export function bindPara(root) {
  root.querySelectorAll('[data-pa-done]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); finishProject(b.dataset.paDone); }));
  root.querySelectorAll('[data-pa-start]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const d = store.get('du_an', b.dataset.paStart);
    try {
      await store.update('du_an', d.id, { trang_thai: 'Đang làm' });
      toast(d.han && d.ket_qua ? `▶ “${d.ten}” thành dự án đang chạy` : 'Đã bắt đầu — nhớ ghi kết quả mong muốn và hạn chót', { kind: 'ok' });
    } catch (err) { errorToast(err); }
  }));
  root.querySelectorAll('[data-pa-reopen]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); store.update('du_an', b.dataset.paReopen, { trang_thai: 'Đang làm' }).catch(errorToast); }));
  root.querySelectorAll('[data-book-link]').forEach((x) => x.addEventListener('click', () => { location.hash = '#/tu-sach'; }));
  root.querySelectorAll('[data-pa-notes]').forEach((a) => a.addEventListener('click', () => setNotesTab(a.dataset.paNotes)));
}

export { fold, raw };
