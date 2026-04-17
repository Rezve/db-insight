"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorFontSize } from "@/hooks/use-editor-font-size";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize, min, max } = useEditorFontSize();

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
    </div>
  );
}
