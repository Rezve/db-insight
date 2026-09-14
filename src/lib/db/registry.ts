import type { DbDriver, DbEngine } from "./types";
import { sqlServerDriver } from "./drivers/sqlserver";
import { postgresDriver } from "./drivers/postgres";
import { mysqlDriver } from "./drivers/mysql";

/**
 * Driver modules are imported eagerly, but each one loads its own client
 * package lazily inside `createPool`, so connecting to one engine never pulls
 * another engine's driver into the process.
 */
const DRIVERS: Record<DbEngine, DbDriver> = {
  sqlserver: sqlServerDriver,
  postgres: postgresDriver,
  mysql: mysqlDriver,
};

export function getDriver(engine: DbEngine): DbDriver {
  const driver = DRIVERS[engine];
  if (!driver) throw new Error(`Unsupported database engine: ${engine}`);
  return driver;
}

export function listDrivers(): DbDriver[] {
  return Object.values(DRIVERS);
}
