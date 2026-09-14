import type { DbEngine } from "@/lib/db/types";

/**
 * Presentation metadata for the connection form. Kept apart from the drivers so
 * the browser never imports a database client.
 */
export interface EngineOption {
  value: DbEngine;
  label: string;
  description: string;
  defaultPort: number;
  serverPlaceholder: string;
  /** System databases to list separately when picking a database. */
  systemDatabases: string[];
  supportsWindowsAuth: boolean;
  /** Whether the encrypt / trust-certificate options apply. */
  supportsTlsOptions: boolean;
}

export const ENGINE_OPTIONS: EngineOption[] = [
  {
    value: "sqlserver",
    label: "SQL Server / Azure SQL",
    description: "Microsoft SQL Server, Azure SQL Database, Azure SQL Managed Instance",
    defaultPort: 1433,
    serverPlaceholder: "server.example.com or host\\INSTANCE",
    systemDatabases: ["master", "model", "msdb", "tempdb"],
    supportsWindowsAuth: true,
    supportsTlsOptions: true,
  },
  {
    value: "postgres",
    label: "PostgreSQL",
    description: "PostgreSQL, Amazon RDS for PostgreSQL, Azure Database for PostgreSQL",
    defaultPort: 5432,
    serverPlaceholder: "localhost",
    systemDatabases: ["postgres", "template0", "template1"],
    supportsWindowsAuth: false,
    supportsTlsOptions: true,
  },
  {
    value: "mysql",
    label: "MySQL",
    description: "MySQL, MariaDB, Amazon RDS for MySQL, Azure Database for MySQL",
    defaultPort: 3306,
    serverPlaceholder: "localhost",
    systemDatabases: ["information_schema", "mysql", "performance_schema", "sys"],
    supportsWindowsAuth: false,
    supportsTlsOptions: true,
  },
];

export function engineDefaults(engine: DbEngine): EngineOption {
  return ENGINE_OPTIONS.find((o) => o.value === engine) ?? ENGINE_OPTIONS[0];
}
