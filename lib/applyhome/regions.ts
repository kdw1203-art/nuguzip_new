/** 청약홈 SUBSCRPT_AREA_CODE_NM (공급지역) */
export const APPLYHOME_REGIONS = [
  "전체",
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export type ApplyhomeRegion = (typeof APPLYHOME_REGIONS)[number];

export function normalizeApplyhomeRegion(value: string | null | undefined): ApplyhomeRegion | "전체" {
  if (!value?.trim()) return "전체";
  const v = value.trim();
  const hit = APPLYHOME_REGIONS.find((r) => r === v || v.includes(r));
  return hit ?? "전체";
}
