// Kho dữ liệu trên máy: bản sao toàn bộ dữ liệu (IndexedDB), đồng bộ phần thay đổi, hàng đợi ghi khi mất mạng.
import { call, isDemo, ApiError } from './api.js';
import { fold } from './util.js';

const DB_NAME = isDemo() ? 'bnth-demo' : 'bnth';
const TABLES = ['linh_vuc', 'du_an', 'viec', 'van_ban', 'don_vi', 'theo_doi_dv', 'su_kien', 'ghi_chu', 'dia_diem', 'nguoi', 'inbox', 'chuyen_di', 'nhat_ky_chuyen_di', 'thoi_quen', 'diem_danh', 'lo_trinh', 'buoi_hoc', 'nhat_ky_ngay', 'the_hoc', 'on_tuan'];

const state = {
  tables: Object.fromEntries(TABLES.map((t) => [t, new Map()])),
  schema: null,
  since: '',
  outbox: [],          // [{ op: 'create'|'update'|'archive'|'restore'|'call', table, id, data, tmpId, action, payload }]
  lastSync: 0,
  syncing: false,
  online: navigator.onLine,
  error: null
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn(state));

// ---------------- IndexedDB ----------------
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = res; });
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tables = Object.fromEntries(TABLES.map((t) => [t, [...state.tables[t].values()]]));
    idbSet('state', { tables, schema: state.schema, since: state.since, outbox: state.outbox, lastSync: state.lastSync });
  }, 300);
}

// ---------------- Đọc ----------------
export const getState = () => state;
export const schema = () => state.schema;

export function all(table, { archived = false } = {}) {
  const out = [];
  for (const r of state.tables[table].values()) if (archived || !r.archived) out.push(r);
  return out;
}
export const get = (table, id) => state.tables[table].get(id) || null;

export function titleOf(table, rec) {
  if (!rec) return '';
  const f = state.schema?.[table]?.title || 'ten';
  return rec[f] || '(không tiêu đề)';
}

// ---------------- Khởi động + đồng bộ ----------------
export async function init() {
  // Bản demo tạo dữ liệu mới mỗi lần mở: không dùng bản sao cũ.
  const saved = isDemo() ? null : await idbGet('state');
  if (saved) {
    TABLES.forEach((t) => ((saved.tables || {})[t] || []).forEach((r) => state.tables[t].set(r.id, r)));
    state.schema = saved.schema; state.since = saved.since || ''; state.outbox = saved.outbox || []; state.lastSync = saved.lastSync || 0;
  }
  window.addEventListener('online', () => { state.online = true; emit(); sync(); });
  window.addEventListener('offline', () => { state.online = false; emit(); });
  emit();
}

let syncStarted = 0;
export async function sync() {
  if (state.syncing && Date.now() - syncStarted < 60000) return;
  syncStarted = Date.now();
  state.syncing = true; state.error = null; emit();
  try {
    await flushOutbox();
    if (!state.schema) state.schema = await call('schema');
    const res = await call('sync', { since: state.since });
    for (const t of Object.keys(res.tables)) {
      if (!state.tables[t]) continue;
      for (const r of res.tables[t]) {
        const cur = state.tables[t].get(r.id);
        if (!cur || !cur.updated_at || cur.updated_at <= r.updated_at) state.tables[t].set(r.id, r);
      }
    }
    state.since = res.server_time;
    state.lastSync = Date.now();
    persist();
  } catch (e) {
    state.error = e;
    if (e.code === 'MAT_MANG') state.online = false;
  } finally {
    state.syncing = false;
    emit();
  }
}

// ---------------- Ghi ----------------
let tmpSeq = 0;

/** Tạo bản ghi: hiện ngay trên máy, gửi lên máy chủ (hoặc xếp hàng nếu mất mạng). */
export async function create(table, data) {
  const tmpId = `tmp-${Date.now().toString(36)}-${tmpSeq++}`;
  const now = new Date().toISOString();
  const rec = { ...data, id: tmpId, created_at: now, updated_at: now, archived: false, _pending: true };
  state.tables[table].set(tmpId, rec);
  emit();
  return send({ op: 'create', table, data, tmpId });
}

export async function update(table, id, data) {
  const cur = state.tables[table].get(id);
  if (cur) state.tables[table].set(id, { ...cur, ...data, _pending: true });
  emit();
  if (id.startsWith('tmp-')) {
    // Bản ghi chưa lên máy chủ: gộp vào lệnh tạo đang chờ.
    const q = state.outbox.find((o) => o.op === 'create' && o.tmpId === id);
    if (q) { Object.assign(q.data, data); persist(); return cur; }
  }
  return send({ op: 'update', table, id, data });
}

export const archive = (table, id) => send({ op: 'archive', table, id }, () => {
  const cur = state.tables[table].get(id);
  if (cur) state.tables[table].set(id, { ...cur, archived: true });
});
export const restore = (table, id) => send({ op: 'restore', table, id });

/** Lệnh khác (theo dõi đơn vị…): cần mạng, không xếp hàng. Đồng bộ lại sau khi chạy. */
export async function action(name, payload) {
  const res = await call(name, payload);
  await sync();
  return res;
}

async function send(op, optimistic) {
  if (optimistic) { optimistic(); emit(); }
  if (!state.online || state.outbox.length) {
    state.outbox.push(op); persist(); emit();
    if (state.online) flushOutbox().then(emit);
    return null;
  }
  try {
    const rec = await runOp(op);
    persist(); emit();
    return rec;
  } catch (e) {
    if (e.code === 'MAT_MANG' || e.code === 'CHUA_XAC_THUC') {
      state.outbox.push(op); persist(); emit();
      return null;
    }
    // Máy chủ từ chối: bỏ thay đổi tạm, tải lại bản đúng.
    if (op.tmpId) state.tables[op.table].delete(op.tmpId);
    emit();
    sync();
    throw e;
  }
}

async function runOp(op) {
  let res;
  if (op.op === 'create') res = await call('create', { table: op.table, data: op.data });
  else if (op.op === 'update') res = await call('update', { table: op.table, id: op.id, data: op.data });
  else res = await call(op.op, { table: op.table, id: op.id });
  const rec = res.item;
  if (op.tmpId) {
    state.tables[op.table].delete(op.tmpId);
    // Các lệnh sau trỏ tới id tạm → đổi sang id thật.
    state.outbox.forEach((o) => { if (o.id === op.tmpId) o.id = rec.id; });
    tmpMap.set(op.tmpId, rec.id);
  }
  state.tables[op.table].set(rec.id, rec);
  if (res.warning) state.error = new ApiError('CANH_BAO', res.warning);
  if (rec.cal_pending === '1') scheduleCalendarFlush();
  if (res.lien_quan) setTimeout(() => sync(), 400); // máy chủ tự tạo/sửa bản ghi liên quan (vd việc từ văn bản)
  return rec;
}

// Máy chủ trả lời ngay khi ghi, còn việc đưa lên Google Calendar được gọi ngầm ngay sau (gom nhiều lần ghi làm một).
let flushTimer = null;
function scheduleCalendarFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { call('calendar_flush').catch(() => { /* máy chủ tự thử lại sau 15 phút */ }); }, 1500);
}
export const tmpMap = new Map();

let flushing = null;
async function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    while (state.outbox.length) {
      const op = state.outbox[0];
      try {
        await runOp(op);
      } catch (e) {
        if (e.code === 'MAT_MANG' || e.code === 'CHUA_XAC_THUC') throw e;
        // Lệnh bị máy chủ từ chối (dữ liệu sai): bỏ lệnh, ghi lỗi để người dùng biết.
        if (op.tmpId) state.tables[op.table].delete(op.tmpId);
        state.error = e;
      }
      state.outbox.shift();
      persist();
    }
  })();
  try { await flushing; } finally { flushing = null; }
}

// ---------------- Tìm kiếm trên máy ----------------
const SEARCH_TABLES = ['viec', 'van_ban', 'su_kien', 'ghi_chu', 'dia_diem', 'nguoi', 'du_an', 'inbox', 'don_vi', 'chuyen_di', 'nhat_ky_chuyen_di', 'thoi_quen', 'lo_trinh', 'buoi_hoc', 'the_hoc'];

export function search(q, { limit = 60 } = {}) {
  const query = fold(q);
  if (!query) return [];
  const tokens = query.split(' ');
  let hits = [];
  for (const table of SEARCH_TABLES) {
    const def = state.schema?.[table];
    if (!def) continue;
    const fields = Object.keys(def.fields).filter((k) => ['text', 'longtext', 'list', 'enum'].includes(def.fields[k].type));
    for (const r of state.tables[table].values()) {
      if (r.archived) continue;
      const text = fold(fields.map((f) => (Array.isArray(r[f]) ? r[f].join(' ') : r[f] ?? '')).join(' • '));
      if (!tokens.every((t) => text.includes(t))) continue;
      const title = fold(r[def.title]);
      let score = title === query ? 50 : title.includes(query) ? 20 + (10 * query.length) / Math.max(title.length, 1) : 0;
      tokens.forEach((t) => { if (title.includes(t)) score += 3; });
      if (r.ghim) score += 2;
      const phrase = text.includes(query);
      if (phrase) score += 10;
      hits.push({ table, rec: r, score, text, phrase });
    }
  }
  // Có kết quả khớp nguyên cụm từ thì bỏ các kết quả chỉ khớp rời rạc từng chữ ("dự thảo… đang làm" ≠ "lâm thao").
  if (tokens.length > 1 && hits.some((h) => h.phrase)) hits = hits.filter((h) => h.phrase);
  hits.sort((a, b) => b.score - a.score || (a.rec.updated_at < b.rec.updated_at ? 1 : -1));
  return hits.slice(0, limit);
}
