/* ==========================================================================
   rules-sync.js — រក្សាទុក "ច្បាប់/ការកំណត់" ក្នុង Supabase ជំនួស localStorage (Admin)
     ① ច្បាប់កាត់លុយ (deductRules)        → app_settings.ded_rules (jsonb)
     ② ច្បាប់បំណាច់ឆ្នាំ (bonusRules)       → app_settings.bonus_rules (jsonb)
     ③ កូតាច្បាប់ប្រចាំឆ្នាំ (lbRules)       → app_settings.annual_* / paid_quota_days
     ④ ចំនួនថ្ងៃទុកឱ្យតវ៉ាពេលបិទខែ         → app_settings.lock_dispute_days
   មិនកែ script.js / payroll-close.js — ជំនួសអនុគមន៍រក្សាទុក ហើយទាញតម្លៃពី Supabase ក្រោយចូល Admin។
   ម្តងដំបូង៖ តម្លៃដែលមានក្នុង browser នេះត្រូវបានផ្ទេរឡើង Supabase រួចលុបចេញពី localStorage។

   ដំឡើង៖ ① ដំណើរការ rules-sync.sql ក្នុង Supabase
           ② index.html ដាក់ភ្លាមៗក្រោម script.js (ត្រូវនៅក្រោមវា ទើបជំនួសអនុគមន៍បាន)៖  <script src="rules-sync.js"></script>
   មិនប៉ះ៖ ai.js (API key ត្រូវនៅលើម៉ាស៊ីននេះដោយចេតនា) · កាលបរិច្ឆេទ Backup ចុងក្រោយ (ក្នុង payroll-close.js)
   ========================================================================== */
(function () {
  'use strict';

  const LEGACY = {
    ded: typeof DEDUCT_RULES_KEY !== 'undefined' ? DEDUCT_RULES_KEY : 'deduct_rules_v1',
    bonus: typeof BONUS_RULES_KEY !== 'undefined' ? BONUS_RULES_KEY : 'bonus_rules_v1',
    lb: typeof LB_RULES_KEY !== 'undefined' ? LB_RULES_KEY : 'leave_balance_rules_v1',
    lock: typeof PC_DAYS_KEY !== 'undefined' ? PC_DAYS_KEY : null,
  };
  const dropLegacy = k => { try { if (LEGACY[k]) localStorage.removeItem(LEGACY[k]); } catch (e) { /* ignore */ } };

  const ready = { ded: false, bonus: false, lb: false, lock: false };
  const timers = {};
  let lockDays = 5;
  let warned = false;

  const nz = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const warnOnce = msg => {
    console.warn('rules-sync:', msg);
    if (warned) return; warned = true;
    if (typeof customAlert === 'function') customAlert('⚠️ ការកំណត់មិនត្រូវបានរក្សាទុកក្នុង Supabase\n' + msg + '\n\nសូមដំណើរការ rules-sync.sql ក្នុង Supabase រួច refresh។ ការកែក្នុងវគ្គនេះនឹងបាត់ពេលបិទកម្មវិធី។');
  };

  // ---------------------------------------------------------------- group definitions ----
  const GROUPS = {
    ded: {
      cols: ['ded_rules'],
      read: () => ({ ded_rules: JSON.parse(JSON.stringify(deductRules)) }),
      has: d => d.ded_rules && typeof d.ded_rules === 'object',
      apply: d => {
        const r = d.ded_rules;
        deductRules.graceMinutes = Math.max(0, nz(r.graceMinutes, deductRules.graceMinutes));
        deductRules.latePerDay = Math.max(0, nz(r.latePerDay, deductRules.latePerDay));
        deductRules.latePerMin = Math.max(0, nz(r.latePerMin, deductRules.latePerMin));
        deductRules.leaveFood = !!r.leaveFood;
        if (Array.isArray(r.leaveTypes)) deductRules.leaveTypes = r.leaveTypes.filter(x => typeof x === 'string');
      },
    },
    bonus: {
      cols: ['bonus_rules'],
      read: () => ({ bonus_rules: JSON.parse(JSON.stringify(bonusRules)) }),
      has: d => d.bonus_rules && typeof d.bonus_rules === 'object',
      apply: d => {
        const r = d.bonus_rules;
        if (['flat', 'years', 'days', 'salary', 'manual'].includes(r.mode)) bonusRules.mode = r.mode;
        bonusRules.flatAmount = Math.max(0, nz(r.flatAmount, bonusRules.flatAmount));
        bonusRules.perYearAmount = Math.max(0, nz(r.perYearAmount, bonusRules.perYearAmount));
        bonusRules.daysPerMonth = Math.max(0, nz(r.daysPerMonth, bonusRules.daysPerMonth));
        bonusRules.minMonths = Math.max(0, nz(r.minMonths, bonusRules.minMonths));
      },
    },
    lb: {
      cols: ['annual_quota_days', 'annual_prorate', 'paid_quota_days', 'annual_carry_enabled', 'annual_carry_max', 'annual_carry_from'],
      read: () => ({
        annual_quota_days: lbRules.annualQuotaDays, annual_prorate: !!lbRules.prorate, paid_quota_days: lbRules.paidQuotaDays,
        annual_carry_enabled: !!lbRules.carryOver, annual_carry_max: lbRules.carryMaxDays, annual_carry_from: lbRules.carryFromYear,
      }),
      has: d => d.annual_quota_days != null,
      apply: d => {
        lbRules.annualQuotaDays = Math.max(0, nz(d.annual_quota_days, lbRules.annualQuotaDays));
        if (d.annual_prorate != null) lbRules.prorate = !!d.annual_prorate;
        lbRules.paidQuotaDays = Math.max(0, nz(d.paid_quota_days, lbRules.paidQuotaDays));
        if (d.annual_carry_enabled != null) lbRules.carryOver = !!d.annual_carry_enabled;
        lbRules.carryMaxDays = Math.max(0, nz(d.annual_carry_max, lbRules.carryMaxDays));
        lbRules.carryFromYear = parseInt(d.annual_carry_from, 10) || lbRules.carryFromYear;
      },
    },
    lock: {
      cols: ['lock_dispute_days'],
      read: () => ({ lock_dispute_days: lockDays }),
      has: d => d.lock_dispute_days != null,
      apply: d => { lockDays = Math.min(60, Math.max(0, parseInt(d.lock_dispute_days, 10) || 0)); },
    },
  };

  // ---------------------------------------------------------------- save (debounced) ----
  async function saveNow(key) {
    if (!ready[key]) { warnOnce('មិនទាន់ទាញការកំណត់ពី Supabase បាន'); return false; }
    try {
      const { data, error } = await supabaseClient.from('app_settings').update(GROUPS[key].read()).eq('id', 1).select('id');
      if (error || !data || !data.length) { warnOnce(error ? error.message : 'រកមិនឃើញ app_settings (id=1)'); return false; }
      return true;
    } catch (e) { warnOnce(String(e && e.message || e)); return false; }
  }
  function schedule(key) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => saveNow(key), 800);
  }

  // ជំនួសអនុគមន៍រក្សាទុកក្នុង localStorage របស់ script.js / payroll-close.js
  window.saveDeductRules = () => schedule('ded');
  window.saveBonusRules = () => schedule('bonus');
  window.saveLbRules = () => { /* scheduleLbSync() ក្នុង script.js រក្សាទុក annual_* ក្នុង Supabase រួចហើយ */ };
  window.loadLockDays = () => lockDays;

  // lockMonth() សរសេរ localStorage ដោយផ្ទាល់ → រុំវា៖ ចាប់យកតម្លៃ រក្សាក្នុង Supabase ហើយលុបចេញពី localStorage
  if (typeof window.lockMonth === 'function') {
    const origLock = window.lockMonth;
    window.lockMonth = async function () {
      const el = document.getElementById('lockDisputeDays');
      const v = el ? Math.min(60, Math.max(0, parseInt(el.value, 10))) : NaN;
      try { return await origLock.apply(this, arguments); }
      finally {
        if (Number.isFinite(v) && v !== lockDays) { lockDays = v; schedule('lock'); }
        dropLegacy('lock');
      }
    };
  }

  // ---------------------------------------------------------------- load ----
  async function loadGroup(key) {
    const g = GROUPS[key];
    const { data, error } = await supabaseClient.from('app_settings').select(g.cols.join(', ')).eq('id', 1).maybeSingle();
    if (error) { warnOnce(`ក្រុម "${key}"៖ ${error.message}`); return false; }
    if (!data) { warnOnce('រកមិនឃើញជួរ app_settings (id=1)'); return false; }
    if (g.has(data)) {
      g.apply(data);
      ready[key] = true;
      dropLegacy(key);
    } else {
      // ម្តងដំបូង៖ ផ្ទេរតម្លៃដែលមានក្នុង browser នេះ (ត្រូវបានផ្ទុកពី localStorage ពេលបើក) ឡើង Supabase
      ready[key] = true;
      if (await saveNow(key)) dropLegacy(key); else ready[key] = false;
    }
    return ready[key];
  }

  function refreshUI() {
    const call = fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn('rules-sync refresh', fn, e); } };
    ['initDeductControls', 'initBonusControls', 'initLbControls', 'renderDeductTab', 'renderBonusTab', 'renderLeaveBalanceTab', 'renderMonthlyTab'].forEach(call);
  }

  async function loadAll() {
    let any = false;
    for (const k of Object.keys(GROUPS)) { if (await loadGroup(k)) any = true; }
    if (any) refreshUI();
  }

  // ចាប់ផ្តើមក្រោយ Admin ចូលរួច (checkAdminAuthAndInit)
  let started = false;
  const poll = setInterval(() => {
    if (started) { clearInterval(poll); return; }
    if (typeof getAdminSession === 'function' && getAdminSession() && typeof supabaseClient !== 'undefined') {
      started = true; clearInterval(poll); loadAll();
    }
  }, 800);

  window.reloadRulesRemote = loadAll;
})();
