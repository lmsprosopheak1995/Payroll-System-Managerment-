/* ==========================================================================
   salary-topup.js — តម្រឹមប្រាក់ខែឱ្យស្មើប្រាក់ខែថេរ (Fixed-salary Adjust) · Admin
   ក្បួនស្តង់ដារ៖ បុគ្គលិកប្រាក់ខែប្រចាំខែ ដែល "គ្មានអវត្តមានគ្មានសំណើ" ត្រូវបានប្រាក់ខែថេរស្មើគ្នារាល់ខែ
     ប្រាក់តម្រឹម = ប្រាក់ខែ − (ឈ្នួលថ្ងៃធម្មតា + សម្រាកមានប្រាក់ឈ្នួល/បុណ្យ)
       • វិជ្ជមាន (ខែខ្លី/អាទិត្យ ៥) → បន្ថែម "បំពេញប្រាក់ខែ" (អត្ថប្រយោជន៍)
       • អវិជ្ជមាន (ខែ 31 ថ្ងៃ បានលើស) → កាត់ "តម្រឹមប្រាក់ខែ" (ប្រាក់កាត់) ឱ្យស្មើប្រាក់ខែ
     • ថ្ងៃអាទិត្យ/បុណ្យដែលមកធ្វើការ (×2) មិនរាប់ក្នុងមូលដ្ឋាន → ប្រាក់នោះនៅជារបស់បុគ្គលិកទាំងស្រុង
     • ថ្ងៃដែលបានមកតែធ្វើការក្រោម 8 ម៉ោង (ដោយគ្មានច្បាប់)៖ ម៉ោងដែលខ្វះ **មិនបំពេញត្រឡប់វិញ** (បាត់ប្រាក់តាមម៉ោង)
     • មិនប៉ះពាល់ OT និងប្រាក់បាយ
   មិនតម្រឹម បើ៖ មានអវត្តមាន · មានថ្ងៃមិនទាន់កត់ · មានច្បាប់គ្មានប្រាក់ឈ្នួល · ឈប់ការងារ · ចូលធ្វើការកណ្តាលខែ
   🧪 របៀបសាកល្បង: ធីក → ប៊ូតុងទាំងអស់បង្ហាញលទ្ធផលជាមុន មិនរក្សាទុក · 🔍 ការគណនាលម្អិត + 📈 ព្យាករណ៍ · ⬇ CSV
   រក្សាទុកជាធាតុក្នុង payroll_items (id ថេរ មិនស្ទួន) → ចូល Payslip / ប្រាក់ខែសុទ្ធដោយស្វ័យប្រវត្តិ · គ្មានការកំណត់ត្រូវរក្សាទុក → មិនត្រូវការ SQL

   ដំឡើង៖ index.html ដាក់ក្រោម full-month.js៖  <script src="salary-topup.js"></script>
   ត្រូវការ៖ payrollItems, payrollEmployeesForMonth, summarizeEmpMonth, computeRow, dayMultiplier, attendance, leaveRequests,
             partialLeaveInfo, settings, daysInMonth, countUnmarkedDays, isMonthLocked, guardLocked,
             upsertPayrollItemRow, deletePayrollItemRow, currentMonthlyMonth, todayStr, logAudit, customAlert, customConfirm
   ========================================================================== */
(function () {
  'use strict';

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => String(+Number(n || 0).toFixed(2));
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const addId = (emp, m) => `auto_topup_${emp}_${m}`;   // បំពេញ (+)
  const cutId = (emp, m) => `auto_trim_${emp}_${m}`;    // តម្រឹមកាត់ (−)
  const curItem = (emp, m) => { const a = payrollItems.find(p => p.id === addId(emp, m)); if (a) return { item: a, sign: 1 }; const c = payrollItems.find(p => p.id === cutId(emp, m)); return c ? { item: c, sign: -1 } : null; };
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const EPS = 0.005;
  const shiftMonth = (m, d) => {
    let [y, mo] = m.split('-').map(Number); mo += d;
    while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  };
  const monthEnded = m => { const ds = daysInMonth(m); return todayStr() > ds[ds.length - 1]; };

  let overlay = null, curMonth = '', rows = [];
  let testMode = false, showDetail = false;

  // ---------------------------------------------------------------- គណនា ----
  // ចំនួនថ្ងៃច្បាប់ "គ្មានប្រាក់ឈ្នួល" (unpaid) ក្នុងខែ — ពេញថ្ងៃ + កន្លះថ្ងៃ/តាមម៉ោង
  function unpaidLeaveDays(emp, month) {
    let n = 0;
    const approved = leaveRequests.filter(r => r.employee_id === emp.id && r.status === 'approved');
    const stdH = settings.standardHours > 0 ? settings.standardHours : 8;
    daysInMonth(month).forEach(date => {
      try {
        partialLeaveInfo(emp.id, date).items.forEach(({ r: rq, h }) => { if (rq.leave_type === 'unpaid') n += h / stdH; });
      } catch (e) { /* ignore */ }
      const rec = attendance[date] && attendance[date][emp.id];
      if (rec && rec.status === 'leave') {
        const req = approved.find(r => r.start_date <= date && date <= r.end_date);
        if (req && req.leave_type === 'unpaid') n += 1;
      }
    });
    return n;
  }

  // ប្រាក់ឈ្នួលមូលដ្ឋាន = ឈ្នួលថ្ងៃធម្មតា + សម្រាកមានប្រាក់ឈ្នួល/បុណ្យ (មិនរាប់ថ្ងៃអាទិត្យ/បុណ្យដែលមកធ្វើការ ×2, OT, ប្រាក់បាយ)
  function basePay(emp, month) {
    let work = 0, leave = 0, wd = 0, ld = 0, xd = 0, open = 0, shortH = 0;
    const stdH = settings.standardHours > 0 ? settings.standardHours : 8;
    const start = emp.startDate || '0000-00-00';
    daysInMonth(month).forEach(date => {
      const rec = attendance[date] && attendance[date][emp.id];
      const premium = dayMultiplier(date) > 1;
      if (!rec || !rec.status) { if (date >= start && !premium) open++; return; } // ថ្ងៃធម្មតាដែលមិនទាន់មានវត្តមាន
      const r = computeRow(emp, rec, date);
      if (rec.status === 'leave') { leave += (r.leavePay || 0); ld++; return; }
      if (premium) { if (rec.status === 'present') xd++; return; } // ធ្វើការអាទិត្យ/បុណ្យ → បន្ថែមទាំងស្រុង មិនរាប់ក្នុងមូលដ្ឋាន
      work += (r.workPay || 0); leave += (r.leavePay || 0);
      if (rec.status === 'present') {
        wd++;
        // ម៉ោងដែលខ្វះក្នុងថ្ងៃដែលបានមក (ក្រោម 8 ម៉ោង ដកម៉ោងច្បាប់) → ជាការខាត មិនបំពេញត្រឡប់វិញ
        shortH += Math.max(0, stdH - (r.normalHours || 0) - (r.leavePayHours || 0));
      }
    });
    return { base: work + leave, work, leave, wd, ld, xd, open, shortH };
  }

  function calc(emp, month) {
    const salary = parseFloat(emp.salary) || 0;
    const dates = daysInMonth(month);
    const t = summarizeEmpMonth(emp, month);
    const absent = t.absentDays || 0;
    const unmarked = isMonthLocked(month) ? 0 : countUnmarkedDays(emp, month);
    const unpaid = unpaidLeaveDays(emp, month);
    const why = [];
    if (emp.status !== 'active') why.push('ឈប់ការងារ');
    if (emp.startDate && emp.startDate > dates[0]) why.push('ចូលធ្វើការកណ្តាលខែ');
    if (absent > 0) why.push(`អវត្តមាន ${num(absent)}`);
    if (unmarked > 0) why.push(`មិនទាន់កត់ ${unmarked} ថ្ងៃ`);
    if (unpaid > 1e-9) why.push(`ច្បាប់គ្មានប្រាក់ឈ្នួល ${num(unpaid)}`);
    const b = basePay(emp, month);
    const base = b.base;
    const dailyRate = settings.workDaysPerMonth > 0 ? salary / settings.workDaysPerMonth : 0;
    const hourlyRate = dailyRate / (settings.standardHours > 0 ? settings.standardHours : 8);
    const short = r2(b.shortH * hourlyRate);           // ប្រាក់នៃម៉ោងខ្វះក្នុងថ្ងៃដែលបានមក (មិនបំពេញ)
    const baseFull = base + b.shortH * hourlyRate;     // ចាត់ថ្ងៃដែលបានមកទាំងអស់ជាថ្ងៃពេញ → បំពេញតែថ្ងៃទាំងមូលដែលខ្វះ
    const diff = r2(salary - baseFull); // + ខ្វះ · − លើស
    const eligible = why.length === 0;
    const adj = eligible && Math.abs(diff) > EPS ? diff : 0; // ចំនួនតម្រឹម (+ បំពេញ / − កាត់)
    // ការព្យាករណ៍៖ ឧបមាថាថ្ងៃធម្មតាដែលមិនទាន់មានវត្តមាន (មិនទាន់កត់ + ថ្ងៃអនាគត) មកធ្វើការគ្រប់ថ្ងៃ
    const projBase = baseFull + b.open * dailyRate;
    const projDiff = r2(salary - projBase);
    return { salary, base, diff, adj, absent, unmarked, unpaid, eligible, why,
      dailyRate, short, shortHours: b.shortH, work: b.work, leave: b.leave, workDays: b.wd, leaveDays: b.ld, premiumDays: b.xd, open: b.open, projBase, projDiff };
  }

  function buildRows() {
    const q = (overlay.querySelector('#stQ').value || '').trim().toLowerCase();
    const f = overlay.querySelector('#stF').value;
    rows = payrollEmployeesForMonth(curMonth)
      .map(e => ({ e, c: calc(e, curMonth), cur: curItem(e.id, curMonth) }))
      .filter(r => (!q || ((r.e.name || '') + ' ' + (r.e.username || '')).toLowerCase().includes(q))
        && (!f || (f === 'need' ? r.c.adj !== 0 : f === 'ok' ? r.c.eligible && r.c.adj === 0 : !r.c.eligible)))
      .sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
  }

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.st-ovl{position:fixed;inset:0;z-index:9971;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.st-ovl.open{display:flex}
.st-box{width:100%;max-width:1100px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.st-box h2{margin:0 0 4px;font-size:1.05rem}
.st-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.st-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.st-bar input,.st-bar select{font-size:.8rem;padding:6px 8px}
.st-tbl td,.st-tbl th{white-space:nowrap;vertical-align:middle}
.st-no{color:#dc2626;font-weight:600}.st-ok{color:var(--success,#059669);font-weight:600}
.st-why{font-size:.68rem;color:#dc2626;white-space:normal;max-width:210px}
.st-act{padding:4px 9px;font-size:.78rem}
.st-sum{font-size:.8rem;font-weight:600;flex:1 0 100%;text-align:right}
.st-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
`;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'st-ovl';
    overlay.innerHTML = `
      <div class="st-box" role="dialog" aria-modal="true">
        <h2>🛡️ តម្រឹមប្រាក់ខែឱ្យស្មើប្រាក់ខែថេរ <span id="stMonthTxt" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="st-note">បុគ្គលិកដែលគ្មានអវត្តមាន · គ្មានថ្ងៃមិនទាន់កត់ · គ្មានច្បាប់គ្មានប្រាក់ឈ្នួល → ប្រាក់ខែថេរស្មើគ្នារាល់ខែ។ តម្រឹម = ប្រាក់ខែ − (ឈ្នួលថ្ងៃធម្មតា + សម្រាកមានប្រាក់ឈ្នួល/បុណ្យ)។ <b>ខ្វះ → បំពេញ (+)</b> · <b>លើស (ខែ 31 ថ្ងៃ) → កាត់តម្រឹម (−)</b>។ មិនរាប់ OT / ប្រាក់បាយ / ប្រាក់ ×2 ថ្ងៃអាទិត្យ·បុណ្យ (នៅជារបស់បុគ្គលិក)។</p>
        <div class="st-bar">
          <button class="secondary" id="stPrev" title="ខែមុន">◀</button>
          <input type="month" id="stMonth">
          <button class="secondary" id="stNext" title="ខែក្រោយ">▶</button>
          <input type="text" id="stQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="stF"><option value="">ទាំងអស់</option><option value="need">ត្រូវតម្រឹម</option><option value="ok">គ្រប់ប្រាក់ខែរួច</option><option value="no">មិនធានា</option></select>
          <button id="stApplyAll">🛡️ តម្រឹមអ្នកត្រូវតម្រឹមទាំងអស់</button>
          <button class="secondary" id="stCsv" title="ទាញយកតារាងជា CSV">⬇ CSV</button>
          <label style="display:flex;gap:5px;align-items:center;font-size:.78rem"><input type="checkbox" id="stTest"> 🧪 របៀបសាកល្បង (មិនរក្សាទុក)</label>
          <label style="display:flex;gap:5px;align-items:center;font-size:.78rem"><input type="checkbox" id="stDetail"> 🔍 បង្ហាញការគណនាលម្អិត</label>
          <label style="display:flex;gap:5px;align-items:center;font-size:.78rem" title="ពេលខែចប់ និងមិនទាន់បិទ ប្រព័ន្ធតម្រឹមឱ្យដោយស្វ័យប្រវត្តិ"><input type="checkbox" id="stAuto"> ⚙️ តម្រឹមស្វ័យប្រវត្តិ ពេលចប់ខែ</label>
          <span class="st-sum" id="stSum"></span>
        </div>
        <div id="stStatus"></div>
        <div class="table-wrap" style="max-height:52vh;overflow:auto">
          <table class="st-tbl">
            <thead><tr><th>#</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th style="text-align:right">ប្រាក់ខែ ($)</th><th style="text-align:right">ប្រាក់ឈ្នួលបាន ($)</th><th style="text-align:right">ខ្វះ(+)/លើស(−) ($)</th><th>ស្ថានភាព</th><th>បានតម្រឹមរួច</th><th>សកម្មភាព</th></tr></thead>
            <tbody id="stBody"></tbody>
          </table>
        </div>
        <div class="st-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="stClose">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    $('stClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    $('stMonth').addEventListener('change', e => setMonth(e.target.value));
    $('stPrev').addEventListener('click', () => setMonth(shiftMonth(curMonth, -1)));
    $('stNext').addEventListener('click', () => setMonth(shiftMonth(curMonth, 1)));
    $('stQ').addEventListener('input', render);
    $('stF').addEventListener('change', render);
    $('stApplyAll').addEventListener('click', bulk);
    $('stCsv').addEventListener('click', exportCsv);
    $('stTest').addEventListener('change', e => { testMode = e.target.checked; render(); });
    $('stDetail').addEventListener('change', e => { showDetail = e.target.checked; render(); });
    $('stAuto').checked = autoOn();
    $('stAuto').addEventListener('change', e => { setAuto(e.target.checked); if (e.target.checked) scheduleAuto(); });
    $('stBody').addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
      if (testMode) { await previewOne(id, act); return; }
      btn.disabled = true;
      try { if (act === 'del') await removeItem(id); else await applyItem(id); }
      finally { btn.disabled = false; }
      afterChange();
    });
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  function open() {
    if (!overlay) build();
    curMonth = (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
    overlay.querySelector('#stQ').value = ''; overlay.querySelector('#stF').value = '';
    overlay.classList.add('open');
    render();
  }

  function setMonth(m) {
    if (!MONTH_RE.test(m || '')) { overlay.querySelector('#stMonth').value = curMonth; return; }
    curMonth = m; render();
  }

  function render() {
    const $ = id => overlay.querySelector('#' + id);
    $('stMonthTxt').textContent = curMonth;
    $('stMonth').value = curMonth;
    const locked = isMonthLocked(curMonth), ended = monthEnded(curMonth);
    $('stStatus').innerHTML = (testMode ? '<div class="st-warn" style="background:#dbeafe;color:#1e40af">🧪 របៀបសាកល្បង៖ ប៊ូតុងទាំងអស់បង្ហាញលទ្ធផលជាមុនតែប៉ុណ្ណោះ — <b>គ្មានអ្វីត្រូវបានរក្សាទុកទេ</b> (ដំណើរការបានទោះខែបិទ ឬមិនទាន់ចប់)។ ដកធីកដើម្បីប្រើពិត។</div>' : '')
      + (locked ? '<div class="st-warn">🔒 ខែនេះបានបិទហើយ — មើលបានតែមិនអាចបំពេញ/ដកបានទេ។</div>' : '')
      + (!ended ? '<div class="st-warn">⏳ ខែនេះមិនទាន់ចប់ — ចំនួនខ្វះនៅបណ្ដោះអាសន្ន (ថ្ងៃនៅសល់នៅមិនទាន់គិត)។ ប៊ូតុង "បំពេញទាំងអស់" បិទរហូតដល់ចប់ខែ។</div>' : '');
    $('stApplyAll').disabled = !testMode && (locked || !ended);
    $('stApplyAll').textContent = testMode ? '🧪 មើលជាមុន៖ តម្រឹមទាំងអស់' : '🛡️ តម្រឹមអ្នកត្រូវតម្រឹមទាំងអស់';
    buildRows();
    let nPlus = 0, nMinus = 0, nOk = 0, nNo = 0, sumPlus = 0, sumMinus = 0;
    rows.forEach(r => {
      if (!r.c.eligible) nNo++; else if (r.c.adj > 0) nPlus++; else if (r.c.adj < 0) nMinus++; else nOk++;
      if (r.cur) { if (r.cur.sign > 0) sumPlus += Number(r.cur.item.amount) || 0; else sumMinus += Number(r.cur.item.amount) || 0; }
    });
    $('stSum').textContent = `ត្រូវបំពេញ(+) ${nPlus} នាក់ · ត្រូវកាត់(−) ${nMinus} នាក់ · គ្រប់ប្រាក់ខែរួច ${nOk} នាក់ · មិនតម្រឹម ${nNo} នាក់ · បានតម្រឹមរួច +$${money(sumPlus)} / −$${money(sumMinus)}`;
    $('stBody').innerHTML = rows.length ? rows.map(({ e, c, cur }, i) => {
      const dis = (locked || !ended) && !testMode ? 'disabled' : ''; // ខែមិនទាន់ចប់ → បិទប៊ូតុងរក្សាទុក (ការពារតម្រឹមមុនពេល)
      const status = !c.eligible ? `<span class="st-no">✕ មិនតម្រឹម</span><div class="st-why">${esc(c.why.join(' · '))}</div>`
        : (c.adj > 0 ? '<span class="st-no">⚠ ខ្វះ → បំពេញ</span>' : c.adj < 0 ? '<span class="st-no" style="color:#b45309">🔻 លើស → កាត់</span>' : '<span class="st-ok">✓ គ្រប់ប្រាក់ខែ</span>');
      const shown = cur ? `<span class="${cur.sign > 0 ? 'st-ok' : 'st-no'}">${cur.sign > 0 ? '➕ +' : '➖ −'}$${money(cur.item.amount)}</span>` : '<span style="color:var(--text-muted)">—</span>';
      const stale = cur && Math.abs(cur.sign * (Number(cur.item.amount) || 0) - c.adj) > EPS ? ` <span class="st-no" title="ចំនួនបានតម្រឹមខុសពីការគណនាថ្មី">≠ ${c.adj >= 0 ? '+' : '−'}$${money(Math.abs(c.adj))}</span>` : '';
      const diffTxt = c.eligible ? (c.diff > 0 ? '+' : c.diff < 0 ? '−' : '') + money(Math.abs(c.diff)) : '—';
      const detail = showDetail ? `<tr class="st-det"><td></td><td colspan="9" style="white-space:normal;font-size:.72rem;color:var(--text-muted,#5b6b80);padding:2px 8px 8px">
        តម្លៃថ្ងៃ $${money(c.dailyRate)} (= ${money(c.salary)} ÷ ${num(settings.workDaysPerMonth)}) · ថ្ងៃធម្មតាធ្វើការ ${c.workDays} · ថ្ងៃច្បាប់/បុណ្យ ${c.leaveDays}${c.premiumDays ? ` · ធ្វើការអាទិត្យ/បុណ្យ ${c.premiumDays} ថ្ងៃ (ប្រាក់ ×2 នៅជារបស់បុគ្គលិក មិនរាប់)` : ''}<br>
        ឈ្នួលធម្មតា $${money(c.work)} + LeavePay $${money(c.leave)} = <b>$${money(c.base)}</b>${c.short > 0 ? ` · ម៉ោងខ្វះក្នុងថ្ងៃដែលបានមក ${num(c.shortHours)} ម៉ោង (−$${money(c.short)}) មិនបំពេញ` : ''}<br>ប្រាក់ខែ − (ឈ្នួល + ម៉ោងខ្វះ) = ${money(c.salary)} − ${money(c.base + c.short)} = <b>${c.diff >= 0 ? '+' : '−'}$${money(Math.abs(c.diff))}</b>${c.eligible ? '' : ' (មិនតម្រឹម → $0)'}
        ${c.open > 0 ? `<br>📈 ព្យាករណ៍៖ បើ ${c.open} ថ្ងៃធម្មតាដែលនៅមិនទាន់មានវត្តមាន មកធ្វើការគ្រប់ → ឈ្នួល $${money(c.projBase)} → ${c.projDiff > 0 ? 'ខ្វះ' : c.projDiff < 0 ? 'លើស' : 'ស្មើ'} <b>$${money(Math.abs(c.projDiff))}</b>` : ''}</td></tr>` : '';
      const btn = c.adj !== 0 || (cur && c.eligible) ? `<button class="st-act" data-act="add" ${dis}>🛡️ ${cur ? 'អាប់ដេត' : (c.adj < 0 ? 'កាត់តម្រឹម' : 'បំពេញ')}</button>` : '';
      return `<tr data-id="${esc(e.id)}">
        <td>${i + 1}</td><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td>
        <td style="text-align:right">${money(c.salary)}</td><td style="text-align:right">${money(c.base)}</td><td style="text-align:right">${diffTxt}</td>
        <td>${status}</td><td>${shown}${stale}</td>
        <td>${btn}${cur ? ` <button class="secondary st-act" data-act="del" title="ដកចេញ" ${dis}>✕</button>` : ''}</td>
      </tr>${detail}`;
    }).join('') : '<tr><td colspan="10" style="padding:16px">មិនមានបុគ្គលិក</td></tr>';
  }

  function afterChange() {
    render();
    if (typeof renderMonthlyTab === 'function') { try { renderMonthlyTab(); } catch (e) { /* ignore */ } }
    if (typeof renderPayrollTab === 'function') { try { renderPayrollTab(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- សកម្មភាព ----
  const auditItem = x => x ? { name: x.name, type: x.type, currency: 'USD', amount: x.amount } : null;

  async function dropItem(id, empId, month) {
    const prev = payrollItems.find(p => p.id === id);
    if (!prev) return false;
    if (!(await deletePayrollItemRow(id))) return false;
    payrollItems = payrollItems.filter(p => p.id !== id);
    if (typeof logAudit === 'function') logAudit('topup_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: auditItem(prev), new: null });
    return true;
  }

  // បំពេញ (+) ឬ កាត់តម្រឹម (−) តាមសញ្ញានៃ c.adj — មួយបុគ្គលិក/ខែ មានតែមួយ
  async function applyItem(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'តម្រឹមប្រាក់ខែ'); return false; }
    const emp = payrollEmployeesForMonth(month).find(e => String(e.id) === String(empId));
    if (!emp) return false;
    const c = calc(emp, month);
    if (!c.eligible || c.adj === 0) { // លែងត្រូវតម្រឹម → ដកធាតុចាស់ចេញ (បើមាន)
      if (curItem(empId, month)) return removeItem(empId, silent);
      if (!silent) await customAlert(c.eligible ? 'បុគ្គលិកនេះបានប្រាក់ខែគ្រប់រួចហើយ មិនបាច់តម្រឹមទេ' : 'បុគ្គលិកនេះមិនត្រូវបានតម្រឹម៖ ' + c.why.join(' · '));
      return false;
    }
    const plus = c.adj > 0;
    const id = plus ? addId(empId, month) : cutId(empId, month), otherId = plus ? cutId(empId, month) : addId(empId, month);
    const amount = r2(Math.abs(c.adj));
    const item = plus
      ? { id, employeeId: empId, type: 'benefit', name: `បំពេញប្រាក់ខែ ${month}`, recurrence: 'variable', month, currency: 'USD', amount }
      : { id, employeeId: empId, type: 'deduction', name: `តម្រឹមប្រាក់ខែ ${month}`, recurrence: 'variable', month, currency: 'USD', amount };
    const old = payrollItems.find(p => p.id === id) || null;
    if (!(await upsertPayrollItemRow(item))) return false;
    const idx = payrollItems.findIndex(p => p.id === id);
    if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
    if (typeof logAudit === 'function') logAudit('topup_apply', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: auditItem(old), new: auditItem(item) });
    await dropItem(otherId, empId, month); // ដកប្រភេទផ្ទុយចេញ
    return true;
  }

  async function removeItem(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'ដកការតម្រឹម'); return false; }
    let any = false;
    for (const id of [addId(empId, month), cutId(empId, month)]) { if (await dropItem(id, empId, month)) any = true; }
    return any;
  }

  const fmtAdj = a => (a >= 0 ? '+$' : '−$') + money(Math.abs(a));

  async function previewOne(empId, act) {
    const emp = payrollEmployeesForMonth(curMonth).find(e => String(e.id) === String(empId));
    if (!emp) return;
    const c = calc(emp, curMonth);
    if (act === 'del') { await customAlert(`🧪 សាកល្បង: នឹងដកការតម្រឹមរបស់ ${emp.name} (មិនបានធ្វើ)`); return; }
    await customAlert(`🧪 សាកល្បង (មិនរក្សាទុក) — ${emp.name}\nប្រាក់ខែ $${money(c.salary)} · ឈ្នួលបាន $${money(c.base)}\n` + (c.eligible ? (c.adj > 0 ? `នឹងបំពេញ ${fmtAdj(c.adj)} (ខ្វះ)` : c.adj < 0 ? `នឹងកាត់តម្រឹម ${fmtAdj(c.adj)} (លើស)` : 'គ្រប់ប្រាក់ខែរួច មិនបាច់តម្រឹម') : `មិនតម្រឹម៖ ${c.why.join(' · ')}`)
      + (c.open > 0 ? `\n📈 បើ ${c.open} ថ្ងៃដែលនៅសល់មកគ្រប់ → ${c.projDiff > 0 ? 'ខ្វះ' : c.projDiff < 0 ? 'លើស' : 'ស្មើ'} $${money(Math.abs(c.projDiff))}` : ''));
  }

  function exportCsv() {
    buildRows();
    const head = ['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ប្រាក់ខែ', 'តម្លៃថ្ងៃ', 'ថ្ងៃធ្វើការ', 'ថ្ងៃច្បាប់/បុណ្យ', 'ថ្ងៃអាទិត្យ/បុណ្យធ្វើការ', 'ឈ្នួលធម្មតា', 'LeavePay', 'ប្រាក់ឈ្នួលបាន', 'ម៉ោងខ្វះ($ មិនបំពេញ)', 'ខ្វះ(+)/លើស(−)', 'តម្រឹម', 'មូលហេតុមិនតម្រឹម', 'ត្រូវតម្រឹម(+/−)', 'ថ្ងៃនៅសល់(មិនទាន់កត់)', 'ព្យាករណ៍ ខ្វះ(+)/លើស(−) បើមកគ្រប់', 'បានតម្រឹមរួច(+/−)'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [head.map(q).join(',')].concat(rows.map(({ e, c, cur }) => [e.username, e.name, e.dept, r2(c.salary), r2(c.dailyRate), c.workDays, c.leaveDays, c.premiumDays, r2(c.work), r2(c.leave), r2(c.base), r2(c.short), r2(c.diff),
      c.eligible ? 'បាទ' : 'ទេ', c.why.join(' · '), r2(c.adj), c.open, r2(c.projDiff), cur ? r2(cur.sign * (Number(cur.item.amount) || 0)) : ''].map(q).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `salary-adjust-${curMonth}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const mismatch = (c, cur) => !cur ? c.adj !== 0 : Math.abs(cur.sign * (Number(cur.item.amount) || 0) - c.adj) > EPS;

  async function bulk() {
    const month = curMonth;
    const all = payrollEmployeesForMonth(month).map(e => ({ e, c: calc(e, month), cur: curItem(e.id, month) }));
    if (testMode) { // សាកល្បង៖ បង្ហាញលទ្ធផលជាមុន មិនរក្សាទុក
      const need = all.filter(({ c }) => c.adj !== 0);
      const lines = need.map(t => `${t.e.name}: ${fmtAdj(t.c.adj)}`).join('\n') || '(គ្មាន)';
      await customAlert(`🧪 សាកល្បង (មិនរក្សាទុក) — ខែ ${month}${monthEnded(month) ? '' : ' · ⏳ មិនទាន់ចប់ខែ (លេខបណ្ដោះអាសន្ន)'}\nនឹងតម្រឹម ${need.length} នាក់ សរុប ${fmtAdj(need.reduce((a, t) => a + t.c.adj, 0))}\n${lines}`);
      return;
    }
    if (guardLocked(month, 'តម្រឹមប្រាក់ខែ')) return;
    if (!monthEnded(month)) { await customAlert('ខែនេះមិនទាន់ចប់ — សូមតម្រឹមក្រោយចប់ខែ'); return; }
    const targets = all.filter(({ c, cur }) => c.adj !== 0 && mismatch(c, cur));
    const stale = all.filter(({ c, cur }) => cur && c.adj === 0); // ធាតុចាស់ដែលលែងត្រូវមាន
    if (!targets.length && !stale.length) { await customAlert('គ្មានបុគ្គលិកត្រូវតម្រឹមទេ (ឬបានតម្រឹមរួចហើយ)'); return; }
    const preview = targets.slice(0, 8).map(t => `${t.e.name} ${fmtAdj(t.c.adj)}`).join('\n') + (targets.length > 8 ? `\n…(+${targets.length - 8})` : '');
    if (!(await customConfirm(`🛡️ តម្រឹមប្រាក់ខែ ${targets.length} នាក់ ក្នុងខែ ${month}?\n${preview}${stale.length ? `\n\nនិងដកធាតុចាស់ដែលលែងត្រូវមាន ${stale.length} នាក់` : ''}`))) return;
    let ok = 0;
    for (const t of targets) { if (await applyItem(t.e.id, true)) ok++; }
    for (const x of stale) { await removeItem(x.e.id, true); }
    afterChange();
    await customAlert(`បានតម្រឹម ${ok}/${targets.length} នាក់${stale.length ? ` · ដកធាតុចាស់ ${stale.length}` : ''}`);
  }

  // ------------------------------------------------------- តម្រឹមស្វ័យប្រវត្តិ ----
  // ពេលខែចប់ + មិនទាន់បិទ → បំពេញ/កាត់តម្រឹមឱ្យអ្នកត្រូវតម្រឹម (id ថេរ មិនស្ទួន)។ បើកដោយធីក ⚙️ ក្នុងប្រអប់នេះ (លំនាំដើម៖ បិទ)
  // សុវត្ថិភាព៖ មិនដកធាតុចាស់ចេញដោយស្វ័យប្រវត្តិ · មិនធ្វើបើទិន្នន័យផ្ទុកមិនពេញ ឬមិនមានវត្តមានក្នុងខែ
  const AUTO_KEY = 'topup_auto';
  const autoOn = () => { try { return !!(window.appKV && window.appKV.get(AUTO_KEY, '') === '1'); } catch (e) { return false; } };
  const setAuto = v => { try { if (window.appKV) window.appKV.set(AUTO_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } };
  let autoBusy = false, autoTimer = null;

  async function autoApplyMonth(month) {
    if (!MONTH_RE.test(month) || isMonthLocked(month) || !monthEnded(month)) return 0;
    if (typeof loadFailures !== 'undefined' && loadFailures && Object.keys(loadFailures).length) return 0;
    if (!Object.keys(attendance || {}).some(d => d.slice(0, 7) === month)) return 0; // វត្តមានមិនទាន់ផ្ទុក
    const saved = curMonth; curMonth = month; let n = 0;
    try {
      const targets = payrollEmployeesForMonth(month)
        .map(e => ({ e, c: calc(e, month), cur: curItem(e.id, month) }))
        .filter(({ c, cur }) => c.eligible && c.adj !== 0 && mismatch(c, cur));
      for (const t of targets) { if (await applyItem(t.e.id, true)) n++; }
    } finally { curMonth = saved; }
    return n;
  }

  async function autoApply() {
    if (autoBusy || !autoOn()) return;
    autoBusy = true;
    try {
      const months = new Set([shiftMonth(todayStr().slice(0, 7), -1)]);
      if (typeof currentMonthlyMonth === 'function') { const m = currentMonthlyMonth(); if (m) months.add(m); }
      let changed = 0;
      for (const m of months) changed += await autoApplyMonth(m);
      if (changed) {
        if (typeof renderMonthlyTab === 'function') { try { renderMonthlyTab(); } catch (e) { /* ignore */ } }
        if (typeof renderPayrollTab === 'function') { try { renderPayrollTab(); } catch (e) { /* ignore */ } }
        if (overlay && overlay.classList.contains('open')) render();
      }
    } catch (e) { console.warn('salary-topup auto', e); }
    finally { autoBusy = false; }
  }
  function scheduleAuto() { clearTimeout(autoTimer); autoTimer = setTimeout(autoApply, 1200); }

  function hookMonthly() {
    if (typeof window.renderMonthlyTab !== 'function' || window.renderMonthlyTab.__tu) return;
    const orig = window.renderMonthlyTab;
    const wrapped = function () { const r = orig.apply(this, arguments); if (!autoBusy) scheduleAuto(); return r; };
    wrapped.__tu = true; window.renderMonthlyTab = wrapped;
  }

  // ---------------------------------------------------------------- init ----
  function init() {
    if (document.getElementById('monthlyTopupBtn')) return;
    const anchor = document.getElementById('monthlyFullBtn') || document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyTopupBtn'; btn.type = 'button';
    btn.textContent = '🛡️ តម្រឹមប្រាក់ខែ';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init(); hookMonthly(); }); else { init(); hookMonthly(); }
  window.openSalaryTopup = open;
  window.salaryTopupCalc = calc; // សម្រាប់សាកល្បង/ពិនិត្យ
})();
