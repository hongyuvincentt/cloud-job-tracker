import { expect, it, vi } from 'vitest';
import { createTrackerService } from '../src/services/tracker.js';

function createQuery(response = { data: null, error: null }) {
  const query = {
    delete: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve(response)),
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

it('loads all three collections using explicit columns and camelCase view models', async () => {
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
  const client = {
    from: vi.fn(table => ({ applications, interviews, status_history: statusHistory }[table]))
  };

  await expect(createTrackerService(client).loadAll()).resolves.toEqual({
    applications: [{ id: 'app-1', company: 'Tencent', companyKey: 'tencent', updatedAt: '2026-09-03T10:00:00Z' }],
    interviews: [{ id: 'interview-1', applicationId: 'app-1', nextPlan: '复盘', updatedAt: '2026-09-03T11:00:00Z' }],
    statusHistory: [{ id: 1, applicationId: 'app-1', changedAt: '2026-09-03T12:00:00Z' }]
  });

  expect(client.from).toHaveBeenCalledWith('applications');
  expect(client.from).toHaveBeenCalledWith('interviews');
  expect(client.from).toHaveBeenCalledWith('status_history');
  for (const query of [applications, interviews, statusHistory]) {
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('*'));
  }
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
