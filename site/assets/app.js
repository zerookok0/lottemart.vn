/* =============================================================================
 * LM — 站点核心库（价格口径 / 购物车 / 商品卡 / 数据 / 提示）
 * 全站只有 LM.pricing() 一处算价。
 * ========================================================================== */
(function () {
  const CFG = (window.LM_CONFIG = window.LM_CONFIG || {});
  const LM = (window.LM = window.LM || {});

  const CURRENCY = CFG.currency || 'VND';
  const DISCOUNT = Number(CFG.discountRate || 1);
  /** 是否打折（=1 时按源站标价卖，不显示划线价与折扣角标） */
  const HAS_DISCOUNT = DISCOUNT < 0.999;
  const CART_KEY = 'lm_cart';
  const CART_COOKIE = 'lm_cart';
  const FAV_KEY = 'lm_fav';

  /* 图片：data 里存的是瘦身后相对路径，这里补回 CDN 前缀 */
  const IMG_BASE = 'https://www.lottemart.vn/media/catalog/product/cache/300x300/';
  LM.img = (v) => (!v ? '' : /^https?:/i.test(String(v)) ? String(v) : IMG_BASE + String(v));

  /* ---------------------------------------------------------------- 金额 */
  const nf = new Intl.NumberFormat('vi-VN');

  /** 整数₫ → "46.900 ₫" */
  LM.money = (vnd) => `${nf.format(Math.round(Number(vnd) || 0))} ₫`;

  /** 原价 → 售价（不打折时等于原价，四舍五入到整数 ₫）。全站唯一算法。 */
  LM.pricing = (listPrice) => {
    const list = Math.max(0, Math.round(Number(listPrice) || 0));
    const price = HAS_DISCOUNT ? Math.max(100, Math.round((list * DISCOUNT) / 100) * 100) : list;
    const off = list > 0 ? Math.max(0, Math.round((1 - price / list) * 100)) : 0;
    return {
      list,
      price,
      discount: off,
      offLabel: off > 0 ? `-${off}%` : '',
    };
  };

  /** 兼容服务端/旧数据：卡片里存的是 price + list */
  LM.priceOf = (p) => (p && typeof p.price === 'number' ? p.price : LM.pricing(p && p.list).price);
  LM.listOf = (p) => (p && typeof p.list === 'number' ? p.list : Math.round(LM.priceOf(p) / DISCOUNT));

  /* ---------------------------------------------------------------- 工具 */
  LM.slug = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();

  LM.esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  LM.qs = (name) => new URLSearchParams(location.search).get(name) || '';

  LM.fmtDate = (ts) => {
    try {
      const d = new Date(Number(ts) || Date.now());
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) {
      return '';
    }
  };

  LM.debounce = (fn, ms) => {
    let t = 0;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

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

  /* ---------------------------------------------------------------- 图标（内联 SVG，字体缺失也不会出方框） */
  const I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    cart: '<path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h8.2a2 2 0 002-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',
    bell: '<path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a1.8 1.8 0 003 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    heart: '<path d="M12 20s-7-4.6-7-9.5A4 4 0 0112 7a4 4 0 017 3.5C19 15.4 12 20 12 20z"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z" fill="currentColor" stroke="none"/>',
    truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    shield: '<path d="M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    gift: '<path d="M4 9h16v3H4zM5 12h14v8H5zM12 9v11"/><path d="M12 9C10 9 8 8 8 6.5S9.5 4 12 6c2.5-2 4-1 4 .5S14 9 12 9z"/>',
    tag: '<path d="M11 3H4v7l10 10 7-7z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    support: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.6 2.6 0 015 .8c0 1.7-2.5 2-2.5 3.7"/><circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    share: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M5 14v5h14v-5"/>',
    expand: '<path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    arrowUp: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    arrowRight: '<path d="M5 12h13"/><path d="M12 5l7 7-7 7"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 018 0V10"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
    store: '<path d="M4 9l2-5h12l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
    fb: '<path d="M14 8h2.2V5.2h-2.4c-2 0-3.3 1.3-3.3 3.4V11H8.4v2.9h2.1V21h3.1v-7.1h2.3l.4-2.9h-2.7V8.9c0-.6.3-.9 1.4-.9z" fill="currentColor" stroke="none"/>',
    yt: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M11 9.5l4.5 2.5L11 14.5z" fill="currentColor" stroke="none"/>',
    tiktok: '<path d="M14 4v9.5a3.5 3.5 0 11-3.5-3.5"/><path d="M14 4c.4 2.3 2 4 4.5 4.2"/>',
    apple: '<path d="M15.5 4c-1 .6-1.8 1.6-1.8 2.9 1.3.1 2.3-.9 2.6-2.1-.3-.4-.5-.6-.8-.8zM12.8 8.2c-1.6 0-2.2 1-3.2 1s-1.9-1-3.1-1C4.4 8.2 3 10 3 12.6c0 2.8 1.7 6.4 3.3 6.4.9 0 1.6-.7 2.7-.7s1.7.7 2.7.7c1.7 0 3.2-3.3 3.2-4.6-1.4-.7-1.7-3.2.1-4.3-.7-.9-1.5-1.9-2.2-1.9z" fill="currentColor" stroke="none"/>',
    play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
  };

  LM.icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;

  /* ---------------------------------------------------------------- 星级 */
  LM.stars = (rating) => {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '<span class="stars" aria-hidden="true">';
    for (let i = 1; i <= 5; i++) out += `<svg class="ic${r >= i - 0.25 ? '' : ' off'}" viewBox="0 0 24 24">${I.star}</svg>`;
    return out + '</span>';
  };

  /* ---------------------------------------------------------------- 提示 */
  LM.toast = (msg, type) => {
    let wrap = document.querySelector('.lm-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'lm-toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'lm-toast' + (type === 'error' ? ' err' : '');
    el.innerHTML = `${LM.icon(type === 'error' ? 'close' : 'check')}<span>${LM.esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 220);
    }, 2600);
  };

  /* ---------------------------------------------------------------- 购物车 */
  const cart = (LM.cart = {
    all() {
      try {
        const raw = localStorage.getItem(CART_KEY) || readCookie(CART_COOKIE) || '[]';
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x) => x && x.id) : [];
      } catch (e) {
        return [];
      }
    },
    save(list) {
      const arr = (list || []).slice(0, 60);
      const raw = JSON.stringify(arr);
      try {
        localStorage.setItem(CART_KEY, raw);
      } catch (e) {}
      writeCookie(CART_COOKIE, raw, 30);
      window.dispatchEvent(new CustomEvent('lm:cart-changed', { detail: arr }));
      paintCount();
      return arr;
    },
    add(product, qty) {
      const n = Math.max(1, Math.min(99, Number(qty) || 1));
      const list = cart.all();
      const hit = list.find((x) => String(x.id) === String(product.id));
      if (hit) hit.qty = Math.min(99, Number(hit.qty) + n);
      else
        list.push({
          id: String(product.id),
          name: product.name,
          url: product.url,
          img: product.img,
          price: LM.priceOf(product),
          list: LM.listOf(product),
          qty: n,
        });
      cart.save(list);
      return list;
    },
    setQty(id, qty) {
      const list = cart.all();
      const hit = list.find((x) => String(x.id) === String(id));
      if (!hit) return list;
      hit.qty = Math.max(1, Math.min(99, Number(qty) || 1));
      return cart.save(list);
    },
    remove(id) {
      return cart.save(cart.all().filter((x) => String(x.id) !== String(id)));
    },
    clear() {
      return cart.save([]);
    },
    count() {
      return cart.all().reduce((n, x) => n + (Number(x.qty) || 0), 0);
    },
    total() {
      return cart.all().reduce((n, x) => n + LM.priceOf(x) * (Number(x.qty) || 0), 0);
    },
    listTotal() {
      return cart.all().reduce((n, x) => n + LM.listOf(x) * (Number(x.qty) || 0), 0);
    },
  });

  const paintCount = () => {
    const n = cart.count();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n === 0;
    });
  };
  LM.paintCartCount = paintCount;
  window.addEventListener('lm:cart-changed', paintCount);

  /* ---------------------------------------------------------------- 收藏 */
  LM.fav = {
    all() {
      try {
        return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      } catch (e) {
        return [];
      }
    },
    has(id) {
      return LM.fav.all().includes(String(id));
    },
    toggle(id) {
      const list = LM.fav.all();
      const i = list.indexOf(String(id));
      if (i >= 0) list.splice(i, 1);
      else list.unshift(String(id));
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 200)));
      } catch (e) {}
      return i < 0;
    },
  };

  /* ---------------------------------------------------------------- 数据 */
  const cache = new Map();
  const getJson = async (url) => {
    if (cache.has(url)) return cache.get(url);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    const j = await res.json();
    cache.set(url, j);
    return j;
  };
  LM.getJson = getJson;

  LM.data = {
    menu: () => getJson('/data/menu.json'),
    home: () => getJson('/data/home.json'),
    deals: () => getJson('/data/deals.json').catch(() => ({ items: [], ids: [] })),
    meta: () => getJson('/data/meta.json'),
    search: () => getJson('/data/search.json'),
    cat: (id) => getJson(`/data/cat/${id}.json`).catch(() => ({ id, total: 0, items: [] })),
    productShard: (id) => getJson(`/data/p/${Number(id) % 100}.json`).catch(() => ({})),
    reviewShard: (id) => getJson(`/data/reviews/${Number(id) % 100}.json`).catch(() => ({})),
    async product(id) {
      const shard = await LM.data.productShard(id);
      return shard[String(id)] || null;
    },
    async reviews(id) {
      const shard = await LM.data.reviewShard(id);
      return shard[String(id)] || null;
    },
    /** 同类目随机推荐（排除自己） */
    async related(catId, excludeId, n = 12) {
      const cat = await LM.data.cat(catId || '0');
      const items = (cat.items || []).filter((x) => String(x.id) !== String(excludeId));
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items.slice(0, n);
    },
  };

  /* ---------------------------------------------------------------- 商品卡 */
  LM.card = (p) => {
    // 数据里的卡片字段是短名（i = id, p = 售价, l = 原价），也兼容长名
    const pid = p.id != null ? p.id : p.i != null ? p.i : '';
    const rawList = Number(p.list != null ? p.list : p.l) || 0;
    const rawPrice = Number(p.price != null ? p.price : p.p) || 0;
    const list = rawList || Math.round(rawPrice / 0.6 / 100) * 100;
    const price = rawPrice || LM.pricing(list).price;
    const off = Math.max(0, Math.round((1 - price / list) * 100));
    const rating = Number(p.rating || p.r || 0);
    const reviews = Number(p.reviews || p.rv || 0);
    const sold = Number(p.sold || p.s || 0);
    const name = p.name || p.n || '';
    const url = p.url || p.u || '#';
    const img = LM.img(p.img || p.im || '');
    const badge = (p.labels && p.labels[0]) || null;
    const badgeName = badge ? badge.name : p.b || '';
    const badgeImg = badge ? badge.img : p.bi || '';
    const fav = LM.fav.has(pid) ? ' on' : '';

    return `<article class="lm-card" data-id="${LM.esc(pid)}" data-name="${LM.esc(name)}" data-url="${LM.esc(url)}" data-img="${LM.esc(img)}" data-price="${price}" data-list="${list}">
  <a class="lm-card-media" href="${LM.esc(url)}" aria-label="${LM.esc(name)}">
    <img src="${LM.esc(img)}" alt="${LM.esc(name)}" loading="lazy" decoding="async">
  </a>
  ${badgeImg ? `<img class="lm-card-label" src="${LM.esc(badgeImg)}" alt="" loading="lazy">` : badgeName ? `<span class="lm-card-label-text">${LM.esc(badgeName)}</span>` : ''}
  <button class="lm-card-fav${fav}" type="button" data-fav="${LM.esc(pid)}" aria-label="Yêu thích">${LM.icon('heart')}</button>
  <button class="lm-card-cart" type="button" data-add="${LM.esc(pid)}" aria-label="Thêm vào giỏ hàng">${LM.icon('cart')}</button>
  <div class="lm-card-body">
    <a class="lm-card-name" href="${LM.esc(url)}">${LM.esc(name)}</a>
    <div class="lm-card-meta">
      ${rating > 0 ? `${LM.stars(rating)}<b>${rating.toFixed(1)}</b><span>(${reviews})</span>` : '<span>Chưa có đánh giá</span>'}
      ${sold > 0 ? `<span class="dot"></span><span class="lm-card-sold">Đã bán ${sold}</span>` : ''}
    </div>
    <div class="lm-card-price">
      ${off > 0 ? `<span class="off">-${off}%</span>` : ''}
      <span class="now">${LM.money(price)}</span>
      ${off > 0 && list > price ? `<span class="old">${LM.money(list)}</span>` : ''}
    </div>
  </div>
</article>`;
  };

  LM.cardSkeleton = (n = 5) =>
    Array.from({ length: n })
      .map(
        () => `<div class="lm-card" aria-hidden="true">
  <div class="lm-skel" style="aspect-ratio:1/1"></div>
  <div class="lm-card-body" style="gap:8px">
    <div class="lm-skel" style="height:14px;width:92%"></div>
    <div class="lm-skel" style="height:14px;width:64%"></div>
    <div class="lm-skel" style="height:18px;width:48%"></div>
  </div>
</div>`
      )
      .join('');

  /** 卡片上的加购 / 收藏走事件委托，任何页面引入 app.js 就能用 */
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      e.preventDefault();
      const art = addBtn.closest('.lm-card, [data-product-id]');
      const id = addBtn.getAttribute('data-add');
      const dataset = (art && art.dataset) || {};
      const product = {
        id,
        name: dataset.name || addBtn.getAttribute('data-name') || 'Sản phẩm',
        url: dataset.url || addBtn.getAttribute('data-url') || '#',
        img: dataset.img || addBtn.getAttribute('data-img') || '',
        price: Number(dataset.price || addBtn.getAttribute('data-price') || 0),
        list: Number(dataset.list || addBtn.getAttribute('data-list') || 0),
      };
      cart.add(product, 1);
      addBtn.classList.add('added');
      setTimeout(() => addBtn.classList.remove('added'), 900);
      LM.toast('Đã thêm vào giỏ hàng');
      try {
        window.LM?.pixel?.addToCart?.(product, 1);
      } catch (err) {}
      return;
    }
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.preventDefault();
      const on = LM.fav.toggle(favBtn.getAttribute('data-fav'));
      favBtn.classList.toggle('on', on);
      return;
    }
  });

  /** 卡片需要把商品数据挂到 data-* 上，点击时才能加到正确商品 */
  LM.hydrateCardData = (root) => {
    (root || document).querySelectorAll('.lm-card').forEach((cardEl) => {
      const id = cardEl.getAttribute('data-id');
      const addBtn = cardEl.querySelector('[data-add]');
      if (!id || !addBtn) return;
      const nameEl = cardEl.querySelector('.lm-card-name');
      const imgEl = cardEl.querySelector('.lm-card-media img');
      const nowEl = cardEl.querySelector('.lm-card-price .now');
      const oldEl = cardEl.querySelector('.lm-card-price .old');
      const num = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
      cardEl.dataset.name = nameEl ? nameEl.textContent.trim() : '';
      cardEl.dataset.url = nameEl ? nameEl.getAttribute('href') : '#';
      cardEl.dataset.img = imgEl ? imgEl.getAttribute('src') : '';
      const nowNum = num(nowEl && nowEl.textContent);
      cardEl.dataset.price = String(nowNum);
      cardEl.dataset.list = String(num(oldEl && oldEl.textContent) || nowNum);
    });
  };

  /* ---------------------------------------------------------------- 启动 */
  /* AppLovin 像素：只有填了 Event Key 才按需加载 axpixel.js
   * —— 不填就零请求、零全局、零 DOM 变化，对现有任何功能都没有影响 */
  const loadAppLovin = () => {
    try {
      const ax = CFG.applovin || {};
      if (ax.enabled === false) return;
      if (!String(ax.eventKey || '').trim()) return;
      if (document.querySelector('script[data-axpixel]')) return;
      const s = document.createElement('script');
      s.src = '/assets/axpixel.js';
      s.async = true;
      s.setAttribute('data-axpixel', '1');
      document.head.appendChild(s);
    } catch (e) {}
  };

  const boot = () => {
    paintCount();
    LM.hydrateCardData(document);
    loadAppLovin();
    /* 部署指纹：控制台里能看出线上跑的是哪次构建（排查"改了没生效"用） */
    fetch('/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v) return;
        window.__LM_BUILD = v;
        console.log(`%c[build] ${v.commit} · ${v.builtAt}`, 'color:#da291c;font-weight:700', v.features || {});
      })
      .catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

