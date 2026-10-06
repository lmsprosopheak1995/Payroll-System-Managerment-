/* finance.js — ទំព័រ «💼 Finance» (ហិរញ្ញវត្ថុ) សម្រាប់ប្រព័ន្ធគ្រប់គ្រងបុគ្គលិក
 *
 * ទំព័រថ្មីក្នុងម៉ឺនុយខាងឆ្វេង (ក្រោមក្រុម Payrolls) មាន ៤ ផ្ទាំង៖
 *   📊 សង្ខេប       — ថ្លៃប្រាក់ខែប្រចាំខែ សរុប/តាមផ្នែក/Top 10 ប្រៀបធៀបខែមុន + CSV + ព្រីនរបាយការណ៍
 *   💵 បើកសាច់ប្រាក់ — បញ្ជីបើកប្រាក់ខែ (ដុល្លារ/រៀល/ដុល្លារ+រៀល) គណនាចំនួនក្រដាសប្រាក់ត្រូវរៀបចំ + បញ្ជីហត្ថលេខា
 *   📈 និន្នាការ     — ថ្លៃប្រាក់ខែ ៦ ឬ ១២ ខែចុងក្រោយ
 *   🎯 ថវិកា        — កំណត់ថវិកាប្រចាំខែ (សរុប + តាមផ្នែក) ប្រៀបធៀបជាមួយចំណាយពិត
 *   💰 Payroll (ផ្ទាំងដើមរបស់កម្មវិធី យកមកដាក់ក្នុង Finance)៖
 *        ⭐ ប្រាក់ខែប្រចាំខែ · 🧾 អត្ថប្រយោជន៍ & ប្រាក់កាត់ · ⏱ យឺត/ច្បាប់ → កាត់លុយ · 🎁 បំណាច់ឆ្នាំ · 🏛 ប.ស.ស (NSSF)
 *
 * ទិន្នន័យទាំងអស់គណនាដោយមុខងាររបស់កម្មវិធីដដែល (summarizeEmpMonth, calcAdvanceRow, payrollEmployeesForMonth)
 * ដូច្នេះចំនួនសរុបត្រូវនឹងផ្ទាំង «ប្រាក់ខែប្រចាំខែ»។ ទំព័រនេះ «អាន» តែប៉ុណ្ណោះ មិនកែទិន្នន័យអ្វីក្នុង Supabase ទេ។
 *
 * ដំឡើង៖ <script src="finance.js"></script> ក្រោម script.js (និង payroll-tools.js ដែលមានមុខងារប្រាក់ខែ)
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ ឧបករណ៍ ----
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const getJson = (k, d) => { try { const v = JSON.parse(lsGet(k, '')); return (v && typeof v === 'object') ? v : d; } catch (_) { return d; } };
  const say = m => (typeof customAlert === 'function' ? customAlert(m) : Promise.resolve(window.alert(m)));
  const z2 = n => String(n).padStart(2, '0');
  const num = x => { const n = Number(x); return isFinite(n) ? n : 0; };
  const r2 = n => Math.round(num(n) * 100) / 100;
  const usd2 = n => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const riel = n => Math.round(num(n)).toLocaleString('en-US');
  const emps = () => (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees : [];
  const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCsv = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');

  const KH_DIG = '០១២៣៤៥៦៧៨៩';
  const toKh = s => String(s).replace(/\d/g, d => KH_DIG[+d]);
  const KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const monthLabel = ym => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ''); return m ? `ខែ${KH_MONTHS[+m[2] - 1]} ឆ្នាំ${toKh(m[1])}` : String(ym); };
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`; };
  const shiftMonth = (ym, delta) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`; };
  const monthsBack = (end, n) => { const a = []; for (let i = n - 1; i >= 0; i--) a.push(shiftMonth(end, -i)); return a; };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    kids.flat().forEach(c => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function openPrint(html) {
    const w = window.open('', '_blank');
    if (!w) { say('Browser បានទប់ស្កាត់បង្អួច — សូមអនុញ្ញាត popup'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch (_) { /* ignore */ } };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 150)); else setTimeout(go, 700);
  }

  // ------------------------------------------------------------ ទិន្នន័យពីកម្មវិធី (adapter) ----
  function normalizeRow(e, t, a, unmarked) {
    return {
      e,
      workDays: num(t.workDays), leaveDays: num(t.leaveDays), otHours: num(t.otHours), otPay: num(t.otPay),
      total: num(t.total), benefits: num(t.benefitsUSD), deductions: num(t.deductionsUSD),
      net: r2(t.net),
      adv: num(a.amount), advDue: !!a.due,
      noSalary: !(parseFloat(e.salary) > 0), unmarked: num(unmarked)
    };
  }

  // ទាញជួរប្រាក់ខែប្រចាំខែ ដោយប្រើមុខងាររបស់កម្មវិធី (មិនពាក់ព័ន្ធនឹង input ស្វែងរកក្នុងផ្ទាំងប្រាក់ខែ)
  function loadMonth(month) {
    const hasCalc = typeof summarizeEmpMonth === 'function';
    let list;
    try { list = typeof payrollEmployeesForMonth === 'function' ? payrollEmployeesForMonth(month) : emps().filter(e => e.status === 'active'); }
    catch (_) { list = emps().filter(e => e.status === 'active'); }
    const rows = (list || []).map(e => {
      let t = {}, a = {}, un = 0;
      if (hasCalc) { try { t = summarizeEmpMonth(e, month) || {}; } catch (_) { t = {}; } }
      try { if (typeof calcAdvanceRow === 'function') a = calcAdvanceRow(e, month) || {}; } catch (_) { a = {}; }
      try { if (typeof countUnmarkedDays === 'function') un = countUnmarkedDays(e, month); } catch (_) { un = 0; }
      return normalizeRow(e, t, a, un);
    }).sort((x, y) => String(x.e.dept || '').localeCompare(String(y.e.dept || '')) || String(x.e.name || '').localeCompare(String(y.e.name || '')));
    return { month, rows, hasCalc };
  }

  // ------------------------------------------------------------ ការគណនា (pure) ----
  function summarize(rows) {
    const g = { n: rows.length, total: 0, benefits: 0, deductions: 0, net: 0, adv: 0, otHours: 0, otPay: 0, noSalary: 0, unmarked: 0 };
    const map = new Map();
    rows.forEach(r => {
      g.total += r.total; g.benefits += r.benefits; g.deductions += r.deductions; g.net += r.net; g.adv += r.adv;
      g.otHours += r.otHours; g.otPay += r.otPay; if (r.noSalary) g.noSalary++; if (r.unmarked > 0) g.unmarked++;
      const k = String(r.e.dept || '').trim() || '(គ្មានផ្នែក)';
      if (!map.has(k)) map.set(k, { dept: k, n: 0, total: 0, benefits: 0, deductions: 0, net: 0 });
      const d = map.get(k); d.n++; d.total += r.total; d.benefits += r.benefits; d.deductions += r.deductions; d.net += r.net;
    });
    g.net = r2(g.net);
    return { g, depts: Array.from(map.values()).sort((a, b) => b.net - a.net) };
  }

  // ក្រដាសប្រាក់ (មិនដាក់ $2 ជាលំនាំដើម ព្រោះកម្រប្រើ)
  const USD_NOTES = [100, 50, 20, 10, 5, 1];
  const KHR_NOTES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100];

  function denominate(amount, notes) {
    let left = Math.round(amount);
    const out = {};
    notes.forEach(n => { const c = Math.floor(left / n); if (c > 0) { out[n] = c; left -= c * n; } });
    return { notes: out, left };
  }

  // mode: 'usd' (ជុំទៅដុល្លារ) | 'khr' (រៀលសរុប ជុំ ១០០៛) | 'split' (ដុល្លារពេញ + រៀលសល់ ជុំ ១០០៛)
  function cashPlan(rows, mode, rate, usdNotes) {
    const un = usdNotes || USD_NOTES;
    const items = [];
    const tot = { usd: 0, riel: 0, diff: 0, usdNotes: {}, rielNotes: {}, skipped: 0 };
    rows.forEach(r => {
      if (!(r.net > 0)) { tot.skipped++; return; }
      let usd = 0, rl = 0;
      if (mode === 'usd') usd = Math.round(r.net);
      else if (mode === 'khr') rl = Math.round(r.net * rate / 100) * 100;
      else { usd = Math.floor(r.net + 1e-9); rl = Math.round((r.net - usd) * rate / 100) * 100; }
      const du = denominate(usd, un), dr = denominate(rl, KHR_NOTES);
      const paid = usd + (rate > 0 ? rl / rate : 0);
      items.push({ r, usd, riel: rl, usdNotes: du.notes, rielNotes: dr.notes, usdLeft: du.left, diff: paid - r.net });
      tot.usd += usd; tot.riel += rl; tot.diff += paid - r.net;
      Object.keys(du.notes).forEach(k => { tot.usdNotes[k] = (tot.usdNotes[k] || 0) + du.notes[k]; });
      Object.keys(dr.notes).forEach(k => { tot.rielNotes[k] = (tot.rielNotes[k] || 0) + dr.notes[k]; });
    });
    tot.diff = r2(tot.diff);
    return { items, tot };
  }

  const notesText = (notes, sym) => Object.keys(notes).map(Number).sort((a, b) => b - a).map(k => `${notes[k]}×${sym === '$' ? '$' + k : riel(k) + '៛'}`).join(' + ') || '-';

  function budgetStatus(actual, budget) {
    const b = num(budget), a = num(actual);
    if (!(b > 0)) return { has: false, pct: 0, diff: 0, over: false };
    return { has: true, pct: a / b * 100, diff: b - a, over: a > b };
  }

  // ------------------------------------------------------------ ឯកសារព្រីន ----
  const PRINT_CSS = `@page{size:A4;margin:14mm}body{font-family:'Kantumruy Pro','Noto Sans Khmer','Khmer OS Battambang',sans-serif;color:#111;font-size:10.5pt;line-height:1.6;margin:0}
h1{text-align:center;font-size:15pt;margin:0 0 2mm}.sub{text-align:center;margin:0 0 6mm;color:#444}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:1.6mm 2.4mm;text-align:left;vertical-align:middle}th{background:#eee}
thead{display:table-header-group}tr{page-break-inside:avoid}.r{text-align:right}.c{text-align:center}.sig{height:11mm}
.foot{display:flex;justify-content:space-around;margin-top:14mm;text-align:center}.foot div{min-width:55mm}.foot .sp{height:20mm}.note{margin-top:5mm;font-size:9.5pt;color:#333}`;
  const fontLink = href => (/^https:\/\/fonts\.googleapis\.com\//.test(href || '') ? `<link rel="stylesheet" href="${escHtml(href)}">` : '');

  function payoutSheetHtml(o) {
    const rows = o.rows.map(r => `<tr><td class="c">${r.no}</td><td>${escHtml(r.id)}</td><td>${escHtml(r.name)}</td><td>${escHtml(r.dept)}</td><td class="r">${escHtml(r.pay)}</td><td class="sig"></td></tr>`).join('');
    return `<!doctype html><html lang="km"><head><meta charset="utf-8"><title>បញ្ជីបើកប្រាក់ខែ ${escHtml(o.monthLabel)}</title>${fontLink(o.fontHref)}<style>${PRINT_CSS}</style></head><body>
<h1>បញ្ជីបើកប្រាក់ខែ — ${escHtml(o.monthLabel)}</h1><p class="sub">${escHtml(o.company || '')}${o.company ? ' · ' : ''}${escHtml(o.modeLabel)}</p>
<table><thead><tr><th class="c" style="width:9mm">ល.រ</th><th style="width:22mm">អត្តលេខ</th><th>ឈ្មោះ</th><th>ផ្នែក</th><th class="r" style="width:42mm">ប្រាក់ត្រូវទទួល</th><th style="width:38mm">ហត្ថលេខា</th></tr></thead>
<tbody>${rows}<tr><th colspan="4" class="r">សរុប (${o.rows.length} នាក់)</th><th class="r">${escHtml(o.totalText)}</th><th></th></tr></tbody></table>
<div class="note">${escHtml(o.notesText || '')}</div>
<div class="foot"><div>អ្នករៀបចំ<div class="sp"></div>…………………</div><div>ហិរញ្ញវត្ថុ<div class="sp"></div>…………………</div><div>អ្នកអនុម័ត<div class="sp"></div>…………………</div></div></body></html>`;
  }

  function reportHtml(o) {
    const g = o.sum.g;
    const stat = [['បុគ្គលិក', g.n + ' នាក់'], ['ប្រាក់តាមវត្តមាន', '$' + usd2(g.total)], ['អត្ថប្រយោជន៍', '+$' + usd2(g.benefits)], ['ប្រាក់កាត់', '−$' + usd2(g.deductions)], ['ត្រូវបើកសរុប (សុទ្ធ)', '$' + usd2(g.net)], ['ប្រាក់ខែទី១ (ទូទាត់ទី២៥)', '$' + usd2(g.adv)]];
    return `<!doctype html><html lang="km"><head><meta charset="utf-8"><title>របាយការណ៍ប្រាក់ខែ ${escHtml(o.monthLabel)}</title>${fontLink(o.fontHref)}<style>${PRINT_CSS}</style></head><body>
<h1>របាយការណ៍ថ្លៃប្រាក់ខែ — ${escHtml(o.monthLabel)}</h1><p class="sub">${escHtml(o.company || '')}</p>
<table>${stat.map(s => `<tr><th style="width:60mm">${escHtml(s[0])}</th><td class="r">${escHtml(s[1])}</td></tr>`).join('')}</table>
<h3 style="margin:7mm 0 2mm">តាមផ្នែក</h3>
<table><thead><tr><th>ផ្នែក</th><th class="c">នាក់</th><th class="r">តាមវត្តមាន ($)</th><th class="r">អត្ថប្រយោជន៍ ($)</th><th class="r">ប្រាក់កាត់ ($)</th><th class="r">សុទ្ធ ($)</th><th class="r">%</th></tr></thead><tbody>
${o.sum.depts.map(d => `<tr><td>${escHtml(d.dept)}</td><td class="c">${d.n}</td><td class="r">${usd2(d.total)}</td><td class="r">${usd2(d.benefits)}</td><td class="r">${usd2(d.deductions)}</td><td class="r">${usd2(d.net)}</td><td class="r">${g.net > 0 ? (d.net / g.net * 100).toFixed(1) : '0.0'}</td></tr>`).join('')}
<tr><th>សរុប</th><th class="c">${g.n}</th><th class="r">${usd2(g.total)}</th><th class="r">${usd2(g.benefits)}</th><th class="r">${usd2(g.deductions)}</th><th class="r">${usd2(g.net)}</th><th class="r">100</th></tr></tbody></table>
<div class="note">បង្កើតនៅ ${escHtml(new Date().toLocaleString())} · គណនាពីទិន្នន័យវត្តមាន និងប្រាក់ខែនៅក្នុងប្រព័ន្ធ។</div>
<div class="foot"><div>អ្នករៀបចំ<div class="sp"></div>…………………</div><div>ហិរញ្ញវត្ថុ<div class="sp"></div>…………………</div><div>អ្នកអនុម័ត<div class="sp"></div>…………………</div></div></body></html>`;
  }

  // ------------------------------------------------------------ CSS ----
  const CSS = `
.fin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}
.fin-tabs button.on{background:var(--accent,#0d9488);color:#fff;border-color:transparent}
.fin-sep{align-self:center;font-size:.72rem;font-weight:700;color:var(--text-muted,#5b6b80);margin:0 2px 0 8px;white-space:nowrap}
#financeTab .tab-content.fin-mounted{display:none !important}
#financeTab .tab-content.fin-mounted.fin-show{display:block !important}
.fin-card{border:1px solid var(--border,#e1e8ef);border-radius:14px;background:var(--card-bg,#fff);padding:12px 14px;margin:0 0 14px}
.fin-card h3{margin:0 0 8px;font-size:.98rem}
.fin-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}
.fin-row label{font-size:.82rem;color:var(--text-muted,#5b6b80)}
.fin-muted{font-size:.8rem;color:var(--text-muted,#5b6b80)}
.fin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:8px 0 14px}
.fin-stat{border:1px solid var(--border,#e1e8ef);border-radius:12px;padding:10px 12px;background:var(--card-bg,#fff)}
.fin-stat b{display:block;font-size:1.2rem}
.fin-stat span{font-size:.75rem;color:var(--text-muted,#5b6b80)}
.fin-badge{display:inline-block;font-size:.72rem;border-radius:999px;padding:1px 9px;background:#e6f6f4;color:#0f766e;white-space:nowrap}
.fin-badge.warn{background:#fef3c7;color:#92400e}
.fin-badge.late{background:#fee2e2;color:#b91c1c}
.fin-bar{height:8px;border-radius:99px;background:rgba(100,116,139,.18);overflow:hidden;min-width:70px}
.fin-bar i{display:block;height:100%;background:linear-gradient(135deg,#0d9488,#0284c7)}
.fin-bar.over i{background:linear-gradient(135deg,#ea580c,#dc2626)}
.fin-cols{display:flex;align-items:flex-end;gap:8px;height:150px;margin:10px 0}
.fin-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;font-size:.68rem;color:var(--text-muted,#5b6b80)}
.fin-col i{display:block;width:100%;background:linear-gradient(135deg,#0d9488,#0284c7);border-radius:6px 6px 0 0;min-height:2px}
`;
  let cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    const st = document.createElement('style'); st.id = 'finStyle'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------ UI ជំនួយ ----
  const card = (title, ...kids) => h('div', { class: 'fin-card' }, h('h3', { text: title }), ...kids);
  const rowEl = (...kids) => h('div', { class: 'fin-row' }, ...kids);
  const lab = (text, ctrl) => h('label', null, text, ctrl);
  const btn = (text, onclick, cls) => h('button', { type: 'button', class: cls === undefined ? 'secondary' : cls, text, onclick });
  const statEl = (v, l) => h('div', { class: 'fin-stat' }, h('b', { text: v }), h('span', { text: l }));
  const badge = (text, cls) => h('span', { class: 'fin-badge' + (cls ? ' ' + cls : ''), text });
  const empty = text => h('p', { class: 'fin-muted', text });
  function mkTable(heads, rows, rightCols) {
    const rc = new Set(rightCols || []);
    return h('div', { class: 'table-wrap', style: 'box-shadow:none' },
      h('table', { style: 'min-width:0' },
        h('thead', null, h('tr', null, heads.map((x, i) => h('th', { text: x, style: rc.has(i) ? 'text-align:right' : '' })))),
        h('tbody', null, rows.map(r => h('tr', null, r.map((c, i) => h('td', { style: rc.has(i) ? 'text-align:right' : '' }, c)))))));
  }
  const company = () => lsGet('wc_company', '') || ((document.querySelector('.sidebar-brand') || {}).textContent || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const fontHref = () => { const lk = document.querySelector('link[href*="fonts.googleapis.com"]'); return lk ? lk.href : ''; };
  const rateNow = () => num(typeof settings !== 'undefined' && settings ? settings.exchangeRate : 0) || 4100;

  // ------------------------------------------------------------ ស្ថានភាពទំព័រ ----
  let finMonth = curMonth();
  let sub = 'overview', bodyEl = null, tabsEl = null;
  const monthCache = new Map(); // month → summary (សម្រាប់និន្នាការ/ប្រៀបធៀប)

  function monthNav() {
    const mi = h('input', { type: 'month', value: finMonth });
    mi.addEventListener('change', () => { if (mi.value) { finMonth = mi.value; renderBody(); } });
    return [btn('‹', () => { finMonth = shiftMonth(finMonth, -1); renderBody(); }), mi, btn('›', () => { finMonth = shiftMonth(finMonth, 1); renderBody(); }),
      btn('📅 ខែនេះ', () => { finMonth = curMonth(); renderBody(); })];
  }

  const noData = (ld) => (!ld.hasCalc
    ? 'មិនឃើញមុខងារគណនាប្រាក់ខែ (summarizeEmpMonth) — សូមពិនិត្យថា payroll-tools.js ត្រូវបានផ្ទុក'
    : 'មិនមានបុគ្គលិកសម្រាប់ខែនេះ ឬមិនទាន់មានទិន្នន័យវត្តមាន');

  // ------------------------------------------------------------ ផ្ទាំង៖ សង្ខេប ----
  function paneOverview(body) {
    const ld = loadMonth(finMonth);
    const sum = summarize(ld.rows);
    const g = sum.g;
    monthCache.set(finMonth, g);
    body.appendChild(rowEl(...monthNav()));
    if (!ld.rows.length) { body.appendChild(empty(noData(ld))); return; }

    body.appendChild(rowEl(
      btn('⬇ CSV', () => download(`payroll-${finMonth}.csv`, toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃធ្វើការ', 'ថ្ងៃច្បាប់', 'OT (ម៉ោង)', 'តាមវត្តមាន', 'អត្ថប្រយោជន៍', 'ប្រាក់កាត់', 'សុទ្ធ', 'ប្រាក់ខែទី១']]
        .concat(ld.rows.map(r => [r.e.username || r.e.id, r.e.name, r.e.dept || '', r.workDays, r.leaveDays, r.otHours, r2(r.total), r2(r.benefits), r2(r.deductions), r.net, r2(r.adv)]))), 'text/csv;charset=utf-8')),
      btn('🖨 ព្រីនរបាយការណ៍', () => openPrint(reportHtml({ sum, monthLabel: monthLabel(finMonth), company: company(), fontHref: fontHref() })))));

    const prev = shiftMonth(finMonth, -1);
    let pg = monthCache.get(prev);
    if (!pg) { try { pg = summarize(loadMonth(prev).rows).g; monthCache.set(prev, pg); } catch (_) { pg = null; } }
    const delta = pg && pg.net > 0 ? (g.net - pg.net) / pg.net * 100 : null;

    body.appendChild(h('div', { class: 'fin-grid' },
      statEl(`${g.n} នាក់`, 'បុគ្គលិកក្នុងបញ្ជីប្រាក់ខែ'),
      statEl('$' + usd2(g.total), 'ប្រាក់តាមវត្តមានសរុប'),
      statEl('+$' + usd2(g.benefits), 'អត្ថប្រយោជន៍សរុប'),
      statEl('−$' + usd2(g.deductions), 'ប្រាក់កាត់សរុប'),
      statEl('$' + usd2(g.net), 'ត្រូវបើកសរុប (សុទ្ធ)'),
      statEl('$' + usd2(g.adv), 'ប្រាក់ខែទី១ (ទូទាត់ទី២៥)'),
      statEl(g.n ? '$' + usd2(g.net / g.n) : '-', 'សុទ្ធមធ្យមក្នុងម្នាក់'),
      statEl(delta == null ? '-' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, `ប្រៀបធៀបខែមុន (${monthLabel(prev)})`),
      statEl(`${g.otHours.toFixed(1)} ម៉ោង`, `OT សរុប · $${usd2(g.otPay)}`)));

    const warns = [];
    if (g.noSalary) warns.push(badge(`⚠ គ្មានប្រាក់ខែមូលដ្ឋាន ${g.noSalary} នាក់`, 'warn'));
    if (g.unmarked) warns.push(badge(`⚠ មិនទាន់កត់វត្តមានពេញ ${g.unmarked} នាក់`, 'warn'));
    if (warns.length) body.appendChild(rowEl(...warns));

    body.appendChild(card('តាមផ្នែក', mkTable(['ផ្នែក', 'នាក់', 'តាមវត្តមាន ($)', 'អត្ថប្រយោជន៍ ($)', 'ប្រាក់កាត់ ($)', 'សុទ្ធ ($)', 'មធ្យម ($)', 'ចំណែក'],
      sum.depts.map(d => {
        const pct = g.net > 0 ? d.net / g.net * 100 : 0;
        return [d.dept, String(d.n), usd2(d.total), usd2(d.benefits), usd2(d.deductions), usd2(d.net), usd2(d.n ? d.net / d.n : 0),
          h('div', { style: 'display:flex;align-items:center;gap:6px' }, h('div', { class: 'fin-bar', style: 'flex:1' }, h('i', { style: `width:${Math.min(100, pct).toFixed(1)}%` })), h('span', { class: 'fin-muted', text: pct.toFixed(1) + '%' }))];
      }), [1, 2, 3, 4, 5, 6])));

    body.appendChild(card('🏅 ប្រាក់សុទ្ធខ្ពស់បំផុត (Top 10)', mkTable(['ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃធ្វើការ', 'OT (ម៉ោង)', 'សុទ្ធ ($)'],
      ld.rows.slice().sort((a, b) => b.net - a.net).slice(0, 10).map(r => [r.e.name, r.e.dept || '-', String(r.workDays), r.otHours.toFixed(1), usd2(r.net)]), [2, 3, 4])));
    body.appendChild(h('p', { class: 'fin-muted', text: 'ចំនួនគណនាដោយមុខងារដូចផ្ទាំង «ប្រាក់ខែប្រចាំខែ»។ «ត្រូវបើកសរុប» = ផលបូកប្រាក់សុទ្ធរបស់បុគ្គលិកម្នាក់ៗ (បង្គត់ ២ ខ្ទង់)។ ប្រាក់ខែទី១ ដែលបានបើកហើយ ត្រូវបានដកក្នុងប្រាក់សុទ្ធរួចហើយ ពេលដល់ថ្ងៃទូទាត់។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ បើកសាច់ប្រាក់ ----
  const cashState = { mode: '', rate: '', note2: false };
  function paneCash(body) {
    const ld = loadMonth(finMonth);
    body.appendChild(rowEl(...monthNav()));
    if (!ld.rows.length) { body.appendChild(empty(noData(ld))); return; }
    if (!cashState.mode) { try { cashState.mode = typeof getPayMode === 'function' ? getPayMode() : 'split'; } catch (_) { cashState.mode = 'split'; } }

    const out = h('div');
    const selMode = h('select', null,
      h('option', { value: 'split', text: 'ដុល្លារពេញ + រៀលសល់' }), h('option', { value: 'khr', text: 'រៀលទាំងអស់' }), h('option', { value: 'usd', text: 'ដុល្លារទាំងអស់ (ជុំទៅ $1)' }));
    selMode.value = cashState.mode;
    const rate = h('input', { type: 'number', min: '1', step: '1', value: cashState.rate, placeholder: String(rateNow()), style: 'width:100px' });
    const n2 = h('input', { type: 'checkbox' }); n2.checked = cashState.note2;
    const renderOut = () => {
      out.textContent = '';
      const rt = num(cashState.rate) || rateNow();
      const plan = cashPlan(ld.rows, cashState.mode, rt, cashState.note2 ? [100, 50, 20, 10, 5, 2, 1] : USD_NOTES);
      const modeText = { split: 'ដុល្លារពេញ + រៀលសល់', khr: 'រៀលទាំងអស់', usd: 'ដុល្លារទាំងអស់' }[cashState.mode];
      const payText = it => cashState.mode === 'usd' ? `$${it.usd}` : cashState.mode === 'khr' ? `${riel(it.riel)} ៛` : `$${it.usd} + ${riel(it.riel)} ៛`;
      const totalText = cashState.mode === 'usd' ? `$${riel(plan.tot.usd)}` : cashState.mode === 'khr' ? `${riel(plan.tot.riel)} ៛` : `$${riel(plan.tot.usd)} + ${riel(plan.tot.riel)} ៛`;
      out.appendChild(h('div', { class: 'fin-grid' },
        statEl(`${plan.items.length} នាក់`, `ត្រូវបើក${plan.tot.skipped ? ` (រំលង ${plan.tot.skipped} នាក់ ដែលសុទ្ធ ≤ 0)` : ''}`),
        statEl(totalText, 'សរុបត្រូវរៀបចំ'),
        statEl(`${plan.tot.diff >= 0 ? '+' : ''}$${usd2(plan.tot.diff)}`, 'ភាពខុសគ្នាដោយសារការបង្គត់ (បើក − ត្រូវបើក)'),
        statEl(`1$ = ${riel(rt)} ៛`, 'អត្រាប្តូរប្រាក់ដែលប្រើ')));

      const nt = [];
      if (cashState.mode !== 'khr') Object.keys(plan.tot.usdNotes).map(Number).sort((a, b) => b - a).forEach(k => nt.push(['USD', '$' + k, String(plan.tot.usdNotes[k]), '$' + riel(k * plan.tot.usdNotes[k])]));
      if (cashState.mode !== 'usd') Object.keys(plan.tot.rielNotes).map(Number).sort((a, b) => b - a).forEach(k => nt.push(['KHR', riel(k) + ' ៛', String(plan.tot.rielNotes[k]), riel(k * plan.tot.rielNotes[k]) + ' ៛']));
      out.appendChild(card('🧮 ក្រដាសប្រាក់ត្រូវរៀបចំសរុប', nt.length ? mkTable(['រូបិយប័ណ្ណ', 'ប្រភេទក្រដាស', 'ចំនួនសន្លឹក', 'សរុប'], nt, [2, 3]) : empty('គ្មាន')));

      const rowsTxt = plan.items.map(it => [it.r.e.name, it.r.e.dept || '-', usd2(it.r.net), payText(it),
        [cashState.mode !== 'khr' ? 'USD: ' + notesText(it.usdNotes, '$') : '', cashState.mode !== 'usd' ? 'KHR: ' + notesText(it.rielNotes, '៛') : ''].filter(Boolean).join(' | ')]);
      out.appendChild(card('👥 តាមបុគ្គលិក', rowEl(
        btn('🖨 ព្រីនបញ្ជីបើកប្រាក់ (មានហត្ថលេខា)', () => openPrint(payoutSheetHtml({
          company: company(), monthLabel: monthLabel(finMonth), modeLabel: modeText, fontHref: fontHref(), totalText,
          notesText: 'ក្រដាសប្រាក់សរុប៖ ' + [cashState.mode !== 'khr' ? 'USD ' + notesText(plan.tot.usdNotes, '$') : '', cashState.mode !== 'usd' ? 'KHR ' + notesText(plan.tot.rielNotes, '៛') : ''].filter(Boolean).join(' · '),
          rows: plan.items.map((it, i) => ({ no: i + 1, id: it.r.e.username || it.r.e.id, name: it.r.e.name, dept: it.r.e.dept || '-', pay: payText(it) }))
        })), ''),
        btn('⬇ CSV', () => download(`cash-${finMonth}.csv`, toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'សុទ្ធ ($)', 'ដុល្លារ', 'រៀល', 'ក្រដាសប្រាក់']].concat(plan.items.map(it => [it.r.e.username || it.r.e.id, it.r.e.name, it.r.e.dept || '', it.r.net, it.usd, it.riel, notesText(it.usdNotes, '$') + ' | ' + notesText(it.rielNotes, '៛')]))), 'text/csv;charset=utf-8'))),
        mkTable(['ឈ្មោះ', 'ផ្នែក', 'សុទ្ធ ($)', 'ត្រូវបើក', 'ក្រដាសប្រាក់'], rowsTxt, [2])));
    };
    selMode.addEventListener('change', () => { cashState.mode = selMode.value; renderOut(); });
    rate.addEventListener('input', () => { cashState.rate = rate.value; renderOut(); });
    n2.addEventListener('change', () => { cashState.note2 = n2.checked; renderOut(); });
    body.appendChild(card('💵 បញ្ជីបើកប្រាក់ខែ — ' + monthLabel(finMonth),
      rowEl(lab('របៀបបើក ', selMode), lab('អត្រា (៛ ក្នុង $1) ', rate), h('label', null, n2, ' ប្រើក្រដាស $2')),
      h('p', { class: 'fin-muted', text: 'ក្រដាសប្រាក់គណនាតាមវិធីយកក្រដាសធំមុន (greedy)។ រៀលបង្គត់ទៅ ១០០៛ ជិតបំផុត ហើយដុល្លារក្នុងរបៀប «ដុល្លារទាំងអស់» ជុំទៅ $១។' })));
    body.appendChild(out);
    selMode.value = cashState.mode;
    renderOut();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ និន្នាការ ----
  let trendN = 6;
  async function paneTrend(body) {
    const sel = h('select', null, h('option', { value: '6', text: '៦ ខែចុងក្រោយ' }), h('option', { value: '12', text: '១២ ខែចុងក្រោយ' }));
    sel.value = String(trendN);
    sel.addEventListener('change', () => { trendN = +sel.value; });
    const out = h('div');
    const go = btn('📈 គណនា', async () => {
      go.disabled = true; out.textContent = '';
      const months = monthsBack(finMonth, trendN), res = [];
      try {
        for (let i = 0; i < months.length; i++) {
          out.textContent = `កំពុងគណនា ${i + 1}/${months.length} (${months[i]})…`;
          await new Promise(r => setTimeout(r, 0));
          let g = monthCache.get(months[i]);
          if (!g) { g = summarize(loadMonth(months[i]).rows).g; monthCache.set(months[i], g); }
          res.push({ m: months[i], g });
        }
        out.textContent = '';
        const max = Math.max(1, ...res.map(x => x.g.net));
        out.appendChild(h('div', { class: 'fin-cols' }, res.map(x => h('div', { class: 'fin-col' },
          h('span', { text: x.g.net ? '$' + riel(x.g.net) : '-' }), h('i', { style: `height:${Math.round(x.g.net / max * 100)}px` }), h('span', { text: x.m.slice(2) })))));
        out.appendChild(mkTable(['ខែ', 'នាក់', 'តាមវត្តមាន ($)', 'អត្ថប្រយោជន៍ ($)', 'ប្រាក់កាត់ ($)', 'សុទ្ធ ($)', 'ប្រែប្រួល'],
          res.map((x, i) => {
            const p = i > 0 ? res[i - 1].g.net : 0;
            return [x.m, String(x.g.n), usd2(x.g.total), usd2(x.g.benefits), usd2(x.g.deductions), usd2(x.g.net), p > 0 ? `${x.g.net >= p ? '+' : ''}${((x.g.net - p) / p * 100).toFixed(1)}%` : '-'];
          }), [1, 2, 3, 4, 5, 6]));
        const withData = res.filter(x => x.g.net > 0);
        if (withData.length) out.appendChild(h('p', { class: 'fin-muted', text: `មធ្យមសុទ្ធក្នុងមួយខែ $${usd2(withData.reduce((a, x) => a + x.g.net, 0) / withData.length)} (${withData.length} ខែដែលមានទិន្នន័យ)` }));
      } catch (ex) { out.textContent = 'មានបញ្ហា៖ ' + (ex.message || ex); }
      finally { go.disabled = false; }
    });
    body.appendChild(card('📈 និន្នាការថ្លៃប្រាក់ខែ', rowEl(lab('រយៈពេល ', sel), go, btn('🔄 លុបទិន្នន័យចាំ', () => { monthCache.clear(); say('✓ បានលុបទិន្នន័យចាំ — ចុច «គណនា» ម្តងទៀត'); })),
      h('p', { class: 'fin-muted', text: `រាប់ពី ${monthLabel(finMonth)} ថយក្រោយ។ ការគណនាអាចយឺតបន្តិចបើបុគ្គលិកច្រើន។` })));
    body.appendChild(out);
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ថវិកា ----
  function paneBudget(body) {
    const ld = loadMonth(finMonth);
    const sum = summarize(ld.rows);
    const B = getJson('fin_budget', {});
    const S = { basis: B.basis === 'gross' ? 'gross' : 'net', total: B.total || '', dept: (B.dept && typeof B.dept === 'object') ? B.dept : {} };
    const save = () => lsSet('fin_budget', JSON.stringify(S));
    const actualOf = o => (S.basis === 'gross' ? o.total + o.benefits : o.net);
    body.appendChild(rowEl(...monthNav()));

    const out = h('div');
    const bar = (st, pctText) => h('div', { style: 'display:flex;align-items:center;gap:6px' }, h('div', { class: 'fin-bar' + (st.over ? ' over' : ''), style: 'flex:1' }, h('i', { style: `width:${Math.min(100, st.pct).toFixed(1)}%` })), h('span', { class: 'fin-muted', text: pctText }));
    const renderOut = () => {
      out.textContent = '';
      if (!ld.rows.length) { out.appendChild(empty(noData(ld))); return; }
      const tot = budgetStatus(actualOf(sum.g), S.total);
      out.appendChild(h('div', { class: 'fin-grid' },
        statEl('$' + usd2(actualOf(sum.g)), S.basis === 'gross' ? 'ចំណាយពិត (តាមវត្តមាន + អត្ថប្រយោជន៍)' : 'ចំណាយពិត (ប្រាក់សុទ្ធត្រូវបើក)'),
        statEl(tot.has ? '$' + usd2(S.total) : '-', 'ថវិកាសរុប'),
        statEl(tot.has ? `${tot.over ? '−' : '+'}$${usd2(Math.abs(tot.diff))}` : '-', tot.has ? (tot.over ? 'លើសថវិកា' : 'នៅសល់ក្នុងថវិកា') : 'ចំនួនសល់'),
        statEl(tot.has ? tot.pct.toFixed(1) + '%' : '-', 'ប្រើប្រាស់ថវិកា')));
      if (tot.has) out.appendChild(h('div', { style: 'margin-bottom:12px' }, bar(tot, tot.over ? '⚠ លើសថវិកា' : 'ក្នុងថវិកា')));
      const rows = sum.depts.map(d => {
        const st = budgetStatus(actualOf(d), S.dept[d.dept]);
        return [d.dept, '$' + usd2(actualOf(d)), st.has ? '$' + usd2(S.dept[d.dept]) : '-', st.has ? `${st.over ? '−' : '+'}$${usd2(Math.abs(st.diff))}` : '-', st.has ? bar(st, st.pct.toFixed(0) + '%') : '-'];
      });
      out.appendChild(card('តាមផ្នែក', mkTable(['ផ្នែក', 'ចំណាយពិត', 'ថវិកា', 'សល់/លើស', 'ការប្រើប្រាស់'], rows, [1, 2, 3])));
    };

    const basis = h('select', null, h('option', { value: 'net', text: 'ប្រាក់សុទ្ធត្រូវបើក' }), h('option', { value: 'gross', text: 'តាមវត្តមាន + អត្ថប្រយោជន៍ (មុនកាត់)' }));
    basis.value = S.basis;
    basis.addEventListener('change', () => { S.basis = basis.value; save(); renderOut(); });
    const tot = h('input', { type: 'number', min: '0', step: '10', value: String(S.total), placeholder: 'ថវិកាសរុប ($)', style: 'width:150px' });
    tot.addEventListener('input', () => { S.total = tot.value; save(); renderOut(); });
    const deptInputs = sum.depts.map(d => {
      const i = h('input', { type: 'number', min: '0', step: '10', value: S.dept[d.dept] == null ? '' : String(S.dept[d.dept]), style: 'width:110px' });
      i.addEventListener('input', () => { if (i.value === '') delete S.dept[d.dept]; else S.dept[d.dept] = i.value; save(); renderOut(); });
      return lab(`${d.dept} `, i);
    });
    body.appendChild(card('🎯 ថវិកាប្រចាំខែ — ' + monthLabel(finMonth),
      rowEl(lab('គិតតាម ', basis), lab('ថវិកាសរុប ($) ', tot)),
      deptInputs.length ? h('p', { class: 'fin-muted', text: 'ថវិកាតាមផ្នែក ($)៖' }) : null,
      deptInputs.length ? rowEl(...deptInputs) : null,
      h('p', { class: 'fin-muted', text: 'ថវិកាត្រូវបានចងចាំលើ browser នេះ (ដូចគ្នាគ្រប់ខែ) ហើយប្រៀបធៀបជាមួយចំណាយពិតនៃខែដែលបានជ្រើស។' })));
    body.appendChild(out);
    renderOut();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ គណនី Finance (admin ប៉ុណ្ណោះ) ----
  const isFinanceRole = () => { try { return sessionStorage.getItem('finance_portal_role') === '1'; } catch (_) { return false; } };

  // ពាក្យសម្ងាត់ admin ទុកក្នុងអង្គចងចាំ (មិនរក្សាទុកលើថាស) ១០ នាទី ដើម្បីកុំវាយរាល់ប្រតិបត្តិការ
  let adminPwMem = null, adminPwTimer = null;
  const lockAdmin = () => { adminPwMem = null; if (adminPwTimer) { clearTimeout(adminPwTimer); adminPwTimer = null; } };
  const unlockAdmin = pw => {
    adminPwMem = pw;
    if (adminPwTimer) clearTimeout(adminPwTimer);
    adminPwTimer = setTimeout(() => { adminPwMem = null; adminPwTimer = null; if (sub === 'access') renderBody(); }, 10 * 60 * 1000);
  };
  const rpcErr = ex => {
    const m = (ex && ex.message) || String(ex);
    if (/admin_denied/.test(m)) return 'ពាក្យសម្ងាត់ admin មិនត្រឹមត្រូវ';
    if (/password_too_short/.test(m)) return 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ';
    if (/username_taken/.test(m)) return 'ឈ្មោះអ្នកប្រើនេះមានរួចហើយ';
    if (/username_invalid/.test(m)) return 'ឈ្មោះអ្នកប្រើត្រូវមាន ៣–៣០ តួ (a-z 0-9 . _ -)';
    return m;
  };
  const genPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ដកតួងាយច្រឡំ (l, 1, O, 0, I)
    const r = new Uint32Array(10); crypto.getRandomValues(r);
    return Array.from(r, x => chars[x % chars.length]).join('');
  };
  const askText = async (msg) => (typeof customPrompt === 'function' ? customPrompt(msg) : window.prompt(msg));
  const askYes = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(window.confirm(m)));
  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch (_) { return false; } };
  const fmtWhen = v => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleString(); };

  async function paneAccess(body) {
    const url = new URL('finance.html', location.href).href;
    const urlInput = h('input', { type: 'text', readonly: 'readonly', value: url, style: 'width:min(460px,100%)' });
    body.appendChild(card('🔗 តំណរទំព័រចូល Finance',
      rowEl(urlInput, btn('📋 ចម្លង', async () => { await say((await copyText(url)) ? '✓ បានចម្លងតំណរ' : 'ចម្លងមិនបាន — សូមចម្លងដោយដៃ'); })),
      h('p', { class: 'fin-muted', text: 'ផ្ញើតំណរនេះឲ្យអ្នក Finance ជាមួយឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់របស់ពួកគេ។' })));

    // ---- ជំហាន ១៖ ដោះសោដោយពាក្យសម្ងាត់ admin ----
    if (!adminPwMem) {
      const pw = h('input', { type: 'password', placeholder: 'ពាក្យសម្ងាត់ admin', autocomplete: 'current-password', style: 'min-width:240px' });
      const go = btn('🔓 បើកការគ្រប់គ្រងគណនី', async () => {
        if (!pw.value) { await say('សូមបញ្ចូលពាក្យសម្ងាត់ admin'); return; }
        go.disabled = true;
        try {
          const { data, error } = await supabaseClient.rpc('login_admin', { p_password: pw.value });
          if (error) throw error;
          if (!data) { await say('ពាក្យសម្ងាត់ admin មិនត្រឹមត្រូវ'); return; }
          unlockAdmin(pw.value); renderBody();
        } catch (ex) { await say('បើកមិនបាន៖ ' + rpcErr(ex)); }
        finally { go.disabled = false; }
      }, '');
      pw.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
      body.appendChild(card('🔐 គណនី Finance',
        h('p', { class: 'fin-muted', text: 'បញ្ចូលពាក្យសម្ងាត់ admin ដើម្បីមើល និងគ្រប់គ្រងគណនី Finance។ ពាក្យសម្ងាត់ត្រូវចងចាំក្នុងអង្គចងចាំតែ ១០ នាទី (មិនរក្សាទុកលើថាស)។' }),
        rowEl(pw, go)));
      return;
    }

    // ---- ជំហាន ២៖ បញ្ជីគណនី ----
    const listBox = h('div');
    const run = async (fn, okMsg) => {
      try { const r = await fn(); if (okMsg) await say(typeof okMsg === 'function' ? await okMsg(r) : okMsg); await load(); }
      catch (ex) { if (/admin_denied/.test((ex && ex.message) || '')) { lockAdmin(); renderBody(); } await say('មិនបាន៖ ' + rpcErr(ex)); }
    };
    const call = async (name, args) => { const { data, error } = await supabaseClient.rpc(name, Object.assign({ p_admin_password: adminPwMem }, args)); if (error) throw error; return data; };
    const draw = users => {
      listBox.textContent = '';
      if (!users.length) { listBox.appendChild(empty('មិនទាន់មានគណនី Finance — បង្កើតខាងក្រោម')); return; }
      listBox.appendChild(mkTable(['ឈ្មោះអ្នកប្រើ', 'ឈ្មោះពេញ', 'ស្ថានភាព', 'ចូលចុងក្រោយ', ''], users.map(u => [
        u.username, u.full_name || '-', badge(u.active ? 'សកម្ម' : 'បិទ', u.active ? '' : 'late'), fmtWhen(u.last_login),
        h('div', { class: 'fin-row', style: 'margin:0;flex-wrap:nowrap' },
          btn('✏️ ឈ្មោះ', async () => { const v = await askText(`ឈ្មោះពេញរបស់ «${u.username}»៖`); if (v === null || v === undefined) return; run(() => call('update_finance_user', { p_id: u.id, p_full_name: String(v).trim() }), '✓ បានកែឈ្មោះ'); }),
          btn('🔑 ពាក្យសម្ងាត់', async () => {
            const v = await askText(`ពាក្យសម្ងាត់ថ្មីរបស់ «${u.username}» (≥ ៦ តួ) — ទុកទទេ ដើម្បីបង្កើតដោយស្វ័យប្រវត្តិ៖`);
            if (v === null || v === undefined) return;
            const np = String(v).trim() || genPassword();
            run(async () => { await call('update_finance_user', { p_id: u.id, p_new_password: np }); return np; },
              async np2 => { const c = await copyText(`${u.username} / ${np2}`); return `✓ ពាក្យសម្ងាត់ថ្មីរបស់ ${u.username}៖ ${np2}${c ? '\n(បានចម្លងរួច)' : ''}\nសូមផ្ញើឲ្យគាត់ — នឹងមិនបង្ហាញទៀតទេ`; });
          }),
          btn(u.active ? '⏸ បិទ' : '▶ បើក', () => run(() => call('update_finance_user', { p_id: u.id, p_active: !u.active }), u.active ? '✓ បានបិទគណនី' : '✓ បានបើកគណនី')),
          btn('🗑 លុប', async () => { if (await askYes(`លុបគណនី «${u.username}»? មិនអាចត្រឡប់វិញបានទេ។`)) run(() => call('delete_finance_user', { p_id: u.id }), '✓ បានលុបគណនី'); }, 'danger'))])));
    };
    async function load() {
      listBox.textContent = 'កំពុងផ្ទុក…';
      try { draw((await call('list_finance_users', {})) || []); }
      catch (ex) {
        if (/admin_denied/.test((ex && ex.message) || '')) { lockAdmin(); renderBody(); return; }
        listBox.textContent = '⚠ ' + rpcErr(ex) + ' — ប្រហែលមិនទាន់រត់ finance-auth.sql ក្នុង Supabase';
      }
    }
    body.appendChild(card('👥 គណនី Finance', rowEl(btn('🔄 ផ្ទុកឡើងវិញ', load), btn('🔒 ចាក់សោវិញ', () => { lockAdmin(); renderBody(); })), listBox));

    // ---- ជំហាន ៣៖ បង្កើតគណនីថ្មី ----
    const fromEmp = h('select', { style: 'min-width:220px;max-width:100%' }, h('option', { value: '', text: '— ជ្រើសពីបុគ្គលិក (ស្រេចចិត្ត) —' }),
      emps().filter(e => e.status === 'active').slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((e, i) => h('option', { value: String(e.id), text: e.name + (e.dept ? ' · ' + e.dept : '') })));
    const uName = h('input', { type: 'text', placeholder: 'ឈ្មោះអ្នកប្រើ (a-z 0-9 . _ -)', autocapitalize: 'off', spellcheck: 'false', style: 'min-width:200px' });
    const fName = h('input', { type: 'text', placeholder: 'ឈ្មោះពេញ', style: 'min-width:200px' });
    const pwNew = h('input', { type: 'text', placeholder: 'ពាក្យសម្ងាត់ (≥ ៦ តួ)', autocomplete: 'off', style: 'min-width:180px' });
    fromEmp.addEventListener('change', () => {
      const e = emps().find(x => String(x.id) === fromEmp.value);
      if (!e) return;
      fName.value = e.name || '';
      const sug = String(e.username || '').toLowerCase();
      if (/^[a-z0-9._-]{3,30}$/.test(sug)) uName.value = sug;
    });
    const createBtn = btn('➕ បង្កើតគណនី', async () => {
      const u = uName.value.trim().toLowerCase(), p = pwNew.value;
      if (!/^[a-z0-9._-]{3,30}$/.test(u)) { await say('ឈ្មោះអ្នកប្រើត្រូវមាន ៣–៣០ តួ ដោយប្រើ a-z 0-9 . _ - ប៉ុណ្ណោះ'); return; }
      if (!p || p.length < 6) { await say('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ (ឬចុច 🎲 បង្កើត)'); return; }
      createBtn.disabled = true;
      try {
        await call('create_finance_user', { p_username: u, p_full_name: fName.value.trim(), p_password: p });
        const info = `ឈ្មោះអ្នកប្រើ៖ ${u}\nពាក្យសម្ងាត់៖ ${p}\nតំណរចូល៖ ${url}`;
        const c = await copyText(info);
        uName.value = fName.value = pwNew.value = ''; fromEmp.value = '';
        await say('✓ បានបង្កើតគណនី Finance\n\n' + info + (c ? '\n\n(បានចម្លងទៅ clipboard)' : '') + '\n\nសូមផ្ញើឲ្យអ្នកប្រើ — ពាក្យសម្ងាត់នឹងមិនបង្ហាញទៀតទេ');
        await load();
      } catch (ex) {
        if (/admin_denied/.test((ex && ex.message) || '')) { lockAdmin(); renderBody(); }
        await say('បង្កើតមិនបាន៖ ' + rpcErr(ex));
      } finally { createBtn.disabled = false; }
    }, '');
    body.appendChild(card('➕ បង្កើតគណនី Finance ថ្មី',
      rowEl(lab('ជ្រើសពីបុគ្គលិក ', fromEmp)),
      rowEl(uName, fName),
      rowEl(pwNew, btn('🎲 បង្កើតពាក្យសម្ងាត់', () => { pwNew.value = genPassword(); }), createBtn),
      h('p', { class: 'fin-muted', text: 'ម្នាក់ៗមានឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់ផ្ទាល់ខ្លួន។ ពាក្យសម្ងាត់ត្រូវបាន hash ក្នុង Supabase ហើយការចូលខុស ៥ ដងនឹងចាក់សោគណនីនោះ ៦០ វិនាទី។ ក្រោយចូល អ្នក Finance ឃើញតែទំព័រ Finance។' }),
      h('p', { class: 'fin-badge warn', text: '⚠ ការរឹតបន្តឹងនេះជាកម្រិតចំណុចប្រទាក់ (UI) ដូច admin ដែរ ព្រោះកម្មវិធីប្រើ anon key ជាមួយ RLS បើកទូលាយ។' })));
    load();
  }

  // ============================================================ មុខងារថ្មី (ប្រវត្តិឡើងប្រាក់ខែ · ពន្ធ · ក្រាហ្វ · ធនាគារ) ====
  const sbOk = () => typeof supabaseClient !== 'undefined' && !!supabaseClient;
  const fmtD = s => { s = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '-'; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
    kids.flat().forEach(c => { if (c != null) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return el;
  };
  const shortUsd = n => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
  const signed = (n, d) => (n >= 0 ? '+' : '−') + usd2(Math.abs(n)).replace(/\.00$/, d ? '.00' : '');
  const empName = (id, fallback) => { const e = emps().find(x => String(x.id) === String(id)); return (e && e.name) || fallback || String(id); };

  // ------------------------------------------------------------ ផ្ទាំង៖ ប្រវត្តិឡើងប្រាក់ខែ (អានតែប៉ុណ្ណោះ) ----
  const RAISE_ST = { applied: ['✓ បានអនុវត្ត', ''], pending: ['🕒 រង់ចាំ', 'warn'], conflict: ['⚠ មានបញ្ហា', 'late'], undone: ['↩ ត្រឡប់វិញ', 'warn'], cancelled: ['✖ លុប', 'late'] };
  const raiseSt = { q: '', status: 'all', year: 'all' };
  async function paneRaises(body) {
    if (!sbOk()) { body.appendChild(empty('មិនឃើញការតភ្ជាប់ Supabase')); return; }
    const out = h('div');
    body.appendChild(empty('កំពុងផ្ទុក…'));
    const { data, error } = await supabaseClient.from('salary_raises').select('*').order('effective_date', { ascending: false }).limit(3000);
    body.textContent = '';
    if (error) { body.appendChild(card('💹 ប្រវត្តិឡើងប្រាក់ខែ', empty('អានតារាង salary_raises មិនបាន៖ ' + error.message + ' — សូមដំណើរការ salary_raises.sql ក្នុង Supabase ជាមុន'))); return; }
    const all = (data || []).map(r => ({ r, name: empName(r.employee_id, r.employee_name), old: num(r.old_salary), nw: num(r.new_salary), eff: String(r.effective_date).slice(0, 10), st: r.status }));
    const years = Array.from(new Set(all.map(x => x.eff.slice(0, 4)))).sort().reverse();
    const q = h('input', { type: 'text', placeholder: '🔎 ឈ្មោះបុគ្គលិក', value: raiseSt.q, style: 'width:170px' });
    const selS = h('select', null, h('option', { value: 'all', text: 'គ្រប់ស្ថានភាព' }), Object.keys(RAISE_ST).map(k => h('option', { value: k, text: RAISE_ST[k][0] })));
    const selY = h('select', null, h('option', { value: 'all', text: 'គ្រប់ឆ្នាំ' }), years.map(y => h('option', { value: y, text: y })));
    selS.value = raiseSt.status; selY.value = years.includes(raiseSt.year) ? raiseSt.year : 'all';
    const draw = () => {
      out.textContent = '';
      const term = raiseSt.q.trim().toLowerCase();
      const rows = all.filter(x => (raiseSt.status === 'all' || x.st === raiseSt.status) && (raiseSt.year === 'all' || x.eff.startsWith(raiseSt.year)) && (!term || String(x.name).toLowerCase().includes(term)));
      const ap = rows.filter(x => x.st === 'applied'), pe = rows.filter(x => x.st === 'pending');
      const sumD = a => a.reduce((s, x) => s + (x.nw - x.old), 0);
      const avgPct = ap.length ? ap.reduce((s, x) => s + (x.old > 0 ? (x.nw - x.old) / x.old * 100 : 0), 0) / ap.length : 0;
      out.appendChild(h('div', { class: 'fin-grid' },
        statEl(String(ap.length), 'ការឡើងដែលបានអនុវត្ត'), statEl(signed(sumD(ap)) + ' $', 'ចំណាយបន្ថែម/ខែ (បានអនុវត្ត)'),
        statEl(`${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(1)}%`, 'មធ្យមភាគរយនៃការឡើង'),
        statEl(String(pe.length), 'កំពុងរង់ចាំ (កាលវិភាគ)'), statEl(signed(sumD(pe)) + ' $', 'ចំណាយបន្ថែម/ខែ (រង់ចាំ) ' )));
      if (!rows.length) { out.appendChild(empty('គ្មានទិន្នន័យ')); return; }
      const today = new Date(); const t0 = `${today.getFullYear()}-${z2(today.getMonth() + 1)}-${z2(today.getDate())}`;
      out.appendChild(mkTable(['ចាប់ពីថ្ងៃ', 'ឈ្មោះ', 'ចាស់ ($)', 'ថ្មី ($)', 'ឡើង ($)', 'ឡើង %', 'ស្ថានភាព', 'កំណត់ចំណាំ'],
        rows.map(x => {
          const d = x.nw - x.old, st = RAISE_ST[x.st] || [x.st, ''];
          const left = x.st === 'pending' ? Math.round((new Date(x.eff + 'T00:00:00') - new Date(t0 + 'T00:00:00')) / 86400000) : null;
          return [fmtD(x.eff) + (left != null && left >= 0 ? ` (ក្នុង ${left} ថ្ងៃ)` : ''), x.name, usd2(x.old), usd2(x.nw), signed(d, true), x.old > 0 ? `${d >= 0 ? '+' : ''}${(d / x.old * 100).toFixed(1)}%` : '-', badge(st[0], st[1]), x.r.note || ''];
        }), [2, 3, 4, 5]));
      out.appendChild(rowEl(btn('⬇ CSV', () => download('salary-raises.csv', toCsv([['ចាប់ពីថ្ងៃ', 'ឈ្មោះ', 'ប្រាក់ខែចាស់', 'ប្រាក់ខែថ្មី', 'ឡើង', 'ស្ថានភាព', 'ចំណាំ']].concat(rows.map(x => [x.eff, x.name, x.old, x.nw, r2(x.nw - x.old), x.st, x.r.note || '']))), 'text/csv;charset=utf-8'))));
    };
    q.addEventListener('input', () => { raiseSt.q = q.value; draw(); });
    selS.addEventListener('change', () => { raiseSt.status = selS.value; draw(); });
    selY.addEventListener('change', () => { raiseSt.year = selY.value; draw(); });
    body.appendChild(card('💹 ប្រវត្តិឡើងប្រាក់ខែ & កាលវិភាគ', rowEl(q, lab('ស្ថានភាព ', selS), lab('ឆ្នាំ ', selY)), out));
    body.appendChild(h('p', { class: 'fin-muted', text: 'ទំព័រនេះអានតែប៉ុណ្ណោះ — ការឡើងប្រាក់ខែធ្វើក្នុង «ឧបករណ៍ HR» ដោយ Admin។ ប្រាក់ខែថ្មីត្រូវគិតក្នុង payroll ចាប់ពីថ្ងៃចាប់ពីពិតប្រាកដ។' }));
    draw();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ពន្ធលើប្រាក់ខែ (ប៉ាន់ស្មាន) ----
  // ដំណាក់កាលប្រចាំខែ (អ្នករស់នៅ) · [ដែនកំណត់លើ, អត្រា, ចំនួនកាត់ថេរ] — ប្រភព៖ Sub-Decree 196 / PwC Tax Summaries (ពិនិត្យ ០២ មេសា ២០២៦)
  const TAX_BRACKETS = [[1500000, 0, 0], [2000000, 0.05, 75000], [8500000, 0.10, 175000], [12500000, 0.15, 600000], [Infinity, 0.20, 1225000]];
  const TAX_REBATE = 150000; // ក្នុងមួយប្តី/ប្រពន្ធ ឬកូនក្នុងបន្ទុក (រៀល/ខែ)
  function salaryTaxKhr(taxable, o) {
    o = o || {};
    taxable = num(taxable);
    if (taxable <= 0) return 0;
    if (o.nonres) return Math.round(taxable * 0.20); // មិនមែនអ្នករស់នៅ៖ ២០% ថេរ គ្មានការកាត់
    const base = Math.max(0, taxable - TAX_REBATE * Math.max(0, Math.floor(num(o.dep))));
    for (const b of TAX_BRACKETS) { if (base <= b[0]) return Math.max(0, Math.round(base * b[1] - b[2])); }
    return 0;
  }
  const LS_TAX = 'fin_tax_people';
  const taxSt = { rate: '', ben: true, ded: true };
  function paneTax(body) {
    const ld = loadMonth(finMonth);
    body.appendChild(rowEl(...monthNav()));
    if (!ld.rows.length) { body.appendChild(empty(noData(ld))); return; }
    const people = getJson(LS_TAX, {});
    const out = h('div');
    const rate = h('input', { type: 'number', min: '1', step: '1', value: taxSt.rate, placeholder: String(rateNow()), style: 'width:100px' });
    const cBen = h('input', { type: 'checkbox' }); cBen.checked = taxSt.ben;
    const cDed = h('input', { type: 'checkbox' }); cDed.checked = taxSt.ded;
    const calcRow = (r, rt) => {
      const p = people[r.e.id] || {};
      const usd = Math.max(0, r.total + (taxSt.ben ? r.benefits : 0) - (taxSt.ded ? r.deductions : 0));
      const khr = Math.round(usd * rt), tax = salaryTaxKhr(khr, p), taxUsd = tax / rt;
      return { r, p, usd, khr, tax, taxUsd, net: r.net - taxUsd };
    };
    const draw = () => {
      out.textContent = '';
      const rt = num(taxSt.rate) || rateNow();
      const rows = ld.rows.map(r => calcRow(r, rt));
      const tot = rows.reduce((a, x) => ({ tax: a.tax + x.tax, usd: a.usd + x.usd, taxUsd: a.taxUsd + x.taxUsd, net: a.net + x.net }), { tax: 0, usd: 0, taxUsd: 0, net: 0 });
      out.appendChild(h('div', { class: 'fin-grid' },
        statEl(riel(tot.tax) + ' ៛', 'ពន្ធលើប្រាក់ខែសរុប (ប៉ាន់ស្មាន)'), statEl('$' + usd2(tot.taxUsd), 'ស្មើជាដុល្លារ'),
        statEl('$' + usd2(tot.usd), 'ប្រាក់ខែជាប់ពន្ធសរុប'), statEl('$' + usd2(tot.net), 'ប្រាក់សុទ្ធក្រោយពន្ធ'),
        statEl(`${rows.filter(x => x.tax > 0).length}/${rows.length} នាក់`, 'បុគ្គលិកដែលត្រូវបង់ពន្ធ')));
      out.appendChild(mkTable(['ឈ្មោះ', 'ផ្នែក', 'ជាប់ពន្ធ ($)', 'ជាប់ពន្ធ (៛)', 'ក្នុងបន្ទុក', 'មិនមែនអ្នករស់នៅ', 'ពន្ធ (៛)', 'ពន្ធ ($)', 'សុទ្ធក្រោយពន្ធ ($)'],
        rows.map(x => {
          const dep = h('input', { type: 'number', min: '0', step: '1', value: String(x.p.dep || 0), style: 'width:62px' });
          const nr = h('input', { type: 'checkbox' }); nr.checked = !!x.p.nonres;
          const save = () => { const id = x.r.e.id; people[id] = { dep: Math.max(0, Math.floor(num(dep.value))), nonres: nr.checked }; lsSet(LS_TAX, JSON.stringify(people)); draw(); };
          dep.addEventListener('change', save); nr.addEventListener('change', save);
          return [x.r.e.name, x.r.e.dept || '-', usd2(x.usd), riel(x.khr), dep, nr, riel(x.tax), usd2(x.taxUsd), usd2(x.net)];
        }), [2, 3, 6, 7, 8]));
      out.appendChild(rowEl(btn('⬇ CSV', () => download(`salary-tax-${finMonth}.csv`, toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ជាប់ពន្ធ ($)', 'ជាប់ពន្ធ (៛)', 'ក្នុងបន្ទុក', 'មិនមែនអ្នករស់នៅ', 'ពន្ធ (៛)', 'ពន្ធ ($)', 'សុទ្ធក្រោយពន្ធ ($)']]
        .concat(rows.map(x => [x.r.e.username || x.r.e.id, x.r.e.name, x.r.e.dept || '', r2(x.usd), x.khr, x.p.dep || 0, x.p.nonres ? 'បាទ/ចាស' : '', x.tax, r2(x.taxUsd), r2(x.net)]))), 'text/csv;charset=utf-8'))));
    };
    rate.addEventListener('input', () => { taxSt.rate = rate.value; draw(); });
    cBen.addEventListener('change', () => { taxSt.ben = cBen.checked; draw(); });
    cDed.addEventListener('change', () => { taxSt.ded = cDed.checked; draw(); });
    body.appendChild(card('🧾 ពន្ធលើប្រាក់ខែ (Tax on Salary) — ប៉ាន់ស្មាន', rowEl(lab('អត្រា 1$ = ៛ ', rate), lab(h('span', null, cBen, ' រួមអត្ថប្រយោជន៍'), ''), lab(h('span', null, cDed, ' ដកប្រាក់កាត់មុនគិតពន្ធ'), '')), out));
    body.appendChild(h('p', { class: 'fin-muted', text: 'អត្រាអ្នករស់នៅ (ប្រចាំខែ)៖ ០–១,៥០០,០០០៛ = 0% · ដល់ ២,០០០,០០០៛ = 5% · ដល់ ៨,៥០០,០០០៛ = 10% · ដល់ ១២,៥០០,០០០៛ = 15% · លើសនោះ = 20%។ ក្នុងបន្ទុក (ប្តី/ប្រពន្ធ/កូន) កាត់ ១៥០,០០០៛ម្នាក់។ មិនមែនអ្នករស់នៅ = 20% ថេរ។ ចំនួនក្នុងបន្ទុកទុកក្នុង browser នេះ។ នេះគ្រាន់តែជាការប៉ាន់ស្មាន (មិនរួមពន្ធអត្ថប្រយោជន៍បន្ថែម 20% ឬ ប.ស.ស) — សូមផ្ទៀងផ្ទាត់ជាមួយគណនេយ្យករ/អគ្គនាយកដ្ឋានពន្ធដារ មុនប្រកាស។' }));
    draw();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ក្រាហ្វ & ប្រៀបធៀបខែមុន ----
  const chartSt = { year: String(new Date().getFullYear()), metric: 'net' };
  const METRICS = { net: ['ប្រាក់សុទ្ធ', 'net'], total: ['តាមវត្តមាន', 'total'], benefits: ['អត្ថប្រយោជន៍', 'benefits'], deductions: ['ប្រាក់កាត់', 'deductions'] };
  function barChart(vals, labels, highlightIdx) {
    const W = 720, H = 250, L = 8, B = 28, T = 22, n = vals.length, bw = (W - L * 2) / n;
    const max = Math.max(1, ...vals), ch = H - B - T;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'max-width:760px;display:block' });
    const nz = vals.filter(v => v > 0), avg = nz.length ? nz.reduce((a, v) => a + v, 0) / nz.length : 0;
    vals.forEach((v, i) => {
      const hh = Math.round(v / max * ch), x = L + i * bw + bw * 0.15, w = bw * 0.7, y = T + ch - hh;
      svg.appendChild(sv('rect', { x, y, width: w, height: Math.max(hh, v > 0 ? 2 : 0), rx: 4, fill: i === highlightIdx ? '#f59e0b' : '#0d9488' }, sv('title', null, `${labels[i]}: $${usd2(v)}`)));
      if (v > 0) svg.appendChild(sv('text', { x: x + w / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', opacity: 0.75 }, shortUsd(v)));
      svg.appendChild(sv('text', { x: x + w / 2, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', opacity: 0.7 }, labels[i]));
    });
    if (avg > 0) {
      const ya = T + ch - Math.round(avg / max * ch);
      svg.appendChild(sv('line', { x1: L, x2: W - L, y1: ya, y2: ya, stroke: '#dc2626', 'stroke-dasharray': '5 4', 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: W - L, y: ya - 4, 'text-anchor': 'end', 'font-size': 10, fill: '#dc2626' }, 'មធ្យម $' + shortUsd(avg)));
    }
    return svg;
  }
  const deltaTxt = (c, p) => (p > 0 ? `${c >= p ? '+' : ''}${((c - p) / p * 100).toFixed(1)}%` : '-');
  async function paneCharts(body) {
    // ① ក្រាហ្វប្រចាំឆ្នាំ
    const yNow = new Date().getFullYear();
    const selY = h('select', null, [0, 1, 2, 3].map(i => h('option', { value: String(yNow - i), text: String(yNow - i) })));
    selY.value = chartSt.year;
    const selM = h('select', null, Object.keys(METRICS).map(k => h('option', { value: k, text: METRICS[k][0] })));
    selM.value = chartSt.metric;
    const chartOut = h('div');
    const drawYear = async (force) => {
      chartSt.year = selY.value; chartSt.metric = selM.value;
      const months = Array.from({ length: 12 }, (_, i) => `${chartSt.year}-${z2(i + 1)}`);
      const res = [];
      for (let i = 0; i < 12; i++) {
        if (force || !monthCache.has(months[i])) {
          chartOut.textContent = `កំពុងគណនា ${i + 1}/12 (${months[i]})…`;
          await new Promise(r => setTimeout(r, 0));
          try { monthCache.set(months[i], summarize(loadMonth(months[i]).rows).g); } catch (_) { monthCache.set(months[i], summarize([]).g); }
        }
        res.push(monthCache.get(months[i]));
      }
      chartOut.textContent = '';
      const key = METRICS[chartSt.metric][1], vals = res.map(g => num(g[key]));
      chartOut.appendChild(barChart(vals, Array.from({ length: 12 }, (_, i) => String(i + 1)), chartSt.year === curMonth().slice(0, 4) ? +curMonth().slice(5) - 1 : -1));
      const tot = vals.reduce((a, v) => a + v, 0);
      chartOut.appendChild(h('div', { class: 'fin-grid' }, statEl('$' + usd2(tot), `${METRICS[chartSt.metric][0]} សរុបឆ្នាំ ${chartSt.year}`),
        statEl('$' + usd2(Math.max(...vals)), `ខ្ពស់បំផុត (${KH_MONTHS[vals.indexOf(Math.max(...vals))] || '-'})`),
        statEl(res.reduce((a, g) => a + g.n, 0) ? Math.round(res.filter(g => g.n).reduce((a, g) => a + g.n, 0) / res.filter(g => g.n).length) + ' នាក់' : '-', 'បុគ្គលិកមធ្យម/ខែ')));
    };
    const go = btn('📊 គណនា/ធ្វើឱ្យទាន់សម័យ', () => { go.disabled = true; drawYear(true).finally(() => { go.disabled = false; }); }, '');
    selY.addEventListener('change', () => drawYear(false)); selM.addEventListener('change', () => drawYear(false));
    body.appendChild(card('📉 ចំណាយប្រាក់ខែប្រចាំឆ្នាំ', rowEl(lab('ឆ្នាំ ', selY), lab('ប្រភេទ ', selM), go), chartOut,
      h('p', { class: 'fin-muted', text: 'ខ្សែក្រហម = មធ្យមនៃខែដែលមានទិន្នន័យ · ខែបច្ចុប្បន្នពណ៌លឿង។ ខែដែលមិនទាន់មានទិន្នន័យបង្ហាញ ០។' })));

    // ② ប្រៀបធៀបខែមុន
    const cur = loadMonth(finMonth), prevM = shiftMonth(finMonth, -1), prv = loadMonth(prevM);
    body.appendChild(rowEl(...monthNav()));
    if (!cur.rows.length) { body.appendChild(empty(noData(cur))); drawYear(false); return; }
    const sc = summarize(cur.rows), sp = summarize(prv.rows);
    const cmp = [['បុគ្គលិក (នាក់)', sc.g.n, sp.g.n, 0], ['តាមវត្តមាន ($)', sc.g.total, sp.g.total, 1], ['អត្ថប្រយោជន៍ ($)', sc.g.benefits, sp.g.benefits, 1], ['ប្រាក់កាត់ ($)', sc.g.deductions, sp.g.deductions, 1], ['OT ($)', sc.g.otPay, sp.g.otPay, 1], ['ប្រាក់សុទ្ធ ($)', sc.g.net, sp.g.net, 1]];
    body.appendChild(card(`🔁 ប្រៀបធៀប ${monthLabel(finMonth)} ជាមួយ ${monthLabel(prevM)}`,
      mkTable(['ធាតុ', monthLabel(finMonth), monthLabel(prevM), 'ផ្លាស់ប្តូរ', '%'], cmp.map(c => [c[0], c[3] ? usd2(c[1]) : String(c[1]), c[3] ? usd2(c[2]) : String(c[2]), c[3] ? signed(c[1] - c[2], true) : `${c[1] - c[2] >= 0 ? '+' : ''}${c[1] - c[2]}`, deltaTxt(c[1], c[2])]), [1, 2, 3, 4]),
      prv.rows.length ? null : empty('ខែមុនមិនទាន់មានទិន្នន័យ')));
    const dmap = new Map(sp.depts.map(d => [d.dept, d]));
    const names = Array.from(new Set(sc.depts.map(d => d.dept).concat(sp.depts.map(d => d.dept))));
    const dmax = Math.max(1, ...names.map(k => Math.max((sc.depts.find(d => d.dept === k) || {}).net || 0, (dmap.get(k) || {}).net || 0)));
    body.appendChild(card('🏢 តាមផ្នែក (សុទ្ធ)', mkTable(['ផ្នែក', 'ខែនេះ ($)', 'ខែមុន ($)', 'ផ្លាស់ប្តូរ', ''], names.map(k => {
      const a = (sc.depts.find(d => d.dept === k) || {}).net || 0, b = (dmap.get(k) || {}).net || 0;
      return [k, usd2(a), usd2(b), `${signed(a - b, true)} (${deltaTxt(a, b)})`, h('div', { class: 'fin-bar', style: 'min-width:120px' }, h('i', { style: `width:${(a / dmax * 100).toFixed(1)}%` }))];
    }), [1, 2, 3])));
    const pm = new Map(prv.rows.map(r => [String(r.e.id), r]));
    const chg = cur.rows.filter(r => pm.has(String(r.e.id))).map(r => ({ r, d: r.net - pm.get(String(r.e.id)).net })).filter(x => Math.abs(x.d) >= 0.005);
    const ups = chg.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5), downs = chg.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
    const mover = list => list.length ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'ខែនេះ ($)', 'ខែមុន ($)', 'ផ្លាស់ប្តូរ ($)'], list.map(x => [x.r.e.name, x.r.e.dept || '-', usd2(x.r.net), usd2(pm.get(String(x.r.e.id)).net), signed(x.d, true)]), [2, 3, 4]) : empty('គ្មាន');
    body.appendChild(card('⬆ កើនឡើងច្រើនជាងគេ (Top 5)', mover(ups)));
    body.appendChild(card('⬇ ធ្លាក់ចុះច្រើនជាងគេ (Top 5)', mover(downs)));
    const added = cur.rows.filter(r => !pm.has(String(r.e.id))), gone = prv.rows.filter(r => !cur.rows.some(c => String(c.e.id) === String(r.e.id)));
    if (added.length || gone.length) body.appendChild(rowEl(...[added.length ? badge(`＋ ចូលថ្មី/ចូលបញ្ជី ${added.length}: ${added.map(r => r.e.name).join(', ')}`, '') : null, gone.length ? badge(`− ចេញពីបញ្ជី ${gone.length}: ${gone.map(r => r.e.name).join(', ')}`, 'warn') : null].filter(Boolean)));
    drawYear(false);
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ឯកសារផ្ទេរប្រាក់ធនាគារ ----
  const BANK_TBL = 'employee_bank_accounts';
  const bankSt = { cur: 'USD', adv: false, remark: '' };
  async function loadBanks() {
    const { data, error } = await supabaseClient.from(BANK_TBL).select('*');
    if (error) throw new Error(error.message + ' — សូមដំណើរការ salary_raises.sql (ផ្នែក employee_bank_accounts) ក្នុង Supabase ជាមុន');
    return new Map((data || []).map(r => [String(r.employee_id), r]));
  }
  async function paneBank(body) {
    if (!sbOk()) { body.appendChild(empty('មិនឃើញការតភ្ជាប់ Supabase')); return; }
    const ld = loadMonth(finMonth);
    body.appendChild(rowEl(...monthNav()));
    if (!ld.rows.length) { body.appendChild(empty(noData(ld))); return; }
    let banks;
    try { banks = await loadBanks(); } catch (ex) { body.appendChild(card('🏦 ផ្ទេរប្រាក់ធនាគារ', empty(ex.message || String(ex)))); return; }
    if (!bankSt.remark) bankSt.remark = 'ប្រាក់ខែ';
    const out = h('div');
    const selC = h('select', null, h('option', { value: 'USD', text: 'ដុល្លារ (USD)' }), h('option', { value: 'KHR', text: 'រៀល (KHR — បង្គត់ ១០០)' }));
    selC.value = bankSt.cur;
    const rate = h('input', { type: 'number', min: '1', step: '1', placeholder: String(rateNow()), style: 'width:100px' });
    const remark = h('input', { type: 'text', value: bankSt.remark, style: 'width:170px' });
    const cAdv = h('input', { type: 'checkbox' }); cAdv.checked = bankSt.adv;
    const amountOf = (r, rt) => {
      const usd = Math.max(0, r.net - (bankSt.adv ? r.adv : 0));
      return bankSt.cur === 'KHR' ? Math.round(usd * rt / 100) * 100 : r2(usd);
    };
    const draw = () => {
      out.textContent = '';
      const rt = num(rate.value) || rateNow();
      const list = ld.rows.map(r => ({ r, b: banks.get(String(r.e.id)), amt: amountOf(r, rt) }));
      const ok = list.filter(x => x.amt > 0 && x.b && x.b.account_no), missing = list.filter(x => x.amt > 0 && !(x.b && x.b.account_no));
      const total = ok.reduce((a, x) => a + x.amt, 0);
      out.appendChild(h('div', { class: 'fin-grid' }, statEl(`${ok.length} នាក់`, 'រួចរាល់ក្នុងឯកសារ'),
        statEl(bankSt.cur === 'KHR' ? riel(total) + ' ៛' : '$' + usd2(total), 'ចំនួនផ្ទេរសរុប'),
        statEl(`${missing.length} នាក់`, 'ខ្វះព័ត៌មានគណនី'), statEl(`${list.filter(x => x.amt <= 0).length} នាក់`, 'រំលង (សុទ្ធ ≤ 0)')));
      if (missing.length) out.appendChild(rowEl(badge('⚠ ខ្វះគណនី៖ ' + missing.map(x => x.r.e.name).join(', '), 'warn')));
      const rows = list.filter(x => x.amt > 0).map(x => {
        const bn = h('input', { type: 'text', value: (x.b && x.b.bank_name) || '', placeholder: 'ABA / ACLEDA …', style: 'width:110px' });
        const an = h('input', { type: 'text', value: (x.b && x.b.account_no) || '', placeholder: 'លេខគណនី', style: 'width:130px' });
        const nm = h('input', { type: 'text', value: (x.b && x.b.account_name) || '', placeholder: x.r.e.name, style: 'width:140px' });
        const save = async () => {
          const row = { employee_id: String(x.r.e.id), bank_name: bn.value.trim(), account_no: an.value.trim(), account_name: nm.value.trim(), updated_at: new Date().toISOString() };
          const { error } = await supabaseClient.from(BANK_TBL).upsert(row, { onConflict: 'employee_id' });
          if (error) { say('រក្សាទុកមិនបាន៖ ' + error.message); return; }
          banks.set(row.employee_id, row); draw();
        };
        [bn, an, nm].forEach(i => i.addEventListener('change', save));
        return [x.r.e.name, x.r.e.dept || '-', bankSt.cur === 'KHR' ? riel(x.amt) + ' ៛' : usd2(x.amt), bn, an, nm];
      });
      out.appendChild(mkTable(['ឈ្មោះ', 'ផ្នែក', 'ចំនួនផ្ទេរ', 'ធនាគារ', 'លេខគណនី', 'ឈ្មោះគណនី'], rows, [2]));
      out.appendChild(rowEl(btn('⬇ ទាញយកឯកសារផ្ទេរប្រាក់ (CSV)', () => {
        if (!ok.length) { say('មិនមានបុគ្គលិកដែលមានលេខគណនី'); return; }
        const rm = `${bankSt.remark} ${finMonth}`.trim();
        download(`bank-transfer-${finMonth}-${bankSt.cur}.csv`, toCsv([['No', 'Employee ID', 'Account Name', 'Account Number', 'Bank', 'Amount', 'Currency', 'Remark']]
          .concat(ok.map((x, i) => [i + 1, x.r.e.username || x.r.e.id, x.b.account_name || x.r.e.name, x.b.account_no, x.b.bank_name || '', bankSt.cur === 'KHR' ? x.amt : x.amt.toFixed(2), bankSt.cur, rm]))), 'text/csv;charset=utf-8');
      }, ''), btn('⬇ បញ្ជីខ្វះគណនី (CSV)', () => download(`bank-missing-${finMonth}.csv`, toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក']].concat(missing.map(x => [x.r.e.username || x.r.e.id, x.r.e.name, x.r.e.dept || '']))), 'text/csv;charset=utf-8'))));
    };
    selC.addEventListener('change', () => { bankSt.cur = selC.value; draw(); });
    rate.addEventListener('input', draw);
    remark.addEventListener('input', () => { bankSt.remark = remark.value; });
    cAdv.addEventListener('change', () => { bankSt.adv = cAdv.checked; draw(); });
    body.appendChild(card('🏦 ឯកសារផ្ទេរប្រាក់ធនាគារ', rowEl(lab('រូបិយប័ណ្ណ ', selC), lab('អត្រា 1$ = ៛ ', rate), lab('កំណត់ចំណាំ ', remark), lab(h('span', null, cAdv, ' ដកប្រាក់ខែទី១ ដែលបានបើកហើយ'), '')), out));
    body.appendChild(h('p', { class: 'fin-muted', text: 'ចំនួនផ្ទេរ = ប្រាក់សុទ្ធនៃខែនោះ (ដូចផ្ទាំង «បើកសាច់ប្រាក់»)។ វាយព័ត៌មានគណនីក្នុងតារាង — រក្សាទុកក្នុង Supabase ដោយស្វ័យប្រវត្តិ ហើយប្រើបានគ្រប់ខែ។ CSV ជាទម្រង់ទូទៅ៖ បើធនាគារ (ABA/ACLEDA…) ត្រូវការទម្រង់ជាក់លាក់ សូមចម្លងជួរចូលក្នុង Template របស់ធនាគារ។' }));
    draw();
  }

  // ------------------------------------------------------------ ផ្ទាំង Payroll ដែលមានស្រាប់ (យកមកដាក់ក្នុង Finance) ----
  // មិនចម្លងកូដ៖ យកផ្ទាំងដើមរបស់កម្មវិធី (ប្រាក់ខែប្រចាំខែ, អត្ថប្រយោជន៍ & ប្រាក់កាត់, កាត់លុយ, បំណាច់ឆ្នាំ, NSSF)
  // មកដាក់ក្នុងទំព័រ Finance ដូច្នេះមុខងារទាំងអស់ (បិទខែ, Payslip, ពន្ធ, ប្រាក់ខែទី១ …) ដំណើរការដូចដើម
  // ហើយនឹងត្រូវដាក់ត្រឡប់ទៅកន្លែងដើមវិញ ពេលចាកចេញពីទំព័រ Finance (admin នៅប្រើ Payrolls ធម្មតាបាន)
  const PAYROLL_TABS = [
    { key: 'p-monthly', label: '⭐ ប្រាក់ខែប្រចាំខែ', id: 'monthlyTab', render: () => { if (typeof renderMonthlyTab === 'function') renderMonthlyTab(); } },
    { key: 'p-items', label: '🧾 អត្ថប្រយោជន៍ & ប្រាក់កាត់', id: 'payrollTab', render: () => { if (typeof renderPayrollTab === 'function') renderPayrollTab(); } },
    { key: 'p-deduct', label: '⏱ យឺត/ច្បាប់ → កាត់លុយ', id: 'deductTab', render: () => { if (typeof renderDeductTab === 'function') renderDeductTab(); } },
    { key: 'p-bonus', label: '🎁 បំណាច់ឆ្នាំ', id: 'bonusTab', render: () => { if (typeof renderBonusTab === 'function') renderBonusTab(); } },
    { key: 'p-nssf', label: '🏛 ប.ស.ស (NSSF)', id: 'nssfTab', render: () => { if (typeof onFeatureTab === 'function') onFeatureTab('nssf'); } }
  ];
  const mounted = new Map(); // id → { el, parent, next }

  function unmountAll() {
    mounted.forEach(m => {
      m.el.classList.remove('fin-mounted', 'fin-show');
      if (m.parent) {
        try { m.parent.insertBefore(m.el, m.next && m.next.parentNode === m.parent ? m.next : null); } catch (_) { m.parent.appendChild(m.el); }
      }
    });
    mounted.clear();
  }

  function mountPayroll(def, body) {
    let el = document.getElementById(def.id);
    if (!el) { try { def.render(); } catch (ex) { console.error('finance payroll', ex); } el = document.getElementById(def.id); } // ផ្ទាំងខ្លះ (NSSF) ត្រូវបានបង្កើតពេលហៅ render ដំបូង
    if (!el) { body.appendChild(empty(`មិនឃើញផ្ទាំង «${def.label}» ក្នុងកម្មវិធី (ឬមិនទាន់ផ្ទុក)`)); return; }
    mounted.set(def.id, { el, parent: el.parentNode, next: el.nextSibling });
    el.classList.add('fin-mounted', 'fin-show');
    body.appendChild(el);
    try { def.render(); } catch (ex) { console.error('finance payroll', ex); body.appendChild(empty('មានបញ្ហា៖ ' + (ex.message || ex))); }
  }

  // ------------------------------------------------------------ ទំព័រ ----
  // [key, ស្លាក, pane, ក្រុម]
  const GROUPS = { reports: '📊 របាយការណ៍', payroll: '💰 Payroll', tax: '🧾 ពន្ធ & ធនាគារ', admin: '⚙ គ្រប់គ្រង' };
  const SUBS = [
    ['overview', '📊 សង្ខេប', paneOverview, 'reports'],
    ['cash', '💵 បើកសាច់ប្រាក់', paneCash, 'reports'],
    ['trend', '📈 និន្នាការ', paneTrend, 'reports'],
    ['budget', '🎯 ថវិកា', paneBudget, 'reports'],
    ['charts', '📉 ក្រាហ្វ & ប្រៀបធៀប', paneCharts, 'reports'],
    ['raises', '💹 ប្រវត្តិឡើងប្រាក់ខែ', paneRaises, 'reports']
  ].concat(PAYROLL_TABS.map(d => [d.key, d.label, body => mountPayroll(d, body), 'payroll']))
    .concat([['tax', '🧾 ពន្ធលើប្រាក់ខែ', paneTax, 'tax'], ['bank', '🏦 ផ្ទេរប្រាក់ធនាគារ', paneBank, 'tax']]);

  // ម៉ឺនុយខាងឆ្វេង (សម្រាប់គណនី Finance) — ចុចហើយទៅផ្ទាំងរងដែលត្រូវគ្នា
  const FIN_NAV = [['overview', '📊', 'របាយការណ៍'], ['p-monthly', '💰', 'Payroll'], ['raises', '💹', 'ប្រវត្តិឡើងប្រាក់ខែ'], ['charts', '📉', 'ក្រាហ្វ & ប្រៀបធៀប'], ['tax', '🧾', 'ពន្ធលើប្រាក់ខែ'], ['bank', '🏦', 'ផ្ទេរប្រាក់ធនាគារ']];
  function syncFinNav() {
    const fin = isFinanceRole();
    document.querySelectorAll('.nav-item[data-fin-sub]').forEach(n => {
      n.style.display = fin ? '' : 'none';
      n.classList.toggle('active', fin && n.dataset.finSub === sub);
    });
  }
  if (!isFinanceRole()) SUBS.push(['access', '🔑 គណនី Finance', paneAccess, 'admin']); // admin ប៉ុណ្ណោះ

  function renderBody() {
    if (!bodyEl) return;
    unmountAll(); // ដាក់ផ្ទាំង Payroll ត្រឡប់កន្លែងដើមវិញមុន (រួចទើបសម្អាត)
    bodyEl.textContent = '';
    Array.from(tabsEl.children).forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
    syncFinNav();
    const def = SUBS.find(x => x[0] === sub) || SUBS[0];
    try {
      const r = def[2](bodyEl);
      if (r && typeof r.catch === 'function') r.catch(ex => { console.error('finance', ex); bodyEl.appendChild(empty('មានបញ្ហា៖ ' + (ex.message || ex))); });
    } catch (ex) { console.error('finance', ex); bodyEl.appendChild(empty('មានបញ្ហា៖ ' + (ex.message || ex))); }
  }

  function init() {
    const empTab = document.getElementById('employeesTab');
    const anchor = document.querySelector('.nav-item[data-tab="monthly"]');
    const aiNav = document.querySelector('.nav-item[data-tab="ai"]');
    if (!empTab || !(anchor || aiNav)) return false;
    if (document.getElementById('financeTab')) return true;
    injectCss();

    const nav = h('button', { class: 'nav-item', type: 'button', 'data-tab': 'finance' },
      h('span', { class: 'ico', text: '💼' }), h('span', { class: 'lbl', text: 'Finance' }));
    const group = anchor && anchor.closest('.nav-group');
    if (group) group.after(nav); else aiNav.before(nav);
    nav.addEventListener('click', () => { if (typeof showTab === 'function') showTab('finance'); renderBody(); });
    let prevNav = nav;
    FIN_NAV.forEach(x => {
      const n = h('button', { class: 'nav-item', type: 'button', 'data-tab': 'finance', 'data-fin-sub': x[0] },
        h('span', { class: 'ico', text: x[1] }), h('span', { class: 'lbl', text: x[2] }));
      n.addEventListener('click', () => { sub = x[0]; if (typeof showTab === 'function') showTab('finance'); renderBody(); });
      prevNav.after(n); prevNav = n;
    });

    let lastGroup = null;
    tabsEl = h('div', { class: 'fin-tabs' }, SUBS.map(x => {
      const b = h('button', { class: 'secondary', type: 'button', 'data-sub': x[0], text: x[1] });
      b.addEventListener('click', () => { sub = x[0]; renderBody(); });
      if (x[3] && x[3] !== lastGroup) { lastGroup = x[3]; return [h('span', { class: 'fin-sep', text: GROUPS[x[3]] || '' }), b]; }
      return b;
    }).flat());
    // ចាកចេញពីទំព័រ Finance (admin) → ដាក់ផ្ទាំង Payroll ត្រឡប់កន្លែងដើម ដើម្បីឲ្យម៉ឺនុយ Payrolls ធម្មតាដំណើរការ
    const origShowTab = window.showTab;
    if (typeof origShowTab === 'function' && !origShowTab.__finUnmount) {
      const w = function (tab) { if (tab !== 'finance' && !isFinanceRole()) unmountAll(); return origShowTab.apply(this, arguments); };
      w.__finUnmount = true;
      window.showTab = w;
    }
    bodyEl = h('div', { id: 'financeBody' });
    empTab.parentNode.appendChild(h('div', { id: 'financeTab', class: 'tab-content' },
      h('h2', { class: 'page-title', text: '💼 Finance' }), tabsEl, bodyEl));
    return true;
  }

  function boot() {
    if (init()) return;
    let tries = 0;
    const t = setInterval(() => { if (init() || ++tries >= 40) clearInterval(t); }, 500);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
  window.financeTools = {
    summarize, cashPlan, denominate, budgetStatus, notesText, monthsBack, shiftMonth, normalizeRow, loadMonth, payoutSheetHtml, reportHtml, monthLabel,
    panes: SUBS.reduce((o, x) => { o[x[0]] = x[2]; return o; }, {}), _mounted: mounted, _unmountAll: unmountAll
  };
})();
