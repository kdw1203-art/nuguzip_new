# 오픈 준비도 (소프트 / 하드)

기준일: 2026-07-30. 체크리스트 원본: `lib/open-beta/checklist.ts`.

## 소프트 오픈 (무료·가입·임장·AI·동네)

**목표:** 가짜 점수·익명 스팸·데모 SEO 혼선 없이 실사용 가능한 공개.

코드 게이트가 충족되면 `summarizeGate().softOpenReady === true`.

| 영역 | 상태 |
| --- | --- |
| 익명 글/댓글 차단 + SoftSignup | 코드 |
| 시세 워크벤치 저평가 발명 금지 | 코드 |
| AI 내부 엔진 “상위 N%” 제거 | 코드 |
| 데모 분석 URL sitemap/robots 제외 | 코드 |
| 사업자 고지 미완 시 결제 API 503 | 코드 |
| 푸터·약관에 고지 미완 경고 | 코드 |

**허용:** 무료 가입, 노트, AI(쿼터), 지도, 동네(로그인 후), 구독 페이지 열람.  
**비허용(의도):** 카드/카카오페이/부스트 결제창 — 고지·실결제 점검 전.

## 하드 오픈 (유료·운영 완료)

`releaseReady` 는 아래 **오너 전용**이 모두 `done` 일 때만 참.

1. `business-disclosure` — `NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_MAIL_ORDER_SALES_NUMBER` (+ 사업자번호 검증)
2. `payment-e2e` — `docs/ops/payment-e2e-checklist.md` 실결제
3. `admin-2fa` — `docs/ops/admin-2fa.md`
4. `db-backup-drill` — `docs/ops/db-backup-drill.md`

그 외: Google OAuth 콘솔 프로덕션 승인, Resend 실메일, 스태프 공개노트 시드(선택).

## 운영 원칙

- 오너 전용 항목을 근거 없이 `done` 으로 바꾸지 않는다.
- 소프트 오픈 공지에는 “유료 결제 준비 중 / 사업자 고지 보완 후 결제 오픈”을 명시한다.
