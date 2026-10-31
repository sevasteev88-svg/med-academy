import Link from "next/link";
import Image from "next/image";
import Card from "@/components/ui/Card";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Image
            src="/logo-chr.png"
            alt="MedAcademy"
            width={64}
            height={64}
            className="mx-auto rounded-full ring-2 ring-brand-blue/30 mb-4"
          />
          <h1 className="text-xl font-bold text-white">Реєстрація обмежена</h1>
          <p className="text-xs text-slate-400 mt-1">Клубна система спортивної медицини та тренерського штабу</p>
        </div>

        <Card className="p-6 space-y-4 border-amber-500/30 bg-slate-900/80 text-center">
          <div className="text-4xl">🔒</div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Відкрита реєстрація закрита
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Облікові записи для тренерів та медичного персоналу створюються та закріплюються за віковими категоріями виключно адміністратором клубу в панелі керування.
          </p>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 text-left leading-relaxed">
            💡 <strong>Футболістам клубу:</strong> вхід до особистого кабінету здійснюється без реєстрації через <strong>Портал гравця</strong> за індивідуальним PIN-кодом або QR-карткою команди.
          </div>

          <div className="space-y-2 pt-2">
            <Link
              href="/rehab-portal"
              className="w-full py-2.5 px-4 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 transition-all block text-center"
            >
              <span>📱</span>
              <span>Перейти до Порталу гравця (PIN / QR)</span>
            </Link>

            <Link
              href="/login"
              className="w-full py-2.5 px-4 rounded-xl bg-brand-blue hover:bg-brand-blue-light text-white font-bold text-xs flex items-center justify-center gap-2 transition-all block text-center shadow-glow-sm"
            >
              <span>🔑</span>
              <span>Повернутися до входу для штабу</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
