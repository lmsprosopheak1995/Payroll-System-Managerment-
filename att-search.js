/* att-search.js — ស្វែងរកបុគ្គលិកដែលធ្វើការថ្ងៃអាទិត្យ · ថែមម៉ោងលើសកំណត់ · ចេញយឺតជាងម៉ោងកំណត់ (ពីតារាងវត្តមាន)
 * ប៊ូតុង «🔎 ស្វែង អាទិត្យ / OT» នៅក្នុង «តារាងវត្តមាន» · លក្ខខណ្ឌដែលបានជ្រើសច្រើន = «និង» (ត្រូវគ្រប់ទាំងអស់)
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
    const cSun = h('input', { type: 'checkbox', checked: '' }), cOt = h('input', { type: 'checkbox' }), cOut = h('input', { type: 'checkbox' });
    const xOt = h('input', { type: 'number', min: '0', step: '0.5', value: '2', style: 'width:70px;' });
    const tOut = h('input', { type: 'time', value: '19:00' });
    const q = h('input', { type: 'text', placeholder: 'ស្វែងរកតាមអត្តលេខ ឬ ឈ្មោះ...', style: 'min-width:200px;' });
    const info = h('div', { class: 'scan-hint', style: 'margin:10px 0;' });
    const tbody = h('tbody');
    const chip = (label, v) => h('button', { type: 'button', class: 'secondary', text: label, onclick: () => { tOut.value = v; cOut.checked = true; run(); } });

    function run() {
      rows = [];
      if (!cSun.checked && !cOt.checked && !cOut.checked) { info.textContent = 'សូមជ្រើសលក្ខខណ្ឌយ៉ាងតិចមួយ។'; tbody.textContent = ''; return; }
      const f = dFrom.value, t = dTo.value, needle = q.value.trim().toLowerCase(), minOt = Number(xOt.value || 0);
      try {
        Object.keys(attendance).filter(d => d >= f && d <= t).sort().forEach(date => {
          employees.forEach(emp => {
            const rec = attendance[date][emp.id];
            if (!rec) return;
            if (needle && !(String(emp.id).toLowerCase().includes(needle) || String(emp.name).toLowerCase().includes(needle))) return;
            const r = computeRow(emp, rec, date), worked = rec.status === 'present';
            if (cSun.checked && !(isSunday(date) && worked)) return;
            if (cOt.checked && !(r.otHours > minOt + 1e-9)) return;
            if (cOut.checked && !(rec.checkout && hhmm(rec.checkout) >= tOut.value)) return;
            rows.push({ date, id: emp.id, name: emp.name, ci: hhmm(rec.checkin), co: hhmm(rec.checkout), ot: r.otHours });
          });
        });
      } catch (e) { info.textContent = 'មានបញ្ហា៖ ' + e.message; return; }
      const people = new Set(rows.map(r => r.id)).size, ot = rows.reduce((s, r) => s + r.ot, 0);
      info.textContent = rows.length ? 'រកឃើញ ' + rows.length + ' ជួរ · ' + people + ' នាក់ · OT សរុប ' + (typeof fmtHours === 'function' ? fmtHours(ot) : ot.toFixed(2)) + ' ម៉ោង' : 'មិនមានលទ្ធផលត្រូវនឹងលក្ខខណ្ឌទេ។';
      tbody.textContent = '';
      rows.forEach(r => tbody.appendChild(h('tr', null, h('td', { text: r.date + (isSunday(r.date) ? ' (អាទិត្យ)' : '') }), h('td', { text: r.id }), h('td', { text: r.name }),
        h('td', { text: r.ci || '—' }), h('td', { text: r.co || '—' }), h('td', { text: r.ot ? (typeof fmtHours === 'function' ? fmtHours(r.ot) : r.ot.toFixed(2)) : '—' }))));
    }

    function csv() {
      if (!rows.length) return;
      const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
      const body = [['កាលបរិច្ឆេទ', 'អត្តលេខ', 'ឈ្មោះ', 'ចូល', 'ចេញ', 'OT (ម៉ោង)']].concat(rows.map(r => [r.date, r.id, r.name, r.ci, r.co, r.ot.toFixed(2)])).map(r => r.map(esc).join(',')).join('\n');
      const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' })), download: 'attendance_search_' + dFrom.value + '_' + dTo.value + '.csv' });
      document.body.appendChild(a); a.click(); a.remove();
    }

    const row = (...k) => h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;' }, ...k);
    const ov = h('div', { class: 'modal-overlay open' }, h('div', { class: 'modal', style: 'max-width:820px;width:96%;' },
      h('h2', { text: '🔎 ស្វែងរកអ្នកធ្វើការ ថ្ងៃអាទិត្យ / ថែមម៉ោង' }),
      row(h('span', { text: 'ពីថ្ងៃ' }), dFrom, h('span', { text: 'ដល់' }), dTo, q),
      row(h('label', null, cSun, ' ធ្វើការថ្ងៃអាទិត្យ')),
      row(h('label', null, cOt, ' ថែមម៉ោង (OT) លើសពី '), xOt, h('span', { text: 'ម៉ោង' })),
      row(h('label', null, cOut, ' ម៉ោងចេញ ចាប់ពី '), tOut, chip('១៩:០០', '19:00'), chip('២០:០០', '20:00')),
      row(h('button', { type: 'button', text: '🔎 ស្វែងរក', onclick: run }), h('button', { type: 'button', class: 'secondary', text: '⬇ នាំចេញ CSV', onclick: csv }),
        h('button', { type: 'button', class: 'secondary', text: 'បិទ', onclick: () => ov.remove() })),
      info,
      h('div', { class: 'table-wrap', style: 'max-height:50vh;overflow:auto;' }, h('table', null,
        h('thead', null, h('tr', null, ['កាលបរិច្ឆេទ', 'អត្តលេខ', 'ឈ្មោះ', 'ចូល', 'ចេញ', 'OT (ម៉ោង)'].map(x => h('th', { text: x })))), tbody))));
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    document.body.appendChild(ov);
    run();
  }

  function init() {
    const after = document.getElementById('attendancePrintBtn');
    if (!after || document.getElementById('attendanceFindBtn')) return;
    after.after(h('button', { class: 'secondary', id: 'attendanceFindBtn', type: 'button', text: '🔎 ស្វែង អាទិត្យ / OT', onclick: open }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
