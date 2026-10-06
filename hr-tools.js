/* hr-tools.js — ឧបករណ៍ HR បន្ថែម (មិនពាក់ព័ន្ធនឹង work-card.js)
 *
 * ១) 🔎 ស្វែងរកលឿន (Ctrl+K)៖ រកទំព័រ ឬបុគ្គលិក ហើយចុច Enter ដើម្បីបើក
 * ២) 🧰 ទំព័រថ្មី «ឧបករណ៍ HR» (ក្នុងម៉ឺនុយខាងឆ្វេង ក្រោម «បញ្ជីបុគ្គលិក»)៖
 *      🔔 ការរំលឹក   — ខួបចូលធ្វើការ (៣០ ថ្ងៃខាងមុខ) និងជិតផុតសាកល្បង
 *      🧹 ពិនិត្យទិន្នន័យ — ស្ទួន (ឈ្មោះ/ទូរស័ព្ទ/username/email) និងវាលខ្វះ ឬខុសទម្រង់
 *      📈 ស្ថិតិ     — ចំនួន ភាពចាស់ (tenure) តាមផ្នែក ការជួលបុគ្គលិក ១២ ខែចុងក្រោយ
 *      📅 ប្រតិទិន    — ថ្ងៃបុណ្យ ខួបចូលធ្វើការ និងច្បាប់ក្នុងមួយខែ
 *      📊 វត្តមាន    — យឺត/អវត្តមាន/ភ្លេចស្កេនចេញ/អវត្តមានជាប់ៗ/វត្តមានល្អឥតខ្ចោះ + CSV
 *      🌴 ច្បាប់      — ឈប់ថ្ងៃនេះ ១៤ ថ្ងៃខាងមុខ រង់ចាំអនុម័ត ស្ថិតិប្រចាំឆ្នាំ
 *      📄 លិខិតបញ្ជាក់ — បង្កើតលិខិតបញ្ជាក់ការងារ (ព្រីន/PDF)
 *      ✉️ គំរូសារ    — សារជូនពរ/ស្វាគមន៍/រំលឹក ចម្លងទៅ Telegram
 *      💹 ឡើងប្រាក់ខែ — មើលជាមុន ហើយអនុវត្តបាន (មាន CSV បម្រុងទុក Audit log និងប៊ូតុងត្រឡប់វិញ)
 *      🔁 កែច្រើន     — ប្តូរឈ្មោះផ្នែក/មុខងារ និងស្ថានភាព/ផ្នែកច្រើននាក់ (សរសេរទៅ Supabase)
 *      📤 នាំចេញ     — CSV និង vCard (.vcf)
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
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
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
.hrt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:8px 0}
.hrt-cal .h{font-size:.72rem;text-align:center;color:var(--text-muted,#5b6b80)}
.hrt-day{min-height:62px;border:1px solid var(--border,#e1e8ef);border-radius:8px;padding:4px 6px;font-size:.78rem;cursor:pointer;background:var(--card-bg,#fff);overflow:hidden}
.hrt-day.hol{background:rgba(239,68,68,.14)}
.hrt-day.today{outline:2px solid #0d9488}
.hrt-day.sel{box-shadow:0 0 0 2px #0284c7}
.hrt-day .m{display:block;font-size:.66rem;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
textarea.hrt-ta{width:100%;min-height:150px;box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid var(--border,#e1e8ef);border-radius:10px;background:transparent;color:inherit;font:inherit;line-height:1.7}
.hrt-link{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border:1px solid var(--border,#e1e8ef);border-radius:8px;text-decoration:none;color:inherit;font-size:.82rem}
.wcb-list-like{max-height:40vh;overflow:auto;border:1px solid var(--border,#e1e8ef);border-radius:10px;margin:8px 0}
.hrt-pick{display:flex;gap:10px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border,#e1e8ef);font-size:.85rem;cursor:pointer}
.hrt-pick small{margin-left:auto;color:var(--text-muted,#5b6b80)}
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

  async function runBackup(withImages, onProgress) {
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
      const res = await fetchAllRows(def.t, def.o);
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

  // ============================================================ មុខងារបន្ថែម (ផ្នែកទី ២) ====
  const KH_DIG = '០១២៣៤៥៦៧៨៩';
  const toKh = s => String(s).replace(/\d/g, d => KH_DIG[+d]);
  const KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const KH_WD = ['អា', 'ច', 'អ', 'ពុ', 'ព្រ', 'សុ', 'ស'];
  const khDate = d => `ថ្ងៃទី${toKh(d.getDate())} ខែ${KH_MONTHS[d.getMonth()]} ឆ្នាំ${toKh(d.getFullYear())}`;
  const ymKey = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}`;
  const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const distinct = arr => Array.from(new Set(arr.map(x => String(x == null ? '' : x).trim()).filter(Boolean)));
  const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCsv = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const getJson = (k, d) => { try { const v = JSON.parse(lsGet(k, '')); return (v && typeof v === 'object') ? v : d; } catch (_) { return d; } };
  const ask = m => (typeof customConfirm === 'function' ? customConfirm(m) : Promise.resolve(window.confirm(m)));
  const sortedEmps = () => emps().slice().sort((a, b) => ((b.status === 'active') - (a.status === 'active')) || String(a.name).localeCompare(String(b.name)));

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ជំនួយ UI
  const card = (title, ...kids) => h('div', { class: 'hrt-card' }, h('h3', { text: title }), ...kids);
  const rowEl = (...kids) => h('div', { class: 'hrt-row' }, ...kids);
  const lab = (text, ctrl) => h('label', null, text, ctrl);
  const btn = (text, onclick, cls) => h('button', { type: 'button', class: cls === undefined ? 'secondary' : cls, text, onclick });
  const statEl = (v, l) => h('div', { class: 'hrt-stat' }, h('b', { text: v }), h('span', { text: l }));
  const leaveLabel = k => (typeof LEAVE_TYPE_LABELS !== 'undefined' && LEAVE_TYPE_LABELS[k]) || k || '-';

  // ------------------------------------------------------------ ការគណនា (pure) ----
  function lateStartOf(empId) {
    try {
      if (typeof getEmpShift === 'function' && typeof lateStartMinutes === 'function') {
        const m = lateStartMinutes(getEmpShift(empId));
        if (typeof m === 'number' && isFinite(m)) return m;
      }
    } catch (_) { /* ignore */ }
    return 7 * 60;
  }

  function computeAttendance(list, att, ym, now, lateStartFn) {
    const t = now || today0();
    const rows = list.filter(e => e.status === 'active').map(e => ({ e, present: 0, absent: 0, leave: 0, late: 0, lateMin: 0, noOut: 0, streak: 0, run: 0 }));
    const dates = Object.keys(att || {}).filter(d => d.indexOf(ym) === 0).sort();
    const totals = { present: 0, absent: 0, leave: 0, late: 0, lateMin: 0 };
    dates.forEach(d => {
      const dd = parseYMD(d), past = !!dd && dd < t, day = att[d] || {};
      rows.forEach(r => {
        const rec = day[String(r.e.id)];
        if (!rec) return;
        const st = String(rec.status || '');
        if (st === 'present') {
          r.present++; totals.present++; r.run = 0;
          const m = hm(rec.checkin);
          if (m != null) { const lm = m - lateStartFn(r.e.id); if (lm > 0) { r.late++; r.lateMin += lm; totals.late++; totals.lateMin += lm; } }
          if (past && rec.checkin && !rec.checkout) r.noOut++;
        } else if (st === 'absent') {
          r.absent++; totals.absent++; r.run++; if (r.run > r.streak) r.streak = r.run;
        } else if (st.indexOf('leave') === 0) {
          r.leave++; totals.leave++; r.run = 0;
        }
      });
    });
    return { rows, totals, days: dates.length };
  }

  const leaveDays = (s, en) => Math.max(1, dayDiff(en, s) + 1);

  function computeLeave(list, reqs, now) {
    const t = now || today0();
    const byId = new Map(list.map(e => [String(e.id), e]));
    const norm = reqs.filter(r => r && r.status === 'approved').map(r => ({ r, e: byId.get(String(r.employee_id)), s: parseYMD(r.start_date), en: parseYMD(r.end_date || r.start_date) })).filter(x => x.e && x.s && x.en);
    const today = norm.filter(x => x.s <= t && x.en >= t);
    const upcoming = norm.filter(x => x.s > t && dayDiff(x.s, t) <= 14).sort((a, b) => a.s - b.s);
    const pending = reqs.filter(r => r && r.status === 'pending').map(r => ({ r, e: byId.get(String(r.employee_id)) })).filter(x => x.e);
    const yr = t.getFullYear(), y0 = new Date(yr, 0, 1), y1 = new Date(yr, 11, 31);
    const usage = new Map(), byType = new Map();
    norm.forEach(x => {
      const s = x.s < y0 ? y0 : x.s, en = x.en > y1 ? y1 : x.en;
      if (en < s) return;
      const days = leaveDays(s, en);
      const k = String(x.e.id);
      if (!usage.has(k)) usage.set(k, { e: x.e, days: 0, n: 0 });
      const u = usage.get(k); u.days += days; u.n++;
      const ty = x.r.leave_type || '-';
      byType.set(ty, (byType.get(ty) || 0) + days);
    });
    return {
      today, upcoming, pending,
      usage: Array.from(usage.values()).sort((a, b) => b.days - a.days),
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1])
    };
  }

  function computeCalendar(list, reqs, hol, year, month0) {
    const n = new Date(year, month0 + 1, 0).getDate();
    const days = [];
    for (let d = 1; d <= n; d++) days.push({ d, hol: '', annivs: [], leaves: [] });
    Object.keys(hol || {}).forEach(k => {
      const dt = parseYMD(k);
      if (dt && dt.getFullYear() === year && dt.getMonth() === month0) days[dt.getDate() - 1].hol = String(hol[k] || 'ថ្ងៃឈប់សម្រាក');
    });
    const byId = new Map(list.map(e => [String(e.id), e]));
    list.filter(e => e.status === 'active').forEach(e => {
      const sd = parseYMD(e.startDate);
      if (sd && sd.getMonth() === month0 && sd.getFullYear() < year) days[Math.min(sd.getDate(), n) - 1].annivs.push({ e, years: year - sd.getFullYear() });
    });
    const first = new Date(year, month0, 1), last = new Date(year, month0, n);
    reqs.filter(r => r && r.status === 'approved').forEach(r => {
      const e = byId.get(String(r.employee_id)), s = parseYMD(r.start_date), en = parseYMD(r.end_date || r.start_date);
      if (!e || !s || !en || en < first || s > last) return;
      const a = s < first ? first : s, b = en > last ? last : en;
      for (let d = a.getDate(); d <= b.getDate(); d++) days[d - 1].leaves.push({ e, type: r.leave_type });
    });
    return days;
  }

  function computeRaise(list, o) {
    const t = o.now || today0();
    const v = Number(o.value) || 0, minY = Number(o.minYears) || 0, rnd = Number(o.round) || 0;
    const rows = [];
    list.filter(e => e.status === 'active' && (!o.dept || String(e.dept || '').trim() === o.dept)).forEach(e => {
      const old = Number(e.salary);
      if (!isFinite(old) || old <= 0) return;
      const sd = parseYMD(e.startDate);
      const yrs = sd && sd <= t ? (t - sd) / (365.25 * 86400000) : 0;
      if (minY > 0 && yrs < minY) return;
      let nw = o.mode === 'fixed' ? old + v : old * (1 + v / 100);
      nw = rnd > 0 ? Math.round(nw / rnd) * rnd : Math.round(nw * 100) / 100;
      rows.push({ e, old, nw, diff: nw - old, years: yrs });
    });
    const oldSum = rows.reduce((a, r) => a + r.old, 0), newSum = rows.reduce((a, r) => a + r.nw, 0);
    return { rows, oldSum, newSum, diff: newSum - oldSum, n: rows.length };
  }

  function fillTpl(text, e, v) {
    const sd = parseYMD(e.startDate), t = today0();
    const years = sd && sd <= t ? Math.floor((t - sd) / (365.25 * 86400000)) : 0;
    const map = { name: e.name || '', position: e.position || '', dept: e.dept || '', username: e.username || e.id || '', years: String(years), startDate: sd ? fmt(sd) : '', company: (v && v.company) || 'ក្រុមហ៊ុន', today: fmt(t) };
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m));
  }

  const intlPhone = p => { const d = normPhone(p); return (d && phoneOk(p)) ? '+855' + d.slice(1) : ''; };
  const vEsc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  function toVcf(list, company) {
    return list.map(e => [
      'BEGIN:VCARD', 'VERSION:3.0', `FN:${vEsc(e.name)}`, `N:${vEsc(e.name)};;;;`,
      (e.phone ? `TEL;TYPE=CELL:${intlPhone(e.phone) || vEsc(e.phone)}` : ''),
      (e.email ? `EMAIL:${vEsc(e.email)}` : ''),
      `ORG:${vEsc(company || '')};${vEsc(e.dept || '')}`,
      (e.position ? `TITLE:${vEsc(e.position)}` : ''),
      'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n') + '\r\n';
  }

  function certificateHtml(e, o) {
    const issue = o.issue || today0();
    const sd = parseYMD(e.startDate);
    const active = e.status === 'active';
    const co = escHtml(o.company || '………………………………');
    const rows = [
      ['ឈ្មោះ', e.name], ['អត្តលេខ', e.username || e.id], ['មុខងារ', e.position || '-'], ['ផ្នែក', e.dept || '-'],
      ['ថ្ងៃចូលធ្វើការ', sd ? khDate(sd) : '-'], ['ស្ថានភាព', active ? 'កំពុងបម្រើការ' : 'ឈប់បម្រើការ']
    ];
    if (o.withSalary && Number(e.salary) > 0) rows.push(['ប្រាក់ខែគោល', money(e.salary) + ' ដុល្លារអាមេរិក ក្នុងមួយខែ']);
    const intro = o.signer
      ? `ខ្ញុំបាទ/នាងខ្ញុំ ឈ្មោះ <b>${escHtml(o.signer)}</b> ${o.title ? 'មុខតំណែង <b>' + escHtml(o.title) + '</b> ' : ''}នៃ <b>${co}</b> សូមបញ្ជាក់ថា៖`
      : `<b>${co}</b> សូមបញ្ជាក់ថា៖`;
    const stmt = active
      ? `${escHtml(e.name)} បានបម្រើការងារនៅក្រុមហ៊ុនយើងខ្ញុំ${sd ? ' ចាប់ពី' + khDate(sd) : ''} រហូតមកដល់បច្ចុប្បន្ន។`
      : `${escHtml(e.name)} បានធ្លាប់បម្រើការងារនៅក្រុមហ៊ុនយើងខ្ញុំ${sd ? ' ចាប់ពី' + khDate(sd) : ''}។`;
    const font = /^https:\/\/fonts\.googleapis\.com\//.test(o.fontHref || '') ? `<link rel="stylesheet" href="${escHtml(o.fontHref)}">` : '';
    return `<!doctype html><html lang="km"><head><meta charset="utf-8"><title>លិខិតបញ្ជាក់ការងារ — ${escHtml(e.name)}</title>${font}
<style>@page{size:A4;margin:22mm 20mm}body{font-family:'Kantumruy Pro','Noto Sans Khmer','Khmer OS Battambang',sans-serif;color:#111;font-size:12pt;line-height:1.9;margin:0}
.nat{text-align:center;font-weight:700}.co{margin-top:14mm;text-align:left}h1{text-align:center;font-size:17pt;margin:12mm 0 8mm}
table{border-collapse:collapse;margin:4mm 0 4mm 10mm}td{padding:1mm 4mm 1mm 0;vertical-align:top}td:first-child{width:42mm}
.sig{margin-top:14mm;text-align:right;padding-right:10mm}.sig .box{display:inline-block;text-align:center;min-width:60mm}.sp{height:24mm}</style></head><body>
<div class="nat">ព្រះរាជាណាចក្រកម្ពុជា<br>ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
<div class="co"><b>${co}</b>${o.address ? '<br>' + escHtml(o.address) : ''}</div>
<h1>លិខិតបញ្ជាក់ការងារ</h1>
<p>${intro}</p>
<table>${rows.map(r => `<tr><td>${escHtml(r[0])}</td><td>៖ ${escHtml(r[1])}</td></tr>`).join('')}</table>
<p>${stmt}</p>
<p>លិខិតនេះចេញជូនដើម្បី${escHtml(o.purpose || 'ប្រើប្រាស់តាមការចាំបាច់')}។</p>
<div class="sig"><div class="box">${escHtml(o.place || '')}${o.place ? ', ' : ''}${khDate(issue)}<br><b>${escHtml(o.title || 'តំណាងក្រុមហ៊ុន')}</b><div class="sp"></div>${escHtml(o.signer || '')}</div></div>
</body></html>`;
  }

  function openPrint(html) {
    const w = window.open('', '_blank');
    if (!w) { say('Browser បានទប់ស្កាត់បង្អួច — សូមអនុញ្ញាត popup'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch (_) { /* ignore */ } };
    if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(() => setTimeout(go, 150)); else setTimeout(go, 700);
  }

  // ជ្រើសបុគ្គលិក (ស្វែងរក + បញ្ជីជ្រើស)
  let pickedId = null;
  function empPicker(onChange) {
    const q = h('input', { type: 'text', placeholder: '🔍 ស្វែងរកបុគ្គលិក…', style: 'min-width:170px' });
    const sel = h('select', { style: 'min-width:240px;max-width:100%' });
    let shown = [];
    const get = () => shown[+sel.value] || null;
    const rebuild = () => {
      const s = q.value.trim().toLowerCase();
      shown = sortedEmps().filter(e => !s || [e.name, e.username, e.id].some(x => String(x == null ? '' : x).toLowerCase().indexOf(s) >= 0)).slice(0, 300);
      sel.textContent = '';
      shown.forEach((e, i) => sel.appendChild(h('option', { value: String(i), text: `${e.name || e.id}${e.username ? ' · ' + e.username : ''}${e.status === 'active' ? '' : ' (ឈប់)'}` })));
      const k = shown.findIndex(e => e.id === pickedId);
      if (k >= 0) sel.value = String(k);
    };
    q.addEventListener('input', () => { rebuild(); const e = get(); if (e) pickedId = e.id; onChange(e); });
    sel.addEventListener('change', () => { const e = get(); if (e) pickedId = e.id; onChange(e); });
    rebuild();
    return { el: rowEl(q, sel), get };
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ វត្តមាន ----
  let attYM = '';
  function paneAttendance(body) {
    if (!attYM) attYM = ymKey(today0());
    const mi = h('input', { type: 'month', value: attYM });
    mi.addEventListener('change', () => { if (mi.value) { attYM = mi.value; renderBody(); } });
    const att = (typeof attendance !== 'undefined' && attendance) ? attendance : {};
    const r = computeAttendance(emps(), att, attYM, null, lateStartOf);
    const rows = r.rows.slice().sort((a, b) => String(a.e.name).localeCompare(String(b.e.name)));
    const heads = ['ឈ្មោះ', 'ផ្នែក', 'មកធ្វើការ', 'អវត្តមាន', 'ច្បាប់', 'យឺត (ដង)', 'យឺត (នាទី)', 'ភ្លេចស្កេនចេញ'];
    const cells = x => [x.e.name, x.e.dept || '-', x.present, x.absent, x.leave, x.late, x.lateMin, x.noOut];
    body.appendChild(rowEl(lab('ខែ ', mi),
      btn('⬇ CSV', () => download(`attendance-${attYM}.csv`, toCsv([['អត្តលេខ'].concat(heads)].concat(rows.map(x => [x.e.username || x.e.id].concat(cells(x))))), 'text/csv;charset=utf-8'))));
    if (!r.days) { body.appendChild(empty('គ្មានទិន្នន័យវត្តមានក្នុងខែនេះ')); return; }
    body.appendChild(h('div', { class: 'hrt-grid' },
      statEl(String(rows.length), 'បុគ្គលិកកំពុងបម្រើការ'), statEl(String(r.days), 'ថ្ងៃដែលមានកត់ត្រា'),
      statEl(String(r.totals.present), 'ចំនួនមកធ្វើការ (ថ្ងៃ·នាក់)'), statEl(String(r.totals.absent), 'អវត្តមាន'),
      statEl(String(r.totals.leave), 'ច្បាប់'), statEl(`${r.totals.late} ដង`, `យឺតសរុប ${r.totals.lateMin} នាទី`)));
    const top = (title, arr, cols, fn) => { if (arr.length) body.appendChild(card(title, mkTable(cols, arr.map(fn)))); };
    top('⏰ យឺតច្រើនជាងគេ (១០ នាក់)', rows.filter(x => x.late > 0).sort((a, b) => b.lateMin - a.lateMin || b.late - a.late).slice(0, 10), ['ឈ្មោះ', 'ផ្នែក', 'ដង', 'នាទី', ''], x => [x.e.name, x.e.dept || '-', String(x.late), String(x.lateMin), editBtn(x.e)]);
    top('🚫 អវត្តមានច្រើនជាងគេ (១០ នាក់)', rows.filter(x => x.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 10), ['ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃ', ''], x => [x.e.name, x.e.dept || '-', String(x.absent), editBtn(x.e)]);
    top('⚠️ អវត្តមានជាប់ៗគ្នា ៣ ថ្ងៃឡើង', rows.filter(x => x.streak >= 3).sort((a, b) => b.streak - a.streak), ['ឈ្មោះ', 'ផ្នែក', 'ជាប់ៗគ្នា (ថ្ងៃ)', ''], x => [x.e.name, x.e.dept || '-', String(x.streak), editBtn(x.e)]);
    top('📌 ភ្លេចស្កេនចេញ (ថ្ងៃកន្លងមក)', rows.filter(x => x.noOut > 0).sort((a, b) => b.noOut - a.noOut), ['ឈ្មោះ', 'ផ្នែក', 'ដង', ''], x => [x.e.name, x.e.dept || '-', String(x.noOut), editBtn(x.e)]);
    const perfect = rows.filter(x => x.present > 0 && !x.absent && !x.late && !x.leave);
    body.appendChild(card(`🏆 វត្តមានល្អឥតខ្ចោះ (${perfect.length})`, perfect.length ? h('div', { class: 'hrt-row' }, perfect.map(x => badge(x.e.name))) : empty('មិនមាន')));
    body.appendChild(card('តារាងលម្អិត', mkTable(heads.concat(['']), rows.map(x => cells(x).map(String).concat([editBtn(x.e)])))));
    body.appendChild(h('p', { class: 'hrt-muted', text: 'យឺត = ស្កេនចូលក្រោយម៉ោងចូលវេនរបស់បុគ្គលិកនោះ (ការអនុគ្រោះមិនគិត)។ ថ្ងៃដែលមិនបានកត់ត្រា (ឧ. ថ្ងៃអាទិត្យ/បុណ្យ) មិនត្រូវបានរាប់។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ច្បាប់ ----
  function paneLeave(body) {
    const reqs = (typeof leaveRequests !== 'undefined' && Array.isArray(leaveRequests)) ? leaveRequests : [];
    if (!reqs.length) body.appendChild(empty('មិនទាន់មានទិន្នន័យសំណើច្បាប់ (ឬមិនទាន់ផ្ទុក)។ សូមបើកផ្ទាំង Leave / Overtime ម្តងសិន។'));
    const d = computeLeave(emps(), reqs, null);
    body.appendChild(h('div', { class: 'hrt-grid' },
      statEl(String(d.today.length), 'ឈប់ច្បាប់ថ្ងៃនេះ'), statEl(String(d.upcoming.length), 'ចាប់ផ្តើមក្នុង ១៤ ថ្ងៃខាងមុខ'), statEl(String(d.pending.length), 'រង់ចាំអនុម័ត')));
    const range = x => (x.s.getTime() === x.en.getTime() ? fmt(x.s) : `${fmt(x.s)} → ${fmt(x.en)}`);
    body.appendChild(card('🌴 ឈប់ច្បាប់ថ្ងៃនេះ', d.today.length ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'ប្រភេទ', 'រយៈពេល', ''], d.today.map(x => [x.e.name, x.e.dept || '-', leaveLabel(x.r.leave_type), range(x), editBtn(x.e)])) : empty('គ្មាននរណាឈប់ច្បាប់ថ្ងៃនេះ')));
    body.appendChild(card('📆 នឹងឈប់ក្នុង ១៤ ថ្ងៃខាងមុខ', d.upcoming.length ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'ប្រភេទ', 'រយៈពេល', ''], d.upcoming.map(x => [x.e.name, x.e.dept || '-', leaveLabel(x.r.leave_type), range(x), editBtn(x.e)])) : empty('គ្មាន')));
    body.appendChild(card(`⏳ រង់ចាំអនុម័ត (${d.pending.length})`,
      d.pending.length ? mkTable(['ឈ្មោះ', 'ប្រភេទ', 'ពីថ្ងៃ', 'ដល់ថ្ងៃ', 'មូលហេតុ'], d.pending.map(x => [x.e.name, leaveLabel(x.r.leave_type), x.r.start_date || '-', x.r.end_date || x.r.start_date || '-', x.r.reason || '-'])) : empty('គ្មានសំណើរង់ចាំ'),
      d.pending.length ? rowEl(btn('➡ ទៅផ្ទាំង Leave / Overtime', () => { if (typeof showTab === 'function') showTab('requests'); })) : null));
    const yr = today0().getFullYear();
    body.appendChild(card(`📊 ថ្ងៃឈប់ច្បាប់ដែលបានអនុម័តក្នុងឆ្នាំ ${yr} (ថ្ងៃតាមប្រតិទិន)`,
      d.usage.length ? mkTable(['ឈ្មោះ', 'ផ្នែក', 'សំណើ', 'សរុប (ថ្ងៃ)'], d.usage.slice(0, 15).map(u => [u.e.name, u.e.dept || '-', String(u.n), String(u.days)])) : empty('មិនទាន់មាន'),
      d.byType.length ? mkTable(['ប្រភេទ', 'ថ្ងៃសរុប'], d.byType.map(x => [leaveLabel(x[0]), String(x[1])])) : null));
    body.appendChild(h('p', { class: 'hrt-muted', text: 'ការរាប់ថ្ងៃគិតតាមចន្លោះ «ពីថ្ងៃ–ដល់ថ្ងៃ» (រួមទាំងថ្ងៃអាទិត្យ/បុណ្យ) ដូច្នេះជាតម្លៃប្រហែល មិនមែនសមតុល្យច្បាប់ផ្លូវការទេ — សូមមើលផ្ទាំង «ច្បាប់ប្រចាំឆ្នាំ» សម្រាប់សមតុល្យ។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ប្រតិទិន ----
  let calY = null, calM = 0, calSel = null;
  function paneCalendar(body) {
    const t = today0();
    if (calY == null) { calY = t.getFullYear(); calM = t.getMonth(); }
    const reqs = (typeof leaveRequests !== 'undefined' && Array.isArray(leaveRequests)) ? leaveRequests : [];
    const hol = (typeof holidays !== 'undefined' && holidays) ? holidays : {};
    const days = computeCalendar(emps(), reqs, hol, calY, calM);
    const go = dm => { calM += dm; if (calM < 0) { calM = 11; calY--; } else if (calM > 11) { calM = 0; calY++; } calSel = null; renderBody(); };
    body.appendChild(rowEl(btn('‹', () => go(-1)), h('b', { text: `ខែ${KH_MONTHS[calM]} ${toKh(calY)}` }), btn('›', () => go(1)),
      btn('ថ្ងៃនេះ', () => { calY = t.getFullYear(); calM = t.getMonth(); calSel = t.getDate(); renderBody(); })));
    const grid = h('div', { class: 'hrt-cal' }, KH_WD.map(w => h('div', { class: 'h', text: w })));
    for (let i = 0; i < new Date(calY, calM, 1).getDay(); i++) grid.appendChild(h('div'));
    days.forEach(x => {
      const isToday = calY === t.getFullYear() && calM === t.getMonth() && x.d === t.getDate();
      const c = h('div', { class: 'hrt-day' + (x.hol ? ' hol' : '') + (isToday ? ' today' : '') + (calSel === x.d ? ' sel' : '') },
        h('b', { text: String(x.d) }),
        x.hol ? h('span', { class: 'm', text: x.hol }) : null,
        x.annivs.length ? h('span', { class: 'm', text: `🎂 ${x.annivs.length}` }) : null,
        x.leaves.length ? h('span', { class: 'm', text: `🌴 ${x.leaves.length}` }) : null);
      c.addEventListener('click', () => { calSel = x.d; renderBody(); });
      grid.appendChild(c);
    });
    body.appendChild(grid);
    const sel = calSel && days[calSel - 1];
    if (sel) {
      const kids = [];
      if (sel.hol) kids.push(h('p', null, badge('ថ្ងៃឈប់សម្រាក', 'late'), ' ' + sel.hol));
      if (sel.annivs.length) kids.push(mkTable(['🎂 ខួបចូលធ្វើការ', 'ឆ្នាំ', ''], sel.annivs.map(a => [a.e.name, `${a.years} ឆ្នាំ`, editBtn(a.e)])));
      if (sel.leaves.length) kids.push(mkTable(['🌴 ឈប់ច្បាប់', 'ប្រភេទ', ''], sel.leaves.map(l => [l.e.name, leaveLabel(l.type), editBtn(l.e)])));
      if (!kids.length) kids.push(empty('គ្មានព្រឹត្តិការណ៍'));
      body.appendChild(card(`ថ្ងៃទី ${sel.d} ${KH_MONTHS[calM]} ${calY}`, ...kids));
    }
    body.appendChild(h('p', { class: 'hrt-muted', text: 'បង្ហាញថ្ងៃបុណ្យ (ពីផ្ទាំងការកំណត់) ខួបចូលធ្វើការ និងច្បាប់ដែលបានអនុម័ត។ ចុចលើថ្ងៃដើម្បីមើលលម្អិត។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ លិខិតបញ្ជាក់ការងារ ----
  function paneCert(body) {
    const d0 = getJson('hrt_cert', {});
    const brand = (document.querySelector('.sidebar-brand') || {}).textContent || '';
    const S = {
      company: d0.company || lsGet('wc_company', '') || brand.replace(/^[^\p{L}\p{N}]+/u, '').trim(),
      address: d0.address || '', signer: d0.signer || '', title: d0.title || '', place: d0.place || 'ភ្នំពេញ', purpose: d0.purpose || '', withSalary: !!d0.withSalary
    };
    const save = () => lsSet('hrt_cert', JSON.stringify(S));
    const txt = (key, ph, w) => { const i = h('input', { type: 'text', value: S[key], placeholder: ph || '', style: `min-width:${w || 180}px` }); i.addEventListener('input', () => { S[key] = i.value; save(); }); return i; };
    const issue = h('input', { type: 'date', value: `${today0().getFullYear()}-${z2(today0().getMonth() + 1)}-${z2(today0().getDate())}` });
    const sal = h('input', { type: 'checkbox' }); sal.checked = S.withSalary;
    sal.addEventListener('change', () => { S.withSalary = sal.checked; save(); });
    const pick = empPicker(() => { /* គ្មានអ្វីត្រូវធ្វើ */ });
    body.appendChild(card('📄 លិខិតបញ្ជាក់ការងារ (ព្រីន/រក្សាទុកជា PDF)',
      rowEl(lab('បុគ្គលិក ', pick.el)),
      rowEl(lab('ក្រុមហ៊ុន ', txt('company', 'ឈ្មោះក្រុមហ៊ុន', 240)), lab('អាសយដ្ឋាន ', txt('address', 'អាសយដ្ឋានក្រុមហ៊ុន', 300))),
      rowEl(lab('អ្នកចុះហត្ថលេខា ', txt('signer', 'ឈ្មោះ', 160)), lab('មុខតំណែង ', txt('title', 'ឧ. នាយកធនធានមនុស្ស', 180)), lab('ទីកន្លែង ', txt('place', 'ភ្នំពេញ', 100))),
      rowEl(lab('គោលបំណង ', txt('purpose', 'ឧ. ដាក់ពាក្យសុំទិដ្ឋាការ / ស្នើសុំប្រាក់កម្ចី', 320))),
      rowEl(lab('ថ្ងៃចេញលិខិត ', issue), h('label', null, sal, ' បញ្ចូលប្រាក់ខែគោល')),
      rowEl(btn('🖨 បើក / ព្រីន', () => {
        const e = pick.get();
        if (!e) { say('សូមជ្រើសបុគ្គលិកសិន'); return; }
        const lk = document.querySelector('link[href*="fonts.googleapis.com"]');
        openPrint(certificateHtml(e, Object.assign({}, S, { issue: parseYMD(issue.value) || today0(), fontHref: lk ? lk.href : '' })));
      }, ''))));
    body.appendChild(h('p', { class: 'hrt-muted', text: 'ក្នុងបង្អួចព្រីនអាចជ្រើស «Save as PDF»។ សូមពិនិត្យអត្ថបទមុនចុះហត្ថលេខា និងបោះត្រា។ អត្តលេខយកពី username (បើគ្មាន ប្រើ id)។ ព័ត៌មានដែលបានបំពេញត្រូវបានចងចាំលើ browser នេះ។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ គំរូសារ ----
  const TPLS = [
    { id: 'anniv', label: '🎉 ជូនពរខួបចូលធ្វើការ', text: '🎉 សូមអបអរសាទរ {name}! ថ្ងៃនេះគឺជាខួបចូលធ្វើការគម្រប់ {years} ឆ្នាំរបស់អ្នកនៅ {company}។ សូមអរគុណចំពោះការខិតខំប្រឹងប្រែង និងការលះបង់របស់អ្នកក្នុងតួនាទី {position} នៃផ្នែក {dept}។ សូមជូនពរឲ្យអ្នកមានសុខភាពល្អ និងទទួលបានជោគជ័យបន្តទៀត! 🙏' },
    { id: 'welcome', label: '👋 ស្វាគមន៍បុគ្គលិកថ្មី', text: '👋 សូមស្វាគមន៍ {name} មកកាន់ក្រុមគ្រួសារ {company}! អ្នកចាប់ផ្តើមការងារក្នុងតួនាទី {position} នៃផ្នែក {dept} ចាប់ពីថ្ងៃទី {startDate}។ បើមានសំណួរ សូមទាក់ទងផ្នែកធនធានមនុស្សបានគ្រប់ពេល។' },
    { id: 'probation', label: '⏳ ជូនដំណឹងវាយតម្លៃការសាកល្បង', text: 'ជម្រាបសួរ {name}, ការសាកល្បងការងាររបស់អ្នកក្នុងតួនាទី {position} ជិតដល់ពេលវាយតម្លៃហើយ។ ផ្នែកធនធានមនុស្សនឹងទាក់ទងអ្នក និងអ្នកគ្រប់គ្រង ដើម្បីកំណត់ពេលជួបពិភាក្សា។ សូមអរគុណ។' },
    { id: 'late', label: '⏰ រំលឹកការមកយឺត', text: 'ជម្រាបសួរ {name}, យើងសង្កេតឃើញថាអ្នកមកធ្វើការយឺតញឹកញាប់ជាងមុន។ សូមខិតខំមកឲ្យទាន់ម៉ោងតាមវេនការងារ។ បើមានបញ្ហាអ្វី សូមប្រាប់ផ្នែកធនធានមនុស្ស ដើម្បីជួយរកដំណោះស្រាយ។ សូមអរគុណ។' },
    { id: 'absent', label: '📞 សួរនាំពេលអវត្តមាន', text: 'ជម្រាបសួរ {name}, ថ្ងៃនេះ ({today}) អ្នកមិនទាន់មកធ្វើការ ហើយយើងមិនទាន់ទទួលបានព័ត៌មានអំពីច្បាប់ទេ។ សូមជួយទាក់ទងមកវិញ ឬជូនដំណឹងអំពីស្ថានភាពរបស់អ្នក។ សូមអរគុណ។' },
    { id: 'thanks', label: '🙏 សូមអរគុណ/សរសើរ', text: '🙏 សូមអរគុណ {name} សម្រាប់ការខិតខំប្រឹងប្រែងដ៏ល្អប្រសើរក្នុងតួនាទី {position}។ {company} ឱ្យតម្លៃចំពោះការរួមចំណែករបស់អ្នកខ្លាំងណាស់។' }
  ];

  function paneTemplates(body) {
    const company = () => lsGet('wc_company', '') || getJson('hrt_cert', {}).company || 'ក្រុមហ៊ុន';
    const tsel = h('select', null, TPLS.map(t => h('option', { value: t.id, text: t.label })));
    const tpl = h('textarea', { class: 'hrt-ta', style: 'min-height:90px' });
    const out = h('textarea', { class: 'hrt-ta' });
    const tel = h('a', { class: 'hrt-link', target: '_blank', rel: 'noopener', text: '📞 ហៅ' });
    const tg = h('a', { class: 'hrt-link', target: '_blank', rel: 'noopener', text: '💬 Telegram' });
    const cur = () => TPLS.find(t => t.id === tsel.value) || TPLS[0];
    const loadTpl = () => { tpl.value = lsGet('hrt_tpl_' + cur().id, '') || cur().text; };
    const refresh = () => {
      const e = pick.get();
      out.value = e ? fillTpl(tpl.value, e, { company: company() }) : '';
      const p = e ? intlPhone(e.phone) : '';
      tel.style.display = tg.style.display = p ? '' : 'none';
      if (p) { tel.href = 'tel:' + p; tg.href = 'https://t.me/' + p; }
    };
    const pick = empPicker(refresh);
    tsel.addEventListener('change', () => { loadTpl(); refresh(); });
    tpl.addEventListener('input', refresh);
    loadTpl();
    body.appendChild(card('✉️ គំរូសារ (ចម្លងទៅ Telegram/SMS)',
      rowEl(lab('បុគ្គលិក ', pick.el)),
      rowEl(lab('គំរូ ', tsel)),
      h('details', { class: 'hrt-d' }, h('summary', { text: 'កែគំរូ (អថេរ៖ {name} {position} {dept} {years} {startDate} {company} {today} {username})' }), tpl,
        rowEl(btn('💾 រក្សាទុកគំរូនេះ', () => { lsSet('hrt_tpl_' + cur().id, tpl.value); say('✓ បានរក្សាទុកគំរូ'); }),
          btn('↩ ត្រឡប់ទៅដើម', () => { lsSet('hrt_tpl_' + cur().id, ''); loadTpl(); refresh(); }))),
      out,
      rowEl(btn('📋 ចម្លងសារ', async () => { try { await navigator.clipboard.writeText(out.value); await say('✓ បានចម្លងរួច'); } catch (_) { out.select(); await say('ចម្លងមិនបាន — សូមចម្លងដោយដៃ (Ctrl+C)'); } }, ''), tel, tg)));
    refresh();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ ឡើងប្រាក់ខែ (មើលជាមុន + អនុវត្ត) ----
  const raiseState = { dept: '', mode: 'pct', value: '5', minYears: '0', round: '1' };
  const LS_RAISE = 'hrt_last_raise';
  let raiseApplied = null; // លទ្ធផលនៃការអនុវត្តដែលទើបធ្វើ (បង្ហាញជំនួសតារាងមើលជាមុន)
  const stampNow = () => { const d = new Date(); return `${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}-${z2(d.getHours())}${z2(d.getMinutes())}`; };
  const auditSafe = (action, e, oldV, newV) => {
    if (typeof logAudit !== 'function') return;
    try { logAudit(action, { entity: 'employee', ref: e.id, employeeId: e.id, old: { field: 'salary', value: oldV }, new: { field: 'salary', value: newV } }); } catch (_) { /* ignore */ }
  };
  const refreshApp = () => { if (typeof renderAll === 'function') { try { renderAll(); } catch (_) { /* ignore */ } } };

  // រក្សាទុកប្រាក់ខែថ្មីម្នាក់ម្តងៗ តាម upsertEmployee របស់កម្មវិធី (ដូចការកែក្នុងទម្រង់បុគ្គលិក)
  async function applyRaise(rows, onProgress) {
    if (typeof upsertEmployee !== 'function') throw new Error('មិនឃើញមុខងារ upsertEmployee ក្នុង script.js');
    const ok = [], fail = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], e = r.e, prev = e.salary;
      onProgress(`កំពុងរក្សាទុក ${i + 1}/${rows.length} — ${e.name}`);
      e.salary = r.nw;
      let saved = false;
      try { saved = await upsertEmployee(e); } catch (_) { saved = false; }
      if (!saved) { e.salary = prev; fail.push(r); continue; }
      ok.push({ id: e.id, name: e.name, old: r.old, nw: r.nw });
      auditSafe('salary_raise', e, r.old, r.nw);
    }
    refreshApp();
    return { ok, fail };
  }

  // ត្រឡប់វិញ៖ ស្ដារតែអ្នកដែលប្រាក់ខែនៅតែស្មើតម្លៃថ្មី (មិនជាន់ការកែក្រោយមក)
  async function undoRaise(rec) {
    if (typeof upsertEmployee !== 'function') throw new Error('មិនឃើញមុខងារ upsertEmployee ក្នុង script.js');
    const byId = new Map(emps().map(e => [String(e.id), e]));
    const ok = [], skipped = [], fail = [];
    for (const x of rec.rows) {
      const e = byId.get(String(x.id));
      if (!e || Math.abs(Number(e.salary) - x.nw) > 0.0001) { skipped.push(x); continue; }
      const prev = e.salary;
      e.salary = x.old;
      let saved = false;
      try { saved = await upsertEmployee(e); } catch (_) { saved = false; }
      if (!saved) { e.salary = prev; fail.push(x); continue; }
      ok.push(x);
      auditSafe('salary_raise_undo', e, x.nw, x.old);
    }
    refreshApp();
    return { ok, skipped, fail };
  }

  function paneRaise(body) {
    const out = h('div');
    const prog = h('p', { class: 'hrt-muted', text: '' });
    let busy = false;
    const calc = () => computeRaise(emps(), raiseState);

    const undoBlock = () => {
      const last = getJson(LS_RAISE, null);
      if (!last || !Array.isArray(last.rows) || !last.rows.length) return null;
      const when = last.when ? new Date(last.when).toLocaleString() : '';
      return rowEl(btn(`↩ ត្រឡប់ការឡើងប្រាក់ខែចុងក្រោយ (${last.rows.length} នាក់ · ${when})`, async () => {
        if (busy) return;
        if (!(await ask(`ត្រឡប់ប្រាក់ខែ ${last.rows.length} នាក់ ទៅតម្លៃមុនការឡើង?\n(អ្នកដែលប្រាក់ខែត្រូវបានកែក្រោយមក នឹងមិនត្រូវបានប៉ះពាល់ទេ)`))) return;
        busy = true;
        try {
          const res = await undoRaise(last);
          if (!res.fail.length) lsSet(LS_RAISE, '');
          raiseApplied = null;
          await say(`✓ បានស្ដារ ${res.ok.length} នាក់` + (res.skipped.length ? `\nរំលង ${res.skipped.length} នាក់ (ប្រាក់ខែត្រូវបានកែក្រោយមក ឬលុបបុគ្គលិករួច)` : '') + (res.fail.length ? `\n⚠ រក្សាទុកមិនបាន ${res.fail.length} នាក់` : ''));
        } catch (ex) { await say('ត្រឡប់មិនបាន៖ ' + (ex.message || ex)); }
        finally { busy = false; renderOut(); }
      }, 'danger'));
    };

    const renderOut = () => {
      out.textContent = '';
      if (raiseApplied) {
        const A = raiseApplied;
        out.appendChild(card(`✅ បានអនុវត្តរួច — ${A.ok.length} នាក់`,
          A.ok.length ? mkTable(['ឈ្មោះ', 'ចាស់ ($)', 'ថ្មី ($)', 'ឡើង ($)'], A.ok.map(x => [x.name, money(x.old), money(x.nw), (x.nw - x.old >= 0 ? '+' : '') + money(x.nw - x.old)])) : empty('គ្មាន'),
          A.fail.length ? h('p', { class: 'hrt-badge late', text: `⚠ រក្សាទុកមិនបាន ${A.fail.length} នាក់៖ ${A.fail.map(x => x.e.name).join(', ')}` }) : null,
          rowEl(btn('🔄 គណនីថ្មី', () => { raiseApplied = null; renderOut(); }, ''))));
        const u = undoBlock(); if (u) out.appendChild(u);
        return;
      }
      const r = calc();
      if (!r.n) { out.appendChild(empty('គ្មានបុគ្គលិកត្រូវតាមលក្ខខណ្ឌ (ឬមិនទាន់មានប្រាក់ខែ)')); const u0 = undoBlock(); if (u0) out.appendChild(u0); return; }
      out.appendChild(h('div', { class: 'hrt-grid' },
        statEl(String(r.n), 'បុគ្គលិកដែលរងផលប៉ះពាល់'), statEl('$' + money(r.oldSum), 'ប្រាក់ខែសរុបបច្ចុប្បន្ន'),
        statEl('$' + money(r.newSum), 'ប្រាក់ខែសរុបថ្មី'), statEl((r.diff >= 0 ? '+' : '') + '$' + money(r.diff), 'ចំណាយបន្ថែមក្នុងមួយខែ'), statEl((r.diff >= 0 ? '+' : '') + '$' + money(r.diff * 12), 'ចំណាយបន្ថែមក្នុងមួយឆ្នាំ')));
      const rows = r.rows.slice().sort((a, b) => String(a.e.name).localeCompare(String(b.e.name)));
      out.appendChild(mkTable(['ឈ្មោះ', 'ផ្នែក', 'ឆ្នាំការងារ', 'ប្រាក់ខែចាស់ ($)', 'ប្រាក់ខែថ្មី ($)', 'ឡើង ($)'],
        rows.map(x => [x.e.name, x.e.dept || '-', x.years.toFixed(1), money(x.old), money(x.nw), (x.diff >= 0 ? '+' : '') + money(x.diff)])));
      out.appendChild(rowEl(
        btn('⬇ CSV', () => download('salary-simulation.csv', toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ប្រាក់ខែចាស់', 'ប្រាក់ខែថ្មី', 'ឡើង']].concat(rows.map(x => [x.e.username || x.e.id, x.e.name, x.e.dept || '', x.old, x.nw, x.diff]))), 'text/csv;charset=utf-8')),
        btn('✅ អនុវត្តការឡើងប្រាក់ខែ', async () => {
          if (busy) return;
          const todo = rows.filter(x => x.nw > 0 && Math.abs(x.diff) > 0.0001);
          if (!todo.length) { await say('គ្មានអ្វីត្រូវអនុវត្ត (ប្រាក់ខែថ្មីដូចចាស់ ឬ ≤ 0)'); return; }
          const sumDiff = todo.reduce((a, x) => a + x.diff, 0);
          const neg = todo.filter(x => x.diff < 0).length, big = todo.filter(x => x.old > 0 && x.diff / x.old > 0.5).length;
          const msg = `អនុវត្តការប្តូរប្រាក់ខែមូលដ្ឋាន ${todo.length} នាក់?\n• ចំណាយបន្ថែម ${sumDiff >= 0 ? '+' : ''}$${money(sumDiff)} ក្នុងមួយខែ ($${money(sumDiff * 12)} ក្នុងមួយឆ្នាំ)\n• ប៉ះពាល់ខែដែលមិនទាន់បិទ — ខែដែលបានបិទរួចមិនប្តូរទេ\n• ប្រព័ន្ធនឹងទាញយក CSV នៃប្រាក់ខែចាស់ជាមុន ហើយអាចត្រឡប់វិញបាន`
            + (neg ? `\n⚠ មាន ${neg} នាក់ត្រូវបានកាត់ប្រាក់ខែ` : '') + (big ? `\n⚠ មាន ${big} នាក់ឡើងលើស ៥០%` : '');
          if (!(await ask(msg))) return;
          busy = true;
          try {
            download(`salary-before-${stampNow()}.csv`, toCsv([['អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ប្រាក់ខែចាស់', 'ប្រាក់ខែថ្មី']].concat(todo.map(x => [x.e.username || x.e.id, x.e.name, x.e.dept || '', x.old, x.nw]))), 'text/csv;charset=utf-8');
            const res = await applyRaise(todo, m => { prog.textContent = m; });
            prog.textContent = '';
            if (res.ok.length) lsSet(LS_RAISE, JSON.stringify({ when: new Date().toISOString(), rows: res.ok }));
            raiseApplied = res;
            await say(`✓ បានអនុវត្ត ${res.ok.length} នាក់` + (res.fail.length ? `\n⚠ រក្សាទុកមិនបាន ${res.fail.length} នាក់` : ''));
          } catch (ex) { prog.textContent = ''; await say('អនុវត្តមិនបាន៖ ' + (ex.message || ex)); }
          finally { busy = false; renderOut(); }
        }, '')));
      const u = undoBlock(); if (u) out.appendChild(u);
    };

    const depts = distinct(emps().map(e => e.dept)).sort();
    const selDept = h('select', null, h('option', { value: '', text: 'គ្រប់ផ្នែក' }), depts.map(d => h('option', { value: d, text: d })));
    selDept.value = raiseState.dept;
    const selMode = h('select', null, h('option', { value: 'pct', text: 'ភាគរយ (%)' }), h('option', { value: 'fixed', text: 'ចំនួនថេរ ($)' }));
    selMode.value = raiseState.mode;
    const val = h('input', { type: 'number', step: '0.5', value: raiseState.value, style: 'width:90px' });
    const minY = h('input', { type: 'number', min: '0', step: '0.5', value: raiseState.minYears, style: 'width:80px' });
    const rnd = h('select', null, [['0', 'មិនបង្គត់'], ['1', 'បង្គត់ $1'], ['5', 'បង្គត់ $5'], ['10', 'បង្គត់ $10']].map(x => h('option', { value: x[0], text: x[1] })));
    rnd.value = raiseState.round;
    const bind = (el, key) => el.addEventListener('input', () => { raiseState[key] = el.value; raiseApplied = null; renderOut(); });
    bind(selDept, 'dept'); bind(selMode, 'mode'); bind(val, 'value'); bind(minY, 'minYears'); bind(rnd, 'round');
    selDept.addEventListener('change', () => { raiseState.dept = selDept.value; raiseApplied = null; renderOut(); });
    body.appendChild(card('💹 ឡើងប្រាក់ខែ — មើលជាមុន ហើយអនុវត្តបាន',
      rowEl(lab('ផ្នែក ', selDept), lab('របៀប ', selMode), lab('តម្លៃ ', val), lab('ឆ្នាំការងារអប្បបរមា ', minY), lab('បង្គត់ ', rnd)), out, prog));
    renderOut();
    body.appendChild(h('p', { class: 'hrt-muted', text: 'ការអនុវត្តរក្សាទុកប្រាក់ខែមូលដ្ឋានថ្មីក្នុង Supabase ម្នាក់ម្តងៗ (ដូចការកែក្នុងទម្រង់បុគ្គលិក) ហើយកត់ត្រាក្នុង Audit log។ វាប៉ះពាល់ប្រាក់ខែនៃខែដែលមិនទាន់បិទ — ខែដែលបានបិទរួចរក្សាតម្លៃដើម។ មុនអនុវត្ត ប្រព័ន្ធទាញយក CSV នៃប្រាក់ខែចាស់ ហើយអាចចុច «ត្រឡប់» វិញបាន។' }));
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ កែច្រើន (សរសេរទៅ Supabase) ----
  async function bulkUpdate(targets, patch, what) {
    if (typeof supabaseClient === 'undefined') throw new Error('មិនឃើញការតភ្ជាប់ Supabase');
    const ids = targets.map(e => e.id), done = new Set();
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error } = await supabaseClient.from('employees').update(patch).in('id', chunk);
        if (error) throw new Error(`${error.message} (បានកែរួច ${done.size}/${ids.length})`);
        chunk.forEach(id => done.add(id));
      }
    } finally {
      targets.filter(e => done.has(e.id)).forEach(e => Object.assign(e, patch));
      if (done.size && typeof renderTable === 'function') { try { renderTable(); } catch (_) { /* ignore */ } }
    }
    if (typeof logAudit === 'function') { try { logAudit('bulk_edit', { entity: 'employee', ref: what, new: patch, count: ids.length }); } catch (_) { /* ignore */ } }
  }

  function paneBulk(body) {
    body.appendChild(h('p', { class: 'hrt-badge warn', text: '⚠ មុខងារនៅទីនេះសរសេរទៅ Supabase ពិតប្រាកដ។ ត្រូវមានការបញ្ជាក់មុនធ្វើ ហើយសូមបម្រុងទុកទិន្នន័យជាមុន (ផ្ទាំង «បម្រុងទុក»)។' }));

    const rename = (field, title, noun) => {
      const vals = distinct(emps().map(e => e[field])).sort();
      const sel = h('select', null, vals.map(v => h('option', { value: v, text: `${v} (${emps().filter(e => String(e[field] || '').trim() === v).length})` })));
      const inp = h('input', { type: 'text', placeholder: `${noun}ថ្មី`, style: 'min-width:200px' });
      const go = btn('✅ ប្តូរឈ្មោះ', async () => {
        const old = sel.value, nw = inp.value.trim();
        if (!old) { await say(`មិនមាន${noun}ដើម្បីប្តូរ`); return; }
        if (!nw || nw === old) { await say(`សូមបញ្ចូល${noun}ថ្មី (ខុសពីដើម)`); return; }
        const targets = emps().filter(e => String(e[field] || '').trim() === old);
        const exists = vals.indexOf(nw) >= 0 ? `\n\n(${noun} «${nw}» មានរួចហើយ — នឹងបញ្ចូលរួមគ្នា)` : '';
        if (!(await ask(`ប្តូរ${noun} «${old}» → «${nw}» សម្រាប់ ${targets.length} នាក់ (រួមទាំងអ្នកឈប់បម្រើការ)?${exists}`))) return;
        go.disabled = true;
        try { await bulkUpdate(targets, { [field]: nw }, `${field}:${old}→${nw}`); await say(`✓ បានប្តូរ ${targets.length} នាក់`); renderBody(); }
        catch (ex) { await say('ប្តូរមិនបាន៖ ' + (ex.message || ex)); renderBody(); }
        finally { go.disabled = false; }
      }, '');
      body.appendChild(card(title, rowEl(lab(`${noun}ដើម `, sel), lab('→ ', inp), go)));
    };
    rename('dept', '🏷 ប្តូរឈ្មោះផ្នែក (ទាំងអស់ក្នុងផ្នែកនោះ)', 'ផ្នែក');
    rename('position', '🏷 ប្តូរឈ្មោះមុខងារ (ទាំងអស់ដែលមានមុខងារនោះ)', 'មុខងារ');

    // ជ្រើសច្រើននាក់
    const chosen = new Set();
    const search = h('input', { type: 'text', placeholder: '🔍 ស្វែងរក…', style: 'min-width:160px' });
    const deptSel = h('select', null, h('option', { value: '', text: 'គ្រប់ផ្នែក' }), distinct(emps().map(e => e.dept)).sort().map(d => h('option', { value: d, text: d })));
    const onlyActive = h('input', { type: 'checkbox' });
    const list = h('div', { class: 'wcb-list-like' });
    const count = h('span', { class: 'hrt-muted' });
    const allCb = h('input', { type: 'checkbox' });
    let view = [];
    const draw = () => {
      const s = search.value.trim().toLowerCase();
      view = sortedEmps().filter(e => (!deptSel.value || String(e.dept || '').trim() === deptSel.value) && (!onlyActive.checked || e.status === 'active') && (!s || [e.name, e.username, e.id].some(x => String(x == null ? '' : x).toLowerCase().indexOf(s) >= 0)));
      list.textContent = '';
      view.slice(0, 400).forEach(e => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = chosen.has(e);
        cb.addEventListener('change', () => { if (cb.checked) chosen.add(e); else chosen.delete(e); upd(); });
        list.appendChild(h('label', { class: 'hrt-pick' }, cb, h('span', { text: e.name || e.id }), h('small', { text: `${e.dept || '-'} · ${e.status === 'active' ? 'សកម្ម' : 'ឈប់'}` })));
      });
      if (view.length > 400) list.appendChild(empty(`បង្ហាញ ៤០០ ដំបូងពី ${view.length} — សូមត្រងឲ្យតូចជាងនេះ`));
      upd();
    };
    const upd = () => { count.textContent = `បានជ្រើស ${chosen.size} នាក់`; allCb.checked = view.length > 0 && view.slice(0, 400).every(e => chosen.has(e)); };
    allCb.addEventListener('change', () => { view.slice(0, 400).forEach(e => { if (allCb.checked) chosen.add(e); else chosen.delete(e); }); draw(); });
    [search].forEach(el => el.addEventListener('input', draw));
    deptSel.addEventListener('change', draw); onlyActive.addEventListener('change', draw);

    const run = async (patch, label) => {
      const targets = Array.from(chosen);
      if (!targets.length) { await say('សូមជ្រើសបុគ្គលិកយ៉ាងតិចម្នាក់'); return; }
      if (!(await ask(`${label} សម្រាប់ ${targets.length} នាក់?`))) return;
      try { await bulkUpdate(targets, patch, label); await say(`✓ បានកែ ${targets.length} នាក់`); chosen.clear(); renderBody(); }
      catch (ex) { await say('កែមិនបាន៖ ' + (ex.message || ex)); renderBody(); }
    };
    const stSel = h('select', null, h('option', { value: 'active', text: 'កំពុងបម្រើការ' }), h('option', { value: 'inactive', text: 'ឈប់បម្រើការ' }));
    const newDept = h('input', { type: 'text', placeholder: 'ផ្នែកថ្មី', style: 'min-width:160px' });
    body.appendChild(card('👥 កែបុគ្គលិកដែលបានជ្រើស',
      rowEl(search, deptSel, h('label', null, onlyActive, ' តែកំពុងបម្រើការ'), h('label', null, allCb, ' ជ្រើសទាំងអស់ក្នុងបញ្ជី'), count),
      list,
      rowEl(lab('កំណត់ស្ថានភាព ', stSel), btn('✅ អនុវត្ត', () => run({ status: stSel.value }, `កំណត់ស្ថានភាព → ${stSel.value === 'active' ? 'កំពុងបម្រើការ' : 'ឈប់បម្រើការ'}`), '')),
      rowEl(lab('ប្តូរផ្នែក ', newDept), btn('✅ អនុវត្ត', () => { const nd = newDept.value.trim(); if (!nd) { say('សូមបញ្ចូលឈ្មោះផ្នែកថ្មី'); return; } run({ dept: nd }, `ប្តូរផ្នែក → ${nd}`); }, ''))));
    draw();
  }

  // ------------------------------------------------------------ ផ្ទាំង៖ នាំចេញ ----
  function paneExport(body) {
    const act = h('input', { type: 'checkbox' }); act.checked = true;
    const sal = h('input', { type: 'checkbox' });
    const pool = () => emps().filter(e => !act.checked || e.status === 'active');
    body.appendChild(card('📤 នាំចេញបញ្ជីបុគ្គលិក',
      rowEl(h('label', null, act, ' តែបុគ្គលិកកំពុងបម្រើការ'), h('label', null, sal, ' រួមទាំងប្រាក់ខែ')),
      rowEl(btn('⬇ CSV (បើកក្នុង Excel)', () => {
        const head = ['អត្តលេខ', 'Username', 'ឈ្មោះ', 'មុខងារ', 'ផ្នែក', 'ទូរស័ព្ទ', 'Email', 'ថ្ងៃចូលធ្វើការ', 'ស្ថានភាព'].concat(sal.checked ? ['ប្រាក់ខែ'] : []);
        const rows = pool().map(e => [e.id, e.username, e.name, e.position, e.dept, e.phone, e.email, e.startDate, e.status === 'active' ? 'សកម្ម' : 'ឈប់បម្រើការ'].concat(sal.checked ? [e.salary] : []));
        download(`employees-${ymKey(today0())}.csv`, toCsv([head].concat(rows)), 'text/csv;charset=utf-8');
      }, ''),
        btn('📇 vCard (.vcf) — បញ្ចូលទៅទូរស័ព្ទ', () => {
          const list = pool().filter(e => e.phone);
          if (!list.length) { say('គ្មានបុគ្គលិកដែលមានលេខទូរស័ព្ទ'); return; }
          download('employees.vcf', toVcf(list, lsGet('wc_company', '')), 'text/vcard;charset=utf-8');
        })),
      h('p', { class: 'hrt-muted', text: 'vCard នាំចូលទៅ Contacts លើទូរស័ព្ទ ឬ Google Contacts បាន។ លេខ 0xx ត្រូវបានបំប្លែងជា +855xx។ ឯកសារ CSV មានអក្សរខ្មែរ (UTF-8 BOM) ដូច្នេះបើកក្នុង Excel បានត្រឹមត្រូវ។' })));
  }

  // ------------------------------------------------------------ ទំព័រ «ឧបករណ៍ HR» ----
  const SUBS = [
    ['remind', '🔔 ការរំលឹក', paneReminders],
    ['calendar', '📅 ប្រតិទិន', paneCalendar],
    ['attendance', '📊 វត្តមាន', paneAttendance],
    ['leave', '🌴 ច្បាប់', paneLeave],
    ['quality', '🧹 ពិនិត្យទិន្នន័យ', paneQuality],
    ['stats', '📈 ស្ថិតិ', paneStats],
    ['cert', '📄 លិខិតបញ្ជាក់', paneCert],
    ['tpl', '✉️ គំរូសារ', paneTemplates],
    ['raise', '💹 ឡើងប្រាក់ខែ', paneRaise],
    ['bulk', '🔁 កែច្រើន', paneBulk],
    ['export', '📤 នាំចេញ', paneExport],
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
  }

  function runPalette(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }

  function openPalette() {
    const main = document.getElementById('mainContainer');
    if (!main || main.style.display === 'none') return; // មិនទាន់ចូលគណនី
    if (!pal) {
      pal = h('div', { class: 'hrt-pal' });
      palInput = h('input', { type: 'text', placeholder: '🔎 ស្វែងរកទំព័រ ឬបុគ្គលិក (ឈ្មោះ/អត្តលេខ/ទូរស័ព្ទ/ផ្នែក)…', autocomplete: 'off' });
      palList = h('div', { class: 'hrt-pallist' });
      pal.appendChild(h('div', { class: 'hrt-palbox' }, palInput, palList, h('div', { class: 'hrt-hint', text: '↑ ↓ ជ្រើស · Enter បើក · Esc បិទ' })));
      document.body.appendChild(pal);
      pal.addEventListener('mousedown', e => { if (e.target === pal) closePalette(); });
      palInput.addEventListener('input', () => { palSel = 0; renderPalette(); });
      palInput.addEventListener('keydown', e => {
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
    if (typeof AUDIT_LABELS !== 'undefined' && AUDIT_LABELS && !AUDIT_LABELS.bulk_edit) { try { AUDIT_LABELS.bulk_edit = '🔁 កែបុគ្គលិកច្រើននាក់'; AUDIT_LABELS.salary_raise = '💹 ឡើងប្រាក់ខែ'; AUDIT_LABELS.salary_raise_undo = '↩ ត្រឡប់ការឡើងប្រាក់ខែ'; } catch (_) { /* ignore */ } }
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
  window.hrTools = { computeReminders, computeQuality, computeStats, computeAttendance, computeLeave, computeCalendar, computeRaise, fillTpl, certificateHtml, toCsv, toVcf, khDate, runBackup, openPalette, panes: SUBS.reduce((o, x) => { o[x[0]] = x[2]; return o; }, {}) };
})();
