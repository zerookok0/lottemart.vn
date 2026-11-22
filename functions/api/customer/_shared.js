/** 会员模块共用工具 */

export const json = (body, init = {}) =>
  Response.json(body, {
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });

export const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
};

export const cookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

export const clearCookie = (name) => `${name}=; Path=/; Max-Age=0; SameSite=Lax`;

export const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v || '').trim());

export const nameFromEmail = (email) =>
  String(email || '')
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Thành viên';

/** PBKDF2-SHA256（strict 模式用） */
export const hashPassword = async (password, saltHex) => {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt: bufToHex(salt), hash: bufToHex(new Uint8Array(bits)) };
};

export const verifyPassword = async (password, saltHex, hashHex) => {
  const { hash } = await hashPassword(password, saltHex);
  return hash === hashHex;
};

const bufToHex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexToBuf = (hex) => new Uint8Array((hex.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));

export const uid = () =>
  'LM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

/** Telegram 通知（尽力而为，3.5s 超时，失败不影响主流程） */
export const notify = async (env, text) => {
  const token = env && env.TELEGRAM_BOT_TOKEN;
  const chat = env && env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: ctl.signal,
    });
    return res.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const userView = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  membership: user.membership || 'Member',
  address: user.address || '',
  city: user.city || '',
  zip: user.zip || '',
  createdAt: user.createdAt || Date.now(),
});
