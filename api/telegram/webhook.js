// POST /api/telegram/webhook — Telegram bot ផ្ញើសារមកទីនេះ
const crypto = require('crypto');
const { sb, rpc, tg } = require('../_lib');

const nowIso = () => encodeURIComponent(new Date().toISOString());
const phnom = d => new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });

const safeEqual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function onMessage(msg) {
  if (!msg || !msg.from || !msg.chat || msg.chat.type !== 'private') return;
  const from = String(msg.from.id);
  const m = /^\/start login_([a-f0-9]{48})$/.exec((msg.text || '').trim());

  if (!m) {
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: `សួស្តី! Bot នេះសម្រាប់ចូលប្រព័ន្ធប្រាក់បៀវត្ស។\nសូមស្កេន QR នៅទំព័រ login។\n\nTelegram ID របស់អ្នក៖ ${from}`,
    });
    return;
  }

  const adm = await rpc('telegram_admin_exists', { p_telegram_id: from });
  if (adm.data !== true) {
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: `⛔ គណនី Telegram នេះ (ID: ${from}) មិនទាន់ត្រូវបានភ្ជាប់ជាមួយអ្នកគ្រប់គ្រងទេ។\nសូមប្រាប់ Admin ឱ្យភ្ជាប់ ID នេះមុន។`,
    });
    return;
  }

  const code = m[1];
  const g = await sb(`telegram_login_requests?code=eq.${code}&status=eq.pending&expires_at=gt.${nowIso()}&or=(telegram_id.is.null,telegram_id.eq.${from})&select=*`);
  const row = g.data && g.data[0];
  if (!row) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: '⌛ សំណើនេះផុតកំណត់ ឬត្រូវបានប្រើរួច។ សូមស្កេន QR ថ្មី។' });
    return;
  }
  await sb(`telegram_login_requests?code=eq.${code}&status=eq.pending`, { method: 'PATCH', body: { telegram_id: from } });

  // ប៊ូតុងលេខ ៣ (មួយត្រូវ) — ការពារការបោកបញ្ឆោតតាម QR
  const nums = new Set([row.verify_number]);
  while (nums.size < 3) nums.add(10 + crypto.randomInt(90));
  const list = [...nums].sort(() => crypto.randomInt(3) - 1);

  await tg('sendMessage', {
    chat_id: msg.chat.id,
    text:
      '🔐 សំណើចូលប្រព័ន្ធប្រាក់បៀវត្ស\n' +
      `⏰ ${phnom(row.created_at)}\n` +
      `🌐 IP: ${row.ip || 'មិនស្គាល់'}\n` +
      `💻 ${(row.user_agent || '').slice(0, 80)}\n\n` +
      'ជ្រើសលេខដែលបង្ហាញលើអេក្រង់កុំព្យូទ័រ។\n' +
      'បើមិនមែនអ្នកទេ សូមចុច «បដិសេធ»។',
    reply_markup: {
      inline_keyboard: [
        list.map(x => ({ text: String(x), callback_data: `ok:${code}:${x}` })),
        [{ text: '❌ មិនមែនខ្ញុំ / បដិសេធ', callback_data: `no:${code}` }],
      ],
    },
  });
}

async function onCallback(cq) {
  const answer = text => tg('answerCallbackQuery', { callback_query_id: cq.id, text });
  const d = /^(ok|no):([a-f0-9]{48})(?::(\d{2}))?$/.exec(cq.data || '');
  if (!d || !cq.from || !cq.message) return answer('មិនត្រឹមត្រូវ');

  const code = d[2];
  const g = await sb(`telegram_login_requests?code=eq.${code}&select=*`);
  const row = g.data && g.data[0];
  const edit = text => tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });

  if (!row || row.telegram_id !== String(cq.from.id) || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
    await answer('សំណើផុតកំណត់');
    return edit('⌛ សំណើនេះផុតកំណត់ ឬត្រូវបានប្រើរួច។');
  }

  const correct = d[1] === 'ok' && Number(d[3]) === row.verify_number;
  await sb(`telegram_login_requests?code=eq.${code}&status=eq.pending`, {
    method: 'PATCH', body: { status: correct ? 'approved' : 'denied' },
  });
  await answer(correct ? 'បានបញ្ជាក់' : 'បដិសេធ');
  return edit(
    correct ? '✅ បានបញ្ជាក់ — កុំព្យូទ័រកំពុងចូលប្រព័ន្ធ'
    : d[1] === 'ok' ? '⛔ លេខមិនត្រូវ — សំណើត្រូវបានបដិសេធ។ បើអ្នកមិនបានស្កេន QR ខ្លួនឯងទេ សូមកុំបញ្ជាក់ដាច់ខាត។'
    : '❌ បានបដិសេធ'
  );
}

module.exports = async (req, res) => {
  const secret = (process.env.TG_SECRET_V2 || '').trim();
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  if (!secret || !safeEqual(got, secret)) return res.status(401).end();
  try {
    const u = req.body || {};
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) { console.error('webhook error', e); }
  return res.json({ ok: true });   // ឆ្លើយ 200 ជានិច្ច កុំឱ្យ Telegram ផ្ញើម្តងទៀត
};
