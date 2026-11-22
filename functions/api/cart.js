/**
 * GET /api/cart
 *
 * 契约 §5.2：结构必须与 window.__BP_CART__ 完全一致。
 * 数据源：客户端写在 lm_cart cookie 里的购物车快照（SameSite=Lax）。
 */
const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
};

const fmtVnd = (n) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫';

export async function onRequestGet({ request }) {
  let items = [];
  try {
    const raw = readCookie(request, 'lm_cart');
    const arr = JSON.parse(raw || '[]');
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

  let order = '';
  try {
    order = readCookie(request, 'lm_ord');
  } catch (e) {}

  if (!order) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    order = `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  }

  const total = items.reduce((n, it) => n + it.price * it.qty, 0);

  return Response.json(
    {
      order_number: order,
      currency: 'VND',
      total,
      total_amount: fmtVnd(total),
      items: items.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
      locale: 'vi',
      _items: items,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': `lm_ord=${encodeURIComponent(order)}; Path=/; Max-Age=1209600; SameSite=Lax`,
      },
    }
  );
}
