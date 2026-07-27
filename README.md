# PilotSeal

## Local development

PilotSeal development and testing use the Docker-backed local Supabase stack.
Production or user data must never be copied into this environment.

With Docker Desktop running:

```bash
npm install
npm run db:local:start
npm run env:local:sync
npm run db:local:reset
npm run seed:local
npm run dev
```

The app is at [http://localhost:3000](http://localhost:3000), Supabase
Studio is at [http://127.0.0.1:54323](http://127.0.0.1:54323), and captured
development email is at [http://127.0.0.1:54324](http://127.0.0.1:54324).

Run the complete local test sequence with:

```bash
npm run test:local
```

This rebuilds the local database from versioned migrations, loads deterministic
synthetic fixtures, runs pgTAP and application smoke tests, then runs lint and
the production build. Target guards stop development, seed, and test commands
before connection when a remote Supabase or Postgres host is configured.

The start script creates a dedicated `pilotseal-local` Docker network whose
published ports bind to `127.0.0.1`. Every database lifecycle and test command
uses that same network explicitly. Stop the stack when it is not in use:

```bash
npm run db:local:stop
```

## Deployment policy

Do not deploy unless the user explicitly requests it. Production deployment,
release, or production-branch merge additionally requires an impact statement,
backup/rollback plan, and explicit confirmation. Use
`npm run check:production-deploy` as the final deployment authorization guard.
