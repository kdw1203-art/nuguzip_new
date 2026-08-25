import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState, EmptyState } from "@/app/components/ui/EmptyState";
import { buildApplyCalendar, weekSlugFor } from "@/lib/applyhome/calendar";
import { seoAlternates } from "@/lib/seo/alternates";

/* [개선 #17] 이번 주 청약 캘린더 — 접수 시작·마감을 날짜별로.
   "이번주 청약"은 매주 스스로 새로워지는 검색 수요다. 청약홈 실데이터의
   접수기간을 날짜로 묶어 보여준다 — 경쟁률·특공 표는 /apply 가 맡는다. */

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "이번 주 청약 캘린더 — 접수 시작·마감 일정 | 누구집",
  description:
    "이번 주와 다음 달 아파트 청약 접수 시작·마감 일정을 날짜별로 정리했습니다. 청약홈(한국부동산원) 공공데이터 기준.",
  alternates: seoAlternates("/apply/calendar"),
  robots: { index: true, follow: true },
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default async function ApplyCalendarPage() {
  const cal = await buildApplyCalendar();
  const today = todayKst();

  return (
    <PageShell breadcrumb="동네이야기 › 청약 센터 › 청약 캘린더" title="청약 캘린더">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 t-body text-text-2">
            앞으로 5주 안의 아파트 청약 <b className="text-ink">접수 시작·마감</b>을
            날짜별로 모았어요. 출처는 청약홈(한국부동산원) 공공데이터입니다.
          </p>
          <Link
            href="/apply"
            className="chip press shrink-0 border border-line bg-surface px-3.5 py-2 t-sub font-bold text-primary no-underline"
          >
            경쟁률·특별공급 보기 ›
          </Link>
        </div>

        {cal.state === "unconfigured" ? (
          <EmptyState
            icon="lock"
            title="청약홈 공공데이터 연동이 설정되지 않았어요"
            desc="연동이 켜지면 접수 일정이 자동으로 채워집니다."
            action={{ href: "https://www.applyhome.co.kr", label: "청약홈에서 직접 보기 ↗" }}
          />
        ) : cal.state === "error" ? (
          <ErrorState
            title="청약 일정을 지금 불러오지 못했어요"
            desc="일정이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요."
            cause={cal.cause}
            action={{ label: "청약 센터로 이동", href: "/apply" }}
          />
        ) : cal.days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="앞으로 5주 안에 잡힌 접수 일정이 없어요"
            desc="새 모집공고가 올라오면 이 캘린더에 자동으로 나타납니다."
            action={{ href: "/apply", label: "전체 공고 보기" }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cal.days.map((day, di) => (
              <section
                key={day.date}
                className={`rise-in-${Math.min(di + 1, 6)} card rounded-[18px] p-[18px] ${
                  day.date === today ? "border-primary/40" : ""
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="t-section text-ink">{dateLabel(day.date)}</h2>
                  {day.date === today && (
                    <span className="rounded-md bg-primary-soft px-1.5 py-0.5 t-caption font-extrabold text-primary">
                      오늘
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {day.starts.map((it, i) => (
                    <CalendarRow key={`s${i}`} kind="start" it={it} />
                  ))}
                  {day.ends.map((it, i) => (
                    <CalendarRow key={`e${i}`} kind="end" it={it} />
                  ))}
                </div>
              </section>
            ))}
            <p className="text-center t-sub text-text-3">
              최근 공고 200건 기준 · 30분마다 갱신 · 정확한 일정·자격은 청약홈 공고
              원문을 확인하세요
            </p>
          </div>
        )}
        {/* [#53] 주간 아카이브 링크 — 지난 주 일정은 고정 URL 로 남는다 */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[weekSlugFor(-2), weekSlugFor(-1), weekSlugFor(0)].map((s) => (
            <Link
              key={s}
              href={`/apply/calendar/${s}`}
              className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
            >
              {s === weekSlugFor(0) ? "이번 주 아카이브" : `${s} 일정`}
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function CalendarRow({
  kind,
  it,
}: {
  kind: "start" | "end";
  it: {
    houseName: string;
    region: string;
    houseKind: string | null;
    receiptStart: string | null;
    receiptEnd: string | null;
    portalUrl: string | null;
  };
}) {
  const body = (
    <>
      <span
        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
          kind === "start" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
        }`}
      >
        {kind === "start" ? "접수 시작" : "접수 마감"}
      </span>
      <span className="min-w-0 flex-1 truncate t-body font-bold text-ink">
        {it.houseName}
        <span className="ml-1.5 t-sub font-medium text-text-3">
          {it.region}
          {it.houseKind ? ` · ${it.houseKind}` : ""}
        </span>
      </span>
      {it.portalUrl && <span className="shrink-0 t-sub font-bold text-primary">공고 ↗</span>}
    </>
  );
  return it.portalUrl ? (
    <a
      href={it.portalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 no-underline"
    >
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">{body}</div>
  );
}
