/* telegram-login.js — ចូលគណនី Admin តាម Telegram (ស្កេន QR) — មិនកែ script.js
   ដាក់ក្រោម <script src="script.js"> ក្នុង index.html។ ប្រើ qrcode-generator ដែលមានរួចហើយ។ */
(function () {
  'use strict';
  const card = document.getElementById('adminLoginCard');
  const loginBtn = document.getElementById('adminLoginBtn');
  if (!card || !loginBtn) return;

  const box = document.createElement('div');
  box.style.cssText = 'margin-top:14px;text-align:center;';
  box.innerHTML =
    '<div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:10px;">ឬ</div>' +
    '<button type="button" id="tgQrBtn" class="secondary" style="width:100%;padding:10px;font-size:0.85rem;">📱 ចូលតាម Telegram (ស្កេន QR)</button>' +
    '<div id="tgQrPanel" style="display:none;margin-top:14px;">' +
      '<div id="tgQrImg" style="display:inline-block;background:#fff;padding:8px;border-radius:8px;"></div>' +
      '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">ស្កេនដោយកាមេរ៉ា Telegram ឬកាមេរ៉ាទូរស័ព្ទ</div>' +
      '<div style="margin-top:10px;font-size:0.8rem;">លេខលើអេក្រង់៖ <strong id="tgQrNum" style="font-size:1.6rem;letter-spacing:2px;"></strong></div>' +
      '<div style="font-size:0.72rem;color:var(--text-muted);">ជ្រើសលេខនេះក្នុង Telegram ដើម្បីបញ្ជាក់</div>' +
      '<a id="tgQrLink" href="#" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:0.75rem;">បើកក្នុង Telegram (បើប្រើទូរស័ព្ទនេះ)</a>' +
      '<div id="tgQrStatus" style="margin-top:8px;font-size:0.75rem;"></div>' +
    '</div>';
  loginBtn.insertAdjacentElement('afterend', box);

  const $ = id => document.getElementById(id);
  let pollTimer = null, tickTimer = null, busy = false;

  function stop() { clearInterval(pollTimer); clearInterval(tickTimer); pollTimer = tickTimer = null; }
  function status(msg, bad) { const s = $('tgQrStatus'); s.textContent = msg; s.style.color = bad ? 'var(--danger)' : 'var(--text-muted)'; }
  function finish(msg, bad) { stop(); $('tgQrImg').style.opacity = '0.25'; status(msg, bad); $('tgQrBtn').textContent = '🔄 បង្កើត QR ថ្មី'; $('tgQrBtn').disabled = false; }

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'API ឆ្លើយកំហុស (HTTP ' + r.status + ')' + (r.status === 404 ? ' — រកមិនឃើញថត api/ លើ Vercel' : '');
    return { ok: r.ok, j };
  }

  async function start() {
    stop();
    $('tgQrBtn').disabled = true;
    let ok, j;
    try { ({ ok, j } = await post('/api/auth/qr-start')); }
    catch (e) { ok = false; j = { error: 'មិនអាចភ្ជាប់ទៅ API បាន៖ ' + e.message }; }
    if (!ok) { $('tgQrBtn').disabled = false; status(j.error || 'មិនអាចបង្កើត QR បាន', true); $('tgQrPanel').style.display = ''; return; }

    $('tgQrPanel').style.display = '';
    $('tgQrImg').style.opacity = '1';
    try {
      const q = qrcode(0, 'M'); q.addData(j.url); q.make();
      $('tgQrImg').innerHTML = q.createSvgTag(4, 0);
    } catch (e) { $('tgQrImg').textContent = ''; }
    $('tgQrNum').textContent = j.verify;
    $('tgQrLink').href = j.url;
    $('tgQrBtn').textContent = 'កំពុងរង់ចាំការបញ្ជាក់...';

    let left = j.expires_in;
    status('រង់ចាំការបញ្ជាក់ក្នុង Telegram... (' + left + 'វិ)');
    tickTimer = setInterval(() => { left--; if (left <= 0) finish('QR ផុតកំណត់', true); else status('រង់ចាំការបញ្ជាក់ក្នុង Telegram... (' + left + 'វិ)'); }, 1000);

    pollTimer = setInterval(async () => {
      if (busy) return; busy = true;
      try {
        const r = await post('/api/auth/qr-poll', { code: j.code });
        const s = r.j.status;
        if (s === 'ok' && r.j.token) {
          stop();
          setSessionToken(r.j.token);        // មានក្នុង script.js
          await checkAdminAuthAndInit();     // មានក្នុង script.js
        } else if (s === 'denied') finish('ត្រូវបានបដិសេធ', true);
        else if (s === 'expired') finish('QR ផុតកំណត់', true);
      } catch (e) { /* បណ្តាញមានបញ្ហា — ព្យាយាមម្តងទៀត */ }
      busy = false;
    }, 2000);
  }

  $('tgQrBtn').addEventListener('click', start);
})();
