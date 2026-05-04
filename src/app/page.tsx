import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/config";

export default async function Home() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  const session = await getSession();
  if (session.connected && session.sessionId) {
    redirect("/dashboard");
  }
  redirect("/connect");
}
