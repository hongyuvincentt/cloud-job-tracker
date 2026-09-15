import { normalizeCompanyName } from '../lib/company.js';

const APPLICATION_COLUMNS = [
  'id',
  'user_id',
  'company',
  'company_key',
  'role',
  'location',
  'channel',
  'applied_date',
  'status',
  'next_action',
  'next_date',
  'salary',
  'contact',
  'job_url',
  'tags',
  'notes',
  'created_at',
  'updated_at'
].join(',');

const INTERVIEW_COLUMNS = [
  'id',
  'application_id',
  'user_id',
  'date',
  'stage',
  'rating',
  'questions',
  'highlights',
  'gaps',
  'next_plan',
  'feedback',
  'created_at',
  'updated_at'
].join(',');

const STATUS_HISTORY_COLUMNS = [
  'id',
  'application_id',
  'user_id',
  'status',
  'changed_at'
].join(',');

const DAILY_GOAL_COLUMNS = ['daily_target', 'updated_at'].join(',');

const CHECKIN_COLUMNS = [
  'id',
  'user_id',
  'checkin_date',
  'goal_target',
  'completed_count',
  'source',
  'completed_at'
].join(',');

function unwrap(response) {
  if (response.error) throw response.error;
  return response.data;
}

function optionalRows(response) {
  if (!response.error) return response.data;
  if (['42P01', 'PGRST205'].includes(response.error.code)) return null;
  throw response.error;
}

function camelCase(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toViewModel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelCase(key), value])
  );
}

function optionalDate(value) {
  return value || null;
}

function parseTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return values.map(tag => tag.trim()).filter(Boolean);
}

function mapApplicationForm(form) {
  const row = {
    company: form.company,
    company_key: normalizeCompanyName(form.company),
    role: form.role,
    location: form.location ?? '',
    channel: form.channel ?? '',
    applied_date: optionalDate(form.appliedDate),
    status: form.status ?? '准备投递',
    next_action: form.nextAction ?? '',
    next_date: optionalDate(form.nextDate),
    salary: form.salary ?? '',
    contact: form.contact ?? '',
    job_url: form.jobUrl ?? '',
    tags: parseTags(form.tags),
    notes: form.notes ?? ''
  };

  if (form.id) row.id = form.id;
  return row;
}

function mapInterviewForm(form) {
  const row = {
    application_id: form.applicationId,
    date: form.date,
    stage: form.stage,
    rating: form.rating === '' || form.rating == null ? null : Number(form.rating),
    questions: form.questions ?? '',
    highlights: form.highlights ?? '',
    gaps: form.gaps ?? '',
    next_plan: form.nextPlan ?? '',
    feedback: form.feedback ?? ''
  };

  if (form.id) row.id = form.id;
  return row;
}

export function createTrackerService(client) {
  return {
    async loadAll() {
      const [applicationsResponse, interviewsResponse, statusHistoryResponse, dailyGoalResponse, checkinsResponse] = await Promise.all([
        client.from('applications').select(APPLICATION_COLUMNS).order('updated_at', { ascending: false }),
        client.from('interviews').select(INTERVIEW_COLUMNS).order('date', { ascending: false }),
        client.from('status_history').select(STATUS_HISTORY_COLUMNS).order('changed_at', { ascending: false }),
        client.from('daily_goal_settings').select(DAILY_GOAL_COLUMNS).limit(1),
        client.from('daily_checkins').select(CHECKIN_COLUMNS).order('checkin_date', { ascending: false })
      ]);

      const dailyGoalRows = optionalRows(dailyGoalResponse);
      const checkinRows = optionalRows(checkinsResponse);
      const checkinsAvailable = dailyGoalRows !== null && checkinRows !== null;

      return {
        applications: unwrap(applicationsResponse).map(toViewModel),
        interviews: unwrap(interviewsResponse).map(toViewModel),
        statusHistory: unwrap(statusHistoryResponse).map(toViewModel),
        dailyGoal: Number(dailyGoalRows?.[0]?.daily_target) || 3,
        checkins: (checkinRows ?? []).map(toViewModel),
        checkinsAvailable
      };
    },

    async saveApplication(form) {
      const response = await client
        .from('applications')
        .upsert(mapApplicationForm(form))
        .select(APPLICATION_COLUMNS)
        .single();
      return toViewModel(unwrap(response));
    },

    async deleteApplication(id) {
      unwrap(await client.from('applications').delete().eq('id', id));
    },

    async saveInterview(form) {
      const response = await client
        .from('interviews')
        .upsert(mapInterviewForm(form))
        .select(INTERVIEW_COLUMNS)
        .single();
      return toViewModel(unwrap(response));
    },

    async deleteInterview(id) {
      unwrap(await client.from('interviews').delete().eq('id', id));
    },

    async saveDailyGoal(dailyTarget) {
      const response = await client
        .from('daily_goal_settings')
        .upsert({ daily_target: dailyTarget }, { onConflict: 'user_id' })
        .select(DAILY_GOAL_COLUMNS)
        .single();
      return Number(unwrap(response).daily_target);
    },

    async saveCheckin(form) {
      const response = await client
        .from('daily_checkins')
        .upsert({
          checkin_date: form.checkinDate,
          goal_target: form.goalTarget,
          completed_count: form.completedCount,
          source: form.source
        }, { onConflict: 'user_id,checkin_date' })
        .select(CHECKIN_COLUMNS)
        .single();
      return toViewModel(unwrap(response));
    }
  };
}
