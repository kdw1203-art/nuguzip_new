import type { AdPlacement } from "@/lib/ads/adsense-policy";
import { AdSlot } from "./AdSlot";
import { AdZoneUnit } from "./AdZoneUnit";

/**
 * [961] 광고 공간(서버 컴포넌트) — 소유자 요청 "웹사이트에 광고를 넣을 수 있는 공간".
 *
 * 한 자리에 두 층을 겹쳐 둔다:
 *  1) 애드센스 유닛(AdZoneUnit) — 승인·채움이 되면 그 광고가 나온다.
 *  2) 대체 카드(AdSlot) — 어드민 배너(banners 테이블) → 하우스 광고. 유닛이 비어 있는
 *     동안(심사 중·미채움·차단기)에도 자리는 빈 상자가 아니라 안내 카드다.
 * 둘 중 무엇이 보일지는 CSS 가 <ins data-ad-status> 를 읽어 정한다(globals.css .ad-zone).
 *
 * 제외 경로(/payment·/my·/subscription·/map …)와 광고 없는 플랜에는 둘 다 안 나간다 —
 * AdZoneUnit 은 클라이언트에서, AdSlot 은 서버(plan)와 AdFreeGate 에서 판정한다.
 *
 * 배치 원칙(애드센스 정책 + 소유자 방침 "서비스 이용에 불편 없는 빈 공간에만"):
 *  · 도구 화면의 입력·결과 사이에는 두지 않는다. 글 끝·목록 사이·페이지 끝처럼 자연스러운 쉼에.
 *  · 한 화면에 최대 2곳. 고정(sticky)·팝업·내비게이션 옆은 금지.
 *  · 항상 "광고" 라벨 — 콘텐츠로 위장하지 않는다.
 */
export function AdZone({
  placement,
  seed = 0,
  plan = null,
  adFree = false,
  signedIn = false,
  className = "",
}: {
  placement: AdPlacement;
  seed?: number;
  plan?: string | null;
  adFree?: boolean;
  signedIn?: boolean;
  className?: string;
}) {
  if (adFree) return null;
  return (
    <aside className={`ad-zone ${className}`} aria-label="광고 공간" data-placement={placement}>
      <AdZoneUnit placement={placement} />
      <div className="ad-zone-fallback">
        <AdSlot placement={placement} seed={seed} plan={plan} adFree={adFree} signedIn={signedIn} />
      </div>
    </aside>
  );
}

export default AdZone;
