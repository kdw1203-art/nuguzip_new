/**
 * 내집나우 AI 에이전트 — 도구 정의·실행기.
 *
 * 원칙(사실 우선): 에이전트가 말하는 모든 숫자는 여기 도구들이 DB에서 읽어 온
 * 값이어야 한다. 도구 밖에서 시세·점수를 지어내는 것은 시스템 프롬프트로 금지하고,
 * 어떤 도구를 어떤 인자로 불렀는지(trace)를 화면에 그대로 노출해 사용자가
 * 근거를 검증할 수 있게 한다.
 *
 * 스코프: 노트 도구는 로그인한 본인 이메일로만 조회한다(개인 기록 보호).
 * 시세 도구는 공개 실거래 집계만 읽는다.
 */
import { listNotes, getNote, inspectionAverageScore } from "@/lib/inspection/store-db";
import {
  searchComplexes,
  decodeComplexId,
  getAreaBands,
} from "@/lib/complex/complex-store";
import {
  getRegionSnapshot,
  getRegionSeries,
  getRegionMonthlyVolume,
} from "@/lib/market/store";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";

/* ---------- 공용 타입 ---------- */

export type AgentToolDef = {
  name: string;
  description: string;
  /** JSON Schema (OpenAI function / Anthropic tool 공용) */
  parameters: Record<string, unknown>;
};

export type ToolTraceEntry = {
  tool: string;
  /** 사용자에게 보여줄 한 줄 요약 (예: "내 노트 3건 조회") */
  label: string;
  ok: boolean;
};

const M2_PER_PYEONG = 3.305785;

function eok(krw: number): string {
  const e = krw / 100_000_000;
  return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
}

/* ---------- 도구 스키마 (모델에게 주는 계약) ---------- */

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "list_my_notes",
    description:
      "사용자의 임장노트 목록을 조회한다. 제목·지역·단지·방문일·평균 점수·한줄평이 반환된다. 사용자가 자기 노트/기록/임장에 대해 물으면 반드시 먼저 호출한다.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_note_detail",
    description:
      "임장노트 1건의 상세(5개 항목 점수, 장점, 단점, 체크리스트 진행률, 메모)를 조회한다. note_id는 list_my_notes 결과의 id를 쓴다.",
    parameters: {
      type: "object",
      properties: { note_id: { type: "string", description: "노트 id" } },
      required: ["note_id"],
    },
  },
  {
    name: "search_complex",
    description:
      "아파트 단지를 이름으로 검색한다. 단지 시세를 조회하려면 먼저 이 도구로 complex_id를 얻는다.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "단지명 (예: 공작아파트)" } },
      required: ["query"],
    },
  },
  {
    name: "get_complex_stats",
    description:
      "단지의 국토교통부 실거래 통계를 조회한다: 최근 6개월 평균가·평당가·거래건수, 최근 12개월 거래건수, 가장 최근 거래, 면적대별 최근가. complex_id는 search_complex 결과의 id를 쓴다.",
    parameters: {
      type: "object",
      properties: { complex_id: { type: "string", description: "단지 id" } },
      required: ["complex_id"],
    },
  },
  {
    name: "get_region_market",
    description:
      "시군구 단위 시장 상황을 조회한다: 평균 매매가·전월 대비 변동·전세가율(있는 경우), 매매가격지수 12개월 추세, 월별 거래량. district는 한국어 구·시 이름(예: 강남구, 과천시, 동안구). 지원 범위는 현재 수도권(서울 자치구·경기·인천 주요 시)뿐이다 — 그 외 지역은 미지원 결과가 반환되며, 그 사실을 사용자에게 그대로 전달해야 한다.",
    parameters: {
      type: "object",
      properties: { district: { type: "string", description: "구·시 이름" } },
      required: ["district"],
    },
  },
];

/* ---------- 실행기 ---------- */

const ALL_REGIONS = [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS];

function resolveRegion(district: string) {
  const q = district.trim().replace(/\s+/g, "");
  return (
    ALL_REGIONS.find((r) => r.name === q) ??
    ALL_REGIONS.find((r) => q.endsWith(r.name) || r.name.endsWith(q)) ??
    null
  );
}

type ToolResult = { label: string; data: unknown };

async function runListMyNotes(email: string): Promise<ToolResult> {
  const notes = await listNotes(email);
  const rows = notes.slice(0, 20).map((n) => ({
    id: n.id,
    title: n.title,
    region: n.region,
    apt: n.aptName ?? null,
    visit_date: n.visitDate,
    avg_score: inspectionAverageScore(n.scores),
    summary: (n.summary ?? "").slice(0, 120) || null,
  }));
  return {
    label: `내 임장노트 ${rows.length}건 조회`,
    data: rows.length > 0 ? rows : { message: "작성한 임장노트가 없습니다." },
  };
}

async function runGetNoteDetail(email: string, noteId: string): Promise<ToolResult> {
  const n = await getNote(noteId);
  if (!n || n.authorEmail.toLowerCase() !== email.toLowerCase()) {
    return { label: "노트 조회 실패", data: { error: "노트를 찾을 수 없거나 본인 노트가 아닙니다." } };
  }
  const doneCount = n.checklist.filter((c) => c.done).length;
  return {
    label: `노트 「${n.title.slice(0, 20)}」 상세 조회`,
    data: {
      id: n.id,
      title: n.title,
      region: n.region,
      apt: n.aptName ?? null,
      visit_date: n.visitDate,
      scores: n.scores,
      avg_score: inspectionAverageScore(n.scores),
      pros: n.sections.pros ?? null,
      cons: n.sections.cons ?? null,
      memo: (n.sections.memo ?? "").slice(0, 500) || null,
      checklist: `${doneCount}/${n.checklist.length} 완료`,
    },
  };
}

async function runSearchComplex(query: string): Promise<ToolResult> {
  const rows = await searchComplexes(query.trim(), undefined, 5);
  return {
    label: `단지 검색 「${query.trim().slice(0, 20)}」`,
    data:
      rows.length > 0
        ? rows.map((c) => ({ id: c.id, name: c.name, region: `${c.city} ${c.district}`.trim() }))
        : { message: "검색 결과가 없습니다. 다른 이름으로 시도하세요." },
  };
}

async function runGetComplexStats(complexId: string): Promise<ToolResult> {
  const dec = decodeComplexId(complexId);
  if (!dec) return { label: "단지 통계 조회 실패", data: { error: "잘못된 complex_id 입니다." } };
  const sb = getServiceSupabase();
  if (!sb) return { label: "단지 통계 조회 실패", data: { error: "데이터 소스 미설정" } };

  const ago = (m: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - m);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const { data, error } = await sb
    .from("market_transactions")
    .select("area_m2, deal_amount_krw, contract_ym, floor")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .gte("contract_ym", ago(12))
    .order("contract_ym", { ascending: false })
    .limit(300);
  /* 조회가 실패했는데 아래로 흘려보내면 rows 가 [] 이 되어, 에이전트에게
     "최근 12개월 실거래가 없습니다"라고 단정해 알려주게 된다. 모델은 그걸 사실로
     받아 사용자에게 그대로 말한다 — 거래가 활발한 단지인데도. 실패는 실패로 준다. */
  if (error) {
    return {
      label: `단지 「${dec.name}」 실거래 조회 실패`,
      data: {
        error: "실거래 조회에 실패했습니다. 거래가 없다는 뜻이 아니니 그렇게 말하지 마세요.",
      },
    };
  }
  const rows =
    (data as { area_m2: number | null; deal_amount_krw: number; contract_ym: string; floor: number | null }[] | null) ?? [];

  if (rows.length === 0) {
    return {
      label: `단지 「${dec.name}」 실거래 없음`,
      data: { complex: dec.name, region: dec.region, message: "최근 12개월 실거래가 없습니다. 없는 시세를 추정하지 마세요." },
    };
  }

  const recent6 = rows.filter((r) => r.contract_ym >= ago(6));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avg6 = avg(recent6.map((r) => Number(r.deal_amount_krw)));
  const perPyeong = avg(
    recent6
      .filter((r) => r.area_m2 && Number(r.area_m2) > 0)
      .map((r) => Number(r.deal_amount_krw) / (Number(r.area_m2) / M2_PER_PYEONG)),
  );
  const latest = rows[0];
  const bands = await getAreaBands(complexId);

  return {
    label: `단지 「${dec.name}」 실거래 ${rows.length}건 집계`,
    data: {
      complex: dec.name,
      region: dec.region,
      avg_6m: avg6 !== null ? eok(avg6) : null,
      per_pyeong_6m_manwon: perPyeong !== null ? Math.round(perPyeong / 10_000) : null,
      count_6m: recent6.length,
      count_12m: rows.length,
      latest_deal: {
        ym: latest.contract_ym,
        amount: eok(Number(latest.deal_amount_krw)),
        area_m2: latest.area_m2,
        floor: latest.floor,
      },
      area_bands: bands.map((b) => ({
        band: b.label,
        latest: `${b.latestManwon.toLocaleString("ko-KR")}만 (${b.latestYm})`,
        avg: `${b.avgManwon.toLocaleString("ko-KR")}만`,
        count: b.count,
      })),
      note: "면적·타입 구분 없는 단순 평균 포함 — 면적대별 수치(area_bands)를 우선 인용할 것",
    },
  };
}

async function runGetRegionMarket(district: string): Promise<ToolResult> {
  const region = resolveRegion(district);
  if (!region) {
    return {
      label: `지역 「${district.slice(0, 20)}」 미지원`,
      data: {
        error: `"${district}" 지역은 아직 지원하지 않습니다. 지역 시세 조회는 현재 수도권(서울 자치구·경기·인천 주요 시) 실거래 기준으로만 제공됩니다. 수도권 지역이라면 구·시 이름(예: 강남구, 과천시)으로 다시 시도하고, 수도권 밖 지역이라면 "현재 수도권만 지원한다"는 사실을 사용자에게 그대로 알려 주세요.`,
      },
    };
  }
  const [snapshot, series, volume] = await Promise.all([
    getRegionSnapshot(region.id),
    getRegionSeries(region.id, "sale_index", "monthly", 13),
    getRegionMonthlyVolume(region.id, region.name, 8),
  ]);

  const trend =
    series.length >= 2
      ? {
          months: series.length,
          cumulative_pct: series[0].value
            ? Number((((series[series.length - 1].value - series[0].value) / series[0].value) * 100).toFixed(1))
            : null,
          latest_period: series[series.length - 1].period,
        }
      : null;

  const hasAny = snapshot || trend || volume.length > 0;
  return {
    label: `지역 「${region.name}」 시세·거래량 조회`,
    data: hasAny
      ? {
          region: region.name,
          snapshot: snapshot
            ? {
                avg_sale:
                  typeof snapshot.avgSale === "number" && snapshot.avgSale > 0
                    ? eok(snapshot.avgSale)
                    : null,
                monthly_change_pct: snapshot.saleChangeMonthly ?? null,
                jeonse_ratio_pct: snapshot.jeonseRatio ?? null,
                period: snapshot.period,
              }
            : null,
          index_trend_12m: trend,
          monthly_volume: volume.map((v) => ({ month: v.month, count: v.count })),
          note: "최신 1~2개월 거래량은 신고 지연으로 실제보다 적을 수 있음",
        }
      : { region: region.name, message: "이 지역의 시세·거래량 데이터가 아직 없습니다." },
  };
}

/** 도구 실행 — 알 수 없는 도구·인자 오류도 모델에게 텍스트로 돌려준다(루프 지속). */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  userEmail: string,
): Promise<{ trace: ToolTraceEntry; resultJson: string }> {
  try {
    let r: ToolResult;
    switch (name) {
      case "list_my_notes":
        r = await runListMyNotes(userEmail);
        break;
      case "get_note_detail":
        r = await runGetNoteDetail(userEmail, String(args.note_id ?? ""));
        break;
      case "search_complex":
        r = await runSearchComplex(String(args.query ?? ""));
        break;
      case "get_complex_stats":
        r = await runGetComplexStats(String(args.complex_id ?? ""));
        break;
      case "get_region_market":
        r = await runGetRegionMarket(String(args.district ?? ""));
        break;
      default:
        return {
          trace: { tool: name, label: `알 수 없는 도구 ${name}`, ok: false },
          resultJson: JSON.stringify({ error: `unknown tool: ${name}` }),
        };
    }
    const ok = !(r.data && typeof r.data === "object" && "error" in (r.data as object));
    return { trace: { tool: name, label: r.label, ok }, resultJson: JSON.stringify(r.data) };
  } catch (e) {
    return {
      trace: { tool: name, label: `${name} 실행 오류`, ok: false },
      resultJson: JSON.stringify({ error: e instanceof Error ? e.message : "tool error" }),
    };
  }
}
