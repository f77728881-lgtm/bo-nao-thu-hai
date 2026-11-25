// Ôn tuần (Building a Second Brain): 15 phút chiều thứ 6 — dọn Inbox, xem lại dự án (cầu Hemingway),
// dọn việc trễ, nhìn lịch tuần sau, câu hỏi lớn, nhìn lại + 3 ưu tiên tuần sau. Lưu vào bảng on_tuan.
import * as store from './store.js';
import { html, raw, today, addDays, dayOf, whenLabel, fmtDate, weekdayName } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import * as gcal from './extcal.js';

/** Mã tuần ISO "YYYY-Www" của một ngày. */
export function isoWeek(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export const weekEntry = (wk = isoWeek(today())) => store.all('on_tuan').find((r) => r.tuan === wk);

const STEPS = ['Thu gom', 'Dự án', 'Việc', 'Tuần sau', 'Câu hỏi lớn', 'Nhìn lại'];

/** Thẻ nhắc trên màn Hôm nay: từ 14h thứ 6 đến hết Chủ nhật, nếu tuần này chưa ôn. */
export function weeklyCta() {
  const t = today();
  const wd = new Date(t + 'T00:00:00Z').getUTCDay(); // 5 = thứ 6
  const hour = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const due = (wd === 5 && hour >= 14) || wd === 6 || wd === 0;
  const e = weekEntry();
  if (!due || (e && e.hoan_thanh)) return raw('');
  return html`<button class="review-cta weekly-cta" data-weekly>🗓<span><b>Ôn tuần · 15 phút</b><small>Dọn Inbox · xem dự án · việc trễ · lịch tuần sau · 3 ưu tiên</small></span></button>`;
}

export function openWeekly() {
  const wk = isoWeek(today());
  const prev = weekEntry(wk);
  const st = { buoc: [...(prev?.buoc || [])], dieu_tot: prev?.dieu_tot || '', can_doi: prev?.can_doi || '', uu_tien: [...(prev?.uu_tien || [])] };
  let step = 0;
  const box = document.createElement('div');
  box.className = 'weekly';
  const sheet = openSheet(box, { title: `Ôn tuần ${wk.slice(-3)}`, onClose: () => save(false) });

  const mark = (k) => { if (!st.buoc.includes(k)) st.buoc.push(k); };

  function body() {
    const t = today();
    if (step === 0) {
      const inbox = store.all('inbox').filter((i) => !i.da_xu_ly);
      const notes = store.all('ghi_chu').filter((n) => (n.nhan || [])[0] === '#0_Inbox' || !(n.nhan || []).length);
      return html`<h3>1. Thu gom về 0</h3><p class="hint">Mục tiêu: Inbox trống. Mỗi mục: thành việc, xếp vào dự án, lưu tra cứu, hoặc bỏ.</p>
        <ul class="list">
          <li class="row"><div class="row-main"><div class="row-title">📥 Inbox chưa xử lý: <b>${inbox.length}</b></div></div><a class="btn btn-ghost" href="#/bang/inbox" data-close-weekly>Mở</a></li>
          <li class="row"><div class="row-main"><div class="row-title">🗒 Ghi chú #0_Inbox: <b>${notes.length}</b></div><div class="row-meta">Gợi ý “Xếp vào 📁…” hiện ngay trên thẻ ghi chú</div></div><a class="btn btn-ghost" href="#/ghi-chu" data-close-weekly>Mở</a></li>
        </ul>`;
    }
    if (step === 1) {
      const ps = store.all('du_an').filter((d) => d.trang_thai !== 'Xong');
      return html`<h3>2. Xem lại dự án</h3><p class="hint">Mỗi dự án: còn đang làm không? Lần sau bắt đầu từ đâu (cầu Hemingway)?</p>
        ${ps.map((d) => { const open = store.all('viec').filter((v) => v.du_an_id === d.id && v.trang_thai !== 'Xong'); return html`<div class="wk-proj">
          <b>📁 ${d.ten}</b> <small class="hint">${d.trang_thai} · ${open.length} việc mở${d.han ? ' · hạn ' + fmtDate(d.han) : ''}</small>
          <textarea data-hem="${d.id}" rows="2" placeholder="Lần sau bắt đầu từ…">${d.cau_hemingway || ''}</textarea>
          <div class="opts small"><button class="opt" data-proj-st="${d.id}|Đang làm">Đang làm</button><button class="opt" data-proj-st="${d.id}|Tạm dừng">Tạm dừng</button><button class="opt" data-proj-st="${d.id}|Xong">Xong</button></div></div>`; })}
        ${!ps.length ? html`<p class="empty">Không có dự án đang chạy.</p>` : ''}`;
    }
    if (step === 2) {
      const late = store.all('viec').filter((v) => v.trang_thai !== 'Xong' && v.han && dayOf(v.han) < t).sort((a, b) => (a.han < b.han ? -1 : 1)).slice(0, 25);
      return html`<h3>3. Dọn việc trễ</h3><p class="hint">Việc trễ hạn: dời sang tuần sau, xong rồi, hay bỏ (lưu trữ).</p>
        <ul class="list">${late.map((v) => html`<li class="row" data-wk-row="${v.id}"><div class="row-main"><div class="row-title">${v.ten}</div><div class="row-meta"><span class="due overdue">${whenLabel(v.han)}</span></div>
          <div class="opts small"><button class="opt" data-wk="${v.id}|next">Tuần sau</button><button class="opt" data-wk="${v.id}|done">Xong</button><button class="opt" data-wk="${v.id}|drop">Bỏ</button></div></div></li>`)}</ul>
        ${!late.length ? html`<p class="empty">Không có việc trễ 👏</p>` : ''}`;
    }
    if (step === 3) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(t, i + 1));
      const [a, b] = [days[0], days[6]];
      const g = gcal.eventsIn(a, b);
      return html`<h3>4. Tuần sau có gì</h3><p class="hint">Xem trước để chuẩn bị tài liệu, xin lịch, tránh trùng.</p>
        ${days.map((d) => {
          const evs = store.all('su_kien').filter((e) => e.trang_thai === 'Sắp tới' && dayOf(e.bat_dau) === d).map((e) => `${e.bat_dau.slice(11, 16) || 'Cả ngày'} ${e.ten}`);
          const ge = gcal.eventsOn(d, g).filter((e) => !/^\s*(\[Doffice\]\s*)?(EVN|NPC):/.test(e.ten)).map((e) => `${e.ca_ngay ? 'Cả ngày' : e.bat_dau.slice(11, 16)} ${e.ten}`);
          const ts = store.all('viec').filter((v) => v.trang_thai !== 'Xong' && dayOf(v.han) === d).map((v) => `⏰ ${v.ten}`);
          const all = [...evs, ...ge, ...ts];
          return all.length ? html`<div class="wk-day"><b>${weekdayName(d, true)} ${fmtDate(d)}</b><ul>${all.slice(0, 8).map((x) => html`<li>${x.replace(/\[Doffice\]\s*/, '')}</li>`)}</ul></div>` : '';
        })}`;
    }
    if (step === 4) {
      const qs = store.all('ghi_chu').filter((n) => n.loai === 'Câu hỏi lớn');
      const since = addDays(t, -7);
      return html`<h3>5. Câu hỏi lớn</h3><p class="hint">Tuần này có ghi chú nào làm sáng thêm các câu hỏi anh theo đuổi?</p>
        ${qs.length ? html`<ul class="list">${qs.map((q) => { const ns = store.all('ghi_chu').filter((n) => n.cau_hoi_id === q.id); const nw = ns.filter((n) => (n.created_at || '').slice(0, 10) >= since).length; return html`<li class="row"><div class="row-main"><div class="row-title">❓ ${q.tieu_de || q.noi_dung.slice(0, 80)}</div><div class="row-meta">${ns.length} ghi chú${nw ? ` · ${nw} mới tuần này` : ''}</div></div></li>`; })}</ul>`
          : html`<p class="empty">Chưa có câu hỏi lớn. Vào Ghi chú → ❓ Câu hỏi để viết vài câu (ví dụ: “Làm sao để công tác tuyển dụng của Công ty nhanh và đúng người hơn?”).</p>`}`;
    }
    const opens = store.all('viec').filter((v) => v.trang_thai !== 'Xong').sort((a, b) => ((b.gap && b.quan_trong) - (a.gap && a.quan_trong)) || ((a.han || '9') < (b.han || '9') ? -1 : 1)).slice(0, 30);
    return html`<h3>6. Nhìn lại & 3 ưu tiên</h3>
      <div class="field"><label>Điều làm tốt tuần này</label><textarea data-st="dieu_tot" rows="3">${st.dieu_tot}</textarea></div>
      <div class="field"><label>Điều sẽ đổi tuần sau</label><textarea data-st="can_doi" rows="2">${st.can_doi}</textarea></div>
      <h4>3 ưu tiên tuần sau</h4>
      <ul class="list pick3">${opens.map((v) => html`<li class="row"><label class="ref-opt"><input type="checkbox" data-pick="${v.id}" ${st.uu_tien.includes(v.id) ? raw('checked') : ''}> <span>${v.ten}</span>${v.han ? html` <small class="due">${whenLabel(v.han)}</small>` : ''}</label></li>`)}</ul>`;
  }

  async function save(final) {
    const data = { buoc: st.buoc, dieu_tot: st.dieu_tot, can_doi: st.can_doi, uu_tien: st.uu_tien };
    if (final) data.hoan_thanh = true;
    const cur = weekEntry(wk);
    try {
      if (cur) await store.update('on_tuan', cur.id, data);
      else if (st.buoc.length || st.dieu_tot || final) await store.create('on_tuan', { tuan: wk, ...data });
    } catch (e) { errorToast(e); }
  }

  function render() {
    box.innerHTML = html`<div class="steps">${STEPS.map((s, i) => html`<button class="step ${i === step ? 'on' : st.buoc.includes(s) ? 'past' : ''}" data-step="${i}">${i + 1}. ${s}</button>`)}</div>
      <div class="wk-body">${body()}</div>
      <div class="form-actions">${step > 0 ? html`<button class="btn btn-ghost" data-prev>Quay lại</button>` : ''}<span class="spacer"></span>
        ${step < STEPS.length - 1 ? html`<button class="btn btn-primary" data-next>Tiếp</button>` : html`<button class="btn btn-primary" data-finish>🗓 Xong ôn tuần</button>`}</div>`.__raw;
    wire();
  }

  function wire() {
    box.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { mark(STEPS[step]); step = +b.dataset.step; render(); });
    box.querySelector('[data-prev]')?.addEventListener('click', () => { step--; render(); });
    box.querySelector('[data-next]')?.addEventListener('click', () => { mark(STEPS[step]); step++; render(); box.scrollIntoView?.(); save(false); });
    box.querySelector('[data-finish]')?.addEventListener('click', async () => { mark(STEPS[step]); await save(true); sheet.close(); toast('🗓 Đã ôn tuần. Cuối tuần thảnh thơi nhé!', { kind: 'ok' }); });
    box.querySelectorAll('[data-close-weekly]').forEach((a) => a.addEventListener('click', () => { mark(STEPS[0]); save(false); sheet.close(); }));
    box.querySelectorAll('[data-hem]').forEach((ta) => ta.addEventListener('change', () => { store.update('du_an', ta.dataset.hem, { cau_hemingway: ta.value.trim() }).catch(errorToast); }));
    box.querySelectorAll('[data-proj-st]').forEach((b) => b.onclick = () => { const [id, v] = b.dataset.projSt.split('|'); store.update('du_an', id, { trang_thai: v }).catch(errorToast); toast(`Dự án: ${v}`); render(); });
    box.querySelectorAll('[data-wk]').forEach((b) => b.onclick = () => {
      const [id, kind] = b.dataset.wk.split('|'); const v = store.get('viec', id);
      if (kind === 'next') { const nd = addDays(today(), 7 - ((new Date(today() + 'T00:00:00Z').getUTCDay() + 6) % 7)) + (v.han.length > 10 ? v.han.slice(10) : ''); store.update('viec', id, { han: nd }).catch(errorToast); }
      else if (kind === 'done') store.update('viec', id, { trang_thai: 'Xong' }).catch(errorToast);
      else store.archive('viec', id).catch(errorToast);
      box.querySelector(`[data-wk-row="${id}"]`)?.remove();
    });
    box.querySelectorAll('[data-st]').forEach((t) => t.addEventListener('input', () => { st[t.dataset.st] = t.value; }));
    box.querySelectorAll('[data-pick]').forEach((c) => c.onchange = () => {
      const id = c.dataset.pick;
      if (c.checked) { if (st.uu_tien.length >= 3) { c.checked = false; toast('Chỉ chọn 3 ưu tiên thôi'); return; } st.uu_tien.push(id); }
      else st.uu_tien = st.uu_tien.filter((x) => x !== id);
    });
  }
  render();
  return sheet;
}

/** Màn danh sách các lần ôn tuần. */
export function weeklyView() {
  const rows = store.all('on_tuan').sort((a, b) => (a.tuan < b.tuan ? 1 : -1));
  const cur = weekEntry();
  return html`<header class="page-head"><h1>Ôn tuần</h1></header>
    <button class="review-cta" data-weekly>🗓<span><b>${cur?.hoan_thanh ? 'Xem lại ôn tuần này' : 'Bắt đầu ôn tuần'}</b><small>6 bước · khoảng 15 phút · nên làm chiều thứ 6</small></span></button>
    <div class="grid">${rows.map((r) => html`<section class="card"><h3 class="card-title">${r.tuan} ${r.hoan_thanh ? '✓' : html`<small class="hint">dở</small>`}</h3>
      ${r.dieu_tot ? html`<p><b>Làm tốt:</b> ${r.dieu_tot}</p>` : ''}${r.can_doi ? html`<p><b>Sẽ đổi:</b> ${r.can_doi}</p>` : ''}
      ${(r.uu_tien || []).length ? html`<ol>${r.uu_tien.map((id) => store.get('viec', id)).filter(Boolean).map((v) => html`<li class="${v.trang_thai === 'Xong' ? 'is-done' : ''}">${v.ten}</li>`)}</ol>` : ''}</section>`)}</div>
    ${!rows.length ? html`<p class="empty big">Chưa có lần ôn tuần nào. Chiều thứ 6 app sẽ nhắc.</p>` : ''}`;
}
