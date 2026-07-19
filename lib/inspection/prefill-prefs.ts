/**
 * 임장노트 공공데이터 자동 채우기 on/off 선호값 — 무거운 `InspectionDataPanel`을
 * 지연 로드하면서도 이 경량 헬퍼는 즉시 참조할 수 있도록 분리한다.
 */
const AUTO_PREFILL_KEY = "inspection-prefill-auto";

export function readPrefillAutoApply(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(AUTO_PREFILL_KEY);
  if (v === "0" || v === "false") return false;
  return true;
}

export function writePrefillAutoApply(value: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_PREFILL_KEY, value ? "1" : "0");
}
