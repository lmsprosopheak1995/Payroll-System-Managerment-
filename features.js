/* ==========================================================================
   features.js — មុខងារថ្មី៖ Dashboard, Super Stars, Org Chart, Activities,
   KPI, Push Notifications, Feedback, Shift, Setting
   ចាំបាច់ត្រូវដំណើរការ features.sql ក្នុង Supabase សម្រាប់តារាងថ្មីៗ។
   (ឯកសារនេះត្រូវផ្ទុកមុន script.js — មុខងារទាំងអស់ត្រូវបានហៅតាមរយៈ hooks)
   ========================================================================== */

let kpiRows = [], feedbackRows = [], activityRows = [], announcementRows = [];
const featureErrors = {}; // table -> error message (មានន័យថាតារាងមិនទាន់មាន)
let kpiLive = null, actLive = null, annLive = null;

const FEATURE_TABLES = {
  shifts: 'វេនការងារ (Shift)',
  shift_assignments: 'ការចាត់តាំងវេន',
  kpi_records: 'KPI',
  activities: 'Activities',
  feedback: 'Feedback',
  announcements: 'Push Notifications',
};

const byId = id => document.getElementById(id);
function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function byCreatedDesc(a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }
function shortDate(iso) { return iso ? String(iso).slice(0, 10) : '-'; }
function activeEmployeesList() { return employees.filter(e => e.status === 'active'); }
function empById(id) { return employees.find(e => e.id === id); }
function empLabelById(id) { const e = empById(id); return e ? employeeLabel(e) : id; }

// ---------------------------------------------------------------- data ----
async function fetchTable(table) {
  const { data, error } = await supabaseClient.from(table).select('*');
  if (error) { featureErrors[table] = error.message; return []; }
  delete featureErrors[table];
  return data || [];
}

async function loadFeatureData() {
  const [sh, sa, kp, ac, fb, an] = await Promise.all(
    ['shifts', 'shift_assignments', 'kpi_records', 'activities', 'feedback', 'announcements'].map(fetchTable)
  );
  shifts = sh;
  shiftAssign = {};
  sa.forEach(r => { shiftAssign[r.employee_id] = r.shift_id; });
  kpiRows = kp;
  activityRows = ac;
  feedbackRows = fb.sort(byCreatedDesc);
  announcementRows = an.sort(byCreatedDesc);
}

async function dbUpsert(table, row, conflict) {
  const { error } = await supabaseClient.from(table).upsert(row, { onConflict: conflict || 'id' });
  if (error) {
    console.error(table, error);
    alert('រក្សាទុកមិនជោគជ័យ៖ ' + error.message + '\n(តើអ្នកបានដំណើរការ features.sql ក្នុង Supabase ហើយឬនៅ?)');
    return false;
  }
  return true;
}
async function dbDelete(table, column, value) {
  const { error } = await supabaseClient.from(table).delete().eq(column, value);
  if (error) { console.error(table, error); alert('លុបមិនជោគជ័យ៖ ' + error.message); return false; }
  return true;
}

function showTableWarn(elId, table) {
  const el = byId(elId);
  if (!el) return;
  if (featureErrors[table]) {
    el.style.display = 'block';
    el.textContent = `មិនទាន់មានតារាង "${table}" ក្នុង Supabase — សូមដំណើរការ features.sql ជាមុនសិន។`;
  } else {
    el.style.display = 'none';
  }
}

function fillEmployeeSelect(selId) {
  const sel = byId(selId);
  if (!sel) return;
  const cur = sel.value;
  const list = activeEmployeesList();
  sel.innerHTML = list.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(employeeLabel(e))}</option>`).join('');
  if (list.some(e => e.id === cur)) sel.value = cur;
  else if (list.length) sel.value = list[0].id;
}

// --------------------------------------------------------------- wiring ----
function initFeatures() {
  const month = todayStr().slice(0, 7);
  ['dashMonth', 'starMonth', 'actMonth', 'kpiMonth'].forEach(id => { byId(id).value = month; });
  byId('actDate').value = todayStr();

  kpiLive = setupLiveSearch('kpiSearch', 'kpiEmployeeSelect', renderKpi);
  actLive = setupLiveSearch('actEmpSearch', 'actEmployeeSelect', () => {});
  annLive = setupLiveSearch('annEmpSearch', 'annEmployeeSelect', () => {});

  byId('dashMonth').addEventListener('change', renderDashboard);
  byId('starMonth').addEventListener('change', renderStars);
  byId('orgSearch').addEventListener('input', renderOrgChart);
  byId('orgShowInactive').addEventListener('change', renderOrgChart);
  byId('actMonth').addEventListener('change', renderActivities);
  byId('actSearch').addEventListener('input', renderActivities);
  byId('actAddBtn').addEventListener('click', addActivity);
  byId('kpiMonth').addEventListener('change', renderKpi);
  byId('kpiAddBtn').addEventListener('click', addKpi);
  byId('kpiCopyBtn').addEventListener('click', copyKpiFromPrevMonth);
  byId('annTargetType').addEventListener('change', onAnnTargetChange);
  byId('annSendBtn').addEventListener('click', sendAnnouncement);
  byId('fbFilter').addEventListener('change', renderFeedback);
  byId('shiftSaveBtn').addEventListener('click', saveShift);
  byId('shiftCancelBtn').addEventListener('click', resetShiftForm);
  byId('shiftAssignSearch').addEventListener('input', renderShift);
  byId('settingEditBtn').addEventListener('click', openSettingsModal);
  byId('settingPwBtn').addEventListener('click', changeAdminPassword);
  byId('settingQrBtn').addEventListener('click', () => showTab('scan'));
}

function renderFeatures() {
  ['kpiEmployeeSelect', 'actEmployeeSelect', 'annEmployeeSelect'].forEach(fillEmployeeSelect);
  [kpiLive, actLive, annLive].forEach(l => l && l.sync());
  renderDashboard();
  renderStars();
  renderOrgChart();
  renderActivities();
  renderKpi();
  renderAnnouncements();
  renderFeedback();
  renderShift();
  renderSetting();
}

function onFeatureTab(tab) {
  const map = {
    dashboard: renderDashboard, superstars: renderStars, orgchart: renderOrgChart,
    activities: renderActivities, kpi: renderKpi, notify: renderAnnouncements,
    feedback: renderFeedback, shift: renderShift, setting: renderSetting,
  };
  if (map[tab]) map[tab]();
}

// ------------------------------------------------------------ Dashboard ----
function statCard(num, label, color) {
  return `<div class="stat-card"><div class="num"${color ? ` style="color:${color}"` : ''}>${num}</div><div class="label">${label}</div></div>`;
}

function renderDashboard() {
  const monthEl = byId('dashMonth');
  if (!monthEl) return;
  const month = monthEl.value || todayStr().slice(0, 7);
  const today = todayStr();
  byId('dashToday').textContent = `${today} · ${weekdayLabel(today)}`;

  const active = activeEmployeesList();
  let present = 0, leave = 0, late = 0, absent = 0, notYet = 0;
  active.forEach(e => {
    const rec = attendance[today] && attendance[today][e.id];
    if (!rec || !rec.status) { notYet++; return; }
    if (rec.status === 'present') {
      present++;
      const m = timeToMinutes(rec.checkin);
      if (m !== null && m > lateStartMinutes(getEmpShift(e.id))) late++;
    } else if (rec.status === 'leave') leave++;
    else if (rec.status === 'absent') absent++;
  });
  byId('dashTodayStats').innerHTML =
    statCard(active.length, 'បុគ្គលិកកំពុងបម្រើការ') +
    statCard(present, 'មកធ្វើការ', 'var(--success)') +
    statCard(late, 'មកយឺត', '#d97706') +
    statCard(leave, 'សុំច្បាប់', '#d97706') +
    statCard(absent, 'អវត្តមាន', 'var(--danger)') +
    statCard(notYet, 'មិនទាន់កត់ត្រា', 'var(--text-muted)');

  const dates = daysInMonth(month);
  let payroll = 0, otHours = 0, lateDays = 0, leaveDays = 0, absentDays = 0, workDays = 0;
  active.forEach(e => {
    dates.forEach(d => {
      const rec = (attendance[d] && attendance[d][e.id]) || {};
      const r = computeRow(e, rec, d);
      payroll += r.total; otHours += r.otHours;
      if (r.late) lateDays++;
      if (r.status === 'leave') leaveDays++;
      if (r.status === 'absent') absentDays++;
      if (r.status === 'present') workDays++;
    });
    payroll += getPayrollAdjustmentUSD(e.id, month).net;
  });
  byId('dashMonthStats').innerHTML =
    statCard('$' + fmtUSD(payroll), 'ប្រាក់ខែសុទ្ធសរុប (ប៉ាន់ស្មាន)') +
    statCard(workDays, 'ថ្ងៃធ្វើការសរុប') +
    statCard(fmtHours(otHours), 'ម៉ោងថែមសរុប') +
    statCard(lateDays, 'ថ្ងៃមកយឺត', '#d97706') +
    statCard(leaveDays, 'ថ្ងៃច្បាប់', '#d97706') +
    statCard(absentDays, 'ថ្ងៃអវត្តមាន', 'var(--danger)');

  // 7-day attendance bars
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(fmtLocalDate(d)); }
  const counts = days.map(d => active.filter(e => attendance[d] && attendance[d][e.id] && attendance[d][e.id].status === 'present').length);
  const max = Math.max(1, active.length);
  byId('dashChart').innerHTML = days.map((d, i) =>
    `<div class="bar-col" title="${d}"><div class="bar-val">${counts[i]}</div><div class="bar" style="height:${Math.round(counts[i] / max * 100)}%"></div><div class="bar-lbl">${d.slice(8)}<br><small>${weekdayLabel(d)}</small></div></div>`
  ).join('');

  // by department
  const groups = {};
  active.forEach(e => {
    const k = e.dept || '(មិនមានផ្នែក)';
    groups[k] = groups[k] || { n: 0, salary: 0 };
    groups[k].n++; groups[k].salary += parseFloat(e.salary) || 0;
  });
  byId('dashDeptBody').innerHTML = Object.keys(groups).sort().map(k =>
    `<tr><td>${escapeHtml(k)}</td><td>${groups[k].n}</td><td>$${fmtUSD(groups[k].salary)}</td></tr>`).join('')
    || '<tr><td colspan="3">-</td></tr>';

  const pendLeave = leaveRequests.filter(r => r.status === 'pending').length;
  const pendOT = overtimeRequests.filter(r => r.status === 'pending').length;
  const newFb = feedbackRows.filter(r => r.status === 'new').length;
  byId('dashAlerts').innerHTML = `
    <h3 class="sec-title" style="margin-top:0;">🔔 ត្រូវធ្វើ</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="secondary" onclick="showTab('requests')">📝 សំណើច្បាប់ / ថែមម៉ោងរង់ចាំ: <strong>${pendLeave + pendOT}</strong></button>
      <button class="secondary" onclick="showTab('feedback')">💬 Feedback ថ្មី: <strong>${newFb}</strong></button>
      <button class="secondary" onclick="showTab('deduct')">⏰ យឺត/ច្បាប់ ក្នុងខែ: <strong>${lateDays + leaveDays}</strong></button>
    </div>`;
}

// ---------------------------------------------------------- Super Stars ----
function kpiForEmp(empId, month) { return kpiRows.filter(r => r.employee_id === empId && r.month === month); }

function kpiScoreFor(empId, month) {
  const rows = kpiForEmp(empId, month);
  const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  if (!rows.length || totalWeight <= 0) return { score: null, totalWeight, count: rows.length };
  const sum = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0) * (parseFloat(r.score) || 0), 0);
  return { score: Math.round(sum / totalWeight * 10) / 10, totalWeight, count: rows.length };
}

function kpiGrade(score) {
  if (score === null || score === undefined) return '-';
  if (score >= 90) return 'A · ឆ្នើម';
  if (score >= 80) return 'B · ល្អ';
  if (score >= 70) return 'C · មធ្យម';
  if (score >= 60) return 'D · ខ្សោយ';
  return 'E · ត្រូវកែលម្អ';
}

function starData(month) {
  const dates = daysInMonth(month);
  return activeEmployeesList().map(e => {
    let present = 0, late = 0, absent = 0;
    const sh = getEmpShift(e.id);
    dates.forEach(d => {
      const rec = attendance[d] && attendance[d][e.id];
      if (!rec) return;
      if (rec.status === 'present') {
        present++;
        const m = timeToMinutes(rec.checkin);
        if (m !== null && m > lateStartMinutes(sh)) late++;
      } else if (rec.status === 'absent') absent++;
    });
    const att = Math.max(0, 100 - late * 5 - absent * 10);
    const k = kpiScoreFor(e.id, month);
    const final = k.score === null ? att : Math.round((0.6 * k.score + 0.4 * att) * 10) / 10;
    return { e, present, late, absent, att, kpi: k.score, final };
  }).filter(x => x.present > 0)
    .sort((a, b) => b.final - a.final || a.late - b.late || b.present - a.present);
}

function renderStars() {
  const monthEl = byId('starMonth');
  if (!monthEl) return;
  const month = monthEl.value || todayStr().slice(0, 7);
  const data = starData(month);
  byId('starEmpty').style.display = data.length ? 'none' : 'block';

  const medals = ['🥇', '🥈', '🥉'];
  const top = data.slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i); // 2nd, 1st, 3rd
  byId('starPodium').innerHTML = top.length ? order.map(i => {
    const x = top[i];
    return `<div class="podium-item rank${i + 1}">
      <div class="podium-medal">${medals[i]}</div>
      <div class="podium-avatar">${escapeHtml((x.e.name || '?').charAt(0).toUpperCase())}</div>
      <div class="podium-name">${escapeHtml(x.e.name)}</div>
      <div class="podium-score">⭐ ${x.final}</div>
    </div>`;
  }).join('') : '';

  byId('starBody').innerHTML = data.map((x, i) => `<tr>
    <td>${i < 3 ? medals[i] : i + 1}</td>
    <td>${escapeHtml(x.e.username || '-')}</td>
    <td>${escapeHtml(x.e.name)}</td>
    <td>${x.present}</td><td>${x.late || '-'}</td><td>${x.absent || '-'}</td>
    <td>${x.att}</td><td>${x.kpi === null ? '-' : x.kpi}</td>
    <td><strong>${x.final}</strong></td></tr>`).join('');
}

// ------------------------------------------------------------- Org Chart ---
function renderOrgChart() {
  const box = byId('orgChart');
  if (!box) return;
  const q = byId('orgSearch').value.toLowerCase().trim();
  const showInactive = byId('orgShowInactive').checked;
  const list = employees.filter(e =>
    (showInactive || e.status === 'active') &&
    (!q || [e.name, e.username, e.position, e.dept].some(v => (v || '').toLowerCase().includes(q))));

  const groups = {};
  list.forEach(e => { const k = e.dept || '(មិនមានផ្នែក)'; (groups[k] = groups[k] || []).push(e); });
  const names = Object.keys(groups).sort();

  if (!list.length) { box.innerHTML = '<div class="empty-state">រកមិនឃើញបុគ្គលិកទេ</div>'; return; }
  box.innerHTML = `
    <div class="org-root"><div class="org-root-card">🏢 ក្រុមហ៊ុន<br><small>${list.length} នាក់ · ${names.length} ផ្នែក</small></div></div>
    <div class="org-line"></div>
    <div class="org-depts">
      ${names.map(k => `
        <div class="org-dept">
          <div class="org-dept-head">📁 ${escapeHtml(k)} <span class="badge active">${groups[k].length}</span></div>
          ${groups[k].sort((a, b) => (a.position || '').localeCompare(b.position || '') || (a.name || '').localeCompare(b.name || '')).map(e => `
            <div class="org-member${e.status !== 'active' ? ' inactive' : ''}">
              <div class="org-avatar">${escapeHtml((e.name || '?').charAt(0).toUpperCase())}</div>
              <div class="org-info"><div class="org-name">${escapeHtml(e.name)}</div>
              <div class="org-pos">${escapeHtml(e.position || '-')}${e.username ? ' · ' + escapeHtml(e.username) : ''}</div></div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
}

// ------------------------------------------------------------ Activities ---
function renderActivities() {
  const body = byId('actBody');
  if (!body) return;
  showTableWarn('actWarn', 'activities');
  const month = byId('actMonth').value || todayStr().slice(0, 7);
  const q = byId('actSearch').value;
  const rows = activityRows
    .filter(r => (r.date || '').startsWith(month))
    .filter(r => { const e = empById(r.employee_id); return e ? employeeMatchesSearch(e, q) : !q; })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || byCreatedDesc(a, b));
  byId('actEmpty').style.display = rows.length ? 'none' : 'block';
  body.innerHTML = rows.map(r => {
    const e = empById(r.employee_id);
    return `<tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(e ? (e.username || '-') : '-')}</td>
      <td>${escapeHtml(e ? e.name : r.employee_id)}</td>
      <td style="white-space:normal;">${escapeHtml(r.title)}</td>
      <td style="white-space:normal;max-width:280px;">${escapeHtml(r.note || '')}</td>
      <td><button class="danger" onclick="deleteActivity('${escapeHtml(r.id)}')">🗑</button></td></tr>`;
  }).join('');
}

async function addActivity() {
  const empId = byId('actEmployeeSelect').value;
  const date = byId('actDate').value;
  const title = byId('actTitle').value.trim();
  const note = byId('actNote').value.trim();
  if (!empId || !date || !title) { alert('សូមជ្រើសរើសបុគ្គលិក ថ្ងៃ និងបំពេញចំណងជើង'); return; }
  const row = { id: uid(), employee_id: empId, date, title, note, created_at: new Date().toISOString() };
  if (!(await dbUpsert('activities', row))) return;
  activityRows.push(row);
  byId('actTitle').value = ''; byId('actNote').value = '';
  renderActivities();
}

async function deleteActivity(id) {
  if (!confirm('លុបសកម្មភាពនេះ?')) return;
  if (!(await dbDelete('activities', 'id', id))) return;
  activityRows = activityRows.filter(r => r.id !== id);
  renderActivities();
}

// ------------------------------------------------------------------- KPI ---
function currentKpiEmp() { return byId('kpiEmployeeSelect').value; }
function currentKpiMonth() { return byId('kpiMonth').value || todayStr().slice(0, 7); }

function renderKpi() {
  const body = byId('kpiBody');
  if (!body) return;
  showTableWarn('kpiWarn', 'kpi_records');
  const empId = currentKpiEmp(), month = currentKpiMonth();
  const rows = kpiForEmp(empId, month);
  const k = kpiScoreFor(empId, month);
  const e = empById(empId);
  const wOk = Math.round(k.totalWeight) === 100;
  byId('kpiSummary').innerHTML =
    statCard(escapeHtml(e ? e.name : '-'), 'បុគ្គលិក') +
    statCard(k.totalWeight + '%', 'ទម្ងន់សរុប' + (rows.length && !wOk ? ' (គួរស្មើ 100%)' : ''), rows.length && !wOk ? '#d97706' : '') +
    statCard(k.score === null ? '-' : k.score, 'ពិន្ទុ KPI (ទម្ងន់)') +
    statCard(kpiGrade(k.score), 'ថ្នាក់');
  byId('kpiEmpty').style.display = rows.length ? 'none' : 'block';
  body.innerHTML = rows.map(r => `<tr>
    <td><input type="text" value="${escapeHtml(r.name)}" onchange="updateKpi('${escapeHtml(r.id)}','name',this.value)" style="width:100%;min-width:160px;text-align:left;"></td>
    <td><input type="number" min="0" max="100" value="${parseFloat(r.weight) || 0}" onchange="updateKpi('${escapeHtml(r.id)}','weight',this.value)" style="width:90px;"></td>
    <td><input type="number" min="0" max="100" value="${parseFloat(r.score) || 0}" onchange="updateKpi('${escapeHtml(r.id)}','score',this.value)" style="width:90px;"></td>
    <td><button class="danger" onclick="deleteKpi('${escapeHtml(r.id)}')">🗑</button></td></tr>`).join('');

  byId('kpiAllBody').innerHTML = activeEmployeesList().map(x => {
    const s = kpiScoreFor(x.id, month);
    return `<tr style="cursor:pointer;" onclick="pickKpiEmployee('${escapeHtml(x.id)}')">
      <td>${escapeHtml(x.username || '-')}</td><td>${escapeHtml(x.name)}</td><td>${s.count || '-'}</td>
      <td>${s.count ? s.totalWeight + '%' : '-'}</td><td>${s.score === null ? '-' : s.score}</td><td>${kpiGrade(s.score)}</td></tr>`;
  }).join('');
}

function pickKpiEmployee(id) {
  byId('kpiEmployeeSelect').value = id;
  if (kpiLive) kpiLive.sync();
  renderKpi();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clamp100(v) { const n = parseFloat(v); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); }

async function addKpi() {
  const empId = currentKpiEmp(), month = currentKpiMonth();
  const name = byId('kpiName').value.trim();
  if (!empId) { alert('សូមជ្រើសរើសបុគ្គលិកជាមុនសិន'); return; }
  if (!name) { alert('សូមបញ្ចូលឈ្មោះសូចនាករ'); return; }
  const row = { id: uid(), employee_id: empId, month, name, weight: clamp100(byId('kpiWeight').value), score: clamp100(byId('kpiScore').value), created_at: new Date().toISOString() };
  if (!(await dbUpsert('kpi_records', row))) return;
  kpiRows.push(row);
  byId('kpiName').value = ''; byId('kpiWeight').value = ''; byId('kpiScore').value = '';
  renderKpi(); renderStars(); renderDashboard();
}

async function updateKpi(id, field, value) {
  const row = kpiRows.find(r => r.id === id);
  if (!row) return;
  const next = { ...row, [field]: field === 'name' ? String(value).trim() : clamp100(value) };
  if (field === 'name' && !next.name) { renderKpi(); return; }
  if (!(await dbUpsert('kpi_records', next))) { renderKpi(); return; }
  Object.assign(row, next);
  renderKpi(); renderStars();
}

async function deleteKpi(id) {
  if (!confirm('លុប KPI នេះ?')) return;
  if (!(await dbDelete('kpi_records', 'id', id))) return;
  kpiRows = kpiRows.filter(r => r.id !== id);
  renderKpi(); renderStars();
}

async function copyKpiFromPrevMonth() {
  const empId = currentKpiEmp(), month = currentKpiMonth();
  if (!empId) return;
  const [y, m] = month.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const prevMonth = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
  const existing = new Set(kpiForEmp(empId, month).map(r => r.name));
  const src = kpiForEmp(empId, prevMonth).filter(r => !existing.has(r.name));
  if (!src.length) { alert('មិនមាន KPI ពីខែមុន (' + prevMonth + ') ដើម្បីចម្លងទេ'); return; }
  for (const r of src) {
    const row = { id: uid(), employee_id: empId, month, name: r.name, weight: r.weight, score: 0, created_at: new Date().toISOString() };
    if (!(await dbUpsert('kpi_records', row))) break;
    kpiRows.push(row);
  }
  renderKpi(); renderStars();
}

// ---------------------------------------------- Push Notifications (admin) --
function onAnnTargetChange() {
  const t = byId('annTargetType').value;
  byId('annDeptWrap').style.display = t === 'dept' ? '' : 'none';
  byId('annEmpWrap').style.display = t === 'employee' ? '' : 'none';
}

function annTargetLabel(r) {
  if (r.target_type === 'dept') return 'ផ្នែក: ' + (r.target_value || '-');
  if (r.target_type === 'employee') return 'បុគ្គលិក: ' + empLabelById(r.target_value);
  return 'បុគ្គលិកទាំងអស់';
}

function renderAnnouncements() {
  const body = byId('annList');
  if (!body) return;
  showTableWarn('annWarn', 'announcements');
  const sel = byId('annDeptSelect');
  const cur = sel.value;
  const depts = [...new Set(employees.map(e => e.dept).filter(Boolean))].sort();
  sel.innerHTML = depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  if (depts.includes(cur)) sel.value = cur;
  onAnnTargetChange();
  byId('annEmpty').style.display = announcementRows.length ? 'none' : 'block';
  body.innerHTML = announcementRows.map(r => `<tr>
    <td>${shortDate(r.created_at)}</td>
    <td style="white-space:normal;"><strong>${escapeHtml(r.title)}</strong></td>
    <td style="white-space:normal;max-width:320px;">${escapeHtml(r.body || '')}</td>
    <td>${escapeHtml(annTargetLabel(r))}</td>
    <td><button class="danger" onclick="deleteAnnouncement('${escapeHtml(r.id)}')">🗑</button></td></tr>`).join('');
}

async function sendAnnouncement() {
  const title = byId('annTitle').value.trim();
  const text = byId('annText').value.trim();
  const type = byId('annTargetType').value;
  if (!title) { alert('សូមបញ្ចូលចំណងជើង'); return; }
  let value = null;
  if (type === 'dept') value = byId('annDeptSelect').value;
  if (type === 'employee') value = byId('annEmployeeSelect').value;
  if (type !== 'all' && !value) { alert('សូមជ្រើសរើសអ្នកទទួល'); return; }
  const row = { id: uid(), title, body: text, target_type: type, target_value: value, created_at: new Date().toISOString() };
  if (!(await dbUpsert('announcements', row))) return;
  announcementRows.unshift(row);
  byId('annTitle').value = ''; byId('annText').value = '';
  renderAnnouncements();
  alert('✓ បានផ្ញើប្រកាសជូនបុគ្គលិករួចរាល់');
}

async function deleteAnnouncement(id) {
  if (!confirm('លុបប្រកាសនេះ?')) return;
  if (!(await dbDelete('announcements', 'id', id))) return;
  announcementRows = announcementRows.filter(r => r.id !== id);
  renderAnnouncements();
}

// -------------------------------------------------------------- Feedback ---
const FB_STATUS_LABELS = { new: 'ថ្មី', replied: 'បានឆ្លើយតប' };

function renderFeedback() {
  const list = byId('fbList');
  if (!list) return;
  showTableWarn('fbWarn', 'feedback');
  const newCount = feedbackRows.filter(r => r.status === 'new').length;
  byId('fbNewBadge').innerHTML = newCount ? `<span class="badge inactive">${newCount}</span>` : '';
  const filter = byId('fbFilter').value;
  const rows = feedbackRows.filter(r => !filter || r.status === filter);
  byId('fbEmpty').style.display = rows.length ? 'none' : 'block';
  list.innerHTML = rows.map(r => {
    const e = empById(r.employee_id);
    const id = escapeHtml(r.id);
    return `<div class="scan-result-card fb-card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">
        <div><strong>${escapeHtml(e ? e.name : r.employee_id)}</strong> <span class="fb-meta">${escapeHtml(e && e.username ? e.username : '')} · ${escapeHtml(r.category || 'ផ្សេងៗ')} · ${shortDate(r.created_at)}</span></div>
        <span class="badge ${r.status === 'replied' ? 'approved' : 'pending'}">${FB_STATUS_LABELS[r.status] || r.status}</span>
      </div>
      <p class="fb-msg">${escapeHtml(r.message)}</p>
      <textarea id="fbReply_${id}" rows="2" placeholder="សរសេរការឆ្លើយតប...">${escapeHtml(r.admin_reply || '')}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
        <button onclick="replyFeedback('${id}')">💬 ឆ្លើយតប</button>
        <button class="danger" onclick="deleteFeedback('${id}')">🗑 លុប</button>
      </div></div>`;
  }).join('');
}

async function replyFeedback(id) {
  const row = feedbackRows.find(r => r.id === id);
  const ta = byId('fbReply_' + id);
  if (!row || !ta) return;
  const reply = ta.value.trim();
  const next = { ...row, admin_reply: reply, status: reply ? 'replied' : 'new' };
  if (!(await dbUpsert('feedback', next))) return;
  Object.assign(row, next);
  renderFeedback(); renderDashboard();
}

async function deleteFeedback(id) {
  if (!confirm('លុបមតិកែលម្អនេះ?')) return;
  if (!(await dbDelete('feedback', 'id', id))) return;
  feedbackRows = feedbackRows.filter(r => r.id !== id);
  renderFeedback(); renderDashboard();
}

// ----------------------------------------------------------------- Shift ---
function fmtMin(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function renderShift() {
  const body = byId('shiftBody');
  if (!body) return;
  showTableWarn('shiftWarn', 'shifts');
  const active = activeEmployeesList();
  const countFor = id => active.filter(e => getEmpShift(e.id).id === id).length;
  const rowHtml = (sh, editable) => `<tr>
    <td style="text-align:left;">${escapeHtml(sh.name)}${editable ? '' : ' <span class="badge active">លំនាំដើម</span>'}</td>
    <td>${fmtMin(sh.start)}</td><td>${fmtMin(sh.breakOut)}</td><td>${fmtMin(sh.breakIn)}</td><td>${fmtMin(sh.end)}</td>
    <td>${fmtHours(shiftTotalMinutes(sh) / 60)} ម៉ោង</td><td>${countFor(sh.id)}</td>
    <td>${editable ? `<div class="row-actions" style="justify-content:center;"><button class="secondary" onclick="editShift('${escapeHtml(sh.id)}')">✏️</button><button class="danger" onclick="deleteShift('${escapeHtml(sh.id)}')">🗑</button></div>` : '-'}</td></tr>`;
  body.innerHTML = rowHtml(DEFAULT_SHIFT, false) + shifts.map(r => {
    const sh = shiftFromRow(r);
    return (sh.start === null) ? '' : rowHtml(sh, true);
  }).join('');

  const q = byId('shiftAssignSearch').value;
  byId('shiftAssignBody').innerHTML = active.filter(e => employeeMatchesSearch(e, q)).map(e => {
    const cur = getEmpShift(e.id).id;
    const opts = [`<option value="default"${cur === 'default' ? ' selected' : ''}>${escapeHtml(DEFAULT_SHIFT.name)} (លំនាំដើម)</option>`]
      .concat(shifts.map(r => `<option value="${escapeHtml(r.id)}"${cur === r.id ? ' selected' : ''}>${escapeHtml(r.name)} (${escapeHtml(r.start_time)}–${escapeHtml(r.end_time)})</option>`)).join('');
    return `<tr><td>${escapeHtml(e.username || '-')}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.dept || '-')}</td>
      <td><select onchange="assignShift('${escapeHtml(e.id)}', this.value)">${opts}</select></td></tr>`;
  }).join('');
}

function resetShiftForm() {
  byId('shiftEditId').value = '';
  byId('shiftName').value = '';
  byId('shiftStart').value = '07:00'; byId('shiftBreakOut').value = '11:00';
  byId('shiftBreakIn').value = '12:00'; byId('shiftEnd').value = '16:00';
  byId('shiftSaveBtn').textContent = '💾 រក្សាទុកវេន';
  byId('shiftCancelBtn').style.display = 'none';
}

function editShift(id) {
  const r = shifts.find(x => x.id === id);
  if (!r) return;
  byId('shiftEditId').value = r.id;
  byId('shiftName').value = r.name;
  byId('shiftStart').value = r.start_time; byId('shiftBreakOut').value = r.break_out;
  byId('shiftBreakIn').value = r.break_in; byId('shiftEnd').value = r.end_time;
  byId('shiftSaveBtn').textContent = '💾 រក្សាទុកការកែប្រែ';
  byId('shiftCancelBtn').style.display = '';
  byId('shiftName').focus();
}

async function saveShift() {
  const name = byId('shiftName').value.trim();
  const start = byId('shiftStart').value, bo = byId('shiftBreakOut').value;
  const bi = byId('shiftBreakIn').value, end = byId('shiftEnd').value;
  if (!name || !start || !bo || !bi || !end) { alert('សូមបំពេញឈ្មោះវេន និងម៉ោងទាំង ៤'); return; }
  const t = [start, bo, bi, end].map(timeToMinutes);
  if (!(t[0] < t[1] && t[1] <= t[2] && t[2] < t[3])) { alert('លំដាប់ម៉ោងមិនត្រឹមត្រូវ៖ ចូល < ចេញបាយ ≤ ចូលវិញ < ចេញ (វេនឆ្លងអធ្រាត្រមិនទាន់គាំទ្រ)'); return; }
  const id = byId('shiftEditId').value || uid();
  const row = { id, name, start_time: start, break_out: bo, break_in: bi, end_time: end };
  if (!(await dbUpsert('shifts', row))) return;
  const idx = shifts.findIndex(x => x.id === id);
  if (idx >= 0) shifts[idx] = { ...shifts[idx], ...row }; else shifts.push(row);
  resetShiftForm();
  renderAll();
}

async function deleteShift(id) {
  const r = shifts.find(x => x.id === id);
  if (!r || !confirm(`លុបវេន "${r.name}"? បុគ្គលិកដែលប្រើវេននេះនឹងត្រឡប់ទៅវេនលំនាំដើម។`)) return;
  if (!(await dbDelete('shift_assignments', 'shift_id', id))) return;
  if (!(await dbDelete('shifts', 'id', id))) return;
  shifts = shifts.filter(x => x.id !== id);
  Object.keys(shiftAssign).forEach(k => { if (shiftAssign[k] === id) delete shiftAssign[k]; });
  renderAll();
}

async function assignShift(empId, shiftId) {
  if (shiftId === 'default') {
    if (!(await dbDelete('shift_assignments', 'employee_id', empId))) { renderShift(); return; }
    delete shiftAssign[empId];
  } else {
    if (!(await dbUpsert('shift_assignments', { employee_id: empId, shift_id: shiftId }, 'employee_id'))) { renderShift(); return; }
    shiftAssign[empId] = shiftId;
  }
  renderAll();
}

// --------------------------------------------------------------- Setting ---
function renderSetting() {
  const box = byId('settingSummary');
  if (!box) return;
  const items = [
    ['ម៉ោងចូលស្តង់ដារ', settings.standardStart],
    ['ម៉ោងធ្វើការ/ថ្ងៃ (គិតអត្រាម៉ោង)', settings.standardHours + ' ម៉ោង'],
    ['មេគុណ OT', '×' + settings.otMultiplier],
    ['អាទិត្យ / ថ្ងៃបុណ្យ', '×' + HOLIDAY_MULTIPLIER],
    ['ប្រាក់បាយថ្ងៃ', fmtRiel(settings.foodDaily) + ' ៛'],
    ['ប្រាក់បាយ OT (រៀងរាល់ 2 ម៉ោង)', fmtRiel(settings.foodOT) + ' ៛'],
    ['ថ្ងៃធ្វើការ/ខែ', settings.workDaysPerMonth],
    ['អត្រាប្តូរប្រាក់', '$1 = ' + fmtRiel(settings.exchangeRate) + ' ៛'],
  ];
  box.innerHTML = items.map(([l, v]) => `<div class="setting-item"><div class="lbl">${escapeHtml(l)}</div><div class="val">${escapeHtml(String(v))}</div></div>`).join('');

  const st = Object.keys(FEATURE_TABLES).map(t => [FEATURE_TABLES[t] + ` (${t})`, !featureErrors[t]]);
  st.push(['ថ្ងៃបុណ្យ (holidays)', holidaysAvailable]);
  byId('tableStatus').innerHTML = st.map(([l, ok]) =>
    `<div class="setting-item"><div class="lbl">${escapeHtml(l)}</div><div class="val" style="color:${ok ? 'var(--success)' : 'var(--danger)'}">${ok ? '✓ ដំណើរការ' : '✕ មិនទាន់មាន'}</div></div>`).join('');
}
