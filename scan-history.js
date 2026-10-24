/* ==========================================================================
   scan-history.js — ប្រវត្តិស្កេន (Admin) = បញ្ជីម៉ោងស្កេនទាំងអស់ តាមថ្ងៃ/បុគ្គលិក/ប្រភេទ ព្រមទាំងទាញយក CSV
   ប្រភពទិន្នន័យ៖ អញ្ញត្តិ attendance (ចូល · ចេញបាយ · ចូលវិញ · ចេញ) ដែល script.js បានទាញរួច
   ជម្រើស៖ បើមានតារាង scan_log (scan-extras.sql) នឹងបង្ហាញថា ជាការស្កេន QR ដោយបុគ្គលិកខ្លួនឯង និងរូបថត
   ដាក់ក្រោម script.js និង scan-extras.js ក្នុង index.html៖  <script src="scan-history.js"></script>
   បើ index.html មិនមាន #scanhistTab ឬប៊ូតុង nav ទេ ឯកសារនេះនឹងបង្កើតឲ្យដោយស្វ័យប្រវត្តិ (មិនកែ logic ដើម)
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHOTO_BUCKET = 'scan-photos';
  const STEPS = [['checkin', 'ចូល', 'checkin'], ['break_out', 'ចេញបាយ', 'breakOut'], ['break_in', 'ចូលវិញ', 'breakIn'], ['checkout', 'ចេញ', 'checkout']];
  const STEP_ORDER = { checkin: 0, break_out: 1, break_in: 2, checkout: 3 };
  const parseMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const stepLabel = k => (STEPS.find(s => s[0] === k) || [k, k])[1];
  const MAX_ROWS = 1500; // ចំនួនជួរអតិបរមាក្នុងតារាង (CSV ទាញយកទាំងអស់)

  function today() {
    if (typeof todayStr === 'function') return todayStr();
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const startOfMonth = () => today().slice(0, 8) + '01';
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : window.alert(m));

  let events = [];            // ការស្កេនទាំងអស់ក្នុងចន្លោះថ្ងៃ (មុនចម្រោះ)
  let logs = {};              // scan_log៖ "date|emp|step" -> row
  let logsMissing = false;
  let shown = [];             // ជួរដែលកំពុងបង្ហាញ (ក្រោយចម្រោះ) — ប្រើសម្រាប់ CSV
  let inited = false;
  let loading = false;

  // ---------- បង្កើត tab / nav បើ index.html មិនទាន់មាន ----------
  function ensureTab() {
    if ($('scanhistTab')) return true;
    const ref = document.querySelector('.tab-content');
    if (!ref || !ref.parentNode) return false;
    const div = document.createElement('div');
    div.className = 'tab-content';
    div.id = 'scanhistTab';
    div.innerHTML = `
      <div class="toolbar" style="margin-bottom:10px;"><h3 style="margin:0;font-size:0.95rem;">🕘 ប្រវត្តិស្កេន</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
        <label>ពីថ្ងៃ<br><input type="date" id="shFrom"></label>
        <label>ដល់ថ្ងៃ<br><input type="date" id="shTo"></label>
        <label>បុគ្គលិក<br><select id="shEmp"><option value="">ទាំងអស់</option></select></label>
        <label>ប្រភេទ<br><select id="shStep"><option value="">ទាំងអស់</option>${STEPS.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></label>
        <label id="shSrcWrap">ប្រភព<br><select id="shSrc"><option value="">ទាំងអស់</option><option value="qr">ស្កេន QR</option><option value="manual">Admin / កែដោយដៃ</option></select></label>
        <label>ស្វែងរក<br><input type="search" id="shSearch" placeholder="ឈ្មោះ / ផ្នែក"></label>
        <button type="button" id="shRefresh" class="secondary">🔄 ផ្ទុកឡើងវិញ</button>
        <button type="button" id="shCsv">⬇ CSV</button>
      </div>
      <p class="scan-hint" id="shWarn" style="display:none;"></p>
      <p class="scan-hint" id="shSummary"></p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ថ្ងៃ</th><th>ម៉ោង</th><th>បុគ្គលិក</th><th>ផ្នែក</th><th>ប្រភេទ</th><th>ប្រភព</th><th>រូបថត</th></tr></thead>
          <tbody id="scanhistBody"></tbody>
        </table>
        <div class="empty-state" id="shEmpty" style="display:none;">គ្មានការស្កេនក្នុងចន្លោះនេះទេ</div>
      </div>`;
    ref.parentNode.appendChild(div);
    return true;
  }

  function ensureNav() {
    if (document.querySelector('.nav-item[data-tab="scanhist"]')) return;
    const anchor = document.querySelector('.nav-item[data-tab="today"]') || document.querySelector('.nav-item[data-tab="scan"]') || document.querySelector('.nav-item[data-tab="attendance"]');
    if (!anchor) return;
    const b = document.createElement('button');
    b.className = 'nav-item';
    b.dataset.tab = 'scanhist';
    b.innerHTML = '<span class="dot"></span><span class="lbl">ប្រវត្តិស្កេន</span>';
    b.addEventListener('click', () => window.showTab('scanhist'));
    anchor.insertAdjacentElement('afterend', b);
  }

  function bindOnce() {
    if (inited) return;
    inited = true;
    $('shFrom').value = startOfMonth();
    $('shTo').value = today();
    const empSel = $('shEmp');
    const list = (typeof employees !== 'undefined' ? employees : []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    empSel.insertAdjacentHTML('beforeend', list.map(e => `<option value="${esc(e.id)}">${esc(e.name)}${e.status && e.status !== 'active' ? ' (ឈប់)' : ''}</option>`).join(''));
    ['shFrom', 'shTo'].forEach(id => $(id).addEventListener('change', () => load(false).catch(console.error)));
    ['shEmp', 'shStep', 'shSrc'].forEach(id => $(id).addEventListener('change', render));
    $('shSearch').addEventListener('input', render);
    $('shRefresh').addEventListener('click', () => load(true).catch(console.error));
    $('shCsv').addEventListener('click', download);
    $('scanhistBody').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-photo]');
      if (btn) showPhoto(btn.dataset.photo, btn.dataset.label);
    });
  }

  // ---------- ទាញទិន្នន័យ ----------
  async function fetchScanLog(from, to) {
    const out = [];
    for (let i = 0; i < 100000; i += 1000) {
      const { data, error } = await supabaseClient.from('scan_log').select('*')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: true }).order('created_at', { ascending: true })
        .range(i, i + 999);
      if (error) return { data: null, error };
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: out, error: null };
  }

  async function load(force) {
    if (loading) return;
    loading = true;
    try {
      const from = $('shFrom').value || startOfMonth();
      const to = $('shTo').value || today();
      if (from > to) { alertMsg('ថ្ងៃចាប់ផ្តើមត្រូវមិនធំជាងថ្ងៃបញ្ចប់'); return; }
      if (force && typeof loadAttendance === 'function') await loadAttendance();

      logs = {};
      logsMissing = false;
      if (typeof supabaseClient !== 'undefined') {
        const r = await fetchScanLog(from, to);
        if (r.error) { logsMissing = true; console.warn('scan_log:', r.error.message); }
        else (r.data || []).forEach(l => { logs[`${l.date}|${l.employee_id}|${l.step}`] = l; });
      } else logsMissing = true;

      buildEvents(from, to);
      render();
    } finally { loading = false; }
  }

  function buildEvents(from, to) {
    const att = (typeof attendance !== 'undefined' && attendance) || {};
    const empMap = {};
    (typeof employees !== 'undefined' ? employees : []).forEach(e => { empMap[e.id] = e; });
    events = [];
    Object.keys(att).forEach(date => {
      if (date < from || date > to) return;
      const day = att[date] || {};
      Object.keys(day).forEach(empId => {
        const rec = day[empId] || {};
        const emp = empMap[empId];
        STEPS.forEach(([step, , field]) => {
          const time = rec[field];
          if (!time) return;
          const log = logs[`${date}|${empId}|${step}`] || null;
          let late = false;
          if (step === 'checkin') {
            try {
              const start = lateStartMinutes(getEmpShift(empId));
              const m = parseMin(time);
              late = start !== null && start !== undefined && m !== null && m > start;
            } catch (_) { late = false; }
          }
          events.push({
            date, time, empId, step,
            name: emp ? emp.name : String(empId),
            dept: emp ? (emp.dept || '') : '',
            src: log ? 'qr' : 'manual',
            photo: log && log.photo ? log.photo : '',
            late,
          });
        });
      });
    });
    events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      || (parseMin(b.time) - parseMin(a.time))
      || (STEP_ORDER[b.step] - STEP_ORDER[a.step]));
  }

  // ---------- ការបង្ហាញ ----------
  function filtered() {
    const emp = $('shEmp').value, step = $('shStep').value, src = $('shSrc').value;
    const q = $('shSearch').value.trim().toLowerCase();
    return events.filter(e =>
      (!emp || String(e.empId) === emp) &&
      (!step || e.step === step) &&
      (!src || logsMissing || e.src === src) &&
      (!q || e.name.toLowerCase().includes(q) || e.dept.toLowerCase().includes(q)));
  }

  function render() {
    if (!$('scanhistBody')) return;
    const warn = $('shWarn');
    warn.style.display = logsMissing ? '' : 'none';
    warn.style.color = 'var(--text-muted)';
    warn.textContent = logsMissing ? 'ℹ មិនទាន់មានតារាង scan_log (scan-extras.sql) — មិនអាចបែងចែក QR / កែដោយដៃ ឬបង្ហាញរូបថតបានទេ។' : '';
    $('shSrcWrap').style.display = logsMissing ? 'none' : '';

    shown = filtered();
    const people = new Set(shown.map(e => e.empId)).size;
    $('shSummary').textContent = `${shown.length} ការស្កេន · ${people} នាក់` + (shown.length > MAX_ROWS ? ` (បង្ហាញ ${MAX_ROWS} ជួរដំបូង — ទាញយក CSV ដើម្បីបានទាំងអស់)` : '');
    $('shEmpty').style.display = shown.length ? 'none' : 'block';

    $('scanhistBody').innerHTML = shown.slice(0, MAX_ROWS).map(e => {
      const srcCell = logsMissing ? '<span style="color:var(--text-muted);">-</span>'
        : e.src === 'qr' ? '<span class="badge active">QR</span>' : '<span class="badge pending">Admin/ដៃ</span>';
      const photoCell = e.photo
        ? `<button type="button" class="secondary" style="padding:2px 10px;" data-photo="${esc(e.photo)}" data-label="${esc(e.name + ' · ' + e.date + ' ' + e.time + ' · ' + stepLabel(e.step))}">📷</button>`
        : '<span style="color:var(--text-muted);">-</span>';
      return `<tr>
        <td>${esc(e.date)}</td>
        <td><b>${esc(e.time)}</b>${e.late ? ' <span class="badge inactive">យឺត</span>' : ''}</td>
        <td>${esc(e.name)}</td>
        <td>${esc(e.dept)}</td>
        <td>${esc(stepLabel(e.step))}</td>
        <td>${srcCell}</td>
        <td>${photoCell}</td></tr>`;
    }).join('');
  }

  // ---------- រូបថត ----------
  function closePhoto() { const o = $('scanhistOverlay'); if (o) o.remove(); }
  async function showPhoto(path, label) {
    closePhoto();
    const ov = document.createElement('div');
    ov.id = 'scanhistOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:18px;';
    ov.innerHTML = '<div style="background:var(--card-bg,#fff);color:var(--text,#111827);border-radius:16px;max-width:420px;width:100%;max-height:90vh;overflow:auto;padding:18px;text-align:center;">កំពុងផ្ទុក…</div>';
    ov.addEventListener('click', e => { if (e.target === ov) closePhoto(); });
    document.body.appendChild(ov);
    let url = '';
    try {
      const { data, error } = await supabaseClient.storage.from(PHOTO_BUCKET).createSignedUrl(path, 600);
      if (!error && data) url = data.signedUrl;
    } catch (e) { console.warn('photo:', e); }
    const box = ov.firstElementChild;
    box.innerHTML = `<div style="font-weight:700;margin-bottom:8px;">${esc(label)}</div>
      ${url ? `<img src="${esc(url)}" style="width:100%;border-radius:12px;" alt="">` : '<div style="color:var(--text-muted);padding:20px;">មិនមានរូប (ឬមិនទាន់ upload)</div>'}
      <div style="margin-top:12px;"><button type="button" id="scanhistClose">បិទ</button></div>`;
    $('scanhistClose').addEventListener('click', closePhoto);
  }

  // ---------- CSV ----------
  const csvCell = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // ការពារ formula injection ក្នុង Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  function download() {
    if (!shown.length) { alertMsg('មិនមានទិន្នន័យសម្រាប់ទាញយកទេ'); return; }
    const headers = ['ថ្ងៃ', 'ម៉ោង', 'បុគ្គលិក', 'ផ្នែក', 'ប្រភេទ', 'ប្រភព', 'យឺត', 'មានរូបថត'];
    const rows = shown.map(e => [
      e.date, e.time, e.name, e.dept, stepLabel(e.step),
      logsMissing ? '' : (e.src === 'qr' ? 'QR' : 'Admin/ដៃ'), e.late ? 'យឺត' : '', e.photo ? 'មាន' : '',
    ]);
    const csv = '\uFEFF' + headers.map(csvCell).join(',') + '\n' + rows.map(r => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `scan-history_${$('shFrom').value}_${$('shTo').value}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // ---------- wiring ----------
  function onTab(tab) {
    if (tab !== 'scanhist') return;
    if (!ensureTab()) { console.warn('scan-history: រកមិនឃើញកន្លែងដាក់ tab'); return; }
    bindOnce();
    load(false).catch(console.error);
  }

  try { ensureTab(); ensureNav(); } catch (e) { console.error('scan-history init:', e); }

  const _showTab = window.showTab;
  window.showTab = function (tab) {
    const r = typeof _showTab === 'function' ? _showTab.apply(this, arguments) : undefined;
    try { onTab(tab); } catch (e) { console.error('scanHistory:', e); }
    return r;
  };

  window.scanHistory = { refresh: () => load(true), download, showPhoto, closePhoto };
})();
