/* kv-store.js — កន្លែងរក្សាទុកការកំណត់ទាំងអស់ក្នុង Supabase (តារាង app_kv)
 *
 * ជំនួស localStorage សម្រាប់ work-card.js, hr-tools.js និង finance.js៖ ការកំណត់ (ឈ្មោះក្រុមហ៊ុន ឡូហ្គោ ថ្ងៃកាត
 * គំរូសារ ថវិកា តម្លៃឡើងប្រាក់ខែ ជាដើម) ត្រូវបានរក្សាទុកក្នុង Supabase ដូច្នេះដូចគ្នាគ្រប់ឧបករណ៍ និងគ្រប់អ្នកប្រើ។
 *
 *  • ទាញទិន្នន័យទាំងអស់ម្តងពេលផ្ទុកទំព័រ → អាន (get) ភ្លាមៗពីអង្គចងចាំ
 *  • សរសេរ (set) → ផ្លាស់ប្តូរអង្គចងចាំភ្លាម ហើយ upsert ទៅ Supabase (រង់ចាំ ០.៣ វិនាទី ពេលកំពុងវាយ)
 *  • ផ្ទេរតម្លៃចាស់ពី localStorage (បើមាន) ទៅ Supabase ម្តង ហើយលុបចេញពី localStorage
 *
 * ដំឡើង៖ រត់ app-kv.sql ក្នុង Supabase ហើយដាក់ <script src="kv-store.js"></script> មុន work-card.js ក្នុង index.html
 */
(function () {
  'use strict';

  const TABLE = 'app_kv';
  // key ចាស់ដែលធ្លាប់ទុកក្នុង localStorage (ត្រូវផ្ទេរមក Supabase)
  const LEGACY_KEYS = ['wc_company', 'wc_back_note', 'wc_dept_color', 'wc_opts', 'hrt_prob', 'hrt_cert', 'hrt_raise_form', 'hrt_last_raise', 'fin_budget'];
  const LEGACY_PREFIXES = ['hrt_tpl_'];
  const DEBOUNCE_MS = 300;

  const cache = new Map();   // key → តម្លៃ (jsonb)
  const timers = new Map();  // key → timer រង់ចាំសរសេរ
  const dirty = new Set();   // key ដែលមិនទាន់សរសេរទៅ Supabase (កុំឲ្យការទាញដំបូងសរសេរជាន់)
  const state = { ready: false, error: null };
  let warned = false;
  let readyResolve;
  const readyPromise = new Promise(r => { readyResolve = r; });

  const client = () => (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  const nowIso = () => new Date().toISOString();
  const toText = v => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  // អត្ថបទដែលមើលទៅដូច JSON object/array → រក្សាទុកជា jsonb (អាចអានបានក្នុង Supabase); ក្រៅពីនេះទុកជាអក្សរដូចដើម
  const fromText = t => {
    if (typeof t === 'string' && /^\s*[\[{]/.test(t)) { try { return JSON.parse(t); } catch (_) { /* ទុកជាអក្សរ */ } }
    return t == null ? '' : String(t);
  };
  const warnOnce = msg => {
    console.error('appKV:', msg);
    if (warned) return;
    warned = true;
    try { (typeof customAlert === 'function' ? customAlert : m => window.alert(m))(msg); } catch (_) { /* ignore */ }
  };
  const TABLE_HINT = ' — សូមរត់ app-kv.sql ក្នុង Supabase → SQL Editor ម្តង';

  async function write(key) {
    timers.delete(key);
    const c = client();
    if (!c) return;
    let error = null;
    try {
      ({ error } = await c.from(TABLE).upsert({ key, value: cache.get(key), updated_at: nowIso() }, { onConflict: 'key' }));
    } catch (ex) { error = ex; }
    if (error) { warnOnce('រក្សាទុកការកំណត់ក្នុង Supabase មិនបាន (' + (error.message || error) + ')' + TABLE_HINT); return; }
    if (!timers.has(key)) dirty.delete(key); // បើមិនមានការសរសេរថ្មីចូលជួរ
  }

  function get(key, def) { return cache.has(key) ? toText(cache.get(key)) : def; }

  function set(key, text) {
    cache.set(key, fromText(text));
    dirty.add(key);
    if (timers.has(key)) clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => write(key), DEBOUNCE_MS));
  }

  // ផ្ទេរតម្លៃចាស់ពី localStorage → Supabase ម្តង (មិនសរសេរជាន់តម្លៃដែលមានក្នុង Supabase រួច)
  async function migrateLegacy() {
    const c = client();
    let ls = null;
    try { ls = window.localStorage; } catch (_) { return; }
    if (!c || !ls) return;
    const keys = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (LEGACY_KEYS.indexOf(k) >= 0 || LEGACY_PREFIXES.some(p => k.indexOf(p) === 0))) keys.push(k);
    }
    for (const k of keys) {
      const raw = ls.getItem(k);
      if (!cache.has(k) && raw !== null) {
        const value = fromText(raw);
        let error = null;
        try { ({ error } = await c.from(TABLE).upsert({ key: k, value, updated_at: nowIso() }, { onConflict: 'key' })); } catch (ex) { error = ex; }
        if (error) continue;          // ផ្ទេរមិនបាន → ទុកក្នុង localStorage សិន (កុំបាត់ទិន្នន័យ)
        cache.set(k, value);
      }
      try { ls.removeItem(k); } catch (_) { /* ignore */ }
    }
  }

  async function load() {
    const c = client();
    if (!c) { state.error = new Error('មិនឃើញការតភ្ជាប់ Supabase'); finish(); return; }
    try {
      const { data, error } = await c.from(TABLE).select('key, value');
      if (error) throw error;
      (data || []).forEach(r => { if (!dirty.has(r.key)) cache.set(r.key, r.value); });
      state.error = null;
      await migrateLegacy();
    } catch (ex) {
      state.error = ex;
      console.warn('appKV: ផ្ទុកការកំណត់ពី Supabase មិនបាន —', (ex && ex.message) || ex);
    }
    finish();
  }

  function finish() {
    state.ready = true;
    readyResolve();
    try { window.dispatchEvent(new Event('appkv:ready')); } catch (_) { /* ignore */ }
  }

  window.appKV = {
    get, set,
    reload: load,
    whenReady: () => readyPromise,
    isReady: () => state.ready,
    error: () => state.error
  };
  load();
})();
