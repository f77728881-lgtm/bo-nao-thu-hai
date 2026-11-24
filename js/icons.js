// Bộ biểu tượng nét mảnh, bo tròn (vẽ riêng cho app, 24×24, nét 1.8). Dùng: icon('note').
const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  note: '<path d="M5 4h14a1 1 0 0 1 1 1v9l-6 6H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 20v-5a1 1 0 0 1 1-1h5M8 9h8M8 13h4"/>',
  task: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  doc: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="3"/><path d="M15.5 8.5V6.5a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2"/>',
  paste: '<rect x="5" y="4.5" width="14" height="17" rx="3"/><path d="M9 4.5V3.5h6v1M9 11h6M9 15h4"/>',
  pin: '<path d="M12 16.5V21M8.5 3.5h7l-1 5.5 3.5 4H6l3.5-4z"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  travel: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.6 1.6-2.6H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.5L4 8.5M4.5 13A7.5 7.5 0 0 0 18 17.5l2-2"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
  inbox: '<path d="M3.5 13.5h5l1.5 3h4l1.5-3h5"/><path d="M6 5h12l2.5 8.5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4.5z"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  place: '<path d="M12 21s6.5-6 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  building: '<path d="M5 20.5V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M16 9.5h1.5a2 2 0 0 1 2 2v9M3.5 20.5h17M8.5 7.5h4M8.5 11.5h4M8.5 15.5h4"/>',
  event: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  share: '<circle cx="6.5" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="m8.6 10.9 6.8-3.7M8.6 13.1l6.8 3.7"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.5 1 1 2-2M3.5 12l1 1 2-2M3.5 17.5l1 1 2-2"/>',
  text: '<path d="M4 6h16M4 11h16M4 16h10"/>'
};

const SPRITE_ID = 'bnth-icons';
export function injectSprite() {
  if (document.getElementById(SPRITE_ID)) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg id="${SPRITE_ID}" xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(P)
    .map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('')}</svg>`;
  document.body.prepend(wrap.firstChild);
}

/** Thẻ <svg> dùng biểu tượng (đã thoát an toàn, dùng trong html``). */
export function icon(name, cls = '') {
  return { __raw: `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>` };
}
export const iconHtml = (name, cls = '') => icon(name, cls).__raw;
injectSprite();
