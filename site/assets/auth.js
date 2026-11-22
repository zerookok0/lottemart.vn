/* 会员：登录 / 注册 / 账号 */
(function () {
  const LM = window.LM || {};
  const esc = (s) => LM.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);

  const api = async (url, body) => {
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return res.json().catch(() => ({}));
  };

  /* 登录态变化：通知页头 / 其它模块（不刷新也能看到 Hi, ...） */
  const broadcast = (user) => {
    try {
      window.dispatchEvent(new CustomEvent('lm:auth-changed', { detail: user || null }));
    } catch (e) {}
  };

  const auth = (LM.auth = {
    _user: undefined,
    async me(force) {
      if (!force && auth._user !== undefined) return auth._user;
      try {
        const j = await api('/api/customer/me');
        auth._user = j && j.user ? j.user : null;
      } catch (e) {
        auth._user = null;
      }
      return auth._user;
    },
    async login(email, password) {
      const j = await api('/api/customer/login', { email, password });
      if (j && j.ok) {
        auth._user = j.user || null;
        broadcast(auth._user);
      }
      return j;
    },
    async register(payload) {
      const j = await api('/api/customer/register', payload);
      if (j && j.ok) {
        auth._user = j.user || null;
        broadcast(auth._user);
      }
      return j;
    },
    async logout() {
      const j = await api('/api/customer/logout', {});
      auth._user = null;
      broadcast(null);
      return j;
    },
  });

  const err = (msg) => {
    const box = $('[data-form-err]');
    if (!box) return LM.toast(msg, 'error');
    box.textContent = msg;
    box.classList.add('on');
  };
  const clearErr = () => {
    const box = $('[data-form-err]');
    if (box) {
      box.textContent = '';
      box.classList.remove('on');
    }
  };

  /* ---------------------------------------------------------------- 登录 */
  const wireLogin = () => {
    const form = $('[data-login-form]');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';
    const next = LM.qs('next') || '/account';

    // 已登录直接进账号页，别让人再登一次
    auth.me().then((user) => {
      if (user && location.pathname === '/login') location.replace(next);
    });

    document.querySelectorAll('[data-auth-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-auth-tab]').forEach((b) => b.classList.toggle('on', b === btn));
        const isOtp = btn.getAttribute('data-auth-tab') === 'otp';
        $('[data-pane="account"]')?.classList.toggle('hidden', isOtp);
        $('[data-pane="otp"]')?.classList.toggle('hidden', !isOtp);
      })
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErr();
      const email = (form.querySelector('[name="email"]').value || '').trim();
      const password = (form.querySelector('[name="password"]').value || '').trim();
      // 只挡空值：账号可以是邮箱 / 手机号 / 用户名，格式不校验
      if (!email || !password) return err('Vui lòng nhập tài khoản và mật khẩu');
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.setAttribute('aria-busy', 'true');
        btn.textContent = 'Đang đăng nhập…';
      }
      try {
        const j = await auth.login(email, password);
        if (j && j.ok) {
          LM.toast(`Đăng nhập thành công — Xin chào ${(j.user && j.user.name) || email}!`);
          setTimeout(() => {
            location.href = next;
          }, 450);
        } else {
          err((j && j.message) || 'Đăng nhập không thành công, vui lòng thử lại');
        }
      } catch (e2) {
        err('Không kết nối được máy chủ, vui lòng thử lại');
      } finally {
        if (btn && (!form.dataset.done || true)) {
          btn.removeAttribute('aria-busy');
          btn.textContent = 'Đăng nhập';
        }
      }
    });
  };

  /* ---------------------------------------------------------------- 注册 */
  const wireRegister = () => {
    const form = $('[data-register-form]');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErr();
      const val = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
      const payload = {
        name: val('name'),
        email: val('email'),
        phone: val('phone'),
        password: val('password'),
        password2: val('password2'),
        city: val('city'),
        address: val('address'),
        zip: val('zip'),
        membership: val('membership') || 'member',
        agree: Boolean(form.querySelector('[name="agree"]')?.checked),
      };
      if (!payload.name) return err('Vui lòng nhập họ tên');
      if (!payload.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) return err('Email không hợp lệ');
      if (!payload.password || payload.password.length < 6) return err('Mật khẩu phải có ít nhất 6 ký tự');
      if (payload.password !== payload.password2) return err('Mật khẩu nhập lại không khớp');
      if (!payload.agree) return err('Vui lòng đồng ý điều kiện & điều khoản');

      try {
        const j = await auth.register(payload);
        if (j && j.ok) {
          LM.toast('Đăng ký thành công');
          location.href = '/account';
        } else {
          err((j && j.message) || 'Đăng ký không thành công');
        }
      } catch (e2) {
        err('Không kết nối được máy chủ, vui lòng thử lại');
      }
    });
  };

  /* ---------------------------------------------------------------- 账号 */
  const wireAccount = async () => {
    const box = $('[data-account]');
    if (!box) return;
    const user = await auth.me(true);
    if (!user) {
      location.href = '/login?next=/account';
      return;
    }

    const orders = (() => {
      try {
        return JSON.parse(localStorage.getItem('lm_orders') || '[]');
      } catch (e) {
        return [];
      }
    })();

    box.innerHTML = `
<div class="lm-account-side">
  <div class="who">
    <b>${esc(user.name || 'Thành viên')}</b>
    <span>${esc(user.email || '')}</span>
  </div>
  <nav>
    <button type="button" class="on" data-pane-btn="profile">Thông tin tài khoản</button>
    <button type="button" data-pane-btn="orders">Đơn hàng của tôi</button>
    <button type="button" data-pane-btn="logout">Đăng xuất</button>
  </nav>
</div>
<div class="lm-account-body">
  <div data-pane="profile">
    <h2>Thông tin tài khoản</h2>
    <dl class="lm-kv">
      <dt>Họ và tên</dt><dd>${esc(user.name || '—')}</dd>
      <dt>Email</dt><dd>${esc(user.email || '—')}</dd>
      <dt>Số điện thoại</dt><dd>${esc(user.phone || '—')}</dd>
      <dt>Hạng thành viên</dt><dd>${esc(user.membership || 'Member')}</dd>
      <dt>Ngày tham gia</dt><dd>${LM.fmtDate(user.createdAt || Date.now())}</dd>
      <dt>Địa chỉ</dt><dd>${esc(user.address || '—')}</dd>
      <dt>Mã bưu chính</dt><dd>${esc(user.zip || '—')}</dd>
    </dl>
  </div>
  <div data-pane="orders" class="hidden">
    <h2>Đơn hàng của tôi</h2>
    ${
      orders.length
        ? orders
            .map(
              (o) => `<div class="lm-order-item">
      <div><div class="no">${esc(o.order_number)}</div><div class="dt">${LM.fmtDate(o.at)}</div></div>
      <div>${(o.items || []).reduce((n, it) => n + Number(it.qty || 0), 0)} sản phẩm</div>
      <div><b>${LM.money(o.total || 0)}</b></div>
    </div>`
            )
            .join('')
        : '<p class="txt-muted">Bạn chưa có đơn hàng nào.</p>'
    }
  </div>
</div>`;

    box.querySelectorAll('[data-pane-btn]').forEach((b) =>
      b.addEventListener('click', async () => {
        const key = b.getAttribute('data-pane-btn');
        if (key === 'logout') {
          await auth.logout();
          LM.toast('Đã đăng xuất');
          setTimeout(() => (location.href = '/'), 400);
          return;
        }
        box.querySelectorAll('[data-pane-btn]').forEach((x) => x.classList.toggle('on', x === b));
        box.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.getAttribute('data-pane') !== key));
      })
    );
  };

  const boot = () => {
    wireLogin();
    wireRegister();
    wireAccount();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

