# 토스페이먼츠 테스트 환경 분석·반영 — 2026-08-03

근거 문서: docs.tosspayments.com/guides/environment · guides/v2/payment-window/integration · sdk/v2/js

## 가이드 요지 (환경)

- **테스트 키(test_ck_/test_sk_) 승인은 가상**이다 — 실제 결제수단에서 금액이
  빠져나가지 않는다. 실카드 번호를 넣어도 청구되지 않는다.
- 키는 test/live **짝을 맞춰야** 한다. 어긋나면 결제창은 떠도 승인이 실패한다.
- 간편결제 중 **카카오페이는 토스 테스트 환경 미지원**(라이브 키 필요).
  토스페이·네이버페이 등은 테스트 가능.
- 가상계좌 테스트 번호는 앞에 'X'가 붙고 시스템 입금 처리만 가능(우리는 미사용).
- 테스트 환경에서 에러 코드를 헤더로 재현할 수 있다(디버깅용).

## 기존에 이미 있던 것 (서버)

- `POST /api/payments/toss/create` — 주문 생성(로그인 필수 401 · 금액은 서버 계산
  · 15분 내 중복 주문 재사용)
- `POST /api/payments/toss/confirm` — 승인. **금액을 서버 저장값과 대조**(위변조
  방지), orderId 기반 **멱등키**(UUID v5), paymentKey 재사용 차단,
  **운영에 test_sk_ 키가 꽂히면 결제 중단** 가드
- `/payment/success` — paymentKey/orderId/amount 로 서버 confirm 호출
- `/payment/fail` — PG 오류 코드를 안전한 한국어 문구로 매핑(반사 주입 차단)

## 이번에 반영한 것

1. **클라이언트 결제창 레일 신설** (`app/subscription/toss-rail.ts`)
   — 없던 조각. SDK v2(`https://js.tosspayments.com/v2/standard`) 동적 1회 로드,
   통합결제창(method: CARD — 카드+토스페이 등 간편결제 한 창),
   `successUrl=/payment/success`·`failUrl=/payment/fail`,
   customerKey 는 `TossPayments.ANONYMOUS`(이메일 등 개인정보를 토스 대시보드에
   남기지 않음 — 빌링 도입 시 무작위 키를 서버 발급으로 전환).
2. **PlanCheckoutButton 레일 순서** — 토스 키 설정 시 토스 최우선 →
   실패 시 기존 Stripe/카카오페이 폴백. 사용자가 결제창을 닫은 것
   (USER_CANCEL)은 오류가 아니라 취소로 처리(문구 없음).
3. **테스트 환경 정직 표기** — test_ck_ 키일 때 결제 확인 단계에
   "테스트 결제 환경 — 실제 금액이 청구되지 않아요" 명시(사실 우선).
4. **confirm 가드 2종 추가** — ① 개발/프리뷰에 live_sk_ 키 → 결제 중단
   (개발 중 실청구 사고 차단, 기존 운영+test 가드의 역방향),
   ② 클라이언트/시크릿 키 환경 불일치 → 명확한 문구로 중단.
5. **어드민 연동 현황** — 토스 행에 테스트/라이브 상태 표기,
   카카오페이 테스트 불가 사실 주석, docsUrl 을 환경 가이드로.

## 소유자 해야 할 일 (키는 채팅에 붙여넣지 말 것)

1. [토스페이먼츠 개발자센터](https://developers.tosspayments.com) → API 키에서
   **테스트 키 쌍** 확인 (`test_ck_…` / `test_sk_…`)
2. Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_TOSS_CLIENT_KEY` = test_ck_… (Production/Preview)
   - `TOSS_SECRET_KEY` = test_sk_… (Production/Preview, Sensitive)
3. 재배포 후 /subscription 에서 플랜 결제 → 결제창에서 아무 카드로 진행 →
   성공 페이지·마이페이지 플랜 반영 확인 (실청구 없음)
4. 라이브 전환 시 두 키를 **같이** live_ 쌍으로 교체 — 운영에 test 키가 남으면
   confirm 가드가 결제를 중단한다(청구 없는 가짜 성공 방지).

## 로그인 관련 확인

- 결제 시작은 로그인 필수: create 라우트 401 + 버튼이 `/login?callbackUrl=` 로
  유도(기존 동작 유지, 토스 레일도 동일 관문 통과).
- confirm 은 주문 생성자 이메일과 현재 세션 대조(타인 주문 승인 차단 — 기존).

## 2차 반영 (2026-08-03 오후) — 위젯·웹훅·빌링·어드민

상점 심사 접수 확인: 상호 우리동네이야기 · MID nuguzibowg.
추가 검토 문서: payment-flow · payment-widget/admin · payment-window · billing ·
webhook · learn/tax · learn/payment-results · get-started/llms-guide.

1. **결제위젯 주문서형 체크아웃** `/subscription/checkout?tier=&billing=`
   — 결제창 직행을 위젯으로 승격. 이유: 계약 후 상점관리자 어드민에서
   **코드 수정 없이** 결제수단 추가·UI 변경·프로모션 관리 가능(variantKey 로
   특정 UI 지정, 미지정 시 기본 UI). 구독 버튼(토스 레일)은 이 페이지로 이동.
   금액은 서버 계산(create), 승인은 서버 confirm(금액 대조·멱등키) — 불변.
2. **웹훅 수신** `POST /api/payments/toss/webhook`
   — PAYMENT_STATUS_CHANGED: 페이로드를 믿지 않고 결제 조회 API 로 재검증 후
   DONE→paid(+플랜 적용), CANCELED→refunded, ABORTED/EXPIRED→failed(승인 전만).
   10초 내 200 규칙 준수, 멱등(같은 이벤트 재수신 시 상태 재변경 없음),
   모르는 주문은 무기록 200. DEPOSIT_CALLBACK(가상계좌)은 미사용 상점이라
   기록만 남기고 승인하지 않음(발급 시작 시 secret 대조 로직을 붙일 것).
   **등록(사람)**: 개발자센터 → 웹훅 → https://nuguzip.com/api/payments/toss/webhook
   · PAYMENT_STATUS_CHANGED 구독.
3. **자동결제(빌링) 기반 모듈** `lib/payments/toss-billing.ts`
   — issueBillingKey(authKey 교환)·chargeBillingKey(멱등키 지원). 문서 명시대로
   리스크 검토·추가 계약 후에만 화면·크론 배선(현재 미배선 — 일회성 결제 유지).
   customerKey 는 서버 발급 무작위 키 원칙 명문화.
4. **어드민** `/admin/payments` — 키 환경(test/live/미설정/짝 불일치) 판정,
   사람 절차 체크리스트(웹훅 등록·테스트 시나리오·위젯 어드민·라이브 전환·
   세금 파라미터), 최근 결제 20건 실데이터(실패는 실패라고 표기).
5. **세금** — 과세 상점 기준 vat 자동 계산으로 현행 파라미터 불필요.
   면세 상품 도입 시 taxFreeAmount 를 결제·취소·현금영수증에 전달해야 함(기록).
