import DatabaseHistory from "@/components/dashboard/DatabaseHistory";

export default function HistoryPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Snapshot History</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Daily snapshots of database statistics — track growth and performance changes over time.
        </p>
      </div>
      <DatabaseHistory />
    </div>
  );
}
