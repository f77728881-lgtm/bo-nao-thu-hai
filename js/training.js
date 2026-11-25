// Rèn luyện: thói quen (tick hằng ngày, chuỗi ngày, bản đồ nhiệt) + lộ trình học/tập theo buổi có giáo án.
import * as store from './store.js';
import { html, raw, today, addDays, diffDays, fmtDate, weekdayName, fold } from './util.js';
import { openSheet, toast, errorToast, closeSheet } from './ui.js';
import { openRecord } from './form.js';
import { icon } from './icons.js';
import { copyText } from './notes.js';
import { flashStrip } from './flashcards.js';

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

/** Tỉ lệ hoàn thành các thói quen cần làm trong một ngày (null nếu hôm đó không có thói quen nào). */
function dayRate(list, ymd) {
  const due = list.filter((h) => dueOn(h, ymd));
  if (!due.length) return null;
  return due.filter((h) => checkins(h.id).has(ymd)).length / due.length;
}

function ring(done, total) {
  const r = 30, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return html`<svg class="hb-ring" viewBox="0 0 76 76" aria-label="${done}/${total} thói quen">
    <circle cx="38" cy="38" r="${r}" class="ring-bg"/>
    <circle cx="38" cy="38" r="${r}" class="ring-fg ${pct >= 1 ? 'full' : ''}" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 38 38)"/>
    <text x="38" y="36" class="ring-num">${done}/${total}</text><text x="38" y="51" class="ring-sub">${Math.round(pct * 100)}%</text></svg>`;
}

function bars(list, t) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const W = 22, GAP = 8, H = 46;
  const rates = days.map((d) => dayRate(list, d));
  const valid = rates.filter((x) => x !== null);
  const avg = valid.length ? Math.round(100 * valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  return html`<div class="hb-bars"><svg viewBox="0 0 ${7 * W + 6 * GAP} ${H + 16}" aria-label="Tỉ lệ hoàn thành 7 ngày">
    ${days.map((d, i) => {
      const r = rates[i];
      const h = r === null ? 3 : Math.max(3, Math.round(r * H));
      const x = i * (W + GAP);
      return html`<rect x="${x}" y="${H - h}" width="${W}" height="${h}" rx="4" class="bar ${r === null ? 'rest' : r >= 1 ? 'full' : r > 0 ? 'part' : 'zero'} ${d === t ? 'today' : ''}"><title>${fmtDate(d)}: ${r === null ? 'nghỉ' : Math.round(r * 100) + '%'}</title></rect>
        <text x="${x + W / 2}" y="${H + 13}" class="bar-lb ${d === t ? 'today' : ''}">${weekdayName(d)}</text>`;
    })}</svg><p class="hb-avg">7 ngày: <b>${avg}%</b></p></div>`;
}

/** Thẻ theo dõi thói quen cho màn Hôm nay: vòng tiến độ, biểu đồ 7 ngày, bảng theo dõi từng thói quen. */
export function habitStrip() {
  const t = today();
  const all = activeHabits().filter((h) => h.trang_thai === 'Đang theo');
  const missedY = (h) => dueOn(h, addDays(t, -1)) && !checkins(h.id).has(addDays(t, -1)) && !checkins(h.id).has(t);
  const order = (h) => (h.noi_sau ? 1 : 0);
  const list = all.filter((h) => dueOn(h, t) || h.tan_suat === 'X lần/tuần')
    .sort((a, b) => (missedY(b) ? 1 : 0) - (missedY(a) ? 1 : 0) || (a.gio_nhac || '99') .localeCompare(b.gio_nhac || '99') || order(a) - order(b));
  if (!list.length) return raw('');
  const doneN = list.filter((h) => checkins(h.id).has(t)).length;
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  return html`<section class="card habits-today">
    <h3 class="card-title">${icon('check')} Thói quen hôm nay</h3>
    <div class="hb-top">${ring(doneN, list.length)}${bars(all, t)}</div>
    <ul class="hb-table">${list.map((h) => {
      const days = checkins(h.id);
      const done = days.has(t);
      const s = streak(h);
      const missedY = !done && dueOn(h, addDays(t, -1)) && !days.has(addDays(t, -1));
      return html`<li class="hb-row ${done ? 'done' : ''}">
        <button class="hb-check ${done && days.get(t).muc === '2 phút' ? 'mini' : ''}" data-habit-toggle="${h.id}" aria-pressed="${done}" aria-label="${done ? 'Bỏ đánh dấu' : 'Đánh dấu xong'} ${h.ten}">${done ? (days.get(t).muc === '2 phút' ? '2′' : icon('check')) : h.bieu_tuong || ''}</button>
        <div class="hb-name" data-open="thoi_quen/${h.id}"><b>${h.loai === 'Bỏ' ? 'Tránh: ' : ''}${h.ten}</b><small>${h.gio_nhac || ''}${missedY ? html` <em class="hb-warn">· hôm qua lỡ, đừng bỏ 2 lần liền</em>` : ''}${!done && h.ban_2_phut ? html` <button class="hb-mini" data-habit-mini="${h.id}" title="${h.ban_2_phut}">làm bản 2′</button>` : ''}</small></div>
        <div class="hb-dots">${last7.map((d) => html`<i class="${days.has(d) ? 'on' : dueOn(h, d) ? (d === t ? 'todo' : 'miss') : 'rest'}"></i>`)}</div>
        <span class="hb-streak ${s ? '' : 'zero'}">🔥${s}</span>
      </li>`;
    })}</ul>
  </section>`;
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

/** Câu ý định: "Sau khi [A], tôi sẽ [B] lúc [giờ] ở [đâu]". */
export function intention(h) {
  const after = h.noi_sau ? store.get('thoi_quen', h.noi_sau) : null;
  const parts = [];
  if (after) parts.push(`Sau khi ${after.ten.toLowerCase()}`);
  else if (h.moc) parts.push(`Sau khi ${h.moc}`);
  parts.push(`${parts.length ? 'tôi sẽ' : 'Tôi sẽ'} ${h.loai === 'Bỏ' ? 'tránh ' : ''}${h.ten.toLowerCase()}`);
  if (h.gio_nhac) parts.push(`lúc ${h.gio_nhac}`);
  if (h.dia_diem_lam) parts.push(`ở ${h.dia_diem_lam}`);
  return parts.join(' ') + '.';
}

/** Đường tích lũy 30 ngày: thực tế so với "mỗi ngày đều đặn" (tinh thần 1% mỗi ngày). */
function compound(h) {
  const t = today();
  const days = checkins(h.id);
  const pts = [], ideal = [];
  let got = 0, due = 0;
  for (let i = 29; i >= 0; i--) {
    const d = addDays(t, -i);
    if (dueOn(h, d)) due++;
    if (days.has(d)) got += days.get(d).muc === '2 phút' ? 0.5 : 1;
    pts.push(got); ideal.push(due);
  }
  const max = Math.max(1, ...ideal);
  const W = 300, H = 60;
  const line = (arr) => arr.map((v, i) => `${(i * W / 29).toFixed(1)},${(H - v / max * H).toFixed(1)}`).join(' ');
  const pct = due ? Math.round(100 * got / due) : 0;
  return html`<div class="compound"><svg viewBox="0 0 ${W} ${H + 2}" preserveAspectRatio="none">
      <polyline points="${line(ideal)}" class="cp-ideal"/><polyline points="${line(pts)}" class="cp-real"/></svg>
    <p class="row-meta">30 ngày: <b>${pct}%</b> so với đều đặn mỗi ngày · nét đứt là mục tiêu</p></div>`;
}

function habitCard(h) {
  const t = today();
  const days = checkins(h.id);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const freq = h.tan_suat === 'Chọn ngày' ? (h.ngay_trong_tuan || []).join(', ') : h.tan_suat === 'X lần/tuần' ? `${h.so_lan_tuan || '?'} lần/tuần · tuần này ${weekCount(h)}` : h.tan_suat;
  const votes = days.size;
  const bad = h.loai === 'Bỏ';
  return html`<article class="card habit ${bad ? 'habit-bad' : ''}" data-open="thoi_quen/${h.id}">
    <div class="habit-head"><span class="habit-emoji">${h.bieu_tuong || (bad ? '🚫' : '•')}</span>
      <div class="row-main"><h3>${bad ? 'Bỏ: ' : ''}${h.ten}</h3><p class="row-meta">${freq}${h.gio_nhac ? ` · ${h.gio_nhac}` : ''}${h.muc_tieu ? ` · ${h.muc_tieu}` : ''}</p></div>
      <div class="habit-streak"><b>${streak(h)}</b><small>ngày liên tục</small></div></div>
    <p class="intent">📌 ${intention(h)}</p>
    ${h.ban_sac ? html`<p class="identity">🗳 <b>${votes}</b> phiếu bầu cho “Tôi là ${h.ban_sac.replace(/^tôi là\s*/i, '')}”</p>` : html`<p class="hint">Thêm câu bản sắc “Tôi là người…” để mỗi lần làm là một phiếu bầu.</p>`}
    ${h.ban_2_phut ? html`<p class="row-meta">⏱ Bản 2 phút: ${h.ban_2_phut}</p>` : ''}
    ${h.phan_thuong ? html`<p class="row-meta">🎁 ${h.phan_thuong}</p>` : ''}
    ${bad && h.lam_kho_hon ? html`<p class="row-meta">🧱 Làm khó hơn: ${h.lam_kho_hon}</p>` : ''}
    <div class="week-dots">${last7.map((d) => html`<button class="wdot ${days.has(d) ? (days.get(d).muc === '2 phút' ? 'on mini' : 'on') : dueOn(h, d) ? '' : 'rest'}" data-habit-day="${h.id}|${d}" title="${fmtDate(d)}"><small>${weekdayName(d)}</small><span>${days.has(d) ? icon('check') : +d.slice(8)}</span></button>`)}</div>
    ${compound(h)}
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
    ${tab === 'programs' ? flashStrip() : ''}
    ${body}`;
}

// ---------------- Thao tác ----------------
export async function toggleHabit(id, ymd = today(), muc = 'Đủ') {
  const existing = store.all('diem_danh', { archived: true }).find((d) => d.thoi_quen_id === id && d.ngay === ymd);
  const h = store.get('thoi_quen', id);
  try {
    if (existing && !existing.archived && (existing.muc || 'Đủ') === muc) { store.archive('diem_danh', existing.id).catch(errorToast); return; }
    if (existing && !existing.archived) { store.update('diem_danh', existing.id, { muc }).catch(errorToast); }
    else if (existing) { store.restore('diem_danh', existing.id).catch(errorToast); store.update('diem_danh', existing.id, { muc }).catch(errorToast); }
    else store.create('diem_danh', { thoi_quen_id: id, ngay: ymd, muc }).catch(errorToast);
    if (navigator.vibrate) navigator.vibrate(15);
    if (!h || ymd !== today()) return;
    const s = streak(h);
    const next = store.all('thoi_quen').find((x) => x.noi_sau === id && x.trang_thai === 'Đang theo' && dueOn(x, ymd) && !checkins(x.id).has(ymd));
    const votes = checkins(h.id).size;
    const msg = muc === '2 phút' ? `⏱ Bản 2 phút vẫn tính! Giữ chuỗi ${s} ngày.` : h.ban_sac ? `🗳 Phiếu thứ ${votes} cho “Tôi là ${h.ban_sac.replace(/^tôi là\s*/i, '')}”` : s && s % 7 === 0 ? `🔥 ${s} ngày liên tục! Giữ vững nhé` : `✓ ${h.ten}`;
    if (next) toast(`${msg} · Tiếp theo: ${next.bieu_tuong || ''} ${next.ten}`, { kind: 'ok', ms: 6000, actionLabel: 'Xong luôn', onAction: () => toggleHabit(next.id) });
    else toast(msg, { kind: 'ok' });
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
