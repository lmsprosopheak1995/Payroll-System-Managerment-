// api/_lib.js — ជំនួយរួម (ឯកសារចាប់ផ្តើមដោយ "_" មិនត្រូវបានបើកជា endpoint ទេ)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        ...(String(key).startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
    if (!r.ok) console.error('sb error', method, path.split('?')[0], r.status);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.error('sb failed', method, path.split('?')[0], e.name, e.message);
    return { ok: false, status: 0, data: null };
  }
}
const rpc = (fn, args) => sb(`rpc/${fn}`, { method: 'POST', body: args });

async function tg(method, payload) {
  const token = (process.env.BOT_TOKEN || '').trim();
  console.log('tg call', method, 'tokenLen', token.length);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => null);
    console.log('tg result', method, r.status, j && j.ok, j && j.description);
    return j;
  } catch (e) {
    console.error('tg failed', method, e.name, e.message);
    return null;
  }
}

// បញ្ជីអថេរ Environment ដែលនៅខ្វះ (សម្រាប់ជួយរកបញ្ហា)
const missingEnv = names => names.filter(n => !process.env[n]);

module.exports = { sb, rpc, tg, missingEnv };
