import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { listTemplates } from "@/lib/note-templates/store";
import { TemplateBrowser } from "./TemplateBrowser";

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 템플릿 목록은 코드 배포로만 바뀐다. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "임장 노트 템플릿 | 내집나우",
  description:
    "입지·채광·소음·주차·하자부터 분양권·전월세·재건축까지, 바로 쓰는 임장 체크리스트 템플릿을 골라 임장 노트를 작성하세요. 내집나우가 만든 공식 체크리스트 제공.",
  robots: { index: true, follow: true },
};

export default async function NoteTemplatesPage() {
  const items = await listTemplates();

  return (
    <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title="임장 노트 템플릿">
      <p className="rise-in mb-5 t-body text-text-2">
        임장 갈 때 무엇을 봐야 할지 막막하다면, 검증된 체크리스트로 시작하세요.
        아파트 기본 점검부터 분양권·전월세 계약·재건축까지 상황별 템플릿을 골라
        &lsquo;이 템플릿으로 노트 쓰기&rsquo;를 누르면 바로 임장 노트를 작성할 수 있어요.
      </p>
      <TemplateBrowser initial={items} />
    </PageShell>
  );
}
