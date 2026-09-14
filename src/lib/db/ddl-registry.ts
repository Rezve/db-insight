import type { DbEngine, DdlBuilders } from "./types";
import { sqlServerDdl } from "./drivers/sqlserver/ddl";
import { postgresDdl } from "./drivers/postgres/ddl";
import { mysqlDdl } from "./drivers/mysql/ddl";
import { quoteId as quoteSqlServer, previewQuery as previewSqlServer } from "./drivers/sqlserver/queries";
import { quoteId as quotePostgres, previewQuery as previewPostgres } from "./drivers/postgres/queries";
import { quoteId as quoteMySql, previewQuery as previewMySql } from "./drivers/mysql/queries";

/**
 * DDL generation and identifier quoting, separated from `registry.ts` so the
 * browser can use them.
 *
 * A full `DbDriver` reaches for `pg` / `mysql2` / `mssql` at connect time, which
 * must never be bundled for the client. These modules are pure string builders
 * with no such imports, so the DDL preview and schema viewer can call them
 * directly.
 */
const DDL_BY_ENGINE: Record<DbEngine, DdlBuilders> = {
  sqlserver: sqlServerDdl,
  postgres: postgresDdl,
  mysql: mysqlDdl,
};

const QUOTE_BY_ENGINE: Record<DbEngine, (name: string) => string> = {
  sqlserver: quoteSqlServer,
  postgres: quotePostgres,
  mysql: quoteMySql,
};

export type PreviewQuery = (schema: string, table: string, limit: number) => string;

const PREVIEW_BY_ENGINE: Record<DbEngine, PreviewQuery> = {
  sqlserver: previewSqlServer,
  postgres: previewPostgres,
  mysql: previewMySql,
};

export function getPreviewQuery(engine: DbEngine): PreviewQuery {
  return PREVIEW_BY_ENGINE[engine] ?? previewSqlServer;
}

export function getDdl(engine: DbEngine): DdlBuilders {
  return DDL_BY_ENGINE[engine] ?? sqlServerDdl;
}

export function getQuoteId(engine: DbEngine): (name: string) => string {
  return QUOTE_BY_ENGINE[engine] ?? quoteSqlServer;
}
