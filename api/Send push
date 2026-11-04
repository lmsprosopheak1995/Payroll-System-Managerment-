// api/send-push.js — Vercel Serverless Function
// ផ្ញើ Web Push ទៅបុគ្គលិក ពេលមានជួរថ្មីក្នុងតារាង announcements (តាម Supabase Database Webhook)
//
// Environment Variables ក្នុង Vercel (Project → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   ← ពី: npx web-push generate-vapid-keys
//   VAPID_SUBJECT                          ← ឧ. mailto:you@example.com
//   WEBHOOK_SECRET                         ← ពាក្យសម្ងាត់វែងដែលអ្នកបង្កើតខ្លួនឯង
//   SUPABASE_URL                           ← ឧ. https://veszfcxlkgfrljfqsaec.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY              ← service_role key (សម្ងាត់! កុំដាក់ក្នុង GitHub/កូដ)
// ត្រូវបន្ថែម  "web-push": "^3.6.7"  ក្នុង dependencies នៃ package.json
const webpush = require('web-push');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, init) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('method not allowed');
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) return res.status(401).send('unauthorized');

  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const ann = req.body && req.body.record;                 // ជួរ announcements ដែលទើបបន្ថែម
    if (!ann) return res.status(400).send('no record');

    // អ្នកទទួល៖ all / dept / employee (ដូចទំព័របុគ្គលិក)
    let filter = '';
    if (ann.target_type === 'employee') {
      filter = `&employee_id=eq.${encodeURIComponent(String(ann.target_value))}`;
    } else if (ann.target_type === 'dept') {
      const emps = await sb(`employees?select=id&dept=eq.${encodeURIComponent(String(ann.target_value))}`);
      const ids = (emps || []).map(e => String(e.id));
      if (!ids.length) return res.status(200).json({ sent: 0, removed: 0 });
      filter = `&employee_id=in.(${ids.map(encodeURIComponent).join(',')})`;
    }
    const subs = await sb(`push_subscriptions?select=endpoint,p256dh,auth${filter}`);

    const payload = JSON.stringify({
      title: ann.title || 'ដំណឹងថ្មី',
      body: ann.body || '',
      url: './employee.html',
      tag: `ann-${ann.id || Date.now()}`,
    });

    let sent = 0, removed = 0;
    await Promise.all((subs || []).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {   // ឧបករណ៍លែងមាន → សម្អាត
          await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
          removed++;
        }
      }
    }));
    return res.status(200).json({ sent, removed });
  } catch (e) {
    console.error('send-push error', e);
    return res.status(500).send(String(e.message || e));
  }
};
