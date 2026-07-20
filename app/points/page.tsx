import { redirect } from "next/navigation";

/* /points → 포인트 지갑(/my/points) 정규 경로로 리다이렉트 (item 10). */
export default function PointsIndexPage() {
  redirect("/my/points");
}
