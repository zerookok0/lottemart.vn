/* =============================================================================
 * 全站配置（改这里就够了）
 * ========================================================================== */
window.LM_CONFIG = {
  /* ---- Facebook Pixel ----
   * 填上 Pixel ID 才会注入 fbq；留空 = 完全不打点（页面行为不受影响）
   * 当前：1199367782421489（pixel.js 里也留了同一个值做兜底）
   */
  fbPixelId: '1199367782421489',

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
  /* 价格口径：售价 = 原价 × discountRate（再取整到 100₫） */
  discountRate: 0.6,
  discountLabel: '-40%',
  freeShipThreshold: 500000,

  /* ---- 进站弹窗（高 CTR 促销页）---- */
  promoModal: {
    enabled: true,
    pages: ['home', 'category', 'product', 'search'],
    delayMs: 800,
    ttlHours: 6,

    /* 文案 */
    badge: 'Ưu Đãi Đặc Biệt',
    heroTitle: '50%',
    heroTitleSub: 'OFF',
    ribbon: 'Sắm ngay hôm nay!',
    script: 'Thương hiệu Hàn Quốc\nđược yêu thích tại Việt Nam',
    brand: 'LOTTE MART',
    countdownLabel: 'Chương trình kết thúc sau',
    cta: 'Mua ngay',
    ctaHref: '/vi-nsg/collection/uu-dai-hot',
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
