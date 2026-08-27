alter table public.organization_member_invitations
  add column if not exists email_status text not null default 'not_sent',
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists email_last_attempt_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider_message_id text,
  add column if not exists email_last_error_code text;

alter table public.organization_member_invitations
  drop constraint if exists organization_member_invitations_email_status_check;
alter table public.organization_member_invitations
  add constraint organization_member_invitations_email_status_check
  check (email_status in ('not_sent', 'sent', 'failed'));

alter table public.organization_member_invitations
  drop constraint if exists organization_member_invitations_email_attempt_count_check;
alter table public.organization_member_invitations
  add constraint organization_member_invitations_email_attempt_count_check
  check (email_attempt_count >= 0);
