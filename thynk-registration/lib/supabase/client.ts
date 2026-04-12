import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}


// Get the current access token for use in API fetch calls
// This ensures POST/PATCH/DELETE requests authenticate correctly
export async function getAccessToken(): Promise<string> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

// Build Authorization headers for API calls
export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  return fetch(url, {
    credentials: 'include',
    ...opts,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
}
