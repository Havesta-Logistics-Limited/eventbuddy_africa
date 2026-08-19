/** Base placeholder block — Tailwind's built-in `animate-pulse`, no custom keyframe
 *  needed. Compose with the shaped variants below, or use directly for one-offs. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

/** Stands in for a dashboard-style event card while events are still loading. */
export function EventCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <div className="pt-4 mt-2 border-t border-slate-100 flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

/** Stands in for one row in a plain list/table (admin rosters, org lists, lead rows). */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-100">
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

/** Stands in for a small stat tile (dashboard stat row). */
export function StatTileSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-10" />
    </div>
  );
}
