import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/**
 * 사용자가 "인증된 전문가/중개사"인지 판정.
 * expert_profiles.owner_email = 이메일 AND is_verified = true 인 행이 있으면 인증.
 * 매물 등록 권한(중개사)·크리에이터 노출 게이트에 공용으로 쓴다.
 */
export type ExpertStatus = {
  isVerified: boolean;
  isBroker: boolean;
  category: string | null;
  brokerNo: string | null;
};

export async function getExpertStatus(email: string | null | undefined): Promise<ExpertStatus> {
  const none: ExpertStatus = { isVerified: false, isBroker: false, category: null, brokerNo: null };
  const e = email?.trim().toLowerCase();
  if (!e) return none;
  const sb = getReadOnlySupabase();
  if (!sb) return none;
  try {
    const { data, error } = await sb
      .from("expert_profiles")
      .select("is_verified, category, broker_registration_no")
      .ilike("owner_email", e)
      .order("is_verified", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return none;
    const verified = data.is_verified === true;
    const category = data.category ? String(data.category) : null;
    const brokerNo = data.broker_registration_no ? String(data.broker_registration_no) : null;
    return {
      isVerified: verified,
      // 중개사 판정: 카테고리에 '중개' 포함 또는 중개등록번호 보유 + 인증
      isBroker: verified && (Boolean(brokerNo) || (category?.includes("중개") ?? false)),
      category,
      brokerNo,
    };
  } catch (err) {
    logger.error("[getExpertStatus]", err);
    return none;
  }
}

export async function isVerifiedExpert(email: string | null | undefined): Promise<boolean> {
  return (await getExpertStatus(email)).isVerified;
}
