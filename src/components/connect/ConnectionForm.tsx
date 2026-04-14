"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, ChevronRight, ArrowLeft, Check, Server, KeyRound, Monitor, FileKey, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthMode, DbEngine } from "@/lib/mssql-config";
import type { EnvDbConfig } from "@/app/api/env-config/route";

type Step = "credentials" | "database";

interface Credentials {
  engine: DbEngine;
  authMode: AuthMode;
  server: string;
  port: string;       // string in UI, coerced to number or undefined on submit
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

const ENGINE_OPTIONS: { value: DbEngine; label: string; description: string }[] = [
  { value: "sqlserver", label: "SQL Server / Azure SQL", description: "Microsoft SQL Server, Azure SQL Database, Azure SQL Managed Instance" },
];

export default function ConnectionForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [loading, setLoading] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [filter, setFilter] = useState("");
  const [envPrefilled, setEnvPrefilled] = useState(false);
  const [envDatabase, setEnvDatabase] = useState<string | null>(null);

  const [creds, setCreds] = useState<Credentials>({
    engine: "sqlserver",
    authMode: "sql",
    server: "",
    port: "",
    username: "",
    password: "",
    encrypt: false,
    trustServerCertificate: true,
  });

  useEffect(() => {
    fetch("/api/env-config")
      .then((r) => r.json())
      .then(({ config }: { config: EnvDbConfig | null }) => {
        if (!config) return;
        setCreds((prev) => ({
          ...prev,
          server: config.server,
          port: config.port != null ? String(config.port) : "",
          authMode: config.authMode,
          username: config.username ?? "",
          password: config.password ?? "",
          encrypt: config.encrypt,
          trustServerCertificate: config.trustServerCertificate,
        }));
        setEnvPrefilled(true);
        if (config.database) setEnvDatabase(config.database);
      })
      .catch(() => {/* silently ignore — env config is optional */});
  }, []);

  function setField<K extends keyof Credentials>(field: K, value: Credentials[K]) {
    setCreds((prev) => ({ ...prev, [field]: value }));
  }

  function handleInputChange(field: keyof Credentials) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setField(field, value as Credentials[typeof field]);
    };
  }

  function buildPayload() {
    return {
      engine: creds.engine,
      authMode: creds.authMode,
      server: creds.server.trim(),
      port: creds.port ? Number(creds.port) : undefined,
      username: creds.authMode === "sql" ? creds.username.trim() : undefined,
      password: creds.authMode === "sql" ? creds.password : undefined,
      encrypt: creds.encrypt,
      trustServerCertificate: creds.trustServerCertificate,
    };
  }

  async function handleFetchDatabases(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        const dbs: string[] = data.databases ?? [];
        setDatabases(dbs);
        // Prefer DB_DATABASE from .env, else first non-system db
        const SYSTEM = new Set(["master", "model", "msdb", "tempdb"]);
        setSelectedDb(
          (envDatabase && dbs.includes(envDatabase))
            ? envDatabase
            : dbs.find((d) => !SYSTEM.has(d)) ?? dbs[0] ?? ""
        );
        setFilter("");
        setStep("database");
      }
    } catch {
      toast.error("Network error — is the app server running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!selectedDb) return;
    setLoading(true);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), database: selectedDb }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Connected to ${data.databaseName}`);
        router.push("/dashboard");
      } else {
        toast.error(data.error ?? "Connection failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  const SYSTEM_DBS = new Set(["master", "model", "msdb", "tempdb"]);
  const filteredDbs = databases.filter((db) =>
    db.toLowerCase().includes(filter.toLowerCase())
  );
  const userDbs = filteredDbs.filter((db) => !SYSTEM_DBS.has(db));
  const systemDbs = filteredDbs.filter((db) => SYSTEM_DBS.has(db));

  const isSqlAuth = creds.authMode === "sql";

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Database className="h-5 w-5" />
          {step === "credentials" ? "New Connection" : "Select Database"}
          {envPrefilled && (
            <Badge variant="secondary" className="ml-auto text-[10px] gap-1 text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800">
              <FileKey className="h-3 w-3" />
              Pre-filled from .env
            </Badge>
          )}
        </CardTitle>
        {/* Step indicator */}
        <CardDescription>
          <span className="flex items-center gap-2 text-xs">
            <span className={cn("flex items-center gap-1", step === "credentials" ? "text-primary font-medium" : "text-muted-foreground")}>
              <span className={cn("rounded-full w-4 h-4 flex items-center justify-center border text-[10px]",
                step === "credentials" ? "border-primary text-primary" : "bg-primary border-primary text-primary-foreground")}>
                {step === "database" ? <Check className="h-2.5 w-2.5" /> : "1"}
              </span>
              Credentials
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={cn("flex items-center gap-1", step === "database" ? "text-primary font-medium" : "text-muted-foreground")}>
              <span className={cn("rounded-full w-4 h-4 flex items-center justify-center border text-[10px]",
                step === "database" ? "border-primary text-primary" : "border-muted-foreground")}>
                2
              </span>
              Database
            </span>
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "credentials" ? (
          <form onSubmit={handleFetchDatabases} className="space-y-4">
            {/* Engine selector */}
            <div className="space-y-1.5">
              <Label>Database Engine</Label>
              <div className="flex flex-col gap-1.5">
                {ENGINE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField("engine", opt.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                      creds.engine === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/50"
                    )}
                  >
                    <Server className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Auth mode */}
            <div className="space-y-1.5">
              <Label>Authentication</Label>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setField("authMode", "sql")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors",
                    isSqlAuth
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-background hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  SQL Server Auth
                </button>
                <button
                  type="button"
                  onClick={() => setField("authMode", "windows")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors border-l",
                    !isSqlAuth
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-background hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Windows Auth
                </button>
              </div>
              {!isSqlAuth && (
                <p className="text-xs text-muted-foreground">
                  Uses the Windows/domain credentials of the process running this app.
                </p>
              )}
            </div>

            {/* Server + Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="server">Server</Label>
                <Input
                  id="server"
                  placeholder="localhost\SQLEXPRESS"
                  value={creds.server}
                  onChange={handleInputChange("server")}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[10px] text-muted-foreground">
                  Formats: <code>host</code> · <code>host\INSTANCE</code> · <code>host,port</code>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port">Port <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="auto"
                  value={creds.port}
                  onChange={handleInputChange("port")}
                />
              </div>
            </div>

            {/* SQL Auth credentials — hidden for Windows Auth */}
            {isSqlAuth && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="sa"
                    value={creds.username}
                    onChange={handleInputChange("username")}
                    required
                    autoComplete="username"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={creds.password}
                    onChange={handleInputChange("password")}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </>
            )}

            {/* Options */}
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Options</p>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={creds.encrypt} onChange={handleInputChange("encrypt")} className="rounded" />
                <span>Encrypt connection <span className="text-xs text-muted-foreground">(required for Azure SQL)</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={creds.trustServerCertificate} onChange={handleInputChange("trustServerCertificate")} className="rounded" />
                <span>Trust server certificate <span className="text-xs text-muted-foreground">(for local / self-signed)</span></span>
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</>
              ) : (
                <>Next — fetch databases <ChevronRight className="ml-1 h-4 w-4" /></>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Credentials are held in server memory only — never written to disk or the browser.
            </p>

            {!envPrefilled && (
              <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Tip:</span> Add{" "}
                  <code className="text-[11px]">DB_SERVER</code>,{" "}
                  <code className="text-[11px]">DB_USERNAME</code>, and{" "}
                  <code className="text-[11px]">DB_PASSWORD</code> to your{" "}
                  <code className="text-[11px]">.env</code> file to auto-fill this form on every visit.
                </span>
              </div>
            )}
          </form>
        ) : (
          <div className="space-y-4">
            {/* Connection summary */}
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border text-sm">
              <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-mono text-xs truncate">{creds.server}{creds.port ? `:${creds.port}` : ""}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {creds.authMode === "windows" ? "Windows Auth" : creds.username}
              </span>
              <Badge variant="secondary" className="text-[10px] ml-auto flex-shrink-0">
                {databases.length} db{databases.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {/* Filter */}
            {databases.length > 6 && (
              <Input
                placeholder="Filter databases…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            )}

            {/* Database list */}
            <div className="space-y-1 max-h-72 overflow-y-auto rounded-md border p-1">
              {userDbs.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">
                    User Databases ({userDbs.length})
                  </p>
                  {userDbs.map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => setSelectedDb(db)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                        selectedDb === db
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <Database className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{db}</span>
                      {selectedDb === db && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </>
              )}

              {systemDbs.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1 pt-2">
                    System Databases
                  </p>
                  {systemDbs.map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => setSelectedDb(db)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 text-muted-foreground",
                        selectedDb === db
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <Database className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{db}</span>
                      {selectedDb === db && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </>
              )}

              {filteredDbs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No databases match &quot;{filter}&quot;
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("credentials")} disabled={loading}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button className="flex-1" onClick={handleConnect} disabled={!selectedDb || loading}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</>
                ) : (
                  <>Connect to <span className="font-mono ml-1">{selectedDb}</span></>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
