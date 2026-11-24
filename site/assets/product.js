/* 商品详情页 */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);

  const idFromPath = () => {
    const m = location.pathname.match(/-p(\d+)\/?$/);
    return m ? m[1] : LM.qs('id');
  };

  let product = null;
  let qty = 1;

  /* ---------------------------------------------------------------- 渲染 */
  const renderInfo = (p) => {
    const price = LM.priceOf(p);
    const list = LM.listOf(p);
    const off = Math.max(0, Math.round((1 - price / list) * 100));
    const stock = Number(p.stock) || 0;
    const stockPct = Math.max(6, Math.min(100, Math.round((stock / 200) * 100)));
    const label = (p.labels || [])[0];

    return `
<div class="lm-pd-topline">
  ${label ? `<span class="tag tag-green">${esc(label.name)}</span>` : ''}
  ${p.brand ? `<span class="tag tag-gray">${esc(p.brand)}</span>` : ''}
  ${p.origin ? `<span class="tag tag-blue">${esc(p.origin)}</span>` : ''}
</div>
<h1 class="lm-pd-title">${esc(p.name)}</h1>
<div class="lm-pd-share">
  <span>${LM.icon('eye')} ${Number(p.viewed || 0).toLocaleString('vi-VN')} Lượt xem</span>
  <button type="button" data-share aria-label="Chia sẻ">${LM.icon('share')}</button>
</div>
<div class="lm-pd-price">
  <span class="now">${LM.money(price)}</span>
  ${off > 0 && list > price ? `<span class="old">${LM.money(list)}</span><span class="off">-${off}%</span>` : ''}
</div>
<p class="lm-pd-note">Giá sản phẩm đã gồm VAT. Miễn phí vận chuyển toàn quốc, không phụ phí.</p>

<div class="lm-pd-perks">
  <div class="lm-pd-perk">
    <span class="ic">${LM.icon('truck')}</span>
    <div><b>Miễn phí vận chuyển</b><span>Toàn quốc, không giới hạn đơn tối thiểu</span></div>
  </div>
  <div class="lm-pd-perk">
    <span class="ic">${LM.icon('clock')}</span>
    <div><b>Giao trong ngày</b><span>Nội thành TP.HCM &amp; Hà Nội</span></div>
  </div>
</div>

<div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
    <b style="font-size:13.5px">Mô tả ngắn</b>
    ${p.shortDescription || p.description ? '<button class="btn-link" type="button" data-desc-toggle>Xem thêm</button>' : ''}
  </div>
  <div class="lm-pd-desc clamped" data-desc>${p.shortDescription || p.description || 'Sản phẩm đang được cập nhật mô tả.'}</div>
</div>

<div class="lm-pd-facts">
  ${Object.entries(p.attrs || {})
    .slice(0, 6)
    .map(([k, v]) => `<div><dt>${esc(k)}:</dt><dd>${esc(v)}</dd></div>`)
    .join('')}
</div>

${
  stock > 0
    ? `<div class="lm-stock">
  <div class="lm-stock-bar"><i style="width:${stockPct}%"></i></div>
  <div class="lm-stock-txt"><span>Còn lại <b>${stock.toLocaleString('vi-VN')}</b> sản phẩm</span><span>${stock < 20 ? 'Sắp hết hàng' : 'Sẵn hàng'}</span></div>
</div>`
    : `<div class="lm-stock"><div class="lm-stock-txt"><b>Tạm hết hàng</b></div></div>`
}

<div class="lm-pd-buy">
  <button class="lm-ico-btn${LM.fav.has(p.id) ? ' on' : ''}" type="button" data-fav="${esc(p.id)}" aria-label="Yêu thích">${LM.icon('heart')}</button>
  <button class="lm-ico-btn" type="button" data-wish aria-label="Lưu vào danh sách">${LM.icon('gift')}</button>
  <div class="qty">
    <button type="button" data-q="-1" aria-label="Giảm">${LM.icon('minus')}</button>
    <input type="number" value="1" min="1" max="99" data-qty aria-label="Số lượng">
    <button type="button" data-q="1" aria-label="Tăng">${LM.icon('plus')}</button>
  </div>
  <button class="btn" type="button" data-buy>Thêm vào giỏ hàng</button>
</div>`;
  };

  const renderReviews = (rev, p) => {
    if (!rev) return '<div class="lm-empty"><h3>Chưa có đánh giá</h3><p>Hãy là người đầu tiên đánh giá sản phẩm này.</p></div>';
    const items = rev.items || [];
    const total = rev.count || items.length;
    const bd = rev.breakdown || {};
    const rows = [5, 4, 3, 2, 1]
      .map((s) => {
        const n = Number(bd[s] || 0);
        const pct = total ? Math.round((n / total) * 100) : 0;
        return `<div class="row"><span>${s} sao</span><span class="bar"><i style="width:${pct}%"></i></span><span class="n">${n}</span></div>`;
      })
      .join('');

    const list = items
      .map((r) => {
        const initial = String(r.nick || 'K').trim().charAt(0).toUpperCase();
        return `<div class="lm-rev-item">
  <div class="lm-rev-head">
    <span class="lm-rev-ava">${esc(initial)}</span>
    <span class="lm-rev-name">${esc(r.nick)}</span>
    ${r.verified ? '<span class="tag tag-green">Đã mua hàng</span>' : ''}
    <span class="lm-rev-date">${LM.fmtDate(r.at)}</span>
    <span style="margin-left:auto">${LM.stars(r.stars)}</span>
  </div>
  ${r.title ? `<div class="lm-rev-title">${esc(r.title)}</div>` : ''}
  <div class="lm-rev-body">${LM.esc(r.body).replace(/\n/g, '<br>')}</div>
  ${
    (r.crit || []).length
      ? `<div class="lm-rev-crit">${r.crit.map((c) => `<span>${esc(c.k)}: <b>${c.v}/5</b></span>`).join('')}</div>`
      : ''
  }
  ${r.reply ? `<div class="lm-rev-reply"><b>Phản hồi từ LOTTE Mart</b>${esc(r.reply)}</div>` : ''}
</div>`;
      })
      .join('');

    return `<div class="lm-rev">
  <div class="lm-rev-score">
    <div class="num">${Number(rev.avg || 0).toFixed(1)}<small>/5</small></div>
    ${LM.stars(rev.avg || 0)}
    <div class="cnt">${total.toLocaleString('vi-VN')} đánh giá</div>
    <div class="lm-rev-bars">${rows}</div>
  </div>
  <div class="lm-rev-list">${list || '<p class="txt-muted">Chưa có nội dung đánh giá.</p>'}</div>
</div>`;
  };

  const renderRelated = (items) => {
    if (!items.length) return '';
    return `<section class="lm-sec" style="margin-top:8px">
  <div class="lm-sec-head"><h2 class="lm-sec-title">Sản phẩm gợi ý</h2></div>
  <div class="lm-rail-nav">
    <button class="prev" type="button" data-rel-prev aria-label="Trước"></button>
    <button class="next" type="button" data-rel-next aria-label="Sau"></button>
    <div class="lm-rail-list lm-rail-5" data-rel-list>${items.map((x) => LM.card(x)).join('')}</div>
  </div>
</section>`;
  };

  const render = (p) => {
    const main = $('.lm-main');
    const gallery = (p.gallery && p.gallery.length ? p.gallery : [p.img]).slice(0, 12).map((g) => LM.img(g));

    main.innerHTML = `
<div class="container">
  <nav class="lm-crumb" aria-label="Breadcrumb">
    <a href="/">Trang chủ</a><span class="sep">/</span>
    ${p.catUrl ? `<a href="${esc(p.catUrl)}">${esc(p.catName)}</a><span class="sep">/</span>` : ''}
    <span class="cur">${esc(p.name)}</span>
  </nav>

  <section class="lm-pd">
    <div class="lm-gallery">
      <div class="lm-gallery-main">
        <img src="${esc(gallery[0])}" alt="${esc(p.name)}" data-main-img>
        <div class="lm-gallery-tools">
          <button type="button" data-full aria-label="Xem ảnh lớn">${LM.icon('expand')}</button>
          <button type="button" data-share aria-label="Chia sẻ">${LM.icon('share')}</button>
        </div>
      </div>
      <div class="lm-gallery-thumbs">
        ${gallery
          .map(
            (g, i) =>
              `<button type="button" class="${i === 0 ? 'on' : ''}" data-thumb="${i}" aria-label="Ảnh ${i + 1}"><img src="${esc(g)}" alt="" loading="lazy"></button>`
          )
          .join('')}
      </div>
    </div>
    <div class="lm-pd-info" data-info></div>
  </section>

  <div class="lm-tabs-card">
    <div class="lm-tabs-head" role="tablist">
      <button type="button" class="on" data-tab="desc" role="tab">Mô tả sản phẩm</button>
      <button type="button" data-tab="spec" role="tab">Đặc điểm sản phẩm</button>
      <button type="button" data-tab="review" role="tab">Đánh giá (${Number(p.reviews || 0)})</button>
    </div>
    <div class="lm-tabs-body">
      <div class="lm-prose" data-panel="desc">${p.description || p.shortDescription || '<p>Sản phẩm đang được cập nhật mô tả.</p>'}</div>
      <div class="lm-prose hidden" data-panel="spec">
        <dl class="lm-pd-facts" style="grid-template-columns:180px minmax(0,1fr);gap:10px 18px">
          ${Object.entries(p.attrs || {})
            .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
            .join('')}
          <div><dt>Mã sản phẩm</dt><dd>${esc(p.sku)}</dd></div>
        </dl>
      </div>
      <div class="hidden" data-panel="review">
        <div class="lm-skel" style="height:180px;border-radius:10px"></div>
      </div>
    </div>
  </div>

  <div data-related></div>
</div>`;

    $('[data-info]').innerHTML = renderInfo(p);
    wire(p, gallery);
  };

  /** 相关推荐 + 评价（异步补，不阻塞首屏） */
  const hydrate = async (p) => {
    try {
      const [related, rev] = await Promise.all([LM.data.related(p.catId, p.id, 12), LM.data.reviews(p.id)]);
      const revBox = $('[data-panel="review"]');
      if (revBox) revBox.innerHTML = renderReviews(rev, p);
      const relBox = $('[data-related]');
      if (relBox && related.length) {
        relBox.innerHTML = renderRelated(related);
        wireRelated();
        LM.hydrateCardData(relBox);
      }
    } catch (e) {
      /* 静默：首屏已可用 */
    }
  };

  const wire = (p, gallery) => {
    // 图集
    document.querySelectorAll('[data-thumb]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.getAttribute('data-thumb')) || 0;
        const main = $('[data-main-img]');
        if (main) main.src = gallery[i];
        document.querySelectorAll('[data-thumb]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      })
    );
    $('[data-full]')?.addEventListener('click', () => {
      const main = $('[data-main-img]');
      if (main) window.open(main.src, '_blank', 'noopener');
    });
    document.querySelectorAll('[data-share]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          if (navigator.share) await navigator.share({ title: p.name, url: location.href });
          else {
            await navigator.clipboard.writeText(location.href);
            LM.toast('Đã sao chép liên kết');
          }
        } catch (e) {}
      })
    );

    // 数量
    const input = $('[data-qty]');
    const clamp = (v) => Math.max(1, Math.min(99, Number(v) || 1));
    document.querySelectorAll('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        qty = clamp((Number(input.value) || 1) + Number(b.getAttribute('data-q')));
        input.value = qty;
      })
    );
    if (input) input.addEventListener('change', () => (input.value = qty = clamp(input.value)));

    // 加入购物车
    $('[data-buy]')?.addEventListener('click', () => {
      LM.cart.add({ ...p, price: LM.priceOf(p), list: LM.listOf(p) }, qty);
      LM.toast(`Đã thêm ${qty} sản phẩm vào giỏ hàng`);
      try {
        LM.pixel.addToCart({ ...p, price: LM.priceOf(p) }, qty);
      } catch (e) {}
    });
    $('[data-wish]')?.addEventListener('click', () => {
      LM.fav.toggle(p.id);
      LM.toast('Đã lưu vào danh sách yêu thích');
      document.querySelectorAll(`[data-fav="${p.id}"]`).forEach((b) => b.classList.add('on'));
    });

    // 短描述展开
    $('[data-desc-toggle]')?.addEventListener('click', (e) => {
      const d = $('[data-desc]');
      d.classList.toggle('clamped');
      e.target.textContent = d.classList.contains('clamped') ? 'Xem thêm' : 'Thu gọn';
    });

    // 选项卡
    document.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.getAttribute('data-tab');
        document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.getAttribute('data-panel') !== key));
      })
    );

    // 相关推荐横滑
    const list = $('[data-rel-list]');
    if (list) {
      const step = () => Math.max(220, list.clientWidth * 0.8);
      $('[data-rel-prev]')?.addEventListener('click', () => list.scrollBy({ left: -step(), behavior: 'smooth' }));
      $('[data-rel-next]')?.addEventListener('click', () => list.scrollBy({ left: step(), behavior: 'smooth' }));
    }

    LM.hydrateCardData(document);
  };

  /** 相关推荐横滑（内容异步注入后才能绑） */
  const wireRelated = () => {
    const list = $('[data-rel-list]');
    if (!list || list.dataset.wired) return;
    list.dataset.wired = '1';
    const step = () => Math.max(220, list.clientWidth * 0.8);
    $('[data-rel-prev]')?.addEventListener('click', () => list.scrollBy({ left: -step(), behavior: 'smooth' }));
    $('[data-rel-next]')?.addEventListener('click', () => list.scrollBy({ left: step(), behavior: 'smooth' }));
  };

  const boot = async () => {
    const id = idFromPath();
    const main = $('.lm-main');
    if (!id) {
      main.innerHTML = `<div class="container"><div class="lm-empty"><h3>Không tìm thấy sản phẩm</h3><p><a href="/">Về trang chủ</a></p></div></div>`;
      return;
    }
    main.innerHTML = `<div class="container" style="padding-top:16px"><div class="lm-skel" style="height:420px;border-radius:12px"></div></div>`;
    try {
      product = await LM.data.product(id);
      if (!product) throw new Error('not found');
      document.title = `${product.name} | LOTTE Mart Việt Nam`;
      render(product);
      // 像素：ViewContent（首屏渲染即打，不等相关推荐）
      try {
        LM.pixel.viewContent({ ...product, price: LM.priceOf(product) });
      } catch (e) {}
      hydrate(product);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="container"><div class="lm-empty">${LM.icon('search')}<h3>Không tìm thấy sản phẩm</h3><p>Sản phẩm có thể đã ngừng kinh doanh.</p><p><a class="btn btn-outline btn-sm" href="/">Về trang chủ</a></p></div></div>`;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

