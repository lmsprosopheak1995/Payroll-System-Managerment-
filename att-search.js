/* att-search.js — ស្វែងរកបុគ្គលិកដែលធ្វើការថ្ងៃអាទិត្យ · ថែមម៉ោងលើសកំណត់ · ចេញយឺតជាងម៉ោងកំណត់ (ពីតារាងវត្តមាន)
 * ប៊ូតុង «🔎 ស្វែង អាទិត្យ / OT» នៅក្នុង «តារាងវត្តមាន»
 * ច្បាប់៖ ថ្ងៃអាទិត្យ មិនមាន OT (OT = 0) · «ធ្វើការអាទិត្យ» និង «OT» ជា «ឬ» · «ម៉ោងចេញ» ជា «និង» ជាមួយលក្ខខណ្ឌផ្សេង
 * ដំឡើង៖ ក្នុង index.html ក្រោម script.js  →  <script src="att-search.js"></script>   (មិនកែ script.js / SQL) */
(function () {
  'use strict';
  const h = (tag, p, ...kids) => {
    const el = document.createElement(tag);
    for (const k in (p || {})) {
      const v = p[k];
      if (v == null) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return el;
  };
  const isSunday = d => new Date(d + 'T00:00:00Z').getUTCDay() === 0;
  const hhmm = t => (t || '').slice(0, 5);
  const toMin = t => { const p = hhmm(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
  const fmtH = v => (typeof fmtHours === 'function' ? fmtHours(v) : Number(v).toFixed(2));
  const monthRange = () => {
    const el = document.getElementById('attendanceMonth');
    const ym = (el && el.value) || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    return [ym + '-01', ym + '-' + String(last).padStart(2, '0')];
  };

  function open() {
    const [from0, to0] = monthRange();
    let rows = [];
    const dFrom = h('input', { type: 'date', value: from0 }), dTo = h('input', { type: 'date', value: to0 });
    const cSun = h('input', { type: 'checkbox', checked: '' }), cOt = h('input', { type: 'checkbox' }), cOut = h('input', { type: 'checkbox' }), cMiss = h('input', { type: 'checkbox' });
    const xOt = h('input', { type: 'number', min: '0', step: '0.5', value: '2', style: 'width:70px;' });
    const tOut = h('input', { type: 'time', value: '19:00' }), tOut2 = h('input', { type: 'time', value: '' });   // ម៉ោងចេញ ចាប់ពី · ដល់ (ទទេ = មិនកំណត់ដែនកំណត់លើ)
    const opSel = h('select', null, [['gt', 'លើសពី (>)'], ['ge', 'ចាប់ពី (≥)'], ['eq', 'ប្រហែលស្មើ (±១០ នាទី)']].map(o => h('option', { value: o[0], text: o[1] })));
    const brk = h('input', { type: 'number', min: '0', step: '0.25', value: '1', style: 'width:70px;' });   // ម៉ោងសម្រាក (ដកចេញពីម៉ោងធ្វើការ)
    const q = h('input', { type: 'search', name: 'att-find-q', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: '', placeholder: 'ស្វែងរកតាមអត្តលេខ ឬ ឈ្មោះ... (ទទេ = បុគ្គលិកទាំងអស់)', style: 'min-width:240px;' });
    const info = h('div', { class: 'scan-hint', style: 'margin:10px 0 4px;' });
    const note = h('div', { class: 'scan-hint', style: 'margin:0 0 8px;color:#b45309;' });
    const stat = (color) => h('span', { style: 'padding:4px 10px;border-radius:999px;font-weight:700;background:rgba(0,0,0,.05);color:' + color + ';' });
    const sSun = stat('#0e7490'), sWh = stat('#0e7490'), sOt = stat('#b45309'), sPeople = stat('#475569');
    const summary = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px;' }, sSun, sWh, sOt, sPeople);
    const tbody = h('tbody'), tfoot = h('tfoot');
    const empBody = h('tbody');
    const empTitle = h('div', { class: 'scan-hint', style: 'margin:0 0 4px;display:none;', text: '👥 សរុបតាមបុគ្គលិក (ចុចជួរដើម្បីចម្រាញ់តែអ្នកនោះ)' });
    const empWrap = h('div', { class: 'table-wrap', style: 'max-height:22vh;overflow:auto;margin-bottom:10px;display:none;' }, h('table', null,
      h('thead', null, h('tr', null, ['អត្តលេខ', 'ឈ្មោះ', 'ថ្ងៃអាទិត្យ', 'ម៉ោងធ្វើការ', 'OT (ម៉ោង)'].map(x => h('th', { text: x })))), empBody));
    const chip = (label, from, to) => h('button', { type: 'button', class: 'secondary', text: label, onclick: () => { tOut.value = from; tOut2.value = to || ''; cOut.checked = true; run(); } });

    const ict = () => new Date(Date.now() + 7 * 3600e3);
    const rangeChip = (label, k) => h('button', { type: 'button', class: 'secondary', text: label, onclick: () => {
      const n = ict(), y = n.getUTCFullYear(), m = n.getUTCMonth();
      if (k === 7) { dTo.value = n.toISOString().slice(0, 10); dFrom.value = new Date(n.getTime() - 6 * 86400e3).toISOString().slice(0, 10); }
      else { dFrom.value = new Date(Date.UTC(y, m + k, 1)).toISOString().slice(0, 10); dTo.value = new Date(Date.UTC(y, m + k + 1, 0)).toISOString().slice(0, 10); }
      run();
    } });

    // តម្រៀបជួរតាមក្បាលជួរ (ចុចម្តងទៀត = ប្តូរទិស)
    let paint = () => {};
    const cols = [['date', 'កាលបរិច្ឆេទ'], ['code', 'អត្តលេខ'], ['name', 'ឈ្មោះ'], ['ci', 'ចូល'], ['co', 'ចេញ'], ['br', 'សម្រាក'], ['wh', 'ម៉ោងធ្វើការ'], ['ot', 'OT (ម៉ោង)']];
    const sort = { key: 'date', dir: 1 };
    const ths = cols.map(c => h('th', { style: 'cursor:pointer;user-select:none;white-space:nowrap;', title: 'ចុចដើម្បីតម្រៀប', onclick: () => { sort.dir = sort.key === c[0] ? -sort.dir : 1; sort.key = c[0]; markTh(); paint(); } }));
    const markTh = () => ths.forEach((th, i) => { th.textContent = cols[i][1] + (sort.key === cols[i][0] ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''); });
    markTh();
    const sortRows = () => {
      const val = r => ({ date: r.date, code: r.code, name: r.name, ci: r.ci, co: r.co, br: r.br.m, wh: r.wh, ot: r.ot })[sort.key];
      rows.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y)); return c * sort.dir || a.date.localeCompare(b.date); });
    };

    function clearOut() {
      tbody.textContent = ''; tfoot.textContent = ''; empBody.textContent = ''; empWrap.style.display = 'none'; empTitle.style.display = 'none';
      sSun.textContent = ''; sWh.textContent = ''; sOt.textContent = ''; sPeople.textContent = '';
    }

    function run() {
      rows = [];
      note.textContent = '';
      if (!cSun.checked && !cOt.checked && !cOut.checked && !cMiss.checked) { info.textContent = 'សូមជ្រើសលក្ខខណ្ឌយ៉ាងតិចមួយ។'; clearOut(); return; }
      if (cSun.checked && cOt.checked) note.textContent = 'ℹ️ ថ្ងៃអាទិត្យគ្មាន OT — ពេលជ្រើសទាំងពីរ បង្ហាញ «ថ្ងៃអាទិត្យ ឬ ថ្ងៃដែលមាន OT»។';
      const brkH = brk.value.trim() === '' ? 1 : Math.max(0, Number(brk.value) || 0);   // ទទេ = ១ ម៉ោង
      const brkMin = rec => {   // សម្រាកពិត = ចូលវិញ − ចេញបាយ · បើខ្វះស្កេន ប្រើម៉ោងសម្រាកដើម
        const bo = rec.breakOut || rec.break_out, bi = rec.breakIn || rec.break_in;
        if (bo && bi) { const d = toMin(bi) - toMin(bo); if (d >= 0) return { m: d, real: true }; }
        return { m: brkH * 60, real: false };
      };
      const workH = rec => { if (!rec.checkin || !rec.checkout) return 0; let m = toMin(rec.checkout) - toMin(rec.checkin); if (m < 0) m += 1440; return Math.max(0, (m - brkMin(rec).m) / 60); };
      const f = dFrom.value, t = dTo.value, needle = q.value.trim().toLowerCase(), minOt = Number(xOt.value || 0), op = opSel.value;
      try {
        Object.keys(attendance).filter(d => d >= f && d <= t).sort().forEach(date => {
          employees.forEach(emp => {
            const rec = attendance[date][emp.id];
            if (!rec) return;
            if (needle && !(typeof employeeMatchesSearch === 'function' ? employeeMatchesSearch(emp, needle) : (String(emp.username || '').toLowerCase().includes(needle) || String(emp.name).toLowerCase().includes(needle)))) return;
            const r = computeRow(emp, rec, date), worked = rec.status === 'present';
            const sun = isSunday(date);
            const otVal = sun ? 0 : (r.otHours || 0);          // ថ្ងៃអាទិត្យ មិនមាន OT
            const mSun = cSun.checked && sun && worked;
            const mOt = cOt.checked && !sun && (op === 'gt' ? otVal > minOt + 1e-9 : op === 'ge' ? otVal >= minOt - 1e-9 : Math.abs(otVal - minOt) <= 10 / 60 + 1e-9);
            if ((cSun.checked || cOt.checked) && !(mSun || mOt)) return;   // «ឬ» រវាងអាទិត្យ និង OT
            if (cOut.checked && !(rec.checkout && hhmm(rec.checkout) >= tOut.value && (!tOut2.value || hhmm(rec.checkout) <= tOut2.value))) return;   // «និង»
            if (cMiss.checked && !(worked && (!rec.checkin || !(rec.breakOut || rec.break_out) || !(rec.breakIn || rec.break_in) || !rec.checkout))) return;   // «និង» ខ្វះស្កេន
            rows.push({ date, sun, id: emp.id, code: emp.username || '-', name: emp.name, ci: hhmm(rec.checkin), co: hhmm(rec.checkout), wh: workH(rec), br: brkMin(rec), ot: otVal });
          });
        });
      } catch (e) { info.textContent = 'មានបញ្ហា៖ ' + e.message; return; }

      const people = new Set(rows.map(r => r.id)).size;
      const sunDays = rows.filter(r => r.sun).length;
      const otTotal = rows.reduce((s, r) => s + r.ot, 0);
      const whAll = rows.reduce((s, r) => s + r.wh, 0), whSun = rows.filter(r => r.sun).reduce((s, r) => s + r.wh, 0);
      info.textContent = rows.length ? 'រកឃើញ ' + rows.length + ' ជួរ' : 'មិនមានលទ្ធផលត្រូវនឹងលក្ខខណ្ឌទេ។';
      clearOut();
      if (!rows.length) return;

      sSun.textContent = '📅 ធ្វើការអាទិត្យ៖ ' + sunDays + ' ថ្ងៃ';
      sWh.textContent = '🕒 ម៉ោងធ្វើការអាទិត្យ៖ ' + fmtH(whSun) + ' ម៉ោង (ដកសម្រាក)';
      sOt.textContent = '⏱ ថែមម៉ោងសរុប៖ ' + fmtH(otTotal) + ' ម៉ោង';
      sPeople.textContent = '👥 ' + people + ' នាក់';

      paint = () => { tbody.textContent = ''; sortRows(); rows.forEach(r => tbody.appendChild(h('tr', null,
        h('td', { text: r.date + (r.sun ? ' (អាទិត្យ)' : '') }), h('td', { text: r.code }), h('td', { text: r.name }),
        h('td', { text: r.ci || '—' }), h('td', { text: r.co || '—' }),
        h('td', { text: (r.br.m ? Math.round(r.br.m) + ' នាទី' : '—') + (r.br.real ? '' : ' *'), title: r.br.real ? 'ពីការស្កេន ចេញបាយ → ចូលវិញ' : 'គ្មានស្កេនគ្រប់ — ប្រើម៉ោងសម្រាកដើម' }),
        h('td', { text: r.wh ? fmtH(r.wh) : '—' }),
        h('td', null, r.sun
          ? h('span', { text: 'អាទិត្យ', style: 'font-size:12px;padding:2px 8px;border-radius:999px;background:rgba(14,116,144,.12);color:#0e7490;font-weight:700;' })
          : h('span', { text: r.ot ? fmtH(r.ot) : '—' }))))); };
      paint();

      if (people > 1) {
        const by = {};
        rows.forEach(r => { const e = by[r.id] || (by[r.id] = { code: r.code, name: r.name, sun: 0, wh: 0, ot: 0 }); if (r.sun) e.sun++; e.wh += r.wh; e.ot += r.ot; });
        Object.keys(by).map(k => by[k]).sort((a, b) => String(a.code).localeCompare(String(b.code))).forEach(e => empBody.appendChild(h('tr', { style: 'cursor:pointer;', title: 'ចុចដើម្បីចម្រាញ់', onclick: () => { q.value = e.code; run(); } },
          h('td', { text: e.code }), h('td', { text: e.name }), h('td', { text: String(e.sun) }), h('td', { text: fmtH(e.wh) }), h('td', { text: fmtH(e.ot) }))));
        empWrap.style.display = ''; empTitle.style.display = '';
      }
      tfoot.appendChild(h('tr', { style: 'font-weight:700;background:rgba(14,116,144,.08);' },
        h('td', { colspan: '6', text: 'សរុប · ' + rows.length + ' ជួរ · ' + sunDays + ' ថ្ងៃអាទិត្យ · ' + people + ' នាក់' }),
        h('td', { text: fmtH(whAll) }), h('td', { text: fmtH(otTotal) })));
    }

    function csv() {
      if (!rows.length) return;
      const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
      const total = rows.reduce((s, r) => s + r.ot, 0);
      const sunDays = rows.filter(r => r.sun).length;
      const lines = [['កាលបរិច្ឆេទ', 'អត្តលេខ', 'ឈ្មោះ', 'ចូល', 'ចេញ', 'សម្រាក (នាទី)', 'ម៉ោងធ្វើការ (ដកសម្រាក)', 'OT (ម៉ោង)']]
        .concat(rows.map(r => [r.date + (r.sun ? ' (អាទិត្យ)' : ''), r.code, r.name, r.ci, r.co, Math.round(r.br.m) + (r.br.real ? '' : '*'), r.wh.toFixed(2), r.ot.toFixed(2)]))
        .concat([['សរុប · ' + sunDays + ' ថ្ងៃអាទិត្យ', '', '', '', '', '', rows.reduce((s, r) => s + r.wh, 0).toFixed(2), total.toFixed(2)]]);
      const body = lines.map(r => r.map(esc).join(',')).join('\n');
      const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' })), download: 'attendance_search_' + dFrom.value + '_' + dTo.value + '.csv' });
      document.body.appendChild(a); a.click(); a.remove();
    }

    const reset = () => { const [a, b] = monthRange(); dFrom.value = a; dTo.value = b; q.value = ''; cSun.checked = true; cOt.checked = false; cOut.checked = false; cMiss.checked = false; xOt.value = '2'; opSel.value = 'gt'; tOut.value = '19:00'; tOut2.value = ''; brk.value = '1'; run(); };
    const row = (...k) => h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;' }, ...k);
    const ov = h('div', { class: 'modal-overlay open' }, h('div', { class: 'modal', style: 'max-width:820px;width:96%;' },
      h('h2', { text: '🔎 ស្វែងរកអ្នកធ្វើការ ថ្ងៃអាទិត្យ / ថែមម៉ោង' }),
      row(h('span', { text: 'ពីថ្ងៃ' }), dFrom, h('span', { text: 'ដល់' }), dTo, q),
      row(h('span', { class: 'scan-hint', text: 'ជ្រើសរយៈពេល៖' }), rangeChip('ខែនេះ', 0), rangeChip('ខែមុន', -1), rangeChip('៧ ថ្ងៃចុងក្រោយ', 7)),
      row(h('label', null, cSun, ' ធ្វើការថ្ងៃអាទិត្យ')),
      row(h('label', null, cOt, ' ថែមម៉ោង (OT) '), opSel, xOt, h('span', { text: 'ម៉ោង' })),
      row(h('label', null, cOut, ' ម៉ោងចេញ ចាប់ពី '), tOut, h('span', { text: 'ដល់' }), tOut2),
      row(h('label', null, cMiss, ' ខ្វះស្កេន (ចូល / ចេញបាយ / ចូលវិញ / ចេញ)')),
      row(h('span', { text: 'ម៉ោងសម្រាកដើម (ប្រើពេលគ្មានស្កេនចេញបាយ/ចូលវិញ)' }), brk, h('span', { text: 'ម៉ោង/ថ្ងៃ' })),
      row(h('span', { class: 'scan-hint', text: 'ជ្រើសរហ័ស៖' }), chip('ម៉ោង ៦ ល្ងាច', '18:00', '18:59'), chip('ម៉ោង ៧ យប់', '19:00', '19:59'), chip('ម៉ោង ៨ យប់', '20:00', '20:59'), chip('ក្រោយ ៧ យប់', '19:00', '')),
      row(h('button', { type: 'button', text: '🔎 ស្វែងរក', onclick: run }), h('button', { type: 'button', class: 'secondary', text: '⬇ នាំចេញ CSV', onclick: csv }),
        h('button', { type: 'button', class: 'secondary', text: '↺ កំណត់ឡើងវិញ', onclick: reset }),
        h('button', { type: 'button', class: 'secondary', text: 'បិទ', onclick: () => ov.remove() })),
      info, note, summary,
      h('div', { class: 'scan-hint', style: 'margin:0 0 6px;', text: '* = គ្មានស្កេនចេញបាយ/ចូលវិញគ្រប់ ប្រើម៉ោងសម្រាកដើមជំនួស' }),
      empTitle, empWrap,
      h('div', { class: 'table-wrap', style: 'max-height:40vh;overflow:auto;' }, h('table', null,
        h('thead', null, h('tr', null, ths)), tbody, tfoot))));
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    // LIVE SEARCH — ស្វែងរកភ្លាមៗពេលវាយ ឬប្តូរលក្ខខណ្ឌ (មិនបាច់ចុចប៊ូតុង)
    brk.addEventListener('blur', () => { if (brk.value.trim() === '') { brk.value = '1'; run(); } });
    let liveT;
    const live = () => { clearTimeout(liveT); liveT = setTimeout(run, 200); };
    [q, xOt, brk].forEach(el => el.addEventListener('input', live));
    [dFrom, dTo, cSun, cOt, cOut, cMiss, opSel, tOut, tOut2].forEach(el => el.addEventListener('change', run));
    // Enter → ស្វែងរកភ្លាម (បញ្ឈប់ event កុំឲ្យ script ផ្សេងរបស់ទំព័រចាប់យក)
    q.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      clearTimeout(liveT); run();
    }, true);
    q.addEventListener('search', () => { clearTimeout(liveT); run(); });   // ប៊ូតុង × ក្នុងប្រអប់ស្វែងរក
    document.body.appendChild(ov);
    setTimeout(() => { q.value = ''; run(); }, 150);   // លុប autofill របស់ browser ហើយស្វែងរកម្តងទៀត
    run();
  }

  function init() {
    const after = document.getElementById('attendancePrintBtn');
    if (!after || document.getElementById('attendanceFindBtn')) return;
    after.after(h('button', { class: 'secondary', id: 'attendanceFindBtn', type: 'button', text: '🔎 ស្វែង អាទិត្យ / OT', onclick: open }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
