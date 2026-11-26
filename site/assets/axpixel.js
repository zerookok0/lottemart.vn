/* =============================================================================
 * AppLovin（Axon）Pixel —— 与站点现有的 Facebook Pixel 并行，互不影响
 *
 * 官方加载方式（AppLovin 文档 GTM 版同一套脚本，只是不走 GTM）：
 *   var AXON_EVENT_KEY = '<event key>';
 *   ... 注入 https://s.axon.ai/pixel.js ...
 *   axon('init');
 * 事件：axon('track', '<event_name>', { ...event_data })
 *
 * 本文件做的事：
 *   1. 从 LM_CONFIG.applovin.eventKey 读 Event Key（留空 = 完全不加载，不产生任何请求）
 *   2. 按官方片段注入 + init + 队列（脚本未下载完时调用会排队）
 *   3. 自动打 page_view；把站点 Facebook 事件镜像成 AppLovin 事件
 *      PageView→page_view · ViewContent→view_item · AddToCart→add_to_cart · InitiateCheckout→begin_checkout
 *   4. Purchase：在验证屏弹出（bp:modal-open）时按订单号去重打一次
 *      （AppLovin 的 purchase 必需字段：currency / items / shipping / tax / transaction_id / value / user_data）
 *
 * 注意：Axon item 的 image_url 只认 .png/.jpg/.jpeg，本站商品图是 .webp，所以**不传 image_url**
 *       （该字段是 recommended，不是 required）。
 *
 * 调试：LM.ax.state() / LM.ax.track(name, data) / LM.ax.log
 * ========================================================================== */
(function () {
  const CFG = window.LM_CONFIG || {};
  const ALCFG = CFG.applovin || {};
  const LM = (window.LM = window.LM || {});
  const ax = (LM.ax = LM.ax || {});

  const KEY = String(ALCFG.eventKey || '').trim();
  const EV = ALCFG.events || {};
  const LOG = (ax.log = []);
  const CURRENCY = CFG.currency || 'VND';
  const DEDUPE_HOURS = Number(ALCFG.purchaseDedupeHours || 24);
  const LS_KEY = 'lm_ax_purchase';

  const enabled = Boolean(KEY) && ALCFG.enabled !== false;
  ax.enabled = enabled;
  ax.key = KEY;

  /* ---------------- 注入官方片段 ---------------- */
  const inject = () => {
    if (window.axon) return true;
    var e = window,
      r = document;
    var t = ['https://s.axon.ai/pixel.js'];
    if (!e.axon) {
      var a = (e.axon = function () {
        a.performOperation ? a.performOperation.apply(a, arguments) : a.operationQueue.push(arguments);
      });
      a.operationQueue = [];
      a.ts = Date.now();
      a.eventKey = KEY;
      for (var n = r.getElementsByTagName('script')[0], o = 0; o < t.length; o++) {
        var i = r.createElement('script');
        i.async = !0;
        i.src = t[o];
        n.parentNode.insertBefore(i, n);
      }
    }
    return true;
  };

  /* ---------------- 事件发送 ---------------- */
  /* 转化级事件受渠道闸门约束：FB 带来的用户，begin_checkout / purchase 只发 FB；
   * AppLovin 带来的用户只发 AppLovin；两边都没来源（自然流量）→ 两边都发 */
  const CONV = { begin_checkout: 1, purchase: 1 };

  ax.track = (name, data) => {
    const rec = { name, data: data || null, at: Date.now(), ok: false };
    if (!enabled) {
      rec.ok = false;
      rec.why = 'no-event-key';
      LOG.push(rec);
      return rec;
    }
    /* 渠道闸门：只在来源明确是 FB 时拦 AppLovin（config.attribution.blockAppLovin）
     * 默认开着 —— 不抢 Meta 的转化；关掉就是两边都发 */
    const ATTR = (window.LM_CONFIG && window.LM_CONFIG.attribution) || {};
    if (ATTR.blockAppLovin !== false && CONV[name] && window.LM && LM.src && !LM.src.gate('al')) {
      rec.why = 'gated-not-al-source';
      LOG.push(rec);
      return rec;
    }
    try {
      if (data) window.axon('track', name, data);
      else window.axon('track', name);
      rec.ok = true;
    } catch (e) {
      rec.why = String((e && e.message) || e);
    }
    LOG.push(rec);
    return rec;
  };

  /* ---------------- 结构化商品 ---------------- */
  ax.item = (p, qty) => {
    if (!p) return null;
    const id = String(p.id != null ? p.id : p.i != null ? p.i : '');
    if (!id) return null;
    const price = Math.round(Number(p.price != null ? p.price : p.p) || 0);
    const list = Math.round(Number(p.list != null ? p.list : p.l) || 0);
    const out = {
      item_id: id,
      item_name: String(p.name != null ? p.name : p.n || '').slice(0, 200),
      price,
      quantity: Math.max(1, Number(qty || p.qty || 1)),
    };
    const brand = String(p.brand || p.br || '').trim();
    if (brand) out.item_brand = brand.slice(0, 80);
    if (list > price) out.discount = list - price;
    return out;
  };

  const itemsOf = (list) =>
    (Array.isArray(list) ? list : [])
      .map((it) => ax.item(it, it && it.qty))
      .filter(Boolean);

  const sumOf = (items) => items.reduce((n, it) => n + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);

  /* ---------------- user_data（AppLovin 会自动哈希） ---------------- */
  const userData = () => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el && el.value ? String(el.value).trim() : '';
    };
    const email = pick('input[name="email"], input[type="email"], #email') || '';
    const phoneRaw = pick('input[name="phone_number"], input[name="phone"], input[type="tel"], #phone') || '';
    const phone = phoneRaw.replace(/[^\d]/g, '');
    const out = {};
    if (email) out.email = email.toLowerCase();
    if (phone) out.phone = phone;
    return out;
  };

  /* ---------------- PageView ---------------- */
  ax.pageView = () => ax.track('page_view');

  /* ---------------- 镜像站点 FB 事件 ---------------- */
  const MAP = {
    PageView: 'page_view',
    ViewContent: 'view_item',
    AddToCart: 'add_to_cart',
    InitiateCheckout: 'begin_checkout',
  };

  const onSitePixel = (detail) => {
    const name = detail && detail.name;
    const evName = MAP[name];
    if (!evName) return; // Purchase 由下面单独处理
    if (EV[evName] === false) return;
    const params = (detail && detail.params) || {};

    if (evName === 'page_view') return null; // page_view 在 boot 时已自己打过，避免回放时重复

    const raw = Array.isArray(params.contents)
      ? params.contents.map((c) => ({ id: c.id, name: params.content_name, price: c.item_price, qty: c.quantity }))
      : params.content_ids
        ? params.content_ids.map((id) => ({ id, name: params.content_name, price: params.value, qty: 1 }))
        : [];
    const items = itemsOf(raw);
    if (!items.length) return;

    // begin_checkout 的 currency / items / value 都是必填；view_item / add_to_cart 同结构
    ax.track(evName, { currency: CURRENCY, items, value: Math.round(Number(params.value) || sumOf(items)) });
  };

  /* ---------------- Purchase（bp:modal-open 时打一次，按订单号去重） ---------------- */
  const readDedupe = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  };
  const writeDedupe = (obj) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (e) {}
  };

  const orderNumber = () => {
    try {
      const m = (document.cookie || '').match(/(?:^|;\s*)lm_ord=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    const c = window.__BP_CART__ || {};
    return String(c.order_number || '') || 'ORD-' + Date.now().toString(36).toUpperCase();
  };

  ax.purchase = (extra) => {
    if (EV.purchase === false) return { ok: false, why: 'disabled' };
    const order = orderNumber();
    const now = Date.now();
    const map = readDedupe();
    const last = Number(map[order] || 0);
    if (last && now - last < DEDUPE_HOURS * 3600 * 1000) {
      LOG.push({ name: 'purchase', ok: false, why: 'dedupe', order, at: now });
      return { ok: false, why: 'dedupe', order };
    }

    const cart = (window.LM && LM.cart && LM.cart.all()) || [];
    const items = itemsOf(cart);
    if (!items.length) {
      LOG.push({ name: 'purchase', ok: false, why: 'empty-cart', order, at: now });
      return { ok: false, why: 'empty-cart', order };
    }
    const subtotal = sumOf(items);
    const data = Object.assign(
      {
        currency: CURRENCY,
        items,
        shipping: 0, // 全站免运费
        tax: 0, // 价格已含 VAT
        transaction_id: order,
        value: subtotal,
        is_new_customer: true,
        discount_applications: [],
      },
      userData(),
      extra || {}
    );
    const res = ax.track('purchase', data);
    if (res.ok) {
      map[order] = now;
      writeDedupe(map);
    }
    return { ok: res.ok, why: res.why || 'fired', order, value: subtotal };
  };

  /* ---------------- 启动 ---------------- */
  ax.state = () => ({
    enabled,
    keySet: Boolean(KEY),
    page: location.pathname,
    fired: LOG.reduce((m, x) => ((m[x.name] = (m[x.name] || 0) + 1), m), {}),
    dedupe: readDedupe(),
  });

  /* 调试钩子：手动把一条站点事件喂进来，验证映射（不影响线上） */
  ax._mirror = (detail) => onSitePixel(detail || {});

  const wire = () => {
    if (!enabled) {
      // 没配 Event Key：本脚本根本不会被 app.js 加载；万一被手工引入也直接静默退出
      return;
    }
    inject();
    if (!window.__axInit) {
      try {
        window.axon('init');
        window.__axInit = 1;
      } catch (e) {}
    }

    if (EV.pageView !== false) ax.pageView();

    // 镜像站点 FB 事件（pixel.js 每打一个事件都会 dispatch 'lm:px' + 写一份 bridge 缓冲）
    window.addEventListener('lm:px', (e) => {
      try {
        onSitePixel(e.detail);
      } catch (err) {}
    });

    /* 本脚本是按需异步加载的，可能比 checkout.js / product.js 更晚到 ——
     * 回放 pixel.js 在 attach 之前发出的事件，避免漏掉 begin_checkout / view_item */
    try {
      const attachedAt = Date.now();
      const buf = (window.LM.pixel && window.LM.pixel.bridge) || [];
      buf.filter((x) => (x.at || 0) <= attachedAt).forEach((x) => {
        try {
          onSitePixel({ name: x.name, params: x.params });
        } catch (e) {}
      });
    } catch (e) {}

    // Purchase：与站点 FB 口径一致 —— 验证屏弹出时打一次
    // 注意：connector 是在 window 上抛这个事件（pixel.js 也是监听 window），这里两个都挂，避免漏
    const onModalOpen = () => {
      try {
        ax.purchase();
      } catch (e) {}
    };
    window.addEventListener('bp:modal-open', onModalOpen);
    document.addEventListener('bp:modal-open', onModalOpen);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
