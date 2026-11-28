// Hỏi Claude (phương án A, miễn phí): soạn sẵn câu hỏi kèm bối cảnh rồi mở ứng dụng/trang Claude.
// Claude dùng connector "Bộ não thứ hai" để đọc/ghi dữ liệu app. Câu hỏi cũng được chép vào bộ nhớ tạm (dán lại nếu cần).
import * as store from './store.js';
import { html, today } from './util.js';
import { openSheet, toast, closeSheet } from './ui.js';

const PREFIX = 'Bạn đang hỗ trợ tôi qua connector “Bộ não thứ hai” (app quản lý việc, văn bản, ghi chú, lịch của tôi — nhân sự PC Phú Thọ). '
  + 'Hãy dùng các công cụ của connector để đọc dữ liệu khi cần; trước khi tạo/sửa/lưu trữ gì thì liệt kê đề xuất và chờ tôi đồng ý.\n\n';
const MAX = 3500;
const clip = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove(); return ok;
  }
}

/** Mở Claude với câu hỏi (kèm lời dặn dùng connector). */
export async function askClaude(text) {
  const full = clip(PREFIX + text, MAX);
  await copy(full);
  window.open('https://claude.ai/new?q=' + encodeURIComponent(full), '_blank', 'noopener');
  toast('Đã mở Claude (câu hỏi cũng đã chép sẵn — nếu trống thì dán vào).', { ms: 4500 });
}

// ---------------- Gemini (tài khoản Google của anh) ----------------
// Gemini KHÔNG đọc/ghi được dữ liệu app (không có connector): dùng cho soạn thảo, dịch, kiến thức chung — để dành hạn mức Claude.
// Không có cách chính thức điền sẵn câu hỏi vào Gemini, nên app chép câu hỏi vào bộ nhớ tạm rồi mở Gemini để anh dán.
// Chỉ gửi đúng nội dung anh chọn; không bao giờ tự kèm dữ liệu nhân sự hay tài chính.
const GEM_PREFIX = 'Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng. ';
// Tài khoản Google có gói Gemini Pro (có thể khác tài khoản đang đăng nhập mặc định). Chỉ lưu trên máy này.
const GEM_KEY = 'bnth.geminiTk';
export const geminiAccount = () => localStorage.getItem(GEM_KEY) || '';
export function setGeminiAccount() {
  const v = prompt('Email tài khoản Google có Gemini Pro (chỉ lưu trên máy này, để trống = tài khoản mặc định):', geminiAccount());
  if (v === null) return false;
  const e = v.trim();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast('Email chưa đúng dạng'); return false; }
  if (e) localStorage.setItem(GEM_KEY, e); else localStorage.removeItem(GEM_KEY);
  toast(e ? 'Nút Gemini sẽ mở bằng ' + e : 'Nút Gemini mở bằng tài khoản mặc định');
  return true;
}
const geminiUrl = () => 'https://gemini.google.com/app' + (geminiAccount() ? '?authuser=' + encodeURIComponent(geminiAccount()) : '');
export async function askGemini(text) {
  const full = clip(GEM_PREFIX + text, MAX);
  const ok = await copy(full);
  window.open(geminiUrl(), '_blank', 'noopener');
  toast(ok ? 'Đã chép câu hỏi — trong Gemini, giữ ngón tay vào ô chat → Dán → Gửi.' : 'Mở Gemini rồi gõ câu hỏi (không chép được tự động).', { ms: 6000 });
}
const GEMINI = [
  ['✍️ Soạn công văn', 'Soạn giúp tôi một công văn về: [nội dung]. Văn phong hành chính EVN, có căn cứ, nội dung chính, tổ chức thực hiện, nơi nhận. Hỏi tôi thông tin còn thiếu trước khi viết.'],
  ['🪄 Viết lại cho gọn, rõ', 'Viết lại đoạn sau cho gọn, rõ, đúng văn phong hành chính, giữ nguyên ý: [dán đoạn văn]'],
  ['🌐 Dịch Anh ↔ Việt', 'Dịch đoạn sau sang [tiếng Việt/tiếng Anh], giữ thuật ngữ chuyên ngành điện và nhân sự: [dán đoạn văn]'],
  ['⚖️ Hỏi quy định lao động', 'Theo Bộ luật Lao động Việt Nam hiện hành, [câu hỏi]. Nêu điều khoản căn cứ và lưu ý thực tế khi áp dụng.'],
  ['💡 Lên ý tưởng', 'Gợi ý 10 ý tưởng cho: [chủ đề], chia nhóm, mỗi ý một dòng.']
];

// ---------------- Câu hỏi theo màn ----------------
const ROUTE_PROMPTS = {
  'hom-nay': [
    ['☀️ Sắp xếp ngày hôm nay', 'Tóm tắt ngày hôm nay của tôi (lịch, việc, văn bản sắp hạn, thói quen, ưu tiên) rồi đề xuất thứ tự làm theo khung giờ, việc khó làm buổi sáng.'],
    ['⏰ Xử lý việc quá hạn', 'Xem các việc quá hạn: đề xuất việc nào làm ngay, việc nào dời sang ngày nào, việc nào bỏ (lưu trữ). Chờ tôi đồng ý rồi mới cập nhật.'],
    ['🌙 Khép lại ngày cùng tôi', 'Giúp tôi khép lại ngày: hỏi lần lượt cảm xúc, việc đã xong, việc dở dang, điều biết ơn, 3 ưu tiên ngày mai; sau đó lưu vào nhật ký ngày.']
  ],
  viec: [
    ['🧹 Dọn danh sách việc', 'Rà soát các việc đang mở: chỉ ra việc trùng, việc mơ hồ (viết lại tên bắt đầu bằng động từ cụ thể), việc thiếu dự án/lĩnh vực. Liệt kê đề xuất trước.'],
    ['📅 Lên kế hoạch tuần', 'Từ các việc đang mở và lịch tuần này, đề xuất phân bổ việc theo từng ngày (tối đa 3 việc quan trọng/ngày).']
  ],
  'van-ban': [
    ['📄 Văn bản sắp hạn', 'Liệt kê văn bản Chủ trì/Phối hợp chưa xong theo hạn. Với 3 văn bản gần hạn nhất, đề xuất các bước xử lý và việc cần tạo.'],
    ['📮 Đơn vị chưa gửi', 'Với các văn bản yêu cầu đơn vị gửi báo cáo, liệt kê đơn vị chưa gửi và soạn tin nhắc ngắn gọn, lịch sự.']
  ],
  'ghi-chu': [
    ['🗂 Dọn Inbox theo PARA', 'Dọn Inbox ghi chú theo PARA: với mỗi ghi chú, đề xuất xếp vào dự án/lĩnh vực/tài nguyên/lưu trữ và một chủ đề. Chờ tôi duyệt rồi cập nhật.'],
    ['✨ Chắt lọc tuần này', 'Chọn 3 ghi chú đáng giá nhất tôi viết trong 7 ngày qua, viết tóm tắt lớp 4 (1–3 câu) cho từng cái và lưu vào trường tóm tắt sau khi tôi đồng ý.']
  ],
  'tu-sach': [
    ['📚 Gợi ý sách tiếp theo', 'Xem tủ sách và lịch sử đọc của tôi, gợi ý 3 cuốn nên đọc tiếp (có bản tiếng Việt) kèm lý do; nếu tôi đồng ý thì thêm vào “Muốn đọc”.'],
    ['📈 Tiến độ đọc', 'Tổng kết tiến độ đọc của tôi so với mục tiêu năm/tháng/tuần (lệnh doc_sach_tong_quan) và đề xuất cách bắt kịp.']
  ],
  para: [['🧭 Đánh giá PARA', 'Đánh giá Bản đồ PARA của tôi: dự án nào thiếu kết quả/hạn, lĩnh vực nào lâu không động tới, ý tưởng “Để sau” nào nên bắt đầu. Đề xuất điều chỉnh.']],
  'ren-luyen': [['🀄 Học tiếng Trung hôm nay', 'Học tiếng Trung hôm nay: đọc tiến độ (hoc_tien_do), ôn câu đến hạn trước rồi dạy bài tiếp theo; cuối buổi nhắc tôi “lưu bài”.'],
    ['🔁 Xem lại thói quen', 'Xem tỉ lệ giữ các thói quen của tôi 30 ngày qua; thói quen nào nên thu nhỏ bản 2 phút, nối chuỗi khác hoặc tạm dừng theo Atomic Habits.']]
};
const ALWAYS = [
  ['🗓 Ôn tuần cùng tôi', 'Cùng tôi ôn tuần 15 phút theo 6 bước của app: thu gom Inbox, xem dự án (câu Hemingway), dọn việc trễ, xem tuần sau, câu hỏi lớn, nhìn lại + 3 ưu tiên. Hỏi từng bước.'],
  ['✍️ Soạn công văn', 'Soạn giúp tôi một công văn về: [nội dung]. Văn phong hành chính EVN, có căn cứ, nội dung chính, tổ chức thực hiện, nơi nhận. Hỏi tôi thông tin còn thiếu trước khi viết.']
];

export function openAsk(route, prefill = '') {
  const list = [...(ROUTE_PROMPTS[route] || ROUTE_PROMPTS['hom-nay']), ...ALWAYS];
  const box = document.createElement('div');
  box.className = 'ask';
  box.innerHTML = html`
    <textarea class="ask-free" rows="3" placeholder="Gõ câu hỏi…"></textarea>
    <div class="ask-2">
      <button class="btn btn-primary" data-ask-free>✨ Hỏi Claude<small>đọc/ghi dữ liệu app</small></button>
      <button class="btn ask-gem" data-ask-gem>🔷 Hỏi Gemini<small>soạn thảo, kiến thức chung</small></button>
    </div>
    <p class="hint">Chỉ cần tra cứu? Dùng ô Tìm 🔍 — miễn phí, không tốn lượt AI. Gemini không xem được dữ liệu app; chỉ nhận đúng câu anh gõ.
      <br>Gemini mở bằng: <b data-gem-acc-label>${geminiAccount() || 'tài khoản mặc định'}</b> · <button class="link" type="button" data-gem-acc>đổi</button></p>
    <h4>Claude · dùng dữ liệu app</h4>
    <div class="ask-list">${list.filter(([l]) => l !== '✍️ Soạn công văn').map(([label, text]) => html`<button class="ask-item" data-ask-text="${text}">${label}</button>`)}</div>
    <h4>Gemini · không cần dữ liệu app</h4>
    <div class="ask-list">${GEMINI.map(([label, text]) => html`<button class="ask-item gem" data-gem-text="${text}">${label}</button>`)}</div>`.__raw;
  openSheet(box, { title: '✨ Hỏi AI' });
  const ta = box.querySelector('.ask-free');
  if (prefill) ta.value = prefill;
  setTimeout(() => ta.focus(), 120);
  box.querySelector('[data-ask-free]').onclick = () => { const q = ta.value.trim(); if (!q) { ta.focus(); return; } closeSheet(); askClaude(q); };
  box.querySelector('[data-ask-gem]').onclick = () => { const q = ta.value.trim(); if (!q) { ta.focus(); return; } closeSheet(); askGemini(q); };
  box.querySelector('[data-gem-acc]').onclick = () => { if (setGeminiAccount()) box.querySelector('[data-gem-acc-label]').textContent = geminiAccount() || 'tài khoản mặc định'; };
}

// ---------------- Câu hỏi kèm bối cảnh một bản ghi ----------------
function contextPrompts(table, r) {
  if (table === 'ghi_chu') {
    const ctx = `Ghi chú “${r.tieu_de || 'không tiêu đề'}” (id ${r.id}) trong app:\n---\n${clip(r.noi_dung, 1500)}\n---\n`;
    return [
      ['📝 Tóm tắt lớp 4', ctx + 'Viết tóm tắt 1–3 câu bằng giọng của tôi, rồi lưu vào trường tóm tắt của ghi chú sau khi tôi đồng ý.'],
      ['✅ Tách thành việc', ctx + 'Tách thành các việc cụ thể (bắt đầu bằng động từ, có hạn nếu được nhắc tới); tạo việc trong app sau khi tôi duyệt.'],
      ['✍️ Soạn văn bản từ ghi chú', ctx + 'Dựa vào ghi chú, soạn một công văn/báo cáo ngắn văn phong hành chính để tôi chỉnh.'],
      ['🗂 Nên xếp vào đâu?', ctx + 'Theo PARA, ghi chú này nên xếp vào dự án/lĩnh vực/tài nguyên nào của tôi, chủ đề gì, vì sao?']
    ];
  }
  if (table === 'viec') {
    const ctx = `Việc “${r.ten}” (id ${r.id})${r.han ? `, hạn ${r.han}` : ''}${r.mo_ta ? `, mô tả: ${clip(r.mo_ta, 600)}` : ''}.\n`;
    return [
      ['🪜 Chia nhỏ việc', ctx + 'Chia thành các bước nhỏ, ước lượng thời gian từng bước; tạo việc con sau khi tôi duyệt.'],
      ['✍️ Soạn bản nháp', ctx + 'Soạn bản nháp sản phẩm của việc này (email, tờ trình, báo cáo…) để tôi chỉnh.']
    ];
  }
  if (table === 'van_ban') {
    const ctx = `Văn bản ${r.so_hieu}${r.trich_yeu ? `: ${clip(r.trich_yeu, 400)}` : ''}; vai trò ${r.vai_tro || '?'}${r.han_xu_ly ? `; hạn ${r.han_xu_ly}` : ''}${r.but_phe ? `; bút phê: ${clip(r.but_phe, 300)}` : ''} (id ${r.id}).\n`;
    return [
      ['🧭 Cách xử lý', ctx + 'Đề xuất cách xử lý và các việc cần làm để kịp hạn; tạo việc sau khi tôi duyệt.'],
      ['✍️ Dự thảo trả lời', ctx + 'Soạn dự thảo văn bản trả lời/báo cáo theo yêu cầu của văn bản này, văn phong hành chính EVN.']
    ];
  }
  if (table === 'du_an') {
    const ctx = `Dự án “${r.ten}” (id ${r.id})${r.ket_qua ? `, kết quả mong muốn: ${r.ket_qua}` : ''}${r.han ? `, hạn ${r.han}` : ''}.\n`;
    return [['🗺 Lập kế hoạch dự án', ctx + 'Lập kế hoạch các mốc và việc cần làm tới hạn, viết câu Hemingway “lần sau bắt đầu từ…”; tạo việc sau khi tôi duyệt.']];
  }
  if (table === 'sach') {
    const ctx = `Cuốn “${r.ten}”${r.tac_gia ? ` – ${r.tac_gia}` : ''} (id ${r.id}) trong tủ sách của tôi.\n`;
    return [
      ['💡 Ý chính & câu hỏi suy ngẫm', ctx + 'Tóm tắt các ý chính và đưa 5 câu hỏi suy ngẫm để áp dụng vào công việc nhân sự của tôi.'],
      ['📝 Viết 3 ý mang theo', ctx + 'Dựa vào review và các ghi chú của tôi về cuốn này, viết 3 ý chính mang theo; lưu vào sách sau khi tôi đồng ý.']
    ];
  }
  return [];
}

/** Câu cho Gemini kèm nội dung một mục (chỉ soạn thảo; Gemini không lưu được vào app). Không có cho nhân sự/tài chính. */
function gemPrompts(table, r) {
  if (table === 'ghi_chu') return [['📝 Tóm tắt ghi chú', `Tóm tắt 1–3 câu và nêu 3 ý chính của ghi chú sau:\n---\n${clip(r.noi_dung, 2500)}\n---`]];
  if (table === 'viec') return [['✍️ Soạn bản nháp', `Soạn bản nháp sản phẩm cho việc “${r.ten}”${r.mo_ta ? ` (mô tả: ${clip(r.mo_ta, 600)})` : ''}: email, tờ trình hoặc báo cáo phù hợp, văn phong hành chính.`]];
  if (table === 'van_ban') return [['✍️ Dự thảo trả lời', `Soạn dự thảo văn bản trả lời/báo cáo cho văn bản ${r.so_hieu}${r.trich_yeu ? `: ${clip(r.trich_yeu, 400)}` : ''}, văn phong hành chính EVN.`]];
  if (table === 'sach') return [['💡 Ý chính cuốn sách', `Tóm tắt các ý chính của cuốn “${r.ten}”${r.tac_gia ? ` – ${r.tac_gia}` : ''} và 5 câu hỏi suy ngẫm để áp dụng vào công việc nhân sự.`]];
  return [];
}

/** Khối "✨ Nhờ AI" gắn trong biểu mẫu / trình sửa (mở ra mới hiện các lựa chọn). */
export function askBox(table, r) {
  const list = r ? contextPrompts(table, r) : [];
  const gem = r ? gemPrompts(table, r) : [];
  if (!list.length && !gem.length) return '';
  return html`<details class="ask-box"><summary>✨ Nhờ AI</summary><div class="ask-list">${list.map(([label, text]) => html`<button type="button" class="ask-item" data-ask-text="${text}">${label}</button>`)}${gem.map(([label, text]) => html`<button type="button" class="ask-item gem" data-gem-text="${text}">🔷 ${label} (Gemini)</button>`)}</div></details>`;
}

// Một trình nghe chung cho mọi nút [data-ask-text] (kể cả trong bảng trượt).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ask-text],[data-gem-text]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (b.closest('.ask')) closeSheet();
  if (b.dataset.gemText !== undefined) askGemini(b.dataset.gemText); else askClaude(b.dataset.askText);
}, true);

export { today, store };
