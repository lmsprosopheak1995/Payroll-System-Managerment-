/* month-end-review.js — 📋 ពិនិត្យចុងខែ (ណែនាំរង្វាន់ / កាត់ប្រាក់តាមវត្តមាន)
 * ដាក់បន្ទាប់ពី script.js ក្នុង index.html:  <script src="month-end-review.js"></script>
 * ត្រូវដំណើរការ month-end-review.sql ម្តងក្នុង Supabase (បន្ថែមជួរ month_end_rules ក្នុង app_settings)
 *
 * ប្រើ global ដែលមានស្រាប់ក្នុង script.js:
 *   employees, attendance, payrollItems, settings, calcDeductionRow, daysInMonth, dayMultiplier,
 *   upsertPayrollItemRow, deletePayrollItemRow, isMonthLocked/guardLocked/logAudit (បើមាន)
 */
(function () {
  'use strict';

  const PREFIX = 'mer_';                       // id ធាតុ: mer_<empId>_<month>
  const itemId = (empId, month) => `${PREFIX}${empId}_${month}`;
  const NAME_BONUS = 'ពិនិត្យចុងខែ: រង្វាន់វត្តមាន';
  const NAME_DED = 'ពិនិត្យចុងខែ: កាត់វត្តមាន';

  const DEFAULTS = {
    bonus_amount: 10,        // រង្វាន់ ($)
    bonus_max_late: 0,       // យឺតអតិបរមា (ថ្ងៃ) ដើម្បីបានរង្វាន់
    bonus_max_absent: 0,     // អវត្តមានអតិបរមា (ថ្ងៃ)
    bonus_max_leave: 99,     // ច្បាប់អតិបរមា (ថ្ងៃ)
    bonus_need_complete: 1,  // 1 = ត្រូវកត់វត្តមានគ្រប់ថ្ងៃ (គ្មាន "មិនទាន់កត់") ទើបបានរង្វាន់
    absent_deduct: 5,        // កាត់/ថ្ងៃអវត្តមាន ($)
    late_free: 3,            // យឺតដែលមិនកាត់ (ថ្ងៃ)
    late_deduct: 1,          // កាត់/ថ្ងៃយឺតលើស ($)
    deduct_cap: 50           // កាត់អតិបរមា/នាក់ ($)
  };

  let rules = { ...DEFAULTS };
  let month = '';
  let rows = [];

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2);
  const sb = () => window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));
  const confirmMsg = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(confirm(m)));
  const locked = m => (typeof isMonthLocked === 'function') && isMonthLocked(m);

  /* ---------- ច្បាប់កំណត់: រក្សាទុកក្នុង Supabase (app_settings.month_end_rules) ---------- */
  async function loadRules() {
    try {
      const { data, error } = await sb().from('app_settings').select('month_end_rules').eq('id', 1).maybeSingle();
      if (error) throw error;
      rules = { ...DEFAULTS, ...((data && data.month_end_rules) || {}) };
    } catch (e) {
      console.warn('month-end rules load failed (ដំណើរការ month-end-review.sql ហើយនៅ?)', e.message || e);
      rules = { ...DEFAULTS };
    }
  }
  async function saveRules() {
    const { data, error } = await sb().from('app_settings').update({ month_end_rules: rules }).eq('id', 1).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('មិនមានជួរ app_settings id=1 ឬគ្មានសិទ្ធិសរសេរ (RLS)');
  }

  /* ---------- គណនាស្ថិតិវត្តមានបុគ្គលិកម្នាក់ ---------- */
  function stats(emp) {
    const today = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
    const start = emp.startDate || emp.start_date || '0000-00-00';
    let absent = 0, unmarked = 0, present = 0;
    daysInMonth(month).forEach(d => {
      if (d > today || d < start) return;
      const rec = attendance[d] && attendance[d][emp.id];
      const st = rec && rec.status;
      if (st === 'absent') absent++;
      else if (st === 'present') present++;
      else if (!st && dayMultiplier(d) <= 1) unmarked++;
    });
    let late = 0, leave = 0;
    try { const c = calcDeductionRow(emp, month); late = c.lateDays || 0; leave = c.leaveDays || 0; } catch (e) { console.warn(e); }
    return { present, late, leave, absent, unmarked };
  }

  function suggest(s) {
    const lateOver = Math.max(0, s.late - rules.late_free);
    const ded = Math.min(rules.deduct_cap, s.absent * rules.absent_deduct + lateOver * rules.late_deduct);
    if (ded > 0) return { kind: 'deduction', amount: Math.round(ded * 100) / 100, why: `អវត្តមាន ${s.absent} · យឺតលើស ${lateOver}` };
    const ok = s.present > 0 && s.late <= rules.bonus_max_late && s.absent <= rules.bonus_max_absent && s.leave <= rules.bonus_max_leave
      && !(rules.bonus_need_complete && s.unmarked > 0);
    if (ok) return { kind: 'benefit', amount: rules.bonus_amount, why: 'វត្តមានល្អ' };
    return { kind: 'none', amount: 0, why: s.unmarked > 0 && rules.bonus_need_complete ? `មិនទាន់កត់ ${s.unmarked} ថ្ងៃ` : '-' };
  }

  function compute() {
    rows = employees.filter(e => e.status === 'active').map(emp => {
      const s = stats(emp), g = suggest(s);
      const existing = payrollItems.find(p => p.id === itemId(emp.id, month));
      return { emp, s, ...g, on: g.kind !== 'none', existing };
    });
    render();
  }

  function render() {
    const body = $('#mer-body'); if (!body) return;
    body.innerHTML = rows.map((r, i) => `
      <tr style="border-top:1px solid #1e2d40">
        <td><input type="checkbox" data-i="${i}" data-f="on" ${r.on ? 'checked' : ''} ${r.kind === 'none' ? 'disabled' : ''}></td>
        <td>${esc(r.emp.username || '')}</td><td>${esc(r.emp.name)}</td>
        <td>${r.s.present}</td><td>${r.s.late || '-'}</td><td>${r.s.leave || '-'}</td><td>${r.s.absent || '-'}</td>
        <td>${r.s.unmarked ? `<span style="color:#f59e0b">${r.s.unmarked}</span>` : '-'}</td>
        <td>${r.kind === 'benefit' ? '🟢 រង្វាន់' : r.kind === 'deduction' ? '🔴 កាត់' : '⚪ -'}</td>
        <td><input type="number" step="0.01" min="0" value="${r.amount}" data-i="${i}" data-f="amount" ${r.kind === 'none' ? 'disabled' : ''} style="width:80px;padding:4px;border-radius:6px;border:1px solid #334;background:#0d1b2a;color:#fff"></td>
        <td style="font-size:12px;opacity:.8">${esc(r.why)}${r.existing ? ' <span style="color:#14b8a6">· មានរួចហើយ ' + money(r.existing.amount) + '</span>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="11" style="padding:14px;opacity:.7">គ្មានបុគ្គលិក</td></tr>';
    const pick = rows.filter(r => r.on && r.kind !== 'none' && r.amount > 0);
    const net = pick.reduce((a, r) => a + (r.kind === 'benefit' ? r.amount : -r.amount), 0);
    $('#mer-total').textContent = `ជ្រើស ${pick.length} នាក់ · សុទ្ធ ${net >= 0 ? '+' : '-'}${money(Math.abs(net))}`;
  }

  async function apply() {
    if (locked(month)) { if (typeof guardLocked === 'function') guardLocked(month, 'ពិនិត្យចុងខែ'); else alertMsg('ខែនេះត្រូវបានបិទ'); return; }
    const pick = rows.filter(r => r.on && r.kind !== 'none' && r.amount > 0);
    const stale = rows.filter(r => r.existing && !pick.includes(r));     // ធាតុចាស់ដែលលែងត្រូវ → ដកចេញ
    if (!pick.length && !stale.length) { alertMsg('មិនមានអ្វីត្រូវអនុវត្តទេ'); return; }
    if (!(await confirmMsg(`អនុវត្ត ${pick.length} ធាតុ${stale.length ? ` និងដកចេញ ${stale.length} ធាតុចាស់` : ''} ក្នុងខែ ${month}? (ធាតុ "ពិនិត្យចុងខែ" ដែលមានស្រាប់នឹងត្រូវអាប់ដេត)`))) return;
    const btn = $('#mer-apply'); btn.disabled = true;
    try {
      for (const r of pick) {
        const item = { id: itemId(r.emp.id, month), employeeId: r.emp.id, type: r.kind, name: r.kind === 'benefit' ? NAME_BONUS : NAME_DED,
          recurrence: 'variable', month, currency: 'USD', amount: Number(r.amount) };
        const saved = await upsertPayrollItemRow(item);
        if (!saved) continue;                                         // upsertPayrollItemRow បានបង្ហាញ error ហើយ
        const i = payrollItems.findIndex(x => x.id === item.id);
        if (i !== -1) payrollItems[i] = item; else payrollItems.push(item);
        if (typeof logAudit === 'function') logAudit('month_end_apply', { entity: 'payroll_item', ref: item.id, month, employeeId: r.emp.id, new: { name: item.name, type: item.type, currency: 'USD', amount: item.amount } });
      }
      for (const r of stale) {
        if (await deletePayrollItemRow(r.existing.id)) payrollItems = payrollItems.filter(x => x.id !== r.existing.id);
      }
      ['renderPayrollTab', 'renderMonthlyTab', 'renderDeductTab', 'renderPayrollHistory'].forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn(fn, e); } });
      close();
      alertMsg('✅ បានអនុវត្តពិនិត្យចុងខែរួចរាល់');
    } catch (e) { console.error(e); alertMsg('កំហុស: ' + (e.message || e)); }
    finally { btn.disabled = false; }
  }

  async function clearAll() {
    if (locked(month)) { if (typeof guardLocked === 'function') guardLocked(month, 'លុបពិនិត្យចុងខែ'); return; }
    const mine = payrollItems.filter(p => p.id.startsWith(PREFIX) && p.month === month);
    if (!mine.length) { alertMsg('គ្មានធាតុ "ពិនិត្យចុងខែ" ក្នុងខែនេះទេ'); return; }
    if (!(await confirmMsg(`លុបធាតុ "ពិនិត្យចុងខែ" ទាំង ${mine.length} ក្នុងខែ ${month}?`))) return;
    for (const p of mine) if (await deletePayrollItemRow(p.id)) payrollItems = payrollItems.filter(x => x.id !== p.id);
    ['renderPayrollTab', 'renderMonthlyTab'].forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} });
    compute();
  }

  function close() { const m = $('#mer-modal'); if (m) m.remove(); }

  function readRules() {
    const g = id => { const v = parseFloat($('#mer-r-' + id).value); return isFinite(v) && v >= 0 ? v : DEFAULTS[id]; };
    const out = {}; Object.keys(DEFAULTS).forEach(k => { out[k] = g(k); });
    out.bonus_need_complete = $('#mer-r-bonus_need_complete').checked ? 1 : 0;
    return out;
  }

  async function open() {
    close();
    await loadRules();
    const today = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
    const pm = [...document.querySelectorAll('input[type="month"]')].find(i => i.offsetParent && i.value);
    month = (pm && pm.value) || today.slice(0, 7);
    const f = (id, label) => `<label style="display:flex;flex-direction:column;font-size:12px;gap:4px">${label}
      <input id="mer-r-${id}" type="number" step="0.01" min="0" value="${rules[id]}" style="padding:6px;border-radius:6px;border:1px solid #334;background:#0d1b2a;color:#fff"></label>`;
    const el = document.createElement('div');
    el.id = 'mer-modal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    el.innerHTML = `
      <div style="background:#0b1623;color:#e8eef5;border:1px solid #243447;border-radius:14px;width:min(1150px,100%);max-height:92vh;overflow:auto;padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <h3 style="margin:0">📋 ពិនិត្យចុងខែ</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="mer-month" type="month" value="${month}" style="padding:6px;border-radius:6px;border:1px solid #334;background:#0d1b2a;color:#fff">
            <button id="mer-x" style="background:none;border:0;color:#fff;font-size:22px;cursor:pointer">✕</button>
          </div>
        </div>
        <details style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">⚙️ ច្បាប់កំណត់ (ចុចដើម្បីកែ)</summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px">
            ${f('bonus_amount', 'រង្វាន់ ($)')}
            ${f('bonus_max_late', 'រង្វាន់៖ យឺតអតិបរមា (ថ្ងៃ)')}
            ${f('bonus_max_absent', 'រង្វាន់៖ អវត្តមានអតិបរមា (ថ្ងៃ)')}
            ${f('bonus_max_leave', 'រង្វាន់៖ ច្បាប់អតិបរមា (ថ្ងៃ)')}
            ${f('absent_deduct', 'កាត់/ថ្ងៃអវត្តមាន ($)')}
            ${f('late_free', 'យឺតដែលមិនកាត់ (ថ្ងៃ)')}
            ${f('late_deduct', 'កាត់/ថ្ងៃយឺតលើស ($)')}
            ${f('deduct_cap', 'កាត់អតិបរមា/នាក់ ($)')}
            <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input id="mer-r-bonus_need_complete" type="checkbox" ${rules.bonus_need_complete ? 'checked' : ''}> ត្រូវកត់វត្តមានគ្រប់ថ្ងៃ ទើបបានរង្វាន់</label>
          </div>
          <div style="margin-top:10px"><button id="mer-save" class="secondary">💾 រក្សាទុក &amp; គណនាឡើងវិញ</button></div>
        </details>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr style="text-align:left;opacity:.8"><th></th><th>Username</th><th>ឈ្មោះ</th><th>មក</th><th>យឺត</th><th>ច្បាប់</th><th>អវត្ត</th><th>មិនទាន់កត់</th><th>ការណែនាំ</th><th>ចំនួន ($)</th><th>មូលហេតុ</th></tr></thead>
          <tbody id="mer-body"></tbody></table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap">
          <b id="mer-total"></b>
          <div style="display:flex;gap:8px">
            <button id="mer-clear" class="secondary">🗑 លុបធាតុពិនិត្យចុងខែ</button>
            <button id="mer-apply" style="background:#14b8a6;color:#04121a;font-weight:700">✅ អនុវត្ត</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    $('#mer-x').onclick = close;
    $('#mer-apply').onclick = apply;
    $('#mer-clear').onclick = clearAll;
    $('#mer-month').onchange = e => { month = e.target.value || month; compute(); };
    $('#mer-save').onclick = async () => {
      try { rules = readRules(); await saveRules(); compute(); }
      catch (e) { alertMsg('រក្សាទុកច្បាប់មិនបាន៖ ' + (e.message || e) + '\n(តើបានដំណើរការ month-end-review.sql ហើយឬនៅ?)'); }
    };
    el.addEventListener('input', e => {
      const t = e.target, i = t.dataset && t.dataset.i; if (i === undefined) return;
      if (t.dataset.f === 'on') rows[i].on = t.checked;
      if (t.dataset.f === 'amount') rows[i].amount = Math.max(0, parseFloat(t.value) || 0);
      const total = rows.filter(r => r.on && r.kind !== 'none' && r.amount > 0);
      const net = total.reduce((a, r) => a + (r.kind === 'benefit' ? r.amount : -r.amount), 0);
      $('#mer-total').textContent = `ជ្រើស ${total.length} នាក់ · សុទ្ធ ${net >= 0 ? '+' : '-'}${money(Math.abs(net))}`;
    });
    compute();
  }

  function mount() {
    if ($('#mer-open')) return;
    const anchor = [...document.querySelectorAll('button')].find(b => /ព្រីមពេញខែ/.test(b.textContent));
    if (!anchor && !document.body) return;
    const btn = document.createElement('button');
    btn.id = 'mer-open'; btn.type = 'button';
    if (anchor) { btn.className = anchor.className; anchor.insertAdjacentElement('afterend', btn); }
    else { btn.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9000;padding:8px 14px;border-radius:10px;border:0;background:#14b8a6;color:#04121a;font-weight:700;cursor:pointer'; document.body.appendChild(btn); }
    btn.textContent = '📋 ពិនិត្យចុងខែ';
    btn.onclick = open;
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mount);
  mount();
})();
