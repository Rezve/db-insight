"use client";

import { useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TableCard from "@/components/dashboard/TableCard";
import type { TableInfo } from "@/types/db";

interface TableOverviewProps {
  baseTables: TableInfo[];
  views: TableInfo[];
}

export default function TableOverview({ baseTables, views }: TableOverviewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.toLowerCase();
  const filteredTables = baseTables.filter(
    (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
  );
  const filteredViews = views.filter(
    (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
  );

  const isSearching = searchQuery.length > 0;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Database Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isSearching
              ? `Showing ${filteredTables.length} of ${baseTables.length} tables, ${filteredViews.length} of ${views.length} views`
              : `${baseTables.length} tables, ${views.length} views — click any to start analysis`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tables..."
              className="h-8 w-48 pl-8 pr-7 text-sm"
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {filteredTables.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Tables
          </h2>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredTables.map((table) => (
                <TableCard key={table.fullName} table={table} variant="grid" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredTables.map((table) => (
                <TableCard key={table.fullName} table={table} variant="list" />
              ))}
            </div>
          )}
        </section>
      )}

      {filteredViews.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Views
          </h2>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredViews.map((table) => (
                <TableCard key={table.fullName} table={table} variant="grid" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredViews.map((table) => (
                <TableCard key={table.fullName} table={table} variant="list" />
              ))}
            </div>
          )}
        </section>
      )}

      {isSearching && filteredTables.length === 0 && filteredViews.length === 0 && (
        <p className="text-muted-foreground text-sm">No tables match &ldquo;{searchQuery}&rdquo;.</p>
      )}

      {!isSearching && baseTables.length === 0 && views.length === 0 && (
        <p className="text-muted-foreground text-sm">No tables found in this database.</p>
      )}
    </div>
  );
}
