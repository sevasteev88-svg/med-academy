import { getTeamTrainingDataAction } from "@/actions/training-session-actions";
import CoachTrainingClient from "@/components/training/CoachTrainingClient";

export const metadata = {
  title: "Введення тренування (Session-RPE) · Штаб команди",
  description: "Швидкий груповий запис навантаження команди тренером за 10 секунд",
};

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; date?: string }>;
}) {
  const { teamId, date } = await searchParams;

  const data = await getTeamTrainingDataAction({
    teamId,
    date,
  });

  if (!data.success && data.error) {
    return (
      <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto p-6 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-sm">
          <h2 className="text-base font-bold mb-1">Помилка доступу до команди</h2>
          <p>{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <CoachTrainingClient
          initialTeam={data.team}
          teams={data.teams}
          initialDate={data.date}
          isCoach={data.isCoach}
          userRole={data.userRole}
          initialPlayers={data.players}
          existingSession={data.existingSession}
        />
      </div>
    </div>
  );
}
