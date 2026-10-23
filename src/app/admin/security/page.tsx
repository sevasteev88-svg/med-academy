import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import MfaSetupCard from "@/components/auth/MfaSetupCard";
import Link from "next/link";

export const metadata = {
  title: "Безпека та 2FA | MedAcademy",
  description: "Налаштування двофакторної автентифікації TOTP та резервних кодів відновлення",
};

export default async function SecuritySettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/" className="hover:text-white transition">
          Головна
        </Link>
        <span>/</span>
        <span className="text-sky-300 font-semibold">Безпека та 2FA</span>
      </div>

      {/* Hero */}
      <div className="border-b border-sky-500/15 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-2xl shadow-inner">
            🔐
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Безпека облікового запису та 2FA
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Двофакторна автентифікація (TOTP) для захисту електронних медичних карт та терапевтичних виключень
            </p>
          </div>
        </div>
      </div>

      {/* MFA Card */}
      <MfaSetupCard userRole={user.role} />

      {/* Info card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="font-bold text-white flex items-center gap-2">
            <span>🛡️</span>
            <span>Рівень довіри AAL2</span>
          </div>
          <p>
            Платформа використовує протокол Supabase MFA (IETF RFC 6238 TOTP). Підтвердження кодом підвищує рівень доступу до <strong>AAL2</strong>, що є обов&apos;язковою умовою експорту персональних карток спортсменів.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="font-bold text-white flex items-center gap-2">
            <span>🔑</span>
            <span>Резервні одноразові коди</span>
          </div>
          <p>
            Усі 8 резервних кодів генеруються локально та зберігаються в базі в хешованому вигляді (SHA-256). Кожен код може бути використаний лише 1 раз для екстреного відновлення доступу.
          </p>
        </div>
      </div>
    </div>
  );
}
