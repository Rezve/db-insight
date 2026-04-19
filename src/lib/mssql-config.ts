export type AuthMode = "sql" | "windows";
export type DbEngine = "sqlserver"; // future: "postgres" | "mysql"

export interface ConnectInput {
  engine: DbEngine;
  authMode: AuthMode;
  server: string;       // "host", "host\INSTANCE", "host,port"
  port?: number;        // optional — undefined lets tedious use SQL Browser or default
  username?: string;    // required for sql auth only
  password?: string;    // required for sql auth only
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export function buildMssqlConfig(input: ConnectInput, database: string) {
  let serverHost = input.server.trim();
  let instanceName: string | undefined;
  let resolvedPort: number | undefined = input.port;

  // Support "server,port" (SQL Server native format)
  const commaIdx = serverHost.indexOf(",");
  if (commaIdx !== -1) {
    const portStr = serverHost.slice(commaIdx + 1).trim();
    serverHost = serverHost.slice(0, commaIdx).trim();
    const parsed = parseInt(portStr, 10);
    if (!isNaN(parsed)) resolvedPort = parsed;
  } else {
    // Support "host\INSTANCE"
    const backslashIdx = serverHost.indexOf("\\");
    if (backslashIdx !== -1) {
      instanceName = serverHost.slice(backslashIdx + 1).trim();
      serverHost = serverHost.slice(0, backslashIdx).trim();
    }
  }

  return {
    server: serverHost,
    ...(resolvedPort ? { port: resolvedPort } : {}),
    database,
    ...(input.authMode === "sql"
      ? { user: input.username, password: input.password }
      : {}),
    options: {
      encrypt: input.encrypt,
      trustServerCertificate: input.trustServerCertificate,
      ...(instanceName ? { instanceName } : {}),
      ...(input.authMode === "windows" ? { trustedConnection: true } : {}),
    },
    connectionTimeout: 15000,
    requestTimeout: 0,
  };
}
