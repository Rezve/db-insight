import type { TableColumnDetail, ExtendedColumnDetail, IndexInfo } from "@/types/analysis";
import type { DdlBuilders } from "../../types";
import { quoteId } from "./queries";

/** Types for which a COLLATE clause is meaningful. */
const CHAR_TYPES = ["char", "nchar", "varchar", "nvarchar", "text", "ntext"];

/** Types whose declaration carries a length. */
const SIZED_TYPES = ["char", "varchar", "nchar", "nvarchar", "binary", "varbinary"];

/**
 * Renders a column's full type declaration. `maxLength === -1` is SQL Server's
 * sentinel for `(MAX)`.
 */
function formatDataType(col: TableColumnDetail, maxKeyword = "max"): string {
  const t = col.dataType.toLowerCase();
  if (SIZED_TYPES.includes(t)) {
    if (col.maxLength === -1) return `${col.dataType}(${maxKeyword})`;
    if (col.maxLength != null) return `${col.dataType}(${col.maxLength})`;
  }
  if (["decimal", "numeric"].includes(t)) {
    if (col.numericPrecision != null && col.numericScale != null) {
      return `${col.dataType}(${col.numericPrecision}, ${col.numericScale})`;
    }
  }
  if (["float", "real"].includes(t) && col.numericPrecision != null) {
    return `${col.dataType}(${col.numericPrecision})`;
  }
  return col.dataType;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

export const sqlServerDdl: DdlBuilders = {
  formatDataType: (col) => formatDataType(col),

  isCollatableType: (dataType) => CHAR_TYPES.includes(dataType.split("(")[0].toLowerCase()),

  createTable(schema, tableName, columns, extended) {
    const lines: string[] = columns.map((col) => {
      const ext = extended?.get(col.columnName);
      if (ext?.isComputed && ext.computedDefinition) {
        const parts = [`  ${quoteId(col.columnName)}`, `AS (${ext.computedDefinition})`];
        if (ext.isPersisted) parts.push("PERSISTED");
        return parts.join(" ");
      }
      const parts: string[] = [`  ${quoteId(col.columnName)}`, formatDataType(col, "MAX")];
      if (col.isIdentity) parts.push("IDENTITY(1,1)");
      parts.push(col.isNullable ? "NULL" : "NOT NULL");
      if (col.columnDefault != null) parts.push(`DEFAULT ${col.columnDefault}`);
      return parts.join(" ");
    });

    const pkCols = columns.filter(
      (c) => c.isPrimaryKey && !extended?.get(c.columnName)?.isComputed
    );
    if (pkCols.length > 0) {
      const pkColList = pkCols.map((c) => quoteId(c.columnName)).join(", ");
      lines.push(`  CONSTRAINT ${quoteId("PK_" + tableName)} PRIMARY KEY (${pkColList})`);
    }

    return `CREATE TABLE ${quoteId(schema)}.${quoteId(tableName)} (\n${lines.join(",\n")}\n);`;
  },

  indexes(schema, tableName, indexes: IndexInfo[]) {
    const statements: string[] = [];

    for (const idx of indexes) {
      // Skip heap (indexId 0) and the PK (already captured in CREATE TABLE)
      if (idx.indexId === 0 || idx.isPrimaryKey) continue;
      // Only emit standard clustered/nonclustered DDL
      const typeUp = idx.type.toUpperCase();
      if (!typeUp.includes("CLUSTERED") || typeUp.includes("COLUMNSTORE")) continue;

      const keyCols = idx.columns
        .filter((c) => !c.isIncluded)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => quoteId(c.name));
      if (keyCols.length === 0) continue;

      const includedCols = idx.columns.filter((c) => c.isIncluded).map((c) => quoteId(c.name));

      const unique = idx.isUnique ? "UNIQUE " : "";
      let stmt = `CREATE ${unique}${typeUp} INDEX ${quoteId(idx.indexName)}\n    ON ${quoteId(schema)}.${quoteId(tableName)} (${keyCols.join(", ")})`;
      if (includedCols.length > 0) stmt += `\n    INCLUDE (${includedCols.join(", ")})`;
      if (idx.filterDefinition) stmt += `\n    WHERE ${idx.filterDefinition}`;
      stmt += ";";
      if (idx.isDisabled) stmt += "  -- DISABLED";

      statements.push(stmt);
    }

    return statements.join("\n\n");
  },

  missingIndex(equalityColumns, inequalityColumns, includedColumns, schema, tableName, idx) {
    const parts: string[] = [];
    if (equalityColumns) parts.push(equalityColumns);
    if (inequalityColumns) parts.push(inequalityColumns);
    const keyCols = parts.join(", ");
    const include = includedColumns ? ` INCLUDE (${includedColumns})` : "";
    return `CREATE NONCLUSTERED INDEX [IX_Missing_${idx}]\nON ${quoteId(schema)}.${quoteId(tableName)} (${keyCols})${include};`;
  },

  alterColumn(schema, tableName, colName, dataTypeFull, isNullable, collation) {
    const nullPart = isNullable ? "NULL" : "NOT NULL";
    const collatePart =
      collation && CHAR_TYPES.includes(dataTypeFull.split("(")[0].toLowerCase())
        ? ` COLLATE ${collation}`
        : "";
    return `ALTER TABLE ${quoteId(schema)}.${quoteId(tableName)} ALTER COLUMN ${quoteId(colName)} ${dataTypeFull}${collatePart} ${nullPart};`;
  },

  setDefault(schema, tableName, colName, oldConstraintName, newDefault) {
    const stmts: string[] = [];
    if (oldConstraintName) {
      stmts.push(
        `ALTER TABLE ${quoteId(schema)}.${quoteId(tableName)} DROP CONSTRAINT ${quoteId(oldConstraintName)};`
      );
    }
    if (newDefault && newDefault.trim()) {
      stmts.push(
        `ALTER TABLE ${quoteId(schema)}.${quoteId(tableName)} ADD DEFAULT (${newDefault}) FOR ${quoteId(colName)};`
      );
    }
    return stmts.join("\n");
  },

  columnComment(schema, tableName, colName, comment, hasExisting) {
    const proc = hasExisting ? "sys.sp_updateextendedproperty" : "sys.sp_addextendedproperty";
    return `EXEC ${proc} @name = N'MS_Description', @value = N'${esc(comment)}', @level0type = N'SCHEMA', @level0name = N'${esc(schema)}', @level1type = N'TABLE', @level1name = N'${esc(tableName)}', @level2type = N'COLUMN', @level2name = N'${esc(colName)}';`;
  },

  dropIndex(schema, tableName, indexName) {
    return `DROP INDEX ${quoteId(indexName)} ON ${quoteId(schema)}.${quoteId(tableName)};`;
  },

  alterIndex(schema, tableName, indexName, action, online) {
    const base = `ALTER INDEX ${quoteId(indexName)} ON ${quoteId(schema)}.${quoteId(tableName)} ${action}`;
    const withClause = action === "REBUILD" && online ? ` WITH (ONLINE = ON)` : "";
    return `${base}${withClause};`;
  },

  dropConstraint(schema, tableName, constraintName) {
    return `ALTER TABLE ${quoteId(schema)}.${quoteId(tableName)} DROP CONSTRAINT ${quoteId(constraintName)};`;
  },

  renameColumn(schema, tableName, oldName, newName) {
    const objectName = `${esc(schema)}.${esc(tableName)}.${esc(oldName)}`;
    return `EXEC sp_rename N'${objectName}', N'${esc(newName)}', N'COLUMN';`;
  },

  allowedStatementPrefixes: [
    "ALTER TABLE ",
    "DROP INDEX ",
    "ALTER INDEX ",
    "EXEC SYS.SP_ADDEXTENDEDPROPERTY",
    "EXEC SYS.SP_UPDATEEXTENDEDPROPERTY",
    "EXEC SP_RENAME ",
  ],
};
