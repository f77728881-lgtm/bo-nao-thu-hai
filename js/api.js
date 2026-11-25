// Gọi máy chủ Apps Script. Chế độ demo (?demo) chạy chính mã máy chủ trên Google mô phỏng ngay trong trình duyệt.
import { CONFIG } from './config.js';
import { jwtPayload } from './util.js';

export const isDemo = () => new URLSearchParams(location.search).has('demo') || !CONFIG.API_URL;

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------- Đăng nhập Google ----------------
const TOKEN_KEY = 'bnth.id_token';
const SESSION_KEY = 'bnth.session';
const listeners = new Set();

/** Tên thiết bị để hiện trong danh sách "thiết bị đang đăng nhập". */
function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Máy khác';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const app = matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
  return `${os}${br ? ' · ' + br : ''}${app}`;
}

export const Auth = {
  token: null,       // mã Google (sống ~1 giờ), chỉ dùng để xin phiên
  exp: 0,
  session: null,     // phiên riêng của app, sống 90 ngày
  sessionExp: 0,
  email: '',

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (saved) this.email = saved.email || '';
      if (saved && saved.exp * 1000 > Date.now() + 60e3) Object.assign(this, { token: saved.token, exp: saved.exp });
      const ss = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (ss && Date.parse(ss.het_han) > Date.now()) { this.session = ss.session; this.sessionExp = Date.parse(ss.het_han); this.email = ss.email || this.email; }
    } catch { /* bỏ qua */ }
  },

  set(token) {
    const p = jwtPayload(token);
    if (!p) return;
    this.token = token; this.exp = p.exp; this.email = p.email;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: p.exp, email: p.email }));
    listeners.forEach((fn) => fn(true));
    if (!this.session) this.exchange();
  },

  /** Đổi mã Google (1 giờ) lấy phiên 90 ngày. */
  async exchange() {
    try {
      const r = await call('phien_tao', { thiet_bi: deviceName() });
      this.session = r.session; this.sessionExp = Date.parse(r.het_han);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ session: r.session, het_han: r.het_han, email: this.email }));
    } catch { /* lần sau thử lại */ }
  },

  clear() {
    this.token = null; this.exp = 0; this.session = null; this.sessionExp = 0;
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY);
    listeners.forEach((fn) => fn(false));
  },

  valid() {
    return isDemo() || (!!this.session && this.sessionExp > Date.now()) || (!!this.token && this.exp * 1000 > Date.now() + 60e3);
  },
  hadSession() { return !!this.email; },
  onChange(fn) { listeners.add(fn); },

  /** Nạp thư viện Google Identity Services và chuẩn bị nút đăng nhập. */
  async init() {
    if (isDemo() || !CONFIG.GOOGLE_CLIENT_ID) return;
    await loadScript('https://accounts.google.com/gsi/client');
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (r) => Auth.set(r.credential),
      auto_select: true,
      itp_support: true,
      use_fedcm_for_prompt: true
    });
  },

  renderButton(el) {
    if (typeof google === 'undefined') return;
    google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi' });
  },

  /** Xin phiên mới lặng lẽ (One Tap tự chọn) khi phiên cũ hết hạn. */
  refresh() {
    if (typeof google !== 'undefined') google.accounts.id.prompt();
  }
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('Không tải được ' + src));
    document.head.appendChild(s);
  });
}

// ---------------- Gọi API ----------------
export async function call(action, payload = {}) {
  if (isDemo()) return demoCall(action, payload);
  if (!Auth.valid()) throw new ApiError('CHUA_XAC_THUC', 'Phiên đăng nhập đã hết hạn.');
  let res, j;
  // Giới hạn thời gian: máy chủ không trả lời thì báo lỗi thay vì treo "Đang đồng bộ…" mãi.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), action === 'sync' ? 45000 : 30000);
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      // text/plain để không phát sinh yêu cầu CORS preflight (Apps Script không trả lời OPTIONS)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Auth.session && action !== 'phien_tao' ? { action, payload, session: Auth.session } : { action, payload, id_token: Auth.token }),
      redirect: 'follow',
      signal: ctrl.signal
    });
    j = await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('MAT_MANG', 'Máy chủ phản hồi quá lâu, sẽ thử lại.');
    if (e instanceof SyntaxError) throw new ApiError('LOI_MAY_CHU', 'Máy chủ trả về dữ liệu không đọc được.');
    throw new ApiError('MAT_MANG', 'Không kết nối được máy chủ.');
  } finally {
    clearTimeout(timer);
  }
  if (!j.ok) {
    if (j.error.code === 'CHUA_XAC_THUC') Auth.clear();
    throw new ApiError(j.error.code, j.error.message);
  }
  return j.data;
}

// ---------------- Chế độ demo ----------------
let demoReady = null;
const DEMO_FILES = ['../tests/mock_gas.js', '00_Config', '01_Util', '02_Db', '03_Log', '04_Auth', '05_Calendar', '06_Api', '07_Search_Today', '08_Main_Setup', '09_Seed', '10_Places', '11_Links', '12_Backup', '13_ExtCal', '14_Hoc', '15_Mcp', '16_Doffice', '18_ThongBao', '../tests/demo_seed.js']
  .map((f) => (f.endsWith('.js') ? f : `../apps-script/src/${f}.js`));

async function demoCall(action, payload) {
  if (!demoReady) demoReady = bootDemo();
  await demoReady;
  await new Promise((r) => setTimeout(r, 120)); // giả lập độ trễ mạng
  const res = JSON.parse(JSON.stringify(window.Api.handle({ action, payload, key: window.__props.CLAUDE_API_KEY })));
  if (!res.ok) throw new ApiError(res.error.code, res.error.message);
  return res.data;
}

async function bootDemo() {
  const bust = '?v=' + Date.now(); // bản demo luôn nạp mã máy chủ mới nhất
  for (const f of DEMO_FILES) await loadScript(f + bust);
  window.setup();
  window.__seedDemo();
}
