// Sự kiện từ các lịch Google khác của bạn (chỉ đọc), hiện chung trên màn Lịch và Hôm nay.
import { call } from './api.js';
import { html } from './util.js';
import { shortTitle } from './ui.js';

const LS = 'bnth-gcal';
const TTL = 5 * 60e3;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(LS + k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* đầy bộ nhớ: bỏ qua */ } };

let calendars = read('-list', null);
const cache = new Map(Object.entries(read('-cache', {})).map(([k, v]) => [k, { ...v, at: 0 }]));
const pending = new Set();
const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

export const listCalendars = () => calendars || [];
export const calOf = (id) => listCalendars().find((c) => c.id === id) || { ten: 'Lịch Google', mau: '#7986cb' };
export function isShown(c) {
  const hidden = read('-hidden', null);
  return hidden ? !hidden.includes(c.id) : !c.an;
}
export function setShown(id, on) {
  const hidden = read('-hidden', null) ?? listCalendars().filter((c) => c.an).map((c) => c.id);
  write('-hidden', on ? hidden.filter((x) => x !== id) : [...new Set([...hidden, id])]);
  cache.clear(); write('-cache', {});
  emit();
}
export const lastError = (tu, den) => cache.get(`${tu}|${den}`)?.err;

/** Sự kiện trong khoảng; tự tải (nền) khi chưa có hoặc đã cũ. */
export function eventsIn(tu, den) {
  const key = `${tu}|${den}`;
  const c = cache.get(key);
  if (!c || Date.now() - c.at > TTL) load(tu, den, key);
  const shown = new Set(listCalendars().filter(isShown).map((x) => x.id));
  return (c?.events || []).filter((e) => !calendars || shown.has(e.lich_id));
}

export function eventsOn(day, list) {
  return list.filter((e) => e.bat_dau.slice(0, 10) <= day && e.ket_thuc.slice(0, 10) >= day);
}

async function load(tu, den, key) {
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const ids = calendars ? calendars.filter(isShown).map((c) => c.id) : undefined;
    if (ids && !ids.length) { cache.set(key, { at: Date.now(), events: [] }); return; }
    const r = await call('lich_google', { tu, den, lich_ids: ids });
    calendars = r.lich; write('-list', calendars);
    cache.set(key, { at: Date.now(), events: r.su_kien, err: r.loi ? 'Không đọc được lịch: ' + r.loi.map((x) => x.lich).join(', ') : '' });
    // Giữ bản gần nhất để xem khi mất mạng.
    write('-cache', Object.fromEntries([...cache.entries()].slice(-3).map(([k, v]) => [k, { events: v.events }])));
  } catch (e) {
    const old = cache.get(key);
    cache.set(key, { at: Date.now(), events: old?.events || [], err: 'Không tải được lịch Google' });
  } finally {
    pending.delete(key);
    emit();
  }
}

/** Làm mới khi người dùng bấm đồng bộ. */
export function refresh() { cache.forEach((v) => { v.at = 0; }); emit(); }

export function gcalRow(e) {
  const cal = calOf(e.lich_id);
  const t = e.ca_ngay ? 'Cả ngày' : e.bat_dau.slice(11, 16) + (e.ket_thuc.slice(0, 10) === e.bat_dau.slice(0, 10) ? '–' + e.ket_thuc.slice(11, 16) : '');
  return html`<li class="row event gcal" style="--cal:${cal.mau}">
    <a class="gcal-link" href="${e.link || 'https://calendar.google.com'}" target="_blank" rel="noopener">
      <div class="ev-time">${t}</div>
      <div class="row-main"><div class="row-title">${shortTitle(e.ten).tags.map((x) => html`<span class="tag tag-src ${x === 'P3' ? 'tag-p3' : ''}">${x}</span> `)}${shortTitle(e.ten).text}</div>
        <div class="row-meta"><span class="gcal-name"><i class="dot" style="background:${cal.mau}"></i>${cal.ten}</span>${e.dia_diem ? html`<span class="loc">📍 ${e.dia_diem}</span>` : ''}</div></div>
    </a></li>`;
}

/** Thứ tự theo giờ: cả ngày trước, rồi theo giờ bắt đầu. */
export const timeKey = (startIso) => (startIso && startIso.length > 10 ? startIso.slice(11, 16) : '00:00');
