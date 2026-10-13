import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig, SUPABASE_PROXY_PATH, supabaseAuthStorageKey } from './config';

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicConfig();
    browserClient = createBrowserClient(`${window.location.origin}${SUPABASE_PROXY_PATH}`, publishableKey, {
      cookieOptions: { name: supabaseAuthStorageKey(url) },
    });
  }

  return browserClient;
}
