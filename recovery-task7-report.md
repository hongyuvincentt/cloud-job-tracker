# Recovery Task 7 Report

## Scope and files

- `src/lib/export.js` — versioned JSON serialization, dated Chinese filename, browser download, and guaranteed temporary-anchor/object-URL cleanup.
- `src/ui/tracker-view.js` — authenticated export action that reloads all cloud collections before downloading and reports sync state.
- `tests/export.test.js` — backup shape, filename, browser download, and failed-click cleanup coverage.
- `tests/ui.test.js` — confirmed-cloud-state reload coverage for export.
- `vercel.json` — SPA fallback and restrictive response security headers.
- `README.md` — Chinese-friendly local setup, Supabase migration/account/OTP/RLS configuration, Vercel variables, backup boundary, key safety, and teardown instructions.

## Exact outcomes

- `serializeBackup()` emits `version: 1`, the supplied ISO timestamp, and all three collections: `applications`, `interviews`, and `statusHistory`.
- `downloadBackup()` uses the exact filename format `求职进度云端备份-YYYY-MM-DD.json` and always removes its temporary anchor and revokes its object URL, including when the browser click throws.
- The tracker export action reloads `trackerService.loadAll()` immediately before serialization/download, so only confirmed cloud data is exported; reload failures do not trigger a download.
- Vercel rewrites application routes to `/index.html` and sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`.
- README documentation explicitly covers Node/local commands, migration execution, creating the one user before disabling public signup, six-digit OTP email template with `{{ .Token }}`, both `VITE_` variables, anon-vs-service-role safety, RLS unauthenticated checks, export behavior, and deletion of Vercel/Supabase resources.

## Verification

| Command | Outcome |
|---|---|
| `npm test -- tests/export.test.js` (red) | Initially failed the cleanup test because the temporary anchor remained after a thrown click. |
| `npm test -- tests/export.test.js` (green) | Exit 0: 3 tests passed. |
| `npm test -- tests/ui.test.js` | Exit 0: 11 tests passed. |
| `npm test` | Exit 0: 8 test files and 31 tests passed. |
| `npm run build` | Exit 0: Vite 7.3.6 production build completed successfully. |
| `git diff --check` | Exit 0; no whitespace errors. |
| Production secret scan | No `service_role`/`service-role` reference in `dist/`; only public client configuration is documented. |

## Commit

- `feat: add backup and production configuration`

## Concerns

- Live Supabase migration/RLS/OTP verification and Vercel deployment remain deferred to Task 8 because no project credentials were supplied and this task explicitly excludes deployment.
- Live browser viewport/download behavior was not available in this environment; jsdom coverage and the production build were used instead.
