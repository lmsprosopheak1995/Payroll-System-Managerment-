/* ==========================================================================
   fdc-pay.js — ប្រាក់ទូទាត់ចុងកិច្ចសន្យា FDC (យ៉ាងតិច 5% នៃប្រាក់ឈ្នួលសរុបក្នុងអំឡុងកិច្ចសន្យា)
   ដាក់ក្រោម script.js និង scan-extras.js ក្នុង index.html៖  <script src="fdc-pay.js"></script>
   ត្រូវការ SQL៖ fdc-contracts.sql
   មូលដ្ឋានគណនា (តាមការជ្រើសរបស់អ្នក)៖ ប្រាក់សរុបរាល់ខែ = ប្រាក់ឈ្នួលធម្មតា + OT + ប្រាក់បាយ (total ក្នុង summarizeEmpMonth)
     · ជម្រើស "រួមអត្ថប្រយោជន៍" បូកថែមប្រាក់អត្ថប្រយោជន៍ (benefit) ក្នុងខែ
   ខែដែលបិទប្រាក់ខែរួច ប្រើលេខ snapshot · ខែដែលកិច្ចសន្យាចាប់ផ្តើម/បញ្ចប់កណ្តាលខែ គិតតាមថ្ងៃក្នុងកិច្ចសន្យា
   ⚠ ការគណនានេះជាជំនួយ មិនមែនយោបល់ផ្លូវច្បាប់ — ផ្ទៀងផ្ទាត់ជាមួយមន្ត្រីការងារ/អ្នកប្រឹក្សាច្បាប់មុនទូទាត់ពិត។
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const money = n => '$' + (Math.round((n || 0) * 100) / 100).toFixed(2);
  const rielOf = usd => ((settings && settings.exchangeRate) ? Math.round((usd || 0) * settings.exchangeRate / 100) * 100 : 0);
  const rielText = usd => rielOf(usd) ? rielOf(usd).toLocaleString('en-US') + ' ៛' : '';
  const today = () => (typeof todayStr === 'function' ? todayStr() : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));

  let contracts = [], missing = false, inclBenefits = false;

  const nextMonth = m => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo, 1)); return d.toISOString().slice(0, 7); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const addMonths = (iso, n) => {   // បូកខែ (កាត់ថ្ងៃឱ្យស្ថិតក្នុងខែគោលដៅ ឧ. 31 មករា + 1 ខែ = 28/29 កុម្ភៈ)
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(d, last));
    return t.toISOString().slice(0, 10);
  };
  const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

  // ---------- គណនា ----------
  function calcContract(c) {
    const emp = employees.find(e => e.id === c.employee_id);
    if (!emp) return { error: 'រកមិនឃើញបុគ្គលិក', lines: [], base: 0, amount: 0 };
    const to = c.end_date < today() ? c.end_date : today();   // កិច្ចសន្យាមិនទាន់ផុត → គិតត្រឹមថ្ងៃនេះ
    if (to < c.start_date) return { lines: [], base: 0, amount: 0, approx: false, upto: to };
    const lines = [];
    let approx = false;
    let m = c.start_date.slice(0, 7);
    const lastM = to.slice(0, 7);
    while (m <= lastM) {
      const days = daysInMonth(m);
      const first = days[0], last = days[days.length - 1];
      const from = c.start_date > first ? c.start_date : first;
      const upto = to < last ? to : last;
      const full = from === first && upto === last;
      const locked = typeof getLockedSnapshot === 'function' && !!getLockedSnapshot(emp.id, m);
      let usd = 0, ben = 0, note = '';
      if (full || locked) {
        const t = summarizeEmpMonth(emp, m);
        usd = t.total || 0; ben = t.benefitsUSD || 0;
        if (!full) {   // ខែបិទរួច តែកិច្ចសន្យាគ្របលើតែផ្នែកខែ → សមាមាត្រតាមថ្ងៃ
          const share = (diffDays(from, upto) + 1) / days.length;
          usd *= share; ben *= share; approx = true; note = 'ប្រហែល (ខែបិទរួច · សមាមាត្រតាមថ្ងៃ)';
        } else if (locked) { note = 'ខែបិទរួច'; }
      } else {
        days.filter(d => d >= from && d <= upto).forEach(d => {
          const rec = (attendance[d] && attendance[d][emp.id]) || {};
          usd += computeRow(emp, rec, d).total || 0;
        });
        if (inclBenefits) {   // អត្ថប្រយោជន៍ខែ → សមាមាត្រតាមថ្ងៃក្នុងកិច្ចសន្យា
          const t = summarizeEmpMonth(emp, m);
          ben = (t.benefitsUSD || 0) * (diffDays(from, upto) + 1) / days.length;
        }
        note = 'គិតតាមថ្ងៃ';
      }
      lines.push({ month: m, from, to: upto, usd, ben, note });
      m = nextMonth(m);
    }
    const base = lines.reduce((s, l) => s + l.usd + (inclBenefits ? l.ben : 0), 0);
    const rate = Number(c.rate) || 5;
    return { lines, base, amount: base * rate / 100, approx, upto: to };
  }

  function statusOf(c) {
    if (c.paid_at) return { key: 'paid', label: 'បានទូទាត់ ' + c.paid_at, tone: '#16a34a' };
    const t = today();
    if (t > c.end_date) return { key: 'due', label: 'ផុតកំណត់ — រង់ចាំទូទាត់', tone: '#dc2626' };
    const left = diffDays(t, c.end_date);
    if (left <= 30) return { key: 'soon', label: `ជិតផុត (នៅ ${left} ថ្ងៃ)`, tone: '#f97316' };
    return { key: 'active', label: 'កំពុងដំណើរការ', tone: '#0ea5e9' };
  }

  // ---------- UI ----------
  function empOptions() {
    const emps = (typeof activeEmployeesList === 'function' ? activeEmployeesList() : employees) || [];
    return emps.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.username || e.id)})</option>`).join('');
  }
  function fillEmpOptions() {
    const sel = $('fdcEmp');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = empOptions();
    if (keep) sel.value = keep;
  }

  function ensureRoot() {
    const tab = $('fdcTab');
    if (!tab || $('fdcList')) return;
    const opts = empOptions();
    tab.insertAdjacentHTML('beforeend', `
      <div class="portal-card" style="padding:14px;margin-bottom:14px;">
        <h3 style="margin:0 0 6px;font-size:0.95rem;">💼 ប្រាក់ទូទាត់ចុងកិច្ចសន្យា FDC</h3>
        <p class="scan-hint" style="margin:0 0 10px;">ច្បាប់ការងារកម្ពុជា៖ បុគ្គលិកកិច្ចសន្យាកំណត់រយៈពេល (FDC) ទទួលប្រាក់ទូទាត់ចុងកិច្ចសន្យា <b>យ៉ាងតិច ៥%</b> នៃប្រាក់ឈ្នួលសរុបដែលបានបើកក្នុងអំឡុងកិច្ចសន្យា។ មូលដ្ឋានគណនា៖ ប្រាក់សរុប (រួម OT និងបាយ)។ ការគណនានេះជាជំនួយ — សូមផ្ទៀងផ្ទាត់ជាមួយមន្ត្រីការងារមុនទូទាត់។</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">បុគ្គលិក</label><select id="fdcEmp" style="min-width:200px;">${opts}</select></div>
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">រយៈពេលកិច្ចសន្យា</label><select id="fdcDur" onchange="fdcPay.applyDur()"><option value="">កំណត់ថ្ងៃខ្លួនឯង</option><option value="2">២ ខែ</option><option value="3">៣ ខែ</option><option value="6">៦ ខែ</option></select></div>
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">ចាប់ផ្តើម</label><input type="date" id="fdcStart" onchange="fdcPay.applyDur()"></div>
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">ផុតកំណត់</label><input type="date" id="fdcEnd" oninput="document.getElementById('fdcDur').value=''"></div>
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">អត្រា (%) ≥ ៥</label><input type="number" id="fdcRate" value="5" min="5" step="0.5" style="width:80px;"></div>
          <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">កំណត់ចំណាំ</label><input type="text" id="fdcNote" placeholder="ឧ. កិច្ចសន្យាលើកទី ២" style="min-width:160px;"></div>
          <button type="button" onclick="fdcPay.add()">➕ បន្ថែមកិច្ចសន្យា</button>
        </div>
        <label style="display:inline-flex;gap:6px;align-items:center;margin-top:10px;font-size:0.8rem;">
          <input type="checkbox" id="fdcInclBen" onchange="fdcPay.toggleBen(this.checked)"> រួមប្រាក់អត្ថប្រយោជន៍ (benefit) ក្នុងមូលដ្ឋានគណនា
        </label>
      </div>
      <p class="scan-hint" id="fdcWarn" style="display:none;color:var(--danger,#dc2626);"></p>
      <div class="table-wrap"><table>
        <thead><tr><th>បុគ្គលិក</th><th>កិច្ចសន្យា</th><th>រយៈពេល</th><th>ស្ថានភាព</th><th>ប្រាក់ឈ្នួលសរុប</th><th>ប្រាក់ទូទាត់ (%)</th><th>សកម្មភាព</th></tr></thead>
        <tbody id="fdcList"></tbody></table></div>
      <div class="empty-state" id="fdcEmpty" style="display:none;">មិនទាន់មានកិច្ចសន្យា FDC</div>`);
  }

  async function load() {
    const { data, error } = await supabaseClient.from('employee_contracts').select('*').eq('contract_type', 'FDC').order('end_date', { ascending: true });
    missing = !!error;
    if (error) console.warn('employee_contracts:', error.message);
    contracts = data || [];
  }

  function render() {
    ensureRoot();
    const warn = $('fdcWarn'), list = $('fdcList'), empty = $('fdcEmpty');
    if (!list) return;
    if (warn) { warn.style.display = missing ? '' : 'none'; warn.textContent = missing ? '⚠ មិនទាន់មានតារាង employee_contracts — សូមរត់ fdc-contracts.sql ក្នុង Supabase ជាមុន។' : ''; }
    if (empty) empty.style.display = (!missing && !contracts.length) ? '' : 'none';
    list.innerHTML = contracts.map(c => {
      const st = statusOf(c);
      const emp = employees.find(e => e.id === c.employee_id);
      const name = emp ? emp.name : c.employee_id;
      let base, amount, extra = '';
      if (c.paid_at) { base = Number(c.paid_base) || 0; amount = Number(c.paid_amount) || 0; }
      else { const r = calcContract(c); base = r.base; amount = r.amount; if (r.approx) extra = ' <span title="មានខែបិទរួចដែលគិតសមាមាត្រ" style="color:#f97316;">≈</span>'; }
      const ongoing = !c.paid_at && today() <= c.end_date;
      const days = diffDays(c.start_date, c.end_date) + 1;
      return `<tr>
        <td>${esc(name)}</td>
        <td>${esc(c.start_date)} → ${esc(c.end_date)}${c.note ? `<div style="font-size:0.72rem;color:var(--text-muted);">${esc(c.note)}</div>` : ''}</td>
        <td>${days} ថ្ងៃ (~${(days / 30.4).toFixed(1)} ខែ)</td>
        <td style="color:${st.tone};font-weight:700;">● ${esc(st.label)}</td>
        <td>${money(base)}${extra}${ongoing ? '<div style="font-size:0.7rem;color:var(--text-muted);">គិតត្រឹមថ្ងៃនេះ</div>' : ''}</td>
        <td><b>${money(amount)}</b> <span style="color:var(--text-muted);">(${esc(c.rate)}%)</span>${rielText(amount) ? `<div style="font-size:0.72rem;color:var(--text-muted);">${rielText(amount)}</div>` : ''}</td>
        <td>${c.paid_at ? '' : `<button type="button" data-id="${esc(c.id)}" onclick="fdcPay.pay(this.dataset.id)">✓ ទូទាត់</button> `}
            <button type="button" class="secondary" data-id="${esc(c.id)}" onclick="fdcPay.print(this.dataset.id)">🖨 ប័ណ្ណ</button>
            <button type="button" class="danger" data-id="${esc(c.id)}" onclick="fdcPay.remove(this.dataset.id)">🗑</button></td>
      </tr>`;
    }).join('');
  }

  function applyDur() {
    const n = parseInt(($('fdcDur') || {}).value, 10), st = ($('fdcStart') || {}).value;
    if (!n || !st) return;
    $('fdcEnd').value = addDays(addMonths(st, n), -1);   // ឧ. 2026-01-01 + 3 ខែ → 2026-03-31
  }

  async function reload() { await load(); render(); }

  // ---------- សកម្មភាព ----------
  let adding = false;
  async function add() {
    if (adding) return;
    const v = id => ($(id).value || '').trim();
    const emp = v('fdcEmp'), start = v('fdcStart'), end = v('fdcEnd'), rate = parseFloat(v('fdcRate'));
    if (!emp) return customAlert('សូមជ្រើសបុគ្គលិក');
    if (!start || !end) return customAlert('សូមបំពេញថ្ងៃចាប់ផ្តើម និងថ្ងៃផុតកំណត់');
    if (end < start) return customAlert('ថ្ងៃផុតកំណត់ត្រូវនៅក្រោយថ្ងៃចាប់ផ្តើម');
    if (!(rate >= 5)) return customAlert('អត្រាទូទាត់ចុងកិច្ចសន្យាត្រូវយ៉ាងតិច ៥%');
    if (diffDays(start, end) + 1 > 731 && !confirm('កិច្ចសន្យា FDC យូរជាង ២ ឆ្នាំ (ច្បាប់កំណត់អតិបរមា ២ ឆ្នាំ) — បន្តទេ?')) return;
    if (contracts.some(c => c.employee_id === emp && !(end < c.start_date || start > c.end_date)) && !confirm('បុគ្គលិកនេះមានកិច្ចសន្យាត្រួតគ្នា — បន្តទេ?')) return;
    adding = true;
    let error;
    try {
      ({ error } = await supabaseClient.from('employee_contracts').insert({ employee_id: emp, contract_type: 'FDC', start_date: start, end_date: end, rate, note: v('fdcNote') || null }));
    } finally { adding = false; }
    if (error) return customAlert('រក្សាទុកមិនបានទេ៖ ' + error.message);
    ['fdcStart', 'fdcEnd', 'fdcNote', 'fdcDur'].forEach(id => { $(id).value = ''; });
    await reload();
  }

  async function pay(id) {
    const c = contracts.find(x => String(x.id) === String(id));
    if (!c) return;
    const r = calcContract(c);
    if (r.error) return customAlert(r.error);
    if (today() <= c.end_date && !confirm('កិច្ចសន្យានេះមិនទាន់ផុតកំណត់ទេ — ទូទាត់មុនកំណត់ឬ?')) return;
    if (!confirm(`ទូទាត់ប្រាក់ចុងកិច្ចសន្យា\nបុគ្គលិក៖ ${(employees.find(e => e.id === c.employee_id) || {}).name || c.employee_id}\nប្រាក់ឈ្នួលសរុប៖ ${money(r.base)}\nអត្រា ${c.rate}%\nប្រាក់ទូទាត់៖ ${money(r.amount)}\n\nបញ្ជាក់ការទូទាត់?`)) return;
    const note = window.prompt('កំណត់ចំណាំការទូទាត់ (មិនចាំបាច់)', '');
    if (note === null) return;
    const { error } = await supabaseClient.from('employee_contracts')
      .update({ paid_at: today(), paid_base: Math.round(r.base * 100) / 100, paid_amount: Math.round(r.amount * 100) / 100, paid_note: note.trim() || null }).eq('id', c.id);
    if (error) return customAlert('រក្សាទុកមិនបានទេ៖ ' + error.message);
    await reload();
  }

  async function remove(id) {
    const c = contracts.find(x => String(x.id) === String(id));
    if (!c) return;
    if (!confirm(c.paid_at ? 'កិច្ចសន្យានេះបានទូទាត់រួច — លុបកំណត់ត្រាទាំងអស់ឬ?' : 'លុបកិច្ចសន្យានេះ?')) return;
    const { error } = await supabaseClient.from('employee_contracts').delete().eq('id', c.id);
    if (error) return customAlert('លុបមិនបានទេ៖ ' + error.message);
    await reload();
  }

  function printVoucher(id) {
    const c = contracts.find(x => String(x.id) === String(id));
    if (!c) return;
    const emp = employees.find(e => e.id === c.employee_id) || { name: c.employee_id, id: c.employee_id };
    const r = calcContract(c);
    const paid = !!c.paid_at;
    const base = paid ? Number(c.paid_base) || 0 : r.base;
    const amount = paid ? Number(c.paid_amount) || 0 : r.amount;
    const rows = (r.lines || []).map(l => `<tr><td>${esc(l.month)}</td><td>${esc(l.from)} → ${esc(l.to)}</td><td style="text-align:right;">${money(l.usd + (inclBenefits ? l.ben : 0))}</td><td>${esc(l.note)}</td></tr>`).join('');
    const html = `<div class="page">
      <h2 style="text-align:center;margin:0 0 4px;">ប័ណ្ណទូទាត់ប្រាក់ចុងកិច្ចសន្យា (FDC)</h2>
      <p style="text-align:center;margin:0 0 14px;font-size:12px;">${paid ? 'ថ្ងៃទូទាត់៖ ' + esc(c.paid_at) : 'ប័ណ្ណគណនា (មិនទាន់ទូទាត់)'}</p>
      <p><b>ឈ្មោះ៖</b> ${esc(emp.name)} &nbsp; <b>អត្តលេខ៖</b> ${esc(emp.username || emp.id)} &nbsp; <b>ផ្នែក៖</b> ${esc(emp.dept || '')}</p>
      <p><b>កិច្ចសន្យា៖</b> ${esc(c.start_date)} → ${esc(c.end_date)} ${c.note ? '(' + esc(c.note) + ')' : ''}</p>
      <table border="1" cellspacing="0" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th>ខែ</th><th>ថ្ងៃគិត</th><th>ប្រាក់សរុប ($)</th><th>កំណត់ចំណាំ</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">-</td></tr>'}</tbody>
      </table>
      <p style="margin-top:12px;"><b>ប្រាក់ឈ្នួលសរុប៖</b> ${money(base)} &nbsp; <b>អត្រា៖</b> ${esc(c.rate)}% &nbsp; <b>ប្រាក់ទូទាត់៖</b> ${money(amount)} ${rielText(amount) ? '(≈ ' + rielText(amount) + ')' : ''}</p>
      <p style="font-size:11px;color:#666;">មូលដ្ឋាន៖ ប្រាក់ឈ្នួលធម្មតា + OT + ប្រាក់បាយ${inclBenefits ? ' + អត្ថប្រយោជន៍' : ''}។ ${r.approx ? 'មានខែគិតសមាមាត្រ (ប្រហែល)។' : ''}</p>
      <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:12px;">
        <div style="text-align:center;">អ្នកទទួល<br><br><br>................</div><div style="text-align:center;">អ្នកទូទាត់<br><br><br>................</div><div style="text-align:center;">អ្នកអនុម័ត<br><br><br>................</div>
      </div></div>`;
    if (typeof openPrintWindow === 'function') openPrintWindow('ប័ណ្ណទូទាត់ FDC — ' + emp.name, html, false);
  }

  async function openTab() { ensureRoot(); fillEmpOptions(); await load(); render(); }

  if (typeof window.showTab === 'function') {
    const _showTab = window.showTab;
    window.showTab = function (tab) {
      const r = _showTab.apply(this, arguments);
      if (tab === 'fdc') openTab();
      return r;
    };
  } else {
    console.warn('fdc-pay.js: window.showTab មិនមាន — tab FDC នឹងមិនបើកដោយស្វ័យប្រវត្តិ');
  }

  window.fdcPay = { applyDur, add, pay, remove, print: printVoucher, toggleBen: on => { inclBenefits = !!on; render(); } };
})();
