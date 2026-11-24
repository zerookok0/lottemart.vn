#!/usr/bin/env node
/**
 * 生成预览截图（Edge headless + CDP）
 *
 *   npm run dev      # 另一个终端
 *   npm run shots    # → preview/*.png
 *
 * 用真实数据渲染，逐页截全屏（长图）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:5411').replace(/\/$/, '');
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'preview');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) {
  console.error('[shots] 找不到 Edge/Chrome');
  process.exit(1);
}

const PORT = 9800 + Math.floor(Math.random() * 150);
const PROFILE = path.join(ROOT, '.shots-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOTS = [
  { name: 'home', url: '/', w: 1440, h: 1400, ready: '.lm-card', closePromo: true },
  { name: 'home-popup', url: '/', w: 1440, h: 1400, ready: '.lm-card', clearPromo: true, after: 1400 },
  { name: 'category', url: '/vi-nsg/category/rau-cu-c3', w: 1440, h: 1400, ready: '.lm-card' },
  { name: 'product', url: null, w: 1440, h: 1400, ready: '.lm-pd-title' },
  { name: 'product-reviews', url: null, w: 1440, h: 1400, ready: '.lm-pd-title', tab: 'review' },
  { name: 'search', url: '/search?q=sua', w: 1440, h: 1400, ready: '.lm-card' },
  { name: 'cart', url: '/cart', w: 1440, h: 1000, ready: '.lm-cart-row', seedCart: true },
  {
    name: 'checkout',
    url: '/checkout?utm_source=fb&adset_id=123',
    w: 1440,
    h: 1200,
    ready: '.lm-pay-method',
    readyJs: "document.getElementById('bp-total')?.dataset.amount !== '0'",
    seedCart: true,
  },
  { name: 'login', url: '/login', w: 1440, h: 1000, ready: '.lm-auth-box' },
  { name: 'register', url: '/register', w: 1440, h: 1100, ready: '.lm-auth-box' },
  { name: 'account', url: '/account', w: 1440, h: 1000, ready: '.lm-account-body' },
  { name: 'policy', url: '/vi-nsg/privacy', w: 1440, h: 1200, ready: '.lm-prose h2' },
  { name: 'mobile-home', url: '/', w: 390, h: 844, ready: '.lm-card', closePromo: true },
  { name: 'mobile-popup', url: '/', w: 390, h: 844, ready: '.lm-card', clearPromo: true, after: 1400 },
  { name: 'mobile-product', url: null, w: 390, h: 844, ready: '.lm-pd-title' },
  { name: 'mobile-category', url: '/vi-nsg/category/rau-cu-c3', w: 390, h: 844, ready: '.lm-card' },
  {
    name: 'mobile-checkout',
    url: '/checkout',
    w: 390,
    h: 844,
    ready: '.lm-pay-method',
    readyJs: "document.getElementById('bp-total')?.dataset.amount !== '0'",
    seedCart: true,
  },
];

const main = async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const child = spawn(
    EDGE,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'],
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

  const ws = new WebSocket(await getWS());
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

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    return r.result && r.result.value;
  };

  const setViewport = (w, h) =>
    send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });

  const shot = async (file, full = true) => {
    // 截图前强制回顶部，避免截到滚动后的视口
    await ev(`window.scrollTo(0, 0); return 1;`);
    await sleep(250);
    let clip;
    if (full) {
      const m = await send('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      clip = { x: 0, y: 0, width: cs.width, height: Math.min(Math.ceil(cs.height), 16000), scale: 1 };
    }
    const res = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log(`  ✓ ${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  };

  // 先拿一个真实商品（直接读 data，避免等首页渲染）
  const catRes = await fetch(`${BASE}/data/cat/3.json`);
  const cat = await catRes.json();
  const p0 = (cat.items || [])[0];
  const productHref = p0 ? p0.u : '/';
  console.log('[shots] 商品链接', productHref, '| 类目商品数', (cat.items || []).length);

  // 预置购物车（2 个商品，各 1 件）：每个 document 加载前注入，保证 cart / checkout 有内容
  const SEED_CART = p0
    ? JSON.stringify(cat.items.slice(0, 2).map((x) => ({ id: x.id, name: x.n, url: x.u, img: x.im, price: x.p, list: x.l, qty: 1 })))
    : '[]';
  if (p0) {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{if(!localStorage.getItem('lm_cart'))localStorage.setItem('lm_cart', ${JSON.stringify(SEED_CART)});}catch(e){}`,
    });
  }

  for (const s of SHOTS) {
    const target = s.url === null ? `${BASE}${productHref}` : `${BASE}${s.url}`;
    await setViewport(s.w, s.h);

    // 需要在页面上先写 storage 的场景（促销弹窗重开 / 购物车预置）
    if (s.clearPromo) {
      try {
        await ev(`localStorage.removeItem('lm_promo_at'); sessionStorage.removeItem('lm_promo_deadline'); return 1;`);
      } catch (e) {}
    }
    if (s.seedCart) {
      try {
        await ev(`localStorage.setItem('lm_cart', ${JSON.stringify(SEED_CART)}); return 1;`);
      } catch (e) {}
    }

    await send('Page.navigate', { url: target });

    // 等页面真正渲染出内容（避免截到骨架）
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      const ready = await ev(
        s.readyJs ? `return Boolean(${s.readyJs});` : `return !!document.querySelector('${s.ready || '.lm-card'}');`
      );
      if (ready) break;
    }
    // 购物车类页面：万一 localStorage 没被播上，重试一次（截图必须有内容）
    if (s.seedCart) {
      for (let i = 0; i < 3; i++) {
        const amount = await ev(`return Number(document.getElementById('bp-total')?.dataset.amount || 0);`);
        const rows = await ev(`return document.querySelectorAll('.lm-cart-row').length;`);
        if (amount > 0 || rows > 0) break;
        await ev(`localStorage.setItem('lm_cart', ${JSON.stringify(SEED_CART)}); return 1;`);
        await send('Page.reload');
        await sleep(2500);
      }
    }
    // 逐屏滚动一遍，触发懒加载图片，再回顶部
    await ev(`
      const step = Math.round(window.innerHeight * 0.6);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 420));
      }
      window.scrollTo(0, 0);
      return 1;
    `);
    // 等所有图片完成加载（最多 8s）
    for (let i = 0; i < 16; i++) {
      const pending = await ev(`return [...document.images].filter((im) => !im.complete || im.naturalWidth === 0).length;`);
      if (pending === 0) break;
      await sleep(500);
    }
    await sleep(600);

    if (s.closePromo) {
      await ev(`document.querySelector('[data-promo-modal] [data-modal-close]')?.click(); return 1;`);
      await sleep(400);
    }
    if (s.tab) {
      await ev(`document.querySelector('[data-tab="${s.tab}"]')?.click(); return 1;`);
      await sleep(500);
    }
    if (s.scrollTo) {
      await ev(`document.querySelector('${s.scrollTo}')?.scrollIntoView({block:'center'}); return 1;`);
      await sleep(800);
      await ev(`window.scrollTo(0,0); return 1;`);
      await sleep(300);
    }
    await shot(path.join(OUT, `${s.name}.png`));
  }

  ws.close();
  child.kill();
  await sleep(600);
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  } catch (e) {}
  console.log('[shots] 完成 → preview/');
  process.exit(0);
};

main().catch((e) => {
  console.error('[shots] 异常：', e);
  process.exit(1);
});

