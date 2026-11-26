/* pay-report.js — របាយការណ៍បើកប្រាក់ខែ៖ លើកទី១ (ថ្ងៃទី២៥) · លើកទី២ (ថ្ងៃទី១០ ខែបន្ទាប់) · ទាំងអស់
   ដាក់ក្នុង index.html ក្រោម <script src="script.js"></script> (ឧ. បន្ទាប់ពី holiday-notice.js)
   - មើលក្នុងអេក្រង់ + ព្រីន + Export Excel (.xls) + Export PDF
   - គណនាពីទិន្នន័យដែលមានស្រាប់ (មិនកែ មិនសរសេរអ្វីទៅ DB) ដូច្នេះមិនប៉ះពាល់ប្រាក់ខែ */
(function () {
  'use strict';

  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const money = n => '$' + fmtUSD2(n);
  const r2 = n => Math.round((n || 0) * 100) / 100;
  const ymd = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  // ថ្ងៃបើកលើកទី២៖ ១០ ខែបន្ទាប់ — បើជាសៅរ៍/អាទិត្យ/ថ្ងៃបុណ្យ ថយក្រោយទៅថ្ងៃធ្វើការមុនគេ (ដូចលើកទី១)
  function secondPayDateOf(month) {
    const [y, m] = month.split('-').map(Number);
    const isOff = dt => dt.getDay() === 0 || dt.getDay() === 6 ||
      (typeof holidays !== 'undefined' && holidays[ymd(dt)] !== undefined && !isSwapHoliday(ymd(dt)));
    const d = new Date(y, m, 10, 12);          // ខែបន្ទាប់ (m គិតពី 1 → index m = ខែបន្ទាប់)
    for (let i = 0; i < 14 && isOff(d); i++) d.setDate(d.getDate() - 1);
    return ymd(d);
  }

  // ---- គណនាទិន្នន័យ ----
  function buildRows(month) {
    return payrollEmployeesForMonth(month)
      .slice()
      .sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''))
      .map(e => {
        const t = summarizeEmpMonth(e, month);
        const snap = typeof getLockedSnapshot === 'function' ? getLockedSnapshot(e.id, month) : null;
        const adv = (snap && snap.advance) || calcAdvanceRow(e, month);
        const pay1 = r2(adv.amount);
        const quitter = e.status === 'inactive';   // ឈប់បម្រើការ → បើកតាមដៃ គិតប្រាក់ទាំងអស់
        // ប្រាក់ខែសុទ្ធ (t.net) ដកទី១រួចហើយ ពេលដល់ថ្ងៃទូទាត់ទី១។ មុនថ្ងៃនោះ → ដកប៉ាន់ស្មាន
        // អ្នកឈប់៖ មិនដកទី១ប៉ាន់ស្មានទេ — បើកទាំងអស់ដែលគាត់ត្រូវទទួល
        const pay2 = r2(quitter ? t.net : (adv.due ? t.net : t.net - pay1));
        return { e, t, adv, pay1, pay2, quitter, total: r2(pay1 + pay2) };
      });
  }

  const MODE_LABEL = { all: 'ទាំងអស់ (ទី១ + ទី២)', '1': 'លើកទី១ (ប្រាក់ខែទី១)', '2': 'លើកទី២ (ប្រាក់ខែសុទ្ធ)' };

  function buildReport(month, mode, q, onlyPaid, showAll) {
    const needle = (q || '').trim().toLowerCase();
    let rows = buildRows(month).filter(r => !needle ||
      ((r.e.name || '') + ' ' + (r.e.username || '') + ' ' + (r.e.dept || '')).toLowerCase().includes(needle));
    if (onlyPaid) {
      if (mode === '1') rows = rows.filter(r => r.pay1 > 0);
      else if (mode === '2') rows = rows.filter(r => r.pay2 > 0);
      else rows = rows.filter(r => r.pay1 > 0 || r.pay2 > 0);
    }
    const d1 = rows.length ? rows[0].adv.dueDate : advanceDateOf(month);
    const d2 = secondPayDateOf(month);
    const showKhr = getPayMode() !== 'usd';
    const endDay = advRules.endDay;
    let headers, body, totals, sigCols = [];
    const sum = k => r2(rows.reduce((s, r) => s + r[k], 0));
    const base = r => [r.e.username || '-', r.e.name || '', r.e.dept || '-'];

    if (mode === '1') {
      headers = ['#', 'អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃបើកប្រាក់', `ថ្ងៃដែលបានធ្វើការ (ទី១–${endDay})`, 'ថ្ងៃត្រូវធ្វើការ', 'ស្ថានភាព', 'ចំនួន ($)'];
      body = rows.map((r, i) => [i + 1, ...base(r), r.adv.dueDate, r.adv.workedDays, r.adv.requiredDays,
        r.adv.eligible ? (r.adv.due ? 'បានបើក' : 'មិនទាន់ដល់ថ្ងៃ') : 'មិនគ្រប់ថ្ងៃ', money(r.pay1)]);
      totals = ['', '', `សរុប ${rows.length} នាក់`, '', '', '', '', '', money(sum('pay1'))];
    } else if (mode === '2') {
      // រៀបជួរតាមលំដាប់ Payslip៖ ឈ្នួល · OT · ប្រាក់បាយ · LeavePay · អត្ថប្រយោជន៍ (Att. Allowance … Maternity) ·
      // TotalPay · TotalPay before Tax · ប្រាក់កាត់ (Loan, UnionFee, Pension, Deduct …) · ប្រាក់ខែសុទ្ធ · ហត្ថលេខា · ស្នាមមេដៃ
      const STD = (typeof PAY_ITEM_NAMES !== 'undefined' && PAY_ITEM_NAMES) || { benefit: [], deduction: [] };
      const norm = x => String(x || '').toLowerCase().replace(/\s+/g, '');
      const canon = (type, name) => {
        const list = STD[type === 'benefit' ? 'benefit' : 'deduction'] || [];
        const k = norm(name);
        const hit = list.find(([km, en]) => norm(km) === k || norm(en) === k);
        return hit ? hit[0] : null;     // ឈ្មោះខ្មែរក្នុងបញ្ជីស្តង់ដារ ឬ null បើជាឈ្មោះផ្ទាល់ខ្លួន
      };
      const isAdv = p => p.virtual || /^(auto_)?adv_/.test(String(p.id || '')) || canon('deduction', p.name) === 'ប្រាក់ខែទី១';
      const rate0 = (typeof settings !== 'undefined' && settings.exchangeRate) || 0;
      const calc = rows.map(r => {
        const earn = r2(r.t.total), ben = r2(r.t.benefitsUSD);
        const rate = r.t.exchangeRate || rate0 || 1;
        const eWork = r2(r.t.workPay != null ? r.t.workPay : r.t.normalPay), eLeave = r2(r.t.leavePay), eOt = r2(r.t.otPay);
        const eFood = r2(((r.t.foodRiel || 0) + (r.t.foodOtRiel || 0)) / rate);
        const eOther = r2(earn - (eWork + eLeave + eOt + eFood));
        const advIn = r.adv.due ? r.pay1 : 0;                 // ទី១ ដែលបានដកក្នុង t.deductionsUSD រួច
        const ded = r2(r.t.deductionsUSD - advIn);            // ប្រាក់កាត់ដោយមិនរាប់ទី១
        const sub = (r.adv.due || !r.quitter) ? r.pay1 : 0;   // ទី១ ដែលត្រូវដកចេញពីលើកទី២
        const other = r2(r.pay2 - (earn + ben - ded - sub));  // ធាតុផ្សេងដែលមិនក្នុងជួរខាងលើ (បើមាន)
        const bmap = {}, dmap = {};
        const locked = typeof getLockedSnapshot === 'function' && getLockedSnapshot(r.e.id, month);
        if (!locked && typeof getPayrollItemsForEmpMonth === 'function') {
          getPayrollItemsForEmpMonth(r.e.id, month).forEach(p => {
            if (isAdv(p)) return;
            const m = p.type === 'benefit' ? bmap : (p.type === 'deduction' ? dmap : null);
            if (!m) return;
            const n = canon(p.type, p.name) || (String(p.name || 'ផ្សេងៗ').trim() || 'ផ្សេងៗ');
            m[n] = r2((m[n] || 0) + payrollItemToUSD(p));
          });
        }
        const sumOf = m => Object.values(m).reduce((a, b) => a + b, 0);
        const total = r2(earn + ben);                          // TotalPay
        return { r, earn, eWork, eLeave, eOt, eFood, eOther, ben, ded, other, bmap, dmap, total, beforeTax: r2(total - eFood),
          benOther: r2(ben - sumOf(bmap)), dedOther: r2(ded - sumOf(dmap)) };
      });
      // ជួរអត្ថប្រយោជន៍/ប្រាក់កាត់៖ ធាតុស្តង់ដារតាមលំដាប់ Payslip មុន រួចទើបធាតុផ្ទាល់ខ្លួន
      const cols = (type, key, showAllStd) => {
        const std = (STD[type] || []).filter(([km, en]) => !(type === 'deduction' && km === 'ប្រាក់ខែទី១'));
        const tot = {};
        calc.forEach(c => Object.entries(c[key]).forEach(([n, v]) => { tot[n] = (tot[n] || 0) + v; }));
        const stdCols = std.filter(([km]) => showAllStd || Math.abs(tot[km] || 0) > 0.004).map(([km, en]) => ({ key: km, label: `${km} ${en}` }));
        const stdKeys = new Set(std.map(x => x[0]));
        const custom = Object.keys(tot).filter(n => !stdKeys.has(n)).sort((a, b) => tot[b] - tot[a]).map(n => ({ key: n, label: n }));
        return stdCols.concat(custom);
      };
      const bCols = cols('benefit', 'bmap', showAll), dCols = cols('deduction', 'dmap', showAll);
      const hasBenOther = calc.some(c => Math.abs(c.benOther) > 0.01);
      const hasDedOther = calc.some(c => Math.abs(c.dedOther) > 0.01);
      const hasOther = calc.some(c => Math.abs(c.other) > 0.01);
      const hasNote = calc.some(c => c.r.quitter);
      const hasLeave = showAll || calc.some(c => Math.abs(c.eLeave) > 0.004);
      const hasEOther = calc.some(c => Math.abs(c.eOther) > 0.01);
      const dash = v => (Math.abs(v) > 0.004 ? money(v) : '-');
      const riel = v => (rate0 ? fmtRiel(Math.round(v * rate0)) + ' ៛' : '-');
      headers = ['#', 'អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃបើកប្រាក់', 'ឈ្នួល ($)', 'OT ($)', 'ប្រាក់បាយ ($)']
        .concat(hasLeave ? ['ច្បាប់ LeavePay ($)'] : [], hasEOther ? ['ផ្សេងៗ ($)'] : [], ['តាមវត្តមានសរុប ($)'],
          bCols.map(c => `+ ${c.label} ($)`), hasBenOther ? ['+ អត្ថប្រយោជន៍ផ្សេងៗ ($)'] : [], ['+ អត្ថប្រយោជន៍សរុប ($)'],
          ['ប្រាក់សរុប TotalPay ($)', 'TotalPay before Tax ($)'], showKhr ? ['ឬ TotalPay (បើកជារៀល)'] : [],
          dCols.map(c => `− ${c.label} ($)`), hasDedOther ? ['− ប្រាក់កាត់ផ្សេងៗ ($)'] : [], ['− ប្រាក់កាត់សរុប ($)'],
          hasOther ? ['± ផ្សេងៗ ($)'] : [], ['ប្រាក់ខែសុទ្ធ លើកទី២ ($)'], showKhr ? ['ប្រាក់ខែសុទ្ធ (បើកជាប្រាក់)'] : [],
          hasNote ? ['កំណត់ចំណាំ'] : [], ['ហត្ថលេខា', 'ស្នាមមេដៃ']);
      body = calc.map((c, i) => [i + 1, ...base(c.r), c.r.quitter ? 'តាមដៃ' : d2, dash(c.eWork), dash(c.eOt), dash(c.eFood)]
        .concat(hasLeave ? [dash(c.eLeave)] : [], hasEOther ? [dash(c.eOther)] : [], [money(c.earn)],
          bCols.map(x => dash(c.bmap[x.key] || 0)), hasBenOther ? [dash(c.benOther)] : [], [dash(c.ben)],
          [money(c.total), money(c.beforeTax)], showKhr ? [riel(c.total)] : [],
          dCols.map(x => dash(c.dmap[x.key] || 0)), hasDedOther ? [dash(c.dedOther)] : [], [dash(c.ded)],
          hasOther ? [dash(c.other)] : [], [money(c.r.pay2)], showKhr ? [fmtNetByMode(c.r.pay2)] : [],
          hasNote ? [c.r.quitter ? 'ឈប់បម្រើការ · បើកតាមដៃ គិតប្រាក់ទាំងអស់' : ''] : [], ['', '']));
      const sm = f => r2(calc.reduce((s, c) => s + f(c), 0));
      totals = ['', '', `សរុប ${rows.length} នាក់`, '', '', money(sm(c => c.eWork)), money(sm(c => c.eOt)), money(sm(c => c.eFood))]
        .concat(hasLeave ? [money(sm(c => c.eLeave))] : [], hasEOther ? [money(sm(c => c.eOther))] : [], [money(sm(c => c.earn))],
          bCols.map(x => money(sm(c => c.bmap[x.key] || 0))), hasBenOther ? [money(sm(c => c.benOther))] : [], [money(sm(c => c.ben))],
          [money(sm(c => c.total)), money(sm(c => c.beforeTax))], showKhr ? [riel(sm(c => c.total))] : [],
          dCols.map(x => money(sm(c => c.dmap[x.key] || 0))), hasDedOther ? [money(sm(c => c.dedOther))] : [], [money(sm(c => c.ded))],
          hasOther ? [money(sm(c => c.other))] : [], [money(sum('pay2'))], showKhr ? [fmtNetByMode(sum('pay2'))] : [],
          hasNote ? [''] : [], ['', '']);
      sigCols = [headers.length - 2, headers.length - 1];
    } else {
      headers = ['#', 'អត្តលេខ', 'ឈ្មោះ', 'ផ្នែក', 'ថ្ងៃបើកប្រាក់ទី១', 'ចំនួនទី១ ($)', 'ថ្ងៃបើកប្រាក់ទី២', 'ចំនួនទី២ ($)', 'សរុប ($)'];
      body = rows.map((r, i) => [i + 1, ...base(r), r.adv.dueDate, money(r.pay1), d2, money(r.pay2), money(r.total)]);
      totals = ['', '', `សរុប ${rows.length} នាក់`, '', '', money(sum('pay1')), '', money(sum('pay2')), money(sum('total'))];
    }
    const note = mode === '1' ? `ថ្ងៃបើក ${d1}` : mode === '2' ? `ថ្ងៃបើក ${d2}` : `ទី១ ${d1} · ទី២ ${d2}`;
    const foot = mode === '2'
      ? 'ចំណាំ៖ ប្រាក់ខែលើកទី២ គិតរួចដកប្រាក់ខែទី១ ដែលបានបើកដាច់ដោយឡែករួចហើយ (មើលក្នុងរបាយការណ៍ «លើកទី១»)។ អ្នកដែលឈប់បម្រើការ ត្រូវបើកតាមដៃ ហើយគិតប្រាក់ទាំងអស់ដែលគាត់ត្រូវទទួល (មិនដកប្រាក់ខែទី១ ប៉ាន់ស្មាន)។ អ្នកទទួលប្រាក់ត្រូវចុះហត្ថលេខា ឬផ្តិតស្នាមមេដៃ។'
      : '';
    return { title: `របាយការណ៍បើកប្រាក់ខែ — ខែ ${month}`, sub: `${MODE_LABEL[mode]} · ${note}`, foot, headers, body, totals, rows, sigCols };
  }

  function tableHtml(rep, forFile) {
    const th = 'style="border:1px solid #cbd5e1;padding:6px 8px;background:#e2e8f0;font-weight:700;text-align:center;white-space:nowrap;"';
    const td = 'style="border:1px solid #cbd5e1;padding:5px 8px;"';
    const sig0 = rep.sigCols && rep.sigCols.length, isSig = i => sig0 && rep.sigCols.includes(i);
    const num = i => (/\(\$\)|ចំនួន|\(បើកជាប្រាក់\)/.test(rep.headers[i]) ? ' text-align:right;' : '');
    return `<table style="border-collapse:collapse;width:100%;font-size:12px;">
      <thead><tr>${rep.headers.map(h => `<th ${th}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rep.body.map(r => `<tr${sig0 ? ' style="height:40px;"' : ''}>${r.map((c, i) => `<td style="border:1px solid #cbd5e1;padding:5px 8px;${num(i)}${isSig(i) ? 'min-width:90px;' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
      <tr>${rep.totals.map((c, i) => `<td style="border:1px solid #94a3b8;padding:6px 8px;font-weight:700;background:#f1f5f9;${num(i)}">${esc(c)}</td>`).join('')}</tr></tbody></table>`;
  }

  function docHtml(rep) {
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    return `<div style="font-family:${font};color:#111827;background:#fff;padding:16px;">
      <h2 style="margin:0 0 4px;font-size:18px;">${esc(rep.title)}</h2>
      <div style="margin:0 0 10px;font-size:12px;color:#475569;">${esc(rep.sub)} · បោះពុម្ពថ្ងៃ ${esc(todayStr())}</div>
      ${tableHtml(rep)}
      ${rep.foot ? `<div style="margin-top:8px;font-size:11px;color:#475569;">${esc(rep.foot)}</div>` : ''}</div>`;
  }

  // ---- Print ----
  function printReport(rep) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.title)}</title>
      <style>@page{size:A4 landscape;margin:10mm}body{margin:0}tr{page-break-inside:avoid}thead{display:table-header-group}</style></head>
      <body>${docHtml(rep)}</body></html>`);
    d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 400);
  }

  // ---- Excel (.xls — HTML table, Excel បើកបាន) ----
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportExcel(rep, month, mode) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="utf-8"></head><body>
      <h3>${esc(rep.title)}</h3><div>${esc(rep.sub)}</div>${tableHtml(rep, true)}<div>${esc(rep.foot || '')}</div></body></html>`;
    download(new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `pay-report_${month}_${mode === 'all' ? 'all' : 'p' + mode}.xls`);
  }

  // ---- PDF (html2canvas + jsPDF ដូច Payslip) ----
  async function exportPdf(rep, month, mode, btn) {
    if (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) { customAlert('មិនអាចបង្កើត PDF បានទេ (ខ្វះ library) — សូមប្រើ «ព្រីន» រួចជ្រើស Save as PDF'); return; }
    const old = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'កំពុងបង្កើត...'; }
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;background:#fff;';
    holder.innerHTML = docHtml(rep);
    document.body.appendChild(holder);
    try {
      const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff' });
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth() - 10, ph = pdf.internal.pageSize.getHeight() - 10;
      const pxPerPage = Math.floor(ph * canvas.width / pw);
      for (let y = 0, page = 0; y < canvas.height; y += pxPerPage, page++) {
        const h = Math.min(pxPerPage, canvas.height - y);
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = h;
        c.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 5, 5, pw, h * pw / canvas.width);
      }
      pdf.save(`pay-report_${month}_${mode === 'all' ? 'all' : 'p' + mode}.pdf`);
    } catch (e) {
      console.error(e); customAlert('បង្កើត PDF មិនបានជោគជ័យ');
    } finally {
      holder.remove();
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  // ---- Modal ----
  function openModal() {
    if (typeof payrollEmployeesForMonth !== 'function' || typeof calcAdvanceRow !== 'function') { customAlert('មិនអាចបើករបាយការណ៍បានទេ'); return; }
    document.getElementById('payReportModal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'payReportModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;';
    const field = 'padding:7px 10px;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--card-bg,#fff);color:inherit;font:inherit;';
    wrap.innerHTML = `
      <div style="background:var(--card-bg,#fff);color:var(--text,#111827);border-radius:14px;width:min(1100px,100%);padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
          <strong style="font-size:1.05rem;">📑 របាយការណ៍បើកប្រាក់ខែ</strong>
          <button type="button" class="secondary" id="prClose">✕ បិទ</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
          <input type="month" id="prMonth" style="${field}">
          <select id="prMode" style="${field}">
            <option value="all">ទាំងអស់ (ទី១ + ទី២)</option>
            <option value="1">លើកទី១ (ប្រាក់ខែទី១)</option>
            <option value="2">លើកទី២ (ប្រាក់ខែសុទ្ធ)</option>
          </select>
          <input type="search" id="prSearch" placeholder="ស្វែងរកឈ្មោះ/អត្តលេខ/ផ្នែក" style="${field}">
          <label style="font-size:.8rem;display:flex;gap:4px;align-items:center;"><input type="checkbox" id="prOnlyPaid" checked> បង្ហាញតែអ្នកដែលមានប្រាក់បើក</label>
          <label style="font-size:.8rem;display:flex;gap:4px;align-items:center;" title="លើកទី២៖ បង្ហាញគ្រប់ជួរតាម Payslip ទោះទទេ"><input type="checkbox" id="prShowAll"> ជួរគ្រប់ប្រភេទ (ដូច Payslip)</label>
          <span style="flex:1"></span>
          <button type="button" class="secondary" id="prPrint">🖨 ព្រីន</button>
          <button type="button" class="secondary" id="prXls">📊 Excel</button>
          <button type="button" class="secondary" id="prPdf">⬇ PDF</button>
        </div>
        <div id="prInfo" style="font-size:.78rem;color:var(--text-muted,#64748b);margin-bottom:8px;"></div>
        <div id="prBody" style="overflow:auto;max-height:65vh;background:#fff;color:#111827;border-radius:8px;"></div>
      </div>`;
    document.body.appendChild(wrap);
    const $ = id => wrap.querySelector('#' + id);
    $('prMonth').value = (typeof currentMonthlyMonth === 'function' ? currentMonthlyMonth() : todayStr().slice(0, 7));

    let rep = null;
    const render = () => {
      const month = $('prMonth').value, mode = $('prMode').value;
      if (!month) return;
      rep = buildReport(month, mode, $('prSearch').value, $('prOnlyPaid').checked, $('prShowAll').checked);
      $('prInfo').textContent = rep.sub + ' · គណនាពីវត្តមាន និងច្បាប់ទី១ ដែលមានក្នុងប្រព័ន្ធ (មិនមែនកំណត់ត្រាបើកផ្ទាល់ពីធនាគារទេ)';
      $('prBody').innerHTML = rep.rows.length ? `<div style="padding:8px;">${tableHtml(rep)}${rep.foot ? `<div style="margin-top:8px;font-size:11px;color:#475569;">${esc(rep.foot)}</div>` : ''}</div>` : '<div style="padding:24px;text-align:center;color:#64748b;">មិនមានទិន្នន័យ</div>';
    };
    ['prMonth', 'prMode', 'prOnlyPaid', 'prShowAll'].forEach(id => $(id).addEventListener('change', render));
    $('prSearch').addEventListener('input', render);
    $('prClose').onclick = () => wrap.remove();
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap.remove(); });
    const guard = fn => () => { if (!rep || !rep.rows.length) { customAlert('មិនមានទិន្នន័យ'); return; } fn(); };
    $('prPrint').onclick = guard(() => printReport(rep));
    $('prXls').onclick = guard(() => exportExcel(rep, $('prMonth').value, $('prMode').value));
    $('prPdf').onclick = guard(() => exportPdf(rep, $('prMonth').value, $('prMode').value, $('prPdf')));
    render();
  }

  // ---- ប៊ូតុងក្នុងផ្ទាំង «ប្រាក់ខែប្រចាំខែ» ----
  function addButton() {
    if (document.getElementById('payReportBtn')) return;
    const anchor = document.getElementById('monthlyCsvBtn');
    if (!anchor) return;
    const b = document.createElement('button');
    b.id = 'payReportBtn'; b.type = 'button'; b.className = 'secondary';
    b.textContent = '📑 របាយការណ៍បើកប្រាក់';
    b.addEventListener('click', openModal);
    anchor.insertAdjacentElement('afterend', b);
  }
  addButton();
  window.openPayReport = openModal;
})();
