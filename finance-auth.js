/* finance-auth.js — ទំព័រចូលគណនី Finance
 *
 * ១) ទំព័រចូល៖ បើកតាម  finance.html  (ឬ  index.html?role=finance) → បង្ហាញប្រអប់ «ចូលគណនី Finance»
 *    ចូលដោយ ឈ្មោះអ្នកប្រើ + ពាក្យសម្ងាត់ (admin បង្កើតគណនីឲ្យម្នាក់ៗ) តាម RPC create_finance_session
 *    Supabase ចេញ session token ហើយរក្សាទុក session ក្នុងតារាង app_sessions (មើល app-sessions.sql)
 * ២) ក្រោយចូល (ទម្រង់ Finance)៖ បង្ហាញតែទំព័រ «💼 Finance» — លាក់ម៉ឺនុយផ្សេង ប៊ូតុងបន្ថែម/កែបុគ្គលិក
 *    ប្តូរពាក្យសម្ងាត់ admin ឧបករណ៍ស្វែងរក (Ctrl+K) ជាដើម។ តួនាទីមកពី session ដែល Supabase ផ្ទៀងផ្ទាត់ (script.js → window.appSession)
 * ៣) សម្រាប់ admin៖ បន្ថែមប៊ូតុង «💼 ទំព័រចូល Finance» ក្នុងក្បាលទំព័រ (នៅក្បែរ «ទំព័រចូលបុគ្គលិក»)
 *    ហើយបង្កើត/គ្រប់គ្រងគណនី Finance នៅ Finance → «🔑 គណនី Finance»
 *
 * ⚠ ការរឹតបន្តឹងនេះគ្រប់គ្រង «ចំណុចប្រទាក់» (UI)។ កម្មវិធីនៅប្រើ anon key ជាមួយ RLS បើកទូលាយ ដូច្នេះវាមិនការពារទិន្នន័យ
 *   ពីអ្នកដែលហៅ Supabase ផ្ទាល់បានទេ (session ការពារតែការចូលកម្មវិធី មិនមែនតារាងទិន្នន័យ)។
 *
 * ដំឡើង៖ ក្រោម finance.js ក្នុង index.html  →  <script src="finance-auth.js"></script>
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'app_session_token'; // ដូចក្នុង script.js (token ចៃដន្យ — session ពិតនៅក្នុង Supabase)
  const ss = {
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } }
  };
  const wantsEntry = () => /(?:^|[?&])role=finance(?:&|$)/.test((typeof location !== 'undefined' && location.search) || '');
  const isRole = () => !!(window.appSession && window.appSession.role === 'finance');

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
    kids.flat().forEach(c => { if (c != null && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return el;
  }

  const CSS = `
body.fin-entry #adminSetupCard, body.fin-entry #adminLoginCard, body.fin-entry #adminGateLoading{display:none !important}
body.fin-mode .sidebar .nav-item:not([data-tab="finance"]), body.fin-mode .sidebar .nav-group,
body.fin-mode #changeAdminPwBtn, body.fin-mode #addBtn, body.fin-mode a[href="employee.html"], body.fin-mode #finLoginLink, body.fin-mode #hrtSearchBtn{display:none !important}
.fin-badge-mode{display:inline-block;margin-left:8px;font-size:.7rem;font-weight:600;padding:2px 10px;border-radius:999px;background:#e6f6f4;color:#0f766e;vertical-align:middle}
`;
  function injectCss() {
    if (document.getElementById('finAuthStyle')) return;
    const st = document.createElement('style'); st.id = 'finAuthStyle'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------ ប្រអប់ចូលគណនី Finance ----
  function buildEntry() {
    const gate = document.getElementById('adminGate');
    if (!gate || document.getElementById('finLoginCard')) return;
    document.body.classList.add('fin-entry');
    const err = h('p', { id: 'finLoginError', style: 'color:var(--danger); font-size:0.75rem; text-align:center; margin:0 0 12px; display:none;' });
    const note = h('p', { style: 'color:var(--text-muted); font-size:0.75rem; text-align:center; margin:0 0 14px;' });
    const user = h('input', { type: 'text', id: 'finLoginUser', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', style: 'width:100%;padding:10px 12px;font-size:0.9rem;' });
    const pw = h('input', { type: 'password', id: 'finLoginPassword', autocomplete: 'current-password', style: 'width:100%;padding:10px 12px;font-size:0.9rem;' });
    const btn = h('button', { id: 'finLoginBtn', type: 'button', style: 'width:100%;padding:11px;font-size:0.9rem;', text: 'ចូលគណនី' });
    const showErr = m => { err.textContent = m; err.style.display = m ? 'block' : 'none'; };

    async function submit() {
      const u = user.value.trim().toLowerCase(), v = pw.value;
      if (!u || !v) { showErr('សូមបំពេញឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់'); return; }
      showErr(''); btn.disabled = true;
      try {
        const { data, error } = await supabaseClient.rpc('create_finance_session', { p_username: u, p_password: v });
        if (error) {
          const m = error.message || '';
          showErr(/too_many_attempts/.test(m) ? 'ព្យាយាមច្រើនពេក — សូមរង់ចាំ ១ នាទី'
            : (error.code === 'PGRST202' || /could not find the function/i.test(m)) ? 'សូមរត់ app-sessions.sql (និង finance-auth.sql) ក្នុង Supabase ជាមុន'
            : 'មានបញ្ហាក្នុងការចូលគណនី៖ ' + m);
          return;
        }
        if (!data || !data.ok || !data.token) { showErr('ឈ្មោះអ្នកប្រើ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ (ឬគណនីត្រូវបានបិទ)'); return; }
        pw.value = '';
        ss.set(TOKEN_KEY, data.token); // ទុកតែ token — តួនាទី/អ្នកប្រើ/ពេលផុតកំណត់ ផ្ទៀងផ្ទាត់ម្តងទៀតពី Supabase ពេលផ្ទុកទំព័រ
        location.reload();
      } catch (ex) { showErr('មានបញ្ហា៖ ' + (ex.message || ex)); }
      finally { btn.disabled = false; }
    }
    btn.addEventListener('click', submit);
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    user.addEventListener('keydown', e => { if (e.key === 'Enter') pw.focus(); });

    gate.appendChild(h('div', { class: 'portal-card', id: 'finLoginCard', style: 'background:var(--card-bg); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow); padding:22px;' },
      h('h1', { style: 'font-size:1.05rem; text-align:center; margin:0 0 4px;', text: '💼 ចូលគណនី Finance' }),
      note, err,
      h('div', { class: 'form-group' }, h('label', { style: 'font-size:0.72rem;color:var(--text-muted);font-weight:600;', text: 'ឈ្មោះអ្នកប្រើ' }), user),
      h('div', { class: 'form-group' }, h('label', { style: 'font-size:0.72rem;color:var(--text-muted);font-weight:600;', text: 'ពាក្យសម្ងាត់' }), pw),
      btn,
      h('p', { style: 'text-align:center; margin:14px 0 0; font-size:0.74rem;' }, h('a', { href: 'index.html', text: '← ចូលជាអ្នកគ្រប់គ្រង', style: 'color:var(--text-muted)' }))));

    // ពិនិត្យថាមានគណនី Finance ហើយឬនៅ
    (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('finance_users_exist');
        if (error) note.textContent = '⚠ មិនអាចពិនិត្យគណនី Finance — សូមរត់ finance-auth.sql និង app-sessions.sql ក្នុង Supabase ជាមុន (' + error.message + ')';
        else if (!data) note.textContent = 'មិនទាន់មានគណនី Finance — សូមឲ្យអ្នកគ្រប់គ្រងបង្កើតក្នុង Finance → «🔑 គណនី Finance»';
      } catch (ex) { note.textContent = '⚠ ' + (ex.message || ex); }
    })();
    setTimeout(() => { try { user.focus(); } catch (_) { /* ignore */ } }, 50);
  }

  // ------------------------------------------------------------ ទម្រង់ Finance (ក្រោយចូល) ----
  let roleApplied = false;
  function applyRole(sess) {
    if (roleApplied) return;
    roleApplied = true;
    document.body.classList.add('fin-mode');
    // ហាមប្តូរទៅទំព័រផ្សេង៖ គ្រប់ការហៅ showTab(...) ទៅ Finance
    const orig = window.showTab;
    if (typeof orig === 'function' && !orig.__finLocked) {
      const locked = function () { return orig.call(this, 'finance'); };
      locked.__finLocked = true;
      window.showTab = locked;
    }
    // ឧបករណ៍ស្វែងរក Ctrl+K របស់ hr-tools៖ បិទ (ចាប់មុនគេក្នុង capture phase)
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.stopImmediatePropagation(); }
    }, true);
    const title = document.querySelector('.app-main header h1');
    if (title && !document.getElementById('finModeBadge')) {
      const u = (sess && sess.user) || {};
      title.appendChild(h('span', { id: 'finModeBadge', class: 'fin-badge-mode', text: 'Finance' + (u.full_name || u.username ? ' · ' + (u.full_name || u.username) : '') }));
    }

    // បើកទំព័រ Finance បន្ទាប់ពីទិន្នន័យទាំងអស់ផ្ទុកចប់ (renderAll ត្រូវបានហៅក្រោយ Promise.all)
    let opened = false;
    const open = () => {
      if (opened) return;
      const nav = document.querySelector('.nav-item[data-tab="finance"]');
      if (!nav) return;
      opened = true;
      nav.click();
    };
    const ra = window.renderAll;
    if (typeof ra === 'function') {
      window.renderAll = function () { const r = ra.apply(this, arguments); setTimeout(open, 0); return r; };
    }
    let tries = 0;
    const t = setInterval(() => { open(); if (opened || ++tries > 60) clearInterval(t); }, 500); // បម្រុង ៣០ វិនាទី
  }

  // ------------------------------------------------------------ admin៖ ប៊ូតុងក្នុងក្បាលទំព័រ ----
  function addHeaderLink() {
    const a = document.querySelector('a[href="employee.html"]');
    if (!a || document.getElementById('finLoginLink')) return;
    const b = a.cloneNode(true);
    b.id = 'finLoginLink'; b.setAttribute('href', 'finance.html'); b.textContent = '💼 ទំព័រចូល Finance';
    a.after(b);
  }

  // ------------------------------------------------------------ តាមតួនាទីពី session ដែល Supabase ផ្ទៀងផ្ទាត់ ----
  function onSession(sess) {
    if (sess && sess.role === 'finance') { document.body.classList.remove('fin-entry'); applyRole(sess); return; }
    if (sess) { document.body.classList.remove('fin-entry'); addHeaderLink(); return; } // admin
    if (wantsEntry()) buildEntry();                                                      // មិនទាន់ចូល + ទំព័រចូល Finance
  }

  function init() {
    injectCss();
    if (wantsEntry()) document.body.classList.add('fin-entry'); // លាក់ប្រអប់ admin ភ្លាមៗ (មុន session ត្រូវបានផ្ទៀងផ្ទាត់)
    if (window.appSession !== undefined) onSession(window.appSession);
    else window.addEventListener('app:session', e => onSession(e.detail));
  }

  if (typeof document !== 'undefined') init();
  window.financeAuth = { isRole };
})();
