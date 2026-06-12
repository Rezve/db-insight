import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  try {
    execSync("git fetch origin", { stdio: "ignore", timeout: 10000 });

    const countStr = execSync("git rev-list HEAD..origin/HEAD --count", {
      encoding: "utf8",
      timeout: 5000,
    }).trim();

    const commitsBehind = parseInt(countStr, 10);

    return NextResponse.json({
      isGitRepo: true,
      updateAvailable: commitsBehind > 0,
      commitsBehind,
    });
  } catch {
    return NextResponse.json({ isGitRepo: false });
  }
}
