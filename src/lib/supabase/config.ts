const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabasePublicConfig(): {
  url: string;
  publishableKey: string;
} {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  return { url: supabaseUrl, publishableKey: supabasePublishableKey };
}

/**
 * Browsers reach Supabase through this same-origin path (rewritten in
 * next.config.ts), so sign-in keeps working on networks whose DNS blocks
 * *.supabase.co. Servers still call Supabase directly.
 */
export const SUPABASE_PROXY_PATH = '/sb';

/**
 * The auth cookie name supabase-js derives from the project URL. The browser
 * client talks to the proxy URL, so it must be told the name explicitly to
 * share the session with the server client.
 */
export function supabaseAuthStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}
