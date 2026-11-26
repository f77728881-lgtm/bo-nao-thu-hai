// Sổ câu cần nhớ (tiếng Trung…) + ôn ngắt quãng. Lịch ôn giống máy chủ (14_Hoc.js):
// nhớ → giãn 1 → 3 → 7 → 14 → 30 → 60 ngày (≥30 ngày = Thuộc); quên → ôn lại từ ngày mai.
import * as store from './store.js';
import { html, raw, today, addDays, fold, fmtDate } from './util.js';
import { openSheet, errorToast, toast } from './ui.js';
import { openRecord } from './form.js';

const STEPS = [1, 3, 7, 14, 30, 60];
const THUOC = 30;

export const allCards = () => store.all('the_hoc');
export const dueCards = (day = today()) => allCards().filter((c) => !c.on_ngay || c.on_ngay <= day)
  .sort((a, b) => (a.on_ngay || '') < (b.on_ngay || '') ? -1 : 1);

export function schedule(c, nho, day = today()) {
  const k = Number(c.khoang) || 0;
  const patch = { so_lan_on: (Number(c.so_lan_on) || 0) + 1 };
  if (nho) {
    const next = STEPS.find((s) => s > k) || STEPS[STEPS.length - 1];
    Object.assign(patch, { khoang: next, on_ngay: addDays(day, next), muc: next >= THUOC ? 'Thuộc' : 'Đang nhớ' });
  } else {
    Object.assign(patch, { khoang: 0, on_ngay: addDays(day, 1), so_lan_quen: (Number(c.so_lan_quen) || 0) + 1, muc: c.muc === 'Mới' ? 'Mới' : 'Đang nhớ' });
  }
  return patch;
}

/** Đọc to bằng giọng tiếng Trung có sẵn trên máy (không tốn phí). */
export function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = 0.85;
  const v = speechSynthesis.getVoices().find((x) => /^zh(-|_)?(CN|Hans)?/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/** Thẻ tóm tắt cho màn Hôm nay và Rèn luyện. compact: chỉ hiện khi có câu đến hạn. */
/** Một dòng "ôn câu đến hạn" cho khối Ưu tiên hôm nay (rỗng nếu không có câu đến hạn). */
export function flashRow() {
  const due = dueCards();
  if (!due.length) return null;
  return html`<li class="row"><div class="doc-icon">🀄</div><div class="row-main"><div class="row-title">Ôn ${due.length} câu tiếng Trung đến hạn</div><div class="row-meta">Sổ câu cần nhớ · khoảng ${Math.max(2, Math.round(due.length / 3))} phút</div></div><button class="btn btn-ghost" data-flash="review">Ôn</button></li>`;
}

export function flashStrip({ compact = false } = {}) {
  const all = allCards();
  const due = dueCards();
  if (compact && !due.length) return raw('');
  if (!all.length && compact) return raw('');
  const thuoc = all.filter((c) => c.muc === 'Thuộc').length;
  return html`<section class="card flash-strip">
    <h3 class="card-title">🀄 Sổ câu cần nhớ</h3>
    <p class="row-meta">${due.length ? html`<b>${due.length} câu</b> đến hạn ôn hôm nay · ` : 'Hôm nay đã ôn hết · '}${all.length} câu · ${thuoc} đã thuộc</p>
    <div class="opts">${due.length ? html`<button class="btn" data-flash="review">Ôn ${due.length} câu</button>` : ''}<button class="btn btn-ghost" data-flash="list">Xem sổ câu</button></div>
    ${!all.length ? html`<p class="hint">Học với Claude xong, nhắn “lưu bài” là các câu cần nhớ tự vào đây.</p>` : ''}
  </section>`;
}

export function handleFlash(kind) {
  if (kind === 'review') openReview();
  else openList();
}

export function openReview(queue = dueCards()) {
  if (!queue.length) { toast('Không có câu nào cần ôn.'); return; }
  let i = 0, shown = false, nhoCount = 0;
  const box = document.createElement('div');
  box.className = 'flash';
  const draw = () => {
    if (i >= queue.length) {
      box.innerHTML = html`<div class="flash-done"><p class="big">🎉 Xong ${queue.length} câu</p><p>Nhớ ${nhoCount}, cần ôn lại ${queue.length - nhoCount}. Câu quên sẽ quay lại ngày mai.</p>
        <button class="btn" data-x="close">Đóng</button></div>`.__raw;
      return;
    }
    const c = store.get('the_hoc', queue[i].id) || queue[i];
    box.innerHTML = html`<p class="flash-count">${i + 1}/${queue.length}${c.chu_de ? ` · ${c.chu_de}` : ''}</p>
      <button class="flash-card ${shown ? 'shown' : ''}" data-x="flip">
        <span class="flash-han">${c.cau}</span>
        ${shown ? html`<span class="flash-py">${c.pinyin || ''}</span><span class="flash-vn">${c.nghia || ''}</span>${c.vi_du ? html`<span class="flash-ex">${c.vi_du}</span>` : ''}` : html`<span class="hint">Chạm để xem nghĩa</span>`}
      </button>
      <div class="flash-actions">
        <button class="btn btn-ghost" data-x="speak" aria-label="Đọc to">🔊 Nghe</button>
        ${shown ? html`<button class="btn btn-ghost flash-no" data-x="no">Quên</button><button class="btn flash-yes" data-x="yes">Nhớ</button>` : html`<button class="btn" data-x="flip">Xem nghĩa</button>`}
      </div>`.__raw;
  };
  const answer = async (nho) => {
    const c = store.get('the_hoc', queue[i].id) || queue[i];
    if (nho) nhoCount++;
    i++; shown = false; draw();
    try { await store.update('the_hoc', c.id, schedule(c, nho)); } catch (e) { errorToast(e); }
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x;
    if (x === 'flip') { shown = !shown; draw(); if (shown) speak((store.get('the_hoc', queue[i].id) || queue[i]).cau); }
    else if (x === 'speak') speak((store.get('the_hoc', queue[i].id) || queue[i]).cau);
    else if (x === 'yes') answer(true);
    else if (x === 'no') answer(false);
    else if (x === 'close') sheet.close();
  });
  draw();
  const sheet = openSheet(box, { title: 'Ôn câu' });
}

export function openList() {
  const box = document.createElement('div');
  let q = '';
  const draw = () => {
    const f = fold(q);
    const list = allCards().filter((c) => !f || fold(`${c.cau} ${c.pinyin} ${c.nghia} ${c.chu_de}`).includes(f))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    box.querySelector('.flash-list').innerHTML = (list.length ? html`${list.map((c) => html`<li class="row flash-row" data-id="${c.id}">
      <button class="icon-btn" data-speak="${c.cau}" aria-label="Đọc to">🔊</button>
      <div class="row-main"><div class="row-title"><span class="flash-han-s">${c.cau}</span> <span class="flash-py">${c.pinyin || ''}</span></div>
        <div class="row-meta"><span>${c.nghia || ''}</span><span class="tag">${c.muc || 'Mới'}</span>${c.on_ngay ? html`<span>ôn ${fmtDate(c.on_ngay)}</span>` : ''}${Number(c.so_lan_quen) ? html`<span>quên ${c.so_lan_quen} lần</span>` : ''}</div></div></li>`)}`
      : html`<p class="empty">Chưa có câu nào${q ? ' khớp' : ''}.</p>`).__raw;
  };
  box.innerHTML = html`<div class="search-box"><input type="search" placeholder="Tìm chữ Hán, pinyin, nghĩa…" autocomplete="off"></div>
    <div class="opts"><button class="btn btn-ghost" data-add>+ Thêm câu</button>${dueCards().length ? html`<button class="btn" data-review>Ôn ${dueCards().length} câu</button>` : ''}</div>
    <ul class="list flash-list"></ul>`.__raw;
  box.querySelector('input').addEventListener('input', (e) => { q = e.target.value; draw(); });
  box.addEventListener('click', (e) => {
    const sp = e.target.closest('[data-speak]');
    if (sp) { e.stopPropagation(); speak(sp.dataset.speak); return; }
    if (e.target.closest('[data-add]')) { openRecord('the_hoc', null); return; }
    if (e.target.closest('[data-review]')) { openReview(); return; }
    const row = e.target.closest('[data-id]');
    if (row) openRecord('the_hoc', row.dataset.id);
  });
  draw();
  openSheet(box, { title: 'Sổ câu cần nhớ' });
}
