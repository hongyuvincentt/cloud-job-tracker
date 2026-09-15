import { describe, expect, it } from 'vitest';
import {
  chinaDateKey,
  countApplicationsForChinaDate,
  currentCheckinStreak,
  goalMessage
} from '../src/lib/checkins.js';

describe('daily application check-ins', () => {
  it('uses the China calendar day around UTC boundaries', () => {
    expect(chinaDateKey(new Date('2026-09-14T15:59:59Z'))).toBe('2026-09-14');
    expect(chinaDateKey(new Date('2026-09-14T16:00:00Z'))).toBe('2026-09-15');
  });

  it('counts newly created applications on the selected China date', () => {
    const applications = [
      { createdAt: '2026-09-14T15:59:59Z' },
      { createdAt: '2026-09-14T16:00:00Z' },
      { createdAt: '2026-09-15T03:00:00Z' },
      { createdAt: null }
    ];

    expect(countApplicationsForChinaDate(applications, '2026-09-15')).toBe(2);
  });

  it('switches from progress to evening and final reminders, then celebrates completion', () => {
    expect(goalMessage({ completed: 1, target: 3, chinaHour: 19 }).tone).toBe('progress');
    expect(goalMessage({ completed: 1, target: 3, chinaHour: 20 }).tone).toBe('evening');
    expect(goalMessage({ completed: 1, target: 3, chinaHour: 22 }).tone).toBe('final');
    expect(goalMessage({ completed: 3, target: 3, chinaHour: 23 })).toMatchObject({
      tone: 'complete',
      text: '今日目标完成，打卡已记录。继续保持！'
    });
  });

  it('keeps a streak through yesterday when today is not complete and includes today once complete', () => {
    const checkins = [
      { checkinDate: '2026-09-12' },
      { checkinDate: '2026-09-13' },
      { checkinDate: '2026-09-14' }
    ];

    expect(currentCheckinStreak(checkins, '2026-09-15')).toBe(3);
    expect(currentCheckinStreak([...checkins, { checkinDate: '2026-09-15' }], '2026-09-15')).toBe(4);
    expect(currentCheckinStreak(checkins, '2026-09-16')).toBe(0);
  });
});
