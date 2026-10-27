// POST /api/auth/qr-start — បង្កើតសំណើ login ថ្មី (QR)
const crypto = require('crypto');
const { sb } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);

  // សម្អាតសំណើចាស់ (> ១ ម៉ោង)
  await sb(`telegram_login_requests?created_at=lt.${encodeURIComponent(new Date(Date.now() - 3600e3).toISOString())}`, { method: 'DELETE' });

  // កំណត់ចំនួន៖ យ៉ាងច្រើន ៦ សំណើ/នាទី ក្នុង IP តែមួយ
  if (ip) {
    const since = encodeURIComponent(new Date(Date.now() - 60e3).toISOString());
    const c = await sb(`telegram_login_requests?ip=eq.${encodeURIComponent(ip)}&created_at=gt.${since}&select=code`);
    if (c.ok && Array.isArray(c.data) && c.data.length >= 6)
      return res.status(429).json({ error: 'ព្យាយាមច្រើនពេក សូមរង់ចាំ ១ នាទី' });
  }

  const code = crypto.randomBytes(24).toString('hex');   // 48 តួ hex
  const verify = crypto.randomInt(10, 100);               // លេខ ២ ខ្ទង់ បង្ហាញលើអេក្រង់
  const ins = await sb('telegram_login_requests', {
    method: 'POST',
    body: { code, verify_number: verify, ip, user_agent: ua, expires_at: new Date(Date.now() + 120e3).toISOString() },
  });
  if (!ins.ok) return res.status(500).json({ error: 'មិនអាចបង្កើតសំណើបាន (តើបានរត់ 01-telegram-login-requests.sql ហើយឬនៅ?)' });

  return res.json({
    code,
    verify,
    url: `https://t.me/${process.env.BOT_USERNAME}?start=login_${code}`,
    expires_in: 120,
  });
};
