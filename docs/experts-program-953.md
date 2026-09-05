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

---

## 965 재점검 (2026-09-05) — 전문가 등록·심사 파이프라인

| # | 증상(예전) | 반영 |
|---|---|---|
| D1 | 자동 검증에서 차단된 신청도 먼저 insert 돼 pending 큐에 남았다 | 차단이면 저장하지 않는다(`ExpertApplicationBlockedError`) |
| D2 | 본인인증 공급자가 꺼져 있어도 전원에게 "본인인증 미완료" 플래그 | 공급자가 켜져 있을 때만 판정(없으면 플래그 없음) |
| D3 | 신청 뒤 승인 전에는 마이 화면이 "프로필 없음 → 신청하기" 만 보여 줬다 | `/my/expert-profile` 이 최근 신청의 심사 중·반려(사유)·승인 상태와 단계를 보여 준다 |
| D4 | `POST /api/experts` 로 로그인만 하면 인증 없이 공개 프로필 생성 | 관리자 전용 |
| D5·D9 | 승인 때 `markExpertVerified` 실패를 무시·기존 프로필 미동기화·모든 유형의 번호를 중개사 등록번호 칸에·검수 메모 소실·user_id null | 실패면 오류로 답함, 빈 칸만 신청서로 채움, 공인중개사만 등록번호 칸(그 외는 메모에), 메모·번호는 넘길 때만 갱신, user_id 연결 |
| D6 | 자격번호 중복 판정이 본인 이전 건까지 세서 재신청이 막힘 | 본인 이메일 제외 |
| D7 | "제…호"·구분 기호가 다르면 다른 번호 | 정규화 강화 + 기존 행 백필 |
| D8 | 없는 단계(문서 48h·출처 72h·인터뷰 120h)와 SLA 를 화면·FAQ 가 약속 | 실제 단계(접수→자동 검증→운영자 검토 72h→승인)만 적음 |
| D10·D11 | 소유자 비교 대소문자 미정규화, 미인증 프로필도 상담 신청·한도 소모 | 소문자 정규화, 미인증은 409 `expert_unverified` |
| D12 | 접수 제한 없음 | 계정당 1시간 3회·IP 10회 + 진행 중 신청이 있으면 409 `application_pending` |
| D13 | 알림이 상담함으로 링크 | 접수·승인·반려 모두 `/my/expert-profile` |
| D15 | 심사 큐가 최신순 12건 합산 뒤 다시 12로 잘라 오래된 신청이 기아 | 먼저 온 순(FIFO), 종류별 30건 |
| D16 | 순수 규칙 단위검증 없음 | `tests/unit/expert-fraud-guards.test.ts` |
| D17 | 첨부 링크를 서버가 검증하지 않음 | https·공개 주소·5개·중복 제거(`validateDocumentUrls`) |
| 부수 | 상담 요청 본문에 휴대폰 번호가 있으면 "계좌번호" 로 **차단** | 휴대폰 형식은 계좌 판정에서 제외(연락처 경고만) |

D18(전문가 표 권한): 운영 DB 실측 — `expert_verification_requests`·`expert_profiles`·
`expert_consultations`·`expert_fraud_events` 모두 RLS on·정책 0·anon/authenticated
grant 없음(service_role 전용). 파일이 없을 뿐 상태는 안전하다.
