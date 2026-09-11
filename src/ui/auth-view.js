import {
  backspaceOtpDigits,
  createOtpDigits,
  fillOtpDigits,
  renderOtpFields
} from './otp-input.js';

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

const OTP_COOLDOWN_SECONDS = 60;

function isRateLimitError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.status === 429 ||
    message.includes('rate') ||
    message.includes('too many') ||
    message.includes('limit') ||
    message.includes('security purposes');
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
  if (isRateLimitError(error)) {
    return `请求过于频繁，请在 ${OTP_COOLDOWN_SECONDS} 秒后再试`;
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
  let cooldownTimer = null;
  let cooldownEndsAt = 0;
  let cooldownRemaining = 0;
  let state = {
    step: 'email',
    email: '',
    otpDigits: createOtpDigits(),
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
      state = { ...state, step: 'email', otpDigits: createOtpDigits(), message: '', error: false };
      render();
      root.querySelector('[name="email"]')?.focus();
    }
  };

  const onInput = event => {
    const input = event.target.closest('[data-otp-index]');
    if (!input || !root.contains(input) || inFlight) return;
    applyOtpResult(fillOtpDigits(readOtpDigits(), Number(input.dataset.otpIndex), input.value));
  };

  const onPaste = event => {
    const input = event.target.closest('[data-otp-index]');
    if (!input || !root.contains(input) || inFlight) return;
    event.preventDefault();
    const pastedValue = event.clipboardData?.getData('text') ?? '';
    applyOtpResult(fillOtpDigits(readOtpDigits(), Number(input.dataset.otpIndex), pastedValue));
  };

  const onKeyDown = event => {
    const input = event.target.closest('[data-otp-index]');
    if (!input || !root.contains(input) || inFlight) return;
    if (event.key === 'Backspace' && input.value === '') {
      event.preventDefault();
      applyOtpResult(backspaceOtpDigits(readOtpDigits(), Number(input.dataset.otpIndex)));
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

  function readOtpDigits() {
    const inputs = [...root.querySelectorAll('[data-otp-index]')];
    if (!inputs.length) return [...state.otpDigits];
    return inputs.map(input => /^\d$/.test(input.value) ? input.value : '');
  }

  function readToken() {
    return readOtpDigits().join('');
  }

  function applyOtpResult({ digits, focusIndex }) {
    state = { ...state, otpDigits: digits };
    [...root.querySelectorAll('[data-otp-index]')].forEach((input, index) => {
      input.value = digits[index];
    });
    root.querySelector(`[data-otp-index="${focusIndex}"]`)?.focus();
  }

  function render() {
    const isOtpStep = state.step === 'otp';
    const disabled = inFlight ? 'disabled' : '';
    const requestDisabled = inFlight || cooldownRemaining > 0 ? 'disabled' : '';
    const cooldownLabel = `${cooldownRemaining} 秒后可重新发送`;
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
            <button type="submit" data-action="request-otp" ${requestDisabled}>${cooldownRemaining > 0 ? cooldownLabel : (inFlight && !isOtpStep ? '正在发送…' : '发送验证码')}</button>
          </form>
          <form data-form="otp" class="otp-form" ${isOtpStep ? '' : 'hidden'} novalidate>
            <fieldset class="otp-fieldset">
              <legend>六位验证码</legend>
              ${renderOtpFields(state.otpDigits, { disabled: inFlight })}
            </fieldset>
            <button type="submit" data-action="verify-otp" ${disabled}>${inFlight ? '正在验证…' : '完成登录'}</button>
            <div class="inline-actions">
              <button type="button" class="button-link" data-action="resend-otp" ${requestDisabled}>${cooldownRemaining > 0 ? cooldownLabel : (inFlight ? '正在发送…' : '重新发送')}</button>
              <button type="button" class="button-link" data-action="change-email" ${disabled}>修改邮箱</button>
            </div>
          </form>
        </section>
      </main>`;
  }

  function updateCooldownControls() {
    const coolingDown = cooldownRemaining > 0;
    const label = `${cooldownRemaining} 秒后可重新发送`;
    const requestButton = root.querySelector('[data-action="request-otp"]');
    const resendButton = root.querySelector('[data-action="resend-otp"]');
    if (requestButton) {
      requestButton.disabled = inFlight || coolingDown;
      requestButton.textContent = coolingDown ? label : '发送验证码';
    }
    if (resendButton) {
      resendButton.disabled = inFlight || coolingDown;
      resendButton.textContent = coolingDown ? label : '重新发送';
    }
  }

  function refreshCooldownRemaining() {
    cooldownRemaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
    if (cooldownRemaining === 0) cooldownEndsAt = 0;
  }

  function startCooldown() {
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownEndsAt = Date.now() + OTP_COOLDOWN_SECONDS * 1000;
    refreshCooldownRemaining();
    render();
    cooldownTimer = setInterval(() => {
      refreshCooldownRemaining();
      if (cooldownRemaining === 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
      if (!destroyed) updateCooldownControls();
    }, 1000);
  }

  async function requestOtp({ resend = false } = {}) {
    if (inFlight || destroyed) return;
    if (cooldownEndsAt > 0) refreshCooldownRemaining();
    if (cooldownRemaining > 0) {
      state = {
        ...state,
        message: `请求过于频繁，请在 ${cooldownRemaining} 秒后再试`,
        error: true
      };
      render();
      return;
    }
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
      startCooldown();
      root.querySelector('[data-otp-index="0"]')?.focus();
    } catch (error) {
      if (destroyed) return;
      state = { ...state, message: authErrorMessage(error), error: true };
      if (isRateLimitError(error)) startCooldown();
      else render();
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
      const otpDigits = readOtpDigits();
      state = { ...state, email, otpDigits, step: 'otp', message: '请输入完整的六位数字验证码', error: true };
      render();
      const firstEmptyIndex = otpDigits.findIndex(digit => !digit);
      root.querySelector(`[data-otp-index="${firstEmptyIndex < 0 ? 0 : firstEmptyIndex}"]`)?.focus();
      return;
    }

    inFlight = true;
    state = { ...state, email, otpDigits: readOtpDigits(), step: 'otp', message: '正在验证验证码…', error: false };
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
        root.addEventListener('input', onInput);
        root.addEventListener('paste', onPaste);
        root.addEventListener('keydown', onKeyDown);
        listening = true;
      }
      render();
      root.querySelector('[name="email"]')?.focus();
    },

    destroy() {
      destroyed = true;
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = null;
      cooldownEndsAt = 0;
      cooldownRemaining = 0;
      if (listening) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('input', onInput);
        root.removeEventListener('paste', onPaste);
        root.removeEventListener('keydown', onKeyDown);
      }
      listening = false;
      root.replaceChildren();
    }
  };
}
