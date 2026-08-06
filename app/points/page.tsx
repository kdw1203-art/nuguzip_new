import { redirect } from "next/navigation";

/* /points → 포인트 지갑(/my/points) 정규 경로로 리다이렉트 (item 10).
   최적화 10 — 제목을 달지 않는 이유는 app/discover/page.tsx 주석 참고
   (운영 실측 307 → /my/points, HTML 이 전달되지 않는다). */
export default function PointsIndexPage() {
  redirect("/my/points");
}
