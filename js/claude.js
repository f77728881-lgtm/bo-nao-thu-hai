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

export function openAsk(route) {
  const list = [...(ROUTE_PROMPTS[route] || ROUTE_PROMPTS['hom-nay']), ...ALWAYS];
  const box = document.createElement('div');
  box.className = 'ask';
  box.innerHTML = html`
    <textarea class="ask-free" rows="3" placeholder="Hỏi Claude bất cứ điều gì về việc, văn bản, ghi chú, lịch của anh…"></textarea>
    <div class="form-actions" style="margin-top:6px"><span class="hint">Claude dùng connector để tra dữ liệu app.</span><span class="spacer"></span><button class="btn btn-primary" data-ask-free>✨ Hỏi</button></div>
    <h4>Gợi ý</h4>
    <div class="ask-list">${list.map(([label, text]) => html`<button class="ask-item" data-ask-text="${text}">${label}</button>`)}</div>
    <p class="hint">Mở bằng ứng dụng Claude trên điện thoại sẽ tiện nhất. Câu hỏi luôn được chép sẵn vào bộ nhớ tạm.</p>`.__raw;
  openSheet(box, { title: '✨ Hỏi Claude' });
  const ta = box.querySelector('.ask-free');
  setTimeout(() => ta.focus(), 120);
  box.querySelector('[data-ask-free]').onclick = () => { const q = ta.value.trim(); if (!q) { ta.focus(); return; } closeSheet(); askClaude(q); };
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

/** Khối "✨ Nhờ Claude" gắn trong biểu mẫu / trình sửa (mở ra mới hiện các lựa chọn). */
export function askBox(table, r) {
  const list = r ? contextPrompts(table, r) : [];
  if (!list.length) return '';
  return html`<details class="ask-box"><summary>✨ Nhờ Claude</summary><div class="ask-list">${list.map(([label, text]) => html`<button type="button" class="ask-item" data-ask-text="${text}">${label}</button>`)}</div></details>`;
}

// Một trình nghe chung cho mọi nút [data-ask-text] (kể cả trong bảng trượt).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ask-text]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (b.closest('.ask')) closeSheet();
  askClaude(b.dataset.askText);
}, true);

export { today, store };
