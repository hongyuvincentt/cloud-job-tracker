import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('imports the Supabase module without configuration and validates only when requested', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

  await expect(import('../src/services/supabase.js')).resolves.toMatchObject({
    getSupabaseClient: expect.any(Function)
  });

  const { getSupabaseClient } = await import('../src/services/supabase.js');
  expect(() => getSupabaseClient()).toThrow('Missing VITE_SUPABASE_URL');
});

it('creates one cached Supabase client after public configuration is available', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

  const { getSupabaseClient } = await import('../src/services/supabase.js');
  expect(getSupabaseClient()).toBe(getSupabaseClient());
});
