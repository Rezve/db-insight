# DB Analysis

A local-only SQL Server analysis tool built with Next.js. Connect to any SQL Server or Azure SQL database and explore its schema, run queries, analyze table distributions, inspect indexes, and visualize execution plans — all from a browser UI with credentials that never leave your machine.

## Features

- **Secure connection management** — credentials stored server-side in memory, never exposed to the browser
- **SQL Editor** — Monaco-based editor with SQL autocomplete, run selected text, execution plan visualization, and STATISTICS IO/TIME capture
- **Table Analysis** — per-table tabs for overview, data distribution charts, index details, and missing index recommendations
- **Index Insights** — current index structure, seek/scan/lookup usage metrics from DMVs, and SQL Server's missing index suggestions
- **Column Distribution** — selectivity analysis and data distribution histograms using column statistics
- **Dark mode** support

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (CSS-based config) + shadcn/ui |
| Editor | Monaco Editor with SQL autocomplete |
| Charts | Recharts |
| Database | mssql v11 (SQL Server / Azure SQL) |
| Session | iron-session (encrypted cookie, server-side pool store) |

## Getting Started

### Prerequisites

- Node.js 18+
- Access to a SQL Server or Azure SQL instance

### Setup

```bash
npm install
```

Create a `.env.local` file:

```env
SESSION_SECRET=your-32-char-or-longer-secret-here
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect to your database.

## Project Structure

```
src/
├── app/
│   ├── connect/              # Login page
│   ├── dashboard/            # Database overview (tables + views)
│   │   ├── editor/           # SQL editor page
│   │   └── tables/[name]/    # Per-table analysis (Overview / Distribution / Indexes / Missing Indexes)
│   └── api/
│       ├── connect/          # Authenticate + create connection pool
│       ├── disconnect/       # Close session
│       ├── query/            # Execute SQL + return plan / statistics
│       ├── schema/           # Tables, columns, procedures, functions
│       └── analysis/         # Row count, table size, indexes, distribution
├── components/
│   ├── editor/               # SqlEditor, ResultsTable, QueryPlanVisualizer, StatisticsPanel
│   ├── analysis/             # ColumnDistribution, IndexList, MissingIndexes, SelectivityPanel
│   ├── dashboard/            # Header, Sidebar, TableCard
│   └── ui/                   # shadcn/ui primitives
└── lib/
    ├── session.ts            # iron-session config
    ├── session-store.ts      # In-memory credential + pool stores
    ├── db.ts                 # executeQuery() helper
    └── sql-queries.ts        # All SQL strings + buildSampleClause()
```

## Security Notes

- Credentials are stored in a server-side `Map` keyed by session ID — they are never serialized into the cookie or sent to the client
- The iron-session cookie contains only a random `sessionId`
- One `mssql.ConnectionPool` is maintained per session and reused across requests
- This tool is designed for **local use only** — do not expose it to a public network

## Sample Size Strategy

When querying large tables for analysis, three sample sizes are available:

| Size | Method |
|---|---|
| Small | `SELECT TOP 1000 ... WITH (NOLOCK)` |
| Medium | `SELECT TOP 10000 ... WITH (NOLOCK)` |
| Full | No TOP limit — warns if row count exceeds 500k |

`TABLESAMPLE` is avoided — it is unreliable on small tables.
