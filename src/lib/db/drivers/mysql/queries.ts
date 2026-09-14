import type { SampleSize } from "@/types/analysis";
import type { IntrospectionQueries, PreparedQuery, QueryParams } from "../../types";

/** Safely quote a MySQL identifier. */
export function quoteId(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function id(value: string) {
  return { value, type: "string" as const };
}

/**
 * MySQL has no schema tier above the database, so the app's "schema" is the
 * database name. An empty value falls back to the connected database.
 */
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

/** Resolves the @schema parameter, defaulting to the current database. */
const SCHEMA = `COALESCE(NULLIF(@schema, ''), DATABASE())`;

const SQL_LIST_TABLES = `
SELECT
    TABLE_SCHEMA AS \`schema\`,
    TABLE_NAME   AS \`name\`,
    TABLE_TYPE   AS \`type\`
FROM information_schema.TABLES
WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
  AND TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME
`;

const SQL_SCHEMA_COLUMNS = `
SELECT
    c.TABLE_SCHEMA             AS \`tableSchema\`,
    c.TABLE_NAME               AS \`tableName\`,
    c.COLUMN_NAME              AS \`columnName\`,
    c.DATA_TYPE                AS \`dataType\`,
    c.IS_NULLABLE              AS \`isNullable\`,
    c.CHARACTER_MAXIMUM_LENGTH AS \`maxLength\`
FROM information_schema.COLUMNS c
INNER JOIN information_schema.TABLES t
    ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
    AND c.TABLE_NAME  = t.TABLE_NAME
WHERE c.TABLE_SCHEMA = DATABASE()
ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
`;

const SQL_SCHEMA_ROUTINES = `
SELECT
    ROUTINE_SCHEMA AS \`schema\`,
    ROUTINE_NAME   AS \`name\`,
    ROUTINE_TYPE   AS \`type\`
FROM information_schema.ROUTINES
WHERE ROUTINE_TYPE IN ('PROCEDURE', 'FUNCTION')
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
`;

const SQL_LIST_STORED_PROCEDURES = `
SELECT
    ROUTINE_SCHEMA AS \`schema\`,
    ROUTINE_NAME   AS \`name\`
FROM information_schema.ROUTINES
WHERE ROUTINE_TYPE = 'PROCEDURE'
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
`;

const SQL_GET_SP_DEFINITION = `
SELECT ROUTINE_DEFINITION AS \`definition\`
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = ${SCHEMA} AND ROUTINE_NAME = @name
LIMIT 1
`;

const SQL_SCHEMA_FOREIGN_KEYS = `
SELECT
    k.TABLE_SCHEMA            AS \`sourceSchema\`,
    k.TABLE_NAME              AS \`sourceTable\`,
    k.COLUMN_NAME             AS \`sourceColumn\`,
    k.REFERENCED_TABLE_SCHEMA AS \`targetSchema\`,
    k.REFERENCED_TABLE_NAME   AS \`targetTable\`,
    k.REFERENCED_COLUMN_NAME  AS \`targetColumn\`
FROM information_schema.KEY_COLUMN_USAGE k
WHERE k.REFERENCED_TABLE_NAME IS NOT NULL
  AND k.TABLE_SCHEMA = DATABASE()
`;

const SQL_SCHEMA_PARAMETERS = `
SELECT
    SPECIFIC_SCHEMA  AS \`schema\`,
    SPECIFIC_NAME    AS \`routineName\`,
    PARAMETER_NAME   AS \`paramName\`,
    DATA_TYPE        AS \`dataType\`,
    CHARACTER_MAXIMUM_LENGTH AS \`maxLength\`,
    (PARAMETER_MODE IN ('OUT', 'INOUT')) AS \`isOutput\`,
    0                AS \`hasDefault\`,
    ORDINAL_POSITION AS \`parameterId\`
FROM information_schema.PARAMETERS
WHERE SPECIFIC_SCHEMA = DATABASE()
  AND PARAMETER_NAME IS NOT NULL
ORDER BY SPECIFIC_SCHEMA, SPECIFIC_NAME, ORDINAL_POSITION
`;

/** TABLE_ROWS is an InnoDB estimate, not an exact count. */
const SQL_ROW_COUNT_FAST = `
SELECT COALESCE(TABLE_ROWS, 0) AS \`rowCount\`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = ${SCHEMA} AND TABLE_NAME = @tableName
`;

/**
 * MySQL has no index OIDs, so a dense rank over the index name provides a
 * stable id within the table. PRIMARY is always ranked first.
 */
const SQL_INDEX_INFO = `
SELECT
    s.INDEX_NAME AS \`indexName\`,
    DENSE_RANK() OVER (
        ORDER BY (s.INDEX_NAME <> 'PRIMARY'), s.INDEX_NAME
    ) AS \`indexId\`,
    s.INDEX_TYPE AS \`type\`,
    (s.NON_UNIQUE = 0) AS \`isUnique\`,
    (s.INDEX_NAME = 'PRIMARY') AS \`isPrimaryKey\`,
    0 AS \`isDisabled\`,
    NULL AS \`filterDefinition\`,
    s.COLUMN_NAME AS \`columnName\`,
    0 AS \`isIncluded\`,
    s.SEQ_IN_INDEX AS \`keyOrdinal\`
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = ${SCHEMA} AND s.TABLE_NAME = @tableName
ORDER BY (s.INDEX_NAME <> 'PRIMARY'), s.INDEX_NAME, s.SEQ_IN_INDEX
`;

/** MySQL reports index storage per table, not per index. */
const SQL_INDEX_SIZES = `
SELECT
    DENSE_RANK() OVER (
        ORDER BY (s.INDEX_NAME <> 'PRIMARY'), s.INDEX_NAME
    ) AS \`indexId\`,
    NULL AS \`sizeGB\`
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = ${SCHEMA} AND s.TABLE_NAME = @tableName
GROUP BY s.INDEX_NAME
`;

const SQL_TABLE_SIZES = `
SELECT
    TABLE_SCHEMA AS \`schema\`,
    TABLE_NAME   AS \`name\`,
    ROUND((COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) / 1073741824, 4) AS \`sizeGB\`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
`;

const SQL_TABLE_SIZE = `
SELECT ROUND((COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) / 1073741824, 4) AS \`sizeGB\`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = ${SCHEMA} AND TABLE_NAME = @tableName
`;

const SQL_SERVER_START_TIME = `
SELECT DATE_SUB(NOW(), INTERVAL VARIABLE_VALUE SECOND) AS \`serverStartTime\`
FROM performance_schema.global_status
WHERE VARIABLE_NAME = 'Uptime'
`;

/**
 * Index usage comes from performance_schema, which reports per-index I/O
 * counts. Reads map onto scans; MySQL keeps no last-used timestamps.
 */
const SQL_INDEX_USAGE = `
SELECT
    i.INDEX_NAME AS \`indexName\`,
    DENSE_RANK() OVER (
        ORDER BY (i.INDEX_NAME <> 'PRIMARY'), i.INDEX_NAME
    ) AS \`indexId\`,
    0 AS \`userSeeks\`,
    COALESCE(i.COUNT_READ, 0)  AS \`userScans\`,
    COALESCE(i.COUNT_FETCH, 0) AS \`userLookups\`,
    COALESCE(i.COUNT_INSERT, 0) + COALESCE(i.COUNT_UPDATE, 0) + COALESCE(i.COUNT_DELETE, 0) AS \`userUpdates\`,
    NULL AS \`lastUserSeek\`,
    NULL AS \`lastUserScan\`,
    NULL AS \`lastUserLookup\`,
    NULL AS \`sizeGB\`
FROM performance_schema.table_io_waits_summary_by_index_usage i
WHERE i.OBJECT_SCHEMA = ${SCHEMA} AND i.OBJECT_NAME = @tableName
  AND i.INDEX_NAME IS NOT NULL
`;

const SQL_TABLE_COLUMNS = `
SELECT
    c.ORDINAL_POSITION         AS \`ordinal\`,
    c.COLUMN_NAME              AS \`columnName\`,
    c.DATA_TYPE                AS \`dataType\`,
    c.CHARACTER_MAXIMUM_LENGTH AS \`maxLength\`,
    c.NUMERIC_PRECISION        AS \`numericPrecision\`,
    c.NUMERIC_SCALE            AS \`numericScale\`,
    c.IS_NULLABLE              AS \`isNullable\`,
    c.COLUMN_DEFAULT           AS \`columnDefault\`,
    (c.EXTRA LIKE '%auto_increment%') AS \`isIdentity\`,
    (c.COLUMN_KEY = 'PRI')     AS \`isPrimaryKey\`,
    k.REFERENCED_TABLE_SCHEMA  AS \`fkSchema\`,
    k.REFERENCED_TABLE_NAME    AS \`fkTable\`,
    k.REFERENCED_COLUMN_NAME   AS \`fkColumn\`
FROM information_schema.COLUMNS c
LEFT JOIN information_schema.KEY_COLUMN_USAGE k
    ON  k.TABLE_SCHEMA = c.TABLE_SCHEMA
    AND k.TABLE_NAME   = c.TABLE_NAME
    AND k.COLUMN_NAME  = c.COLUMN_NAME
    AND k.REFERENCED_TABLE_NAME IS NOT NULL
WHERE c.TABLE_SCHEMA = ${SCHEMA} AND c.TABLE_NAME = @tableName
ORDER BY c.ORDINAL_POSITION
`;

/**
 * MySQL generated columns may be VIRTUAL or STORED, so `isPersisted` is only
 * true for STORED. There is no sparse-column concept or named default
 * constraint, and comments live on the column itself.
 */
const SQL_EXTENDED_COLUMN_DETAILS = `
SELECT
    c.COLUMN_NAME AS \`columnName\`,
    (c.EXTRA LIKE '%GENERATED%') AS \`isComputed\`,
    NULLIF(c.GENERATION_EXPRESSION, '') AS \`computedDefinition\`,
    (c.EXTRA LIKE '%STORED GENERATED%') AS \`isPersisted\`,
    0 AS \`isSparse\`,
    NULL AS \`identitySeed\`,
    NULL AS \`identityIncrement\`,
    c.COLLATION_NAME AS \`collationName\`,
    NULLIF(c.COLUMN_COMMENT, '') AS \`columnComment\`,
    NULL AS \`defaultConstraintName\`,
    c.COLUMN_DEFAULT AS \`defaultDefinition\`
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = ${SCHEMA} AND c.TABLE_NAME = @tableName
ORDER BY c.ORDINAL_POSITION
`;

const SQL_FK_DETAILS = `
SELECT
    r.CONSTRAINT_NAME         AS \`constraintName\`,
    k.COLUMN_NAME             AS \`sourceColumn\`,
    k.REFERENCED_TABLE_SCHEMA AS \`targetSchema\`,
    k.REFERENCED_TABLE_NAME   AS \`targetTable\`,
    k.REFERENCED_COLUMN_NAME  AS \`targetColumn\`,
    r.DELETE_RULE             AS \`onDelete\`,
    r.UPDATE_RULE             AS \`onUpdate\`
FROM information_schema.REFERENTIAL_CONSTRAINTS r
INNER JOIN information_schema.KEY_COLUMN_USAGE k
    ON  k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
    AND k.CONSTRAINT_NAME   = r.CONSTRAINT_NAME
WHERE r.CONSTRAINT_SCHEMA = ${SCHEMA} AND r.TABLE_NAME = @tableName
ORDER BY r.CONSTRAINT_NAME, k.ORDINAL_POSITION
`;

const SQL_SUMMARY_OBJECT_COUNTS = `
SELECT
    (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = DATABASE())      AS \`tableCount\`,
    (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_TYPE = 'VIEW' AND TABLE_SCHEMA = DATABASE())            AS \`viewCount\`,
    (SELECT COUNT(*) FROM information_schema.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = DATABASE())   AS \`procedureCount\`,
    (SELECT COUNT(*) FROM information_schema.ROUTINES
      WHERE ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_SCHEMA = DATABASE())    AS \`functionCount\`,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE())                                    AS \`totalColumnCount\`,
    (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.STATISTICS
      WHERE INDEX_NAME = 'PRIMARY' AND TABLE_SCHEMA = DATABASE())         AS \`tablesWithPK\`,
    (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE())                               AS \`foreignKeyCount\`
`;

const SQL_SUMMARY_STORAGE = `
SELECT
    ROUND(SUM(COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) / 1073741824, 4) AS \`totalSizeGB\`,
    ROUND(SUM(COALESCE(DATA_LENGTH, 0)) / 1073741824, 4)                             AS \`dataSizeGB\`,
    ROUND(SUM(COALESCE(INDEX_LENGTH, 0)) / 1073741824, 4)                            AS \`indexSizeGB\`,
    (SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME)
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY (COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) DESC
     LIMIT 1)                                                                        AS \`largestTableName\`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
`;

const SQL_SUMMARY_ROW_COUNT = `
SELECT COALESCE(SUM(TABLE_ROWS), 0) AS \`totalRows\`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
`;

/** MySQL cannot disable an index and has no missing-index advisor. */
const SQL_SUMMARY_INDEX_HEALTH = `
SELECT
    COUNT(DISTINCT TABLE_NAME, INDEX_NAME) AS \`totalIndexes\`,
    0 AS \`disabledIndexes\`,
    0 AS \`tablesWithMissingIndexes\`,
    0 AS \`missingIndexCount\`
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
`;

const SQL_SUMMARY_INDEX_USAGE = `
SELECT
    0 AS \`totalSeeks\`,
    COALESCE(SUM(COUNT_READ), 0)  AS \`totalScans\`,
    COALESCE(SUM(COUNT_FETCH), 0) AS \`totalLookups\`,
    COALESCE(SUM(COUNT_INSERT + COUNT_UPDATE + COUNT_DELETE), 0) AS \`totalUpdates\`,
    COALESCE(SUM(CASE WHEN COUNT_READ = 0 AND INDEX_NAME <> 'PRIMARY' THEN 1 ELSE 0 END), 0) AS \`unusedIndexCount\`
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE OBJECT_SCHEMA = DATABASE() AND INDEX_NAME IS NOT NULL
`;

const SQL_SUMMARY_SERVER_INFO = `
SELECT
    @@hostname      AS \`serverName\`,
    DATABASE()      AS \`databaseName\`,
    VERSION()       AS \`sqlVersion\`,
    @@version_comment AS \`edition\`,
    (SELECT DATE_SUB(NOW(), INTERVAL VARIABLE_VALUE SECOND)
     FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Uptime') AS \`serverStartTime\`,
    (SELECT FLOOR(VARIABLE_VALUE / 60)
     FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Uptime') AS \`uptimeMinutes\`
`;

const NUMERIC_TYPES = new Set([
  "tinyint", "smallint", "mediumint", "int", "integer", "bigint",
  "decimal", "numeric", "float", "double", "bit",
]);

const DATE_TYPES = new Set(["date", "datetime", "timestamp", "time", "year"]);

export const mysqlIntrospection: IntrospectionQueries = {
  listTables: () => q(SQL_LIST_TABLES),
  listStoredProcedures: () => q(SQL_LIST_STORED_PROCEDURES),
  schemaColumns: () => q(SQL_SCHEMA_COLUMNS),
  schemaRoutines: () => q(SQL_SCHEMA_ROUTINES),
  schemaForeignKeys: () => q(SQL_SCHEMA_FOREIGN_KEYS),
  schemaParameters: () => q(SQL_SCHEMA_PARAMETERS),

  spDefinition: (schema, name) => q(SQL_GET_SP_DEFINITION, { schema: id(schema), name: id(name) }),

  rowCountFast: (schema, tableName) => q(SQL_ROW_COUNT_FAST, table(schema, tableName)),
  rowCountExact: (schema, tableName) =>
    q(`SELECT COUNT(*) AS \`rowCount\` FROM ${quoteId(schema)}.${quoteId(tableName)}`),

  indexInfo: (schema, tableName) => q(SQL_INDEX_INFO, table(schema, tableName)),
  indexSizes: (schema, tableName) => q(SQL_INDEX_SIZES, table(schema, tableName)),
  indexUsage: (schema, tableName) => q(SQL_INDEX_USAGE, table(schema, tableName)),

  // No missing-index advisor in MySQL; capability flag keeps this unused.
  missingIndexes: () => q(`SELECT NULL FROM DUAL WHERE FALSE`),

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

    rowCount: (sampleClause) => `SELECT COUNT(*) AS \`cnt\` FROM ${sampleClause}`,

    baseStats: (col, sampleClause, isNumeric) => `
      SELECT
        COUNT(*)                  AS \`totalRows\`,
        COUNT(${col})             AS \`nonNullCount\`,
        COUNT(*) - COUNT(${col})  AS \`nullCount\`,
        COUNT(DISTINCT ${col})    AS \`distinctCount\`
        ${isNumeric ? `,
        MIN(${col} * 1.0E0) AS \`minValue\`,
        MAX(${col} * 1.0E0) AS \`maxValue\`,
        AVG(${col} * 1.0E0) AS \`avgValue\`,
        STDDEV_SAMP(${col} * 1.0E0) AS \`stddev\`` : ""}
      FROM ${sampleClause}
    `,

    topValues: (col, sampleClause, totalRows, limit) => `
      SELECT
        CAST(${col} AS CHAR(500))                  AS \`value\`,
        COUNT(*)                                   AS \`count\`,
        ROUND(COUNT(*) * 100.0 / ${totalRows}, 2)  AS \`percentage\`
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
