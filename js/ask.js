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
  if (/^inbox|inbox chua|chua xu ly inbox/.test(fq)) return L('inbox', 'Inbox chưa xử lý', all('inbox').filter((x) => !x.da_xu_ly), { mau: 'inbox' });
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

/** Hiểu câu hỏi → câu trả lời có cấu trúc, hoặc null nếu không nhận ra. */
export function understand(q, ctx) {
  const fq = fold(q);
  if (!fq || fq.length < 3) return null;
  const hr = ctx.hr || {};
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
  ['👥 Nhân sự', [['dv_dinh_bien', 'định biên Cẩm Khê', 'thừa/thiếu so với định biên'], ['dv_gioi_tinh', 'tỷ lệ nữ Lâm Thao', ''], ['dv_trinh_do', 'trình độ phòng TCNS', 'viết tắt tên phòng được'], ['dv_tuoi', 'tuổi bình quân Hòa Bình', ''], ['dv_tong', 'Phù Ninh', 'gõ tên đơn vị = xem nhanh'], ['bien_dong', 'biến động tháng này', ''], ['qd_loai', 'điều động tháng 12', 'nghỉ hưu, bổ nhiệm, tuyển mới…'], ['qd_ten', 'Nguyễn Văn Hùng', 'tên người → quyết định'], ['qd_so', 'QĐ 3887', 'số quyết định'], ['td_loc', 'thẩm định trễ hạn', 'hoặc: hồ sơ KV2 chưa đăng ký DO'], ['td_ma', 'TD26-001', 'mã hồ sơ']]],
  ['🗒 Ghi chú & dự án', [['gc_ve', 'ghi chú về BHXH', 'ghi chú + chủ đề'], ['gc_ghim', 'ghi chú ghim', ''], ['gc_ngay', 'ghi chú tuần này', ''], ['inbox', 'inbox chưa xử lý', ''], ['du_an', 'dự án đang làm', 'hoặc: dự án sắp hạn']]],
  ['🌱 Bản thân', [['sach_dang', 'đang đọc sách gì', 'hoặc: sách muốn đọc'], ['sach_nam', 'đọc được bao nhiêu sách năm nay', 'so với mục tiêu'], ['thoi_quen', 'thói quen hôm nay', 'kèm chuỗi ngày'], ['on_tieng_trung', 'câu tiếng Trung cần ôn', ''], ['buoi_hoc', 'buổi học tiếp theo', ''], ['tam_trang', 'tâm trạng tuần này', 'từ nhật ký ngày']]],
  ['📇 Danh bạ, nơi chốn, giá', [['sdt', 'số điện thoại Hùng', 'người hoặc đơn vị'], ['dia_diem', 'quán ăn ở Việt Trì', 'hoặc: cà phê muốn đến'], ['chuyen_di', 'chuyến đi sắp tới', ''], ['gia', 'giá vàng', 'USD, SJC, nhẫn']]]
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
