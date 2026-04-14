import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Table2 } from "lucide-react";
import type { TableInfo } from "@/types/db";

interface TableCardProps {
  table: TableInfo;
  variant?: "grid" | "list";
}

function formatSize(sizeGB: number) {
  if (sizeGB >= 1) return `${sizeGB.toFixed(2)} GB`;
  if (sizeGB * 1024 >= 1) return `${(sizeGB * 1024).toFixed(1)} MB`;
  return `${(sizeGB * 1024 * 1024).toFixed(0)} KB`;
}

export default function TableCard({ table, variant = "grid" }: TableCardProps) {
  const href = `/dashboard/tables/${encodeURIComponent(table.fullName)}`;

  if (variant === "list") {
    return (
      <Link href={href} className="block group">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all">
          <Table2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-medium truncate">{table.name}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              {table.schema}
            </Badge>
            {table.type === "VIEW" && (
              <Badge variant="secondary" className="text-xs">
                VIEW
              </Badge>
            )}
            {table.sizeGB != null && (
              <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                {formatSize(table.sizeGB)}
              </span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="block group">
      <Card className="transition-all hover:shadow-md hover:border-primary/30 h-full py-2.5 gap-2">
        <CardHeader className="px-3 pb-1.5">
          <CardTitle className="text-sm font-medium flex items-center gap-2 justify-between overflow-hidden">
            <span className="flex items-center gap-2 min-w-0">
              <Table2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{table.name}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              {table.schema}
            </Badge>
            {table.type === "VIEW" && (
              <Badge variant="secondary" className="text-xs">
                VIEW
              </Badge>
            )}
            {table.sizeGB != null && (
              <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                {formatSize(table.sizeGB)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
