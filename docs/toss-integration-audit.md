# 토스페이먼츠 공식 문서 전면 반영 — 감사 결과와 반영 내역 (2026-08-14)

소유자가 전달한 공식 개발 문서(주문서형/결제창형 연동 · 결제 어드민 · 카드/간편/휴대폰
결제 · 자동결제(빌링) · 웹훅 연결+이벤트 · 보안 · 요청/응답 본문 · 코어 API · API 버전
정책 · 계좌 인증 API)를 기존 연동 코드와 1:1 대조한 결과다. "이미 맞게 되어 있던 것"과
"이번에 고친 것"을 구분해 적는다 — 전부 새로 했다고 적으면 그것도 거짓말이다.

상점: 우리동네이야기 · MID `nuguzibowg` · https://naezipnow.com

---

## A. 대조 결과 — 이미 문서와 일치했던 것 (변경 없음)

| 문서 요구 | 우리 구현 | 위치 |
|---|---|---|
| 주문서형: widgets → setAmount → renderPaymentMethods + renderAgreement → requestPayment | 그대로 구현(위젯 연동 키 gck 자동 판별) | app/subscription/checkout/CheckoutClient.tsx |
| 결제창형: payment().requestPayment, V2 amount 는 `{currency, value}` 객체 | ck 키일 때 자동 폴백 경로로 구현 | 〃 |
| 금액은 서버가 계산·저장, successUrl 의 amount 는 서버 저장값과 대조 | create 가 서버 계산, confirm 이 `body.amount !== existing.amount` 거부 | app/api/payments/toss/create·confirm |
| 승인 API 멱등키(15일 유효) — 재시도 이중 승인 방지 | orderId 기반 결정적 UUID v5 멱등키 | confirm/route.ts |
| confirm 실패 ≠ 결제 실패 단정 — 조회 API 로 실상태 확인 | `GET /v1/payments/orders/{orderId}` 복구 경로 | 〃 |
| 웹훅 페이로드 불신 — 결제 조회 API 재확인 후 반영, 멱등 처리 | PAYMENT_STATUS_CHANGED 재조회·금액 대조·조건부 상태 전이 | webhook/route.ts |
| DEPOSIT_CALLBACK 은 secret 검증 없이는 승인 금지 | 가상계좌 미사용 상점 — 기록만 남기고 200 | 〃 |
| 결제 어드민: variantKey 로 UI 관리(미지정=기본) | 주석으로 명시, 계약 후 어드민 운영 전제 | CheckoutClient.tsx |
| 테스트 키 승인은 가상(청구 없음) — 화면에 명시 | isTossTestEnv 배너 | toss-rail.ts |
| test/live 키 짝 검증, 개발환경 라이브 키 차단 | confirm 의 3중 가드 | confirm/route.ts |
| 세금: 과세 상점은 taxFreeAmount 불필요 | 보내지 않음(주석으로 근거 명시) | CheckoutClient.tsx |

## B. 이번에 반영한 것 (갭이었던 부분)

### B-1. 자동결제(빌링) 실연동 — 문서 흐름 전체 구현
문서: requestBillingAuth → successUrl(customerKey+authKey) → `POST /v1/billing/authorizations/issue`
→ billingKey 저장 → `POST /v1/billing/{billingKey}` 승인 → **스케줄링은 상점이 직접 구현**.

- `billing_subscriptions` 테이블(마이그레이션 20260813235816): customerKey 는 DB 가 만드는
  무작위 UUID(문서: 이메일 등 유추 가능 값 금지), billingKey 는 RLS 정책 없음(서비스롤
  전용)으로 클라이언트 노출 원천 차단.
- 카드 등록 화면 `/subscription/billing` + `POST /api/payments/toss/billing/start`
  (customerKey 서버 발급, 금액 서버 계산).
- successUrl `GET /api/payments/toss/billing/register`: 발급→저장→**첫 결제 즉시 승인**→
  활성화. 새로고침 멱등(활성 구독이면 재발급 없이 성공 화면).
- 갱신 스케줄러: pg_cron `billing-renewals`(10:10·22:10 KST) → `/api/cron/billing-renewals`.
  이중 청구 3중 방어: 주기 고정 멱등키(구독 id+next_charge_at) · 주기 고정 orderId 재사용
  검사 · 성공 시 next_charge_at 전진. 다음 청구는 만료 2일 전(연장 규칙이 기존 만료에 이어
  붙이므로 이용 기간 손실 없음, 실패 시 2일의 재시도 창).
- 실패 처리(문서의 "실패 시 새 카드 등록 유도"): 재시도 가능 코드는 다음 크론 재시도,
  재시도 무의미 코드(NOT_FOUND_BILLING_KEY·정지 카드 등)나 3연속 실패는 suspended +
  인앱 알림으로 재등록 안내.
- 해지: `POST /api/payments/toss/billing/cancel` — 청구 중단 + `DELETE /v1/billing/{billingKey}`
  로 빌링키 삭제. 이미 결제한 기간은 만료일까지 유지(구독 관리 카드에 명시).
- 구독 관리 패널: 자동결제 이용자에게 **실제 저장값** next_charge_at 을 다음 결제일로 표시
  (단건 결제는 자동 갱신이 없으므로 여전히 표시하지 않는다 — 원칙 유지).
- 만료 사전 알림(T-7·T-1)에서 자동결제 이용자 제외 — 자동 갱신될 사람에게 "연장하세요"는
  거짓 안내다.

### B-2. 웹훅 — BILLING_DELETED 이벤트 처리 추가
문서(웹훅 이벤트): BILLING_DELETED 는 `eventType·createdAt·billingKey·reason` 구조, 서명 없음.
서명이 없으므로 **서버에만 저장된 billingKey 와 일치하는 행이 있는 것 자체를 진위 확인**으로
쓴다. 일치 시 구독 deleted 전이(크론 청구 중단) + 재등록 안내 알림. 미일치는 무반응 200.

### B-3. 에러 코드 안내 정밀화 (요청·응답 본문 / 코어 API 문서)
- `NOT_FOUND_PAYMENT_SESSION`(승인 대기 10분 초과): confirm 응답과 실패 화면 모두
  "10분 초과로 세션 만료, 청구 안 됨"을 정확히 안내(이전엔 일반 오류로 뭉개짐).
- 실패 화면 코드 매핑 추가: UNAUTHORIZED_KEY·INVALID_CLIENT_KEY·INVALID_API_KEY·
  FORBIDDEN_REQUEST·INVALID_REQUEST·NOT_SUPPORTED_METHOD(상점 설정 문제),
  EXCEED_MAX_AUTH_COUNT(인증 횟수 초과), NOT_FOUND_BILLING_KEY 등 빌링 계열.
- 주간권 결제의 영수증·재시도 링크가 "월간"으로 잘못 표기되던 2건 수정
  (성공 화면 플랜 행 · 실패 화면 retry 파라미터).

### B-4. 계좌 인증 API (v2) 클라이언트
`lib/payments/toss-bank-account.ts` — `/v2/bank-accounts/verify-holder-real-name`·
`verify-holder-name`, v2 봉투(entityBody.isValid) 파싱. **화면 배선은 하지 않았다** —
별도 이용 신청이 필요한 부가 API 라(문서 명시), 신청 전에 붙이면 되는 척하는 UI 가 된다.
용처(무통장 환불 계좌 검증·전문가 정산 계좌 실명 확인)가 열리면 이 모듈을 쓴다.

## C. 보안 문서 대조 (방화벽 IP · TLS)

- **TLS 1.2 이상**: 충족. naezipnow.com 은 Vercel 종단이 TLS 를 처리하며 TLS 1.2+ 만
  허용한다. 우리가 토스 API 로 나가는 요청도 Node fetch 의 기본 TLS(1.2+)다.
- **인바운드(웹훅 발신 IP) 허용 목록**: Vercel 서버리스에는 IP 방화벽 개념이 없어
  "허용 목록" 방식은 적용 불가다. 대신 우리 웹훅은 **IP 를 신뢰 근거로 쓰지 않는다** —
  페이로드를 믿지 않고 시크릿 키로 결제를 재조회해 검증하므로, 발신 IP 검증보다 강한
  방어다(위조 페이로드는 재조회에서 걸러진다). BILLING_DELETED 는 서버 전용 billingKey
  일치가 진위 확인이다.
- **아웃바운드**: 토스 API 도메인은 api.tosspayments.com 하나로 고정해 코드 상수로만
  호출한다(lib/payments/toss-billing.ts·toss-bank-account.ts 의 API_BASE).
- IP 목록 자체는 여기 옮겨 적지 않는다 — 토스가 사전 고지 후 변경할 수 있는 값이라
  문서(developers.tosspayments.com 보안 페이지)가 단일 출처다. 옮겨 적는 순간 낡기
  시작한다(낡은 실측치는 낡은 코드보다 위험하다).

## D. API 버전 정책 (문서 대조)

- API 버전은 상점 단위로 개발자센터에서 고정되며, 우리는 별도 버전 헤더를 보내지 않는다
  (= 상점 기본 버전 사용). 코드가 의존하는 필드는 v1 Payment 객체의 안정 필드
  (paymentKey·orderId·status·totalAmount·method·receipt.url)뿐이라 버전 변경 내성이 있다.
- 계좌 인증만 v2 응답 봉투(entityBody)를 쓰며 전용 파서를 뒀다.
- 승인 멱등키는 15일 유효(문서) — confirm·빌링 승인 모두 결정적 키를 쓰므로 15일 안의
  재시도는 전부 같은 응답을 받는다.

## E. 소유자 후속 절차 (이 순서대로)

1. **빌링 전자계약**: 토스 홈페이지 > 이용 신청하기 > 직접 구축 > 빌링(정기결제).
   (심사 회신문 C-2 — 이미 안내된 항목)
2. 계약 승인 후 Vercel 환경변수 **`NEXT_PUBLIC_TOSS_BILLING_ENABLED=1`** 추가 → 재배포.
   이 플래그 전까지 자동결제 화면·API 는 "준비 중"을 사실대로 보여 준다(정직한 대기).
3. **웹훅 등록**(개발자센터 > 내 개발정보 > 웹훅, MID `nuguzibowg`):
   - URL: `https://naezipnow.com/api/payments/toss/webhook`
   - 이벤트: `PAYMENT_STATUS_CHANGED` + **`BILLING_DELETED`** (가상계좌를 열면 DEPOSIT_CALLBACK 추가)
   - 문서 기준 10초 내 200 응답 요건: 우리 핸들러는 재조회 1회 후 즉시 응답(통상 수 초).
     실패 시 최대 7회 재전송되므로 처리는 멱등으로 구현돼 있다.
4. **vault `cron_secret` 등록**(이미 site-probe·social 크론과 공유하는 절차 —
   docs/social-shorts-setup.md C절). 미등록이면 billing-renewals 크론은 무동작이다.
5. 라이브 키 전환 시 `TOSS_SECRET_KEY`·`NEXT_PUBLIC_TOSS_CLIENT_KEY` 를 **같은 환경 짝**으로
   교체(짝 불일치는 confirm 가드가 문장으로 알려 준다).

## F. 이 반영이 심사 고정 게이트와 충돌하지 않는 이유

심사에 제출한 사실(가격 5종·사업자 고지·제공기간 문구·환불 앵커)은 한 글자도 바꾸지
않았다 — `npm run check:review-freeze` 가 빌드마다 강제한다. 자동결제는 **병행 신설
경로**이고, 전자계약 승인 전에는 플래그가 꺼져 있어 사용자에게 보이는 상품 구성이
심사 제출 상태와 동일하게 유지된다. ComplianceNotice 의 "주간권은 1회성 단건 결제로
자동 반복청구가 없습니다" 문구는 자동결제가 열려도 참이다(주간권은 빌링 대상이 아니다 —
start API 가 weekly 를 400 으로 거절한다).
