"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * F1 — 수집 작업 수동 실행 패널.
 * 각 크론 라우트는 `isAdminApiRequest()` 로도 인가되므로 관리자 세션에서 바로 호출된다.
 * 결과는 라우트가 돌려준 JSON 요약을 그대로 보여준다(가공·추정 없음).
 * 브라우저 confirm() 은 쓰지 않는다 — 두 번 눌러 확정하는 방식.
 */

interface Job {
  key: string;
  label: string;
  path: string;
  hint: string;
  /** 실행에 외부 인증키가 필요한 작업 */
  needsKey?: boolean;
}

const JOBS: Job[] = [
  {
    key: "molit",
    label: "실거래 적재",
    path: "/api/cron/molit-transactions-ingest",
    hint: "시군구 슬라이스 단위. 이미 채워진 구·월은 건너뜁니다.",
    needsKey: true,
  },
  {
    key: "reb",
    label: "R-ONE 지수",
    path: "/api/cron/reb-ingest",
    hint: "부동산원 매매·전세 지수 시계열",
    needsKey: true,
  },
  {
    key: "kb",
    label: "KB 시세",
    path: "/api/cron/kb-ingest",
    hint: "KB 주간·월간 시계열",
  },
  {
    key: "kosis",
    label: "KOSIS 통계",
    path: "/api/cron/kosis-ingest",
    hint: "국가통계포털 보조 지표",
    needsKey: true,
  },
  {
    key: "ecos",
    label: "한국은행 금리",
    path: "/api/cron/ecos-sync",
    hint: "기준금리·주담대 금리",
    needsKey: true,
  },
  {
    key: "onbid",
    label: "온비드 공매",
    path: "/api/cron/onbid-sync",
    hint: "공매 물건 목록",
    needsKey: true,
  },
  {
    key: "court",
    label: "법원경매",
    path: "/api/cron/court-auction-sync",
    hint: "경매 물건 동기화",
    needsKey: true,
  },
  {
    key: "redev",
    label: "정비사업",
    path: "/api/cron/redevelopment-ingest",
    hint: "서울 열린데이터광장 정비사업장",
    needsKey: true,
  },
  {
    key: "apt",
    label: "단지 마스터",
    path: "/api/cron/apt-master-ingest",
    hint: "전국 공동주택 단지 정보 (슬라이스)",
    needsKey: true,
  },
  {
    key: "crawl",
    label: "단지 시세",
    path: "/api/cron/complex-crawl",
    hint: "단지별 시세 수집",
  },
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
  pick("errors", "오류");
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
      setState((s) => ({ ...s, [job.key]: { status: "arm", text: "한 번 더 누르면 실행" } }));
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
      setState((s) => ({ ...s, [job.key]: { status: "done", text: summarize(json) } }));
      router.refresh();
    } catch {
      setState((s) => ({ ...s, [job.key]: { status: "fail", text: "네트워크 오류" } }));
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {JOBS.map((job) => {
        const st = state[job.key] ?? { status: "idle" as const };
        const armed = st.status === "arm";
        return (
          <div
            key={job.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-bold text-white">{job.label}</span>
                {job.needsKey && (
                  <span className="rounded bg-[rgba(242,201,76,.14)] px-1.5 py-px text-[9px] font-bold text-[#f2c94c]">
                    키 필요
                  </span>
                )}
              </div>
              <div className="truncate text-[10.5px] text-[#9aa6b8]">
                {st.text ?? job.hint}
              </div>
            </div>
            <button
              type="button"
              onClick={() => run(job)}
              disabled={st.status === "busy"}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-50 ${
                armed
                  ? "bg-[#f2c94c] text-[#0e1320]"
                  : st.status === "done"
                    ? "border border-[rgba(74,222,128,.4)] text-[#4ade80]"
                    : st.status === "fail"
                      ? "border border-[rgba(248,113,113,.4)] text-[#f87171]"
                      : "border border-[rgba(126,162,255,.35)] text-[#7ea2ff]"
              }`}
            >
              {st.status === "busy" ? "실행 중…" : armed ? "확정 실행" : "실행"}
            </button>
          </div>
        );
      })}
      <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
        정규 스케줄은 GitHub Actions ETL(하루 2회)이 담당합니다. 여기서는 즉시 한 번 더 돌릴 때만
        사용하세요. &ldquo;키 필요&rdquo; 표시는 해당 공공 API 인증키가 Vercel 환경변수에 있어야
        실제 적재가 일어난다는 뜻이며, 없으면 건너뜀으로 기록됩니다.
      </div>
    </div>
  );
}
