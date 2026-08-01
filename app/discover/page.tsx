import { redirect } from "next/navigation";

/* 발견 피드는 동네이야기 통합 피드(/town)로 합쳐졌다.
   e2e(smoke) · IA 문서와 동일한 목적지. 공개 노트만 보려면 /notes. */
export default function DiscoverRedirect() {
  redirect("/town");
}
