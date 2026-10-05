/* finance.js — ទំព័រ «💼 Finance» (ហិរញ្ញវត្ថុ) សម្រាប់ប្រព័ន្ធគ្រប់គ្រងបុគ្គលិក
 *
 * ទំព័រថ្មីក្នុងម៉ឺនុយខាងឆ្វេង (ក្រោមក្រុម Payrolls) មាន ៤ ផ្ទាំង៖
 *   📊 សង្ខេប       — ថ្លៃប្រាក់ខែប្រចាំខែ សរុប/តាមផ្នែក/Top 10 ប្រៀបធៀបខែមុន + CSV + ព្រីនរបាយការណ៍
 *   💵 បើកសាច់ប្រាក់ — បញ្ជីបើកប្រាក់ខែ (ដុល្លារ/រៀល/ដុល្លារ+រៀល) គណនាចំនួនក្រដាសប្រាក់ត្រូវរៀបចំ + បញ្ជីហត្ថលេខា
 *   📈 និន្នាការ     — ថ្លៃប្រាក់ខែ ៦ ឬ ១២ ខែចុងក្រោយ
 *   🎯 ថវិកា        — កំណត់ថវិកាប្រចាំខែ (សរុប + តាមផ្នែក) ប្រៀបធៀបជាមួយចំណាយពិត
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

  // ------------------------------------------------------------ ទំព័រ ----
  const SUBS = [
    ['overview', '📊 សង្ខេប', paneOverview],
    ['cash', '💵 បើកសាច់ប្រាក់', paneCash],
    ['trend', '📈 និន្នាការ', paneTrend],
    ['budget', '🎯 ថវិកា', paneBudget]
  ];

  function renderBody() {
    if (!bodyEl) return;
    bodyEl.textContent = '';
    Array.from(tabsEl.children).forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
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

    tabsEl = h('div', { class: 'fin-tabs' }, SUBS.map(x => {
      const b = h('button', { class: 'secondary', type: 'button', 'data-sub': x[0], text: x[1] });
      b.addEventListener('click', () => { sub = x[0]; renderBody(); });
      return b;
    }));
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
    panes: SUBS.reduce((o, x) => { o[x[0]] = x[2]; return o; }, {})
  };
})();
