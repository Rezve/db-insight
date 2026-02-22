import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/types/session";

export const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "db-analysis-session",
  cookieOptions: {
    secure: false,
    httpOnly: true,
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
