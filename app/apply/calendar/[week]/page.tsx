import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState, EmptyState } from "@/app/components/ui/EmptyState";
import {
  buildApplyWeek,
  parseWeekSlug,
  weekSlugFor,
} from "@/lib/applyhome/calendar";
import { seoAlternates } from "@/lib/seo/alternates";

/* [#53] 주간 청약 아카이브 — /apply/calendar/2026-w35 형태의 고정 URL.
 * "이번주 청약"(캘린더)과 달리 이 페이지는 특정 주의 일정으로 고정돼,
 * 매주 새 URL 이 쌓이는 프로그래매틱 축이 된다. 데이터 커버리지는 최신 공고
 * 400건 — 오래된 주는 공고가 그 창을 벗어나 비어 보일 수 있어, 그 사실을
 * 화면에 명기한다(없는 데이터를 있는 척하지 않는다). */

export const revalidate = 3600;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

function weekLabel(slug: string, range: { start: string; end: string }): string {
  const s = new Date(`${range.start}T00:00:00+09:00`);
  const weekNo = slug.split("-w")[1];
  return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${weekNo}주차`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  const range = parseWeekSlug(week);
  /* 메타데이터 단계에서 404 를 확정해야 상태코드가 200 으로 굳지 않는다
     (ISR 스트리밍은 본문 notFound() 시점엔 이미 헤더를 보낸 뒤다 — 로컬 실측). */
  if (!range) notFound();
  const label = weekLabel(week, range);
  return {
    title: `${label} 청약 일정 — 접수 시작·마감 | 누구집`,
    description: `${range.start}~${range.end} 아파트 청약 접수 시작·마감 일정. 청약홈(한국부동산원) 공공데이터 기준.`,
    alternates: seoAlternates(`/apply/calendar/${week.toLowerCase()}`),
    robots: { index: true, follow: true },
  };
}

export default async function ApplyWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const slug = week.toLowerCase();
  /* 슬러그 검증은 데이터 조회 **전에** 동기로 — await 뒤의 notFound() 는 스트리밍이
     시작된 뒤라 상태코드가 200 으로 굳는 soft-404 가 된다(로컬 실측). */
  const range = parseWeekSlug(slug);
  if (range === null) notFound();
  const result = await buildApplyWeek(range);
  if (result === null) notFound();
  const label = range ? weekLabel(slug, range) : slug;
  const thisWeek = weekSlugFor(0);

  return (
    <PageShell breadcrumb="동네이야기 › 청약 센터 › 청약 캘린더" title={`${label} 청약 일정`}>
      <div className="mx-auto w-full max-w-[760px]">
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-[1.7] text-text-2">
            {range ? (
              <>
                <b className="text-ink">{range.start} ~ {range.end}</b> 접수 시작·마감
                일정입니다. 출처는 청약홈(한국부동산원) 공공데이터입니다.
              </>
            ) : (
              "주간 청약 일정입니다."
            )}
          </p>
          <Link
            href="/apply/calendar"
            className="chip press shrink-0 border border-line bg-surface px-3.5 py-2 text-[12px] font-bold text-primary no-underline"
          >
            이번 주 캘린더 ›
          </Link>
        </div>

        {result.state === "unconfigured" ? (
          <EmptyState
            icon="lock"
            title="청약홈 공공데이터 연동이 설정되지 않았어요"
            desc="연동이 켜지면 접수 일정이 자동으로 채워집니다."
            action={{ href: "https://www.applyhome.co.kr", label: "청약홈에서 직접 보기 ↗" }}
          />
        ) : result.state === "error" ? (
          <ErrorState
            title="청약 일정을 지금 불러오지 못했어요"
            desc="일정이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요."
            cause={result.cause}
            action={{ label: "청약 센터로 이동", href: "/apply" }}
          />
        ) : result.days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={`${label}에 잡힌 접수 일정이 확인되지 않아요`}
            desc="이 주에 접수가 없었거나, 오래된 주라 최신 공고 400건 창을 벗어났을 수 있습니다. 정확한 과거 일정은 청약홈에서 확인하세요."
            action={{ href: "/apply/calendar", label: "이번 주 일정 보기" }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {result.days.map((day, di) => (
              <section
                key={day.date}
                className={`rise-in-${Math.min(di + 1, 6)} card rounded-[18px] p-[18px]`}
              >
                <h2 className="mb-2 text-[14px] font-extrabold text-ink">{dateLabel(day.date)}</h2>
                <div className="flex flex-col gap-1.5">
                  {day.starts.map((it, i) => (
                    <WeekRow key={`s${i}`} kind="start" it={it} />
                  ))}
                  {day.ends.map((it, i) => (
                    <WeekRow key={`e${i}`} kind="end" it={it} />
                  ))}
                </div>
              </section>
            ))}
            <p className="text-center text-[11px] text-text-3">
              최근 공고 400건 기준 · 정확한 일정·자격은 청약홈 공고 원문을 확인하세요
            </p>
          </div>
        )}

        {/* 주간 네비 — 지난주·이번주만 (미래 주는 캘린더가 담당) */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[weekSlugFor(-2), weekSlugFor(-1), thisWeek].map((s) =>
            s === slug ? null : (
              <Link
                key={s}
                href={`/apply/calendar/${s}`}
                className="chip border border-line bg-surface px-3 py-1.5 text-[11.5px] font-bold text-text-2 no-underline"
              >
                {s === thisWeek ? "이번 주" : s}
              </Link>
            ),
          )}
        </div>
      </div>
    </PageShell>
  );
}

function WeekRow({
  kind,
  it,
}: {
  kind: "start" | "end";
  it: {
    houseName: string;
    region: string;
    houseKind: string | null;
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
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
        {it.houseName}
        <span className="ml-1.5 text-[11px] font-medium text-text-3">
          {it.region}
          {it.houseKind ? ` · ${it.houseKind}` : ""}
        </span>
      </span>
      {it.portalUrl && <span className="shrink-0 text-[11px] font-bold text-primary">공고 ↗</span>}
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
