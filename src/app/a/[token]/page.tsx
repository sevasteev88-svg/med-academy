import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyAndActivateDeviceAction } from "@/actions/player-device-actions";

export const metadata = {
  title: "Активація пристрою · ФК «Чорноморець»",
  description: "Одноразова активація пристрою для входу в медичний кабінет гравця",
};

export default async function DeviceActivationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Викликаємо серверну активацію пристрою
  const result = await verifyAndActivateDeviceAction(token);

  // 2. Успіх: перенаправляємо на портал, прибираючи токен з URL та Referer
  if (result.success) {
    redirect("/rehab-portal?activated=1");
  }

  // Обробка помилок
  const isConsentError = result.requiresConsent;
  const isLockError = Boolean(result.lockedUntilMinutes);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top Header */}
      <div className="max-w-md mx-auto w-full flex items-center justify-between pb-4 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-sky-500/30 flex items-center justify-center p-1 shadow-md">
            <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            ФК Чорноморець · Активація
          </span>
        </div>
      </div>

      {/* Main Error Card */}
      <div className="flex-1 flex items-center justify-center py-6">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl backdrop-blur-sm animate-fadeIn">
          {/* Status Icon */}
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg border border-slate-700/50 bg-slate-950">
            {isConsentError ? "📋" : isLockError ? "⏳" : "⚠️"}
          </div>

          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {isConsentError
                ? "Потрібна згода батьків"
                : isLockError
                ? "Спроби тимчасово заблоковано"
                : "Активація не вдалася"}
            </h1>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {result.error || "Не вдалося активувати пристрій за цим QR-кодом."}
            </p>
          </div>

          {/* Action Advice */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-left space-y-2">
            <div className="font-bold text-sky-400 flex items-center gap-1.5">
              <span>💡</span> Що робити:
            </div>
            {isConsentError ? (
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Для гравців віком до 18 років вхід у систему можливий лише після оформлення згоди законних представників (батьків). <strong>Зверніться до тренера/лікаря</strong>, щоб надіслати запит на згоду батькам.
              </p>
            ) : isLockError ? (
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Зафіксовано 5 невдалих спроб активації поспіль. З міркувань кібербезпеки доступ заблоковано на <strong>15 хвилин</strong>. Будь ласка, зачекайте та спробуйте пізніше.
              </p>
            ) : (
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Одноразовий QR-код дійсний протягом 14 днів і може бути використаний лише один раз. Зверніться до <strong>лікаря команди</strong> в медичному кабінеті для генерації нового QR-коду.
              </p>
            )}
          </div>

          <div className="pt-2">
            <Link
              href="/rehab-portal"
              className="inline-block w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition-all active:scale-95 text-center"
            >
              Перейти до входу за кодом
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pt-6 text-[10px] text-slate-600 font-mono">
        Штаб спортивної медицини ФК «Чорноморець» · Безпечна активація пристроїв
      </div>
    </div>
  );
}
