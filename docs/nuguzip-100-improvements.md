# nuguzip 제품·엔지니어링 개선 제안 100선

> **전제 — "사실 우선(facts-first)".** 이 문서의 모든 제안은 **조작·미검증 수치를 사실처럼 노출하지 않는다**는 원칙 위에서 설계했습니다. 실데이터(`market_transactions` 65,469행, `apartment_complexes` 42,562행, `market_region_*` 시세, `redevelopment_projects`, `apartment_supply` 등)를 쓰거나, 불가피하면 명확히 "예시" 라벨을 붙입니다. 이미 지도에서 구(區) 단위 목업 히트맵을 사실 우선 원칙에 따라 제거한 이력이 있고, 홈·관리자 대시보드 곳곳에 남아 있는 하드코딩 목업(`app/page.tsx`의 `PIPELINE`/`CONTENTS`, `app/admin/quality/page.tsx` 전체 등)이 최우선 정리 대상입니다. 또한 이 백엔드는 **이미 상당 부분 구축**되어 있습니다 — 결제(토스·카카오페이) 라우트, 구독·엔타이틀먼트, 포인트 원장, 워치리스트 알림 cron, 웹푸시(VAPID), 실거래·시세 ETL cron, 매물 심사 큐, 전문가 인증 인테이크가 모두 존재합니다. 따라서 본 제안은 **새로 만들기보다 이미 있는 자산을 배선(wiring)·완성·사실화**하는 데 무게를 둡니다. 총 **100개 항목(도메인 10개 × 10개)**.

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
| D7 | 두 데이터 모델 정합 | 부분 | P0 | L | 없음 | `complexes`↔`apartment_complexes`를 `kapt_code`/좌표로 매핑해 name-매칭 취약성 제거(허브·tx 페이지 연결). |
| D8 | 매물 탭 실연동 | 없음 | P1 | S | 없음 | 허브의 빈 "매물" 탭("소스 미연동")에 해당 단지 `listings`를 연결. |
| D9 | 거주민 후기 신뢰 카드 | 부분 | P2 | S | 없음 | `complex_reviews`의 거주·방문 인증 배지·정렬을 상세 상단 요약 카드로. |
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
| F1 | 데이터 관리 어드민 페이지 신설 | 없음 | P0 | M | 없음 | `AdminNav`에 "데이터/ETL" 탭 추가, curl 전용인 molit-csv·kb-upload·archive·reb-catalog 엔드포인트에 UI 연결. |
| F2 | 신선도 대시보드 | 부분 | P0 | M | 없음 | `market_ingest_log`+각 테이블 최신일자로 소스별 as-of·지연 표시(현재 최신 3행 패널만). |
| F3 | 인제스트 로깅 계측 확대 | 부분 | P0 | S | 없음 | molit·apt-master·ecos·onbid·redev 인제스트에 `logIngest` 추가(현재 REB/KOSIS/KB/crawl만 기록 → 신선도 라벨 부정확). |
| F4 | 데이터 품질 검사 | 없음 | P0 | M | 없음 | `app/admin/quality`의 하드코딩 목업을 `market_transactions`/`apartment_complexes` 실 null율·범위·중복 체크로 대체. |
| F5 | 이상치 탐지 | 없음 | P1 | M | 없음 | 실거래 가격 이상·행수 급감·스키마 드리프트 감지(listings의 ±40% 이상치 로직 재사용). |
| F6 | 미스케줄 cron 연결 | 부분 | P1 | S | API키 | `ecos-sync`/`onbid-sync`/`codef-sync` 라우트가 `vercel.json` crons에 없음 — 스케줄 추가(각 소스 키 필요). |
| F7 | 중복 단지 병합 도구 | 없음 | P1 | L | 없음 | `complexes`/`apartment_complexes` 중복을 관리자 병합 UI로(D7 정합과 연계). |
| F8 | 코어 테이블 자체 파이프라인화 | 없음 | P1 | L | API키 | 65k `market_transactions`·42k `apartment_complexes`의 외부(Flask) 적재를 in-repo cron/업로드로 흡수해 재현성 확보. |
| F9 | 스키마 마이그레이션 정본화 | 없음 | P0 | M | 없음 | `supabase/schema.sql`에 `listings` 등 원격 전용 테이블이 없고 migrations 디렉터리 부재 — 드리프트 해소. |
| F10 | 법원경매 실 어댑터 | 부분 | P2 | M | API키 | `court_auctions` 소스가 미구현 스텁(skipped, is_sample만) — 실 어댑터 구현. |

## 7. 홈페이지 품질 (Performance / A11y / SEO / Reliability)

CSP·이미지 최적화·PWA·sitemap(단지 2,000+지역 61)·JSON-LD는 견고하나, 홈·관리자에 **오해 소지 목업**이 남아 있고 RUM·에러 모니터링이 미설치입니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| G1 | 홈·관리자 목업 사실화 | 부분 | P0 | S | 없음 | `app/page.tsx`의 `PIPELINE`/`CONTENTS`·`admin/page.tsx` `PENDING_FALLBACK`을 실데이터 또는 "예시" 라벨로(사실 우선의 핵심). |
| G2 | Web Vitals RUM 계측 | 없음 | P1 | S | 없음 | web-vitals/Vercel Speed Insights로 LCP·INP·CLS 실사용자 수집. |
| G3 | 에러 모니터링 설치 | 부분 | P1 | S | API키 | `lib/monitoring/capture`는 Sentry-ready이나 SDK 미설치 — DSN 연결. |
| G4 | 접근성 표준화 + axe CI | 부분 | P1 | M | 없음 | `role=alert`/`aria-live`가 일부만 적용 — 폼·토스트·모달 a11y 스윕 + CI 게이트. |
| G5 | 공개 라우트 캐시 전략 | 부분 | P1 | M | 없음 | 전역 `Cache-Control: no-store`(전부 동적)를 공개 정적 라우트에 `s-maxage`/ISR 적용해 TTFB 개선. |
| G6 | 프로그래매틱 SEO 메타 강화 | 부분 | P1 | M | 없음 | 단지·지역 랜딩에 `lib/seo`(alternates·jsonld) 확장, sitemap 인덱스 분할 대비. |
| G7 | 이미지·폰트 최적화 감사 | 부분 | P2 | S | 없음 | `next/image` 미사용 지점·LCP 우선순위·Pretendard 서브셋 점검. |
| G8 | 성능 예산 CI | 없음 | P2 | M | 없음 | Lighthouse/번들 예산 CI 게이트로 회귀 방지(Playwright 이미 존재). |
| G9 | PWA·오프라인 완성도 | 부분 | P2 | M | 없음 | `sw.js` 캐시 전략·설치 프롬프트·오프라인 폴백 점검(manifest 존재). |
| G10 | 빈·에러 상태 컴포넌트 통일 | 부분 | P1 | S | 없음 | 곳곳의 DB 실패 목업 폴백을 통일된 empty/error 컴포넌트로 대체. |

## 8. 광고·수익화 (Ads / Monetization Beyond Subscription)

AdSense 정책 모듈(`lib/ads/adsense-policy.ts`)은 완비돼 있고, `listings.boost_until`은 읽기·정렬에만 쓰이며 **쓰기 경로가 없습니다**(포인트 카탈로그 `listing_boost_7d`는 미연결).

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| H1 | AdSense 슬롯 활성화 배선 | 부분 | P1 | S | 광고계정 | 정책·제외경로·삽입규칙(홈 6번째/커뮤니티 8번째)은 완비 — `ca-pub-` 연결 시 렌더. |
| H2 | 매물 부스트 상품 배선 | 부분 | P0 | S | 없음 | `listing_boost_7d`(포인트)를 `boost_until` 쓰기까지 연결(현재 읽기·정렬만, 라이터 부재). |
| H3 | 자체 하우스광고 | 없음 | P1 | S | 없음 | 구독·전문가 상담 업셀을 광고 슬롯에 자체 배너로(외부 계정 불필요). |
| H4 | 배너 CMS 어드민 | 부분 | P1 | M | 없음 | `banners` 테이블·`lib/admin/banners`에 노출기간·타겟·순위 관리 UI. |
| H5 | 스폰서 단지·지역 상품 | 없음 | P2 | M | 없음 | 중개사·시행사 대상 지역 상단 노출(사실/"광고" 라벨 명시 필수). |
| H6 | 전문가 리드 매칭 수수료 | 부분 | P2 | M | 없음 | `market_requests`(견적 리드) 매칭 수수료화(`consultation_fee` 스키마 존재). |
| H7 | 리포트 판매 정산 실현 | 부분 | P1 | M | 없음 | creator sales(수수료 20%/15%)의 "정산 준비 중"을 실 정산 리포트로. |
| H8 | 광고 비노출 정책 준수 검증 | 있음 | P2 | S | 광고계정 | 지도·결제·설정 제외경로(`ADSENSE_EXCLUDED_PATH_PREFIXES`) 검증·확장. |
| H9 | 제휴(affiliate) 링크 | 없음 | P2 | M | API키 | 대출·이사·인테리어 제휴 CTA를 계산기·단지 상세에 배치. |
| H10 | 프리미엄 데이터 페이월 | 부분 | P1 | M | 없음 | 심화 실거래·리포트를 `plan_entitlements` 게이트 뒤로(구독 전환 촉진). |

## 9. 공인중개사 등록매물 관리센터 (Broker + Admin)

`/my/listings`(중개사 gated)·`POST /api/listings`(자동 중복/이상 플래그)·관리자 심사 큐(`/admin/listings`, 실 DB)는 작동하나, **소유확인 증빙이 inbox로만 가고** `owner_verifications` 테이블에 저장되지 않으며 편집/삭제 API가 없습니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| I1 | 소유확인 심사 큐 배선 | 부분 | P0 | M | 없음 | verify 업로드 `proofUrl`을 `owner_verifications`(document_paths/status/admin_note/reviewed_by)에 저장하고 관리자 심사 큐 신설(현재 inbox-only·blind 승인). |
| I2 | 매물 수정/삭제 API | 없음 | P0 | M | 없음 | 현재 create/refresh/sold/verify만 존재 — 편집·삭제 라우트 추가(중개사 자기 매물). |
| I3 | 중개사 대시보드 분석 | 부분 | P1 | M | 없음 | `/my/listings`에 `view_count`·문의·전환(`engagement`) 통계 카드 추가. |
| I4 | 매물 문의·리드 캡처 | 없음 | P1 | M | 없음 | 상세에 문의 폼 → 중개사 inbox 리드 적재(현재 `contact` 텍스트만). |
| I5 | 부스트 셀프서비스 | 부분 | P1 | M | 없음 | I2·H2와 연계, 중개사가 포인트/결제로 `boost_until` 직접 구매. |
| I6 | 대량 등록(CSV) | 없음 | P2 | M | 없음 | 중개사용 다건 업로드(molit-csv 업로더 패턴 재사용). |
| I7 | 중복·이상 매물 관리 UI | 부분 | P1 | S | 없음 | `is_duplicate`/`flag_reason`(±40%)·`report_count` 자동감지 결과를 중개사·관리자에 표면화. |
| I8 | 자동숨김·복구 워크플로 | 부분 | P1 | M | 없음 | `report_count>=3` 자동숨김(`is_hidden`)에 이의신청·복구 흐름 추가. |
| I9 | 중개사 자격 자가검증 온보딩 | 부분 | P1 | M | 없음 | `expert_profiles.broker_registration_no`를 등록센터 온보딩에 통합(현재 `/partners` 폼만). |
| I10 | 매물 신선도·자동 마감 제안 | 부분 | P2 | S | 없음 | `refreshed_at`·`LISTING_STALE_DAYS`(21)로 오래된 매물 끌어올리기 알림·자동 마감 제안. |

## 10. 전문가 운영 페이지 + 관리자 (Expert Ops + Admin)

인테이크(`expert_verification_requests`)와 공개 프로필(`expert_profiles`)이 **연결되지 않아**(승인 라이터 부재, `markExpertVerified`/`createExpert`는 데드코드) 승인돼도 검증 전문가가 되지 않고, 관리자 심사 화면은 목업입니다.

| 번호 | 방안 | 현황 | 우선순위 | 난이도 | 키의존 | 설명 |
|---|---|---|---|---|---|---|
| J1 | 전문가 인증 승인 브리지 | 없음 | P0 | M | 없음 | `expert_verification_requests` 승인 시 `markExpertVerified`/`createExpert` 호출로 `expert_profiles` 생성(현재 두 테이블 단절·데드코드). |
| J2 | 관리자 전문가 심사 큐(실 DB) | 없음 | P0 | M | 없음 | `/admin`·`/admin/quality`의 목업 "전문가 승인/중개사 인증"을 실 큐 + approve/reject API(`app/api/admin/experts`)로. |
| J3 | 전문가 운영 콘솔 | 부분 | P0 | M | 없음 | 프로필 수정(`PATCH /api/experts/[id]`)·상담 인박스(`?mode=expert`+reply)가 orphaned — 실제 UI로 배선. |
| J4 | /me?tab=expert 데드링크 해소 | 없음 | P1 | S | 없음 | 등록 알림 `actionUrl`이 없는 라우트를 가리킴 — 라우트 신설 또는 `/my`로 교정. |
| J5 | 상담 결제·정산 스캐폴딩 | 부분 | P1 | M | 없음 | `consultation_fee`/`report_fee`가 표시용(과금 없음) — 결제 플로우·정산 리포트 UI(승인은 결제창). |
| J6 | 자격 자동 대조 | 부분 | P2 | L | API키 | `broker_registration_no`가 registry 링크 대조(수동)에 그침 — KAR/V-World 등 API 검증. |
| J7 | 사기·이상거래 운영 뷰 | 부분 | P1 | S | 없음 | `expert_fraud_events`(대화 스캐너·중복자격·계좌 불일치) 로그를 관리자 뷰로 표면화. |
| J8 | 전문가 성과·랭킹 | 부분 | P1 | M | 없음 | `rating`·상담수(`expert_consultations`)·응답시간으로 디렉터리 정렬·배지. |
| J9 | 데드·버그 코드 정리 | 부분 | P1 | S | 없음 | `loadExpertOpsSummary`가 존재하지 않는 `experts` 테이블 조회(→`expert_profiles`) 등 미사용/오참조 정리. |
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
