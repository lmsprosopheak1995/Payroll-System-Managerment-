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
  if (!advRulesReady) return false; // ច្បាប់ advRules មិនទាន់ទាញពី Supabase រួច → កុំ sync ដោយតម្លៃចាស់
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

/* ==========================================================================
   advRules ↔ Supabase (app_settings) — ជំនួស localStorage ជាប្រភពពិត
   ត្រូវដំណើរការ advance-rules.sql ក្នុង Supabase ជាមុន (បន្ថែម 3 column)
   ========================================================================== */
let advRulesReady = false;   // true ក្រោយទាញពី Supabase រួច (ឬបានសម្រេចថាប្រើ localStorage)
let advRulesRemote = false;  // true បើ column មានក្នុង Supabase
let advSaveTimer = null, advSyncTimer = null;

function applyAdvRulesToControls() {
  const a = document.getElementById('advAmount'), c = document.getElementById('advCountLeave'), d = document.getElementById('advEndDay');
  if (a) a.value = advRules.amount;
  if (c) c.checked = !!advRules.countLeave;
  if (d) d.value = advRules.endDay;
}

async function saveAdvRulesRemote() {
  if (!advRulesRemote) return false;
  const { error } = await supabaseClient.from('app_settings').update({
    adv_amount: advRules.amount,
    adv_end_day: advRules.endDay,
    adv_count_leave: !!advRules.countLeave,
  }).eq('id', 1);
  if (error) { console.warn('Advance rules save failed', error.message); return false; }
  return true;
}

// ហៅក្នុង checkAdminAuthAndInit() ក្រោយ Promise.all([... loadSettings() ...]) មុន renderAll()
async function loadAdvRulesRemote() {
  try {
    const { data, error } = await supabaseClient.from('app_settings')
      .select('adv_amount, adv_end_day, adv_count_leave').eq('id', 1).maybeSingle();
    if (error) {
      advRulesRemote = false;
      if (/adv_(amount|end_day|count_leave)/.test(error.message)) {
        console.warn('app_settings មិនទាន់មាន column adv_* — សូមដំណើរការ advance-rules.sql');
        if (typeof pcLoadFail === 'function') pcLoadFail('ច្បាប់ប្រាក់ខែទី១', 'column adv_* មិនទាន់មាន'); // មិន sync ដើម្បីកុំប្រើតម្លៃ default ខុស
      } else {
        console.error('Load advance rules failed', error);   // បញ្ហាបណ្តាញ៖ មិនបើក sync ដើម្បីកុំប្រើតម្លៃចាស់
        if (typeof pcLoadFail === 'function') pcLoadFail('ច្បាប់ប្រាក់ខែទី១', error.message);
      }
      return;
    }
    advRulesRemote = true;
    if (data && data.adv_amount != null) {
      Object.assign(advRules, {
        amount: Math.max(0, parseFloat(data.adv_amount) || 0),
        endDay: Math.min(28, Math.max(1, parseInt(data.adv_end_day, 10) || 15)),
        countLeave: data.adv_count_leave === true,
      });
      applyAdvRulesToControls();
    } else {
      await saveAdvRulesRemote();       // ម្តងដំបូង៖ ផ្ញើតម្លៃ default ឡើង Supabase
    }
    advRulesReady = true;
  } catch (e) {
    console.error('loadAdvRulesRemote failed', e);
  }
}

// ហៅពី readAdvControls() ពេល admin កែ (debounce 800ms)
function scheduleAdvRulesSave() {
  clearTimeout(advSaveTimer);
  advSaveTimer = setTimeout(async () => {
    await saveAdvRulesRemote();
    requestAdvanceSync(typeof currentMonthlyMonth === 'function' ? currentMonthlyMonth() : null);
  }, 800);
}

// sync ធាតុប្រាក់ខែទី១ ក្រោយ debounce — កុំឱ្យសរសេរ DB រាល់ការចុចគ្រាប់ចុច
function requestAdvanceSync(month) {
  if (!month) return;
  clearTimeout(advSyncTimer);
  advSyncTimer = setTimeout(async () => {
    const changed = await syncAdvanceItems(month);
    if (changed && typeof renderMonthlyTab === 'function') renderMonthlyTab();
  }, 1200);
}
