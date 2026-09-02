create or replace function public.move_cfi_schedule_day(
  p_event_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_lesson_kind text,
  p_note text,
  p_timezone text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.cfi_schedule_events%rowtype;
  event_row public.cfi_schedule_events%rowtype;
  target_day date;
  move_by interval;
  moved_count integer := 0;
begin
  if p_lesson_kind not in ('flight', 'ground') then
    raise exception 'Invalid lesson kind.' using errcode = '22023';
  end if;

  select *
  into target_event
  from public.cfi_schedule_events
  where id = p_event_id
    and status = 'scheduled'
  for update;

  if not found or target_event.cfi_user_id <> auth.uid() then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  target_day := (target_event.start_at at time zone p_timezone)::date;
  if (p_start_at at time zone p_timezone)::date <> target_day then
    raise exception 'A cascading move must stay on the same local day.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.cfi_schedule_events earlier
    where earlier.cfi_user_id = target_event.cfi_user_id
      and earlier.status = 'scheduled'
      and (earlier.start_at at time zone p_timezone)::date = target_day
      and earlier.start_at < target_event.start_at
  ) then
    raise exception 'Only the first lesson of the day can push later lessons.' using errcode = '22023';
  end if;

  move_by := p_start_at - target_event.start_at;
  if move_by = interval '0 seconds' then
    update public.cfi_schedule_events
    set start_at = p_start_at,
        end_at = p_end_at,
        lesson_kind = p_lesson_kind,
        note = p_note
    where id = p_event_id;
    return 1;
  end if;

  for event_row in
    select event.*
    from public.cfi_schedule_events event
    where event.cfi_user_id = target_event.cfi_user_id
      and event.status = 'scheduled'
      and (event.start_at at time zone p_timezone)::date = target_day
      and event.start_at >= target_event.start_at
    order by
      case when move_by > interval '0 seconds' then event.start_at end desc,
      case when move_by < interval '0 seconds' then event.start_at end asc
    for update
  loop
    if event_row.id = p_event_id then
      update public.cfi_schedule_events
      set start_at = p_start_at,
          end_at = p_end_at,
          lesson_kind = p_lesson_kind,
          note = p_note
      where id = event_row.id;
    else
      update public.cfi_schedule_events
      set start_at = event_row.start_at + move_by,
          end_at = event_row.end_at + move_by
      where id = event_row.id;
    end if;
    moved_count := moved_count + 1;
  end loop;

  return moved_count;
end;
$$;

revoke all on function public.move_cfi_schedule_day(uuid, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.move_cfi_schedule_day(uuid, timestamptz, timestamptz, text, text, text) to authenticated, service_role;
