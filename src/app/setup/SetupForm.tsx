"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  suggestedSecret: string;
  dataDir: string;
  existingFiles: { hasKey: boolean; hasDatabase: boolean };
}

export default function SetupForm({ suggestedSecret, dataDir, existingFiles }: Props) {
  const hasExistingData = existingFiles.hasKey || existingFiles.hasDatabase;
  const [currentSecret, setCurrentSecret] = useState(suggestedSecret);
  const [useCustom, setUseCustom] = useState(false);
  const [customSecret, setCustomSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSecret = useCustom ? customSecret : currentSecret;

  function handleGenerate() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setCurrentSecret(hex);
    setUseCustom(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(activeSecret);
    toast.success("Copied to clipboard");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (activeSecret.length < 32) {
      setError("Session secret must be at least 32 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: activeSecret }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        setError(data.error ?? "Setup failed");
        return;
      }
      toast.success("Setup complete! Loading…");
      // Hard reload so the server picks up the new session secret from config.json
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Existing data notice */}
      {hasExistingData && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <p className="font-medium">Existing data detected</p>
          <p className="text-amber-700 dark:text-amber-300 text-xs">
            The following files were found in{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">
              {dataDir}
            </code>{" "}
            and will <strong>not</strong> be modified:
          </p>
          <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside space-y-0.5">
            {existingFiles.hasDatabase && <li>editor.db — your saved connections and query history</li>}
            {existingFiles.hasKey && <li>.key — your encryption key for stored passwords</li>}
          </ul>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Completing setup only writes{" "}
            <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">config.json</code>.
          </p>
        </div>
      )}

      {/* Session Secret */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Secret</CardTitle>
          <CardDescription>
            Signs encrypted session cookies. Keep it stable — changing it
            invalidates all active sessions. You can also pass it as a{" "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">
              SESSION_SECRET
            </code>{" "}
            env var to skip this wizard on future deployments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!useCustom ? (
            <div className="space-y-2">
              <Label>Generated secret</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={currentSecret}
                  className="font-mono text-xs flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  Copy
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                  New
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="custom-secret">Custom secret (min 32 chars)</Label>
              <Input
                id="custom-secret"
                value={customSecret}
                onChange={(e) => setCustomSecret(e.target.value)}
                placeholder="Enter your own session secret…"
                className="font-mono"
              />
              {customSecret.length > 0 && customSecret.length < 32 && (
                <p className="text-xs text-destructive">
                  {32 - customSecret.length} more character
                  {32 - customSecret.length !== 1 ? "s" : ""} needed
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setUseCustom(!useCustom)}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2"
          >
            {useCustom ? "Use generated secret instead" : "Enter my own secret"}
          </button>
        </CardContent>
      </Card>

      {/* Data Directory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Directory</CardTitle>
          <CardDescription>
            Where your database, encryption key, and config file are stored.
            Mount this path as a Docker volume so data persists across container
            restarts and updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Current path</Label>
            <Input readOnly value={dataDir} className="font-mono text-sm" />
          </div>
          <div className="rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 text-xs font-mono leading-5">
            <p className="text-zinc-500 font-sans mb-1 text-xs">
              Docker volume mount example:
            </p>
            <p>docker run \</p>
            <p className="pl-4">-v /your/host/path:/data \</p>
            <p className="pl-4">-p 3000:3000 \</p>
            <p className="pl-4">yourdockerhubuser/db-insight</p>
          </div>
          <p className="text-xs text-zinc-500">
            Set{" "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
              DATA_DIR
            </code>{" "}
            env var to use a different path inside the container (default:{" "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
              /data
            </code>
            ).
          </p>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Complete Setup"}
      </Button>
    </form>
  );
}
