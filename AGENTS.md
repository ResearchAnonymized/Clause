# Clause — local agent notes

This app runs as a **self-hosted** TanStack Start frontend + Postgres + MinIO stack.

- Prefer `docker compose` for database/storage.
- Do not reintroduce Lovable Cloud packages (`@lovable.dev/*`) or `@supabase/supabase-js`.
- Auth is cookie-session based (`clause_session`); data access goes through `/api/db` on the browser and `src/db/*` on the server.
- Schema: `db/schema.sql` + `db/migrate-*.sql`. Demo hosting: `deploy/README.md`.
