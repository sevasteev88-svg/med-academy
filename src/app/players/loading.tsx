export default function PlayersLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-pulse text-slate-100">
      {/* Page Title & Action Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-sky-500/15">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-slate-800 rounded-lg" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-slate-800/60 rounded-lg" />
          <div className="h-9 w-36 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* Filters Bar Skeleton */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
        <div className="h-9 flex-1 min-w-[200px] bg-slate-800/70 rounded-lg" />
        <div className="h-9 w-32 bg-slate-800/50 rounded-lg" />
        <div className="h-9 w-32 bg-slate-800/50 rounded-lg" />
      </div>

      {/* Team Header Skeleton */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 bg-slate-800 rounded" />
          <div className="h-5 w-20 bg-slate-800/60 rounded-full" />
        </div>

        {/* Player Cards Grid Skeleton */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-slate-900/70 border border-blue-900/25 rounded-xl p-3.5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-slate-800 rounded" />
                    <div className="h-3 w-16 bg-slate-800/60 rounded" />
                  </div>
                </div>
                <div className="h-5 w-14 bg-slate-800/50 rounded-full" />
              </div>
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <div className="h-3 w-20 bg-slate-800/40 rounded" />
                <div className="h-3 w-16 bg-slate-800/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
