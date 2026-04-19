"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Code2, Table2, LayoutDashboard, ChevronDown, Settings, PanelLeftClose, PanelLeftOpen, History } from "lucide-react";
import type { TableInfo } from "@/types/db";

interface SidebarProps {
  tables: TableInfo[];
}

export default function Sidebar({ tables }: SidebarProps) {
  const pathname = usePathname();
  const [isTablesOpen, setIsTablesOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navLinks = [
    { href: "/dashboard",         label: "Overview",   icon: LayoutDashboard },
    { href: "/dashboard/editor",  label: "SQL Editor", icon: Code2 },
    { href: "/dashboard/history", label: "History",    icon: History },
    { href: "/dashboard/settings",label: "Settings",   icon: Settings },
  ];

  return (
    <aside className={cn(
      "flex-shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col transition-all duration-200 overflow-hidden",
      isCollapsed ? "w-12" : "w-60"
    )}>
      <div className="p-2 border-b">
        <div className="flex items-center justify-between px-2 py-1">
          {!isCollapsed && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Navigation
            </p>
          )}
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
              isCollapsed && "mx-auto"
            )}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <nav className="space-y-0.5">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={isCollapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-md transition-colors",
                isCollapsed ? "justify-center px-2 py-2" : "gap-2 px-2 py-1.5 text-sm",
                pathname === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && label}
            </Link>
          ))}
        </nav>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-hidden flex flex-col p-3">
          <button
            onClick={() => setIsTablesOpen((prev) => !prev)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 w-full hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isTablesOpen && "rotate-180")} />
            Tables ({tables.length})
          </button>
          {isTablesOpen && (
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
          )}
        </div>
      )}

    </aside>
  );
}
