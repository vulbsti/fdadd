import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from './config';

let adminClient: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not configured.');
  }

  if (!adminClient) {
    const { url } = getSupabasePublicConfig();
    adminClient = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
