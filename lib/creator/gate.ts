import "server-only";
import { isVerifiedExpert } from "@/lib/experts/is-verified";
import { listNotes } from "@/lib/inspection/store-db";

/**
 * 크리에이터 게이트 (item 12 · 대시보드와 동일 기준).
 * 인증 전문가 OR 공개 임장노트 1건 이상 보유 시 크리에이터로 인정.
 * 유료 리포트 판매 등록 권한 판정에 사용한다. (읽기 전용 — 스키마 변경 없음)
 */
export async function isCreator(email: string | null | undefined): Promise<boolean> {
  const e = email?.trim();
  if (!e) return false;
  // 1) 인증 전문가
  if (await isVerifiedExpert(e).catch(() => false)) return true;
  // 2) 공개 노트 1건 이상
  try {
    const notes = await listNotes(e);
    return notes.some((n) => n.isPublic);
  } catch {
    return false;
  }
}
