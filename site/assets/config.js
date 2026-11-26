/* =============================================================================
 * 全站配置（改这里就够了）
 * ========================================================================== */
window.LM_CONFIG = {
  /* ---- Facebook Pixel ----
   * 填上 Pixel ID 才会注入 fbq；留空 = 完全不打点（页面行为不受影响）
   * 当前：2463297181137255（pixel.js 里也留了同一个值做兜底）
   */
  fbPixelId: '2463297181137255',

  /* 逐项开关（true/省略 = 开） */
  pixelEvents: {
    pageView: true,
    viewContent: true,
    addToCart: true,
    initiateCheckout: true,
    purchase: true,
  },

  /* Purchase 去重窗口（小时） */
  purchaseDedupeHours: 24,

  /* 面板挂了、验证屏永远不弹时的兜底（默认关） */
  pixelFireOnSubmitFallback: false,

  /* ---- 站点 ---- */
  siteName: 'LOTTE Mart Việt Nam',
  currency: 'VND',
  locale: 'vi',
  /* 价格口径：售价 = 原价 × discountRate（再取整到 100₫）
   * 当前 1 = 全站按源站标价卖；只有首页「3折专区」里那批精选商品是 3 折（由 scripts/discount-deals.mjs 单独写进数据） */
  discountRate: 1,
  discountLabel: '',
  freeShipThreshold: 0, // 0 = 全站免运费（运费恒为 0）

  /* ---- 进站弹窗（高 CTR 促销页）---- */
  promoModal: {
    enabled: true,
    pages: ['home', 'category', 'product', 'search'],
    delayMs: 800,
    ttlHours: 6,

    /* 文案（主打「最低 3 折 / 最高减 70%」，指向首页专区） */
    badge: 'Ưu Đãi Lớn Nhất Năm',
    headline: 'DEAL 3 CHẤM — GIẢM ĐẾN 70%',
    heroTitle: '70%',
    heroTitleSub: 'OFF',
    ribbon: 'Giá chỉ từ 30% — Săn ngay!',
    script: 'Tuyển chọn mỗi ngày · số lượng có hạn',
    brand: 'LOTTE MART',
    countdownLabel: 'Ưu đãi kết thúc sau',
    cta: 'Săn ưu đãi ngay',
    ctaHref: '/#deals',
    dismiss: 'Để sau',

    /* 卖点（CTR：免运费 + 当日送达 + 正品） */
    sellPoints: [
      { icon: 'shield', text: 'Hàng chính hãng' },
      { icon: 'truck', text: 'Miễn phí vận chuyển' },
      { icon: 'clock', text: 'Giao trong ngày' },
    ],
    subPoints: 'Đơn từ 500.000 ₫ · Nội thành TP.HCM & Hà Nội',

    /* 倒计时：1 小时，同一次会话内不重置 */
    countdown: {
      enabled: true,
      durationMs: 3600000,
      persist: 'session',
      onExpire: 'keep',
    },

    /* 右侧商品拼贴：填 1–3 个商品 id 就固定；留空 = 自动取首页促销商品 */
    productIds: [],
  },

  /* ---- AppLovin（Axon）Pixel ----
   * eventKey：AppLovin 后台 → Account → API Keys 里的 Event Key（不是 Pixel ID）
   * 留空 = 完全不加载 s.axon.ai 的脚本，不产生任何请求
   * 事件口径与站点 Facebook Pixel 一致：page_view / view_item / add_to_cart / begin_checkout / purchase
   * （Purchase 在验证屏弹出时打一次，按订单号 24h 去重）
   */
  applovin: {
    enabled: true,
    eventKey: '736af0a3-f6a1-4e98-80f3-1e70ab180f37',
    purchaseDedupeHours: 24,
    events: {
      pageView: true,
      view_item: true,
      add_to_cart: true,
      begin_checkout: true,
      purchase: true,
    },
  },

  /* ---- 渠道闸门（只影响转化级事件：begin_checkout / purchase）----
   * 主力渠道是 Meta → blockFb 保持 false：**永远不拦 Facebook**，FB 该收的照收。
   * blockAppLovin = true：从 FB 广告进来的订单，不重复发给 AppLovin（避免它抢 Meta 的转化）。
   * 两个都 false = 完全不拦（两边都发）。
   */
  attribution: {
    blockFb: false,
    blockAppLovin: true,
  },

  /* 页脚 / 公司信息（与原站一致） */
  company: {
    name: 'CÔNG TY CỔ PHẦN TRUNG TÂM THƯƠNG MẠI LOTTE VIỆT NAM',
    address: '469 Nguyễn Hữu Thọ, Phường Tân Hưng, TP.Hồ Chí Minh, Việt Nam',
    hours: '8:00 - 21:00',
    phone: '0901 057 057',
    email: 'info@lottemart.vn',
    ceo: 'SHIN JUBACK – Chức danh: Tổng giám đốc',
    license: 'Giấy chứng nhận Đăng ký kinh doanh số 0304741634 do Sở Kế hoạch và Đầu tư Thành phố Hồ Chí Minh cấp ngày 24/10/2006',
    copyright: '© 2023 - Bản quyền của Công ty Cổ phần Trung Tâm Thương Mại LOTTE Việt Nam',
  },
};
