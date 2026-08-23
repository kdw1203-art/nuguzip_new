#!/usr/bin/env node
/**
 * 심사 고정 게이트 — 토스/카드사 심사 기간 동안 잠긴 사실이 바뀌면 빌드를 멈춘다.
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * 카드사 심사(7~14일) 중에는 사업자정보·전화번호·상품 카테고리·가격·비회원
 * 결제수단·판매상태를 수정하면 반려되어 처음부터 재심사다(토스 안내, 소유자
 * 인지 2026-08-12). 이 저장소는 여러 세션이 병렬로 커밋하므로 "조심하자"는
 * 다짐만으로는 지켜지지 않는다 — 실수로 가격 하나를 고친 커밋이 그대로
 * 배포되면 심사가 통째로 밀린다. 그래서 심사에 제출한 사실을 여기 상수로
 * 박아 두고, 소스가 그 사실과 어긋나면 빌드가 실패하게 한다.
 *
 * ── 심사가 끝나면 ──────────────────────────────────────────────────────
 * 이 게이트는 심사 기간의 임시 자물쇠가 아니라 "고지 사실과 코드의 일치"
 * 검사이기도 하다. 심사 통과 후 가격·상품을 바꾸는 것은 정상 운영이다 —
 * 그때는 아래 LOCKED 값을 새 사실로 갱신하면 된다(지우지 말 것). 값을
 * 갱신하는 커밋 메시지에 무엇이 왜 바뀌는지 적는 것이 규약이다.
 *
 * 사용: node ./scripts/check-toss-review-freeze.mjs · npm run check:review-freeze
 * (npm run build 체인에 포함 — 로컬·CI 모두에서 돈다)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-review-freeze]";
const read = (p) => readFileSync(join(root, p), "utf8");

/** 심사 회신에 적어 낸 사실 (2026-08-12 제출본 기준) */
const LOCKED = [
  // ── 사업자 고지 (푸터) — 등록증·회신과 동일해야 함 ──
  {
    file: "lib/brand/business-info.ts",
    must: [
      '"경기도 안양시 동안구 관평로212번길 21, 302동 1010호 (관양동, 공작부영아파트)"', // 통신판매업신고증 표기와 동일
      '"050-6460-1203"',
      '"378-06-02465"',
      '"우리동네이야기"',
      '"2026-안양동안-1095"', // 통신판매업 신고번호 (정부24 발급 2026-08-13)
    ],
    why: "푸터 사업자정보는 심사에 제출한 사업자등록증 표기와 동일해야 한다",
  },
  // ── 판매가 — 회신 ④ 가격표와 동일해야 함 ──
  {
    file: "lib/subscriptions/billing-periods.ts",
    must: [
      "totalKrw: 2_900",
      "totalKrw: 27_600",
      "totalKrw: 18_900",
      "totalKrw: 181_200",
      "totalKrw: 1_100",
      "days: 7",
    ],
    why: "심사 회신에 적어 낸 가격(주간 1,100 · 플러스 2,900/27,600 · 프로 18,900/181,200)",
  },
  // ── 제공기간 고지 — 회신 3) 과 동일해야 함 ──
  {
    file: "app/components/ComplianceNotice.tsx",
    must: ["주간권 7일 · 월간 1개월 ~ 최대 12개월", "자동 반복청구가 없습니다"],
    why: "결제 화면의 제공기간 고지는 회신 문구와 일치해야 한다",
  },
  // ── 환불 앵커 — 회신 ② URL 이 살아 있어야 함 ──
  {
    file: "app/legal/terms/page.tsx",
    must: ['id="refund"'],
    why: "환불 정책 URL(/legal/terms#refund)의 앵커",
  },
  // ── 수익문구 영구 미기재 — 회신에 약속한 문구 ──
  {
    file: "app/components/ComplianceNotice.tsx",
    must: ["영구적으로 기재하지 않습니다"],
    why: "수익 보장 문구 영구 미기재 고지",
  },
  // ── 포인트 무상성 (2026-08-22 유의업종 소명) — 고지·약관·상점이 같은 사실을 말해야 함 ──
  {
    file: "lib/points/catalog.ts",
    must: [
      "현금으로 구매(충전)할 수 없고",
      "현금으로 환불·전환되지 않으며",
      // 2026-08-23 토스 유의업종 회신: 충전 기능 부존재 + 미도입 계획을 고지에 명문화
      "앞으로도 도입할 계획이 없습니다",
    ],
    why: "토스에 '유상 충전 없음'을 소명한 무상성 고지의 단일 출처(POINTS_GRATUITOUS_NOTICE)",
  },
  {
    file: "app/legal/terms/page.tsx",
    must: [
      'id="points"',
      "유상으로 판매(충전)하지 않습니다",
      // 2026-08-23 토스 회신: 미도입 계획 + 결제상품 비교환을 약관에 명문화
      "향후에도 이를 도입하지 않습니다",
      "유료 결제 상품과 교환되지 않습니다",
    ],
    why: "약관 제8조의2(포인트) — 소명 회신에 URL(/legal/terms#points)로 적어 냈다",
  },
  {
    file: "app/points/shop/page.tsx",
    must: ["POINTS_GRATUITOUS_NOTICE"],
    why: "포인트 상점 상시 고지 — 소명 캡처 1에 해당하는 화면",
  },
  {
    file: "app/my/points/page.tsx",
    must: ["POINTS_GRATUITOUS_NOTICE"],
    why: "포인트 지갑 상시 고지 — 소명 회신에 '전 포인트 화면 고지'로 적어 냈다",
  },
];

/** 심사에서 금지된 것이 소스에 다시 들어오면 실패 */
const FORBIDDEN = [
  {
    file: "app/town/experts/ExpertApplyCta.tsx",
    mustNot: ["법무사", "변호사"],
    why: "법률 서비스는 토스 입점 불가 — 전문가 유형에 되살아나면 심사 반려",
  },
  {
    file: "lib/subcategories.ts",
    mustNot: ['"법무/계약 검토"'],
    why: "법률 상담 카테고리 제거가 심사 회신에 적혀 있다",
  },
  /* ── 충전형 상품 금지 (2026-08-22) ─────────────────────────────────
     토스 유의업종 소명의 핵심: 돈→포인트 경로가 없다. 포인트는 활동 적립
     무상 리워드이고 사이트 내부 혜택(닉네임 효과·추천글·리포트 열람 등)에만
     쓴다. 유상 충전을 도입하는 날에는 보증보험·1회 10만원 한도·1년 환불 규정·
     충전 결제경로 심사 등 유의업종 요건을 **선이행**한 뒤, 이 게이트와 약관
     제8조의2·무상성 고지를 함께 갱신해야 한다(먼저 코드부터 넣으면 안 된다). */
  {
    file: "lib/points/catalog.ts",
    mustNot: [
      "포인트 충전하기", "포인트를 충전", "충전 상품", "topup", "point_charge", "charge_points",
      /* 2026-08-23 토스 회신: 포인트↔유료 구독 교환 상품 제거 — 코스트가 KRW 가격과
         1:1이라 "포인트=화폐 대체"로 읽혀 충전업종 오해의 핵심 근거였다. 되살리려면
         유의업종 요건(보증보험 등) 선이행 + 이 게이트 갱신이 먼저다. */
      '"plan_pro_1m"', '"plan_expert_1m"',
    ],
    why: "유상 충전(돈→포인트) 상품 부존재를 토스에 소명했다 — 카탈로그에 되살아나면 유의업종 요건 위반",
  },
  {
    file: "lib/creator/sales.ts",
    mustNot: ["pointToKrw", "minPayoutKrw", "payoutReady"],
    why: "2026-08-23 토스 회신 — 포인트의 원화 환산·현금 출금 개념 부존재(환금성 없음 소명). 되살아나면 무상성 고지와 모순",
  },
  {
    file: "app/points/shop/page.tsx",
    mustNot: ["포인트 충전하기", "포인트를 충전", "충전 상품"],
    why: "상점 표면의 충전 유도 문구 — 소명과 배치",
  },
  {
    file: "app/my/points/page.tsx",
    mustNot: ["포인트 충전하기", "포인트를 충전", "충전 상품"],
    why: "지갑 표면의 충전 유도 문구 — 소명과 배치",
  },
];

let failed = 0;
for (const rule of LOCKED) {
  const body = read(rule.file);
  for (const needle of rule.must) {
    if (!body.includes(needle)) {
      failed += 1;
      console.error(
        `${TAG} FAIL — ${rule.file} 에서 심사 제출 사실이 사라졌습니다: ${needle}\n` +
          `      근거: ${rule.why}\n` +
          `      심사 중이면 되돌리세요(수정 시 반려·재심사). 심사가 끝나 정말 바꾸는 것이면\n` +
          `      scripts/check-toss-review-freeze.mjs 의 LOCKED 값을 새 사실로 함께 갱신하세요.`,
      );
    }
  }
}
/* 금지어는 주석을 벗겨 낸 코드에서만 찾는다 — 제거 이력을 설명하는 주석
   ("법무사·변호사는 뺐다 …")까지 잡으면 첫 실행부터 거짓 경보 3건이었다(실측).
   주석 속 언급은 사용자에게 안 보이므로 심사와 무관하다. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

for (const rule of FORBIDDEN) {
  const body = stripComments(read(rule.file));
  for (const needle of rule.mustNot) {
    if (body.includes(needle)) {
      failed += 1;
      console.error(
        `${TAG} FAIL — ${rule.file} 에 심사에서 제거를 약속한 항목이 되살아났습니다: ${needle}\n` +
          `      근거: ${rule.why}`,
      );
    }
  }
}

if (failed > 0) {
  console.error(`${TAG} ${failed}건 어긋남 — 빌드를 멈춥니다.`);
  process.exit(1);
}
console.info(
  `${TAG} PASS — 심사 제출 사실 ${LOCKED.reduce((n, r) => n + r.must.length, 0)}건 일치 · ` +
    `금지 항목 ${FORBIDDEN.reduce((n, r) => n + r.mustNot.length, 0)}건 부재 (2026-08-12 제출본 기준)`,
);
