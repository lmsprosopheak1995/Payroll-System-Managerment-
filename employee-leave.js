/* employee-leave.js
 * ធ្វើឱ្យលេខ "ច្បាប់ប្រចាំឆ្នាំ នៅសល់" ក្នុងផតថលបុគ្គលិក ត្រូវនឹងតារាង Admin (leave-extra.js)
 * ក្បួន៖ ទទួលបាន ១.៥ ថ្ងៃ (កូតា ÷ ១២) ក្នុងមួយខែ ដែល
 *   ① ធ្វើការពេញខែ (ចូលថ្ងៃទី ១ ឬមុន — ចូលក្រោយថ្ងៃទី ១ ខែនោះមិនរាប់)
 *   ② មានវត្តមាន "មកធ្វើការ" ដែលមានម៉ោងចូល (ស្កេន) យ៉ាងហោចណាស់ ១ ថ្ងៃ
 *   ③ គ្មានអវត្តមានដែលមិនបានលើកលែង (លើកលែង៖ ថ្ងៃអាទិត្យ · ថ្ងៃបុណ្យ · ច្បាប់ពេញថ្ងៃដែលបានអនុម័ត)
 *   ④ មិនលើសខែបច្ចុប្បន្ន
 * ដាក់ក្នុង employee.html ក្រោម <script> ធំ ហើយមុន employee-modern.js៖
 *   <script src="employee-leave.js"></script>
 * មិនកែ employee.html ផ្សេងទៀតទេ — លុបបន្ទាត់នេះ ទើបត្រឡប់ទៅក្បួនចាស់។
 */
(function () {
  'use strict';
  if (typeof fetchLeaveBalances !== 'function') { console.warn('employee-leave: fetchLeaveBalances not found'); return; }
  const original = fetchLeaveBalances;
  const r2 = n => Math.round(n * 100) / 100;

  function firstFullMonthKey(startDate) {
    if (!startDate || startDate.length < 10) return '';
    let y = parseInt(startDate.slice(0, 4), 10), m = parseInt(startDate.slice(5, 7), 10);
    const day = parseInt(startDate.slice(8, 10), 10);
    if (isNaN(y) || isNaN(m)) return '';
    if (day > 1) { m += 1; if (m > 12) { m = 1; y += 1; } }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  window.fetchLeaveBalances = async function (year) {
    const bal = await original.apply(this, arguments);   // paid + used + carry ពីក្បួនដើម
    try {
      const emp = currentEmployee;
      if (!emp) return bal;
      const ys = `${year}-01-01`, ye = `${year}-12-31`;
      const [attRes, lvRes] = await Promise.all([
        supabaseClient.from('attendance').select('date,status,checkin').eq('employee_id', emp.id).gte('date', ys).lte('date', ye),
        supabaseClient.from('leave_requests').select('start_date,end_date,reason').eq('employee_id', emp.id).eq('status', 'approved'),
      ]);
      if (attRes.error || lvRes.error) return bal;          // ទាញមិនបាន → ទុកលេខដើម
      const fullDayLeaves = (lvRes.data || []).filter(r => leaveUnitOf(r).unit === 'day');
      const excused = d =>
        new Date(d + 'T00:00:00').getDay() === 0 ||
        (typeof holidays !== 'undefined' && holidays[d] !== undefined) ||
        fullDayLeaves.some(r => r.start_date <= d && d <= r.end_date);

      const worked = new Array(12).fill(false), broken = new Array(12).fill(false);
      (attRes.data || []).forEach(r => {
        const mi = parseInt(r.date.slice(5, 7), 10) - 1;
        if (r.status === 'present' && r.checkin) worked[mi] = true;
        else if (r.status === 'absent' && !excused(r.date)) broken[mi] = true;
      });

      const today = todayStr();
      const curYear = parseInt(today.slice(0, 4), 10), curMonth = parseInt(today.slice(5, 7), 10);
      const lastMonth = year < curYear ? 11 : (year > curYear ? -1 : curMonth - 1);
      const perMonth = (settings.annualQuotaDays || 18) / 12;
      const startKey = firstFullMonthKey(emp.startDate);
      let quota = 0;
      for (let i = 0; i <= lastMonth; i++) {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        if (worked[i] && !broken[i] && (!startKey || key >= startKey)) quota += perMonth;
      }
      quota = r2(quota);
      const carry = bal.annual.carry || 0, used = bal.annual.used || 0;
      return {
        annual: { quota, carry, total: r2(quota + carry), used, remaining: r2(quota + carry - used) },
        paid: bal.paid,
      };
    } catch (err) {
      console.warn('employee-leave: fallback to original', err);
      return bal;
    }
  };
})();
