"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

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
    </div>
  );
}
