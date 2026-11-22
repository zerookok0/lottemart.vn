/** 自检 Telegram 连通性：GET /api/customer/telegram-test */
import { json, notify } from './_shared.js';

export async function onRequestGet({ env }) {
  const configured = Boolean(env && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  if (!configured) return json({ ok: false, configured: false, message: 'Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
  const ok = await notify(env, '<b>LOGIN TEST</b> — LOTTE Mart clone: kết nối Telegram hoạt động.');
  return json({ ok, configured: true, status: ok ? 'sent' : 'failed' });
}
