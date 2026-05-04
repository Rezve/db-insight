import { NextResponse } from "next/server";
import { getDataDir, isSetupComplete } from "@/lib/config";
import fs from "fs";
import packageJson from "../../../../package.json";

export async function GET() {
  try {
    const dataDir = getDataDir();
    return NextResponse.json({
      status: "ok",
      appVersion: packageJson.version,
      setupComplete: isSetupComplete(),
      dataDir: fs.existsSync(dataDir) ? "accessible" : "missing",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
