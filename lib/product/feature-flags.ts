/**
 * A/B·실험 플래그 (환경변수 기반). CI/배포에서만 켜는 것을 권장합니다.
 */
export function homeQuickCardOrder(): "default" | "swap-ai-note" {
  return process.env.NEXT_PUBLIC_AB_HOME_CARDS === "1" ? "swap-ai-note" : "default";
}
