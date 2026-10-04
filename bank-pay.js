/* ==========================================================================
   bank-pay.js — បើកប្រាក់ខែតាមប្រព័ន្ធធនាគារ (Admin)
   ① រក្សាទុកគណនីធនាគាររបស់បុគ្គលិក  ② Export បញ្ជីផ្ទេរប្រាក់ (Excel / CSV)
   ③ សម្គាល់ថា "បានបើកតាមធនាគារ" ក្នុងខែដែលបានបិទ
   ④ ប្រវត្តិបើកប្រាក់ · បញ្ជីបុគ្គលិក · គណនីមានបញ្ហា · ប្តូរគណនីថ្មី
   ⑥ 🌐 Internet Banking៖ ផ្ទេរម្នាក់ម្តងៗ (Copy លេខគណនី/ចំនួន + បើកតំណធនាគារ + កត់ថាបានផ្ទេរ) · ជាក្រុមតាមធនាគារ (Export) · តំណធនាគារ (រក្សាក្នុង Supabase)
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
    if (error && /not_paid/.test(error.message)) return { error: { message: 'ការបើកប្រាក់នេះមិនទាន់ត្រូវបានកត់ថា "បានបើក"' } };
    if (error && /bank_set_txn/.test(error.message) && /does not exist|Could not find/i.test(error.message)) return { error: { message: 'មិនទាន់ដំណើរការ bank-pay-plus.sql ក្នុង Supabase — សូម Run ឯកសារនោះជាមុន រួចរង់ចាំ ១០ វិនាទី' } };
    if (error && /bank_(load|save_info|history|set_issue|change_account|mark_paid|unmark_paid)/.test(error.message) && /does not exist|Could not find/i.test(error.message)) return { error: { message: 'មិនទាន់ដំណើរការ bank-pay.sql (v4) ក្នុង Supabase — សូមបើក Supabase → SQL Editor ហើយ Run ឯកសារ bank-pay.sql ទាំងមូលម្តងទៀត រួចរង់ចាំ ១០ វិនាទី' } };
    if (!error) adminPw = pw;
    return { data, error };
  }

  let loadCancelled = false; // true = អ្នកប្រើចុច "បោះបង់" លើប្រអប់ពាក្យសម្ងាត់ (មិនមែនកំហុសប្រព័ន្ធ)
  async function loadBank(month) {
    missing = null; loadCancelled = false;
    const { data, error, cancelled } = await bankRpc('bank_load', { p_month: month });
    if (cancelled) { missing = 'បានបោះបង់'; loadCancelled = true; return false; }
    if (error) { missing = error.message; return false; }
    bankInfo = {};
    ((data && data.info) || []).forEach(r => { bankInfo[r.employee_id] = r; });
    Object.keys(bankPaid).filter(k => k.startsWith(month + '|')).forEach(k => delete bankPaid[k]);
    ((data && data.paid) || []).forEach(r => { bankPaid[r.month + '|' + r.employee_id + '|' + (r.kind || 'final')] = r; });
    return true;
  }

  // ក្រឡាចំនួនទឹកប្រាក់នៃដងនីមួយៗ (ប្រាក់ខែទី១ / ប្រាក់ខែទី២) — ដងដែលកំពុងជ្រើសត្រូវបានបញ្ជាក់ដោយអក្សរដិត
  const roundCell = (v, paidFlag, round) => `<td style="text-align:right;font-variant-numeric:tabular-nums;${curRound === round ? 'font-weight:700;background:color-mix(in srgb,var(--accent,#0d9488) 8%,transparent);' : ''}">${v > 0 ? money(v) : '<span class="bp-no">-</span>'}${paidFlag ? '<div class="bp-ok" style="font-size:.66rem">✓ បានបើក</div>' : ''}</td>`;
  const ROUND_LABEL = { advance: 'ប្រាក់ខែទី១ · ថ្ងៃ 25', final: 'ប្រាក់ខែទី២ · ថ្ងៃទី 10 (នៅសល់)' };
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
  const ROUND_SHORT = { advance: 'ប្រាក់ខែទី១', final: 'ប្រាក់ខែទី២' };
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
.bp-wa{color:#b45309;font-size:.66rem;white-space:normal;max-width:190px;line-height:1.25}
.bp-wa:empty{display:none}
.bp-bar-bg{height:8px;border-radius:6px;background:var(--border,#e1e8ef);min-width:90px;overflow:hidden}
.bp-bar-fg{height:100%;background:var(--accent,#0d9488)}
.bp-ta{width:100%;min-height:120px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.76rem;padding:8px;box-sizing:border-box}
.bp-st-ok{color:var(--success,#059669);font-weight:600}.bp-st-bad{color:#dc2626;font-weight:600}.bp-st-warn{color:#b45309;font-weight:600}
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
          <button id="bpIbBtn">🌐 Internet Banking</button>
          <button class="secondary" id="bpImpBtn">📥 នាំចូលគណនី (CSV)</button>
          <button class="secondary" id="bpRecBtn">🧾 ផ្ទៀងផ្ទាត់ Statement</button>
          <button class="secondary" id="bpSumBtn">📈 សង្ខេបតាមធនាគារ</button>
          <span class="bp-mon"><select id="bpRound" title="ជ្រើសប្រាក់ខែទី១ ឬ ប្រាក់ខែទី២"><option value="advance">ប្រាក់ខែទី១ · ថ្ងៃ 25</option><option value="final" selected>ប្រាក់ខែទី២ · ថ្ងៃទី 10 (ថយបើឈប់/បុណ្យ)</option></select><button class="secondary" id="bpPrev" title="ខែមុន">◀</button><input type="month" id="bpMonthInput" title="ជ្រើសខែ"><button class="secondary" id="bpNext" title="ខែក្រោយ">▶</button></span>
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
    $('bpIbBtn').addEventListener('click', showIB);
    $('bpImpBtn').addEventListener('click', showImport);
    $('bpRecBtn').addEventListener('click', showReconcile);
    $('bpSumBtn').addEventListener('click', showBankSummary);
    $('bpBody').addEventListener('click', onRowAction);
    $('bpBody').addEventListener('input', ev => { if (ev.target.closest('.bp-acc, .bp-bank')) refreshWarns(); });
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
      const retryBtn = '<button class="secondary" id="bpRetry" style="margin-left:8px">↻ ព្យាយាមម្តងទៀត</button>';
      overlay.querySelector('#bpStatus').innerHTML = loadCancelled
        // បោះបង់ពាក្យសម្ងាត់ → សារស្អាត គ្មានការណែនាំអំពី SQL (ព្រោះមិនទាន់បានហៅ Supabase)
        ? `<div class="bp-warn" style="background:#e0f2fe;color:#075985">🔒 ត្រូវការពាក្យសម្ងាត់ Admin ដើម្បីមើលព័ត៌មានធនាគារ។ ${retryBtn}</div>`
        // កំហុសផ្សេង (ពាក្យសម្ងាត់ខុស / SQL មិនទាន់ Run) → បង្ហាញមូលហេតុពិត · សារអំពី SQL (v4) មកពី bankRpc ស្រាប់
        : `<div class="bp-warn">⚠️ មិនអាចផ្ទុកទិន្នន័យធនាគារបាន៖ ${esc(missing)} ${retryBtn}</div>`;
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
      ? `<div class="bp-warn" style="${blue}">💵 <b>ប្រាក់ខែទី១ · ថ្ងៃ 25</b> · ថ្ងៃទូទាត់ ${dueInfo(advDateOf(curMonth))}${payDateNote(advBase(curMonth), advDateOf(curMonth))}${holidayWarn()}<br>ទឹកប្រាក់តាមច្បាប់ប្រាក់ខែទី១ (បុគ្គលិកដែលមានសិទ្ធិប៉ុណ្ណោះ)។ សម្គាល់ថាបានបើកបាននៅពេលដល់ថ្ងៃទូទាត់ (មិនចាំបាច់បិទខែ)។</div>`
      : `<div class="bp-warn" style="${blue}">💵 <b>ប្រាក់ខែទី២ · ថ្ងៃទី 10 — ប្រាក់ខែនៅសល់ នៃខែ ${esc(curMonth)}</b> · ត្រូវបើកត្រឹម ${dueInfo(finalDateOf(curMonth))}${payDateNote(finalBase(curMonth), finalDateOf(curMonth))}${holidayWarn()}<br>ទឹកប្រាក់ = ប្រាក់ខែសុទ្ធ ដែលបានកាត់ប្រាក់ខែទី១ រួចហើយ។</div>`
        + (locked ? '' : `<div class="bp-warn">🔓 ខែ ${esc(curMonth)} មិនទាន់បិទ — លេខអាចផ្លាស់ប្តូរ។ ត្រូវ "🔒 បិទខែ" ជាមុនថ្ងៃទី 10 ទើបអាចសម្គាល់ថា "បានបើក" ប្រាក់ខែទី២ បាន (Export ពិនិត្យមើលបាន)។</div>`);
    overlay.querySelector('#bpStatus').insertAdjacentHTML('afterbegin', reminderHtml());
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
        <td><input type="text" class="bp-acc" inputmode="numeric" value="${esc(inf.account_no || '')}" placeholder="000 123 456" ${paid ? 'disabled' : ''}><div class="bp-wa"></div></td>
        <td><input type="text" class="bp-name" value="${esc(inf.account_name || '')}" placeholder="SOK SOPHEA" ${paid ? 'disabled' : ''}></td>
        ${roundCell(advOf(row), isPaid(e.id, 'advance'), 'advance')}${roundCell(r2(t.net), isPaid(e.id, 'final'), 'final')}
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${money(net)}</td>
        <td>${paid ? `<span class="bp-ok">✓ បានបើក</span><div class="bp-no" style="font-size:.68rem">${esc(String(paid.paid_at || '').slice(0, 16).replace('T', ' '))}</div>`
          + (paid.txn_ref ? `<div style="font-size:.68rem">🔖 ${esc(paid.txn_ref)}</div>` : '')
          + '<div style="margin-top:3px"><button class="secondary bp-act" data-bpact="txn" title="កត់លេខយោងពីធនាគារ">🔖 លេខយោង</button> <button class="secondary bp-act" data-bpact="slip" title="បោះពុម្ពព្រឹត្តិប័ត្រ">🖨 Slip</button></div>'
          : (net <= 0 ? `<span class="bp-no">${curRound === 'advance' ? 'មិនមានសិទ្ធិប្រាក់ខែទី១' : 'គ្មានទឹកប្រាក់'}</span>` : (!hasBank(e.id) ? '<span style="color:#b45309">ខ្វះព័ត៌មានធនាគារ</span>' : (issueOf(e.id) ? `<span style="color:#dc2626;font-weight:600" title="${esc(issueOf(e.id))}">⚠ មានបញ្ហា</span>` : '<span class="bp-no">មិនទាន់បើក</span>')))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" style="padding:16px;">មិនមានបុគ្គលិកក្នុងខែនេះ</td></tr>';
    updateSum();
    updateProbBtn();
    refreshWarns();
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
      ? `ប្រាក់ខែសរុបទាំងខែ (ប្រាក់ខែទី១ + ប្រាក់ខែទី២) $${money(all)} = $${money(adv1)} + $${money(fin)} · បានបើកសរុប $${money(paidAll)} (ប្រាក់ខែទី១ $${money(paidAdv)} · ប្រាក់ខែទី២ $${money(paidFin)}) · នៅសល់ $${money(Math.max(0, all - paidAll))}`
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
  async function exportList(kind, onlyBank) {
    if (!curRows.length) { await customAlert('មិនមានទិន្នន័យ'); return; }
    // ប្រើតម្លៃក្នុងប្រអប់ (មិនទាន់រក្សាទុកក៏បាន) ប៉ុន្តែត្រូវពេញលេញ
    const inputs = {}; readRowInputs().forEach(r => { inputs[r.employee_id] = r; });
    const list = [], skipped = [];
    curRows.forEach(row => {
      const { e } = row;
      const net = amountOf(row);
      const inf = inputs[e.id] || bankInfo[e.id] || {};
      if (onlyBank && (inf.bank_name || '') !== onlyBank) return;
      if (net <= 0) return;
      if (isPaid(e.id)) { skipped.push(`${e.name} (បានបើករួច)`); return; }
      if (!(inf.bank_name && inf.account_no && inf.account_name)) { skipped.push(`${e.name} (ខ្វះព័ត៌មានធនាគារ)`); return; }
      if (issueOf(e.id, inf)) { skipped.push(`${e.name} (គណនីមានបញ្ហា)`); return; }
      list.push({ e, net, inf });
    });
    if (!list.length) { await customAlert('គ្មានបុគ្គលិកដែលអាច Export បានទេ' + (skipped.length ? '\n\nរំលង៖\n' + skipped.join('\n') : '')); return; }
    if (skipped.length && !(await customConfirm(`នឹង Export ${list.length} នាក់ ហើយរំលង ${skipped.length} នាក់៖\n${skipped.slice(0, 10).join('\n')}${skipped.length > 10 ? '\n…' : ''}\n\nបន្ត?`))) return;

    const ref = refOf();
    const suffix = (curRound === 'advance' ? '_advance' : '_final') + (onlyBank ? '_' + onlyBank.replace(/[^A-Za-z0-9]+/g, '') : '');
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
    if (paid && curRound === 'final' && !isMonthLocked(curMonth)) { await customAlert(`ប្រាក់ខែទី២៖ ត្រូវ "🔒 បិទខែ" ${curMonth} ជាមុន ទើបអាចសម្គាល់ថាបានបើក (ដើម្បីឱ្យទឹកប្រាក់ថេរ)`); return; }
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
    body.querySelector('#prBox').addEventListener('click', async ev => {   // element ថ្មីរាល់ពេលបើក → មិនមាន listener ស្ទួន
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
        $('hvHead').innerHTML = '<tr><th>ខែ</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th style="text-align:right">ចំនួន ($)</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th>ពេលបើក</th><th>ប្រាក់ខែ</th></tr>';
        $('hvBody').innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.month)}</td><td>${esc(userOf(x.employee_id))}</td><td>${esc(nameOf(x.employee_id))}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(x.amount_usd)}</td><td>${esc(x.bank_name)}</td><td>${esc(x.account_no)}</td><td>${esc(x.account_name)}</td><td>${esc(fmtDT(x.paid_at))}</td><td>${x.kind === 'advance' ? 'ប្រាក់ខែទី១' : 'ប្រាក់ខែទី២'}</td></tr>`).join('')
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

  // ================================================================ 🌐 Internet Banking ====
  // ជំនួយផ្ទេរតាម Internet Banking របស់ធនាគារ — កម្មវិធីនេះមិនផ្ទេរលុយដោយខ្លួនឯងទេ៖
  // Copy ព័ត៌មាន → បើកគេហទំព័រធនាគារ → ផ្ទេរ → ត្រឡប់មកកត់ថា "បានផ្ទេរ"
  const DEFAULT_PORTALS = {
    'ABA Bank': 'https://www.ababank.com', 'ACLEDA Bank': 'https://www.acledabank.com.kh', 'Wing Bank': 'https://www.wingbank.com.kh',
    'Canadia Bank': 'https://www.canadiabank.com.kh', 'Sathapana Bank': 'https://www.sathapana.com.kh', 'Vattanac Bank': 'https://www.vattanacbank.com',
  };
  let ibPortals = null, ibWarn = '', ibTab = 'one', ibIdx = 0, ibBusy = false;
  const okUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ''));
  const portalOf = b => (ibPortals && ibPortals[b]) || '';

  async function loadPortals() {
    if (ibPortals) return;
    ibPortals = { ...DEFAULT_PORTALS }; ibWarn = '';
    try {
      const { data, error } = await supabaseClient.from('app_settings').select('bank_portals').eq('id', 1).maybeSingle();
      if (error) { ibWarn = /bank_portals/.test(error.message) ? 'មិនទាន់មាន column bank_portals — សូម Run bank-pay.sql ម្តងទៀត (តំណនឹងមិនត្រូវបានរក្សាទុក)' : error.message; return; }
      const m = data && data.bank_portals;
      if (m && typeof m === 'object') Object.keys(m).forEach(k => { if (okUrl(m[k])) ibPortals[k] = m[k]; });
    } catch (e) { ibWarn = String(e && e.message || e); }
  }
  async function savePortals() {
    const { data, error } = await supabaseClient.from('app_settings').update({ bank_portals: ibPortals }).eq('id', 1).select('id');
    if (error || !data || !data.length) { ibWarn = error ? error.message : 'រកមិនឃើញ app_settings (id=1)'; return false; }
    ibWarn = ''; return true;
  }

  function copyTxt(text, btn) {
    const done = () => { const o = btn.dataset.l || btn.textContent; btn.dataset.l = o; btn.textContent = '✓ បាន Copy'; setTimeout(() => { btn.textContent = o; }, 1200); };
    const fb = () => { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } document.body.removeChild(t); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
  }

  // បុគ្គលិកដែលត្រូវផ្ទេរ (មិនទាន់បើក · មានទឹកប្រាក់ · មានគណនីគ្រប់ · គណនីមិនមានបញ្ហា) តម្រៀបតាមធនាគារ
  function ibQueue() {
    const inputs = {}; readRowInputs().forEach(r => { inputs[r.employee_id] = r; });
    const list = [];
    curRows.forEach(row => {
      const e = row.e, net = amountOf(row), inf = inputs[e.id] || bankInfo[e.id] || {};
      if (net <= 0 || isPaid(e.id)) return;
      if (!(inf.bank_name && inf.account_no && inf.account_name) || issueOf(e.id, inf)) return;
      list.push({ row, e, net, inf });
    });
    return list.sort((a, b) => (a.inf.bank_name || '').localeCompare(b.inf.bank_name || '') || (a.e.name || '').localeCompare(b.e.name || ''));
  }

  function ibBlockReason() {
    if (curRound === 'final' && !isMonthLocked(curMonth)) return `ប្រាក់ខែទី២៖ ត្រូវ "🔒 បិទខែ" ${curMonth} ជាមុន ទើបកត់ថា "បានផ្ទេរ" បាន (Copy/បើកធនាគារ ធ្វើបានដូចធម្មតា)`;
    if (curRound === 'advance' && !isMonthLocked(curMonth) && todayStr() < advDateOf(curMonth)) return `ប្រាក់ខែទី១៖ មិនទាន់ដល់ថ្ងៃទូទាត់ ${advDateOf(curMonth)} — កត់ថា "បានផ្ទេរ" មិនទាន់បាន`;
    return '';
  }

  // កត់ថា "បានផ្ទេរ" សម្រាប់បុគ្គលិកម្នាក់ (ច្បាប់ដូចប៊ូតុង "សម្គាល់ថាបានបើក" ក្នុងតារាង)
  async function markPaidOne(it) {
    const why = ibBlockReason();
    if (why) { await customAlert(why); return false; }
    const { e, net, inf } = it;
    const rec = { employee_id: e.id, amount_usd: net, bank_name: inf.bank_name, account_no: inf.account_no, account_name: inf.account_name, reference: refOf() };
    const { error, cancelled } = await bankRpc('bank_mark_paid', { p_month: curMonth, p_kind: curRound, p_rows: [rec] });
    if (cancelled) return false;
    if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return false; }
    const x = { ...rec, month: curMonth, kind: curRound, status: 'paid', paid_at: new Date().toISOString() };
    bankPaid[pkey(curMonth, e.id, curRound)] = x; bankInfo[e.id] = x;
    audit('bank_paid', e.id, { month: curMonth, new: { round: curRound, amount_usd: net, bank: inf.bank_name, account_no: maskAccount(inf.account_no), via: 'internet_banking' } });
    refreshMain();
    return true;
  }

  const IB_CSS = `
.ib-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.ib-card{border:1px solid var(--border,#e1e8ef);border-radius:14px;padding:14px;background:color-mix(in srgb,var(--accent,#0d9488) 4%,var(--card-bg,#fff))}
.ib-prog{font-size:.76rem;color:var(--text-muted,#5b6b80);margin-bottom:6px}
.ib-name{font-size:1.02rem;font-weight:700;margin-bottom:8px}
.ib-f{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border,#e1e8ef)}
.ib-f small{flex:0 0 96px;color:var(--text-muted,#5b6b80);font-size:.72rem}
.ib-f b{flex:1;font-size:.95rem;word-break:break-all;font-variant-numeric:tabular-nums}
.ib-f button{padding:4px 10px;font-size:.74rem}
.ib-amt b{font-size:1.15rem;color:var(--accent,#0d9488)}
.ib-link{display:inline-block;padding:8px 14px;border-radius:10px;background:var(--accent,#0d9488);color:#fff;text-decoration:none;font-size:.82rem;font-weight:600}
.ib-link.off{background:var(--border,#e1e8ef);color:var(--text-muted,#5b6b80);pointer-events:none}
`;
  let ibStyled = false;

  async function showIB() {
    if (!ibStyled) { const st = document.createElement('style'); st.textContent = IB_CSS; document.head.appendChild(st); ibStyled = true; }
    if (!curRows.length) { await customAlert('មិនមានទិន្នន័យក្នុងខែនេះ'); return; }
    const body = openPanel('🌐 Internet Banking', '<div class="bp-note">កំពុងផ្ទុក...</div>');
    await loadPortals();
    ibTab = 'one'; ibIdx = 0;
    if (!body.dataset.ibBound) {
      body.dataset.ibBound = '1';
      body.addEventListener('click', ev => ibClick(ev, body));
    }
    ibRender(body);
  }

  function ibRender(body) {
    const q = ibQueue();
    const why = ibBlockReason();
    const tab = (id, label) => `<button class="secondary bp-tab${ibTab === id ? ' on' : ''}" data-ib="tab" data-v="${id}">${label}</button>`;
    let html = `<p class="bp-note">${esc(ROUND_LABEL[curRound])} · ខែ ${esc(curMonth)} · ត្រូវផ្ទេរ <b>${q.length}</b> នាក់ · សរុប <b>$${money(q.reduce((s, x) => s + x.net, 0))}</b> — កម្មវិធីមិនផ្ទេរលុយដោយខ្លួនឯងទេ៖ Copy ព័ត៌មាន → ផ្ទេរក្នុង Internet Banking → ចុច "✓ បានផ្ទេររួច"។</p>`
      + (why ? `<div class="bp-warn">⏳ ${esc(why)}</div>` : '')
      + (ibWarn ? `<div class="bp-warn">⚠️ ${esc(ibWarn)}</div>` : '')
      + `<div class="ib-tabs">${tab('one', '👤 ផ្ទេរម្នាក់ម្តងៗ')}${tab('bulk', '🏦 ផ្ទេរជាក្រុម (តាមធនាគារ)')}${tab('cfg', '⚙ តំណធនាគារ')}</div>`;

    if (ibTab === 'one') {
      if (!q.length) html += '<div class="ib-card" style="text-align:center;color:var(--success,#059669);font-weight:600">✓ គ្មានបុគ្គលិកត្រូវផ្ទេរទៀតទេ (ឬខ្វះព័ត៌មាន/គណនីមានបញ្ហា — មើលក្នុងតារាងធនាគារ)</div>';
      else {
        if (ibIdx >= q.length) ibIdx = 0; if (ibIdx < 0) ibIdx = q.length - 1;
        const it = q[ibIdx], { e, net, inf } = it, url = portalOf(inf.bank_name);
        const acc = String(inf.account_no).replace(/[\s-]/g, '');
        const f = (label, val, copy, cls) => `<div class="ib-f ${cls || ''}"><small>${label}</small><b>${esc(val)}</b>${copy != null ? `<button class="secondary" data-ib="copy" data-v="${esc(copy)}">📋 Copy</button>` : ''}</div>`;
        html += `<div class="ib-card">
          <div class="ib-prog">${ibIdx + 1} / ${q.length}</div>
          <div class="ib-name">${esc(e.username || '')} — ${esc(e.name || '')}</div>
          ${f('ធនាគារ', inf.bank_name, null)}
          ${f('លេខគណនី', inf.account_no, acc)}
          ${f('ឈ្មោះគណនី', inf.account_name, inf.account_name)}
          ${f('ចំនួន (USD)', '$' + money(net), net.toFixed(2), 'ib-amt')}
          ${f('Remark', refOf(), refOf())}
          <div class="bp-bar" style="margin-top:12px">
            ${okUrl(url) ? `<a class="ib-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">🌐 បើកគេហទំព័រ ${esc(inf.bank_name)}</a>` : '<span class="ib-link off">មិនទាន់កំណត់តំណធនាគារនេះ (ផ្ទាំង ⚙)</span>'}
            <span style="flex:1"></span>
            <button class="secondary" data-ib="prev">◀ មុន</button>
            <button class="secondary" data-ib="next">រំលង ▶</button>
            <button data-ib="paid" ${why ? 'disabled' : ''}>✓ បានផ្ទេររួច → បន្ទាប់</button>
          </div></div>`;
        body.dataset.cur = e.id;
      }
    } else if (ibTab === 'bulk') {
      const g = {};
      q.forEach(x => { const b = x.inf.bank_name; (g[b] = g[b] || { n: 0, t: 0 }); g[b].n++; g[b].t += x.net; });
      const banks = Object.keys(g).sort();
      html += banks.length ? `<div class="table-wrap"><table class="bp-tbl"><thead><tr><th>ធនាគារ</th><th style="text-align:right">នាក់</th><th style="text-align:right">សរុប ($)</th><th>សកម្មភាព</th></tr></thead><tbody>${banks.map(b => `<tr><td>${esc(b)}</td><td style="text-align:right">${g[b].n}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${money(g[b].t)}</td>
        <td>${okUrl(portalOf(b)) ? `<a class="ib-link" style="padding:4px 10px;font-size:.74rem" href="${esc(portalOf(b))}" target="_blank" rel="noopener noreferrer">🌐 បើកធនាគារ</a>` : '<span class="bp-no" style="font-size:.74rem">គ្មានតំណ</span>'}
          <button class="secondary bp-act" data-ib="xlsx" data-v="${esc(b)}">📊 Excel</button> <button class="secondary bp-act" data-ib="csv" data-v="${esc(b)}">⬇ CSV</button></td></tr>`).join('')}</tbody></table></div>
        <p class="bp-note" style="margin-top:8px">Export តាមធនាគារនីមួយៗ ដើម្បី upload ជាក្រុម (Bulk Transfer) ក្នុង Internet Banking របស់ធនាគារនោះ។ បន្ទាប់ពីផ្ទេរ ត្រឡប់ទៅតារាងធនាគារ ជ្រើសជួរ ហើយចុច "✓ សម្គាល់ថាបានបើក"។</p>` : '<div class="ib-card" style="text-align:center">គ្មានបុគ្គលិកត្រូវផ្ទេរ</div>';
    } else {
      const names = [...new Set(Object.keys(ibPortals).concat(Object.values(bankInfo).map(i => i && i.bank_name).filter(Boolean)))].sort();
      html += `<p class="bp-note">តំណគេហទំព័រ Internet Banking របស់ធនាគារនីមួយៗ (ត្រូវចាប់ផ្តើមដោយ https://) — រក្សាក្នុង Supabase។ ត្រូវប្រាកដថាជាគេហទំព័រផ្លូវការរបស់ធនាគារ។</p>
        <div class="table-wrap"><table class="bp-tbl"><thead><tr><th>ធនាគារ</th><th style="width:100%">តំណ (URL)</th></tr></thead><tbody>${names.map(b => `<tr><td>${esc(b)}</td><td><input type="text" class="ib-url" data-bank="${esc(b)}" value="${esc(ibPortals[b] || '')}" placeholder="https://..." style="width:100%;min-width:320px"></td></tr>`).join('')}</tbody></table></div>
        <div class="bp-bar"><button data-ib="saveurl">💾 រក្សាទុកតំណ</button></div>`;
    }
    body.innerHTML = html;
  }

  async function ibClick(ev, body) {
    const btn = ev.target.closest('[data-ib]'); if (!btn || ibBusy) return;
    const act = btn.dataset.ib;
    if (act === 'copy') { copyTxt(btn.dataset.v, btn); return; }
    if (act === 'tab') { ibTab = btn.dataset.v; ibIdx = 0; ibRender(body); return; }
    if (act === 'next') { ibIdx++; ibRender(body); return; }
    if (act === 'prev') { ibIdx--; ibRender(body); return; }
    if (act === 'xlsx' || act === 'csv') { await exportList(act, btn.dataset.v); return; }
    ibBusy = true;
    try {
      if (act === 'paid') {
        const q = ibQueue(), it = q.find(x => x.e.id === body.dataset.cur);
        if (!it) { ibRender(body); return; }
        if (await markPaidOne(it)) ibRender(body);   // បុគ្គលិកនេះចេញពីជួរ → អ្នកបន្ទាប់ឡើងមកជំនួស
      } else if (act === 'saveurl') {
        const next = { ...ibPortals }; let bad = '';
        body.querySelectorAll('.ib-url').forEach(inp => {
          const v = inp.value.trim(), b = inp.dataset.bank;
          if (!v) { delete next[b]; return; }
          if (!okUrl(v)) { bad = b; return; }
          next[b] = v;
        });
        if (bad) { await customAlert(`តំណរបស់ "${bad}" មិនត្រឹមត្រូវ (ត្រូវចាប់ផ្តើមដោយ https://)`); return; }
        ibPortals = next;
        const ok = await savePortals();
        await customAlert(ok ? 'បានរក្សាទុកតំណ' : 'រក្សាទុកក្នុង Supabase មិនបាន៖ ' + ibWarn);
        ibRender(body);
      }
    } finally { ibBusy = false; }
  }

  // ================================================================ មុខងារបន្ថែម ====
  // ① ពិនិត្យលេខគណនី · ② នាំចូល CSV · ③ លេខយោង + Slip · ④ ផ្ទៀងផ្ទាត់ Statement · ⑤ សង្ខេបតាមធនាគារ · ⑥ ការរំលឹក

  const accDigits = s => String(s || '').replace(/[\s-]/g, '');
  const amtNum = v => { const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; };
  // ច្បាប់ប្រវែងលេខគណនី (ព្រមានប៉ុណ្ណោះ មិនទប់ស្កាត់) — កែបានតាមពិតរបស់ធនាគារ
  const ACC_RULES = { 'ABA Bank': [9], 'Wing Bank': [8], 'ACLEDA Bank': [13] };
  function accWarn(bank, acc, empId, taken) {
    const out = [], d = accDigits(acc);
    if (!d) return '';
    const rule = ACC_RULES[bank];
    if (rule) {
      if (!/^\d+$/.test(d)) out.push('លេខគណនីគួរមានតែលេខ');
      else if (!rule.includes(d.length)) out.push(`${bank} ជាធម្មតា ${rule.join('/')} ខ្ទង់ (ឥឡូវ ${d.length})`);
    }
    const dup = (taken[d] || []).filter(id => id !== empId);
    if (dup.length) out.push('ស្ទួនជាមួយ ' + dup.map(nameOf).join(', '));
    return out.join(' · ');
  }
  function refreshWarns() {
    if (!overlay) return;
    const rows = [...overlay.querySelectorAll('#bpBody tr[data-id]')];
    const taken = {};
    rows.forEach(tr => { const d = accDigits(tr.querySelector('.bp-acc').value); if (d) (taken[d] = taken[d] || []).push(tr.dataset.id); });
    rows.forEach(tr => {
      const el = tr.querySelector('.bp-wa'); if (!el) return;
      el.textContent = accWarn(tr.querySelector('.bp-bank').value.trim(), tr.querySelector('.bp-acc').value, tr.dataset.id, taken);
    });
  }

  // ⑥ ការរំលឹកថ្ងៃទូទាត់
  function reminderHtml() {
    const date = curRound === 'advance' ? advDateOf(curMonth) : finalDateOf(curMonth);
    const todo = curRows.filter(r => amountOf(r) > 0 && !isPaid(r.e.id));
    if (!todo.length) return '';
    const days = dayDiff(date, todayStr());
    if (days > 3) return '';
    const noBank = todo.filter(r => !hasBank(r.e.id)).length, bad = todo.filter(r => hasBank(r.e.id) && issueOf(r.e.id)).length;
    const total = todo.reduce((s, r) => s + amountOf(r), 0);
    const when = days < 0 ? `ហួសកំណត់ ${-days} ថ្ងៃ` : (days === 0 ? 'ថ្ងៃនេះជាថ្ងៃទូទាត់' : `នៅសល់ ${days} ថ្ងៃ`);
    const bg = days < 0 ? 'background:#fee2e2;color:#991b1b' : 'background:#fef3c7;color:#92400e';
    return `<div class="bp-warn" style="${bg}">⏰ <b>${when}</b> · មិនទាន់បើក ${todo.length} នាក់ ($${money(total)})${noBank ? ` · ខ្វះព័ត៌មានធនាគារ ${noBank}` : ''}${bad ? ` · គណនីមានបញ្ហា ${bad}` : ''}</div>`;
  }

  // ---- ជំនួយ៖ parse អត្ថបទ CSV/TSV ----
  function parseDelimited(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const cnt = c => (first.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
    const delim = cnt('\t') >= 1 ? '\t' : (cnt(';') > cnt(',') ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row);
    return rows.map(r => r.map(x => x.trim()));
  }
  // រកជួរឈរតាមឈ្មោះក្បាលតារាង
  const HDR = {
    id: /^(emp(loyee)?[\s_-]*(id|no|code)?|id|username|user|អត្តលេខ|លេខសម្គាល់)$/i,
    bank: /^(bank|bank[\s_-]*name|ធនាគារ)$/i,
    acc: /^(acc(ount)?([\s_-]*(no|number|num))?|លេខគណនី)$/i,
    name: /^(account[\s_-]*name|acc[\s_-]*name|beneficiary|ឈ្មោះគណនី)$/i,
    emp: /^(employee[\s_-]*name|name|ឈ្មោះ)$/i,
    amt: /^(amount([\s_-]*\(?usd\)?)?|credit|debit|usd|ចំនួន(ទឹកប្រាក់)?)$/i,
    ref: /^(ref(erence)?|txn|transaction([\s_-]*(id|ref|no))?|trx[\s_-]*id|លេខយោង)$/i,
  };
  function findCols(header) {
    const m = {};
    header.forEach((h, i) => { for (const k of Object.keys(HDR)) if (m[k] == null && HDR[k].test(h.trim())) { m[k] = i; break; } });
    return m;
  }
  function normBank(b) {
    const s = String(b || '').trim(); if (!s) return '';
    const low = s.toLowerCase();
    const hit = BANKS.find(x => x.toLowerCase() === low) || BANKS.find(x => x.toLowerCase().split(/[\s(]/)[0] === low.split(/[\s(]/)[0]);
    return hit || s;
  }
  function readFileText(file, cb) {
    if (/\.xlsx?$/i.test(file.name)) { customAlert('សូមរក្សាទុក Excel ជា .csv ជាមុន (File → Save As → CSV) ហើយជ្រើសម្តងទៀត'); return; }
    const fr = new FileReader(); fr.onload = () => cb(String(fr.result || '')); fr.readAsText(file, 'utf-8');
  }

  // ---- ② នាំចូលគណនី ----
  function showImport() {
    if (!curRows.length) { customAlert('សូមផ្ទុកទិន្នន័យខែនេះជាមុន (បញ្ចូលពាក្យសម្ងាត់ Admin)'); return; }
    const body = openPanel('📥 នាំចូលគណនីធនាគារ (CSV)', `
      <p class="bp-note">ជួរឈរ៖ <b>អត្តលេខ, ធនាគារ, លេខគណនី, ឈ្មោះគណនី</b> (មានក្បាលតារាងឬមិនមានក៏បាន — បើគ្មាន ត្រូវតាមលំដាប់នេះ)។ ចម្លងពី Excel មកបិទភ្ជាប់ ឬជ្រើសឯកសារ .csv។ ការនាំចូលគ្រាន់តែបំពេញក្នុងតារាង — ត្រូវចុច "💾 រក្សាទុកគណនីធនាគារ" ទើបរក្សាពិតប្រាកដ។</p>
      <textarea class="bp-ta" id="imTxt" placeholder="B-2808,Wing Bank,04421651,HEM SOPHEAK"></textarea>
      <div class="bp-bar"><input type="file" id="imFile" accept=".csv,.txt,.tsv"><button id="imPrev">👁 មើលជាមុន</button></div>
      <div id="imOut"></div>`);
    const $ = id => body.querySelector('#' + id);
    let plan = [];
    $('imFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFileText(f, t => { $('imTxt').value = t; $('imPrev').click(); }); });
    $('imPrev').addEventListener('click', () => {
      const rows = parseDelimited($('imTxt').value);
      if (!rows.length) { $('imOut').innerHTML = '<div class="bp-warn">គ្មានទិន្នន័យ</div>'; return; }
      let c = findCols(rows[0]), data = rows;
      const hasHdr = c.id != null || c.acc != null || c.bank != null;
      if (hasHdr) data = rows.slice(1); else c = { id: 0, bank: 1, acc: 2, name: 3 };
      if (c.id == null && c.emp == null) { $('imOut').innerHTML = '<div class="bp-warn">រកមិនឃើញជួរ "អត្តលេខ"</div>'; return; }
      const emps = curRows.map(r => r.e);
      plan = data.map(r => {
        const key = (r[c.id != null ? c.id : c.emp] || '').trim().toLowerCase();
        const e = emps.find(x => (x.username || '').toLowerCase() === key) || emps.find(x => (x.name || '').toLowerCase() === key);
        const bank = normBank(r[c.bank]), acc = cleanAcc(r[c.acc]), nm = cleanTxt(r[c.name]).toUpperCase();
        let st = 'ok', msg = '';
        if (!e) { st = 'bad'; msg = 'រកមិនឃើញបុគ្គលិក'; }
        else if (isPaid(e.id, 'advance') || isPaid(e.id, 'final')) { st = 'skip'; msg = 'បានបើកប្រាក់រួច — រំលង'; }
        else if (!(bank && acc && nm)) { st = 'bad'; msg = 'ព័ត៌មានមិនគ្រប់'; }
        return { e, bank, acc, nm, st, msg, key };
      });
      const ok = plan.filter(p => p.st === 'ok');
      $('imOut').innerHTML = `<div class="bp-sub"><b>${ok.length}</b> អាចនាំចូលបាន · ${plan.length - ok.length} រំលង/មានបញ្ហា <button id="imApply" ${ok.length ? '' : 'disabled'}>✓ ដាក់ចូលតារាង (${ok.length})</button></div>
        <div class="table-wrap" style="max-height:34vh;overflow:auto"><table class="bp-tbl"><thead><tr><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th>លទ្ធផល</th></tr></thead><tbody>${plan.map(p =>
          `<tr><td>${esc(p.e ? p.e.username || '' : p.key)}</td><td>${esc(p.e ? p.e.name || '' : '-')}</td><td>${esc(p.bank)}</td><td>${esc(p.acc)}</td><td>${esc(p.nm)}</td><td class="${p.st === 'ok' ? 'bp-st-ok' : (p.st === 'skip' ? 'bp-st-warn' : 'bp-st-bad')}">${p.st === 'ok' ? '✓ ត្រឹមត្រូវ' : esc(p.msg)}</td></tr>`).join('')}</tbody></table></div>`;
      const ap = $('imApply');
      if (ap) ap.addEventListener('click', () => {
        let n = 0;
        plan.filter(p => p.st === 'ok').forEach(p => {
          const tr = [...overlay.querySelectorAll('#bpBody tr[data-id]')].find(t => t.dataset.id === p.e.id); if (!tr) return; // (ឈ្មោះ CSS ត្រូវបានប្រើជាអថេរអត្ថបទខាងលើ → មិនប្រើ CSS.escape)
          tr.querySelector('.bp-bank').value = p.bank; tr.querySelector('.bp-acc').value = p.acc; tr.querySelector('.bp-name').value = p.nm; n++;
        });
        refreshWarns(); closePanel();
        customAlert(`បានដាក់ ${n} គណនីចូលតារាង។ សូមពិនិត្យ រួចចុច "💾 រក្សាទុកគណនីធនាគារ" ដើម្បីរក្សាពិតប្រាកដ។`);
      });
    });
  }

  // ---- ③ លេខយោង + Slip ----
  async function onRowAction(ev) {
    const btn = ev.target.closest('button[data-bpact]'); if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    if (btn.dataset.bpact === 'txn') await setTxn(id, curRound);
    else if (btn.dataset.bpact === 'slip') printSlip(id, curRound);
  }
  async function setTxn(empId, round, value) {
    const rec = bankPaid[pkey(curMonth, empId, round)];
    if (!rec) { await customAlert('ការបើកប្រាក់នេះមិនទាន់ត្រូវបានកត់ថា "បានបើក"'); return false; }
    let v = value;
    if (v === undefined) {
      v = await customPrompt(`លេខយោងប្រតិបត្តិការពីធនាគារ (${nameOf(empId)} · ${ROUND_SHORT[round]})៖\nទុកទទេ = លុបលេខយោង`);
      if (v === null) return false;
    }
    const txn = cleanTxt(v).slice(0, 60);
    const { error, cancelled } = await bankRpc('bank_set_txn', { p_month: curMonth, p_kind: round, p_emp: empId, p_txn: txn });
    if (cancelled) return false;
    if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return false; }
    rec.txn_ref = txn;
    audit('bank_txn_ref', empId, { month: curMonth, new: { round, txn_ref: txn } });
    if (value === undefined) render();
    return true;
  }
  function openPrint(title, bodyHtml) {
    const w = window.open('', '_blank');
    if (!w) { customAlert('Browser បានទប់ស្កាត់ផ្ទាំងថ្មី (pop-up) — សូមអនុញ្ញាត pop-up សម្រាប់គេហទំព័រនេះ រួចព្យាយាមម្តងទៀត'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:'Noto Sans Khmer','Khmer OS',system-ui,sans-serif;margin:28px;color:#111}
      h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;color:#555;margin:0 0 16px;font-weight:500}
      table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:7px 10px;font-size:13px;text-align:left}th{background:#f3f4f6;width:34%}
      .r{text-align:right}.amt{font-size:18px;font-weight:700}.foot{margin-top:28px;font-size:11px;color:#666}
      .sig{display:flex;gap:40px;margin-top:46px}.sig div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;text-align:center}
      @media print{body{margin:12mm}}</style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }
  function printSlip(empId, round) {
    const p = bankPaid[pkey(curMonth, empId, round)];
    if (!p) { customAlert('ព្រឹត្តិប័ត្របានតែក្រោយកត់ថា "បានបើក"'); return; }
    const e = empOf(empId) || {};
    const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
    openPrint('Payment Slip ' + (e.username || ''), `
      <h1>ព្រឹត្តិប័ត្របើកប្រាក់ខែតាមធនាគារ · Salary Payment Slip</h1>
      <h2>${esc(ROUND_LABEL[round])} · ខែ ${esc(curMonth)}</h2>
      <table>
        ${row('អត្តលេខ / Employee ID', esc(e.username || ''))}
        ${row('ឈ្មោះ / Name', esc(e.name || nameOf(empId)))}
        ${row('ធនាគារ / Bank', esc(p.bank_name || ''))}
        ${row('លេខគណនី / Account', esc(maskAccount(p.account_no)))}
        ${row('ឈ្មោះគណនី / Account name', esc(p.account_name || ''))}
        ${row('ចំនួន / Amount (USD)', `<span class="amt">$${money(p.amount_usd)}</span>`)}
        ${row('ថ្ងៃបើក / Paid at', esc(fmtDT(p.paid_at)))}
        ${row('លេខយោង / Reference', esc(p.txn_ref || p.reference || '-'))}
      </table>
      <div class="sig"><div>អ្នកទទួល / Received by</div><div>អ្នកអនុម័ត / Approved by</div></div>
      <div class="foot">លេខគណនីបង្ហាញតែ ៤ ខ្ទង់ចុងក្រោយ · បោះពុម្ពនៅ ${esc(fmtDT(new Date().toISOString()))}</div>`);
    audit('bank_slip_print', empId, { month: curMonth, new: { round } });
  }

  // ---- ④ ផ្ទៀងផ្ទាត់ Statement ----
  function showReconcile() {
    if (!curRows.length) { customAlert('សូមផ្ទុកទិន្នន័យខែនេះជាមុន (បញ្ចូលពាក្យសម្ងាត់ Admin)'); return; }
    const body = openPanel(`🧾 ផ្ទៀងផ្ទាត់ Statement — ${esc(ROUND_SHORT[curRound])} ${esc(curMonth)}`, `
      <p class="bp-note">បិទភ្ជាប់ ឬជ្រើសឯកសារ .csv ពី statement ធនាគារ។ ត្រូវការជួរ <b>លេខគណនី</b> និង <b>ចំនួន (Amount)</b>; ជួរ <b>លេខយោង (Reference)</b> ជាជម្រើស។ ប្រព័ន្ធផ្គូផ្គងតាមលេខគណនី + ចំនួនទឹកប្រាក់នៃដងដែលកំពុងជ្រើស។</p>
      <textarea class="bp-ta" id="rcTxt" placeholder="Account Number,Amount,Reference&#10;04421651,281.06,FT26277XXXX"></textarea>
      <div class="bp-bar"><input type="file" id="rcFile" accept=".csv,.txt,.tsv"><button id="rcRun">🔍 ផ្ទៀងផ្ទាត់</button></div>
      <div id="rcOut"></div>`);
    const $ = id => body.querySelector('#' + id);
    $('rcFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFileText(f, t => { $('rcTxt').value = t; $('rcRun').click(); }); });
    $('rcRun').addEventListener('click', () => {
      const rows = parseDelimited($('rcTxt').value);
      if (rows.length < 2) { $('rcOut').innerHTML = '<div class="bp-warn">ត្រូវការយ៉ាងហោចណាស់ ក្បាលតារាង ១ ជួរ និងទិន្នន័យ ១ ជួរ</div>'; return; }
      const c = findCols(rows[0]);
      if (c.acc == null || c.amt == null) { $('rcOut').innerHTML = '<div class="bp-warn">រកមិនឃើញជួរ "Account Number" ឬ "Amount" ក្នុងក្បាលតារាង</div>'; return; }
      const st = rows.slice(1).map(r => ({ acc: accDigits(r[c.acc]), amt: amtNum(r[c.amt]), ref: c.ref != null ? (r[c.ref] || '').trim() : '', used: false })).filter(x => x.acc && isFinite(x.amt));
      const exp = curRows.filter(r => amountOf(r) > 0).map(r => {
        const paid = bankPaid[pkey(curMonth, r.e.id, curRound)], inf = bankInfo[r.e.id] || {};
        return { row: r, e: r.e, amt: amountOf(r), acc: accDigits(paid ? paid.account_no : inf.account_no), paid };
      });
      const res = exp.map(x => {
        const same = st.filter(s => !s.used && x.acc && s.acc === x.acc);
        const exact = same.find(s => Math.abs(Math.abs(s.amt) - x.amt) < 0.005);
        if (exact) { exact.used = true; return { ...x, status: 'ok', hit: exact }; }
        if (same.length) { same[0].used = true; return { ...x, status: 'diff', hit: same[0] }; }
        return { ...x, status: x.acc ? 'miss' : 'noacc' };
      });
      const unknown = st.filter(s => !s.used);
      const cnt = k => res.filter(r => r.status === k).length;
      const LBL = { ok: '✓ ត្រូវគ្នា', diff: '⚠ ចំនួនខុស', miss: '✗ មិនឃើញក្នុង statement', noacc: 'ខ្វះគណនី' };
      const CLS = { ok: 'bp-st-ok', diff: 'bp-st-warn', miss: 'bp-st-bad', noacc: 'bp-st-bad' };
      const need = res.filter(r => r.status === 'ok' && r.paid && r.hit.ref && !r.paid.txn_ref);
      $('rcOut').innerHTML = `<div class="bp-sub"><b class="bp-st-ok">ត្រូវគ្នា ${cnt('ok')}</b> · <b class="bp-st-warn">ចំនួនខុស ${cnt('diff')}</b> · <b class="bp-st-bad">មិនឃើញ ${cnt('miss') + cnt('noacc')}</b> · ក្នុង statement តែមិនមានក្នុងបញ្ជី ${unknown.length}
        ${need.length ? `<button id="rcRef">🔖 កត់លេខយោង ${need.length} ពី statement</button>` : ''}</div>
        <div class="table-wrap" style="max-height:38vh;overflow:auto"><table class="bp-tbl"><thead><tr><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>លេខគណនី</th><th style="text-align:right">ត្រូវបើក ($)</th><th style="text-align:right">Statement ($)</th><th>លេខយោង</th><th>លទ្ធផល</th></tr></thead><tbody>${res.map(r =>
          `<tr><td>${esc(r.e.username || '')}</td><td>${esc(r.e.name || '')}</td><td>${esc(maskAccount(r.acc))}</td><td style="text-align:right">${money(r.amt)}</td><td style="text-align:right">${r.hit ? money(Math.abs(r.hit.amt)) : '-'}</td><td>${esc(r.hit && r.hit.ref || '')}</td><td class="${CLS[r.status]}">${LBL[r.status]}${r.paid ? '' : ' <small class="bp-no">(មិនទាន់កត់បានបើក)</small>'}</td></tr>`).join('')}
        ${unknown.map(s => `<tr><td colspan="2" class="bp-no">មិនមានក្នុងបញ្ជី</td><td>${esc(maskAccount(s.acc))}</td><td></td><td style="text-align:right">${money(Math.abs(s.amt))}</td><td>${esc(s.ref)}</td><td class="bp-st-warn">ក្រៅបញ្ជី</td></tr>`).join('')}</tbody></table></div>`;
      const rb = $('rcRef');
      if (rb) rb.addEventListener('click', async () => {
        if (!(await customConfirm(`កត់លេខយោងពី statement សម្រាប់ ${need.length} នាក់?`))) return;
        rb.disabled = true; let ok = 0;
        for (const r of need) { if (await setTxn(r.e.id, curRound, r.hit.ref)) ok++; else break; }
        render();
        await customAlert(`បានកត់លេខយោង ${ok}/${need.length}`);
        showReconcile();
      });
    });
  }

  // ---- ⑤ សង្ខេបតាមធនាគារ ----
  function bankGroups() {
    const g = {};
    curRows.forEach(r => {
      const net = amountOf(r); if (net <= 0) return;
      const paid = bankPaid[pkey(curMonth, r.e.id, curRound)], inf = bankInfo[r.e.id] || {};
      const b = (paid ? paid.bank_name : inf.bank_name) || '(មិនទាន់មានគណនី)';
      const x = (g[b] = g[b] || { n: 0, total: 0, np: 0, paid: 0 });
      x.n++; x.total += net; if (paid) { x.np++; x.paid += net; }
    });
    return Object.keys(g).sort((a, b) => g[b].total - g[a].total).map(k => ({ bank: k, ...g[k] }));
  }
  function showBankSummary() {
    if (!curRows.length) { customAlert('សូមផ្ទុកទិន្នន័យខែនេះជាមុន (បញ្ចូលពាក្យសម្ងាត់ Admin)'); return; }
    const list = bankGroups();
    const T = list.reduce((s, x) => ({ n: s.n + x.n, total: s.total + x.total, np: s.np + x.np, paid: s.paid + x.paid }), { n: 0, total: 0, np: 0, paid: 0 });
    const body = openPanel(`📈 សង្ខេបតាមធនាគារ — ${esc(ROUND_SHORT[curRound])} ${esc(curMonth)}`, list.length ? `
      <div class="bp-bar"><button class="secondary" id="bsX">📊 Export Excel</button><button class="secondary" id="bsP">🖨 បោះពុម្ព / PDF</button></div>
      <div class="table-wrap"><table class="bp-tbl"><thead><tr><th>ធនាគារ</th><th style="text-align:right">នាក់</th><th style="text-align:right">សរុប ($)</th><th style="text-align:right">បានបើក ($)</th><th style="text-align:right">នៅសល់ ($)</th><th>វឌ្ឍនភាព</th></tr></thead><tbody>${list.map(x => {
        const pct = x.total ? Math.round(x.paid / x.total * 100) : 0;
        return `<tr><td>${esc(x.bank)}</td><td style="text-align:right">${x.np}/${x.n}</td><td style="text-align:right">${money(x.total)}</td><td style="text-align:right">${money(x.paid)}</td><td style="text-align:right">${money(x.total - x.paid)}</td><td><div class="bp-bar-bg"><div class="bp-bar-fg" style="width:${pct}%"></div></div><small>${pct}%</small></td></tr>`; }).join('')}</tbody>
        <tfoot><tr style="font-weight:700"><td>សរុប</td><td style="text-align:right">${T.np}/${T.n}</td><td style="text-align:right">${money(T.total)}</td><td style="text-align:right">${money(T.paid)}</td><td style="text-align:right">${money(T.total - T.paid)}</td><td></td></tr></tfoot></table></div>`
      : '<div class="bp-note">គ្មានទឹកប្រាក់ត្រូវបើកក្នុងដងនេះ</div>');
    if (!list.length) return;
    body.querySelector('#bsX').addEventListener('click', () => {
      downloadXlsx(`bank_summary_${curMonth}_${curRound}.xlsx`, [{
        name: 'Bank Summary',
        columns: [{ header: 'Bank', width: 30, fmt: 'text' }, { header: 'Employees', width: 11, fmt: 'int' }, { header: 'Paid (count)', width: 12, fmt: 'int' },
          { header: 'Total (USD)', width: 14, fmt: 'usd' }, { header: 'Paid (USD)', width: 14, fmt: 'usd' }, { header: 'Remaining (USD)', width: 16, fmt: 'usd' }],
        rows: list.map(x => [x.bank, x.n, x.np, r2(x.total), r2(x.paid), r2(x.total - x.paid)]),
        totals: { label: 'សរុប', labelCol: 0, sumCols: [1, 2, 3, 4, 5] },
      }]);
    });
    body.querySelector('#bsP').addEventListener('click', () => {
      openPrint('Bank Summary ' + curMonth, `<h1>សង្ខេបបើកប្រាក់ខែតាមធនាគារ · Bank Payment Summary</h1><h2>${esc(ROUND_LABEL[curRound])} · ខែ ${esc(curMonth)}</h2>
        <table><thead><tr><th style="width:auto">ធនាគារ</th><th class="r">នាក់ (បានបើក/សរុប)</th><th class="r">សរុប ($)</th><th class="r">បានបើក ($)</th><th class="r">នៅសល់ ($)</th></tr></thead><tbody>${list.map(x =>
          `<tr><td>${esc(x.bank)}</td><td class="r">${x.np}/${x.n}</td><td class="r">${money(x.total)}</td><td class="r">${money(x.paid)}</td><td class="r">${money(x.total - x.paid)}</td></tr>`).join('')}
          <tr><td><b>សរុប</b></td><td class="r"><b>${T.np}/${T.n}</b></td><td class="r"><b>${money(T.total)}</b></td><td class="r"><b>${money(T.paid)}</b></td><td class="r"><b>${money(T.total - T.paid)}</b></td></tr></tbody></table>
        <div class="foot">បោះពុម្ពនៅ ${esc(fmtDT(new Date().toISOString()))}</div>`);
    });
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
