#!/usr/bin/env node
/**
 * 改价：把 data/ 里的售价按标价重算
 *
 *   卡片（cat / home / search / deals）：p = 售价, l = 标价
 *   详情（p/）：list = 标价, price = 售价
 *
 * 用法：
 *   node scripts/reprice.mjs                 # 用 rate 默认值（见 RATE）
 *   node scripts/reprice.mjs --rate=0.3      # 3 折：售价 = 标价 × 0.3（取整到 100₫）
 *   node scripts/reprice.mjs --rate=1        # 不打折：售价 = 标价
 *   node scripts/reprice.mjs --rate=0.3 --dry
 *
 * 注意：只改「售价」字段，标价（l / list）永远保留源站原值，所以随时可以换 rate 重算。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');

const argRate = process.argv.find((a) => a.startsWith('--rate='));
const RATE = Number(argRate ? argRate.split('=')[1] : 0.3);
const dry = process.argv.includes('--dry');

if (!(RATE > 0 && RATE <= 1)) {
  console.error('[reprice] rate 必须在 (0, 1] 之间，比如 0.3 / 1');
  process.exit(1);
}

const salePrice = (list) => {
  const n = Math.max(0, Math.round(Number(list) || 0));
  if (RATE >= 0.999) return n;
  return Math.max(100, Math.round((n * RATE) / 100) * 100);
};

let files = 0;
let cards = 0;
let details = 0;

const handle = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const pretty = /\n\s+\S/.test(raw.slice(0, 400));
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log('[skip]', path.relative(ROOT, file), e.message);
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
    const { p, l, price, list } = node;

    // 卡片口径：以标价 l 为准重算 p
    if (typeof l === 'number' && l > 0) {
      const next = salePrice(l);
      if (typeof p !== 'number' || p !== next) {
        node.p = next;
        hits++;
        cards++;
      }
    }
    // 详情口径：以 list 为准重算 price
    if (typeof list === 'number' && list > 0) {
      const next = salePrice(list);
      if (typeof price !== 'number' || price !== next) {
        node.price = next;
        hits++;
        details++;
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
console.log(
  `\n[reprice] rate=${RATE} ${dry ? '待改' : '已改'} 文件 ${files} 个 · 卡片价 ${cards} 处 · 详情价 ${details} 处`
);
