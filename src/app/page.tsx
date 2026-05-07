import { createClient } from '@/utils/supabase/server';
import InjuriesAnalytics from '@/components/injuries/InjuriesAnalytics';
import Link from 'next/link';

function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-surface rounded-xl border border-gray-800 p-4 ${className}`}>
      {children}
    </div>
  );
}

function Badge({ children, variant = 'neutral' }: { children: React.ReactNode, variant?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const colors = {
    ok: 'bg-status-ok/20 text-status-ok border-status-ok/30',
    warn: 'bg-status-warn/20 text-status-warn border-status-warn/30',
    danger: 'bg-status-danger/20 text-status-danger border-status-danger/30',
    neutral: 'bg-gray-800 text-gray-300 border-gray-700'
  };
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-md border ${colors[variant]}`}>
      {children}
    </span>
  );
}

export default async function Home() {
  const supabase = await createClient();

  const { error } = await supabase.from('teams').select('*').limit(1);
  const isDbConnected = !error;

  // Реальні активні травми з БД
  const { data: activeInjuries } = await supabase
    .from('injuries')
    .select(`*, players(first_name, last_name, teams(name))`)
    .eq('status', 'active')
    .order('date_of_injury', { ascending: false })
    .limit(4);

  return (
    <div className="min-h-screen bg-background text-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Шапка і статус БД */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-white">Медичний штаб «Чорноморець»</h1>
          <div className={`text-sm px-3 py-1 rounded-full font-medium ${isDbConnected ? 'bg-status-ok/20 text-status-ok' : 'bg-status-danger/20 text-status-danger'}`}>
            База даних: {isDbConnected ? 'Підключена 🟢' : 'Помилка 🔴'}
          </div>
        </div>

        {/* Секція: Швидкі дії */}
        <section>
          <div className="flex gap-4">
            <Link
              href="/injuries/new"
              className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-5 rounded-lg transition-colors shadow-lg shadow-brand-blue/20"
            >
              + Фіксація травми
            </Link>
            <button className="border border-brand-blue text-brand-blue hover:bg-brand-blue/10 font-bold py-3 px-5 rounded-lg transition-colors">
              📐 Гоніометр
            </button>
          </div>
        </section>

        {/* Секція: Тріаж — реальні дані */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-400">
              Тріаж (активні травми)
            </h2>
            <Link
              href="/injuries"
              className="text-sm text-gray-600 hover:text-white transition-colors"
            >
              Всі →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(activeInjuries ?? []).length === 0 && (
              <p className="text-gray-600 text-sm col-span-2">Активних травм немає 🟢</p>
            )}
            {(activeInjuries ?? []).map((injury: any) => {
              const player = injury.players;
              const name = player ? `${player.last_name} ${player.first_name[0]}.` : '—';
              const team = player?.teams?.name ?? '';
              const rtp = injury.rtp_prediction;
              const isTJ = injury.bamic_location === 'c' && (injury.bamic_grade ?? 0) >= 2;
              return (
                <Link key={injury.id} href={`/injuries/${injury.id}`}>
                  <Card className="flex justify-between items-center hover:border-gray-600 transition-colors cursor-pointer">
                    <div>
                      <div className="font-bold text-white text-lg">{name}</div>
                      <div className="text-sm text-gray-400">
                        {team} · {injury.location}
                        {isTJ && <span className="ml-1 text-status-danger">⚠️ T-junction</span>}
                      </div>
                    </div>
                    {rtp ? (
                      <Badge variant={isTJ || rtp.max_days >= 60 ? 'danger' : rtp.max_days >= 28 ? 'warn' : 'ok'}>
                        {rtp.min_days}–{rtp.max_days} дн.
                      </Badge>
                    ) : (
                      <Badge variant="neutral">RTP: ?</Badge>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Секція: Аналітика травм */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-400">
              Аналітика травм команди
            </h2>
          </div>
          <InjuriesAnalytics />
        </section>

      </div>
    </div>
  );
}
