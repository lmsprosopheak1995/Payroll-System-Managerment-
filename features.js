/* ==========================================================================
   features.js — មុខងារថ្មី៖ Dashboard, Push Notifications, Feedback, Shift, Setting
   ចាំបាច់ត្រូវដំណើរការ features.sql ក្នុង Supabase សម្រាប់តារាងថ្មីៗ។
   (ឯកសារនេះត្រូវផ្ទុកមុន script.js — មុខងារទាំងអស់ត្រូវបានហៅតាមរយៈ hooks)
   ========================================================================== */

let feedbackRows = [], announcementRows = [];
const featureErrors = {}; // table -> error message (មានន័យថាតារាងមិនទាន់មាន)
let annLive = null;

const FEATURE_TABLES = {
  shifts: 'វេនការងារ (Shift)',
  shift_assignments: 'ការចាត់តាំងវេន',
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
  const [sh, sa, fb, an] = await Promise.all(
    ['shifts', 'shift_assignments', 'feedback', 'announcements'].map(fetchTable)
  );
  shifts = sh;
  shiftAssign = {};
  sa.forEach(r => { shiftAssign[r.employee_id] = r.shift_id; });
  feedbackRows = fb.sort(byCreatedDesc);
  announcementRows = an.sort(byCreatedDesc);
}

async function dbUpsert(table, row, conflict) {
  const { error } = await supabaseClient.from(table).upsert(row, { onConflict: conflict || 'id' });
  if (error) {
    console.error(table, error);
    customAlert('រក្សាទុកមិនជោគជ័យ៖ ' + error.message + '\n(តើអ្នកបានដំណើរការ features.sql ក្នុង Supabase ហើយឬនៅ?)');
    return false;
  }
  return true;
}
async function dbDelete(table, column, value) {
  const { error } = await supabaseClient.from(table).delete().eq(column, value);
  if (error) { console.error(table, error); customAlert('លុបមិនជោគជ័យ៖ ' + error.message); return false; }
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
  byId('dashMonth').value = month;

  annLive = setupLiveSearch('annEmpSearch', 'annEmployeeSelect', () => {});

  byId('dashMonth').addEventListener('change', renderDashboard);
  byId('dashSearchInput').addEventListener('input', renderDashSearch);
  byId('annTargetType').addEventListener('change', onAnnTargetChange);
  byId('annSendBtn').addEventListener('click', sendAnnouncement);
  byId('annImage').addEventListener('change', e => handleAnnImage(e.target.files[0]));
  byId('fbFilter').addEventListener('change', renderFeedback);
  byId('shiftSaveBtn').addEventListener('click', saveShift);
  byId('shiftCancelBtn').addEventListener('click', resetShiftForm);
  byId('shiftAssignSearch').addEventListener('input', renderShift);
  byId('settingEditBtn').addEventListener('click', openSettingsModal);
  byId('settingPwBtn').addEventListener('click', changeAdminPassword);
  byId('settingQrBtn').addEventListener('click', () => showTab('scan'));
  if (typeof initPrint === 'function') initPrint();
  if (typeof initAI === 'function') initAI();
  byId('attendanceHolidayBtn').addEventListener('click', () => {
    showTab('setting');
    const box = byId('holidayBox');
    box.open = true;
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  });
}

function renderFeatures() {
  fillEmployeeSelect('annEmployeeSelect');
  if (annLive) annLive.sync();
  renderDashboard();
  renderAnnouncements();
  renderFeedback();
  renderShift();
  renderSetting();
}

function onFeatureTab(tab) {
  const map = {
    dashboard: renderDashboard, notify: renderAnnouncements,
    feedback: renderFeedback, shift: renderShift, setting: renderSetting,
    ai: (typeof renderAITab === 'function' ? renderAITab : null),
  };
  if (map[tab]) map[tab]();
}

// ------------------------------------------------------------ Dashboard ----
function statCard(num, label, color, clickKey) {
  const clickAttr = clickKey ? ` onclick="toggleDashDetail('${clickKey}')" style="cursor:pointer;"` : '';
  return `<div class="stat-card"${clickAttr}><div class="num"${color ? ` style="color:${color}"` : ''}>${num}</div><div class="label">${label}</div></div>`;
}

const DASH_DETAIL_LABELS = {
  present: 'មកធ្វើការ', late: 'ស្កេនយឺត', leave: 'សុំច្បាប់',
  absent: 'អ្នកមិនមកធ្វើការ', notyet: 'មិនស្កេន',
};
let dashLists = {};
let dashDetailOpen = null;

function toggleDashDetail(key) {
  dashDetailOpen = dashDetailOpen === key ? null : key;
  renderDashDetailPanel();
}

function renderDashDetailPanel() {
  const box = byId('dashDetailList');
  if (!box) return;
  if (!dashDetailOpen) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const list = dashLists[dashDetailOpen] || [];
  box.style.display = '';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong>${escapeHtml(DASH_DETAIL_LABELS[dashDetailOpen] || '')} (${list.length})</strong>
      <button class="secondary" style="padding:3px 9px;font-size:0.72rem;" onclick="toggleDashDetail('${dashDetailOpen}')">✕ បិទ</button>
    </div>
    ${list.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${list.map(e => `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 10px 5px 5px;border:1px solid var(--border);border-radius:999px;font-size:0.8rem;">
        <span class="avatar" style="width:24px;height:24px;font-size:0.68rem;">${e.photo ? `<img src="${escapeHtml(e.photo)}" alt="">` : escapeHtml((e.name || '?').charAt(0).toUpperCase())}</span>
        ${escapeHtml(e.name)}
      </div>`).join('')}</div>` : '<div class="scan-log-empty">មិនមានបុគ្គលិកក្នុងចំណាត់ថ្នាក់នេះទេ</div>'}
  `;
}

function todayStatusLabel(e, today) {
  const rec = attendance[today] && attendance[today][e.id];
  if (!rec || !rec.status) return { text: 'មិនស្កេន', color: 'var(--text-muted)' };
  if (rec.status === 'present') {
    const m = timeToMinutes(rec.checkin);
    const isLate = m !== null && m > lateStartMinutes(getEmpShift(e.id));
    return isLate
      ? { text: `ស្កេនយឺត (${rec.checkin})`, color: '#d97706' }
      : { text: `មកធ្វើការ (${rec.checkin})`, color: 'var(--success)' };
  }
  if (rec.status === 'leave') return { text: 'សុំច្បាប់', color: '#d97706' };
  if (rec.status === 'absent') return { text: 'អ្នកមិនមកធ្វើការ', color: 'var(--danger)' };
  return { text: 'មិនស្កេន', color: 'var(--text-muted)' };
}

function renderDashSearch() {
  const input = byId('dashSearchInput');
  const box = byId('dashSearchResults');
  if (!input || !box) return;
  const q = (input.value || '').trim();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const today = todayStr();
  const matches = employees.filter(e => e.status === 'active' && employeeMatchesSearch(e, q));
  box.style.display = '';
  box.className = 'scan-log';
  box.innerHTML = matches.length
    ? matches.map(e => {
        const s = todayStatusLabel(e, today);
        return `<div class="scan-log-item"><span>${escapeHtml(e.name)}</span><span style="color:${s.color};font-weight:600;">${escapeHtml(s.text)}</span></div>`;
      }).join('')
    : '<div class="scan-log-empty">រកមិនឃើញបុគ្គលិក</div>';
}

function renderDashboard() {
  const monthEl = byId('dashMonth');
  if (!monthEl) return;
  const month = monthEl.value || todayStr().slice(0, 7);
  const today = todayStr();
  byId('dashToday').textContent = `${today} · ${weekdayLabel(today)}`;

  const active = activeEmployeesList();
  let present = 0, leave = 0, late = 0, absent = 0, notYet = 0;
  const presentList = [], lateList = [], leaveList = [], absentList = [], notYetList = [];
  active.forEach(e => {
    const rec = attendance[today] && attendance[today][e.id];
    if (!rec || !rec.status) { notYet++; notYetList.push(e); return; }
    if (rec.status === 'present') {
      present++; presentList.push(e);
      const m = timeToMinutes(rec.checkin);
      if (m !== null && m > lateStartMinutes(getEmpShift(e.id))) { late++; lateList.push(e); }
    } else if (rec.status === 'leave') { leave++; leaveList.push(e); }
    else if (rec.status === 'absent') { absent++; absentList.push(e); }
  });
  dashLists = { present: presentList, late: lateList, leave: leaveList, absent: absentList, notyet: notYetList };
  byId('dashTodayStats').innerHTML =
    statCard(active.length, 'បុគ្គលិកកំពុងបម្រើការ') +
    statCard(present, 'មកធ្វើការ', 'var(--success)', 'present') +
    statCard(late, 'ស្កេនយឺត', '#d97706', 'late') +
    statCard(leave, 'សុំច្បាប់', '#d97706', 'leave') +
    statCard(absent, 'អ្នកមិនមកធ្វើការ', 'var(--danger)', 'absent') +
    statCard(notYet, 'មិនស្កេន', 'var(--text-muted)', 'notyet');
  renderDashDetailPanel();
  renderDashSearch();

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
    <td style="white-space:normal;">${r.image ? `<img src="${escapeHtml(r.image)}" style="height:38px;border-radius:6px;display:block;margin-bottom:4px;">` : ''}<strong>${escapeHtml(r.title)}</strong></td>
    <td style="white-space:normal;max-width:320px;">${escapeHtml(r.body || '')}</td>
    <td>${escapeHtml(annTargetLabel(r))}</td>
    <td><button class="danger" onclick="deleteAnnouncement('${escapeHtml(r.id)}')">🗑</button></td></tr>`).join('');
}

let annPendingImage = null;
function handleAnnImage(file) {
  annPendingImage = null;
  byId('annImagePreview').innerHTML = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { customAlert('សូមជ្រើសរើសឯកសាររូបភាព'); byId('annImage').value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const W = 800, H = 500; // 16:10, កាត់ពីកណ្តាល
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const scale = Math.max(W / img.width, H / img.height);
      const w = W / scale, h = H / scale;
      c.getContext('2d').drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, W, H);
      annPendingImage = c.toDataURL('image/jpeg', 0.75);
      byId('annImagePreview').innerHTML = `<img src="${annPendingImage}" style="max-width:220px;border-radius:8px;display:block;">`;
    };
    img.onerror = () => customAlert('មិនអាចអានរូបភាពនេះបានទេ');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function sendAnnouncement() {
  const title = byId('annTitle').value.trim();
  const text = byId('annText').value.trim();
  const type = byId('annTargetType').value;
  if (!title) { customAlert('សូមបញ្ចូលចំណងជើង'); return; }
  let value = null;
  if (type === 'dept') value = byId('annDeptSelect').value;
  if (type === 'employee') value = byId('annEmployeeSelect').value;
  if (type !== 'all' && !value) { customAlert('សូមជ្រើសរើសអ្នកទទួល'); return; }
  const row = { id: uid(), title, body: text, target_type: type, target_value: value, created_at: new Date().toISOString() };
  if (annPendingImage) row.image = annPendingImage;
  if (!(await dbUpsert('announcements', row))) return;
  announcementRows.unshift(row);
  byId('annTitle').value = ''; byId('annText').value = '';
  annPendingImage = null; byId('annImage').value = ''; byId('annImagePreview').innerHTML = '';
  renderAnnouncements();
  customAlert('✓ បានផ្ញើប្រកាសជូនបុគ្គលិករួចរាល់');
}

async function deleteAnnouncement(id) {
  if (!(await customConfirm('លុបប្រកាសនេះ?'))) return;
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
  if (!(await customConfirm('លុបមតិកែលម្អនេះ?'))) return;
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
  if (!name || !start || !bo || !bi || !end) { customAlert('សូមបំពេញឈ្មោះវេន និងម៉ោងទាំង ៤'); return; }
  const t = [start, bo, bi, end].map(timeToMinutes);
  if (!(t[0] < t[1] && t[1] <= t[2] && t[2] < t[3])) { customAlert('លំដាប់ម៉ោងមិនត្រឹមត្រូវ៖ ចូល < ចេញបាយ ≤ ចូលវិញ < ចេញ (វេនឆ្លងអធ្រាត្រមិនទាន់គាំទ្រ)'); return; }
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
  if (!r) return;
  if (!(await customConfirm(`លុបវេន "${r.name}"? បុគ្គលិកដែលប្រើវេននេះនឹងត្រឡប់ទៅវេនលំនាំដើម។`))) return;
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
