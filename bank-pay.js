/* ==========================================================================
   bank-pay.js — បើកប្រាក់ខែតាមប្រព័ន្ធធនាគារ (Admin)
   ① រក្សាទុកគណនីធនាគាររបស់បុគ្គលិក  ② Export បញ្ជីផ្ទេរប្រាក់ (Excel / CSV)
   ③ សម្គាល់ថា "បានបើកតាមធនាគារ" ក្នុងខែដែលបានបិទ

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
  let bankPaid = {};      // 'YYYY-MM|empId' -> row
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
    if (error && /unauthorized/i.test(error.message)) { adminPw = null; return { error: { message: 'ពាក្យសម្ងាត់ Admin មិនត្រឹមត្រូវ' } }; }
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
    ((data && data.paid) || []).forEach(r => { bankPaid[r.month + '|' + r.employee_id] = r; });
    return true;
  }

  const isPaid = (empId) => !!bankPaid[curMonth + '|' + empId];
  const hasBank = (empId) => { const i = bankInfo[empId]; return !!(i && i.bank_name && i.account_no && i.account_name); };

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
.bp-sum{font-size:.82rem;font-weight:600;margin-left:auto;flex:1 0 100%;text-align:right}
.bp-mon{margin-left:auto;display:inline-flex;gap:6px;align-items:center}
.bp-mon input{font-size:.8rem;padding:6px 8px}
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
          <span class="bp-mon"><button class="secondary" id="bpPrev" title="ខែមុន">◀</button><input type="month" id="bpMonthInput" title="ជ្រើសខែ"><button class="secondary" id="bpNext" title="ខែក្រោយ">▶</button></span>
          <span class="bp-sum" id="bpSum"></span>
        </div>
        <div class="table-wrap" style="max-height:56vh;overflow:auto;">
          <table class="bp-tbl">
            <thead><tr><th><input type="checkbox" id="bpAll" title="ជ្រើសទាំងអស់"></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ធនាគារ</th><th>លេខគណនី</th><th>ឈ្មោះគណនី</th><th style="text-align:right">ចំនួន ($)</th><th>ស្ថានភាព</th></tr></thead>
            <tbody id="bpBody"></tbody>
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
    $('bpMonthInput').addEventListener('change', e => switchMonth(e.target.value));
    $('bpPrev').addEventListener('click', () => switchMonth(shiftMonth(curMonth, -1)));
    $('bpNext').addEventListener('click', () => switchMonth(shiftMonth(curMonth, 1)));
    $('bpAll').addEventListener('change', e => overlay.querySelectorAll('.bp-chk:not(:disabled)').forEach(c => { c.checked = e.target.checked; }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
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
    overlay.querySelector('#bpStatus').innerHTML = '';
    overlay.querySelector('#bpSum').textContent = '';
    overlay.querySelector('#bpBody').innerHTML = '<tr><td colspan="8" style="padding:16px;">កំពុងផ្ទុក...</td></tr>';
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
    overlay.querySelector('#bpStatus').innerHTML = locked ? '' :
      `<div class="bp-warn">🔓 ខែ ${esc(curMonth)} មិនទាន់បិទ — លេខអាចផ្លាស់ប្តូរ។ ត្រូវ "🔒 បិទខែ" ជាមុន ទើបអាចសម្គាល់ថា "បានបើក" បាន (Export ពិនិត្យមើលបាន)។</div>`;
    overlay.querySelector('#bpPaidBtn').disabled = !locked;
    overlay.querySelector('#bpBody').innerHTML = curRows.length ? curRows.map(({ e, t }, i) => {
      const inf = bankInfo[e.id] || {};
      const paid = bankPaid[curMonth + '|' + e.id];
      const net = r2(t.net);
      return `<tr data-id="${esc(e.id)}">
        <td><input type="checkbox" class="bp-chk" ${net <= 0 ? 'disabled' : ''}></td>
        <td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td>
        <td><input type="text" class="bp-bank" list="bpBanks" value="${esc(inf.bank_name || '')}" placeholder="ABA Bank" ${paid ? 'disabled' : ''}></td>
        <td><input type="text" class="bp-acc" inputmode="numeric" value="${esc(inf.account_no || '')}" placeholder="000 123 456" ${paid ? 'disabled' : ''}></td>
        <td><input type="text" class="bp-name" value="${esc(inf.account_name || '')}" placeholder="SOK SOPHEA" ${paid ? 'disabled' : ''}></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${money(net)}</td>
        <td>${paid ? `<span class="bp-ok">✓ បានបើក</span><div class="bp-no" style="font-size:.68rem">${esc(String(paid.paid_at || '').slice(0, 16).replace('T', ' '))}</div>`
          : (net <= 0 ? '<span class="bp-no">គ្មានទឹកប្រាក់</span>' : (hasBank(e.id) ? '<span class="bp-no">មិនទាន់បើក</span>' : '<span style="color:#b45309">ខ្វះព័ត៌មានធនាគារ</span>'))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" style="padding:16px;">មិនមានបុគ្គលិកក្នុងខែនេះ</td></tr>';
    updateSum();
  }

  function updateSum() {
    const total = curRows.reduce((s, { t }) => s + Math.max(0, r2(t.net)), 0);
    const paid = curRows.reduce((s, { e, t }) => s + (isPaid(e.id) ? Math.max(0, r2(t.net)) : 0), 0);
    overlay.querySelector('#bpSum').textContent = `សរុប $${money(total)} · បានបើក $${money(paid)} · នៅសល់ $${money(total - paid)}`;
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
    curRows.forEach(({ e, t }) => {
      const net = r2(t.net);
      const inf = inputs[e.id] || bankInfo[e.id] || {};
      if (net <= 0) return;
      if (isPaid(e.id)) { skipped.push(`${e.name} (បានបើករួច)`); return; }
      if (!(inf.bank_name && inf.account_no && inf.account_name)) { skipped.push(`${e.name} (ខ្វះព័ត៌មានធនាគារ)`); return; }
      list.push({ e, net, inf });
    });
    if (!list.length) { await customAlert('គ្មានបុគ្គលិកដែលអាច Export បានទេ' + (skipped.length ? '\n\nរំលង៖\n' + skipped.join('\n') : '')); return; }
    if (skipped.length && !(await customConfirm(`នឹង Export ${list.length} នាក់ ហើយរំលង ${skipped.length} នាក់៖\n${skipped.slice(0, 10).join('\n')}${skipped.length > 10 ? '\n…' : ''}\n\nបន្ត?`))) return;

    const ref = 'Salary ' + curMonth;
    const total = list.reduce((s, x) => s + x.net, 0);
    if (kind === 'xlsx') {
      downloadXlsx(`bank_transfer_${curMonth}.xlsx`, [{
        name: 'Bank Transfer ' + curMonth,
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
      pcDownloadText(`bank_transfer_${curMonth}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    }
    if (typeof logAudit === 'function') logAudit('bank_export', { entity: 'bank_payments', ref: curMonth, month: curMonth, new: { count: list.length, total_usd: r2(total), format: kind } });
    await customAlert(`បាន Export ${list.length} នាក់ · សរុប $${money(total)}\nសូមពិនិត្យលេខគណនីឱ្យត្រឹមត្រូវ មុន upload ទៅធនាគារ។`);
  }

  // ---------------------------------------------------------------- mark paid ----
  async function markSelected(paid) {
    if (paid && !isMonthLocked(curMonth)) { await customAlert(`ត្រូវ "🔒 បិទខែ" ${curMonth} ជាមុន ទើបអាចសម្គាល់ថាបានបើក (ដើម្បីឱ្យទឹកប្រាក់ថេរ)`); return; }
    const ids = [...overlay.querySelectorAll('#bpBody tr[data-id]')].filter(tr => tr.querySelector('.bp-chk').checked).map(tr => tr.dataset.id);
    if (!ids.length) { await customAlert('សូមជ្រើសរើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    const inputs = {}; readRowInputs().forEach(r => { inputs[r.employee_id] = r; });

    if (paid) {
      const todo = [], bad = [];
      ids.forEach(id => {
        const row = curRows.find(x => x.e.id === id); if (!row) return;
        if (isPaid(id)) return;
        const inf = inputs[id] || bankInfo[id] || {}, net = r2(row.t.net);
        if (net <= 0 || !(inf.bank_name && inf.account_no && inf.account_name)) { bad.push(row.e.name); return; }
        todo.push({ month: curMonth, employee_id: id, amount_usd: net, bank_name: inf.bank_name, account_no: inf.account_no, account_name: inf.account_name,
          status: 'paid', reference: 'Salary ' + curMonth, paid_at: new Date().toISOString() });
      });
      if (!todo.length) { await customAlert('គ្មានជួរដែលអាចសម្គាល់បានទេ' + (bad.length ? '\nខ្វះព័ត៌មាន/ទឹកប្រាក់៖ ' + bad.join(', ') : '')); return; }
      const total = todo.reduce((s, x) => s + x.amount_usd, 0);
      if (!(await customConfirm(`សម្គាល់ថា "បានបើកតាមធនាគារ" ${todo.length} នាក់ · សរុប $${money(total)}?\n(សូមប្រាកដថាបានផ្ទេរលុយរួចហើយ)${bad.length ? '\n\nរំលង៖ ' + bad.join(', ') : ''}`))) return;
      const { error, cancelled } = await bankRpc('bank_mark_paid', { p_month: curMonth, p_rows: todo.map(({ employee_id, amount_usd, bank_name, account_no, account_name, reference }) => ({ employee_id, amount_usd, bank_name, account_no, account_name, reference })) });
      if (cancelled) return;
      if (error) { await customAlert('រក្សាទុកមិនបានជោគជ័យ៖ ' + error.message); return; }
      todo.forEach(x => {
        bankPaid[x.month + '|' + x.employee_id] = x; bankInfo[x.employee_id] = x;
        if (typeof logAudit === 'function') logAudit('bank_paid', { entity: 'bank_payment', ref: x.month + '|' + x.employee_id, month: x.month, employeeId: x.employee_id, new: { amount_usd: x.amount_usd, bank: x.bank_name, account_no: maskAcc(x.account_no) } });
      });
    } else {
      const del = ids.filter(isPaid);
      if (!del.length) { await customAlert('ជួរដែលបានជ្រើសមិនទាន់ត្រូវបានសម្គាល់ថាបានបើកទេ'); return; }
      if (!(await customConfirm(`ដកការសម្គាល់ "បានបើក" ${del.length} នាក់?`))) return;
      const { error, cancelled } = await bankRpc('bank_unmark_paid', { p_month: curMonth, p_ids: del });
      if (cancelled) return;
      if (error) { await customAlert('លុបមិនបានជោគជ័យ៖ ' + error.message); return; }
      del.forEach(id => {
        const old = bankPaid[curMonth + '|' + id]; delete bankPaid[curMonth + '|' + id];
        if (typeof logAudit === 'function') logAudit('bank_unpaid', { entity: 'bank_payment', ref: curMonth + '|' + id, month: curMonth, employeeId: id, old: old ? { amount_usd: old.amount_usd } : null, new: null });
      });
    }
    render();
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
