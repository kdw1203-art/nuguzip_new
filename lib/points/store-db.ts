import { getServiceSupabase } from "@/lib/supabase/service";

export interface AttendanceRecord {
  date: string;
  streak: number;
}

/* 이 모듈은 **출석/스트릭만** 다룬다.
   포인트 잔액·내역은 원장(point_ledger)이 단독으로 갖는다 — lib/points/ledger 참조.
   예전에는 여기에 addPoints/getPoints/getPointsHistory 가 있었는데, 이미 폐기된
   user_points 테이블을 읽고 쓰는데다 부르는 곳이 한 군데도 없었다(importer 0).
   남겨 두면 "포인트 저장소가 두 개"라는 잘못된 인상을 주므로 지웠다. */

// In-memory fallback
const memAttendance = new Map<string, AttendanceRecord[]>();

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST(Asia/Seoul, UTC+9 고정·DST 없음) 기준 YYYY-MM-DD.
    서버는 UTC 로 돌기 때문에 toISOString() 을 그대로 쓰면 한국 시간 0시~9시 사이
    출석이 "어제" 로 기록돼 스트릭이 끊기던 문제의 수정. */
export function kstDateString(at: Date = new Date()): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function checkIn(userEmail: string): Promise<{ date: string; streak: number; pointsEarned: number; alreadyChecked: boolean }> {
  const today = kstDateString();
  const sb = getServiceSupabase();

  // Check if already checked in today
  if (sb) {
    const { data: existing } = await sb
      .from("user_attendance")
      .select("streak")
      .eq("user_email", userEmail)
      .eq("date", today)
      .maybeSingle();
    if (existing) return { date: today, streak: Number(existing.streak), pointsEarned: 0, alreadyChecked: true };
  } else {
    const list = memAttendance.get(userEmail) ?? [];
    if (list.some((a) => a.date === today)) {
      return { date: today, streak: list[0]?.streak ?? 1, pointsEarned: 0, alreadyChecked: true };
    }
  }

  // Calculate streak — 어제도 KST 기준
  let streak = 1;
  const yesterday = kstDateString(new Date(Date.now() - 86400000));
  if (sb) {
    const { data: yest } = await sb
      .from("user_attendance")
      .select("streak")
      .eq("user_email", userEmail)
      .eq("date", yesterday)
      .maybeSingle();
    if (yest) streak = Number(yest.streak) + 1;
  } else {
    const list = memAttendance.get(userEmail) ?? [];
    const yestEntry = list.find((a) => a.date === yesterday);
    if (yestEntry) streak = yestEntry.streak + 1;
  }

  // 스트릭 티어 — 기본 10P, 3일 연속 20P, 7일 연속 50P.
  // 실제 지급은 라우트(app/api/me/attendance)가 원장 규칙
  // (attendance + attendance_streak_3/7)으로 집행한다. 여기 값은 그 합과 일치해야 한다.
  const pointsEarned = streak >= 7 ? 50 : streak >= 3 ? 20 : 10;

  // Save attendance
  if (sb) {
    await sb.from("user_attendance").insert({ user_email: userEmail, date: today, streak });
  } else {
    const list = memAttendance.get(userEmail) ?? [];
    list.unshift({ date: today, streak });
    memAttendance.set(userEmail, list.slice(0, 30));
  }

  // B2: 이중적립 제거 — 과거엔 여기서 user_points 에도 적립했으나(원장과 잔액 불일치 유발),
  // 포인트 적립은 라우트의 awardPoints(원장) 단독으로 일원화한다. 여기선 출석/스트릭만 기록.

  return { date: today, streak, pointsEarned, alreadyChecked: false };
}

export async function getAttendanceHistory(userEmail: string, days = 30): Promise<AttendanceRecord[]> {
  const sb = getServiceSupabase();
  if (sb) {
    const since = kstDateString(new Date(Date.now() - days * 86400000));
    const { data } = await sb
      .from("user_attendance")
      .select("date, streak")
      .eq("user_email", userEmail)
      .gte("date", since)
      .order("date", { ascending: false });
    return (data ?? []).map((r) => ({ date: String(r.date), streak: Number(r.streak) }));
  }
  return memAttendance.get(userEmail) ?? [];
}
