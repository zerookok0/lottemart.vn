/* 类目 / 集合页：左筛选 + 排序 + 分页 + 网格 */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);
  const PAGE_SIZE = 24;

  const state = {
    all: [],
    items: [],
    page: 1,
    sort: 'popular',
    baseSort: null,
    cats: new Set(),
    delivery: '',
    rating: 0,
    brand: '',
    min: 0,
    max: 0,
  };

  const catIdFromPath = () => {
    const m = location.pathname.match(/-c(\d+)\/?$/);
    return m ? m[1] : '';
  };

  const collectionKey = () => {
    const m = location.pathname.match(/\/vi-nsg\/collection\/([^/]+)\/?$/);
    return m ? m[1] : '';
  };

  const SORTS = {
    popular: ['Phổ biến', (a, b) => b.s - a.s || b.rv - a.rv],
    'price-asc': ['Giá tăng dần', (a, b) => a.p - b.p],
    'price-desc': ['Giá giảm dần', (a, b) => b.p - a.p],
    rating: ['Đánh giá cao', (a, b) => b.r - a.r || b.rv - a.rv],
    newest: ['Hàng mới', (a, b) => Number(b.i) - Number(a.i)],
    name: ['Tên A-Z', (a, b) => a.n.localeCompare(b.n, 'vi')],
  };

  /* ---------------------------------------------------------------- 侧栏 */
  const renderSide = async (menu, items, catId) => {
    const side = $('[data-side]');
    if (!side) return;
    const byId = new Map((menu.nodes || []).map((n) => [String(n.id), n]));
    const cur = byId.get(String(catId));
    const parent = cur && cur.parent_id ? byId.get(String(cur.parent_id)) : null;
    const topId = parent ? (parent.parent_id ? parent.parent_id : parent.id) : cur ? cur.id : '';

    // 类目（当前一级 + 其子类）
    const roots = (menu.roots || []).map((id) => byId.get(String(id))).filter(Boolean);
    const l2 = (menu.nodes || []).filter((n) => String(n.parent_id) === String(topId));
    const l3 = (menu.nodes || []).filter((n) => l2.some((p) => String(p.id) === String(n.parent_id)));

    const brandCount = new Map();
    items.forEach((p) => {
      if (!p.br) return;
      brandCount.set(p.br, (brandCount.get(p.br) || 0) + 1);
    });
    const brands = [...brandCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const priceBuckets = [
      ['0-150000', 'Dưới 150.000 ₫'],
      ['150000-300000', '150.000 ₫ - 300.000 ₫'],
      ['300000-500000', '300.000 ₫ - 500.000 ₫'],
      ['500000-1000000', '500.000 ₫ - 1.000.000 ₫'],
      ['1000000-0', 'Trên 1.000.000 ₫'],
    ];

    side.innerHTML = `
<button class="lm-side-clear" type="button" data-side-close style="margin:0 0 12px">← Đóng bộ lọc</button>
${
  (menu.specials || []).length
    ? `<div class="lm-fgroup">
  <h3>Nổi bật</h3>
  ${menu.specials
    .map(
      (s) =>
        `<label class="lm-fitem"><input type="radio" name="fcat" value="${s.id}" ${String(s.id) === String(catId) ? 'checked' : ''}><span class="box"></span><span class="lbl">${esc(s.name)}</span><span class="cnt">${s.count || 0}</span></label>`
    )
    .join('')}
</div>`
    : ''
}
<div class="lm-fgroup">
  <h3>Danh mục</h3>
  <label class="lm-fitem"><input type="radio" name="fcat" value="" ${!catId ? 'checked' : ''}><span class="box"></span><span class="lbl">Tất cả</span></label>
  ${roots
    .map(
      (r) => `
    <label class="lm-fitem"><input type="radio" name="fcat" value="${r.id}" ${String(r.id) === String(catId) ? 'checked' : ''}><span class="box"></span><span class="lbl">${esc(r.name)}</span><span class="cnt">${r.count || 0}</span></label>
    ${
      (menu.nodes || [])
        .filter((n) => String(n.parent_id) === String(r.id))
        .map(
          (c2) => `
      <label class="lm-fitem lm-fitem-child"><input type="radio" name="fcat" value="${c2.id}" ${String(c2.id) === String(catId) ? 'checked' : ''}><span class="box"></span><span class="lbl">${esc(c2.name)}</span></label>
      ${
        String(c2.id) === String(catId) || (parent && String(parent.id) === String(c2.id))
          ? (menu.nodes || [])
              .filter((n) => String(n.parent_id) === String(c2.id))
              .map(
                (c3) =>
                  `<label class="lm-fitem lm-fitem-child" style="padding-left:34px"><input type="radio" name="fcat" value="${c3.id}" ${String(c3.id) === String(catId) ? 'checked' : ''}><span class="box"></span><span class="lbl">${esc(c3.name)}</span></label>`
              )
              .join('')
          : ''
      }`
        )
        .join('')
    }`
    )
    .join('')}
</div>

<div class="lm-fgroup">
  <h3>Giao hàng</h3>
  <label class="lm-fitem"><input type="radio" name="fdel" value="" ${!state.delivery ? 'checked' : ''}><span class="box"></span><span class="lbl">Tất cả</span></label>
  <label class="lm-fitem"><input type="radio" name="fdel" value="fast"><span class="box"></span><span class="lbl">Giao siêu tốc 2 giờ</span></label>
  <label class="lm-fitem"><input type="radio" name="fdel" value="std"><span class="box"></span><span class="lbl">Giao hàng tiêu chuẩn</span></label>
</div>

<div class="lm-fgroup">
  <h3>Fresh giá</h3>
  ${[5, 4, 3, 2, 1]
    .map(
      (s) =>
        `<label class="lm-fitem"><input type="radio" name="frate" value="${s}" ${state.rating === s ? 'checked' : ''}><span class="box"></span>${LM.stars(s)}<span class="cnt">${s} sao</span></label>`
    )
    .join('')}
  <label class="lm-fitem"><input type="radio" name="frate" value="" ${!state.rating ? 'checked' : ''}><span class="box"></span><span class="lbl">Tất cả</span></label>
</div>

${
  brands.length
    ? `<div class="lm-fgroup">
  <h3>Thương hiệu</h3>
  ${brands
    .map(
      ([b, n]) =>
        `<label class="lm-fitem"><input type="radio" name="fbrand" value="${esc(b)}" ${state.brand === b ? 'checked' : ''}><span class="box"></span><span class="lbl">${esc(b)}</span><span class="cnt">${n}</span></label>`
    )
    .join('')}
</div>`
    : ''
}

<div class="lm-fgroup">
  <h3>Giá</h3>
  ${priceBuckets
    .map(
      ([v, label]) =>
        `<label class="lm-fitem"><input type="radio" name="fprice" value="${v}"><span class="box"></span><span class="lbl">${esc(label)}</span></label>`
    )
    .join('')}
  <div class="lm-price-range">
    <input type="number" inputmode="numeric" placeholder="0" data-min>
    <span class="dash">-</span>
    <input type="number" inputmode="numeric" placeholder="1.000.000" data-max>
  </div>
  <button class="btn btn-sm btn-block" type="button" data-apply-price style="margin-top:8px">Áp dụng</button>
</div>

<button class="lm-side-clear" type="button" data-clear>${LM.icon('close')} Xóa lọc</button>`;

    wireSide();
  };

  const wireSide = () => {
    const side = $('[data-side]');
    if (!side) return;
    side.querySelectorAll('input[name="fcat"]').forEach((el) =>
      el.addEventListener('change', () => {
        if (el.value) location.href = `/vi-nsg/category/x-c${el.value}`;
        else location.href = '/search?q=';
      })
    );
    side.querySelectorAll('input[name="fdel"]').forEach((el) =>
      el.addEventListener('change', () => {
        state.delivery = el.value;
        state.page = 1;
        apply();
      })
    );
    side.querySelectorAll('input[name="frate"]').forEach((el) =>
      el.addEventListener('change', () => {
        state.rating = Number(el.value) || 0;
        state.page = 1;
        apply();
      })
    );
    side.querySelectorAll('input[name="fbrand"]').forEach((el) =>
      el.addEventListener('change', () => {
        state.brand = el.value;
        state.page = 1;
        apply();
      })
    );
    side.querySelectorAll('input[name="fprice"]').forEach((el) =>
      el.addEventListener('change', () => {
        const [min, max] = el.value.split('-').map(Number);
        state.min = min || 0;
        state.max = max || 0;
        state.page = 1;
        apply();
      })
    );
    side.querySelector('[data-apply-price]')?.addEventListener('click', () => {
      state.min = Number(side.querySelector('[data-min]').value) || 0;
      state.max = Number(side.querySelector('[data-max]').value) || 0;
      state.page = 1;
      apply();
    });
    side.querySelector('[data-clear]')?.addEventListener('click', () => {
      state.delivery = '';
      state.rating = 0;
      state.brand = '';
      state.min = 0;
      state.max = 0;
      state.page = 1;
      side.querySelectorAll('input[type="radio"]').forEach((r) => (r.checked = false));
      side.querySelector('input[name="fcat"][value=""]')?.click();
      apply();
    });
    side.querySelector('[data-side-close]')?.addEventListener('click', () => {
      side.classList.remove('open');
      document.querySelector('[data-side-mask]')?.classList.remove('on');
    });
  };

  /* ---------------------------------------------------------------- 列表 */
  const apply = () => {
    let list = state.all.slice();
    if (state.rating) list = list.filter((p) => Number(p.r) >= state.rating);
    if (state.brand) list = list.filter((p) => p.br === state.brand);
    if (state.min) list = list.filter((p) => Number(p.p) >= state.min);
    if (state.max) list = list.filter((p) => Number(p.p) <= state.max);
    if (state.delivery === 'fast') list = list.filter((p) => Number(p.s) > 40);
    if (state.delivery === 'std') list = list.filter((p) => Number(p.s) <= 40);
    // 集合页（Giao 60 PHÚT / Ưu Đãi Hot / Hàng Mới …）默认用它自己的排序，
    // 否则会被 "popular" 统一成同一份榜单，看起来像重复
    const cmp = state.sort === 'popular' && state.baseSort ? state.baseSort : SORTS[state.sort] ? SORTS[state.sort][1] : SORTS.popular[1];
    list.sort(cmp);
    state.items = list;
    renderGrid();
  };

  const renderGrid = () => {
    const grid = $('[data-grid]');
    const count = $('[data-count]');
    if (!grid) return;
    const total = state.items.length;
    if (count) count.textContent = total.toLocaleString('vi-VN');
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const slice = state.items.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    grid.innerHTML = slice.length
      ? slice.map((p) => LM.card(p)).join('')
      : `<div class="lm-empty" style="grid-column:1/-1">${LM.icon('search')}<h3>Không tìm thấy sản phẩm</h3><p>Hãy thử bỏ bớt bộ lọc.</p></div>`;

    LM.hydrateCardData(grid);
    renderPager(pages);
  };

  const renderPager = (pages) => {
    const box = $('[data-pager]');
    if (!box) return;
    if (pages <= 1) {
      box.innerHTML = '';
      return;
    }
    const cur = state.page;
    const nums = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - cur) <= 2) nums.push(i);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    box.innerHTML = `
      <button type="button" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>${LM.icon('chevronLeft')}</button>
      ${nums
        .map((n) => (n === '…' ? '<span class="gap">…</span>' : `<button type="button" data-page="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`))
        .join('')}
      <button type="button" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''}>${LM.icon('chevron')}</button>`;
    box.querySelectorAll('[data-page]').forEach((b) =>
      b.addEventListener('click', () => {
        state.page = Number(b.getAttribute('data-page')) || 1;
        renderGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
    );
  };

  /* ---------------------------------------------------------------- 启动 */
  const boot = async () => {
    const catId = catIdFromPath();
    const key = collectionKey();
    const isSearch = document.body.getAttribute('data-page') === 'search';
    const q = LM.qs('q');

    const [menu] = await Promise.all([LM.data.menu()]);
    const byId = new Map((menu.nodes || []).map((n) => [String(n.id), n]));

    let items = [];
    let title = 'Sản phẩm';
    let crumb = [];

    if (isSearch || q) {
      const search = await LM.data.search();
      const norm = LM.slug(q).replace(/-/g, ' ').trim();
      const words = norm.split(/\s+/).filter(Boolean);
      items = search
        .filter((p) => {
          const hay = p.k || LM.slug(p.n);
          return words.every((w) => hay.includes(w));
        })
        .map((p) => ({ id: p.i, n: p.n, u: p.u, im: p.im, p: p.p, l: p.l, r: p.r, rv: p.rv, s: p.s, c: p.c, cn: p.cn, br: '' }));
      title = q ? `Kết quả cho “${q}”` : 'Sản phẩm';
      crumb = [{ name: 'Trang chủ', url: '/' }, { name: 'Tìm kiếm' }];
    } else if (key) {
      const search = await LM.data.search();
      const base = search.map((p) => ({
        id: p.i,
        n: p.n,
        u: p.u,
        im: p.im,
        p: p.p,
        l: p.l,
        r: p.r,
        rv: p.rv,
        s: p.s,
        st: p.st,
        b: p.b,
        c: p.c,
        rc: p.rc || p.c,
        cn: p.cn,
        br: p.br || '',
      }));
      const FRESH = new Set(['3', '266', '495', '285', '303', '167', '506']);
      const map = {
        // 「Giao 60 Phút」在源站是虚拟类目 = 带 Giao siêu tốc 促销标的商品
        'giao-60-phut': ['Giao 60 PHÚT', (x) => /giao/i.test(x.b || ''), (a, b) => b.r - a.r || b.s - a.s],
        'di-cho-tai-nha': ['Đi Chợ Tại Nhà', (x) => FRESH.has(String(x.rc)), (a, b) => b.s - a.s],
        'uu-dai-hot': ['Ưu Đãi Hot', (x) => Number(x.r) >= 4.8 && Number(x.rv) >= 3, (a, b) => b.r - a.r || b.rv - a.rv],
        'khuyen-mai': ['Khuyến Mãi', (x) => /coupon|giá rẻ|sale/i.test(x.b || ''), (a, b) => b.rv - a.rv],
        'ban-chay': ['Bán Chạy', () => true, (a, b) => b.s - a.s],
        'hang-moi': ['Hàng Mới', () => true, (a, b) => Number(b.i) - Number(a.i)],
        'su-kien': ['Sự Kiện Nổi Bật', (x) => Number(x.rv) >= 8, (a, b) => b.rv - a.rv],
        'dat-hang-nhanh': ['Đặt Hàng Nhanh', (x) => Number(x.st) > 100, (a, b) => b.st - a.st],
      };
      const conf = map[key] || ['Sản phẩm', () => true, (a, b) => b.s - a.s];
      const seen = new Set();
      items = base
        .filter(conf[1])
        .filter((x) => (seen.has(String(x.id)) ? false : seen.add(String(x.id))))
        .sort(conf[2])
        .slice(0, 240);
      state.baseSort = conf[2];
      title = conf[0];
      crumb = [{ name: 'Trang chủ', url: '/' }, { name: conf[0] }];
    } else if (catId) {
      const cat = await LM.data.cat(catId);
      const rec = byId.get(String(catId));
      items = cat.items || [];
      title = rec ? rec.name : 'Sản phẩm';
      // 面包屑
      if (rec) {
        const ids = String(rec.path || '').split('/').filter(Boolean);
        crumb = [{ name: 'Trang chủ', url: '/' }];
        for (const id of ids) {
          const r = byId.get(String(id));
          if (r) crumb.push({ name: r.name, url: r.url });
        }
      }
    }

    state.all = items;
    state.page = 1;

    // 标题 / 面包屑
    const h1 = $('[data-title]');
    if (h1) h1.textContent = title;
    document.title = `${title} | LOTTE Mart Việt Nam`;
    const crumbBox = $('[data-crumb]');
    if (crumbBox) {
      crumbBox.innerHTML = crumb
        .map((c, i) => (c.url ? `<a href="${esc(c.url)}">${esc(c.name)}</a><span class="sep">/</span>` : `<span class="cur">${esc(c.name)}</span>`))
        .join('');
    }

    // 类目大横幅
    const banner = $('[data-cat-banner]');
    const bannerImg = catId ? `https://www.lottemart.vn/media/catalog/category/${(byId.get(String(catId)) || {}).url_key || ''}.jpg` : '';
    if (banner && catId) {
      banner.innerHTML = `<img src="${esc(bannerImg)}" alt="${esc(title)}" onerror="this.parentNode.style.display='none'">`;
    }

    const side = $('[data-side]');
    if (side) side.querySelector('[data-side-close]')?.remove();

    await renderSide(menu, items, catId);

    // 排序
    const sortSel = $('[data-sort]');
    if (sortSel) {
      sortSel.innerHTML = Object.entries(SORTS)
        .map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`)
        .join('');
      sortSel.value = 'popular';
      sortSel.addEventListener('change', () => {
        state.sort = sortSel.value;
        state.page = 1;
        apply();
      });
    }

    // 移动端筛选
    $('[data-filter-open]')?.addEventListener('click', () => {
      $('[data-side]')?.classList.add('open');
      $('[data-side-mask]')?.classList.add('on');
    });
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-side-mask]')) {
        $('[data-side]')?.classList.remove('open');
        e.target.classList.remove('on');
      }
    });

    apply();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
