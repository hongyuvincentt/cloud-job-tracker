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
    saveDailyGoal: vi.fn().mockImplementation(target => Promise.resolve(target)),
    saveCheckin: vi.fn().mockImplementation(form => Promise.resolve({ id: 'new-checkin', ...form })),
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
  function paginatedData() {
    return {
      applications: Array.from({ length: 7 }, (_, index) => ({
        id: `company-${index + 1}`,
        company: `Company ${index + 1}`,
        companyKey: `company-${index + 1}`,
        role: `岗位 ${index + 1}`,
        status: index === 6 ? '面试中' : '已投递',
        updatedAt: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
        tags: []
      })).concat({
        id: 'company-7-second-role',
        company: 'Company 7',
        companyKey: 'company-7',
        role: '岗位 7B',
        status: '面试中',
        updatedAt: '2026-09-07T09:00:00Z',
        tags: []
      }),
      interviews: [{
        id: 'interview-1',
        applicationId: 'company-7',
        date: '2026-09-08',
        stage: '一面',
        questions: '请介绍一个最有挑战的项目'
      }],
      statusHistory: []
    };
  }

  it('shows today’s China-time goal and records an automatic check-in when it is completed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T11:00:00Z'));
    const tracker = createTracker({
      loadAll: vi.fn().mockResolvedValue({
        applications: [
          { id: 'today-1', company: 'A', companyKey: 'a', role: '岗位 1', status: '已投递', createdAt: '2026-09-14T16:01:00Z', updatedAt: '2026-09-14T16:01:00Z', tags: [] },
          { id: 'today-2', company: 'B', companyKey: 'b', role: '岗位 2', status: '已投递', createdAt: '2026-09-15T02:00:00Z', updatedAt: '2026-09-15T02:00:00Z', tags: [] },
          { id: 'today-3', company: 'C', companyKey: 'c', role: '岗位 3', status: '已投递', createdAt: '2026-09-15T03:00:00Z', updatedAt: '2026-09-15T03:00:00Z', tags: [] }
        ],
        interviews: [],
        statusHistory: [],
        dailyGoal: 3,
        checkins: [{ checkinDate: '2026-09-14', source: 'automatic' }]
      })
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect(document.querySelector('[data-goal-progress]').textContent.trim()).toBe('3/3');
    expect(document.querySelector('[data-goal-message]').textContent).toBe('今日目标完成，打卡已记录。继续保持！');
    expect(document.querySelector('[data-checkin-streak]').textContent).toContain('连续打卡 2 天');
    expect(tracker.saveCheckin).toHaveBeenCalledWith({
      checkinDate: '2026-09-15',
      goalTarget: 3,
      completedCount: 3,
      source: 'automatic'
    });

    view.destroy();
  });

  it('updates the daily target and supports an unlimited historical makeup check-in', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T11:00:00Z'));
    const tracker = createTracker({
      loadAll: vi.fn().mockResolvedValue({
        applications: [], interviews: [], statusHistory: [], dailyGoal: 3, checkins: []
      })
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const goalForm = document.querySelector('[data-form="daily-goal"]');
    goalForm.querySelector('[name="daily-target"]').value = '5';
    goalForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(tracker.saveDailyGoal).toHaveBeenCalledWith(5);
    expect(document.querySelector('[data-goal-progress]').textContent.trim()).toBe('0/5');

    const makeupForm = document.querySelector('[data-form="makeup-checkin"]');
    makeupForm.querySelector('[name="makeup-date"]').value = '2026-08-01';
    makeupForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(tracker.saveCheckin).toHaveBeenCalledWith({
      checkinDate: '2026-08-01',
      goalTarget: 5,
      completedCount: 5,
      source: 'makeup'
    });
    expect(document.querySelector('[data-checkin-feedback]').textContent).toContain('2026-08-01 已补签');

    view.destroy();
  });

  it('shows the final reminder after 22:00 China time when the goal is incomplete', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T14:05:00Z'));
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({
        loadAll: vi.fn().mockResolvedValue({
          applications: [], interviews: [], statusHistory: [], dailyGoal: 3, checkins: []
        })
      }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect(document.querySelector('[data-daily-goal]').dataset.tone).toBe('final');
    expect(document.querySelector('[data-goal-message]').textContent).toContain('连续打卡就要中断了');

    view.destroy();
  });

  it('keeps applications visible and explains setup when the check-in tables are not installed yet', async () => {
    const tracker = createTracker({
      loadAll: vi.fn().mockResolvedValue({
        ...clone(initialData), dailyGoal: 3, checkins: [], checkinsAvailable: false
      })
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect(document.querySelector('[data-application-id="bytedance"]')).not.toBeNull();
    expect(document.querySelector('[data-checkin-feedback]').textContent).toContain('Supabase 初始化');
    expect(document.querySelector('[data-form="daily-goal"] button').disabled).toBe(true);
  });

  it('paginates by five company groups while keeping interview reviews in the alternate panel', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(paginatedData()) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect([...document.querySelectorAll('[data-company-key]')].map(element => element.dataset.companyKey))
      .toEqual(['company-7', 'company-6', 'company-5', 'company-4', 'company-3']);
    expect(document.querySelectorAll('[data-company-key="company-7"] [data-application-id]')).toHaveLength(2);
    expect(document.querySelector('[data-pagination-summary]').textContent).toContain('共 8 个岗位 · 7 家公司');
    expect(document.querySelector('[data-interview-id="interview-1"]')).toBeNull();

    click('[data-action="page-next"]');

    expect([...document.querySelectorAll('[data-company-key]')].map(element => element.dataset.companyKey))
      .toEqual(['company-2', 'company-1']);
    expect(document.querySelector('[data-page-position]').textContent).toContain('第 2 / 2 页');

    click('[data-action="switch-panel"][data-panel="interviews"]');

    expect(document.querySelector('[data-company-key]')).toBeNull();
    expect(document.querySelector('[data-interview-id="interview-1"]')).not.toBeNull();
    expect(document.querySelector('[data-pagination]')).toBeNull();
  });

  it('switches the shared content card between applications and interview reviews', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(paginatedData()) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const applicationsTab = document.querySelector('[data-action="switch-panel"][data-panel="applications"]');
    const interviewsTab = document.querySelector('[data-action="switch-panel"][data-panel="interviews"]');
    expect(applicationsTab.getAttribute('aria-selected')).toBe('true');
    expect(interviewsTab.getAttribute('aria-selected')).toBe('false');
    expect(document.querySelector('[data-panel-content="applications"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content="interviews"]')).toBeNull();

    click('[data-action="switch-panel"][data-panel="interviews"]');

    expect(document.querySelector('[data-panel-content="applications"]')).toBeNull();
    expect(document.querySelector('[data-panel-content="interviews"]')).not.toBeNull();
    expect(document.querySelector('[data-action="add-interview"].panel-primary-action').textContent)
      .toContain('新增复盘');
    expect(document.querySelector('[name="interview-search-query"]')).not.toBeNull();
    expect(document.querySelector('[name="interview-stage-filter"]')).not.toBeNull();

    click('[data-action="switch-panel"][data-panel="applications"]');
    expect(document.querySelector('[name="search-query"]')).not.toBeNull();
    expect(document.querySelector('[name="status-filter"]')).not.toBeNull();
  });

  it('filters interview reviews without changing the application filters', async () => {
    const data = paginatedData();
    data.interviews.push({
      id: 'interview-2',
      applicationId: 'company-1',
      date: '2026-09-09',
      stage: '终面',
      questions: '如何处理跨团队冲突？',
      highlights: '回答结构清晰'
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(data) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const applicationSearch = document.querySelector('[name="search-query"]');
    applicationSearch.value = 'Company 7';
    applicationSearch.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-action="switch-panel"][data-panel="interviews"]');

    const interviewSearch = document.querySelector('[name="interview-search-query"]');
    interviewSearch.value = '跨团队';
    interviewSearch.dispatchEvent(new Event('input', { bubbles: true }));

    expect([...document.querySelectorAll('[data-interview-id]')].map(element => element.dataset.interviewId))
      .toEqual(['interview-2']);

    click('[data-action="switch-panel"][data-panel="applications"]');
    expect(document.querySelector('[name="search-query"]').value).toBe('Company 7');
    expect(document.querySelector('[data-company-key="company-7"]')).not.toBeNull();
  });

  it('opens complete interview review details from the interview panel', async () => {
    const data = paginatedData();
    data.interviews[0].highlights = '回答结构清晰';
    data.interviews[0].gaps = '案例还不够具体';
    data.interviews[0].nextPlan = '补充量化结果';
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(data) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="switch-panel"][data-panel="interviews"]');
    click('[data-action="view-interview"][data-id="interview-1"]');

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('面试复盘详情');
    expect(dialog.textContent).toContain('请介绍一个最有挑战的项目');
    expect(dialog.textContent).toContain('回答结构清晰');
    expect(dialog.textContent).toContain('案例还不够具体');
    expect(dialog.textContent).toContain('补充量化结果');
  });

  it('paginates long interview review lists independently', async () => {
    const data = paginatedData();
    data.interviews = Array.from({ length: 7 }, (_, index) => ({
      id: `interview-${index + 1}`,
      applicationId: 'company-7',
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      stage: '一面',
      questions: `问题 ${index + 1}`
    }));
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(data) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="switch-panel"][data-panel="interviews"]');
    expect(document.querySelectorAll('[data-interview-id]')).toHaveLength(5);
    expect(document.querySelector('[data-interview-pagination-summary]').textContent).toContain('共 7 条复盘');

    click('[data-action="interview-page-next"]');
    expect(document.querySelectorAll('[data-interview-id]')).toHaveLength(2);
    expect(document.querySelector('[data-interview-page-position]').textContent).toContain('第 2 / 2 页');

    click('[data-action="switch-panel"][data-panel="applications"]');
    expect(document.querySelector('[data-page-position]').textContent).toContain('第 1 / 2 页');
  });

  it('clears a stale interview stage filter after its last matching review is deleted', async () => {
    const initial = paginatedData();
    initial.interviews = [
      { id: 'final-review', applicationId: 'company-7', date: '2026-09-10', stage: '终面', questions: '终面问题' },
      { id: 'first-review', applicationId: 'company-6', date: '2026-09-09', stage: '一面', questions: '一面问题' }
    ];
    const tracker = createTracker({
      loadAll: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce({ ...initial, interviews: [initial.interviews[1]] })
    });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();
    click('[data-action="switch-panel"][data-panel="interviews"]');

    const filter = document.querySelector('[name="interview-stage-filter"]');
    filter.value = '终面';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    click('[data-action="delete-interview"][data-id="final-review"]');
    await flushPromises();

    expect(document.querySelector('[name="interview-stage-filter"]').value).toBe('');
    expect(document.querySelector('[data-interview-id="first-review"]')).not.toBeNull();
  });

  it('supports arrow-key navigation between the two content tabs', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(paginatedData()) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const applicationsTab = document.querySelector('[data-action="switch-panel"][data-panel="applications"]');
    applicationsTab.focus();
    applicationsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    const interviewsTab = document.querySelector('[data-action="switch-panel"][data-panel="interviews"]');
    expect(interviewsTab.getAttribute('aria-selected')).toBe('true');
    expect(interviewsTab.getAttribute('aria-controls')).toBe('interviews-panel');
    expect(document.activeElement).toBe(interviewsTab);
    expect(document.querySelector('#interviews-panel').getAttribute('aria-labelledby')).toBe('interviews-tab');
  });

  it('supports jumping to a page and resets pagination after filtering', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker({ loadAll: vi.fn().mockResolvedValue(paginatedData()) }),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const jumpForm = document.querySelector('[data-form="pagination-jump"]');
    jumpForm.querySelector('[name="page-number"]').value = '2';
    jumpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelector('[data-company-key="company-2"]')).not.toBeNull();

    const search = document.querySelector('[name="search-query"]');
    search.value = 'Company 7';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('[data-company-key="company-7"]')).not.toBeNull();
    expect(document.querySelector('[data-page-position]').textContent).toContain('第 1 / 1 页');
    expect(document.querySelector('[data-pagination-summary]').textContent).toContain('共 2 个岗位 · 1 家公司');
  });

  it('renders the approved lightweight dashboard hierarchy without decorative artwork', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker(),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    expect(document.querySelector('#tracker-title').textContent).toBe('每个岗位都一目了然');
    expect(document.querySelector('.brand-title').textContent).toBe('求职进度板');
    expect(document.querySelector('[aria-label="求职概览"]')).not.toBeNull();
    expect([...document.querySelectorAll('[data-metric] .metric-label')].map(element => element.textContent))
      .toEqual(['全部投递', '面试进行中', '已获录用', '7天内待跟进']);
    expect([...document.querySelectorAll('.content-switch button')].map(element => element.textContent.trim()))
      .toEqual(['投递记录', '面试问题与复盘']);
    expect(document.querySelector('.app-header [data-action="add-application"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('更好的自己');
    expect(document.querySelector('.hero-illustration')).toBeNull();
  });

  it('places the complete daily goal card in the hero’s upper-right layout before the overview', async () => {
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: createTracker(),
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const hero = document.querySelector('.tracker-hero');
    expect(hero.querySelector('.hero-copy #tracker-title')).not.toBeNull();
    expect(hero.querySelector('[data-daily-goal]')).not.toBeNull();
    expect(hero.querySelector('[data-form="daily-goal"]')).not.toBeNull();
    expect(hero.querySelector('[data-form="makeup-checkin"]')).not.toBeNull();
    expect(hero.compareDocumentPosition(document.querySelector('.stats-grid'))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

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

  it('offers color-coded next actions and only requires a reason for failed applications', async () => {
    const tracker = createTracker();
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    click('[data-action="add-application"]');
    const nextAction = document.querySelector('[name="nextAction"]');
    expect([...nextAction.options].map(option => option.value)).toEqual([
      '', 'AI面/海测', '一面', '二面', 'HR面', '终面', 'Offer Call', 'Offer', '投递失败'
    ]);

    nextAction.value = '投递失败';
    nextAction.dispatchEvent(new Event('change', { bubbles: true }));
    const failureReason = document.querySelector('[name="failureReason"]');
    expect(failureReason.closest('[data-failure-reason-field]').hidden).toBe(false);
    expect(failureReason.required).toBe(true);

    document.querySelector('[name="company"]').value = 'OpenAI';
    document.querySelector('[name="role"]').value = '产品工程师';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();
    expect(tracker.saveApplication).not.toHaveBeenCalled();
    expect(document.querySelector('[data-form-error]').textContent).toContain('失败原因');

    failureReason.value = '岗位被冻结';
    document.querySelector('[data-form="application"] [type="submit"]').click();
    await flushPromises();
    expect(tracker.saveApplication).toHaveBeenCalledWith(expect.objectContaining({
      nextAction: '投递失败',
      failureReason: '岗位被冻结'
    }));
  });

  it('updates the next action from the homepage and keeps status controls aligned', async () => {
    const updatedData = clone(initialData);
    updatedData.applications[0] = {
      ...updatedData.applications[0],
      status: '笔试',
      nextAction: 'AI面/海测'
    };
    const tracker = createTracker();
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockResolvedValueOnce(updatedData);
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const card = document.querySelector('[data-application-id="tencent-old"]');
    const status = card.querySelector('[data-role-status]');
    const nextAction = card.querySelector('[name="quick-next-action"]');
    expect(status.classList.contains('role-state-control')).toBe(true);
    expect(nextAction.classList.contains('role-state-control')).toBe(true);

    nextAction.value = 'AI面/海测';
    nextAction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(tracker.saveApplication).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tencent-old',
      status: '笔试',
      nextAction: 'AI面/海测',
      failureReason: ''
    }));
    const updatedCard = document.querySelector('[data-application-id="tencent-old"]');
    expect(updatedCard.querySelector('[data-role-status]').textContent).toContain('笔试');
    expect(updatedCard.querySelector('[name="quick-next-action"]').value).toBe('AI面/海测');
  });

  it('asks for a failure reason before saving a failed application from the homepage', async () => {
    const updatedData = clone(initialData);
    updatedData.applications[0] = {
      ...updatedData.applications[0],
      status: '已拒绝',
      nextAction: '投递失败',
      failureReason: '岗位被冻结'
    };
    const tracker = createTracker();
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockResolvedValueOnce(updatedData);
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const quickAction = document.querySelector('[data-application-id="tencent-old"] [name="quick-next-action"]');
    quickAction.value = '投递失败';
    quickAction.dispatchEvent(new Event('change', { bubbles: true }));

    expect(tracker.saveApplication).not.toHaveBeenCalled();
    const reasonForm = document.querySelector('[data-form="quick-failure"]');
    expect(reasonForm).not.toBeNull();
    reasonForm.elements.failureReason.value = '岗位被冻结';
    reasonForm.querySelector('[type="submit"]').click();
    await flushPromises();

    expect(tracker.saveApplication).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tencent-old',
      status: '已拒绝',
      nextAction: '投递失败',
      failureReason: '岗位被冻结'
    }));
    expect(document.querySelector('[data-application-id="tencent-old"]').textContent).toContain('投递失败【岗位被冻结】');
  });

  it('restores the homepage next action when its cloud save fails', async () => {
    const tracker = createTracker({ saveApplication: vi.fn().mockRejectedValue(new Error('offline')) });
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const quickAction = document.querySelector('[data-application-id="tencent-old"] [name="quick-next-action"]');
    quickAction.value = 'Offer';
    quickAction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    const restoredCard = document.querySelector('[data-application-id="tencent-old"]');
    expect(restoredCard.querySelector('[data-role-status]').textContent).toContain('已投递');
    expect(restoredCard.querySelector('[name="quick-next-action"]').value).toBe('');
    expect(document.querySelector('[data-sync-status]').textContent).toBe('同步失败，请重试');
  });

  it('keeps the saved homepage action visible when refresh fails after a successful save', async () => {
    const savedApplication = {
      ...clone(initialData).applications[0],
      status: '已录用',
      nextAction: 'Offer'
    };
    const tracker = createTracker({
      saveApplication: vi.fn().mockResolvedValue(savedApplication)
    });
    tracker.loadAll
      .mockResolvedValueOnce(clone(initialData))
      .mockRejectedValueOnce(new Error('reload offline'));
    const view = createTrackerView(document.querySelector('#app'), {
      trackerService: tracker,
      authService: { signOut: vi.fn().mockResolvedValue() }
    });
    await view.mount();

    const quickAction = document.querySelector('[data-application-id="tencent-old"] [name="quick-next-action"]');
    quickAction.value = 'Offer';
    quickAction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    const savedCard = document.querySelector('[data-application-id="tencent-old"]');
    expect(savedCard.querySelector('[data-role-status]').textContent).toContain('已录用');
    expect(savedCard.querySelector('[name="quick-next-action"]').value).toBe('Offer');
    expect(document.querySelector('[data-sync-status]').textContent).toBe('已保存，但刷新失败，请重新加载');
    expect(document.querySelector('[data-action="retry-reload"]')).not.toBeNull();
    expect(tracker.saveApplication).toHaveBeenCalledTimes(1);
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
    expect(downloadBackup).toHaveBeenCalledWith({
      ...confirmedCloudData,
      dailyGoal: 3,
      checkins: [],
      checkinsAvailable: true
    }, document);
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
