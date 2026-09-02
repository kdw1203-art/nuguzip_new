import { redirect } from "next/navigation";

/* 발견 피드는 동네이야기 통합 피드(/town)로 합쳐졌다.
   e2e(smoke) · IA 문서와 동일한 목적지. 공개 노트만 보려면 /notes.

   최적화 10 — 빌드 산출물 discover.html 의 <title> 이 홈과 같지만 **여기엔
   제목을 달지 않는다**. 운영 실측으로 이 경로는 307 로 /town 을 가리키고
   (curl: `307 https://naezipnow.com/town`) 그 HTML 은 사람에게도 크롤러에게도
   전달되지 않는다. 안 보이는 문서에 제목을 다는 건 고친 척일 뿐이다.
   같은 이유로 /points 도 그대로 둔다. */
export default function DiscoverRedirect() {
  redirect("/town");
}
