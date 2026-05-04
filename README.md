# DB Insight

A self-hosted SQL Server analysis tool built with Next.js. Connect to any SQL Server or Azure SQL database and explore its schema, run queries, analyze table distributions, inspect indexes, and visualize execution plans — all from a browser UI with credentials that never leave your machine.

## Features

- **Secure connection management** — credentials stored server-side in memory, never exposed to the browser; saved connections encrypted with AES-256-GCM
- **SQL Editor** — Monaco-based editor with SQL autocomplete, run selected text, execution plan visualization, and STATISTICS IO/TIME capture
- **Table Analysis** — per-table tabs for overview, data distribution charts, index details, and missing index recommendations
- **Index Insights** — current index structure, seek/scan/lookup usage metrics from DMVs, and SQL Server's missing index suggestions
- **Column Distribution** — selectivity analysis and data distribution histograms using column statistics
- **First-run setup wizard** — guides you through configuration on first launch; no manual config files required
- **Dark mode** support

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

## Running with Docker (recommended)

### Quick start

```bash
docker run -d \
  -p 3000:3000 \
  -v /your/host/path:/data \
  yourdockerhubuser/db-insight
```

Open [http://localhost:3000](http://localhost:3000). On first visit the setup wizard will appear — it generates a session secret and shows you exactly what will be stored in the mounted volume.

### Using Docker Compose

```bash
curl -O https://raw.githubusercontent.com/yourrepo/db-insight/main/docker-compose.yml
docker-compose up -d
```

Or clone the repo and run:

```bash
docker-compose up -d
```

The default `docker-compose.yml` uses a named Docker volume (`db-insight-data`) mapped to `/data` inside the container. All persistent state lives there.

### Configuration

All options are passed as environment variables:

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

**Updating to a new version:**

```bash
docker-compose pull
docker-compose up -d
```

The volume is independent of the container image — your data, saved connections, and encryption key are preserved across every update. Schema migrations run automatically on startup.

**Rolling back:**

Pin a specific version tag in `docker-compose.yml` to roll back safely:

```yaml
image: yourdockerhubuser/db-insight:0.1.0
```

---

## Running locally (development)

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

## Project Structure

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

---

## Health check

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

## Security notes

- Credentials are stored in a server-side `Map` keyed by session ID — never serialized into the cookie or sent to the client
- Saved connection passwords are encrypted with AES-256-GCM before being written to SQLite; the key lives in `DATA_DIR/.key`
- The iron-session cookie is `httpOnly`, `sameSite: strict`, and `secure` in production
- This tool is designed for **personal or trusted-network use** — place it behind a reverse proxy with authentication if exposing it more broadly

---

## Sample size strategy

When querying large tables for analysis, three sample sizes are available:

| Size | Method |
|---|---|
| Small | `SELECT TOP 1000 ... WITH (NOLOCK)` |
| Medium | `SELECT TOP 10000 ... WITH (NOLOCK)` |
| Full | No TOP limit — warns if row count exceeds 500k |

`TABLESAMPLE` is avoided — it is unreliable on small tables.
