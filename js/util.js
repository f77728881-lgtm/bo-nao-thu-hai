// Tiện ích chung: ngày giờ Việt Nam, tìm kiếm không dấu, HTML an toàn.

export const pad = (n) => (n < 10 ? '0' : '') + n;

/** Ngày giờ hiện tại theo giờ Việt Nam (UTC+7). */
export function vnNow(date = new Date()) {
  const d = new Date(date.getTime() + 7 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}

export function today() {
  const p = vnNow();
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }

export const dayOf = (s) => (s ? String(s).slice(0, 10) : '');
export const timeOf = (s) => (s && s.length > 10 ? s.slice(11, 16) : '');

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const weekdayName = (ymd, long = false) => (long ? WD_LONG : WD)[weekday(ymd)];

export function diffDays(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
}

/** "Hôm nay 09:00", "Mai", "T6 28/11", "Quá 2 ngày" … */
export function whenLabel(when, { overdue = true } = {}) {
  if (!when) return '';
  const day = dayOf(when);
  const t = timeOf(when);
  const n = diffDays(today(), day);
  let label;
  if (n === 0) label = 'Hôm nay';
  else if (n === 1) label = 'Mai';
  else if (n === -1) label = 'Hôm qua';
  else if (n > 1 && n < 7) label = `${weekdayName(day)} ${fmtDate(day)}`;
  else label = fmtDate(day, n < -300 || n > 300);
  if (overdue && n < 0) label = `Quá ${-n} ngày · ${fmtDate(day)}`;
  return t ? `${label} ${t}` : label;
}

export function fmtDate(ymd, withYear = false) {
  if (!ymd) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** Bỏ dấu tiếng Việt, chữ thường: dùng cho tìm kiếm. */
export function fold(s) {
  if (s === null || s === undefined) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Thẻ HTML từ chuỗi mẫu, tự thoát giá trị (dùng raw() để chèn HTML tin cậy). */
export function html(strings, ...vals) {
  const isRaw = (x) => x !== null && typeof x === 'object' && '__raw' in x;
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (isRaw(v)) out += v.__raw;
      else if (Array.isArray(v)) out += v.map((x) => (isRaw(x) ? x.__raw : esc(x))).join('');
      else out += esc(v);
    }
  });
  return { __raw: out };
}
export const raw = (s) => ({ __raw: s });

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Giải mã phần thân JWT (không kiểm chữ ký: máy chủ kiểm). */
export function jwtPayload(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch { return null; }
}
