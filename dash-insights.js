// ===========================================================================
// Dashboard Insights — បុគ្គលិកមកយឺត/អវត្តមានច្រើន និងសរុបប្រចាំខែ (Admin)
// Module ដាច់ដោយឡែក៖ បន្ថែមកាតថ្មីក្នុង Dashboard ដោយមិនប៉ះកូដ Dashboard ចាស់។ ត្រូវផ្ទុកក្រោយ script.js
// ប្រើ calcDeductionRow() (យឺត/ចេញមុន/ច្បាប់) និង attendance[date][empId].status === 'absent'
// ===========================================================================
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let timer = null;

  function monthValue() {
    const el = $('dashMonth');
    return (el && el.value) || todayStr().slice(0, 7);
  }

  function absentDays(empId, month) {
    let n = 0;
    daysInMonth(month).forEach(d => {
      const rec = attendance[d] && attendance[d][empId];
      if (rec && rec.status === 'absent') n++;
    });
    return n;
  }

  function build() {
    if ($('dashInsights')) return $('dashInsights');
    const anchor = $('dashPending');
    if (!anchor || !anchor.parentNode) return null;
    const box = document.createElement('div');
    box.id = 'dashInsights';
    box.className = 'scan-result-card';
    box.style.marginTop = '14px';
    anchor.parentNode.insertBefore(box, anchor);
    return box;
  }

  function rankTable(title, rows, emptyMsg) {
    const body = rows.length
      ? rows.map((r, i) => `<tr><td>${i + 1}</td><td style="text-align:left;">${escapeHtml(r.name)}</td><td><strong>${r.main}</strong></td><td>${r.sub}</td></tr>`).join('')
      : `<tr><td colspan="4" style="color:var(--text-muted);">${emptyMsg}</td></tr>`;
    return `<div style="flex:1 1 300px;min-width:260px;">
      <h4 style="font-size:0.8rem;margin:0 0 6px;">${title}</h4>
      <div class="table-wrap" style="box-shadow:none;"><table style="min-width:0;">
        <thead><tr><th>#</th><th style="text-align:left;">បុគ្គលិក</th><th>${rows.headMain || ''}</th><th>${rows.headSub || ''}</th></tr></thead>
        <tbody>${body}</tbody></table></div></div>`;
  }

  function render() {
    if (typeof employees === 'undefined' || !employees.length || typeof calcDeductionRow !== 'function') return;
    const box = build();
    if (!box) return;
    const month = monthValue();
    let data;
    try {
      data = employees.filter(e => e.status === 'active').map(e => {
        const d = calcDeductionRow(e, month);
        return { e, late: d.lateDays + d.earlyDays, viol: d.violDays, lateMin: d.lateMinutes + d.earlyMinutes, leave: d.leaveDays, absent: absentDays(e.id, month) };
      });
    } catch (err) { console.warn('dash-insights', err); return; }

    const tot = data.reduce((a, r) => ({ viol: a.viol + r.viol, min: a.min + r.lateMin, abs: a.abs + r.absent, leave: a.leave + r.leave }), { viol: 0, min: 0, abs: 0, leave: 0 });
    const topLate = data.filter(r => r.viol > 0).sort((a, b) => b.viol - a.viol || b.lateMin - a.lateMin).slice(0, 5)
      .map(r => ({ name: r.e.name, main: r.viol + ' ថ្ងៃ', sub: r.lateMin + ' នាទី' }));
    topLate.headMain = 'ថ្ងៃយឺត/ចេញមុន'; topLate.headSub = 'នាទីសរុប';
    const topAbs = data.filter(r => r.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 5)
      .map(r => ({ name: r.e.name, main: r.absent + ' ថ្ងៃ', sub: r.leave ? r.leave + ' ថ្ងៃច្បាប់' : '-' }));
    topAbs.headMain = 'ថ្ងៃអវត្តមាន'; topAbs.headSub = 'ច្បាប់';

    box.innerHTML = `
      <h3 class="sec-title" style="margin-top:0;">📌 ការចូលធ្វើការ · ខែ ${escapeHtml(month)}</h3>
      <div class="attendance-stats" style="margin-bottom:12px;">
        <div class="stat-card"><div class="num">${tot.viol}</div><div class="label">ថ្ងៃយឺត/ចេញមុនសរុប</div></div>
        <div class="stat-card"><div class="num">${tot.min}</div><div class="label">នាទីយឺត/ចេញមុនសរុប</div></div>
        <div class="stat-card"><div class="num">${tot.abs}</div><div class="label">ថ្ងៃអវត្តមានសរុប</div></div>
        <div class="stat-card"><div class="num">${+tot.leave.toFixed(1)}</div><div class="label">ថ្ងៃច្បាប់សរុប</div></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        ${rankTable('⏰ មកយឺត/ចេញមុនច្រើនជាងគេ (ទី ១–៥)', topLate, 'គ្មានអ្នកមកយឺតទេ 🎉')}
        ${rankTable('🚫 អវត្តមានច្រើនជាងគេ (ទី ១–៥)', topAbs, 'គ្មានអ្នកអវត្តមានទេ 🎉')}
      </div>`;
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(render, 200); }

  function init() {
    const dm = $('dashMonth');
    if (dm) dm.addEventListener('change', schedule);
    const stats = $('dashMonthStats');
    if (stats) new MutationObserver(schedule).observe(stats, { childList: true, subtree: true });
    if (typeof showTab === 'function') {
      const orig = showTab;
      window.showTab = function (tab) { orig.apply(this, arguments); if (tab === 'dashboard') schedule(); };
    }
    setTimeout(render, 1500); // ទិន្នន័យផ្ទុកពី Supabase រួច
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
