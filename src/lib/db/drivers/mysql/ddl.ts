import type { TableColumnDetail, IndexInfo } from "@/types/analysis";
import type { DdlBuilders } from "../../types";
import { quoteId } from "./queries";

const CHAR_TYPES = ["char", "varchar", "text", "tinytext", "mediumtext", "longtext"];

const SIZED_TYPES = ["char", "varchar", "binary", "varbinary"];

function formatDataType(col: TableColumnDetail): string {
  const t = col.dataType.toLowerCase();
  if (SIZED_TYPES.includes(t) && col.maxLength != null && col.maxLength > 0) {
    return `${col.dataType}(${col.maxLength})`;
  }
  if (["decimal", "numeric"].includes(t)) {
    if (col.numericPrecision != null && col.numericScale != null) {
      return `${col.dataType}(${col.numericPrecision}, ${col.numericScale})`;
    }
  }
  return col.dataType;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function qualified(schema: string, table: string): string {
  return schema ? `${quoteId(schema)}.${quoteId(table)}` : quoteId(table);
}

export const mysqlDdl: DdlBuilders = {
  formatDataType,

  isCollatableType: (dataType) => CHAR_TYPES.includes(dataType.split("(")[0].toLowerCase().trim()),

  createTable(schema, tableName, columns, extended) {
    const lines: string[] = columns.map((col) => {
      const ext = extended?.get(col.columnName);
      if (ext?.isComputed && ext.computedDefinition) {
        const storage = ext.isPersisted ? "STORED" : "VIRTUAL";
        return `  ${quoteId(col.columnName)} ${formatDataType(col)} GENERATED ALWAYS AS (${ext.computedDefinition}) ${storage}`;
      }
      const parts: string[] = [`  ${quoteId(col.columnName)}`, formatDataType(col)];
      parts.push(col.isNullable ? "NULL" : "NOT NULL");
      if (col.columnDefault != null && !col.isIdentity) parts.push(`DEFAULT ${col.columnDefault}`);
      if (col.isIdentity) parts.push("AUTO_INCREMENT");
      if (ext?.columnComment) parts.push(`COMMENT '${esc(ext.columnComment)}'`);
      return parts.join(" ");
    });

    const pkCols = columns.filter(
      (c) => c.isPrimaryKey && !extended?.get(c.columnName)?.isComputed
    );
    if (pkCols.length > 0) {
      lines.push(`  PRIMARY KEY (${pkCols.map((c) => quoteId(c.columnName)).join(", ")})`);
    }

    return `CREATE TABLE ${qualified(schema, tableName)} (\n${lines.join(",\n")}\n);`;
  },

  indexes(schema, tableName, indexes: IndexInfo[]) {
    const statements: string[] = [];

    for (const idx of indexes) {
      // PRIMARY is emitted as part of CREATE TABLE.
      if (idx.isPrimaryKey || idx.indexName === "PRIMARY") continue;

      const keyCols = idx.columns
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => quoteId(c.name));
      if (keyCols.length === 0) continue;

      const unique = idx.isUnique ? "UNIQUE " : "";
      const using =
        idx.type && !["BTREE", "NONCLUSTERED"].includes(idx.type.toUpperCase())
          ? ` USING ${idx.type.toUpperCase()}`
          : "";
      statements.push(
        `CREATE ${unique}INDEX ${quoteId(idx.indexName)}\n    ON ${qualified(schema, tableName)} (${keyCols.join(", ")})${using};`
      );
    }

    return statements.join("\n\n");
  },

  missingIndex(equalityColumns, inequalityColumns, includedColumns, schema, tableName, idx) {
    const parts: string[] = [];
    if (equalityColumns) parts.push(equalityColumns);
    if (inequalityColumns) parts.push(inequalityColumns);
    // MySQL has no INCLUDE clause; covering columns join the key.
    if (includedColumns) parts.push(includedColumns);
    return `CREATE INDEX ${quoteId(`IX_Missing_${idx}`)}\nON ${qualified(schema, tableName)} (${parts.join(", ")});`;
  },

  alterColumn(schema, tableName, colName, dataTypeFull, isNullable, collation) {
    const collatePart = collation ? ` COLLATE ${collation}` : "";
    const nullPart = isNullable ? "NULL" : "NOT NULL";
    return `ALTER TABLE ${qualified(schema, tableName)} MODIFY COLUMN ${quoteId(colName)} ${dataTypeFull}${collatePart} ${nullPart};`;
  },

  setDefault(schema, tableName, colName, _oldConstraintName, newDefault) {
    const target = `ALTER TABLE ${qualified(schema, tableName)} ALTER COLUMN ${quoteId(colName)}`;
    return newDefault && newDefault.trim()
      ? `${target} SET DEFAULT ${newDefault};`
      : `${target} DROP DEFAULT;`;
  },

  columnComment() {
    // A MySQL column comment can only be set by restating the column's full
    // definition, which this builder does not have. The `columnComments`
    // capability is off, so the UI never offers it.
    throw new Error("MySQL column comments must be set via MODIFY COLUMN with the full definition");
  },

  dropIndex(schema, tableName, indexName) {
    return `DROP INDEX ${quoteId(indexName)} ON ${qualified(schema, tableName)};`;
  },

  alterIndex(schema, tableName, _indexName, action) {
    if (action === "DISABLE") {
      throw new Error("MySQL does not support disabling an individual index");
    }
    return `OPTIMIZE TABLE ${qualified(schema, tableName)};`;
  },

  dropConstraint(schema, tableName, constraintName) {
    return `ALTER TABLE ${qualified(schema, tableName)} DROP FOREIGN KEY ${quoteId(constraintName)};`;
  },

  renameColumn(schema, tableName, oldName, newName) {
    return `ALTER TABLE ${qualified(schema, tableName)} RENAME COLUMN ${quoteId(oldName)} TO ${quoteId(newName)};`;
  },

  allowedStatementPrefixes: [
    "ALTER TABLE ",
    "DROP INDEX ",
    "CREATE INDEX ",
    "CREATE UNIQUE INDEX ",
    "OPTIMIZE TABLE ",
  ],
};
