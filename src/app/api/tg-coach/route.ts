import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { verifyTelegramWebAppInitData } from "@/lib/telegram-webapp-auth";
import { calculatePlayerAvailability } from "@/lib/availability-rules";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";
import {
  finalizeCoachTrainingSession,
  getCoachSession,
  updateCoachSession,
} from "@/lib/coach-telegram-server";
import { memoryCoachBindings } from "@/lib/coach-telegram-state";
import type { PreSeasonScreening } from "@/types/screening";
import type { RtpPhaseLog } from "@/types/rtp";
import type { TrainingSessionType, RpeScore } from "@/types/workload";

export const dynamic = "force-dynamic";

async function resolveCoachByTelegram(initData: string, requestedClubId?: string | null) {
  const supabase = createAdminClient();
  const cleanClubId = requestedClubId?.trim() || "";

  let verified: ReturnType<typeof verifyTelegramWebAppInitData> | null = null;
  let verifiedClubId = "";

  if (cleanClubId) {
    const { botToken } = await getClubTelegramConfig(cleanClubId);
    const candidate = verifyTelegramWebAppInitData(initData, botToken);
    if (!candidate.ok) {
      return { error: candidate.error, status: 401 as const };
    }
    verified = candidate;
    verifiedClubId = cleanClubId;
  } else {
    const defaultToken = process.env.TELEGRAM_BOT_TOKEN || "";
    const defaultCandidate = verifyTelegramWebAppInitData(initData, defaultToken);
    if (defaultCandidate.ok) {
      verified = defaultCandidate;
      verifiedClubId = DEFAULT_CLUB_ID;
    } else {
      try {
        const { data: clubsData } = await supabase
          .from("clubs")
          .select("id, settings")
          .not("settings->telegram->encrypted_token", "is", null);

        for (const c of clubsData || []) {
          const { botToken: clubToken } = await getClubTelegramConfig(c.id);
          if (!clubToken) continue;
          const candidate = verifyTelegramWebAppInitData(initData, clubToken);
          if (candidate.ok) {
            verified = candidate;
            verifiedClubId = c.id;
            break;
          }
        }
      } catch {}

      if (!verified || !verified.ok) {
        return { error: defaultCandidate.error, status: 401 as const };
      }
    }
  }

  const chatId = String(verified.user.id);

  let binding: { coach_user_id: string; club_id?: string | null } | null = null;
  try {
    const { data } = await supabase
      .from("coach_telegram_bindings")
      .select("coach_user_id, club_id, status")
      .eq("telegram_chat_id", chatId)
      .eq("club_id", verifiedClubId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) binding = data;
  } catch {}

  if (!binding) {
    const mem = memoryCoachBindings.get(`${verifiedClubId}:${chatId}`);
    if (mem && mem.club_id === verifiedClubId && mem.status === "active") {
      binding = mem;
    } else {
      for (const m of memoryCoachBindings.values()) {
        if (m.telegram_chat_id === chatId && m.club_id === verifiedClubId && m.status === "active") {
          binding = m;
          break;
        }
      }
    }
  }

  if (!binding) {
    return {
      error: "Ваш Telegram ще не прив'язано до профілю тренера. Зверніться до адміністратора клубу за QR-посиланням.",
      status: 403 as const,
    };
  }

  const coachUserId = binding.coach_user_id;

  let memberQuery = supabase
    .from("club_members")
    .select("club_id, team_id, role")
    .eq("user_id", coachUserId);
  if (binding.club_id) {
    memberQuery = memberQuery.eq("club_id", binding.club_id);
  }

  const [profileRes, memberRes, assignmentsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, team_id").eq("id", coachUserId).maybeSingle(),
    memberQuery.limit(1).maybeSingle(),
    supabase.from("coach_team_assignments").select("team_id, club_id").eq("coach_user_id", coachUserId),
  ]);

  const member = memberRes.data;
  if (
    !member?.club_id ||
    !["coach", "doctor", "admin"].includes(String(member.role || ""))
  ) {
    return {
      error: "Акаунт не має активного доступу до клубу.",
      status: 403 as const,
    };
  }

  const clubId = member.club_id;
  const role = member.role as "coach" | "doctor" | "admin";

  const candidateTeamIds = Array.from(
    new Set(
      [
        ...(assignmentsRes.data || [])
          .filter((a: any) => !a.club_id || a.club_id === clubId)
          .map((a: any) => a.team_id),
        member.team_id,
        profileRes.data?.team_id,
      ].filter(Boolean)
    )
  ) as string[];

  let teamIds: string[] = [];
  if (candidateTeamIds.length > 0) {
    const { data: clubTeams } = await supabase
      .from("teams")
      .select("id")
      .eq("club_id", clubId)
      .in("id", candidateTeamIds);
    teamIds = (clubTeams || []).map((t: any) => t.id);
  }

  const coachName =
    profileRes.data?.full_name ||
    [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") ||
    "Тренер";

  return {
    coachUserId,
    chatId,
    clubId,
    role,
    teamIds,
    coachName,
  };
}

export async function GET(req: NextRequest) {
  const initData =
    req.headers.get("x-telegram-init-data") ||
    req.nextUrl.searchParams.get("initData") ||
    "";
  const requestedClubId =
    req.nextUrl.searchParams.get("clubId") || req.headers.get("x-club-id");

  const auth = await resolveCoachByTelegram(initData, requestedClubId);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const timezone = await getClubTimezone(auth.clubId);
  const todayStr = getClubDate(timezone);

  if (auth.role === "coach" && auth.teamIds.length === 0) {
    const session = await getCoachSession(auth.coachUserId, auth.chatId);
    return NextResponse.json({
      coachName: auth.coachName,
      todayDate: todayStr,
      preferredMode: (session?.session_draft as any)?.preferred_mode || "miniapp",
      teams: [],
      players: [],
    });
  }

  let teamsQuery = supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .eq("club_id", auth.clubId)
    .order("sort_order", { ascending: true });

  if (auth.role === "coach" || auth.teamIds.length > 0) {
    teamsQuery = teamsQuery.in("id", auth.teamIds);
  }

  let playersQuery = supabase
    .from("players")
    .select(`
      id, first_name, last_name, position, date_of_birth, team_id, club_id, archived_at,
      teams ( id, name, category, sort_order ),
      injuries ( id, status, injury_type, location, vas_score, date_of_injury, expected_return_date, description )
    `)
    .eq("club_id", auth.clubId)
    .is("archived_at", null);

  if (auth.role === "coach" || auth.teamIds.length > 0) {
    playersQuery = playersQuery.in("team_id", auth.teamIds);
  }

  const screeningsQuery = supabase
    .from("player_screenings")
    .select("id, player_id, date, season, examiner_doctor, overall_status, valid_until, cardio_clearance, restrictions_notes, data, created_at")
    .eq("club_id", auth.clubId)
    .order("date", { ascending: false })
    .limit(300);

  const [teamsRes, playersRes, screeningLogsRes, session] = await Promise.all([
    teamsQuery,
    playersQuery,
    screeningsQuery,
    getCoachSession(auth.coachUserId, auth.chatId),
  ]);

  const playerInjuryIds = Array.from(
    new Set(
      (playersRes.data || []).flatMap((p: any) =>
        Array.isArray(p.injuries) ? p.injuries.map((inj: any) => inj?.id).filter(Boolean) : []
      )
    )
  ) as string[];

  const rtpLogsRes =
    playerInjuryIds.length > 0
      ? await supabase
          .from("injury_logs")
          .select("injury_id, note, date, created_at")
          .in("injury_id", playerInjuryIds)
          .like("note", "[RTP_PHASE]%")
          .order("created_at", { ascending: false })
          .limit(300)
      : { data: [] };

  const latestRtpByInjury: Record<string, Partial<RtpPhaseLog>> = {};
  for (const log of rtpLogsRes.data || []) {
    try {
      const parsed = JSON.parse(log.note.replace("[RTP_PHASE] ", ""));
      if (parsed.injury_id && !latestRtpByInjury[parsed.injury_id]) {
        latestRtpByInjury[parsed.injury_id] = parsed;
      }
    } catch {}
  }

  const latestScreeningsMap = new Map<string, PreSeasonScreening>();
  for (const row of (screeningLogsRes.data || []) as any[]) {
    if (row.player_id && !latestScreeningsMap.has(row.player_id)) {
      latestScreeningsMap.set(row.player_id, {
        ...((row.data as PreSeasonScreening) || {}),
        id: row.data?.id || row.id,
        player_id: row.player_id,
        date: row.date,
        season: row.season ?? row.data?.season,
        examiner_doctor: row.examiner_doctor ?? row.data?.examiner_doctor,
        overall_status: row.overall_status ?? row.data?.overall_status,
        valid_until: row.valid_until ?? row.data?.valid_until,
        cardio_clearance: row.cardio_clearance ?? row.data?.cardio_clearance,
        restrictions_notes: row.restrictions_notes ?? row.data?.restrictions_notes,
        created_at: row.created_at ?? row.data?.created_at,
      });
    }
  }

  const players = (playersRes.data || []).map((p: any) => {
    const avail = calculatePlayerAvailability(
      {
        ...p,
        screening: latestScreeningsMap.get(p.id) || null,
      },
      {
        date: todayStr,
        latestRtpByInjury,
      }
    );

    return {
      id: p.id,
      fullName: `${p.last_name} ${p.first_name}`.trim(),
      position: p.position || "Гравець",
      team_id: p.team_id || "",
      team_name: p.teams?.name || "Команда",
      status: avail.status,
      max_minutes: avail.max_minutes,
      restriction_notes: avail.restriction_notes || "",
    };
  });

  players.sort((a, b) => a.fullName.localeCompare(b.fullName, "uk"));

  return NextResponse.json({
    coachName: auth.coachName,
    todayDate: todayStr,
    preferredMode: (session.session_draft as any)?.preferred_mode || "miniapp",
    teams: teamsRes.data || [],
    players,
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }

  const initData = req.headers.get("x-telegram-init-data") || body?.initData || "";
  const requestedClubId =
    req.nextUrl.searchParams.get("clubId") ||
    req.headers.get("x-club-id") ||
    body?.clubId;
  const auth = await resolveCoachByTelegram(initData, requestedClubId);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const action = body?.action;

  if (action === "save_training") {
    const targetTeamId = String(body.teamId || auth.teamIds[0] || "").trim();
    if (!targetTeamId) {
      return NextResponse.json({ error: "Оберіть команду" }, { status: 400 });
    }
    if (auth.role === "coach" && !auth.teamIds.includes(targetTeamId)) {
      return NextResponse.json({ error: "Немає доступу до цієї команди" }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: teamCheck } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", targetTeamId)
      .eq("club_id", auth.clubId)
      .maybeSingle();

    if (!teamCheck) {
      return NextResponse.json({ error: "Команду не знайдено у вашому клубі" }, { status: 403 });
    }

    const timezone = await getClubTimezone(auth.clubId);
    const res = await finalizeCoachTrainingSession(
      auth.coachUserId,
      auth.chatId,
      {
        team_id: targetTeamId,
        date: getClubDate(timezone),
        session_type: (body.sessionType || "training_team") as TrainingSessionType,
        duration_minutes: Number(body.durationMinutes) || 90,
        rpe_score: (Number(body.rpeScore) || 5) as RpeScore,
        surface: body.surface || "Не вказано",
        incident: body.incident === "injury" ? "injury" : "none",
        notes: body.notes || "",
      },
      auth.clubId
    );
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  }

  if (action === "report_injury") {
    const playerId = String(body.playerId || "");
    const summary = String(body.summary || "").trim();
    const kind = String(body.kind || "Біль / Дискомфорт").trim();
    if (!playerId) {
      return NextResponse.json({ error: "Оберіть гравця" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const timezone = await getClubTimezone(auth.clubId);
    const todayStr = getClubDate(timezone);

    // Знаходимо або створюємо прив'язку до травми для логу, або пишемо в audit_logs
    const { data: player } = await supabase
      .from("players")
      .select("id, first_name, last_name, club_id, team_id")
      .eq("id", playerId)
      .eq("club_id", auth.clubId)
      .maybeSingle();

    if (!player) {
      return NextResponse.json({ error: "Гравця не знайдено" }, { status: 404 });
    }

    if (auth.role === "coach" && (!player.team_id || !auth.teamIds.includes(player.team_id))) {
      return NextResponse.json({ error: "Немає доступу до гравця цієї команди" }, { status: 403 });
    }

    const payload = {
      type: "COACH_FIELD_REPORT",
      player_id: player.id,
      player_name: `${player.last_name} ${player.first_name}`,
      coach_user_id: auth.coachUserId,
      coach_name: auth.coachName,
      kind,
      summary: summary || kind,
      date: todayStr,
    };

    try {
      await supabase.from("audit_logs").insert({
        club_id: player.club_id || auth.clubId,
        user_id: auth.coachUserId,
        action: "coach_field_injury_report",
        entity: "players",
        entity_id: player.id,
        meta: payload,
      });
    } catch {}

    // Також намагаємося додати в injury_logs, якщо у гравця є остання травма
    try {
      const { data: latestInj } = await supabase
        .from("injuries")
        .select("id")
        .eq("player_id", player.id)
        .order("date_of_injury", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestInj?.id) {
        await supabase.from("injury_logs").insert({
          club_id: player.club_id || auth.clubId,
          injury_id: latestInj.id,
          date: todayStr,
          note: `[COACH_FIELD_REPORT] ${JSON.stringify(payload)}`,
        });
      }
    } catch {}

    return NextResponse.json({ success: true });
  }

  if (action === "set_mode") {
    const mode = body.mode === "chat" ? "chat" : "miniapp";
    await updateCoachSession(auth.coachUserId, auth.chatId, "idle", {
      preferred_mode: mode,
    } as any);
    return NextResponse.json({ success: true, preferredMode: mode });
  }

  return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
}
