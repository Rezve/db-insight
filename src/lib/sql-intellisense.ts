import type { SchemaData, SchemaTable, SchemaRoutine, ColumnInfo } from "@/types/db";

// ---------- Tokenizer ----------

export type TokenKind =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "operator"
  | "punct"
  | "dot"
  | "comma"
  | "lparen"
  | "rparen"
  | "semicolon"
  | "go"
  | "comment";

export interface SqlToken {
  kind: TokenKind;
  value: string;
  // Raw text as it appears in source (including brackets/quotes).
  raw: string;
  start: number; // absolute offset, inclusive
  end: number;   // absolute offset, exclusive
}

const KEYWORDS = new Set(
  [
    "SELECT", "FROM", "WHERE", "JOIN", "INNER", "LEFT", "RIGHT", "FULL",
    "OUTER", "CROSS", "ON", "AS", "AND", "OR", "NOT", "IN", "LIKE",
    "BETWEEN", "IS", "NULL", "GROUP", "ORDER", "BY", "HAVING", "TOP",
    "DISTINCT", "UNION", "ALL", "EXCEPT", "INTERSECT", "WITH", "INTO",
    "VALUES", "INSERT", "UPDATE", "DELETE", "SET", "EXEC", "EXECUTE",
    "DECLARE", "IF", "ELSE", "BEGIN", "END", "WHILE", "CASE", "WHEN",
    "THEN", "RETURN", "CREATE", "ALTER", "DROP", "TABLE", "VIEW",
    "INDEX", "PROCEDURE", "FUNCTION", "USE", "NOLOCK", "OFFSET", "FETCH",
    "NEXT", "ROWS", "ONLY", "OVER", "PARTITION", "DESC", "ASC", "OUTPUT",
  ]
);

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_@#]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_@#$]/.test(ch);
}

export function tokenize(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const n = sql.length;
  let i = 0;

  while (i < n) {
    const ch = sql[i];

    // whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // line comment
    if (ch === "-" && sql[i + 1] === "-") {
      const start = i;
      while (i < n && sql[i] !== "\n") i++;
      tokens.push({ kind: "comment", value: sql.slice(start, i), raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // block comment
    if (ch === "/" && sql[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      if (i < n) i += 2;
      tokens.push({ kind: "comment", value: sql.slice(start, i), raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // single-quoted string (SQL escape is '')
    if (ch === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      tokens.push({ kind: "string", value: sql.slice(start, i), raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // bracketed identifier [foo]
    if (ch === "[") {
      const start = i;
      i++;
      let inner = "";
      while (i < n) {
        if (sql[i] === "]" && sql[i + 1] === "]") { inner += "]"; i += 2; continue; }
        if (sql[i] === "]") { i++; break; }
        inner += sql[i];
        i++;
      }
      tokens.push({ kind: "identifier", value: inner, raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // double-quoted identifier "foo"
    if (ch === '"') {
      const start = i;
      i++;
      let inner = "";
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') { inner += '"'; i += 2; continue; }
        if (sql[i] === '"') { i++; break; }
        inner += sql[i];
        i++;
      }
      tokens.push({ kind: "identifier", value: inner, raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // number
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < n && /[0-9.]/.test(sql[i])) i++;
      tokens.push({ kind: "number", value: sql.slice(start, i), raw: sql.slice(start, i), start, end: i });
      continue;
    }

    // identifier / keyword
    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentPart(sql[i])) i++;
      const raw = sql.slice(start, i);
      const up = raw.toUpperCase();
      // GO as a batch separator only when it's the only token on its line.
      if (up === "GO" && isOnOwnLine(sql, start, i)) {
        tokens.push({ kind: "go", value: "GO", raw, start, end: i });
      } else if (KEYWORDS.has(up)) {
        tokens.push({ kind: "keyword", value: up, raw, start, end: i });
      } else {
        tokens.push({ kind: "identifier", value: raw, raw, start, end: i });
      }
      continue;
    }

    // punctuation / operators
    if (ch === ".") { tokens.push({ kind: "dot", value: ".", raw: ".", start: i, end: i + 1 }); i++; continue; }
    if (ch === ",") { tokens.push({ kind: "comma", value: ",", raw: ",", start: i, end: i + 1 }); i++; continue; }
    if (ch === ";") { tokens.push({ kind: "semicolon", value: ";", raw: ";", start: i, end: i + 1 }); i++; continue; }
    if (ch === "(") { tokens.push({ kind: "lparen", value: "(", raw: "(", start: i, end: i + 1 }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "rparen", value: ")", raw: ")", start: i, end: i + 1 }); i++; continue; }

    // Multi-char operators
    const two = sql.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "||", "+=", "-=", "*=", "/="].includes(two)) {
      tokens.push({ kind: "operator", value: two, raw: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (/[=<>+\-*/%&|^~!?]/.test(ch)) {
      tokens.push({ kind: "operator", value: ch, raw: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    // Unknown char — skip
    tokens.push({ kind: "punct", value: ch, raw: ch, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

function isOnOwnLine(sql: string, start: number, end: number): boolean {
  // Looks back: only whitespace between start and preceding newline.
  let j = start - 1;
  while (j >= 0 && sql[j] !== "\n") {
    if (!/\s/.test(sql[j])) return false;
    j--;
  }
  // Looks forward: only whitespace until newline.
  let k = end;
  while (k < sql.length && sql[k] !== "\n") {
    if (!/\s/.test(sql[k])) return false;
    k++;
  }
  return true;
}

// ---------- Schema Index ----------

export interface SchemaIndex {
  // Keys are lowercased. "schema.name" is always present; bare "name" only when unambiguous.
  tablesByKey: Map<string, SchemaTable>;
  // Indexed by lowercased "schema.name".
  columnsByTable: Map<string, Map<string, ColumnInfo>>;
  proceduresByKey: Map<string, SchemaRoutine>;
  functionsByKey: Map<string, SchemaRoutine>;
  // Lowercased schema names with at least one table.
  schemaNames: Set<string>;
  // For Levenshtein candidates.
  allTables: SchemaTable[];
  allProcedures: SchemaRoutine[];
}

export function buildSchemaIndex(data: SchemaData): SchemaIndex {
  const tablesByKey = new Map<string, SchemaTable>();
  const columnsByTable = new Map<string, Map<string, ColumnInfo>>();
  const proceduresByKey = new Map<string, SchemaRoutine>();
  const functionsByKey = new Map<string, SchemaRoutine>();
  const schemaNames = new Set<string>();

  // Count name collisions so bare-name lookups only work when unambiguous.
  const bareCount = new Map<string, number>();
  for (const t of data.tables) {
    bareCount.set(t.name.toLowerCase(), (bareCount.get(t.name.toLowerCase()) ?? 0) + 1);
  }

  for (const t of data.tables) {
    const qKey = `${t.schema}.${t.name}`.toLowerCase();
    tablesByKey.set(qKey, t);
    if ((bareCount.get(t.name.toLowerCase()) ?? 0) === 1) {
      tablesByKey.set(t.name.toLowerCase(), t);
    }
    schemaNames.add(t.schema.toLowerCase());

    const colMap = new Map<string, ColumnInfo>();
    for (const c of t.columns) {
      colMap.set(c.name.toLowerCase(), c);
    }
    columnsByTable.set(qKey, colMap);
  }

  for (const p of data.storedProcedures) {
    proceduresByKey.set(`${p.schema}.${p.name}`.toLowerCase(), p);
    proceduresByKey.set(p.name.toLowerCase(), p);
  }
  for (const f of data.functions) {
    functionsByKey.set(`${f.schema}.${f.name}`.toLowerCase(), f);
    functionsByKey.set(f.name.toLowerCase(), f);
  }

  return {
    tablesByKey,
    columnsByTable,
    proceduresByKey,
    functionsByKey,
    schemaNames,
    allTables: data.tables,
    allProcedures: data.storedProcedures,
  };
}

function tableKeyOf(t: SchemaTable): string {
  return `${t.schema}.${t.name}`.toLowerCase();
}

// ---------- Query context analyzer ----------

export type Clause =
  | "select"
  | "from"
  | "join"
  | "where"
  | "groupby"
  | "orderby"
  | "having"
  | "on"
  | "set"
  | "exec"
  | "into"
  | "update"
  | "insert_columns"
  | "unknown";

export interface FromTable {
  table: SchemaTable;
  alias?: string;
  // Raw identifier text used in source (for unknown tables).
  rawRef: string;
  known: boolean;
}

export interface QueryContext {
  clause: Clause;
  fromTables: FromTable[];
  dotQualifier?: string;
  currentWord: { text: string; start: number; end: number };
  // For signature help.
  execProcedureKey?: string;
  execArgIndex?: number;
  // Populated when clause === "insert_columns".
  insertTable?: SchemaTable;
  insertedColumns?: string[];
}

// Returns the indices of tokens bounding the current statement [startIdx, endIdx).
function statementBounds(tokens: SqlToken[], caretTokenIdx: number): { start: number; end: number } {
  let start = 0;
  for (let i = caretTokenIdx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === "semicolon" || t.kind === "go") { start = i + 1; break; }
  }
  let end = tokens.length;
  for (let i = caretTokenIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "semicolon" || t.kind === "go") { end = i; break; }
  }
  return { start, end };
}

// Finds the token index at or just before the caret offset.
function tokenIndexAt(tokens: SqlToken[], offset: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start >= offset) return i;
  }
  return tokens.length;
}

// Parse FROM/JOIN clauses within [start, end) to extract tables + aliases.
function parseFromTables(tokens: SqlToken[], start: number, end: number, index: SchemaIndex): FromTable[] {
  const out: FromTable[] = [];
  // Keywords that terminate a FROM/JOIN table list.
  const terminators = new Set([
    "WHERE", "GROUP", "ORDER", "HAVING", "UNION", "EXCEPT", "INTERSECT",
    "ON", "INTO", "VALUES", "SET", "RETURN", "WHEN", "THEN", "ELSE", "END",
    "OFFSET", "FETCH",
  ]);
  const joinKeywords = new Set(["FROM", "JOIN"]);

  let i = start;
  while (i < end) {
    const t = tokens[i];
    if (t.kind === "keyword" && joinKeywords.has(t.value)) {
      i++;
      // Consume a comma-separated list of table refs until we hit a terminator or another JOIN/FROM.
      while (i < end) {
        // Skip leading JOIN modifiers like INNER/LEFT/RIGHT/OUTER/CROSS/FULL.
        if (tokens[i].kind === "keyword" && ["INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS"].includes(tokens[i].value)) {
          i++;
          continue;
        }
        if (tokens[i].kind === "keyword" && joinKeywords.has(tokens[i].value)) break;
        if (tokens[i].kind === "keyword" && terminators.has(tokens[i].value)) break;
        if (tokens[i].kind === "semicolon" || tokens[i].kind === "go") break;

        // Expect identifier (schema).(table)
        if (tokens[i].kind !== "identifier") { i++; continue; }
        const first = tokens[i];
        let schema: string | undefined;
        let name: string;
        let rawRef: string;
        if (tokens[i + 1]?.kind === "dot" && tokens[i + 2]?.kind === "identifier") {
          schema = first.value;
          name = tokens[i + 2].value;
          rawRef = `${first.raw}.${tokens[i + 2].raw}`;
          i += 3;
        } else {
          name = first.value;
          rawRef = first.raw;
          i += 1;
        }

        // Optional alias: bare identifier, or AS + identifier.
        let alias: string | undefined;
        if (tokens[i]?.kind === "keyword" && tokens[i].value === "AS") {
          i++;
          if (tokens[i]?.kind === "identifier") { alias = tokens[i].value; i++; }
        } else if (
          tokens[i]?.kind === "identifier" &&
          tokens[i + 1]?.kind !== "dot"
        ) {
          alias = tokens[i].value;
          i++;
        }

        // Resolve table via index.
        const qKey = schema ? `${schema.toLowerCase()}.${name.toLowerCase()}` : name.toLowerCase();
        const table = index.tablesByKey.get(qKey);
        if (table) {
          out.push({ table, alias, rawRef, known: true });
        } else {
          // Unknown table — create a placeholder entry so diagnostics can fire later.
          out.push({
            table: { schema: schema ?? "", name, columns: [] },
            alias,
            rawRef,
            known: false,
          });
        }

        // Skip comma to next table.
        if (tokens[i]?.kind === "comma") { i++; continue; }
        break;
      }
      continue;
    }
    i++;
  }
  return out;
}

// Detects whether the caret is inside an INSERT INTO tbl (col1, col2, ...) column list.
// Returns { insertTable, insertedColumns } or null if not in that context.
function parseInsertContext(
  tokens: SqlToken[],
  stmtStart: number,
  caretIdx: number,
  index: SchemaIndex
): { insertTable: SchemaTable | undefined; insertedColumns: string[] } | null {
  // Walk backwards looking for an unmatched opening paren.
  let parenDepth = 0;
  let openParenIdx = -1;
  for (let i = caretIdx - 1; i >= stmtStart; i--) {
    const t = tokens[i];
    if (t.kind === "rparen") { parenDepth++; continue; }
    if (t.kind === "lparen") {
      if (parenDepth > 0) { parenDepth--; continue; }
      openParenIdx = i;
      break;
    }
    // Hit VALUES or INSERT at depth 0 — not inside a column list paren.
    if (parenDepth === 0 && t.kind === "keyword" &&
        (t.value === "VALUES" || t.value === "INSERT")) return null;
  }
  if (openParenIdx === -1) return null;

  // Confirm the opening paren is preceded by: identifier [dot identifier] INTO INSERT
  let j = openParenIdx - 1;
  if (tokens[j]?.kind !== "identifier") return null;
  const tableName = tokens[j].value; j--;
  let schemaName: string | undefined;
  if (tokens[j]?.kind === "dot" && tokens[j - 1]?.kind === "identifier") {
    j--; // skip dot
    schemaName = tokens[j].value; j--;
  }
  if (tokens[j]?.kind !== "keyword" || tokens[j].value !== "INTO") return null; j--;
  if (tokens[j]?.kind !== "keyword" || tokens[j].value !== "INSERT") return null;

  // Resolve the table in the schema index.
  const key = schemaName
    ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
    : tableName.toLowerCase();
  const insertTable = index.tablesByKey.get(key);

  // Collect identifiers already typed between the opening paren and the current word start.
  const caretWordStart = tokens[caretIdx - 1]?.kind === "identifier"
    ? tokens[caretIdx - 1].start
    : caretIdx;
  const insertedColumns: string[] = [];
  for (let k = openParenIdx + 1; k < tokens.length; k++) {
    if (tokens[k].start >= caretWordStart) break;
    if (tokens[k].kind === "identifier") {
      insertedColumns.push(tokens[k].value.toLowerCase());
    }
  }

  return { insertTable, insertedColumns };
}

// Walk backwards from caret position and find the most recent clause keyword.
function detectClause(tokens: SqlToken[], stmtStart: number, caretIdx: number): Clause {
  // We iterate backwards ignoring comments. When we hit a clause keyword, we stop.
  let parenDepth = 0;
  for (let i = caretIdx - 1; i >= stmtStart; i--) {
    const t = tokens[i];
    if (t.kind === "rparen") parenDepth++;
    else if (t.kind === "lparen") {
      if (parenDepth > 0) parenDepth--;
      continue;
    }
    if (parenDepth > 0) continue;

    if (t.kind !== "keyword") continue;
    switch (t.value) {
      case "SELECT": return "select";
      case "FROM": return "from";
      case "JOIN": return "join";
      case "ON": return "on";
      case "WHERE": return "where";
      case "HAVING": return "having";
      case "EXEC":
      case "EXECUTE": return "exec";
      case "INTO": return "into";
      case "UPDATE": return "update";
      case "SET": return "set";
      case "GROUP": {
        // "GROUP BY"
        if (tokens[i + 1]?.kind === "keyword" && tokens[i + 1].value === "BY") return "groupby";
        continue;
      }
      case "ORDER": {
        if (tokens[i + 1]?.kind === "keyword" && tokens[i + 1].value === "BY") return "orderby";
        continue;
      }
      case "BY": {
        // Look at the previous keyword (GROUP / ORDER / PARTITION).
        for (let j = i - 1; j >= stmtStart; j--) {
          if (tokens[j].kind === "keyword") {
            if (tokens[j].value === "GROUP") return "groupby";
            if (tokens[j].value === "ORDER") return "orderby";
            break;
          }
        }
        continue;
      }
    }
  }
  return "unknown";
}

export function analyzeQueryAt(sql: string, offset: number, index: SchemaIndex): QueryContext {
  const tokens = tokenize(sql);
  const caretIdx = tokenIndexAt(tokens, offset);
  const { start, end } = statementBounds(tokens, caretIdx);

  // Determine the word under the caret.
  let wordText = "";
  let wordStart = offset;
  let wordEnd = offset;
  if (caretIdx > 0) {
    const prev = tokens[caretIdx - 1];
    if (prev.kind === "identifier" && prev.end >= offset) {
      wordText = sql.slice(prev.start, offset);
      wordStart = prev.start;
      wordEnd = offset;
    }
  }

  // Detect `alias.` or `table.` right before caret.
  let dotQualifier: string | undefined;
  // Index of token immediately before the caret word (accounting for identifier under caret).
  let beforeIdx = caretIdx - 1;
  if (wordText && beforeIdx >= 0 && tokens[beforeIdx].kind === "identifier" && tokens[beforeIdx].end >= offset) {
    beforeIdx--;
  }
  if (beforeIdx >= 0 && tokens[beforeIdx].kind === "dot") {
    const qualTok = tokens[beforeIdx - 1];
    if (qualTok?.kind === "identifier") {
      dotQualifier = qualTok.value;
    }
  }

  const fromTables = parseFromTables(tokens, start, end, index);
  let clause = detectClause(tokens, start, caretIdx);

  // INSERT column list detection overrides the clause when applicable.
  let insertTable: SchemaTable | undefined;
  let insertedColumns: string[] | undefined;
  const insertCtx = parseInsertContext(tokens, start, caretIdx, index);
  if (insertCtx !== null) {
    clause = "insert_columns";
    insertTable = insertCtx.insertTable;
    insertedColumns = insertCtx.insertedColumns;
  }

  // EXEC context — procedure key + active argument index.
  let execProcedureKey: string | undefined;
  let execArgIndex: number | undefined;
  {
    // Find the most recent EXEC/EXECUTE before the caret.
    let execIdx = -1;
    for (let i = caretIdx - 1; i >= start; i--) {
      if (tokens[i].kind === "keyword" && (tokens[i].value === "EXEC" || tokens[i].value === "EXECUTE")) {
        execIdx = i;
        break;
      }
    }
    if (execIdx >= 0) {
      // Parse proc identifier.
      let j = execIdx + 1;
      let schema: string | undefined;
      let name: string | undefined;
      if (tokens[j]?.kind === "identifier") {
        if (tokens[j + 1]?.kind === "dot" && tokens[j + 2]?.kind === "identifier") {
          schema = tokens[j].value;
          name = tokens[j + 2].value;
          j += 3;
        } else {
          name = tokens[j].value;
          j += 1;
        }
      }
      if (name) {
        const qKey = schema ? `${schema.toLowerCase()}.${name.toLowerCase()}` : name.toLowerCase();
        if (index.proceduresByKey.has(qKey)) execProcedureKey = qKey;
      }
      // Count commas between the proc and the caret, at paren depth ≤ 1 relative to an optional opening paren.
      // Supports both `EXEC sp_Foo a, b` and `EXEC sp_Foo(a, b)`.
      let depth = 0;
      let commas = 0;
      for (let k = j; k < caretIdx; k++) {
        const t = tokens[k];
        if (t.kind === "lparen") depth++;
        else if (t.kind === "rparen") depth--;
        else if (t.kind === "comma" && depth <= 1) commas++;
      }
      execArgIndex = commas;
    }
  }

  return {
    clause,
    fromTables,
    dotQualifier,
    currentWord: { text: wordText, start: wordStart, end: wordEnd },
    execProcedureKey,
    execArgIndex,
    insertTable,
    insertedColumns,
  };
}

// Resolve a dotted qualifier to: (a) aliased table, (b) bare/qualified table, (c) schema, (d) nothing.
export function resolveQualifier(
  qualifier: string,
  fromTables: FromTable[],
  index: SchemaIndex
): { kind: "table"; table: SchemaTable } | { kind: "schema"; schema: string } | null {
  const lower = qualifier.toLowerCase();
  // 1. Alias match.
  for (const ft of fromTables) {
    if (ft.alias && ft.alias.toLowerCase() === lower && ft.known) {
      return { kind: "table", table: ft.table };
    }
  }
  // 2. Bare table name among in-scope FROM tables.
  for (const ft of fromTables) {
    if (ft.known && ft.table.name.toLowerCase() === lower) {
      return { kind: "table", table: ft.table };
    }
  }
  // 3. Known table anywhere (bare or qualified).
  const t = index.tablesByKey.get(lower);
  if (t) return { kind: "table", table: t };
  // 4. Schema name.
  if (index.schemaNames.has(lower)) return { kind: "schema", schema: lower };
  return null;
}

// ---------- Diagnostics ----------

export interface Diagnostic {
  message: string;
  start: number;
  end: number;
}

export function collectDiagnostics(sql: string, index: SchemaIndex): Diagnostic[] {
  const tokens = tokenize(sql);
  const diags: Diagnostic[] = [];

  // Walk token stream, statement by statement.
  let stmtStart = 0;
  const stmtBoundaries: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "semicolon" || tokens[i].kind === "go") {
      stmtBoundaries.push([stmtStart, i]);
      stmtStart = i + 1;
    }
  }
  if (stmtStart < tokens.length) stmtBoundaries.push([stmtStart, tokens.length]);

  for (const [s, e] of stmtBoundaries) {
    const fromTables = parseFromTables(tokens, s, e, index);

    // 1. Flag unknown tables in FROM/JOIN/UPDATE/INTO.
    for (const ft of fromTables) {
      if (ft.known) continue;
      // Find the token(s) for this rawRef to highlight.
      const tok = findTokenByRaw(tokens, s, e, ft.rawRef);
      if (!tok) continue;
      const suggestion = nearestTableName(ft.table.name, index);
      const label = ft.table.schema ? `${ft.table.schema}.${ft.table.name}` : ft.table.name;
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      diags.push({
        message: `Unknown table '${label}'.${hint}`,
        start: tok.start,
        end: tok.end,
      });
    }

    // 2. Flag dotted references where qualifier or column is unresolved.
    // 3. Flag bare columns that don't resolve to any in-scope table.
    for (let i = s; i < e; i++) {
      const t = tokens[i];
      if (t.kind !== "identifier") continue;

      // Skip identifiers that are the table targets of FROM/JOIN/UPDATE/INTO/EXEC (already handled).
      if (isTableTargetPosition(tokens, i, s)) continue;
      // Skip identifiers that appear as aliases defined in FROM/JOIN.
      if (isAliasPosition(tokens, i, fromTables)) continue;
      // Skip parameter/variable references (@foo, #foo).
      if (t.value.startsWith("@") || t.value.startsWith("#")) continue;

      const prev = tokens[i - 1];
      const prevPrev = tokens[i - 2];
      const next = tokens[i + 1];

      // Dotted: qualifier . column
      if (prev?.kind === "dot" && prevPrev?.kind === "identifier") {
        const qualRes = resolveQualifier(prevPrev.value, fromTables, index);
        if (!qualRes) {
          // Unknown qualifier — flag the qualifier token.
          const suggestion = nearestFromAliasOrTable(prevPrev.value, fromTables, index);
          const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
          diags.push({
            message: `Unknown reference '${prevPrev.value}'.${hint}`,
            start: prevPrev.start,
            end: prevPrev.end,
          });
          continue;
        }
        if (qualRes.kind === "table") {
          const colMap = index.columnsByTable.get(tableKeyOf(qualRes.table));
          if (colMap && !colMap.has(t.value.toLowerCase()) && t.value !== "*") {
            const suggestion = nearestColumn(t.value, qualRes.table);
            const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
            diags.push({
              message: `Column '${t.value}' does not exist on ${qualRes.table.schema}.${qualRes.table.name}.${hint}`,
              start: t.start,
              end: t.end,
            });
          }
        }
        // Schema qualifier -> any table in schema is OK; we can't verify here.
        continue;
      }

      // Skip the qualifier itself in "qualifier . column".
      if (next?.kind === "dot") continue;

      // Bare identifier — only validate when it's in a column-position context.
      if (!isColumnPosition(tokens, i, s)) continue;

      // Resolve against any in-scope known table.
      if (fromTables.length === 0) continue; // no tables, can't validate

      let foundIn: SchemaTable | null = null;
      for (const ft of fromTables) {
        if (!ft.known) continue;
        const colMap = index.columnsByTable.get(tableKeyOf(ft.table));
        if (colMap?.has(t.value.toLowerCase())) {
          foundIn = ft.table;
          break;
        }
      }
      if (!foundIn) {
        // It might be a function name (CAST, COUNT, SUM etc. already keywords, but user funcs are identifiers).
        if (next?.kind === "lparen") continue;
        const suggestion = nearestColumnAcross(t.value, fromTables, index);
        const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
        diags.push({
          message: `Unknown column '${t.value}'.${hint}`,
          start: t.start,
          end: t.end,
        });
      }
    }
  }

  return diags;
}

function findTokenByRaw(tokens: SqlToken[], s: number, e: number, rawRef: string): SqlToken | null {
  // rawRef may be "schema.table" — search for two adjacent identifiers with dot.
  if (rawRef.includes(".")) {
    for (let i = s; i < e - 2; i++) {
      if (
        tokens[i].kind === "identifier" &&
        tokens[i + 1].kind === "dot" &&
        tokens[i + 2].kind === "identifier" &&
        `${tokens[i].raw}.${tokens[i + 2].raw}` === rawRef
      ) {
        return { ...tokens[i], end: tokens[i + 2].end, raw: rawRef, value: tokens[i + 2].value };
      }
    }
  } else {
    for (let i = s; i < e; i++) {
      if (tokens[i].kind === "identifier" && tokens[i].raw === rawRef) return tokens[i];
    }
  }
  return null;
}

function isTableTargetPosition(tokens: SqlToken[], idx: number, stmtStart: number): boolean {
  // True if the preceding non-comment keyword in [stmtStart, idx) is FROM/JOIN/UPDATE/INTO/EXEC/EXECUTE
  // and no punct other than dots/commas has interrupted the table list.
  for (let j = idx - 1; j >= stmtStart; j--) {
    const t = tokens[j];
    if (t.kind === "comment") continue;
    if (t.kind === "dot" || t.kind === "comma" || t.kind === "identifier" || t.kind === "keyword") {
      if (t.kind === "keyword") {
        if (["FROM", "JOIN", "INTO", "UPDATE", "EXEC", "EXECUTE"].includes(t.value)) return true;
        if (["INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "AS"].includes(t.value)) continue;
        return false;
      }
      continue;
    }
    return false;
  }
  return false;
}

function isAliasPosition(tokens: SqlToken[], idx: number, fromTables: FromTable[]): boolean {
  const tok = tokens[idx];
  for (const ft of fromTables) {
    if (ft.alias && ft.alias.toLowerCase() === tok.value.toLowerCase()) {
      // Aliases also legitimately appear in ON/WHERE etc. We only want to skip them in those cases too.
      return true;
    }
  }
  return false;
}

function isColumnPosition(tokens: SqlToken[], idx: number, stmtStart: number): boolean {
  // Find the most recent clause keyword. Column-positions are after SELECT/WHERE/ON/GROUP BY/ORDER BY/HAVING/SET.
  let parenDepth = 0;
  for (let j = idx - 1; j >= stmtStart; j--) {
    const t = tokens[j];
    if (t.kind === "rparen") parenDepth++;
    else if (t.kind === "lparen") {
      if (parenDepth > 0) parenDepth--;
      continue;
    }
    if (parenDepth > 0) continue;
    if (t.kind !== "keyword") continue;
    switch (t.value) {
      case "SELECT":
      case "WHERE":
      case "ON":
      case "HAVING":
      case "SET":
        return true;
      case "BY": {
        for (let k = j - 1; k >= stmtStart; k--) {
          if (tokens[k].kind === "keyword") {
            return tokens[k].value === "GROUP" || tokens[k].value === "ORDER";
          }
        }
        return false;
      }
      case "FROM":
      case "JOIN":
      case "INTO":
      case "UPDATE":
      case "EXEC":
      case "EXECUTE":
      case "VALUES":
        return false;
    }
  }
  return false;
}

// ---------- Similarity helpers ----------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array<number>(bl + 1);
  const curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

function nearest(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const threshold = Math.min(2, Math.max(1, Math.floor(name.length / 4)));
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= threshold ? best : null;
}

function nearestTableName(name: string, index: SchemaIndex): string | null {
  return nearest(name, index.allTables.map((t) => t.name));
}

function nearestColumn(name: string, table: SchemaTable): string | null {
  return nearest(name, table.columns.map((c) => c.name));
}

function nearestColumnAcross(name: string, fromTables: FromTable[], _index: SchemaIndex): string | null {
  const pool: string[] = [];
  for (const ft of fromTables) {
    if (!ft.known) continue;
    for (const c of ft.table.columns) pool.push(c.name);
  }
  return nearest(name, pool);
}

function nearestFromAliasOrTable(name: string, fromTables: FromTable[], index: SchemaIndex): string | null {
  const pool: string[] = [];
  for (const ft of fromTables) {
    if (ft.alias) pool.push(ft.alias);
    if (ft.known) pool.push(ft.table.name);
  }
  for (const t of index.allTables) pool.push(t.name);
  return nearest(name, pool);
}
