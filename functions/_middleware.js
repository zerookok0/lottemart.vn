/* =============================================================================
 * 边缘中间件：地理分流 + 全站安全头
 *
 * 分流规则（Cloudflare 提供 request.cf.country，无需第三方 IP 库）：
 *   · 国家 = VN                      → 正常出站
 *   · 其它国家 / 取不到国家          → 统一 200 直出「安全页」/safe.html（URL 不变，无品牌）
 *   · 接口 /api/ · 接管包 /bp/ · 安全页 → 放行（都不含品牌内容）
 *   · /data/*.json（商品数据）        → 非 VN 直接 404（防止直接爬到品牌商品数据）
 *   · /favicon.ico                   → 非 VN 返回 204（站点图标是品牌图）
 *
 * 白名单（自己和客户验收用）：
 *   · 访问任意页面带 ?vn=1         → 写入 30 天 cookie `vnf=1` 并放行
 *   · 已带 cookie `vnf=1`          → 放行
 *   · 环境变量 CLOAK_MODE=off      → 全局关闭分流（紧急回滚用，改完 Redeploy 生效）
 *   · 环境变量 CLOAK_DEBUG=1       → 允许用请求头 `x-country` 模拟国家（仅联调用，别在生产开）
 * ============================================================================= */

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

const HOME_COUNTRY = 'VN';
const SAFE_PATH = '/safe';
const PASS_COOKIE = 'vnf';

/* 这些路径不参与分流（静态资源 / 接口 / 面板接管包 / 安全页本身） */
const ALLOW_PREFIX = ['/api/', '/bp/', '/safe'];

/* 非 VN 直接 404 的路径（品牌商品数据 / 站点图标） */
const BLOCK_PREFIX = ['/data/'];

const isAllow = (path) => ALLOW_PREFIX.some((p) => path === p || path.startsWith(p)) || path === '/safe.html';

const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** 直出安全页（URL 不变，200） */
const serveSafe = async (env, request) => {
  const res = await env.ASSETS.fetch(new URL('/safe.html', request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  /* ---------- 1. 决定「是否放行到真实站点」 ---------- */
  const passParam = url.searchParams.get('vn') === '1';
  let passCookie = false;
  try {
    passCookie = readCookie(request, PASS_COOKIE) === '1';
  } catch (e) {}

  let country = (request.cf && request.cf.country) || '';
  if (String(env && env.CLOAK_DEBUG) === '1') {
    const spoof = request.headers.get('x-country');
    if (spoof) country = spoof.toUpperCase();
  }

  const cloakOff = String((env && env.CLOAK_MODE) || '').toLowerCase() === 'off';
  const isHome = country === HOME_COUNTRY;
  const pass = cloakOff || passParam || passCookie || isHome;

  /* ---------- 2. 分流 ---------- */
  let res;
  if (!pass && !isAllow(path)) {
    if (BLOCK_PREFIX.some((p) => path.startsWith(p))) {
      res = new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } else if (path === '/favicon.ico') {
      res = new Response(null, { status: 204 });
    } else {
      res = await serveSafe(env, request);
    }
  } else {
    res = await next();
  }

  /* ---------- 3. 统一补安全头 ---------- */
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  out.headers.set('X-DNS-Prefetch-Control', 'on');
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  if (passParam) {
    out.headers.append('Set-Cookie', `${PASS_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax`);
  }
  if (/^\/(checkout|order)/.test(path) || !pass) out.headers.set('Cache-Control', 'no-store');
  return out;
}

