import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Image from "next/image";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PlayerFilters from "@/components/players/PlayerFilters";
import QuickRestoreButton from "@/components/players/QuickRestoreButton";
import { EhrImportButton } from "@/components/players/EhrImportButton";
import { POSITION_LABELS, TEAM_CATEGORY_UA, LOCATION_UA, INJURY_TYPE_UA, formatPosition, formatInjuryType, formatLocation } from "@/lib/constants";
import { playerStatus } from "@/lib/player-status";

function calcAge(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
}

function growthZone(player: any): "yellow" | "red" | null {
  const assessments = player?.maturation_assessments ?? [];
  if (assessments.length === 0) return null;
  const latest = [...assessments].sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  if (latest.risk_zone === "red") return "red";
  if (latest.risk_zone === "yellow") return "yellow";
  return null;
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; team?: string; status?: string; view?: string }>;
}) {
  const { q, team: selectedTeam, status: selectedStatus, view } = await searchParams;
  const isArchiveView = view === "archived";
  const supabase = await createClient();

  const [teamsRes, photosRes] = await Promise.all([
    supabase
      .from("teams")
      .select(`
        id, name, category, sort_order,
        players (
          id, first_name, last_name, date_of_birth, position, archived_at, archive_reason,
          injuries ( id, status, vas_score, location, injury_type ),
          maturation_assessments ( risk_zone, growth_phase, created_at )
        )
      `)
      .order("sort_order", { ascending: true }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[PLAYER_PHOTO]%")
      .order("date", { ascending: false }),
  ]);

  const rawTeams = teamsRes.data || [];

  // Карта фото гравців
  const photoMap: Record<string, string> = {};
  (photosRes.data || []).forEach((l) => {
    try {
      const rawJson = l.note.replace("[PLAYER_PHOTO] ", "");
      const parsed = JSON.parse(rawJson);
      if (parsed.player_id && !photoMap[parsed.player_id]) {
        photoMap[parsed.player_id] = parsed.photo_url;
      }
    } catch {
      // ignore
    }
  });

  // Усі доступні команди для фільтра
  const teamOptions = rawTeams.map((t) => ({ id: t.id, name: t.name }));

  // Фільтрація пошуку та статусів
  const searchQuery = q?.toLowerCase() ?? "";

  function filterPlayers(teamList: any[]) {
    return teamList
      .filter((t: any) => {
        if (!selectedTeam || selectedTeam === "all") return true;
        return t.id === selectedTeam;
      })
      .map((team: any) => {
        let players = team.players ?? [];

        // 0. Фільтр за архівом: за замовчуванням архівні приховані, у режимі архіву — тільки архівні
        players = players.filter((p: any) => {
          if (isArchiveView) {
            return Boolean(p.archived_at);
          }
          return !p.archived_at;
        });

        // 1. Пошук по імені / прізвищу
        if (searchQuery) {
          players = players.filter(
            (p: any) =>
              p.last_name.toLowerCase().includes(searchQuery) ||
              p.first_name.toLowerCase().includes(searchQuery)
          );
        }

        // 2. Фільтр за медичним статусом
        if (selectedStatus && selectedStatus !== "all") {
          players = players.filter((p: any) => {
            const st = playerStatus(p);
            return st === selectedStatus;
          });
        }

        return {
          ...team,
          players,
        };
      })
      .filter((team: any) => team.players.length > 0);
  }

  const youth = filterPlayers(rawTeams.filter((t: any) => t.category === "youth"));
  const academy = filterPlayers(rawTeams.filter((t: any) => t.category === "academy"));
  const totalFiltered = [...youth, ...academy].reduce((s, t: any) => s + (t.players?.length ?? 0), 0);

  function statusLabel(s: "ok" | "warn" | "danger", hasInj?: boolean): string {
    if (s === "ok") return "Готовий";
    if (s === "warn") return "Обмежений";
    return hasInj ? "Травмований" : "Не допущений";
  }

  function renderTeamGroup(label: string, teamList: any[]) {
    if (teamList.length === 0) return null;
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono font-bold text-sky-400 tracking-wider">
            {label}
          </span>
          <div className="flex-1 h-px bg-sky-500/15" />
        </div>

        {teamList.map((team: any) => (
          <div key={team.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚽</span> {team.name}
              </h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-2.5 py-0.5 rounded-full border border-slate-800">
                {(team.players ?? []).length} {isArchiveView ? "в архіві" : "гравців"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(team.players ?? [])
                .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name, "uk"))
                .map((player: any) => {
                  const status = playerStatus(player);
                  const initials = `${player.last_name?.[0] ?? ""}${player.first_name?.[0] ?? ""}`;
                  const photo = photoMap[player.id];
                  const gZone = growthZone(player);

                  // Активна травма
                  const activeInj = (player.injuries ?? []).find(
                    (i: any) => i.status === "active" || i.status === "rehabilitation"
                  );

                  return (
                    <div key={player.id} className="group block">
                      <Card
                        interactive
                        accent={isArchiveView ? null : (status === "ok" ? null : status)}
                        className={`p-3.5 space-y-2.5 ${isArchiveView ? "opacity-90 border-amber-500/20 bg-slate-900/50" : ""}`}
                      >
                        <Link href={`/players/${player.id}`} className="block">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Аватар з фото або ініціалами */}
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-sky-500/20 group-hover:border-sky-400/50 flex items-center justify-center font-bold font-mono text-xs text-sky-300 shrink-0 shadow-inner overflow-hidden relative">
                                {photo ? (
                                  <Image
                                    src={photo}
                                    alt={player.last_name}
                                    fill
                                    sizes="48px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <span>{initials}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white text-sm truncate group-hover:text-sky-300 transition-colors">
                                  {player.last_name} {player.first_name}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                  {player.position && (
                                    <span className="font-mono text-sky-300 px-1.5 py-0.2 rounded bg-sky-500/10 text-[10px] font-semibold border border-sky-500/20">
                                      {formatPosition(player.position)}
                                    </span>
                                  )}
                                  <span>·</span>
                                  <span>{calcAge(player.date_of_birth)} р.</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              {isArchiveView ? (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  📦 В архіві
                                </span>
                              ) : (
                                <Badge variant={status}>{statusLabel(status, !!activeInj)}</Badge>
                              )}
                              {gZone && !isArchiveView && (
                                <span
                                  className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                                    gZone === "red"
                                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-sm"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-sm"
                                  }`}
                                >
                                  PHV {gZone}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>

                        {/* Інформація про активну травму / біль ВАШ (для активних гравців) */}
                        {!isArchiveView && activeInj && (
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="truncate pr-2">
                              🩹 {formatInjuryType(activeInj.injury_type)} (
                              {formatLocation(activeInj.location)})
                            </span>
                            {activeInj.vas_score != null && (
                              <span
                                className={`font-mono font-bold px-1.5 py-0.2 rounded text-[10px] shrink-0 border ${
                                  activeInj.vas_score >= 7
                                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                }`}
                              >
                                ВАШ {activeInj.vas_score}/10
                              </span>
                            )}
                          </div>
                        )}

                        {/* 1.6 Блок інформації про архів та кнопка «Відновити» (для архівних гравців) */}
                        {isArchiveView && (
                          <div className="pt-2 border-t border-amber-500/15 flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0 truncate text-slate-400">
                              <span className="text-amber-300/90 font-medium">Причина:</span>{" "}
                              <span className="text-slate-300">{player.archive_reason || "Не вказана"}</span>
                              {player.archived_at && (
                                <span className="text-[10px] text-slate-500 block truncate">
                                  з {new Date(player.archived_at).toLocaleDateString("uk-UA")}
                                </span>
                              )}
                            </div>
                            <QuickRestoreButton
                              playerId={player.id}
                              playerName={`${player.last_name} ${player.first_name}`}
                            />
                          </div>
                        )}
                      </Card>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-sky-500/15">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{isArchiveView ? "📦" : "👥"}</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {isArchiveView ? "Архів футболістів" : "Реєстр футболістів"}
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {isArchiveView
                ? "Архівовані гравці клубу (історію збережено, приховані з оперативних звітів)"
                : "База активних гравців Академії та молодіжного складу"}
              {(searchQuery || (selectedTeam && selectedTeam !== "all") || (selectedStatus && selectedStatus !== "all") || isArchiveView) && (
                <span className="text-sky-400 ml-1">· Знайдено: {totalFiltered}</span>
              )}
            </p>
          </div>
          <div className="w-full sm:w-auto flex flex-wrap items-center gap-2.5">
            <EhrImportButton />
            <Link
              href="/team/qr-cards"
              className="bg-slate-900/80 hover:bg-slate-800 text-sky-400 hover:text-white border border-sky-500/25 font-bold py-2.5 px-3.5 rounded-xl text-xs transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <span>🪪</span> QR-картки команди
            </Link>
            <Link
              href="/players/new"
              className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/20 active:scale-95 whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <span>+</span> Додати гравця
            </Link>
          </div>
        </div>

        {/* Панель інтерактивних фільтрів та пошуку */}
        <PlayerFilters teams={teamOptions} />

        {/* Списки команд */}
        {renderTeamGroup(TEAM_CATEGORY_UA.youth, youth)}
        {renderTeamGroup(TEAM_CATEGORY_UA.academy, academy)}

        {totalFiltered === 0 && (
          <Card className="text-center py-12">
            <span className="text-3xl block mb-2">{isArchiveView ? "📦" : "🔍"}</span>
            <p className="text-sm font-semibold text-slate-300">
              {isArchiveView
                ? "В архіві немає гравців за вказаними параметрами"
                : "За вибраними параметрами гравців не знайдено"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isArchiveView
                ? "Усі гравці наразі перебувають в активному складі"
                : "Спробуйте скинути фільтри або змінити пошуковий запит"}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
