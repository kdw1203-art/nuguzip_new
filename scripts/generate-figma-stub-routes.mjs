/**
 * Figma Make 번들에서 추출한 경로 중, 리다이렉트되지 않는 항목에 대해
 * app/<path>/page.tsx 스텁을 생성합니다. 기존 파일은 덮어쓰지 않습니다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..", "app");

const REDIRECTS = new Set([
  "login",
  "register",
  "mypage",
  "my-page",
  "my",
  "map-home",
  "map",
  "terms",
  "privacy",
  "create-post",
  "community/create",
  "create-meeting",
  "report",
  "subscription",
  "ai-analysis",
]);

const SKIP_PREFIX = ["api/", "socket", "vector", "iceberg", "builder", "PASSWORD"];

const ROUTES = [
  ["about", "소개", "/about/business"],
  ["apartment-comparison", "아파트 비교", "/explore"],
  ["attendance", "출석·참석", "/groups"],
  ["calculators", "계산기 모음", "/calculator/investment"],
  ["calculator/investment", "투자 수익 계산기", "/calculators"],
  ["calculator/loan", "대출 계산기", "/calculators"],
  ["calculator/subscription-points", "구독 포인트 계산", "/pricing"],
  ["calculator/tax", "세금 계산기", "/calculators"],
  ["chat", "채팅", "/community"],
  ["content-market", "콘텐츠 마켓", "/market"],
  ["create-expert", "전문가 등록", "/experts"],
  ["create-meeting-market", "모임 마켓 만들기", "/market/create"],
  ["create-report", "리포트 작성", "/reports"],
  ["development-info", "정비사업 정보", "/info/redevelopment"],
  ["events", "이벤트", "/groups"],
  ["expert", "전문가 홈", "/experts"],
  ["expert-matching", "전문가 매칭", "/experts"],
  ["expert-verification", "전문가 인증", "/experts"],
  ["faq", "자주 묻는 질문", "/support"],
  ["inspection", "임장 허브", "/inspection-hub"],
  ["inspection-hub", "스마트 임장 허브", "/inspection"],
  ["inspection/create-meeting", "임장 모임 만들기", "/groups/create"],
  ["inspection/create-report", "임장 리포트 작성", "/reports"],
  ["inspection/create-schedule", "일정 만들기", "/groups/create"],
  ["inspection/my-reports", "내 임장 리포트", "/inspection/reports"],
  ["inspection/my-schedule", "내 임장 일정", "/groups"],
  ["inspection/reports", "임장 리포트 목록", "/reports"],
  ["investment-tools", "투자 도구", "/calculator/investment"],
  ["map/analysis", "지도 분석", "/info/map"],
  ["map/price", "시세 지도", "/info/map"],
  ["meeting-market", "모임 마켓", "/market"],
  ["meeting-market/create", "모임 마켓 등록", "/market/create"],
  ["my-inspection-reports", "내 점검 리포트", "/reports"],
  ["my-inspections", "내 점검", "/inspection"],
  ["news", "뉴스", "/community"],
  ["notice", "공지사항", "/community"],
  ["notification-settings", "알림 설정", "/me"],
  ["notifications", "알림", "/me"],
  ["partnership-proposal", "제휴 제안", "/about/business"],
  ["payment", "결제", "/pricing"],
  ["point-shop", "포인트 샵", "/pricing"],
  ["presale", "분양", "/info/redevelopment"],
  ["price-prediction", "가격 예측", "/reports"],
  ["properties", "매물", "/market"],
  ["property-search", "매물 검색", "/market"],
  ["real-price", "실거래가", "/info/map"],
  ["region-comparison", "지역 비교", "/info/map"],
  ["school-district", "학군", "/info/map"],
  ["search", "통합 검색", "/community"],
  ["settings", "설정", "/me"],
  ["smart-inspection", "스마트 임장", "/inspection-hub"],
  ["subscriptions", "구독 관리", "/pricing"],
  ["supabase-guide", "Supabase 가이드", "/about/business"],
  ["support", "고객지원", "/legal/terms"],
  ["transport-access", "교통·접근성", "/info/map"],
  ["admin", "관리자", "/admin"],
  ["post/123", "게시글 예시", "/community"],
  ["post/456", "게시글 예시", "/community"],
  ["community/1", "커뮤니티 글", "/community"],
  ["community/2", "커뮤니티 글", "/community"],
  ["experts/1", "전문가 프로필", "/experts"],
  ["groups/789", "모임 상세", "/groups"],
  ["market/product/101", "마켓 상품", "/market"],
];

const stubTemplate = (title, relatedHref, relatedLabel) =>
  `import { FigmaStub } from "@/components/figma-stub";

export default function Page() {
  return (
    <FigmaStub
      title={${JSON.stringify(title)}}
      relatedHref={${JSON.stringify(relatedHref)}}
      relatedLabel={${JSON.stringify(relatedLabel)}}
    />
  );
}
`;

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

let created = 0;
let skipped = 0;

for (const [routePath, titleKo, related] of ROUTES) {
  const lower = routePath.toLowerCase();
  if (REDIRECTS.has(lower) || REDIRECTS.has(routePath)) {
    skipped++;
    continue;
  }
  if (SKIP_PREFIX.some((pre) => lower.startsWith(pre))) {
    skipped++;
    continue;
  }

  const dir = path.join(appDir, ...routePath.split("/"));
  const pageFile = path.join(dir, "page.tsx");
  if (exists(pageFile)) {
    skipped++;
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  const relatedLabel =
    related === "/community"
      ? "커뮤니티"
      : related === "/explore"
        ? "지도·피드"
        : related === "/calculators"
          ? "계산기 모음"
          : "관련 기능";
  fs.writeFileSync(
    pageFile,
    stubTemplate(titleKo, related, relatedLabel),
    "utf8",
  );
  created++;
}

console.log("created", created, "skipped", skipped);
