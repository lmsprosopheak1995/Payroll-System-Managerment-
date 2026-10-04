/* ==========================================================================
   about-contact.js — "ទាក់ទងខ្ញុំ / About" សម្រាប់ index.html និង employee.html
   ដាក់ក្នុងទាំងពីរឯកសារ មុន </body> (ក្រោម script ចុងក្រោយបង្អស់)៖
     <script src="about-contact.js"></script>
   - បង្ហាញប៊ូតុងតូចអណ្តែត (ⓘ) → បើកផ្ទាំង Contact + Version + Copyright
   - អាចហៅពីម៉ឺនុយណាក៏បាន៖ onclick="openAboutContact()"
   - Version ទាញពី version.json ដោយស្វ័យប្រវត្តិ (បើអានមិនបាន ប្រើ FALLBACK_VERSION)
   លុបវាចេញ → ត្រលប់ទៅដើមវិញ
   ========================================================================== */
(function () {
  'use strict';

  const FALLBACK_VERSION = '1.0.8';
  const APP_NAME = 'HP Check Me';
  const DEV = {
    name: 'Hem Sopheak',
    facebook: 'Hem Sopheak',
    facebookUrl: 'https://www.facebook.com/me.sopheak168/',
    telegram: 'Hem Sopheak',
    telegramUrl: 'https://t.me/Samross_Ph_Care',
    phones: ['0966667292', '0888876150'],
  };

  // ---- Icons (stroke, viewBox 24) ----
  const ICON = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    telegram: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  };
  const svg = n => `<svg class="ac-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- CSS (ប្រើអថេរពណ៌ដែលមានស្រាប់ក្នុង theme) ----
  const CSS = `
.ac-fab{position:fixed;right:14px;bottom:14px;z-index:9990;width:38px;height:38px;border-radius:12px;border:1px solid var(--border,#e1e8ef);
  background:var(--card-bg,#fff);color:var(--accent,#0d9488);display:grid;place-items:center;cursor:pointer;padding:0;
  box-shadow:0 4px 14px rgba(15,27,45,.14);opacity:.9}
.ac-fab:hover{opacity:1;transform:translateY(-1px)}
.ac-fab.has-bnav{bottom:calc(88px + env(safe-area-inset-bottom,0px))}
.ac-ico{width:18px;height:18px;display:block;flex:0 0 auto}
.ac-ovl{position:fixed;inset:0;z-index:99990;background:rgba(8,16,28,.55);display:none;align-items:center;justify-content:center;padding:16px}
.ac-ovl.show{display:flex}
.ac-box{width:100%;max-width:380px;max-height:92vh;overflow:auto;border-radius:18px;background:var(--card-bg,#fff);color:var(--text,#0f1b2d);
  border:1px solid var(--border,#e1e8ef);box-shadow:0 24px 64px rgba(15,27,45,.35)}
.ac-head{position:relative;padding:22px 18px 16px;text-align:center;color:#fff;background:var(--brand,var(--grad,linear-gradient(135deg,#0d9488,#0284c7)));border-radius:18px 18px 0 0}
.ac-head h3{margin:0;font-size:1.05rem}
.ac-head p{margin:4px 0 0;font-size:.78rem;opacity:.92}
.ac-close{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:9px;border:0;background:rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:none}
.ac-body{padding:14px 16px 6px}
.ac-title{font-size:.72rem;color:var(--text-muted,#5b6b80);margin:0 0 8px;font-weight:600}
.ac-row{display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:8px;border-radius:12px;border:1px solid var(--border,#e1e8ef);
  background:color-mix(in srgb,var(--accent,#0d9488) 5%,var(--card-bg,#fff));color:inherit;text-decoration:none}
.ac-ic{width:34px;height:34px;flex:0 0 34px;border-radius:10px;display:grid;place-items:center;color:var(--c,var(--accent,#0d9488));
  background:color-mix(in srgb,var(--c,var(--accent,#0d9488)) 14%,transparent)}
.ac-tx{min-width:0;flex:1}
.ac-tx small{display:block;font-size:.66rem;color:var(--text-muted,#5b6b80)}
.ac-tx b{display:block;font-size:.86rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ac-cp{width:30px;height:30px;flex:0 0 30px;border-radius:9px;border:1px solid var(--border,#e1e8ef);background:var(--card-bg,#fff);color:var(--text-muted,#5b6b80);display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:none}
.ac-cp.ok{color:var(--success,#059669);border-color:var(--success,#059669)}
.ac-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 10px}
.ac-meta div{padding:8px 10px;border-radius:12px;border:1px solid var(--border,#e1e8ef);font-size:.8rem}
.ac-meta small{display:block;font-size:.64rem;color:var(--text-muted,#5b6b80)}
.ac-foot{padding:10px 16px 16px;text-align:center;font-size:.72rem;color:var(--text-muted,#5b6b80);border-top:1px solid var(--border,#e1e8ef);margin-top:4px}
@media print{.ac-fab,.ac-ovl{display:none!important}}
`;

  let version = FALLBACK_VERSION;
  let overlay = null;

  function copyText(text, btn) {
    const done = () => {
      btn.classList.add('ok'); btn.innerHTML = svg('check');
      setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = svg('copy'); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(t);
  }

  function row(icon, color, label, value, opts) {
    opts = opts || {};
    const tag = opts.href ? 'a' : 'div';
    const ext = opts.href && /^https?:/.test(opts.href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    const href = opts.href ? ` href="${esc(opts.href)}"${ext}` : '';
    const copyVal = opts.copy || value;
    return `<${tag} class="ac-row"${href}>
      <span class="ac-ic" style="--c:${color}">${svg(icon)}</span>
      <span class="ac-tx"><small>${esc(label)}</small><b>${esc(value)}</b></span>
      <button type="button" class="ac-cp" data-copy="${esc(copyVal)}" aria-label="Copy" title="Copy">${svg('copy')}</button>
    </${tag}>`;
  }

  function build() {
    const year = new Date().getFullYear();
    overlay = document.createElement('div');
    overlay.className = 'ac-ovl';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="ac-box">
        <div class="ac-head">
          <button type="button" class="ac-close" aria-label="Close">${svg('x')}</button>
          <h3>${esc(APP_NAME)}</h3>
          <p>ប្រព័ន្ធគ្រប់គ្រងបុគ្គលិក និងបើកប្រាក់ខែ</p>
        </div>
        <div class="ac-body">
          <p class="ac-title">ទាក់ទងខ្ញុំ (Contact Me)</p>
          ${row('facebook', '#1877f2', 'Facebook', DEV.facebook, { href: DEV.facebookUrl, copy: DEV.facebookUrl })}
          ${row('telegram', '#0284c7', 'Telegram', DEV.telegram, { href: DEV.telegramUrl, copy: DEV.telegramUrl })}
          ${DEV.phones.map(p => row('phone', '#059669', 'Tel', p, { href: 'tel:' + p })).join('')}
          <p class="ac-title" style="margin-top:12px">អំពីប្រព័ន្ធ (About System)</p>
          <div class="ac-meta">
            <div><small>Version</small><b id="acVersion">v${esc(version)}</b></div>
            <div><small>Development</small><b>${esc(DEV.name)}</b></div>
          </div>
        </div>
        <div class="ac-foot">© ${year} Development Copyright ${esc(DEV.name)}<br>All rights reserved.</div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.ac-close')) return close();
      const cp = e.target.closest('.ac-cp');
      if (cp) { e.preventDefault(); copyText(cp.dataset.copy, cp); }
    });
  }

  function open() {
    if (!overlay) build();
    const v = overlay.querySelector('#acVersion'); if (v) v.textContent = 'v' + version;
    overlay.classList.add('show');
  }
  function close() { if (overlay) overlay.classList.remove('show'); }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  async function loadVersion() {
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.version) version = String(j.version);
    } catch (e) { /* ប្រើ FALLBACK_VERSION */ }
  }

  function init() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'ac-fab' + (document.querySelector('.bnav') ? ' has-bnav' : '');
    fab.title = 'About / Contact';
    fab.setAttribute('aria-label', 'About / Contact');
    fab.innerHTML = svg('info');
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    loadVersion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.openAboutContact = open;
  window.closeAboutContact = close;
})();
