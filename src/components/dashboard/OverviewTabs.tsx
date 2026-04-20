"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, Table2 } from "lucide-react";
import TableOverview from "@/components/dashboard/TableOverview";
import DatabaseSummary from "@/components/dashboard/DatabaseSummary";
import type { TableInfo } from "@/types/db";

interface OverviewTabsProps {
  baseTables: TableInfo[];
  views: TableInfo[];
}

export default function OverviewTabs({ baseTables, views }: OverviewTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") ?? "summary";

  function handleTabChange(value: string) {
    router.replace(`/dashboard?tab=${value}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="summary" className="flex items-center gap-1.5">
          <BarChart2 className="h-4 w-4" />
          Summary
        </TabsTrigger>
        <TabsTrigger value="tables" className="flex items-center gap-1.5">
          <Table2 className="h-4 w-4" />
          Tables
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <DatabaseSummary />
      </TabsContent>

      <TabsContent value="tables">
        <TableOverview baseTables={baseTables} views={views} />
      </TabsContent>
    </Tabs>
  );
}
