import type { SampleSize } from "@/types/analysis";

// Safely quote SQL identifiers (schema/table names validated against INFORMATION_SCHEMA first)
export function quoteId(name: string): string {
  return `[${name.replace(/]/g, "]]")}]`;
}

export function buildSampleClause(
  schema: string,
  tableName: string,
  sampleSize: SampleSize
): string {
  const safeTable = `${quoteId(schema)}.${quoteId(tableName)}`;
  switch (sampleSize) {
    case "small":
      return `(SELECT TOP 1000 * FROM ${safeTable} WITH (NOLOCK)) AS __sample`;
    case "medium":
      return `(SELECT TOP 10000 * FROM ${safeTable} WITH (NOLOCK)) AS __sample`;
    case "full":
      return `${safeTable} WITH (NOLOCK)`;
  }
}

export const SQL_LIST_TABLES = `
SELECT
    TABLE_SCHEMA AS [schema],
    TABLE_NAME   AS [name],
    TABLE_TYPE   AS [type]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
ORDER BY TABLE_SCHEMA, TABLE_NAME
`;

export const SQL_SCHEMA_COLUMNS = `
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

export const SQL_SCHEMA_ROUTINES = `
SELECT
    ROUTINE_SCHEMA AS [schema],
    ROUTINE_NAME   AS [name],
    ROUTINE_TYPE   AS [type]
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_TYPE IN ('PROCEDURE', 'FUNCTION')
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
`;

export const SQL_ROW_COUNT_FAST = `
SELECT
    ISNULL(SUM(p.rows), 0) AS [rowCount]
FROM sys.partitions p
INNER JOIN sys.tables t  ON p.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = @schema
  AND t.name = @tableName
  AND p.index_id IN (0, 1)
`;

export function buildRowCountExact(schema: string, tableName: string): string {
  return `SELECT COUNT_BIG(*) AS [rowCount] FROM ${quoteId(schema)}.${quoteId(tableName)} WITH (NOLOCK)`;
}

export const SQL_INDEX_INFO = `
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

export const SQL_INDEX_SIZES = `
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

export const SQL_TABLE_SIZES = `
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

export const SQL_INDEX_USAGE = `
SELECT
    i.name                          AS [indexName],
    i.index_id                      AS [indexId],
    ISNULL(us.user_seeks,   0)      AS [userSeeks],
    ISNULL(us.user_scans,   0)      AS [userScans],
    ISNULL(us.user_lookups, 0)      AS [userLookups],
    ISNULL(us.user_updates, 0)      AS [userUpdates],
    us.last_user_seek               AS [lastUserSeek],
    us.last_user_scan               AS [lastUserScan],
    us.last_user_lookup             AS [lastUserLookup]
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

export const SQL_MISSING_INDEXES = `
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

export const SQL_TABLE_COLUMNS = `
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

export function synthesizeMissingIndexDDL(
  equalityColumns: string | null,
  inequalityColumns: string | null,
  includedColumns: string | null,
  schema: string,
  tableName: string,
  idx: number
): string {
  const parts: string[] = [];
  if (equalityColumns) parts.push(equalityColumns);
  if (inequalityColumns) parts.push(inequalityColumns);
  const keyCols = parts.join(", ");
  const include = includedColumns ? ` INCLUDE (${includedColumns})` : "";
  return `CREATE NONCLUSTERED INDEX [IX_Missing_${idx}]\nON ${quoteId(schema)}.${quoteId(tableName)} (${keyCols})${include};`;
}
