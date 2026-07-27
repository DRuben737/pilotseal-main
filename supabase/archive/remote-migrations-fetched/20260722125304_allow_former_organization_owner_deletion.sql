alter table public.organizations alter column created_by drop not null;
alter table public.organizations drop constraint if exists organizations_created_by_fkey;
alter table public.organizations
  add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;;
