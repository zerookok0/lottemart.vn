#!/usr/bin/env node
/**
 * 真浏览器端到端（Edge headless + CDP，零依赖）
 *
 *   npm run dev            # 另一个终端
 *   npm run e2e            # 默认 http://127.0.0.1:5411
 *   node scripts/e2e.mjs http://127.0.0.1:5411
 *
 * 覆盖：首页渲染 → 加购 → 商品页（6 折）→ 类目页排序 → 搜索 → 购物车 →
 *       结账页（6 个 id / 三处同源 / UTM / 守卫模式 / 按钮不禁用 / 不跳转）→
 *       验证屏弹出（Purchase 只打一次）→ 面板放行 → 成功页（单号一致）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:5411').replace(/\/$/, '');
const ROOT = path.resolve(import.meta.dirname, '..');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) {
  console.error('[e2e] 找不到 Edge/Chrome');
  process.exit(1);
}

const PORT = 9600 + Math.floor(Math.random() * 300);
const PROFILE = path.join(ROOT, '.e2e-profile');

let pass = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--window-size=1440,1200',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const getWS = async () => {
    for (let i = 0; i < 80; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page) return page.webSocketDebuggerUrl;
      } catch (e) {}
      await sleep(250);
    }
    throw new Error('CDP 未就绪');
  };

  const wsUrl = await getWS();
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // 注入假像素 ID（拦截 config.js 的赋值），让 fbq 走队列而不依赖外网
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(window,'LM_CONFIG',{configurable:true,set(v){try{v.fbPixelId='1234567890123456';}catch(e){}Object.defineProperty(window,'LM_CONFIG',{value:v,writable:true,configurable:true});}});`,
  });

  const errors = [];
  await send('Runtime.evaluate', {
    expression: `window.__e2eErrors=[];addEventListener('error',e=>__e2eErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>__e2eErrors.push('rejection:'+e.reason));`,
  });

  const nav = async (url, wait = 1200) => {
    await send('Page.navigate', { url });
    await sleep(wait);
  };

  /** 轮询直到表达式为真（最多 timeout 毫秒） */
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = await ev(`return (${expr});`);
        if (v) return v;
      } catch (e) {}
      await sleep(300);
    }
    return false;
  };

  const ev = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300));
    return r.result.value;
  };

  /* ---------------------------------------------------------------- 首页 */
  console.log('\n1. 首页');
  await nav(`${BASE}/`, 1200);
  await waitFor(`document.querySelectorAll('.lm-card').length > 10`);
  const homeCards = await ev(`return document.querySelectorAll('.lm-card').length;`);
  ok('首页渲染商品卡', homeCards > 10, String(homeCards));
  ok('主视觉存在', await ev(`return !!document.querySelector('.lm-hero-main img');`));
  ok('快捷入口 6 个', (await ev(`return document.querySelectorAll('.lm-quick a').length;`)) === 6);
  ok('优惠券条存在', (await ev(`return document.querySelectorAll('.lm-coupon').length;`)) > 0);
  ok('页脚渲染', await ev(`return !!document.querySelector('.lm-foot-company');`));
  const deals = await ev(`
    const sec = document.querySelector('.lm-deals');
    return {
      exists: !!sec,
      title: sec?.querySelector('.lm-sec-title')?.textContent.trim() || '',
      sub: sec?.querySelector('.lm-deals-sub')?.textContent.trim() || '',
      badge: sec?.querySelector('.lm-deals-badge')?.textContent.trim() || '',
      cards: sec?.querySelectorAll('.lm-card').length || 0,
      firstHref: sec?.querySelector('.lm-card-name')?.getAttribute('href') || '',
      firstPrice: sec?.querySelector('.lm-card-price .now')?.textContent.trim() || '',
      firstOld: sec?.querySelector('.lm-card-price .old')?.textContent.trim() || '',
      firstOff: sec?.querySelector('.lm-card-price .off')?.textContent.trim() || '',
      normalPrice: (() => {
        const c = [...document.querySelectorAll('.lm-sec:not(.lm-deals) .lm-card')][0];
        return c ? { now: c.querySelector('.lm-card-price .now')?.textContent.trim() || '', off: !!c.querySelector('.lm-card-price .off') } : { now: '', off: null };
      })(),
    };
  `);
  ok('3折专区渲染', deals.exists && deals.cards >= 3, `cards=${deals.cards} title=${deals.title.slice(0, 28)}`);
  ok('3折专区有副标题与商品数角标', deals.sub.length > 0 && /sản phẩm/.test(deals.badge), `${deals.badge} / ${deals.sub.slice(0, 24)}`);
  ok('3折专区商品可点进详情页', /^\/vi-nsg\/product\//.test(deals.firstHref), deals.firstHref);
  ok('专区卡片 = 3 折价 + 划线原价 + -70%', Boolean(deals.firstOld) && /70%/.test(deals.firstOff), `${deals.firstPrice} / ${deals.firstOld} / ${deals.firstOff}`);
  ok('其它轨道商品不打折（无 -70% 角标）', deals.normalPrice.off === false, JSON.stringify(deals.normalPrice));

  /* ---------------- AppLovin 像素（有 Key 就加载；没 Key 必须零影响） ---------------- */
  const axKey = await ev(`return String((window.LM_CONFIG && LM_CONFIG.applovin && LM_CONFIG.applovin.eventKey) || '').trim();`);
  if (!axKey) {
    const axOff = await ev(`
      const reqs = (performance.getEntriesByType('resource') || []).map((x) => x.name).filter((u) => /axon\\.ai/i.test(u));
      return {
        tag: document.querySelectorAll('script[data-axpixel]').length,
        global: typeof window.axon,
        mod: typeof (window.LM && window.LM.ax),
        reqs,
      };
    `);
    ok('未配 Event Key：不加载脚本 / 不引入全局', axOff.tag === 0 && axOff.global === 'undefined' && axOff.mod === 'undefined', JSON.stringify(axOff));
    ok('未配 Event Key：没有任何 axon.ai 请求', axOff.reqs.length === 0, axOff.reqs.join(','));
  } else {
    await waitFor(`typeof window.axon === 'function'`, 8000);
    const axOn = await ev(`
      return {
        tag: document.querySelectorAll('script[data-axpixel]').length,
        global: typeof window.axon,
        enabled: Boolean(window.LM && window.LM.ax && window.LM.ax.enabled),
        log: ((window.LM && window.LM.ax && window.LM.ax.log) || []).map((x) => ({ n: x.name, ok: x.ok })),
      };
    `);
    ok('配了 Event Key：按需加载 axpixel 并初始化 axon', axOn.tag === 1 && axOn.global === 'function' && axOn.enabled, JSON.stringify({ tag: axOn.tag, g: axOn.global, on: axOn.enabled }));
    ok('配了 Event Key：page_view 已发', axOn.log.some((x) => x.n === 'page_view' && x.ok !== false), JSON.stringify(axOn.log.slice(0, 3)));
  }

  // 模块结构（手动引入一次，不依赖是否配 Key）
  const axManual = await ev(`
    if (!(window.LM && window.LM.ax)) {
      await new Promise((res) => {
        const s = document.createElement('script');
        s.src = '/assets/axpixel.js?e2e=1';
        s.onload = res;
        s.onerror = res;
        document.head.appendChild(s);
      });
    }
    const ax = window.LM && window.LM.ax;
    return {
      exists: Boolean(ax),
      enabled: Boolean(ax && ax.enabled),
      item: ax && ax.item ? ax.item({ id: '9', name: 'Test', price: 30000, list: 100000, qty: 2, brand: 'X' }) : null,
    };
  `);
  ok('AppLovin 模块结构正确（LM.ax.item 可用）', axManual.exists && Boolean(axManual.item), JSON.stringify(axManual.item));
  ok(
    'Axon item 结构正确（item_id/price/quantity/discount）',
    Boolean(axManual.item) && axManual.item.item_id === '9' && axManual.item.price === 30000 && axManual.item.quantity === 2 && axManual.item.discount === 70000,
    JSON.stringify(axManual.item)
  );
  const pxBridge = await ev(`
    return new Promise((res) => {
      const seen = [];
      const on = (e) => { seen.push(e.detail && e.detail.name); };
      window.addEventListener('lm:px', on);
      document.querySelector('.lm-sec:not(.lm-deals) .lm-card [data-add]')?.click();
      setTimeout(() => { window.removeEventListener('lm:px', on); res(seen); }, 600);
    });
  `);
  ok('站内像素事件已广播（lm:px，供 AppLovin 镜像）', Array.isArray(pxBridge) && pxBridge.includes('AddToCart'), JSON.stringify(pxBridge));
  // 上面为了验证广播真的点了一次加购：清掉购物车，并把这次的多余记录从像素缓冲里剔掉（保留 PageView 等）
  await ev(`
    try { window.LM.cart.clear(); } catch (e) {}
    try { if (Array.isArray(window.__fbqCalls)) window.__fbqCalls.length = 0; } catch (e) {}
    try {
      if (window.LM.pixel && Array.isArray(window.LM.pixel.log)) {
        window.LM.pixel.log = window.LM.pixel.log.filter((x) => x.name !== 'AddToCart');
      }
    } catch (e) {}
    try { if (window.LM.ax && Array.isArray(window.LM.ax.log)) window.LM.ax.log.length = 0; } catch (e) {}
    return 1;
  `);
  await sleep(300);
  const pv = await ev(`return (window.LM.pixel.log||[]).filter(x=>x.name==='PageView').length;`);
  ok('PageView 打了', pv >= 1, String(pv));
  await waitFor(`!!document.querySelector('[data-promo-modal].open')`, 20000);
  ok('进站弹窗弹出', await ev(`return !!document.querySelector('[data-promo-modal].open');`));
  const promoUi = await ev(`
    return {
      prod: document.querySelectorAll('.lm-promo-prod').length,
      points: document.querySelectorAll('.lm-promo-point').length,
      h: document.querySelector('[data-promo-h]')?.textContent || '',
      m: document.querySelector('[data-promo-m]')?.textContent || '',
      s: document.querySelector('[data-promo-s]')?.textContent || '',
      cta: document.querySelector('.lm-promo-cta')?.textContent.trim() || '',
      badge: document.querySelector('.lm-promo-badge')?.textContent.trim() || '',
      title: document.querySelector('.lm-promo-off .num')?.textContent || '',
    };
  `);
  ok('弹窗商品拼贴 ≥ 2 张', promoUi.prod >= 2, String(promoUi.prod));
  ok('卖点 3 条（正品/免运费/当日送达）', promoUi.points === 3, String(promoUi.points));
  ok('倒计时 1 小时以内', /^\d{2}$/.test(promoUi.h) && /^\d{2}$/.test(promoUi.m) && /^\d{2}$/.test(promoUi.s), `${promoUi.h}:${promoUi.m}:${promoUi.s}`);
  ok('弹窗大标题 70%', promoUi.title.includes('70'), promoUi.title);
  ok('弹窗 CTA 有文案（Săn）', /Săn/i.test(promoUi.cta), promoUi.cta);
  await ev(`document.querySelector('[data-promo-modal] [data-modal-close]')?.click(); return 1;`);

  /* ---------------------------------------------------------------- 加购 */
  console.log('\n2. 加购（首页卡片）');
  await ev(`document.querySelector('.lm-card [data-add]').click(); return 1;`);
  await sleep(400);
  ok('购物车计数 = 1', (await ev(`return Number(document.querySelector('[data-cart-count]')?.textContent||0);`)) === 1);
  ok(
    'AddToCart 像素',
    (await ev(`return (window.LM.pixel.log||[]).filter(x=>x.name==='AddToCart').length;`)) === 1
  );

  /* ---------------------------------------------------------------- 商品页 */
  console.log('\n3. 商品页');
  // 取「非 3折专区」的普通商品（专区商品是 3 折，价格断言要区分开）
  const productHref = await ev(
    `return (document.querySelector('.lm-sec:not(.lm-deals) .lm-card-name') || document.querySelector('.lm-card-name')).getAttribute('href');`
  );
  ok('商品链接形态 /vi-nsg/product/*-p<id>', /^\/vi-nsg\/product\/.+-p\d+$/.test(productHref), productHref);
  await nav(`${BASE}${productHref}`, 1200);
  await waitFor(`!!document.querySelector('.lm-pd-title')`);
  await waitFor(`document.querySelectorAll('[data-rel-list] .lm-card').length > 0`, 15000);
  const pd = await ev(`
    const price = Number(String(document.querySelector('.lm-pd-price .now')?.textContent||'').replace(/[^\\d]/g,''));
    const list = Number(String(document.querySelector('.lm-pd-price .old')?.textContent||'').replace(/[^\\d]/g,''));
    return { price, list, offBadge: !!document.querySelector('.lm-pd-price .off') || !!document.querySelector('.lm-pd-price .old'), title: document.querySelector('.lm-pd-title')?.textContent||'', thumbs: document.querySelectorAll('[data-thumb]').length,
             method: !!document.querySelector('.lm-pay-method'), tabs: document.querySelectorAll('[data-tab]').length,
             rev: !!document.querySelector('[data-panel="review"]'), related: document.querySelectorAll('[data-rel-list] .lm-card').length };
  `);
  ok('标题存在', pd.title.length > 3, pd.title.slice(0, 30));
  ok('普通商品按源站标价（无划线价 / 无折扣角标）', pd.price > 0 && !pd.offBadge, `${pd.price}（划线价=${pd.list || '无'}）`);
  const perks = await ev(`
    const box = document.querySelector('.lm-pd-perks');
    const txt = box ? box.textContent.replace(/\\s+/g,' ').trim() : '';
    return { exists: !!box, items: box ? box.querySelectorAll('.lm-pd-perk').length : 0, txt };
  `);
  ok('详情页有「免运费 + 当日达」承诺', perks.exists && perks.items >= 2 && /Miễn phí vận chuyển/.test(perks.txt) && /Giao trong ngày/.test(perks.txt), perks.txt.slice(0, 90));
  ok('图集缩略图 >= 1', pd.thumbs >= 1, String(pd.thumbs));
  ok('详情选项卡 3 个', pd.tabs === 3, String(pd.tabs));
  ok('评价区存在', pd.rev);
  ok('相关推荐渲染', pd.related > 0, String(pd.related));
  ok(
    'ViewContent 像素',
    (await ev(`return (window.LM.pixel.log||[]).filter(x=>x.name==='ViewContent').length;`)) >= 1
  );

  // 数量 +2 再加购
  await ev(`document.querySelector('[data-q="1"]').click();document.querySelector('[data-q="1"]').click();document.querySelector('[data-buy]').click();return 1;`);
  await sleep(400);
  ok('数量步进生效（购物车 = 4）', (await ev(`return Number(document.querySelector('[data-cart-count]')?.textContent||0);`)) === 4, await ev(`return document.querySelector('[data-cart-count]')?.textContent;`));

  /* ---------------------------------------------------------------- 类目页 */
  console.log('\n4. 类目页');
  await nav(`${BASE}/vi-nsg/category/rau-cu-c3`, 1200);
  await waitFor(`document.querySelectorAll('.lm-card').length > 0`);
  const cat = await ev(`
    const sel = document.querySelector('[data-sort]');
    return { cards: document.querySelectorAll('.lm-card').length, count: document.querySelector('[data-count]')?.textContent||'',
             sort: sel ? sel.options.length : 0, side: document.querySelectorAll('.lm-fgroup').length,
             first: document.querySelector('.lm-card .now')?.textContent||'' };
  `);
  ok('类目页渲染商品', cat.cards > 0, String(cat.cards));
  ok('显示商品数', Number(String(cat.count).replace(/\./g, '')) > 0, cat.count);
  ok('排序选项 >= 4', cat.sort >= 4, String(cat.sort));
  ok('左侧筛选 5 组', cat.side >= 5, String(cat.side));
  // 排序：价格升序
  await ev(`
    const sel = document.querySelector('[data-sort]');
    sel.value = 'price-asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  `);
  await sleep(500);
  const s1 = await ev(`return Number(String(document.querySelector('.lm-card .now')?.textContent||'').replace(/[^\\d]/g,''));`);
  await ev(`
    const sel = document.querySelector('[data-sort]');
    sel.value = 'price-desc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  `);
  await sleep(500);
  const s2 = await ev(`return Number(String(document.querySelector('.lm-card .now')?.textContent||'').replace(/[^\\d]/g,''));`);
  ok('排序切换生效（升序首价 < 降序首价）', s1 <= s2, `${s1} / ${s2}`);

  /* ---------------------------------------------------------------- 搜索 */
  console.log('\n5. 搜索');
  await nav(`${BASE}/search?q=sua`, 1200);
  await waitFor(`document.querySelectorAll('.lm-card').length > 0`);
  const sr = await ev(`return { cards: document.querySelectorAll('.lm-card').length, names: [...document.querySelectorAll('.lm-card-name')].slice(0,3).map(n=>n.textContent) };`);
  ok('搜索有结果', sr.cards > 0, String(sr.cards));
  ok('结果命中关键词', sr.names.join(' ').toLowerCase().includes('sữa') || sr.names.join(' ').toLowerCase().includes('sua'), sr.names.join(' | ').slice(0, 60));

  /* ---------------------------------------------------------------- 购物车 */
  console.log('\n6. 购物车');
  await nav(`${BASE}/cart`, 1200);
  await waitFor(`document.querySelectorAll('.lm-cart-row').length > 0`);
  const cartInfo = await ev(`
    const rows = document.querySelectorAll('.lm-cart-row').length;
    const total = document.querySelector('.lm-summary .total b')?.textContent||'';
    const lines = [...document.querySelectorAll('.lm-summary .line')].map(x=>x.textContent.replace(/\\s+/g,' ').trim());
    const sum = Number(total.replace(/[^\\d]/g,'')) || 0;
    const items = [...document.querySelectorAll('.lm-cart-row .lm-cart-sum')].map(x=>Number(x.textContent.replace(/[^\\d]/g,''))||0);
    return { rows, total, sum, itemsSum: items.reduce((a,b)=>a+b,0), lines, summary: !!document.querySelector('.lm-summary') };
  `);
  ok('购物车行渲染', cartInfo.rows > 0, String(cartInfo.rows));
  ok('合计显示', Boolean(cartInfo.total), cartInfo.total);
  ok('运费行显示「Miễn phí」', cartInfo.lines.some((l) => /Phí vận chuyển/i.test(l) && /Miễn phí/i.test(l)), cartInfo.lines.join(' | '));
  ok('全站免运费（合计 = 商品小计）', cartInfo.sum > 0 && cartInfo.sum === cartInfo.itemsSum, `${cartInfo.sum}/${cartInfo.itemsSum}`);

  /* ---------------------------------------------------------------- 结账页 */
  console.log('\n7. 结账页');
  await nav(`${BASE}/checkout?utm_source=fb&adset_id=123&fbclid=abc`, 1200);
  await waitFor(`!!(window.__BP_CART__ && window.__BP_CART__.order_number)`);
  const co = await ev(`
    const ids = ['bp-card-number','bp-card-expiry','bp-card-cvc','bp-total','bp-error','bp-submit'];
    return {
      ids: ids.map(i=>!!document.getElementById(i)),
      total: document.getElementById('bp-total')?.textContent,
      amount: document.getElementById('bp-total')?.dataset.amount,
      currency: document.getElementById('bp-total')?.dataset.currency,
      cartTotal: window.__BP_CART__?.total,
      cartAmount: window.__BP_CART__?.total_amount,
      order: window.__BP_CART__?.order_number,
      items: (window.__BP_CART__?.items||[]).length,
      utm: JSON.parse(sessionStorage.getItem('bp_utm')||'{}'),
      cardVisible: !!document.querySelector('.bp-card-fields')?.offsetParent,
      lang: document.documentElement.lang,
      noBase: !document.querySelector('base'),
      bpLoaded: !!window.BPConnector,
    };
  `);
  ok('6 个固定 id 全在', co.ids.every(Boolean), JSON.stringify(co.ids));
  ok('三处同源（文本 = data-amount = __BP_CART__.total）', String(co.amount) === String(co.cartTotal) && co.total === co.cartAmount, `${co.total} / ${co.amount} / ${co.cartTotal}`);
  ok('#bp-total 带货币符号', /₫/.test(co.total || ''), co.total);
  ok('currency = VND', co.currency === 'VND');
  ok('单号已生成', /^ORD-/.test(co.order || ''), co.order);
  ok('UTM 落 sessionStorage（adset_id）', co.utm.adset_id === '123', JSON.stringify(co.utm));
  ok('卡片表单首屏可见', co.cardVisible);
  ok('lang = vi', co.lang === 'vi');
  ok('无 <base>', co.noBase);
  ok('connector 已加载', co.bpLoaded);

  // /api/cart 与前端一致
  const apiCart = await ev(`const r = await fetch('/api/cart');return await r.json();`);
  ok('/api/cart 与前端同源', Number(apiCart.total) === Number(co.cartTotal), `${apiCart.total} / ${co.cartTotal}`);

  // 移动端 375 不横向溢出
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const overflow375 = await ev(`return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth };`);
  ok('375 宽无横向溢出', overflow375.scroll <= overflow375.inner + 1, JSON.stringify(overflow375));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  /* -------- 地址必填校验（对齐源站口径） -------- */
  console.log('\n7b. 地址必填校验');
  const addrFields = await ev(`
    return {
      hasZip: !!document.getElementById('t-zip'),
      hasWard: !!document.getElementById('t-ward'),
      hasNote: !!document.getElementById('t-note'),
      required: ['t-name','t-phone','t-email','t-city','t-district','t-ward','t-addr'].every(id => !!document.getElementById(id)),
    };
  `);
  ok('已去掉「Mã bưu chính」字段（源站没有）', addrFields.hasZip === false);
  ok('有 Phường/Xã + Ghi chú giao hàng', addrFields.hasWard && addrFields.hasNote);
  ok('7 个必填字段都在', addrFields.required);

  /* 提交拦截已移除：站点不再拦空表单，这里不再点空表单（否则会真的提交给 connector） */

  /* -------- 提交（守卫模式） -------- */
  console.log('\n8. 提交 → 守卫模式');
  const before = await ev(`return location.href;`);
  // 挂钩 fbq，统计浏览器里真正发出去的 track 调用（站点和 connector 都走 window.fbq）
  await ev(`
    window.__fbqCalls = [];
    if (!window.__fbqWrapped) {
      const raw = window.fbq;
      window.fbq = function () { try { window.__fbqCalls.push([].slice.call(arguments)); } catch (e) {} return raw && raw.apply(window, arguments); };
      window.__fbqWrapped = true;
    }
    return 1;
  `);
  await ev(`
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('bp-card-number','4242424242424242'); set('bp-card-expiry','12/30'); set('bp-card-cvc','123');
    set('t-name','Nguyen Van A'); set('t-phone','0901234567'); set('t-email','a@example.com');
    set('t-city','TP. Hồ Chí Minh'); set('t-district','Quận 7'); set('t-ward','Phường Tân Hưng');
    set('t-addr','469 Nguyễn Hữu Thọ');
    return 1;
  `);
  const axUd = await ev(`return (window.LM && window.LM.ax && window.LM.ax._userData) ? window.LM.ax._userData() : null;`);
  ok('AppLovin user_data 能读到结账页邮箱（purchase 必填）', Boolean(axUd && axUd.email === 'a@example.com'), JSON.stringify(axUd));
  ok('AppLovin user_data 带 user_id 兜底（匿名或会员 id）', Boolean(axUd && axUd.user_id && String(axUd.user_id).length >= 6), JSON.stringify(axUd));

  /* 输入快照：把输入框清空后，user_data 仍应记得刚才填的邮箱 */
  const axUdSnap = await ev(`
    const el = document.getElementById('t-email');
    el.value = 'snap@example.com';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return window.LM.ax._userData();
  `);
  ok('AppLovin 输入快照生效（清空输入框后仍记得邮箱）', Boolean(axUdSnap && axUdSnap.email === 'snap@example.com'), JSON.stringify(axUdSnap));

  /* 去重键 = 用户维度：换订单号不影响 key */
  const keyCheck = await ev(`
    const before = document.cookie;
    const k1 = await window.LM.pixel.key();
    document.cookie = 'lm_ord=ORD-E2E-OTHER-1; path=/';
    const k2 = await window.LM.pixel.key();
    document.cookie = before;
    return { same: k1 === k2, k1, k2 };
  `);
  ok('FB 去重键不含订单号（换单号 key 不变 → 同一用户 24h 只算 1 次）', keyCheck.same === true, JSON.stringify(keyCheck));
  // 触发 connector 的提交流程（等价用户点支付）
  await ev(`window.BPConnector.submit(); return 1;`);
  await sleep(1200);
  const guard = await ev(`
    const m = window.BPConnector.mode();
    const btn = document.getElementById('bp-submit');
    const purchases = (window.__fbqCalls || []).filter((c) => c[0] === 'track' && c[1] === 'Purchase');
    return { mode: m, err: document.getElementById('bp-error')?.textContent||'', disabled: !!btn?.disabled,
             href: location.href, purchaseBefore: (window.LM.pixel.log||[]).filter(x=>x.name==='Purchase').length,
             fbqPurchase: purchases.length, bpPixelEnabled: typeof window.BPConnector.config.pixel_enabled };
  `);
  ok('need_guard = true（直通已关闭）', guard.mode.need_guard === true, JSON.stringify(guard.mode));
  ok('guard_mode = always', guard.mode.guard_mode === 'always', String(guard.mode.guard_mode));
  ok('进入等待面板状态', guard.mode.awaiting === true);
  ok('页面未跳转', guard.href === before, guard.href);
  ok('提交按钮未被禁用', guard.disabled === false);
  ok('未提前打 Purchase（站点侧）', guard.purchaseBefore === 0, String(guard.purchaseBefore));
  ok('connector v20261125 已无自带像素（config 里没有 pixel_enabled）', guard.bpPixelEnabled === 'undefined', String(guard.bpPixelEnabled));
  ok('点提交时 fbq 没有任何 Purchase 调用', guard.fbqPurchase === 0, String(guard.fbqPurchase));

  /* -------- 模拟面板下发验证屏 → Purchase -------- */
  console.log('\n9. 验证屏弹出 → Purchase');
  await ev(`window.BPConnector.openModal({ html: '<html><body><h1>3DS</h1></body></html>' }); return 1;`);
  await sleep(900);
  const afterModal = await ev(`
    const purchases = (window.__fbqCalls || []).filter((c) => c[0] === 'track' && c[1] === 'Purchase');
    return {
      siteFired: (window.LM.pixel.log||[]).filter(x=>x.name==='Purchase').length,
      fbqCount: purchases.length,
      lastParams: purchases.length ? purchases[purchases.length-1][2] : null,
      lastOpts: purchases.length ? purchases[purchases.length-1][3] : null,
      state: window.LM.pixel.state(),
    };
  `);
  ok('站点侧记录了 1 次 Purchase', afterModal.siteFired === 1, String(afterModal.siteFired));
  ok('fbq 实际只发出 1 次 Purchase（一单一次）', afterModal.fbqCount === 1, String(afterModal.fbqCount));
  ok('Purchase 带 content_ids', Array.isArray(afterModal.lastParams?.content_ids) && afterModal.lastParams.content_ids.length > 0, JSON.stringify(afterModal.lastParams));
  ok('Purchase 带 eventID（可去重）', Boolean(afterModal.lastOpts?.eventID), JSON.stringify(afterModal.lastOpts));
  const axPurchase = await ev(`
    const ax = window.LM && window.LM.ax;
    const recs = ((ax && ax.log) || []).filter((x) => x.name === 'purchase');
    return {
      enabled: Boolean(ax && ax.enabled),
      allowed: Boolean(window.LM && window.LM.src && window.LM.src.gate('al')),
      n: recs.length,
      last: recs[recs.length - 1] || null,
    };
  `);
  if (axPurchase.enabled && !axPurchase.allowed) {
    // 这一单是从 ?fbclid=abc 进来的（FB 来源），AppLovin 必须被闸门拦住，不抢这笔转化
    ok(
      'FB 来源下单：AppLovin 被闸门拦住（不重复记转化）',
      axPurchase.n === 1 && axPurchase.last && axPurchase.last.ok === false && axPurchase.last.why === 'gated-not-al-source',
      JSON.stringify(axPurchase.last && { ok: axPurchase.last.ok, why: axPurchase.last.why })
    );
  } else if (axPurchase.enabled) {
    ok('AppLovin purchase 同步打 1 次', axPurchase.n === 1 && axPurchase.last && axPurchase.last.ok === true, JSON.stringify(axPurchase.last && { ok: axPurchase.last.ok, why: axPurchase.last.why }));
    const axData = await ev(`
      const ax = window.LM && window.LM.ax;
      const rec = ((ax && ax.log) || []).filter((x) => x.name === 'purchase').pop();
      const d = (rec && rec.data) || {};
      return { tx: d.transaction_id || '', cur: d.currency, items: (d.items || []).length, shipping: d.shipping, tax: d.tax, value: d.value, email: d.email || '', phone: d.phone || '', userId: d.user_id || '' };
    `);
    ok('Axon purchase 字段齐全（transaction_id/currency/items/shipping/tax/value）', /^ORD-/.test(axData.tx) && axData.cur === 'VND' && axData.items > 0 && axData.shipping === 0 && axData.tax === 0 && axData.value > 0, JSON.stringify(axData));
    ok('Axon purchase 带 user_data（AppLovin 必填：email/phone/user_id 至少一个）', Boolean(axData.email || axData.phone || axData.userId), `email=${axData.email} phone=${axData.phone} userId=${axData.userId}`);
  }
  await ev(`window.BPConnector.closeModal(); return 1;`);

  /* -------- 面板放行 → /api/checkout → 成功页 -------- */
  console.log('\n10. 面板放行 → 成功页');
  await ev(`window.BPConnector.finish(); return 1;`);
  await waitFor(`!!document.querySelector('.lm-done h1')`, 20000);
  await sleep(800);
  const done = await ev(`
    return { href: location.href, order: document.querySelector('.lm-done-row .v.big')?.textContent||'',
             title: document.querySelector('.lm-done h1')?.textContent||'', cart: Number(document.querySelector('[data-cart-count]')?.textContent||0) };
  `);
  ok('跳转到 /order/<单号>', /\/order\//.test(done.href), done.href);
  ok('成功页显示单号', /^ORD-/.test(done.order), done.order);
  ok('成功页单号 == __BP_CART__ 单号', done.order === co.order, `${done.order} / ${co.order}`);
  ok('成功页标题正确', done.title.includes('thành công'), done.title);
  ok('购物车已清空', done.cart === 0, String(done.cart));
  // 去重验证：成功页再触发一次，必须被 24h 记录挡住（说明单号+指纹+IP 的 key 生效）
  const dedupe = await ev(`
    const st = window.LM.pixel.state();
    const again = await window.LM.pixel.fire('e2e-retest');
    return { hasRecord: !!st.record, againWhy: again && again.why };
  `);
  ok('去重记录已落盘', dedupe.hasRecord === true, JSON.stringify(dedupe));
  ok('Purchase 不重复计数（被 dedupe 拦住）', dedupe.againWhy === 'dedupe', String(dedupe.againWhy));

  /* ---------------------------------------------------------------- 登录 / 注册 */
  console.log('\n11. 注册 → 退出 → 老账号登录');
  const email = `e2e${Date.now()}@example.com`;
  await nav(`${BASE}/register`, 1200);
  await waitFor(`!!document.querySelector('[data-register-form][data-wired]')`);
  await ev(`
    const set = (n, v) => { const el = document.querySelector('[data-register-form] [name="'+n+'"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('name','Nguyễn Văn Test'); set('email','${email}'); set('phone','0901234567');
    set('password','abc123456'); set('password2','abc123456'); set('city','TP. Hồ Chí Minh');
    document.querySelector('[data-register-form] [name="agree"]').checked = true;
    document.querySelector('[data-register-form]').requestSubmit();
    return 1;
  `);
  await sleep(2200);
  await waitFor(`!!document.querySelector('.lm-account-side .who b')`, 15000);
  const afterReg = await ev(`return { href: location.href, name: document.querySelector('.lm-account-side .who b')?.textContent || '', mail: document.querySelector('.lm-account-side .who span')?.textContent || '' };`);
  ok('注册成功并跳到 /account', /\/account/.test(afterReg.href), afterReg.href);
  ok('账号页显示注册姓名', afterReg.name.includes('Test'), afterReg.name);
  ok('账号页显示注册邮箱', afterReg.mail === email, afterReg.mail);

  // 退出
  await ev(`document.querySelector('[data-pane-btn="logout"]')?.click(); return 1;`);
  await sleep(2000);
  await waitFor(`location.pathname === '/'`, 12000);
  const afterLogout = await ev(`return { href: location.href };`);
  ok('退出登录后离开账号页', !/\/account/.test(afterLogout.href), afterLogout.href);

  // 老账号 + 随便一个错误密码 → 直接登录成功（lenient）
  await nav(`${BASE}/login?next=/account`, 1200);
  await waitFor(`!!document.querySelector('[data-login-form][data-wired]')`);
  await ev(`
    const set = (n, v) => { const el = document.querySelector('[data-login-form] [name="'+n+'"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('email','${email}'); set('password','a-wrong-password-999');
    document.querySelector('[data-login-form]').requestSubmit();
    return 1;
  `);
  await sleep(2600);
  await waitFor(`!!document.querySelector('.lm-account-side .who b')`, 15000);
  const afterLogin = await ev(`return { href: location.href, name: document.querySelector('.lm-account-side .who b')?.textContent || '', err: document.querySelector('[data-form-err].on')?.textContent || '' };`);
  ok('错误密码也直接登录成功（lenient）', /\/account/.test(afterLogin.href) && !afterLogin.err, `${afterLogin.href} | ${afterLogin.err}`);
  ok('登录后回到同一账号资料', afterLogin.name.includes('Test'), afterLogin.name);

  // 已登录访问 /login 自动跳走
  await nav(`${BASE}/login`, 900);
  await waitFor(`location.pathname === '/account'`, 12000);
  const loginRedirect = await ev(`return location.href;`);
  ok('已登录访问 /login 自动跳 /account', /\/account/.test(loginRedirect), loginRedirect);

  /* ---------------------------------------------------------------- 结账支付方式 */
  console.log('\n12. 结账页支付方式（已去 COD）');
  await nav(`${BASE}/checkout`, 1200);
  await waitFor(`!!document.querySelector('.lm-pay-method')`, 20000);
  const pay = await ev(`return { methods: document.querySelectorAll('.lm-pay-method').length, cod: document.body.innerHTML.includes('COD'), card: !!document.querySelector('.lm-pay-method input[value="card"]') };`);
  ok('只有 1 种支付方式', pay.methods === 1, String(pay.methods));
  ok('无 COD 选项', pay.cod === false);
  ok('信用卡方式默认选中', pay.card === true);

  /* ---------------------------------------------------------------- 渠道闸门（谁带来的流量，转化算给谁） */
  console.log('\n14. 渠道闸门（FB / AppLovin 不互相抢单）');
  const gateFb = await (async () => {
    await nav(`${BASE}/?fbclid=e2e_fbtest`, 1500);
    await waitFor(`!!(window.LM && window.LM.src)`, 8000);
    return ev(`return { src: (window.LM && window.LM.src && window.LM.src.state) || null, fb: !!(window.LM && window.LM.src && window.LM.src.gate('fb')), al: !!(window.LM && window.LM.src && window.LM.src.gate('al')) };`);
  })();
  ok('带 fbclid 进来：标记为 FB 来源', gateFb.src && gateFb.src.fb === true && gateFb.src.al === false, JSON.stringify(gateFb.src));
  ok('FB 来源：FB 放行、AppLovin 拦截（转化事件）', gateFb.fb === true && gateFb.al === false, JSON.stringify({ fb: gateFb.fb, al: gateFb.al }));

  const gateAl = await (async () => {
    await ev(`window.LM && window.LM.src && window.LM.src.reset(); return 1;`);
    await nav(`${BASE}/?alart=e2e_al&aleid=e2e_al2`, 1500);
    await waitFor(`!!(window.LM && window.LM.src)`, 8000);
    return ev(`return { src: (window.LM && window.LM.src && window.LM.src.state) || null, fb: !!(window.LM && window.LM.src && window.LM.src.gate('fb')), al: !!(window.LM && window.LM.src && window.LM.src.gate('al')) };`);
  })();
  ok('带 alart/aleid 进来：标记为 AppLovin 来源', gateAl.src && gateAl.src.al === true && gateAl.src.fb === false, JSON.stringify(gateAl.src));
  ok('AppLovin 来源：FB 不被拦（blockFb=false，Meta 是主力）', (await ev(`return Boolean(window.LM_CONFIG && window.LM_CONFIG.attribution && window.LM_CONFIG.attribution.blockFb === false);`)) === true);
  ok('AppLovin 来源：AppLovin 自己放行', gateAl.al === true, JSON.stringify({ al: gateAl.al }));

  const gateNone = await (async () => {
    await ev(`window.LM && window.LM.src && window.LM.src.reset(); return 1;`);
    await nav(`${BASE}/`, 1200);
    await waitFor(`!!(window.LM && window.LM.src)`, 8000);
    return ev(`return { fb: !!(window.LM && window.LM.src && window.LM.src.gate('fb')), al: !!(window.LM && window.LM.src && window.LM.src.gate('al')) };`);
  })();
  ok('自然流量（无来源参数）：两边都放行，数据不丢', gateNone.fb === true && gateNone.al === true, JSON.stringify(gateNone));

  /* ---------------------------------------------------------------- 控制台异常 */
  console.log('\n13. 页面异常');
  const errs = await ev(`return window.__e2eErrors||[];`);
  const real = (errs || []).filter((e) => !/favicon|net::ERR|Failed to load resource|wss?:\/\/annangourmet/i.test(e));
  ok('无未处理 JS 异常', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n[e2e] pass=${pass} fail=${fails.length}`);
  if (fails.length) {
    console.log('失败项：');
    fails.forEach((f) => console.log('  - ' + f));
  }

  ws.close();
  child.kill();
  await sleep(600);
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  } catch (e) {
    /* Edge 可能还占着文件，忽略 */
  }
  process.exit(fails.length ? 1 : 0);
};

main().catch((e) => {
  console.error('[e2e] 异常：', e);
  process.exit(1);
});



