create index if not exists notification_reads_user_id_idx on public.notification_reads (user_id, read_at desc);;
