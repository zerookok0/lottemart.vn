#!/usr/bin/env node
/**
 * 生成政策 / 条款页（正文取自原站真实内容，已抓的 DOM 快照在 _recon/dom/）
 *
 *   node scripts/gen-info.mjs
 *
 * 输入：_recon/dom/<slug>.html（Edge headless 渲染后的原站 DOM）
 * 输出：site/<slug>.html（统一外壳 + .lm-prose 正文）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOM = path.join(ROOT, '_recon', 'dom');
const SITE = path.join(ROOT, 'site');

const PAGES = [
  { slug: 'privacy', title: 'Chính Sách Bảo Mật', sub: 'Chính sách bảo mật dữ liệu cá nhân dành cho khách hàng' },
  { slug: 'membership-policy', title: 'Điều Kiện & Điều Khoản', sub: 'Điều kiện và điều khoản sử dụng dịch vụ LOTTE Mart' },
  { slug: 'about-us', title: 'Giới Thiệu', sub: 'Về LOTTE Mart Việt Nam' },
  { slug: 'faq', title: 'Câu Hỏi Thường Gặp', sub: 'Giải đáp thắc mắc thường gặp' },
  { slug: 'shipping-delivery', title: 'Chính Sách Mua Hàng', sub: 'Chính sách mua hàng và giao nhận' },
  { slug: 'exchange-refund', title: 'Đổi Trả Và Hoàn Tiền', sub: 'Chính sách đổi trả và hoàn tiền' },
  { slug: 'cookies-policy', title: 'Điều Kiện Sử Dụng Cookies', sub: 'Chính sách cookies' },
  { slug: 'account-management', title: 'Quản Lý Tài Khoản', sub: 'Hướng dẫn quản lý tài khoản' },
];

const ENTITY = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

const clean = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\sdata-[\w-]+="[^"]*"/gi, '')
    .replace(/<a\s+([^>]*?)href="https?:\/\/www\.lottemart\.vn\/vi-nsg\/([^"]+)"/gi, '<a $1href="/vi-nsg/$2"')
    .replace(/<img[^>]*>/gi, '')
    .trim();

const extract = (html) => {
  // 原站正文容器（不同页面不一样）：static-content / tab-inner / tab-content / faq-list
  const NAMES = ['static-content', 'tab-inner', 'tab-content', 'faq-list'];
  let start = -1;
  for (const n of NAMES) {
    const re = new RegExp(`<div[^>]*class="[^"]*\\b${n}\\b[^"]*"[^>]*>`);
    const m = html.match(re);
    if (m && m.index > 0 && (start < 0 || m.index < start)) start = m.index + m[0].length;
  }
  if (start < 0) {
    const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    return m ? clean(m[1]) : '';
  }
  // 截到页脚之前
  const tailMarks = ['footer-content', 'CÔNG TY CỔ PHẦN TRUNG TÂM THƯƠNG MẠI LOTTE'];
  let end = html.length;
  for (const t of tailMarks) {
    const i = html.indexOf(t, start);
    if (i > start && i < end) end = i;
  }
  let body = html.slice(start, end);

  // 去掉尾部不闭合的标签（保证容器能正常闭合）
  const opens = (body.match(/<div\b/gi) || []).length;
  const closes = (body.match(/<\/div>/gi) || []).length;
  if (opens > closes) body += '</div>'.repeat(Math.min(opens - closes, 20));
  // 去掉最后一个不完整的标签
  body = body.replace(/<[a-zA-Z\/][^>]*$/, '');
  return clean(body);
};

const shell = (slug, title, sub, body) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | LOTTE Mart Việt Nam</title>
  <meta name="description" content="${sub}">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/assets/base.css">
  <script>
  (function(){
    var K=['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
           'utm_id','fbclid','ttclid','gclid','adset_id','campaign_id',
           'sub1','sub2','sub3','sub4','sub5'];
    function grab(q){var o={},p=(q||'').replace(/^\\?/,'').split('&');for(var i=0;i<p.length;i++){
      var kv=p[i].split('=');if(kv.length<2)continue;try{var k=decodeURIComponent(kv[0]);
      if(K.indexOf(k)!==-1)o[k]=decodeURIComponent(kv.slice(1).join('='));}catch(e){}}return o;}
    function load(){try{return JSON.parse(sessionStorage.getItem('bp_utm')||'{}')}catch(e){return {}}}
    function save(o){try{sessionStorage.setItem('bp_utm',JSON.stringify(o))}catch(e){}
      try{var d=new Date();d.setTime(d.getTime()+7*864e5);
      document.cookie='bp_utm='+encodeURIComponent(JSON.stringify(o))+'; expires='+d.toUTCString()+'; path=/; SameSite=Lax';}catch(e){}}
    var cur=load(),add=false;
    var m=grab(location.search); for(var a in m){cur[a]=m[a];add=true}
    try{var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
      if(n&&n.name){var mm=grab(n.name.split('?')[1]||'');for(var b in mm){cur[b]=mm[b];add=true}}}catch(e){}
    try{if(document.referrer){var mm2=grab((document.referrer.split('?')[1])||'');
      for(var c in mm2){if(!cur[c]){cur[c]=mm2[c];add=true}}}}catch(e){}
    if(add)save(cur);
    window.__BP_UTM__=cur;
  })();
  </script>
  <script src="/assets/config.js"></script>
  <script defer src="/assets/pixel.js"></script>
  <script defer src="/assets/app.js"></script>
  <script defer src="/assets/layout.js"></script>
</head>
<body data-page="info">
  <div data-lm-header></div>
  <main class="lm-main">
    <div class="container">
      <nav class="lm-crumb" aria-label="Breadcrumb"><a href="/">Trang chủ</a><span class="sep">/</span><span class="cur">${title}</span></nav>
      <article class="lm-doc">
        <h1>${title}</h1>
        <p class="lm-doc-sub">${sub}</p>
        <div class="lm-prose">${body || '<p>Nội dung đang được cập nhật.</p>'}</div>
      </article>
    </div>
  </main>
  <div data-lm-footer></div>
</body>
</html>`;

let ok = 0;
let missing = [];
for (const p of PAGES) {
  const file = path.join(DOM, `${p.slug}.html`);
  if (!fs.existsSync(file)) {
    missing.push(p.slug);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const body = extract(html);
  fs.writeFileSync(path.join(SITE, `${p.slug}.html`), shell(p.slug, p.title, p.sub, body), 'utf8');
  console.log(`[info] ${p.slug} ${(body.length / 1024).toFixed(0)} KB`);
  ok++;
}
if (missing.length) console.warn(`[info] 缺 DOM 快照：${missing.join(', ')}（这些页面会显示占位正文）`);
console.log(`[info] 完成 ${ok}/${PAGES.length}`);
