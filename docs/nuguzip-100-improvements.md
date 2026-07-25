# nuguzip 제품·엔지니어링 개선 제안 100선

> **전제 — "사실 우선(facts-first)".** 이 문서의 모든 제안은 **조작·미검증 수치를 사실처럼 노출하지 않는다**는 원칙 위에서 설계했습니다. 실데이터(`market_transactions` **70,222행**, `apartment_complexes` **39,362행** — 2026-07-25 실측. 단, `apartment_complexes` 중 실제 단지 대장(`source_key='k-apt-basic'`)은 21,658행이고 나머지 17,704행은 이름 매칭용 별칭·식별자다. `market_region_*` 시세, `redevelopment_projects`, `apartment_supply` 등)를 쓰거나, 불가피하면 명확히 "예시" 라벨을 붙입니다. 이미 지도에서 구(區) 단위 목업 히트맵을 사실 우선 원칙에 따라 제거한 이력이 있고, 홈·관리자 대시보드의 하드코딩 목업(`app/page.tsx`의 `PIPELINE`/`CONTENTS`, `app/admin/quality/page.tsx` 전체)은 **G1·J2·F4에서 제거 완료**했습니다. 또한 이 백엔드는 **이미 상당 부분 구축**되어 있습니다 — 결제(토스·카카오페이) 라우트, 구독·엔타이틀먼트, 포인트 원장, 워치리스트 알림 cron, 웹푸시(VAPID), 실거래·시세 ETL cron, 매물 심사 큐, 전문가 인증 인테이크가 모두 존재합니다. 따라서 본 제안은 **새로 만들기보다 이미 있는 자산을 배선(wiring)·완성·사실화**하는 데 무게를 둡니다. 총 **100개 항목(도메인 10개 × 10개)**.

---

## 요약 로드맵

| Wave | 성격 | 테마 |
|---|---|---|
| **Wave 1** | 키 불필요 · 고레버리지 · 사실화/배선 | 이미 존재하나 끊겨 있는 것을 잇는다. 홈·관리자 목업을 실데이터/"예시"로 사실화(G1), 저장검색 알림 러너 완성(B1), 이중 포인트 시스템 단일화(B2), 단지 허브 실거래 **차트** 배선(D1), 데이터 관리 어드민 + 신선도 대시보드(F1·F2), 매물 소유확인 심사 큐 배선(I1), 전문가 인증 **승인 브리지**(J1·J2·J3). 대부분 S/M 난이도, 시크릿 키 불필요. |
| **Wave 2** | 결제 스캐폴딩 + 리텐션 다채널 | PG 시크릿 없이 가능한 **UI/플로우/엔타이틀먼트** 층: 구독 관리 페이지(E1), 게이팅 모달 일관화(E2), 무료체험·영수증 UI(E4·E5). 리텐션은 기존 인프라 재사용 — 워치리스트 실거래를 웹푸시로(B4), 신규매물 알림 다채널화(B5), 주간 개인화 다이제스트(B7). 지도는 mock 대신 **실데이터** 시세 오버레이(C1). |
| **Wave 3** | 센터 심화 (중개사·전문가·관리자, 실 DB+role) | 등록매물 관리센터를 실 운영 도구로: 매물 수정/삭제·분석·리드 캡처(I2·I3·I4), 부스트 셀프서비스(I5). 전문가 운영 콘솔·성과 랭킹·사기 로그 뷰(J5·J7·J8). 데이터 품질 검사·이상치·중복 병합(F4·F5·F7). 단지 정보 심화(Q&A·정비사업·공급 임베드, D2·D3·D4). |
| **Wave 4** | 키 의존 · 고급 파이프라인 | 소유자 제공 시크릿/외부 계정 필요: AdSense 슬롯 활성화(H1, 광고계정), 자격 자동 대조 API(J6), 학군 폴리곤·등시선(C6·C9), 65k/42k 코어 테이블 자체 파이프라인화(F8), 법원경매 실 어댑터(F10), 제휴 링크(H9). 앞 Wave가 끝난 뒤 착수. |

**표 범례** — 현황: 있음 / 부분 / 없음 · 우선순위: P0 / P1 / P2 · 난이도: S(며칠) / M(1~2 스프린트) / L(설계·파이프라인) · 키의존: 없음 / PG키 / 광고계정 / API키.

---

## 1. 고객 이용률·전환 (Acquisition / Activation)

초대·레퍼럴·온보딩 진행(`app_users.onboarding_progress`)·퍼널 이벤트(`platform_activity_events`)는 있으나, "가입→첫 임장노트" 활성화와 비로그인 전환 지점이 느슨합니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| A1 | 지도·단지 첫방문 코치마크 투어 | 부분 | P1 | S | 없음 | `onboarding_progress`에 `map_tour` 스텝을 추가해 첫 세션에 클러스터 가격라벨·필터·임장노트 CTA를 3스텝으로 안내. |
| A2 | "3분 첫 임장노트" 활성화 퍼널 | 부분 | P0 | S | 없음 | 온보딩 `inspection` 스텝을 홈 히어로 위젯으로 승격, `inspection_notes` 0건 사용자에게 우선 노출. |
| A3 | 비로그인 액션 → 소프트 가입 프롬프트 | 부분 | P1 | M | 없음 | 지도에서 워치리스트/비교 담기 클릭 시 `share_link_copy` 등 퍼널 이벤트와 함께 경량 회원가입 유도. |
| A4 | 초대 OG 공유카드 렌더 | 부분 | P1 | S | 없음 | `/invite/[code]` 초대자·"둘 다 300P"를 `app/api/og`로 이미지화해 카톡 공유 CTR 향상(현재 `ref_code` 쿠키만 존재). |
| A5 | 실거래 기반 SEO 랜딩 확장 | 부분 | P1 | M | 없음 | `sitemap.ts` 단지 2,000 + 지역 61(`/region`)에 더해 면적대·가격대 검색 랜딩을 프로그래매틱 생성. |
| A6 | 온보딩 완주 보상 진행바 | 부분 | P1 | S | 없음 | `onboarding_complete` 200P 적립(있음)을 `/my`에 3/3 진행바로 시각화해 완주율 상승. |
| A7 | A/B 실험 프레임워크 | 없음 | P2 | L | 없음 | open-beta 체크리스트에 todo로 남은 실험 프레임을 `platform_activity_events`에 variant 태그로 도입. |
| A8 | 검색 무결과 → 대안 제안 | 없음 | P1 | M | 없음 | `/search` 무결과 시 `apartment_complexes` 42k에서 인접 지역·유사 단지를 추천해 이탈 차단. |
| A9 | 공개 임장노트 → 전환 훅 | 부분 | P1 | S | 없음 | `/notes/[id]` 하단에 "이 단지 워치리스트+알림" 로그인 유도(공개노트는 이미 sitemap 색인). |
| A10 | 무료 가치 카운터로 업그레이드 유도 | 부분 | P1 | S | 없음 | `usage-summary`의 AI 요약 월 3회 잔여를 노출해 결제 전 가치 증명(구독 강매 아닌 자연 유도). |

## 2. 재방문·리텐션 (Retention / Habit)

워치리스트 실거래 알림 cron·웹푸시·인앱함은 있으나, **저장검색 알림이 발송되지 않고**(러너 부재) **포인트가 이중 시스템**이라 정합성이 위험합니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| B1 | 저장검색 알림 러너 완성 | 부분 | P0 | M | 없음 | `saved_searches`의 `alert_enabled`/`last_checked_at`/`last_match_count`가 스키마·UI만 있고 도는 cron이 없음 — `price-alerts` cron 패턴으로 러너 신설. |
| B2 | 포인트 시스템 단일화 | 부분 | P0 | M | 없음 | `point_ledger`(캡·만료 정본)와 `user_points`/`user_attendance`가 이중 적립(출석 라우트가 둘 다 호출) — 원장 단일화로 잔액 불일치 제거. |
| B3 | 게이미피케이션 서버 지속화 | 부분 | P1 | L | 없음 | `lib/gamification`이 localStorage 전용(XP·레벨·뱃지) — 서버/`point_ledger` 연동으로 크로스디바이스·되돌리기 방지. |
| B4 | 관심단지 실거래 웹푸시 | 부분 | P1 | S | 없음 | 워치리스트 price-alert가 inbox+SMS만 발송 — 이미 있는 VAPID/`sw.js`/`push_subscriptions`로 푸시 채널 추가. |
| B5 | 신규매물 알림 다채널화 | 부분 | P1 | S | 없음 | `notifyNewListingSubscribers`가 inbox-only — Resend 이메일·웹푸시 인프라 재사용으로 도달률 향상. |
| B6 | 출석 스트릭 리텐션 루프 | 부분 | P1 | S | 없음 | `user_attendance` streak를 홈 위젯+리마인드로 노출(B2 단일화와 함께). |
| B7 | 주간 개인화 다이제스트 | 부분 | P1 | M | 없음 | 워치리스트 단지의 실거래·시세 변동을 기존 `digest` 인프라로 주 1회 이메일 발송. |
| B8 | 최근 본 단지 서버 동기화 | 부분 | P2 | S | 없음 | localStorage `nz_recent_complexes`(구현됨)를 로그인 시 서버 저장해 재방문 첫 화면 개인화. |
| B9 | 이탈 위험 세그먼트 리마인드 | 없음 | P2 | M | 없음 | `platform_activity_events`로 N일 미방문 사용자에게 미완 임장노트·관심단지 알림. |
| B10 | 인앱 알림 딥링크·읽음 정합 | 부분 | P1 | S | 없음 | `user_inbox_notifications`의 `actionUrl` 정합성(전문가 `/me?tab=expert` 데드링크 수정) + 읽음 배지. |

## 3. 지도 고도화 (Map UX / Features)

네이버 NCP 기반에 서버 그리드 클러스터(가격 알약)·매물·정비사업 레이어·통근 필터는 있으나, **POI가 하드코딩 샘플**이고 실거래는 지도에 월평균 라벨로만 노출됩니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| C1 | 실데이터 시세 색상 오버레이 | 없음 | P1 | L | 없음 | 제거된 mock 히트맵 대신 `market_region_price`/`complex_transactions` 실데이터로 코로플레스, 데이터 없는 셀은 무색+"데이터 없음"(사실 우선). |
| C2 | POI 실데이터 전환 | 부분 | P1 | M | API키 | 하드코딩 지하철·학교·마트를 Kakao Local(`app/api/kakao/local/nearby`) 실시간 조회로 교체. |
| C3 | 반경·폴리곤 그리기 필터 | 없음 | P1 | M | 없음 | 지도에 반경/영역 그리기로 임장 후보 필터(현재 주소기반 통근만 존재). |
| C4 | 마커 패널에 실거래 스파크라인 | 부분 | P1 | M | 없음 | `ComplexInfoPanel`(존재)에 `market_transactions` 월별 추이 미니차트 추가. |
| C5 | 뷰포트 타일링·클러스터 성능 | 부분 | P2 | M | 없음 | grid JS 클러스터(5,000행 캡)를 서버 타일 집계로 개선해 대량 표시. |
| C6 | 학군·생활권 폴리곤 레이어 | 없음 | P2 | L | API키 | 학교 배정·행정동 경계를 VWorld/공공데이터로 오버레이. |
| C7 | 전국 시드 일반화 | 부분 | P1 | M | 없음 | `app/map/page.tsx`가 동안구 ~16개 단지만 시드 — 뷰포트 로딩으로 전국 일반화. |
| C8 | 매물·실거래 통합 범례 | 부분 | P1 | S | 없음 | listings 레이어와 실거래 라벨을 한 범례로 통합하고 "실거래 vs 호가"를 명시. |
| C9 | 통근 등시선(isochrone) | 없음 | P2 | L | API키 | 단일 통근시간(`naver-directions`)을 등시선 영역으로 확장. |
| C10 | 지도 → 단지·노트 딥링크 동선 | 부분 | P1 | S | 없음 | 마커에서 단지허브·공개노트·워치리스트 원클릭(`complexes↔apartment_complexes` name 매칭 개선 병행). |

## 4. 단지 정보 표시 (Complex / Apartment Info Depth)

단지 허브(`/complex/[id]`)는 실거래를 **텍스트 리스트**로만 보여주고 차트는 `/complex/tx`에만 있으며, Q&A·정비사업·공급은 별도 페이지로 흩어져 상세에 임베드되지 않았습니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| D1 | 단지 허브 실거래 차트 | 부분 | P0 | M | 없음 | `/complex/[id]` 텍스트 리스트를 recharts 월별 추이 차트로(`market_transactions`/`complex_transactions`), 차트는 현재 `/complex/tx`에만 존재. |
| D2 | Q&A 단지 상세 임베드 | 부분 | P1 | S | 없음 | `complex_questions`/`complex_answers`(lib/qna 존재)를 허브 탭으로 임베드(현재 `/qna` 분리). |
| D3 | 정비사업 배지·섹션 | 부분 | P1 | M | 없음 | 인근 `redevelopment_projects`(40건)를 단지 상세에 표시(현재 지도·전용 페이지만). |
| D4 | 입주물량 캘린더 연동 | 부분 | P1 | M | 없음 | `apartment_supply`(675건) 인근 공급을 "향후 공급" 블록으로 상세에 노출. |
| D5 | 면적대별 시세표 허브 승격 | 부분 | P1 | S | 없음 | `/complex/tx`의 면적대별 시세 표를 허브 요약으로 승격. |
| D6 | 지역 대비 상대 위치 | 부분 | P1 | M | 없음 | `market_region_price`/`market_region_series`로 "이 동네 대비" 상대 지표 표시. |
| D7 | 두 데이터 모델 정합 | 완료(설계 수정) | P0 | L | 없음 | **원안은 실행 불가였다.** `public.complexes` 테이블은 존재하지 않고(단지 신원은 `lib/complex/complex-store.ts`가 `encodeComplexId(region, name)`로 `market_transactions`에서 파생), `apartment_complexes`에는 `kapt_code`도 좌표 컬럼도 없다(8컬럼, kaptCode는 `metadata` JSON 안). 즉 "`kapt_code`/좌표로 매핑"할 대상 자체가 없다. 실제로 한 일: `apartment_complexes` 조회를 `source_key='k-apt-basic'`(실 단지 대장 21,658행)으로 스코프해 별칭·식별자 17,704행이 단지처럼 검색되던 것을 차단하고, `search_complexes` RPC에 지역 검증을 넣었다. 잔여 위험은 F4가 계측한다 — 같은 구 동명 단지 152군(주소가 같은 군은 0)이 이름 기반 신원 때문에 한 페이지로 합쳐진다. |
| D8 | 매물 탭 실연동 | 완료 | P1 | S | 없음 | 허브 "매물" 탭이 `hub-client.tsx`에서 실제 `listings`를 렌더한다. `public.listings`는 현재 0행이라 화면은 "등록된 실매물이 아직 없어요 · 지도에서 주변 매물을 확인해 보세요" 빈 상태를 보여준다 — 숫자를 지어내지 않는다. |
| D9 | 거주민 후기 신뢰 카드 | 완료(범위 조정) | P2 | S | 없음 | 요약 카드(전체 평균 + 소음·주차·관리·이웃·교통 항목별 평균)와 실거주/방문/거주시기 배지는 `ComplexReviews.tsx`에 있었는데 **정렬이 도움돼요 수만 봤다** — 배지를 붙여 놓고 순서로는 무시해 신뢰 신호가 장식이었다. 실거주 > 방문 > 도움돼요 > 최신 순으로 바꾸고(메모리 폴백 비교자까지 동일), 그 사실을 섹션 안내 문구에 적었다. **"상세 상단"으로 올리지는 않았다** — `complex_reviews` 0행 상태에서 빈 카드를 실거래 위에 두면 사실이 있는 자리를 사실 없는 카드가 차지한다. 후기가 쌓이면 승격한다. |
| D10 | 안전·실사 지표 사실화 | 없음 | P1 | M | API키 | 현재 "—" 하드코딩 안전 카드를 공공 데이터(치안·침수 등) 연동 또는 "예시" 라벨로(사실 우선). |

## 5. 결제·구독 (Payments / Subscription)

토스·카카오페이 결제 라우트와 엔타이틀먼트(`plan_entitlements` 39행)는 이미 있고 프로덕션은 `TOSS_SECRET_KEY` 없이 503을 반환합니다. **아래는 전부 시크릿 키가 필요 없는 UI/플로우/엔타이틀먼트 스캐폴딩** — 실제 승인·정산은 소유자가 키를 넣은 뒤 기존 라우트가 처리합니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| E1 | 구독 관리 페이지(/my) | 없음 | P0 | M | 없음 | 현재 플랜·갱신일(`membership_expires_at`)·해지·영수증 링크 UI 스캐폴딩(승인 로직은 기존 confirm 라우트 재사용). |
| E2 | 엔타이틀먼트 게이팅 UI 일관화 | 부분 | P0 | M | 없음 | `plan_entitlements`·`access-gate`로 잠금 기능에 통일된 업그레이드 모달(현재 로직만 존재). |
| E3 | 결제 이탈 복구 배너 | 부분 | P1 | S | 없음 | `payment_orders` `status=requested` 15분 재사용 로직(있음)을 "결제 이어서" 배너로 표면화. |
| E4 | 무료체험 UX | 부분 | P1 | M | 없음 | `feature-trial` 로직(있음)을 플랜카드·게이트에 "7일 체험" 플로우로 노출(결제 없이 trial 부여). |
| E5 | 현금영수증·세금계산서 신청 UI | 없음 | P1 | S | 없음 | `payment/success`에 발급 신청 폼 스캐폴딩(PG 승인 후 처리, UI 자체는 키 불필요). |
| E6 | 사용량 기반 플랜 추천 | 부분 | P1 | M | 없음 | `usage-summary`(AI 요약·알림 지역 사용량)로 "당신에게 맞는 플랜" 배지·비교. |
| E7 | 기간별/연간 토글 정합 | 부분 | P1 | S | 없음 | `billing-periods` 단일 출처(있음)를 체크아웃까지 일관 전달(monthly/annual 매핑 정리). |
| E8 | 그룹패스·단품 상품 노출 | 부분 | P2 | M | 없음 | `group-passes`/`iap-products`를 단품 구매 카드로 노출(스캐폴딩). |
| E9 | 결제수단 선택 화면 | 부분 | P1 | S | 없음 | 토스/카카오페이/토스페이 선택 UI(현재 `PlanCheckoutButton`는 순차 폴백), 승인은 결제창에서. |
| E10 | 갱신·해지 예고 알림 | 없음 | P1 | M | 없음 | `membership_expires_at` 기반 D-7 갱신 리마인드(inbox/email), 실제 결제는 사용자 동작. |

## 6. 데이터 관리 (Pipeline / ETL / Quality / Admin Tooling)

실거래·시세 cron과 4종 업로드 엔드포인트(molit-csv·kb-upload·archive·reb-catalog)는 있으나 **모두 curl 전용(UI 없음)**이고, `app/admin/quality`는 100% 하드코딩 목업, 코어 65k/42k 테이블은 저장소 밖(Flask)에서 적재돼 신선도 신호가 없습니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| F1 | 데이터 관리 어드민 페이지 신설 | 완료 | P0 | M | 없음 | `AdminNav` "데이터 · 지오코딩" 탭 + `/admin/data`. curl 전용이던 molit-csv·kb-upload·archive(`UploadPanel`)·reb-catalog(`RebCatalogPanel`) 연결 완료. `CronRunPanel` 은 크론 16개를 **수집/집계/알림** 3그룹으로 나누고, 각 버튼에 `etl.yml` 기준 실제 주기를 배지로 찍는다 — 스케줄러에 연결되지 않은 라우트는 "수동 전용"으로 드러나 "돌고 있겠지"라는 추측이 화면에서 사라진다. 실제로 사용자에게 발송되는 3개(price-alerts·saved-search·attendance)는 빨간 "발송" 배지 + 2단 확인, 이탈 리마인드는 버튼에서 `?dry=1` 고정. 알림 러너는 fail-soft(HTTP 200 + `ok:false`)라 200만 보고 성공으로 칠하지 않고 `ok:false` 를 실패로 표시한다. `attendance-reminders` 만 관리자 세션 인가가 빠져 이 패널에서 403 이 나던 것도 함께 고쳤다. |
| F2 | 신선도 대시보드 | 완료 | P0 | M | 없음 | `lib/admin/data-freshness.ts`가 11개 데이터셋별로 (1)데이터 기준 시점 (2)마지막 쓰기 (3)경과일 (4)행 수를 실집계한다. 여기서 화면이 하던 두 가지 거짓말을 걷어냈다 — **①** "마지막 적재"로 `max(updated_at)`을 읽었는데 `set_updated_at` 트리거 때문에 수집과 무관한 UPDATE 한 방에도 오늘로 올라갔다(실제 2026-07-25: 진짜 수집 02:59, 화면 표시 04:26 = is_cancelled 백필 402행. 그 시각 들어온 실거래는 0건). 신규 행 시각(`created_at`)을 판정 기준으로 쓰고 쓰기 시각은 따로 병기한다. **②** 부분 실패를 표현할 방법이 없어 "2,096행 적재 + 시군구 16곳 중 13곳 실패"를 빨간 "오류" 한 칸으로 뭉갰다. 판정 규칙은 `lib/market/ingest-outcome.ts` 한 곳에 모아 /admin·/api/health와 같은 말을 하게 했다. |
| F3 | 인제스트 로깅 계측 확대 | 완료 | P0 | S | 없음 | 성공 로그는 molit·apt-master·ecos·onbid·redev·geocode·court-auction까지 확대 완료. 추가로 **실패 경로**를 계측했다 — 이전에는 크론이 예외로 죽으면 `market_ingest_log`에 아무것도 남지 않아 "실패했다"와 "아예 안 돌았다"가 구분되지 않았다. 이제 molit·ecos·onbid·redevelopment·court-auction·reb·kosis·kb 8개 라우트가 예외를 잡아 `status:"error"`로 기록한다. 저장 전 `ingestErrorMessage()`가 오류 메시지의 `serviceKey`·`apiKey` 등 인증키 쿼리 파라미터를 `***`로 지우고 400자로 자른다(적재 로그는 어드민 화면에 그대로 표시되므로). |
| F4 | 데이터 품질 검사 | 완료 | P0 | M | 없음 | 하드코딩 목업은 앞선 작업에서 이미 제거돼 있어, 남은 일은 **검사 그 자체**였다. 측정은 `public.data_quality_report()`(security definer, anon/authenticated EXECUTE 회수) 한 번의 왕복으로 — PostgREST가 GROUP BY를 못 해 중복 검사를 클라이언트에서 흉내 낼 수 없고, 20여 검사를 count 쿼리로 쪼개면 왕복이 20번이다. 판정·임계값·문구는 `lib/admin/data-quality.ts` 한 곳에만 둔다(SQL은 "몇 건인가"만 답한다). **2026-07-25 실측 결과:** null·범위·중복 검사 20개는 **전부 0** — 이건 발견이 아니라 회귀 감시라 화면에서 한 줄로 접었다(스무 개를 초록으로 늘어놓으면 "스무 가지를 잡았다"로 읽히는데 하나도 안 잡힌 것이다). **결함 2:** 전세 표기가 `monthly_rent_krw` NULL 24,182행 / 0원 497행으로 갈려 어느 조건으로 걸러도 한쪽이 조용히 샌다. 단지 대장 `lawd_cd` 4,882행이 NULL이 아닌 **빈 문자열**이라 `is not null` 가드를 통과하면서 지역 필터에서는 사라진다. **확인 필요 2:** 월세 행 평단가 22,674행이 보증금÷평(월세 미반영, `molit-transactions.ts:129`)이지만 `complex-transactions.ts`의 `toRecord()`가 먼저 버려 지금 화면엔 안 나온다 — 결함이라 적으면 거짓말이라 note. 동명 단지 152군(D7 참조). **정상 3:** 주소 중복 224군은 표본 확인 결과 kaptCode가 다른 별개 단지가 한 도로명 주소를 쓰는 경우였다(플루리움1/2/3/45단지, 국화동성·라이프·신동아·우성·한신 등) — 결함으로 올렸다면 매일 224건짜리 거짓 경보가 떴다. 평단가 상한도 같은 이유로 실측에 맞췄다(최대 3.1억/평 = 에테르노청담·나인원한남 실거래). |
| F5 | 이상치 탐지 | 없음 | P1 | M | 없음 | 실거래 가격 이상·행수 급감·스키마 드리프트 감지(listings의 ±40% 이상치 로직 재사용). |
| F6 | 미스케줄 cron 연결 | 부분 | P1 | S | API키 | 스케줄러는 `vercel.json` 이 아니라 `.github/workflows/etl.yml` 이다(Vercel 크론은 이 플랜에서 실행되지 않는 것을 2026-07-25 로그로 확인 — `vercel.json` 의 crons 13개는 삭제). `ecos-sync`·`onbid-sync` 는 etl.yml 에 연결 완료(키 없으면 skipped). **`vercel.json` 에만 있어 한 번도 돌지 않던 `market-aggregates-refresh`·`price-alerts`·`saved-search-alerts`·`reengage-reminders` 4개를 etl.yml 로 이관**(집계는 적재 직후, 알림은 하루 1회 `alerts` 잡, 이탈 리마인드는 화요일만). 남은 것은 `codef-sync` — 대상 단지 목록이 없어 지금 호출해도 `skipped` 라 스케줄을 붙이지 않았다(키 + 목록 필요). |
| F7 | 중복 단지 병합 도구 | 없음 | P1 | L | 없음 | `complexes`/`apartment_complexes` 중복을 관리자 병합 UI로(D7 정합과 연계). |
| F8 | 코어 테이블 자체 파이프라인화 | 없음 | P1 | L | API키 | 65k `market_transactions`·42k `apartment_complexes`의 외부(Flask) 적재를 in-repo cron/업로드로 흡수해 재현성 확보. |
| F9 | 스키마 마이그레이션 정본화 | 완료 | P0 | M | 없음 | 허구였던 `supabase/schema.sql`(선언 10개 중 8개가 운영 DB에 미존재, 실 133개 중 123개 누락) 삭제. 실측 인벤토리 `supabase/SCHEMA.md`(133테이블/1,529컬럼) + `supabase/migrations/` 규약·96건 이력 README + `db:schema:doc`·`db:migrations:export` 스크립트로 대체. |
| F10 | 법원경매 실 어댑터 | 부분 | P2 | M | API키 | `court_auctions` 소스가 미구현 스텁(skipped, is_sample만) — 실 어댑터 구현. |

## 7. 홈페이지 품질 (Performance / A11y / SEO / Reliability)

**(2026-07 갱신)** CSP·이미지 최적화·PWA·sitemap(단지 2,000+지역 61)·JSON-LD는 원래 견고했고, 진단 당시의 두 구멍 중 **홈·관리자 목업은 제거**(G1)·**RUM은 계측 완료**(G2)됐습니다. 남은 것은 에러 모니터링 SDK 연결(G3)뿐이며 이는 Sentry DSN이 있어야 합니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| G1 | 홈·관리자 목업 사실화 | 완료 | P0 | S | 없음 | `app/page.tsx`의 `PIPELINE`/`CONTENTS`, `app/admin/page.tsx`의 `PENDING_FALLBACK` **삭제**(레포 전체 검색 시 잔존 0건). 홈은 `loadNewHomeData()`·`getBaseRate()`·`getMarketFreshnessDateLabel()`·`getWeeklyDigest()` 실데이터로 그리고, 데이터가 없으면 `EmptyState`로 "0건"과 "조회 실패"를 구분해 표시한다. "예시" 라벨로 남기는 대신 지운 이유: 홈 상단의 파이프라인 카드는 실제 처리 현황처럼 읽히는 자리라 라벨을 붙여도 오해를 못 막는다. 지금 남아 있는 `MODERATION_PIPELINE`(`lib/admin/moderation-policy.ts`)·`EXPERT_VERIFICATION_PIPELINE`(`lib/experts/verification-policy.ts`)은 목업이 아니라 **실제 심사 단계 정의**이며 정책 안내 페이지에서만 쓴다. |
| G2 | Web Vitals RUM 계측 | 완료 | P1 | S | 없음 | `app/components/WebVitalsReporter.tsx`(`next/web-vitals`의 `useReportWebVitals`) → `POST /api/metrics/web-vitals` → `web_vitals` 테이블. `app/layout.tsx:79`에 마운트돼 모든 라우트에서 수집된다. 외부 SDK·키가 필요 없어 Vercel Speed Insights 대신 자체 수집을 택했다. 라우트는 metric 화이트리스트·숫자 유효성으로 쓰레기 값을 막고, **테이블이 아직 없으면 `{ok:true, stored:false, reason:"table_missing"}`로 정상 응답**한다 — 계측 실패가 사용자 페이지의 에러가 되면 안 되기 때문. 서비스 키가 없는 로컬은 로그만 남긴다. |
| G3 | 에러 모니터링 설치 | 부분 | P1 | S | API키 | `lib/monitoring/capture`는 Sentry-ready이나 SDK 미설치 — DSN 연결. |
| G4 | 접근성 표준화 + axe CI | 완료 | P1 | M | 없음 | `tests/e2e/a11y.spec.ts` 게이트 신설(7개 공개 라우트 + 모바일 홈, serious·critical 0건). axe 가 잡은 대비 위반 161건의 원인은 토큰 2개(`--text-2` `--text-3`)와 하드코딩 색 2종(`#adb5bd`·`#c07a3a`)이었고, 토큰 계층에서 고쳐 33개 파일이 함께 해결됨. 하단 탭바 비활성 라벨 3.03:1 → 4.83:1. 예외는 네이버 로그인 버튼(브랜드 규격) 하나뿐이며 색 조합으로 좁게 걸고 매 실행 로그로 남긴다. 게이트가 "측정을 못 해서" 초록이 되는 것을 막는 `assertStylesLoaded` 가드 포함. |
| G5 | 공개 라우트 캐시 전략 | 부분 | P1 | M | 없음 | 전역 `Cache-Control: no-store`(전부 동적)를 공개 정적 라우트에 `s-maxage`/ISR 적용해 TTFB 개선. |
| G6 | 프로그래매틱 SEO 메타 강화 | 부분 | P1 | M | 없음 | 단지·지역 랜딩에 `lib/seo`(alternates·jsonld) 확장, sitemap 인덱스 분할 대비. |
| G7 | 이미지·폰트 최적화 감사 | 완료 | P2 | S | 없음 | Pretendard CDN `preconnect`(crossOrigin 포함 — 없으면 연결이 재사용되지 않음) 추가로 렌더 블로킹 stylesheet 의 DNS·TCP·TLS 왕복을 HTML 파싱과 겹치게 함. PWA 아이콘 SVG → PNG 래스터화(`npm run icons:png`) — Safari 는 `apple-touch-icon` 으로 SVG 를 받지 않아 iOS 홈 화면에 아이콘 대신 페이지 축소판이 박히고 있었다(조용히 실패). |
| G8 | 성능 예산 CI | 완료 | P2 | M | 없음 | `npm run check:perf-budget` — 라우트별 First Load JS 예산 게이트(공유 청크 115KB·라우트 190KB). 현재 공유 100KB, 최대 176.9KB(`/reset-password`). `npm run check:cache-policy` 로 G5 캐시 정책이 실제 prerender 로 반영됐는지 31건 대조. |
| G9 | PWA·오프라인 완성도 | 완료 | P2 | M | 없음 | `sw.js` 네트워크 우선 + 이동(navigate) 실패 시에만 `/offline` 폴백(시세·실거래는 절대 캐시하지 않음 — 오래된 숫자를 지금 값처럼 보여주는 게 안 보여주는 것보다 나쁘다). `/offline` 라우트·PNG 아이콘·manifest 정합. 설치 프롬프트 `app/components/InstallPrompt.tsx` 신설: 브라우저가 `beforeinstallprompt` 를 보낼 때만 노출, 30일 재노출 억제, standalone 감지, 탭바 높이 실측 배치. **미구현(사실): iOS Safari** — `beforeinstallprompt` 미구현 브라우저라 배너가 뜨지 않는다. UA 판별 안내 UI 는 실기기 검증이 불가능해 넣지 않았다(틀린 안내 > 없는 안내). 회귀 테스트 `tests/e2e/install-prompt.spec.ts` 7건. |
| G10 | 빈·에러 상태 컴포넌트 통일 | 완료 | P1 | S | 없음 | `EmptyState`/`ErrorState`에 light·admin 톤 도입, `app/error.tsx`·`app/global-error.tsx` 신설(+`/api/monitoring/client-error` 경유 캡처). `/notes/[id]` 허구 노트(MOCK_VIEW)·운영 대시보드 목업(가짜 신고·초록불 ETL·가짜 전문가 심사) 제거 → "0건"과 "조회 실패"를 구분해 표시. |

## 8. 광고·수익화 (Ads / Monetization Beyond Subscription)

AdSense 정책 모듈(`lib/ads/adsense-policy.ts`)은 완비돼 있고, `listings.boost_until`은 읽기·정렬에만 쓰이며 **쓰기 경로가 없습니다**(포인트 카탈로그 `listing_boost_7d`는 미연결).

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| H1 | AdSense 슬롯 활성화 배선 | 부분 | P1 | S | 광고계정 | 정책·제외경로·삽입규칙(홈 6번째/커뮤니티 8번째)은 완비 — `ca-pub-` 연결 시 렌더. |
| H2 | 매물 부스트 상품 배선 | 완료 | P0 | S | 없음 | 부재하던 라이터를 `app/api/points/spend/route.ts`에 신설 — `.from("listings").update({ boost_until })`(:99). **순서가 핵심**: 효과(부스트)를 먼저 적용하고 성공했을 때만 포인트를 차감한다. 반대로 하면 차감은 됐는데 노출은 안 되는, 사용자가 증명할 수 없는 손해가 남는다. 대상은 본인 소유 **승인된** 매물로 제한하고, 없으면 400 + "상단 노출할 승인된 매물이 없어요"로 안내한다(잔액도 함께 반환). 기간은 카탈로그의 `durationDays ?? 7`. |
| H3 | 자체 하우스광고 | 없음 | P1 | S | 없음 | 구독·전문가 상담 업셀을 광고 슬롯에 자체 배너로(외부 계정 불필요). |
| H4 | 배너 CMS 어드민 | 부분 | P1 | M | 없음 | `banners` 테이블·`lib/admin/banners`에 노출기간·타겟·순위 관리 UI. |
| H5 | 스폰서 단지·지역 상품 | 없음 | P2 | M | 없음 | 중개사·시행사 대상 지역 상단 노출(사실/"광고" 라벨 명시 필수). |
| H6 | 전문가 리드 매칭 수수료 | 부분 | P2 | M | 없음 | `market_requests`(견적 리드) 매칭 수수료화(`consultation_fee` 스키마 존재). |
| H7 | 리포트 판매 정산 실현 | 부분 | P1 | M | 없음 | creator sales(수수료 20%/15%)의 "정산 준비 중"을 실 정산 리포트로. |
| H8 | 광고 비노출 정책 준수 검증 | 완료 | P2 | S | 광고계정 | 검증 결과 **제외 목록에 실재하지 않는 라우트가 들어 있었다** — `"/me"`. 매칭이 `path === prefix \|\| startsWith(prefix + "/")`라 `/messages`를 오탐하지는 않았지만, 그 항목은 한 건도 걸리지 않았고 정작 결제·포인트·받은문의가 보이는 실제 개인 허브 `/my`에는 광고가 붙는 상태였다. `"/me"` → `"/my"`로 교정하고 `"/subscription"`을 추가. 목록이 "있다"는 것과 "맞는 경로를 가리킨다"는 것은 다르다는 게 이 항목의 교훈. |
| H9 | 제휴(affiliate) 링크 | 없음 | P2 | M | API키 | 대출·이사·인테리어 제휴 CTA를 계산기·단지 상세에 배치. |
| H10 | 프리미엄 데이터 페이월 | 부분 | P1 | M | 없음 | 심화 실거래·리포트를 `plan_entitlements` 게이트 뒤로(구독 전환 촉진). |

## 9. 공인중개사 등록매물 관리센터 (Broker + Admin)

**(2026-07 갱신)** 최초 진단이던 세 구멍 — 소유확인 증빙이 inbox로만 가고 `owner_verifications`에 저장되지 않던 것(I1), 편집/삭제 API 부재(I2), 문의 리드 캡처 부재(I4) — 은 모두 메워졌습니다. 남은 것은 대량 등록(I6)과 중복·이상 매물의 **중개사 쪽** 표면화(I7·I8), 자격 온보딩 통합(I9)입니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| I1 | 소유확인 심사 큐 배선 | 완료 | P0 | M | 없음 | `lib/listings/owner-verification.ts` 신설 — 신청을 `owner_verifications`에 적재하고 심사 결과를 되돌려 쓴다. 승인 라우트 `app/api/admin/owner-verifications`는 **심사 이력(심사자·시각·메모)을 남긴 뒤에만** 승인 처리한다. 이전 구조가 위험했던 이유는 blind 승인 그 자체보다, 증빙 없이 "소유확인 완료" 배지가 붙어 **사실처럼 보였다**는 점이다. `app/api/admin/listings/route.ts:45`의 경로로 승인할 때도 근거 없음(증빙 심사 없음)을 이력에 명시한다. |
| I2 | 매물 수정/삭제 API | 완료 | P0 | M | 없음 | `app/api/listings/[id]` — `PATCH`(편집 가능 필드 갱신)·`DELETE`(소프트 삭제 `deleted_at`). 하드 삭제하지 않는 이유: 문의·심사 이력이 매달린 행을 지우면 분쟁 시 되짚을 근거가 사라진다. **승인·반려건을 편집하면 재검수 pending으로 되돌린다** — 안 그러면 승인받은 뒤 가격을 바꿔치기하는 우회로가 열린다. 소유권 강제는 라우트가 아니라 store(`updateListing`/`deleteListing`)에서 한다. |
| I3 | 중개사 대시보드 분석 | 완료 | P1 | M | 없음 | `/my/listings` 상단에 실집계 3칸 — 노출중 매물 / 총 조회(`viewCount` 합) / 받은 문의(`getOwnerInquiryStats`, 미읽음 배지 + `/my/leads` 링크). 매물이 0건이면 카드 자체를 렌더하지 않는다(0으로 채운 대시보드는 "집계가 안 되는 것"과 구분되지 않는다). |
| I4 | 매물 문의·리드 캡처 | 완료 | P1 | M | 없음 | `POST /api/listings/[id]/inquire` + `lib/listings/inquiries.ts` + 수신함 `/my/leads`. 로그인 필수·승인 매물만·본인 매물엔 문의 불가·시간당 8건 제한. 문의자는 닉네임으로 표시하고 없으면 이메일 로컬부를 마스킹한다 — **원본 이메일은 노출하지 않는다**(연락처는 문의자가 `contact`에 직접 적은 것만 전달). |
| I5 | 부스트 셀프서비스 | 완료 | P1 | M | 없음 | `POST /api/listings/[id]/boost` — 소유자 본인이 포인트(`listing_boost_7d`, 500P)로 7일 상단 노출을 직접 구매. 결제가 아닌 포인트 경제라 **키 의존이 없다**. 잔액 부족은 402. H2(포인트 상점 경로)와 같은 효과를 매물 화면에서 바로 쓰게 한 것. |
| I6 | 대량 등록(CSV) | 없음 | P2 | M | 없음 | 중개사용 다건 업로드(molit-csv 업로더 패턴 재사용). |
| I7 | 중복·이상 매물 관리 UI | 부분 | P1 | S | 없음 | `is_duplicate`/`flag_reason`(±40%)·`report_count` 자동감지 결과를 중개사·관리자에 표면화. |
| I8 | 자동숨김·복구 워크플로 | 부분 | P1 | M | 없음 | `report_count>=3` 자동숨김(`is_hidden`)에 이의신청·복구 흐름 추가. |
| I9 | 중개사 자격 자가검증 온보딩 | 부분 | P1 | M | 없음 | `expert_profiles.broker_registration_no`를 등록센터 온보딩에 통합(현재 `/partners` 폼만). |
| I10 | 매물 신선도·자동 마감 제안 | 완료 | P2 | S | 없음 | `lib/listings/staleness.ts` 신설 + 크론 `app/api/cron/listing-stale-reminders`. 2단계 — 21일(`LISTING_STALE_DAYS`) 끌어올리기 안내, 60일(`LISTING_CLOSE_SUGGEST_DAYS`) 마감 **제안**. 자동 마감은 하지 않는다: 실제로 거래 중인 매물을 시스템이 내리면 중개사 손해를 되돌릴 방법이 없다. 중복 발송 방지는 `stale_notice_stage`로, **단계가 올라갈 때만** 보낸다(`< 2` 필터, 스캔 상한 500). 기록 순서도 의도적 — 알림이 **성공한** 소유자의 매물만 `stale_notified_at`/`stale_notice_stage`를 갱신해, 발송 실패가 "보낸 것"으로 기록되지 않는다. 소유자별로 묶어 한 통에 합산(`N건은 21일 넘게…`). 갱신(`refresh`) 시 `stale_notice_stage: 0` 리셋 — 안 하면 60일 뒤 다시 낡았을 때 1단계를 건너뛴다. 스케줄은 Vercel 크론이 아니라 `.github/workflows/etl.yml`의 `alerts` 잡(:129). 사용자 쪽 짝은 `ListingManageActions.tsx`의 `confirmSold` 2단계 버튼(브라우저 `confirm()` 미사용). |

## 10. 전문가 운영 페이지 + 관리자 (Expert Ops + Admin)

**(2026-07 갱신)** 최초 진단의 핵심이던 단절 — 인테이크(`expert_verification_requests`)와 공개 프로필(`expert_profiles`)이 이어지지 않아 승인돼도 검증 전문가가 되지 않던 문제 — 는 J1 브리지로 해소됐고, 목업이던 관리자 심사 화면은 J2에서 실 대기열로 교체됐습니다. `markExpertVerified`/`createExpert`는 더 이상 데드코드가 아닙니다. 남은 것은 전문가 **본인**이 쓰는 운영 콘솔(J3)과 결제·정산(J5), 자격 자동 대조(J6, API키)입니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| J1 | 전문가 인증 승인 브리지 | 완료 | P0 | M | 없음 | `lib/experts/verification-store.ts`의 `approveExpertVerification()`이 단절을 잇는다 — ① `expert_verification_requests` 승인 처리(+`next_revalidation_at`), ② `getExpertByOwnerEmail`로 공개 프로필 **find-or-create**(`createExpert`, :344), ③ `markExpertVerified`(:364)로 인증 표시(`broker_registration_no`·심사 메모·재검증일). 데드코드였던 두 함수가 이 경로로 살아났다. find-or-create인 이유: 이미 프로필이 있는 신청자를 재승인할 때 새로 만들면 공개 프로필이 둘로 갈라진다. 프로필 생성 실패는 `{ok:false}`로 되돌려 "승인됐는데 프로필이 없는" 상태를 만들지 않는다. |
| J2 | 관리자 전문가 심사 큐(실 DB) | 완료 | P0 | M | 없음 | 목업 "전문가 승인/중개사 인증" 제거 → `loadPendingVerificationQueue(12)` 실 대기열 + `app/admin/quality/VerificationQueue.tsx`(`app/admin/quality/page.tsx:258`). 전문가 건은 그 자리에서 `PATCH /api/admin/experts`로 승인/반려(승인은 J1 브리지 호출), 소유확인 건은 `/admin/listings`로 연결한다. 반려는 사유 필수(빈 사유면 400) — 사유 없는 반려는 신청자가 무엇을 고쳐야 할지 모른다. 오클릭 방지 2단계이며 **브라우저 `confirm()`을 쓰지 않는다**. 관리자 게이트 `isAdminApiRequest`, 결과는 신청자 인박스 알림 + 감사로그(best-effort). |
| J3 | 전문가 운영 콘솔 | 부분 | P0 | M | 없음 | 프로필 수정(`PATCH /api/experts/[id]`)·상담 인박스(`?mode=expert`+reply)가 orphaned — 실제 UI로 배선. |
| J4 | /me?tab=expert 데드링크 해소 | 완료 | P1 | S | 없음 | 추적해 보니 `/me`를 만들어내던 곳은 세 모듈뿐이었고 **셋 다 임포터가 0**이었다 — `lib/me/hub-tabs.ts`(`meHubHref`가 `/me?tab=…` 생성), `lib/navigation/service-shortcut-links.ts`(전역 "마이" 바로가기), `lib/gamification/store.ts`(localStorage 기반 XP·미션, 서버 포인트 원장으로 대체된 구버전). `user_inbox_notifications`의 `action_url`도 실제로 조회해 확인했다 — **`/me` 링크 0건, 테이블 자체가 0행**이라 이미 발송된 알림을 구제할 리다이렉트는 필요 없었다. 그래서 `/me` 라우트를 새로 만들지 않고 **세 모듈을 삭제**했다(총 458줄). 링크만 `/my`로 고쳐 두면 아무도 안 쓰는 코드가 "고쳐진 것"처럼 남아 다음 사람이 또 배선하려 든다. 부수 효과로 H8의 광고 제외 경로 오류(`/me`)도 이때 드러났다. |
| J5 | 상담 결제·정산 스캐폴딩 | 부분 | P1 | M | 없음 | `consultation_fee`/`report_fee`가 표시용(과금 없음) — 결제 플로우·정산 리포트 UI(승인은 결제창). |
| J6 | 자격 자동 대조 | 부분 | P2 | L | API키 | `broker_registration_no`가 registry 링크 대조(수동)에 그침 — KAR/V-World 등 API 검증. |
| J7 | 사기·이상거래 운영 뷰 | 완료 | P1 | S | 없음 | 적재(`lib/experts/verification-store.ts:276`)와 조회(`lib/admin/expert-ops-metrics.ts:133`)를 잇고 `/admin/quality`에 표면화. 이벤트가 없으면 "0건"이 아니라 **적재 조건 자체를 문장으로** 보여준다(`app/admin/quality/page.tsx:334`) — 빈 표는 "아직 아무 일도 없었다"와 "수집이 안 되고 있다"를 구분해 주지 못한다. |
| J8 | 전문가 성과·랭킹 | 부분 | P1 | M | 없음 | `rating`·상담수(`expert_consultations`)·응답시간으로 디렉터리 정렬·배지. |
| J9 | 데드·버그 코드 정리 | 완료 | P1 | S | 없음 | ① `loadExpertOpsSummary`의 존재하지 않는 `experts` 테이블 조회 → `expert_profiles`로 교정(레포 전체에 `from("experts")` 잔존 0건). 이 버그가 위험했던 이유는 조회가 조용히 빈 배열을 돌려줘 **관리자 화면이 "0건"으로 정상처럼 보였다**는 점이다. ② 데드코드였던 `markExpertVerified`/`createExpert`는 J1 브리지로 살아났고, `loadExpertOpsSummary`는 `/admin`·`/admin/quality` 양쪽에서 실제로 호출된다. ③ 임포터 0인 모듈 3개(458줄) 삭제 — J4 참조. |
| J10 | 전문가 SLA·재검증 대시보드 | 부분 | P2 | M | 없음 | `verification-policy`의 SLA·사후 재검증 주기를 운영 대시보드로. |

---

## 권장 착수 순서 (Wave 1 — 전부 키의존 = 없음, 15선)

이미 존재하나 끊겨 있는 배선·사실화 위주. 시크릿 키 없이 즉시 착수 가능하며 레버리지 순으로 정렬했습니다.

1. **G1 — 홈·관리자 목업 사실화**: 사실 우선 원칙의 즉시 실행. `app/page.tsx`·`admin/page.tsx` 하드코딩을 실데이터/"예시"로. (P0·S)
2. **F3 — 인제스트 로깅 계측 확대**: molit·apt·ecos·onbid·redev에 `logIngest` 추가 → 신선도 라벨 정확화. (P0·S)
3. **F2 — 신선도 대시보드**: `market_ingest_log`+테이블 최신일자로 소스별 as-of 표시. (P0·M)
4. **F1 — 데이터 관리 어드민 페이지**: curl 전용 4개 업로드 엔드포인트에 UI 연결. (P0·M)
5. **F9 — 스키마 마이그레이션 정본화**: 원격 전용 테이블 정의·드리프트 해소(이후 모든 작업의 토대). (P0·M)
6. **B1 — 저장검색 알림 러너**: 스키마·UI만 있고 안 도는 알림을 cron으로 완성. (P0·M)
7. **B2 — 포인트 시스템 단일화**: 이중 적립·잔액 불일치 제거. (P0·M)
8. **D1 — 단지 허브 실거래 차트**: 텍스트 리스트를 실거래 추이 차트로. (P0·M)
9. **H2 — 매물 부스트 라이터 배선**: `boost_until` 쓰기 연결로 첫 수익화 루프 완성. (P0·S)
10. **I1 — 소유확인 심사 큐**: 증빙을 `owner_verifications`에 저장하고 blind 승인 제거. (P0·M)
11. **I2 — 매물 수정/삭제 API**: 관리센터의 기본 CRUD 공백 메우기. (P0·M)
12. **J1 — 전문가 인증 승인 브리지**: 인테이크→프로필 단절 해소(데드코드 활성화). (P0·M)
13. **J2 — 관리자 전문가 심사 큐(실 DB)**: 목업 심사 화면을 실 승인/반려로. (P0·M)
14. **J3 — 전문가 운영 콘솔**: orphaned된 프로필 수정·상담 인박스 UI 배선. (P0·M)
15. **E1 — 구독 관리 페이지**: 플랜·갱신·해지·영수증 UI 스캐폴딩(키 불필요). (P0·M)

> Wave 1 완료 후: E2·E4(결제 스캐폴딩), B4·B5(다채널 알림), C1(실데이터 오버레이), D2~D4(단지 심화)로 Wave 2를 이어가고, 키 의존 항목(H1 광고계정, J6·C6·C9 API키, F8 코어 파이프라인)은 Wave 4로 미룹니다.
