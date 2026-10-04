/* ==========================================================================
   payroll-tools.js — ឧបករណ៍ផ្ទាំង "ប្រាក់ខែប្រចាំខែ" (Admin)
   ① តម្រង (ផ្នែក / តំណែង / ស្ថានភាព) + តម្រៀប + ជ្រើសរើសជួរឈរដែលចង់បង្ហាញ
   ② ✏️ កែប្រែជាក្រុម៖ បន្ថែម អត្ថប្រយោជន៍ / ប្រាក់កាត់ ឬ ដកចេញ ដល់បុគ្គលិកច្រើននាក់ក្នុងមួយចុច
      (រក្សាទុកជាធាតុ payroll_items ដូចព្រីមពេញខែ → ចូលក្នុង Payslip / ប្រាក់ខែសុទ្ធដោយស្វ័យប្រវត្តិ)

   ដំឡើង៖ index.html ដាក់ក្រោម month-end.js៖  <script src="payroll-tools.js"></script>
   មិនត្រូវការ SQL · មិនកែ script.js · លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   តម្រង/តម្រៀប/ជួរឈរ ធ្វើលើតារាងដែល script.js គូររួច (តាម MutationObserver) ដូច្នេះមិនប៉ះពាល់ការគណនា។
   ត្រូវការ (សម្រាប់កែប្រែជាក្រុម)៖ payrollEmployeesForMonth, payrollItems, upsertPayrollItemRow,
            deletePayrollItemRow, isMonthLocked, guardLocked, currentMonthlyMonth, todayStr,
            logAudit, customAlert, customConfirm
   ត្រូវការ (សម្រាប់តម្រង)៖ monthlyRows (ជម្រើស: summarizeEmpMonth/calcDeductionRow/countUnmarkedDays)
   ========================================================================== */
(function () {
  'use strict';

  const COLS_KEY = 'payroll_tools_hidden_cols_v1';   // ចំណូលចិត្តបង្ហាញជួរឈរ (ក្នុង browser នេះប៉ុណ្ណោះ)
  const LOCKED_COLS = new Set(['#', 'ឈ្មោះ']);       // ជួរឈរដែលមិនអនុញ្ញាតឱ្យលាក់
  const POS_KEYS = ['position', 'jobTitle', 'job_title', 'title'];

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const posOf = e => { for (const k of POS_KEYS) { if (e && e[k]) return String(e[k]); } return ''; };
  const curMonth = () => (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || ((typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10)).slice(0, 7));
  const refreshOthers = () => {
    ['renderMonthlyTab', 'renderPayrollTab'].forEach(fn => { if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) { /* ignore */ } } });
  };

  // ======================================================================
  // ① តម្រង · តម្រៀប · ជួរឈរ
  // ======================================================================
  const state = { dept: '', pos: '', status: '', sort: 'default' };
  let hiddenCols = new Set();
  try { hiddenCols = new Set(JSON.parse(localStorage.getItem(COLS_KEY) || '[]')); } catch (e) { /* ignore */ }
  let bar = null, body = null, obs = null, timer = null;
  let visibleIds = new Set();   // បុគ្គលិកដែលកំពុងបង្ហាញក្នុងតារាង (ប្រើក្នុង "ជ្រើសតាមតម្រង")

  const STATUS_OPTS = [
    ['', 'ស្ថានភាពទាំងអស់'],
    ['absent', 'មានអវត្តមាន'],
    ['deduct', 'មានប្រាក់កាត់ (យឺត/ច្បាប់)'],
    ['unmarked', 'មានថ្ងៃមិនទាន់កត់វត្តមាន'],
    ['lownet', 'ប្រាក់ខែសុទ្ធ ≤ 0'],
  ];
  const SORT_OPTS = [
    ['default', 'តម្រៀបដើម'],
    ['name', 'ឈ្មោះ (ក → អ)'],
    ['username', 'អត្តលេខ'],
    ['dept', 'ផ្នែក → ឈ្មោះ'],
    ['net_desc', 'ប្រាក់ខែសុទ្ធ ច្រើន → តិច'],
    ['net_asc', 'ប្រាក់ខែសុទ្ធ តិច → ច្រើន'],
    ['ded_desc', 'ប្រាក់កាត់ ច្រើន → តិច'],
    ['work_desc', 'ថ្ងៃធ្វើការ ច្រើន → តិច'],
  ];

  const CSS = `
.pt-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
.pt-bar select{font-size:.8rem;padding:6px 8px}
.pt-count{font-size:.78rem;font-weight:600;margin-left:auto;color:var(--text-muted,#5b6b80)}
.pt-cols{position:relative}
.pt-colpanel{display:none;position:absolute;z-index:50;top:100%;left:0;margin-top:4px;min-width:220px;max-height:320px;overflow:auto;padding:8px 10px;border-radius:10px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);box-shadow:0 12px 32px rgba(15,27,45,.25)}
.pt-colpanel.open{display:block}
.pt-colpanel label{display:flex;gap:8px;align-items:center;font-size:.8rem;padding:3px 0;margin:0;cursor:pointer}
.pt-ovl{position:fixed;inset:0;z-index:9975;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.pt-ovl.open{display:flex}
.pt-box{width:100%;max-width:1100px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.pt-box h2{margin:0 0 4px;font-size:1.05rem}
.pt-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 8px}
.pt-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.pt-row input,.pt-row select{font-size:.8rem;padding:6px 8px}
.pt-form{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding:10px 12px;border:1px solid var(--border,#e1e8ef);border-radius:12px;margin:10px 0}
.pt-form label{font-size:.72rem;display:block;margin-bottom:3px;color:var(--text-muted,#5b6b80)}
.pt-form input,.pt-form select{font-size:.82rem;padding:6px 8px}
.pt-tbl td,.pt-tbl th{white-space:nowrap;vertical-align:middle}
.pt-sum{font-size:.8rem;font-weight:600}
.pt-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
`;

  function headerInfo() {
    const table = body && body.closest('table');
    const hr = table && table.tHead && table.tHead.rows[0];
    if (!hr) return null;
    const cells = [...hr.cells];
    return { cells, keys: cells.map(c => c.textContent.trim()) };
  }

  function buildInfo(month) {
    const map = new Map();
    let rows = [];
    try { rows = (typeof monthlyRows === 'function' ? monthlyRows(month) : []) || []; } catch (e) { rows = []; }
    rows.forEach(r => { if (r && r.e) map.set(String(r.e.username != null ? r.e.username : r.e.id), r); });
    return map;
  }

  function dedOf(e, month) {
    try { return typeof calcDeductionRow === 'function' ? (Number(calcDeductionRow(e, month).total) || 0) : 0; } catch (x) { return 0; }
  }

  function flagsOf(r, month) {
    const f = new Set(), e = r.e, t = r.t || {};
    if ((t.absentDays || 0) > 0) f.add('absent');
    if ((Number(t.net) || 0) <= 0) f.add('lownet');
    if (dedOf(e, month) > 0) f.add('deduct');
    try { if (typeof isMonthLocked === 'function' && !isMonthLocked(month) && typeof countUnmarkedDays === 'function' && countUnmarkedDays(e, month) > 0) f.add('unmarked'); } catch (x) { /* ignore */ }
    return f;
  }

  function fillSelect(sel, opts, keep) {
    const html = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    sel.innerHTML = html;
    sel.value = opts.some(([v]) => v === keep) ? keep : opts[0][0];
    return sel.value;
  }

  function refreshChoices(month) {
    let emps = [];
    try { emps = typeof payrollEmployeesForMonth === 'function' ? payrollEmployeesForMonth(month) : []; } catch (e) { emps = []; }
    const depts = [...new Set(emps.map(e => e.dept || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    state.dept = fillSelect(bar.querySelector('#ptDept'), [['', 'ផ្នែកទាំងអស់'], ...depts.map(d => [d, d])], state.dept);
    const poss = [...new Set(emps.map(posOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const ps = bar.querySelector('#ptPos');
    ps.style.display = poss.length ? '' : 'none';
    state.pos = fillSelect(ps, [['', 'តំណែងទាំងអស់'], ...poss.map(p => [p, p])], poss.length ? state.pos : '');
  }

  function apply() {
    if (!body || !bar) return;
    if (obs) obs.disconnect();
    try {
      const month = curMonth();
      refreshChoices(month);
      const hi = headerInfo();
      const info = buildInfo(month);
      const userCol = hi ? hi.keys.indexOf('អត្តលេខ') : -1;
      const rows = [...body.rows];
      rows.forEach((tr, i) => { if (!tr.dataset.ptIdx) tr.dataset.ptIdx = String(i); });

      const meta = rows.map(tr => {
        const user = userCol >= 0 && tr.cells[userCol] ? tr.cells[userCol].textContent.trim() : '';
        const r = info.get(user) || null;
        return { tr, r, idx: Number(tr.dataset.ptIdx) };
      });

      // --- តម្រង ---
      let shown = 0, sumNet = 0;
      visibleIds = new Set();
      meta.forEach(m => {
        let ok = true;
        if (m.r) {
          const e = m.r.e;
          if (state.dept && (e.dept || '') !== state.dept) ok = false;
          if (ok && state.pos && posOf(e) !== state.pos) ok = false;
          if (ok && state.status && !flagsOf(m.r, month).has(state.status)) ok = false;
        } else if (state.dept || state.pos || state.status) {
          ok = false;   // រកទិន្នន័យមិនឃើញ → លាក់ពេលមានតម្រង
        }
        m.ok = ok;
        m.tr.style.display = ok ? '' : 'none';
        if (ok) { shown++; if (m.r) { sumNet += Math.max(0, Number((m.r.t || {}).net) || 0); visibleIds.add(m.r.e.id); } }
      });

      // --- តម្រៀប ---
      const val = {
        name: m => (m.r ? m.r.e.name || '' : ''),
        username: m => (m.r ? String(m.r.e.username || '') : ''),
      };
      const cmpNum = (f, dir) => (a, b) => ((f(b) - f(a)) * dir) || (a.idx - b.idx);
      const netOf = m => (m.r ? Number((m.r.t || {}).net) || 0 : -Infinity);
      let sorted = meta.slice();
      switch (state.sort) {
        case 'name': sorted.sort((a, b) => val.name(a).localeCompare(val.name(b)) || a.idx - b.idx); break;
        case 'username': sorted.sort((a, b) => val.username(a).localeCompare(val.username(b), undefined, { numeric: true }) || a.idx - b.idx); break;
        case 'dept': sorted.sort((a, b) => ((a.r ? a.r.e.dept || '' : '').localeCompare(b.r ? b.r.e.dept || '' : '')) || val.name(a).localeCompare(val.name(b)) || a.idx - b.idx); break;
        case 'net_desc': sorted.sort(cmpNum(netOf, 1)); break;
        case 'net_asc': sorted.sort((a, b) => (netOf(a) - netOf(b)) || (a.idx - b.idx)); break;
        case 'ded_desc': sorted.sort(cmpNum(m => (m.r ? dedOf(m.r.e, month) : -1), 1)); break;
        case 'work_desc': sorted.sort(cmpNum(m => (m.r ? Number((m.r.t || {}).workDays) || 0 : -1), 1)); break;
        default: sorted.sort((a, b) => a.idx - b.idx);
      }
      sorted.forEach(m => body.appendChild(m.tr));

      // លេខរៀង "#" ឱ្យត្រូវតាមលំដាប់ដែលកំពុងបង្ហាញ (តែពេលក្រឡាមានតែលេខ)
      if (hi && hi.keys[0] === '#') {
        let n = 0;
        sorted.forEach(m => {
          if (!m.ok) return;
          const c = m.tr.cells[0];
          n++;
          if (c && /^\d+$/.test(c.textContent.trim())) c.textContent = String(n);
        });
      }

      applyCols(hi);
      const total = rows.length;
      bar.querySelector('#ptCount').textContent = `បង្ហាញ ${shown}/${total} នាក់ · ប្រាក់ខែសុទ្ធ $${money(sumNet)}`;
    } catch (e) {
      console.warn('payroll-tools apply failed', e);
    } finally {
      if (obs && body) obs.observe(body, { childList: true });
    }
  }

  function applyCols(hi) {
    hi = hi || headerInfo();
    if (!hi) return;
    hi.cells.forEach((th, i) => { th.style.display = hiddenCols.has(hi.keys[i]) ? 'none' : ''; });
    [...body.rows].forEach(tr => {
      if (tr.cells.length !== hi.cells.length) return;
      hi.keys.forEach((k, i) => { tr.cells[i].style.display = hiddenCols.has(k) ? 'none' : ''; });
    });
  }

  function renderColPanel() {
    const hi = headerInfo(), panel = bar.querySelector('#ptColPanel');
    if (!hi) { panel.innerHTML = ''; return; }
    panel.innerHTML = hi.keys.map(k => k && !LOCKED_COLS.has(k)
      ? `<label><input type="checkbox" data-col="${esc(k)}" ${hiddenCols.has(k) ? '' : 'checked'}> ${esc(k)}</label>` : '').join('')
      + '<div style="margin-top:6px"><button class="secondary" id="ptColsAll" type="button" style="padding:3px 9px;font-size:.74rem">បង្ហាញទាំងអស់</button></div>';
  }
  function saveCols() { try { localStorage.setItem(COLS_KEY, JSON.stringify([...hiddenCols])); } catch (e) { /* ignore */ } }

  function schedule() { clearTimeout(timer); timer = setTimeout(apply, 30); }

  function buildBar() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    bar = document.createElement('div');
    bar.className = 'pt-bar'; bar.id = 'ptBar';
    bar.innerHTML = `
      <select id="ptDept" title="តម្រងតាមផ្នែក"></select>
      <select id="ptPos" title="តម្រងតាមតំណែង" style="display:none"></select>
      <select id="ptStatus" title="តម្រងតាមស្ថានភាព"></select>
      <select id="ptSort" title="តម្រៀប"></select>
      <span class="pt-cols"><button class="secondary" id="ptColsBtn" type="button">🧩 ជួរឈរ</button><div class="pt-colpanel" id="ptColPanel"></div></span>
      <button class="secondary" id="ptResetBtn" type="button">↺ កំណត់ឡើងវិញ</button>
      <button id="ptBulkBtn" type="button">✏️ កែប្រែជាក្រុម</button>
      <span class="pt-count" id="ptCount"></span>`;
    const wrap = body.closest('.table-wrap') || body.closest('table');
    wrap.parentNode.insertBefore(bar, wrap);

    fillSelect(bar.querySelector('#ptStatus'), STATUS_OPTS, '');
    fillSelect(bar.querySelector('#ptSort'), SORT_OPTS, 'default');
    const $ = id => bar.querySelector('#' + id);
    $('ptDept').addEventListener('change', e => { state.dept = e.target.value; apply(); });
    $('ptPos').addEventListener('change', e => { state.pos = e.target.value; apply(); });
    $('ptStatus').addEventListener('change', e => { state.status = e.target.value; apply(); });
    $('ptSort').addEventListener('change', e => { state.sort = e.target.value; apply(); });
    $('ptResetBtn').addEventListener('click', () => {
      state.dept = state.pos = state.status = ''; state.sort = 'default';
      $('ptStatus').value = ''; $('ptSort').value = 'default';
      hiddenCols = new Set(); saveCols();
      renderColPanel(); apply();
    });
    $('ptColsBtn').addEventListener('click', ev => { ev.stopPropagation(); renderColPanel(); $('ptColPanel').classList.toggle('open'); });
    $('ptColPanel').addEventListener('click', ev => ev.stopPropagation());
    $('ptColPanel').addEventListener('change', ev => {
      const k = ev.target && ev.target.dataset && ev.target.dataset.col; if (k == null) return;
      if (ev.target.checked) hiddenCols.delete(k); else hiddenCols.add(k);
      saveCols(); applyCols();
    });
    $('ptColPanel').addEventListener('click', ev => {
      if (ev.target && ev.target.id === 'ptColsAll') { hiddenCols = new Set(); saveCols(); renderColPanel(); applyCols(); }
    });
    document.addEventListener('click', () => $('ptColPanel').classList.remove('open'));
    $('ptBulkBtn').addEventListener('click', openBulk);
  }

  // ======================================================================
  // ② កែប្រែជាក្រុម
  // ======================================================================
  let ov = null, bMonth = '', bEmps = [];

  // id ថេរ (មិនស្ទួន): ដាក់ម្តងទៀតដោយឈ្មោះដូចគ្នា → អាប់ដេតធាតុដើម
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const itemId = (kind, emp, month, name) => `bulk_${kind}_${emp}_${month}_${hash(name)}`;

  function buildBulk() {
    ov = document.createElement('div');
    ov.className = 'pt-ovl';
    ov.innerHTML = `
      <div class="pt-box" role="dialog" aria-modal="true">
        <h2>✏️ កែប្រែជាក្រុម <span id="pbMonth" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="pt-note">① ជ្រើសបុគ្គលិក → ② ជ្រើសសកម្មភាព និងបំពេញ → ③ ចុច "អនុវត្ត"។ ធាតុចូលក្នុងប្រាក់ខែ/Payslip ខែនេះភ្លាម ហើយមានកំណត់ហេតុកែប្រែ។ ដាក់ឈ្មោះដូចគ្នាម្តងទៀត = អាប់ដេត មិនស្ទួន។</p>
        <div id="pbLock"></div>
        <div class="pt-row">
          <input type="text" id="pbQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="pbDept"></select>
          <button class="secondary" id="pbFromTable" type="button" title="ជ្រើសបុគ្គលិកដែលកំពុងបង្ហាញក្នុងតារាងមេ (តាមតម្រង)">☑ ជ្រើសតាមតម្រងលើតារាង</button>
          <button class="secondary" id="pbClear" type="button">☐ ដកការជ្រើសទាំងអស់</button>
          <span class="pt-sum" id="pbSel" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap" style="max-height:34vh;overflow:auto">
          <table class="pt-tbl">
            <thead><tr><th><input type="checkbox" id="pbAll" title="ជ្រើសទាំងអស់ (ដែលកំពុងបង្ហាញ)"></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th style="text-align:right">ប្រាក់ខែមូលដ្ឋាន ($)</th><th>ធាតុក្រុមក្នុងខែនេះ</th></tr></thead>
            <tbody id="pbBody"></tbody>
          </table>
        </div>
        <div class="pt-form">
          <div><label>សកម្មភាព</label>
            <select id="pbAct">
              <option value="b">➕ បន្ថែមអត្ថប្រយោជន៍</option>
              <option value="d">➖ បន្ថែមប្រាក់កាត់</option>
              <option value="x">🗑 ដកធាតុដែលបានបន្ថែមជាក្រុម (តាមឈ្មោះ)</option>
            </select></div>
          <div><label>ឈ្មោះធាតុ</label><input type="text" id="pbName" placeholder="ឧ. ប្រាក់ឧបត្ថម្ភធ្វើដំណើរ" style="min-width:230px" maxlength="80"></div>
          <div id="pbAmtWrap"><label>របៀបគណនា</label>
            <select id="pbMode"><option value="fixed">ចំនួនថេរ ($)</option><option value="pct">% នៃប្រាក់ខែមូលដ្ឋាន</option></select></div>
          <div id="pbValWrap"><label id="pbValLbl">ចំនួន ($)</label><input type="number" id="pbVal" min="0" step="0.01" style="width:120px"></div>
          <button id="pbApply" type="button">▶ អនុវត្ត</button>
        </div>
        <div class="pt-sum" id="pbPreview" style="min-height:1.2em"></div>
        <div class="pt-row" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="pbClose" type="button">បិទ</button></div>
      </div>`;
    document.body.appendChild(ov);
    const $ = id => ov.querySelector('#' + id);
    $('pbClose').addEventListener('click', closeBulk);
    ov.addEventListener('mousedown', e => { if (e.target === ov) closeBulk(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) closeBulk(); });
    $('pbQ').addEventListener('input', renderBulkList);
    $('pbDept').addEventListener('change', renderBulkList);
    $('pbAll').addEventListener('change', e => { ov.querySelectorAll('#pbBody .pt-chk').forEach(c => { c.checked = e.target.checked; }); updateSel(); });
    $('pbBody').addEventListener('change', updateSel);
    $('pbClear').addEventListener('click', () => { ov.querySelectorAll('#pbBody .pt-chk').forEach(c => { c.checked = false; }); $('pbAll').checked = false; updateSel(); });
    $('pbFromTable').addEventListener('click', () => {
      ov.querySelectorAll('#pbBody .pt-chk').forEach(c => { c.checked = visibleIds.has(c.closest('tr').dataset.id); });
      updateSel();
    });
    ['pbAct', 'pbMode', 'pbVal', 'pbName'].forEach(id => $(id).addEventListener('input', syncForm));
    $('pbApply').addEventListener('click', applyBulk);
  }

  function selectedIds() { return [...ov.querySelectorAll('#pbBody .pt-chk:checked')].map(c => c.closest('tr').dataset.id); }

  function syncForm() {
    const $ = id => ov.querySelector('#' + id);
    const act = $('pbAct').value, pct = $('pbMode').value === 'pct';
    $('pbAmtWrap').style.display = $('pbValWrap').style.display = act === 'x' ? 'none' : '';
    $('pbValLbl').textContent = pct ? 'ភាគរយ (%)' : 'ចំនួន ($)';
    updateSel();
  }

  function planFor(ids) {
    const $ = id => ov.querySelector('#' + id);
    const act = $('pbAct').value, pct = $('pbMode').value === 'pct';
    const val = parseFloat($('pbVal').value) || 0;
    const plan = [], skipped = [];
    ids.forEach(id => {
      const e = bEmps.find(x => x.id === id); if (!e) return;
      if (act === 'x') { plan.push({ e, amount: 0 }); return; }
      const amount = pct ? r2((parseFloat(e.salary) || 0) * val / 100) : r2(val);
      if (!(amount > 0)) { skipped.push(e.name + (pct ? ' (គ្មានប្រាក់ខែមូលដ្ឋាន)' : '')); return; }
      plan.push({ e, amount });
    });
    return { act, plan, skipped };
  }

  function updateSel() {
    if (!ov) return;
    const ids = selectedIds();
    const { act, plan } = planFor(ids);
    ov.querySelector('#pbSel').textContent = `បានជ្រើស ${ids.length} នាក់`;
    const total = plan.reduce((s, p) => s + p.amount, 0);
    ov.querySelector('#pbPreview').textContent = act === 'x' || !ids.length ? '' : `នឹងអនុវត្តដល់ ${plan.length} នាក់ · សរុប $${money(total)}`;
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(bMonth);
    ov.querySelector('#pbApply').disabled = locked || !ids.length;
  }

  function renderBulkList() {
    const $ = id => ov.querySelector('#' + id);
    const q = ($('pbQ').value || '').trim().toLowerCase(), d = $('pbDept').value;
    const prev = new Set(selectedIds());
    const list = bEmps.filter(e => (!q || ((e.name || '') + ' ' + (e.username || '')).toLowerCase().includes(q)) && (!d || (e.dept || '') === d))
      .sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''));
    $('pbBody').innerHTML = list.length ? list.map(e => {
      const n = (typeof payrollItems !== 'undefined' ? payrollItems : []).filter(p => String(p.id).startsWith('bulk_') && String(p.id).includes(`_${e.id}_${bMonth}_`)).length;
      return `<tr data-id="${esc(e.id)}"><td><input type="checkbox" class="pt-chk" ${prev.has(e.id) ? 'checked' : ''}></td><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td><td style="text-align:right">${(parseFloat(e.salary) || 0) > 0 ? money(parseFloat(e.salary)) : '<span style="color:var(--text-muted)">-</span>'}</td><td>${n || '<span style="color:var(--text-muted)">—</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:14px">មិនមានបុគ្គលិក</td></tr>';
    updateSel();
  }

  function openBulk() {
    if (!ov) buildBulk();
    bMonth = curMonth();
    try { bEmps = typeof payrollEmployeesForMonth === 'function' ? payrollEmployeesForMonth(bMonth).filter(e => e.status === 'active') : []; } catch (e) { bEmps = []; }
    const $ = id => ov.querySelector('#' + id);
    $('pbMonth').textContent = bMonth;
    const depts = [...new Set(bEmps.map(e => e.dept || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelect($('pbDept'), [['', 'ផ្នែកទាំងអស់'], ...depts.map(x => [x, x])], '');
    $('pbQ').value = '';
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(bMonth);
    $('pbLock').innerHTML = locked ? '<div class="pt-warn">🔒 ខែនេះបានបិទហើយ — មិនអាចកែប្រែបានទេ។</div>' : '';
    renderBulkList();
    syncForm();
    ov.classList.add('open');
  }
  function closeBulk() { if (ov) ov.classList.remove('open'); }

  async function applyBulk() {
    const month = bMonth;
    if (typeof guardLocked === 'function' && guardLocked(month, 'កែប្រែជាក្រុម')) return;
    const $ = id => ov.querySelector('#' + id);
    const name = ($('pbName').value || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 80);
    const ids = selectedIds();
    if (!ids.length) { await customAlert('សូមជ្រើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    if (!name) { await customAlert('សូមបញ្ចូលឈ្មោះធាតុ'); return; }
    const { act, plan, skipped } = planFor(ids);
    if (!plan.length) { await customAlert('គ្មានបុគ្គលិកដែលអាចអនុវត្តបានទេ' + (skipped.length ? '\n\nរំលង៖ ' + skipped.join(', ') : '')); return; }

    const items = typeof payrollItems !== 'undefined' ? payrollItems : [];
    const preview = plan.slice(0, 8).map(p => p.e.name).join(', ') + (plan.length > 8 ? ` …(+${plan.length - 8})` : '');
    let verb;
    if (act === 'x') {
      verb = `🗑 ដកធាតុ "${name}"`;
    } else {
      const total = plan.reduce((s, p) => s + p.amount, 0);
      verb = `${act === 'b' ? '➕ អត្ថប្រយោជន៍' : '➖ ប្រាក់កាត់'} "${name}" សរុប $${money(total)}`;
    }
    if (!(await customConfirm(`${verb}\nដល់ ${plan.length} នាក់ ក្នុងខែ ${month}?\n${preview}${skipped.length ? '\n\nរំលង៖ ' + skipped.join(', ') : ''}`))) return;

    const btn = $('pbApply'); btn.disabled = true;
    let ok = 0;
    try {
      for (const { e, amount } of plan) {
        if (act === 'x') {
          let any = false;
          for (const kind of ['b', 'd']) {
            const id = itemId(kind, e.id, month, name);
            const prev = (typeof payrollItems !== 'undefined' ? payrollItems : []).find(p => p.id === id);
            if (!prev) continue;
            if (await deletePayrollItemRow(id)) {
              payrollItems = payrollItems.filter(p => p.id !== id);
              any = true;
              if (typeof logAudit === 'function') logAudit('bulk_item_remove', { entity: 'payroll_item', ref: id, month, employeeId: e.id, old: { name: prev.name, type: prev.type, currency: 'USD', amount: prev.amount }, new: null });
            }
          }
          if (any) ok++;
          continue;
        }
        const item = { id: itemId(act, e.id, month, name), employeeId: e.id, type: act === 'b' ? 'benefit' : 'deduction', name, recurrence: 'variable', month, currency: 'USD', amount };
        const old = payrollItems.find(p => p.id === item.id) || null;
        const otherId = itemId(act === 'b' ? 'd' : 'b', e.id, month, name);   // ឈ្មោះដូចគ្នា មិនឱ្យមានទាំងអត្ថប្រយោជន៍ និងប្រាក់កាត់
        if (!(await upsertPayrollItemRow(item))) continue;
        const idx = payrollItems.findIndex(p => p.id === item.id);
        if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
        ok++;
        if (typeof logAudit === 'function') logAudit('bulk_item_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: e.id,
          old: old ? { name: old.name, type: old.type, currency: 'USD', amount: old.amount } : null, new: { name: item.name, type: item.type, currency: 'USD', amount: item.amount } });
        const other = payrollItems.find(p => p.id === otherId);
        if (other && await deletePayrollItemRow(otherId)) payrollItems = payrollItems.filter(p => p.id !== otherId);
      }
    } finally {
      btn.disabled = false;
    }
    renderBulkList();
    refreshOthers();
    schedule();
    await customAlert(act === 'x' ? `បានដកចេញពី ${ok}/${plan.length} នាក់` : `បានអនុវត្ត ${ok}/${plan.length} នាក់`);
  }

  // ======================================================================
  // init
  // ======================================================================
  function init() {
    body = document.getElementById('monthlyBody');
    if (!body || document.getElementById('ptBar')) return;
    buildBar();
    obs = new MutationObserver(schedule);
    obs.observe(body, { childList: true });
    apply();
    // ប្តូរខែ → script.js គូរតារាងម្តងទៀត (observer ចាប់បាន) · ជួយបន្ថែមសម្រាប់ករណីខែប្តូរដោយមិនគូរឡើងវិញ
    const mm = document.getElementById('monthlyMonth');
    if (mm) mm.addEventListener('change', () => setTimeout(apply, 200));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openPayrollBulkEdit = openBulk;
})();
