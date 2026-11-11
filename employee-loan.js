/* employee-loan.js — 💳 ប្រាក់កម្ចី (ទំព័របុគ្គលិក) · រចនាបថតាមគម្រូ "កម្ចីឌីជីថល"
 * ដាក់បន្ទាប់ពី employee-pwa.js ក្នុង employee.html:  <script src="employee-loan.js"></script>
 * ត្រូវដំណើរការ loans-setup.sql ក្នុង Supabase ជាមុន។
 * ប្រើ global ពី employee.html៖ supabaseClient, getSession, currentEmployee, todayStr, customAlert, customConfirm, escapeHtml, switchEmpTab
 */
(function () {
  'use strict';

  /* ========== កំណត់ (កែលេខទាំងនេះបាន) ========== */
  const MIN_WORK_DAYS = 15;        // ត្រូវធ្វើការបានយ៉ាងតិចប៉ុន្មានថ្ងៃ ទើបស្នើកម្ចីបាន (ត្រូវដូច loan_min_work_days() ក្នុង SQL)
  const LOAN_MIN = 20;             // កម្ចីតិចបំផុត ($)
  const LOAN_STEP = 5;             // ជំហាន slider ($)
  const LOAN_PAY_RATIO = 1;        // ទំហំកម្ចីអតិបរមា = ប្រាក់ខែសរុបប្រចាំខែ × លេខនេះ (1 = មួយខែ; 0.5 = កន្លះខែ)
  const LOAN_CAP = 0;              // ពិដានដាច់ខាត ($) — 0 = មិនកំណត់
  const MONTH_CHOICES = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];   // ជម្រើសរយៈពេលសង (ខែ)

  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const usd = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd0 = n => '$' + (Math.round(n || 0)).toLocaleString('en-US');
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));
  const confirmMsg = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(confirm(m)));
  const monthNow = () => ((typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10)).slice(0, 7);
  const MAX_MONTHS = Math.max(...MONTH_CHOICES);

  /* ---------- តារាងសង (ដូចក្នុង loans-admin.js) ---------- */
  function addMonths(ym, k) {
    let [y, m] = ym.split('-').map(Number);
    m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  function schedule(loan) {
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

  /* ---------- រចនាបថ ---------- */
  const CSS = `
  #loanTabContent .ln-hero{background:linear-gradient(135deg,#3f9a2c,#7ac142);border-radius:18px;padding:18px 18px 34px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px;}
  #loanTabContent .ln-title{font-size:1.5rem;font-weight:800;line-height:1.2;}
  #loanTabContent .ln-sub{font-size:.82rem;opacity:.92;margin-top:4px;}
  #loanTabContent .ln-art{font-size:3.2rem;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.25));}
  #loanTabContent .ln-sheet{margin-top:-18px;position:relative;}
  #loanTabContent .ln-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;border:1px solid var(--border, rgba(128,128,128,.3));background:var(--card-bg, rgba(20,30,48,.95));color:inherit;font-weight:700;cursor:pointer;margin:0 0 12px 6px;position:relative;}
  #loanTabContent .ln-pill .ln-dot{position:absolute;top:6px;right:8px;width:9px;height:9px;border-radius:50%;background:#ef4444;display:none;}
  #loanTabContent .ln-card{background:rgba(128,128,128,.10);border:1px solid var(--border, rgba(128,128,128,.25));border-radius:20px;padding:18px;margin-bottom:14px;}
  #loanTabContent .ln-card-h{font-weight:800;font-size:1rem;display:flex;align-items:center;gap:8px;margin-bottom:12px;}
  #loanTabContent .ln-info{display:inline-flex;width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(128,128,128,.6);align-items:center;justify-content:center;font-size:.78rem;opacity:.8;cursor:pointer;}
  #loanTabContent .ln-amount{background:rgba(128,128,128,.14);border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;}
  #loanTabContent .ln-amount .ln-amt{font-size:2.1rem;font-weight:800;letter-spacing:.5px;cursor:pointer;}
  #loanTabContent .ln-amount input{font-size:2.1rem;font-weight:800;width:150px;background:transparent;border:0;border-bottom:2px solid #7ac142;color:inherit;outline:none;}
  #loanTabContent .ln-edit{background:none;border:0;color:inherit;opacity:.6;font-size:1.3rem;cursor:pointer;}
  #loanTabContent .ln-limit{font-size:.84rem;opacity:.75;margin:10px 6px 8px;}
  #loanTabContent .ln-slider{width:100%;accent-color:#7ac142;height:28px;}
  #loanTabContent .ln-range{display:flex;justify-content:space-between;font-weight:700;font-size:.9rem;padding:0 2px 10px;}
  #loanTabContent .ln-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 2px;border-top:1px solid var(--border, rgba(128,128,128,.25));font-size:.9rem;}
  #loanTabContent .ln-row .ln-v{font-weight:800;font-size:1.05rem;text-align:right;}
  #loanTabContent .ln-months{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:62%;}
  #loanTabContent .ln-chip{padding:5px 11px;border-radius:999px;border:1px solid var(--border, rgba(128,128,128,.35));background:transparent;color:inherit;font-weight:700;font-size:.82rem;cursor:pointer;}
  #loanTabContent .ln-chip.on{background:#7ac142;border-color:#7ac142;color:#10260a;}
  #loanTabContent .ln-reason{width:100%;border-radius:12px;border:1px solid var(--border, rgba(128,128,128,.3));background:rgba(128,128,128,.08);color:inherit;padding:10px 12px;font-family:inherit;margin-top:10px;}
  #loanTabContent .ln-terms{font-size:.78rem;opacity:.8;margin:12px 2px;line-height:1.6;}
  #loanTabContent .ln-terms a{color:#7ac142;font-weight:700;cursor:pointer;text-decoration:none;}
  #loanTabContent .ln-btn, #loanTermsModal .ln-btn{width:100%;padding:15px;border-radius:14px;border:0;background:#7ac142;color:#10260a;font-size:1.05rem;font-weight:800;cursor:pointer;}
  #loanTabContent .ln-btn:disabled{opacity:.45;cursor:not-allowed;}
  #loanTabContent .ln-elig{font-size:.82rem;font-weight:700;margin:-4px 0 12px;}
  #loanTabContent .ln-err{display:none;color:#ef4444;font-size:.82rem;margin:8px 2px 0;}
  #loanTermsModal{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:flex-end;justify-content:center;}
  #loanTermsModal .ln-sheetm{background:#0f1b2d;color:#e8eef5;border-radius:20px 20px 0 0;padding:18px 20px 26px;width:min(520px,100%);max-height:80vh;overflow:auto;}
  `;

  /* ---------- សមាសភាព ---------- */
  let state = { amount: LOAN_MIN, months: 3, available: 0, maxLimit: 0, outstanding: 0, eligible: false, days: 0, view: 'main', editing: false, basis: null };

  function inject() {
    if ($('loanTabContent')) return;
    const host = $('leaveTabContent');
    if (!host || !host.parentNode) return;
    if (!$('loanStyles')) { const st = document.createElement('style'); st.id = 'loanStyles'; st.textContent = CSS; document.head.appendChild(st); }

    const tab = document.createElement('div');
    tab.id = 'loanTabContent';
    tab.className = 'tab-content';
    tab.innerHTML = `
      <div class="ln-hero">
        <div><div class="ln-title">ប្រាក់កម្ចី</div><div class="ln-sub">ស្នើសុំលឿន · គ្មានការប្រាក់ · កាត់ពីប្រាក់ខែស្វ័យប្រវត្តិ</div></div>
        <div class="ln-art">💰</div>
      </div>
      <div class="ln-sheet">
        <button type="button" class="ln-pill" id="loanHistBtn"><span id="loanHistIco">📅</span><span id="loanHistLbl">ប្រវត្តិកម្ចី</span><span class="ln-dot" id="loanDot"></span></button>

        <div id="loanMainView">
          <div id="loanSummary"></div>
          <div class="ln-card">
            <div class="ln-card-h">កម្ចីបុគ្គលិក <span class="ln-info" id="loanInfoBtn">i</span></div>
            <div class="ln-elig" id="loanEligible"></div>
            <div class="ln-amount" id="loanAmountBox"></div>
            <div class="ln-limit">ទំហំកម្ចីបានច្រើនបំផុត : <b id="loanLimitTxt">-</b><div id="loanBasisTxt" style="font-size:.74rem;opacity:.75;margin-top:2px;"></div></div>
            <input type="range" class="ln-slider" id="loanSlider" min="${LOAN_MIN}" max="${LOAN_MIN}" step="${LOAN_STEP}" value="${LOAN_MIN}">
            <div class="ln-range"><span id="loanMinTxt">${usd0(LOAN_MIN)}</span><span id="loanMaxTxt">-</span></div>

            <div class="ln-row"><span>រយៈពេលសង</span><div class="ln-months" id="loanMonthChips"></div></div>
            <div class="ln-row"><span>ត្រូវកាត់ក្នុងមួយខែ</span><span class="ln-v" id="loanMonthly">-</span></div>
            <div class="ln-row"><span>ចំនួនប្រាក់ទទួលបាន <small style="opacity:.6;">(គ្មានកម្រៃសេវា)</small></span><span class="ln-v" id="loanReceive">-</span></div>

            <textarea class="ln-reason" id="loanReason" rows="2" placeholder="មូលហេតុនៃការខ្ចី (ចាំបាច់)"></textarea>
            <div class="ln-err" id="loanError"></div>
            <div class="ln-terms">ចុច "ស្នើសុំប្រាក់កម្ចីឥឡូវនេះ" មានន័យថាអ្នកបានយល់ព្រមលើ <a id="loanTermsLink">ខចែង និងលក្ខខណ្ឌ</a> ដែលមាន ហើយត្រូវរង់ចាំការអនុម័តពី Admin។</div>
            <button type="button" class="ln-btn" id="loanSubmitBtn">ស្នើសុំប្រាក់កម្ចីឥឡូវនេះ</button>
          </div>
        </div>

        <div id="loanHistView" style="display:none;">
          <div class="ln-card"><div class="ln-card-h">កម្ចីរបស់ខ្ញុំ</div><div id="loanList"></div></div>
        </div>
      </div>`;
    host.parentNode.insertBefore(tab, host.nextSibling);

    // ប៊ូតុងក្នុងម៉ឺនុយទំព័រដើម (បន្ទាប់ពី "ប្រាក់ខែ")
    const payBtn = document.querySelector('#homeTabContent .menu-row[data-go="payroll"]');
    if (payBtn && !document.querySelector('#homeTabContent .menu-row[data-go="loan"]')) {
      const b = document.createElement('button');
      b.className = 'menu-row'; b.dataset.go = 'loan'; b.style.setProperty('--c', '#7ac142');
      b.innerHTML = '<span class="menu-ico">💳</span><span class="lbl">ប្រាក់កម្ចី</span><span class="go">›</span>';
      b.addEventListener('click', () => switchEmpTab('loan'));
      payBtn.insertAdjacentElement('afterend', b);
    }

    $('loanHistBtn').onclick = () => setView(state.view === 'main' ? 'hist' : 'main');
    $('loanInfoBtn').onclick = showTerms;
    $('loanTermsLink').onclick = showTerms;
    $('loanSubmitBtn').onclick = submitLoan;
    $('loanSlider').addEventListener('input', e => { state.amount = parseInt(e.target.value, 10); state.editing = false; draw(); });
    $('loanMonthChips').addEventListener('click', e => {
      const c = e.target.closest('.ln-chip'); if (!c) return;
      state.months = parseInt(c.dataset.m, 10); draw();
    });
    $('loanAmountBox').addEventListener('click', e => {
      if (state.eligible && (e.target.closest('.ln-edit') || e.target.closest('.ln-amt'))) {
        state.editing = true; draw(); const i = $('loanAmountInput'); if (i) { i.focus(); i.select(); }
      }
    });
  }

  function setView(v) {
    state.view = v;
    $('loanMainView').style.display = v === 'main' ? '' : 'none';
    $('loanHistView').style.display = v === 'hist' ? '' : 'none';
    $('loanHistIco').textContent = v === 'main' ? '📅' : '←';
    $('loanHistLbl').textContent = v === 'main' ? 'ប្រវត្តិកម្ចី' : 'ត្រឡប់ទៅស្នើសុំ';
  }

  function clampAmount(v) {
    if (!(v > 0)) v = LOAN_MIN;
    return Math.max(LOAN_MIN, Math.min(Math.floor(v), Math.max(LOAN_MIN, state.available)));
  }

  /* គូរតម្លៃបច្ចុប្បន្នលើអេក្រង់ */
  function draw() {
    if (!$('loanAmountBox')) return;
    const can = state.eligible && state.available >= LOAN_MIN;
    state.amount = clampAmount(state.amount);
    const monthly = Math.floor((state.amount / state.months) * 100) / 100;

    $('loanAmountBox').innerHTML = state.editing
      ? `<input id="loanAmountInput" type="number" min="${LOAN_MIN}" max="${state.available}" value="${state.amount}"><span style="opacity:.6;">$</span>`
      : `<span class="ln-amt">${usd0(state.amount)}</span><button type="button" class="ln-edit" aria-label="កែ">✎</button>`;
    const inp = $('loanAmountInput');
    if (inp) {
      const commit = () => { state.amount = clampAmount(parseFloat(inp.value)); state.editing = false; draw(); };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    }
    $('loanLimitTxt').textContent = state.maxLimit > 0 ? usd(state.available) + (state.outstanding > 0 ? ` (ដកបំណុល/សំណើ ${usd(state.outstanding)})` : '') : 'មិនទាន់កំណត់';
    $('loanBasisTxt').textContent = state.basis ? `គណនាពីប្រាក់ខែសរុបខែ ${state.basis.month}៖ ${usd(state.basis.pay)}${LOAN_PAY_RATIO !== 1 ? ' × ' + LOAN_PAY_RATIO : ''}` : '';
    const sl = $('loanSlider');
    sl.min = LOAN_MIN; sl.max = Math.max(LOAN_MIN, state.available); sl.value = state.amount; sl.disabled = !can;
    $('loanMaxTxt').textContent = usd0(Math.max(LOAN_MIN, state.available));
    $('loanMonthChips').innerHTML = MONTH_CHOICES.map(m => `<button type="button" class="ln-chip${m === state.months ? ' on' : ''}" data-m="${m}">${m} ខែ</button>`).join('');
    $('loanMonthly').textContent = usd(monthly);
    $('loanReceive').textContent = usd(state.amount);
    $('loanSubmitBtn').disabled = !can;
  }

  // ប្រាក់ខែសរុបប្រចាំខែ (មុនកាត់ = ប្រាក់សរុប TotalPay ក្នុង Payslip) ដែលប្រើជាមូលដ្ឋានគណនាទំហំកម្ចី៖
  // យកខែមុន (ខែពេញ) បើមានថ្ងៃធ្វើការ បើគ្មាន → យកខែនេះរហូតដល់ពេលនេះ។ ប្រាក់កាត់កម្ចីត្រូវបូកត្រឡប់ ដើម្បីកុំឱ្យកម្ចីបន្ថយទំហំកម្ចីខ្លួនឯង
  async function monthlyPayBasis() {
    const cur = monthNow();
    for (const m of [addMonths(cur, -1), cur]) {
      try {
        const t = await summarizeMonth(m);
        if (t && t.workDays > 0) {
          const pay = (t.net || 0) + (t.deductionsUSD || 0);     // = ប្រាក់សរុប (មុនកាត់ទាំងអស់ រួមទាំងប្រាក់កម្ចី ដូច្នេះកម្ចីមិនបន្ថយទំហំខ្លួនឯង)
          if (pay > 0) return { month: m, pay: Math.round(pay * 100) / 100 };
        }
      } catch (e) { console.warn('monthlyPayBasis', m, e); }
    }
    return null;
  }

  async function workedDays() {
    const session = getSession();
    const { count, error } = await supabaseClient.from('attendance').select('date', { count: 'exact', head: true })
      .eq('employee_id', session.id).eq('status', 'present');
    if (error) throw error;
    return count || 0;
  }

  function showTerms() {
    const old = $('loanTermsModal'); if (old) old.remove();
    const m = document.createElement('div');
    m.id = 'loanTermsModal';
    m.innerHTML = `<div class="ln-sheetm">
      <div style="font-weight:800;font-size:1.05rem;margin-bottom:10px;">ខចែង និងលក្ខខណ្ឌកម្ចី</div>
      <ul style="margin:0 0 14px 18px;padding:0;line-height:1.9;font-size:.88rem;">
        <li>ត្រូវធ្វើការបានយ៉ាងតិច <b>${MIN_WORK_DAYS} ថ្ងៃ</b> ទើបស្នើសុំកម្ចីបាន</li>
        <li>កម្ចីតិចបំផុត ${usd0(LOAN_MIN)} · ច្រើនបំផុតមិនលើស <b>${LOAN_PAY_RATIO === 1 ? 'ប្រាក់ខែសរុបប្រចាំខែ' : LOAN_PAY_RATIO + ' ដងនៃប្រាក់ខែសរុបប្រចាំខែ'}</b>${LOAN_CAP > 0 ? ` ហើយមិនលើស ${usd0(LOAN_CAP)}` : ''} (ដកបំណុលដែលកំពុងសង)</li>
        <li><b>គ្មានការប្រាក់</b> និងគ្មានកម្រៃសេវា ចំនួនប្រាក់ទទួលបាន = ចំនួនដែលអនុម័ត</li>
        <li>ប្រាក់ត្រូវកាត់ពីប្រាក់ខែរាល់ខែ <b>ស្មើៗគ្នា</b> ចាប់ពីខែដែល Admin កំណត់ រហូតដល់អស់បំណុល (សងអតិបរមា ${MAX_MONTHS} ខែ)</li>
        <li>មានសំណើរង់ចាំបានតែមួយក្នុងពេលតែមួយ ហើយទាល់តែ Admin អនុម័ត ទើបមានប្រសិទ្ធភាព</li>
        <li>ការកាត់នឹងលេចក្នុងប្រាក់ខែ និង Payslip ជា "ប្រាក់កម្ចី"</li>
      </ul>
      <button type="button" class="ln-btn" id="loanTermsClose">យល់ព្រម</button></div>`;
    document.body.appendChild(m);
    $('loanTermsClose').onclick = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  }

  async function submitLoan() {
    const err = $('loanError'); err.style.display = 'none';
    const session = getSession();
    const reason = $('loanReason').value.trim();
    const fail = m => { err.textContent = m; err.style.display = 'block'; };
    const amount = clampAmount(state.amount), months = state.months;
    if (!reason) return fail('សូមបញ្ចូលមូលហេតុនៃការខ្ចី');
    $('loanSubmitBtn').disabled = true;
    try {
      const d = await workedDays();
      if (d < MIN_WORK_DAYS) { await refresh(); return fail(`អ្នកត្រូវធ្វើការបានយ៉ាងតិច ${MIN_WORK_DAYS} ថ្ងៃ (បច្ចុប្បន្ន ${d} ថ្ងៃ)`); }
      const { data: pend } = await supabaseClient.from('loans').select('id').eq('employee_id', session.id).eq('status', 'pending').limit(1);
      if (pend && pend.length) return fail('អ្នកមានសំណើកម្ចីកំពុងរង់ចាំការអនុម័តរួចហើយ');
      const { error } = await supabaseClient.from('loans').insert({ employee_id: session.id, amount, months, reason, status: 'pending', created_by: 'employee' });
      if (error) return fail('ដាក់សំណើមិនបាន៖ ' + error.message);
      $('loanReason').value = '';
      alertMsg('✅ បានដាក់សំណើកម្ចី ត្រូវរង់ចាំការអនុម័តពី Admin');
      await refresh(); setView('hist');
    } catch (e) { console.error(e); fail('មានបញ្ហា សូមព្យាយាមម្តងទៀត'); }
    finally { draw(); }
  }

  async function deleteLoan(id) {
    if (!(await confirmMsg('លុបសំណើកម្ចីនេះ?'))) return;
    const { error } = await supabaseClient.from('loans').delete().eq('id', id).eq('status', 'pending');
    if (error) { alertMsg('លុបមិនបាន៖ ' + error.message); return; }
    await refresh();
  }

  const BADGE = { pending: ['កំពុងរង់ចាំ', '#f59e0b'], approved: ['អនុម័ត', '#10b981'], rejected: ['បដិសេធ', '#ef4444'], cancelled: ['បញ្ឈប់', '#94a3b8'] };

  /* ផ្ទុកទិន្នន័យ + គណនាទំហំកម្ចី + គូរបញ្ជី */
  async function refresh() {
    inject();
    const list = $('loanList'), sum = $('loanSummary');
    if (!list) return;
    const session = getSession();
    const { data, error } = await supabaseClient.from('loans').select('*').eq('employee_id', session.id).order('created_at', { ascending: false });
    if (error) { list.innerHTML = '<div class="hist-empty">មិនអាចផ្ទុកទិន្នន័យបានទេ</div>'; sum.innerHTML = ''; return; }
    const loansArr = data || [];

    // ទំហំកម្ចី = ប្រាក់ខែសរុបប្រចាំខែ × ratio − បំណុលកំពុងសង − សំណើរង់ចាំ
    state.basis = await monthlyPayBasis();
    const basePay = state.basis ? state.basis.pay : 0;
    let maxLimit = Math.floor((basePay * LOAN_PAY_RATIO) / LOAN_STEP) * LOAN_STEP;
    if (LOAN_CAP > 0) maxLimit = Math.min(maxLimit, LOAN_CAP);
    const active = loansArr.filter(l => l.status === 'approved' && !progress(l).finished);
    const outstanding = active.reduce((a, l) => a + progress(l).remaining, 0)
      + loansArr.filter(l => l.status === 'pending').reduce((a, l) => a + Number(l.amount), 0);
    state.maxLimit = maxLimit;
    state.outstanding = Math.round(outstanding * 100) / 100;
    state.available = Math.max(0, Math.floor((maxLimit - outstanding) / LOAN_STEP) * LOAN_STEP);

    // លក្ខខណ្ឌថ្ងៃធ្វើការ
    const elig = $('loanEligible');
    try {
      state.days = await workedDays();
      state.eligible = state.days >= MIN_WORK_DAYS;
      elig.style.color = state.eligible ? '#10b981' : '#f59e0b';
      elig.textContent = state.eligible
        ? `✅ អ្នកមានថ្ងៃធ្វើការ ${state.days} ថ្ងៃ — មានសិទ្ធិស្នើសុំកម្ចី`
        : `⚠️ អ្នកមានថ្ងៃធ្វើការ ${state.days} ថ្ងៃ — នៅខ្វះ ${MIN_WORK_DAYS - state.days} ថ្ងៃ ទើបស្នើសុំបាន`;
      if (state.eligible && state.available < LOAN_MIN) {
        elig.style.color = '#f59e0b';
        elig.textContent = basePay > 0 ? '⚠️ ទំហំកម្ចីរបស់អ្នកពេញហើយ (បំណុល/សំណើបច្ចុប្បន្នដល់កំណត់)' : '⚠️ មិនទាន់មានប្រាក់ខែសរុបសម្រាប់គណនាទំហំកម្ចី';
      }
    } catch (e) { state.eligible = false; elig.style.color = '#f59e0b'; elig.textContent = 'មិនអាចពិនិត្យថ្ងៃធ្វើការបានទេ'; }

    // ចំណុចក្រហមលើ "ប្រវត្តិកម្ចី" បើមានសំណើរង់ចាំ
    $('loanDot').style.display = loansArr.some(l => l.status === 'pending') ? 'block' : 'none';

    // កាតសង្ខេប
    const cur = monthNow();
    const remaining = active.reduce((a, l) => a + progress(l).remaining, 0);
    const thisMonth = active.reduce((a, l) => a + (schedule(l).find(s => s.month === cur)?.amount || 0), 0);
    sum.innerHTML = active.length ? `
      <div class="ln-card" style="display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap;">
        <div><div style="font-size:.74rem;opacity:.7;">បំណុលនៅសល់</div><div style="font-size:1.35rem;font-weight:800;">${usd(remaining)}</div></div>
        <div><div style="font-size:.74rem;opacity:.7;">កាត់ខែនេះ (${cur})</div><div style="font-size:1.35rem;font-weight:800;">${usd(thisMonth)}</div></div>
      </div>` : '';

    // បញ្ជីកម្ចី
    if (!loansArr.length) { list.innerHTML = '<div class="hist-empty">មិនទាន់មានកម្ចីទេ</div>'; }
    else list.innerHTML = loansArr.map(l => {
      const [label, color] = BADGE[l.status] || [l.status, '#94a3b8'];
      let extra = '';
      if (l.status === 'approved') {
        const p = progress(l), pct = Math.round((p.doneCount / l.months) * 100);
        extra = `<div style="font-size:.78rem;margin-top:6px;">${p.finished ? '✅ សងរួចរាល់' : `នៅសល់ <b>${usd(p.remaining)}</b>`} · កាត់ ${p.doneCount}/${l.months} ខែ (ចាប់ពី ${l.start_month})</div>
          <div style="background:rgba(128,128,128,.25);border-radius:6px;height:7px;margin:6px 0;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#7ac142;"></div></div>
          <details><summary style="cursor:pointer;font-size:.76rem;">តារាងសង</summary>
            ${p.sch.map(s => `<div style="display:flex;justify-content:space-between;font-size:.76rem;padding:2px 0;opacity:${s.month < cur ? .55 : 1};"><span>${s.no}/${l.months} · ${s.month}</span><span>${usd(s.amount)}</span><span>${s.month < cur ? '✅' : (s.month === cur ? '🟡' : '⏳')}</span></div>`).join('')}
          </details>`;
      } else if (l.admin_note) {
        extra = `<div style="font-size:.76rem;margin-top:4px;opacity:.7;">${esc(l.admin_note)}</div>`;
      }
      const del = l.status === 'pending' ? `<div style="margin-top:6px;"><button type="button" onclick="employeeLoan.remove('${l.id}')" style="padding:3px 10px;border-radius:8px;border:1px solid var(--border, rgba(128,128,128,.3));background:transparent;color:inherit;font-size:.72rem;cursor:pointer;">🗑 លុបសំណើ</button></div>` : '';
      return `<div style="padding:10px 0;border-top:1px solid var(--border, rgba(128,128,128,.25));">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div><b>${usd(l.amount)}</b> · ${l.months} ខែ<div style="font-size:.74rem;opacity:.7;">${esc(l.reason || '')} · ${String(l.created_at || '').slice(0, 10)}</div></div>
          <span style="flex:0 0 auto;padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:700;background:${color}22;color:${color};">${label}</span>
        </div>${extra}${del}</div>`;
    }).join('');

    draw();
  }

  async function renderLoanEmp() { inject(); setView('main'); await refresh(); }

  window.employeeLoan = { render: renderLoanEmp, remove: deleteLoan, inject };
  window.renderLoanEmp = renderLoanEmp;

  if (document.readyState !== 'loading') inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
