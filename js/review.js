// Tổng kết cuối ngày: trạng thái tinh thần → đã xong → khép việc dở → phân loại → biết ơn → 3 ưu tiên ngày mai.
// Dựa trên các thực hành có cơ sở: gọi tên cảm xúc, ghi nhận thành quả nhỏ, khép "vòng lặp mở" trước khi ngủ,
// biết ơn, chọn ít việc quan trọng cho ngày mai. Không thay thế tư vấn chuyên môn.
import * as store from './store.js';
import { html, raw, esc, today, addDays, fmtDate, weekdayName, dayOf, whenLabel } from './util.js';
import { openSheet, toast, errorToast } from './ui.js';
import { icon } from './icons.js';
import { copyText, mainLabel } from './notes.js';

const MOODS = [[1, '😞', 'Rất tệ'], [2, '😕', 'Không ổn'], [3, '😐', 'Bình thường'], [4, '🙂', 'Khá tốt'], [5, '😄', 'Rất tốt']];
const EMOTIONS = ['vui', 'bình tĩnh', 'biết ơn', 'hào hứng', 'tự hào', 'được yêu thương', 'mệt', 'lo lắng', 'áp lực', 'buồn', 'cáu', 'cô đơn', 'bối rối', 'chán'];
const moodEmoji = (n) => (MOODS.find((m) => m[0] === n) || [0, '·'])[1];

const entryFor = (d) => store.all('nhat_ky_ngay').find((r) => r.ngay === d) || null;

// ---------------- Gợi ý chăm sóc bản thân ----------------
export function suggestions(st, history = []) {
  const out = [];
  const has = (e) => (st.cam_xuc || []).includes(e);
  if ((st.cang_thang || 0) >= 4 || has('áp lực') || has('lo lắng')) {
    out.push(['Thở hộp 2 phút', 'Hít vào 4 giây · giữ 4 · thở ra 4 · giữ 4. Lặp 6–8 vòng, vai thả lỏng.']);
    out.push(['Xả lo lắng ra giấy', 'Ghi 3 điều đang lo vào ô "Điều đang bận lòng", mỗi điều kèm 1 việc nhỏ làm được ngày mai. Phần còn lại cho phép mình để đó.']);
  }
  if (st.tam_trang && st.tam_trang <= 2) {
    out.push(['Một việc nhỏ dễ chịu 10 phút', 'Đi bộ, tắm nước ấm, nghe một bài nhạc thích, uống một cốc trà. Hành động nhỏ kéo tâm trạng lên trước, động lực theo sau.']);
    out.push(['Kết nối', 'Nhắn hoặc gọi cho một người bạn tin tưởng, không cần lý do.']);
    out.push(['Nói với mình như với một người bạn', '“Hôm nay khó, mình đã cố gắng. Ngày mai làm từng việc nhỏ thôi.”']);
  }
  if ((st.nang_luong && st.nang_luong <= 2) || (st.giac_ngu && st.giac_ngu <= 2)) {
    out.push(['Ưu tiên giấc ngủ tối nay', 'Ngủ sớm hơn 30 phút, cất điện thoại 30 phút trước khi ngủ, không cà phê sau 14h, giữ giờ thức cố định.']);
  }
  if (has('cáu')) out.push(['Dừng 90 giây', 'Cơn cáu tự hạ sau khoảng 90 giây nếu không “đổ thêm dầu”: rời chỗ, uống nước, thở chậm rồi mới phản hồi.']);
  if (has('cô đơn')) out.push(['Một kết nối nhỏ', 'Hẹn cà phê, gọi video người thân, hoặc đơn giản chào hỏi đồng nghiệp lâu chưa gặp.']);
  if (st.tam_trang >= 4) out.push(['Giữ lại điều tốt', 'Ghi điều gì đã làm hôm nay tốt vào ô nhật ký để lặp lại.']);
  const low = [...history, st].slice(-3).filter((r) => r && r.tam_trang && r.tam_trang <= 2).length;
  if (low >= 3) {
    out.unshift(['Tâm trạng thấp mấy ngày liền', 'Hãy nghỉ ngơi nhiều hơn và chia sẻ với người thân. Nếu kéo dài 2 tuần, hoặc có lúc nghĩ đến chuyện làm hại bản thân, hãy gặp bác sĩ hoặc chuyên gia tâm lý; khẩn cấp gọi 115.', 'warn']);
  }
  if (!out.length) out.push(['Giữ nhịp', 'Một ngày ổn. Uống đủ nước, vận động nhẹ và ngủ đúng giờ để giữ năng lượng.']);
  return out;
}

function claudePrompt(st, done, undone) {
  return `Bạn là một chuyên gia tâm lý ấm áp, theo hướng trị liệu nhận thức – hành vi (CBT) và chánh niệm. Hãy lắng nghe và trò chuyện với tôi bằng tiếng Việt, không chẩn đoán bệnh.

Check-in tối nay (${fmtDate(st.ngay, true)}):
- Tâm trạng: ${st.tam_trang || '?'}/5 · Năng lượng: ${st.nang_luong || '?'}/5 · Căng thẳng: ${st.cang_thang || '?'}/5 · Giấc ngủ đêm qua: ${st.giac_ngu || '?'}/5
- Cảm xúc: ${(st.cam_xuc || []).join(', ') || '(chưa chọn)'}
- Nhật ký: ${st.nhat_ky || '(trống)'}
- Điều đang bận lòng: ${st.ban_long || '(trống)'}
- Tôi muốn cải thiện: ${st.muon_cai_thien || '(trống)'}
- Hôm nay đã xong ${done} việc; còn ${undone} việc dở.

Hãy: (1) phản hồi để tôi thấy được thấu hiểu; (2) giúp tôi nhìn điều đang bận lòng một cách cân bằng hơn; (3) gợi ý 2–3 việc nhỏ, cụ thể cho tối nay và ngày mai; (4) hỏi tôi một câu để tự suy ngẫm. Trả lời ngắn gọn, nhẹ nhàng.`;
}

// ---------------- Dữ liệu trong ngày ----------------
function doneToday(d) {
  const tasks = store.all('viec').filter((v) => v.trang_thai === 'Xong' && v.hoan_thanh_luc && isoToVnDay(v.hoan_thanh_luc) === d);
  const habits = store.all('diem_danh').filter((x) => x.ngay === d).map((x) => store.get('thoi_quen', x.thoi_quen_id)).filter(Boolean);
  const sessions = store.all('buoi_hoc').filter((b) => b.trang_thai === 'Đã xong' && b.ngay_xong === d);
  const docs = store.all('van_ban').filter((x) => x.trang_thai === 'Xong' && x.updated_at && isoToVnDay(x.updated_at) === d);
  return { tasks, habits, sessions, docs, total: tasks.length + habits.length + sessions.length + docs.length };
}
const isoToVnDay = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const openTasks = () => store.all('viec').filter((v) => v.trang_thai !== 'Xong');

// ---------------- Trình hướng dẫn ----------------
const STEPS = ['Tinh thần', 'Đã xong', 'Việc dở', 'Phân loại', 'Biết ơn', 'Ngày mai'];

/** Bảng chấm gợi ý sẵn từ thói quen hôm nay (+ đã làm / − chưa làm). */
function scorecardDraft(d) {
  const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(d + 'T00:00:00Z').getUTCDay()];
  const done = new Set(store.all('diem_danh').filter((x) => x.ngay === d).map((x) => x.thoi_quen_id));
  return store.all('thoi_quen').filter((h) => h.trang_thai === 'Đang theo' && (h.tan_suat !== 'Ngày thường' || !['T7', 'CN'].includes(wd)) && (h.tan_suat !== 'Chọn ngày' || (h.ngay_trong_tuan || []).includes(wd)))
    .map((h) => (h.loai === 'Bỏ' ? (done.has(h.id) ? `+ Tránh được: ${h.ten}` : `− ${h.ten}`) : (done.has(h.id) ? `+ ${h.ten}` : `− Chưa ${h.ten.toLowerCase()}`)))
    .join('\n');
}
function scoreSummary(text) {
  const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const n = (c) => lines.filter((x) => x.startsWith(c) || (c === '−' && x.startsWith('-'))).length;
  return lines.length ? `+ ${n('+')} · − ${n('−')} · = ${n('=')}` : '';
}

export function openReview(d = today()) {
  const prev = entryFor(d);
  const history = store.all('nhat_ky_ngay').filter((r) => r.ngay < d).sort((a, b) => (a.ngay < b.ngay ? -1 : 1));
  const st = {
    ngay: d, tam_trang: prev?.tam_trang || null, nang_luong: prev?.nang_luong || null, cang_thang: prev?.cang_thang || null,
    giac_ngu: prev?.giac_ngu || null, cam_xuc: [...(prev?.cam_xuc || [])], nhat_ky: prev?.nhat_ky || '', ban_long: prev?.ban_long || '',
    muon_cai_thien: prev?.muon_cai_thien || '', biet_on: prev?.biet_on || '', dieu_hoc: prev?.dieu_hoc || '',
    uu_tien_mai: [...(prev?.uu_tien_mai || [])], viec_doi: prev?.viec_doi || '',
    cham_diem: prev?.cham_diem || scorecardDraft(d)
  };
  const moved = [];
  let step = 0;
  const box = document.createElement('div');
  box.className = 'review';
  const sheet = openSheet(box, { title: `Tổng kết ${weekdayName(d, true)} ${fmtDate(d)}` });

  const scale = (k, label, hint) => html`<div class="scale"><span>${label}</span><div class="opts">${[1, 2, 3, 4, 5].map((n) => html`<button class="opt sq ${st[k] === n ? 'on' : ''}" data-scale="${k}:${n}">${n}</button>`)}</div><small>${hint}</small></div>`;

  function body() {
    if (step === 0) {
      return html`
        <h3>Hôm nay bạn thấy thế nào?</h3>
        <div class="moods">${MOODS.map(([n, e, l]) => html`<button class="mood ${st.tam_trang === n ? 'on' : ''}" data-mood="${n}"><span>${e}</span><small>${l}</small></button>`)}</div>
        ${scale('nang_luong', 'Năng lượng', '1 cạn kiệt · 5 tràn đầy')}
        ${scale('cang_thang', 'Căng thẳng', '1 thư thái · 5 rất căng')}
        ${scale('giac_ngu', 'Giấc ngủ đêm qua', '1 rất tệ · 5 rất ngon')}
        <h4>Gọi tên cảm xúc</h4>
        <div class="chips">${EMOTIONS.map((e) => html`<button class="chip ${st.cam_xuc.includes(e) ? 'on' : ''}" data-emo="${e}">${e}</button>`)}</div>
        <div class="field"><label>Nhật ký hôm nay</label><textarea data-st="nhat_ky" rows="3" placeholder="Điều gì đáng nhớ, điều gì làm bạn vui hay mệt…">${st.nhat_ky}</textarea></div>
        <div class="field"><label>Điều đang bận lòng</label><textarea data-st="ban_long" rows="2" placeholder="Viết ra để đầu óc nhẹ hơn">${st.ban_long}</textarea></div>
        <div class="field"><label>Bạn muốn tâm trạng / bản thân cải thiện thế nào?</label><textarea data-st="muon_cai_thien" rows="2" placeholder="Vd: bớt lo nghĩ khi về nhà, ngủ sớm hơn, kiên nhẫn hơn…">${st.muon_cai_thien}</textarea></div>
        <section class="care"><h4>${icon('spark')} Gợi ý cho bạn</h4>${suggestions(st, history).map(([t, d2, kind]) => html`<div class="care-item ${kind || ''}"><b>${t}</b><p>${d2}</p></div>`)}
          <div class="ai-row"><button class="btn btn-ghost" data-talk="claude">${icon('user')} Trò chuyện với Claude</button><button class="btn btn-ghost" data-talk="copy">${icon('copy')} Chép nội dung</button></div></section>`;
    }
    if (step === 1) {
      const dn = doneToday(d);
      const li = (ic, t) => html`<li>${icon(ic)} <span>${t}</span></li>`;
      return html`<h3>${dn.total ? `Hôm nay bạn đã hoàn thành ${dn.total} việc 👏` : 'Hôm nay chưa đánh dấu việc nào xong'}</h3>
        <p class="hint">${dn.total ? 'Dừng lại vài giây ghi nhận công sức của mình. Việc nhỏ cũng là tiến bộ.' : 'Không sao cả. Có những ngày dành để nghỉ, để xử lý việc không tên. Bạn vẫn có thể tick bổ sung ở màn Việc.'}</p>
        <ul class="done-list">${dn.tasks.map((v) => li('task', v.ten))}${dn.habits.map((h) => li('check', 'Thói quen: ' + h.ten))}${dn.sessions.map((b) => li('spark', b.tieu_de))}${dn.docs.map((x) => li('doc', 'Văn bản ' + x.so_hieu))}</ul>`;
    }
    if (step === 2) {
      const list = openTasks().filter((v) => v.han && dayOf(v.han) <= d).sort((a, b) => (a.han < b.han ? -1 : 1));
      return html`<h3>${list.length ? `Còn ${list.length} việc dở, hãy chốt từng việc` : 'Không còn việc dở hạn hôm nay 🎉'}</h3>
        <p class="hint">Quyết định chỗ cho mỗi việc giúp đầu óc thôi “nhắc lại” khi bạn nghỉ ngơi.</p>
        <ul class="list">${list.map((v) => html`<li class="row close-loop" data-id="${v.id}"><div class="row-main"><div class="row-title">${v.ten}</div><div class="row-meta"><span class="due due-over">${whenLabel(v.han)}</span></div>
          <div class="opts small"><button class="opt" data-move="tomorrow">Dời mai</button><button class="opt" data-move="pick">Chọn ngày</button><button class="opt" data-move="done">Xong rồi</button><button class="opt" data-move="drop">Bỏ</button><input type="date" class="pick-date" hidden></div></div></li>`)}</ul>`;
    }
    if (step === 3) {
      const inbox = store.all('inbox').filter((i) => !i.da_xu_ly);
      const notes = store.all('ghi_chu').filter((n) => !(n.nhan || []).includes('#Prompt') && mainLabel(n) === '#0_Inbox');
      return html`<h3>Phân loại nhanh</h3>
        ${!inbox.length && !notes.length ? html`<p class="hint">Inbox đã trống. Tuyệt!</p>` : ''}
        ${notes.length ? html`<h4>Ghi chú #0_Inbox (${notes.length})</h4><ul class="list">${notes.map((n) => html`<li class="row" data-note="${n.id}"><div class="row-main"><div class="row-title">${n.tieu_de || (n.noi_dung || '').slice(0, 80)}</div>
          <div class="opts small"><select class="opt" data-place><option value="">Xếp vào dự án / lĩnh vực…</option><optgroup label="Dự án">${store.all('du_an').filter((d) => d.trang_thai === 'Đang làm' || d.trang_thai === 'Tạm dừng').map((d) => html`<option value="du_an:${d.id}">📁 ${d.ten}</option>`)}</optgroup><optgroup label="Lĩnh vực">${store.all('linh_vuc').map((a) => html`<option value="linh_vuc:${a.id}">🗂 ${a.ten}</option>`)}</optgroup></select><button class="opt" data-label="#1_Work">Tài nguyên</button><button class="opt" data-label="#3_Archive">Lưu trữ</button></div></div></li>`)}</ul>` : ''}
        ${inbox.length ? html`<h4>Inbox (${inbox.length})</h4><ul class="list">${inbox.map((i) => html`<li class="row" data-inbox="${i.id}"><div class="row-main"><div class="row-title">${i.noi_dung.slice(0, 120)}</div>
          <div class="opts small"><button class="opt" data-ib="task">Thành việc</button><button class="opt" data-ib="note">Ghi chú</button><button class="opt" data-ib="done">Đã xử lý</button></div></div></li>`)}</ul>` : ''}`;
    }
    if (step === 4) {
      return html`<h3>Khép ngày bằng lòng biết ơn</h3>
        <p class="hint">Ghi 1–3 điều bạn biết ơn hôm nay, dù rất nhỏ (một bữa ăn ngon, một lời hỏi thăm…).</p>
        <div class="field"><textarea data-st="biet_on" rows="4" placeholder="1. …&#10;2. …&#10;3. …">${st.biet_on}</textarea></div>
        <div class="field"><label>Một điều học được hôm nay</label><textarea data-st="dieu_hoc" rows="2">${st.dieu_hoc}</textarea></div>
        <h4>Bảng chấm thói quen</h4>
        <p class="hint">Mỗi dòng một hành vi trong ngày: <b>+</b> có ích cho con người bạn muốn trở thành, <b>−</b> kéo bạn lùi, <b>=</b> trung tính. Chỉ cần nhận ra, không phán xét.</p>
        <div class="field"><textarea data-st="cham_diem" rows="6" class="scorecard">${st.cham_diem}</textarea></div>
        <p class="row-meta">${scoreSummary(st.cham_diem)}</p>`;
    }
    const opens = openTasks().sort((a, b) => ((b.gap && b.quan_trong) - (a.gap && a.quan_trong)) || ((a.han || '9') < (b.han || '9') ? -1 : 1)).slice(0, 25);
    return html`<h3>3 ưu tiên cho ngày mai</h3>
      <p class="hint">Chọn tối đa 3 việc quan trọng nhất. Sáng mai chúng sẽ hiện đầu màn Hôm nay.</p>
      <ul class="list pick3">${opens.map((v) => html`<li class="row"><label class="ref-opt"><input type="checkbox" data-pick="${v.id}" ${st.uu_tien_mai.includes(v.id) ? raw('checked') : ''}> <span>${v.ten}</span>${v.han ? html` <small class="due">${whenLabel(v.han)}</small>` : ''}</label></li>`)}</ul>`;
  }

  async function saveDraft(final = false) {
    const data = { ...st, so_viec_xong: doneToday(d).total, viec_doi: [st.viec_doi, ...moved].filter(Boolean).join('\n') };
    if (final) data.hoan_thanh = true;
    delete data.ngay;
    const cur = entryFor(d);
    try {
      if (cur) await store.update('nhat_ky_ngay', cur.id, data);
      else await store.create('nhat_ky_ngay', { ngay: d, ...data });
    } catch (e) { errorToast(e); }
  }

  function render() {
    box.innerHTML = html`
      <div class="steps">${STEPS.map((s, i) => html`<button class="step ${i === step ? 'on' : i < step ? 'past' : ''}" data-step="${i}">${i + 1}. ${s}</button>`)}</div>
      <div class="review-body">${body()}</div>
      <div class="form-actions">${step > 0 ? html`<button class="btn btn-ghost" data-prev>Quay lại</button>` : ''}<span class="spacer"></span>
        ${step < STEPS.length - 1 ? html`<button class="btn btn-primary" data-next>Tiếp</button>` : html`<button class="btn btn-primary" data-finish>${icon('moon')} Khép lại ngày</button>`}</div>`.__raw;
    wire();
  }

  function wire() {
    box.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { step = +b.dataset.step; render(); });
    box.querySelector('[data-prev]')?.addEventListener('click', () => { step--; render(); });
    box.querySelector('[data-next]')?.addEventListener('click', () => { if (step === 0) saveDraft(); step++; render(); box.scrollIntoView?.(); });
    box.querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => { st.tam_trang = +b.dataset.mood; render(); });
    box.querySelectorAll('[data-scale]').forEach((b) => b.onclick = () => { const [k, n] = b.dataset.scale.split(':'); st[k] = +n; render(); });
    box.querySelectorAll('[data-emo]').forEach((b) => b.onclick = () => { const e = b.dataset.emo; st.cam_xuc = st.cam_xuc.includes(e) ? st.cam_xuc.filter((x) => x !== e) : [...st.cam_xuc, e]; render(); });
    box.querySelectorAll('[data-st]').forEach((t) => t.addEventListener('input', () => { st[t.dataset.st] = t.value; }));
    box.querySelectorAll('[data-talk]').forEach((b) => b.onclick = async () => {
      const dn = doneToday(d).total, und = openTasks().filter((v) => v.han && dayOf(v.han) <= d).length;
      const p = claudePrompt(st, dn, und);
      await copyText(p);
      if (b.dataset.talk === 'claude') window.open('https://claude.ai/new?q=' + encodeURIComponent(p), '_blank', 'noopener');
      toast('Đã chép nội dung check-in');
    });
    box.querySelectorAll('.close-loop').forEach((row) => {
      const id = row.dataset.id, v = store.get('viec', id);
      const done = (label) => { row.classList.add('resolved'); row.querySelector('.opts').innerHTML = `<span class="tag st-done">${label}</span>`; moved.push(`${v.ten}: ${label}`); };
      row.querySelectorAll('[data-move]').forEach((b) => b.onclick = async () => {
        const kind = b.dataset.move;
        try {
          if (kind === 'tomorrow') { const nd = addDays(d, 1) + (v.han.length > 10 ? v.han.slice(10) : ''); store.update('viec', id, { han: nd }).catch(errorToast); done('Dời sang mai'); }
          else if (kind === 'done') { store.update('viec', id, { trang_thai: 'Xong' }).catch(errorToast); done('Đã xong'); }
          else if (kind === 'drop') { store.archive('viec', id).catch(errorToast); done('Đã bỏ (lưu trữ)'); }
          else {
            const inp = row.querySelector('.pick-date'); inp.hidden = false; inp.focus(); inp.showPicker?.();
            inp.onchange = async () => { if (!inp.value) return; await store.update('viec', id, { han: inp.value + (v.han.length > 10 ? v.han.slice(10) : '') }); done('Dời sang ' + fmtDate(inp.value)); };
          }
        } catch (e) { errorToast(e); }
      });
    });
    box.querySelectorAll('[data-note] [data-place]').forEach((sel) => sel.onchange = async () => {
      const row = sel.closest('[data-note]'); const n = store.get('ghi_chu', row.dataset.note);
      if (!sel.value) return;
      const [t, id] = sel.value.split(':');
      const rest = (n.nhan || []).filter((x) => !/^#[0-3]/.test(x));
      const patch = t === 'du_an' ? { du_an_id: id, linh_vuc_id: store.get('du_an', id)?.linh_vuc_id || '', nhan: ['#1_Work', ...rest] } : { linh_vuc_id: id, du_an_id: '', nhan: ['#1_Work', ...rest] };
      try { await store.update('ghi_chu', n.id, patch); row.classList.add('resolved'); row.querySelector('.opts').innerHTML = `<span class="tag st-done">→ ${esc(sel.selectedOptions[0].textContent)}</span>`; } catch (e) { errorToast(e); }
    });
    box.querySelectorAll('[data-note]').forEach((row) => row.querySelectorAll('[data-label]').forEach((b) => b.onclick = async () => {
      const n = store.get('ghi_chu', row.dataset.note);
      try { await store.update('ghi_chu', n.id, { nhan: [b.dataset.label, ...(n.nhan || []).filter((x) => !x.startsWith('#0') && !x.startsWith('#1') && !x.startsWith('#2') && !x.startsWith('#3'))] }); row.classList.add('resolved'); row.querySelector('.opts').innerHTML = `<span class="tag st-done">→ ${b.textContent}</span>`; } catch (e) { errorToast(e); }
    }));
    box.querySelectorAll('[data-inbox]').forEach((row) => row.querySelectorAll('[data-ib]').forEach((b) => b.onclick = async () => {
      const it = store.get('inbox', row.dataset.inbox);
      try {
        if (b.dataset.ib === 'task') await store.create('viec', { ten: it.noi_dung.slice(0, 200), han: addDays(d, 1) });
        if (b.dataset.ib === 'note') await store.create('ghi_chu', { noi_dung: it.noi_dung, nhan: ['#0_Inbox'] });
        await store.update('inbox', it.id, { da_xu_ly: true, xu_ly_thanh: b.dataset.ib === 'task' ? 'viec' : b.dataset.ib === 'note' ? 'ghi_chu' : '' });
        row.classList.add('resolved'); row.querySelector('.opts').innerHTML = '<span class="tag st-done">Đã xử lý</span>';
      } catch (e) { errorToast(e); }
    }));
    box.querySelectorAll('[data-pick]').forEach((c) => c.onchange = () => {
      const id = c.dataset.pick;
      if (c.checked) { if (st.uu_tien_mai.length >= 3) { c.checked = false; toast('Chỉ chọn 3 việc thôi, ít mà chắc'); return; } st.uu_tien_mai.push(id); }
      else st.uu_tien_mai = st.uu_tien_mai.filter((x) => x !== id);
    });
    box.querySelector('[data-finish]')?.addEventListener('click', async () => {
      await saveDraft(true);
      const h = store.all('thoi_quen').find((x) => /tổng kết/i.test(x.ten));
      if (h && !store.all('diem_danh').some((x) => x.thoi_quen_id === h.id && x.ngay === d)) { try { await store.create('diem_danh', { thoi_quen_id: h.id, ngay: d }); } catch { /* bỏ qua */ } }
      sheet.close();
      toast('Ngày đã khép lại. Nghỉ ngơi thật tốt nhé 🌙', { kind: 'ok', ms: 5000 });
    });
  }
  render();
  return sheet;
}

// ---------------- Màn Hôm nay: ưu tiên + lời nhắc buổi tối ----------------
/** 3 ưu tiên đã chọn tối qua (việc). */
export function todayPriorities() {
  const y = entryFor(addDays(today(), -1));
  return (y?.uu_tien_mai || []).map((id) => store.get('viec', id)).filter(Boolean);
}
/** Khép lại ngày: nút từ 17h (chưa tổng kết) hoặc dòng "đã tổng kết". Đặt cuối màn Hôm nay. */
export function closeDayCard() {
  const mine = entryFor(today());
  const hour = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  if (mine?.hoan_thanh) return html`<p class="hint center">🌙 Đã tổng kết hôm nay ${moodEmoji(mine.tam_trang)} · <button class="link" data-review>xem lại</button></p>`;
  return html`<button class="review-cta ${hour >= 17 ? '' : 'quiet'}" data-review>${icon('moon')}<span><b>Khép lại ngày hôm nay</b><small>5 phút: cảm xúc · việc đã xong · chốt việc dở · ưu tiên ngày mai</small></span></button>`;
}

export function todayReviewCards() {
  const t = today();
  const y = entryFor(addDays(t, -1));
  const pri = (y?.uu_tien_mai || []).map((id) => store.get('viec', id)).filter(Boolean);
  const mine = entryFor(t);
  const hour = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  return html`
    ${pri.length ? html`<section class="card priorities"><h3 class="card-title">${icon('spark')} 3 ưu tiên hôm nay <small class="hint">chọn từ tối qua</small></h3>
      <ol class="pri-list">${pri.map((v) => html`<li class="${v.trang_thai === 'Xong' ? 'is-done' : ''}" data-open="viec/${v.id}">${v.trang_thai === 'Xong' ? '✓ ' : ''}${v.ten}</li>`)}</ol></section>` : ''}
    ${hour >= 17 && !mine?.hoan_thanh ? html`<button class="review-cta" data-review>${icon('moon')}<span><b>Khép lại ngày hôm nay</b><small>5 phút: cảm xúc · việc đã xong · chốt việc dở · ưu tiên ngày mai</small></span></button>` : ''}
    ${mine?.hoan_thanh ? html`<p class="hint center">🌙 Đã tổng kết hôm nay ${moodEmoji(mine.tam_trang)} · <button class="link" data-review>xem lại</button></p>` : ''}`;
}

// ---------------- Màn Nhật ký ngày ----------------
export function journalView() {
  const t = today();
  const rows = store.all('nhat_ky_ngay').sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(t, i - 29)).map((d) => ({ d, r: rows.find((x) => x.ngay === d) }));
  const vals = rows.slice(0, 30);
  const avg = (k) => { const v = vals.filter((r) => r[k]); return v.length ? (v.reduce((s, r) => s + r[k], 0) / v.length).toFixed(1).replace('.', ',') : '–'; };
  const emo = {}; vals.forEach((r) => (r.cam_xuc || []).forEach((e) => (emo[e] = (emo[e] || 0) + 1)));
  const topEmo = Object.entries(emo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return html`
    <header class="page-head"><h1>Nhật ký & tâm trạng</h1><button class="btn btn-primary" data-review>${icon('moon')} ${entryFor(t) ? 'Xem lại hôm nay' : 'Tổng kết hôm nay'}</button></header>
    <div class="stat-row">
      <div class="stat"><b>${avg('tam_trang')}</b><span>tâm trạng TB</span></div>
      <div class="stat"><b>${avg('nang_luong')}</b><span>năng lượng TB</span></div>
      <div class="stat"><b>${avg('cang_thang')}</b><span>căng thẳng TB</span></div>
      <div class="stat stat-green"><b>${vals.length}</b><span>ngày đã ghi</span></div>
    </div>
    <section class="card"><h3 class="card-title">Tâm trạng 30 ngày</h3>
      <div class="mood-chart">${last30.map(({ d, r }) => html`<div class="mbar" title="${fmtDate(d)}${r ? ': ' + r.tam_trang + '/5' : ''}"><i class="m${r?.tam_trang || 0}" style="height:${r?.tam_trang ? r.tam_trang * 20 : 4}%"></i><small>${d.slice(8) === '01' || d === t ? fmtDate(d) : ''}</small></div>`)}</div>
      ${topEmo.length ? html`<p class="row-meta">Cảm xúc hay gặp: ${topEmo.map(([e, n]) => html`<span class="tag">${e} · ${n}</span>`)}</p>` : ''}</section>
    <section class="card"><h3 class="card-title">Các ngày đã ghi</h3>
      ${rows.length ? html`<ul class="list">${rows.slice(0, 60).map((r) => html`<li class="row" data-review-day="${r.ngay}"><div class="mood-dot">${moodEmoji(r.tam_trang)}</div>
        <div class="row-main"><div class="row-title">${weekdayName(r.ngay, true)} ${fmtDate(r.ngay, true)}</div>
        <div class="row-sub">${r.nhat_ky || r.ban_long || r.biet_on || '(không ghi chú)'}</div>
        <div class="row-meta">${(r.cam_xuc || []).map((e) => html`<span class="tag">${e}</span>`)}${r.so_viec_xong ? html`<span>✓ ${r.so_viec_xong} việc</span>` : ''}</div></div></li>`)}</ul>`
        : html`<p class="empty">Chưa có ngày nào. Tối nay thử tổng kết 5 phút nhé.</p>`}</section>`;
}

export function bindJournal(root) {
  root.querySelectorAll('[data-review-day]').forEach((r) => r.addEventListener('click', () => openReview(r.dataset.reviewDay)));
}
