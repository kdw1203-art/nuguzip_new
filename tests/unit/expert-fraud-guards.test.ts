import { strict as assert } from "node:assert";
import test from "node:test";

import {
  checkNameAccountMismatch,
  hasBlockingFraudHit,
  isValidKrMobile,
  normalizeCertNumber,
  normalizePhone,
  scanExpertConversationText,
  validateDocumentUrls,
} from "../../lib/experts/fraud-guards";

/* [965] 전문가 접수의 자동 검증 규칙 — 순수 함수만 검증한다(DB 없음). */

test("자격번호 정규화 — '제…호'·구분 기호·전각·공백을 걷어내 같은 번호는 같게", () => {
  assert.equal(normalizeCertNumber("제 11-2020-00123 호"), "11202000123");
  assert.equal(normalizeCertNumber("11202000123"), "11202000123");
  assert.equal(normalizeCertNumber("제11-2020-00123호"), normalizeCertNumber("11.2020/00123"));
  /* 전각 숫자·하이픈도 같은 번호 */
  assert.equal(normalizeCertNumber("１１－２０２０－００１２３"), "11202000123");
  /* 지역명이 들어간 번호는 한글을 남긴다 */
  assert.equal(normalizeCertNumber("서울-2020-00123"), "서울202000123");
  assert.equal(normalizeCertNumber("  abc-12 "), "ABC12");
  assert.equal(normalizeCertNumber(null), "");
});

test("휴대폰 정규화·검증 — +82 표기와 하이픈", () => {
  assert.equal(normalizePhone("+82 10-1234-5678"), "01012345678");
  assert.equal(isValidKrMobile("010-1234-5678"), true);
  assert.equal(isValidKrMobile("02-123-4567"), false);
});

test("정산 예금주 vs 실명 — 포함 관계는 통과, 다르면 검토 큐", () => {
  assert.equal(checkNameAccountMismatch("홍길동", "홍길동"), null);
  assert.equal(checkNameAccountMismatch("홍길동", "홍 길 동"), null);
  assert.equal(checkNameAccountMismatch("홍길동", "(주)홍길동"), null);
  const hit = checkNameAccountMismatch("홍길동", "김철수");
  assert.ok(hit);
  assert.equal(hit.severity, "review_queue");
  /* 비어 있으면 판단하지 않는다 */
  assert.equal(checkNameAccountMismatch("홍길동", null), null);
});

test("상담 본문 스캔 — 외부 결제 유도·계좌번호는 차단, 연락처는 경고", () => {
  const hits = scanExpertConversationText("카톡 송금으로 주세요 110-123-456789");
  assert.equal(hasBlockingFraudHit(hits), true);
  assert.ok(hits.some((h) => h.ruleId === "off_platform_payment"));
  assert.ok(hits.some((h) => h.ruleId === "account_leak"));

  const soft = scanExpertConversationText("연락은 010-1234-5678 로 주세요");
  assert.equal(hasBlockingFraudHit(soft), false);
  assert.ok(soft.some((h) => h.ruleId === "contact_leak"));

  assert.deepEqual(scanExpertConversationText("   "), []);
});

test("첨부 서류 URL — https 공개 주소만, 5개까지, 중복 제거", () => {
  const ok = validateDocumentUrls([
    "https://example.com/a.pdf",
    " https://example.com/a.pdf ",
    "https://drive.google.com/x",
    "",
  ]);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.urls, ["https://example.com/a.pdf", "https://drive.google.com/x"]);

  assert.equal(validateDocumentUrls(["http://example.com/a.pdf"]).ok, false);
  assert.equal(validateDocumentUrls(["javascript:alert(1)"]).ok, false);
  assert.equal(validateDocumentUrls(["https://localhost/x"]).ok, false);
  assert.equal(validateDocumentUrls(["https://10.0.0.1/x"]).ok, false);
  assert.equal(validateDocumentUrls("https://example.com").ok, false);
  assert.equal(
    validateDocumentUrls(Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`)).ok,
    false,
  );
  const none = validateDocumentUrls(undefined);
  assert.equal(none.ok, true);
  if (none.ok) assert.deepEqual(none.urls, []);
});
