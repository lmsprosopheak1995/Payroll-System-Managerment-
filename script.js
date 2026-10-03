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
let payrollItems = [];

// ==== Admin authentication gate ====
// ការចូលប្រើទំព័រនេះទាមទារពាក្យសម្ងាត់អ្នកគ្រប់គ្រង។ session ស្ថិតនៅក្នុង sessionStorage
// ប៉ុណ្ណោះ (ដូចទំព័របុគ្គលិក) ដូច្នេះនឹងត្រូវចូលគណនីម្ដងទៀតរាល់ពេលបើក tab/browser ថ្មី។
const ADMIN_SESSION_KEY = 'admin_portal_session';

function getAdminSession() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; }
function setAdminSession() { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); }
function clearAdminSession() { sessionStorage.removeItem(ADMIN_SESSION_KEY); }

function showAdminGate(view, errorMsg) {
  document.getElementById('adminGate').style.display = '';
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
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('mainContainer').style.display = '';
    Object.keys(loadFailures).forEach(k => delete loadFailures[k]);
    await Promise.all([loadData(), loadAttendance(), loadSettings(), loadLeaveRequests(), loadOvertimeRequests(), loadPayrollItems(), loadHolidays(), (typeof loadFeatureData === 'function' ? loadFeatureData() : null), (typeof loadPayrollClose === 'function' ? loadPayrollClose() : null)]);
    if (typeof loadAdvRulesRemote === 'function') await loadAdvRulesRemote();
    renderAll();
    if (typeof requestAdvanceSync === 'function') requestAdvanceSync(currentMonthlyMonth());
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
  const oldPw = await customPrompt('បញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន៖', true);
  if (oldPw === null) return;
  const newPw = await customPrompt('បញ្ចូលពាក្យសម្ងាត់ថ្មី (យ៉ាងតិច ៦ តួអក្សរ)៖', true);
  if (newPw === null) return;
  if (newPw.length < 6) { customAlert('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ'); return; }
  const confirmPw = await customPrompt('បញ្ជាក់ពាក្យសម្ងាត់ថ្មីម្ដងទៀត៖', true);
  if (newPw !== confirmPw) { customAlert('ពាក្យសម្ងាត់ថ្មីមិនដូចគ្នាទេ'); return; }
  const { data, error } = await supabaseClient.rpc('set_admin_password', { p_old_password: oldPw, p_new_password: newPw });
  if (error || !data) { customAlert('ប្តូរពាក្យសម្ងាត់មិនជោគជ័យ៖ ពាក្យសម្ងាត់បច្ចុប្បន្នប្រហែលមិនត្រឹមត្រូវ'); return; }
  customAlert('ប្តូរពាក្យសម្ងាត់ជោគជ័យ');
}

const DEFAULT_SETTINGS = {
  standardStart: '07:00',
  standardHours: 8,
  otMultiplier: 1.5,
  foodDaily: 2000,
  foodOT: 2000,
  workDaysPerMonth: 26,
  exchangeRate: 4100,
  workplaceCode: null,
  workplaceLat: null,
  workplaceLng: null,
  workplaceRadius: 100,
};

// ---- Workplace QR code (random code posted at the office entrance) ----
function generateWorkplaceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(16); crypto.getRandomValues(r);
  let s = 'WP-';
  for (let i = 0; i < 16; i++) s += chars[r[i] % chars.length];
  return s;
}
// ---- Avatar (រូប profile ឬអក្សរដំបូងនៃឈ្មោះ) ----
function avatarInner(e) {
  return e && e.photo
    ? `<img src="${e.photo}" alt="">`
    : escapeHtml(((e && e.name) || '?').trim().charAt(0).toUpperCase() || '?');
}
function avatarHtml(e, cls) {
  return `<span class="avatar ${cls || ''}">${avatarInner(e)}</span>`;
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
    photo: r.photo || '',
    idCard: r.id_card || '',
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
  if (e._photoDirty) row.photo = e.photo || null; // ផ្ញើ photo តែពេលមានការប្តូរ
  if (e._idCardDirty) row.id_card = e.idCard || null;
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
let idCardColumnAvailable = true; // false = ជួរ `id_card` មិនទាន់មាន (ដំណើរការ employees.sql)
let photoColumnAvailable = true; // false = ជួរ `photo` មិនទាន់មានក្នុងតារាង employees (ដំណើរការ employees.sql)
async function loadData() {
  const cols = 'id, name, position, dept, phone, email, start_date, salary, status, username, created_at';
  // ព្យាយាមទាញជួរបន្ថែម (photo, id_card) — បើមិនទាន់មានក្នុងតារាង ថយទៅជម្រើសតូចជាង
  const attempts = [[', photo, id_card', true, true], [', photo', true, false], ['', false, false]];
  let res = null;
  for (const [extra, hasPhoto, hasId] of attempts) {
    res = await supabaseClient.from('employees').select(cols + extra).order('created_at', { ascending: true });
    if (!res.error) { photoColumnAvailable = hasPhoto; idCardColumnAvailable = hasId; break; }
  }
  const { data, error } = res;
  if (error) {
    console.error('Load employees failed', error);
    customAlert('មិនអាចទាញយកទិន្នន័យបុគ្គលិកពី Supabase បានទេ៖ ' + error.message);
    pcLoadFail('បុគ្គលិក', error.message);
    employees = [];
    return;
  }
  employees = (data || []).map(rowToEmployee);
}

// ទាញទិន្នន័យគ្រប់ជួរ (PostgREST កំណត់ 1000 ជួរ/ស្នើ) — ត្រូវមាន order ច្បាស់លាស់ ទើប range មិនជាន់/ខ្វះជួរ
async function fetchAllRows(table, orders) {
  const out = [];
  for (let from = 0; from < 100000; from += 1000) {
    let q = supabaseClient.from(table).select('*');
    (orders || [{ col: 'id' }]).forEach(o => { q = q.order(o.col, { ascending: o.asc !== false }); });
    const { data, error } = await q.range(from, from + 999);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

async function loadAttendance() {
  const { data, error } = await fetchAllRows('attendance', [{ col: 'date' }, { col: 'employee_id' }]);
  if (error) {
    console.error('Load attendance failed', error);
    customAlert('មិនអាចទាញយកទិន្នន័យវត្តមានពី Supabase បានទេ៖ ' + error.message);
    pcLoadFail('វត្តមាន', error.message);
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
    pcLoadFail('ការកំណត់ (អត្រាប្តូរប្រាក់...)', error.message);
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
    workplaceLat: data.workplace_lat ?? null,
    workplaceLng: data.workplace_lng ?? null,
    workplaceRadius: data.workplace_radius ?? 100,
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
    customAlert('រក្សាទុកបុគ្គលិកលើ Supabase មិនជោគជ័យ៖ ' + error.message);
    return false;
  }
  return true;
}

async function deleteEmployeeRow(id) {
  const { error } = await supabaseClient.from('employees').delete().eq('id', id);
  if (error) {
    console.error('Delete employee failed', error);
    customAlert('លុបបុគ្គលិកលើ Supabase មិនជោគជ័យ៖ ' + error.message);
    return false;
  }
  return true;
}

async function upsertAttendanceRecord(date, empId, rec) {
  const { error } = await supabaseClient.from('attendance').upsert(attRecordToRow(date, empId, rec), { onConflict: 'date,employee_id' });
  if (error) {
    console.error('Save attendance failed', error);
    customAlert('រក្សាទុកវត្តមានលើ Supabase មិនជោគជ័យ៖ ' + error.message);
  }
}

let settingsGeoMissing = false; // true បើ column ទីតាំងមិនទាន់មានក្នុង Supabase
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
    workplace_lat: settings.workplaceLat,
    workplace_lng: settings.workplaceLng,
    workplace_radius: settings.workplaceRadius,
  };
  let { error } = await supabaseClient.from('app_settings').upsert(row, { onConflict: 'id' });
  settingsGeoMissing = false;
  if (error && /workplace_(lat|lng|radius)/.test(error.message)) {
    // column ទីតាំងមិនទាន់មាន — រក្សាទុកការកំណត់ផ្សេងៗសិន កុំឱ្យខូច
    const { workplace_lat, workplace_lng, workplace_radius, ...base } = row;
    ({ error } = await supabaseClient.from('app_settings').upsert(base, { onConflict: 'id' }));
    settingsGeoMissing = true;
  }
  if (error) {
    console.error('Save settings failed', error);
    customAlert('រក្សាទុកការកំណត់លើ Supabase មិនជោគជ័យ៖ ' + error.message);
    return false;
  }
  return true;
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
  sel.innerHTML = activeEmployees.map(e => `<option value="${e.id}">${e.username ? escapeHtml(e.username) + ' — ' : ''}${escapeHtml(e.name)}</option>`).join('');
  if (activeEmployees.some(e => e.id === currentVal)) {
    sel.value = currentVal;
  } else if (activeEmployees.length > 0) {
    sel.value = activeEmployees[0].id;
  }
  if (attLive) attLive.sync();
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ---- វេនការងារ (Shift) ----
const SHIFT = {
  otMealBlockHours: 2,   // ប្រាក់បាយ OT ផ្តល់ជូនរៀងរាល់ 2 ម៉ោង OT
  graceMinutes: 10,      // ការអនុគ្រោះស្កេនចូល៖ ស្កេនយឺតមិនលើស 10 នាទី គិតម៉ោងធម្មតាគ្រប់ (តែនៅតែកត់ថាយឺត)
  outGraceMinutes: 15,   // ការអនុគ្រោះស្កេនចេញ៖ ស្កេនចេញមុនម៉ោងកំណត់ មិនលើស 15 នាទី ចាត់ទុកថាទាន់ម៉ោង (គិតគ្រប់ម៉ោង, មិនចេញមុន)
  otAfterMinutes: 60,    // ស្កេនចេញយឺតជាង ម៉ោងចេញ +60 នាទី ទើបគិត OT (រាប់ចាប់ពីម៉ោងចេញ)
};
// វេនលំនាំដើម៖ ព្រឹក 07:00–11:00 · ថ្ងៃ 12:00–16:00
const DEFAULT_SHIFT = { id: 'default', name: 'វេនស្តង់ដារ', start: 7 * 60, breakOut: 11 * 60, breakIn: 12 * 60, end: 16 * 60 };

function shiftFromRow(r) {
  return { id: r.id, name: r.name, start: timeToMinutes(r.start_time), breakOut: timeToMinutes(r.break_out), breakIn: timeToMinutes(r.break_in), end: timeToMinutes(r.end_time) };
}
function shiftTotalMinutes(sh) {
  return Math.max(0, sh.breakOut - sh.start) + Math.max(0, sh.end - sh.breakIn);
}
// ម៉ោងចាប់ផ្តើមសម្រាប់កំណត់ថាយឺត (វេនលំនាំដើមប្រើ "ម៉ោងចូលស្តង់ដារ" ក្នុងការកំណត់)
function lateStartMinutes(sh) {
  if (sh.id === 'default') { const m = timeToMinutes(settings.standardStart); return m === null ? sh.start : m; }
  return sh.start;
}
let shifts = [];       // rows from table `shifts`
let shiftAssign = {};  // employee_id -> shift_id
function getEmpShift(empId) {
  const sid = shiftAssign[empId];
  const row = sid && shifts.find(x => x.id === sid);
  if (!row) return DEFAULT_SHIFT;
  const sh = shiftFromRow(row);
  return (sh.start === null || sh.breakOut === null || sh.breakIn === null || sh.end === null) ? DEFAULT_SHIFT : sh;
}

// គណនាម៉ោងធម្មតា និងម៉ោង OT (គិតជានាទី) ពីម៉ោងស្កេនជាក់ស្តែង តាមវេន
function computeWorkMinutes(checkin, checkout, breakOut, breakIn, shift) {
  shift = shift || DEFAULT_SHIFT;
  const shiftTotal = shiftTotalMinutes(shift);
  const rawIn = timeToMinutes(checkin);
  let rawOut = timeToMinutes(checkout);
  if (rawIn === null) return { normalMinutes: 0, otMinutes: 0, rawIn, shiftTotal };
  // មិនទាន់មានម៉ោងចេញ៖ បើមានស្កេនចេញសម្រាក (ព្រឹក) គិតតែម៉ោងព្រឹក (ឧ. 07:00–11:00 = 4 ម៉ោង)
  if (rawOut === null) {
    const boEarly = timeToMinutes(breakOut);
    if (boEarly === null) return { normalMinutes: 0, otMinutes: 0, rawIn, shiftTotal };
    const mIn = rawIn <= shift.start + SHIFT.graceMinutes ? shift.start : rawIn;
    const mOut = boEarly >= shift.breakOut - SHIFT.outGraceMinutes ? shift.breakOut : boEarly;
    return { normalMinutes: Math.max(0, mOut - mIn), otMinutes: 0, rawIn, shiftTotal };
  }
  if (rawOut < rawIn) rawOut += 24 * 60;

  // ព្រឹក៖ ស្កេនចូលមុនម៉ោងចូល → តម្រឹមមកម៉ោងចូល; ចេញសម្រាកក្រោយម៉ោងកំណត់ → គិតត្រឹមម៉ោងកំណត់
  const morningIn = rawIn <= shift.start + SHIFT.graceMinutes ? shift.start : Math.max(rawIn, shift.start);
  let morningOut = shift.breakOut;
  const bo = timeToMinutes(breakOut);
  if (bo !== null && bo < morningOut - SHIFT.outGraceMinutes) morningOut = bo;

  // រសៀល៖ ស្កេនចូលវិញមុនម៉ោងកំណត់ → តម្រឹមមកម៉ោងកំណត់
  let afternoonIn = shift.breakIn;
  const bi = timeToMinutes(breakIn);
  if (bi !== null && bi > afternoonIn + SHIFT.graceMinutes) afternoonIn = bi;
  afternoonIn = Math.max(afternoonIn, rawIn);
  const afternoonOut = rawOut >= shift.end - SHIFT.outGraceMinutes ? Math.min(Math.max(rawOut, shift.end), shift.end) : rawOut;

  const morningMinutes = Math.max(0, Math.min(morningOut, rawOut) - morningIn);
  const afternoonMinutes = Math.max(0, afternoonOut - afternoonIn);
  const normalMinutes = Math.min(morningMinutes + afternoonMinutes, shiftTotal);

  // OT៖ ស្កេនចេញក្នុង 1 ម៉ោងដំបូងក្រោយម៉ោងចេញ មិនគិត OT; បើលើសនោះ គិតពីម៉ោងចេញរហូតដល់ម៉ោងស្កេនចេញ
  const otMinutes = rawOut >= shift.end + SHIFT.otAfterMinutes ? Math.floor((rawOut - shift.end) / 60) * 60 : 0; // គិតជាម៉ោងពេញ (18:01 = 2 ម៉ោង)
  return { normalMinutes, otMinutes, rawIn, shiftTotal };
}

// ---- ថ្ងៃអាទិត្យ / ថ្ងៃបុណ្យ៖ ធ្វើការទទួលបានប្រាក់ឈ្នូល គុណ 2 ----
const HOLIDAY_MULTIPLIER = 2;
let holidays = {}; // { 'YYYY-MM-DD': 'ឈ្មោះថ្ងៃបុណ្យ' }
let holidaysAvailable = true;

function dayMultiplier(date) {
  if (!date) return 1;
  const isSunday = new Date(date + 'T00:00:00').getDay() === 0;
  return (isSunday || holidays[date] !== undefined) ? HOLIDAY_MULTIPLIER : 1;
}
function dayBadge(date) {
  const m = dayMultiplier(date);
  if (m <= 1) return '';
  const title = holidays[date] !== undefined ? (holidays[date] || 'ថ្ងៃបុណ្យ') : 'ថ្ងៃអាទិត្យ';
  return ` <span class="badge pending" title="${escapeHtml(title)}">×${m}</span>`;
}
async function loadHolidays() {
  const { data, error } = await supabaseClient.from('holidays').select('date, name');
  holidays = {};
  if (error) { console.warn('Load holidays failed (តារាង holidays មិនទាន់មាន?)', error.message); holidaysAvailable = false; return; }
  holidaysAvailable = true;
  (data || []).forEach(h => { holidays[h.date] = h.name || ''; });
}

// ---- គ្រប់គ្រងថ្ងៃបុណ្យ (Admin) ----
function renderHolidayBox() {
  const list = document.getElementById('holidayList');
  if (!list) return;
  const warn = document.getElementById('holidayWarn');
  if (!holidaysAvailable) {
    warn.style.display = 'block';
    warn.textContent = 'មិនទាន់មានតារាង "holidays" ក្នុង Supabase ទេ — សូមដំណើរការ SQL ក្នុងឯកសារ holidays.sql ជាមុនសិន។ (ថ្ងៃអាទិត្យ ×២ នៅតែដំណើរការធម្មតា)';
  } else {
    warn.style.display = 'none';
  }
  const dates = Object.keys(holidays).sort();
  list.innerHTML = dates.length === 0
    ? '<span class="scan-hint">មិនទាន់មានថ្ងៃបុណ្យទេ</span>'
    : dates.map(d => `<span class="badge active" style="display:inline-flex;gap:6px;align-items:center;">${d} ${escapeHtml(holidays[d] || '')} <a href="#" onclick="removeHoliday('${d}');return false;" style="color:var(--danger);text-decoration:none;">✕</a></span>`).join('');
}

async function addHoliday() {
  const date = document.getElementById('holidayDate').value;
  const name = document.getElementById('holidayName').value.trim();
  if (!date) { customAlert('សូមជ្រើសរើសថ្ងៃបុណ្យ'); return; }
  const { error } = await supabaseClient.from('holidays').upsert({ date, name }, { onConflict: 'date' });
  if (error) { customAlert('រក្សាទុកថ្ងៃបុណ្យមិនជោគជ័យ៖ ' + error.message + '\n(តើអ្នកបានដំណើរការ holidays.sql ហើយឬនៅ?)'); return; }
  holidays[date] = name; holidaysAvailable = true;
  document.getElementById('holidayName').value = '';
  renderHolidayBox(); renderAttendanceTab(); renderDeductTab();
}

async function removeHoliday(date) {
  if (!(await customConfirm(`លុបថ្ងៃបុណ្យ ${date} ?`))) return;
  const { error } = await supabaseClient.from('holidays').delete().eq('date', date);
  if (error) { customAlert('លុបមិនជោគជ័យ៖ ' + error.message); return; }
  delete holidays[date];
  renderHolidayBox(); renderAttendanceTab(); renderDeductTab();
}

function computeRow(emp, record, date) {
  const salary = parseFloat(emp.salary) || 0;
  const dailyRate = settings.workDaysPerMonth > 0 ? salary / settings.workDaysPerMonth : 0;
  const hourlyRate = settings.standardHours > 0 ? dailyRate / settings.standardHours : 0;

  const status = record?.status || '';
  const checkin = record?.checkin || '';
  const checkout = record?.checkout || '';
  const breakOut = record?.breakOut || '';
  const breakIn = record?.breakIn || '';
  let normalHours = 0, otHours = 0, late = false, fullDay = false;

  if (status === 'present' && checkin && (checkout || breakOut)) {
    const sh = getEmpShift(emp.id);
    const w = computeWorkMinutes(checkin, checkout, breakOut, breakIn, sh);
    normalHours = w.normalMinutes / 60;
    otHours = w.otMinutes / 60;
    fullDay = w.shiftTotal > 0 && w.normalMinutes >= w.shiftTotal;
    if (w.rawIn > lateStartMinutes(sh)) late = true; // ស្កេនចូលក្រោយម៉ោង = យឺត (ទោះគិតម៉ោងគ្រប់ក្នុងការអនុគ្រោះ 10 នាទី)
  }

  const round4 = n => Math.round(n * 10000) / 10000;
  const mult = dayMultiplier(date); // អាទិត្យ/បុណ្យ = ×2
  // ម៉ោងច្បាប់ (កន្លះថ្ងៃ/តាមម៉ោង) ដែលបង់ប្រាក់ — បូកជាមួយម៉ោងធ្វើការ មិនឱ្យលើសម៉ោងស្តង់ដារ
  const pl = emp && emp.id ? partialLeaveInfo(emp.id, date) : { paidHours: 0 };
  const leavePayHours = status === 'leave' ? 0 : Math.min(pl.paidHours, Math.max(0, settings.standardHours - normalHours));
  if (status === 'present' && leavePayHours > 0 && normalHours + leavePayHours >= settings.standardHours - 1e-9) fullDay = true;
  const normalPay = round4(status === 'leave' ? dailyRate : hourlyRate * mult * normalHours + hourlyRate * leavePayHours);
  const otPay = round4(hourlyRate * Math.max(settings.otMultiplier, mult) * otHours);
  // Food allowances are set and displayed in Riel; convert to USD only for the USD total.
  // ប្រាក់បាយធម្មតា៖ ត្រូវធ្វើការគ្រប់ 8 ម៉ោងទើបបាន (ច្បាប់ចាត់ទុកជាថ្ងៃពេញ)
  const foodPayRiel = (status === 'leave' || fullDay) ? settings.foodDaily : 0;
  // ប្រាក់បាយ OT៖ បន្ថែម foodOT រៀងរាល់ 2 ម៉ោង OT (OT 2ម៉ោង = 1 ដង, OT 4ម៉ោង = 2 ដង)
  const foodOtPayRiel = Math.floor(otHours / SHIFT.otMealBlockHours + 1e-9) * settings.foodOT;
  const exchangeRate = settings.exchangeRate > 0 ? settings.exchangeRate : 1;
  const foodPay = round4(foodPayRiel / exchangeRate);
  const foodOtPay = round4(foodOtPayRiel / exchangeRate);
  // Total is the sum of the already-rounded line items, matching a manual/paper total.
  const total = round4(normalPay + otPay + foodPay + foodOtPay);
  const riel = Math.round(total * settings.exchangeRate);

  return { status, checkin, checkout, breakOut, breakIn, late, normalHours, otHours, normalPay, otPay, foodPay, foodOtPay, foodPayRiel, foodOtPayRiel, total, riel, mult, leavePayHours };
}

const STATUS_LABELS = { present: 'មកធ្វើការ', absent: 'អវត្តមាន', leave: 'ច្បាប់', '': '-' };

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// USD monetary values are always shown to 4 decimal places (e.g. $8.0769).
function fmtUSD(n) {
  return (Math.round((n || 0) * 10000) / 10000).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// ប្រាក់ខែសុទ្ធ៖ បង្ហាញ 2 ខ្ទង់ ($281.06) និងបំបែកជា ដុល្លារពេញ + រៀលសល់ ($281 + 240 ៛)
function fmtUSD2(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSDplusRiel(usd) {
  const r = Math.round((usd || 0) * 100) / 100;
  const dollars = Math.floor(r + 1e-9);
  const rem = Math.round((r - dollars) * (settings.exchangeRate || 0));
  return `$${dollars.toLocaleString()} + ${Math.round(rem).toLocaleString()} ៛`;
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

  const daily = [];
  let totals = { total: 0, riel: 0, workDays: 0, lateDays: 0, otHours: 0, normalPay: 0, otPay: 0, foodPay: 0, foodRiel: 0, normalHours: 0 };

  tbody.innerHTML = dates.map(date => {
    const record = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, record, date);
    totals.total += r.total;
    totals.riel += r.riel;
    totals.normalPay += r.normalPay; totals.otPay += r.otPay; totals.foodPay += r.foodPay + r.foodOtPay;
    totals.foodRiel += r.foodPayRiel + r.foodOtPayRiel; totals.normalHours += r.normalHours;
    if (r.status === 'present') totals.workDays++;
    if (r.late) totals.lateDays++;
    totals.otHours += r.otHours;
    daily.push({ date, normal: r.normalHours, ot: r.otHours, status: r.status, late: r.late });
    const selVal = attStatusSelectValue(date, emp.id, r.status);
    const statusOptions = ['', 'present', 'absent', 'leave', 'leave_annual', 'leave_paid', 'leave_custom'].map(s =>
      `<option value="${s}" ${selVal === s ? 'selected' : ''}>${ATT_OPTION_LABELS[s]}</option>`
    ).join('');
    return `<tr>
      <td>${date}</td>
      <td>${weekdayLabel(date)}${dayBadge(date)}</td>
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

  const adj = getPayrollAdjustmentUSD(emp.id, month);
  const netUSD = totals.total + adj.net;
  const netRiel = netUSD * (settings.exchangeRate || 0);

  // បំបែក "តាមវត្តមាន" និង "អត្ថប្រយោជន៍/ប្រាក់កាត់" ឱ្យច្បាស់ + បង្ហាញឈ្មោះធាតុនីមួយៗ
  const sumT = summarizeEmpMonth(emp, month);
  const monthLocked = (typeof isMonthLocked === 'function') && isMonthLocked(month);
  const itemLines = (list, sign, color) => (list || []).map(p => {
    const tag = p.virtual ? '' : (p.recurrence === 'fixed' ? ' <small style="color:#9ca3af;">[ថេរ]</small>' : ' <small style="color:#9ca3af;">[ប្រែប្រួល]</small>');
    const del = (!monthLocked && !p.virtual && p.id) ? ` <button title="លុបធាតុនេះ" style="border:none;background:none;cursor:pointer;padding:0 2px;" onclick="deletePayrollItem('${String(p.id).replace(/'/g, '')}')">🗑</button>` : '';
    return `<div style="display:flex;justify-content:space-between;gap:16px;"><span>${sign} ${escapeHtml(p.name)}${tag}${del}</span><span style="color:${color};">${sign}$${fmtUSD(payrollItemToUSD(p))}</span></div>`;
  }).join('');
  const itemsHtml = itemLines(sumT.benefitItems, '+', '#16a34a') + itemLines(sumT.deductionItems, '−', '#dc2626');
  const lockHtml = monthLocked
    ? `<div style="margin-bottom:6px;padding:4px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:0.76rem;">🔒 ខែ ${month} បិទរួច — លេខមកពី Snapshot (ការលុប/កែធាតុមិនប៉ះពាល់ទេ លុះត្រាតែបើកខែឡើងវិញ)</div>`
    : '';

  const net2 = v => (Math.round((v || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // ប្រាក់ខែសុទ្ធ បង្ហាញត្រឹម 2 ខ្ទង់
  // ប្រាក់ខែសុទ្ធ បំបែកជា ដុល្លារពេញ + រៀលសល់ (ពី $ ដែលបានបង្គត់ 2 ខ្ទង់ × អត្រា) ឧ. $281.06 → $281 + 240 ៛
  const netR = Math.round((netUSD || 0) * 100) / 100;
  const netDollars = Math.floor(netR + 1e-9);
  const netRielRem = Math.round((netR - netDollars) * (settings.exchangeRate || 0));
  const netSplit = `$${netDollars.toLocaleString()} + ${fmtRiel(netRielRem)} ៛`;
  document.getElementById('attendanceStats').innerHTML = `
    <div class="stat-card"><div class="num">${totals.workDays}</div><div class="label">ថ្ងៃធ្វើការ</div></div>
    <div class="stat-card"><div class="num">${totals.lateDays}</div><div class="label">ថ្ងៃមកយឺត</div></div>
    <div class="stat-card"><div class="num">${fmtHours(totals.otHours)}</div><div class="label">ម៉ោងថែមសរុប (OT)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(totals.normalPay)}</div><div class="label">ប្រាក់ឈ្នួលថ្ងៃធម្មតា ($)<br>(${fmtHours(totals.normalHours)} ម៉ោង)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(totals.otPay)}</div><div class="label">ប្រាក់ថែមម៉ោង ($)<br>(${fmtHours(totals.otHours)} ម៉ោង)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(totals.foodPay)}</div><div class="label">ប្រាក់បាយ ($)<br>(${fmtRiel(totals.foodRiel)} ៛)</div></div>
    <div class="stat-card"><div class="num" style="color:#16a34a;">+$${fmtUSD(adj.benefits)}</div><div class="label">អត្ថប្រយោជន៍</div></div>
    <div class="stat-card"><div class="num" style="color:#dc2626;">−$${fmtUSD(adj.deductions)}</div><div class="label">ប្រាក់កាត់</div></div>
    <div class="stat-card"><div class="num">$${net2(netUSD)}</div><div class="label">ប្រាក់ខែសុទ្ធ ($)</div></div>
    <div class="stat-card"><div class="num">${netSplit}</div><div class="label">ប្រាក់ខែសុទ្ធ (ដុល្លារ + រៀល)</div></div>
  `;

  // ===== តំបន់ខាងស្តាំ/ក្រោមកាតស្ថិតិ៖ ប្រអប់បំបែក + មុខងារថ្មី 4 =====
  const cardCss = 'flex:1 1 300px;max-width:520px;font-size:0.82rem;background:var(--card-bg,#fff);border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;';
  const cardTitle = t => `<div style="font-weight:700;margin-bottom:6px;">${t}</div>`;
  const row = (label, val, color) => `<div style="display:flex;justify-content:space-between;gap:16px;"><span>${label}</span><span style="color:${color || 'inherit'};">${val}</span></div>`;

  // (0) ប្រអប់បំបែកលម្អិត (ដើម)
  const boxHtml = `<div style="${cardCss}">
      ${lockHtml}
      ${row('ប្រាក់ឈ្នួលថ្ងៃធម្មតា', '$' + fmtUSD(totals.normalPay))}
      ${row('ប្រាក់ថែមម៉ោង', '$' + fmtUSD(totals.otPay))}
      ${row('ប្រាក់បាយ', '$' + fmtUSD(totals.foodPay))}
      ${itemsHtml}
      <div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid #e5e7eb;margin-top:4px;padding-top:4px;font-weight:700;"><span>ប្រាក់ខែសុទ្ធ</span><span style="text-align:right;">$${net2(netUSD)}<br><span style="font-size:0.74rem;font-weight:500;color:var(--text-muted);">${netSplit}</span></span></div>
    </div>`;

  // (1) ប្រៀបធៀបខែមុន
  const prevMonth = monthsBack(month, 2)[1];
  const prevT = summarizeEmpMonth(emp, prevMonth);
  const cmpGrid = 'display:grid;grid-template-columns:minmax(80px,1.4fr) 1fr 1fr 1.2fr;column-gap:8px;row-gap:5px;font-size:0.78rem;align-items:baseline;';
  const cmpRow = (label, prev, cur, fmtFn, goodWhenUp) => {
    const d = (cur || 0) - (prev || 0);
    const color = Math.abs(d) < 1e-9 ? '#9ca3af' : ((d > 0) === goodWhenUp ? '#16a34a' : '#dc2626');
    const sign = d > 0 ? '▲ +' : (d < 0 ? '▼ −' : '= ');
    return `<div>${label}</div><div style="text-align:right;">${fmtFn(prev || 0)}</div><div style="text-align:right;">${fmtFn(cur || 0)}</div><div style="text-align:right;color:${color};white-space:nowrap;">${sign}${fmtFn(Math.abs(d))}</div>`;
  };
  const cmpHead = t => `<div style="text-align:right;color:var(--text-muted);">${t}</div>`;
  const cmpHtml = `<div style="${cardCss}">${cardTitle('📈 ប្រៀបធៀបខែមុន')}
    <div style="${cmpGrid}"><div></div>${cmpHead(prevMonth)}${cmpHead(month)}${cmpHead('ផ្លាស់ប្តូរ')}
    ${cmpRow('ថ្ងៃធ្វើការ', prevT.workDays, sumT.workDays, v => String(v), true)}
    ${cmpRow('ម៉ោង OT', prevT.otHours, sumT.otHours, fmtHours, true)}
    ${cmpRow('ប្រាក់ OT ($)', prevT.otPay, sumT.otPay, v => '$' + fmtUSD(v), true)}
    ${cmpRow('ប្រាក់ខែសុទ្ធ ($)', prevT.net, sumT.net, v => '$' + net2(v), true)}
    </div></div>`;

  // (2) សង្ខេបថ្ងៃ
  const cnt = { present: 0, leave: 0, absent: 0, late: 0 };
  daily.forEach(d => { if (d.status === 'present') cnt.present++; else if (d.status === 'leave') cnt.leave++; else if (d.status === 'absent') cnt.absent++; if (d.late) cnt.late++; });
  const today = todayStr();
  const unmarked = dates.filter(date => date <= today && date >= (emp.startDate || '0000-00-00') && dayMultiplier(date) <= 1 && !((attendance[date] && attendance[date][emp.id]) || {}).status);
  const chip = (label, n, color) => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 10px;border-radius:999px;background:${n ? color + '22' : '#f3f4f6'};color:${n ? color : '#9ca3af'};font-weight:600;">${label} ${n}</span>`;
  const daysHtml = `<div style="${cardCss}">${cardTitle('🗓 សង្ខេបថ្ងៃ')}
    ${chip('មកធ្វើការ', cnt.present, '#16a34a')}${chip('ច្បាប់', cnt.leave, '#d97706')}${chip('អវត្តមាន', cnt.absent, '#dc2626')}${chip('យឺត', cnt.late, '#d97706')}${chip('មិនទាន់កត់', unmarked.length, '#6b7280')}
    ${(() => { const lst = st => daily.filter(d => d.status === st).map(d => d.date.slice(8)).join(', '); const parts = []; if (cnt.absent) parts.push(`<span style="color:#dc2626;">អវត្តមាន៖ ថ្ងៃទី ${lst('absent')}</span>`); if (cnt.leave) parts.push(`<span style="color:#d97706;">ច្បាប់៖ ថ្ងៃទី ${lst('leave')}</span>`); return parts.length ? `<div style="margin-top:6px;">${parts.join(' · ')}</div>` : ''; })()}
    ${unmarked.length ? `<div style="margin-top:6px;color:#b45309;">⚠️ ថ្ងៃមិនទាន់កត់៖ ${unmarked.slice(0, 12).map(d => d.slice(8)).join(', ')}${unmarked.length > 12 ? ' …' : ''}</div>` : '<div style="margin-top:6px;color:#16a34a;">✓ កត់វត្តមានគ្រប់ថ្ងៃ</div>'}</div>`;

  // (3) ក្រាហ្វម៉ោងធ្វើការ/OT ប្រចាំថ្ងៃ
  const maxH = Math.max(settings.standardHours || 8, ...daily.map(d => d.normal + d.ot), 1);
  const chartHtml = `<div style="${cardCss}flex:1 1 100%;max-width:none;">${cardTitle('📊 ម៉ោងធ្វើការ / OT ប្រចាំថ្ងៃ <small style="font-weight:400;color:var(--text-muted);"><span style="color:#6366f1;">■</span> ធម្មតា &nbsp;<span style="color:#f59e0b;">■</span> OT</small>')}
    <div style="display:flex;align-items:flex-end;gap:3px;height:90px;">${daily.map(d => `<div title="${d.date} · ធម្មតា ${fmtHours(d.normal)} ម៉ោង · OT ${fmtHours(d.ot)} ម៉ោង" style="flex:1 1 0;min-width:0;height:100%;display:flex;flex-direction:column-reverse;">
      <div style="height:${d.normal / maxH * 100}%;background:#6366f1;border-radius:0 0 2px 2px;"></div><div style="height:${d.ot / maxH * 100}%;background:#f59e0b;border-radius:2px 2px 0 0;"></div></div>`).join('')}</div>
    <div style="display:flex;gap:3px;font-size:9px;color:var(--text-muted);">${daily.map(d => `<div style="flex:1 1 0;min-width:0;text-align:center;">${d.date.slice(8)}</div>`).join('')}</div></div>`;

  // (4) បន្ថែមអត្ថប្រយោជន៍/ប្រាក់កាត់ លឿន (ធាតុប្រែប្រួល ក្នុងខែនេះ)
  const qaIn = 'padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.8rem;';
  const quickHtml = monthLocked
    ? `<div style="${cardCss}">${cardTitle('➕ បន្ថែមអត្ថប្រយោជន៍/ប្រាក់កាត់')}<div style="color:#92400e;">🔒 ខែនេះបិទរួច — មិនអាចបន្ថែមបានទេ</div></div>`
    : `<div style="${cardCss}">${cardTitle('➕ បន្ថែមអត្ថប្រយោជន៍/ប្រាក់កាត់ <small style="font-weight:400;color:var(--text-muted);">(ខែ ' + month + ')</small>')}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <select id="qaType" style="${qaIn}"><option value="benefit">+ អត្ថប្រយោជន៍</option><option value="deduction">− ប្រាក់កាត់</option></select>
        <input id="qaName" placeholder="ឈ្មោះធាតុ" style="${qaIn}flex:1 1 120px;min-width:0;">
        <input id="qaAmount" type="number" step="0.01" min="0" placeholder="ចំនួន" style="${qaIn}width:90px;">
        <select id="qaCur" style="${qaIn}"><option value="USD">$</option><option value="KHR">៛</option></select>
        <button class="secondary" onclick="quickAddItem()">បន្ថែម</button>
      </div></div>`;

  let wrap = document.getElementById('attendanceExtras');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'attendanceExtras';
    const old = document.getElementById('attendanceBreakdown'); if (old) old.remove();
    document.getElementById('attendanceStats').insertAdjacentElement('afterend', wrap);
  }
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin:10px 0 14px;';
  wrap.innerHTML = boxHtml + cmpHtml + daysHtml + quickHtml + chartHtml;
}

// បន្ថែមធាតុ (ប្រែប្រួល) លឿនពីផ្ទាំងតារាងវត្តមាន — ប្រើដំណើរការដូច savePayrollItem
async function quickAddItem() {
  const empId = currentAttendanceEmployeeId();
  const month = currentAttendanceMonth();
  const name = (document.getElementById('qaName').value || '').trim();
  const amount = parseFloat(document.getElementById('qaAmount').value);
  if (!empId || !name || isNaN(amount) || amount < 0) { customAlert('សូមបំពេញឈ្មោះធាតុ និងទឹកប្រាក់ត្រឹមត្រូវ'); return; }
  if (guardLocked(month, 'បន្ថែមធាតុប្រាក់ខែ')) return;
  const item = { id: uid(), employeeId: empId, type: document.getElementById('qaType').value, name, recurrence: 'variable', month,
    currency: document.getElementById('qaCur').value, amount };
  payrollItems.push(item);
  renderAttendanceTab(); renderPayrollTab(); renderDeductTab();
  const saved = await upsertPayrollItemRow(item);
  if (!saved) { payrollItems = payrollItems.filter(x => x.id !== item.id); renderAttendanceTab(); renderPayrollTab(); renderDeductTab(); return; }
  logAudit('item_add', { entity: 'payroll_item', ref: item.id, month, employeeId: empId, old: null, new: { name: item.name, type: item.type, currency: item.currency, amount: item.amount } });
}

// ==== ជម្រើសច្បាប់ក្នុង dropdown ស្ថានភាពវត្តមាន ====
const ATT_PAID_TAG = '[ជ្រើសពីវត្តមាន]';
const ATT_OPTION_LABELS = { ...STATUS_LABELS, leave_annual: 'ច្បាប់ប្រចាំឆ្នាំ (បំណាច់ឆ្នាំ)', leave_paid: 'ច្បាប់មានប្រាក់ខែ (ពិសេស)', leave_custom: '➕ កន្លះថ្ងៃ / តាមម៉ោង / ប្រភេទផ្សេង…' };

function attStatusSelectValue(date, empId, status) {
  if (status !== 'leave') return status;
  const req = leaveRequests.find(r => r.employee_id === empId && r.status === 'approved' && r.start_date <= date && date <= r.end_date);
  if (req && req.leave_type === 'annual') return 'leave_annual';
  if (req && req.leave_type === 'paid') return 'leave_paid';
  return 'leave';
}

// សំណើច្បាប់ ១ថ្ងៃ ដែលបង្កើតពីការជ្រើសក្នុង dropdown (ឬពី "ជំនួសថ្ងៃឈប់") — អាចដកវិញបាន
function findDropdownLeaveReq(date, empId) {
  return leaveRequests.find(r => r.employee_id === empId && r.start_date === date && r.end_date === date
    && leaveUnitOf(r).unit === 'day'
    && ((r.reason || '').includes(SUBST_TAG) || (r.reason || '').includes(ATT_PAID_TAG)));
}
async function removeDropdownLeaveReq(date, empId) {
  const req = findDropdownLeaveReq(date, empId);
  if (!req) return;
  leaveRequests = leaveRequests.filter(r => r !== req);
  if (req.id && !String(req.id).startsWith('local_')) {
    const { error } = await supabaseClient.from('leave_requests').delete().eq('id', req.id);
    if (error) console.error('Remove leave request failed', error);
  }
}

async function setAttendanceLeaveType(date, empId, value) {
  await createDayLeave(date, empId, { type: value === 'leave_paid' ? 'paid' : 'annual', unit: 'day' });
}

// បង្កើតច្បាប់ក្នុងថ្ងៃមួយ៖ ប្រភេទ (annual/paid/sick/unpaid/other) × រយៈពេល (day/half/hour)
async function createDayLeave(date, empId, { type, unit, period, hours }) {
  const std = settings.standardHours > 0 ? settings.standardHours : 8;
  const weight = unit === 'day' ? 1 : unit === 'half' ? 0.5 : hours / std;
  const emp = employees.find(e => e.id === empId);
  const year = parseInt(date.slice(0, 4), 10);
  if (emp && (type === 'annual' || type === 'paid')) {
    const b = calcLeaveBalanceRow(emp, year, lbRules);
    const left = type === 'paid' ? b.paidRemaining : b.remaining;
    const covered = unit === 'day' && leaveRequests.some(r => r.employee_id === empId && r.status === 'approved' && r.leave_type === type && r.start_date <= date && date <= r.end_date && leaveUnitOf(r).unit === 'day');
    if (!covered && left < weight - 1e-9 && !(await customConfirm(`${LEAVE_TYPE_LABELS[type]}នៅសល់ ${left} ថ្ងៃ ប៉ុន្តែត្រូវការ ${round2(weight)} ថ្ងៃ។ នៅតែបន្ត (សមតុល្យនឹងអវិជ្ជមាន)?`))) { renderAttendanceTab(); return false; }
  }
  if (unit === 'day') await removeDropdownLeaveReq(date, empId);
  const tag = type === 'annual' ? SUBST_TAG : ATT_PAID_TAG;
  const reason = `${tag} ${LEAVE_TYPE_LABELS[type]} ${buildUnitTag(unit, period, hours)}`.trim();
  const { data, error } = await supabaseClient.from('leave_requests').insert({
    employee_id: empId, leave_type: type, start_date: date, end_date: date, reason, status: 'approved', decided_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) { customAlert('រក្សាទុកច្បាប់មិនជោគជ័យ៖ ' + error.message); renderAttendanceTab(); return false; }
  leaveRequests.unshift(data || { id: 'local_' + date + empId + Date.now(), employee_id: empId, leave_type: type, start_date: date, end_date: date, reason, status: 'approved' });
  const oldStatus = attendance[date] && attendance[date][empId] ? attendance[date][empId].status : '';
  if (unit === 'day') {
    const rec = { status: 'leave', checkin: '', checkout: '', breakOut: '', breakIn: '' };
    if (!attendance[date]) attendance[date] = {};
    attendance[date][empId] = rec;
    renderAttendanceTab();
    await upsertAttendanceRecord(date, empId, rec);
  } else {
    renderAttendanceTab();
  }
  logAudit('attendance_edit', { entity: 'attendance', ref: date, month: date.slice(0, 7), employeeId: empId, old: { field: 'status', value: oldStatus || '' }, new: { field: 'status', value: `leave:${type}:${unit}${unit === 'hour' ? hours : ''}` } });
  if (typeof renderLeaveBalanceTab === 'function') renderLeaveBalanceTab();
  return true;
}

let leCtx = null;
function closeLeaveEntryModal() { const el = document.getElementById('leaveEntryOverlay'); if (el) el.remove(); leCtx = null; }

function openLeaveEntryModal(date, empId) {
  closeLeaveEntryModal();
  leCtx = { date, empId };
  const std = settings.standardHours > 0 ? settings.standardHours : 8;
  const existing = leaveRequests.filter(r => r.employee_id === empId && r.status === 'approved' && r.start_date === date && r.end_date === date
    && leaveUnitOf(r).unit !== 'day' && ((r.reason || '').includes(SUBST_TAG) || (r.reason || '').includes(ATT_PAID_TAG)));
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay open';
  wrap.id = 'leaveEntryOverlay';
  wrap.innerHTML = `
    <div class="modal">
      <h2>📝 កត់ច្បាប់ — ${date}</h2>
      <div class="form-group">
        <label>ប្រភេទច្បាប់</label>
        <select id="leType">
          ${Object.keys(LEAVE_TYPE_LABELS).map(k => `<option value="${k}">${escapeHtml(LEAVE_TYPE_LABELS[k])}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>រយៈពេល</label>
        <select id="leUnit" onchange="document.getElementById('leHoursWrap').style.display = this.value === 'hour' ? '' : 'none'">
          <option value="day">ពេញមួយថ្ងៃ</option>
          <option value="half_am">កន្លះថ្ងៃ — ព្រឹក</option>
          <option value="half_pm">កន្លះថ្ងៃ — រសៀល</option>
          <option value="hour">តាមម៉ោង</option>
        </select>
      </div>
      <div class="form-group" id="leHoursWrap" style="display:none;">
        <label>ចំនួនម៉ោង (១ – ${std})</label>
        <input type="number" id="leHours" min="0.5" max="${std}" step="0.5" value="1" style="width:120px;">
      </div>
      <p class="scan-hint" style="margin-top:0;">ពេញថ្ងៃ៖ ប្តូរស្ថានភាពជា "ច្បាប់" ។ កន្លះថ្ងៃ/តាមម៉ោង៖ ទុកវត្តមានដដែល ហើយបូកម៉ោងច្បាប់ (${std / 2} ម៉ោង = កន្លះថ្ងៃ) ជាម៉ោងបង់ប្រាក់ លើកលែងប្រភេទ "គ្មានប្រាក់ខែ" ។ ច្បាប់ប្រចាំឆ្នាំដកតាមប្រភាគថ្ងៃ។</p>
      ${existing.length ? `<div style="margin:8px 0;font-size:0.8rem;"><strong>ច្បាប់មិនពេញថ្ងៃដែលបានកត់រួចក្នុងថ្ងៃនេះ៖</strong>${existing.map(r => `<div style="display:flex;gap:8px;align-items:center;padding:3px 0;">${escapeHtml(LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type)} — ${escapeHtml(leaveUnitLabel(r))} <button class="danger" onclick="removeLeaveEntry('${r.id}')">🗑</button></div>`).join('')}</div>` : ''}
      <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="secondary" onclick="closeLeaveEntryModal()">បោះបង់</button>
        <button onclick="applyLeaveEntry()">✓ កត់ច្បាប់</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function applyLeaveEntry() {
  if (!leCtx) return;
  const { date, empId } = leCtx;
  const type = document.getElementById('leType').value;
  const sel = document.getElementById('leUnit').value;
  const std = settings.standardHours > 0 ? settings.standardHours : 8;
  let unit = 'day', period = 'am', hours = 0;
  if (sel === 'half_am' || sel === 'half_pm') { unit = 'half'; period = sel === 'half_pm' ? 'pm' : 'am'; }
  if (sel === 'hour') {
    unit = 'hour'; hours = parseFloat(document.getElementById('leHours').value);
    if (!(hours > 0) || hours > std) { customAlert(`ចំនួនម៉ោងត្រូវនៅចន្លោះ 0 – ${std}`); return; }
  }
  if (guardLocked(date, 'កត់ច្បាប់')) return;
  closeLeaveEntryModal();
  await createDayLeave(date, empId, { type, unit, period, hours });
}

async function removeLeaveEntry(id) {
  const req = leaveRequests.find(r => String(r.id) === String(id));
  if (!req || guardLocked(req.start_date, 'ដកច្បាប់')) return;
  leaveRequests = leaveRequests.filter(r => r !== req);
  if (!String(req.id).startsWith('local_')) await supabaseClient.from('leave_requests').delete().eq('id', req.id);
  const { date, empId } = leCtx || {};
  closeLeaveEntryModal();
  if (date) openLeaveEntryModal(date, empId);
  renderAttendanceTab();
  renderLeaveBalanceTab();
}

function updateAttRecord(date, empId, field, value) {
  if (guardLocked(date, 'កែវត្តមាន')) { renderAttendanceTab(); return; }
  if (field === 'status' && value === 'leave_custom') { renderAttendanceTab(); openLeaveEntryModal(date, empId); return; }
  if (field === 'status' && (value === 'leave_annual' || value === 'leave_paid')) { setAttendanceLeaveType(date, empId, value); return; }
  if (field === 'status' && findDropdownLeaveReq(date, empId)) { removeDropdownLeaveReq(date, empId).then(() => renderLeaveBalanceTab()); }
  const oldVal = attendance[date] && attendance[date][empId] ? attendance[date][empId][field] : '';
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
  if ((oldVal || '') !== (value || '')) logAudit('attendance_edit', { entity: 'attendance', ref: date, month: date.slice(0, 7), employeeId: empId, old: { field, value: oldVal || '' }, new: { field, value: value || '' } });
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
    customAlert('មិនមានទិន្នន័យបុគ្គលិកទេ');
    return;
  }
  const empId = currentAttendanceEmployeeId();
  const emp = activeEmployees.find(e => e.id === empId) || activeEmployees[0];
  const month = currentAttendanceMonth();
  const dates = daysInMonth(month);
  const headers = ['ថ្ងៃទី', 'ថ្ងៃ', 'ចូល', 'ចេញអាហារ', 'ចូលអាហារវិញ', 'ចេញ', 'យឺត', 'ស្ថានភាព', 'ធម្មតា(ម៉ោង)', 'ប្រាក់ខែ($)', 'ថែមម៉ោង(ម៉ោង)', 'ប្រាក់ថែមម៉ោង($)', 'បាយថ្ងៃត្រង់(៛)', 'បាយថែមម៉ោង(៛)', 'សរុប($)', 'សរុប(៛)'];
  const rows = dates.map(date => {
    const record = (attendance[date] && attendance[date][emp.id]) || {};
    const r = computeRow(emp, record, date);
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

// ==== ឯកតាច្បាប់៖ ពេញថ្ងៃ / កន្លះថ្ងៃ (ព្រឹក|រសៀល) / តាមម៉ោង — កូដក្នុង reason ជា [#half:am] [#half:pm] [#hour:2] ====
function leaveUnitOf(req) {
  const m = ((req && req.reason) || '').match(/\[#(half|hour):([^\]]+)\]/);
  if (!m) return { unit: 'day' };
  if (m[1] === 'half') return { unit: 'half', period: m[2] === 'pm' ? 'pm' : 'am' };
  const h = parseFloat(m[2]);
  return { unit: 'hour', hours: h > 0 ? h : 0 };
}
function buildUnitTag(unit, period, hours) {
  if (unit === 'half') return `[#half:${period === 'pm' ? 'pm' : 'am'}]`;
  if (unit === 'hour') return `[#hour:${hours}]`;
  return '';
}
function stripUnitTag(reason) { return (reason || '').replace(/\s*\[#(half|hour):[^\]]+\]\s*/g, ' ').trim(); }
function leaveUnitLabel(req) {
  const u = leaveUnitOf(req);
  if (u.unit === 'half') return u.period === 'pm' ? 'កន្លះថ្ងៃ (រសៀល)' : 'កន្លះថ្ងៃ (ព្រឹក)';
  if (u.unit === 'hour') return `តាមម៉ោង (${u.hours} ម៉ោង)`;
  return 'ពេញថ្ងៃ';
}
function leaveWeightDays(req) {
  const u = leaveUnitOf(req);
  const std = settings.standardHours > 0 ? settings.standardHours : 8;
  if (u.unit === 'half') return 0.5;
  if (u.unit === 'hour') return Math.min(1, u.hours / std);
  return datesInRange(req.start_date, req.end_date).length;
}
// ច្បាប់មិនពេញថ្ងៃ (កន្លះថ្ងៃ/ម៉ោង) ដែលបានអនុម័ត ក្នុងថ្ងៃមួយ — ម៉ោងច្បាប់ត្រូវបង់ប្រាក់ លើកលែងប្រភេទ "គ្មានប្រាក់ខែ"
function partialLeaveInfo(empId, date) {
  const std = settings.standardHours > 0 ? settings.standardHours : 8;
  const out = { hours: 0, paidHours: 0, am: false, pm: false, hourly: false, items: [] };
  leaveRequests.forEach(r => {
    if (r.employee_id !== empId || r.status !== 'approved' || r.start_date > date || r.end_date < date) return;
    const u = leaveUnitOf(r);
    if (u.unit === 'day') return;
    const h = u.unit === 'half' ? std / 2 : Math.min(u.hours, std);
    out.hours += h;
    if (r.leave_type !== 'unpaid') out.paidHours += h;
    if (u.unit === 'half') { if (u.period === 'pm') out.pm = true; else out.am = true; } else out.hourly = true;
    out.items.push({ r, h });
  });
  return out;
}

const REQUEST_STATUS_LABELS = { pending: 'កំពុងរង់ចាំ', approved: 'អនុម័ត', rejected: 'បដិសេធ' };
const LEAVE_TYPE_LABELS = { annual: 'ច្បាប់ប្រចាំឆ្នាំ', paid: 'ច្បាប់មានប្រាក់ខែ (ពិសេស)', sick: 'ច្បាប់ឈឺ', unpaid: 'ច្បាប់គ្មានប្រាក់ខែ', other: 'ផ្សេងៗ' };

async function loadLeaveRequests() {
  const { data, error } = await fetchAllRows('leave_requests', [{ col: 'created_at', asc: false }, { col: 'id' }]);
  if (error) { console.error('Load leave requests failed', error); leaveRequests = []; return; }
  leaveRequests = data || [];
}

async function loadOvertimeRequests() {
  const { data, error } = await fetchAllRows('overtime_requests', [{ col: 'created_at', asc: false }, { col: 'id' }]);
  if (error) { console.error('Load overtime requests failed', error); overtimeRequests = []; return; }
  overtimeRequests = data || [];
}

// ==== Benefits / Deductions (payroll items) ====
async function loadPayrollItems() {
  const { data, error } = await fetchAllRows('payroll_items', [{ col: 'created_at', asc: false }, { col: 'id' }]);
  if (error) { console.error('Load payroll items failed', error); pcLoadFail('ធាតុប្រាក់ខែ', error.message); customAlert('មិនអាចទាញយកធាតុអត្ថប្រយោជន៍/ប្រាក់កាត់បានទេ៖ ' + error.message + '\nលេខប្រាក់ខែនឹងមិនត្រឹមត្រូវ — កុំព្រីន ឬបិទខែ រហូតដល់ដោះស្រាយ'); payrollItems = []; return; }
  payrollItems = (data || []).map(row => ({
    id: row.id,
    employeeId: row.employee_id,
    type: row.type,
    name: row.name,
    recurrence: row.recurrence,
    month: row.month || '',
    currency: row.currency,
    amount: parseFloat(row.amount) || 0,
  }));
}

async function upsertPayrollItemRow(item) {
  const row = {
    id: item.id,
    employee_id: item.employeeId,
    type: item.type,
    name: item.name,
    recurrence: item.recurrence,
    month: item.recurrence === 'variable' ? item.month : null,
    currency: item.currency,
    amount: item.amount,
  };
  const { data, error } = await supabaseClient.from('payroll_items').upsert(row, { onConflict: 'id' }).select().single();
  if (error) {
    console.error('Save payroll item failed', error);
    customAlert('រក្សាទុកធាតុមិនជោគជ័យ៖ ' + error.message);
    return null;
  }
  return data;
}

async function deletePayrollItemRow(id) {
  // .select() ដើម្បីដឹងថាមានជួរត្រូវបានលុបពិតប្រាកដ (RLS អាចលុប 0 ជួរដោយគ្មាន error)
  const { data, error } = await supabaseClient.from('payroll_items').delete().eq('id', id).select();
  if (error) { console.error('Delete payroll item failed', error); customAlert('លុបមិនជោគជ័យ៖ ' + error.message); return false; }
  if (!data || data.length === 0) {
    console.warn('Delete payroll item: 0 rows deleted', id);
    customAlert('⚠️ លុបមិនបានក្នុង Database (0 ជួរត្រូវបានលុប) — ទំនងជាគ្មានសិទ្ធិលុប (RLS) ឬធាតុនេះលែងមាន។ ធាតុនឹងលេចឡើងវិញពេលបើក app ម្តងទៀត។');
    return false;
  }
  return true;
}

// Amounts applicable to a given employee+month, converted to both currencies for display/summing.
function getPayrollItemsForEmpMonth(empId, month) {
  return payrollItems.filter(p => p.employeeId === empId && (p.recurrence === 'fixed' || p.month === month))
    .concat(advanceVirtualItems(empId, month));
}

function payrollItemToUSD(item) {
  return item.currency === 'USD' ? item.amount : (settings.exchangeRate > 0 ? item.amount / settings.exchangeRate : 0);
}

function payrollItemToRiel(item) {
  return item.currency === 'KHR' ? item.amount : item.amount * (settings.exchangeRate || 0);
}

function getPayrollAdjustmentUSD(empId, month) {
  const snap = (typeof getLockedSnapshot === 'function') ? getLockedSnapshot(empId, month) : null;
  if (snap) return { benefits: snap.benefitsUSD, deductions: snap.deductionsUSD, net: snap.benefitsUSD - snap.deductionsUSD };
  const items = getPayrollItemsForEmpMonth(empId, month);
  const benefits = items.filter(p => p.type === 'benefit').reduce((s, p) => s + payrollItemToUSD(p), 0);
  const deductions = items.filter(p => p.type === 'deduction').reduce((s, p) => s + payrollItemToUSD(p), 0);
  return { benefits, deductions, net: benefits - deductions };
}

function currentPayrollMonth() {
  const input = document.getElementById('payrollMonth');
  return (input && input.value) || todayStr().slice(0, 7);
}

function currentPayrollEmployeeId() {
  const sel = document.getElementById('payrollEmployeeSelect');
  return sel ? sel.value : '';
}

// ---- Live search (ប្រអប់ស្វែងរកភ្លាមៗ ជំនួស dropdown) ----
// <select> ដើមនៅតែរក្សាទុកតម្លៃ (លាក់) ដើម្បីកុំឲ្យកូដផ្សេងខូច; input នេះជាអ្នកគ្រប់គ្រងវា។
let attLive = null, payLive = null;

function employeeLabel(e) { return (e.username ? e.username + ' — ' : '') + e.name; }

function setupLiveSearch(inputId, selectId, onPick) {
  const input = document.getElementById(inputId);
  const sel = document.getElementById(selectId);
  const panel = input.parentNode.querySelector('.ls-panel');
  let items = [], active = -1, closeTimer = null;

  const selectedLabel = () => {
    const e = employees.find(x => x.id === sel.value);
    return e ? employeeLabel(e) : '';
  };
  function render(q) {
    items = employees.filter(e => e.status === 'active' && employeeMatchesSearch(e, q));
    active = items.findIndex(e => e.id === sel.value);
    if (active < 0) active = items.length ? 0 : -1;
    panel.innerHTML = items.length
      ? items.map((e, i) => `<div class="ls-item${i === active ? ' active' : ''}${e.id === sel.value ? ' current' : ''}" data-id="${escapeHtml(e.id)}"><span class="ls-id">${escapeHtml(e.username || '-')}</span><span class="ls-name">${escapeHtml(e.name)}</span></div>`).join('')
      : '<div class="ls-empty">រកមិនឃើញបុគ្គលិក</div>';
    panel.style.display = 'block';
    const el = panel.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
  function close() { panel.style.display = 'none'; }
  function pick(id) {
    sel.value = id;
    input.value = selectedLabel();
    close();
    input.blur();
    onPick();
  }

  input.addEventListener('focus', () => {
    clearTimeout(closeTimer);
    input.select();
    render('');
  });
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('blur', () => {
    // ពន្យារបន្តិច ដើម្បីឲ្យការចុចលើបញ្ជីដំណើរការមុន
    closeTimer = setTimeout(() => { close(); input.value = selectedLabel(); }, 150);
  });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (panel.style.display !== 'block') render(input.value);
      if (!items.length) return;
      active = ev.key === 'ArrowDown' ? (active + 1) % items.length : (active - 1 + items.length) % items.length;
      [...panel.querySelectorAll('.ls-item')].forEach((el, i) => el.classList.toggle('active', i === active));
      const el = panel.children[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (items[active]) pick(items[active].id);
    } else if (ev.key === 'Escape') {
      close(); input.blur();
    }
  });
  panel.addEventListener('click', ev => {
    const it = ev.target.closest('.ls-item');
    if (it) { clearTimeout(closeTimer); pick(it.dataset.id); }
  });

  return { sync() { if (document.activeElement !== input) input.value = selectedLabel(); } };
}

function employeeMatchesSearch(e, q) {
  q = (q || '').toLowerCase().trim();
  return !q || (e.name || '').toLowerCase().includes(q) || (e.username || '').toLowerCase().includes(q);
}

function renderPayrollEmployeeSelect() {
  const sel = document.getElementById('payrollEmployeeSelect');
  const activeEmployees = employees.filter(e => e.status === 'active');
  const currentVal = sel.value;
  sel.innerHTML = activeEmployees.map(e => `<option value="${e.id}">${e.username ? escapeHtml(e.username) + ' — ' : ''}${escapeHtml(e.name)}</option>`).join('');
  if (activeEmployees.some(e => e.id === currentVal)) {
    sel.value = currentVal;
  } else if (activeEmployees.length > 0) {
    sel.value = activeEmployees[0].id;
  }
  if (payLive) payLive.sync();
}

function fmtItemAmount(item) {
  return item.currency === 'USD' ? `$${item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ៛`;
}

function renderPayrollTab() {
  renderPayrollEmployeeSelect();
  const activeEmployees = employees.filter(e => e.status === 'active');
  const benefitBody = document.getElementById('benefitBody');
  const deductionBody = document.getElementById('deductionBody');
  const benefitEmpty = document.getElementById('benefitEmpty');
  const deductionEmpty = document.getElementById('deductionEmpty');

  if (activeEmployees.length === 0) {
    benefitBody.innerHTML = ''; deductionBody.innerHTML = '';
    benefitEmpty.style.display = 'block'; deductionEmpty.style.display = 'block';
    document.getElementById('payrollStats').innerHTML = '';
    return;
  }

  const empId = currentPayrollEmployeeId();
  const month = currentPayrollMonth();
  const items = payrollItems.filter(p => p.employeeId === empId);

  const renderRows = (list) => list.map(p => `
    <tr>
      <td style="text-align:left;">${escapeHtml(p.name)}</td>
      <td>${p.recurrence === 'fixed' ? '<span class="badge active">ថេរ</span>' : '<span class="badge pending">ប្រែប្រួល</span>'}</td>
      <td>${p.recurrence === 'variable' ? (p.month || '-') : 'រាល់ខែ'}</td>
      <td>${fmtItemAmount(p)}</td>
      <td>
        <div class="row-actions" style="justify-content:center;">
          <button class="secondary" onclick="openEditPayrollItemModal('${p.id}')">✏️ កែ</button>
          <button class="danger" onclick="deletePayrollItem('${p.id}')">🗑 លុប</button>
        </div>
      </td>
    </tr>`).join('');

  const benefits = items.filter(p => p.type === 'benefit');
  const deductions = items.filter(p => p.type === 'deduction');

  benefitBody.innerHTML = renderRows(benefits);
  benefitEmpty.style.display = benefits.length === 0 ? 'block' : 'none';
  deductionBody.innerHTML = renderRows(deductions);
  deductionEmpty.style.display = deductions.length === 0 ? 'block' : 'none';

  const adj = getPayrollAdjustmentUSD(empId, month);
  document.getElementById('payrollStats').innerHTML = `
    <div class="stat-card"><div class="num">$${fmtUSD(adj.benefits)}</div><div class="label">អត្ថប្រយោជន៍សរុប ($)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(adj.deductions)}</div><div class="label">ប្រាក់កាត់សរុប ($)</div></div>
    <div class="stat-card"><div class="num">${adj.net >= 0 ? '+' : ''}$${fmtUSD(adj.net)}</div><div class="label">សុទ្ធ (បូក/ដកលើប្រាក់ខែ)</div></div>
  `;

  renderAttendanceTab();
  renderPayrollHistory();
}

// ---- ប្រវត្តិបើកប្រាក់ខែ (Payroll payment history) ----
function monthsBack(endMonth, n) {
  const [y, m] = endMonth.split('-').map(Number);
  const arr = [];
  for (let i = 0; i < n; i++) {
    let mm = m - i, yy = y;
    while (mm <= 0) { mm += 12; yy--; }
    arr.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return arr;
}

function renderPayrollHistory() {
  const body = document.getElementById('payHistoryBody');
  const empty = document.getElementById('payHistoryEmpty');
  if (!body) return;
  const empId = currentPayrollEmployeeId();
  const emp = employees.find(e => e.id === empId);
  if (!emp) { body.innerHTML = ''; empty.style.display = 'block'; return; }

  const endMonth = currentPayrollMonth();
  const rangeSel = document.getElementById('payHistoryRange');
  const rangeVal = rangeSel ? rangeSel.value : '12';

  let months;
  if (rangeVal === 'all') {
    const startMonth = (emp.startDate || endMonth).slice(0, 7);
    let [ey, em] = endMonth.split('-').map(Number);
    const [sy, sm] = startMonth.split('-').map(Number);
    months = [];
    while ((ey > sy || (ey === sy && em >= sm)) && months.length < 60) {
      months.push(`${ey}-${String(em).padStart(2, '0')}`);
      em--; if (em <= 0) { em += 12; ey--; }
    }
  } else {
    months = monthsBack(endMonth, parseInt(rangeVal, 10) || 12);
  }

  if (months.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = months.map(month => {
    const t = summarizeEmpMonth(emp, month);
    return `<tr>
      <td>${month}</td>
      <td>${t.workDays}</td>
      <td>+$${fmtUSD(t.benefitsUSD)}</td>
      <td>−$${fmtUSD(t.deductionsUSD)}</td>
      <td><strong>$${fmtUSD(t.net)}</strong></td>
      <td>${fmtRiel(t.netRiel)} ៛</td>
      <td><button class="secondary" onclick="adminPrintPayslipMonth('${emp.id}','${month}')">🖨 Payslip</button></td>
    </tr>`;
  }).join('');
}

function adminPrintPayslipMonth(empId, month) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  if (typeof printPayslipFor === 'function') printPayslipFor(emp, month);
}

function openAddPayrollItemModal(type, forEmpId, forMonth) {
  if (forEmpId) {
    renderPayrollEmployeeSelect();
    document.getElementById('payrollEmployeeSelect').value = forEmpId;
    if (payLive) payLive.sync();
  }
  if (forMonth) document.getElementById('payrollMonth').value = forMonth;
  const empId = currentPayrollEmployeeId();
  if (!empId) { customAlert('សូមជ្រើសរើសបុគ្គលិកជាមុនសិន'); return; }
  document.getElementById('piId').value = '';
  document.getElementById('piType').value = type;
  document.getElementById('payrollItemModalTitle').textContent = type === 'benefit' ? 'បន្ថែមអត្ថប្រយោជន៍' : 'បន្ថែមប្រាក់កាត់';
  document.getElementById('piName').value = '';
  document.getElementById('piRecurrence').value = 'fixed';
  document.getElementById('piCurrency').value = 'USD';
  document.getElementById('piAmount').value = '';
  document.getElementById('piMonth').value = currentPayrollMonth();
  onPiRecurrenceChange();
  document.getElementById('payrollItemOverlay').classList.add('open');
  document.getElementById('piName').focus();
}

function openEditPayrollItemModal(id) {
  const p = payrollItems.find(x => x.id === id);
  if (!p) return;
  document.getElementById('piId').value = p.id;
  document.getElementById('piType').value = p.type;
  document.getElementById('payrollItemModalTitle').textContent = p.type === 'benefit' ? 'កែប្រែអត្ថប្រយោជន៍' : 'កែប្រែប្រាក់កាត់';
  document.getElementById('piName').value = p.name;
  document.getElementById('piRecurrence').value = p.recurrence;
  document.getElementById('piCurrency').value = p.currency;
  document.getElementById('piAmount').value = p.amount;
  document.getElementById('piMonth').value = p.month || currentPayrollMonth();
  onPiRecurrenceChange();
  document.getElementById('payrollItemOverlay').classList.add('open');
}

function onPiRecurrenceChange() {
  const isVariable = document.getElementById('piRecurrence').value === 'variable';
  document.getElementById('piMonthGroup').style.display = isVariable ? '' : 'none';
}

function closePayrollItemModal() {
  document.getElementById('payrollItemOverlay').classList.remove('open');
}

async function savePayrollItem() {
  const name = document.getElementById('piName').value.trim();
  const amount = parseFloat(document.getElementById('piAmount').value);
  if (!name || isNaN(amount) || amount < 0) {
    customAlert('សូមបំពេញឈ្មោះធាតុ និងទឹកប្រាក់ត្រឹមត្រូវ');
    return;
  }
  const recurrence = document.getElementById('piRecurrence').value;
  const month = document.getElementById('piMonth').value || currentPayrollMonth();
  if (recurrence === 'variable' && !month) {
    customAlert('សូមជ្រើសរើសខែសម្រាប់ធាតុប្រែប្រួល');
    return;
  }

  const id = document.getElementById('piId').value;
  if (recurrence === 'variable' && guardLocked(month, 'កែធាតុប្រាក់ខែ')) return;
  const prevItem = id ? payrollItems.find(x => x.id === id) : null;
  if (prevItem && prevItem.recurrence === 'variable' && guardLocked(prevItem.month, 'កែធាតុប្រាក់ខែ')) return;
  const item = {
    id: id || uid(),
    employeeId: currentPayrollEmployeeId(),
    type: document.getElementById('piType').value,
    name,
    recurrence,
    month: recurrence === 'variable' ? month : '',
    currency: document.getElementById('piCurrency').value,
    amount,
  };

  if (id) {
    const idx = payrollItems.findIndex(x => x.id === id);
    if (idx !== -1) payrollItems[idx] = item;
  } else {
    payrollItems.push(item);
  }
  closePayrollItemModal();
  renderPayrollTab();
  renderDeductTab();
  await upsertPayrollItemRow(item);
  const snapItem = x => x && ({ name: x.name, type: x.type, currency: x.currency, amount: x.amount });
  logAudit(prevItem ? 'item_edit' : 'item_add', { entity: 'payroll_item', ref: item.id, month: item.month || null, employeeId: item.employeeId, old: snapItem(prevItem), new: snapItem(item) });
}

async function deletePayrollItem(id) {
  const p = payrollItems.find(x => x.id === id);
  if (!p) return;
  if (p.recurrence === 'variable' && guardLocked(p.month, 'លុបធាតុប្រាក់ខែ')) return;
  if (!(await customConfirm(`តើអ្នកប្រាកដជាចង់លុប "${p.name}" មែនទេ?`))) return;
  payrollItems = payrollItems.filter(x => x.id !== id);
  logAudit('item_delete', { entity: 'payroll_item', ref: p.id, month: p.month || null, employeeId: p.employeeId, old: { name: p.name, type: p.type, currency: p.currency, amount: p.amount } });
  renderPayrollTab();
  renderDeductTab();
  const ok = await deletePayrollItemRow(id);
  if (!ok) { payrollItems.unshift(p); renderPayrollTab(); renderDeductTab(); renderAttendanceTab(); return; }
  renderAttendanceTab();
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
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); // ម៉ោងក្នុងស្រុក (មិនប្រើ toISOString ដែលប្តូរថ្ងៃក្នុង UTC+7)
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// សំណើពីបុគ្គលិក (ច្បាប់/OT/ពាក្យតវ៉ា) ត្រូវផ្ទុកឡើងវិញពី Supabase ព្រោះ admin ផ្ទុកតែម្តងពេលបើកកម្មវិធី
function requestsSignature() {
  const sig = a => a.map(r => `${r.id}:${r.status}`).join(',');
  return sig(leaveRequests) + '|' + sig(overtimeRequests) + '|' + (typeof payrollDisputes !== 'undefined' ? sig(payrollDisputes) : '');
}
let refreshingRequests = false;
async function refreshRequests(opts) {
  if (refreshingRequests) return;
  refreshingRequests = true;
  const before = requestsSignature();
  try {
    await Promise.all([loadLeaveRequests(), loadOvertimeRequests(), (typeof loadDisputesOnly === 'function' ? loadDisputesOnly() : null)]);
  } finally { refreshingRequests = false; }
  const changed = before !== requestsSignature();
  const active = document.getElementById('requestsTab') && document.getElementById('requestsTab').classList.contains('active');
  if (!(opts && opts.silent) || changed) {
    // ពេល polling: render ឡើងវិញតែបើមានអ្វីផ្លាស់ប្តូរ (កុំរំខានការងារ)
    if (active || !(opts && opts.silent)) renderRequestsTab();
    else { const b = document.getElementById('pendingReqBadge'); if (b) { const n = leaveRequests.filter(r => r.status === 'pending').length + overtimeRequests.filter(r => r.status === 'pending').length + pendingDisputeCount(); b.textContent = n > 0 ? `(${n})` : ''; } }
  }
}
setInterval(() => { if (!document.hidden && employees.length > 0) refreshRequests({ silent: true }); }, 60000);

function renderRequestsTab() {
  const filter = document.getElementById('reqStatusFilter').value;
  const leaveRows = leaveRequests.filter(r => !filter || r.status === filter);
  const otRows = overtimeRequests.filter(r => !filter || r.status === filter);
  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length + overtimeRequests.filter(r => r.status === 'pending').length + pendingDisputeCount();
  const badge = document.getElementById('pendingReqBadge');
  if (badge) badge.textContent = pendingCount > 0 ? `(${pendingCount})` : '';

  renderDisputeSection();
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
        <td>${escapeHtml(LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type)}<div style="font-size:0.68rem;color:var(--text-muted);">${escapeHtml(leaveUnitLabel(r))}</div></td>
        <td>${r.start_date}</td>
        <td>${r.end_date}</td>
        <td style="max-width:220px;white-space:normal;">${escapeHtml(stripUnitTag(r.reason) || '-')}</td>
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
  const lockedMonth = [...new Set(datesInRange(req.start_date, req.end_date).map(d => d.slice(0, 7)))].find(isMonthLocked);
  if (lockedMonth) { guardLocked(lockedMonth, 'អនុម័តច្បាប់ដែលប៉ះពាល់'); return; }
  if (req.leave_type === 'paid') {
    const emp = employees.find(e => e.id === req.employee_id);
    const year = parseInt(req.start_date.slice(0, 4), 10);
    const days = leaveWeightDays(req);
    const remaining = emp ? calcLeaveBalanceRow(emp, year, lbRules).paidRemaining : 0;
    if (days > remaining && !(await customConfirm(`ច្បាប់មានប្រាក់ខែនៅសល់ ${remaining} ថ្ងៃ ប៉ុន្តែសំណើនេះសុំ ${days} ថ្ងៃ។ នៅតែអនុម័ត?`))) return;
  }
  const { error } = await supabaseClient.from('leave_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { customAlert('អនុម័តមិនជោគជ័យ៖ ' + error.message); return; }
  // Mark each day in the approved range as 'leave' on the attendance sheet.
  const dates = datesInRange(req.start_date, req.end_date);
  const partial = leaveUnitOf(req).unit !== 'day'; // កន្លះថ្ងៃ/តាមម៉ោង៖ មិនកត់ជាថ្ងៃច្បាប់ពេញ ទុកវត្តមានដដែល
  for (const date of partial ? [] : dates) {
    const rec = { status: 'leave', checkin: '', checkout: '', breakOut: '', breakIn: '' };
    if (!attendance[date]) attendance[date] = {};
    attendance[date][req.employee_id] = rec;
    await upsertAttendanceRecord(date, req.employee_id, rec);
  }
  req.status = 'approved';
  logAudit('leave_approve', { entity: 'leave_request', ref: id, month: req.start_date.slice(0, 7), employeeId: req.employee_id, new: { from: req.start_date, to: req.end_date, days: dates.length } });
  renderAttendanceTab();
  renderRequestsTab();
  renderLeaveBalanceTab();
}

async function rejectLeaveRequest(id) {
  const note = (await customPrompt('មូលហេតុបដិសេធ (មិនចាំបាច់)៖')) || '';
  const { error } = await supabaseClient.from('leave_requests')
    .update({ status: 'rejected', admin_note: note, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { customAlert('បដិសេធមិនជោគជ័យ៖ ' + error.message); return; }
  const req = leaveRequests.find(r => r.id === id);
  if (req) { req.status = 'rejected'; req.admin_note = note; }
  renderRequestsTab();
}

// ==== ច្បាប់ប្រចាំឆ្នាំ — ប្រើអស់ / នៅសល់ (Annual Leave Balance) ====
const LB_RULES_KEY = 'leave_balance_rules_v1';
const LB_DEFAULTS = { annualQuotaDays: 18, prorate: true, paidQuotaDays: 7, carryOver: false, carryMaxDays: 5, carryFromYear: new Date().getFullYear() };

function loadLbRules() {
  try {
    const raw = localStorage.getItem(LB_RULES_KEY);
    if (raw) return { ...LB_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...LB_DEFAULTS };
}
function saveLbRules() {
  try { localStorage.setItem(LB_RULES_KEY, JSON.stringify(lbRules)); } catch (e) { /* ignore */ }
}
let lbRules = loadLbRules();

let lbSyncTimer = null;
// ផ្ញើកូតាទៅ Supabase (app_settings) ដើម្បីឱ្យផតថលបុគ្គលិកបង្ហាញលេខដូចគ្នា។ បើ column មិនទាន់មាន → រំលង (មិនបង្អាក់ការងារ)
function scheduleLbSync() {
  clearTimeout(lbSyncTimer);
  lbSyncTimer = setTimeout(async () => {
    const { error } = await supabaseClient.from('app_settings').update({
      annual_quota_days: lbRules.annualQuotaDays,
      annual_prorate: lbRules.prorate,
      paid_quota_days: lbRules.paidQuotaDays,
      annual_carry_enabled: lbRules.carryOver,
      annual_carry_max: lbRules.carryMaxDays,
      annual_carry_from: lbRules.carryFromYear,
    }).eq('id', 1);
    if (error) console.warn('Leave quota sync skipped (សូមបន្ថែម column ក្នុង app_settings):', error.message);
  }, 800);
}

function readLbControls() {
  lbRules.annualQuotaDays = parseFloat(document.getElementById('lbQuotaDays').value) || 0;
  lbRules.prorate = document.getElementById('lbProrate').checked;
  lbRules.paidQuotaDays = Math.max(0, parseFloat(document.getElementById('lbPaidQuota').value) || 0);
  lbRules.carryOver = document.getElementById('lbCarryOver').checked;
  lbRules.carryMaxDays = Math.max(0, parseFloat(document.getElementById('lbCarryMax').value) || 0);
  lbRules.carryFromYear = parseInt(document.getElementById('lbCarryFrom').value, 10) || new Date().getFullYear();
  saveLbRules();
  scheduleLbSync();
}
function initLbControls() {
  document.getElementById('lbQuotaDays').value = lbRules.annualQuotaDays;
  document.getElementById('lbProrate').checked = lbRules.prorate;
  document.getElementById('lbPaidQuota').value = lbRules.paidQuotaDays;
  document.getElementById('lbCarryOver').checked = !!lbRules.carryOver;
  document.getElementById('lbCarryMax').value = lbRules.carryMaxDays;
  document.getElementById('lbCarryFrom').value = lbRules.carryFromYear;
  document.getElementById('lbYear').value = todayStr().slice(0, 4);
}

// ចំនួនខែដែលបុគ្គលិកបានបម្រើការក្នុងឆ្នាំដែលបានជ្រើសរើស (0-12)
function annualLeaveMonthsInYear(emp, year) {
  if (!emp.startDate) return 12;
  const startYear = parseInt(emp.startDate.slice(0, 4), 10);
  const startMonth = parseInt(emp.startDate.slice(5, 7), 10);
  if (isNaN(startYear) || isNaN(startMonth)) return 12;
  if (startYear > year) return 0;
  if (startYear < year) return 12;
  return 13 - startMonth;
}

// ចំនួនថ្ងៃច្បាប់ (តាមប្រភេទ) ដែលបានអនុម័ត ហើយស្ថិតក្នុងឆ្នាំដែលបានជ្រើសរើស
function usedLeaveDays(empId, year, type) {
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
  return leaveRequests
    .filter(r => r.employee_id === empId && r.status === 'approved' && r.leave_type === type)
    .reduce((sum, r) => {
      if (leaveUnitOf(r).unit !== 'day') return (r.start_date >= yearStart && r.start_date <= yearEnd) ? sum + leaveWeightDays(r) : sum;
      const s = r.start_date < yearStart ? yearStart : r.start_date;
      const e = r.end_date > yearEnd ? yearEnd : r.end_date;
      if (s > e) return sum;
      return sum + datesInRange(s, e).length;
    }, 0);
}
function usedAnnualLeaveDays(empId, year) { return usedLeaveDays(empId, year, 'annual'); }

function annualBaseQuota(emp, year, rules) {
  const months = annualLeaveMonthsInYear(emp, year);
  if (months <= 0) return 0;
  return rules.prorate ? round2(rules.annualQuotaDays * months / 12) : rules.annualQuotaDays;
}

// ថ្ងៃច្បាប់ប្រចាំឆ្នាំដែលផ្ទេរមកពីឆ្នាំមុន (កំណត់ត្រឹម carryMaxDays; ចាប់ពីឆ្នាំ carryFromYear តែប៉ុណ្ណោះ)
function annualCarryIn(emp, year, rules, depth) {
  depth = depth || 0;
  if (!rules.carryOver || depth > 10) return 0;
  const prev = year - 1;
  if (prev < rules.carryFromYear) return 0;
  const startYear = parseInt((emp.startDate || '').slice(0, 4), 10);
  if (isNaN(startYear) || prev < startYear) return 0;
  const pool = annualBaseQuota(emp, prev, rules) + annualCarryIn(emp, prev, rules, depth + 1) - usedLeaveDays(emp.id, prev, 'annual');
  return Math.min(rules.carryMaxDays, Math.max(0, round2(pool)));
}

function calcLeaveBalanceRow(emp, year, rules) {
  const months = annualLeaveMonthsInYear(emp, year);
  const quota = annualBaseQuota(emp, year, rules);
  const carry = annualCarryIn(emp, year, rules);
  const used = usedLeaveDays(emp.id, year, 'annual');
  const remaining = round2(quota + carry - used);
  // នៅសល់ → ផ្ទេរទៅឆ្នាំក្រោយ (ក្នុងកំណត់) ឯលើសពីនោះ = បើកលុយជំនួស
  const carryOut = rules.carryOver ? Math.min(rules.carryMaxDays, Math.max(0, remaining)) : 0;
  const cashDays = round2(Math.max(0, remaining) - carryOut);
  const dailyRate = settings.workDaysPerMonth > 0 ? (parseFloat(emp.salary) || 0) / settings.workDaysPerMonth : 0;
  const cashAmount = round2(cashDays * dailyRate);
  // ច្បាប់មានប្រាក់ខែ (ពិសេស) — កូតាផ្ទាល់ខ្លួន មិនកាត់សមាមាត្រ
  const paidQuota = months > 0 ? rules.paidQuotaDays : 0;
  const paidUsed = usedLeaveDays(emp.id, year, 'paid');
  return {
    months, quota: round2(quota), carry, used, remaining, carryOut, cashDays, cashAmount,
    paidQuota, paidUsed, paidRemaining: round2(paidQuota - paidUsed),
  };
}

// ==== ប្រើបំណាច់ឆ្នាំ (ច្បាប់ប្រចាំឆ្នាំ) ជំនួសថ្ងៃឈប់ ដើម្បីកុំឱ្យដាច់លុយ ====
const SUBST_TAG = '[ជំនួសថ្ងៃឈប់]';

function absentDatesOf(empId, year) {
  return Object.keys(attendance)
    .filter(d => d.startsWith(String(year)) && attendance[d] && attendance[d][empId] && attendance[d][empId].status === 'absent')
    .sort();
}

let substCtx = null;
function closeSubstituteModal() {
  const el = document.getElementById('substOverlay');
  if (el) el.remove();
  substCtx = null;
}

function openSubstituteModal(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const year = parseInt(document.getElementById('lbYear').value, 10) || parseInt(todayStr().slice(0, 4), 10);
  const dates = absentDatesOf(empId, year);
  if (dates.length === 0) { customAlert('មិនមានថ្ងៃអវត្តមានក្នុងឆ្នាំនេះទេ'); return; }
  const r = calcLeaveBalanceRow(emp, year, lbRules);
  substCtx = { empId, year, remaining: r.remaining };
  closeSubstituteModal();
  substCtx = { empId, year, remaining: r.remaining };
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay open';
  wrap.id = 'substOverlay';
  wrap.innerHTML = `
    <div class="modal">
      <h2>🔁 ប្រើបំណាច់ឆ្នាំជំនួសថ្ងៃឈប់ — ${escapeHtml(emp.name)}</h2>
      <p class="scan-hint" style="margin-top:0;">ថ្ងៃអវត្តមានដែលបានជ្រើស នឹងប្តូរទៅជា "ច្បាប់ប្រចាំឆ្នាំ" (បង់ប្រាក់ពេញថ្ងៃ មិនដាច់លុយ) ហើយដកពីថ្ងៃច្បាប់ប្រចាំឆ្នាំដែលនៅសល់។ ថ្ងៃទាំងនេះមិនត្រូវកាត់ក្នុងផ្ទាំង "យឺត/ច្បាប់ → កាត់លុយ" ទេ។</p>
      <p style="margin:6px 0 10px;font-size:0.85rem;">ឆ្នាំ ${year} — ច្បាប់ប្រចាំឆ្នាំនៅសល់៖ <strong>${r.remaining.toFixed(1)} ថ្ងៃ</strong> · បានជ្រើស៖ <strong id="substCount">0</strong> ថ្ងៃ</p>
      <div style="max-height:260px;overflow:auto;border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:8px;">
        ${dates.map(d => `<label style="display:flex;gap:8px;align-items:center;padding:3px 0;font-size:0.85rem;"><input type="checkbox" class="subst-date" value="${d}"> ${d} <span style="color:var(--text-muted);">(${weekdayLabel(d)})</span></label>`).join('')}
      </div>
      <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="secondary" onclick="closeSubstituteModal()">បោះបង់</button>
        <button onclick="applySubstituteLeave()">✓ ប្រើជំនួស</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('.subst-date').forEach(c => c.addEventListener('change', () => {
    document.getElementById('substCount').textContent = wrap.querySelectorAll('.subst-date:checked').length;
  }));
}

async function applySubstituteLeave() {
  if (!substCtx) return;
  const { empId, remaining } = substCtx;
  const dates = [...document.querySelectorAll('#substOverlay .subst-date:checked')].map(c => c.value);
  if (dates.length === 0) { customAlert('សូមជ្រើសរើសថ្ងៃយ៉ាងហោចណាស់មួយ'); return; }
  const lockedMonth = [...new Set(dates.map(d => d.slice(0, 7)))].find(isMonthLocked);
  if (lockedMonth) { guardLocked(lockedMonth, 'ប្រើបំណាច់ជំនួសថ្ងៃឈប់'); return; }
  if (dates.length > remaining && !(await customConfirm(`ច្បាប់ប្រចាំឆ្នាំនៅសល់ ${remaining} ថ្ងៃ ប៉ុន្តែអ្នកជ្រើស ${dates.length} ថ្ងៃ។ នៅតែបន្ត (សមតុល្យនឹងអវិជ្ជមាន)?`))) return;
  let done = 0;
  for (const date of dates) {
    const { data, error } = await supabaseClient.from('leave_requests').insert({
      employee_id: empId, leave_type: 'annual', start_date: date, end_date: date,
      reason: `${SUBST_TAG} ប្រើបំណាច់ឆ្នាំជំនួសថ្ងៃអវត្តមាន`, status: 'approved', decided_at: new Date().toISOString(),
    }).select().maybeSingle();
    if (error) { customAlert('រក្សាទុកមិនជោគជ័យ៖ ' + error.message); break; }
    leaveRequests.unshift(data || { id: 'local_' + date, employee_id: empId, leave_type: 'annual', start_date: date, end_date: date, reason: `${SUBST_TAG} ប្រើបំណាច់ឆ្នាំជំនួសថ្ងៃអវត្តមាន`, status: 'approved' });
    const rec = { status: 'leave', checkin: '', checkout: '', breakOut: '', breakIn: '' };
    if (!attendance[date]) attendance[date] = {};
    attendance[date][empId] = rec;
    await upsertAttendanceRecord(date, empId, rec);
    logAudit('leave_approve', { entity: 'leave_request', ref: data ? data.id : date, month: date.slice(0, 7), employeeId: empId, new: { from: date, to: date, days: 1, note: 'substitute_absent' } });
    done++;
  }
  closeSubstituteModal();
  if (done) customAlert(`បានប្រើច្បាប់ប្រចាំឆ្នាំជំនួសថ្ងៃឈប់ ${done} ថ្ងៃ`);
  renderLeaveBalanceTab();
  renderAttendanceTab();
}

function leaveCashItemId(empId, year) { return `auto_leavecash_${empId}_${year}`; }

function renderLeaveBalanceTab() {
  const body = document.getElementById('lbBody');
  if (!body) return;
  const year = parseInt(document.getElementById('lbYear').value, 10) || parseInt(todayStr().slice(0, 4), 10);
  const search = document.getElementById('lbSearch').value.toLowerCase().trim();

  const rows = employees.filter(e => e.status === 'active')
    .filter(e => employeeMatchesSearch(e, search))
    .map(emp => ({ emp, r: calcLeaveBalanceRow(emp, year, lbRules) }));

  const sum = rows.reduce((a, { r }) => ({
    quota: a.quota + r.quota + r.carry, used: a.used + r.used, remaining: a.remaining + r.remaining,
    cash: a.cash + r.cashAmount, paidUsed: a.paidUsed + r.paidUsed,
  }), { quota: 0, used: 0, remaining: 0, cash: 0, paidUsed: 0 });

  document.getElementById('lbStats').innerHTML = `
    <div class="stat-card"><div class="num">${rows.length}</div><div class="label">បុគ្គលិកសកម្ម</div></div>
    <div class="stat-card"><div class="num">${sum.quota.toFixed(1)}</div><div class="label">កូតាសរុប + ផ្ទេរមក (ថ្ងៃ)</div></div>
    <div class="stat-card"><div class="num">${sum.used.toFixed(1)}</div><div class="label">ប្រើអស់សរុប (ថ្ងៃ)</div></div>
    <div class="stat-card"><div class="num">${sum.remaining.toFixed(1)}</div><div class="label">នៅសល់សរុប (ថ្ងៃ)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(sum.cash)}</div><div class="label">ត្រូវបើកជំនួសសរុប ($)</div></div>
    <div class="stat-card"><div class="num">${sum.paidUsed.toFixed(1)}</div><div class="label">ច្បាប់មានប្រាក់ខែ ប្រើសរុប (ថ្ងៃ)</div></div>`;

  const empty = document.getElementById('lbEmpty');
  if (rows.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const badge = v => v < 0 ? `<span class="badge inactive">${v.toFixed(1)}</span>` : `<strong>${v.toFixed(1)}</strong>`;
  body.innerHTML = rows.map(({ emp, r }) => {
    const existing = payrollItems.find(p => p.id === leaveCashItemId(emp.id, year));
    const absentCount = absentDatesOf(emp.id, year).length;
    let action = '-';
    if (r.cashAmount > 0 || existing) {
      if (existing && Math.abs(existing.amount - r.cashAmount) < 0.005) {
        action = `<span class="badge active">✓ បានបន្ថែមហើយ</span> <button class="danger" onclick="removeLeaveCashItem('${emp.id}')">🗑</button>`;
      } else if (r.cashAmount > 0) {
        action = `<button onclick="applyLeaveCashItem('${emp.id}')">${existing ? '🔄 អាប់ដេត' : '💵 បើកជំនួស'}</button>`;
      } else {
        action = `<button class="danger" onclick="removeLeaveCashItem('${emp.id}')">🗑 ដកចេញ</button>`;
      }
    }
    return `
    <tr>
      <td>${escapeHtml(emp.username || '-')}</td>
      <td>${escapeHtml(emp.name)}</td>
      <td>${emp.startDate || '-'}</td>
      <td>${r.quota.toFixed(1)}</td>
      <td>${r.carry ? r.carry.toFixed(1) : '-'}</td>
      <td>${r.used.toFixed(1)}</td>
      <td>${badge(r.remaining)}</td>
      <td>${r.carryOut ? r.carryOut.toFixed(1) : '-'}</td>
      <td>${r.cashDays ? r.cashDays.toFixed(1) : '-'}</td>
      <td>${r.cashAmount ? '$' + fmtUSD(r.cashAmount) : '-'}</td>
      <td>${r.paidQuota.toFixed(1)}</td>
      <td>${r.paidUsed.toFixed(1)}</td>
      <td>${badge(r.paidRemaining)}</td>
      <td>${absentCount ? `<span class="badge pending">${absentCount}</span>` : '-'}</td>
      <td><div class="row-actions" style="justify-content:center;flex-wrap:wrap;">${action}${absentCount ? ` <button class="secondary" onclick="openSubstituteModal('${emp.id}')">🔁 ជំនួសថ្ងៃឈប់</button>` : ''}</div></td>
    </tr>`;
  }).join('');
}

// បន្ថែមប្រាក់បើកជំនួសថ្ងៃច្បាប់ប្រចាំឆ្នាំដែលនៅសល់ ទៅ "អត្ថប្រយោជន៍" ក្នុងខែធ្នូ
async function applyLeaveCashItem(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const year = parseInt(document.getElementById('lbYear').value, 10) || parseInt(todayStr().slice(0, 4), 10);
  const month = `${year}-12`;
  if (guardLocked(month, 'បញ្ចូលប្រាក់បើកជំនួសថ្ងៃច្បាប់')) return;
  const r = calcLeaveBalanceRow(emp, year, lbRules);
  if (r.cashAmount <= 0) { customAlert('មិនមានថ្ងៃច្បាប់ត្រូវបើកជំនួសទេ'); return; }
  if (!(await customConfirm(`បន្ថែមប្រាក់បើកជំនួស ${r.cashDays} ថ្ងៃ ($${fmtUSD(r.cashAmount)}) ឲ្យ ${emp.name} ក្នុងខែ ${month}?`))) return;
  const item = {
    id: leaveCashItemId(empId, year), employeeId: empId, type: 'benefit',
    name: `បើកជំនួសថ្ងៃច្បាប់ ${year} (${r.cashDays} ថ្ងៃ)`,
    recurrence: 'variable', month, currency: 'USD', amount: r.cashAmount,
  };
  const idx = payrollItems.findIndex(x => x.id === item.id);
  const prevAmt = idx !== -1 ? payrollItems[idx].amount : null;
  if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
  await upsertPayrollItemRow(item);
  logAudit('leave_cash_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: empId, old: prevAmt === null ? null : { name: item.name, type: 'benefit', currency: 'USD', amount: prevAmt }, new: { name: item.name, type: 'benefit', currency: 'USD', amount: item.amount } });
  renderLeaveBalanceTab();
  renderPayrollTab();
}

async function removeLeaveCashItem(empId) {
  const year = parseInt(document.getElementById('lbYear').value, 10) || parseInt(todayStr().slice(0, 4), 10);
  const month = `${year}-12`;
  if (guardLocked(month, 'ដកប្រាក់បើកជំនួសថ្ងៃច្បាប់')) return;
  const id = leaveCashItemId(empId, year);
  const prevItem = payrollItems.find(x => x.id === id);
  payrollItems = payrollItems.filter(x => x.id !== id);
  await deletePayrollItemRow(id);
  if (prevItem) logAudit('leave_cash_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prevItem.name, type: 'benefit', currency: 'USD', amount: prevItem.amount } });
  renderLeaveBalanceTab();
  renderPayrollTab();
}

async function approveOTRequest(id) {
  const { error } = await supabaseClient.from('overtime_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { customAlert('អនុម័តមិនជោគជ័យ៖ ' + error.message); return; }
  const req = overtimeRequests.find(r => r.id === id);
  if (req) req.status = 'approved';
  renderRequestsTab();
}

async function rejectOTRequest(id) {
  const note = (await customPrompt('មូលហេតុបដិសេធ (មិនចាំបាច់)៖')) || '';
  const { error } = await supabaseClient.from('overtime_requests')
    .update({ status: 'rejected', admin_note: note, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) { customAlert('បដិសេធមិនជោគជ័យ៖ ' + error.message); return; }
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
    const matchesSearch = !search || [e.name, e.position, e.username, e.dept, e.phone].some(v => (v || '').toLowerCase().includes(search));
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
      <td>${avatarHtml(e)}</td>
      <td>${escapeHtml(e.username) || '-'}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.position)}</td>
      <td>${escapeHtml(e.dept)}</td>
      <td>${e.salary !== '' && e.salary !== null && e.salary !== undefined ? '$' + fmtUSD(parseFloat(e.salary) || 0) : '-'}</td>
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
  renderPayrollTab();
  renderMonthlyTab();
  renderScanLog();
  renderRequestsTab();
  renderWorkplaceQR();
  renderDeductTab();
  renderBonusTab();
  renderLeaveBalanceTab();
  renderHolidayBox();
  if (typeof renderFeatures === 'function') renderFeatures();
}

// ---- Workplace QR (បោះពុម្ព/បិទនៅច្រកចូល — កូដថេរ មិនប្តូរ) ----
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

let pendingPhoto; // undefined = មិនប្តូរ, '' = លុប, 'data:...' = រូបថ្មី

function setPhotoPreview(e) {
  const box = document.getElementById('empPhotoPreview');
  const src = pendingPhoto !== undefined ? pendingPhoto : (e && e.photo) || '';
  box.innerHTML = src ? `<img src="${src}" alt="">` : escapeHtml(((document.getElementById('empName').value || (e && e.name) || '?').trim().charAt(0) || '?').toUpperCase());
}

// កាត់រូបជាការ៉េ 256×256 ហើយបង្ហាប់ជា JPEG (ទំហំតូច រក្សាទុកក្នុងតារាង employees បានដោយផ្ទាល់)
function handlePhotoFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { customAlert('សូមជ្រើសរើសឯកសាររូបភាព'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      pendingPhoto = canvas.toDataURL('image/jpeg', 0.8);
      setPhotoPreview(editingId ? employees.find(x => x.id === editingId) : null);
    };
    img.onerror = () => customAlert('មិនអាចអានរូបភាពនេះបានទេ');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function setUsernameLock(locked) {
  const input = document.getElementById('empUsername');
  input.readOnly = locked;
  input.style.opacity = locked ? '0.7' : '';
  input.style.cursor = locked ? 'not-allowed' : '';
  document.getElementById('empUsernameRegenBtn').style.display = locked ? 'none' : '';
  const hint = document.getElementById('empUsernameHint');
  hint.textContent = locked
    ? '🔒 អត្តលេខមិនអាចកែប្រែបានទេ (ដោយសារបានបង្កើតរួចហើយ)'
    : '⚠️ អត្តលេខអាចកំណត់បានតែម្តង — បន្ទាប់ពីរក្សាទុក នឹងមិនអាចកែប្រែបានទេ';
}

function openAddModal() {
  editingId = null;
  pendingPhoto = undefined;
  document.getElementById('modalTitle').textContent = 'បន្ថែមបុគ្គលិកថ្មី';
  document.getElementById('empId').value = '';
  document.getElementById('empName').value = '';
  document.getElementById('empPosition').value = '';
  document.getElementById('empDept').value = '';
  document.getElementById('empPhone').value = '';
  document.getElementById('empIdCard').value = '';
  document.getElementById('empStartDate').value = '';
  document.getElementById('empSalary').value = '';
  document.getElementById('empStatus').value = 'active';
  document.getElementById('empUsername').value = generateEmployeeCode();
  setUsernameLock(false);
  document.getElementById('empPassword').value = '';
  setPhotoPreview(null);
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('empName').focus();
}

function openEditModal(id) {
  const e = employees.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  pendingPhoto = undefined;
  document.getElementById('modalTitle').textContent = 'កែប្រែព័ត៌មានបុគ្គលិក';
  document.getElementById('empId').value = e.id;
  document.getElementById('empName').value = e.name || '';
  document.getElementById('empPosition').value = e.position || '';
  document.getElementById('empDept').value = e.dept || '';
  document.getElementById('empPhone').value = e.phone || '';
  document.getElementById('empIdCard').value = e.idCard || '';
  document.getElementById('empStartDate').value = e.startDate || '';
  document.getElementById('empSalary').value = e.salary || '';
  document.getElementById('empStatus').value = e.status || 'active';
  document.getElementById('empUsername').value = e.username || '';
  setUsernameLock(!!e.username); // មានអត្តលេខរួចហើយ → ចាក់សោ
  document.getElementById('empPassword').value = '';
  setPhotoPreview(e);
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
    customAlert('សូមបំពេញព័ត៌មានចាំបាច់៖ ឈ្មោះ តួនាទី និងផ្នែក');
    return;
  }

  const passwordInput = document.getElementById('empPassword').value;
  const existingEmp = editingId ? employees.find(x => x.id === editingId) : null;
  // អត្តលេខ៖ បើមានរួចហើយ មិនអាចកែបានទេ (ប្រើតម្លៃដើមជានិច្ច ទោះបីកែ HTML ក៏ដោយ)
  const username = (existingEmp && existingEmp.username) ? existingEmp.username : document.getElementById('empUsername').value.trim();
  if (username && !(existingEmp && existingEmp.username)) {
    const dup = employees.find(x => x.id !== editingId && (x.username || '').toLowerCase() === username.toLowerCase());
    if (dup) { customAlert(`អត្តលេខ "${username}" ត្រូវបានប្រើដោយ "${dup.name}" រួចហើយ សូមប្រើអត្តលេខផ្សេង`); return; }
  }
  // ត្រូវការពាក្យសម្ងាត់ទាំងពេលបង្កើតគណនីថ្មី ទាំងពេលបន្ថែម username ដំបូងគេទៅឲ្យបុគ្គលិកចាស់
  // (មុននេះការត្រួតពិនិត្យអនុវត្តតែពេលបង្កើតថ្មី ធ្វើឲ្យអាចរក្សាទុក username ដោយគ្មានពាក្យសម្ងាត់ពេលកែប្រែ)
  const isFirstTimeUsername = username && (!existingEmp || !existingEmp.username);
  if (isFirstTimeUsername && passwordInput === '') {
    customAlert('សូមកំណត់ពាក្យសម្ងាត់សម្រាប់គណនីនេះ (គណនីនេះមិនទាន់មានពាក្យសម្ងាត់ទេ)');
    return;
  }

  const data = {
    name,
    position,
    dept,
    phone: document.getElementById('empPhone').value.trim(),
    startDate: document.getElementById('empStartDate').value,
    salary: document.getElementById('empSalary').value,
    status: document.getElementById('empStatus').value,
    username,
  };
  const idCard = document.getElementById('empIdCard').value.trim();
  if (idCard !== ((existingEmp && existingEmp.idCard) || '')) {
    if (!idCardColumnAvailable) { customAlert('មិនទាន់អាចរក្សាទុកអត្តសញ្ញាណប័ណ្ណបានទេ — សូមដំណើរការ employees.sql ក្នុង Supabase ជាមុនសិន (បន្ថែមជួរ និងសិទ្ធិ id_card)'); return; }
    data.idCard = idCard;
    data._idCardDirty = true;
  }
  if (pendingPhoto !== undefined) {
    if (!photoColumnAvailable) { customAlert('មិនទាន់អាចរក្សាទុករូបថតបានទេ — សូមដំណើរការ employees.sql ក្នុង Supabase ជាមុនសិន (បន្ថែមជួរ និងសិទ្ធិ photo)'); return; }
    data.photo = pendingPhoto;
    data._photoDirty = true;
  }

  const newSal = parseFloat(data.salary);
  const oldSal = existingEmp ? parseFloat(existingEmp.salary) : NaN;
  if (!(newSal > 0)) {
    if (!(await customConfirm('⚠️ ប្រាក់ខែមូលដ្ឋានទទេ ឬ $0 — ប្រាក់ខែនឹងត្រូវគណនាជា $0 ក្នុងគ្រប់ខែដែលមិនទាន់បិទ។ តើបន្តរក្សាទុកមែនទេ?'))) return;
  } else if (existingEmp && oldSal > 0 && Math.abs(newSal - oldSal) > 0.0001) {
    if (!(await customConfirm(`ប្តូរប្រាក់ខែមូលដ្ឋាន ${existingEmp.name}៖ $${fmtUSD(oldSal)} → $${fmtUSD(newSal)}\nប៉ះពាល់ខែដែលមិនទាន់បិទ — ខែដែលបានបិទមិនប្តូរទេ។ បន្ត?`))) return;
  }
  const prevEmp = existingEmp ? { ...existingEmp } : null;

  let savedEmp;
  if (editingId) {
    const idx = employees.findIndex(x => x.id === editingId);
    if (idx !== -1) employees[idx] = { ...employees[idx], ...data };
    savedEmp = employees[idx];
  } else {
    savedEmp = { id: uid(), ...data };
    employees.push(savedEmp);
  }

  renderAll();
  const saved = await upsertEmployee(savedEmp);
  if (!saved) { // រក្សាទុកមិនជោគជ័យ → ត្រឡប់តម្លៃដើមវិញ (កុំឲ្យបង្ហាញថាបានរក្សាទុក) ហើយទុកប្រអប់ឲ្យបើកដើម្បីព្យាយាមម្តងទៀត
    if (prevEmp) { const i = employees.findIndex(x => x.id === savedEmp.id); if (i !== -1) employees[i] = prevEmp; }
    else employees = employees.filter(x => x.id !== savedEmp.id);
    renderAll();
    return;
  }
  closeModal();
  delete savedEmp._photoDirty;
  delete savedEmp._idCardDirty;
  if (passwordInput) {
    const { error } = await supabaseClient.rpc('set_employee_password', {
      p_employee_id: savedEmp.id,
      p_password: passwordInput,
    });
    if (error) customAlert('រក្សាទុកព័ត៌មានបុគ្គលិកបានជោគជ័យ ប៉ុន្តែកំណត់ពាក្យសម្ងាត់មិនជោគជ័យ៖ ' + error.message);
  }
}

function employeeHasHistory(id) {
  if (Object.values(attendance).some(day => day && day[id])) return true;
  if (payrollItems.some(p => p.employeeId === id)) return true;
  return typeof pcEmployeeHasPayrollRecords === 'function' && pcEmployeeHasPayrollRecords(id);
}

async function deleteEmployee(id) {
  const e = employees.find(x => x.id === id);
  if (!e) return;
  if (employeeHasHistory(id)) {
    // មានប្រវត្តិវត្តមាន/ប្រាក់ខែ → មិនអនុញ្ញាតលុប (ការលុបនឹងបាត់ប្រាក់ខែចាស់ៗ) — ប្តូរទៅ "ឈប់បម្រើការ" ជំនួស
    if (e.status === 'inactive') { customAlert(`"${e.name}" មានប្រវត្តិវត្តមាន/ប្រាក់ខែ ដូច្នេះមិនអាចលុបបានទេ។ គាត់នៅរក្សាទុកជា "ឈប់បម្រើការ" ហើយ ប្រវត្តិប្រាក់ខែទាំងអស់នៅដដែល។`); return; }
    if (await customConfirm(`"${e.name}" មានប្រវត្តិវត្តមាន/ប្រាក់ខែ — មិនអាចលុបបានទេ ព្រោះនឹងបាត់ប្រាក់ខែចាស់ៗ។\n\nចង់ប្តូរទៅ "ឈប់បម្រើការ" ជំនួសទេ? ទិន្នន័យទាំងអស់នៅរក្សាទុក ហើយគាត់នៅមានក្នុងប្រាក់ខែខែដែលគាត់បានធ្វើការ។`)) {
      const prev = e.status;
      e.status = 'inactive';
      renderAll();
      if (!(await upsertEmployee(e))) { e.status = prev; renderAll(); }
    }
    return;
  }
  // គ្មានប្រវត្តិ (ឧ. បង្កើតខុស) → លុបបាន តែត្រូវវាយឈ្មោះបញ្ជាក់
  const typed = await customPrompt(`លុប "${e.name}" ជាអចិន្ត្រៃយ៍។ វាយឈ្មោះ "${e.name}" ដើម្បីបញ្ជាក់៖`);
  if (typed === null) return;
  if (typed.trim() !== e.name) { customAlert('ឈ្មោះមិនត្រូវគ្នា — មិនបានលុបទេ'); return; }
  const idx = employees.findIndex(x => x.id === id);
  employees = employees.filter(x => x.id !== id);
  renderAll();
  if (!(await deleteEmployeeRow(id))) { employees.splice(idx, 0, e); renderAll(); } // លុបមិនជោគជ័យ → ដាក់វិញ
}

function exportCSV() {
  if (employees.length === 0) {
    customAlert('មិនមានទិន្នន័យសម្រាប់នាំចេញទេ');
    return;
  }
  const headers = ['ឈ្មោះ', 'តួនាទី', 'ផ្នែក', 'ទូរស័ព្ទ', 'អត្តសញ្ញាណប័ណ្ណ', 'ថ្ងៃចូលធ្វើការ', 'ប្រាក់ខែ', 'ស្ថានភាព'];
  const rows = employees.map(e => [
    e.name, e.position, e.dept, e.phone || '', e.idCard || '', e.startDate || '', e.salary || '', e.status
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

// ជំហានស្កេនតាមលំដាប់ (ប្រើសម្រាប់កំណត់ថាតើត្រូវលុបត្រង់ field មួយណា)
const SCAN_STEPS = [
  { field: 'checkin', label: 'ម៉ោងចូល' },
  { field: 'breakOut', label: 'ចេញបាយ' },
  { field: 'breakIn', label: 'ចូលវិញ (ក្រោយបាយ)' },
  { field: 'checkout', label: 'ម៉ោងចេញ' },
];

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
      if (r.breakOut) parts.push(`ចេញបាយ ${r.breakOut}`);
      if (r.breakIn) parts.push(`ចូលវិញ ${r.breakIn}`);
      if (r.checkout) parts.push(`ចេញ ${r.checkout}`);
      return { empId: e.id, name: e.name, text: parts.join(' · '), lastTime: r.checkout || r.breakIn || r.breakOut || r.checkin };
    })
    .sort((a, b) => (b.lastTime || '').localeCompare(a.lastTime || ''));

  if (rows.length === 0) {
    logBox.innerHTML = '<div class="scan-log-empty">មិនទាន់មានការស្កេនថ្ងៃនេះទេ</div>';
    return;
  }
  logBox.innerHTML = rows.map(r => `
    <div class="scan-log-item">
      <span>${escapeHtml(r.name)}</span>
      <span class="scan-log-item-right">
        <span>${escapeHtml(r.text)}</span>
        <button class="scan-log-del" title="លុបការស្កេន" onclick="openScanDeleteModal('${r.empId}')">🗑</button>
      </span>
    </div>
  `).join('');
}

// អ្នកគ្រប់គ្រងចុច 🗑 លើឈ្មោះបុគ្គលិក — បើកបង្អួចឱ្យជ្រើសរើសថាតើម៉ោងស្កេនណាដែលខុសត្រូវលុប
function openScanDeleteModal(empId) {
  const date = todayStr();
  const dayRec = attendance[date] && attendance[date][empId];
  if (!dayRec) return;

  const filled = SCAN_STEPS.filter(step => dayRec[step.field]);
  if (filled.length === 0) return;

  const emp = employees.find(x => x.id === empId);
  document.getElementById('scanDeleteEmpName').textContent = emp ? emp.name : empId;

  const optionsBox = document.getElementById('scanDeleteOptions');
  optionsBox.innerHTML = filled.map(step => `
    <button class="danger" style="width:100%;text-align:left;" onclick="performScanDelete('${empId}','${step.field}')">
      🗑 ${step.label} — ${dayRec[step.field]}
    </button>
  `).join('');

  document.getElementById('scanDeleteOverlay').classList.add('open');
}

function closeScanDeleteModal() {
  document.getElementById('scanDeleteOverlay').classList.remove('open');
}

// ធ្វើការលុបម៉ោងស្កេនជាក់លាក់ណាមួយដែលអ្នកគ្រប់គ្រងបានជ្រើសរើស
async function performScanDelete(empId, field) {
  const date = todayStr();
  if (guardLocked(date, 'លុបការស្កេន')) { closeScanDeleteModal(); return; }
  const dayRec = attendance[date] && attendance[date][empId];
  if (!dayRec || !dayRec[field]) { closeScanDeleteModal(); return; }

  const step = SCAN_STEPS.find(s => s.field === field);
  const emp = employees.find(x => x.id === empId);
  const empName = emp ? emp.name : empId;
  if (!(await customConfirm(`តើអ្នកប្រាកដជាចង់លុបការស្កេន "${step.label}" (${dayRec[field]}) របស់ ${empName} ដែរឬទេ? បុគ្គលិកនឹងអាចស្កេនម្តងទៀតបានវិញ។`))) return;

  dayRec[field] = '';
  if (field === 'checkin') dayRec.status = ''; // ជំហានទីមួយ — ត្រឡប់ទៅដូចមិនទាន់ស្កេនអ្វីទាំងអស់

  closeScanDeleteModal();
  renderScanLog();
  renderAttendanceTab();
  upsertAttendanceRecord(date, empId, dayRec);
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
  if (isMonthLocked(date)) { setScanResult('error', `✕ ខែ ${date.slice(0, 7)} ត្រូវបានបិទហើយ — មិនអាចកត់ត្រាបានទេ`); return; }
  const time = nowTimeStr();
  if (!attendance[date]) attendance[date] = {};
  if (!attendance[date][empId]) attendance[date][empId] = { status: '', checkin: '', checkout: '', breakOut: '', breakIn: '' };
  const rec = attendance[date][empId];

  if (!rec.checkin) {
    rec.status = 'present';
    rec.checkin = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាម៉ោងចូល ${time}`);
  } else if (!rec.breakOut) {
    rec.breakOut = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាចេញបាយ ${time}`);
  } else if (!rec.breakIn) {
    rec.breakIn = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាចូលវិញ (ក្រោយបាយ) ${time}`);
  } else if (!rec.checkout) {
    rec.checkout = time;
    setScanResult('success', `✓ ${emp.name} — កត់ត្រាម៉ោងចេញ ${time}`);
  } else {
    setScanResult('info', `ℹ ${emp.name} បានស្កេនគ្រប់ជំហានរួចសម្រាប់ថ្ងៃនេះ (${rec.checkin} - ${rec.breakOut} - ${rec.breakIn} - ${rec.checkout})`);
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

// ==== យឺត / ច្បាប់ → កាត់លុយ ====
const DEDUCT_RULES_KEY = 'deduct_rules_v1';
const DEDUCT_DEFAULTS = { graceMinutes: 16, latePerDay: 0, latePerMin: 0, leaveTypes: ['annual', 'sick', 'unpaid', 'other'], leaveFood: false };

function loadDeductRules() {
  try {
    const raw = localStorage.getItem(DEDUCT_RULES_KEY);
    if (raw) return { ...DEDUCT_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEDUCT_DEFAULTS, leaveTypes: [...DEDUCT_DEFAULTS.leaveTypes] };
}
function saveDeductRules() {
  try { localStorage.setItem(DEDUCT_RULES_KEY, JSON.stringify(deductRules)); } catch (e) { /* ignore */ }
}
let deductRules = loadDeductRules();

function readDeductControls() {
  const g = parseFloat(document.getElementById('dedGrace').value);
  deductRules.graceMinutes = isNaN(g) ? 0 : Math.max(0, g);
  deductRules.latePerDay = parseFloat(document.getElementById('dedLatePerDay').value) || 0;
  deductRules.latePerMin = parseFloat(document.getElementById('dedLatePerMin').value) || 0;
  deductRules.leaveFood = document.getElementById('dedLeaveFood').checked;
  deductRules.leaveTypes = [...document.querySelectorAll('.ded-leave-type')].filter(c => c.checked).map(c => c.value);
  saveDeductRules();
}
function initDeductControls() {
  document.getElementById('dedGrace').value = deductRules.graceMinutes;
  document.getElementById('dedLatePerDay').value = deductRules.latePerDay;
  document.getElementById('dedLatePerMin').value = deductRules.latePerMin;
  document.getElementById('dedLeaveFood').checked = !!deductRules.leaveFood;
  document.querySelectorAll('.ded-leave-type').forEach(c => { c.checked = deductRules.leaveTypes.includes(c.value); });
  document.getElementById('dedMonth').value = todayStr().slice(0, 7);
}

function dedItemId(empId, month) { return `auto_ded_${empId}_${month}`; }

// គណនាថ្ងៃយឺត/ថ្ងៃច្បាប់ និងចំនួនប្រាក់ត្រូវកាត់សម្រាប់បុគ្គលិកម្នាក់ក្នុងមួយខែ
function calcDeductionRow(emp, month) {
  const salary = parseFloat(emp.salary) || 0;
  const dailyRate = settings.workDaysPerMonth > 0 ? salary / settings.workDaysPerMonth : 0;
  const exRate = settings.exchangeRate > 0 ? settings.exchangeRate : 1;
  const startMin = lateStartMinutes(getEmpShift(emp.id));
  const approved = leaveRequests.filter(r => r.employee_id === emp.id && r.status === 'approved');

  const shift = getEmpShift(emp.id);
  let lateDays = 0, lateMinutes = 0, earlyDays = 0, earlyMinutes = 0, violDays = 0, leaveDays = 0, deductibleLeaveDays = 0;
  const lateDates = [], leaveDates = [];

  const stdH = settings.standardHours > 0 ? settings.standardHours : 8;
  daysInMonth(month).forEach(date => {
    // ច្បាប់កន្លះថ្ងៃ/តាមម៉ោង៖ រាប់ជាថ្ងៃច្បាប់ប្រភាគ ហើយមិនចាត់ទុកជាយឺត/ចេញមុនក្នុងពេលច្បាប់
    const pl = partialLeaveInfo(emp.id, date);
    pl.items.forEach(({ r: rq, h }) => {
      const w = h / stdH;
      leaveDays += w;
      const isSubstP = (rq.reason || '').includes(SUBST_TAG);
      if (rq.leave_type !== 'unpaid' && deductRules.leaveTypes.includes(rq.leave_type) && !isSubstP) deductibleLeaveDays += w;
      leaveDates.push(`${date.slice(8)} (${LEAVE_TYPE_LABELS[rq.leave_type] || rq.leave_type} ${leaveUnitLabel(rq)})`);
    });
    const rec = attendance[date] && attendance[date][emp.id];
    if (!rec) return;
    if (rec.status === 'present') {
      let flagged = false;
      const inMin = timeToMinutes(rec.checkin);
      if (inMin !== null && startMin !== null && !(pl.am || pl.hourly)) {
        const m = inMin - startMin;
        if (m > 0) { lateDays++; lateMinutes += m; flagged = true; lateDates.push(`${date.slice(8)} (យឺត ${m}′)`); }
      }
      // ចេញមុនម៉ោង៖ ស្កេនចេញមុនម៉ោងចេញរបស់វេន
      const outMin = timeToMinutes(rec.checkout);
      if (outMin !== null && (inMin === null || outMin > inMin)) {
        const em = shift.end - outMin;
        if (em > SHIFT.outGraceMinutes && !(pl.pm || pl.hourly)) { earlyDays++; earlyMinutes += em; flagged = true; lateDates.push(`${date.slice(8)} (ចេញមុន ${em}′)`); }
      }
      if (flagged) violDays++;
    } else if (rec.status === 'leave') {
      const req = approved.find(r => r.start_date <= date && date <= r.end_date);
      const type = req && LEAVE_TYPE_LABELS[req.leave_type] ? req.leave_type : 'other';
      leaveDays++;
      const isSubst = !!(req && (req.reason || '').includes(SUBST_TAG)); // ជំនួសថ្ងៃឈប់ដោយបំណាច់ → មិនកាត់លុយ
      if (deductRules.leaveTypes.includes(type) && !isSubst) deductibleLeaveDays++;
      leaveDates.push(`${date.slice(8)} (${LEAVE_TYPE_LABELS[type]})`);
    }
  });

  const round4 = n => Math.round(n * 10000) / 10000;
  const perLeaveDay = dailyRate + (deductRules.leaveFood ? (settings.foodDaily || 0) / exRate : 0);
  // យឺត + ចេញមុន សរុបក្នុងមួយខែ៖ ក្នុងកំណត់ (graceMinutes) មិនកាត់; លើសពីនោះទើបកាត់
  const violMinutes = lateMinutes + earlyMinutes;
  const grace = deductRules.graceMinutes;
  const exceeded = violMinutes > grace;
  const excessMinutes = exceeded ? violMinutes - grace : 0;
  const lateDeduct = exceeded ? round4(violDays * deductRules.latePerDay + excessMinutes * deductRules.latePerMin) : 0;
  const leaveDeduct = round4(deductibleLeaveDays * perLeaveDay);
  return { lateDays, lateMinutes, earlyDays, earlyMinutes, violDays, violMinutes, grace, exceeded, excessMinutes, leaveDays, deductibleLeaveDays, lateDates, leaveDates, lateDeduct, leaveDeduct, total: round4(lateDeduct + leaveDeduct) };
}

function renderDeductTab() {
  const body = document.getElementById('dedBody');
  if (!body) return;
  const month = document.getElementById('dedMonth').value || todayStr().slice(0, 7);
  const search = document.getElementById('dedSearch').value.toLowerCase().trim();
  const filter = document.getElementById('dedFilter').value;

  let rows = employees.filter(e => e.status === 'active')
    .filter(e => employeeMatchesSearch(e, search))
    .map(e => ({ emp: e, r: calcDeductionRow(e, month) }))
    .filter(({ r }) => {
      if (search) return true; // ស្វែងរកជាក់លាក់ → បង្ហាញតែងតែ (អាចបន្ថែមអត្ថប្រយោជន៍ដល់អ្នកដែលមិនយឺត/មិនសុំច្បាប់)
      if (filter === 'late') return r.violDays > 0;
      if (filter === 'leave') return r.leaveDays > 0;
      if (filter === 'any') return r.violDays > 0 || r.leaveDays > 0;
      return true;
    });

  const sum = rows.reduce((a, { r }) => ({
    late: a.late + r.violDays, leave: a.leave + r.leaveDays, total: a.total + r.total,
  }), { late: 0, leave: 0, total: 0 });

  document.getElementById('dedStats').innerHTML = `
    <div class="stat-card"><div class="num">${rows.length}</div><div class="label">បុគ្គលិកក្នុងបញ្ជី</div></div>
    <div class="stat-card"><div class="num">${sum.late}</div><div class="label">ថ្ងៃយឺត/ចេញមុនសរុប</div></div>
    <div class="stat-card"><div class="num">${sum.leave}</div><div class="label">ថ្ងៃសុំច្បាប់សរុប</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(sum.total)}</div><div class="label">ប្រាក់ត្រូវកាត់សរុប ($)</div></div>
    <div class="stat-card"><div class="num">${fmtRiel(sum.total * (settings.exchangeRate || 0))} ៛</div><div class="label">ប្រាក់ត្រូវកាត់សរុប (រៀល)</div></div>`;

  const empty = document.getElementById('dedEmpty');
  if (rows.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = rows.map(({ emp, r }) => {
    const existing = payrollItems.find(p => p.id === dedItemId(emp.id, month));
    let action;
    if (r.total <= 0) action = existing ? `<button class="danger" onclick="removeDeductionItem('${emp.id}')">🗑 ដកចេញ</button>` : '-';
    else if (existing && Math.abs(existing.amount - r.total) < 0.00005) action = '<span class="badge active">✓ បានបន្ថែមហើយ</span>';
    else action = `<button onclick="applyDeductionItem('${emp.id}')">${existing ? '🔄 អាប់ដេត' : '➕ បន្ថែមប្រាក់កាត់'}</button>`;
    const detail = [r.lateDates.length ? 'យឺត/ចេញមុន៖ ' + r.lateDates.join(', ') : '', r.leaveDates.length ? 'ច្បាប់៖ ' + r.leaveDates.join(', ') : ''].filter(Boolean).join(' | ');
    return `<tr>
      <td>${escapeHtml(emp.username || '-')}</td>
      <td>${escapeHtml(emp.name)}</td>
      <td>${r.violDays ? `<span class="badge inactive">${r.violDays}</span>` : '-'}</td>
      <td>${r.violMinutes ? `${r.violMinutes} <small style="color:var(--text-muted);">(យឺត ${r.lateMinutes} + មុន ${r.earlyMinutes})</small><br>${r.exceeded ? `<span class="badge inactive">លើស ${r.excessMinutes} នាទី</span>` : `<span class="badge active">ក្នុងកំណត់ ${r.violMinutes}/${r.grace}</span>`}` : '-'}</td>
      <td>${r.leaveDays ? `<span class="badge pending">${r.leaveDays}</span>` : '-'}</td>
      <td>$${fmtUSD(r.lateDeduct)}</td>
      <td>$${fmtUSD(r.leaveDeduct)}</td>
      <td><strong>$${fmtUSD(r.total)}</strong></td>
      <td style="max-width:280px;white-space:normal;font-size:0.68rem;color:var(--text-muted);">${escapeHtml(detail) || '-'}</td>
      <td><div class="row-actions" style="flex-wrap:wrap;justify-content:center;">${action}
        <button class="secondary" onclick="openAddPayrollItemModal('benefit','${emp.id}','${month}')">🟢 អត្ថប្រយោជន៍</button>
        <button class="secondary" onclick="openAddPayrollItemModal('deduction','${emp.id}','${month}')">🔴 កាត់ផ្សេង</button></div></td>
    </tr>`;
  }).join('');
}

async function applyDeductionItem(empId, silent) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const month = document.getElementById('dedMonth').value || todayStr().slice(0, 7);
  if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'បញ្ចូលប្រាក់កាត់'); return; }
  const r = calcDeductionRow(emp, month);
  if (r.total <= 0) return;
  const item = {
    id: dedItemId(empId, month),
    employeeId: empId,
    type: 'deduction',
    name: `កាត់យឺត/ច្បាប់ ${month}`,
    recurrence: 'variable',
    month,
    currency: 'USD',
    amount: r.total,
  };
  const idx = payrollItems.findIndex(x => x.id === item.id);
  const prevAmt = idx !== -1 ? payrollItems[idx].amount : null;
  if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
  await upsertPayrollItemRow(item);
  if (prevAmt === null || Math.abs(prevAmt - item.amount) > 0.0001) logAudit('deduction_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: empId, old: prevAmt === null ? null : { name: item.name, type: 'deduction', currency: 'USD', amount: prevAmt }, new: { name: item.name, type: 'deduction', currency: 'USD', amount: item.amount } });
  if (!silent) { renderDeductTab(); renderPayrollTab(); }
}

async function removeDeductionItem(empId) {
  const month = document.getElementById('dedMonth').value || todayStr().slice(0, 7);
  if (guardLocked(month, 'ដកប្រាក់កាត់')) return;
  const id = dedItemId(empId, month);
  const prevItem = payrollItems.find(x => x.id === id);
  payrollItems = payrollItems.filter(x => x.id !== id);
  await deletePayrollItemRow(id);
  if (prevItem) logAudit('deduction_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prevItem.name, type: 'deduction', currency: 'USD', amount: prevItem.amount } });
  renderDeductTab();
  renderPayrollTab();
}

async function applyAllDeductions() {
  const month = document.getElementById('dedMonth').value || todayStr().slice(0, 7);
  if (guardLocked(month, 'បញ្ចូលប្រាក់កាត់')) return;
  const targets = employees.filter(e => e.status === 'active').filter(e => calcDeductionRow(e, month).total > 0);
  if (targets.length === 0) { customAlert('មិនមានប្រាក់ត្រូវកាត់ទេ (សូមពិនិត្យលក្ខខណ្ឌកាត់លុយ)'); return; }
  if (!(await customConfirm(`បន្ថែមប្រាក់កាត់សម្រាប់បុគ្គលិក ${targets.length} នាក់ ក្នុងខែ ${month}? (ធាតុដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`))) return;
  for (const e of targets) await applyDeductionItem(e.id, true);
  renderDeductTab();
  renderPayrollTab();
}

// ==== បំណាច់ឆ្នាំ (Year-end Bonus) ====
const BONUS_RULES_KEY = 'bonus_rules_v1';
const BONUS_DEFAULTS = { mode: 'days', flatAmount: 50, perYearAmount: 10, daysPerMonth: 1.5, minMonths: 0 };

function loadBonusRules() {
  try {
    const raw = localStorage.getItem(BONUS_RULES_KEY);
    if (raw) return { ...BONUS_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...BONUS_DEFAULTS };
}
function saveBonusRules() {
  try { localStorage.setItem(BONUS_RULES_KEY, JSON.stringify(bonusRules)); } catch (e) { /* ignore */ }
}
let bonusRules = loadBonusRules();

function readBonusControls() {
  bonusRules.mode = document.getElementById('bonusMode').value;
  bonusRules.flatAmount = parseFloat(document.getElementById('bonusFlatAmount').value) || 0;
  bonusRules.perYearAmount = parseFloat(document.getElementById('bonusPerYearAmount').value) || 0;
  bonusRules.daysPerMonth = parseFloat(document.getElementById('bonusDaysPerMonth').value) || 0;
  const mm = parseFloat(document.getElementById('bonusMinMonths').value);
  bonusRules.minMonths = isNaN(mm) ? 0 : Math.max(0, mm);
  saveBonusRules();
  onBonusModeChange();
}
function onBonusModeChange() {
  const mode = document.getElementById('bonusMode').value;
  document.getElementById('bonusFlatGroup').style.display = mode === 'flat' ? '' : 'none';
  document.getElementById('bonusPerYearGroup').style.display = mode === 'years' ? '' : 'none';
  document.getElementById('bonusDaysGroup').style.display = mode === 'days' ? '' : 'none';
}
function initBonusControls() {
  document.getElementById('bonusMode').value = bonusRules.mode;
  document.getElementById('bonusFlatAmount').value = bonusRules.flatAmount;
  document.getElementById('bonusPerYearAmount').value = bonusRules.perYearAmount;
  document.getElementById('bonusDaysPerMonth').value = bonusRules.daysPerMonth;
  document.getElementById('bonusMinMonths').value = bonusRules.minMonths;
  document.getElementById('bonusMonth').value = `${todayStr().slice(0, 4)}-12`;
  onBonusModeChange();
}

function bonusItemId(empId, month) { return `auto_bonus_${empId}_${month}`; }

const round2 = n => Math.round(n * 100) / 100;

// ចំនួនខែបម្រើការ គិតពីថ្ងៃចូលធ្វើការ ដល់ថ្ងៃចុងក្រោយនៃខែដែលបានជ្រើសរើស
function monthsOfService(startDateStr, asOfDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr + 'T00:00:00');
  const asOf = new Date(asOfDateStr + 'T00:00:00');
  if (isNaN(start) || isNaN(asOf) || asOf < start) return 0;
  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}

function calcBonusRow(emp, month, rules) {
  const monthDates = daysInMonth(month);
  const asOfDate = monthDates[monthDates.length - 1];
  const months = monthsOfService(emp.startDate, asOfDate);
  const years = months / 12;
  const eligible = rules.mode === 'manual' ? true : months >= rules.minMonths;
  const salary = parseFloat(emp.salary) || 0;
  const dailyRate = settings.workDaysPerMonth > 0 ? salary / settings.workDaysPerMonth : 0;
  let amount = 0;
  if (eligible) {
    if (rules.mode === 'flat') amount = rules.flatAmount;
    else if (rules.mode === 'years') amount = years * rules.perYearAmount;
    else if (rules.mode === 'days') amount = months * rules.daysPerMonth * dailyRate;
    else if (rules.mode === 'salary') amount = salary;
    // 'manual' → 0 (admin types the amount per employee)
  }
  return { months, years, eligible, amount: round2(amount) };
}

function renderBonusTab() {
  const body = document.getElementById('bonusBody');
  if (!body) return;
  const month = document.getElementById('bonusMonth').value || `${todayStr().slice(0, 4)}-12`;
  const search = document.getElementById('bonusSearch').value.toLowerCase().trim();
  const filter = document.getElementById('bonusFilter').value;
  const mode = bonusRules.mode;

  let rows = employees.filter(e => e.status === 'active')
    .filter(e => employeeMatchesSearch(e, search))
    .map(e => ({ emp: e, r: calcBonusRow(e, month, bonusRules) }))
    .filter(({ r }) => (search || filter === 'all') ? true : r.eligible);

  const existingAmount = (empId) => {
    const ex = payrollItems.find(p => p.id === bonusItemId(empId, month));
    return ex ? ex.amount : null;
  };

  const sum = rows.reduce((a, { r, emp }) => {
    const amt = mode === 'manual' ? (existingAmount(emp.id) || 0) : r.amount;
    return { count: a.count + (r.eligible ? 1 : 0), total: a.total + (r.eligible ? amt : 0) };
  }, { count: 0, total: 0 });

  document.getElementById('bonusStats').innerHTML = `
    <div class="stat-card"><div class="num">${sum.count}</div><div class="label">បុគ្គលិកមានសិទ្ធិ</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(sum.total)}</div><div class="label">ប្រាក់បំណាច់សរុប ($)</div></div>
    <div class="stat-card"><div class="num">${fmtRiel(sum.total * (settings.exchangeRate || 0))} ៛</div><div class="label">ប្រាក់បំណាច់សរុប (រៀល)</div></div>`;

  const empty = document.getElementById('bonusEmpty');
  if (rows.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = rows.map(({ emp, r }) => {
    const existing = payrollItems.find(p => p.id === bonusItemId(emp.id, month));
    const amountCell = mode === 'manual'
      ? `<input type="number" min="0" step="0.01" class="bonus-manual-amt" data-emp="${emp.id}" style="width:100px;" value="${existing ? existing.amount : ''}" placeholder="0.00">`
      : `$${fmtUSD(r.amount)}`;
    let action;
    if (!r.eligible) action = existing ? `<button class="danger" onclick="removeBonusItem('${emp.id}')">🗑 ដកចេញ</button>` : '-';
    else if (mode !== 'manual' && existing && Math.abs(existing.amount - r.amount) < 0.005) action = '<span class="badge active">✓ បានបន្ថែមហើយ</span>';
    else action = `<button onclick="applyBonusItem('${emp.id}')">${existing ? '🔄 អាប់ដេត' : '➕ បន្ថែម'}</button>`;
    return `<tr>
      <td>${escapeHtml(emp.username || '-')}</td>
      <td>${escapeHtml(emp.name)}</td>
      <td>${emp.startDate || '-'}</td>
      <td>${r.months} ខែ (${r.years.toFixed(1)} ឆ្នាំ)</td>
      <td>${r.eligible ? '<span class="badge active">មាន</span>' : '<span class="badge inactive">គ្មាន</span>'}</td>
      <td>${amountCell}</td>
      <td><div class="row-actions" style="justify-content:center;">${action}</div></td>
    </tr>`;
  }).join('');
}

async function applyBonusItem(empId, silent) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const month = document.getElementById('bonusMonth').value || `${todayStr().slice(0, 4)}-12`;
  if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'បញ្ចូលបំណាច់'); return; }
  const r = calcBonusRow(emp, month, bonusRules);
  if (!r.eligible) return;
  let amount = r.amount;
  if (bonusRules.mode === 'manual') {
    const input = document.querySelector(`.bonus-manual-amt[data-emp="${empId}"]`);
    amount = round2(parseFloat(input && input.value) || 0);
    if (amount <= 0) { if (!silent) customAlert('សូមវាយបញ្ចូលទឹកប្រាក់បំណាច់ឲ្យបុគ្គលិកនេះជាមុនសិន'); return; }
  }
  const item = {
    id: bonusItemId(empId, month),
    employeeId: empId,
    type: 'benefit',
    name: `បំណាច់ឆ្នាំ ${month.slice(0, 4)}`,
    recurrence: 'variable',
    month,
    currency: 'USD',
    amount,
  };
  const idx = payrollItems.findIndex(x => x.id === item.id);
  const prevAmt = idx !== -1 ? payrollItems[idx].amount : null;
  if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
  await upsertPayrollItemRow(item);
  if (prevAmt === null || Math.abs(prevAmt - item.amount) > 0.0001) logAudit('bonus_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: empId, old: prevAmt === null ? null : { name: item.name, type: 'benefit', currency: 'USD', amount: prevAmt }, new: { name: item.name, type: 'benefit', currency: 'USD', amount: item.amount } });
  if (!silent) { renderBonusTab(); renderPayrollTab(); }
}

async function removeBonusItem(empId) {
  const month = document.getElementById('bonusMonth').value || `${todayStr().slice(0, 4)}-12`;
  if (guardLocked(month, 'ដកបំណាច់')) return;
  const id = bonusItemId(empId, month);
  const prevItem = payrollItems.find(x => x.id === id);
  payrollItems = payrollItems.filter(x => x.id !== id);
  await deletePayrollItemRow(id);
  if (prevItem) logAudit('bonus_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prevItem.name, type: 'benefit', currency: 'USD', amount: prevItem.amount } });
  renderBonusTab();
  renderPayrollTab();
}

async function applyAllBonus() {
  const month = document.getElementById('bonusMonth').value || `${todayStr().slice(0, 4)}-12`;
  if (guardLocked(month, 'បញ្ចូលបំណាច់')) return;
  const targets = employees.filter(e => e.status === 'active').filter(e => calcBonusRow(e, month, bonusRules).eligible);
  if (targets.length === 0) { customAlert('មិនមានបុគ្គលិកមានសិទ្ធិទទួលបំណាច់ឆ្នាំទេ (សូមពិនិត្យលក្ខខណ្ឌ)'); return; }
  if (bonusRules.mode === 'manual') {
    const missing = targets.filter(e => {
      const input = document.querySelector(`.bonus-manual-amt[data-emp="${e.id}"]`);
      return !(parseFloat(input && input.value) > 0);
    });
    if (missing.length > 0) { customAlert(`សូមវាយបញ្ចូលទឹកប្រាក់ឲ្យបុគ្គលិកគ្រប់នាក់ជាមុនសិន (នៅខ្វះ ${missing.length} នាក់)`); return; }
  }
  if (!(await customConfirm(`បន្ថែមបំណាច់ឆ្នាំសម្រាប់បុគ្គលិក ${targets.length} នាក់ ក្នុងខែ ${month}? (ធាតុដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`))) return;
  for (const e of targets) await applyBonusItem(e.id, true);
  renderBonusTab();
  renderPayrollTab();
}

// ---- Employee QR code (for scanning) ----
document.getElementById('addBtn').addEventListener('click', openAddModal);
document.getElementById('empUsernameRegenBtn').addEventListener('click', () => {
  document.getElementById('empUsername').value = generateEmployeeCode();
});
document.getElementById('empPhotoPickBtn').addEventListener('click', () => document.getElementById('empPhotoInput').click());
document.getElementById('empPhotoInput').addEventListener('change', ev => { handlePhotoFile(ev.target.files[0]); ev.target.value = ''; });
document.getElementById('empPhotoClearBtn').addEventListener('click', () => { pendingPhoto = ''; setPhotoPreview(editingId ? { name: document.getElementById('empName').value } : null); });
document.getElementById('empName').addEventListener('input', () => {
  const cur = editingId ? employees.find(x => x.id === editingId) : null;
  const hasPhoto = pendingPhoto !== undefined ? !!pendingPhoto : !!(cur && cur.photo);
  if (!hasPhoto) setPhotoPreview(cur); // បង្ហាញអក្សរដំបូងនៃឈ្មោះ ពេលមិនទាន់មានរូប
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
attLive = setupLiveSearch('attendanceSearch', 'attendanceEmployeeSelect', renderAttendanceTab);
document.getElementById('attendanceMonth').addEventListener('change', renderAttendanceTab);
document.getElementById('payrollEmployeeSelect').addEventListener('change', renderPayrollTab);
document.getElementById('payrollMonth').addEventListener('change', renderPayrollTab);
document.getElementById('payHistoryRange').addEventListener('change', renderPayrollHistory);
document.getElementById('addBenefitBtn').addEventListener('click', () => openAddPayrollItemModal('benefit'));
document.getElementById('addDeductionBtn').addEventListener('click', () => openAddPayrollItemModal('deduction'));
document.getElementById('payrollItemOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'payrollItemOverlay') closePayrollItemModal();
});
document.getElementById('exportAttendanceBtn').addEventListener('click', exportAttendanceCSV);
document.getElementById('attendanceSettingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('settingsCancelBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsSaveBtn').addEventListener('click', saveSettingsForm);
document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'settingsOverlay') closeSettingsModal();
});
document.getElementById('scanDeleteOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'scanDeleteOverlay') closeScanDeleteModal();
});
document.getElementById('scanStartBtn').addEventListener('click', startScanner);
document.getElementById('scanStopBtn').addEventListener('click', stopScanner);
document.getElementById('workplaceQrDownloadBtn').addEventListener('click', downloadWorkplaceQR);
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('open');
  const bd = document.getElementById('sidebarBackdrop');
  if (bd) bd.classList.remove('show');
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const open = !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  document.getElementById('sidebarBackdrop').classList.toggle('show', open);
}


// ==== ប្រាក់ខែប្រចាំខែ (ទិដ្ឋភាពរួមបុគ្គលិកទាំងអស់) ====
function currentMonthlyMonth() {
  const el = document.getElementById('monthlyMonth');
  return (el && el.value) || todayStr().slice(0, 7);
}

function shiftMonthlyMonth(delta) {
  const [y, m] = currentMonthlyMonth().split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  document.getElementById('monthlyMonth').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderMonthlyTab();
}

// ថ្ងៃធម្មតា (មិនមែនអាទិត្យ/បុណ្យ) ដែលកន្លងទៅហើយ តែមិនទាន់មានស្ថានភាពវត្តមាន
function countUnmarkedDays(emp, month) {
  const today = todayStr();
  let n = 0;
  daysInMonth(month).forEach(date => {
    if (date > today || date < (emp.startDate || '0000-00-00')) return;
    if (dayMultiplier(date) > 1) return;
    const rec = (attendance[date] && attendance[date][emp.id]) || {};
    if (!rec.status) n++;
  });
  return n;
}

// ---- ប្រាក់ទី១ (ថ្ងៃទី២៥) — ត្រូវនឹងរូបមន្ត Excel: IF(ថ្ងៃធ្វើការ >= NETWORKDAYS.INTL(ថ្ងៃទី១, ថ្ងៃកំណត់, 11), 105, 0) ----
const ADV_RULES_KEY = 'advance_rules_v1';
const ADV_DEFAULTS = { amount: 105, countLeave: false, endDay: 15 };
function loadAdvRules() {
  return { ...ADV_DEFAULTS }; // តម្លៃពិតទាញពី Supabase (app_settings) តាម loadAdvRulesRemote()
}
let advRules = loadAdvRules();
function readAdvControls() {
  advRules.amount = Math.max(0, parseFloat(document.getElementById('advAmount').value) || 0);
  advRules.countLeave = document.getElementById('advCountLeave').checked;
  advRules.endDay = Math.min(28, Math.max(1, parseInt(document.getElementById('advEndDay').value, 10) || 15));
  if (typeof scheduleAdvRulesSave === 'function') scheduleAdvRulesSave(); // រក្សាទុកក្នុង Supabase
}

// ថ្ងៃកំណត់៖ ២៥ ប៉ុន្តែបើជាសៅរ៍ → ២៤, អាទិត្យ → ២៣ (ដូច IF(WEEKDAY(...)=7,24,IF(...=1,23,25)))
// បន្ថែម៖ បើជាថ្ងៃបុណ្យ (តារាង holidays) ក៏ថយក្រោយទៅថ្ងៃធ្វើការមុនគេដែរ (ឧ. ២៥ ជាថ្ងៃបុណ្យ → ២៤; បើ ២៤ ជាសៅរ៍ → ២៣...)
function advanceDateOf(month) {
  const [y, m] = month.split('-').map(Number);
  const ymd = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const isOff = dt => dt.getDay() === 0 || dt.getDay() === 6 || (typeof holidays !== 'undefined' && holidays[ymd(dt)] !== undefined);
  const d = new Date(y, m - 1, 25, 12); // 12:00 ដើម្បីជៀសវាងបញ្ហា DST
  for (let i = 0; i < 14 && isOff(d); i++) d.setDate(d.getDate() - 1);
  return ymd(d);
}

function calcAdvanceRow(emp, month) {
  const dueDate = advanceDateOf(month); // ថ្ងៃទូទាត់ (២៥ / ២៤ / ២៣)
  const [y, m] = month.split('-');
  const endDate = `${y}-${m}-${String(advRules.endDay).padStart(2, '0')}`;
  const upTo = daysInMonth(month).filter(d => d <= endDate);
  // NETWORKDAYS.INTL(..., 11) = រាប់គ្រប់ថ្ងៃ លើកលែងថ្ងៃអាទិត្យ
  const requiredDays = upTo.filter(d => new Date(d + 'T00:00:00').getDay() !== 0).length;
  let workedDays = 0;
  upTo.forEach(d => {
    const st = ((attendance[d] && attendance[d][emp.id]) || {}).status;
    if (st === 'present' || (advRules.countLeave && st === 'leave')) workedDays++;
  });
  const eligible = workedDays >= requiredDays && requiredDays > 0;
  const amount = eligible ? advRules.amount : 0;
  const due = todayStr() >= dueDate; // ដកពីប្រាក់ខែ តែនៅពេលដល់ថ្ងៃទូទាត់ប៉ុណ្ណោះ
  return { advanceDate: dueDate, dueDate, endDate, requiredDays, workedDays, eligible, amount, due };
}

// ប្រាក់ខែទី១ ជាធាតុ "ប្រាក់កាត់" និម្មិត (មិនរក្សាទុកក្នុង DB) — ចូលទៅក្នុងប្រាក់ខែសុទ្ធ និង Payslip ដោយស្វ័យប្រវត្តិ
function advanceVirtualItems(empId, month) {
  try {
    const emp = employees.find(e => e.id === empId);
    if (!emp || advRules.amount <= 0) return [];
    if (payrollItems.some(p => p.id === `auto_adv_${empId}_${month}`)) return []; // មានក្នុង DB រួច → កុំស្ទួន
    const a = calcAdvanceRow(emp, month);
    if (!a.eligible || !a.due) return [];
    return [{ id: `adv_${empId}_${month}`, employeeId: empId, type: 'deduction', name: `ប្រាក់ខែទី១ (បានទទួល ${a.dueDate})`,
      recurrence: 'variable', month, currency: 'USD', amount: a.amount, virtual: true }];
  } catch (e) { return []; }
}

function monthlyRows(month) {
  const q = (document.getElementById('monthlySearch')?.value || '').trim().toLowerCase();
  return payrollEmployeesForMonth(month)
    .filter(e => !q || (typeof employeeMatchesSearch === 'function' ? employeeMatchesSearch(e, q) : ((e.name || '') + (e.username || '')).toLowerCase().includes(q)))
    .sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''))
    .map(e => {
      const t = summarizeEmpMonth(e, month);
      const dedAuto = calcDeductionRow(e, month).total;
      const applied = payrollItems.find(p => p.id === dedItemId(e.id, month));
      const pendingDed = dedAuto > 0 && (!applied || Math.abs(payrollItemToUSD(applied) - dedAuto) > 0.0001);
      const snap = getLockedSnapshot(e.id, month);
      if (snap) return { e, t, unmarked: 0, pendingDed: false, dedAuto: 0, adv: snap.advance || calcAdvanceRow(e, month) };
      return { e, t, unmarked: countUnmarkedDays(e, month), pendingDed, dedAuto, adv: calcAdvanceRow(e, month) };
    });
}

function renderMonthlyTab() {
  const body = document.getElementById('monthlyBody');
  if (!body) return;
  const month = currentMonthlyMonth();
  if (typeof requestAdvanceSync === 'function') requestAdvanceSync(month); // sync ទៅ DB (debounce, មិនរង្វិលជុំ)
  const rows = monthlyRows(month);
  renderMonthlyLockBar(month);
  document.getElementById('monthlyEmpty').style.display = rows.length ? 'none' : 'block';

  const g = { total: 0, ben: 0, ded: 0, net: 0, netRiel: 0, netR2: 0, warn: 0, adv: 0 };
  body.innerHTML = rows.map(({ e, t, unmarked, pendingDed, dedAuto, adv }, i) => {
    g.adv += adv.amount; g.total += t.total; g.ben += t.benefitsUSD; g.ded += t.deductionsUSD; g.net += t.net; g.netRiel += t.netRiel; g.netR2 += Math.round(t.net * 100) / 100;
    const warns = [];
    if (unmarked > 0) warns.push(`⚠️ មិនទាន់កត់វត្តមាន ${unmarked} ថ្ងៃ`);
    if (pendingDed) warns.push(`⚠️ មានប្រាក់កាត់ $${fmtUSD(dedAuto)} មិនទាន់បញ្ចូល`);
    if (!(parseFloat(e.salary) > 0)) warns.push('⚠️ គ្មានប្រាក់ខែមូលដ្ឋាន');
    if (warns.length) g.warn++;
    return `<tr>
      <td>${i + 1}</td><td>${escapeHtml(e.username || '-')}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.dept || '-')}</td>
      <td>${t.workDays}</td><td>${t.leaveDays}</td><td>${t.otHours ? fmtHours(t.otHours) : '-'}</td>
      <td>$${fmtUSD(t.total)}<div style="font-size:0.66rem;color:var(--text-muted);line-height:1.35;white-space:nowrap;">ឈ្នួល $${fmtUSD(t.normalPay)}<br>OT $${fmtUSD(t.otPay)}<br>បាយ $${fmtUSD(((t.foodRiel || 0) + (t.foodOtRiel || 0)) / (t.exchangeRate || settings.exchangeRate || 1))}</div></td><td>+$${fmtUSD(t.benefitsUSD)}</td><td>−$${fmtUSD(t.deductionsUSD)}</td>
      <td><strong>$${fmtUSD2(t.net)}</strong></td><td>${fmtUSDplusRiel(t.net)}</td>
      <td title="ថ្ងៃទី១–${advRules.endDay}: ធ្វើការ ${adv.workedDays} / ត្រូវការ ${adv.requiredDays} · ទូទាត់ ${adv.dueDate}"><strong style="color:${adv.eligible ? '#16a34a' : '#9ca3af'};">$${fmtUSD(adv.amount)}</strong><div style="font-size:0.68rem;color:var(--text-muted);">${adv.workedDays}/${adv.requiredDays} ថ្ងៃ${adv.eligible ? (adv.due ? ' · ដកហើយ' : ' · ដល់ ' + adv.dueDate.slice(8) ) : ''}</div></td>
      <td style="font-size:0.74rem;">${pcPayslipCell(e.id, month)}</td>
      <td style="font-size:0.72rem;color:#b45309;">${warns.join('<br>') || '<span style="color:#16a34a;">✓</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="secondary" onclick="monthlyOpenEmployee('${e.id}')">📄 លម្អិត</button>
        <button class="secondary" onclick="adminPrintPayslipMonth('${e.id}','${month}')">🖨</button>
        <button class="secondary" title="កែតម្រូវ" onclick="openAdjustModal({empId:'${e.id}',srcMonth:'${month}'})">⚖️</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('monthlyStats').innerHTML = `
    <div class="stat-card"><div class="num">${rows.length}</div><div class="label">បុគ្គលិកសកម្ម</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(g.total)}</div><div class="label">តាមវត្តមានសរុប</div></div>
    <div class="stat-card"><div class="num">+$${fmtUSD(g.ben)}</div><div class="label">អត្ថប្រយោជន៍សរុប</div></div>
    <div class="stat-card"><div class="num">-$${fmtUSD(g.ded)}</div><div class="label">ប្រាក់កាត់សរុប</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD2(g.netR2)}</div><div class="label">ត្រូវបើកសរុប ($)</div></div>
    <div class="stat-card"><div class="num">${fmtUSDplusRiel(g.netR2)}</div><div class="label">ត្រូវបើកសរុប (ដុល្លារ + រៀល)</div></div>
    <div class="stat-card"><div class="num">$${fmtUSD(g.adv)}</div><div class="label">ប្រាក់ខែទី១សរុប (ទី២៥)</div></div>
    <div class="stat-card"><div class="num" style="color:${g.warn ? '#b45309' : '#16a34a'};">${g.warn}</div><div class="label">ត្រូវពិនិត្យ</div></div>
  `;
}

function monthlyOpenEmployee(empId) {
  const month = currentMonthlyMonth();
  document.getElementById('payrollMonth').value = month;
  document.getElementById('attendanceMonth').value = month;
  showTab('payroll');
  const sel = document.getElementById('payrollEmployeeSelect');
  if (sel) { sel.value = empId; renderPayrollTab(); }
}

async function runMonthlyPayroll() {
  const month = currentMonthlyMonth();
  if (guardLocked(month, 'គណនាប្រាក់កាត់')) return;
  const targets = payrollEmployeesForMonth(month).filter(e => calcDeductionRow(e, month).total > 0);
  const stale = payrollItems.filter(p => p.id.startsWith('auto_ded_') && p.month === month &&
    !targets.some(e => dedItemId(e.id, month) === p.id));
  if (targets.length === 0 && stale.length === 0) { customAlert('មិនមានប្រាក់កាត់យឺត/ច្បាប់ក្នុងខែនេះទេ'); return; }
  if (!(await customConfirm(`គណនាប្រាក់កាត់យឺត/ច្បាប់ ខែ ${month}៖ បន្ថែម/អាប់ដេត ${targets.length} នាក់` + (stale.length ? `, ដកចេញ ${stale.length} ធាតុដែលលែងមាន` : '') + '?'))) return;
  document.getElementById('dedMonth').value = month; // applyDeductionItem អានខែពីកន្លែងនេះ
  for (const e of targets) await applyDeductionItem(e.id, true);
  for (const p of stale) { payrollItems = payrollItems.filter(x => x.id !== p.id); await deletePayrollItemRow(p.id); }
  renderMonthlyTab(); renderDeductTab(); renderPayrollTab();
}

function exportMonthlyCSV() {
  const month = currentMonthlyMonth();
  const rows = monthlyRows(month);
  if (!rows.length) { customAlert('មិនមានទិន្នន័យ'); return; }
  const headers = ['#', 'អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ប្រាក់ខែមូលដ្ឋាន($)', 'ថ្ងៃធ្វើការ', 'ច្បាប់', 'OT(ម៉ោង)', 'តាមវត្តមាន($)', 'អត្ថប្រយោជន៍($)', 'ប្រាក់កាត់($)', 'ប្រាក់ខែសុទ្ធ($)', 'ប្រាក់ខែសុទ្ធ(៛)', 'ថ្ងៃធ្វើការ (ទី១-ថ្ងៃកំណត់)', 'ថ្ងៃត្រូវធ្វើការ', 'ប្រាក់ខែទី១($)'];
  const lines = rows.map(({ e, t, adv }, i) => [i + 1, e.username || '', e.name, e.dept || '', (parseFloat(e.salary) || 0).toFixed(2),
    t.workDays, t.leaveDays, t.otHours.toFixed(2), t.total.toFixed(2), t.benefitsUSD.toFixed(2), t.deductionsUSD.toFixed(2), t.net.toFixed(2), Math.round(t.netRiel), adv.workedDays, adv.requiredDays, adv.amount.toFixed(2)]);
  const csv = '\uFEFF' + headers.join(',') + '\n' + lines.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `payroll_${month}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ព្រីនតារាង/Payslip ទាំងអស់ ប្រើខែពីផ្ទាំងនេះ (print.js អានខែពី payrollMonth)
function withMonthlyMonth(fn) {
  document.getElementById('payrollMonth').value = currentMonthlyMonth();
  fn();
}

function showTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tab + 'Tab'));
  const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (btn) {
    const g = btn.closest('.nav-group');
    if (g) g.classList.add('open');
    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
  }
  closeSidebar();
  window.scrollTo({ top: 0 });
  if (tab === 'deduct') renderDeductTab();
  if (tab === 'bonus') renderBonusTab();
  if (tab === 'monthly') renderMonthlyTab();
  if (tab === 'payroll') renderPayrollTab();
  if (tab === 'attendance') renderAttendanceTab();
  if (tab === 'requests') { renderRequestsTab(); refreshRequests(); }
  if (tab === 'leavebalance') renderLeaveBalanceTab();
  if (typeof onFeatureTab === 'function') onFeatureTab(tab);
  if (tab === 'scan') {
    renderScanLog();
    setScanResult('idle', 'ស្កេនកូដ QR របស់បុគ្គលិកដើម្បីកត់ត្រាម៉ោងចូល ឬចេញ');
  } else {
    stopScanner();
  }
}

document.querySelectorAll('.nav-item[data-tab]').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
document.querySelectorAll('.nav-parent').forEach(btn => btn.addEventListener('click', () => btn.closest('.nav-group').classList.toggle('open')));
document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);
document.getElementById('reqStatusFilter').addEventListener('change', renderRequestsTab);
document.getElementById('reqRefreshBtn').addEventListener('click', () => refreshRequests());
initLbControls();
['lbYear', 'lbSearch'].forEach(id => document.getElementById(id).addEventListener('input', renderLeaveBalanceTab));
['lbQuotaDays', 'lbProrate', 'lbPaidQuota', 'lbCarryOver', 'lbCarryMax', 'lbCarryFrom'].forEach(id => document.getElementById(id).addEventListener('input', () => { readLbControls(); renderLeaveBalanceTab(); }));
initDeductControls();
['dedMonth', 'dedFilter'].forEach(id => document.getElementById(id).addEventListener('change', renderDeductTab));
document.getElementById('dedSearch').addEventListener('input', renderDeductTab);
['dedGrace', 'dedLatePerDay', 'dedLatePerMin', 'dedLeaveFood'].forEach(id => document.getElementById(id).addEventListener('input', () => { readDeductControls(); renderDeductTab(); }));
document.querySelectorAll('.ded-leave-type').forEach(c => c.addEventListener('change', () => { readDeductControls(); renderDeductTab(); }));
document.getElementById('dedApplyAllBtn').addEventListener('click', applyAllDeductions);
initBonusControls();
['bonusMonth', 'bonusFilter'].forEach(id => document.getElementById(id).addEventListener('change', renderBonusTab));
document.getElementById('bonusSearch').addEventListener('input', renderBonusTab);
document.getElementById('bonusMode').addEventListener('change', () => { readBonusControls(); renderBonusTab(); });
['bonusFlatAmount', 'bonusPerYearAmount', 'bonusDaysPerMonth', 'bonusMinMonths'].forEach(id => document.getElementById(id).addEventListener('input', () => { readBonusControls(); renderBonusTab(); }));
document.getElementById('bonusApplyAllBtn').addEventListener('click', applyAllBonus);
payLive = setupLiveSearch('payrollSearch', 'payrollEmployeeSelect', renderPayrollTab);
document.getElementById('holidayAddBtn').addEventListener('click', addHoliday);
document.getElementById('monthlyMonth').value = todayStr().slice(0, 7);
document.getElementById('monthlyMonth').addEventListener('change', renderMonthlyTab);
document.getElementById('monthlySearch').addEventListener('input', renderMonthlyTab);
document.getElementById('monthlyPrev').addEventListener('click', () => shiftMonthlyMonth(-1));
document.getElementById('monthlyNext').addEventListener('click', () => shiftMonthlyMonth(1));
document.getElementById('monthlyRunBtn').addEventListener('click', runMonthlyPayroll);
if (typeof initPayrollClose === 'function') initPayrollClose();
document.getElementById('advAmount').value = advRules.amount;
document.getElementById('advCountLeave').checked = !!advRules.countLeave;
document.getElementById('advEndDay').value = advRules.endDay;
['advAmount', 'advEndDay', 'advCountLeave'].forEach(id => document.getElementById(id).addEventListener('input', () => { readAdvControls(); renderMonthlyTab(); }));
document.getElementById('monthlyCsvBtn').addEventListener('click', exportMonthlyCSV);
document.getElementById('monthlyPrintSheetBtn').addEventListener('click', () => withMonthlyMonth(printPayrollSheet));
document.getElementById('monthlyPrintAllBtn').addEventListener('click', () => withMonthlyMonth(printAllPayslips));


document.getElementById('attendanceMonth').value = todayStr().slice(0, 7);
document.getElementById('payrollMonth').value = todayStr().slice(0, 7);
document.getElementById('adminSetupBtn').addEventListener('click', doAdminSetup);
document.getElementById('adminLoginBtn').addEventListener('click', doAdminLogin);
document.getElementById('adminLoginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });
document.getElementById('logoutBtn').addEventListener('click', doAdminLogout);
document.getElementById('changeAdminPwBtn').addEventListener('click', changeAdminPassword);

if (typeof initFeatures === 'function') initFeatures();
checkAdminAuthAndInit();
