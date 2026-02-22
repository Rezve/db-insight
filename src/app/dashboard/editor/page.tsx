import SqlEditor from "@/components/editor/SqlEditor";

export default function EditorPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 border-b">
        <h1 className="text-lg font-semibold">SQL Editor</h1>
        <p className="text-xs text-muted-foreground">
          Execute queries against your database. Results are capped at 1,000 rows.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <SqlEditor />
      </div>
    </div>
  );
}
