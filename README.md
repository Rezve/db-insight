# DB Insight

A self-hosted SQL Server analysis tool built with Next.js. Connect to any SQL Server or Azure SQL database and explore its schema, run queries, analyze table distributions, inspect indexes, and visualize execution plans — all from a browser UI with credentials that never leave your machine.

> Built for developers and DBAs who want a lightweight, local-first alternative to heavyweight SQL Server Management Studio or Azure Data Studio features. No telemetry, no cloud dependency — your credentials stay on your machine.

**Supports:** SQL Server 2016+ and Azure SQL Database.

<!-- Add a screenshot here: docs/screenshot.png -->

---

## Contents

- [Features](#features)
- [Running with Docker (recommended)](#running-with-docker-recommended)
- [Running Locally (development)](#running-locally-development)
- [Configuration](#configuration)
- [Security Notes](#security-notes)
- [Health Check](#health-check)
- [Troubleshooting](#troubleshooting)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

---

## Features

- **Secure connection management** — credentials stored server-side in memory, never exposed to the browser; saved connections encrypted with AES-256-GCM
- **SQL Editor** — Monaco-based editor with SQL autocomplete, run selected text, execution plan visualization, and STATISTICS IO/TIME capture
- **Table Analysis** — per-table tabs for overview, data distribution charts, index details, and missing index recommendations
  - Three sample sizes available: Small (TOP 1000), Medium (TOP 10000), Full (warns if >500k rows)
- **Index Insights** — current index structure, seek/scan/lookup usage metrics from DMVs, and SQL Server's missing index suggestions
- **Column Distribution** — selectivity analysis and data distribution histograms using column statistics
- **First-run setup wizard** — guides you through configuration on first launch; no manual config files required
- **Dark mode** support

---

## Running with Docker (recommended)

> **Note:** The Docker image is not yet published. To use this method, build the image locally first:
> ```bash
> docker build -t db-insight .
> ```
> Then replace `yourdockerhubuser/db-insight` with `db-insight` in the commands below.

### Quick start

```bash
docker run -d \
  -p 3000:3000 \
  -v /your/host/path:/data \
  yourdockerhubuser/db-insight
```

The `-d` flag runs the container in the background — your terminal is free immediately. Open [http://localhost:3000](http://localhost:3000) and the setup wizard will appear on first visit.

To stop the container:

```bash
docker stop <container-id>
```

Get the container ID with `docker ps`.

### Using Docker Compose

Clone the repo and run:

```bash
docker-compose up -d
```

The default `docker-compose.yml` uses a named Docker volume (`db-insight-data`) mapped to `/data` inside the container. All persistent state lives there.

### Updating to a new version

```bash
docker-compose pull
docker-compose up -d
```

Your data, saved connections, and encryption key are preserved across every update — the volume is independent of the container image. Schema migrations run automatically on startup.

### Rolling back

Pin a specific version tag in `docker-compose.yml`:

```yaml
image: yourdockerhubuser/db-insight:0.1.0
```

---

## Running Locally (development)

### Prerequisites

- Node.js 20+
- Access to a SQL Server or Azure SQL instance

### Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The setup wizard will appear on first run and write its config to `./data/config.json`.

To skip the wizard, create a `.env.local` file before starting:

```env
SESSION_SECRET=your-32-char-or-longer-secret-here
```

### Production build (local)

```bash
npm run build
npm run start
```

This also uses `./data/` for storage — the same folder as `npm run dev`, so your saved connections carry over.

---

## Configuration

All options are passed as environment variables (Docker) or via `.env.local` (local dev):

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `/data` | Path inside the container where the database, encryption key, and config are stored. Mount a volume here. |
| `SESSION_SECRET` | _(wizard)_ | Session cookie signing secret. Min 32 characters. If set, the setup wizard is skipped. Generate one with `openssl rand -hex 32`. |
| `PORT` | `3000` | HTTP port the server listens on. |

**Skipping the setup wizard** (useful for automated deployments):

```yaml
environment:
  SESSION_SECRET: "your-secret-here-minimum-32-characters"
```

### Persistent data

Everything is stored in `DATA_DIR`:

| File | Contents |
|---|---|
| `config.json` | Session secret and setup metadata |
| `editor.db` | Saved connections, editor tabs, query history |
| `.key` | AES-256-GCM encryption key for stored passwords |

---

## Security Notes

- Credentials are stored in a server-side `Map` keyed by session ID — never serialized into the cookie or sent to the client
- Saved connection passwords are encrypted with AES-256-GCM before being written to SQLite; the key lives in `DATA_DIR/.key`
- The iron-session cookie is `httpOnly`, `sameSite: strict`, and `secure` in production
- This tool is designed for **personal or trusted-network use** — place it behind a reverse proxy with authentication if exposing it more broadly

---

## Health Check

`GET /api/health` returns the current status without authentication:

```json
{
  "status": "ok",
  "appVersion": "0.1.0",
  "setupComplete": true,
  "dataDir": "accessible",
  "timestamp": "2026-05-05T10:00:00.000Z"
}
```

Useful for Docker Compose health checks, uptime monitors, and reverse proxy probes.

---

## Troubleshooting

**Setup wizard appears on every restart**
Ensure the data volume is mounted correctly. The wizard re-runs when `config.json` is missing or unreadable. For Docker, confirm your volume mapping with `docker inspect <container>`.

**I forgot my SESSION_SECRET / want to reset setup**
Delete `data/config.json` (or `DATA_DIR/config.json` in Docker) and restart. The setup wizard will re-run and generate a new secret. Existing saved connections are preserved in `editor.db`.

**Can't connect to SQL Server**
- Confirm TCP/IP is enabled in SQL Server Configuration Manager
- Check that port 1433 (or your custom port) is open in the firewall
- For Azure SQL, verify the server firewall allows your IP address
- Try `sa` or a SQL auth account first to rule out Windows auth issues in a containerized environment

**Query runs slowly / times out**
Use the Small sample size for initial exploration on large tables. Full scans on tables >500k rows will warn before executing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Editor | Monaco Editor with SQL autocomplete |
| Charts | Recharts |
| Database | mssql v11 (SQL Server / Azure SQL) |
| Local storage | better-sqlite3 (saved connections, editor tabs, query history) |
| Session | iron-session (encrypted cookie, server-side pool store) |
| Encryption | AES-256-GCM (saved connection passwords) |

---

## Project Structure

<details>
<summary>Expand (for contributors)</summary>

```
src/
├── app/
│   ├── setup/                # First-run setup wizard
│   ├── connect/              # Connection page
│   ├── dashboard/            # Database overview (tables + views)
│   │   ├── editor/           # SQL editor
│   │   ├── history/          # Query history
│   │   ├── settings/         # App settings
│   │   └── tables/[name]/    # Per-table analysis
│   └── api/
│       ├── setup/            # First-run config endpoint
│       ├── health/           # Health check (GET /api/health)
│       ├── connect/          # Authenticate + create connection pool
│       ├── disconnect/       # Close session
│       ├── query/            # Execute SQL + return plan / statistics
│       ├── connections/      # Saved connection CRUD
│       ├── schema/           # Tables, columns, procedures, functions
│       └── analysis/         # Row count, table size, indexes, distribution
├── components/
│   ├── editor/               # SqlEditor, ResultsTable, QueryPlanVisualizer
│   ├── analysis/             # ColumnDistribution, IndexList, MissingIndexes
│   ├── connect/              # Connection form components
│   ├── dashboard/            # Header, Sidebar, TableCard
│   └── ui/                   # shadcn/ui primitives
└── lib/
    ├── config.ts             # DATA_DIR, session secret, setup state
    ├── session.ts            # iron-session config
    ├── session-store.ts      # In-memory credential + pool stores
    ├── editor-db.ts          # SQLite: saved connections, editor tabs
    ├── stats-db.ts           # SQLite: database snapshots
    ├── crypto.ts             # AES-256-GCM encrypt/decrypt
    ├── db.ts                 # executeQuery() helper
    └── sql-queries.ts        # SQL strings
```

</details>
