/* leave-form.js — ទម្រង់សុំច្បាប់ (请假单 · LEAVE APPLICATION FORM) សម្រាប់បោះពុម្ព
 * ត្រូវនឹងទម្រង់ក្រដាសរបស់ក្រុមហ៊ុន៖ ឈ្មោះ / លេខ / កាលបរិច្ឆេទ / ផ្នែក / ក្រុម / ប្រភេទច្បាប់ (ធីក ✓) /
 * មូលហេតុ / ចាប់ពីថ្ងៃទី / សរុបថ្ងៃ / ម៉ោងចេញ / ថ្ងៃចូលធ្វើការ / ហត្ថលេខា
 *
 * ប្រើ៖  printLeaveForm(leaveRequest, employee)
 *   leaveRequest = ជួរពីតារាង leave_requests (leave_type, start_date, end_date, reason, created_at, ...)
 *   employee     = { name, username/id, dept }
 * ដាក់ <script src="leave-form.js"></script> ក្នុង index.html (Admin) និង employee.html (បុគ្គលិក)
 */
(function () {
  'use strict';

  // ប្រភេទច្បាប់ក្នុងប្រព័ន្ធ → ប្រអប់ក្នុងទម្រង់ក្រដាស
  const FORM_TYPES = [
    { key: 'annual',  en: 'AnnualLeave',  zh: '年假',   km: 'សំរាកប្រចាំឆ្នាំ' },
    { key: 'other',   en: 'Special Leave', zh: '特假',   km: 'សំរាកពិសេស' },
    { key: 'sick',    en: 'Medical Leave', zh: '病假',   km: 'សំរាកព្យាបាលជំងឺ' },
    { key: 'unpaid',  en: 'Unpaid Leave',  zh: '事假',   km: 'សំរាកគ្មានប្រាក់ឈ្នួល' },
    { key: 'paid',    en: 'Grand Leave',   zh: '有薪假', km: 'សំរាកមានប្រាក់ឈ្នួល' },
    { key: 'maternity', en: 'Maternity Leave', zh: '产假', km: 'សំរាកសំរាលកូន' },
  ];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => String(Math.round(n * 100) / 100);

  function unitOf(req) {
    if (typeof leaveUnitOf === 'function') return leaveUnitOf(req);
    const m = ((req && req.reason) || '').match(/\[#(half|hour):([^\]]+)\]/);
    if (!m) return { unit: 'day' };
    if (m[1] === 'half') return { unit: 'half', period: m[2] === 'pm' ? 'pm' : 'am' };
    return { unit: 'hour', hours: parseFloat(m[2]) || 0 };
  }
  function cleanReason(req) {
    if (typeof stripUnitTag === 'function') return stripUnitTag(req.reason);
    return String(req.reason || '').replace(/\s*\[#(half|hour|out):[^\]]+\]\s*/g, ' ').trim();
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isOffDay(dateStr) {                           // ថ្ងៃអាទិត្យ ឬថ្ងៃបុណ្យ (មិនមែនថ្ងៃដោះដូរ)
    if (new Date(dateStr + 'T00:00:00').getDay() === 0) return true;
    try {
      if (typeof holidays !== 'undefined' && holidays[dateStr] !== undefined) {
        const swap = (typeof isSwapHoliday === 'function') && isSwapHoliday(dateStr);
        return !swap;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  function nextWorkday(dateStr) {
    let d = addDays(dateStr, 1);
    for (let i = 0; i < 10 && isOffDay(d); i++) d = addDays(d, 1);
    return d;
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;
  }

  function buildHtml(req, emp) {
    const u = unitOf(req);
    const stdHours = (typeof settings !== 'undefined' && settings.standardHours > 0) ? settings.standardHours : 8;
    let totalTxt, timeOut = '', dateIn;
    const mOut = String(req.reason || '').match(/\[#out:(\d{2}:\d{2})\]/);
    const chosenOut = mOut ? mOut[1] : '';                // ម៉ោងចេញដែលបុគ្គលិកបានបញ្ចូល
    if (u.unit === 'half') {
      totalTxt = 'កន្លះថ្ងៃ (0.5)';
      timeOut = chosenOut || (u.period === 'pm' ? '12:00' : '');   // បើមិនបានបញ្ចូល៖ រសៀល = 12:00
      dateIn = u.period === 'pm' ? nextWorkday(req.end_date) : req.end_date;
    } else if (u.unit === 'hour') {
      totalTxt = `${num(u.hours)} ម៉ោង (${num(u.hours / stdHours)} ថ្ងៃ)`;
      timeOut = chosenOut;
      dateIn = nextWorkday(req.end_date);
    } else {
      totalTxt = `${daysBetween(req.start_date, req.end_date)} ថ្ងៃ`;
      dateIn = nextWorkday(req.end_date);
    }
    const appliedDate = String(req.created_at || '').slice(0, 10) || req.start_date;
    const empNo = emp.username || emp.id || '';
    const reason = cleanReason(req);

    const box = key => `<span class="box">${req.leave_type === key ? '✓' : ''}</span>`;
    const typeCell = t => `
      <div class="type">
        <div class="lbl"><div class="km">${t.km}</div><div class="zh">${t.zh}</div><div class="en">${t.en}:</div></div>
        ${box(t.key)}
      </div>`;

    const field = (km, zh, en, val, cls) => `
      <div class="field ${cls || ''}">
        <div class="lbl"><div class="km">${km}</div><div class="zh">${zh}</div><div class="en">${en}:</div></div>
        <div class="val">${esc(val)}</div>
      </div>`;

    return `<!doctype html><html lang="km"><head><meta charset="utf-8">
<title>ទម្រង់សុំច្បាប់ — ${esc(emp.name || '')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Khmer','Khmer OS Battambang','Khmer UI','Noto Sans SC','Microsoft YaHei',Arial,sans-serif; color:#111; margin:0; font-size:11pt; }
  .toolbar { padding:10px; background:#f1f5f9; text-align:center; }
  .toolbar button { padding:8px 18px; font-size:12pt; border-radius:8px; border:0; background:#0d9488; color:#fff; cursor:pointer; }
  @media print { .toolbar { display:none; } }
  .sheet { max-width:190mm; margin:0 auto; padding:8mm 4mm; }
  h1 { text-align:center; margin:0; font-size:17pt; letter-spacing:1px; }
  .sub { text-align:center; font-size:10pt; margin-bottom:10mm; }
  .row { display:flex; gap:10mm; margin-bottom:6mm; align-items:flex-end; }
  .field { flex:1; display:flex; gap:3mm; align-items:flex-end; }
  .field.w2 { flex:2; }
  .field.f12 { flex:1.25; }
  .field.f14 { flex:1.5; }
  .lbl { line-height:1.15; flex:0 0 auto; min-width:24mm; }
  .lbl .km { font-weight:700; font-size:10.5pt; }
  .lbl .zh, .lbl .en { font-size:8.5pt; color:#333; }
  .val { flex:1; min-width:0; border-bottom:1px solid #111; min-height:9mm; padding:0 2mm 1mm; font-size:12pt; font-weight:600; white-space:nowrap; }
  .wrap .val { white-space:normal; }
  .types { display:grid; grid-template-columns:repeat(3, 1fr); gap:6mm 6mm; margin:4mm 0 8mm; }
  .type { display:flex; gap:2mm; align-items:flex-end; min-width:0; }
  .type .lbl { flex:1; min-width:0; }
  .box { flex:0 0 auto; display:inline-flex; width:20mm; height:10mm; border:1px solid #111; align-items:center; justify-content:center; font-size:17pt; font-weight:700; }
  .sign { display:flex; gap:8mm; margin-top:14mm; }
  .sign > div { flex:1; text-align:center; }
  .sign .line { border-bottom:1px solid #111; height:20mm; }
  .sign .t { font-size:9.5pt; margin-top:2mm; line-height:1.2; }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨 បោះពុម្ព</button></div>
<div class="sheet">
  <h1>请假单</h1>
  <div class="sub">LEAVE APPLICATION FORM</div>

  <div class="row">
    ${field('ឈ្មោះ', '姓名', 'Name', emp.name, 'w2')}
    ${field('លេខបុគ្គលិក', '工号', 'Emp N°', empNo, 'f12')}
    ${field('កាលបរិច្ឆេទ', '日期', 'Date', appliedDate, 'f14')}
  </div>
  <div class="row">
    ${field('ផ្នែក', '部门', 'Dept', emp.dept || '', 'w2')}
    ${field('ក្រុម', '组别', 'Line', '', 'w2')}
  </div>

  <div class="types">${FORM_TYPES.map(typeCell).join('')}</div>

  <div class="row">${field('មូលហេតុ', '原因', 'Reason', reason, 'w2 wrap')}</div>
  <div class="row">
    ${field('ចាប់ពីថ្ងៃទី', '日期从', 'From Date', req.start_date)}
    ${field('ដល់ថ្ងៃទី', '至', 'To Date', req.end_date)}
  </div>
  <div class="row">
    ${field('សរុបថ្ងៃសុំច្បាប់', '请假天数', 'Total Day Taken', totalTxt, 'f14')}
    ${field('ម៉ោងចេញ', '下班时间', 'Time out', timeOut)}
    ${field('ថ្ងៃចូលធ្វើការ', '上班日期', 'Date in', dateIn, 'f14')}
  </div>

  <div class="sign">
    <div><div class="line"></div><div class="t">អ្នកស្នើសុំ<br>申请人 / Applicant</div></div>
    <div><div class="line"></div><div class="t">ប្រធានផ្នែក<br>部门主管 / Supervisor</div></div>
    <div><div class="line"></div><div class="t">ប្រធានរោងចក្រ<br>厂长 / Manager</div></div>
  </div>
</div>
</body></html>`;
  }

  window.printLeaveForm = function (req, emp) {
    if (!req) return;
    const w = window.open('', '_blank');
    if (!w) { alert('សូមអនុញ្ញាត pop-up ដើម្បីបើកទម្រង់បោះពុម្ព'); return; }
    w.document.open();
    w.document.write(buildHtml(req, emp || {}));
    w.document.close();
  };
})();
