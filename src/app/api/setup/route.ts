import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { isSetupComplete, writeConfig, getDataDir, getExistingDataFiles } from "@/lib/config";

const setupSchema = z.object({
  sessionSecret: z.string().min(32, "Session secret must be at least 32 characters"),
});

export async function GET() {
  return NextResponse.json({
    setupComplete: isSetupComplete(),
    dataDir: getDataDir(),
    suggestedSecret: randomBytes(32).toString("hex"),
    existingFiles: getExistingDataFiles(),
  });
}

export async function POST(req: NextRequest) {
  if (isSetupComplete()) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 409 });
  }

  try {
    const body = await req.json();
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    writeConfig(parsed.data.sessionSecret);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
