/* leave-extra.js
 * បន្ថែម ៣ តារាងក្នុងទំព័រ "សម្រាកបំណាច់ឆ្នាំ / មានប្រាក់ឈ្នួល" (leavebalanceTab):
 *   1) បើកជំនួសចុងឆ្នាំ  2) ប្រវត្តិប្រើច្បាប់  3) សង្ខេបតាមខែ
 * ត្រូវផ្ទុកក្រោយ script.js  →  <script src="leave-extra.js"></script>
 * ប្រើ ឆ្នាំ (#lbYear) និងប្រអប់ស្វែងរក (#lbSearch) ដែលមានស្រាប់ ហើយប្រើ
 * applyLeaveCashItem / removeLeaveCashItem ដែលមានស្រាប់សម្រាប់ប៊ូតុង "បើកជំនួស".
 */
(function () {
  'use strict';

  const MONTH_LABELS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const STATUS_FILTER_LABELS = { approved: 'អនុម័ត', pending: 'កំពុងរង់ចាំ', rejected: 'បដិសេធ', '': 'ទាំងអស់' };

  let activeSub = 'payout'; // payout | history | monthly

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const num = (v, d) => (Number.isFinite(v) ? v : 0).toFixed(d == null ? 1 : d);
  const selYear = () => parseInt($('lbYear') && $('lbYear').value, 10) || parseInt(todayStr().slice(0, 4), 10);
  const selSearch = () => (($('lbSearch') && $('lbSearch').value) || '').toLowerCase().trim();
  const empById = id => employees.find(e => e.id === id);
  const empLabel = id => { const e = empById(id); return e ? e.name : '(បុគ្គលិកត្រូវបានលុប)'; };

  // ថ្ងៃច្បាប់ដែលស្ថិតក្នុងខែនីមួយៗ (0-11) នៃឆ្នាំ — ច្បាប់មិនពេញថ្ងៃ រាប់ទៅខែនៃ start_date (ដូច usedLeaveDays)
  function leaveDaysByMonth(req, year) {
    const out = new Array(12).fill(0);
    const ys = `${year}-01-01`, ye = `${year}-12-31`;
    if (leaveUnitOf(req).unit !== 'day') {
      if (req.start_date >= ys && req.start_date <= ye) out[parseInt(req.start_date.slice(5, 7), 10) - 1] += leaveWeightDays(req);
      return out;
    }
    const s = req.start_date < ys ? ys : req.start_date;
    const e = req.end_date > ye ? ye : req.end_date;
    if (s > e) return out;
    datesInRange(s, e).forEach(d => { out[parseInt(d.slice(5, 7), 10) - 1] += 1; });
    return out;
  }

  function downloadCsv(filename, rows) {
    const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- UI shell (បញ្ចូលចុងទំព័រ leavebalanceTab) ----------
  function ensureShell() {
    if ($('lvxRoot')) return true;
    const host = $('leavebalanceTab');
    if (!host) return false;
    const root = document.createElement('div');
    root.id = 'lvxRoot';
    root.style.cssText = 'margin-top:24px;';
    root.innerHTML = `
      <div id="lvxSubTabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" data-sub="payout">💵 បើកជំនួសចុងឆ្នាំ</button>
        <button type="button" data-sub="history">📜 ប្រវត្តិប្រើច្បាប់</button>
        <button type="button" data-sub="monthly">📅 សង្ខេបតាមខែ</button>
      </div>
      <div id="lvxPanel"></div>`;
    host.appendChild(root);
    root.querySelectorAll('#lvxSubTabs button').forEach(b => b.addEventListener('click', () => { activeSub = b.dataset.sub; renderExtra(); }));
    // ប្តូរ filter ក្នុង panel (event delegation)
    root.addEventListener('change', e => { if (e.target.matches('.lvx-filter')) renderExtra(); });
    root.addEventListener('click', e => {
      const csv = e.target.closest('[data-lvx-csv]');
      if (csv) { exportCurrent(); return; }
      const del = e.target.closest('[data-lvx-del]');
      if (del) deleteLeaveRequest(del.getAttribute('data-lvx-del'));
    });
    return true;
  }

  function paintSubTabs() {
    document.querySelectorAll('#lvxSubTabs button').forEach(b => {
      const on = b.dataset.sub === activeSub;
      b.classList.toggle('secondary', !on);
      b.style.fontWeight = on ? '700' : '400';
    });
  }

  const tableWrap = html => `<div class="table-wrap">${html}</div>`;
  const csvBtn = `<button type="button" class="secondary" data-lvx-csv="1">⬇ CSV</button>`;
  const empty = msg => `<div class="empty-state">${msg}</div>`;

  // ---------- Tab 1: បើកជំនួសចុងឆ្នាំ ----------
  function payoutRows() {
    const year = selYear(), q = selSearch();
    return employees.filter(e => e.status === 'active' && employeeMatchesSearch(e, q)).map(emp => {
      const r = calcLeaveBalanceRow(emp, year, lbRules);
      const dailyRate = settings.workDaysPerMonth > 0 ? (parseFloat(emp.salary) || 0) / settings.workDaysPerMonth : 0;
      const item = payrollItems.find(p => p.id === leaveCashItemId(emp.id, year));
      let state; // paid | outdated | unpaid | none
      if (item && Math.abs(item.amount - r.cashAmount) < 0.005) state = 'paid';
      else if (item) state = 'outdated';
      else if (r.cashAmount > 0) state = 'unpaid';
      else state = 'none';
      return { emp, r, dailyRate, item, state };
    });
  }

  function renderPayout() {
    const year = selYear();
    const rows = payoutRows();
    const filter = ($('lvxPayFilter') && $('lvxPayFilter').value) || '';
    const shown = rows.filter(x => !filter || x.state === filter);
    const payable = rows.filter(x => x.r.cashAmount > 0);
    const totalAmt = payable.reduce((a, x) => a + x.r.cashAmount, 0);
    const paidAmt = payable.filter(x => x.state === 'paid').reduce((a, x) => a + x.r.cashAmount, 0);
    const unpaidCnt = rows.filter(x => x.state === 'unpaid' || x.state === 'outdated').length;

    const badge = s => ({
      paid: '<span class="badge active">✓ បានបើក</span>',
      outdated: '<span class="badge pending">⚠ ត្រូវអាប់ដេត</span>',
      unpaid: '<span class="badge inactive">មិនទាន់បើក</span>',
      none: '-',
    })[s];

    const body = shown.map(({ emp, r, dailyRate, item, state }) => {
      let action = '-';
      if (state === 'paid') action = `<button class="danger" onclick="removeLeaveCashItem('${emp.id}')">🗑 ដកចេញ</button>`;
      else if (state === 'outdated') action = `<button onclick="applyLeaveCashItem('${emp.id}')">🔄 អាប់ដេត</button> <button class="danger" onclick="removeLeaveCashItem('${emp.id}')">🗑</button>`;
      else if (state === 'unpaid') action = `<button onclick="applyLeaveCashItem('${emp.id}')">💵 បើកជំនួស</button>`;
      return `<tr>
        <td>${escapeHtml(emp.username || '-')}</td>
        <td>${escapeHtml(emp.name)}</td>
        <td>${num(r.remaining)}</td>
        <td>${r.carryOut ? num(r.carryOut) : '-'}</td>
        <td><strong>${r.cashDays ? num(r.cashDays) : '-'}</strong></td>
        <td>$${fmtUSD(dailyRate)}</td>
        <td><strong>${r.cashAmount ? '$' + fmtUSD(r.cashAmount) : '-'}</strong></td>
        <td>${badge(state)}</td>
        <td>${item ? `${year}-12` : '-'}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');

    $('lvxPanel').innerHTML = `
      <div class="attendance-stats" style="margin-bottom:12px;">
        <div class="stat-card"><div class="num">${payable.length}</div><div class="label">បុគ្គលិកត្រូវបើកជំនួស</div></div>
        <div class="stat-card"><div class="num">$${fmtUSD(totalAmt)}</div><div class="label">ប្រាក់ត្រូវបើកសរុប</div></div>
        <div class="stat-card"><div class="num">$${fmtUSD(paidAmt)}</div><div class="label">បានបើករួច</div></div>
        <div class="stat-card"><div class="num">${unpaidCnt}</div><div class="label">មិនទាន់បើក</div></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <select id="lvxPayFilter" class="lvx-filter">
          <option value="">ស្ថានភាព៖ ទាំងអស់</option>
          <option value="unpaid"${filter === 'unpaid' ? ' selected' : ''}>មិនទាន់បើក</option>
          <option value="outdated"${filter === 'outdated' ? ' selected' : ''}>ត្រូវអាប់ដេត</option>
          <option value="paid"${filter === 'paid' ? ' selected' : ''}>បានបើក</option>
        </select>
        ${csvBtn}
        <span style="font-size:0.78rem;color:var(--text-muted,#6b7280);">ប្រាក់ត្រូវបញ្ចូលក្នុង "អត្ថប្រយោជន៍" ខែ ${year}-12</span>
      </div>
      ${shown.length ? tableWrap(`<table>
        <thead><tr><th>លេខគ្រប់គ្រង</th><th>ឈ្មោះ</th><th>នៅសល់ (ថ្ងៃ)</th><th>ផ្ទេរឆ្នាំក្រោយ</th><th>ថ្ងៃត្រូវបើក</th><th>ប្រាក់ឈ្នួល/ថ្ងៃ</th><th>ប្រាក់ត្រូវបើក ($)</th><th>ស្ថានភាព</th><th>ខែបើក</th><th></th></tr></thead>
        <tbody>${body}</tbody></table>`) : empty('មិនមានទិន្នន័យ')}`;
  }

  // ---------- Tab 2: ប្រវត្តិប្រើច្បាប់ ----------
  function historyRows() {
    const year = selYear(), q = selSearch();
    const empF = ($('lvxHisEmp') && $('lvxHisEmp').value) || '';
    const typeF = ($('lvxHisType') && $('lvxHisType').value) || '';
    const stF = $('lvxHisStatus') ? $('lvxHisStatus').value : 'approved';
    const ys = `${year}-01-01`, ye = `${year}-12-31`;
    return leaveRequests
      .filter(r => r.start_date <= ye && r.end_date >= ys)
      .filter(r => !empF || r.employee_id === empF)
      .filter(r => !typeF || r.leave_type === typeF)
      .filter(r => !stF || r.status === stF)
      .filter(r => { if (!q) return true; const e = empById(r.employee_id); return e && employeeMatchesSearch(e, q); })
      .map(r => ({ r, days: leaveDaysByMonth(r, year).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => (b.r.start_date || '').localeCompare(a.r.start_date || ''));
  }

  function renderHistory() {
    const empF = ($('lvxHisEmp') && $('lvxHisEmp').value) || '';
    const typeF = ($('lvxHisType') && $('lvxHisType').value) || '';
    const stF = $('lvxHisStatus') ? $('lvxHisStatus').value : 'approved';
    const rows = historyRows();
    const total = rows.reduce((a, x) => a + x.days, 0);

    const empOpts = employees.filter(e => e.status === 'active').map(e => `<option value="${e.id}"${empF === e.id ? ' selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
    const typeOpts = Object.keys(LEAVE_TYPE_LABELS).map(k => `<option value="${k}"${typeF === k ? ' selected' : ''}>${escapeHtml(LEAVE_TYPE_LABELS[k])}</option>`).join('');
    const stOpts = Object.keys(STATUS_FILTER_LABELS).map(k => `<option value="${k}"${stF === k ? ' selected' : ''}>${STATUS_FILTER_LABELS[k]}</option>`).join('');

    const body = rows.map(({ r, days }) => {
      const range = r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`;
      const cls = r.status === 'approved' ? 'active' : r.status === 'rejected' ? 'inactive' : 'pending';
      return `<tr>
        <td>${range}</td>
        <td>${escapeHtml(empLabel(r.employee_id))}</td>
        <td>${escapeHtml(LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type)}</td>
        <td>${escapeHtml(leaveUnitLabel(r))}</td>
        <td><strong>${num(days)}</strong></td>
        <td><span class="badge ${cls}">${REQUEST_STATUS_LABELS[r.status] || r.status}</span></td>
        <td style="text-align:left;">${escapeHtml(stripUnitTag(r.reason) || '-')}</td>
        <td><button type="button" class="danger" data-lvx-del="${escapeHtml(String(r.id))}" title="លុបសំណើច្បាប់នេះ">🗑</button></td>
      </tr>`;
    }).join('');

    $('lvxPanel').innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <select id="lvxHisEmp" class="lvx-filter"><option value="">បុគ្គលិក៖ ទាំងអស់</option>${empOpts}</select>
        <select id="lvxHisType" class="lvx-filter"><option value="">ប្រភេទ៖ ទាំងអស់</option>${typeOpts}</select>
        <select id="lvxHisStatus" class="lvx-filter">${stOpts}</select>
        ${csvBtn}
        <strong style="margin-left:auto;">${rows.length} ការសុំ · សរុប ${num(total)} ថ្ងៃ (ក្នុងឆ្នាំ ${selYear()})</strong>
      </div>
      ${rows.length ? tableWrap(`<table>
        <thead><tr><th>កាលបរិច្ឆេទ</th><th>បុគ្គលិក</th><th>ប្រភេទច្បាប់</th><th>ឯកតា</th><th>ចំនួនថ្ងៃ</th><th>ស្ថានភាព</th><th>មូលហេតុ</th><th></th></tr></thead>
        <tbody>${body}</tbody></table>`) : empty('មិនមានប្រវត្តិច្បាប់ក្នុងឆ្នាំនេះ')}`;
  }

  // ---------- Tab 3: សង្ខេបតាមខែ (ទទួលបាន / ប្រើ / សមតុល្យបន្តបន្ទាប់) ----------
  // ទទួលបានក្នុងមួយខែ = កូតាប្រចាំឆ្នាំ ÷ ចំនួនខែដែលបានបម្រើការ (១៨ ÷ ១២ = ១.៥) ចាប់ពីខែចូលធ្វើការ
  function monthlyData() {
    const year = selYear(), q = selSearch();
    const emps = employees.filter(e => e.status === 'active' && employeeMatchesSearch(e, q));
    const list = emps.map(emp => {
      const months = annualLeaveMonthsInYear(emp, year);         // 0-12
      const quota = annualBaseQuota(emp, year, lbRules);         // កូតាពេញឆ្នាំ (បន្ទាប់ពីកាត់សមាមាត្រ)
      const carry = annualCarryIn(emp, year, lbRules);           // ផ្ទេរមកពីឆ្នាំមុន
      const perMonth = months > 0 ? quota / months : 0;
      const firstMonth = 12 - months;                            // index ខែដំបូងដែលចាប់ផ្តើមទទួលបាន
      const earned = [], used = new Array(12).fill(0), balance = [];
      // ទទួលបានតែដល់ខែបច្ចុប្បន្ន — ខែអនាគតមិនទាន់បំពេញ ហើយនឹងលោតចូលស្វ័យប្រវត្តិពេលចូលខែថ្មី
      const curYear = parseInt(todayStr().slice(0, 4), 10), curMonth = parseInt(todayStr().slice(5, 7), 10);
      const lastMonth = year < curYear ? 11 : (year > curYear ? -1 : curMonth - 1);
      for (let i = 0; i < 12; i++) earned.push(i >= firstMonth && i <= lastMonth && months > 0 ? perMonth : 0);
      leaveRequests.forEach(r => {
        if (r.employee_id !== emp.id || r.status !== 'approved' || r.leave_type !== 'annual') return;
        leaveDaysByMonth(r, year).forEach((d, i) => { used[i] += d; });
      });
      let run = carry;
      for (let i = 0; i < 12; i++) {
        if (i > lastMonth) { balance.push(null); continue; }   // ខែអនាគត៖ មិនទាន់គណនា
        run += earned[i] - used[i]; balance.push(round2(run));
      }
      return { emp, carry, earned, used, balance, lastMonth,
        earnedTotal: earned.reduce((a, b) => a + b, 0), usedTotal: used.reduce((a, b) => a + b, 0) };
    });
    return { list };
  }

  function renderMonthly() {
    const { list } = monthlyData();
    const dash = '<span style="color:var(--text-muted,#9ca3af);">-</span>';
    const f = v => (v ? num(v, 2).replace(/\.?0+$/, m => (m === '.00' ? '.0' : m)) : dash);
    const bal = v => v == null ? dash : v < 0 ? `<strong style="color:var(--danger,#e11d48);">${num(v)}</strong>` : `<strong>${num(v)}</strong>`;

    const body = list.map(x => {
      const e = x.emp;
      const endBal = x.lastMonth >= 0 ? x.balance[x.lastMonth] : null; // សមតុល្យ ដល់ខែបច្ចុប្បន្ន
      return `
      <tr>
        <td rowspan="3"><strong>${escapeHtml(e.name)}</strong><div style="font-size:0.7rem;color:var(--text-muted,#6b7280);">${escapeHtml(e.username || '')}</div></td>
        <td>ទទួលបាន</td><td>${x.carry ? num(x.carry) : dash}</td>
        ${x.earned.map(v => `<td>${f(v)}</td>`).join('')}
        <td><strong>${num(x.earnedTotal, 2)}</strong></td>
      </tr>
      <tr>
        <td>ប្រើ</td><td>${dash}</td>
        ${x.used.map(v => `<td>${f(v)}</td>`).join('')}
        <td><strong>${num(x.usedTotal, 2)}</strong></td>
      </tr>
      <tr style="border-bottom:2px solid var(--border,#e5e7eb);">
        <td>សមតុល្យ</td><td>${dash}</td>
        ${x.balance.map(v => `<td>${bal(v)}</td>`).join('')}
        <td>${bal(endBal)}</td>
      </tr>`;
    }).join('');

    const sumArr = key => { const t = new Array(12).fill(0); list.forEach(x => x[key].forEach((v, i) => { t[i] += v; })); return t; };
    const tE = sumArr('earned'), tU = sumArr('used');
    const tB = new Array(12).fill(null);
    list.forEach(x => x.balance.forEach((v, i) => { if (v != null) tB[i] = (tB[i] || 0) + v; }));
    const tBend = list.reduce((a, x) => a + (x.lastMonth >= 0 ? x.balance[x.lastMonth] : 0), 0);
    const carryTotal = list.reduce((a, x) => a + x.carry, 0);
    const foot = `
      <tr><td rowspan="3"><strong>សរុប</strong></td><td>ទទួលបាន</td><td>${carryTotal ? num(carryTotal) : dash}</td>${tE.map(v => `<td><strong>${v ? num(v) : '-'}</strong></td>`).join('')}<td><strong>${num(tE.reduce((a, b) => a + b, 0))}</strong></td></tr>
      <tr><td>ប្រើ</td><td>${dash}</td>${tU.map(v => `<td><strong>${v ? num(v) : '-'}</strong></td>`).join('')}<td><strong>${num(tU.reduce((a, b) => a + b, 0))}</strong></td></tr>
      <tr><td>សមតុល្យ</td><td>${dash}</td>${tB.map(v => `<td>${bal(v)}</td>`).join('')}<td>${bal(list.some(x => x.lastMonth >= 0) ? round2(tBend) : null)}</td></tr>`;

    $('lvxPanel').innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        ${csvBtn}
        <span style="font-size:0.78rem;color:var(--text-muted,#6b7280);">ច្បាប់ប្រចាំឆ្នាំ ឆ្នាំ ${selYear()} · ទទួលបាន = កូតា ÷ ខែបម្រើការ (ឧ. ១៨ ÷ ១២ = ១.៥ ថ្ងៃ/ខែ) · សមតុល្យ = ផ្ទេរមក + ទទួលបានសរុប − ប្រើសរុប ដល់ចុងខែនោះ · ខែអនាគតមិនទាន់បំពេញ (លោតចូលស្វ័យប្រវត្តិពេលចូលខែថ្មី)</span>
      </div>
      ${list.length ? tableWrap(`<table>
        <thead><tr><th>បុគ្គលិក</th><th></th><th>ផ្ទេរមក</th>${MONTH_LABELS.map(m => `<th>${m}</th>`).join('')}<th>សរុប / បច្ចុប្បន្ន</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot>${foot}</tfoot>
      </table>`) : empty('មិនមានបុគ្គលិក')}`;
  }

  // ---------- លុបសំណើច្បាប់ (ទិន្នន័យសាកល្បង) ----------
  // លុបពី Supabase (leave_requests) + ដកស្ថានភាព "ច្បាប់" ចេញពីតារាងវត្តមាន (លើកលែងថ្ងៃដែលមានសំណើច្បាប់ផ្សេងគ្របដណ្តប់)
  let lvxDeleting = false;
  async function deleteLeaveRequest(id) {
    if (lvxDeleting) return;
    const req = leaveRequests.find(r => String(r.id) === String(id));
    if (!req) { customAlert('រកមិនឃើញសំណើនេះទេ'); return; }
    const dates = datesInRange(req.start_date, req.end_date);
    const months = [...new Set(dates.map(d => d.slice(0, 7)))];
    for (const m of months) { if (typeof guardLocked === 'function' && guardLocked(m, 'លុបសំណើច្បាប់')) return; }

    // ថ្ងៃវត្តមានដែលត្រូវដកស្ថានភាព "ច្បាប់" (តែច្បាប់ពេញថ្ងៃ ដែលបានអនុម័ត)
    const isFullDay = leaveUnitOf(req).unit === 'day';
    const toClear = [];
    if (isFullDay && req.status === 'approved') {
      dates.forEach(d => {
        const rec = attendance[d] && attendance[d][req.employee_id];
        if (!rec || rec.status !== 'leave') return;
        const coveredByOther = leaveRequests.some(o => o !== req && o.employee_id === req.employee_id && o.status === 'approved'
          && leaveUnitOf(o).unit === 'day' && o.start_date <= d && d <= o.end_date);
        if (!coveredByOther) toClear.push(d);
      });
    }
    const range = req.start_date === req.end_date ? req.start_date : `${req.start_date} → ${req.end_date}`;
    const msg = `លុបសំណើច្បាប់ "${LEAVE_TYPE_LABELS[req.leave_type] || req.leave_type}" របស់ ${empLabel(req.employee_id)} (${range})?`
      + (toClear.length ? `\nនិងដកស្ថានភាព "ច្បាប់" ចេញពីតារាងវត្តមាន ${toClear.length} ថ្ងៃ (ត្រឡប់ទៅ "មិនទាន់កត់")។` : '')
      + '\nសកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។';
    if (!(await customConfirm(msg))) return;

    lvxDeleting = true;
    try {
      if (req.id != null && !String(req.id).startsWith('local_')) {
        const { error } = await supabaseClient.from('leave_requests').delete().eq('id', req.id);
        if (error) { customAlert('លុបមិនជោគជ័យ៖ ' + error.message); return; }
      }
      leaveRequests = leaveRequests.filter(r => r !== req);
      for (const d of toClear) {
        const rec = { status: '', checkin: '', checkout: '', breakOut: '', breakIn: '' };
        attendance[d][req.employee_id] = rec;
        await upsertAttendanceRecord(d, req.employee_id, rec);
      }
      if (typeof logAudit === 'function') {
        logAudit('leave_delete', { entity: 'leave_request', ref: String(req.id), month: req.start_date.slice(0, 7), employeeId: req.employee_id,
          old: { type: req.leave_type, from: req.start_date, to: req.end_date, status: req.status, attendanceCleared: toClear.length } });
      }
    } finally { lvxDeleting = false; }

    renderLeaveBalanceTab();
    if (typeof renderAttendanceTab === 'function') renderAttendanceTab();
    if (typeof renderRequestsTab === 'function') renderRequestsTab();
    if (typeof renderPayrollTab === 'function') renderPayrollTab();
  }

  // ---------- CSV ----------
  function exportCurrent() {
    const year = selYear();
    if (activeSub === 'payout') {
      const rows = [['លេខគ្រប់គ្រង', 'ឈ្មោះ', 'នៅសល់ (ថ្ងៃ)', 'ផ្ទេរឆ្នាំក្រោយ', 'ថ្ងៃត្រូវបើក', 'ប្រាក់ឈ្នួល/ថ្ងៃ', 'ប្រាក់ត្រូវបើក ($)', 'ស្ថានភាព']];
      const st = { paid: 'បានបើក', outdated: 'ត្រូវអាប់ដេត', unpaid: 'មិនទាន់បើក', none: '' };
      payoutRows().forEach(x => rows.push([x.emp.username || '', x.emp.name, x.r.remaining, x.r.carryOut, x.r.cashDays, round2(x.dailyRate), x.r.cashAmount, st[x.state]]));
      downloadCsv(`leave-payout-${year}.csv`, rows);
    } else if (activeSub === 'history') {
      const rows = [['ចាប់ពី', 'ដល់', 'បុគ្គលិក', 'ប្រភេទ', 'ឯកតា', 'ចំនួនថ្ងៃ', 'ស្ថានភាព', 'មូលហេតុ']];
      historyRows().forEach(({ r, days }) => rows.push([r.start_date, r.end_date, empLabel(r.employee_id), LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type, leaveUnitLabel(r), round2(days), REQUEST_STATUS_LABELS[r.status] || r.status, stripUnitTag(r.reason)]));
      downloadCsv(`leave-history-${year}.csv`, rows);
    } else {
      const { list } = monthlyData();
      const rows = [['បុគ្គលិក', 'ប្រភេទ', 'ផ្ទេរមក'].concat(MONTH_LABELS, ['សរុប / បច្ចុប្បន្ន'])];
      list.forEach(x => {
        rows.push([x.emp.name, 'ទទួលបាន', x.carry].concat(x.earned.map(round2), [round2(x.earnedTotal)]));
        rows.push([x.emp.name, 'ប្រើ', ''].concat(x.used.map(round2), [round2(x.usedTotal)]));
        rows.push([x.emp.name, 'សមតុល្យ', ''].concat(x.balance.map(v => (v == null ? '' : v)), [x.lastMonth >= 0 ? x.balance[x.lastMonth] : '']));
      });
      downloadCsv(`leave-monthly-${year}.csv`, rows);
    }
  }

  // ---------- render ----------
  function renderExtra() {
    if (!ensureShell()) return;
    paintSubTabs();
    try {
      if (activeSub === 'payout') renderPayout();
      else if (activeSub === 'history') renderHistory();
      else renderMonthly();
    } catch (err) {
      console.error('leave-extra render failed', err);
      $('lvxPanel').innerHTML = empty('បង្ហាញតារាងមិនបានជោគជ័យ — មើល Console');
    }
  }

  // ភ្ជាប់ជាមួយ renderLeaveBalanceTab ដើម ដើម្បីឱ្យ refresh ស្វ័យប្រវត្តិ (ប្តូរឆ្នាំ, ស្វែងរក, បើកជំនួស, អនុម័តច្បាប់...)
  if (typeof renderLeaveBalanceTab === 'function') {
    const original = renderLeaveBalanceTab;
    window.renderLeaveBalanceTab = function () {
      const res = original.apply(this, arguments);
      renderExtra();
      return res;
    };
  }
  renderExtra();
})();
