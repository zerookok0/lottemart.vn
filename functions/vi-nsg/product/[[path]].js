/** /vi-nsg/product/<url_key>-p<id> → 200 直出 product.html（URL 保持不变） */
export async function onRequest({ env, request }) {
  const res = await env.ASSETS.fetch(new URL('/product.html', request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8' },
  });
}
