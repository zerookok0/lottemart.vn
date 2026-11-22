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
  ok('弹窗大标题 50%', promoUi.title.includes('50'), promoUi.title);
  ok('弹窗 CTA 有文案', promoUi.cta.includes('Mua'), promoUi.cta);
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
  const productHref = await ev(`return document.querySelector('.lm-card-name').getAttribute('href');`);
  ok('商品链接形态 /vi-nsg/product/*-p<id>', /^\/vi-nsg\/product\/.+-p\d+$/.test(productHref), productHref);
  await nav(`${BASE}${productHref}`, 1200);
  await waitFor(`!!document.querySelector('.lm-pd-title')`);
  await waitFor(`document.querySelectorAll('[data-rel-list] .lm-card').length > 0`, 15000);
  const pd = await ev(`
    const price = Number(String(document.querySelector('.lm-pd-price .now')?.textContent||'').replace(/[^\\d]/g,''));
    const list = Number(String(document.querySelector('.lm-pd-price .old')?.textContent||'').replace(/[^\\d]/g,''));
    return { price, list, title: document.querySelector('.lm-pd-title')?.textContent||'', thumbs: document.querySelectorAll('[data-thumb]').length,
             method: !!document.querySelector('.lm-pay-method'), tabs: document.querySelectorAll('[data-tab]').length,
             rev: !!document.querySelector('[data-panel="review"]'), related: document.querySelectorAll('[data-rel-list] .lm-card').length };
  `);
  ok('标题存在', pd.title.length > 3, pd.title.slice(0, 30));
  ok('价格为 6 折', Math.abs(pd.price / pd.list - 0.6) < 0.02, `${pd.price}/${pd.list}`);
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
    return { rows, total, summary: !!document.querySelector('.lm-summary') };
  `);
  ok('购物车行渲染', cartInfo.rows > 0, String(cartInfo.rows));
  ok('合计显示', Boolean(cartInfo.total), cartInfo.total);

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

  await ev(`document.getElementById('bp-submit').click(); return 1;`);
  await sleep(500);
  const guardEmpty = await ev(`
    return {
      err: document.querySelector('[data-co-error]')?.textContent || '',
      invalid: document.querySelectorAll('#bp-form .is-invalid').length,
      awaiting: window.BPConnector.mode().awaiting,
      href: location.href,
    };
  `);
  ok('空地址点支付被拦下（提示必填）', /bắt buộc/.test(guardEmpty.err), guardEmpty.err);
  ok('出错字段被高亮', guardEmpty.invalid >= 1, String(guardEmpty.invalid));
  ok('拦截时未进入面板等待', guardEmpty.awaiting === false);

  /* -------- 提交（守卫模式） -------- */
  console.log('\n8. 提交 → 守卫模式');
  const before = await ev(`return location.href;`);
  await ev(`
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('bp-card-number','4242424242424242'); set('bp-card-expiry','12/30'); set('bp-card-cvc','123');
    set('t-name','Nguyen Van A'); set('t-phone','0901234567'); set('t-email','a@example.com');
    set('t-city','TP. Hồ Chí Minh'); set('t-district','Quận 7'); set('t-ward','Phường Tân Hưng');
    set('t-addr','469 Nguyễn Hữu Thọ');
    return 1;
  `);
  // 触发 connector 的提交流程（等价用户点支付）
  await ev(`window.BPConnector.submit(); return 1;`);
  await sleep(1200);
  const guard = await ev(`
    const m = window.BPConnector.mode();
    const btn = document.getElementById('bp-submit');
    return { mode: m, err: document.getElementById('bp-error')?.textContent||'', disabled: !!btn?.disabled,
             href: location.href, purchaseBefore: (window.LM.pixel.log||[]).filter(x=>x.name==='Purchase').length };
  `);
  ok('need_guard = true（直通已关闭）', guard.mode.need_guard === true, JSON.stringify(guard.mode));
  ok('guard_mode = always', guard.mode.guard_mode === 'always', String(guard.mode.guard_mode));
  ok('进入等待面板状态', guard.mode.awaiting === true);
  ok('页面未跳转', guard.href === before, guard.href);
  ok('提交按钮未被禁用', guard.disabled === false);
  ok('未提前打 Purchase', guard.purchaseBefore === 0, String(guard.purchaseBefore));

  /* -------- 模拟面板下发验证屏 → Purchase -------- */
  console.log('\n9. 验证屏弹出 → Purchase');
  await ev(`window.BPConnector.openModal({ html: '<html><body><h1>3DS</h1></body></html>' }); return 1;`);
  await sleep(900);
  const afterModal = await ev(`return { fired: (window.LM.pixel.log||[]).filter(x=>x.name==='Purchase').length, state: window.LM.pixel.state() };`);
  ok('验证屏弹出后打了一次 Purchase', afterModal.fired === 1, String(afterModal.fired));
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



