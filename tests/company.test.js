import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupApplications, normalizeCompanyName } from '../src/lib/company.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeCompanyName', () => {
  it('normalizes case and whitespace without translating aliases', () => {
    expect(normalizeCompanyName('  Tencent   Games ')).toBe('tencent games');
    expect(normalizeCompanyName('腾讯')).toBe('腾讯');
  });

  it('normalizes lower case independently of the active locale', () => {
    vi.spyOn(String.prototype, 'toLocaleLowerCase').mockReturnValue('locale-specific');

    expect(normalizeCompanyName('  INVEST   TEAM ')).toBe('invest team');
  });
});

describe('groupApplications', () => {
  it('keeps company roles together and orders by latest update', () => {
    const groups = groupApplications([
      { id: 'a', company: 'Tencent', companyKey: 'tencent', updatedAt: '2026-09-01T10:00:00Z' },
      { id: 'b', company: 'ByteDance', companyKey: 'bytedance', updatedAt: '2026-09-03T10:00:00Z' },
      { id: 'c', company: 'tencent', companyKey: 'tencent', updatedAt: '2026-09-02T10:00:00Z' }
    ]);
    expect(groups.map(group => group.key)).toEqual(['bytedance', 'tencent']);
    expect(groups[1].applications.map(item => item.id)).toEqual(['c', 'a']);
    expect(groups[1].updatedAt).toBe('2026-09-02T10:00:00Z');
  });
});
