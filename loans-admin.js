/* loans-admin.js — 💳 ប្រាក់កម្ចី (Admin)
 * ដាក់បន្ទាប់ពី script.js ក្នុង index.html:  <script src="loans-admin.js"></script>
 * ត្រូវដំណើរការ loans-setup.sql ក្នុង Supabase ជាមុន។
 *
 * របៀបដំណើរការ៖ ពេលអនុម័ត/បញ្ចូលកម្ចី ប្រព័ន្ធបង្កើតធាតុ "ប្រាក់កាត់" ម្តងមួយខែ (ឧ. "ប្រាក់កម្ចី 2/6")
 * ក្នុង payroll_items ដែលមានស្រាប់ → បង្ហាញក្នុងប្រាក់ខែ និង Payslip ដោយស្វ័យប្រវត្តិ (មិនប៉ះការគណនាប្រាក់ខែ)។
 * ប្រើ global ពី script.js៖ supabaseClient, employees, payrollItems, upsertPayrollItemRow, deletePayrollItemRow,
 *   isMonthLocked, customAlert, customConfirm, escapeHtml, todayStr, logAudit
 */
(function () {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const usd = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));
  const confirmMsg = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(confirm(m)));
  const monthNow = () => ((typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10)).slice(0, 7);
  const locked = m => (typeof isMonthLocked === 'function') && isMonthLocked(m);
  const empName = id => { const e = (typeof employees !== 'undefined' ? employees : []).find(x => x.id === id); return e ? e.name : id; };

  let loans = [];
  let tab = 'pending';        // pending | active | history

  /* ---------- ការគណនាតារាងសង (មិនមានការប្រាក់) ---------- */
  function addMonths(ym, k) {
    let [y, m] = ym.split('-').map(Number);
    m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  function schedule(loan) {                    // [{no, month, amount}]
    if (!loan.start_month) return [];
    const n = loan.months, total = Number(loan.amount);
    const base = Math.floor((total / n) * 100) / 100;
    const out = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? Math.round((total - sum) * 100) / 100 : base;   // ខែចុងក្រោយបូកសំណល់ឱ្យស្មើបំណុលពិត
      sum += amt;
      out.push({ no: i + 1, month: addMonths(loan.start_month, i), amount: amt });
    }
    return out;
  }
  function progress(loan) {                    // ស្ថានភាពសងតាមខែបច្ចុប្បន្ន
    const sch = schedule(loan), cur = monthNow();
    const done = sch.filter(s => s.month < cur);
    const paid = done.reduce((a, s) => a + s.amount, 0);
    return { sch, doneCount: done.length, paid, remaining: Math.round((Number(loan.amount) - paid) * 100) / 100,
             finished: sch.length > 0 && done.length === sch.length };
  }
  const itemId = (loan, month) => `loan_${loan.id}_${month}`;

  /* ---------- ទិន្នន័យ ---------- */
  async function loadLoans() {
    const { data, error } = await supabaseClient.from('loans').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    loans = data || [];
  }

  /* ---------- បង្កើត/លុបធាតុប្រាក់កាត់ក្នុងប្រាក់ខែ ---------- */
  async function createItems(loan) {
    const made = [];
    for (const s of schedule(loan)) {
      const item = { id: itemId(loan, s.month), employeeId: loan.employee_id, type: 'deduction',
        name: `ប្រាក់កម្ចី ${s.no}/${loan.months}`, recurrence: 'variable', month: s.month, currency: 'USD', amount: s.amount };
      const ok = await upsertPayrollItemRow(item);
      if (!ok) throw new Error(`បង្កើតធាតុប្រាក់កាត់ខែ ${s.month} មិនបាន`);
      const i = payrollItems.findIndex(x => x.id === item.id);
      if (i !== -1) payrollItems[i] = item; else payrollItems.push(item);
      made.push(item.id);
    }
    return made;
  }
  async function removeItems(ids) {
    for (const id of ids) {
      if (await deletePayrollItemRow(id)) { const i = payrollItems.findIndex(x => x.id === id); if (i !== -1) payrollItems.splice(i, 1); }
    }
  }
  function refreshPayroll() {
    ['renderPayrollTab', 'renderMonthlyTab', 'renderDeductTab', 'renderPayrollHistory'].forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn(fn, e); } });
  }
  function audit(action, loan) {
    try { if (typeof logAudit === 'function') logAudit(action, { entity: 'loan', ref: loan.id, employeeId: loan.employee_id, new: { amount: loan.amount, months: loan.months, start_month: loan.start_month } }); } catch (e) { /* ignore */ }
  }

  /* ---------- សកម្មភាព ---------- */
  function checkMonthsFree(loan) {
    const bad = schedule(loan).filter(s => locked(s.month));
    if (bad.length) { alertMsg('មិនអាចបន្តបាន ព្រោះខែទាំងនេះបានបិទរួចហើយ៖ ' + bad.map(b => b.month).join(', ') + '\\nសូមជ្រើសខែចាប់ផ្តើមក្រោយនេះ'); return false; }
    return true;
  }

  async function approve(id) {
    const loan = loans.find(l => l.id === id); if (!loan) return;
    const months = parseInt($('#ln-m-' + id).value, 10);
    const start = $('#ln-s-' + id).value;
    const note = ($('#ln-n-' + id).value || '').trim();
    if (!(months >= 1 && months <= 60) || !/^\d{4}-\d{2}$/.test(start)) { alertMsg('សូមបំពេញចំនួនខែ (1–60) និងខែចាប់ផ្តើមកាត់'); return; }
    const next = { ...loan, months, start_month: start };
    if (!checkMonthsFree(next)) return;
    const per = schedule(next)[0].amount;
    if (!(await confirmMsg(`អនុម័តកម្ចី ${usd(loan.amount)} ឱ្យ ${empName(loan.employee_id)}\n\nកាត់ ${months} ខែ ចាប់ពី ${start} (ប្រហែល ${usd(per)}/ខែ)?`))) return;
    try {
      const { error } = await supabaseClient.from('loans').update({ status: 'approved', months, start_month: start, admin_note: note || null, decided_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      let made = [];
      try { made = await createItems(next); }
      catch (e) {                                           // បរាជ័យពាក់កណ្តាល → ដកធាតុដែលបានបង្កើត ហើយត្រឡប់ទៅ pending
        await removeItems(made.length ? made : schedule(next).map(s => itemId(next, s.month)));
        await supabaseClient.from('loans').update({ status: 'pending', start_month: null, decided_at: null }).eq('id', id);
        throw e;
      }
      audit('loan_approve', next);
      refreshPayroll(); await reload();
    } catch (e) { console.error(e); alertMsg('អនុម័តមិនបាន៖ ' + (e.message || e)); }
  }

  async function reject(id) {
    const loan = loans.find(l => l.id === id); if (!loan) return;
    const note = ($('#ln-n-' + id).value || '').trim();
    if (!(await confirmMsg(`បដិសេធសំណើកម្ចីរបស់ ${empName(loan.employee_id)} ?`))) return;
    const { error } = await supabaseClient.from('loans').update({ status: 'rejected', admin_note: note || null, decided_at: new Date().toISOString() }).eq('id', id);
    if (error) { alertMsg('បដិសេធមិនបាន៖ ' + error.message); return; }
    audit('loan_reject', loan); await reload();
  }

  async function addByAdmin() {
    const emp = $('#ln-add-emp').value, amount = parseFloat($('#ln-add-amt').value),
      months = parseInt($('#ln-add-mon').value, 10), start = $('#ln-add-start').value, reason = ($('#ln-add-reason').value || '').trim();
    if (!emp || !(amount > 0) || !(months >= 1 && months <= 60) || !/^\d{4}-\d{2}$/.test(start)) { alertMsg('សូមបំពេញ បុគ្គលិក ចំនួនទឹកប្រាក់ ចំនួនខែ និងខែចាប់ផ្តើមកាត់ឱ្យគ្រប់'); return; }
    const draft = { id: 'draft', employee_id: emp, amount, months, start_month: start };
    if (!checkMonthsFree(draft)) return;
    if (!(await confirmMsg(`បញ្ចូលកម្ចី ${usd(amount)} ឱ្យ ${empName(emp)}\nកាត់ ${months} ខែ ចាប់ពី ${start} (ប្រហែល ${usd(schedule(draft)[0].amount)}/ខែ)?`))) return;
    try {
      const { data, error } = await supabaseClient.from('loans').insert({ employee_id: emp, amount, months, start_month: start, reason: reason || null,
        status: 'approved', created_by: 'admin', decided_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      try { await createItems(data); }
      catch (e) { await removeItems(schedule(data).map(s => itemId(data, s.month))); await supabaseClient.from('loans').delete().eq('id', data.id); throw e; }
      audit('loan_add', data);
      refreshPayroll(); tab = 'active'; await reload();
    } catch (e) { console.error(e); alertMsg('បញ្ចូលកម្ចីមិនបាន៖ ' + (e.message || e)); }
  }

  async function stopLoan(id) {                    // បញ្ឈប់កម្ចី៖ ដកការកាត់ខែបន្តបន្ទាប់ (ខែនេះ និងក្រោយ ដែលមិនទាន់បិទ)
    const loan = loans.find(l => l.id === id); if (!loan) return;
    const cur = monthNow();
    const future = schedule(loan).filter(s => s.month >= cur && !locked(s.month));
    if (!(await confirmMsg(`បញ្ឈប់កម្ចីរបស់ ${empName(loan.employee_id)} ?\nការកាត់ ${future.length} ខែ (ចាប់ពី ${cur}) នឹងត្រូវដកចេញ។ ខែដែលបិទរួចមិនប៉ះពាល់ទេ។`))) return;
    try {
      await removeItems(future.map(s => itemId(loan, s.month)));
      const { error } = await supabaseClient.from('loans').update({ status: 'cancelled', admin_note: ((loan.admin_note || '') + ' [បញ្ឈប់ ' + cur + ']').trim() }).eq('id', id);
      if (error) throw error;
      audit('loan_stop', loan); refreshPayroll(); await reload();
    } catch (e) { alertMsg('បញ្ឈប់មិនបាន៖ ' + (e.message || e)); }
  }

  /* ---------- UI ---------- */
  const inStyle = 'padding:6px;border-radius:6px;border:1px solid #334;background:#0d1b2a;color:#fff;';
  const btn = (c, extra) => `padding:6px 12px;border-radius:8px;border:0;cursor:pointer;font-weight:700;background:${c};color:#04121a;${extra || ''}`;

  function scheduleHtml(loan) {
    const p = progress(loan), cur = monthNow();
    return `<div style="margin-top:6px;font-size:.78rem;">` + p.sch.map(s => {
      const st = s.month < cur ? '✅ កាត់រួច' : (s.month === cur ? '🟡 ខែនេះ' : '⏳ នៅមិនទាន់ដល់');
      return `<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;opacity:${s.month < cur ? .6 : 1};"><span>${s.no}/${loan.months} · ${s.month}</span><span>${usd(s.amount)}</span><span>${st}</span></div>`;
    }).join('') + `</div>`;
  }

  function card(l) {
    const emp = esc(empName(l.employee_id));
    const head = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><b>${emp}</b><b>${usd(l.amount)} · ${l.months} ខែ</b></div>
      <div style="font-size:.76rem;opacity:.7;">${esc(l.reason || '-')} · ${l.created_by === 'admin' ? 'បញ្ចូលដោយ Admin' : 'បុគ្គលិកស្នើ'} · ${String(l.created_at || '').slice(0, 10)}</div>`;
    const wrap = body => `<div style="background:rgba(128,128,128,.10);border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:10px 12px;margin-bottom:8px;">${head}${body}</div>`;

    if (l.status === 'pending') {
      const defStart = addMonths(monthNow(), 1);
      return wrap(`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px;">
        <label style="font-size:.72rem;">ចំនួនខែសង<br><input id="ln-m-${l.id}" type="number" min="1" max="60" value="${l.months}" style="${inStyle}width:80px"></label>
        <label style="font-size:.72rem;">ចាប់ផ្តើមកាត់ខែ<br><input id="ln-s-${l.id}" type="month" value="${defStart}" style="${inStyle}"></label>
        <label style="font-size:.72rem;flex:1;min-width:140px;">កំណត់សម្គាល់<br><input id="ln-n-${l.id}" type="text" style="${inStyle}width:100%"></label>
        <button onclick="loansAdmin.approve('${l.id}')" style="${btn('#14b8a6')}">✓ អនុម័ត</button>
        <button onclick="loansAdmin.reject('${l.id}')" style="${btn('#fb7185')}">✕ បដិសេធ</button></div>`);
    }
    if (l.status === 'approved') {
      const p = progress(l);
      const pct = Math.round((p.doneCount / l.months) * 100);
      return wrap(`<div style="margin-top:6px;font-size:.8rem;">${p.finished ? '✅ សងរួចរាល់' : '🟢 កំពុងសង'} · នៅសល់ <b>${usd(p.remaining)}</b> · កាត់ ${p.doneCount}/${l.months} ខែ (ចាប់ពី ${l.start_month})</div>
        <div style="background:rgba(128,128,128,.25);border-radius:6px;height:8px;margin:6px 0;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#14b8a6;"></div></div>
        <details><summary style="cursor:pointer;font-size:.78rem;">តារាងសង</summary>${scheduleHtml(l)}</details>
        ${p.finished ? '' : `<div style="margin-top:8px;"><button onclick="loansAdmin.stop('${l.id}')" style="${btn('#fbbf24')}">⏹ បញ្ឈប់កម្ចី</button></div>`}`);
    }
    return wrap(`<div style="margin-top:6px;font-size:.8rem;">${l.status === 'rejected' ? '✕ បដិសេធ' : '⏹ បញ្ឈប់'}${l.admin_note ? ' · ' + esc(l.admin_note) : ''}</div>`);
  }

  function render() {
    const body = $('#ln-body'); if (!body) return;
    const pending = loans.filter(l => l.status === 'pending');
    const active = loans.filter(l => l.status === 'approved' && !progress(l).finished);
    const hist = loans.filter(l => !pending.includes(l) && !active.includes(l));
    const tabBtn = (k, label, n) => `<button onclick="loansAdmin.setTab('${k}')" style="${btn(tab === k ? '#14b8a6' : 'rgba(128,128,128,.35)', tab === k ? '' : 'color:inherit;')}">${label} (${n})</button>`;
    const list = tab === 'pending' ? pending : tab === 'active' ? active : hist;
    const totalRemain = active.reduce((a, l) => a + progress(l).remaining, 0);

    const emps = (typeof employees !== 'undefined' ? employees : []).filter(e => e.status === 'active');
    $('#ln-tabs').innerHTML = tabBtn('pending', '📥 សំណើរង់ចាំ', pending.length) + ' ' + tabBtn('active', '🟢 កំពុងសង', active.length) + ' ' + tabBtn('history', '📜 ប្រវត្តិ', hist.length)
      + `<span style="margin-left:auto;font-size:.8rem;opacity:.8;">បំណុលនៅសល់សរុប <b>${usd(totalRemain)}</b></span>`;
    body.innerHTML = (list.length ? list.map(card).join('') : '<div style="opacity:.7;padding:10px 0;">គ្មានទិន្នន័យ</div>');
    const sel = $('#ln-add-emp');
    if (sel && !sel.options.length) sel.innerHTML = '<option value="">— ជ្រើសបុគ្គលិក —</option>' + emps.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.username || e.id)})</option>`).join('');
    updateBadge(pending.length);
  }

  function updateBadge(n) { const b = $('#loans-open'); if (b) b.textContent = '💳 ប្រាក់កម្ចី' + (n ? ` (${n})` : ''); }

  async function reload() { try { await loadLoans(); render(); } catch (e) { console.error(e); $('#ln-body') && ($('#ln-body').innerHTML = `<div style="color:#fb7185">ផ្ទុកទិន្នន័យមិនបាន៖ ${esc(e.message || e)}<br><small>តើបានដំណើរការ loans-setup.sql ហើយឬនៅ? បើនៅឃើញកំហុសសិទ្ធិ មើលបន្ទាត់ចុងក្រោយក្នុងឯកសារនោះ។</small></div>`); } }

  function close() { const m = $('#ln-modal'); if (m) m.remove(); }

  async function open() {
    close();
    const el = document.createElement('div');
    el.id = 'ln-modal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    el.innerHTML = `
      <div style="background:#0b1623;color:#e8eef5;border:1px solid #243447;border-radius:14px;width:min(900px,100%);max-height:92vh;overflow:auto;padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0">💳 ប្រាក់កម្ចីបុគ្គលិក</h3>
          <button id="ln-x" style="background:none;border:0;color:#fff;font-size:22px;cursor:pointer">✕</button>
        </div>
        <details style="margin-bottom:12px;"><summary style="cursor:pointer;font-weight:700;">➕ បញ្ចូលកម្ចីថ្មី (ដោយ Admin)</summary>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;">
            <label style="font-size:.72rem;">បុគ្គលិក<br><select id="ln-add-emp" style="${inStyle}min-width:180px"></select></label>
            <label style="font-size:.72rem;">ចំនួនទឹកប្រាក់ ($)<br><input id="ln-add-amt" type="number" min="1" step="0.01" style="${inStyle}width:110px"></label>
            <label style="font-size:.72rem;">ចំនួនខែសង<br><input id="ln-add-mon" type="number" min="1" max="60" value="6" style="${inStyle}width:80px"></label>
            <label style="font-size:.72rem;">ចាប់ផ្តើមកាត់ខែ<br><input id="ln-add-start" type="month" value="${addMonths(monthNow(), 1)}" style="${inStyle}"></label>
            <label style="font-size:.72rem;flex:1;min-width:140px;">មូលហេតុ<br><input id="ln-add-reason" type="text" style="${inStyle}width:100%"></label>
            <button onclick="loansAdmin.add()" style="${btn('#14b8a6')}">បន្ថែមកម្ចី</button>
          </div>
          <div style="font-size:.72rem;opacity:.65;margin-top:6px;">គ្មានការប្រាក់។ ប្រាក់ត្រូវកាត់ស្មើៗគ្នារាល់ខែ (ខែចុងក្រោយបូកសំណល់ឱ្យចំបំណុល) ដោយបង្កើតជាធាតុប្រាក់កាត់ក្នុងប្រាក់ខែនីមួយៗ។</div>
        </details>
        <div id="ln-tabs" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;"></div>
        <div id="ln-body"><div style="opacity:.7">កំពុងផ្ទុក...</div></div>
      </div>`;
    document.body.appendChild(el);
    $('#ln-x').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    $('#ln-tabs').innerHTML = '';
    await reload();
  }

  window.loansAdmin = { approve, reject, add: addByAdmin, stop: stopLoan, setTab: k => { tab = k; render(); }, open, _schedule: schedule };

  function mount() {
    if ($('#loans-open')) return;
    const btns = [...document.querySelectorAll('button')].filter(b => b.id !== 'loans-open');
    const anchor = btns.find(b => b.id === 'ana-open') || btns.find(b => b.id === 'mer-open') || btns.find(b => /Backup/.test(b.textContent));
    const b = document.createElement('button');
    b.id = 'loans-open'; b.type = 'button';
    if (anchor) { b.className = anchor.className; anchor.insertAdjacentElement('afterend', b); }
    else { b.style.cssText = 'position:fixed;bottom:16px;left:400px;z-index:9000;padding:8px 14px;border-radius:10px;border:0;background:#a78bfa;color:#04121a;font-weight:700;cursor:pointer'; document.body.appendChild(b); }
    b.textContent = '💳 ប្រាក់កម្ចី';
    b.onclick = open;
    // បង្ហាញចំនួនសំណើរង់ចាំលើប៊ូតុង (ស្ងាត់ៗ បើមិនមានសិទ្ធិ/តារាង)
    if (typeof supabaseClient !== 'undefined') {
      supabaseClient.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        .then(r => { if (r && !r.error && r.count) updateBadge(r.count); }).catch(() => {});
    }
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mount);
  mount();
})();
