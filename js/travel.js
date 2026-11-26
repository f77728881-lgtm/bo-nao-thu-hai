// Hành trình: chuyến đi (ý tưởng → kế hoạch → đang đi → đã đi), nhật ký theo ngày, địa điểm đã đến/muốn đến,
// kế hoạch tìm hiểu trước và checklist chuẩn bị sinh từ bộ mẫu (đồ "hay quên" của các chuyến trước được đẩy lên đầu).
import * as store from './store.js';
import { html, raw, esc, today, addDays, diffDays, fmtDate, fold, weekdayName } from './util.js';
import { openSheet, toast, errorToast, closeSheet } from './ui.js';
import { openRecord } from './form.js';

let tab = 'trips';
let myPos = null; // { lat, lng, at }

function distKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = (k) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(k < 10 ? 1 : 0).replace('.', ',')} km`);

function locate(rerender) {
  if (!navigator.geolocation) { toast('Thiết bị không hỗ trợ định vị'); return; }
  navigator.geolocation.getCurrentPosition((p) => { myPos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; rerender(); },
    (e) => toast(e.code === 1 ? 'Bạn chưa cho phép dùng vị trí' : 'Không lấy được vị trí', { kind: 'error' }),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}
export const setTravelTab = (t) => { tab = t; };

const STATUS_ICON = { 'Ý tưởng': '💭', 'Lên kế hoạch': '📝', 'Sẵn sàng': '🎒', 'Đang đi': '🚗', 'Đã đi': '📖' };
const money = (n) => (n || n === 0 ? Number(n).toLocaleString('vi-VN') + 'đ' : '');
const stars = (n) => (n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '');

function tripDates(t) {
  if (!t.tu_ngay) return '';
  const end = t.den_ngay && t.den_ngay !== t.tu_ngay ? ` – ${fmtDate(t.den_ngay, t.den_ngay.slice(0, 4) !== today().slice(0, 4))}` : '';
  return fmtDate(t.tu_ngay, !end && t.tu_ngay.slice(0, 4) !== today().slice(0, 4)) + end;
}
const tripDays = (t) => (t.tu_ngay ? diffDays(t.tu_ngay, t.den_ngay || t.tu_ngay) + 1 : 0);

export function effectiveStatus(t) {
  const d = today();
  if (t.trang_thai === 'Đã đi' || t.trang_thai === 'Ý tưởng') return t.trang_thai;
  if (t.tu_ngay && t.tu_ngay <= d && (t.den_ngay || t.tu_ngay) >= d) return 'Đang đi';
  if (t.tu_ngay && (t.den_ngay || t.tu_ngay) < d) return 'Đã đi';
  return t.trang_thai;
}

// ---------------- Checklist ----------------
const LINE = /^\s*[-*]\s*\[( |x|X|!)\]\s?(.*)$/;
export function parseList(text) {
  const groups = [];
  let cur = { title: 'Chung', items: [] };
  String(text || '').split('\n').forEach((line) => {
    if (/^\s*#{1,3}\s+/.test(line)) { if (cur.items.length) groups.push(cur); cur = { title: line.replace(/^\s*#+\s+/, ''), items: [] }; return; }
    const m = line.match(LINE);
    if (m) cur.items.push({ state: m[1].toLowerCase(), text: m[2] });
  });
  if (cur.items.length) groups.push(cur);
  return groups.filter((g) => g.items.length);
}
export const listToText = (groups) => groups.map((g) => `## ${g.title}\n` + g.items.map((i) => `- [${i.state}] ${i.text}`).join('\n')).join('\n\n');

/** Đồ hay quên: mục đánh dấu [!] ở mọi chuyến trước. */
function forgottenItems(exceptId) {
  const seen = new Map();
  store.all('chuyen_di').filter((t) => t.id !== exceptId).forEach((t) => parseList(t.checklist).forEach((g) => g.items.forEach((i) => {
    if (i.state === '!') seen.set(fold(i.text), i.text);
  })));
  return [...seen.values()];
}

export function buildChecklist({ days = 2, loai = 'Du lịch', phuongTien = '', nuocNgoai = false, treNho = false, tripId = null }) {
  const work = loai === 'Công tác', beach = loai === 'Biển', mountain = loai === 'Núi';
  const pt = fold(phuongTien);
  const plane = /may bay|bay/.test(pt), moto = /xe may/.test(pt), car = /o to|xe hoi|tu lai/.test(pt);
  const abroad = nuocNgoai || loai === 'Nước ngoài';
  const n = Math.max(1, days);
  const g = (title, items) => ({ title, items: items.filter(Boolean).map((text) => ({ state: ' ', text })) });
  const groups = [];
  const forgot = forgottenItems(tripId);
  if (forgot.length) groups.push(g('⚠️ Lần trước hay quên', forgot));
  groups.push(g('🪪 Giấy tờ', ['CCCD', 'Thẻ BHYT', 'Vé / mã đặt chỗ, xác nhận phòng', (moto || car) && 'Bằng lái + đăng ký xe + bảo hiểm xe',
    plane && 'Check-in online, hành lý xách tay ≤ 7kg', abroad && 'Hộ chiếu (còn hạn trên 6 tháng)', abroad && 'Visa / giấy nhập cảnh', abroad && 'Bảo hiểm du lịch',
    work && 'Quyết định cử đi công tác', work && 'Giấy giới thiệu', work && 'Tài liệu họp / hội nghị']));
  groups.push(g('💳 Tiền & thẻ', ['Ví, tiền mặt lẻ', 'Thẻ ngân hàng', 'Ví điện tử / ngân hàng trên điện thoại', abroad && 'Ngoại tệ, thẻ thanh toán quốc tế', abroad && 'SIM/eSIM du lịch']));
  groups.push(g('🔌 Điện tử', ['Điện thoại + sạc', 'Pin dự phòng', 'Cáp sạc dự phòng', 'Tai nghe', work && 'Laptop + sạc', abroad && 'Ổ cắm chuyển đổi']));
  groups.push(g('👕 Quần áo', [`Áo × ${n}`, `Quần × ${Math.ceil(n / 2)}`, `Đồ lót × ${n + 1}`, 'Đồ ngủ', 'Dép / giày', 'Đồ chạy bộ + giày tập (06:00)',
    work && 'Áo sơ mi / đồng phục', beach && 'Đồ bơi, kính râm, mũ rộng vành', mountain && 'Áo khoác ấm, mũ len, găng tay', mountain && 'Giày leo núi, áo mưa', moto && 'Áo mưa, găng tay, khẩu trang']));
  groups.push(g('🧴 Vệ sinh cá nhân', ['Bàn chải, kem đánh răng', 'Dầu gội, sữa tắm cỡ nhỏ', 'Khăn mặt', 'Lăn khử mùi', 'Dao cạo', beach && 'Kem chống nắng']));
  groups.push(g('💊 Thuốc', ['Thuốc dùng hằng ngày', 'Hạ sốt / giảm đau', 'Đau bụng, tiêu chảy', (car || moto || mountain) && 'Thuốc say xe', 'Băng cá nhân', mountain && 'Kem chống côn trùng', treNho && 'Thuốc trẻ em, nhiệt kế']));
  if (treNho) groups.push(g('👶 Trẻ nhỏ', ['Bỉm, khăn ướt', 'Sữa, bình, đồ ăn vặt', 'Quần áo dự phòng', 'Đồ chơi, sách']));
  groups.push(g('🏠 Trước khi rời nhà', ['Khóa ga', 'Rút điện thiết bị', 'Đóng cửa sổ, khóa cửa', 'Đổ rác', 'Nhờ người trông nhà / tưới cây', 'Báo người thân lịch trình']));
  return listToText(groups);
}

// ---------------- Màn chính ----------------
export function travelView() {
  const trips = store.all('chuyen_di').map((t) => ({ ...t, _st: effectiveStatus(t) }));
  const places = store.all('dia_diem');
  const been = places.filter((p) => p.trang_thai === 'Đã đến' || p.trang_thai === 'Yêu thích');
  const want = places.filter((p) => p.trang_thai === 'Muốn đến');
  const done = trips.filter((t) => t._st === 'Đã đi');
  const provinces = new Set([...been.map((p) => fold(p.tinh)).filter(Boolean), ...done.map((t) => fold((t.diem_den || '').split(',').pop())).filter(Boolean)]);

  let body;
  if (tab === 'near') {
    const withPos = places.filter((p) => p.lat !== null && p.lat !== undefined && p.lng !== null);
    if (!myPos) body = html`<p class="empty big">Đang lấy vị trí của bạn… <button class="link" data-locate>Thử lại</button></p>`;
    else {
      const list = withPos.map((p) => ({ p, d: distKm(myPos, p) })).sort((a, b) => a.d - b.d).slice(0, 50);
      body = list.length ? html`<section class="card"><ul class="list">${list.map(({ p, d }) => html`${raw(placeRow(p).__raw.replace('<div class="row-main">', `<div class="row-main"><span class="dist">${fmtKm(d)}</span>`))}`)}</ul></section>`
        : html`<p class="empty big">Chưa có địa điểm nào có toạ độ. Lưu địa điểm bằng link Google Maps hoặc nút "Vị trí hiện tại".</p>`;
    }
  } else if (tab === 'map') {
    body = html`<div id="place-map" class="place-map"></div><p class="hint">Xanh lá: đã đến · Hồng: yêu thích · Cam: muốn đến · Chấm xanh: bạn đang ở đây</p>`;
  } else if (tab === 'places' || tab === 'want') {
    const list = (tab === 'want' ? want : been).sort((a, b) => (b.danh_gia || 0) - (a.danh_gia || 0));
    const groups = {};
    list.forEach((p) => (groups[p.loai || 'Khác'] = groups[p.loai || 'Khác'] || []).push(p));
    body = list.length
      ? html`<div class="grid">${Object.entries(groups).map(([k, ps]) => html`<section class="card"><h3 class="card-title">${placeIcon(k)} ${k} <span class="count">${ps.length}</span></h3><ul class="list">${ps.map(placeRow)}</ul></section>`)}</div>`
      : html`<p class="empty big">${tab === 'want' ? 'Chưa lưu nơi nào muốn đến. Dán link Google Maps hoặc nhắn Claude để lưu.' : 'Chưa có địa điểm đã đến.'}</p>`;
  } else {
    const upcoming = trips.filter((t) => ['Lên kế hoạch', 'Sẵn sàng', 'Đang đi'].includes(t._st)).sort((a, b) => ((a.tu_ngay || '9') < (b.tu_ngay || '9') ? -1 : 1));
    const ideas = trips.filter((t) => t._st === 'Ý tưởng');
    const years = {};
    done.sort((a, b) => ((a.tu_ngay || '') < (b.tu_ngay || '') ? 1 : -1)).forEach((t) => (years[(t.tu_ngay || '????').slice(0, 4)] = years[(t.tu_ngay || '????').slice(0, 4)] || []).push(t));
    body = html`
      ${upcoming.length ? html`<h4 class="n-group">Sắp tới & đang đi</h4><div class="trip-grid">${upcoming.map(tripCard)}</div>` : ''}
      ${ideas.length ? html`<h4 class="n-group">💭 Ý tưởng</h4><div class="trip-grid">${ideas.map(tripCard)}</div>` : ''}
      ${Object.keys(years).length ? html`<h4 class="n-group">📖 Đã đi</h4>${Object.entries(years).map(([y, ts]) => html`<div class="timeline"><div class="tl-year">${y}<small>${ts.length} chuyến</small></div><div class="trip-grid">${ts.map(tripCard)}</div></div>`)}` : ''}
      ${!trips.length ? html`<p class="empty big">Chưa có chuyến đi nào. Bấm “+ Chuyến đi” để bắt đầu một kế hoạch hoặc ghi lại chuyến đã đi.</p>` : ''}`;
  }

  return html`
    <header class="page-head"><h1>Hành trình</h1>
      <div class="filters" style="margin:0"><button class="btn btn-ghost" data-trip-new>+ Chuyến đi</button><button class="btn btn-ghost" data-place-new>+ Địa điểm</button></div></header>
    <div class="stat-row travel-stats">
      <div class="stat"><b>${done.length}</b><span>chuyến đã đi</span></div>
      <div class="stat"><b>${provinces.size}</b><span>tỉnh/điểm đến</span></div>
      <div class="stat stat-green"><b>${been.length}</b><span>nơi đã đến</span></div>
      <div class="stat"><b>${want.length}</b><span>muốn đến</span></div>
    </div>
    <div class="seg" style="margin:14px 0">${[['trips', 'Chuyến đi'], ['places', 'Đã đến'], ['want', 'Muốn đến'], ['near', 'Gần tôi'], ['map', 'Bản đồ']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-travel-tab="${k}">${l}</button>`)}</div>
    ${body}`;
}

function placeIcon(loai) { return { 'Quán ăn': '🍜', 'Cà phê': '☕', 'Điểm tham quan': '🏞', 'Lưu trú': '🏨', 'Trải nghiệm': '🎟', 'Mua sắm': '🛍', 'Cơ quan': '🏢', 'Nhà riêng': '🏠' }[loai] || '📍'; }

function placeRow(p) {
  const trip = p.chuyen_di_id && store.get('chuyen_di', p.chuyen_di_id);
  return html`<li class="row" data-open="dia_diem/${p.id}">
    <div class="doc-icon">${placeIcon(p.loai)}</div>
    <div class="row-main"><div class="row-title">${p.ten} ${p.danh_gia ? html`<span class="stars">${stars(p.danh_gia)}</span>` : ''}</div>
      ${p.dia_chi ? html`<div class="row-sub">${p.dia_chi}</div>` : ''}
      <div class="row-meta">${p.mon_nen_thu ? html`<span>🍽 ${p.mon_nen_thu}</span>` : ''}${p.muc_gia ? html`<span>💰 ${p.muc_gia}</span>` : ''}${trip ? html`<span class="tag">✈️ ${trip.ten}</span>` : ''}
        ${p.lat && p.lng ? html`<a class="tag" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">🧭 Chỉ đường</a>` : p.link_goc ? html`<a class="tag" href="${p.link_goc}" target="_blank" rel="noopener">🗺 Maps</a>` : ''}</div></div></li>`;
}

function tripCard(t) {
  const st = t._st || effectiveStatus(t);
  const groups = parseList(t.checklist);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const ticked = groups.reduce((s, g) => s + g.items.filter((i) => i.state === 'x').length, 0);
  const left = t.tu_ngay ? diffDays(today(), t.tu_ngay) : null;
  const journal = store.all('nhat_ky_chuyen_di').filter((n) => n.chuyen_di_id === t.id);
  const spent = journal.reduce((s, n) => s + (n.chi_tieu || 0), 0) || t.chi_phi;
  const hue = [...(t.diem_den || t.ten)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 3600, 7) % 360;
  return html`<article class="trip ${st === 'Đã đi' ? 'past' : ''}" data-trip="${t.id}" tabindex="0">
    <div class="trip-cover" style="${t.anh_bia ? `background-image:url('${encodeURI(t.anh_bia)}')` : `background:linear-gradient(135deg,hsl(${hue} 55% 55%),hsl(${(hue + 40) % 360} 60% 38%))`}">
      <span class="trip-status">${STATUS_ICON[st] || ''} ${st}</span>
      ${left !== null && left > 0 && st !== 'Đã đi' ? html`<span class="trip-count">còn ${left} ngày</span>` : ''}
    </div>
    <div class="trip-body"><h3>${t.ten}</h3>
      <p class="row-meta">${t.diem_den ? html`<span>📍 ${t.diem_den}</span>` : ''}${t.tu_ngay ? html`<span>🗓 ${tripDates(t)} · ${tripDays(t)} ngày</span>` : ''}</p>
      ${st !== 'Đã đi' && total ? html`<div class="progress"><span style="width:${Math.round((100 * ticked) / total)}%"></span><em>🎒 ${ticked}/${total} món</em></div>` : ''}
      ${st === 'Đã đi' ? html`<p class="row-meta">${t.danh_gia ? html`<span class="stars">${stars(t.danh_gia)}</span>` : ''}${journal.length ? html`<span>📓 ${journal.length} trang nhật ký</span>` : ''}${spent ? html`<span>💸 ${money(spent)}</span>` : ''}</p>` : ''}
    </div></article>`;
}

/** Thẻ nhắc chuyến đi sắp tới trên màn Hôm nay (trong 14 ngày hoặc đang đi). */
export function upcomingTripCard() {
  const d = today();
  const t = store.all('chuyen_di').map((x) => ({ ...x, _st: effectiveStatus(x) }))
    .filter((x) => x.tu_ngay && x._st !== 'Đã đi' && x._st !== 'Ý tưởng' && diffDays(d, x.tu_ngay) <= 14 && (x.den_ngay || x.tu_ngay) >= d)
    .sort((a, b) => (a.tu_ngay < b.tu_ngay ? -1 : 1))[0];
  return t ? html`<div class="today-trip">${tripCard(t)}</div>` : raw('');
}

// ---------------- Chi tiết chuyến đi ----------------
let tripTab = 'overview';

export function openTrip(id) {
  const box = document.createElement('div');
  box.className = 'trip-detail';
  const sheet = openSheet(box, { title: '✈️ Chuyến đi' });
  const render = () => {
    const t = store.get('chuyen_di', id);
    if (!t) { sheet.close(); return; }
    sheet.el.querySelector('.sheet-head h2').textContent = `✈️ ${t.ten}`;
    box.innerHTML = html`
      <div class="seg trip-tabs">${[['overview', 'Tổng quan'], ['plan', 'Kế hoạch'], ['check', '🎒 Checklist'], ['journal', '📓 Nhật ký'], ['places', '📍 Địa điểm']].map(([k, l]) => html`<button class="${tripTab === k ? 'on' : ''}" data-ttab="${k}">${l}</button>`)}</div>
      <div class="trip-pane">${pane(t)}</div>`.__raw;
    wire(t);
  };

  function pane(t) {
    if (tripTab === 'plan') {
      const ph = {
        tim_hieu: 'Thời tiết mùa này…\nDi chuyển: …\nKhu nên ở: …\nĐặc sản / món phải thử: …\nLưu ý văn hóa, giấy tờ: …\n\nMẹo: nhắn Claude "tìm hiểu chuyến này" để điền giúp.',
        lich_trinh: 'Ngày 1 (dd/mm):\n- 07:00 xuất phát\n- 12:00 ăn trưa ở …\n\nNgày 2: …',
        dat_cho: 'Vé: …  mã đặt chỗ …\nKhách sạn: … nhận phòng 14:00\n(Không ghi số thẻ ngân hàng ở đây)'
      };
      return html`${['tim_hieu', 'lich_trinh', 'dat_cho'].map((k) => html`<div class="field"><label>${{ tim_hieu: '🔎 Tìm hiểu trước', lich_trinh: '🗓 Lịch trình theo ngày', dat_cho: '🎫 Đặt chỗ' }[k]}</label><textarea data-autosave="${k}" rows="${k === 'dat_cho' ? 4 : 7}" placeholder="${ph[k]}">${t[k] || ''}</textarea></div>`)}
        <div class="budget"><div><span>Ngân sách</span><b>${money(t.ngan_sach) || '—'}</b></div><div><span>Đã chi</span><b>${money(store.all('nhat_ky_chuyen_di').filter((n) => n.chuyen_di_id === t.id).reduce((s, n) => s + (n.chi_tieu || 0), 0) || t.chi_phi) || '—'}</b></div></div>
        <p class="hint">Tự lưu khi bạn rời ô nhập.</p>`;
    }
    if (tripTab === 'check') {
      const groups = parseList(t.checklist);
      if (!groups.length) {
        return html`<div class="gen"><p>Tạo checklist từ bộ mẫu theo chuyến đi của bạn:</p>
          <div class="field"><label>Số ngày</label><input type="number" min="1" name="days" value="${tripDays(t) || 2}"></div>
          <div class="field"><label>Loại chuyến</label><select name="loai">${['Du lịch', 'Công tác', 'Về quê', 'Biển', 'Núi', 'Nước ngoài', 'Khác'].map((x) => html`<option ${x === t.loai ? raw('selected') : ''}>${x}</option>`)}</select></div>
          <div class="field"><label>Phương tiện</label><select name="pt">${['Ô tô', 'Máy bay', 'Xe khách', 'Tàu hỏa', 'Xe máy'].map((x) => html`<option ${fold(t.phuong_tien || 'Ô tô') === fold(x) ? raw('selected') : ''}>${x}</option>`)}</select></div>
          <label class="switch"><input type="checkbox" name="abroad" ${t.loai === 'Nước ngoài' ? raw('checked') : ''}><span></span> Đi nước ngoài</label>
          <label class="switch"><input type="checkbox" name="kids"><span></span> Có trẻ nhỏ đi cùng</label>
          <button class="btn btn-primary" data-gen>Tạo checklist</button></div>`;
      }
      const total = groups.reduce((s, g) => s + g.items.length, 0);
      const ticked = groups.reduce((s, g) => s + g.items.filter((i) => i.state === 'x').length, 0);
      return html`<div class="progress big"><span style="width:${Math.round((100 * ticked) / total)}%"></span><em>${ticked}/${total} món đã chuẩn bị</em></div>
        <p class="hint">Chạm để tick. Bấm “quên” cho món bạn đã quên mang, lần sau nó sẽ được đẩy lên đầu.</p>
        ${groups.map((g, gi) => html`<section class="ck-group"><h4>${g.title}</h4><ul class="ck">${g.items.map((it, ii) => html`<li class="${it.state === 'x' ? 'done' : ''} ${it.state === '!' ? 'forgot' : ''}">
          <button class="ck-box" data-ck="${gi}:${ii}" aria-label="Đánh dấu">${it.state === 'x' ? '✓' : it.state === '!' ? '!' : ''}</button><span>${it.text}</span><button class="link" data-forgot="${gi}:${ii}">${it.state === '!' ? 'bỏ quên' : 'quên'}</button></li>`)}</ul></section>`)}
        <div class="ck-add"><input placeholder="Thêm món…" data-ck-new><button class="btn btn-ghost" data-ck-add>Thêm</button></div>
        <p><button class="link" data-ck-reset>Tạo lại từ bộ mẫu</button></p>`;
    }
    if (tripTab === 'journal') {
      const entries = store.all('nhat_ky_chuyen_di').filter((n) => n.chuyen_di_id === t.id).sort((a, b) => (a.ngay < b.ngay ? -1 : 1));
      return html`<button class="btn btn-primary" data-journal-new>✍️ Viết nhật ký ${t.tu_ngay && today() >= t.tu_ngay && today() <= (t.den_ngay || t.tu_ngay) ? 'hôm nay' : ''}</button>
        <div class="journal">${entries.map((n) => html`<article class="jentry" data-open="nhat_ky_chuyen_di/${n.id}">
          <div class="jdate"><b>${fmtDate(n.ngay)}</b><small>${weekdayName(n.ngay)}</small>${n.tam_trang ? html`<span class="mood">${n.tam_trang}</span>` : ''}</div>
          <div class="jbody">${n.tieu_de ? html`<h4>${n.tieu_de}</h4>` : ''}<p>${n.noi_dung || ''}</p>
            <p class="row-meta">${(n.dia_diem_ids || []).map((pid) => { const p = store.get('dia_diem', pid); return p ? html`<span class="tag">${placeIcon(p.loai)} ${p.ten}</span>` : ''; })}${n.chi_tieu ? html`<span>💸 ${money(n.chi_tieu)}</span>` : ''}</p></div></article>`)}</div>
        ${!entries.length ? html`<p class="empty">Chưa có trang nhật ký nào. Trong chuyến đi, bạn có thể nhắn Claude: “vừa ăn bún chả ở quán X, ngon, 40k”.</p>` : ''}`;
    }
    if (tripTab === 'places') {
      const ps = store.all('dia_diem').filter((p) => p.chuyen_di_id === t.id);
      const nearby = t.diem_den ? store.all('dia_diem').filter((p) => !p.chuyen_di_id && p.trang_thai === 'Muốn đến' && fold([p.dia_chi, p.tinh].join(' ')).includes(fold(t.diem_den.split(',')[0]))) : [];
      return html`<button class="btn btn-ghost" data-place-add>+ Thêm địa điểm cho chuyến này</button>
        ${ps.length ? html`<ul class="list">${ps.map(placeRow)}</ul>` : html`<p class="empty">Chưa gắn địa điểm nào.</p>`}
        ${nearby.length ? html`<h4>⭐ Nơi bạn từng muốn đến ở ${t.diem_den.split(',')[0]}</h4><ul class="list">${nearby.map(placeRow)}</ul>` : ''}`;
    }
    // Tổng quan
    const entries = store.all('nhat_ky_chuyen_di').filter((n) => n.chuyen_di_id === t.id);
    return html`<table class="kv">
        <tr><th>Trạng thái</th><td>${STATUS_ICON[effectiveStatus(t)]} ${effectiveStatus(t)}</td></tr>
        ${t.diem_den ? html`<tr><th>Điểm đến</th><td>${t.diem_den}</td></tr>` : ''}
        ${t.tu_ngay ? html`<tr><th>Thời gian</th><td>${tripDates(t)} (${tripDays(t)} ngày)</td></tr>` : ''}
        <tr><th>Loại</th><td>${t.loai || ''}${t.phuong_tien ? ' · ' + t.phuong_tien : ''}</td></tr>
        ${t.di_cung ? html`<tr><th>Đi cùng</th><td>${t.di_cung}</td></tr>` : ''}
        ${t.ngan_sach || t.chi_phi ? html`<tr><th>Chi phí</th><td>${money(t.chi_phi) || '—'} / ngân sách ${money(t.ngan_sach) || '—'}</td></tr>` : ''}
        ${t.danh_gia ? html`<tr><th>Đánh giá</th><td class="stars">${stars(t.danh_gia)}</td></tr>` : ''}
        ${t.album ? html`<tr><th>Album ảnh</th><td><a href="${t.album}" target="_blank" rel="noopener">Mở album</a></td></tr>` : ''}
        <tr><th>Nhật ký</th><td>${entries.length} trang</td></tr>
      </table>
      ${t.ghi_chu ? html`<p style="white-space:pre-wrap">${t.ghi_chu}</p>` : ''}
      <div class="form-actions"><button class="btn btn-ghost" data-trip-edit>✏️ Sửa thông tin</button><span class="spacer"></span>
        ${effectiveStatus(t) !== 'Đã đi' ? html`<button class="btn btn-primary" data-trip-done>📖 Đánh dấu đã đi</button>` : ''}</div>`;
  }

  async function saveList(t, groups) {
    try { await store.update('chuyen_di', t.id, { checklist: listToText(groups) }); } catch (err) { errorToast(err); }
    render();
  }

  function wire(t) {
    box.querySelectorAll('[data-ttab]').forEach((b) => b.onclick = () => { tripTab = b.dataset.ttab; render(); });
    box.querySelectorAll('[data-autosave]').forEach((ta) => ta.addEventListener('blur', async () => {
      const k = ta.dataset.autosave;
      if ((t[k] || '') === ta.value) return;
      try { await store.update('chuyen_di', t.id, { [k]: ta.value }); toast('Đã lưu'); } catch (err) { errorToast(err); }
    }));
    box.querySelector('[data-gen]')?.addEventListener('click', async () => {
      const q = (n) => box.querySelector(`[name="${n}"]`);
      const text = buildChecklist({ days: +q('days').value, loai: q('loai').value, phuongTien: q('pt').value, nuocNgoai: q('abroad').checked, treNho: q('kids').checked, tripId: t.id });
      try { await store.update('chuyen_di', t.id, { checklist: text, phuong_tien: t.phuong_tien || q('pt').value }); } catch (err) { errorToast(err); }
      render();
    });
    const groups = parseList(t.checklist);
    box.querySelectorAll('[data-ck]').forEach((b) => b.onclick = () => {
      const [gi, ii] = b.dataset.ck.split(':').map(Number);
      const it = groups[gi].items[ii]; it.state = it.state === 'x' ? ' ' : 'x';
      saveList(t, groups);
    });
    box.querySelectorAll('[data-forgot]').forEach((b) => b.onclick = () => {
      const [gi, ii] = b.dataset.forgot.split(':').map(Number);
      const it = groups[gi].items[ii]; it.state = it.state === '!' ? ' ' : '!';
      saveList(t, groups);
    });
    const addItem = () => {
      const inp = box.querySelector('[data-ck-new]'); const v = inp.value.trim(); if (!v) return;
      let g = groups.find((x) => x.title === '➕ Thêm của tôi'); if (!g) { g = { title: '➕ Thêm của tôi', items: [] }; groups.push(g); }
      g.items.push({ state: ' ', text: v }); saveList(t, groups);
    };
    box.querySelector('[data-ck-add]')?.addEventListener('click', addItem);
    box.querySelector('[data-ck-new]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
    box.querySelector('[data-ck-reset]')?.addEventListener('click', async () => {
      if (!confirm('Tạo lại checklist từ bộ mẫu? Các tick hiện tại sẽ mất.')) return;
      try { await store.update('chuyen_di', t.id, { checklist: '' }); } catch (err) { errorToast(err); }
      render();
    });
    box.querySelector('[data-journal-new]')?.addEventListener('click', () => {
      const d = today();
      const day = t.tu_ngay && d >= t.tu_ngay && d <= (t.den_ngay || t.tu_ngay) ? d : (t.tu_ngay || d);
      closeSheet();
      setTimeout(() => openRecord('nhat_ky_chuyen_di', null, { chuyen_di_id: t.id, ngay: day, tieu_de: `Ngày ${t.tu_ngay ? diffDays(t.tu_ngay, day) + 1 : ''}`.trim() }), 200);
    });
    box.querySelector('[data-place-add]')?.addEventListener('click', () => { closeSheet(); setTimeout(() => openRecord('dia_diem', null, { chuyen_di_id: t.id, trang_thai: 'Đã đến' }), 200); });
    box.querySelector('[data-trip-edit]')?.addEventListener('click', () => { closeSheet(); setTimeout(() => openRecord('chuyen_di', t.id), 200); });
    box.querySelector('[data-trip-done]')?.addEventListener('click', async () => {
      try { await store.update('chuyen_di', t.id, { trang_thai: 'Đã đi' }); toast('Đã chuyển vào “Đã đi”. Nhớ chấm sao cho chuyến đi nhé!'); } catch (err) { errorToast(err); }
      render();
    });
    box.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const [tb, rid] = el.dataset.open.split('/'); closeSheet(); setTimeout(() => openRecord(tb, rid), 200);
    }));
  }

  render();
  return sheet;
}

export function bindTravel(root, rerender) {
  root.querySelectorAll('[data-travel-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.travelTab; rerender();
    if ((tab === 'near' || tab === 'map') && (!myPos || Date.now() - myPos.at > 120000)) locate(rerender);
  }));
  root.querySelector('[data-locate]')?.addEventListener('click', () => locate(rerender));
  if (tab === 'map') drawMap(root.querySelector('#place-map'));
  root.querySelector('[data-trip-new]')?.addEventListener('click', () => openRecord('chuyen_di', null, { trang_thai: 'Lên kế hoạch' }));
  root.querySelector('[data-place-new]')?.addEventListener('click', () => openRecord('dia_diem', null, { trang_thai: tab === 'want' ? 'Muốn đến' : 'Đã đến' }));
}

// ---------------- Bản đồ (Leaflet + OpenStreetMap, miễn phí, không cần khóa) ----------------
let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.onload = resolve; js.onerror = () => reject(new Error('Không tải được bản đồ (mất mạng?)'));
    document.head.appendChild(js);
  });
  return leafletReady;
}

async function drawMap(el) {
  if (!el) return;
  try { await loadLeaflet(); } catch (e) { el.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const L = window.L;
  const pts = store.all('dia_diem').filter((p) => p.lat !== null && p.lat !== undefined && p.lng !== null);
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const color = { 'Đã đến': '#16a34a', 'Yêu thích': '#e11d48', 'Muốn đến': '#ea580c' };
  const bounds = [];
  pts.forEach((p) => {
    const m = L.circleMarker([p.lat, p.lng], { radius: 9, weight: 2, color: '#fff', fillColor: color[p.trang_thai] || '#64748b', fillOpacity: .95 }).addTo(map);
    m.bindPopup(`<b>${esc(p.ten)}</b><br>${esc(p.dia_chi || '')}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Chỉ đường</a>`);
    bounds.push([p.lat, p.lng]);
  });
  if (myPos) { L.circleMarker([myPos.lat, myPos.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindPopup('Bạn đang ở đây'); bounds.push([myPos.lat, myPos.lng]); }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  else map.setView(bounds[0] || [21.3, 105.2], bounds.length ? 14 : 8);
  setTimeout(() => map.invalidateSize(), 200);
}

export { esc, addDays };
