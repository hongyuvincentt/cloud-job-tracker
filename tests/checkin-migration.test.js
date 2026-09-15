import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202609150001_daily_checkins.sql'),
  'utf8'
);

it('stores one private daily goal per user and one check-in per China calendar date', () => {
  expect(migration).toMatch(/create table public\.daily_goal_settings/i);
  expect(migration).toMatch(/daily_target integer not null default 3 check \(daily_target between 1 and 99\)/i);
  expect(migration).toMatch(/create table public\.daily_checkins/i);
  expect(migration).toMatch(/unique \(user_id, checkin_date\)/i);
  expect(migration).toMatch(/source text not null check \(source in \('automatic', 'makeup'\)\)/i);
});

it('keeps goals and check-ins private through row-level security', () => {
  expect(migration).toMatch(/alter table public\.daily_goal_settings enable row level security/i);
  expect(migration).toMatch(/alter table public\.daily_checkins enable row level security/i);
  expect(migration).toMatch(/create policy daily_goal_settings_select_own[\s\S]*auth\.uid\(\) = user_id/i);
  expect(migration).toMatch(/create policy daily_checkins_select_own[\s\S]*auth\.uid\(\) = user_id/i);
});
