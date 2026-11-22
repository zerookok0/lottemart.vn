/** GET /api/customer/me — 读 lm_user cookie */
import { json, readCookie } from './_shared.js';

export async function onRequestGet({ request }) {
  let user = null;
  try {
    const raw = readCookie(request, 'lm_user');
    if (raw) user = JSON.parse(raw);
  } catch (e) {
    user = null;
  }
  return json({ ok: true, user: user || null });
}
