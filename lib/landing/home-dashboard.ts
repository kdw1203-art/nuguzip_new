import type { HomeMeeting } from "@/lib/landing/data";

/** 아직 참가 가능한 좌석이 있는 경우(카드 허브용 모임 수 요약). */
export function meetingsWithOpenSeats(meetings: HomeMeeting[]): number {
  return meetings.filter((m) => m.maxMembers > 0 && m.currentMembers < m.maxMembers).length;
}

/** 일정이 있고 향후 N일 안에 시작하는 모임 수. 날짜 파싱 실패는 제외. */
export function upcomingMeetingsWithinDays(meetings: HomeMeeting[], withinDays = 21): number {
  const now = Date.now();
  const horizon = now + withinDays * 86400000;
  return meetings.filter((m) => {
    const t = Date.parse(m.scheduledAt);
    return Number.isFinite(t) && t > now && t <= horizon;
  }).length;
}
