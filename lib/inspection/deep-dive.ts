/**
 * 임장노트 **심화 분석 8축 빌더** — 규칙 기반, 결정적(deterministic).
 *
 * 사용자가 쓴 노트는 "본 것"이다. 이 파일은 거기에 **실제로 조회된 데이터**를
 * 붙여서 문제점·체크·주변환경·입지·투자·매매·추세·금융 여덟 축을 만든다.
 * 떠먹여 주는 것이 목적이지만, 떠먹여 주는 것과 지어내는 것은 다르다.
 *
 * 지키는 규칙 세 가지.
 *  1) 모든 숫자는 `NoteGrounding` 에서 온다. 이 파일은 숫자를 만들지 않는다.
 *     (계산은 한다 — 다만 입력이 전부 조회된 값이고, 가정은 문장에 적는다.)
 *  2) 못 읽은 축은 "해당 없음"이 아니라 **"확인하지 못함"**으로 적는다.
 *     status 가 unavailable 일 때 note 에 사유를 그대로 남긴다.
 *  3) 투자 권유를 하지 않는다. 판단 재료와 그 출처만 늘어놓는다.
 *
 * LLM 은 이 결과를 **해석**만 한다(축당 한 문장). 숫자를 새로 넣지 못하도록
 * 프롬프트에서 막는다 — 렌더 시점에는 LLM 을 부르지 않는다.
 */
import type { InspectionNote } from "@/lib/inspection/store-db";
import type { Grounded, NoteGrounding } from "@/lib/inspection/note-grounding";
import { groundingFailures } from "@/lib/inspection/note-grounding";

/**
 * 스키마 버전. 축 구성·문구 규칙이 바뀌면 올린다.
 * `/api/inspection/ai` 의 콘텐츠 해시에 섞어서, 모양이 바뀐 뒤에도 옛 캐시가
 * 그대로 나가는 일을 막는다.
 */
export const DEEP_DIVE_VERSION = 1;

export type DeepDiveAxisId =
  | "issues"
  | "checks"
  | "surroundings"
  | "location"
  | "investment"
  | "trade"
  | "trend"
  | "finance";

/** ok = 조회 데이터로 채움 · partial = 노트 기록만으로 채움 · unavailable = 못 채움 */
export type DeepDiveStatus = "ok" | "partial" | "unavailable";

export type DeepDiveFact = {
  label: string;
  value: string;
  /** 이 값이 어디서 왔는지. 화면에 그대로 노출한다. */
  source: string;
};

export type DeepDiveSection = {
  id: DeepDiveAxisId;
  label: string;
  eyebrow: string;
  headline: string;
  bullets: string[];
  facts: DeepDiveFact[];
  status: DeepDiveStatus;
  /** 비어 있거나 부분적일 때의 사유. 채웠으면 null. */
  note: string | null;
  sources: string[];
};

export type NoteDeepDive = {
  version: number;
  builtAt: string;
  sections: DeepDiveSection[];
  /** 확인하지 못한 것들 — 화면 하단에 "왜 비었는지"로 그대로 쓴다. */
  gaps: string[];
  disclaimer: string;
};

export const DEEP_DIVE_DISCLAIMER =
  "심화 분석은 공개 데이터와 작성자 기록을 규칙에 따라 정리한 참고 자료입니다. " +
  "투자 권유가 아니며, 최종 판단과 책임은 이용자에게 있습니다.";

/* ───────────────────────── 표기 헬퍼 ───────────────────────── */

const SRC_NOTE = "작성자 노트";

function manwonText(man: number | null | undefined): string {
  if (typeof man !== "number" || !Number.isFinite(man) || man <= 0) return "-";
  if (man >= 10_000) {
    const eok = man / 10_000;
    const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
    return `${s.replace(/\.?0+$/, "")}억`;
  }
  return `${Math.round(man).toLocaleString("ko-KR")}만원`;
}

function pctText(n: number | null | undefined, signed = true): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  const s = n.toFixed(2).replace(/\.?0+$/, "");
  return `${signed && n > 0 ? "+" : ""}${s}%`;
}

function ymText(ym: string | null | undefined): string {
  const s = (ym ?? "").replace(/\D/g, "");
  if (s.length >= 6) return `${s.slice(0, 4)}.${s.slice(4, 6)}`;
  return ym ?? "-";
}

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function uniq(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

/** 문장 하나를 최대 길이로 자른다 — 카드 레이아웃이 깨지지 않도록. */
function cap(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Grounded 슬롯이 왜 비었는지 한 줄로. `none` 만 "없음"이라고 말할 수 있다.
 * failed·unknown 은 사유를 그대로 옮긴다 — 실패를 없음으로 바꾸지 않는다.
 */
function slotNote(label: string, slot: Grounded<unknown>): string {
  if (slot.status === "none") return `${label}: 조회했지만 해당 자료가 없습니다.`;
  if (slot.reason) return slot.reason;
  return `${label}: 확인하지 못했습니다.`;
}

/** 여러 슬롯 중 못 읽은 것들의 사유 모음. */
function slotNotes(entries: [string, Grounded<unknown>][]): string[] {
  return uniq(
    entries.filter(([, s]) => s.status !== "ok").map(([label, s]) => slotNote(label, s)),
  );
}

function section(input: {
  id: DeepDiveAxisId;
  label: string;
  eyebrow: string;
  headline: string;
  bullets: string[];
  facts: DeepDiveFact[];
  /** ok 판정에 쓰는 "조회 데이터가 붙었는가" */
  grounded: boolean;
  missing: string[];
}): DeepDiveSection {
  const bullets = uniq(input.bullets).map((b) => cap(b, 220)).slice(0, 8);
  const facts = input.facts.slice(0, 10);
  const hasBody = bullets.length > 0 || facts.length > 0;

  let status: DeepDiveStatus = "unavailable";
  if (hasBody && input.grounded) status = "ok";
  else if (hasBody) status = "partial";

  const missing = uniq(input.missing);
  let note: string | null = null;
  if (status === "unavailable") {
    note =
      missing.length > 0
        ? missing.join(" ")
        : "이 축에 붙일 자료를 확인하지 못했습니다.";
  } else if (missing.length > 0) {
    note = `일부 항목은 확인하지 못했습니다. ${missing.join(" ")}`;
  }

  return {
    id: input.id,
    label: input.label,
    eyebrow: input.eyebrow,
    headline: hasBody ? input.headline : "확인하지 못했습니다",
    bullets,
    facts,
    status,
    note: note ? cap(note, 400) : null,
    sources: uniq(facts.map((f) => f.source)),
  };
}

/* ───────────────────────── 노트에서 뽑는 재료 ───────────────────────── */

const SCORE_LABELS: Record<string, string> = {
  location: "입지",
  school: "학군",
  transport: "교통",
  facility: "시설",
  future: "미래가치",
};

type ScoreEntry = { key: string; label: string; value: number };

function scoreEntries(note: InspectionNote): ScoreEntry[] {
  const s = note.scores ?? {};
  return Object.entries(SCORE_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      value: Number((s as Record<string, unknown>)[key] ?? 0),
    }))
    .filter((e) => Number.isFinite(e.value) && e.value > 0);
}

function undoneChecks(note: InspectionNote): string[] {
  const list = Array.isArray(note.checklist) ? note.checklist : [];
  return list
    .filter((c) => c && !c.done && clean(c.label))
    .map((c) => clean(c.label));
}

/* ───────────────────────── 1. 문제점 ───────────────────────── */

function buildIssues(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const low = scoreEntries(note).filter((e) => e.value <= 2);
  for (const e of low) {
    bullets.push(`${e.label} 항목을 5점 만점에 ${e.value}점으로 매겼습니다. 이 노트가 지목한 약점입니다.`);
  }

  const cons = clean(note.sections?.cons);
  if (cons) bullets.push(`직접 적은 단점: ${cap(cons, 160)}`);

  const undone = undoneChecks(note);
  if (undone.length > 0) {
    bullets.push(
      `체크리스트 ${undone.length}개가 미확인으로 남아 있습니다: ${cap(undone.slice(0, 3).join(" · "), 90)}`,
    );
  }

  /* 데이터가 지목하는 문제 — 전부 조회값이다. */
  const rel = g.regionRelative.value;
  if (rel && Number.isFinite(rel.deltaPct) && rel.deltaPct > 20) {
    grounded = true;
    bullets.push(
      `㎡당 시세가 ${rel.district} 평균보다 ${pctText(rel.deltaPct)} 높습니다. ` +
        `프리미엄의 근거(브랜드·연식·역세권)가 설명되는지 확인이 필요합니다.`,
    );
    facts.push({
      label: "구 평균 대비",
      value: pctText(rel.deltaPct),
      source: "한국부동산원 시세 · 국토부 실거래",
    });
  }

  const snap = g.regionSnapshot.value;
  if (snap && typeof snap.jeonseRatio === "number" && snap.jeonseRatio < 50) {
    grounded = true;
    bullets.push(
      `${snap.regionName} 전세가율이 ${pctText(snap.jeonseRatio, false)}로 낮습니다. ` +
        `매매가와 전세가 격차가 커서 자기자본 부담이 큰 구간입니다.`,
    );
    facts.push({
      label: "전세가율",
      value: pctText(snap.jeonseRatio, false),
      source: `${snap.source} ${ymText(snap.period)}`,
    });
  }

  const supply = g.supply.value ?? [];
  if (supply.length > 0) {
    const households = supply.reduce((a, s) => a + (Number(s.households) || 0), 0);
    if (households > 0) {
      grounded = true;
      bullets.push(
        `${g.district} 인근 입주 예정 물량이 ${supply.length}개 단지 ` +
          `${households.toLocaleString("ko-KR")}세대 확인됩니다. 입주장 전후 전세 약세를 보는 구간입니다.`,
      );
      facts.push({
        label: "입주 예정",
        value: `${supply.length}개 단지 / ${households.toLocaleString("ko-KR")}세대`,
        source: "국토교통부 입주예정물량",
      });
    }
  }

  const temp = g.temperature.value;
  if (temp && temp.temp.score < 40) {
    grounded = true;
    bullets.push(
      `${temp.regionLabel} 시장 온도가 ${temp.temp.score}점(50 중립)으로 낮습니다. ` +
        `매수 우위 구간일 수 있지만 매도 시점의 유동성도 같이 봐야 합니다.`,
    );
    facts.push({
      label: "시장 온도",
      value: `${temp.temp.score}점`,
      source: "누구집 시장온도(지수 모멘텀·거래량)",
    });
  }

  const missing = slotNotes([
    ["구 평균 대비 시세", g.regionRelative],
    ["지역 시세", g.regionSnapshot],
    ["입주예정물량", g.supply],
    ["시장 온도", g.temperature],
  ]);

  return section({
    id: "issues",
    label: "문제점",
    eyebrow: "이 매물에서 걸리는 것",
    headline: grounded
      ? "노트 기록과 공개 데이터가 함께 지목한 지점입니다"
      : "노트 기록에서 확인된 지점입니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 2. 체크해야 할 점 ───────────────────────── */

const SECTION_LABELS: [keyof NonNullable<InspectionNote["sections"]>, string][] = [
  ["location", "입지"],
  ["transport", "교통"],
  ["school", "학군"],
  ["facility", "시설"],
  ["future", "미래가치"],
];

function buildChecks(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  for (const label of undoneChecks(note).slice(0, 5)) {
    bullets.push(`미확인: ${label}`);
  }

  const blanks = SECTION_LABELS.filter(([key]) => !clean(note.sections?.[key])).map(
    ([, label]) => label,
  );
  if (blanks.length > 0) {
    bullets.push(`노트에서 비어 있는 항목: ${blanks.join(" · ")}. 재방문 때 채우면 비교가 쉬워집니다.`);
  }

  /* 데이터가 비어 있어서 생기는 확인 과제 — "없다"가 아니라 "확인 대상"으로 적는다. */
  if (g.txHistory.status !== "ok") {
    bullets.push(
      "이 단지의 최근 실거래 이력을 이 노트에 붙이지 못했습니다. " +
        "국토부 실거래가 공개시스템에서 동일 평형 신고분을 직접 확인해 주세요.",
    );
  }
  if (g.complex.status !== "ok") {
    bullets.push(
      "단지 기본 정보(준공연도·세대수·주차대수)를 매칭하지 못했습니다. " +
        "단지명을 정확히 입력하면 다음 분석부터 자동으로 붙습니다.",
    );
  }

  const ctx = g.publicContext.value;
  const hints = (ctx?.checklistHints ?? []).map(clean).filter(Boolean);
  if (hints.length > 0) {
    grounded = true;
    for (const h of hints.slice(0, 4)) bullets.push(h);
    facts.push({
      label: "공공데이터 기반 확인 항목",
      value: `${hints.length}건`,
      source: "공공데이터포털",
    });
  }

  const complex = g.complex.value;
  if (complex) {
    grounded = true;
    if (typeof complex.build_year === "number" && complex.build_year > 0) {
      const age = new Date().getFullYear() - complex.build_year;
      if (age >= 25) {
        bullets.push(
          `준공 ${complex.build_year}년(약 ${age}년 차)입니다. 배관·승강기 교체 이력과 ` +
            `장기수선충당금 적립 현황을 관리사무소에 확인해 보세요.`,
        );
      }
    }
    if (typeof complex.parking_per_hh === "number" && complex.parking_per_hh > 0) {
      facts.push({
        label: "세대당 주차",
        value: `${complex.parking_per_hh.toFixed(2).replace(/\.?0+$/, "")}대`,
        source: "공동주택관리정보시스템",
      });
      if (complex.parking_per_hh < 1) {
        bullets.push(
          `세대당 주차가 ${complex.parking_per_hh.toFixed(2).replace(/\.?0+$/, "")}대입니다. ` +
            `야간 주차 상황을 저녁 시간대에 다시 확인하는 편이 좋습니다.`,
        );
      }
    }
  }

  const missing = slotNotes([
    ["공공데이터", g.publicContext],
    ["단지 정보", g.complex],
  ]);

  return section({
    id: "checks",
    label: "체크해야 할 점",
    eyebrow: "다음 방문 전에 확인할 것",
    headline: "지금 노트에서 비어 있거나 확인이 필요한 항목입니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 3. 주변환경 분석 ───────────────────────── */

function buildSurroundings(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const ctx = g.publicContext.value;
  if (ctx) {
    for (const plan of ctx.plans.slice(0, 6)) {
      const summary = clean(plan.summary);
      if (!summary) continue;
      grounded = true;
      bullets.push(`${plan.title}: ${cap(summary, 150)}`);
      facts.push({
        label: plan.title,
        value: cap(summary, 60),
        source: `공공데이터포털 · ${ymText(plan.fetchedAt.slice(0, 7).replace("-", ""))}`,
      });
    }
    const weather = clean(ctx.weatherHint);
    const air = clean(ctx.airQualityHint);
    if (weather) {
      grounded = true;
      bullets.push(`방문 시점 기상: ${weather}`);
    }
    if (air) {
      grounded = true;
      facts.push({ label: "대기질", value: cap(air, 60), source: "에어코리아" });
    }
  }

  const facility = clean(note.sections?.facility);
  if (facility) bullets.push(`직접 본 주변 시설: ${cap(facility, 160)}`);
  const transport = clean(note.sections?.transport);
  if (transport) bullets.push(`직접 본 교통 환경: ${cap(transport, 160)}`);

  if (clean(note.weather)) {
    facts.push({ label: "방문일 날씨", value: clean(note.weather), source: SRC_NOTE });
  }
  if (clean(note.transportation)) {
    facts.push({ label: "이동 수단", value: clean(note.transportation), source: SRC_NOTE });
  }

  const missing = slotNotes([["공공데이터", g.publicContext]]);

  return section({
    id: "surroundings",
    label: "주변환경 분석",
    eyebrow: "생활권에 무엇이 있나",
    headline: grounded
      ? "공공데이터로 확인한 생활 인프라와 현장 기록입니다"
      : "현장에서 기록한 주변 환경입니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 4. 입지 분석 ───────────────────────── */

function buildLocation(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const entries = scoreEntries(note);
  const core = entries.filter((e) => ["location", "transport", "school"].includes(e.key));
  for (const e of core) {
    facts.push({ label: e.label, value: `${e.value}/5`, source: SRC_NOTE });
  }
  if (core.length > 0) {
    const avg = core.reduce((a, e) => a + e.value, 0) / core.length;
    bullets.push(
      `입지·교통·학군 평균 ${avg.toFixed(1).replace(/\.0$/, "")}점(5점 만점)으로 기록했습니다.`,
    );
    const best = [...core].sort((a, b) => b.value - a.value)[0];
    const worst = [...core].sort((a, b) => a.value - b.value)[0];
    if (best && worst && best.value !== worst.value) {
      bullets.push(`가장 높게 본 축은 ${best.label}, 가장 낮게 본 축은 ${worst.label}입니다.`);
    }
  }

  const rel = g.regionRelative.value;
  if (rel) {
    grounded = true;
    const dir = rel.deltaPct >= 0 ? "높습니다" : "낮습니다";
    bullets.push(
      `㎡당 ${manwonText(rel.complexPerM2Manwon)} 수준으로, ${rel.district} 평균 ` +
        `${manwonText(rel.districtPerM2Manwon)} 대비 ${pctText(rel.deltaPct)} ${dir}. ` +
        `면적을 맞춰 비교한 값이라 평형이 달라도 비교가 됩니다.`,
    );
    facts.push({
      label: "㎡당 시세",
      value: manwonText(rel.complexPerM2Manwon),
      source: `국토부 실거래 ${ymText(rel.period)}`,
    });
    facts.push({
      label: `${rel.district} 평균`,
      value: manwonText(rel.districtPerM2Manwon),
      source: "한국부동산원 시세",
    });
  }

  const complex = g.complex.value;
  if (complex) {
    grounded = true;
    const parts: string[] = [];
    if (complex.build_year) parts.push(`${complex.build_year}년 준공`);
    if (complex.households) parts.push(`${complex.households.toLocaleString("ko-KR")}세대`);
    if (complex.total_floors) parts.push(`최고 ${complex.total_floors}층`);
    if (parts.length > 0) {
      bullets.push(`단지 제원: ${parts.join(" · ")}.`);
      facts.push({ label: "단지 제원", value: parts.join(" · "), source: "공동주택 기본정보" });
    }
    const addr = clean(complex.road_address) || clean(complex.address);
    if (addr) facts.push({ label: "소재지", value: cap(addr, 60), source: "공동주택 기본정보" });
  }

  const locText = clean(note.sections?.location);
  if (locText) bullets.push(`직접 본 입지: ${cap(locText, 160)}`);

  const missing = slotNotes([
    ["구 평균 대비 시세", g.regionRelative],
    ["단지 정보", g.complex],
  ]);

  return section({
    id: "location",
    label: "입지 분석",
    eyebrow: "자리값이 얼마인가",
    headline: grounded
      ? "구 평균과 면적을 맞춰 비교한 입지 위치입니다"
      : "노트에 기록한 입지 평가입니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 5. 투자 분석 ───────────────────────── */

function buildInvestment(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const snap = g.regionSnapshot.value;
  if (snap) {
    grounded = true;
    const src = `${snap.source} ${ymText(snap.period)}`;
    if (typeof snap.saleChangeMonthly === "number") {
      bullets.push(
        `${snap.regionName} 매매가는 전월 대비 ${pctText(snap.saleChangeMonthly)} 움직였습니다.`,
      );
      facts.push({ label: "전월 대비", value: pctText(snap.saleChangeMonthly), source: src });
    }
    if (typeof snap.jeonseRatio === "number") {
      facts.push({ label: "전세가율", value: pctText(snap.jeonseRatio, false), source: src });
      bullets.push(
        `전세가율 ${pctText(snap.jeonseRatio, false)} — 전세를 끼고 들어갈 때 필요한 ` +
          `자기자본 비중을 여기서 가늠합니다. 실제 가능 여부는 임차 조건에 따라 달라집니다.`,
      );
    }
    if (typeof snap.tradeCount === "number" && snap.tradeCount > 0) {
      facts.push({
        label: "월 거래량",
        value: `${snap.tradeCount.toLocaleString("ko-KR")}건`,
        source: src,
      });
    }
  }

  const temp = g.temperature.value;
  if (temp) {
    grounded = true;
    bullets.push(`${temp.regionLabel} 시장 온도 ${temp.temp.score}점: ${temp.temp.headline}`);
    facts.push({
      label: "시장 온도",
      value: `${temp.temp.score}점 / 100`,
      source: "누구집 시장온도(지수 모멘텀·거래량)",
    });
    if (temp.trend) {
      bullets.push(`지수 추세: ${cap(temp.trend.detail, 140)}`);
    }
    if (temp.temp.volumeNote) bullets.push(temp.temp.volumeNote);
  }

  const supply = g.supply.value ?? [];
  if (supply.length > 0) {
    grounded = true;
    const households = supply.reduce((a, s) => a + (Number(s.households) || 0), 0);
    const nearest = [...supply].sort((a, b) => a.moveInYm.localeCompare(b.moveInYm))[0];
    facts.push({
      label: "입주 예정 물량",
      value: `${households.toLocaleString("ko-KR")}세대`,
      source: "국토교통부 입주예정물량",
    });
    if (nearest) {
      bullets.push(
        `가장 이른 입주는 ${ymText(nearest.moveInYm)} ${clean(nearest.aptName) || "인근 단지"}입니다. ` +
          `입주 시점 전후로 전세 물량이 몰리는 구간을 미리 표시해 두세요.`,
      );
    }
  }

  const intent = g.intent;
  bullets.push(
    `이 노트는 "${intent}" 목적으로 작성됐습니다. 같은 숫자라도 목적에 따라 ` +
      `보는 축이 달라집니다 — 위 값들은 판단 재료이고, 투자 권유가 아닙니다.`,
  );

  const missing = slotNotes([
    ["지역 시세", g.regionSnapshot],
    ["시장 온도", g.temperature],
    ["입주예정물량", g.supply],
  ]);

  return section({
    id: "investment",
    label: "투자 분석",
    eyebrow: "시장이 어디쯤 와 있나",
    headline: grounded
      ? "지역 시세·시장 온도·공급으로 본 현재 위치입니다"
      : "투자 판단에 붙일 시장 데이터를 확인하지 못했습니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 6. 매매 분석 ───────────────────────── */

const PRICE_STATUS_TEXT: Record<string, string> = {
  undervalued: "최근 신고가 대비 낮은 구간",
  fair: "최근 신고가 범위 안",
  overheated: "최근 신고가 대비 높은 구간",
  insufficient_data: "판정할 만큼의 신고 건수가 모이지 않음",
};

function buildTrade(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const pv = g.priceView.value;
  if (pv && pv.source !== "mock" && pv.source !== "workbench") {
    grounded = true;
    const statusText = PRICE_STATUS_TEXT[pv.status] ?? pv.status;
    bullets.push(`가격대 판정: ${statusText}. ${cap(pv.reason, 140)}`);
    if (pv.estimateRange.max > 0) {
      facts.push({
        label: "최근 신고 범위",
        value: `${manwonText(pv.estimateRange.min)} ~ ${manwonText(pv.estimateRange.max)}`,
        source: "국토부 실거래 신고분",
      });
    }
    if (pv.avgRecentMan) {
      facts.push({
        label: "최근 평균",
        value: manwonText(pv.avgRecentMan),
        source: "국토부 실거래 신고분",
      });
    }
    if (pv.dealCount > 0) {
      facts.push({
        label: "집계 건수",
        value: `${pv.dealCount}건`,
        source: "국토부 실거래 신고분",
      });
    }
    if (typeof pv.jeonseRatio === "number") {
      facts.push({ label: "전세가율", value: pctText(pv.jeonseRatio, false), source: "실거래 대비" });
    }
    bullets.push(cap(pv.disclaimer, 160));
  } else if (pv) {
    /* mock·workbench 는 실제 이 단지의 거래가 아니다. 숫자를 옮기지 않는다. */
    bullets.push(
      "이 단지의 실거래 신고분으로는 가격대를 판정하지 못했습니다. " +
        "샘플 시세로 대체하지 않았습니다 — 국토부 실거래가 공개시스템에서 직접 확인해 주세요.",
    );
  }

  const bands = g.areaBands.value ?? [];
  if (bands.length > 0) {
    grounded = true;
    const top = [...bands].sort((a, b) => b.count - a.count).slice(0, 3);
    for (const b of top) {
      facts.push({
        label: `${b.label} (${b.count}건)`,
        value: `최근 ${manwonText(b.latestManwon)} · 평균 ${manwonText(b.avgManwon)}`,
        source: `국토부 실거래 ${ymText(b.latestYm)}`,
      });
    }
    const main = top[0];
    if (main) {
      bullets.push(
        `거래가 가장 많은 면적대는 ${main.label}입니다(${main.count}건). ` +
          `평형이 다르면 같은 단지라도 가격 흐름이 달라지므로, 보려는 평형의 구간을 기준으로 보세요.`,
      );
    }
  }

  const missing = slotNotes([
    ["가격대 판정", g.priceView],
    ["면적대별 시세", g.areaBands],
  ]);

  return section({
    id: "trade",
    label: "매매 분석",
    eyebrow: "지금 가격이 어디쯤인가",
    headline: grounded
      ? "실거래 신고분으로 본 가격 구간입니다"
      : "가격 구간을 판정할 실거래 자료를 확인하지 못했습니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 7. 실거래 및 추세 분석 ───────────────────────── */

function buildTrend(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const rows = [...(g.txHistory.value ?? [])]
    .filter((r) => Number.isFinite(r.avg_manwon) && r.avg_manwon > 0)
    .sort((a, b) => a.yyyymm.localeCompare(b.yyyymm));

  if (rows.length > 0) {
    grounded = true;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const totalDeals = rows.reduce((a, r) => a + (Number(r.deal_count) || 0), 0);

    facts.push({
      label: "집계 구간",
      value: `${ymText(first?.yyyymm)} ~ ${ymText(last?.yyyymm)} (${rows.length}개월)`,
      source: "국토부 실거래 신고분",
    });
    facts.push({
      label: "신고 건수",
      value: `${totalDeals.toLocaleString("ko-KR")}건`,
      source: "국토부 실거래 신고분",
    });
    if (last) {
      facts.push({
        label: `${ymText(last.yyyymm)} 평균`,
        value: manwonText(last.avg_manwon),
        source: "국토부 실거래 신고분",
      });
    }

    /* 최근 3개월 평균 vs 직전 3개월 평균. 구간이 모자라면 계산하지 않는다. */
    if (rows.length >= 6) {
      const recent = rows.slice(-3);
      const prior = rows.slice(-6, -3);
      const mean = (xs: typeof rows) => xs.reduce((a, r) => a + r.avg_manwon, 0) / xs.length;
      const rv = mean(recent);
      const pvv = mean(prior);
      if (pvv > 0) {
        const delta = ((rv - pvv) / pvv) * 100;
        bullets.push(
          `최근 3개월 평균 ${manwonText(rv)}, 직전 3개월 평균 ${manwonText(pvv)} — ` +
            `${pctText(delta)} 차이입니다.`,
        );
        facts.push({
          label: "3개월 전 대비",
          value: pctText(delta),
          source: "국토부 실거래 월별 평균",
        });
      }
    } else {
      bullets.push(
        `신고 월이 ${rows.length}개월치라 추세를 계산하기에는 짧습니다. ` +
          `구간을 넓혀 보거나 인근 단지와 함께 보는 편이 정확합니다.`,
      );
    }

    const thin = rows.filter((r) => (Number(r.deal_count) || 0) <= 2).length;
    if (thin > 0) {
      bullets.push(
        `${rows.length}개월 중 ${thin}개월은 신고가 2건 이하입니다. ` +
          `거래가 얇은 달의 평균은 한두 건에 끌려가므로 그대로 추세로 읽지 마세요.`,
      );
    }

    bullets.push(
      "월별 평균은 전용면적을 구분하지 않고 낸 값입니다. 큰 평형이 팔린 달은 " +
        "단지 전체가 오른 것처럼 보일 수 있습니다.",
    );
  }

  const temp = g.temperature.value;
  if (temp?.trend) {
    grounded = true;
    bullets.push(`지역 지수 추세: ${cap(temp.trend.verdict, 60)} — ${cap(temp.trend.detail, 140)}`);
    facts.push({
      label: "지수 누적 변동",
      value: pctText(temp.trend.cumulativePct),
      source: "한국부동산원 지수",
    });
  }

  const missing = slotNotes([
    ["실거래 이력", g.txHistory],
    ["시장 온도", g.temperature],
  ]);

  return section({
    id: "trend",
    label: "실거래 및 추세 분석",
    eyebrow: "신고된 거래는 어떻게 움직였나",
    headline: grounded
      ? "국토부 신고분을 월별로 묶어 본 흐름입니다"
      : "이 단지의 실거래 이력을 확인하지 못했습니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 8. 금융 조건 분석 ───────────────────────── */

/** "3.62~5.13%" 같은 문자열에서 숫자만 뽑는다. 못 뽑으면 빈 배열. */
function parseRatePcts(s: string): number[] {
  const found = String(s ?? "").match(/\d+(?:\.\d+)?/g);
  if (!found) return [];
  return found.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 30);
}

/** 원리금균등 월 상환액. 대출 원금(만원), 연이율(%), 기간(년). */
function monthlyPaymentMan(principalMan: number, annualPct: number, years: number): number {
  const r = annualPct / 100 / 12;
  const n = years * 12;
  if (r <= 0) return principalMan / n;
  const f = Math.pow(1 + r, n);
  return (principalMan * r * f) / (f - 1);
}

const LOAN_UNIT_MAN = 10_000; // 1억 원
const LOAN_YEARS = 30;

function buildFinance(note: InspectionNote, g: NoteGrounding): DeepDiveSection {
  const bullets: string[] = [];
  const facts: DeepDiveFact[] = [];
  let grounded = false;

  const base = g.baseRate.value;
  if (base) {
    grounded = true;
    facts.push({
      label: "한국은행 기준금리",
      value: base.label,
      source: `한국은행 ${ymText(base.cycle)}`,
    });
  }

  const mort = g.mortgage.value;
  const rates = mort?.rates ?? [];
  if (rates.length > 0) {
    grounded = true;
    const nums = rates.flatMap((r) => [...parseRatePcts(r.variable), ...parseRatePcts(r.fixed)]);
    const lo = nums.length > 0 ? Math.min(...nums) : null;
    const hi = nums.length > 0 ? Math.max(...nums) : null;

    facts.push({
      label: "주담대 공시 범위",
      value: lo && hi ? `${lo.toFixed(2)}% ~ ${hi.toFixed(2)}%` : `${rates.length}개 기관`,
      source: `${mort?.source ?? "금융감독원"} ${mort?.asOf ?? ""}`.trim(),
    });

    if (lo && hi) {
      const mLo = monthlyPaymentMan(LOAN_UNIT_MAN, lo, LOAN_YEARS);
      const mHi = monthlyPaymentMan(LOAN_UNIT_MAN, hi, LOAN_YEARS);
      bullets.push(
        `공시 금리 ${lo.toFixed(2)}~${hi.toFixed(2)}% 기준, 1억 원을 ${LOAN_YEARS}년 ` +
          `원리금균등으로 빌리면 월 상환액은 약 ${Math.round(mLo).toLocaleString("ko-KR")}만원` +
          `~${Math.round(mHi).toLocaleString("ko-KR")}만원입니다.`,
      );
      facts.push({
        label: `1억당 월 상환액 (${LOAN_YEARS}년 원리금균등)`,
        value:
          `${Math.round(mLo).toLocaleString("ko-KR")}만원 ~ ` +
          `${Math.round(mHi).toLocaleString("ko-KR")}만원`,
        source: "공시 금리 기반 단순 계산",
      });
      bullets.push(
        "계산 가정: 거치 없음, 중도상환수수료·보증료·부대비용 제외, 금리 고정 가정. " +
          "실제 조건은 소득·신용·담보·규제지역 여부에 따라 달라집니다.",
      );
    }
  } else {
    /* G10 원칙: 공시를 못 받으면 지어낸 금리표를 만들지 않는다. */
    bullets.push(
      "은행별 주택담보대출 공시 금리를 받아오지 못했습니다. 임의의 금리로 상환액을 " +
        "계산하지 않았습니다 — 금융감독원 '금융상품 한눈에'에서 직접 확인해 주세요.",
    );
  }

  const snapRatio = g.regionSnapshot.value?.jeonseRatio;
  if (typeof snapRatio === "number") {
    grounded = true;
    bullets.push(
      `지역 전세가율은 ${pctText(snapRatio, false)}입니다. 전세를 끼고 매수할 때 ` +
        `필요한 자기자본의 대략적인 크기를 여기서 가늠할 수 있습니다.`,
    );
  }

  bullets.push(
    "여기 적힌 값은 공시·통계를 그대로 옮기거나 명시된 가정으로 계산한 것입니다. " +
      "특정 상품이나 실행 여부를 권유하지 않습니다.",
  );

  const missing = slotNotes([
    ["기준금리", g.baseRate],
    ["주담대 공시", g.mortgage],
  ]);

  return section({
    id: "finance",
    label: "금융 조건 분석",
    eyebrow: "돈은 어떻게 붙나",
    headline: grounded
      ? "공시 금리와 기준금리로 본 자금 조건입니다"
      : "금융 공시 자료를 확인하지 못했습니다",
    bullets,
    facts,
    grounded,
    missing,
  });
}

/* ───────────────────────── 엔트리 ───────────────────────── */

const BUILDERS: ((note: InspectionNote, g: NoteGrounding) => DeepDiveSection)[] = [
  buildIssues,
  buildChecks,
  buildSurroundings,
  buildLocation,
  buildInvestment,
  buildTrade,
  buildTrend,
  buildFinance,
];

/**
 * 노트 + 근거 → 심화 분석 8축.
 * 축은 언제나 8개를 다 만든다. 못 채운 축은 지우지 않고 `unavailable` 로 남긴다 —
 * 사라진 축은 "해당 없음"으로 읽히지만, 실제로는 "확인 못 함"인 경우가 많다.
 */
export function buildNoteDeepDive(note: InspectionNote, g: NoteGrounding): NoteDeepDive {
  const sections = BUILDERS.map((fn) => fn(note, g));
  return {
    version: DEEP_DIVE_VERSION,
    builtAt: new Date().toISOString(),
    sections,
    gaps: groundingFailures(g),
    disclaimer: DEEP_DIVE_DISCLAIMER,
  };
}

/** 실제로 채워진 축 수 — 화면에서 "8축 중 N축" 표기에 쓴다. */
export function filledAxisCount(d: NoteDeepDive): number {
  return d.sections.filter((s) => s.status !== "unavailable").length;
}
