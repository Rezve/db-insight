const DDL_RULES: Array<[RegExp, string]> = [
  [/\[[^\]]*\]/y, "color:#fbbf24"],
  [/\b(CREATE|TABLE|CONSTRAINT|PRIMARY|KEY|NOT|NULL|IDENTITY|DEFAULT|UNIQUE|NONCLUSTERED|CLUSTERED|INDEX|ON|INCLUDE|ALTER|COLUMN|DROP|DISABLE|REBUILD|EXEC|ADD|FOR)\b/iy, "color:#60a5fa;font-weight:600"],
  [/\b(INT|BIGINT|SMALLINT|TINYINT|VARCHAR|NVARCHAR|CHAR|NCHAR|TEXT|NTEXT|DECIMAL|NUMERIC|FLOAT|REAL|DATETIME2|DATETIME|DATE|TIME|BIT|MONEY|SMALLMONEY|UNIQUEIDENTIFIER|VARBINARY|BINARY|IMAGE|XML|MAX)\b/iy, "color:#34d399"],
  [/\b\d+\b/y, "color:#fb923c"],
  [/[(),;]/y, "color:#94a3b8"],
  [/\s+/y, ""],
  [/[\s\S]/y, "color:#e2e8f0"],
];

export function highlightDDL(ddl: string): string {
  let html = "";
  let pos = 0;
  while (pos < ddl.length) {
    for (const [re, style] of DDL_RULES) {
      re.lastIndex = pos;
      const m = re.exec(ddl);
      if (m) {
        const safe = m[0].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += style ? `<span style="${style}">${safe}</span>` : safe;
        pos += m[0].length;
        break;
      }
    }
  }
  return html;
}
