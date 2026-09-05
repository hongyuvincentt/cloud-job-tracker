import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202609020001_init.sql'),
  'utf8'
);

it('keeps application and interview identity and timestamps database-owned', () => {
  expect(migration).toMatch(/if tg_op = 'INSERT' then\s+new\.user_id = auth\.uid\(\);\s+new\.created_at = now\(\);/);
  expect(migration).toMatch(/else\s+new\.user_id = old\.user_id;\s+new\.created_at = old\.created_at;/);
  expect(migration).toMatch(/new\.updated_at = now\(\);/);
  expect(migration).toMatch(/before insert or update on public\.applications/);
  expect(migration).toMatch(/before insert or update on public\.interviews/);
});

it('keeps status history trigger-owned and append-only for browser roles', () => {
  expect(migration).toMatch(/create function public\.record_application_status\(\)\s+returns trigger\s+language plpgsql\s+security definer/s);
  expect(migration).toMatch(/create function public\.set_status_history_values\(\)/);
  expect(migration).toMatch(/new\.changed_at = now\(\);/);
  expect(migration).toMatch(/revoke insert, update, delete on table public\.status_history from anon, authenticated;/);
  expect(migration).toMatch(/grant select on table public\.status_history to authenticated;/);
  expect(migration.match(/^create policy /gm)).toHaveLength(12);
});

it('touches both parents when an interview is reassigned', () => {
  expect(migration).toMatch(
    /if tg_op = 'UPDATE' and old\.application_id is distinct from new\.application_id then\s+update public\.applications\s+set updated_at = now\(\)\s+where id = old\.application_id;/s
  );
  expect(migration).toMatch(/where id = new\.application_id;/);
});
