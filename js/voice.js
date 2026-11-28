// Nói thay gõ: nút 🎙 cạnh ô Tìm và ô Nhập nhanh (Web Speech API, tiếng Việt).
// Máy/trình duyệt không hỗ trợ thì không hiện nút; vẫn dùng được nút micro trên bàn phím iPhone.
import { toast } from './ui.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => !!SR;
let rec = null, btnOn = null;

/** Nút micro cho ô có id cho sẵn (chuỗi HTML). */
export const micButton = (forId) => (SR ? `<button type="button" class="mic-btn" data-mic="${forId}" aria-label="Nói để nhập" title="Nói để nhập">🎙</button>` : '');

function stop() { try { rec?.stop(); } catch { /* đã dừng */ } }

function start(btn) {
  const input = document.getElementById(btn.dataset.mic);
  if (!input) return;
  if (rec) { stop(); return; } // bấm lần nữa = dừng
  rec = new SR();
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;
  const base = input.value && !/\s$/.test(input.value) ? input.value + ' ' : input.value;
  btnOn = btn; btn.classList.add('on');
  rec.onresult = (e) => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    input.value = base + txt.trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Chưa cho phép dùng micro: vào Cài đặt iPhone → Safari/ứng dụng → Micro.');
    else if (e.error === 'no-speech') toast('Chưa nghe thấy gì, thử lại nhé');
    else if (e.error !== 'aborted') toast('Không nhận được giọng nói (' + e.error + ')');
  };
  rec.onend = () => { btnOn?.classList.remove('on'); btnOn = null; rec = null; input.focus(); };
  try { rec.start(); } catch { rec = null; btn.classList.remove('on'); }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-mic]');
  if (!b) return;
  e.preventDefault();
  start(b);
});
// Đóng bảng / chuyển trang thì dừng nghe.
window.addEventListener('hashchange', stop);
