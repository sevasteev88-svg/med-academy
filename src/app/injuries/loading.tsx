export default function InjuriesLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-pulse text-slate-100">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-sky-500/15">
        <div className="space-y-2">
          <div className="h-8 w-44 bg-slate-800 rounded-lg" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="h-9 w-40 bg-slate-800 rounded-lg" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-900/60 border border-blue-900/25 rounded-lg p-3 space-y-2">
            <div className="h-3 w-20 bg-slate-800/60 rounded" />
            <div className="h-7 w-10 bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Injuries List Skeleton */}
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-slate-900/60 border border-blue-900/25 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-slate-800 rounded" />
                  <div className="h-3 w-24 bg-slate-800/60 rounded" />
                </div>
              </div>
              <div className="h-6 w-20 bg-slate-800/60 rounded-full" />
            </div>
            <div className="h-10 bg-slate-800/30 rounded-lg border border-slate-800/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
