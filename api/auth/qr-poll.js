// POST /api/auth/qr-poll {code} — browser សួរស្ថានភាពរាល់ ២ វិនាទី
const { sb, rpc } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const code = String((req.body || {}).code || '');
  if (!/^[a-f0-9]{48}$/.test(code)) return res.status(400).json({ error: 'bad_code' });

  const g = await sb(`telegram_login_requests?code=eq.${code}&select=status,expires_at`);
  const row = g.data && g.data[0];
  if (!row) return res.json({ status: 'expired' });
  if (row.status === 'denied') return res.json({ status: 'denied' });
  if (new Date(row.expires_at) < new Date()) return res.json({ status: 'expired' });
  if (row.status === 'pending') return res.json({ status: 'pending' });
  if (row.status !== 'approved') return res.json({ status: 'expired' });   // used

  // ប្រើបានតែម្តង៖ approved → used (atomic)
  const c = await sb(`telegram_login_requests?code=eq.${code}&status=eq.approved`, {
    method: 'PATCH', body: { status: 'used' }, prefer: 'return=representation',
  });
  const claimed = c.data && c.data[0];
  if (!claimed) return res.json({ status: 'expired' });

  const s = await rpc('create_admin_session_telegram', { p_telegram_id: claimed.telegram_id });
  if (!s.ok || !s.data || !s.data.ok) return res.json({ status: 'denied' });
  return res.json({ status: 'ok', token: s.data.token });
};
