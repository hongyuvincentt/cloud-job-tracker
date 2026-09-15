import { expect, it, vi } from 'vitest';
import { createTrackerService } from '../src/services/tracker.js';

function createQuery(response = { data: null, error: null }) {
  const query = {
    delete: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve(response)),
    limit: vi.fn(() => Promise.resolve(response)),
    order: vi.fn(() => Promise.resolve(response)),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(response)),
    upsert: vi.fn(() => query)
  };
  return query;
}

it('maps an application form to database fields without client-owned columns', async () => {
  const row = {
    id: 'application-1',
    user_id: 'user-1',
    company: 'Tencent',
    company_key: 'tencent',
    role: '产品经理',
    location: '深圳',
    channel: '官网',
    applied_date: '2026-09-02',
    status: '已投递',
    next_action: '准备一面',
    next_date: '2026-09-09',
    salary: '30k',
    contact: '招聘经理',
    job_url: 'https://example.com/job',
    tags: ['产品', 'AI'],
    notes: '重点岗位',
    created_at: '2026-09-02T10:00:00Z',
    updated_at: '2026-09-03T10:00:00Z'
  };
  const query = createQuery({ data: row, error: null });
  const client = { from: vi.fn(() => query) };
  const tracker = createTrackerService(client);

  await expect(
    tracker.saveApplication({
      company: 'Tencent',
      role: '产品经理',
      location: '深圳',
      channel: '官网',
      appliedDate: '2026-09-02',
      status: '已投递',
      nextAction: '准备一面',
      nextDate: '2026-09-09',
      salary: '30k',
      contact: '招聘经理',
      jobUrl: 'https://example.com/job',
      tags: ' 产品, AI , ',
      notes: '重点岗位',
      userId: 'ignored',
      createdAt: 'ignored',
      updatedAt: 'ignored'
    })
  ).resolves.toMatchObject({ companyKey: 'tencent', nextAction: '准备一面' });

  expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({
    company: 'Tencent',
    company_key: 'tencent',
    next_action: '准备一面',
    next_date: '2026-09-09',
    tags: ['产品', 'AI']
  }));
  expect(query.upsert.mock.calls[0][0]).not.toHaveProperty('user_id');
  expect(query.upsert.mock.calls[0][0]).not.toHaveProperty('created_at');
  expect(query.upsert.mock.calls[0][0]).not.toHaveProperty('updated_at');
  expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('*'));
});

it('loads tracker records, daily goal and check-ins using explicit columns', async () => {
  const applications = createQuery({
    data: [{ id: 'app-1', company: 'Tencent', company_key: 'tencent', updated_at: '2026-09-03T10:00:00Z' }],
    error: null
  });
  const interviews = createQuery({
    data: [{ id: 'interview-1', application_id: 'app-1', next_plan: '复盘', updated_at: '2026-09-03T11:00:00Z' }],
    error: null
  });
  const statusHistory = createQuery({
    data: [{ id: 1, application_id: 'app-1', changed_at: '2026-09-03T12:00:00Z' }],
    error: null
  });
  const dailyGoalSettings = createQuery({
    data: [{ daily_target: 4, updated_at: '2026-09-03T12:00:00Z' }],
    error: null
  });
  const dailyCheckins = createQuery({
    data: [{ id: 'checkin-1', checkin_date: '2026-09-03', goal_target: 4, completed_count: 4, source: 'automatic' }],
    error: null
  });
  const client = {
    from: vi.fn(table => ({
      applications,
      interviews,
      status_history: statusHistory,
      daily_goal_settings: dailyGoalSettings,
      daily_checkins: dailyCheckins
    }[table]))
  };

  await expect(createTrackerService(client).loadAll()).resolves.toEqual({
    applications: [{ id: 'app-1', company: 'Tencent', companyKey: 'tencent', updatedAt: '2026-09-03T10:00:00Z' }],
    interviews: [{ id: 'interview-1', applicationId: 'app-1', nextPlan: '复盘', updatedAt: '2026-09-03T11:00:00Z' }],
    statusHistory: [{ id: 1, applicationId: 'app-1', changedAt: '2026-09-03T12:00:00Z' }],
    dailyGoal: 4,
    checkins: [{ id: 'checkin-1', checkinDate: '2026-09-03', goalTarget: 4, completedCount: 4, source: 'automatic' }],
    checkinsAvailable: true
  });

  expect(client.from).toHaveBeenCalledWith('applications');
  expect(client.from).toHaveBeenCalledWith('interviews');
  expect(client.from).toHaveBeenCalledWith('status_history');
  expect(client.from).toHaveBeenCalledWith('daily_goal_settings');
  expect(client.from).toHaveBeenCalledWith('daily_checkins');
  for (const query of [applications, interviews, statusHistory, dailyGoalSettings, dailyCheckins]) {
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('*'));
  }
});

it('keeps core tracker data available before the optional check-in migration is installed', async () => {
  const applications = createQuery({ data: [{ id: 'app-1', company: 'Tencent' }], error: null });
  const interviews = createQuery({ data: [], error: null });
  const statusHistory = createQuery({ data: [], error: null });
  const missingTable = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
  const dailyGoalSettings = createQuery(missingTable);
  const dailyCheckins = createQuery(missingTable);
  const client = {
    from: vi.fn(table => ({
      applications,
      interviews,
      status_history: statusHistory,
      daily_goal_settings: dailyGoalSettings,
      daily_checkins: dailyCheckins
    }[table]))
  };

  await expect(createTrackerService(client).loadAll()).resolves.toMatchObject({
    applications: [{ id: 'app-1', company: 'Tencent' }],
    dailyGoal: 3,
    checkins: [],
    checkinsAvailable: false
  });
});

it('saves a daily target and a dated check-in without accepting a client-owned user id', async () => {
  const goalQuery = createQuery({ data: { daily_target: 5 }, error: null });
  const checkinQuery = createQuery({
    data: { id: 'checkin-1', checkin_date: '2026-09-15', goal_target: 5, completed_count: 5, source: 'makeup' },
    error: null
  });
  const client = {
    from: vi.fn(table => ({ daily_goal_settings: goalQuery, daily_checkins: checkinQuery }[table]))
  };
  const tracker = createTrackerService(client);

  await expect(tracker.saveDailyGoal(5)).resolves.toBe(5);
  expect(goalQuery.upsert).toHaveBeenCalledWith({ daily_target: 5 }, { onConflict: 'user_id' });

  await expect(tracker.saveCheckin({
    checkinDate: '2026-09-15',
    goalTarget: 5,
    completedCount: 5,
    source: 'makeup',
    userId: 'ignored'
  })).resolves.toMatchObject({ checkinDate: '2026-09-15', source: 'makeup' });
  expect(checkinQuery.upsert).toHaveBeenCalledWith({
    checkin_date: '2026-09-15',
    goal_target: 5,
    completed_count: 5,
    source: 'makeup'
  }, { onConflict: 'user_id,checkin_date' });
});

it('maps interviews and deletes records by id', async () => {
  const interviewQuery = createQuery({
    data: {
      id: 'interview-1',
      application_id: 'application-1',
      date: '2026-09-03',
      stage: '一面',
      rating: 4,
      questions: '问题',
      highlights: '亮点',
      gaps: '不足',
      next_plan: '复盘',
      feedback: '通过'
    },
    error: null
  });
  const deleteQuery = createQuery();
  const client = {
    from: vi.fn(table => (table === 'interviews' ? interviewQuery : deleteQuery))
  };
  const tracker = createTrackerService(client);

  await expect(
    tracker.saveInterview({
      applicationId: 'application-1',
      date: '2026-09-03',
      stage: '一面',
      rating: '4',
      questions: '问题',
      highlights: '亮点',
      gaps: '不足',
      nextPlan: '复盘',
      feedback: '通过',
      userId: 'ignored'
    })
  ).resolves.toMatchObject({ applicationId: 'application-1', nextPlan: '复盘' });
  expect(interviewQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
    application_id: 'application-1',
    next_plan: '复盘',
    rating: 4
  }));
  expect(interviewQuery.upsert.mock.calls[0][0]).not.toHaveProperty('user_id');

  await tracker.deleteApplication('application-1');
  expect(deleteQuery.eq).toHaveBeenCalledWith('id', 'application-1');
});
