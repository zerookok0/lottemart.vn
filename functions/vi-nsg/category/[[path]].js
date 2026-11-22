/** /vi-nsg/category/<url_key>-c<id> → 200 直出 category.html（URL 保持不变） */
export async function onRequest({ env, request }) {
  const res = await env.ASSETS.fetch(new URL('/category.html', request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8' },
  });
}
