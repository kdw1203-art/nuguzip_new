import { controlVariant, getExperiment, type ExperimentDef } from "./registry";

/**
 * A7 — 결정론적 변형 배정.
 *
 * 서버(Node)와 브라우저 양쪽에서 **같은 답**이 나와야 한다. 그래서 node:crypto 도
 * Web Crypto 도 쓰지 않고 순수 산술 해시(FNV-1a 32bit)만 쓴다. 두 환경에서 다른
 * 답이 나오면 SSR 로 그린 문구와 하이드레이션 후 문구가 달라져 화면이 깜빡이고,
 * 노출 이벤트와 실제로 본 문구가 어긋나 결과가 통째로 못 쓰게 된다.
 *
 * 해시 입력에 실험 키를 섞는 이유: 같은 사람이 모든 실험에서 늘 같은 쪽(A, A, A…)
 * 에 몰리면 실험끼리 상관이 생겨 각각의 효과를 분리할 수 없다.
 */

/** FNV-1a 32비트. 암호용이 아니라 균등 분산용이다. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // 32비트 FNV prime(16777619) 곱셈을 오버플로 없이. Math.imul 은 두 환경 모두 동일.
    h = Math.imul(h, 0x01000193);
  }
  // 부호 없는 32비트로
  return h >>> 0;
}

/** [0, 1) 균등값 */
export function bucketFraction(experimentKey: string, subjectKey: string): number {
  return hash32(`${experimentKey}:${subjectKey}`) / 0x1_0000_0000;
}

/**
 * 가중치대로 변형 하나를 고른다.
 *
 * 가중치가 전부 0 이하이거나 변형이 없으면 대조군. "설정이 이상하면 실험하지
 * 않는다"가 "이상한 채로 실험한다"보다 낫다.
 */
export function pickVariant(def: ExperimentDef, subjectKey: string): string {
  const usable = def.variants.filter((v) => v.weight > 0);
  if (usable.length === 0) return def.variants[0].key;
  const total = usable.reduce((s, v) => s + v.weight, 0);
  let cursor = bucketFraction(def.key, subjectKey) * total;
  for (const v of usable) {
    cursor -= v.weight;
    if (cursor < 0) return v.key;
  }
  // 부동소수 오차로 끝까지 흘렀을 때 — 마지막 변형
  return usable[usable.length - 1].key;
}

/**
 * 실험 키 + subject → 변형 키.
 *
 * 등록되지 않았거나 꺼진 실험, subject 를 모르는 경우는 전부 대조군이다.
 * "모르면 기존 화면"이 원칙 — 실험 코드가 고장 나도 사용자가 보는 건 원래 화면이다.
 */
export function assignVariant(experimentKey: string, subjectKey: string | null): string {
  const def = getExperiment(experimentKey);
  if (!def || !def.enabled) return controlVariant(experimentKey);
  const subject = subjectKey?.trim();
  if (!subject) return controlVariant(experimentKey);
  return pickVariant(def, subject);
}
