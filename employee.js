/* ==========================================================================
   employee-fixes.js — កូដជំនួសក្នុង employee.html
   (១) clockIn()  — មិនលុប checkout/break ដែលបានកត់ ហើយការពារចុចពីរដង/ឧបករណ៍ពីរ
   (២) doLogin()  — try/catch, disable ប៊ូតុង, កំណត់ចំនួនព្យាយាមខុស
   (៣) handleEmpScan() — (ជម្រើស) ប្រើជាមួយ SQL emp_clock ក្នុង rls-setup.sql

   របៀបប្រើ៖ ស្វែងរកអនុគមន៍ដើមក្នុង employee.html ហើយជំនួសទាំងមូល។
   ========================================================================== */

// ---------------------------------------------------------------------------
// (១) clockIn — ជំនួស function clockIn() ដើម
// ---------------------------------------------------------------------------
let clockInBusy = false;

async function clockIn() {
  if (clockInBusy) return;            // ការពារ double-click / scan ស្ទួន
  clockInBusy = true;
  try {
    const session = getSession();
    const today = todayStr();
    const time = nowTimeStr();

    // ជំហាន ១៖ ព្យាយាមបង្កើតជួរថ្មី (មិនសរសេរជាន់លើជួរដែលមានស្រាប់)
    const { error: insErr } = await supabaseClient.from('attendance').insert({
      date: today, employee_id: session.id, status: 'present',
      checkin: time, checkout: '', break_out: '', break_in: '',
    });

    if (!insErr) { await renderClockBox(); await renderHistory(); return; }

    // 23505 = unique violation → មានជួរថ្ងៃនេះរួចហើយ (ឧ. admin បានកត់ជា absent/leave ឬ ចុចពីរដង)
    if (insErr.code !== '23505') {
      customAlert('កត់ត្រាមិនជោគជ័យ៖ ' + insErr.message);
      return;
    }

    // ជំហាន ២៖ ធ្វើបច្ចុប្បន្នភាពតែ checkin/status ហើយតែពេលដែល checkin នៅទទេប៉ុណ្ណោះ
    // (condition ក្នុង DB ដូច្នេះមិនមាន race condition ទោះពីរឧបករណ៍)
    const { data: updated, error: updErr } = await supabaseClient.from('attendance')
      .update({ status: 'present', checkin: time })
      .eq('date', today).eq('employee_id', session.id)
      .or('checkin.is.null,checkin.eq.')
      .select('date');

    if (updErr) { customAlert('កត់ត្រាមិនជោគជ័យ៖ ' + updErr.message); return; }
    if (!updated || updated.length === 0) {
      customAlert('អ្នកបានកត់ម៉ោងចូលរួចហើយសម្រាប់ថ្ងៃនេះ');
    }
    await renderClockBox();
    await renderHistory();
  } finally {
    clockInBusy = false;
  }
}

// ---------------------------------------------------------------------------
// (២) doLogin — ជំនួស function doLogin() ដើម (បន្ថែម const ទាំងនេះពីលើវា)
// ---------------------------------------------------------------------------
const LOGIN_FAIL_KEY = 'emp_login_fail';
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;   // ចាក់សោ ៥ នាទី

function getLoginFail() {
  try { return JSON.parse(localStorage.getItem(LOGIN_FAIL_KEY) || 'null') || { count: 0, until: 0 }; }
  catch (e) { return { count: 0, until: 0 }; }
}
function setLoginFail(v) {
  try { localStorage.setItem(LOGIN_FAIL_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

let loginBusy = false;

async function doLogin() {
  if (loginBusy) return;
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) { showLogin('សូមបំពេញអត្តលេខ និងពាក្យសម្ងាត់'); return; }

  const f = getLoginFail();
  if (f.until > Date.now()) {
    const mins = Math.ceil((f.until - Date.now()) / 60000);
    showLogin(`ព្យាយាមខុសច្រើនដងពេក សូមរង់ចាំ ${mins} នាទី ហើយព្យាយាមម្តងទៀត`);
    return;
  }

  const btn = document.getElementById('loginBtn');
  const oldText = btn.textContent;
  loginBusy = true;
  btn.disabled = true;
  btn.textContent = 'កំពុងចូល...';

  try {
    const { data, error } = await supabaseClient.rpc('login_employee', { p_username: username, p_password: password });
    if (error) { showLogin('មានបញ្ហាក្នុងការចូលគណនី៖ ' + error.message); return; }

    if (!data || data.length === 0) {
      const count = f.count + 1;
      setLoginFail(count >= LOGIN_MAX_FAILS
        ? { count: 0, until: Date.now() + LOGIN_LOCK_MS }
        : { count, until: 0 });
      const left = LOGIN_MAX_FAILS - count;
      showLogin('អត្តលេខ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' + (left > 0 && left <= 2 ? ` (នៅសល់ ${left} ដង)` : ''));
      return;
    }

    setLoginFail({ count: 0, until: 0 });
    setSession({ id: data[0].id, name: data[0].name });
    document.getElementById('loginPassword').value = '';
    await showMain();
  } catch (ex) {
    console.error('Login failed', ex);
    showLogin('មានបញ្ហា ឬមិនអាចតភ្ជាប់បាន សូមពិនិត្យអ៊ីនធឺណិត ហើយព្យាយាមម្តងទៀត');
  } finally {
    loginBusy = false;
    btn.disabled = false;
    btn.textContent = oldText;
  }
}
// ចំណាំ៖ ការចាក់សោនេះនៅ browser ប៉ុណ្ណោះ (អាចរំលងបាន) — ការការពារពិតត្រូវនៅ server
// (មើល login-employee Edge Function ក្នុង rls-setup.sql ដែលមាន rate-limit)។

// ---------------------------------------------------------------------------
// (៣) ជម្រើស — handleEmpScan ជំនួស ប្រើពេលបានដំឡើង emp_clock (SQL) រួច
//     Server ពិនិត្យកូដ QR + (ជម្រើស) geofence ហើយកំណត់ជំហានបន្ទាប់ដោយខ្លួនឯង
//     → លែងត្រូវទាញ workplace_code មក browser
// ---------------------------------------------------------------------------
const EMP_CLOCK_MESSAGES = {
  checkin: '✓ កត់ម៉ោងចូលរួចរាល់',
  break_out: '✓ កត់ម៉ោងចេញសម្រាករួចរាល់',
  break_in: '✓ កត់ម៉ោងចូលពីសម្រាករួចរាល់',
  checkout: '✓ កត់ម៉ោងចេញរួចរាល់',
  done: 'ℹ អ្នកបានកត់ត្រាគ្រប់ជំហានរួចសម្រាប់ថ្ងៃនេះ',
};
const EMP_CLOCK_ERRORS = {
  no_code: '✕ មិនទាន់មានកូដ QR កន្លែងធ្វើការទេ សូមទាក់ទងអ្នកគ្រប់គ្រង',
  bad_code: '✕ នេះមិនមែនជាកូដ QR កន្លែងធ្វើការទេ សូមស្កេននៅកន្លែងធ្វើការ',
  too_far: '✕ អ្នកនៅឆ្ងាយពីកន្លែងធ្វើការ',
  no_location: '✕ សូមអនុញ្ញាតទីតាំង (Location) ដើម្បីកត់វត្តមាន',
};

async function handleEmpScan(decodedText) {
  if (empScanBusy) return;
  empScanBusy = true;
  const resultEl = document.getElementById('empScanResult');
  const fail = msg => { resultEl.style.color = 'var(--danger)'; resultEl.textContent = msg; setTimeout(() => { empScanBusy = false; }, 1500); };
  try {
    resultEl.style.color = 'var(--text-muted)';
    resultEl.textContent = '⏳ កំពុងកត់ត្រា...';

    // ប្រសិនបើបើក geofence ក្នុង SQL (v_enforce_geo := true) ត្រូវផ្ញើ lat/lng ដែរ៖
    // const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 10000 }));
    // params.p_lat = pos.coords.latitude; params.p_lng = pos.coords.longitude;
    const params = { p_code: (decodedText || '').trim() };

    const { data, error } = await supabaseClient.rpc('emp_clock', params);
    stopEmpScanner();
    if (error) { fail('✕ កត់ត្រាមិនជោគជ័យ៖ ' + error.message); return; }
    if (!data || !data.ok) { fail(EMP_CLOCK_ERRORS[data && data.error] || '✕ កត់ត្រាមិនជោគជ័យ'); return; }

    resultEl.style.color = data.step === 'done' ? 'var(--text-muted)' : 'var(--success)';
    resultEl.textContent = (EMP_CLOCK_MESSAGES[data.step] || '✓ រួចរាល់') + (data.time ? ` (${data.time})` : '');
    await renderClockBox();
    await renderHistory();
  } catch (ex) {
    console.error(ex);
    fail('✕ មានបញ្ហា សូមព្យាយាមម្តងទៀត');
    return;
  }
  empScanBusy = false;
}
