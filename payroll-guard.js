/* ==========================================================================
   payroll-guard.js — 🛡 ឆ្មាំប្រាក់ខែ (Payroll Guard) · ការត្រួតពិនិត្យលេខខុសប្រក្រតី · Admin
   ស្កេនប្រាក់ខែខែមួយ ហើយរកចំណុចគួរឱ្យសង្ស័យ មុនបិទខែ/បើកប្រាក់ ដោយប្រៀបធៀបជាមួយ ៣ ខែមុន៖
     🔴 ប្រាក់ខែសុទ្ធ ≤ 0 ទោះមានថ្ងៃធ្វើការ · ថ្ងៃធ្វើការលើសចំនួនថ្ងៃក្នុងខែ · គ្មានប្រាក់ខែមូលដ្ឋាន · អត្តលេខស្ទួន
     🟠 ប្រាក់ខែលោតខុសពីធម្មតា (> X%) · OT ច្រើនលើសកំណត់ · មានប្រាក់ខែតែ ០ ថ្ងៃធ្វើការ ·
        ប្រាក់កាត់លើស ៥០% · ថ្ងៃមិនទាន់កត់ · ឈ្មោះស្ទួន · ប្រាក់ខែទី១ មិនត្រូវ
     🔵 យឺតច្រើនដង · ប្រាក់ខែទី១ មិនទាន់ sync · ប្រាក់ខែសរុបផ្លាស់ប្តូរខ្លាំងពីខែមុន
   ផ្តល់ "ពិន្ទុសុខភាពប្រាក់ខែ" 0–100 · Export Excel · ចុច "📄" ទៅមើលលម្អិតបុគ្គលិកនោះ
   មិនកែទិន្នន័យអ្វីទាំងអស់ (អានតែប៉ុណ្ណោះ) · មិនប្រើ localStorage · មិនត្រូវការ SQL

   ដំឡើង៖ index.html ដាក់ក្រោម salary-tax.js៖  <script src="payroll-guard.js"></script>
   លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ========================================================================== */
(function () {
  'use strict';

  const WEIGHT = { high: 15, med: 6, info: 2 };
  let overlay = null, curMonth = '', findings = [], lastScan = null;
  let thrPct = 30, thrOt = 50;      // ត្រឹមវគ្គនេះ (memory ប៉ុណ្ណោះ)

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const shiftMonth = (m, d) => { let [y, mo] = m.split('-').map(Number); mo += d; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
  const LVL = { high: { ic: '🔴', t: 'ខ្ពស់', c: '#dc2626' }, med: { ic: '🟠', t: 'មធ្យម', c: '#b45309' }, info: { ic: '🔵', t: 'ព័ត៌មាន', c: '#0284c7' } };

  // ---------------------------------------------------------------- ស្កេន ----
  function scan(month, opts) {
    opts = opts || {};
    const pct = opts.pct != null ? opts.pct : thrPct, otMax = opts.ot != null ? opts.ot : thrOt;
    const out = [];
    const add = (lvl, e, title, detail) => out.push({ lvl, e, title, detail });
    const dates = daysInMonth(month), last = dates[dates.length - 1];
    const locked = isMonthLocked(month), ended = todayStr() > last;
    const emps = payrollEmployeesForMonth(month);
    const active = emps.filter(e => e.status === 'active');

    // ទិន្នន័យ ៣ ខែមុន
    const prevMonths = [1, 2, 3].map(k => shiftMonth(month, -k));
    const prevData = {};
    prevMonths.forEach(pm => {
      const ids = new Set(payrollEmployeesForMonth(pm).map(x => x.id));
      emps.forEach(e => {
        if (!ids.has(e.id)) return;
        try { const t = summarizeEmpMonth(e, pm); (prevData[e.id] = prevData[e.id] || []).push({ m: pm, t }); } catch (err) { /* ignore */ }
      });
    });

    let curNetSum = 0, prevNetSum = 0, prevCount = 0;
    active.forEach(e => {
      let t; try { t = summarizeEmpMonth(e, month); } catch (err) { return; }
      const net = t.net || 0, gross = (t.total || 0) + (t.benefitsUSD || 0);
      curNetSum += Math.max(0, net);

      if (!(parseFloat(e.salary) > 0)) add('high', e, 'គ្មានប្រាក់ខែមូលដ្ឋាន', 'ប្រាក់ខែមូលដ្ឋាន = 0 ឬទទេ');
      if (t.workDays > 0 && net <= 0) add('high', e, 'ប្រាក់ខែសុទ្ធ ≤ 0', `ធ្វើការ ${t.workDays} ថ្ងៃ ប៉ុន្តែប្រាក់ខែសុទ្ធ $${money(net)} (ប្រាក់កាត់ច្រើនពេក?)`);
      if (t.workDays > dates.length) add('high', e, 'ថ្ងៃធ្វើការលើសចំនួនថ្ងៃក្នុងខែ', `${t.workDays} ថ្ងៃ > ${dates.length} ថ្ងៃ`);
      if (t.workDays === 0 && net > 0 && (ended || locked)) add('med', e, 'មានប្រាក់ខែ តែ ០ ថ្ងៃធ្វើការ', `ប្រាក់ខែសុទ្ធ $${money(net)} (ប្រហែលមកពីអត្ថប្រយោជន៍ថេរ — សូមពិនិត្យ)`);
      if ((t.otHours || 0) > otMax) add('med', e, 'ម៉ោងថែម (OT) ច្រើនខុសធម្មតា', `${(+t.otHours).toFixed(1)} ម៉ោង > ${otMax} ម៉ោង`);
      if (gross > 0 && (t.deductionsUSD || 0) > gross * 0.5) add('med', e, 'ប្រាក់កាត់លើស ៥០% នៃប្រាក់ខែ', `កាត់ $${money(t.deductionsUSD)} ពី $${money(gross)} (${Math.round((t.deductionsUSD / gross) * 100)}%)`);
      if (t.lateDays >= 8) add('info', e, 'យឺតច្រើនដង', `${t.lateDays} ថ្ងៃ`);
      if (!locked) {
        const un = countUnmarkedDays(e, month);
        if (un > 0) add('med', e, 'មានថ្ងៃមិនទាន់កត់វត្តមាន', `${un} ថ្ងៃ`);
      }

      // ប្រៀបធៀបជាមួយ ៣ ខែមុន (តែពេលខែចប់/បិទ ទើបលេខពេញលេញ)
      const hist = (prevData[e.id] || []).filter(x => x.t.workDays > 0 && x.t.net > 0);
      if (hist.length) {
        const avg = hist.reduce((s, x) => s + x.t.net, 0) / hist.length;
        prevNetSum += avg; prevCount++;
        if ((ended || locked) && t.workDays > 0 && avg > 0) {
          const ch = ((net - avg) / avg) * 100;
          if (Math.abs(ch) > pct) add('med', e, `ប្រាក់ខែសុទ្ធ ${ch > 0 ? 'កើន' : 'ថយ'} ${Math.abs(Math.round(ch))}% ពីធម្មតា`,
            `ខែនេះ $${money(net)} · មធ្យម ${hist.length} ខែមុន $${money(avg)}`);
        }
      }

      // ប្រាក់ខែទី១ (Advance)
      if (!locked && typeof calcAdvanceRow === 'function' && typeof advItemId === 'function') {
        const a = calcAdvanceRow(e, month);
        const item = payrollItems.find(p => p.id === advItemId(e.id, month));
        if (item && (!a.eligible || !a.due || !(a.amount > 0))) add('med', e, 'កាត់ប្រាក់ខែទី១ តែមិនត្រូវ', `មានធាតុ $${money(item.amount)} ប៉ុន្តែ ${!a.eligible ? 'មិនមានសិទ្ធិ' : 'មិនទាន់ដល់ថ្ងៃទូទាត់'}`);
        else if (!item && a.eligible && a.due && a.amount > 0) add('info', e, 'ប្រាក់ខែទី១ មិនទាន់ sync', `ត្រូវកាត់ $${money(a.amount)} (នឹង sync ដោយស្វ័យប្រវត្តិ)`);
        else if (item && Math.abs(Number(item.amount) - a.amount) > 0.0001) add('med', e, 'ប្រាក់ខែទី១ ខុសពីច្បាប់', `ធាតុ $${money(item.amount)} ≠ ច្បាប់ $${money(a.amount)}`);
      }
    });

    // ស្ទួន
    const byName = {}, byUser = {};
    employees.filter(e => e.status === 'active').forEach(e => {
      const n = String(e.name || '').trim().toLowerCase(), u = String(e.username || '').trim().toLowerCase();
      if (n) (byName[n] = byName[n] || []).push(e);
      if (u) (byUser[u] = byUser[u] || []).push(e);
    });
    Object.values(byUser).filter(a => a.length > 1).forEach(a => a.forEach(e => add('high', e, 'អត្តលេខស្ទួន', `${e.username} ប្រើដោយ ${a.length} នាក់`)));
    Object.values(byName).filter(a => a.length > 1).forEach(a => a.forEach(e => add('med', e, 'ឈ្មោះស្ទួន', `"${e.name}" មាន ${a.length} ជួរ (បុគ្គលិកស្ទួន?)`)));

    // សរុប
    if ((ended || locked) && prevCount >= 2 && prevNetSum > 0) {
      const ch = ((curNetSum - prevNetSum) / prevNetSum) * 100;
      if (Math.abs(ch) > 20) add('info', null, `ប្រាក់ខែសរុបទាំងអស់ ${ch > 0 ? 'កើន' : 'ថយ'} ${Math.abs(Math.round(ch))}%`, `ខែនេះ $${money(curNetSum)} · មធ្យមខែមុន $${money(prevNetSum)}`);
    }

    const order = { high: 0, med: 1, info: 2 };
    out.sort((a, b) => order[a.lvl] - order[b.lvl] || String((a.e && a.e.name) || '').localeCompare(String((b.e && b.e.name) || '')));
    const high = out.filter(x => x.lvl === 'high').length, med = out.filter(x => x.lvl === 'med').length, info = out.filter(x => x.lvl === 'info').length;
    const score = Math.max(0, 100 - high * WEIGHT.high - med * WEIGHT.med - info * WEIGHT.info);
    return { month, findings: out, high, med, info, score, employees: active.length, ended, locked, total: curNetSum };
  }
  window.payrollGuardScan = (m, o) => scan(m, o);   // month-end.js ប្រើ

  // ---------------------------------------------------------------- UI ----
  const CSS = `
#customDialogOverlay{z-index:99999!important}
.pg-ovl{position:fixed;inset:0;z-index:9955;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.pg-ovl.open{display:flex}
.pg-box{width:100%;max-width:1060px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.pg-box h2{margin:0 0 4px;font-size:1.05rem}
.pg-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 6px}
.pg-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.pg-bar input,.pg-bar select{font-size:.8rem;padding:6px 8px}
.pg-bar label{font-size:.76rem;margin:0;display:flex;gap:6px;align-items:center}
.pg-top{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:10px 0}
.pg-gauge{--p:0;--c:#059669;width:104px;height:104px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--border,#e1e8ef) 0);display:grid;place-items:center;flex:0 0 104px}
.pg-gauge>div{width:80px;height:80px;border-radius:50%;background:var(--card-bg,#fff);display:grid;place-items:center;text-align:center;line-height:1.1}
.pg-gauge b{font-size:1.5rem;color:var(--c)}.pg-gauge small{font-size:.62rem;color:var(--text-muted,#5b6b80)}
.pg-chips{display:flex;gap:8px;flex-wrap:wrap}
.pg-chip{padding:8px 14px;border-radius:12px;border:1px solid var(--border,#e1e8ef);font-size:.82rem;cursor:pointer;background:var(--card-bg,#fff)}
.pg-chip.on{box-shadow:inset 0 0 0 2px var(--accent,#0d9488)}
.pg-chip b{font-size:1.1rem;display:block}
.pg-tbl td,.pg-tbl th{vertical-align:middle}
.pg-good{padding:22px;text-align:center;color:var(--success,#059669);font-weight:700;font-size:.95rem}
@media print{.pg-ovl{display:none!important}}
`;
  let filter = '';

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'pg-ovl';
    overlay.innerHTML = `
      <div class="pg-box" role="dialog" aria-modal="true">
        <h2>🛡 ឆ្មាំប្រាក់ខែ — ពិនិត្យលេខខុសប្រក្រតី <span id="pgMonthTxt" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="pg-note">ស្កេនប្រាក់ខែ ដោយប្រៀបធៀបជាមួយ ៣ ខែមុន ដើម្បីរកចំណុចគួរឱ្យសង្ស័យ មុនបិទខែ/បើកប្រាក់។ មិនកែទិន្នន័យអ្វីទេ — ជាការជូនដំណឹងប៉ុណ្ណោះ។</p>
        <div class="pg-bar">
          <button class="secondary" id="pgPrev">◀</button><input type="month" id="pgMonth"><button class="secondary" id="pgNext">▶</button>
          <label>ប្រាក់ខែលោត > <input type="number" id="pgPct" min="5" max="200" step="5" style="width:70px"> %</label>
          <label>OT > <input type="number" id="pgOt" min="0" step="5" style="width:70px"> ម៉ោង</label>
          <button id="pgRun">🔍 ស្កេនឡើងវិញ</button>
          <button class="secondary" id="pgXlsx">📊 Export Excel</button>
        </div>
        <div class="pg-top"><div class="pg-gauge" id="pgGauge"><div><span><b id="pgScore">–</b><br><small>/ 100</small></span></div></div>
          <div><div id="pgVerdict" style="font-weight:700;font-size:.95rem"></div><div class="pg-note" id="pgMeta" style="margin-top:4px"></div></div>
          <div class="pg-chips" id="pgChips"></div></div>
        <div class="table-wrap" style="max-height:46vh;overflow:auto"><table class="pg-tbl">
          <thead><tr><th>កម្រិត</th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ចំណុច</th><th>ព័ត៌មានលម្អិត</th><th></th></tr></thead>
          <tbody id="pgBody"></tbody></table></div>
        <div class="pg-bar" style="justify-content:flex-end;margin-bottom:0"><button class="secondary" id="pgClose">បិទ</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector('#' + id);
    $('pgClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    $('pgMonth').addEventListener('change', e => setMonth(e.target.value));
    $('pgPrev').addEventListener('click', () => setMonth(shiftMonth(curMonth, -1)));
    $('pgNext').addEventListener('click', () => setMonth(shiftMonth(curMonth, 1)));
    $('pgRun').addEventListener('click', run);
    $('pgPct').addEventListener('change', () => { thrPct = Math.max(5, parseFloat($('pgPct').value) || 30); run(); });
    $('pgOt').addEventListener('change', () => { thrOt = Math.max(0, parseFloat($('pgOt').value) || 50); run(); });
    $('pgXlsx').addEventListener('click', exportXlsx);
    $('pgChips').addEventListener('click', e => { const c = e.target.closest('[data-f]'); if (!c) return; filter = filter === c.dataset.f ? '' : c.dataset.f; draw(); });
    $('pgBody').addEventListener('click', e => {
      const b = e.target.closest('button[data-emp]'); if (!b) return;
      close();
      const input = document.getElementById('monthlyMonth'); if (input) input.value = curMonth;
      if (typeof monthlyOpenEmployee === 'function') monthlyOpenEmployee(b.dataset.emp);
    });
  }
  function close() { if (overlay) overlay.classList.remove('open'); }
  function open() {
    if (!overlay) build();
    curMonth = (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
    overlay.querySelector('#pgPct').value = thrPct; overlay.querySelector('#pgOt').value = thrOt;
    filter = '';
    overlay.classList.add('open');
    run();
  }
  function setMonth(m) {
    if (!MONTH_RE.test(m || '')) { overlay.querySelector('#pgMonth').value = curMonth; return; }
    curMonth = m; run();
  }
  function run() {
    overlay.querySelector('#pgBody').innerHTML = '<tr><td colspan="6" style="padding:16px">កំពុងស្កេន...</td></tr>';
    setTimeout(() => {
      try { lastScan = scan(curMonth); findings = lastScan.findings; } catch (e) { console.error('payroll guard failed', e); lastScan = null; findings = []; overlay.querySelector('#pgBody').innerHTML = `<tr><td colspan="6" style="padding:16px;color:#dc2626">ស្កេនមិនបាន៖ ${esc(e.message)}</td></tr>`; return; }
      draw();
    }, 30);
  }

  function draw() {
    const $ = id => overlay.querySelector('#' + id);
    const s = lastScan; if (!s) return;
    $('pgMonthTxt').textContent = curMonth; $('pgMonth').value = curMonth;
    const col = s.score >= 85 ? '#059669' : (s.score >= 60 ? '#d97706' : '#dc2626');
    const g = $('pgGauge'); g.style.setProperty('--p', s.score); g.style.setProperty('--c', col);
    $('pgScore').textContent = s.score;
    $('pgVerdict').textContent = s.score >= 85 ? '✓ ប្រាក់ខែនៅល្អ' : (s.score >= 60 ? '⚠ ត្រូវពិនិត្យមុនបើកប្រាក់' : '🚨 មានចំណុចច្រើន — កុំទាន់បិទខែ');
    $('pgVerdict').style.color = col;
    $('pgMeta').textContent = `បុគ្គលិកសកម្ម ${s.employees} នាក់ · ប្រាក់ខែសុទ្ធសរុប $${money(s.total)}` + (s.locked ? ' · 🔒 ខែបិទរួច' : (s.ended ? '' : ' · ⏳ ខែមិនទាន់ចប់ (ការប្រៀបធៀបជាមួយខែមុនត្រូវបានរំលង)'));
    $('pgChips').innerHTML = ['high', 'med', 'info'].map(k => `<div class="pg-chip${filter === k ? ' on' : ''}" data-f="${k}" style="color:${LVL[k].c}"><b>${s[k]}</b>${LVL[k].ic} ${LVL[k].t}</div>`).join('');
    const list = findings.filter(f => !filter || f.lvl === filter);
    $('pgBody').innerHTML = list.length ? list.map(f => `<tr>
        <td style="white-space:nowrap;color:${LVL[f.lvl].c};font-weight:600">${LVL[f.lvl].ic} ${LVL[f.lvl].t}</td>
        <td>${f.e ? esc(f.e.username || '-') : '—'}</td><td>${f.e ? esc(f.e.name) : '<i>សរុបទាំងអស់</i>'}</td>
        <td style="font-weight:600">${esc(f.title)}</td><td style="font-size:.78rem">${esc(f.detail)}</td>
        <td>${f.e ? `<button class="secondary" style="padding:3px 8px;font-size:.74rem" data-emp="${esc(f.e.id)}" title="មើលលម្អិត">📄</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="6" class="pg-good">${findings.length ? 'គ្មានចំណុចក្នុងកម្រិតនេះ' : '✅ មិនឃើញអ្វីខុសប្រក្រតីទេ'}</td></tr>`;
  }

  function exportXlsx() {
    if (!findings.length) { customAlert('មិនមានចំណុចត្រូវ Export'); return; }
    downloadXlsx(`payroll_guard_${curMonth}.xlsx`, [{
      name: 'Payroll Guard ' + curMonth,
      columns: [{ header: 'Severity', width: 11, fmt: 'text' }, { header: 'Employee ID', width: 12, fmt: 'text' }, { header: 'Employee Name', width: 26, fmt: 'text' }, { header: 'Finding', width: 40, fmt: 'text' }, { header: 'Detail', width: 60, fmt: 'text' }],
      rows: findings.map(f => [f.lvl === 'high' ? 'High' : (f.lvl === 'med' ? 'Medium' : 'Info'), f.e ? (f.e.username || '') : '', f.e ? f.e.name : '(Total)', f.title, f.detail]),
    }]);
  }

  // ---------------------------------------------------------------- init ----
  function addButton() {
    if (document.getElementById('monthlyGuardBtn')) return;
    const anchor = ['monthlyTaxBtn', 'monthlyEndCheckBtn', 'monthlyFullBtn', 'monthlyBankBtn', 'monthlyXlsxBtn'].map(id => document.getElementById(id)).find(Boolean);
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'monthlyGuardBtn'; btn.type = 'button';
    btn.textContent = '🛡 ឆ្មាំប្រាក់ខែ';
    btn.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
  window.openPayrollGuard = open;
})();
