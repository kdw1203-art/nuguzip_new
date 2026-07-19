import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { LlmMessage } from "@/lib/ai/llm-provider";
import {
  CHECKLIST_FULL,
  DISTRICT_OPTIONS,
  ECONOMY_FULL,
  RISK_BLOCKS,
  TIMING_FULL,
  WORKBENCH_COMPLEXES,
  complexById,
  compositeScore,
  jeonseRatio,
} from "@/lib/ai/workbench-constants";

function kstDateLabel(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

const SYSTEM_BASE =
  "당신은 한국 부동산 시장에 정통한 투자·거주 자문가입니다. 과장된 수익 보장은 하지 말고, 규제·금리·유동성 리스크를 균형 있게 언급하세요. 응답은 반드시 한국어 마크다운으로 작성합니다. 법률·세금·대출 실행은 반드시 전문가 확인이 필요함을 명시하세요.";

function safeStr(v: unknown, max = 8000): string {
  try {
    return JSON.stringify(v, null, 2).slice(0, max);
  } catch {
    return String(v).slice(0, max);
  }
}

/** 금리 ±1%p 변화 시 월 상환액 1차 근사(만원). 원리금 균등 단순화·참고용. */
function approximateMonthlyPaymentDeltaMan(
  loanPrincipalMan: number,
  annualRatePct: number,
  years: number,
  deltaRatePctPoints: number,
): { deltaManRounded: number; footnote: string } {
  if (!(loanPrincipalMan > 0) || !(years > 0)) {
    return { deltaManRounded: 0, footnote: "대출 원금·기간 부족으로 민감도 생략" };
  }
  const r0 = Math.max(0.0001, annualRatePct / 100 / 12);
  const r1 = Math.max(0.0001, (annualRatePct + deltaRatePctPoints) / 100 / 12);
  const n = years * 12;
  const pow0 = (1 + r0) ** n;
  const pow1 = (1 + r1) ** n;
  const pay0 = (loanPrincipalMan * 10000 * r0 * pow0) / (pow0 - 1);
  const pay1 = (loanPrincipalMan * 10000 * r1 * pow1) / (pow1 - 1);
  const deltaMan = (pay1 - pay0) / 10000;
  return {
    deltaManRounded: Math.round(deltaMan * 10) / 10,
    footnote:
      "원리금 균등 가정·참고용 근사치이며 실제 약정 금리·상환 방식과 다를 수 있습니다.",
  };
}

export function buildStubMarkdown(tool: AiAnalysisToolId, input: unknown): string {
  return [
    "## 요약",
    `**${tool}** 도구에 대한 분석입니다. 외부 LLM API 키가 없거나 호출에 실패한 경우, 아래는 규칙 기반 안내 문구입니다.`,
    "",
    "## 핵심 포인트",
    "- 공공 실거래·KB·국토부 API를 연동하면 정확도가 크게 올라갑니다.",
    "- `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY`를 설정하면 같은 화면에서 실제 모델 응답을 받을 수 있습니다.",
    "",
    "## 입력 요약",
    "```json",
    safeStr(input, 4000),
    "```",
    "",
    "다음 단계 링크는 화면 오른쪽 **빠른 이동**에서 안내합니다.",
  ].join("\n");
}

function cohortPercentile(score: number, scores: number[]): number {
  if (!scores.length) return 50;
  const below = scores.filter((s) => s < score).length;
  return Math.round((below / scores.length) * 100);
}

/** 외부 LLM 없이 워크벤치·규칙만으로 생성하는 서술용 마크다운 */
export function buildInternalAnalysisMarkdown(
  tool: AiAnalysisToolId,
  input: Record<string, unknown>,
): string {
  const basis = kstDateLabel();
  const snap = buildDataSnapshot(tool, input);

  switch (tool) {
    case "ai-diagnosis":
    case "ai-prediction": {
      const s = snap as {
        complex: {
          name: string;
          districtLabel: string;
          dong: string;
          priceSaleMan: number;
          trendPct5y: number;
        };
        compositeScore: number;
        jeonseRatioPct: number;
        customerDeclared: Record<string, unknown>;
        mortgageRateSensitivity?: {
          monthlyDeltaIfRatePlus1ppMan: number;
          monthlyDeltaIfRateMinus1ppMan: number;
          note: string;
        };
      };
      const allScores = WORKBENCH_COMPLEXES.map((x) => compositeScore(x));
      const pctBelow = cohortPercentile(s.compositeScore, allScores);
      const topBandPct = Math.max(1, Math.min(99, 100 - pctBelow));
      const avgScore = Math.round(
        allScores.reduce((a, b) => a + b, 0) / allScores.length,
      );
      const diff = s.compositeScore - avgScore;
      const userPriceMan = Number(s.customerDeclared.currentPriceMan ?? 0);
      const benchMan = s.complex.priceSaleMan;
      const priceGapPct =
        userPriceMan > 0 && benchMan > 0
          ? Math.round(((userPriceMan - benchMan) / benchMan) * 1000) / 10
          : null;
      const lines: string[] = [
        "## 요약 (자체 엔진·워크벤치 샘플)",
        `${s.complex.districtLabel} **${s.complex.name}** 기준으로, 앱 내 샘플 데이터에서 계산한 **종합점수 ${s.compositeScore}점**, **전세가율 약 ${s.jeonseRatioPct}%** 입니다. 5년 추세지표(샘플)는 약 **${s.complex.trendPct5y}%** 수준으로 잡혀 있습니다.`,
        "",
        "## 입력값에서 본 핵심",
        `- 구·동 맥락: ${String(s.customerDeclared.regionLabel ?? s.customerDeclared.regionFreeText ?? "—")}`,
        `- 입력하신 시세(만원): ${userPriceMan > 0 ? userPriceMan.toLocaleString() : "—"}`,
        `- 같은 샘플 단지의 매매 호가(만원): ${benchMan.toLocaleString()}`,
      ];
      if (priceGapPct != null) {
        lines.push(
          `- 입력 시세는 샘플 호가 대비 약 **${priceGapPct > 0 ? "+" : ""}${priceGapPct}%** (실제 시세·실거래와 다를 수 있음)`,
        );
      }
      lines.push(
        "",
        "## 워크벤치 샘플 단지군 대비 위치 (참고)",
        `- 샘플 ${WORKBENCH_COMPLEXES.length}개 단지 중 종합점수는 **상위 약 ${topBandPct}%** 구간으로 볼 수 있습니다(내부 샘플·추정).`,
        `- 샘플 평균 점수 **${avgScore}점** 대비 **${diff >= 0 ? "+" : ""}${diff}점**입니다.`,
        "- **타 이용자·실제 집단**과의 비교는 통계 수집 후 확장 예정이며, 현재는 동일 샘플 풀 대비 상대 위치만 제시합니다.",
        "",
        "## 온라인·공개 자료와의 비교 안내",
        "- KB시세, 국토부 실거래, 네이버·호갱노노 등 **외부 온라인 시세와의 자동 대조**는 API 연동 전까지 제공되지 않습니다.",
        "- 투자 판단 전에는 반드시 **실거래 공개시스템** 등에서 최근 거래를 직접 확인하세요.",
        "",
      );
      if (s.mortgageRateSensitivity) {
        lines.push(
          "## 금리 민감도(설명용 근사)",
          `- 대출 잔액(가정) 기준, 모기지 금리 **+1%p** 시 월 상환액 변화 약 **${s.mortgageRateSensitivity.monthlyDeltaIfRatePlus1ppMan}만원**, **-1%p** 시 약 **${s.mortgageRateSensitivity.monthlyDeltaIfRateMinus1ppMan}만원** 수준(근사).`,
          `- ${s.mortgageRateSensitivity.note}`,
          "",
        );
      }
      lines.push(
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 위 수치는 **앱 내 워크벤치 샘플·규칙**에 기반한 참고용이며, 투자 권유나 법률·세무 자문이 아닙니다.",
        "- 서술형 AI 해석이 필요하면 화면에서 **외부 LLM 연동**을 켜고 다시 실행하세요.",
      );
      return lines.join("\n");
    }
    case "ai-compare": {
      const s = snap as {
        rows: { name: string; score: number; jr: number }[];
        compareMemo?: string;
      };
      const rows = [...s.rows].sort((a, b) => b.score - a.score);
      if (!rows.length) {
        return [
          "## 요약 (자체 엔진)",
          "비교 대상 단지가 비어 있어 최소 2개 단지를 선택해 주세요.",
          "",
          "## 데이터·면책",
          `- 분석 기준일: **${basis} (KST)**`,
        ].join("\n");
      }
      const leader = rows[0];
      const trailer = rows[rows.length - 1];
      return [
        "## 요약 (자체 엔진·비교)",
        `선택한 ${rows.length}개 단지 중 현재 규칙 점수 기준으로 **${leader.name}**가 우위이며, 하위는 **${trailer.name}**입니다.`,
        "",
        "## 비교표",
        ...rows.map(
          (r, i) =>
            `- ${i + 1}위 **${r.name}** · 종합 ${r.score}점 · 전세가율 ${r.jr}%`,
        ),
        "",
        "## 해석 포인트",
        "- 종합점수는 임장·수요·가격 구조를 단순화한 참고지표입니다.",
        "- 전세가율이 높을수록 초기 진입 부담은 낮을 수 있으나 하락장 방어력은 별도 검토가 필요합니다.",
        s.compareMemo?.trim() ? `- 메모 반영: ${s.compareMemo.trim()}` : "",
        "",
        "## 다음에 할 일",
        "- 상위 2개 단지를 동일 평형·동일 시점 실거래로 재검증",
        "- 임장 체크리스트로 관리비·주차·생활권 비교",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 내부 워크벤치 규칙 기반 참고값이며 투자 권유가 아닙니다.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "ai-risk": {
      const s = snap as {
        blocks: {
          title: string;
          score: number;
          summary: string;
          factors: { name: string; level: string; note: string }[];
        }[];
        region?: string;
      };
      const high = s.blocks.filter((b) => b.score >= 42);
      return [
        "## 요약 (자체 엔진·리스크)",
        `${s.region ? `입력 지역(${s.region})을 포함해` : "입력 조건 기준으로"} 확인한 결과, 주요 리스크 항목 ${high.length}개가 우선 관리 대상입니다.`,
        "",
        "## 우선 점검 항목",
        ...s.blocks
          .slice(0, 4)
          .map((b) => `- **${b.title}** · 리스크 점수 ${b.score} · ${b.summary}`),
        "",
        "## 세부 팩터",
        ...s.blocks
          .slice(0, 2)
          .flatMap((b) => b.factors.slice(0, 2).map((f) => `- ${f.name}: ${f.level} (${f.note})`)),
        "",
        "## 대응 가이드",
        "- 거래·금리·공급 이슈는 동일 생활권 내 대체 단지와 함께 비교하세요.",
        "- 리스크가 높은 항목은 의사결정 시 가중치를 높여 보수적으로 반영하세요.",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 규칙 기반 선별이며 법률·세무·대출 자문은 전문가 확인이 필요합니다.",
      ].join("\n");
    }
    case "ai-timing": {
      const s = snap as {
        rows: { region: string; strength: number; signal: string; note: string; catalyst?: string }[];
        userTiming?: {
          horizonMonths?: number;
          urgency?: string;
          entryStrategy?: string;
          watchList?: string;
        };
      };
      const top = [...s.rows].sort((a, b) => b.strength - a.strength).slice(0, 5);
      return [
        "## 요약 (자체 엔진·매수 타이밍)",
        `현재 필터에서 진입 점수가 높은 상위 지역 ${top.length}개를 우선 후보로 제시합니다.`,
        "",
        "## 상위 후보",
        ...top.map(
          (r, i) =>
            `- ${i + 1}. **${r.region}** · 시그널 ${r.signal} · 강도 ${r.strength} · ${r.catalyst ?? r.note}`,
        ),
        "",
        "## 사용자 조건 반영",
        `- 목표 기간: ${s.userTiming?.horizonMonths ?? 12}개월`,
        `- 행동 강도: ${s.userTiming?.urgency === "active" ? "적극 진입" : "관망 중심"}`,
        `- 진입 방식: ${s.userTiming?.entryStrategy === "split" ? "분할 매수" : "일괄 매수"}`,
        s.userTiming?.watchList ? `- 관심 목록: ${s.userTiming.watchList}` : "",
        "",
        "## 실행 제안",
        "- 상위 후보 2~3곳만 남겨 주간 지표(거래량/매물체류/전세가율) 추적",
        "- 관망 모드라도 진입·보류 트리거를 수치로 미리 정하세요.",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 참고용 시그널이며 실제 매수 판단은 현장·자금·규제 확인이 필요합니다.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "ai-economy": {
      const s = snap as {
        rows: { name: string; value: string; change: string; trend: string; impact: string; desc: string }[];
      };
      return [
        "## 요약 (자체 엔진·경제지표)",
        `핵심 지표 ${s.rows.length}개를 기준으로 현재 국면을 요약했습니다.`,
        "",
        "## 지표 스냅샷",
        ...s.rows.map(
          (r) => `- **${r.name}**: ${r.value} (${r.change}) · 추세 ${r.trend} · ${r.impact} · ${r.desc}`,
        ),
        "",
        "## 해석 가이드",
        "- 금리·거래량·공급 지표를 한 세트로 보되, 단기 변동에 과민 반응하지 마세요.",
        "- 같은 지역이라도 단지급 수급 차이가 크므로 지역 평균만으로 결론 내리지 마세요.",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 거시 지표는 방향 참고용이며 개별 단지 판단은 별도 검증이 필요합니다.",
      ].join("\n");
    }
    case "my-checklist": {
      const s = snap as { categories: { title: string; n: number }[]; propertyName?: string; checklistFocus?: string };
      const totalItems = s.categories.reduce((acc, cur) => acc + cur.n, 0);
      return [
        "## 요약 (자체 엔진·체크리스트)",
        `${s.propertyName ? `대상: **${s.propertyName}** · ` : ""}현재 체크리스트는 ${s.categories.length}개 카테고리, 총 ${totalItems}개 점검 항목으로 구성됩니다.`,
        "",
        "## 카테고리 구성",
        ...s.categories.map((c) => `- ${c.title}: ${c.n}개 항목`),
        "",
        "## 권장 사용 방식",
        s.checklistFocus ? `- 우선 집중 영역: ${s.checklistFocus}` : "- 우선 집중 영역을 지정하면 점검 우선순위를 자동 정렬하기 좋습니다.",
        "- 임장 직후 24시간 내 체크리스트를 다시 열어 기억 왜곡을 줄이세요.",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 개인 메모·체크 상태 기반 참고 리마인드입니다.",
      ].join("\n");
    }
    case "ai-gap": {
      const s = snap as { gapMan: number; ratePct: string | null };
      return [
        "## 요약 (자체 엔진·갭 분석)",
        `현재 입력 기준 갭은 약 **${Number(s.gapMan || 0).toLocaleString()}만원**${s.ratePct ? `, 매매가 대비 **${s.ratePct}%**` : ""} 수준입니다.`,
        "",
        "## 해석 포인트",
        "- 갭이 작을수록 초기 자본 부담은 낮아질 수 있으나, 공실·역전세 리스크를 함께 봐야 합니다.",
        "- 금리 상승 구간에서는 이자·보유비용 민감도를 보수적으로 가정하세요.",
        "",
        "## 다음에 할 일",
        "- 동일 생활권 유사 평형 3개 이상과 갭·전세회전율 비교",
        "- 보증금 반환 스트레스 테스트(하락 시나리오) 수행",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
      ].join("\n");
    }
    case "ai-simulator": {
      return [
        "## 요약 (자체 엔진·시뮬레이터)",
        "입력한 투자금·대출·금리·보유기간·성장률 가정으로 수익/현금흐름 시나리오를 점검합니다.",
        "",
        "## 해석 포인트",
        "- 단일 수익률보다 기준·낙관·비관 3개 시나리오를 함께 보세요.",
        "- 대출 비중이 높을수록 금리·공실 변화가 결과를 크게 흔듭니다.",
        "",
        "## 권장 체크",
        "- 매각가 하향(-10%) 및 금리 상향(+1%p) 민감도 동시 점검",
        "- 세금·중개·수선비를 별도 항목으로 추가",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 참고용 시뮬레이션이며 실제 계약/세무는 전문가 확인이 필요합니다.",
      ].join("\n");
    }
    case "ai-portfolio": {
      return [
        "## 요약 (자체 엔진·포트폴리오)",
        "보유 자산 구성과 목표 수익·리스크 기준으로 재조정 포인트를 안내합니다.",
        "",
        "## 점검 항목",
        "- 지역/유형 편중 여부",
        "- 대출만기·현금흐름 캘린더",
        "- 매각/보유 우선순위",
        "",
        "## 다음에 할 일",
        "- 보유자산별 목표 수익률과 손절 기준을 숫자로 명시",
        "- 신규 진입 자산은 기존 자산과 상관관계가 낮은지 확인",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
      ].join("\n");
    }
    case "ai-inspection": {
      const s = snap as {
        goal?: string;
        links?: string[];
        inspectionDetail?: {
          maxTravelMinutes?: number | string;
          preferredInspectionDays?: string;
          mustHaves?: string;
        };
        budgetOverrideEok?: { min?: number | string; max?: number | string };
        interestNotes?: string;
      };
      const goalLabel =
        s.goal === "live" ? "실거주 중심" : s.goal === "invest" ? "투자 중심" : "실거주+투자 병행";
      return [
        "## 요약 (자체 엔진·임장 분석)",
        `현재 목표는 **${goalLabel}**로 판단되며, 임장 동선/체크포인트/후속 기록 작업을 함께 제안합니다.`,
        "",
        "## 임장 준비 체크",
        `- 이동 허용 시간: ${s.inspectionDetail?.maxTravelMinutes ?? "미입력"}분`,
        `- 선호 방문 요일: ${s.inspectionDetail?.preferredInspectionDays ?? "미입력"}`,
        s.inspectionDetail?.mustHaves
          ? `- 필수 조건: ${s.inspectionDetail.mustHaves}`
          : "- 필수 조건: 주차·소음·동선·채광처럼 현장에서 바로 확인 가능한 항목을 3개 이상 지정하세요.",
        "",
        "## 예산·관심 메모 반영",
        `- 예산(억): ${s.budgetOverrideEok?.min ?? "—"} ~ ${s.budgetOverrideEok?.max ?? "—"}`,
        s.interestNotes ? `- 메모: ${s.interestNotes}` : "",
        "",
        "## 실행 권장",
        "- 임장 전: 체크리스트를 5개 내로 압축해 우선순위 확정",
        "- 임장 중: 사진 + 짧은 코멘트를 같은 포인트에서 기록",
        "- 임장 후: 같은 날 내 허브에서 요약/공유까지 마무리",
        s.links?.length ? `- 바로가기: ${s.links.join(" · ")}` : "",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 본 결과는 임장 실행 보조용 참고 가이드입니다.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "contract-risk": {
      const s = snap as {
        riskLevel: "안전" | "주의" | "위험";
        jeonseMan: number;
        saleEstimate: number;
        ratioRaw: number;
        issues: string[];
        clauses: string[];
      };
      return [
        "## 요약 (자체 엔진·계약 진단)",
        `현재 진단 위험도는 **${s.riskLevel}**입니다. 전세가율 ${s.ratioRaw}% · 추정 매매가 ${s.saleEstimate.toLocaleString()}만원 기준으로 체크했습니다.`,
        "",
        "## 핵심 이슈",
        ...(s.issues.length
          ? s.issues.map((it) => `- ${it}`)
          : ["- 입력 조건에서 즉시 경고 신호는 제한적입니다."]),
        "",
        "## 계약서 특약 권장",
        ...s.clauses.map((c) => `- ${c}`),
        "",
        "## 다음에 할 일",
        "- 계약 전 최신 등기부등본·건축물대장 재확인",
        "- 보증보험 가입 가능 여부를 사전에 확인",
        "",
        "## 데이터·면책",
        `- 분석 기준일: **${basis} (KST)**`,
        "- 법률 효력은 계약서 문구·사실관계에 따라 달라지므로 전문가 검토가 필요합니다.",
      ].join("\n");
    }
    default: {
      return [
        "## 요약 (자체 엔진)",
        `${tool} 도구에 대해 외부 LLM 없이 내부 규칙으로 분석했습니다.`,
        "",
        "## 참고 스냅샷",
        "```json",
        safeStr(snap, 3500),
        "```",
        "",
        "## 데이터·면책",
        `- 기준일 **${basis} (KST)** · 참고용 · 전문가 확인 필요`,
      ].join("\n");
    }
  }
}

/** `objective` 객체를 최상위와 병합해 스냅샷·프롬프트에서 읽습니다. */
export function flattenAnalysisInput(input: Record<string, unknown>): Record<string, unknown> {
  const o = input.objective;
  if (o && typeof o === "object" && !Array.isArray(o)) {
    return { ...input, ...(o as Record<string, unknown>) };
  }
  return { ...input };
}

export function buildAnalysisMessages(
  tool: AiAnalysisToolId,
  input: Record<string, unknown>,
  publicContext?: Record<string, unknown> | null,
): LlmMessage[] {
  const snapshot = buildDataSnapshot(tool, input);
  const basis = kstDateLabel();
  const user = [
    `도구: ${tool}`,
    "",
    `응답 시 마지막에 반드시 "## 데이터·면책" 섹션을 포함하고, 분석 기준일을 **${basis} (KST)** 로 적으며, 본 답변이 참고용이며 투자 권유가 아님을 분명히 하세요.`,
    "",
    "사용자가 제출한 입력(JSON):",
    safeStr(input, 6000),
    "",
    "서버에서 계산·조회한 참고 데이터(수치는 참고용 샘플일 수 있음):",
    safeStr(snapshot, 6000),
    publicContext
      ? `\n공공데이터 LIVE·부분 연동 컨텍스트(출처·기준일 포함, 반드시 인용):\n${safeStr(publicContext, 6000)}`
      : "",
    "",
    "다음 형식으로 답하세요:",
    "## 요약 (3~5문장, 사용자가 입력한 수치·역할이 있으면 첫머리에서 한 번 인용)",
    "## 핵심 포인트 (글머리 기호 4~8개). 투자 진단·시세 예측이면 통과/주의/보완 3단 체크리스트 형식을 권장합니다.",
    "## 리스크·주의사항",
    "## 다음에 할 일 (실행 가능한 체크리스트)",
    "## 데이터·면책 (기준일·참고용·전문가 확인 권고)",
    tool === "ai-prediction"
      ? "\n시세 예측 도구: 낙관·기본·비관 시나리오를 연결해 구간·불확실성을 반드시 한 문단 이상 서술하세요."
      : "",
  ].join("\n");

  return [
    { role: "system", content: `${SYSTEM_BASE} (오늘 KST: ${basis})` },
    { role: "user", content: user },
  ];
}

function buildDataSnapshot(tool: AiAnalysisToolId, input: Record<string, unknown>) {
  const in_ = flattenAnalysisInput(input);
  const complexId = String(in_.complexId ?? "c1");
  const c = complexById(complexId) ?? WORKBENCH_COMPLEXES[0];
  const districtLabel =
    DISTRICT_OPTIONS.find((d) => d.id === in_.regionDistrictId)?.label ?? in_.regionFreeText;

  switch (tool) {
    case "ai-diagnosis":
    case "ai-prediction": {
      const priceMan = Number(in_.currentPriceMan ?? 0);
      const ltvRaw = in_.ltvPct != null && String(in_.ltvPct).trim() !== "" ? Number(in_.ltvPct) : NaN;
      const rateRaw =
        in_.mortgageRatePct != null && String(in_.mortgageRatePct).trim() !== ""
          ? Number(in_.mortgageRatePct)
          : NaN;
      const ltvN = Number.isFinite(ltvRaw) && ltvRaw > 0 ? ltvRaw : 60;
      const rateN = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 4.5;
      const holdY =
        typeof in_.holdingYears === "number" && !Number.isNaN(in_.holdingYears)
          ? in_.holdingYears
          : 30;
      const usedAssumptions =
        !(Number.isFinite(ltvRaw) && ltvRaw > 0) || !(Number.isFinite(rateRaw) && rateRaw > 0);
      const loanPrincipalMan = priceMan > 0 ? Math.round(priceMan * (ltvN / 100)) : 0;
      const rateSens =
        loanPrincipalMan > 0
          ? (() => {
              const up = approximateMonthlyPaymentDeltaMan(loanPrincipalMan, rateN, holdY, 1);
              const down = approximateMonthlyPaymentDeltaMan(loanPrincipalMan, rateN, holdY, -1);
              return {
                loanPrincipalMan,
                ltvPctAssumed: ltvN,
                ratePctAssumed: rateN,
                assumedAmortYears: holdY,
                monthlyDeltaIfRatePlus1ppMan: up.deltaManRounded,
                monthlyDeltaIfRateMinus1ppMan: down.deltaManRounded,
                note: usedAssumptions
                  ? `${up.footnote} LTV·금리 미입력 시 설명용으로 60%·4.5%를 가정했습니다.`
                  : up.footnote,
              };
            })()
          : undefined;
      return {
        complex: c,
        compositeScore: compositeScore(c),
        jeonseRatioPct: jeonseRatio(c),
        sliders: {
          loc: in_.loc,
          demand: in_.demand,
          future: in_.future,
          txType: in_.txType,
        },
        personalization: {
          analysisMode: in_.analysisMode,
          investorRole: in_.investorRole,
          ltvPct: in_.ltvPct,
          mortgageRatePct: in_.mortgageRatePct,
          holdingYears: in_.holdingYears,
          targetYieldPct: in_.targetYieldPct,
          referenceUrls: in_.referenceUrls,
        },
        mortgageRateSensitivity: rateSens,
        customerDeclared: {
          regionDistrictId: in_.regionDistrictId,
          regionLabel: districtLabel,
          regionFreeText: in_.regionFreeText,
          complexNameFree: in_.complexNameFree,
          currentPriceMan: in_.currentPriceMan,
          tradeVolume5y: in_.tradeVolume5y,
          tradeVolume3y: in_.tradeVolume3y,
          tradeVolume1y: in_.tradeVolume1y,
          areaSqm: in_.areaSqm,
          areaPyeong: in_.areaPyeong,
        },
        subjectiveMemo: input.subjectiveMemo,
      };
    }
    case "ai-compare": {
      const ids = Array.isArray(in_.complexIds) ? (in_.complexIds as string[]) : [];
      return {
        rows: ids
          .map((id) => complexById(id))
          .filter(Boolean)
          .map((x) => ({
            name: x!.name,
            score: compositeScore(x!),
            jr: jeonseRatio(x!),
          })),
        compareMemo: in_.compareMemo,
        watchRegions: Array.isArray(in_.watchRegions) ? in_.watchRegions : [],
        subjectiveMemo: input.subjectiveMemo,
      };
    }
    case "ai-risk":
      return {
        blocks: RISK_BLOCKS,
        region: in_.region,
        subjectiveMemo: input.subjectiveMemo,
      };
    case "ai-timing": {
      const q = String(in_.districtQuery ?? "")
        .trim()
        .toLowerCase();
      const chipIds = Array.isArray(in_.timingDistrictIds)
        ? (in_.timingDistrictIds as unknown[]).map(String).filter(Boolean)
        : [];
      let rows = TIMING_FULL;
      if (chipIds.length) {
        rows = rows.filter((r) => chipIds.includes(r.districtId));
      }
      if (q) {
        rows = rows.filter(
          (r) =>
            r.region.toLowerCase().includes(q) || r.districtId.toLowerCase().includes(q),
        );
      }
      if (!rows.length) rows = TIMING_FULL;
      return {
        rows: rows.slice(0, 24),
        filterApplied: { districtQuery: in_.districtQuery, timingDistrictIds: chipIds },
        userTiming: {
          horizonMonths: in_.horizonMonths,
          urgency: in_.urgency,
          entryStrategy: in_.entryStrategy,
          watchList: in_.watchList,
          analysisMode: in_.analysisMode,
          investorRole: in_.investorRole,
          ltvPct: in_.ltvPct,
          mortgageRatePct: in_.mortgageRatePct,
          holdingYears: in_.holdingYears,
          targetYieldPct: in_.targetYieldPct,
          referenceUrls: in_.referenceUrls,
        },
      };
    }
    case "ai-economy":
      return { rows: ECONOMY_FULL.slice(0, 8) };
    case "my-checklist":
      return {
        categories: CHECKLIST_FULL.map((cat) => ({ title: cat.title, n: cat.items.length })),
        propertyName: in_.propertyName,
        checklistFocus: in_.checklistFocus,
        subjectiveMemo: input.subjectiveMemo,
      };
    case "ai-gap":
      return {
        gapMan: Number(in_.maeMan ?? 0) - Number(in_.jeonMan ?? 0),
        ratePct:
          Number(in_.maeMan ?? 0) > 0
            ? (
                ((Number(in_.maeMan ?? 0) - Number(in_.jeonMan ?? 0)) / Number(in_.maeMan ?? 0)) *
                100
              ).toFixed(1)
            : null,
        subjectiveMemo: input.subjectiveMemo,
      };
    case "ai-simulator":
      return {
        profitHint: "클라이언트에서 입력한 투자금·대출·금리·성장률 기준으로 서버는 LLM 서술만 보조합니다.",
      };
    case "ai-portfolio":
      return { note: "포트폴리오 상세는 브라우저 로컬 저장 데이터를 클라이언트가 함께 보냅니다." };
    case "ai-inspection": {
      const prof = input.profile;
      return {
        links: ["/inspection/create", "/inspection/hub"],
        goal: in_.goal,
        interestNotes: in_.interestNotes,
        budgetOverrideEok: {
          min: in_.budgetMinEok,
          max: in_.budgetMaxEok,
        },
        inspectionDetail: {
          maxTravelMinutes: in_.maxTravelMinutes,
          preferredInspectionDays: in_.preferredInspectionDays,
          mustHaves: in_.mustHaves,
          analysisMode: in_.analysisMode,
          investorRole: in_.investorRole,
          ltvPct: in_.ltvPct,
          mortgageRatePct: in_.mortgageRatePct,
          holdingYears: in_.holdingYears,
          referenceUrls: in_.referenceUrls,
        },
        investorProfileSummary:
          prof && typeof prof === "object" && !Array.isArray(prof)
            ? {
                goal: (prof as Record<string, unknown>).goal,
                budgetMinEok: (prof as Record<string, unknown>).budgetMinEok,
                budgetMaxEok: (prof as Record<string, unknown>).budgetMaxEok,
                horizonYears: (prof as Record<string, unknown>).horizonYears,
                riskTolerance: (prof as Record<string, unknown>).riskTolerance,
              }
            : undefined,
        subjectiveMemo: input.subjectiveMemo,
      };
    }
    case "contract-risk": {
      const jeonseMan = Number(in_.jeonseMan ?? 0);
      const ratioRaw = Number(in_.marketRatioPct ?? 80);
      const ratio = ratioRaw / 100;
      const saleEstimate = ratio > 0 ? Math.round(jeonseMan / ratio) : 0;
      let riskLevel: "안전" | "주의" | "위험" = "안전";
      const issues: string[] = [];
      if (ratioRaw >= 90) { riskLevel = "위험"; issues.push("전세가율 90% 이상 — 역전세·깡통전세 위험"); }
      else if (ratioRaw >= 80) { riskLevel = "주의"; issues.push("전세가율 80% 이상 — 시세 하락 시 보증금 미반환 위험"); }
      if (!in_.hasRegistrationCheck) issues.push("등기부등본 미확인 — 근저당·압류 여부 필수 확인");
      if (!in_.hasInsurance) issues.push("전세보증보험 미가입 — HUG/HF 가입 강력 권장");
      if (jeonseMan > 200000) issues.push("고액 전세 — 특약(계약해제·환불 조항) 세부 검토 필요");
      const clauses: string[] = ["임대인 변경 시 계약 해지 및 보증금 즉시 반환", "확정일자 신청 및 전입신고 즉시 완료", "잔금 지급 전 등기부등본·건축물대장 최종 확인"];
      if (ratioRaw >= 80) clauses.push("전세보증보험 가입 의무화 특약");
      return { riskLevel, jeonseMan, saleEstimate, ratioRaw, issues, clauses };
    }
    default:
      return { workbenchSample: WORKBENCH_COMPLEXES.slice(0, 3).map((x) => x.name) };
  }
}
