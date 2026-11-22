/** POST /api/customer/logout — 清 lm_user（保留 lm_accounts，下次登录带回资料） */
import { json, clearCookie } from './_shared.js';

export async function onRequestPost() {
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie('lm_user') } });
}

export async function onRequestGet() {
  return onRequestPost();
}
