// Ghi chú kiểu Google Keep: tab nhãn #0_Inbox / #1_Work / #2_Life / #3_Archive, lưới thẻ, ghim, màu,
// checklist tick ngay trên thẻ, trình soạn tự lưu khi đóng.
import * as store from './store.js';
import { html, raw, esc, fold, whenLabel } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
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
let query = '';

/** Nhãn chính của ghi chú (một trong 4); không có thì coi như Inbox. */
export function mainLabel(n) {
  const lbs = (n.nhan || []).map((x) => x.trim());
  for (const k of MAIN_KEYS) if (lbs.some((x) => fold(x) === fold(k))) return k;
  return INBOX;
}
const extraLabels = (n) => (n.nhan || []).filter((x) => !MAIN_KEYS.some((k) => fold(k) === fold(x)));

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
    notes = notes.filter((n) => !isPrompt(n) && !isSpecial(n) && (MAIN_KEYS.includes(tab) ? mainLabel(n) === tab : (n.nhan || []).includes(tab)));
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
  const tags = [...(showMain ? [mainLabel(n)] : []), ...extraLabels(n).filter((x) => x !== PROMPT_LABEL || tab !== PROMPT_LABEL)];
  if (isPrompt(n)) body = html`<div class="n-text n-prompt">${String(n.noi_dung || '').slice(0, 280)}${String(n.noi_dung || '').length > 280 ? '…' : ''}</div>${promptCardExtra(n)}`;
  return html`<article class="note ${isPrompt(n) ? 'is-prompt' : ''} ${colorClass(n.mau)} ${n._pending ? 'is-pending' : ''}" data-note="${n.id}" tabindex="0">
    ${n.ghim ? html`<span class="n-pin" title="Đã ghim">${icon('pin')}</span>` : ''}
    ${n.tieu_de && n.tieu_de !== n.noi_dung ? html`<h3 class="n-title">${n.tieu_de}</h3>` : ''}
    ${body}
    ${n.url ? html`<a class="n-link" href="${n.url}" target="_blank" rel="noopener">🔗 ${n.url.replace(/^https?:\/\//, '').slice(0, 40)}</a>` : ''}
    ${tags.length || layer(n) > 1 || n.loai === CAU_HOI ? html`<div class="n-tags">${layer(n) > 1 && !isPrompt(n) ? html`<span class="tag tag-layer" title="Lớp chắt lọc">L${layer(n)}</span>` : ''}${n.loai === CAU_HOI ? html`<span class="tag">🔗 ${store.all('ghi_chu').filter((x) => x.cau_hoi_id === n.id).length} ghi chú</span>` : ''}${tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : ''}
    ${n.du_an_id && store.get('du_an', n.du_an_id) ? html`<div class="n-tags"><span class="tag">📁 ${store.get('du_an', n.du_an_id).ten}</span></div>` : ''}
    ${mainLabel(n) === INBOX && !isPrompt(n) && !isSpecial(n) ? html`${suggestProjects(n).map((d) => html`<button class="n-suggest" data-note-proj="${n.id}|${d.id}">Xếp vào 📁 ${d.ten}</button>`)}` : ''}
    <button class="n-copy" data-note-copy="${n.id}" title="Sao chép nội dung" aria-label="Sao chép nội dung">${icon('copy')}</button>
    <div class="n-actions">
      <button data-note-pin="${n.id}" title="${n.ghim ? 'Bỏ ghim' : 'Ghim'}">${icon('pin')}</button>
      ${MAIN_LABELS.filter((l) => l.key !== mainLabel(n)).map((l) => html`<button data-note-move="${n.id}|${l.key}" title="Chuyển sang ${l.key}">${icon(l.ic)}</button>`)}
    </div>
  </article>`;
}

export function notesView() {
  const all = store.all('ghi_chu');
  const plain = all.filter((n) => !isPrompt(n) && !isSpecial(n));
  const prompts = all.filter(isPrompt);
  const counts = Object.fromEntries(MAIN_KEYS.map((k) => [k, plain.filter((n) => mainLabel(n) === k).length]));
  const others = [...new Set(plain.flatMap(extraLabels))].sort((a, b) => fold(a).localeCompare(fold(b)));
  const isPromptTab = tab === PROMPT_LABEL && !query;
  const notes = visibleNotes();
  const pinned = notes.filter((n) => n.ghim), rest = notes.filter((n) => !n.ghim);
  const cur = MAIN_LABELS.find((l) => l.key === tab);
  return html`
    <header class="page-head notes-head"><h1>Ghi chú</h1>
      <input class="n-search" type="search" id="note-search" placeholder="Tìm trong ghi chú…" value="${query}" autocomplete="off"></header>
    <nav class="label-tabs" aria-label="Nhãn">
      ${MAIN_LABELS.map((l) => html`<button class="ltab ${tab === l.key && !query ? 'on' : ''}" data-note-tab="${l.key}" title="${l.hint}">${icon(l.ic)} ${l.key}<em>${counts[l.key]}</em></button>`)}
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
    ${pinned.length ? html`<h4 class="n-group">Đã ghim</h4><div class="masonry">${pinned.map(card)}</div>` : ''}
    ${pinned.length && rest.length ? html`<h4 class="n-group">Khác</h4>` : ''}
    ${rest.length ? html`<div class="masonry">${rest.map(card)}</div>` : ''}
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
      nhan: [MAIN_KEYS.includes(tab) ? tab : INBOX], loai: isUrl ? 'Liên kết' : 'Ghi chú'
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
      toast(`Đã chuyển sang ${key}`, { actionLabel: 'Hoàn tác', onAction: () => store.update('ghi_chu', id, { nhan: before }) });
    } catch (err) { errorToast(err); }
  }));
}

// ---------------- Trình soạn (tự lưu khi đóng, như Keep) ----------------
export function openNote(id, { checklist = false, defaults = {} } = {}) {
  const n = id ? store.get('ghi_chu', id) : null;
  const startLabel = MAIN_KEYS.includes(tab) || tab === PROMPT_LABEL ? tab : INBOX;
  const st = {
    tieu_de: n?.tieu_de || defaults.tieu_de || '',
    noi_dung: n?.noi_dung || defaults.noi_dung || '',
    mau: n?.mau || 'Trắng',
    ghim: !!n?.ghim,
    nhan: n ? [...(n.nhan || [])] : [startLabel],
    url: n?.url || '',
    checklist: n ? isChecklist(n) : checklist,
    loai: n?.loai && n.loai !== 'Checklist' ? n.loai : (tab === KHOI_TAB ? KHOI : tab === CH_TAB ? CAU_HOI : defaults.loai || 'Ghi chú'),
    tom_tat: n?.tom_tat || '', ly_do: n?.ly_do || '', cau_hoi_id: n?.cau_hoi_id || '', du_an_id: n?.du_an_id || defaults.du_an_id || ''
  };
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
      <details class="ne-distill" ${st.tom_tat || st.ly_do || !n ? 'open' : ''}><summary>Chắt lọc & sắp xếp</summary>
        <label class="ne-lab2">Vì sao đáng nhớ?<input class="ne-why" value="${st.ly_do}" placeholder="Điều làm mình thấy “à há”…"></label>
        <label class="ne-lab2">Tóm tắt (lớp 4, 1–3 dòng bằng lời của mình)<textarea class="ne-sum" rows="2">${st.tom_tat}</textarea></label>
        <div class="ne-row"><span class="ne-lab">Loại</span>${['Ghi chú', 'Kiến thức', 'Biên bản họp', KHOI, CAU_HOI].map((l) => html`<button class="chip ${st.loai === l ? 'on' : ''}" data-loai="${l}">${l}</button>`)}</div>
        <label class="ne-lab2">Dự án (xếp theo việc sẽ dùng)<select class="ne-proj"><option value="">—</option>${store.all('du_an').filter((d) => d.trang_thai !== 'Xong' || d.id === st.du_an_id).map((d) => html`<option value="${d.id}" ${d.id === st.du_an_id ? raw('selected') : ''}>${d.ten}</option>`)}</select></label>
        ${st.loai !== CAU_HOI ? html`<label class="ne-lab2">Gắn với câu hỏi lớn<select class="ne-q"><option value="">—</option>${store.all('ghi_chu').filter((q) => q.loai === CAU_HOI).map((q) => html`<option value="${q.id}" ${q.id === st.cau_hoi_id ? raw('selected') : ''}>${q.tieu_de || q.noi_dung.slice(0, 60)}</option>`)}</select></label>` : ''}
      </details>
      <input class="ne-url" type="url" placeholder="Liên kết (tùy chọn)" value="${st.url}">
      <div class="ne-row"><span class="ne-lab">Nhãn</span>${MAIN_LABELS.map((l) => html`<button class="chip ${cur === l.key ? 'on' : ''}" data-main="${l.key}">${icon(l.ic)} ${l.key}</button>`)}</div>
      <div class="ne-row"><span class="ne-lab">Thêm nhãn</span>${extraLabels({ nhan: st.nhan }).map((x) => html`<button class="chip on" data-rm-label="${x}">${x} ✕</button>`)}<input class="ne-label" placeholder="vd: Guitar, Running" list="ne-labels"><datalist id="ne-labels">${[...new Set(store.all('ghi_chu').flatMap(extraLabels))].map((x) => html`<option value="${x}">`)}</datalist></div>
      <div class="ne-row colors" role="radiogroup" aria-label="Màu">${COLORS.map((c) => html`<button class="swatch ${colorClass(c)} ${st.mau === c ? 'on' : ''}" data-color="${c}" title="${c}" aria-label="${c}"></button>`)}</div>
      <div class="ne-toolbar">
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
    st.cau_hoi_id = box.querySelector('.ne-q')?.value ?? st.cau_hoi_id;
    const lab = box.querySelector('.ne-label')?.value.trim().replace(/,/g, ' ');
    if (lab && !st.nhan.includes(lab)) st.nhan.push(lab);
  }

  function wire() {
    const body = box.querySelector('.ne-body');
    if (body) { const grow = () => { body.style.height = 'auto'; body.style.height = Math.min(body.scrollHeight + 2, window.innerHeight * 0.55) + 'px'; }; body.addEventListener('input', grow); grow(); }
    box.querySelectorAll('[data-main]').forEach((b) => b.onclick = () => { collect(); st.nhan = [b.dataset.main, ...extraLabels({ nhan: st.nhan })]; render(); });
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
  }

  let closing = null;
  async function save() {
    if (closing === 'trash') return;
    try { collect(); } catch { return; }
    const data = {
      tieu_de: st.tieu_de.trim(), noi_dung: st.noi_dung, mau: st.mau, ghim: st.ghim, nhan: st.nhan, url: st.url,
      loai: st.checklist ? 'Checklist' : st.loai, tom_tat: st.tom_tat.trim(), ly_do: st.ly_do.trim(), du_an_id: st.du_an_id, cau_hoi_id: st.cau_hoi_id
    };
    try {
      if (n) {
        const diff = {};
        for (const k of Object.keys(data)) if (JSON.stringify(n[k] ?? '') !== JSON.stringify(data[k] ?? '')) diff[k] = data[k];
        if (Object.keys(diff).length) await store.update('ghi_chu', n.id, diff);
      } else {
        if (!data.tieu_de && !data.noi_dung.trim()) return; // ghi chú trống: bỏ, như Keep
        ['url', 'tom_tat', 'ly_do', 'du_an_id', 'cau_hoi_id'].forEach((k) => { if (!data[k]) delete data[k]; });
        await store.create('ghi_chu', data);
        toast(`Đã lưu vào ${mainLabel(data)}`, { kind: 'ok' });
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
export { esc };
