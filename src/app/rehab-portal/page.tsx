import { getAuthorizedPlayerCabinetData, getPlayerByPortalToken } from "@/actions/rehab-portal-action";
import RehabPortalClient from "@/components/portal/RehabPortalClient";

export const metadata = {
  title: "Медичний Портал Гравця · ФК «Чорноморець»",
  description: "Особистий кабінет футболіста для щоденного звіту про біль, велнес та відновлення",
};

export default async function RehabPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // 1. Перевіряємо чи є вже валідна сесія в httpOnly cookie
  const sessionData = await getAuthorizedPlayerCabinetData();

  // 2. Якщо сесії немає, але передано персональний token — перевіряємо його валідність
  let playerPreview: { name: string; team: string; position: string } | null = null;
  if (sessionData.unauthorized && token) {
    const pl = await getPlayerByPortalToken(token);
    if (pl) {
      playerPreview = {
        name: pl.name,
        team: pl.team,
        position: pl.position,
      };
    }
  }

  return (
    <div className="min-h-screen text-slate-200 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top minimal header */}
      <div className="max-w-md mx-auto w-full flex items-center justify-between pb-4 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-xs">
            ⚽
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            ФК Чорноморець · Кабінет гравця
          </span>
        </div>
      </div>

      {/* Main Client Component */}
      <div className="flex-1 flex items-center justify-center">
        <RehabPortalClient
          initialSessionData={sessionData.success ? sessionData : null}
          tokenFromUrl={token || ""}
          playerPreview={playerPreview}
        />
      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pt-6 text-[10px] text-slate-600 font-mono">
        Штаб спортивної медицини ФК «Чорноморець» · Всі права захищено
      </div>
    </div>
  );
}
