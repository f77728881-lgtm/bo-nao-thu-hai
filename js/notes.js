// Ghi chú kiểu Google Keep: tab nhãn #0_Inbox / #1_Work / #2_Life / #3_Archive, lưới thẻ, ghim, màu,
// checklist tick ngay trên thẻ, trình soạn tự lưu khi đóng.
import * as store from './store.js';
import { html, raw, esc, fold, whenLabel } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { stripHtml, addPhotos, openPhoto, onPhotos } from './photos.js';
import { PROMPT_LABEL, isPrompt, promptCardExtra, usePrompt, addStarterPrompts } from './prompts.js';

export const MAIN_LABELS = [
  { key: '#0_Inbox', name: 'Inbox', ic: 'inbox', hint: 'Mới nhập, chưa phân loại' },
  { key: '#1_Work', name: 'Work', ic: 'folder', hint: 'Công việc' },
  { key: '#2_Life', name: 'Life', ic: 'sun', hint: 'Cuộc sống' },
  { key: '#3_Archive', name: 'Archive', ic: 'list', hint: 'Lưu trữ, tra cứu' }
];
const MAIN_KEYS = MAIN_LABELS.map((l) => l.key);

/** Chép chữ vào bộ nhớ tạm (có cách dự phòng cho trình duyệt cũ). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
const noteText = (n) => [n.tieu_de && n.tieu_de !== n.noi_dung ? n.tieu_de : '', n.noi_dung || '', n.url || ''].filter(Boolean).join('\n\n');
const INBOX = '#0_Inbox';

export const COLORS = ['Trắng', 'Đỏ', 'Cam', 'Vàng', 'Xanh lá', 'Xanh ngọc', 'Xanh dương', 'Tím', 'Hồng', 'Nâu', 'Xám'];
const colorClass = (c) => 'nc-' + fold(c || 'Trắng').replace(/\s+/g, '-');

// ---------- Second Brain: chắt lọc theo lớp, khối dựng sẵn, câu hỏi lớn, gợi ý xếp ----------
export const KHOI = 'Khối dựng sẵn';
export const CAU_HOI = 'Câu hỏi lớn';
const KHOI_TAB = '@khoi', CH_TAB = '@cauhoi';
const isSpecial = (n) => n.loai === KHOI || n.loai === CAU_HOI;
/** Lớp chắt lọc (Progressive Summarization): 1 thô · 2 in đậm · 3 tô sáng · 4 có tóm tắt. */
export function layer(n) {
  const t = String(n.noi_dung || '');
  if (String(n.tom_tat || '').trim()) return 4;
  if (/==[^=\n]+==/.test(t)) return 3;
  if (/\*\*[^*\n]+\*\*/.test(t)) return 2;
  return 1;
}
/** Hiện **đậm** và ==tô sáng== (đã thoát HTML trước). */
function rich(text) {
  return esc(text).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}
const words = (t) => new Set(fold(t || '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
/** Gợi ý dự án đang chạy phù hợp với ghi chú (trùng từ khóa với tên/mô tả dự án). */
export function suggestProjects(n) {
  const w = words([n.tieu_de, n.noi_dung].join(' '));
  return store.all('du_an').filter((d) => d.trang_thai !== 'Xong' && d.id !== n.du_an_id)
    .map((d) => { const dw = words([d.ten, d.mo_ta, d.ket_qua].join(' ')); let s = 0; dw.forEach((x) => { if (w.has(x)) s++; }); return { d, s }; })
    .filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.d);
}

let tab = localStorage.getItem('bnth.noteTab') || INBOX;
if (tab === '#1_Work' || tab === '#2_Life') tab = '@tai_nguyen'; // nhãn cũ trước PARA
let query = '';

/** Nhãn chính của ghi chú (một trong 4); không có thì coi như Inbox. */
export function mainLabel(n) {
  const lbs = (n.nhan || []).map((x) => x.trim());
  for (const k of MAIN_KEYS) if (lbs.some((x) => fold(x) === fold(k))) return k;
  return INBOX;
}
const extraLabels = (n) => (n.nhan || []).filter((x) => !MAIN_KEYS.some((k) => fold(k) === fold(x)));

// ---------------- PARA (Tiago Forte): xếp theo nơi sẽ DÙNG tới, không theo chủ đề ----------------
// Vị trí suy ra từ dữ liệu: gắn dự án → Dự án; gắn lĩnh vực → Lĩnh vực; nhãn #3_Archive hoặc dự án đã xong → Lưu trữ;
// nhãn #0_Inbox → Inbox; còn lại (đã xếp, không gắn gì) → Tài nguyên, nhóm theo nhãn chủ đề.
export const PARA = [
  { key: '#0_Inbox', name: 'Inbox', ic: 'inbox', hint: 'Mới ghi, chưa xếp. Hỏi: ghi chú này giúp dự án nào?' },
  { key: '@du_an', name: 'Dự án', ic: 'folder', hint: 'Dùng cho dự án đang chạy — có kết quả và hạn chót.' },
  { key: '@linh_vuc', name: 'Lĩnh vực', ic: 'grid', hint: 'Trách nhiệm lâu dài: Tuyển dụng, Đào tạo, Lao động, Tài chính…' },
  { key: '@tai_nguyen', name: 'Tài nguyên', ic: 'book', hint: 'Chủ đề quan tâm, tư liệu tham khảo — nhóm theo nhãn chủ đề.' },
  { key: '#3_Archive', name: 'Lưu trữ', ic: 'list', hint: 'Dự án đã xong và thứ không còn dùng. Không mất, vẫn tìm được.' }
];
const PARA_KEYS = PARA.map((x) => x.key);
const SORTED = '#1_Work'; // nhãn kỹ thuật "đã xếp" (không phải Inbox, không lưu trữ)
export function paraOf(n) {
  const ml = mainLabel(n);
  const p = n.du_an_id ? store.get('du_an', n.du_an_id) : null;
  if (ml === '#3_Archive' || (p && p.trang_thai === 'Xong')) return '#3_Archive';
  if (p) return '@du_an';
  if (n.linh_vuc_id && store.get('linh_vuc', n.linh_vuc_id)) return '@linh_vuc';
  if (ml === INBOX) return INBOX;
  return '@tai_nguyen';
}
export const paraName = (k) => PARA.find((x) => x.key === k)?.name || k;
/** Nhóm con trong mỗi ngăn PARA: tên dự án / lĩnh vực / chủ đề. */
function paraGroup(n, key) {
  if (key === '@du_an') return '📁 ' + (store.get('du_an', n.du_an_id)?.ten || '');
  if (key === '@linh_vuc') { const a = store.get('linh_vuc', n.linh_vuc_id); return (a?.bieu_tuong || '🗂') + ' ' + (a?.ten || ''); }
  if (key === '@tai_nguyen') { const t = extraLabels(n).filter((x) => x !== PROMPT_LABEL)[0]; return t ? '🏷 ' + t : 'Chưa có chủ đề'; }
  return '';
}

// ---------------- Checklist trong nội dung: dòng "- [ ] việc" / "- [x] việc" ----------------
const CHECK_RE = /^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/;
export function parseChecklist(text) {
  return String(text || '').split('\n').map((line) => {
    const m = line.match(CHECK_RE);
    return m ? { done: m[1].toLowerCase() === 'x', text: m[2] } : { done: null, text: line };
  });
}
const isChecklist = (n) => n.loai === 'Checklist' || parseChecklist(n.noi_dung).some((l) => l.done !== null);
const toChecklistText = (items) => items.filter((i) => i.text.trim() || i.done).map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');

// ---------------- Màn danh sách ----------------
function visibleNotes() {
  let notes = store.all('ghi_chu');
  if (query) {
    const q = fold(query).split(' ');
    notes = notes.filter((n) => { const t = fold([n.tieu_de, n.noi_dung, (n.nhan || []).join(' '), n.url].join(' ')); return q.every((x) => t.includes(x)); });
  } else if (tab === PROMPT_LABEL) {
    notes = notes.filter(isPrompt);
  } else if (tab === KHOI_TAB) {
    notes = notes.filter((n) => n.loai === KHOI);
  } else if (tab === CH_TAB) {
    notes = notes.filter((n) => n.loai === CAU_HOI);
  } else if (tab !== 'all') {
    notes = notes.filter((n) => !isPrompt(n) && !isSpecial(n) && (PARA_KEYS.includes(tab) ? paraOf(n) === tab : (n.nhan || []).includes(tab)));
  }
  return notes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

function card(n) {
  const lines = parseChecklist(n.noi_dung);
  const check = isChecklist(n);
  let body;
  if (check) {
    const items = lines.map((l, i) => ({ ...l, i })).filter((l) => l.done !== null);
    const open = items.filter((l) => !l.done), done = items.filter((l) => l.done);
    body = html`<ul class="n-check">${open.slice(0, 10).map((l) => html`<li><button class="n-box" data-note-check="${n.id}:${l.i}" aria-label="Đánh dấu xong"></button><span>${l.text}</span></li>`)}
      ${open.length > 10 ? html`<li class="n-more">+ ${open.length - 10} mục</li>` : ''}
      ${done.length ? html`<li class="n-more">✓ ${done.length} mục đã xong</li>` : ''}</ul>`;
  } else {
    const text = String(n.noi_dung || '');
    const cut = text.length > 600 ? text.slice(0, 600) + '…' : text;
    body = html`${n.tom_tat ? html`<div class="n-sum">${n.tom_tat}</div>` : ''}${text ? html`<div class="n-text">${raw(rich(cut))}</div>` : ''}`;
  }
  const showMain = (tab === 'all' || query) && !isPrompt(n);
  const tags = [...(showMain ? [paraName(paraOf(n))] : []), ...extraLabels(n).filter((x) => x !== PROMPT_LABEL || tab !== PROMPT_LABEL)];
  if (isPrompt(n)) body = html`<div class="n-text n-prompt">${String(n.noi_dung || '').slice(0, 280)}${String(n.noi_dung || '').length > 280 ? '…' : ''}</div>${promptCardExtra(n)}`;
  return html`<article class="note ${isPrompt(n) ? 'is-prompt' : ''} ${colorClass(n.mau)} ${n._pending ? 'is-pending' : ''}" data-note="${n.id}" tabindex="0">
    ${n.ghim ? html`<span class="n-pin" title="Đã ghim">${icon('pin')}</span>` : ''}
    ${n.tieu_de && n.tieu_de !== n.noi_dung ? html`<h3 class="n-title">${n.tieu_de}</h3>` : ''}
    ${body}
    ${(n.anh || []).length ? stripHtml({ id: n.id, anh: n.anh.slice(0, 3) }) : ''}${(n.anh || []).length > 3 ? html`<small class="ph-more">+${n.anh.length - 3} ảnh</small>` : ''}
    ${n.url ? html`<a class="n-link" href="${n.url}" target="_blank" rel="noopener">🔗 ${n.url.replace(/^https?:\/\//, '').slice(0, 40)}</a>` : ''}
    ${tags.length || layer(n) > 1 || n.loai === CAU_HOI ? html`<div class="n-tags">${layer(n) > 1 && !isPrompt(n) ? html`<span class="tag tag-layer" title="Lớp chắt lọc">L${layer(n)}</span>` : ''}${n.loai === CAU_HOI ? html`<span class="tag">🔗 ${store.all('ghi_chu').filter((x) => x.cau_hoi_id === n.id).length} ghi chú</span>` : ''}${tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : ''}
    ${(n.du_an_id && store.get('du_an', n.du_an_id)) || (n.linh_vuc_id && store.get('linh_vuc', n.linh_vuc_id)) ? html`<div class="n-tags">${n.du_an_id && store.get('du_an', n.du_an_id) ? html`<span class="tag">📁 ${store.get('du_an', n.du_an_id).ten}</span>` : ''}${n.linh_vuc_id && store.get('linh_vuc', n.linh_vuc_id) ? html`<span class="tag">🗂 ${store.get('linh_vuc', n.linh_vuc_id).ten}</span>` : ''}</div>` : ''}
    ${mainLabel(n) === INBOX && !isPrompt(n) && !isSpecial(n) ? html`${suggestProjects(n).map((d) => html`<button class="n-suggest" data-note-proj="${n.id}|${d.id}">Xếp vào 📁 ${d.ten}</button>`)}` : ''}
    <button class="n-copy" data-note-copy="${n.id}" title="Sao chép nội dung" aria-label="Sao chép nội dung">${icon('copy')}</button>
    <div class="n-actions">
      <button data-note-pin="${n.id}" title="${n.ghim ? 'Bỏ ghim' : 'Ghim'}">${icon('pin')}</button>
      ${mainLabel(n) === '#3_Archive' ? html`<button data-note-move="${n.id}|${SORTED}" title="Bỏ lưu trữ">↩︎</button>` : html`<button data-note-move="${n.id}|#3_Archive" title="Lưu trữ">${icon('list')}</button>`}
    </div>
  </article>`;
}

export function notesView() {
  const all = store.all('ghi_chu');
  const plain = all.filter((n) => !isPrompt(n) && !isSpecial(n));
  const prompts = all.filter(isPrompt);
  const counts = {}; plain.forEach((n) => { const k = paraOf(n); counts[k] = (counts[k] || 0) + 1; });
  const others = [...new Set(plain.flatMap(extraLabels))].sort((a, b) => fold(a).localeCompare(fold(b)));
  const isPromptTab = tab === PROMPT_LABEL && !query;
  const notes = visibleNotes();
  const pinned = notes.filter((n) => n.ghim), rest = notes.filter((n) => !n.ghim);
  const cur = PARA.find((l) => l.key === tab);
  const grouped = !query && ['@du_an', '@linh_vuc', '@tai_nguyen'].includes(tab);
  const groups = {};
  if (grouped) notes.forEach((n) => { const g = paraGroup(n, tab); (groups[g] = groups[g] || []).push(n); });
  return html`
    <header class="page-head notes-head"><h1>Ghi chú</h1>
      <input class="n-search" type="search" id="note-search" placeholder="Tìm trong ghi chú…" value="${query}" autocomplete="off"></header>
    <nav class="label-tabs" aria-label="Nhãn">
      ${PARA.map((l) => html`<button class="ltab ${tab === l.key && !query ? 'on' : ''}" data-note-tab="${l.key}" title="${l.hint}">${icon(l.ic)} ${l.name}<em>${counts[l.key] || 0}</em></button>`)}
      <button class="ltab ltab-prompt ${isPromptTab ? 'on' : ''}" data-note-tab="${PROMPT_LABEL}" title="Mẫu prompt cho công cụ AI">${icon('spark')} Prompt<em>${prompts.length}</em></button>
      <button class="ltab ${tab === KHOI_TAB && !query ? 'on' : ''}" data-note-tab="${KHOI_TAB}" title="Đoạn văn, mẫu công văn, bảng biểu dùng lại được">🧱 Khối<em>${all.filter((n) => n.loai === KHOI).length}</em></button>
      <button class="ltab ${tab === CH_TAB && !query ? 'on' : ''}" data-note-tab="${CH_TAB}" title="12 câu hỏi lớn anh theo đuổi">❓ Câu hỏi<em>${all.filter((n) => n.loai === CAU_HOI).length}</em></button>
      <button class="ltab ${tab === 'all' && !query ? 'on' : ''}" data-note-tab="all">Tất cả<em>${plain.length}</em></button>
      ${others.map((o) => html`<button class="ltab small ${tab === o && !query ? 'on' : ''}" data-note-tab="${o}">🏷 ${o}</button>`)}
    </nav>
    <div class="composer-row"><button class="composer" data-note-new>
      <span>${isPromptTab ? 'Prompt mới… (dùng {{tên biến}} cho chỗ cần điền)' : tab === KHOI_TAB ? 'Khối dựng sẵn mới…' : tab === CH_TAB ? 'Câu hỏi lớn mới…' : tab === '#3_Archive' ? 'Lưu một ghi chú tra cứu…' : 'Ghi chú mới…'}</span><span class="composer-icons"><i data-note-new-check title="Danh sách việc">${icon('list')}</i></span>
    </button><button class="paste-btn" data-note-paste title="Dán từ bộ nhớ tạm thành ghi chú mới">${icon('paste')}<span>Dán</span></button></div>
    ${query ? html`<p class="hint">${notes.length} ghi chú khớp “${query}” trong mọi nhãn.</p>` : tab === KHOI_TAB ? html`<p class="hint">Khối dựng sẵn: đoạn văn, mẫu công văn, dàn ý báo cáo… lần sau ghép lại thay vì viết từ đầu. Chạm biểu tượng sao chép để dùng ngay.</p>` : tab === CH_TAB ? html`<p class="hint">12 câu hỏi lớn anh đang theo đuổi. Khi ghi chú, gắn vào câu hỏi để thấy ý tưởng tích lũy dần.</p>` : cur ? html`<p class="hint">${cur.hint}</p>` : isPromptTab ? html`<p class="hint">Viết prompt có chỗ trống {{…}}, bấm “Dùng” để điền rồi sao chép sang ChatGPT, Claude, Gemini. <button class="link" data-prompt-starter>Thêm bộ prompt mẫu</button></p>` : ''}
    ${grouped ? Object.keys(groups).sort((a, b) => (a === 'Chưa có chủ đề') - (b === 'Chưa có chủ đề') || fold(a).localeCompare(fold(b))).map((g) => html`<h4 class="n-group">${g} <small>${groups[g].length}</small></h4><div class="masonry">${[...groups[g].filter((n) => n.ghim), ...groups[g].filter((n) => !n.ghim)].map(card)}</div>`) : html`
    ${pinned.length ? html`<h4 class="n-group">Đã ghim</h4><div class="masonry">${pinned.map(card)}</div>` : ''}
    ${pinned.length && rest.length ? html`<h4 class="n-group">Khác</h4>` : ''}
    ${rest.length ? html`<div class="masonry">${rest.map(card)}</div>` : ''}`}
    ${!notes.length ? html`<div class="empty big">${tab === INBOX && !query ? '📥 Inbox trống. Ghi chú mới sẽ vào đây trước khi bạn phân loại.' : 'Chưa có ghi chú nào ở đây.'}</div>` : ''}`;
}

// ---------------- Thao tác trên danh sách ----------------
export function bindNotes(root, rerender) {
  root.querySelectorAll('[data-note-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.noteTab; query = ''; localStorage.setItem('bnth.noteTab', tab); rerender();
  }));
  const s = root.querySelector('#note-search');
  if (s) {
    let t;
    s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = s.value.trim(); rerender(true); }, 150); });
  }
  root.querySelector('[data-note-new]')?.addEventListener('click', (e) => openNote(null, { checklist: !!e.target.closest('[data-note-new-check]') }));
  root.querySelectorAll('[data-note]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button,a')) return;
      openNote(el.dataset.note);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openNote(el.dataset.note); });
  });
  root.querySelectorAll('.note [data-photo]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openPhoto(b.dataset.photo, b.dataset.noteOf); }));
  root.querySelectorAll('[data-note-check]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [id, idx] = b.dataset.noteCheck.split(':');
    const n = store.get('ghi_chu', id);
    const lines = String(n.noi_dung || '').split('\n');
    lines[+idx] = lines[+idx].replace(/\[( )\]/, '[x]');
    b.classList.add('done');
    try { await store.update('ghi_chu', id, { noi_dung: lines.join('\n') }); } catch (err) { errorToast(err); }
  }));
  root.querySelectorAll('[data-prompt-use]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); usePrompt(b.dataset.promptUse, copyText); }));
  root.querySelector('[data-prompt-starter]')?.addEventListener('click', () => addStarterPrompts());
  root.querySelectorAll('[data-note-copy]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const n = store.get('ghi_chu', b.dataset.noteCopy);
    if (await copyText(noteText(n))) { b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1200); toast('Đã sao chép'); }
  }));
  root.querySelector('[data-note-paste]')?.addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* bị từ chối quyền */ }
    if (!text.trim()) { openNote(null); toast('Không đọc được bộ nhớ tạm, hãy dán bằng tay (giữ ngón tay → Dán).'); return; }
    const isUrl = /^https?:\/\/\S+$/.test(text.trim());
    const firstLine = text.trim().split('\n')[0];
    const data = {
      tieu_de: isUrl ? '' : (firstLine.length <= 80 && text.includes('\n') ? firstLine : ''),
      noi_dung: isUrl ? '' : text.trim(), url: isUrl ? text.trim() : '',
      nhan: [tab === '#3_Archive' ? tab : INBOX], loai: isUrl ? 'Liên kết' : 'Ghi chú'
    };
    if (!data.url) delete data.url;
    try {
      const rec = await store.create('ghi_chu', data);
      toast('Đã dán thành ghi chú mới', { kind: 'ok', actionLabel: 'Hoàn tác', onAction: () => rec && store.archive('ghi_chu', rec.id) });
    } catch (err) { errorToast(err); }
  });
  root.querySelectorAll('[data-note-pin]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const n = store.get('ghi_chu', b.dataset.notePin);
    try { await store.update('ghi_chu', n.id, { ghim: !n.ghim }); } catch (err) { errorToast(err); }
  }));
  root.querySelectorAll('[data-note-proj]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const [id, pid] = b.dataset.noteProj.split('|');
    const n = store.get('ghi_chu', id); const d = store.get('du_an', pid);
    const before = { nhan: n.nhan || [], du_an_id: n.du_an_id || '' };
    store.update('ghi_chu', id, { du_an_id: pid, nhan: ['#1_Work', ...extraLabels(n)] }).catch(errorToast);
    toast(`Đã xếp vào 📁 ${d.ten}`, { actionLabel: 'Hoàn tác', onAction: () => store.update('ghi_chu', id, before) });
  }));
  root.querySelectorAll('[data-note-move]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [id, key] = b.dataset.noteMove.split('|');
    const n = store.get('ghi_chu', id);
    const before = n.nhan || [];
    try {
      await store.update('ghi_chu', id, { nhan: [key, ...extraLabels(n)] });
      toast(key === '#3_Archive' ? 'Đã lưu trữ' : 'Đã bỏ lưu trữ', { actionLabel: 'Hoàn tác', onAction: () => store.update('ghi_chu', id, { nhan: before }) });
    } catch (err) { errorToast(err); }
  }));
}

// ---------------- Trình soạn (tự lưu khi đóng, như Keep) ----------------
export function openNote(id, { checklist = false, defaults = {} } = {}) {
  let n = id ? store.get('ghi_chu', id) : null;
  const startLabel = tab === PROMPT_LABEL || tab === '#3_Archive' ? tab : INBOX;
  const st = {
    tieu_de: n?.tieu_de || defaults.tieu_de || '',
    noi_dung: n?.noi_dung || defaults.noi_dung || '',
    mau: n?.mau || 'Trắng',
    ghim: !!n?.ghim,
    nhan: n ? [...(n.nhan || [])] : [startLabel],
    url: n?.url || '',
    checklist: n ? isChecklist(n) : checklist,
    loai: n?.loai && n.loai !== 'Checklist' ? n.loai : (tab === KHOI_TAB ? KHOI : tab === CH_TAB ? CAU_HOI : defaults.loai || 'Ghi chú'),
    tom_tat: n?.tom_tat || '', ly_do: n?.ly_do || '', cau_hoi_id: n?.cau_hoi_id || '', du_an_id: n?.du_an_id || defaults.du_an_id || '',
    linh_vuc_id: n?.linh_vuc_id || defaults.linh_vuc_id || ''
  };
  st.place = n ? paraOf(n) : defaults.du_an_id ? '@du_an' : PARA_KEYS.includes(tab) && tab !== '@du_an' && tab !== '@linh_vuc' ? tab : INBOX;
  if (!n && !st.nhan.length) st.nhan = [INBOX];
  let items = parseChecklist(st.noi_dung).filter((l) => l.done !== null || l.text.trim()).map((l) => ({ done: !!l.done, text: l.text }));

  const box = document.createElement('div');
  box.className = 'note-editor';
  const sheet = openSheet(box, { title: n ? 'Ghi chú' : 'Ghi chú mới', onClose: save });
  sheet.el.querySelector('.sheet').classList.add(colorClass(st.mau));

  function render() {
    const cur = mainLabel({ nhan: st.nhan });
    box.innerHTML = html`
      <input class="ne-title" placeholder="Tiêu đề" value="${st.tieu_de}" aria-label="Tiêu đề">
      ${st.checklist
        ? html`<ul class="ne-items">${items.map((it, i) => html`<li class="${it.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${it.done ? raw('checked') : ''} aria-label="Xong"><input class="ne-item" data-i="${i}" value="${it.text}" placeholder="Mục"><button class="icon-btn sm" data-del="${i}" aria-label="Xóa mục">✕</button></li>`)}
            <li class="ne-add"><span>＋</span><input class="ne-new" placeholder="Thêm mục" enterkeyhint="next"></li></ul>`
        : html`<div class="ne-fmt"><button class="chip" data-wrap="**" title="In đậm đoạn đang chọn (lớp 2)"><b>B</b> đậm</button><button class="chip" data-wrap="==" title="Tô sáng đoạn tinh túy nhất (lớp 3)"><mark>Tô sáng</mark></button>${speechOK() ? html`<button class="chip" data-voice>🎤 Nói</button>` : ''}<span class="tag tag-layer">Lớp ${layer(st)}</span></div>
          <textarea class="ne-body" placeholder="Ghi chú…" rows="8">${st.noi_dung}</textarea>`}
      <div class="ne-photos">${stripHtml(n ? store.get('ghi_chu', n.id) || n : null, { editable: true })}</div>
      <details class="ne-distill" ${st.tom_tat || st.ly_do || !n ? 'open' : ''}><summary>Chắt lọc & sắp xếp</summary>
        <label class="ne-lab2">Vì sao đáng nhớ?<input class="ne-why" value="${st.ly_do}" placeholder="Điều làm mình thấy “à há”…"></label>
        <label class="ne-lab2">Tóm tắt (lớp 4, 1–3 dòng bằng lời của mình)<textarea class="ne-sum" rows="2">${st.tom_tat}</textarea></label>
        <div class="ne-row"><span class="ne-lab">Loại</span>${['Ghi chú', 'Kiến thức', 'Biên bản họp', KHOI, CAU_HOI].map((l) => html`<button class="chip ${st.loai === l ? 'on' : ''}" data-loai="${l}">${l}</button>`)}</div>
        ${st.loai !== CAU_HOI ? html`<label class="ne-lab2">Gắn với câu hỏi lớn<select class="ne-q"><option value="">—</option>${store.all('ghi_chu').filter((q) => q.loai === CAU_HOI).map((q) => html`<option value="${q.id}" ${q.id === st.cau_hoi_id ? raw('selected') : ''}>${q.tieu_de || q.noi_dung.slice(0, 60)}</option>`)}</select></label>` : ''}
      </details>
      <input class="ne-url" type="url" placeholder="Liên kết (tùy chọn)" value="${st.url}">
      <div class="ne-row ne-para"><span class="ne-lab">Xếp vào</span>${PARA.map((l) => html`<button class="chip ${st.place === l.key ? 'on' : ''}" data-place="${l.key}">${icon(l.ic)} ${l.name}</button>`)}</div>
      ${st.place === INBOX && n ? html`${suggestProjects({ ...n, tieu_de: st.tieu_de, noi_dung: st.noi_dung }).map((d) => html`<button class="n-suggest" data-place-proj="${d.id}">Gợi ý: xếp vào 📁 ${d.ten}</button>`)}` : ''}
      ${st.place === '@du_an' ? html`<label class="ne-lab2">Dự án sẽ dùng ghi chú này<select class="ne-proj"><option value="">— chọn dự án —</option>${store.all('du_an').filter((d) => (d.trang_thai !== 'Xong' && d.trang_thai !== 'Ý tưởng') || d.id === st.du_an_id).map((d) => html`<option value="${d.id}" ${d.id === st.du_an_id ? raw('selected') : ''}>${d.ten}</option>`)}</select></label>` : ''}
      ${st.place === '@linh_vuc' ? html`<label class="ne-lab2">Lĩnh vực<select class="ne-area"><option value="">— chọn lĩnh vực —</option>${store.all('linh_vuc').sort((a, b) => (a.thu_tu || 99) - (b.thu_tu || 99)).map((a) => html`<option value="${a.id}" ${a.id === st.linh_vuc_id ? raw('selected') : ''}>${a.bieu_tuong || ''} ${a.ten}</option>`)}</select></label>` : ''}
      ${st.place === '@tai_nguyen' ? html`<p class="hint">Tài nguyên: thêm một nhãn chủ đề bên dưới (vd: Luật lao động, Mẫu văn bản, HSK) để dễ tìm lại.</p>` : ''}
      <div class="ne-row"><span class="ne-lab">Chủ đề</span>${extraLabels({ nhan: st.nhan }).map((x) => html`<button class="chip on" data-rm-label="${x}">${x} ✕</button>`)}<input class="ne-label" placeholder="vd: Guitar, Running" list="ne-labels"><datalist id="ne-labels">${[...new Set(store.all('ghi_chu').flatMap(extraLabels))].map((x) => html`<option value="${x}">`)}</datalist></div>
      <div class="ne-row colors" role="radiogroup" aria-label="Màu">${COLORS.map((c) => html`<button class="swatch ${colorClass(c)} ${st.mau === c ? 'on' : ''}" data-color="${c}" title="${c}" aria-label="${c}"></button>`)}</div>
      <div class="ne-toolbar">
        <label class="btn btn-ghost ne-addph">📷 Ảnh<input type="file" accept="image/*" multiple hidden data-ph-input></label>
        <button class="btn btn-ghost" data-pin>${st.ghim ? '📌 Bỏ ghim' : '📌 Ghim'}</button>
        ${st.nhan.includes(PROMPT_LABEL) ? html`<button class="btn btn-ghost" data-addvar>{{ }} Chèn chỗ trống</button>` : ''}
        <button class="btn btn-ghost" data-copy>${icon('copy')} Sao chép</button>
        <button class="btn btn-ghost" data-mode>${st.checklist ? '📝 Văn bản' : '☑️ Danh sách'}</button>
        ${n ? html`<button class="btn btn-ghost" data-totask>✅ Tạo việc</button><button class="btn btn-ghost danger" data-trash>🗑 Xóa</button>` : ''}
        <span class="spacer"></span><button class="btn btn-primary" data-done>Xong</button>
      </div>
      ${n ? html`<p class="meta">Sửa ${whenLabel((n.updated_at || '').slice(0, 10), { overdue: false })} · ${n.nguon || ''}</p>` : ''}`.__raw;
    wire();
  }

  function collect() {
    st.tieu_de = box.querySelector('.ne-title').value;
    st.url = box.querySelector('.ne-url').value.trim();
    if (st.checklist) {
      box.querySelectorAll('.ne-item').forEach((inp) => { items[+inp.dataset.i].text = inp.value; });
      const extra = box.querySelector('.ne-new')?.value.trim();
      if (extra) { items.push({ done: false, text: extra }); box.querySelector('.ne-new').value = ''; }
      st.noi_dung = toChecklistText(items);
    } else {
      st.noi_dung = box.querySelector('.ne-body').value;
    }
    st.tom_tat = box.querySelector('.ne-sum')?.value ?? st.tom_tat;
    st.ly_do = box.querySelector('.ne-why')?.value ?? st.ly_do;
    st.du_an_id = box.querySelector('.ne-proj')?.value ?? st.du_an_id;
    st.linh_vuc_id = box.querySelector('.ne-area')?.value ?? st.linh_vuc_id;
    st.cau_hoi_id = box.querySelector('.ne-q')?.value ?? st.cau_hoi_id;
    const lab = box.querySelector('.ne-label')?.value.trim().replace(/,/g, ' ');
    if (lab && !st.nhan.includes(lab)) st.nhan.push(lab);
  }

  function wire() {
    const body = box.querySelector('.ne-body');
    if (body) { const grow = () => { body.style.height = 'auto'; body.style.height = Math.min(body.scrollHeight + 2, window.innerHeight * 0.55) + 'px'; }; body.addEventListener('input', grow); grow(); }
    box.querySelectorAll('[data-place]').forEach((b) => b.onclick = () => { collect(); st.place = b.dataset.place; render(); });
    box.querySelectorAll('[data-place-proj]').forEach((b) => b.onclick = () => { collect(); st.place = '@du_an'; st.du_an_id = b.dataset.placeProj; render(); });
    box.querySelectorAll('[data-rm-label]').forEach((b) => b.onclick = () => { collect(); st.nhan = st.nhan.filter((x) => x !== b.dataset.rmLabel); render(); });
    box.querySelector('.ne-label')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); collect(); render(); box.querySelector('.ne-label').focus(); } });
    box.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => {
      collect();
      const sh = sheet.el.querySelector('.sheet'); sh.classList.remove(colorClass(st.mau));
      st.mau = b.dataset.color; sh.classList.add(colorClass(st.mau)); render();
    });
    box.querySelector('[data-pin]').onclick = () => { collect(); st.ghim = !st.ghim; render(); };
    box.querySelectorAll('[data-loai]').forEach((b) => b.onclick = () => { collect(); st.loai = b.dataset.loai; render(); });
    box.querySelectorAll('[data-wrap]').forEach((b) => b.onclick = () => {
      const ta = box.querySelector('.ne-body'); const w = b.dataset.wrap; const a = ta.selectionStart, z = ta.selectionEnd;
      if (a === z) { toast('Chọn (bôi đen) đoạn chữ trước'); return; }
      ta.value = ta.value.slice(0, a) + w + ta.value.slice(a, z) + w + ta.value.slice(z); collect(); render();
    });
    box.querySelector('[data-voice]')?.addEventListener('click', (e) => dictate(e.currentTarget, box.querySelector('.ne-body')));
    box.querySelector('[data-mode]').onclick = () => {
      collect();
      if (st.checklist) { st.noi_dung = items.map((i) => i.text).join('\n'); st.checklist = false; }
      else { items = st.noi_dung.split('\n').filter((x) => x.trim()).map((t) => ({ done: false, text: t.replace(/^\s*[-*•]\s*/, '') })); st.checklist = true; }
      render();
    };
    box.querySelectorAll('.ne-items input[type=checkbox]').forEach((c) => c.onchange = () => { collect(); items[+c.dataset.i].done = c.checked; render(); });
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { collect(); items.splice(+b.dataset.del, 1); render(); });
    const nw = box.querySelector('.ne-new');
    nw?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); collect(); render(); box.querySelector('.ne-new').focus(); } });
    box.querySelector('[data-done]').onclick = () => sheet.close();
    box.querySelector('[data-copy]').onclick = async () => { collect(); if (await copyText(noteText(st))) toast('Đã sao chép'); };
    box.querySelector('[data-addvar]')?.addEventListener('click', () => {
      const ta = box.querySelector('.ne-body'); if (!ta) return;
      const name = prompt('Tên chỗ trống (ví dụ: đơn vị nhận, hạn, nội dung)'); if (!name) return;
      const ins = `{{${name.trim()}}}`; const a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + ins + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + ins.length;
    });
    box.querySelector('[data-trash]')?.addEventListener('click', async () => {
      closing = 'trash';
      sheet.close();
      try {
        await store.archive('ghi_chu', n.id);
        toast('Đã xóa ghi chú', { actionLabel: 'Hoàn tác', onAction: () => store.restore('ghi_chu', n.id) });
      } catch (err) { errorToast(err); }
    });
    box.querySelector('[data-totask]')?.addEventListener('click', async () => {
      collect();
      try {
        await store.create('viec', { ten: st.tieu_de || st.noi_dung.split('\n')[0].slice(0, 120), mo_ta: st.noi_dung });
        toast('Đã tạo việc từ ghi chú', { kind: 'ok' });
      } catch (err) { errorToast(err); }
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sheet.close(); });
    box.querySelector('[data-ph-input]').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; attach(fs); };
    box.querySelectorAll('[data-photo]').forEach((b) => b.onclick = () => openPhoto(b.dataset.photo, n?.id));
  }

  /** Trường lưu theo nơi PARA đã chọn. */
  function placeData() {
    const extra = extraLabels({ nhan: st.nhan });
    let place = st.place;
    if (place === '@du_an' && !st.du_an_id) place = INBOX;      // chưa chọn dự án: để Inbox
    if (place === '@linh_vuc' && !st.linh_vuc_id) place = INBOX;
    if (place === INBOX) return { nhan: [INBOX, ...extra], du_an_id: '', linh_vuc_id: '' };
    if (place === '#3_Archive') return { nhan: ['#3_Archive', ...extra], du_an_id: st.du_an_id, linh_vuc_id: st.linh_vuc_id };
    if (place === '@du_an') return { nhan: [SORTED, ...extra], du_an_id: st.du_an_id, linh_vuc_id: store.get('du_an', st.du_an_id)?.linh_vuc_id || st.linh_vuc_id || '' };
    if (place === '@linh_vuc') return { nhan: [SORTED, ...extra], du_an_id: '', linh_vuc_id: st.linh_vuc_id };
    return { nhan: [SORTED, ...extra], du_an_id: '', linh_vuc_id: '' };
  }

  // Ảnh: ghi chú mới thì lưu nháp trước để có mã, rồi xếp ảnh vào hàng gửi.
  async function ensureNote() {
    if (n) return n;
    collect();
    const data = {
      tieu_de: st.tieu_de.trim() || (st.noi_dung.trim() ? '' : 'Ảnh ' + new Date().toLocaleDateString('vi-VN')), noi_dung: st.noi_dung, mau: st.mau, ghim: st.ghim,
      loai: st.checklist ? 'Checklist' : st.loai, ...placeData()
    };
    ['du_an_id', 'linh_vuc_id'].forEach((k) => { if (!data[k]) delete data[k]; });
    try {
      const rec = await store.create('ghi_chu', data);
      if (!rec) { toast('Đang mất mạng: lưu ghi chú trước rồi thêm ảnh sau nhé.', { kind: 'error' }); return null; }
      n = rec; st.tieu_de = rec.tieu_de;
      return n;
    } catch (err) { errorToast(err); return null; }
  }
  async function attach(files) {
    if (!files.length) return;
    const note = await ensureNote();
    if (!note) return;
    collect();
    toast(`Đang nén ${files.length} ảnh…`);
    await addPhotos(note.id, files);
    render();
  }
  box.addEventListener('paste', (e) => {
    const fs = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
    if (fs.length) { e.preventDefault(); attach(fs); }
  });
  const refreshStrip = () => { const el = box.querySelector('.ne-photos'); if (el && n && box.isConnected) el.innerHTML = stripHtml(store.get('ghi_chu', n.id) || n, { editable: true })?.__raw || ''; box.querySelectorAll('[data-photo]').forEach((b) => b.onclick = () => openPhoto(b.dataset.photo, n?.id)); };
  onPhotos(refreshStrip);

  let closing = null;
  async function save() {
    if (closing === 'trash') return;
    try { collect(); } catch { return; }
    const data = {
      tieu_de: st.tieu_de.trim(), noi_dung: st.noi_dung, mau: st.mau, ghim: st.ghim, url: st.url,
      loai: st.checklist ? 'Checklist' : st.loai, tom_tat: st.tom_tat.trim(), ly_do: st.ly_do.trim(), cau_hoi_id: st.cau_hoi_id, ...placeData()
    };
    try {
      if (n) {
        const diff = {};
        for (const k of Object.keys(data)) if (JSON.stringify(n[k] ?? '') !== JSON.stringify(data[k] ?? '')) diff[k] = data[k];
        if (Object.keys(diff).length) await store.update('ghi_chu', n.id, diff);
      } else {
        if (!data.tieu_de && !data.noi_dung.trim()) return; // ghi chú trống: bỏ, như Keep
        ['url', 'tom_tat', 'ly_do', 'du_an_id', 'linh_vuc_id', 'cau_hoi_id'].forEach((k) => { if (!data[k]) delete data[k]; });
        await store.create('ghi_chu', data);
        toast(`Đã lưu vào ${paraName(paraOf(data))}`, { kind: 'ok' });
      }
    } catch (err) { errorToast(err); }
  }

  render();
  setTimeout(() => (n ? null : (box.querySelector('.ne-new') || box.querySelector('.ne-body'))?.focus()), 80);
  return sheet;
}

// ---------- Ghi bằng giọng nói (Web Speech API, tiếng Việt) ----------
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechOK = () => !!SR();
let rec = null;
export function dictate(btn, ta) {
  if (rec) { rec.stop(); return; }
  const R = SR(); if (!R) return;
  rec = new R(); rec.lang = 'vi-VN'; rec.continuous = true; rec.interimResults = false;
  btn.textContent = '⏺ Đang nghe… chạm để dừng'; btn.classList.add('on');
  rec.onresult = (e) => {
    let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
    if (t) { ta.value = (ta.value ? ta.value.replace(/\s*$/, ' ') : '') + t.trim(); ta.dispatchEvent(new Event('input')); }
  };
  rec.onerror = (e) => toast('Không nghe được: ' + (e.error || ''));
  rec.onend = () => { rec = null; btn.textContent = '🎤 Nói'; btn.classList.remove('on'); };
  rec.start();
}

export const notesTab = () => tab;
export const setNotesTab = (t) => { tab = t; query = ''; localStorage.setItem('bnth.noteTab', t); };
export { esc };
