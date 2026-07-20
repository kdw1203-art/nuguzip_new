import { redirect } from "next/navigation";

/* 발견 피드는 동네이야기 통합 피드(#5)로 흡수됨 — /town으로 영구 이동.
   기존 /discover 진입·북마크를 깨지 않도록 얇은 리다이렉트만 유지한다. */
export default function DiscoverRedirect() {
  redirect("/town");
}
