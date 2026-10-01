/* ==========================================================================
   payroll-close.js — បិទខែ (Lock + Snapshot) · កែតម្រូវ · ពាក្យតវ៉ា · Audit log · Export Excel
   ចាំបាច់ត្រូវដំណើរការ payroll-close.sql ក្នុង Supabase ជាមុន។
   (ឯកសារនេះត្រូវផ្ទុកមុន script.js — ហៅតាម hooks ដូច features.js)
   ========================================================================== */

let payrollPeriods = {};   // month -> row ពី payroll_periods
let payrollSnaps = {};     // 'YYYY-MM|empId' -> snapshot data
let payrollDisputes = [];  // ពាក្យតវ៉ា + ack ទាំងអស់
const pcMissing = {};      // table -> error message (តារាងមិនទាន់មាន)
let pcAuditWarned = false;
const PC_DAYS_KEY = 'pc_dispute_days_v1';

const pcMonthOf = v => String(v || '').slice(0, 7);

// ---------------------------------------------------------------- lock state ----
function isMonthLocked(month) {
  const p = payrollPeriods[pcMonthOf(month)];
  return !!(p && p.locked);
}

// ត្រឡប់ true បើខែត្រូវបានបិទ (ហើយបង្ហាញសារ) — ប្រើជា guard មុនកែអ្វីមួយ
function guardLocked(monthOrDate, what) {
  const m = pcMonthOf(monthOrDate);
  if (!isMonthLocked(m)) return false;
  customAlert(`ខែ ${m} ត្រូវបានបិទហើយ — មិនអាច${what || 'កែប្រែ'}បានទេ។\nសូមប្រើ "⚖️ កែតម្រូវ" ក្នុងខែបន្ទាប់ ឬបើកខែឡើងវិញ (ត្រូវការពាក្យសម្ងាត់)។`);
  return true;
}

function getLockedSnapshot(empId, month) {
  if (!isMonthLocked(month)) return null;
  return payrollSnaps[month + '|' + empId] || null;
}

function disputeDeadline(month) {
  const p = payrollPeriods[month];
  if (!p || !p.locked) return null;
  const date = new Date(new Date(p.locked_at).getTime() + (p.dispute_days || 0) * 86400000);
  return { date, expired: Date.now() > date.getTime() };
}

function pcFmtDT(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '-';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- load ----
async function pcFetchAll(table, build) {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) { // PostgREST កំណត់ 1000 ជួរ/ស្នើ
    let q = supabaseClient.from(table).select('*');
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) { pcMissing[table] = error.message; return []; }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  delete pcMissing[table];
  return out;
}

async function loadPayrollClose() {
  const cutoff = monthsBack(todayStr().slice(0, 7), 24).pop();
  const [per, snaps, disp] = await Promise.all([
    pcFetchAll('payroll_periods'),
    pcFetchAll('payroll_snapshots', q => q.gte('month', cutoff).order('month')),
    pcFetchAll('payroll_disputes', q => q.order('created_at', { ascending: false })),
  ]);
  payrollPeriods = {};
  per.forEach(p => { payrollPeriods[p.month] = p; });
  payrollSnaps = {};
  snaps.forEach(s => { payrollSnaps[s.month + '|' + s.employee_id] = s.data; });
  payrollDisputes = disp;
}

// ---------------------------------------------------------------- audit log ----
function logAudit(action, o) {
  o = o || {};
  const row = {
    actor: 'admin', action,
    entity: o.entity || null, ref: o.ref || null, month: o.month || null, employee_id: o.employeeId || null,
    old_value: o.old === undefined ? null : o.old, new_value: o.new === undefined ? null : o.new, note: o.note || null,
  };
  supabaseClient.from('audit_log').insert(row).then(({ error }) => {
    if (error && !pcAuditWarned) { pcAuditWarned = true; console.warn('audit_log មិនអាចកត់ត្រាបាន (តើបានដំណើរការ payroll-close.sql ហើយនៅ?):', error.message); }
  });
}

const AUDIT_LABELS = {
  attendance_edit: 'កែវត្តមាន', leave_approve: 'អនុម័តច្បាប់ → វត្តមាន',
  item_add: 'បន្ថែមធាតុ', item_edit: 'កែធាតុ', item_delete: 'លុបធាតុ',
  deduction_apply: 'កាត់យឺត/ច្បាប់', deduction_remove: 'ដកការកាត់យឺត/ច្បាប់',
  bonus_apply: 'បំណាច់ឆ្នាំ', bonus_remove: 'ដកបំណាច់ឆ្នាំ',
  lock_month: '🔒 បិទខែ', unlock_month: '🔓 បើកខែឡើងវិញ',
  adjustment_add: '⚖️ កែតម្រូវ', dispute_approved: 'អនុម័តពាក្យតវ៉ា', dispute_rejected: 'បដិសេធពាក្យតវ៉ា',
};

function pcAuditVal(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v !== 'object') return String(v);
  if ('field' in v) return `${v.field} = ${v.value === '' ? '(ទទេ)' : v.value}`;
  if ('name' in v) return `${v.name} ${v.type === 'benefit' ? '+' : '−'}${v.currency === 'KHR' ? v.amount + ' ៛' : '$' + v.amount}`;
  const s = JSON.stringify(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}

function openAuditModal() {
  document.getElementById('auditMonth').value = currentMonthlyMonth();
  document.getElementById('auditAll').checked = false;
  document.getElementById('auditOverlay').classList.add('open');
  loadAudit();
}
function closeAuditModal() { document.getElementById('auditOverlay').classList.remove('open'); }

async function loadAudit() {
  const body = document.getElementById('auditBody');
  const empty = document.getElementById('auditEmpty');
  body.innerHTML = '<tr><td colspan="6">កំពុងផ្ទុក...</td></tr>';
  empty.style.display = 'none';
  const month = document.getElementById('auditMonth').value;
  const all = document.getElementById('auditAll').checked;
  let q = supabaseClient.from('audit_log').select('*').order('at', { ascending: false }).limit(300);
  if (!all && month) q = q.eq('month', month);
  const { data, error } = await q;
  if (error) {
    body.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'មិនអាចផ្ទុកបានទេ៖ ' + error.message + ' (តើបានដំណើរការ payroll-close.sql ហើយនៅ?)';
    return;
  }
  if (!data.length) { body.innerHTML = ''; empty.style.display = 'block'; empty.textContent = 'មិនមានកំណត់ត្រាទេ'; return; }
  body.innerHTML = data.map(r => `<tr>
    <td style="white-space:nowrap;">${pcFmtDT(r.at)}</td>
    <td>${escapeHtml(AUDIT_LABELS[r.action] || r.action)}</td>
    <td>${r.employee_id ? escapeHtml(empName(r.employee_id)) : '-'}</td>
    <td>${escapeHtml(r.month || '-')}${r.ref && r.entity === 'attendance' ? ' · ' + escapeHtml(r.ref) : ''}</td>
    <td style="white-space:normal;max-width:300px;">${r.old_value !== null ? escapeHtml(pcAuditVal(r.old_value)) + ' → ' : ''}${escapeHtml(pcAuditVal(r.new_value))}</td>
    <td style="white-space:normal;max-width:240px;">${escapeHtml(r.note || '')}</td>
  </tr>`).join('');
}

// ---------------------------------------------------------------- snapshot + lock ----
function buildSnapshot(emp, month) {
  const t = summarizeEmpMonth(emp, month); // ត្រូវតែគណនាពេលខែនៅមិនទាន់បិទ
  const rate = settings.exchangeRate || 0;
  const items = arr => arr.map(p => ({ id: p.id, name: p.name, type: p.type, recurrence: p.recurrence, currency: p.currency, amount: p.amount }));
  return {
    ...t,
    benefitItems: items(t.benefitItems), deductionItems: items(t.deductionItems),
    foodPay: rate > 0 ? t.foodRiel / rate : 0, foodOtPay: rate > 0 ? t.foodOtRiel / rate : 0, // ទម្រង់ដែល employee.html ប្រើ (USD)
    exchangeRate: rate,
    advance: calcAdvanceRow(emp, month),
    info: { name: emp.name, username: emp.username || '', dept: emp.dept || '', position: emp.position || '', salary: parseFloat(emp.salary) || 0 },
  };
}

function loadLockDays() {
  const v = parseInt(localStorage.getItem(PC_DAYS_KEY), 10);
  return isNaN(v) ? 5 : v;
}

async function lockMonth() {
  const month = currentMonthlyMonth();
  if (pcMissing.payroll_periods) { customAlert('សូមដំណើរការ payroll-close.sql ក្នុង Supabase ជាមុនសិន។'); return; }
  if (isMonthLocked(month)) return;
  const days = Math.min(60, Math.max(0, parseInt(document.getElementById('lockDisputeDays').value, 10) || 0));
  try { localStorage.setItem(PC_DAYS_KEY, String(days)); } catch (e) { /* ignore */ }

  const rows = monthlyRows(month);
  if (!rows.length) { customAlert('មិនមានបុគ្គលិកសកម្ម'); return; }
  const warnUnmarked = rows.filter(r => r.unmarked > 0).length;
  const warnDed = rows.filter(r => r.pendingDed).length;
  const lastDay = daysInMonth(month).slice(-1)[0];
  let msg = `បិទខែ ${month} សម្រាប់បុគ្គលិក ${rows.length} នាក់?\n\nក្រោយបិទ៖ វត្តមាន និងធាតុប្រាក់ខែនៃខែនេះនឹងមិនអាចកែបាន ហើយលេខនឹងត្រូវរក្សាទុក (Snapshot)។ បុគ្គលិកអាចតវ៉ាបានក្នុងរយៈពេល ${days} ថ្ងៃ។`;
  const warns = [];
  if (todayStr() < lastDay) warns.push('ខែនេះមិនទាន់ចប់ទេ');
  if (warnUnmarked) warns.push(`បុគ្គលិក ${warnUnmarked} នាក់មានថ្ងៃមិនទាន់កត់វត្តមាន`);
  if (warnDed) warns.push(`បុគ្គលិក ${warnDed} នាក់មានប្រាក់កាត់យឺត/ច្បាប់មិនទាន់បញ្ចូល`);
  if (warns.length) msg += '\n\n⚠️ ' + warns.join('\n⚠️ ');
  if (!(await customConfirm(msg))) return;

  const prev = payrollPeriods[month];
  const emps = employees.filter(e => e.status === 'active');
  const snapRows = emps.map(e => ({ month, employee_id: e.id, data: buildSnapshot(e, month) }));

  const del = await supabaseClient.from('payroll_snapshots').delete().eq('month', month);
  if (del.error) { customAlert('បិទខែមិនជោគជ័យ៖ ' + del.error.message); return; }
  const ins = await supabaseClient.from('payroll_snapshots').upsert(snapRows, { onConflict: 'month,employee_id' });
  if (ins.error) { customAlert('រក្សាទុក Snapshot មិនជោគជ័យ៖ ' + ins.error.message); return; }

  const period = { month, locked: true, locked_at: new Date().toISOString(), dispute_days: days, exchange_rate: settings.exchangeRate || null, unlocked_at: null, unlock_reason: null };
  const up = await supabaseClient.from('payroll_periods').upsert(period, { onConflict: 'month' });
  if (up.error) { customAlert('បិទខែមិនជោគជ័យ៖ ' + up.error.message); return; }

  if (prev && prev.unlocked_at) { // លេខអាចផ្លាស់ប្តូរក្រោយបើកឡើងវិញ → ការបញ្ជាក់ "បានពិនិត្យ" ចាស់លែងត្រឹមត្រូវ
    await supabaseClient.from('payroll_disputes').delete().eq('month', month).eq('kind', 'ack');
    payrollDisputes = payrollDisputes.filter(d => !(d.month === month && d.kind === 'ack'));
  }
  payrollPeriods[month] = period;
  Object.keys(payrollSnaps).filter(k => k.startsWith(month + '|')).forEach(k => delete payrollSnaps[k]);
  snapRows.forEach(s => { payrollSnaps[s.month + '|' + s.employee_id] = s.data; });

  const totalNet = snapRows.reduce((s, r) => s + r.data.net, 0);
  logAudit('lock_month', { entity: 'period', ref: month, month, new: { employees: emps.length, total_net_usd: Math.round(totalNet * 100) / 100, dispute_days: days }, note: warns.join('; ') || null });
  renderAll();
}

async function unlockMonth() {
  const month = currentMonthlyMonth();
  if (!isMonthLocked(month)) return;
  const pw = await customPrompt(`បើកខែ ${month} ឡើងវិញ — បញ្ចូលពាក្យសម្ងាត់អ្នកគ្រប់គ្រង៖`, true);
  if (pw === null) return;
  const { data: ok, error } = await supabaseClient.rpc('login_admin', { p_password: pw });
  if (error || !ok) { customAlert('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ'); return; }
  const reason = ((await customPrompt('មូលហេតុនៃការបើកខែឡើងវិញ (ចាំបាច់)៖')) || '').trim();
  if (!reason) { customAlert('សូមបញ្ចូលមូលហេតុ'); return; }

  const patch = { locked: false, unlocked_at: new Date().toISOString(), unlock_reason: reason };
  const { error: e2 } = await supabaseClient.from('payroll_periods').update(patch).eq('month', month);
  if (e2) { customAlert('បើកខែមិនជោគជ័យ៖ ' + e2.message); return; }
  const old = { total_net_usd: Math.round(rowsNetTotal(month) * 100) / 100 };
  payrollPeriods[month] = { ...payrollPeriods[month], ...patch };
  logAudit('unlock_month', { entity: 'period', ref: month, month, old, note: reason });
  renderAll();
}

function rowsNetTotal(month) {
  return Object.keys(payrollSnaps).filter(k => k.startsWith(month + '|')).reduce((s, k) => s + (payrollSnaps[k].net || 0), 0);
}

// ---------------------------------------------------------------- monthly tab bits ----
function renderMonthlyLockBar(month) {
  const text = document.getElementById('monthlyLockText');
  if (!text) return;
  const p = payrollPeriods[month];
  const locked = !!(p && p.locked);
  const lockBtn = document.getElementById('monthlyLockBtn');
  const unlockBtn = document.getElementById('monthlyUnlockBtn');
  const runBtn = document.getElementById('monthlyRunBtn');
  lockBtn.style.display = locked ? 'none' : '';
  unlockBtn.style.display = locked ? '' : 'none';
  document.getElementById('lockDaysWrap').style.display = locked ? 'none' : '';
  if (runBtn) runBtn.disabled = locked;

  if (pcMissing.payroll_periods) {
    text.innerHTML = '<span style="color:#b45309;">⚠️ មិនទាន់មានតារាង payroll_periods ក្នុង Supabase — សូមដំណើរការ payroll-close.sql ជាមុនសិន។</span>';
    return;
  }
  if (locked) {
    const dl = disputeDeadline(month);
    const emps = employees.filter(e => e.status === 'active');
    const acks = emps.filter(e => payrollDisputes.some(d => d.month === month && d.employee_id === e.id && d.kind === 'ack')).length;
    const pend = payrollDisputes.filter(d => d.month === month && d.kind === 'dispute' && d.status === 'pending').length;
    text.innerHTML = `🔒 <strong>ខែ ${month} ត្រូវបានបិទ</strong> (${pcFmtDT(p.locked_at)})<br>
      <span style="color:var(--text-muted);font-size:0.74rem;">រយៈពេលតវ៉ា៖ ${dl.expired ? 'ផុតកំណត់ហើយ' : 'ដល់ ' + pcFmtDT(dl.date)} · បុគ្គលិកបានពិនិត្យ Payslip ${acks}/${emps.length}${pend ? ` · <span style="color:#dc2626;">ពាក្យតវ៉ាមិនទាន់ដោះស្រាយ ${pend}</span>` : ''}</span>`;
  } else {
    text.innerHTML = `🔓 ខែ ${month} មិនទាន់បិទ — លេខអាចផ្លាស់ប្តូរ` +
      (p && p.unlocked_at ? `<br><span style="color:var(--text-muted);font-size:0.74rem;">បានបើកឡើងវិញ ${pcFmtDT(p.unlocked_at)} · មូលហេតុ៖ ${escapeHtml(p.unlock_reason || '-')}</span>` : '');
  }
}

function pcPayslipCell(empId, month) {
  if (!isMonthLocked(month)) return '<span style="color:var(--text-muted);">-</span>';
  const ds = payrollDisputes.filter(d => d.employee_id === empId && d.month === month);
  const ack = ds.some(d => d.kind === 'ack');
  const pend = ds.filter(d => d.kind === 'dispute' && d.status === 'pending').length;
  return (ack ? '<span style="color:#16a34a;">✓ បានពិនិត្យ</span>' : '<span style="color:var(--text-muted);">មិនទាន់ពិនិត្យ</span>') +
    (pend ? `<div style="color:#dc2626;font-size:0.7rem;">⚖️ តវ៉ា ${pend}</div>` : '');
}

// ---------------------------------------------------------------- adjustment ----
function nextUnlockedMonth(src) {
  let [y, m] = src.split('-').map(Number);
  for (let i = 0; i < 36; i++) {
    m++; if (m > 12) { m = 1; y++; }
    const k = `${y}-${String(m).padStart(2, '0')}`;
    if (!isMonthLocked(k)) return k;
  }
  return src;
}

function openAdjustModal(o) {
  o = o || {};
  const emp = employees.find(e => e.id === o.empId);
  if (!emp) return;
  const src = o.srcMonth || currentMonthlyMonth();
  document.getElementById('adjEmpId').value = emp.id;
  document.getElementById('adjDisputeId').value = o.disputeId || '';
  document.getElementById('adjEmpLabel').textContent = employeeLabel(emp);
  document.getElementById('adjSrcMonth').value = src;
  document.getElementById('adjTargetMonth').value = nextUnlockedMonth(src);
  document.getElementById('adjType').value = 'benefit';
  document.getElementById('adjAmount').value = '';
  document.getElementById('adjReason').value = o.reason || '';
  document.getElementById('adjOverlay').classList.add('open');
}
function closeAdjustModal() { document.getElementById('adjOverlay').classList.remove('open'); }

async function saveAdjustment() {
  const empId = document.getElementById('adjEmpId').value;
  const disputeId = document.getElementById('adjDisputeId').value;
  const src = document.getElementById('adjSrcMonth').value;
  const target = document.getElementById('adjTargetMonth').value;
  const type = document.getElementById('adjType').value;
  const amount = Math.round((parseFloat(document.getElementById('adjAmount').value) || 0) * 100) / 100;
  const reason = document.getElementById('adjReason').value.trim();
  if (!src || !target) { customAlert('សូមជ្រើសរើសខែ'); return; }
  if (!(amount > 0)) { customAlert('សូមបញ្ចូលទឹកប្រាក់ ($) ធំជាង 0'); return; }
  if (!reason) { customAlert('សូមបញ្ចូលមូលហេតុ'); return; }
  if (guardLocked(target, 'បញ្ចូលការកែតម្រូវក្នុងខែ')) return;

  const item = { id: 'adj_' + uid(), employeeId: empId, type, name: `កែតម្រូវខែ ${src}: ${reason}`, recurrence: 'variable', month: target, currency: 'USD', amount };
  const saved = await upsertPayrollItemRow(item);
  if (!saved) return; // upsertPayrollItemRow បានបង្ហាញកំហុសរួចហើយ
  payrollItems.push(item);
  logAudit('adjustment_add', { entity: 'payroll_item', ref: item.id, month: target, employeeId: empId, new: { name: item.name, type, currency: 'USD', amount }, note: `ពីខែ ${src}` });
  if (disputeId) await resolveDispute(disputeId, 'approved', reason, type === 'benefit' ? amount : -amount, true);
  closeAdjustModal();
  renderAll();
}

// ---------------------------------------------------------------- disputes (admin) ----
function pendingDisputeCount() {
  return payrollDisputes.filter(d => d.kind === 'dispute' && d.status === 'pending').length;
}

function renderDisputeSection() {
  const body = document.getElementById('disputeReqBody');
  if (!body) return;
  const empty = document.getElementById('disputeReqEmpty');
  const filter = document.getElementById('reqStatusFilter').value;
  const rows = payrollDisputes.filter(d => d.kind === 'dispute' && (!filter || d.status === filter));
  if (!rows.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = rows.map(d => `<tr>
    <td>${escapeHtml(empName(d.employee_id))}</td>
    <td>${escapeHtml(d.month)}</td>
    <td>${escapeHtml(d.work_date || '-')}</td>
    <td style="max-width:240px;white-space:normal;">${escapeHtml(d.reason || '-')}</td>
    <td><span class="badge ${d.status}">${REQUEST_STATUS_LABELS[d.status] || d.status}</span></td>
    <td>${d.status === 'pending' ? `<div class="row-actions">
        <button class="secondary" onclick="disputeOpenMonth('${d.id}')">📄 មើល Payslip</button>
        <button class="secondary" onclick="disputeApproveWithAdjust('${d.id}')">⚖️ អនុម័ត + កែតម្រូវ</button>
        <button class="secondary" onclick="disputeApproveNoAdjust('${d.id}')">✓ អនុម័ត (មិនកែ)</button>
        <button class="danger" onclick="disputeReject('${d.id}')">✕ បដិសេធ</button></div>`
      : `${d.adjustment_usd ? `<div>${d.adjustment_usd > 0 ? '+' : '−'}$${fmtUSD(Math.abs(d.adjustment_usd))}</div>` : ''}${escapeHtml(d.admin_note || '-')}`}</td>
  </tr>`).join('');
}

function disputeOpenMonth(id) {
  const d = payrollDisputes.find(x => x.id === id);
  if (!d) return;
  adminPrintPayslipMonth(d.employee_id, d.month);
}

function disputeApproveWithAdjust(id) {
  const d = payrollDisputes.find(x => x.id === id);
  if (d) openAdjustModal({ empId: d.employee_id, srcMonth: d.month, disputeId: d.id, reason: d.reason || '' });
}

async function disputeApproveNoAdjust(id) {
  const note = ((await customPrompt('កំណត់ចំណាំ (ឧ. "ត្រួតពិនិត្យហើយ ត្រឹមត្រូវ")៖')) || '').trim();
  await resolveDispute(id, 'approved', note || 'អនុម័ត — មិនមានការកែតម្រូវ', null);
}

async function disputeReject(id) {
  const note = ((await customPrompt('មូលហេតុបដិសេធ៖')) || '').trim();
  if (!note) { customAlert('សូមបញ្ចូលមូលហេតុបដិសេធ'); return; }
  await resolveDispute(id, 'rejected', note, null);
}

async function resolveDispute(id, status, note, adjustmentUSD, silent) {
  const d = payrollDisputes.find(x => x.id === id);
  if (!d) return;
  const patch = { status, admin_note: note || null, decided_at: new Date().toISOString(), adjustment_usd: adjustmentUSD === undefined ? null : adjustmentUSD };
  const { error } = await supabaseClient.from('payroll_disputes').update(patch).eq('id', id);
  if (error) { customAlert('រក្សាទុកមិនជោគជ័យ៖ ' + error.message); return; }
  Object.assign(d, patch);
  logAudit('dispute_' + status, { entity: 'dispute', ref: id, month: d.month, employeeId: d.employee_id, old: { reason: d.reason }, new: { status, adjustment_usd: patch.adjustment_usd }, note });
  if (!silent) { renderRequestsTab(); renderMonthlyTab(); }
}

// ---------------------------------------------------------------- Excel export ----
function exportMonthlyXLSX() {
  const month = currentMonthlyMonth();
  const rows = monthlyRows(month);
  if (!rows.length) { customAlert('មិនមានទិន្នន័យ'); return; }
  const rate = settings.exchangeRate || 0;
  const infoOf = (e, t) => t.info || { name: e.name, username: e.username || '', dept: e.dept || '', position: e.position || '', salary: parseFloat(e.salary) || 0 };
  const r2 = n => Math.round((n || 0) * 100) / 100;

  const summary = {
    name: 'ប្រាក់ខែ ' + month,
    columns: [
      { header: '#', width: 5, fmt: 'int' }, { header: 'អត្តលេខ', width: 12, fmt: 'text' }, { header: 'ឈ្មោះ', width: 26, fmt: 'text' },
      { header: 'ផ្នែក', width: 16, fmt: 'text' }, { header: 'តួនាទី', width: 18, fmt: 'text' }, { header: 'ប្រាក់ខែមូលដ្ឋាន ($)', width: 14, fmt: 'usd' },
      { header: 'ថ្ងៃធ្វើការ', width: 9, fmt: 'int' }, { header: 'ថ្ងៃច្បាប់', width: 9, fmt: 'int' }, { header: 'ថ្ងៃអវត្តមាន', width: 10, fmt: 'int' },
      { header: 'ថ្ងៃមកយឺត', width: 9, fmt: 'int' }, { header: 'ម៉ោង OT', width: 9, fmt: 'hours' },
      { header: 'តាមវត្តមាន ($)', width: 14, fmt: 'usd' }, { header: 'អត្ថប្រយោជន៍ ($)', width: 14, fmt: 'usd' }, { header: 'ប្រាក់កាត់ ($)', width: 14, fmt: 'usd' },
      { header: 'ប្រាក់ខែសុទ្ធ ($)', width: 15, fmt: 'usd' }, { header: 'ប្រាក់ខែសុទ្ធ (៛)', width: 16, fmt: 'riel' },
      { header: 'ក្នុងនោះ ប្រាក់ខែទី១ ដកហើយ ($)', width: 18, fmt: 'usd' },
    ],
    rows: rows.map(({ e, t }, i) => {
      const I = infoOf(e, t);
      const adv = (t.deductionItems || []).filter(p => String(p.id || '').startsWith('adv_')).reduce((s, p) => s + p.amount, 0);
      return [i + 1, I.username, I.name, I.dept, I.position, r2(I.salary), t.workDays, t.leaveDays, t.absentDays, t.lateDays, r2(t.otHours),
        r2(t.total), r2(t.benefitsUSD), r2(t.deductionsUSD), r2(t.net), Math.round(t.netRiel), r2(adv)];
    }),
    totals: { label: `សរុប (${rows.length} នាក់)`, labelCol: 2, sumCols: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
  };

  const detail = {
    name: 'លម្អិតវត្តមាន',
    columns: [
      { header: 'អត្តលេខ', width: 12, fmt: 'text' }, { header: 'ឈ្មោះ', width: 26, fmt: 'text' },
      { header: 'ម៉ោងធម្មតា', width: 11, fmt: 'hours' }, { header: 'ប្រាក់ធម្មតា ($)', width: 14, fmt: 'usd' },
      { header: 'ម៉ោង OT', width: 10, fmt: 'hours' }, { header: 'ប្រាក់ OT ($)', width: 13, fmt: 'usd' },
      { header: 'ប្រាក់បាយ (៛)', width: 14, fmt: 'riel' }, { header: 'ប្រាក់បាយ OT (៛)', width: 15, fmt: 'riel' },
      { header: 'ថ្ងៃអាទិត្យ/បុណ្យ', width: 14, fmt: 'int' }, { header: 'សរុបតាមវត្តមាន ($)', width: 16, fmt: 'usd' },
    ],
    rows: rows.map(({ e, t }) => {
      const I = infoOf(e, t);
      return [I.username, I.name, r2(t.normalHours), r2(t.normalPay), r2(t.otHours), r2(t.otPay), Math.round(t.foodRiel || 0), Math.round(t.foodOtRiel || 0), t.doubleDays || 0, r2(t.total)];
    }),
    totals: { label: 'សរុប', labelCol: 1, sumCols: [2, 3, 4, 5, 6, 7, 8, 9] },
  };

  const itemRows = [];
  rows.forEach(({ e, t }) => {
    const I = infoOf(e, t);
    const er = t.exchangeRate || rate;
    [['អត្ថប្រយោជន៍', t.benefitItems || []], ['ប្រាក់កាត់', t.deductionItems || []]].forEach(([label, list]) => {
      list.forEach(p => {
        const usd = p.currency === 'USD' ? p.amount : (er > 0 ? p.amount / er : 0);
        itemRows.push([I.username, I.name, label, p.name, r2(p.amount), p.currency === 'USD' ? '$' : '៛', r2(usd)]);
      });
    });
  });
  const items = {
    name: 'អត្ថប្រយោជន៍ & ប្រាក់កាត់',
    columns: [
      { header: 'អត្តលេខ', width: 12, fmt: 'text' }, { header: 'ឈ្មោះ', width: 26, fmt: 'text' }, { header: 'ប្រភេទ', width: 14, fmt: 'text' },
      { header: 'ឈ្មោះធាតុ', width: 44, fmt: 'text' }, { header: 'ចំនួនដើម', width: 12, fmt: 'num' }, { header: 'រូបិយប័ណ្ណ', width: 10, fmt: 'text' }, { header: 'ស្មើ ($)', width: 12, fmt: 'usd' },
    ],
    rows: itemRows,
  };

  downloadXlsx(`payroll_${month}${isMonthLocked(month) ? '_locked' : ''}.xlsx`, [summary, detail, items]);
}

// ---------------------------------------------------------------- init ----
function initPayrollClose() {
  const $ = id => document.getElementById(id);
  $('lockDisputeDays').value = loadLockDays();
  $('monthlyLockBtn').addEventListener('click', lockMonth);
  $('monthlyUnlockBtn').addEventListener('click', unlockMonth);
  $('monthlyXlsxBtn').addEventListener('click', exportMonthlyXLSX);
  $('monthlyAuditBtn').addEventListener('click', openAuditModal);
  $('auditCloseBtn').addEventListener('click', closeAuditModal);
  $('auditMonth').addEventListener('change', loadAudit);
  $('auditAll').addEventListener('change', loadAudit);
  $('adjSaveBtn').addEventListener('click', saveAdjustment);
  $('adjCancelBtn').addEventListener('click', closeAdjustModal);
}
