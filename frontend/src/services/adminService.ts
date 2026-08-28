import { supabase } from '@/lib/supabase'
import { ApiError } from '@/types'

/**
 * An account row surfaced by the admin list. `email` lives in auth.users
 * (not profiles), so it is returned by the SECURITY DEFINER RPC rather than
 * read directly through RLS.
 *
 * @see supabase/migrations/0010_admin_role_unique.sql
 */
export interface AdminUser {
  id: string
  full_name: string | null
  email: string
  approved: boolean
  role: 'admin' | 'user'
  created_at: string
}

/**
 * Admin-only management of the pilot access gate. Every RPC is SECURITY
 * DEFINER and re-checks is_admin() inside its body, so calling these as a
 * non-admin raises HTTP 403 regardless of the client.
 */
export const adminService = {
  async listUsers(): Promise<AdminUser[]> {
    const { data, error } = await supabase.rpc('admin_list_users')
    if (error) throw new ApiError(error.message, 403)
    return (data ?? []) as AdminUser[]
  },

  async setApproved(userId: string, approved: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_approved', { target_uid: userId, approved })
    if (error) throw new ApiError(error.message, 403)
  },
}
