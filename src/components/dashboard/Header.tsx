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
    <header className="flex h-14 items-center gap-3 border-b bg-background px-6">
      <Database className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{serverName}</span>
        <span className="text-muted-foreground">/</span>
        <Badge variant="secondary" className="font-mono text-xs">
          {databaseName}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="text-muted-foreground hover:text-destructive"
      >
        {disconnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <LogOut className="h-4 w-4 mr-1" />
            Disconnect
          </>
        )}
      </Button>
    </header>
  );
}
