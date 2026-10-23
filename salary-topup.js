/* ==========================================================================
   salary-topup.js — បំពេញប្រាក់ខែឱ្យពេញ (Salary Top-up) · Admin
   ក្បួន៖ បុគ្គលិកដែល "គ្មានអវត្តមានគ្មានសំណើ" ក្នុងខែ ត្រូវបានធានាប្រាក់ខែពេញ
     ប្រាក់បំពេញ = ប្រាក់ខែ − (ប្រាក់ឈ្នួលថ្ងៃធម្មតា + សម្រាកមានប្រាក់ឈ្នួល) បើវាវិជ្ជមាន
     • ប្រាក់ឈ្នួលអាទិត្យ/បុណ្យ (×2) រាប់តែ ×1 ក្នុងការធានា → ផ្នែកលើស ×1 នៅជារបស់បុគ្គលិក
     • មិនរាប់ OT និងប្រាក់បាយក្នុងការធានា
     • ខែ 31 ថ្ងៃ (បានលើសប្រាក់ខែ) → បំពេញ $0 (មិនកាត់អ្វីទេ)
   មិនធានា បើ៖ មានអវត្តមាន · មានថ្ងៃមិនទាន់កត់ · មានច្បាប់គ្មានប្រាក់ឈ្នួល · ឈប់ការងារ · ចូលធ្វើការកណ្តាលខែ
   រក្សាទុកជាធាតុ "អត្ថប្រយោជន៍" ក្នុង payroll_items (id ថេរ មិនស្ទួន) → ចូល Payslip / ប្រាក់ខែសុទ្ធដោយស្វ័យប្រវត្តិ
   គ្មានការកំណត់ត្រូវរក្សាទុក → មិនត្រូវការ SQL

   ដំឡើង៖ index.html ដាក់ក្រោម full-month.js៖  <script src="salary-topup.js"></script>
   ត្រូវការ៖ payrollItems, payrollEmployeesForMonth, summarizeEmpMonth, computeRow, attendance, leaveRequests,
             partialLeaveInfo, LEAVE_TYPE_LABELS, daysInMonth, countUnmarkedDays, isMonthLocked, guardLocked,
             upsertPayrollItemRow, deletePayrollItemRow, currentMonthlyMonth, todayStr, logAudit, customAlert, customConfirm
   ========================================================================== */
(function () {
  'use strict';

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => String(+Number(n || 0).toFixed(2));
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const itemId = (emp, m) => `auto_topup_${emp}_${m}`;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const EPS = 0.005;
  const shiftMonth = (m, d) => {
    let [y, mo] = m.split('-').map(Number); mo += d;
    while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  };
  const monthEnded = m => { const ds = daysInMonth(m); return todayStr() > ds[ds.length - 1]; };

  let overlay = null, curMonth = '', rows = [];

  // ---------------------------------------------------------------- គណនា ----
  // ចំនួនថ្ងៃច្បាប់ "គ្មានប្រាក់ឈ្នួល" (unpaid) ក្នុងខែ — ពេញថ្ងៃ + កន្លះថ្ងៃ/តាមម៉ោង
  function unpaidLeaveDays(emp, month) {
    let n = 0;
    const approved = leaveRequests.filter(r => r.employee_id === emp.id && r.status === 'approved');
    const stdH = settings.standardHours > 0 ? settings.standardHours : 8;
    daysInMonth(month).forEach(date => {
      try {
        partialLeaveInfo(emp.id, date).items.forEach(({ r: rq, h }) => { if (rq.leave_type === 'unpaid') n += h / stdH; });
      } catch (e) { /* ignore */ }
      const rec = attendance[date] && attendance[date][emp.id];
      if (rec && rec.status === 'leave') {
        const req = approved.find(r => r.start_date <= date && date <= r.end_date);
        if (req && req.leave_type === 'unpaid') n += 1;
      }
    });
    return n;
  }

  // ប្រាក់ឈ្នួលមូលដ្ឋាន (ដោយមិនរាប់ ×2 អាទិត្យ/បុណ្យ, OT, ប្រាក់បាយ)
  function basePay(emp, month) {
    let base = 0;
    daysInMonth(month).forEach(date => {
      const rec = attendance[date] && attendance[date][emp.id];
      if (!rec) return;
      const r = computeRow(emp, rec, date);
      const mult = r.mult > 0 ? r.mult : 1;
      base += (r.workPay || 0) / mult + (r.leavePay || 0);
    });
    return base;
  }

  function calc(emp, month) {
    const salary = parseFloat(emp.salary) || 0;
    const dates = daysInMonth(month);
    const t = summarizeEmpMonth(emp, month);
    const absent = t.absentDays || 0;
    const unmarked = isMonthLocked(month) ? 0 : countUnmarkedDays(emp, month);
    const unpaid = unpaidLeaveDays(emp, month);
    const why = [];
    if (emp.status !== 'active') why.push('ឈប់ការងារ');
    if (emp.startDate && emp.startDate > dates[0]) why.push('ចូលធ្វើការកណ្តាលខែ');
    if (absent > 0) why.push(`អវត្តមាន ${num(absent)}`);
    if (unmarked > 0) why.push(`មិនទាន់កត់ ${unmarked} ថ្ងៃ`);
    if (unpaid > 1e-9) why.push(`ច្បាប់គ្មានប្រាក់ឈ្នួល ${num(unpaid)}`);
    const base = basePay(emp, month);
    const gap = Math.max(0, r2(salary - base));
    return { salary, base, gap, absent, unmarked, unpaid, eligible: why.length === 0, why, topup: why.length === 0 && gap > EPS ? gap : 0 };
  }

  function buildRows() {
    const q = (overlay.querySelector('#stQ').value || '').trim().toLowerCase();
    const f = overlay.querySelector('#stF').value;
    rows = payrollEmployeesForMonth(curMonth)
      .map(e => ({ e, c: calc(e, curMonth), item: payrollItems.find(p => p.id === itemId(e.id, curMonth)) }))
      .filter(r => (!q || ((r.e.name || '') + ' ' + (r.e.username || '')).toLowerCase().includes(q))
        && (!f || (f === 'need' ? r.c.topup > 0 : f === 'ok' ? r.c.eligible && r.c.topup === 0 : !r.c.eligible)))
      .sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
  }

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.st-ovl{position:fixed;inset:0;z-index:9971;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.st-ovl.open{display:flex}
.st-box{width:100%;max-width:1100px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.st-box h2{margin:0 0 4px;font-size:1.05rem}
.st-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.st-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.st-bar input,.st-bar select{font-size:.8rem;padding:6px 8px}
.st-tbl td,.st-tbl th{white-space:nowrap;vertical-align:middle}
.st-no{color:#dc2626;font-weight:600}.st-ok{color:var(--success,#059669);font-weight:600}
.st-why{font-size:.68rem;color:#dc2626;white-space:normal;max-width:210px}
.st-act{padding:4px 9px;font-size:.78rem}
.st-sum{font-size:.8rem;font-weight:600;flex:1 0 100%;text-align:right}
.st-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
`;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'st-ovl';
    overlay.innerHTML = `
      <div class="st-box" role="dialog" aria-modal="true">
        <h2>🛡️ បំពេញប្រាក់ខែឱ្យពេញ <span id="stMonthTxt" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="st-note">បុគ្គលិកដែលគ្មានអវត្តមាន · គ្មានថ្ងៃមិនទាន់កត់ · គ្មានច្បាប់គ្មានប្រាក់ឈ្នួល → ធានាប្រាក់ខែពេញ។ ប្រាក់បំពេញ = ប្រាក់ខែ − (ប្រាក់ឈ្នួលធម្មតា + សម្រាកមានប្រាក់ឈ្នួល) (មិនរាប់ OT/ប្រាក់បាយ/×2 អាទិត្យ·បុណ្យ)។ ខែដែលបានលើសប្រាក់ខែ = $0។ ចូលក្នុងប្រាក់ខែ/Payslip ជាអត្ថប្រយោជន៍។</p>
        <div class="st-bar">
          <button class="secondary" id="stPrev" title="ខែមុន">◀</button>
          <input type="month" id="stMonth">
          <button class="secondary" id="stNext" title="ខែក្រោយ">▶</button>
          <input type="text" id="stQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="stF"><option value="">ទាំងអស់</option><option value="need">ត្រូវបំពេញ</option><option value="ok">គ្រប់ប្រាក់ខែរួច</option><option value="no">មិនធានា</option></select>
          <button id="stApplyAll">🛡️ បំពេញអ្នកត្រូវបំពេញទាំងអស់</button>
          <span class="st-sum" id="stSum"></span>
        </div>
        <div id="stStatus"></div>
        <div class="table-wrap" style="max-height:52vh;overflow:auto">
          <table class="st-tbl">
            <thead><tr><th>#</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th style="text-align:right">ប្រាក់ខែ ($)</th><th style="text-align:right">ប្រាក់ឈ្នួលបាន ($)</th><th style="text-align:right">ខ្វះ ($)</th><th>ស្ថានភាព</th><th>បានបំពេញ</th><th>សកម្មភាព</th></tr></thead>
            <tbody id="stBody"></tbody>
          </table>
        </div>
        <div class="st-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="stClose">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    $('stClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    $('stMonth').addEventListener('change', e => setMonth(e.target.value));
    $('stPrev').addEventListener('click', () => setMonth(shiftMonth(curMonth, -1)));
    $('stNext').addEventListener('click', () => setMonth(shiftMonth(curMonth, 1)));
    $('stQ').addEventListener('input', render);
    $('stF').addEventListener('change', render);
    $('stApplyAll').addEventListener('click', bulk);
    $('stBody').addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
      btn.disabled = true;
      try { if (act === 'del') await removeItem(id); else await applyItem(id); }
      finally { btn.disabled = false; }
      afterChange();
    });
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  function open() {
    if (!overlay) build();
    curMonth = (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
    overlay.querySelector('#stQ').value = ''; overlay.querySelector('#stF').value = '';
    overlay.classList.add('open');
    render();
  }

  function setMonth(m) {
    if (!MONTH_RE.test(m || '')) { overlay.querySelector('#stMonth').value = curMonth; return; }
    curMonth = m; render();
  }

  function render() {
    const $ = id => overlay.querySelector('#' + id);
    $('stMonthTxt').textContent = curMonth;
    $('stMonth').value = curMonth;
    const locked = isMonthLocked(curMonth), ended = monthEnded(curMonth);
    $('stStatus').innerHTML = (locked ? '<div class="st-warn">🔒 ខែនេះបានបិទហើយ — មើលបានតែមិនអាចបំពេញ/ដកបានទេ។</div>' : '')
      + (!ended ? '<div class="st-warn">⏳ ខែនេះមិនទាន់ចប់ — ចំនួនខ្វះនៅបណ្ដោះអាសន្ន (ថ្ងៃនៅសល់នៅមិនទាន់គិត)។ ប៊ូតុង "បំពេញទាំងអស់" បិទរហូតដល់ចប់ខែ។</div>' : '');
    $('stApplyAll').disabled = locked || !ended;
    buildRows();
    let nNeed = 0, nOk = 0, nNo = 0, sum = 0;
    rows.forEach(r => { if (!r.c.eligible) nNo++; else if (r.c.topup > 0) nNeed++; else nOk++; if (r.item) sum += Number(r.item.amount) || 0; });
    $('stSum').textContent = `ត្រូវបំពេញ ${nNeed} នាក់ · គ្រប់ប្រាក់ខែរួច ${nOk} នាក់ · មិនធានា ${nNo} នាក់ · បានបំពេញសរុប +$${money(sum)}`;
    $('stBody').innerHTML = rows.length ? rows.map(({ e, c, item }, i) => {
      const dis = locked ? 'disabled' : '';
      const status = !c.eligible ? `<span class="st-no">✕ មិនធានា</span><div class="st-why">${esc(c.why.join(' · '))}</div>`
        : (c.topup > 0 ? '<span class="st-no">⚠ ខ្វះ</span>' : '<span class="st-ok">✓ គ្រប់ប្រាក់ខែ</span>');
      const cur = item ? `<span class="st-ok">➕ +$${money(item.amount)}</span>` : '<span style="color:var(--text-muted)">—</span>';
      const stale = item && Math.abs((Number(item.amount) || 0) - c.topup) > EPS ? ` <span class="st-no" title="ចំនួនបានបំពេញខុសពីការគណនាថ្មី">≠ $${money(c.topup)}</span>` : '';
      return `<tr data-id="${esc(e.id)}">
        <td>${i + 1}</td><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td>
        <td style="text-align:right">${money(c.salary)}</td><td style="text-align:right">${money(c.base)}</td><td style="text-align:right">${c.eligible ? money(c.gap) : '—'}</td>
        <td>${status}</td><td>${cur}${stale}</td>
        <td>${c.topup > 0 || (item && c.eligible) ? `<button class="st-act" data-act="add" ${dis}>🛡️ ${item ? 'អាប់ដេត' : 'បំពេញ'}</button>` : ''}${item ? ` <button class="secondary st-act" data-act="del" title="ដកចេញ" ${dis}>✕</button>` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" style="padding:16px">មិនមានបុគ្គលិក</td></tr>';
  }

  function afterChange() {
    render();
    if (typeof renderMonthlyTab === 'function') { try { renderMonthlyTab(); } catch (e) { /* ignore */ } }
    if (typeof renderPayrollTab === 'function') { try { renderPayrollTab(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- សកម្មភាព ----
  async function applyItem(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'បំពេញប្រាក់ខែ'); return false; }
    const emp = payrollEmployeesForMonth(month).find(e => String(e.id) === String(empId));
    if (!emp) return false;
    const c = calc(emp, month);
    const id = itemId(empId, month);
    const old = payrollItems.find(p => p.id === id) || null;
    if (!c.eligible || !(c.topup > 0)) { // លែងត្រូវបំពេញ → ដកធាតុចាស់ចេញ (បើមាន)
      if (old) return removeItem(empId, silent);
      if (!silent) await customAlert(c.eligible ? 'បុគ្គលិកនេះបានប្រាក់ខែគ្រប់រួចហើយ មិនបាច់បំពេញទេ' : 'បុគ្គលិកនេះមិនត្រូវបានធានាប្រាក់ខែ៖ ' + c.why.join(' · '));
      return false;
    }
    const item = { id, employeeId: empId, type: 'benefit', name: `បំពេញប្រាក់ខែ ${month}`, recurrence: 'variable', month, currency: 'USD', amount: r2(c.topup) };
    const saved = await upsertPayrollItemRow(item);
    if (!saved) return false;
    const idx = payrollItems.findIndex(p => p.id === id);
    if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
    if (typeof logAudit === 'function') logAudit('topup_apply', { entity: 'payroll_item', ref: id, month, employeeId: empId,
      old: old ? { name: old.name, type: old.type, currency: 'USD', amount: old.amount } : null, new: { name: item.name, type: item.type, currency: 'USD', amount: item.amount } });
    return true;
  }

  async function removeItem(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'ដកប្រាក់បំពេញ'); return false; }
    const id = itemId(empId, month);
    const prev = payrollItems.find(p => p.id === id);
    if (!prev) return false;
    const ok = await deletePayrollItemRow(id);
    if (!ok) return false;
    payrollItems = payrollItems.filter(p => p.id !== id);
    if (typeof logAudit === 'function') logAudit('topup_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prev.name, type: prev.type, currency: 'USD', amount: prev.amount }, new: null });
    return true;
  }

  async function bulk() {
    const month = curMonth;
    if (guardLocked(month, 'បំពេញប្រាក់ខែ')) return;
    if (!monthEnded(month)) { await customAlert('ខែនេះមិនទាន់ចប់ — សូមបំពេញក្រោយចប់ខែ'); return; }
    const all = payrollEmployeesForMonth(month).map(e => ({ e, c: calc(e, month), item: payrollItems.find(p => p.id === itemId(e.id, month)) }));
    const targets = all.filter(({ c, item }) => c.topup > 0 && (!item || Math.abs((Number(item.amount) || 0) - c.topup) > EPS));
    const stale = all.filter(({ c, item }) => item && !(c.topup > 0)); // ធាតុចាស់ដែលលែងត្រូវមាន
    if (!targets.length && !stale.length) { await customAlert('គ្មានបុគ្គលិកត្រូវបំពេញទេ (ឬបានបំពេញរួចហើយ)'); return; }
    const preview = targets.slice(0, 8).map(t => `${t.e.name} +$${money(t.c.topup)}`).join('\n') + (targets.length > 8 ? `\n…(+${targets.length - 8})` : '');
    if (!(await customConfirm(`🛡️ បំពេញប្រាក់ខែ ${targets.length} នាក់ ក្នុងខែ ${month}?\n${preview}${stale.length ? `\n\nនិងដកធាតុចាស់ដែលលែងត្រូវមាន ${stale.length} នាក់` : ''}`))) return;
    let ok = 0;
    for (const t of targets) { if (await applyItem(t.e.id, true)) ok++; }
    for (const s of stale) { await removeItem(s.e.id, true); }
    afterChange();
    await customAlert(`បានបំពេញ ${ok}/${targets.length} នាក់${stale.length ? ` · ដកធាតុចាស់ ${stale.length}` : ''}`);
  }

  // ---------------------------------------------------------------- init ----
  function init() {
    if (document.getElementById('monthlyTopupBtn')) return;
    const anchor = document.getElementById('monthlyFullBtn') || document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyTopupBtn'; btn.type = 'button';
    btn.textContent = '🛡️ បំពេញប្រាក់ខែ';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openSalaryTopup = open;
  window.salaryTopupCalc = calc; // សម្រាប់សាកល្បង/ពិនិត្យ
})();
