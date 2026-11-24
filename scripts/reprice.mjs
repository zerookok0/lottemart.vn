#!/usr/bin/env node
/**
 * 改价：售价 = 源站价（不再打折）
 *
 * 数据里价格有两套字段：
 *   卡片（cat / home / search）：p = 售价, l = 原价
 *   详情（p/）：list = 原价, price = 售价
 *
 * 本脚本把「售价」对齐到「原价」（即按源站标价卖），只动价格字段，其余一个字节不改。
 * 注意：原始抓取件 raw/ 已清，所以直接改 data/；以后重新抓取请用 parse-catalog.mjs（DISCOUNT 已同步为 1）。
 *
 *   node scripts/reprice.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const dry = process.argv.includes('--dry');

let files = 0;
let cards = 0;
let details = 0;

const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.json')) handle(p);
  }
};

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
    // 卡片口径：p / l
    if (typeof l === 'number' && l > 0 && typeof p === 'number' && p !== l) {
      node.p = l;
      hits++;
      cards++;
    }
    // 详情口径：price / list
    if (typeof list === 'number' && list > 0 && typeof price === 'number' && price !== list) {
      node.price = list;
      hits++;
      details++;
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

walk(DATA);
console.log(`\n[reprice] ${dry ? '待改' : '已改'} 文件 ${files} 个 · 卡片价 ${cards} 处 · 详情价 ${details} 处`);
