-- Ensure related records are removed automatically when auth.users is deleted.
-- Run this in Supabase SQL editor if these constraints are not already configured.

alter table if exists public.profiles
  drop constraint if exists profiles_id_fkey;

alter table if exists public.profiles
  add constraint profiles_id_fkey
  foreign key (id)
  references auth.users(id)
  on delete cascade;

alter table if exists public.saved_people
  drop constraint if exists saved_people_user_id_fkey;

alter table if exists public.saved_people
  add constraint saved_people_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
