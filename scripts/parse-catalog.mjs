#!/usr/bin/env node
/**
 * 原始 JSON → data/*.json
 *
 *   node scripts/parse-catalog.mjs
 *
 * 产物：
 *   data/menu.json           类目树（26 一级 / 399 节点）
 *   data/cat/<catId>.json    单类目商品卡（含祖先类目）
 *   data/p/<id % 100>.json   商品详情分片
 *   data/reviews/<id % 100>.json 评价（真实优先，缺失用确定性生成）
 *   data/home.json           首页区块
 *   data/search.json         搜索索引
 *   data/meta.json           统计信息
 *
 * 价格口径：售价 = round(原价 × 0.6 / 100) × 100（VND 取整到 100₫）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const SHARDS = 100;
const DISCOUNT = 0.6;

const log = (...a) => console.log(...a);
const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
};

/* ---------------------------------------------------------------- 工具 */
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const salePrice = (vnd) => {
  const n = Number(vnd) || 0;
  return Math.max(100, Math.round((n * DISCOUNT) / 100) * 100);
};

const toInt = (v) => {
  const n = Math.round(Number(v) || 0);
  return n > 0 ? n : 0;
};

const trimHtml = (html, max = 4000) => {
  if (!html) return '';
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/(\r?\n){2,}/g, '\n')
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/<[^>]*$/, '') + '…';
  return s;
};

const IMG_PREFIX = 'https://www.lottemart.vn/media/catalog/product/cache/300x300/';
const slimImg = (u) => String(u || '').replace(IMG_PREFIX, '');

const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

/* ---------------------------------------------------------------- 读原始 */
log('[parse] 读取 raw …');
// 清掉上一次的产物，避免残留（例如旧版本生成的 cat/0.json）
for (const sub of ['cat', 'p', 'reviews']) {
  fs.rmSync(path.join(DATA, sub), { recursive: true, force: true });
}
const catDir = path.join(RAW, 'catprod');
const pageDir = path.join(RAW, 'pages');

const byId = new Map();
const ingest = (file) => {
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return;
  }
  for (const it of j?.data?.items || []) {
    if (!it || !it.id) continue;
    byId.set(String(it.id), it);
  }
};

if (fs.existsSync(catDir)) {
  for (const f of fs.readdirSync(catDir).filter((f) => f.endsWith('.json'))) ingest(path.join(catDir, f));
}
if (fs.existsSync(pageDir)) {
  for (const f of fs.readdirSync(pageDir).filter((f) => f.endsWith('.json'))) ingest(path.join(pageDir, f));
}
log(`[parse] 商品 ${byId.size} 条（去重后）`);

const tree = JSON.parse(fs.readFileSync(path.join(RAW, 'cats', 'tree.json'), 'utf8'));
const catMap = new Map(); // id -> {id,name,url_key,level,parent_id,path,path_formatted}
const roots = [];

const walk = (node, parentId, pathIds) => {
  const id = String(node.id);
  const p = [...pathIds, id];
  const rec = {
    id,
    name: node.name,
    url_key: node.url_key,
    level: Number(node.level) || p.length,
    parent_id: parentId ? String(parentId) : '',
    path: p.join('/'),
    path_formatted: node.path_formatted || node.name,
    url: `/vi-nsg/category/${node.url_key}-c${id}`,
    count: 0,
  };
  catMap.set(id, rec);
  for (const c of node.child || []) walk(c, id, p);
};
for (const r of tree.data || []) {
  roots.push(String(r.id));
  walk(r, '', []);
}
log(`[parse] 类目节点 ${catMap.size}（一级 ${roots.length}）`);

/* ---------------------------------------------------------------- 归一商品 */
const NAME_FIRST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const NAME_LAST = ['An', 'Bình', 'Chi', 'Dung', 'Giang', 'Hà', 'Hạnh', 'Hùng', 'Linh', 'Mai', 'Nam', 'Ngọc', 'Phúc', 'Quỳnh', 'Sơn', 'Trang', 'Trung', 'Tú', 'Vy', 'Yến'];
const REVIEW_TEXT = [
  'Sản phẩm tươi ngon, đóng gói cẩn thận, giao hàng nhanh.',
  'Chất lượng tốt so với giá tiền, sẽ mua lại lần sau.',
  'Hàng đúng mô tả, hạn sử dụng còn dài.',
  'Nhân viên giao hàng thân thiện, đóng gói kỹ càng.',
  'Giá hợp lý, siêu thị thường xuyên có khuyến mãi.',
  'Mình mua lần thứ 3 rồi, chất lượng vẫn ổn định.',
  'Đóng gói hơi chặt nhưng sản phẩm nguyên vẹn, không dập.',
  'Hàng tươi, không bị dập nát, đúng cân.',
  'Đặt sáng giao chiều là có, rất tiện.',
  'Sản phẩm dùng ổn, đáng tiền, gia đình mình ai cũng thích.',
  'Mua online tiện hơn đi siêu thị, giá lại rẻ hơn.',
  'Chất lượng đúng như hình, lần sau ủng hộ tiếp.',
];
const REVIEW_TITLE = ['Rất hài lòng', 'Đáng tiền', 'Sẽ mua lại', 'Tốt', 'Ổn trong tầm giá', 'Giao nhanh'];
const REPLY = [
  'LOTTE MART chân thành cám ơn Quý khách đã quan tâm, tin tưởng và sử dụng dịch vụ của LOTTE MART. Rất mong nhận được sự ủng hộ của Quý khách trong thời gian tới ạ.',
  'Cảm ơn Quý khách đã chia sẻ trải nghiệm. LOTTE MART rất vui khi sản phẩm làm Quý khách hài lòng ạ.',
  'LOTTE MART ghi nhận ý kiến của Quý khách và sẽ tiếp tục cải thiện chất lượng phục vụ ạ.',
];

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const maskName = (rnd) => {
  const a = pick(rnd, NAME_FIRST);
  const b = pick(rnd, NAME_LAST);
  return rnd() > 0.4 ? `${a} ${b.charAt(0)}*****` : `${a} ${b}`;
};

const items = [];
for (const it of byId.values()) {
  if (Number(it.status) !== 1) continue;
  const priceObj = it?.price?.VND || {};
  const list = toInt(priceObj.price || priceObj.default);
  if (!list) continue;
  const img = it.image_url || (it.media_gallery?.big && Object.values(it.media_gallery.big)[0]) || '';
  if (!img) continue;

  const ca = it.custom_attribute || {};
  // 类目路径：category_path 里可能带上树外的祖先（如 265），只保留树内存在的 id
  const paths = (it.category_path || [])
    .map((p) => String(p).split('/').filter((id) => catMap.has(String(id))))
    .filter((a) => a.length)
    .sort((a, b) => b.length - a.length);
  const pathIds = paths[0] || [];
  const primary = pathIds.length ? pathIds[pathIds.length - 1] : '';
  const catRec = primary ? catMap.get(primary) : null;

  const gallery = it.media_gallery?.big ? Object.values(it.media_gallery.big).filter(Boolean) : [];
  const labels = (Array.isArray(it.label) ? it.label : [])
    .filter((l) => l && (l.product_image || l.web_product_image || l.name))
    .map((l) => ({ name: String(l.name || '').trim(), img: l.web_product_image || l.product_image || '' }))
    .filter((l) => l.name);

  const seed = hashStr(it.sku || it.id);
  const rnd = mulberry32(seed);

  items.push({
    id: String(it.id),
    sku: String(it.sku || ''),
    name: String(it.name || '').trim(),
    url_key: String(it.url_key || ''),
    url: `/vi-nsg/product/${it.url_key || it.id}-p${it.id}`,
    list,
    price: salePrice(list),
    img,
    thumb: it.thumbnail_url || img,
    gallery: (gallery.length ? gallery : [img]).slice(0, 4).map(slimImg),
    rating: Number(it.ext_overall_rating) || 0,
    reviews: Number(it.ext_overall_review) || 0,
    viewed: Number(it.ext_viewed) || 0,
    sold: 12 + Math.floor(rnd() * 480),
    stock: Number(it.stock_qty) || 0,
    inStock: Number(it.in_stock) === 1,
    brand: String(ca.brand || ca.vendor || '').trim(),
    unit: String(ca.unit || ''.trim()),
    weight: String(ca.weight || '').trim(),
    origin: String(ca.country_of_manufacture || '').trim(),
    labels,
    catId: primary,
    catName: catRec ? catRec.name : '',
    catUrl: catRec ? catRec.url : '',
    pathIds,
    description: trimHtml(it.description || '', 900),
    shortDescription: trimHtml(ca.short_description || '', 300),
    attrs: {
      'Thương hiệu': String(ca.brand || '').trim(),
      'Xuất xứ': String(ca.country_of_manufacture || '').trim(),
      'Đơn vị': String(ca.unit || '').trim(),
      'Quy cách': String(ca.weight || '').trim() ? `${ca.weight} g` : '',
      'Bảo quản': String(ca.storage_precautions || '').trim() === 'No' ? '' : String(ca.storage_precautions || '').trim(),
      'Hạn sử dụng': String(ca.usage_duration || '').trim(),
      'Hướng dẫn dùng': String(ca.usage_notes || '').trim().slice(0, 240),
      'Nhà cung cấp': String(ca.vendor || '').trim(),
      'Mã sản phẩm': String(it.sku || '').trim(),
    },
    _seed: seed,
  });
}

log(`[parse] 归一后 ${items.length} 个在售商品（有图）`);

/* ---------------------------------------------------------------- 评分（真实优先） */
const reviewDir = path.join(RAW, 'reviews');
const realReviewIds = fs.existsSync(reviewDir) ? new Set(fs.readdirSync(reviewDir).map((f) => f.replace('.json', ''))) : new Set();
log(`[parse] 真实评论文件 ${realReviewIds.size}`);

const reviewsByShard = new Map();
const pushReview = (id, rec) => {
  const k = Number(id) % SHARDS;
  if (!reviewsByShard.has(k)) reviewsByShard.set(k, {});
  reviewsByShard.get(k)[id] = rec;
};

let realCount = 0;
let genCount = 0;

for (const p of items) {
  let real = null;
  if (realReviewIds.has(p.id)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(reviewDir, `${p.id}.json`), 'utf8'));
      const arr = j?.data?.items || [];
      if (arr.length) real = arr;
    } catch (e) {}
  }

  const rnd = mulberry32(p._seed);

  if (real) {
    realCount++;
    const list = real.slice(0, 10).map((r) => {
      const crit = (r.ratings || []).map((c) => ({ k: c.rating_title, v: Number(c.value) || 5 }));
      const stars = Number(r.ratings?.[0]?.value) || 5;
      return {
        nick: String(r.nickname || 'Khách hàng').trim(),
        stars,
        at: Number(r.created_at) * 1000 || Date.now(),
        title: String(r.title || '').trim(),
        body: String(r.detail || '').trim(),
        verified: Boolean(r.verified_buyer),
        reply: String(r.answer || '').trim(),
        crit,
      };
    });
    const avg = p.rating || list.reduce((n, r) => n + r.stars, 0) / list.length || 5;
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of list) breakdown[Math.min(5, Math.max(1, Math.round(r.stars)))]++;
    pushReview(p.id, { avg: Number(avg.toFixed(1)), count: p.reviews || list.length, breakdown, items: list, real: true });
  } else {
    genCount++;
    // 确定性生成：4.3–5.0 分，条数与分布由 SKU 决定
    const count = 3 + Math.floor(rnd() * 168);
    const avg = Number((4.3 + rnd() * 0.7).toFixed(1));
    const five = Math.round(count * (avg >= 4.8 ? 0.86 : avg >= 4.6 ? 0.72 : 0.58));
    const four = Math.round((count - five) * 0.62);
    const three = Math.round((count - five - four) * 0.6);
    const two = Math.round((count - five - four - three) * 0.6);
    const one = Math.max(0, count - five - four - three - two);
    const n = 3 + Math.floor(rnd() * 2);
    const list = [];
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      const stars = rnd() > 0.18 ? 5 : rnd() > 0.5 ? 4 : 3;
      list.push({
        nick: maskName(rnd),
        stars,
        at: now - Math.floor(rnd() * 240) * 86400000,
        title: rnd() > 0.55 ? pick(rnd, REVIEW_TITLE) : '',
        body: pick(rnd, REVIEW_TEXT),
        verified: rnd() > 0.25,
        reply: rnd() > 0.62 ? pick(rnd, REPLY) : '',
        crit: [
          { k: 'Chất lượng sản phẩm', v: stars },
          { k: 'Đúng mô tả sản phẩm', v: Math.max(3, stars - (rnd() > 0.7 ? 1 : 0)) },
          { k: 'Giá cả hợp lý', v: Math.max(3, stars - (rnd() > 0.6 ? 1 : 0)) },
        ],
      });
    }
    pushReview(p.id, {
      avg,
      count,
      breakdown: { 5: five, 4: four, 3: three, 2: two, 1: one },
      items: list,
      real: false,
    });
  }

  // 卡片/详情页直接用这份汇总，保证一致
  const rec = reviewsByShard.get(Number(p.id) % SHARDS)[p.id];
  p.rating = rec.avg;
  p.reviews = rec.count;
}

log(`[parse] 评价：真实 ${realCount} / 生成 ${genCount}`);

/* ---------------------------------------------------------------- 类目归集 */
const catProducts = new Map(); // catId -> [card]
const card = (p) => ({
  id: p.id,
  n: p.name,
  u: p.url,
  im: slimImg(p.img),
  p: p.price,
  l: p.list,
  r: p.rating,
  rv: p.reviews,
  s: p.sold,
  b: p.labels[0]?.name || '',
  bi: p.labels[0]?.img || '',
  br: p.brand,
  c: p.catId,
  cn: p.catName,
});

for (const p of items) {
  for (const cid of p.pathIds.length ? p.pathIds : ['0']) {
    if (!catProducts.has(cid)) catProducts.set(cid, []);
    catProducts.get(cid).push(card(p));
  }
}

for (const [cid, arr] of catProducts) {
  arr.sort((a, b) => b.s - a.s);
  writeJson(path.join(DATA, 'cat', `${cid}.json`), { id: cid, total: arr.length, items: arr });
  const rec = catMap.get(cid);
  if (rec) rec.count = arr.length;
}

/* ---------------------------------------------------------------- 源站「Giao 60 Phút」虚拟类目
 * 这是源站的营销类目（/vi-nsg/category/giao-hang-sieu-toc-c497），
 * categories/<id>/products 接口返回 0，实际等价于「带 Giao siêu tốc 促销标」的商品。
 */
const expressItems = items.filter((p) => (p.labels || []).some((l) => /giao/i.test(l.name || '')));
const expressCards = expressItems.map(card).sort((a, b) => b.s - a.s);
if (expressCards.length) {
  writeJson(path.join(DATA, 'cat', '497.json'), { id: '497', total: expressCards.length, items: expressCards });
  catMap.set('497', {
    id: '497',
    name: 'Giao 60 Phút',
    url_key: 'giao-hang-sieu-toc',
    level: 1,
    parent_id: '',
    path: '497',
    path_formatted: 'Giao 60 Phút',
    url: '/vi-nsg/category/giao-hang-sieu-toc-c497',
    count: expressCards.length,
  });
  log(`[parse] Giao 60 Phút（虚拟类目）${expressCards.length} 个商品`);
}

/* ---------------------------------------------------------------- 详情分片 */
const shardMap = new Map();
for (const p of items) {
  const k = Number(p.id) % SHARDS;
  if (!shardMap.has(k)) shardMap.set(k, {});
  shardMap.get(k)[p.id] = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    url: p.url,
    list: p.list,
    price: p.price,
    img: p.img,
    gallery: p.gallery,
    rating: p.rating,
    reviews: p.reviews,
    viewed: p.viewed,
    sold: p.sold,
    stock: p.stock,
    inStock: p.inStock,
    brand: p.brand,
    unit: p.unit,
    weight: p.weight,
    origin: p.origin,
    labels: p.labels.slice(0, 2),
    catId: p.catId,
    catName: p.catName,
    catUrl: p.catUrl,
    description: p.description,
    shortDescription: p.shortDescription,
    attrs: Object.fromEntries(Object.entries(p.attrs).filter(([, v]) => v)),
  };
}
for (const [k, obj] of shardMap) writeJson(path.join(DATA, 'p', `${k}.json`), obj);
for (const [k, obj] of reviewsByShard) writeJson(path.join(DATA, 'reviews', `${k}.json`), obj);

/* ---------------------------------------------------------------- 搜索索引（集合页也用它排序/筛选） */
const search = items
  .map((p) => ({
    i: p.id,
    n: p.name,
    u: p.url,
    im: slimImg(p.img),
    p: p.price,
    l: p.list,
    r: p.rating,
    rv: p.reviews,
    s: p.sold,
    st: p.stock,
    c: p.catId,
    rc: p.pathIds[0] || p.catId,
    cn: p.catName,
    br: p.brand,
    b: p.labels[0]?.name || '',
    k: slug(`${p.name} ${p.sku}`),
  }))
  .sort((a, b) => b.rv - a.rv);
writeJson(path.join(DATA, 'search.json'), search);
log(`[parse] search.json ${(fs.statSync(path.join(DATA, 'search.json')).size / 1e6).toFixed(1)} MB`);

/* ---------------------------------------------------------------- 菜单 */
const menu = [...catMap.values()]
  .filter((c) => c.count > 0 || roots.includes(c.id))
  .map((c) => ({ ...c }));
const specials = ['497']
  .map((id) => catMap.get(id))
  .filter(Boolean)
  .map((c) => ({ id: c.id, name: c.name, url: c.url, count: c.count }));
writeJson(path.join(DATA, 'menu.json'), { roots, nodes: menu, specials });

/* ---------------------------------------------------------------- 首页 */
const homeRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'home', 'zones.json'), 'utf8'));
const bannersRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'home', 'banner.json'), 'utf8'));
const popupRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'home', 'popup.json'), 'utf8'));

const cardById = new Map(items.map((p) => [p.id, card(p)]));
const cardsOf = (arr) =>
  (arr || [])
    .map((it) => cardById.get(String(it.id)))
    .filter(Boolean)
    .slice(0, 30);

const zoneByKey = new Map((homeRaw.data || []).map((z) => [z.zone, z]));

const heroBanners = (bannersRaw.data || [])
  .filter((b) => b.is_active !== false)
  .map((b) => ({
    title: b.title || b.banner_title || '',
    img: b.image?.image_web || b.app_image || '',
    link: b.image?.link_url ? `/vi-nsg/${String(b.image.link_url).replace(/^\/+/, '')}` : '/',
    type: b.image?.type_banner || '',
  }))
  .filter((b) => b.img);

const coupons = ((zoneByKey.get('home_coupon_zone')?.coupon_list) || []).slice(0, 12).map((c) => ({
  code: c.coupon_code,
  name: c.discount_name,
  desc: c.discount_description,
  img: c.image,
  expire: c.expire_date_text,
  left: Math.max(0, (Number(c.limit) || 0) - (Number(c.total_used) || 0)),
}));

/* 首页区块标题：源站用的是排版标题，接口给的 zone_name 带 _VN 后缀 / 英文占位，
 * 这里映射成源站实际展示的越南语标题（对上首页截图） */
const HOME_TITLES = {
  today_check: 'Mua Giá Hời Hơn',
  promo: 'Khuyến mãi trong tháng',
  md_picks_best_price: 'Giá tốt mỗi ngày',
  md_picks_only_for_this_week: 'Chỉ trong tuần này',
  md_picks_event1: 'Sự kiện đặc biệt',
  md_picks_event2: 'Sự kiện đặc biệt',
  Home_Just_arrived: 'Hàng mới',
  Home_Weekly_Best: 'Nổi bật trong tuần',
  shopping_life: 'Mua sắm tiện lợi',
  brand_on: 'Ưu đãi từ đối tác',
};

const section = (zoneKey, opts = {}) => {
  const z = zoneByKey.get(zoneKey);
  if (!z) return null;
  return {
    key: zoneKey,
    title: HOME_TITLES[zoneKey] || String(z.zone_name || z.title_name || zoneKey).replace(/_VN$/, ''),
    titleImage: z.title_image || '',
    url: z.url_link ? `/vi-nsg/${String(z.url_link).replace(/^\/+/, '')}` : '',
    items: cardsOf(z.items),
    ...opts,
  };
};

const mdPicks = zoneByKey.get('md_picks');
const rawSections = [
  section('today_check', { tabs: ['Nổi bật', 'Đánh giá', 'Giá thấp', 'Giá cao'] }),
  section('promo'),
  ...((mdPicks?.zones || [])
    .filter((z) => (z.items || []).length)
    .map((z) => ({
      key: z.zone,
      title: HOME_TITLES[z.zone] || String(z.title_name || z.zone_name || '').replace(/_VN$/, ''),
      titleImage: z.title_image || '',
      url: z.url_link ? `/vi-nsg/${String(z.url_link).replace(/^\/+/, '')}` : '',
      items: cardsOf(z.items),
    }))),
  section('Home_Just_arrived'),
  section('Home_Weekly_Best'),
  section('shopping_life'),
  section('brand_on'),
].filter((s) => s && s.items.length);

// 同名区块合并（md_picks 的 event1 / event2 在源站是同一行标题）
const mergedSections = [];
for (const s of rawSections) {
  const hit = mergedSections.find((x) => x.title === s.title);
  if (hit) {
    const seen = new Set(hit.items.map((i) => String(i.id)));
    hit.items = hit.items.concat(s.items.filter((i) => !seen.has(String(i.id)))).slice(0, 30);
    hit.key = `${hit.key}+${s.key}`;
  } else {
    mergedSections.push({ ...s });
  }
}

const home = {
  hero: heroBanners,
  coupons,
  sections: mergedSections,
  promoBanners: ((zoneByKey.get('shopping_life')?.banners) || []).slice(0, 2).map((b) => ({
    title: b.title || '',
    img: b.image?.image_web || b.app_image || '',
    link: b.image?.link_url ? `/vi-nsg/${String(b.image.link_url).replace(/^\/+/, '')}` : '/',
  })),
  popup: (() => {
    const p = (popupRaw.data?.items || []).find((x) => x.product) || null;
    if (!p) return null;
    return { title: 'Ưu đãi đặc biệt', product: cardById.get(String(p.product.id)) || null, img: p.product?.image_url || '' };
  })(),
};

writeJson(path.join(DATA, 'home.json'), home);

/* ---------------------------------------------------------------- meta */
writeJson(path.join(DATA, 'meta.json'), {
  generated: new Date().toISOString(),
  products: items.length,
  categories: catMap.size,
  roots: roots.length,
  reviewsReal: realCount,
  reviewsGenerated: genCount,
  currency: 'VND',
  discount: DISCOUNT,
});

const totalSize = fs
  .readdirSync(DATA, { recursive: true })
  .filter((f) => String(f).endsWith('.json'))
  .reduce((n, f) => n + fs.statSync(path.join(DATA, f)).size, 0);

log(`[parse] 完成 → data/ ${(totalSize / 1e6).toFixed(1)} MB`);



