drop policy if exists notifications_authenticated_inbox_read on public.notifications;
create policy notifications_authenticated_inbox_read
on public.notifications for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  or (
    recipient_user_id is null
    and organization_id is null
    and status = 'sent'
    and coalesce(is_active, true)
    and (scheduled_at is null or scheduled_at <= now())
  )
  or (
    (select private.is_platform_admin())
    and recipient_user_id is null
    and organization_id is null
  )
);
drop policy if exists notifications_platform_admin_update on public.notifications;
create policy notifications_platform_admin_update
on public.notifications for update to authenticated
using ((select private.is_platform_admin()) and recipient_user_id is null and organization_id is null)
with check ((select private.is_platform_admin()) and recipient_user_id is null and organization_id is null and kind = 'system');
drop policy if exists notifications_platform_admin_delete on public.notifications;
create policy notifications_platform_admin_delete
on public.notifications for delete to authenticated
using ((select private.is_platform_admin()) and recipient_user_id is null and organization_id is null);;
