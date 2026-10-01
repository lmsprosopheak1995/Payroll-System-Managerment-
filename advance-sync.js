/* ==========================================================================
   advance-sync.js — រក្សាទុក "ប្រាក់ខែទី១" ជាធាតុពិតក្នុង payroll_items
   ដើម្បីឱ្យ employee.html ឃើញការកាត់ដូច admin

   ដាក់ឯកសារនេះក្នុង index.html ក្រោម script.js និង payroll-close.js៖
     <script src="advance-sync.js"></script>
   (ត្រូវការ៖ payrollItems, payrollEmployeesForMonth, calcAdvanceRow, advRules,
    upsertPayrollItemRow, deletePayrollItemRow, isMonthLocked, loadFailures, logAudit)
   ========================================================================== */

const advItemId = (empId, month) => `auto_adv_${empId}_${month}`;
let advSyncBusy = false;

/**
 * ធ្វើសមកាលកម្មធាតុ "ប្រាក់ខែទី១" សម្រាប់ខែមួយ៖
 *  - eligible + ដល់ថ្ងៃទូទាត់ → upsert ធាតុ deduction (id ថេរ មិនស្ទួន)
 *  - លែង eligible / amount = 0 → លុបធាតុចាស់
 * return true បើមានការផ្លាស់ប្តូរ (ដើម្បី render ឡើងវិញ)
 */
async function syncAdvanceItems(month) {
  if (advSyncBusy || !month) return false;
  if (typeof isMonthLocked === 'function' && isMonthLocked(month)) return false; // ខែបិទ៖ ប្រើ snapshot
  // ទិន្នន័យទាញមិនគ្រប់ → មើលទៅដូចគ្មាននរណា eligible ហើយនឹងលុបធាតុពិតខុស ដូច្នេះមិនធ្វើអ្វីទាំងអស់
  if (typeof loadFailures !== 'undefined' && Object.keys(loadFailures).length) return false;

  advSyncBusy = true;
  let changed = false;
  try {
    const wanted = new Map(); // id → { emp, a }
    if (advRules.amount > 0) {
      payrollEmployeesForMonth(month).forEach(emp => {
        const a = calcAdvanceRow(emp, month);
        if (a.eligible && a.due && a.amount > 0) wanted.set(advItemId(emp.id, month), { emp, a });
      });
    }

    // 1) បន្ថែម / អាប់ដេត
    for (const [id, { emp, a }] of wanted) {
      const existing = payrollItems.find(p => p.id === id);
      if (existing && Math.abs(existing.amount - a.amount) < 0.00005) continue;
      const item = {
        id, employeeId: emp.id, type: 'deduction',
        name: `ប្រាក់ខែទី១ (បានទទួល ${a.dueDate})`,
        recurrence: 'variable', month, currency: 'USD', amount: a.amount,
      };
      const saved = await upsertPayrollItemRow(item);
      if (!saved) continue; // រក្សាទុកមិនបាន → មិនកែក្នុង memory
      const idx = payrollItems.findIndex(p => p.id === id);
      if (idx !== -1) payrollItems[idx] = item; else payrollItems.push(item);
      changed = true;
      if (typeof logAudit === 'function') {
        logAudit('advance_sync', { entity: 'payroll_item', ref: id, month, employeeId: emp.id,
          old: existing ? { amount: existing.amount } : null, new: { name: item.name, type: 'deduction', currency: 'USD', amount: item.amount } });
      }
    }

    // 2) លុបធាតុដែលលែងត្រូវមាន
    const stale = payrollItems.filter(p => p.id.startsWith('auto_adv_') && p.month === month && !wanted.has(p.id));
    for (const p of stale) {
      const ok = await deletePayrollItemRow(p.id);
      if (!ok) continue;
      payrollItems = payrollItems.filter(x => x.id !== p.id);
      changed = true;
      if (typeof logAudit === 'function') {
        logAudit('advance_sync', { entity: 'payroll_item', ref: p.id, month, employeeId: p.employeeId, old: { amount: p.amount }, new: null, note: 'លែង eligible' });
      }
    }
  } catch (e) {
    console.error('syncAdvanceItems failed', e);
  } finally {
    advSyncBusy = false;
  }
  return changed;
}
