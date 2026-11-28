// Hỏi nhanh không cần AI: hiểu câu hỏi tiếng Việt thường gặp trong ô Tìm và trả lời bằng dữ liệu sẵn có.
// Thuần dữ liệu (không đụng giao diện) để chạy thử được bằng tests/ask_test.mjs.
// understand(q, ctx) → { kind, tieu_de, ... } hoặc null.  ctx = { hr, now, viec, van_ban, gia }
import { fold } from './util.js';
import { THANH_PHO, TINH_CU } from './diadanh.js';

const QD_KIEU = [
  [/dieu dong|luan chuyen/, 'Điều động nội bộ'], [/bo nhiem/, 'Bổ nhiệm'], [/nghi huu|ve huu/, 'Nghỉ hưu'],
  [/tuyen moi|tuyen dung|nguoi moi/, 'Tuyển mới'], [/cham dut|nghi viec|thoi viec/, 'Chấm dứt HĐLĐ'], [/biet phai/, 'Biệt phái'],
  [/tiep nhan/, 'Tiếp nhận từ ĐV khác'], [/dieu chuyen di|chuyen di/, 'Điều chuyển đi ĐV khác'], [/tam hoan/, 'Tạm hoãn HĐLĐ']
];
const STOP = new Set(['ai', 'nao', 'nhung', 'cac', 'cua', 'o', 'tai', 'trong', 'la', 'bao', 'nhieu', 'co', 'khong', 'xem', 'cho', 'toi', 'em', 'anh', 'duoc', 'da', 've', 'thi', 'va', 'voi', 'nhu', 'the', 'gi', 'danh', 'sach', 'list', 'so', 'tim']);

const pad = (n) => String(n).padStart(2, '0');
const addMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + m - 1 + d; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };
const has = (fq, re) => re.test(fq);
const words = (fq) => fq.split(' ').filter((w) => w && !STOP.has(w));

/** Tháng trong câu: "tháng này/trước/sau", "tháng 11", "t11", "11/2026", "năm nay". */
export function parseMonth(fq, now) {
  const cur = now.slice(0, 7);
  if (/\bthang nay\b/.test(fq)) return { thang: cur };
  if (/\bthang truoc\b/.test(fq)) return { thang: addMonth(cur, -1) };
  if (/\bthang (sau|toi)\b/.test(fq)) return { thang: addMonth(cur, 1) };
  let m = /\b(?:thang|t)\s?(\d{1,2})(?:\s?(?:\/|nam)\s?(\d{4}))?\b/.exec(fq) || /\b(\d{1,2})\/(\d{4})\b/.exec(fq);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { thang: (m[2] || now.slice(0, 4)) + '-' + pad(+m[1]) };
  if (/\bnam nay\b/.test(fq)) return { nam: now.slice(0, 4) };
  m = /\bnam (\d{4})\b/.exec(fq);
  if (m) return { nam: m[1] };
  return {};
}
const monthLabel = (p) => (p.thang ? `tháng ${+p.thang.slice(5)}/${p.thang.slice(0, 4)}` : p.nam ? `năm ${p.nam}` : '');

// ---------------- Đơn vị (bảng Cơ cấu) ----------------
const isTotal = (r) => /^(tổng|cộng)/i.test(String(r.B || '').trim());
function aliases(name) {
  const f = fold(name);
  const out = [f];
  const short = f.replace(/^(dien luc|phong|ban|trung tam|xi nghiep|van phong) /, '');
  // Bỏ chữ "Điện lực/Trung tâm…" được ("cẩm khê"); phòng/ban phải gọi đủ hoặc viết tắt (tránh "kỹ thuật" trong "đại học kỹ thuật").
  if (short !== f && short.length >= 4 && /^(dien luc|trung tam|xi nghiep) /.test(f)) out.push(short);
  const ini = short.split(' ').filter((w) => w && w !== 'va' && w !== '&').map((w) => w[0]).join('');
  if (short.split(' ').length >= 3 && ini.length >= 3) out.push(ini);
  return out;
}
/** Tìm đơn vị nhắc tới trong câu (khớp dài nhất). "toàn công ty" → dòng Tổng số. */
export function findUnit(fq, cc) {
  const rows = ((cc && cc.bang && cc.bang.dong) || []).filter((r) => r.B && r.A !== 'PB');
  if (/\b(toan cong ty|ca cong ty|cong ty|tong so|toan pc)\b/.test(fq)) { const t = rows.find(isTotal); if (t) return t; }
  let best = null, len = 0;
  rows.filter((r) => !isTotal(r)).forEach((r) => aliases(String(r.B).trim()).forEach((a) => {
    if (a.length > len && (' ' + fq + ' ').includes(' ' + a + ' ')) { best = r; len = a.length; }
  }));
  return best;
}

/** Số liệu một đơn vị: lao động, giới tính, định biên (ưu tiên sheet So sánh), tuổi, trình độ. */
export function unitStats(cc, row) {
  const cols = cc.bang.cot;
  const v = (re) => { const c = cols.find((x) => re.test(x.ten)); return c ? row[c.c] : undefined; };
  const nam = Number(v(/Giới tính · Nam/)) || 0, nu = Number(v(/Giới tính · Nữ/)) || 0, tong = nam + nu;
  const total = isTotal(row);
  const ss = !total && cc.so_sanh ? cc.so_sanh.dong.find((x) => fold(x.C) === fold(row.B)) : null;
  const sv = (re) => { const c = ss && cc.so_sanh.cot.find((x) => re.test(x.ten)); return c ? ss[c.c] : undefined; };
  const sum = (re) => cols.filter((c) => re.test(c.ten)).reduce((s, c) => s + (Number(row[c.c]) || 0), 0);
  // Định biên chỉ có ở sheet So sánh (các Điện lực). Cột "Định biên … Tổng số" của sheet Cơ cấu là số người thực tế theo nhóm, không phải định biên.
  const db_gl = ss ? sv(/Tổng số Định biên \(giao lương\)/) : undefined;
  const db_tt = ss ? sv(/tính toán · ĐBLĐ/) : undefined;
  return {
    ten: total ? 'Toàn công ty' : String(row.B).trim(), lao_dong: tong, nam, nu, ty_le_nu: tong ? nu / tong : null,
    tuoi_bq: v(/^Tuổi bình quân/), dang_vien: v(/Đảng viên/), dan_toc: v(/LĐ Dân tộc/), cbql4: v(/CBQL Cấp 4/),
    db_gl: typeof db_gl === 'number' ? db_gl : null, db_tt: typeof db_tt === 'number' ? db_tt : null,
    trinh_do: [['Thạc sĩ', sum(/^Thạc sĩ/)], ['Đại học', sum(/^Đại học/)], ['Cao đẳng', sum(/^Cao đẳng/)], ['Trung cấp', sum(/^Trung cấp/)], ['CNKT', sum(/^CNKT/)]],
    tuoi: cols.filter((c) => /^Tuổi đời/.test(c.ten)).map((c) => [c.ten.replace('Tuổi đời · ', ''), Number(row[c.c]) || 0]),
    llct: [['Cao cấp', Number(v(/LLCT · CC/)) || 0], ['Trung cấp', Number(v(/LLCT · TC/)) || 0]]
  };
}
function unitFocus(fq) {
  if (/dinh bien|thua|thieu|bien che/.test(fq)) return 'dinh_bien';
  if (/\bnu\b|gioi tinh|phu nu/.test(fq)) return 'gioi_tinh';
  if (/tuoi/.test(fq)) return 'tuoi';
  if (/trinh do|thac si|dai hoc|cao dang|trung cap|cnkt|bang cap|hoc van/.test(fq)) return 'trinh_do';
  if (/dang vien/.test(fq)) return 'dang_vien';
  if (/ly luan|llct|chinh tri/.test(fq)) return 'llct';
  if (/dan toc/.test(fq)) return 'dan_toc';
  return '';
}

// ---------------- Quyết định (Biến động) ----------------
function qdAnswer(fq, hr, now) {
  const list = (hr.bien_dong && hr.bien_dong.quyet_dinh) || [];
  if (!list.length) return null;
  // Số quyết định: "QĐ 3887", "3887/QĐ"
  const num = /\bqd\b/.test(fq) || /\d\s?\/\s?qd/.test(fq) ? /(\d{2,5})/.exec(fq) : null;
  if (num) {
    const hit = list.filter((x) => new RegExp('^' + num[1] + '\\b').test(fold(x.qd)));
    if (hit.length) return { kind: 'quyet_dinh', tieu_de: `Quyết định số ${num[1]}`, list: hit };
  }
  // Tên người
  const byName = list.filter((x) => { const n = fold(x.ten); return n.split(' ').length >= 2 && (' ' + fq + ' ').includes(' ' + n + ' '); });
  if (byName.length) return { kind: 'quyet_dinh', tieu_de: byName[0].ten, list: byName };
  const kieu = QD_KIEU.find(([re]) => re.test(fq));
  const per = parseMonth(fq, now);
  const generic = /quyet dinh|\bqd\b/.test(fq);
  if (!kieu && !generic) return null;
  const unit = findUnit(fq, hr.co_cau);
  const uName = unit && !isTotal(unit) ? fold(unit.B) : '';
  let out = list.filter((x) => (!kieu || x.loai === kieu[1])
    && (!per.thang || String(x.ngay || '').startsWith(per.thang)) && (!per.nam || String(x.ngay || '').startsWith(per.nam))
    && (!uName || fold(x.tu) === uName || fold(x.den) === uName));
  out.sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const parts = [kieu ? kieu[1] : 'Quyết định nhân sự', uName ? String(unit.B).trim() : '', monthLabel(per)].filter(Boolean);
  return { kind: 'quyet_dinh', tieu_de: parts.join(' · '), list: out };
}

// ---------------- Hồ sơ thẩm định ----------------
const TD_WORDS = /tham dinh|ho so|du toan|cong trinh|\bscl\b|sua chua lon/;
function tdAnswer(fq, hr) {
  const td = hr.tham_dinh;
  if (!td || !td.ho_so) return null;
  const ma = /\btd\s?(\d{2})\s?-?\s?(\d{3})\b/.exec(fq);
  if (ma) {
    const h = td.ho_so.filter((x) => fold(x.ma) === `td${ma[1]}-${ma[2]}`);
    if (h.length) return { kind: 'ho_so', tieu_de: h[0].ma, list: h };
  }
  if (!TD_WORDS.test(fq) && !/\bvb\b.*\bdo\b|d-?office/.test(fq)) return null;
  let list = td.ho_so.slice(), label = [];
  if (/tre han|qua han|cham/.test(fq)) { list = list.filter((x) => x.tinh_trang_han === 'Trễ hạn'); label.push('trễ hạn'); }
  if (/dang (xu ly|tham dinh)|chua xong|chua tham dinh/.test(fq)) { list = list.filter((x) => /^0[12]/.test(x.trang_thai || '')); label.push('đang xử lý'); }
  if (/chua (dk|dang ky)/.test(fq)) { list = list.filter((x) => !/^04/.test(x.trang_thai || '')); label.push('chưa ĐK D-Office'); }
  else if (/(da )?(dk|dang ky)( do| d-?office)?/.test(fq) && /dk|dang ky/.test(fq)) { list = list.filter((x) => /^04/.test(x.trang_thai || '')); label.push('đã ĐK D-Office'); }
  const kv = /\bkv\s?(\d)\b/.exec(fq);
  if (kv) { list = list.filter((x) => fold(x.khu_vuc) === 'kv' + kv[1]); label.push('KV' + kv[1]); }
  const rest = words(fq.replace(new RegExp(TD_WORDS.source, 'g'), ' ').replace(/tre han|qua han|dang xu ly|dang tham dinh|chua xong|chua (dk|dang ky)|da (dk|dang ky)|\bdk\b|dang ky|\bdo\b|d-?office|\bkv\s?\d\b|\bcua\b/g, ' '));
  if (rest.length) { const s = rest.join(' '); list = list.filter((x) => fold([x.ten, x.loai, x.nguoi_gui, x.dot, x.vb_so].join(' ')).includes(s)); label.push('“' + rest.join(' ') + '”'); }
  list.sort((a, b) => ((a.ngay_nhan || '') < (b.ngay_nhan || '') ? 1 : -1));
  const sumv = list.reduce((s, x) => s + (Number(x.du_toan_trinh) || 0), 0);
  return { kind: 'ho_so', tieu_de: 'Hồ sơ thẩm định' + (label.length ? ' · ' + label.join(' · ') : ''), list, tong_gia_tri: sumv };
}

// ---------------- Việc, lịch, văn bản, ghi chú, bản thân, danh bạ ----------------
const WD = { 'thu 2': 1, 'thu hai': 1, 'thu 3': 2, 'thu ba': 2, 'thu 4': 3, 'thu tu': 3, 'thu 5': 4, 'thu nam': 4, 'thu 6': 5, 'thu sau': 5, 'thu 7': 6, 'thu bay': 6, 'chu nhat': 0, 'cn': 0 };
const dayAdd = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();
const day = (s) => String(s || '').slice(0, 10);
const open = (v) => v.trang_thai !== 'Xong' && !v.archived;

/** Khoảng ngày trong câu: hôm nay, mai, mốt, tuần này/sau, tháng này, thứ N. Trả {tu, den, nhan} hoặc null. */
export function parseRange(fq, now) {
  if (/\bhom nay\b/.test(fq)) return { tu: now, den: now, nhan: 'hôm nay' };
  if (/\bngay kia\b|\bmot\b/.test(fq)) { const d = dayAdd(now, 2); return { tu: d, den: d, nhan: 'ngày kia' }; }
  if (/\b(ngay mai|mai)\b/.test(fq)) { const d = dayAdd(now, 1); return { tu: d, den: d, nhan: 'ngày mai' }; }
  if (/\bhom qua\b/.test(fq)) { const d = dayAdd(now, -1); return { tu: d, den: d, nhan: 'hôm qua' }; }
  const mon = dayAdd(now, -((dow(now) + 6) % 7));
  if (/\btuan (sau|toi)\b/.test(fq)) return { tu: dayAdd(mon, 7), den: dayAdd(mon, 13), nhan: 'tuần sau' };
  if (/\btuan truoc\b/.test(fq)) return { tu: dayAdd(mon, -7), den: dayAdd(mon, -1), nhan: 'tuần trước' };
  if (/\btuan nay\b/.test(fq)) return { tu: mon, den: dayAdd(mon, 6), nhan: 'tuần này' };
  if (/\b7 ngay (qua|truoc)\b/.test(fq)) return { tu: dayAdd(now, -6), den: now, nhan: '7 ngày qua' };
  if (/\b7 ngay\b/.test(fq)) return { tu: now, den: dayAdd(now, 7), nhan: '7 ngày tới' };
  for (const k of Object.keys(WD)) {
    if ((' ' + fq + ' ').includes(' ' + k + ' ')) { let d = now; while (dow(d) !== WD[k]) d = dayAdd(d, 1); return { tu: d, den: d, nhan: k.replace('thu', 'thứ').replace('chu nhat', 'chủ nhật').replace(/^cn$/, 'chủ nhật') }; }
  }
  const per = parseMonth(fq, now);
  if (per.thang) { const end = dayAdd(addMonth(per.thang, 1) + '-01', -1); return { tu: per.thang + '-01', den: end, nhan: monthLabel(per) }; }
  return null;
}
const RANGE_RE = /\b(hom nay|hom qua|ngay mai|mai|ngay kia|mot|tuan (nay|sau|toi|truoc)|thang (nay|truoc|sau|toi|\d+)|nam nay|thu \w+|chu nhat|7 ngay( qua| toi)?)\b/g;
const inRange = (d, r) => d && d >= r.tu && d <= r.den;
const rest = (fq, re) => words(fq.replace(re, ' ')).join(' ');
const L = (table, tieu_de, list, extra) => ({ kind: 'list', table, tieu_de, list, ...extra });

function lifeAnswer(fq, ctx) {
  const now = ctx.now, all = (t) => (ctx.all ? ctx.all(t) : ctx[t]) || [];
  const R = parseRange(fq, now);
  // Hôm nay có gì
  if (/^(hom nay( co gi| the nao)?|ngay hom nay|tong hop hom nay|hom nay lam gi)$/.test(fq)) {
    const vs = all('viec').filter(open);
    return { kind: 'hom_nay', mau: 'hom_nay', su_kien: all('su_kien').filter((e) => day(e.bat_dau) === now && e.trang_thai !== 'Hủy').sort((a, b) => (a.bat_dau < b.bat_dau ? -1 : 1)),
      viec: vs.filter((v) => day(v.han) === now), qua_han: vs.filter((v) => v.han && day(v.han) < now),
      van_ban: all('van_ban').filter((d) => open(d) && d.han_xu_ly && day(d.han_xu_ly) <= dayAdd(now, 3)) };
  }
  // Lịch / họp / sự kiện
  if (/\b(lich|hop|su kien|cuoc hop)\b/.test(fq) && !/lich su|lich trinh|am lich|lich hoc tieng|phoi hop|tong hop|hop dong|hop le|thich hop|ket hop|hop tac/.test(fq)) {
    const r = R || { tu: now, den: dayAdd(now, 7), nhan: '7 ngày tới' };
    let list = all('su_kien').filter((e) => inRange(day(e.bat_dau), r) && e.trang_thai !== 'Hủy');
    if (/\bhop\b/.test(fq)) list = list.filter((e) => e.loai === 'Họp' || /hop/.test(fold(e.ten)));
    const q = rest(fq.replace(RANGE_RE, ' '), /\b(lich|hop|cuoc hop|su kien)\b/g);
    if (q) list = list.filter((e) => fold([e.ten, e.dia_diem, e.mo_ta].join(' ')).includes(q));
    return L('su_kien', (/\bhop\b/.test(fq) ? 'Họp ' : 'Lịch ') + r.nhan + (q ? ' · “' + q + '”' : ''), list.sort((a, b) => (a.bat_dau < b.bat_dau ? -1 : 1)), { mau: /\bhop\b/.test(fq) ? 'hop' : 'lich' });
  }
  // Việc
  if (/\bviec\b/.test(fq) && !/nghi viec|thoi viec/.test(fq)) {
    const vs = all('viec').filter(open);
    if (/qua han|tre han|tre\b/.test(fq)) return L('viec', 'Việc quá hạn', vs.filter((v) => v.han && day(v.han) < now), { mau: 'viec_qua_han' });
    if (/da xong|hoan thanh|lam duoc/.test(fq)) {
      const r = R || { tu: dayAdd(now, -6), den: now, nhan: '7 ngày qua' };
      return L('viec', 'Việc đã xong ' + r.nhan, all('viec').filter((v) => v.trang_thai === 'Xong' && inRange(day(v.hoan_thanh_luc || v.updated_at), r)), { mau: 'viec_xong' });
    }
    if (/dang cho|\bcho\b/.test(fq)) return L('viec', 'Việc đang chờ', vs.filter((v) => v.trang_thai === 'Chờ'), { mau: 'viec_cho' });
    if (/gap|quan trong|uu tien/.test(fq)) return L('viec', 'Việc gấp / quan trọng', vs.filter((v) => v.gap || v.quan_trong), { mau: 'viec_gap' });
    if (/khong (co )?han|chua co han/.test(fq)) return L('viec', 'Việc chưa có hạn', vs.filter((v) => !v.han), { mau: 'viec_khong_han' });
    if (R) return L('viec', 'Việc ' + R.nhan, vs.filter((v) => inRange(day(v.han), R)), { mau: R.tu === R.den ? 'viec_ngay' : 'viec_tuan' });
    const lv = all('linh_vuc').find((x) => fq.includes(fold(x.ten)) && fold(x.ten).length >= 3);
    if (lv) return L('viec', 'Việc · ' + lv.ten, vs.filter((v) => v.linh_vuc_id === lv.id), { mau: 'viec_linh_vuc' });
    const da = all('du_an').find((x) => fold(x.ten).length >= 4 && fq.includes(fold(x.ten)));
    if (da) return L('viec', 'Việc · 📁 ' + da.ten, vs.filter((v) => v.du_an_id === da.id), { mau: 'viec_du_an' });
  }
  // Văn bản
  if (/van ban|cong van|cv den|vb\b/.test(fq) || /^(quyet dinh|ke hoach|bao cao|thong bao) /.test(fq) && /han|tuan|thang|chu tri|phoi hop/.test(fq)) {
    const ds = all('van_ban');
    if (/chua gui|chua nop|don vi.*gui|dv chua/.test(fq)) {
      const pend = all('theo_doi_dv').filter((x) => !x.da_gui);
      return { kind: 'chua_gui', mau: 'dv_chua_gui', tieu_de: 'Đơn vị chưa gửi văn bản', list: pend, van_ban: ds };
    }
    if (/qua han/.test(fq)) return L('van_ban', 'Văn bản quá hạn', ds.filter((d) => open(d) && d.han_xu_ly && day(d.han_xu_ly) < now), { mau: 'vb_qua_han' });
    if (/chu tri/.test(fq)) return L('van_ban', 'Văn bản Chủ trì chưa xong', ds.filter((d) => open(d) && d.vai_tro === 'Chủ trì'), { mau: 'vb_chu_tri' });
    if (/phoi hop/.test(fq)) return L('van_ban', 'Văn bản Phối hợp chưa xong', ds.filter((d) => open(d) && d.vai_tro === 'Phối hợp'), { mau: 'vb_phoi_hop' });
    if (/han|sap|can xu ly|chua xu ly/.test(fq)) {
      const r = R || { tu: now, den: dayAdd(now, 7), nhan: '7 ngày tới' };
      return L('van_ban', 'Văn bản hạn ' + r.nhan, ds.filter((d) => open(d) && inRange(day(d.han_xu_ly), r)), { mau: 'vb_han' });
    }
    if (R) return L('van_ban', 'Văn bản ban hành ' + R.nhan, ds.filter((d) => inRange(day(d.ngay_ban_hanh || d.created_at), R)), { mau: 'vb_ngay' });
  }
  // Dự án
  if (/\bdu an\b/.test(fq)) {
    if (/sap han|han\b/.test(fq)) return L('du_an', 'Dự án sắp hạn', all('du_an').filter((d) => d.han && d.trang_thai !== 'Xong').sort((a, b) => (a.han < b.han ? -1 : 1)), { mau: 'du_an' });
    if (/dang lam|dang chay|hien tai|^du an$/.test(fq)) return L('du_an', 'Dự án đang làm', all('du_an').filter((d) => d.trang_thai === 'Đang làm'), { mau: 'du_an' });
    if (/y tuong|de sau/.test(fq)) return L('du_an', 'Ý tưởng dự án', all('du_an').filter((d) => d.trang_thai === 'Ý tưởng'), { mau: 'du_an' });
  }
  // Ghi chú, inbox
  if (/^inbox|inbox chua|chua xu ly inbox|chua xep/.test(fq)) {
    // Inbox = ghi chú chưa có nhãn chính (#1_Work, #2_Life, #3_Archive).
    const MAIN = ['#1_work', '#2_life', '#3_archive'];
    const chuaXep = (n) => { const l = (n.nhan || []).map((x) => String(x).trim().toLowerCase()); return !l.includes('#prompt') && !l.some((x) => MAIN.includes(x)) && n.loai !== 'Khối dựng sẵn' && n.loai !== 'Câu hỏi lớn'; };
    return L('ghi_chu', 'Inbox (ghi chú chưa xếp)', all('ghi_chu').filter(chuaXep), { mau: 'inbox' });
  }
  if (/^(ghi chu|note)\b/.test(fq)) {
    if (/ghim/.test(fq)) return L('ghi_chu', 'Ghi chú đã ghim', all('ghi_chu').filter((n) => n.ghim), { mau: 'gc_ghim' });
    if (/checklist|danh sach viec/.test(fq)) return L('ghi_chu', 'Checklist', all('ghi_chu').filter((n) => n.loai === 'Checklist'), { mau: 'gc_ve' });
    const q = rest(fq.replace(RANGE_RE, ' '), /\b(ghi chu|note|ve|lien quan|chu de)\b/g);
    if (R && !q) return L('ghi_chu', 'Ghi chú ' + R.nhan, all('ghi_chu').filter((n) => inRange(day(n.created_at), R)), { mau: 'gc_ngay' });
    if (q) return L('ghi_chu', 'Ghi chú về “' + q + '”', all('ghi_chu').filter((n) => fold([n.tieu_de, n.noi_dung, n.tom_tat, (n.nhan || []).join(' ')].join(' ')).includes(q)), { mau: 'gc_ve' });
  }
  // Sách & đọc
  if (/\bsach\b|\bdoc\b/.test(fq) && !/doc lap|doc hai/.test(fq)) {
    const ss = all('sach'), y = now.slice(0, 4);
    if (/bao nhieu|muc tieu|nam nay|ket qua|tien do/.test(fq)) {
      const done = ss.filter((b) => b.trang_thai === 'Đã đọc' && String(b.xong_ngay || '').startsWith(y));
      const goal = all('muc_tieu_doc').find((g) => String(g.nam) === y);
      const ph = all('phien_doc').filter((p) => p.trang_thai !== 'Đang đọc' && p.trang_thai !== 'Tạm dừng');
      const mins = (r) => ph.filter((p) => inRange(day(p.ngay), r)).reduce((s, p) => s + (Number(p.so_phut) || 0), 0);
      const mon = dayAdd(now, -((dow(now) + 6) % 7));
      return { kind: 'stats', mau: 'sach_nam', tieu_de: 'Đọc sách năm ' + y, items: [[done.length + (goal ? '/' + goal.so_sach : ''), 'cuốn đã đọc'], [mins({ tu: mon, den: now }), 'phút tuần này'], [mins({ tu: now.slice(0, 7) + '-01', den: now }), 'phút tháng này']], table: 'sach', list: done };
    }
    if (/muon doc|se doc|danh sach doc/.test(fq)) return L('sach', 'Sách muốn đọc', ss.filter((b) => b.trang_thai === 'Muốn đọc'), { mau: 'sach_dang' });
    if (/dang doc|doc gi|doc den/.test(fq)) return L('sach', 'Đang đọc', ss.filter((b) => b.trang_thai === 'Đang đọc'), { mau: 'sach_dang' });
  }
  // Thói quen
  if (/thoi quen|diem danh|chuoi ngay|\bstreak\b/.test(fq)) {
    const hs = all('thoi_quen').filter((h) => h.trang_thai === 'Đang theo'), dd = all('diem_danh');
    const done = (id, d) => dd.some((x) => x.thoi_quen_id === id && x.ngay === d);
    const items = hs.map((h) => { let st = 0, d = done(h.id, now) ? now : dayAdd(now, -1); while (done(h.id, d)) { st++; d = dayAdd(d, -1); } return { ten: (h.bieu_tuong ? h.bieu_tuong + ' ' : '') + h.ten, xong: done(h.id, now), chuoi: st }; });
    return { kind: 'thoi_quen', mau: 'thoi_quen', tieu_de: 'Thói quen hôm nay', items };
  }
  // Học tiếng Trung / ôn tập
  if (/tieng trung|\bhsk\b|can on|on tap|the hoc|cau can nho|buoi hoc/.test(fq)) {
    if (/buoi hoc|bai tiep|hoc gi/.test(fq)) {
      const next = all('buoi_hoc').filter((b) => b.trang_thai === 'Chưa học').sort((a, b) => ((a.tuan || 0) - (b.tuan || 0)) || ((a.thu_tu || 0) - (b.thu_tu || 0)));
      return L('buoi_hoc', 'Buổi học tiếp theo', next.slice(0, 3), { mau: 'buoi_hoc' });
    }
    const due = all('the_hoc').filter((c) => c.on_ngay && c.on_ngay <= now && c.muc !== 'Thuộc');
    return { kind: 'the_hoc', mau: 'on_tieng_trung', tieu_de: 'Câu cần ôn hôm nay', list: due, hay_quen: all('the_hoc').filter((c) => (c.so_lan_quen || 0) >= 2).sort((a, b) => b.so_lan_quen - a.so_lan_quen).slice(0, 5) };
  }
  // Nhật ký, tâm trạng
  if (/tam trang|nhat ky|biet on|nang luong|giac ngu/.test(fq)) {
    const r = !R || R.tu > now || R.nhan === '7 ngày tới' ? { tu: dayAdd(now, -6), den: now, nhan: '7 ngày qua' } : { ...R, den: R.den > now ? now : R.den };
    const list = all('nhat_ky_ngay').filter((x) => inRange(x.ngay, r)).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
    const avg = (k) => { const v = list.map((x) => Number(x[k])).filter((n) => n > 0); return v.length ? (v.reduce((s, n) => s + n, 0) / v.length).toFixed(1).replace('.', ',') : '—'; };
    return { kind: 'stats', mau: 'tam_trang', tieu_de: 'Nhật ký ' + r.nhan, items: [[avg('tam_trang'), 'tâm trạng TB'], [avg('nang_luong'), 'năng lượng TB'], [list.length, 'ngày có ghi']], table: 'nhat_ky_ngay', list };
  }
  // Danh bạ: số điện thoại, đầu mối
  if (/so dien thoai|\bsdt\b|dien thoai|lien he|\bemail\b|dau moi|so may/.test(fq)) {
    const q = rest(fq, /\b(so dien thoai|sdt|dien thoai|lien he|email|dau moi|so may|cua|anh|chi|em|ong|ba)\b/g);
    if (!q) return null;
    const ng = all('nguoi').filter((n) => fold([n.ten, n.don_vi, n.chuc_vu].join(' ')).includes(q));
    const dv = all('don_vi').filter((d) => fold([d.ten, d.ma, d.dau_moi].join(' ')).includes(q));
    return { kind: 'danh_ba', mau: 'sdt', tieu_de: 'Liên hệ “' + q + '”', nguoi: ng, don_vi: dv };
  }
  // Gợi ý quán theo món / nơi / bữa: "muốn ăn cá", "ăn sáng Việt Trì", "đặc sản Hải Phòng", "khách sạn Hòa Bình"
  const goiY = goiYQuan(fq, all('dia_diem'), ctx._q);
  if (goiY) return goiY;
  // Địa điểm, chuyến đi
  const LOAI = [[/quan an|an uong|nha hang|an gi\b|\ban ngon/, 'Quán ăn'], [/ca phe|cafe|coffee/, 'Cà phê'], [/tham quan|choi|di dau/, 'Điểm tham quan'], [/khach san|luu tru|nha nghi|homestay/, 'Lưu trú']];
  const loai = LOAI.find(([re]) => re.test(fq));
  if (loai || /dia diem|muon den|cho nao|yeu thich/.test(fq)) {
    let list = all('dia_diem'), lb = [];
    if (loai) { list = list.filter((d) => d.loai === loai[1]); lb.push(loai[1]); }
    if (/muon den|chua den/.test(fq)) { list = list.filter((d) => d.trang_thai === 'Muốn đến'); lb.push('muốn đến'); }
    if (/yeu thich/.test(fq)) { list = list.filter((d) => d.trang_thai === 'Yêu thích'); lb.push('yêu thích'); }
    const q = rest(fq, /\b(quan an|an|nha hang|ca phe|cafe|coffee|tham quan|choi|di dau|khach san|luu tru|nha nghi|homestay|dia diem|muon den|chua den|cho nao|yeu thich|o|gan|tai|ngon)\b/g);
    if (q) { list = list.filter((d) => fold([d.ten, d.dia_chi, d.tinh, (d.nhan || []).join(' ')].join(' ')).includes(q)); lb.push('“' + q + '”'); }
    return L('dia_diem', 'Địa điểm' + (lb.length ? ' · ' + lb.join(' · ') : ''), list, { mau: 'dia_diem' });
  }
  if (/chuyen di|du lich|cong tac/.test(fq) && /sap|toi|ke hoach|dang/.test(fq)) return L('chuyen_di', 'Chuyến đi sắp tới', all('chuyen_di').filter((c) => c.trang_thai !== 'Đã đi' && (!c.tu_ngay || c.tu_ngay >= now)).sort((a, b) => ((a.tu_ngay || '9') < (b.tu_ngay || '9') ? -1 : 1)), { mau: 'chuyen_di' });
  if (/gia vang|\bsjc\b|vang nhan|ty gia|ti gia|\busd\b|do la/.test(fq)) return { kind: 'gia', mau: 'gia' };
  return null;
}

// ---------------- Gợi ý quán ăn / chỗ ở từ Sổ địa điểm ----------------
const MEAL = [[/\ban sang\b|\bbua sang\b/, 'Ăn sáng'], [/\ban trua\b|\bbua trua\b/, 'Ăn trưa'], [/\ban toi\b|\bbua toi\b/, 'Ăn tối'], [/\ban dem\b|\bdem khuya\b/, 'Ăn đêm'], [/\ban vat\b/, 'Ăn vặt']];
const FOOD_INTENT = /\b(muon an|them an|an gi|an o dau|quan nao|goi y quan|quan ngon|dac san|an sang|an trua|an toi|an dem|an vat|khach san|nha nghi|homestay|cho ngu|o dau tot|nha hang)\b|^an\s/;
const FOOD_STOP = /\b(muon|them|an|gi|o|dau|quan|nao|goi|y|ngon|dac|san|sang|trua|toi|dem|vat|bua|khach|nha|nghi|homestay|cho|ngu|tot|hang|tai|gan|mon|di|thi|nen|co|khong|the|la|cua|cho)\b/g;
function nhanDiaDanh(fq, places) {
  const names = [...new Set([...places.map((p) => p.dia_danh).filter(Boolean), ...THANH_PHO, ...TINH_CU])];
  let best = '';
  names.forEach((n) => { const k = fold(n); if ((' ' + fq + ' ').includes(' ' + k + ' ') && k.length > fold(best).length) best = n; });
  return best;
}
export function goiYQuan(fq, places, goc = '') {
  if (!FOOD_INTENT.test(fq)) return null;
  const meal = MEAL.find(([re]) => re.test(fq));
  const hotel = /\b(khach san|nha nghi|homestay|cho ngu)\b/.test(fq);
  const dd = nhanDiaDanh(fq, places);
  let rest = fq;
  if (dd) rest = (' ' + rest + ' ').replace(' ' + fold(dd) + ' ', ' ');
  const words = rest.replace(FOOD_STOP, ' ').split(' ').filter((w) => w.length >= 2 || /^(ca|ga|bo|oc|de|vit|cua|tom|muc|lau|pho|bun|che|xoi|banh|com|chao)$/.test(w));
  const dish = words.join(' ').trim();
  const inPlace = (p) => !dd || [p.dia_danh, p.tinh, p.dia_chi, p.ten].some((x) => (' ' + fold(x || '') + ' ').includes(' ' + fold(dd) + ' '));
  const hasWord = (s, w) => { const t = ' ' + fold(s || '') + ' '; return t.includes(' ' + w + ' ') && !(w === 'ca' && /\bca phe\b/.test(t) && !/\bca (?!phe)/.test(t)); };
  const scored = places.filter((p) => !p.archived && inPlace(p))
    .filter((p) => (hotel ? p.loai === 'Lưu trú' : p.loai !== 'Lưu trú'))
    .filter((p) => !meal || (p.bua || []).includes(meal[1]) || !(p.bua || []).length)
    .map((p) => {
      let s = 0; const ly = [];
      if (dish) {
        const w = dish.split(' ');
        const inList = (list) => (list || []).filter((x) => w.every((t) => hasWord(x, t)));
        const m1 = inList(p.mon), m2 = inList(p.dac_san);
        if (m2.length) { s += 6; ly.push('đặc sản ' + m2.join(', ')); }
        if (m1.length) { s += 5; ly.push(m1.join(', ')); }
        if (w.every((t) => hasWord(p.mon_nen_thu, t))) { s += 4; if (!ly.length) ly.push(p.mon_nen_thu); }
        if (!s && w.every((t) => hasWord([p.ten, p.ghi_chu].join(' '), t))) { s += 2; ly.push('có nhắc trong ghi chú'); }
        if (!s) return null;
      }
      if (meal && (p.bua || []).includes(meal[1])) s += 2;
      s += p.trang_thai === 'Yêu thích' ? 3 : p.trang_thai === 'Đã đến' ? 1 : 0;
      s += (Number(p.danh_gia) || 0) / 2;
      return { p, s, ly: ly.join(' · ') };
    }).filter(Boolean).sort((a, b) => b.s - a.s);
  // Hiện món đúng dấu như anh gõ: lấy lại các chữ gốc tương ứng với phần món.
  const dw = dish.split(' ');
  const dishGoc = goc ? String(goc).split(/\s+/).filter((x) => dw.includes(fold(x))).join(' ') || dish : dish;
  const tieu = [hotel ? 'Chỗ ở' : dish ? 'Quán có ' + dishGoc : 'Quán ăn', meal ? meal[1].toLowerCase() : '', dd ? 'ở ' + dd : ''].filter(Boolean).join(' ');
  return { kind: 'goi_y_quan', mau: 'goi_y_quan', tieu_de: tieu, list: scored.slice(0, 12), dish: dishGoc, dd, meal: meal ? meal[1] : '' };
}

// ---------------- Báo cáo cơ cấu viết lời (đúng mẫu sheet "Báo cáo cơ cấu") ----------------
const BC_EXTRA = [[/\b(xi nghiep|xn|xnld|xnldct|cao the|110)\b/, /^Xí nghiệp/], [/\bhotline\b/, /HOTLINE/i], [/\b(bql|qlda|ban quan ly|ban qlda)\b/, /^BQL/], [/\b(trung tam|thi nghiem|ttnd|tt tnd)\b/, /^Trung tâm thí nghiệm/],
  [/\b(khoi co quan|co quan|phong ban|cac phong)\b/, /^Khối cơ quan/], [/\b(ban giam doc|bgd)\b/, /^Ban giám đốc/], [/\b(dang uy|cong doan)\b/, /^Văn phòng Đảng ủy/]];
/** Chọn báo cáo theo câu: tên đơn vị/viết tắt; không nêu đơn vị = Toàn Công ty. */
export function pickReport(fq, names) {
  const rest = fq.replace(/^(viet|soan) /, ' ').replace(/\b(tong hop|bao cao|soan|co cau|lao dong|to chuc|nhan su|cua|cho|ve)\b/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, nm] of BC_EXTRA) if (re.test(rest)) { const n = names.find((x) => nm.test(x)); if (n) return n; }
  let best = null, len = 0;
  names.forEach((n) => aliases(n).forEach((a) => { if (a.length > len && (' ' + rest + ' ').includes(' ' + a + ' ')) { best = n; len = a.length; } }));
  if (best) return best;
  if (!rest || /\b(cong ty|toan cong ty|pcpt|toan pc|toan bo)\b/.test(rest)) return names.find((x) => x === 'Toàn Công ty') || null;
  return null;
}

// ---------------- Cán bộ quản lý (sheet CBQL) & tiêu chuẩn chức danh (sheet Tiêu chuẩn CD) ----------------
/** Chức danh trưởng/phó theo loại đơn vị. */
export function leadTitles(ten) {
  if (/^Ban giám đốc/i.test(ten)) return ['Giám đốc', 'Phó Giám đốc'];
  if (/^Văn phòng Đảng ủy/i.test(ten)) return ['Phụ trách', 'Phó'];
  if (/^Văn phòng$/i.test(ten)) return ['Chánh Văn phòng', 'Phó Chánh Văn phòng'];
  if (/^Phòng/i.test(ten)) return ['Trưởng phòng', 'Phó trưởng phòng'];
  if (/^Điện lực/i.test(ten)) return ['Trưởng Điện lực', 'Phó Trưởng Điện lực'];
  if (/^BQL|Ban quản lý/i.test(ten)) return ['Trưởng Ban', 'Phó Trưởng Ban'];
  if (/HOTLINE/i.test(ten)) return ['Đội trưởng', 'Đội phó'];
  return ['Giám đốc', 'Phó Giám đốc'];
}
/** Văn bản: ban lãnh đạo một đơn vị. */
export function leadText(u) {
  const [t, p] = leadTitles(u.ten);
  const L = [`Ban lãnh đạo ${u.ten} (${u.tong} người${u.nu ? ', ' + u.nu + ' nữ' : ''}):`];
  L.push(`- ${t}: ${u.ds_truong.length ? u.ds_truong.join(', ') : 'chưa có'}.`);
  L.push(`- ${u.ds_pho.length > 1 ? 'Các ' : ''}${p}: ${u.ds_pho.length ? u.ds_pho.join(', ') : 'chưa có'}.`);
  if (u.to_truong || u.to_pho) L.push(`(Tổ trưởng: ${u.to_truong}, tổ phó: ${u.to_pho} — không tính trong ban lãnh đạo.)`);
  return L.join('\n');
}
/** Văn bản: tổng số trưởng, phó (không tính BGĐ và Văn phòng Đảng ủy, Công đoàn). */
export function cbqlText(dv) {
  const sum = (xs, k) => xs.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const G = [
    ['Phòng chức năng', dv.filter((u) => u.khoi === 'Phòng ban' && !/^Văn phòng Đảng ủy/i.test(u.ten)), 'trưởng phòng/chánh VP', 'phó phòng/phó chánh VP'],
    ['Điện lực', dv.filter((u) => u.khoi === 'Điện lực'), 'trưởng Điện lực', 'phó trưởng Điện lực'],
    ['Xí nghiệp lưới điện cao thế', dv.filter((u) => /^Xí nghiệp/i.test(u.ten)), 'giám đốc', 'phó giám đốc'],
    ['Ban quản lý dự án', dv.filter((u) => /^BQL|Ban quản lý/i.test(u.ten)), 'trưởng ban', 'phó trưởng ban'],
    ['Trung tâm thí nghiệm điện', dv.filter((u) => /^Trung tâm/i.test(u.ten)), 'giám đốc', 'phó giám đốc']
  ].filter((g) => g[1].length);
  const all = G.flatMap((g) => g[1]);
  const T = sum(all, 'truong'), P = sum(all, 'pho'), N = sum(all, 'nu');
  const L = [`Tổng số lượng trưởng, phó (không tính Ban Giám đốc và Văn phòng Đảng ủy, Công đoàn): ${T + P} người (${T} trưởng, ${P} phó; nữ ${N} người), trong đó:`];
  G.forEach(([ten, xs, tt, pp]) => {
    const t = sum(xs, 'truong'), p = sum(xs, 'pho'), n = sum(xs, 'nu');
    L.push(`+ ${xs.length > 1 ? String(xs.length).padStart(2, '0') + ' ' : ''}${ten}: ${t + p} người (${t} ${tt}, ${p} ${pp}${n ? '; nữ ' + n : ''})`);
  });
  const hl = dv.filter((u) => /HOTLINE/i.test(u.ten));
  if (hl.length) { const t = sum(hl, 'truong'), p = sum(hl, 'pho'); L.push(`(Đội Hotline: ${t} đội trưởng, ${p} đội phó — chưa tính ở trên; nếu tính cả là ${T + P + t + p} người.)`); }
  return L.join('\n');
}
const TC_STOP = new Set(['tieu', 'chuan', 'chuc', 'danh', 'cua', 'la', 'gi', 'the', 'nao', 'nhung', 'yeu', 'cau', 'dieu', 'kien', 'de', 'lam', 'cho', 've', 'cac', 'vi', 'tri', 'giao', 'nhiem', 'vu']);
/** Chọn chức danh khớp nhất: đủ các chữ của câu, ít chữ thừa nhất. */
export function pickStandard(fq, list) {
  const q = fq.split(' ').filter((w) => w && !TC_STOP.has(w));
  if (!q.length) return null;
  let best = null, bs = -1e9;
  list.forEach((x) => {
    const w = fold(x.ap_dung + ' ' + x.ma).split(/[\s/()-]+/).filter(Boolean);
    const hit = q.filter((t) => w.includes(t)).length;
    if (hit < q.length) return;
    const own = fold(x.ap_dung).split(/[\s/()-]+/).filter(Boolean);
    const sc = hit * 10 - own.filter((t) => !q.includes(t)).length;
    if (sc > bs) { bs = sc; best = x; }
  });
  return best;
}
/** Văn bản: tiêu chuẩn một chức danh. */
export function standardText(x, canCu) {
  const lines = (s) => String(s || '').replace(/\s*(\d+)-/g, '\n$1- ').trim();
  const tn = [x.tn_dh && `ĐH/ThS ${x.tn_dh} năm`, x.tn_cd && `CĐ ${x.tn_cd} năm`, x.tn_tc && `TC/CNKT ${x.tn_tc} năm`].filter(Boolean).join(', ');
  return [`TIÊU CHUẨN CHỨC DANH: ${x.ap_dung.toUpperCase()}`, canCu ? `(${canCu.replace(/^TIÊU CHUẨN CHỨC DANH GIAO NHIỆM VỤ\s*/i, '').replace(/^\(|\)$/g, '')})` : '',
    x.trinh_do ? '1. Trình độ:\n' + lines(x.trinh_do) : '', x.nang_luc ? '2. Năng lực:\n' + lines(x.nang_luc) : '', x.kinh_nghiem ? '3. Kinh nghiệm:\n' + lines(x.kinh_nghiem) : '',
    x.trinh_do_min || tn ? `Kiểm tra nhanh: trình độ tối thiểu ${x.trinh_do_min || '—'}${x.bac_tho ? ' (hoặc bậc thợ ≥ ' + x.bac_tho + '/7)' : ''}${tn ? '; thâm niên ngành: ' + tn : ''}.` : ''].filter(Boolean).join('\n');
}
// ---- Ai giữ chức danh gì (sheet DS chức danh: [họ tên, chức danh, tổ, đơn vị]) ----
// Đội trưởng/phó, trưởng/phó đơn vị: đã có ở phần lãnh đạo (CBQL), không xử lý ở đây.
const ROLE_RE = /\b(to truong|to pho|ky thuat vien|thu kho|ke toan vien|nhan vien cong nghe thong tin|can bo an toan)\b/;
const unitKeys = (dv) => { const f = fold(dv); const out = [f]; const s = f.replace(/^(dien luc|xi nghiep|trung tam|ban quan ly|doi) /, ''); if (s !== f && s.length >= 3) out.push(s); return out; };
/** Câu kiểu "tổ trưởng tổ tổng hợp Điện lực Đà Bắc là ai" → các dòng khớp nhất. */
export function chucDanhAnswer(fq, hr) {
  if (!ROLE_RE.test(fq) || /\btieu chuan\b/.test(fq)) return null;
  const cd = hr.bien_dong && hr.bien_dong.chuc_danh;
  if (!cd || !cd.list || !cd.list.length) return { kind: 'cho_so_lieu', tieu_de: 'Danh sách chức danh' };
  const units = [...new Set(cd.list.map((r) => r[3]).filter(Boolean))];
  let unit = null, ulen = 0, ukey = '';
  units.forEach((u) => unitKeys(u).forEach((k) => { if (k.length > ulen && (' ' + fq + ' ').includes(' ' + k + ' ')) { unit = u; ulen = k.length; ukey = k; } }));
  const role = (fq.match(ROLE_RE) || [])[1];
  let rest = (' ' + fq + ' ').replace(' ' + ukey + ' ', ' ').replace(role, ' ')
    .replace(/\b(la ai|ai la|ai dang|cua|tai|o|thuoc|dien luc|hien nay|hien tai|cho biet|cac|nhung|danh sach|gom)\b/g, ' ').replace(/\bto\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = rest ? rest.split(' ').filter((w) => w.length >= 2) : [];
  let rows = cd.list.filter((r) => (!unit || r[3] === unit) && fold(r[1]).startsWith(role));
  const score = (r) => { const t = fold(r[1] + ' ' + r[2]); return words.filter((w) => (' ' + t + ' ').includes(' ' + w + ' ')).length; };
  if (words.length) {
    const best = Math.max(0, ...rows.map(score));
    rows = best ? rows.filter((r) => score(r) === best) : [];
    // Đúng tên tổ ("Tổ Tổng hợp") xếp trước tổ dài hơn có cùng chữ ("Tổ Quản lý tổng hợp").
    rows.sort((a, b) => a[2].length - b[2].length);
  }
  const head = [role ? (q0 => q0.charAt(0).toUpperCase() + q0.slice(1))(({ 'to truong': 'tổ trưởng', 'to pho': 'tổ phó', 'ky thuat vien': 'kỹ thuật viên', 'thu kho': 'thủ kho', 'ke toan vien': 'kế toán viên', 'nhan vien cong nghe thong tin': 'nhân viên CNTT', 'can bo an toan': 'cán bộ an toàn' })[role]) : 'Chức danh', words.length ? '“' + rest + '”' : '', unit || ''].filter(Boolean).join(' · ');
  const text = rows.slice(0, 40).map((r) => `${r[1]}${r[2] && fold(r[1]).indexOf(fold(r[2]).replace(/^to /, '')) < 0 ? ' (' + r[2] + ')' : ''} – ${r[3]}: ${r[0]}`).join('\n');
  return { kind: 'chuc_danh', mau: 'chuc_danh', tieu_de: head, list: rows.slice(0, 40), tong: rows.length, text, loc: cd.loc || '' };
}

function cbqlAnswer(fq, hr) {
  const bd = hr.bien_dong || {};
  const tc = bd.tieu_chuan;
  if (/\btieu chuan\b/.test(fq) && !(tc && tc.list && tc.list.length)) return { kind: 'cho_so_lieu', tieu_de: 'Tiêu chuẩn chức danh' };
  if (/\btieu chuan\b/.test(fq) && tc && tc.list && tc.list.length) {
    const x = pickStandard(fq, tc.list);
    return { kind: 'tieu_chuan', mau: 'tieu_chuan', item: x, text: x ? standardText(x, tc.can_cu) : '', names: tc.list.map((y) => y.ap_dung) };
  }
  const cb = bd.cbql;
  const asksLead0 = /lanh dao|ai la truong|gom nhung ai|truong pho|\bcbql\b|can bo quan ly/.test(fq);
  if ((!cb || !cb.don_vi || !cb.don_vi.length)) return asksLead0 ? { kind: 'cho_so_lieu', tieu_de: 'Trưởng, phó các đơn vị' } : null;
  const asksLead = /lanh dao|ai la truong|gom nhung ai|gom ai|truong pho|truong phong|truong dien luc|giam doc|chanh van phong|doi truong/.test(fq);
  const asksCount = /\bcbql\b|can bo quan ly/.test(fq) || (/so luong|bao nhieu|tong so|thong ke|\bdem\b/.test(fq) && /\b(truong|pho|lanh dao)\b/.test(fq));
  if (!asksLead && !asksCount) return null;
  const names = cb.don_vi.map((u) => u.ten);
  let ten = pickReport(fq.replace(/\b(ban lanh dao|lanh dao|ai la|gom nhung ai|gom ai|truong pho|so luong|bao nhieu|tong so|cbql|can bo quan ly)\b/g, ' '), names);
  if (!ten && /\b(cong ty|bgd|ban giam doc)\b/.test(fq)) ten = names.find((n) => /^Ban giám đốc/i.test(n)) || null;
  if (ten && (asksLead || !/cac don vi|toan cong ty/.test(fq))) { const u = cb.don_vi.find((x) => x.ten === ten); return { kind: 'lanh_dao', mau: 'lanh_dao', ten, text: leadText(u), names }; }
  return { kind: 'cbql_tong', mau: 'cbql_tong', text: cbqlText(cb.don_vi), tom_tat: cb.tom_tat };
}

/** Hiểu câu hỏi → câu trả lời có cấu trúc, hoặc null nếu không nhận ra. */
export function understand(q, ctx) {
  ctx = { ...ctx, _q: q };
  const fq = fold(q);
  if (!fq || fq.length < 3) return null;
  const hr = ctx.hr || {};
  if (/\b(tong hop|bao cao|viet|soan) co cau\b|^co cau (lao dong|to chuc)/.test(fq) && !(hr.co_cau && hr.co_cau.bao_cao)) return { kind: 'cho_so_lieu', tieu_de: 'Báo cáo cơ cấu' };
  if (/\b(tong hop|bao cao|viet|soan) co cau\b|^co cau (lao dong|to chuc)/.test(fq) && hr.co_cau && hr.co_cau.bao_cao) {
    const names = Object.keys(hr.co_cau.bao_cao);
    const ten = pickReport(fq, names);
    return { kind: 'bao_cao_cc', mau: 'bao_cao_cc', ten, names, text: ten ? hr.co_cau.bao_cao[ten] : '', den_ngay: hr.co_cau.den_ngay };
  }
  const cdq = chucDanhAnswer(fq, hr);
  if (cdq) return cdq;
  const cbq = cbqlAnswer(fq, hr);
  if (cbq) return cbq;
  const a = lifeAnswer(fq, ctx);
  if (a) return a;
  const td = tdAnswer(fq, hr);
  if (td) return { ...td, mau: /^td\d/.test(fq.replace(/\s/g, '')) ? 'td_ma' : 'td_loc' };
  const qd = qdAnswer(fq, hr, ctx.now);
  if (qd) return { ...qd, mau: /^Quyết định số/.test(qd.tieu_de) ? 'qd_so' : QD_KIEU.some(([re]) => re.test(fq)) ? 'qd_loai' : 'qd_ten' };
  const cc = hr.co_cau;
  if (cc && cc.bang) {
    const focus = unitFocus(fq);
    const row = findUnit(fq, cc);
    if (row) return { kind: 'don_vi', focus, so: unitStats(cc, row), den_ngay: cc.den_ngay, mau: 'dv_' + (focus || 'tong') };
    if (focus && /cong ty|toan bo|tat ca/.test(fq)) { const t = cc.bang.dong.find(isTotal); if (t) return { kind: 'don_vi', focus, so: unitStats(cc, t), den_ngay: cc.den_ngay, mau: 'dv_' + focus }; }
  }
  if (/bien dong|nhan su thang|tang giam|dau ky|cuoi ky|tong so lao dong|quan so/.test(fq) && hr.bien_dong && hr.bien_dong.chi_so) {
    const bd = hr.bien_dong, per = parseMonth(fq, ctx.now);
    const thang = per.thang || (bd.thang ? ctx.now.slice(0, 4) + '-' + pad(bd.thang) : ctx.now.slice(0, 7));
    const list = (bd.quyet_dinh || []).filter((x) => String(x.ngay || '').startsWith(thang)).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
    return { kind: 'tong_quan', bd, thang, list, mau: 'bien_dong' };
  }
  return null;
}

/** Tìm thô trong số liệu nhân sự (khi câu không phải câu hỏi): người trong QĐ, đơn vị, hồ sơ. */
export function hrHits(q, hr) {
  const fq = fold(q);
  if (!fq || fq.length < 2 || !hr) return { qd: [], don_vi: [], ho_so: [] };
  const tokens = fq.split(' ');
  const match = (t) => tokens.every((w) => t.includes(w));
  const qd = ((hr.bien_dong && hr.bien_dong.quyet_dinh) || []).filter((x) => match(fold([x.ten, x.qd, x.tu, x.den, x.loai, x.cd_moi].join(' '))));
  const don_vi = ((hr.co_cau && hr.co_cau.bang && hr.co_cau.bang.dong) || []).filter((r) => r.B && r.A !== 'PB' && match(fold(r.B)));
  const ho_so = ((hr.tham_dinh && hr.tham_dinh.ho_so) || []).filter((x) => match(fold([x.ma, x.ten, x.vb_so, x.loai].join(' '))));
  return { qd: qd.sort((a, b) => (a.ngay < b.ngay ? 1 : -1)), don_vi, ho_so };
}

// ---------------- Sổ tay câu hỏi (học dần, đánh dấu mẫu đã dùng) ----------------
export const BOOK = [
  ['☀️ Hôm nay & lịch', [['hom_nay', 'hôm nay có gì', 'lịch, việc, quá hạn, văn bản sắp hạn'], ['lich', 'lịch ngày mai', 'hoặc: lịch tuần này, lịch thứ 6, lịch tháng 12'], ['hop', 'họp tuần này', 'chỉ các cuộc họp']]],
  ['✅ Việc', [['viec_qua_han', 'việc quá hạn', ''], ['viec_ngay', 'việc hôm nay', 'hoặc: việc ngày mai, việc thứ 2'], ['viec_tuan', 'việc tuần sau', ''], ['viec_gap', 'việc gấp', 'gấp hoặc quan trọng'], ['viec_cho', 'việc đang chờ', ''], ['viec_xong', 'việc đã xong tuần này', 'để tổng kết'], ['viec_linh_vuc', 'việc đào tạo', 'việc + tên lĩnh vực'], ['viec_khong_han', 'việc chưa có hạn', '']]],
  ['📄 Văn bản', [['vb_han', 'văn bản sắp hạn', 'hoặc: văn bản hạn tuần sau'], ['vb_qua_han', 'văn bản quá hạn', ''], ['vb_chu_tri', 'văn bản chủ trì', 'hoặc: văn bản phối hợp'], ['vb_ngay', 'văn bản tuần này', 'ban hành trong tuần'], ['dv_chua_gui', 'văn bản đơn vị chưa gửi', 'theo dõi 47 đơn vị']]],
  ['👥 Nhân sự', [['dv_dinh_bien', 'định biên Cẩm Khê', 'thừa/thiếu so với định biên'], ['dv_gioi_tinh', 'tỷ lệ nữ Lâm Thao', ''], ['dv_trinh_do', 'trình độ phòng TCNS', 'viết tắt tên phòng được'], ['dv_tuoi', 'tuổi bình quân Hòa Bình', ''], ['dv_tong', 'Phù Ninh', 'gõ tên đơn vị = xem nhanh'], ['bien_dong', 'biến động tháng này', ''], ['cbql_tong', 'số lượng trưởng phó', '12 phòng, 31 Điện lực, XN, BQL, TT — không tính BGĐ, ĐU-CĐ'], ['lanh_dao', 'lãnh đạo phòng TCNS', 'hoặc: ban lãnh đạo Điện lực Cẩm Khê — trưởng là ai, các phó'], ['chuc_danh', 'tổ trưởng tổ tổng hợp Đà Bắc', 'hoặc: tổ phó kinh doanh Yên Lập, các tổ trưởng Cẩm Khê'], ['tieu_chuan', 'tiêu chuẩn tổ trưởng tổng hợp', 'hoặc: tiêu chuẩn phó trưởng điện lực, kế toán viên'], ['bao_cao_cc', 'tổng hợp cơ cấu công ty', 'hoặc: …Điện lực Cẩm Khê, Xí nghiệp, BQL, phòng TCNS — viết sẵn, bấm Sao chép'], ['qd_loai', 'điều động tháng 12', 'nghỉ hưu, bổ nhiệm, tuyển mới…'], ['qd_ten', 'Nguyễn Văn Hùng', 'tên người → quyết định'], ['qd_so', 'QĐ 3887', 'số quyết định'], ['td_loc', 'thẩm định trễ hạn', 'hoặc: hồ sơ KV2 chưa đăng ký DO'], ['td_ma', 'TD26-001', 'mã hồ sơ']]],
  ['🗒 Ghi chú & dự án', [['gc_ve', 'ghi chú về BHXH', 'ghi chú + chủ đề'], ['gc_ghim', 'ghi chú ghim', ''], ['gc_ngay', 'ghi chú tuần này', ''], ['inbox', 'inbox chưa xử lý', ''], ['du_an', 'dự án đang làm', 'hoặc: dự án sắp hạn']]],
  ['🌱 Bản thân', [['sach_dang', 'đang đọc sách gì', 'hoặc: sách muốn đọc'], ['sach_nam', 'đọc được bao nhiêu sách năm nay', 'so với mục tiêu'], ['thoi_quen', 'thói quen hôm nay', 'kèm chuỗi ngày'], ['on_tieng_trung', 'câu tiếng Trung cần ôn', ''], ['buoi_hoc', 'buổi học tiếp theo', ''], ['tam_trang', 'tâm trạng tuần này', 'từ nhật ký ngày']]],
  ['📇 Danh bạ, nơi chốn, giá', [['sdt', 'số điện thoại Hùng', 'người hoặc đơn vị'], ['goi_y_quan', 'muốn ăn cá', 'hoặc: ăn sáng Việt Trì, đặc sản Hải Phòng, khách sạn Hòa Bình'], ['dia_diem', 'quán ăn ở Việt Trì', 'hoặc: cà phê muốn đến'], ['chuyen_di', 'chuyến đi sắp tới', ''], ['gia', 'giá vàng', 'USD, SJC, nhẫn']]]
];
export const BOOK_IDS = BOOK.flatMap(([, xs]) => xs.map((x) => x[0]));
/** Mẹo hỏi trong ngày: ưu tiên mẫu chưa dùng, đổi mỗi ngày. */
export function tipOfDay(used, now) {
  const items = BOOK.flatMap(([, xs]) => xs);
  const fresh = items.filter((x) => !used.includes(x[0]));
  const pool = fresh.length ? fresh : items;
  const n = Number(now.replace(/-/g, '')) % pool.length;
  return pool[n];
}
