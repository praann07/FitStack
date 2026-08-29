-- Add per-user timezone support to fix late-night logging date issues.
-- Late-night logs (e.g., 11 PM IST) were recorded as next day's date
-- because server uses UTC. Now users specify their timezone, and all
-- date calculations use their local midnight, not UTC midnight.

-- 1. Add timezone column to profiles
-- Uses IANA timezone strings (e.g., 'America/New_York', 'Asia/Kolkata').
-- Defaults to 'UTC' for existing users.
alter table public.profiles
  add column timezone text not null default 'UTC'
  check (timezone in (
    'UTC',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane'
  ));

-- 2. Drop the CHECK constraint temporarily to add more timezones
-- (PostgreSQL doesn't support adding to CHECK constraints directly)
alter table public.profiles
  drop constraint profiles_timezone_check;

-- 3. Re-add with comprehensive list of timezones
-- This includes all major IANA timezone identifiers
alter table public.profiles
  add constraint profiles_timezone_check
  check (timezone in (
    'UTC',
    'America/Anchorage', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Mexico_City', 'America/New_York', 'America/Toronto', 'America/Vancouver',
    'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
    'Atlantic/Azores', 'Atlantic/Cape_Verde',
    'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Dublin',
    'Europe/Istanbul', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow',
    'Europe/Paris', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Vienna',
    'Europe/Zurich',
    'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
    'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
    'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai',
    'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Brisbane', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
    'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu'
  ));

-- 4. Add indexes for timezone queries (none needed — it's just a user property)
-- but document that date functions should use the user's timezone.
