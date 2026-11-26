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

  const items = LM.cart ? LM.cart.all() : [];

  /* 订单号策略：**每次打开结账页都生成新单号**。
   * 两个像素的 Purchase 都按单号 24h 去重；如果沿用上次那单的号（上一单放弃在验证屏、或
   * 同一单被重复测试），第二次会被判重复 → 两个渠道都不出购买事件。
   * 同一页面内（不刷新）单号保持不变，保证 __BP_CART__ / 面板 / 成功页三处一致。 */
  const orderNumber = newOrderNumber();
  writeCookie('lm_ord', orderNumber, 14);

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
  const saved = Math.max(0, listTotal - total);
  const savedEl = $('[data-saved]');
  if (savedEl) {
    const row = savedEl.closest('[data-saved-row]') || savedEl.parentElement;
    if (saved > 0) setText('[data-saved]', '-' + money(saved));
    else if (row) row.style.display = 'none';
  }
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
          phone: (document.getElementById('t-phone')?.value || '').trim(),
          addr: (document.getElementById('t-addr')?.value || '').trim(),
          city: (document.getElementById('t-city')?.value || '').trim(),
          district: (document.getElementById('t-district')?.value || '').trim(),
          ward: (document.getElementById('t-ward')?.value || '').trim(),
          note: (document.getElementById('t-note')?.value || '').trim(),
          total: window.__BP_CART__.total,
          items: itemsWithIds,
          at: Date.now(),
        })
      );
    } catch (e) {}
  };
  snapshot();
  ['t-email', 't-name', 't-phone', 't-addr', 't-city', 't-district', 't-ward', 't-note'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', snapshot);
  });

  /* ---------- 3b. 地址必填校验（对齐源站口径） ----------
   * 源站结账页字段：Họ tên* / Số điện thoại* / Email* / Tỉnh-Quận-Phường* / Tên đường, số nhà*
   * （源站没有「邮编」字段）。这里在点支付时先挡住空值，避免 connector 拿到空账单信息。
   */
  const REQUIRED = ['t-name', 't-phone', 't-email', 't-city', 't-district', 't-ward', 't-addr'];
  const coError = $('[data-co-error]');
  const setCoError = (msg, el) => {
    if (coError) coError.textContent = msg || '';
    document.querySelectorAll('.lm-field .is-invalid').forEach((x) => x.classList.remove('is-invalid'));
    if (el) {
      el.classList.add('is-invalid');
      try {
        el.focus({ preventScroll: false });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {}
    }
  };
  document.querySelectorAll('#bp-form .lm-field input, #bp-form .lm-field select').forEach((el) => {
    el.addEventListener('input', () => {
      if (el.classList.contains('is-invalid') && String(el.value || '').trim()) {
        el.classList.remove('is-invalid');
        if (coError) coError.textContent = '';
      }
    });
  });

  /* 必填校验：挂在 document 捕获阶段 —— connector 20261127 在按钮上捕获阶段接管 click，
 * 只有更早的 document 捕获才能在它之前拦住（空字段时不把卡片数据交给面板） */
document.addEventListener('click', (e) => {
    const submitBtn = e.target && e.target.closest && e.target.closest('#bp-submit');
    if (!submitBtn) return;
    for (const id of REQUIRED) {
      const el = document.getElementById(id);
      if (el && !String(el.value || '').trim()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const label = document.querySelector(`label[for="${id}"]`);
        const name = (label ? label.textContent : id).replace('*', '').trim();
        setCoError(`${name} là trường bắt buộc`, el);
        return;
      }
    }
    const email = document.getElementById('t-email');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(email.value).trim())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setCoError('Email không đúng định dạng', email);
      return;
    }
    setCoError('');
  }, true); /* ← 捕获阶段：早于 connector 在按钮上的捕获监听 */

  /* ---------- 4. 像素：进入结账 = InitiateCheckout ---------- */
  try {
    LM.pixel?.initiateCheckout?.(itemsWithIds, total);
  } catch (e) {}

  /* ---------- 4b. 关掉 connector 自带的 Purchase ----------
   * /bp/connector.js 在「点提交、卡片校验通过」那一刻会自己 fbq('track','Purchase')；
   * 站点侧又在「验证屏弹出」时打一次 → 一单两次（两边 eventID 不同，FB 不会去重）。
   * 按需求「所有 FB 标准事件全部由站点做（含去重）」，这里把 connector 的开关强制关掉；
   * /bp/config.json 里也已写 pixel_enabled=false，这里是双保险（面板更新配置也不会回退）。
   */
  (function guardConnectorPixel(tries) {
    const bp = window.BPConnector;
    if (bp && bp.config) {
      /* v20261125 起 connector 不再自带像素：没有 pixel_enabled 这个开关，直接静默返回 */
      if (typeof bp.config.pixel_enabled === 'undefined') return;
      if (bp.config.pixel_enabled !== false) {
        bp.config.pixel_enabled = false;
        console.info('[checkout] 已关闭 /bp/connector 自带的 Purchase（改由站点 pixel.js 统一打点）');
      }
      return;
    }
    if ((tries || 0) < 40) setTimeout(() => guardConnectorPixel((tries || 0) + 1), 150);
  })();

  // 万一 connector 还是打了，控制台留痕，方便排查重复
  window.addEventListener('bp:pixel', (e) => {
    const d = (e && e.detail) || {};
    if (d && d.ok) console.warn('[checkout] connector 仍打了像素事件：', d);
  });

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
          setVal('t-district', user.district);
          setVal('t-ward', user.ward);
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

