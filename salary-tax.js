/* ==========================================================================
   salary-tax.js — ពន្ធលើប្រាក់បៀវត្សរ៍ (Tax on Salary / ToS) · Admin
   • គណនាជារៀល តាមអត្រាកើនតាមកម្រិត (០% / ៥% / ១០% / ១៥% / ២០%) បន្ទាប់ពីកាត់ប្រាក់អ្នកក្នុងបន្ទុក
   • អ្នកក្នុងបន្ទុក (ប្រពន្ធ/កូន ×150,000៛) និង "មិនមែនអ្នករស់នៅ" (២០% ថេរ) តាមបុគ្គលិកម្នាក់ៗ
   • អត្រាប្តូរប្រាក់ប្រចាំខែ (អត្រាផ្លូវការថ្ងៃទី ១៥) · អត្រា/កម្រិតពន្ធកែបាន — រក្សាក្នុង Supabase
   • ➖ កាត់ពន្ធចេញពីប្រាក់ខែ (ធាតុ deduction id ថេរ មិនស្ទួន) · 📊 Export Excel សម្រាប់ដាក់ពន្ធ

   ដំឡើង៖ ① Run salary-tax.sql ក្នុង Supabase (ត្រូវ Run bank-pay.sql ជាមុន)
           ② index.html ដាក់ក្រោម script.js៖  <script src="salary-tax.js"></script>
   ⚠ ការគណនានេះជាជំនួយ — អត្រា/លក្ខខណ្ឌអាចប្តូរ សូមផ្ទៀងផ្ទាត់ជាមួយ GDT/គណនេយ្យករ មុនដាក់ពន្ធ
   លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ========================================================================== */
(function () {
  'use strict';

  const DEF_RULES = {
    depAllowance: 150000,           // ៛ ក្នុងអ្នកក្នុងបន្ទុកម្នាក់/ខែ
    nonResRate: 0.20,               // មិនមែនអ្នករស់នៅ៖ ២០% ថេរ លើប្រាក់ខែទាំងអស់
    brackets: [[1500000, 0], [2000000, 0.05], [8500000, 0.10], [12500000, 0.15], [null, 0.20]], // [កំណត់លើ ៛, អត្រា]
    subLateLeave: true,             // កាត់ប្រាក់យឺត/ច្បាប់ ចេញពីមូលដ្ឋានពន្ធ
    fxByMonth: {},                  // { 'YYYY-MM': រៀល/ដុល្លារ }
  };
  let rules = JSON.parse(JSON.stringify(DEF_RULES));
  let rulesWarn = '';
  let taxInfo = {};                 // empId -> { dependents, non_resident }
  let taxReady = false, taxError = '';
  let adminPw = null;
  let overlay = null, curMonth = '', rows = [], rulesTimer = null, busy = false;

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const r4 = n => Math.round((Number(n) || 0) * 10000) / 10000;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const riel = n => Math.round(Number(n) || 0).toLocaleString();
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const shiftMonth = (m, d) => { let [y, mo] = m.split('-').map(Number); mo += d; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
  const itemId = (emp, m) => `auto_tos_${emp}_${m}`;
  const defaultFx = () => (typeof settings !== 'undefined' && settings && settings.exchangeRate > 0) ? settings.exchangeRate : 4100;
  const fxOf = m => { const v = parseFloat(rules.fxByMonth && rules.fxByMonth[m]); return v > 0 ? v : defaultFx(); };

  // ---------------------------------------------------------------- គណនា ----
  function calcTos(baseKHR, deps, nonRes) {
    if (nonRes) return { taxable: baseKHR, tax: Math.round(baseKHR * rules.nonResRate) };
    const taxable = Math.max(0, baseKHR - Math.max(0, deps) * rules.depAllowance);
    let tax = 0, prev = 0;
    for (const [cap, rate] of rules.brackets) {
      const upper = cap == null ? Infinity : cap;
      if (taxable > prev) tax += (Math.min(taxable, upper) - prev) * rate;
      if (taxable <= upper) break;
      prev = upper;
    }
    return { taxable, tax: Math.round(tax) };
  }

  function computeRow(e, month) {
    const locked = isMonthLocked(month);
    const t = summarizeEmpMonth(e, month);
    let base = (Number(t.total) || 0) + (Number(t.benefitsUSD) || 0);
    let ll = 0;
    if (rules.subLateLeave) {
      if (locked) { const ap = payrollItems.find(p => p.id === dedItemId(e.id, month)); ll = ap ? payrollItemToUSD(ap) : 0; }
      else ll = calcDeductionRow(e, month).total || 0;
      base -= ll;
    }
    base = Math.max(0, base);
    const fx = fxOf(month), baseKHR = Math.round(base * fx);
    const inf = taxInfo[e.id] || { dependents: 0, non_resident: false };
    const c = calcTos(baseKHR, inf.dependents || 0, !!inf.non_resident);
    return { e, base, ll, fx, baseKHR, deps: inf.dependents || 0, nonRes: !!inf.non_resident, taxable: c.taxable, taxKHR: c.tax, taxUSD: r4(c.tax / fx),
      applied: payrollItems.find(p => p.id === itemId(e.id, month)) || null };
  }

  // ---------------------------------------------------------------- Supabase ----
  async function loadRules() {
    rulesWarn = '';
    try {
      const { data, error } = await supabaseClient.from('app_settings').select('tos_rules').eq('id', 1).maybeSingle();
      if (error) { rulesWarn = /tos_rules/.test(error.message) ? 'មិនទាន់មាន column tos_rules — សូម Run salary-tax.sql (អត្រានឹងមិនត្រូវបានរក្សាទុក)' : error.message; return; }
      const r = data && data.tos_rules;
      if (r && typeof r === 'object') {
        rules = {
          depAllowance: Math.max(0, parseFloat(r.depAllowance) || DEF_RULES.depAllowance),
          nonResRate: Math.min(1, Math.max(0, parseFloat(r.nonResRate))) || DEF_RULES.nonResRate,
          brackets: Array.isArray(r.brackets) && r.brackets.length ? r.brackets.map(b => [b[0] == null ? null : Math.max(0, parseFloat(b[0]) || 0), Math.min(1, Math.max(0, parseFloat(b[1]) || 0))]) : DEF_RULES.brackets,
          subLateLeave: r.subLateLeave !== false,
          fxByMonth: (r.fxByMonth && typeof r.fxByMonth === 'object') ? r.fxByMonth : {},
        };
      }
    } catch (e) { rulesWarn = String(e && e.message || e); }
  }
  async function saveRulesNow() {
    const { data, error } = await supabaseClient.from('app_settings').update({ tos_rules: rules }).eq('id', 1).select('id');
    if (error || !data || !data.length) { rulesWarn = error ? error.message : 'រកមិនឃើញ app_settings (id=1)'; return false; }
    rulesWarn = ''; return true;
  }
  function saveRules() { clearTimeout(rulesTimer); rulesTimer = setTimeout(async () => { await saveRulesNow(); if (overlay && overlay.classList.contains('open')) renderBanner(); }, 700); }

  async function taxRpc(fn, args) {
    let pw = adminPw;
    if (!pw) pw = await customPrompt('បញ្ចូលពាក្យសម្ងាត់ Admin ដើម្បីមើល/កែអ្នកក្នុងបន្ទុក៖', true);
    if (!pw) return { cancelled: true };
    const { data, error } = await supabaseClient.rpc(fn, { p_password: pw, ...args });
    if (error && /unauthorized/i.test(error.message)) { adminPw = null; return { error: { message: 'ពាក្យសម្ងាត់ Admin មិនត្រឹមត្រូវ' } }; }
    if (error && /tax_(load|save)|_bank_auth/.test(error.message) && /does not exist|Could not find/i.test(error.message)) return { error: { message: 'មិនទាន់ Run salary-tax.sql (និង bank-pay.sql) ក្នុង Supabase' } };
    if (!error) adminPw = pw;
    return { data, error };
  }
  async function loadTax() {
    taxReady = false; taxError = '';
    const { data, error, cancelled } = await taxRpc('tax_load', {});
    if (cancelled) { taxError = 'បានបោះបង់ — មិនទាន់ផ្ទុកអ្នកក្នុងបន្ទុក'; return false; }
    if (error) { taxError = error.message; return false; }
    taxInfo = {};
    (data || []).forEach(r => { taxInfo[r.employee_id] = { dependents: r.dependents || 0, non_resident: !!r.non_resident }; });
    taxReady = true; return true;
  }

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.tx-ovl{position:fixed;inset:0;z-index:9965;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.tx-ovl.open{display:flex}
.tx-box{width:100%;max-width:1240px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.tx-box h2{margin:0 0 4px;font-size:1.05rem}
.tx-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.tx-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.tx-bar input,.tx-bar select{font-size:.8rem;padding:6px 8px}
.tx-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
.tx-tbl td,.tx-tbl th{white-space:nowrap;vertical-align:middle}
.tx-tbl input[type=number]{width:62px;font-size:.78rem;padding:5px 6px;text-align:center}
.tx-r{text-align:right;font-variant-numeric:tabular-nums}
.tx-ok{color:var(--success,#059669);font-weight:600}
.tx-sum{font-size:.82rem;font-weight:600;flex:1 0 100%;text-align:right}
.tx-rules{border:1px solid var(--border,#e1e8ef);border-radius:12px;padding:8px 12px;margin:8px 0}
.tx-rules summary{cursor:pointer;font-size:.82rem;font-weight:600}
.tx-rules table{margin-top:6px}
.tx-rules input{font-size:.78rem;padding:5px 6px;width:130px;text-align:right}
@media print{.tx-ovl{display:none!important}}
`;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'tx-ovl';
    overlay.innerHTML = `
      <div class="tx-box" role="dialog" aria-modal="true">
        <h2>🧾 ពន្ធលើប្រាក់បៀវត្សរ៍ <span id="txMonthTxt" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="tx-note">គណនាជារៀល៖ មូលដ្ឋាន (ប្រាក់តាមវត្តមាន + អត្ថប្រយោជន៍ ± ប្រាក់កាត់យឺត/ច្បាប់) × អត្រាប្តូរប្រាក់ → ដកអ្នកក្នុងបន្ទុក → អត្រាកើនតាមកម្រិត។ ជាជំនួយប៉ុណ្ណោះ សូមផ្ទៀងផ្ទាត់ជាមួយ GDT/គណនេយ្យករ។</p>
        <div id="txBanner"></div>
        <div class="tx-bar">
          <button class="secondary" id="txPrev" title="ខែមុន">◀</button>
          <input type="month" id="txMonth">
          <button class="secondary" id="txNext" title="ខែក្រោយ">▶</button>
          <label style="font-size:.78rem;display:flex;gap:6px;align-items:center;margin:0">អត្រាប្តូរប្រាក់ថ្ងៃទី ១៥ (៛/$)
            <input type="number" id="txFx" min="1" step="1" style="width:92px"></label>
          <label style="font-size:.78rem;display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="txSub"> កាត់ប្រាក់យឺត/ច្បាប់ ចេញពីមូលដ្ឋាន</label>
        </div>
        <details class="tx-rules"><summary>⚙ អត្រា និងកម្រិតពន្ធ</summary>
          <div class="tx-bar"><label style="font-size:.78rem;margin:0">កាត់ក្នុងអ្នកក្នុងបន្ទុកម្នាក់ (៛/ខែ) <input type="number" id="txDepAmt" min="0" step="1000"></label>
          <label style="font-size:.78rem;margin:0">មិនមែនអ្នករស់នៅ (%) <input type="number" id="txNrRate" min="0" max="100" step="1" style="width:80px"></label></div>
          <table class="tx-tbl"><thead><tr><th>កម្រិតខាងលើ (៛/ខែ) <small>(ទទេ = គ្មានដែនកំណត់)</small></th><th>អត្រា (%)</th></tr></thead><tbody id="txBrk"></tbody></table>
          <div class="tx-bar"><button class="secondary" id="txRulesReset">↺ អត្រាស្តង់ដារ</button><button id="txRulesSave">💾 រក្សាទុកអត្រា</button></div>
        </details>
        <div class="tx-bar">
          <button id="txSaveDeps">💾 រក្សាទុកអ្នកក្នុងបន្ទុក</button>
          <button id="txApplyAll">➖ កាត់ពន្ធចេញពីប្រាក់ខែ (ទាំងអស់)</button>
          <button class="secondary" id="txRemoveAll">✕ ដកពន្ធទាំងអស់</button>
          <button class="secondary" id="txXlsx">📊 Export Excel</button>
          <span class="tx-sum" id="txSum"></span>
        </div>
        <div class="table-wrap" style="max-height:48vh;overflow:auto"><table class="tx-tbl">
          <thead><tr><th>#</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th class="tx-r">មូលដ្ឋាន ($)</th><th class="tx-r">មូលដ្ឋាន (៛)</th><th>អ្នកក្នុងបន្ទុក</th><th>មិនមែនអ្នករស់នៅ</th><th class="tx-r">ប្រាក់ត្រូវជាប់ពន្ធ (៛)</th><th class="tx-r">ពន្ធ (៛)</th><th class="tx-r">ពន្ធ ($)</th><th>ស្ថានភាព</th><th></th></tr></thead>
          <tbody id="txBody"></tbody><tfoot id="txFoot"></tfoot></table></div>
        <div class="tx-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="txClose">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    $('txClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    $('txMonth').addEventListener('change', e => setMonth(e.target.value));
    $('txPrev').addEventListener('click', () => setMonth(shiftMonth(curMonth, -1)));
    $('txNext').addEventListener('click', () => setMonth(shiftMonth(curMonth, 1)));
    $('txFx').addEventListener('change', () => { const v = parseFloat($('txFx').value); rules.fxByMonth = rules.fxByMonth || {}; if (v > 0) rules.fxByMonth[curMonth] = v; else delete rules.fxByMonth[curMonth]; saveRules(); render(); });
    $('txSub').addEventListener('change', () => { rules.subLateLeave = $('txSub').checked; saveRules(); render(); });
    $('txRulesSave').addEventListener('click', applyRulesForm);
    $('txRulesReset').addEventListener('click', () => { const fx = rules.fxByMonth, sub = rules.subLateLeave; rules = JSON.parse(JSON.stringify(DEF_RULES)); rules.fxByMonth = fx; rules.subLateLeave = sub; fillRulesForm(); saveRules(); render(); });
    $('txSaveDeps').addEventListener('click', saveDeps);
    $('txApplyAll').addEventListener('click', () => bulk('apply'));
    $('txRemoveAll').addEventListener('click', () => bulk('remove'));
    $('txXlsx').addEventListener('click', exportXlsx);
    $('txBody').addEventListener('input', e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const id = tr.dataset.id, cur = taxInfo[id] || { dependents: 0, non_resident: false };
      if (e.target.classList.contains('tx-dep')) cur.dependents = Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0));
      if (e.target.classList.contains('tx-nr')) cur.non_resident = e.target.checked;
      taxInfo[id] = cur; tr.dataset.dirty = '1'; dirty.add(id);
      renderRowsOnly(tr);
    });
    $('txBody').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]'); if (!btn || busy) return;
      busy = true; btn.disabled = true;
      try {
        const id = btn.closest('tr').dataset.id;
        if (btn.dataset.act === 'apply') await applyOne(id); else await removeOne(id);
      } finally { busy = false; }
      render();
    });
  }
  const dirty = new Set();

  function close() { if (overlay) overlay.classList.remove('open'); }
  async function open() {
    if (!overlay) build();
    curMonth = (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
    overlay.classList.add('open');
    overlay.querySelector('#txBody').innerHTML = '<tr><td colspan="12" style="padding:16px">កំពុងផ្ទុក...</td></tr>';
    await loadRules();
    await loadTax();
    dirty.clear();
    fillRulesForm();
    render();
  }
  function setMonth(m) {
    const input = overlay.querySelector('#txMonth');
    if (!MONTH_RE.test(m || '')) { input.value = curMonth; return; }
    curMonth = m; render();
  }

  function fillRulesForm() {
    const $ = id => overlay.querySelector('#' + id);
    $('txDepAmt').value = rules.depAllowance;
    $('txNrRate').value = Math.round(rules.nonResRate * 10000) / 100;
    $('txBrk').innerHTML = rules.brackets.map((b, i) => `<tr><td><input type="number" class="tx-bcap" min="0" step="1000" value="${b[0] == null ? '' : b[0]}" ${i === rules.brackets.length - 1 ? 'placeholder="∞" disabled' : ''}></td><td><input type="number" class="tx-brate" min="0" max="100" step="0.5" value="${Math.round(b[1] * 10000) / 100}" style="width:80px"></td></tr>`).join('');
  }
  function applyRulesForm() {
    const $ = id => overlay.querySelector('#' + id);
    const caps = [...overlay.querySelectorAll('.tx-bcap')], rates = [...overlay.querySelectorAll('.tx-brate')];
    const nb = caps.map((c, i) => [i === caps.length - 1 ? null : (parseFloat(c.value) || 0), Math.min(100, Math.max(0, parseFloat(rates[i].value) || 0)) / 100]);
    for (let i = 1; i < nb.length - 1; i++) if (nb[i][0] <= nb[i - 1][0]) { customAlert('កម្រិតត្រូវកើនឡើងតាមលំដាប់'); return; }
    rules.depAllowance = Math.max(0, parseFloat($('txDepAmt').value) || 0);
    rules.nonResRate = Math.min(100, Math.max(0, parseFloat($('txNrRate').value) || 0)) / 100;
    rules.brackets = nb;
    saveRules(); render();
    customAlert('បានអនុវត្តអត្រា (កំពុងរក្សាទុកក្នុង Supabase)');
  }

  function renderBanner() {
    const el = overlay.querySelector('#txBanner');
    el.innerHTML = (rulesWarn ? `<div class="tx-warn">⚠️ ${esc(rulesWarn)}</div>` : '')
      + (!taxReady ? `<div class="tx-warn">⚠️ មិនទាន់ផ្ទុកអ្នកក្នុងបន្ទុក៖ ${esc(taxError || '—')} — ពន្ធដែលបង្ហាញសន្មតថា "គ្មានអ្នកក្នុងបន្ទុក" ហើយប៊ូតុងកាត់ពន្ធត្រូវបានបិទ។ <button class="secondary" id="txRetry" style="padding:3px 8px;font-size:.74rem">↻ ព្យាយាមម្តងទៀត</button></div>` : '')
      + (isMonthLocked(curMonth) ? '<div class="tx-warn" style="background:#e0f2fe;color:#075985">🔒 ខែនេះបានបិទ — មើលបានតែមិនអាចកាត់/ដកពន្ធបាន។</div>' : '');
    const rt = overlay.querySelector('#txRetry'); if (rt) rt.addEventListener('click', open);
  }

  function rowHtml(r, i, locked) {
    const dis = locked || !taxReady ? 'disabled' : '';
    return `<tr data-id="${esc(r.e.id)}">
      <td>${i + 1}</td><td>${esc(r.e.username || '')}</td><td>${esc(r.e.name || '')}</td>
      <td class="tx-r">${money(r.base)}</td><td class="tx-r">${riel(r.baseKHR)}</td>
      <td><input type="number" class="tx-dep" min="0" max="20" value="${r.deps}" ${taxReady ? '' : 'disabled'}></td>
      <td style="text-align:center"><input type="checkbox" class="tx-nr" ${r.nonRes ? 'checked' : ''} ${taxReady ? '' : 'disabled'}></td>
      <td class="tx-r">${riel(r.taxable)}</td><td class="tx-r"><b>${riel(r.taxKHR)}</b></td><td class="tx-r">${r.taxKHR ? money(r.taxUSD) : '0.00'}</td>
      <td>${r.applied ? `<span class="tx-ok">✓ កាត់រួច $${money(r.applied.amount)}</span>${Math.abs(Number(r.applied.amount) - r.taxUSD) > 0.0001 ? '<div style="font-size:.66rem;color:#b45309">ខុសពីការគណនា — កាត់ម្តងទៀត</div>' : ''}` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td><button class="fm-act" data-act="apply" style="padding:4px 9px;font-size:.76rem" ${dis}>➖ កាត់</button>${r.applied ? ` <button class="secondary" data-act="remove" style="padding:4px 9px;font-size:.76rem" ${dis}>✕</button>` : ''}</td></tr>`;
  }
  function renderRowsOnly(tr) { // អាប់ដេតតែជួរដែលកំពុងកែ (មិនបាត់ focus)
    const e = rows.find(r => r.e.id === tr.dataset.id)?.e; if (!e) return;
    const nr = computeRow(e, curMonth); const idx = rows.findIndex(r => r.e.id === e.id); rows[idx] = nr;
    const t = document.createElement('tbody'); t.innerHTML = rowHtml(nr, idx, isMonthLocked(curMonth));
    const fresh = t.firstElementChild;
    tr.querySelectorAll('td').forEach((td, k) => { if (k !== 5 && k !== 6) td.innerHTML = fresh.children[k].innerHTML; });
    updateTotals();
  }
  function updateTotals() {
    const sumK = rows.reduce((s, r) => s + r.taxKHR, 0), sumU = rows.reduce((s, r) => s + r.taxUSD, 0), baseK = rows.reduce((s, r) => s + r.baseKHR, 0);
    overlay.querySelector('#txSum').textContent = `អត្រាប្តូរ ${riel(fxOf(curMonth))}៛/$ · បុគ្គលិក ${rows.length} នាក់ · ពន្ធសរុប ${riel(sumK)}៛ (≈ $${money(sumU)})`;
    overlay.querySelector('#txFoot').innerHTML = rows.length ? `<tr style="font-weight:700"><td colspan="3" style="text-align:right">សរុប</td><td class="tx-r">${money(rows.reduce((s, r) => s + r.base, 0))}</td><td class="tx-r">${riel(baseK)}</td><td></td><td></td><td class="tx-r">${riel(rows.reduce((s, r) => s + r.taxable, 0))}</td><td class="tx-r">${riel(sumK)}</td><td class="tx-r">${money(sumU)}</td><td colspan="2"></td></tr>` : '';
  }

  function render() {
    const $ = id => overlay.querySelector('#' + id);
    $('txMonthTxt').textContent = curMonth;
    $('txMonth').value = curMonth;
    $('txFx').value = (rules.fxByMonth && rules.fxByMonth[curMonth]) || ''; $('txFx').placeholder = String(defaultFx());
    $('txSub').checked = !!rules.subLateLeave;
    renderBanner();
    const locked = isMonthLocked(curMonth);
    ['txApplyAll', 'txRemoveAll'].forEach(id => { $(id).disabled = locked || !taxReady; });
    $('txSaveDeps').disabled = !taxReady;
    rows = payrollEmployeesForMonth(curMonth).map(e => computeRow(e, curMonth))
      .sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
    $('txBody').innerHTML = rows.length ? rows.map((r, i) => rowHtml(r, i, locked)).join('') : '<tr><td colspan="12" style="padding:16px">មិនមានបុគ្គលិក</td></tr>';
    updateTotals();
  }

  // ---------------------------------------------------------------- សកម្មភាព ----
  async function saveDeps() {
    if (!taxReady) return;
    const list = [...dirty].map(id => ({ employee_id: id, dependents: (taxInfo[id] || {}).dependents || 0, non_resident: !!(taxInfo[id] || {}).non_resident }));
    if (!list.length) { await customAlert('គ្មានការផ្លាស់ប្តូរ'); return; }
    const { error, cancelled } = await taxRpc('tax_save', { p_rows: list });
    if (cancelled) return;
    if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return; }
    list.forEach(r => { if (typeof logAudit === 'function') logAudit('tax_info_save', { entity: 'employee_tax', ref: r.employee_id, employeeId: r.employee_id, new: { dependents: r.dependents, non_resident: r.non_resident } }); });
    dirty.clear();
    await customAlert(`បានរក្សាទុក ${list.length} នាក់`);
  }

  async function applyOne(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'កាត់ពន្ធ'); return false; }
    if (dirty.has(empId) && !silent) { await customAlert('សូមចុច "💾 រក្សាទុកអ្នកក្នុងបន្ទុក" មុនកាត់ពន្ធ'); return false; }
    const e = rows.find(r => r.e.id === empId)?.e; if (!e) return false;
    const r = computeRow(e, month);
    if (!(r.taxKHR > 0)) { await removeOne(empId, true); if (!silent) await customAlert(`${e.name}៖ ពន្ធ = 0 (មិនត្រូវកាត់)`); return true; }
    const item = { id: itemId(empId, month), employeeId: empId, type: 'deduction', name: `ពន្ធលើប្រាក់បៀវត្សរ៍ ${month} (${riel(r.taxKHR)}៛)`, recurrence: 'variable', month, currency: 'USD', amount: r.taxUSD };
    const old = r.applied;
    const saved = await upsertPayrollItemRow(item);
    if (!saved) return false;
    const idx = payrollItems.findIndex(p => p.id === item.id);
    if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
    if (typeof logAudit === 'function') logAudit('tos_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: empId, old: old ? { name: old.name, type: old.type, currency: 'USD', amount: old.amount } : null, new: { name: item.name, type: 'deduction', currency: 'USD', amount: item.amount } });
    return true;
  }
  async function removeOne(empId, silent) {
    const month = curMonth;
    if (isMonthLocked(month)) { if (!silent) guardLocked(month, 'ដកពន្ធ'); return false; }
    const id = itemId(empId, month), prev = payrollItems.find(p => p.id === id);
    if (!prev) return false;
    const ok = await deletePayrollItemRow(id);
    if (!ok) return false;
    payrollItems = payrollItems.filter(p => p.id !== id);
    if (typeof logAudit === 'function') logAudit('tos_remove', { entity: 'payroll_item', ref: id, month, employeeId: empId, old: { name: prev.name, type: prev.type, currency: 'USD', amount: prev.amount }, new: null });
    return true;
  }
  async function bulk(kind) {
    const month = curMonth;
    if (guardLocked(month, kind === 'apply' ? 'កាត់ពន្ធ' : 'ដកពន្ធ')) return;
    if (!taxReady) { await customAlert('មិនទាន់ផ្ទុកអ្នកក្នុងបន្ទុក'); return; }
    if (dirty.size) { await customAlert('សូមចុច "💾 រក្សាទុកអ្នកក្នុងបន្ទុក" មុន'); return; }
    const targets = kind === 'apply' ? rows.filter(r => r.taxKHR > 0 || r.applied) : rows.filter(r => r.applied);
    if (!targets.length) { await customAlert(kind === 'apply' ? 'គ្មានបុគ្គលិកត្រូវកាត់ពន្ធទេ (ពន្ធ = 0)' : 'គ្មានពន្ធដែលបានកាត់ទេ'); return; }
    const total = targets.reduce((s, r) => s + r.taxUSD, 0);
    const msg = kind === 'apply'
      ? `កាត់ពន្ធចេញពីប្រាក់ខែ ${month} ចំនួន ${targets.filter(r => r.taxKHR > 0).length} នាក់ · សរុប ≈ $${money(total)}?\n⚠ ប្រាក់ខែសុទ្ធនឹងថយ ហើយប៉ះពាល់ប្រាក់ខែទី២ ដែលបើកតាមធនាគារ (ធាតុដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`
      : `ដកពន្ធដែលបានកាត់ ${targets.length} នាក់ ចេញពីខែ ${month}?`;
    if (!(await customConfirm(msg))) return;
    busy = true; let ok = 0;
    try { for (const t of targets) { if (kind === 'apply' ? await applyOne(t.e.id, true) : await removeOne(t.e.id, true)) ok++; } } finally { busy = false; }
    render();
    await customAlert(`បានដំណើរការ ${ok}/${targets.length} នាក់`);
  }

  function exportXlsx() {
    if (!rows.length) { customAlert('មិនមានទិន្នន័យ'); return; }
    downloadXlsx(`tax_on_salary_${curMonth}.xlsx`, [{
      name: 'Tax on Salary ' + curMonth,
      columns: [{ header: '#', width: 5, fmt: 'int' }, { header: 'Employee ID', width: 12, fmt: 'text' }, { header: 'Employee Name', width: 26, fmt: 'text' },
        { header: 'Base Salary (USD)', width: 16, fmt: 'usd' }, { header: 'Exchange Rate (KHR/USD)', width: 14, fmt: 'int' }, { header: 'Base Salary (KHR)', width: 18, fmt: 'riel' },
        { header: 'Dependents', width: 11, fmt: 'int' }, { header: 'Non-resident', width: 12, fmt: 'text' }, { header: 'Taxable (KHR)', width: 18, fmt: 'riel' },
        { header: 'Tax on Salary (KHR)', width: 18, fmt: 'riel' }, { header: 'Tax on Salary (USD)', width: 16, fmt: 'usd' }],
      rows: rows.map((r, i) => [i + 1, r.e.username || '', r.e.name || '', r2(r.base), r.fx, r.baseKHR, r.deps, r.nonRes ? 'Yes' : 'No', r.taxable, r.taxKHR, r2(r.taxUSD)]),
      totals: { label: `សរុប (${rows.length})`, labelCol: 2, sumCols: [3, 5, 8, 9, 10] },
    }]);
  }

  // ---------------------------------------------------------------- init ----
  function addButton() {
    if (document.getElementById('monthlyTaxBtn')) return;
    const anchor = document.getElementById('monthlyEndCheckBtn') || document.getElementById('monthlyFullBtn') || document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyTaxBtn'; btn.type = 'button';
    btn.textContent = '🧾 ពន្ធលើប្រាក់បៀវត្សរ៍';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
  window.openSalaryTax = open;
})();
