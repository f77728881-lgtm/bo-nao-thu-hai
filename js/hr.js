// Nhân sự: số liệu lấy tự động từ 3 tệp Excel trên OneDrive (Biến động · Cơ cấu · Thẩm định).
// Máy chủ tải lúc 8:10 và 14:10 mỗi ngày; bấm ↻ để tải ngay. Dữ liệu giữ trong máy để xem khi mất mạng.
import { call, isDemo } from './api.js';
import { html, raw, esc, fold, fmtDate, today } from './util.js';
import { openSheet, closeSheet, toast, errorToast, onTyping } from './ui.js';
import { unitStats } from './ask.js';

const KEY = 'bnth.ns';
let st = null;            // { du_lieu, cau_hinh, ket_noi, ket_noi_luc, ket_noi_loi }
let tab = localStorage.getItem('bnth.nsTab') || 'bien_dong';
let month = '';           // YYYY-MM cho danh sách quyết định
let q = '';               // ô tìm
let unit = localStorage.getItem('bnth.nsUnit') || '';
let tdFilter = 'all';
let loading = false;

try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }

let lastLoad = 0;          // lần tải gần nhất trong phiên này (bản trong máy có thể đã cũ)
async function load(rerender) {
  if (isDemo() || loading) return;
  loading = true;
  try {
    st = await call('ns_xem');
    lastLoad = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* đầy bộ nhớ: bỏ qua */ }
    rerender?.();
  } catch (e) { if (!st) errorToast(e); } finally { loading = false; }
}

// ---------------- Định dạng ----------------
const dot = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function num(v, name = '') {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v !== 'number') return String(v);
  if (/tỷ lệ|tỉ lệ|chiếm/i.test(name) && Math.abs(v) <= 1.5) return (v * 100).toFixed(1).replace('.', ',') + '%';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' tr';
  if (!Number.isInteger(v)) return v.toFixed(Math.abs(v) < 10 ? 2 : 1).replace('.', ',');
  return dot(v);
}
const money = (v) => (typeof v === 'number' ? (v >= 1e9 ? (v / 1e9).toFixed(2).replace('.', ',') + ' tỷ' : dot(Math.round(v / 1e6)) + ' tr') : '—');
const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
const daysTo = (ymd) => Math.round((new Date(ymd + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5);
const norm = (s) => fold(s).replace(/^(dien luc|đien luc)\s+/, '');

/** Nhãn VIẾT HOA → viết thường kiểu câu, giữ từ viết tắt (CBQL, HRMS). */
function label(t) {
  if (t !== t.toUpperCase()) return t;
  const w = t.split(' ').map((x) => (/^\(?[A-Z]{2,5}\)?$/.test(x) ? x : x.toLowerCase())).join(' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function kpis(list) {
  if (!list || !list.length) return raw('');
  return html`<div class="hr-kpis">${list.map((k) => html`<div class="hr-kpi"><b>${num(k.gia_tri, k.ten)}</b><small>${label(k.ten)}</small></div>`)}</div>`;
}

function srcLine(d) {
  if (!d) return raw('');
  return html`<p class="hr-src">${d.tep ? html`📄 ${d.tep}` : ''}${d.sua_luc ? html` · sửa ${when(d.sua_luc)}` : ''}${d.loi ? html`<br><span class="hr-err">Lần tải gần nhất lỗi: ${d.loi}</span>` : ''}</p>`;
}

// ---------------- Biến động ----------------
function bienDong(d) {
  if (!d || !d.chi_so) return empty('Biến động nhân sự');
  const qds = d.quyet_dinh || [];
  const months = [...new Set(qds.map((x) => (x.ngay || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  if (!month || !months.includes(month)) month = months.includes(today().slice(0, 7)) ? today().slice(0, 7) : months[0] || '';
  const f = fold(q);
  const list = qds.filter((x) => (f ? fold([x.ten, x.loai, x.tu, x.den, x.qd, x.cd_moi].join(' ')).includes(f) : (x.ngay || '').startsWith(month)))
    .sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const groups = {};
  list.forEach((x) => { (groups[x.loai] = groups[x.loai] || []).push(x); });
  const mi = d.thang_cot ? Math.max(0, Number(d.thang) - 1) : -1;
  const changed = ((d.don_vi_thang && d.don_vi_thang.dong) || []).filter((r) => r.I || r.D || r.E || r.F || r.G);
  return html`
    <h4 class="ios-g">Tháng ${d.thang || '?'}</h4>${kpis(d.chi_so)}
    <h4 class="ios-g">Quyết định nhân sự</h4>
    <div class="hr-tools">
      <input class="hr-q" type="search" placeholder="Tìm tên, đơn vị, số QĐ…" value="${q}" data-hr-q autocomplete="off" autocorrect="off" spellcheck="false">
      <select data-hr-month>${months.map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>Tháng ${+m.slice(5)}/${m.slice(0, 4)}</option>`)}</select>
    </div>
    <div class="hr-res">
    ${list.length ? Object.keys(groups).map((g) => html`<h5 class="hr-sub">${g} <small>${groups[g].length}</small></h5>
      <ul class="ios-list">${groups[g].map((x) => html`<li><div class="hr-qd">
        <div class="hr-qd-h"><b>${x.ten}</b><span>${x.ngay ? fmtDate(x.ngay, true) : ''}</span></div>
        ${x.tu || x.den ? html`<div class="hr-qd-m">${x.tu || '—'}${x.den ? html` → <b>${x.den}</b>` : ''}</div>` : ''}
        ${x.cd_moi ? html`<div class="hr-qd-m">${x.cd_moi}</div>` : ''}
        <div class="hr-qd-f">${x.qd ? html`<span class="hr-tag">QĐ ${x.qd}</span>` : html`<span class="hr-tag warn">chưa có số QĐ</span>`}${x.ghi_chu ? html` <small>${x.ghi_chu}</small>` : ''}</div>
      </div></li>`)}</ul>`) : html`<p class="empty">${f ? 'Không thấy quyết định nào khớp.' : 'Tháng này chưa có quyết định.'}</p>`}
    ${d.theo_thang && d.theo_thang.length ? html`<h4 class="ios-g">Số liệu theo tháng</h4>
      <ul class="ios-list hr-kv">${d.theo_thang.map((r) => html`<li><span>${r.ten}</span><b>${num(r.so[mi])}</b><small>cả năm ${num(r.so[r.so.length - 1])}</small></li>`)}</ul>` : ''}
    ${changed.length ? html`<h4 class="ios-g">Đơn vị có biến động trong tháng</h4>
      <ul class="ios-list hr-kv">${changed.map((r) => html`<li><span>${r.B}${r.J ? html`<small class="hr-d">${r.J}</small>` : ''}</span><b>${r.C} → ${r.H}</b><small class="${r.I > 0 ? 'up' : r.I < 0 ? 'down' : ''}">${r.I > 0 ? '+' : ''}${r.I || 0}</small></li>`)}</ul>` : ''}
    ${srcLine(d)}</div>`;
}

// ---------------- Cơ cấu ----------------
function coCau(d) {
  if (!d || !d.bang) return empty('Cơ cấu lao động');
  const cols = d.bang.cot, rows = d.bang.dong.filter((r) => r.B && r.A !== 'PB' && !/^(tổng|cộng)/i.test(String(r.B).trim()));
  const totalRow = d.bang.dong.find((r) => /^(tổng|cộng)/i.test(String(r.B).trim()));
  const names = rows.map((r) => String(r.B).trim());
  const cur = unit && names.includes(unit) ? rows[names.indexOf(unit)] : null;
  const r = cur || totalRow || null;
  const u = r ? unitStats(d, r) : null;
  const nam = u && u.nam, nu = u && u.nu, tong = u ? u.lao_dong : 0, dbGl = u && u.db_gl, dbTt = u && u.db_tt;
  const gap = (n) => (n < 0 ? html`<b class="down">thiếu ${-n} người</b>` : n > 0 ? html`<b class="up">thừa ${n} người</b>` : html`<b>đủ</b>`);
  const edu = u ? u.trinh_do : [];
  const eduSum = edu.reduce((s, x) => s + x[1], 0) || 1;
  const age = u ? u.tuoi : [];
  const groups = {};
  cols.filter((c) => c.c !== 'A' && c.c !== 'B').forEach((c) => { const g = c.ten.includes(' · ') ? c.ten.split(' · ')[0] : 'Khác'; (groups[g] = groups[g] || []).push(c); });
  return html`
    <div class="hr-tools"><select data-hr-unit class="hr-unit"><option value="">${totalRow ? 'Toàn công ty' : '— Chọn đơn vị —'}</option>${names.map((n) => html`<option ${n === unit ? 'selected' : ''}>${n}</option>`)}</select></div>
    ${!r ? html`<p class="empty">Chọn một đơn vị để xem cơ cấu.</p>` : html`
    <div class="hr-kpis">
      <div class="hr-kpi"><b>${tong ? num(tong) : '—'}</b><small>Lao động</small></div>
      <div class="hr-kpi"><b>${num(dbGl)}</b><small>Định biên giao lương</small></div>
      <div class="hr-kpi"><b>${num(dbTt)}</b><small>Định biên tính toán</small></div>
      <div class="hr-kpi"><b>${tong ? num((Number(nu) || 0) / tong, 'tỷ lệ') : '—'}</b><small>Nữ ${num(nu)} · Nam ${num(nam)}</small></div>
      <div class="hr-kpi"><b>${num(u.tuoi_bq)}</b><small>Tuổi bình quân</small></div>
      <div class="hr-kpi"><b>${num(u.dang_vien)}</b><small>Đảng viên</small></div>
    </div>
    ${dbGl == null ? html`<p class="hr-src">Định biên: tệp chỉ có cho các Điện lực (sheet So sánh).</p>` : ''}
    ${typeof dbGl === 'number' && tong ? html`<p class="hr-note">Thực tế <b>${num(tong)}</b> / định biên giao lương <b>${num(dbGl)}</b>: ${gap(tong - dbGl)} (đạt ${num(tong / dbGl, 'tỷ lệ')}).
      ${typeof dbTt === 'number' ? html`<br>So với định biên tính toán ${num(dbTt)}: ${gap(tong - dbTt)}.` : ''}</p>` : ''}
    <h4 class="ios-g">Trình độ</h4>
    <div class="hr-bars">${edu.map(([l, n]) => html`<div class="hr-bar"><span>${l}</span><i style="width:${(n / eduSum * 100).toFixed(1)}%"></i><b>${n}</b></div>`)}</div>
    ${age.length ? html`<h4 class="ios-g">Tuổi đời</h4><div class="hr-bars">${age.map(([l, n]) => html`<div class="hr-bar"><span>${l}</span><i style="width:${(n / (tong || 1) * 100).toFixed(1)}%"></i><b>${n}</b></div>`)}</div>` : ''}
    <details class="hr-all"><summary>Tất cả cột của bảng Cơ cấu</summary>
      ${Object.keys(groups).map((g) => html`<h5 class="hr-sub">${g}</h5><ul class="ios-list hr-kv">${groups[g].map((c) => html`<li><span>${c.ten.includes(' · ') ? c.ten.split(' · ').slice(1).join(' · ') : c.ten}</span><b>${num(r[c.c], c.ten)}</b></li>`)}</ul>`)}
    </details>`}
    ${d.bao_cao ? html`<button class="btn" data-hr-report style="margin-top:12px">📋 Báo cáo viết lời — sao chép gửi đi</button>` : ''}
    <p class="hr-src">${d.den_ngay ? html`Số liệu đến ${fmtDate(d.den_ngay, true)}` : ''}${d.tuoi_bq ? html` · tuổi BQ toàn công ty ${d.tuoi_bq}` : ''}${d.thang_thu_muc ? html` · thư mục ${d.thang_thu_muc}` : ''}</p>
    ${srcLine(d)}`;
}

// ---------------- Thẩm định ----------------
const TT = { '01': 'Đã nhận', '02': 'Đang thẩm định', '03': 'Đã thẩm định', '04': 'Đã ĐK D-Office' };
const ttLabel = (s) => TT[String(s || '').slice(0, 2)] || String(s || '').replace(/^\d+_/, '').replace(/_/g, ' ');
function thamDinh(d) {
  if (!d || !d.ho_so) return empty('Theo dõi thẩm định');
  const f = fold(q);
  const flt = {
    all: () => true,
    dang: (x) => /^0[12]/.test(x.trang_thai || ''),
    xong: (x) => /^03/.test(x.trang_thai || ''),
    do: (x) => /^04/.test(x.trang_thai || ''),
    tre: (x) => x.tinh_trang_han === 'Trễ hạn'
  };
  const counts = Object.fromEntries(Object.keys(flt).map((k) => [k, d.ho_so.filter(flt[k]).length]));
  const list = d.ho_so.filter(flt[tdFilter] || flt.all).filter((x) => !f || fold([x.ma, x.ten, x.loai, x.khu_vuc, x.nguoi_gui, x.vb_so, x.dot].join(' ')).includes(f))
    .sort((a, b) => ((a.ngay_nhan || '') < (b.ngay_nhan || '') ? 1 : -1));
  return html`
    ${kpis(d.chi_so)}
    <div class="hr-tools"><input class="hr-q" type="search" placeholder="Tìm tên công trình, mã, số VB…" value="${q}" data-hr-q autocomplete="off" autocorrect="off" spellcheck="false"></div>
    <div class="hr-res">
    <div class="hr-chips">${[['all', 'Tất cả'], ['dang', 'Đang xử lý'], ['xong', 'Đã thẩm định'], ['do', 'Đã ĐK D-Office'], ['tre', 'Trễ hạn']].map(([k, l]) => html`<button class="chip ${tdFilter === k ? 'on' : ''}" data-hr-td="${k}">${l} ${counts[k]}</button>`)}</div>
    ${list.length ? html`<ul class="ios-list">${list.slice(0, 200).map((x) => html`<li><button class="hr-hs" data-hr-hs="${x.ma}">
      <div class="hr-qd-h"><b>${x.ten || x.ma}</b><span>${money(x.du_toan_trinh)}</span></div>
      <div class="hr-qd-m">${x.ma} · ${x.loai || ''}${x.khu_vuc ? ' · ' + x.khu_vuc : ''}</div>
      <div class="hr-qd-f"><span class="hr-tag ${/^04/.test(x.trang_thai || '') ? 'ok' : /^03/.test(x.trang_thai || '') ? 'mid' : ''}">${ttLabel(x.trang_thai)}</span>
        ${x.ngay_xong ? html`<small>xong ${fmtDate(x.ngay_xong)}</small>` : x.han ? html`<small>hạn ${fmtDate(x.han)}</small>` : ''}
        ${x.tinh_trang_han === 'Trễ hạn' ? html`<span class="hr-tag warn">trễ ${x.so_ngay ? x.so_ngay + ' ngày' : ''}</span>` : ''}
        ${x.vb_so ? html`<small>DO ${x.vb_so}</small>` : ''}</div>
    </button></li>`)}</ul>` : html`<p class="empty">Không có hồ sơ nào.</p>`}
    <p class="hr-src">${d.cap_nhat || ''}</p>${srcLine(d)}</div>`;
}

function openHoSo(ma) {
  const x = (st?.du_lieu?.tham_dinh?.ho_so || []).find((h) => h.ma === ma);
  if (!x) return;
  const rowsKV = [['Mã', x.ma], ['Tình trạng', ttLabel(x.trang_thai)], ['Loại', x.loai], ['Khu vực', x.khu_vuc], ['Người gửi', x.nguoi_gui], ['Đợt', x.dot],
    ['Ngày nhận', x.ngay_nhan && fmtDate(x.ngay_nhan, true)], ['Hạn', x.han && fmtDate(x.han, true)], ['Ngày thẩm định xong', x.ngay_xong && fmtDate(x.ngay_xong, true)],
    ['Số ngày xử lý', x.so_ngay], ['Hạn xử lý', x.tinh_trang_han], ['Dự toán trình', typeof x.du_toan_trinh === 'number' ? dot(Math.round(x.du_toan_trinh)) + ' đ' : ''],
    ['Dự toán thẩm định', typeof x.du_toan_tham_dinh === 'number' ? dot(Math.round(x.du_toan_tham_dinh)) + ' đ' : ''],
    ['Chênh lệch', typeof x.chenh_lech === 'number' ? dot(Math.round(x.chenh_lech)) + ' đ' + (typeof x.ty_le_chenh === 'number' ? ` (${(x.ty_le_chenh * 100).toFixed(2)}%)` : '') : ''],
    ['Nhóm lỗi', x.nhom_loi], ['Số VB D-Office', x.vb_so], ['Ngày ĐK D-Office', x.ngay_dk_do && fmtDate(x.ngay_dk_do, true)]].filter((p) => p[1] !== undefined && p[1] !== '' && p[1] !== null);
  openSheet(html`<p class="hr-sheet-t">${x.ten}</p><ul class="ios-list hr-kv">${rowsKV.map(([k, v]) => html`<li><span>${k}</span><b>${v}</b></li>`)}</ul>`.__raw, { title: 'Hồ sơ thẩm định' });
}

// ---------------- Kết nối OneDrive ----------------
function secretWarn() {
  const h = st?.cau_hinh?.ms_secret_het_han;
  if (!h || !st?.ket_noi) return null;
  const n = daysTo(h);
  return n <= 30 ? n : null;
}

export function openConnect(rerender) {
  const c = st?.cau_hinh || {};
  const warn = secretWarn();
  const body = html`
    <div class="hr-conn ${st?.du_lieu?.nguon === 'mac' ? 'on' : ''}">${st?.du_lieu?.nguon === 'mac' ? html`💻 Máy Mac${st.du_lieu.may ? ' ' + st.du_lieu.may : ''} đang gửi số liệu <small>lần gần nhất ${when(st.du_lieu.cap_nhat)}</small>` : '💻 Chưa có máy Mac gửi số liệu'}</div>
    <p class="hint">Máy Mac đọc 3 tệp trong thư mục OneDrive đã đồng bộ, 20 phút kiểm tra một lần, chỉ gửi khi tệp đổi. Máy tắt thì app giữ số liệu lần cuối.</p>
    <form class="hr-form" data-hr-form>
      <details><summary>Đường dẫn tệp trên OneDrive</summary>
        <p class="hint">{nam} tự thay bằng năm hiện tại. Đầu năm, nếu chưa có tệp năm mới thì dùng tệp năm trước. Tệp Cơ cấu: tự chọn thư mục “Tháng N” mới nhất, tệp có chữ “(tự động)” sửa gần nhất.</p>
        <div class="field"><label>Tệp Biến động</label><input name="bien_dong" value="${c.bien_dong || ''}"></div>
        <div class="field"><label>Thư mục báo cáo (chứa Tháng N/1-Cơ cấu)</label><input name="co_cau_thu_muc" value="${c.co_cau_thu_muc || ''}"></div>
        <div class="field"><label>Tên tệp Cơ cấu có chứa</label><input name="co_cau_loc" value="${c.co_cau_loc || ''}"></div>
        <div class="field"><label>Tệp Thẩm định</label><input name="tham_dinh" value="${c.tham_dinh || ''}"></div>
        <button class="btn" type="submit">Lưu đường dẫn</button>
      </details>
    </form>
    <details class="hr-az"><summary>Lấy thẳng từ OneDrive, không cần Mac (cần Azure)</summary>
    <div class="hr-conn ${st?.ket_noi ? 'on' : ''}">${st?.ket_noi ? html`✅ Đã kết nối OneDrive${st.ket_noi_luc ? html` <small>từ ${when(st.ket_noi_luc)}</small>` : ''}` : '⚪️ Chưa kết nối'}</div>
    ${st?.ket_noi_loi ? html`<p class="hr-err">${st.ket_noi_loi}</p>` : ''}
    ${warn !== null ? html`<p class="hr-err">Mật khẩu ứng dụng Azure ${warn < 0 ? 'đã hết hạn' : `còn ${warn} ngày`} — tạo mật khẩu mới trên Azure rồi chạy tools/set_ms_secret.sh.</p>` : ''}
    <form class="hr-form" data-hr-form2>
      <div class="field"><label>Mã ứng dụng Azure (Application / Client ID)</label><input name="ms_client_id" value="${c.ms_client_id || ''}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label>Mật khẩu ứng dụng hết hạn ngày</label><input name="ms_secret_het_han" type="date" value="${c.ms_secret_het_han || ''}"></div>
      <button class="btn" type="submit">Lưu cấu hình</button>
    </form>
    <div class="hr-acts">
      <button class="btn btn-primary" data-hr-login>${st?.ket_noi ? 'Kết nối lại' : 'Kết nối OneDrive'}</button>
      ${st?.ket_noi ? html`<button class="btn" data-hr-refresh>Tải số liệu ngay</button><button class="btn btn-ghost" data-hr-logout>Ngắt kết nối</button>` : ''}
    </div>
    <p class="hint">Máy chủ tự tải lúc 8:10 và 14:10 mỗi ngày. App chỉ có quyền đọc tệp (Files.Read).</p></details>`;
  const sheet = openSheet(body.__raw, { title: 'Nguồn số liệu' });
  const root = sheet.body;
  root.querySelectorAll('[data-hr-form],[data-hr-form2]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = Object.fromEntries(new FormData(e.target).entries());
    try { await call('ns_cau_hinh', p); toast('Đã lưu cấu hình'); await load(); closeSheet(); openConnect(rerender); } catch (err) { errorToast(err); }
  }));
  root.querySelector('[data-hr-login]').addEventListener('click', async () => {
    const id = root.querySelector('[name=ms_client_id]').value.trim();
    try {
      if (id !== (c.ms_client_id || '')) await call('ns_cau_hinh', { ms_client_id: id });
      const w = window.open('about:blank', '_blank');
      const r = await call('ms_dang_nhap');
      if (w) w.location = r.url; else location.href = r.url;
      toast('Đăng nhập tài khoản Microsoft có OneDrive, rồi quay lại đây');
    } catch (err) { errorToast(err); }
  });
  root.querySelector('[data-hr-refresh]')?.addEventListener('click', () => { closeSheet(); refresh(rerender); });
  root.querySelector('[data-hr-logout]')?.addEventListener('click', async () => {
    if (!confirm('Ngắt kết nối OneDrive? Số liệu đã tải vẫn giữ lại.')) return;
    try { await call('ms_ngat'); await load(); closeSheet(); rerender?.(); } catch (err) { errorToast(err); }
  });
  return sheet;
}

async function refresh(rerender) {
  if (isDemo()) return toast('Bản thử không tải được OneDrive');
  if (!st?.ket_noi) { await load(rerender); return toast('Số liệu do máy Mac gửi lên mỗi khi tệp thay đổi (20 phút kiểm tra một lần)'); }
  toast('Đang tải 3 tệp từ OneDrive… (khoảng 1 phút)');
  try {
    const r = await call('ns_cap_nhat');
    await load(rerender);
    if (r.loi && r.loi.length) errorToast(new Error('Một phần lỗi: ' + r.loi.join('; '))); else toast('Đã cập nhật số liệu nhân sự');
  } catch (err) { errorToast(err); await load(rerender); }
}

// ---------------- Màn hình ----------------
function empty(name) {
  return html`<div class="empty hr-empty"><p>Chưa có số liệu ${name}.</p>
    <p>${st?.ket_noi ? 'Bấm ↻ để tải từ OneDrive.' : 'Máy Mac có OneDrive sẽ tự gửi số liệu lên khi tệp thay đổi (cài bằng tools/cai_nhansu_mac.sh).'}</p></div>`;
}

export function hrSubtitle() {
  const d = st?.du_lieu;
  if (!d || !d.cap_nhat) return 'chưa có số liệu';
  const b = d.bien_dong?.chi_so?.find((k) => /CUỐI KỲ/i.test(k.ten));
  return (b ? `${dot(b.gia_tri)} người · ` : '') + 'cập nhật ' + when(d.cap_nhat);
}

export function hrView(rerender) {
  if (!st && !isDemo()) load(rerender);
  else if (st && !loading && (!st.__luc || Date.now() - st.__luc > 60e3)) { st.__luc = Date.now(); load(rerender); }
  const d = st?.du_lieu || {};
  const warn = secretWarn();
  const bodyOf = { bien_dong: bienDong, co_cau: coCau, tham_dinh: thamDinh }[tab] || bienDong;
  return html`<header class="page-head"><h1>Nhân sự</h1>
      <div class="hr-head-acts"><button class="icon-btn" data-hr-refresh title="Tải ngay từ OneDrive" aria-label="Tải ngay">↻</button><button class="icon-btn" data-hr-connect title="Nguồn số liệu" aria-label="Nguồn số liệu">⚙︎</button></div></header>
    ${d.cap_nhat ? html`<p class="hr-src top">Cập nhật ${when(d.cap_nhat)} · ${d.nguon === 'mac' ? `từ máy Mac${d.may ? ' ' + d.may : ''}, tự gửi khi tệp đổi` : 'tự tải 8:10 và 14:10'}</p>` : ''}
    ${st?.ket_noi_loi ? html`<p class="hr-err" data-hr-connect>${st.ket_noi_loi}</p>` : ''}
    ${warn !== null ? html`<p class="hr-err" data-hr-connect>Mật khẩu ứng dụng Azure ${warn < 0 ? 'đã hết hạn' : `còn ${warn} ngày`} — chạm để xem cách gia hạn.</p>` : ''}
    <div class="seg hr-tabs">${[['bien_dong', 'Biến động'], ['co_cau', 'Cơ cấu'], ['tham_dinh', 'Thẩm định']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-hr-tab="${k}">${l}</button>`)}</div>
    ${bodyOf(d[tab])}`;
}

export function bindHr(main, rerender) {
  main.querySelectorAll('[data-hr-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.hrTab; localStorage.setItem('bnth.nsTab', tab); q = ''; rerender(); }));
  main.querySelectorAll('[data-hr-connect]').forEach((b) => b.addEventListener('click', () => openConnect(rerender)));
  main.querySelector('[data-hr-report]')?.addEventListener('click', () => openReport(unit || 'Toàn Công ty'));
  main.querySelector('[data-hr-refresh]')?.addEventListener('click', () => refresh(rerender));
  // Ô tìm: chỉ thay phần kết quả, không vẽ lại ô gõ (bộ gõ tiếng Việt trên điện thoại không bị ngắt).
  const qi = main.querySelector('[data-hr-q]');
  if (qi) onTyping(qi, (v) => {
    q = v;
    const box = main.querySelector('.hr-res');
    if (!box) return rerender();
    const tmp = document.createElement('div');
    tmp.innerHTML = hrView(rerender).__raw;
    const fresh = tmp.querySelector('.hr-res');
    if (!fresh) return rerender();
    box.innerHTML = fresh.innerHTML;
    bindRows(box, rerender);
  }, 200);
  main.querySelector('[data-hr-month]')?.addEventListener('change', (e) => { month = e.target.value; rerender(); });
  main.querySelector('[data-hr-unit]')?.addEventListener('change', (e) => { unit = e.target.value; localStorage.setItem('bnth.nsUnit', unit); rerender(); });
  bindRows(main, rerender);
}
function bindRows(root, rerender) {
  root.querySelectorAll('[data-hr-td]').forEach((b) => b.addEventListener('click', () => { tdFilter = b.dataset.hrTd; rerender(); }));
  root.querySelectorAll('[data-hr-hs]').forEach((b) => b.addEventListener('click', () => openHoSo(b.dataset.hrHs)));
}

// ---------------- Dùng trong ô Tìm (hỏi nhanh) ----------------
/** Số liệu nhân sự đã lưu trong máy; chưa có thì tải nền rồi gọi lại onReady. */
export function hrForSearch(onReady) {
  // Mở app lần đầu trong phiên hoặc đã quá 5 phút: lấy bản mới từ máy chủ (bản lưu trong máy có thể thiếu phần mới).
  if (!isDemo() && !loading && Date.now() - lastLoad > 5 * 60e3) load(onReady);
  return st?.du_lieu || null;
}
export const hrLoading = () => loading;

const qdRow = (x) => html`<li><button class="hr-qd" data-hr-goto="bien_dong" data-hr-goq="${x.ten}">
  <div class="hr-qd-h"><b>${x.ten}</b><span>${x.ngay ? fmtDate(x.ngay, true) : ''}</span></div>
  <div class="hr-qd-m">${x.loai}${x.tu ? ' · ' + x.tu : ''}${x.den ? html` → <b>${x.den}</b>` : ''}</div>
  <div class="hr-qd-f">${x.qd ? html`<span class="hr-tag">QĐ ${x.qd}</span>` : html`<span class="hr-tag warn">chưa có số QĐ</span>`}${x.cd_moi ? html` <small>${x.cd_moi}</small>` : ''}</div></button></li>`;
const hsRow = (x) => html`<li><button class="hr-hs" data-hr-hs="${x.ma}">
  <div class="hr-qd-h"><b>${x.ten || x.ma}</b><span>${money(x.du_toan_trinh)}</span></div>
  <div class="hr-qd-m">${x.ma} · ${x.loai || ''}${x.khu_vuc ? ' · ' + x.khu_vuc : ''}</div>
  <div class="hr-qd-f"><span class="hr-tag ${/^04/.test(x.trang_thai || '') ? 'ok' : /^03/.test(x.trang_thai || '') ? 'mid' : ''}">${ttLabel(x.trang_thai)}</span>
    ${x.ngay_xong ? html`<small>xong ${fmtDate(x.ngay_xong)}</small>` : ''}${x.tinh_trang_han === 'Trễ hạn' ? html`<span class="hr-tag warn">trễ hạn</span>` : ''}${x.vb_so ? html`<small>DO ${x.vb_so}${x.ngay_dk_do ? ' · ' + fmtDate(x.ngay_dk_do) : ''}</small>` : ''}</div></button></li>`;
const more = (n, shown) => (n > shown ? html`<p class="hr-src">… và ${n - shown} mục nữa — mở màn hình Nhân sự để xem hết.</p>` : '');
const LIMIT = 30;

/** Văn bản báo cáo + nút Sao chép (dán thẳng vào Word/Zalo). */
function reportBox(ten, text, names) {
  return html`<div class="bc-h"><select data-bc-unit>${names.map((n) => html`<option ${n === ten ? 'selected' : ''}>${n}</option>`)}</select>
    <button class="btn btn-primary" data-copy-report>Sao chép</button></div>
    <pre class="bc-text" data-bc-text>${text}</pre>`;
}
/** Thẻ trả lời nhanh cho các câu hỏi nhân sự (ask.js understand). */
export function answerHtml(a) {
  const src = st?.du_lieu?.cap_nhat ? html`<p class="hr-src">Số liệu cập nhật ${when(st.du_lieu.cap_nhat)}</p>` : '';
  const copyBox = (t) => html`<div class="bc-h"><span></span><button class="btn btn-primary" data-copy-report>Sao chép</button></div><pre class="bc-text" data-bc-text>${t}</pre>`;
  if (a.kind === 'cho_so_lieu') return html`<section class="ans"><div class="ans-h"><span>⏳ ${a.tieu_de}</span></div>
    <p class="hr-note">${loading ? 'Đang lấy số liệu nhân sự mới nhất từ máy chủ, vài giây nữa kết quả sẽ hiện ở đây.' : 'Máy chưa có phần số liệu này. Kiểm tra mạng rồi gõ lại, hoặc mở Thêm → Nhân sự để tải.'}</p></section>`;
  if (a.kind === 'chuc_danh') return html`<section class="ans"><div class="ans-h"><span>👷 ${a.tieu_de}</span></div>
    ${a.list.length ? copyBox(a.text) : html`<p class="empty">Không thấy ai giữ chức danh này${a.tieu_de.includes('·') ? ' theo đơn vị/tổ đã gõ' : ''}. Thử bỏ bớt chữ, vd “tổ trưởng Đà Bắc”.</p>`}
    ${a.tong > a.list.length ? html`<p class="hint">Còn ${a.tong - a.list.length} người nữa: gõ thêm tên đơn vị để lọc.</p>` : ''}
    ${a.loc ? html`<p class="hr-note">⚠️ Sheet DS chức danh đang lọc theo “${a.loc}”: danh sách có thể chưa đủ.</p>` : ''}${src}</section>`;
  if (a.kind === 'lanh_dao') return html`<section class="ans"><div class="ans-h"><span>👔 Lãnh đạo · ${a.ten}</span></div>${copyBox(a.text)}${src}</section>`;
  if (a.kind === 'cbql_tong') return html`<section class="ans"><div class="ans-h"><span>👔 Trưởng, phó các đơn vị</span></div>
    ${a.tom_tat && a.tom_tat.length ? html`<div class="hr-kpis">${a.tom_tat.map((x) => html`<div class="hr-kpi"><b>${x.tong}</b><small>${x.ten}: ${x.truong} trưởng · ${x.pho} phó</small></div>`)}</div>` : ''}
    <div style="margin-top:10px">${copyBox(a.text)}</div>${src}</section>`;
  if (a.kind === 'tieu_chuan') return html`<section class="ans"><div class="ans-h"><span>📐 Tiêu chuẩn chức danh</span></div>
    ${a.item ? copyBox(a.text) : html`<p class="empty">Chọn chức danh:</p>`}
    <div class="ask-ex" style="margin-top:10px">${a.names.map((n) => html`<button class="chip" data-ask="tiêu chuẩn ${n.toLowerCase()}">${n}</button>`)}</div>${src}</section>`;
  if (a.kind === 'bao_cao_cc') {
    if (!a.ten) return html`<section class="ans"><div class="ans-h"><span>📋 Tổng hợp cơ cấu</span></div><p class="empty">Chưa rõ đơn vị nào — chọn trong danh sách.</p>${reportBox('', '', ['', ...a.names])}</section>`;
    return html`<section class="ans"><div class="ans-h"><span>📋 Cơ cấu · ${a.ten}</span><small>đến ${a.den_ngay ? fmtDate(a.den_ngay, true) : ''}</small></div>${reportBox(a.ten, a.text, a.names)}${src}</section>`;
  }
  if (a.kind === 'don_vi') {
    const u = a.so, f = a.focus;
    const big = f === 'gioi_tinh' ? [[num(u.ty_le_nu, 'tỷ lệ'), 'tỷ lệ nữ'], [num(u.nu), 'nữ'], [num(u.nam), 'nam']]
      : f === 'tuoi' ? [[num(u.tuoi_bq), 'tuổi bình quân'], ...u.tuoi.slice(0, 2).map(([l, n]) => [n, 'tuổi ' + l])]
      : f === 'dang_vien' ? [[num(u.dang_vien), 'đảng viên'], [u.lao_dong && u.dang_vien ? num(u.dang_vien / u.lao_dong, 'tỷ lệ') : '—', 'tỷ lệ']]
      : f === 'dan_toc' ? [[num(u.dan_toc), 'lao động dân tộc']]
      : f === 'llct' ? u.llct.map(([l, n]) => [n, 'LLCT ' + l.toLowerCase()])
      : f === 'trinh_do' ? u.trinh_do.filter((x) => x[1]).map(([l, n]) => [n, l])
      : [[num(u.lao_dong), 'lao động'], [num(u.db_gl), 'định biên giao lương'], [num(u.db_tt), 'định biên tính toán']];
    const gap = (n) => (n < 0 ? html`<b class="down">thiếu ${-n}</b>` : n > 0 ? html`<b class="up">thừa ${n}</b>` : html`<b>đủ</b>`);
    return html`<section class="ans">
      <div class="ans-h"><span>👥 ${u.ten}</span><button class="link" data-hr-goto="co_cau" data-hr-gounit="${u.ten === 'Toàn công ty' ? '' : u.ten}">Xem cơ cấu ›</button></div>
      <div class="hr-kpis">${big.map(([v, l]) => html`<div class="hr-kpi"><b>${v}</b><small>${l}</small></div>`)}</div>
      <p class="hr-note">${num(u.lao_dong)} người · nữ ${num(u.ty_le_nu, 'tỷ lệ')} · tuổi BQ ${num(u.tuoi_bq)}${typeof u.db_gl === 'number' ? html` · so định biên giao lương ${num(u.db_gl)}: ${gap(u.lao_dong - u.db_gl)}` : ''}</p>
      ${f === 'dinh_bien' && u.db_gl == null ? html`<p class="hr-src">Tệp chỉ có định biên của các Điện lực (sheet So sánh).</p>` : ''}${src}</section>`;
  }
  if (a.kind === 'quyet_dinh' || a.kind === 'tong_quan') {
    const list = a.list || [];
    const head = a.kind === 'tong_quan' ? `Biến động nhân sự · tháng ${+a.thang.slice(5)}/${a.thang.slice(0, 4)}` : a.tieu_de;
    return html`<section class="ans"><div class="ans-h"><span>📋 ${head}</span><small>${list.length} quyết định</small></div>
      ${a.kind === 'tong_quan' ? kpis(a.bd.chi_so) : ''}
      ${list.length ? html`<ul class="ios-list">${list.slice(0, LIMIT).map(qdRow)}</ul>${more(list.length, LIMIT)}` : html`<p class="empty">Không có quyết định nào.</p>`}${src}</section>`;
  }
  if (a.kind === 'ho_so') {
    return html`<section class="ans"><div class="ans-h"><span>🧾 ${a.tieu_de}</span><small>${a.list.length} hồ sơ${a.tong_gia_tri ? ' · ' + money(a.tong_gia_tri) : ''}</small></div>
      ${a.list.length ? html`<ul class="ios-list">${a.list.slice(0, LIMIT).map(hsRow)}</ul>${more(a.list.length, LIMIT)}` : html`<p class="empty">Không có hồ sơ nào.</p>`}${src}</section>`;
  }
  return raw('');
}

/** Kết quả tìm thô trong số liệu nhân sự (khi câu không phải câu hỏi). */
export function hrHitsHtml(h) {
  const parts = [];
  if (h.don_vi.length) parts.push(html`<h4 class="ios-g">Đơn vị (Cơ cấu)</h4><ul class="ios-list">${h.don_vi.slice(0, 8).map((r) => html`<li><button class="ios-row" data-hr-goto="co_cau" data-hr-gounit="${String(r.B).trim()}"><span class="ios-t">${String(r.B).trim()}</span><span class="ios-chev">›</span></button></li>`)}</ul>`);
  if (h.qd.length) parts.push(html`<h4 class="ios-g">Quyết định nhân sự</h4><ul class="ios-list">${h.qd.slice(0, 10).map(qdRow)}</ul>`);
  if (h.ho_so.length) parts.push(html`<h4 class="ios-g">Hồ sơ thẩm định</h4><ul class="ios-list">${h.ho_so.slice(0, 10).map(hsRow)}</ul>`);
  return raw(parts.map((p) => p.__raw).join(''));
}

/** Chạm trong thẻ trả lời → mở hồ sơ hoặc nhảy sang màn Nhân sự đúng chỗ. */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; } ta.remove(); return ok;
  }
}
function bindReport(root) {
  root.querySelectorAll('[data-copy-report]').forEach((b) => b.addEventListener('click', async () => {
    const pre = b.closest('section, .sheet-body, .ans')?.querySelector('[data-bc-text]');
    const t = pre?.textContent || '';
    if (!t) return;
    if (await copyText(t)) { b.textContent = 'Đã chép ✓'; setTimeout(() => { b.textContent = 'Sao chép'; }, 1500); toast('Đã sao chép — dán vào Word hoặc Zalo'); return; }
    // Trình duyệt chặn chép tự động: bôi đen sẵn để anh giữ ngón tay → Sao chép.
    const rg = document.createRange(); rg.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    toast('Đã bôi đen — giữ ngón tay lên chữ rồi chọn Sao chép');
  }));
  root.querySelectorAll('[data-bc-unit]').forEach((s) => s.addEventListener('change', () => {
    const box = s.closest('section, .sheet-body, .ans');
    const t = st?.du_lieu?.co_cau?.bao_cao?.[s.value];
    const pre = box?.querySelector('[data-bc-text]');
    if (pre) pre.textContent = t || '';
    const h = box?.querySelector('.ans-h span'); if (h && t) h.textContent = '📋 Cơ cấu · ' + s.value;
  }));
}
/** Mở báo cáo viết lời của một đơn vị (từ tab Cơ cấu). */
function openReport(ten) {
  const bc = st?.du_lieu?.co_cau?.bao_cao || {};
  const names = Object.keys(bc);
  if (!names.length) return toast('Tệp Cơ cấu chưa có sheet Danh mục — cần lần tải mới từ máy Mac.');
  const n = bc[ten] ? ten : 'Toàn Công ty';
  const sh = openSheet(reportBox(n, bc[n] || '', names).__raw, { title: 'Báo cáo cơ cấu' });
  bindReport(sh.body);
}
export function bindHrLinks(root) {
  bindReport(root);
  root.querySelectorAll('[data-hr-hs]').forEach((b) => b.addEventListener('click', () => openHoSo(b.dataset.hrHs)));
  root.querySelectorAll('[data-hr-goto]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.hrGoto; localStorage.setItem('bnth.nsTab', tab);
    if (b.dataset.hrGounit !== undefined) { unit = b.dataset.hrGounit; localStorage.setItem('bnth.nsUnit', unit); }
    q = b.dataset.hrGoq || '';
    location.hash = '#/nhan-su';
  }));
}

/** Chỉ dùng khi thử giao diện ở chế độ demo. */
export function __demoSet(v) { st = v; }
