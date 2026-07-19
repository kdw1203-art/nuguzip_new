import { getServiceSupabase } from "@/lib/supabase/service";

export interface AttendanceRecord {
  date: string;
  streak: number;
}

export interface PointsRecord {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
}

// In-memory fallback
const memAttendance = new Map<string, AttendanceRecord[]>();
const memPoints = new Map<string, PointsRecord[]>();

export async function checkIn(userEmail: string): Promise<{ streak: number; pointsEarned: number; alreadyChecked: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const sb = getServiceSupabase();

  // Check if already checked in today
  if (sb) {
    const { data: existing } = await sb
      .from("user_attendance")
      .select("streak")
      .eq("user_email", userEmail)
      .eq("date", today)
      .maybeSingle();
    if (existing) return { streak: Number(existing.streak), pointsEarned: 0, alreadyChecked: true };
  } else {
    const list = memAttendance.get(userEmail) ?? [];
    if (list.some((a) => a.date === today)) {
      return { streak: list[0]?.streak ?? 1, pointsEarned: 0, alreadyChecked: true };
    }
  }

  // Calculate streak
  let streak = 1;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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

  // Points based on streak
  const pointsEarned = streak >= 7 ? 50 : streak >= 3 ? 20 : 10;

  // Save attendance
  if (sb) {
    await sb.from("user_attendance").insert({ user_email: userEmail, date: today, streak });
  } else {
    const list = memAttendance.get(userEmail) ?? [];
    list.unshift({ date: today, streak });
    memAttendance.set(userEmail, list.slice(0, 30));
  }

  // Add points
  await addPoints(userEmail, pointsEarned, `출석 체크 (${streak}일 연속)`);

  return { streak, pointsEarned, alreadyChecked: false };
}

export async function addPoints(userEmail: string, delta: number, reason: string): Promise<void> {
  const sb = getServiceSupabase();
  if (sb) {
    await sb.from("user_points").insert({ user_email: userEmail, delta, reason });
  } else {
    const list = memPoints.get(userEmail) ?? [];
    list.unshift({ id: `mem-${Date.now()}`, delta, reason, createdAt: new Date().toISOString() });
    memPoints.set(userEmail, list.slice(0, 100));
  }
}

export async function getPoints(userEmail: string): Promise<number> {
  const sb = getServiceSupabase();
  if (sb) {
    const { data } = await sb
      .from("user_points")
      .select("delta")
      .eq("user_email", userEmail);
    return (data ?? []).reduce((sum, r) => sum + Number(r.delta), 0);
  }
  const list = memPoints.get(userEmail) ?? [];
  return list.reduce((sum, r) => sum + r.delta, 0);
}

export async function getAttendanceHistory(userEmail: string, days = 30): Promise<AttendanceRecord[]> {
  const sb = getServiceSupabase();
  if (sb) {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
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

export async function getPointsHistory(userEmail: string, limit = 20): Promise<PointsRecord[]> {
  const sb = getServiceSupabase();
  if (sb) {
    const { data } = await sb
      .from("user_points")
      .select("id, delta, reason, created_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r) => ({ id: String(r.id), delta: Number(r.delta), reason: String(r.reason), createdAt: String(r.created_at) }));
  }
  return (memPoints.get(userEmail) ?? []).slice(0, limit);
}
