function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function authErrorMessage(error) {
  const message = String(error?.message ?? '').toLowerCase();
  if (message.includes('expired') || message.includes('token has expired')) {
    return '验证码已过期，请重新发送';
  }
  if (message.includes('invalid') && (message.includes('token') || message.includes('otp'))) {
    return '验证码错误，请检查后重试';
  }
  if (
    message.includes('not found') ||
    message.includes('signups not allowed') ||
    message.includes('not allowed') ||
    message.includes('email address not authorized')
  ) {
    return '该邮箱未获授权，请联系管理员';
  }
  if (message.includes('rate') || message.includes('too many') || message.includes('limit')) {
    return '操作过于频繁，请稍后再试';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('offline')) {
    return '网络连接异常，请检查后重试';
  }
  return '操作失败，请稍后重试';
}

export function createAuthView(root, authService) {
  let destroyed = false;
  let listening = false;
  let inFlight = false;
  let state = {
    step: 'email',
    email: '',
    token: '',
    message: '',
    error: false
  };

  const onClick = event => {
    const control = event.target.closest('[data-action]');
    if (!control || !root.contains(control)) return;
    event.preventDefault();

    if (control.dataset.action === 'request-otp') requestOtp();
    if (control.dataset.action === 'resend-otp') requestOtp({ resend: true });
    if (control.dataset.action === 'verify-otp') verifyOtp();
    if (control.dataset.action === 'change-email') {
      if (inFlight) return;
      state = { ...state, step: 'email', token: '', message: '', error: false };
      render();
      root.querySelector('[name="email"]')?.focus();
    }
  };

  const onSubmit = event => {
    const form = event.target.closest('form');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    if (form.dataset.form === 'email') requestOtp();
    if (form.dataset.form === 'otp') verifyOtp();
  };

  function readEmail() {
    return root.querySelector('[name="email"]')?.value.trim() ?? state.email;
  }

  function readToken() {
    return root.querySelector('[name="token"]')?.value.trim() ?? state.token;
  }

  function render() {
    const isOtpStep = state.step === 'otp';
    const disabled = inFlight ? 'disabled' : '';
    const messageClass = state.error ? 'is-error' : 'is-success';
    root.innerHTML = `
      <main class="auth-shell" aria-labelledby="auth-title">
        <section class="auth-card">
          <p class="eyebrow">私有云端求职进度板</p>
          <h1 id="auth-title">登录后管理你的求职进度</h1>
          <p class="muted">仅限已预先授权的邮箱，不提供注册入口。</p>
          <p class="form-message ${messageClass}" data-auth-message aria-live="polite">${escapeHtml(state.message)}</p>
          <form data-form="email" novalidate>
            <label for="login-email">邮箱地址</label>
            <input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" value="${escapeHtml(state.email)}" ${disabled} required>
            <button type="submit" data-action="request-otp" ${disabled}>${inFlight && !isOtpStep ? '正在发送…' : '发送验证码'}</button>
          </form>
          <form data-form="otp" class="otp-form" ${isOtpStep ? '' : 'hidden'} novalidate>
            <label for="login-token">六位验证码</label>
            <input id="login-token" name="token" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" value="${escapeHtml(state.token)}" ${disabled} ${isOtpStep ? 'required' : ''}>
            <button type="submit" data-action="verify-otp" ${disabled}>${inFlight ? '正在验证…' : '完成登录'}</button>
            <div class="inline-actions">
              <button type="button" class="button-link" data-action="resend-otp" ${disabled}>重新发送</button>
              <button type="button" class="button-link" data-action="change-email" ${disabled}>修改邮箱</button>
            </div>
          </form>
        </section>
      </main>`;
  }

  async function requestOtp({ resend = false } = {}) {
    if (inFlight || destroyed) return;
    const email = readEmail();
    if (!isEmail(email)) {
      state = { ...state, email, message: '请输入有效的邮箱地址', error: true };
      render();
      root.querySelector('[name="email"]')?.focus();
      return;
    }

    inFlight = true;
    state = { ...state, email, message: resend ? '正在重新发送验证码…' : '正在发送验证码…', error: false };
    render();
    try {
      await authService.requestOtp(email);
      if (destroyed) return;
      state = { ...state, step: 'otp', message: '验证码已发送，请查收邮箱', error: false };
      render();
      root.querySelector('[name="token"]')?.focus();
    } catch (error) {
      if (destroyed) return;
      state = { ...state, message: authErrorMessage(error), error: true };
      render();
      root.querySelector('[name="email"]')?.focus();
    } finally {
      inFlight = false;
      if (!destroyed) render();
    }
  }

  async function verifyOtp() {
    if (inFlight || destroyed) return;
    const email = readEmail();
    const token = readToken();
    if (!/^\d{6}$/.test(token)) {
      state = { ...state, email, token, step: 'otp', message: '请输入六位数字验证码', error: true };
      render();
      root.querySelector('[name="token"]')?.focus();
      return;
    }

    inFlight = true;
    state = { ...state, email, token, step: 'otp', message: '正在验证验证码…', error: false };
    render();
    try {
      await authService.verifyOtp(email, token);
      if (destroyed) return;
      state = { ...state, message: '登录成功，正在进入…', error: false };
    } catch (error) {
      if (destroyed) return;
      state = { ...state, message: authErrorMessage(error), error: true };
    } finally {
      inFlight = false;
      if (!destroyed) render();
    }
  }

  return {
    show() {
      if (destroyed) return;
      if (!listening) {
        root.addEventListener('click', onClick);
        root.addEventListener('submit', onSubmit);
        listening = true;
      }
      render();
      root.querySelector('[name="email"]')?.focus();
    },

    destroy() {
      destroyed = true;
      if (listening) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
      }
      listening = false;
      root.replaceChildren();
    }
  };
}
