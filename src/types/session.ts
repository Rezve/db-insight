import type { DbEngine } from "@/lib/db/types";

export interface SessionData {
  sessionId?: string;
  connectionId?: string;
  connected?: boolean;
  /** Which engine this session is talking to — decides dialect and capabilities. */
  engine?: DbEngine;
  databaseName?: string;
  serverName?: string;
}
