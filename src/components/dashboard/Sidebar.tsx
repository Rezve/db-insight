"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Braces,
  Code2,
  Table2,
  LayoutDashboard,
  ChevronDown,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  Search,
  X,
} from "lucide-react";
import type { TableInfo, StoredProcedureInfo } from "@/types/db";

interface SidebarProps {
  tables: TableInfo[];
  storedProcedures: StoredProcedureInfo[];
}

export default function Sidebar({ tables, storedProcedures }: SidebarProps) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<"tables" | "procedures" | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [procedureSearch, setProcedureSearch] = useState("");

  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/editor", label: "SQL Editor", icon: Code2 },
    { href: "/dashboard/history", label: "History", icon: History },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  const toggleTables = () => {
    if (activeSection === "tables") {
      setActiveSection(null);
      setTableSearch("");
    } else {
      setActiveSection("tables");
      setProcedureSearch("");
    }
  };

  const toggleProcedures = () => {
    if (activeSection === "procedures") {
      setActiveSection(null);
      setProcedureSearch("");
    } else {
      setActiveSection("procedures");
      setTableSearch("");
    }
  };

  const tq = tableSearch.toLowerCase();
  const filteredTables = tableSearch
    ? tables.filter(
        (t) =>
          t.name.toLowerCase().includes(tq) ||
          t.schema.toLowerCase().includes(tq),
      )
    : tables;

  const pq = procedureSearch.toLowerCase();
  const filteredProcedures = procedureSearch
    ? storedProcedures.filter(
        (p) =>
          p.name.toLowerCase().includes(pq) ||
          p.schema.toLowerCase().includes(pq),
      )
    : storedProcedures;

  return (
    <aside
      className={cn(
        "flex-shrink-0 border-r bg-zinc-50 dark:bg-zinc-900 flex flex-col transition-all duration-200 overflow-hidden",
        isCollapsed ? "w-12" : "w-60",
      )}
    >
      {/* Nav */}
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
              isCollapsed && "mx-auto",
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
                isCollapsed
                  ? "justify-center px-2 py-2"
                  : "gap-2 px-2 py-1.5 text-sm",
                pathname === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && label}
            </Link>
          ))}
        </nav>
      </div>

      {!isCollapsed && (
        <div className="flex-1 min-h-0 flex flex-col py-3">

          {/* Tables — always first */}
          <div className={cn("flex flex-col px-3", activeSection === "tables" && "flex-1 min-h-0")}>
            <button
              onClick={toggleTables}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 w-full hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  activeSection === "tables" && "rotate-180",
                )}
              />
              Tables ({tables.length})
            </button>
            {activeSection === "tables" && (
              <>
                <div className="relative mb-1.5 px-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  <input
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Filter tables…"
                    className="w-full pl-6 pr-5 py-1 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 border-0 outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
                  />
                  {tableSearch && (
                    <button
                      onClick={() => setTableSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <nav className="space-y-0.5 pr-2">
                    {filteredTables.map((table) => {
                      const href = `/dashboard/tables/${encodeURIComponent(table.fullName)}?tab=schema`;
                      const isActive = pathname === href;
                      return (
                        <Link
                          key={table.fullName}
                          href={href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors min-w-0",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
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
                    {filteredTables.length === 0 && (
                      <p className="px-2 py-2 text-xs text-muted-foreground">No tables found.</p>
                    )}
                  </nav>
                </ScrollArea>
              </>
            )}
          </div>

          {/* Stored Procedures — always second */}
          <div className={cn("flex flex-col px-3", activeSection === "procedures" && "flex-1 min-h-0")}>
            <button
              onClick={toggleProcedures}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 w-full hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  activeSection === "procedures" && "rotate-180",
                )}
              />
              Stored Procedures ({storedProcedures.length})
            </button>
            {activeSection === "procedures" && (
              <>
                <div className="relative mb-1.5 px-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  <input
                    value={procedureSearch}
                    onChange={(e) => setProcedureSearch(e.target.value)}
                    placeholder="Filter procedures…"
                    className="w-full pl-6 pr-5 py-1 text-xs rounded-md bg-zinc-100 dark:bg-zinc-800 border-0 outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
                  />
                  {procedureSearch && (
                    <button
                      onClick={() => setProcedureSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <nav className="space-y-0.5 pr-2">
                    {filteredProcedures.map((sp) => {
                      const href = `/dashboard/procedures/${encodeURIComponent(sp.fullName)}`;
                      const isActive = pathname === href;
                      return (
                        <Link
                          key={sp.fullName}
                          href={href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors min-w-0",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                          )}
                        >
                          <Braces className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate min-w-0 flex-1" title={sp.fullName}>
                            {sp.name}
                          </span>
                        </Link>
                      );
                    })}
                    {filteredProcedures.length === 0 && (
                      <p className="px-2 py-2 text-xs text-muted-foreground">No procedures found.</p>
                    )}
                  </nav>
                </ScrollArea>
              </>
            )}
          </div>

        </div>
      )}
    </aside>
  );
}
