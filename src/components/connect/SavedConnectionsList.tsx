"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SavedConnection {
  id: string;
  name: string;
  tag?: string;
  color?: string;
  server: string;
  port?: number;
  auth_mode: string;
  username?: string;
}

interface SavedConnectionsListProps {
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export function SavedConnectionsList({ onSelect, isLoading }: SavedConnectionsListProps) {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const res = await fetch("/api/connections");
        if (!res.ok) throw new Error("Failed to fetch connections");
        const data = await res.json();
        setConnections(data.connections || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load connections");
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this connection?")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/connections?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete connection");
      setConnections(connections.filter((c) => c.id !== id));
      toast.success("Connection deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete connection");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-600 dark:text-gray-400">Loading connections...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (connections.length === 0) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">No saved connections yet. Create one below.</div>;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Saved Connections</label>
      <div className="grid gap-2">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="group relative flex items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 transition-colors hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-gray-800"
          >
            <button
              onClick={() => onSelect(conn.id)}
              disabled={isLoading || deleting === conn.id}
              className="flex-1 flex flex-col items-start p-3 text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-2 w-full">
                {conn.color && (
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: conn.color }}
                  />
                )}
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{conn.name}</div>
                  {conn.tag && <div className="text-xs text-gray-600 dark:text-gray-400">{conn.tag}</div>}
                </div>
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 ml-5">
                {conn.server}
                {conn.port && `:${conn.port}`}
                {conn.username && ` (${conn.username})`}
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => handleDelete(e, conn.id)}
              disabled={deleting === conn.id || isLoading}
              className="mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete connection"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
