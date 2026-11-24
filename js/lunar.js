// Âm lịch Việt Nam (múi giờ +7) theo thuật toán của Hồ Ngọc Đức, kèm can chi, tiết khí,
// ngày/giờ hoàng đạo, 12 trực và việc nên/tránh (theo lịch vạn niên truyền thống: chỉ để tham khảo).
// Tính hoàn toàn trên máy, không cần mạng.

const PI = Math.PI;
const TZ = 7;
const INT = Math.floor;

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
export const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const TIET_KHI = ['Xuân phân', 'Thanh minh', 'Cốc vũ', 'Lập hạ', 'Tiểu mãn', 'Mang chủng', 'Hạ chí', 'Tiểu thử', 'Đại thử', 'Lập thu', 'Xử thử', 'Bạch lộ',
  'Thu phân', 'Hàn lộ', 'Sương giáng', 'Lập đông', 'Tiểu tuyết', 'Đại tuyết', 'Đông chí', 'Tiểu hàn', 'Đại hàn', 'Lập xuân', 'Vũ thủy', 'Kinh trập'];

// 12 vị thần trực ngày/giờ: true = hoàng đạo (tốt)
const THAN = [['Thanh Long', true], ['Minh Đường', true], ['Thiên Hình', false], ['Chu Tước', false], ['Kim Quỹ', true], ['Bảo Quang', true],
  ['Bạch Hổ', false], ['Ngọc Đường', true], ['Thiên Lao', false], ['Huyền Vũ', false], ['Tư Mệnh', true], ['Câu Trận', false]];

const TRUC = [
  ['Kiến', 'Xuất hành, khai trương, nhậm chức, gặp đối tác', 'Động thổ, đào giếng, an táng'],
  ['Trừ', 'Chữa bệnh, dọn dẹp, cúng giải hạn, bỏ thói quen xấu', 'Cưới hỏi, khai trương, đi xa'],
  ['Mãn', 'Cầu tài, cúng tế, nhập kho, mua sắm', 'Nhậm chức, kiện tụng, uống thuốc'],
  ['Bình', 'Sửa nhà, làm đường, việc thường ngày, hòa giải', 'Khởi công việc lớn, đào đất'],
  ['Định', 'Ký kết, giao dịch, cưới hỏi, nhập học, nhận việc', 'Kiện tụng, xuất hành xa, chữa bệnh'],
  ['Chấp', 'Lập khế ước, tuyển người, xây dựng, trồng cây', 'Xuất hành, chuyển nhà, mở kho'],
  ['Phá', 'Phá dỡ nhà cũ, chữa bệnh, dọn dẹp', 'Cưới hỏi, khai trương, ký kết, việc lớn'],
  ['Nguy', 'Cúng bái, làm việc thiện', 'Leo cao, đi sông nước, việc mạo hiểm, khởi công'],
  ['Thành', 'Khai trương, cưới hỏi, nhập học, xây nhà, nhậm chức', 'Kiện tụng, tranh chấp'],
  ['Thu', 'Thu nợ, thu hoạch, nhập kho, mua đồ', 'Xuất hành, an táng, khai trương'],
  ['Khai', 'Khai trương, cưới hỏi, xuất hành, động thổ, nhập học', 'An táng, đào đất làm mộ'],
  ['Bế', 'Đắp đê, lấp hố, xây tường, tu bổ', 'Khai trương, xuất hành, chữa mắt, việc mới']
];

const LE_AM = {
  '1/1': 'Tết Nguyên đán', '2/1': 'Mùng 2 Tết', '3/1': 'Mùng 3 Tết', '15/1': 'Rằm tháng Giêng', '3/3': 'Tết Hàn thực',
  '10/3': 'Giỗ Tổ Hùng Vương', '15/4': 'Lễ Phật đản', '5/5': 'Tết Đoan ngọ', '15/7': 'Vu Lan', '15/8': 'Tết Trung thu',
  '9/9': 'Tết Trùng cửu', '10/10': 'Tết Thường tân', '23/12': 'Ông Công ông Táo'
};

// ---------------- Thuật toán Hồ Ngọc Đức ----------------
export function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

function newMoon(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) - 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
}

/** Kinh độ mặt trời (radian) tại ngày Julius jdn. */
function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return L;
}
const sunSector = (dayNumber) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6);
const newMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);

function lunarMonth11(yy) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = newMoonDay(k);
  if (sunSector(nm) >= 9) nm = newMoonDay(k - 1);
  return nm;
}

function leapMonthOffset(a11) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last, i = 1, arc = sunSector(newMoonDay(k + i));
  do { last = arc; i++; arc = sunSector(newMoonDay(k + i)); } while (arc !== last && i < 14);
  return i - 1;
}

/** Dương lịch → âm lịch. Trả về { day, month, year, leap, jd }. */
export function toLunar(dd, mm, yy) {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(yy), b11 = a11, lunarYear;
  if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1); }
  else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1); }
  const day = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false, month = diff + 11;
  if (b11 - a11 > 365) {
    const lmd = leapMonthOffset(a11);
    if (diff >= lmd) { month = diff + 10; if (diff === lmd) leap = true; }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) lunarYear -= 1;
  return { day, month, year: lunarYear, leap, jd: dayNumber };
}

// ---------------- Thông tin ngày ----------------
const canChiYear = (y) => `${CAN[(y + 6) % 10]} ${CHI[(y + 8) % 12]}`;
const canChiMonth = (m, y) => `${CAN[(y * 12 + m + 3) % 10]} ${CHI[(m + 1) % 12]}`;

const HOUR_RANGE = ['23–1', '1–3', '3–5', '5–7', '7–9', '9–11', '11–13', '13–15', '15–17', '17–19', '19–21', '21–23'];

/** Mọi thông tin âm lịch của một ngày "YYYY-MM-DD". */
export function lunarInfo(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const L = toLunar(d, m, y);
  const jd = L.jd;
  const dayCan = (jd + 9) % 10, dayChi = (jd + 1) % 12;

  // Ngày hoàng đạo: Thanh Long khởi theo tháng âm (Giêng/Bảy: Tý, Hai/Tám: Dần, …)
  const startDay = ((L.month - 1) % 6) * 2;
  const godDay = THAN[(dayChi - startDay + 12) % 12];

  // Giờ hoàng đạo: Thanh Long khởi theo chi ngày (Tý/Ngọ: Thân, Sửu/Mùi: Tuất, Dần/Thân: Tý, …)
  const startHour = (8 + (dayChi % 6) * 2) % 12;
  const hours = CHI.map((c, i) => {
    const g = THAN[(i - startHour + 12) % 12];
    return { chi: c, range: HOUR_RANGE[i], than: g[0], good: g[1] };
  });

  // Tiết khí và tháng tiết khí (để tính trực): kinh độ mặt trời cuối ngày (24h giờ VN),
  // để ngày giao tiết mang tên tiết mới như lịch Việt Nam.
  const sunDeg = (sunLongitude(jd + 0.5 - TZ / 24) * 180) / PI;
  const tietKhi = TIET_KHI[INT(sunDeg / 15) % 24];
  const solarMonthChi = (2 + INT((((sunDeg - 315) % 360) + 360) % 360 / 30)) % 12;
  const truc = TRUC[(dayChi - solarMonthChi + 12) % 12];

  const key = `${L.day}/${L.month}`;
  let le = L.leap ? '' : LE_AM[key] || '';
  // Giao thừa: ngày cuối tháng Chạp
  if (!le && L.month === 12 && !L.leap) {
    const next = toLunar(...nextDay(y, m, d));
    if (next.day === 1) le = 'Giao thừa';
  }

  return {
    ymd, day: L.day, month: L.month, year: L.year, leap: L.leap,
    label: `${L.day}/${L.month}${L.leap ? ' nhuận' : ''}`,
    canChiDay: `${CAN[dayCan]} ${CHI[dayChi]}`,
    canChiMonth: canChiMonth(L.month, L.year) + (L.leap ? ' (nhuận)' : ''),
    canChiYear: canChiYear(L.year),
    hoangDao: godDay[1], than: godDay[0],
    hours, goodHours: hours.filter((h) => h.good), badHours: hours.filter((h) => !h.good),
    tietKhi, truc: truc[0], nen: truc[1], tranh: truc[2],
    le, special: L.day === 1 || L.day === 15 || !!le
  };
}

function nextDay(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return [t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear()];
}

/** Giờ hiện tại có phải giờ hoàng đạo không (theo bảng của ngày). */
export function hourChiIndex(h) { return INT(((h + 1) % 24) / 2); }
