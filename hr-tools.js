/* hr-tools.js — ឧបករណ៍ HR បន្ថែម (មិនពាក់ព័ន្ធនឹង work-card.js)
 *
 * ១) 🔎 ស្វែងរកលឿន (Ctrl+K)៖ រកទំព័រ ឬបុគ្គលិក ហើយចុច Enter ដើម្បីបើក
 * ២) 🧰 ទំព័រថ្មី «ឧបករណ៍ HR» (ក្នុងម៉ឺនុយខាងឆ្វេង ក្រោម «បញ្ជីបុគ្គលិក»)៖
 *      🔔 ការរំលឹក   — ខួបចូលធ្វើការ (៣០ ថ្ងៃខាងមុខ) និងជិតផុតសាកល្បង
 *      🧹 ពិនិត្យទិន្នន័យ — ស្ទួន (ឈ្មោះ/ទូរស័ព្ទ/username/email) និងវាលខ្វះ ឬខុសទម្រង់
 *      📈 ស្ថិតិ     — ចំនួន ភាពចាស់ (tenure) តាមផ្នែក ការជួលបុគ្គលិក ១២ ខែចុងក្រោយ
 *      💾 បម្រុងទុក  — ទាញយកទិន្នន័យ Supabase ជាឯកសារ JSON (អានតែប៉ុណ្ណោះ មិនកែអ្វីទេ)
 *
 * ដំឡើង៖ ដាក់ឯកសារនេះក្នុងថតតែមួយជាមួយ index.html ហើយបន្ថែមបន្ទាត់នេះក្រោម script.js
 *   <script src="hr-tools.js"></script>
 * ដកចេញ៖ លុបបន្ទាត់ script នោះ។
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ ឧបករណ៍ ----
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const say = m => (typeof customAlert === 'function' ? customAlert(m) : Promise.resolve(window.alert(m)));
  const emps = () => (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees : [];
  const z2 = n => String(n).padStart(2, '0');
  const money = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

  // DOM helper (សុវត្ថិភាព៖ អត្ថបទទាំងអស់ចូលតាម textContent មិនប្រើ innerHTML)
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
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  // ------------------------------------------------------------ កាលបរិច្ឆេទ ----
  const parseYMD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const today0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dayDiff = (a, b) => Math.round((a - b) / 86400000);
  const fmt = d => `${z2(d.getDate())}/${z2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const addMonths = (d, n) => {
    const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (r.getDate() !== d.getDate()) r.setDate(0); // ថ្ងៃទី 31 + 1 ខែ → ថ្ងៃចុងខែ
    return r;
  };

  // ------------------------------------------------------------ ការគណនា (pure) ----
  function computeReminders(list, probMonths, now) {
    const t = now || today0();
    const annivs = [], probs = [];
    list.filter(e => e.status === 'active').forEach(e => {
      const sd = parseYMD(e.startDate);
      if (!sd || sd > t) return;
      let next = new Date(t.getFullYear(), sd.getMonth(), sd.getDate());
      if (next < t) next = new Date(t.getFullYear() + 1, sd.getMonth(), sd.getDate());
      const years = next.getFullYear() - sd.getFullYear();
      const days = dayDiff(next, t);
      if (years >= 1 && days <= 30) annivs.push({ e, date: next, years, days });
      if (probMonths > 0) {
        const end = addMonths(sd, probMonths);
        const d2 = dayDiff(end, t);
        if (d2 >= -7 && d2 <= 30) probs.push({ e, start: sd, date: end, days: d2 });
      }
    });
    const byName = (a, b) => String(a.e.name).localeCompare(String(b.e.name));
    annivs.sort((a, b) => a.days - b.days || byName(a, b));
    probs.sort((a, b) => a.days - b.days || byName(a, b));
    return { annivs, probs };
  }

  const normPhone = s => { let d = String(s || '').replace(/[^\d]/g, ''); if (d.indexOf('855') === 0) d = '0' + d.slice(3); return d; };
  const phoneOk = s => /^0\d{8,9}$/.test(normPhone(s));
  const groupDup = (list, keyFn) => {
    const m = new Map();
    list.forEach(e => { const k = keyFn(e); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
    return Array.from(m.values()).filter(g => g.length > 1);
  };

  function computeQuality(list, now) {
    const t = now || today0();
    const act = list.filter(e => e.status === 'active');
    const out = [];
    const add = (label, items, kind) => { if (items.length) out.push({ label, items, kind }); };
    // ស្ទួន (គ្រប់បុគ្គលិក)
    [
      ['ឈ្មោះស្ទួន', e => String(e.name || '').trim().toLowerCase()],
      ['លេខទូរស័ព្ទស្ទួន', e => { const p = normPhone(e.phone); return p.length >= 8 ? p : ''; }],
      ['Username ស្ទួន', e => String(e.username || '').trim().toLowerCase()],
      ['Email ស្ទួន', e => String(e.email || '').trim().toLowerCase()]
    ].forEach(([label, fn]) => add(label, groupDup(list, fn), 'dup'));
    // ខ្វះ/ខុសទម្រង់ (តែបុគ្គលិកកំពុងបម្រើការ)
    const mk = (label, pred, detail) => add(label, act.filter(pred).map(e => ({ e, detail: detail ? detail(e) : '' })), 'emp');
    mk('ខ្វះលេខទូរស័ព្ទ', e => !String(e.phone || '').trim());
    mk('លេខទូរស័ព្ទទម្រង់ខុស', e => String(e.phone || '').trim() && !phoneOk(e.phone), e => String(e.phone));
    mk('ខ្វះថ្ងៃចូលធ្វើការ', e => !parseYMD(e.startDate));
    mk('ថ្ងៃចូលធ្វើការនៅអនាគត', e => { const d = parseYMD(e.startDate); return !!d && d > t; }, e => fmt(parseYMD(e.startDate)));
    mk('ខ្វះប្រាក់ខែ ឬស្មើសូន្យ', e => { const n = Number(e.salary); return e.salary === '' || e.salary == null || !isFinite(n) || n <= 0; }, e => (e.salary === '' || e.salary == null) ? '' : String(e.salary));
    mk('ខ្វះផ្នែក', e => !String(e.dept || '').trim());
    mk('ខ្វះមុខងារ', e => !String(e.position || '').trim());
    mk('ខ្វះ Username', e => !String(e.username || '').trim());
    mk('ខ្វះរូបថត', e => !e.photo);
    return out;
  }

  function computeStats(list, now) {
    const t = now || today0();
    const act = list.filter(e => e.status === 'active');
    const sal = act.map(e => Number(e.salary)).filter(n => isFinite(n) && n > 0);
    const total = sal.reduce((a, b) => a + b, 0);
    const years = [];
    act.forEach(e => { const sd = parseYMD(e.startDate); if (sd && sd <= t) years.push((t - sd) / (365.25 * 86400000)); });
    const bandsDef = [['តិចជាង ១ ឆ្នាំ', 0, 1], ['១–៣ ឆ្នាំ', 1, 3], ['៣–៥ ឆ្នាំ', 3, 5], ['៥–១០ ឆ្នាំ', 5, 10], ['១០ ឆ្នាំឡើង', 10, Infinity]];
    const bands = bandsDef.map(([label, lo, hi]) => ({ label, n: years.filter(y => y >= lo && y < hi).length }));
    const deptMap = new Map();
    act.forEach(e => {
      const k = String(e.dept || '').trim() || '(គ្មានផ្នែក)';
      if (!deptMap.has(k)) deptMap.set(k, { dept: k, n: 0, sum: 0, sn: 0 });
      const r = deptMap.get(k); r.n++;
      const s = Number(e.salary); if (isFinite(s) && s > 0) { r.sum += s; r.sn++; }
    });
    const depts = Array.from(deptMap.values()).sort((a, b) => b.n - a.n);
    const hires = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${z2(d.getMonth() + 1)}`;
      hires.push({ label: `${z2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`, n: list.filter(e => String(e.startDate || '').indexOf(key) === 0).length });
    }
    return {
      active: act.length,
      inactive: list.length - act.length,
      avgTenure: years.length ? years.reduce((a, b) => a + b, 0) / years.length : 0,
      salaryTotal: total,
      salaryAvg: sal.length ? total / sal.length : 0,
      salaryCount: sal.length,
      bands, depts, hires
    };
  }

  // ------------------------------------------------------------ CSS ----
  const CSS = `
.hrt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}
.hrt-tabs button.on{background:var(--accent,#0d9488);color:#fff;border-color:transparent}
.hrt-card{border:1px solid var(--border,#e1e8ef);border-radius:14px;background:var(--card-bg,#fff);padding:12px 14px;margin:0 0 14px}
.hrt-card h3{margin:0 0 8px;font-size:.98rem}
.hrt-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}
.hrt-row label{font-size:.82rem;color:var(--text-muted,#5b6b80)}
.hrt-muted{font-size:.8rem;color:var(--text-muted,#5b6b80)}
.hrt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 14px}
.hrt-stat{border:1px solid var(--border,#e1e8ef);border-radius:12px;padding:10px 12px;background:var(--card-bg,#fff)}
.hrt-stat b{display:block;font-size:1.25rem}
.hrt-stat span{font-size:.75rem;color:var(--text-muted,#5b6b80)}
.hrt-badge{display:inline-block;font-size:.72rem;border-radius:999px;padding:1px 9px;background:#e6f6f4;color:#0f766e;white-space:nowrap}
.hrt-badge.warn{background:#fef3c7;color:#92400e}
.hrt-badge.late{background:#fee2e2;color:#b91c1c}
.hrt-bars{display:flex;align-items:flex-end;gap:6px;height:130px;margin:8px 0}
.hrt-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;font-size:.68rem;color:var(--text-muted,#5b6b80)}
.hrt-bar i{display:block;width:100%;background:linear-gradient(135deg,#0d9488,#0284c7);border-radius:6px 6px 0 0;min-height:2px}
details.hrt-d{border:1px solid var(--border,#e1e8ef);border-radius:10px;margin:8px 0;padding:6px 12px;background:var(--card-bg,#fff)}
details.hrt-d summary{cursor:pointer;font-weight:600;padding:4px 0}
.hrt-pal{position:fixed;inset:0;z-index:9980;background:rgba(8,16,28,.5);display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px}
.hrt-pal.open{display:flex}
.hrt-palbox{width:100%;max-width:560px;border-radius:14px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);border:1px solid var(--border,#e1e8ef);box-shadow:0 24px 64px rgba(15,27,45,.35);overflow:hidden}
.hrt-palbox input{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid var(--border,#e1e8ef);padding:14px 16px;font-size:1rem;background:transparent;color:inherit;outline:none;border-radius:0}
.hrt-pallist{max-height:50vh;overflow:auto}
.hrt-item{display:flex;gap:10px;align-items:center;padding:9px 16px;cursor:pointer;font-size:.9rem}
.hrt-item.sel{background:rgba(13,148,136,.13)}
.hrt-item small{margin-left:auto;color:var(--text-muted,#5b6b80);text-align:right}
.hrt-hint{padding:8px 16px;font-size:.72rem;color:var(--text-muted,#5b6b80);border-top:1px solid var(--border,#e1e8ef)}
`;

  let cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    const st = document.createElement('style'); st.id = 'hrtStyle'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------ UI ជំនួយ ----
  const openEmp = e => {
    if (typeof showTab === 'function') showTab('employees');
    if (typeof openEditModal === 'function') openEditModal(e.id);
  };
  const editBtn = e => h('button', { class: 'secondary', type: 'button', text: '✏️ កែ', onclick: () => openEmp(e) });
  const badge = (text, cls) => h('span', { class: 'hrt-badge' + (cls ? ' ' + cls : ''), text });
  function mkTable(heads, rows) {
    return h('div', { class: 'table-wrap', style: 'box-shadow:none' },
      h('table', { style: 'min-width:0' },
        h('thead', null, h('tr', null, heads.map(x => h('th', { text: x })))),
        h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c)))))));
  }
  const empty = text => h('p', { class: 'hrt-muted', text });

  // ------------------------------------------------------------ ផ្ទាំងទី ១៖ ការរំលឹក ----
  function paneReminders(body) {
    const pm = Math.max(0, Math.min(24, parseInt(lsGet('hrt_prob', '3'), 10) || 0));
    const data = computeReminders(emps(), pm);

    const inp = h('input', { type: 'number', min: '0', max: '24', value: String(pm), style: 'width:70px' });
    inp.addEventListener('change', () => { lsSet('hrt_prob', String(Math.max(0, Math.min(24, parseInt(inp.value, 10) || 0)))); renderBody(); });
    body.appendChild(h('div', { class: 'hrt-row' },
      h('label', null, 'រយៈពេលសាកល្បង (ខែ) ', inp),
      h('span', { class: 'hrt-muted', text: '០ = មិនតាមដានការសាកល្បង' }),
      h('button', { class: 'secondary', type: 'button', text: '📋 ចម្លងជាអត្ថបទ', onclick: () => copyReminders(data, pm) })));

    const c1 = h('div', { class: 'hrt-card' }, h('h3', { text: `🎂 ខួបចូលធ្វើការ — ៣០ ថ្ងៃខាងមុខ (${data.annivs.length})` }));
    c1.appendChild(data.annivs.length
      ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃខួប', 'ឆ្នាំ', 'ស្ថានភាព', ''], data.annivs.map(a => [
          a.e.name, a.e.dept || '-', fmt(a.date), `${a.years} ឆ្នាំ`,
          a.days === 0 ? badge('ថ្ងៃនេះ 🎉') : badge(`ក្នុង ${a.days} ថ្ងៃ`, a.days <= 7 ? '' : 'warn'),
          editBtn(a.e)]))
      : empty('គ្មានខួបចូលធ្វើការក្នុង ៣០ ថ្ងៃខាងមុខ'));
    body.appendChild(c1);

    if (pm > 0) {
      const c2 = h('div', { class: 'hrt-card' }, h('h3', { text: `⏳ ជិត/ទើបផុតសាកល្បង ${pm} ខែ (${data.probs.length})` }));
      c2.appendChild(data.probs.length
        ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃចូល', 'ផុតសាកល្បង', 'ស្ថានភាព', ''], data.probs.map(p => [
            p.e.name, p.e.dept || '-', fmt(p.start), fmt(p.date),
            p.days < 0 ? badge(`ផុតហើយ ${-p.days} ថ្ងៃ`, 'late') : p.days === 0 ? badge('ថ្ងៃនេះ', 'warn') : badge(`ក្នុង ${p.days} ថ្ងៃ`, p.days <= 7 ? 'warn' : ''),
            editBtn(p.e)]))
        : empty('គ្មានអ្នកជិតផុតសាកល្បង (−៧ ថ្ងៃ ដល់ +៣០ ថ្ងៃ)'));
      body.appendChild(c2);
    }
    body.appendChild(h('p', { class: 'hrt-muted', text: 'គណនាពី «ថ្ងៃចូលធ្វើការ» របស់បុគ្គលិកកំពុងបម្រើការ។ បើបុគ្គលិកណាខ្វះថ្ងៃនោះ នឹងមិនបង្ហាញទេ — មើលផ្ទាំង «ពិនិត្យទិន្នន័យ»។' }));
  }

  async function copyReminders(data, pm) {
    const L = [];
    L.push('🎂 ខួបចូលធ្វើការ');
    if (!data.annivs.length) L.push('- គ្មាន');
    data.annivs.forEach(a => L.push(`- ${a.e.name}${a.e.dept ? ' (' + a.e.dept + ')' : ''} — ${fmt(a.date)} · ${a.years} ឆ្នាំ · ${a.days === 0 ? 'ថ្ងៃនេះ' : 'ក្នុង ' + a.days + ' ថ្ងៃ'}`));
    if (pm > 0) {
      L.push('', `⏳ ផុតសាកល្បង ${pm} ខែ`);
      if (!data.probs.length) L.push('- គ្មាន');
      data.probs.forEach(p => L.push(`- ${p.e.name}${p.e.dept ? ' (' + p.e.dept + ')' : ''} — ${fmt(p.date)} · ${p.days < 0 ? 'ផុតហើយ ' + (-p.days) + ' ថ្ងៃ' : p.days === 0 ? 'ថ្ងៃនេះ' : 'ក្នុង ' + p.days + ' ថ្ងៃ'}`));
    }
    try { await navigator.clipboard.writeText(L.join('\n')); await say('✓ បានចម្លងរួច'); }
    catch (_) { await say('ចម្លងមិនបាន — សូមអនុញ្ញាត clipboard ឬចម្លងដោយដៃ៖\n\n' + L.join('\n')); }
  }

  // ------------------------------------------------------------ ផ្ទាំងទី ២៖ ពិនិត្យទិន្នន័យ ----
  function paneQuality(body) {
    const list = emps();
    const issues = computeQuality(list);
    const total = issues.reduce((a, g) => a + g.items.length, 0);
    body.appendChild(h('div', { class: 'hrt-row' },
      h('b', { text: total ? `រកឃើញ ${total} ចំណុចត្រូវពិនិត្យ` : '✓ ទិន្នន័យស្អាត មិនមានបញ្ហា' }),
      h('button', { class: 'secondary', type: 'button', text: '🔄 ពិនិត្យម្តងទៀត', onclick: () => renderBody() })));
    issues.forEach(g => {
      const d = h('details', { class: 'hrt-d' }, h('summary', { text: `${g.label} (${g.items.length})` }));
      if (g.kind === 'dup') {
        g.items.forEach(grp => {
          d.appendChild(mkTable(['ឈ្មោះ', 'ផ្នែក', 'Username', 'ទូរស័ព្ទ', 'ស្ថានភាព', ''],
            grp.map(e => [e.name, e.dept || '-', e.username || '-', e.phone || '-', e.status === 'active' ? 'សកម្ម' : 'ឈប់បម្រើការ', editBtn(e)])));
          d.appendChild(h('div', { style: 'height:6px' }));
        });
      } else {
        d.appendChild(mkTable(['ឈ្មោះ', 'ផ្នែក', 'ព័ត៌មាន', ''], g.items.map(it => [it.e.name, it.e.dept || '-', it.detail || '-', editBtn(it.e)])));
      }
      body.appendChild(d);
    });
    body.appendChild(h('p', { class: 'hrt-muted', text: 'ស្ទួនពិនិត្យលើបុគ្គលិកទាំងអស់ ចំណែកវាលខ្វះពិនិត្យតែបុគ្គលិកកំពុងបម្រើការ។ លេខទូរស័ព្ទត្រឹមត្រូវគឺ 0xxxxxxxx (៩-១០ ខ្ទង់) ឬ +855…' }));
  }

  // ------------------------------------------------------------ ផ្ទាំងទី ៣៖ ស្ថិតិ ----
  function paneStats(body) {
    const s = computeStats(emps());
    const stat = (v, l) => h('div', { class: 'hrt-stat' }, h('b', { text: v }), h('span', { text: l }));
    body.appendChild(h('div', { class: 'hrt-grid' },
      stat(String(s.active), 'បុគ្គលិកកំពុងបម្រើការ'),
      stat(String(s.inactive), 'ឈប់បម្រើការ'),
      stat(s.avgTenure ? s.avgTenure.toFixed(1) + ' ឆ្នាំ' : '-', 'ភាពចាស់មធ្យម'),
      stat(s.salaryCount ? '$' + money(s.salaryTotal) : '-', `ប្រាក់ខែគោលសរុប (${s.salaryCount} នាក់)`),
      stat(s.salaryCount ? '$' + money(s.salaryAvg) : '-', 'ប្រាក់ខែគោលមធ្យម')));

    const maxH = Math.max(1, ...s.hires.map(x => x.n));
    const c1 = h('div', { class: 'hrt-card' }, h('h3', { text: 'ការជួលបុគ្គលិក ១២ ខែចុងក្រោយ (តាមថ្ងៃចូលធ្វើការ)' }));
    c1.appendChild(h('div', { class: 'hrt-bars' }, s.hires.map(x =>
      h('div', { class: 'hrt-bar' }, h('span', { text: String(x.n) }), h('i', { style: `height:${Math.round(x.n / maxH * 80)}px` }), h('span', { text: x.label })))));
    body.appendChild(c1);

    const c2 = h('div', { class: 'hrt-card' }, h('h3', { text: 'ភាពចាស់ក្នុងការងារ (បុគ្គលិកកំពុងបម្រើការ)' }));
    c2.appendChild(mkTable(['រយៈពេល', 'ចំនួន'], s.bands.map(b => [b.label, String(b.n)])));
    body.appendChild(c2);

    const c3 = h('div', { class: 'hrt-card' }, h('h3', { text: 'តាមផ្នែក' }));
    c3.appendChild(s.depts.length
      ? mkTable(['ផ្នែក', 'បុគ្គលិក', 'ប្រាក់ខែគោលមធ្យម ($)', 'សរុប ($)'], s.depts.map(d => [d.dept, String(d.n), d.sn ? money(d.sum / d.sn) : '-', d.sn ? money(d.sum) : '-']))
      : empty('មិនទាន់មានទិន្នន័យ'));
    body.appendChild(c3);
  }

  // ------------------------------------------------------------ ផ្ទាំងទី ៤៖ បម្រុងទុក ----
  const BACKUP_TABLES = [
    { t: 'employees', o: [{ col: 'id' }] },
    { t: 'attendance', o: [{ col: 'date' }, { col: 'employee_id' }] },
    { t: 'leave_requests', o: [{ col: 'created_at', asc: false }, { col: 'id' }] },
    { t: 'overtime_requests', o: [{ col: 'created_at', asc: false }, { col: 'id' }] },
    { t: 'payroll_items', o: [{ col: 'created_at', asc: false }, { col: 'id' }] },
    { t: 'holidays', o: [{ col: 'date' }] },
    { t: 'app_settings', o: [{ col: 'id' }] },
    { t: 'employee_cards', o: [{ col: 'employee_id' }], optional: true, images: true }
  ];

  async function runBackup(withImages, onProgress = () => {}) {
    if (typeof supabaseClient === 'undefined' || typeof fetchAllRows !== 'function') throw new Error('មិនឃើញការតភ្ជាប់ Supabase');
    const meta = { app: 'employee-management', createdAt: new Date().toISOString(), includesImages: !!withImages, counts: {}, warnings: [], skipped: [] };
    const tables = {};
    for (let i = 0; i < BACKUP_TABLES.length; i++) {
      const def = BACKUP_TABLES[i];
      onProgress(`កំពុងទាញយក ${def.t} (${i + 1}/${BACKUP_TABLES.length})…`);
      if (def.images && !withImages) { meta.skipped.push(def.t + ' (រូបកាត — មិនបានធីក «រួមទាំងរូបថត»)'); continue; }
      let total = null;
      try {
        const c = await supabaseClient.from(def.t).select('*', { count: 'exact', head: true });
        if (c.error) throw c.error;
        total = c.count;
      } catch (ex) {
        if (def.optional) { meta.skipped.push(def.t + ' (មិនមានតារាង)'); continue; }
        meta.warnings.push(`${def.t}៖ រាប់ជួរមិនបាន — ${ex.message || ex}`);
      }
      let res;
      try { res = await fetchAllRows(def.t, def.o); }
      catch (ex) { res = { error: ex }; }
      if (res.error) {
        if (def.optional) { meta.skipped.push(def.t + ' (មិនមានតារាង)'); continue; }
        meta.warnings.push(`${def.t}៖ ទាញយកមិនបាន — ${res.error.message || res.error}`);
        continue;
      }
      let rows = res.data || [];
      if (def.t === 'employees' && !withImages) rows = rows.map(r => { const c = Object.assign({}, r); delete c.photo; delete c.id_card; return c; });
      if (total != null && rows.length !== total) meta.warnings.push(`${def.t}៖ ទាញបាន ${rows.length} ជួរ ប៉ុន្តែតារាងមាន ${total} ជួរ`);
      if (new Set(rows.map(r => JSON.stringify(r))).size !== rows.length) meta.warnings.push(`${def.t}៖ មានជួរស្ទួន (ប្រហែលដោយសារទិន្នន័យកំពុងប្តូរពេលទាញ)`);
      tables[def.t] = rows;
      meta.counts[def.t] = rows.length;
    }
    return { meta, tables };
  }

  function paneBackup(body) {
    const cb = h('input', { type: 'checkbox', id: 'hrtImg' });
    const prog = h('p', { class: 'hrt-muted', text: '' });
    const btn = h('button', { type: 'button', text: '💾 ទាញយកបម្រុងទុក (JSON)' });
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true; btn.disabled = true;
      try {
        const r = await runBackup(cb.checked, m => { prog.textContent = m; });
        const d = new Date();
        const name = `backup-${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}-${z2(d.getHours())}${z2(d.getMinutes())}.json`;
        const blob = new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        const cnt = Object.keys(r.meta.counts).map(k => `${k}: ${r.meta.counts[k]}`).join(' · ');
        prog.textContent = `✓ ${name} — ${cnt}` + (r.meta.skipped.length ? ` | រំលង៖ ${r.meta.skipped.join(', ')}` : '');
        if (r.meta.warnings.length) await say('⚠️ ការបម្រុងទុកមិនពេញលេញ៖\n\n' + r.meta.warnings.join('\n'));
      } catch (ex) {
        prog.textContent = '';
        await say('បម្រុងទុកមិនបាន៖ ' + (ex.message || ex));
      } finally { busy = false; btn.disabled = false; }
    });
    body.appendChild(h('div', { class: 'hrt-card' },
      h('h3', { text: '💾 បម្រុងទុកទិន្នន័យ' }),
      h('p', { class: 'hrt-muted', text: 'ទាញយកតារាង៖ employees, attendance, leave_requests, overtime_requests, payroll_items, holidays, app_settings ជាឯកសារ JSON មួយ។ ដំណើរការនេះអានតែប៉ុណ្ណោះ មិនកែ ឬលុបអ្វីក្នុង Supabase ទេ។ មានការផ្ទៀងផ្ទាត់ចំនួនជួរ ហើយនឹងព្រមានបើទិន្នន័យមិនពេញលេញ។' }),
      h('div', { class: 'hrt-row' }, h('label', null, cb, ' រួមទាំងរូបថតបុគ្គលិក/រូបអត្តសញ្ញាណ/រូបកាត (ឯកសារធំជាង)')),
      h('div', { class: 'hrt-row' }, btn),
      prog,
      h('p', { class: 'hrt-badge warn', text: '⚠ ឯកសារមានទិន្នន័យរសើប (ប្រាក់ខែ ទូរស័ព្ទ) សូមរក្សាទុកឲ្យសុវត្ថិភាព កុំចែករំលែក។' }),
      h('p', { class: 'hrt-muted', text: 'ការស្ដារ (restore) មិនមានក្នុងមុខងារនេះទេ ដើម្បីជៀសវាងការសរសេរជាន់ទិន្នន័យដោយចៃដន្យ។' })));
  }

  // ------------------------------------------------------------ ទំព័រ «ឧបករណ៍ HR» ----
  const SUBS = [
    ['remind', '🔔 ការរំលឹក', paneReminders],
    ['quality', '🧹 ពិនិត្យទិន្នន័យ', paneQuality],
    ['stats', '📈 ស្ថិតិ', paneStats],
    ['backup', '💾 បម្រុងទុក', paneBackup]
  ];
  let sub = 'remind', bodyEl = null, tabsEl = null;

  function renderBody() {
    if (!bodyEl) return;
    bodyEl.textContent = '';
    Array.from(tabsEl.children).forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
    const def = SUBS.find(x => x[0] === sub);
    if (!emps().length && sub !== 'backup') { bodyEl.appendChild(empty('មិនទាន់មានទិន្នន័យបុគ្គលិក (សូមរង់ចាំការផ្ទុក ឬបន្ថែមបុគ្គលិក)')); return; }
    try { def[2](bodyEl); } catch (ex) { console.error('hr-tools', ex); bodyEl.appendChild(empty('មានបញ្ហា៖ ' + (ex.message || ex))); }
  }

  // ------------------------------------------------------------ ស្វែងរកលឿន (Ctrl+K) ----
  let pal = null, palInput = null, palList = null, palItems = [], palSel = 0;
  const appVisible = () => { const m = document.getElementById('mainContainer'); return !!m && getComputedStyle(m).display !== 'none'; };

  function paletteItems(q) {
    q = q.trim().toLowerCase();
    const items = [];
    document.querySelectorAll('.nav-item[data-tab]').forEach(b => {
      const lbl = (b.querySelector('.lbl') || b).textContent.replace(/\s+/g, ' ').trim();
      if (!q || lbl.toLowerCase().indexOf(q) >= 0 || String(b.dataset.tab).indexOf(q) >= 0) items.push({ label: '📄 ' + lbl, sub: 'ទំព័រ', run: () => b.click() });
    });
    const tabs = items.slice(0, q ? 5 : 8);
    const people = [];
    if (q) {
      emps().forEach(e => {
        const hay = [e.name, e.username, e.id, e.phone, e.dept, e.position].map(x => String(x == null ? '' : x).toLowerCase()).join(' ');
        if (hay.indexOf(q) >= 0 && people.length < 9) people.push({ label: '👤 ' + (e.name || e.id), sub: [e.username || e.id, e.dept].filter(Boolean).join(' · '), run: () => openEmp(e) });
      });
    }
    return tabs.concat(people);
  }

  function renderPalette() {
    palItems = paletteItems(palInput.value);
    if (palSel >= palItems.length) palSel = Math.max(0, palItems.length - 1);
    palList.textContent = '';
    if (!palItems.length) { palList.appendChild(h('div', { class: 'hrt-item', style: 'cursor:default', text: 'រកមិនឃើញ' })); return; }
    palItems.forEach((it, i) => {
      const row = h('div', { class: 'hrt-item' + (i === palSel ? ' sel' : '') }, h('span', { text: it.label }), h('small', { text: it.sub || '' }));
      row.addEventListener('mousemove', () => { if (palSel !== i) { palSel = i; Array.from(palList.children).forEach((c, k) => c.classList.toggle('sel', k === i)); } });
      row.addEventListener('click', () => runPalette(i));
      palList.appendChild(row);
    });
    const cur = palList.children[palSel];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function runPalette(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }

  function openPalette() {
    if (!appVisible()) return; // មិនទាន់ចូលគណនី
    if (!pal) {
      pal = h('div', { class: 'hrt-pal' });
      palInput = h('input', { type: 'text', placeholder: '🔎 ស្វែងរកទំព័រ ឬបុគ្គលិក (ឈ្មោះ/អត្តលេខ/ទូរស័ព្ទ/ផ្នែក)…', autocomplete: 'off' });
      palList = h('div', { class: 'hrt-pallist' });
      pal.appendChild(h('div', { class: 'hrt-palbox' }, palInput, palList, h('div', { class: 'hrt-hint', text: '↑ ↓ ជ្រើស · Enter បើក · Esc បិទ' })));
      document.body.appendChild(pal);
      pal.addEventListener('mousedown', e => { if (e.target === pal) closePalette(); });
      palInput.addEventListener('input', () => { palSel = 0; renderPalette(); });
      palInput.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); renderPalette(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
        else if (e.key === 'Enter') { e.preventDefault(); runPalette(palSel); }
        else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      });
    }
    palInput.value = ''; palSel = 0;
    pal.classList.add('open');
    renderPalette();
    palInput.focus();
  }
  function closePalette() { if (pal) pal.classList.remove('open'); }

  // ------------------------------------------------------------ ចាប់ផ្តើម ----
  function init() {
    const empNav = document.querySelector('.nav-item[data-tab="employees"]');
    const empTab = document.getElementById('employeesTab');
    if (!empNav || !empTab) return false;
    if (document.getElementById('hrtoolsTab')) return true;
    injectCss();

    const nav = h('button', { class: 'nav-item', type: 'button', 'data-tab': 'hrtools' },
      h('span', { class: 'ico', text: '🧰' }), h('span', { class: 'lbl', text: 'ឧបករណ៍ HR' }));
    empNav.after(nav);
    nav.addEventListener('click', () => { if (typeof showTab === 'function') showTab('hrtools'); renderBody(); });

    tabsEl = h('div', { class: 'hrt-tabs' }, SUBS.map(x => {
      const b = h('button', { class: 'secondary', type: 'button', 'data-sub': x[0], text: x[1] });
      b.addEventListener('click', () => { sub = x[0]; renderBody(); });
      return b;
    }));
    bodyEl = h('div', { id: 'hrtoolsBody' });
    empTab.parentNode.appendChild(h('div', { id: 'hrtoolsTab', class: 'tab-content' },
      h('h2', { class: 'page-title', text: '🧰 ឧបករណ៍ HR' }), tabsEl, bodyEl));

    const hdr = document.querySelector('.app-main header');
    if (hdr && hdr.lastElementChild) {
      const sb = h('button', { class: 'secondary', type: 'button', id: 'hrtSearchBtn', title: 'Ctrl+K', text: '🔎 ស្វែងរក' });
      sb.addEventListener('click', openPalette);
      hdr.lastElementChild.insertBefore(sb, hdr.lastElementChild.firstChild);
    }
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') {
        if (!appVisible()) return;
        e.preventDefault();
        if (pal && pal.classList.contains('open')) closePalette(); else openPalette();
      }
    });
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
  window.hrTools = { computeReminders, computeQuality, computeStats, runBackup, openPalette };
})();
