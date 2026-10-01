/* ==========================================================================
   ui-modern.js — ជំនួស Emoji ដោយ SVG Icon + Frame ហើយបន្ថែម Icon ទៅ stat-card
   ដាក់ក្នុង index.html ក្រោម script.js (ចុងក្រោយបង្អស់)៖
     <script src="ui-modern.js"></script>
   មិនកែ script.js / features.js — ដំណើរការតាម MutationObserver
   ========================================================================== */
(function () {
  'use strict';

  // ---- Icon set (stroke, viewBox 24) ----
  const P = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M12 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    calendarCheck: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  };
  const svg = name => `<svg class="ui-ico" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  const frame = (name, extra) => `<span class="ico-frame${extra ? ' ' + extra : ''}" aria-hidden="true">${svg(name)}</span>`;

  // ---- Sidebar / page title mapping ----
  const TAB_ICON = {
    dashboard: 'dashboard', employees: 'users', attendance: 'calendarCheck', scan: 'scan',
    requests: 'fileText', leavebalance: 'sun', notify: 'bell', feedback: 'message',
    shift: 'clock', monthly: 'wallet', payroll: 'wallet', deduct: 'wallet', bonus: 'gift',
    ai: 'bot', setting: 'settings',
  };
  const PARENT_ICON = { Attendances: 'calendarCheck', Payrolls: 'wallet' };

  function decorateSidebar() {
    const brand = document.querySelector('.sidebar-brand');
    if (brand && !brand.dataset.uiDone) {
      const text = brand.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
      brand.innerHTML = frame('building') + '<span></span>';
      brand.lastChild.textContent = text;
      brand.dataset.uiDone = '1';
    }
    document.querySelectorAll('.sidebar .nav-item > .ico').forEach(ico => {
      if (ico.dataset.uiDone) return;
      const btn = ico.closest('.nav-item');
      let name = TAB_ICON[btn.dataset.tab];
      if (!name) {
        const lbl = btn.querySelector('.lbl');
        name = lbl && PARENT_ICON[lbl.textContent.trim()];
      }
      if (!name) return;
      ico.innerHTML = frame(name);
      ico.dataset.uiDone = '1';
    });
  }

  function decoratePageTitles() {
    document.querySelectorAll('.tab-content .page-title').forEach(h => {
      if (h.dataset.uiDone) return;
      const tabId = (h.closest('.tab-content').id || '').replace(/Tab$/, '');
      const name = TAB_ICON[tabId];
      if (!name) return;
      const first = h.firstChild;
      if (first && first.nodeType === 3) {
        first.nodeValue = first.nodeValue.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
      }
      const text = h.innerHTML;
      h.innerHTML = frame(name) + '<span>' + text + '</span>';
      h.dataset.uiDone = '1';
    });
  }

  // ---- Stat cards: icon តាមទីតាំងក្នុងកុងតឺន័រ ----
  const STAT_ICONS = {
    statsRow:       ['users', 'userCheck', 'building', 'wallet'],
    dashTodayStats: ['users', 'userCheck', 'clock', 'calendar', 'userX', 'circleMinus'],
    dashMonthStats: ['wallet', 'briefcase', 'timer', 'clock', 'calendar', 'userX'],
  };

  function toneOf(card) {
    const num = card.querySelector('.num');
    const c = (num && num.getAttribute('style')) || '';
    if (/success/.test(c)) return 'success';
    if (/#d97706/i.test(c)) return 'warn';
    if (/danger/.test(c)) return 'danger';
    if (/text-muted/.test(c)) return 'muted';
    return '';
  }

  function decorateStats(container) {
    const icons = STAT_ICONS[container.id];
    if (!icons) return;
    // 6 ប្រអប់ → 3 column × 2 ជួរ (មិនបែក 5+1)
    container.classList.toggle('grid-cols-3', container.children.length === 6);
    Array.from(container.children).forEach((card, i) => {
      if (!card.classList.contains('stat-card') || card.classList.contains('has-ico')) return;
      const tone = toneOf(card);
      if (tone) card.dataset.tone = tone;
      if (icons[i]) {
        card.insertAdjacentHTML('afterbegin', frame(icons[i]));
        card.classList.add('has-ico');
      }
    });
  }

  function init() {
    decorateSidebar();
    decoratePageTitles();
    Object.keys(STAT_ICONS).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      decorateStats(el);
      // childList ของកុងតឺន័រប៉ុណ្ណោះ — ការបន្ថែម icon ក្នុង card មិនបង្កឱ្យរត់ម្តងទៀតទេ
      new MutationObserver(() => decorateStats(el)).observe(el, { childList: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // ជំនួយ៖ ប្តូរចំនួន column ដោយ JS — setGridCols('dashTodayStats', 3)
  window.setGridCols = function (id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-6');
    if (n) el.classList.add('grid-cols-' + n);
  };
})();
