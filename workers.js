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
  const SUBS = [['list', '👷 បញ្ជីកម្មករ'], ['scan', '📷 ស្កេន QR'], ['att', '🗓 វត្តមាន'], ['pay', '💵 បើកប្រាក់']].filter(s => USE_QR || s[0] !== 'scan');

  async function stopScan() { if (scanner) { try { await scanner.stop(); scanner.clear(); } catch (_) { /* ignore */ } scanner = null; } }
  async function render() {
    if (!root) return;
    if (S.sub !== 'scan') await stopScan();
    const d = await api('wk_list'); if (!d) return;
    S.workers = d.workers;
    root.querySelectorAll('[data-sub]').forEach(b => b.classList.toggle('secondary', b.dataset.sub !== S.sub));
    body.textContent = '';
    ({ list: viewList, scan: viewScan, att: viewAtt, pay: viewPay })[S.sub]();
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
        h('button', { class: 'secondary', type: 'button', text: w.active ? '⛔ បិទ' : '✅ បើក', onclick: async () => { if (await api('wk_save', { p_w: Object.assign({}, w, { active: !w.active }) })) render(); } })))));
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
    const due = {}; d.rows.forEach(r => { due[r.worker_id] = r; });
    const t = today(), ym = t.slice(0, 7), eomPrev = addDays(ym + '-01', -1), mid = t.slice(8) >= '15' ? ym + '-15' : eomPrev;
    const setUp = v => { S.upto = v; render(); };
    body.appendChild(h('div', { class: 'toolbar', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, h('span', { text: 'បើកដល់ថ្ងៃទី' }),
      h('input', { type: 'date', value: S.upto, onchange: e => { if (e.target.value) setUp(e.target.value); } }),
      h('button', { class: 'secondary', type: 'button', text: 'ថ្ងៃនេះ', onclick: () => setUp(t) }),
      h('button', { class: 'secondary', type: 'button', text: 'ម្សិលមិញ', onclick: () => setUp(addDays(t, -1)) }),
      h('button', { class: 'secondary', type: 'button', text: 'ថ្ងៃទី ១៥ / ចុងខែមុន', onclick: () => setUp(mid) })));
    const rows = S.workers.filter(w => w.active).map(w => { const r = due[w.id] || { days: 0, amount: 0 };
      return h('tr', null, h('td', { text: w.name + ' (' + w.code + ')' }), h('td', { text: TYPES[w.type] }), h('td', { text: FREQ[w.pay_freq] }), h('td', { text: String(r.days) }), h('td', { text: String(r.ot_hours || 0) }),
        h('td', null, h('b', { text: money(r.amount, w.currency) })),
        h('td', null, h('button', { type: 'button', text: '💵 បើកប្រាក់', disabled: r.days > 0 ? null : '', onclick: async () => {
          if (!confirm('បើកប្រាក់ឱ្យ ' + w.name + ' · ' + r.days + ' ថ្ងៃ' + (r.ot_hours ? ' + OT ' + r.ot_hours + ' ម៉ោង' : '') + ' · ' + money(r.amount, w.currency) + ' (ដល់ថ្ងៃទី ' + S.upto + ')?')) return;
          const p = await api('wk_pay', { p_worker: w.id, p_upto: S.upto }); if (p) { const done = { name: w.name, code: w.code, paid_at: new Date().toISOString(), period_to: S.upto, days: p.days, ot_hours: p.ot_hours, amount: p.amount, currency: p.currency, day_rate: p.day_rate, ot_rate_used: p.ot_rate_used };
            if (confirm('បានបើកប្រាក់ ' + money(p.amount, p.currency) + ' (' + p.days + ' ថ្ងៃ' + (p.ot_hours ? ' + OT ' + p.ot_hours + ' ម៉ោង' : '') + ')។ បោះពុម្ពបង្កាន់ដៃឬទេ?')) printReceipt(done);
            render(); } } }))); });
    body.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['កម្មករ', 'ប្រភេទ', 'បើកប្រាក់', 'ថ្ងៃមិនទាន់បើក', 'OT (ម៉ោង)', 'ទឹកប្រាក់', ''].map(x => h('th', { text: x })))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: '7', text: noActive() }))))));
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
      + '<tr class="t"><td>សរុបទទួលបាន</td><td class="r">' + money(p.amount, p.currency) + '</td></tr></table>'
      + '<div class="sg"><div>អ្នកបើកប្រាក់</div><div>អ្នកទទួល</div></div><script>onload=()=>setTimeout(print,400)<\/script>');
    win.document.close();
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
