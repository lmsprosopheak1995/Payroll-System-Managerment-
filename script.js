// ==== Supabase configuration ====
// ដាក់ URL និង anon key របស់ Supabase project របស់អ្នកនៅទីនេះ
const SUPABASE_URL = 'https://veszfcxlkgfrljfqsaec.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlc3pmY3hsa2dmcmxqZnFzYWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2OTIyNzcsImV4cCI6MjEwNTI2ODI3N30.KEjw8VKbrFgSnNGkd0rqCneEvAaJ9ENuGFT5M4eu0jk';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let employees = [];
let editingId = null;
let attendance = {};
let settings = {};
let leaveRequests = [];
let overtimeRequests = [];

// ==== Admin authentication gate ====
// ការចូលប្រើទំព័រនេះទាមទារពាក្យសម្ងាត់អ្នកគ្រប់គ្រង។ session ស្ថិតនៅក្នុង sessionStorage
// ប៉ុណ្ណោះ (ដូចទំព័របុគ្គលិក) ដូច្នេះនឹងត្រូវចូលគណនីម្ដងទៀតរាល់ពេលបើក tab/browser ថ្មី។
const ADMIN_SESSION_KEY = 'admin_portal_session';

function getAdminSession() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; }
function setAdminSession() { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); }
function clearAdminSession() { sessionStorage.removeItem(ADMIN_SESSION_KEY); }

function showAdminGate(view, errorMsg) {
  document.getElementById('mainContainer').style.display = 'none';
  document.getElementById('adminGateLoading').style.display = 'none';
  document.getElementById('adminSetupCard').style.display = view === 'setup' ? '' : 'none';
  document.getElementById('adminLoginCard').style.display = view === 'login' ? '' : 'none';
  const setupErr = document.getElementById('adminSetupError');
  const loginErr = document.getElementById('adminLoginError');
  setupErr.style.display = 'none';
  loginErr.style.display = 'none';
  if (view === 'setup' && errorMsg) { setupErr.textContent = errorMsg; setupErr.style.display = 'block'; }
  if (view === 'login' && errorMsg) { loginErr.textContent = errorMsg; loginErr.style.display = 'block'; }
}

async function checkAdminAuthAndInit() {
  if (getAdminSession()) {
    document.getElementById('adminGateLoading').style.display = 'none';
    document.getElementById('adminSetupCard').style.display = 'none';
    document.getElementById('adminLoginCard').style.display = 'none';
    document.getElementById('mainContainer').style.display = '';
    await Promise.all([loadData(), loadAttendance(), loadSettings(), loadLeaveRequests(), loadOvertimeRequests()]);
    renderAll();
    return;
  }
  document.getElementById('adminGateLoading').style.display = '';
  const { data: isSet, error } = await supabaseClient.rpc('admin_password_is_set');
  if (error) {
    console.error('admin_password_is_set failed', error);
    showAdminGate('login', 'មិនអាចភ្ជាប់ទៅ Supabase បានទេ៖ ' + error.message);
    return;
  }
  showAdminGate(isSet ? 'login' : 'setup');
}

async function doAdminSetup() {
  const p1 = document.getElementById('adminSetupPassword').value;
  const p2 = document.getElementById('adminSetupPassword2').value;
  if (!p1 || p1.length < 6) { showAdminGate('setup', 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ'); return; }
  if (p1 !== p2) { showAdminGate('setup', 'ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នាទេ'); return; }
  const { data, error } = await supabaseClient.rpc('set_admin_password', { p_old_password: null, p_new_password: p1 });
  if (error || !data) { showAdminGate('setup', 'កំណត់ពាក្យសម្ងាត់មិនជោគជ័យ៖ ' + (error ? error.message : '')); return; }
  setAdminSession();
  await checkAdminAuthAndInit();
}

async function doAdminLogin() {
  const pw = document.getElementById('adminLoginPassword').value;
  if (!pw) { showAdminGate('login', 'សូមបំពេញពាក្យសម្ងាត់'); return; }
  const { data, error } = await supabaseClient.rpc('login_admin', { p_password: pw });
  if (error) { showAdminGate('login', 'មានបញ្ហាក្នុងការចូលគណនី៖ ' + error.message); return; }
  if (!data) { showAdminGate('login', 'ពាក្យសម្ងាត់មិនត្រឹមត្រូវ'); return; }
  document.getElementById('adminLoginPassword').value = '';
  setAdminSession();
  await checkAdminAuthAndInit();
}

function doAdminLogout() {
  clearAdminSession();
  location.reload();
}

async function changeAdminPassword() {
  const oldPw = prompt('បញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន៖');
  if (oldPw === null) return;
  const newPw = prompt('បញ្ចូលពាក្យសម្ងាត់ថ្មី (យ៉ាងតិច ៦ តួអក្សរ)៖');
  if (newPw === null) return;
  if (newPw.length < 6) { alert('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ'); return; }
  const confirmPw = prompt('បញ្ជាក់ពាក្យសម្ងាត់ថ្មីម្ដងទៀត៖');
  if (newPw !== confirmPw) { alert('ពាក្យសម្ងាត់ថ្មីមិនដូចគ្នាទេ'); return; }
  const { data, error } = await supabaseClient.rpc('set_admin_password', { p_old_password: oldPw, p_new_password: newPw });
  if (error || !data) { alert('ប្តូរពាក្យសម្ងាត់មិនជោគជ័យ៖ ពាក្យសម្ងាត់បច្ចុប្បន្នប្រហែលមិនត្រឹមត្រូវ'); return; }
  alert('ប្តូរពាក្យសម្ងាត់ជោគជ័យ');
}

const DEFAULT_SETTINGS = {
  standardStart: '08:00',
  standardHours: 8,
  otMultiplier: 1.5,
  foodDaily: 2000,
  foodOT: 2000,
  workDaysPerMonth: 26,
  exchangeRate: 4100,
  workplaceCode: null,
};

// ---- Workplace QR code (random code posted at the office entrance) ----
function generateWorkplaceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'WP-';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---- row <-> object mapping ----
function rowToEmployee(r) {
  return {
    id: r.id,
    name: r.name || '',
    position: r.position || '',
    dept: r.dept || '',
    phone: r.phone || '',
    email: r.email || '',
    startDate: r.start_date || '',
    salary: r.salary ?? '',
    status: r.status || 'active',
    username: r.username || '',
  };
}

function employeeToRow(e) {
  const row = {
    id: e.id,
    name: e.name,
    position: e.position,
    dept: e.dept,
    phone: e.phone || null,
    email: e.email || null,
    start_date: e.startDate || null,
    salary: e.salary === '' || e.salary === undefined ? null : e.salary,
    status: e.status,
    username: e.username || null,
  };
  return row;
}

function rowToAttRecord(r) {
  return { status: r.status || '', checkin: r.checkin || '', checkout: r.checkout || '', breakOut: r.break_out || '', breakIn: r.break_in || '' };
}

function attRecordToRow(date, empId, rec) {
  return {
    date,
    employee_id: empId,
    status: rec.status || '',
    checkin: rec.checkin || '',
    checkout: rec.checkout || '',
    break_out: rec.breakOut || '',
    break_in: rec.breakIn || '',
  };
}

// ---- load from Supabase ----
async function loadData() {
  const { data, error } = await supabaseClient.from('employees')
    .select('id, name, position, dept, phone, email, start_date, salary, status, username, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Load employees failed', error);
    alert('មិនអាចទាញយកទិន្នន័យបុគ្គលិកពី Supabase បានទេ៖ ' + error.message);
    employees = [];
    return;
  }
  employees = (data || []).map(rowToEmployee);
}

async function loadAttendance() {
  const { data, error } = await supabaseClient.from('attendance').select('*');
  if (error) {
    console.error('Load attendance failed', error);
    alert('មិនអាចទាញយកទិន្នន័យវត្តមានពី Supabase បានទេ៖ ' + error.message);
    attendance = {};
    return;
  }
  attendance = {};
  (data || []).forEach(r => {
    if (!attendance[r.date]) attendance[r.date] = {};
    attendance[r.date][r.employee_id] = rowToAttRecord(r);
  });
}

async function loadSettings() {
  const { data, error } = await supabaseClient.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    console.error('Load settings failed', error);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }
  if (!data) {
    settings = { ...DEFAULT_SETTINGS, workplaceCode: generateWorkplaceCode() };
    await upsertSettings();
    return;
  }
  settings = {
    standardStart: data.standard_start ?? DEFAULT_SETTINGS.standardStart,
    standardHours: data.standard_hours ?? DEFAULT_SETTINGS.standardHours,
    otMultiplier: data.ot_multiplier ?? DEFAULT_SETTINGS.otMultiplier,
    foodDaily: data.food_daily ?? DEFAULT_SETTINGS.foodDaily,
    foodOT: data.food_ot ?? DEFAULT_SETTINGS.foodOT,
    workDaysPerMonth: data.work_days_per_month ?? DEFAULT_SETTINGS.workDaysPerMonth,
    exchangeRate: data.exchange_rate ?? DEFAULT_SETTINGS.exchangeRate,
    workplaceCode: data.workplace_code ?? null,
  };
  // បង្កើតកូដម្តងដំបូង ប្រសិនបើមិនទាន់មាន (ស្រប migration ចាស់ដែលមិនទាន់មាន column នេះ)
  if (!settings.workplaceCode) {
    settings.workplaceCode = generateWorkplaceCode();
    await upsertSettings();
  }
}

// ---- write to Supabase ----
async function upsertEmployee(emp) {
  const { error } = await supabaseClient.from('employees')
    .upsert(employeeToRow(emp), { onConflict: 'id' })
    .select('id, name, position, dept, phone, email, start_date, salary, status, username, created_at');
  if (error) {
    console.error('Save employee failed', error);
    alert('រក្សាទុកបុគ្គលិកលើ Supabase មិនជោគជ័យ៖ ' + error.message);
  }
}

async function deleteEmployeeRow(id) {
  const { error } = await supabaseClient.from('employees').delete().eq('id', id);
  if (error) {
    console.error('Delete employee failed', error);
    alert('លុបបុគ្គលិកលើ Supabase មិនជោគជ័យ៖ ' + error.message);
  }
}

async function upsertAttendanceRecord(date, empId, rec) {
  const { error } = await supabaseClient.from('attendance').upsert(attRecordToRow(date, empId, rec), { onConflict: 'date,employee_id' });
  if (error) {
    console.error('Save attendance failed', error);
    alert('រក្សាទុកវត្តមានលើ Supabase មិនជោគជ័យ៖ ' + error.message);
  }
}

async function upsertSettings() {
  const row = {
    id: 1,
    standard_start: settings.standardStart,
    standard_hours: settings.standardHours,
    ot_multiplier: settings.otMultiplier,
    food_daily: settings.foodDaily,
    food_ot: settings.foodOT,
    work_days_per_month: settings.workDaysPerMonth,
    exchange_rate: settings.exchangeRate,
    workplace_code: settings.workplaceCode,
  };
  const { error } = await supabaseClient.from('app_settings').upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('Save settings failed', error);
    alert('រក្សាទុកការកំណត់លើ Supabase មិនជោគជ័យ៖ ' + error.message);
  }
}

function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function currentAttendanceMonth() {
  const input = document.getElementById('attendanceMonth');
  return input.value || todayStr().slice(0, 7);
}

function currentAttendanceEmployeeId() {
  const sel = document.getElementById('attendanceEmployeeSelect');
  return sel ? sel.value : '';
}

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  const dates = [];
  for (let d = 1; d <= count; d++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

const KHMER_WEEKDAYS = ['អាទិត្យ', 'ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
function weekdayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return KHMER_WEEKDAYS[d.getDay()];
}

function renderAttendanceEmployeeSelect() {
  const sel = document.getElementById('attendanceEmployeeSelect');
  const activeEmployees = employees.filter(e => e.status === 'active');
  const currentVal = sel.value;
  sel.innerHTML = activeEmployees.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  if (activeEmployees.some(e => e.id === currentVal)) {
    sel.value = currentVal;
  } else if (activeEmployees.length > 0) {
    sel.value = activeEmployees[0].id;
  }
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function computeRow(emp, record) {
  const salary = parseFloat(emp.salary) || 0;
  const dailyRate = settings.workDaysPerMonth > 0 ? salary / settings.workDaysPerMonth : 0;
  const hourlyRate = settings.standardHours > 0 ? dailyRate / settings.standardHours : 0;

  const status = record?.status || '';
  const checkin = record?.checkin || '';
  const checkout = record?.checkout || '';
  const breakOut = record?.breakOut || '';
  const breakIn = record?.breakIn || '';
  let normalHours = 0, otHours = 0, late = false;

  if (status === 'present' && checkin && checkout) {
    const inMin = timeToMinutes(checkin);
    let outMin = timeToMinutes(checkout);
    if (outMin < inMin) outMin += 24 * 60;
    let totalMinutes = outMin - inMin;

    // Subtract the lunch break, but only if it actually falls within the check-in/check-out
    // window — a mistaken AM/PM entry outside the shift is ignored instead of zeroing the day.
    if (breakOut && breakIn) {
      let boMin = timeToMinutes(breakOut);
      let biMin = timeToMinutes(breakIn);
      if (boMin < inMin) boMin += 24 * 60;
      if (biMin < boMin) biMin += 24 * 60;
      if (boMin >= inMin && boMin <= outMin && biMin >= boMin && biMin <= outMin) {
        totalMinutes -= (biMin - boMin);
      }
    }

    const totalHours = Math.max(totalMinutes, 0) / 60;
    normalHours = Math.min(totalHours, settings.standardHours);
    otHours = Math.max(totalHours - settings.standardHours, 0);
    const startMin = timeToMinutes(settings.standardStart);
    if (startMin !== null && inMin > startMin) late = true;
  }

  const round4 = n => Math.round(n * 10000) / 10000;
  const normalPay = round4(status === 'leave' ? dailyRate : hourlyRate * normalHours);
  const otPay = round4(hourlyRate * settings.otMultiplier * otHours);
  // Food allowances are set and displayed in Riel; convert to USD only for the USD total.
  const foodPayRiel = (status === 'leave' || normalHours > 0) ? settings.foodDaily : 0;
  const foodOtPayRiel = otHours > 0 ? settings.foodOT : 0;
  const exchangeRate = settings.exchangeRate > 0 ? settings.exchangeRate : 1;
  const foodPay = round4(foodPayRiel / exchangeRate);
  const foodOtPay = round4(foodOtPayRiel / exchangeRate);
  // Total is the sum of the already-rounded line items, matching a manual/paper total.
  const total = round4(normalPay + otPay + foodPay + foodOtPay);
  const riel = Math.round(total * settings.exchangeRate);

  return { status, checkin, checkout, breakOut, breakIn, late, normalHours, otHours, normalPay, otPay, foodPay, foodOtPay, foodPayRiel, foodOtPayRiel, total, riel };
}

const STATUS_LABELS = { present: 'មកធ្វើការ', absent: 'អវត្តមាន', leave: 'ច្បាប់', '': '-' };

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// USD monetary values are always shown to 4 decimal places (e.g. $8.0769).
function fmtUSD(n) {
  return (Math.round((n || 0) * 10000) / 10000).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// Riel amounts are whole numbers with thousands separators (e.g. 48,423).
function fmtRiel(n) {
  return Math.round(n || 0).toLocaleString();
}

// Hours are shown without trailing zeros (8 instead of 8.00, 8.5 instead of 8.50).
function fmtHours(n) {
  return (Math.round((n || 0) * 100) / 100).toString();
}

function renderAttendanceTab() {
  renderAttendanceEmployeeSelect();
  const activeEmployees = employees.filter(e => e.status === 'active');
  const tbody = document.getElementById('attendanceBody');
  const emptyState = document.getElementById('attendanceEmpty');

  if (activeEmployees.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    document.getElementById('attendanceStats').innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';

  const empId = currentAttendanceEmployeeId();
  const emp = activeEmployees.find(e => e.id === empId) || activeEmployees[0];
  const month = currentAttendanceMonth();
  const dates = daysInMonth(month);

  let totals = { total: 0, riel: 0, workDays: 0, lateDays: 0 };

  tbody.innerHTML = dates.map(date => {
    const record = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, record);
    totals.total += r.total;
    totals.riel += r.riel;
    if (r.status === 'present') totals.workDays++;
    if (r.late) totals.lateDays++;
    const statusOptions = ['', 'present', 'absent', 'leave'].map(s =>
      `<option value="${s}" ${r.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
    ).join('');
    return `<tr>
      <td>${date}</td>
      <td>${weekdayLabel(date)}</td>
      <td><input type="time" value="${r.checkin}" ${r.status !== 'present' ? 'disabled' : ''} onchange="updateAttRecord('${date}','${emp.id}','checkin',this.value)" style="width:115px;"></td>
      <td><input type="time" value="${r.breakOut}" ${r.status !== 'present' ? 'disabled' : ''} onchange="updateAttRecord('${date}','${emp.id}','breakOut',this.value)" style="width:115px;"></td>
      <td><input type="time" value="${r.breakIn}" ${r.status !== 'present' ? 'disabled' : ''} onchange="updateAttRecord('${date}','${emp.id}','breakIn',this.value)" style="width:115px;"></td>
      <td><input type="time" value="${r.checkout}" ${r.status !== 'present' ? 'disabled' : ''} onchange="updateAttRecord('${date}','${emp.id}','checkout',this.value)" style="width:115px;"></td>
      <td>${r.late ? '<span class="badge inactive">យឺត</span>' : '-'}</td>
      <td><select onchange="updateAttRecord('${date}','${emp.id}','status',this.value)" style="min-width:110px;">${statusOptions}</select></td>
      <td>${r.normalHours ? fmtHours(r.normalHours) : '-'}</td>
      <td>$${fmtUSD(r.normalPay)}</td>
      <td>${r.otHours ? fmtHours(r.otHours) : '-'}</td>
      <td>$${fmtUSD(r.otPay)}</td>
      <td>${r.foodPayRiel ? fmtRiel(r.foodPayRiel) + ' ៛' : '-'}</td>
      <td>${r.foodOtPayRiel ? fmtRiel(r.foodOtPayRiel) + ' ៛' : '-'}</td>
      <td><strong>$${fmtUSD(r.total)}</strong></td>
      <td>${fmtRiel(r.riel)} ៛</td>
    </tr>`;
  }).join('');

  document.getElementById('attendanceStats').innerHTML = `
    <div class="stat-card"><div class="num">${totals.workDays}</div><div class="label">ថ្ងៃធ្វើការ</div></div>
    <div class="stat-card"><div class="num">${totals.lateDays}</div><div class="label">ថ្ងៃមកយឺត</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(totals.total)}</div><div class="label">ចំណាយសរុប ($)</div></div>
    <div class="stat-card"><div class="num">${fmtRiel(totals.riel)} ៛</div><div class="label">ចំណាយសរុប (រៀល)</div></div>
  `;
}

function updateAttRecord(date, empId, field, value) {
  if (!attendance[date]) attendance[date] = {};
  if (!attendance[date][empId]) attendance[date][empId] = { status: '', checkin: '', checkout: '', breakOut: '', breakIn: '' };
  attendance[date][empId][field] = value;
  if (field === 'status' && value !== 'present') {
    attendance[date][empId].checkin = '';
    attendance[date][empId].checkout = '';
    attendance[date][empId].breakOut = '';
    attendance[date][empId].breakIn = '';
  }
  renderAttendanceTab();
  upsertAttendanceRecord(date, empId, attendance[date][empId]);
}

function openSettingsModal() {
  document.getElementById('setStandardStart').value = settings.standardStart;
  document.getElementById('setStandardHours').value = settings.standardHours;
  document.getElementById('setOtMultiplier').value = settings.otMultiplier;
  document.getElementById('setWorkDays').value = settings.workDaysPerMonth;
  document.getElementById('setFoodDaily').value = settings.foodDaily;
  document.getElementById('setFoodOT').value = settings.foodOT;
  document.getElementById('setExchangeRate').value = settings.exchangeRate;
  document.getElementById('settingsOverlay').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('settingsOverlay').classList.remove('open');
}

function saveSettingsForm() {
  settings.standardStart = document.getElementById('setStandardStart').value || DEFAULT_SETTINGS.standardStart;
  settings.standardHours = parseFloat(document.getElementById('setStandardHours').value) || DEFAULT_SETTINGS.standardHours;
  settings.otMultiplier = parseFloat(document.getElementById('setOtMultiplier').value) || DEFAULT_SETTINGS.otMultiplier;
  settings.workDaysPerMonth = parseFloat(document.getElementById('setWorkDays').value) || DEFAULT_SETTINGS.workDaysPerMonth;
  settings.foodDaily = parseFloat(document.getElementById('setFoodDaily').value) || 0;
  settings.foodOT = parseFloat(document.getElementById('setFoodOT').value) || 0;
  settings.exchangeRate = parseFloat(document.getElementById('setExchangeRate').value) || DEFAULT_SETTINGS.exchangeRate;
  closeSettingsModal();
  renderAttendanceTab();
  upsertSettings();
}

function exportAttendanceCSV() {
  const activeEmployees = employees.filter(e => e.status === 'active');
  if (activeEmployees.length === 0) {
    alert('មិនមានទិន្នន័យបុគ្គលិកទេ');
    return;
  }
  const empId = currentAttendanceEmployeeId();
  const emp = activeEmployees.find(e => e.id === empId) || activeEmployees[0];
  const month = currentAttendanceMonth();
  const dates = daysInMonth(month);
  const headers = ['ថ្ងៃទី', 'ថ្ងៃ', 'ចូល', 'ចេញអាហារ', 'ចូលអាហារវិញ', 'ចេញ', 'យឺត', 'ស្ថានភាព', 'ធម្មតា(ម៉ោង)', 'ប្រាក់ខែ($)', 'ថែមម៉ោង(ម៉ោង)', 'ប្រាក់ថែមម៉ោង($)', 'បាយថ្ងៃត្រង់(៛)', 'បាយថែមម៉ោង(៛)', 'សរុប($)', 'សរុប(៛)'];
  const rows = dates.map(date => {
    const record = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, record);
    return [
      date, weekdayLabel(date), r.checkin, r.breakOut, r.breakIn, r.checkout, r.late ? 'យឺត' : '-',
      STATUS_LABELS[r.status] || '-', r.normalHours.toFixed(2), r.normalPay.toFixed(4),
      r.otHours.toFixed(2), r.otPay.toFixed(4), Math.round(r.foodPayRiel), Math.round(r.foodOtPayRiel),
      r.total.toFixed(4), Math.round(r.riel)
    ];
  });
  let csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_${emp.name}_${month}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function uid() {
  return 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function generateEmployeeCode() {
  const used = new Set(employees.map(e => (e.username || '').toUpperCase()));
  let code;
  do {
    code = 'B-' + String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(code));
  return code;
}

// ==== Leave / Overtime requests (admin approval) ====
const REQUEST_STATUS_LABELS = { pending: 'កំពុងរង់ចាំ', approved: 'អនុម័ត', rejected: 'បដិសេធ' };
const LEAVE_TYPE_LABELS = { annual: 'ច្បាប់ប្រចាំឆ្នាំ', sick: 'ច្បាប់ឈឺ', unpaid: 'ច្បាប់គ្មានប្រាក់ខែ', other: 'ផ្សេងៗ' };

async function loadLeaveRequests() {
  const { data, error } = await supabaseClient.from('leave_requests').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Load leave requests failed', error); leaveRequests = []; return; }
  leaveRequests = data || [];
}

async function loadOvertimeRequests() {
  const { data, error } = await supabaseClient.from('overtime_requests').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Load overtime requests failed', error); overtimeRequests = []; return; }
  overtimeRequests = data || [];
}

function empName(id) {
  const e = employees.find(x => x.id === id);
  return e ? e.name : id;
}

function datesInRange(startStr, endStr) {
  const dates = [];
  let d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function renderRequestsTab() {
  const filter = document.getElementById('reqStatusFilter').value;
  const leaveRows = leaveRequests.filter(r => !filter || r.status === filter);
  const otRows = overtimeRequests.filter(r => !filter || r.status === filter);
  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length + overtimeRequests.filter(r => r.status === 'pending').length;
  const badge = document.getElementById('pendingReqBadge');
  if (badge) badge.textContent = pendingCount > 0 ? `(${pendingCount})` : '';

  const leaveBody = document.getElementById('leaveReqBody');
  const leaveEmpty = document.getElementById('leaveReqEmpty');
  if (leaveRows.length === 0) {
    leaveBody.innerHTML = '';
    leaveEmpty.style.display = 'block';
  } else {
    leaveEmpty.style.display = 'none';
    leaveBody.innerHTML = leaveRows.map(r => `
      <tr>
        <td>${escapeHtml(empName(r.employee_id))}</td>
        <td>${escapeHtml(LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type)}</td>
        <td>${r.start_date}</td>
        <td>${r.end_date}</td>
        <td style="max-width:220px;white-space:normal;">${escapeHtml(r.reason || '-')}</td>
        <td>${r.attachment_url ? `<a href="${r.attachment_url}" target="_blank" rel="noopener">🖼 មើល</a>` : '-'}</td>
        <td><span class="badge ${r.status}">${REQUEST_STATUS_LABELS[r.status] || r.status}</span></td>
        <td>
          ${r.status === 'pending' ? `
            <div class="row-actions">
              <button class="secondary" onclick="approveLeaveRequest('${r.id}')">✓ អនុម័ត</button>
              <button class="danger" onclick="rejectLeaveRequest('${r.id}')">✕ បដិសេធ</button>
            </div>` : (r.admin_note ? escapeHtml(r.admin_note) : '-')}
        </td>
      </tr>`).join('');
  }

  const otBody = document.getElementById('otReqBody');
  const otEmpty = document.getElementById('otReqEmpty');
  if (otRows.length === 0) {
    otBody.innerHTML = '';
    otEmpty.style.display = 'block';
  } else {
    otEmpty.style.display = 'none';
    otBody.innerHTML = otRows.map(r => `
      <tr>
        <td>${escapeHtml(empName(r.employee_id))}</td>
        <td>${r.work_date}</td>
        <td>${r.start_time} - ${r.end_time}</td>
        <td style="max-width:220px;white-space:normal;">${escapeHtml(r.reason || '-')}</td>
        <td><span class="badge ${r.status}">${REQUEST_STATUS_LABELS[r.status] || r.status}</span></td>
        <td>
          ${r.status === 'pending' ? `
            <div class="row-actions">
              <button class="secondary" onclick="approveOTRequest('${r.id}')">✓ អនុម័ត</button>
              <button class="danger" onclick="rejectOTRequest('${r.id}')">✕ បដិសេធ</button>
            </div>` : (r.admin_note ? escapeHtml(r.admin_note) : '-')}
        </td>
      </tr>`).join('');
  }
}

async function approveLeaveRequest(id) {
  const req = leaveRequests.find(r => r.id === id);
  if (!req) return;
  const { error } = await supabaseClient.from('leave_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('អនុម័តមិនជោគជ័យ៖ ' + error.message); return; }
  // Mark each day in the approved range as 'leave' on the attendance sheet.
  const dates = datesInRange(req.start_date, req.end_date);
  for (const date of dates) {
    const rec = { status: 'leave', checkin: '', checkout: '', breakOut: '', breakIn: '' };
    if (!attendance[date]) attendance[date] = {};
    attendance[date][req.employee_id] = rec;
    await upsertAttendanceRecord(date, req.employee_id, rec);
  }
  req.status = 'approved';
  renderAttendanceTab();
  renderRequestsTab();
}

async function rejectLeaveRequest(id) {
  const note = prompt('មូលហេតុបដិសេធ (មិនចាំបាច់)៖') || '';
  const { error } = await supabaseClient.from('leave_requests')
    .update({ status: 'rejected', admin_note: note, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('បដិសេធមិនជោគជ័យ៖ ' + error.message); return; }
  const req = leaveRequests.find(r => r.id === id);
  if (req) { req.status = 'rejected'; req.admin_note = note; }
  renderRequestsTab();
}

async function approveOTRequest(id) {
  const { error } = await supabaseClient.from('overtime_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('អនុម័តមិនជោគជ័យ៖ ' + error.message); return; }
  const req = overtimeRequests.find(r => r.id === id);
  if (req) req.status = 'approved';
  renderRequestsTab();
}

async function rejectOTRequest(id) {
  const note = prompt('មូលហេតុបដិសេធ (មិនចាំបាច់)៖') || '';
  const { error } = await supabaseClient.from('overtime_requests')
    .update({ status: 'rejected', admin_note: note, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('បដិសេធមិនជោគជ័យ៖ ' + error.message); return; }
  const req = overtimeRequests.find(r => r.id === id);
  if (req) { req.status = 'rejected'; req.admin_note = note; }
  renderRequestsTab();
}

function renderStats() {
  const total = employees.length;
  const active = employees.filter(e => e.status === 'active').length;
  const depts = new Set(employees.map(e => e.dept).filter(Boolean)).size;
  const totalSalary = employees.filter(e => e.status === 'active').reduce((s, e) => s + (parseFloat(e.salary) || 0), 0);
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="label">បុគ្គលិកសរុប</div></div>
    <div class="stat-card"><div class="num">${active}</div><div class="label">កំពុងបម្រើការ</div></div>
    <div class="stat-card"><div class="num">${depts}</div><div class="label">ផ្នែក</div></div>
    <div class="stat-card"><div class="num">$${totalSalary.toLocaleString(undefined, {maximumFractionDigits:2})}</div><div class="label">ចំណាយប្រាក់ខែ/ខែ</div></div>
  `;
}

function renderDeptFilter() {
  const depts = [...new Set(employees.map(e => e.dept).filter(Boolean))].sort();
  const filterSel = document.getElementById('deptFilter');
  const currentVal = filterSel.value;
  filterSel.innerHTML = '<option value="">គ្រប់ផ្នែក</option>' + depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  filterSel.value = currentVal;

  const datalist = document.getElementById('deptList');
  datalist.innerHTML = depts.map(d => `<option value="${escapeHtml(d)}">`).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderTable() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const deptFilter = document.getElementById('deptFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  let filtered = employees.filter(e => {
    const matchesSearch = !search || (e.name || '').toLowerCase().includes(search) || (e.position || '').toLowerCase().includes(search);
    const matchesDept = !deptFilter || e.dept === deptFilter;
    const matchesStatus = !statusFilter || e.status === statusFilter;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.textContent = employees.length === 0
      ? 'មិនទាន់មានទិន្នន័យបុគ្គលិកទេ សូមចុច "បន្ថែមបុគ្គលិកថ្មី" ដើម្បីចាប់ផ្តើម។'
      : 'រកមិនឃើញបុគ្គលិកដែលត្រូវនឹងលក្ខខណ្ឌនេះទេ។';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.position)}</td>
      <td>${escapeHtml(e.dept)}</td>
      <td>${escapeHtml(e.phone) || '-'}</td>
      <td>${e.startDate || '-'}</td>
      <td><span class="badge ${e.status}">${e.status === 'active' ? 'កំពុងបម្រើការ' : 'ឈប់បម្រើការ'}</span></td>
      <td>
        <div class="row-actions">
          <button class="secondary" onclick="openEditModal('${e.id}')">✏️ កែ</button>
          <button class="danger" onclick="deleteEmployee('${e.id}')">🗑 លុប</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderAll() {
  renderStats();
  renderDeptFilter();
  renderTable();
  renderAttendanceTab();
  renderScanLog();
  renderRequestsTab();
  renderWorkplaceQR();
}

// ---- Workplace QR (posted at the entrance, self-scanned by employees) ----
function renderWorkplaceQR() {
  const wrap = document.getElementById('workplaceQrCanvasWrap');
  if (!wrap) return;
  if (!settings.workplaceCode) { wrap.innerHTML = ''; return; }
  if (typeof qrcode === 'undefined') {
    console.error('QR library (qrcode-generator) failed to load — check that the CDN script tag loaded, or network/ad-blocker issues.');
    wrap.innerHTML = '<p style="font-size:0.75rem;color:var(--danger);">មិនអាចផ្ទុកម៉ូឌុល QR បានទេ (សូមពិនិត្យ browser console)</p>';
    return;
  }
  try {
    const qr = qrcode(0, 'M');
    qr.addData(settings.workplaceCode);
    qr.make();
    const dataUrl = qr.createDataURL(6, 8);
    wrap.innerHTML = `<img id="workplaceQrImg" src="${dataUrl}" alt="Workplace QR" style="max-width:220px;width:100%;border-radius:8px;">`;
  } catch (e) {
    console.error('QR generation failed for workplaceCode =', settings.workplaceCode, e);
    wrap.innerHTML = '<p style="font-size:0.75rem;color:var(--danger);">មិនអាចបង្កើតកូដ QR បានទេ (សូមពិនិត្យ browser console)</p>';
  }
}

async function regenerateWorkplaceQR() {
  if (!confirm('បង្កើតកូដ QR កន្លែងធ្វើការថ្មី? QR ចាស់ដែលបានបិទ/បោះពុម្ពនឹងលែងប្រើការបាន')) return;
  settings.workplaceCode = generateWorkplaceCode();
  await upsertSettings();
  renderWorkplaceQR();
}

function downloadWorkplaceQR() {
  const img = document.getElementById('workplaceQrImg');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'workplace_qr.gif';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'បន្ថែមបុគ្គលិកថ្មី';
  document.getElementById('empId').value = '';
  document.getElementById('empName').value = '';
  document.getElementById('empPosition').value = '';
  document.getElementById('empDept').value = '';
  document.getElementById('empPhone').value = '';
  document.getElementById('empEmail').value = '';
  document.getElementById('empStartDate').value = '';
  document.getElementById('empSalary').value = '';
  document.getElementById('empStatus').value = 'active';
  document.getElementById('empUsername').value = generateEmployeeCode();
  document.getElementById('empPassword').value = '';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('empName').focus();
}

function openEditModal(id) {
  const e = employees.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'កែប្រែព័ត៌មានបុគ្គលិក';
  document.getElementById('empId').value = e.id;
  document.getElementById('empName').value = e.name || '';
  document.getElementById('empPosition').value = e.position || '';
  document.getElementById('empDept').value = e.dept || '';
  document.getElementById('empPhone').value = e.phone || '';
  document.getElementById('empEmail').value = e.email || '';
  document.getElementById('empStartDate').value = e.startDate || '';
  document.getElementById('empSalary').value = e.salary || '';
  document.getElementById('empStatus').value = e.status || 'active';
  document.getElementById('empUsername').value = e.username || '';
  document.getElementById('empPassword').value = '';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

async function saveEmployee() {
  const name = document.getElementById('empName').value.trim();
  const position = document.getElementById('empPosition').value.trim();
  const dept = document.getElementById('empDept').value.trim();

  if (!name || !position || !dept) {
    alert('សូមបំពេញព័ត៌មានចាំបាច់៖ ឈ្មោះ តួនាទី និងផ្នែក');
    return;
  }

  const username = document.getElementById('empUsername').value.trim();
  const passwordInput = document.getElementById('empPassword').value;
  const existingEmp = editingId ? employees.find(x => x.id === editingId) : null;
  // ត្រូវការពាក្យសម្ងាត់ទាំងពេលបង្កើតគណនីថ្មី ទាំងពេលបន្ថែម username ដំបូងគេទៅឲ្យបុគ្គលិកចាស់
  // (មុននេះការត្រួតពិនិត្យអនុវត្តតែពេលបង្កើតថ្មី ធ្វើឲ្យអាចរក្សាទុក username ដោយគ្មានពាក្យសម្ងាត់ពេលកែប្រែ)
  const isFirstTimeUsername = username && (!existingEmp || !existingEmp.username);
  if (isFirstTimeUsername && passwordInput === '') {
    alert('សូមកំណត់ពាក្យសម្ងាត់សម្រាប់គណនីនេះ (គណនីនេះមិនទាន់មានពាក្យសម្ងាត់ទេ)');
    return;
  }

  const data = {
    name,
    position,
    dept,
    phone: document.getElementById('empPhone').value.trim(),
    email: document.getElementById('empEmail').value.trim(),
    startDate: document.getElementById('empStartDate').value,
    salary: document.getElementById('empSalary').value,
    status: document.getElementById('empStatus').value,
    username,
  };

  let savedEmp;
  if (editingId) {
    const idx = employees.findIndex(x => x.id === editingId);
    if (idx !== -1) employees[idx] = { ...employees[idx], ...data };
    savedEmp = employees[idx];
  } else {
    savedEmp = { id: uid(), ...data };
    employees.push(savedEmp);
  }

  closeModal();
  renderAll();
  await upsertEmployee(savedEmp);
  if (passwordInput) {
    const { error } = await supabaseClient.rpc('set_employee_password', {
      p_employee_id: savedEmp.id,
      p_password: passwordInput,
    });
    if (error) alert('រក្សាទុកព័ត៌មានបុគ្គលិកបានជោគជ័យ ប៉ុន្តែកំណត់ពាក្យសម្ងាត់មិនជោគជ័យ៖ ' + error.message);
  }
}

function deleteEmployee(id) {
  const e = employees.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`តើអ្នកប្រាកដជាចង់លុប "${e.name}" មែនទេ?`)) return;
  employees = employees.filter(x => x.id !== id);
  renderAll();
  deleteEmployeeRow(id);
}

function exportCSV() {
  if (employees.length === 0) {
    alert('មិនមានទិន្នន័យសម្រាប់នាំចេញទេ');
    return;
  }
  const headers = ['ឈ្មោះ', 'តួនាទី', 'ផ្នែក', 'ទូរស័ព្ទ', 'អ៊ីមែល', 'ថ្ងៃចូលធ្វើការ', 'ប្រាក់ខែ', 'ស្ថានភាព'];
  const rows = employees.map(e => [
    e.name, e.position, e.dept, e.phone || '', e.email || '', e.startDate || '', e.salary || '', e.status
  ]);
  let csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employees.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- QR scan (check-in / check-out) ----
let html5QrCodeInstance = null;
let scannerRunning = false;
let lastScanByEmp = {}; // empId -> timestamp ms, cooldown guard against duplicate rapid reads

function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function setScanResult(type, text) {
  const box = document.getElementById('scanResultBox');
  if (!box) return;
  box.className = 'scan-result-box scan-result-' + type;
  box.textContent = text;
}

function renderScanLog() {
  const logBox = document.getElementById('scanLog');
  if (!logBox) return;
  const today = todayStr();
  const dayRecords = attendance[today] || {};
  const rows = employees
    .filter(e => dayRecords[e.id] && (dayRecords[e.id].checkin || dayRecords[e.id].checkout))
    .map(e => {
      const r = dayRecords[e.id];
      const parts = [];
      if (r.checkin) parts.push(`ចូល ${r.checkin}`);
      if (r.checkout) parts.push(`ចេញ ${r.checkout}`);
      return { name: e.name, text: parts.join(' · '), lastTime: r.checkout || r.checkin };
    })
    .sort((a, b) => (b.lastTime || '').localeCompare(a.lastTime || ''));

  if (rows.length === 0) {
    logBox.innerHTML = '<div class="scan-log-empty">មិនទាន់មានការស្កេនថ្ងៃនេះទេ</div>';
    return;
  }
  logBox.innerHTML = rows.map(r => `<div class="scan-log-item"><span>${escapeHtml(r.name)}</span><span>${escapeHtml(r.text)}</span></div>`).join('');
}

function handleScanResult(decodedText) {
  const empId = (decodedText || '').trim();
  const now = Date.now();
  if (lastScanByEmp[empId] && now - lastScanByEmp[empId] < 4000) return; // ignore duplicate reads within 4s
  lastScanByEmp[empId] = now;

  const emp = employees.find(x => x.id === empId && x.status === 'active');
  if (!emp) {
    setScanResult('error', '✕ រកមិនឃើញបុគ្គលិកសម្រាប់កូដនេះ');
    return;
  }

  const date = todayStr();
  const time = nowTimeStr();
  if (!attendance[date]) attendance[date] = {};
  if (!attendance[date][empId]) attendance[date][empId] = { status: '', checkin: '', checkout: '', breakOut: '', breakIn: '' };
  const rec = attendance[date][empId];

  if (!rec.checkin) {
    rec.status = 'present';
    rec.checkin = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាម៉ោងចូល ${time}`);
  } else if (!rec.checkout) {
    rec.checkout = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាម៉ោងចេញ ${time}`);
  } else {
    setScanResult('info', `ℹ ${emp.name} បានស្កេនទាំងចូល និងចេញរួចសម្រាប់ថ្ងៃនេះ (${rec.checkin} - ${rec.checkout})`);
    return;
  }

  renderScanLog();
  renderAttendanceTab();
  upsertAttendanceRecord(date, empId, rec);
}

function startScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    setScanResult('error', 'មិនអាចផ្ទុកម៉ូឌុលស្កេនបានទេ សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត');
    return;
  }
  html5QrCodeInstance = new Html5Qrcode('qrReader');
  html5QrCodeInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 240 },
    (decodedText) => handleScanResult(decodedText),
    () => {}
  ).then(() => {
    scannerRunning = true;
    document.getElementById('scanStartBtn').style.display = 'none';
    document.getElementById('scanStopBtn').style.display = '';
  }).catch(() => {
    setScanResult('error', '✕ មិនអាចបើកកាមេរ៉ាបានទេ សូមផ្ដល់សិទ្ធិប្រើកាមេរ៉ា ឬពិនិត្យថាទំព័រនេះបើកតាម https:// / localhost');
  });
}

function stopScanner() {
  if (html5QrCodeInstance && scannerRunning) {
    html5QrCodeInstance.stop().then(() => {
      html5QrCodeInstance.clear();
      scannerRunning = false;
      const startBtn = document.getElementById('scanStartBtn');
      const stopBtn = document.getElementById('scanStopBtn');
      if (startBtn) startBtn.style.display = '';
      if (stopBtn) stopBtn.style.display = 'none';
    }).catch(() => {});
  }
}

// ---- Employee QR code (for scanning) ----
document.getElementById('addBtn').addEventListener('click', openAddModal);
document.getElementById('empUsernameRegenBtn').addEventListener('click', () => {
  document.getElementById('empUsername').value = generateEmployeeCode();
});
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveEmployee);
document.getElementById('exportBtn').addEventListener('click', exportCSV);
document.getElementById('searchInput').addEventListener('input', renderTable);
document.getElementById('deptFilter').addEventListener('change', renderTable);
document.getElementById('statusFilter').addEventListener('change', renderTable);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
document.getElementById('attendanceEmployeeSelect').addEventListener('change', renderAttendanceTab);
document.getElementById('attendanceMonth').addEventListener('change', renderAttendanceTab);
document.getElementById('exportAttendanceBtn').addEventListener('click', exportAttendanceCSV);
document.getElementById('attendanceSettingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('settingsCancelBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsSaveBtn').addEventListener('click', saveSettingsForm);
document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'settingsOverlay') closeSettingsModal();
});
document.getElementById('scanStartBtn').addEventListener('click', startScanner);
document.getElementById('scanStopBtn').addEventListener('click', stopScanner);
document.getElementById('workplaceQrRegenBtn').addEventListener('click', regenerateWorkplaceQR);
document.getElementById('workplaceQrDownloadBtn').addEventListener('click', downloadWorkplaceQR);
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('employeesTab').classList.toggle('active', tab === 'employees');
    document.getElementById('attendanceTab').classList.toggle('active', tab === 'attendance');
    document.getElementById('scanTab').classList.toggle('active', tab === 'scan');
    document.getElementById('requestsTab').classList.toggle('active', tab === 'requests');
    if (tab === 'attendance') renderAttendanceTab();
    if (tab === 'requests') renderRequestsTab();
    if (tab === 'scan') {
      renderScanLog();
      setScanResult('idle', 'ស្កេនកូដ QR របស់បុគ្គលិកដើម្បីកត់ត្រាម៉ោងចូល ឬចេញ');
    } else {
      stopScanner();
    }
  });
});
document.getElementById('reqStatusFilter').addEventListener('change', renderRequestsTab);

document.getElementById('attendanceMonth').value = todayStr().slice(0, 7);
document.getElementById('adminSetupBtn').addEventListener('click', doAdminSetup);
document.getElementById('adminLoginBtn').addEventListener('click', doAdminLogin);
document.getElementById('adminLoginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });
document.getElementById('logoutBtn').addEventListener('click', doAdminLogout);
document.getElementById('changeAdminPwBtn').addEventListener('click', changeAdminPassword);

checkAdminAuthAndInit();
