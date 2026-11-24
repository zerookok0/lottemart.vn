#!/usr/bin/env node
/**
 * 把「3折专区」商品并进数据层，并生成首页专区用的 data/deals.json
 *
 * 输入：
 *   deals.txt                    ← 源站商品链接（一行一个，顺序即展示顺序）
 *   raw/deals/<id>.json          ← scripts/fetch-deals.ps1 抓的源站详情（可选，没有就用现有 data）
 *   raw/deals/reviews-<id>.json  ← 同上，评价（可选）
 *
 * 处理：
 *   · 卡片（首页轨道用）：{ i,n,u,im,p,l,r,rv,s,st,c,rc,cn,br,b,k }
 *   · 详情：补进 data/p/<id % 100>.json（没有就新建，有就覆盖成源站最新）
 *   · 搜索索引：补进 data/search.json（没有就插入，有就更新）
 *   · data/deals.json：{ title, subtitle, ids, items }
 *
 *   node scripts/import-deals.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const RAW = path.join(ROOT, 'raw', 'deals');
const LIST = path.join(ROOT, 'deals.txt');
const SHARDS = 100;

const DEALS_TITLE = 'Deal 3 Chấm — Giảm Đến 70%';
const DEALS_SUBTITLE = 'Chỉ còn 30% giá gốc · số lượng có hạn, nhanh tay kẻo lỡ';

const readJson = (f, fb) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return fb;
  }
};
const writeJson = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj), 'utf8');
};
const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const slimImg = (u) => String(u || '').replace(/^https?:\/\/[^/]+\/media\/catalog\/product\/(?:cache\/\d+x\d+\/)?/, '');
const trimHtml = (h, n) =>
  String(h || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
const toInt = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* ---------------- 读清单 ---------------- */
const lines = fs.existsSync(LIST) ? fs.readFileSync(LIST, 'utf8').split(/\r?\n/) : [];
const ids = [];
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/-p(\d+)/) || t.match(/(\d{3,})/);
  if (!m) continue;
  if (!ids.includes(m[1])) ids.push(m[1]);
}
console.log(`[deals] 清单 ${ids.length} 个商品`);

/* ---------------- 现有数据 ---------------- */
const search = readJson(path.join(DATA, 'search.json'), []);
const byId = new Map(search.map((x) => [String(x.i), x]));
const shards = new Map();

const shardOf = (id) => {
  const k = Number(id) % SHARDS;
  if (!shards.has(k)) shards.set(k, readJson(path.join(DATA, 'p', `${k}.json`), {}));
  return shards.get(k);
};

/* ---------------- 评价（可选） ---------------- */
const buildReview = (id) => {
  const raw = readJson(path.join(RAW, `reviews-${id}.json`), null);
  const arr = raw?.data?.items || [];
  if (!arr.length) return null;
  const items = arr.slice(0, 10).map((r) => {
    const stars = Number(r.ratings?.[0]?.value) || 5;
    return {
      name: String(r.customer_name || 'Khách hàng').replace(/(\S)\S*/g, (m0, a) => a + '*****'),
      stars,
      date: String(r.created_at || '').slice(0, 10),
      title: String(r.title || 'Hài lòng'),
      text: trimHtml(r.detail || r.content || r.review_content || '', 260),
      reply: String(r.reply_content || '').trim(),
      crit: (r.ratings || []).map((c) => ({ k: String(c.rating_title || ''), v: Number(c.value) || 5 })),
      helpful: Math.max(0, toInt(r.helpful_count)),
    };
  });
  const avg = items.reduce((n, r) => n + r.stars, 0) / items.length;
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of items) breakdown[Math.min(5, Math.max(1, Math.round(r.stars)))]++;
  return { avg: Number(avg.toFixed(1)), count: toInt(raw?.data?.total_items) || items.length, breakdown, items };
};

/* ---------------- 逐个合并 ---------------- */
const items = [];
let added = 0;
let updated = 0;

for (const id of ids) {
  const rawFile = path.join(RAW, `${id}.json`);
  const raw = readJson(rawFile, null);
  const d = raw?.data?.detail || raw?.data || null;
  const existing = byId.get(id);

  let card = null;

  if (d && (d.id || d.name)) {
    const ca = d.custom_attribute || {};
    const priceObj = d.price?.VND || {};
    const list = toInt(priceObj.price || priceObj.default || priceObj.final_price);
    const img = d.image_url || (d.media_gallery?.big && Object.values(d.media_gallery.big)[0]) || '';
    const gallery = d.media_gallery?.big ? Object.values(d.media_gallery.big).filter(Boolean) : [];
    const labels = (Array.isArray(d.label) ? d.label : [])
      .filter((l) => l && (l.name || l.web_product_image || l.product_image))
      .map((l) => ({ name: String(l.name || '').trim(), img: l.web_product_image || l.product_image || '' }))
      .filter((l) => l.name);
    const catPath = (d.category_path || [])
      .map((p) => String(p).split('/'))
      .sort((a, b) => b.length - a.length)[0] || [];
    const catId = catPath.length ? catPath[catPath.length - 1] : '';
    const catName = String((d.category_full_path || [])[0] || '').split('/').pop().trim();
    const url = `/vi-nsg/product/${d.url_key || d.id}-p${d.id}`;

    card = {
      i: String(d.id || id),
      n: String(d.name || '').trim(),
      u: url,
      im: slimImg(img),
      p: list,
      l: list, // 售价 = 源站价（与全站口径一致）
      r: Number(d.ext_overall_rating) || 0,
      rv: Number(d.ext_overall_review) || 0,
      s: 12 + (hashStr(String(d.sku || id)) % 480),
      st: Number(d.stock_qty) || 0,
      c: catId,
      rc: catPath[0] || catId,
      cn: catName,
      br: String(ca.brand || ca.vendor || '').trim(),
      b: labels[0]?.name || '',
      k: slug(`${d.name} ${d.sku || ''}`),
    };

    // 详情分片
    const shard = shardOf(card.i);
    const detail = {
      id: card.i,
      sku: String(d.sku || ''),
      name: card.n,
      url,
      list,
      price: list,
      img: slimImg(img),
      gallery: (gallery.length ? gallery : [img]).slice(0, 4).map(slimImg),
      rating: card.r,
      reviews: card.rv,
      viewed: Number(d.ext_viewed) || 0,
      sold: card.s,
      stock: card.st,
      inStock: Number(d.in_stock) === 1,
      brand: card.br,
      unit: String(ca.unit || '').trim(),
      weight: String(ca.weight || '').trim(),
      origin: String(ca.country_of_manufacture || '').trim(),
      labels: labels.slice(0, 2),
      catId,
      catName,
      catUrl: '',
      description: trimHtml(d.description || '', 900),
      shortDescription: trimHtml(ca.short_description || '', 300),
      attrs: Object.fromEntries(
        Object.entries({
          'Thương hiệu': card.br,
          'Xuất xứ': String(ca.country_of_manufacture || '').trim(),
          'Đơn vị': String(ca.unit || '').trim(),
          'Quy cách': String(ca.weight || '').trim() ? `${ca.weight} g` : '',
          'Bảo quản': String(ca.storage_precautions || '').trim() === 'No' ? '' : String(ca.storage_precautions || '').trim(),
          'Hạn sử dụng': String(ca.usage_duration || '').trim(),
          'Hướng dẫn dùng': String(ca.usage_notes || '').trim().slice(0, 240),
          'Nhà cung cấp': String(ca.vendor || '').trim(),
          'Mã sản phẩm': String(d.sku || '').trim(),
        }).filter(([, v]) => v)
      ),
    };
    shard[card.i] = detail;

    // 评价分片
    const rev = buildReview(card.i);
    if (rev) {
      const k = Number(card.i) % SHARDS;
      const rf = path.join(DATA, 'reviews', `${k}.json`);
      const rshard = readJson(rf, {});
      rshard[card.i] = rev;
      writeJson(rf, rshard);
    }

    if (existing) updated++;
    else added++;
  } else if (existing) {
    // 没有新抓取文件：直接用现有 catalog 数据（价格口径已经是源站价）
    card = existing;
  } else {
    console.log(`[deals] ⚠ ${id} 既没有 raw/deals/${id}.json，也不在 catalog 里 —— 先跑 fetch-deals.ps1`);
    continue;
  }

  items.push(card);
  byId.set(String(card.i), card);
}

/* ---------------- 落盘 ---------------- */
for (const [k, obj] of shards) writeJson(path.join(DATA, 'p', `${k}.json`), obj);

/* 只有真的新增/更新了商品才重写索引，避免无意义的大文件 diff */
if (added || updated) writeJson(path.join(DATA, 'search.json'), [...byId.values()].sort((a, b) => (b.rv || 0) - (a.rv || 0)));
writeJson(path.join(DATA, 'deals.json'), { title: DEALS_TITLE, subtitle: DEALS_SUBTITLE, ids, items });

console.log(
  `[deals] data/deals.json 写入 ${items.length} 个商品（新增 ${added} / 更新 ${updated}），` +
    `search.json 现有 ${byId.size} 条`
);
if (!ids.length) console.log('[deals] 提示：deals.txt 还是空的，首页专区不会显示；把源站链接贴进去再跑一遍即可。');
