/** /vi-nsg/<policy-slug> → 200 直出对应的静态页（URL 保持不变） */
const SLUGS = new Set([
  'about-us',
  'privacy',
  'membership-policy',
  'faq',
  'shipping-delivery',
  'exchange-refund',
  'cookies-policy',
  'account-management',
]);

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.pathname.replace(/^\/vi-nsg\/?/, '').replace(/\/$/, '');

  if (!SLUGS.has(slug)) {
    return env.ASSETS.fetch(new URL('/404.html', request.url));
  }
  const res = await env.ASSETS.fetch(new URL(`/${slug}.html`, request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8' },
  });
}
