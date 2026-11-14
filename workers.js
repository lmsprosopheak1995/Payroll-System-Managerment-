/* workers.js — ម៉ូឌុលកម្មករ (ស៊ីឡូ · ស៊ីថ្ងៃ · ប្រើបុង) ដាច់ដោយឡែក៖ បញ្ជី · ស្កេន QR · វត្តមាន · បើកប្រាក់
 * តម្រូវ៖ workers.sql (និង admin-users.sql) ត្រូវបានរត់ក្នុង Supabase
 * ដំឡើង៖ ក្នុង index.html មុន ui-modern.js →  <script src="workers.js"></script> */
(function () {
  'use strict';
  const USE_QR = false;   // false = កត់វត្តមានដោយដៃ (លាក់ QR) · true = បើកផ្នែកស្កេន QR និងកាត QR
  const TYPES = { silo: 'កម្មករស៊ីឡូ', daily: 'កម្មករស៊ីថ្ងៃ', voucher: 'កម្មករប្រើបុង' };
  const FREQ = { daily: 'រាល់ថ្ងៃ', weekly: 'រាល់សប្តាហ៍', semimonthly: '២ ដង/ខែ', monthly: 'ខែម្តង' };
  const ERR = { forbidden: 'គ្មានសិទ្ធិ ឬ session ផុតកំណត់ — សូមចូលគណនីម្តងទៀត', invalid: 'ទិន្នន័យមិនត្រឹមត្រូវ', already_paid: 'ថ្ងៃនេះបានបើកប្រាក់រួចហើយ មិនអាចកែបានទេ',
    nothing: 'គ្មានថ្ងៃដែលត្រូវបើកដល់កាលបរិច្ឆេទនេះទេ', unknown_qr: 'QR មិនស្គាល់ ឬកម្មករត្រូវបានបិទ', bad_time: 'ម៉ោងចេញត្រូវក្រោយម៉ោងចូល', too_soon: 'ទើបស្កេនចូល — សូមរង់ចាំ ១ នាទីមុនស្កេនចេញ', already_done: 'បានស្កេនចូល-ចេញរួចហើយថ្ងៃនេះ' };
  const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);   // ម៉ោងភ្នំពេញ
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const tok = () => { try { return sessionStorage.getItem('app_session_token') || ''; } catch (_) { return ''; } };
  const money = (n, c) => c === 'KHR' ? Math.round(n).toLocaleString('en-US') + ' ៛' : '$' + Number(n).toFixed(2);
  const pp = t => t ? new Date(new Date(t).getTime() + 7 * 3600e3).toISOString().slice(11, 16) : '';   // HH:MM ម៉ោងភ្នំពេញ
  const hm = t => t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  const say = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));

  function h(tag, p, ...kids) {
    const el = document.createElement(tag);
    for (const k in (p || {})) {
      const v = p[k];
      if (v == null) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return el;
  }
  async function api(fn, args) {
    const { data, error } = await supabaseClient.rpc(fn, Object.assign({ p_token: tok() }, args || {}));
    if (error) { say((error.code === 'PGRST202' ? 'សូមរត់ workers.sql ក្នុង Supabase ជាមុន' : 'មានបញ្ហា៖ ' + error.message)); return null; }
    if (data && data.ok === false) { say(ERR[data.error] || ('កំហុស៖ ' + data.error)); return null; }
    return data;
  }

  const S = { sub: 'list', workers: [], date: today(), upto: today(), edit: null };
  let scanner = null, lastScan = { t: '', at: 0 };
  let root, body;

  // សារពេលគ្មានកម្មករសកម្ម៖ ប្រាប់ថាមានកម្មករបិទប៉ុន្មាននាក់ ដើម្បីងាយបើកឡើងវិញ
  const noActive = () => { const n = S.workers.filter(w => !w.active).length; return 'មិនទាន់មានកម្មករសកម្មទេ' + (n ? ' — មានកម្មករបិទ ' + n + ' នាក់ សូមចូល «បញ្ជីកម្មករ» ហើយចុច ✅ បើក' : ' — សូមបន្ថែមក្នុង «បញ្ជីកម្មករ»'); };
  const SUBS = [['list', '👷 បញ្ជីកម្មករ'], ['scan', '📷 ស្កេន QR'], ['att', '🗓 វត្តមាន'], ['pay', '💵 បើកប្រាក់'], ['loan', '💳 កម្ចី']].filter(s => USE_QR || s[0] !== 'scan');

  async function stopScan() { if (scanner) { try { await scanner.stop(); scanner.clear(); } catch (_) { /* ignore */ } scanner = null; } }
  async function render() {
    if (!root) return;
    if (S.sub !== 'scan') await stopScan();
    const d = await api('wk_list'); if (!d) return;
    S.workers = d.workers;
    root.querySelectorAll('[data-sub]').forEach(b => b.classList.toggle('secondary', b.dataset.sub !== S.sub));
    body.textContent = '';
    ({ list: viewList, scan: viewScan, att: viewAtt, pay: viewPay, loan: viewLoan })[S.sub]();
  }

  // ---------------------------------------------------------------- បញ្ជីកម្មករ ----
  function viewList() {
    const f = S.edit || { name: '', type: 'daily', rate: '', currency: 'USD', pay_freq: 'monthly', phone: '', active: true, ot_rate: '', normal_hours: 8, ot_mult: 1.5 };
    const sel = (opts, val) => { const s = h('select'); Object.keys(opts).forEach(k => s.appendChild(h('option', { value: k, text: opts[k] }))); s.value = val; return s; };
    const inName = h('input', { type: 'text', placeholder: 'ឈ្មោះកម្មករ *', value: f.name }), inType = sel(TYPES, f.type),
      inRate = h('input', { type: 'number', min: '0', step: '0.01', placeholder: 'ថ្លៃឈ្នួល/ថ្ងៃ *', value: f.rate }), inCur = sel({ USD: '$ ដុល្លារ', KHR: '៛ រៀល' }, f.currency),
      inFreq = sel(FREQ, f.pay_freq), inPhone = h('input', { type: 'text', placeholder: 'លេខទូរស័ព្ទ', value: f.phone }),
      inOt = h('input', { type: 'number', min: '0', step: '0.01', placeholder: 'អត្រា OT/ម៉ោង (ទទេ = គណនាស្វ័យប្រវត្តិ)', title: 'ទទេ = ថ្លៃថ្ងៃ ÷ ម៉ោងធម្មតា × មេគុណ', value: f.ot_rate }),
      inNh = h('input', { type: 'number', min: '1', max: '24', step: '0.5', placeholder: 'ម៉ោងធម្មតា/ថ្ងៃ (8)', value: f.normal_hours }), inMult = h('input', { type: 'number', min: '0', step: '0.1', placeholder: 'មេគុណ OT (1.5)', value: f.ot_mult });
    const save = h('button', { type: 'button', text: S.edit ? '💾 រក្សាទុក' : '➕ បន្ថែមកម្មករ', onclick: async () => {
      const r = await api('wk_save', { p_w: { id: f.id || null, name: inName.value, type: inType.value, rate: inRate.value, currency: inCur.value, pay_freq: inFreq.value, phone: inPhone.value, active: f.active, ot_rate: inOt.value, normal_hours: inNh.value, ot_mult: inMult.value } });
      if (r) { S.edit = null; render(); } } });
    body.appendChild(h('div', { class: 'scan-result-card' }, h('h3', { class: 'sec-title', text: S.edit ? '✏️ កែកម្មករ ' + f.code : '➕ បន្ថែមកម្មករថ្មី' }),
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;' }, inName, inType, inRate, inCur, inFreq, inPhone, inOt, inNh, inMult),
      h('div', { style: 'margin-top:12px;display:flex;gap:8px;' }, save, S.edit ? h('button', { class: 'secondary', type: 'button', text: 'បោះបង់', onclick: () => { S.edit = null; render(); } }) : null)));
    const rows = S.workers.map(w => h('tr', null,
      h('td', { text: w.code }), h('td', { text: w.name }), h('td', { text: TYPES[w.type] }), h('td', { text: money(w.rate, w.currency) + '/ថ្ងៃ' }),
      h('td', { text: w.ot_rate != null ? money(w.ot_rate, w.currency) + '/ម៉ោង' : '÷' + w.normal_hours + ' × ' + w.ot_mult }),
      h('td', { text: FREQ[w.pay_freq] }), h('td', { text: w.active ? '✅ សកម្ម' : '⛔ បិទ' }),
      h('td', null, h('div', { style: 'display:flex;gap:6px;justify-content:center;flex-wrap:wrap;' },
        h('button', { class: 'secondary', type: 'button', text: '✏️ កែ', onclick: () => { S.edit = w; render(); } }),
        USE_QR ? h('button', { class: 'secondary', type: 'button', text: '🔳 QR', onclick: () => printCards([w]) }) : null,
        h('button', { class: 'secondary', type: 'button', text: w.active ? '⛔ បិទ' : '✅ បើក', onclick: async () => {
          if (w.active) {     // ព្រមានបើមានបំណុលកម្ចីនៅសល់ ឬសំណើរង់ចាំ
            const lr = await rpcQuiet('wk_loan_list');
            if (lr && !lr._err) {
              const rp = lr.repaid || {}, mine = (lr.loans || []).filter(l => String(l.worker_id) === String(w.id));
              const debt = mine.filter(l => l.status === 'approved' || l.status === 'cancelled').reduce((a, l) => a + Math.max(0, Number(l.amount) - Number(rp[l.id] || 0)), 0);
              const pend = mine.some(l => l.status === 'pending');
              if (debt > 0 || pend) {
                if (!confirm('⚠️ ' + w.name + ' មាន' + (debt > 0 ? 'បំណុលកម្ចីនៅសល់ ' + money(debt, w.currency) : '') + (debt > 0 && pend ? ' និង' : '') + (pend ? 'សំណើកម្ចីកំពុងរង់ចាំ' : '') + '។\n\nមុនបិទ សូមបើកប្រាក់ចុងក្រោយសិន (ប្រព័ន្ធនឹងកាត់បំណុលទាំងអស់ពីប្រាក់ដែលត្រូវបើក)។\nបិទកម្មករឥឡូវនេះឬ?')) return;
              }
            }
          }
          if (await api('wk_save', { p_w: Object.assign({}, w, { active: !w.active }) })) render(); } })))));
    if (USE_QR) body.appendChild(h('div', { style: 'margin:12px 0;' }, h('button', { class: 'secondary', type: 'button', text: '🖨 បោះពុម្ពកាត QR (កម្មករសកម្មទាំងអស់)', onclick: () => printCards(S.workers.filter(w => w.active)) })));
    body.appendChild(h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, ['លេខកូដ', 'ឈ្មោះ', 'ប្រភេទ', 'ថ្លៃឈ្នួល', 'OT/ម៉ោង', 'បើកប្រាក់', 'ស្ថានភាព', ''].map(t => h('th', { text: t })))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: '8', text: 'មិនទាន់មានកម្មករទេ' }))))));
  }

  function printCards(list) {
    if (!list.length) { say('គ្មានកម្មករដើម្បីបោះពុម្ពទេ'); return; }
    if (typeof qrcode !== 'function') { say('មិនអាចផ្ទុកម៉ូឌុល QR បានទេ'); return; }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const cards = list.map(w => { const q = qrcode(0, 'M'); q.addData('WK:' + w.qr_token); q.make();
      return '<div class="c">' + q.createImgTag(5) + '<b>' + esc(w.name) + '</b><span>' + esc(w.code) + ' · ' + esc(TYPES[w.type]) + '</span></div>'; }).join('');
    const win = window.open('', '_blank');
    if (!win) { say('សូមអនុញ្ញាត pop-up ដើម្បីបោះពុម្ព'); return; }
    win.document.write('<!doctype html><meta charset="utf-8"><title>កាត QR កម្មករ</title><style>body{font-family:sans-serif;display:flex;flex-wrap:wrap;gap:12px;padding:12px}.c{width:200px;border:1px solid #999;border-radius:10px;padding:10px;text-align:center;page-break-inside:avoid}.c img{width:150px;height:150px}.c b{display:block;margin-top:6px}.c span{font-size:12px;color:#444}</style>' + cards + '<script>onload=()=>print()<\/script>');
    win.document.close();
  }

  // ---------------------------------------------------------------- ស្កេន QR ----
  function viewScan() {
    const out = h('div', { class: 'scan-result-card', style: 'min-height:56px;', text: 'ចុច «ចាប់ផ្តើមស្កេន» រួចដាក់កាត QR របស់កម្មករចំពីមុខកាមេរ៉ា។ ស្កេនលើកទី១ = ចូល · លើកទី២ = ចេញ។' });
    const onScan = async text => {
      if (text === lastScan.t && Date.now() - lastScan.at < 4000) return;
      lastScan = { t: text, at: Date.now() };
      const { data, error } = await supabaseClient.rpc('wk_scan', { p_token: tok(), p_qr: text });
      const ok = !error && data && data.ok;
      out.textContent = ok ? (data.action === 'in' ? '✅ ចូល · ' : '🏁 ចេញ · ') + data.name + ' (' + data.code + ') ' + hm(new Date())
        : '✕ ' + (error ? error.message : (ERR[data.error] || data.error) + (data.name ? ' — ' + data.name : ''));
      out.style.borderColor = ok ? 'var(--success)' : 'var(--danger)';
    };
    const start = h('button', { type: 'button', text: '▶ ចាប់ផ្តើមស្កេន', onclick: async () => {
      if (typeof Html5Qrcode === 'undefined') { out.textContent = 'មិនអាចផ្ទុកម៉ូឌុលស្កេនបានទេ'; return; }
      await stopScan(); scanner = new Html5Qrcode('wkReader');
      scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onScan, () => {}).catch(() => { out.textContent = '✕ មិនអាចបើកកាមេរ៉ាបានទេ (ត្រូវការ https និងសិទ្ធិកាមេរ៉ា)'; });
    } });
    body.appendChild(h('div', { class: 'scan-camera-card' }, h('div', { id: 'wkReader', style: 'max-width:360px;margin:0 auto;' }),
      h('div', { style: 'display:flex;gap:8px;justify-content:center;margin-top:10px;' }, start, h('button', { class: 'secondary', type: 'button', text: '■ ឈប់', onclick: stopScan }))));
    body.appendChild(out);
  }

  // ---------------------------------------------------------------- វត្តមាន ----
  async function viewAtt() {
    const d = await api('wk_att_list', { p_date: S.date }); if (!d) return;
    const by = {}; d.rows.forEach(r => { by[r.worker_id] = r; });
    const date = h('input', { type: 'date', value: S.date, onchange: e => { if (e.target.value) { S.date = e.target.value; render(); } } });
    body.appendChild(h('div', { class: 'toolbar', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
      h('button', { class: 'secondary', type: 'button', text: '◀', onclick: () => { S.date = addDays(S.date, -1); render(); } }), date,
      h('button', { class: 'secondary', type: 'button', text: '▶', onclick: () => { S.date = addDays(S.date, 1); render(); } }),
      h('button', { class: 'secondary', type: 'button', text: 'ថ្ងៃនេះ', onclick: () => { S.date = today(); render(); } }),
      h('button', { type: 'button', text: '✅ មកពេញថ្ងៃទាំងអស់ (ដែលមិនទាន់កត់)', onclick: async () => {
        const todo = S.workers.filter(w => w.active && !by[w.id]);
        if (!todo.length) { say('កម្មករទាំងអស់ត្រូវបានកត់រួចហើយ'); return; }
        if (!confirm('កត់ «មកពេញថ្ងៃ» ឱ្យកម្មករ ' + todo.length + ' នាក់ ថ្ងៃទី ' + S.date + '? (កម្មករប្រើបុង ត្រូវវាយចំនួនបុងបន្ថែម)')) return;
        for (const w of todo) { if (!(await api('wk_att_set', { p_worker: w.id, p_date: S.date, p_day: 1, p_vouchers: 0 }))) break; }
        render(); } })));
    const rows = S.workers.filter(w => w.active).map(w => {
      const r = by[w.id] || {}, paid = !!r.payment_id;
      const day = h('select', { disabled: paid ? '' : null }, [['1', 'មកពេញថ្ងៃ'], ['0.5', 'កន្លះថ្ងៃ'], ['0', 'អវត្តមាន']].map(o => h('option', { value: o[0], text: o[1] })));
      day.value = r.id ? String(Number(r.day_value)) : '0';
      const vo = w.type === 'voucher' ? h('input', { type: 'number', min: '0', step: '1', value: r.vouchers || 0, style: 'width:80px;', disabled: paid ? '' : null }) : null;
      const ot = h('input', { type: 'number', min: '0', max: '24', step: '0.5', value: r.ot_hours || 0, style: 'width:70px;', disabled: paid ? '' : null });
      // មេគុណ OT ប្រចាំថ្ងៃ (ទទេ = ប្រើមេគុណរបស់កម្មករ) · មិនប្រើ បើកម្មករមានអត្រា OT/ម៉ោង កំណត់ជាប់
      let otm = null;
      if (w.ot_rate == null) {
        otm = h('select', { disabled: paid ? '' : null }, [['', 'លំនាំដើម ×' + w.ot_mult], ['1', '×1'], ['1.5', '×1.5'], ['2', '×2'], ['3', '×3']].map(o => h('option', { value: o[0], text: o[1] })));
        if (r.ot_mult != null && !Array.from(otm.options).some(o => Number(o.value) === Number(r.ot_mult) && o.value !== '')) otm.appendChild(h('option', { value: String(r.ot_mult), text: '×' + r.ot_mult }));
        otm.value = r.ot_mult != null ? String(Number(r.ot_mult)) : '';
      }
      const inT = h('input', { type: 'time', value: pp(r.check_in), disabled: paid ? '' : null }), outT = h('input', { type: 'time', value: pp(r.check_out), disabled: paid ? '' : null });
      const sv = async () => {
        if (!r.id && day.value === '0' && (inT.value || outT.value)) day.value = '1';   // មានម៉ោង = មកធ្វើការ
        if (await api('wk_att_set', { p_worker: w.id, p_date: S.date, p_day: Number(day.value), p_vouchers: vo ? Number(vo.value || 0) : 0, p_in: inT.value, p_out: outT.value, p_ot: Number(ot.value || 0), p_otm: otm ? otm.value : null })) { day.style.outline = '2px solid var(--success)'; }
        else render();
      };
      day.addEventListener('change', sv); inT.addEventListener('change', sv); outT.addEventListener('change', sv); ot.addEventListener('change', sv); if (otm) otm.addEventListener('change', sv); if (vo) vo.addEventListener('change', sv);
      return h('tr', null, h('td', { text: w.name + ' (' + w.code + ')' }), h('td', { text: TYPES[w.type] }), h('td', null, inT), h('td', null, outT),
        h('td', null, day), h('td', null, vo || '—'), h('td', null, ot), h('td', null, otm || '—'), h('td', { text: paid ? '✅ បានបើក' : '' }));
    });
    body.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['កម្មករ', 'ប្រភេទ', 'ចូល', 'ចេញ', 'ថ្ងៃធ្វើការ', 'បុង', 'OT (ម៉ោង)', 'មេគុណ OT', ''].map(t => h('th', { text: t })))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: '9', text: noActive() }))))));
    body.appendChild(h('p', { class: 'scan-hint', text: 'កម្មករប្រើបុង៖ ត្រូវមានបុងយ៉ាងតិច ១ ទើបថ្ងៃនោះរាប់ជាថ្ងៃដែលត្រូវបើកប្រាក់។ ថ្ងៃដែលបានបើកប្រាក់រួចមិនអាចកែបានទេ។ OT រាប់តែថ្ងៃដែលត្រូវបើកប្រាក់។ មេគុណ OT «លំនាំដើម» = ប្រើមេគុណរបស់កម្មករ (កម្មករមានអត្រា OT/ម៉ោងកំណត់ជាប់ មិនប្រើមេគុណប្រចាំថ្ងៃ)។' }));
  }

  // ---------------------------------------------------------------- បើកប្រាក់ ----
  async function viewPay() {
    const d = await api('wk_pay_due', { p_upto: S.upto }); if (!d) return;
    const hist = await api('wk_pay_history'); if (!hist) return;
    // កម្ចីកំពុងសង (ស្ងាត់ៗ បើមិនទាន់រត់ wk-loans.sql) → កាត់ស្វ័យប្រវត្តិពីការបើកប្រាក់នេះ
    const ld = await rpcQuiet('wk_loan_list'), loansBy = {};
    if (ld && !ld._err) { const rp = ld.repaid || {}; (ld.loans || []).filter(l => l.status === 'approved').forEach(l => { const bal = Math.max(0, Number(l.amount) - Number(rp[l.id] || 0)); if (bal > 0) loansBy[String(l.worker_id)] = Object.assign({}, l, { bal }); }); }
    const dedFor = (w, gross) => { const l = loansBy[String(w.id)]; if (!l || !(Number(gross) > 0)) return 0; const cap = w.active ? Math.min(l.bal, Number(l.installment_amount)) : l.bal; return Math.min(cap, Number(gross)); };   // កម្មករឈប់ = កាត់បំណុលនៅសល់ទាំងអស់ (ដល់ចំនួនប្រាក់ដែលត្រូវបើក)
    const due = {}; d.rows.forEach(r => { due[r.worker_id] = r; });
    const t = today(), ym = t.slice(0, 7), eomPrev = addDays(ym + '-01', -1), mid = t.slice(8) >= '15' ? ym + '-15' : eomPrev;
    const setUp = v => { S.upto = v; render(); };
    body.appendChild(h('div', { class: 'toolbar', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, h('span', { text: 'បើកដល់ថ្ងៃទី' }),
      h('input', { type: 'date', value: S.upto, onchange: e => { if (e.target.value) setUp(e.target.value); } }),
      h('button', { class: 'secondary', type: 'button', text: 'ថ្ងៃនេះ', onclick: () => setUp(t) }),
      h('button', { class: 'secondary', type: 'button', text: 'ម្សិលមិញ', onclick: () => setUp(addDays(t, -1)) }),
      h('button', { class: 'secondary', type: 'button', text: 'ថ្ងៃទី ១៥ / ចុងខែមុន', onclick: () => setUp(mid) })));
    const rows = S.workers.filter(w => w.active || Number((due[w.id] || {}).amount) > 0 || loansBy[String(w.id)]).map(w => { const r = due[w.id] || { days: 0, amount: 0 };
      return h('tr', null, h('td', { text: w.name + ' (' + w.code + ')' + (w.active ? '' : ' ⛔ ឈប់') }), h('td', { text: TYPES[w.type] }), h('td', { text: FREQ[w.pay_freq] }), h('td', { text: String(r.days) }), h('td', { text: String(r.ot_hours || 0) }),
        h('td', { text: money(r.amount, w.currency) }), h('td', { text: loansBy[String(w.id)] ? '−' + money(dedFor(w, r.amount), w.currency) + ' (នៅសល់ ' + money(loansBy[String(w.id)].bal, w.currency) + ')' + (w.active ? '' : ' · កាត់ទាំងអស់') : '—' }),
        h('td', null, h('b', { text: money(Number(r.amount) - dedFor(w, r.amount), w.currency) })),
        h('td', null, h('button', { type: 'button', text: '💵 បើកប្រាក់', disabled: r.days > 0 ? null : '', onclick: async () => {
          if (!confirm((w.active ? '' : '⛔ ប្រាក់ចុងក្រោយ (កម្មករឈប់) — កាត់បំណុលកម្ចីនៅសល់ពីប្រាក់នេះ\n') + 'បើកប្រាក់ឱ្យ ' + w.name + ' · ' + r.days + ' ថ្ងៃ' + (r.ot_hours ? ' + OT ' + r.ot_hours + ' ម៉ោង' : '') + ' · ' + money(r.amount, w.currency) + (dedFor(w, r.amount) > 0 ? ' − កម្ចី ' + money(dedFor(w, r.amount), w.currency) + ' = ទទួលសុទ្ធ ' + money(Number(r.amount) - dedFor(w, r.amount), w.currency) : '') + ' (ដល់ថ្ងៃទី ' + S.upto + ')?')) return;
          const p = await api('wk_pay', { p_worker: w.id, p_upto: S.upto }); if (p) {
            let ded = Math.min(dedFor(w, r.amount), Number(p.amount));
            if (ded > 0) { const rr = await rpcQuiet('wk_loan_repay', { p_loan: loansBy[String(w.id)].id, p_payment: String(p.id || p.payment_id || ''), p_amount: ded });
              if (rr && rr._err) { say('បានបើកប្រាក់ហើយ ប៉ុន្តែកត់ការកាត់កម្ចីមិនបាន (' + rr._err + ') — សូមកត់ការសងដោយដៃ'); ded = 0; } }
            const done = { name: w.name, code: w.code, paid_at: new Date().toISOString(), period_to: S.upto, days: p.days, ot_hours: p.ot_hours, amount: p.amount, currency: p.currency, day_rate: p.day_rate, ot_rate_used: p.ot_rate_used, loan_ded: ded };
            if (confirm('បានបើកប្រាក់ ' + money(p.amount, p.currency) + (ded > 0 ? ' កាត់កម្ចី ' + money(ded, p.currency) + ' ប្រគល់សុទ្ធ ' + money(Number(p.amount) - ded, p.currency) : '') + ' (' + p.days + ' ថ្ងៃ' + (p.ot_hours ? ' + OT ' + p.ot_hours + ' ម៉ោង' : '') + ')។ បោះពុម្ពបង្កាន់ដៃឬទេ?')) printReceipt(done);
            render(); } } }))); });
    body.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['កម្មករ', 'ប្រភេទ', 'បើកប្រាក់', 'ថ្ងៃមិនទាន់បើក', 'OT (ម៉ោង)', 'ទឹកប្រាក់', 'កាត់កម្ចី', 'ទទួលសុទ្ធ', ''].map(x => h('th', { text: x })))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: '9', text: noActive() }))))));
    body.appendChild(h('h3', { class: 'sec-title', style: 'margin-top:18px;', text: '🧾 ប្រវត្តិបើកប្រាក់ (៤០ ចុងក្រោយ)' }));
    body.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['កាលបរិច្ឆេទបើក', 'កម្មករ', 'ដល់ថ្ងៃ', 'ថ្ងៃ', 'OT (ម៉ោង)', 'ទឹកប្រាក់', ''].map(x => h('th', { text: x })))),
      h('tbody', null, hist.rows.length ? hist.rows.map(p => h('tr', null, h('td', { text: new Date(p.paid_at).toLocaleString('en-GB') }), h('td', { text: p.name + ' (' + p.code + ')' }),
        h('td', { text: p.period_to }), h('td', { text: String(p.days) }), h('td', { text: String(p.ot_hours || 0) }), h('td', { text: money(p.amount, p.currency) }), h('td', null, h('button', { class: 'secondary', type: 'button', text: '🖨 បោះពុម្ព', onclick: () => printReceipt(p) })))) : h('tr', null, h('td', { colspan: '7', text: 'មិនទាន់មានការបើកប្រាក់ទេ' }))))));
  }

  // ---------------------------------------------------------------- បង្កាន់ដៃបើកប្រាក់ (បោះពុម្ព) ----
  function printReceipt(p) {
    const w = S.workers.find(x => x.code === p.code) || {};
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const otr = w.ot_rate != null ? Number(w.ot_rate) : (w.rate && w.normal_hours ? w.rate / w.normal_hours * w.ot_mult : 0);
    const days = Number(p.days), ot = Number(p.ot_hours || 0);
    // បង្ហាញលម្អិតតែពេលអត្រាបច្ចុប្បន្នត្រូវនឹងទឹកប្រាក់ដែលបានបើក (អត្រាអាចបានប្តូរក្រោយ)
    const dr = p.day_rate != null ? Number(p.day_rate) : w.rate, orr = p.ot_rate_used != null ? Number(p.ot_rate_used) : otr;   // អត្រាដែលបានរក្សាទុកពេលបើក (បើមាន)
    const detail = dr != null && Math.abs(days * dr + ot * orr - Number(p.amount)) < 0.01;
    const row = (a, b) => '<tr><td>' + a + '</td><td class="r">' + b + '</td></tr>';
    const mixed = p.day_rate != null && p.ot_rate_used == null && ot > 0;   // OT មានមេគុណខុសគ្នាច្រើនថ្ងៃ
    const lines = mixed
      ? row('ថ្ងៃធ្វើការ ' + days + ' × ' + money(dr, p.currency), money(days * dr, p.currency)) + row('ថែមម៉ោង ' + ot + ' ម៉ោង (មេគុណខុសគ្នា)', money(Number(p.amount) - days * dr, p.currency))
      : detail
      ? row('ថ្ងៃធ្វើការ ' + days + ' × ' + money(dr, p.currency), money(days * dr, p.currency)) + (ot ? row('ថែមម៉ោង ' + ot + ' ម៉ោង × ' + money(orr, p.currency), money(ot * orr, p.currency)) : '')
      : row('ថ្ងៃធ្វើការ', days + ' ថ្ងៃ') + (ot ? row('ថែមម៉ោង', ot + ' ម៉ោង') : '');
    const win = window.open('', '_blank');
    if (!win) { say('សូមអនុញ្ញាត pop-up ដើម្បីបោះពុម្ព'); return; }
    win.document.write('<!doctype html><meta charset="utf-8"><title>បង្កាន់ដៃបើកប្រាក់</title>'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;700&display=swap">'
      + '<style>body{font-family:"Kantumruy Pro",sans-serif;max-width:380px;margin:20px auto;color:#111;font-size:14px}h1{font-size:18px;text-align:center;margin:0 0 4px}'
      + '.s{text-align:center;color:#555;font-size:12px;margin-bottom:14px}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px dashed #bbb}.r{text-align:right}'
      + '.t td{font-weight:700;font-size:16px;border-bottom:2px solid #111;padding-top:10px}.sg{display:flex;justify-content:space-between;margin-top:46px;font-size:12px;text-align:center}'
      + '.sg div{width:44%;border-top:1px solid #111;padding-top:4px}</style>'
      + '<h1>បង្កាន់ដៃបើកប្រាក់កម្មករ</h1><div class="s">' + esc(new Date(p.paid_at).toLocaleString('en-GB')) + '</div><table>'
      + row('ឈ្មោះ', esc(p.name) + ' (' + esc(p.code) + ')') + row('ប្រភេទ', esc(TYPES[w.type] || '')) + row('បើកប្រាក់ដល់ថ្ងៃទី', esc(p.period_to)) + lines
      + (Number(p.loan_ded) > 0 ? row('ប្រាក់ឈ្នួលសរុប', money(p.amount, p.currency)) + row('កាត់ប្រាក់កម្ចី', '−' + money(p.loan_ded, p.currency)) : '')
      + '<tr class="t"><td>សរុបទទួលបាន</td><td class="r">' + money(Number(p.amount) - Number(p.loan_ded || 0), p.currency) + '</td></tr></table>'
      + '<div class="sg"><div>អ្នកបើកប្រាក់</div><div>អ្នកទទួល</div></div><script>onload=()=>setTimeout(print,400)<\/script>');
    win.document.close();
  }

  // ---------------------------------------------------------------- ប្រាក់កម្ចីកម្មករ ----
  // ក្បួន (កែលេខទាំងនេះបាន)៖ កម្ចីសងយ៉ាងតិច 2 សប្តាហ៍ · កាត់ស្វ័យប្រវត្តិពីការបើកប្រាក់ម្តងៗរហូតអស់បំណុល · AI វិភាគហានិភ័យ
  const LN = {
    MIN_WEEKS: 2,            // រយៈពេលសងយ៉ាងតិច (សប្តាហ៍)
    WEEKS: [2, 3, 4, 6, 8, 12],
    MIN_DAYS_28: 10,         // ត្រូវធ្វើការបានយ៉ាងតិចប៉ុន្មានថ្ងៃ ក្នុង 28 ថ្ងៃចុងក្រោយ
    EXPECTED_28: 24,         // ថ្ងៃធ្វើការរំពឹងទុក ក្នុង 28 ថ្ងៃ (6 ថ្ងៃ/សប្តាហ៍)
    MAX_DAYS_RATE: 14,       // កម្ចីអតិបរមា = ថ្លៃឈ្នួល × 14 ថ្ងៃ (ប្រហែល 2 សប្តាហ៍) ហើយមិនលើសប្រាក់ដែលរកបានក្នុង 28 ថ្ងៃ
    AUTO_DAYS_RATE: 7,       // AI អនុម័តស្វ័យប្រវត្តិបាន តែបើមិនលើស ថ្លៃឈ្នួល × 7 ថ្ងៃ
    LOW: 75, MED: 50         // ពិន្ទុហានិភ័យ៖ ≥75 = ទាប · 50–74 = មធ្យម · <50 = ខ្ពស់
  };
  const PERIOD_WEEKS = { daily: 1 / 6, weekly: 1, semimonthly: 2, monthly: 4 };    // ប្រវែងវដ្តបើកប្រាក់ (សប្តាហ៍)
  const RISK = { low: ['ទាប', '#10b981'], medium: ['មធ្យម', '#f59e0b'], high: ['ខ្ពស់', '#ef4444'] };
  const RANK = { low: 0, medium: 1, high: 2 };
  const L = { loans: [], repaid: {}, reps: [], att: {}, res: null };
  const lnNum = n => String(Math.round(Number(n) * 10) / 10);
  const lnUnit = c => (c === 'KHR' ? 1000 : 1);
  const lnFloor = (v, c) => Math.max(0, Math.floor(v / lnUnit(c)) * lnUnit(c));
  const lnInst = (v, c) => (c === 'KHR' ? Math.ceil(v / 100) * 100 : Math.ceil(v * 100) / 100);
  const lnCount = (weeks, freq) => Math.max(1, Math.round(weeks / (PERIOD_WEEKS[freq] || 1)));
  const lnBal = l => Math.max(0, Number(l.amount) - Number(L.repaid[l.id] || 0));
  const lnWorker = id => S.workers.find(w => String(w.id) === String(id));

  async function rpcQuiet(fn, args) {            // ហៅ RPC ដោយមិនបង្ហាញសារកំហុស (ត្រឡប់ {_err} ពេលបរាជ័យ)
    const { data, error } = await supabaseClient.rpc(fn, Object.assign({ p_token: tok() }, args || {}));
    if (error) return { _err: error.code === 'PGRST202' ? 'missing' : error.message };
    if (data && data.ok === false) return { _err: data.error || 'error' };
    return data;
  }
  async function loanCall(fn, args) {
    const d = await rpcQuiet(fn, args);
    if (d && d._err) { say(d._err === 'missing' ? 'សូមរត់ wk-loans.sql ក្នុង Supabase ជាមុន (ឬរត់ឡើងវិញ ដើម្បីដំឡើងកំណែថ្មី)' : (d._err === 'forbidden' ? ERR.forbidden : ({ over_balance: 'ចំនួនលើសបំណុលនៅសល់', note_required: 'ត្រូវបញ្ចូលមូលហេតុ', invalid: 'សកម្មភាពមិនត្រឹមត្រូវសម្រាប់ស្ថានភាពកម្ចីនេះ' }[d._err] || 'មានបញ្ហា៖ ' + d._err))); return null; }
    return d;
  }
  async function loadLoans() {
    const d = await loanCall('wk_loan_list'); if (!d) return false;
    L.loans = d.loans || []; L.repaid = d.repaid || {}; L.reps = d.reps || [];
    return true;
  }

  // វត្តមាន 28 ថ្ងៃចុងក្រោយរបស់កម្មករម្នាក់ (ប្រើ wk_att_list ដែលមានស្រាប់ · cache ថ្ងៃកន្លងមក)
  async function attRows(date) {
    if (date !== today() && L.att[date]) return L.att[date];
    const r = await rpcQuiet('wk_att_list', { p_date: date });
    const rows = r && !r._err ? (r.rows || []) : null;
    if (rows && date !== today()) L.att[date] = rows;
    return rows;
  }
  async function workerStats(w) {
    const dates = []; for (let i = 0; i < 28; i++) dates.push(addDays(today(), -i));
    let worked = 0, absent = 0, missing = 0;
    for (let i = 0; i < dates.length; i += 7) {
      const chunk = await Promise.all(dates.slice(i, i + 7).map(attRows));
      chunk.forEach(rows => {
        if (!rows) { missing++; return; }
        rows.forEach(r => { if (String(r.worker_id) === String(w.id)) { const v = Number(r.day_value || 0); worked += v; if (v === 0) absent++; } });
      });
    }
    return { worked, absent, missing, earned: worked * Number(w.rate || 0) };
  }

  // ក្បួនវាយតម្លៃដែលកំណត់ច្បាស់ (មិនពឹង AI) → ហានិភ័យ + ការអនុញ្ញាតអនុម័តស្វ័យប្រវត្តិ
  function assess(w, amount, weeks, st, loans) {
    const cur = w.currency, rate = Number(w.rate || 0), wid = String(w.id);
    const maxLoan = lnFloor(Math.min(rate * LN.MAX_DAYS_RATE, st.earned), cur);
    const autoLimit = lnFloor(Math.min(rate * LN.AUTO_DAYS_RATE, maxLoan), cur);
    const bal = loans.filter(l => l.worker_id === wid && (l.status === 'approved' || l.status === 'cancelled')).reduce((a, l) => a + lnBal(l), 0);   // រួមទាំងកម្ចីដែលបានបញ្ឈប់ការកាត់ តែនៅមានបំណុល
    const wroteOff = loans.filter(l => l.worker_id === wid && l.status === 'written_off').length;
    const pending = loans.some(l => l.worker_id === wid && l.status === 'pending');
    const att = st.worked / LN.EXPECTED_28;
    const checks = [
      { ok: !!w.active, hard: true, text: 'កម្មករនៅសកម្ម' },
      { ok: st.worked >= LN.MIN_DAYS_28, hard: true, text: `ធ្វើការបាន ${lnNum(st.worked)} ថ្ងៃ ក្នុង 28 ថ្ងៃចុងក្រោយ (ត្រូវការយ៉ាងតិច ${LN.MIN_DAYS_28} ថ្ងៃ)` },
      { ok: amount > 0 && amount <= maxLoan, hard: true, text: `ចំនួន ${money(amount, cur)} មិនលើសកម្ចីអតិបរមា ${money(maxLoan, cur)}` },
      { ok: weeks >= LN.MIN_WEEKS, hard: true, text: `រយៈពេលសងយ៉ាងតិច ${LN.MIN_WEEKS} សប្តាហ៍` },
      { ok: bal <= 0 && !pending, hard: false, text: bal > 0 ? `មានកម្ចីកំពុងសង ${money(bal, cur)}` : (pending ? 'មានសំណើកម្ចីរង់ចាំរួចហើយ' : 'គ្មានកម្ចីកំពុងសង') },
      { ok: att >= 0.6, hard: false, text: `វត្តមាន ${Math.round(att * 100)}% នៃ ${LN.EXPECTED_28} ថ្ងៃ` },
      { ok: wroteOff === 0, hard: false, text: wroteOff ? `មានប្រវត្តិលុបបំណុល ${wroteOff} ដងពីមុន` : 'គ្មានប្រវត្តិលុបបំណុល' },
    ];
    let score = 100;
    if (!checks[0].ok) score -= 40;
    if (!checks[1].ok) score -= 40;
    if (!checks[2].ok) score -= 40;
    if (!checks[3].ok) score -= 30;
    if (!checks[4].ok) score -= 25;
    if (att < 0.6) score -= 25; else if (att < 0.8) score -= 12;
    if (maxLoan > 0 && amount > maxLoan * 0.7) score -= 10;
    if (!checks[6].ok) score -= 40;
    if (st.absent >= 5) score -= 8;
    score = Math.max(0, score);
    const hardOk = checks.filter(c => c.hard).every(c => c.ok);
    const risk = score >= LN.LOW ? 'low' : score >= LN.MED ? 'medium' : 'high';
    const n = lnCount(weeks, w.pay_freq), inst = lnInst(amount / n, cur);
    const autoOk = hardOk && risk === 'low' && amount <= autoLimit && bal <= 0 && !pending;
    return { cur, maxLoan, autoLimit, bal, checks, score, risk, hardOk, autoOk, n, inst };
  }

  // AI វិភាគ (Gemini តាម callAiApi ក្នុង ai.js)៖ ផ្ញើតែលេខអនាមិក (គ្មានឈ្មោះ/ទូរស័ព្ទ) · AI អាចបន្ថយ ប៉ុន្តែមិនអាចលើកកម្ពស់ហានិភ័យពីក្បួនបានទេ
  async function aiReview(w, amount, weeks, st, a) {
    if (typeof callAiApi !== 'function' || typeof aiApiKey !== 'function' || !aiApiKey()) return null;
    const payload = {
      workerType: w.type, payFrequency: w.pay_freq, currency: w.currency, dayRate: Number(w.rate),
      requestedAmount: amount, repaymentWeeks: weeks, installments: a.n, installmentAmount: a.inst,
      daysWorkedLast28: st.worked, absentRecordsLast28: st.absent, attendancePct: Math.round((st.worked / LN.EXPECTED_28) * 100),
      earnedLast28: st.earned, maxLoanByRules: a.maxLoan, outstandingLoan: a.bal, rulesRisk: a.risk, rulesScore: a.score,
      failedChecks: a.checks.filter(c => !c.ok).map(c => c.text),
    };
    const system = 'អ្នកគឺជាអ្នកវិភាគហានិភ័យកម្ចីតូចសម្រាប់កម្មករ។ ទិន្នន័យខាងក្រោមជាលេខអនាមិក។ ប្រើតែទិន្នន័យដែលបានផ្តល់ កុំប្រឌិត។ ' +
      'ឆ្លើយតបជា JSON ប៉ុណ្ណោះ (គ្មានអត្ថបទផ្សេង គ្មាន markdown) ក្នុងទម្រង់៖ {"risk":"low|medium|high","summary":"សង្ខេបជាភាសាខ្មែរមិនលើស 50 ពាក្យ","concerns":["ចំណុចព្រួយបារម្ភខ្លី"]}។ ' +
      'ក្បួនបានគណនា rulesRisk រួចហើយ អ្នកអាចយល់ស្រប ឬប្រុងប្រយ័ត្នជាង ប៉ុន្តែកុំបង្កើតហានិភ័យទាបជាងក្បួន។';
    const text = await callAiApi({ system, messages: [{ role: 'user', content: JSON.stringify(payload) }], maxTokens: 500 });
    if (!text) return null;
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const j = JSON.parse(m[0]);
      if (!RISK[j.risk]) return null;
      return { risk: j.risk, summary: String(j.summary || '').slice(0, 400), concerns: Array.isArray(j.concerns) ? j.concerns.slice(0, 4).map(x => String(x).slice(0, 120)) : [] };
    } catch (e) { return null; }
  }

  function resultCard(R) {
    const [rl, rc] = RISK[R.finalRisk];
    const card = h('div', { class: 'scan-result-card', style: 'margin-top:12px;border-left:4px solid ' + rc + ';' });
    card.appendChild(h('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;' },
      h('b', { text: '🤖 លទ្ធផលវិភាគ · ' + R.w.name }),
      h('span', { style: 'padding:3px 12px;border-radius:999px;font-weight:700;background:' + rc + '22;color:' + rc + ';', text: 'ហានិភ័យ ' + rl + ' (' + R.a.score + '/100)' })));
    card.appendChild(h('div', { style: 'margin:8px 0;font-size:.9rem;', text: money(R.amount, R.a.cur) + ' · សង ' + R.weeks + ' សប្តាហ៍ · កាត់ ' + R.a.n + ' ដង × ' + money(R.a.inst, R.a.cur) + ' (តាមវដ្តបើកប្រាក់ ' + FREQ[R.w.pay_freq] + ')' }));
    card.appendChild(h('ul', { style: 'margin:6px 0 6px 18px;padding:0;line-height:1.8;font-size:.86rem;' }, R.a.checks.map(c => h('li', { style: 'color:' + (c.ok ? '#10b981' : '#f59e0b') + ';', text: (c.ok ? '✓ ' : '⚠ ') + c.text }))));
    card.appendChild(h('div', { style: 'font-size:.86rem;opacity:.9;', text: 'កម្ចីអតិបរមា ' + money(R.a.maxLoan, R.a.cur) + ' · អនុម័តស្វ័យប្រវត្តិបានដល់ ' + money(R.a.autoLimit, R.a.cur) }));
    if (R.ai) {
      card.appendChild(h('div', { style: 'margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(128,128,128,.12);font-size:.86rem;line-height:1.6;' },
        h('b', { text: 'AI៖ ' }), R.ai.summary, R.ai.concerns.length ? h('div', { style: 'opacity:.85;margin-top:4px;', text: 'ចំណុចព្រួយបារម្ភ៖ ' + R.ai.concerns.join(' · ') }) : null));
    } else {
      card.appendChild(h('div', { style: 'margin-top:8px;font-size:.82rem;color:#f59e0b;', text: 'មិនមាន AI (មិនទាន់ភ្ជាប់ Gemini API Key ក្នុង Tab «AI ជំនួយការ») — ត្រូវ Admin សម្រេច' }));
    }
    card.appendChild(h('div', { style: 'margin-top:10px;font-weight:700;', text: R.auto ? '✅ ហានិភ័យទាប — AI អនុម័តដោយស្វ័យប្រវត្តិ' : '📨 ត្រូវការ Admin សម្រេច' }));
    card.appendChild(h('div', { style: 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;' },
      h('button', { type: 'button', text: R.auto ? '✅ ដាក់ស្នើ & អនុម័ត' : '📨 ដាក់ស្នើឱ្យ Admin សម្រេច', onclick: () => submitLoan(R) }),
      h('button', { class: 'secondary', type: 'button', text: 'បោះបង់', onclick: () => { L.res = null; render(); } })));
    return card;
  }

  async function submitLoan(R) {
    const status = R.auto ? 'approved' : 'pending';
    const summary = (R.ai ? R.ai.summary : '') + (R.ai && R.ai.concerns.length ? ' [' + R.ai.concerns.join('; ') + ']' : '');
    const d = await loanCall('wk_loan_save', { p_l: { worker_id: String(R.w.id), amount: R.amount, currency: R.a.cur, weeks: R.weeks, pay_freq: R.w.pay_freq,
      installments: R.a.n, installment_amount: R.a.inst, reason: R.reason, status, decision_by: R.auto ? 'ai' : '', risk: R.finalRisk, risk_score: R.a.score, ai_summary: summary } });
    if (!d) return;
    L.res = null;
    say(R.auto ? '✅ បានអនុម័តដោយស្វ័យប្រវត្តិ — សូមប្រគល់ប្រាក់ ' + money(R.amount, R.a.cur) + ' ឱ្យកម្មករ។ ការសងនឹងត្រូវកាត់ពេលបើកប្រាក់។' : '📨 បានដាក់ស្នើ — រង់ចាំ Admin សម្រេចក្នុងបញ្ជីខាងក្រោម');
    render();
  }

  async function viewLoan() {
    if (!(await loadLoans())) { body.appendChild(h('p', { class: 'scan-hint', text: 'សូមរត់ wk-loans.sql ក្នុង Supabase ជាមុន ទើបប្រើមុខងារកម្ចីបាន' })); return; }
    const active = S.workers.filter(w => w.active);
    const sel = h('select', null, h('option', { value: '', text: '— ជ្រើសកម្មករ —' }), active.map(w => h('option', { value: String(w.id), text: w.name + ' (' + w.code + ') · ' + money(w.rate, w.currency) + '/ថ្ងៃ' })));
    const inAmt = h('input', { type: 'number', min: '1', step: '1', placeholder: 'ចំនួនទឹកប្រាក់ *' });
    const inWeeks = h('select', null, LN.WEEKS.map(x => h('option', { value: String(x), text: 'សង ' + x + ' សប្តាហ៍' })));
    const inReason = h('input', { type: 'text', placeholder: 'មូលហេតុ (ចាំបាច់)' });
    const resBox = h('div');
    const go = h('button', { type: 'button', text: '🤖 វិភាគ', onclick: async () => {
      const w = lnWorker(sel.value), amount = Number(inAmt.value), weeks = Number(inWeeks.value), reason = inReason.value.trim();
      if (!w) { say('សូមជ្រើសកម្មករ'); return; }
      if (!(amount > 0)) { say('សូមបញ្ចូលចំនួនទឹកប្រាក់'); return; }
      if (!reason) { say('សូមបញ្ចូលមូលហេតុ'); return; }
      go.disabled = true; resBox.textContent = '⏳ កំពុងវិភាគវត្តមាន 28 ថ្ងៃ និងហានិភ័យ…';
      try {
        const st = await workerStats(w);
        if (st.missing) { resBox.textContent = ''; say('មិនអាចអានវត្តមានគ្រប់ថ្ងៃបានទេ (' + st.missing + ' ថ្ងៃបរាជ័យ) សូមព្យាយាមម្តងទៀត'); return; }
        const a = assess(w, amount, weeks, st, L.loans);
        resBox.textContent = '⏳ AI កំពុងវិភាគ…';
        const ai = await aiReview(w, amount, weeks, st, a);
        const finalRisk = ai && RANK[ai.risk] > RANK[a.risk] ? ai.risk : a.risk;       // ជ្រើសហានិភ័យខ្ពស់ជាង
        const auto = a.autoOk && !!ai && finalRisk === 'low';                          // អនុម័តស្វ័យប្រវត្តិ តែពេលក្បួន និង AI ទាំងពីរយល់ថាទាប
        L.res = { w, amount, weeks, reason, st, a, ai, finalRisk, auto };
        resBox.textContent = ''; resBox.appendChild(resultCard(L.res));
      } catch (e) { console.error(e); resBox.textContent = ''; say('វិភាគមិនបាន៖ ' + (e.message || e)); }
      finally { go.disabled = false; }
    } });

    body.appendChild(h('div', { class: 'scan-result-card' }, h('h3', { class: 'sec-title', text: '💳 ស្នើសុំកម្ចីឱ្យកម្មករ' }),
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;' }, sel, inAmt, inWeeks, inReason),
      h('div', { style: 'margin-top:12px;' }, go), resBox,
      h('p', { class: 'scan-hint', text: 'សងយ៉ាងតិច ' + LN.MIN_WEEKS + ' សប្តាហ៍ · គ្មានការប្រាក់ · ត្រូវធ្វើការបានយ៉ាងតិច ' + LN.MIN_DAYS_28 + ' ថ្ងៃក្នុង 28 ថ្ងៃចុងក្រោយ · កម្ចីអតិបរមា = ថ្លៃឈ្នួល ' + LN.MAX_DAYS_RATE + ' ថ្ងៃ។ ការសងត្រូវកាត់ស្វ័យប្រវត្តិពីការបើកប្រាក់ម្តងៗ។ AI អនុម័តដោយស្វ័យប្រវត្តិតែសំណើហានិភ័យទាប (ក្នុងកម្រិត ' + LN.AUTO_DAYS_RATE + ' ថ្ងៃ) ហើយសំណើផ្សេងរង់ចាំ Admin។ AI ទទួលតែលេខអនាមិក (គ្មានឈ្មោះ)។' })));
    if (L.res) resBox.appendChild(resultCard(L.res));

    const nameOf = l => { const w = lnWorker(l.worker_id); return w ? w.name + ' (' + w.code + ')' : l.worker_id; };
    const badge = l => { const r = RISK[l.risk]; return r ? h('span', { style: 'padding:2px 10px;border-radius:999px;font-size:.74rem;font-weight:700;background:' + r[1] + '22;color:' + r[1] + ';', text: 'ហានិភ័យ ' + r[0] }) : null; };
    const pending = L.loans.filter(l => l.status === 'pending');
    const activeL = L.loans.filter(l => l.status === 'approved');
    const stopped = L.loans.filter(l => l.status === 'cancelled' && lnBal(l) > 0);          // បញ្ឈប់ការកាត់ តែនៅមានបំណុលត្រូវទារ
    const hist = L.loans.filter(l => !['pending', 'approved'].includes(l.status) && !(l.status === 'cancelled' && lnBal(l) > 0));
    const STAT = { pending: '⏳ រង់ចាំ', approved: '🟢 កំពុងសង', rejected: '✕ បដិសេធ', cancelled: '⏹ បញ្ឈប់', paid: '✅ សងរួច', written_off: '🧾 លុបបំណុល' };

    const sec = (title, list, mk) => { body.appendChild(h('h3', { class: 'sec-title', style: 'margin-top:18px;', text: title + ' (' + list.length + ')' }));
      body.appendChild(list.length ? h('div', null, list.map(mk)) : h('p', { class: 'scan-hint', text: 'គ្មានទិន្នន័យ' })); };
    const base = (l, extra) => h('div', { class: 'scan-result-card', style: 'margin-bottom:8px;' },
      h('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;' }, h('b', { text: nameOf(l) }), h('b', { text: money(l.amount, l.currency) + ' · ' + l.weeks + ' សប្តាហ៍' })),
      h('div', { style: 'font-size:.78rem;opacity:.75;', text: (l.reason || '-') + ' · ' + String(l.created_at || '').slice(0, 10) + (l.decision_by === 'ai' ? ' · អនុម័តដោយ AI' : (l.decision_by === 'admin' ? ' · សម្រេចដោយ Admin' : '')) }),
      extra);

    // សង្ខេបបំណុល
    const sumBy = list => { const o = {}; list.forEach(l => { o[l.currency] = (o[l.currency] || 0) + lnBal(l); }); return o; };
    const fmtSum = o => (Object.keys(o).length ? Object.keys(o).map(c => money(o[c], c)).join(' + ') : '—');
    const owing = [...activeL, ...stopped];
    const quitDebt = sumBy(owing.filter(l => { const w = lnWorker(l.worker_id); return w && !w.active; }));
    body.appendChild(h('div', { class: 'scan-result-card', style: 'margin-top:14px;display:flex;gap:28px;flex-wrap:wrap;' },
      h('div', null, h('div', { style: 'font-size:.76rem;opacity:.7;', text: 'បំណុលនៅសល់សរុប' }), h('b', { style: 'font-size:1.2rem;', text: fmtSum(sumBy(owing)) })),
      h('div', null, h('div', { style: 'font-size:.76rem;opacity:.7;', text: 'បំណុលកម្មករដែលឈប់ (ត្រូវទារ)' }), h('b', { style: 'font-size:1.2rem;color:' + (Object.keys(quitDebt).length ? '#ef4444' : 'inherit') + ';', text: fmtSum(quitDebt) }))));

    // កត់ការសងដោយដៃ (សាច់ប្រាក់) · លុបបំណុល (ត្រូវមានមូលហេតុ)
    const repaysOf = l => L.reps.filter(r => String(r.loan_id) === String(l.id));
    const repayHist = l => { const rs = repaysOf(l); return rs.length ? h('details', { style: 'margin-top:6px;font-size:.8rem;' }, h('summary', { style: 'cursor:pointer;', text: 'ប្រវត្តិការសង (' + rs.length + ')' }),
      rs.map(r => h('div', { style: 'display:flex;justify-content:space-between;padding:2px 0;' }, h('span', { text: String(r.created_at || '').slice(0, 10) + (r.payment_id ? ' · កាត់ពីការបើកប្រាក់' : ' · សាច់ប្រាក់') }), h('b', { text: money(r.amount, l.currency) })))) : null; };
    const manualRepay = async l => {
      const bal = lnBal(l), v = Number(prompt('ចំនួនប្រាក់ដែលបានសង (' + l.currency + ') · បំណុលនៅសល់ ' + money(bal, l.currency), String(bal)));
      if (!(v > 0)) return;
      if (v > bal + 0.001) { say('ចំនួនលើសបំណុលនៅសល់'); return; }
      if (await loanCall('wk_loan_repay', { p_loan: l.id, p_payment: '', p_amount: v })) render();
    };
    const writeOff = async l => {
      const bal = lnBal(l), why = (prompt('មូលហេតុលុបបំណុល ' + money(bal, l.currency) + ' (ចាំបាច់)') || '').trim();
      if (!why) { say('ត្រូវបញ្ចូលមូលហេតុ ទើបលុបបំណុលបាន'); return; }
      if (!confirm('លុបបំណុលនៅសល់ ' + money(bal, l.currency) + ' របស់ ' + nameOf(l) + ' ?\nមូលហេតុ៖ ' + why + '\n(មិនអាចត្រឡប់វិញបានទេ)')) return;
      if (await loanCall('wk_loan_decide', { p_id: l.id, p_status: 'written_off', p_note: why })) render();
    };
    const debtCard = (l, isStopped) => { const bal = lnBal(l), paid = Number(l.amount) - bal, pct = Math.round((paid / Number(l.amount)) * 100), w = lnWorker(l.worker_id), quit = w && !w.active;
      return base(l, h('div', null,
        h('div', { style: 'margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, badge(l),
          quit ? h('span', { style: 'padding:2px 10px;border-radius:999px;font-size:.74rem;font-weight:700;background:#ef444422;color:#ef4444;', text: '⛔ កម្មករឈប់' }) : null,
          isStopped ? h('span', { style: 'font-size:.76rem;opacity:.8;', text: 'បានបញ្ឈប់ការកាត់ស្វ័យប្រវត្តិ' }) : null,
          h('span', { style: 'font-size:.84rem;', text: 'នៅសល់ ' + money(bal, l.currency) + ' · សងរួច ' + money(paid, l.currency) + (isStopped ? '' : ' · កាត់ម្តងៗ ' + money(l.installment_amount, l.currency)) })),
        h('div', { style: 'background:rgba(128,128,128,.25);border-radius:6px;height:8px;margin:8px 0;overflow:hidden;' }, h('div', { style: 'width:' + pct + '%;height:100%;background:#10b981;' })),
        quit && !isStopped ? h('div', { style: 'font-size:.8rem;color:#f59e0b;margin-bottom:4px;', text: 'កម្មករនេះឈប់ហើយ — បើកប្រាក់ចុងក្រោយក្នុង Tab «បើកប្រាក់» (កាត់បំណុលទាំងអស់ពីប្រាក់ដែលត្រូវបើក) ឬកត់ការសងដោយដៃ' }) : null,
        l.ai_summary ? h('div', { style: 'font-size:.82rem;opacity:.85;', text: '🤖 ' + l.ai_summary }) : null,
        repayHist(l),
        h('div', { style: 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;' },
          h('button', { type: 'button', text: '💵 កត់ការសង (សាច់ប្រាក់)', onclick: () => manualRepay(l) }),
          h('button', { class: 'secondary', type: 'button', text: '🧾 លុបបំណុល', onclick: () => writeOff(l) }),
          isStopped ? null : h('button', { class: 'secondary', type: 'button', text: '⏹ បញ្ឈប់ការកាត់', onclick: async () => { if (!confirm('បញ្ឈប់ការកាត់ស្វ័យប្រវត្តិ? បំណុលនៅសល់ ' + money(bal, l.currency) + ' នៅតែជាប់ ហើយអាចកត់ការសងដោយដៃ ឬលុបក្រោយ')) return; if (await loanCall('wk_loan_decide', { p_id: l.id, p_status: 'cancelled' })) render(); } })))); };
    sec('📥 សំណើរង់ចាំ Admin', pending, l => base(l, h('div', null,
      h('div', { style: 'margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, badge(l), l.risk_score != null ? h('span', { style: 'font-size:.76rem;opacity:.75;', text: l.risk_score + '/100' }) : null,
        h('span', { style: 'font-size:.78rem;', text: 'កាត់ ' + l.installments + ' ដង × ' + money(l.installment_amount, l.currency) })),
      l.ai_summary ? h('div', { style: 'margin-top:6px;font-size:.84rem;opacity:.9;', text: '🤖 ' + l.ai_summary }) : null,
      h('div', { style: 'margin-top:8px;display:flex;gap:8px;' },
        h('button', { type: 'button', text: '✓ អនុម័ត', onclick: async () => { if (!confirm('អនុម័តកម្ចី ' + money(l.amount, l.currency) + ' ឱ្យ ' + nameOf(l) + ' ? (ត្រូវប្រគល់ប្រាក់ ហើយកាត់ពីការបើកប្រាក់ក្រោយ)')) return; if (await loanCall('wk_loan_decide', { p_id: l.id, p_status: 'approved' })) render(); } }),
        h('button', { class: 'secondary', type: 'button', text: '✕ បដិសេធ', onclick: async () => { if (!confirm('បដិសេធសំណើនេះ?')) return; if (await loanCall('wk_loan_decide', { p_id: l.id, p_status: 'rejected' })) render(); } })))));
    sec('🟢 កំពុងសង', activeL, l => debtCard(l, false));
    sec('⏹ បញ្ឈប់ការកាត់ (នៅមានបំណុល)', stopped, l => debtCard(l, true));
    sec('📜 ប្រវត្តិ', hist, l => base(l, h('div', null,
      h('div', { style: 'margin-top:6px;font-size:.84rem;', text: (STAT[l.status] || l.status) + (l.status === 'written_off' ? ' ' + money(l.written_off_amount || 0, l.currency) : '') + (l.admin_note ? ' · ' + l.admin_note : '') }),
      repayHist(l))));
  }


  // ---------------------------------------------------------------- ដំឡើងម៉ឺនុយ + ទំព័រ ----
  function build() {
    if (document.getElementById('workersTab')) return;
    const setting = document.querySelector('.sidebar .nav-item[data-tab="setting"]'), main = document.querySelector('.app-main');
    if (!setting || !main) return;
    setting.before(h('button', { class: 'nav-item', 'data-tab': 'workers', onclick: () => window.showTab('workers') }, h('span', { class: 'ico', text: '👷' }), h('span', { class: 'lbl', text: 'កម្មករ' })));
    body = h('div');
    root = h('div', { id: 'workersTab', class: 'tab-content' },
      h('div', { class: 'attendance-controls' }, h('h2', { class: 'page-title', text: '👷 កម្មករ (ស៊ីឡូ · ស៊ីថ្ងៃ · ប្រើបុង)' })),
      h('div', { class: 'toolbar', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;' },
        SUBS.map(s => h('button', { type: 'button', 'data-sub': s[0], text: s[1], onclick: () => { S.sub = s[0]; render(); } }))), body);
    main.appendChild(root);
    const orig = window.showTab;
    if (typeof orig === 'function') window.showTab = function (t) { const r = orig.apply(this, arguments); if (t !== 'workers') stopScan(); else render(); return r; };
  }
  const onSession = s => { if (s && s.role === 'admin') build(); };
  if (window.appSession !== undefined) onSession(window.appSession); else window.addEventListener('app:session', e => onSession(e.detail));
})();
