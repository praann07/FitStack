import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see frontend/.env.example).')
}

export const supabase = createClient(url, anonKey)

/** For the rare caller (authService's fire-and-forget notification email) that needs a raw fetch to an Edge Function instead of supabase.functions.invoke(), whose own Authorization header always wins over a custom one passed to it. */
export const supabaseUrl = url
export const supabaseAnonKey = anonKey

/** The current signed-in user's id, for rows that need it explicitly on insert (RLS verifies it, but can't fill it in). */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in.')
  return data.user.id
}
