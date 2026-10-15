-- Realtime subscriptions only receive changes for tables enrolled in this publication.
-- Existing table RLS continues to authorize every recipient.
do $$
declare target text;
begin
  foreach target in array array['notifications','notification_reads','notification_preferences'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
      execute format('alter publication supabase_realtime add table public.%I',target);
    end if;
  end loop;
end;
$$;
