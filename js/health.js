// Cảnh báo nguồn tự động (máy Mac, D-Office, Nhân sự, thư Timo) trên màn Hôm nay.
// Hỏi máy chủ tối đa 10 phút/lần; chỉ hiện khi có vấn đề.
import * as store from './store.js';
import { html, raw } from './util.js';

let cache = null, at = 0, loading = false;
const onToday = () => /^#\/?(hom-nay)?$/.test(location.hash || '#/hom-nay') || location.hash.startsWith('#/hom-nay');

export function healthCard() {
  if (!loading && Date.now() - at > 10 * 60e3) {
    loading = true;
    store.action('suc_khoe', {}).then((r) => {
      const before = JSON.stringify(cache?.canh_bao || []);
      cache = r; at = Date.now(); loading = false;
      // Vẽ lại khi có thay đổi, nhưng không đóng bảng đang mở.
      if (before !== JSON.stringify(r?.canh_bao || []) && onToday() && !document.querySelector('.sheet-wrap')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    }).catch(() => { loading = false; at = Date.now(); });
  }
  const list = cache?.canh_bao || [];
  if (!list.length) return raw('');
  return html`<section class="health-warn" role="status">${list.map((c) => html`<a class="hw-row ${c.muc_do === 'loi' ? 'loi' : ''}" href="${c.url || '#/cai-dat'}"><span>${c.muc_do === 'loi' ? '⛔' : '⚠️'}</span><span>${c.text}</span></a>`)}</section>`;
}

/** Hỏi lại máy chủ ngay ở lần vẽ sau (vd sau khi sửa cài đặt). */
export function refreshHealth() { at = 0; }
