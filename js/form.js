// Mở/sửa/tạo bản ghi bất kỳ bằng biểu mẫu sinh từ lược đồ máy chủ.
import * as store from './store.js';
import { call } from './api.js';
import { html, raw, esc, fold, whenLabel, fmtDate } from './util.js';
import { openSheet, label, TABLE_META, toast, errorToast, closeSheet } from './ui.js';

// Trường hiện trước, theo bảng (còn lại xếp sau, trong mục "Thêm").
const PRIMARY = {
  viec: ['ten', 'han', 'gap', 'quan_trong', 'trang_thai', 'linh_vuc_id', 'du_an_id', 'mo_ta'],
  van_ban: ['so_hieu', 'trich_yeu', 'han_xu_ly', 'vai_tro', 'trang_thai', 'loai', 'chieu', 'but_phe', 'link_doffice', 'yeu_cau_dv_gui'],
  su_kien: ['ten', 'bat_dau', 'ket_thuc', 'dia_diem', 'trang_thai', 'ket_qua', 'loai', 'mo_ta', 'nhac_truoc_phut'],
  ghi_chu: ['tieu_de', 'noi_dung', 'loai', 'nhan', 'ghim', 'url'],
  dia_diem: ['ten', 'dia_chi', 'loai', 'trang_thai', 'danh_gia', 'mon_nen_thu', 'ghi_chu', 'link_goc'],
  nguoi: ['ten', 'don_vi', 'chuc_vu', 'dien_thoai', 'email', 'ghi_chu'],
  du_an: ['ten', 'trang_thai', 'han', 'linh_vuc_id', 'ket_qua', 'mo_ta'],
  inbox: ['noi_dung', 'da_xu_ly'],
  linh_vuc: ['ten', 'nhom', 'bieu_tuong', 'thu_tu', 'mo_ta'],
  don_vi: ['ten', 'loai', 'dau_moi', 'dien_thoai', 'email', 'ghi_chu'],
  chuyen_di: ['ten', 'diem_den', 'tu_ngay', 'den_ngay', 'trang_thai', 'loai', 'phuong_tien', 'di_cung', 'ngan_sach', 'chi_phi', 'danh_gia', 'album', 'ghi_chu'],
  thoi_quen: ['ten', 'bieu_tuong', 'tan_suat', 'ngay_trong_tuan', 'so_lan_tuan', 'gio_nhac', 'thoi_luong_phut', 'muc_tieu', 'bat_dau', 'trang_thai'],
  lo_trinh: ['ten', 'loai', 'muc_tieu', 'bat_dau', 'so_tuan', 'thoi_quen_id', 'trang_thai', 'cach_hoc', 'mo_ta'],
  buoi_hoc: ['tieu_de', 'ngay', 'gio', 'tuan', 'thu_tu', 'muc_tieu', 'noi_dung', 'bai_tap', 'tai_lieu', 'trang_thai'],
  nhat_ky_chuyen_di: ['ngay', 'tieu_de', 'noi_dung', 'tam_trang', 'dia_diem_ids', 'chi_tieu', 'chuyen_di_id']
};
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'archived', 'cal_event_id', 'cal_pending', 'hoan_thanh_luc', 'nguon', 'checklist', 'tim_hieu', 'lich_trinh', 'dat_cho']);

function fieldInput(table, k, f, v) {
  const id = `f-${k}`;
  const lab = html`<label for="${id}">${f.label || label(k)}${f.required ? html` <i class="req">*</i>` : ''}</label>`;
  switch (f.type) {
    case 'bool':
      return html`<div class="field field-bool"><label class="switch"><input type="checkbox" id="${id}" name="${k}" ${v ? raw('checked') : ''}><span></span> ${f.label || label(k)}</label></div>`;
    case 'longtext':
      return html`<div class="field">${lab}<textarea id="${id}" name="${k}" rows="${k === 'noi_dung' ? 8 : 4}">${v || ''}</textarea></div>`;
    case 'num':
      return html`<div class="field">${lab}<input id="${id}" name="${k}" type="number" step="any" inputmode="decimal" value="${v ?? ''}"></div>`;
    case 'enum':
      return html`<div class="field">${lab}<select id="${id}" name="${k}"><option value=""></option>${f.values.map((o) => html`<option ${o === v ? raw('selected') : ''}>${o}</option>`)}</select></div>`;
    case 'date':
      return html`<div class="field">${lab}<input id="${id}" name="${k}" type="date" value="${v || ''}"></div>`;
    case 'when': {
      const d = v ? v.slice(0, 10) : '';
      const t = v && v.length > 10 ? v.slice(11, 16) : '';
      return html`<div class="field">${lab}<div class="when"><input id="${id}" name="${k}" type="date" value="${d}"><input name="${k}__time" type="time" value="${t}" aria-label="Giờ"></div></div>`;
    }
    case 'ref': {
      const opts = store.all(f.ref).sort((a, b) => fold(store.titleOf(f.ref, a)).localeCompare(fold(store.titleOf(f.ref, b))));
      return html`<div class="field">${lab}<select id="${id}" name="${k}"><option value=""></option>${opts.map((o) => html`<option value="${o.id}" ${o.id === v ? raw('selected') : ''}>${o.bieu_tuong ? o.bieu_tuong + ' ' : ''}${store.titleOf(f.ref, o)}</option>`)}</select></div>`;
    }
    case 'refs': {
      const opts = store.all(f.ref);
      const cur = new Set(v || []);
      return html`<details class="field"><summary>${f.label || label(k)} (${cur.size})</summary><div class="refs">${opts.map((o) => html`<label class="ref-opt"><input type="checkbox" name="${k}" value="${o.id}" ${cur.has(o.id) ? raw('checked') : ''}> ${store.titleOf(f.ref, o)}</label>`)}</div></details>`;
    }
    case 'list':
      return html`<div class="field">${lab}<input id="${id}" name="${k}" value="${(v || []).join(', ')}" placeholder="phân cách bằng dấu phẩy"></div>`;
    default:
      return html`<div class="field">${lab}<input id="${id}" name="${k}" value="${v ?? ''}" ${k === 'dien_thoai' ? raw('type="tel"') : k === 'email' ? raw('type="email"') : k.startsWith('link') || k === 'url' ? raw('type="url"') : ''}></div>`;
  }
}

function readForm(form, fields) {
  const out = {};
  for (const [k, f] of Object.entries(fields)) {
    if (HIDDEN.has(k) || f.type === 'sys') continue;
    if (f.type === 'bool') { const el = form.elements[k]; if (el) out[k] = el.checked; continue; }
    if (f.type === 'refs') { out[k] = [...form.querySelectorAll(`input[name="${k}"]:checked`)].map((i) => i.value); continue; }
    const el = form.elements[k];
    if (!el) continue;
    let v = el.value;
    if (f.type === 'when') { const t = form.elements[k + '__time']?.value; v = v ? (t ? `${v}T${t}` : v) : ''; }
    if (f.type === 'num') v = v === '' ? null : Number(v);
    if (f.type === 'list') v = v.split(',').map((x) => x.trim()).filter(Boolean);
    out[k] = v;
  }
  return out;
}

function changed(before, after) {
  const d = {};
  for (const k of Object.keys(after)) if (JSON.stringify(before[k] ?? (Array.isArray(after[k]) ? [] : '')) !== JSON.stringify(after[k] ?? '')) d[k] = after[k];
  return d;
}

/** Mở biểu mẫu. id = null để tạo mới (defaults = giá trị điền sẵn). */
export function openRecord(table, id, defaults = {}) {
  const sch = store.schema()?.[table];
  if (!sch) { toast('Chưa tải xong dữ liệu, thử lại sau giây lát.'); return; }
  const rec = id ? store.get(table, id) : null;
  if (id && !rec) { toast('Không tìm thấy bản ghi (có thể đã bị lưu trữ).'); return; }
  const v = rec || defaults;
  const fields = sch.fields;
  const primary = (PRIMARY[table] || []).filter((k) => fields[k]);
  const rest = Object.keys(fields).filter((k) => !primary.includes(k) && !HIDDEN.has(k) && fields[k].type !== 'sys');

  const extra = rec ? extraFor(table, rec) : table === 'dia_diem' ? placeTools(null) : '';
  const meta = rec ? html`<p class="meta">Nguồn: ${rec.nguon || '—'} · tạo ${fmtDate((rec.created_at || '').slice(0, 10), true)} · sửa ${whenLabel((rec.updated_at || '').slice(0, 10), { overdue: false })}${rec.cal_event_id ? ' · 📅 đã lên lịch' : ''}</p>` : '';

  const form = document.createElement('form');
  form.className = 'record-form';
  form.innerHTML = html`
    ${primary.map((k) => fieldInput(table, k, fields[k], v[k]))}
    ${rest.length ? html`<details class="more"><summary>Thêm thông tin</summary>${rest.map((k) => fieldInput(table, k, fields[k], v[k]))}</details>` : ''}
    ${extra}
    ${meta}
    <div class="form-actions">
      ${rec ? html`<button type="button" class="btn btn-ghost" data-archive>${rec.archived ? 'Khôi phục' : 'Lưu trữ'}</button>` : ''}
      <span class="spacer"></span>
      <button type="submit" class="btn btn-primary">${rec ? 'Lưu' : 'Thêm'}</button>
    </div>`.__raw;

  const title = rec ? `${TABLE_META[table].icon} ${store.titleOf(table, rec)}` : `Thêm ${TABLE_META[table].label.toLowerCase()}`;
  const sheet = openSheet(form, { title, onClose: () => { if (location.hash.split('/').length > 2) history.replaceState(null, '', location.hash.split('/').slice(0, 2).join('/') || '#/hom-nay'); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form, fields);
    try {
      if (rec) {
        const d = changed(rec, data);
        if (Object.keys(d).length) await store.update(table, rec.id, d);
        toast('Đã lưu');
      } else {
        const clean = Object.fromEntries(Object.entries(data).filter(([, x]) => x !== '' && x !== null && !(Array.isArray(x) && !x.length) && x !== false));
        await store.create(table, clean);
        toast(`Đã thêm ${TABLE_META[table].label.toLowerCase()}`);
      }
      sheet.close();
    } catch (err) { errorToast(err); }
  });
  form.querySelector('[data-archive]')?.addEventListener('click', async () => {
    try {
      if (rec.archived) { await store.restore(table, rec.id); toast('Đã khôi phục'); }
      else {
        await store.archive(table, rec.id);
        toast('Đã lưu trữ', { actionLabel: 'Hoàn tác', onAction: () => store.restore(table, rec.id) });
      }
      sheet.close();
    } catch (err) { errorToast(err); }
  });
  wireExtra(form, table, rec);
  if (table === 'dia_diem') wirePlaceTools(form);
  return sheet;
}

// ---------------- Phần riêng theo bảng ----------------
function placeTools(rec) {
  return html`<div class="place-tools">
    <button type="button" class="btn btn-ghost" data-gps>📍 Vị trí hiện tại</button>
    <button type="button" class="btn btn-ghost" data-readlink>🔗 Đọc link Google Maps</button>
    ${rec && rec.lat && rec.lng ? html`<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${rec.lat},${rec.lng}">🧭 Chỉ đường</a>` : ''}
  </div><p class="hint place-hint"></p>`;
}

/** Nút GPS / đọc link cho biểu mẫu địa điểm (tạo mới hoặc sửa). */
function wirePlaceTools(form) {
  const set = (k, v, onlyEmpty = false) => { const el = form.elements[k]; if (el && v !== undefined && v !== null && v !== '' && (!onlyEmpty || !el.value)) el.value = v; };
  const hint = form.querySelector('.place-hint');
  form.querySelector('[data-gps]')?.addEventListener('click', () => {
    if (!navigator.geolocation) { hint.textContent = 'Thiết bị không hỗ trợ định vị.'; return; }
    hint.textContent = 'Đang lấy vị trí…';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = +pos.coords.latitude.toFixed(6), lng = +pos.coords.longitude.toFixed(6);
      set('lat', lat); set('lng', lng);
      hint.textContent = `Đã lấy toạ độ (sai số khoảng ${Math.round(pos.coords.accuracy)} m). Đang tra địa chỉ…`;
      try { const a = await call('dia_chi_tu_toa_do', { lat, lng }); set('dia_chi', a.dia_chi, true); set('tinh', a.tinh, true); hint.textContent = a.dia_chi || 'Đã lấy toạ độ.'; }
      catch { hint.textContent = 'Đã lấy toạ độ; chưa tra được địa chỉ (mất mạng?).'; }
    }, (err) => { hint.textContent = err.code === 1 ? 'Bạn chưa cho phép app dùng vị trí (bật trong cài đặt trình duyệt).' : 'Không lấy được vị trí, thử lại ngoài trời.'; },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  form.querySelector('[data-readlink]')?.addEventListener('click', async () => {
    let url = form.elements.link_goc?.value.trim();
    if (!url) { try { url = (await navigator.clipboard.readText()).trim(); } catch { /* không đọc được */ } }
    if (!/^https?:\/\//.test(url || '')) { hint.textContent = 'Dán link Google Maps vào ô "Link gốc (Maps)" rồi bấm lại.'; form.elements.link_goc?.focus(); return; }
    set('link_goc', url);
    hint.textContent = 'Đang đọc link…';
    try {
      const { info } = await call('dia_diem_tu_link', { url, tao: false });
      set('ten', info.ten, true); set('lat', info.lat); set('lng', info.lng); set('dia_chi', info.dia_chi, true); set('tinh', info.tinh, true);
      hint.textContent = info.lat !== null ? `Đã đọc: ${info.ten || ''} ${info.dia_chi || ''}` : 'Link không chứa vị trí rõ ràng; bạn bổ sung tên/địa chỉ giúp.';
    } catch (e) { hint.textContent = 'Không đọc được link: ' + e.message; }
  });
}

function extraFor(table, rec) {
  if (table === 'van_ban') {
    const rows = store.all('theo_doi_dv').filter((r) => r.van_ban_id === rec.id);
    const tasks = store.all('viec').filter((v) => (v.van_ban_ids || []).includes(rec.id));
    const units = Object.fromEntries(store.all('don_vi', { archived: true }).map((u) => [u.id, u]));
    rows.sort((a, b) => (units[a.don_vi_id]?.stt || 999) - (units[b.don_vi_id]?.stt || 999));
    const sent = rows.filter((r) => r.da_gui).length;
    return html`
      <section class="sub">
        <h4>Việc phát sinh (${tasks.length}) <button type="button" class="link" data-new-task>+ Thêm việc</button></h4>
        <ul class="mini">${tasks.map((t) => html`<li data-open="viec/${t.id}">${t.trang_thai === 'Xong' ? '✅' : '◻️'} ${t.ten}${t.han ? html` · ${whenLabel(t.han)}` : ''}</li>`)}</ul>
      </section>
      <section class="sub">
        <h4>Đơn vị gửi văn bản ${rows.length ? html`<span class="count">${sent}/${rows.length}</span>` : ''}</h4>
        ${rows.length
          ? html`<p class="hint">Chạm vào đơn vị để đánh dấu đã gửi / chưa gửi.</p><div class="units">${rows.map((r) => html`<button type="button" class="unit ${r.da_gui ? 'sent' : ''}" data-unit="${r.don_vi_id}" data-sent="${r.da_gui ? 1 : 0}" title="${r.ngay_gui ? 'Gửi ' + fmtDate(r.ngay_gui) : ''}">${(units[r.don_vi_id]?.ten || '?').replace(/^Điện lực /, 'ĐL ').replace(/^Phòng /, 'P. ')}</button>`)}</div>`
          : html`<button type="button" class="btn btn-ghost" data-track>📮 Tạo danh sách theo dõi 47 đơn vị</button>`}
      </section>`;
  }
  if (table === 'du_an') {
    const tasks = store.all('viec').filter((v) => v.du_an_id === rec.id);
    const done = tasks.filter((t) => t.trang_thai === 'Xong').length;
    return html`<section class="sub"><h4>Việc của dự án <span class="count">${done}/${tasks.length}</span> <button type="button" class="link" data-new-task>+ Thêm việc</button></h4>
      <ul class="mini">${tasks.map((t) => html`<li data-open="viec/${t.id}">${t.trang_thai === 'Xong' ? '✅' : '◻️'} ${t.ten}</li>`)}</ul></section>`;
  }
  if (table === 'dia_diem') return placeTools(rec);
  if (table === 'su_kien') {
    return html`<section class="sub"><h4>Thao tác</h4><div class="chips">
      ${rec.trang_thai !== 'Đã diễn ra' ? html`<button type="button" class="chip" data-ev="done">✅ Đã diễn ra</button>` : ''}
      <button type="button" class="chip" data-ev="minutes">📝 Ghi biên bản</button>
      <button type="button" class="chip" data-ev="task">➕ Việc phát sinh</button>
      <button type="button" class="chip" data-ev="move">⏭ Dời lịch</button>
      ${rec.trang_thai !== 'Hủy' ? html`<button type="button" class="chip" data-ev="cancel">✖ Hủy</button>` : ''}
    </div><p class="hint">Sự kiện là việc diễn ra theo giờ (họp, hẹn…). Sau khi diễn ra: ghi kết quả, biên bản và giao việc phát sinh.</p></section>`;
  }
  if (table === 'inbox' && !rec.da_xu_ly) {
    return html`<section class="sub"><h4>Chuyển thành</h4><div class="chips">
      <button type="button" class="chip" data-convert="viec">✅ Việc</button>
      <button type="button" class="chip" data-convert="su_kien">📅 Sự kiện</button>
      <button type="button" class="chip" data-convert="ghi_chu">🗒 Ghi chú</button>
      <button type="button" class="chip" data-convert="nguoi">👤 Người</button></div></section>`;
  }
  return raw('');
}

function wireExtra(form, table, rec) {
  if (!rec) return;
  form.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.ev;
    try {
      if (k === 'done') { await store.update('su_kien', rec.id, { trang_thai: 'Đã diễn ra' }); toast('Đã đánh dấu diễn ra. Ghi kết quả vào ô “Kết quả” nếu cần.'); form.elements.trang_thai.value = 'Đã diễn ra'; form.elements.ket_qua?.focus(); }
      else if (k === 'cancel') { await store.update('su_kien', rec.id, { trang_thai: 'Hủy' }); toast('Đã hủy, sự kiện được gỡ khỏi lịch', { actionLabel: 'Hoàn tác', onAction: () => store.update('su_kien', rec.id, { trang_thai: 'Sắp tới' }) }); closeSheet(); }
      else if (k === 'move') { form.elements.bat_dau.focus(); form.elements.bat_dau.showPicker?.(); }
      else if (k === 'task') { closeSheet(); setTimeout(() => openRecord('viec', null, { ten: '', mo_ta: `Phát sinh từ: ${rec.ten} (${fmtDate(rec.bat_dau.slice(0, 10))})`, linh_vuc_id: rec.linh_vuc_id }), 200); }
      else if (k === 'minutes') {
        closeSheet();
        const { openNote } = await import('./notes.js');
        setTimeout(() => openNote(null, { defaults: { tieu_de: `Biên bản: ${rec.ten} – ${fmtDate(rec.bat_dau.slice(0, 10))}`,
          noi_dung: `Thời gian: ${rec.bat_dau.replace('T', ' ')}\nĐịa điểm: ${rec.dia_diem || ''}\nThành phần: \n\nNội dung:\n- \n\nKết luận:\n- \n\nViệc giao (ai – việc – hạn):\n- ` } }), 200);
      }
    } catch (err) { errorToast(err); }
  }));
  form.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { const [t, id] = el.dataset.open.split('/'); openRecord(t, id); }));
  form.querySelector('[data-new-task]')?.addEventListener('click', () => {
    openRecord('viec', null, table === 'van_ban' ? { van_ban_ids: [rec.id], ten: '', linh_vuc_id: rec.linh_vuc_id } : { du_an_id: rec.id, linh_vuc_id: rec.linh_vuc_id });
  });
  form.querySelector('[data-track]')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Đang tạo…';
    try { await store.action('theo_doi_tao', { van_ban_id: rec.id }); toast('Đã tạo danh sách theo dõi'); closeSheet(); openRecord('van_ban', rec.id); }
    catch (err) { errorToast(err); e.target.disabled = false; }
  });
  form.querySelectorAll('[data-unit]').forEach((btn) => btn.addEventListener('click', async () => {
    const was = btn.dataset.sent === '1';
    btn.classList.toggle('sent', !was); btn.dataset.sent = was ? '0' : '1'; btn.disabled = true;
    try { await store.action('theo_doi_danh_dau', { van_ban_id: rec.id, don_vi: [btn.dataset.unit], da_gui: !was }); }
    catch (err) { btn.classList.toggle('sent', was); btn.dataset.sent = was ? '1' : '0'; errorToast(err); }
    btn.disabled = false;
    const all = form.querySelectorAll('[data-unit]').length;
    const sent = form.querySelectorAll('[data-unit].sent').length;
    const c = btn.closest('.sub').querySelector('.count'); if (c) c.textContent = `${sent}/${all}`;
  }));
  form.querySelectorAll('[data-convert]').forEach((btn) => btn.addEventListener('click', () => {
    const t = btn.dataset.convert;
    const text = rec.noi_dung || '';
    const defaults = { viec: { ten: text }, su_kien: { ten: text }, ghi_chu: { tieu_de: text.slice(0, 80), noi_dung: text }, nguoi: { ten: text } }[t];
    closeSheet();
    setTimeout(() => {
      const s = openRecord(t, null, defaults);
      // Sau khi tạo xong, đánh dấu inbox đã xử lý.
      const f = s?.body.querySelector('form');
      f?.addEventListener('submit', () => store.update('inbox', rec.id, { da_xu_ly: true, xu_ly_thanh: t }), { once: true });
    }, 200);
  }));
}

export { esc };
