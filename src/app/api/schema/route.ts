import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSessionDriver, runIntrospection } from "@/lib/db";
import type {
  SchemaData,
  SchemaTable,
  SchemaRoutine,
  RoutineParameter,
} from "@/types/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.connected || !session.sessionId) {
      return NextResponse.json({ error: "Not connected" }, { status: 401 });
    }

    const driver = getSessionDriver(session.sessionId);
    const { introspection } = driver;

    const [colRows, routineRows, fkRows, paramRows] = await Promise.all([
      runIntrospection<{
        tableSchema: string;
        tableName: string;
        columnName: string;
        dataType: string;
        isNullable: string;
        maxLength: number | null;
      }>(session.sessionId, introspection.schemaColumns()),
      runIntrospection<{ schema: string; name: string; type: string }>(
        session.sessionId,
        introspection.schemaRoutines()
      ),
      runIntrospection<{
        sourceSchema: string;
        sourceTable: string;
        sourceColumn: string;
        targetSchema: string;
        targetTable: string;
        targetColumn: string;
      }>(session.sessionId, introspection.schemaForeignKeys()),
      runIntrospection<{
        schema: string;
        routineName: string;
        paramName: string;
        dataType: string;
        maxLength: number | null;
        isOutput: boolean;
        hasDefault: boolean;
        parameterId: number;
      }>(session.sessionId, introspection.schemaParameters()),
    ]);

    // Group columns by table
    const tableMap = new Map<string, SchemaTable>();
    for (const row of colRows) {
      const key = `${row.tableSchema}.${row.tableName}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, { schema: row.tableSchema, name: row.tableName, columns: [] });
      }
      tableMap.get(key)!.columns.push({
        name: row.columnName,
        dataType: row.dataType,
        isNullable: row.isNullable === "YES",
        maxLength: row.maxLength,
      });
    }

    // Attach FKs to columns
    for (const fk of fkRows) {
      const key = `${fk.sourceSchema}.${fk.sourceTable}`;
      const table = tableMap.get(key);
      if (!table) continue;
      const col = table.columns.find((c) => c.name === fk.sourceColumn);
      if (!col) continue;
      col.foreignKey = {
        targetSchema: fk.targetSchema,
        targetTable: fk.targetTable,
        targetColumn: fk.targetColumn,
      };
    }

    // Group parameters by routine (schema.name)
    const paramMap = new Map<string, RoutineParameter[]>();
    for (const p of paramRows) {
      const key = `${p.schema}.${p.routineName}`;
      if (!paramMap.has(key)) paramMap.set(key, []);
      paramMap.get(key)!.push({
        name: p.paramName,
        dataType: p.dataType,
        maxLength: p.maxLength,
        isOutput: Boolean(p.isOutput),
        hasDefault: Boolean(p.hasDefault),
      });
    }

    function withParams(r: { schema: string; name: string }, type: "PROCEDURE" | "FUNCTION"): SchemaRoutine {
      const params = paramMap.get(`${r.schema}.${r.name}`);
      return { schema: r.schema, name: r.name, type, parameters: params };
    }

    const data: SchemaData = {
      tables: Array.from(tableMap.values()),
      storedProcedures: routineRows
        .filter((r) => r.type === "PROCEDURE")
        .map((r) => withParams(r, "PROCEDURE")),
      functions: routineRows
        .filter((r) => r.type === "FUNCTION")
        .map((r) => withParams(r, "FUNCTION")),
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
