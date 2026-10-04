/* ==========================================================================
   payslip-send.js — ផ្ញើការជូនដំណឹង Payslip ទៅបុគ្គលិក (Push) · Admin
   • ជ្រើសបុគ្គលិក (ឬ "ជ្រើសតាមតម្រងលើតារាង") → ផ្ញើជាប្រកាសក្នុង Push Notifications
     (ប្រើតារាង announcements ស្រាប់ target_type = 'employee' — មិនត្រូវការ SQL ឬ server ថ្មី)
   • លំនាំដើម៖ សារមិនមានចំនួនទឹកប្រាក់ (ការពារភាពឯកជន) · អាចបើក "បញ្ចូលចំនួនទឹកប្រាក់" បាន
   • តាមដានអ្នកដែលបានផ្ញើរួច · ផ្ញើម្តងទៀតបាន (ចេញជាសារថ្មី) · មានកំណត់ហេតុកែប្រែ
   • 📧 អ៊ីមែល / ✈️ Telegram ត្រូវការ server ដាច់ដោយឡែក (មិនទាន់រួមបញ្ចូលក្នុងម៉ូឌុលនេះ)

   ដំឡើង៖ index.html ដាក់ក្រោម payroll-tools.js៖  <script src="payslip-send.js"></script>
   ត្រូវការ features.sql (តារាង announcements) ដែលមានស្រាប់ · លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ត្រូវការ៖ payrollEmployeesForMonth, summarizeEmpMonth, isMonthLocked, currentMonthlyMonth, todayStr,
            supabaseClient, announcementRows (features.js), logAudit, customAlert, customConfirm
   ========================================================================== */
(function () {
  'use strict';

  // ស្លាកខ្មែរក្នុងផ្ទាំង "ប្រវត្តិកែប្រែ" (AUDIT_LABELS មកពី payroll-close.js)
  if (typeof AUDIT_LABELS !== 'undefined') Object.assign(AUDIT_LABELS, { payslip_push: '📤 ផ្ញើ Payslip (Push)' });

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const f2 = n => (typeof fmtUSD2 === 'function' ? fmtUSD2(n) : r2(n).toFixed(2));
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const curMonth = () => (typeof currentMonthlyMonth === 'function' && currentMonthlyMonth()) || todayStr().slice(0, 7);
  const annRows = () => (typeof announcementRows !== 'undefined' && Array.isArray(announcementRows)) ? announcementRows : null;

  let ov = null, month = '', rows = [];

  const CSS = `
.ps-ovl{position:fixed;inset:0;z-index:9972;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.ps-ovl.open{display:flex}
.ps-box{width:100%;max-width:1000px;max-height:94vh;overflow:auto;border-radius:16px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);padding:16px 18px;box-shadow:0 24px 64px rgba(15,27,45,.35)}
.ps-box h2{margin:0 0 4px;font-size:1.05rem}
.ps-note{font-size:.76rem;color:var(--text-muted,#5b6b80);margin:0 0 8px}
.ps-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.ps-row input[type=text],.ps-row select{font-size:.8rem;padding:6px 8px}
.ps-tbl td,.ps-tbl th{white-space:nowrap;vertical-align:middle}
.ps-warn{font-size:.78rem;padding:7px 10px;border-radius:8px;background:#fef3c7;color:#92400e;margin:6px 0}
.ps-ok{color:var(--success,#059669);font-weight:600}
.ps-opt{display:flex;gap:6px;align-items:center;font-size:.8rem;margin:0}
.ps-prev{white-space:pre-wrap;font-size:.78rem;padding:8px 10px;border:1px dashed var(--border,#e1e8ef);border-radius:10px;margin:6px 0;min-height:2.4em}
.ps-sum{font-size:.8rem;font-weight:600}
`;

  // ---------------------------------------------------------------- សារ ----
  function messageFor(e, t, withAmounts) {
    const title = `💵 Payslip ខែ ${month}`;
    if (!withAmounts) {
      return { title, body: `ប្រាក់ខែខែ ${month} ត្រូវបានគណនារួចរាល់។ សូមពិនិត្យ Payslip របស់អ្នក ឬទាក់ទងផ្នែកបុគ្គលិកប្រសិនបើមានសំណួរ។` };
    }
    const lines = [
      `សួស្តី ${e.name}`,
      `ថ្ងៃធ្វើការ: ${t.workDays}`,
      `តាមវត្តមាន: $${f2(t.total)}`,
      `អត្ថប្រយោជន៍: +$${f2(t.benefitsUSD)}`,
      `ប្រាក់កាត់: −$${f2(t.deductionsUSD)}`,
      `ប្រាក់ខែសុទ្ធ: $${f2(t.net)}`,
    ];
    return { title, body: lines.join('\n') };
  }

  const baseId = empId => `payslip_${empId}_${month}`;
  const sentCount = empId => {
    const list = annRows(); if (!list) return 0;
    const b = baseId(empId);
    return list.filter(r => r && typeof r.id === 'string' && (r.id === b || r.id.startsWith(b + '_'))).length;
  };

  // ---------------------------------------------------------------- UI ----
  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    ov = document.createElement('div');
    ov.className = 'ps-ovl';
    ov.innerHTML = `
      <div class="ps-box" role="dialog" aria-modal="true">
        <h2>📤 ផ្ញើ Payslip ជូនបុគ្គលិក <span id="psMonth" style="font-weight:500;color:var(--text-muted)"></span></h2>
        <p class="ps-note">ផ្ញើជា Push Notification ក្នុងកម្មវិធីបុគ្គលិក (តាមផ្ទាំង Push Notifications)។ 📧 អ៊ីមែល និង ✈️ Telegram មិនទាន់គាំទ្រក្នុងម៉ូឌុលនេះ។</p>
        <div id="psStatus"></div>
        <div class="ps-row">
          <input type="text" id="psQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="psDept"></select>
          <button class="secondary" id="psFromTable" type="button" title="ជ្រើសបុគ្គលិកដែលកំពុងបង្ហាញក្នុងតារាងមេ (តាមតម្រង)">☑ ជ្រើសតាមតម្រងលើតារាង</button>
          <button class="secondary" id="psUnsent" type="button">☑ ជ្រើសអ្នកមិនទាន់ផ្ញើ</button>
          <button class="secondary" id="psClear" type="button">☐ ដកទាំងអស់</button>
          <span class="ps-sum" id="psSel" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap" style="max-height:38vh;overflow:auto">
          <table class="ps-tbl">
            <thead><tr><th><input type="checkbox" id="psAll" title="ជ្រើសទាំងអស់ (ដែលកំពុងបង្ហាញ)"></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th style="text-align:right">ប្រាក់ខែសុទ្ធ ($)</th><th>ស្ថានភាពផ្ញើ</th></tr></thead>
            <tbody id="psBody"></tbody>
          </table>
        </div>
        <div class="ps-row">
          <label class="ps-opt"><input type="checkbox" id="psAmt"> បញ្ចូលចំនួនទឹកប្រាក់ក្នុងសារ</label>
        </div>
        <div class="ps-warn" id="psAmtWarn" style="display:none">⚠️ ប្រកាស Push ត្រូវបានរក្សាទុកក្នុងតារាង announcements។ ប្រសិនបើ policy (RLS) របស់តារាងនេះអនុញ្ញាតឱ្យបុគ្គលិកអានជួរទាំងអស់ នោះបុគ្គលិកផ្សេងអាចឃើញចំនួនទឹកប្រាក់។ ពិនិត្យ features.sql មុនបើកជម្រើសនេះ។</div>
        <div class="ps-note" style="margin-bottom:2px">ឧទាហរណ៍សារ៖</div>
        <div class="ps-prev" id="psPrev"></div>
        <div class="ps-row" style="justify-content:flex-end">
          <button class="secondary" id="psClose" type="button">បិទ</button>
          <button id="psSend" type="button">📤 ផ្ញើ Push</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const $ = id => ov.querySelector('#' + id);
    $('psClose').addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
    $('psQ').addEventListener('input', renderList);
    $('psDept').addEventListener('change', renderList);
    $('psAll').addEventListener('change', e => { ov.querySelectorAll('#psBody .ps-chk').forEach(c => { c.checked = e.target.checked; }); sync(); });
    $('psBody').addEventListener('change', sync);
    $('psClear').addEventListener('click', () => { ov.querySelectorAll('#psBody .ps-chk').forEach(c => { c.checked = false; }); $('psAll').checked = false; sync(); });
    $('psUnsent').addEventListener('click', () => { ov.querySelectorAll('#psBody tr[data-id]').forEach(tr => { tr.querySelector('.ps-chk').checked = !sentCount(tr.dataset.id); }); sync(); });
    $('psFromTable').addEventListener('click', () => {
      const vis = typeof window.payrollToolsVisibleIds === 'function' ? window.payrollToolsVisibleIds() : null;
      ov.querySelectorAll('#psBody tr[data-id]').forEach(tr => { tr.querySelector('.ps-chk').checked = vis ? vis.has(tr.dataset.id) : false; });
      sync();
    });
    $('psAmt').addEventListener('change', () => { $('psAmtWarn').style.display = $('psAmt').checked ? '' : 'none'; sync(); });
    $('psSend').addEventListener('click', send);
  }

  function close() { if (ov) ov.classList.remove('open'); }
  const selectedIds = () => [...ov.querySelectorAll('#psBody .ps-chk:checked')].map(c => c.closest('tr').dataset.id);

  function sync() {
    const ids = selectedIds();
    const $ = id => ov.querySelector('#' + id);
    $('psSel').textContent = `បានជ្រើស ${ids.length} នាក់`;
    const first = rows.find(r => ids.includes(r.e.id)) || rows[0];
    $('psPrev').textContent = first ? (m => `${m.title}\n${m.body}`)(messageFor(first.e, first.t, $('psAmt').checked)) : '';
    const tableErr = typeof featureErrors !== 'undefined' && featureErrors.announcements;
    $('psSend').disabled = !ids.length || !!tableErr || !annRows();
  }

  function renderList() {
    const $ = id => ov.querySelector('#' + id);
    const q = ($('psQ').value || '').trim().toLowerCase(), d = $('psDept').value;
    const prev = new Set(selectedIds());
    const list = rows.filter(({ e }) => (!q || ((e.name || '') + ' ' + (e.username || '')).toLowerCase().includes(q)) && (!d || (e.dept || '') === d));
    $('psBody').innerHTML = list.length ? list.map(({ e, t }) => {
      const n = sentCount(e.id);
      return `<tr data-id="${esc(e.id)}"><td><input type="checkbox" class="ps-chk" ${prev.has(e.id) ? 'checked' : ''}></td><td>${esc(e.username || '')}</td><td>${esc(e.name || '')}</td><td>${esc(e.dept || '')}</td><td style="text-align:right">${f2(t.net)}</td><td>${n ? `<span class="ps-ok">✓ បានផ្ញើ${n > 1 ? ` (${n} ដង)` : ''}</span>` : '<span style="color:var(--text-muted)">មិនទាន់ផ្ញើ</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:14px">មិនមានបុគ្គលិក</td></tr>';
    sync();
  }

  function open() {
    if (!ov) build();
    month = curMonth();
    const $ = id => ov.querySelector('#' + id);
    let emps = [];
    try { emps = payrollEmployeesForMonth(month); } catch (e) { emps = []; }
    rows = emps.map(e => { let t = {}; try { t = summarizeEmpMonth(e, month) || {}; } catch (x) { /* ignore */ } return { e, t }; })
      .sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
    $('psMonth').textContent = month;
    const depts = [...new Set(rows.map(r => r.e.dept || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $('psDept').innerHTML = '<option value="">ផ្នែកទាំងអស់</option>' + depts.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('psQ').value = ''; $('psAmt').checked = false; $('psAmtWarn').style.display = 'none'; $('psAll').checked = false;
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(month);
    const tableErr = typeof featureErrors !== 'undefined' && featureErrors.announcements;
    $('psStatus').innerHTML = (tableErr ? '<div class="ps-warn">⚠️ មិនទាន់មានតារាង "announcements" ក្នុង Supabase — សូមដំណើរការ features.sql ជាមុន។</div>' : '')
      + (locked ? '' : `<div class="ps-warn">🔓 ខែ ${esc(month)} មិនទាន់បិទ — ចំនួនអាចប្រែប្រួល។ គួរបិទខែជាមុនសិន មុនផ្ញើ Payslip។</div>`);
    renderList();
    ov.classList.add('open');
  }

  // ---------------------------------------------------------------- ផ្ញើ ----
  async function send() {
    const $ = id => ov.querySelector('#' + id);
    const ids = selectedIds();
    if (!ids.length) { await customAlert('សូមជ្រើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    if (typeof featureErrors !== 'undefined' && featureErrors.announcements) { await customAlert('មិនទាន់មានតារាង announcements — សូមដំណើរការ features.sql ជាមុន'); return; }
    const withAmounts = $('psAmt').checked;
    const picked = rows.filter(r => ids.includes(r.e.id));
    const again = picked.filter(r => sentCount(r.e.id) > 0).length;
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(month);
    const preview = picked.slice(0, 8).map(r => r.e.name).join(', ') + (picked.length > 8 ? ` …(+${picked.length - 8})` : '');
    const msg = `ផ្ញើ Payslip ខែ ${month} ទៅ ${picked.length} នាក់ (Push)?\n${preview}`
      + (again ? `\n\nមាន ${again} នាក់ធ្លាប់ទទួលរួចហើយ — នឹងផ្ញើជាសារថ្មីម្តងទៀត` : '')
      + (withAmounts ? '\n\n⚠ សារមានចំនួនទឹកប្រាក់' : '')
      + (locked ? '' : '\n\n⚠ ខែនេះមិនទាន់បិទ — ចំនួនអាចប្រែប្រួលក្រោយ');
    if (!(await customConfirm(msg))) return;

    const stamp = Date.now().toString(36);
    const now = new Date().toISOString();
    const out = picked.map(({ e, t }) => {
      const m = messageFor(e, t, withAmounts);
      const id = sentCount(e.id) ? `${baseId(e.id)}_${stamp}` : baseId(e.id);
      return { id, title: m.title, body: m.body, target_type: 'employee', target_value: e.id, created_at: now };
    });

    const btn = $('psSend'); btn.disabled = true;
    let okCount = 0, errMsg = '';
    try {
      for (let i = 0; i < out.length; i += 100) {
        const chunk = out.slice(i, i + 100);
        const { error } = await supabaseClient.from('announcements').upsert(chunk, { onConflict: 'id' });
        if (error) { errMsg = error.message; break; }
        okCount += chunk.length;
        const list = annRows();
        if (list) chunk.slice().reverse().forEach(r => { const k = list.findIndex(x => x.id === r.id); if (k >= 0) list.splice(k, 1); list.unshift(r); });
        if (typeof logAudit === 'function') chunk.forEach(r => logAudit('payslip_push', { entity: 'announcement', ref: r.id, month, employeeId: r.target_value, new: { channel: 'push', amounts: withAmounts } }));
      }
    } catch (ex) {
      errMsg = String(ex && ex.message || ex);
    } finally {
      btn.disabled = false;
    }
    if (typeof renderAnnouncements === 'function') { try { renderAnnouncements(); } catch (e) { /* ignore */ } }
    renderList();
    await customAlert(errMsg
      ? `ផ្ញើបាន ${okCount}/${out.length} នាក់ — មានបញ្ហា៖ ${errMsg}`
      : `✓ បានផ្ញើ Payslip ទៅ ${okCount} នាក់`);
  }

  // ---------------------------------------------------------------- init ----
  function init() {
    if (document.getElementById('psOpenBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'secondary'; btn.id = 'psOpenBtn'; btn.type = 'button';
    btn.textContent = '📤 ផ្ញើ Payslip';
    btn.addEventListener('click', open);
    const bar = document.getElementById('ptBar');
    const count = bar && bar.querySelector('#ptCount');
    if (bar) { bar.insertBefore(btn, count || null); return; }
    const anchor = document.getElementById('monthlyEndCheckBtn') || document.getElementById('monthlyFullBtn') || document.getElementById('monthlyBankBtn') || document.getElementById('monthlyXlsxBtn');
    if (anchor) anchor.insertAdjacentElement('afterend', btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openPayslipSend = open;
})();
