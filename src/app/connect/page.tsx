import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ConnectionForm from "@/components/connect/ConnectionForm";

export default async function ConnectPage() {
  const session = await getSession();
  if (session.connected && session.sessionId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            DB Analysis Tool
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Connect to your Azure SQL / SQL Server database
          </p>
        </div>
        <ConnectionForm />
      </div>
    </div>
  );
}
