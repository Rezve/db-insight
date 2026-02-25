"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Code2, Table2, LayoutDashboard } from "lucide-react";
import type { TableInfo } from "@/types/db";

interface SidebarProps {
  tables: TableInfo[];
}

export default function Sidebar({ tables }: SidebarProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/editor", label: "SQL Editor", icon: Code2 },
  ];

  return (
    <aside className="w-60 flex-shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          Navigation
        </p>
        <nav className="space-y-0.5">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                pathname === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          Tables ({tables.length})
        </p>
        <ScrollArea className="flex-1 min-h-0">
          <nav className="space-y-0.5 pr-2">
            {tables.map((table) => {
              const href = `/dashboard/tables/${encodeURIComponent(table.fullName)}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={table.fullName}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors min-w-0",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  )}
                >
                  <Table2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate min-w-0 flex-1" title={table.fullName}>
                    {table.name}
                  </span>
                  {table.type === "VIEW" && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 flex-shrink-0">
                      V
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </div>
    </aside>
  );
}
