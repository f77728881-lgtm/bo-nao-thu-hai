// Hỏi nhanh không cần AI: hiểu câu hỏi tiếng Việt thường gặp trong ô Tìm và trả lời bằng dữ liệu sẵn có.
// Thuần dữ liệu (không đụng giao diện) để chạy thử được bằng tests/ask_test.mjs.
// understand(q, ctx) → { kind, tieu_de, ... } hoặc null.  ctx = { hr, now, viec, van_ban, gia }
import { fold } from './util.js';

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

// ---------------- Việc, văn bản, giá ----------------
function appAnswer(fq, ctx) {
  const now = ctx.now, open = (v) => v.trang_thai !== 'Xong' && !v.archived;
  const day = (s) => String(s || '').slice(0, 10);
  const plus = (n) => { const d = new Date(now + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  if (/\bviec\b/.test(fq)) {
    const vs = (ctx.viec || []).filter(open);
    if (/qua han|tre/.test(fq)) return { kind: 'viec', tieu_de: 'Việc quá hạn', list: vs.filter((v) => v.han && day(v.han) < now) };
    if (/hom nay/.test(fq)) return { kind: 'viec', tieu_de: 'Việc hôm nay', list: vs.filter((v) => day(v.han) === now) };
    if (/ngay mai/.test(fq)) return { kind: 'viec', tieu_de: 'Việc ngày mai', list: vs.filter((v) => day(v.han) === plus(1)) };
    if (/tuan nay|7 ngay/.test(fq)) return { kind: 'viec', tieu_de: 'Việc 7 ngày tới', list: vs.filter((v) => v.han && day(v.han) >= now && day(v.han) <= plus(7)) };
    if (/gap|quan trong|uu tien/.test(fq)) return { kind: 'viec', tieu_de: 'Việc gấp/quan trọng', list: vs.filter((v) => v.gap || v.quan_trong) };
  }
  if (/van ban|cong van/.test(fq) && /han|qua han|can xu ly|chua xu ly|sap/.test(fq)) {
    const ds = (ctx.van_ban || []).filter(open);
    if (/qua han/.test(fq)) return { kind: 'van_ban', tieu_de: 'Văn bản quá hạn', list: ds.filter((d) => d.han_xu_ly && day(d.han_xu_ly) < now) };
    return { kind: 'van_ban', tieu_de: 'Văn bản cần xử lý 7 ngày tới', list: ds.filter((d) => d.han_xu_ly && day(d.han_xu_ly) >= now && day(d.han_xu_ly) <= plus(7)) };
  }
  if (/gia vang|\bsjc\b|vang nhan|ty gia|ti gia|\busd\b|do la/.test(fq)) return { kind: 'gia' };
  return null;
}

/** Hiểu câu hỏi → câu trả lời có cấu trúc, hoặc null nếu không nhận ra. */
export function understand(q, ctx) {
  const fq = fold(q);
  if (!fq || fq.length < 3) return null;
  const hr = ctx.hr || {};
  const a = appAnswer(fq, ctx);
  if (a) return a;
  const td = tdAnswer(fq, hr);
  if (td) return td;
  const qd = qdAnswer(fq, hr, ctx.now);
  if (qd) return qd;
  const cc = hr.co_cau;
  if (cc && cc.bang) {
    const focus = unitFocus(fq);
    const row = findUnit(fq, cc);
    if (row) return { kind: 'don_vi', focus, so: unitStats(cc, row), den_ngay: cc.den_ngay };
    if (focus && /cong ty|toan bo|tat ca/.test(fq)) { const t = cc.bang.dong.find(isTotal); if (t) return { kind: 'don_vi', focus, so: unitStats(cc, t), den_ngay: cc.den_ngay }; }
  }
  if (/bien dong|nhan su thang|tang giam|dau ky|cuoi ky|tong so lao dong|quan so/.test(fq) && hr.bien_dong && hr.bien_dong.chi_so) {
    const bd = hr.bien_dong, per = parseMonth(fq, ctx.now);
    const thang = per.thang || (bd.thang ? ctx.now.slice(0, 4) + '-' + pad(bd.thang) : ctx.now.slice(0, 7));
    const list = (bd.quyet_dinh || []).filter((x) => String(x.ngay || '').startsWith(thang)).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
    return { kind: 'tong_quan', bd, thang, list };
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
