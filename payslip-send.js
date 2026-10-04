/* ==========================================================================
   payslip-send.js — ផ្ញើការជូនដំណឹង Payslip ទៅបុគ្គលិក (Push) · Admin
   • ជ្រើសបុគ្គលិក (ឬ "ជ្រើសតាមតម្រងលើតារាង") → ផ្ញើជាប្រកាសក្នុង Push Notifications
     (ប្រើតារាង announcements ស្រាប់ target_type = 'employee' — មិនត្រូវការ SQL ឬ server ថ្មី)
   • លំនាំដើម៖ សារមិនមានចំនួនទឹកប្រាក់ (ការពារភាពឯកជន) · អាចបើក "បញ្ចូលចំនួនទឹកប្រាក់" បាន
   • តាមដានអ្នកដែលបានផ្ញើរួច · ផ្ញើម្តងទៀតបាន (ចេញជាសារថ្មី) · មានកំណត់ហេតុកែប្រែ
   • ✈️ Telegram ផ្ញើតាម Edge Function 'send-payslip' (អានចំនួនទឹកប្រាក់ពី payroll_snapshots ក្នុង server) · 🔗 តំណភ្ជាប់ Telegram តាម telegram-webhook

   ដំឡើង៖ index.html ដាក់ក្រោម payroll-tools.js៖  <script src="payslip-send.js"></script>
   ត្រូវការ features.sql (តារាង announcements) ដែលមានស្រាប់ · លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ត្រូវការ៖ payrollEmployeesForMonth, summarizeEmpMonth, isMonthLocked, currentMonthlyMonth, todayStr,
            supabaseClient, announcementRows (features.js), logAudit, customAlert, customConfirm
   ========================================================================== */
(function () {
  'use strict';

  // ស្លាកខ្មែរក្នុងផ្ទាំង "ប្រវត្តិកែប្រែ" (AUDIT_LABELS មកពី payroll-close.js)
  if (typeof AUDIT_LABELS !== 'undefined') Object.assign(AUDIT_LABELS, { payslip_push: '📤 ផ្ញើ Payslip (Push)', payslip_telegram: '✈️ ផ្ញើ Payslip (Telegram)' });

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
.ps-ovl button:disabled{opacity:.4;cursor:not-allowed;filter:grayscale(.6)}
.ps-hint{font-size:.76rem;color:var(--text-muted,#5b6b80);margin-right:auto}
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
        <p class="ps-note">ជ្រើសបណ្តាញផ្ញើ៖ 🔔 Push ក្នុងកម្មវិធី · ✈️ Telegram។ Telegram ផ្ញើពី server ដោយអានចំនួនទឹកប្រាក់ពី snapshot នៃខែដែលបានបិទ (ត្រូវបិទខែជាមុន)។ បុគ្គលិកត្រូវភ្ជាប់ Telegram ជាមុន តាមប៊ូតុង 🔗។</p>
        <div id="psStatus"></div>
        <div class="ps-row">
          <input type="month" id="psMonthSel" title="ជ្រើសរើសខែ" style="font-size:.8rem;padding:6px 8px">
          <input type="text" id="psQ" placeholder="🔍 ស្វែងរកអត្តលេខ ឬ ឈ្មោះ..." style="min-width:190px">
          <select id="psDept"></select>
          <button class="secondary" id="psFromTable" type="button" title="ជ្រើសបុគ្គលិកដែលកំពុងបង្ហាញក្នុងតារាងមេ (តាមតម្រង)">☑ ជ្រើសតាមតម្រងលើតារាង</button>
          <button class="secondary" id="psUnsent" type="button">☑ ជ្រើសអ្នកមិនទាន់ផ្ញើ</button>
          <button class="secondary" id="psClear" type="button">☐ ដកទាំងអស់</button>
          <button class="secondary" id="psLink" type="button" title="បង្កើតតំណភ្ជាប់ Telegram សម្រាប់បុគ្គលិកដែលបានជ្រើស">🔗 តំណភ្ជាប់ Telegram</button>
          <button class="secondary" id="psSetChat" type="button" title="ដាក់ Telegram chat ID ដោយដៃ (បុគ្គលិកម្នាក់)">✏️ ដាក់ Chat ID</button>
          <span class="ps-sum" id="psSel" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap" style="max-height:38vh;overflow:auto">
          <table class="ps-tbl">
            <thead><tr><th><input type="checkbox" id="psAll" title="ជ្រើសទាំងអស់ (ដែលកំពុងបង្ហាញ)"></th><th>អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th style="text-align:right">ប្រាក់ខែសុទ្ធ ($)</th><th>ស្ថានភាពផ្ញើ</th></tr></thead>
            <tbody id="psBody"></tbody>
          </table>
        </div>
        <div class="ps-row">
          <label class="ps-opt"><input type="checkbox" id="psChPush" checked> 🔔 Push</label>
          <label class="ps-opt"><input type="checkbox" id="psChTg"> ✈️ Telegram</label>
          <label class="ps-opt" style="margin-left:12px"><input type="checkbox" id="psAmt"> បញ្ចូលចំនួនទឹកប្រាក់ក្នុង Push</label>
        </div>
        <div class="ps-row" id="psPwRow" style="display:none"><input type="password" id="psPw" placeholder="🔑 ពាក្យសម្ងាត់ admin (សម្រាប់ Telegram)" autocomplete="off" style="min-width:280px"></div>
        <div class="ps-warn" id="psAmtWarn" style="display:none">⚠️ ប្រកាស Push ត្រូវបានរក្សាទុកក្នុងតារាង announcements។ ប្រសិនបើ policy (RLS) របស់តារាងនេះអនុញ្ញាតឱ្យបុគ្គលិកអានជួរទាំងអស់ នោះបុគ្គលិកផ្សេងអាចឃើញចំនួនទឹកប្រាក់។ ពិនិត្យ features.sql មុនបើកជម្រើសនេះ។</div>
        <div class="ps-note" style="margin-bottom:2px">ឧទាហរណ៍សារ៖</div>
        <div class="ps-prev" id="psPrev"></div>
        <div class="ps-row" style="justify-content:flex-end">
          <span class="ps-hint" id="psHint"></span>
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
    $('psLink').addEventListener('click', makeLinks);
    $('psSetChat').addEventListener('click', setChatId);
    $('psMonthSel').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) loadMonth(e.target.value); else e.target.value = month; });
    ['psChPush', 'psChTg'].forEach(id => $(id).addEventListener('change', () => {
      $('psPwRow').style.display = $('psChTg').checked ? '' : 'none';
      sync();
    }));
  }

  function close() { if (ov) ov.classList.remove('open'); }
  const selectedIds = () => [...ov.querySelectorAll('#psBody .ps-chk:checked')].map(c => c.closest('tr').dataset.id);

  function sync() {
    const ids = selectedIds();
    const $ = id => ov.querySelector('#' + id);
    $('psSel').textContent = `បានជ្រើស ${ids.length} នាក់`;
    const first = rows.find(r => ids.includes(r.e.id)) || rows[0];
    const tableErr = typeof featureErrors !== 'undefined' && featureErrors.announcements;
    const push = $('psChPush').checked, ext = $('psChTg').checked;
    // Push ប្រើជម្រើស "បញ្ចូលចំនួនទឹកប្រាក់" · Telegram តែងតែមានចំនួនទឹកប្រាក់ពេញលេញ (ផ្ញើពី server)
    $('psPrev').textContent = first
      ? (m => `${m.title}\n${m.body}`)(messageFor(first.e, first.t, push ? $('psAmt').checked : true))
        + (push && ext ? '\n\n✈️ Telegram: ផ្ញើសារពេញលេញដែលមានចំនួនទឹកប្រាក់ (ព័ត៌មានឯកជន)' : '')
      : '';
    $('psHint').textContent = !ids.length ? '← សូមធីកជ្រើសបុគ្គលិកក្នុងតារាងជាមុន' : (!push && !ext ? '← សូមជ្រើសបណ្តាញផ្ញើ' : '');
    $('psSend').textContent = '📤 ផ្ញើ ' + ([push && 'Push', ext && 'Telegram'].filter(Boolean).join(' + ') || '—');
    $('psSend').disabled = !ids.length || (!push && !ext) || (push && (!!tableErr || !annRows()));
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

  // ផ្ទុកបុគ្គលិក + ចំនួនសម្រាប់ខែដែលបានជ្រើស (ខែបិទរួច → ប្រើលេខពី Snapshot ដូចអ្វីដែល server នឹងផ្ញើ)
  function loadMonth(m) {
    month = m;
    const $ = id => ov.querySelector('#' + id);
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(month);
    let emps = [];
    try { emps = payrollEmployeesForMonth(month); } catch (e) { emps = []; }
    rows = emps.map(e => {
      let t = null;
      if (locked && typeof getLockedSnapshot === 'function') { try { t = getLockedSnapshot(e.id, month); } catch (x) { t = null; } }
      if (!t) { try { t = summarizeEmpMonth(e, month) || {}; } catch (x) { t = {}; } }
      return { e, t };
    }).sort((a, b) => (a.e.dept || '').localeCompare(b.e.dept || '') || (a.e.name || '').localeCompare(b.e.name || ''));
    $('psMonth').textContent = month;
    $('psMonthSel').value = month;
    const depts = [...new Set(rows.map(r => r.e.dept || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $('psDept').innerHTML = '<option value="">ផ្នែកទាំងអស់</option>' + depts.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('psQ').value = ''; $('psAll').checked = false;   // ប្តូរខែ → ដកការជ្រើសរើសចាស់
    const tableErr = typeof featureErrors !== 'undefined' && featureErrors.announcements;
    $('psStatus').innerHTML = (tableErr ? '<div class="ps-warn">⚠️ មិនទាន់មានតារាង "announcements" ក្នុង Supabase — សូមដំណើរការ features.sql ជាមុន។</div>' : '')
      + (locked ? '' : `<div class="ps-warn">🔓 ខែ ${esc(month)} មិនទាន់បិទ — ចំនួនអាចប្រែប្រួល។ គួរបិទខែជាមុនសិន មុនផ្ញើ Payslip (Telegram ត្រូវការខែដែលបិទរួច)។</div>`);
    ov.querySelectorAll('#psBody .ps-chk').forEach(c => { c.checked = false; });
    renderList();
  }

  function open() {
    if (!ov) build();
    const $ = id => ov.querySelector('#' + id);
    $('psChPush').checked = true; $('psChTg').checked = false; $('psPw').value = ''; $('psPwRow').style.display = 'none';
    $('psAmt').checked = false; $('psAmtWarn').style.display = 'none';
    loadMonth(curMonth());
    ov.classList.add('open');
  }

  // ---------------------------------------------------------------- ផ្ញើ ----
  async function sendPush(picked, withAmounts) {
    const stamp = Date.now().toString(36);
    const now = new Date().toISOString();
    const out = picked.map(({ e, t }) => {
      const m = messageFor(e, t, withAmounts);
      const id = sentCount(e.id) ? `${baseId(e.id)}_${stamp}` : baseId(e.id);
      return { id, title: m.title, body: m.body, target_type: 'employee', target_value: e.id, created_at: now };
    });
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
    }
    if (typeof renderAnnouncements === 'function') { try { renderAnnouncements(); } catch (e) { /* ignore */ } }
    return errMsg
      ? `🔔 Push: ផ្ញើបាន ${okCount}/${out.length} នាក់ — មានបញ្ហា៖ ${errMsg}`
      : `🔔 Push: ✓ បានផ្ញើទៅ ${okCount} នាក់`;
  }

  // ---------------------------------------------------------------- Telegram ----
  async function callFn(action, extra, pw) {
    let data, error;
    try {
      ({ data, error } = await supabaseClient.functions.invoke('send-payslip', { body: { action, admin_password: pw, month, ...extra } }));
    } catch (ex) { error = ex; }
    if (error) {
      let m = String(error.message || error);
      try { const b = await error.context.json(); if (b && b.error) m = b.error; } catch (e) { /* ignore */ }
      throw new Error(m);
    }
    return data || {};
  }
  const nameOf = id => ((rows.find(r => r.e.id === id) || {}).e || {}).name || id;

  // server អានចំនួនទឹកប្រាក់ពី payroll_snapshots ខ្លួនឯង (មិនទុកចិត្តតម្លៃពី browser)
  async function sendTelegram(ids, pw) {
    let data;
    try {
      data = await callFn('send', { employee_ids: ids, request_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) }, pw);
    } catch (ex) { return `✈️ Telegram: មានបញ្ហា៖ ${ex.message}`; }
    const res = data.results || [];
    if (typeof logAudit === 'function') res.filter(r => r.ok).forEach(r => logAudit('payslip_telegram', { entity: 'payslip', ref: `${baseId(r.employee_id)}_telegram`, month, employeeId: r.employee_id, new: { channel: 'telegram' } }));
    const ok = res.filter(r => r.ok).length, bad = res.filter(r => !r.ok);
    return `✈️ Telegram: ផ្ញើបាន ${ok}/${res.length}`
      + (bad.length ? '\nបរាជ័យ៖\n' + bad.slice(0, 10).map(r => `• ${nameOf(r.employee_id)}: ${r.error}`).join('\n') + (bad.length > 10 ? `\n…(+${bad.length - 10})` : '') : '');
  }

  const askPw = msg => (typeof customPrompt === 'function' ? customPrompt(msg, true) : Promise.resolve(window.prompt(msg)));

  async function makeLinks() {
    const ids = selectedIds();
    if (!ids.length) { await customAlert('សូមជ្រើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    const pw = await askPw('បញ្ចូលពាក្យសម្ងាត់ admin ដើម្បីបង្កើតតំណភ្ជាប់ Telegram៖');
    if (!pw) return;
    let data;
    try {
      data = await callFn('create_links', { employee_ids: ids }, pw);
      if ((data.already_linked || []).length && await customConfirm(`មាន ${data.already_linked.length} នាក់ភ្ជាប់ Telegram រួចហើយ។ បង្កើតតំណថ្មីសម្រាប់ពួកគេដែរឬទេ? (ភ្ជាប់ម្តងទៀតនឹងជំនួស chat ដើម)`)) {
        const again = await callFn('create_links', { employee_ids: data.already_linked, force: true }, pw);
        data = { ...data, links: [...(data.links || []), ...(again.links || [])], already_linked: [] };
      }
    } catch (ex) { await customAlert('មានបញ្ហា៖ ' + ex.message); return; }
    showLinks(data);
  }

  // ដាក់ chat ID ដោយដៃ — server ផ្ញើសារសាកល្បងមុនរក្សាទុក
  async function setChatId() {
    const ids = selectedIds();
    if (ids.length !== 1) { await customAlert('សូមធីកជ្រើសបុគ្គលិកតែម្នាក់ក្នុងតារាង ដើម្បីដាក់ Chat ID'); return; }
    const raw = typeof customPrompt === 'function' ? await customPrompt(`បញ្ចូល Telegram Chat ID របស់ ${nameOf(ids[0])} (លេខ)។\nបុគ្គលិកត្រូវចុច Start លើ bot ជាមុន។ រក ID បានតាម @userinfobot៖`) : window.prompt('Telegram Chat ID');
    const chatId = String(raw || '').trim();
    if (!chatId) return;
    if (!/^\d{5,15}$/.test(chatId)) { await customAlert('Chat ID ត្រូវតែជាលេខ (ឧ. 123456789)'); return; }
    const pw = await askPw('បញ្ចូលពាក្យសម្ងាត់ admin៖');
    if (!pw) return;
    try {
      const d = await callFn('set_chat', { employee_ids: ids, chat_id: chatId }, pw);
      await customAlert(`✓ ភ្ជាប់ Telegram ជាមួយ ${d.name || nameOf(ids[0])} រួចរាល់ (បានផ្ញើសារសាកល្បងទៅ chat នោះ)`);
    } catch (ex) { await customAlert('មានបញ្ហា៖ ' + ex.message); }
  }

  function showLinks(data) {
    const links = data.links || [], linked = data.already_linked || [];
    const text = links.map(l => `${l.name || nameOf(l.employee_id)}\t${l.url}`).join('\n');
    const w = document.createElement('div');
    w.className = 'ps-ovl open'; w.style.zIndex = 9973;
    w.innerHTML = `<div class="ps-box" style="max-width:720px" role="dialog" aria-modal="true">
      <h2>🔗 តំណភ្ជាប់ Telegram</h2>
      <p class="ps-note">ផ្ញើតំណនីមួយៗទៅបុគ្គលិកនោះផ្ទាល់ (ប្រើបានម្តង · ផុតកំណត់ ${esc(data.expires_days || 7)} ថ្ងៃ)។ បុគ្គលិកចុចតំណ → ចុច Start លើ bot → ភ្ជាប់ដោយស្វ័យប្រវត្តិ។ កុំចែករំលែកតំណរបស់អ្នកដទៃ។</p>
      ${linked.length ? `<div class="ps-warn">✓ ភ្ជាប់រួចហើយ (រំលង)៖ ${esc(linked.map(nameOf).join(', '))}</div>` : ''}
      <textarea readonly style="width:100%;min-height:200px;font-size:.78rem;white-space:pre">${esc(text)}</textarea>
      <div class="ps-row" style="justify-content:flex-end"><button class="secondary" data-act="copy" type="button" ${links.length ? '' : 'disabled'}>📋 ចម្លង</button><button data-act="close" type="button">បិទ</button></div></div>`;
    document.body.appendChild(w);
    const done = () => w.remove();
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelector('[data-act="close"]').addEventListener('click', done);
    w.querySelector('[data-act="copy"]').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(text); e.target.textContent = '✓ បានចម្លង'; } catch (x) { w.querySelector('textarea').select(); }
    });
  }

  async function send() {
    const $ = id => ov.querySelector('#' + id);
    const ids = selectedIds();
    if (!ids.length) { await customAlert('សូមជ្រើសបុគ្គលិកយ៉ាងហោចណាស់ម្នាក់'); return; }
    const doPush = $('psChPush').checked, doTg = $('psChTg').checked;
    if (!doPush && !doTg) { await customAlert('សូមជ្រើសបណ្តាញផ្ញើយ៉ាងហោចណាស់មួយ'); return; }
    if (doPush && typeof featureErrors !== 'undefined' && featureErrors.announcements) { await customAlert('មិនទាន់មានតារាង announcements — សូមដំណើរការ features.sql ជាមុន'); return; }
    const pw = $('psPw').value;
    if (doTg && !pw) { await customAlert('សូមបញ្ចូលពាក្យសម្ងាត់ admin សម្រាប់ Telegram'); return; }
    const locked = typeof isMonthLocked === 'function' && isMonthLocked(month);
    if (doTg && !locked) { await customAlert(`Telegram ត្រូវការខែ ${month} ដែលបានបិទរួច (មាន snapshot)។ សូមបិទខែជាមុន។`); return; }

    const withAmounts = $('psAmt').checked;
    const picked = rows.filter(r => ids.includes(r.e.id));
    const again = doPush ? picked.filter(r => sentCount(r.e.id) > 0).length : 0;
    const preview = picked.slice(0, 8).map(r => r.e.name).join(', ') + (picked.length > 8 ? ` …(+${picked.length - 8})` : '');
    const chNames = [doPush && '🔔 Push', doTg && '✈️ Telegram'].filter(Boolean).join(' + ');
    const msg = `ផ្ញើ Payslip ខែ ${month} ទៅ ${picked.length} នាក់ (${chNames})?\n${preview}`
      + (again ? `\n\nមាន ${again} នាក់ធ្លាប់ទទួល Push រួចហើយ — នឹងផ្ញើជាសារថ្មីម្តងទៀត` : '')
      + (doPush && withAmounts ? '\n\n⚠ សារ Push មានចំនួនទឹកប្រាក់' : '')
      + (locked ? '' : '\n\n⚠ ខែនេះមិនទាន់បិទ — ចំនួនអាចប្រែប្រួលក្រោយ');
    if (!(await customConfirm(msg))) return;

    const btn = $('psSend'); btn.disabled = true;
    const parts = [];
    try {
      if (doPush) parts.push(await sendPush(picked, withAmounts));
      if (doTg) parts.push(await sendTelegram(ids, pw));
    } catch (ex) {
      parts.push('មានបញ្ហា៖ ' + String(ex && ex.message || ex));
    } finally {
      $('psPw').value = '';
      btn.disabled = false;
    }
    renderList();
    await customAlert(parts.join('\n\n'));
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
