/* ==========================================================================
   bank-pay.js — បើកប្រាក់ខែតាមប្រព័ន្ធធនាគារ (Admin)
   ① រក្សាទុកគណនីធនាគាររបស់បុគ្គលិក  ② Export បញ្ជីផ្ទេរប្រាក់ (Excel / CSV)
   ③ សម្គាល់ថា "បានបើកតាមធនាគារ" ក្នុងខែដែលបានបិទ
   ④ ប្រវត្តិបើកប្រាក់ · បញ្ជីបុគ្គលិក · គណនីមានបញ្ហា · ប្តូរគណនីថ្មី
   ⑤ បើកប្រាក់ខែ ២ ដង/ខែ៖ ដងទី១ = ប្រាក់ខែទី១ (Advance) · ដងទី២ = ប្រាក់ខែសុទ្ធនៅសល់ (ត្រូវការ bank-pay.sql v4)

   ⚠️ មុខងារនេះ មិនផ្ទេរលុយដោយផ្ទាល់ពីកម្មវិធីទេ — វាបង្កើតឯកសារសម្រាប់ upload ក្នុង
      Internet/Mobile Banking របស់ក្រុមហ៊ុន (Bulk Transfer) ហើយតាមដានថាបានបើករួចឬនៅ។

   សុវត្ថិភាព៖ ទិន្នន័យធនាគារចូលតាម RPC ដែលតម្រូវពាក្យសម្ងាត់ admin (សួរម្តងក្នុងមួយ session — មិនរក្សាទុកក្នុង browser)
   ដំឡើង៖ ① ដំណើរការ bank-pay.sql ក្នុង Supabase
           ② index.html ដាក់ក្រោម advance-sync.js៖  <script src="bank-pay.js"></script>
   ត្រូវការ៖ monthlyRows, currentMonthlyMonth, isMonthLocked, downloadXlsx, customAlert,
            customConfirm, escapeHtml, pcDownloadText, logAudit, supabaseClient
   លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ========================================================================== */
(function () {
  'use strict';

  const BANKS = ['ABA Bank', 'ACLEDA Bank', 'Wing Bank', 'Canadia Bank', 'Sathapana Bank', 'Vattanac Bank',
    'Phnom Penh Commercial Bank (PPCB)', 'Cambodia Public Bank (CPB)', 'Maybank', 'Prince Bank', 'Chip Mong Bank',
    'FTB', 'Bakong', 'TrueMoney', 'Pi Pay'];

  let bankInfo = {};      // empId -> { bank_name, account_no, account_name }
  let bankPaid = {};      // 'YYYY-MM|empId|round' -> row  (round = advance | final)
  let curRound = 'final'; // ដងបើកប្រាក់៖ advance = ប្រាក់ខែទី១ · final = ចុងខែ (នៅសល់)
  let missing = null;     // សារកំហុស បើតារាងមិនទាន់មាន
  let overlay = null, curMonth = '', curRows = [];

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const cleanAcc = v => String(v || '').replace(/[^0-9A-Za-z\- ]/g, '').trim();
  const cleanTxt = v => String(v || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 80);

  // ---------------------------------------------------------------- data ----
  let adminPw = null; // រក្សាក្នុង memory ប៉ុណ្ណោះ (បាត់ពេលបិទ/refresh)

  async function askPw() {
    if (adminPw) return adminPw;
    const v = await customPrompt('បញ្ចូលពាក្យសម្ងាត់ Admin ដើម្បីមើល/កែព័ត៌មានធនាគារ៖', true);
    return v ? v : null;
  }
  // ហៅ RPC ជាមួយពាក្យសម្ងាត់ — បើខុសសួរម្តងទៀត
  async function bankRpc(fn, args) {
    const pw = await askPw();
    if (!pw) return { cancelled: true };
    const { data, error } = await supabaseClient.rpc(fn, { p_password: pw, ...args });
    if (error) console.warn('bank rpc', fn, error.message);
    if (error && /unauthorized/i.test(error.message)) { adminPw = null; return { error: { message: 'ពាក្យសម្ងាត់ Admin មិនត្រឹមត្រូវ' } }; }
    if (error && /account_issue/.test(error.message)) return { error: { message: 'គណនីមានបញ្ហា — សូមប្តូរគណនីថ្មី ឬដោះស្រាយបញ្ហាជាមុន' } };
    if (error && /no_account/.test(error.message)) return { error: { message: 'បុគ្គលិកនេះមិនទាន់មានគណនីធនាគារទេ' } };
    if (error && /incomplete/.test(error.message)) return { error: { message: 'ព័ត៌មានគណនីមិនគ្រប់ (ធនាគារ + លេខគណនី + ឈ្មោះគណនី)' } };
    if (error && /bank_(history|set_issue|change_account|mark_paid|unmark_paid)/.test(error.message) && /does not exist|Could not find/i.test(error.message)) return { error: { message: 'មិនទាន់ដំណើរការ bank-pay.sql (v4) ក្នុង Supabase — សូមបើក Supabase → SQL Editor ហើយ Run ឯកសារ bank-pay.sql ទាំងមូលម្តងទៀត រួចរង់ចាំ ១០ វិនាទី' } };
    if (!error) adminPw = pw;
    return { data, error };
  }

  async function loadBank(month) {
    missing = null;
    const { data, error, cancelled } = await bankRpc('bank_load', { p_month: month });
    if (cancelled) { missing = 'បានបោះបង់'; return false; }
    if (error) { missing = error.message; return false; }
    bankInfo = {};
    ((data && data.info) || []).forEach(r => { bankInfo[r.employee_id] = r; });
    Object.keys(bankPaid).filter(k => k.startsWith(month + '|')).forEach(k => delete bankPaid[k]);
    ((data && data.paid) || []).forEach(r => { bankPaid[r.month + '|' + r.employee_id + '|' + (r.kind || 'final')] = r; });
    return true;
  }

  // ក្រឡាចំនួនទឹកប្រាក់នៃដងនីមួយៗ (ប្រាក់ខែទី១ / ប្រាក់ខែទី២) — ដងដែលកំពុងជ្រើសត្រូវបានបញ្ជាក់ដោយអក្សរដិត
  const roundCell = (v, paidFlag, round) => `<td style="text-align:right;font-variant-numeric:tabular-nums;${curRound === round ? 'font-weight:700;background:color-mix(in srgb,var(--accent,#0d9488) 8%,transparent);' : ''}">${v > 0 ? money(v) : '<span class="bp-no">-</span>'}${paidFlag ? '<div class="bp-ok" style="font-size:.66rem">✓ បានបើក</div>' : ''}</td>`;
  const ROUND_LABEL = { advance: 'ដងទី១ · ថ្ងៃ 25 (ប្រាក់ខែទី១)', final: 'ដងទី២ · ថ្ងៃទី 10 (នៅសល់)' };
  // កាលវិភាគបើកប្រាក់៖ ដងទី១ = ថ្ងៃ 25 (ប្រាក់ខែទី១ ក្នុងខែដដែល) · ដងទី២ = ថ្ងៃទី 10 នៃខែបន្ទាប់ (ប្រាក់ខែនៅសល់)
  const nextMonthOf = m => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  // ថ្ងៃបើកប្រាក់៖ ថ្ងៃទី 25 (ដងទី១) និងថ្ងៃទី 10 នៃខែបន្ទាប់ (ដងទី២)
  // បើជាថ្ងៃសៅរ៍ អាទិត្យ ឬថ្ងៃបុណ្យ (តារាង holidays) → រុញថយក្រោយទៅថ្ងៃធ្វើការមុនគេ
  //   ឧ. 10 ត្រូវសៅរ៍ → 9 · ត្រូវអាទិត្យ → 8 · បើ 9 ជាថ្ងៃបុណ្យ ក៏ថយទៀត
  const pad2 = n => String(n).padStart(2, '0');
  const holidayName = d => (typeof holidays !== 'undefined' && holidays && holidays[d] !== undefined) ? (holidays[d] || 'ថ្ងៃបុណ្យ') : null;
  const isOffDay = d => { const w = new Date(d + 'T00:00:00').getDay(); return w === 0 || w === 6 || holidayName(d) !== null; };
  const shiftDay = (d, k) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + k); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`; };
  const rollBack = d => { let x = d, n = 0; while (isOffDay(x) && n < 14) { x = shiftDay(x, -1); n++; } return x; };
  const finalBase = m => nextMonthOf(m) + '-10';
  const advBase = m => m + '-25';
  const finalDateOf = m => rollBack(finalBase(m));
  const advDateOf = m => (typeof advanceDateOf === 'function' ? advanceDateOf(m) : rollBack(advBase(m))); // script.js គិតថ្ងៃបុណ្យដូចគ្នា
  const offReason = d => { const h = holidayName(d); if (h !== null) return 'ថ្ងៃបុណ្យ ' + esc(h); const w = new Date(d + 'T00:00:00').getDay(); return w === 6 ? 'ថ្ងៃសៅរ៍' : (w === 0 ? 'ថ្ងៃអាទិត្យ' : ''); };
  const payDateNote = (base, actual) => base === actual ? '' : ` <small>(ថ្ងៃទី ${parseInt(base.slice(8), 10)} ត្រូវ${offReason(base)} → ប្តូរមកថ្ងៃទី ${parseInt(actual.slice(8), 10)})</small>`;
  const holidayWarn = () => (typeof holidaysAvailable !== 'undefined' && !holidaysAvailable) ? ' <small style="color:#b45309">⚠ មិនទាន់មានតារាងថ្ងៃបុណ្យ — មិនទាន់គិតថ្ងៃបុណ្យ</small>' : '';
  const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const KH_DOW = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
  function dueInfo(date) {
    const d = dayDiff(date, todayStr()), dow = new Date(date + 'T00:00:00').getDay();
    const when = d > 0 ? `នៅសល់ ${d} ថ្ងៃ` : (d === 0 ? 'ថ្ងៃនេះ' : `ហួសកំណត់ ${-d} ថ្ងៃ`);
    const color = d < 0 ? '#dc2626' : (d <= 3 ? '#b45309' : 'inherit');
    const wk = (dow === 0 || dow === 6) ? ` · ⚠ ត្រូវថ្ងៃ${KH_DOW[dow]} (ធនាគារអាចមិនដំណើរការ)` : '';
    return `<b>${esc(date)}</b> (ថ្ងៃ${KH_DOW[dow]}) · <span style="color:${color};font-weight:600">${when}</span>${wk}`;
  }
  const ROUND_SHORT = { advance: 'ប្រាក់ខែទី១', final: 'ចុងខែ' };
  const pkey = (m, id, round) => `${m}|${id}|${round || curRound}`;
  const isPaid = (empId, round) => !!bankPaid[pkey(curMonth, empId, round)];
  const refOf = () => (curRound === 'advance' ? 'Salary advance ' : 'Salary ') + curMonth;
  // ទឹកប្រាក់នៃដងបច្ចុប្បន្ន៖ ទី១ = ប្រាក់ខែទី១ (តាមច្បាប់) · ទី២ = ប្រាក់ខែសុទ្ធ (បានកាត់ប្រាក់ខែទី១ រួច)
  const advOf = row => { const a = row.adv; return (a && a.eligible !== false) ? Math.max(0, r2(a.amount)) : 0; };
  const amountOf = row => (curRound === 'advance' ? advOf(row) : r2(row.t.net));
  const hasBank = (empId) => { const i = bankInfo[empId]; return !!(i && i.bank_name && i.account_no && i.account_name); };
  // គណនីមានបញ្ហា — ចាត់ទុកថាមានបញ្ហា លុះត្រាតែលេខគណនីដែលកំពុងប្រើនៅដូចដែលបានសម្គាល់
  const issueOf = (empId, inf) => { const o = bankInfo[empId]; return (o && o.issue && (!inf || !inf.account_no || inf.account_no === o.account_no)) ? o.issue : ''; };
  const allEmps = () => (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees : [];
  const empOf = id => allEmps().find(e => e.id === id);
  const nameOf = id => { const e = empOf(id); return e ? e.name : id; };
  const userOf = id => { const e = empOf(id); return e ? (e.username || '') : ''; };
  const fmtDT = v => (typeof pcFmtDT === 'function' ? pcFmtDT(v) : String(v || '').slice(0, 16).replace('T', ' '));
  const acctState = id => !hasBank(id) ? 'missing' : (bankInfo[id].issue ? 'issue' : 'ok');
  const STATE_BADGE = {
    ok: '<span class="bp-ok">✓ គ្រប់គ្រាន់</span>',
    missing: '<span style="color:#b45309">ខ្វះព័ត៌មាន</span>',
    issue: '<span style="color:#dc2626;font-weight:600">⚠ មានបញ្ហា</span>',
  };
  const byName = (a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || '');
  const maskAccount = s => { s = String(s || ''); return s.length > 4 ? '••••' + s.slice(-4) : s; };

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.bp-ovl{position:fixed;inset:0;z-index:9980;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.bp-ovl.open{display:flex}
.bp-box{width:100%;max-width:1100px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.bp-box h2{margin:0 0 4px;font-size:1.05rem}
.bp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
.bp-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.bp-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:8px 0}
.bp-tbl input[type=text]{width:100%;min-width:110px;font-size:.78rem;padding:6px 8px}
.bp-tbl td,.bp-tbl th{white-space:nowrap;vertical-align:middle}
.bp-ok{color:var(--success,#059669);font-weight:600}
.bp-no{color:var(--text-muted,#5b6b80)}
.bp-sub{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.bp-sub input[type=text],.bp-sub select,.bp-sub input[type=month]{font-size:.8rem;padding:6px 8px}
.bp-tab{padding:6px 12px;font-size:.8rem}
.bp-tab.on{background:var(--accent,#0d9488);color:#fff;border-color:transparent}
.bp-act{padding:4px 8px;font-size:.72rem}
.bp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.bp-reason{color:#dc2626;font-size:.74rem;white-space:normal;max-width:260px}
.bp-sum-gross{font-weight:600;margin-top:-2px}
.bp-sum-all{color:var(--accent,#0d9488);border-top:1px dashed var(--border,#e1e8ef);padding-top:4px;margin-top:-2px}
.bp-sum{font-size:.82rem;font-weight:600;margin-left:auto;flex:1 0 100%;text-align:right}
.bp-mon{margin-left:auto;display:inline-flex;gap:6px;align-items:center}
.bp-mon input,.bp-mon select{font-size:.8rem;padding:6px 8px}
`;

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'bp-ovl';
    overlay.innerHTML = `
      <div class="bp-box" role="dialog" aria-modal="true">
        <h2>🏦 បើកប្រាក់ខែតាមធនាគារ <span id="bpMonth" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="bp-note">បញ្ចូលគណនីធនាគារ → Export បញ្ជីផ្ទេរប្រាក់ → upload ក្នុង Internet Banking → ត្រឡប់មកសម្គាល់ថា "បានបើក"។ ចំនួនទឹកប្រាក់ = ប្រាក់ខែសុទ្ធ (USD)។</p>
        <div id="bpStatus"></div>
        <div class="bp-bar">
          <button id="bpSaveBtn">💾 រក្សាទុកគណនីធនាគារ</button>
          <button class="secondary" id="bpXlsxBtn">📊 Export Excel</button>
          <button class="secondary" id="bpCsvBtn">⬇️ Export CSV</button>
          <button id="bpPaidBtn">✓ សម្គាល់ថាបានបើក (ជួរដែលបានជ្រើស)</button>
          <button class="secondary" id="bpUnpaidBtn">↩ ដកការសម្គាល់</button>
          <button class="secondary" id="bpHistBtn">📜 ប្រវត្តិបើកប្រាក់ខែ</button>
          <button class="secondary" id="bpListBtn">👥 បញ្ជីបុគ្គលិក</button>
          <button class="secondary" id="bpProbBtn">⚠️ គណនីមានបញ្ហា</button>
          <button class="secondary" id="bpChgBtn">🔄 ប្តូរគណនីថ្មី</button>
          <span class="bp-mon"><select id="bpRound" title="ដងបើកប្រាក់ក្នុងមួយខែ"><option value="advance">ដងទី១ · ថ្ងៃ 25 (ប្រាក់ខែទី១)</option><option value="final" selected>ដងទី២ · ថ្ងៃទី 10 (ថយបើឈប់/បុណ្យ)</option></select><button class="secondary" id="bpPrev" title="ខែមុន">◀</button><input type="month" id="bpMonthInput" title="ជ្រើសខែ"><button class="secondary" id="bpNext" title="ខែក្រោយ">▶</button></span>
          <span class="bp-sum" id="bpSum"></span>
          <span class="bp-sum bp-sum-gross" id="bpSumGross"></span>
          <span class="bp-sum bp-sum-all" id="bpSumAll"></span>
        </div>
        <div class="table-wrap" style="max-height:56vh;overflow:auto;">
          <table class="bp-tbl">
            <thead><tr><th><input type="checkbox" id="bpAll" title="ជ្រើសទាំងអស់"></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th style="text-align:right">ប្រាក់ខែទី១ ($)</th><th style="text-align:right">ប្រាក់ខែទី២ ($)</th><th style="text-align:right">ចំនួនបើកឥឡូវ ($)</th><th>ស្ថានភាព</th></tr></thead>
            <tbody id="bpBody"></tbody>
            <tfoot id="bpFoot"></tfoot>
          </table>
        </div>
        <datalist id="bpBanks">${BANKS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="bp-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="bpCloseBtn">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    $('bpCloseBtn').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    $('bpSaveBtn').addEventListener('click', saveBankInfo);
    $('bpXlsxBtn').addEventListener('click', () => exportList('xlsx'));
    $('bpCsvBtn').addEventListener('click', () => exportList('csv'));
    $('bpPaidBtn').addEventListener('click', () => markSelected(true));
    $('bpUnpaidBtn').addEventListener('click', () => markSelected(false));
    $('bpRound').addEventListener('change', e => { curRound = e.target.value; render(); });
    $('bpHistBtn').addEventListener('click', showHistory);
    $('bpListBtn').addEventListener('click', showEmpList);
    $('bpProbBtn').addEventListener('click', showProblems);
    $('bpChgBtn').addEventListener('click', () => openChange(''));
    $('bpMonthInput').addEventListener('change', e => switchMonth(e.target.value));
    $('bpPrev').addEventListener('click', () => switchMonth(shiftMonth(curMonth, -1)));
    $('bpNext').addEventListener('click', () => switchMonth(shiftMonth(curMonth, 1)));
    $('bpAll').addEventListener('change', e => overlay.querySelectorAll('.bp-chk:not(:disabled)').forEach(c => { c.checked = e.target.checked; }));
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (panel && panel.classList.contains('open')) closePanel(); else if (overlay.classList.contains('open')) close(); });
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  function shiftMonth(m, d) {
    let [y, mo] = m.split('-').map(Number);
    mo += d; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  }

  // មានព័ត៌មានធនាគារដែលបានវាយ ប៉ុន្តែមិនទាន់រក្សាទុក?
  function hasUnsaved() {
    return readRowInputs().some(r => !r.locked && (r.bank_name || r.account_no || r.account_name) &&
      (() => { const o = bankInfo[r.employee_id] || {}; return o.bank_name !== r.bank_name || o.account_no !== r.account_no || o.account_name !== r.account_name; })());
  }

  async function loadMonthView() {
    overlay.querySelector('#bpMonth').textContent = curMonth;
    overlay.querySelector('#bpMonthInput').value = curMonth;
    overlay.querySelector('#bpRound').value = curRound;
    overlay.querySelector('#bpStatus').innerHTML = '';
    overlay.querySelector('#bpSum').textContent = '';
    overlay.querySelector('#bpBody').innerHTML = '<tr><td colspan="10" style="padding:16px;">កំពុងផ្ទុក...</td></tr>';
    const ok = await loadBank(curMonth);
    if (!ok) {
      overlay.querySelector('#bpStatus').innerHTML = `<div class="bp-warn">⚠️ មិនអាចផ្ទុកទិន្នន័យធនាគារបាន៖ ${esc(missing)}<br>ប្រសិនបើមិនទាន់ដំណើរការ <b>bank-pay.sql</b> (v2) ក្នុង Supabase សូមដំណើរការជាមុន។ <button class="secondary" id="bpRetry" style="margin-left:8px">↻ ព្យាយាមម្តងទៀត</button></div>`;
      const rt = overlay.querySelector('#bpRetry'); if (rt) rt.addEventListener('click', loadMonthView);
      overlay.querySelector('#bpBody').innerHTML = '';
      curRows = [];
      return;
    }
    render();
  }

  // ប្តូរទៅខែផ្សេង (ជ្រើសខែណាក៏បាន)
  async function switchMonth(m) {
    const input = overlay.querySelector('#bpMonthInput');
    if (!MONTH_RE.test(m || '')) { input.value = curMonth; return; }
    if (m === curMonth) return;
    if (hasUnsaved() && !(await customConfirm('មានព័ត៌មានធនាគារដែលមិនទាន់រក្សាទុក — ប្តូរខែនឹងបាត់។ បន្ត?'))) { input.value = curMonth; return; }
    curMonth = m;
    await loadMonthView();
  }

  async function open() {
    if (!overlay) build();
    curMonth = currentMonthlyMonth();
    overlay.classList.add('open');
    await loadMonthView();
  }

  function render() {
    curRows = monthlyRows(curMonth);
    const locked = isMonthLocked(curMonth);
    const blue = 'background:#e0f2fe;color:#075985';
    overlay.querySelector('#bpStatus').innerHTML = curRound === 'advance'
      ? `<div class="bp-warn" style="${blue}">💵 <b>ដងទី១ · ថ្ងៃ 25 — ប្រាក់ខែទី១</b> · ថ្ងៃទូទាត់ ${dueInfo(advDateOf(curMonth))}${payDateNote(advBase(curMonth), advDateOf(curMonth))}${holidayWarn()}<br>ទឹកប្រាក់តាមច្បាប់ប្រាក់ខែទី១ (បុគ្គលិកដែលមានសិទ្ធិប៉ុណ្ណោះ)។ សម្គាល់ថាបានបើកបាននៅពេលដល់ថ្ងៃទូទាត់ (មិនចាំបាច់បិទខែ)។</div>`
      : `<div class="bp-warn" style="${blue}">💵 <b>ដងទី២ · ថ្ងៃទី 10 — ប្រាក់ខែនៅសល់ នៃខែ ${esc(curMonth)}</b> · ត្រូវបើកត្រឹម ${dueInfo(finalDateOf(curMonth))}${payDateNote(finalBase(curMonth), finalDateOf(curMonth))}${holidayWarn()}<br>ទឹកប្រាក់ = ប្រាក់ខែសុទ្ធ ដែលបានកាត់ប្រាក់ខែទី១ រួចហើយ។</div>`
        + (locked ? '' : `<div class="bp-warn">🔓 ខែ ${esc(curMonth)} មិនទាន់បិទ — លេខអាចផ្លាស់ប្តូរ។ ត្រូវ "🔒 បិទខែ" ជាមុនថ្ងៃទី 10 ទើបអាចសម្គាល់ថា "បានបើក" ដងទី២ បាន (Export ពិនិត្យមើលបាន)។</div>`);
    overlay.querySelector('#bpPaidBtn').disabled = curRound === 'final' && !locked;
    overlay.querySelector('#bpBody').innerHTML = curRows.length ? curRows.map((row, i) => {
      const { e, t } = row;
      const inf = bankInfo[e.id] || {};
      const paid = bankPaid[pkey(curMonth, e.id)];
      const net = amountOf(row);
      const advDed = curRound === 'final' && advOf(row) > 0 && row.adv && (row.adv.due || locked) ? advOf(row) : 0;
      const advNote = advDed ? `<div style="font-size:.66rem;color:${isPaid(e.id, 'advance') ? 'var(--success,#059669)' : '#b45309'}">កាត់ប្រាក់ខែទី១ $${money(advDed)}${isPaid(e.id, 'advance') ? ' (បានបើក ✓)' : ' (មិនទាន់កត់បើកតាមធនាគារ)'}</div>` : '';
      return `<tr data-id="${esc(e.id)}">
        <td><input type="checkbox" class="bp-chk" ${net <= 0 ? 'disabled' : ''}></td>
        <td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td>
        <td><input type="text" class="bp-bank" list="bpBanks" value="${esc(inf.bank_name || '')}" placeholder="ABA Bank" ${paid ? 'disabled' : ''}></td>
        <td><input type="text" class="bp-acc" inputmode="numeric" value="${esc(inf.account_no || '')}" placeholder="000 123 456" ${paid ? 'disabled' : ''}></td>
        <td><input type="text" class="bp-name" value="${esc(inf.account_name || '')}" placeholder="SOK SOPHEA" ${paid ? 'disabled' : ''}></td>
        ${roundCell(advOf(row), isPaid(e.id, 'advance'), 'advance')}${roundCell(r2(t.net), isPaid(e.id, 'final'), 'final')}
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${money(net)}</td>
        <td>${paid ? `<span class="bp-ok">✓ បានបើក</span><div class="bp-no" style="font-size:.68rem">${esc(String(paid.paid_at || '').slice(0, 16).replace('T', ' '))}</div>`
          : (net <= 0 ? `<span class="bp-no">${curRound === 'advance' ? 'មិនមានសិទ្ធិប្រាក់ខែទី១' : 'គ្មានទឹកប្រាក់'}</span>` : (!hasBank(e.id) ? '<span style="color:#b45309">ខ្វះព័ត៌មានធនាគារ</span>' : (issueOf(e.id) ? `<span style="color:#dc2626;font-weight:600" title="${esc(issueOf(e.id))}">⚠ មានបញ្ហា</span>` : '<span class="bp-no">មិនទាន់បើក</span>')))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" style="padding:16px;">មិនមានបុគ្គលិកក្នុងខែនេះ</td></tr>';
    updateSum();
    updateProbBtn();
  }

  function updateProbBtn() {
    const n = Object.values(bankInfo).filter(i => i && i.issue).length;
    const b = overlay && overlay.querySelector('#bpProbBtn');
    if (b) b.textContent = '⚠️ គណនីមានបញ្ហា' + (n ? ` (${n})` : '');
  }

  function updateSum() {
    const total = curRows.reduce((s, row) => s + Math.max(0, amountOf(row)), 0);
    const paid = curRows.reduce((s, row) => s + (isPaid(row.e.id) ? Math.max(0, amountOf(row)) : 0), 0);
    overlay.querySelector('#bpSum').textContent = `${ROUND_SHORT[curRound]} · សរុប $${money(total)} · បានបើក $${money(paid)} · នៅសល់ $${money(total - paid)}`;

    const sumA1 = curRows.reduce((s, row) => s + advOf(row), 0), sumA2 = curRows.reduce((s, row) => s + Math.max(0, r2(row.t.net)), 0);
    overlay.querySelector('#bpFoot').innerHTML = curRows.length
      ? `<tr style="font-weight:700"><td colspan="6" style="text-align:right">សរុប (${curRows.length} នាក់)</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(sumA1)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(sumA2)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(total)}</td><td></td></tr>` : '';

    // ប្រាក់ខែសរុបទាំងខែ (ដងទី១ + ដងទី២) — មិនអាស្រ័យលើដងដែលកំពុងមើល
    const locked = isMonthLocked(curMonth);
    let adv1 = 0, fin = 0, paidAdv = 0, paidFin = 0, grossWork = 0, grossBen = 0;
    curRows.forEach(row => {
      grossWork += Number(row.t.total) || 0;                               // ប្រាក់តាមវត្តមាន (មុនបូក/កាត់)
      grossBen += Number(row.t.benefitsUSD) || 0;                          // អត្ថប្រយោជន៍
      fin += Math.max(0, r2(row.t.net));                                   // ប្រាក់ខែសុទ្ធ (បានកាត់ប្រាក់ខែទី១ រួច)
      adv1 += (row.adv && (row.adv.due || locked)) ? advOf(row) : 0;       // ប្រាក់ខែទី១ ដែលបានកាត់ចេញពី net
      const pa = bankPaid[pkey(curMonth, row.e.id, 'advance')], pf = bankPaid[pkey(curMonth, row.e.id, 'final')];
      paidAdv += pa ? Number(pa.amount_usd) || 0 : 0;
      paidFin += pf ? Number(pf.amount_usd) || 0 : 0;
    });
    const all = adv1 + fin, paidAll = paidAdv + paidFin;
    // សរុបមុនពេលកាត់ = ប្រាក់តាមវត្តមាន + អត្ថប្រយោជន៍ · ប្រាក់កាត់ផ្សេងៗ = (សរុបមុនកាត់) − (ប្រាក់ខែទី១ + ប្រាក់ខែសុទ្ធ)
    const gross = grossWork + grossBen, otherDed = Math.max(0, gross - all);
    overlay.querySelector('#bpSumGross').textContent = curRows.length
      ? `សរុបមុនពេលកាត់ $${money(gross)} (វត្តមាន $${money(grossWork)} + អត្ថប្រយោជន៍ $${money(grossBen)}) − ប្រាក់កាត់ផ្សេងៗ (យឺត/ច្បាប់/ផ្សេងៗ) $${money(otherDed)} = $${money(all)}`
      : '';
    overlay.querySelector('#bpSumAll').textContent = curRows.length
      ? `ប្រាក់ខែសរុបទាំងខែ (ដង១ + ដង២) $${money(all)} = $${money(adv1)} + $${money(fin)} · បានបើកសរុប $${money(paidAll)} (ដង១ $${money(paidAdv)} · ដង២ $${money(paidFin)}) · នៅសល់ $${money(Math.max(0, all - paidAll))}`
      : '';
  }

  // ---------------------------------------------------------------- save bank info ----
  function readRowInputs() {
    const out = [];
    overlay.querySelectorAll('#bpBody tr[data-id]').forEach(tr => {
      out.push({
        employee_id: tr.dataset.id,
        bank_name: cleanTxt(tr.querySelector('.bp-bank').value),
        account_no: cleanAcc(tr.querySelector('.bp-acc').value),
        account_name: cleanTxt(tr.querySelector('.bp-name').value).toUpperCase(),
        locked: tr.querySelector('.bp-bank').disabled,
      });
    });
    return out;
  }

  async function saveBankInfo() {
    const rows = readRowInputs().filter(r => !r.locked);
    const partial = rows.filter(r => (r.bank_name || r.account_no || r.account_name) && !(r.bank_name && r.account_no && r.account_name));
    if (partial.length) { await customAlert(`មាន ${partial.length} ជួរបំពេញមិនគ្រប់ (ត្រូវការ ធនាគារ + លេខគណនី + ឈ្មោះគណនី)`); return; }
    const filled = rows.filter(r => r.bank_name && r.account_no && r.account_name)
      .filter(r => { const o = bankInfo[r.employee_id] || {}; return o.bank_name !== r.bank_name || o.account_no !== r.account_no || o.account_name !== r.account_name; });
    if (!filled.length) { await customAlert('គ្មានការផ្លាស់ប្តូរ'); return; }
    const payload = filled.map(({ locked, ...r }) => r);
    const { error, cancelled } = await bankRpc('bank_save_info', { p_rows: payload });
    if (cancelled) return;
    if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return; }
    payload.forEach(r => {
      const old = bankInfo[r.employee_id];
      bankInfo[r.employee_id] = r;
      if (typeof logAudit === 'function') logAudit('bank_info_save', { entity: 'employee_bank', ref: r.employee_id, employeeId: r.employee_id,
        old: old ? { bank: old.bank_name, account_no: maskAcc(old.account_no) } : null, new: { bank: r.bank_name, account_no: maskAcc(r.account_no) } });
    });
    render();
    await customAlert(`បានរក្សាទុក ${payload.length} គណនី`);
  }

  const maskAcc = s => { s = String(s || ''); return s.length > 4 ? '••••' + s.slice(-4) : s; }; // audit log មិនរក្សាលេខគណនីពេញ

  // ---------------------------------------------------------------- export ----
  async function exportList(kind) {
    if (!curRows.length) { await customAlert('មិនមានទិន្នន័យ'); return; }
    // ប្រើតម្លៃក្នុងប្រអប់ (មិនទាន់រក្សាទុកក៏បាន) ប៉ុន្តែត្រូវពេញលេញ
    const inputs = {}; readRowInputs().forEach(r => { inputs[r.employee_id] = r; });
    const list = [], skipped = [];
    curRows.forEach(row => {
      const { e } = row;
      const net = amountOf(row);
      const inf = inputs[e.id] || bankInfo[e.id] || {};
      if (net <= 0) return;
      if (isPaid(e.id)) { skipped.push(`${e.name} (បានបើករួច)`); return; }
      if (!(inf.bank_name && inf.account_no && inf.account_name)) { skipped.push(`${e.name} (ខ្វះព័ត៌មានធនាគារ)`); return; }
      if (issueOf(e.id, inf)) { skipped.push(`${e.name} (គណនីមានបញ្ហា)`); return; }
      list.push({ e, net, inf });
    });
    if (!list.length) { await customAlert('គ្មានបុគ្គលិកដែលអាច Export បានទេ' + (skipped.length ? '\n\nរំលង៖\n' + skipped.join('\n') : '')); return; }
    if (skipped.length && !(await customConfirm(`នឹង Export ${list.length} នាក់ ហើយរំលង ${skipped.length} នាក់៖\n${skipped.slice(0, 10).join('\n')}${skipped.length > 10 ? '\n…' : ''}\n\nបន្ត?`))) return;

    const ref = refOf();
    const suffix = curRound === 'advance' ? '_advance' : '_final';
    const total = list.reduce((s, x) => s + x.net, 0);
    if (kind === 'xlsx') {
      downloadXlsx(`bank_transfer_${curMonth}${suffix}.xlsx`, [{
        name: 'Bank Transfer ' + curMonth + (curRound === 'advance' ? ' Adv' : ''),
        columns: [
          { header: '#', width: 5, fmt: 'int' }, { header: 'Account Name', width: 28, fmt: 'text' }, { header: 'Account Number', width: 20, fmt: 'text' },
          { header: 'Bank', width: 26, fmt: 'text' }, { header: 'Amount (USD)', width: 14, fmt: 'usd' }, { header: 'Remark', width: 18, fmt: 'text' },
          { header: 'Employee ID', width: 12, fmt: 'text' }, { header: 'Employee Name', width: 26, fmt: 'text' },
        ],
        rows: list.map(({ e, net, inf }, i) => [i + 1, inf.account_name, String(inf.account_no), inf.bank_name, net, ref, e.username || '', e.name || '']),
        totals: { label: `សរុប (${list.length} នាក់)`, labelCol: 1, sumCols: [4] },
      }]);
    } else {
      const q = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // ការពារ formula injection
      const lines = [['No', 'Account Name', 'Account Number', 'Bank', 'Amount (USD)', 'Remark', 'Employee ID', 'Employee Name'].map(q).join(',')];
      list.forEach(({ e, net, inf }, i) => lines.push([i + 1, inf.account_name, inf.account_no, inf.bank_name, net.toFixed(2), ref, e.username || '', e.name || ''].map((v, c) => c === 0 || c === 4 ? String(v) : q(v)).join(',')));
      pcDownloadText(`bank_transfer_${curMonth}${suffix}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    }
    if (typeof logAudit === 'function') logAudit('bank_export', { entity: 'bank_payments', ref: curMonth, month: curMonth, new: { count: list.length, total_usd: r2(total), format: kind, round: curRound } });
    await customAlert(`បាន Export (${ROUND_SHORT[curRound]}) ${list.length} នាក់ · សរុប $${money(total)}\nសូមពិនិត្យលេខគណនីឱ្យត្រឹមត្រូវ មុន upload ទៅធនាគារ។`);
  }

  // ---------------------------------------------------------------- mark paid ----
  async function markSelected(paid) {
    if (paid && curRound === 'final' && !isMonthLocked(curMonth)) { await customAlert(`ដងទី២ (ចុងខែ)៖ ត្រូវ "🔒 បិទខែ" ${curMonth} ជាមុន ទើបអាចសម្គាល់ថាបានបើក (ដើម្បីឱ្យទឹកប្រាក់ថេរ)`); return; }
    const ids = [...overlay.querySelectorAll('#bpBody tr[data-id]')].filter(tr => tr.querySelector('.bp-chk').checked).map(tr => tr.dataset.id);
    if (!ids.length) { await customAlert('សូមជ្រើសរើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    const inputs = {}; readRowInputs().forEach(r => { inputs[r.employee_id] = r; });

    if (paid) {
      const todo = [], bad = [];
      ids.forEach(id => {
        const row = curRows.find(x => x.e.id === id); if (!row) return;
        if (isPaid(id)) return;
        const inf = inputs[id] || bankInfo[id] || {}, net = amountOf(row);
        if (curRound === 'advance' && !isMonthLocked(curMonth) && todayStr() < advDateOf(curMonth)) { bad.push(row.e.name + ` (មិនទាន់ដល់ថ្ងៃទូទាត់ ${advDateOf(curMonth)})`); return; }
        if (net <= 0 || !(inf.bank_name && inf.account_no && inf.account_name) || issueOf(id, inf)) { bad.push(row.e.name); return; }
        todo.push({ month: curMonth, employee_id: id, amount_usd: net, bank_name: inf.bank_name, account_no: inf.account_no, account_name: inf.account_name,
          kind: curRound, status: 'paid', reference: refOf(), paid_at: new Date().toISOString() });
      });
      if (!todo.length) { await customAlert('គ្មានជួរដែលអាចសម្គាល់បានទេ' + (bad.length ? '\nខ្វះព័ត៌មាន/ទឹកប្រាក់៖ ' + bad.join(', ') : '')); return; }
      const total = todo.reduce((s, x) => s + x.amount_usd, 0);
      if (!(await customConfirm(`សម្គាល់ថា "បានបើកតាមធនាគារ" (${ROUND_SHORT[curRound]}) ${todo.length} នាក់ · សរុប $${money(total)}?\n(សូមប្រាកដថាបានផ្ទេរលុយរួចហើយ)${bad.length ? '\n\nរំលង៖ ' + bad.join(', ') : ''}`))) return;
      const { error, cancelled } = await bankRpc('bank_mark_paid', { p_month: curMonth, p_kind: curRound, p_rows: todo.map(({ employee_id, amount_usd, bank_name, account_no, account_name, reference }) => ({ employee_id, amount_usd, bank_name, account_no, account_name, reference })) });
      if (cancelled) return;
      if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return; }
      todo.forEach(x => {
        bankPaid[pkey(x.month, x.employee_id, x.kind)] = x; bankInfo[x.employee_id] = x;
        if (typeof logAudit === 'function') logAudit('bank_paid', { entity: 'bank_payment', ref: x.month + '|' + x.employee_id + '|' + x.kind, month: x.month, employeeId: x.employee_id, new: { round: x.kind, amount_usd: x.amount_usd, bank: x.bank_name, account_no: maskAcc(x.account_no) } });
      });
    } else {
      const del = ids.filter(isPaid);
      if (!del.length) { await customAlert('ជួរដែលបានជ្រើសមិនទាន់ត្រូវបានសម្គាល់ថាបានបើកទេ'); return; }
      if (!(await customConfirm(`ដកការសម្គាល់ "បានបើក" (${ROUND_SHORT[curRound]}) ${del.length} នាក់?`))) return;
      const { error, cancelled } = await bankRpc('bank_unmark_paid', { p_month: curMonth, p_kind: curRound, p_ids: del });
      if (cancelled) return;
      if (error) { await customAlert('លុបមិនបានជោគជ័យ៖ ' + error.message); return; }
      del.forEach(id => {
        const old = bankPaid[pkey(curMonth, id)]; delete bankPaid[pkey(curMonth, id)];
        if (typeof logAudit === 'function') logAudit('bank_unpaid', { entity: 'bank_payment', ref: curMonth + '|' + id + '|' + curRound, month: curMonth, employeeId: id, old: old ? { amount_usd: old.amount_usd } : null, new: null });
      });
    }
    render();
  }

  // ================================================================ panels ====
  let panel = null;
  function openPanel(title, html) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'bp-ovl'; panel.style.zIndex = '9985';
      panel.innerHTML = '<div class="bp-box" role="dialog" aria-modal="true"><h2 id="bpPTitle"></h2><div id="bpPBody"></div><div class="bp-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="bpPClose">បិទ</button></div></div>';
      document.body.appendChild(panel);
      panel.querySelector('#bpPClose').addEventListener('click', closePanel);
      panel.addEventListener('mousedown', e => { if (e.target === panel) closePanel(); });
    }
    panel.querySelector('#bpPTitle').innerHTML = title;
    const body = panel.querySelector('#bpPBody');
    body.innerHTML = html;
    panel.classList.add('open');
    return body;
  }
  function closePanel() { if (panel) panel.classList.remove('open'); }
  const refreshMain = () => { if (overlay && overlay.classList.contains('open') && curRows.length) render(); else updateProbBtn(); };

  const audit = (action, empId, o) => { if (typeof logAudit === 'function') logAudit(action, { entity: 'employee_bank', ref: empId, employeeId: empId, ...o }); };

  // ---------------------------------------------------------------- សម្គាល់ / ដោះស្រាយបញ្ហា ----
  async function flagIssue(empId) {
    const inf = bankInfo[empId];
    if (!inf || !inf.account_no) { await customAlert('បុគ្គលិកនេះមិនទាន់មានគណនីធនាគារទេ'); return false; }
    const reason = await customPrompt(`មូលហេតុដែលគណនីមានបញ្ហា (${nameOf(empId)})៖\nឧ. ធនាគារបដិសេធ / ឈ្មោះមិនត្រូវ / គណនីបិទ`);
    if (reason === null) return false;
    const txt = cleanTxt(reason);
    if (!txt) { await customAlert('សូមបញ្ជាក់មូលហេតុ'); return false; }
    let unmark = null;
    if (bankPaid[pkey(curMonth, empId)] && await customConfirm(`ខែ ${curMonth} (${ROUND_SHORT[curRound]}) ត្រូវបានសម្គាល់ថាបានបើករួច។\nដកការសម្គាល់នោះ (ព្រោះប្រាក់មិនទាន់ដល់)?`)) unmark = curMonth;
    const { error, cancelled } = await bankRpc('bank_set_issue', { p_emp: empId, p_issue: txt, p_unmark_month: unmark, p_unmark_kind: unmark ? curRound : null });
    if (cancelled) return false;
    if (error) { await customAlert('មិនជោគជ័យ៖ ' + error.message); return false; }
    bankInfo[empId] = { ...inf, issue: txt, issue_at: new Date().toISOString() };
    if (unmark) delete bankPaid[pkey(unmark, empId)];
    audit('bank_issue_flag', empId, { new: { issue: txt, account_no: maskAccount(inf.account_no), unmarked_month: unmark } });
    refreshMain();
    return true;
  }

  async function resolveIssue(empId) {
    const inf = bankInfo[empId]; if (!inf || !inf.issue) return false;
    if (!(await customConfirm(`ដោះស្រាយបញ្ហាគណនីរបស់ ${nameOf(empId)}?\n(គណនីនេះនឹងអាចបើកប្រាក់បានឡើងវិញ)`))) return false;
    const { error, cancelled } = await bankRpc('bank_set_issue', { p_emp: empId, p_issue: '', p_unmark_month: null, p_unmark_kind: null });
    if (cancelled) return false;
    if (error) { await customAlert('មិនជោគជ័យ៖ ' + error.message); return false; }
    audit('bank_issue_clear', empId, { old: { issue: inf.issue }, new: null });
    bankInfo[empId] = { ...inf, issue: '', issue_at: null };
    refreshMain();
    return true;
  }

  // ---------------------------------------------------------------- 👥 បញ្ជីបុគ្គលិក ----
  async function ensureBank() {
    if (overlay && overlay.classList.contains('open') && Object.keys(bankInfo).length) return true;
    if (!curMonth) curMonth = currentMonthlyMonth();
    return loadBank(curMonth);
  }

  async function showEmpList() {
    if (!(await ensureBank())) { await customAlert('មិនអាចផ្ទុកទិន្នន័យធនាគារបាន៖ ' + (missing || '')); return; }
    const body = openPanel('👥 បញ្ជីបុគ្គលិក — គណនីធនាគារ', `
      <div class="bp-sub">
        <input type="text" id="elQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:210px">
        <select id="elF"><option value="">ទាំងអស់</option><option value="ok">គ្រប់គ្រាន់</option><option value="missing">ខ្វះព័ត៌មាន</option><option value="issue">មានបញ្ហា</option></select>
        <label style="display:flex;gap:4px;align-items:center;font-size:.78rem;margin:0"><input type="checkbox" id="elInact"> បង្ហាញអ្នកឈប់បម្រើការ</label>
        <span class="bp-sum" id="elCnt" style="flex:1 1 auto"></span>
      </div>
      <div class="table-wrap" style="max-height:58vh;overflow:auto"><table class="bp-tbl">
        <thead><tr><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th>ស្ថានភាព</th><th></th></tr></thead>
        <tbody id="elBody"></tbody></table></div>`);
    const $ = id => body.querySelector('#' + id);
    const draw = () => {
      const q = $('elQ').value.trim().toLowerCase(), f = $('elF').value, inact = $('elInact').checked;
      const list = allEmps().filter(e => (inact || (e.status || 'active') === 'active')
        && (!q || ((e.name || '') + ' ' + (e.username || '')).toLowerCase().includes(q)) && (!f || acctState(e.id) === f)).sort(byName);
      $('elCnt').textContent = `${list.length} នាក់`;
      $('elBody').innerHTML = list.length ? list.map(e => {
        const i = bankInfo[e.id] || {}, st = acctState(e.id);
        return `<tr data-id="${esc(e.id)}">
          <td>${esc(e.username || '')}</td><td>${esc(e.name || '')}${(e.status || 'active') !== 'active' ? ' <small class="bp-no">(ឈប់)</small>' : ''}</td><td>${esc(e.dept || '')}</td>
          <td>${esc(i.bank_name || '-')}</td><td>${esc(i.account_no || '-')}</td><td>${esc(i.account_name || '-')}</td>
          <td>${STATE_BADGE[st]}${st === 'issue' ? `<div class="bp-reason">${esc(i.issue)}</div>` : ''}</td>
          <td><button class="secondary bp-act" data-act="chg">🔄 ប្តូរ</button> ${st === 'issue' ? '<button class="secondary bp-act" data-act="ok">✓ ដោះស្រាយ</button>' : (st === 'ok' ? '<button class="secondary bp-act" data-act="flag">⚠ បញ្ហា</button>' : '')}</td></tr>`;
      }).join('') : '<tr><td colspan="8" style="padding:16px">មិនមានទិន្នន័យ</td></tr>';
    };
    ['elQ', 'elF', 'elInact'].forEach(id => $(id).addEventListener(id === 'elQ' ? 'input' : 'change', draw));
    $('elBody').addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
      if (act === 'chg') openChange(id);
      else if (act === 'flag') { if (await flagIssue(id)) draw(); }
      else if (act === 'ok') { if (await resolveIssue(id)) draw(); }
    });
    draw();
  }

  // ---------------------------------------------------------------- ⚠️ គណនីមានបញ្ហា ----
  async function showProblems() {
    if (!(await ensureBank())) { await customAlert('មិនអាចផ្ទុកទិន្នន័យធនាគារបាន៖ ' + (missing || '')); return; }
    const body = openPanel('⚠️ គណនីមានបញ្ហា', '<div id="prBox"></div>');
    const draw = () => {
      const flagged = allEmps().filter(e => bankInfo[e.id] && bankInfo[e.id].issue).sort(byName);
      const missingL = allEmps().filter(e => (e.status || 'active') === 'active' && !hasBank(e.id)).sort(byName);
      body.querySelector('#prBox').innerHTML = `
        <div style="font-weight:700;font-size:.85rem;margin:4px 0 6px;color:#dc2626">⚠ គណនីដែលបានសម្គាល់ថាមានបញ្ហា (${flagged.length}) <small style="font-weight:400;color:var(--text-muted)">— មិនត្រូវបាន Export / សម្គាល់ថាបានបើក រហូតដល់ប្តូរ ឬដោះស្រាយ</small></div>
        <div class="table-wrap" style="max-height:30vh;overflow:auto"><table class="bp-tbl"><thead><tr><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ធនាគារ</th><th>លេខគណនី</th><th>មូលហេតុ</th><th>ពេលសម្គាល់</th><th></th></tr></thead><tbody>
        ${flagged.length ? flagged.map(e => { const i = bankInfo[e.id]; return `<tr data-id="${esc(e.id)}"><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(i.bank_name)}</td><td>${esc(i.account_no)}</td><td><div class="bp-reason">${esc(i.issue)}</div></td><td>${esc(i.issue_at ? fmtDT(i.issue_at) : '-')}</td>
          <td><button class="secondary bp-act" data-act="chg">🔄 ប្តូរគណនីថ្មី</button> <button class="secondary bp-act" data-act="ok">✓ ដោះស្រាយ</button></td></tr>`; }).join('') : '<tr><td colspan="7" style="padding:14px;color:var(--success)">✓ គ្មានគណនីមានបញ្ហា</td></tr>'}
        </tbody></table></div>
        <div style="font-weight:700;font-size:.85rem;margin:14px 0 6px;color:#b45309">ខ្វះព័ត៌មានធនាគារ (${missingL.length}) <small style="font-weight:400;color:var(--text-muted)">— បុគ្គលិកកំពុងបម្រើការ</small></div>
        <div class="table-wrap" style="max-height:26vh;overflow:auto"><table class="bp-tbl"><thead><tr><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th></th></tr></thead><tbody>
        ${missingL.length ? missingL.map(e => `<tr data-id="${esc(e.id)}"><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td><td><button class="secondary bp-act" data-act="chg">➕ បញ្ចូលគណនី</button></td></tr>`).join('') : '<tr><td colspan="4" style="padding:14px;color:var(--success)">✓ បុគ្គលិកទាំងអស់មានគណនី</td></tr>'}
        </tbody></table></div>`;
    };
    body.addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      if (btn.dataset.act === 'chg') openChange(id);
      else if (btn.dataset.act === 'ok') { if (await resolveIssue(id)) draw(); }
    });
    draw();
  }

  // ---------------------------------------------------------------- 🔄 ប្តូរគណនីថ្មី ----
  async function openChange(preId) {
    if (!(await ensureBank())) { await customAlert('មិនអាចផ្ទុកទិន្នន័យធនាគារបាន៖ ' + (missing || '')); return; }
    const opts = allEmps().slice().sort(byName).map(e => `<option value="${esc(e.id)}"${e.id === preId ? ' selected' : ''}>${esc(e.username || '')} — ${esc(e.name || '')}</option>`).join('');
    const body = openPanel('🔄 ប្តូរគណនីថ្មី', `
      <p class="bp-note">គណនីចាស់ត្រូវបានរក្សាក្នុងប្រវត្តិ។ ការបើកប្រាក់ដែលបានធ្វើរួចរក្សាគណនីដែលបានប្រើពេលនោះ។ ប្តូរគណនីនឹងលុបសញ្ញា ⚠ មានបញ្ហា ដោយស្វ័យប្រវត្តិ។</p>
      <div class="form-group"><label>បុគ្គលិក</label><select id="chEmp" style="width:100%"><option value="">— ជ្រើសរើស —</option>${opts}</select></div>
      <div id="chCur" style="font-size:.8rem;margin:0 0 10px"></div>
      <div class="bp-grid">
        <div class="form-group" style="margin:0"><label>ធនាគារថ្មី</label><input type="text" id="chBank" list="bpBanks" placeholder="ABA Bank"></div>
        <div class="form-group" style="margin:0"><label>លេខគណនីថ្មី</label><input type="text" id="chAcc" inputmode="numeric" placeholder="000 123 456"></div>
        <div class="form-group" style="margin:0"><label>ឈ្មោះគណនីថ្មី</label><input type="text" id="chName" placeholder="SOK SOPHEA"></div>
        <div class="form-group" style="margin:0"><label>មូលហេតុ</label><input type="text" id="chReason" list="bpReasons" placeholder="ឧ. បាត់កាត"></div>
      </div>
      <datalist id="bpReasons"><option value="បាត់កាត / បិទគណនី"><option value="ប្តូរធនាគារ"><option value="លេខគណនីខុស"><option value="ឈ្មោះគណនីមិនត្រូវ"><option value="ធនាគារបដិសេធ"></datalist>
      <div class="bp-bar"><button id="chSave">💾 រក្សាទុកគណនីថ្មី</button></div>
      <div style="font-weight:700;font-size:.82rem;margin:8px 0 4px">ប្រវត្តិប្តូរគណនីរបស់បុគ្គលិកនេះ</div>
      <div id="chHist" class="bp-note">ជ្រើសបុគ្គលិកដើម្បីមើល</div>`);
    const $ = id => body.querySelector('#' + id);
    const showCur = async () => {
      const id = $('chEmp').value;
      if (!id) { $('chCur').innerHTML = ''; $('chHist').textContent = 'ជ្រើសបុគ្គលិកដើម្បីមើល'; return; }
      const i = bankInfo[id];
      $('chCur').innerHTML = i && i.account_no
        ? `<b>គណនីបច្ចុប្បន្ន៖</b> ${esc(i.bank_name)} · ${esc(i.account_no)} · ${esc(i.account_name)} ${i.issue ? `<span style="color:#dc2626">⚠ ${esc(i.issue)}</span>` : ''}`
        : '<span style="color:#b45309">មិនទាន់មានគណនី</span>';
      $('chHist').textContent = 'កំពុងផ្ទុក...';
      const { data, error } = await bankRpc('bank_history', { p_emp: id });
      if ($('chEmp').value !== id) return;
      if (error || !data) { $('chHist').textContent = error ? error.message : ''; return; }
      const ch = data.changes || [];
      $('chHist').innerHTML = ch.length ? `<div class="table-wrap" style="max-height:24vh;overflow:auto"><table class="bp-tbl"><thead><tr><th>ពេល</th><th>គណនីចាស់</th><th>គណនីថ្មី</th><th>មូលហេតុ</th></tr></thead><tbody>${ch.map(c =>
        `<tr><td>${esc(fmtDT(c.changed_at))}</td><td>${c.old_account_no ? esc(c.old_bank + ' · ' + c.old_account_no + ' · ' + c.old_account_name) : '<span class="bp-no">(គ្មាន)</span>'}</td><td>${esc(c.new_bank + ' · ' + c.new_account_no + ' · ' + c.new_account_name)}</td><td style="white-space:normal">${esc(c.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<span class="bp-no">មិនទាន់មានប្រវត្តិប្តូរ</span>';
    };
    $('chEmp').addEventListener('change', showCur);
    $('chSave').addEventListener('click', async () => {
      const id = $('chEmp').value;
      if (!id) { await customAlert('សូមជ្រើសរើសបុគ្គលិក'); return; }
      const nb = cleanTxt($('chBank').value), na = cleanAcc($('chAcc').value), nn = cleanTxt($('chName').value).toUpperCase(), rs = cleanTxt($('chReason').value);
      if (!(nb && na && nn)) { await customAlert('សូមបំពេញ ធនាគារ + លេខគណនី + ឈ្មោះគណនី'); return; }
      const o = bankInfo[id];
      if (o && o.bank_name === nb && o.account_no === na && o.account_name === nn) { await customAlert('ដូចគណនីបច្ចុប្បន្ន — គ្មានអ្វីត្រូវប្តូរ'); return; }
      if (!(await customConfirm(`ប្តូរគណនីរបស់ ${nameOf(id)}៖\n${o && o.account_no ? `${o.bank_name} · ${o.account_no}\n→ ` : ''}${nb} · ${na} · ${nn}\n\nបន្ត?`))) return;
      const { error, cancelled } = await bankRpc('bank_change_account', { p_emp: id, p_bank: nb, p_acc: na, p_name: nn, p_reason: rs });
      if (cancelled) return;
      if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return; }
      bankInfo[id] = { employee_id: id, bank_name: nb, account_no: na, account_name: nn, issue: '', issue_at: null };
      audit('bank_account_change', id, { old: o && o.account_no ? { bank: o.bank_name, account_no: maskAccount(o.account_no) } : null, new: { bank: nb, account_no: maskAccount(na) }, note: rs || null });
      refreshMain();
      ['chBank', 'chAcc', 'chName', 'chReason'].forEach(k => { $(k).value = ''; });
      await showCur();
      await customAlert('បានប្តូរគណនីថ្មីរួចរាល់');
    });
    if (preId) showCur();
  }

  // ---------------------------------------------------------------- 📜 ប្រវត្តិបើកប្រាក់ខែ ----
  async function showHistory() {
    const body = openPanel('📜 ប្រវត្តិបើកប្រាក់ខែតាមធនាគារ', '<div class="bp-note">កំពុងផ្ទុក...</div>');
    const { data, error, cancelled } = await bankRpc('bank_history', { p_emp: null });
    if (cancelled) { closePanel(); return; }
    if (error || !data) { body.innerHTML = `<div class="bp-warn">⚠️ ${esc(error ? error.message : 'មិនមានទិន្នន័យ')}</div>`; return; }
    const pays = data.payments || [], chg = data.changes || [];
    let view = 'pay';
    const ids = [...new Set(pays.map(x => x.employee_id).concat(chg.map(x => x.employee_id)))];
    const empOpts = ids.map(id => `<option value="${esc(id)}">${esc(userOf(id))} — ${esc(nameOf(id))}</option>`).join('');
    body.innerHTML = `
      <div class="bp-sub">
        <button class="secondary bp-tab on" id="hvPay">ការបើកប្រាក់ (${pays.length})</button>
        <button class="secondary bp-tab" id="hvChg">ការប្តូរគណនី (${chg.length})</button>
        <select id="hvEmp"><option value="">បុគ្គលិកទាំងអស់</option>${empOpts}</select>
        <input type="month" id="hvMonth" title="ខែ (ទទេ = ទាំងអស់)">
        <button class="secondary" id="hvXlsx">📊 Export Excel</button>
        <span class="bp-sum" id="hvSum" style="flex:1 1 auto"></span>
      </div>
      <div class="table-wrap" style="max-height:58vh;overflow:auto"><table class="bp-tbl"><thead id="hvHead"></thead><tbody id="hvBody"></tbody></table></div>`;
    const $ = id => body.querySelector('#' + id);
    const filt = () => { const e = $('hvEmp').value, m = $('hvMonth').value; return { e, m }; };
    const draw = () => {
      const { e, m } = filt();
      $('hvPay').classList.toggle('on', view === 'pay'); $('hvChg').classList.toggle('on', view === 'chg');
      $('hvMonth').style.display = view === 'pay' ? '' : 'none'; $('hvXlsx').style.display = view === 'pay' ? '' : 'none';
      if (view === 'pay') {
        const rows = pays.filter(x => (!e || x.employee_id === e) && (!m || x.month === m));
        const total = rows.reduce((s, x) => s + Number(x.amount_usd || 0), 0);
        $('hvHead').innerHTML = '<tr><th>ខែ</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th style="text-align:right">ចំនួន ($)</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th>ពេលបើក</th><th>ដង</th></tr>';
        $('hvBody').innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.month)}</td><td>${esc(userOf(x.employee_id))}</td><td>${esc(nameOf(x.employee_id))}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(x.amount_usd)}</td><td>${esc(x.bank_name)}</td><td>${esc(x.account_no)}</td><td>${esc(x.account_name)}</td><td>${esc(fmtDT(x.paid_at))}</td><td>${x.kind === 'advance' ? 'ទី១ (ប្រាក់ខែទី១)' : 'ចុងខែ'}</td></tr>`).join('')
          : '<tr><td colspan="9" style="padding:16px">មិនមានប្រវត្តិបើកប្រាក់</td></tr>';
        $('hvSum').textContent = `${rows.length} ដង · សរុប $${money(total)}`;
      } else {
        const rows = chg.filter(x => !e || x.employee_id === e);
        $('hvHead').innerHTML = '<tr><th>ពេល</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>គណនីចាស់</th><th>គណនីថ្មី</th><th>មូលហេតុ</th></tr>';
        $('hvBody').innerHTML = rows.length ? rows.map(c => `<tr><td>${esc(fmtDT(c.changed_at))}</td><td>${esc(userOf(c.employee_id))}</td><td>${esc(nameOf(c.employee_id))}</td><td>${c.old_account_no ? esc(c.old_bank + ' · ' + c.old_account_no) : '<span class="bp-no">(គ្មាន)</span>'}</td><td>${esc(c.new_bank + ' · ' + c.new_account_no)}</td><td style="white-space:normal">${esc(c.reason || '')}</td></tr>`).join('')
          : '<tr><td colspan="6" style="padding:16px">មិនមានប្រវត្តិប្តូរគណនី</td></tr>';
        $('hvSum').textContent = `${rows.length} ដង`;
      }
    };
    $('hvPay').addEventListener('click', () => { view = 'pay'; draw(); });
    $('hvChg').addEventListener('click', () => { view = 'chg'; draw(); });
    $('hvEmp').addEventListener('change', draw);
    $('hvMonth').addEventListener('change', draw);
    $('hvXlsx').addEventListener('click', () => {
      const { e, m } = filt();
      const rows = pays.filter(x => (!e || x.employee_id === e) && (!m || x.month === m));
      if (!rows.length) { customAlert('មិនមានទិន្នន័យ'); return; }
      downloadXlsx('bank_payment_history.xlsx', [{
        name: 'Bank Payment History',
        columns: [{ header: 'Month', width: 10, fmt: 'text' }, { header: 'Employee ID', width: 12, fmt: 'text' }, { header: 'Employee Name', width: 26, fmt: 'text' },
          { header: 'Amount (USD)', width: 14, fmt: 'usd' }, { header: 'Bank', width: 24, fmt: 'text' }, { header: 'Account Number', width: 20, fmt: 'text' },
          { header: 'Account Name', width: 26, fmt: 'text' }, { header: 'Paid At', width: 18, fmt: 'text' }, { header: 'Round', width: 12, fmt: 'text' }],
        rows: rows.map(x => [x.month, userOf(x.employee_id), nameOf(x.employee_id), Number(x.amount_usd || 0), x.bank_name, String(x.account_no), x.account_name, fmtDT(x.paid_at), x.kind === 'advance' ? 'Advance' : 'Final']),
        totals: { label: `សរុប (${rows.length})`, labelCol: 2, sumCols: [3] },
      }]);
    });
    draw();
  }

  // ---------------------------------------------------------------- init ----
  function init() {
    const anchor = document.getElementById('monthlyXlsxBtn');
    if (!anchor || document.getElementById('monthlyBankBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyBankBtn'; btn.type = 'button';
    btn.textContent = '🏦 បើកប្រាក់ខែតាមធនាគារ';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openBankPay = open;
})();
