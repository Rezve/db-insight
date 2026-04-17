"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Database, Loader2 } from "lucide-react";

interface HeaderProps {
  serverName: string;
  databaseName: string;
}

const MAX_SERVER_LABEL = 30;

function formatServerName(name: string): string {
  if (name.includes("://")) {
    try {
      return new URL(name).hostname;
    } catch {
      // fall through to plain-string handling
    }
  }
  return name.length > MAX_SERVER_LABEL
    ? name.slice(0, MAX_SERVER_LABEL) + "…"
    : name;
}

export default function Header({ serverName, databaseName }: HeaderProps) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/disconnect", { method: "POST" });
      toast.success("Disconnected");
      router.push("/connect");
    } catch {
      toast.error("Failed to disconnect");
      setDisconnecting(false);
    }
  }

  return (
    <header className="flex h-9 items-center gap-2 border-b bg-background px-3">
      <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-xs font-medium truncate" title={serverName}>
          {formatServerName(serverName)}
        </span>
        <span className="text-muted-foreground text-xs">/</span>
        <Badge variant="secondary" className="font-mono text-xs">
          {databaseName}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        title="Disconnect"
      >
        {disconnecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogOut className="h-3.5 w-3.5" />
        )}
      </Button>
    </header>
  );
}
