/* =============================================================================
 * 边缘中间件：全站安全头（CSP / nosniff / Referrer / Permissions 等）
 *
 * 说明：原先用于「挡 FB 审核爬虫」的地理分流（安全页）已按要求撤下，
 *       现在所有访客（含海外与爬虫）看到的都是同一个真站。
 *       历史实现见 git 提交 9b34e0e / 31c75c7，如需恢复可从那里取回。
 * ============================================================================= */

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://s.axon.ai",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com https://s.axon.ai https://*.axon.ai https://b.applovin.com https://b.quantarelay.net https://cm.g.doubleclick.net",
  "frame-src 'self' https://annangourmet.makeup",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export async function onRequest(context) {
  const { request, next } = context;
  const res = await next();
  const out = new Response(res.body, res);
  const url = new URL(request.url);

  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  out.headers.set('X-DNS-Prefetch-Control', 'on');
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  /* 结账 / 订单页不缓存，其余交给 _headers */
  if (/^\/(checkout|order)/.test(url.pathname)) out.headers.set('Cache-Control', 'no-store');

  /* AppLovin 建议的用户识别增强：把像素写的 `_axwrt` 回写成一年期第一方 cookie `axwrt`
   * （同值、Path=/、非 HttpOnly、主机级；官方要求 Domain 加站点前缀，这里用 host-only 等价） */
  try {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)_axwrt=([^;]+)/);
    if (m && m[1]) {
      out.headers.append(
        'Set-Cookie',
        `axwrt=${m[1]}; Path=/; Max-Age=31536000; SameSite=Lax`
      );
    }
  } catch (e) {}

  return out;
}
