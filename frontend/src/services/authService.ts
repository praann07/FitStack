import { supabase } from '@/lib/supabase'
import { macrosFromCalories, mifflinStJeor, targetCaloriesFor } from '@/lib/adaptive'
import { today } from '@/lib/date'
import type { AuthSession, Goal, OnboardingPayload, User } from '@/types'
import { ApiError } from '@/types'

interface ProfileRow {
  id: string
  full_name: string | null
  goal: Goal | null
  goal_rate_kg_week: number | null
  height_cm: number | null
  onboarded: boolean
  created_at: string
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
    onboarded: profile.onboarded,
  }
}

async function fetchProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw new ApiError(error.message, 500)
  return data as ProfileRow
}

/**
 * Auth service (Supabase replatform — Phase 2).
 *
 * Identity lives entirely in Supabase Auth (email OTP, no passwords). A
 * `profiles` row is stub-created server-side (see supabase/migrations/0001)
 * the moment `auth.users` gets a new row; `onboarded` stays false until
 * `completeOnboarding` runs, which the app treats as a distinct auth status
 * (see stores/authStore.ts) rather than routing straight to the dashboard.
 */
export const authService = {
  /** Sends (or re-sends) a one-time code to the given email. */
  async requestOtp(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) throw new ApiError(error.message, error.status ?? 400)
  },

  /** Verifies the code from that email and establishes a session. */
  async verifyOtp(email: string, token: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw new ApiError(error.message, error.status ?? 400)
    if (!data.user) throw new ApiError('Verification succeeded but no session was returned.', 500)
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

  /**
   * Post-OTP profile completion for a first-time user: writes the profile
   * fields, seeds today's body_metrics entry, and computes + stores a
   * Mifflin-St Jeor baseline nutrition_targets row -- the same three writes
   * the old /auth/register endpoint did in one transaction, run sequentially
   * client-side. `onboarded` is set last so a failure partway leaves the user
   * back on the onboarding screen to retry, rather than silently half-set-up.
   */
  async completeOnboarding(payload: OnboardingPayload): Promise<User> {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) throw new ApiError('Not signed in.', 401)
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

    return toUser(authData.user.email ?? '', profile as ProfileRow)
  },

  /** Profile + goal changes from a settings screen (post-onboarding). */
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
}
