/* ==========================================================================
   employee-modern.js — ជំនួស Emoji ដោយ SVG Icon + Frame ក្នុង employee.html
   ហើយបន្ថែម Icon ទៅ stat-card (ដំណើរការតាម MutationObserver)
   ដាក់ក្នុង employee.html មុន </body> (ក្រោម <script> ចុងក្រោយបង្អស់)៖
     <script src="employee-modern.js"></script>
   មិនកែ logic ដើម — លុបវាចេញ ទើបត្រលប់ទៅ Emoji ចាស់វិញ
   ========================================================================== */
(function () {
  'use strict';

  // ---- Icon set (stroke, viewBox 24) ----
  const P = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    calendarCheck: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    filePen: '<path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/>',
    chart: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  const svgStr = (name, cls) => `<svg class="ui-ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  const frame = name => `<span class="ico-frame" aria-hidden="true">${svgStr(name)}</span>`;

  // Emoji (បើកដើម) → ឈ្មោះ icon
  const EMOJI = {
    '🏠': 'home', '👤': 'user', '🕐': 'clock', '⏱': 'timer', '📅': 'calendar', '💰': 'wallet',
    '🔔': 'bell', '💬': 'message', '📍': 'mapPin', '📝': 'filePen', '📊': 'chart', '🌴': 'sun',
    '⚡': 'zap', '📷': 'camera', '🖨': 'printer', '⬇': 'download', '➕': 'plus', '📤': 'send',
    '🧾': 'receipt', '👉': 'arrowRight',
  };
  const LEAD = /^\s*(\p{Extended_Pictographic}\uFE0F?)\s*/u;

  // ជំនួស emoji នៅដើមអត្ថបទដំបូងរបស់ element ដោយ SVG (មិនប៉ះ element កូនផ្សេងទៀត)
  function swap(el) {
    if (!el || el.dataset.emDone) return;
    let node = el.firstChild;
    while (node && !(node.nodeType === 3 && node.nodeValue.trim())) node = node.nextSibling;
    if (!node) return;
    const m = node.nodeValue.match(LEAD);
    if (!m) return;
    const name = EMOJI[m[1].replace(/\uFE0F/g, '')];
    if (!name) return;
    node.nodeValue = node.nodeValue.slice(m[0].length);
    const tpl = document.createElement('template');
    tpl.innerHTML = svgStr(name, 'inline');
    el.insertBefore(tpl.content.firstChild, node);
    el.dataset.emDone = '1';
  }

  const SWAP_SELECTOR = [
    '.menu-ico', '.pf-q .qi', '.bnav-item .ic',
    '.pf-title > span:first-child', '.portal-card h2', '.portal-card h3',
    '.portal button', '.next-step',
  ].join(',');

  function swapAll(root) { (root || document).querySelectorAll(SWAP_SELECTOR).forEach(swap); }

  // ---- Stat cards: icon + tone តាមទីតាំង ----
  const STAT = {
    pfStats:     { icons: ['calendarCheck', 'clock', 'timer', 'wallet'],                       tones: ['', 'warn', 'success', ''] },
    empAttStats: { icons: ['calendarCheck', 'sun', 'clock', 'wallet', 'banknote', 'timer'],    tones: ['', 'info', 'warn', '', '', 'success'] },
  };

  function decorateStats(container) {
    const cfg = STAT[container.id];
    if (!cfg) return;
    Array.from(container.children).forEach((card, i) => {
      if (!card.classList.contains('stat-card') || card.classList.contains('has-ico')) return;
      if (cfg.tones[i]) card.dataset.tone = cfg.tones[i];
      if (cfg.icons[i]) {
        card.insertAdjacentHTML('afterbegin', frame(cfg.icons[i]));
        card.classList.add('has-ico');
      }
    });
  }

  function init() {
    // សួស្តី 👋 → សួស្តី
    const hello = document.querySelector('.h-hello');
    if (hello) hello.textContent = hello.textContent.replace(/\s*\p{Extended_Pictographic}\uFE0F?\s*$/u, '');

    swapAll(document);

    // Stat cards ត្រូវបាន render ឡើងវិញរាល់ពេលផ្ទុកទិន្នន័យ
    Object.keys(STAT).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      decorateStats(el);
      new MutationObserver(() => decorateStats(el)).observe(el, { childList: true });
    });

    // ប្រអប់ម៉ោងចូល-ចេញ render ឡើងវិញ (👉 ជំហានបន្ទាប់) — swap() មិនបង្កើត mutation ម្តងទៀតបើគ្មាន emoji
    const clockBox = document.getElementById('clockBox');
    if (clockBox) new MutationObserver(() => swapAll(clockBox)).observe(clockBox, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // ជំនួយ៖ ប្តូរចំនួន column ដោយ JS — setGridCols('empAttStats', 3)
  window.setGridCols = function (id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('grid-cols-2', 'grid-cols-3');
    if (n) el.classList.add('grid-cols-' + n);
  };
})();
