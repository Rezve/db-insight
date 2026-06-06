import type { TableColumnDetail } from "@/types/analysis";

export function formatDataType(col: TableColumnDetail): string {
  const t = col.dataType.toLowerCase();
  if (["char", "varchar", "nchar", "nvarchar", "binary", "varbinary"].includes(t)) {
    if (col.maxLength === -1) return `${col.dataType}(max)`;
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
