import { expect, it } from 'vitest';
import { getDueMeta, todayLocal } from '../src/lib/dates.js';

it('returns the current local calendar date as YYYY-MM-DD', () => {
  expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('labels overdue and seven-day follow-ups', () => {
  expect(getDueMeta('2026-09-01', '2026-09-02')).toMatchObject({ state: 'overdue', days: -1 });
  expect(getDueMeta('2026-09-09', '2026-09-02')).toMatchObject({ state: 'soon', days: 7 });
  expect(getDueMeta(null, '2026-09-02')).toMatchObject({ state: 'none', days: null });
});
