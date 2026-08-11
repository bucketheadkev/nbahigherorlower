import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Next.js only inlines NEXT_PUBLIC_* env vars when accessed as static property
 * paths (process.env.NEXT_PUBLIC_FOO). Dynamic process.env[name] is undefined
 * in the browser bundle.
 */
function readPublicSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local.');
  }
  if (!publishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add it to .env.local.');
  }

  return { url, publishableKey };
}

/** Single reusable browser Supabase client (anon / publishable key only). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const { url, publishableKey } = readPublicSupabaseEnv();

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}
