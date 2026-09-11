import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthView } from '../src/ui/auth-view.js';
import { createTrackerView } from '../src/ui/tracker-view.js';
import { bootstrap } from '../src/main.js';

const initialData = {
  applications: [
    {
      id: 'tencent-old',
      company: 'Tencent',
      companyKey: 'tencent',
      role: '产品经理',
      status: '已投递',
      updatedAt: '2026-09-01T10:00:00Z',
      nextDate: '2026-09-10',
      tags: []
    },
    {
      id: 'tencent-new',
      company: 'Tencent',
      companyKey: 'tencent',
      role: '策略产品经理',
      status: '面试中',
      updatedAt: '2026-09-02T10:00:00Z',
      nextDate: '2026-09-05',
      tags: ['AI']
    },
    {
      id: 'bytedance',
      company: 'ByteDance',
      companyKey: 'bytedance',
      role: '增长产品经理',
      status: '准备投递',
      updatedAt: '2026-09-03T10:00:00Z',
      nextDate: null,
      tags: []
    }
  ],
  interviews: [],
  statusHistory: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTracker(overrides = {}) {
  return {
    loadAll: vi.fn().mockResolvedValue(clone(initialData)),
    saveApplication: vi.fn().mockResolvedValue({ id: 'new-application' }),
    deleteApplication: vi.fn().mockResolvedValue(),
    saveInterview: vi.fn().mockResolvedValue({ id: 'new-interview' }),
    deleteInterview: vi.fn().mockResolvedValue(),
    ...overrides
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function click(selector) {
  document.querySelector(selector).click();
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the email OTP view', () => {
  it('reveals a six-digit OTP form after sending an email code', async () => {
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    expect(auth.requestOtp).toHaveBeenCalledWith('owner@example.com');
    const otpInputs = [...document.querySelectorAll('[data-otp-index]')];
    expect(otpInputs).toHaveLength(6);
    expect(otpInputs.every(input => input.maxLength === 1)).toBe(true);
    expect(document.querySelector('[data-auth-message]').textContent).toContain('验证码已发送');
  });

  it('moves through six OTP boxes and verifies their joined value', async () => {
    const auth = {
      requestOtp: vi.fn().mockResolvedValue(),
      verifyOtp: vi.fn().mockResolvedValue()
    };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();
    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    const otpInputs = [...document.querySelectorAll('[data-otp-index]')];
    otpInputs.forEach((input, index) => {
      input.value = String(index + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (index < 5) expect(document.activeElement).toBe(otpInputs[index + 1]);
    });
    click('[data-action="verify-otp"]');
    await flushPromises();

    expect(auth.verifyOtp).toHaveBeenCalledWith('owner@example.com', '123456');
  });

  it('distributes a pasted OTP and moves backward from an empty box', async () => {
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();
    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    const otpInputs = [...document.querySelectorAll('[data-otp-index]')];
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => '12 34-56' }
    });
    otpInputs[0].dispatchEvent(pasteEvent);
    expect(otpInputs.map(input => input.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(document.activeElement).toBe(otpInputs[5]);

    otpInputs[5].value = '';
    otpInputs[5].dispatchEvent(new Event('input', { bubbles: true }));
    otpInputs[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    expect(otpInputs[4].value).toBe('');
    expect(document.activeElement).toBe(otpInputs[4]);
  });

  it('fills all boxes from the start without auto-submitting when a complete OTP is pasted into a middle box', async () => {
    const auth = {
      requestOtp: vi.fn().mockResolvedValue(),
      verifyOtp: vi.fn().mockResolvedValue()
    };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();
    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    const otpInputs = [...document.querySelectorAll('[data-otp-index]')];
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => '123456' }
    });
    otpInputs[2].dispatchEvent(pasteEvent);

    expect(otpInputs.map(input => input.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(document.activeElement).toBe(otpInputs[5]);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('serializes OTP operations and keeps the email after verification fails', async () => {
    let rejectRequest;
    const auth = {
      requestOtp: vi.fn(() => new Promise((_, reject) => { rejectRequest = reject; })),
      verifyOtp: vi.fn().mockRejectedValue(new Error('token expired'))
    };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();
    document.querySelector('[name="email"]').value = 'owner@example.com';

    click('[data-action="request-otp"]');
    click('[data-action="request-otp"]');
    expect(auth.requestOtp).toHaveBeenCalledTimes(1);
    rejectRequest(new Error('network offline'));
    await flushPromises();
    expect(document.querySelector('[data-auth-message]').textContent).toBe('网络连接异常，请检查后重试');

    auth.requestOtp.mockResolvedValueOnce();
    click('[data-action="request-otp"]');
    await flushPromises();
    [...document.querySelectorAll('[data-otp-index]')].forEach((input, index) => {
      input.value = String(index + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('[data-action="verify-otp"]');
    await flushPromises();

    expect(auth.verifyOtp).toHaveBeenCalledWith('owner@example.com', '123456');
    expect(document.querySelector('[name="email"]').value).toBe('owner@example.com');
    expect(document.querySelector('[data-auth-message]').textContent).toBe('验证码已过期，请重新发送');
  });

  it('starts a 60-second resend countdown after sending an OTP', async () => {
    vi.useFakeTimers();
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    let resend = document.querySelector('[data-action="resend-otp"]');
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toBe('60 秒后可重新发送');

    await vi.advanceTimersByTimeAsync(1000);
    resend = document.querySelector('[data-action="resend-otp"]');
    expect(resend.textContent).toBe('59 秒后可重新发送');

    await vi.advanceTimersByTimeAsync(59000);
    resend = document.querySelector('[data-action="resend-otp"]');
    expect(resend.disabled).toBe(false);
    expect(resend.textContent).toBe('重新发送');

    view.destroy();
  });

  it('uses elapsed time so a delayed browser timer does not extend the cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    vi.setSystemTime(new Date('2026-09-11T12:01:01Z'));
    await vi.advanceTimersByTimeAsync(1000);

    const resend = document.querySelector('[data-action="resend-otp"]');
    expect(resend.disabled).toBe(false);
    expect(resend.textContent).toBe('重新发送');

    view.destroy();
  });

  it('suppresses another OTP request during the cooldown and clears its timer on destroy', async () => {
    vi.useFakeTimers();
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();
    click('[data-action="resend-otp"]');

    expect(auth.requestOtp).toHaveBeenCalledTimes(1);
    const timersBeforeDestroy = vi.getTimerCount();
    expect(timersBeforeDestroy).toBeGreaterThan(0);

    view.destroy();
    expect(vi.getTimerCount()).toBeLessThan(timersBeforeDestroy);
  });

  it('keeps a partially entered OTP while the resend countdown updates', async () => {
    vi.useFakeTimers();
    const auth = { requestOtp: vi.fn().mockResolvedValue() };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();
    [...document.querySelectorAll('[data-otp-index]')].slice(0, 3).forEach((input, index) => {
      input.value = String(index + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect([...document.querySelectorAll('[data-otp-index]')].map(input => input.value).join('')).toBe('123');

    view.destroy();
  });

  it('shows a 60-second retry message when Supabase rate-limits OTP sending', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(
      new Error('For security purposes, you can only request this after 60 seconds.'),
      { status: 429 }
    );
    const auth = { requestOtp: vi.fn().mockRejectedValue(rateLimitError) };
    const view = createAuthView(document.querySelector('#app'), auth);
    view.show();

    document.querySelector('[name="email"]').value = 'owner@example.com';
    click('[data-action="request-otp"]');
    await flushPromises();

    const requestButton = document.querySelector('[data-action="request-otp"]');
    expect(document.querySelector('[data-auth-message]').textContent)
      .toBe('请求过于频繁，请在 60 秒后再试');
    expect(requestButton.disabled).toBe(true);
    expect(requestButton.textContent).toBe('60 秒后可重新发送');

    view.destroy();
  });
});

describe('the grouped tracker view', () => {
  it('groups roles by company and orders groups and roles by newest activity', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker(),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect([...document.querySelectorAll('[data-company-key]')].map(el => el.dataset.companyKey))
      .toEqual(['bytedance', 'tencent']);
    expect([...document.querySelectorAll('[data-company-key="tencent"] [data-application-id]')]
      .map(el => el.dataset.applicationId)).toEqual(['tencent-new', 'tencent-old']);
  });

  it('filters roles before retaining their company groups', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker(),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    document.querySelector('[name="status-filter"]').value = '面试中';
    document.querySelector('[name="status-filter"]').dispatchEvent(new Event('change', { bubbles: true }));

    expect([...document.querySelectorAll('[data-company-key]')].map(el => el.dataset.companyKey))
      .toEqual(['tencent']);
    expect(document.querySelector('[data-application-id]').dataset.applicationId).toBe('tencent-new');
  });

  it('keeps mutation and export controls inert while initial loading is pending', async () => {
    const initialLoad = deferred();
    const tracker = createTracker({
      loadAll: vi.fn().mockReturnValueOnce(initialLoad.promise)
    });
    const downloadBackup = vi.fn();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() },
      downloadBackup
    });

    const mountPromise = view.mount();
    await flushPromises();

    expect(document.querySelector('[data-action="add-application"]').disabled).toBe(true);
    expect(document.querySelector('[data-action="export-backup"]').disabled).toBe(true);
    click('[data-action="add-application"]');
    click('[data-action="export-backup"]');

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(tracker.loadAll).toHaveBeenCalledTimes(1);
    expect(downloadBackup).not.toHaveBeenCalled();

    initialLoad.resolve(clone(initialData));
    await mountPromise;

    expect(document.querySelector('[data-action="add-application"]').disabled).toBe(false);
    expect(document.querySelector('[data-action="export-backup"]').disabled).toBe(false);
  });

  it('ignores an older reload result when it resolves after a newer save reload', async () => {
    const olderReload = deferred();
    const saveReload = deferred();
    const tracker = createTracker({
      loadAll: vi.fn()
        .mockResolvedValueOnce(clone(initialData))
        .mockReturnValueOnce(olderReload.promise)
        .mockReturnValueOnce(saveReload.promise)
    });
    const downloadBackup = vi.fn();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() },
      downloadBackup
    });
    await view.mount();

    click('[data-action="export-backup"]');
    await flushPromises();

    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();

    saveReload.resolve({
      applications: [
        { id: 'new-application', company: 'OpenAI', companyKey: 'openai', role: '产品工程师', status: '准备投递', updatedAt: '2026-09-04T10:00:00Z', tags: [] }
      ],
      interviews: [],
      statusHistory: []
    });
    await flushPromises();
    olderReload.resolve(clone(initialData));
    await flushPromises();

    expect(document.querySelector('[data-application-id="new-application"]')).not.toBeNull();
    expect(document.querySelector('[data-application-id="bytedance"]')).toBeNull();
    expect(downloadBackup).not.toHaveBeenCalled();
  });

  it('ignores an older rejected reload after a newer save reload has updated the UI', async () => {
    const olderReload = deferred();
    const saveReload = deferred();
    const tracker = createTracker({
      loadAll: vi.fn()
        .mockResolvedValueOnce(clone(initialData))
        .mockReturnValueOnce(olderReload.promise)
        .mockReturnValueOnce(saveReload.promise)
    });
    const downloadBackup = vi.fn();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() },
      downloadBackup
    });
    await view.mount();

    click('[data-action="export-backup"]');
    await flushPromises();
    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();

    saveReload.resolve({
      applications: [
        { id: 'new-application', company: 'OpenAI', companyKey: 'openai', role: '产品工程师', status: '准备投递', updatedAt: '2026-09-04T10:00:00Z', tags: [] }
      ],
      interviews: [],
      statusHistory: []
    });
    await flushPromises();
    olderReload.reject(new Error('older request failed late'));
    await flushPromises();

    expect(document.querySelector('[data-application-id="new-application"]')).not.toBeNull();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已同步');
    expect(downloadBackup).not.toHaveBeenCalled();
  });

  it('does not report a stale retry reload as synchronized after a newer reload failure', async () => {
    const retryReload = deferred();
    const tracker = createTracker();
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockRejectedValueOnce(new Error('first post-save reload failed'))
      .mockReturnValueOnce(retryReload.promise)
      .mockRejectedValueOnce(new Error('second post-save reload failed'));
    tracker.saveApplication
      .mockResolvedValueOnce({ id: 'first-application' })
      .mockResolvedValueOnce({ id: 'second-application' });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');

    click('[data-action="retry-reload"]');
    await flushPromises();
    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'Anthropic';
    document.querySelector('[name="role"]').value = '产品经理';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');

    retryReload.resolve(clone(initialData));
    await flushPromises();

    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');
    expect(tracker.saveApplication).toHaveBeenCalledTimes(2);
  });

  it('saves an application and reports confirmed synchronization', async () => {
    const tracker = createTracker();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();

    expect(tracker.saveApplication).toHaveBeenCalledWith(expect.objectContaining({
      company: 'OpenAI',
      role: '产品工程师',
      status: '准备投递'
    }));
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已同步');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('reloads cloud data before exporting a backup', async () => {
    const tracker = createTracker();
    const confirmedCloudData = {
      applications: [{ ...initialData.applications[0], id: 'confirmed-from-cloud' }],
      interviews: [{ id: 'confirmed-interview' }],
      statusHistory: [{ id: 1, applicationId: 'confirmed-from-cloud' }]
    };
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockResolvedValueOnce(clone(confirmedCloudData));
    const downloadBackup = vi.fn();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() },
      downloadBackup
    });
    await view.mount();

    click('[data-action="export-backup"]');
    await flushPromises();

    expect(tracker.loadAll).toHaveBeenCalledTimes(2);
    expect(downloadBackup).toHaveBeenCalledWith(confirmedCloudData, document);
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已同步');
  });

  it('renders stored text safely and refuses non-http job links', async () => {
    const tracker = createTracker({
      loadAll: vi.fn().mockResolvedValue({
        applications: [
          {
            id: 'unsafe',
            company: '<img src=x onerror=alert(1)>',
            companyKey: 'unsafe',
            role: '<script>alert(1)</script>',
            status: '已投递',
            updatedAt: '2026-09-04T10:00:00Z',
            jobUrl: 'javascript:alert(1)',
            notes: '<b>不要执行</b>',
            tags: []
          }
        ],
        interviews: [],
        statusHistory: []
      })
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="view-application"][data-id="unsafe"]');

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(dialog.textContent).toContain('<script>alert(1)</script>');
    expect(dialog.textContent).toContain('<b>不要执行</b>');
    expect(dialog.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(dialog.textContent).toContain('未填写或链接无效');
  });

  it('saves an interview retrospective for the selected role', async () => {
    const tracker = createTracker();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-interview"]');
    document.querySelector('[name="applicationId"]').value = 'tencent-new';
    document.querySelector('[name="date"]').value = '2026-09-04';
    document.querySelector('[name="stage"]').value = '一面';
    document.querySelector('[name="questions"]').value = '如何设计增长实验？';
    document.querySelector('[data-form="interview"] [type="submit"]').click();
    await flushPromises();

    expect(tracker.saveInterview).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: 'tencent-new',
      stage: '一面',
      questions: '如何设计增长实验？'
    }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('validates interview stage locally before saving', async () => {
    const tracker = createTracker();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-interview"]');
    document.querySelector('[name="applicationId"]').value = 'tencent-new';
    document.querySelector('[name="date"]').value = '2026-09-04';
    document.querySelector('[data-form="interview"] [type="submit"]').click();
    await flushPromises();

    expect(tracker.saveInterview).not.toHaveBeenCalled();
    expect(document.querySelector('[data-form-error]').textContent).toBe('请选择关联岗位并填写面试日期和轮次');
    expect(document.querySelector('[name="stage"]').hasAttribute('required')).toBe(true);
  });

  it('keeps failed application form values visible for a retry', async () => {
    const tracker = createTracker({ saveApplication: vi.fn().mockRejectedValue(new Error('offline')) });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[name="company"]').value).toBe('OpenAI');
    expect(document.querySelector('[name="role"]').value).toBe('产品工程师');
    expect(document.querySelector('[data-form-error]').textContent).toBe('同步失败，请重试');
    expect(document.querySelector('[data-sync-status]').textContent).toBe('同步失败，请重试');
  });

  it('keeps failed interview form values visible for a retry', async () => {
    const tracker = createTracker({ saveInterview: vi.fn().mockRejectedValue(new Error('offline')) });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-interview"]');
    document.querySelector('[name="applicationId"]').value = 'tencent-new';
    document.querySelector('[name="date"]').value = '2026-09-04';
    document.querySelector('[name="stage"]').value = '终面';
    document.querySelector('[name="questions"]').value = '如何处理冲突？';
    document.querySelector('[data-form="interview"] [type="submit"]').click();
    await flushPromises();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[name="applicationId"]').value).toBe('tencent-new');
    expect(document.querySelector('[name="date"]').value).toBe('2026-09-04');
    expect(document.querySelector('[name="stage"]').value).toBe('终面');
    expect(document.querySelector('[name="questions"]').value).toBe('如何处理冲突？');
    expect(document.querySelector('[data-form-error]').textContent).toBe('同步失败，请重试');
    expect(document.querySelector('[data-sync-status]').textContent).toBe('同步失败，请重试');
  });

  it('does not leave a retryable application form when save succeeds but reload fails', async () => {
    const tracker = createTracker();
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockRejectedValueOnce(new Error('reload offline'))
      .mockResolvedValueOnce({
        ...clone(initialData),
        applications: [
          { id: 'new-application', company: 'OpenAI', companyKey: 'openai', role: '产品工程师', status: '准备投递', updatedAt: '2026-09-04T10:00:00Z', tags: [] },
          ...clone(initialData).applications
        ]
      });
    tracker.saveApplication.mockResolvedValueOnce({ id: 'new-application' });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-application"]');
    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();

    expect(tracker.saveApplication).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-form="application"]')).toBeNull();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');

    click('[data-action="retry-reload"]');
    await flushPromises();

    expect(tracker.saveApplication).toHaveBeenCalledTimes(1);
    expect(tracker.loadAll).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-application-id="new-application"]')).not.toBeNull();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已同步');
  });

  it('does not leave a retryable interview form when save succeeds but reload fails', async () => {
    const tracker = createTracker();
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockRejectedValueOnce(new Error('reload offline'))
      .mockResolvedValueOnce({
        ...clone(initialData),
        interviews: [
          { id: 'new-interview', applicationId: 'tencent-new', date: '2026-09-04', stage: '一面', questions: '如何设计增长实验？' }
        ]
      });
    tracker.saveInterview.mockResolvedValueOnce({ id: 'new-interview' });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-interview"]');
    document.querySelector('[name="applicationId"]').value = 'tencent-new';
    document.querySelector('[name="date"]').value = '2026-09-04';
    document.querySelector('[name="stage"]').value = '一面';
    document.querySelector('[name="questions"]').value = '如何设计增长实验？';
    document.querySelector('[data-form="interview"] [type="submit"]').click();
    await flushPromises();

    expect(tracker.saveInterview).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-form="interview"]')).toBeNull();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');

    click('[data-action="retry-reload"]');
    await flushPromises();

    expect(tracker.saveInterview).toHaveBeenCalledTimes(1);
    expect(tracker.loadAll).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-interview-id="new-interview"]')).not.toBeNull();
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已同步');
  });

  it('warns that deleting an application also removes its interviews and history', async () => {
    const tracker = createTracker();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="delete-application"][data-id="tencent-new"]');

    expect(globalThis.confirm).toHaveBeenCalledWith('删除该投递记录？关联的面试记录和状态历史将一并删除，且无法恢复。');
    expect(tracker.deleteApplication).toHaveBeenCalledWith('tencent-new');
  });

  it('closes an open modal when Escape is pressed', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker(),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();
    click('[data-action="add-application"]');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('session bootstrap', () => {
  it('swaps views and destroys the previous view before session remounts', async () => {
    const authView = { show: vi.fn(), destroy: vi.fn() };
    const trackerView = { mount: vi.fn().mockResolvedValue(), destroy: vi.fn() };
    let authCallback;
    const authService = {
      getSession: vi.fn().mockResolvedValue(null),
      onAuthStateChange: vi.fn(callback => {
        authCallback = callback;
        return vi.fn();
      })
    };

    const app = await bootstrap({
      root: document.querySelector('#app'),
      authService,
      trackerService: {},
      createAuthView: vi.fn(() => authView),
      createTrackerView: vi.fn(() => trackerView)
    });
    await authCallback('SIGNED_IN', { accessToken: 'session' });

    expect(authView.show).toHaveBeenCalledOnce();
    expect(authView.destroy).toHaveBeenCalledOnce();
    expect(trackerView.mount).toHaveBeenCalledOnce();
    app.destroy();
    expect(trackerView.destroy).toHaveBeenCalledOnce();
  });
});
