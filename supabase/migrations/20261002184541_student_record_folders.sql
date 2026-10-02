begin;

create table public.student_record_folders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.saved_people(id) on delete set null,
  student_user_id uuid references auth.users(id) on delete set null,
  student_name text not null,
  student_cert_number text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_record_folders_name_required check (btrim(student_name) <> '')
);

create unique index student_record_folders_owner_student_idx
  on public.student_record_folders (owner_user_id, student_id)
  where student_id is not null;

create unique index student_record_folders_owner_student_user_idx
  on public.student_record_folders (owner_user_id, student_user_id)
  where student_user_id is not null;

create index student_record_folders_student_user_idx
  on public.student_record_folders (student_user_id, updated_at desc)
  where student_user_id is not null;

create table public.student_record_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.student_record_folders(id) on delete cascade,
  title text not null,
  record_date date not null,
  category text,
  notes text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_record_items_title_required check (btrim(title) <> ''),
  constraint student_record_items_title_length check (char_length(title) <= 120),
  constraint student_record_items_category_length check (category is null or char_length(category) <= 80),
  constraint student_record_items_notes_length check (notes is null or char_length(notes) <= 10000),
  constraint student_record_items_attachment_complete check (
    (storage_path is null and original_file_name is null and mime_type is null and file_size_bytes is null)
    or
    (storage_path is not null and original_file_name is not null and mime_type is not null and file_size_bytes is not null)
  ),
  constraint student_record_items_attachment_size check (
    file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 5242880)
  ),
  constraint student_record_items_attachment_type check (
    mime_type is null or mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  )
);

create index student_record_items_folder_date_idx
  on public.student_record_items (folder_id, record_date desc, created_at desc);

alter table public.student_record_folders enable row level security;
alter table public.student_record_items enable row level security;

create policy student_record_folders_select_authorized
on public.student_record_folders for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or student_user_id = (select auth.uid())
);

create policy student_record_items_select_authorized
on public.student_record_items for select to authenticated
using (
  exists (
    select 1
    from public.student_record_folders folder
    where folder.id = student_record_items.folder_id
      and (
        folder.owner_user_id = (select auth.uid())
        or folder.student_user_id = (select auth.uid())
      )
  )
);

revoke all on public.student_record_folders from public, anon, authenticated;
revoke all on public.student_record_items from public, anon, authenticated;
grant select on public.student_record_folders to authenticated;
grant select on public.student_record_items to authenticated;

create or replace function private.ensure_student_record_folder(
  p_owner_user_id uuid,
  p_student_id uuid,
  p_student_user_id uuid,
  p_student_name text,
  p_student_cert_number text
)
returns public.student_record_folders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder public.student_record_folders;
  v_name text := nullif(btrim(coalesce(p_student_name, '')), '');
  v_cert text := nullif(btrim(coalesce(p_student_cert_number, '')), '');
begin
  if p_owner_user_id is null or v_name is null then
    raise exception 'A record owner and student name are required.' using errcode = '22023';
  end if;

  select folder.* into v_folder
  from public.student_record_folders folder
  where folder.owner_user_id = p_owner_user_id
    and (
      (p_student_user_id is not null and folder.student_user_id = p_student_user_id)
      or (p_student_id is not null and folder.student_id = p_student_id)
    )
  order by (folder.student_user_id = p_student_user_id) desc nulls last
  limit 1
  for update;

  if found then
    update public.student_record_folders
    set student_id = coalesce(student_id, p_student_id),
        student_user_id = coalesce(student_user_id, p_student_user_id),
        student_name = v_name,
        student_cert_number = coalesce(v_cert, student_cert_number),
        updated_at = timezone('utc', now())
    where id = v_folder.id
    returning * into v_folder;
    return v_folder;
  end if;

  insert into public.student_record_folders (
    owner_user_id, student_id, student_user_id, student_name, student_cert_number
  ) values (
    p_owner_user_id, p_student_id, p_student_user_id, v_name, v_cert
  )
  returning * into v_folder;

  return v_folder;
exception
  when unique_violation then
    select folder.* into v_folder
    from public.student_record_folders folder
    where folder.owner_user_id = p_owner_user_id
      and (
        (p_student_user_id is not null and folder.student_user_id = p_student_user_id)
        or (p_student_id is not null and folder.student_id = p_student_id)
      )
    limit 1;
    return v_folder;
end;
$$;

revoke all on function private.ensure_student_record_folder(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function private.sync_endorsement_student_record_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.student_id is not null or new.student_user_id is not null then
    perform private.ensure_student_record_folder(
      new.user_id,
      new.student_id,
      new.student_user_id,
      new.student_name,
      new.student_cert_number
    );
  end if;
  return new;
end;
$$;

revoke all on function private.sync_endorsement_student_record_folder()
  from public, anon, authenticated;

create trigger sync_endorsement_student_record_folder
after insert or update of student_id, student_user_id, student_name, student_cert_number
on public.endorsement_records
for each row execute function private.sync_endorsement_student_record_folder();

do $$
declare
  v_record record;
begin
  for v_record in
    select distinct on (record.user_id, coalesce(record.student_user_id, record.student_id))
      record.user_id,
      record.student_id,
      record.student_user_id,
      record.student_name,
      record.student_cert_number
    from public.endorsement_records record
    where record.student_id is not null or record.student_user_id is not null
    order by record.user_id, coalesce(record.student_user_id, record.student_id), record.created_at desc
  loop
    perform private.ensure_student_record_folder(
      v_record.user_id,
      v_record.student_id,
      v_record.student_user_id,
      v_record.student_name,
      v_record.student_cert_number
    );
  end loop;
end
$$;

create or replace function private.backfill_student_record_folder_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.student_record_folders
  set student_user_id = new.linked_user_id,
      updated_at = timezone('utc', now())
  where owner_user_id = new.owner_user_id
    and student_id = new.saved_person_id
    and student_user_id is null;
  return new;
end;
$$;

revoke all on function private.backfill_student_record_folder_link()
  from public, anon, authenticated;

create trigger backfill_student_record_folder_link
after insert or update of linked_user_id on public.saved_person_account_links
for each row execute function private.backfill_student_record_folder_link();

create or replace function public.create_student_record_folder(p_student_id uuid)
returns public.student_record_folders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.saved_people;
  v_linked_user_id uuid;
  v_certificate_number text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select person.* into v_person
  from public.saved_people person
  where person.id = p_student_id
    and person.user_id = auth.uid()
    and person.role = 'student';
  if not found then
    raise exception 'The selected student was not found.' using errcode = 'P0002';
  end if;

  select link.linked_user_id into v_linked_user_id
  from public.saved_person_account_links link
  where link.owner_user_id = auth.uid()
    and link.saved_person_id = p_student_id;

  select certificate.certificate_number into v_certificate_number
  from public.saved_person_certificates certificate
  where certificate.user_id = auth.uid()
    and certificate.person_id = p_student_id
    and certificate.certificate_type = 'pilot'
  order by certificate.updated_at desc nulls last, certificate.created_at desc
  limit 1;

  return private.ensure_student_record_folder(
    auth.uid(), p_student_id, v_linked_user_id, v_person.display_name,
    coalesce(nullif(btrim(v_certificate_number), ''), nullif(btrim(v_person.cert_number), ''))
  );
end;
$$;

revoke all on function public.create_student_record_folder(uuid) from public, anon;
grant execute on function public.create_student_record_folder(uuid) to authenticated;

create or replace function private.validate_student_record_attachment(
  p_owner_user_id uuid,
  p_folder_id uuid,
  p_item_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_storage_path is null and p_original_file_name is null
    and p_mime_type is null and p_file_size_bytes is null then
    return;
  end if;
  if p_storage_path is null or nullif(btrim(coalesce(p_original_file_name, '')), '') is null
    or p_mime_type is null or p_file_size_bytes is null then
    raise exception 'Attachment metadata is incomplete.' using errcode = '22023';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Only PDF, JPG, and PNG files are allowed.' using errcode = '22023';
  end if;
  if p_file_size_bytes <= 0 or p_file_size_bytes > 5242880 then
    raise exception 'The attachment must be 5 MB or smaller.' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_owner_user_id::text
    or split_part(p_storage_path, '/', 2) <> p_folder_id::text
    or split_part(p_storage_path, '/', 3) <> p_item_id::text then
    raise exception 'The attachment path does not belong to this record.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.validate_student_record_attachment(uuid, uuid, uuid, text, text, text, bigint)
  from public, anon, authenticated;

create or replace function public.create_student_record_item(
  p_id uuid,
  p_folder_id uuid,
  p_title text,
  p_record_date date,
  p_category text default null,
  p_notes text default null,
  p_storage_path text default null,
  p_original_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null
)
returns public.student_record_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.student_record_items;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  perform 1
  from public.student_record_folders folder
  where folder.id = p_folder_id and folder.owner_user_id = auth.uid();
  if not found then
    raise exception 'Student record not found.' using errcode = 'P0002';
  end if;
  perform private.validate_student_record_attachment(
    auth.uid(), p_folder_id, p_id, p_storage_path, p_original_file_name,
    p_mime_type, p_file_size_bytes
  );
  insert into public.student_record_items (
    id, folder_id, title, record_date, category, notes, storage_path,
    original_file_name, mime_type, file_size_bytes
  ) values (
    p_id, p_folder_id, btrim(p_title), p_record_date,
    nullif(btrim(coalesce(p_category, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_storage_path, p_original_file_name, p_mime_type, p_file_size_bytes
  ) returning * into v_item;
  update public.student_record_folders
  set updated_at = timezone('utc', now()) where id = p_folder_id;
  return v_item;
end;
$$;

revoke all on function public.create_student_record_item(uuid, uuid, text, date, text, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.create_student_record_item(uuid, uuid, text, date, text, text, text, text, text, bigint)
  to authenticated;

create or replace function public.update_student_record_item(
  p_item_id uuid,
  p_title text,
  p_record_date date,
  p_category text default null,
  p_notes text default null,
  p_storage_path text default null,
  p_original_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null
)
returns public.student_record_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.student_record_items;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select item.* into v_item
  from public.student_record_items item
  join public.student_record_folders folder on folder.id = item.folder_id
  where item.id = p_item_id and folder.owner_user_id = auth.uid();
  if not found then
    raise exception 'Student record item not found.' using errcode = 'P0002';
  end if;
  perform private.validate_student_record_attachment(
    auth.uid(), v_item.folder_id, p_item_id, p_storage_path, p_original_file_name,
    p_mime_type, p_file_size_bytes
  );
  update public.student_record_items
  set title = btrim(p_title),
      record_date = p_record_date,
      category = nullif(btrim(coalesce(p_category, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      storage_path = p_storage_path,
      original_file_name = p_original_file_name,
      mime_type = p_mime_type,
      file_size_bytes = p_file_size_bytes,
      updated_at = timezone('utc', now())
  where id = p_item_id
  returning * into v_item;
  update public.student_record_folders
  set updated_at = timezone('utc', now()) where id = v_item.folder_id;
  return v_item;
end;
$$;

revoke all on function public.update_student_record_item(uuid, text, date, text, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.update_student_record_item(uuid, text, date, text, text, text, text, text, bigint)
  to authenticated;

create or replace function public.delete_student_record_item(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.student_record_items;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select item.* into v_item
  from public.student_record_items item
  join public.student_record_folders folder on folder.id = item.folder_id
  where item.id = p_item_id and folder.owner_user_id = auth.uid()
  for update of item;
  if not found then
    raise exception 'Student record item not found.' using errcode = 'P0002';
  end if;
  delete from public.student_record_items where id = p_item_id;
  update public.student_record_folders
  set updated_at = timezone('utc', now()) where id = v_item.folder_id;
  return v_item.storage_path;
end;
$$;

revoke all on function public.delete_student_record_item(uuid) from public, anon;
grant execute on function public.delete_student_record_item(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-record-files', 'student-record-files', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy student_record_files_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-record-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.student_record_folders folder
    where folder.id::text = (storage.foldername(name))[2]
      and folder.owner_user_id = (select auth.uid())
  )
);

create policy student_record_files_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'student-record-files'
  and exists (
    select 1
    from public.student_record_items item
    join public.student_record_folders folder on folder.id = item.folder_id
    where item.storage_path = name
      and (
        folder.owner_user_id = (select auth.uid())
        or folder.student_user_id = (select auth.uid())
      )
  )
);

create policy student_record_files_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-record-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    not exists (
      select 1 from public.student_record_items item where item.storage_path = name
    )
    or exists (
      select 1
      from public.student_record_items item
      join public.student_record_folders folder on folder.id = item.folder_id
      where item.storage_path = name and folder.owner_user_id = (select auth.uid())
    )
  )
);

commit;
