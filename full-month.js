/* ==========================================================================
   full-month.js — ព្រីមពេញខែ (Full-month Premium) · Admin
   • បង្ហាញបុគ្គលិកម្នាក់ៗ "ធ្វើការពេញខែ" ឬ "មិនពេញខែ" (មានមូលហេតុ)
   • ស្រួលបន្ថែម ➕ ប្រាក់រង្វាន់ព្រីម ឬ កាត់ ➖ ប្រាក់ព្រីម តាមបុគ្គលិកម្នាក់ៗ ឬទាំងអស់ក្នុងមួយចុច
   • រក្សាទុកជាធាតុក្នុង payroll_items (id ថេរ មិនស្ទួន) → ចូលក្នុង Payslip / ប្រាក់ខែសុទ្ធដោយស្វ័យប្រវត្តិ

   ដំឡើង៖ index.html ដាក់ក្រោម bank-pay.js៖  <script src="full-month.js"></script>
   ① ដំណើរការ full-month.sql ក្នុង Supabase ជាមុន (បន្ថែម 3 column ក្នុង app_settings)
   លក្ខខណ្ឌ (ចំនួនព្រីម / យឺតអនុញ្ញាត / ច្បាប់) រក្សាក្នុង Supabase ទាំងអស់ — មិនប្រើ localStorage
   លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ត្រូវការ៖ employees, payrollItems, payrollEmployeesForMonth, summarizeEmpMonth, calcDeductionRow,
            countUnmarkedDays, daysInMonth, isMonthLocked, guardLocked, upsertPayrollItemRow,
            deletePayrollItemRow, currentMonthlyMonth, todayStr, logAudit, customAlert, customConfirm
   ========================================================================== */
(function () {
  'use strict';

  const OLD_KEY = 'fullmonth_rules_v1'; // ប្រើតែដើម្បីផ្ទេរតម្លៃចាស់ឡើង Supabase ម្តង
  const DEF = { amount: 10, leaveBreaks: true, allowLate: 0 };
  let rules = { ...DEF };
  let rulesReady = false;   // true ក្រោយទាញពី Supabase បាន
  let rulesError = '';
  let saveTimer = null;
  let overlay = null, curMonth = '', rows = [];

  // ---- លក្ខខណ្ឌ ↔ Supabase (app_settings id=1) ----
  async function loadRules() {
    rulesReady = false; rulesError = '';
    try {
      const { data, error } = await supabaseClient.from('app_settings')
        .select('fm_amount, fm_allow_late, fm_leave_breaks').eq('id', 1).maybeSingle();
      if (error) { rulesError = /fm_(amount|allow_late|leave_breaks)/.test(error.message) ? 'មិនទាន់ដំណើរការ full-month.sql ក្នុង Supabase (column fm_* មិនទាន់មាន)' : error.message; return false; }
      if (!data) { rulesError = 'រកមិនឃើញជួរ app_settings (id=1)'; return false; }
      if (data.fm_amount == null) {
        // ម្តងដំបូង៖ ផ្ទេរតម្លៃចាស់ពី localStorage (បើមាន) ឬប្រើ default ហើយរក្សាទុកក្នុង Supabase
        let old = null;
        try { const raw = localStorage.getItem(OLD_KEY); if (raw) old = JSON.parse(raw); } catch (e) { /* ignore */ }
        rules = { ...DEF, ...(old || {}) };
        const ok = await saveRulesNow();
        if (ok) { try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ } }
        else return false;
      } else {
        rules = {
          amount: Math.max(0, parseFloat(data.fm_amount) || 0),
          allowLate: Math.max(0, parseInt(data.fm_allow_late, 10) || 0),
          leaveBreaks: data.fm_leave_breaks !== false,
        };
        try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
      }
      rulesReady = true;
      return true;
    } catch (e) {
      rulesError = String(e && e.message || e);
      return false;
    }
  }

  async function saveRulesNow() {
    const { data, error } = await supabaseClient.from('app_settings').update({
      fm_amount: rules.amount, fm_allow_late: rules.allowLate, fm_leave_breaks: !!rules.leaveBreaks,
    }).eq('id', 1).select('id');
    if (error || !data || !data.length) { rulesError = error ? error.message : 'រក្សាទុកមិនបាន (រកមិនឃើញ app_settings id=1)'; return false; }
    rulesError = '';
    return true;
  }
  // debounce — កុំសរសេរ DB រាល់ការវាយគ្រាប់ចុច
  function saveRules() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { const ok = await saveRulesNow(); if (!ok && overlay) render(); }, 600);
  }

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => String(+Number(n || 0).toFixed(2));
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const addId = (emp, m) => `auto_prem_${emp}_${m}`;
  const cutId = (emp, m) => `auto_premcut_${emp}_${m}`;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const shiftMonth = (m, d) => {
    let [y, mo] = m.split('-').map(Number); mo += d;
    while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------- គណនា ----
  function calcFull(emp, month) {
    const t = summarizeEmpMonth(emp, month);
    const d = calcDeductionRow(emp, month);
    const dates = daysInMonth(month);
    const unmarked = isMonthLocked(month) ? 0 : countUnmarkedDays(emp, month);
    const absent = t.absentDays || 0, leave = d.leaveDays || 0, late = t.lateDays || 0;
    const why = [];
    if (emp.status !== 'active') why.push('ឈប់ការងារ');
    if (emp.startDate && emp.startDate > dates[0]) why.push('ចូលធ្វើការកណ្តាលខែ');
    if (absent > 0) why.push(`អវត្តមាន ${num(absent)}`);
    if (rules.leaveBreaks && leave > 0) why.push(`ច្បាប់ ${num(leave)}`);
    if (late > rules.allowLate) why.push(`យឺត ${late} ដង`);
    if (unmarked > 0) why.push(`មិនទាន់កត់ ${unmarked} ថ្ងៃ`);
    return { work: t.workDays || 0, absent, leave, late, unmarked, full: why.length === 0, why };
  }

  const monthEnded = m => { const ds = daysInMonth(m); return todayStr() > ds[ds.length - 1]; };

  function buildRows() {
    const q = (overlay.querySelector('#fmQ').value || '').trim().toLowerCase();
    const f = overlay.querySelector('#fmF').value;
    rows = payrollEmployeesForMonth(curMonth)
      .map(e => ({ e, c: calcFull(e, curMonth), add: payrollItems.find(p => p.id === addId(e.id, curMonth)), cut: payrollItems.find(p => p.id === cutId(e.id, curMonth)) }))
      .filter(r => (!q || ((r.e.name || '') + ' ' + (r.e.username || '')).toLowerCase().includes(q)) && (!f || (f === 'full' ? r.c.full : !r.c.full)))
      .sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
  }

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.fm-ovl{position:fixed;inset:0;z-index:9970;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.fm-ovl.open{display:flex}
.fm-box{width:100%;max-width:1180px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.fm-box h2{margin:0 0 4px;font-size:1.05rem}
.fm-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.fm-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.fm-bar input,.fm-bar select{font-size:.8rem;padding:6px 8px}
.fm-rules{display:flex;gap:14px;flex-wrap:wrap;align-items:end;padding:10px 12px;border:1px solid var(--border,#e1e8ef);border-radius:12px;margin:8px 0}
.fm-rules label{font-size:.72rem;display:block;margin-bottom:3px;color:var(--text-muted,#5b6b80)}
.fm-rules input[type=number]{width:96px}
.fm-tbl td,.fm-tbl th{white-space:nowrap;vertical-align:middle}
.fm-tbl input.fm-amt{width:76px;font-size:.78rem;padding:5px 6px;text-align:right}
.fm-ok{color:var(--success,#059669);font-weight:600}
.fm-no{color:#dc2626;font-weight:600}
.fm-why{font-size:.68rem;color:#dc2626;white-space:normal;max-width:210px}
.fm-add{color:var(--success,#059669);font-weight:600}
.fm-cut{color:#dc2626;font-weight:600}
.fm-act{padding:4px 9px;font-size:.78rem}
.fm-sum{font-size:.8rem;font-weight:600;flex:1 0 100%;text-align:right}
.fm-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
`;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'fm-ovl';
    overlay.innerHTML = `
      <div class="fm-box" role="dialog" aria-modal="true">
        <h2>⭐ ព្រីមពេញខែ <span id="fmMonthTxt" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="fm-note">ពេញខែ = គ្មានអវត្តមាន · គ្មានថ្ងៃមិនទាន់កត់ · (ច្បាប់/យឺត តាមលក្ខខណ្ឌខាងក្រោម) · មិនចូលធ្វើការកណ្តាលខែ។ ➕ បន្ថែមព្រីម ឬ ➖ កាត់ព្រីម ចូលក្នុងប្រាក់ខែ/Payslip ភ្លាម។</p>
        <div class="fm-rules">
          <div><label>ចំនួនព្រីម ($)</label><input type="number" id="fmAmount" min="0" step="0.01"></div>
          <div><label>យឺតអនុញ្ញាត (ដង/ខែ)</label><input type="number" id="fmLate" min="0" step="1"></div>
          <label style="display:flex;gap:6px;align-items:center;margin:0 0 6px;font-size:.78rem;color:inherit"><input type="checkbox" id="fmLeave"> ច្បាប់ → មិនពេញខែ</label>
        </div>
        <div class="fm-bar">
          <button class="secondary" id="fmPrev" title="ខែមុន">◀</button>
          <input type="month" id="fmMonth">
          <button class="secondary" id="fmNext" title="ខែក្រោយ">▶</button>
          <input type="text" id="fmQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="fmF"><option value="">ទាំងអស់</option><option value="full">ពេញខែ</option><option value="part">មិនពេញខែ</option></select>
          <button id="fmAddAll">➕ ផ្តល់ព្រីម អ្នកពេញខែទាំងអស់</button>
          <button class="secondary" id="fmCutAll">➖ កាត់ព្រីម អ្នកមិនពេញខែទាំងអស់</button>
          <span class="fm-sum" id="fmSum"></span>
        </div>
        <div id="fmStatus"></div>
        <div class="table-wrap" style="max-height:52vh;overflow:auto">
          <table class="fm-tbl">
            <thead><tr><th>#</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th>ធ្វើការ</th><th>អវត្តមាន</th><th>ច្បាប់</th><th>យឺត</th><th>មិនទាន់កត់</th><th>ស្ថានភាព</th><th>ព្រីមក្នុងខែនេះ</th><th style="text-align:right">ចំនួន ($)</th><th>សកម្មភាព</th></tr></thead>
            <tbody id="fmBody"></tbody>
          </table>
        </div>
        <div class="fm-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="fmClose">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);

    $('fmClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

    $('fmAmount').addEventListener('change', () => { rules.amount = Math.max(0, parseFloat($('fmAmount').value) || 0); saveRules(); render(); });
    $('fmLate').addEventListener('change', () => { rules.allowLate = Math.max(0, parseInt($('fmLate').value, 10) || 0); saveRules(); render(); });
    $('fmLeave').addEventListener('change', () => { rules.leaveBreaks = $('fmLeave').checked; saveRules(); render(); });
    $('fmMonth').addEventListener('change', e => setMonth(e.target.value));
    $('fmPrev').addEventListener('click', () => setMonth(shiftMonth(curMonth, -1)));
    $('fmNext').addEventListener('click', () => setMonth(shiftMonth(curMonth, 1)));
    $('fmQ').addEventListener('input', render);
    $('fmF').addEventListener('change', render);
    $('fmAddAll').addEventListener('click', () => bulk('add'));
    $('fmCutAll').addEventListener('click', () => bulk('cut'));
    $('fmBody').addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
      const amt = r2(parseFloat(btn.closest('tr').querySelector('.fm-amt').value) || 0);
      btn.disabled = true;
      try {
        if (act === 'del') await removePremium(id);
        else await applyPremium(id, act, amt);
      } finally { btn.disabled = false; }
      afterChange();
    });
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  async function open() {
    if (!overlay) build();
    curMonth = (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
    const $ = id => overlay.querySelector('#' + id);
    $('fmQ').value = ''; $('fmF').value = '';
    overlay.classList.add('open');
    $('fmBody').innerHTML = '<tr><td colspan="13" style="padding:16px">កំពុងផ្ទុក...</td></tr>';
    await loadRules();
    $('fmAmount').value = rules.amount; $('fmLate').value = rules.allowLate; $('fmLeave').checked = !!rules.leaveBreaks;
    render();
  }

  function setMonth(m) {
    if (!MONTH_RE.test(m || '')) { overlay.querySelector('#fmMonth').value = curMonth; return; }
    curMonth = m; render();
  }

  function render() {
    const $ = id => overlay.querySelector('#' + id);
    $('fmMonthTxt').textContent = curMonth;
    $('fmMonth').value = curMonth;
    const locked = isMonthLocked(curMonth), ended = monthEnded(curMonth);
    $('fmStatus').innerHTML = (!rulesReady ? `<div class="fm-warn">⚠️ មិនអាចផ្ទុក/រក្សាទុកលក្ខខណ្ឌក្នុង Supabase បាន៖ ${esc(rulesError || 'មិនស្គាល់')}<br>ប៊ូតុង "ផ្តល់/កាត់ទាំងអស់" ត្រូវបានបិទ រហូតដល់ដោះស្រាយ។ <button class="secondary fm-act" id="fmRetry">↻ ព្យាយាមម្តងទៀត</button></div>` : (rulesError ? `<div class="fm-warn">⚠️ រក្សាទុកលក្ខខណ្ឌមិនជោគជ័យ៖ ${esc(rulesError)}</div>` : ''))
      + (locked ? '<div class="fm-warn">🔒 ខែនេះបានបិទហើយ — មើលបានតែមិនអាចបន្ថែម/កាត់ព្រីមបានទេ។</div>' : '')
      + (!ended ? '<div class="fm-warn">⏳ ខែនេះមិនទាន់ចប់ — ស្ថានភាព "ពេញខែ" នៅបណ្ដោះអាសន្ន ហើយអាចប្តូរបើមានអវត្តមាន/យឺតបន្ថែម។</div>' : '');
    ['fmAddAll', 'fmCutAll'].forEach(id => { $(id).disabled = locked || !rulesReady; });
    const rt = $('fmRetry'); if (rt) rt.addEventListener('click', open);
    buildRows();
    let nFull = 0, nPart = 0, sumAdd = 0, sumCut = 0;
    rows.forEach(r => { r.c.full ? nFull++ : nPart++; if (r.add) sumAdd += Number(r.add.amount) || 0; if (r.cut) sumCut += Number(r.cut.amount) || 0; });
    $('fmSum').textContent = `ពេញខែ ${nFull} នាក់ · មិនពេញខែ ${nPart} នាក់ · ព្រីមបានបន្ថែម +$${money(sumAdd)} · បានកាត់ −$${money(sumCut)}`;
    $('fmBody').innerHTML = rows.length ? rows.map(({ e, c, add, cut }, i) => {
      const cur = add ? `<span class="fm-add">➕ +$${money(add.amount)}</span>` : (cut ? `<span class="fm-cut">➖ −$${money(cut.amount)}</span>` : '<span style="color:var(--text-muted)">—</span>');
      const amt = add ? add.amount : (cut ? cut.amount : rules.amount);
      const dis = locked ? 'disabled' : '';
      return `<tr data-id="${esc(e.id)}">
        <td>${i + 1}</td><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td>
        <td>${num(c.work)}</td><td>${c.absent ? `<b class="fm-no">${num(c.absent)}</b>` : '0'}</td><td>${c.leave ? num(c.leave) : '0'}</td><td>${c.late || '0'}</td><td>${c.unmarked || '0'}</td>
        <td>${c.full ? '<span class="fm-ok">✓ ពេញខែ</span>' : `<span class="fm-no">✕ មិនពេញខែ</span><div class="fm-why">${esc(c.why.join(' · '))}</div>`}</td>
        <td>${cur}</td>
        <td style="text-align:right"><input type="number" class="fm-amt" min="0" step="0.01" value="${r2(amt)}" ${dis}></td>
        <td><button class="fm-act" data-act="add" title="បន្ថែមព្រីម" ${dis}>➕ ព្រីម</button> <button class="secondary fm-act" data-act="cut" title="កាត់ព្រីម" ${dis}>➖ កាត់</button>${(add || cut) ? ` <button class="secondary fm-act" data-act="del" title="ដកចេញ" ${dis}>✕</button>` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="13" style="padding:16px">មិនមានបុគ្គលិក</td></tr>';
  }

  function afterChange() {
    render();
    if (typeof renderMonthlyTab === 'function') { try { renderMonthlyTab(); } catch (e) { /* ignore */ } }
    if (typeof renderPayrollTab === 'function') { try { renderPayrollTab(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- សកម្មភាព ----
  // kind: 'add' (benefit) | 'cut' (deduction) — មួយបុគ្គលិក/ខែ មានតែមួយប្រភេទ
  async function applyPremium(empId, kind, amount, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'កែព្រីម'); return false; }
    amount = r2(amount);
    if (!(amount > 0)) { if (!silent) await customAlert('សូមបញ្ចូលចំនួនព្រីមឱ្យលើសពី 0'); return false; }
    const item = kind === 'add'
      ? { id: addId(empId, month), employeeId: empId, type: 'benefit', name: `ព្រីមពេញខែ ${month}`, recurrence: 'variable', month, currency: 'USD', amount }
      : { id: cutId(empId, month), employeeId: empId, type: 'deduction', name: `កាត់ព្រីម ${month}`, recurrence: 'variable', month, currency: 'USD', amount };
    const otherId = kind === 'add' ? cutId(empId, month) : addId(empId, month);
    const old = payrollItems.find(p => p.id === item.id) || null;
    const other = payrollItems.find(p => p.id === otherId) || null;

    const saved = await upsertPayrollItemRow(item);
    if (!saved) return false;
    const idx = payrollItems.findIndex(p => p.id === item.id);
    if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
    if (typeof logAudit === 'function') logAudit('premium_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: empId,
      old: old ? { name: old.name, type: old.type, currency: 'USD', amount: old.amount } : null, new: { name: item.name, type: item.type, currency: 'USD', amount: item.amount } });

    if (other) { // ដកប្រភេទផ្ទុយចេញ (ដើម្បីកុំឱ្យទាំង +ព្រីម និង −ព្រីមក្នុងខែតែមួយ)
      const ok = await deletePayrollItemRow(otherId);
      if (ok) {
        payrollItems = payrollItems.filter(p => p.id !== otherId);
        if (typeof logAudit === 'function') logAudit('premium_remove', { entity: 'payroll_item', ref: otherId, month, employeeId: empId, old: { name: other.name, type: other.type, currency: 'USD', amount: other.amount }, new: null });
      }
    }
    return true;
  }

  async function removePremium(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'ដកព្រីម'); return false; }
    let any = false;
    for (const id of [addId(empId, month), cutId(empId, month)]) {
      const prev = payrollItems.find(p => p.id === id);
      if (!prev) continue;
      const ok = await deletePayrollItemRow(id);
      if (!ok) continue;
      payrollItems = payrollItems.filter(p => p.id !== id);
      any = true;
      if (typeof logAudit === 'function') logAudit('premium_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prev.name, type: prev.type, currency: 'USD', amount: prev.amount }, new: null });
    }
    return any;
  }

  async function bulk(kind) {
    const month = curMonth;
    if (guardLocked(month, kind === 'add' ? 'ផ្តល់ព្រីម' : 'កាត់ព្រីម')) return;
    if (!rulesReady) { await customAlert('មិនទាន់ទាញលក្ខខណ្ឌពី Supabase បាន — មិនអាចដំណើរការទាំងអស់បានទេ'); return; }
    const amount = r2(rules.amount);
    if (!(amount > 0)) { await customAlert('សូមកំណត់ "ចំនួនព្រីម ($)" ឱ្យលើសពី 0 ជាមុន'); return; }
    // គ្រប់បុគ្គលិកក្នុងខែ (មិនអនុលោមតាម filter/ស្វែងរក) ដែលត្រូវលក្ខខណ្ឌ ហើយមិនទាន់មានចំនួនដូចគ្នា
    const all = payrollEmployeesForMonth(month).map(e => ({ e, c: calcFull(e, month) }));
    const targets = all.filter(({ e, c }) => (kind === 'add' ? c.full : !c.full) && e.status === 'active'
      && !payrollItems.some(p => p.id === (kind === 'add' ? addId(e.id, month) : cutId(e.id, month)) && Math.abs(Number(p.amount) - amount) < 0.00005));
    if (!targets.length) { await customAlert(kind === 'add' ? 'គ្មានបុគ្គលិកពេញខែដែលត្រូវផ្តល់ព្រីមទេ (ឬបានផ្តល់រួចហើយ)' : 'គ្មានបុគ្គលិកមិនពេញខែដែលត្រូវកាត់ព្រីមទេ (ឬបានកាត់រួចហើយ)'); return; }
    const verb = kind === 'add' ? `➕ ផ្តល់ព្រីម $${money(amount)}` : `➖ កាត់ព្រីម $${money(amount)}`;
    const preview = targets.slice(0, 8).map(t => t.e.name).join(', ') + (targets.length > 8 ? ` …(+${targets.length - 8})` : '');
    if (!(await customConfirm(`${verb} ដល់ ${targets.length} នាក់ ក្នុងខែ ${month}?\n${preview}${monthEnded(month) ? '' : '\n\n⚠ ខែនេះមិនទាន់ចប់ — ស្ថានភាពអាចប្តូរ'}\n(ធាតុដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`))) return;
    let ok = 0;
    for (const t of targets) { if (await applyPremium(t.e.id, kind, amount, true)) ok++; }
    afterChange();
    await customAlert(`បានដំណើរការ ${ok}/${targets.length} នាក់`);
  }

  // ---------------------------------------------------------------- init ----
  function init() {
    if (document.getElementById('monthlyFullBtn')) return;
    const anchor = document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyFullBtn'; btn.type = 'button';
    btn.textContent = '⭐ ព្រីមពេញខែ';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openFullMonth = open;
})();
