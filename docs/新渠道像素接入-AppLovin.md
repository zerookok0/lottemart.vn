# 新渠道像素（AppLovin / Axon）接入逻辑 —— 可复用到任意落地页

> 这份文档独立于本项目，任何落地页（静态站、WordPress、Shopify 之外的自己搭的页面）都能照抄。
> 本项目里的实现：`site/assets/axpixel.js`（逻辑）+ 每个页面 head 里的官方片段。
> 目的：**和 Facebook Pixel 并行跑，各自记账、互不抢单、同一用户 24h 只计 1 次购买。**

---

## 0. 一图看懂

```
用户在页面上的行为
   │
   ├─ 站点自己的事件源（本项目是 site/assets/pixel.js）
   │      │  每打一个 FB 事件 → 同时 window.dispatchEvent('lm:px', {name, params})
   │      │                    并写一份 bridge 缓冲（给晚加载的像素回放）
   │      ▼
   ├─ axpixel.js（新渠道）
   │      · 把 FB 事件名映射成 Axon 事件名
   │      · purchase 单独处理（验证屏弹出那一刻，按用户 24h 去重）
   │      · 组装 Axon 要求的 items[] / user_data{} / transaction_id
   │      ▼
   └─ axon('track', '<event>', data)
          ├─ POST https://b.applovin.com/v1/pixel     ← 事件真正上报的地方
          ├─ GET  https://b.quantarelay.net/v1/pixel  ← 备用通道
          └─ GET  https://cm.g.doubleclick.net/pixel  ← Google cookie 匹配
```

**关键认知**：`s.axon.ai/pixel.js` 只是“脚本”，真正上报事件的是 `b.applovin.com`。
CSP 只放行 `s.axon.ai` 是**不够的**，事件会被静默丢掉（本项目踩过这个坑）。

---

## 1. 必装：官方片段（放进每个页面 `<head>` 末尾）

后台只给一个 **像素 ID / Event Key**（UUID 形状，如 `736af0a3-...`），填进去即可。

```html
<script>
  var AXON_EVENT_KEY = '你的像素ID';
  window.AXON_EVENT_KEY = AXON_EVENT_KEY;
  !(function (e, r) {
    var t = ['https://s.axon.ai/pixel.js'];
    if (!e.axon) {
      var a = (e.axon = function () {
        a.performOperation ? a.performOperation.apply(a, arguments) : a.operationQueue.push(arguments);
      });
      a.operationQueue = [];
      a.ts = Date.now();
      a.eventKey = AXON_EVENT_KEY;
      for (var n = r.getElementsByTagName('script')[0], o = 0; o < t.length; o++) {
        var i = r.createElement('script');
        i.async = !0;
        i.src = t[o];
        n.parentNode.insertBefore(i, n);
      }
    }
  })(window, document);
  axon('init');
</script>
```

要点：

1. **必须写进 HTML 源码**（不能只用 JS 动态注入）——AppLovin 后台「检测网站是否装像素」是抓源码找 `AXON_EVENT_KEY` 和 `s.axon.ai/pixel.js`。
2. `axon('init')` 在脚本还没下载完时调用会进队列，脚本加载后自动补齐，不用等。
3. 同一页面**只能有一份**。若页面里另有 `<script src="axpixel.js">`，加载器要检测已有的 `script[src*="axpixel.js"]` 再注入，否则会双份监听 → 事件翻倍。

---

## 2. CSP 必须放行的域名

```
script-src  'self' 'unsafe-inline' https://s.axon.ai
connect-src 'self' https://s.axon.ai https://*.axon.ai
            https://b.applovin.com https://b.quantarelay.net https://cm.g.doubleclick.net
```

少任何一个都会出现「脚本加载了、事件一个没有」：
- 少 `s.axon.ai`（script-src）→ 脚本 404/被拦
- 少 `b.applovin.com`（connect-src）→ **事件全部丢**（最常见）
- 少 `cm.g.doubleclick.net` → Google cookie 匹配失败，不影响主事件，但 helper 里会有黄色告警

---

## 3. 事件清单与映射

| 站点事件（FB 口径） | Axon 事件 | 必填 | 建议参数 |
|---|---|---|---|
| PageView | `page_view` | — | 无 |
| ViewContent | `view_item` | `items` | `currency` `value` |
| AddToCart | `add_to_cart` | `items` | `currency` `value` |
| InitiateCheckout | `begin_checkout` | `currency` `items` `value` | `user_data` |
| Purchase | `purchase` | `currency` `items` `shipping` `tax` `transaction_id` `value` `user_data` | `is_new_customer` `discount_applications` |

### items[] 结构（Axon item）

```json
{ "item_id": "8602", "item_name": "Nấm Mỡ Nâu 200G",
  "price": 89000, "quantity": 1, "item_brand": "365 Fresh", "discount": 0 }
```

- `item_id` 必填（字符串）
- `price` 是**单价**，`quantity` 是件数；`value` 一般 = Σ(price × quantity)
- **不要传 `image_url`**，除非你的图是 `.png/.jpg/.jpeg`；`.webp` 会被判无效
- `item_category_id` 是 AppLovin 自己的品类树 ID，没有映射就**别传**（传错更糟）

---

## 4. purchase 的 6 个坑（按踩坑顺序）

1. **`user_data` 必须是对象**
   ```json
   { "user_data": { "email": "a@b.com", "phone": "0901234567", "user_id": "LMXXXXXX" } }
   ```
   不是把 `email` 平铺在事件参数上。平铺的话后台显示 `user_data: NULL`、红色「缺少用户邮箱」。
   `email / phone / user_id` 至少有一个；`email` 要小写（AppLovin 帮你哈希）。
   **拿不到邮箱时用 `user_id` 兜底**（匿名 id 也行，≥6 字符），这样不会判红。

2. **`shipping` / `tax` 必填**：免运费就写 `0`，价格含税就写 `0`，别省字段。

3. **`transaction_id` 唯一**：每单一个新号。如果订单号复用了上一单的，会被当重复单。

4. **`value` = 商品小计**（不含税不含运费）。

5. **触发时机**：和 FB 保持一致（本项目在「验证屏弹出」那一刻），保证两个渠道看到同一笔。

6. **早发的事件会丢**：新渠道脚本通常是异步/延迟加载，比站点自己的 JS 晚到。要加**事件缓冲 + 回放**：
   ```js
   // 事件源（站点 pixel.js）
   px.bridge.push({ name, params, at: Date.now() });
   window.dispatchEvent(new CustomEvent('lm:px', { detail: { name, params } }));
   // 新渠道脚本加载完：回放 at <= 自己 attach 时间的那些事件
   ```

---

## 5. 去重：按用户，不按订单（重点）

| 方案 | 键 | 结果 |
|---|---|---|
| ❌ 按订单号 | `order_number` | 用户重复下单 = 多次购买；订单号一换就重复计数 |
| ✅ **按用户** | `指纹 + IP`（FB）/ 持久 `user_id`（Axon） | 同一用户 24h 内提交几次都只算 1 次；退出再回来也不重复 |

实现（本项目）：

```js
// FB 侧 site/assets/pixel.js
px.key = async () => fnv1a(`${px.fingerprint()}|${await px.ip()}`);   // 不含订单号
// Axon 侧 site/assets/axpixel.js
const userKey = userData().user_id || userData().email || 'unknown';
const last = Number(map[userKey] || 0);
if (last && Date.now() - last < 24 * 3600 * 1000) return { ok: false, why: 'dedupe' };
```

- 窗口：`24h`（本项目），可按需改 30 天
- 存哪：`localStorage`（+ FB 侧另写 cookie），**清缓存/换浏览器/无痕会重新计**，这是纯前端方案的物理上限
- 手动清（测试用）：`LM.pixel.reset()` / `LM.ax.reset()`

---

## 6. 渠道闸门（可选，但建议）

两个像素都在页面上时，谁的转化算谁的？靠**点击参数**判断来源，不要靠像素自己写的 cookie：

| 渠道 | 来源信号 |
|---|---|
| Facebook | URL 的 `fbclid` |
| AppLovin | URL 的 `alart` / `aleid` |

```js
// 进站时记一次，存 30 天
const q = new URLSearchParams(location.search);
const hitFb = q.has('fbclid');
const hitAl = q.has('alart') || q.has('aleid');
```

转化级事件（`begin_checkout` / `purchase`）的放行规则，做成配置：

```js
attribution: {
  blockFb: false,        // 主力渠道：永远不拦 FB
  blockAppLovin: true,   // 从 FB 广告进来的单，不让 AppLovin 抢
}
```

> 千万不要用 `_fbp` / `_axwrt` 这两个 cookie 判断来源：它们是像素自己写的，两个像素各跑一次后都会存在，闸门就永远敞开。

**另外**：广告点击参数 `aleid` / `alart` 必须原样保留到落地页 URL，任何 301/短链丢参数都会让归因失效（表现：点击正常、转化几乎为 0）。

---

## 7. 用户识别增强（可选）

Axon 会写一个 `_axwrt` cookie。官方建议在服务端把它回写成一年期第一方 `axwrt`：

```js
// Cloudflare Pages Functions / 任意后端
const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)_axwrt=([^;]+)/);
if (m) res.headers.append('Set-Cookie', `axwrt=${m[1]}; Path=/; Max-Age=31536000; SameSite=Lax`);
```

---

## 8. 验证清单（按顺序做，一次到位）

1. **源码层**：`view-source:https://你的域名/` 搜索 `AXON_EVENT_KEY` → 有
2. **脚本层**：F12 → Network 过滤 `axon` → `s.axon.ai/pixel.js` 200
3. **上报层**：Console 执行 `window.axon('track','page_view')` → Network 出现 **POST `b.applovin.com/v1/pixel`**
4. **后台层**：AppLovin → 像素 → 点「刷新」，`页面浏览量 / 查看项目` 应在几分钟内变绿
5. **事件层**：装 **AppLovin Pixel Helper** 扩展，走一遍 首页 → 商品 → 加购 → 结账 → 提交
   - 绿 = 字段齐全
   - 橙 = 缺推荐字段（`item_category_id` / `image_url`），不算错
   - 红 = 缺必填（`user_data` / `shipping` / `tax` / `transaction_id`）
6. **控制台自查**（本项目）：
   ```js
   LM.ax.state()                       // 是否启用、各事件计数、去重表
   LM.ax.log.filter(x=>x.name==='purchase').pop()   // purchase 的实际 payload
   ```

---

## 9. 最小可抄模板（单个落地页）

```html
<!-- head -->
<script>
  var AXON_EVENT_KEY = '你的像素ID';
  !(function (e, r) { /* 官方片段，见 §1 */ })(window, document);
  axon('init');
</script>

<script>
  // 页面浏览
  axon('track', 'page_view');

  // 商品页
  axon('track', 'view_item', {
    currency: 'VND',
    value: 89000,
    items: [{ item_id: '8602', item_name: 'Nấm Mỡ Nâu 200G', price: 89000, quantity: 1 }],
  });

  // 下单（验证屏弹出 / 支付成功那一刻，按用户 24h 去重）
  function trackPurchase(order, items, subtotal, user) {
    var key = 'axu_' + (user.user_id || user.email || 'anon');
    var last = Number(localStorage.getItem(key) || 0);
    if (last && Date.now() - last < 24 * 3600 * 1000) return;      // 同一用户 24h 只算 1 次
    axon('track', 'purchase', {
      currency: 'VND',
      items: items,                    // [{item_id, item_name, price, quantity}]
      shipping: 0,
      tax: 0,
      transaction_id: order,
      value: subtotal,
      is_new_customer: true,
      discount_applications: [],
      user_data: { email: user.email, phone: user.phone, user_id: user.user_id },
    });
    localStorage.setItem(key, String(Date.now()));
  }
</script>
```

---

## 10. 本项目实现索引

| 文件 | 作用 |
|---|---|
| `site/assets/axpixel.js` | 新渠道全部逻辑：映射、purchase、去重、user_data、闸门、`LM.ax.*` 调试 |
| `site/assets/pixel.js` | Facebook 主像素；额外做 `lm:px` 广播 + `px.bridge` 缓冲 |
| `site/assets/app.js` | `LM.src`（来源判定）、按需加载 axpixel、控制台打印构建号 |
| `site/assets/config.js` | `applovin{ eventKey, events }`、`attribution{ blockFb, blockAppLovin }` |
| `site/ax-check.html` → `/ax-check` | 独立自检页：手动打 page_view / add_to_cart / purchase |
| `scripts/probe-pixel.mjs` | 无头浏览器探针：打印脚本/事件/请求/失败原因 |
| CSP 三处 | `public/_headers`、`functions/_middleware.js`、`scripts/serve.mjs` |
