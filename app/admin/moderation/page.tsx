import { loadModerationQueue, summarizeQueue } from "@/lib/admin/moderation-queue";
import { MODERATION_PIPELINE } from "@/lib/admin/moderation-policy";
import { ModerationQueue } from "./ModerationQueue";

/*
 * 신고 · 모더레이션 — 전부 실데이터(content_reports · chat_reports).
 *
 * 이전 버전은 칸반 카드("동편3 84 월세 · 재등록 패턴", "신고 3건")·SLA("평균 41시간")·
 * 필터 통계("자동 필터 룰 12개 활성 · 오탐률 3.1%")가 모두 하드코딩이었다. 운영 화면에서
 * 근거 없는 수치가 사실처럼 보이면 잘못된 판단으로 이어지므로 전부 제거하고,
 * 계산 가능한 지표만 실집계한다. 신고가 없으면 없다고 표시한다.
 */

export const dynamic = "force-dynamic";

const card =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

function hoursLabel(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return "1시간 미만";
  if (h < 48) return `${Math.round(h)}시간`;
  return `${Math.round(h / 24)}일`;
}

export default async function AdminModerationPage() {
  const items = await loadModerationQueue().catch(() => []);
  const stats = summarizeQueue(items);

  const cards = [
    { label: "미처리", value: `${stats.open}건`, color: stats.open > 0 ? "#f2c94c" : "#ffffff" },
    { label: "처리 완료", value: `${stats.resolved}건`, color: "#4ade80" },
    { label: "기각", value: `${stats.dismissed}건`, color: "#9aa6b8" },
    { label: "최근 30일 접수", value: `${stats.last30d}건`, color: "#ffffff" },
  ];

  return (
    <>
      <div className="rise-in flex flex-wrap items-center justify-between gap-2">
        <span className="text-[19px] font-extrabold text-white">신고 · 모더레이션</span>
        <span className="text-[11px] text-[#9aa6b8]">
          커뮤니티 {stats.bySource.content}건 · 채팅 {stats.bySource.chat}건
        </span>
      </div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        접수된 신고를 실시간으로 읽어옵니다. 표시되는 수치는 모두 DB 실집계입니다.
      </div>

      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] px-4 py-3.5"
          >
            <div className="text-[10px] text-[#9aa6b8]">{c.label}</div>
            <div className="mt-0.5 text-[17px] font-extrabold" style={{ color: c.color }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* 큐 */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">신고 큐</span>
            <span className="text-[11px] text-[#9aa6b8]">미처리 우선 · 최신순</span>
          </div>
          <ModerationQueue items={items} />
        </div>

        <div className="flex flex-col gap-4">
          {/* 처리 소요 */}
          <div className={card}>
            <span className="text-[15px] font-extrabold text-white">처리 소요</span>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-2.5">
                <span className="text-[11.5px] text-[#9aa6b8]">평균 접수→처리</span>
                <span className="text-[13px] font-extrabold text-white">
                  {hoursLabel(stats.avgHandleHours)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-2.5">
                <span className="text-[11.5px] text-[#9aa6b8]">가장 오래 대기</span>
                <span
                  className="text-[13px] font-extrabold"
                  style={{ color: (stats.oldestOpenHours ?? 0) > 72 ? "#f87171" : "#ffffff" }}
                >
                  {hoursLabel(stats.oldestOpenHours)}
                </span>
              </div>
            </div>
            <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
              처리 이력이 있는 신고에서만 계산합니다. 아직 처리한 건이 없으면 &ldquo;—&rdquo; 로
              표시돼요. 목표는 접수→판정 72시간이며, 초과 대기 건은 빨간색으로 표시됩니다.
            </div>
          </div>

          {/* 운영 기준 */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-extrabold text-white">운영 기준</span>
              <span className="text-[11px] text-[#9aa6b8]">정책 문서</span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {MODERATION_PIPELINE.map((s, i) => (
                <li key={s.id} className="flex gap-2.5">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[rgba(126,162,255,.16)] text-[9px] font-bold text-[#7ea2ff]">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[11.5px] font-bold text-white">{s.label}</span>
                    <span className="ml-1.5 text-[10.5px] text-[#9aa6b8]">{s.description}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
              이 목록은 처리 순서를 정한 정책이며, 실행 지표가 아닙니다.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
