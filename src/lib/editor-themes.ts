import type { editor } from "monaco-editor";

export type EditorThemeKind = "light" | "dark";

export interface EditorThemeOption {
  id: string;
  label: string;
  kind: EditorThemeKind;
  /** Present for themes that need to be loaded on demand. Omitted for Monaco's own built-in themes. */
  loader?: () => Promise<{ default: unknown }>;
}

// Theme JSON files are vendored under ./monaco-theme-data (sourced from the MIT-licensed
// monaco-themes package) because that package's exports map blocks importing its theme
// files directly, and bundlers can't statically resolve a dynamic import path for them.
export const EDITOR_THEMES: EditorThemeOption[] = [
  { id: "auto", label: "Auto (match app theme)", kind: "light" },
  { id: "vs", label: "Light (Default)", kind: "light" },
  { id: "github-light", label: "GitHub Light", kind: "light", loader: () => import("./monaco-theme-data/github-light.json") },
  { id: "solarized-light", label: "Solarized Light", kind: "light", loader: () => import("./monaco-theme-data/solarized-light.json") },
  { id: "vs-dark", label: "Dark (Default)", kind: "dark" },
  { id: "dracula", label: "Dracula", kind: "dark", loader: () => import("./monaco-theme-data/dracula.json") },
  { id: "monokai", label: "Monokai", kind: "dark", loader: () => import("./monaco-theme-data/monokai.json") },
  { id: "night-owl", label: "Night Owl", kind: "dark", loader: () => import("./monaco-theme-data/night-owl.json") },
  { id: "nord", label: "Nord", kind: "dark", loader: () => import("./monaco-theme-data/nord.json") },
  { id: "github-dark", label: "GitHub Dark", kind: "dark", loader: () => import("./monaco-theme-data/github-dark.json") },
  { id: "solarized-dark", label: "Solarized Dark", kind: "dark", loader: () => import("./monaco-theme-data/solarized-dark.json") },
  { id: "cobalt", label: "Cobalt", kind: "dark", loader: () => import("./monaco-theme-data/cobalt.json") },
  { id: "tomorrow-night-blue", label: "Tomorrow Night Blue", kind: "dark", loader: () => import("./monaco-theme-data/tomorrow-night-blue.json") },
];

const loadedThemes = new Set<string>(["vs", "vs-dark"]);

export function resolveMonacoThemeId(themeId: string, isDark: boolean): string {
  if (themeId === "auto") return isDark ? "vs-dark" : "vs";
  return themeId;
}

export async function ensureMonacoThemeLoaded(
  monaco: typeof import("monaco-editor"),
  themeId: string
): Promise<void> {
  if (loadedThemes.has(themeId)) return;

  const option = EDITOR_THEMES.find((t) => t.id === themeId);
  if (!option?.loader) return;

  const themeData = await option.loader();
  monaco.editor.defineTheme(themeId, themeData.default as editor.IStandaloneThemeData);
  loadedThemes.add(themeId);
}
