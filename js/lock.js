// Khóa riêng tư cho Tài chính và Nhân sự: mã PIN (bắt buộc) + Face ID/Touch ID (tùy chọn, WebAuthn).
// Đây là khóa màn hình trên máy này: chặn người cầm máy mở xem; dữ liệu vẫn lưu như cũ.
// Mở khóa giữ 5 phút; app chạy nền quá 1 phút thì khóa lại.
import { html, raw } from './util.js';
import { openSheet, toast } from './ui.js';

const KEY = 'bnth.khoa';
const GIU_MS = 5 * 60e3, NEN_MS = 60e3;
let moLuc = 0, anLuc = 0;

const cfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const luu = (c) => localStorage.setItem(KEY, JSON.stringify(c));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function bam(pin, salt) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + pin));
  return b64(d);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) anLuc = Date.now();
  else if (anLuc && Date.now() - anLuc > NEN_MS) moLuc = 0;
});

export const lockOn = () => !!cfg().pin;
export const hasFaceId = () => !!cfg().cred;
export const isLocked = () => lockOn() && Date.now() - moLuc > GIU_MS;
export const khoaNgay = () => { moLuc = 0; };
export const faceIdSupported = () => !!window.PublicKeyCredential && !!navigator.credentials;

/** Mở khóa: thử Face ID trước (nếu đã bật), không được thì hỏi PIN. */
export async function unlock() {
  if (!isLocked()) return true;
  const c = cfg();
  if (c.cred && faceIdSupported()) {
    try {
      await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(c.cred) }], userVerification: 'required', timeout: 60000 } });
      moLuc = Date.now(); return true;
    } catch { /* hủy hoặc không nhận: chuyển sang PIN */ }
  }
  return askPin();
}

function askPin() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.innerHTML = html`<div class="field"><label>Mã PIN</label><input data-pin type="password" inputmode="numeric" autocomplete="off" maxlength="8" class="pin-in"></div>
      <p class="hint" data-pin-msg></p>
      <div class="form-actions"><span class="spacer"></span><button class="btn btn-primary" data-pin-ok>Mở khóa</button></div>`.__raw;
    let done = false;
    const sh = openSheet(box, { title: '🔒 Nhập mã PIN', onClose: () => { if (!done) resolve(false); } });
    const inp = box.querySelector('[data-pin]');
    const thu = async () => {
      const c = cfg();
      if (await bam(inp.value.trim(), c.salt) === c.pin) { moLuc = Date.now(); done = true; sh.close(); resolve(true); }
      else { box.querySelector('[data-pin-msg]').textContent = 'Sai mã PIN.'; inp.value = ''; inp.focus(); }
    };
    box.querySelector('[data-pin-ok]').onclick = thu;
    inp.onkeydown = (e) => { if (e.key === 'Enter') thu(); };
    setTimeout(() => inp.focus(), 150);
  });
}

/** Đặt hoặc đổi PIN (đổi thì phải nhập PIN cũ). */
export function setupPin(done) {
  const c0 = cfg();
  const box = document.createElement('div');
  box.innerHTML = html`${c0.pin ? html`<div class="field"><label>PIN hiện tại</label><input data-old type="password" inputmode="numeric" maxlength="8" class="pin-in"></div>` : ''}
    <div class="field"><label>PIN mới (4–8 số)</label><input data-new type="password" inputmode="numeric" maxlength="8" class="pin-in"></div>
    <div class="field"><label>Nhập lại PIN mới</label><input data-new2 type="password" inputmode="numeric" maxlength="8" class="pin-in"></div>
    <p class="hint">PIN chỉ lưu trên máy này (dạng băm). Quên PIN: xóa dữ liệu trang web của app trên máy rồi đăng nhập lại.</p>
    <div class="form-actions"><span class="spacer"></span><button class="btn btn-primary" data-ok>Lưu</button></div>`.__raw;
  const sh = openSheet(box, { title: c0.pin ? 'Đổi mã PIN' : 'Đặt mã PIN' });
  box.querySelector('[data-ok]').onclick = async () => {
    const v = (k) => box.querySelector(`[data-${k}]`)?.value.trim() || '';
    if (c0.pin && (await bam(v('old'), c0.salt)) !== c0.pin) return toast('PIN hiện tại không đúng');
    if (!/^\d{4,8}$/.test(v('new'))) return toast('PIN gồm 4–8 chữ số');
    if (v('new') !== v('new2')) return toast('Hai lần nhập PIN chưa khớp');
    const salt = b64(rand(16));
    luu({ ...c0, salt, pin: await bam(v('new'), salt) });
    moLuc = Date.now(); sh.close(); toast('Đã đặt mã PIN', { kind: 'ok' }); done?.();
  };
}

/** Bật Face ID / Touch ID trên máy này (cần đã có PIN). */
export async function setupFaceId() {
  if (!faceIdSupported()) { toast('Máy/trình duyệt này không hỗ trợ Face ID cho trang web'); return false; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'Bộ não thứ hai' }, challenge: rand(32),
      user: { id: rand(16), name: 'bnth-khoa', displayName: 'Khóa Bộ não thứ hai' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none' } });
    luu({ ...cfg(), cred: b64(cred.rawId) });
    toast('Đã bật Face ID', { kind: 'ok' }); return true;
  } catch { toast('Chưa bật được Face ID (đã hủy hoặc máy không cho phép)'); return false; }
}

/** Tắt khóa (phải nhập đúng PIN). */
export async function tatKhoa(done) {
  moLuc = 0;
  if (await askPin()) { localStorage.removeItem(KEY); toast('Đã tắt khóa'); done?.(); }
}
export const tatFaceId = (done) => { const c = cfg(); delete c.cred; luu(c); toast('Đã tắt Face ID'); done?.(); };

/** Màn che khi đang khóa. */
export function lockView(ten) {
  return html`<div class="lock-screen"><div class="lock-ic">🔒</div><h2>${ten} đang khóa</h2>
    <p class="hint">Mở bằng ${hasFaceId() ? 'Face ID hoặc mã PIN' : 'mã PIN'}. Tự khóa lại sau 5 phút hoặc khi rời app.</p>
    <button class="btn btn-primary" data-unlock>${hasFaceId() ? 'Mở bằng Face ID' : 'Nhập mã PIN'}</button></div>`;
}
export function bindLock(root, rerender) {
  root.querySelector('[data-unlock]')?.addEventListener('click', async () => { if (await unlock()) rerender(); });
}
export const lockedLine = (ten) => raw(`<p class="hint">🔒 ${ten} đang khóa · <a href="#/${ten === 'Tài chính' ? 'tai-chinh' : 'nhan-su'}">mở khóa</a></p>`);
