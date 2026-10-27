/* telegram-login.js — ចូលគណនី Admin តាម Telegram (ស្កេន QR) — មិនកែ script.js
   ដាក់ក្រោម <script src="script.js"> ក្នុង index.html។ ប្រើ qrcode-generator ដែលមានរួចហើយ។
   UI ថ្មី៖ tab «ពាក្យសម្ងាត់ | Telegram»។ ពេលជ្រើស Telegram → លាក់ក្បាល, Username, ពាក្យសម្ងាត់, ប៊ូតុងចូលគណនី
   ហើយគ្មានប៊ូតុង «បើកក្នុង Telegram» ទៀតទេ។ */
(function () {
  'use strict';
  const card = document.getElementById('adminLoginCard');
  const loginBtn = document.getElementById('adminLoginBtn');
  if (!card || !loginBtn) return;

  // ---------- Style (ដាក់ក្នុងឯកសារនេះ មិនបាច់កែ CSS) ----------
  const st = document.createElement('style');
  st.textContent = `
    .tgx-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:0 0 18px;border-radius:12px;background:rgba(127,140,155,.16)}
    .tgx-tab{display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border:0;border-radius:9px;background:transparent;color:var(--text-muted,#8fa3b3);font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
    .tgx-tab:hover{color:var(--text,#e8f1f6)}
    .tgx-tab.on{background:var(--primary,#0ea5a4);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .tgx-tab:focus-visible,.tgx-retry:focus-visible{outline:3px solid #229ed9;outline-offset:2px}
    .tgx-tab svg{width:16px;height:16px;flex:none}
    .tgx-pane{display:none;flex-direction:column;align-items:center;text-align:center}
    #adminLoginCard.tgx-tg > :not(.tgx-tabs):not(.tgx-pane){display:none !important}
    #adminLoginCard.tgx-tg > .tgx-pane{display:flex}
    .tgx-sub{margin:0 0 16px;font-size:.78rem;color:var(--text-muted,#8fa3b3)}
    .tgx-qr{width:200px;max-width:100%;padding:10px;border-radius:16px;background:#fff;box-shadow:0 0 0 4px rgba(34,158,217,.25);transition:opacity .2s}
    .tgx-qr svg{display:block;width:100%;height:auto}
    .tgx-code{margin-top:18px;font-size:.8rem;color:var(--text-muted,#8fa3b3)}
    .tgx-code b{display:inline-block;margin-left:8px;font-size:2.2rem;line-height:1;letter-spacing:.14em;color:var(--text,#fff);vertical-align:middle}
    .tgx-hint{margin-top:6px;font-size:.72rem;color:var(--text-muted,#8fa3b3)}
    .tgx-status{margin-top:14px;font-size:.75rem;min-height:1.2em;color:var(--text-muted,#8fa3b3)}
    .tgx-retry{display:none;margin-top:12px;padding:9px 18px;border:0;border-radius:999px;background:#229ed9;color:#fff;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}
  `;
  document.head.appendChild(st);

  // ---------- Tabs + Telegram pane (ជា child ផ្ទាល់នៃ card) ----------
  const tabs = document.createElement('div');
  tabs.className = 'tgx-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.innerHTML =
    '<button type="button" class="tgx-tab on" data-m="pw" role="tab" aria-selected="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>ពាក្យសម្ងាត់</button>' +
    '<button type="button" class="tgx-tab" data-m="tg" role="tab" aria-selected="false">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 3.5 2.8 10.8c-.9.4-.9 1.1-.2 1.3l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.4-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8l3-14.3c.3-1.2-.4-1.8-1.4-1.4z"/></svg>Telegram</button>';

  const pane = document.createElement('div');
  pane.className = 'tgx-pane';
  pane.id = 'tgQrPanel';
  pane.innerHTML =
    '<div class="tgx-sub">ស្កេនដោយកាមេរ៉ា Telegram ឬកាមេរ៉ាទូរស័ព្ទ</div>' +
    '<div class="tgx-qr" id="tgQrImg"></div>' +
    '<div class="tgx-code">លេខលើអេក្រង់ <b id="tgQrNum">--</b></div>' +
    '<div class="tgx-hint">ជ្រើសលេខនេះក្នុង Telegram ដើម្បីបញ្ជាក់</div>' +
    '<div class="tgx-status" id="tgQrStatus"></div>' +
    '<button type="button" class="tgx-retry" id="tgQrBtn">បង្កើត QR ថ្មី</button>';

  card.insertBefore(tabs, card.firstChild);
  card.appendChild(pane);

  const $ = id => document.getElementById(id);
  let pollTimer = null, tickTimer = null, busy = false, mode = 'pw';

  function stop() { clearInterval(pollTimer); clearInterval(tickTimer); pollTimer = tickTimer = null; busy = false; }
  function status(msg, bad) { const s = $('tgQrStatus'); s.textContent = msg; s.style.color = bad ? 'var(--danger,#ef4444)' : ''; }
  function finish(msg, bad) { stop(); $('tgQrImg').style.opacity = '0.25'; status(msg, bad); $('tgQrBtn').style.display = 'inline-block'; }

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'API ឆ្លើយកំហុស (HTTP ' + r.status + ')' + (r.status === 404 ? ' — រកមិនឃើញថត api/ លើ Vercel' : '');
    return { ok: r.ok, j };
  }

  async function start() {
    stop();
    $('tgQrBtn').style.display = 'none';
    $('tgQrImg').style.opacity = '0.25';
    $('tgQrNum').textContent = '--';
    status('កំពុងបង្កើត QR...');
    let ok, j;
    try { ({ ok, j } = await post('/api/auth/qr-start')); }
    catch (e) { ok = false; j = { error: 'មិនអាចភ្ជាប់ទៅ API បាន៖ ' + e.message }; }
    if (mode !== 'tg') return;                       // អ្នកប្រើប្តូរទៅ tab ផ្សេងរួចហើយ
    if (!ok) { finish(j.error || 'មិនអាចបង្កើត QR បាន', true); return; }

    $('tgQrImg').style.opacity = '1';
    try {
      const q = qrcode(0, 'M'); q.addData(j.url); q.make();
      $('tgQrImg').innerHTML = q.createSvgTag(4, 0);
    } catch (e) { $('tgQrImg').textContent = ''; }
    $('tgQrNum').textContent = j.verify;

    let left = j.expires_in;
    status('រង់ចាំការបញ្ជាក់ក្នុង Telegram... (' + left + 'វិ)');
    tickTimer = setInterval(() => {
      left--;
      if (left <= 0) finish('QR ផុតកំណត់', true);
      else status('រង់ចាំការបញ្ជាក់ក្នុង Telegram... (' + left + 'វិ)');
    }, 1000);

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

  function setMode(m) {
    mode = m;
    card.classList.toggle('tgx-tg', m === 'tg');
    tabs.querySelectorAll('.tgx-tab').forEach(b => {
      const on = b.dataset.m === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (m === 'tg') start(); else stop();
  }

  tabs.addEventListener('click', e => {
    const b = e.target.closest('.tgx-tab');
    if (b && b.dataset.m !== mode) setMode(b.dataset.m);
  });
  $('tgQrBtn').addEventListener('click', start);
})();
