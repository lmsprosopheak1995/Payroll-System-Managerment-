/* ==========================================================================
   scan-history.js — ប្រវត្តិស្កេន (Admin)
   • ១ ជួរ = ១ ថ្ងៃ × ១ បុគ្គលិក  ជាមួយម៉ោង ៤ ជួរ៖ ចូល · ចេញបាយ · ចូលវិញ · ចេញ
   • ចុចខែណាមួយ → បង្ហាញ "សង្ខេបខែ" (ថ្ងៃមកធ្វើការ · យឺត · ស្កេនមិនគ្រប់ · QR · ដៃ) ក្នុងមួយបុគ្គលិក
   • ទាញយក CSV (លម្អិត និងសង្ខេប)
   ប្រភពទិន្នន័យ៖ attendance (ពី script.js) · ជម្រើស scan_log (QR / រូបថត)
   ដាក់ក្រោម script.js និង scan-extras.js ក្នុង index.html៖  <script src="scan-history.js"></script>
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHOTO_BUCKET = 'scan-photos';
  const STEPS = [['checkin', 'ចូល', 'checkin'], ['break_out', 'ចេញបាយ', 'breakOut'], ['break_in', 'ចូលវិញ', 'breakIn'], ['checkout', 'ចេញ', 'checkout']];
  const parseMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const MAX_ROWS = 1500;
  const MONTH_NAMES = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];

  function today() {
    if (typeof todayStr === 'function') return todayStr();
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const startOfMonth = () => today().slice(0, 8) + '01';
  const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
  const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${y}`; };
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : window.alert(m));

  let rows = [];          // ១ ជួរ = ១ ថ្ងៃ × ១ បុគ្គលិក (មុនចម្រោះ)
  let logs = {};          // scan_log៖ "date|emp|step" -> row
  let logsMissing = false;
  let shown = [];         // ជួរក្រោយចម្រោះ
  let corr = {};          // សំណើកែវត្តមានដែលកំពុងរង់ចាំ៖ "date|emp" -> true
  let overviewOpen = false;
  let sortKey = 'name', sortDir = 1; // តម្រៀបតារាងសង្ខេប
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
      <div id="shMonths" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
        <label>ពីថ្ងៃ<br><input type="date" id="shFrom"></label>
        <label>ដល់ថ្ងៃ<br><input type="date" id="shTo"></label>
        <label>បុគ្គលិក<br><select id="shEmp"><option value="">ទាំងអស់</option></select></label>
        <label>ស្ថានភាព<br><select id="shStat">
          <option value="attention" selected>ត្រូវយកចិត្តទុកដាក់ (យឺត/មិនគ្រប់)</option>
          <option value="">ទាំងអស់</option>
          <option value="incomplete">ស្កេនមិនគ្រប់ ៤</option>
          <option value="late">ចូលយឺត</option>
        </select></label>
        <label id="shSrcWrap">ប្រភព<br><select id="shSrc">
          <option value="">ទាំងអស់</option>
          <option value="qr">មានស្កេន QR</option>
          <option value="manual">មាន Admin / កែដោយដៃ</option>
        </select></label>
        <label>ស្វែងរក<br><input type="search" id="shSearch" placeholder="ឈ្មោះ / ផ្នែក"></label>
        <button type="button" id="shRefresh" class="secondary">🔄 ផ្ទុកឡើងវិញ</button>
        <button type="button" id="shCsv">⬇ CSV</button>
      </div>
      <p class="scan-hint" id="shWarn" style="display:none;"></p>
      <div id="shOverview" style="display:none;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
          <h3 id="shOverTitle" style="margin:0;font-size:0.9rem;"></h3>
          <span><button type="button" id="shCsvSum" class="secondary" style="padding:2px 10px;">⬇ CSV សង្ខេប</button>
          <button type="button" id="shOverClose" class="secondary" style="padding:2px 10px;">បិទ</button></span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr style="cursor:pointer;" title="ចុចក្បាលជួរដើម្បីតម្រៀប"><th data-sort="name">បុគ្គលិក</th><th data-sort="dept">ផ្នែក</th><th data-sort="days">ថ្ងៃមកធ្វើការ</th><th data-sort="late">ចូលយឺត</th><th data-sort="lateMin">នាទីយឺតសរុប</th><th data-sort="incomplete" title="មិនរាប់ថ្ងៃនេះ (កំពុងដំណើរការ) និងថ្ងៃដែលមានច្បាប់អនុម័ត">ស្កេនមិនគ្រប់</th><th class="shQrCol" data-sort="qr">QR</th><th class="shQrCol" data-sort="manual">Admin/ដៃ</th></tr></thead>
          <tbody id="shOverBody"></tbody>
        </table></div>
      </div>
      <p class="scan-hint" id="shSummary"></p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ថ្ងៃ</th><th>បុគ្គលិក</th><th>ផ្នែក</th><th>ចូល</th><th>ចេញបាយ</th><th>ចូលវិញ</th><th>ចេញ</th></tr></thead>
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
    const list = (typeof employees !== 'undefined' ? employees : []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    $('shEmp').insertAdjacentHTML('beforeend', list.map(e => `<option value="${esc(e.id)}">${esc(e.name)}${e.status && e.status !== 'active' ? ' (ឈប់)' : ''}</option>`).join(''));
    ['shFrom', 'shTo'].forEach(id => $(id).addEventListener('change', () => load(false).catch(console.error)));
    ['shEmp', 'shStat', 'shSrc'].forEach(id => $(id).addEventListener('change', render));
    $('shSearch').addEventListener('input', render);
    $('shSummary').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-stat]');
      if (b) { $('shStat').value = b.dataset.stat; render(); }
    });
    $('shRefresh').addEventListener('click', () => load(true).catch(console.error));
    $('shCsv').addEventListener('click', downloadDetail);
    $('shCsvSum').addEventListener('click', downloadSummary);
    $('shOverClose').addEventListener('click', () => { overviewOpen = false; render(); });
    $('shMonths').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-month]');
      if (!b) return;
      $('shFrom').value = b.dataset.month + '-01';
      $('shTo').value = monthEnd(b.dataset.month);
      overviewOpen = true;
      load(false).catch(console.error);
    });
    $('scanhistBody').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-photo]');
      if (btn) showPhoto(btn.dataset.photo, btn.dataset.label);
    });
    document.querySelector('#shOverview thead').addEventListener('click', ev => {
      const th = ev.target.closest('th[data-sort]');
      if (!th) return;
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'name' || k === 'dept') ? 1 : -1; }
      renderOverview();
    });
    $('shOverBody').addEventListener('click', ev => {
      const a = ev.target.closest('[data-emp]');
      if (!a) return;
      ev.preventDefault();
      openEmp(a.dataset.emp, ($('shFrom').value || today()).slice(0, 7));
    });
  }

  // ---------- ច្បាប់ដែលបានអនុម័ត (មិនរាប់ជា "ស្កេនមិនគ្រប់") ----------
  function leaveOf(empId, date, rec) {
    try {
      const q = (typeof leaveRequests !== 'undefined' ? leaveRequests : []).find(r =>
        String(r.employee_id) === String(empId) && r.status === 'approved' && r.start_date <= date && date <= r.end_date);
      if (q) return 'ច្បាប់ · ' + (typeof leaveUnitLabel === 'function' ? leaveUnitLabel(q) : '');
    } catch (_) { /* ignore */ }
    return rec && rec.status === 'leave' ? 'ច្បាប់' : '';
  }
  const leaveBadge = r => (r.leave ? ` <span class="badge pending" style="font-size:0.62rem;">${esc(r.leave)}</span>` : '')
    + (r.pending ? ' <span class="badge pending" style="font-size:0.62rem;" title="មានសំណើកែវត្តមានកំពុងរង់ចាំ Admin អនុម័ត">📝 សំណើកែ</span>' : '');

  // ---------- ប៊ូតុងខែ ----------
  function renderMonths() {
    const box = $('shMonths');
    if (!box) return;
    const set = new Set([today().slice(0, 7)]);
    const att = (typeof attendance !== 'undefined' && attendance) || {};
    Object.keys(att).forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d.slice(0, 7)); });
    const months = Array.from(set).sort().reverse().slice(0, 24);
    const from = $('shFrom').value, to = $('shTo').value;
    box.innerHTML = '<span style="align-self:center;font-size:0.8rem;color:var(--text-muted);">📅 ខែ៖</span>' + months.map(m => {
      const on = overviewOpen && from === m + '-01' && to === monthEnd(m);
      const col = '#0d9488';
      return `<button type="button" data-month="${m}" style="border:2px solid ${col};background:${on ? col : 'transparent'};color:${on ? '#fff' : col};border-radius:999px;padding:3px 12px;font-weight:700;cursor:pointer;">${esc(monthLabel(m))}</button>`;
    }).join('');
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

  async function fetchPending(from, to, empId) {
    const m = {};
    try {
      if (typeof supabaseClient === 'undefined') return m;
      let q = supabaseClient.from('attendance_corrections').select('employee_id,date,status').eq('status', 'pending').gte('date', from).lte('date', to).limit(1000);
      if (empId) q = q.eq('employee_id', empId);
      const r = await q;
      if (!r.error) (r.data || []).forEach(c => { m[`${c.date}|${c.employee_id}`] = true; });
    } catch (e) { console.warn('attendance_corrections:', e); }
    return m;
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

      corr = await fetchPending(from, to);
      rows = buildRows(from, to, logs, null, corr);
      render();
    } finally { loading = false; }
  }

  function buildRows(from, to, lg, onlyEmp, cr) {
    cr = cr || {};
    const att = (typeof attendance !== 'undefined' && attendance) || {};
    const empMap = {};
    (typeof employees !== 'undefined' ? employees : []).forEach(e => { empMap[e.id] = e; });
    const now = today();
    const out = [];
    Object.keys(att).forEach(date => {
      if (date < from || date > to) return;
      const day = att[date] || {};
      Object.keys(day).forEach(empId => {
        if (onlyEmp != null && String(empId) !== String(onlyEmp)) return;
        const rec = day[empId] || {};
        const t = {}, src = {}, photo = {};
        let any = false, qr = 0, manual = 0;
        STEPS.forEach(([step, , field]) => {
          if (!rec[field]) return;
          any = true;
          t[step] = rec[field];
          const log = lg[`${date}|${empId}|${step}`];
          src[step] = log ? 'qr' : 'manual';
          if (log) qr++; else manual++;
          if (log && log.photo) photo[step] = log.photo;
        });
        if (!any) return;
        let late = false, lateMin = 0;
        if (t.checkin) {
          try {
            const start = lateStartMinutes(getEmpShift(empId));
            const m = parseMin(t.checkin);
            late = start !== null && start !== undefined && m !== null && m > start;
            if (late) lateMin = m - start;
          } catch (_) { late = false; }
        }
        const emp = empMap[empId];
        const leave = leaveOf(empId, date, rec);
        out.push({
          date, empId, t, src, photo, late, lateMin, qr, manual, leave, pending: !!cr[`${date}|${empId}`],
          name: emp ? emp.name : String(empId),
          dept: emp ? (emp.dept || '') : '',
          incomplete: date < now && !leave && STEPS.some(s => !t[s[0]]),
        });
      });
    });
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || String(a.name).localeCompare(String(b.name)));
    return out;
  }

  // ---------- ការបង្ហាញ ----------
  function filtered() {
    const emp = $('shEmp').value, stat = $('shStat').value, src = $('shSrc').value;
    const q = $('shSearch').value.trim().toLowerCase();
    return rows.filter(r =>
      (!emp || String(r.empId) === emp) &&
      (stat !== 'attention' || r.late || r.incomplete) &&
      (stat !== 'incomplete' || r.incomplete) &&
      (stat !== 'late' || r.late) &&
      (!src || logsMissing || (src === 'qr' ? r.qr > 0 : r.manual > 0)) &&
      (!q || r.name.toLowerCase().includes(q) || r.dept.toLowerCase().includes(q)));
  }

  const tag = (txt, bg, fg) => `<span style="font-size:0.62rem;padding:1px 6px;border-radius:999px;background:${bg};color:${fg};margin-left:3px;">${txt}</span>`;

  function cell(r, step, label, lm) {
    if (lm === undefined) lm = logsMissing;
    const time = r.t[step];
    if (!time) return '<span style="color:var(--text-muted);">-</span>';
    let h = `<b>${esc(time)}</b>`;
    if (!lm) h += r.src[step] === 'qr' ? tag('QR', '#d1fae5', '#065f46') : tag('ដៃ', '#ffedd5', '#9a3412');
    if (step === 'checkin' && r.late) h += ` <span class="badge inactive">យឺត ${r.lateMin} នាទី</span>`;
    if (r.photo[step]) h += ` <button type="button" class="secondary" style="padding:0 6px;" data-photo="${esc(r.photo[step])}" data-label="${esc(r.name + ' · ' + r.date + ' ' + time + ' · ' + label)}">📷</button>`;
    return h;
  }

  function render() {
    if (!$('scanhistBody')) return;
    renderMonths();
    const warn = $('shWarn');
    warn.style.display = logsMissing ? '' : 'none';
    warn.textContent = logsMissing ? 'ℹ មិនទាន់មានតារាង scan_log (scan-extras.sql) — មិនអាចបែងចែក QR / កែដោយដៃ ឬបង្ហាញរូបថតបានទេ។' : '';
    $('shSrcWrap').style.display = logsMissing ? 'none' : '';
    document.querySelectorAll('#scanhistTab .shQrCol').forEach(el => { el.style.display = logsMissing ? 'none' : ''; });

    shown = filtered();
    const people = new Set(shown.map(r => r.empId)).size;
    const stat = $('shStat').value;
    let line = stat === 'attention' ? `${shown.length} ជួរត្រូវយកចិត្តទុកដាក់ (ចូលយឺត ឬស្កេនមិនគ្រប់) · ${people} នាក់` : `${shown.length} ជួរ · ${people} នាក់`;
    if (shown.length > MAX_ROWS) line += ` (បង្ហាញ ${MAX_ROWS} ជួរដំបូង — ទាញយក CSV ដើម្បីបានទាំងអស់)`;
    if (overviewOpen) line += ' · ចុចឈ្មោះក្នុងតារាងសង្ខេបដើម្បីមើលលម្អិត';
    const btnStyle = 'padding:1px 10px;margin-left:8px;';
    const toggle = stat === 'attention' ? `<button type="button" class="secondary" data-stat="" style="${btnStyle}">បង្ហាញទាំងអស់ (${rows.length})</button>`
      : stat === '' ? `<button type="button" class="secondary" data-stat="attention" style="${btnStyle}">បង្ហាញតែជួរសំខាន់</button>` : '';
    $('shSummary').innerHTML = esc(line) + toggle;
    $('shEmpty').textContent = stat === 'attention' && rows.length ? '✅ គ្មានជួរដែលត្រូវយកចិត្តទុកដាក់ទេ — ចុច "បង្ហាញទាំងអស់" ដើម្បីមើលពេញ' : 'គ្មានការស្កេនក្នុងចន្លោះនេះទេ';
    $('shEmpty').style.display = shown.length ? 'none' : 'block';

    $('scanhistBody').innerHTML = shown.slice(0, MAX_ROWS).map(r => `<tr>
      <td>${esc(r.date)}${leaveBadge(r)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.dept)}</td>
      ${STEPS.map(s => `<td>${cell(r, s[0], s[1])}</td>`).join('')}</tr>`).join('');

    renderOverview();
  }

  // ---------- សង្ខេបខែ ----------
  function summarize() {
    const map = {};
    shown.forEach(r => {
      const o = map[r.empId] || (map[r.empId] = { empId: r.empId, name: r.name, dept: r.dept, days: 0, late: 0, lateMin: 0, incomplete: 0, qr: 0, manual: 0 });
      o.days++;
      o.lateMin += r.lateMin || 0;
      if (r.late) o.late++;
      if (r.incomplete) o.incomplete++;
      o.qr += r.qr;
      o.manual += r.manual;
    });
    return Object.values(map).sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      const c = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y));
      return (c || String(a.name).localeCompare(String(b.name))) * sortDir;
    });
  }

  function renderOverview() {
    const box = $('shOverview');
    box.style.display = overviewOpen ? '' : 'none';
    if (!overviewOpen) return;
    const from = $('shFrom').value, to = $('shTo').value;
    const sum = summarize();
    const tot = sum.reduce((a, o) => ({ days: a.days + o.days, late: a.late + o.late, lateMin: a.lateMin + o.lateMin, incomplete: a.incomplete + o.incomplete, qr: a.qr + o.qr, manual: a.manual + o.manual }), { days: 0, late: 0, lateMin: 0, incomplete: 0, qr: 0, manual: 0 });
    const isMonth = from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to === monthEnd(from.slice(0, 7));
    $('shOverTitle').textContent = `📊 សង្ខេប${isMonth ? 'ខែ ' + monthLabel(from.slice(0, 7)) : ` ${from} → ${to}`} · ${sum.length} នាក់`;
    const qrCols = o => logsMissing ? '' : `<td>${o.qr}</td><td>${o.manual}</td>`;
    $('shOverBody').innerHTML = sum.map(o => `<tr>
      <td><a href="#" data-emp="${esc(o.empId)}" style="color:inherit;text-decoration:underline;">${esc(o.name)}</a></td>
      <td>${esc(o.dept)}</td><td>${o.days}</td>
      <td>${o.late ? `<span style="color:#dc2626;font-weight:700;">${o.late}</span>` : '0'}</td>
      <td>${o.lateMin ? `<span style="color:#dc2626;font-weight:700;">${o.lateMin}</span>` : '0'}</td>
      <td>${o.incomplete ? `<span style="color:#f97316;font-weight:700;">${o.incomplete}</span>` : '0'}</td>
      ${qrCols(o)}</tr>`).join('') +
      (sum.length ? `<tr style="font-weight:700;"><td>សរុប</td><td></td><td>${tot.days}</td><td>${tot.late}</td><td>${tot.lateMin}</td><td>${tot.incomplete}</td>${qrCols(tot)}</tr>` : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">គ្មានទិន្នន័យ</td></tr>');
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
  function saveCsv(headers, data, filename) {
    const csv = '\uFEFF' + headers.map(csvCell).join(',') + '\n' + data.map(r => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
  const range = () => `${$('shFrom').value}_${$('shTo').value}`;

  function downloadDetail() {
    if (!shown.length) { alertMsg('មិនមានទិន្នន័យសម្រាប់ទាញយកទេ'); return; }
    const headers = ['ថ្ងៃ', 'បុគ្គលិក', 'ផ្នែក', 'ចូល', 'ចេញបាយ', 'ចូលវិញ', 'ចេញ', 'ចូលយឺត', 'នាទីយឺត', 'ស្កេនមិនគ្រប់/ច្បាប់', 'សំណើកែរង់ចាំ']
      .concat(logsMissing ? [] : ['ស្កេន QR', 'Admin/ដៃ']);
    const data = shown.map(r => [r.date, r.name, r.dept, r.t.checkin || '', r.t.break_out || '', r.t.break_in || '', r.t.checkout || '',
      r.late ? 'យឺត' : '', r.lateMin || '', r.incomplete ? 'មិនគ្រប់' : (r.leave || ''), r.pending ? 'មាន' : ''].concat(logsMissing ? [] : [r.qr, r.manual]));
    saveCsv(headers, data, `scan-history_${range()}.csv`);
  }

  function downloadSummary() {
    const sum = summarize();
    if (!sum.length) { alertMsg('មិនមានទិន្នន័យសម្រាប់ទាញយកទេ'); return; }
    const headers = ['បុគ្គលិក', 'ផ្នែក', 'ថ្ងៃមកធ្វើការ', 'ចូលយឺត', 'នាទីយឺតសរុប', 'ស្កេនមិនគ្រប់'].concat(logsMissing ? [] : ['ស្កេន QR', 'Admin/ដៃ']);
    const data = sum.map(o => [o.name, o.dept, o.days, o.late, o.lateMin, o.incomplete].concat(logsMissing ? [] : [o.qr, o.manual]));
    saveCsv(headers, data, `scan-summary_${range()}.csv`);
  }

  // ---------- Overview បុគ្គលិកម្នាក់៖ ប្រវត្តិរូប · ប្រវត្តិស្កេន · Payroll ----------
  let mState = null;
  function closeEmp() { const o = $('scanhistEmpOverlay'); if (o) o.remove(); mState = null; }
  function shiftYm(ym, d) {
    const [y, m] = ym.split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }
  const empById = id => (typeof employees !== 'undefined' ? employees : []).find(e => String(e.id) === String(id));
  function tenure(start) {
    if (!start) return '';
    const a = new Date(start + 'T00:00:00'), b = new Date(today() + 'T00:00:00');
    let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    if (b.getDate() < a.getDate()) m--;
    if (isNaN(m) || m < 0) return '';
    const y = Math.floor(m / 12), r = m % 12;
    return (y ? `${y} ឆ្នាំ ` : '') + `${r} ខែ`;
  }
  const usd = n => (typeof fmtUSD2 === 'function' ? fmtUSD2(n) : (Math.round((n || 0) * 100) / 100).toFixed(2));

  function openEmp(empId, ym, tab) {
    closeEmp();
    mState = { empId: String(empId), ym: ym || today().slice(0, 7), tab: tab || 'scan', range: '12' };
    const ov = document.createElement('div');
    ov.id = 'scanhistEmpOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:18px;';
    ov.innerHTML = '<div id="scanhistEmpBox" style="background:var(--card-bg,#fff);color:var(--text,#111827);border-radius:16px;max-width:900px;width:100%;max-height:90vh;overflow:auto;padding:18px;">កំពុងផ្ទុក…</div>';
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('#scanhistEmpClose')) { closeEmp(); return; }
      if (!mState) return;
      const tb = e.target.closest('button[data-tab]');
      if (tb) { mState.tab = tb.dataset.tab; renderEmp().catch(console.error); return; }
      const nav = e.target.closest('button[data-nav]');
      if (nav) { mState.ym = shiftYm(mState.ym, +nav.dataset.nav); renderEmp().catch(console.error); return; }
      const ph = e.target.closest('button[data-photo]');
      if (ph) { showPhoto(ph.dataset.photo, ph.dataset.label); return; }
      const emp = empById(mState.empId);
      const ps = e.target.closest('button[data-pslip]');
      if (ps && emp && typeof adminPrintPayslipMonth === 'function') { adminPrintPayslipMonth(emp.id, ps.dataset.pslip); return; }
      const pd = e.target.closest('button[data-ppdf]');
      if (pd && emp && typeof adminPdfPayslipMonth === 'function') adminPdfPayslipMonth(emp.id, pd.dataset.ppdf, pd);
    });
    ov.addEventListener('change', e => {
      if (e.target.id === 'shPayRange' && mState) { mState.range = e.target.value; renderEmp().catch(console.error); }
    });
    document.body.appendChild(ov);
    renderEmp().catch(console.error);
  }

  const chip = (label, val, col) => `<span style="border:2px solid ${col};color:${col};border-radius:999px;padding:3px 12px;font-weight:700;">${label} ${val}</span>`;
  const slipBtns = (month, small) => {
    const st = small ? 'padding:1px 8px;' : '';
    return (typeof adminPrintPayslipMonth === 'function' ? `<button type="button" class="secondary" style="${st}" data-pslip="${month}">🖨 Payslip</button> ` : '')
      + (typeof adminPdfPayslipMonth === 'function' ? `<button type="button" class="secondary" style="${st}" data-ppdf="${month}">⬇ PDF</button>` : '');
  };

  // --- ប្រវត្តិរូប + ឯកសារ ---
  function profileContent(emp) {
    const photo = typeof safeImgSrc === 'function' ? safeImgSrc(emp.photo) : '';
    const avatar = photo
      ? `<img src="${esc(photo)}" alt="" style="width:110px;height:110px;border-radius:50%;object-fit:cover;">`
      : `<div style="width:110px;height:110px;border-radius:50%;background:#0d9488;color:#fff;display:flex;align-items:center;justify-content:center;font-size:2.4rem;font-weight:700;">${esc((emp.name || '?').trim().charAt(0).toUpperCase() || '?')}</div>`;
    const salary = emp.salary !== '' && emp.salary != null ? '$' + usd(parseFloat(emp.salary) || 0) : '-';
    const fields = [
      ['អត្តលេខ', emp.username || '-'], ['តួនាទី', emp.position || '-'], ['ផ្នែក', emp.dept || '-'],
      ['ទូរស័ព្ទ', emp.phone || '-'], ['អ៊ីមែល', emp.email || '-'],
      ['ថ្ងៃចូលធ្វើការ', emp.startDate ? emp.startDate + (tenure(emp.startDate) ? ` (${tenure(emp.startDate)})` : '') : '-'],
      ['ប្រាក់ខែគោល', salary],
    ];
    const months = [0, 1, 2].map(i => shiftYm(today().slice(0, 7), -i)).filter(m => !emp.startDate || m >= emp.startDate.slice(0, 7));
    const slips = (typeof adminPrintPayslipMonth === 'function' || typeof adminPdfPayslipMonth === 'function')
      ? months.map(m => `<div style="display:flex;gap:10px;align-items:center;margin:4px 0;"><b style="min-width:70px;">${m}</b>${slipBtns(m, true)}</div>`).join('')
      : '<span style="color:var(--text-muted);">មិនមានមុខងារ Payslip</span>';
    const docRow = (label, val) => `<div style="display:flex;gap:10px;margin:4px 0;"><span style="min-width:170px;color:var(--text-muted);">${label}</span><b>${val}</b></div>`;
    return `
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
        ${avatar}
        <div><div style="font-size:1.25rem;font-weight:700;">${esc(emp.name)}</div>
          <div style="color:var(--text-muted);">${esc(emp.position)} · ${esc(emp.dept)}</div>
          <div style="margin-top:6px;"><span class="badge ${emp.status === 'active' ? 'active' : 'inactive'}">${emp.status === 'active' ? 'កំពុងបម្រើការ' : 'ឈប់បម្រើការ'}</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px 18px;margin-bottom:16px;">
        ${fields.map(f => `<div><div style="font-size:0.75rem;color:var(--text-muted);">${f[0]}</div><div style="font-weight:600;">${esc(f[1])}</div></div>`).join('')}
      </div>
      <h4 style="margin:0 0 6px;">📄 ឯកសារ</h4>
      ${docRow('លេខអត្តសញ្ញាណប័ណ្ណ', esc(emp.idCard) || '<span style="color:var(--text-muted);font-weight:400;">មិនទាន់បញ្ចូល</span>')}
      ${docRow('រូបថតប្រវត្តិរូប', photo ? 'មាន' : '<span style="color:var(--text-muted);font-weight:400;">មិនទាន់មាន</span>')}
      <div style="margin-top:6px;color:var(--text-muted);font-size:0.8rem;">Payslip ៣ ខែចុងក្រោយ៖</div>
      ${slips}`;
  }

  // --- Payroll ---
  function payContent(emp, st) {
    if (typeof summarizeEmpMonth !== 'function') return '<p class="scan-hint">មិនមានមុខងារគណនាប្រាក់ខែ (summarizeEmpMonth)</p>';
    const startM = emp.startDate ? emp.startDate.slice(0, 7) : '';
    const limit = st.range === 'all' ? 60 : 12;
    const cur = today().slice(0, 7);
    const months = [];
    for (let i = 0; i < limit; i++) { const m = shiftYm(cur, -i); if (startM && m < startM) break; months.push(m); }
    const tot = { days: 0, ben: 0, ded: 0, net: 0 };
    const body = months.map(m => {
      let t;
      try { t = summarizeEmpMonth(emp, m); } catch (e) { t = null; }
      if (!t) return `<tr><td>${m}</td><td colspan="6" style="color:var(--text-muted);">គណនាមិនបាន</td></tr>`;
      tot.days += t.workDays || 0; tot.ben += t.benefitsUSD || 0; tot.ded += t.deductionsUSD || 0; tot.net += t.net || 0;
      const riel = typeof netRielRounded === 'function' && typeof fmtRiel === 'function' ? fmtRiel(netRielRounded(t)) + ' ៛' : '';
      return `<tr><td>${m}</td><td>${t.workDays ?? ''}</td><td>+$${usd(t.benefitsUSD)}</td><td>−$${usd(t.deductionsUSD)}</td>
        <td><b>$${usd(t.net)}</b></td><td>${riel}</td><td>${slipBtns(m, true)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">គ្មានទិន្នន័យ</td></tr>';
    return `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <label>រយៈពេល <select id="shPayRange"><option value="12"${st.range === '12' ? ' selected' : ''}>12 ខែចុងក្រោយ</option><option value="all"${st.range === 'all' ? ' selected' : ''}>ទាំងអស់</option></select></label>
        ${chip('ប្រាក់ខែសុទ្ធសរុប', '$' + usd(tot.net), '#0d9488')}${chip('ថ្ងៃធ្វើការសរុប', tot.days, '#2563eb')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ខែ</th><th>ថ្ងៃធ្វើការ</th><th>ប្រាក់បន្ថែម</th><th>ប្រាក់កាត់</th><th>ប្រាក់ខែសុទ្ធ ($)</th><th>ប្រាក់ខែសុទ្ធ (៛)</th><th>Payslip</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }

  // --- ប្រវត្តិស្កេន ---
  async function scanContent(st) {
    const ym = st.ym, from = ym + '-01', to = monthEnd(ym);
    const lg = {};
    let lm = true;
    if (typeof supabaseClient !== 'undefined') {
      const q = await supabaseClient.from('scan_log').select('*').eq('employee_id', st.empId).gte('date', from).lte('date', to).limit(1000);
      if (!q.error) { lm = false; (q.data || []).forEach(l => { lg[`${l.date}|${l.employee_id}|${l.step}`] = l; }); }
    }
    const cr = await fetchPending(from, to, st.empId);
    const list = buildRows(from, to, lg, st.empId, cr);
    const sum = list.reduce((a, r) => ({ days: a.days + 1, lateMin: a.lateMin + (r.lateMin || 0), late: a.late + (r.late ? 1 : 0), inc: a.inc + (r.incomplete ? 1 : 0), qr: a.qr + r.qr, manual: a.manual + r.manual }), { days: 0, late: 0, lateMin: 0, inc: 0, qr: 0, manual: 0 });
    const body = list.slice().reverse().map(r => `<tr><td>${esc(r.date)}${leaveBadge(r)}</td>${STEPS.map(s => `<td>${cell(r, s[0], s[1], lm)}</td>`).join('')}</tr>`).join('')
      || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">គ្មានការស្កេនក្នុងខែនេះទេ</td></tr>';
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
        <button type="button" class="secondary" data-nav="-1" style="padding:2px 10px;">‹</button>
        <b>${esc(monthLabel(ym))}</b>
        <button type="button" class="secondary" data-nav="1" style="padding:2px 10px;">›</button>
        ${chip('ថ្ងៃមកធ្វើការ', sum.days, '#0d9488')}${chip('ចូលយឺត', sum.late, '#dc2626')}${chip('នាទីយឺត', sum.lateMin, '#dc2626')}${chip('ស្កេនមិនគ្រប់', sum.inc, '#f97316')}
        ${lm ? '' : chip('QR', sum.qr, '#16a34a') + chip('Admin/ដៃ', sum.manual, '#9a3412')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ថ្ងៃ</th><th>ចូល</th><th>ចេញបាយ</th><th>ចូលវិញ</th><th>ចេញ</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }

  async function renderEmp() {
    const st = mState;
    if (!st) return;
    const emp = empById(st.empId);
    const tab = st.tab, ym = st.ym;
    if (!emp) { const b = $('scanhistEmpBox'); if (b) b.innerHTML = '<p>រកមិនឃើញបុគ្គលិក</p><button type="button" id="scanhistEmpClose">បិទ</button>'; return; }
    const content = tab === 'scan' ? await scanContent(st) : tab === 'pay' ? payContent(emp, st) : profileContent(emp);
    if (mState !== st || st.tab !== tab || st.ym !== ym) return; // បានប្តូរ/បិទរួច
    const box = $('scanhistEmpBox');
    if (!box) return;
    const col = '#0d9488';
    const tabBtn = (k, label) => `<button type="button" data-tab="${k}" style="border:2px solid ${col};background:${tab === k ? col : 'transparent'};color:${tab === k ? '#fff' : col};border-radius:999px;padding:3px 14px;font-weight:700;cursor:pointer;">${label}</button>`;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <h3 style="margin:0;">${esc(emp.name)} <span style="font-size:0.8rem;font-weight:500;color:var(--text-muted);">${esc(emp.dept || '')}</span></h3>
        <button type="button" id="scanhistEmpClose">បិទ</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">${tabBtn('profile', '👤 ប្រវត្តិរូប · ឯកសារ')}${tabBtn('scan', '🕘 ប្រវត្តិស្កេន')}${tabBtn('pay', '💰 Payroll')}</div>
      ${content}`;
  }

  // ---------- wiring ----------
  function onTab(tab) {
    if (tab !== 'scanhist') return;
    if (!ensureTab()) { console.warn('scan-history: រកមិនឃើញកន្លែងដាក់ tab'); return; }
    bindOnce();
    load(false).catch(console.error);
  }

  // ---------- ចុចឈ្មោះក្នុង "បញ្ជីបុគ្គលិក" → Overview ប្រវត្តិធ្វើការរបស់បុគ្គលិកនោះ ----------
  function hookEmployeeList() {
    const tb = $('tableBody');
    if (!tb || tb.dataset.shHook) return;
    tb.dataset.shHook = '1';
    const st = document.createElement('style');
    st.textContent = '#tableBody td:nth-child(3){cursor:pointer;text-decoration:underline;}';
    document.head.appendChild(st);
    tb.addEventListener('click', ev => {
      const td = ev.target.closest('td');
      if (!td || td.cellIndex !== 2) return;
      const btn = td.parentNode.querySelector('button[onclick*="openEditModal"]');
      const m = btn && /openEditModal\('([^']*)'\)/.exec(btn.getAttribute('onclick') || '');
      if (m) openEmp(m[1], today().slice(0, 7), 'profile');
    });
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeEmp(); });

  try { ensureTab(); ensureNav(); hookEmployeeList(); } catch (e) { console.error('scan-history init:', e); }

  const _showTab = window.showTab;
  window.showTab = function (tab) {
    const r = typeof _showTab === 'function' ? _showTab.apply(this, arguments) : undefined;
    try { onTab(tab); } catch (e) { console.error('scanHistory:', e); }
    return r;
  };

  window.scanHistory = { refresh: () => load(true), download: downloadDetail, downloadSummary, showPhoto, closePhoto, openEmp };
})();
