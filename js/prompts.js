// Kho prompt: ghi chú gắn nhãn #Prompt, có chỗ trống {{tên biến}} hoặc {{tên biến|giá trị mặc định}}.
// Khi dùng: điền từng chỗ trống → xem trước → sao chép hoặc mở thẳng ChatGPT/Claude.
import * as store from './store.js';
import { html, raw } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';

export const PROMPT_LABEL = '#Prompt';
const VAR_RE = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;
const LAST = 'bnth.promptVals';

export const isPrompt = (n) => (n.nhan || []).includes(PROMPT_LABEL);

export function promptVars(text) {
  const seen = new Map();
  String(text || '').replace(VAR_RE, (_, name, def) => { if (!seen.has(name)) seen.set(name, def || ''); return _; });
  return [...seen.entries()].map(([name, def]) => ({ name, def }));
}

export function fillPrompt(text, vals) {
  return String(text || '').replace(VAR_RE, (_, name, def) => (vals[name] !== undefined && vals[name] !== '' ? vals[name] : (def || `[${name}]`)));
}

function lastVals(id) {
  try { return (JSON.parse(localStorage.getItem(LAST) || '{}'))[id] || {}; } catch { return {}; }
}
function saveVals(id, vals) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { all = {}; }
  all[id] = vals;
  localStorage.setItem(LAST, JSON.stringify(all));
}

/** Phần hiển thị riêng của thẻ prompt (biến + nút Dùng). */
export function promptCardExtra(n) {
  const vars = promptVars(n.noi_dung);
  return html`<div class="p-vars">${vars.map((v) => html`<span class="p-var">${v.name}</span>`)}</div>
    <button class="p-use" data-prompt-use="${n.id}">${icon('spark')} Dùng</button>`;
}

/** Bảng điền biến và sao chép prompt hoàn chỉnh. */
export function usePrompt(id, copyText) {
  const n = store.get('ghi_chu', id);
  if (!n) return;
  const vars = promptVars(n.noi_dung);
  const prev = lastVals(id);
  const vals = Object.fromEntries(vars.map((v) => [v.name, prev[v.name] ?? '']));

  const box = document.createElement('div');
  box.className = 'prompt-use';
  box.innerHTML = html`
    ${vars.length ? vars.map((v) => html`<div class="field"><label>${v.name}</label><textarea rows="${/noi dung|văn bản|đoạn|dán/i.test(v.name) ? 5 : 2}" data-var="${v.name}" placeholder="${v.def || 'Điền ' + v.name}">${vals[v.name]}</textarea></div>`)
      : html`<p class="hint">Prompt này không có chỗ trống {{…}}. Bạn có thể sao chép dùng luôn.</p>`}
    <h4>Xem trước</h4>
    <pre class="p-preview"></pre>
    <div class="ai-row">
      <button class="btn btn-primary" data-act="copy">${icon('copy')} Sao chép</button>
      <button class="btn btn-ghost" data-act="chatgpt">Mở ChatGPT</button>
      <button class="btn btn-ghost" data-act="claude">Mở Claude</button>
      <button class="btn btn-ghost" data-act="gemini">Mở Gemini</button>
    </div>
    <p class="hint">ChatGPT và Claude nhận sẵn nội dung; với Gemini, app sao chép trước, bạn chỉ cần dán.</p>`.__raw;
  const sheet = openSheet(box, { title: n.tieu_de || 'Dùng prompt' });
  const pre = box.querySelector('.p-preview');
  const final = () => fillPrompt(n.noi_dung, vals);
  const update = () => { pre.textContent = final(); };
  box.querySelectorAll('[data-var]').forEach((t) => t.addEventListener('input', () => { vals[t.dataset.var] = t.value; update(); }));
  update();
  box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const text = final();
    saveVals(id, vals);
    const ok = await copyText(text);
    const enc = encodeURIComponent(text);
    if (b.dataset.act === 'chatgpt') window.open(`https://chatgpt.com/?q=${enc}`, '_blank', 'noopener');
    else if (b.dataset.act === 'claude') window.open(`https://claude.ai/new?q=${enc}`, '_blank', 'noopener');
    else if (b.dataset.act === 'gemini') window.open('https://gemini.google.com/app', '_blank', 'noopener');
    toast(ok ? 'Đã sao chép prompt' : 'Không sao chép được, hãy chọn và sao chép thủ công');
    if (b.dataset.act === 'copy') sheet.close();
  }));
  setTimeout(() => box.querySelector('[data-var]')?.focus(), 150);
}

// ---------------- Bộ prompt mẫu ----------------
export const STARTER = [
  ['Soạn công văn đôn đốc đơn vị', 'Viết văn bản',
    'Bạn là chuyên viên Phòng Tổ chức và Nhân sự của một công ty điện lực.\nSoạn công văn gửi {{đơn vị nhận|các đơn vị trực thuộc}} đôn đốc {{nội dung cần thực hiện}}.\nCăn cứ: {{văn bản căn cứ}}.\nHạn hoàn thành: {{hạn}}.\nYêu cầu: văn phong hành chính, ngắn gọn, đúng thể thức Nghị định 30/2020/NĐ-CP; có phần trích yếu, căn cứ, nội dung đôn đốc, đầu mối liên hệ {{người liên hệ}}.'],
  ['Tóm tắt văn bản và việc phải làm', 'Văn bản',
    'Đọc văn bản dưới đây và trả lời bằng tiếng Việt:\n1. Tóm tắt 5 ý chính.\n2. Liệt kê việc phải làm, ai làm, hạn chót (dạng bảng).\n3. Những điểm cần lưu ý hoặc rủi ro.\n\nVăn bản:\n{{dán nội dung văn bản}}'],
  ['Lập kế hoạch triển khai', 'Kế hoạch',
    'Lập kế hoạch {{tên kế hoạch}} cho {{đối tượng|toàn công ty}} trong thời gian {{thời gian}}.\nCấu trúc: I. Mục đích, yêu cầu; II. Nội dung; III. Phân công nhiệm vụ (bảng: nội dung, chủ trì, phối hợp, thời hạn); IV. Tiến độ; V. Kinh phí dự kiến; VI. Tổ chức thực hiện.\nVăn phong hành chính, cụ thể, đo lường được.'],
  ['Câu hỏi phỏng vấn tuyển dụng', 'Tuyển dụng',
    'Soạn {{số câu|10}} câu hỏi phỏng vấn cho vị trí {{vị trí tuyển dụng}}.\nTập trung đánh giá: {{năng lực cần đánh giá|chuyên môn, giao tiếp, xử lý tình huống}}.\nVới mỗi câu: mục đích câu hỏi, câu trả lời tốt trông như thế nào, thang điểm 1–5.'],
  ['Học tiếng Trung theo chủ đề', 'Học tiếng Trung',
    'Bạn là giáo viên tiếng Trung kiên nhẫn. Dạy tôi chủ đề "{{chủ đề|chào hỏi nơi công sở}}" ở trình độ {{trình độ|HSK 1}}:\n- 10 từ vựng: Hán tự, pinyin, nghĩa tiếng Việt, 1 câu ví dụ.\n- 1 đoạn hội thoại ngắn 6–8 câu có pinyin và dịch.\n- 3 câu bài tập dịch Việt → Trung, đáp án để cuối.'],
  ['Viết lại cho rõ ràng, chuyên nghiệp', 'Viết văn bản',
    'Viết lại đoạn sau cho rõ ràng, mạch lạc, giữ nguyên ý, giọng {{giọng văn|trang trọng, lịch sự}}. Độ dài khoảng {{độ dài|như bản gốc}}.\n\n{{đoạn văn cần sửa}}'],
  ['Trả lời tin nhắn khó', 'Giao tiếp',
    'Giúp tôi trả lời tin nhắn sau từ {{người gửi|đồng nghiệp}}. Mục tiêu của tôi: {{mục tiêu}}. Giữ thái độ {{thái độ|lịch sự, rõ ràng, không gay gắt}}. Đưa 2 phương án trả lời ngắn.\n\nTin nhắn:\n{{nội dung tin nhắn}}']
];

export async function addStarterPrompts() {
  const have = new Set(store.all('ghi_chu').filter(isPrompt).map((n) => n.tieu_de));
  let added = 0;
  for (const [title, cat, body] of STARTER) {
    if (have.has(title)) continue;
    try { await store.create('ghi_chu', { tieu_de: title, noi_dung: body, nhan: [PROMPT_LABEL, cat], loai: 'Kiến thức' }); added++; } catch (err) { errorToast(err); break; }
  }
  toast(added ? `Đã thêm ${added} prompt mẫu` : 'Bộ mẫu đã có đủ');
}

export { raw };
