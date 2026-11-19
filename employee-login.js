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
  const HELP = 'ភ្លេចអត្តលេខ ឬលេខសម្ងាត់? សូមទាក់ទងផ្នែក HR ដើម្បីជួយ។';

  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
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
  #loginCard .lg-help{margin:22px 6px 0;text-align:center;font-size:.76rem;line-height:1.6;color:var(--text-muted);}
  `;

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

    // ពាក្យណែនាំក្រោមប៊ូតុង
    const help = document.createElement('p');
    help.className = 'lg-help';
    help.textContent = HELP;
    card.appendChild(help);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
