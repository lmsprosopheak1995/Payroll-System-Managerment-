// /api/auth/telegram.js — Vercel Serverless Function (មិនត្រូវការ npm package)
// Environment Variables: BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { hash, ...data } = req.body || {};
  if (!hash) return res.status(400).json({ error: 'ទិន្នន័យមិនគ្រប់' });

  // 1) ផ្ទៀងផ្ទាត់ហត្ថលេខា Telegram
  const check = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(process.env.BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const ok = hmac.length === String(hash).length &&
    crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(String(hash)));
  if (!ok) return res.status(401).json({ error: 'ទិន្នន័យមិនត្រឹមត្រូវ' });

  // 2) ពិនិត្យថាមិនហួសពេល (៥ នាទី)
  if (Date.now() / 1000 - Number(data.auth_date) > 300)
    return res.status(401).json({ error: 'ផុតកំណត់ សូមសាកល្បងម្តងទៀត' });

  // 3) ហៅ function ក្នុង Supabase ដោយប្រើ service_role (server ប៉ុណ្ណោះ)
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/create_admin_session_telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_telegram_id: String(data.id) }),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out || !out.ok)
    return res.status(403).json({ error: 'គណនី Telegram នេះមិនទាន់ត្រូវបានភ្ជាប់ជាមួយ Admin' });

  return res.json({ token: out.token });
};
