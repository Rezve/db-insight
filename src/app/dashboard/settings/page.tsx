"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Minus, Plus, Database, ArrowUpCircle, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorFontSize } from "@/hooks/use-editor-font-size";
import { useEditorThemeContext } from "@/contexts/editor-theme-context";
import { useSessionCacheContext } from "@/contexts/session-cache-context";
import { useUpdateContext } from "@/contexts/update-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize, min, max } = useEditorFontSize();
  const { themeId, setThemeId, options: editorThemeOptions } = useEditorThemeContext();
  const lightThemes = editorThemeOptions.filter((t) => t.id !== "auto" && t.kind === "light");
  const darkThemes = editorThemeOptions.filter((t) => t.id !== "auto" && t.kind === "dark");
  const { enabled, setEnabled } = useSessionCacheContext();
  const {
    autoCheckEnabled,
    setAutoCheckEnabled,
    updateAvailable,
    commitsBehind,
    checking,
    lastChecked,
    checkNow,
  } = useUpdateContext();

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Theme
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Choose the appearance of the application.
        </p>
        <div className="flex gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm border transition-colors",
                theme === value
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          SQL Editor
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Adjust the font size of the SQL editor.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= min}
            className={cn(
              "flex items-center justify-center rounded-md w-8 h-8 border transition-colors",
              fontSize <= min
                ? "opacity-40 cursor-not-allowed border-transparent"
                : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
            aria-label="Decrease font size"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-sm w-16 text-center tabular-nums">
            {fontSize}px
          </span>
          <button
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= max}
            className={cn(
              "flex items-center justify-center rounded-md w-8 h-8 border transition-colors",
              fontSize >= max
                ? "opacity-40 cursor-not-allowed border-transparent"
                : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
            aria-label="Increase font size"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Editor Color Theme
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Choose the syntax highlighting theme for the SQL editor and code viewer.
        </p>
        <Select value={themeId} onValueChange={setThemeId}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (match app theme)</SelectItem>
            <SelectGroup>
              <SelectLabel>Light</SelectLabel>
              {lightThemes.map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Dark</SelectLabel>
              {darkThemes.map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Session Cache
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Cache table schema, index info, and stats in memory for this browser session.
          Speeds up navigation between tables — data loads instantly on revisit instead of
          fetching from the database each time. Use the sync icon in the header to reload
          fresh data at any time. Disable this when actively making schema changes.
        </p>
        <button
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm border transition-colors",
            enabled
              ? "bg-primary/10 text-primary border-primary/30 font-medium"
              : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
          )}
        >
          <Database className="h-4 w-4" />
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Updates
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Check for new commits on the origin repository. When enabled, the app
          checks once on startup and shows a badge in the header if updates are
          available.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm border transition-colors w-fit",
              autoCheckEnabled
                ? "bg-primary/10 text-primary border-primary/30 font-medium"
                : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Auto-check on startup: {autoCheckEnabled ? "On" : "Off"}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={checkNow}
              disabled={checking}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm border transition-colors",
                checking
                  ? "opacity-50 cursor-not-allowed border-transparent"
                  : "text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-4 w-4" />
              )}
              {checking ? "Checking…" : "Check Now"}
            </button>

            {!checking && lastChecked && (
              <span className="flex items-center gap-1.5 text-sm">
                {updateAvailable ? (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <ArrowUpCircle className="h-4 w-4" />
                    {commitsBehind} update{commitsBehind > 1 ? "s" : ""} available
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Up to date
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
