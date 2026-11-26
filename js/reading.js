// Đọc sách: bộ đếm lùi (tối thiểu 30 phút) gắn với thói quen, thanh đếm nổi, ghi trang, Tủ sách + kế hoạch đọc.
// Phiên đọc lưu ở bảng phien_doc. Hết giờ: app (nếu đang mở) hoặc máy chủ (hẹn giờ) khép phiên → tự tích thói quen.
import * as store from './store.js';
import { html, raw, today, addDays, fmtDate, weekdayName, vnNow } from './util.js';
import { openSheet, toast, errorToast, closeSheet } from './ui.js';
import { icon } from './icons.js';
import { openRecord } from './form.js';
import { uploadNow, thumbUrl, fullUrl } from './photos.js';

/** Bìa sách: mã ảnh trong kho (YYYY/…) hoặc link ảnh dán vào. */
const isPhotoId = (v) => /^(\d{4}|demo)\//.test(String(v || ''));
const coverSrc = (b, big = false) => (!b.anh_bia ? '' : isPhotoId(b.anh_bia) ? (big ? fullUrl(b.anh_bia) : thumbUrl(b.anh_bia)) : b.anh_bia);

const MINS = [30, 45, 60];
const ST = ['Đang đọc', 'Muốn đọc', 'Đã đọc', 'Bỏ dở'];
let shelfTab = 'Đang đọc';
export const setShelfTab = (t) => { shelfTab = t; };

const sessions = () => store.all('phien_doc');
export const running = () => sessions().find((p) => p.trang_thai === 'Đang đọc' || p.trang_thai === 'Tạm dừng') || null;
const remainingSec = (p) => (p.trang_thai === 'Tạm dừng' ? Number(p.con_lai_giay) || 0 : Math.max(0, Math.round((new Date(p.ket_thuc_luc).getTime() - Date.now()) / 1000)));
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const bookOf = (p) => (p && p.sach_id ? store.get('sach', p.sach_id) : null);
const year = () => Number(today().slice(0, 4));
// Mục tiêu năm nay; chưa đặt thì dùng mục tiêu năm gần nhất (sang năm mới không phải đặt lại).
const goalOf = (y = year()) => store.all('muc_tieu_doc').find((g) => Number(g.nam) === y)
  || store.all('muc_tieu_doc').filter((g) => Number(g.nam) < y).sort((a, b) => b.nam - a.nam)[0] || null;
const isReadingHabit = (h) => Number(h.dem_gio_phut) > 0 || h.tu_dong === 'Đọc sách';

// ---------------- Bắt đầu đọc ----------------
export function openReadStart(habitId) {
  if (running()) { toast('Đang có một phiên đọc. Dừng phiên đó trước nhé.'); return; }
  const h = habitId ? store.get('thoi_quen', habitId) : store.all('thoi_quen').find((x) => x.trang_thai === 'Đang theo' && isReadingHabit(x));
  const def = Math.max(30, Number(h?.dem_gio_phut) || 30);
  const books = store.all('sach').filter((b) => b.trang_thai === 'Đang đọc' || b.trang_thai === 'Muốn đọc')
    .sort((a, b) => (a.trang_thai === 'Đang đọc' ? -1 : 1) - (b.trang_thai === 'Đang đọc' ? -1 : 1) || (a.updated_at < b.updated_at ? 1 : -1));
  let mins = MINS.includes(def) ? def : 30;
  let bookId = books[0]?.id || '';
  const box = document.createElement('div');
  box.className = 'read-start';
  const draw = () => {
    const b = bookId && bookId !== 'new' ? store.get('sach', bookId) : null;
    box.innerHTML = html`
      <label class="rs-lab">Sách</label>
      <div class="opts rs-books">${books.map((x) => html`<button class="opt ${x.id === bookId ? 'on' : ''}" data-rs-book="${x.id}">${x.ten}</button>`)}<button class="opt ${bookId === 'new' ? 'on' : ''}" data-rs-book="new">＋ Sách mới</button><button class="opt ${!bookId ? 'on' : ''}" data-rs-book="">Không chọn</button></div>
      ${bookId === 'new' ? html`<div class="rs-new"><input data-rs-title placeholder="Tên sách"><input data-rs-pages type="number" inputmode="numeric" placeholder="Số trang"></div>` : ''}
      <label class="rs-lab">Thời gian (tối thiểu 30 phút)</label>
      <div class="opts">${MINS.map((m) => html`<button class="opt ${m === mins ? 'on' : ''}" data-rs-min="${m}">${m} phút</button>`)}</div>
      <label class="rs-lab">Bắt đầu từ trang</label>
      <input class="rs-page" data-rs-from type="number" inputmode="numeric" value="${b && b.trang_hien_tai ? Number(b.trang_hien_tai) + 1 : ''}" placeholder="vd: 1">
      <p class="hint">Hết giờ app tự tích thói quen${h ? ` “${h.ten}”` : ''}, kể cả khi anh tắt màn hình. Dừng sớm từ 2 phút vẫn được tính mức 2 phút.</p>
      <div class="form-actions"><span class="spacer"></span><button class="btn btn-primary" data-rs-go>▶ Bắt đầu ${mins} phút</button></div>`.__raw;
  };
  draw();
  const sheet = openSheet(box, { title: '📖 Đọc sách' });
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-rs-book],[data-rs-min],[data-rs-go]');
    if (!t) return;
    if (t.matches('[data-rs-book]')) { bookId = t.dataset.rsBook; draw(); if (bookId === 'new') box.querySelector('[data-rs-title]')?.focus(); return; }
    if (t.matches('[data-rs-min]')) { mins = +t.dataset.rsMin; draw(); return; }
    const from = Number(box.querySelector('[data-rs-from]').value) || '';
    let sid = bookId;
    try {
      if (bookId === 'new') {
        const ten = box.querySelector('[data-rs-title]').value.trim();
        if (!ten) { toast('Nhập tên sách'); return; }
        const nb = await store.create('sach', { ten, so_trang: Number(box.querySelector('[data-rs-pages]').value) || '', trang_thai: 'Đang đọc', bat_dau: today() });
        sid = nb?.id || '';
      }
      sheet.close();
      const now = Date.now();
      await store.create('phien_doc', {
        sach_id: sid || '', ngay: today(), trang_thai: 'Đang đọc', so_phut_dat: mins,
        bat_dau_luc: new Date(now).toISOString(), ket_thuc_luc: new Date(now + mins * 60000).toISOString(),
        tu_trang: from, thoi_quen_id: h?.id || ''
      });
      askNotify();
      toast(`▶ Bắt đầu đọc ${mins} phút. Chúc đọc vui!`, { kind: 'ok' });
    } catch (err) { errorToast(err); }
  });
}

function askNotify() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

// ---------------- Thanh đếm nổi ----------------
let bar = null, ticker = null, finishing = new Set();

export function mountReadBar() {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'read-bar';
    bar.setAttribute('role', 'timer');
    document.body.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('[data-rb]');
      if (!t) return;
      const p = running();
      if (!p) return;
      if (t.dataset.rb === 'pause') pause(p);
      else if (t.dataset.rb === 'resume') resume(p);
      else if (t.dataset.rb === 'stop') stopEarly(p);
      else if (t.dataset.rb === 'open') location.hash = '#/tu-sach';
    });
  }
  refreshBar();
}

export function refreshBar() {
  if (!bar) return;
  const p = running();
  if (!p) { bar.classList.remove('on'); bar.innerHTML = ''; document.body.classList.remove('reading'); clearInterval(ticker); ticker = null; return; }
  document.body.classList.add('reading');
  bar.classList.add('on');
  const draw = () => {
    const cur = running();
    if (!cur) return refreshBar();
    const left = remainingSec(cur);
    const total = (Number(cur.so_phut_dat) || 30) * 60;
    const pct = Math.min(100, Math.round(100 * (total - left) / total));
    const b = bookOf(cur);
    bar.innerHTML = html`<div class="rb-fill" style="width:${pct}%"></div>
      <button class="rb-main" data-rb="open"><span class="rb-ic">📖</span><span class="rb-txt"><b>${mmss(left)}</b><small>${b ? b.ten : 'Đọc sách'}${cur.trang_thai === 'Tạm dừng' ? ' · tạm dừng' : ''}</small></span></button>
      ${cur.trang_thai === 'Tạm dừng' ? html`<button class="rb-btn" data-rb="resume" aria-label="Tiếp tục">▶</button>` : html`<button class="rb-btn" data-rb="pause" aria-label="Tạm dừng">⏸</button>`}
      <button class="rb-btn" data-rb="stop" aria-label="Dừng">⏹</button>`.__raw;
    if (cur.trang_thai === 'Đang đọc' && left <= 0) finish(cur);
  };
  draw();
  if (!ticker) ticker = setInterval(draw, 1000);
}

function pause(p) {
  store.update('phien_doc', p.id, { trang_thai: 'Tạm dừng', con_lai_giay: remainingSec(p), ket_thuc_luc: '' }).catch(errorToast);
}
function resume(p) {
  store.update('phien_doc', p.id, { trang_thai: 'Đang đọc', ket_thuc_luc: new Date(Date.now() + remainingSec(p) * 1000).toISOString(), con_lai_giay: '' }).catch(errorToast);
}
function stopEarly(p) {
  const total = (Number(p.so_phut_dat) || 30) * 60;
  const m = Math.floor((total - remainingSec(p)) / 60);
  const msg = m >= 2 ? `Dừng sau ${m} phút? Vẫn được tính mức 2 phút.` : `Mới ${m} phút, chưa tính thói quen. Vẫn dừng?`;
  if (!confirm(msg)) return;
  store.update('phien_doc', p.id, { trang_thai: 'Dừng sớm', so_phut: m, ket_thuc_luc: '', con_lai_giay: '' })
    .then(() => { if (m >= 1) askPages(p.id); }).catch(errorToast);
}

async function finish(p) {
  if (finishing.has(p.id)) return;
  finishing.add(p.id);
  chime();
  const mins = Number(p.so_phut_dat) || 30;
  try {
    await store.update('phien_doc', p.id, { trang_thai: 'Xong', so_phut: mins, ket_thuc_luc: '' });
    toast(`🎉 Xong ${mins} phút đọc! Đã tích thói quen.`, { kind: 'ok', ms: 5000 });
    setTimeout(() => store.sync(), 1200);
    askPages(p.id);
  } catch (e) { errorToast(e); }
}

function chime() {
  try {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]);
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    [0, 0.35, 0.7].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
    });
  } catch (e) { /* không có âm thanh cũng được */ }
}

// ---------------- Ghi trang + câu tâm đắc sau phiên ----------------
export function askPages(id) {
  const p = store.get('phien_doc', store.tmpMap.get(id) || id);
  if (!p) return;
  const b = bookOf(p);
  const box = document.createElement('div');
  box.className = 'read-after';
  box.innerHTML = html`
    <p>${b ? html`<b>${b.ten}</b> · ` : ''}${p.so_phut || p.so_phut_dat} phút${p.tu_trang ? ` · từ trang ${p.tu_trang}` : ''}</p>
    ${b ? html`<label class="rs-lab">Đọc đến trang</label><input class="rs-page" data-ra-page type="number" inputmode="numeric" value="${p.den_trang || ''}" placeholder="${b.so_trang ? 'trên tổng ' + b.so_trang : 'số trang'}">` : ''}
    <label class="rs-lab">Câu/ý tâm đắc (không bắt buộc, lưu thành ghi chú)</label>
    <textarea data-ra-note rows="3" placeholder="Chép một câu hay, hoặc điều anh muốn áp dụng…"></textarea>
    ${b && b.so_trang ? html`<label class="switch"><input type="checkbox" data-ra-done><span></span> Đã đọc xong cuốn này</label>` : ''}
    <div class="form-actions"><button class="btn btn-ghost" data-ra-skip>Bỏ qua</button><span class="spacer"></span><button class="btn btn-primary" data-ra-save>Lưu</button></div>`.__raw;
  const sheet = openSheet(box, { title: '📖 Ghi lại buổi đọc' });
  box.querySelector('[data-ra-skip]').onclick = () => { sheet.close(); store.update('phien_doc', p.id, { ghi_chu: p.ghi_chu || 'Không ghi trang' }).catch(() => {}); };
  box.querySelector('[data-ra-save]').onclick = async () => {
    const page = Number(box.querySelector('[data-ra-page]')?.value) || 0;
    const note = box.querySelector('[data-ra-note]').value.trim();
    const done = box.querySelector('[data-ra-done]')?.checked;
    sheet.close();
    try {
      if (page) await store.update('phien_doc', p.id, { den_trang: page });
      else await store.update('phien_doc', p.id, { ghi_chu: p.ghi_chu || 'Không ghi trang' });
      if (note) await store.create('ghi_chu', { tieu_de: b ? `Từ sách: ${b.ten}` : 'Từ buổi đọc sách', noi_dung: note, nhan: ['Sách'], lien_ket: b ? [b.id] : [], loai: 'Kiến thức' });
      if (done && b) { await store.update('sach', b.id, { trang_thai: 'Đã đọc', trang_hien_tai: Number(b.so_trang) }); openBook(b.id, { review: true }); return; }
      toast(page ? `Đã lưu: tới trang ${page}` : 'Đã lưu buổi đọc', { kind: 'ok' });
    } catch (e) { errorToast(e); }
  };
}

/** Phiên hôm nay đã xong (có thể do máy chủ khép khi app tắt) nhưng chưa ghi trang. */
function pendingPages() {
  const t = today();
  return sessions().filter((p) => p.ngay >= addDays(t, -1) && (p.trang_thai === 'Xong' || p.trang_thai === 'Dừng sớm') && p.sach_id && !p.den_trang && !p.ghi_chu && !String(p.id).startsWith('tmp-'));
}
export function pendingPagesCard() {
  const list = pendingPages();
  if (!list.length) return raw('');
  return html`<section class="card read-pending">${list.slice(0, 2).map((p) => html`<button class="row-btn" data-read-pages="${p.id}">📖 Vừa đọc ${p.so_phut || p.so_phut_dat} phút <b>${bookOf(p)?.ten || ''}</b> · ghi trang đọc tới →</button>`)}</section>`;
}

// ---------------- Thống kê ----------------
const minutesOn = (d) => sessions().filter((p) => p.ngay === d && (p.trang_thai === 'Xong' || p.trang_thai === 'Dừng sớm')).reduce((s, p) => s + (Number(p.so_phut) || 0), 0);
function pagesPerDay(b) {
  const since = addDays(today(), -21);
  const ss = sessions().filter((p) => p.sach_id === b.id && p.ngay >= since && Number(p.den_trang) > 0).sort((a, c) => (a.ngay < c.ngay ? -1 : 1));
  if (ss.length < 2 && !(ss.length === 1 && ss[0].tu_trang)) return 0;
  const first = ss[0].tu_trang ? Number(ss[0].tu_trang) - 1 : Number(ss[0].den_trang);
  const last = Number(ss[ss.length - 1].den_trang);
  const days = Math.max(1, Math.round((new Date(ss[ss.length - 1].ngay) - new Date(ss[0].ngay)) / 864e5) + 1);
  return Math.max(0, (last - first) / days);
}
function forecast(b) {
  const ppd = pagesPerDay(b);
  if (!ppd || !b.so_trang) return '';
  const left = Number(b.so_trang) - (Number(b.trang_hien_tai) || 0);
  if (left <= 0) return '';
  const d = addDays(today(), Math.ceil(left / ppd));
  return `≈ ${Math.round(ppd)} trang/ngày · xong khoảng ${fmtDate(d)}`;
}
const doneIn = (prefix) => store.all('sach').filter((b) => b.trang_thai === 'Đã đọc' && String(b.xong_ngay || '').startsWith(prefix));

function weekChart(goalMin) {
  const t = today();
  const wd = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const monday = addDays(t, -wd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const vals = days.map(minutesOn);
  const max = Math.max(goalMin || 30, ...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  const target = (goalMin || 30) * 7;
  return html`<div class="rd-week">${days.map((d, i) => html`<div class="rd-day ${d === t ? 'today' : ''} ${d > t ? 'future' : ''}" title="${fmtDate(d)}: ${vals[i]} phút">
      <span class="rd-col"><i style="height:${Math.round(100 * vals[i] / max)}%" class="${vals[i] >= (goalMin || 30) ? 'full' : vals[i] ? 'part' : ''}"></i>${goalMin ? html`<em style="bottom:${Math.round(100 * goalMin / max)}%"></em>` : ''}</span>
      <small>${weekdayName(d)}</small><b>${vals[i] || ''}</b></div>`)}</div>
    <p class="row-meta">Tuần này <b>${sum}</b>/${target} phút · ${sum >= target ? 'đạt kế hoạch tuần 🎉' : `còn ${target - sum} phút`}</p>`;
}

// ---------------- Màn Tủ sách ----------------
export function shelfView() {
  const y = year();
  const g = goalOf(y);
  const goalN = Number(g?.so_sach) || 12;
  const perDay = Number(g?.phut_ngay) || 30;
  const doneY = doneIn(String(y));
  const now = vnNow();
  // Tiến độ tính từ ngày đặt mục tiêu (bắt đầu giữa năm không bị báo "chậm" cho những tháng trước đó).
  const yStart = y + '-01-01';
  const from = g && Number(g.nam) === y && String(g.created_at || '').slice(0, 4) === String(y) ? String(g.created_at).slice(0, 10) : yStart;
  const span = 365; // nhịp đều: số cuốn năm ÷ 365 mỗi ngày, tính từ ngày đặt mục tiêu
  const gone = Math.max(1, Math.round((new Date(today()) - new Date(from)) / 864e5) + 1);
  const doneSince = doneY.filter((b) => b.xong_ngay >= from).length;
  const diff = doneSince - goalN * gone / span;
  const pace = !g ? 'bấm 🎯 Mục tiêu để đặt kế hoạch năm' : diff >= 0.5 ? `vượt tiến độ ${diff.toFixed(1)} cuốn` : diff <= -0.5 ? `chậm ${(-diff).toFixed(1)} cuốn so với tiến độ` : 'đúng tiến độ';
  const m = today().slice(0, 7);
  const monthTarget = Math.max(1, Math.round(goalN / 12));
  const doneM = doneIn(m);
  const planM = store.all('sach').filter((b) => b.ke_hoach_thang === m && b.trang_thai !== 'Đã đọc');
  const books = store.all('sach').filter((b) => b.trang_thai === shelfTab)
    .sort((a, b) => shelfTab === 'Đã đọc' ? ((a.xong_ngay || '') < (b.xong_ngay || '') ? 1 : -1) : ((a.updated_at < b.updated_at) ? 1 : -1));
  const r = running();
  const counts = Object.fromEntries(ST.map((s) => [s, store.all('sach').filter((b) => b.trang_thai === s).length]));
  const pct = Math.min(100, Math.round(100 * doneY.length / goalN));
  return html`
    <header class="page-head"><h1>Tủ sách</h1>
      <div class="filters" style="margin:0"><button class="btn btn-ghost" data-read-goal>🎯 Mục tiêu</button><button class="btn" data-new="sach">＋ Sách</button></div></header>
    ${pendingPagesCard()}
    <section class="card rd-goal">
      <div class="rd-goal-top">
        <div><p class="lesson-meta">Năm ${y}</p><h3><b>${doneY.length}</b>/${goalN} cuốn</h3><p class="row-meta">${pace}</p></div>
        ${r ? html`<button class="btn" data-rb-open>📖 Đang đọc…</button>` : html`<button class="btn btn-primary" data-read-start>▶ Đọc ${perDay >= 30 ? perDay : 30} phút</button>`}
      </div>
      <div class="progress"><span style="width:${pct}%"></span><em>${pct}% mục tiêu năm</em></div>
      <div class="rd-plan">
        <div><b>Tháng ${+m.slice(5)}</b><small>${doneM.length}/${monthTarget} cuốn xong${planM.length ? ` · dự định: ${planM.map((b) => b.ten).join(', ')}` : ''}</small></div>
        <div><b>Hằng ngày</b><small>${perDay} phút · hôm nay ${minutesOn(today())} phút</small></div>
      </div>
      ${weekChart(perDay)}
    </section>
    <div class="seg" style="margin:14px 0">${ST.map((s) => html`<button class="${shelfTab === s ? 'on' : ''}" data-shelf-tab="${s}">${s} <small>${counts[s] || ''}</small></button>`)}</div>
    ${books.length ? html`<div class="grid">${books.map(bookCard)}</div>` : html`<p class="empty big">${shelfTab === 'Muốn đọc' ? 'Chưa có sách muốn đọc. Bấm “＋ Sách” để thêm.' : shelfTab === 'Đã đọc' ? 'Chưa có cuốn nào đọc xong.' : shelfTab === 'Đang đọc' ? 'Chưa đọc cuốn nào. Chọn một cuốn ở “Muốn đọc” hoặc bấm “Đọc 30 phút”.' : 'Không có.'}</p>`}`;
}

function stars(n) { n = Number(n) || 0; return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : ''; }

function bookCard(b) {
  const pct = b.so_trang ? Math.min(100, Math.round(100 * (Number(b.trang_hien_tai) || 0) / Number(b.so_trang))) : 0;
  const m = today().slice(0, 7);
  return html`<article class="card book" data-book="${b.id}">
    <div class="book-head">${b.anh_bia ? html`<img class="book-cover" src="${coverSrc(b)}" alt="" loading="lazy">` : html`<span class="book-cover ph">${icon('book')}</span>`}
      <div class="row-main"><h3>${b.ten}</h3><p class="row-meta">${[b.tac_gia, b.the_loai].filter(Boolean).join(' · ')}</p>
        ${b.trang_thai === 'Đã đọc' ? html`<p class="book-stars">${stars(b.danh_gia)} <small>${b.xong_ngay ? fmtDate(b.xong_ngay, true) : ''}</small></p>` : ''}</div></div>
    ${b.trang_thai === 'Đang đọc' ? html`<div class="progress"><span style="width:${pct}%"></span><em>${b.trang_hien_tai || 0}/${b.so_trang || '?'} trang${pct ? ` · ${pct}%` : ''}</em></div><p class="row-meta">${forecast(b)}</p>` : ''}
    ${b.trang_thai === 'Đã đọc' && b.review ? html`<p class="book-review">“${String(b.review).slice(0, 220)}”</p>` : ''}
    ${b.trang_thai === 'Đã đọc' && !b.review ? html`<p class="hint">Chưa có review — chạm để viết 3 câu.</p>` : ''}
    ${b.trang_thai === 'Muốn đọc' ? html`<p class="row-meta">${b.ke_hoach_thang === m ? '📌 Dự định đọc tháng này' : b.so_trang ? b.so_trang + ' trang' : ''}</p>` : ''}
  </article>`;
}

// ---------------- Chi tiết sách + review ----------------
export function openBook(id, { review = false } = {}) {
  const b = store.get('sach', id);
  if (!b) return;
  const ss = sessions().filter((p) => p.sach_id === b.id && p.trang_thai !== 'Đang đọc' && p.trang_thai !== 'Tạm dừng').sort((a, c) => (a.ngay < c.ngay ? 1 : -1));
  const mins = ss.reduce((s, p) => s + (Number(p.so_phut) || 0), 0);
  const notes = store.all('ghi_chu').filter((n) => (n.lien_ket || []).includes(b.id));
  const m = today().slice(0, 7);
  let rate = Number(b.danh_gia) || 0;
  const box = document.createElement('div');
  box.className = 'book-detail';
  box.innerHTML = html`
    <div class="bk-top">
      <button class="bk-cover" data-bk-cover title="Đổi bìa sách">${b.anh_bia ? html`<img src="${coverSrc(b, true)}" alt="Bìa sách">` : html`<span>${icon('book')}<small>Thêm bìa</small></span>`}<i>📷</i></button>
      <div class="row-main">
        <p class="row-meta">${[b.tac_gia, b.the_loai, b.so_trang ? b.so_trang + ' trang' : ''].filter(Boolean).join(' · ')}</p>
        <div class="bk-cover-acts"><label class="chip">📷 Chụp / chọn bìa<input type="file" accept="image/*" hidden data-bk-file></label><button class="chip" data-bk-link>🔗 Dán link ảnh</button>${b.anh_bia ? html`<button class="chip" data-bk-nocover>Bỏ bìa</button>` : ''}</div>
      </div>
    </div>
    <div class="opts small">${ST.map((s) => html`<button class="opt ${b.trang_thai === s ? 'on' : ''}" data-bk-st="${s}">${s}</button>`)}</div>
    ${b.trang_thai === 'Muốn đọc' ? html`<label class="switch"><input type="checkbox" data-bk-month ${b.ke_hoach_thang === m ? raw('checked') : ''}><span></span> Dự định đọc trong tháng này</label>` : ''}
    <p class="row-meta">${ss.length} buổi · ${mins} phút${b.bat_dau ? ` · bắt đầu ${fmtDate(b.bat_dau, true)}` : ''}${b.xong_ngay ? ` · xong ${fmtDate(b.xong_ngay, true)}` : ''}</p>
    <h4>Review ngắn</h4>
    <div class="opts stars">${[1, 2, 3, 4, 5].map((n) => html`<button class="opt star ${n <= rate ? 'on' : ''}" data-bk-rate="${n}">★</button>`)}</div>
    <textarea data-bk-review rows="3" placeholder="3–5 câu: sách nói gì, anh thấy thế nào, có nên đọc lại?">${b.review || ''}</textarea>
    <label class="rs-lab">3 ý chính mang theo</label>
    <textarea data-bk-ideas rows="3" placeholder="1. …&#10;2. …&#10;3. …">${b.y_chinh || ''}</textarea>
    ${notes.length ? html`<h4>Ghi chú từ sách (${notes.length})</h4><ul class="list">${notes.slice(0, 8).map((n) => html`<li class="row" data-open="ghi_chu/${n.id}"><div class="row-main"><div class="row-title">${String(n.noi_dung || n.tieu_de).slice(0, 120)}</div></div></li>`)}</ul>` : ''}
    ${ss.length ? html`<details class="more"><summary>Các buổi đọc</summary><ul class="list">${ss.slice(0, 30).map((p) => html`<li class="row"><div class="row-main"><div class="row-title">${weekdayName(p.ngay)} ${fmtDate(p.ngay)} · ${p.so_phut || 0} phút</div><div class="row-meta">${p.tu_trang ? `trang ${p.tu_trang}` : ''}${p.den_trang ? ` → ${p.den_trang}` : ''}${p.trang_thai === 'Dừng sớm' ? ' · dừng sớm' : ''}</div></div></li>`)}</ul></details>` : ''}
    <div class="form-actions"><button class="btn btn-ghost" data-bk-edit>Sửa thông tin</button><span class="spacer"></span>${b.trang_thai !== 'Đã đọc' ? html`<button class="btn btn-ghost" data-bk-read>▶ Đọc</button>` : ''}<button class="btn btn-primary" data-bk-save>Lưu</button></div>`.__raw;
  const sheet = openSheet(box, { title: `📕 ${b.ten}` });
  if (review) setTimeout(() => box.querySelector('[data-bk-review]')?.focus(), 250);
  let st = b.trang_thai;
  box.querySelectorAll('[data-bk-st]').forEach((x) => x.onclick = () => { st = x.dataset.bkSt; box.querySelectorAll('[data-bk-st]').forEach((y) => y.classList.toggle('on', y === x)); });
  box.querySelectorAll('[data-bk-rate]').forEach((x) => x.onclick = () => { rate = +x.dataset.bkRate; box.querySelectorAll('[data-bk-rate]').forEach((y) => y.classList.toggle('on', +y.dataset.bkRate <= rate)); });
  const setCover = async (v) => {
    try { await store.update('sach', b.id, { anh_bia: v }); sheet.close(); toast(v ? 'Đã đổi bìa' : 'Đã bỏ bìa', { kind: 'ok' }); setTimeout(() => openBook(b.id), 250); } catch (e) { errorToast(e); }
  };
  box.querySelector('[data-bk-cover]').onclick = () => box.querySelector('[data-bk-file]').click();
  box.querySelector('[data-bk-file]').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    toast('Đang tải ảnh bìa…');
    try { await setCover(await uploadNow(f)); } catch (err) { errorToast(err); }
  };
  box.querySelector('[data-bk-link]').onclick = () => {
    const u = prompt('Dán link ảnh bìa (vd ảnh từ Tiki, Fahasa, Goodreads):', isPhotoId(b.anh_bia) ? '' : b.anh_bia || '');
    if (u === null) return;
    if (u && !/^https:\/\//.test(u.trim())) { toast('Link phải bắt đầu bằng https://'); return; }
    setCover(u.trim());
  };
  box.querySelector('[data-bk-nocover]')?.addEventListener('click', () => setCover(''));
  box.querySelector('[data-bk-edit]').onclick = () => { closeSheet(); setTimeout(() => openRecord('sach', b.id), 200); };
  box.querySelector('[data-bk-read]')?.addEventListener('click', async () => {
    sheet.close();
    if (b.trang_thai !== 'Đang đọc') await store.update('sach', b.id, { trang_thai: 'Đang đọc' }).catch(errorToast);
    setTimeout(() => openReadStart(), 220);
  });
  box.querySelector('[data-bk-save]').onclick = async () => {
    const patch = { trang_thai: st, review: box.querySelector('[data-bk-review]').value.trim(), y_chinh: box.querySelector('[data-bk-ideas]').value.trim() };
    if (rate) patch.danh_gia = rate;
    const mm = box.querySelector('[data-bk-month]');
    if (mm) patch.ke_hoach_thang = mm.checked ? m : '';
    sheet.close();
    try {
      await store.update('sach', b.id, patch);
      if (st === 'Đã đọc' && b.trang_thai !== 'Đã đọc') {
        const n = doneIn(String(year())).length;
        toast(`🎉 Xong cuốn thứ ${n} của năm ${year()}!`, { kind: 'ok', ms: 5000 });
      } else toast('Đã lưu', { kind: 'ok' });
    } catch (e) { errorToast(e); }
  };
}

// ---------------- Mục tiêu đọc ----------------
export function openGoal() {
  const y = year();
  const g = goalOf(y);
  const box = document.createElement('div');
  box.innerHTML = html`
    <label class="rs-lab">Số cuốn trong năm ${y}</label><input class="rs-page" data-g-books type="number" inputmode="numeric" value="${g?.so_sach || 12}">
    <label class="rs-lab">Phút đọc mỗi ngày</label><input class="rs-page" data-g-mins type="number" inputmode="numeric" value="${g?.phut_ngay || 30}">
    <p class="hint">Tháng = số cuốn năm ÷ 12; tuần = phút mỗi ngày × 7. Đánh dấu “Dự định đọc trong tháng này” trên từng cuốn để lên kế hoạch tháng.</p>
    <div class="form-actions"><span class="spacer"></span><button class="btn btn-primary" data-g-save>Lưu</button></div>`.__raw;
  const sheet = openSheet(box, { title: '🎯 Mục tiêu đọc' });
  box.querySelector('[data-g-save]').onclick = async () => {
    const data = { nam: y, so_sach: Number(box.querySelector('[data-g-books]').value) || 12, phut_ngay: Math.max(5, Number(box.querySelector('[data-g-mins]').value) || 30) };
    sheet.close();
    try { if (g && Number(g.nam) === y) await store.update('muc_tieu_doc', g.id, data); else await store.create('muc_tieu_doc', data); toast('Đã lưu mục tiêu', { kind: 'ok' }); } catch (e) { errorToast(e); }
  };
}

export function bindShelf(root, rerender) {
  root.querySelectorAll('[data-shelf-tab]').forEach((b) => b.addEventListener('click', () => { shelfTab = b.dataset.shelfTab; rerender(); }));
  root.querySelectorAll('[data-book]').forEach((c) => c.addEventListener('click', () => openBook(c.dataset.book)));
  root.querySelector('[data-read-goal]')?.addEventListener('click', openGoal);
  root.querySelector('[data-rb-open]')?.addEventListener('click', () => toast('Thanh đếm giờ ở cuối màn hình'));
}

export { isReadingHabit };
