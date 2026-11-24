// Ghi chú kiểu Google Keep: tab nhãn #0_Inbox / #1_Work / #2_Life / #3_Archive, lưới thẻ, ghim, màu,
// checklist tick ngay trên thẻ, trình soạn tự lưu khi đóng.
import * as store from './store.js';
import { html, raw, esc, fold, whenLabel } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';

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
  } else if (tab !== 'all') {
    notes = notes.filter((n) => (MAIN_KEYS.includes(tab) ? mainLabel(n) === tab : (n.nhan || []).includes(tab)));
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
    body = text ? html`<div class="n-text">${text.length > 600 ? text.slice(0, 600) + '…' : text}</div>` : '';
  }
  const showMain = tab === 'all' || query;
  const tags = [...(showMain ? [mainLabel(n)] : []), ...extraLabels(n)];
  return html`<article class="note ${colorClass(n.mau)} ${n._pending ? 'is-pending' : ''}" data-note="${n.id}" tabindex="0">
    ${n.ghim ? html`<span class="n-pin" title="Đã ghim">${icon('pin')}</span>` : ''}
    ${n.tieu_de && n.tieu_de !== n.noi_dung ? html`<h3 class="n-title">${n.tieu_de}</h3>` : ''}
    ${body}
    ${n.url ? html`<a class="n-link" href="${n.url}" target="_blank" rel="noopener">🔗 ${n.url.replace(/^https?:\/\//, '').slice(0, 40)}</a>` : ''}
    ${tags.length ? html`<div class="n-tags">${tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : ''}
    <button class="n-copy" data-note-copy="${n.id}" title="Sao chép nội dung" aria-label="Sao chép nội dung">${icon('copy')}</button>
    <div class="n-actions">
      <button data-note-pin="${n.id}" title="${n.ghim ? 'Bỏ ghim' : 'Ghim'}">${icon('pin')}</button>
      ${MAIN_LABELS.filter((l) => l.key !== mainLabel(n)).map((l) => html`<button data-note-move="${n.id}|${l.key}" title="Chuyển sang ${l.key}">${icon(l.ic)}</button>`)}
    </div>
  </article>`;
}

export function notesView() {
  const all = store.all('ghi_chu');
  const counts = Object.fromEntries(MAIN_KEYS.map((k) => [k, all.filter((n) => mainLabel(n) === k).length]));
  const others = [...new Set(all.flatMap(extraLabels))].sort((a, b) => fold(a).localeCompare(fold(b)));
  const notes = visibleNotes();
  const pinned = notes.filter((n) => n.ghim), rest = notes.filter((n) => !n.ghim);
  const cur = MAIN_LABELS.find((l) => l.key === tab);
  return html`
    <header class="page-head notes-head"><h1>Ghi chú</h1>
      <input class="n-search" type="search" id="note-search" placeholder="Tìm trong ghi chú…" value="${query}" autocomplete="off"></header>
    <nav class="label-tabs" aria-label="Nhãn">
      ${MAIN_LABELS.map((l) => html`<button class="ltab ${tab === l.key && !query ? 'on' : ''}" data-note-tab="${l.key}" title="${l.hint}">${icon(l.ic)} ${l.key}<em>${counts[l.key]}</em></button>`)}
      <button class="ltab ${tab === 'all' && !query ? 'on' : ''}" data-note-tab="all">Tất cả<em>${all.length}</em></button>
      ${others.map((o) => html`<button class="ltab small ${tab === o && !query ? 'on' : ''}" data-note-tab="${o}">🏷 ${o}</button>`)}
    </nav>
    <div class="composer-row"><button class="composer" data-note-new>
      <span>${tab === '#3_Archive' ? 'Lưu một ghi chú tra cứu…' : 'Ghi chú mới…'}</span><span class="composer-icons"><i data-note-new-check title="Danh sách việc">${icon('list')}</i></span>
    </button><button class="paste-btn" data-note-paste title="Dán từ bộ nhớ tạm thành ghi chú mới">${icon('paste')}<span>Dán</span></button></div>
    ${query ? html`<p class="hint">${notes.length} ghi chú khớp “${query}” trong mọi nhãn.</p>` : cur ? html`<p class="hint">${cur.hint}</p>` : ''}
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
  const startLabel = MAIN_KEYS.includes(tab) ? tab : INBOX;
  const st = {
    tieu_de: n?.tieu_de || defaults.tieu_de || '',
    noi_dung: n?.noi_dung || defaults.noi_dung || '',
    mau: n?.mau || 'Trắng',
    ghim: !!n?.ghim,
    nhan: n ? [...(n.nhan || [])] : [startLabel],
    url: n?.url || '',
    checklist: n ? isChecklist(n) : checklist
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
        : html`<textarea class="ne-body" placeholder="Ghi chú…" rows="8">${st.noi_dung}</textarea>`}
      <input class="ne-url" type="url" placeholder="Liên kết (tùy chọn)" value="${st.url}">
      <div class="ne-row"><span class="ne-lab">Nhãn</span>${MAIN_LABELS.map((l) => html`<button class="chip ${cur === l.key ? 'on' : ''}" data-main="${l.key}">${icon(l.ic)} ${l.key}</button>`)}</div>
      <div class="ne-row"><span class="ne-lab">Thêm nhãn</span>${extraLabels({ nhan: st.nhan }).map((x) => html`<button class="chip on" data-rm-label="${x}">${x} ✕</button>`)}<input class="ne-label" placeholder="vd: Guitar, Running" list="ne-labels"><datalist id="ne-labels">${[...new Set(store.all('ghi_chu').flatMap(extraLabels))].map((x) => html`<option value="${x}">`)}</datalist></div>
      <div class="ne-row colors" role="radiogroup" aria-label="Màu">${COLORS.map((c) => html`<button class="swatch ${colorClass(c)} ${st.mau === c ? 'on' : ''}" data-color="${c}" title="${c}" aria-label="${c}"></button>`)}</div>
      <div class="ne-toolbar">
        <button class="btn btn-ghost" data-pin>${st.ghim ? '📌 Bỏ ghim' : '📌 Ghim'}</button>
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
      loai: st.checklist ? 'Checklist' : (n?.loai === 'Checklist' ? 'Ghi chú' : n?.loai || 'Ghi chú')
    };
    try {
      if (n) {
        const diff = {};
        for (const k of Object.keys(data)) if (JSON.stringify(n[k] ?? '') !== JSON.stringify(data[k] ?? '')) diff[k] = data[k];
        if (Object.keys(diff).length) await store.update('ghi_chu', n.id, diff);
      } else {
        if (!data.tieu_de && !data.noi_dung.trim()) return; // ghi chú trống: bỏ, như Keep
        if (!data.url) delete data.url;
        await store.create('ghi_chu', data);
        toast(`Đã lưu vào ${mainLabel(data)}`, { kind: 'ok' });
      }
    } catch (err) { errorToast(err); }
  }

  render();
  setTimeout(() => (n ? null : (box.querySelector('.ne-new') || box.querySelector('.ne-body'))?.focus()), 80);
  return sheet;
}

export const notesTab = () => tab;
export { esc };
