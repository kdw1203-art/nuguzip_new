import { strict as assert } from "node:assert";
import test from "node:test";

import {
  REVIEW_COMMENT_MAX,
  normalizeReviewComment,
  responseStats,
  responseTimeLabel,
  reviewerLabelOf,
  summarizeRatings,
} from "../../lib/experts/review-rules";
import { sanitizeExpertProfilePatch, sanitizeKakaoLink, sanitizePhone } from "../../lib/experts/profile-input";
import { sanitizeExpertForPublic } from "../../lib/experts/public-dto";
import type { UserExpertProfile } from "../../lib/experts/store-db";

/* [953] 후기·지표·프로필 입력의 순수 규칙 */

test("후기 본문 — 공백 정리·길이 상한·연락처/계좌/외부 결제 차단", () => {
  assert.deepEqual(normalizeReviewComment("  답변이   빨랐어요 "), { value: "답변이 빨랐어요" });
  assert.deepEqual(normalizeReviewComment(""), { value: null });
  assert.ok(normalizeReviewComment("x".repeat(REVIEW_COMMENT_MAX + 1)).error);
  assert.ok(normalizeReviewComment("연락 주세요 010-1234-5678").error, "전화번호는 막는다");
  assert.ok(normalizeReviewComment("계좌이체로 드렸어요").error, "외부 결제 표현은 막는다");
  assert.ok(normalizeReviewComment("110-123-456789 로 보냈어요").error, "계좌번호 형식은 막는다");
  assert.equal(normalizeReviewComment("2024년에 84㎡ 매수 상담, 도움 됐어요").error, undefined);
});

test("후기 작성자 라벨 — 앞 글자만 남기고 이메일은 노출하지 않는다", () => {
  assert.equal(reviewerLabelOf("김철수", "kim@example.com"), "김** 이웃");
  assert.equal(reviewerLabelOf(null, "daewoong@example.com"), "da** 이웃");
  assert.equal(reviewerLabelOf("kim@example.com", "kim@example.com"), "ki** 이웃", "닉네임이 이메일이면 로컬 2자만");
  assert.equal(reviewerLabelOf("  ", "a@b.c"), "a** 이웃");
});

test("평점 집계 — 유효 범위만, 소수 2자리, 0건은 0/0", () => {
  assert.deepEqual(summarizeRatings([]), { rating: 0, reviews: 0 });
  assert.deepEqual(summarizeRatings([5, 4, 4]), { rating: 4.33, reviews: 3 });
  assert.deepEqual(summarizeRatings([5, 0, 9, Number.NaN, 3]), { rating: 4, reviews: 2 });
});

test("응답률·중앙값 — 90일 창, 의뢰자 마감 건은 분모 제외", () => {
  const now = Date.parse("2026-09-03T00:00:00Z");
  const h = 3_600_000;
  const at = (hoursAgo: number) => new Date(now - hoursAgo * h).toISOString();
  const items = [
    { createdAt: at(10), repliedAt: at(8), status: "replied" }, // 2h
    { createdAt: at(50), repliedAt: at(20), status: "replied" }, // 30h
    { createdAt: at(5), repliedAt: null, status: "pending" }, // 미답변 → 분모
    { createdAt: at(6), repliedAt: null, status: "closed" }, // 의뢰자 마감 → 제외
    { createdAt: at(24 * 120), repliedAt: null, status: "pending" }, // 창 밖 → 제외
  ];
  const s = responseStats(items, now);
  assert.equal(s.total, 3);
  assert.equal(s.answered, 2);
  assert.equal(s.responseRate, 67);
  assert.equal(s.medianHours, 16);
  assert.deepEqual(responseStats([], now), { responseRate: null, medianHours: null, answered: 0, total: 0 });
});

test("응답 시간 라벨 — 실측 우선, 없으면 전문가 안내문, '대기' 는 무시", () => {
  assert.equal(responseTimeLabel(0.5, "보통 3일"), "1시간 내 답변");
  assert.equal(responseTimeLabel(5.4, null), "약 5시간 내 답변");
  assert.equal(responseTimeLabel(50, null), "약 2일 내 답변");
  assert.equal(responseTimeLabel(null, "보통 당일"), "보통 당일");
  assert.equal(responseTimeLabel(null, "대기"), null);
  assert.equal(responseTimeLabel(null, ""), null);
});

test("프로필 입력 정규화 — 상한·형식·카카오 도메인 화이트리스트", () => {
  const { patch, errors } = sanitizeExpertProfilePatch({
    introduction: "  소개  문장 ",
    specialties: ["세무/절세", "tax", "상가"],
    regions: "서울 강남구, 서울 서초구, 성남 분당구, a, b, c, d",
    consultationFee: "-5",
    reportFee: 99_999_999_999,
    responseTime: "보통 당일",
    organization: "",
    contactPhone: "031-123-4567",
    contactKakao: "https://pf.kakao.com/_abc",
    ownerEmail: "hacker@example.com",
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.introduction, "소개 문장");
  assert.deepEqual(patch.specialties, ["세무/절세", "상가"]);
  assert.equal(patch.regions!.length, 5);
  assert.equal(patch.consultationFee, 5, "음수 부호는 떼고 숫자만 — 상한 안");
  assert.equal(patch.reportFee, 10_000_000);
  assert.equal(patch.organization, null);
  assert.equal(patch.contactPhone, "031-123-4567");
  assert.equal(patch.contactKakao, "https://pf.kakao.com/_abc");
  assert.ok(!("ownerEmail" in patch), "허용 밖 필드는 버린다");
});

test("프로필 입력 — 잘못된 연락처는 에러로 알리고 저장하지 않는다", () => {
  assert.equal(sanitizeKakaoLink("javascript:alert(1)"), null);
  assert.equal(sanitizeKakaoLink("http://pf.kakao.com/x"), null, "https 만");
  assert.equal(sanitizeKakaoLink("https://evil.com/pf.kakao.com"), null);
  assert.equal(sanitizeKakaoLink("https://open.kakao.com/o/abc"), "https://open.kakao.com/o/abc");
  assert.equal(sanitizeKakaoLink(undefined), undefined, "필드 없음 = 변경 없음");
  assert.equal(sanitizeKakaoLink(""), null, "빈 문자열 = 지움");
  assert.equal(sanitizePhone("12"), null);
  assert.equal(sanitizePhone("010-1234-5678"), "010-1234-5678");
  const bad = sanitizeExpertProfilePatch({ contactKakao: "https://evil.com", contactPhone: "12" });
  assert.equal(bad.errors.length, 2);
});

test("공개 DTO 는 소유자 이메일·내부 user id 를 싣지 않는다", () => {
  const e = { id: "x", ownerEmail: "o@x.com", userId: "u1", name: "홍" } as unknown as UserExpertProfile;
  const pub = sanitizeExpertForPublic(e) as Record<string, unknown>;
  assert.ok(!("ownerEmail" in pub));
  assert.ok(!("userId" in pub));
  assert.equal(pub.name, "홍");
});
