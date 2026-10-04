// ===========================================================================
// ប.ស.ស (NSSF) — គណនា និងកាត់ប្រាក់ខែបុគ្គលិក (Admin)
// Module ដាច់ដោយឡែក៖ មិនប៉ះការគណនាប្រាក់ខែចាស់ទេ។ វាបង្កើត "ធាតុប្រាក់កាត់" (payroll_items)
// ឈ្មោះ "ប.ស.ស (សោធននិវត្តន៍)" ក្នុងខែនីមួយៗ ដូចមុខងារ "យឺត/ច្បាប់ → កាត់លុយ"។
// ត្រូវផ្ទុកក្រោយ script.js (ប្រើ employees, settings, payrollItems, upsertPayrollItemRow ...)
// ===========================================================================
(function () {
  'use strict';

  const RULES_KEY = 'nssf_rules_v1';
  // អត្រាលំនាំដើម (កែបានក្នុងទំព័រ) — សូមផ្ទៀងផ្ទាត់ជាមួយ ប.ស.ស/គណនេយ្យករ មុនប្រើជាផ្លូវការ
  const DEFAULTS = {
    empPension: 2,        // % បុគ្គលិកបង់ — សោធននិវត្តន៍
    empHealth: 0,         // % បុគ្គលិកបង់ — សុខភាព (ប្រភពខ្លះថា 1.3%; លំនាំដើម 0)
    erPension: 2,         // % និយោជកបង់ — សោធននិវត្តន៍
    erRisk: 0.8,          // % និយោជកបង់ — ហានិភ័យការងារ
    erHealth: 2.6,        // % និយោជកបង់ — សុខភាព
    ceilingKHR: 1200000,  // ពិដានប្រាក់ខែសម្រាប់គណនា (៛/ខែ)
    floorKHR: 0,          // ប្រាក់ខែអប្បបរមាសម្រាប់គណនា (៛/ខែ) — 0 = មិនកំណត់
    base: 'salary',       // salary = ប្រាក់ខែមូលដ្ឋាន | earned = ប្រាក់តាមវត្តមាន (មុនកាត់)
    excluded: []          // id បុគ្គលិកដែលមិនចូលរួម ប.ស.ស
  };

  function loadRules() {
    try {
      const raw = localStorage.getItem(RULES_KEY);
      if (raw) { const o = JSON.parse(raw); return { ...DEFAULTS, ...o, excluded: Array.isArray(o.excluded) ? o.excluded : [] }; }
    } catch (e) { /* ignore */ }
    return { ...DEFAULTS, excluded: [] };
  }
  let rules = loadRules();
  function saveRules() { try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch (e) { /* ignore */ } }

  const $ = id => document.getElementById(id);
  const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : Math.max(0, n); };
  const itemId = (empId, month) => `auto_nssf_${empId}_${month}`;
  const ITEM_NAME = 'ប.ស.ស (សោធននិវត្តន៍)';
  const rate = () => (settings && settings.exchangeRate > 0 ? settings.exchangeRate : 4000);

  // ប្រាក់ខែជាប់ ប.ស.ស ជា USD ពេញខែមួយ (មុនបង្គត់ពិដាន)
  function wageUSD(emp, month) {
    if (rules.base === 'earned' && typeof summarizeEmpMonth === 'function') {
      try { const t = summarizeEmpMonth(emp, month); if (t && isFinite(t.total)) return t.total; } catch (e) { /* fall back */ }
    }
    return parseFloat(emp.salary) || 0;
  }

  // គណនា ប.ស.ស សម្រាប់បុគ្គលិកម្នាក់ក្នុងមួយខែ
  function calc(emp, month) {
    const enrolled = !rules.excluded.includes(emp.id);
    const ex = rate();
    const rawKHR = wageUSD(emp, month) * ex;
    let baseKHR = Math.min(rawKHR, rules.ceilingKHR > 0 ? rules.ceilingKHR : Infinity);
    if (rules.floorKHR > 0 && rawKHR > 0) baseKHR = Math.max(baseKHR, Math.min(rules.floorKHR, rules.ceilingKHR || Infinity));
    if (!enrolled || rawKHR <= 0) baseKHR = 0;
    const empPct = rules.empPension + rules.empHealth;
    const erPct = rules.erPension + rules.erRisk + rules.erHealth;
    const empKHR = Math.round(baseKHR * empPct / 100);
    const erKHR = Math.round(baseKHR * erPct / 100);
    return {
      enrolled, rawKHR, baseKHR, empKHR, erKHR,
      empUSD: Math.round(empKHR / ex * 10000) / 10000,
      erUSD: Math.round(erKHR / ex * 10000) / 10000,
      capped: rawKHR > baseKHR && enrolled
    };
  }

  function locked(month, label) {
    if (typeof isMonthLocked === 'function' && isMonthLocked(month)) {
      if (typeof guardLocked === 'function') guardLocked(month, label);
      return true;
    }
    return false;
  }

  async function applyOne(empId, month, silent) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    if (locked(month, 'បញ្ចូល ប.ស.ស')) return;
    const r = calc(emp, month);
    const id = itemId(empId, month);
    const idx = payrollItems.findIndex(x => x.id === id);
    if (r.empUSD <= 0) {                       // គ្មានអ្វីត្រូវកាត់ → ដកធាតុចាស់ចេញ
      if (idx !== -1) { payrollItems.splice(idx, 1); await deletePayrollItemRow(id); }
    } else {
      const item = { id, employeeId: empId, type: 'deduction', name: `${ITEM_NAME} ${month} (${Math.round(r.empKHR).toLocaleString()}៛)`, recurrence: 'variable', month, currency: 'USD', amount: r.empUSD };
      if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
      await upsertPayrollItemRow(item);
    }
    if (!silent) { render(); if (typeof renderPayrollTab === 'function') renderPayrollTab(); }
  }

  async function applyAll() {
    const month = $('nssfMonth').value || todayStr().slice(0, 7);
    if (locked(month, 'បញ្ចូល ប.ស.ស')) return;
    const targets = employees.filter(e => e.status === 'active' && calc(e, month).empUSD > 0);
    if (!targets.length) { customAlert('មិនមាន ប.ស.ស ត្រូវកាត់ទេ (ពិនិត្យអត្រា និងបុគ្គលិកដែលចូលរួម)'); return; }
    if (!(await customConfirm(`បន្ថែម ប.ស.ស សម្រាប់បុគ្គលិក ${targets.length} នាក់ ក្នុងខែ ${month}? (ធាតុដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`))) return;
    for (const e of targets) await applyOne(e.id, month, true);
    render();
    if (typeof renderPayrollTab === 'function') renderPayrollTab();
  }

  async function removeOne(empId, month) {
    if (locked(month, 'ដក ប.ស.ស')) return;
    const id = itemId(empId, month);
    payrollItems = payrollItems.filter(x => x.id !== id);
    await deletePayrollItemRow(id);
    render();
    if (typeof renderPayrollTab === 'function') renderPayrollTab();
  }

  function toggleEnroll(empId, on) {
    rules.excluded = rules.excluded.filter(x => x !== empId);
    if (!on) rules.excluded.push(empId);
    saveRules();
    render();
  }

  function readControls() {
    rules.empPension = num($('nssfEmpPension').value, DEFAULTS.empPension);
    rules.empHealth = num($('nssfEmpHealth').value, DEFAULTS.empHealth);
    rules.erPension = num($('nssfErPension').value, DEFAULTS.erPension);
    rules.erRisk = num($('nssfErRisk').value, DEFAULTS.erRisk);
    rules.erHealth = num($('nssfErHealth').value, DEFAULTS.erHealth);
    rules.ceilingKHR = num($('nssfCeiling').value, DEFAULTS.ceilingKHR);
    rules.floorKHR = num($('nssfFloor').value, 0);
    rules.base = $('nssfBase').value === 'earned' ? 'earned' : 'salary';
    saveRules();
  }
  function fillControls() {
    $('nssfEmpPension').value = rules.empPension;
    $('nssfEmpHealth').value = rules.empHealth;
    $('nssfErPension').value = rules.erPension;
    $('nssfErRisk').value = rules.erRisk;
    $('nssfErHealth').value = rules.erHealth;
    $('nssfCeiling').value = rules.ceilingKHR;
    $('nssfFloor').value = rules.floorKHR;
    $('nssfBase').value = rules.base;
    if (!$('nssfMonth').value) $('nssfMonth').value = todayStr().slice(0, 7);
  }

  function render() {
    const body = $('nssfBody');
    if (!body || typeof employees === 'undefined') return;
    const month = $('nssfMonth').value || todayStr().slice(0, 7);
    const search = ($('nssfSearch').value || '').toLowerCase().trim();
    const rows = employees.filter(e => e.status === 'active')
      .filter(e => employeeMatchesSearch(e, search))
      .map(e => ({ emp: e, r: calc(e, month) }));

    const sum = rows.reduce((a, { r }) => ({ emp: a.emp + r.empUSD, er: a.er + r.erUSD, n: a.n + (r.enrolled ? 1 : 0) }), { emp: 0, er: 0, n: 0 });
    const ex = rate();
    $('nssfStats').innerHTML = `
      <div class="stat-card"><div class="num">${sum.n}</div><div class="label">បុគ្គលិកចូលរួម ប.ស.ស</div></div>
      <div class="stat-card"><div class="num">$${fmtUSD(sum.emp)}</div><div class="label">បុគ្គលិកបង់សរុប ($)</div></div>
      <div class="stat-card"><div class="num">${fmtRiel(sum.emp * ex)} ៛</div><div class="label">បុគ្គលិកបង់សរុប (រៀល)</div></div>
      <div class="stat-card"><div class="num">$${fmtUSD(sum.er)}</div><div class="label">និយោជកបង់សរុប ($)</div></div>
      <div class="stat-card"><div class="num">$${fmtUSD(sum.emp + sum.er)}</div><div class="label">ត្រូវបង់ ប.ស.ស សរុប ($)</div></div>`;

    const empty = $('nssfEmpty');
    if (!rows.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    body.innerHTML = rows.map(({ emp, r }) => {
      const existing = payrollItems.find(p => p.id === itemId(emp.id, month));
      let action;
      if (!r.enrolled || r.empUSD <= 0) action = existing ? `<button class="danger" data-nssf-rm="${emp.id}">🗑 ដកចេញ</button>` : '-';
      else if (existing && Math.abs(existing.amount - r.empUSD) < 0.00005) action = '<span class="badge active">✓ បានបន្ថែមហើយ</span>';
      else action = `<button data-nssf-ap="${emp.id}">${existing ? '🔄 អាប់ដេត' : '➕ បន្ថែមប្រាក់កាត់'}</button>`;
      return `<tr>
        <td>${escapeHtml(emp.username || '-')}</td>
        <td>${escapeHtml(emp.name)}</td>
        <td><input type="checkbox" data-nssf-en="${emp.id}" ${r.enrolled ? 'checked' : ''}></td>
        <td>${fmtRiel(r.rawKHR)} ៛</td>
        <td>${r.enrolled ? fmtRiel(r.baseKHR) + ' ៛' : '-'}${r.capped ? ' <span class="badge pending" title="លើសពិដាន">ពិដាន</span>' : ''}</td>
        <td>${r.enrolled ? fmtRiel(r.empKHR) + ' ៛' : '-'}</td>
        <td><strong>${r.enrolled ? '$' + fmtUSD(r.empUSD) : '-'}</strong></td>
        <td>${r.enrolled ? fmtRiel(r.erKHR) + ' ៛' : '-'}</td>
        <td><div class="row-actions" style="justify-content:center;">${action}</div></td>
      </tr>`;
    }).join('');
  }

  // ---------- របាយការណ៍ប្រចាំខែ (ប.ស.ស + ពន្ធ) ----------
  // ពន្ធ៖ អានពីធាតុ "ពន្ធលើប្រាក់បៀវត្សរ៍" ដែលបានកាត់រួចក្នុង salary-tax.js (id auto_tos_...)
  function taxKHRApplied(empId, month) {
    const it = payrollItems.find(p => p.id === `auto_tos_${empId}_${month}`);
    if (!it) return null;
    const m = /\(([\d,]+)\s*៛\)/.exec(it.name || '');
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    return Math.round((it.amount || 0) * rate());
  }
  function reportRows(month) {
    return employees.filter(e => e.status === 'active').map(e => {
      const r = calc(e, month);
      return { e, r, tax: taxKHRApplied(e.id, month) };
    }).filter(x => x.r.enrolled || x.tax !== null);
  }
  const REPORT_HEAD = ['#', 'អត្តលេខ', 'ឈ្មោះ', 'តួនាទី', 'ប្រាក់ខែ (៛)', 'ប្រាក់ខែជាប់ ប.ស.ស (៛)', 'បុគ្គលិកបង់ ប.ស.ស (៛)', 'និយោជកបង់ ប.ស.ស (៛)', 'ប.ស.ស សរុប (៛)', 'ពន្ធលើប្រាក់បៀវត្សរ៍ (៛)'];
  function reportMatrix(month) {
    const rows = reportRows(month);
    const body = rows.map(({ e, r, tax }, i) => [i + 1, e.username || '', e.name, e.position || '', Math.round(r.rawKHR), Math.round(r.baseKHR), r.empKHR, r.erKHR, r.empKHR + r.erKHR, tax === null ? '' : tax]);
    const sum = i => body.reduce((a, row) => a + (parseFloat(row[i]) || 0), 0);
    const total = ['', '', 'សរុប', '', sum(4), sum(5), sum(6), sum(7), sum(8), sum(9)];
    return { body, total };
  }
  function exportReportCSV() {
    const month = $('nssfMonth').value || todayStr().slice(0, 7);
    const { body, total } = reportMatrix(month);
    if (!body.length) { customAlert('គ្មានទិន្នន័យ ប.ស.ស/ពន្ធ សម្រាប់ខែនេះទេ (សូម "បន្ថែម" ជាមុនសិន)'); return; }
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [REPORT_HEAD, ...body, total].map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `nssf_tax_${month}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function printReport() {
    const month = $('nssfMonth').value || todayStr().slice(0, 7);
    const { body, total } = reportMatrix(month);
    if (!body.length) { customAlert('គ្មានទិន្នន័យ ប.ស.ស/ពន្ធ សម្រាប់ខែនេះទេ (សូម "បន្ថែម" ជាមុនសិន)'); return; }
    if (typeof openPrintWindow !== 'function') return;
    const f = v => (v === '' ? '-' : Number(v).toLocaleString());
    const rowHtml = r => `<tr><td>${escapeHtml(String(r[0]))}</td><td>${escapeHtml(String(r[1]))}</td><td style="text-align:left;">${escapeHtml(String(r[2]))}</td><td>${escapeHtml(String(r[3]))}</td>${[4, 5, 6, 7, 8, 9].map(i => `<td class="r">${f(r[i])}</td>`).join('')}</tr>`;
    const html = `<div class="page">
      <h1>របាយការណ៍ ប.ស.ស និងពន្ធលើប្រាក់បៀវត្សរ៍</h1>
      <div class="sub">ខែ ${escapeHtml(month)} · អត្រាប្តូរប្រាក់ ${rate().toLocaleString()} ៛/$</div>
      <table><thead><tr>${REPORT_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${body.map(rowHtml).join('')}</tbody>
      <tfoot><tr class="total"><td colspan="4">សរុប</td>${[4, 5, 6, 7, 8, 9].map(i => `<td class="r">${f(total[i])}</td>`).join('')}</tr></tfoot></table>
      <div style="margin-top:10px;font-size:10px;color:#6b7280;">បោះពុម្ពនៅថ្ងៃទី ${todayStr()} · ពន្ធបង្ហាញតែបុគ្គលិកដែលបាន "កាត់ពន្ធ" រួចក្នុងប្រព័ន្ធ</div>
    </div>`;
    openPrintWindow(`ប.ស.ស-ពន្ធ ${month}`, html, true);
  }

  function buildTab() {
    if ($('nssfTab')) return;
    const div = document.createElement('div');
    div.id = 'nssfTab';
    div.className = 'tab-content';
    div.innerHTML = `
    <div class="attendance-controls">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input type="month" id="nssfMonth">
        <input type="text" id="nssfSearch" placeholder="🔍 ស្វែងរកតាមអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px;">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="nssfApplyAllBtn">➕ បន្ថែមទាំងអស់ទៅ "ប្រាក់កាត់"</button>
        <button class="secondary" id="nssfCsvBtn">📊 Export Excel (ប.ស.ស + ពន្ធ)</button>
        <button class="secondary" id="nssfPrintBtn">🖨 ព្រីនរបាយការណ៍</button>
      </div>
    </div>

    <div class="scan-result-card" style="margin-bottom:16px;">
      <h3 style="font-size:0.85rem;margin:0 0 10px;">⚙️ អត្រា ប.ស.ស (NSSF)</h3>
      <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end;">
        <div class="form-group" style="margin:0;"><label>បុគ្គលិកបង់៖ សោធននិវត្តន៍ (%)</label><input type="number" id="nssfEmpPension" min="0" step="0.1" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>បុគ្គលិកបង់៖ សុខភាព (%)</label><input type="number" id="nssfEmpHealth" min="0" step="0.1" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>និយោជកបង់៖ សោធននិវត្តន៍ (%)</label><input type="number" id="nssfErPension" min="0" step="0.1" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>និយោជកបង់៖ ហានិភ័យការងារ (%)</label><input type="number" id="nssfErRisk" min="0" step="0.1" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>និយោជកបង់៖ សុខភាព (%)</label><input type="number" id="nssfErHealth" min="0" step="0.1" style="width:150px;"></div>
      </div>
      <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; margin-top:12px;">
        <div class="form-group" style="margin:0;"><label>ពិដានប្រាក់ខែ (៛/ខែ)</label><input type="number" id="nssfCeiling" min="0" step="1000" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>ប្រាក់ខែអប្បបរមា (៛/ខែ) — 0 = មិនកំណត់</label><input type="number" id="nssfFloor" min="0" step="1000" style="width:150px;"></div>
        <div class="form-group" style="margin:0;"><label>មូលដ្ឋានគណនា</label>
          <select id="nssfBase" style="width:240px;"><option value="salary">ប្រាក់ខែមូលដ្ឋាន (ថេរ)</option><option value="earned">ប្រាក់តាមវត្តមាន (មុនកាត់)</option></select></div>
      </div>
      <p class="scan-hint">*បុគ្គលិកបង់៖ លំនាំដើម សោធននិវត្តន៍ 2% (បានកាត់ពីប្រាក់ខែ)។ និយោជកបង់៖ សោធននិវត្តន៍ 2% + ហានិភ័យការងារ 0.8% + សុខភាព 2.6% (មិនកាត់ពីបុគ្គលិក ជាចំណាយរបស់ក្រុមហ៊ុន)។ ប្រាក់ខែជាប់ ប.ស.ស ត្រូវកំណត់ពិដានតាម ៛ (ប្តូរពី $ តាមអត្រាប្តូរប្រាក់ក្នុង Setting)។ ចុច "បន្ថែម" ដើម្បីបង្កើតធាតុ <strong>"${ITEM_NAME}"</strong> ក្នុងប្រាក់កាត់ខែនោះ ហើយវាចូលក្នុង payslip/ប្រាក់ខែសុទ្ធដោយស្វ័យប្រវត្តិ។ <strong>អត្រានិងពិដានអាចប្រែប្រួលតាមប្រកាស</strong> — សូមផ្ទៀងផ្ទាត់ជាមួយ ប.ស.ស/គណនេយ្យករ មុនប្រើជាផ្លូវការ។</p>
    </div>

    <div class="attendance-stats" id="nssfStats"></div>
    <br>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>អត្តលេខ</th><th>បុគ្គលិក</th><th>ចូលរួម</th><th>ប្រាក់ខែ (៛)</th><th>ប្រាក់ខែជាប់ ប.ស.ស (៛)</th>
          <th>បុគ្គលិកបង់ (៛)</th><th>បុគ្គលិកបង់ ($)</th><th>និយោជកបង់ (៛)</th><th>សកម្មភាព</th>
        </tr></thead>
        <tbody id="nssfBody"></tbody>
      </table>
      <div class="empty-state" id="nssfEmpty" style="display:none;">មិនមានបុគ្គលិកទេ</div>
    </div>`;
    const anchor = $('bonusTab') || $('deductTab');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(div, anchor.nextSibling);
    else document.querySelector('.app-main').appendChild(div);
  }

  function init() {
    buildTab();
    fillControls();
    ['nssfEmpPension', 'nssfEmpHealth', 'nssfErPension', 'nssfErRisk', 'nssfErHealth', 'nssfCeiling', 'nssfFloor']
      .forEach(id => $(id).addEventListener('input', () => { readControls(); render(); }));
    $('nssfBase').addEventListener('change', () => { readControls(); render(); });
    $('nssfMonth').addEventListener('change', render);
    $('nssfSearch').addEventListener('input', render);
    $('nssfApplyAllBtn').addEventListener('click', applyAll);
    $('nssfCsvBtn').addEventListener('click', exportReportCSV);
    $('nssfPrintBtn').addEventListener('click', printReport);
    $('nssfBody').addEventListener('click', ev => {
      const month = $('nssfMonth').value || todayStr().slice(0, 7);
      const ap = ev.target.closest('[data-nssf-ap]');
      const rm = ev.target.closest('[data-nssf-rm]');
      if (ap) applyOne(ap.dataset.nssfAp, month);
      if (rm) removeOne(rm.dataset.nssfRm, month);
    });
    $('nssfBody').addEventListener('change', ev => {
      const en = ev.target.closest('[data-nssf-en]');
      if (en) toggleEnroll(en.dataset.nssfEn, en.checked);
    });
    // បើក tab → គូរតារាង (ចងភ្ជាប់ជាមួយ showTab ចាស់)
    if (typeof showTab === 'function') {
      const orig = showTab;
      window.showTab = function (tab) { orig.apply(this, arguments); if (tab === 'nssf') { fillControls(); render(); } };
    }
    const btn = document.querySelector('.nav-item[data-tab="nssf"]');
    if (btn) btn.addEventListener('click', () => { fillControls(); render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
