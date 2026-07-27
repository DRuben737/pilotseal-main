# Supabase migration archive

This directory preserves SQL that existed before the reproducible local
Supabase baseline was created.

- `migrations-before-local-setup/` contains the migration files that were in the
  repository before migration history was fetched.
- `remote-migrations-fetched/` contains the schema-only migration statements
  fetched from the verified `Pilotseal Data` project, plus two local-only files
  whose timestamps did not exist in remote migration history.

Active migration timestamps still match the remote history. The earliest active
migration is a schema-only snapshot with no table rows, Auth users, Storage
objects, or other production data. Later historical migrations are intentionally
kept as marker files because their effects are already present in that baseline.

Do not run files in this archive automatically. They are retained only for
review, comparison, and recovery.
