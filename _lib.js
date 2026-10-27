// api/_lib.js — ជំនួយរួម (ឯកសារចាប់ផ្តើមដោយ "_" មិនត្រូវបានបើកជា endpoint ទេ)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
  return { ok: r.ok, status: r.status, data };
}
const rpc = (fn, args) => sb(`rpc/${fn}`, { method: 'POST', body: args });

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json().catch(() => null);
}

// បញ្ជីអថេរ Environment ដែលនៅខ្វះ (សម្រាប់ជួយរកបញ្ហា)
const missingEnv = names => names.filter(n => !process.env[n]);

module.exports = { sb, rpc, tg, missingEnv };
