# Cloud Job Tracker Recovery — Tasks 1–4

## Scope restored

Implemented only Tasks 1–4 from `docs/superpowers/plans/2026-09-02-cloud-job-tracker.md`:

- Vite/Vitest scaffold and pure company/date utilities;
- Supabase schema, validation, triggers, indexes, and RLS policies;
- public environment validation, a singleton Supabase client, and six-digit email OTP auth;
- the RLS-backed tracker repository and row/form mappings.

No UI work from Tasks 5–7, deployment, hosted credential configuration, or service-role key was added.

## Files created

- `package.json`, `package-lock.json`, `vite.config.js`, `index.html`
- `src/main.js`, `src/styles.css`
- `src/lib/company.js`, `src/lib/dates.js`
- `supabase/migrations/202609020001_init.sql`
- `.env.example`, `src/config.js`
- `src/services/supabase.js`, `src/services/auth.js`, `src/services/tracker.js`
- `tests/company.test.js`, `tests/dates.test.js`, `tests/auth.test.js`, `tests/tracker.test.js`

## Checkpoints

- `76e951e feat: scaffold cloud tracker and grouping utilities`
- `9e1622e feat: add private tracker database and RLS`
- `94d25a3 feat: add email OTP authentication service`
- `86aba65 feat: add Supabase tracker repository`

## Verification outcomes

| Command | Outcome |
|---|---|
| `npm install` | Completed and generated `package-lock.json`; npm emitted environment/deprecation warnings only. |
| `npm test -- tests/company.test.js` | Initial red check exited 1 because `src/lib/company.js` was absent; green check passed 2 tests. |
| `npm test -- tests/dates.test.js` | Initial red check exited 1 because `src/lib/dates.js` was absent; green check passed with company tests. |
| `npm test -- tests/auth.test.js` | Initial red check exited 1 because `src/services/auth.js` was absent; green check passed 5 tests. |
| `npm test -- tests/tracker.test.js` | Initial red check exited 1 because `src/services/tracker.js` was absent; green check passed with company tests. |
| `npm test` | Exit 0: 4 test files and 12 tests passed. |
| `npm run build` | Exit 0: Vite 7.3.6 transformed 4 modules and emitted `dist/index.html` plus assets. |
| `git diff --check` | Exit 0; no whitespace errors. |
| Static SQL/source checks | Exit 0: 12 RLS policies, 7 triggers, 3 RLS-enabled tables, no source `select('*')`, and no non-documentation service-role references. |

## Review notes and concerns

- `verifyOtp()` rejects a Supabase response that does not include a session; OTP requests use `shouldCreateUser: false`.
- Repository view models and grouping consistently use `companyKey` and `updatedAt`; SQL columns remain snake_case at the database boundary.
- The repository sends no `user_id`, `created_at`, or `updated_at`; database defaults/triggers own those values, automatic status history, and parent application touches after interview mutations.
- Supabase CLI, Docker, and PostgreSQL client tools were unavailable in this environment, so `supabase db reset`, `supabase db lint`, hosted migration execution, and live RLS verification are deferred to a configured Supabase environment.

## Review-fix round 1

### Corrections

- Replaced eager Supabase singleton construction with side-effect-safe `createSupabaseClient()` and cached `getSupabaseClient()`. Missing public variables now cause a controlled error only when a client is requested.
- Strengthened `set_updated_at()` for applications and interviews: it assigns `user_id`, `created_at`, and `updated_at` from the database on inserts; it preserves the original user and creation time and refreshes the update time on updates.
- Made status history server-timestamped and trigger-owned: the application status trigger is `SECURITY DEFINER` with a safe empty search path, timeline inserts receive server `user_id`/`changed_at`, browser roles lose direct insert/update/delete privileges, and authenticated users retain RLS-limited reads. The original 12 explicit RLS policies remain present.
- Updated interview parent-touch logic so an interview reassignment refreshes both the old and new applications.

### Added coverage and exact outcomes

| Command | Outcome |
|---|---|
| `npm test -- tests/supabase.test.js tests/migration.test.js` | Initial red check exited 1: eager configuration threw on import, the lazy accessor was absent, and static migration assertions were unmet. |
| `npm test -- tests/supabase.test.js` | Exit 0: 2 tests passed. |
| `npm test -- tests/migration.test.js` | Exit 0: 3 tests passed. |
| `npm test` | Exit 0: 6 test files and 17 tests passed. |
| `npm run build` | Exit 0: Vite 7.3.6 transformed 4 modules and emitted `dist/index.html` plus assets. |
| `git diff --check` | Exit 0 with the report update included. |

### Remaining concern

Hosted Supabase migration execution, live RLS/trigger behavior, and `supabase db reset`/`supabase db lint` remain deferred because this environment has no Supabase CLI, Docker, or PostgreSQL client.
