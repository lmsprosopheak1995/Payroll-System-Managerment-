/* telegram-login.js — ចូលគណនី Admin តាម Telegram (មិនកែ script.js)
   ត្រូវដាក់ក្រោម <script src="script.js"> ក្នុង index.html */
async function onTelegramAuth(user) {
  const errEl = document.getElementById('adminLoginError');
  const fail = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };
  try {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.token) return fail(r.error || 'ចូលតាម Telegram មិនបាន');
    setSessionToken(r.token);          // មានក្នុង script.js
    await checkAdminAuthAndInit();     // មានក្នុង script.js
  } catch (e) {
    fail('មានបញ្ហាក្នុងការតភ្ជាប់៖ ' + e.message);
  }
}
