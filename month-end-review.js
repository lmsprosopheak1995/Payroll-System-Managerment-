/* month-end-review.js — ពិនិត្យចុងខែ (Month-end bonus / deduction review)
 * Add to index.html AFTER script.js:  <script src="month-end-review.js"></script>
 * Run month-end-review.sql in Supabase first.
 *
 * ⚠️ Only the ADAPTER section below depends on your database.
 *    Adjust table/column names there to match your project.
 */
(function () {
  'use strict';

  /* ===================== ADAPTER (edit to match your DB) ===================== */
  const DB = () => window.supabaseClient || window.supabase_client || window.sb || window.db;
  const T = {
    employees: 'employees',          // columns: id, code, name, active
    attendance: 'attendance',        // columns: emp_id, date, status ('present'|'late'|'absent'|'leave')
    adjustments: 'adjustments',      // columns: emp_id, month, type ('benefit'|'deduct'), label, amount
    rules: 'month_end_rules'         // created by month-end-review.sql
  };
  const TAG = '[ពិនិត្យចុងខែ]';      // label prefix → lets us replace old lines (no duplicates)

  async function getEmployees() {
    const { data, error } = await DB().from(T.employees).select('id, code, name').eq('active', true).order('code');
    if (error) throw error;
    return data || [];
  }
  async function getSummary(month) {          // month = '2026-11'
    const from = month + '-01';
    const [y, m] = month.split('-').map(Number);
    const to = new Date(y, m, 1).toISOString().slice(0, 10);
    const { data, error } = await DB().from(T.attendance).select('emp_id, status').gte('date', from).lt('date', to);
    if (error) throw error;
    const s = {};
    (data || []).forEach(r => {
      const o = s[r.emp_id] || (s[r.emp_id] = { present: 0, late: 0, absent: 0, leave: 0 });
      if (o[r.status] !== undefined) o[r.status]++;
      if (r.status === 'late') o.present++;     // late still counts as a worked day
    });
    return s;
  }
  async function replaceAdjustments(month, rows) {   // rows: [{emp_id,type,label,amount}]
    const del = await DB().from(T.adjustments).delete().eq('month', month).like('label', TAG + '%');
    if (del.error) throw del.error;
    if (!rows.length) return;
    const ins = await DB().from(T.adjustments).insert(rows.map(r => ({ ...r, month })));
    if (ins.error) throw ins.error;
  }
  async function loadRules() {
    const { data } = await DB().from(T.rules).select('*').eq('id', 1).maybeSingle();
    return Object.assign({ bonus_amount: 10, bonus_max_late: 0, bonus_max_absent: 0, bonus_max_leave: 99,
      absent_deduct: 5, late_free: 3, late_deduct: 1, deduct_cap: 50 }, data || {});
  }
  async function saveRules(r) {
    const { error } = await DB().from(T.rules).upsert({ id: 1, ...r });
    if (error) throw error;
  }
  /* =========================================================================== */

  const $ = (s, el = document) => el.querySelector(s);
  const money = n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2);
  let state = { month: '', rules: null, rows: [] };

  function suggest(sum, r) {
    const s = sum || { present: 0, late: 0, absent: 0, leave: 0 };
    const lateOver = Math.max(0, s.late - r.late_free);
    const ded = Math.min(r.deduct_cap, s.absent * r.absent_deduct + lateOver * r.late_deduct);
    if (ded > 0) return { type: 'deduct', amount: ded, why: `អវត្តមាន ${s.absent} · យឺតលើស ${lateOver}` };
    if (s.late <= r.bonus_max_late && s.absent <= r.bonus_max_absent && s.leave <= r.bonus_max_leave && s.present > 0)
      return { type: 'benefit', amount: r.bonus_amount, why: 'វត្តមានល្អ' };
    return { type: 'none', amount: 0, why: '-' };
  }

  async function compute() {
    const [emps, sums] = await Promise.all([getEmployees(), getSummary(state.month)]);
    state.rows = emps.map(e => {
      const sum = sums[e.id] || { present: 0, late: 0, absent: 0, leave: 0 };
      const sg = suggest(sum, state.rules);
      return { ...e, sum, ...sg, on: sg.type !== 'none' };
    });
    render();
  }

  function render() {
    const body = $('#mer-body');
    body.innerHTML = state.rows.map((r, i) => `
      <tr>
        <td><input type="checkbox" data-i="${i}" data-f="on" ${r.on ? 'checked' : ''} ${r.type === 'none' ? 'disabled' : ''}></td>
        <td>${r.code || ''}</td><td>${r.name || ''}</td>
        <td>${r.sum.present}</td><td>${r.sum.late}</td><td>${r.sum.leave}</td><td>${r.sum.absent}</td>
        <td>${r.type === 'benefit' ? '🟢 រង្វាន់' : r.type === 'deduct' ? '🔴 កាត់' : '⚪ -'}</td>
        <td><input type="number" step="0.01" min="0" value="${r.amount}" data-i="${i}" data-f="amount" ${r.type === 'none' ? 'disabled' : ''} style="width:80px"></td>
        <td style="font-size:12px;opacity:.8">${r.why}</td>
      </tr>`).join('');
    const n = state.rows.filter(r => r.on && r.type !== 'none');
    const sum = n.reduce((a, r) => a + (r.type === 'benefit' ? r.amount : -r.amount), 0);
    $('#mer-total').textContent = `ជ្រើស ${n.length} នាក់ · សរុប ${money(sum)}`;
  }

  async function apply() {
    const picks = state.rows.filter(r => r.on && r.type !== 'none' && r.amount > 0);
    if (!picks.length) return alert('មិនមានអ្វីត្រូវអនុវត្តទេ');
    if (!confirm(`អនុវត្ត ${picks.length} បន្ទាត់ ទៅខែ ${state.month}?\n(បន្ទាត់ ${TAG} ចាស់នឹងត្រូវជំនួស)`)) return;
    try {
      await replaceAdjustments(state.month, picks.map(r => ({
        emp_id: r.id, type: r.type, amount: Number(r.amount),
        label: `${TAG} ${r.type === 'benefit' ? 'រង្វាន់វត្តមាន' : 'កាត់វត្តមាន'} (${r.why})`
      })));
      alert('✅ បានអនុវត្តរួចរាល់');
      close();
      if (typeof window.loadPayroll === 'function') window.loadPayroll();
      else if (typeof window.renderPayroll === 'function') window.renderPayroll();
    } catch (e) { console.error(e); alert('កំហុស: ' + (e.message || e)); }
  }

  async function clearApplied() {
    if (!confirm(`លុបបន្ទាត់ ${TAG} ទាំងអស់ក្នុងខែ ${state.month}?`)) return;
    try { await replaceAdjustments(state.month, []); alert('បានលុប'); } catch (e) { alert('កំហុស: ' + e.message); }
  }

  function readRules() {
    const g = id => Number($('#mer-' + id).value) || 0;
    return { bonus_amount: g('bonus_amount'), bonus_max_late: g('bonus_max_late'), bonus_max_absent: g('bonus_max_absent'),
      bonus_max_leave: g('bonus_max_leave'), absent_deduct: g('absent_deduct'), late_free: g('late_free'),
      late_deduct: g('late_deduct'), deduct_cap: g('deduct_cap') };
  }

  function close() { const m = $('#mer-modal'); if (m) m.remove(); }

  async function open() {
    close();
    const monthInput = document.querySelector('input[type="month"]');
    state.month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
    state.rules = await loadRules();
    const R = state.rules;
    const f = (id, label) => `<label style="display:flex;flex-direction:column;font-size:12px;gap:4px">${label}
      <input id="mer-${id}" type="number" step="0.01" min="0" value="${R[id]}" style="padding:6px;border-radius:6px;border:1px solid #334;background:#0d1b2a;color:#fff"></label>`;
    const el = document.createElement('div');
    el.id = 'mer-modal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    el.innerHTML = `
      <div style="background:#0b1623;color:#e8eef5;border:1px solid #243447;border-radius:14px;width:min(1100px,100%);max-height:92vh;overflow:auto;padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="margin:0">📋 ពិនិត្យចុងខែ — <span id="mer-month">${state.month}</span></h3>
          <button id="mer-x" style="background:none;border:0;color:#fff;font-size:22px;cursor:pointer">✕</button>
        </div>
        <details open style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">⚙️ ច្បាប់កំណត់</summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px">
            ${f('bonus_amount', 'រង្វាន់ ($)')}
            ${f('bonus_max_late', 'រង្វាន់: យឺតអតិបរមា (ដង)')}
            ${f('bonus_max_absent', 'រង្វាន់: អវត្តមានអតិបរមា (ថ្ងៃ)')}
            ${f('bonus_max_leave', 'រង្វាន់: ច្បាប់អតិបរមា (ថ្ងៃ)')}
            ${f('absent_deduct', 'កាត់/អវត្តមាន 1 ថ្ងៃ ($)')}
            ${f('late_free', 'យឺតមិនកាត់ (ដង)')}
            ${f('late_deduct', 'កាត់/យឺតលើស 1 ដង ($)')}
            ${f('deduct_cap', 'កាត់អតិបរមា/នាក់ ($)')}
          </div>
          <div style="margin-top:10px"><button id="mer-save" class="btn">💾 រក្សាទុក &amp; គណនាឡើងវិញ</button></div>
        </details>
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr style="text-align:left;opacity:.8"><th></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>មក</th><th>យឺត</th><th>ច្បាប់</th><th>អវត្ត</th><th>ការណែនាំ</th><th>ចំនួន ($)</th><th>មូលហេតុ</th></tr></thead>
          <tbody id="mer-body"></tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap">
          <b id="mer-total"></b>
          <div style="display:flex;gap:8px">
            <button id="mer-clear" class="btn">🗑 លុបបន្ទាត់ពិនិត្យចុងខែ</button>
            <button id="mer-apply" class="btn" style="background:#14b8a6;color:#04121a;font-weight:700">✅ អនុវត្ត</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    $('#mer-x').onclick = close;
    $('#mer-apply').onclick = apply;
    $('#mer-clear').onclick = clearApplied;
    $('#mer-save').onclick = async () => {
      try { state.rules = readRules(); await saveRules(state.rules); await compute(); } catch (e) { alert('កំហុស: ' + e.message); }
    };
    el.addEventListener('input', e => {
      const t = e.target, i = t.dataset.i; if (i === undefined) return;
      if (t.dataset.f === 'on') state.rows[i].on = t.checked;
      if (t.dataset.f === 'amount') state.rows[i].amount = Number(t.value) || 0;
      const keep = document.activeElement; render(); if (keep && keep.dataset && keep.dataset.f === 'amount') { const n = $(`input[data-i="${i}"][data-f="amount"]`); n && n.focus(); }
    });
    try { await compute(); } catch (e) { console.error(e); alert('មិនអាចទាញទិន្នន័យ: ' + (e.message || e)); }
  }

  function mount() {
    if ($('#mer-open')) return;
    const anchor = [...document.querySelectorAll('button')].find(b => /ព្រីមពេញខែ/.test(b.textContent));
    const btn = document.createElement('button');
    btn.id = 'mer-open'; btn.className = anchor ? anchor.className : 'btn';
    btn.textContent = '📋 ពិនិត្យចុងខែ';
    btn.onclick = open;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else { btn.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9000'; document.body.appendChild(btn); }
  }
  const obs = new MutationObserver(() => mount());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mount);
  mount();
})();
