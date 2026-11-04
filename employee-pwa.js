/* employee-pwa.js — ដំឡើងកម្មវិធី (PWA) + ដំណឹង Web Push សម្រាប់ទំព័របុគ្គលិក
 * ដាក់បន្ទាប់ពី employee-modern.js ក្នុង employee.html:  <script src="employee-pwa.js"></script>
 * ត្រូវការ៖ sw.js, manifest.webmanifest, icons/ នៅ folder ជាមួយ employee.html
 * ដំណឹងពេលបិទកម្មវិធី ត្រូវការ VAPID key + push-setup.sql + Edge Function send-push (មើល README ក្នុងចម្លើយ)
 */
(function () {
  'use strict';

  // ⚠️ បិទភ្ជាប់ VAPID Public Key (បង្កើតដោយ: npx web-push generate-vapid-keys). ទុកទទេ = លាក់ប៊ូតុងដំណឹង
  const VAPID_PUBLIC_KEY = '';

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const $ = id => document.getElementById(id);
  const alertMsg = m => (typeof customAlert === 'function' ? customAlert(m) : alert(m));

  /* ---------- Service Worker ---------- */
  let swReg = null;
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try { swReg = await navigator.serviceWorker.register('sw.js'); return swReg; }
    catch (e) { console.warn('SW register failed', e); return null; }
  }

  /* ---------- ដំឡើងកម្មវិធី ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstallCard(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; renderInstallCard(); });

  const cardStyle = 'background:rgba(128,128,128,.10);border:1px solid var(--border, rgba(128,128,128,.25));border-radius:14px;padding:12px 14px;margin:12px 0;color:inherit;';
  const btnStyle = 'padding:8px 14px;border-radius:10px;border:0;background:var(--accent,#14b8a6);color:#fff;font-weight:700;cursor:pointer;';

  function renderInstallCard() {
    const home = $('homeTabContent');
    if (!home) return;
    let box = $('pwaInstallCard');
    if (isStandalone()) { if (box) box.remove(); return; }       // បានដំឡើងរួច
    if (!deferredPrompt && !isIOS) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'pwaInstallCard'; home.insertBefore(box, home.firstChild); }
    box.innerHTML = `<div style="${cardStyle}">
      <div style="font-weight:700;margin-bottom:4px;">📲 ដំឡើងកម្មវិធីលើអេក្រង់ទូរស័ព្ទ</div>
      <div style="font-size:.82rem;opacity:.8;margin-bottom:8px;">បើកលឿន ដូចកម្មវិធីធម្មតា និងទទួលដំណឹងបាន។</div>
      ${deferredPrompt
        ? `<button id="pwaInstallBtn" style="${btnStyle}">ដំឡើងឥឡូវនេះ</button>`
        : `<div style="font-size:.82rem;">នៅលើ iPhone៖ ចុចប៊ូតុង <b>Share ⬆︎</b> ក្នុង Safari រួចជ្រើស <b>"Add to Home Screen"</b>។</div>`}
    </div>`;
    const b = $('pwaInstallBtn');
    if (b) b.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
      deferredPrompt = null; renderInstallCard();
    };
  }

  /* ---------- Web Push ---------- */
  function urlB64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  async function currentSub() {
    const reg = swReg || (await navigator.serviceWorker.getRegistration());
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function enablePush() {
    try {
      if (isIOS && !isStandalone()) { alertMsg('នៅលើ iPhone សូមដំឡើងកម្មវិធីលើអេក្រង់ (Add to Home Screen) ជាមុនសិន ទើបទទួលដំណឹងបាន'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alertMsg('មិនបានអនុញ្ញាតដំណឹងទេ។ អ្នកអាចបើកវិញក្នុងការកំណត់ browser។'); return; }
      const reg = swReg || (await registerSW());
      if (!reg) { alertMsg('browser នេះមិនគាំទ្រ Service Worker'); return; }
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const j = sub.toJSON();
      const { error } = await supabaseClient.rpc('save_push_subscription', {
        p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent.slice(0, 200)
      });
      if (error) { alertMsg('រក្សាទុកការជាវដំណឹងមិនបាន៖ ' + error.message); try { await sub.unsubscribe(); } catch (e) { /* ignore */ } return; }
      alertMsg('✅ បានបើកដំណឹង — ទទួលបានទោះបិទកម្មវិធី');
    } catch (e) { console.error(e); alertMsg('បើកដំណឹងមិនបាន៖ ' + (e.message || e)); }
    renderPushCard();
  }

  async function disablePush() {
    try {
      const sub = await currentSub();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try { await supabaseClient.rpc('delete_push_subscription', { p_endpoint: endpoint }); } catch (e) { /* ignore */ }
      }
    } catch (e) { console.error(e); }
    renderPushCard();
  }

  async function renderPushCard() {
    const tab = $('notifyTabContent');
    if (!tab || !VAPID_PUBLIC_KEY || !pushSupported()) return;   // មិនទាន់កំណត់ key ឬ browser មិនគាំទ្រ → លាក់
    let box = $('pwaPushCard');
    if (!box) { box = document.createElement('div'); box.id = 'pwaPushCard'; tab.insertBefore(box, tab.firstChild); }
    const sub = await currentSub();
    const perm = Notification.permission;
    const on = !!sub && perm === 'granted';
    box.innerHTML = `<div style="${cardStyle}">
      <div style="font-weight:700;margin-bottom:4px;">🔔 ដំណឹងពេលបិទកម្មវិធី</div>
      <div style="font-size:.82rem;opacity:.8;margin-bottom:8px;">${on ? 'បើករួច — អ្នកនឹងទទួលដំណឹងពីក្រុមហ៊ុនលើទូរស័ព្ទនេះ។' : (perm === 'denied' ? 'ដំណឹងត្រូវបានបិទក្នុងការកំណត់ browser។ សូមបើកវិញដោយដៃ។' : 'បើកដើម្បីទទួលដំណឹង (ដំណឹងថ្មី ថ្ងៃដោះដូរ ។ល។) ទោះមិនបានបើកកម្មវិធី។')}</div>
      ${perm === 'denied' ? '' : `<button id="pwaPushBtn" style="${on ? btnStyle.replace('var(--accent,#14b8a6)', '#64748b') : btnStyle}">${on ? 'បិទដំណឹង' : 'បើកដំណឹង'}</button>`}
    </div>`;
    const b = $('pwaPushBtn');
    if (b) b.onclick = () => (on ? disablePush() : enablePush());
  }

  /* ---------- ចាប់ផ្តើម ---------- */
  registerSW();
  document.addEventListener('DOMContentLoaded', () => { renderInstallCard(); renderPushCard(); });
  if (document.readyState !== 'loading') { renderInstallCard(); renderPushCard(); }
  // ទំព័រ/ផ្ទាំង render ក្រោយចូលគណនី → បង្ហាញម្តងទៀតពេលប្តូរផ្ទាំង
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-go]')) setTimeout(() => { renderInstallCard(); renderPushCard(); }, 150); });
})();
