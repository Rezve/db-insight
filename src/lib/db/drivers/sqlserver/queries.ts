import type { SampleSize } from "@/types/analysis";
import type { IntrospectionQueries, PreparedQuery, QueryParams } from "../../types";

/** Safely quote a SQL Server identifier. */
export function quoteId(name: string): string {
  return `[${name.replace(/]/g, "]]")}]`;
}

/** An identifier-valued parameter (SQL Server `sysname` is nvarchar(128)). */
function id(value: string) {
  return { value, type: "string" as const, maxLength: 128 };
}

function table(schema: string, tableName: string): QueryParams {
  return { schema: id(schema), tableName: id(tableName) };
}

const SQL_LIST_TABLES = `
SELECT
    TABLE_SCHEMA AS [schema],
    TABLE_NAME   AS [name],
    TABLE_TYPE   AS [type]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
ORDER BY TABLE_SCHEMA, TABLE_NAME
`;

const SQL_SCHEMA_COLUMNS = `
SELECT
    c.TABLE_SCHEMA             AS [tableSchema],
    c.TABLE_NAME               AS [tableName],
    c.COLUMN_NAME              AS [columnName],
    c.DATA_TYPE                AS [dataType],
    c.IS_NULLABLE              AS [isNullable],
    c.CHARACTER_MAXIMUM_LENGTH AS [maxLength]
FROM INFORMATION_SCHEMA.COLUMNS c
INNER JOIN INFORMATION_SCHEMA.TABLES t
    ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
    AND c.TABLE_NAME  = t.TABLE_NAME
ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
`;

const SQL_SCHEMA_ROUTINES = `
SELECT
    ROUTINE_SCHEMA AS [schema],
    ROUTINE_NAME   AS [name],
    ROUTINE_TYPE   AS [type]
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_TYPE IN ('PROCEDURE', 'FUNCTION')
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
`;

const SQL_LIST_STORED_PROCEDURES = `
SELECT
    ROUTINE_SCHEMA AS [schema],
    ROUTINE_NAME   AS [name]
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_TYPE = 'PROCEDURE'
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
`;

const SQL_GET_SP_DEFINITION = `
SELECT sm.definition AS [definition]
FROM sys.sql_modules sm
INNER JOIN sys.objects o ON sm.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE s.name = @schema AND o.name = @name AND o.type = 'P'
`;

const SQL_SCHEMA_FOREIGN_KEYS = `
SELECT
    src_s.name  AS [sourceSchema],
    src_t.name  AS [sourceTable],
    src_c.name  AS [sourceColumn],
    tgt_s.name  AS [targetSchema],
    tgt_t.name  AS [targetTable],
    tgt_c.name  AS [targetColumn]
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.tables  src_t ON fkc.parent_object_id     = src_t.object_id
INNER JOIN sys.schemas src_s ON src_t.schema_id          = src_s.schema_id
INNER JOIN sys.columns src_c ON fkc.parent_object_id     = src_c.object_id
                             AND fkc.parent_column_id    = src_c.column_id
INNER JOIN sys.tables  tgt_t ON fkc.referenced_object_id = tgt_t.object_id
INNER JOIN sys.schemas tgt_s ON tgt_t.schema_id          = tgt_s.schema_id
INNER JOIN sys.columns tgt_c ON fkc.referenced_object_id = tgt_c.object_id
                             AND fkc.referenced_column_id = tgt_c.column_id
`;

const SQL_SCHEMA_PARAMETERS = `
SELECT
    s.name                                            AS [schema],
    o.name                                            AS [routineName],
    p.name                                            AS [paramName],
    t.name                                            AS [dataType],
    CAST(p.max_length AS INT)                         AS [maxLength],
    CAST(p.is_output        AS BIT)                   AS [isOutput],
    CAST(p.has_default_value AS BIT)                  AS [hasDefault],
    p.parameter_id                                    AS [parameterId]
FROM sys.parameters p
INNER JOIN sys.objects o ON p.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
INNER JOIN sys.types   t ON p.user_type_id = t.user_type_id
WHERE o.type IN ('P', 'FN', 'IF', 'TF')
  AND p.name <> ''
ORDER BY s.name, o.name, p.parameter_id
`;

const SQL_ROW_COUNT_FAST = `
SELECT
    ISNULL(SUM(p.rows), 0) AS [rowCount]
FROM sys.partitions p
INNER JOIN sys.tables t  ON p.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = @schema
  AND t.name = @tableName
  AND p.index_id IN (0, 1)
`;

const SQL_INDEX_INFO = `
SELECT
    i.name              AS [indexName],
    i.index_id          AS [indexId],
    i.type_desc         AS [type],
    CAST(i.is_unique         AS BIT) AS [isUnique],
    CAST(i.is_primary_key    AS BIT) AS [isPrimaryKey],
    CAST(i.is_disabled       AS BIT) AS [isDisabled],
    i.filter_definition AS [filterDefinition],
    c.name              AS [columnName],
    CAST(ic.is_included_column AS BIT) AS [isIncluded],
    ic.key_ordinal      AS [keyOrdinal]
FROM sys.indexes i
INNER JOIN sys.tables  t  ON i.object_id = t.object_id
INNER JOIN sys.schemas s  ON t.schema_id = s.schema_id
LEFT  JOIN sys.index_columns ic
    ON i.object_id = ic.object_id AND i.index_id = ic.index_id
LEFT  JOIN sys.columns c
    ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE s.name = @schema
  AND t.name = @tableName
ORDER BY i.index_id, ic.is_included_column, ic.key_ordinal
`;

const SQL_INDEX_SIZES = `
SELECT
    i.index_id                                                           AS [indexId],
    CAST(
        ROUND(SUM(ps.reserved_page_count) * 8192.0 / (1024.0 * 1024.0 * 1024.0), 4)
    AS DECIMAL(18, 4))                                                   AS [sizeGB]
FROM sys.indexes i
INNER JOIN sys.tables  t  ON i.object_id = t.object_id
INNER JOIN sys.schemas s  ON t.schema_id = s.schema_id
INNER JOIN sys.dm_db_partition_stats ps
    ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE s.name = @schema
  AND t.name = @tableName
GROUP BY i.index_id
`;

const SQL_TABLE_SIZES = `
SELECT
    s.name                                                               AS [schema],
    t.name                                                               AS [name],
    CAST(
        ROUND(SUM(ps.reserved_page_count) * 8192.0 / (1024.0 * 1024.0 * 1024.0), 4)
    AS DECIMAL(18, 4))                                                   AS [sizeGB]
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.dm_db_partition_stats ps ON t.object_id = ps.object_id
GROUP BY s.name, t.name
`;

const SQL_TABLE_SIZE = `
SELECT
    CAST(
        ROUND(SUM(ps.reserved_page_count) * 8192.0 / (1024.0 * 1024.0 * 1024.0), 4)
    AS DECIMAL(18, 4)) AS [sizeGB]
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.dm_db_partition_stats ps ON t.object_id = ps.object_id
WHERE s.name = @schema
  AND t.name = @tableName
`;

const SQL_SERVER_START_TIME = `
SELECT sqlserver_start_time AS [serverStartTime] FROM sys.dm_os_sys_info
`;

const SQL_INDEX_USAGE = `
SELECT
    i.name                          AS [indexName],
    i.index_id                      AS [indexId],
    ISNULL(us.user_seeks,   0)      AS [userSeeks],
    ISNULL(us.user_scans,   0)      AS [userScans],
    ISNULL(us.user_lookups, 0)      AS [userLookups],
    ISNULL(us.user_updates, 0)      AS [userUpdates],
    us.last_user_seek               AS [lastUserSeek],
    us.last_user_scan               AS [lastUserScan],
    us.last_user_lookup             AS [lastUserLookup],
    CAST(
        ROUND(
            (SELECT SUM(ps.reserved_page_count)
             FROM sys.dm_db_partition_stats ps
             WHERE ps.object_id = i.object_id AND ps.index_id = i.index_id
            ) * 8192.0 / (1024.0 * 1024.0 * 1024.0), 4)
    AS DECIMAL(18, 4))              AS [sizeGB]
FROM sys.indexes i
INNER JOIN sys.tables  t  ON i.object_id = t.object_id
INNER JOIN sys.schemas s  ON t.schema_id = s.schema_id
LEFT  JOIN sys.dm_db_index_usage_stats us
    ON i.object_id = us.object_id
    AND i.index_id = us.index_id
    AND us.database_id = DB_ID()
WHERE s.name = @schema
  AND t.name = @tableName
ORDER BY i.index_id
`;

const SQL_MISSING_INDEXES = `
SELECT
    mid.equality_columns        AS [equalityColumns],
    mid.inequality_columns      AS [inequalityColumns],
    mid.included_columns        AS [includedColumns],
    migs.avg_total_user_cost    AS [avgTotalCost],
    migs.avg_user_impact        AS [avgUserImpact],
    migs.user_seeks             AS [userSeeks],
    migs.user_scans             AS [userScans],
    ROUND(
        migs.avg_total_user_cost
        * migs.avg_user_impact
        * (migs.user_seeks + migs.user_scans),
    2) AS [improvementMeasure]
FROM sys.dm_db_missing_index_details mid
INNER JOIN sys.dm_db_missing_index_groups mig
    ON mid.index_handle = mig.index_handle
INNER JOIN sys.dm_db_missing_index_group_stats migs
    ON mig.index_group_handle = migs.group_handle
WHERE mid.database_id = DB_ID()
  AND (
      mid.statement LIKE '%[[]' + @schema + '].[' + @tableName + ']%'
      OR mid.statement LIKE '%[[]' + @schema + '].[' + @tableName + ']'
  )
ORDER BY improvementMeasure DESC
`;

const SQL_TABLE_COLUMNS = `
SELECT
    c.ORDINAL_POSITION            AS [ordinal],
    c.COLUMN_NAME                 AS [columnName],
    c.DATA_TYPE                   AS [dataType],
    c.CHARACTER_MAXIMUM_LENGTH    AS [maxLength],
    c.NUMERIC_PRECISION           AS [numericPrecision],
    c.NUMERIC_SCALE               AS [numericScale],
    c.IS_NULLABLE                 AS [isNullable],
    c.COLUMN_DEFAULT              AS [columnDefault],
    CAST(COLUMNPROPERTY(
        OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)),
        c.COLUMN_NAME, 'IsIdentity'
    ) AS BIT)                     AS [isIdentity],
    CAST(CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS [isPrimaryKey],
    fk_ref.referenced_schema      AS [fkSchema],
    fk_ref.referenced_table       AS [fkTable],
    fk_ref.referenced_column      AS [fkColumn]
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN (
    SELECT kcu.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA   = kcu.TABLE_SCHEMA
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      AND tc.TABLE_SCHEMA    = @schema
      AND tc.TABLE_NAME      = @tableName
) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
LEFT JOIN (
    SELECT
        kcu.COLUMN_NAME,
        kcu2.TABLE_SCHEMA AS referenced_schema,
        kcu2.TABLE_NAME   AS referenced_table,
        kcu2.COLUMN_NAME  AS referenced_column
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA   = kcu.TABLE_SCHEMA
    JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
        ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME
        AND kcu.ORDINAL_POSITION     = kcu2.ORDINAL_POSITION
    WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
      AND tc.TABLE_SCHEMA    = @schema
      AND tc.TABLE_NAME      = @tableName
) fk_ref ON c.COLUMN_NAME = fk_ref.COLUMN_NAME
WHERE c.TABLE_SCHEMA = @schema
  AND c.TABLE_NAME   = @tableName
ORDER BY c.ORDINAL_POSITION
`;

const SQL_EXTENDED_COLUMN_DETAILS = `
SELECT
    c.name AS [columnName],
    CAST(c.is_computed AS BIT) AS [isComputed],
    cc.definition AS [computedDefinition],
    CAST(cc.is_persisted AS BIT) AS [isPersisted],
    CAST(c.is_sparse AS BIT) AS [isSparse],
    ic.seed_value AS [identitySeed],
    ic.increment_value AS [identityIncrement],
    c.collation_name AS [collationName],
    CAST(ep.value AS NVARCHAR(MAX)) AS [columnComment],
    dc.name AS [defaultConstraintName],
    dc.definition AS [defaultDefinition]
FROM sys.columns c
INNER JOIN sys.tables t ON c.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN sys.computed_columns cc ON c.object_id = cc.object_id AND c.column_id = cc.column_id
LEFT JOIN sys.identity_columns ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
LEFT JOIN sys.default_constraints dc
    ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
LEFT JOIN sys.extended_properties ep
    ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    AND ep.name = 'MS_Description' AND ep.class = 1
WHERE s.name = @schema AND t.name = @tableName
ORDER BY c.column_id
`;

const SQL_FK_DETAILS = `
SELECT
    fk.name AS [constraintName],
    src_c.name AS [sourceColumn],
    tgt_s.name AS [targetSchema],
    tgt_t.name AS [targetTable],
    tgt_c.name AS [targetColumn],
    fk.delete_referential_action_desc AS [onDelete],
    fk.update_referential_action_desc AS [onUpdate]
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.tables src_t ON fkc.parent_object_id = src_t.object_id
INNER JOIN sys.schemas src_s ON src_t.schema_id = src_s.schema_id
INNER JOIN sys.columns src_c
    ON fkc.parent_object_id = src_c.object_id AND fkc.parent_column_id = src_c.column_id
INNER JOIN sys.tables tgt_t ON fkc.referenced_object_id = tgt_t.object_id
INNER JOIN sys.schemas tgt_s ON tgt_t.schema_id = tgt_s.schema_id
INNER JOIN sys.columns tgt_c
    ON fkc.referenced_object_id = tgt_c.object_id AND fkc.referenced_column_id = tgt_c.column_id
WHERE src_s.name = @schema AND src_t.name = @tableName
ORDER BY fk.name, fkc.constraint_column_id
`;

const SQL_SUMMARY_OBJECT_COUNTS = `
SELECT
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE')         AS [tableCount],
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'VIEW')               AS [viewCount],
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE')      AS [procedureCount],
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION')       AS [functionCount],
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS)                                        AS [totalColumnCount],
    (SELECT COUNT(DISTINCT TABLE_NAME + '|' + TABLE_SCHEMA)
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_TYPE = 'PRIMARY KEY')                                                   AS [tablesWithPK],
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_TYPE = 'FOREIGN KEY')                                                   AS [foreignKeyCount]
`;

const SQL_SUMMARY_STORAGE = `
SELECT
    CAST(ROUND(SUM(ps.reserved_page_count) * 8192.0 / 1073741824.0, 4) AS DECIMAL(18,4))   AS [totalSizeGB],
    CAST(ROUND(SUM(CASE WHEN i.index_id IN (0,1) THEN ps.reserved_page_count ELSE 0 END) * 8192.0 / 1073741824.0, 4) AS DECIMAL(18,4)) AS [dataSizeGB],
    CAST(ROUND(SUM(CASE WHEN i.index_id > 1 THEN ps.reserved_page_count ELSE 0 END) * 8192.0 / 1073741824.0, 4) AS DECIMAL(18,4))      AS [indexSizeGB],
    (SELECT TOP 1 s2.name + '.' + t2.name
     FROM sys.tables t2
     INNER JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id
     INNER JOIN sys.dm_db_partition_stats ps2 ON t2.object_id = ps2.object_id
     GROUP BY s2.name, t2.name
     ORDER BY SUM(ps2.reserved_page_count) DESC)                                             AS [largestTableName]
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
`;

const SQL_SUMMARY_ROW_COUNT = `
SELECT ISNULL(SUM(p.rows), 0) AS [totalRows]
FROM sys.partitions p
INNER JOIN sys.tables t ON p.object_id = t.object_id
WHERE p.index_id IN (0, 1)
`;

const SQL_SUMMARY_INDEX_HEALTH = `
SELECT
    COUNT(*)                                                                        AS [totalIndexes],
    SUM(CASE WHEN i.is_disabled = 1 THEN 1 ELSE 0 END)                             AS [disabledIndexes],
    (SELECT COUNT(DISTINCT mid.object_id)
     FROM sys.dm_db_missing_index_details mid
     WHERE mid.database_id = DB_ID())                                               AS [tablesWithMissingIndexes],
    (SELECT COUNT(*)
     FROM sys.dm_db_missing_index_details mid
     WHERE mid.database_id = DB_ID())                                               AS [missingIndexCount]
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
WHERE i.type > 0
`;

const SQL_SUMMARY_INDEX_USAGE = `
SELECT
    SUM(ISNULL(us.user_seeks,   0))   AS [totalSeeks],
    SUM(ISNULL(us.user_scans,   0))   AS [totalScans],
    SUM(ISNULL(us.user_lookups, 0))   AS [totalLookups],
    SUM(ISNULL(us.user_updates, 0))   AS [totalUpdates],
    COUNT(CASE WHEN ISNULL(us.user_seeks,   0)
                  + ISNULL(us.user_scans,   0)
                  + ISNULL(us.user_lookups, 0) = 0
               AND i.type > 0
               AND i.is_primary_key = 0
               AND i.is_unique_constraint = 0
          THEN 1 END)                  AS [unusedIndexCount]
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
LEFT JOIN sys.dm_db_index_usage_stats us
    ON i.object_id = us.object_id
    AND i.index_id = us.index_id
    AND us.database_id = DB_ID()
WHERE i.type > 0
`;

const SQL_SUMMARY_SERVER_INFO = `
SELECT
    @@SERVERNAME                                                   AS [serverName],
    DB_NAME()                                                      AS [databaseName],
    CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50))         AS [sqlVersion],
    CAST(SERVERPROPERTY('Edition')        AS NVARCHAR(100))        AS [edition],
    sqlserver_start_time                                           AS [serverStartTime],
    DATEDIFF(MINUTE, sqlserver_start_time, GETDATE())              AS [uptimeMinutes]
FROM sys.dm_os_sys_info
`;

const NUMERIC_TYPES = new Set([
  "int", "bigint", "smallint", "tinyint", "bit",
  "decimal", "numeric", "money", "smallmoney",
  "float", "real",
]);

const DATE_TYPES = new Set([
  "date", "datetime", "datetime2", "datetimeoffset", "smalldatetime", "time",
]);

function q(sql: string, params?: QueryParams): PreparedQuery {
  return params ? { sql, params } : { sql };
}

/** Row-limited preview of a table, for the data grid and new editor tabs. */
export function previewQuery(schema: string, tableName: string, limit: number): string {
  return `SELECT TOP ${limit} * FROM ${quoteId(schema)}.${quoteId(tableName)}`;
}

export const sqlServerIntrospection: IntrospectionQueries = {
  listTables: () => q(SQL_LIST_TABLES),
  listStoredProcedures: () => q(SQL_LIST_STORED_PROCEDURES),
  schemaColumns: () => q(SQL_SCHEMA_COLUMNS),
  schemaRoutines: () => q(SQL_SCHEMA_ROUTINES),
  schemaForeignKeys: () => q(SQL_SCHEMA_FOREIGN_KEYS),
  schemaParameters: () => q(SQL_SCHEMA_PARAMETERS),

  spDefinition: (schema, name) => q(SQL_GET_SP_DEFINITION, { schema: id(schema), name: id(name) }),

  rowCountFast: (schema, tableName) => q(SQL_ROW_COUNT_FAST, table(schema, tableName)),
  rowCountExact: (schema, tableName) =>
    q(`SELECT COUNT_BIG(*) AS [rowCount] FROM ${quoteId(schema)}.${quoteId(tableName)} WITH (NOLOCK)`),

  indexInfo: (schema, tableName) => q(SQL_INDEX_INFO, table(schema, tableName)),
  indexSizes: (schema, tableName) => q(SQL_INDEX_SIZES, table(schema, tableName)),
  indexUsage: (schema, tableName) => q(SQL_INDEX_USAGE, table(schema, tableName)),
  missingIndexes: (schema, tableName) => q(SQL_MISSING_INDEXES, table(schema, tableName)),

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
          return `(SELECT TOP 1000 * FROM ${safeTable} WITH (NOLOCK)) AS __sample`;
        case "medium":
          return `(SELECT TOP 10000 * FROM ${safeTable} WITH (NOLOCK)) AS __sample`;
        case "full":
          return `${safeTable} WITH (NOLOCK)`;
      }
    },

    rowCount: (sampleClause) => `SELECT COUNT(*) AS [cnt] FROM ${sampleClause}`,

    baseStats: (col, sampleClause, isNumeric) => `
            SELECT
              COUNT(*)          AS [totalRows],
              COUNT(${col})    AS [nonNullCount],
              COUNT(*) - COUNT(${col}) AS [nullCount],
              COUNT(DISTINCT ${col}) AS [distinctCount]
              ${isNumeric ? `,
              MIN(CAST(${col} AS FLOAT)) AS [minValue],
              MAX(CAST(${col} AS FLOAT)) AS [maxValue],
              AVG(CAST(${col} AS FLOAT)) AS [avgValue],
              STDEV(CAST(${col} AS FLOAT)) AS [stddev]` : ""}
            FROM ${sampleClause}
          `,

    topValues: (col, sampleClause, totalRows, limit) => `
              SELECT TOP ${limit}
                CAST(${col} AS NVARCHAR(500)) AS [value],
                COUNT(*)                        AS [count],
                CAST(COUNT(*) * 100.0 / ${totalRows} AS DECIMAL(6,2)) AS [percentage]
              FROM ${sampleClause}
              WHERE ${col} IS NOT NULL
              GROUP BY ${col}
              ORDER BY COUNT(*) DESC
            `,

    isNumericType: (dataType) => NUMERIC_TYPES.has(dataType.toLowerCase()),
    isDateType: (dataType) => DATE_TYPES.has(dataType.toLowerCase()),
  },
};
