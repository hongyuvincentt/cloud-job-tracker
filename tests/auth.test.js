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

it('trims a six-digit OTP and returns the verified session', async () => {
  const session = { access_token: 'test-token' };
  const verifyOtp = vi.fn().mockResolvedValue({ data: { session }, error: null });
  const auth = createAuthService({ auth: { verifyOtp } });

  await expect(auth.verifyOtp('owner@example.com', ' 123456 ')).resolves.toEqual(session);
  expect(verifyOtp).toHaveBeenCalledWith({
    email: 'owner@example.com',
    token: '123456',
    type: 'email'
  });
});

it('rejects malformed OTP values before calling Supabase', async () => {
  const verifyOtp = vi.fn();
  const auth = createAuthService({ auth: { verifyOtp } });

  await expect(auth.verifyOtp('owner@example.com', 'abc')).rejects.toThrow('six digits');
  expect(verifyOtp).not.toHaveBeenCalled();
});

it('throws when OTP verification has no session', async () => {
  const verifyOtp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const auth = createAuthService({ auth: { verifyOtp } });

  await expect(auth.verifyOtp('owner@example.com', '123456')).rejects.toThrow('no session');
});

it('forwards Supabase errors and exposes session and subscription helpers', async () => {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe } },
    error: null
  });
  const auth = createAuthService({
    auth: { signOut, getSession, onAuthStateChange }
  });

  await expect(auth.getSession()).resolves.toBeNull();
  await auth.signOut();
  const callback = vi.fn();
  auth.onAuthStateChange(callback)();

  expect(signOut).toHaveBeenCalledOnce();
  expect(onAuthStateChange).toHaveBeenCalledWith(callback);
  expect(unsubscribe).toHaveBeenCalledOnce();
});
