import Link from "next/link";
import { countPendingListings } from "@/lib/listings/store-db";
import {
  loadAdminDashboardMetrics,
  loadRecentMembers,
  loadAdminOpsPanels,
  type AdminDashboardMetrics,
  type AdminMembersData,
  type AdminOpsPanels,
} from "@/lib/newui/admin-metrics";
import {
  loadExpertOpsSummary,
  type ExpertOpsSummary,
} from "@/lib/admin/expert-ops-metrics";
import { loadAdminKpi, type AdminKpi } from "@/lib/admin/stats";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";

// 실집계(#83): DAU·신규 노트·전환율·구독 매출 4카드와 처리 대기 목록은
// lib/newui/admin-metrics 실데이터 사용 — 조회 실패 시 "—" 또는 정직한 빈/오류 상태.
//
// G10: 예전에는 조회가 실패하거나 0건일 때 목업(가짜 신고 3건, 초록불 ETL 3줄,
// 가짜 콘텐츠 검수 3건, 가짜 전문가 승인 심사)을 그대로 그렸다. 운영 대시보드에서
// 존재하지 않는 처리 대기 건이 보이면 운영자가 없는 일을 처리하려 들고,
// 죽은 파이프라인이 초록불로 보이면 장애를 놓친다. 전부 제거하고
// 실집계 + 실제 콘솔 링크 + EmptyState/ErrorState 로 대체했다.
export const dynamic = "force-dynamic";

const darkCard =
  "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";
const panelCard = "rounded-2xl bg-[#12161f] p-5 border border-[rgba(255,255,255,.06)]";

export default async function AdminDashboardPage() {
  let metrics: AdminDashboardMetrics = { kpis: [], pending: [] };
  let membersData: AdminMembersData = { total: null, members: [] };
  let ops: AdminOpsPanels = {
    reportCounts: [],
    inquiries: [],
    signupTrend: [],
    etl: [],
  };
  let expertOps: ExpertOpsSummary | null = null;
  let kpi: AdminKpi | null = null;
  // 조회 실패는 "0건"과 다르다 — 실패 사유를 담아 두고 화면에서 구분해 표시한다.
  let loadError: string | null = null;
  try {
    [metrics, membersData, ops, expertOps, kpi] = await Promise.all([
      loadAdminDashboardMetrics(),
      loadRecentMembers(5),
      loadAdminOpsPanels(),
      loadExpertOpsSummary(),
      loadAdminKpi(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  // DB 미연결이면 loadAdminKpi 는 예외 대신 전부 0 을 돌려준다 — 0 과 "모름"을 구분한다.
  const kpiReady = Boolean(kpi?.supabaseConfigured);
  const num = (v: number | null | undefined): string =>
    kpiReady && typeof v === "number" ? v.toLocaleString("ko-KR") : "—";
  /* 2026-07-26: `.catch(() => 0)` 이었다. 집계가 실패하면 헤더에 "매물 검수 0건"
     이 뜨고, 운영자는 검수 화면을 열 이유가 없다고 읽는다. 실패는 "—" 로 쓴다. */
  const pendingListingsCount = await countPendingListings().then(
    (n) => n,
    (err: unknown) => {
      logger.error("[admin] 검수 대기 건수 집계 실패", err);
      return null;
    },
  );
  const pendingListingsLabel =
    pendingListingsCount === null ? "—" : pendingListingsCount.toLocaleString("ko-KR");
  const maxSignup = Math.max(1, ...ops.signupTrend.map((d) => d.count));
  // 신고 처리 배지: content_reports 상태별 실집계에서 open 건수 (없으면 null → 배지 숨김)
  const openReportCount =
    ops.reportCounts.find((c) => c.status === "open")?.count ?? null;
  const kpis =
    metrics.kpis.length > 0
      ? metrics.kpis
      : ([
          { label: "DAU (24h)", value: "—", delta: null, accent: false },
          { label: "신규 임장노트 (24h)", value: "—", delta: null, accent: false },
          { label: "노트 작성 전환율", value: "—", delta: null, accent: true },
          { label: "구독 매출", value: "—", delta: null, accent: false },
        ] satisfies AdminDashboardMetrics["kpis"]);
  const today = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(new Date())
    .replace(/\.\s*/g, ".")
    .replace(/\.$/, "");

  return (
    <>
      {/* 헤더 */}
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div className="text-[19px] font-extrabold text-white">
          운영 대시보드{" "}
          <span className="text-xs font-medium text-[#9aa6b8]">
            {today} (실시간)
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          {/* 매물 검수 대기 링크 (집주인 직접·중개사 등록) */}
          <Link
            href="/admin/listings"
            className="rounded-[10px] bg-[rgba(126,162,255,.15)] px-3.5 py-[7px] font-extrabold text-[#7ea2ff]"
          >
            매물 검수 {pendingListingsCount === null ? "—" : `${pendingListingsLabel}건`}
          </Link>
          <span className="rounded-[10px] bg-[rgba(255,255,255,.07)] px-3.5 py-[7px] font-semibold text-[#c9d2e0]">
            오늘
          </span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">7일</span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">30일</span>
        </div>
      </div>

      {/* KPI 4종 — 실집계 (실패 시 "—") */}
      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${darkCard} p-4`}>
            <div className="text-[11px] text-[#9aa6b8]">{k.label}</div>
            <div
              className={`mt-1 text-[22px] font-extrabold ${
                k.accent ? "text-[#7ea2ff]" : "text-white"
              }`}
            >
              {k.value}
              {k.delta ? (
                <>
                  {" "}
                  <span className="text-[11px] text-[#4ade80]">{k.delta}</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* 처리 대기 · 크롤링 파이프라인 */}
      <div className="rise-in-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-white">
              처리 대기{" "}
              <span className="text-[10px] font-medium text-[#9aa6b8]">
                content_reports 최근 5건
              </span>
            </div>
            {ops.reportCounts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {ops.reportCounts.map((c) => (
                  <span
                    key={c.status}
                    className="rounded-full bg-[rgba(255,255,255,.08)] px-2.5 py-[3px] text-[10px] font-bold text-[#c9d2e0]"
                  >
                    {c.status} {c.count.toLocaleString("ko-KR")}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {metrics.pending.length === 0 ? (
            loadError ? (
              <ErrorState
                tone="admin"
                title="처리 대기를 불러오지 못했어요"
                desc="조회가 실패해 실제 대기 건수를 알 수 없습니다. 0건이라는 뜻이 아닙니다."
                cause={loadError}
                action={{ label: "신고 콘솔 열기", href: "/admin/moderation" }}
              />
            ) : (
              <EmptyState
                tone="admin"
                icon="check"
                title="처리 대기 없음"
                desc="접수된 신고가 없습니다."
                action={{ label: "신고 콘솔 열기", href: "/admin/moderation" }}
              />
            )
          ) : (
            metrics.pending.map((p, i) => (
              <div
                key={`${i}-${p.text}`}
                className={`flex items-center justify-between gap-3 py-[9px] text-xs ${
                  i < metrics.pending.length - 1
                    ? "border-b border-[rgba(255,255,255,.06)]"
                    : ""
                }`}
              >
                <span className="text-[#c9d2e0]">{p.text}</span>
                <span className="font-bold" style={{ color: p.color }}>
                  {p.status}
                </span>
              </div>
            ))
          )}
        </div>
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="text-sm font-extrabold text-white">
            ETL 상태{" "}
            <span className="text-[10px] font-medium text-[#9aa6b8]">
              market_ingest_log 최신 {ops.etl.length}건
            </span>
          </div>
          {/* 죽은 파이프라인을 초록불 목업으로 덮으면 장애를 놓친다 — 기록이 없으면 없다고 말한다. */}
          {ops.etl.length === 0 ? (
            loadError ? (
              <ErrorState
                tone="admin"
                title="ETL 상태를 불러오지 못했어요"
                desc="파이프라인이 정상이라는 뜻이 아니라, 상태를 확인하지 못했다는 뜻입니다."
                cause={loadError}
                action={{ label: "데이터 콘솔 열기", href: "/admin/data" }}
              />
            ) : (
              <EmptyState
                tone="admin"
                icon="clock"
                title="적재 기록 없음"
                desc="market_ingest_log 에 남은 실행 기록이 없습니다. 수집이 한 번도 돌지 않았을 수 있어요."
                action={{ label: "데이터 콘솔 열기", href: "/admin/data" }}
              />
            )
          ) : (
            ops.etl.map((p, i, arr) => (
              <div
                key={`${i}-${p.name}`}
                className={`flex items-center justify-between gap-3 py-2 text-xs ${
                  i < arr.length - 1
                    ? "border-b border-[rgba(255,255,255,.06)]"
                    : ""
                }`}
              >
                <span className="min-w-0 truncate text-[#c9d2e0]">{p.name}</span>
                <span className="shrink-0 font-bold" style={{ color: p.color }}>
                  {p.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 최근 문의 · 가입 추이 (실집계 — 실패 시 정직한 빈 상태) */}
      <div className="rise-in-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="text-sm font-extrabold text-white">
            최근 문의{" "}
            <span className="text-[10px] font-medium text-[#9aa6b8]">
              /support 접수 · 관리자 인박스 최신 5건
            </span>
          </div>
          {/* "없거나 불러올 수 없습니다"는 두 상태를 뭉갠 문구였다 — 실패와 0건을 나눠 말한다. */}
          {ops.inquiries.length === 0 ? (
            loadError ? (
              <ErrorState
                tone="admin"
                title="문의를 불러오지 못했어요"
                desc="문의가 없다는 뜻이 아닙니다."
                cause={loadError}
              />
            ) : (
              <EmptyState
                tone="admin"
                icon="mail"
                title="새 문의 없음"
                desc="/support 로 접수된 문의가 없습니다."
              />
            )
          ) : (
            ops.inquiries.map((q, i) => (
              <div
                key={`${i}-${q.title}`}
                className={`flex items-center justify-between gap-3 py-[9px] text-xs ${
                  i < ops.inquiries.length - 1
                    ? "border-b border-[rgba(255,255,255,.06)]"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[#c9d2e0]">{q.title}</div>
                  {q.from ? (
                    <div className="mt-0.5 truncate text-[10px] text-[#9aa6b8]">
                      {q.from}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] text-[#9aa6b8]">
                  {q.when}
                </span>
              </div>
            ))
          )}
        </div>
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="text-sm font-extrabold text-white">
            가입 추이{" "}
            <span className="text-[10px] font-medium text-[#9aa6b8]">
              일별 최근 14일
            </span>
          </div>
          {ops.signupTrend.length === 0 ? (
            <ErrorState
              tone="admin"
              title="가입 추이를 불러오지 못했어요"
              desc="profiles 조회가 실패했습니다. 가입이 0명이라는 뜻이 아닙니다."
              cause={loadError ?? undefined}
            />
          ) : (
            <>
              <div className="flex h-[72px] items-end gap-[5px]">
                {ops.signupTrend.map((d) => (
                  <div
                    key={d.label}
                    className="flex min-w-0 flex-1 flex-col items-center"
                    title={`${d.label} · ${d.count}명`}
                  >
                    <div
                      className="w-full rounded-t-[3px]"
                      style={{
                        height: `${Math.max(3, Math.round((d.count / maxSignup) * 64))}px`,
                        background:
                          d.count > 0 ? "#7ea2ff" : "rgba(255,255,255,.12)",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-[#9aa6b8]">
                <span>{ops.signupTrend[0].label}</span>
                <span>
                  {ops.signupTrend[ops.signupTrend.length - 1].label} · 합{" "}
                  {ops.signupTrend
                    .reduce((a, d) => a + d.count, 0)
                    .toLocaleString("ko-KR")}
                  명
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 세부 4종 (9r) — 회원 · 콘텐츠 · 신고 · 전문가 승인 */}
      <div className="rise-in-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 회원 관리 — P2-12: profiles 최근 가입 실데이터 (실패 시 빈 상태) */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              회원 관리
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              {membersData.total !== null
                ? `총 ${membersData.total.toLocaleString("ko-KR")}명`
                : "총 —명"}
            </span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-1.5 border-b border-[rgba(255,255,255,.08)] py-1.5 text-[10px] text-[#9aa6b8]">
            <span>최근 가입 회원</span>
            <span className="text-right">가입</span>
          </div>
          {membersData.members.length === 0 ? (
            membersData.total === null || loadError ? (
              <ErrorState
                tone="admin"
                title="회원 데이터를 불러오지 못했어요"
                desc="DB 연결·권한을 확인해 주세요."
                cause={loadError ?? undefined}
              />
            ) : (
              <EmptyState
                tone="admin"
                icon="users"
                title="최근 가입 회원 없음"
                desc="아직 가입한 회원이 없습니다."
              />
            )
          ) : (
            membersData.members.map((m, i) => (
              <div
                key={`${i}-${m.name}`}
                className={`grid grid-cols-[1.4fr_1fr] items-center gap-1.5 py-2 text-[11px] ${
                  i < membersData.members.length - 1
                    ? "border-b border-[rgba(255,255,255,.06)]"
                    : ""
                }`}
              >
                <span className="truncate font-bold text-white">{m.name}</span>
                <span className="text-right text-[#9aa6b8]">{m.joined}</span>
              </div>
            ))
          )}
        </div>

        {/* 노트 · 콘텐츠 관리 — G10: 가짜 검수 대기 3건 + 동작하지 않는 버튼을 걷어내고
            실제 테이블 집계와 실제 콘솔 링크만 남긴다. */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              노트 · 콘텐츠 현황
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              {kpiReady ? "DB 실집계" : "DB 미연결 · 집계 불가"}
            </span>
          </div>
          {!kpiReady ? (
            <ErrorState
              tone="admin"
              title="콘텐츠 집계를 불러오지 못했어요"
              desc="Supabase 연결·권한을 확인해 주세요. 0건이라는 뜻이 아닙니다."
              cause={loadError ?? undefined}
              action={{ label: "데이터 콘솔 열기", href: "/admin/data" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "임장노트",
                    value: num(kpi?.totalInspections),
                    sub: `최근 7일 +${num(kpi?.inspectionsThisWeek)}`,
                  },
                  {
                    label: "커뮤니티 글",
                    value: num(kpi?.totalPosts),
                    sub: `최근 7일 +${num(kpi?.postsThisWeek)}`,
                  },
                  {
                    label: "리포트 문서",
                    value: num(kpi?.totalReportDocs),
                    sub: `오늘 +${num(kpi?.reportDocsToday)}`,
                  },
                  {
                    label: "매물 검수 대기",
                    value: pendingListingsLabel,
                    sub: "소유확인 심사 큐",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3 py-2.5"
                  >
                    <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
                    <div className="mt-0.5 text-[17px] font-extrabold text-white">
                      {s.value}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#6b7688]">
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Link
                  href="/admin/listings"
                  className="rounded-[10px] bg-[rgba(126,162,255,.15)] px-3 py-[6px] font-extrabold text-[#7ea2ff]"
                >
                  매물 검수
                </Link>
                <Link
                  href="/admin/moderation"
                  className="rounded-[10px] bg-[rgba(255,255,255,.08)] px-3 py-[6px] font-bold text-[#c9d2e0]"
                >
                  신고 · 블라인드
                </Link>
                <Link
                  href="/admin/data"
                  className="rounded-[10px] bg-[rgba(255,255,255,.08)] px-3 py-[6px] font-bold text-[#c9d2e0]"
                >
                  데이터 적재
                </Link>
              </div>
            </>
          )}
        </div>

        {/* 신고 처리 */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              신고 처리
              {openReportCount !== null ? (
                <span className="ml-1 rounded-full bg-danger px-[7px] py-px text-[10px] font-extrabold text-white">
                  {openReportCount.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              content_reports 상태별 실집계
            </span>
          </div>
          {/* G10: 존재하지 않는 신고 3건(연락처 유도·허위 매물·비방 댓글)을 동작 안 하는
              버튼과 함께 그리던 자리. 없는 일을 처리하려 들게 만들므로 제거하고,
              실제 처리는 /admin/moderation 콘솔로 보낸다. */}
          {ops.reportCounts.length === 0 ? (
            loadError ? (
              <ErrorState
                tone="admin"
                title="신고 집계를 불러오지 못했어요"
                desc="신고가 없다는 뜻이 아니라, 집계를 확인하지 못했다는 뜻입니다."
                cause={loadError}
                action={{ label: "신고 콘솔 열기", href: "/admin/moderation" }}
              />
            ) : (
              <EmptyState
                tone="admin"
                icon="shield"
                title="접수된 신고 없음"
                desc="content_reports 에 기록된 신고가 없습니다."
                action={{ label: "신고 콘솔 열기", href: "/admin/moderation" }}
              />
            )
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {ops.reportCounts.map((c) => {
                  const isOpen = c.status === "open";
                  return (
                    <div
                      key={c.status}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${
                        isOpen
                          ? "border-[rgba(214,69,69,.25)] bg-[rgba(214,69,69,.08)]"
                          : "border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)]"
                      }`}
                    >
                      <div className="text-xs font-extrabold text-white">
                        {c.status}
                      </div>
                      <div
                        className={`text-[15px] font-extrabold ${
                          isOpen ? "text-[#f87171]" : "text-[#c9d2e0]"
                        }`}
                      >
                        {c.count.toLocaleString("ko-KR")}건
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link
                href="/admin/moderation"
                className="rounded-[10px] bg-[rgba(126,162,255,.15)] px-3.5 py-[7px] text-center text-[11px] font-extrabold text-[#7ea2ff]"
              >
                신고 콘솔에서 처리하기
              </Link>
            </>
          )}
        </div>

        {/* 전문가 승인 */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              전문가 승인
              {expertOps && !expertOps.isDemo && expertOps.pendingVerifications > 0 ? (
                <span className="ml-1 rounded-full bg-danger px-[7px] py-px text-[10px] font-extrabold text-white">
                  {expertOps.pendingVerifications.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              승인 시 프로 배지·마켓 발행 권한
            </span>
          </div>
          {/* G10: "이OO 세무사 · 국세청 대조 ✓" 같은 존재하지 않는 심사 건을 그리던 자리.
              실제 심사 큐는 /admin/quality 의 VerificationQueue 가 이미 담당한다. */}
          {!expertOps || expertOps.isDemo ? (
            <ErrorState
              tone="admin"
              title="전문가 심사 현황을 불러오지 못했어요"
              desc="DB 연결·권한을 확인해 주세요. 심사 대기가 없다는 뜻이 아닙니다."
              cause={loadError ?? undefined}
              action={{ label: "심사 콘솔 열기", href: "/admin/quality" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "심사 대기",
                    value: expertOps.pendingVerifications,
                    color: expertOps.pendingVerifications > 0 ? "#f2c94c" : "#c9d2e0",
                  },
                  {
                    label: "승인 전문가",
                    value: expertOps.approvedExperts,
                    color: "#4ade80",
                  },
                  {
                    label: "미답변 상담",
                    value: expertOps.consultationsOpen,
                    color: expertOps.consultationsOpen > 0 ? "#f87171" : "#c9d2e0",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3 py-2.5 text-center"
                  >
                    <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
                    <div
                      className="mt-0.5 text-[18px] font-extrabold"
                      style={{ color: s.color }}
                    >
                      {s.value.toLocaleString("ko-KR")}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3 text-[11px] text-[#9aa6b8]">
                최근 7일 답변{" "}
                <b className="text-[#c9d2e0]">
                  {expertOps.consultationsAnswered7d.toLocaleString("ko-KR")}건
                </b>{" "}
                · 최근 30일 상담{" "}
                <b className="text-[#c9d2e0]">
                  {expertOps.consultationsTotal30d.toLocaleString("ko-KR")}건
                </b>
              </div>
              {expertOps.pendingVerifications === 0 ? (
                <EmptyState
                  tone="admin"
                  icon="check"
                  title="심사 대기 없음"
                  desc="제출된 전문가 인증 신청이 없습니다."
                  action={{ label: "심사 콘솔 열기", href: "/admin/quality" }}
                />
              ) : (
                <Link
                  href="/admin/quality"
                  className="rounded-[10px] bg-[rgba(126,162,255,.15)] px-3.5 py-[7px] text-center text-[11px] font-extrabold text-[#7ea2ff]"
                >
                  심사 콘솔에서 서류 검토하기
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
