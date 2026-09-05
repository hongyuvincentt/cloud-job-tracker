import { afterEach, expect, it, vi } from 'vitest';
import { downloadBackup, serializeBackup } from '../src/lib/export.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

it('downloads a dated Chinese backup filename', () => {
  const createObjectURL = vi.fn(() => 'blob:backup');
  const revokeObjectURL = vi.fn();
  let downloadedName;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload() {
    downloadedName = this.download;
  });
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  vi.stubGlobal('Date', class extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-09-02T12:00:00.000Z']));
    }
  });

  downloadBackup({ applications: [], interviews: [], statusHistory: [] }, document);

  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(downloadedName).toBe('求职进度云端备份-2026-09-02.json');
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  expect(document.querySelector('a[download]')).toBeNull();
});

it('cleans up the temporary download even when clicking fails', () => {
  const createObjectURL = vi.fn(() => 'blob:backup');
  const revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    throw new Error('browser refused download');
  });
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  vi.stubGlobal('Date', class extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-09-02T12:00:00.000Z']));
    }
  });

  expect(() => downloadBackup({ applications: [], interviews: [], statusHistory: [] }, document))
    .toThrow('browser refused download');
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
});
