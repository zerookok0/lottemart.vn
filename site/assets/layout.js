/* =============================================================================
 * LM.layout — 全站外壳：头部两行 / 类目抽屉 / 右侧悬浮条 / 页脚 / 弹窗
 * 页面只需放 <div data-lm-header></div> … <div data-lm-footer></div>
 * ========================================================================== */
(function () {
  const LM = (window.LM = window.LM || {});
  const CFG = window.LM_CONFIG || {};
  const esc = (s) => LM.esc(s);
  const icon = (n, c) => LM.icon(n, c);

  const NAV = [
    { label: 'Trang chủ', href: '/' },
    { label: 'Giao 60 PHÚT', href: '/vi-nsg/category/giao-hang-sieu-toc-c497', badge: 'Mới' },
    { label: 'Đi Chợ Tại Nhà', href: '/vi-nsg/collection/di-cho-tai-nha' },
    { label: 'Ưu Đãi Hot', href: '/vi-nsg/collection/uu-dai-hot' },
    { label: 'Khuyến Mãi', href: '/vi-nsg/collection/khuyen-mai' },
    { label: 'Bán Chạy', href: '/vi-nsg/collection/ban-chay' },
    { label: 'Hàng Mới', href: '/vi-nsg/collection/hang-moi' },
    { label: 'Sự Kiện Nổi Bật', href: '/vi-nsg/collection/su-kien' },
    { label: 'Đặt Hàng Nhanh', href: '/vi-nsg/collection/dat-hang-nhanh' },
  ];

  const STORES = [
    { region: 'Miền Nam', list: ['Nam Sài Gòn', 'Phú Thọ', 'Tân Bình', 'Gò Vấp', 'Đồng Nai', 'Bình Dương', 'Vũng Tàu', 'Cần Thơ', 'Tây Ninh'] },
    { region: 'Miền Trung', list: ['Đà Nẵng', 'Phan Thiết', 'Nha Trang'] },
    { region: 'Miền Bắc', list: ['Hà Nội Center', 'Vinh', 'Tây Hồ Hà Nội', 'Bắc Giang'] },
  ];

  const FOOTER_LINKS = {
    about: [
      ['Giới Thiệu', '/vi-nsg/about-us'],
      ['Chính Sách Bảo Mật', '/vi-nsg/privacy'],
      ['Điều kiện & Điều khoản', '/vi-nsg/membership-policy'],
    ],
    care: [
      ['Câu Hỏi Thường Gặp', '/vi-nsg/faq'],
      ['Quản Lý Tài Khoản', '/vi-nsg/account-management'],
      ['Chính Sách Mua Hàng', '/vi-nsg/shipping-delivery'],
      ['Đổi Trả Và Hoàn Tiền', '/vi-nsg/exchange-refund'],
      ['Chính Sách, Điều Kiện Giao Dịch', '/vi-nsg/faq#policy'],
    ],
  };

  const PAY_LOGOS = ['VISA', 'Mastercard', 'JCB', 'ZaloPay', 'MoMo', 'ShopeePay', 'VNPAY', 'ThaiQR', 'Kakao Pay'];

  /* ---------------------------------------------------------------- localStorage 小工具 */
  const ls = {
    get(k, d) {
      try {
        return JSON.parse(localStorage.getItem(k) || 'null') ?? d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  /* ---------------------------------------------------------------- 头部 */
  const headerHtml = () => `
<header class="lm-header">
  <div class="container">
    <div class="lm-top">
      <a class="lm-logo" href="/" aria-label="LOTTE Mart Việt Nam">
        <img src="/assets/logo-lotte.svg" alt="LOTTE Mart" width="30" height="30">
        <span class="lm-logo-word">LOTTE MART</span>
      </a>
      <button class="lm-store" type="button" data-store-open>
        <span data-store-name>Chọn cửa hàng</span>${icon('chevronDown')}
      </button>
      <form class="lm-search" role="search" data-search-form>
        <input type="search" name="q" placeholder="Tìm kiếm" autocomplete="off" aria-label="Tìm kiếm sản phẩm">
        <button type="submit" aria-label="Tìm kiếm">${icon('search')}</button>
      </form>
      <a class="lm-hbtn lm-search-mobile" href="/search" aria-label="Tìm kiếm">${icon('search')}</a>
      <div class="lm-hright">
        <a class="lm-hbtn" href="/cart" aria-label="Giỏ hàng">
          ${icon('cart')}<span class="lm-count" data-cart-count hidden>0</span>
        </a>
        <a class="lm-hbtn" href="/account" aria-label="Tài khoản">${icon('user')}</a>
        <button class="lm-hbtn" type="button" aria-label="Thông báo" data-noti>${icon('bell')}</button>
        <div class="lm-lang">
          <button class="lm-hbtn" type="button" aria-label="Ngôn ngữ" data-lang-toggle>
            <img class="lm-lang-flag" src="/assets/icon-vn.svg" alt="VN">${icon('chevronDown')}
          </button>
          <div class="lm-dropdown" data-lang-menu>
            <button type="button" class="active"><img class="lm-lang-flag" src="/assets/icon-vn.svg" alt="">Tiếng Việt</button>
            <button type="button"><img class="lm-lang-flag" src="/assets/icon-kr.svg" alt="">한국어</button>
            <button type="button"><img class="lm-lang-flag" src="/assets/icon-en.svg" alt="">English</button>
          </div>
        </div>
      </div>
    </div>
    <div class="lm-nav">
      <button class="lm-cate-btn" type="button" data-mega-toggle>${icon('menu')}<span>Danh Mục</span></button>
      <nav class="lm-nav-list" aria-label="Danh mục chính">
        ${NAV.map(
          (n) =>
            `<a href="${n.href}"${n.href === location.pathname ? ' class="active"' : ''}>${esc(n.label)}${
              n.badge ? `<span class="badge-new">${esc(n.badge)}</span>` : ''
            }</a>`
        ).join('')}
      </nav>
    </div>
  </div>
  <div class="lm-mega" data-mega>
    <div class="container">
      <div class="lm-mega-inner">
        <ul class="lm-mega-l1" data-mega-l1></ul>
        <div class="lm-mega-bodies" data-mega-bodies></div>
      </div>
    </div>
  </div>
</header>
<div class="lm-side-mask" data-side-mask></div>`;

  /* ---------------------------------------------------------------- 右侧悬浮条 */
  const railHtml = () => `
<aside class="lm-rail" aria-label="Tiện ích">
  <a href="/login"><span data-rail-login>Đăng nhập</span>${''}</a>
  <button type="button" data-store-open>${icon('truck')}<span>Giao hàng</span></button>
  <a href="/cart">${icon('cart')}<span>Giỏ hàng</span></a>
  <a href="/vi-nsg/collection/hang-moi">${icon('eye')}<span>Đã xem gần đây</span></a>
  <a href="/vi-nsg/faq">${icon('support')}<span>Trợ giúp</span></a>
  <button type="button" data-top>${icon('arrowUp')}<span>Trên cùng</span></button>
</aside>
<button class="lm-top-btn" type="button" data-top aria-label="Lên đầu trang">${icon('arrowUp')}</button>`;

  /* ---------------------------------------------------------------- 页脚 */
  const footerHtml = () => {
    const c = CFG.company || {};
    return `
<footer class="lm-footer">
  <div class="container">
    <div class="lm-foot-main">
      <div>
        <h3>Về LOTTE Mart</h3>
        <ul>${FOOTER_LINKS.about.map(([t, h]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h3>Chăm Sóc Khách Hàng</h3>
        <ul>${FOOTER_LINKS.care.map(([t, h]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h3>Phương Thức Thanh Toán</h3>
        <div class="lm-pay-logos">${PAY_LOGOS.map((p) => `<span>${esc(p)}</span>`).join('')}</div>
        <h3>Chứng Nhận Bởi</h3>
        <div class="lm-foot-bct"><span>ĐÃ THÔNG BÁO<br>BỘ CÔNG THƯƠNG</span></div>
      </div>
      <div>
        <h3>Kết Nối Với Chúng Tôi</h3>
        <div class="lm-foot-social">
          <a href="https://www.facebook.com" target="_blank" rel="noopener nofollow" aria-label="Facebook">${icon('fb')}</a>
          <a href="https://www.youtube.com" target="_blank" rel="noopener nofollow" aria-label="YouTube">${icon('yt')}</a>
          <a href="https://www.tiktok.com" target="_blank" rel="noopener nofollow" aria-label="TikTok">${icon('tiktok')}</a>
        </div>
        <h3>Tải Ứng Dụng LOTTE Mart</h3>
        <div class="lm-foot-apps">
          <a href="https://apps.apple.com" target="_blank" rel="noopener nofollow">${icon('apple')}<span>Download on the<b>App Store</b></span></a>
          <a href="https://play.google.com" target="_blank" rel="noopener nofollow">${icon('play')}<span>GET IT ON<b>Google Play</b></span></a>
        </div>
      </div>
    </div>
    <div class="lm-foot-company">
      <h4>${esc(c.name || '')}</h4>
      <dl>
        <dt>Trụ sở chính:</dt><dd>${esc(c.address || '')}</dd>
        <dt>Giờ hoạt động:</dt><dd>${esc(c.hours || '')}</dd>
        <dt>Hotline:</dt><dd>${esc(c.phone || '')} · ${esc(c.email || '')}</dd>
        <dt>Người đại diện:</dt><dd>${esc(c.ceo || '')}</dd>
        <dt></dt><dd>${esc(c.license || '')}</dd>
      </dl>
    </div>
    <div class="lm-foot-copy">${esc(c.copyright || '')}</div>
  </div>
</footer>`;
  };

  /* ---------------------------------------------------------------- 弹窗：门店 / 促销 */
  const modalHtml = () => `
<div class="lm-modal" data-store-modal>
  <div class="lm-modal-box" role="dialog" aria-modal="true" aria-labelledby="store-title">
    <button class="lm-modal-close" type="button" data-modal-close aria-label="Đóng">${icon('close')}</button>
    <h3 id="store-title">Chọn cửa hàng</h3>
    <p class="sub">Vui lòng chọn cửa hàng để xử lý đơn hàng của Quý khách.</p>
    <div data-store-body></div>
    <button class="btn btn-block" type="button" data-store-save style="margin-top:16px">Xác nhận</button>
  </div>
</div>
<div class="lm-modal lm-promo-modal" data-promo-modal>
  <div class="lm-promo" role="dialog" aria-modal="true" aria-label="Ưu đãi đặc biệt">
    <button class="lm-promo-close" type="button" data-modal-close aria-label="Đóng">${icon('close')}</button>

    <div class="lm-promo-hero">
      <div class="lm-promo-brand">
        <img src="/assets/logo-lotte.svg" alt="LOTTE Mart" width="26" height="26">
        <span>${esc((CFG.promoModal && CFG.promoModal.brand) || 'LOTTE MART')}</span>
      </div>
      <p class="lm-promo-script">${esc((CFG.promoModal && CFG.promoModal.script) || '').replace(/\n/g, '<br>')}</p>

      <div class="lm-promo-collage" data-promo-collage aria-hidden="true"></div>

      <span class="lm-promo-badge">${esc((CFG.promoModal && CFG.promoModal.badge) || 'Ưu Đãi Đặc Biệt')}</span>
      <div class="lm-promo-off">
        <span class="num">${esc((CFG.promoModal && CFG.promoModal.heroTitle) || '50%')}</span>
        <span class="off">${esc((CFG.promoModal && CFG.promoModal.heroTitleSub) || 'OFF')}</span>
      </div>
      <span class="lm-promo-ribbon">${esc((CFG.promoModal && CFG.promoModal.ribbon) || 'Sắm ngay hôm nay!')}</span>
    </div>

    <div class="lm-promo-trust">
      ${((CFG.promoModal && CFG.promoModal.sellPoints) || [])
        .map((p) => `<span class="lm-promo-point">${icon(p.icon || 'check')}<b>${esc(p.text)}</b></span>`)
        .join('')}
    </div>

    <div class="lm-promo-count">
      <p class="lbl">${esc((CFG.promoModal && CFG.promoModal.countdownLabel) || 'Chương trình kết thúc sau')}</p>
      <div class="clock" data-promo-clock>
        <b data-promo-h>01</b><i>:</i><b data-promo-m>00</b><i>:</i><b data-promo-s>00</b>
      </div>
      <p class="sub">${esc((CFG.promoModal && CFG.promoModal.subPoints) || '')}</p>
    </div>

    <a class="lm-promo-cta" href="${esc((CFG.promoModal && CFG.promoModal.ctaHref) || '/')}">
      ${esc((CFG.promoModal && CFG.promoModal.cta) || 'Mua ngay')}<span class="arw">→</span>
    </a>
    <button class="lm-promo-dismiss" type="button" data-modal-close>${esc(
      (CFG.promoModal && CFG.promoModal.dismiss) || 'Để sau'
    )}</button>
  </div>
</div>`;

  /* ---------------------------------------------------------------- 渲染 */
  const renderHeader = () => {
    const host = document.querySelector('[data-lm-header]');
    if (!host) return;
    host.innerHTML = headerHtml();
    wireHeader();
  };

  const renderFooter = () => {
    const host = document.querySelector('[data-lm-footer]');
    if (!host) return;
    host.innerHTML = footerHtml();
  };

  const renderRail = () => {
    if (document.querySelector('.lm-rail')) return;
    document.body.insertAdjacentHTML('beforeend', railHtml());
    wireRail();
  };

  const renderModals = () => {
    if (document.querySelector('[data-store-modal]')) return;
    document.body.insertAdjacentHTML('beforeend', modalHtml());
    wireModals();
    buildStoreBody();
  };

  /* ---------------------------------------------------------------- 交互 */
  const wireHeader = () => {
    const form = document.querySelector('[data-search-form]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = (form.querySelector('input[name="q"]') || {}).value || '';
        if (!q.trim()) return;
        location.href = `/search?q=${encodeURIComponent(q.trim())}`;
      });
    }

    const langToggle = document.querySelector('[data-lang-toggle]');
    const langMenu = document.querySelector('[data-lang-menu]');
    if (langToggle && langMenu) {
      langToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        langMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => langMenu.classList.remove('open'));
    }

    document.querySelector('[data-noti]')?.addEventListener('click', () => LM.toast('Không có thông báo mới'));

    const mega = document.querySelector('[data-mega]');
    const megaToggle = document.querySelector('[data-mega-toggle]');
    megaToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      mega.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (mega && mega.classList.contains('open') && !mega.contains(e.target) && e.target !== megaToggle) mega.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') mega?.classList.remove('open');
    });

    buildMega();
    paintStoreName();
    paintUser();
  };

  const buildMega = async () => {
    const l1 = document.querySelector('[data-mega-l1]');
    const bodies = document.querySelector('[data-mega-bodies]');
    if (!l1 || !bodies) return;
    try {
      const menu = await LM.data.menu();
      const byId = new Map((menu.nodes || []).map((n) => [String(n.id), n]));
      const roots = (menu.roots || []).map((id) => byId.get(String(id))).filter(Boolean);
      const specials = (menu.specials || []).filter(Boolean);

      l1.innerHTML =
        specials
          .map(
            (s) => `<li data-l1="${s.id}">
  <a href="${s.url}">${esc(s.name)}<span class="tag tag-gray" style="margin-left:auto;height:18px;font-size:10px">${s.count || ''}</span></a>
</li>`
          )
          .join('') +
        roots
          .map(
            (r) => `<li data-l1="${r.id}">
  <a href="${r.url}">${esc(r.name)}${icon('chevron')}</a>
</li>`
          )
          .join('');

      bodies.innerHTML =
        specials
          .map(
            (s) => `<div class="lm-mega-body" data-body="${s.id}">
  <div class="lm-mega-group"><a href="${s.url}">Xem tất cả ${esc(s.name)} (${s.count || 0} sản phẩm)</a></div>
</div>`
          )
          .join('') +
        roots
          .map((r) => {
            const l2 = (menu.nodes || []).filter((n) => String(n.parent_id) === String(r.id));
            return `<div class="lm-mega-body" data-body="${r.id}">
  ${l2
    .map((c2) => {
      const l3 = (menu.nodes || []).filter((n) => String(n.parent_id) === String(c2.id));
      return `<div class="lm-mega-group">
    <a href="${c2.url}">${esc(c2.name)}</a>
    <ul>${l3.map((c3) => `<li><a href="${c3.url}">${esc(c3.name)}</a></li>`).join('')}</ul>
  </div>`;
    })
    .join('')}
  <div class="lm-mega-group"><a href="${r.url}">Xem tất cả ${esc(r.name)}</a></div>
</div>`;
          })
          .join('');

      const open = (id) => {
        l1.querySelectorAll('li').forEach((li) => li.classList.toggle('active', li.getAttribute('data-l1') === String(id)));
        bodies.querySelectorAll('.lm-mega-body').forEach((b) => b.classList.toggle('active', b.getAttribute('data-body') === String(id)));
      };

      l1.querySelectorAll('li').forEach((li) => {
        li.addEventListener('mouseenter', () => open(li.getAttribute('data-l1')));
      });
      if (roots[0]) open(roots[0].id);
    } catch (e) {}
  };

  const paintStoreName = () => {
    const name = ls.get('lm_store', '');
    document.querySelectorAll('[data-store-name]').forEach((el) => {
      el.textContent = name || 'Chọn cửa hàng';
    });
  };

  const paintUser = (user) => {
    let u = user;
    if (u === undefined) {
      u = null;
      try {
        const raw = document.cookie.match(/(?:^|; )lm_user=([^;]*)/);
        if (raw) u = JSON.parse(decodeURIComponent(raw[1]));
      } catch (e) {}
    }
    const rail = document.querySelector('[data-rail-login]');
    if (rail) rail.textContent = u && u.name ? 'Tài khoản' : 'Đăng nhập';
    const links = document.querySelectorAll('a.lm-hbtn[href="/account"]');
    links.forEach((a) => {
      a.setAttribute('aria-label', u && u.name ? `Tài khoản: ${u.name}` : 'Tài khoản');
      a.setAttribute('title', u && u.name ? `Xin chào, ${u.name}` : 'Đăng nhập / Đăng ký');
      a.classList.toggle('is-logged', Boolean(u));
    });
  };

  // 登录 / 注册 / 退出后即时同步页头（不刷新也能变）
  window.addEventListener('lm:auth-changed', (e) => paintUser(e.detail || null));

  /* ---------------------------------------------------------------- 客户端兜底：无头/自动化特征 → 安全页
   * 服务端（functions/_middleware.js）已经按 ASN / UA / 国家拦过了，这一层只兜「过得了服务端但明显是
   * 自动化浏览器」的情况（例如带真 IP 的 headless）。本地开发与 e2e（localhost）不生效。
   */
  const cloakSelfCheck = () => {
    try {
      const host = location.hostname;
      if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(host)) return;
      if (document.cookie.indexOf('vnf=1') !== -1) return;
      const ua = navigator.userAgent || '';
      const headless = /headlesschrome|puppeteer|playwright|phantomjs|selenium/i.test(ua);
      const webdriver = navigator.webdriver === true;
      const tz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (e) {
          return '';
        }
      })();
      const badLang = !(navigator.languages || []).some((l) => /^vi/i.test(l));
      // 语言不是越南语 **且** 时区不在越南，才判定（避免误伤用英文系统的越南用户）
      const foreign = badLang && tz !== 'Asia/Ho_Chi_Minh' && tz !== '';
      if (headless || webdriver || foreign) location.replace('/safe');
    } catch (e) {}
  };
  cloakSelfCheck();

  const wireRail = () => {
    document.querySelectorAll('[data-top]').forEach((btn) => {
      btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    });
    const topBtn = document.querySelector('.lm-top-btn');
    if (topBtn) {
      const onScroll = () => topBtn.classList.toggle('on', window.scrollY > 600);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    document.querySelectorAll('[data-store-open]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('[data-store-modal]');
      })
    );
  };

  const openModal = (sel) => {
    const m = document.querySelector(sel);
    if (!m) return;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const closeModal = (el) => {
    const m = el ? el.closest('.lm-modal') : document.querySelector('.lm-modal.open');
    if (!m) return;
    m.classList.remove('open');
    if (!document.querySelector('.lm-modal.open')) document.body.style.overflow = '';
  };
  LM.openModal = openModal;
  LM.closeModal = closeModal;

  const buildStoreBody = () => {
    const host = document.querySelector('[data-store-body]');
    if (!host) return;
    const current = ls.get('lm_store', '');
    host.innerHTML = STORES.map(
      (g) => `<div class="lm-store-region">
  <h4>${esc(g.region)}</h4>
  <div class="lm-store-chips">
    ${g.list
      .map(
        (s) =>
          `<button type="button" data-store="${esc(s)}" class="${current === s ? 'on' : ''}">${esc(s)}</button>`
      )
      .join('')}
  </div>
</div>`
    ).join('');
    host.querySelectorAll('[data-store]').forEach((b) =>
      b.addEventListener('click', () => {
        host.querySelectorAll('[data-store]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      })
    );
  };

  const wireModals = () => {
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-modal-close]') || e.target.closest('[data-modal-close]')) {
        closeModal(e.target.closest('.lm-modal'));
      }
      if (e.target.classList.contains('lm-modal')) closeModal(e.target);
    });
    document.addEventListener('click', (e) => {
      const save = e.target.closest('[data-store-save]');
      if (!save) return;
      const on = document.querySelector('[data-store-body] [data-store].on');
      if (!on) return LM.toast('Vui lòng chọn cửa hàng', 'error');
      ls.set('lm_store', on.getAttribute('data-store'));
      paintStoreName();
      closeModal(save);
      LM.toast(`Đã chọn cửa hàng ${on.getAttribute('data-store')}`);
    });
  };

  /* ---------------------------------------------------------------- 进站弹窗（高 CTR 促销页） */
  const PROMO_DEADLINE = 'lm_promo_deadline';

  const paintCollage = (products) => {
    const box = document.querySelector('[data-promo-collage]');
    if (!box || !products.length) return;
    box.innerHTML = products
      .slice(0, 3)
      .map(
        (p, i) => `<span class="lm-promo-prod lm-promo-prod-${i + 1}">
  <img src="${esc(LM.img(p.img || p.im))}" alt="" loading="eager" decoding="async">
</span>`
      )
      .join('');
  };

  const startCountdown = () => {
    const cfg = CFG.promoModal || {};
    const cd = cfg.countdown || {};
    if (cd.enabled === false) return;
    const h = document.querySelector('[data-promo-h]');
    const m = document.querySelector('[data-promo-m]');
    const s = document.querySelector('[data-promo-s]');
    if (!h) return;

    const duration = Number(cd.durationMs || 3600000);
    let deadline = 0;
    try {
      deadline = Number(sessionStorage.getItem(PROMO_DEADLINE) || 0);
    } catch (e) {}
    if (!deadline || deadline < Date.now()) {
      deadline = Date.now() + duration;
      try {
        sessionStorage.setItem(PROMO_DEADLINE, String(deadline));
      } catch (e) {}
    }

    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      h.textContent = String(Math.floor(left / 3600)).padStart(2, '0');
      m.textContent = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
      s.textContent = String(left % 60).padStart(2, '0');
      if (left === 0) {
        clearInterval(timer);
        document.querySelector('[data-promo-clock]')?.classList.add('done');
        if (cd.onExpire === 'close') closeModal(document.querySelector('[data-promo-modal]'));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
  };

  const maybePromo = async (page) => {
    const cfg = CFG.promoModal || {};
    if (!cfg.enabled) return;
    if (Array.isArray(cfg.pages) && !cfg.pages.includes(page)) return;
    const ttl = Number(cfg.ttlHours || 0);
    const last = Number(ls.get('lm_promo_at', 0)) || 0;
    if (ttl > 0 && Date.now() - last < ttl * 3600 * 1000) return;

    const modal = document.querySelector('[data-promo-modal]');
    if (!modal) return;

    // 商品拼贴：优先用配置里的 id，否则取首页第一个促销区块的前 3 个
    try {
      const home = await LM.data.home();
      const ids = Array.isArray(cfg.productIds) ? cfg.productIds.map(String) : [];
      let products = [];
      if (ids.length) {
        const all = (home.sections || []).flatMap((sec) => sec.items || []);
        products = ids.map((id) => all.find((x) => String(x.id) === id)).filter(Boolean);
      }
      if (!products.length) {
        const first = (home.sections || [])[0];
        products = (first && first.items) || [];
      }
      paintCollage(products);
    } catch (e) {}

    setTimeout(() => {
      openModal('[data-promo-modal]');
      ls.set('lm_promo_at', Date.now());
      startCountdown();
    }, Number(cfg.delayMs || 800));
  };

  /* ---------------------------------------------------------------- 启动 */
  LM.layout = {
    init(opts) {
      const o = opts || {};
      renderHeader();
      renderFooter();
      renderRail();
      renderModals();
      if (o.promo !== false) maybePromo(o.page || document.body.getAttribute('data-page') || '');
      paintUser();
      LM.hydrateCardData(document);
    },
    openStore() {
      openModal('[data-store-modal]');
    },
  };

  const boot = () => {
    if (!document.querySelector('[data-lm-header]')) return;
    LM.layout.init({ page: document.body.getAttribute('data-page') || '' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
