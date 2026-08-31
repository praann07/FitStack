-- Close the remaining SECURITY DEFINER exposure for functions that are used
-- ONLY internally (inside other definer bodies / trigger guards / server-side),
-- never called directly by the client via /rpc/. Revoking `authenticated`
-- EXECUTE blocks direct client calls while leaving their internal use intact,
-- because SECURITY DEFINER functions run as their owner (postgres), so other
-- definer functions (admin_set_approved etc.) can still call is_admin().
--
-- NOT revoked here (intentionally required by the app, called via /rpc/ and
-- self-guarded with is_admin() in the body):
--   admin_list_users, admin_set_approved

revoke execute on function public.is_admin()                from authenticated;
revoke execute on function public.soft_delete_exercise(uuid) from authenticated;
revoke execute on function public.restore_exercise(uuid)     from authenticated;
