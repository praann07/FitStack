import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { macrosFromCalories, mifflinStJeor, targetCaloriesFor } from '@/lib/adaptive'
import { today } from '@/lib/date'
import type { AuthSession, Goal, RegisterPayload, User } from '@/types'
import { ApiError } from '@/types'

interface ProfileRow {
  id: string
  full_name: string | null
  goal: Goal | null
  goal_rate_kg_week: number | null
  height_cm: number | null
  approved: boolean
  role: 'admin' | 'user'
  created_at: string
  timezone: string
}

function toUser(email: string, profile: ProfileRow): User {
  return {
    id: profile.id,
    email,
    full_name: profile.full_name ?? '',
    goal: profile.goal ?? 'maintain',
    goal_rate_kg_week: profile.goal_rate_kg_week ?? 0,
    height_cm: profile.height_cm ?? 0,
    created_at: profile.created_at,
    approved: profile.approved,
    role: profile.role ?? 'user',
    timezone: profile.timezone ?? 'UTC',
  }
}

async function fetchProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw new ApiError(error.message, 500)
  return data as ProfileRow
}

/**
 * Fire-and-forget: a failed notification email must never block signup/login.
 * Uses a raw fetch, not supabase.functions.invoke() -- invoke() always
 * re-derives its own Authorization header from the client's *current*
 * ambient session at request-send time, overwriting any custom header
 * passed in its `headers` option (confirmed live: passing one through
 * invoke() still 401'd). Both call sites sign out on the very next line
 * after calling this, so by the time that overwrite happened, the ambient
 * session was already gone. A raw fetch with the token captured synchronously
 * from the already-resolved signUp()/signInWithPassword() response sidesteps
 * that entirely.
 */
function sendAuthEmail(kind: 'welcome' | 'login', accessToken: string): void {
  fetch(`${supabaseUrl}/functions/v1/send-auth-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ kind }),
  }).catch((error) => {
    console.error('send-auth-email failed', error)
  })
}

/**
 * Auth service. Password + a 6-digit email code (Supabase's own OTP mailer,
 * `signInWithOtp`/`verifyOtp`) gates both signup and login -- see
 * `sendLoginCode`/`verifyLoginCode` below. Underneath that, a `profiles` row
 * is stub-created server-side the moment `auth.users` gets a new row;
 * `approved` stays false until an admin flips it manually in the Supabase
 * dashboard (see supabase/migrations/0007_approval_gate.sql), which the app
 * treats as a distinct auth status (see stores/authStore.ts) rather than
 * routing straight to the dashboard. RLS enforces that on every table besides
 * `profiles` itself, so approval is a UX gate, not the actual security
 * boundary -- and neither, really, is the OTP step: the password sign-in
 * already yields a valid session, which this service closes with
 * `signOut()` immediately so the browser never holds an unverified session
 * past the moment it was created.
 */
export const authService = {
  /**
   * Signs up and completes the profile in one step, using the session
   * signUp() itself returns: writes the profile fields, seeds today's
   * body_metrics entry, and computes + stores a Mifflin-St Jeor baseline
   * nutrition_targets row, the same three writes the original
   * /auth/register endpoint did in one transaction. The OTP gap comes after
   * all of that, not before -- see the signOut() at the end of this method.
   */
  async signUp(payload: RegisterPayload): Promise<AuthSession> {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
    })
    if (authError) throw new ApiError(authError.message, authError.status ?? 400)
    if (!authData.user) throw new ApiError('Sign-up succeeded but no account was returned.', 500)
    const userId = authData.user.id
    const logDate = today()

    const { error: metricError } = await supabase
      .from('body_metrics')
      .upsert({ user_id: userId, log_date: logDate, weight_kg: payload.weight_kg }, { onConflict: 'user_id,log_date' })
    if (metricError) throw new ApiError(metricError.message, 500)

    const baselineTdee = mifflinStJeor({
      weight_kg: payload.weight_kg,
      height_cm: payload.height_cm,
      age: payload.age,
      sex: payload.sex,
      activity_level: payload.activity_level,
    })
    const targetCalories = targetCaloriesFor(baselineTdee, payload.goal_rate_kg_week)
    const macros = macrosFromCalories(targetCalories, payload.weight_kg, payload.goal)

    const { error: targetError } = await supabase.from('nutrition_targets').insert({
      user_id: userId,
      effective_date: logDate,
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      source: 'adaptive',
    })
    if (targetError) throw new ApiError(targetError.message, 500)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: payload.full_name,
        goal: payload.goal,
        goal_rate_kg_week: payload.goal_rate_kg_week,
        height_cm: payload.height_cm,
        onboarded: true,
      })
      .eq('id', userId)
      .select()
      .single()
    if (profileError) throw new ApiError(profileError.message, 500)

    if (authData.session) sendAuthEmail('welcome', authData.session.access_token)
    const user = toUser(authData.user.email ?? payload.email, profile as ProfileRow)
    // The writes above need the session signUp() just created; drop it the
    // moment they're done so the account sits unverified until a code is
    // confirmed (authStore sends it, same as login()).
    await supabase.auth.signOut()
    return { user }
  },

  /** Checks the password, then closes the resulting session -- authStore sends the code and verifyLoginCode re-opens it once confirmed. */
  async login(email: string, password: string): Promise<void> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new ApiError(error.message, error.status ?? 401)
    if (data.session) sendAuthEmail('login', data.session.access_token)
    await supabase.auth.signOut()
  },

  /** Emails a fresh 6-digit code via Supabase's own OTP mailer. Never creates a new account -- the password step already did that. */
  async sendLoginCode(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) throw new ApiError(error.message, error.status ?? 500)
  },

  /** Verifies the code and, on success, establishes the real session. */
  async verifyLoginCode(email: string, code: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new ApiError(error.message, error.status ?? 400)
    if (!data.user) throw new ApiError('Verification succeeded but no account was returned.', 500)
    const profile = await fetchProfile(data.user.id)
    return { user: toUser(data.user.email ?? email, profile) }
  },

  /** Exchanges a persisted Supabase session for the current user, on app boot. */
  async restore(): Promise<AuthSession | null> {
    const { data } = await supabase.auth.getSession()
    const sessionUser = data.session?.user
    if (!sessionUser) return null
    const profile = await fetchProfile(sessionUser.id)
    return { user: toUser(sessionUser.email ?? '', profile) }
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  /** Profile + goal changes from a settings screen. */
  async updateProfile(
    userId: string,
    patch: Partial<Pick<User, 'full_name' | 'goal' | 'goal_rate_kg_week' | 'height_cm'>>,
  ): Promise<User> {
    const { data: authData } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single()
    if (error) throw new ApiError(error.message, 500)
    return toUser(authData.user?.email ?? '', data as ProfileRow)
  },

  goalRateDefault(goal: Goal): number {
    if (goal === 'bulk') return 0.25
    if (goal === 'cut') return -0.5
    return 0
  },

  /** Fetch current user's profile (used for polling approval status). */
  async getCurrentProfile(): Promise<ProfileRow> {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) throw new ApiError('No authenticated user', 401)
    return fetchProfile(authData.user.id)
  },
}
