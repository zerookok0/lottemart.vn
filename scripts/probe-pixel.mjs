#!/usr/bin/env node
/**
 * 像素探针：用无头浏览器打开一个 URL，打印 FB Pixel 与 AppLovin(Axon) 的真实运行状态
 *
 *   node scripts/probe-pixel.mjs                      # 默认 https://lottemartvn.pages.dev/
 *   node scripts/probe-pixel.mjs https://xxx.pages.dev/checkout
 *
 * 输出：
 *   · AppLovin：script[data-axpixel] 数量、window.axon 类型、LM.ax.state()、s.axon.ai 请求、window.axon.operationQueue 长度
 *   · Facebook：window.fbq 是否存在、LM.pixel.log 里的事件名
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const URL_TARGET = process.argv[2] || 'https://lottemartvn.pages.dev/';
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 9900 + Math.floor(Math.random() * 80);
const PROFILE = path.join(ROOT, '.probe-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) {
  console.error('[probe] 找不到 Edge/Chrome');
  process.exit(1);
}

const main = async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(
    EDGE,
    ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'],
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
  await send('Network.enable');

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result && r.result.value;
  };

  const reqs = [];
  const posts = [];
  const failed = [];
  const reqUrlById = {};
  const consoleMsgs = [];
  const wsFrames = [];
  const wsUrls = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.webSocketCreated' && m.params) wsUrls.push(m.params.url || '');
    if (m.method === 'Network.webSocketFrameSent' && m.params) {
      wsFrames.push('SENT ' + String((m.params.response && m.params.response.payloadData) || '').slice(0, 1400));
    }
    if (m.method === 'Network.webSocketFrameReceived' && m.params) {
      wsFrames.push('RECV ' + String((m.params.response && m.params.response.payloadData) || '').slice(0, 160));
    }
    if (m.method === 'Network.requestWillBeSent' && m.params && m.params.request) {
      reqs.push(m.params.request.url);
      posts.push(`${m.params.request.method} ${m.params.request.url}`);
      reqUrlById[m.params.requestId] = m.params.request.url;
    }
    if (m.method === 'Network.loadingFailed' && m.params) {
      failed.push(`${m.params.errorText || 'failed'} → ${reqUrlById[m.params.requestId] || '?'}`);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params) {
      consoleMsgs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 160));
    }
  });

  console.log('[probe] 打开', URL_TARGET);
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(Number(process.env.PROBE_WAIT || 12000));

  /* PROBE_RELOAD=1：先重载一次（让第一方 cookie 已存在），再观察事件是否上报 */
  if (process.env.PROBE_RELOAD === '1') {
    await send('Page.reload', { ignoreCache: false });
    await sleep(Number(process.env.PROBE_WAIT || 12000));
  }

  /* 可选：--eval='<js>' 在页面上跑一段调试代码，结果打在最后 */
  const evalIdx = process.argv.indexOf('--eval');
  const evalCode = evalIdx > 0 ? process.argv[evalIdx + 1] : '';
  if (evalCode) {
    const r = await ev(evalCode);
    console.log('\n=== eval ===');
    console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
  }

  /* PROBE_FORCE=1：手动再打一次 page_view，观察是否真发到 b.applovin.com/v1/pixel */
  if (process.env.PROBE_FORCE === '1') {
    const r = await ev(`
      const out = {};
      try { window.axon('init', '736af0a3-f6a1-4e98-80f3-1e70ab180f37'); out.init = 'ok'; } catch (e) { out.init = String(e.message); }
      try { window.axon('track', 'page_view'); out.track = 'ok'; } catch (e) { out.track = String(e.message); }
      out.q = window.axon && Array.isArray(window.axon.operationQueue) ? window.axon.operationQueue.length : null;
      out.perf = typeof (window.axon && window.axon.performOperation);
      return out;
    `);
    console.log('\n=== forced track ===');
    console.log(JSON.stringify(r));
    await sleep(3000);
    /* 有些像素在页面隐藏/卸载时才 flush 事件，这里触发一次 pagehide */
    try {
      await send('Runtime.evaluate', { expression: `window.dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); 1` });
      await sleep(2000);
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(2500);
    } catch (e) {}
  }

  const state = await ev(`
    const ax = window.LM && window.LM.ax;
    let queue = null;
    try { queue = window.axon && Array.isArray(window.axon.operationQueue) ? window.axon.operationQueue.length : null; } catch (e) {}
    return {
      title: document.title,
      axTags: document.querySelectorAll('script[data-axpixel]').length,
      axonType: typeof window.axon,
      axQueue: queue,
      axState: ax && ax.state ? ax.state() : null,
      axLog: ((ax && ax.log) || []).slice(-6).map((x) => ({ n: x.name, ok: x.ok, why: x.why || '' })),
      fbq: typeof window.fbq,
      fbLog: ((window.LM && window.LM.pixel && window.LM.pixel.log) || []).map((x) => x.name),
      bridge: ((window.LM && window.LM.pixel && window.LM.pixel.bridge) || []).map((x) => x.name),
      bridgeDetail: ((window.LM && window.LM.pixel && window.LM.pixel.bridge) || []).map((x) => ({
        n: x.name,
        keys: Object.keys(x.params || {}),
        contents: Array.isArray(x.params && x.params.contents) ? x.params.contents.length : null,
        first: (x.params && x.params.contents && x.params.contents[0]) || null,
      })),
      cookie: document.cookie.split('; ').filter((c) => /axwrt/.test(c)),
      /* 自检：把一条 AddToCart 手动喂给映射函数，看能不能产出 add_to_cart 记录 */
      mirror: (() => {
        const ax = window.LM && window.LM.ax;
        if (!ax || !ax._mirror) return 'no _mirror hook';
        const before = (ax.log || []).length;
        try {
          ax._mirror({ name: 'AddToCart', params: { contents: [{ id: 'probe-1', quantity: 1, item_price: 1000 }], value: 1000, content_name: 'probe' } });
        } catch (e) {
          return 'throw: ' + e.message;
        }
        const added = (ax.log || []).slice(before).map((x) => x.name + ':' + x.ok);
        return added.length ? added.join(',') : 'no record added';
      })(),
      /* 自检 2：把 bridge 里的事件事后重放一次，看 InitiateCheckout 能不能映射成 begin_checkout */
      replay: (() => {
        const ax = window.LM && window.LM.ax;
        const buf = (window.LM.pixel && window.LM.pixel.bridge) || [];
        if (!ax || !ax._mirror) return 'no hook';
        const before = (ax.log || []).length;
        buf.forEach((x) => {
          try {
            ax._mirror({ name: x.name, params: x.params });
          } catch (e) {}
        });
        return (ax.log || []).slice(before).map((x) => x.name + ':' + x.ok).join(',') || 'no record';
      })(),
    };
  `);

  const axios = reqs.filter((u) => /axon\.ai|applovin\.com|quantarelay/i.test(u));
  const axCalls = posts.filter((x) => /axon\.ai|applovin\.com|quantarelay/i.test(x));
  console.log('\n=== 页面 ===');
  console.log('title      :', state.title);
  console.log('axpixel 标签:', state.axTags, '| typeof axon:', state.axonType, '| 队列长度:', state.axQueue);
  console.log('\n=== AppLovin ===');
  console.log('enabled    :', state.axState && state.axState.enabled, '| keySet:', state.axState && state.axState.keySet);
  console.log('各事件计数  :', JSON.stringify(state.axState && state.axState.fired));
  console.log('最近记录    :', JSON.stringify(state.axLog));
  console.log('映射自检    :', state.mirror);
  console.log('bridge 重放 :', state.replay);
  console.log('axon.ai 请求:', axios.length ? axios.join('\n              ') : '（无）');
  console.log('失败请求    :', failed.length ? failed.slice(0, 8).join(' | ') : '（无）');
  console.log('POST 请求   :', posts.length ? posts.slice(0, 8).join('\n              ') : '（无）');
  console.log('AppLovin 调用:', axCalls.length ? axCalls.join('\n              ') : '（无）');
  console.log('控制台      :', consoleMsgs.length ? consoleMsgs.slice(-8).join(' || ') : '（无）');
  console.log('WebSocket   :', wsUrls.length ? wsUrls.join(' , ') : '（无）');
  console.log('WS 帧       :', wsFrames.length ? '\n              ' + wsFrames.slice(-10).join('\n              ') : '（无）');
  console.log('\n=== Facebook ===');
  console.log('typeof fbq :', state.fbq, '| 事件:', JSON.stringify(state.fbLog));
  console.log('bridge 缓冲 :', JSON.stringify(state.bridge));
  console.log('bridge 明细 :', JSON.stringify(state.bridgeDetail));
  console.log('\n=== Cookie ===');
  console.log(state.cookie.length ? state.cookie.join(' | ') : '（无 axwrt，首次访问或未设置）');

  ws.close();
  child.kill();
  await sleep(500);
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  } catch (e) {}
  process.exit(0);
};

main().catch((e) => {
  console.error('[probe] 异常：', e);
  process.exit(1);
});
