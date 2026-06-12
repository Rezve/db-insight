import { NextResponse } from "next/server";

export async function POST() {
  setTimeout(() => process.exit(0), 500);
  return NextResponse.json({ ok: true });
}
