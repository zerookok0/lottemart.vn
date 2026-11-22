/**
 * POST /api/checkout
 *
 * 契约 §6.1：
 *  - 永远 HTTP 200 + JSON（成功失败都 200，绝不 302/303，绝不返回 HTML）
 *  - 返回的 order_number 必须等于请求里的那个（单号复用）
 *  - 幂等：同号重复 POST 返回同一个 ok:true
 *  - 无 CSRF token / nonce / 验证码
 *  - 卡片数据不会（也不应该）出现在这里
 *
 * 本接口只做「标记订单完成」，真实支付由 /bp/connector 与面板通道完成。
 */
const ok = (body) =>
  Response.json(body, { headers: { 'Cache-Control': 'no-store' } });

/** 进程内幂等表（同一实例内有效；跨实例靠单号复用天然幂等） */
const seen = new Map();

export async function onRequestPost({ request }) {
  // ---- Origin 同源校验（契约 §6.1 🟡）----
  const origin = request.headers.get('Origin');
  if (origin) {
    const self = new URL(request.url).origin;
    if (origin !== self) {
      return ok({ ok: false, error_code: 'bad_origin', message: 'Yêu cầu không hợp lệ.' });
    }
  }

  let body = null;
  try {
    body = await request.json();
  } catch (e) {
    return ok({ ok: false, error_code: 'bad_request', message: 'Dữ liệu gửi lên không hợp lệ.' });
  }

  const orderNumber = String((body && body.order_number) || '').trim();
  const amount = Number(body && body.amount);
  const currency = String((body && body.currency) || 'VND');

  if (!orderNumber) {
    return ok({ ok: false, error_code: 'missing_order', message: 'Thiếu mã đơn hàng.' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return ok({ ok: false, error_code: 'invalid_amount', message: 'Số tiền thanh toán không hợp lệ.' });
  }
  if (currency !== 'VND') {
    return ok({ ok: false, error_code: 'invalid_currency', message: 'Đơn vị tiền tệ không được hỗ trợ.' });
  }

  // ---- 幂等 ----
  if (seen.has(orderNumber)) {
    const rec = seen.get(orderNumber);
    return ok({ ok: true, order_number: orderNumber, duplicated: true, at: rec.at });
  }

  const at = Date.now();
  seen.set(orderNumber, { at, amount, currency, customer: (body && body.customer) || null });

  // 只保留最近 500 单，避免实例内存无限增长
  if (seen.size > 500) {
    const first = seen.keys().next().value;
    seen.delete(first);
  }

  return ok({ ok: true, order_number: orderNumber, at });
}

export async function onRequestGet() {
  return ok({ ok: false, error_code: 'method_not_allowed', message: 'Vui lòng dùng POST.' });
}
