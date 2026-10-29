export default function Loading() {
  return (
    <div className="relative min-h-screen text-slate-100 p-4 md:p-8 animate-pulse">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-sky-500/15 gap-4">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-800/80 rounded" />
            <div className="h-7 w-64 bg-slate-800 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-28 bg-slate-800/60 rounded-lg" />
            <div className="h-9 w-36 bg-slate-800/80 rounded-lg" />
          </div>
        </div>

        {/* Stat Cards Grid Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-slate-900/60 border border-blue-900/25 rounded-lg p-3 space-y-2"
            >
              <div className="h-3 w-16 bg-slate-800/70 rounded" />
              <div className="h-7 w-12 bg-slate-800 rounded" />
              <div className="h-3 w-24 bg-slate-800/50 rounded" />
            </div>
          ))}
        </div>

        {/* Content Panels Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-blue-900/25 rounded-xl p-5 space-y-4">
            <div className="h-5 w-40 bg-slate-800 rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-800/40 rounded-lg border border-slate-800/60" />
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-blue-900/25 rounded-xl p-5 space-y-4">
            <div className="h-5 w-44 bg-slate-800 rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-800/40 rounded-lg border border-slate-800/60" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
