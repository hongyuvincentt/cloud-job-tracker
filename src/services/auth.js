function unwrap(response) {
  if (response.error) throw response.error;
  return response.data;
}

export function createAuthService(client) {
  return {
    async requestOtp(email) {
      unwrap(
        await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false }
        })
      );
    },

    async verifyOtp(email, token) {
      const trimmedToken = token.trim();
      if (!/^\d{6}$/.test(trimmedToken)) {
        throw new Error('OTP token must contain exactly six digits.');
      }

      const data = unwrap(
        await client.auth.verifyOtp({ email, token: trimmedToken, type: 'email' })
      );
      if (!data?.session) {
        throw new Error('OTP verification returned no session.');
      }
      return data.session;
    },

    async getSession() {
      const data = unwrap(await client.auth.getSession());
      return data?.session ?? null;
    },

    async signOut() {
      unwrap(await client.auth.signOut());
    },

    onAuthStateChange(callback) {
      const data = unwrap(client.auth.onAuthStateChange(callback));
      if (!data?.subscription) {
        throw new Error('Supabase did not return an auth subscription.');
      }
      return () => data.subscription.unsubscribe();
    }
  };
}
