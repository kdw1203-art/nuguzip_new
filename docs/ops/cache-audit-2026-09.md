# 캐시 감사 — 유입 상위 경로 (2026-09-01, 실사용50 #35)

프로덕션 실측(Playwright, 응답 헤더). 목적: 카페 글 스파이크(시간당 수천 방문)가
홈·단지·목록을 통해 DB 를 직격하지 않는지.

| 경로 | cache-control | x-vercel-cache | 판정 |
|---|---|---|---|
| / | s-maxage=60, SWR 600 | STALE(age 150) | ✅ 엣지가 흡수 — 스파이크 안전 |
| /town | s-maxage=60, SWR 600 | STALE | ✅ 동일 |
| /guides/* | s-maxage=3600, SWR 86400 | PRERENDER | ✅ 정적 |
| /region/[id] | s-maxage=3600, SWR 86400 | MISS→HIT | ✅ ISR |
| /analysis/gap | no-store (PRERENDER) | PRERENDER | ✅ 프리렌더 셸 |
| /search | no-store | HIT(age 1937) | ✅ 셸 캐시 + 클라이언트 데이터 |
| /map | no-store (force-dynamic) | MISS | ⚠️ 함수 호출은 매 방문 — 단, 무거운 배치 조회 3종은 unstable_cache 600s(938) + last-good 이라 DB 직격은 아님. 남는 비용은 함수 실행뿐(Vercel 스케일 영역) |
| /notes | no-store (force-dynamic) | MISS | 🔧 **수리함(945)** — 비로그인 공개 피드 목록을 unstable_cache 60s 로 묶음. 이전에는 방문마다 listPublicNotes 실조회 |
| /login·/subscription | no-store | MISS | ✅ 의도된 동적(세션) — 스파이크 표적 아님 |

## 결론

- 스파이크 1순위 표적(홈·동네·가이드·지역·단지 상세)은 전부 엣지/ISR 뒤에 있다.
- 단지 상세(/complex/[id])는 ISR + 조회 cache() 통합(기존 감사) — 이번 표에서는 생략.
- 남은 리스크는 "함수 동시 실행 비용"(Vercel)이지 DB 가 아니다. DB 직격 경로였던
  /notes 공개 피드는 이번에 60초 캐시로 수리.
- 부하 시나리오 실측(동시 수백 요청)은 소유자 과금 영향이 있어 미실시 —
  실제 스파이크 발생 시 Vercel 함수 동시성 그래프로 사후 검증한다.

재감사 시점: 카페 배포(플레이북 #29) 첫 실행 주간의 실트래픽으로.

---

# 2차 — 함수 호출량·DB 시간 기준 (2026-09-02, 948 최적화)

1차 표는 "엣지가 흡수하는가"를 봤다. 이번에는 **실제로 함수가 몇 번 돌고
DB 가 어디에 시간을 쓰는가**를 봤다. 재료: Vercel 런타임 로그 24시간
라우트별 집계 + `pg_stat_statements` 델타(ops.pgss_snapshot_20260902,
00:06Z→11:41Z, queryid 로 양쪽을 먼저 합친 뒤 차분).

## 함수 호출 상위 (24h, 로그 행 수)

| 라우트 | 호출 | 성격 |
|---|---:|---|
| /complex/[id] | 6,034 | ISR 6h 인데 **크롤러가 롱테일 단지를 1.5초에 1개씩** 훑어 거의 전부 MISS → 콜드 렌더 0.6~1.5s |
| /notes/new | 1,936 | force-dynamic 작성 폼. 비로그인도 200 — 크롤러 유입 |
| /analysis/ai/[tool] | 934 | ISR 1h |
| /qna | 919 | ISR 300s |
| / | 754 | ISR 60s |
| (308) | 4,630 | 구 `/complex/<base64>` → 슬러그 URL 리다이렉트. 엣지 미들웨어라 함수 비용 없음 |

## DB 시간 상위 (11.5h 델타, 실행시간만 — 계획 시간 별도)

| 쿼리 | 호출 | 평균 | 합계 | 출처 |
|---|---:|---:|---:|---|
| market_transactions complex_name ILIKE (검색) | 4,427 | 42ms | 187s | `resolveComplexHref` — /notes·/qna·/notes/[id]·/map 이 **요청마다** 목록 전체를 다시 해석 |
| board_posts title/ai_summary ILIKE | 4,408 | 27ms | 117s | live-context 뉴스 축(단지 → 지역 폴백 2회) · seq scan |
| market_transactions 전월세 24개월 | 2,997 | 34ms | 100s | ComplexRentSection |
| apartment_complexes name/address ILIKE | 2,995 | 27ms | 80s | enrichFromApartmentComplex |
| apartment_supply address ILIKE | 6,035 | 11ms | 64s | live-context + UpcomingSupply — 단지마다 2회 |
| market_transactions 대표행(build_year) | 3,093 | 17ms | 52s | getComplexById |
| region_rent_yield_summary RPC | 2,959 | 9ms | 27s | **"전역 1벌" 캐시가 실제로는 렌더마다 호출** |

단지 콜드 렌더 1회 ≈ PostgREST 왕복 22회. 실행시간 합은 150ms 안팎이지만
왕복마다 계획 5~16ms(트랜잭션 풀러라 준비문 재사용 없음) + 네트워크가 붙는다.
즉 줄일 것은 "쿼리 단가"보다 **"왕복 횟수"** 다.

## 발견 — 중첩 unstable_cache 는 안쪽이 저장되지 않는다

`buildLiveToolContextCached`(단지 키 6h) 안에서 부르는 `loadRentYieldRows`
(전역 키 6h)가 렌더 13회에 RPC 13회로 확인됐다. 최상위에서 부르는
`/notes` 의 60초 캐시는 5회 요청에 DB 0회로 정상. → 캐시는 **중첩하지 않고
최상위에서 나란히** 부른다(lib/ai/live-context.ts 주석).

## 조치 (948)

| 조치 | 기대 효과 | 검증 방법 |
|---|---|---|
| `resolveComplexHref` (이름, 지역) 키 데이터 캐시 6h — 실패는 던져서 캐시 안 함 | DB 시간 1위(187s/11.5h) 소멸 | pgss queryid −1075091874752423485 호출 수 |
| live-context 를 **지역 축 캐시(218키)** + **단지 축 캐시** 로 분리, 최상위 호출 | 단지 렌더당 왕복 −7 (뉴스 폴백·입주·학교·거시·RPC·지역 스냅샷·인구) | apartment_supply·RPC·board_posts ILIKE 호출 수 |
| `readRelatedTownPosts` 5분 데이터 캐시 (인자 없음) | board_posts 300행 조회(10.5ms×3,802) 소멸 | queryid 2247053509333565828 |
| UpcomingSupply 지역 키 캐시 6h (Strict 판 — 실패는 캐시 안 함) | apartment_supply 왕복 −1/렌더 | 위와 같음 |
| trigram GIN 인덱스 3종 (board_posts title·ai_summary, apartment_supply address) — **적용 완료(11:50Z)** | board_posts ILIKE 17.6ms → 1.3ms(EXPLAIN ANALYZE) | pgss 평균 실행시간 |

건드리지 않은 것과 이유:
- `enrichFromApartmentComplex` 를 lawd_cd 등치로 바꾸는 안 — 지역 카탈로그의
  이름 매칭이 부분 일치 폴백을 가져("중구" 류) 잘못된 코드로 엉뚱한 단지 스펙이
  붙을 수 있다. 27ms 를 아끼려고 정합성을 걸 일이 아니다.
- /notes/new 비로그인 200 — 폼 자체가 클라이언트에서 로그인 벽을 그린다.
  엣지 리다이렉트로 바꾸면 ?memo= 프리필 흐름(계산기 → 노트)이 로그인 후
  돌아올 때 깨진다. 호출 1,936회/일 × 짧은 실행이라 비용도 작다.

재측정: 948 배포 후 24시간, 같은 델타 방식(ops.pgss_snapshot_20260902_pre948 기준).

---

# 3차 — 실사용 지표 기준 대규모 최적화 (2026-09-02, 949)

## 근거 — web_vitals 14일(봇 제외) p75

| 경로 | TTFB | FCP | LCP | CLS | INP |
|---|---:|---:|---:|---:|---:|
| / | 26ms | 612ms | 1.45s | 0.018 | 76ms |
| /complex/[id] | **1.42s** | **2.33s** | **3.24s** | 0.010 | 84ms |
| /region/[id] | — | 2.22s | 2.36s | — | — |

홈은 엣지 캐시가 받아 좋다. 문제는 단지 허브 하나다 — TTFB p75 1.4s 가 그대로
LCP 3.2s(나쁨 구간)로 이어진다. ISR 미스는 loading.tsx 스트리밍이 적용되지 않는다
(온디맨드 ISR 은 렌더가 끝나야 첫 바이트가 나간다). 그래서 **렌더 파도 수 = TTFB**.

## 조치

| 영역 | 조치 | 근거·기대 |
|---|---|---|
| 단지 허브 | 대표행을 base/enrich 로 갈라 enrich 를 곁다리와 **동시에** 실행 (`getComplexBaseById`·`enrichComplexRow`) | 직렬 파도 하나 제거(~40ms) |
| 단지 허브 | 섹션 7종(전월세·Q&A·정비사업·면적대·지역대비·입주물량·축요약)을 `section-loaders.ts` 의 React cache 로더로 통일하고 본문이 대표행을 받은 직후 **프리페치** | 섹션 파도가 곁다리 파도와 합쳐짐 — 왕복 한 파도(50~150ms) 제거 |
| 단지 허브 | 렌더 파도 시간 표본 로그 `[complex-timing]` (600ms↑ 전부, 5% 표본) | 배포 뒤 남은 파도가 무엇인지 로그로 읽는다 |
| DB | market_transactions 커버링 인덱스 4종(신규 174MB) + 대체된 3종 삭제(72MB) | 지역 최근거래 334→2ms, 지역 전월세 647→10ms, 단지 대표행 힙 0, 단지 전월세 9→0.6ms (EXPLAIN ANALYZE) |
| 폰트 | Noto Serif KR(슬로건) stylesheet 를 렌더 차단 → preload+print 스왑, fonts.gstatic preconnect | 946 이후 모든 페이지가 첫 페인트 전에 구글 폰트 CSS 를 기다리고 있었다 |
| /notes/[id] | 세션∥노트, 구매확인∥단지링크∥회차∥비교후보 병렬화 | 직렬 왕복 6 → 3 (콜드 0.98s 실측) |
| /analysis | 티저∥세션 병렬, 게스트 미리보기 60초 데이터 캐시 | 하루 550회 동적 렌더의 공개 노트 재조회 제거 |
| 엣지 | `/complex/*` 5%·`/notes/new` 20% UA 표본 로그 | 누가 훑는지 몰라서 봇 정책을 못 정하던 상태 해소 |

## 948 배포 직후 관측(12:11Z 배포, 12:17→12:35Z)

- board_posts 300행 조회: 334/h → 13/h. 링크 해석 ILIKE: 392/h → 122/h(키 채워지는 중).
- 지역 축 캐시는 218개 지역이 채워지는 동안 RPC 가 렌더당 0.45회로 남았다 — 6시간
  뒤 재확인(예약 점검 ④).
- 크롤러 속도가 317/h → 806/h 로 올랐다(우리와 무관한 외부 요인). UA 표본이 필요하다.

## 하지 않은 것

- `/complex/[id]` 를 동적 스트리밍으로 바꾸는 안 — TTFB 는 좋아지지만 LCP(가격
  히어로)는 어차피 본문 데이터를 기다리고, 크롤러 6천 회/일이 전부 함수 실행이 된다.
- `/notes/new` 정적화 — ?tpl=·?memo= 서버 프리필을 클라이언트로 옮겨야 해서 작성
  흐름 회귀 위험이 크다. UA 표본으로 봇이면 차단이 답이다.
