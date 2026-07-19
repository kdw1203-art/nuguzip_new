import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { addRecentSearch } from "@/lib/home/recent-searches";
import { parseDistrict } from "@/lib/inspection/public-data-context-shared";
import { findExploreRegionByDistrict } from "@/lib/region/explore-data";

/** 주소·단지 선택 후 explore / AI로 이동 */
export function navigateFromAddress(router: AppRouterInstance, address: string) {
  const q = address.trim();
  if (!q) return;
  addRecentSearch(q);
  const district = parseDistrict(q);
  const match =
    (district ? findExploreRegionByDistrict(district) : undefined) ??
    findExploreRegionByDistrict(q);
  if (match) {
    router.push(`/explore?district=${encodeURIComponent(match.district)}`);
    return;
  }
  if (district) {
    router.push(`/explore?district=${encodeURIComponent(district)}`);
    return;
  }
  router.push(`/ai-analysis?q=${encodeURIComponent(q)}`);
}
