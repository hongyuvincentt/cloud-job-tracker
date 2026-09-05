# Private Cloud Job Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private cloud-hosted job application tracker with email OTP login, Supabase persistence, interview retrospectives, and automatic same-company grouping ordered by latest activity.

**Architecture:** Replace the existing single-file `localStorage` app with a small Vite application. Supabase Auth owns the email OTP session, PostgreSQL tables own application/interview/history data, and RLS limits every operation to the authenticated user. The browser groups applications by a normalized company key and sorts both groups and roles by the latest `updated_at` value.

**Tech Stack:** Vite, vanilla JavaScript, CSS, `@supabase/supabase-js`, Vitest, jsdom, Supabase PostgreSQL/Auth, Vercel

**Spec:** `docs/superpowers/specs/2026-09-02-cloud-job-tracker-design.md`

## Global Constraints

- The app is single-user and has no registration, invitation, sharing, or team UI.
- Login uses a six-digit email OTP and calls Supabase with `shouldCreateUser: false`.
- Never expose a Supabase `service_role` key in source, build output, or Vercel client environment variables.
- All three business tables use RLS with `auth.uid() = user_id` for read and write operations.
- Company normalization trims surrounding whitespace, collapses repeated whitespace, and lowercases Latin characters; it does not translate aliases such as `腾讯` and `Tencent`.
- Company groups sort by their newest application activity; applications within each group sort by their own newest activity.
- Updating an interview must refresh the parent application's `updated_at` in the database.
- The cloud version starts with an empty database and does not migrate local browser data.
- Desktop and mobile layouts must both support login, application CRUD, interview CRUD, filters, grouped sorting, and JSON export.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Dependencies and build/test scripts |
| `.gitignore` | Excludes dependencies, builds, and local credentials |
| `vite.config.js` | Vite and Vitest/jsdom configuration |
| `index.html` | Application shell and entry point |
| `src/main.js` | Session bootstrap and top-level view switching |
| `src/styles.css` | Existing visual system plus login, grouping, and sync-state styles |
| `src/config.js` | Validates public Supabase environment configuration |
| `src/lib/company.js` | Company normalization, grouping, and sorting |
| `src/lib/dates.js` | Local-date and follow-up calculations |
| `src/lib/export.js` | JSON backup serialization/download |
| `src/services/supabase.js` | Single initialized Supabase client |
| `src/services/auth.js` | OTP request, verification, logout, and session subscription |
| `src/services/tracker.js` | Supabase queries and row/form mapping |
| `src/ui/auth-view.js` | Login and OTP user interface |
| `src/ui/tracker-view.js` | Dashboard, grouped applications, forms, interviews, and events |
| `supabase/migrations/202609020001_init.sql` | Tables, indexes, triggers, validation, and RLS policies |
| `tests/company.test.js` | Normalization and grouping tests |
| `tests/dates.test.js` | Follow-up date tests |
| `tests/auth.test.js` | Auth service tests with a fake Supabase client |
| `tests/tracker.test.js` | Repository mapping and CRUD tests with a fake client |
| `tests/export.test.js` | Backup shape tests |
| `tests/ui.test.js` | jsdom rendering and interaction tests |
| `.env.example` | Required public environment variable names |
| `vercel.json` | SPA fallback and security headers |
| `README.md` | Supabase configuration, OTP template, deployment, and verification steps |

---

### Task 1: Scaffold the Vite App and Pure Sorting Utilities

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/styles.css`
- Create: `src/lib/company.js`
- Create: `src/lib/dates.js`
- Create: `tests/company.test.js`
- Create: `tests/dates.test.js`

**Interfaces:**
- Produces: `normalizeCompanyName(name: string): string`
- Produces: `groupApplications(applications: Application[]): CompanyGroup[]`
- Produces: `todayLocal(): string`
- Produces: `getDueMeta(date: string | null, today?: string): { text: string, state: 'none'|'overdue'|'soon'|'future', days: number|null }`

- [ ] **Step 1: Add the package scripts and test dependencies**

```json
{
  "name": "private-job-tracker",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.57.0"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "vite": "^7.1.0",
    "vitest": "^3.2.0"
  }
}
```

Create `.gitignore` with:

```gitignore
node_modules/
dist/
.env.local
.env.*.local
```

- [ ] **Step 2: Write failing company normalization and grouping tests**

```js
import { describe, expect, it } from 'vitest';
import { groupApplications, normalizeCompanyName } from '../src/lib/company.js';

describe('normalizeCompanyName', () => {
  it('normalizes case and whitespace without translating aliases', () => {
    expect(normalizeCompanyName('  Tencent   Games ')).toBe('tencent games');
    expect(normalizeCompanyName('腾讯')).toBe('腾讯');
  });
});

describe('groupApplications', () => {
  it('keeps company roles together and orders by latest update', () => {
    const groups = groupApplications([
      { id: 'a', company: 'Tencent', company_key: 'tencent', updated_at: '2026-09-01T10:00:00Z' },
      { id: 'b', company: 'ByteDance', company_key: 'bytedance', updated_at: '2026-09-03T10:00:00Z' },
      { id: 'c', company: 'tencent', company_key: 'tencent', updated_at: '2026-09-02T10:00:00Z' }
    ]);
    expect(groups.map(group => group.key)).toEqual(['bytedance', 'tencent']);
    expect(groups[1].applications.map(item => item.id)).toEqual(['c', 'a']);
  });
});
```

- [ ] **Step 3: Run the tests and verify the missing-module failure**

Run: `npm install && npm test -- tests/company.test.js`

Expected: FAIL because `src/lib/company.js` does not exist.

- [ ] **Step 4: Implement company grouping**

```js
export function normalizeCompanyName(name = '') {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function groupApplications(applications) {
  const groups = new Map();
  for (const application of applications) {
    const key = application.company_key || normalizeCompanyName(application.company);
    if (!groups.has(key)) groups.set(key, { key, company: application.company, applications: [] });
    groups.get(key).applications.push(application);
  }
  return [...groups.values()]
    .map(group => {
      group.applications.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { ...group, updatedAt: group.applications[0].updated_at };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

- [ ] **Step 5: Write and implement deterministic date tests**

```js
import { expect, it } from 'vitest';
import { getDueMeta } from '../src/lib/dates.js';

it('labels overdue and seven-day follow-ups', () => {
  expect(getDueMeta('2026-09-01', '2026-09-02').state).toBe('overdue');
  expect(getDueMeta('2026-09-09', '2026-09-02')).toMatchObject({ state: 'soon', days: 7 });
  expect(getDueMeta(null, '2026-09-02').state).toBe('none');
});
```

Run: `npm test -- tests/company.test.js tests/dates.test.js`

Expected: PASS after implementing `todayLocal()` and UTC-safe date-only subtraction in `src/lib/dates.js`.

- [ ] **Step 6: Create the minimal Vite shell and copy the current visual tokens into `src/styles.css`**

`index.html` must contain only the root mount point and module entry:

```html
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

Run: `npm run build`

Expected: PASS and create `dist/index.html`.

- [ ] **Step 7: Commit the scaffold and pure utilities**

```bash
git add package.json package-lock.json vite.config.js index.html src tests
git commit -m "feat: scaffold cloud tracker and grouping utilities"
```

---

### Task 2: Create the Supabase Schema, Triggers, and RLS Policies

**Files:**
- Create: `supabase/migrations/202609020001_init.sql`

**Interfaces:**
- Produces: tables `public.applications`, `public.interviews`, `public.status_history`
- Produces: trigger function `public.set_updated_at()`
- Produces: trigger function `public.record_application_status()`
- Produces: trigger function `public.touch_application_from_interview()`

- [ ] **Step 1: Define tables, constraints, and indexes in the migration**

The migration must use `auth.uid()` defaults for `user_id`, `gen_random_uuid()` for UUID primary keys, `ON DELETE CASCADE` for child records, a rating check of `0 <= rating AND rating <= 5`, and a status check containing exactly:

```sql
'准备投递', '已投递', '笔试', '面试中', '已录用', '已拒绝', '已放弃'
```

Create these indexes:

```sql
create index applications_user_company_updated_idx
  on public.applications (user_id, company_key, updated_at desc);
create index interviews_user_application_date_idx
  on public.interviews (user_id, application_id, date desc);
create index status_history_user_application_changed_idx
  on public.status_history (user_id, application_id, changed_at desc);
```

- [ ] **Step 2: Add database-owned timestamp and history triggers**

Implement triggers so that:

- inserting or changing an application status inserts one `status_history` row;
- updating any application refreshes `updated_at`;
- inserting, updating, or deleting an interview refreshes the parent application's `updated_at`;
- child rows reject an `application_id` owned by a different user.

- [ ] **Step 3: Enable RLS and add explicit CRUD policies**

Each table must have separate select, insert, update, and delete policies. The ownership expressions are:

```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

For `interviews` and `status_history`, `with check` must additionally require an owned parent application through an `exists` subquery.

- [ ] **Step 4: Validate the migration in a temporary Supabase project or local Supabase stack**

Run locally when Docker and Supabase CLI are available:

```bash
supabase db reset
supabase db lint
```

Expected: both commands exit 0. If local Supabase is unavailable, run the migration in the user's empty hosted project during Task 8 and execute the security verification queries documented in `README.md`.

- [ ] **Step 5: Commit the database contract**

```bash
git add supabase/migrations/202609020001_init.sql
git commit -m "feat: add private tracker database and RLS"
```

---

### Task 3: Add Configuration, Supabase Client, and OTP Authentication

**Files:**
- Create: `.env.example`
- Create: `src/config.js`
- Create: `src/services/supabase.js`
- Create: `src/services/auth.js`
- Create: `tests/auth.test.js`

**Interfaces:**
- Produces: `getPublicConfig(): { supabaseUrl: string, supabaseAnonKey: string }`
- Produces: `createAuthService(client): AuthService`
- `AuthService.requestOtp(email: string): Promise<void>`
- `AuthService.verifyOtp(email: string, token: string): Promise<Session>`
- `AuthService.getSession(): Promise<Session|null>`
- `AuthService.signOut(): Promise<void>`
- `AuthService.onAuthStateChange(callback): () => void`

- [ ] **Step 1: Write failing authentication service tests with a fake client**

```js
import { expect, it, vi } from 'vitest';
import { createAuthService } from '../src/services/auth.js';

it('requests OTP without allowing browser sign-up', async () => {
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  const auth = createAuthService({ auth: { signInWithOtp } });
  await auth.requestOtp('owner@example.com');
  expect(signInWithOtp).toHaveBeenCalledWith({
    email: 'owner@example.com',
    options: { shouldCreateUser: false }
  });
});
```

- [ ] **Step 2: Verify the authentication test fails**

Run: `npm test -- tests/auth.test.js`

Expected: FAIL because `createAuthService` is not implemented.

- [ ] **Step 3: Implement configuration validation and the auth service**

`.env.example` contains only:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Every Supabase response must pass through a helper that throws the returned `error`; OTP tokens must be trimmed and validated against `/^\d{6}$/` before calling `verifyOtp({ email, token, type: 'email' })`.

- [ ] **Step 4: Run auth tests and build**

Run: `npm test -- tests/auth.test.js && npm run build`

Expected: PASS. A missing environment variable may show a deliberate configuration error only at runtime, not during test import.

- [ ] **Step 5: Commit authentication infrastructure**

```bash
git add .env.example src/config.js src/services/supabase.js src/services/auth.js tests/auth.test.js
git commit -m "feat: add email OTP authentication service"
```

---

### Task 4: Implement the Cloud Tracker Repository

**Files:**
- Create: `src/services/tracker.js`
- Create: `tests/tracker.test.js`

**Interfaces:**
- Produces: `createTrackerService(client): TrackerService`
- `TrackerService.loadAll(): Promise<{ applications, interviews, statusHistory }>`
- `TrackerService.saveApplication(form): Promise<Application>`
- `TrackerService.deleteApplication(id: string): Promise<void>`
- `TrackerService.saveInterview(form): Promise<Interview>`
- `TrackerService.deleteInterview(id: string): Promise<void>`

- [ ] **Step 1: Write failing row-mapping and CRUD tests**

Test that a form containing `nextAction`, `nextDate`, and comma-separated tags is written as `next_action`, `next_date`, and a trimmed string array. Test that `company_key` equals `normalizeCompanyName(company)`. Test that `loadAll()` issues three owned-table selects and returns camelCase view models.

Example assertion:

```js
expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
  company: 'Tencent',
  company_key: 'tencent',
  next_action: '准备一面',
  tags: ['产品', 'AI']
}));
```

- [ ] **Step 2: Run the repository tests and verify failure**

Run: `npm test -- tests/tracker.test.js`

Expected: FAIL because `src/services/tracker.js` does not exist.

- [ ] **Step 3: Implement the repository with explicit column lists**

Use `.select('id,user_id,company,company_key,...')` rather than `select('*')`. Do not send `user_id`, `created_at`, or `updated_at` from form values. Use `.single()` after application/interview upserts, and throw every Supabase error.

- [ ] **Step 4: Run repository and utility tests**

Run: `npm test -- tests/tracker.test.js tests/company.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the cloud repository**

```bash
git add src/services/tracker.js tests/tracker.test.js
git commit -m "feat: add Supabase tracker repository"
```

---

### Task 5: Build the Email OTP Login View and Session Bootstrap

**Files:**
- Create: `src/ui/auth-view.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Create: `tests/ui.test.js`

**Interfaces:**
- Consumes: `AuthService` from Task 3
- Produces: `createAuthView(root, authService): { show(): void, destroy(): void }`
- Produces: `bootstrap({ root, authService, trackerService }): Promise<void>`

- [ ] **Step 1: Write failing jsdom tests for the two-step login flow**

```js
it('requests an OTP and reveals the six-digit form', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const auth = { requestOtp: vi.fn().mockResolvedValue() };
  const view = createAuthView(document.querySelector('#app'), auth);
  view.show();
  document.querySelector('[name="email"]').value = 'owner@example.com';
  document.querySelector('[data-action="request-otp"]').click();
  await flushPromises();
  expect(auth.requestOtp).toHaveBeenCalledWith('owner@example.com');
  expect(document.querySelector('[name="token"]').hidden).toBe(false);
});
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `npm test -- tests/ui.test.js`

Expected: FAIL because the auth view is missing.

- [ ] **Step 3: Implement login, OTP verification, resend, change-email, and error states**

Disable request/verify buttons while awaiting promises. Keep the entered email after a failed verification. Display Chinese messages for invalid email, invalid six-digit token, expired token, unknown account, rate limiting, and network errors without exposing raw server details.

- [ ] **Step 4: Implement session bootstrap in `src/main.js`**

Bootstrap behavior:

1. render a loading shell;
2. call `authService.getSession()`;
3. show auth view when no session exists;
4. mount tracker view when a session exists;
5. subscribe to auth changes and swap views;
6. unsubscribe all listeners before remounting.

- [ ] **Step 5: Run tests and visually inspect the login page at mobile and desktop widths**

Run: `npm test -- tests/ui.test.js && npm run dev`

Expected: tests pass; 390px and 1440px layouts contain no horizontal overflow.

- [ ] **Step 6: Commit the login flow**

```bash
git add src/main.js src/ui/auth-view.js src/styles.css tests/ui.test.js
git commit -m "feat: add private OTP login flow"
```

---

### Task 6: Build the Grouped Tracker and Interview Retrospective UI

**Files:**
- Create: `src/ui/tracker-view.js`
- Modify: `src/styles.css`
- Modify: `tests/ui.test.js`

**Interfaces:**
- Consumes: `TrackerService` from Task 4
- Consumes: `groupApplications()` and `getDueMeta()` from Task 1
- Produces: `createTrackerView(root, { trackerService, authService }): TrackerView`
- `TrackerView.mount(): Promise<void>`
- `TrackerView.destroy(): void`

- [ ] **Step 1: Add failing grouped rendering tests**

Create two Tencent roles and one ByteDance role. Assert that only two company group headers render, the ByteDance group appears first when its latest update is newest, and Tencent's newest role appears before its older role.

```js
expect([...document.querySelectorAll('[data-company-key]')].map(el => el.dataset.companyKey))
  .toEqual(['bytedance', 'tencent']);
expect([...document.querySelectorAll('[data-company-key="tencent"] [data-application-id]')]
  .map(el => el.dataset.applicationId)).toEqual(['tencent-new', 'tencent-old']);
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `npm test -- tests/ui.test.js`

Expected: FAIL because the tracker view does not exist.

- [ ] **Step 3: Port dashboard, filters, application forms, details, and status timeline**

Retain all current fields and Chinese status values. Render one company header followed by its matching role rows/cards. Apply search and status filtering before calling `groupApplications()`. Keep the chosen sort fixed to latest activity; do not add a conflicting alphabetical sort option.

- [ ] **Step 4: Port interview cards and retrospective form**

Each interview must display the company, role, stage, date, rating, and question snippet. Saving an interview calls `saveInterview()`, reloads cloud data, and causes the database-refreshed application/company order to render immediately.

- [ ] **Step 5: Add save/delete/loading/sync-state behavior**

For every mutation:

1. preserve form input until the service resolves;
2. disable the submitting control;
3. show `正在同步`;
4. reload data after success and show `已同步`;
5. on failure keep the modal open, re-enable controls, and show `同步失败，请重试`;
6. require confirmation before deletes and state that child interviews/history will be removed.

- [ ] **Step 6: Test application and interview interactions**

Add jsdom tests for application save, interview save, failed save preserving form values, status filtering inside company groups, and cascading-delete warning text.

Run: `npm test -- tests/ui.test.js`

Expected: PASS.

- [ ] **Step 7: Verify responsive behavior and accessibility basics**

Run: `npm run dev`

Verify at 390×844 and 1440×1000: keyboard focus is visible, modals close with Escape, forms have labels, status is not conveyed by color alone, and no content overflows horizontally.

- [ ] **Step 8: Commit the tracker interface**

```bash
git add src/ui/tracker-view.js src/styles.css tests/ui.test.js
git commit -m "feat: add grouped cloud tracker interface"
```

---

### Task 7: Add Cloud JSON Backup and Production Configuration

**Files:**
- Create: `src/lib/export.js`
- Create: `tests/export.test.js`
- Modify: `src/ui/tracker-view.js`
- Create: `vercel.json`
- Create: `README.md`

**Interfaces:**
- Produces: `serializeBackup(data, exportedAt): string`
- Produces: `downloadBackup(data, documentRef = document): void`

- [ ] **Step 1: Write a failing backup-shape test**

```js
it('exports all cloud collections with a version and timestamp', () => {
  const json = serializeBackup(
    { applications: [{ id: 'a' }], interviews: [], statusHistory: [] },
    '2026-09-02T12:00:00.000Z'
  );
  expect(JSON.parse(json)).toEqual({
    version: 1,
    exportedAt: '2026-09-02T12:00:00.000Z',
    applications: [{ id: 'a' }],
    interviews: [],
    statusHistory: []
  });
});
```

- [ ] **Step 2: Implement serialization and browser download**

The filename must be `求职进度云端备份-YYYY-MM-DD.json`. Export immediately after reloading all three collections so the file reflects confirmed cloud data.

Run: `npm test -- tests/export.test.js`

Expected: PASS.

- [ ] **Step 3: Add SPA routing and security headers**

`vercel.json` must add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`, while rewriting non-file paths to `/index.html`.

- [ ] **Step 4: Write exact setup and recovery documentation**

`README.md` must include:

- required Node version and local commands;
- how to create the Supabase project and run the migration;
- how to create the single user before disabling public sign-ups;
- the OTP email template using `{{ .Token }}`;
- the two Vercel environment variables;
- why the anon key is allowed and the service-role key is forbidden;
- how to export cloud backup JSON;
- how to verify RLS with an unauthenticated request;
- how to delete the deployment and Supabase project if desired.

- [ ] **Step 5: Run the full local verification suite**

Run:

```bash
npm test
npm run build
```

Expected: all tests PASS and Vite produces `dist/` without warnings that expose secrets.

- [ ] **Step 6: Commit backup and production documentation**

```bash
git add src/lib/export.js src/ui/tracker-view.js tests/export.test.js vercel.json README.md
git commit -m "feat: add backup and production configuration"
```

---

### Task 8: Connect the User's Supabase Project and Deploy

**Files:**
- Local-only: `.env.local` (never commit)
- Verify: all project files

**Interfaces:**
- Consumes: Supabase project URL and public anonymous key supplied by the user
- Produces: private production URL and verified cloud persistence

- [ ] **Step 1: Confirm the Supabase project has the single intended user and public registration is disabled**

In Supabase Auth, verify exactly one allowed user exists. Confirm the email OTP template displays `{{ .Token }}` and the project's email rate limit is appropriate for personal use.

- [ ] **Step 2: Execute and verify the database migration**

Run the contents of `supabase/migrations/202609020001_init.sql` in the project's SQL editor. Confirm all tables have RLS enabled and all twelve CRUD policies exist.

- [ ] **Step 3: Configure local public credentials without committing them**

Create `.env.local` with:

```dotenv
VITE_SUPABASE_URL=<actual-project-url>
VITE_SUPABASE_ANON_KEY=<actual-public-anon-key>
```

Run: `git status --short`

Expected: `.env.local` is absent from Git output because `.gitignore` excludes `.env.local` and `.env.*.local`.

- [ ] **Step 4: Run authenticated end-to-end acceptance checks locally**

Run: `npm run dev`

Verify:

1. OTP arrives and establishes a session;
2. create two roles at the same company and one at another company;
3. same-company roles render consecutively;
4. updating the older role moves it to the top inside its company group;
5. updating its interview moves that company group to the top;
6. refresh the page and confirm all data remains;
7. sign out and confirm data disappears;
8. sign back in and confirm data returns;
9. export a JSON backup containing all three collections.

- [ ] **Step 5: Deploy the validated build to Vercel**

Configure the two `VITE_` environment variables in the Vercel project, deploy from the committed source, and wait for the production deployment to report Ready.

- [ ] **Step 6: Repeat privacy and cross-device checks on production**

Verify an incognito browser cannot read data before login. Log in from a second device, update one application, and confirm the first device shows the change after refresh.

- [ ] **Step 7: Record the verified production URL and final commit**

Update the README deployment section with the production hostname only; never record a token, OTP, session, or secret.

```bash
git add README.md
git commit -m "docs: record verified cloud deployment"
```
