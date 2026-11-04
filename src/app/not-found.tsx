import Link from "next/link";
import { Home, Users, Bandage, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/80 border border-sky-500/20 backdrop-blur-xl text-center space-y-6 shadow-2xl shadow-black/60">
        <div className="relative mx-auto w-20 h-20 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-4xl shadow-lg shadow-sky-500/20">
          🔍
          <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            404
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Сторінку не знайдено
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Можливо, запис (картку гравця або травму) було видалено, або в ярлику програми збереглося застаріле посилання.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2.5">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium text-sm transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Перейти на головний дашборд
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/players"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 font-medium text-xs border border-slate-700/60 transition-all hover:border-sky-500/30"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              Реєстр гравців
            </Link>
            <Link
              href="/injuries"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 font-medium text-xs border border-slate-700/60 transition-all hover:border-sky-500/30"
            >
              <Bandage className="w-3.5 h-3.5 text-rose-400" />
              Журнал травм
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
