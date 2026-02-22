import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Table2 } from "lucide-react";
import type { TableInfo } from "@/types/db";

interface TableCardProps {
  table: TableInfo;
}

export default function TableCard({ table }: TableCardProps) {
  const href = `/dashboard/tables/${encodeURIComponent(table.fullName)}`;

  return (
    <Link href={href} className="block group">
      <Card className="transition-all hover:shadow-md hover:border-primary/30 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2 min-w-0">
              <Table2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{table.name}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              {table.schema}
            </Badge>
            {table.type === "VIEW" && (
              <Badge variant="secondary" className="text-xs">
                VIEW
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
