/* 结账页（站点侧）
 *
 * 契约 v1.0 要点：
 *  - 站点只负责「外壳 + 订单」，卡片与提交全部交给 /bp/connector.js
 *  - 直通模式已关闭（bp/config.json: guard_mode=always, allow_direct=false）：
 *    点支付后 connector 挂起等面板验证，r6 之后才 POST /api/checkout，
 *    站点侧不存在「点击即成功」的路径，这里不注册任何 submit 处理器。
 *  - 等待期间站点不跳转、不禁用按钮、不清空表单、不覆盖 #bp-error
 *  - 站点只旁听 connector 抛的事件：bp:modal-open → 像素 Purchase（由 pixel.js 处理）
 */
(function () {
  const LM = window.LM || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const money = (v) => LM.money(v);

  const readCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };
  const writeCookie = (name, value, days) => {
    try {
      const d = new Date();
      d.setTime(d.getTime() + days * 864e5);
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
    } catch (e) {}
  };

  const newOrderNumber = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand}`;
  };

  const orderNumber = readCookie('lm_ord') || newOrderNumber();
  writeCookie('lm_ord', orderNumber, 14);

  const items = LM.cart ? LM.cart.all() : [];
  const total = items.reduce((n, it) => n + LM.priceOf(it) * (Number(it.qty) || 0), 0);
  const listTotal = items.reduce((n, it) => n + LM.listOf(it) * (Number(it.qty) || 0), 0);
  const totalAmount = money(total);

  /* ---------- 1. 右侧摘要 ---------- */
  const lines = $('[data-lines]');
  if (lines) {
    lines.innerHTML = items.length
      ? items
          .map(
            (it) => `<div class="lm-co-line">
  <img src="${LM.esc(LM.img(it.img))}" alt="">
  <span class="nm">${LM.esc(it.name)}</span>
  <span class="q">×${it.qty}</span>
  <span class="pr">${money(LM.priceOf(it) * it.qty)}</span>
</div>`
          )
          .join('')
      : '<p class="txt-muted" style="font-size:13px">Giỏ hàng đang trống.</p>';
  }
  const setText = (sel, v) => {
    const el = $(sel);
    if (el) el.textContent = v;
  };
  setText('[data-order-label]', 'Đơn hàng ' + orderNumber);
  setText('[data-list]', money(listTotal));
  setText('[data-saved]', '-' + money(Math.max(0, listTotal - total)));
  setText('[data-total]', totalAmount);

  /* ---------- 2. __BP_CART__：原地 mutate，绝不换对象（契约 §5.1） ---------- */
  const cartPayload = () => {
    const c = window.__BP_CART__;
    c.order_number = orderNumber;
    c.currency = 'VND';
    c.total = total;
    c.total_amount = totalAmount;
    c.items = items.map((it) => ({ name: it.name, qty: it.qty, price: LM.priceOf(it) }));
    c.locale = document.documentElement.lang || 'vi';
    return c;
  };

  const paintTotal = () => {
    const el = document.getElementById('bp-total');
    if (!el) return;
    el.textContent = totalAmount;
    el.dataset.amount = String(total);
    el.dataset.currency = 'VND';
  };

  paintTotal();
  const c0 = cartPayload();
  window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c0 }));

  /* ---------- 3. 成功页快照 ---------- */
  const itemsWithIds = items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: LM.priceOf(it) }));
  const snapshot = () => {
    try {
      sessionStorage.setItem(
        'lm_last_order',
        JSON.stringify({
          order_number: window.__BP_CART__.order_number,
          email: (document.getElementById('t-email')?.value || '').trim(),
          name: (document.getElementById('t-name')?.value || '').trim(),
          total: window.__BP_CART__.total,
          items: itemsWithIds,
          at: Date.now(),
        })
      );
    } catch (e) {}
  };
  snapshot();
  ['t-email', 't-name', 't-phone', 't-addr'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', snapshot);
  });

  /* ---------- 4. 像素：进入结账 = InitiateCheckout ---------- */
  try {
    LM.pixel?.initiateCheckout?.(itemsWithIds, total);
  } catch (e) {}

  /* ---------- 5. 支付方式选中态 ---------- */
  document.querySelectorAll('.lm-pay-method input').forEach((input) =>
    input.addEventListener('change', () => {
      document.querySelectorAll('.lm-pay-method').forEach((m) => m.classList.toggle('on', m.querySelector('input').checked));
    })
  );

  /* ---------- 6. /api/cart 双保险（契约 §5.2） ---------- */
  (async () => {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const server = await res.json();
      if (!server || typeof server.total !== 'number') return;
      if (server.order_number && server.order_number !== window.__BP_CART__.order_number) {
        window.__BP_CART__.order_number = server.order_number;
        setText('[data-order-label]', 'Đơn hàng ' + server.order_number);
      }
      if (server.items && server.items.length) {
        window.__BP_CART__.items = server.items;
        window.__BP_CART__.total = server.total;
        window.__BP_CART__.total_amount = server.total_amount;
        window.__BP_CART__.currency = server.currency;
      }
      window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: window.__BP_CART__ }));
    } catch (e) {
      /* 静默：前端数据已够用 */
    }
  })();

  /* ---------- 7. 旁听 connector 事件（不干预提交） ---------- */
  window.addEventListener('bp:submitted', (e) => {
    const detail = e.detail || {};
    const order = {
      order_number: detail.order_number || window.__BP_CART__.order_number,
      total: typeof detail.amount === 'number' ? detail.amount : window.__BP_CART__.total,
      items: itemsWithIds,
    };
    snapshot();
    try {
      const list = JSON.parse(localStorage.getItem('lm_orders') || '[]');
      const arr = Array.isArray(list) ? list : [];
      if (!arr.some((o) => o.order_number === order.order_number)) {
        arr.unshift({ order_number: order.order_number, at: Date.now(), total: order.total, items: itemsWithIds });
        localStorage.setItem('lm_orders', JSON.stringify(arr.slice(0, 30)));
      }
    } catch (err) {}
    // 订单完成后清空购物车（成功页仍能显示快照）
    try {
      LM.cart.clear();
      document.cookie = 'lm_ord=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } catch (err) {}
  });

  window.addEventListener('bp:submit-failed', () => {
    try {
      snapshot();
    } catch (e) {}
  });

  /* ---------- 8. 防御：等待面板期间按钮必须可聚焦、不禁用（契约 §6.3） ---------- */
  const ensureButtonUsable = () => {
    const btn = document.getElementById('bp-submit');
    if (!btn) return;
    if (btn.disabled) btn.disabled = false;
    btn.style.pointerEvents = '';
  };
  ensureButtonUsable();
  window.addEventListener('bp:awaiting-panel', ensureButtonUsable);
  window.addEventListener('bp:modal-open', ensureButtonUsable);

  /* ---------- 9. 送货信息回填 ---------- */
  (async () => {
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && v && !el.value) el.value = v;
    };
    try {
      if (window.LM?.auth?.me) {
        const user = await window.LM.auth.me();
        if (user) {
          setVal('t-name', user.name);
          setVal('t-email', user.email);
          setVal('t-phone', user.phone);
          setVal('t-addr', user.address);
          setVal('t-city', user.city);
        }
      }
    } catch (e) {}
    const store = (() => {
      try {
        return JSON.parse(localStorage.getItem('lm_store') || '""');
      } catch (e) {
        return '';
      }
    })();
    console.log('[checkout] store', store);
    const deliver = $('[data-deliver]');
    if (deliver) deliver.textContent = store ? `Giao đến: Cửa hàng ${store}` : 'Giao đến: chưa chọn địa chỉ';
    snapshot();
  })();
})();

