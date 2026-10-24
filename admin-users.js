/* admin-users.js — គ្រប់គ្រងគណនីអ្នកគ្រប់គ្រងច្រើននាក់ (Setting → 👥 គណនីអ្នកគ្រប់គ្រង)
 *
 * តម្រូវ៖ admin-users.sql ត្រូវបានរត់ក្នុង Supabase ហើយអ្នកត្រូវចូលដោយគណនី Username (មិនមែន session ចាស់)
 * ដំឡើង៖ ក្រោម finance-auth.js ក្នុង index.html →  <script src="admin-users.js"></script>
 */
(function () {
  'use strict';

  const tok = () => { try { return sessionStorage.getItem('app_session_token') || ''; } catch (_) { return ''; } };
  const errKm = e => (typeof window.adminErrKm === 'function' ? window.adminErrKm(e) : String(e));
  const say = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));
  const ask = (m, secret) => (typeof customPrompt === 'function' ? customPrompt(m, !!secret) : Promise.resolve(window.prompt(m)));

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

  async function rpc(name, args) {
    const r = await supabaseClient.rpc(name, args);
    if (r.error) throw new Error(r.error.message || String(r.error));
    return r.data;
  }

  let built = false;

  function build(sess) {
    if (built) return;
    const anchorBtn = document.getElementById('settingPwBtn');
    const anchor = anchorBtn && anchorBtn.closest('.scan-result-card');
    if (!anchor) return;
    built = true;

    const me = sess && sess.user;
    const body = h('div', { id: 'adminUsersBody' });
    const card = h('div', { class: 'scan-result-card', id: 'adminUsersCard', style: 'margin-bottom:14px;' },
      h('h3', { class: 'sec-title', style: 'margin-top:0;', text: '👥 គណនីអ្នកគ្រប់គ្រង' }), body);
    anchor.after(card);

    // ស្លាកឈ្មោះក្នុងក្បាលទំព័រ
    const title = document.querySelector('.app-main header h1');
    if (me && me.username && title && !document.getElementById('adminWhoBadge')) {
      title.appendChild(h('span', { id: 'adminWhoBadge', class: 'fin-badge-mode', text: '👤 ' + (me.full_name || me.username) }));
    }

    if (!me || !me.username) {
      // session ចាស់ (ពាក្យសម្ងាត់តែមួយ) ឬ SQL មិនទាន់រត់
      body.appendChild(h('p', { class: 'scan-hint', text: 'ដើម្បីគ្រប់គ្រងគណនីច្រើននាក់ សូមរត់ admin-users.sql ក្នុង Supabase ហើយចុច «ចាកចេញ» រួចចូលម្តងទៀតដោយ Username + ពាក្យសម្ងាត់។' }));
      return;
    }

    const listBox = h('div', { style: 'overflow-x:auto;' });
    const fUser = h('input', { type: 'text', placeholder: 'Username (a-z 0-9 . _ -)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', style: 'min-width:170px;' });
    const fName = h('input', { type: 'text', placeholder: 'ឈ្មោះពេញ (មិនចាំបាច់)', autocomplete: 'off', style: 'min-width:170px;' });
    const fPw = h('input', { type: 'password', placeholder: 'ពាក្យសម្ងាត់ (≥ ៦ តួ)', autocomplete: 'new-password', style: 'min-width:170px;' });
    const addBtn = h('button', { type: 'button', text: '➕ បន្ថែមអ្នកគ្រប់គ្រង' });
    body.appendChild(listBox);
    body.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;' }, fUser, fName, fPw, addBtn));

    async function refresh() {
      listBox.textContent = 'កំពុងផ្ទុក...';
      try {
        const d = await rpc('list_admin_users', { p_token: tok() });
        if (!d || !d.ok) { listBox.textContent = errKm(d && d.error); return; }
        const tbl = h('table', { style: 'width:100%;border-collapse:collapse;font-size:0.8rem;' });
        const th = t => h('th', { style: 'text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);', text: t });
        tbl.appendChild(h('thead', null, h('tr', null, th('Username'), th('ឈ្មោះ'), th('ស្ថានភាព'), th('ចូលចុងក្រោយ'), th(''))));
        const tb = h('tbody');
        d.users.forEach(u => {
          const isMe = u.id === me.id;
          const td = (...k) => h('td', { style: 'padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:middle;' }, ...k);
          const acts = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
          acts.appendChild(h('button', { class: 'secondary', type: 'button', text: '✏️ ឈ្មោះ', onclick: async () => {
            const n = await ask('ឈ្មោះពេញសម្រាប់ «' + u.username + '»៖', false);
            if (n === null || n === undefined) return;
            try { const r = await rpc('set_admin_user_full_name', { p_token: tok(), p_id: u.id, p_full_name: n });
              if (r && r.ok) {
                refresh();
                const b = document.getElementById('adminWhoBadge');
                if (isMe && b) b.textContent = '👤 ' + (n.trim() || u.username);
              } else say(errKm(r && r.error)); } catch (e) { say('មានបញ្ហា៖ ' + e.message); }
          } }));
          if (!isMe) {
            acts.appendChild(h('button', { class: 'secondary', type: 'button', text: '🔑 ពាក្យសម្ងាត់ថ្មី', onclick: async () => {
              const p = await ask('ពាក្យសម្ងាត់ថ្មីសម្រាប់ «' + u.username + '» (យ៉ាងតិច ៦ តួ)៖', true);
              if (p === null || p === undefined) return;
              try { const r = await rpc('reset_admin_user_password', { p_token: tok(), p_id: u.id, p_new_password: p });
                say(r && r.ok ? 'កំណត់ពាក្យសម្ងាត់ថ្មីជោគជ័យ (គាត់ត្រូវចូលម្តងទៀត)' : errKm(r && r.error)); } catch (e) { say('មានបញ្ហា៖ ' + e.message); }
            } }));
            acts.appendChild(h('button', { class: 'secondary', type: 'button', text: u.active ? '⛔ បិទ' : '✅ បើក', onclick: async () => {
              if (u.active && !confirm('បិទគណនី «' + u.username + '»? គាត់នឹងចេញពីប្រព័ន្ធភ្លាមៗ។')) return;
              try { const r = await rpc('set_admin_user_active', { p_token: tok(), p_id: u.id, p_active: !u.active });
                if (r && r.ok) refresh(); else say(errKm(r && r.error)); } catch (e) { say('មានបញ្ហា៖ ' + e.message); }
            } }));
            acts.appendChild(h('button', { class: 'secondary', type: 'button', text: '🗑 លុប', onclick: async () => {
              if (!confirm('លុបគណនី «' + u.username + '» ជាអចិន្ត្រៃយ៍?')) return;
              try { const r = await rpc('delete_admin_user', { p_token: tok(), p_id: u.id });
                if (r && r.ok) refresh(); else say(errKm(r && r.error)); } catch (e) { say('មានបញ្ហា៖ ' + e.message); }
            } }));
          } else {
            acts.appendChild(h('span', { class: 'scan-hint', text: '(គណនីរបស់អ្នក — ប្រើប៊ូតុង «ប្តូរពាក្យសម្ងាត់»)' }));
          }
          tb.appendChild(h('tr', null,
            td(h('strong', { text: u.username }), isMe ? ' (អ្នក)' : ''),
            td(u.full_name || '—'),
            td(u.active ? '✅ សកម្ម' : '⛔ បិទ'),
            td(u.last_login ? new Date(u.last_login).toLocaleString('en-GB') : '—'),
            td(acts)));
        });
        tbl.appendChild(tb);
        listBox.textContent = '';
        listBox.appendChild(tbl);
      } catch (e) { listBox.textContent = 'មិនអាចផ្ទុកបញ្ជីបានទេ៖ ' + e.message; }
    }

    addBtn.addEventListener('click', async () => {
      const u = fUser.value.trim().toLowerCase(), p = fPw.value;
      if (!u || !p) { say('សូមបំពេញ Username និងពាក្យសម្ងាត់'); return; }
      addBtn.disabled = true;
      try {
        const r = await rpc('create_admin_user', { p_token: tok(), p_username: u, p_password: p, p_full_name: fName.value.trim() });
        if (r && r.ok) { fUser.value = ''; fName.value = ''; fPw.value = ''; await refresh(); say('បន្ថែមអ្នកគ្រប់គ្រង «' + u + '» ជោគជ័យ'); }
        else say(errKm(r && r.error));
      } catch (e) { say('មានបញ្ហា៖ ' + e.message); }
      finally { addBtn.disabled = false; }
    });

    refresh();
  }

  function onSession(sess) { if (sess && sess.role === 'admin') build(sess); }

  function init() {
    if (window.appSession !== undefined) onSession(window.appSession);
    window.addEventListener('app:session', e => onSession(e.detail));
  }
  if (typeof document !== 'undefined') init();
})();
