/* employee-loan.js — 💳 ប្រាក់កម្ចី (ទំព័របុគ្គលិក)
 * ដាក់បន្ទាប់ពី employee-pwa.js ក្នុង employee.html:  <script src="employee-loan.js"></script>
 * ត្រូវដំណើរការ loans-setup.sql ក្នុង Supabase ជាមុន។
 * ប្រើ global ពី employee.html៖ supabaseClient, getSession, todayStr, customAlert, customConfirm, escapeHtml
 */
(function () {
  'use strict';

  const MIN_WORK_DAYS = 15;       // លក្ខខណ្ឌ៖ ត្រូវធ្វើការបានយ៉ាងតិច 15 ថ្ងៃ ទើបស្នើកម្ចីបាន (ត្រូវដូច loan_min_work_days() ក្នុង SQL)
  const MAX_MONTHS = 24;          // បុគ្គលិកអាចស្នើសងបានអតិបរមាប៉ុន្មានខែ (Admin អាចកែពេលអនុម័ត)
  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const usd = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));
  const confirmMsg = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(confirm(m)));
  const monthNow = () => ((typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10)).slice(0, 7);

  function addMonths(ym, k) {
    let [y, m] = ym.split('-').map(Number);
    m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  function schedule(loan) {                    // ដូចក្នុង loans-admin.js
    if (!loan.start_month) return [];
    const n = loan.months, total = Number(loan.amount);
    const base = Math.floor((total / n) * 100) / 100;
    const out = []; let sum = 0;
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? Math.round((total - sum) * 100) / 100 : base;
      sum += amt;
      out.push({ no: i + 1, month: addMonths(loan.start_month, i), amount: amt });
    }
    return out;
  }
  function progress(loan) {
    const sch = schedule(loan), cur = monthNow();
    const done = sch.filter(s => s.month < cur);
    const paid = done.reduce((a, s) => a + s.amount, 0);
    return { sch, doneCount: done.length, remaining: Math.round((Number(loan.amount) - paid) * 100) / 100,
             finished: sch.length > 0 && done.length === sch.length };
  }

  /* ---------- ទំព័រកម្ចី៖ បញ្ចូល menu + ផ្ទាំងចូលក្នុង DOM ---------- */
  function inject() {
    if ($('loanTabContent')) return;
    const host = $('leaveTabContent');
    if (!host || !host.parentNode) return;
    const tab = document.createElement('div');
    tab.id = 'loanTabContent';
    tab.className = 'tab-content';
    tab.innerHTML = `
      <div id="loanSummary"></div>
      <div class="portal-card" style="margin-bottom:14px;">
        <h2 style="margin:0 0 8px;font-size:0.9rem;">លក្ខខណ្ឌកម្ចី</h2>
        <ul style="margin:0 0 8px 18px;padding:0;font-size:0.8rem;line-height:1.7;">
          <li>ត្រូវធ្វើការបានយ៉ាងតិច <b>${MIN_WORK_DAYS} ថ្ងៃ</b> ទើបស្នើសុំកម្ចីបាន</li>
          <li>គ្មានការប្រាក់ · កាត់ពីប្រាក់ខែរាល់ខែស្មើៗគ្នា</li>
          <li>ចំនួនខែសងអតិបរមា ${MAX_MONTHS} ខែ · ត្រូវរង់ចាំការអនុម័តពី Admin</li>
        </ul>
        <div id="loanEligible" style="font-size:0.82rem;font-weight:700;"></div>
      </div>
      <div class="portal-card" style="margin-bottom:14px;">
        <h2 style="margin:0 0 12px;font-size:0.9rem;">ស្នើសុំប្រាក់កម្ចី</h2>
        <p class="error-msg" id="loanError"></p>
        <div class="form-group">
          <label style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">ចំនួនទឹកប្រាក់ ($)</label>
          <input type="number" id="loanAmount" min="1" step="0.01" placeholder="ឧ. 200">
        </div>
        <div class="form-group">
          <label style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">ចំនួនខែសង (1–${MAX_MONTHS})</label>
          <input type="number" id="loanMonths" min="1" max="${MAX_MONTHS}" value="6">
          <div id="loanPreview" style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;"></div>
        </div>
        <div class="form-group">
          <label style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">មូលហេតុ</label>
          <textarea id="loanReason" rows="2"></textarea>
        </div>
        <button class="primary-btn" id="loanSubmitBtn">ដាក់ស្នើសុំ</button>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;">គ្មានការប្រាក់។ ប្រាក់នឹងត្រូវកាត់ពីប្រាក់ខែរាល់ខែ ស្មើៗគ្នា រហូតដល់អស់បំណុល។ ត្រូវរង់ចាំការអនុម័តពី Admin។</div>
      </div>
      <div class="portal-card history">
        <h2 style="font-size:0.85rem;margin:0 0 10px;">កម្ចីរបស់ខ្ញុំ</h2>
        <div id="loanList"></div>
      </div>`;
    host.parentNode.insertBefore(tab, host.nextSibling);

    // ប៊ូតុងក្នុងម៉ឺនុយទំព័រដើម (បន្ទាប់ពី "ប្រាក់ខែ")
    const payBtn = document.querySelector('#homeTabContent .menu-row[data-go="payroll"]');
    if (payBtn && !document.querySelector('#homeTabContent .menu-row[data-go="loan"]')) {
      const b = document.createElement('button');
      b.className = 'menu-row'; b.dataset.go = 'loan'; b.style.setProperty('--c', '#a78bfa');
      b.innerHTML = '<span class="menu-ico">💳</span><span class="lbl">ប្រាក់កម្ចី</span><span class="go">›</span>';
      b.addEventListener('click', () => switchEmpTab('loan'));
      payBtn.insertAdjacentElement('afterend', b);
    }
    $('loanSubmitBtn').onclick = submitLoan;
    ['loanAmount', 'loanMonths'].forEach(id => $(id).addEventListener('input', updatePreview));
    updatePreview();
  }

  function updatePreview() {
    const a = parseFloat($('loanAmount').value), m = parseInt($('loanMonths').value, 10);
    $('loanPreview').textContent = (a > 0 && m >= 1) ? `ប្រហែល ${usd(Math.floor((a / m) * 100) / 100)} ក្នុងមួយខែ` : '';
  }

  let loanEligible = false;
  async function workedDays() {
    const session = getSession();
    const { count, error } = await supabaseClient.from('attendance').select('date', { count: 'exact', head: true })
      .eq('employee_id', session.id).eq('status', 'present');
    if (error) throw error;
    return count || 0;
  }
  async function refreshEligibility() {
    const box = $('loanEligible'), btn = $('loanSubmitBtn');
    if (!box) return;
    try {
      const d = await workedDays();
      loanEligible = d >= MIN_WORK_DAYS;
      box.style.color = loanEligible ? '#10b981' : '#f59e0b';
      box.textContent = loanEligible
        ? `✅ អ្នកមានថ្ងៃធ្វើការ ${d} ថ្ងៃ — មានសិទ្ធិស្នើសុំកម្ចី`
        : `⚠️ អ្នកមានថ្ងៃធ្វើការ ${d} ថ្ងៃ — នៅខ្វះ ${MIN_WORK_DAYS - d} ថ្ងៃ ទើបស្នើសុំបាន`;
    } catch (e) { loanEligible = false; box.style.color = '#f59e0b'; box.textContent = 'មិនអាចពិនិត្យថ្ងៃធ្វើការបានទេ'; }
    if (btn) { btn.disabled = !loanEligible; btn.style.opacity = loanEligible ? '' : '.5'; }
  }

  async function submitLoan() {
    const err = $('loanError'); err.style.display = 'none';
    const session = getSession();
    const amount = parseFloat($('loanAmount').value), months = parseInt($('loanMonths').value, 10), reason = $('loanReason').value.trim();
    const fail = m => { err.textContent = m; err.style.display = 'block'; };
    if (!(amount > 0)) return fail('សូមបញ្ចូលចំនួនទឹកប្រាក់');
    if (!(months >= 1 && months <= MAX_MONTHS)) return fail(`ចំនួនខែសងត្រូវនៅចន្លោះ 1 ដល់ ${MAX_MONTHS}`);
    if (!reason) return fail('សូមបញ្ចូលមូលហេតុ');
    const btn = $('loanSubmitBtn'); btn.disabled = true;
    try {
      const d = await workedDays();
      if (d < MIN_WORK_DAYS) { await refreshEligibility(); return fail(`អ្នកត្រូវធ្វើការបានយ៉ាងតិច ${MIN_WORK_DAYS} ថ្ងៃ (បច្ចុប្បន្ន ${d} ថ្ងៃ)`); }
      // កុំឱ្យមានសំណើរង់ចាំច្រើនក្នុងពេលតែមួយ
      const { data: pend } = await supabaseClient.from('loans').select('id').eq('employee_id', session.id).eq('status', 'pending').limit(1);
      if (pend && pend.length) return fail('អ្នកមានសំណើកម្ចីកំពុងរង់ចាំការអនុម័តរួចហើយ');
      const { error } = await supabaseClient.from('loans').insert({ employee_id: session.id, amount, months, reason, status: 'pending', created_by: 'employee' });
      if (error) return fail('ដាក់សំណើមិនបាន៖ ' + error.message);
      $('loanAmount').value = ''; $('loanReason').value = ''; updatePreview();
      alertMsg('✅ បានដាក់សំណើកម្ចី ត្រូវរង់ចាំការអនុម័តពី Admin');
      await renderLoanEmp();
    } catch (e) { console.error(e); fail('មានបញ្ហា សូមព្យាយាមម្តងទៀត'); }
    finally { btn.disabled = !loanEligible; }
  }

  async function deleteLoan(id) {
    if (!(await confirmMsg('លុបសំណើកម្ចីនេះ?'))) return;
    const { error } = await supabaseClient.from('loans').delete().eq('id', id).eq('status', 'pending');
    if (error) { alertMsg('លុបមិនបាន៖ ' + error.message); return; }
    await renderLoanEmp();
  }

  const BADGE = { pending: ['កំពុងរង់ចាំ', '#f59e0b'], approved: ['អនុម័ត', '#10b981'], rejected: ['បដិសេធ', '#ef4444'], cancelled: ['បញ្ឈប់', '#94a3b8'] };

  async function renderLoanEmp() {
    inject();
    const list = $('loanList'), sum = $('loanSummary');
    if (!list) return;
    refreshEligibility();
    list.innerHTML = '<div class="hist-empty">កំពុងផ្ទុក...</div>';
    const session = getSession();
    const { data, error } = await supabaseClient.from('loans').select('*').eq('employee_id', session.id).order('created_at', { ascending: false });
    if (error) { list.innerHTML = '<div class="hist-empty">មិនអាចផ្ទុកទិន្នន័យបានទេ</div>'; sum.innerHTML = ''; return; }

    // កាតសង្ខេប៖ បំណុលនៅសល់ + ការកាត់ខែនេះ
    const active = (data || []).filter(l => l.status === 'approved' && !progress(l).finished);
    const remaining = active.reduce((a, l) => a + progress(l).remaining, 0);
    const cur = monthNow();
    const thisMonth = active.reduce((a, l) => a + (schedule(l).find(s => s.month === cur)?.amount || 0), 0);
    sum.innerHTML = active.length ? `
      <div class="portal-card" style="margin-bottom:14px;display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap;">
        <div><div style="font-size:0.72rem;color:var(--text-muted);">បំណុលនៅសល់</div><div style="font-size:1.3rem;font-weight:800;">${usd(remaining)}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted);">កាត់ខែនេះ (${cur})</div><div style="font-size:1.3rem;font-weight:800;">${usd(thisMonth)}</div></div>
      </div>` : '';

    if (!data || !data.length) { list.innerHTML = '<div class="hist-empty">មិនទាន់មានកម្ចីទេ</div>'; return; }
    list.innerHTML = data.map(l => {
      const [label, color] = BADGE[l.status] || [l.status, '#94a3b8'];
      let extra = '';
      if (l.status === 'approved') {
        const p = progress(l), pct = Math.round((p.doneCount / l.months) * 100);
        extra = `<div style="font-size:0.78rem;margin-top:6px;">${p.finished ? '✅ សងរួចរាល់' : `នៅសល់ <b>${usd(p.remaining)}</b>`} · កាត់ ${p.doneCount}/${l.months} ខែ (ចាប់ពី ${l.start_month})</div>
          <div style="background:rgba(128,128,128,.25);border-radius:6px;height:7px;margin:6px 0;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#14b8a6;"></div></div>
          <details><summary style="cursor:pointer;font-size:0.76rem;">តារាងសង</summary>
            ${p.sch.map(s => `<div style="display:flex;justify-content:space-between;font-size:0.76rem;padding:2px 0;opacity:${s.month < cur ? .55 : 1};"><span>${s.no}/${l.months} · ${s.month}</span><span>${usd(s.amount)}</span><span>${s.month < cur ? '✅' : (s.month === cur ? '🟡' : '⏳')}</span></div>`).join('')}
          </details>`;
      } else if (l.admin_note) {
        extra = `<div style="font-size:0.76rem;margin-top:4px;color:var(--text-muted);">${esc(l.admin_note)}</div>`;
      }
      const del = l.status === 'pending' ? `<div style="margin-top:6px;"><button type="button" onclick="employeeLoan.remove('${l.id}')" style="padding:3px 10px;border-radius:8px;border:1px solid var(--border, rgba(128,128,128,.3));background:transparent;color:inherit;font-size:0.72rem;cursor:pointer;">🗑 លុបសំណើ</button></div>` : '';
      return `<div class="req-item" style="padding:10px 0;border-top:1px solid var(--border, rgba(128,128,128,.25));">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div><b>${usd(l.amount)}</b> · ${l.months} ខែ<div style="font-size:0.74rem;color:var(--text-muted);">${esc(l.reason || '')} · ${String(l.created_at || '').slice(0, 10)}</div></div>
          <span style="flex:0 0 auto;padding:3px 10px;border-radius:999px;font-size:0.72rem;font-weight:700;background:${color}22;color:${color};">${label}</span>
        </div>${extra}${del}</div>`;
    }).join('');
  }

  window.employeeLoan = { render: renderLoanEmp, remove: deleteLoan, inject };
  window.renderLoanEmp = renderLoanEmp;

  if (document.readyState !== 'loading') inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
