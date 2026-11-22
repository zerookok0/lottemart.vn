/* 下单成功页 /order/<order_number>（200 直出，URL 不变） */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);

  const orderNumber = (() => {
    const m = location.pathname.match(/\/order\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  })();

  const snapshot = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('lm_last_order') || 'null');
    } catch (e) {
      return null;
    }
  })();

  const items = (snapshot && snapshot.items) || [];
  const total = (snapshot && snapshot.total) || 0;
  const at = (snapshot && snapshot.at) || Date.now();

  const render = () => {
    const main = document.querySelector('.lm-main');
    if (!main) return;
    main.innerHTML = `
<div class="container">
  <div class="lm-done">
    <div class="lm-done-ic">${LM.icon('check')}</div>
    <h1>Đặt hàng thành công</h1>
    <p class="sub">Cảm ơn Quý khách đã mua sắm tại LOTTE Mart. Chúng tôi sẽ liên hệ xác nhận đơn hàng trong thời gian sớm nhất.</p>

    <div class="lm-done-box">
      <div class="lm-done-row"><span class="k">Mã đơn hàng</span><span class="v big">${esc(orderNumber || '—')}</span></div>
      <div class="lm-done-row"><span class="k">Thời gian đặt</span><span class="v">${LM.fmtDate(at)}</span></div>
      <div class="lm-done-row"><span class="k">Hình thức thanh toán</span><span class="v">Thẻ tín dụng / ghi nợ</span></div>
      <div class="lm-done-row"><span class="k">Trạng thái</span><span class="v" style="color:#16b364">Đang xử lý</span></div>
      <div class="lm-done-row"><span class="k">Số lượng sản phẩm</span><span class="v">${items.reduce((n, it) => n + (Number(it.qty) || 0), 0)}</span></div>
      <div class="lm-done-row"><span class="k">Tổng thanh toán</span><span class="v big">${LM.money(total)}</span></div>
      ${
        items.length
          ? `<div class="lm-done-row" style="display:block">
        ${items
          .map(
            (it) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:13px">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.name)}</span>
          <span class="txt-muted">×${it.qty}</span>
          <b>${LM.money((it.price || 0) * (it.qty || 1))}</b>
        </div>`
          )
          .join('')}
      </div>`
          : ''
      }
    </div>

    <div class="lm-done-actions">
      <a class="btn btn-outline" href="/">Tiếp tục mua sắm</a>
      <a class="btn" href="/account">Xem đơn hàng của tôi</a>
    </div>
    <p class="txt-muted" style="margin-top:18px;font-size:12px">Mọi thắc mắc vui lòng liên hệ hotline 0901 057 057 (8:00 - 21:00)</p>
  </div>
</div>`;
  };

  const boot = () => {
    render();
    // 成功页只补 PageView（Purchase 已在验证屏弹出时打过）
    try {
      if (orderNumber) sessionStorage.removeItem('lm_px_ip');
    } catch (e) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
