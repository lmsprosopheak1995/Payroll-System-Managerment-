/* employee-refresh.js — ប៊ូតុង Hard Refresh នៅ header ទំព័រដើម (employee.html)
   ដាក់ក្នុង employee.html ក្រោម <script src="employee-home.js?v=4"></script>៖
     <script src="employee-refresh.js"></script>
   - លុប Service Worker + cache ទាំងអស់ ហើយផ្ទុកទំព័រឡើងវិញពី server
   - មិនលុប localStorage/sessionStorage ដូច្នេះមិនចាំបាច់ចូលគណនីម្តងទៀត */
(function () {
  'use strict';
  const BTN_ID = 'hardRefreshBtn';

  const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>';

  let busy = false;
  async function hardRefresh() {
    if (busy) return;
    if (!navigator.onLine) { alert('មិនមានអ៊ីនធឺណិត មិនអាចផ្ទុកឡើងវិញបានទេ'); return; }
    busy = true;
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.add('spinning');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) { console.warn('hard refresh cleanup failed', e); }
    const url = new URL(location.href);
    url.searchParams.set('_r', Date.now());
    location.replace(url.toString());
  }

  // CSS
  const st = document.createElement('style');
  st.textContent =
    '#' + BTN_ID + '{flex:none;display:inline-grid;place-items:center;cursor:pointer;}' +
    '#' + BTN_ID + '.fallback{width:38px;height:38px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.15));' +
    'background:var(--card,rgba(255,255,255,.06));color:var(--text,#e5e7eb);}' +
    '#' + BTN_ID + '.spinning svg{animation:hr-spin .8s linear infinite;}' +
    '@keyframes hr-spin{to{transform:rotate(360deg);}}';
  document.head.appendChild(st);

  function makeBtn(neighbor) {
    const b = document.createElement('button');
    b.id = BTN_ID;
    b.type = 'button';
    b.title = 'ផ្ទុកឡើងវិញ';
    b.setAttribute('aria-label', 'ផ្ទុកឡើងវិញ');
    b.innerHTML = ICON;
    // ប្រើ class ដូចប៊ូតុងជិតខាង (ស្កេន/កណ្ដឹង) ដើម្បីឱ្យស៊ុមដូចគ្នា
    if (neighbor && neighbor.className) b.className = neighbor.className;
    else b.classList.add('fallback');
    b.addEventListener('click', hardRefresh);
    return b;
  }

  function inject() {
    if (document.getElementById(BTN_ID)) return;
    // header ពី employee-home.js៖ .eh-icons មាន #ehScanBtn និង #ehBell
    const scan = document.getElementById('ehScanBtn');
    if (!scan) return;
    const b = makeBtn(scan);   // ចម្លង class eh-ibtn ដូចប៊ូតុងស្កេន/ជួង
    b.style.width = '36px';
    b.style.height = '36px';
    scan.parentNode.insertBefore(b, scan);
  }

  // ---- ប៊ូតុង Contact/ព័ត៌មាន (about-contact.js) ៖ ផ្លាស់ពីជ្រុងអេក្រង់ ទៅ header ខាងស្តាំជួង ----
  function findContactBtn() {
    const skip = '.eh-icons,.bnav,#ehSlide,#ehScanClose,.sub-head';
    const vw = document.documentElement.clientWidth || window.innerWidth;
    let best = null;
    document.querySelectorAll('button,a,div[role="button"],[id*="contact" i],[id*="about" i],[class*="contact" i],[class*="about" i]').forEach(el => {
      if (best || el.id === BTN_ID || el.closest(skip)) return;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (!r.width || r.width > 80 || r.height > 80 || r.right < vw * 0.6) return;   // តូច + នៅខាងស្តាំ
      if (!el.querySelector('svg,img') && !(el.textContent || '').trim()) return;
      best = el;
    });
    return best;
  }

  function moveContact() {
    const bell = document.getElementById('ehBell');
    if (!bell || document.querySelector('[data-eh-contact]')) return;
    const c = findContactBtn();
    if (!c) return;
    c.setAttribute('data-eh-contact', '1');
    c.classList.add('eh-ibtn');
    const set = (k, v) => c.style.setProperty(k, v, 'important');
    set('position', 'static'); set('inset', 'auto'); set('transform', 'none'); set('translate', 'none');
    set('margin', '0'); set('width', '36px'); set('height', '36px'); set('flex', 'none');
    set('z-index', 'auto'); set('display', 'grid'); set('place-items', 'center'); set('padding', '0');
    bell.parentNode.insertBefore(c, bell.nextSibling);   // ខាងស្តាំជួង
    const hd = document.querySelector('#homeTabContent .eh-icons');
    if (hd) hd.style.setProperty('gap', '6px', 'important');
  }

  function start() {
    inject(); moveContact();
    // employee-home.js អាចគូស header ឡើងវិញ → ដាក់ម្តងទៀតបើបាត់
    const root = document.getElementById('homeTabContent') || document.body;
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { inject(); moveContact(); }); };
    new MutationObserver(run).observe(root, { childList: true, subtree: true });
    // about-contact.js ប្រហែលបន្ថែមប៊ូតុងទៅ <body> ក្រោយមក
    new MutationObserver(run).observe(document.body, { childList: true });
    setTimeout(run, 800); setTimeout(run, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
