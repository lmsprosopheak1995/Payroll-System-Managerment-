/* ==========================================================================
   print.js — ព្រីនតារាងវត្តមាន, តារាងប្រាក់ខែ (Payroll) និង Payslip
   ផ្នែក "core" (openPrintWindow) ប្រើទាំងទំព័រ Admin និងទំព័របុគ្គលិក។
   ========================================================================== */

// ==== ប្រអប់ dialog ផ្ទាល់ខ្លួន (ជំនួស alert/confirm/prompt ដើម native របស់ browser) ====
// ដាក់នៅ print.js ព្រោះឯកសារនេះត្រូវបានផ្ទុកទាំងទំព័រ Admin (index.html) និងទំព័របុគ្គលិក (employee.html)
function ensureCustomDialog() {
  if (document.getElementById('customDialogOverlay')) return;
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.id = 'customDialogOverlay';
  div.innerHTML = `
    <div class="modal" style="max-width:380px;">
      <p id="customDialogMessage" style="white-space:pre-wrap;margin:0 0 14px;"></p>
      <input type="text" id="customDialogInput" style="display:none;width:100%;margin-bottom:14px;" />
      <div class="modal-actions" id="customDialogActions"></div>
    </div>
  `;
  document.body.appendChild(div);
}

function closeCustomDialog() {
  const overlay = document.getElementById('customDialogOverlay');
  if (overlay) overlay.classList.remove('open');
}

function customAlert(message) {
  ensureCustomDialog();
  return new Promise((resolve) => {
    document.getElementById('customDialogMessage').textContent = message;
    document.getElementById('customDialogInput').style.display = 'none';
    const actions = document.getElementById('customDialogActions');
    actions.innerHTML = '<button id="cdOkBtn">យល់ព្រម</button>';
    document.getElementById('customDialogOverlay').classList.add('open');
    document.getElementById('cdOkBtn').onclick = () => { closeCustomDialog(); resolve(true); };
  });
}

function customConfirm(message) {
  ensureCustomDialog();
  return new Promise((resolve) => {
    document.getElementById('customDialogMessage').textContent = message;
    document.getElementById('customDialogInput').style.display = 'none';
    const actions = document.getElementById('customDialogActions');
    actions.innerHTML = '<button class="secondary" id="cdCancelBtn">បោះបង់</button><button class="danger" id="cdOkBtn">យល់ព្រម</button>';
    document.getElementById('customDialogOverlay').classList.add('open');
    document.getElementById('cdOkBtn').onclick = () => { closeCustomDialog(); resolve(true); };
    document.getElementById('cdCancelBtn').onclick = () => { closeCustomDialog(); resolve(false); };
  });
}

function customPrompt(message, isPassword) {
  ensureCustomDialog();
  return new Promise((resolve) => {
    document.getElementById('customDialogMessage').textContent = message;
    const input = document.getElementById('customDialogInput');
    input.style.display = '';
    input.type = isPassword ? 'password' : 'text';
    input.value = '';
    const actions = document.getElementById('customDialogActions');
    actions.innerHTML = '<button class="secondary" id="cdCancelBtn">បោះបង់</button><button id="cdOkBtn">យល់ព្រម</button>';
    document.getElementById('customDialogOverlay').classList.add('open');
    const submit = () => { closeCustomDialog(); resolve(input.value); };
    document.getElementById('cdOkBtn').onclick = submit;
    document.getElementById('cdCancelBtn').onclick = () => { closeCustomDialog(); resolve(null); };
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    setTimeout(() => input.focus(), 50);
  });
}

const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: 'Kantumruy Pro','Noto Sans Khmer','Khmer OS',system-ui,sans-serif; color:#111827; font-size:12px; line-height:1.65; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
h1 { font-size:18px; margin:0; text-align:center; }
.sub { color:#4b5563; font-size:12px; text-align:center; margin:2px 0 10px; }
.info { display:flex; flex-wrap:wrap; gap:2px 28px; font-size:12px; margin:8px 0 4px; }
table { width:100%; border-collapse:collapse; margin-top:8px; }
th, td { border:1px solid #9ca3af; padding:4px 6px; text-align:center; font-size:11px; }
th { background:#eef2ff; font-weight:700; }
td.l, th.l { text-align:left; }
td.r, th.r { text-align:right; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
tr.total td { font-weight:700; background:#f3f4f6; }
tr.sun td { background:#fff7ed; }
.sum { margin-top:10px; font-size:12px; }
.sum strong { font-size:13px; }
.sign { display:flex; justify-content:space-around; gap:20px; margin-top:44px; text-align:center; font-size:12px; }
.sign div { width:30%; border-top:1px solid #111827; padding-top:4px; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.ps-header { text-align:center; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:6px; }
.ps-total-row td { font-weight:700; background:#f3f4f6; }
.ps-wrap { max-width:680px; margin:0 auto; }
.ps-wrap th, .ps-wrap td { text-align:left; font-size:12px; padding:5px 8px; }
.toolbar { position:fixed; top:8px; right:8px; }
.toolbar button { font-family:inherit; padding:8px 14px; font-size:13px; cursor:pointer; }
@media print { .toolbar { display:none; } }
`;

function printEsc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// បើកបង្អួចថ្មី ដាក់ខ្លឹមសារ ហើយហៅប្រអប់ព្រីន បន្ទាប់ពីអក្សរផ្ទុករួច
function openPrintWindow(title, bodyHtml, landscape) {
  const w = window.open('', '_blank');
  if (!w) {
    customAlert('កម្មវិធីរុករកបានរារាំងបង្អួច Popup — សូមអនុញ្ញាត Popup សម្រាប់គេហទំព័រនេះ រួចព្យាយាមម្តងទៀត');
    return;
  }
  const css = PRINT_CSS.replace('size: A4 portrait', landscape ? 'size: A4 landscape' : 'size: A4 portrait');
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${printEsc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;500;600;700&family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨 ព្រីន</button></div>
${bodyHtml}
<script>
window.addEventListener('load', function () {
  var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  ready.then(function () { setTimeout(function () { window.print(); }, 350); });
});
<\/script></body></html>`);
  w.document.close();
}

// ---------------------------------------------------------------------------
// Admin: សង្ខេបប្រចាំខែរបស់បុគ្គលិកម្នាក់ (ដូចទំព័របុគ្គលិក)
// ---------------------------------------------------------------------------
function summarizeEmpMonth(emp, month) {
  const t = { workDays: 0, leaveDays: 0, absentDays: 0, lateDays: 0, doubleDays: 0,
    normalHours: 0, otHours: 0, normalPay: 0, otPay: 0, foodRiel: 0, foodOtRiel: 0, total: 0, riel: 0 };
  daysInMonth(month).forEach(date => {
    const rec = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, rec, date);
    if (r.status === 'present') t.workDays++;
    if (r.status === 'present' && r.mult > 1) t.doubleDays++;
    if (r.status === 'leave') t.leaveDays++;
    if (r.status === 'absent') t.absentDays++;
    if (r.late) t.lateDays++;
    t.normalHours += r.normalHours; t.otHours += r.otHours;
    t.normalPay += r.normalPay; t.otPay += r.otPay;
    t.foodRiel += r.foodPayRiel; t.foodOtRiel += r.foodOtPayRiel;
    t.total += r.total; t.riel += r.riel;
  });
  const items = getPayrollItemsForEmpMonth(emp.id, month);
  t.benefitItems = items.filter(p => p.type === 'benefit');
  t.deductionItems = items.filter(p => p.type === 'deduction');
  t.benefitsUSD = t.benefitItems.reduce((s, p) => s + payrollItemToUSD(p), 0);
  t.deductionsUSD = t.deductionItems.reduce((s, p) => s + payrollItemToUSD(p), 0);
  t.net = t.total + t.benefitsUSD - t.deductionsUSD;
  t.netRiel = t.net * (settings.exchangeRate || 0);
  return t;
}

// ---------------------------------------------------------------------------
// 1) ព្រីនតារាងវត្តមាន
// ---------------------------------------------------------------------------
function attendancePrintPage(emp, month) {
  const sh = getEmpShift(emp.id);
  const fm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const tot = { late: 0, work: 0, normal: 0, ot: 0, food: 0, total: 0, riel: 0 };
  const rows = daysInMonth(month).map(date => {
    const rec = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, rec, date);
    if (r.late) tot.late++;
    if (r.status === 'present') tot.work++;
    tot.normal += r.normalHours; tot.ot += r.otHours;
    tot.food += r.foodPayRiel + r.foodOtPayRiel; tot.total += r.total; tot.riel += r.riel;
    const foodRiel = r.foodPayRiel + r.foodOtPayRiel;
    return `<tr class="${r.mult > 1 ? 'sun' : ''}">
      <td>${date.slice(8)}</td>
      <td>${printEsc(weekdayLabel(date))}${r.mult > 1 ? ' ×' + r.mult : ''}</td>
      <td>${printEsc(r.checkin || '-')}</td><td>${printEsc(r.breakOut || '-')}</td>
      <td>${printEsc(r.breakIn || '-')}</td><td>${printEsc(r.checkout || '-')}</td>
      <td>${r.late ? 'យឺត' : '-'}</td>
      <td>${printEsc(STATUS_LABELS[r.status] || '-')}</td>
      <td>${r.normalHours ? fmtHours(r.normalHours) : '-'}</td>
      <td>${r.otHours ? fmtHours(r.otHours) : '-'}</td>
      <td>${foodRiel ? fmtRiel(foodRiel) : '-'}</td>
      <td class="r">$${fmtUSD(r.total)}</td></tr>`;
  }).join('');

  const t = summarizeEmpMonth(emp, month);
  return `<div class="page">
    <h1>តារាងវត្តមានការងារ</h1>
    <div class="sub">ខែ ${printEsc(month)}</div>
    <div class="info">
      <div><strong>ឈ្មោះ៖</strong> ${printEsc(emp.name)}</div>
      <div><strong>អត្តលេខ៖</strong> ${printEsc(emp.username || '-')}</div>
      <div><strong>តួនាទី៖</strong> ${printEsc(emp.position || '-')}</div>
      <div><strong>ផ្នែក៖</strong> ${printEsc(emp.dept || '-')}</div>
      <div><strong>វេន៖</strong> ${printEsc(sh.name)} (${fm(sh.start)}–${fm(sh.end)})</div>
    </div>
    <table>
      <thead><tr>
        <th>ថ្ងៃទី</th><th>ថ្ងៃ</th><th>ចូល</th><th>ចេញបាយ</th><th>ចូលវិញ</th><th>ចេញ</th>
        <th>យឺត</th><th>ស្ថានភាព</th><th>ធម្មតា (ម៉ោង)</th><th>ថែមម៉ោង (ម៉ោង)</th><th>ប្រាក់បាយ (៛)</th><th>សរុប ($)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total">
        <td colspan="6">សរុប</td><td>${tot.late || '-'}</td><td>${tot.work} ថ្ងៃ</td>
        <td>${fmtHours(tot.normal)}</td><td>${fmtHours(tot.ot)}</td><td>${fmtRiel(tot.food)}</td><td class="r">$${fmtUSD(tot.total)}</td>
      </tr></tfoot>
    </table>
    <div class="sum">
      សរុបតាមវត្តមាន <strong>$${fmtUSD(t.total)}</strong> ·
      អត្ថប្រយោជន៍ <strong>+$${fmtUSD(t.benefitsUSD)}</strong> ·
      ប្រាក់កាត់ <strong>−$${fmtUSD(t.deductionsUSD)}</strong> ·
      ប្រាក់ខែសុទ្ធ <strong>$${fmtUSD(t.net)}</strong> (${fmtRiel(t.netRiel)} ៛)
    </div>
    <div class="sign"><div>បុគ្គលិក</div><div>អ្នកគ្រប់គ្រង</div><div>អ្នកទទួលបន្ទុកបុគ្គលិក</div></div>
    <div style="margin-top:10px;font-size:10px;color:#6b7280;">បោះពុម្ពនៅថ្ងៃទី ${todayStr()}</div>
  </div>`;
}

function printAttendance() {
  const emp = employees.find(e => e.id === currentAttendanceEmployeeId());
  if (!emp) { customAlert('សូមជ្រើសរើសបុគ្គលិកជាមុនសិន'); return; }
  const month = currentAttendanceMonth();
  openPrintWindow(`វត្តមាន ${emp.name} ${month}`, attendancePrintPage(emp, month), true);
}

// ---------------------------------------------------------------------------
// 2) ព្រីនតារាងប្រាក់ខែ (Payroll) របស់បុគ្គលិកទាំងអស់
// ---------------------------------------------------------------------------
function printPayrollSheet() {
  const month = currentPayrollMonth();
  const list = employees.filter(e => e.status === 'active')
    .sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''));
  if (!list.length) { customAlert('មិនមានបុគ្គលិកសកម្មទេ'); return; }
  const g = { work: 0, ot: 0, total: 0, ben: 0, ded: 0, net: 0, netRiel: 0 };
  const rows = list.map((e, i) => {
    const t = summarizeEmpMonth(e, month);
    g.work += t.workDays; g.ot += t.otHours; g.total += t.total;
    g.ben += t.benefitsUSD; g.ded += t.deductionsUSD; g.net += t.net; g.netRiel += t.netRiel;
    return `<tr>
      <td>${i + 1}</td><td>${printEsc(e.username || '-')}</td><td class="l">${printEsc(e.name)}</td>
      <td>${printEsc(e.dept || '-')}</td><td>${t.workDays}</td><td>${t.otHours ? fmtHours(t.otHours) : '-'}</td>
      <td class="r">$${fmtUSD(t.total)}</td><td class="r">+$${fmtUSD(t.benefitsUSD)}</td>
      <td class="r">−$${fmtUSD(t.deductionsUSD)}</td><td class="r"><strong>$${fmtUSD(t.net)}</strong></td>
      <td class="r">${fmtRiel(t.netRiel)} ៛</td><td style="min-width:70px;"></td></tr>`;
  }).join('');
  const html = `<div class="page">
    <h1>តារាងប្រាក់ខែបុគ្គលិក (Payroll)</h1>
    <div class="sub">ខែ ${printEsc(month)} · អត្រាប្តូរប្រាក់ $1 = ${fmtRiel(settings.exchangeRate)} ៛</div>
    <table>
      <thead><tr>
        <th>#</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th>ថ្ងៃធ្វើការ</th><th>ម៉ោងថែម</th>
        <th>តាមវត្តមាន ($)</th><th>អត្ថប្រយោជន៍ ($)</th><th>ប្រាក់កាត់ ($)</th><th>ប្រាក់ខែសុទ្ធ ($)</th><th>ប្រាក់ខែសុទ្ធ (៛)</th><th>ហត្ថលេខា</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total">
        <td colspan="4">សរុប (${list.length} នាក់)</td><td>${g.work}</td><td>${fmtHours(g.ot)}</td>
        <td class="r">$${fmtUSD(g.total)}</td><td class="r">+$${fmtUSD(g.ben)}</td><td class="r">−$${fmtUSD(g.ded)}</td>
        <td class="r">$${fmtUSD(g.net)}</td><td class="r">${fmtRiel(g.netRiel)} ៛</td><td></td>
      </tr></tfoot>
    </table>
    <div class="sign"><div>អ្នករៀបចំ</div><div>គណនេយ្យករ</div><div>នាយកអនុម័ត</div></div>
    <div style="margin-top:10px;font-size:10px;color:#6b7280;">បោះពុម្ពនៅថ្ងៃទី ${todayStr()}</div>
  </div>`;
  openPrintWindow('Payroll ' + month, html, true);
}

// ---------------------------------------------------------------------------
// 3) ព្រីន Payslip (បុគ្គលិកម្នាក់ ឬទាំងអស់)
// ---------------------------------------------------------------------------
function payslipPageHtml(emp, month) {
  const t = summarizeEmpMonth(emp, month);
  const R = 'style="text-align:right;"';
  return `<div class="page ps-wrap">
    <div class="ps-header">
      <div style="font-size:18px;font-weight:700;">បង្កាន់ដៃប្រាក់ខែ / PAYROLL SLIP</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">ខែ ${printEsc(month)}</div>
    </div>
    <table>
      <tr><td style="width:35%;"><strong>ឈ្មោះបុគ្គលិក</strong></td><td>${printEsc(emp.name)}</td></tr>
      <tr><td><strong>អត្តលេខ</strong></td><td>${printEsc(emp.username || '-')}</td></tr>
      <tr><td><strong>តួនាទី</strong></td><td>${printEsc(emp.position || '-')}</td></tr>
      <tr><td><strong>ប្រាក់ខែមូលដ្ឋាន</strong></td><td>$${fmtUSD(parseFloat(emp.salary) || 0)}</td></tr>
    </table>
    <table>
      <tr><th>ព័ត៌មាន</th><th ${R}>ចំនួន</th></tr>
      <tr><td>ថ្ងៃធ្វើការ</td><td ${R}>${t.workDays} ថ្ងៃ</td></tr>
      <tr><td>ថ្ងៃច្បាប់</td><td ${R}>${t.leaveDays} ថ្ងៃ</td></tr>
      <tr><td>ថ្ងៃអវត្តមាន</td><td ${R}>${t.absentDays} ថ្ងៃ</td></tr>
      <tr><td>ថ្ងៃមកយឺត</td><td ${R}>${t.lateDays} ថ្ងៃ</td></tr>
      <tr><td>ម៉ោងធម្មតា / ប្រាក់</td><td ${R}>${fmtHours(t.normalHours)} ម៉ោង — $${fmtUSD(t.normalPay)}</td></tr>
      <tr><td>ម៉ោងថែម / ប្រាក់</td><td ${R}>${fmtHours(t.otHours)} ម៉ោង — $${fmtUSD(t.otPay)}</td></tr>
      <tr><td>ប្រាក់បាយថ្ងៃធម្មតា</td><td ${R}>${fmtRiel(t.foodRiel)} ៛</td></tr>
      <tr><td>ប្រាក់បាយថែមម៉ោង</td><td ${R}>${fmtRiel(t.foodOtRiel)} ៛</td></tr>
      ${t.doubleDays ? `<tr><td>ធ្វើការថ្ងៃអាទិត្យ/បុណ្យ (ឈ្នូល ×${HOLIDAY_MULTIPLIER})</td><td ${R}>${t.doubleDays} ថ្ងៃ</td></tr>` : ''}
      <tr class="ps-total-row"><td>សរុបតាមវត្តមាន</td><td ${R}>$${fmtUSD(t.total)} / ${fmtRiel(t.riel)} ៛</td></tr>
    </table>
    <table>
      <tr><th>អត្ថប្រយោជន៍ / ប្រាក់កាត់</th><th ${R}>ចំនួន</th></tr>
      ${t.benefitItems.map(p => `<tr><td>+ ${printEsc(p.name)}</td><td ${R}>${fmtItemAmount(p)}</td></tr>`).join('')}
      ${t.deductionItems.map(p => `<tr><td>− ${printEsc(p.name)}</td><td ${R}>${fmtItemAmount(p)}</td></tr>`).join('')}
      ${(t.benefitItems.length + t.deductionItems.length) === 0 ? '<tr><td colspan="2" style="text-align:center;">មិនមាន</td></tr>' : ''}
      <tr class="ps-total-row"><td>ប្រាក់ខែសុទ្ធ</td><td ${R}>$${fmtUSD(t.net)} / ${fmtRiel(t.netRiel)} ៛</td></tr>
    </table>
    <div class="sign"><div>បុគ្គលិកទទួល</div><div>អ្នកគ្រប់គ្រង</div></div>
    <div style="margin-top:14px;font-size:11px;color:#6b7280;">បង្កើតនៅថ្ងៃទី ${todayStr()}</div>
  </div>`;
}

function printPayslipFor(emp, month) {
  openPrintWindow(`Payslip ${emp.name} ${month}`, payslipPageHtml(emp, month), false);
}

function printPayslip() {
  const emp = employees.find(e => e.id === currentPayrollEmployeeId());
  if (!emp) { customAlert('សូមជ្រើសរើសបុគ្គលិកជាមុនសិន'); return; }
  printPayslipFor(emp, currentPayrollMonth());
}

function printAllPayslips() {
  const month = currentPayrollMonth();
  const list = employees.filter(e => e.status === 'active')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!list.length) { customAlert('មិនមានបុគ្គលិកសកម្មទេ'); return; }
  openPrintWindow(`Payslip ទាំងអស់ ${month}`, list.map(e => payslipPageHtml(e, month)).join(''), false);
}

function initPrint() {
  document.getElementById('attendancePrintBtn').addEventListener('click', printAttendance);
  document.getElementById('payrollPrintSheetBtn').addEventListener('click', printPayrollSheet);
  document.getElementById('payrollPrintSlipBtn').addEventListener('click', printPayslip);
  document.getElementById('payrollPrintAllBtn').addEventListener('click', printAllPayslips);
}
