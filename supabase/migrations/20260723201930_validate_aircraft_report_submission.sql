-- Keep report intake validation consistent across the browser, RPC calls, and
-- any future trusted database integrations.
create or replace function private.validate_aircraft_discrepancy_report_input()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_description_length integer := char_length(btrim(new.description));
begin
  if v_description_length < 3 or v_description_length > 5000 then
    raise exception 'Describe what happened using between 3 and 5000 characters.'
      using errcode = '22023';
  end if;

  if new.report_date > current_date then
    raise exception 'The report date cannot be in the future.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_aircraft_discrepancy_report_input
on public.aircraft_discrepancy_reports;
create trigger validate_aircraft_discrepancy_report_input
before insert or update of report_date, description
on public.aircraft_discrepancy_reports
for each row
execute function private.validate_aircraft_discrepancy_report_input();

revoke all on function private.validate_aircraft_discrepancy_report_input()
from public, anon, authenticated;
