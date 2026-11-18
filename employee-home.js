/* employee-home.js — 🏠 UI ថ្មីទំព័រដើមបុគ្គលិក (រចនាបថកញ្ចក់បៃតងទឹកប៉ាន់ដូចគម្រូ)
 * ដាក់បន្ទាប់ពី employee-update.js ក្នុង employee.html:  <script src="employee-home.js"></script>
 * មិនប្តូរតក្កវិជ្ជាចាស់ទេ៖ ប៊ូតុង/ID ដែលមានស្រាប់ (data-go, empScanToggleBtn, homeName, nfBadge …) នៅដដែល
 * ប្រើ global ពី employee.html៖ currentEmployee, getSession, getTodayRecord, fetchLeaveBalances, scanLockInfo,
 *   toggleEmpScanner, switchEmpTab, holidays, isSwapHoliday, HOLIDAY_SWAP_TAG, todayStr, customAlert, escapeHtml
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const home = () => $('homeTabContent');
  const KH_MON = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const KH_DOW = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
  const todayS = () => (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10));

  /* ---------- រចនាបថ ---------- */
  const CSS = `
  #homeTabContent{position:relative;padding-bottom:120px;}
  #homeTabContent::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;
    background:radial-gradient(120% 60% at 80% -10%,rgba(20,184,166,.30),transparent 60%),radial-gradient(90% 50% at -10% 30%,rgba(14,116,144,.28),transparent 60%),linear-gradient(180deg,#0a2a35 0%,#0a1b2b 45%,#0a1220 100%);}
  #homeTabContent .eh-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 4px;}
  #homeTabContent .eh-brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.3px;}
  #homeTabContent .eh-logo{width:40px;height:40px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.35);}
  #homeTabContent .eh-icons{display:flex;gap:10px;}
  #homeTabContent .eh-ibtn{position:relative;width:42px;height:42px;border-radius:14px;border:1px solid rgba(94,234,212,.28);background:rgba(15,60,70,.55);color:#e8fffb;font-size:1.15rem;cursor:pointer;backdrop-filter:blur(6px);}
  #homeTabContent .eh-dot{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:.66rem;font-weight:800;display:none;align-items:center;justify-content:center;}
  #homeTabContent .home-head{display:flex !important;align-items:center;gap:12px;padding:8px 16px 4px !important;background:transparent !important;border:0 !important;box-shadow:none !important;}
  #homeTabContent .home-head .h-avatar{width:46px !important;height:46px !important;border-radius:50% !important;background:linear-gradient(135deg,#14b8a6,#0ea5e9) !important;color:#04201c !important;font-weight:800;border:2px solid rgba(94,234,212,.6);display:flex;align-items:center;justify-content:center;overflow:hidden;}
  #homeTabContent .home-head .h-avatar img{width:100%;height:100%;object-fit:cover;}
  #homeTabContent .home-head .h-hello{font-size:.8rem !important;opacity:.8;}
  #homeTabContent .home-head .h-name{font-size:1.15rem !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.4px;}
  #homeTabContent .banner-track{margin:10px 16px 0 !important;border-radius:22px !important;overflow:hidden;border:1px solid rgba(94,234,212,.25);box-shadow:0 10px 30px rgba(0,0,0,.35);}
  #homeTabContent .home-scan #empScanToggleBtn,#homeTabContent .home-scan #empScanPrivacy{display:none !important;}
  #homeTabContent .home-scan{margin:8px 16px 0 !important;}
  #homeTabContent .eh-row1{display:grid;grid-template-columns:1.55fr 1fr 1fr;gap:10px;padding:14px 16px 0;}
  #homeTabContent .eh-glass,#homeTabContent .menu-card .menu-row{background:linear-gradient(160deg,rgba(20,184,166,.20),rgba(10,32,48,.62)) !important;border:1px solid rgba(94,234,212,.24) !important;border-radius:22px !important;box-shadow:0 8px 22px rgba(0,0,0,.30);backdrop-filter:blur(8px);color:#e8fffb !important;}
  #homeTabContent .eh-ring{display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer;min-height:104px;}
  #homeTabContent .eh-ring svg{flex:0 0 auto;}
  #homeTabContent .eh-ring .t{font-size:.84rem;font-weight:800;line-height:1.2;}
  #homeTabContent .eh-ring .n{font-size:1.45rem;font-weight:800;line-height:1.1;}
  #homeTabContent .eh-ring .n small{font-size:.8rem;opacity:.7;font-weight:600;}
  #homeTabContent .eh-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 6px;min-height:104px;cursor:pointer;font-size:.8rem;font-weight:700;text-align:center;border:0;}
  #homeTabContent .eh-ico{width:44px;height:44px;border-radius:14px;background:rgba(94,234,212,.16);display:flex;align-items:center;justify-content:center;font-size:1.45rem;}
  /* ក្រឡាក្នុង .menu-card (ចាស់) ប្តូរជា tile 4 ជួរ */
  #homeTabContent .menu-card{display:grid !important;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 16px 0 !important;background:transparent !important;border:0 !important;box-shadow:none !important;margin:0 !important;}
  #homeTabContent .menu-card .menu-row{display:flex !important;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 4px !important;min-height:96px;height:auto !important;text-align:center;}
  #homeTabContent .menu-card .menu-row .go{display:none !important;}
  #homeTabContent .menu-card .menu-row .menu-ico{width:44px !important;height:44px !important;margin:0 !important;border-radius:14px !important;background:rgba(94,234,212,.16) !important;display:flex !important;align-items:center;justify-content:center;font-size:1.45rem !important;}
  #homeTabContent .menu-card .menu-row .lbl{font-size:.76rem !important;font-weight:700 !important;line-height:1.25;white-space:normal !important;flex:0 0 auto !important;}
  #homeTabContent .menu-card .menu-row[data-go="leave"],#homeTabContent .menu-card .menu-row[data-go="ot"],#homeTabContent .menu-card .menu-row[data-go="clock"],#homeTabContent .menu-card .menu-row[data-go="feedback"]{display:none !important;}
  #homeTabContent .eh-chips{display:flex;gap:10px;overflow-x:auto;padding:14px 16px 2px;scrollbar-width:none;}
  #homeTabContent .eh-chips::-webkit-scrollbar{display:none;}
  #homeTabContent .eh-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:1px solid rgba(94,234,212,.26);background:rgba(15,60,70,.55);color:#e8fffb;font-weight:700;font-size:.9rem;cursor:pointer;backdrop-filter:blur(6px);}
  #homeTabContent .eh-badge{min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:.72rem;font-weight:800;display:none;align-items:center;justify-content:center;}
  #homeTabContent .eh-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px 0;}
  #homeTabContent .eh-card{padding:14px;min-height:150px;cursor:pointer;}
  #homeTabContent .eh-card h4{margin:0 0 10px;font-size:.98rem;font-weight:800;}
  #homeTabContent .eh-ev{display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;font-size:.8rem;line-height:1.3;}
  #homeTabContent .eh-ev .d{opacity:.75;font-size:.74rem;}
  #homeTabContent .eh-ev .ic{width:28px;height:28px;border-radius:8px;background:rgba(245,158,11,.22);display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
  #homeTabContent .eh-today{display:flex;gap:10px;align-items:center;margin-bottom:12px;}
  #homeTabContent .eh-cal{width:46px;border-radius:12px;background:#0f766e;color:#fff;text-align:center;overflow:hidden;font-weight:800;flex:0 0 auto;}
  #homeTabContent .eh-cal small{display:block;background:#14b8a6;font-size:.62rem;padding:2px 0;}
  #homeTabContent .eh-cal b{display:block;font-size:1.3rem;padding:3px 0;}
  #homeTabContent .eh-duty{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.76rem;}
  #homeTabContent .eh-duty div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 6px;text-align:center;}
  #homeTabContent .eh-duty b{display:block;font-size:.95rem;margin-top:2px;}
  #homeTabContent #homeHolidayCard{display:none;}
  #homeTabContent #homeHolidayCard.eh-open{display:block;}
  /* ប៊ូតុងអូសកត់ម៉ោង (Slide to clock) */
  #ehSlide{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(80px + env(safe-area-inset-bottom,0px));width:min(480px,calc(100% - 40px));z-index:60;display:none;}
  #ehSlide.on{display:block;}
  #ehSlide .box{background:linear-gradient(160deg,rgba(15,60,70,.92),rgba(8,28,44,.95));border:1px solid rgba(94,234,212,.35);border-radius:18px;padding:8px 12px 10px;box-shadow:0 0 0 2px rgba(245,208,80,.16),0 8px 22px rgba(0,0,0,.45);backdrop-filter:blur(10px);color:#e8fffb;}
  #ehSlide .tt{font-weight:700;font-size:.78rem;margin-bottom:6px;}
  #ehSlide .track{position:relative;height:42px;border-radius:999px;background:rgba(0,0,0,.28);border:1px solid rgba(94,234,212,.22);overflow:hidden;user-select:none;touch-action:none;}
  #ehSlide .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700;opacity:.85;pointer-events:none;padding-left:40px;font-size:.78rem;}
  #ehSlide .handle{position:absolute;top:3px;left:3px;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#2dd4bf,#14b8a6);display:flex;align-items:center;justify-content:center;font-size:1.05rem;color:#04201c;box-shadow:0 3px 10px rgba(20,184,166,.5);cursor:grab;touch-action:none;}
  /* លាក់របារអូស ពេលនៅទំព័រចូលគណនី (mainCard ត្រូវបានលាក់) */
  body:has(#mainCard[style*="none"]) #ehSlide{display:none !important;}
  #ehSlide.locked .handle{background:#64748b;box-shadow:none;cursor:not-allowed;}
  #ehSlide.locked .hint{opacity:.7;}
  /* ===== ជួសជុលរបៀបស្រាល: ប្តូរអថេរពណ៌ក្នុងទំព័រដើមឱ្យស្រួលមើលលើផ្ទៃងងឹត ===== */
  #homeTabContent{--text:#e8fffb;--text-muted:#9cc3c8;--border:rgba(94,234,212,.22);--bg:#0a1b2b;--card-bg:rgba(15,60,70,.55);--shadow:0 8px 22px rgba(0,0,0,.30);color:#e8fffb;}
  #homeTabContent .portal-card{background:linear-gradient(160deg,rgba(20,184,166,.16),rgba(10,32,48,.62)) !important;border:1px solid rgba(94,234,212,.24) !important;border-radius:22px !important;backdrop-filter:blur(8px);color:#e8fffb;}
  #homeTabContent .banner-dots i.on{background:#2dd4bf;}
  /* របារម៉ឺនុយខាងក្រោម: កញ្ចក់ងងឹត តែពេលនៅទំព័រដើម */
  body:has(#homeTabContent.active) .bnav{background:rgba(8,24,38,.92);backdrop-filter:blur(12px);box-shadow:0 -6px 24px rgba(0,0,0,.45);border-top:1px solid rgba(94,234,212,.2);}
  body:has(#homeTabContent.active) button.bnav-item{color:#8fb4ba;}
  body:has(#homeTabContent.active) button.bnav-item.active{color:#2dd4bf;}
  /* ===== ធ្វើឱ្យស្អាតជាងមុន ===== */
  /* ផ្ទៃខាងក្រោយងងឹតពេញអេក្រង់ (រួមទាំងតំបន់ status bar លើ iPhone) */
  html:has(#mainCard:not([style*="none"]) #homeTabContent.active),body:has(#mainCard:not([style*="none"]) #homeTabContent.active){background:#0a1220 !important;}
  /* របារម៉ឺនុយ + របារអូស: ទឹកអត់ថ្លា កុំឱ្យឃើញអក្សរពីក្រោម */
  body:has(#homeTabContent.active) .bnav{background:#081826 !important;border:1px solid rgba(94,234,212,.28) !important;border-radius:22px;}
  #ehSlide .box{background:linear-gradient(160deg,#0f3c46,#08202e) !important;}
  #homeTabContent{padding-bottom:210px;}
  /* កាតច្បាប់ប្រចាំឆ្នាំ: កុំឱ្យលេខបាក់បន្ទាត់ */
  #homeTabContent .eh-row1{grid-template-columns:1.6fr 1fr 1fr;}
  #homeTabContent .eh-ring{gap:10px;padding:12px;}
  #homeTabContent .eh-ring svg{width:52px;height:52px;}
  #homeTabContent .eh-ring .t{font-size:.76rem;}
  #homeTabContent .eh-ring .n{font-size:1.3rem;white-space:nowrap;}
  #homeTabContent .eh-ring .n small{font-size:.74rem;}
  /* banner គ្មានរូប: ពណ៌ត្រូវនឹងរចនាបថ និងកម្ពស់តូចជាង */
  /* ប៊ូតុង ⓘ (about-contact.js): ដាក់លើរបារអូស ពណ៌ងងឹតតាមរចនាបថ ពេលនៅទំព័រដើម */
  body:has(#mainCard:not([style*="none"]) #homeTabContent.active) .ac-fab{bottom:calc(176px + env(safe-area-inset-bottom,0px));right:22px;width:34px;height:34px;border-radius:11px;background:#0f3c46;border:1px solid rgba(94,234,212,.35);color:#5eead4;box-shadow:0 4px 14px rgba(0,0,0,.4);}
  /* ម៉ាស៊ីនស្កេនកាមេរ៉ា: បើកជាផ្ទាំងពេញខាងលើ (មិនរុញមាតិកាចុះក្រោម) ទុករបារអូស/ម៉ឺនុយនៅខាងក្រោម */
  #homeTabContent #empQrReader{position:fixed !important;top:0;left:0;right:0;bottom:calc(176px + env(safe-area-inset-bottom,0px));margin:0 !important;z-index:55;background:#000;border:0 !important;border-radius:0 0 26px 26px;overflow:hidden;min-height:0;box-shadow:0 10px 30px rgba(0,0,0,.5);}
  #homeTabContent #empQrReader video{width:100% !important;height:100% !important;object-fit:cover;}
  #homeTabContent #empScanHint{display:none !important;}
  #ehScanClose{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:calc(192px + env(safe-area-inset-bottom,0px));z-index:62;align-items:center;gap:8px;padding:11px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(8,24,38,.88);color:#fff;font-weight:700;font-size:.9rem;font-family:inherit;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,.45);}
  #homeTabContent #empQrReader:not([style*="none"]) + #ehScanClose{display:flex;}
  #homeTabContent #empScanResult{position:fixed;left:22px;right:22px;bottom:calc(262px + env(safe-area-inset-bottom,0px));z-index:61;margin:0 !important;padding:8px 12px;border-radius:14px;background:rgba(8,24,38,.92);text-align:center;}
  #homeTabContent #empScanResult:empty{display:none;}
  #homeTabContent .banner:not(.has-img){background:linear-gradient(135deg,#0f766e,#0e7490 60%,#164e63) !important;aspect-ratio:auto !important;min-height:150px;justify-content:center;}
  `;

  /* ---------- សមាសភាព ---------- */
  let observers = [], built = false;

  function greet() { const h = new Date().getHours(); return h < 12 ? 'អរុណសួស្តី 🌤' : (h < 17 ? 'ទិវាសួស្តី ☀️' : 'សាយណ្ហសួស្តី 🌙'); }

  function build() {
    const H = home();
    if (!H || built) return;
    if (!$('empHomeStyles')) { const st = document.createElement('style'); st.id = 'empHomeStyles'; st.textContent = CSS; document.head.appendChild(st); }
    const head = H.querySelector('.home-head');
    if (!head) return;
    built = true;

    // ១) របារខាងលើ៖ ឡូហ្គោ + ជួង
    const bar = document.createElement('div');
    bar.className = 'eh-bar';
    bar.innerHTML = `<div class="eh-brand"><img class="eh-logo" src="icon/icon-192.png" alt=""><span>Hem Sopheak HR</span></div>
      <div class="eh-icons"><button type="button" class="eh-ibtn" id="ehBell" aria-label="ដំណឹង">🔔<span class="eh-dot" id="ehBellDot"></span></button></div>`;
    H.insertBefore(bar, H.firstChild);
    $('ehBell').onclick = () => go('notify');

    // ២) ស្វាគមន៍ (ប្រើ .home-head ដែលមានស្រាប់)
    const hello = head.querySelector('.h-hello'); if (hello) hello.id = 'ehHello';

    // ៣) ជួរទី១៖ រង្វង់ច្បាប់ + សុំច្បាប់ + ថែមម៉ោង (បញ្ចូលក្រោយ banner dots)
    const row1 = document.createElement('div');
    row1.className = 'eh-row1';
    row1.innerHTML = `
      <div class="eh-glass eh-ring" id="ehRing" data-go="leave" role="button">
        <svg width="62" height="62" viewBox="0 0 62 62"><circle cx="31" cy="31" r="25" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="7"/>
          <circle id="ehRingArc" cx="31" cy="31" r="25" fill="none" stroke="#2dd4bf" stroke-width="7" stroke-linecap="round" stroke-dasharray="157" stroke-dashoffset="157" transform="rotate(-90 31 31)"/></svg>
        <div><div class="t">ច្បាប់ប្រចាំឆ្នាំ</div><div class="n"><span id="ehLeaveNow">–</span> <small>/ <span id="ehLeaveTot">–</span></small></div></div>
      </div>
      <button type="button" class="eh-glass eh-tile" data-go="leave"><span class="eh-ico">📝</span>សុំច្បាប់</button>
      <button type="button" class="eh-glass eh-tile" data-go="ot"><span class="eh-ico">⏱</span>ថែមម៉ោង</button>`;
    const anchor = H.querySelector('.home-scan');
    H.insertBefore(row1, anchor ? anchor.nextSibling : H.querySelector('.menu-card'));
    row1.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

    // ៤) ក្រឡាក្នុង .menu-card៖ កាត់ស្លាកវែង
    const corr = H.querySelector('.menu-row[data-go="correction"] .lbl'); if (corr) corr.textContent = 'កែវត្តមាន';
    const cal = H.querySelector('.menu-row[data-go="attendance"] .lbl'); if (cal) cal.textContent = 'ប្រតិទិន';

    // ៥) ឈីព៖ ដំណឹង · មតិកែលម្អ · ប្រវត្តិរូប
    const chips = document.createElement('div');
    chips.className = 'eh-chips';
    chips.innerHTML = `<button type="button" class="eh-chip" data-go="notify">📢 ដំណឹង <span class="eh-badge" id="ehChipBadge"></span></button>
      <button type="button" class="eh-chip" data-go="feedback">💬 មតិកែលម្អ</button>
      <button type="button" class="eh-chip" data-go="profile">👤 ប្រវត្តិរូប</button>`;
    const menu = H.querySelector('.menu-card');
    menu.insertAdjacentElement('afterend', chips);
    chips.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

    // ៦) ជួរទី២៖ ព្រឹត្តិការណ៍ខាងមុខ + ថ្ងៃនេះ
    const row2 = document.createElement('div');
    row2.className = 'eh-row2';
    row2.innerHTML = `
      <div class="eh-glass eh-card" id="ehUpcoming"><h4>ព្រឹត្តិការណ៍ខាងមុខ</h4><div id="ehUpBody"></div></div>
      <div class="eh-glass eh-card" id="ehToday" data-go="clock"><div class="eh-today"><div class="eh-cal"><small id="ehMon"></small><b id="ehDay"></b></div>
        <div><div style="font-size:.76rem;opacity:.75;">ថ្ងៃនេះ</div><div style="font-weight:800;" id="ehDow"></div></div></div>
        <div class="eh-duty"><div>ចូល<b id="ehIn">--:--</b></div><div>ចេញ<b id="ehOut">--:--</b></div></div></div>`;
    chips.insertAdjacentElement('afterend', row2);
    $('ehToday').onclick = () => go('clock');
    $('ehUpcoming').onclick = () => { const c = $('homeHolidayCard'); if (c) c.classList.toggle('eh-open'); };

    // ៧) ប៊ូតុងអូសកត់ម៉ោង (នៅខាងក្រៅ tab ដើម្បីឱ្យអណ្តែតលើរបារក្រោម)
    const slide = document.createElement('div');
    slide.id = 'ehSlide';
    slide.innerHTML = `<div class="box"><div class="tt" id="ehSlideTitle">កត់ម៉ោងធម្មតា</div>
      <div class="track" id="ehTrack"><div class="hint"><span id="ehSlideHint">អូសដើម្បីស្កេនកត់ម៉ោង</span><span>»</span></div><div class="handle" id="ehHandle">🕐</div></div></div>`;
    document.body.appendChild(slide);
    bindSlide();

    // ៧.១) ប៊ូតុងបោះបង់ការស្កេន (បង្ហាញពេលកាមេរ៉ាបើក)
    const rd = $('empQrReader');
    if (rd && !$('ehScanClose')) {
      const cb = document.createElement('button');
      cb.type = 'button'; cb.id = 'ehScanClose'; cb.textContent = '✕ បោះបង់ការស្កេន';
      rd.insertAdjacentElement('afterend', cb);
      cb.addEventListener('click', cancelScan);
    }

    // ៨) ឆ្លុះ badge ដំណឹង និងស្ថានភាពស្កេន ពីធាតុដែលមានស្រាប់
    const nf = $('nfBadge');
    if (nf) { const o = new MutationObserver(syncBadge); o.observe(nf, { childList: true, characterData: true, subtree: true, attributes: true }); observers.push(o); }
    const btn = $('empScanToggleBtn');
    if (btn) { const o = new MutationObserver(syncSlide); o.observe(btn, { childList: true, characterData: true, subtree: true, attributes: true }); observers.push(o); }
    const o2 = new MutationObserver(syncVisibility); o2.observe(H, { attributes: true, attributeFilter: ['class'] }); observers.push(o2);
    const mcard = $('mainCard'); if (mcard) { const o3 = new MutationObserver(syncVisibility); o3.observe(mcard, { attributes: true, attributeFilter: ['style'] }); observers.push(o3); }
    syncBadge(); syncSlide(); syncVisibility();
  }

  function cancelScan() {
    const running = (typeof empScannerRunning !== 'undefined') && empScannerRunning;
    if (typeof stopEmpScanner === 'function') stopEmpScanner();
    if (!running) {   // កាមេរ៉ាកំពុងចាប់ផ្តើម → លាក់ភ្លាមៗ ហើយបញ្ឈប់ម្តងទៀតពេលវាដំណើរការ
      const r = $('empQrReader'); if (r) r.style.display = 'none';
      setTimeout(() => { if (typeof empScannerRunning !== 'undefined' && empScannerRunning && typeof stopEmpScanner === 'function') stopEmpScanner(); }, 900);
    }
    setTimeout(syncSlide, 400);
  }

  function go(tab) { if (typeof switchEmpTab === 'function') switchEmpTab(tab); }

  function syncBadge() {
    const nf = $('nfBadge'), n = nf ? parseInt((nf.textContent || '').replace(/\D/g, ''), 10) || 0 : 0;
    const dot = $('ehBellDot'), cb = $('ehChipBadge');
    if (dot) { dot.textContent = n > 99 ? '99+' : n; dot.style.display = n ? 'flex' : 'none'; }
    if (cb) { cb.textContent = n > 99 ? '99+' : n; cb.style.display = n ? 'inline-flex' : 'none'; }
  }
  // តម្រឹមទទឹងរបារអូសឱ្យស្មើគ្នានឹងមាតិកាទំព័រដើម (banner)
  function alignSlide() {
    const s = $('ehSlide'), ref = $('homeBanner');
    if (!s || !ref) return;
    const r = ref.getBoundingClientRect();
    if (!r.width) return;
    s.style.left = r.left + 'px'; s.style.width = r.width + 'px'; s.style.transform = 'none';
  }
  window.addEventListener('resize', () => alignSlide());
  function syncVisibility() {
    const s = $('ehSlide'), H = home(); if (!s || !H) return;
    s.classList.toggle('on', H.classList.contains('active')); alignSlide();
    const mc = $('mainCard'), dark = H.classList.contains('active') && mc && mc.style.display !== 'none';
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) { if (!tc.dataset.orig) tc.dataset.orig = tc.content; tc.content = dark ? '#0a1b2b' : tc.dataset.orig; }
  }

  /* ---------- ទិន្នន័យ ---------- */
  function nextStep(rec) {
    if (!rec || !rec.checkin) return 'ចូលធ្វើការ';
    if (!rec.break_out) return 'ចេញបាយ';
    if (!rec.break_in) return 'ចូលវិញពីសម្រាក';
    if (!rec.checkout) return 'ចេញពីការងារ';
    return 'រួចរាល់សម្រាប់ថ្ងៃនេះ';
  }
  let lastRec = null;

  async function refresh() {
    build();
    if (!built) return;
    const e = (typeof currentEmployee !== 'undefined') ? currentEmployee : null;
    const hello = $('ehHello'); if (hello) hello.textContent = greet();
    if (e) { const nm = $('homeName'); if (nm && !nm.textContent) nm.textContent = e.name; }

    // ថ្ងៃនេះ
    const t = todayS(), d = new Date(t + 'T00:00:00');
    $('ehMon').textContent = KH_MON[d.getMonth()]; $('ehDay').textContent = d.getDate(); $('ehDow').textContent = KH_DOW[d.getDay()] + ' · ' + d.getFullYear();
    try {
      lastRec = (typeof getTodayRecord === 'function') ? await getTodayRecord() : null;
      $('ehIn').textContent = (lastRec && lastRec.checkin) || '--:--';
      $('ehOut').textContent = (lastRec && lastRec.checkout) || '--:--';
    } catch (err) { /* ignore */ }

    // ព្រឹត្តិការណ៍ខាងមុខ៖ ថ្ងៃបុណ្យ/ថ្ងៃដោះដូរ 3 ទីមួយ ចាប់ពីថ្ងៃនេះ
    try {
      const hol = (typeof holidays !== 'undefined') ? holidays : {};
      const list = Object.keys(hol).filter(x => x >= t).sort().slice(0, 3);
      $('ehUpBody').innerHTML = list.length ? list.map(x => {
        const raw = String(hol[x] || ''), swap = (typeof isSwapHoliday === 'function') && isSwapHoliday(x);
        const name = (swap && typeof HOLIDAY_SWAP_TAG !== 'undefined' ? raw.slice(HOLIDAY_SWAP_TAG.length).trim() : raw).replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, dd) => dd + '/' + m) || 'ថ្ងៃបុណ្យ';
        const dt = new Date(x + 'T00:00:00');
        return `<div class="eh-ev"><div class="ic">${swap ? '🔁' : '🎉'}</div><div><div class="d">${dt.getDate()} ${KH_MON[dt.getMonth()]} ${dt.getFullYear()}</div>${esc(name)}</div></div>`;
      }).join('') : '<div style="opacity:.7;font-size:.8rem;">មិនមានថ្ងៃបុណ្យខាងមុខ</div>';
    } catch (err) { /* ignore */ }

    // ច្បាប់ប្រចាំឆ្នាំ
    try {
      if (e && typeof fetchLeaveBalances === 'function') {
        const bal = await fetchLeaveBalances(new Date().getFullYear()), a = bal.annual;
        $('ehLeaveNow').textContent = a.remaining; $('ehLeaveTot').textContent = a.total;
        const pct = a.total > 0 ? Math.max(0, Math.min(1, a.remaining / a.total)) : 0;
        $('ehRingArc').style.strokeDashoffset = String(157 * (1 - pct));
      }
    } catch (err) { /* ignore */ }
    syncSlide();
  }

  /* ---------- ប៊ូតុងអូស ---------- */
  function slideState() {
    const info = (typeof scanLockInfo === 'function') ? scanLockInfo() : { locked: false, msg: '' };
    const running = (typeof empScannerRunning !== 'undefined') && empScannerRunning;
    return { locked: !!info.locked, msg: info.msg, running };
  }
  function syncSlide() {
    const s = $('ehSlide'); if (!s) return;
    alignSlide();
    const st = slideState();
    s.classList.toggle('locked', st.locked);
    $('ehSlideTitle').textContent = st.locked ? '🔒 ការស្កេនបិទ' : 'កត់ម៉ោងធម្មតា · ' + nextStep(lastRec);
    $('ehSlideHint').textContent = st.locked ? (st.msg || 'ការស្កេនបិទ') : (st.running ? 'ចុចដើម្បីបញ្ឈប់ការស្កេន' : 'អូសដើម្បីស្កេនកត់ម៉ោង');
    $('ehHandle').textContent = st.running ? '⏹' : (st.locked ? '🔒' : '🕐');
  }

  function trigger() {
    const st = slideState();
    if (st.locked) { if (typeof customAlert === 'function') customAlert(st.msg || 'ការស្កេនបិទ'); return; }
    if (typeof toggleEmpScanner === 'function') toggleEmpScanner();
    const r = $('empQrReader'); if (r) setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    setTimeout(syncSlide, 300); setTimeout(syncSlide, 1200); setTimeout(syncSlide, 2500);
  }

  function bindSlide() {
    const track = $('ehTrack'), handle = $('ehHandle');
    let dragging = false, startX = 0, x = 0, moved = false;
    const max = () => track.clientWidth - handle.clientWidth - 6;
    const setX = v => { x = Math.max(0, Math.min(max(), v)); handle.style.transform = 'translateX(' + x + 'px)'; };
    const reset = () => { handle.style.transition = 'transform .25s'; setX(0); setTimeout(() => { handle.style.transition = ''; }, 260); };
    handle.addEventListener('pointerdown', e => { if (slideState().running) return; dragging = true; moved = false; startX = e.clientX - x; handle.setPointerCapture(e.pointerId); handle.style.transition = ''; });
    handle.addEventListener('pointermove', e => { if (!dragging) return; const nx = e.clientX - startX; if (Math.abs(nx - x) > 2) moved = true; setX(nx); });
    const end = () => {
      if (!dragging) return; dragging = false;
      if (x >= max() * 0.82) { reset(); trigger(); } else reset();
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', () => { dragging = false; reset(); });
    // ចុចធម្មតា (មិនអូស) → បើកម៉ាស៊ីនស្កេនដែរ (សម្រាប់អ្នកដែលមិនស៊ាំនឹងការអូស) / បញ្ឈប់ពេលកំពុងស្កេន
    handle.addEventListener('click', () => { if (!moved || slideState().running) { trigger(); } });
  }

  /* ---------- ភ្ជាប់ជាមួយ renderHome ចាស់ ---------- */
  function hook() {
    if (typeof window.renderHome === 'function' && !window.renderHome.__ehHooked) {
      const orig = window.renderHome;
      window.renderHome = function () { const r = orig.apply(this, arguments); try { refresh(); } catch (e) { console.warn(e); } return r; };
      window.renderHome.__ehHooked = true;
    }
  }
  hook();
  if (document.readyState !== 'loading') { build(); } else { document.addEventListener('DOMContentLoaded', () => { build(); hook(); }); }
  window.empHome = { refresh };
})();
