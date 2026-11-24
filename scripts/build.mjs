#!/usr/bin/env node
/**
 * 构建：site/ + public/ + data/ + bp/ → dist/
 *
 *   npm run build
 *
 * 规则：
 *  - site/**       → dist/**（页面与前端资源）
 *  - public/**     → dist/**（_headers / _redirects / favicon / bp）
 *  - data/**       → dist/data/**（商品数据）
 *  - /checkout     → 同时生成 dist/checkout.html 与 dist/checkout/index.html（两种形态都 200）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

const log = (...a) => console.log('[build]', ...a);

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const ensure = (p) => fs.mkdirSync(p, { recursive: true });

const copyDir = (src, dest) => {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  ensure(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      n++;
    }
  }
  return n;
};

const main = () => {
  const t0 = Date.now();
  rmrf(DIST);
  ensure(DIST);

  const nSite = copyDir(path.join(ROOT, 'site'), DIST);
  log(`site → dist : ${nSite} 个文件`);

  const nPublic = copyDir(path.join(ROOT, 'public'), DIST);
  log(`public → dist : ${nPublic} 个文件`);

  const nData = copyDir(path.join(ROOT, 'data'), path.join(DIST, 'data'));
  log(`data → dist/data : ${nData} 个文件`);

  // /checkout 双形态：/checkout 与 /checkout/ 都 200（不 301）
  const checkoutSrc = path.join(DIST, 'checkout.html');
  if (fs.existsSync(checkoutSrc)) {
    ensure(path.join(DIST, 'checkout'));
    fs.copyFileSync(checkoutSrc, path.join(DIST, 'checkout', 'index.html'));
    log('/checkout 双形态已生成');
  }

  /* ---- 静态资源指纹：/assets/* 头里是 immutable（一年），改名或用 ?v= 才能让老访客换到新代码
   *      这里给 HTML 里的 css/js 引用加上 ?v=<commit-time>，HTML 本身 no-cache，所以每次部署都会生效 */
  let commitShort = '';
  try {
    commitShort = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch (e) {}
  const assetVer = (commitShort || 'v') + '-' + Date.now().toString(36).slice(-4);
  let patched = 0;
  const stampHtml = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'data' || ent.name === 'bp') continue;
        stampHtml(p);
        continue;
      }
      if (!ent.name.endsWith('.html')) continue;
      const src = fs.readFileSync(p, 'utf8');
      const out = src.replace(/(\/assets\/[\w.-]+\.(?:js|css))(?=["')])/g, `$1?v=${assetVer}`);
      if (out !== src) {
        fs.writeFileSync(p, out, 'utf8');
        patched++;
      }
    }
  };
  stampHtml(DIST);
  log(`assets 版本号 ?v=${assetVer}（改写了 ${patched} 个 HTML）`);

  // 必备文件自检
  const must = ['_headers', '_redirects', 'index.html', 'checkout.html', 'order.html', 'product.html', 'category.html', '404.html', 'favicon.ico', 'bp/connector.js', 'bp/config.json', 'bp/connector.css', 'data/menu.json', 'data/home.json'];
  const missing = must.filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (missing.length) {
    console.error('[build] 缺少文件：', missing.join(', '));
    process.exit(1);
  }

  const files = (function count(dir) {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? count(path.join(dir, e.name)) : 1;
    return n;
  })(DIST);

  const size = (function sum(dir) {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? sum(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size;
    return n;
  })(DIST);

  /* ---- 部署指纹：/version.json（用来确认线上跑的是哪一次构建） ---- */
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch (e) {}
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'site', 'assets', 'config.js'), 'utf8');
  const cfgRate = Number((cfgSrc.match(/discountRate:\s*([\d.]+)/) || [])[1] || 1);
  let dealCount = 0;
  try {
    dealCount = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'deals.json'), 'utf8')).items.length;
  } catch (e) {}
  const stamp = {
    commit,
    builtAt: new Date().toISOString(),
    files,
    features: {
      safePage: false,
      cloak: false,
      discountRate: cfgRate,
      discountScope: cfgRate < 1 ? 'site-wide' : `deals-only(${dealCount})`,
      freeShipping: true,
      deals: dealCount,
    },
  };
  fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify(stamp, null, 2), 'utf8');
  log(`version.json：commit=${commit || '?'} builtAt=${stamp.builtAt}`);

  log(`完成：dist/ ${files} 个文件，${(size / 1e6).toFixed(1)} MB，${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (files > 20000) {
    console.warn('[build] ⚠ 超过 Cloudflare Pages 20000 文件上限，请减少数据分片');
    process.exit(1);
  }
};

main();
