import { Skeleton } from "@/components/ui/skeleton";

export default function SidebarSkeleton() {
  return (
    <div className="flex h-full w-48 flex-col border-r bg-background px-3 py-4 gap-2 flex-shrink-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full rounded" />
      ))}
      <div className="mt-4 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full rounded" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    </div>
  );
}
