// Rèn luyện: thói quen (tick hằng ngày, chuỗi ngày, bản đồ nhiệt) + lộ trình học/tập theo buổi có giáo án.
import * as store from './store.js';
import { html, raw, today, addDays, diffDays, fmtDate, weekdayName, fold } from './util.js';
import { openSheet, toast, errorToast, closeSheet } from './ui.js';
import { openRecord } from './form.js';
import { icon } from './icons.js';
import { copyText } from './notes.js';

let tab = 'habits';
export const setTrainingTab = (t) => { tab = t; };

// ---------------- Thói quen ----------------
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const activeHabits = () => store.all('thoi_quen').filter((h) => h.trang_thai !== 'Đã xong');

function checkins(habitId) {
  const set = new Map();
  store.all('diem_danh').forEach((d) => { if (d.thoi_quen_id === habitId) set.set(d.ngay, d); });
  return set;
}

/** Thói quen có cần làm vào ngày này không. */
export function dueOn(h, ymd) {
  if (h.trang_thai !== 'Đang theo') return false;
  if (h.bat_dau && ymd < h.bat_dau) return false;
  const wd = WD[new Date(ymd + 'T00:00:00Z').getUTCDay()];
  if (h.tan_suat === 'Ngày thường') return !['T7', 'CN'].includes(wd);
  if (h.tan_suat === 'Chọn ngày') return (h.ngay_trong_tuan || []).includes(wd);
  return true; // Hằng ngày, X lần/tuần
}

export function streak(h) {
  const days = checkins(h.id);
  let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0, guard = 0;
  while (guard++ < 1000) {
    if (days.has(d)) { n++; d = addDays(d, -1); continue; }
    if (!dueOn(h, d) && d >= (h.bat_dau || '0000')) { d = addDays(d, -1); continue; } // ngày nghỉ không làm đứt chuỗi
    break;
  }
  return n;
}

function weekCount(h) {
  const t = today();
  const monday = addDays(t, -((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7));
  let n = 0; for (const d of checkins(h.id).keys()) if (d >= monday && d <= t) n++;
  return n;
}

/** Hàng chip tick nhanh cho màn Hôm nay. */
export function habitStrip() {
  const t = today();
  const list = activeHabits().filter((h) => dueOn(h, t) || h.tan_suat === 'X lần/tuần');
  if (!list.length) return raw('');
  return html`<section class="card habits-today"><h3 class="card-title">${icon('check')} Thói quen hôm nay</h3>
    <div class="habit-chips">${list.map((h) => {
      const done = checkins(h.id).has(t);
      const s = streak(h);
      return html`<button class="habit-chip ${done ? 'done' : ''}" data-habit-toggle="${h.id}" aria-pressed="${done}">
        <span class="hc-ic">${done ? icon('check') : h.bieu_tuong || '•'}</span><span class="hc-name">${h.ten}${h.gio_nhac ? html` <small>${h.gio_nhac}</small>` : ''}</span>${s ? html`<span class="hc-streak">🔥${s}</span>` : ''}</button>`;
    })}</div></section>`;
}

function heatmap(h, weeks = 18) {
  const days = checkins(h.id);
  const t = today();
  const end = addDays(t, 6 - ((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7)); // chủ nhật tuần này
  const start = addDays(end, -(weeks * 7) + 1);
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const st = d > t ? 'future' : days.has(d) ? 'on' : dueOn(h, d) ? 'miss' : 'off';
    cells.push(html`<i class="hm ${st}" title="${fmtDate(d, true)}"></i>`);
  }
  return html`<div class="heatmap" style="--weeks:${weeks}">${cells}</div>`;
}

function habitCard(h) {
  const t = today();
  const days = checkins(h.id);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const freq = h.tan_suat === 'Chọn ngày' ? (h.ngay_trong_tuan || []).join(', ') : h.tan_suat === 'X lần/tuần' ? `${h.so_lan_tuan || '?'} lần/tuần · tuần này ${weekCount(h)}` : h.tan_suat;
  return html`<article class="card habit" data-open="thoi_quen/${h.id}">
    <div class="habit-head"><span class="habit-emoji">${h.bieu_tuong || '•'}</span>
      <div class="row-main"><h3>${h.ten}</h3><p class="row-meta">${freq}${h.gio_nhac ? ` · ${h.gio_nhac}` : ''}${h.muc_tieu ? ` · ${h.muc_tieu}` : ''}</p></div>
      <div class="habit-streak"><b>${streak(h)}</b><small>ngày liên tục</small></div></div>
    <div class="week-dots">${last7.map((d) => html`<button class="wdot ${days.has(d) ? 'on' : dueOn(h, d) ? '' : 'rest'}" data-habit-day="${h.id}|${d}" title="${fmtDate(d)}"><small>${weekdayName(d)}</small><span>${days.has(d) ? icon('check') : +d.slice(8)}</span></button>`)}</div>
    ${heatmap(h)}
  </article>`;
}

// ---------------- Lộ trình ----------------
const sessionsOf = (ltId) => store.all('buoi_hoc').filter((b) => b.lo_trinh_id === ltId)
  .sort((a, b) => (a.tuan || 0) - (b.tuan || 0) || (a.thu_tu || 0) - (b.thu_tu || 0) || ((a.ngay || '') < (b.ngay || '') ? -1 : 1));

/** Buổi của hôm nay; không có thì buổi chưa học gần nhất. */
export function sessionFor(lt, ymd = today()) {
  const ss = sessionsOf(lt.id);
  return ss.find((b) => b.ngay === ymd) || ss.find((b) => b.trang_thai === 'Chưa học' && (!b.ngay || b.ngay >= ymd)) || null;
}

/** Thẻ "Buổi hôm nay" cho màn Hôm nay. */
export function todaySessions() {
  const t = today();
  const items = store.all('lo_trinh').filter((l) => l.trang_thai === 'Đang học').map((l) => ({ l, b: sessionFor(l, t) })).filter((x) => x.b);
  if (!items.length) return raw('');
  return html`<section class="card"><h3 class="card-title">${icon('spark')} Buổi học & tập</h3><ul class="list">${items.map(({ l, b }) => html`
    <li class="row session ${b.trang_thai === 'Đã xong' ? 'is-done' : ''}" data-session="${b.id}">
      <div class="doc-icon">${icon(l.loai === 'Tập luyện' ? 'today' : 'note')}</div>
      <div class="row-main"><div class="row-title">${b.tieu_de}</div>
        <div class="row-meta"><span>${l.ten}</span>${b.ngay && b.ngay !== t ? html`<span class="due">${fmtDate(b.ngay)}</span>` : ''}${b.gio ? html`<span>${b.gio}</span>` : ''}${b.trang_thai === 'Đã xong' ? html`<span class="tag st-done">Đã xong</span>` : ''}</div></div></li>`)}</ul></section>`;
}

function programCard(l) {
  const ss = sessionsOf(l.id);
  const done = ss.filter((b) => b.trang_thai === 'Đã xong').length;
  const pct = ss.length ? Math.round((100 * done) / ss.length) : 0;
  const next = sessionFor(l);
  const week = l.bat_dau ? Math.min(Math.max(1, Math.floor(diffDays(l.bat_dau, today()) / 7) + 1), l.so_tuan || 99) : null;
  return html`<article class="card program" data-program="${l.id}">
    <p class="lesson-meta">${l.loai}${week ? ` · Tuần ${week}/${l.so_tuan || '?'}` : ''} · ${l.trang_thai}</p>
    <h3>${l.ten}</h3>${l.muc_tieu ? html`<p class="row-meta">${l.muc_tieu}</p>` : ''}
    <div class="progress"><span style="width:${pct}%"></span><em>${done}/${ss.length} buổi · ${pct}%</em></div>
    ${next ? html`<p class="next-session">Tiếp theo: <b>${next.tieu_de}</b>${next.ngay ? ` · ${fmtDate(next.ngay)}` : ''}</p>` : ''}
  </article>`;
}

export function trainingView() {
  let body;
  if (tab === 'programs') {
    const lts = store.all('lo_trinh').sort((a, b) => (a.trang_thai === 'Đang học' ? -1 : 1) - (b.trang_thai === 'Đang học' ? -1 : 1));
    body = lts.length ? html`<div class="grid">${lts.map(programCard)}</div>` : html`<p class="empty big">Chưa có lộ trình. Nhắn Claude “lập lộ trình học … 8 tuần” để có giáo án từng buổi.</p>`;
  } else {
    const hs = activeHabits();
    body = hs.length ? html`<div class="grid">${hs.map(habitCard)}</div>` : html`<p class="empty big">Chưa có thói quen nào. Bấm “+ Thói quen” để bắt đầu.</p>`;
  }
  return html`
    <header class="page-head"><h1>Rèn luyện</h1>
      <div class="filters" style="margin:0"><button class="btn btn-ghost" data-new="${tab === 'programs' ? 'lo_trinh' : 'thoi_quen'}">+ ${tab === 'programs' ? 'Lộ trình' : 'Thói quen'}</button></div></header>
    <div class="seg" style="margin-bottom:14px">${[['habits', 'Thói quen'], ['programs', 'Lộ trình']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-training-tab="${k}">${l}</button>`)}</div>
    ${tab === 'habits' ? habitStrip() : todaySessions()}
    ${body}`;
}

// ---------------- Thao tác ----------------
export async function toggleHabit(id, ymd = today()) {
  const existing = store.all('diem_danh', { archived: true }).find((d) => d.thoi_quen_id === id && d.ngay === ymd);
  try {
    if (existing && !existing.archived) { await store.archive('diem_danh', existing.id); }
    else if (existing) { await store.restore('diem_danh', existing.id); }
    else {
      await store.create('diem_danh', { thoi_quen_id: id, ngay: ymd });
      const h = store.get('thoi_quen', id);
      const s = h ? streak(h) : 0;
      if (s && s % 7 === 0) toast(`🔥 ${s} ngày liên tục! Giữ vững nhé`, { kind: 'ok' });
    }
  } catch (err) { errorToast(err); }
}

export function bindTraining(root, rerender) {
  root.querySelectorAll('[data-training-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.trainingTab; rerender(); }));
  root.querySelectorAll('[data-habit-day]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); const [id, d] = b.dataset.habitDay.split('|'); toggleHabit(id, d);
  }));
  root.querySelectorAll('[data-program]').forEach((c) => c.addEventListener('click', () => openProgram(c.dataset.program)));
}

// ---------------- Giáo án: hiển thị nội dung dạng Markdown đơn giản ----------------
export function md(text) {
  const lines = String(text || '').split('\n');
  let out = '', list = null;
  const inline = (s) => html`${s}`.__raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const ln of lines) {
    let m;
    if ((m = ln.match(/^#{2,4}\s+(.*)/))) { close(); out += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!ln.trim()) { close(); }
    else { close(); out += `<p>${inline(ln)}</p>`; }
  }
  close();
  return raw(out);
}

/** Prompt luyện nói với AI cho buổi tiếng Trung. */
function speakingPrompt(b, l) {
  return `Bạn là Lý Minh, đồng nghiệp người Trung Quốc thân thiện. Tôi là người Việt học tiếng Trung giao tiếp sơ cấp (đang học "${l.ten}").
Chủ đề hôm nay: ${b.tieu_de.replace(/^T\d+\s*·\s*/, '')}.
${b.muc_tieu ? 'Câu mẫu: ' + b.muc_tieu + '\n' : ''}Cách luyện:
- Mỗi lượt bạn chỉ nói 1–2 câu ngắn bằng tiếng Trung, kèm pinyin, rồi hỏi tôi một câu.
- Tôi trả lời bằng tiếng Trung. Nếu tôi sai, sửa ngắn gọn (câu đúng + pinyin + nghĩa tiếng Việt) rồi tiếp tục.
- Nếu tôi trả lời quá ngắn, nhắc tôi nói cả câu.
- Sau 10 lượt, đánh giá: số lượt đúng, lỗi thường gặp, 5 câu cần ôn (kèm pinyin, nghĩa), mức tự tin 1–5.
Bắt đầu tình huống ngay.`;
}

export function openSession(id) {
  const b = store.get('buoi_hoc', id);
  if (!b) return;
  const l = store.get('lo_trinh', b.lo_trinh_id) || {};
  const isLang = l.loai === 'Học';
  const box = document.createElement('div');
  box.className = 'lesson';
  box.innerHTML = html`
    <p class="lesson-meta">${l.ten || ''}${b.tuan ? ` · Tuần ${b.tuan}` : ''}${b.ngay ? ` · ${weekdayName(b.ngay, true)} ${fmtDate(b.ngay)}` : ''}${b.gio ? ` · ${b.gio}` : ''}</p>
    ${b.muc_tieu ? html`<div class="lesson-goal">${b.muc_tieu}</div>` : ''}
    <div class="lesson-body">${md(b.noi_dung || l.cach_hoc || 'Chưa có giáo án chi tiết cho buổi này. Nhắn Claude “soạn giáo án buổi này” để bổ sung.')}</div>
    ${b.bai_tap ? html`<h4>Bài tập</h4><div class="lesson-body">${md(b.bai_tap)}</div>` : ''}
    ${b.tai_lieu ? html`<p><a href="${b.tai_lieu}" target="_blank" rel="noopener">${icon('doc')} Tài liệu</a></p>` : ''}
    ${isLang ? html`<div class="ai-row"><button class="btn btn-ghost" data-speak="claude">${icon('spark')} Luyện nói với Claude</button><button class="btn btn-ghost" data-speak="chatgpt">ChatGPT</button><button class="btn btn-ghost" data-speak="copy">${icon('copy')} Chép prompt</button></div>` : ''}
    <div class="lesson-done">
      <h4>${b.trang_thai === 'Đã xong' ? 'Đã hoàn thành' : 'Hoàn thành buổi này'}</h4>
      <div class="opts">${[1, 2, 3, 4, 5].map((n) => html`<button class="opt ${b.danh_gia === n ? 'on' : ''}" data-rate="${n}">${n}</button>`)}<span class="hint">${isLang ? 'mức tự tin' : 'độ khó'} 1–5</span></div>
      <textarea class="lesson-note" rows="3" placeholder="${isLang ? 'Câu nói tốt, lỗi hay gặp, câu cần ôn…' : 'Số hiệp/lần làm được, cảm giác, đau mỏi…'}">${b.cam_nhan || ''}</textarea>
      <div class="form-actions"><button class="btn btn-ghost" data-edit>Sửa giáo án</button>${b.trang_thai !== 'Đã xong' ? html`<button class="btn btn-ghost" data-skip>Bỏ qua</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-finish>${b.trang_thai === 'Đã xong' ? 'Lưu' : 'Xong buổi'}</button></div>
    </div>`.__raw;
  const sheet = openSheet(box, { title: b.tieu_de });
  let rate = b.danh_gia || null;
  box.querySelectorAll('[data-rate]').forEach((r) => r.onclick = () => { rate = +r.dataset.rate; box.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('on', x === r)); });
  box.querySelectorAll('[data-speak]').forEach((btn) => btn.onclick = async () => {
    const p = speakingPrompt(b, l);
    await copyText(p);
    if (btn.dataset.speak === 'claude') window.open('https://claude.ai/new?q=' + encodeURIComponent(p), '_blank', 'noopener');
    else if (btn.dataset.speak === 'chatgpt') window.open('https://chatgpt.com/?q=' + encodeURIComponent(p), '_blank', 'noopener');
    toast('Đã chép prompt luyện nói');
  });
  box.querySelector('[data-edit]').onclick = () => { closeSheet(); setTimeout(() => openRecord('buoi_hoc', b.id), 200); };
  box.querySelector('[data-skip]')?.addEventListener('click', async () => { sheet.close(); try { await store.update('buoi_hoc', b.id, { trang_thai: 'Bỏ qua' }); } catch (e) { errorToast(e); } });
  box.querySelector('[data-finish]').onclick = async () => {
    const note = box.querySelector('.lesson-note').value;
    sheet.close();
    try {
      const patch = { trang_thai: 'Đã xong', cam_nhan: note, ngay_xong: b.ngay_xong || today() };
      if (rate) patch.danh_gia = rate;
      await store.update('buoi_hoc', b.id, patch);
      if (b.trang_thai !== 'Đã xong' && l.thoi_quen_id) {
        const has = store.all('diem_danh').some((d) => d.thoi_quen_id === l.thoi_quen_id && d.ngay === today());
        if (!has) await store.create('diem_danh', { thoi_quen_id: l.thoi_quen_id, ngay: today(), buoi_id: b.id });
      }
      toast(b.trang_thai === 'Đã xong' ? 'Đã lưu' : '🎉 Xong buổi! Đã điểm danh thói quen', { kind: 'ok' });
    } catch (e) { errorToast(e); }
  };
  return sheet;
}

export function openProgram(id) {
  const l = store.get('lo_trinh', id);
  if (!l) return;
  const ss = sessionsOf(l.id);
  const weeks = {};
  ss.forEach((b) => (weeks[b.tuan || 0] = weeks[b.tuan || 0] || []).push(b));
  const t = today();
  const box = document.createElement('div');
  box.className = 'program-detail';
  box.innerHTML = html`
    ${l.muc_tieu ? html`<p><b>Mục tiêu:</b> ${l.muc_tieu}</p>` : ''}
    ${l.cach_hoc ? html`<details class="more" open><summary>Cách học/tập mỗi buổi</summary><div class="lesson-body">${md(l.cach_hoc)}</div></details>` : ''}
    ${Object.entries(weeks).map(([w, list]) => html`<section class="week"><h4>Tuần ${w} <span class="count">${list.filter((b) => b.trang_thai === 'Đã xong').length}/${list.length}</span></h4>
      <ul class="list">${list.map((b) => html`<li class="row session ${b.trang_thai === 'Đã xong' ? 'is-done' : ''} ${b.ngay === t ? 'is-today' : ''}" data-session="${b.id}">
        <div class="doc-icon">${b.trang_thai === 'Đã xong' ? icon('check') : b.trang_thai === 'Bỏ qua' ? icon('close') : icon('calendar')}</div>
        <div class="row-main"><div class="row-title">${b.tieu_de}</div><div class="row-meta">${b.ngay ? html`<span>${weekdayName(b.ngay)} ${fmtDate(b.ngay)}</span>` : ''}${b.danh_gia ? html`<span>★ ${b.danh_gia}</span>` : ''}${b.ngay === t ? html`<span class="tag tag-q1">Hôm nay</span>` : ''}</div></div></li>`)}</ul></section>`)}
    <div class="form-actions"><button class="btn btn-ghost" data-edit-lt>Sửa lộ trình</button><span class="spacer"></span><button class="btn btn-ghost" data-add-bh>+ Thêm buổi</button></div>`.__raw;
  const sheet = openSheet(box, { title: l.ten });
  box.querySelectorAll('[data-session]').forEach((r) => r.onclick = () => { closeSheet(); setTimeout(() => openSession(r.dataset.session), 200); });
  box.querySelector('[data-edit-lt]').onclick = () => { closeSheet(); setTimeout(() => openRecord('lo_trinh', l.id), 200); };
  box.querySelector('[data-add-bh]').onclick = () => { closeSheet(); setTimeout(() => openRecord('buoi_hoc', null, { lo_trinh_id: l.id, tuan: ss.length ? ss[ss.length - 1].tuan : 1 }), 200); };
  setTimeout(() => box.querySelector('.is-today')?.scrollIntoView({ block: 'center' }), 250);
  return sheet;
}

export { fold };
