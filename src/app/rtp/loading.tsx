export default function RtpLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-pulse text-slate-100">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-sky-500/15">
        <div className="space-y-2">
          <div className="h-8 w-60 bg-slate-800 rounded-lg" />
          <div className="h-4 w-80 bg-slate-800/60 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-slate-800/60 rounded-lg" />
          <div className="h-9 w-36 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* Pipeline Board / Columns Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((col) => (
          <div
            key={col}
            className="bg-slate-900/60 border border-blue-900/25 rounded-xl p-3.5 space-y-3"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
              <div className="h-4 w-24 bg-slate-800 rounded" />
              <div className="h-4 w-6 bg-slate-800/60 rounded-full" />
            </div>

            {/* Column Cards */}
            <div className="space-y-3 pt-1">
              {[1, 2].map((card) => (
                <div
                  key={card}
                  className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-700/60 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <div className="h-3.5 w-24 bg-slate-700 rounded" />
                      <div className="h-2.5 w-16 bg-slate-700/50 rounded" />
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-700/40 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
