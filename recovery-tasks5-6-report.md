# Recovery Tasks 5–6 Report

## Scope and files

- `src/ui/auth-view.js` — two-step email OTP view, shared OTP-operation lock, Chinese safe errors, resend/change-email behavior, and listener cleanup.
- `src/ui/tracker-view.js` — authenticated dashboard, fixed latest-activity company grouping, filters, complete application and interview forms, details/history, guarded mutations, deletes, and modal lifecycle.
- `src/main.js` — session bootstrap, auth-state swaps, and safe current-view/subscription teardown.
- `src/styles.css` — responsive desktop/mobile layout, visible focus treatment, modal and sync-state styling.
- `tests/ui.test.js` — jsdom coverage for OTP flow/lock, session swapping, grouping/filtering, app/interview saves, failed-save retention, delete warning, and Escape modal closure.

## Exact outcomes

- OTP login uses the existing `AuthService`, keeps an email after failed verification, serializes send/resend/verify operations, and never exposes raw provider errors.
- Session bootstrap renders a loading state, restores the session, swaps auth/tracker views on auth changes, and destroys the previous view and subscription on teardown.
- Applications are filtered before `groupApplications()`; company groups and roles use camelCase `updatedAt` newest-first ordering with no alphabetical sort path.
- Dashboard retains all application fields/statuses, status-history details, and interview retrospective fields/cards. Interview cards show company, role, stage, date, score, and a question snippet.
- Every save/delete reports `正在同步`, reloads confirmed cloud data, shows `已同步` on success, preserves an open form with `同步失败，请重试` on failed save, and confirms cascading application deletion in Chinese.
- Form labels, textual status/due labels, Escape-close modals, visible focus rings, escaping, and HTTP(S)-only external links are included.

## Verification

- `npm test` — 7 files, 27 tests passed.
- `npm run build` — Vite production build completed successfully.
- `git diff --check` — no whitespace errors.
- Responsive static audit — fluid container/modal widths, `minmax(0, 1fr)` grids, and the 680px single-column/mobile rules cover 390px and desktop widths. A live browser viewport was not available in this environment.

## Commit

- `feat: add recovery OTP and grouped tracker UI`

## Concerns

- No implementation blocker. Live visual inspection could not be run; jsdom interaction coverage and the static responsive audit were used instead.
