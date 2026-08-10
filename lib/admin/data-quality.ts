/**
 * F4 — 데이터 품질 검사 (서버 전용, 읽기 전용).
 *
 * 로드맵의 F4 항목은 "`app/admin/quality`의 하드코딩 목업을 실 null율·범위·중복 체크로
 * 대체"였다. 목업은 앞선 작업에서 이미 걷어냈으므로, 남은 일은 **실제 검사 그 자체**다.
 *
 * ── 이 파일이 지키는 원칙 ────────────────────────────────────────────────────
 *
 * (1) 0건은 "발견"이 아니라 "회귀 감시"다.
 *     null율·범위 검사 20개가 전부 0으로 나온다. 이걸 스무 줄로 늘어놓고 전부 초록으로
 *     칠하면 화면은 "우리가 스무 가지 문제를 잡아냈다"처럼 읽히지만 사실은 정반대다.
 *     잡은 게 없다. 그래서 통과한 검사는 한 줄로 접어 "감시 중 N개"로만 표시하고,
 *     자리는 실제로 0이 아닌 항목에 내준다.
 *
 * (2) 0이 아니라고 전부 결함이 아니다.
 *     실측으로 확인한 정상 사례를 결함으로 올리면 매일 거짓 경보가 뜬다. 2026-07-25
 *     실측에서 실제로 두 건이 그랬다:
 *       · 주소 중복 224군 — 표본을 열어 보니 플루리움1/2/3/45단지(경기 남양주 도농로 34),
 *         국화동성/라이프/신동아/우성/한신(대전 서구 둔산로 201) 처럼 **kaptCode 가 서로 다른**
 *         별개 단지가 한 도로명 주소를 공유하는 경우였다. 중복이 아니다.
 *       · 평단가 최대 3.1억/평 — 에테르노청담(218억/231.28㎡), 나인원한남(250억/273.94㎡).
 *         실거래다. 상한을 낮게 잡았다면 이 둘이 매일 "이상값"으로 떴을 것이다.
 *     그래서 판정을 pass/normal/note/defect 넷으로 나눈다. normal 은 "0이 아니지만
 *     실측 결과 정상"이라는 뜻이고, 근거를 화면에 같이 적는다.
 *
 * (3) "지금 틀린 값"과 "틀릴 수 있는 값"을 구분한다.
 *     월세 행의 price_per_pyeong_krw 는 보증금÷평이었다 — 화면에는 안 나오지만
 *     (complex-transactions.ts 의 toRecord() 가 deal_amount_krw 양수 아닌 행을
 *     먼저 버린다) 월세를 화면에 올리는 순간 밟을 예정 결함이라 note 로 지켜봤다.
 *     [2026-08-10 해소] 221,420행을 마이그레이션(20260810131211)이 null 로 비웠고
 *     적재 경로 2곳도 월세 행은 계산하지 않게 고쳤다 — 환산율을 지어내지 않는다.
 *     이 검사(rent_ppp_from_deposit)는 이제 재발 감시로 남는다.
 *
 * 판정·임계값·문구는 전부 여기에만 둔다. SQL(public.data_quality_report)은 "몇 건인가"
 * 만 답한다. 같은 규칙이 SQL 과 화면 양쪽에 흩어지면 둘이 서로 다른 말을 하기 시작한다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/** pass=0건(회귀 감시 통과) · normal=0이 아니나 실측상 정상 · note=알아둘 것 · defect=실제 결함 */
export type QualityVerdict = "pass" | "normal" | "note" | "defect";

export const VERDICT_LABEL: Record<QualityVerdict, string> = {
  pass: "이상 없음",
  normal: "정상",
  note: "확인 필요",
  defect: "결함",
};

/** 색을 못 보는 환경에서도 갈리도록 기호를 같이 쓴다(ingest-outcome 과 같은 규칙) */
export const VERDICT_MARK: Record<QualityVerdict, string> = {
  pass: "●",
  normal: "●",
  note: "▲",
  defect: "▲",
};

export const VERDICT_COLOR: Record<QualityVerdict, string> = {
  pass: "#177a4a",
  normal: "#177a4a",
  note: "#b45309",
  defect: "#c2410c",
};

export type QualityCheck = {
  key: string;
  label: string;
  verdict: QualityVerdict;
  /** 측정값(건) */
  count: number;
  /** 비율 표시용 분모. 없으면 null */
  base: number | null;
  /** 무엇을 셌는가 */
  detail: string;
  /** 왜 이 판정인가 — 근거를 사람이 읽을 수 있게 */
  why: string;
};

export type QualityGroup = {
  key: string;
  label: string;
  table: string;
  rows: number;
  /** 0이 아니라서 따로 보여줄 항목 */
  checks: QualityCheck[];
  /** 0건으로 통과해 접어 둔 회귀 감시 항목 이름들 */
  guards: string[];
};

export type DataQualityReport = {
  generatedAt: string;
  groups: QualityGroup[];
  counts: Record<QualityVerdict, number>;
};

/* ── RPC 응답 모양 ─────────────────────────────────────────────────────────── */

type MtRaw = {
  rows_total: number;
  complex_name_blank: number;
  address_blank: number;
  area_null: number;
  floor_null: number;
  build_year_null: number;
  contract_day_null: number;
  area_out_of_range: number;
  floor_out_of_range: number;
  build_year_out_of_range: number;
  contract_day_out_of_range: number;
  contract_ym_malformed: number;
  contract_ym_future: number;
  region_code_malformed: number;
  trade_missing_amount: number;
  rent_missing_deposit: number;
  type_field_bleed: number;
  jeonse_as_null: number;
  jeonse_as_zero: number;
  rent_ppp_from_deposit: number;
  cancelled: number;
  duplicate: { groups: number; excess: number; worst: number };
};

type AcRaw = {
  rows_total: number;
  master_rows: number;
  non_master_rows: number;
  master_address_blank: number;
  master_lawd_blank: number;
  master_kapt_missing: number;
  master_sigungu_blank: number;
  name_collision: {
    groups: number;
    excess: number;
    worst: number;
    same_address_groups: number;
    /** 주소도 같고 kaptCode 도 겹치는 군 — 진짜 중복 적재 의심 (20260810131153 부터) */
    same_address_kapt_dup_groups?: number;
  };
  address_collision: { groups: number; excess: number };
};

type ReportRaw = {
  generated_at: string;
  market_transactions: MtRaw;
  apartment_complexes: AcRaw;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** 백분율 — 0.1%p 미만은 "<0.1%" 로. 0/0 은 빈 문자열 */
export function pct(count: number, base: number | null): string {
  if (base === null || base <= 0) return "";
  if (count === 0) return "0%";
  const p = (count / base) * 100;
  if (p < 0.1) return "<0.1%";
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/* ── 회귀 감시 검사 정의 ────────────────────────────────────────────────────
   전부 0이어야 정상인 검사들. 0이면 guards 로 접히고, 0이 아니면 defect 로 올라온다.
   "0이 나오는 게 당연한데 왜 재나" — 당연한 게 깨지는 순간을 잡으려고 잰다.
   실측 범위(2026-07-25): 면적 10.32~301.47㎡, 층 -1~59, 준공 1961~2026, 계약월 202605~202607.
   상·하한은 이 실측을 감싸도록 잡았다(면적 0~500, 층 -5~100, 준공 1950~올해+2). */
const MT_GUARDS: { key: keyof MtRaw; label: string }[] = [
  { key: "complex_name_blank", label: "단지명 빈 값" },
  { key: "address_blank", label: "주소 빈 값" },
  { key: "area_null", label: "면적 없음" },
  { key: "floor_null", label: "층 없음" },
  { key: "build_year_null", label: "준공년도 없음" },
  { key: "contract_day_null", label: "계약일 없음" },
  { key: "area_out_of_range", label: "면적 범위 밖(0~500㎡)" },
  { key: "floor_out_of_range", label: "층 범위 밖(-5~100)" },
  { key: "build_year_out_of_range", label: "준공년도 범위 밖(1950~올해+2)" },
  { key: "contract_day_out_of_range", label: "계약일 범위 밖(1~31)" },
  { key: "contract_ym_malformed", label: "계약월 형식 오류" },
  { key: "contract_ym_future", label: "계약월이 미래" },
  { key: "region_code_malformed", label: "법정동코드 형식 오류" },
  { key: "trade_missing_amount", label: "매매인데 거래금액 없음" },
  { key: "rent_missing_deposit", label: "전월세인데 보증금 없음" },
  { key: "type_field_bleed", label: "거래유형과 금액 필드 불일치" },
];

const AC_GUARDS: { key: keyof AcRaw; label: string }[] = [
  { key: "master_address_blank", label: "단지 대장 주소 빈 값" },
  { key: "master_kapt_missing", label: "단지 대장 kaptCode 없음" },
];

function buildMarketTransactions(mt: MtRaw): QualityGroup {
  const rows = n(mt.rows_total);
  const guards: string[] = [];
  const checks: QualityCheck[] = [];

  for (const g of MT_GUARDS) {
    const c = n(mt[g.key]);
    if (c === 0) {
      guards.push(g.label);
      continue;
    }
    checks.push({
      key: String(g.key),
      label: g.label,
      verdict: "defect",
      count: c,
      base: rows,
      detail: "0건이어야 하는 검사인데 값이 잡혔다.",
      why: "적재 경로에 새 결함이 생겼거나 원천 응답 형식이 바뀐 것이다. lib/market/molit-transactions.ts 의 매핑을 먼저 본다.",
    });
  }

  const dupGroups = n(mt.duplicate?.groups);
  if (dupGroups === 0) {
    guards.push("동일 계약 중복 적재");
  } else {
    checks.push({
      key: "duplicate",
      label: "동일 계약 중복 적재",
      verdict: "defect",
      count: n(mt.duplicate?.excess),
      base: rows,
      detail: `같은 (지역·단지·주소·면적·층·계약연월일·거래유형·금액) 조합이 ${dupGroups.toLocaleString("ko-KR")}군, 최대 ${n(mt.duplicate?.worst).toLocaleString("ko-KR")}중복.`,
      why: "external_key(sha1) 로 멱등 처리하므로 정상이면 0이다. 값이 잡혔다면 키 산식이 바뀌었거나 같은 계약이 다른 원천에서 다른 표기로 들어왔다는 뜻이다. (2026-08-10 부터 키에 주소 포함 — 시흥 장곡동의 동명이단지 '숲속마을' 두 곳의 우연히 같은 조건 계약이 중복으로 오탐됐던 것을 고쳤다.)",
    });
  }

  /* 전세 표기 이원화 — 같은 사실(월세 0원)이 두 가지로 저장돼 있다.
     지금 화면이 틀리진 않지만, 월세 유무로 거르는 쿼리를 쓰는 순간 한쪽이 통째로 샌다. */
  const jNull = n(mt.jeonse_as_null);
  const jZero = n(mt.jeonse_as_zero);
  if (jNull > 0 && jZero > 0) {
    checks.push({
      key: "jeonse_dual_encoding",
      label: "전세 표기가 두 가지",
      verdict: "defect",
      count: Math.min(jNull, jZero),
      base: jNull + jZero,
      detail: `같은 사실(전세 = 월세 0원)이 monthly_rent_krw NULL ${jNull.toLocaleString("ko-KR")}행, 0 ${jZero.toLocaleString("ko-KR")}행으로 갈려 있다.`,
      why: "`monthly_rent_krw is null` 로 전세를 고르면 0원 표기 행이, `= 0` 으로 고르면 NULL 행이 빠진다. 어느 쪽으로 써도 조용히 일부가 사라지므로 표기를 하나로 모아야 한다.",
    });
  }

  /* 월세 행 평단가 — 지금은 화면에 안 나온다. 그래서 defect 가 아니라 note 다. */
  const rentPpp = n(mt.rent_ppp_from_deposit);
  if (rentPpp > 0) {
    checks.push({
      key: "rent_ppp_from_deposit",
      label: "월세 행 평단가가 보증금 기준",
      verdict: "note",
      count: rentPpp,
      base: rows,
      detail: "월세가 있는 전월세 행의 price_per_pyeong_krw 가 보증금÷평으로 계산돼 있다(월세 미반영).",
      why: "지금 화면에는 노출되지 않는다 — complex-transactions.ts 의 toRecord() 가 deal_amount_krw 가 양수가 아닌 행을 먼저 버리기 때문이다. 전월세를 시세 화면에 올리는 순간 그대로 드러나므로 그때 산식부터 고쳐야 한다.",
    });
  }

  const cancelled = n(mt.cancelled);
  if (cancelled > 0) {
    checks.push({
      key: "cancelled",
      label: "해제된 계약",
      verdict: "normal",
      count: cancelled,
      base: rows,
      detail: "국토부가 해제 신고한 계약. 행은 남기고 is_cancelled 로 표시한다.",
      why: "삭제하지 않는 이유는 해제 자체가 사실이기 때문이다. 시세 집계(market_agg)와 가격 알림에서는 이미 제외한다.",
    });
  }

  return {
    key: "market_transactions",
    label: "실거래",
    table: "market_transactions",
    rows,
    checks,
    guards,
  };
}

function buildApartmentComplexes(ac: AcRaw): QualityGroup {
  const rows = n(ac.rows_total);
  const master = n(ac.master_rows);
  const guards: string[] = [];
  const checks: QualityCheck[] = [];

  for (const g of AC_GUARDS) {
    const c = n(ac[g.key] as number);
    if (c === 0) {
      guards.push(g.label);
      continue;
    }
    checks.push({
      key: String(g.key),
      label: g.label,
      verdict: "defect",
      count: c,
      base: master,
      detail: "0건이어야 하는 검사인데 값이 잡혔다.",
      why: "apt-master 적재(app/api/cron/apt-master-ingest)의 필드 매핑을 확인한다.",
    });
  }

  /* lawd_cd 가 NULL 이 아니라 빈 문자열이라 `is not null` 가드를 그냥 통과한다.
     이 단지들은 지역으로 못 거른다 — 지역 필터를 켜면 조용히 사라진다. */
  const lawdBlank = n(ac.master_lawd_blank);
  if (lawdBlank > 0) {
    checks.push({
      key: "master_lawd_blank",
      label: "단지 대장 법정동코드 빈 문자열",
      verdict: "defect",
      count: lawdBlank,
      base: master,
      detail: "NULL 이 아니라 빈 문자열('')로 들어가 있다.",
      why: "`lawd_cd is not null` 로 거는 가드를 그대로 통과하므로 코드상 안전해 보인다. 실제로는 지역 필터를 켜는 순간 이 단지들이 조용히 빠진다. 값을 채우거나 최소한 NULL 로 정규화해야 한다.",
    });
  }

  const sigunguBlank = n(ac.master_sigungu_blank);
  if (sigunguBlank > 0) {
    checks.push({
      key: "master_sigungu_blank",
      label: "단지 대장 시군구명 없음",
      verdict: "note",
      count: sigunguBlank,
      base: master,
      detail: "metadata.sigungu 가 비어 있다.",
      why: "표시용 보조 필드라 조회는 lawd_cd 로 되지만, 목록에서 지역이 빈칸으로 보인다.",
    });
  }

  /* 이름 충돌 — 같은 구에 같은 이름 단지가 여럿. 단지 신원이
     encodeComplexId(region, name) 이라 이들은 한 페이지로 합쳐진다. */
  const nameGroups = n(ac.name_collision?.groups);
  if (nameGroups > 0) {
    const nameExcess = n(ac.name_collision?.excess);
    const sameAddr = n(ac.name_collision?.same_address_groups);
    /* 20260810131153 부터 SQL 이 kaptCode 대조까지 직접 센다. 그 전 스냅샷에는
       필드가 없으므로(undefined → 0) "대조 안 됨"과 "겹침 0"을 구분해 적는다. */
    const kaptField = ac.name_collision?.same_address_kapt_dup_groups;
    const kaptDup = n(kaptField);
    checks.push({
      key: "name_collision",
      label: "같은 구 안에 같은 이름 단지",
      verdict: kaptDup > 0 ? "defect" : "note",
      count: nameGroups + nameExcess,
      base: master,
      detail: `${nameGroups.toLocaleString("ko-KR")}군 / 중복분 ${nameExcess.toLocaleString("ko-KR")}단지, 최대 ${n(ac.name_collision?.worst)}중복. 그중 주소까지 같은 군은 ${sameAddr}군.`,
      why:
        kaptDup > 0
          ? `주소도 같고 kaptCode 도 겹치는 군이 ${kaptDup}군 — 실제 중복 적재 의심이다. apt-master 적재의 external_id(kaptCode) 멱등 처리를 확인해야 한다.`
          : kaptField === undefined
            ? "주소까지 같은 군이 있다. 이쪽은 실제 중복 적재일 수 있으므로 kaptCode 로 대조해야 한다. (이 스냅샷은 kaptCode 대조 도입 전 계산분 — 다음 스냅샷부터 기계가 직접 센다.)"
            : sameAddr === 0
              ? "주소가 같은 군이 0이므로 중복 행이 아니라 이름만 겹치는 별개 단지다. 다만 단지 신원이 encodeComplexId(지역, 이름) 이라 이들이 한 단지 페이지로 합쳐진다 — 시세와 후기가 섞인다."
              : "주소까지 같은 군도 kaptCode 는 전부 서로 다르다(기계 전수 대조) — 주소가 동 단위로 뭉뚱그려진 별개 단지다. 다만 단지 신원이 encodeComplexId(지역, 이름) 이라 이들이 한 단지 페이지로 합쳐진다 — 시세와 후기가 섞인다. (같은 주소 8군 중 3군은 K-apt 원천의 테스트 행: '테스트'·'test'·'한국감정원'.)",
    });
  }

  const addrGroups = n(ac.address_collision?.groups);
  if (addrGroups > 0) {
    checks.push({
      key: "address_collision",
      label: "같은 도로명 주소 단지",
      verdict: "normal",
      count: addrGroups,
      base: master,
      detail: `${addrGroups.toLocaleString("ko-KR")}군 / 중복분 ${n(ac.address_collision?.excess).toLocaleString("ko-KR")}단지.`,
      why: "표본 확인 결과 중복이 아니다 — 플루리움1/2/3/45단지(경기 남양주 도농로 34), 국화동성·라이프·신동아·우성·한신(대전 서구 둔산로 201) 처럼 kaptCode 가 서로 다른 별개 단지가 한 도로명 주소를 쓴다. 결함으로 올리면 매일 거짓 경보가 뜬다.",
    });
  }

  const nonMaster = n(ac.non_master_rows);
  if (nonMaster > 0) {
    checks.push({
      key: "non_master_rows",
      label: "단지가 아닌 행(별칭·식별자)",
      verdict: "normal",
      count: nonMaster,
      base: rows,
      detail: "source_key 가 reb-name-alias / reb-complex-id 인 행. 주소가 없다.",
      why: "이름 매칭용 보조 데이터라 원래 주소가 없다. 단지 검색·목록은 D7 에서 source_key='k-apt-basic' 으로 스코프를 좁혀 이미 제외한다.",
    });
  }

  return {
    key: "apartment_complexes",
    label: "단지 대장",
    table: "apartment_complexes",
    rows,
    checks,
    guards,
  };
}

/** 어드민 화면용 품질 리포트. 실패해도 화면을 죽이지 않도록 null 을 돌려준다. */
export async function loadDataQuality(): Promise<DataQualityReport | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null; // 서비스 키가 없는 환경(로컬/프리뷰) — 빈 화면이 지어낸 수치보다 낫다
    const { data, error } = await sb.rpc("data_quality_report");
    if (error) {
      logger.warn("[data-quality] rpc failed", { error: error.message });
      return null;
    }
    const raw = data as ReportRaw | null;
    if (!raw || !raw.market_transactions || !raw.apartment_complexes) return null;

    const groups = [
      buildMarketTransactions(raw.market_transactions),
      buildApartmentComplexes(raw.apartment_complexes),
    ];

    const counts: Record<QualityVerdict, number> = {
      pass: 0,
      normal: 0,
      note: 0,
      defect: 0,
    };
    for (const g of groups) {
      counts.pass += g.guards.length;
      for (const c of g.checks) counts[c.verdict] += 1;
    }

    return { generatedAt: String(raw.generated_at ?? ""), groups, counts };
  } catch (e) {
    logger.warn("[data-quality] load failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
