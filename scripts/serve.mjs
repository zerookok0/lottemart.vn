#!/usr/bin/env node
/**
 * 本地预览：模拟 Cloudflare Pages 路由 + Functions（等价实现，零依赖）
 *
 *   npm run dev            # http://127.0.0.1:4173
 *   node scripts/serve.mjs 4199
 *
 * 覆盖：
 *   - 静态资源（dist/）
 *   - clean URL：/checkout、/search、/about-us …（无扩展名 200，不 301）
 *   - /vi-nsg/product/*、/vi-nsg/category/*、/vi-nsg/collection/*、/vi-nsg/<policy>
 *   - /order/<no>（200 直出）
 *   - GET /api/cart、POST /api/checkout、/api/customer/*
 *   - 与生产一致的 CSP 头
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' https://annangourmet.makeup",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const baseHeaders = () => ({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'payment=(self), clipboard-write=(self)',
  'X-DNS-Prefetch-Control': 'on',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
});

const readCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
};

const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫';

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...baseHeaders(), ...headers });
  res.end(body);
};

const sendJson = (res, obj, headers = {}) =>
  send(res, 200, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

const sendFile = (res, file, extra = {}) => {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size, ...extra };
  if (ext === '.html') h['Cache-Control'] = 'no-cache, must-revalidate';
  res.writeHead(200, { ...baseHeaders(), ...h });
  fs.createReadStream(file).pipe(res);
};

/* ---------------------------------------------------------------- Functions 等价实现 */
const apiCart = (req, res) => {
  let items = [];
  try {
    const arr = JSON.parse(readCookie(req, 'lm_cart') || '[]');
    if (Array.isArray(arr)) {
      items = arr
        .filter((it) => it && it.id)
        .slice(0, 60)
        .map((it) => ({
          id: String(it.id),
          name: String(it.name || ''),
          qty: Math.max(1, Math.min(99, Number(it.qty) || 1)),
          price: Math.max(0, Math.round(Number(it.price) || 0)),
        }));
    }
  } catch (e) {
    items = [];
  }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const order =
    readCookie(req, 'lm_ord') ||
    `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const total = items.reduce((n, it) => n + it.price * it.qty, 0);
  sendJson(
    res,
    {
      order_number: order,
      currency: 'VND',
      total,
      total_amount: fmtVnd(total),
      items: items.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
      locale: 'vi',
      _items: items,
    },
    { 'Set-Cookie': `lm_ord=${encodeURIComponent(order)}; Path=/; Max-Age=1209600; SameSite=Lax` }
  );
};

const seen = new Map();
const apiCheckout = (req, res, body) => {
  let data = null;
  try {
    data = JSON.parse(body || '{}');
  } catch (e) {
    return sendJson(res, { ok: false, error_code: 'bad_request', message: 'Dữ liệu gửi lên không hợp lệ.' });
  }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
    return sendJson(res, { ok: false, error_code: 'bad_origin', message: 'Yêu cầu không hợp lệ.' });
  }
  const order = String(data.order_number || '').trim();
  const amount = Number(data.amount);
  if (!order) return sendJson(res, { ok: false, error_code: 'missing_order', message: 'Thiếu mã đơn hàng.' });
  if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, { ok: false, error_code: 'invalid_amount', message: 'Số tiền không hợp lệ.' });
  if (seen.has(order)) return sendJson(res, { ok: true, order_number: order, duplicated: true, at: seen.get(order) });
  const at = Date.now();
  seen.set(order, at);
  sendJson(res, { ok: true, order_number: order, at });
};

const customers = new Map();
const apiCustomer = (req, res, url, body) => {
  const action = url.pathname.split('/').pop();
  const parse = () => {
    try {
      return JSON.parse(body || '{}');
    } catch (e) {
      return {};
    }
  };

  if (action === 'me') {
    let user = null;
    try {
      user = JSON.parse(readCookie(req, 'lm_user') || 'null');
    } catch (e) {}
    return sendJson(res, { ok: true, user });
  }
  if (action === 'logout') {
    return sendJson(res, { ok: true }, { 'Set-Cookie': 'lm_user=; Path=/; Max-Age=0; SameSite=Lax' });
  }
  if (action === 'register') {
    const b = parse();
    if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(b.email)) {
      return sendJson(res, { ok: false, field: 'email', message: 'Email không hợp lệ.' });
    }
    if (!b.password || String(b.password).length < 6) {
      return sendJson(res, { ok: false, field: 'password', message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }
    const user = {
      id: 'LM' + Date.now().toString(36).toUpperCase(),
      name: b.name || 'Thành viên',
      email: b.email,
      phone: b.phone || '',
      membership: b.membership || 'Member',
      address: b.address || '',
      city: b.city || '',
      zip: b.zip || '',
      createdAt: Date.now(),
    };
    customers.set(b.email.toLowerCase(), user);
    return sendJson(res, { ok: true, user, notified: false }, { 'Set-Cookie': `lm_user=${encodeURIComponent(JSON.stringify(user))}; Path=/; Max-Age=2592000; SameSite=Lax` });
  }
  if (action === 'login') {
    const b = parse();
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) return sendJson(res, { ok: false, code: 'missing_email', message: 'Vui lòng nhập email.' });
    if (!b.password) return sendJson(res, { ok: false, code: 'missing_password', message: 'Vui lòng nhập mật khẩu.' });
    const user =
      customers.get(email) || {
        id: 'LM' + crypto.createHash('sha1').update(email).digest('hex').slice(0, 8).toUpperCase(),
        name: email
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        email,
        phone: '',
        membership: 'Member',
        address: '',
        city: '',
        zip: '',
        createdAt: Date.now(),
      };
    customers.set(email, user);
    return sendJson(res, { ok: true, user, auth_mode: 'lenient', notified: false }, { 'Set-Cookie': `lm_user=${encodeURIComponent(JSON.stringify(user))}; Path=/; Max-Age=2592000; SameSite=Lax` });
  }
  if (action === 'telegram-test') {
    return sendJson(res, { ok: false, configured: false, message: 'Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
  }
  return sendJson(res, { ok: false, error: 'not_found' });
};

/* ---------------------------------------------------------------- 路由 */
const POLICY = new Set(['about-us', 'privacy', 'membership-policy', 'faq', 'shipping-delivery', 'exchange-refund', 'cookies-policy', 'account-management']);

const serve = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---- API ----
  if (p === '/api/cart') return apiCart(req, res);
  if (p === '/api/checkout') {
    if (req.method !== 'POST') return sendJson(res, { ok: false, error_code: 'method_not_allowed', message: 'Vui lòng dùng POST.' });
    let body = '';
    req.on('data', (c) => (body += c));
    return req.on('end', () => apiCheckout(req, res, body));
  }
  if (p.startsWith('/api/customer/')) {
    let body = '';
    req.on('data', (c) => (body += c));
    return req.on('end', () => apiCustomer(req, res, url, body));
  }
  if (p === '/api/bp/verify') return sendJson(res, { ok: false, reason: 'disabled' });

  // ---- 伪静态路由 ----
  let file = null;
  if (p === '/checkout' || p === '/checkout/') file = 'checkout.html';
  else if (p.startsWith('/order/')) file = 'order.html';
  else if (/^\/vi-nsg\/product\//.test(p)) file = 'product.html';
  else if (/^\/vi-nsg\/category\//.test(p)) file = 'category.html';
  else if (/^\/vi-nsg\/collection\//.test(p)) file = 'category.html';
  else if (/^\/vi-nsg\/([^/]+)\/?$/.test(p) && POLICY.has(p.replace(/^\/vi-nsg\//, '').replace(/\/$/, ''))) {
    file = p.replace(/^\/vi-nsg\//, '').replace(/\/$/, '') + '.html';
  }

  if (file) {
    const f = path.join(DIST, file);
    if (fs.existsSync(f)) return sendFile(res, f, { 'Cache-Control': 'no-store' });
  }

  // ---- 静态 ----
  let rel = decodeURIComponent(p).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  let abs = path.join(DIST, rel);
  if (!abs.startsWith(DIST)) return send(res, 403, 'forbidden');

  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return sendFile(res, abs);

  // /search、/cart、/login … → .html
  const asHtml = abs + '.html';
  if (fs.existsSync(asHtml)) return sendFile(res, asHtml);

  // 目录 index
  const asIndex = path.join(abs, 'index.html');
  if (fs.existsSync(asIndex)) return sendFile(res, asIndex);

  const nf = path.join(DIST, '404.html');
  if (fs.existsSync(nf)) {
    res.writeHead(404, { ...baseHeaders(), 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(nf).pipe(res);
  }
  send(res, 404, 'Not found');
};

if (!fs.existsSync(DIST)) {
  console.error('[serve] dist/ 不存在，先跑 npm run build');
  process.exit(1);
}

http
  .createServer((req, res) => {
    try {
      serve(req, res);
    } catch (e) {
      console.error('[serve]', e);
      send(res, 500, 'Internal error');
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[serve] http://127.0.0.1:${PORT}`);
  });
