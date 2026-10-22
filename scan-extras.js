/* ==========================================================================
   scan-extras.js — ម៉ូឌុល Admin (ដាក់ក្រោម script.js ក្នុង index.html)
     (១) ក្តារ "ស្កេនថ្ងៃនេះ"   — ស្ថានភាពបុគ្គលិកម្នាក់ៗថ្ងៃនេះ + រូបថត + ការកំណត់ (រូបថតពេលស្កេន)
     (២) សំណើកែវត្តមាន        — បុគ្គលិកភ្លេចស្កេន → Admin អនុម័ត/បដិសេធ (បន្ថែមក្នុងផ្ទាំង Leave / Overtime)
   ត្រូវការ SQL៖ scan-extras.sql (+ scan-photos-storage.sql សម្រាប់រូបថត) · ទំព័រទាំងនេះប្រើ token session ដែលមានស្រាប់
   មិនកែ logic ដើម — លុប <script src="scan-extras.js"> ទើបត្រឡប់ទៅដូចមុន
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const PHOTO_BUCKET = 'scan-photos';
  const STEP_LABEL = { checkin: 'ចូល', break_out: 'ចេញបាយ', break_in: 'ចូលវិញ', checkout: 'ចេញ' };
  const parseMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const pick = (o, a, b) => (o && (o[a] != null ? o[a] : o[b])) || '';

  // ------------------------------------------------------------------ ក) សំណើកែវត្តមាន ----
  let corrRows = [], corrMissing = false;

  function ensureCorrPanel() {
    if ($('corrBody')) return;
    const tab = $('requestsTab');
    if (!tab) return;
    tab.insertAdjacentHTML('beforeend', `
      <h3 style="font-size:0.9rem;margin:24px 0 10px;">🛠 សំណើកែវត្តមាន (ភ្លេចស្កេន) <span id="corrCount" style="color:var(--text-muted);font-weight:500;"></span></h3>
      <p class="scan-hint" id="corrWarn" style="display:none;color:var(--danger,#dc2626);"></p>
      <div class="table-wrap" style="margin-bottom:24px;">
        <table>
          <thead><tr><th>បុគ្គលិក</th><th>ថ្ងៃ</th><th>វត្តមានបច្ចុប្បន្ន</th><th>ម៉ោងដែលស្នើ</th><th>មូលហេតុ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>
          <tbody id="corrBody"></tbody>
        </table>
        <div class="empty-state" id="corrEmpty" style="display:none;">មិនមានសំណើកែវត្តមានទេ</div>
      </div>`);
    const f = $('reqStatusFilter'); if (f) f.addEventListener('change', renderCorrections);
    const r = $('reqRefreshBtn'); if (r) r.addEventListener('click', () => loadCorrections().then(renderCorrections));
  }

  async function loadCorrections() {
    const { data, error } = await supabaseClient.from('attendance_corrections').select('*').order('created_at', { ascending: false });
    if (error) { corrMissing = true; corrRows = []; console.warn('attendance_corrections:', error.message); return; }
    corrMissing = false;
    corrRows = data || [];
  }

  function attCurrentText(c) {
    const r = (typeof attendance !== 'undefined' && attendance[c.date] && attendance[c.date][c.employee_id]) || null;
    if (!r) return '<span style="color:var(--text-muted);">គ្មានទិន្នន័យ</span>';
    const parts = [pick(r, 'checkin', 'checkin'), pick(r, 'breakOut', 'break_out'), pick(r, 'breakIn', 'break_in'), pick(r, 'checkout', 'checkout')].map(x => x || '-');
    return esc(parts.join(' · '));
  }
  function reqText(c) {
    const items = [['ចូល', c.req_checkin], ['ចេញបាយ', c.req_break_out], ['ចូលវិញ', c.req_break_in], ['ចេញ', c.req_checkout]]
      .filter(x => x[1]).map(x => `${x[0]} <b>${esc(x[1])}</b>`);
    return items.join(' · ') || '-';
  }

  function renderCorrections() {
    ensureCorrPanel();
    const body = $('corrBody'); if (!body) return;
    const warn = $('corrWarn');
    if (warn) {
      warn.style.display = corrMissing ? '' : 'none';
      warn.textContent = corrMissing ? '⚠ មិនទាន់មានតារាង attendance_corrections — សូមរត់ scan-extras.sql ក្នុង Supabase ជាមុន។' : '';
    }
    const flt = ($('reqStatusFilter') || {}).value || '';
    const rows = corrRows.filter(c => !flt || c.status === flt);
    const pending = corrRows.filter(c => c.status === 'pending').length;
    const cnt = $('corrCount'); if (cnt) cnt.textContent = pending ? `(រង់ចាំ ${pending})` : '';
    const empty = $('corrEmpty'); if (empty) empty.style.display = (rows.length || corrMissing) ? 'none' : 'block';
    const badge = { pending: '<span class="badge pending">កំពុងរង់ចាំ</span>', approved: '<span class="badge active">អនុម័ត</span>', rejected: '<span class="badge inactive">បដិសេធ</span>' };
    body.innerHTML = rows.map(c => `<tr>
      <td>${esc(typeof empLabelById === 'function' ? empLabelById(c.employee_id) : c.employee_id)}</td>
      <td>${esc(c.date)}</td>
      <td>${attCurrentText(c)}</td>
      <td>${reqText(c)}</td>
      <td style="max-width:220px;white-space:normal;">${esc(c.reason)}${c.admin_note ? `<div style="color:var(--text-muted);font-size:0.75rem;">Admin៖ ${esc(c.admin_note)}</div>` : ''}</td>
      <td>${badge[c.status] || esc(c.status)}</td>
      <td>${c.status === 'pending'
        ? `<button type="button" onclick="scanExtras.approveCorr('${esc(c.id)}')">✓ អនុម័ត</button> <button type="button" class="danger" onclick="scanExtras.rejectCorr('${esc(c.id)}')">✕ បដិសេធ</button>`
        : '-'}</td>
    </tr>`).join('');
  }

  async function approveCorr(id) {
    const c = corrRows.find(r => String(r.id) === String(id));
    if (!c) return;
    if (!confirm(`អនុម័តកែវត្តមានថ្ងៃ ${c.date}?\n${reqText(c).replace(/<[^>]+>/g, '')}`)) return;
    const cur = await supabaseClient.from('attendance').select('*').eq('date', c.date).eq('employee_id', c.employee_id).maybeSingle();
    if (cur.error) { customAlert('អានវត្តមានមិនបានទេ៖ ' + cur.error.message); return; }
    const d = cur.data || {};
    const keep = (req, old) => req || old || '';
    const row = {
      date: c.date, employee_id: c.employee_id,
      checkin: keep(c.req_checkin, d.checkin), break_out: keep(c.req_break_out, d.break_out),
      break_in: keep(c.req_break_in, d.break_in), checkout: keep(c.req_checkout, d.checkout),
    };
    row.status = row.checkin ? 'present' : (d.status || 'present');
    const up = await supabaseClient.from('attendance').upsert(row, { onConflict: 'date,employee_id' });
    if (up.error) { customAlert('កែវត្តមានមិនបានទេ៖ ' + up.error.message + '\n(ប្រហែលខែនេះត្រូវបានបិទប្រាក់ខែរួច)'); return; }
    const upd = await supabaseClient.from('attendance_corrections').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', c.id);
    if (upd.error) customAlert('កែវត្តមានរួច ប៉ុន្តែរក្សាស្ថានភាពសំណើមិនបានទេ៖ ' + upd.error.message);
    if (typeof loadAttendance === 'function') { await loadAttendance(); if (typeof renderAttendanceTab === 'function') renderAttendanceTab(); }
    await loadCorrections(); renderCorrections();
  }

  async function rejectCorr(id) {
    const c = corrRows.find(r => String(r.id) === String(id));
    if (!c) return;
    const note = window.prompt('មូលហេតុបដិសេធ (មិនចាំបាច់)', '');
    if (note === null) return;
    const upd = await supabaseClient.from('attendance_corrections')
      .update({ status: 'rejected', admin_note: note.trim() || null, decided_at: new Date().toISOString() }).eq('id', c.id);
    if (upd.error) { customAlert('បដិសេធមិនបានទេ៖ ' + upd.error.message); return; }
    await loadCorrections(); renderCorrections();
  }

  // ------------------------------------------------------------------ ខ) ក្តារស្កេនថ្ងៃនេះ ----
  let board = { att: {}, logs: {}, cfg: null, cfgMissing: false, logsMissing: false, err: '' };
  let boardFilter = 'all';
  let boardTimer = null;

  function classify(e, rec, date) {
    // ច្បាប់ពេញថ្ងៃដែលបានអនុម័ត (ឬ status = leave)
    let leave = rec && rec.status === 'leave';
    if (!leave && typeof leaveRequests !== 'undefined') {
      leave = leaveRequests.some(r => r.employee_id === e.id && r.status === 'approved' && r.start_date <= date && date <= r.end_date
        && (typeof leaveUnitOf !== 'function' || leaveUnitOf(r).unit === 'day'));
    }
    const sh = getEmpShift(e.id);
    const start = lateStartMinutes(sh);
    const ci = rec && rec.checkin, bo = rec && rec.break_out, bi = rec && rec.break_in, co = rec && rec.checkout;
    const lateIn = !!(ci && parseMin(ci) !== null && start !== null && parseMin(ci) > start);
    let key, label, tone;
    if (leave) { key = 'leave'; label = 'ច្បាប់'; tone = '#a855f7'; }
    else if (co) { key = 'out'; label = 'ចេញរួច'; tone = '#0ea5e9'; }
    else if (ci && bo && !bi) { key = 'break'; label = 'ពេលសម្រាក'; tone = '#f97316'; }
    else if (ci) { key = 'work'; label = 'កំពុងធ្វើការ'; tone = '#16a34a'; }
    else {
      const now = new Date(); const nm = now.getHours() * 60 + now.getMinutes();
      const overdue = start !== null && nm > start + (typeof SHIFT !== 'undefined' ? SHIFT.graceMinutes : 10);
      key = 'notyet'; label = overdue ? 'មិនទាន់ស្កេន (យឺត)' : 'មិនទាន់ស្កេន'; tone = overdue ? '#dc2626' : '#64748b';
    }
    return { key, label, tone, lateIn, shift: sh };
  }

  async function loadBoard() {
    const date = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
    board.att = {};
    const a = await supabaseClient.from('attendance').select('*').eq('date', date);
    if (a.error) { board.err = a.error.message; return; }
    board.err = '';
    (a.data || []).forEach(r => { board.att[r.employee_id] = r; });
    board.logs = {};
    const lg = await supabaseClient.from('scan_log').select('*').eq('date', date).order('created_at', { ascending: true });
    if (lg.error) { board.logsMissing = true; }
    else {
      board.logsMissing = false;
      (lg.data || []).forEach(r => { (board.logs[r.employee_id] = board.logs[r.employee_id] || {})[r.step] = r; });
    }
  }

  function photoCell(emp) {
    const logs = board.logs[emp.id];
    const n = logs ? Object.values(logs).filter(l => l.photo).length : 0;
    return n ? `<button type="button" class="secondary" style="padding:2px 10px;" onclick="scanExtras.showPhotos('${esc(emp.id)}')">📷 ${n}</button>` : '<span style="color:var(--text-muted);">-</span>';
  }

  function renderBoardTable() {
    const date = (typeof todayStr === 'function') ? todayStr() : '';
    const active = (typeof activeEmployeesList === 'function' ? activeEmployeesList() : employees.filter(e => e.status === 'active'));
    const rows = active.map(e => ({ e, rec: board.att[e.id] || null }))
      .map(x => ({ ...x, c: classify(x.e, x.rec, date) }));
    const counts = { all: rows.length, work: 0, break: 0, out: 0, notyet: 0, leave: 0, late: 0 };
    rows.forEach(r => { counts[r.c.key]++; if (r.c.lateIn) counts.late++; });
    const chips = [['all', 'ទាំងអស់', '#64748b'], ['work', 'កំពុងធ្វើការ', '#16a34a'], ['break', 'ពេលសម្រាក', '#f97316'], ['out', 'ចេញរួច', '#0ea5e9'],
      ['notyet', 'មិនទាន់ស្កេន', '#dc2626'], ['leave', 'ច្បាប់', '#a855f7'], ['late', 'ស្កេនចូលយឺត', '#eab308']];
    $('todayChips').innerHTML = chips.map(([k, l, col]) =>
      `<button type="button" onclick="scanExtras.setFilter('${k}')" style="border:2px solid ${col};background:${boardFilter === k ? col : 'transparent'};color:${boardFilter === k ? '#fff' : col};border-radius:999px;padding:4px 12px;font-weight:700;cursor:pointer;">${l} ${counts[k]}</button>`).join(' ');
    const shown = rows.filter(r => boardFilter === 'all' || (boardFilter === 'late' ? r.c.lateIn : r.c.key === boardFilter));
    $('todayBody').innerHTML = shown.map(({ e, rec, c }) => `<tr>
      <td>${esc(e.name)}<div style="font-size:0.72rem;color:var(--text-muted);">${esc(e.username || e.id)}</div></td>
      <td>${esc(e.dept || '')}</td>
      <td>${esc(c.shift.name || '')}</td>
      <td><span style="color:${c.tone};font-weight:700;">● ${esc(c.label)}</span>${c.lateIn ? ' <span class="badge inactive">យឺត</span>' : ''}</td>
      <td>${esc((rec && rec.checkin) || '-')}</td><td>${esc((rec && rec.break_out) || '-')}</td>
      <td>${esc((rec && rec.break_in) || '-')}</td><td>${esc((rec && rec.checkout) || '-')}</td>
      <td>${photoCell(e)}</td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">គ្មានទិន្នន័យ</td></tr>';
    $('todayMeta').innerHTML = `ថ្ងៃ ${esc(date)} · <button type="button" class="secondary" style="padding:2px 10px;" onclick="scanExtras.refresh()">🔄 ផ្ទុកឡើងវិញ</button>`;
  }

  // ------------------------------------------------------------------ គ) ការកំណត់ GPS/រូបថត + រូបថត ----
  function renderBoardTableSafe() { try { renderBoardTable(); } catch (e) { console.error('scan board:', e); } }

  async function fetchCfg() {
    const q = await supabaseClient.from('app_settings').select('scan_photo').limit(1);
    if (q.error) { board.cfgMissing = true; return; }
    board.cfgMissing = false;
    board.cfg = { photo: !!(q.data[0] || {}).scan_photo };
  }
  function renderCfg() {
    const box = $('todayCfg'); if (!box) return;
    const c = board.cfg;
    if (board.cfgMissing || !c) { box.innerHTML = '<span style="color:var(--danger,#dc2626);">⚠ មិនទាន់ត្រៀម — សូមរត់ scan-extras.sql ក្នុង Supabase ជាមុន</span>'; return; }
    const sw = (on, fn, label) => `<button type="button" onclick="${fn}" style="border:0;border-radius:999px;padding:4px 14px;color:#fff;cursor:pointer;background:${on ? '#16a34a' : '#64748b'};">${on ? '✓ បើក' : '○ បិទ'}</button> ${label}`;
    box.innerHTML = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">
        <div>${sw(c.photo, 'scanExtras.togglePhoto()', 'ថតរូបខ្លួនពេលស្កេន')}</div>
        <div><button type="button" class="secondary" onclick="scanExtras.purgePhotos(60)">🗑 លុបរូបថតចាស់ជាង ៦០ ថ្ងៃ</button></div>
      </div>
      <p class="scan-hint" style="margin:8px 0 0;">*រូបថតមានតែ Admin មើលបាន — សូមប្រាប់បុគ្គលិកជាមុន ហើយត្រូវរត់ scan-photos-storage.sql ក្នុង Supabase។</p>`;
  }
  async function setCfg(patch) {
    const r = await supabaseClient.from('app_settings').update(patch).eq('id', 1);
    if (r.error) { customAlert('រក្សាទុកមិនបានទេ៖ ' + r.error.message); return false; }
    await fetchCfg(); renderCfg(); renderBoardTableSafe();
    return true;
  }
  async function togglePhoto() {
    const c = board.cfg; if (!c) return;
    if (!c.photo && !confirm('បើកការថតរូបខ្លួនពេលស្កេន?\nត្រូវប្រាប់បុគ្គលិកជាមុន ហើយបានរត់ scan-photos-storage.sql ក្នុង Supabase។')) return;
    await setCfg({ scan_photo: !c.photo });
  }

  // រូបថត
  function overlay(html) {
    closeOverlay();
    const ov = document.createElement('div');
    ov.id = 'scanExtrasOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:18px;';
    ov.innerHTML = `<div style="background:var(--card-bg,#fff);color:var(--text,#111827);border-radius:16px;max-width:760px;width:100%;max-height:90vh;overflow:auto;padding:18px;">${html}</div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closeOverlay(); });
    document.body.appendChild(ov);
  }
  function closeOverlay() { const o = $('scanExtrasOverlay'); if (o) o.remove(); }

  async function showPhotos(empId) {
    const logs = board.logs[empId] || {};
    const items = ['checkin', 'break_out', 'break_in', 'checkout'].map(s => logs[s]).filter(l => l && l.photo);
    if (!items.length) return;
    const { data, error } = await supabaseClient.storage.from(PHOTO_BUCKET).createSignedUrls(items.map(l => l.photo), 600);
    const emp = employees.find(e => e.id === empId);
    const cards = items.map((l, i) => {
      const u = !error && data && data[i] && data[i].signedUrl;
      return `<div style="text-align:center;"><div style="font-weight:700;margin-bottom:4px;">${esc(STEP_LABEL[l.step] || l.step)} ${esc(l.time || '')}</div>
        ${u ? `<img src="${u}" style="width:100%;max-width:220px;border-radius:12px;">` : '<div style="color:var(--text-muted);padding:20px;">មិនមានរូប (ឬមិនទាន់ upload)</div>'}</div>`;
    }).join('');
    overlay(`<h3 style="margin:0 0 10px;">${esc(emp ? emp.name : empId)}</h3><div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">${cards}</div>
      <div style="text-align:center;margin-top:14px;"><button type="button" onclick="scanExtras.closeOverlay()">បិទ</button></div>`);
  }

  async function purgePhotos(days) {
    if (!confirm(`លុបរូបថតស្កេនដែលចាស់ជាង ${days} ថ្ងៃ?`)) return;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const bucket = supabaseClient.storage.from(PHOTO_BUCKET);
    let removed = 0, failed = 0;
    for (const e of employees) {
      const top = await bucket.list(e.id, { limit: 1000 });
      if (top.error || !top.data) { if (top.error && /not found|bucket/i.test(top.error.message)) { customAlert('មិនទាន់មាន bucket scan-photos'); return; } continue; }
      for (const f of top.data) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name) || f.name >= cutoff) continue;
        const inner = await bucket.list(`${e.id}/${f.name}`, { limit: 100 });
        const paths = (inner.data || []).map(x => `${e.id}/${f.name}/${x.name}`);
        if (!paths.length) continue;
        const rm = await bucket.remove(paths);
        if (rm.error) failed += paths.length; else removed += paths.length;
      }
    }
    customAlert(`លុបរូបថត ${removed} សន្លឹក` + (failed ? ` · បរាជ័យ ${failed}` : ''));
  }

  // ------------------------------------------------------------------ wiring ----
  async function openBoardTab() {
    await Promise.all([loadBoard(), fetchCfg()]);
    renderCfg(); renderBoardTableSafe();
    $('todayMeta') && ($('todayMeta').innerHTML = `ថ្ងៃ ${esc(typeof todayStr === 'function' ? todayStr() : '')} · <button type="button" class="secondary" style="padding:2px 10px;" onclick="scanExtras.refresh()">🔄 ផ្ទុកឡើងវិញ</button>`);
    clearInterval(boardTimer);
    boardTimer = setInterval(async () => {
      if (document.hidden || !($('todayTab') || {}).classList || !$('todayTab').classList.contains('active')) return;
      await loadBoard(); renderBoardTableSafe();
    }, 30000);
  }

  const _showTab = window.showTab;
  window.showTab = function (tab) {
    _showTab.apply(this, arguments);
    if (tab === 'today') openBoardTab();
    else if (boardTimer && tab !== 'today') { clearInterval(boardTimer); boardTimer = null; }
    if (tab === 'requests') { ensureCorrPanel(); loadCorrections().then(renderCorrections); }
  };

  ensureCorrPanel();

  window.scanExtras = {
    approveCorr, rejectCorr, setFilter: k => { boardFilter = k; renderBoardTableSafe(); },
    refresh: async () => { await loadBoard(); renderBoardTableSafe(); },
    togglePhoto, purgePhotos, showPhotos, closeOverlay,
  };
})();
