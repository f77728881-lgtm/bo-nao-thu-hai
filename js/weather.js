// Thời tiết cho thẻ đầu màn Hôm nay (Open-Meteo: miễn phí, không cần khóa). Mặc định Việt Trì; có thể dùng vị trí hiện tại.
// Gợi ý trang phục theo nhiệt độ/UV và nhắc mang ô khi khả năng mưa giờ đi làm (6–18h) từ 70%.
const LOC_KEY = 'bnth.weather.loc';
const CACHE_KEY = 'bnth.weather.cache';
const DEFAULT_LOC = { lat: 21.3227, lon: 105.4019, ten: 'Việt Trì' };
const TTL = 60 * 60e3;

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const location = () => read(LOC_KEY, DEFAULT_LOC);

let data = read(CACHE_KEY, null);
let loading = false;

const CODES = [
  [0, '☀️', 'Trời quang'], [1, '🌤', 'Ít mây'], [2, '⛅', 'Có mây'], [3, '☁️', 'Nhiều mây'],
  [45, '🌫', 'Sương mù'], [48, '🌫', 'Sương mù'], [51, '🌦', 'Mưa phùn'], [53, '🌦', 'Mưa phùn'], [55, '🌦', 'Mưa phùn'],
  [61, '🌧', 'Mưa nhỏ'], [63, '🌧', 'Mưa vừa'], [65, '🌧', 'Mưa to'], [80, '🌦', 'Mưa rào'], [81, '🌧', 'Mưa rào'], [82, '⛈', 'Mưa rào mạnh'],
  [95, '⛈', 'Dông'], [96, '⛈', 'Dông, mưa đá'], [99, '⛈', 'Dông, mưa đá']
];
const look = (code) => CODES.filter((c) => c[0] <= code).pop() || CODES[0];

async function load(force = false) {
  const loc = location();
  if (loading) return;
  if (!force && data && data.lat === loc.lat && data.lon === loc.lon && Date.now() - data.at < TTL) return;
  loading = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      '&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max' +
      '&timezone=Asia%2FBangkok&forecast_days=2';
    const r = await fetch(url);
    const j = await r.json();
    data = { at: Date.now(), lat: loc.lat, lon: loc.lon, ten: loc.ten, hourly: j.hourly, daily: j.daily };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    emit();
  } catch { /* mất mạng: giữ bản cũ */ } finally { loading = false; }
}

export function useCurrentPosition() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((p) => {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), ten: 'Vị trí hiện tại' }));
    load(true);
  }, () => {}, { timeout: 10000, maximumAge: 30 * 60e3 });
}
export function useDefault() { localStorage.removeItem(LOC_KEY); load(true); }

function clothes(tmin, tmax, uv) {
  const out = [];
  if (tmin <= 12) out.push('Áo ấm dày, khăn quàng');
  else if (tmin <= 18) out.push('Áo khoác');
  else if (tmax <= 26) out.push('Áo dài tay mỏng');
  else if (tmax <= 31) out.push('Áo sơ mi / áo thun thoáng');
  else out.push('Đồ mỏng nhẹ, mang mũ, uống đủ nước');
  if (tmax - tmin >= 8 && tmin > 12) out.push('sáng tối mang thêm áo khoác mỏng');
  if (uv >= 8) out.push('kem chống nắng');
  return out.join(', ');
}

/** Theo giờ cho ngày (0 hôm nay, 1 ngày mai): [{h, temp, rain, icon}] từ 6h đến 22h. */
export function hourly(dayIndex = 0) {
  if (!data || !data.daily) return [];
  const ymd = data.daily.time[dayIndex];
  return data.hourly.time.map((t, i) => ({ t, h: +t.slice(11, 13), temp: Math.round(data.hourly.temperature_2m[i]), rain: data.hourly.precipitation_probability[i] ?? 0, icon: look(data.hourly.weather_code[i])[1] }))
    .filter((x) => x.t.slice(0, 10) === ymd && x.h >= 6 && x.h <= 22);
}

/** Tóm tắt cho ngày (0 = hôm nay, 1 = ngày mai). null nếu chưa có dữ liệu. */
export function summary(dayIndex = 0) {
  load();
  if (!data || !data.daily) return null;
  const d = data.daily;
  const ymd = d.time[dayIndex];
  if (!ymd) return null;
  const hrs = data.hourly.time.map((t, i) => ({ t, temp: data.hourly.temperature_2m[i], rain: data.hourly.precipitation_probability[i], code: data.hourly.weather_code[i] }))
    .filter((h) => h.t.slice(0, 10) === ymd);
  const work = hrs.filter((h) => +h.t.slice(11, 13) >= 6 && +h.t.slice(11, 13) <= 18);
  const rainWork = Math.max(0, ...work.map((h) => h.rain ?? 0));
  const rainAm = Math.max(0, ...work.filter((h) => +h.t.slice(11, 13) < 12).map((h) => h.rain ?? 0));
  const rainPm = Math.max(0, ...work.filter((h) => +h.t.slice(11, 13) >= 12).map((h) => h.rain ?? 0));
  const nowH = new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 13);
  const cur = dayIndex === 0 ? hrs.find((h) => h.t.slice(11, 13) === nowH) : null;
  const tmin = Math.round(d.temperature_2m_min[dayIndex]), tmax = Math.round(d.temperature_2m_max[dayIndex]);
  const [, ic, txt] = look(cur ? cur.code : d.weather_code[dayIndex]);
  return {
    ten: data.ten, ymd, icon: ic, text: txt, now: cur ? Math.round(cur.temp) : null, tmin, tmax,
    rainWork, rainAm, rainPm, umbrella: rainWork >= 70, maybeRain: rainWork >= 40 && rainWork < 70,
    clothes: clothes(tmin, tmax, d.uv_index_max[dayIndex] || 0), stale: Date.now() - data.at > 3 * TTL
  };
}
