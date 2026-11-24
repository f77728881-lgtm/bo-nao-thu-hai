// Thành phần giao diện dùng chung.
import { html, raw, esc, whenLabel, dayOf, today } from './util.js';
import * as store from './store.js';
import { icon, iconHtml } from './icons.js';

export const TABLE_META = {
  viec: { icon: '✅', ic: 'task', label: 'Việc', plural: 'Việc' },
  van_ban: { icon: '📄', ic: 'doc', label: 'Văn bản', plural: 'Văn bản' },
  su_kien: { icon: '📅', ic: 'event', label: 'Sự kiện', plural: 'Sự kiện' },
  ghi_chu: { icon: '🗒', ic: 'note', label: 'Ghi chú', plural: 'Ghi chú' },
  dia_diem: { icon: '📍', ic: 'place', label: 'Địa điểm', plural: 'Địa điểm' },
  nguoi: { icon: '👤', ic: 'user', label: 'Người liên hệ', plural: 'Người liên hệ' },
  du_an: { icon: '📁', ic: 'folder', label: 'Dự án', plural: 'Dự án' },
  linh_vuc: { icon: '🗂', ic: 'grid', label: 'Lĩnh vực', plural: 'Lĩnh vực' },
  inbox: { icon: '📥', ic: 'inbox', label: 'Inbox', plural: 'Inbox' },
  don_vi: { icon: '🏢', ic: 'building', label: 'Đơn vị', plural: 'Đơn vị' },
  theo_doi_dv: { icon: '📮', ic: 'list', label: 'Theo dõi đơn vị', plural: 'Theo dõi đơn vị' },
  chuyen_di: { icon: '✈️', ic: 'travel', label: 'Chuyến đi', plural: 'Chuyến đi' },
  nhat_ky_chuyen_di: { icon: '📓', ic: 'note', label: 'Nhật ký chuyến đi', plural: 'Nhật ký chuyến đi' },
  thoi_quen: { icon: '🔁', ic: 'check', label: 'Thói quen', plural: 'Thói quen' },
  diem_danh: { icon: '✔️', ic: 'check', label: 'Điểm danh', plural: 'Điểm danh' },
  lo_trinh: { icon: '🧭', ic: 'travel', label: 'Lộ trình', plural: 'Lộ trình' },
  buoi_hoc: { icon: '📘', ic: 'note', label: 'Buổi học/tập', plural: 'Buổi học/tập' },
  nhat_ky_ngay: { icon: '🌙', ic: 'moon', label: 'Nhật ký ngày', plural: 'Nhật ký ngày' }
};

export const LABELS = {
  ten: 'Tên', tieu_de: 'Tiêu đề', noi_dung: 'Nội dung', trang_thai: 'Trạng thái', gap: 'Gấp', quan_trong: 'Quan trọng',
  han: 'Hạn', thoi_luong_phut: 'Thời lượng (phút)', du_an_id: 'Dự án', linh_vuc_id: 'Lĩnh vực', van_ban_ids: 'Văn bản liên quan',
  nguoi_ids: 'Người liên quan', mo_ta: 'Mô tả', lap_lai: 'Lặp lại (RRULE)', so_hieu: 'Số hiệu', trich_yeu: 'Trích yếu',
  loai: 'Loại', chieu: 'Chiều', ngay_ban_hanh: 'Ngày ban hành', han_xu_ly: 'Hạn xử lý', vai_tro: 'Vai trò', chu_tri: 'Chủ trì',
  phoi_hop: 'Phối hợp', nguoi_ban_hanh: 'Người ban hành', but_phe: 'Bút phê', link_doffice: 'Link D-Office',
  yeu_cau_dv_gui: 'Yêu cầu đơn vị gửi', ghi_chu: 'Ghi chú', bat_dau: 'Bắt đầu', ket_thuc: 'Kết thúc', dia_diem: 'Địa điểm',
  nhac_truoc_phut: 'Nhắc trước (phút)', nhan: 'Nhãn', mau: 'Màu', ghim: 'Ghim', url: 'Liên kết web', lien_ket: 'Liên kết tới',
  dia_diem_id: 'Địa điểm', anh: 'Ảnh', dia_chi: 'Địa chỉ', lat: 'Vĩ độ', lng: 'Kinh độ', link_goc: 'Link gốc (Maps)',
  danh_gia: 'Đánh giá (1–5)', mon_nen_thu: 'Món nên thử', muc_gia: 'Mức giá', dien_thoai: 'Điện thoại', gio_mo: 'Giờ mở cửa',
  ngay_den: 'Ngày đến', so_lan_den: 'Số lần đến', tinh: 'Tỉnh/thành', don_vi: 'Đơn vị', don_vi_id: 'Đơn vị',
  chuc_vu: 'Chức vụ', email: 'Email', da_xu_ly: 'Đã xử lý', xu_ly_thanh: 'Đã chuyển thành', nhom: 'Nhóm', bieu_tuong: 'Biểu tượng',
  thu_tu: 'Thứ tự', ket_qua: 'Kết quả mong muốn', ma: 'Mã', stt: 'STT', dau_moi: 'Đầu mối', van_ban_id: 'Văn bản',
  da_gui: 'Đã gửi', ngay_gui: 'Ngày gửi', so_vb_phan_hoi: 'Số VB phản hồi', khong_dong_bo_lich: 'Không đưa lên lịch',
  nguon: 'Nguồn', archived: 'Đã lưu trữ', diem_den: 'Điểm đến', tu_ngay: 'Ngày đi', den_ngay: 'Ngày về', phuong_tien: 'Phương tiện',
  di_cung: 'Đi cùng', ngay: 'Ngày', tam_trang: 'Tâm trạng (emoji)', dia_diem_ids: 'Địa điểm đã ghé', chi_tieu: 'Chi tiêu (đ)', chuyen_di_id: 'Chuyến đi',
  tan_suat: 'Tần suất', ngay_trong_tuan: 'Các ngày (T2, T3… CN)', so_lan_tuan: 'Số lần/tuần', gio_nhac: 'Giờ (HH:mm)', muc_tieu: 'Mục tiêu',
  bat_dau: 'Bắt đầu', thoi_quen_id: 'Thói quen', lo_trinh_id: 'Lộ trình', so_tuan: 'Số tuần', cach_hoc: 'Cách học/tập mỗi buổi',
  tuan: 'Tuần', thu_tu: 'Thứ tự', gio: 'Giờ', bai_tap: 'Bài tập', tai_lieu: 'Tài liệu (link)', cam_nhan: 'Cảm nhận', ngay_xong: 'Ngày xong', gia_tri: 'Giá trị', buoi_id: 'Buổi',
  ngan_sach: 'Ngân sách (đ)', chi_phi: 'Chi phí thực tế (đ)', album: 'Link album ảnh', anh_bia: 'Ảnh bìa (link)'
};
export const label = (k) => LABELS[k] || k;

// ---------------- Thông báo ----------------
export function toast(msg, { kind = 'info', ms = 3200, actionLabel, onAction } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button class="toast-btn">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').onclick = () => { onAction?.(); el.remove(); };
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function errorToast(e) {
  toast(e?.message || String(e), { kind: 'error', ms: 6000 });
}

// ---------------- Bảng trượt (sheet) ----------------
export function openSheet(content, { title = '', onClose } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Đóng">${iconHtml('close')}</button></header>
    <div class="sheet-body"></div></section>`;
  const body = wrap.querySelector('.sheet-body');
  if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
  const close = () => { wrap.classList.add('closing'); setTimeout(() => wrap.remove(), 180); onClose?.(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.querySelector('.sheet-backdrop').onclick = close;
  wrap.querySelector('[data-close]').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap._close = close;
  requestAnimationFrame(() => wrap.classList.add('open'));
  return { el: wrap, body, close };
}
export function closeSheet() { document.querySelector('.sheet-wrap')?._close?.(); }

// ---------------- Mảnh giao diện ----------------
export function statusClass(s) {
  return { 'Xong': 'st-done', 'Đã hoàn thành': 'st-done', 'Đang làm': 'st-doing', 'Chờ': 'st-wait', 'Tạm dừng': 'st-wait' }[s] || 'st-todo';
}

export function quadrant(v) {
  if (v.gap && v.quan_trong) return 'q1';
  if (v.quan_trong) return 'q2';
  if (v.gap) return 'q3';
  return 'q4';
}

export function dueClass(when, done) {
  if (!when || done) return '';
  const d = dayOf(when);
  const t = today();
  if (d < t) return 'due-over';
  if (d === t) return 'due-today';
  return '';
}

export function areaName(id) {
  const a = id && store.get('linh_vuc', id);
  return a ? `${a.bieu_tuong || ''} ${a.ten}`.trim() : '';
}

/** Một dòng việc: ô tick + tên + hạn + nhãn. */
export function taskRow(v, { showArea = true } = {}) {
  const done = v.trang_thai === 'Xong';
  const due = v.han ? whenLabel(v.han, { overdue: !done }) : '';
  const proj = v.du_an_id && store.get('du_an', v.du_an_id);
  return html`<li class="row task ${done ? 'is-done' : ''} ${v._pending ? 'is-pending' : ''}" data-open="viec/${v.id}">
    <button class="check ${quadrant(v)}" data-toggle-task="${v.id}" aria-label="${done ? 'Bỏ đánh dấu xong' : 'Đánh dấu xong'}">${done ? '✓' : ''}</button>
    <div class="row-main">
      <div class="row-title">${v.ten}</div>
      <div class="row-meta">
        ${due ? html`<span class="due ${dueClass(v.han, done)}">${due}</span>` : ''}
        ${v.gap && v.quan_trong && !done ? html`<span class="tag tag-q1">Gấp & QT</span>` : ''}
        ${v.trang_thai !== 'Chưa bắt đầu' && !done ? html`<span class="tag ${statusClass(v.trang_thai)}">${v.trang_thai}</span>` : ''}
        ${showArea && v.linh_vuc_id ? html`<span class="tag">${areaName(v.linh_vuc_id)}</span>` : ''}
        ${proj ? html`<span class="tag">📁 ${proj.ten}</span>` : ''}
        ${v._pending ? html`<span class="tag tag-pending">chờ gửi</span>` : ''}
      </div>
    </div>
  </li>`;
}

export function docRow(d) {
  const done = d.trang_thai === 'Xong';
  let prog = '';
  if (d.yeu_cau_dv_gui) {
    const rows = store.all('theo_doi_dv').filter((r) => r.van_ban_id === d.id);
    if (rows.length) {
      const sent = rows.filter((r) => r.da_gui).length;
      const pct = Math.round((100 * sent) / rows.length);
      prog = html`<div class="progress" title="${sent}/${rows.length} đơn vị đã gửi"><span style="width:${pct}%"></span><em>${sent}/${rows.length}</em></div>`;
    }
  }
  return html`<li class="row doc ${done ? 'is-done' : ''}" data-open="van_ban/${d.id}">
    <div class="doc-icon">${icon('doc')}</div>
    <div class="row-main">
      <div class="row-title"><b>${d.so_hieu}</b>${d.trich_yeu ? html` · ${d.trich_yeu}` : ''}</div>
      <div class="row-meta">
        ${d.han_xu_ly ? html`<span class="due ${dueClass(d.han_xu_ly, done)}">Hạn ${whenLabel(d.han_xu_ly, { overdue: !done })}</span>` : ''}
        ${d.vai_tro ? html`<span class="tag ${d.vai_tro === 'Chủ trì' ? 'tag-lead' : ''}">${d.vai_tro}</span>` : ''}
        ${d.trang_thai && d.trang_thai !== 'Chưa bắt đầu' ? html`<span class="tag ${statusClass(d.trang_thai)}">${d.trang_thai}</span>` : ''}
      </div>
      ${prog}
    </div>
  </li>`;
}

export function eventRow(e) {
  const t = e.bat_dau && e.bat_dau.length > 10 ? e.bat_dau.slice(11, 16) : 'Cả ngày';
  const end = e.ket_thuc && e.ket_thuc.length > 10 ? '–' + e.ket_thuc.slice(11, 16) : '';
  return html`<li class="row event ${e.trang_thai === 'Đã diễn ra' ? 'is-done' : ''} ${e.trang_thai === 'Hủy' ? 'is-cancel' : ''}" data-open="su_kien/${e.id}">
    <div class="ev-time">${t}${end}</div>
    <div class="row-main"><div class="row-title">${e.ten}</div>
      <div class="row-meta">${e.dia_diem ? html`<span>📍 ${e.dia_diem}</span>` : ''}${e.lap_lai ? html`<span class="tag">🔁 lặp lại</span>` : ''}</div></div>
  </li>`;
}

export function genericRow(table, r) {
  const meta = TABLE_META[table];
  const title = store.titleOf(table, r);
  const sub = r.trich_yeu || r.dia_chi || r.don_vi || r.mo_ta || (r.noi_dung && r.noi_dung !== title ? r.noi_dung : '') || '';
  return html`<li class="row" data-open="${table}/${r.id}">
    <div class="doc-icon">${icon(r.ghim ? 'pin' : meta.ic)}</div>
    <div class="row-main"><div class="row-title">${title}</div>
      ${sub ? html`<div class="row-sub">${String(sub).slice(0, 140)}</div>` : ''}
      <div class="row-meta">${(r.nhan || []).map((n) => html`<span class="tag">${n}</span>`)}${r.trang_thai ? html`<span class="tag">${r.trang_thai}</span>` : ''}</div>
    </div></li>`;
}

const EMOJI_HEAD = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u2600-\u27BF])\uFE0F?\s*/u;
export function section(title, items, { empty = '', count = true, more, limit = 0 } = {}) {
  if (!items.length && !empty) return raw('');
  title = String(title).replace(EMOJI_HEAD, ''); // tiêu đề tối giản, không emoji
  const shown = limit && items.length > limit + 1 ? items.slice(0, limit) : items;
  const rest = shown.length < items.length ? items.slice(limit) : [];
  return html`<section class="card">
    <h3 class="card-title">${title}${count && items.length ? html` <span class="count">${items.length}</span>` : ''}</h3>
    ${items.length ? html`<ul class="list">${shown}</ul>` : html`<p class="empty">${empty}</p>`}
    ${rest.length ? html`<details class="more-items"><summary>Xem thêm ${rest.length}</summary><ul class="list">${rest}</ul></details>` : ''}
    ${more ? more : ''}
  </section>`;
}
