// Tạo thói quen theo 4 quy luật Atomic Habits + thư viện mẫu + chạy chuỗi thói quen (sáng/trưa/tối).
import * as store from './store.js';
import { html, raw, today } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';

// Mẫu thói quen nhỏ: [biểu tượng, tên, bản sắc, bản 2 phút, mốc, giờ, chuỗi, tự tích khi, loại]
const TEMPLATES = [
  ['💧', 'Uống một cốc nước', 'người chăm sóc cơ thể', 'uống vài ngụm', 'thức dậy', '06:00', 'Sáng', '', 'Xây'],
  ['🧘', 'Hít thở sâu 1 phút', 'người bình tĩnh', '3 hơi thở sâu', 'uống nước buổi sáng', '06:05', 'Sáng', '', 'Xây'],
  ['📝', 'Viết 3 việc quan trọng nhất hôm nay', 'người làm việc có chủ đích', 'viết 1 việc', 'ngồi vào bàn làm việc', '07:45', 'Sáng', '', 'Xây'],
  ['🚶', 'Đi bộ 10 phút sau ăn trưa', 'người khỏe mạnh', 'đi bộ 2 phút', 'ăn trưa xong', '12:30', 'Trưa', '', 'Xây'],
  ['📖', 'Đọc 10 trang sách', 'người đọc sách', 'đọc 1 trang', 'lên giường', '21:00', 'Tối', '', 'Xây'],
  ['🙏', 'Ghi 3 điều biết ơn', 'người biết trân trọng', 'nghĩ 1 điều biết ơn', 'tổng kết cuối ngày', '21:30', 'Tối', 'Tổng kết ngày', 'Xây'],
  ['🀄', 'Ôn câu tiếng Trung', 'người nói được tiếng Trung', 'ôn 3 câu', 'ăn tối xong', '20:00', 'Tối', 'Ôn câu tiếng Trung', 'Xây'],
  ['🗒', 'Ghi lại một ý tưởng', 'người có bộ não thứ hai', 'ghi 1 dòng', 'gặp điều thú vị', '', '', 'Thêm ghi chú', 'Xây'],
  ['📵', 'Không lướt điện thoại sau 22:30', 'người ngủ đủ giấc', 'để điện thoại ngoài phòng ngủ', '22:30', '22:30', 'Tối', '', 'Bỏ']
];

const LAWS = [
  ['Bản sắc', 'Bạn muốn trở thành người thế nào? Mỗi lần làm là một phiếu bầu cho con người đó.'],
  ['Rõ ràng', 'Làm gì, lúc nào, ở đâu, ngay sau việc gì. Ý định càng cụ thể càng dễ làm.'],
  ['Dễ', 'Phiên bản 2 phút: nhỏ tới mức không thể từ chối. Hôm bận chỉ cần làm bản này.'],
  ['Hấp dẫn & thỏa mãn', 'Phần thưởng ngay sau khi làm, và để app tự ghi nhận khi có thể.']
];

export function openHabitWizard(prefill = {}) {
  const st = { loai: 'Xây', ten: '', bieu_tuong: '', ban_sac: '', moc: '', noi_sau: '', gio_nhac: '', dia_diem_lam: '', ban_2_phut: '',
    tan_suat: 'Hằng ngày', phan_thuong: '', lam_kho_hon: '', tu_dong: '', chuoi: '', ...prefill };
  let step = -1; // -1: chọn mẫu
  const box = document.createElement('div');
  box.className = 'hwiz';
  const sheet = openSheet(box, { title: 'Tạo thói quen mới' });
  const habits = () => store.all('thoi_quen').filter((h) => h.trang_thai === 'Đang theo');

  const sentence = () => {
    const after = st.noi_sau ? store.get('thoi_quen', st.noi_sau)?.ten.toLowerCase() : st.moc;
    return `${after ? `Sau khi ${after}, t` : 'T'}ôi sẽ ${st.loai === 'Bỏ' ? 'tránh ' : ''}${(st.ten || '…').toLowerCase()}${st.gio_nhac ? ` lúc ${st.gio_nhac}` : ''}${st.dia_diem_lam ? ` ở ${st.dia_diem_lam}` : ''}.`;
  };

  function body() {
    if (step === -1) {
      return html`<p class="hint">Bắt đầu từ một mẫu nhỏ (nhỏ là chìa khóa), hoặc tự tạo.</p>
        <div class="hw-tpl">${TEMPLATES.map((t, i) => html`<button class="hw-card ${t[8] === 'Bỏ' ? 'bad' : ''}" data-tpl="${i}"><span>${t[0]}</span><b>${t[1]}</b><small>${t[2]}${t[6] ? ' · chuỗi ' + t[6].toLowerCase() : ''}</small></button>`)}</div>
        <div class="opts"><button class="btn" data-blank="Xây">+ Tự tạo thói quen tốt</button><button class="btn btn-ghost" data-blank="Bỏ">🚫 Bỏ một thói quen xấu</button></div>`;
    }
    const [law, tip] = st.loai === 'Bỏ' && step === 3 ? ['Làm cho khó & vô hình', 'Giấu tín hiệu, thêm bước cản, rủ người giám sát.'] : LAWS[step];
    let f = '';
    if (step === 0) f = html`
      <label>${st.loai === 'Bỏ' ? 'Thói quen muốn bỏ' : 'Thói quen'}<input data-f="ten" value="${st.ten}" placeholder="${st.loai === 'Bỏ' ? 'vd: lướt điện thoại sau 22:30' : 'vd: đọc 10 trang sách'}"></label>
      <label>Tôi là…<input data-f="ban_sac" value="${st.ban_sac}" placeholder="vd: người đọc sách"></label>
      <label>Biểu tượng<input data-f="bieu_tuong" value="${st.bieu_tuong}" placeholder="📖" maxlength="4"></label>`;
    if (step === 1) f = html`
      <label>Làm ngay sau thói quen<select data-f="noi_sau"><option value="">— không —</option>${habits().map((h) => html`<option value="${h.id}" ${h.id === st.noi_sau ? raw('selected') : ''}>${h.bieu_tuong || ''} ${h.ten}</option>`)}</select></label>
      <label>Hoặc sau khi… (việc quen thuộc)<input data-f="moc" value="${st.moc}" placeholder="vd: pha cà phê sáng"></label>
      <div class="hw-row"><label>Lúc<input type="time" data-f="gio_nhac" value="${st.gio_nhac}"></label><label>Ở đâu<input data-f="dia_diem_lam" value="${st.dia_diem_lam}" placeholder="vd: bàn làm việc"></label></div>
      <label>Thuộc chuỗi<select data-f="chuoi">${['', 'Sáng', 'Trưa', 'Tối'].map((c) => html`<option value="${c}" ${c === st.chuoi ? raw('selected') : ''}>${c || '— không —'}</option>`)}</select></label>
      <label>Tần suất<select data-f="tan_suat">${['Hằng ngày', 'Ngày thường'].map((c) => html`<option ${c === st.tan_suat ? raw('selected') : ''}>${c}</option>`)}</select></label>`;
    if (step === 2) f = html`
      <label>Phiên bản 2 phút<input data-f="ban_2_phut" value="${st.ban_2_phut}" placeholder="${st.loai === 'Bỏ' ? 'vd: để điện thoại sạc ngoài phòng' : 'vd: đọc 1 trang'}"></label>
      <p class="hint">Mẹo: “Làm cho đến khi thành người làm điều đó, rồi mới tối ưu”. Đừng tăng độ khó khi chưa giữ được chuỗi 2 tuần.</p>`;
    if (step === 3) f = st.loai === 'Bỏ' ? html`
      <label>Làm sao cho khó hơn / vô hình<textarea data-f="lam_kho_hon" rows="3" placeholder="vd: sạc điện thoại ở phòng khách; tắt thông báo sau 22h">${st.lam_kho_hon}</textarea></label>` : html`
      <label>Phần thưởng ngay sau khi làm<input data-f="phan_thuong" value="${st.phan_thuong}" placeholder="vd: 1 tách trà ngon"></label>
      <label>Để app tự tích khi…<select data-f="tu_dong"><option value="">— tự tích tay —</option>${['Tổng kết ngày', 'Ôn câu tiếng Trung', 'Lưu bài học', 'Ôn tuần', 'Xong 1 việc', 'Thêm ghi chú'].map((c) => html`<option ${c === st.tu_dong ? raw('selected') : ''}>${c}</option>`)}</select></label>
      <p class="hint">Đúng giờ hẹn mà chưa làm, điện thoại sẽ nhắc kèm câu bản sắc và bản 2 phút.</p>`;
    return html`<div class="steps">${LAWS.map(([l], i) => html`<button class="step ${i === step ? 'on' : i < step ? 'past' : ''}" data-step="${i}">${i + 1}. ${st.loai === 'Bỏ' && i === 3 ? 'Khó hơn' : l}</button>`)}</div>
      <h3>${law}</h3><p class="hint">${tip}</p><div class="hw-form">${f}</div>
      <p class="intent">📌 ${sentence()}</p>`;
  }

  function collect() { box.querySelectorAll('[data-f]').forEach((el) => { st[el.dataset.f] = el.value.trim(); }); }

  async function save() {
    collect();
    if (!st.ten) { toast('Cần tên thói quen'); step = 0; render(); return; }
    const data = Object.fromEntries(Object.entries({ ...st, trang_thai: 'Đang theo', bat_dau: today() }).filter(([, v]) => v !== ''));
    store.create('thoi_quen', data).catch(errorToast);
    sheet.close();
    toast(`Đã tạo “${st.ten}”. ${st.ban_sac ? 'Phiếu bầu đầu tiên bắt đầu từ hôm nay!' : ''}`, { kind: 'ok' });
  }

  function render() {
    box.innerHTML = html`${body()}${step >= 0 ? html`<div class="form-actions"><button class="btn btn-ghost" data-prev>${step === 0 ? 'Chọn mẫu' : 'Quay lại'}</button><span class="spacer"></span>
      ${step < 3 ? html`<button class="btn btn-primary" data-next>Tiếp</button>` : html`<button class="btn btn-primary" data-save>Tạo thói quen</button>`}</div>` : ''}`.__raw;
    box.querySelectorAll('[data-tpl]').forEach((b) => b.onclick = () => {
      const t = TEMPLATES[+b.dataset.tpl];
      Object.assign(st, { bieu_tuong: t[0], ten: t[1], ban_sac: t[2], ban_2_phut: t[3], moc: t[4], gio_nhac: t[5], chuoi: t[6], tu_dong: t[7], loai: t[8] });
      step = 0; render();
    });
    box.querySelectorAll('[data-blank]').forEach((b) => b.onclick = () => { st.loai = b.dataset.blank; step = 0; render(); });
    box.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { collect(); step = +b.dataset.step; render(); });
    box.querySelector('[data-prev]')?.addEventListener('click', () => { collect(); step--; render(); });
    box.querySelector('[data-next]')?.addEventListener('click', () => { collect(); step++; render(); });
    box.querySelector('[data-save]')?.addEventListener('click', save);
    box.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { collect(); const p = box.querySelector('.intent'); if (p) p.textContent = '📌 ' + sentence(); }));
  }
  render();
  return sheet;
}

// ---------------- Chạy chuỗi thói quen ----------------
/** Các thói quen của một chuỗi theo thứ tự: theo trường "chuoi" và quan hệ "làm ngay sau". */
export function chainOf(name, list) {
  const items = list.filter((h) => h.chuoi === name);
  const byAfter = new Map(); items.forEach((h) => { if (h.noi_sau) byAfter.set(h.noi_sau, h); });
  const roots = items.filter((h) => !h.noi_sau || !items.some((x) => x.id === h.noi_sau)).sort((a, b) => (a.gio_nhac || '99').localeCompare(b.gio_nhac || '99'));
  const out = [];
  roots.forEach((r) => { let h = r; const seen = new Set(); while (h && !seen.has(h.id)) { out.push(h); seen.add(h.id); h = byAfter.get(h.id); } });
  items.forEach((h) => { if (!out.includes(h)) out.push(h); });
  return out;
}

export function openChain(name, list, isDone, toggle) {
  const items = chainOf(name, list).filter((h) => !isDone(h));
  if (!items.length) { toast(`Chuỗi ${name.toLowerCase()} đã xong hết 🎉`); return; }
  let i = 0, done = 0;
  const box = document.createElement('div');
  box.className = 'chain';
  const sheet = openSheet(box, { title: `Chuỗi buổi ${name.toLowerCase()}` });
  function render() {
    if (i >= items.length) {
      box.innerHTML = html`<div class="flash-done"><p class="big">🎉 Xong chuỗi ${name.toLowerCase()}</p><p>${done}/${items.length} thói quen. Mỗi lần là một phiếu bầu cho con người bạn muốn trở thành.</p><button class="btn" data-x="close">Đóng</button></div>`.__raw;
      return;
    }
    const h = items[i];
    box.innerHTML = html`<p class="flash-count">${i + 1}/${items.length}</p>
      <div class="chain-card"><span class="chain-ic">${h.bieu_tuong || '•'}</span><h3>${h.ten}</h3>
        ${h.ban_sac ? html`<p class="identity">Tôi là ${h.ban_sac.replace(/^tôi là\s*/i, '')}</p>` : ''}
        ${h.ban_2_phut ? html`<p class="row-meta">⏱ Bận? ${h.ban_2_phut}</p>` : ''}</div>
      <div class="flash-actions"><button class="btn btn-ghost" data-x="skip">Bỏ qua</button>${h.ban_2_phut ? html`<button class="btn btn-ghost" data-x="mini">Bản 2′</button>` : ''}<button class="btn" data-x="done">Xong</button></div>`.__raw;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x, h = items[i];
    if (x === 'close') { sheet.close(); return; }
    if (x === 'done' || x === 'mini') { toggle(h.id, undefined, x === 'mini' ? '2 phút' : 'Đủ', { quiet: true }); done++; }
    i++; render();
  });
  render();
}
