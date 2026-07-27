-- Keep report-list queries fast as organizations accumulate both discrepancy
-- and ASR records, and cover reverse report relationships used by revisions
-- and ASR-to-discrepancy links.
create index if not exists organization_reports_org_type_created_idx
on public.organization_reports (organization_id, report_type, created_at desc);

create index if not exists organization_reports_supersedes_idx
on public.organization_reports (supersedes_report_id)
where supersedes_report_id is not null;

create index if not exists asr_reports_source_discrepancy_idx
on public.asr_reports (source_discrepancy_report_id)
where source_discrepancy_report_id is not null;

create index if not exists organization_report_links_related_idx
on public.organization_report_links (related_report_id, report_id);

-- Cache auth.uid() once per statement instead of reevaluating it for every row
-- inspected by report and ASR option policies.
drop policy if exists organization_reports_select_authorized
on public.organization_reports;
create policy organization_reports_select_authorized
on public.organization_reports for select to authenticated
using ((select private.can_read_organization_report(id, (select auth.uid()))));

drop policy if exists aircraft_discrepancy_reports_select_authorized
on public.aircraft_discrepancy_reports;
create policy aircraft_discrepancy_reports_select_authorized
on public.aircraft_discrepancy_reports for select to authenticated
using ((select private.can_read_organization_report(report_id, (select auth.uid()))));

drop policy if exists organization_report_events_select_authorized
on public.organization_report_events;
create policy organization_report_events_select_authorized
on public.organization_report_events for select to authenticated
using ((select private.can_read_organization_report(report_id, (select auth.uid()))));

drop policy if exists report_reviewer_assignments_select_member
on public.organization_report_reviewer_assignments;
create policy report_reviewer_assignments_select_member
on public.organization_report_reviewer_assignments for select to authenticated
using ((select private.is_organization_member(organization_id, (select auth.uid()))));

drop policy if exists organization_asr_options_select_member
on public.organization_asr_options;
create policy organization_asr_options_select_member
on public.organization_asr_options for select to authenticated
using ((select private.is_organization_member(organization_id, (select auth.uid()))));

drop policy if exists organization_asr_options_insert_manager
on public.organization_asr_options;
create policy organization_asr_options_insert_manager
on public.organization_asr_options for insert to authenticated
with check ((select private.can_manage_organization(organization_id, (select auth.uid()))));

drop policy if exists organization_asr_options_update_manager
on public.organization_asr_options;
create policy organization_asr_options_update_manager
on public.organization_asr_options for update to authenticated
using ((select private.can_manage_organization(organization_id, (select auth.uid()))))
with check ((select private.can_manage_organization(organization_id, (select auth.uid()))));

drop policy if exists organization_asr_options_delete_manager
on public.organization_asr_options;
create policy organization_asr_options_delete_manager
on public.organization_asr_options for delete to authenticated
using ((select private.can_manage_organization(organization_id, (select auth.uid()))));

drop policy if exists asr_reports_select_authorized
on public.asr_reports;
create policy asr_reports_select_authorized
on public.asr_reports for select to authenticated
using ((select private.can_read_organization_report(report_id, (select auth.uid()))));

drop policy if exists asr_external_notifications_select_authorized
on public.asr_external_notifications;
create policy asr_external_notifications_select_authorized
on public.asr_external_notifications for select to authenticated
using ((select private.can_read_organization_report(report_id, (select auth.uid()))));

drop policy if exists organization_report_links_select_authorized
on public.organization_report_links;
create policy organization_report_links_select_authorized
on public.organization_report_links for select to authenticated
using (
  (select private.can_read_organization_report(report_id, (select auth.uid())))
  or (select private.can_read_organization_report(related_report_id, (select auth.uid())))
);
