/* employee-update.js — 🔔 ដំណឹងកំណែថ្មី (Update alert) សម្រាប់ទំព័របុគ្គលិក
 * ដាក់បន្ទាប់ពី employee-loan.js ក្នុង employee.html:  <script src="employee-update.js"></script>
 * ឯកសារដែលត្រូវការ៖ employee-version.json (នៅ root ក្បែរ employee.html)
 *
 * ដំណើរការ៖ ពេលបើកកម្មវិធី / ត្រឡប់មកវិញ / រៀងរាល់ 30 នាទី ប្រព័ន្ធអាន employee-version.json ហើយប្រៀបធៀបកំណែ។
 * បើមានកំណែថ្មី → បង្ហាញផ្ទាំង "មានកំណែថ្មី" រាយ "ថ្មី" និង "កែ" ហើយប៊ូតុង «ធ្វើបច្ចុប្បន្នភាព» នឹង
 *   លុប cache + service worker ចាស់ រួចផ្ទុកទំព័រឡើងវិញ → បុគ្គលិកមិនចាំបាច់លុបកម្មវិធីចាស់ រួចដំឡើងថ្មីទៀតទេ។
 *
 * ពេលចេញកំណែថ្មី (អ្នកត្រូវកែ ២ កន្លែងឱ្យដូចគ្នា)៖
 *   ១) employee-version.json  → ប្តូរ "version" ហើយបន្ថែមធាតុថ្មីក្នុង "history" (ថ្មីបំផុតនៅលើ)
 *   ២) APP_VERSION ខាងក្រោម   → ដាក់លេខកំណែដូចគ្នា
 */
(function () {
  'use strict';

  const APP_VERSION = '2026.11.11';                 // ← កំណែនៃកូដនេះ (ត្រូវដូច "version" ក្នុង employee-version.json)
  const VERSION_URL = 'employee-version.json';
  const CHECK_EVERY_MS = 30 * 60 * 1000;            // ពិនិត្យរៀងរាល់ 30 នាទី
  const LS_APPLIED = 'emp_applied_version';
  const LS_JUST = 'emp_just_updated';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });   // 2026.11.11 < 2026.11.11-2 < 2026.12.01
  const running = () => {                                                       // កំណែដែលកំពុងដំណើរការ (ការពារ prompt ជាប់រហូត បើភ្លេចកែ APP_VERSION)
    let applied = ''; try { applied = localStorage.getItem(LS_APPLIED) || ''; } catch (e) { /* ignore */ }
    return cmp(applied, APP_VERSION) > 0 ? applied : APP_VERSION;
  };

  let remote = null, shownFor = '';

  /* ---------- UI ---------- */
  const CSS = `
  #empUpdOverlay{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10000;display:flex;align-items:flex-end;justify-content:center;}
  #empUpdOverlay .u-sheet{background:#0f1b2d;color:#e8eef5;border-radius:22px 22px 0 0;padding:20px 20px 24px;width:min(520px,100%);max-height:86vh;overflow:auto;box-shadow:0 -10px 40px rgba(0,0,0,.45);}
  #empUpdOverlay .u-h{display:flex;align-items:center;gap:12px;margin-bottom:6px;}
  #empUpdOverlay .u-ico{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#0d9488,#4f46e5);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex:0 0 auto;}
  #empUpdOverlay .u-t{font-weight:800;font-size:1.1rem;}
  #empUpdOverlay .u-s{font-size:.78rem;opacity:.7;}
  #empUpdOverlay .u-g{margin:14px 0 4px;font-weight:700;font-size:.86rem;}
  #empUpdOverlay ul{margin:0 0 6px 18px;padding:0;font-size:.86rem;line-height:1.75;}
  #empUpdOverlay .u-ver{margin-top:12px;font-size:.72rem;opacity:.55;}
  #empUpdOverlay .u-btns{display:flex;gap:10px;margin-top:16px;}
  #empUpdOverlay button{flex:1;padding:13px;border-radius:12px;border:0;font-size:.95rem;font-weight:800;cursor:pointer;}
  #empUpdOverlay .u-ok{background:#7ac142;color:#10260a;}
  #empUpdOverlay .u-later{background:rgba(128,128,128,.25);color:inherit;}
  #empUpdOverlay button:disabled{opacity:.6;cursor:wait;}
  #empUpdToast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#0d9488;color:#fff;padding:10px 18px;border-radius:999px;font-weight:700;font-size:.85rem;z-index:10001;box-shadow:0 6px 20px rgba(0,0,0,.35);}
  `;
  function ensureCss() { if (!$('empUpdStyles')) { const st = document.createElement('style'); st.id = 'empUpdStyles'; st.textContent = CSS; document.head.appendChild(st); } }

  // ប្រមូលរាយការណ៍ទាំងអស់ដែលថ្មីជាងកំណែបច្ចុប្បន្ន
  function entriesSince(ver, all) {
    const hist = (remote && remote.history) || [];
    return all ? hist.slice(0, 5) : hist.filter(h => cmp(h.version, ver) > 0);
  }
  function listHtml(entries) {
    const news = [], fixes = [];
    entries.forEach(h => { (h.new || []).forEach(t => news.push(t)); (h.fixed || []).forEach(t => fixes.push(t)); });
    return (news.length ? `<div class="u-g">✨ មុខងារថ្មី</div><ul>${news.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
         + (fixes.length ? `<div class="u-g">🛠 ការកែតម្រូវ</div><ul>${fixes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  }

  function closeSheet() { const o = $('empUpdOverlay'); if (o) o.remove(); }

  function showUpdate() {
    ensureCss(); closeSheet();
    const entries = entriesSince(running(), false);
    const o = document.createElement('div');
    o.id = 'empUpdOverlay';
    o.innerHTML = `<div class="u-sheet">
      <div class="u-h"><div class="u-ico">🎉</div><div><div class="u-t">មានកំណែថ្មី!</div><div class="u-s">កំណែ ${esc(remote.version)}${remote.date ? ' · ' + esc(remote.date) : ''}</div></div></div>
      ${listHtml(entries) || '<div class="u-g">មានការកែលម្អទូទៅ</div>'}
      <div class="u-ver">កំពុងប្រើកំណែ ${esc(running())}</div>
      <div class="u-btns">
        ${remote.force ? '' : '<button type="button" class="u-later" id="empUpdLater">ពេលក្រោយ</button>'}
        <button type="button" class="u-ok" id="empUpdNow">ធ្វើបច្ចុប្បន្នភាព</button>
      </div></div>`;
    document.body.appendChild(o);
    $('empUpdNow').onclick = performUpdate;
    const later = $('empUpdLater');
    if (later) later.onclick = () => { try { sessionStorage.setItem('emp_upd_dismissed', remote.version); } catch (e) { /* ignore */ } closeSheet(); };
    shownFor = remote.version;
  }

  function showChangelog() {                         // មើលអ្វីថ្មីៗ (ពេលមិនមានកំណែថ្មី)
    ensureCss(); closeSheet();
    const entries = entriesSince(APP_VERSION, true);
    const o = document.createElement('div');
    o.id = 'empUpdOverlay';
    o.innerHTML = `<div class="u-sheet">
      <div class="u-h"><div class="u-ico">📋</div><div><div class="u-t">អ្វីដែលថ្មីៗ</div><div class="u-s">កំណែបច្ចុប្បន្ន ${esc(running())}</div></div></div>
      ${entries.map(h => `<div class="u-g" style="margin-top:16px;">v${esc(h.version)}${h.date ? ' · ' + esc(h.date) : ''}</div>${listHtml([h])}`).join('') || '<div class="u-g">មិនទាន់មានទិន្នន័យ</div>'}
      <div class="u-btns"><button type="button" class="u-later" id="empUpdClose">បិទ</button></div></div>`;
    document.body.appendChild(o);
    $('empUpdClose').onclick = closeSheet;
    o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
  }

  /* ---------- ធ្វើបច្ចុប្បន្នភាព៖ លុប cache + SW ចាស់ រួចផ្ទុកថ្មី ---------- */
  async function performUpdate() {
    const btn = $('empUpdNow');
    if (btn) { btn.disabled = true; btn.textContent = 'កំពុងធ្វើបច្ចុប្បន្នភាព...'; }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) { console.warn('SW unregister', e); }
    try {
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
    } catch (e) { console.warn('cache delete', e); }
    try {
      localStorage.setItem(LS_APPLIED, remote ? remote.version : APP_VERSION);
      localStorage.setItem(LS_JUST, remote ? remote.version : APP_VERSION);
    } catch (e) { /* ignore */ }
    location.replace(location.pathname + '?_v=' + Date.now());   // ផ្ទុកឡើងវិញពី network ថ្មី (session ចូលគណនីនៅដដែល)
  }

  /* ---------- ពិនិត្យកំណែ ---------- */
  async function fetchRemote() {
    const r = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function check(manual) {
    try {
      remote = await fetchRemote();
    } catch (e) {
      if (manual) alertMsg('មិនអាចពិនិត្យកំណែបានទេ (សូមពិនិត្យអ៊ីនធឺណិត)');
      return;
    }
    if (remote && cmp(remote.version, running()) > 0) {
      let dismissed = ''; try { dismissed = sessionStorage.getItem('emp_upd_dismissed') || ''; } catch (e) { /* ignore */ }
      if (manual || remote.force || dismissed !== remote.version) { if (shownFor !== remote.version || manual || !$('empUpdOverlay')) showUpdate(); }
    } else if (manual) {
      alertMsg('✅ អ្នកកំពុងប្រើកំណែចុងក្រោយបំផុតហើយ (' + running() + ')');
    }
  }
  function alertMsg(m) { if (typeof customAlert === 'function') customAlert(m); else alert(m); }

  /* ---------- ប៊ូតុង/ព័ត៌មានកំណែ ក្នុងទំព័រប្រវត្តិរូប ---------- */
  function injectProfileRow() {
    const tab = $('profileTabContent');
    if (!tab || $('empVerRow')) return;
    const row = document.createElement('div');
    row.id = 'empVerRow';
    row.style.cssText = 'margin:18px 4px 8px;text-align:center;font-size:.78rem;opacity:.85;';
    row.innerHTML = `កម្មវិធីកំណែ <b>${esc(running())}</b><br>
      <a id="empVerWhats" style="cursor:pointer;text-decoration:underline;margin-right:14px;">អ្វីថ្មីៗ</a>
      <a id="empVerCheck" style="cursor:pointer;text-decoration:underline;">ពិនិត្យកំណែថ្មី</a>`;
    tab.appendChild(row);
    $('empVerWhats').onclick = async () => { if (!remote) { try { remote = await fetchRemote(); } catch (e) { /* ignore */ } } showChangelog(); };
    $('empVerCheck').onclick = () => check(true);
  }

  /* ---------- ចាប់ផ្តើម ---------- */
  function start() {
    // សម្អាត ?_v= ពី URL ក្រោយផ្ទុកឡើងវិញ
    try { if (/[?&]_v=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
    // បង្ហាញ toast បន្ទាប់ពីធ្វើបច្ចុប្បន្នភាពរួច
    try {
      const j = localStorage.getItem(LS_JUST);
      if (j) { localStorage.removeItem(LS_JUST); ensureCss(); const t = document.createElement('div'); t.id = 'empUpdToast'; t.textContent = '✅ បានធ្វើបច្ចុប្បន្នភាពទៅកំណែ ' + j; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); }
    } catch (e) { /* ignore */ }
    injectProfileRow();
    new MutationObserver(injectProfileRow).observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => check(false), 2500);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
    setInterval(() => check(false), CHECK_EVERY_MS);
  }
  window.empUpdate = { check, showChangelog, version: () => running() };
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
