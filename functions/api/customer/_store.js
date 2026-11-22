/**
 * 账号存储
 *  - 绑定了 KV（LM_USERS）→ 跨设备可用
 *  - 没绑定 → 本机 cookie 账号表（lm_accounts，最多 4 个）
 */
import { readCookie, cookie } from './_shared.js';

const COOKIE = 'lm_accounts';
const MAX_LOCAL = 4;

const readLocal = (request) => {
  try {
    const arr = JSON.parse(readCookie(request, COOKIE) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
};

export const getAccount = async (env, request, email) => {
  const key = `user:${String(email || '').toLowerCase()}`;
  if (env && env.LM_USERS) {
    const raw = await env.LM_USERS.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return readLocal(request).find((u) => String(u.email).toLowerCase() === String(email).toLowerCase()) || null;
};

export const putAccount = async (env, request, user) => {
  const key = `user:${String(user.email || '').toLowerCase()}`;
  if (env && env.LM_USERS) {
    await env.LM_USERS.put(key, JSON.stringify(user));
    return { storage: 'kv', setCookie: '' };
  }
  const list = readLocal(request).filter((u) => String(u.email).toLowerCase() !== String(user.email).toLowerCase());
  list.unshift(user);
  return {
    storage: 'cookie',
    setCookie: cookie(COOKIE, JSON.stringify(list.slice(0, MAX_LOCAL)), 15552000),
  };
};

export const storageMode = (env) => (env && env.LM_USERS ? 'kv' : 'cookie');
