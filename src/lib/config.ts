import fs from "fs";
import path from "path";

export interface ConfigJson {
  configVersion: number;
  sessionSecret: string;
  setupCompletedAt: string;
}

const CONFIG_VERSION = 1;

export function getDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  if (process.env.NODE_ENV === "production") {
    return "/data";
  }
  return path.resolve(process.cwd(), "data");
}

function getConfigPath(): string {
  return path.join(getDataDir(), "config.json");
}

export function isSetupComplete(): boolean {
  try {
    return fs.existsSync(getConfigPath());
  } catch {
    return false;
  }
}

export function readConfig(): ConfigJson | null {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    return JSON.parse(raw) as ConfigJson;
  } catch {
    return null;
  }
}

export function writeConfig(sessionSecret: string): void {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    throw new Error("config.json already exists — refusing to overwrite");
  }
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const config: ConfigJson = {
    configVersion: CONFIG_VERSION,
    sessionSecret,
    setupCompletedAt: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getExistingDataFiles(): { hasKey: boolean; hasDatabase: boolean } {
  const dir = getDataDir();
  return {
    hasKey: fs.existsSync(path.join(dir, ".key")),
    hasDatabase: fs.existsSync(path.join(dir, "editor.db")),
  };
}

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  const config = readConfig();
  if (config?.sessionSecret) {
    return config.sessionSecret;
  }
  // Fallback used only during setup wizard — not for real sessions
  return "setup_mode_placeholder_secret_32x";
}
