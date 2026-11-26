// Tỉ giá USD (Vietcombank) và giá vàng trong nước (PNJ / Bảo Tín Minh Châu), mỗi ngày một dòng ở bảng gia_thi_truong.
// Hôm nay: một dòng gọn trong thẻ đầu trang (USD bán, SJC bán, mũi tên so với hôm trước). Chạm → bảng chi tiết + biểu đồ 30 ngày.
import * as store from './store.js';
import { html, raw, today, fmtDate } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';

const PREF = 'bnth.showMarket';
export const marketOn = () => localStorage.getItem(PREF) !== '0';
const rows = () => store.all('gia_thi_truong').sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
const dot = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const tr = (n) => (Math.round(n / 1e5) / 10).toFixed(1).replace('.', ',');
/** Tăng/giảm so với ngày trước: ▲ xanh, ▼ đỏ, = xám. unit 'tr' → triệu đồng. */
function delta(cur, prev, unit) {
  if (!cur || !prev) return '';
  const d = cur - prev;
  if (!d) return html`<i class="mk-d eq">=</i>`;
  const v = unit === 'tr' ? tr(Math.abs(d)) : dot(Math.abs(d));
  return html`<i class="mk-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${v}</i>`;
}

/** Dòng gọn trong thẻ đầu trang Hôm nay. */
export function marketStrip() {
  if (!marketOn()) return raw('');
  const [cur, prev] = rows();
  if (!cur) return raw('');
  const stale = cur.ngay !== today();
  return html`<button class="tt-market" data-market aria-label="Tỉ giá và giá vàng">
    ${cur.usd_ban ? html`<span>💵 USD <b>${dot(cur.usd_ban)}</b>${delta(cur.usd_ban, prev?.usd_ban)}</span>` : ''}
    ${cur.sjc_ban ? html`<span>🥇 SJC <b>${tr(cur.sjc_ban)}tr</b>${delta(cur.sjc_ban, prev?.sjc_ban, 'tr')}</span>` : ''}
    ${stale ? html`<small>${fmtDate(cur.ngay)}</small>` : ''}</button>`;
}

function spark(key, label, unit) {
  const pts = rows().slice(0, 30).reverse().filter((r) => r[key]);
  if (pts.length < 2) return raw('');
  const vals = pts.map((r) => r[key]);
  const min = Math.min(...vals), max = Math.max(...vals), W = 300, H = 56;
  const x = (i) => (i * W / (pts.length - 1)).toFixed(1), y = (v) => (max === min ? H / 2 : H - 4 - (v - min) / (max - min) * (H - 8)).toFixed(1);
  const f = unit === 'tr' ? (v) => tr(v) + 'tr' : dot;
  const first = vals[0], last = vals[vals.length - 1];
  return html`<div class="mk-spark"><div class="mk-spark-h"><b>${label}</b><small>${pts.length} ngày · thấp ${f(min)} · cao ${f(max)}</small></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.map((r, i) => `${x(i)},${y(r[key])}`).join(' ')}" class="${last >= first ? 'up' : 'down'}"/></svg>
    <div class="mk-spark-f"><small>${fmtDate(pts[0].ngay)}</small><small>${fmtDate(pts[pts.length - 1].ngay)}</small></div></div>`;
}

function body() {
  const [cur, prev] = rows();
  if (!cur) return html`<p class="empty">Chưa có số liệu. Bấm “Cập nhật ngay”.</p>`;
  const line = (name, buy, sell, k1, k2, unit) => html`<tr><th>${name}</th>
    <td>${buy ? (unit === 'tr' ? tr(buy) : dot(buy)) : '—'}${delta(buy, prev?.[k1], unit)}</td>
    <td><b>${sell ? (unit === 'tr' ? tr(sell) : dot(sell)) : '—'}</b>${delta(sell, prev?.[k2], unit)}</td></tr>`;
  return html`
    <p class="row-meta">Cập nhật ${cur.luc || ''} ${fmtDate(cur.ngay, true)}${prev ? ` · so với ${fmtDate(prev.ngay)}` : ''}</p>
    <h4>💵 Đô la Mỹ (Vietcombank, đồng)</h4>
    <table class="mk-table"><thead><tr><th></th><th>Mua</th><th>Bán</th></tr></thead><tbody>
      ${line('Tiền mặt', cur.usd_mua, cur.usd_ban, 'usd_mua', 'usd_ban')}
      ${cur.usd_ck ? html`<tr><th>Chuyển khoản</th><td>${dot(cur.usd_ck)}${delta(cur.usd_ck, prev?.usd_ck)}</td><td></td></tr>` : ''}
    </tbody></table>
    <h4>🥇 Vàng (triệu đồng/lượng)</h4>
    <table class="mk-table"><thead><tr><th></th><th>Mua vào</th><th>Bán ra</th></tr></thead><tbody>
      ${line('Miếng SJC', cur.sjc_mua, cur.sjc_ban, 'sjc_mua', 'sjc_ban', 'tr')}
      ${line('Nhẫn trơn 999.9', cur.nhan_mua, cur.nhan_ban, 'nhan_mua', 'nhan_ban', 'tr')}
    </tbody></table>
    ${cur.sjc_mua && cur.sjc_ban ? html`<p class="hint">Chênh mua–bán SJC: ${tr(cur.sjc_ban - cur.sjc_mua)} triệu/lượng — mua rồi bán ngay sẽ lỗ khoản này.</p>` : ''}
    ${spark('usd_ban', 'USD bán ra', '')}
    ${spark('sjc_ban', 'Vàng SJC bán ra', 'tr')}
    <p class="hint">Nguồn: ${cur.nguon || '—'}. Số liệu tham khảo, lấy tự động lúc 8:40, 11:00, 14:30, 16:45; giá giao dịch thực tế theo từng cửa hàng.</p>`;
}

export function openMarket() {
  const box = document.createElement('div');
  box.className = 'market';
  const draw = () => {
    box.innerHTML = html`${body()}
      <div class="form-actions"><label class="switch"><input type="checkbox" data-mk-show ${marketOn() ? raw('checked') : ''}><span></span> Hiện trên Hôm nay</label><span class="spacer"></span><button class="btn btn-primary" data-mk-refresh>↻ Cập nhật ngay</button></div>`.__raw;
    box.querySelector('[data-mk-show]').onchange = (e) => { localStorage.setItem(PREF, e.target.checked ? '1' : '0'); toast(e.target.checked ? 'Sẽ hiện trên Hôm nay' : 'Đã ẩn khỏi Hôm nay (vẫn xem ở Thêm → Tỉ giá & vàng)'); };
    box.querySelector('[data-mk-refresh]').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Đang lấy giá…';
      try {
        const r = await store.action('gia_cap_nhat', {});
        if (r?.ghi_chu) toast(r.ghi_chu);
        else if (r?.loi?.length) toast('Một nguồn tạm lỗi: ' + r.loi[0], { kind: 'error' });
        else toast('Đã cập nhật giá', { kind: 'ok' });
      } catch (err) { errorToast(err); }
      draw();
    };
  };
  draw();
  openSheet(box, { title: 'Tỉ giá & giá vàng' });
}
