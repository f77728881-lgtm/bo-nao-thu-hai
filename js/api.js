// Gọi máy chủ Apps Script. Chế độ demo (?demo) chạy chính mã máy chủ trên Google mô phỏng ngay trong trình duyệt.
import { CONFIG } from './config.js';
import { jwtPayload } from './util.js';

export const isDemo = () => new URLSearchParams(location.search).has('demo') || !CONFIG.API_URL;

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------- Đăng nhập Google ----------------
const TOKEN_KEY = 'bnth.id_token';
const listeners = new Set();

export const Auth = {
  token: null,
  exp: 0,
  email: '',

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (saved) this.email = saved.email || '';
      if (saved && saved.exp * 1000 > Date.now() + 60e3) Object.assign(this, saved);
    } catch { /* bỏ qua */ }
  },

  set(token) {
    const p = jwtPayload(token);
    if (!p) return;
    this.token = token; this.exp = p.exp; this.email = p.email;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: p.exp, email: p.email }));
    listeners.forEach((fn) => fn(true));
  },

  clear() {
    this.token = null; this.exp = 0;
    localStorage.removeItem(TOKEN_KEY);
    listeners.forEach((fn) => fn(false));
  },

  valid() { return isDemo() || (!!this.token && this.exp * 1000 > Date.now() + 60e3); },
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
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      // text/plain để không phát sinh yêu cầu CORS preflight (Apps Script không trả lời OPTIONS)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, id_token: Auth.token }),
      redirect: 'follow'
    });
  } catch (e) {
    throw new ApiError('MAT_MANG', 'Không kết nối được máy chủ.');
  }
  let j;
  try { j = await res.json(); } catch { throw new ApiError('LOI_MAY_CHU', 'Máy chủ trả về dữ liệu không đọc được.'); }
  if (!j.ok) {
    if (j.error.code === 'CHUA_XAC_THUC') Auth.clear();
    throw new ApiError(j.error.code, j.error.message);
  }
  return j.data;
}

// ---------------- Chế độ demo ----------------
let demoReady = null;
const DEMO_FILES = ['../tests/mock_gas.js', '00_Config', '01_Util', '02_Db', '03_Log', '04_Auth', '05_Calendar', '06_Api', '07_Search_Today', '08_Main_Setup', '09_Seed', '../tests/demo_seed.js']
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
  for (const f of DEMO_FILES) await loadScript(f);
  window.setup();
  window.__seedDemo();
}
