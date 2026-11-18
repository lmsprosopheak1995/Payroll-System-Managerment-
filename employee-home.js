/* employee-home.js — 🏠 UI ថ្មីទំព័រដើមបុគ្គលិក (កញ្ចក់ teal-navy ដូចគម្រូ)
 * ដាក់បន្ទាប់ពី employee-update.js ក្នុង employee.html:  <script src="employee-home.js?v=4"></script>
 * មិនប្តូរតក្កវិជ្ជាចាស់ទេ៖ ប៊ូតុង/ID ដែលមានស្រាប់ (data-go, empScanToggleBtn, homeName, nfBadge …) នៅដដែល
 * ប្រើ global ពី employee.html៖ currentEmployee, getSession, getTodayRecord, fetchLeaveBalances, scanLockInfo,
 *   toggleEmpScanner, stopEmpScanner, switchEmpTab, holidays, isSwapHoliday, HOLIDAY_SWAP_TAG, todayStr,
 *   getEmpShift, fmtMinEmp, customAlert
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const home = () => $('homeTabContent');
  const KH_MON = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const KH_DOW = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
  const todayS = () => (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10));

  /* ---------- Icons (stroke, 24×24) ---------- */
  const PATHS = {
    door: '<path d="M7 21V4.5A1.5 1.5 0 0 1 8.5 3h8A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16"/><path d="M7 6.5 4.5 8v13"/><circle cx="14.6" cy="12.5" r=".9" fill="currentColor" stroke="none"/>',
    alarm: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10.5v6M9 13.5h6"/><path d="M4.5 5 2.8 6.8M19.5 5l1.7 1.8"/>',
    scan: '<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><path d="M8 12h8"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    mega: '<path d="M3.5 10.5v3a1 1 0 0 0 1 1H7l5.5 4.5V5L7 9.5H4.5a1 1 0 0 0-1 1z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a8 8 0 0 1 0 10.8"/>',
    chat: '<path d="M4.5 5h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H10L5 20.5v-4H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2.2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor"/>',
    lock: '<rect x="6" y="11" width="12" height="9" rx="2.2"/><path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11"/>',
    party: '<path d="M4 20 8 9l7 7z"/><path d="M13 5.5v.01M18 9v.01M17 4.5l-1 2M20 13l-2 .6"/>',
    swap: '<path d="M5 8h12l-3-3M19 16H7l3 3"/>',
  };
  const ic = (n, sz) => `<svg viewBox="0 0 24 24" width="${sz || 24}" height="${sz || 24}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n] || ''}</svg>`;

  /* ---------- រចនាបថ ---------- */
  const CSS = `
  #homeTabContent{position:relative;padding-bottom:120px;--text:#eaf6fb;--text-muted:#9db9c4;--border:rgba(255,255,255,.13);--bg:#0a2238;--card-bg:rgba(18,52,62,.7);--shadow:0 8px 22px rgba(0,0,0,.28);color:#eaf6fb;}
  /* ផ្ទៃខាងក្រោយ: ពន្លឺ teal ជ្រុងឆ្វេងលើ + ស្រទាប់កញ្ចក់ទ្រេត */
  #homeTabContent::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;
    background:
      radial-gradient(75% 36% at 0% 0%,rgba(34,178,156,.55),transparent 70%),
      radial-gradient(90% 45% at 100% 6%,rgba(20,110,150,.34),transparent 65%),
      linear-gradient(118deg,transparent 0 44%,rgba(255,255,255,.04) 44% 44.35%,transparent 44.35% 63%,rgba(255,255,255,.032) 63% 63.3%,transparent 63.3%),
      linear-gradient(180deg,#0b3340 0%,#0a2438 40%,#08192b 72%,#071524 100%);}
  html:has(#mainCard:not([style*="none"]) #homeTabContent.active),body:has(#mainCard:not([style*="none"]) #homeTabContent.active){background:#071524 !important;}

  /* របារខាងលើ */
  #homeTabContent .eh-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 2px;}
  #homeTabContent .eh-brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.2px;font-size:.95rem;}
  #homeTabContent .eh-logo{width:38px;height:38px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.35);}
  #homeTabContent .eh-icons{display:flex;gap:10px;}
  #homeTabContent .eh-ibtn{position:relative;width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(18,56,66,.6);color:#e6f6fb;cursor:pointer;display:grid;place-items:center;padding:0;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:none;}
  #homeTabContent .eh-dot{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:.66rem;font-weight:800;display:none;align-items:center;justify-content:center;}

  /* ស្វាគមន៍ (មួយបន្ទាត់) */
  #homeTabContent .home-head{display:flex !important;align-items:center;gap:12px;padding:10px 16px 2px !important;background:transparent !important;border:0 !important;box-shadow:none !important;}
  #homeTabContent .home-head .h-avatar{width:44px !important;height:44px !important;flex:none;border-radius:50% !important;background:linear-gradient(135deg,#14b8a6,#0ea5e9) !important;color:#04201c !important;font-weight:800;border:2px solid rgba(94,234,212,.7);display:flex;align-items:center;justify-content:center;overflow:hidden;}
  #homeTabContent .home-head .h-avatar img{width:100%;height:100%;object-fit:cover;}
  #homeTabContent .home-head > div:last-child{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px;min-width:0;}
  #homeTabContent .home-head .h-hello{font-size:1rem !important;font-weight:400;color:#d4e8ef !important;}
  #homeTabContent .home-head .h-hello::after{content:','}
  #homeTabContent .home-head .h-name{font-size:1.05rem !important;font-weight:800 !important;text-transform:uppercase;letter-spacing:.3px;color:#fff;}

  /* Banner */
  #homeTabContent .banner-track{margin:12px 16px 0 !important;border-radius:24px !important;overflow-x:auto;overflow-y:hidden;border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 28px rgba(0,0,0,.35);}
  #homeTabContent .banner{aspect-ratio:auto !important;height:150px;border-radius:0 !important;}
  #homeTabContent .banner:not(.has-img){background:linear-gradient(135deg,#0f766e,#0e7490 60%,#164e63) !important;justify-content:center;}
  #homeTabContent .banner-dots{margin-top:8px;}
  #homeTabContent .banner-dots i.on{background:#2dd4bf;}

  /* កាតកញ្ចក់ */
  #homeTabContent .eh-glass,#homeTabContent .menu-card .menu-row,#homeTabContent .portal-card{background:linear-gradient(160deg,rgba(46,104,114,.36),rgba(12,40,54,.76)) !important;border:1px solid rgba(255,255,255,.13) !important;border-radius:22px !important;box-shadow:0 8px 22px rgba(0,0,0,.26);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#eaf6fb !important;}

  /* ជួរទី១ */
  #homeTabContent .home-scan{margin:6px 16px 0 !important;}
  #homeTabContent .home-scan #empScanToggleBtn,#homeTabContent .home-scan #empScanPrivacy{display:none !important;}
  #homeTabContent .eh-row1{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:10px;padding:12px 16px 0;}
  #homeTabContent .eh-ring{display:flex;align-items:center;gap:10px;padding:12px;cursor:pointer;min-height:104px;}
  #homeTabContent .eh-ring svg{flex:0 0 auto;width:54px;height:54px;}
  #homeTabContent .eh-ring .t{font-size:.76rem;font-weight:700;line-height:1.25;color:#dcecf2;}
  #homeTabContent .eh-ring .n{font-size:1.3rem;font-weight:800;line-height:1.15;white-space:nowrap;}
  #homeTabContent .eh-ring .n small{font-size:.76rem;opacity:.72;font-weight:500;}
  #homeTabContent .eh-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 6px;min-height:104px;cursor:pointer;font-size:.8rem;font-weight:700;text-align:center;}
  #homeTabContent .eh-ico,#homeTabContent .menu-card .menu-row .menu-ico{width:40px !important;height:40px !important;margin:0 !important;border-radius:0 !important;background:none !important;box-shadow:none !important;display:flex !important;align-items:center;justify-content:center;font-size:1.6rem !important;color:color-mix(in srgb,var(--c,#7dd3fc) 45%,#e8f6fc) !important;}
  #homeTabContent .eh-ico svg,#homeTabContent .menu-card .menu-row .menu-ico svg{width:34px !important;height:34px !important;}

  /* ក្រឡាក្នុង .menu-card (ចាស់) ប្តូរជា tile 4 ជួរ */
  #homeTabContent .menu-card{display:grid !important;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 16px 0 !important;background:transparent !important;border:0 !important;box-shadow:none !important;margin:0 !important;}
  #homeTabContent .menu-card .menu-row{display:flex !important;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 4px !important;min-height:96px;height:auto !important;text-align:center;}
  #homeTabContent .menu-card .menu-row .go{display:none !important;}
  #homeTabContent .menu-card .menu-row .lbl{font-size:.76rem !important;font-weight:700 !important;line-height:1.25;white-space:normal !important;flex:0 0 auto !important;}
  #homeTabContent .menu-card .menu-row[data-go="leave"],#homeTabContent .menu-card .menu-row[data-go="ot"],#homeTabContent .menu-card .menu-row[data-go="clock"],#homeTabContent .menu-card .menu-row[data-go="feedback"]{display:none !important;}

  /* ឈីព */
  #homeTabContent .eh-chips{display:flex;gap:10px;overflow-x:auto;padding:14px 16px 2px;scrollbar-width:none;}
  #homeTabContent .eh-chips::-webkit-scrollbar{display:none;}
  #homeTabContent .eh-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(18,56,66,.62);color:#eaf6fb;font-weight:700;font-size:.88rem;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:none;}
  #homeTabContent .eh-chip svg{width:20px;height:20px;color:#9fdcf0;}
  #homeTabContent .eh-badge{min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:.72rem;font-weight:800;display:none;align-items:center;justify-content:center;}

  /* ជួរទី២ */
  #homeTabContent .eh-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px 0;}
  #homeTabContent .eh-card{padding:14px;min-height:150px;cursor:pointer;}
  #homeTabContent .eh-card h4{margin:0 0 10px;font-size:.96rem;font-weight:800;}
  #homeTabContent .eh-ev{display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;font-size:.8rem;line-height:1.3;}
  #homeTabContent .eh-ev .d{opacity:.75;font-size:.74rem;}
  #homeTabContent .eh-ev .ic{width:30px;height:30px;border-radius:9px;background:rgba(245,158,11,.2);color:#fbbf24;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
  #homeTabContent .eh-ev .ic svg{width:18px;height:18px;}
  #homeTabContent .eh-today{display:flex;gap:10px;align-items:center;margin-bottom:12px;}
  #homeTabContent .eh-cal{width:46px;border-radius:12px;background:#0f766e;color:#fff;text-align:center;overflow:hidden;font-weight:800;flex:0 0 auto;}
  #homeTabContent .eh-cal small{display:block;background:#14b8a6;font-size:.62rem;padding:2px 0;}
  #homeTabContent .eh-cal b{display:block;font-size:1.3rem;padding:3px 0;}
  #homeTabContent .eh-duty{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.76rem;}
  #homeTabContent .eh-duty div{background:rgba(255,255,255,.07);border-radius:10px;padding:8px 6px;text-align:center;}
  #homeTabContent .eh-duty b{display:block;font-size:.95rem;margin-top:2px;}
  #homeTabContent #homeHolidayCard{display:none;}
  #homeTabContent #homeHolidayCard.eh-open{display:block;}

  /* ពេលកាមេរ៉ាបើក៖ បិទ blur ដើម្បីកុំឲ្យទូរស័ព្ទយឺត/គាំង */
  body.eh-scanning #homeTabContent *,body.eh-scanning .bnav,body.eh-scanning #ehSlide *,body.eh-scanning #ehScanClose{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}

  /* ផ្គូផ្គងគម្រូ */
  #homeTabContent .eh-logo{width:48px;height:48px;border-radius:14px;object-fit:cover;}
  #homeTabContent .eh-bar{padding:14px 16px 0;justify-content:flex-end;}
  #homeTabContent .banner{height:128px;}
  #homeTabContent .eh-duty{display:flex;align-items:stretch;gap:0;margin-top:2px;}
  #homeTabContent .eh-duty div{flex:1;background:none;border-radius:0;padding:2px 8px;text-align:left;font-weight:700;font-size:.78rem;}
  #homeTabContent .eh-duty div + div{border-left:1px solid rgba(255,255,255,.18);}
  #homeTabContent .eh-duty b{font-size:.78rem;font-weight:500;opacity:.7;margin-top:3px;}

  /* ចន្លោះរវាងកាតព្រឹត្តិការណ៍/ថ្ងៃនេះ និងកាតប្រាក់ខែខាងក្រោម */
  #homeTabContent #homePayCards,#homeTabContent #homeHolidayCard.eh-open{margin:16px 16px 0 !important;gap:12px;}
  #homeTabContent #homePayCards .hp-card{padding:14px 16px !important;}

  /* ស្កេន + ជួង នៅខាងស្តាំជួរស្វាគមន៍ */
  #homeTabContent .home-head{padding:14px 16px 2px !important;}
  #homeTabContent .home-head > div:nth-child(2){flex:1;min-width:0;}
  #homeTabContent .home-head > div.eh-icons{flex:none;flex-wrap:nowrap;align-items:center;gap:10px;margin-left:auto;}
  #homeTabContent .home-head .h-hello{font-size:.9rem !important;}
  #homeTabContent .home-head .h-name{font-size:.98rem !important;}
  #homeTabContent .home-head .eh-ibtn{width:40px;height:40px;border-radius:13px;}

  /* slider ព្រឹត្តិការណ៍ខាងមុខ (បញ្ឈរ + ចុចចំណុចខាងស្តាំ) */
  #homeTabContent #ehUpBody{display:flex;align-items:stretch;gap:6px;}
  #homeTabContent .eh-slides{flex:1;min-width:0;height:100px;overflow-y:hidden;scroll-snap-type:y mandatory;scrollbar-width:none;touch-action:pan-y;}
  #homeTabContent .eh-slides::-webkit-scrollbar{display:none;}
  #homeTabContent .eh-page{height:100px;scroll-snap-align:start;scroll-snap-stop:always;}
  #homeTabContent .eh-sdots{display:flex;flex-direction:column;justify-content:center;gap:7px;padding:0 0 0 2px;}
  #homeTabContent .eh-sdots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.28);cursor:pointer;transition:background .2s,transform .2s;}
  #homeTabContent .eh-sdots i.on{background:#2dd4bf;transform:scale(1.25);}
  #homeTabContent .eh-today .eh-av{margin-left:auto;flex:none;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);color:#7fe3d6;display:flex;align-items:center;justify-content:center;}

  /* slider ច្បាប់ (ចំណុចក្រោមលេខ) */
  #homeTabContent .eh-ldots{display:flex;gap:6px;margin-top:6px;padding:4px 0;}
  #homeTabContent .eh-ldots i{width:16px;height:5px;border-radius:3px;background:rgba(255,255,255,.25);cursor:pointer;transition:all .25s;}
  #homeTabContent .eh-ldots i.on{background:#2dd4bf;width:22px;}
  #homeTabContent #ehRingArc{transition:stroke-dashoffset .45s ease;}

  /* កាតអូសកត់ម៉ោង — រចនាតាមគម្រូ */
  #ehSlide .box{background:linear-gradient(165deg,rgba(22,66,72,.96),rgba(8,32,42,.97)) !important;border:1.5px solid rgba(226,232,150,.42);border-radius:28px;padding:16px 18px 18px;
    box-shadow:0 0 0 1px rgba(226,232,150,.12),0 0 30px rgba(214,224,120,.32),0 12px 28px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);}
  #ehSlide .tt{font-size:1rem;font-weight:600;letter-spacing:.1px;margin:0 0 12px;padding-left:2px;color:#f1f8fa;}
  #ehSlide .track{height:58px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 2px 6px rgba(0,0,0,.3);}
  #ehSlide .handle{top:4px;left:4px;width:48px;height:48px;background:radial-gradient(circle at 35% 30%,#4fe3cf,#14b8a6);color:#fff;box-shadow:0 4px 14px rgba(20,184,166,.55),inset 0 1px 0 rgba(255,255,255,.35);}
  #ehSlide .handle svg{width:26px;height:26px;}
  #ehSlide .hint{padding-left:56px;font-size:.92rem;font-weight:500;color:#d3e2e8;gap:12px;}
  #ehSlide .hint .ar{font-size:1.25rem;opacity:.8;letter-spacing:-2px;}

  /* ចំណុចបញ្ឈរខាងស្តាំកាតកត់ម៉ោង (ដូចគម្រូ) */
  #ehSlide .box{display:flex;align-items:center;gap:8px;}
  #ehSlide .main{flex:1;min-width:0;}
  #ehSlide .sdots{display:flex;flex-direction:column;gap:0;padding:0;margin-right:-8px;}
  #ehSlide .sdots i{width:7px;height:7px;padding:7px;box-sizing:content-box;border-radius:50%;background:rgba(255,255,255,.3);background-clip:content-box;cursor:pointer;transition:background .2s,transform .2s;}
  #ehSlide .sdots i.on{background:#2dd4bf;background-clip:content-box;transform:scale(1.2);}

  /* លាក់/បង្ហាញតាម scroll */
  #ehSlide{transition:opacity .28s ease,translate .28s ease;}
  #ehSlide.eh-hide{opacity:0;pointer-events:none;translate:0 36px;}

  /* iPhone / ទូរស័ព្ទគ្រប់ទំហំ */
  html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}
  @supports (height:100dvh){.portal{min-height:100dvh;}}
  #homeTabContent{padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);-webkit-tap-highlight-color:transparent;}
  #homeTabContent .eh-row1>*,#homeTabContent .eh-row2>*,#homeTabContent .menu-card>*{min-width:0;}
  #homeTabContent .eh-chips,#homeTabContent .banner-track{-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;}
  #homeTabContent button,#homeTabContent [data-go]{touch-action:manipulation;}
  @media (max-width:380px){
    #homeTabContent .home-head{padding-left:12px !important;padding-right:12px !important;}
    #homeTabContent .banner-track{margin-left:12px !important;margin-right:12px !important;}
    #homeTabContent .eh-row1{grid-template-columns:1.5fr 1fr 1fr;gap:8px;padding:12px 12px 0;}
    #homeTabContent .eh-ring{padding:10px;gap:8px;}
    #homeTabContent .eh-ring svg{width:42px;height:42px;}
    #homeTabContent .eh-ring .t{font-size:.68rem;}
    #homeTabContent .eh-ring .n{font-size:1.05rem;}
    #homeTabContent .eh-tile,#homeTabContent .menu-card .menu-row .lbl{font-size:.7rem !important;}
    #homeTabContent .eh-ico svg,#homeTabContent .menu-card .menu-row .menu-ico svg{width:30px !important;height:30px !important;}
    #homeTabContent .menu-card{padding:10px 12px 0 !important;gap:8px;}
    #homeTabContent .eh-chips{padding:12px 12px 2px;gap:8px;}
    #homeTabContent .eh-row2{padding:12px 12px 0;gap:8px;}
    #homeTabContent .eh-card{padding:12px;}
    #homeTabContent #homePayCards,#homeTabContent #homeHolidayCard.eh-open{margin-left:12px !important;margin-right:12px !important;}
  }

  /* ប៊ូតុងអូសកត់ម៉ោង */
  #ehSlide{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));width:min(480px,calc(100% - 40px));z-index:60;display:none;}
  #ehSlide.on{display:block;}
  body:has(#mainCard[style*="none"]) #ehSlide{display:none !important;}
  #ehSlide .box{background:linear-gradient(160deg,#10424c,#08222f) !important;border:1px solid rgba(250,215,90,.5);border-radius:20px;padding:9px 12px 11px;box-shadow:0 0 0 1px rgba(250,204,21,.16),0 0 26px rgba(250,204,21,.34),0 10px 24px rgba(0,0,0,.5);color:#eaf6fb;}
  #ehSlide .tt{font-weight:700;font-size:.8rem;margin-bottom:7px;padding-left:4px;}
  #ehSlide .track{position:relative;height:46px;border-radius:999px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14);overflow:hidden;user-select:none;touch-action:none;}
  #ehSlide .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:600;color:#cfe3ea;pointer-events:none;padding-left:46px;font-size:.8rem;text-align:center;}
  #ehSlide .hint .ar{opacity:.7;font-size:1.05rem;}
  #ehSlide .handle{position:absolute;top:3px;left:3px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2dd4bf,#14b8a6);display:flex;align-items:center;justify-content:center;color:#04201c;box-shadow:0 4px 14px rgba(20,184,166,.55);cursor:grab;touch-action:none;}
  #ehSlide .handle svg{width:22px;height:22px;}
  #ehSlide.locked .handle{background:#64748b;box-shadow:none;cursor:not-allowed;color:#fff;}
  #ehSlide.locked .hint{opacity:.75;}

  /* របារម៉ឺនុយខាងក្រោម (ទទឹកអត់ថ្លា) */
  body:has(#homeTabContent.active) .bnav{background:#081826 !important;border:1px solid rgba(255,255,255,.14) !important;border-radius:22px;box-shadow:0 -6px 24px rgba(0,0,0,.45);}
  body:has(#homeTabContent.active) button.bnav-item{color:#8fb4ba;}
  body:has(#homeTabContent.active) button.bnav-item.active{color:#2dd4bf;}

  /* ប៊ូតុង ⓘ (about-contact.js) */
  body:has(#mainCard:not([style*="none"]) #homeTabContent.active) .ac-fab{bottom:calc(206px + env(safe-area-inset-bottom,0px));right:22px;width:34px;height:34px;border-radius:11px;background:#0f3c46;border:1px solid rgba(255,255,255,.2);color:#7fe3d6;box-shadow:0 4px 14px rgba(0,0,0,.4);}

  /* ម៉ាស៊ីនស្កេន: ផ្ទាំងពេញខាងលើ (មិនរុញមាតិកា) */
  #homeTabContent #empQrReader{position:fixed !important;top:0;left:0;right:0;bottom:calc(206px + env(safe-area-inset-bottom,0px));margin:0 !important;z-index:55;background:#000;border:0 !important;border-radius:0 0 26px 26px;overflow:hidden;min-height:0;box-shadow:0 10px 30px rgba(0,0,0,.5);}
  #homeTabContent #empQrReader video{width:100% !important;height:100% !important;object-fit:cover;}
  #homeTabContent #empScanHint{display:none !important;}
  #homeTabContent #empScanResult{position:fixed;left:22px;right:22px;bottom:calc(294px + env(safe-area-inset-bottom,0px));z-index:61;margin:0 !important;padding:8px 12px;border-radius:14px;background:rgba(8,24,38,.92);text-align:center;}
  #homeTabContent #empScanResult:empty{display:none;}
  #ehScanClose{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:calc(222px + env(safe-area-inset-bottom,0px));z-index:62;align-items:center;gap:8px;padding:11px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(8,24,38,.88);color:#fff;font-weight:700;font-size:.9rem;font-family:inherit;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,.45);}
  #homeTabContent #empQrReader:not([style*="none"]) + #ehScanClose{display:flex;}
  `;

  /* ---------- សមាសភាព ---------- */
  let observers = [], built = false, lastRec = null, leavePages = [], leavePage = 0, slidePage = 0;

  function greet() { const h = new Date().getHours(); return h < 12 ? 'អរុណសួស្តី' : (h < 17 ? 'ទិវាសួស្តី' : 'សាយណ្ហសួស្តី'); }
  function go(tab) { if (typeof switchEmpTab === 'function') switchEmpTab(tab); }

  function build() {
    const H = home();
    if (!H || built) return;
    if (!$('empHomeStyles')) { const st = document.createElement('style'); st.id = 'empHomeStyles'; st.textContent = CSS; document.head.appendChild(st); }
    const head = H.querySelector('.home-head');
    if (!head) return;
    built = true;

    // ១) ស្កេន + ជួង៖ ដាក់ខាងស្តាំជួរស្វាគមន៍ (មិនមានរបារដាច់ដោយឡែកទៀតទេ)
    const icons = document.createElement('div');
    icons.className = 'eh-icons';
    icons.innerHTML = `<button type="button" class="eh-ibtn" id="ehScanBtn" aria-label="ស្កេន">${ic('scan', 22)}</button>
        <button type="button" class="eh-ibtn" id="ehBell" aria-label="ដំណឹង">${ic('bell', 22)}<span class="eh-dot" id="ehBellDot"></span></button>`;
    head.appendChild(icons);
    $('ehBell').onclick = () => go('notify');
    $('ehScanBtn').onclick = () => trigger();

    // ២) ស្វាគមន៍ (ប្រើ .home-head ដែលមានស្រាប់)
    const hello = head.querySelector('.h-hello'); if (hello) hello.id = 'ehHello';

    // ៣) ជួរទី១៖ រង្វង់ច្បាប់ + សុំច្បាប់ + ថែមម៉ោង
    const row1 = document.createElement('div');
    row1.className = 'eh-row1';
    row1.innerHTML = `
      <div class="eh-glass eh-ring" id="ehRing" data-go="leave" role="button">
        <svg viewBox="0 0 62 62"><circle cx="31" cy="31" r="25" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="7"/>
          <circle id="ehRingArc" cx="31" cy="31" r="25" fill="none" stroke="#2dd4bf" stroke-width="7" stroke-linecap="round" stroke-dasharray="157" stroke-dashoffset="157" transform="rotate(-90 31 31)"/></svg>
        <div><div class="t" id="ehLeaveTitle">ច្បាប់ប្រចាំឆ្នាំ</div><div class="n"><span id="ehLeaveNow">–</span> <small>/ <span id="ehLeaveTot">–</span></small></div><div class="eh-ldots" id="ehLdots"><i class="on"></i><i></i></div></div>
      </div>
      <button type="button" class="eh-glass eh-tile" data-go="leave" style="--c:#93c5fd"><span class="eh-ico">${ic('door', 34)}</span>សុំច្បាប់</button>
      <button type="button" class="eh-glass eh-tile" data-go="ot" style="--c:#5eead4"><span class="eh-ico">${ic('alarm', 34)}</span>ថែមម៉ោង</button>`;
    const anchor = H.querySelector('.home-scan');
    H.insertBefore(row1, anchor ? anchor.nextSibling : H.querySelector('.menu-card'));
    row1.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    // slider រង្វង់ច្បាប់៖ អូសឆ្វេង/ស្តាំ ឬចុចចំណុច ដើម្បីប្តូរ (ចុចកាតធម្មតា → ទៅទំព័រសុំច្បាប់)
    const ring = $('ehRing'); let sx = null, swiped = false;
    ring.style.touchAction = 'pan-y';
    ring.addEventListener('pointerdown', e => { sx = e.clientX; swiped = false; });
    ring.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 30) { swiped = true; setLeavePage(leavePage + (dx < 0 ? 1 : -1)); } });
    ring.addEventListener('pointercancel', () => { sx = null; });
    ring.addEventListener('click', e => { if (swiped) { e.stopImmediatePropagation(); e.preventDefault(); swiped = false; } }, true);
    $('ehLdots').addEventListener('click', e => { e.stopPropagation(); const d = e.target.closest('i'); if (d) setLeavePage(+d.dataset.i); });

    // ៤) ក្រឡាក្នុង .menu-card៖ កាត់ស្លាកវែង
    const corr = H.querySelector('.menu-row[data-go="correction"] .lbl'); if (corr) corr.textContent = 'កែវត្តមាន';
    const cal = H.querySelector('.menu-row[data-go="attendance"] .lbl'); if (cal) cal.textContent = 'ប្រតិទិន';

    // ៥) ឈីព៖ ដំណឹង · មតិកែលម្អ · ប្រវត្តិរូប
    const chips = document.createElement('div');
    chips.className = 'eh-chips';
    chips.innerHTML = `<button type="button" class="eh-chip" data-go="notify">${ic('mega', 20)} ដំណឹង <span class="eh-badge" id="ehChipBadge"></span></button>
      <button type="button" class="eh-chip" data-go="feedback">${ic('chat', 20)} មតិកែលម្អ</button>
      <button type="button" class="eh-chip" data-go="profile">${ic('user', 20)} ប្រវត្តិរូប</button>`;
    const menu = H.querySelector('.menu-card');
    menu.insertAdjacentElement('afterend', chips);
    chips.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

    // ៦) ជួរទី២៖ ព្រឹត្តិការណ៍ខាងមុខ + ថ្ងៃនេះ
    const row2 = document.createElement('div');
    row2.className = 'eh-row2';
    row2.innerHTML = `
      <div class="eh-glass eh-card" id="ehUpcoming"><h4>ព្រឹត្តិការណ៍ខាងមុខ</h4><div id="ehUpBody"></div></div>
      <div class="eh-glass eh-card" id="ehToday" data-go="clock"><div class="eh-today"><div class="eh-cal"><small id="ehMon"></small><b id="ehDay"></b></div>
        <div><div style="font-size:.76rem;opacity:.75;">ថ្ងៃនេះ</div><div style="font-weight:800;" id="ehDow"></div></div><span class="eh-av" aria-hidden="true">${ic('user', 18)}</span></div>
        <div class="eh-duty"><div>ចូល<b id="ehIn">--:--</b></div><div>ចេញ<b id="ehOut">--:--</b></div></div></div>`;
    chips.insertAdjacentElement('afterend', row2);
    $('ehToday').onclick = () => go('clock');
    $('ehUpcoming').onclick = () => { const c = $('homeHolidayCard'); if (c) c.classList.toggle('eh-open'); };

    // ៧) ប៊ូតុងអូសកត់ម៉ោង (នៅខាងក្រៅ tab ដើម្បីឱ្យអណ្តែតលើរបារក្រោម)
    const slide = document.createElement('div');
    slide.id = 'ehSlide';
    slide.innerHTML = `<div class="box"><div class="main"><div class="tt" id="ehSlideTitle">កត់ម៉ោងធម្មតា</div>
      <div class="track" id="ehTrack"><div class="hint"><span class="ar">»</span><span id="ehSlideHint">អូសដើម្បីស្កេនកត់ម៉ោង</span><span class="ar">»</span></div><div class="handle" id="ehHandle">${ic('clock')}</div></div></div>
      <div class="sdots" id="ehSdots2" role="tablist"><i class="on" data-i="0"></i><i data-i="1"></i></div></div>`;
    document.body.appendChild(slide);
    $('ehSdots2').addEventListener('click', e => { const d = e.target.closest('i'); if (d) setSlidePage(+d.dataset.i); });
    bindSlide();
    slide.addEventListener('pointerdown', () => { touching = true; peekSlide(); });
    ['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { if (touching) { touching = false; peekSlide(); } }));
    // រាប់តែការ scroll ទំព័រ (ឡើង/ចុះ) ≥ 8px — មិនរាប់ banner ដើរស្វ័យប្រវត្តិ, slider, ឈីព ឬ layout ប្រែ
    let lastY = window.scrollY || 0;
    window.addEventListener('scroll', e => {
      const t = e.target;
      if (t !== document && t !== document.documentElement && t !== document.body) return;
      const y = window.scrollY || 0;
      if (Math.abs(y - lastY) < 8) return;
      lastY = y;
      if (slide.classList.contains('on')) peekSlide();
    }, { passive: true, capture: true });
    peekSlide();   // បង្ហាញខ្លីៗពេលបើកទំព័រ ឲ្យអ្នកប្រើដឹងថាមាន

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

  function scanStarting() {   // កាមេរ៉ាកំពុងបើក (reader បង្ហាញ តែ empScannerRunning មិនទាន់ true)
    const r = $('empQrReader'), run = (typeof empScannerRunning !== 'undefined') && empScannerRunning;
    return !run && !!r && r.style.display !== 'none';
  }

  function setLeavePage(i) {
    if (!leavePages.length) return;
    leavePage = (i + leavePages.length) % leavePages.length;
    const p = leavePages[leavePage];
    $('ehLeaveTitle').textContent = p.t; $('ehLeaveNow').textContent = p.now; $('ehLeaveTot').textContent = p.tot;
    const pct = p.tot > 0 ? Math.max(0, Math.min(1, p.now / p.tot)) : 0;
    $('ehRingArc').style.strokeDashoffset = String(157 * (1 - pct));
    document.querySelectorAll('#ehLdots i').forEach((d, k) => d.classList.toggle('on', k === leavePage));
  }

  function cancelScan() {
    const running = (typeof empScannerRunning !== 'undefined') && empScannerRunning;
    if (typeof stopEmpScanner === 'function') stopEmpScanner();
    if (!running) {   // កាមេរ៉ាកំពុងចាប់ផ្តើម → លាក់ភ្លាមៗ ហើយរង់ចាំរហូតដល់ ១០វិ ទើបបញ្ឈប់ពេលវាដំណើរការ
      const r = $('empQrReader'); if (r) r.style.display = 'none';
      let n = 0;
      const t = setInterval(() => {
        n++;
        if (typeof empScannerRunning !== 'undefined' && empScannerRunning) { clearInterval(t); if (typeof stopEmpScanner === 'function') stopEmpScanner(); }
        else if (n >= 40) clearInterval(t);
      }, 250);
    }
    setTimeout(syncSlide, 400);
  }

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
    const was = s.classList.contains('on');
    s.classList.toggle('on', H.classList.contains('active')); alignSlide();
    if (!was && s.classList.contains('on')) peekSlide();
    const mc = $('mainCard'), dark = H.classList.contains('active') && mc && mc.style.display !== 'none';
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) { if (!tc.dataset.orig) tc.dataset.orig = tc.content; tc.content = dark ? '#0b3340' : tc.dataset.orig; }
  }

  /* ---------- ទិន្នន័យ ---------- */
  // ជំហានបន្ទាប់ + ម៉ោងតាមវេន (ដូច "Duty In: 8:30 AM" ក្នុងគម្រូ)
  function nextInfo(rec) {
    let sh = null;
    try { sh = (typeof getEmpShift === 'function') ? getEmpShift() : null; } catch (e) { /* ignore */ }
    const f = m => (sh && typeof fmtMinEmp === 'function' && typeof m === 'number') ? fmtMinEmp(m) : '';
    if (!rec || !rec.checkin) return { name: 'ចូលធ្វើការ', label: 'ម៉ោងចូល', time: f(sh && sh.start) };
    if (!rec.break_out) return { name: 'ចេញបាយ', label: 'ម៉ោងចេញបាយ', time: f(sh && sh.breakOut) };
    if (!rec.break_in) return { name: 'ចូលវិញពីសម្រាក', label: 'ម៉ោងចូលវិញ', time: f(sh && sh.breakIn) };
    if (!rec.checkout) return { name: 'ចេញពីការងារ', label: 'ម៉ោងចេញ', time: f(sh && sh.end) };
    return { name: 'រួចរាល់សម្រាប់ថ្ងៃនេះ', label: '', time: '' };
  }

  // ប្តូរ icon ក្នុង .menu-row ដែលមិនទាន់មាន SVG (ឧ. ប្រាក់កម្ចី ដែលបន្ថែមពី employee-loan.js)
  function fixMenuIcons() {
    const H = home(); if (!H) return;
    H.querySelectorAll('.menu-card .menu-ico').forEach(el => { if (!el.querySelector('svg') && !el.dataset.ehFix) { el.dataset.ehFix = '1'; } });
  }

  async function refresh() {
    build();
    if (!built) return;
    const e = (typeof currentEmployee !== 'undefined') ? currentEmployee : null;
    const hello = $('ehHello'); if (hello) hello.textContent = greet();
    if (e) { const nm = $('homeName'); if (nm && !nm.textContent) nm.textContent = e.name; }
    fixMenuIcons();

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
      const list = Object.keys(hol).filter(x => x >= t).sort().slice(0, 6);
      const evs = list.map(x => {
        const raw = String(hol[x] || ''), swap = (typeof isSwapHoliday === 'function') && isSwapHoliday(x);
        const name = (swap && typeof HOLIDAY_SWAP_TAG !== 'undefined' ? raw.slice(HOLIDAY_SWAP_TAG.length).trim() : raw).replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, dd) => dd + '/' + m) || 'ថ្ងៃបុណ្យ';
        const dt = new Date(x + 'T00:00:00');
        return `<div class="eh-ev"><div class="ic">${ic(swap ? 'swap' : 'party', 18)}</div><div><div class="d">${dt.getDate()} ${KH_MON[dt.getMonth()]} ${dt.getFullYear()}</div>${esc(name)}</div></div>`;
      });
      const body = $('ehUpBody');
      if (!evs.length) body.innerHTML = '<div style="opacity:.7;font-size:.8rem;">មិនមានថ្ងៃបុណ្យខាងមុខ</div>';
      else {
        clearInterval(evTimer);
        const pages = []; for (let i = 0; i < evs.length; i += 2) pages.push(evs.slice(i, i + 2).join(''));
        body.innerHTML = `<div class="eh-slides" id="ehSlides">${pages.map(h => `<div class="eh-page">${h}</div>`).join('')}</div>`
          + (pages.length > 1 ? `<div class="eh-sdots" id="ehSdots">${pages.map((_, i) => `<i data-i="${i}"${i ? '' : ' class="on"'}></i>`).join('')}</div>` : '');
        const sl = $('ehSlides'), dots = $('ehSdots');
        if (sl && dots) {
          const setOn = () => { const k = Math.round(sl.scrollTop / (sl.clientHeight || 1)); dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === k)); };
          sl.addEventListener('scroll', setOn, { passive: true });
          dots.addEventListener('click', ev => { ev.stopPropagation(); const d = ev.target.closest('i'); if (d) sl.scrollTo({ top: d.dataset.i * sl.clientHeight, behavior: 'smooth' }); });
          sl.addEventListener('click', ev => ev.stopPropagation());   // ចុចក្នុង slider មិនបើកកាតថ្ងៃបុណ្យ
          evTimer = setInterval(() => { if (document.hidden || !sl.isConnected) return; const k = Math.round(sl.scrollTop / (sl.clientHeight || 1)); sl.scrollTo({ top: ((k + 1) % pages.length) * sl.clientHeight, behavior: 'smooth' }); }, 5000);
        }
      }
    } catch (err) { /* ignore */ }

    // ច្បាប់ប្រចាំឆ្នាំ
    try {
      if (e && typeof fetchLeaveBalances === 'function') {
        const bal = await fetchLeaveBalances(new Date().getFullYear()), a = bal.annual, pd = bal.paid;
        leavePages = [{ t: 'ច្បាប់ប្រចាំឆ្នាំ', now: a.remaining, tot: a.total }];
        if (pd) leavePages.push({ t: 'ច្បាប់មានប្រាក់ខែ', now: pd.remaining, tot: pd.quota });
        const dots = $('ehLdots'); if (dots) dots.innerHTML = leavePages.map((_, i) => '<i' + (i ? '' : ' class="on"') + ' data-i="' + i + '"></i>').join('');
        setLeavePage(leavePage);
      }
    } catch (err) { /* ignore */ }
    syncVisibility();
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
    const rdr = $('empQrReader'); document.body.classList.toggle('eh-scanning', !!rdr && rdr.style.display !== 'none');
    const st = slideState(), ni = nextInfo(lastRec);
    if (st.running || scanStarting()) peekSlide();
    if (st.running) slidePage = 0;   // កំពុងស្កេន → ត្រឡប់ទំព័រកត់ម៉ោងធម្មតា
    document.querySelectorAll('#ehSdots2 i').forEach((d, k) => d.classList.toggle('on', k === slidePage));
    if (slidePage === 1) {   // ទំព័រទី២៖ ទៅទំព័រ "ធ្វើការថែមម៉ោង" (មានស្រាប់)
      s.classList.remove('locked');
      $('ehSlideTitle').textContent = 'ធ្វើការថែមម៉ោង';
      $('ehSlideHint').textContent = 'អូសដើម្បីបើកទំព័រថែមម៉ោង';
      $('ehHandle').innerHTML = ic('alarm');
      return;
    }
    s.classList.toggle('locked', st.locked);
    $('ehSlideTitle').textContent = st.locked ? '🔒 ការស្កេនបិទ' : 'កត់ម៉ោងធម្មតា · ' + ni.name;
    $('ehSlideHint').textContent = st.locked ? (st.msg || 'ការស្កេនបិទ')
      : (st.running ? 'ចុចដើម្បីបញ្ឈប់ការស្កេន' : (ni.time ? ni.label + ': ' + ni.time : (ni.label ? 'អូសដើម្បីស្កេនកត់ម៉ោង' : ni.name)));
    $('ehHandle').innerHTML = ic(st.running ? 'stop' : (st.locked ? 'lock' : 'clock'));
  }

  /* កាតអូសស្កេន៖ លាក់ជាធម្មតា · បង្ហាញពេល scroll · លាក់វិញបន្ទាប់ពីឈប់ scroll ~២.៥វិ */
  let hideT = null, touching = false, evTimer = null;
  function slideBusy() { return touching || slideState().running || scanStarting(); }
  function maybeHide() {
    const s = $('ehSlide'); if (!s) return;
    if (slideBusy()) { hideT = setTimeout(maybeHide, 1200); return; }   // កំពុងប្រើ/កំពុងស្កេន → ទុកបង្ហាញ
    s.classList.add('eh-hide');
  }
  function peekSlide() {
    const s = $('ehSlide'); if (!s) return;
    s.classList.remove('eh-hide');
    clearTimeout(hideT); hideT = setTimeout(maybeHide, 2500);
  }

  function setSlidePage(i) { slidePage = i ? 1 : 0; syncSlide(); }
  function slideAction() { if (slidePage === 1) go('ot'); else trigger(); }   // ប៊ូតុងស្កេនខាងលើប្រើ trigger() ផ្ទាល់ ដូច្នេះស្កេនបានជានិច្ច

  function trigger() {
    const st = slideState();
    if (st.locked) { if (typeof customAlert === 'function') customAlert(st.msg || 'ការស្កេនបិទ'); return; }
    if (!st.running && scanStarting()) return;   // កាមេរ៉ាកំពុងបើក — កុំចាប់ផ្តើមស្ទួន
    if (typeof toggleEmpScanner === 'function') toggleEmpScanner();
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
      if (x >= max() * 0.82) { reset(); slideAction(); } else reset();
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', () => { dragging = false; reset(); });
    // ចុចធម្មតា (មិនអូស) → បើកម៉ាស៊ីនស្កេនដែរ / បញ្ឈប់ពេលកំពុងស្កេន
    handle.addEventListener('click', () => { if (!moved || slideState().running) { slideAction(); } });
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
