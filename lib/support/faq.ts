/**
 * N15 — 서비스 FAQ 단일 출처.
 *
 * 왜 데이터로 뺐나: FAQPage JSON-LD 와 화면이 **같은 배열**에서 나와야 한다.
 * 둘을 따로 적으면 구조화 데이터에만 있고 화면엔 없는 답이 생기는데, 그건
 * 구글 가이드라인 위반(숨겨진 FAQ)이자 우리 원칙 위반이다.
 *
 * 답을 쓸 때 지킨 것:
 * 1) **없는 기능을 있다고 쓰지 않는다.** 이 파일을 쓰면서 /support 의 기존 FAQ 에
 *    "AI가 텍스트·사진에서 동·호수·차량번호·얼굴을 자동 감지해 가립니다"라고
 *    적혀 있는 걸 발견했는데, 그런 코드는 존재하지 않는다(노트 모델에 동·호수
 *    필드 자체가 없고, 이미지 마스킹 파이프라인도 없다). 실제로 하는 건 업로드
 *    시 EXIF(GPS·기기정보) 제거뿐이다. 개인정보 처리 방식을 실제보다 크게
 *    약속하는 건 가장 위험한 종류의 거짓이라, 그 답은 사실대로 고쳐 적었다.
 * 2) **가격·한도는 단일 출처에서 읽는다.** 여기 숫자를 적으면 요금이 바뀔 때
 *    반드시 어긋난다(실제로 그렇게 6,900원 표시 / 2,900원 청구가 났었다).
 * 3) 제도·약관 내용은 우리 약관 조항을 그대로 요약하고 원문으로 링크한다.
 */
import { BILLING_PERIOD_PRICES } from "@/lib/subscriptions/billing-periods";
import { getBusinessInfo } from "@/lib/brand/business-info";

export type SupportFaqCategory =
  | "데이터·시세"
  | "임장노트·공개"
  | "구독·결제"
  | "AI 분석"
  | "계정·문의";

export const SUPPORT_FAQ_CATEGORY_ORDER: SupportFaqCategory[] = [
  "데이터·시세",
  "임장노트·공개",
  "구독·결제",
  "AI 분석",
  "계정·문의",
];

export type SupportFaqItem = {
  id: string;
  category: SupportFaqCategory;
  q: string;
  /** 한 문단 완결 답 — 발췌돼도 뜻이 통해야 한다 */
  a: string;
  /** 근거·원문 링크 (선택) */
  href?: string;
  hrefLabel?: string;
};

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 가격 문장은 판매가 단일 출처(billing-periods.ts)에서 조립한다. */
function priceSentence(): string {
  const pro = BILLING_PERIOD_PRICES.pro;
  const expert = BILLING_PERIOD_PRICES.expert;
  const proM = pro.find((p) => p.months === 1);
  const proY = pro.find((p) => p.months === 12);
  const exM = expert.find((p) => p.months === 1);
  const exY = expert.find((p) => p.months === 12);
  const part = (
    name: string,
    m: typeof proM,
    y: typeof proY,
  ): string | null => {
    if (!m) return null;
    if (!y) return `${name} 월 ${won(m.totalKrw)}`;
    return `${name} 월 ${won(m.totalKrw)}(연 결제 ${won(y.totalKrw)}, 월 ${won(
      y.monthlyEquivalentKrw,
    )}꼴)`;
  };
  const parts = [part("PRO 는", proM, proY), part("EXPERT 는", exM, exY)].filter(
    (x): x is string => x !== null,
  );
  return parts.join(", ");
}

export function supportFaqItems(): SupportFaqItem[] {
  const email = getBusinessInfo().supportEmail;

  return [
    /* ── 데이터·시세 ─────────────────────────────────── */
    {
      id: "data-source",
      category: "데이터·시세",
      q: "누구집의 시세는 어디서 온 데이터인가요?",
      a: "누구집의 시세는 전부 국토교통부 실거래가 공개시스템의 신고 자료를 공공 API(data.go.kr)로 받아 집계한 값입니다. 민간 부동산 포털이나 중개 플랫폼 화면을 긁어오지 않으며, 단지 기본정보·가격지수·청약·공매도 각각 공공 API에서 받습니다.",
      href: "/methodology",
      hrefLabel: "데이터 방법론 보기",
    },
    {
      id: "recent-month-low",
      category: "데이터·시세",
      q: "최근 달 거래량이 유독 적게 나오는데 시장이 얼어붙은 건가요?",
      a: "아닐 가능성이 큽니다. 실거래 신고 기한이 계약일로부터 30일이라, 최근 1~2개월 수치는 아직 신고가 다 들어오지 않은 잠정치이고 앞으로 더 늘어납니다. 누구집은 해당 기간의 리포트에 잠정 표시를 붙이고, 그 수치를 인용할 때 잠정임을 함께 밝혀 달라고 안내합니다.",
      href: "/reports",
      hrefLabel: "월간 실거래 리포트",
    },
    {
      id: "avg-not-market-price",
      category: "데이터·시세",
      q: "화면에 나오는 평균가가 그 지역·단지의 시세인가요?",
      a: "평균가는 시세가 아닙니다. 그 기간에 신고된 거래 금액의 단순 평균이며, 면적·타입·층을 가중하지 않습니다. 같은 지역이라도 그 달에 대형 평형 거래가 몰리면 평균이 올라가므로, 평균가 변동을 곧바로 '가격이 올랐다'로 읽지 마시고 거래 건수와 함께 보세요.",
      href: "/glossary/pyeongdanga",
      hrefLabel: "평당가·평균가 용어 보기",
    },
    {
      id: "empty-region",
      category: "데이터·시세",
      q: "우리 지역은 데이터가 비어 있는데 거래가 없다는 뜻인가요?",
      a: "거래가 없다는 뜻이 아니라 아직 수집되지 않았다는 뜻입니다. 전국 실거래 수집을 시군구 단위로 순회하며 채우는 중이라 모든 지역의 전체 기간이 채워져 있지 않고, 누구집은 이 경우 추정치로 칸을 메우지 않고 비워 둡니다.",
    },
    {
      id: "cancelled-deal",
      category: "데이터·시세",
      q: "계약이 취소된 거래도 평균에 들어가나요?",
      a: "들어가지 않습니다. 해제(취소) 신고된 거래는 시세 집계에서 제외합니다. 해제 건이 특히 고가에 몰리면 단지 평균가가 크게 왜곡되기 때문입니다.",
      href: "/glossary/haejegeorae",
      hrefLabel: "해제거래 용어 보기",
    },
    {
      id: "data-correction",
      category: "데이터·시세",
      q: "수치가 틀린 것 같습니다. 어떻게 알리나요?",
      a: `${email} 으로 어느 화면의 어떤 수치인지 알려 주시면 원천 데이터와 대조해 확인합니다. 실제로 정정한 건은 방법론 페이지의 정정 이력에 무엇을 언제 어떻게 고쳤는지 남깁니다.`,
      href: "/methodology#corrections",
      hrefLabel: "정정 이력 보기",
    },

    /* ── 임장노트·공개 ───────────────────────────────── */
    {
      id: "note-visibility",
      category: "임장노트·공개",
      q: "임장노트를 공개하면 누가 볼 수 있나요?",
      a: "노트는 기본이 비공개이고, 공개로 설정한 노트만 로그인하지 않은 사람을 포함해 누구나 볼 수 있습니다. 공개 노트는 검색엔진 색인 대상이 되고 사이트맵·RSS 피드에도 실리므로, 공개 전에 본문과 사진을 한 번 더 확인해 주세요. 공개 설정은 노트 작성·수정 화면에서 언제든 되돌릴 수 있습니다.",
      href: "/notes",
      hrefLabel: "내 노트 관리",
    },
    {
      id: "photo-exif",
      category: "임장노트·공개",
      q: "사진에 찍힌 위치정보(GPS)는 어떻게 처리되나요?",
      a: "이미지(JPEG·PNG·WebP)는 저장하기 전에 재인코딩해 EXIF 메타데이터를 제거합니다. 촬영 GPS 좌표와 기기 정보가 여기 포함됩니다. 메타데이터 제거에 실패하면 원본을 그대로 저장하지 않고 업로드 자체를 거부합니다.",
    },
    {
      id: "note-masking",
      category: "임장노트·공개",
      q: "공개 노트에서 동·호수나 얼굴 같은 개인정보가 자동으로 가려지나요?",
      a: "아니요. 본문 글자나 사진 속 인물·차량번호를 자동으로 감지해 가리는 기능은 아직 없습니다. 누구집이 자동으로 처리하는 것은 사진의 EXIF 위치정보 제거뿐이므로, 공개 노트에는 동·호수처럼 특정 세대를 지목하는 정보와 타인의 얼굴·차량번호가 드러나지 않도록 직접 확인한 뒤 올려 주세요. 문제가 되는 게시물은 신고 기능으로 접수되면 검토 후 조치합니다.",
      href: "/legal/privacy",
      hrefLabel: "개인정보처리방침",
    },
    {
      id: "note-copyright",
      category: "임장노트·공개",
      q: "내가 쓴 노트의 저작권은 누구에게 있나요?",
      a: "회원이 작성한 게시물의 저작권은 작성자에게 있습니다. 다만 서비스 운영·홍보 목적으로 활용될 수 있으며, 이 경우 출처를 표기하고 원저작자의 권리를 존중합니다.",
      href: "/legal/terms",
      hrefLabel: "이용약관 제9조",
    },

    /* ── 구독·결제 ───────────────────────────────────── */
    {
      id: "price",
      category: "구독·결제",
      q: "유료 플랜은 얼마인가요?",
      a: `무료(FREE) 플랜으로도 탐색·기록은 계속 쓸 수 있고, 유료 플랜은 ${priceSentence()} 입니다. 연 결제는 월 결제보다 약 20% 저렴합니다.`,
      href: "/subscription",
      hrefLabel: "요금제 비교",
    },
    {
      id: "free-limit",
      category: "구독·결제",
      q: "무료로는 어디까지 쓸 수 있나요?",
      a: "커뮤니티 열람·작성, 지역 탐색 지도, 동네 맥락은 무료 플랜에서 제한 없이 쓸 수 있습니다. 북마크·관심단지, AI 임장노트 자동정리, 동네 분석 요약, 비교 트레이처럼 비용이 드는 기능은 월 사용 횟수나 개수에 제한이 있고, 정확한 한도는 요금제 페이지의 비교표에서 확인할 수 있습니다.",
      href: "/subscription",
      hrefLabel: "플랜별 한도 보기",
    },
    {
      id: "cancel",
      category: "구독·결제",
      q: "구독을 해지하면 남은 기간은 어떻게 되나요?",
      a: "지금은 화면에서 바로 누르는 해지 버튼이 없습니다. 해지·환불은 고객지원의 1:1 문의에 결제·환불 카테고리로 접수해 주시면 처리해 드립니다. 구독은 다음 결제일 1일 전까지 취소하지 않으면 자동으로 갱신되고, 결제 후 7일 이내에는 전자상거래법에 따른 청약철회가 가능하지만 디지털 콘텐츠를 이미 이용한 경우에는 철회가 제한될 수 있습니다.",
      href: "/legal/terms#refund",
      hrefLabel: "환불 규정 원문(약관 제8조)",
    },
    {
      id: "payment-method",
      category: "구독·결제",
      q: "결제는 어떤 방식으로 이뤄지나요?",
      a: "결제는 토스페이먼츠 등 결제대행사를 통해 처리하며, 누구집 서버는 카드 번호 같은 결제 수단 정보를 직접 보관하지 않습니다. 결제 관련 세부 사항은 각 결제대행사의 약관을 따릅니다.",
      href: "/legal/terms#refund",
      hrefLabel: "유료 서비스 약관",
    },

    /* ── AI 분석 ─────────────────────────────────────── */
    {
      id: "ai-basis",
      category: "AI 분석",
      q: "AI 분석은 무엇을 근거로 답하나요?",
      a: "누구집 AI 에이전트는 기억이나 추정으로 시세를 말하지 않고, 국토교통부 실거래 데이터와 본인이 쓴 임장노트를 그 자리에서 직접 조회해 답합니다. 어떤 데이터를 조회했는지 목록을 답변과 함께 보여 주므로 근거를 되짚어 볼 수 있습니다. 에이전트는 본인 노트를 읽기 때문에 로그인해야 쓸 수 있습니다.",
      href: "/agent",
      hrefLabel: "AI 에이전트 열어보기",
    },
    {
      id: "ai-model-picker",
      category: "AI 분석",
      q: "AI 모델을 고를 수 있나요?",
      a: "네. AI 에이전트 화면에서 쓸 모델을 직접 고를 수 있고, 빠르고 경제적인 모델과 복합 분석·긴 문맥에 유리한 모델을 용도에 따라 바꿔 쓸 수 있습니다. 고르지 않으면 기본 모델이 사용됩니다.",
      href: "/agent",
      hrefLabel: "모델 선택 위치 보기",
    },
    {
      id: "ai-advice",
      category: "AI 분석",
      q: "AI 분석 결과를 투자 판단에 그대로 써도 되나요?",
      a: "누구집은 투자 자문을 제공하지 않습니다. AI 분석과 시장 온도 같은 지표는 공개 데이터를 요약하고 서술한 것이지 매수·매도 권유가 아니며, 실제 판단과 그 결과에 대한 책임은 이용자에게 있습니다. 대출 한도·세금처럼 제도에 따라 달라지는 항목은 반드시 금융기관·관할 관청에서 확인하세요.",
      href: "/methodology",
      hrefLabel: "지표 산출 방식",
    },

    /* ── 계정·문의 ───────────────────────────────────── */
    {
      id: "contact",
      category: "계정·문의",
      q: "문의는 어디로 하면 되나요?",
      a: `고객지원 페이지의 1:1 문의 폼으로 남기시거나 ${email} 으로 보내 주시면 됩니다. 데이터 오류 정정, 제휴, 개인정보 관련 요청도 같은 경로로 접수됩니다.`,
      href: "/support",
      hrefLabel: "1:1 문의하기",
    },
    {
      id: "withdraw",
      category: "계정·문의",
      q: "회원 탈퇴는 어떻게 하나요?",
      a: "서비스 내 회원탈퇴 기능으로 언제든 이용 계약을 해지할 수 있습니다. 다만 구독 중인 유료 플랜이 있다면 탈퇴 전에 구독을 먼저 해지해야 하며, 잔여 기간 환불은 유료 서비스 약관을 따릅니다.",
      href: "/legal/terms",
      hrefLabel: "이용약관 제10조",
    },
    {
      id: "privacy-request",
      category: "계정·문의",
      q: "내 개인정보 열람·삭제를 요청할 수 있나요?",
      a: "가능합니다. 개인정보 열람·정정·삭제·처리정지 요청은 개인정보 처리 요청 페이지에서 접수하며, 접수 후 법정 기한 내에 처리 결과를 알려 드립니다.",
      href: "/legal/privacy-request",
      hrefLabel: "개인정보 처리 요청",
    },
  ];
}

export function supportFaqByCategory(): Array<{
  category: SupportFaqCategory;
  items: SupportFaqItem[];
}> {
  const all = supportFaqItems();
  return SUPPORT_FAQ_CATEGORY_ORDER.map((category) => ({
    category,
    items: all.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}
