create index if not exists endorsement_identity_backfill_audit_linked_user_idx
  on private.endorsement_identity_backfill_audit (linked_user_id);
