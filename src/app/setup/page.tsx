import { redirect } from "next/navigation";
import { isSetupComplete, getDataDir, getExistingDataFiles } from "@/lib/config";
import { randomBytes } from "crypto";
import SetupForm from "./SetupForm";

export default function SetupPage() {
  if (isSetupComplete()) {
    redirect("/");
  }

  const suggestedSecret = randomBytes(32).toString("hex");
  const dataDir = getDataDir();
  const existingFiles = getExistingDataFiles();

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            DB Insight — First-Run Setup
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            One-time configuration before you can connect to databases
          </p>
        </div>
        <SetupForm
          suggestedSecret={suggestedSecret}
          dataDir={dataDir}
          existingFiles={existingFiles}
        />
      </div>
    </div>
  );
}
