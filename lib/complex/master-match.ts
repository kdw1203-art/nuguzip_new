/**
 * 실거래 단지 ↔ 단지 대장(K-apt) 마스터 매칭 판정 — 순수 함수.
 *
 * 왜 별도 모듈인가: 2026-08-10 실사용자 신고로 드러난 오매칭의 재발 방지 코드다.
 * 지도 단지 패널의 "공작아파트"(안양 관양동 1588 = 공작부영2차, 1,710세대)에
 * 옆 단지 "공작럭키"(관양동 1587, 766세대)의 스펙 전부(세대수·시공사·주차·
 * kaptCode·도로명주소)가 붙어 있었다. 예전 판정이 "정규화 완전일치 없으면
 * 최단 이름"이라는 임의 규칙이었기 때문이다 — 후보가 여럿인데 판별 근거가
 * 없으면 고르지 말아야 한다(틀린 스펙이 빈 스펙보다 나쁘다).
 *
 * 판정 순서 (판별력 있는 신호만 쓴다):
 *   1) 지번 일치 — 실거래 주소("{시군구} {법정동} {지번}", molit toRow 형식)의
 *      법정동+지번이 마스터 jibunAddress 에 그대로 있으면 그 후보다. 필지가
 *      같다는 건 이름보다 강한 사실이다.
 *   2) 유일한 정규화 완전일치 — 완전일치가 둘이면(동명이단지: 목동성원류)
 *      이름은 판별력이 없다.
 *   3) 후보가 하나뿐이면 그 후보 ("리센츠"→"잠실리센츠" 같은 브랜드 기본형).
 *   4) 유일한 법정동 일치 — 같은 동 후보가 여럿이면 동은 판별력이 없다
 *      (공작 사례가 정확히 이것: 럭키·성일·부영 전부 관양동).
 *   5) 그 외 — null. 임의로 고르지 않는다.
 *
 * server-only 를 걸지 않는 이유: 비밀도 DB 도 없는 순수 판정이고, 실측 픽스처
 * (공작·목동성원)로 노드에서 직접 단위검증하는 것이 이 분리의 목적이다.
 */

export type MasterCandidate = {
  name: string;
  metadata: Record<string, unknown> | null;
};

export type AddrSignal = { emd: string | null; jibun: string | null };

/** market_transactions.complex_name ↔ 대장 name 비교용 정규화 (complex-store 와 공유) */
export function normalizeComplexName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

/**
 * MOLIT 적재 주소에서 법정동·지번을 뽑는다.
 * 형식은 lib/market/molit-transactions.ts toRow 의 [시군구, 법정동, 지번].join(" ").
 * 다른 형식(옛 ETL 등)이면 못 뽑은 대로 null — 짐작으로 채우지 않는다.
 */
export function parseMtAddress(address: string | null | undefined): AddrSignal {
  const toks = (address ?? "").trim().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return { emd: null, jibun: null };
  const last = toks[toks.length - 1];
  const jibun = /^\d+(-\d+)?$/.test(last) ? last : null;
  const emdTok = jibun ? toks[toks.length - 2] : last;
  /* 법정동 표기: 관양동·여의도동·삼천동1가·교문리·조치원읍 … */
  const emd = /(동|가|리|읍|면)$/.test(emdTok) ? emdTok : null;
  return { emd, jibun };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type MasterPick = {
  best: MasterCandidate | null;
  /** 어떤 근거로 골랐나 / 왜 못 골랐나 — 로그·검증용 */
  reason:
    | "no_candidates"
    | "jibun"
    | "unique_exact_name"
    | "single_candidate"
    | "unique_emd"
    | "ambiguous";
};

export function pickBestMaster(
  candidates: MasterCandidate[],
  targetName: string,
  addr: AddrSignal,
): MasterPick {
  if (candidates.length === 0) return { best: null, reason: "no_candidates" };

  const target = normalizeComplexName(targetName);
  const info = candidates.map((c) => {
    const m = c.metadata ?? {};
    const jibunAddr = typeof m.jibunAddress === "string" ? m.jibunAddress : "";
    const cEmd = typeof m.emd === "string" ? m.emd : "";
    const exact = normalizeComplexName(c.name) === target;
    const emdHit =
      !!addr.emd && (cEmd === addr.emd || jibunAddr.includes(` ${addr.emd} `));
    /* 지번은 토큰 경계로 본다 — "1588" 이 "1588-5" 에 걸리면 안 된다. */
    const jibunHit =
      !!addr.emd &&
      !!addr.jibun &&
      new RegExp(
        `(^|\\s)${escapeRe(addr.emd)}\\s+${escapeRe(addr.jibun)}(?=\\s|$)`,
      ).test(jibunAddr);
    return { c, exact, emdHit, jibunHit };
  });

  /* 1) 지번 일치 — 유일할 때만 (둘이면 대장 자체가 중복이라 여기서 못 가른다) */
  const jibunHits = info.filter((i) => i.jibunHit);
  if (jibunHits.length === 1) return { best: jibunHits[0].c, reason: "jibun" };
  if (jibunHits.length > 1) return { best: null, reason: "ambiguous" };

  /* 2) 완전일치가 있으면 그 안에서만 가른다 — 완전일치가 둘이어도(동명이단지:
     목동성원류) 법정동이 하나를 유일하게 가리키면 그쪽이다. */
  const exacts = info.filter((i) => i.exact);
  const pool = exacts.length > 0 ? exacts : info;

  /* 3) 풀에 하나뿐이면 그 후보 — 유일 완전일치("공작럭키") 또는
     단일 후보 브랜드 기본형("리센츠"→"잠실리센츠"). */
  if (pool.length === 1) {
    return {
      best: pool[0].c,
      reason: pool[0].exact ? "unique_exact_name" : "single_candidate",
    };
  }

  /* 4) 풀 안에서 유일한 법정동 일치 — 전원이 같은 동이면(공작 사례: 럭키·성일·
     부영 전부 관양동) 동은 판별력이 없어 여기 걸리지 않는다. */
  const emdHits = pool.filter((i) => i.emdHit);
  if (emdHits.length === 1) return { best: emdHits[0].c, reason: "unique_emd" };

  /* 5) 판별 불가 — 예전엔 여기서 최단 이름을 임의로 골랐다(공작 사례의 원인). */
  return { best: null, reason: "ambiguous" };
}
