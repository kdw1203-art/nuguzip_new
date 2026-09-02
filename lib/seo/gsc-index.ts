import "server-only";

import { logger } from "@/lib/log";
import { getServiceAccountToken } from "@/lib/seo/google-oauth";
import { SITEMAP_SECTIONS } from "@/lib/seo/sitemap-sections";
import type { SitemapSectionSlug } from "@/lib/seo/sitemap-slugs";

/**
 * N25 — 색인률 측정.
 *
 * ── 무엇을 재는가 ────────────────────────────────────────────────────────
 * "사이트맵에 올린 URL 중 실제로 구글 색인에 들어간 비율". 이 숫자를 모르면
 * "색인이 잘 되고 있나"에 감으로 답하게 되고, 사이트맵을 아무리 정교하게 나눠 봐야
 * 효과를 확인할 방법이 없다.
 *
 * ── 왜 전수가 아니라 표본인가 ────────────────────────────────────────────
 * 색인 여부를 URL 단위로 확실히 알려 주는 유일한 공식 경로는 **URL 검사 API** 인데
 * 하루 2,000건 · 분당 600건 제한이 있다. 우리 사이트맵은 5,600개가 넘으므로
 * 전수 검사는 사흘이 걸리고, 그렇게 얻은 값은 이미 사흘 전 상태다.
 * 그래서 유형별로 골고루 뽑은 표본을 검사하고 **표본 수를 반드시 같이 기록한다.**
 * 분모 없는 비율은 숫자가 아니라 인상이다.
 *
 * 서치콘솔 사이트맵 API 의 `contents[].indexed` 를 쓰지 않는 이유: 구글이 이 값을
 * 오래전에 채우지 않기로 했고 대부분 0 이 온다. 0 을 그대로 적으면 "색인 0건"이라는
 * 거짓 기록이 매주 쌓인다.
 *
 * ── 제출 수는 우리 값을 쓴다 ─────────────────────────────────────────────
 * 분모(submitted)는 서치콘솔이 아니라 **우리 사이트맵 생성기**가 센 값이다.
 * 우리 값은 정의상 지금 이 순간 기준이고, 서치콘솔의 제출 수는 마지막 크롤 시점에
 * 묶여 있어 오늘 상태와 어긋난다.
 *
 * 키: GSC_SERVICE_ACCOUNT_EMAIL · GSC_SERVICE_ACCOUNT_PRIVATE_KEY · GSC_SITE_URL
 *     GSC_SITE_URL 은 서치콘솔 속성 식별자 그대로 — 도메인 속성이면
 *     `sc-domain:naezipnow.com`, URL 접두어 속성이면 `https://naezipnow.com/`.
 */

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/** 회당 검사할 URL 수. 2,000/일 할당량 대비 넉넉하고, 주 1회면 부담이 없다. */
export const DEFAULT_SAMPLE_SIZE = 60;

export interface SectionTally {
  submitted: number;
  sampled: number;
  indexed: number;
}

export interface IndexCoverageResult {
  submitted: number;
  sampled: number;
  indexed: number;
  notIndexed: number;
  errored: number;
  bySection: Record<string, SectionTally>;
  coverageStates: Record<string, number>;
}

export function isGscConfigured(): boolean {
  return Boolean(
    process.env.GSC_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() &&
      process.env.GSC_SITE_URL?.trim(),
  );
}

/**
 * 결정적 표본 추출.
 *
 * `Math.random()` 을 쓰지 않는 이유: 매주 완전히 다른 URL 을 뽑으면 색인률의
 * 주간 변동이 "색인 상태가 변한 것"인지 "다른 URL 을 봤을 뿐"인지 구분되지 않는다.
 * 목록 길이에 대해 균등 간격으로 뽑으면 표본이 목록 전체에 골고루 퍼지면서도
 * 주마다 같은 자리를 본다 — 그래야 추세가 추세로 읽힌다.
 */
function evenSample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = items[Math.floor(i * step)];
    if (item !== undefined) out.push(item);
  }
  return out;
}

interface InspectResponse {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
    };
  };
}

/**
 * URL 하나의 색인 상태.
 *
 * @returns `indexed` 는 verdict === 'PASS' 일 때만 true. null 은 **검사 실패**이며
 *          "색인 안 됨"과 다르다 — 섞으면 장애가 있는 주마다 색인률이 떨어진 것처럼 보인다.
 */
async function inspectUrl(
  token: string,
  siteUrl: string,
  inspectionUrl: string,
): Promise<{ indexed: boolean; coverageState: string } | null> {
  try {
    const res = await fetch(INSPECT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[gsc-index] 검사 실패 ${inspectionUrl}: HTTP ${res.status} ${text.slice(0, 160)}`);
      return null;
    }
    const json = (await res.json()) as InspectResponse;
    const r = json.inspectionResult?.indexStatusResult;
    return {
      indexed: r?.verdict === "PASS",
      coverageState: r?.coverageState ?? "(알 수 없음)",
    };
  } catch (e) {
    logger.warn(
      `[gsc-index] 검사 예외 ${inspectionUrl}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * 사이트맵 유형별로 표본을 뽑아 색인 상태를 실측한다.
 *
 * 실패하면 던진다. 부분 실패(URL 몇 개 검사 실패)는 `errored` 에 세어 기록에 남기고,
 * 토큰 발급 실패처럼 회차 전체가 성립하지 않는 경우만 던진다 — 반쪽짜리 표본을
 * 정상 기록으로 남기면 그 주의 색인률이 조용히 왜곡된다.
 */
export async function measureIndexCoverage(
  sampleSize: number = DEFAULT_SAMPLE_SIZE,
): Promise<IndexCoverageResult> {
  const siteUrl = process.env.GSC_SITE_URL?.trim();
  if (!siteUrl) throw new Error("GSC_SITE_URL 미설정");

  const token = await getServiceAccountToken(SCOPE);

  /* 유형별 URL 목록을 먼저 전부 센다 — 분모는 표본이 아니라 전수여야 한다. */
  const sections = await Promise.all(
    SITEMAP_SECTIONS.map(async (s) => {
      const entries = await s.load();
      return { slug: s.slug as SitemapSectionSlug, urls: entries.map((e) => e.url) };
    }),
  );

  const submitted = sections.reduce((sum, s) => sum + s.urls.length, 0);
  if (submitted === 0) {
    throw new Error("사이트맵 URL 이 0개입니다 — 조회 실패로 보고 이번 회차를 기록하지 않습니다");
  }

  /* 표본을 유형 크기에 비례해 배분하되, 유형마다 최소 2개는 본다. 단지(5,147)가
     전체의 90%라고 표본까지 90%를 가져가면 나머지 유형은 매주 0~1개만 보게 되고,
     "용어사전이 색인이 안 된다" 같은 사실을 영영 못 본다. */
  const nonEmpty = sections.filter((s) => s.urls.length > 0);
  const minPer = 2;
  const reserved = Math.min(sampleSize, nonEmpty.length * minPer);
  const remaining = Math.max(0, sampleSize - reserved);

  const bySection: Record<string, SectionTally> = {};
  const coverageStates: Record<string, number> = {};
  let sampled = 0;
  let indexed = 0;
  let errored = 0;

  for (const section of nonEmpty) {
    const share = Math.round((section.urls.length / submitted) * remaining);
    const take = Math.min(section.urls.length, minPer + share);
    const picks = evenSample(section.urls, take);

    const tally: SectionTally = {
      submitted: section.urls.length,
      sampled: 0,
      indexed: 0,
    };

    for (const url of picks) {
      const result = await inspectUrl(token, siteUrl, url);
      if (result === null) {
        errored += 1;
        continue;
      }
      sampled += 1;
      tally.sampled += 1;
      if (result.indexed) {
        indexed += 1;
        tally.indexed += 1;
      }
      coverageStates[result.coverageState] = (coverageStates[result.coverageState] ?? 0) + 1;
      /* 분당 600건 제한. 60건이면 여유롭지만 간격을 두는 편이 예의고, 이 크론은
         급할 이유가 전혀 없다. */
      await new Promise((r) => setTimeout(r, 120));
    }

    bySection[section.slug] = tally;
  }

  /* 표본 전부가 검사 실패면 색인률 0% 가 아니라 "이번 주는 못 쟀다" 이다. */
  if (sampled === 0) {
    throw new Error(`URL 검사 ${errored}건이 모두 실패했습니다 — 이번 회차를 기록하지 않습니다`);
  }

  return {
    submitted,
    sampled,
    indexed,
    notIndexed: sampled - indexed,
    errored,
    bySection,
    coverageStates,
  };
}
