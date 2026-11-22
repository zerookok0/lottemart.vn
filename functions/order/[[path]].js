/** /order/<order_number> → 200 直出 order.html（URL 保持不变，绝不 302） */
export async function onRequest({ env, request }) {
  const res = await env.ASSETS.fetch(new URL('/order.html', request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8' },
  });
}
