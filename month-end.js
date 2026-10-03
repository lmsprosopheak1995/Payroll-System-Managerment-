/* ==========================================================================
   month-end.js — សារ "ពិនិត្យប្រាក់ខែបុគ្គលិក" ពេលដល់ចុងខែ (Admin)
   • ពេលបើកកម្មវិធី ហើយជិតចប់ខែ (២ ថ្ងៃចុងក្រោយ) ឬខែមុនមិនទាន់បិទ (ក្នុង ១០ ថ្ងៃដំបូង)
     → បង្ហាញបញ្ជីត្រួតពិនិត្យ ដើម្បីកុំភ្លេចមុនបិទខែ/បើកប្រាក់ខែ
   • កាលវិភាគបើកប្រាក់ខែ៖ ដងទី១ ថ្ងៃ 25 (ប្រាក់ខែទី១) · ដងទី២ ថ្ងៃទី 10 នៃខែបន្ទាប់ (សៅរ៍/អាទិត្យ/ថ្ងៃបុណ្យ → ថយទៅថ្ងៃធ្វើការមុន) — បង្ហាញថ្ងៃនៅសល់ក្នុងសារ
   • ពិនិត្យ៖ ខែមិនទាន់បិទ · ថ្ងៃមិនទាន់កត់វត្តមាន · ប្រាក់កាត់យឺត/ច្បាប់មិនទាន់បញ្ចូល ·
              សំណើច្បាប់/ពាក្យតវ៉ាមិនទាន់សម្រេច · គ្មានប្រាក់ខែមូលដ្ឋាន · ប្រាក់ខែសុទ្ធ ≤ 0
   • ប៊ូតុង "🔔 ពិនិត្យចុងខែ" ក្នុងផ្ទាំងប្រាក់ខែប្រចាំខែ — បើកមើលបានគ្រប់ពេល (ខែដែលបានជ្រើស)
   • មិនប្រើ localStorage — "ពេលក្រោយ" ចងចាំតែក្នុងវគ្គបច្ចុប្បន្ន (បើកកម្មវិធីថ្មី នឹងបង្ហាញម្តងទៀត)

   ដំឡើង៖ index.html ដាក់ក្រោម script.js (ត្រូវនៅក្រោម ព្រោះរុំ renderAll)៖  <script src="month-end.js"></script>
   មិនត្រូវការ SQL · លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ========================================================================== */
(function () {
  'use strict';

  const REMIND_LAST_DAYS = 2;   // បង្ហាញចាប់ពី N ថ្ងៃចុងក្រោយនៃខែ
  const GRACE_DAYS = 10;        // ខែមុនមិនទាន់បិទ → បន្តរំលឹកដល់ថ្ងៃទី N នៃខែថ្មី
  const RECHECK_MS = 30 * 60 * 1000;

  const shown = new Set();      // ខែដែលបានបង្ហាញរួចក្នុងវគ្គនេះ (memory ប៉ុណ្ណោះ)
  let panel = null;

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const pad = n => String(n).padStart(2, '0');
  const prevMonthOf = m => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const dim = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };

  // ខែដែលត្រូវរំលឹក (ឬ null)
  function targetMonth() {
    const t = todayStr(), cur = t.slice(0, 7), day = parseInt(t.slice(8, 10), 10);
    if (day >= dim(cur) - REMIND_LAST_DAYS + 1) return cur;
    if (day <= GRACE_DAYS) { const prev = prevMonthOf(cur); if (!isMonthLocked(prev)) return prev; }
    return null;
  }

  const nextMonthOf = m => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const holidayName = d => (typeof holidays !== 'undefined' && holidays && holidays[d] !== undefined) ? (holidays[d] || 'ថ្ងៃបុណ្យ') : null;
  const isOffDay = d => { const w = new Date(d + 'T00:00:00').getDay(); return w === 0 || w === 6 || holidayName(d) !== null; };
  const shiftDay = (d, k) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + k); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
  const rollBack = d => { let x = d, n = 0; while (isOffDay(x) && n < 14) { x = shiftDay(x, -1); n++; } return x; };   // សៅរ៍/អាទិត្យ/ថ្ងៃបុណ្យ → ថយទៅថ្ងៃធ្វើការមុនគេ
  const offWhy = d => { const h = holidayName(d); if (h !== null) return 'ថ្ងៃបុណ្យ ' + h; const w = new Date(d + 'T00:00:00').getDay(); return w === 6 ? 'សៅរ៍' : (w === 0 ? 'អាទិត្យ' : ''); };
  const whenTxt = d => d > 0 ? `នៅសល់ ${d} ថ្ងៃ` : (d === 0 ? 'ថ្ងៃនេះ' : `ហួសកំណត់ ${-d} ថ្ងៃ`);

  // ---------------------------------------------------------------- ការត្រួតពិនិត្យ ----
  function runChecks(month) {
    const dates = daysInMonth(month);
    const first = dates[0], last = dates[dates.length - 1];
    const locked = isMonthLocked(month);
    const ended = todayStr() > last;
    const emps = payrollEmployeesForMonth(month);
    const active = emps.filter(e => e.status === 'active');
    const items = [];
    const names = (arr, f) => { const n = arr.map(f || (e => e.name)); return n.slice(0, 6).join(', ') + (n.length > 6 ? ` …(+${n.length - 6})` : ''); };

    if (typeof loadFailures !== 'undefined' && Object.keys(loadFailures).length)
      items.push({ lvl: 'bad', text: 'ទិន្នន័យខ្លះផ្ទុកមិនជោគជ័យ — លេខខាងក្រោមអាចមិនពេញលេញ', detail: Object.keys(loadFailures).join(', ') });

    // កាលវិភាគបើកប្រាក់ ២ ដង
    // ថ្ងៃទី 10 នៃខែបន្ទាប់ · សៅរ៍ → 9 · អាទិត្យ → 8 · ថ្ងៃបុណ្យ → ថយទៅថ្ងៃធ្វើការមុនគេ
    const finalBase = nextMonthOf(month) + '-10';
    const finalDate = rollBack(finalBase);
    const dLeft = dayDiff(finalDate, todayStr());
    items.push({ lvl: locked || dLeft > 3 ? 'info' : (dLeft < 0 ? 'bad' : 'warn'),
      text: `ប្រាក់ខែទី២ (នៅសល់) បើកថ្ងៃ (${finalDate}${finalDate !== finalBase ? ` — ថ្ងៃទី 10 ត្រូវ${offWhy(finalBase)} ប្តូរមកមុន` : ''}) · ${whenTxt(dLeft)}`,
      detail: locked ? 'ខែបានបិទរួច — អាចបើកតាមធនាគារបាន' : 'ត្រូវបិទខែ ហើយបើកតាមធនាគារ មុនថ្ងៃនេះ' });
    {
      const advBase = month + '-25', advDate = (typeof advanceDateOf === 'function' ? advanceDateOf(month) : rollBack(advBase)), dAdv = dayDiff(advDate, todayStr());
      if (dAdv >= -2) items.push({ lvl: 'info', text: `ប្រាក់ខែទី១ បើកថ្ងៃ (${advDate}${advDate !== advBase ? ` — ថ្ងៃទី 25 ត្រូវ${offWhy(advBase)} ប្តូរមកមុន` : ''}) · ${whenTxt(dAdv)}` });
    }

    if (locked) items.push({ lvl: 'ok', text: `ខែ ${month} បានបិទរួចរាល់` });
    else items.push({ lvl: 'warn', text: ended ? `ខែ ${month} ចប់ហើយ ប៉ុន្តែមិនទាន់បិទ` : `ខែ ${month} ជិតចប់ — មិនទាន់បិទ` });

    if (!locked) {
      const unmarked = active.map(e => ({ e, n: countUnmarkedDays(e, month) })).filter(x => x.n > 0);
      if (unmarked.length) items.push({ lvl: 'warn', text: `បុគ្គលិក ${unmarked.length} នាក់មានថ្ងៃមិនទាន់កត់វត្តមាន`, detail: names(unmarked, x => `${x.e.name} (${x.n})`) });

      const pend = active.filter(e => {
        const tot = calcDeductionRow(e, month).total;
        if (!(tot > 0)) return false;
        const ap = payrollItems.find(p => p.id === dedItemId(e.id, month));
        return !ap || Math.abs(payrollItemToUSD(ap) - tot) > 0.0001;
      });
      if (pend.length) items.push({ lvl: 'warn', text: `បុគ្គលិក ${pend.length} នាក់មានប្រាក់កាត់យឺត/ច្បាប់ មិនទាន់បញ្ចូល`, detail: names(pend) });
    }

    const pendLeave = (typeof leaveRequests !== 'undefined' ? leaveRequests : []).filter(r => r.status === 'pending' && r.start_date <= last && r.end_date >= first);
    if (pendLeave.length) items.push({ lvl: 'warn', text: `សំណើច្បាប់ ${pendLeave.length} មិនទាន់សម្រេច (ក្នុងខែនេះ)`, detail: names(pendLeave, r => { const e = employees.find(x => x.id === r.employee_id); return e ? e.name : r.employee_id; }) });
    const disputes = typeof pendingDisputeCount === 'function' ? pendingDisputeCount() : 0;
    if (disputes) items.push({ lvl: 'warn', text: `ពាក្យតវ៉ាប្រាក់ខែ ${disputes} មិនទាន់ឆ្លើយតប` });

    const noSalary = active.filter(e => !(parseFloat(e.salary) > 0));
    if (noSalary.length) items.push({ lvl: 'warn', text: `បុគ្គលិក ${noSalary.length} នាក់មិនទាន់កំណត់ប្រាក់ខែមូលដ្ឋាន`, detail: names(noSalary) });

    let total = 0; const lowNet = [], absents = [];
    active.forEach(e => {
      const t = summarizeEmpMonth(e, month);
      total += Math.max(0, t.net || 0);
      if ((t.net || 0) <= 0) lowNet.push(e);
      if (t.absentDays > 0) absents.push({ e, n: t.absentDays });
    });
    if (lowNet.length) items.push({ lvl: 'warn', text: `ប្រាក់ខែសុទ្ធ ≤ 0 សម្រាប់ ${lowNet.length} នាក់ (សូមពិនិត្យ)`, detail: names(lowNet) });
    if (absents.length) items.push({ lvl: 'info', text: `មានអវត្តមាន ${absents.length} នាក់`, detail: names(absents, x => `${x.e.name} (${x.n})`) });

    const warns = items.filter(i => i.lvl === 'warn' || i.lvl === 'bad').length;
    if (!warns && locked) items.push({ lvl: 'ok', text: 'គ្មានចំណុចត្រូវពិនិត្យបន្ថែម' });
    return { month, locked, ended, items, warns, count: active.length, total };
  }

  // ---------------------------------------------------------------- UI ----
  const CSS = `
.me-ovl{position:fixed;inset:0;z-index:9960;background:rgba(8,16,28,.5);display:none;align-items:center;justify-content:center;padding:16px}
.me-ovl.open{display:flex}
.me-box{width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);box-shadow:0 24px 64px rgba(15,27,45,.35)}
.me-head{padding:16px 18px 10px;border-bottom:1px solid var(--border,#e1e8ef)}
.me-head h2{margin:0;font-size:1.02rem}
.me-head p{margin:4px 0 0;font-size:.78rem;color:var(--text-muted,#5b6b80)}
.me-list{padding:10px 18px}
.me-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border,#e1e8ef);font-size:.84rem}
.me-item:last-child{border-bottom:0}
.me-ic{flex:0 0 22px;text-align:center}
.me-d{font-size:.72rem;color:var(--text-muted,#5b6b80);margin-top:2px;word-break:break-word}
.me-warn .me-t{color:#b45309;font-weight:600}.me-bad .me-t{color:#dc2626;font-weight:600}.me-ok .me-t{color:var(--success,#059669);font-weight:600}
.me-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 18px 16px;border-top:1px solid var(--border,#e1e8ef)}
@media print{.me-ovl{display:none!important}}
`;
  const ICON = { ok: '✓', warn: '⚠', bad: '✕', info: 'ℹ' };

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    panel = document.createElement('div');
    panel.className = 'me-ovl';
    panel.innerHTML = '<div class="me-box" role="dialog" aria-modal="true"><div class="me-head"><h2 id="meTitle"></h2><p id="meSub"></p></div><div class="me-list" id="meList"></div><div class="me-foot"><button class="secondary" id="meLater">ពេលក្រោយ</button><button id="meGo">➡ ពិនិត្យប្រាក់ខែប្រចាំខែ</button></div></div>';
    document.body.appendChild(panel);
    panel.querySelector('#meLater').addEventListener('click', close);
    panel.addEventListener('mousedown', e => { if (e.target === panel) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
    panel.querySelector('#meGo').addEventListener('click', () => {
      const m = panel.dataset.month;
      const input = document.getElementById('monthlyMonth');
      if (input && m) input.value = m;
      close();
      if (typeof showTab === 'function') showTab('monthly');
    });
  }
  function close() { if (panel) panel.classList.remove('open'); }

  function show(month, manual) {
    if (!panel) build();
    const r = runChecks(month);
    panel.dataset.month = month;
    panel.querySelector('#meTitle').textContent = `🔔 ពិនិត្យប្រាក់ខែបុគ្គលិក — ខែ ${month}`;
    panel.querySelector('#meSub').textContent = `${manual ? '' : (r.ended ? 'ចប់ខែហើយ — ' : 'ជិតចប់ខែ — ')}បុគ្គលិកសកម្ម ${r.count} នាក់ · ប្រាក់ខែសុទ្ធសរុប $${money(r.total)} · ចំណុចត្រូវពិនិត្យ ${r.warns}`;
    panel.querySelector('#meList').innerHTML = r.items.map(i =>
      `<div class="me-item me-${i.lvl === 'info' ? 'info' : i.lvl}"><span class="me-ic">${ICON[i.lvl]}</span><div><div class="me-t">${esc(i.text)}</div>${i.detail ? `<div class="me-d">${esc(i.detail)}</div>` : ''}</div></div>`).join('');
    panel.classList.add('open');
  }

  // បង្ហាញដោយស្វ័យប្រវត្តិ (ម្តងក្នុងមួយខែ ក្នុងមួយវគ្គ)
  function maybeAutoShow() {
    try {
      if (typeof getAdminSession === 'function' && !getAdminSession()) return;
      if (!employees.length) return;
      const m = targetMonth();
      if (!m || shown.has(m)) return;
      if (panel && panel.classList.contains('open')) return;
      const r = runChecks(m);
      shown.add(m);
      if (r.locked && !r.warns) return;   // បិទរួច ហើយគ្មានអ្វីត្រូវពិនិត្យ → មិនរំខាន
      show(m, false);
    } catch (e) { console.warn('month-end check failed', e); }
  }

  // ---------------------------------------------------------------- init ----
  // រុំ renderAll (ហៅក្រោមពេលទិន្នន័យផ្ទុករួច) ដើម្បីដឹងថាទិន្នន័យរួចរាល់
  let hooked = false;
  if (typeof window.renderAll === 'function') {
    const orig = window.renderAll;
    window.renderAll = function () {
      const out = orig.apply(this, arguments);
      if (!hooked) { hooked = true; setTimeout(maybeAutoShow, 2500); }
      return out;
    };
  }
  setInterval(maybeAutoShow, RECHECK_MS);

  function addButton() {
    if (document.getElementById('monthlyEndCheckBtn')) return;
    const anchor = document.getElementById('monthlyFullBtn') || document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyEndCheckBtn'; btn.type = 'button';
    btn.textContent = '🔔 ពិនិត្យចុងខែ';
    btn.addEventListener('click', () => show((typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7), true));
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();

  window.openMonthEndCheck = m => show(m || todayStr().slice(0, 7), true);
})();
