/* =============================================================================
 * 边缘中间件 v2：多层闸门（防 FB 审核爬虫）+ 全站安全头
 *
 * 目标：只有「越南本地真实访客」才看到真站，其余（Meta 爬虫 / 美国机房 / 无头浏览器）
 *       统一 200 直出无品牌的 /safe.html（服务条款页，URL 不变）。
 *
 * 判定顺序（任一条命中 → 安全页）：
 *   1. ASN 命中 Meta / Facebook（32934 等）
 *   2. AS Organization 含 facebook / meta
 *   3. UA 命中爬虫/无头浏览器特征（facebookexternalhit / meta-externalagent / HeadlessChrome / Puppeteer …）
 *   4. Cloudflare Bot Management 评分过低（仅企业版有该字段，有就用）
 *   5. 国家 != VN
 *   6. （可选 CLOAK_STRICT=1）时区 != Asia/Ho_Chi_Minh 或 Accept-Language 不是 vi 开头
 *
 * 白名单（只给自家人用，别出现在任何给平台的链接里）：
 *   · 访问 /<CLOAK_KEY>（环境变量里的随机串）→ 写 30 天 cookie vnf=1 → 跳回 /
 *   · 已带 cookie vnf=1                        → 放行
 *   · CLOAK_DEBUG=1 时可用 ?vn=1 或请求头 x-country 模拟（仅联调）
 *   · CLOAK_MODE=off                           → 全局关闭分流（紧急回滚）
 *
 * 观测：每次拦截都 console.log 一行 JSON（`wrangler pages deployment tail` 可看），
 *       配了 CLOAK_WEBHOOK 时再 POST 一份，方便调规则。
 * ============================================================================= */

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' https://annangourmet.makeup",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const HOME_COUNTRY = 'VN';
const HOME_TZ = 'Asia/Ho_Chi_Minh';
const PASS_COOKIE = 'vnf';

/* Meta / Facebook 的 ASN（32934 是主号，63293 是 Meta CDN） */
const META_ASN = new Set(['32934', '63293', '54115']);

/* 爬虫 / 无头浏览器 UA 特征 */
const BOT_UA =
  /facebookexternalhit|meta-externalagent|facebookcatalog|facebot|facebookplatform|meta-externalfetcher|headlesschrome|puppeteer|playwright|phantomjs|selenium|python-requests|python-urllib|aiohttp|go-http-client|curl\/|wget\/|scrapy|okhttp|libwww-perl/i;

/* 这些路径不参与分流（都不含品牌内容，且安全页/面板需要）
 * /assets/safe/ 是安全页专用商品图（已去水印、无品牌），必须直出 */
const ALLOW_PREFIX = ['/api/', '/bp/', '/safe', '/assets/safe/'];
/* 非 VN 直接 404（品牌商品数据） */
const BLOCK_PREFIX = ['/data/'];

const isAllow = (path) => ALLOW_PREFIX.some((p) => path === p || path.startsWith(p)) || path === '/safe.html';

const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
};

/** 收集「为什么判定为外部/机器人」 */
const collectSignals = (request, env) => {
  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const al = (request.headers.get('Accept-Language') || '').toLowerCase();
  const asn = String(cf.asn || '');
  const org = String(cf.asOrganization || '');
  const score = cf.botManagement && typeof cf.botManagement.score === 'number' ? cf.botManagement.score : null;
  const reasons = [];

  if (META_ASN.has(asn)) reasons.push('meta-asn:' + asn);
  if (/facebook|meta/i.test(org)) reasons.push('meta-org:' + org.slice(0, 40));
  if (BOT_UA.test(ua)) reasons.push('bot-ua:' + ua.slice(0, 60));
  if (score !== null && score < 30) reasons.push('bot-score:' + score);
  if (String(cf.country || '') !== HOME_COUNTRY) reasons.push('country:' + (cf.country || '-'));

  // 严格模式：时区/语言也纳入（VN 真实用户基本都满足；游客/外派会被挡，按需开）
  if (String(env && env.CLOAK_STRICT) === '1') {
    if (cf.timezone && cf.timezone !== HOME_TZ) reasons.push('timezone:' + cf.timezone);
    if (al && !al.startsWith('vi')) reasons.push('lang:' + al.slice(0, 12));
  }

  return { reasons, country: cf.country || '', asn, org: org.slice(0, 40), ua: ua.slice(0, 120), score, lang: al.slice(0, 12), tz: cf.timezone || '' };
};

/** 拦截留痕：console + 可选 webhook（不阻塞响应） */
const logBlocked = (ctx, request, sig, path) => {
  const line = JSON.stringify({ t: new Date().toISOString(), path, ...sig, ref: (request.headers.get('Referer') || '').slice(0, 120) });
  try {
    console.log('[cloak]', line);
  } catch (e) {}
  const hook = ctx && ctx.env && ctx.env.CLOAK_WEBHOOK;
  if (!hook) return;
  const task = fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '🚧 cloak block\n' + line }),
  }).catch(() => {});
  try {
    if (ctx.waitUntil) ctx.waitUntil(task);
  } catch (e) {}
};

const serveSafe = async (env, request) => {
  const res = await env.ASSETS.fetch(new URL('/safe.html', request.url));
  return new Response(res.body, {
    status: 200,
    headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  /* ---------- 0. 家庭白名单 ---------- */
  let passCookie = false;
  try {
    passCookie = readCookie(request, PASS_COOKIE) === '1';
  } catch (e) {}

  const secretKey = String((env && env.CLOAK_KEY) || '');
  if (secretKey && path === '/' + secretKey) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Set-Cookie': `${PASS_COOKIE}=1; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`, 'Cache-Control': 'no-store' },
    });
  }

  const debug = String(env && env.CLOAK_DEBUG) === '1';
  const passParam = debug && url.searchParams.get('vn') === '1';
  if (debug) {
    const spoof = request.headers.get('x-country');
    if (spoof && request.cf) request.cf.country = spoof.toUpperCase();
  }

  const cloakOff = String((env && env.CLOAK_MODE) || '').toLowerCase() === 'off';

  /* ---------- 1. 判定 ---------- */
  let res;
  if (cloakOff || passCookie || passParam || isAllow(path)) {
    res = await next();
  } else {
    const sig = collectSignals(request, env);

    /* 硬信号（Meta ASN / 爬虫 UA / 低 bot 分）：即使带了 cookie 也照样拦 —— 这类不可能是真人 */
    const hard = sig.reasons.some((r) => /^meta-|^bot-ua|^bot-score/.test(r));
    const blocked = hard || sig.reasons.length > 0;

    if (!blocked) {
      res = await next();
    } else if (BLOCK_PREFIX.some((p) => path.startsWith(p))) {
      logBlocked(context, request, sig, path);
      res = new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } else if (path === '/favicon.ico') {
      res = new Response(null, { status: 204 });
    } else {
      logBlocked(context, request, sig, path);
      res = await serveSafe(env, request);
    }
  }

  /* ---------- 2. 统一安全头 ---------- */
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  out.headers.set('X-DNS-Prefetch-Control', 'on');
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  if (passParam) out.headers.append('Set-Cookie', `${PASS_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax`);
  if (/^\/(checkout|order)/.test(path) || !passCookie) out.headers.set('Cache-Control', 'no-store');
  return out;
}
