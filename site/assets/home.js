/* 首页渲染 */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);

  const QUICK = [
    { icon: 'cart', label: 'Đi Chợ Tại Nhà', href: '/vi-nsg/collection/di-cho-tai-nha' },
    { icon: 'tag', label: 'Ưu Đãi Hot', href: '/vi-nsg/collection/uu-dai-hot' },
    { icon: 'gift', label: 'Khuyến Mãi', href: '/vi-nsg/collection/khuyen-mai' },
    { icon: 'clock', label: 'Bán Chạy', href: '/vi-nsg/collection/ban-chay' },
    { icon: 'plus', label: 'Hàng Mới', href: '/vi-nsg/collection/hang-moi' },
    { icon: 'shield', label: 'Sự Kiện Nổi Bật', href: '/vi-nsg/collection/su-kien' },
  ];

  const BRANDS = ['KOREK', 'FAMI', 'CASHBACK 11%', '365 FRESH', 'LOTTE', 'CP FOOD', 'VITEC FARM', 'ELÈNE'];

  const railHtml = (items, cls) => `<div class="lm-rail-list ${cls || 'lm-rail-5'}">${items.map((p) => LM.card(p)).join('')}</div>`;

  const tabsSort = (items, key) => {
    const arr = items.slice();
    if (key === 'rate') arr.sort((a, b) => b.r - a.r || b.rv - a.rv);
    else if (key === 'low') arr.sort((a, b) => a.p - b.p);
    else if (key === 'high') arr.sort((a, b) => b.p - a.p);
    else arr.sort((a, b) => b.s - a.s);
    return arr;
  };

  const sectionHtml = (sec) => {
    const id = `sec-${sec.key.replace(/[^a-z0-9_-]/gi, '')}`;
    const tabs = (sec.tabs || []).length
      ? `<div class="lm-sec-tabs" data-tabs="${id}">
          ${sec.tabs.map((t, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-tab="${['hot', 'rate', 'low', 'high'][i] || 'hot'}">${esc(t)}</button>`).join('')}
        </div>`
      : '';
    return `<section class="lm-sec" id="${id}" data-sec="${esc(sec.key)}">
  <div class="lm-sec-head">
    <h2 class="lm-sec-title">${esc(sec.title)}</h2>
    ${tabs}
  </div>
  <div class="lm-rail-nav">
    <button class="prev" type="button" data-rail-prev aria-label="Trước"></button>
    <button class="next" type="button" data-rail-next aria-label="Sau"></button>
    <div data-rail-body>${railHtml(sec.items, 'lm-rail-5')}</div>
  </div>
</section>`;
  };

  /* ---------------- 3折专区（人工精选，data/deals.json） ---------------- */
  const dealsHtml = (deals) => {
    if (!deals || !(deals.items || []).length) return '';
    const title = deals.title || 'Săn Deal 3 Chấm — Giảm Đến 70%';
    const sub = deals.subtitle || '';
    return `<section class="lm-sec lm-deals" id="deals" data-sec="deals">
  <div class="lm-deals-head">
    <div>
      <h2 class="lm-sec-title">${esc(title)}</h2>
      ${sub ? `<p class="lm-deals-sub">${esc(sub)}</p>` : ''}
    </div>
    <span class="lm-deals-badge">${deals.items.length} sản phẩm</span>
  </div>
  <div class="lm-rail-nav">
    <button class="prev" type="button" data-rail-prev aria-label="Trước"></button>
    <button class="next" type="button" data-rail-next aria-label="Sau"></button>
    <div data-rail-body>${railHtml(deals.items, 'lm-rail-5')}</div>
  </div>
</section>`;
  };

  const render = (home, deals) => {
    const main = $('.lm-main');
    if (!main) return;

    const hero = (home.hero || []).slice(0, 8);

    const html = [];
    html.push(`<div class="container">
  <div class="lm-hero">
    <div class="lm-hero-main" data-hero>
      ${hero
        .map(
          (b, i) =>
            `<a href="${esc(b.link)}" class="lm-hero-slide" data-slide="${i}" style="display:${i === 0 ? 'block' : 'none'}">
              <picture>
                ${b.appImg ? `<source media="(max-width: 768px)" srcset="${esc(b.appImg)}">` : ''}
                <img src="${esc(b.img)}" alt="${esc(b.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">
              </picture>
            </a>`
        )
        .join('')}
      ${
        hero.length > 1
          ? `<button class="lm-hero-arrow prev" type="button" data-hero-prev aria-label="Trước">${LM.icon('chevronLeft')}</button>
             <button class="lm-hero-arrow next" type="button" data-hero-next aria-label="Sau">${LM.icon('chevron')}</button>`
          : ''
      }
      <div class="lm-hero-dots">${hero
        .map((_, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-dot="${i}" aria-label="Ảnh ${i + 1}"></button>`)
        .join('')}</div>
    </div>
  </div>

  <div class="lm-quick">
    ${QUICK.map(
      (q) => `<a href="${q.href}"><span class="lm-quick-ic">${LM.icon(q.icon)}</span><span>${esc(q.label)}</span></a>`
    ).join('')}
  </div>

  ${
    (home.coupons || []).length
      ? `<div class="lm-coupons">${home.coupons
          .slice(0, 4)
          .map(
            (c) => `<div class="lm-coupon">
      <div>
        <div class="lm-coupon-amt">${esc(c.name || 'Mã giảm giá')}</div>
        <div class="lm-coupon-desc">${esc((c.desc || '').slice(0, 46))}</div>
      </div>
      <button type="button" data-coupon="${esc(c.code)}">Sao chép</button>
    </div>`
          )
          .join('')}</div>`
      : ''
  }
</div>`);

    // 商品区块（3折专区排最前）
    const dealsBlock = dealsHtml(deals);
    if (dealsBlock) html.push(`<div class="container">${dealsBlock}</div>`);

    for (const sec of home.sections || []) {
      html.push(`<div class="container">${sectionHtml(sec)}</div>`);
      if (sec.key === 'today_check' && (home.promoBanners || []).length) {
        html.push(`<div class="container"><div class="lm-banners">
          ${home.promoBanners
            .map((b) => `<a href="${esc(b.link)}"><img src="${esc(b.img)}" alt="${esc(b.title)}" loading="lazy"></a>`)
            .join('')}
        </div></div>`);
      }
    }

    html.push(`<div class="container">
  <div class="lm-brands">${BRANDS.map((b) => `<span>${esc(b)}</span>`).join('')}</div>
</div>`);

    main.innerHTML = html.join('');
    wire(home);
    LM.hydrateCardData(document);
  };

  const wire = (home) => {
    // 主视觉轮播
    const slides = [...document.querySelectorAll('[data-slide]')];
    const dots = [...document.querySelectorAll('[data-dot]')];
    let idx = 0;
    let timer = 0;
    const go = (n) => {
      if (!slides.length) return;
      idx = (n + slides.length) % slides.length;
      slides.forEach((s, i) => (s.style.display = i === idx ? 'block' : 'none'));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    };
    const auto = () => {
      clearInterval(timer);
      timer = setInterval(() => go(idx + 1), 5000);
    };
    dots.forEach((d, i) =>
      d.addEventListener('click', () => {
        go(i);
        auto();
      })
    );
    document.querySelector('[data-hero-prev]')?.addEventListener('click', () => {
      go(idx - 1);
      auto();
    });
    document.querySelector('[data-hero-next]')?.addEventListener('click', () => {
      go(idx + 1);
      auto();
    });
    if (slides.length > 1) auto();

    // 选项卡排序
    document.querySelectorAll('[data-tabs]').forEach((box) => {
      const sec = box.closest('[data-sec]');
      const key = sec.getAttribute('data-sec');
      const data = (home.sections || []).find((s) => s.key === key);
      if (!data) return;
      box.querySelectorAll('[data-tab]').forEach((btn) =>
        btn.addEventListener('click', () => {
          box.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const body = sec.querySelector('[data-rail-body]');
          body.innerHTML = railHtml(tabsSort(data.items, btn.getAttribute('data-tab')), 'lm-rail-5');
          LM.hydrateCardData(sec);
        })
      );
    });

    // 轨道左右翻
    document.querySelectorAll('[data-sec]').forEach((sec) => {
      const list = sec.querySelector('.lm-rail-list');
      if (!list) return;
      const step = () => Math.max(220, list.clientWidth * 0.8);
      sec.querySelector('[data-rail-prev]')?.addEventListener('click', () => list.scrollBy({ left: -step(), behavior: 'smooth' }));
      sec.querySelector('[data-rail-next]')?.addEventListener('click', () => list.scrollBy({ left: step(), behavior: 'smooth' }));
    });

    // 优惠券复制
    document.querySelectorAll('[data-coupon]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-coupon') || '';
        try {
          await navigator.clipboard.writeText(code);
          LM.toast(`Đã sao chép mã ${code}`);
        } catch (e) {
          LM.toast(`Mã: ${code}`);
        }
      })
    );
  };

  const boot = async () => {
    const main = document.querySelector('.lm-main');
    window.__homeState = 'boot';
    if (main) main.innerHTML = `<div class="container" style="padding-top:16px"><div class="lm-skel" style="height:320px;border-radius:12px"></div></div>`;
    try {
      const [home, deals] = await Promise.all([LM.data.home(), LM.data.deals()]);
      window.__homeState = 'data:' + (home.sections || []).length;
      render(home, deals);
      window.__homeState = 'rendered';
    } catch (e) {
      window.__homeState = 'error:' + (e && e.message);
      console.error('[home]', e);
      if (main) main.innerHTML = `<div class="container"><div class="lm-empty"><h3>Không tải được dữ liệu</h3><p>Vui lòng thử lại sau.</p></div></div>`;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
