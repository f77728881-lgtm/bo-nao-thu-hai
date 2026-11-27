// Việc/sự kiện lặp lại: danh sách lựa chọn dễ hiểu (lưu dạng RRULE) và tên tiếng Việt ngắn.
// Kỳ sau do máy chủ tự tạo khi tích Xong (apps-script/src/26_LapLai.js).
export const PRESETS = [
  ['', 'Không lặp'],
  ['FREQ=DAILY', 'Hằng ngày'],
  ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Ngày làm việc (T2–T6)'],
  ['FREQ=WEEKLY', 'Hằng tuần (cùng thứ với hạn)'],
  ['FREQ=WEEKLY;INTERVAL=2', '2 tuần một lần'],
  ['FREQ=MONTHLY', 'Hằng tháng (cùng ngày với hạn)'],
  ['FREQ=MONTHLY;BYMONTHDAY=-1', 'Ngày cuối mỗi tháng'],
  ['FREQ=MONTHLY;INTERVAL=3', 'Hằng quý (3 tháng)'],
  ['FREQ=MONTHLY;INTERVAL=6', '6 tháng một lần'],
  ['FREQ=YEARLY', 'Hằng năm']
];
const VN = { MO: 'T2', TU: 'T3', WE: 'T4', TH: 'T5', FR: 'T6', SA: 'T7', SU: 'CN' };
export function tenLap(rule) {
  if (!rule) return '';
  const r = {}; String(rule).replace(/^RRULE:/i, '').split(';').forEach((kv) => { const [k, v] = kv.split('='); if (k && v) r[k.toUpperCase()] = v.toUpperCase(); });
  const n = Math.max(1, parseInt(r.INTERVAL || '1', 10) || 1), k = n > 1 ? n + ' ' : '';
  if (r.FREQ === 'DAILY') return k ? `mỗi ${k}ngày` : 'hằng ngày';
  if (r.FREQ === 'WEEKLY') return r.BYDAY === 'MO,TU,WE,TH,FR' ? 'ngày làm việc' : (k ? `mỗi ${k}tuần` : 'hằng tuần') + (r.BYDAY ? ` (${r.BYDAY.split(',').map((x) => VN[x] || x).join(', ')})` : '');
  if (r.FREQ === 'MONTHLY') return (n === 3 ? 'hằng quý' : k ? `mỗi ${k}tháng` : 'hằng tháng') + (r.BYMONTHDAY ? (r.BYMONTHDAY === '-1' ? ' (cuối tháng)' : ` (ngày ${r.BYMONTHDAY})`) : '');
  if (r.FREQ === 'YEARLY') return k ? `mỗi ${k}năm` : 'hằng năm';
  return 'lặp lại';
}
