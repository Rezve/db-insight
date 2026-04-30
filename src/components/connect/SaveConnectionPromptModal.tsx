"use client";

import { useState } from "react";
import { X, CheckCircle } from "lucide-react";

interface SaveConnectionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SaveData) => Promise<void>;
  databaseName: string;
  serverName: string;
}

interface SaveData {
  name: string;
  tag?: string;
  color?: string;
  database_name: string;
  dontShowAgain: boolean;
}

const COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6366F1", // indigo
];

export function SaveConnectionPromptModal({
  isOpen,
  onClose,
  onSave,
  databaseName,
  serverName,
}: SaveConnectionPromptModalProps) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Connection name is required");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onSave({
        name: name.trim(),
        tag: tag.trim() || undefined,
        color,
        database_name: databaseName,
        dontShowAgain,
      });

      setName("");
      setTag("");
      setColor(COLORS[0]);
      setDontShowAgain(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save connection");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-950 shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Save This Connection?
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide mb-2">
              Connected to
            </p>
            <p className="text-sm font-mono text-gray-900 dark:text-gray-100">
              {serverName}
            </p>
            <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-1">
              Database: {databaseName}
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Connection Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production DB"
              disabled={isLoading}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="tag" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tag (optional)
            </label>
            <input
              id="tag"
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g., Analytics, Production"
              disabled={isLoading}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Color Tag
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={isLoading}
                  className={`h-8 w-8 rounded-lg transition-all ${
                    color === c ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-950" : "hover:opacity-80"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              disabled={isLoading}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Don't ask again for this server</span>
          </label>

          <div className="flex gap-2 border-t border-gray-200 dark:border-gray-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isLoading ? "Saving..." : "Save Connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
