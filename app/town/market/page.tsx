import { redirect } from "next/navigation";

/* 마켓은 자료(#8)로 개편·통합됨 — /town/library로 이동.
   기존 /town/market 링크를 깨지 않도록 얇은 리다이렉트만 유지한다. */
export default function TownMarketRedirect() {
  redirect("/town/library");
}
