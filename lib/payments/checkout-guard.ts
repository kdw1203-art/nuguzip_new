import { NextResponse } from "next/server";
import { getBusinessInfo, isBusinessDisclosureComplete } from "@/lib/brand/business-info";
import { logger } from "@/lib/log";

/**
 * [965] 유료 주문을 만드는 모든 라우트가 같은 문으로 들어온다.
 *
 * 전자상거래법 고지(상호·대표·사업자번호·주소·통신판매업신고·유선번호)가 비어
 * 있으면 결제창을 열지 않는다. 예전엔 Stripe·부스트·카카오페이 라우트에만 이
 * 검사가 있었고, 매출의 대부분인 토스 단건·빌링 두 레일에는 없었다 — 값이 하나라도
 * 비면 카드·카카오페이는 닫히고 토스만 열리는, 정확히 반대인 상태였다.
 * 지금은 값이 코드 상수라 늘 통과하지만, 통제는 "모든 레일에 같은 문" 이어야 통제다.
 */
export function assertCheckoutAllowed(where: string): NextResponse | null {
  if (isBusinessDisclosureComplete(getBusinessInfo())) return null;
  logger.warn(`[${where}] 사업자 고지 미완 — 결제 차단`);
  return NextResponse.json(
    {
      error:
        "사업자·통신판매업 고지가 완료되기 전에는 결제를 시작할 수 없어요. 고객센터로 문의해 주세요.",
      code: "business_disclosure_incomplete",
    },
    { status: 503 },
  );
}
