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
  function calcContract(c, diag) {
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
      let daily = null, wd = null;
      if (diag) {   // ពិនិត្យ៖ ផលបូក computeRow រាល់ថ្ងៃ ប្រៀបធៀបនឹងលេខដែលប្រើ
        daily = 0;
        days.filter(d => d >= from && d <= upto).forEach(d => {
          const rec = (attendance[d] && attendance[d][emp.id]) || {};
          daily += computeRow(emp, rec, d).total || 0;
        });
        try { wd = summarizeEmpMonth(emp, m).workDays; } catch (e) { wd = null; }
      }
      lines.push({ month: m, from, to: upto, usd, ben, note, daily, wd, locked, full });
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
      <div class="portal-card" style="padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div><label style="display:block;font-size:0.72rem;color:var(--text-muted);">ខែដែលកិច្ចសន្យាបញ្ចប់</label><input type="month" id="fdcRepMonth"></div>
        <button type="button" onclick="fdcPay.printMonthly()">🖨 តារាងប្រចាំខែ (ទទួលប្រាក់បំណាច់)</button>
        <span class="scan-hint" style="margin:0;">បញ្ជីបុគ្គលិកដែលកិច្ចសន្យាបញ្ចប់ក្នុងខែនោះ តាមផ្នែក · កត់ត្រា បន្ត/មិនបន្ត ក្នុងជួរសកម្មភាពខាងក្រោម</span>
      </div>
      <p class="scan-hint" id="fdcWarn" style="display:none;color:var(--danger,#dc2626);"></p>
      <div class="table-wrap"><table>
        <thead><tr><th>បុគ្គលិក</th><th>កិច្ចសន្យា</th><th>រយៈពេល</th><th>ស្ថានភាព</th><th>ប្រាក់ឈ្នួលសរុប</th><th>ប្រាក់ទូទាត់ (%)</th><th>សកម្មភាព</th></tr></thead>
        <tbody id="fdcList"></tbody></table></div>
      <div class="empty-state" id="fdcEmpty" style="display:none;">មិនទាន់មានកិច្ចសន្យា FDC</div>`);
    if ($('fdcRepMonth') && !$('fdcRepMonth').value) $('fdcRepMonth').value = today().slice(0, 7);
  }

  async function load() {
    const { data, error } = await supabaseClient.from('employee_contracts').select('*').eq('contract_type', 'FDC').order('end_date', { ascending: true });
    missing = !!error;
    if (error) console.warn('employee_contracts:', error.message);
    contracts = data || [];
  }

  const openDetail = new Set();
  function toggle(id) { id = String(id); if (openDetail.has(id)) openDetail.delete(id); else openDetail.add(id); render(); }

  function detailRow(c) {
    const emp = employees.find(e => e.id === c.employee_id);
    const r = calcContract(c, true);
    if (r.error) return `<tr><td colspan="7">${esc(r.error)}</td></tr>`;
    const diffs = [];
    const body = r.lines.map(l => {
      const use = l.usd + (inclBenefits ? l.ben : 0);
      const differs = l.daily != null && Math.abs(l.daily - l.usd) > 0.01;
      if (differs) diffs.push(l.month);
      return `<tr><td>${esc(l.month)}</td><td>${esc(l.from)} → ${esc(l.to)}</td><td style="text-align:right;"><b>${money(use)}</b></td>
        <td style="text-align:right;${differs ? 'color:#f97316;font-weight:700;' : ''}">${money(l.daily)}</td><td>${l.wd == null ? '' : esc(l.wd)}</td><td>${l.locked ? '🔒 ' : ''}${esc(l.note)}</td></tr>`;
    }).join('');
    return `<tr><td colspan="7" style="padding:10px 14px;background:rgba(14,165,233,0.06);">
      <div style="font-size:0.78rem;margin-bottom:6px;">ប្រាក់ខែគោល៖ <b>${money(Number(emp && emp.salary) || 0)}</b> · ថ្ងៃគិតត្រឹម៖ ${esc(r.upto || '')}</div>
      <div class="table-wrap"><table style="font-size:0.78rem;"><thead><tr><th>ខែ</th><th>ថ្ងៃគិត</th><th>ប្រាក់ដែលប្រើគណនា</th><th>ផលបូករាល់ថ្ងៃ (computeRow)</th><th>ថ្ងៃធ្វើការ</th><th>កំណត់ចំណាំ</th></tr></thead><tbody>${body}</tbody></table></div>
      ${diffs.length ? `<div class="scan-hint" style="color:#f97316;margin-top:6px;">⚠ ខែ ${esc(diffs.join(', '))}៖ លេខពី Payroll (summarizeEmpMonth/snapshot) មិនស្មើផលបូករាល់ថ្ងៃ — ផ្ទៀងផ្ទាត់ជាមួយ Payroll ប្រចាំខែ</div>` : ''}
    </td></tr>`;
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
      const row = `<tr>
        <td>${esc(name)}</td>
        <td>${esc(c.start_date)} → ${esc(c.end_date)}${c.note ? `<div style="font-size:0.72rem;color:var(--text-muted);">${esc(c.note)}</div>` : ''}</td>
        <td>${days} ថ្ងៃ (~${(days / 30.4).toFixed(1)} ខែ)</td>
        <td style="color:${st.tone};font-weight:700;">● ${esc(st.label)}</td>
        <td>${money(base)}${extra}${ongoing ? '<div style="font-size:0.7rem;color:var(--text-muted);">គិតត្រឹមថ្ងៃនេះ</div>' : ''}</td>
        <td><b>${money(amount)}</b> <span style="color:var(--text-muted);">(${esc(c.rate)}%)</span>${rielText(amount) ? `<div style="font-size:0.72rem;color:var(--text-muted);">${rielText(amount)}</div>` : ''}</td>
        <td>${renewSelect(c)} ${c.paid_at ? '' : `<button type="button" data-id="${esc(c.id)}" onclick="fdcPay.pay(this.dataset.id)">✓ ទូទាត់</button> `}
            <button type="button" class="secondary" data-id="${esc(c.id)}" onclick="fdcPay.toggle(this.dataset.id)" title="មើលលម្អិតតាមខែ">🔍</button>
            <button type="button" class="secondary" data-id="${esc(c.id)}" onclick="fdcPay.print(this.dataset.id)">🖨 ប័ណ្ណ</button>
            <button type="button" class="danger" data-id="${esc(c.id)}" onclick="fdcPay.remove(this.dataset.id)">🗑</button></td>
      </tr>`;
      return row + (openDetail.has(String(c.id)) ? detailRow(c) : '');
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
    else printHtml('ប័ណ្ណទូទាត់ FDC — ' + emp.name, html, false);
  }

  function renewSelect(c) {
    const v = c.renew_status || '';
    return `<select data-id="${esc(c.id)}" onchange="fdcPay.setRenew(this.dataset.id, this.value)" title="បន្ត / មិនបន្ត កិច្ចសន្យា"><option value="">បន្ត?</option><option value="renew"${v === 'renew' ? ' selected' : ''}>✔ បន្ត</option><option value="end"${v === 'end' ? ' selected' : ''}>✘ មិនបន្ត</option></select>`;
  }

  async function setRenew(id, val) {
    const c = contracts.find(x => String(x.id) === String(id));
    if (!c) return;
    const { data, error } = await supabaseClient.from('employee_contracts').update({ renew_status: val || null }).eq('id', c.id).select('id');
    if (error || !data || !data.length) {
      customAlert('រក្សាទុកមិនបានទេ៖ ' + (error ? error.message : 'គ្មានសិទ្ធិ (RLS) ឬរកមិនឃើញ') + ((error && /renew_status/.test(error.message)) ? '\nសូមរត់ fdc-contracts.sql ថ្មីក្នុង Supabase ជាមុន' : ''));
      render();
      return;
    }
    c.renew_status = val || null;
  }

  // បើកផ្ទាំងព្រីនផ្ទាល់ខ្លួន (មិនពឹង openPrintWindow) — ពុម្ពអក្សរខ្មែរ + A4
  function printHtml(title, body, landscape) {
    const w = window.open('', '_blank');
    if (!w) { customAlert('Browser រារាំង popup — សូមអនុញ្ញាត popup សម្រាប់គេហទំព័រនេះ'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap">
<style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
body { font-family: 'Khmer OS Battambang','Noto Sans Khmer','Khmer OS',sans-serif; color:#000; font-size:12px; margin:0; }
.sec { page-break-after: always; } .sec:last-child { page-break-after: auto; }
table { width:100%; border-collapse:collapse; }
th, td { border:1px solid #000; padding:5px 6px; text-align:center; vertical-align:middle; }
td.l { text-align:left; } th small { display:block; font-weight:400; }
.hd { text-align:center; } .hd h2 { margin:0 0 2px; font-size:17px; } .hd div { font-size:12px; }
.meta { display:flex; justify-content:space-between; margin:10px 0 4px; font-weight:700; }
.sign { display:flex; justify-content:space-between; margin-top:36px; }
.sign div { text-align:center; min-width:160px; }
</style></head><body>${body}</body></html>`);
    w.document.close();
    let done = false;
    const go = () => { if (done) return; done = true; try { w.focus(); w.print(); } catch (e) { /* ignore */ } };
    w.onload = () => setTimeout(go, 600);
    setTimeout(go, 2500);
  }

  // តារាងប្រចាំខែ៖ បុគ្គលិកដែលកិច្ចសន្យាបញ្ចប់ក្នុងខែដែលបានជ្រើស តាមផ្នែក
  function printMonthly() {
    const month = (($('fdcRepMonth') || {}).value || today().slice(0, 7));
    const list = contracts.filter(c => String(c.end_date || '').slice(0, 7) === month);
    if (!list.length) { customAlert('គ្មានកិច្ចសន្យា FDC ដែលបញ្ចប់ក្នុងខែ ' + month); return; }
    const fmt = iso => (iso ? String(iso).split('-').reverse().join('-') : '');
    const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthLabel = month.slice(0, 4) + '-' + (EN[parseInt(month.slice(5, 7), 10) - 1] || month.slice(5, 7));
    const rates = [...new Set(list.map(c => Number(c.rate) || 5))].sort((a, b) => a - b);
    const rateTxt = rates.join('/');
    const groups = {};
    list.forEach(c => {
      const emp = employees.find(e => e.id === c.employee_id) || { name: c.employee_id, id: c.employee_id };
      (groups[emp.dept || '-'] = groups[emp.dept || '-'] || []).push({ c, emp });
    });
    const head = `<tr>
      <th>ល.រ<small>序号</small></th><th>ផ្នែក<small>部門</small></th><th>ឈ្មោះ<small>姓名</small></th><th>អត្តលេខ<small>工号</small></th><th>ភេទ<small>性別</small></th><th>មុខងារ<small>工種</small></th>
      <th>ថ្ងៃ ខែ ចូល<small>入厂日期</small></th><th>ថ្ងៃ ខែ ចុះកិច្ចសន្យា<small>合同日期</small></th><th>ថ្ងៃ ខែ បញ្ចប់កិច្ចសន្យា<small>合同结束</small></th>
      <th>បន្ត<small>延续</small></th><th>មិនបន្ត<small>终止</small></th><th>កំណត់សម្គាល់<small>备注</small></th></tr>`;
    const sections = Object.keys(groups).sort((a, b) => a.localeCompare(b)).map(dept => {
      const rows = groups[dept].sort((a, b) => (a.emp.name || '').localeCompare(b.emp.name || '')).map(({ c, emp }, i) => `<tr>
        <td>${i + 1}</td><td>${esc(dept)}</td><td class="l">${esc(emp.name)}</td><td>${esc(emp.username || emp.id)}</td><td></td><td>${esc(emp.position || '')}</td>
        <td>${esc(fmt(emp.startDate))}</td><td>${esc(fmt(c.start_date))}</td><td>${esc(fmt(c.end_date))}</td>
        <td>${c.renew_status === 'renew' ? '✔' : ''}</td><td>${c.renew_status === 'end' ? '✔' : ''}</td><td class="l">${esc(c.note || '')}</td></tr>`).join('');
      return `<div class="sec">
        <div class="hd"><h2>តារាងឈ្មោះនិយោជិត កម្មករ ទទួលប្រាក់បំណាច់ ${esc(rateTxt)} ភាគរយ (ពេញសិទ្ធិ)</h2></div>
        <div class="meta"><span>ផ្នែក៖ ${esc(dept)}</span><span>${esc(monthLabel)}</span></div>
        <table><thead>${head}</thead><tbody>${rows}</tbody></table>
        <div class="sign"><div>ហត្ថលេខា<br>ប្រធានក្រុម<br><br><br>................</div><div>ហត្ថលេខា<br>ប្រធានផ្នែក<br><br><br>................</div></div>
      </div>`;
    }).join('');
    printHtml('តារាងទទួលប្រាក់បំណាច់ FDC — ' + month, sections, true);
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

  window.fdcPay = { toggle, applyDur, setRenew, printMonthly, add, pay, remove, print: printVoucher, toggleBen: on => { inclBenefits = !!on; render(); } };
})();
