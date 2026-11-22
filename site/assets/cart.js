/* 购物车页 */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);
  const FREE = Number((window.LM_CONFIG || {}).freeShipThreshold || 500000);

  const render = () => {
    const items = LM.cart.all();
    const box = $('[data-cart]');
    const summary = $('[data-summary]');
    if (!box) return;

    if (!items.length) {
      box.innerHTML = `<div class="lm-empty">${LM.icon('cart')}<h3>Giỏ hàng đang trống</h3><p>Hãy thêm sản phẩm để tiếp tục mua sắm.</p><p style="margin-top:8px"><a class="btn btn-outline btn-sm" href="/">Tiếp tục mua sắm</a></p></div>`;
      if (summary) summary.innerHTML = '';
      return;
    }

    box.innerHTML = `
<div class="lm-cart-box">
  <div class="lm-cart-head">
    <span>Sản phẩm</span><span>Đơn giá</span><span>Số lượng</span><span></span>
  </div>
  ${items
    .map(
      (it) => `<div class="lm-cart-row" data-row="${esc(it.id)}">
    <div class="lm-cart-prod">
      <a href="${esc(it.url)}"><img src="${esc(LM.img(it.img))}" alt="${esc(it.name)}" loading="lazy"></a>
      <div style="min-width:0">
        <a class="nm" href="${esc(it.url)}">${esc(it.name)}</a>
        <div class="meta">Mã: ${esc(it.id)}</div>
      </div>
    </div>
    <div class="lm-cart-price">
      ${LM.money(it.price)}
      <span class="old">${LM.money(it.list || it.price)}</span>
    </div>
    <div class="qty">
      <button type="button" data-dec aria-label="Giảm">${LM.icon('minus')}</button>
      <input type="number" value="${it.qty}" min="1" max="99" data-qty aria-label="Số lượng">
      <button type="button" data-inc aria-label="Tăng">${LM.icon('plus')}</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
      <span class="lm-cart-sum">${LM.money(it.price * it.qty)}</span>
      <button class="lm-cart-del" type="button" data-del aria-label="Xóa">${LM.icon('trash')}</button>
    </div>
  </div>`
    )
    .join('')}
</div>`;

    const total = LM.cart.total();
    const listTotal = LM.cart.listTotal();
    const saved = Math.max(0, listTotal - total);
    const ship = total >= FREE ? 0 : 25000;

    summary.innerHTML = `
<div class="lm-summary">
  <h2>Tổng đơn hàng</h2>
  <div class="line"><span>Tạm tính (${LM.cart.count()} sản phẩm)</span><b>${LM.money(listTotal)}</b></div>
  <div class="line saved"><span>Giảm giá</span><b>-${LM.money(saved)}</b></div>
  <div class="line"><span>Phí vận chuyển</span><b>${ship ? LM.money(ship) : 'Miễn phí'}</b></div>
  <div class="total"><span>Tổng cộng</span><b>${LM.money(total + ship)}</b></div>
  <a class="btn btn-block btn-lg" href="/checkout">Tiến hành thanh toán</a>
  <p class="note">Miễn phí giao hàng cho đơn từ ${LM.money(FREE)}</p>
</div>`;

    wire();
  };

  const wire = () => {
    document.querySelectorAll('[data-row]').forEach((row) => {
      const id = row.getAttribute('data-row');
      const input = row.querySelector('[data-qty]');
      row.querySelector('[data-inc]')?.addEventListener('click', () => {
        LM.cart.setQty(id, (Number(input.value) || 1) + 1);
        render();
      });
      row.querySelector('[data-dec]')?.addEventListener('click', () => {
        LM.cart.setQty(id, Math.max(1, (Number(input.value) || 1) - 1));
        render();
      });
      input?.addEventListener('change', () => {
        LM.cart.setQty(id, input.value);
        render();
      });
      row.querySelector('[data-del]')?.addEventListener('click', () => {
        LM.cart.remove(id);
        LM.toast('Đã xóa sản phẩm khỏi giỏ hàng');
        render();
      });
    });
  };

  const boot = () => {
    render();
    window.addEventListener('lm:cart-changed', () => {
      // 只在数量真的变了才重绘，避免输入框失焦
      const active = document.activeElement;
      if (active && active.matches('[data-qty]')) return;
      render();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


