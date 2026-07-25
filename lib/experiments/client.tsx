"use client";

import { useEffect, useState } from "react";
import { assignVariant } from "./assign";
import { controlVariant, getExperiment } from "./registry";

/**
 * A7 — 브라우저 쪽 실험 훅.
 *
 * ── 왜 쿠키가 아니라 localStorage 인가 ─────────────────────────────
 * 미들웨어는 Set-Cookie 가 실린 응답의 공개 캐시를 포기한다
 * (lib/http/cache-policy.ts). 실험용 쿠키를 하나라도 심으면 공개 문서 전체가
 * no-store 로 돌아가 CDN 공유 캐시가 통째로 무력화된다. 실험 하나 때문에
 * 사이트 전체 캐시를 버릴 이유가 없으므로 브라우저 저장소에만 둔다.
 *
 * ── 하이드레이션 ─────────────────────────────────────────────────
 * 서버는 익명 ID 를 모른다. 그래서 첫 렌더는 **항상 대조군**이고, 마운트 후에
 * 실제 변형으로 바뀐다(`ready`). 문구가 화면에 이미 보이는 자리에서 쓰면
 * 깜빡임이 생기므로, 클릭 후 열리는 UI(모달·배너)에 쓰는 것을 전제로 한다.
 *
 * ── 익명 ID 의 성격 ──────────────────────────────────────────────
 * 무작위 값이고 개인정보를 담지 않는다. 브라우저 단위라서 같은 사람이 다른
 * 기기에서 다른 변형을 볼 수 있다. 전환은 노출과 같은 브라우저 안에서 일어나므로
 * 두 변형 비교 자체는 편향되지 않는다. 로그인 사용자는 이메일이 subject 라
 * 기기가 달라도 같은 변형을 본다(서버가 이메일을 우선한다).
 */

const ANON_KEY = "nz_exp_anon";

/** [a-z0-9-] 8~64자 — 서버 검증 정규식과 같은 형식을 만든다 */
function newAnonId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // 아래 폴백
  }
  let out = "";
  for (let i = 0; i < 4; i += 1) out += Math.floor(Math.random() * 0xffffffff).toString(36);
  return out.replace(/[^a-z0-9]/g, "").slice(0, 32).padEnd(16, "0");
}

/**
 * 이 브라우저의 익명 실험 ID. 저장소를 못 쓰면(시크릿 모드·차단) null 을 준다 —
 * 그 경우 변형은 대조군이고, 실험 대상에서 빠질 뿐 화면은 정상 동작한다.
 */
export function getAnonExperimentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const found = window.localStorage.getItem(ANON_KEY);
    if (found && /^[a-z0-9-]{8,64}$/.test(found)) return found;
    const created = newAnonId();
    window.localStorage.setItem(ANON_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export type ExperimentState = {
  /** 배정된 변형 키. 준비 전에는 대조군 */
  variant: string;
  /** 마운트 후 실제 배정이 끝났는지 */
  ready: boolean;
  /** 이벤트에 실어 보낼 익명 ID (없을 수 있다) */
  anonId: string | null;
  /** 이 실험이 등록부에 있고 켜져 있는지 */
  active: boolean;
};

export function useExperiment(experimentKey: string): ExperimentState {
  const def = getExperiment(experimentKey);
  const [state, setState] = useState<ExperimentState>({
    variant: controlVariant(experimentKey),
    ready: false,
    anonId: null,
    active: Boolean(def?.enabled),
  });

  useEffect(() => {
    if (!def?.enabled) {
      setState({
        variant: controlVariant(experimentKey),
        ready: true,
        anonId: null,
        active: false,
      });
      return;
    }
    const anonId = getAnonExperimentId();
    setState({
      variant: assignVariant(experimentKey, anonId),
      ready: true,
      anonId,
      active: true,
    });
  }, [experimentKey, def?.enabled]);

  return state;
}
