import type { SampleSize } from "@/types/analysis";
import type { IntrospectionQueries, PreparedQuery, QueryParams } from "../../types";

/** Safely quote a PostgreSQL identifier. */
export function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function id(value: string) {
  return { value, type: "string" as const };
}

function table(schema: string, tableName: string): QueryParams {
  return { schema: id(schema), tableName: id(tableName) };
}

function q(sql: string, params?: QueryParams): PreparedQuery {
  return params ? { sql, params } : { sql };
}

/** Row-limited preview of a table, for the data grid and new editor tabs. */
export function previewQuery(schema: string, tableName: string, limit: number): string {
  const target = schema ? `${quoteId(schema)}.${quoteId(tableName)}` : quoteId(tableName);
  return `SELECT * FROM ${target} LIMIT ${limit}`;
}

/** Schemas that belong to the server rather than the user's data model. */
const USER_SCHEMAS = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`;
const USER_SCHEMAS_IS = `table_schema NOT IN ('pg_catalog', 'information_schema')`;

const SQL_LIST_TABLES = `
SELECT
    table_schema AS "schema",
    table_name   AS "name",
    table_type   AS "type"
FROM information_schema.tables
WHERE table_type IN ('BASE TABLE', 'VIEW')
  AND ${USER_SCHEMAS_IS}
ORDER BY table_schema, table_name
`;

const SQL_SCHEMA_COLUMNS = `
SELECT
    c.table_schema             AS "tableSchema",
    c.table_name               AS "tableName",
    c.column_name              AS "columnName",
    c.data_type                AS "dataType",
    c.is_nullable              AS "isNullable",
    c.character_maximum_length AS "maxLength"
FROM information_schema.columns c
INNER JOIN information_schema.tables t
    ON c.table_schema = t.table_schema
    AND c.table_name  = t.table_name
WHERE c.${USER_SCHEMAS_IS}
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;

/**
 * Postgres exposes both procedures and functions through `pg_proc`.
 * `prokind` distinguishes them ('p' procedure, 'f' function, 'a' aggregate,
 * 'w' window); information_schema.routines omits procedures on older versions.
 */
const SQL_SCHEMA_ROUTINES = `
SELECT
    n.nspname AS "schema",
    p.proname AS "name",
    CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS "type"
FROM pg_proc p
INNER JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE ${USER_SCHEMAS}
  AND p.prokind IN ('p', 'f')
ORDER BY n.nspname, p.proname
`;

const SQL_LIST_STORED_PROCEDURES = `
SELECT
    n.nspname AS "schema",
    p.proname AS "name"
FROM pg_proc p
INNER JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE ${USER_SCHEMAS}
  AND p.prokind IN ('p', 'f')
ORDER BY n.nspname, p.proname
`;

const SQL_GET_SP_DEFINITION = `
SELECT pg_get_functiondef(p.oid) AS "definition"
FROM pg_proc p
INNER JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = @schema AND p.proname = @name
LIMIT 1
`;

const SQL_SCHEMA_FOREIGN_KEYS = `
SELECT
    src_ns.nspname  AS "sourceSchema",
    src_t.relname   AS "sourceTable",
    src_a.attname   AS "sourceColumn",
    tgt_ns.nspname  AS "targetSchema",
    tgt_t.relname   AS "targetTable",
    tgt_a.attname   AS "targetColumn"
FROM pg_constraint con
INNER JOIN pg_class     src_t  ON con.conrelid = src_t.oid
INNER JOIN pg_namespace src_ns ON src_t.relnamespace = src_ns.oid
INNER JOIN pg_class     tgt_t  ON con.confrelid = tgt_t.oid
INNER JOIN pg_namespace tgt_ns ON tgt_t.relnamespace = tgt_ns.oid
CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(src_attnum, tgt_attnum, ord)
INNER JOIN pg_attribute src_a ON src_a.attrelid = con.conrelid  AND src_a.attnum = k.src_attnum
INNER JOIN pg_attribute tgt_a ON tgt_a.attrelid = con.confrelid AND tgt_a.attnum = k.tgt_attnum
WHERE con.contype = 'f'
  AND ${USER_SCHEMAS.replace(/n\.nspname/g, "src_ns.nspname")}
`;

const SQL_SCHEMA_PARAMETERS = `
SELECT
    n.nspname                            AS "schema",
    p.proname                            AS "routineName",
    COALESCE(par.name, '')               AS "paramName",
    format_type(par.type, NULL)          AS "dataType",
    NULL::int                            AS "maxLength",
    (par.mode IN ('o', 'b', 't'))        AS "isOutput",
    (par.ord > (pronargs - COALESCE(pronargdefaults, 0))) AS "hasDefault",
    par.ord                              AS "parameterId"
FROM pg_proc p
INNER JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN LATERAL unnest(
    COALESCE(p.proallargtypes, p.proargtypes::oid[]),
    COALESCE(p.proargnames, ARRAY[]::text[]),
    COALESCE(p.proargmodes, ARRAY[]::"char"[])
) WITH ORDINALITY AS par(type, name, mode, ord)
WHERE ${USER_SCHEMAS}
  AND p.prokind IN ('p', 'f')
  AND COALESCE(par.name, '') <> ''
ORDER BY n.nspname, p.proname, par.ord
`;

/** `reltuples` is the planner's estimate, refreshed by ANALYZE/autovacuum. */
const SQL_ROW_COUNT_FAST = `
SELECT COALESCE(MAX(c.reltuples)::bigint, 0) AS "rowCount"
FROM pg_class c
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = @schema AND c.relname = @tableName
`;

/**
 * One row per index column. `indexId` is the index's OID, `keyOrdinal` its
 * 1-based position. Columns beyond `indnkeyatts` are INCLUDE columns (PG 11+).
 */
const SQL_INDEX_INFO = `
SELECT
    ic.relname          AS "indexName",
    i.indexrelid::bigint AS "indexId",
    CASE WHEN am.amname = 'btree' THEN 'NONCLUSTERED' ELSE upper(am.amname) END AS "type",
    i.indisunique       AS "isUnique",
    i.indisprimary      AS "isPrimaryKey",
    (NOT i.indisvalid)  AS "isDisabled",
    pg_get_expr(i.indpred, i.indrelid) AS "filterDefinition",
    a.attname           AS "columnName",
    (k.ord > i.indnkeyatts) AS "isIncluded",
    k.ord               AS "keyOrdinal"
FROM pg_index i
INNER JOIN pg_class     ic ON i.indexrelid = ic.oid
INNER JOIN pg_class     tc ON i.indrelid   = tc.oid
INNER JOIN pg_namespace n  ON tc.relnamespace = n.oid
INNER JOIN pg_am        am ON ic.relam = am.oid
CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
WHERE n.nspname = @schema AND tc.relname = @tableName
ORDER BY i.indexrelid, "isIncluded", k.ord
`;

const SQL_INDEX_SIZES = `
SELECT
    i.indexrelid::bigint AS "indexId",
    ROUND((pg_relation_size(i.indexrelid) / 1073741824.0)::numeric, 4) AS "sizeGB"
FROM pg_index i
INNER JOIN pg_class     tc ON i.indrelid = tc.oid
INNER JOIN pg_namespace n  ON tc.relnamespace = n.oid
WHERE n.nspname = @schema AND tc.relname = @tableName
`;

const SQL_TABLE_SIZES = `
SELECT
    n.nspname AS "schema",
    c.relname AS "name",
    ROUND((pg_total_relation_size(c.oid) / 1073741824.0)::numeric, 4) AS "sizeGB"
FROM pg_class c
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind IN ('r', 'p') AND ${USER_SCHEMAS}
`;

const SQL_TABLE_SIZE = `
SELECT ROUND((pg_total_relation_size(c.oid) / 1073741824.0)::numeric, 4) AS "sizeGB"
FROM pg_class c
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = @schema AND c.relname = @tableName
`;

const SQL_SERVER_START_TIME = `
SELECT pg_postmaster_start_time() AS "serverStartTime"
`;

/**
 * `pg_stat_user_indexes` counts index scans and rows read. Postgres has no
 * seek/lookup distinction, so scans map to `userScans` and the rest report 0;
 * it also keeps no per-index last-used timestamps.
 */
const SQL_INDEX_USAGE = `
SELECT
    s.indexrelname       AS "indexName",
    s.indexrelid::bigint AS "indexId",
    0::bigint            AS "userSeeks",
    COALESCE(s.idx_scan, 0)      AS "userScans",
    COALESCE(s.idx_tup_fetch, 0) AS "userLookups",
    0::bigint            AS "userUpdates",
    NULL::timestamp      AS "lastUserSeek",
    NULL::timestamp      AS "lastUserScan",
    NULL::timestamp      AS "lastUserLookup",
    ROUND((pg_relation_size(s.indexrelid) / 1073741824.0)::numeric, 4) AS "sizeGB"
FROM pg_stat_user_indexes s
WHERE s.schemaname = @schema AND s.relname = @tableName
ORDER BY s.indexrelid
`;

const SQL_TABLE_COLUMNS = `
SELECT
    c.ordinal_position            AS "ordinal",
    c.column_name                 AS "columnName",
    c.data_type                   AS "dataType",
    c.character_maximum_length    AS "maxLength",
    c.numeric_precision           AS "numericPrecision",
    c.numeric_scale               AS "numericScale",
    c.is_nullable                 AS "isNullable",
    c.column_default              AS "columnDefault",
    (c.is_identity = 'YES' OR c.column_default LIKE 'nextval(%') AS "isIdentity",
    (pk.column_name IS NOT NULL)  AS "isPrimaryKey",
    fk.target_schema              AS "fkSchema",
    fk.target_table               AS "fkTable",
    fk.target_column              AS "fkColumn"
FROM information_schema.columns c
LEFT JOIN (
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema    = @schema
      AND tc.table_name      = @tableName
) pk ON c.column_name = pk.column_name
LEFT JOIN (
    SELECT
        kcu.column_name,
        ccu.table_schema AS target_schema,
        ccu.table_name   AS target_table,
        ccu.column_name  AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = @schema
      AND tc.table_name      = @tableName
) fk ON c.column_name = fk.column_name
WHERE c.table_schema = @schema
  AND c.table_name   = @tableName
ORDER BY c.ordinal_position
`;

/**
 * Postgres generated columns are always stored, so `isPersisted` mirrors
 * `isComputed`. There is no sparse-column concept and no named default
 * constraints — defaults belong to the column itself.
 */
const SQL_EXTENDED_COLUMN_DETAILS = `
SELECT
    a.attname                                   AS "columnName",
    (a.attgenerated <> '')                      AS "isComputed",
    pg_get_expr(ad.adbin, ad.adrelid)           AS "computedDefinition",
    CASE WHEN a.attgenerated <> '' THEN true ELSE NULL END AS "isPersisted",
    false                                       AS "isSparse",
    seq.seqstart                                AS "identitySeed",
    seq.seqincrement                            AS "identityIncrement",
    coll.collname                               AS "collationName",
    col_description(a.attrelid, a.attnum)       AS "columnComment",
    NULL::text                                  AS "defaultConstraintName",
    CASE WHEN a.attgenerated = '' THEN pg_get_expr(ad.adbin, ad.adrelid) END AS "defaultDefinition"
FROM pg_attribute a
INNER JOIN pg_class     c ON a.attrelid = c.oid
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_attrdef   ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
LEFT JOIN pg_collation coll ON a.attcollation = coll.oid AND coll.collname <> 'default'
LEFT JOIN pg_depend    dep ON dep.refobjid = a.attrelid AND dep.refobjsubid = a.attnum
                          AND dep.deptype = 'i' AND dep.classid = 'pg_class'::regclass
LEFT JOIN pg_sequence  seq ON seq.seqrelid = dep.objid
WHERE n.nspname = @schema AND c.relname = @tableName
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum
`;

const SQL_FK_DETAILS = `
SELECT
    con.conname     AS "constraintName",
    src_a.attname   AS "sourceColumn",
    tgt_ns.nspname  AS "targetSchema",
    tgt_t.relname   AS "targetTable",
    tgt_a.attname   AS "targetColumn",
    CASE con.confdeltype
        WHEN 'a' THEN 'NO_ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET_NULL'  WHEN 'd' THEN 'SET_DEFAULT' END AS "onDelete",
    CASE con.confupdtype
        WHEN 'a' THEN 'NO_ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET_NULL'  WHEN 'd' THEN 'SET_DEFAULT' END AS "onUpdate"
FROM pg_constraint con
INNER JOIN pg_class     src_t  ON con.conrelid = src_t.oid
INNER JOIN pg_namespace src_ns ON src_t.relnamespace = src_ns.oid
INNER JOIN pg_class     tgt_t  ON con.confrelid = tgt_t.oid
INNER JOIN pg_namespace tgt_ns ON tgt_t.relnamespace = tgt_ns.oid
CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(src_attnum, tgt_attnum, ord)
INNER JOIN pg_attribute src_a ON src_a.attrelid = con.conrelid  AND src_a.attnum = k.src_attnum
INNER JOIN pg_attribute tgt_a ON tgt_a.attrelid = con.confrelid AND tgt_a.attnum = k.tgt_attnum
WHERE con.contype = 'f'
  AND src_ns.nspname = @schema AND src_t.relname = @tableName
ORDER BY con.conname, k.ord
`;

const SQL_SUMMARY_OBJECT_COUNTS = `
SELECT
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND ${USER_SCHEMAS_IS})                     AS "tableCount",
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_type = 'VIEW' AND ${USER_SCHEMAS_IS})                           AS "viewCount",
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.prokind = 'p' AND ${USER_SCHEMAS})                                  AS "procedureCount",
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.prokind = 'f' AND ${USER_SCHEMAS})                                  AS "functionCount",
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE ${USER_SCHEMAS_IS})                                                   AS "totalColumnCount",
    (SELECT COUNT(*) FROM information_schema.table_constraints
      WHERE constraint_type = 'PRIMARY KEY' AND ${USER_SCHEMAS_IS})               AS "tablesWithPK",
    (SELECT COUNT(*) FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY' AND ${USER_SCHEMAS_IS})               AS "foreignKeyCount"
`;

const SQL_SUMMARY_STORAGE = `
SELECT
    ROUND((SUM(pg_total_relation_size(c.oid)) / 1073741824.0)::numeric, 4) AS "totalSizeGB",
    ROUND((SUM(pg_table_size(c.oid))          / 1073741824.0)::numeric, 4) AS "dataSizeGB",
    ROUND((SUM(pg_indexes_size(c.oid))        / 1073741824.0)::numeric, 4) AS "indexSizeGB",
    (SELECT n2.nspname || '.' || c2.relname
     FROM pg_class c2
     INNER JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
     WHERE c2.relkind IN ('r', 'p')
       AND ${USER_SCHEMAS.replace(/n\.nspname/g, "n2.nspname")}
     ORDER BY pg_total_relation_size(c2.oid) DESC
     LIMIT 1)                                                              AS "largestTableName"
FROM pg_class c
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind IN ('r', 'p') AND ${USER_SCHEMAS}
`;

const SQL_SUMMARY_ROW_COUNT = `
SELECT COALESCE(SUM(c.reltuples), 0)::bigint AS "totalRows"
FROM pg_class c
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind IN ('r', 'p') AND ${USER_SCHEMAS}
`;

/** Postgres cannot disable an index and offers no missing-index advisor. */
const SQL_SUMMARY_INDEX_HEALTH = `
SELECT
    COUNT(*)                                             AS "totalIndexes",
    COUNT(*) FILTER (WHERE NOT i.indisvalid)             AS "disabledIndexes",
    0                                                    AS "tablesWithMissingIndexes",
    0                                                    AS "missingIndexCount"
FROM pg_index i
INNER JOIN pg_class     c ON i.indrelid = c.oid
INNER JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE ${USER_SCHEMAS}
`;

const SQL_SUMMARY_INDEX_USAGE = `
SELECT
    0::bigint                                     AS "totalSeeks",
    COALESCE(SUM(s.idx_scan), 0)::bigint          AS "totalScans",
    COALESCE(SUM(s.idx_tup_fetch), 0)::bigint     AS "totalLookups",
    0::bigint                                     AS "totalUpdates",
    COUNT(*) FILTER (WHERE COALESCE(s.idx_scan, 0) = 0 AND NOT i.indisprimary AND NOT i.indisunique) AS "unusedIndexCount"
FROM pg_stat_user_indexes s
INNER JOIN pg_index i ON s.indexrelid = i.indexrelid
`;

const SQL_SUMMARY_SERVER_INFO = `
SELECT
    COALESCE(inet_server_addr()::text, 'localhost') || ':' || COALESCE(inet_server_port()::text, '5432') AS "serverName",
    current_database()                                          AS "databaseName",
    current_setting('server_version')                           AS "sqlVersion",
    'PostgreSQL'                                                AS "edition",
    pg_postmaster_start_time()                                  AS "serverStartTime",
    (EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) / 60)::int AS "uptimeMinutes"
`;

const NUMERIC_TYPES = new Set([
  "smallint", "integer", "bigint", "decimal", "numeric", "real",
  "double precision", "money", "smallserial", "serial", "bigserial",
]);

const DATE_TYPES = new Set([
  "date", "timestamp", "timestamp without time zone", "timestamp with time zone",
  "time", "time without time zone", "time with time zone", "interval",
]);

export const postgresIntrospection: IntrospectionQueries = {
  listTables: () => q(SQL_LIST_TABLES),
  listStoredProcedures: () => q(SQL_LIST_STORED_PROCEDURES),
  schemaColumns: () => q(SQL_SCHEMA_COLUMNS),
  schemaRoutines: () => q(SQL_SCHEMA_ROUTINES),
  schemaForeignKeys: () => q(SQL_SCHEMA_FOREIGN_KEYS),
  schemaParameters: () => q(SQL_SCHEMA_PARAMETERS),

  spDefinition: (schema, name) => q(SQL_GET_SP_DEFINITION, { schema: id(schema), name: id(name) }),

  rowCountFast: (schema, tableName) => q(SQL_ROW_COUNT_FAST, table(schema, tableName)),
  rowCountExact: (schema, tableName) =>
    q(`SELECT COUNT(*) AS "rowCount" FROM ${quoteId(schema)}.${quoteId(tableName)}`),

  indexInfo: (schema, tableName) => q(SQL_INDEX_INFO, table(schema, tableName)),
  indexSizes: (schema, tableName) => q(SQL_INDEX_SIZES, table(schema, tableName)),
  indexUsage: (schema, tableName) => q(SQL_INDEX_USAGE, table(schema, tableName)),

  // No missing-index advisor in Postgres; capability flag keeps this unused.
  missingIndexes: () => q(`SELECT NULL WHERE false`),

  tableSizes: () => q(SQL_TABLE_SIZES),
  tableSize: (schema, tableName) => q(SQL_TABLE_SIZE, table(schema, tableName)),

  tableColumns: (schema, tableName) => q(SQL_TABLE_COLUMNS, table(schema, tableName)),
  extendedColumnDetails: (schema, tableName) =>
    q(SQL_EXTENDED_COLUMN_DETAILS, table(schema, tableName)),
  fkDetails: (schema, tableName) => q(SQL_FK_DETAILS, table(schema, tableName)),

  serverStartTime: () => q(SQL_SERVER_START_TIME),
  summaryObjectCounts: () => q(SQL_SUMMARY_OBJECT_COUNTS),
  summaryStorage: () => q(SQL_SUMMARY_STORAGE),
  summaryRowCount: () => q(SQL_SUMMARY_ROW_COUNT),
  summaryIndexHealth: () => q(SQL_SUMMARY_INDEX_HEALTH),
  summaryIndexUsage: () => q(SQL_SUMMARY_INDEX_USAGE),
  summaryServerInfo: () => q(SQL_SUMMARY_SERVER_INFO),

  previewQuery,

  distribution: {
    sampleClause(schema: string, tableName: string, sampleSize: SampleSize): string {
      const safeTable = `${quoteId(schema)}.${quoteId(tableName)}`;
      switch (sampleSize) {
        case "small":
          return `(SELECT * FROM ${safeTable} LIMIT 1000) AS __sample`;
        case "medium":
          return `(SELECT * FROM ${safeTable} LIMIT 10000) AS __sample`;
        case "full":
          return safeTable;
      }
    },

    rowCount: (sampleClause) => `SELECT COUNT(*) AS "cnt" FROM ${sampleClause}`,

    baseStats: (col, sampleClause, isNumeric) => `
      SELECT
        COUNT(*)                  AS "totalRows",
        COUNT(${col})             AS "nonNullCount",
        COUNT(*) - COUNT(${col})  AS "nullCount",
        COUNT(DISTINCT ${col})    AS "distinctCount"
        ${isNumeric ? `,
        MIN(${col}::double precision)    AS "minValue",
        MAX(${col}::double precision)    AS "maxValue",
        AVG(${col}::double precision)    AS "avgValue",
        STDDEV(${col}::double precision) AS "stddev"` : ""}
      FROM ${sampleClause}
    `,

    topValues: (col, sampleClause, totalRows, limit) => `
      SELECT
        ${col}::text                                       AS "value",
        COUNT(*)                                           AS "count",
        ROUND(COUNT(*) * 100.0 / ${totalRows}, 2)          AS "percentage"
      FROM ${sampleClause}
      WHERE ${col} IS NOT NULL
      GROUP BY ${col}
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `,

    isNumericType: (dataType) => NUMERIC_TYPES.has(dataType.toLowerCase()),
    isDateType: (dataType) => DATE_TYPES.has(dataType.toLowerCase()),
  },
};
