/* 全站安全头（_headers 对 Functions 响应不生效，这里补一份） */
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

export async function onRequest(context) {
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  out.headers.set('X-DNS-Prefetch-Control', 'on');
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  const url = new URL(context.request.url);
  if (/^\/(checkout|order)/.test(url.pathname)) out.headers.set('Cache-Control', 'no-store');
  return out;
}
