import Link from "next/link";
import Card from "@/components/ui/Card";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  getActiveConsentDocuments,
} from "@/lib/consents";
import { DEFAULT_CLUB_ID } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PrivacyPolicyPage() {
  const activeDocuments = await getActiveConsentDocuments(DEFAULT_CLUB_ID);

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Попередження про шаблон (п. 11) */}
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="font-black uppercase tracking-wider text-amber-300">
                ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ
              </div>
              <div className="text-slate-300 mt-0.5">
                Усі наведені нижче тексти політики конфіденційності та інформованих згод є структурованими шаблонами (хто обробляє, які дані, навіщо, строк зберігання, права, як відкликати, контакти) і потребують перевірки юристом клубу.
              </div>
            </div>
          </div>
          <Link
            href="/consents"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30 font-bold shrink-0"
          >
            До реєстру згод →
          </Link>
        </div>

        {/* Основна Політика конфіденційності (/privacy) */}
        <Card className="p-6 bg-slate-900/70 border border-sky-500/20 space-y-5">
          <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                Шаблон, потребує перевірки юристом
              </span>
              <h1 className="text-xl md:text-2xl font-black text-white mt-2">
                Політика конфіденційності та обробки даних спортсменів
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                1. Хто обробляє дані
              </div>
              <p className="text-slate-300">
                Футбольний клуб / Академія та уповноважені працівники медичного департаменту (спортивні лікарі, реабілітологи) й адміністратори клубу в межах своїх функціональних обов&apos;язків.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                2. Які дані обробляються
              </div>
              <p className="text-slate-300">
                Ідентифікаційні дані гравця та законних представників (батьків), антропометрія та оцінка біологічного дозрівання (PHV), дані про спортивні травми, клінічні огляди, а за наявності окремих опціональних згод — біометрія носимих пристроїв, GPS-навантаження, нутриціологічний профіль, ШІ-аналітика та фото профілю.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                3. Навіщо обробляються дані (Мета)
              </div>
              <p className="text-slate-300">
                Медичний супровід навчально-тренувального процесу, профілактика травматизму, безпечний допуск до матчів і тренувань (Return-to-Play) та оперативний зв&apos;язок із батьками неповнолітніх гравців.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                4. Строк зберігання
              </div>
              <p className="text-slate-300">
                Протягом періоду перебування спортсмена в Клубі / Академії або до моменту відкликання відповідної згоди законним представником чи повнолітнім гравцем (з дотриманням строків зберігання медичної документації).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                5. Права суб&apos;єкта даних та батьків
              </div>
              <p className="text-slate-300">
                Право знати про склад і мету обробки даних, отримувати доступ до них, вимагати виправлення, видалення або знеособлення даних опціональних областей, а також право у будь-який момент відкликати раніше надану згоду.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="font-bold text-sky-300">
                6. Як відкликати згоду та 7. Контакти
              </div>
              <p className="text-slate-300">
                Відкликати згоду можна онлайн за посиланням «Мої згоди» (з підтвердженням одноразовим кодом OTP на телефон) або письмовою заявою до медичного штабу Клубу. Контакти з питань захисту даних:{" "}
                <strong className="text-white font-mono">
                  privacy@club-academy.ua
                </strong>
                .
              </p>
            </div>
          </div>
        </Card>

        {/* Актуальні версії шаблонів документів по кожній з 6 областей */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Актуальні шаблони документів згоди за областями (Scopes)
          </h2>

          {ALL_CONSENT_SCOPES.map((scope) => {
            const doc = activeDocuments[scope];
            const meta = CONSENT_SCOPE_META[scope];
            return (
              <Card
                key={scope}
                className="p-5 bg-slate-900/60 border border-slate-800 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {doc.title}
                      </h3>
                      <div className="text-[11px] text-slate-400">
                        Код області: <code className="text-sky-300">{scope}</code> · Діє з:{" "}
                        {new Date(doc.effective_from).toLocaleDateString("uk-UA")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                      шаблон, потребує перевірки юристом
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono text-xs font-bold">
                      v{doc.version}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                  {doc.body_markdown}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
