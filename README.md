# calls-api

Self-hosted lead and calls API platform. A single repository containing a
Vite/React frontend, a Node/Express (TypeScript) backend, and a self-hosted
PostgreSQL database — all designed to run together in Docker on your own VPS.

The stack is fully self-contained: no third-party backend, no managed database.
Moving to a new server is just `git pull` + a Docker Compose rebuild.

## Architecture

- **Frontend** — Vite + React + TypeScript (repo root), Tailwind CSS, shadcn-ui.
- **Backend** — Node.js + Express + TypeScript (`backend/`), JWT auth, `pg`
  (node-postgres) for database access.
- **Database** — self-hosted PostgreSQL in a Docker container with a named
  volume for persistent data. Schema, migrations, and seed live in `db/`.

## Local development

### Frontend

```sh
npm install
npm run dev
```

The dev server runs on http://localhost:8080.

### Backend

```sh
cd backend
npm install
npm run dev
```

### Database

The database runs as a Docker container. Bring it up (along with the rest of the
stack) with Docker Compose:

```sh
docker compose up -d
```

Copy `.env.example` to `.env` and adjust values before starting. The backend
reads its own `backend/.env.example` for database and JWT configuration.

## Documentation

- [`SPEC.md`](./SPEC.md) — migration spec, architecture decisions, and the
  database/authorization model.
- [`API_CONTRACT.md`](./API_CONTRACT.md) — the REST API contract (endpoints,
  request/response shapes).
- [`DEPLOY.md`](./DEPLOY.md) — production deployment guide.

## Deploy flow

1. Develop locally.
2. Push to GitHub.
3. On the VPS, `git pull` the latest changes.
4. Run `./deploy.sh` to rebuild and restart the Docker stack.

Repository: https://github.com/SyedHassanRaza67/Calls-API
