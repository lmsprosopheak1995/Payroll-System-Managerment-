/* employee-time.js — នាឡិកាត្រូវតាមម៉ោង server (មិនពឹងលើនាឡិកាទូរស័ព្ទ)
   ដាក់ក្នុង employee.html មុន <script src="print.js"></script>
   - window.srvNow() → Date ដែលបានកែតាមម៉ោង server
   - គណនា offset ពី header "Date" របស់ server (origin តែមួយ ដូច្នេះអាន header បាន)
   - ធ្វើសមកាលកម្មម្តងទៀតពេលបើកកម្មវិធីវិញ និងរៀងរាល់ ៥ នាទី */
(function () {
  'use strict';
  let offset = 0;        // server − phone (ms)
  let bestRtt = Infinity;

  async function sample() {
    const t0 = Date.now();
    const res = await fetch('./manifest.webmanifest?_t=' + t0, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const dh = res.headers.get('date');
    if (!dh) return;
    const server = Date.parse(dh);
    if (!isFinite(server)) return;
    const rtt = t1 - t0;
    if (rtt > 4000) return;                       // បណ្តាញយឺតពេក មិនទុកចិត្ត
    // header Date មានតែវិនាទី (កាត់ចុះ) → បូក ~0.5s ហើយប្រើពាក់កណ្តាល RTT
    const est = server + 500 - (t0 + rtt / 2);
    if (rtt <= bestRtt * 1.5 || Math.abs(est - offset) > 1500) { offset = est; bestRtt = Math.min(bestRtt, rtt); }
  }

  async function sync(n) {
    for (let i = 0; i < (n || 3); i++) {
      try { await sample(); } catch (e) { /* offline → ប្រើ offset ចាស់ */ }
    }
  }

  window.srvNow = () => new Date(Date.now() + offset);
  window.srvOffsetMs = () => offset;

  sync(3);
  setInterval(() => sync(1), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { bestRtt = Infinity; sync(2); } });
  window.addEventListener('online', () => sync(2));
})();
