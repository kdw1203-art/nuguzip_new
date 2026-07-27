import type { Metadata } from "next";
import { seoAlternates } from "@/lib/seo/alternates";

/* 글쓰기 화면은 `"use client"` + useSearchParams 라 page.tsx 에서 metadata 를
   내보낼 수 없다. `?category=`, `?city=` 같은 프리필 파라미터가 붙은 URL 이
   각각 별개 페이지로 색인되지 않도록 canonical 만 이 layout 에서 선언한다.
   (색인 여부 자체는 지금과 동일하게 두고, 중복만 정리한다 — N7) */
export const metadata: Metadata = {
  alternates: seoAlternates("/town/write"),
};

export default function TownWriteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
