import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/types/session";
import { getSessionSecret } from "@/lib/config";

export async function getSession() {
  const sessionOptions = {
    password: getSessionSecret(),
    cookieName: "db-analysis-session",
    cookieOptions: {
      secure: process.env.SECURE_COOKIES === "true",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 8, // 8 hours
    },
  };
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
