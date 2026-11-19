/* ==========================================================================
   employee-login.js — ទំព័រចូលរចនាថ្មី (ឈ្មោះ «SOPHEAK HR» ជំនួស RE core)
   ដាក់ក្នុង employee.html មុន </body> (ក្រោម <script> ចុងក្រោយបង្អស់)៖
     <script src="employee-login.js?v=1"></script>
   មិនកែ logic ចូលដើម (id ទាំងអស់នៅដដែល) — លុបបន្ទាត់នេះចេញ ទើបត្រលប់ទៅរចនាចាស់វិញ
   ========================================================================== */
(function () {
  'use strict';

  const BRAND = 'SOPHEAK';        // ឈ្មោះក្រុមហ៊ុន (អក្សរដិត)
  const SUB = 'HR';               // ពាក្យបន្ទាប់ (អក្សរស្តើង)
  const LOGO_SRC = 'icon/icon-192.png';
  const ADMIN_TG = 'Samross_Ph_Care';            // ← ដាក់ username Telegram របស់ Admin (គ្មាន @) ឧ. 'sopheak_admin'
  const FORGOT_LABEL = 'ភ្លេចលេខសម្ងាត់? ផ្ញើសារទៅ Admin';
  const HELP = 'ភ្លេចអត្តលេខ ឬលេខសម្ងាត់? សូមទាក់ទងផ្នែក HR ដើម្បីជួយ។';

  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const TG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.6 13.2 2 11.8c-1-.3-1-1 .2-1.5L20.1 3.4c.9-.3 1.7.2 1.8.9z"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

  const CSS = `
  #loginCard{max-width:420px;margin:0 auto;padding:max(48px,env(safe-area-inset-top,0px)) 24px 0;}
  #loginCard .login-logo{width:92px;height:92px;margin:0 auto 14px;border-radius:26px;font-size:2.2rem;
    box-shadow:0 12px 30px color-mix(in srgb,var(--accent,#0d9488) 40%,transparent);}
  #loginCard .login-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  #loginCard .lg-name{text-align:center;font-size:2.1rem;line-height:1.1;letter-spacing:.5px;margin:0 0 34px;color:var(--text);}
  #loginCard .lg-name b{font-weight:800;color:var(--accent,#0d9488);}
  #loginCard .lg-name span{font-weight:300;opacity:.9;margin-left:4px;}

  .portal #loginCard .form-group{margin-bottom:14px;}
  .portal #loginCard input{width:100%;box-sizing:border-box;height:48px;padding:0 14px;font-size:.95rem;border:1px solid var(--border);
    border-radius:10px;background:color-mix(in srgb,var(--card-bg,#121d2e) 85%,transparent);color:var(--text);}
  .portal #loginCard input::placeholder{color:var(--text-muted);}
  .portal #loginCard input:focus{border-color:var(--accent,#0d9488);outline:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#0d9488) 22%,transparent);}
  #loginCard .lg-pw{position:relative;}
  .portal #loginCard .lg-pw input{padding-right:48px;}
  #loginCard .lg-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:42px;height:42px;display:grid;place-items:center;
    background:none;border:0;color:var(--text-muted);cursor:pointer;-webkit-tap-highlight-color:transparent;}
  #loginCard .lg-eye:active{color:var(--text);}

  .portal #loginCard .primary-btn{width:100%;height:48px;margin-top:6px;padding:0;font-size:1rem;font-weight:700;border-radius:10px;border:0;color:#fff;
    background:linear-gradient(135deg,var(--accent,#0d9488),color-mix(in srgb,var(--accent,#0d9488) 70%,#0ea5e9));
    box-shadow:0 8px 20px color-mix(in srgb,var(--accent,#0d9488) 32%,transparent);}
  .portal #loginCard .primary-btn:active{transform:translateY(1px);}
  .portal #loginCard .lg-forgot{width:100%;height:46px;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:.88rem;font-weight:600;
    color:var(--accent,#0d9488);background:transparent;border:1px solid color-mix(in srgb,var(--accent,#0d9488) 55%,transparent);border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
  .portal #loginCard .lg-forgot:active{background:color-mix(in srgb,var(--accent,#0d9488) 12%,transparent);}
  #loginCard .lg-help{margin:22px 6px 0;text-align:center;font-size:.76rem;line-height:1.6;color:var(--text-muted);}
  .lg-ov{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.58);display:flex;align-items:flex-end;justify-content:center;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}
  .lg-sheet{width:100%;max-width:440px;box-sizing:border-box;background:var(--card-bg,#121d2e);color:var(--text,#e6edf6);border:1px solid var(--border,#22314a);
    border-radius:22px 22px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.45);}
  .lg-sheet h3{margin:0 0 4px;font-size:1.05rem;}
  .lg-sheet .lg-sub{margin:0 0 14px;font-size:.78rem;color:var(--text-muted);line-height:1.6;}
  .lg-sheet label{display:block;margin:10px 0 6px;font-size:.78rem;color:var(--text-muted);}
  .lg-sheet input{width:100%;box-sizing:border-box;height:46px;padding:0 14px;font-size:.95rem;color:var(--text);background:transparent;border:1px solid var(--border);border-radius:10px;}
  .lg-sheet input:focus{outline:0;border-color:var(--accent,#0d9488);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#0d9488) 22%,transparent);}
  .lg-sheet .lg-err{display:none;margin:10px 0 0;font-size:.8rem;color:#f87171;}
  .lg-sheet .lg-send{width:100%;height:48px;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:.95rem;font-weight:700;color:#fff;border:0;border-radius:10px;cursor:pointer;
    background:linear-gradient(135deg,var(--accent,#0d9488),color-mix(in srgb,var(--accent,#0d9488) 70%,#0ea5e9));}
  .lg-sheet .lg-cancel{width:100%;height:44px;margin-top:8px;font-size:.9rem;color:var(--text-muted);background:none;border:0;cursor:pointer;}
  .lg-sheet .lg-note{margin:8px 0 0;text-align:center;font-size:.7rem;line-height:1.6;color:var(--text-muted);}
  `;


  // ផ្ទាំងបំពេញ អត្តលេខ + ឈ្មោះ មុនផ្ញើសារទៅ Admin
  function openForgotSheet() {
    const err = document.getElementById('loginError');
    if (!ADMIN_TG) {
      if (err) { err.textContent = 'មិនទាន់កំណត់ទំនាក់ទំនង Admin សូមទាក់ទងផ្នែក HR ដោយផ្ទាល់'; err.style.display = 'block'; }
      return;
    }
    if (document.getElementById('lgSheet')) return;
    const u = document.getElementById('loginUsername');
    const ov = document.createElement('div');
    ov.id = 'lgSheet'; ov.className = 'lg-ov';
    ov.innerHTML = '<div class="lg-sheet" role="dialog" aria-modal="true">'
      + '<h3>ផ្ញើសារទៅ Admin</h3>'
      + '<p class="lg-sub">បំពេញព័ត៌មានរបស់អ្នក ដើម្បីឲ្យ Admin ស្គាល់ និងកំណត់លេខសម្ងាត់ឡើងវិញ</p>'
      + '<label>អត្តលេខ</label><input type="text" id="lgId" autocomplete="off">'
      + '<label>ឈ្មោះ</label><input type="text" id="lgName" autocomplete="name">'
      + '<p class="lg-err" id="lgErr"></p>'
      + '<button type="button" class="lg-send" id="lgSend"></button>'
      + '<button type="button" class="lg-cancel" id="lgCancel">បោះបង់</button>'
      + '<p class="lg-note">បើ Telegram មិនបំពេញសារឲ្យ សារត្រូវបានចម្លងរួចហើយ គ្រាន់តែ Paste (បិទភ្ជាប់) ក្នុងការជជែក។</p>'
      + '</div>';
    document.body.appendChild(ov);
    const id = ov.querySelector('#lgId'), nm = ov.querySelector('#lgName'), er = ov.querySelector('#lgErr'), send = ov.querySelector('#lgSend');
    send.innerHTML = TG + '<span></span>'; send.lastChild.textContent = 'ផ្ញើទៅ Admin';
    if (u && u.value.trim()) id.value = u.value.trim();
    (id.value ? nm : id).focus();
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#lgCancel').addEventListener('click', close);
    send.addEventListener('click', () => {
      const idv = id.value.trim(), nv = nm.value.trim();
      if (!idv || !nv) { er.textContent = 'សូមបំពេញអត្តលេខ និងឈ្មោះ'; er.style.display = 'block'; return; }
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const when = z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
      const msg = 'សួស្តី Admin ខ្ញុំភ្លេចលេខសម្ងាត់ សូមជួយកំណត់ឡើងវិញ។\n'
        + 'អត្តលេខ៖ ' + idv + '\n'
        + 'ឈ្មោះ៖ ' + nv + '\n'
        + 'ពេលវេលា៖ ' + when;
      window.open('https://t.me/' + encodeURIComponent(ADMIN_TG) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      try { navigator.clipboard && navigator.clipboard.writeText(msg); } catch (e) { /* ignore */ }
      close();
    });
  }

  function init() {
    const card = document.getElementById('loginCard');
    if (!card || card.dataset.lgDone) return;
    card.dataset.lgDone = '1';

    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    // ឡូហ្គោ៖ ប្រើរូប ហើយបើមិនមាន ទុកអក្សរដំបូង (មិនលុប .login-logo ព្រោះកូដដើមប្រើវា)
    const logo = card.querySelector('.login-logo');
    if (logo) {
      const span = logo.querySelector('span');
      if (span) span.textContent = BRAND.charAt(0);
      if (!logo.querySelector('img')) {
        const im = document.createElement('img');
        im.alt = ''; im.src = LOGO_SRC; im.onerror = () => im.remove();
        logo.appendChild(im);
      }
    }

    // ឈ្មោះម៉ាក «SOPHEAK HR»
    const name = document.createElement('div');
    name.className = 'lg-name';
    name.innerHTML = '<b></b><span></span>';
    name.firstChild.textContent = BRAND;
    name.lastChild.textContent = SUB;
    if (logo) logo.insertAdjacentElement('afterend', name); else card.insertBefore(name, card.firstChild);

    // ប៊ូតុងភ្នែក បង្ហាញ/លាក់លេខសម្ងាត់
    const pw = document.getElementById('loginPassword');
    if (pw && pw.parentNode) {
      const wrap = document.createElement('div');
      wrap.className = 'lg-pw';
      pw.parentNode.insertBefore(wrap, pw);
      wrap.appendChild(pw);
      const eye = document.createElement('button');
      eye.type = 'button'; eye.className = 'lg-eye';
      eye.setAttribute('aria-label', 'បង្ហាញ ឬលាក់លេខសម្ងាត់');
      eye.innerHTML = EYE;
      eye.addEventListener('click', () => {
        const show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        eye.innerHTML = show ? EYE_OFF : EYE;
      });
      wrap.appendChild(eye);
    }

    // ប៊ូតុង «ភ្លេចលេខសម្ងាត់» → បើក Telegram ជជែកជាមួយ Admin (បំពេញសារឲ្យ)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      const fb = document.createElement('button');
      fb.type = 'button'; fb.className = 'lg-forgot';
      fb.innerHTML = TG + '<span></span>';
      fb.lastChild.textContent = FORGOT_LABEL;
      fb.addEventListener('click', openForgotSheet);
      loginBtn.insertAdjacentElement('afterend', fb);
    }

    // ពាក្យណែនាំក្រោមប៊ូតុង
    const help = document.createElement('p');
    help.className = 'lg-help';
    help.textContent = HELP;
    card.appendChild(help);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
