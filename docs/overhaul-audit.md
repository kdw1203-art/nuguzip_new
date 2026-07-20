# 누구집(nuguzip.com) 대규모 개편 사전 감사 (Overhaul Audit)

작성일: 2026-07-20 · 감사 방법: 로컬 프로덕션 빌드(`next start -p 3400`) 전 라우트 크롤링 + 소스 전수 열람
주의: 감사 환경은 외부 네트워크 차단 상태(Supabase·네이버·청약홈 fetch 실패) → 모든 페이지가 목업 폴백으로 렌더됨. "데이터 연동 자체"의 정상 여부는 판단 불가한 항목에 `[데이터 의존]` 표기. 그 외 지적은 코드 구조상 확정된 사실임.

---

## 요약

라우팅·보안·SEO 기반(미들웨어, CSP, sitemap/robots, 법적 고지 8종)은 수준급이지만, **화면의 상당수가 "시안 재현용 정적 목업"인 채로 프로덕션에 노출**되어 있는 것이 핵심 문제다. 홈 히어로의 최우선 CTA("임장노트 쓰기")부터 `href="#"`로 죽어 있고, /messages·/library·/town/market·/safety·/my/assets·/notes/compare·/analysis 하위 5종 등은 하드코딩 배열을 그대로 그리는 전시용 페이지다(버튼 다수가 핸들러 없음). 여기에 고아 라우트 4개(/digest·/seller·/upgrade·/my/dashboard), 레거시 리다이렉트 맵의 죽은 타깃 약 15개(404 유발), 홈 외 전 페이지 푸터 부재(사업자 고지·약관 링크가 모바일에서 완전 소실), GNB/탭바 IA 불일치(지도 메뉴에 /map 중복 2개, 탭바 "＋" 버튼이 노트 목록으로 이동)가 겹쳐 있다. 개편의 방향은 (1) 죽은 액션 전면 연결/제거, (2) 목업 페이지의 실연동 or 과감한 삭제·통합, (3) 공통 푸터 도입, (4) 리다이렉트 맵 정리, (5) 아래 네비 개편안 적용 순이 되어야 한다.

라우트 전수 현황: page.tsx 62개. HTTP 상태는 /admin/* 6개(307 → 로그인 게이트, 정상) 외 전부 200. 렌더된 HTML 내 내부 링크(65개 고유 경로) 전수 검사 결과 404 없음. `PORT=3400 node scripts/check-links.mjs` 결과: **총 58링크, 끊긴 경로 0** (단, 이 시드에는 미들웨어 레거시 리다이렉트 타깃이 포함되지 않음 — 아래 P0-4 참조).

---

## P0 — 사용자가 바로 체감하는 치명 문제

### P0-1. [홈] 히어로 최우선 CTA 전부 죽은 링크 (`href="#"`)
- 파일: `app/page.tsx` L111–126(모바일), L194–199(데스크탑), L257·L279(더보기 2개)
- 증상: 홈의 핵심 버튼 7개가 전부 `<a href="#">` — "임장노트 쓰기"(모바일+데스크탑, primary CTA), "지도 보기", "샘플 노트", "샘플 보기", "공개 임장노트 더보기", "동네이야기 더보기". 첫 방문자의 첫 행동이 100% 무반응.
- 조치(구체):
  - "임장노트 쓰기"(2곳) → `href="/notes/new"`
  - "지도 보기" → `href="/map"`
  - "샘플 노트"·"샘플 보기" → 공개 샘플 노트 상세(`/notes/<대표 공개노트 id>`) 또는 `/discover`
  - 공개 임장노트 "더보기" → `/notes`, 동네이야기 "더보기" → `/town`
  - `<a>` → `next/link`로 교체.

### P0-2. [탭바] 중앙 "＋" 버튼이 작성이 아니라 목록으로 이동
- 파일: `app/components/TabBar.tsx` L10 (`{ label: "노트", icon: "＋", href: "/notes", center: true }`)
- 증상: 주석("중앙 ＋는 핵심 액션 '노트 쓰기' 고정")과 달리 `/notes`(공개 노트 목록)로 이동. ＋ 아이콘을 눌렀는데 작성 화면이 안 나옴 — 모바일 핵심 전환 동선 파손.
- 조치: `href: "/notes/new"`로 변경(라벨 "기록" 또는 "노트 쓰기"). 목록 진입은 GNB·발견 탭이 담당.

### P0-3. [전자상거래 고지] 홈 데스크탑 외 모든 페이지에 푸터 부재
- 파일: `app/page.tsx` L375(`<footer className="hidden ... md:block">`) — 푸터가 홈 페이지 안에 인라인이고 그마저 `hidden md:block`. `app/components/PageShell.tsx`에는 푸터가 아예 없음.
- 증상: (a) 모바일에서는 홈 포함 어디에서도 사업자 상호·대표·사업자등록번호·통신판매업 신고번호·약관/개인정보처리방침 링크를 볼 수 없음(유료 구독을 판매하는 서비스로서 전자상거래법·정보통신망법 고지 리스크). (b) 데스크탑에서도 /subscription·/town 등 다른 페이지엔 없음. /legal/* 만 `BusinessDisclosureBlock` 보유.
- 조치: 홈의 푸터를 `app/components/Footer.tsx`로 추출 → `PageShell`과 `app/page.tsx`에 공통 삽입, `hidden md:block` 제거(모바일은 탭바 위 여백 확보). 링크 구성은 아래 "footer 제안" 참조.

### P0-4. [리다이렉트] 미들웨어 EXACT_REDIRECTS의 타깃 약 15개가 404
- 파일: `middleware.ts` L74–145 + L240–247(`/post/:id` 정규식)
- 실측(리다이렉트 추적 후 최종 상태 404 확인): 아래 키들은 구 URL로 들어온 사용자·검색봇을 **404로 보냄**.
  | 키 | 현재 타깃(404) | 권장 새 타깃 |
  |---|---|---|
  | `/map-price` | `/map/price` | `/map` |
  | `/map-analysis`, `/map/analysis` | `/map/analysis` → `/region-comparison` | `/map` |
  | `/create-post`, `/community/create` | `/community/write` | `/town/write` |
  | `/create-meeting`, `/inspection/create-meeting` | `/groups/create` | `/town/groups` |
  | `/create-meeting-market`, `/create-product` | `/market/create` | `/town/market` |
  | `/report` | `/reports` | `/analysis` |
  | `/meeting-market`, `/content-market`, `/market/product/101` | `/market` | `/town/market` |
  | `/inspection-hub`, `/my-inspection(s)`, `/inspection/*`, `/my-inspection-reports` | `/inspection/hub(?tab=…)` | `/notes` |
  | `/compare-properties`, `/property-comparison`, `/apartment-comparison`, `/properties`, `/real-price` | `/property-search` | `/search` |
  | `/calculator/acquisition` | `/calculator/tax` | `/calculator` |
  | `/calculator/rent-vs-buy` | `/calculator/investment` | `/calculator` |
  | `/comprehensive-calculator`, `/investment-tools` | `/calculators`(→`/calculator` 2단 홉) | `/calculator` 직행 |
  | `/development-info` | `/info/redevelopment` | `/town/news` |
  | `/price-prediction` | `/ai-analysis/ai-prediction` | `/analysis/timing` |
  | `/post/<id>` (정규식) | `/community/<id>` | `/town?post=<id>` 또는 `/town` |
  | `/register` | `/auth/signup`(→`/signup` 2단 홉) | `/signup` 직행 |
  | `/point-shop` | `/pricing`(→`/subscription` 2단 홉) | `/subscription` 직행 |
  | `/expert`, `/expert-matching`, `/expert-verification` | `/experts`(→`/town/experts` 2단 홉) | `/town/experts` 직행 |
- 조치: 표대로 일괄 수정 + `scripts/check-links.mjs` 시드에 EXACT_REDIRECTS 키 전체를 추가해 회귀 방지.

### P0-5. [죽은 페이지] 완전 하드코딩 목업인데 GNB에서 정식 메뉴로 노출
- **/town/market** (`app/town/market/page.tsx`): 상품 3개 하드코딩(`PRODUCTS`), 버튼 2개 핸들러 0개(구매·필터 무반응). GNB "동네이야기 > 마켓"으로 노출 중. → 실연동 전까지 GNB에서 제거하거나 "오픈 준비 중" 명시 + 구매 버튼 제거. `/api/reports`·`/api/reports/[id]/purchase`가 이미 있으므로 리포트 마켓으로 실연동하는 것이 정석.
- **/messages** (`app/messages/page.tsx`): 받은쪽지·보낸쪽지 전부 하드코딩(`RECEIVED`), 쪽지 보내기는 로컬 state 전환뿐 전송 API 없음. /town/experts·/analysis/price에서 "쪽지" 링크로 진입 가능. → 쪽지 API(`/api/chat/*` 재사용) 연동 전까지 진입 링크 제거.
- **/safety** (`app/safety/page.tsx` 102줄): "공작아파트 84A 전세 4.9억"의 진단 **결과**가 통째로 하드코딩. 입력 폼 없음, 버튼 1개 핸들러 0개. 홈 데스크탑 사이드바에서 "전세 계약 전 안전 진단"으로 유입됨 — 가짜 진단 결과를 실서비스처럼 보여주는 신뢰 리스크. → 주소 입력 스텝을 추가해 실연동하거나, 홈 진입 카드를 내리고 페이지에 "예시 리포트" 라벨을 대문짝만하게 달 것.
- **/library** (`app/library/page.tsx`): 구매 내역 3건 하드코딩, "새 버전 받기"류 액션 전부 무반응. /my/creator에서 링크됨. → `/api/reports` 구매 데이터 연동 or /my 하위로 흡수 보류.

### P0-6. [모임] 그룹 채팅방이 id를 무시하고 동일 목업 렌더
- 파일: `app/town/groups/[id]/page.tsx` (12줄) — `await params` 후 버림, `<ChatRoom />`(하드코딩 대화) 렌더.
- 증상: 어떤 모임을 눌러도 같은 가짜 채팅방. `/api/groups/[id]/chat`·`/api/chat/rooms/*`가 이미 존재하므로 연결 누락 상태.
- 조치: `ChatRoom`에 `groupId` prop 전달 → `/api/groups/[id]/chat` GET/POST 연동. 연동 전엔 목록에서 상세 진입 차단.

---

## P1 — 중요

### P1-1. [중복] /upgrade vs /subscription
- `app/upgrade/page.tsx`(314줄): "17d 쿼터 소진 업그레이드 시트 A/B 두 변형을 탭으로 모두 구현… 실결제 미연결 — 결제 버튼은 /subscription 링크" — A/B 시안 전시 페이지. 버튼 7개 중 onClick 1개. **고아 라우트**(내부 링크 0).
- `app/subscription/page.tsx`: 플랜 비교표 + `PlanCheckoutButton` → `/api/billing/checkout` 실연동 완료. 이쪽이 canonical.
- 또한 두 페이지의 **가격이 서로 다름**: /upgrade "플러스 2,900원 / 프로 19,000원" vs /subscription의 FEATURE_ROWS 체계 — 정합성 깨짐.
- 조치: `/upgrade` 페이지 삭제 + EXACT_REDIRECTS에 `"/upgrade": "/subscription"` 추가. 쿼터 소진 시트가 필요하면 /subscription 안의 모달 컴포넌트로 흡수.

### P1-2. [중복] /my vs /my/dashboard
- `/my`(558줄): 세션 판별 + `/api/me/profile`·`/api/inspection/notes` 실연동. canonical.
- `/my/dashboard`(39줄+client): 시안 16g/16h 재현, "로그인 세션 필요 데이터는 목업". **고아 라우트**.
- 조치: /my/dashboard 삭제, 유효 위젯(공개 노트 수 등)은 /my로 흡수. `"/my/dashboard": "/my"` 리다이렉트 추가.

### P1-3. [중복] /discover vs /notes — 같은 데이터(공개 임장노트)의 피드 2종
- 둘 다 `listPublicNotes()` 기반. /discover(22a 카드형, 탭바 2번 슬롯) vs /notes(7a 리스트형, GNB "임장노트"). 신규 사용자는 구분 불가.
- 조치: 둘 다 유지하되 역할 분리 명문화 — /discover = 추천·저장수 가중 탐색 피드(비로그인 랜딩), /notes = 표준 목록·검색·필터. GNB 소메뉴에서 "발견 피드"를 "임장노트" 그룹에서 빼서 홈/동네이야기 축으로 이동(아래 네비 개편안). 장기적으로 /notes에 정렬 탭("최신/인기")이 생기면 /discover → /notes?sort=hot 리다이렉트로 통합 검토.
- 참고: /discover 내부에 "리포트 마켓" 배너가 `/town/market`(목업, P0-5)으로 연결됨 — 마켓 정리 전까지 배너 제거.

### P1-4. [중복] /billing/success vs /payment/success·fail
- Stripe(`/billing/success`)와 토스·카카오(`/payment/success|fail`)가 별도 랜딩. 기능상 필요하나 URL 체계 이원화 + /billing에는 fail 페이지가 없어 Stripe 취소 시 UX 공백.
- 조치: `/payment/{success,fail}?provider=`로 통일하고 `/billing/success`는 리다이렉트 or Stripe cancel_url을 `/payment/fail?provider=stripe`로 지정.

### P1-5. [미구현 노출] /seller — 심사 신청이 "준비 중" 안내로 끝나는 4스텝 위저드
- `app/seller/page.tsx` L9 주석·L501–504: "실제 제출은 미연결 — 마지막 스텝의 '심사 신청'은 준비 중 안내만 표시". 1원 인증·계좌 등록 UI까지 있으나 전부 로컬 목업. **고아 라우트**라 피해는 제한적.
- 조치: 마켓(P0-5) 실연동 로드맵에 묶어 처리. 그 전까지 라우트를 열어둘 이유 없음 — 페이지 비공개(로그인+화이트리스트) 전환 또는 삭제. 판매자 수요 확인용이면 첫 화면에서 이메일 사전등록만 받도록 축소(`/api/support` 재사용).

### P1-6. [죽은 액션] /town/experts 상담 버튼 3개 핸들러 없음
- `app/town/experts/page.tsx` L262·L294·L313 — `type="button"`에 onClick 없음("상담 신청" 등 primary CTA). `/api/experts/[id]/consult` 존재.
- 조치: 전문가 카드의 CTA를 `/api/experts/[id]/consult` POST(로그인 요구) 또는 상담 신청 모달로 연결. 목업 폴백 전문가(id: null)는 CTA 숨김.

### P1-7. [IA] GNB "지도" 드롭다운에 /map 중복 2개
- `app/components/Header.tsx` L30–31: "지도 탐색"과 "매물 보기"가 **둘 다 `/map`**.
- 조치: "매물 보기" 항목 삭제(또는 `/map?tab=listings` 같은 실제 구분이 생길 때 복원). 네비 개편안 참조.

### P1-8. [IA] GNB "임장노트 > 내 노트"가 /my(마이페이지 전체)로 이동
- Header.tsx L21: `{ label: "내 노트", href: "/my" }` — 노트 문맥에서 프로필·설정이 섞인 마이 전체로 떨어짐.
- 조치: `/my?tab=notes` 앵커를 만들거나, 내 노트 전용 뷰(`/notes?mine=1`)로 연결. 단기: 라벨을 "마이"로 바꾸지 말고 /my 상단이 내 노트 리스트이므로 유지 가능하되 개편 시 정리.

### P1-9. [고아] /digest — 품질 양호한 주간 다이제스트가 어디서도 링크 안 됨
- `app/digest/page.tsx`: 실데이터 연동(#86) + 빈 상태 폴백 갖춘 정상 페이지. 사이트맵엔 있으나 내부 링크 0 — 사용자는 도달 불가.
- 조치: 홈 사이드바/모바일 히어로 아래에 "주간 다이제스트" 진입 카드 추가 + GNB "동네이야기 > 주간 다이제스트" 소메뉴 추가.

### P1-10. [콘텐츠 신뢰] 실데이터가 있어도 노출되는 가짜 수치·문구
- `app/page.tsx` L131·L205: **기준금리 "2.75%" 하드코딩** — 금리 변동 시 오정보. → `data.baseRate`로 승격, null이면 "—" (대출금리와 동일 원칙). `[데이터 의존]`
- `app/analysis/page.tsx` TOOLS foot 라벨: "노트 7건 분석 완료 ›", "공작 vs 동편3 갱신됨 ›" — 전 사용자에게 동일하게 보이는 **가짜 개인화**. → 세션 실데이터로 대체하거나 정적 설명문으로 교체.
- `app/login/page.tsx` L92–98: "공작아파트 302동 · 오늘 · 체크 6항목 · 사진 4장" — 작성 내용 보존을 암시하는 **가짜 노트 카드**를 모든 방문자에게 노출. → 실제 임시저장이 있을 때만 렌더.
- `app/subscription/page.tsx` L274 부근: "첫집준비중" 후기 하드코딩 — "예시" 라벨 없음. → 예시 라벨 부착 or 제거.
- `app/search/page.tsx`: 검색 전 기본 화면이 "공작" 목업 결과 + "전체 52" 등 가짜 카운트 탭. → 검색 전엔 최근 검색어/인기 단지로 교체.
- `app/page.tsx` L362–369: 사이드바 "AD Google AdSense 336×96" 점선 플레이스홀더가 프로덕션에 그대로 노출. → AdSense 실장착 or 슬롯 숨김.

### P1-11. [SEO] sitemap 누락: /discover, /legal/*
- `app/sitemap.ts` STATIC_ROUTES에 **/discover 없음**(탭바 2번 슬롯이자 비로그인 랜딩인데 색인 대상 제외), /legal 8종도 없음(신뢰·검색 유입 페이지).
- 조치: `/discover`(0.8), `/legal`(0.3) + 하위 8개(0.3) 추가. 반대로 /town/market·/subscription은 실연동 정리 전까지 우선순위 하향 유지.

### P1-12. [분석 5종] /analysis/{price,cycle,switch,timing,scenario,portfolio} 전부 정적 시뮬레이션
- 전 페이지가 하드코딩 상수(STEPS·SEGMENTS·SIM_ROWS·BARS…) 기반. "AI 분석"이라는 GNB 대분류가 사실상 무동작 데모 갤러리. /analysis/compare만 비교 트레이 + `/api/ai/compare` 실연동. `[데이터 의존]` 아님 — 코드상 입력→계산 경로 자체가 없음.
- 조치(우선순위): ① compare(이미 연동) → GNB 대표로 승격 ② scenario·price는 `/api/loan/calc`·`/api/inspection/price-analysis` 기존 API에 연결 ③ cycle·switch·timing·portfolio는 "예시 리포트" 배지 명시 후 순차 실연동. 미연동 기간 GNB 소메뉴에서 제외(개편안 반영).

### P1-13. [설정] /my/settings 토글이 시각적 장식
- `app/my/settings/page.tsx`: `Toggle`이 `aria-hidden` span, 저장 API 호출 없음(로컬 탭 전환 3개만 onClick). `/api/me/notification-prefs`·`/api/me/preferences` 존재.
- 조치: 토글을 실제 `<button role="switch">`로 바꾸고 위 API에 PATCH 연결. 미연동 항목은 렌더 제거.

---

## P2 — 다듬기

1. [모바일 셸] `app/login·signup·forgot-password·reset-password/page.tsx`: 독립 `<main>` 레이아웃에 `env(safe-area-inset-top)` 미적용(`pt-5` 고정) — 노치 기기에서 ✕ 버튼이 상태바에 겹칠 수 있음. → Header와 동일하게 `paddingTop: max(20px, env(safe-area-inset-top))` 적용.
2. [고객센터] `app/support/page.tsx`: SIDE_MENU 7항목("공지사항"·"이용약관" 등)이 **링크가 아닌 일반 텍스트**, 공지 3건 하드코딩, 문의 폼 없음(`/api/support` POST 미사용, mailto만). → 사이드메뉴에 실제 href 부여(약관→/legal/terms 등), 문의 폼을 `/api/support`에 연결, 공지는 board_posts(공지 카테고리) 연동.
3. [알림] `app/notifications/page.tsx`: 로그인 시 `/api/notifications` 실연동은 OK. 다만 FILTERS 칩의 active가 상수라 필터 동작 검증 필요, 데스크탑 GNB에는 알림 진입점이 없음(모바일 🔔만). → HeaderAuth 옆에 데스크탑 알림 아이콘 추가.
4. [계산기] `app/calculator/page.tsx`: `RATE=4.19` 상수·BANK_ROWS(은행 4곳 금리) 하드코딩 — `/api/finance/mortgage-rates` 존재하므로 연결. 금리 출처·기준일 캡션 추가.
5. [노트 비교] `app/notes/compare/page.tsx`: 1~5차 회차 데이터 전부 하드코딩 — 내 노트 선택 UI가 없음. `/api/inspection/compare` 존재. GNB에 노출 중이므로 "예시" 배지라도 우선 부착.
6. [프로필] `app/u/[handle]/page.tsx`: 미존재 핸들 → 목업 프로필 폴백 렌더(예시 라벨 있음). 404를 반환하는 편이 SEO상 안전(`notFound()`).
7. [중복 홉] `/register`·`/point-shop`·`/expert`·`/comprehensive-calculator` 등 2단 리다이렉트 홉(P0-4 표) — 직행 타깃으로 평탄화.
8. [환불정책] 별도 환불정책 페이지 없음 — `legal/terms` 제8조(7일 청약철회)로 커버되나, 결제 화면(/subscription)에서 환불 규정 직링크가 없음. → PlanCheckoutButton 아래 "환불 규정" 링크(`/legal/terms#refund`, 앵커 id 부여).
9. [운영 페이지 존재 현황] 이용약관 ✓(/legal/terms, 상세) · 개인정보처리방침 ✓ · 위치기반서비스 약관 ✓(/legal/location) · 청소년보호 ✓ · 사업자 고지 △(홈 데스크탑+법무 페이지만 — P0-3) · 고객센터 △(/support, 폼 미연동 — P2-2) · 공지사항 ✗(전용 페이지 없음, /support 내 하드코딩 3건) · 환불정책 △(약관 내 조항만).
10. [robots] `/u/*` 공개 프로필이 disallow에 없고 sitemap에도 없음 — 정책 결정 필요(색인하려면 sitemap 추가, 아니면 noindex 명시). `/library`·`/messages`는 robots disallow에 없음 — 개인 영역이므로 추가 권장.
11. [town 글쓰기] `/town/write`는 `/api/community/posts` 실연동 완료로 양호. 단 GNB·탭바 어디에도 진입점이 없고 /town 페이지 내 버튼에만 의존 — 유지 OK, 개편안에서 /town 상단 고정 버튼 확인.
12. [어드민] /admin 하위 6종은 307 게이트 정상. `app/admin/page.tsx`에 "첫집준비중 (kakao)" 등 목업 사용자 노출 — 실데이터 연동 여부 확인 필요. `[데이터 의존]`
13. [홈 개인화] `PersonalHome`(S13-13a)·`JourneyBanner` 는 구조상 문제 없음. 데스크탑 홈 "접속 중 N명"은 실패 시 "—" 폴백 확인됨 — 양호.
14. [검색] Header 데스크탑 검색이 입력창처럼 보이는 `<Link>` — 클릭 시 /search 이동은 되지만 즉시 타이핑 기대와 어긋남. → 개편 시 인라인 자동완성(이미 `/api/search/suggest` 존재)으로 승격.

---

## 중복 페이지 정리표

| 그룹 | Keep (canonical) | Redirect / Absorb | 근거·조치 |
|---|---|---|---|
| 구독·결제 | `/subscription` (checkout 실연동) | `/upgrade` → 삭제 후 308 `/subscription`; 쿼터 시트는 모달로 흡수 | /upgrade는 A/B 시안 전시, 고아, 가격 불일치 |
| 마이 대시보드 | `/my` | `/my/dashboard` → 삭제 후 308 `/my` | dashboard는 목업, 고아 |
| 공개 노트 피드 | `/notes`(표준 목록) + `/discover`(탐색 피드) 병존 | 역할 분리 명문화, 장기 `/discover`→`/notes?sort=hot` 검토 | 동일 데이터 2뷰 — 단기 유지 |
| 커뮤니티 | `/town` | `/community`(구경로) → 이미 308 `/town` ✓; `/post/:id`·`/community/:id` 타깃만 수정 | 정리 완료, 죽은 타깃만 잔존 |
| 결제 랜딩 | `/payment/{success,fail}` | `/billing/success` → provider 파라미터로 흡수 | Stripe fail 랜딩 공백 해소 |
| 마켓·보관함·판매자 | `/town/market` (실연동 후) | `/library` → `/my` 하위 "구매 리포트" 탭으로 흡수, `/seller` → 마켓 실연동 시까지 비공개 | 3페이지 모두 현재 목업 |
| 리포트·분석 | `/analysis` 허브 | 구 `/report`→`/analysis`, `/reports` 라우트는 만들지 않음(API만 유지) | P0-4 표 반영 |
| 청약 | `/apply` | GNB "지도 > 청약 센터" 유지 | 유일 페이지, 열람형(링크 0) — 상세 링크·알림 CTA 추가 권장 |
| 쪽지·채팅 | `/town/groups/[id]` 채팅(API 존재) | `/messages` → 쪽지 API 연동 전까지 진입 링크 제거 | 두 메시징 체계 공존 — chat rooms로 일원화 검토 |

---

## 네비 개편안

### GNB (4 대분류 + 소카테고리, 순서 포함)

1. **임장노트** `/notes`
   1. 노트 쓰기 `/notes/new` (primary)
   2. 공개 노트 `/notes`
   3. 회차 비교 `/notes/compare` (예시 배지 부착 전제)
   4. 내 노트 `/my` (개편 후 `/notes?mine=1`)
2. **지도·시세** `/map`
   1. 지도 탐색 `/map` ("매물 보기" 중복 항목 삭제)
   2. 실거래 검색 `/search`
   3. 청약 센터 `/apply`
   4. 대출·비용 계산기 `/calculator` (현재 GNB 미노출 준고아 — 편입)
   5. 전세 안전 진단 `/safety` (실연동 후 편입; 그 전까지 제외)
3. **AI 분석** `/analysis`
   1. 분석 허브 `/analysis`
   2. 후보 단지 비교 `/analysis/compare` (유일 실연동 — 2번으로 승격)
   3. 시장·대출 시나리오 `/analysis/scenario` (loan/calc 연동 후)
   4. 시세·타이밍 `/analysis/timing`
   — cycle·switch·price·portfolio는 실연동 전 GNB 제외(허브 카드로만 노출)
4. **동네이야기** `/town`
   1. 피드 `/town`
   2. 발견 피드 `/discover` (임장노트 그룹에서 이동 — 탭바 "발견"과 정합)
   3. 자료·뉴스 `/town/news`
   4. 임장 모임 `/town/groups`
   5. 전문가 `/town/experts`
   6. 주간 다이제스트 `/digest` (고아 해소)
   — 마켓 `/town/market` 은 실연동 후 재편입

우측 유틸리티: 검색(인라인 자동완성) · 알림 아이콘(데스크탑 추가, `/notifications`) · "노트 쓰기" CTA 유지 · HeaderAuth 드롭다운에 "구독 관리 `/subscription`"과 "고객센터 `/support`" 항목 추가(현재 마이/크리에이터/설정/로그아웃뿐).

### TabBar (모바일 5슬롯)

| 순서 | 라벨 | href | 변경점 |
|---|---|---|---|
| 1 | 홈 | `/` | 유지 |
| 2 | 발견 | `/discover` | 유지 (GNB와 정합화됨) |
| 3 | **기록(＋)** | **`/notes/new`** | P0-2 — 목록 → 작성으로 수정 |
| 4 | 지도 | `/map` | 유지 |
| 5 | 마이 | `/my` | 유지 |

### Footer (신규 공통 컴포넌트, 모바일 포함)

- 1행: 사업자 고지(기존 `getBusinessInfo()` 문구 재사용 — 상호·대표·사업자등록번호·통신판매업번호·주소·문의 메일)
- 2행 링크: 이용약관 `/legal/terms` · **개인정보처리방침** `/legal/privacy`(굵게) · 위치기반서비스 약관 `/legal/location` · 청소년보호 `/legal/youth` · 법적 고지 전체 `/legal` · 고객센터 `/support` · 구독 안내 `/subscription`
- 3행: 면책 문구(시세·AI 참고용) — 현행 유지
- 배치: `PageShell`과 홈에 공통 삽입, 모바일에서는 탭바와 겹치지 않게 `pb-28` 확보. /legal 하위는 `BusinessDisclosureBlock`과 중복되므로 footer 간소판 사용 가능.

---

## 고아 라우트 목록과 처리안

내부 링크(GNB·탭바·푸터·본문) 전수 grep + 렌더 HTML 크롤로 판정.

| 라우트 | 상태 | 처리안 |
|---|---|---|
| `/digest` | 완전 고아(사이트맵에만 존재), 품질 양호 | **살리기** — 홈 카드 + GNB 소메뉴 편입 (P1-9) |
| `/upgrade` | 완전 고아, A/B 시안 전시, 결제 미연결 | **삭제** + `/subscription` 리다이렉트 (P1-1) |
| `/my/dashboard` | 완전 고아, 목업 | **삭제** + `/my` 리다이렉트 (P1-2) |
| `/seller` | 완전 고아, 제출 미구현 | **비공개 전환**(마켓 로드맵에 묶음) (P1-5) |
| `/calculator` | 준고아 — JourneyBanner·/my·/analysis/compare에서만 링크, GNB 부재 | GNB "지도·시세" 편입 (개편안) |
| `/safety` | 준고아 — 홈 데스크탑 사이드바 1곳 | 실연동 전 진입 카드 축소, 이후 GNB 편입 (P0-5) |
| `/library` | 준고아 — /my/creator 1곳, 목업 | /my "구매 리포트" 탭으로 흡수 (정리표) |
| `/messages` | 준고아 — experts·analysis/price 텍스트 링크, 목업 | 진입 링크 제거 후 chat API 연동 시 복원 (P0-5) |
| `/town/write` | 준고아 — /town 내 버튼만 | 유지 (실연동 완료) |
| `/analysis/{cycle,price,switch}` | 준고아 — 분석 페이지 상호 링크만 | 예시 배지 + 허브 카드 노출로 정리 (P1-12) |
| `/billing/success`, `/payment/*`, `/reset-password` | 의도된 비링크(결제·메일 리턴 URL) | 정상 — robots noindex 확인됨 |

---

## 부록 — 검증 로그 요약

- 라우트 62개 curl: /admin/* 6개 307(로그인 게이트), 나머지 56개 전부 200.
- 렌더 HTML에서 추출한 내부 href 65개 전수 재검: 404 없음 (단 `href="#"` 7건은 홈에 존재 — P0-1).
- `scripts/check-links.mjs`: 58링크 / 끊긴 경로 0. 시드가 얕음 — EXACT_REDIRECTS 키를 시드에 추가 권장.
- 미들웨어 레거시 타깃 실측: 404 타깃 15군 확인 (P0-4 표), 2단 홉 4군.
- 페이지별 `<button>` 대비 `onClick` 부재(죽은 버튼): town/market 2/0, library 1/0, safety 1/0, town/experts 3/0, upgrade 7/1, seller 8/4.
- "준비 중" 노출 지점: /seller 심사 신청(L501), /digest 빈 상태 문구(정상 폴백), 시세 폴백 문구(map·complex — `[데이터 의존]` 정상 처리).
- metadataBase(`https://nuguzip.com`)·openGraph·robots.ts·법적 고지 8종·CSP·no-store 정책은 양호.
