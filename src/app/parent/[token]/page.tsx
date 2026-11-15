import Link from "next/link";
import { getParentPortalDataAction } from "@/actions/parent-portal-actions";
import ParentPortalClient from "@/components/parent/ParentPortalClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Сімейний кабінет батьків · Med-Academy",
  description: "Статус медичного допуску, домашнє ЛФК, дозволи та зв'язок з лікарем клубу",
};

export default async function ParentPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = await getParentPortalDataAction(token);

  if (res.error || !res.data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-rose-500/30 text-center space-y-4">
          <div className="text-3xl">🔒</div>
          <h1 className="text-lg font-black text-white">
            Сімейне посилання недійсне або відкликане
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {res.error || "Зверніться до медичного штабу клубу для отримання нового посилання."}
          </p>
          <div className="pt-2">
            <Link
              href="/privacy"
              className="text-xs font-semibold text-sky-400 hover:underline"
            >
              Політика конфіденційності (/privacy) →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ParentPortalClient rawToken={token} initialData={res.data} />;
}
