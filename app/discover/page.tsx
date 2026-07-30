import { redirect } from "next/navigation";

/* 발견 피드는 공개 임장노트(/notes)로 안내한다.
   홈·샘플 CTA에서 기대하는 「AI 정리 미리보기」는 공개 노트 상세의 AI 패널이
   실데이터로 보여 주며, /town(커뮤니티)으로 보내면 루프가 끊긴다. */
export default function DiscoverRedirect() {
  redirect("/notes");
}
