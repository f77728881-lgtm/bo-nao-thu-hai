// Đọc câu nhập nhanh tiếng Việt → bản ghi.
// Ví dụ: "mai 9h họp giao ban @phòng họp #đào tạo !gấp", "việc: nộp báo cáo BHXH thứ 6 !qt",
//        "ghi chú: mật khẩu wifi phòng họp…", "25/12 14h30 khám sức khỏe 2 tiếng"
import { today, addDays, weekday, fold, pad } from './util.js';

const TYPE_PREFIX = [
  [/^(viec|todo|task)\s*[:\-]\s*/, 'viec'],
  [/^(su kien|lich|hop|hen)\s*[:\-]\s*/, 'su_kien'],
  [/^(ghi chu|gc|note)\s*[:\-]\s*/, 'ghi_chu'],
  [/^(inbox|nhap)\s*[:\-]\s*/, 'inbox']
];
const EVENT_WORDS = /\b(hop|hen|gap|kham|hoc|tiep|du|di|bay|lich truc|hoi nghi|hoi thao|tap huan|dao tao)\b/;
const WD_MAP = { 'chu nhat': 0, cn: 0, 'thu 2': 1, 'thu hai': 1, t2: 1, 'thu 3': 2, 'thu ba': 2, t3: 2, 'thu 4': 3, 'thu tu': 3, t4: 3, 'thu 5': 4, 'thu nam': 4, t5: 4, 'thu 6': 5, 'thu sau': 5, t6: 5, 'thu 7': 6, 'thu bay': 6, t7: 6 };

/**
 * Trả về { type, data, chips } – data đúng trường của bảng tương ứng.
 * areas/projects: danh sách {id, ten} để khớp #nhãn.
 */
export function parse(input, { areas = [], projects = [], now = today() } = {}) {
  let text = ` ${input.trim()} `;
  const f = (s) => fold(s);
  const chips = [];
  let type = null;

  // 1. Tiền tố loại
  const head = f(input.trim());
  for (const [re, t] of TYPE_PREFIX) {
    const m = head.match(re);
    if (m) { type = t; text = ' ' + input.trim().slice(m[0].length) + ' '; break; }
  }

  // Xóa đoạn đã khớp trên chuỗi gốc theo vị trí khớp trên chuỗi không dấu (độ dài bằng nhau với NFC).
  const take = (re, fn) => {
    const folded = f(text).padEnd(text.length);
    // fold() gộp khoảng trắng; dùng bản không gộp để giữ vị trí.
    const raw = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const src = raw.length === text.length ? raw : folded;
    const m = src.match(re);
    if (!m) return false;
    const start = m.index, end = m.index + m[0].length;
    const original = text.slice(start, end);
    if (fn(m, original) === false) return false;
    text = text.slice(0, start) + ' ' + text.slice(end);
    return true;
  };

  // 2. Cờ ưu tiên
  let gap = false, quanTrong = false;
  take(/\s!(gap|g|urgent)\b/, () => { gap = true; });
  take(/\s!(qt|quan trong|important|q)\b/, () => { quanTrong = true; });
  take(/\s!(gqt|!)\s/, () => { gap = true; quanTrong = true; });

  // 3. #lĩnh vực / dự án
  let linhVuc = null, duAn = null;
  take(/\s#([\p{L}\p{N}_\-]+(?:\s[\p{L}\p{N}_\-]+)?)/u, (m) => {
    const key = f(m[1]).replace(/[_\-]/g, ' ');
    const pick = (list) => list.find((x) => f(x.ten) === key) || list.find((x) => f(x.ten).startsWith(key)) || list.find((x) => f(x.ten).includes(key.split(' ')[0]));
    linhVuc = pick(areas) || null;
    if (!linhVuc) duAn = pick(projects) || null;
    if (!linhVuc && !duAn) {
      // Chỉ thử với từ đầu tiên
      const one = key.split(' ')[0];
      linhVuc = areas.find((x) => f(x.ten).includes(one)) || null;
    }
    if (!linhVuc && !duAn) return false;
  });

  // 4. @địa điểm (tới hết câu hoặc trước dấu # ! )
  let diaDiem = '';
  take(/\s@([^#!]+?)(?=\s[#!]|\s*$)/, (m, orig) => { diaDiem = orig.trim().slice(1).trim(); });

  // 5a. Giờ viết bằng chữ: "14 giờ 30", "8 giờ 15 phút sáng", "lúc 9 giờ" (đọc trước thời lượng để "30 phút" không bị hiểu nhầm)
  let time = null;
  const setTime = (h, mi, period) => {
    if (h > 23 || mi > 59) return false;
    if ((period === 'chieu' || period === 'toi') && h < 12) h += 12;
    if (period === 'trua' && h < 11) h += 12;
    time = `${pad(h)}:${pad(mi)}`;
  };
  take(/(?<!trong)\s(?:luc\s|vao\s|vao luc\s|tu\s)?(\d{1,2})\s?gio(?:\s?(\d{1,2})(?:\s?phut)?|\s?(ruoi))?(?:\s(sang|trua|chieu|toi|dem))?\b/, (m) => {
    // "trong 2 giờ" là thời lượng, để bước sau xử lý
    return setTime(+m[1], m[3] ? 30 : m[2] ? +m[2] : 0, m[4]);
  });

  // 5. Thời lượng
  let minutes = null;
  take(/\s(?:trong\s)(\d+(?:[.,]\d+)?)\s?(tieng|gio)\b/, (m) => { minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60); }) ||
  take(/\s(?:trong\s)?(\d+(?:[.,]\d+)?)\s?tieng\b/, (m) => { minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60); });
  take(/\s(?:trong\s)?(\d+)\s?(p|phut|ph)\b/, (m) => { minutes = parseInt(m[1], 10); });

  // 6. Ngày
  let day = null;
  const setDay = (d) => { day = d; };
  let periodHint = null;
  take(/\s(sang|trua|chieu|toi)\s(nay|mai|mot)\b/, (m) => { periodHint = m[1]; setDay(addDays(now, { nay: 0, mai: 1, mot: 2 }[m[2]])); }) ||
  take(/\s(?:ngay\s)?(\d{1,2})\sthang\s(\d{1,2})(?:\s(?:nam\s)?(\d{4}))?\b/, (m) => {
    const d = +m[1], mo = +m[2]; if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
    let y = m[3] ? +m[3] : +now.slice(0, 4); let cand = `${y}-${pad(mo)}-${pad(d)}`;
    if (!m[3] && cand < addDays(now, -60)) cand = `${y + 1}-${pad(mo)}-${pad(d)}`;
    setDay(cand);
  }) ||
  take(/\s(hom nay|bay gio|nay)\b/, () => setDay(now)) ||
  take(/\s(ngay mai|mai)\b/, () => setDay(addDays(now, 1))) ||
  take(/\s(ngay kia|mot)\b/, () => setDay(addDays(now, 2))) ||
  take(/\s(\d+)\sngay nua\b/, (m) => setDay(addDays(now, parseInt(m[1], 10)))) ||
  take(/\s(cuoi tuan)( sau)?\b/, (m) => { let n = (6 - weekday(now) + 7) % 7; if (m[2]) n += 7; setDay(addDays(now, n)); }) ||
  take(/\s(cuoi thang)\b/, () => { const [y, mo] = now.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); setDay(`${y}-${pad(mo)}-${pad(last)}`); }) ||
  take(/\s(chu nhat|cn|thu [2-7]|thu (?:hai|ba|tu|nam|sau|bay)|t[2-7])( tuan sau| tuan toi)?\b/, (m) => {
    const target = WD_MAP[m[1]];
    if (m[2]) {
      // Tuần sau: thứ Hai tuần sau + số ngày (chủ nhật là ngày cuối tuần)
      const nextMonday = addDays(now, ((8 - weekday(now)) % 7) || 7);
      setDay(addDays(nextMonday, (target + 6) % 7));
      return;
    }
    let n = (target - weekday(now) + 7) % 7;
    if (n === 0) n = 7;
    setDay(addDays(now, n));
  }) ||
  take(/\s(tuan sau|tuan toi)\b/, () => { const n = ((8 - weekday(now)) % 7) || 7; setDay(addDays(now, n)); }) ||
  take(/\s(?:ngay\s)?(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/, (m) => {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
    let y = m[3] ? +m[3] : +now.slice(0, 4);
    if (y < 100) y += 2000;
    let cand = `${y}-${pad(mo)}-${pad(d)}`;
    if (!m[3] && cand < addDays(now, -60)) cand = `${y + 1}-${pad(mo)}-${pad(d)}`;
    setDay(cand);
  });

  // 7. Giờ: 9h, 14h30, 14:30, 14g30, 7h30', 3h chiều
  if (!time) take(/\s(?:luc\s|vao\s|vao luc\s|tu\s)?(\d{1,2})(?:h|:|g)(\d{2})?(?:p|')?\s?(sang|trua|chieu|toi|dem)?(?![\d\/])/, (m) => setTime(+m[1], m[2] ? +m[2] : 0, m[3]));
  if (time && periodHint && +time.slice(0, 2) < 12 && (periodHint === 'chieu' || periodHint === 'toi')) time = `${pad(+time.slice(0, 2) + 12)}${time.slice(2)}`;
  if (time && !day) day = now;

  // 8. Tiêu đề = phần còn lại
  const title = text.replace(/\s+/g, ' ').replace(/^[\s,.;:\-]+|[\s,.;:\-]+$/g, '').trim();
  const t0 = cleanTitle(title);
  const t = t0.charAt(0).toUpperCase() + t0.slice(1);

  // 9. Chọn loại
  if (!type) {
    if (time && (EVENT_WORDS.test(f(t)) || diaDiem)) type = 'su_kien';
    else if (day || gap || quanTrong || linhVuc || duAn) type = 'viec';
    else type = 'inbox';
  }

  const when = day ? (time ? `${day}T${time}` : day) : '';
  let data;
  if (type === 'viec') {
    data = { ten: t, han: when, gap, quan_trong: quanTrong };
    if (minutes) data.thoi_luong_phut = minutes;
    if (linhVuc) data.linh_vuc_id = linhVuc.id;
    if (duAn) data.du_an_id = duAn.id;
  } else if (type === 'su_kien') {
    const start = when || now;
    data = { ten: t, bat_dau: start, dia_diem: diaDiem };
    if (time) {
      const [hh, mm] = time.split(':').map(Number);
      const endMin = hh * 60 + mm + (minutes || 60);
      if (endMin < 24 * 60) data.ket_thuc = `${day}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
    }
    if (linhVuc) data.linh_vuc_id = linhVuc.id;
    if (duAn) data.du_an_id = duAn.id;
  } else if (type === 'ghi_chu') {
    const lines = input.trim().replace(TYPE_PREFIX[2][0], '');
    const firstBreak = t.indexOf('. ');
    data = { tieu_de: firstBreak > 0 && firstBreak < 80 ? t.slice(0, firstBreak) : t.slice(0, 80), noi_dung: t };
    if (linhVuc) data.linh_vuc_id = linhVuc.id;
    void lines;
  } else {
    data = { noi_dung: input.trim() };
  }

  if (when) chips.push({ k: 'when', v: when });
  if (minutes) chips.push({ k: 'minutes', v: minutes });
  if (gap) chips.push({ k: 'gap' });
  if (quanTrong) chips.push({ k: 'qt' });
  if (linhVuc) chips.push({ k: 'area', v: linhVuc.ten });
  if (duAn) chips.push({ k: 'project', v: duAn.ten });
  if (diaDiem) chips.push({ k: 'place', v: diaDiem });
  return { type, data, chips, title: t };
}

/** Làm gọn tiêu đề lấy từ tin nhắn: bỏ lời chào/mời ở đầu, từ nối còn sót sau khi đã tách ngày giờ. */
export function cleanTitle(s) {
  let t = String(s || '').trim();
  t = t.replace(/^(?:thông báo|tb|nhắc nhở|nhắc|lưu ý|v\/v|về việc)\s*[:\-–]\s*/i, '');
  t = t.replace(/^(?:trân trọng\s+)?(?:kính\s+|xin\s+)?(?:mời|gửi|thân gửi|chào)\s+(?:các\s+)?(?:anh chị em|anh chị|anh|chị|em|ông|bà|bạn|cô|chú|đồng chí|cả nhà|mọi người|cả phòng|thầy|cô giáo)(?:\s+[A-ZĐÀ-Ỹ][\p{L}]*)?\s*[,.:!]?\s*/iu, '');
  t = t.replace(/^(?:tham\s+)?dự\s+/i, '');
  t = t.replace(/\s+(?:vào lúc|lúc|vào|ngày|trong|từ|tới|đến|hồi)(?=\s*(?:[,.;:!]|$))/gi, '');
  t = t.replace(/\s*([,;.])(?:\s*[,;.])+/g, '$1').replace(/[\s,;:.\-–]+$/, '').replace(/^[\s,;:.\-–]+/, '').replace(/\s{2,}/g, ' ');
  return t.trim();
}
