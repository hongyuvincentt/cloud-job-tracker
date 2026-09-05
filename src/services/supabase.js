import { createClient } from '@supabase/supabase-js';
import { getPublicConfig } from '../config.js';

let client;

export function createSupabaseClient(config = getPublicConfig()) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!client) client = createSupabaseClient();
  return client;
}
