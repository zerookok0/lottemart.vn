#!/usr/bin/env node
/**
 * 只给「3折专区」那批商品打折（其余商品维持源站标价）
 *
 *   1) node scripts/reprice.mjs --rate=1        # 全站先回到源站标价（p = l / price = list）
 *   2) node scripts/import-deals.mjs            # 生成 data/deals.json（顺序、卡片、详情）
 *   3) node scripts/discount-deals.mjs          # ← 本脚本：只把 deals.txt 里的 id 打成 3 折
 *
 * 为什么单独一步：专区商品可能同时出现在首页其它轨道、类目页、搜索结果、商品详情页里，
 * 价格必须处处一致，所以按 id 把 data/ 下所有出现的地方一起改，而不是只改 deals.json。
 *
 *   node scripts/discount-deals.mjs --rate=0.3 [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const LIST = path.join(ROOT, 'deals.txt');

const argRate = process.argv.find((a) => a.startsWith('--rate='));
const RATE = Number(argRate ? argRate.split('=')[1] : 0.3);
const dry = process.argv.includes('--dry');

if (!(RATE > 0 && RATE < 1)) {
  console.error('[deals-price] rate 必须在 (0, 1) 之间，比如 0.3');
  process.exit(1);
}

const salePrice = (list) => Math.max(100, Math.round((Math.max(0, Math.round(Number(list) || 0)) * RATE) / 100) * 100);

/* ---- 清单里的 id ---- */
const ids = new Set();
for (const line of fs.readFileSync(LIST, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/-p(\d+)/) || t.match(/(\d{3,})/);
  if (m) ids.add(m[1]);
}
if (!ids.size) {
  console.log('[deals-price] deals.txt 里没有商品，跳过');
  process.exit(0);
}

let files = 0;
let cards = 0;
let details = 0;
const touched = new Set();

const handle = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const pretty = /\n\s+\S/.test(raw.slice(0, 400));
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }
  let hits = 0;
  const stack = [data];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
      continue;
    }
    const id = node.id != null ? String(node.id) : node.i != null ? String(node.i) : '';
    if (id && ids.has(id)) {
      touched.add(id);
      const { p, l, price, list } = node;
      if (typeof l === 'number' && l > 0) {
        const next = salePrice(l);
        if (p !== next) {
          node.p = next;
          hits++;
          cards++;
        }
      }
      if (typeof list === 'number' && list > 0) {
        const next = salePrice(list);
        if (price !== next) {
          node.price = next;
          hits++;
          details++;
        }
      }
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
  }
  if (!hits) return;
  files++;
  if (dry) {
    console.log(`[plan] ${path.relative(ROOT, file)} → ${hits} 处`);
    return;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
};

const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.json')) handle(p);
  }
};

walk(DATA);

const missing = [...ids].filter((x) => !touched.has(x));
console.log(
  `[deals-price] rate=${RATE} ${dry ? '待改' : '已改'} 文件 ${files} 个 · 卡片价 ${cards} 处 · 详情价 ${details} 处 · ` +
    `命中 ${touched.size}/${ids.size} 个专区商品`
);
if (missing.length) console.log('[deals-price] ⚠ 这些 id 在 data/ 里找不到：' + missing.join(', '));
