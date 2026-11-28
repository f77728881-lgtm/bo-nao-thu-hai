// 💰 Tài chính — Giai đoạn 1: Tổng quan tháng, Giao dịch (chờ duyệt, lọc), Ngân sách theo danh mục, nhập nhanh vài chạm.
// Dữ liệu ở các bảng giao_dich / danh_muc / ngan_sach_thang / tai_khoan (máy chủ không chép sang Google).
// Tiền là số nguyên VND. "Chuyển nội bộ" không tính vào thu/chi. Chưa có ngưỡng cảnh báo (chờ anh chốt), chỉ báo khi vượt 100%.
import * as store from './store.js';
import { html, raw, today, fmtDate, addDays, fold, weekdayName } from './util.js';
import { openSheet, closeSheet, toast, errorToast } from './ui.js';
import { openRecord } from './form.js';
import { call, isDemo } from './api.js';

let nhan = null; // trạng thái điểm nhận tự động (tải khi mở tab Ngân sách)

let tab = localStorage.getItem('bnth.tcTab') || 'tong_quan';
let thang = today().slice(0, 7);
let loc = { dm: '', tk: '', loai: '' };

// ---------------- Định dạng & tính toán (giống TaiChinh.tongHop phía máy chủ) ----------------
export const tien = (n) => (n === null || n === undefined || n === '' ? '—' : String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ');
const gon = (n) => { const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2).replace('.', ',') + ' tỷ' : a >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' tr' : a >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };
const thangTen = (m) => `Tháng ${+m.slice(5)}/${m.slice(0, 4)}`;
const doiThang = (m, d) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + mm - 1 + d; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };

export function hanMuc(dm, m, ns) {
  const o = ns.find((x) => x.danh_muc_id === dm.id && x.thang === m);
  if (o) return Number(o.han_muc) || 0;
  return dm.han_muc_thang === null || dm.han_muc_thang === undefined || dm.han_muc_thang === '' ? null : Number(dm.han_muc_thang);
}
export function tongHop(m, gd, dm, ns) {
  const list = gd.filter((g) => !g.archived && String(g.ngay || '').slice(0, 7) === m);
  let thu = 0, chi = 0, choDuyet = 0, chuaPL = 0; const theo = {};
  list.forEach((g) => {
    const t = Math.round(Number(g.so_tien) || 0);
    if (g.trang_thai === 'Chờ duyệt') choDuyet++;
    if (g.loai === 'Chuyển nội bộ') return;
    if (g.loai === 'Thu') thu += t; else chi += t;
    if (!g.danh_muc_id) { chuaPL++; return; }
    theo[g.danh_muc_id] = (theo[g.danh_muc_id] || 0) + t;
  });
  const danhMuc = dm.filter((d) => !d.archived).map((d) => { const hm = hanMuc(d, m, ns); const da = theo[d.id] || 0; return { ...d, da, han_muc: hm, ty_le: hm ? Math.round(da / hm * 1000) / 10 : null }; });
  return { thu, chi, con_lai: thu - chi, ty_le_tiet_kiem: thu > 0 ? Math.round((thu - chi) / thu * 1000) / 10 : null, list, cho_duyet: choDuyet, chua_phan_loai: chuaPL, danhMuc };
}
/** Đọc số tiền kiểu nói: 45k, 1tr2, 1,5tr, 150.000 (giống máy chủ). */
export function docSoTien(s) {
  const t = fold(s).replace(/(\d)\s+(?=\d{3}\b)/g, '$1');
  let m = /(\d+(?:[.,]\d+)*)\s*(tr|trieu|cu)\s*(\d{1,3})?\b/.exec(t);
  if (m) return Math.round((Number(m[1].replace(/\./g, '').replace(',', '.')) + (m[3] ? Number('0.' + m[3]) : 0)) * 1e6);
  m = /(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan)\b/.exec(t);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 1000);
  m = /(\d{1,3}(?:[.,]\d{3})+|\d+)/.exec(t);
  if (m) { const n = Number(m[1].replace(/[.,]/g, '')); return n > 0 ? n : null; }
  return null;
}

const DM = () => store.all('danh_muc').sort((a, b) => (a.thu_tu || 99) - (b.thu_tu || 99) || (a.ten < b.ten ? -1 : 1));
const TK = () => store.all('tai_khoan').filter((t) => t.dang_dung !== false);
const name = (t, id) => (id && store.get(t, id)?.ten) || '';

// ---------------- Bộ danh mục gợi ý (chỉ tạo khi anh bấm đồng ý) ----------------
const GOI_Y = [
  ['Chi', 'Ăn uống', '🍜', ['cà phê', 'cafe', 'phở', 'cơm', 'bún', 'ăn sáng', 'trà sữa', 'nhà hàng']],
  ['Chi', 'Đi chợ, siêu thị', '🛒', ['chợ', 'siêu thị', 'winmart', 'bách hóa xanh', 'coopmart', 'vinmart']],
  ['Chi', 'Đi lại', '⛽', ['xăng', 'grab', 'be ', 'taxi', 'gửi xe', 'vé xe', 'sửa xe', 'rửa xe']],
  ['Chi', 'Hóa đơn, tiện ích', '💡', ['tiền điện', 'tiền nước', 'internet', 'cước', 'vnpt', 'viettel', 'fpt', 'mobifone']],
  ['Chi', 'Nhà cửa', '🏠', ['tiền nhà', 'sửa nhà', 'gia dụng']],
  ['Chi', 'Mua sắm', '🛍', ['shopee', 'lazada', 'tiki', 'quần áo', 'giày']],
  ['Chi', 'Con cái, giáo dục', '🎒', ['học phí', 'sách vở', 'trường', 'học thêm']],
  ['Chi', 'Sức khỏe', '💊', ['thuốc', 'bệnh viện', 'khám', 'nha khoa']],
  ['Chi', 'Hiếu hỉ, biếu tặng', '🎁', ['đám cưới', 'mừng', 'phúng viếng', 'biếu', 'quà']],
  ['Chi', 'Giải trí, du lịch', '🎬', ['phim', 'du lịch', 'khách sạn', 'vé máy bay']],
  ['Chi', 'Học tập, phát triển', '📚', ['khóa học', 'mua sách']],
  ['Chi', 'Phí ngân hàng', '🏦', ['phí sms', 'phí thường niên', 'phí chuyển', 'phí quản lý']],
  ['Chi', 'Khác', '•', []],
  ['Thu', 'Lương', '💼', ['lương']],
  ['Thu', 'Thưởng', '🏆', ['thưởng']],
  ['Thu', 'Thu khác', '➕', []]
];
function openGoiY(rerender) {
  const body = html`<p class="hint">Bộ gợi ý để bắt đầu. Hạn mức để trống: tháng đầu chỉ theo dõi, sau đó đặt theo số chi thật. Sửa, xóa (lưu trữ) hay thêm bớt từ khóa lúc nào cũng được.</p>
    <ul class="ios-list hr-kv">${GOI_Y.map(([c, t, ic, k]) => html`<li><span>${ic} ${t}<small class="hr-d">${c}${k.length ? ' · ' + k.join(', ') : ''}</small></span></li>`)}</ul>
    <div class="hr-acts" style="margin-top:12px"><button class="btn btn-primary" data-goiy-ok>Tạo ${GOI_Y.length} danh mục này</button><button class="btn btn-ghost" data-close-sheet>Để tôi tự thêm</button></div>`;
  const sh = openSheet(body.__raw, { title: 'Bộ danh mục gợi ý' });
  sh.body.querySelector('[data-close-sheet]').onclick = () => sh.close();
  sh.body.querySelector('[data-goiy-ok]').onclick = async () => {
    try {
      const have = new Set(DM().map((d) => fold(d.ten)));
      let i = 0;
      for (const [chieu, ten, ic, kw] of GOI_Y) { i++; if (!have.has(fold(ten))) await store.create('danh_muc', { ten, chieu, bieu_tuong: ic, tu_khoa: kw.map((x) => x.trim()), thu_tu: i }); }
      sh.close(); toast('Đã tạo danh mục', { kind: 'ok' }); rerender();
    } catch (e) { errorToast(e); }
  };
}

// ---------------- Nhập nhanh ----------------
export function openThem(rerender, preset = {}) {
  let loai = preset.loai || 'Chi', dmId = '', tkId = TK()[0]?.id || '', tkDen = '';
  const box = document.createElement('div');
  const draw = () => {
    const dms = DM().filter((d) => d.chieu === (loai === 'Thu' ? 'Thu' : 'Chi'));
    box.innerHTML = html`
      <div class="seg tc-loai">${['Chi', 'Thu', 'Chuyển nội bộ'].map((l) => html`<button class="${loai === l ? 'on' : ''}" data-l="${l}">${l === 'Chuyển nội bộ' ? 'Nội bộ' : l}</button>`)}</div>
      <input class="tc-tien" data-tien inputmode="text" placeholder="Số tiền: 45k, 1tr2, 150.000" autocomplete="off">
      <p class="tc-xem" data-xem></p>
      <input class="tc-nd" data-nd placeholder="Nội dung (vd: cà phê với đối tác)" autocomplete="off">
      ${loai !== 'Chuyển nội bộ' ? html`<h5 class="hr-sub">Danh mục</h5><div class="tc-chips">${dms.length ? dms.map((d) => html`<button class="chip ${dmId === d.id ? 'on' : ''}" data-dm="${d.id}">${d.bieu_tuong || ''} ${d.ten}</button>`) : html`<small class="hint">Chưa có danh mục — giao dịch sẽ vào Chờ duyệt.</small>`}</div>` : ''}
      ${TK().length ? html`<h5 class="hr-sub">${loai === 'Chuyển nội bộ' ? 'Từ' : 'Nguồn tiền'}</h5><div class="tc-chips">${TK().map((t) => html`<button class="chip ${tkId === t.id ? 'on' : ''}" data-tk="${t.id}">${t.ten}</button>`)}</div>` : ''}
      ${loai === 'Chuyển nội bộ' && TK().length ? html`<h5 class="hr-sub">Đến</h5><div class="tc-chips">${TK().map((t) => html`<button class="chip ${tkDen === t.id ? 'on' : ''}" data-tkden="${t.id}">${t.ten}</button>`)}</div>` : ''}
      <div class="field" style="margin-top:10px"><label>Ngày</label><input type="date" data-ngay value="${preset.ngay || today()}"></div>
      <button class="btn btn-primary tc-luu" data-luu>Lưu</button>`.__raw;
    const tien = box.querySelector('[data-tien]'), xem = box.querySelector('[data-xem]');
    tien.oninput = () => { const n = docSoTien(tien.value); xem.textContent = n ? tien_(n) : ''; };
    box.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { keep(); loai = b.dataset.l; dmId = ''; draw(); restore(); }));
    box.querySelectorAll('[data-dm]').forEach((b) => (b.onclick = () => { keep(); dmId = dmId === b.dataset.dm ? '' : b.dataset.dm; draw(); restore(); }));
    box.querySelectorAll('[data-tk]').forEach((b) => (b.onclick = () => { keep(); tkId = tkId === b.dataset.tk ? '' : b.dataset.tk; draw(); restore(); }));
    box.querySelectorAll('[data-tkden]').forEach((b) => (b.onclick = () => { keep(); tkDen = tkDen === b.dataset.tkden ? '' : b.dataset.tkden; draw(); restore(); }));
    box.querySelector('[data-luu]').onclick = save;
  };
  const tien_ = (n) => tien(n);
  let kept = {};
  const keep = () => { kept = { t: box.querySelector('[data-tien]')?.value, n: box.querySelector('[data-nd]')?.value, d: box.querySelector('[data-ngay]')?.value }; };
  const restore = () => { if (kept.t !== undefined) { box.querySelector('[data-tien]').value = kept.t; box.querySelector('[data-tien]').oninput(); } if (kept.n !== undefined) box.querySelector('[data-nd]').value = kept.n; if (kept.d) box.querySelector('[data-ngay]').value = kept.d; };
  async function save() {
    const so = docSoTien(box.querySelector('[data-tien]').value);
    if (!so) { toast('Nhập số tiền (vd: 45k)'); return; }
    const data = { ngay: box.querySelector('[data-ngay]').value || today(), so_tien: so, loai, noi_dung: box.querySelector('[data-nd]').value.trim(), cach_ghi: 'Nhập tay' };
    if (dmId) data.danh_muc_id = dmId;
    if (tkId) data.tai_khoan_id = tkId;
    if (loai === 'Chuyển nội bộ' && tkDen) data.tai_khoan_den_id = tkDen;
    data.trang_thai = loai === 'Chuyển nội bộ' || dmId ? 'Đã duyệt' : 'Chờ duyệt';
    try { await store.create('giao_dich', data); sh.close(); toast(`Đã ghi ${loai === 'Thu' ? '+' : loai === 'Chi' ? '−' : ''}${tien(so)}`, { kind: 'ok' }); rerender?.(); } catch (e) { errorToast(e); }
  }
  const sh = openSheet(box, { title: preset.title || 'Ghi thu chi' });
  draw();
  setTimeout(() => box.querySelector('[data-tien]')?.focus(), 250);
}

// ---------------- Hạn mức ----------------
function openHanMuc(d, rerender) {
  const cur = hanMuc(d, thang, store.all('ngan_sach_thang'));
  const body = html`<p class="row-meta">${d.ten} · ${thangTen(thang)}</p>
    <input class="tc-tien" data-hm inputmode="text" value="${cur ?? ''}" placeholder="Hạn mức: 3tr, 500k (để trống = không đặt)">
    <p class="tc-xem" data-xem>${cur ? tien(cur) : ''}</p>
    <div class="hr-acts"><button class="btn btn-primary" data-moi>Áp dụng mọi tháng</button><button class="btn" data-mot>Chỉ ${thangTen(thang).toLowerCase()}</button></div>`;
  const sh = openSheet(body.__raw, { title: 'Hạn mức' });
  const inp = sh.body.querySelector('[data-hm]'), xem = sh.body.querySelector('[data-xem]');
  inp.oninput = () => { const n = docSoTien(inp.value); xem.textContent = n ? tien(n) : ''; };
  const val = () => (inp.value.trim() ? docSoTien(inp.value) : null);
  sh.body.querySelector('[data-moi]').onclick = async () => { try { await store.update('danh_muc', d.id, { han_muc_thang: val() }); sh.close(); rerender(); } catch (e) { errorToast(e); } };
  sh.body.querySelector('[data-mot]').onclick = async () => {
    const v = val(); if (v === null) { toast('Nhập số tiền'); return; }
    const o = store.all('ngan_sach_thang').find((x) => x.danh_muc_id === d.id && x.thang === thang);
    try { if (o) await store.update('ngan_sach_thang', o.id, { han_muc: v }); else await store.create('ngan_sach_thang', { thang, danh_muc_id: d.id, han_muc: v }); sh.close(); rerender(); } catch (e) { errorToast(e); }
  };
}

// ---------------- Các tab ----------------
const bar = (d) => {
  const pct = d.han_muc ? Math.min(100, d.da / d.han_muc * 100) : 0;
  return html`<li><button class="tc-dm" data-hm-dm="${d.id}">
    <div class="tc-dm-h"><span>${d.bieu_tuong || ''} ${d.ten}</span><b>${tien(d.da)}</b></div>
    ${d.han_muc ? html`<div class="tc-bar ${d.da > d.han_muc ? 'vuot' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>
      <small>${d.ty_le}% hạn mức ${tien(d.han_muc)}${d.da > d.han_muc ? html` · <b class="down">vượt ${tien(d.da - d.han_muc)}</b>` : html` · còn ${tien(d.han_muc - d.da)}`}</small>`
      : html`<small class="hint">Chưa đặt hạn mức — chạm để đặt</small>`}
  </button></li>`;
};

function tongQuan(s) {
  const chi = s.danhMuc.filter((d) => d.chieu !== 'Thu' && (d.da || d.han_muc)).sort((a, b) => (b.ty_le || 0) - (a.ty_le || 0) || b.da - a.da);
  return html`
    <div class="hr-kpis tc-kpis">
      <div class="hr-kpi"><b class="up">${gon(s.thu)}</b><small>Thu</small></div>
      <div class="hr-kpi"><b class="down">${gon(s.chi)}</b><small>Chi</small></div>
      <div class="hr-kpi"><b>${gon(s.con_lai)}</b><small>Còn lại</small></div>
      <div class="hr-kpi"><b>${s.ty_le_tiet_kiem === null ? '—' : String(s.ty_le_tiet_kiem).replace('.', ',') + '%'}</b><small>Tỷ lệ tiết kiệm</small></div>
    </div>
    ${s.cho_duyet ? html`<button class="tc-cho" data-tab-go="giao_dich">🕓 ${s.cho_duyet} giao dịch chờ duyệt — chạm để phân loại</button>` : ''}
    ${s.danhMuc.some((d) => d.han_muc && d.da > d.han_muc && d.chieu !== 'Thu') ? html`<p class="hr-err">Vượt hạn mức: ${s.danhMuc.filter((d) => d.han_muc && d.da > d.han_muc && d.chieu !== 'Thu').map((d) => d.ten).join(', ')}</p>` : ''}
    <h4 class="ios-g">Chi theo danh mục</h4>
    ${chi.length ? html`<ul class="ios-list">${chi.map(bar)}</ul>` : html`<p class="empty">Chưa có khoản chi nào trong tháng.</p>`}
    ${s.chua_phan_loai ? html`<p class="hr-src">${s.chua_phan_loai} giao dịch chưa có danh mục (vẫn tính vào tổng thu/chi).</p>` : ''}`;
}

function giaoDich(s) {
  const pend = s.list.filter((g) => g.trang_thai === 'Chờ duyệt').sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const rows = s.list.filter((g) => g.trang_thai !== 'Chờ duyệt')
    .filter((g) => (!loc.dm || g.danh_muc_id === loc.dm) && (!loc.tk || g.tai_khoan_id === loc.tk || g.tai_khoan_den_id === loc.tk) && (!loc.loai || g.loai === loc.loai))
    .sort((a, b) => (a.ngay + (a.gio || '') < b.ngay + (b.gio || '') ? 1 : -1));
  const byDay = {}; rows.forEach((g) => { (byDay[g.ngay] = byDay[g.ngay] || []).push(g); });
  const row = (g, pending) => {
    const sign = g.loai === 'Thu' ? '+' : g.loai === 'Chi' ? '−' : '⇄';
    const d = g.danh_muc_id ? store.get('danh_muc', g.danh_muc_id) : null;
    return html`<li class="tc-row ${pending ? 'cho' : ''}"><button class="tc-g" data-gd="${g.id}">
      <span class="tc-ic">${d?.bieu_tuong || (g.loai === 'Thu' ? '➕' : g.loai === 'Chi' ? '•' : '⇄')}</span>
      <span class="tc-t"><b>${g.noi_dung || d?.ten || g.loai}</b><small>${[d?.ten, name('tai_khoan', g.tai_khoan_id), g.gio, pending ? fmtDate(g.ngay) : ''].filter(Boolean).join(' · ')}</small></span>
      <span class="tc-so ${g.loai === 'Thu' ? 'up' : g.loai === 'Chi' ? 'down' : ''}">${sign}${tien(g.so_tien)}</span></button>
      ${pending && g.loai !== 'Chuyển nội bộ' ? html`<div class="tc-chips pl">${DM().filter((x) => x.chieu === (g.loai === 'Thu' ? 'Thu' : 'Chi')).map((x) => html`<button class="chip" data-pl="${g.id}|${x.id}">${x.bieu_tuong || ''} ${x.ten}</button>`)}</div>` : ''}
    </li>`;
  };
  return html`
    ${pend.length ? html`<h4 class="ios-g tc-cho-h">🕓 Chờ duyệt · ${pend.length}</h4><ul class="ios-list">${pend.map((g) => row(g, true))}</ul>` : ''}
    <div class="tc-loc">
      <select data-loc="loai"><option value="">Tất cả</option>${['Chi', 'Thu', 'Chuyển nội bộ'].map((l) => html`<option ${loc.loai === l ? 'selected' : ''}>${l}</option>`)}</select>
      <select data-loc="dm"><option value="">Mọi danh mục</option>${DM().map((d) => html`<option value="${d.id}" ${loc.dm === d.id ? 'selected' : ''}>${d.ten}</option>`)}</select>
      ${TK().length ? html`<select data-loc="tk"><option value="">Mọi nguồn</option>${TK().map((t) => html`<option value="${t.id}" ${loc.tk === t.id ? 'selected' : ''}>${t.ten}</option>`)}</select>` : ''}
    </div>
    ${rows.length ? Object.keys(byDay).map((d) => {
      const net = byDay[d].reduce((a, g) => a + (g.loai === 'Thu' ? 1 : g.loai === 'Chi' ? -1 : 0) * g.so_tien, 0);
      return html`<h5 class="hr-sub">${weekdayName(d)}, ${fmtDate(d)} <small>${net ? (net > 0 ? '+' : '−') + tien(Math.abs(net)) : ''}</small></h5><ul class="ios-list">${byDay[d].map((g) => row(g, false))}</ul>`;
    }) : html`<p class="empty">${pend.length ? 'Không có giao dịch đã duyệt khớp bộ lọc.' : 'Chưa có giao dịch trong tháng. Bấm ＋ để ghi.'}</p>`}`;
}

function nganSach(s) {
  const chi = s.danhMuc.filter((d) => d.chieu !== 'Thu');
  const thu = s.danhMuc.filter((d) => d.chieu === 'Thu');
  const coHm = chi.filter((d) => d.han_muc);
  const tongHm = coHm.reduce((a, d) => a + d.han_muc, 0), daHm = coHm.reduce((a, d) => a + d.da, 0);
  return html`
    ${tongHm ? html`<p class="hr-note">${coHm.length} danh mục có hạn mức: đã chi ${tien(daHm)} / ${tien(tongHm)} (${String(Math.round(daHm / tongHm * 1000) / 10).replace('.', ',')}%).${coHm.length < chi.length ? ` ${chi.length - coHm.length} danh mục chưa đặt hạn mức.` : ''}</p>` : html`<p class="hint">Chưa đặt hạn mức nào. Gợi ý: tháng đầu chỉ ghi chép, sang tháng sau đặt hạn mức theo số chi thật.</p>`}
    <h4 class="ios-g">Danh mục chi · chạm để đặt hạn mức</h4>
    ${chi.length ? html`<ul class="ios-list">${chi.map(bar)}</ul>` : ''}
    ${thu.length ? html`<h4 class="ios-g">Danh mục thu</h4><ul class="ios-list hr-kv">${thu.map((d) => html`<li><span>${d.bieu_tuong || ''} ${d.ten}</span><b class="up">${tien(d.da)}</b></li>`)}</ul>` : ''}
    <div class="hr-acts" style="margin-top:12px"><button class="btn" data-new-dm>＋ Danh mục</button><button class="btn btn-ghost" data-sua-dm>Sửa danh mục, từ khóa</button></div>
    <h4 class="ios-g">Nguồn tiền</h4>
    ${TK().length ? html`<ul class="ios-list hr-kv">${store.all('tai_khoan').map((t) => html`<li><span><button class="link" data-tk-sua="${t.id}">${t.ten}</button><small class="hr-d">${[t.loai, t.ngan_hang, t.nhan_dien ? '…' + t.nhan_dien : ''].filter(Boolean).join(' · ')}</small></span></li>`)}</ul>` : html`<p class="hint">Chưa có nguồn tiền (ví, tài khoản lương…). Không bắt buộc ở giai đoạn này.</p>`}
    <div class="hr-acts"><button class="btn" data-new-tk>＋ Nguồn tiền</button></div>
    <p class="hr-src">Không ghi số tài khoản, số thẻ hay số dư. “Nhận diện” chỉ cần tối đa 4 số cuối để khớp tin báo ngân hàng.</p>
    <h4 class="ios-g">Nhận tự động từ email Timo</h4>
    <div class="ans tc-nhan">${nhan === null ? html`<p class="hint">Đang tải trạng thái…</p>` : html`
      <p>${nhan.mail_loi ? html`⚠️ ${nhan.mail_loi}` : nhan.mail_luc ? html`✅ Đang chạy · kiểm tra Gmail gần nhất ${hhmm(nhan.mail_luc)}` : '⏳ Chưa kiểm tra lần nào'}
        <br><small class="hint">${nhan.so_tin} giao dịch tự động${nhan.tin_luc ? ` · giao dịch gần nhất ${hhmm(nhan.tin_luc)}` : ''}${nhan.bo_qua ? ` · ${nhan.bo_qua} thư không phải biến động` : ''}</small></p>
      <div class="hr-acts"><button class="btn" data-mail-ngay>Kiểm tra email ngay</button></div>
      <p class="hint">Máy chủ tự đọc email từ support@timo.vn mỗi 5 phút (6:00–23:30), chỉ đọc, không sửa gì trong Gmail. Số dư và số tài khoản bị bỏ ngay khi đọc.</p>`}</div>`;
}

async function loadNhan(rerender) {
  try { nhan = isDemo() ? { co_khoa: false, so_tin: 0 } : await call('tc_nhan_trang_thai'); } catch (e) { nhan = { co_khoa: false, so_tin: 0, loi: true }; }
  rerender();
}
const hhmm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
async function mailNgay(rerender, btn) {
  if (isDemo()) return toast('Bản thử không đọc email');
  btn.disabled = true; btn.textContent = 'Đang đọc Gmail…';
  try { const r = await call('tc_mail_ngay'); toast(r.da_ghi ? `Đã ghi ${r.da_ghi} giao dịch mới` : 'Không có giao dịch mới', { kind: 'ok' }); }
  catch (e) { errorToast(e); }
  nhan = null; loadNhan(rerender);
}

/** Sau khi phân loại một giao dịch tự động: đề xuất quy tắc "lần sau tự xếp" (anh đồng ý mới lưu). */
function deXuatQuyTac(g, dmId) {
  const d = store.get('danh_muc', dmId);
  if (!d || !g.noi_dung || g.cach_ghi !== 'Tự động') return;
  const goiY = g.noi_dung.replace(/\b(chuyen tien|chuyển tiền|tu timo|từ timo|from my timo|sent by|thanh toan|thanh toán)\b/ig, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!goiY) return;
  const body = html`<p>Lần sau nội dung có chữ này thì tự xếp vào <b>${d.bieu_tuong || ''} ${d.ten}</b>?</p>
    <input class="tc-nd" data-kw value="${goiY}"><p class="hint">Sửa cho ngắn và đặc trưng (vd: “winmart”, “grab”). Tránh tên người hay chữ chung chung.</p>
    <div class="hr-acts"><button class="btn btn-primary" data-kw-ok>Lưu quy tắc</button><button class="btn btn-ghost" data-kw-no>Không</button></div>`;
  const sh = openSheet(body.__raw, { title: 'Tự phân loại' });
  sh.body.querySelector('[data-kw-no]').onclick = () => sh.close();
  sh.body.querySelector('[data-kw-ok]').onclick = async () => {
    const kw = sh.body.querySelector('[data-kw]').value.trim().toLowerCase();
    if (kw.length < 2) { toast('Từ khóa quá ngắn'); return; }
    try { await store.update('danh_muc', d.id, { tu_khoa: [...new Set([...(d.tu_khoa || []), kw])] }); sh.close(); toast(`Đã thêm “${kw}” vào ${d.ten}`, { kind: 'ok' }); } catch (e) { errorToast(e); }
  };
}

export function financeView() {
  const s = tongHop(thang, store.all('giao_dich'), store.all('danh_muc'), store.all('ngan_sach_thang'));
  const empty = !store.all('danh_muc').length;
  const body = { tong_quan: tongQuan, giao_dich: giaoDich, ngan_sach: nganSach }[tab] || tongQuan;
  return html`<header class="page-head"><h1>Tài chính</h1><div class="hr-head-acts"><button class="icon-btn" data-tc-them aria-label="Ghi thu chi">＋</button></div></header>
    <div class="tc-thang"><button class="icon-btn" data-thang="-1" aria-label="Tháng trước">‹</button><b>${thangTen(thang)}</b><button class="icon-btn" data-thang="1" aria-label="Tháng sau">›</button>${thang !== today().slice(0, 7) ? html`<button class="link" data-thang="0">Về tháng này</button>` : ''}</div>
    <div class="seg hr-tabs">${[['tong_quan', 'Tổng quan'], ['giao_dich', 'Giao dịch'], ['ngan_sach', 'Ngân sách']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-tc-tab="${k}">${l}${k === 'giao_dich' && s.cho_duyet ? html` <small class="tc-badge">${s.cho_duyet}</small>` : ''}</button>`)}</div>
    ${empty ? html`<div class="ans tc-batdau"><b>Bắt đầu</b><p class="hint">Chưa có danh mục thu chi. Dùng bộ gợi ý (xem trước rồi mới tạo) hoặc tự thêm.</p><div class="hr-acts"><button class="btn btn-primary" data-goiy>Xem bộ danh mục gợi ý</button><button class="btn" data-new-dm>Tự thêm</button></div></div>` : ''}
    ${body(s)}`;
}

export function bindFinance(main, rerender) {
  main.querySelectorAll('[data-tc-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tcTab; localStorage.setItem('bnth.tcTab', tab); rerender(); }));
  main.querySelectorAll('[data-tab-go]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tabGo; rerender(); }));
  main.querySelectorAll('[data-thang]').forEach((b) => b.addEventListener('click', () => { const d = +b.dataset.thang; thang = d ? doiThang(thang, d) : today().slice(0, 7); rerender(); }));
  main.querySelector('[data-tc-them]')?.addEventListener('click', () => openThem(rerender));
  main.querySelector('[data-goiy]')?.addEventListener('click', () => openGoiY(rerender));
  main.querySelectorAll('[data-new-dm]').forEach((b) => b.addEventListener('click', () => openRecord('danh_muc', null, { chieu: 'Chi' })));
  main.querySelector('[data-sua-dm]')?.addEventListener('click', () => { const d = DM()[0]; if (d) openRecord('danh_muc', d.id); });
  main.querySelector('[data-new-tk]')?.addEventListener('click', () => openRecord('tai_khoan', null, { loai: 'Ngân hàng', dang_dung: true }));
  main.querySelectorAll('[data-tk-sua]').forEach((b) => b.addEventListener('click', () => openRecord('tai_khoan', b.dataset.tkSua)));
  main.querySelectorAll('[data-hm-dm]').forEach((b) => b.addEventListener('click', () => { const d = store.get('danh_muc', b.dataset.hmDm); if (d) openHanMuc(d, rerender); }));
  main.querySelectorAll('[data-gd]').forEach((b) => b.addEventListener('click', () => openRecord('giao_dich', b.dataset.gd)));
  main.querySelectorAll('[data-loc]').forEach((s) => s.addEventListener('change', () => { loc[s.dataset.loc] = s.value; rerender(); }));
  main.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [gid, did] = b.dataset.pl.split('|');
    const g = store.get('giao_dich', gid);
    try { await store.update('giao_dich', gid, { danh_muc_id: did, trang_thai: 'Đã duyệt' }); toast('Đã phân loại: ' + name('danh_muc', did), { kind: 'ok' }); rerender(); deXuatQuyTac(g, did); } catch (err) { errorToast(err); }
  }));
  if (tab === 'ngan_sach' && nhan === null) loadNhan(rerender);
  main.querySelector('[data-mail-ngay]')?.addEventListener('click', (e) => mailNgay(rerender, e.currentTarget));
}

/** Dòng gọn cho ô Tìm: "chi tiêu tháng này". */
export function financeSummary(m) {
  return tongHop(m, store.all('giao_dich'), store.all('danh_muc'), store.all('ngan_sach_thang'));
}
