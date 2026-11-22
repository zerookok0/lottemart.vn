#!/usr/bin/env node
/**
 * 抓取 LOTTE Mart 越南站全量数据（断点续跑）
 *
 *   node scripts/fetch-catalog.mjs                 # 抓全部（已存在的跳过）
 *   node scripts/fetch-catalog.mjs --force         # 全部重抓
 *   node scripts/fetch-catalog.mjs --only=pages    # pages|cats|home|reviews
 *
 * 产物（raw/ 不入库）：
 *   raw/pages/page-<n>.json      商品分页（500/页）
 *   raw/cats/tree.json           类目树（level=3）
 *   raw/home/*.json              首页 zone / banner / popup / promotion
 *   raw/reviews/<productId>.json 有评论商品的真实评论
 */
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://www.lottemart.vn';
const API = `${ORIGIN}/v1/p/mart/es/vi_nsg`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const PAGE_SIZE = 500;
const CONCURRENCY = 5;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || 'all';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ensure = (dir) => fs.mkdirSync(dir, { recursive: true });

async function req(url, { method = 'GET', body } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          Origin: ORIGIN,
          Referer: `${ORIGIN}/`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      const wait = 800 * Math.pow(2, attempt);
      console.warn(`  ! ${e.message} → retry in ${wait}ms (${attempt + 1}/6)`);
      if (attempt === 5) throw e;
      await sleep(wait);
    }
  }
}

async function pool(items, worker, label) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const run = async () => {
    while (i < total) {
      const idx = i++;
      try {
        await worker(items[idx], idx);
      } catch (e) {
        console.warn(`  ! ${label} #${idx} failed: ${e.message}`);
      }
      done++;
      if (done % 50 === 0 || done === total) process.stdout.write(`\r  ${label}: ${done}/${total}   `);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, run));
  process.stdout.write('\n');
}

/* ---------------- 1. 商品分页 ---------------- */
async function fetchPages() {
  const dir = path.join(RAW, 'pages');
  ensure(dir);
  // 先探一页拿总数
  const probe = JSON.parse(await req(`${API}/products/search`, { method: 'POST', body: { page: 1, limit: 1 } }));
  const total = probe.data.total_items;
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`[pages] total_items=${total} → ${pages} 页 × ${PAGE_SIZE}`);

  const list = Array.from({ length: pages }, (_, k) => k + 1);
  await pool(
    list,
    async (n) => {
      const out = path.join(dir, `page-${String(n).padStart(3, '0')}.json`);
      if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 1024) return;
      const txt = await req(`${API}/products/search`, { method: 'POST', body: { page: n, limit: PAGE_SIZE } });
      fs.writeFileSync(out, txt);
    },
    'page'
  );
  return total;
}

/* ---------------- 2. 类目树 ---------------- */
async function fetchCats() {
  const dir = path.join(RAW, 'cats');
  ensure(dir);
  const out = path.join(dir, 'tree.json');
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 1024) return console.log('[cats] cached');
  const txt = await req(`${API}/categories/tree/filter?level=3`);
  fs.writeFileSync(out, txt);
  console.log(`[cats] ${(txt.length / 1024).toFixed(0)} KB`);
}

/* ---------------- 3. 首页 ---------------- */
async function fetchHome() {
  const dir = path.join(RAW, 'home');
  ensure(dir);
  const targets = {
    'banner.json': `${API}/homepage/banner-with-type?banner_type=main`,
    'popup.json': `${API}/homepage/v2/popup?type=web`,
    'promotion.json': `${API}/homepage/promotion`,
    'submenu.json': `${API}/categories/url-key/sub-menu`,
    'zones.json': `${API}/homepage?zone_config[today_check][page_size]=30&zone_config[recommend_zone][page_size]=30&zone_config[Home_Just_arrived][page_size]=30&zone_config[md_picks][page_size]=30&zone_config[Home_Weekly_Best][page_size]=30`,
  };
  for (const [name, url] of Object.entries(targets)) {
    const out = path.join(dir, name);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 512) {
      console.log(`[home] ${name} cached`);
      continue;
    }
    const txt = await req(url);
    fs.writeFileSync(out, txt);
    console.log(`[home] ${name} ${(txt.length / 1024).toFixed(0)} KB`);
  }
}

/* ---------------- 4. 真实评论 ---------------- */
async function fetchReviews() {
  const dir = path.join(RAW, 'reviews');
  ensure(dir);
  const pagesDir = path.join(RAW, 'pages');
  if (!fs.existsSync(pagesDir)) throw new Error('先跑 --only=pages');

  const ids = [];
  for (const f of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(pagesDir, f), 'utf8'));
    for (const it of j?.data?.items || []) {
      if (Number(it.ext_overall_review) > 0) ids.push(String(it.id));
    }
  }
  console.log(`[reviews] ${ids.length} 个商品有真实评论`);

  await pool(
    ids,
    async (id) => {
      const out = path.join(dir, `${id}.json`);
      if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 2) return;
      const txt = await req(`${API}/products/${id}/reviews?pageNumber=1&pageSize=50&sort[created_at]=desc`);
      fs.writeFileSync(out, txt);
    },
    'review'
  );
}

/* ---------------- main ---------------- */
const t0 = Date.now();
if (ONLY === 'all' || ONLY === 'pages') await fetchPages();
if (ONLY === 'all' || ONLY === 'cats') await fetchCats();
if (ONLY === 'all' || ONLY === 'home') await fetchHome();
if (ONLY === 'all' || ONLY === 'reviews') await fetchReviews();
console.log(`\n[done] ${((Date.now() - t0) / 1000).toFixed(1)}s → ${RAW}`);
