"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * F1 — 수집·집계·알림 작업 수동 실행 패널.
 *
 * 각 크론 라우트는 `isAdminApiRequest()` 로도 인가되므로 관리자 세션에서 바로 호출된다.
 * 결과는 라우트가 돌려준 JSON 요약을 그대로 보여준다(가공·추정 없음).
 * 브라우저 confirm() 은 쓰지 않는다 — 두 번 눌러 확정하는 방식.
 *
 * ── 여기 적힌 스케줄은 추정이 아니다 ──────────────────────────────────────
 * `schedule` 값은 `.github/workflows/etl.yml` 이 실제로 호출하는 목록과 1:1로 맞춘다.
 * 이전 버전은 크론 10개만 버튼으로 두고 "정규 스케줄은 GitHub Actions 가 담당합니다"
 * 라고만 적어, 어느 작업이 그 스케줄에 실제로 들어 있는지 알 수 없었다.
 * 그 사이 `market-aggregates-refresh`·`price-alerts`·`saved-search-alerts`·
 * `reengage-reminders` 는 `vercel.json` 의 crons 에만 있었고(= 이 플랜에서는 실행되지
 * 않는다) 어디에도 드러나지 않은 채 한 번도 돌지 않았다. 라우트를 추가했는데 스케줄에
 * 넣는 걸 잊으면 아무도 모른다는 것이 문제였으므로, 스케줄을 화면에 적는다.
 *
 * ⚠️ 새 크론 라우트를 만들면 (1) etl.yml 에 호출을 추가하고 (2) 여기에도 한 줄 추가한다.
 */

type Group = "수집" | "집계" | "알림";

interface Job {
  key: string;
  label: string;
  path: string;
  hint: string;
  group: Group;
  /** etl.yml 기준 실제 자동 실행 주기. 자동 실행이 없으면 "수동 전용". */
  schedule: string;
  /** 실행에 외부 인증키가 필요한 작업 */
  needsKey?: boolean;
  /** 누르면 실제 사용자에게 알림이 나가는 작업 */
  sends?: boolean;
}

const JOBS: Job[] = [
  // ── 수집 ──────────────────────────────────────────────────────────────
  {
    key: "molit",
    label: "실거래 적재",
    path: "/api/cron/molit-transactions-ingest",
    hint: "시군구 슬라이스 단위. 이미 채워진 구·월은 건너뜁니다.",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "reb",
    label: "R-ONE 지수",
    path: "/api/cron/reb-ingest",
    hint: "부동산원 매매·전세 지수 시계열",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "kb",
    label: "KB 시세",
    path: "/api/cron/kb-ingest",
    hint: "KB 주간·월간 시계열",
    group: "수집",
    schedule: "하루 2회",
  },
  {
    key: "kosis",
    label: "KOSIS 통계",
    path: "/api/cron/kosis-ingest",
    hint: "국가통계포털 보조 지표",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "ecos",
    label: "한국은행 금리",
    path: "/api/cron/ecos-sync",
    hint: "기준금리·주담대 금리",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "onbid",
    label: "온비드 공매",
    path: "/api/cron/onbid-sync",
    hint: "공매 물건 목록",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "court",
    label: "법원경매",
    path: "/api/cron/court-auction-sync",
    hint: "경매 물건 동기화",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "redev",
    label: "정비사업",
    path: "/api/cron/redevelopment-ingest",
    hint: "서울 열린데이터광장 정비사업장",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "apt",
    label: "단지 마스터",
    path: "/api/cron/apt-master-ingest",
    hint: "전국 공동주택 단지 정보 (슬라이스)",
    group: "수집",
    schedule: "하루 2회",
    needsKey: true,
  },
  {
    key: "crawl",
    label: "단지 시세",
    path: "/api/cron/complex-crawl",
    hint: "단지별 시세 수집",
    group: "수집",
    schedule: "하루 2회",
  },
  {
    key: "codef",
    label: "CODEF KB 시세",
    path: "/api/cron/codef-sync",
    hint: "대상 단지 목록이 아직 없어 지금은 건너뜁니다(단건 테스트만 가능).",
    group: "수집",
    schedule: "수동 전용",
    needsKey: true,
  },
  // ── 집계 ──────────────────────────────────────────────────────────────
  {
    key: "agg",
    label: "실거래 집계 갱신",
    path: "/api/cron/market-aggregates-refresh",
    hint: "/tx 랜딩·지도 시세 색상이 쓰는 집계 MV 재계산 (실측 약 9초)",
    group: "집계",
    schedule: "하루 2회 (적재 직후)",
  },
  // ── 알림 ──────────────────────────────────────────────────────────────
  {
    key: "price-alerts",
    label: "관심 단지 가격 알림",
    path: "/api/cron/price-alerts",
    hint: "대표 면적대 최근 6건 평균이 ±1% 넘게 움직였을 때만 발송",
    group: "알림",
    schedule: "하루 1회",
    sends: true,
  },
  {
    key: "saved-search",
    label: "저장 검색 알림",
    path: "/api/cron/saved-search-alerts",
    hint: "저장한 조건의 매치 수가 늘었을 때만 발송(첫 관측은 기준선만)",
    group: "알림",
    schedule: "하루 1회",
    sends: true,
  },
  {
    key: "attendance",
    label: "출석 리마인드",
    path: "/api/cron/attendance-reminders",
    hint: "오늘 아직 출석하지 않은 웹푸시 구독자에게 발송",
    group: "알림",
    schedule: "하루 1회",
    sends: true,
  },
  {
    key: "reengage",
    label: "이탈 리마인드 (모의)",
    path: "/api/cron/reengage-reminders?dry=1",
    hint: "?dry=1 — 대상만 세고 아무것도 보내지 않습니다. 실제 발송은 화요일 스케줄에서만.",
    group: "알림",
    schedule: "화요일 1회",
  },
];

const GROUPS: { key: Group; note: string }[] = [
  { key: "수집", note: "외부 소스 → DB 적재" },
  { key: "집계", note: "적재된 실거래 → 화면용 집계" },
  { key: "알림", note: "실제 사용자에게 발송됩니다" },
];

type State = { status: "idle" | "arm" | "busy" | "done" | "fail"; text?: string };

/** 응답 JSON에서 사람이 읽을 요약 한 줄 추출 — 키 존재하는 값만 표시 */
function summarize(json: Record<string, unknown>): string {
  const parts: string[] = [];
  const pick = (k: string, label: string) => {
    const v = json[k];
    if (typeof v === "number") parts.push(`${label} ${v.toLocaleString("ko-KR")}`);
  };
  pick("inserted", "적재");
  pick("upserted", "반영");
  pick("rows", "행");
  pick("count", "건");
  pick("processed", "처리");
  pick("alreadyCovered", "기존커버");
  pick("checked", "확인");
  pick("notified", "알림");
  pick("sent", "발송");
  pick("candidates", "대상");
  pick("smsSent", "SMS");
  pick("pushSent", "푸시");
  pick("dormant", "휴면");
  pick("errors", "오류");
  // 집계 갱신은 rows 가 뷰별 객체로 온다 — 숫자만 골라 합계로 요약한다.
  const rows = json.rows;
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const nums = Object.values(rows as Record<string, unknown>).filter(
      (v): v is number => typeof v === "number",
    );
    if (nums.length > 0) {
      parts.push(`집계 ${nums.reduce((a, b) => a + b, 0).toLocaleString("ko-KR")}행`);
    }
  }
  if (typeof json.durationMs === "number") {
    parts.push(`${(json.durationMs / 1000).toFixed(1)}초`);
  }
  if (json.dryRun === true) parts.push("모의 실행");
  if (json.skipped === true) parts.push("건너뜀");
  if (typeof json.reason === "string" && json.reason) parts.push(json.reason);
  if (typeof json.message === "string" && json.message) parts.push(json.message);
  return parts.length > 0 ? parts.join(" · ") : "완료";
}

export function CronRunPanel() {
  const router = useRouter();
  const [state, setState] = useState<Record<string, State>>({});

  async function run(job: Job) {
    const cur = state[job.key]?.status;
    if (cur === "busy") return;
    if (cur !== "arm") {
      setState((s) => ({
        ...s,
        [job.key]: {
          status: "arm",
          text: job.sends ? "한 번 더 누르면 실제 발송" : "한 번 더 누르면 실행",
        },
      }));
      return;
    }
    setState((s) => ({ ...s, [job.key]: { status: "busy" } }));
    try {
      const res = await fetch(job.path, { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setState((s) => ({
          ...s,
          [job.key]: {
            status: "fail",
            text: typeof json.error === "string" ? json.error : `실패 (${res.status})`,
          },
        }));
        return;
      }
      // 알림 러너는 fail-soft 라 실패해도 HTTP 200 + ok:false 로 온다.
      // 200 만 보고 초록으로 칠하면 "돌았는데 아무 일도 안 났다"를 성공으로 오인한다.
      const failedSoftly = json.ok === false && json.skipped !== true;
      setState((s) => ({
        ...s,
        [job.key]: { status: failedSoftly ? "fail" : "done", text: summarize(json) },
      }));
      router.refresh();
    } catch {
      setState((s) => ({ ...s, [job.key]: { status: "fail", text: "네트워크 오류" } }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const jobs = JOBS.filter((j) => j.group === g.key);
        if (jobs.length === 0) return null;
        return (
          <div key={g.key} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-extrabold text-white">{g.key}</span>
              <span
                className={`text-[10px] ${g.key === "알림" ? "text-[#f2c94c]" : "text-[#9aa6b8]"}`}
              >
                {g.note}
              </span>
            </div>
            {jobs.map((job) => {
              const st = state[job.key] ?? { status: "idle" as const };
              const armed = st.status === "arm";
              return (
                <div
                  key={job.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-bold text-white">{job.label}</span>
                      <span
                        className={`rounded px-1.5 py-px text-[10px] font-bold ${
                          job.schedule === "수동 전용"
                            ? "bg-[rgba(154,166,184,.14)] text-[#9aa6b8]"
                            : "bg-[rgba(126,162,255,.14)] text-ai-accent"
                        }`}
                      >
                        {job.schedule}
                      </span>
                      {job.needsKey && (
                        <span className="rounded bg-[rgba(242,201,76,.14)] px-1.5 py-px text-[10px] font-bold text-[#f2c94c]">
                          키 필요
                        </span>
                      )}
                      {job.sends && (
                        <span className="rounded bg-[rgba(248,113,113,.14)] px-1.5 py-px text-[10px] font-bold text-ai-danger">
                          발송
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-[#9aa6b8]">
                      {st.text ?? job.hint}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => run(job)}
                    disabled={st.status === "busy"}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50 ${
                      armed
                        ? job.sends
                          ? "bg-ai-danger text-[#0e1320]"
                          : "bg-[#f2c94c] text-[#0e1320]"
                        : st.status === "done"
                          ? "border border-[rgba(74,222,128,.4)] text-ai-success"
                          : st.status === "fail"
                            ? "border border-[rgba(248,113,113,.4)] text-ai-danger"
                            : "border border-[rgba(126,162,255,.35)] text-ai-accent"
                    }`}
                  >
                    {st.status === "busy" ? "실행 중…" : armed ? "확정 실행" : "실행"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
        정규 스케줄은 GitHub Actions ETL(<code className="text-[#6b7688]">.github/workflows/etl.yml</code>)
        이 담당하며, 각 작업 옆 배지가 그 파일에 실제로 들어 있는 주기입니다. 여기서는 즉시 한 번 더
        돌릴 때만 사용하세요. &ldquo;키 필요&rdquo; 는 해당 공공 API 인증키가 Vercel 환경변수에 있어야
        실제 적재가 일어난다는 뜻이며, 없으면 건너뜀으로 기록됩니다. &ldquo;발송&rdquo; 이 붙은 작업은
        누르는 즉시 실제 사용자에게 알림이 나갑니다. 단지 좌표 지오코딩은 위 진행률 카드의 버튼을
        쓰세요.
      </div>
    </div>
  );
}
