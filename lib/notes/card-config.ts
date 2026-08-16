import {
  availableFrames,
  getFrame,
  type CardFrame,
  type NoteCardSource,
} from "@/lib/notes/card-frames";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/notes/card-themes";

/**
 * "나만의 카드" 구성 — 노트 metadata.cardConfig 에 저장. **순수 로직(테스트 가능).**
 *
 * 규칙:
 *  - 최소 5장(MIN_FRAMES). 표지(cover)는 항상 첫 장으로 강제한다.
 *  - 선택 프레임은 그 노트에서 채울 수 있는(available) 것만 유효하다 — 없는 데이터의
 *    빈 장을 카드에 넣지 않는다(사실 우선).
 *  - AI 자동 구성: 채울 수 있는 프레임을 카테고리 우선순위로 골라 기본 카드를 만든다
 *    (사용자가 저장하자마자 카드가 하나 존재하게). 그 뒤 사용자가 테마·장·내용을 바꾼다.
 */

export const MIN_FRAMES = 5;
export const MAX_FRAMES = 15;

export type CardConfig = {
  themeId: string;
  /** 표지가 첫 원소. 순서가 카드 장 순서다. */
  frameIds: string[];
};

/** 자동 구성에서 표지 다음에 채우는 우선순위(있으면 넣는다). */
const AUTO_ORDER = [
  "score-ring",
  "summary",
  "score-bars",
  "checklist",
  "verdict",
  "pros",
  "cons",
  "intent",
  "visit-context",
  "tags",
  "location",
  "cta",
];

/**
 * AI 기본 카드 자동 구성 — 채울 수 있는 프레임을 우선순위로 골라 표지 포함 구성.
 * 채울 수 있는 게 5장 미만이면(정보가 적은 노트) cta 로 채워 최소 장수를 맞춘다
 * (cta·cover 는 항상 available). 그래도 부족하면 있는 만큼만.
 */
export function autoBuildConfig(source: NoteCardSource): CardConfig {
  const avail = new Set(availableFrames(source).map((f) => f.id));
  const picked: string[] = ["cover"];
  for (const id of AUTO_ORDER) {
    if (picked.length >= MAX_FRAMES) break;
    if (id === "cover") continue;
    if (avail.has(id)) picked.push(id);
  }
  // 최소 장수 보정 — cta 는 항상 넣을 수 있다
  if (picked.length < MIN_FRAMES && !picked.includes("cta")) picked.push("cta");
  return { themeId: DEFAULT_THEME_ID, frameIds: picked.slice(0, MAX_FRAMES) };
}

/**
 * 저장 전 구성 검증·정규화.
 * - 알 수 없는 프레임 id 제거, 중복 제거
 * - 표지를 항상 첫 장으로
 * - available 하지 않은 프레임 제거
 * - 최소 장수 미만이면 자동 구성으로 보강
 * 반환: 저장 가능한 정규화 구성.
 */
export function normalizeConfig(input: Partial<CardConfig> | null, source: NoteCardSource): CardConfig {
  const themeId = input?.themeId && isValidThemeId(input.themeId) ? input.themeId : DEFAULT_THEME_ID;
  const avail = new Set(availableFrames(source).map((f) => f.id));
  const seen = new Set<string>();
  const frames: string[] = [];
  for (const id of input?.frameIds ?? []) {
    if (seen.has(id)) continue;
    if (!getFrame(id)) continue;
    if (!avail.has(id)) continue;
    seen.add(id);
    frames.push(id);
  }
  // 표지 강제(첫 장)
  const withoutCover = frames.filter((f) => f !== "cover");
  const ordered = ["cover", ...withoutCover].slice(0, MAX_FRAMES);
  // 최소 장수 보정 — 자동 구성에서 빠진 장을 우선순위로 채운다
  if (ordered.length < MIN_FRAMES) {
    const auto = autoBuildConfig(source).frameIds;
    for (const id of auto) {
      if (ordered.length >= MIN_FRAMES) break;
      if (!ordered.includes(id)) ordered.push(id);
    }
  }
  return { themeId, frameIds: ordered };
}

/** 구성이 저장 가능한 상태인가(최소 장수 충족 + 유효 프레임). */
export function isConfigComplete(config: CardConfig, source: NoteCardSource): boolean {
  const avail = new Set(availableFrames(source).map((f) => f.id));
  const valid = config.frameIds.filter((id) => getFrame(id) && avail.has(id));
  return valid.length >= MIN_FRAMES && valid[0] === "cover" && isValidThemeId(config.themeId);
}

/** 구성 → 렌더할 프레임 객체 배열(순서 유지). */
export function resolveFrames(config: CardConfig): CardFrame[] {
  return config.frameIds
    .map((id) => getFrame(id))
    .filter((f): f is CardFrame => Boolean(f));
}
