# 전문가 프로그램 — 953 재설계 메모

> 대상: 소유자·다음 세션. 953 이전에 흩어져 있던 전문가 기능을 한 흐름으로 묶었다.
> 실측(2026-09-02): expert_profiles 0행 · 상담 0건 · 견적 요청 0건 — **콜드 스타트**다.
> 가짜 프로필·후기 시딩은 하지 않는다(정직 원칙). 아래는 "첫 전문가가 오면 그대로 도는" 상태.

## 1. 한 흐름

```
의뢰자                                   전문가
──────                                   ──────
/town/experts 목록 ── 자격·분야·지역·정렬 ──▶ 프로필 상세 /town/experts/[id]
   │ 견적 요청(숨고형)                          │ 상담 신청 (플러스 2회·프로 10회/월)
   ▼                                           ▼
market_requests ◀── 제안(요청당 1건) ── /my/consultations#received (전문가 콘솔)
   │                                           │ 답변 → 알림 + 의뢰자 상담함
   ▼                                           ▼
/my/consultations#requests (받은 제안 비교)   /my/consultations#sent (답변 열람)
                                               │ 후기(별점 1~5·300자, 상담당 1건)
                                               ▼
                                     expert_profiles.rating / reviews 재계산
```

## 2. 단일 출처

| 개념 | 파일 | 소비처 |
|---|---|---|
| 자격 유형·검증 출처·분야·견적 카테고리 | `lib/experts/taxonomy.ts` | 신청 폼 · 목록 필터(`EXPERT_SUBCATEGORIES` 는 어댑터) · 견적 모달/API · 운영정책 페이지 · 프로필 폼 |
| 후기·응답률·라벨 규칙 | `lib/experts/review-rules.ts` | 후기 API · 상담함 · 목록/상세 지표 |
| 프로필 입력 검증 | `lib/experts/profile-input.ts` | `PATCH /api/experts/[id]` |
| FAQ (화면 + FAQPage JSON-LD 동일 배열) | `lib/experts/faq.ts` | `/town/experts` |

정책 경계: 법률 서비스(법무사·변호사) 유형은 분류 체계에 없다(토스 정책 2026-08-12). `scripts/check-toss-review-freeze.mjs` + `tests/unit/expert-taxonomy.test.ts` 가 재유입을 막는다.

## 3. DB (마이그레이션 `20260903000000_expert_reviews_and_proposals.sql`, MCP 적용 완료)

- `public.expert_reviews` — 상담당 1건(unique consultation_id), 서비스 롤 전용(deny-all RLS · anon/authenticated revoke).
- `market_request_proposals` + `expert_id`·`expert_label`, (request_id, proposer_email) 유니크.
- `expert_profiles.rating / reviews / response_rate / consultations` 가 953 부터 **실제 값**을 갖는다(후기 작성·답변 등록 시 재계산). 목록/상세는 여전히 원장 재계산을 우선한다.

## 4. API

| 경로 | 역할 |
|---|---|
| `POST /api/experts/[id]/consult` | 상담 신청(한도·잠금·rate limit 기존 유지) |
| `PATCH /api/experts/[id]/consult` | 전문가 답변(응답률 재계산 + 상담함 딥링크 알림) · **의뢰자 마감** `{action:"close"}` (953) |
| `GET/POST /api/experts/[id]/reviews` | 공개 후기 목록 / 후기 작성 (953) |
| `PATCH /api/experts/[id]` | 프로필 수정 — 값 검증 + ISR 무효화 (953) |
| `POST /api/market-requests/[id]/propose` | 제안 저장 + 사기 스캔 + 알림 (953: 영속화) |
| `POST /api/market/requests/[id]/proposals` | **410** — 인증 게이트 없던 중복 라우트 폐기 (953) |
| `PATCH /api/admin/experts` | 승인 시 목록·상세 ISR 무효화 (953) |

## 5. 소유자가 할 일 (첫 전문가 받기)

1. 첫 신청이 오면 `/admin/quality` 검증 큐에서 자격 조회처(협회 링크가 큐에 있음)로 확인 후 승인.
2. 승인 즉시 목록·상세에 노출된다(ISR 무효화). 전문가에게 `마이 › 전문가 프로필` 에서 소개·분야·지역·연락처를 채우라고 안내(완성도 미터가 부족한 항목을 알려 준다).
3. 견적 요청은 의뢰자 쪽에서 먼저 쌓일 수 있다 — 전문가 0명이어도 요청은 접수되고, 첫 인증 전문가가 보드에서 제안을 보낼 수 있다.
4. 후기는 답변 완료 상담의 의뢰자만 남길 수 있으므로 운영자가 대신 채울 수 없다(의도).

## 6. 남긴 것 (다음 후보)

- 상담 유료화·정산: 현재 상담료는 "안내 금액"이며 결제·정산 코드는 없다(토스 심사 범위). `lib/billing/marketplace-fees.ts` 상수만 존재.
- 후기 신고·비공개 처리 UI(`is_public` 컬럼은 준비됨, 관리 화면 없음).
- 전문가 사진·자격증 이미지 업로드(스토리지 정책 필요).
- 채팅방(`chat_rooms.expert_id`) 과 상담함 연결.
