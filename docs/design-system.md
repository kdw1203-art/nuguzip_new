# 내집나우 디자인 시스템 (#50)

> 근거 소스: `app/globals.css` (단일 소스). 이 문서는 요약본이며, 값이 다르면 항상 `globals.css`가 우선한다.
> 스택: Next.js App Router + Tailwind v4 (`@theme inline`으로 CSS 변수 → Tailwind 색 토큰 매핑).

## 핵심 규칙 (요약)

| 규칙 | 내용 |
|---|---|
| 파랑 다이어트 | 채움 `.btn-primary`는 **화면당 1개**. 보조는 `.btn-outline`, 3순위·목록 내는 `.btn-ghost`. 필터 칩 활성색은 파랑이 아니라 **한지 + 남색**(`.chip-active`, 962 — 홈 시안 "선택 칩·점수 = 한지") |
| 시세 관례 | **상승 = red**(`.delta-up`, `#d64545`) / **하락 = blue**(`.delta-down`, `#1d4fd8`) / 보합 `.delta-flat`. 국내 시세 관례이므로 절대 뒤집지 않는다 |
| AI 잉크 패널 | AI 분석 결과는 항상 잉크 다크 패널(`.ai-panel`, `AIPanel` 컴포넌트)로 표시. 다크 위 파랑은 `--ai-accent`(#7ea2ff)만 사용 — `#1d4fd8` 직접 사용 금지(대비 부족) |
| 글래스 제한 | `.glass` `.glass-strong`은 **헤더·탭바·플로팅 요소 전용**. 본문 카드는 불투명 `.card` |
| 그림자 | 3단만: 플랫(보더만, 본문 카드) / `--shadow-sm`(호버·드롭다운) / `--shadow-lg`(모달·플로팅). **보더+그림자 동시 사용 금지**(글래스 제외) |
| 모션 | `--dur-xs/sm/md/lg` 4단 + 이징 2종(`--ease-out`, `--ease-inout`)만 사용. 커스텀 duration/easing 값 금지 |
| 상태색 | 상태 텍스트에 soft(bg)색 직접 사용 금지 — bg/border/text 3토큰 세트로만 (`--success*` `--warning*` `--danger*`) |
| disabled | `opacity` 금지 — `--disabled-bg`(#eef1f6) + `--disabled-text`(#b0b8c1) |
| 국문 조판 | `word-break: keep-all` 전면 적용(body), 자간 -1% |

## 0. 브랜드 면 규칙 (946 리브랜딩 · 952 통일)

마스터 가이드 v2.1(내집나우)을 사이트 전역에 적용하는 규칙. 값은 `globals.css` 의 `--brand-*` · `--on-dark*` 토큰이 단일 소스다.

| 규칙 | 내용 |
|---|---|
| 어두운 면 = 네이비 | 티커·오늘의 한 줄·AI 패널·사진 프레임·다크 칩 등 **모든 어두운 면은 `--brand-navy`(#0B2545)**. `bg-ink`·`#0e1420`·`#12161f` 같은 검정 계열 면은 쓰지 않는다(952 에서 `bg-ink` 25곳 → `bg-brand-navy`, `--ai-panel` 도 네이비). `text-ink` 는 그대로 본문 글자색 |
| 어두운 면 위 글자 = 한지 | `text-on-dark`(#F6F1E7) / `text-on-dark-muted`(72%) / `text-on-dark-faint`(45%). 흰색·회색 hex(#c3cad6·#9aa6b8…) 직접 지정 금지 |
| 신호 = 주홍 | 노랑·연빨강·별점·"지금" 강조는 **주홍**: 라이트 면 `text-brand-red`(#C8442B), 어두운 면 `text-brand-red-dark`(#E0563A). 금색(#f2c94c) 계열은 쓰지 않는다 |
| 나우블루는 CTA·링크 전용 | `--primary`(#1D4FD8)는 버튼·링크·하락 delta 에만. 선택 테두리·배지·장식에 쓰지 않는다(사진 썸네일 선택 = 주홍) |
| 한지 = 브랜드 순간 | 슬로건 띠·빈 화면·선택 칩 배경은 `bg-brand-hanji`, 그 위 글자는 `text-brand-hanji-ink` |
| 상태색은 토큰 3종 세트 | 경고 박스 `border-warning-border bg-warning-soft text-warning`, 위험 `…danger…`, 성공 `…success…`. 손으로 적은 `#fdf3dd`·`#fff7f7` 류는 952 에서 전부 토큰으로 옮겼다 |
| 서드파티 브랜드색 예외 | 카카오(#FEE500/#191919)·토스(#3182F6) 로그인 버튼은 각사 가이드가 우선 — 그대로 둔다 |
| 둥근 모서리 5단 | 6(뱃지·작은 칩) · 10(버튼·입력·칩) · 14(작은 카드·패널) · 16=`rounded-2xl`(카드) · 18~24(히어로·큰 패널). 5·9·11·12·20px 임의값은 952 에서 이 다섯으로 스냅했다 |

### 0-1. 전문가 면 (953)

전문가 목록·상세·상담함·프로필 폼이 브랜드 면 규칙을 그대로 따른 첫 세트다. 다른 "사람 프로필" 화면(크리에이터·파트너)을 만들 때 같은 배치를 쓴다.

| 자리 | 규칙 |
|---|---|
| 히어로·프로필 머리 | `brand-navy-card` (네이비) + 아바타는 **한지 원 위 남색 글자**(`bg-brand-hanji text-brand-hanji-ink`), 목록 카드 아바타는 반대로 **남색 원 위 한지 글자**(`bg-brand-navy text-on-dark`) |
| 인증 배지 | 라이트 면: `bg-primary-soft text-primary` + shield 아이콘(사이트 공통 "인증" 표기). 네이비 면: `bg-brand-hanji text-brand-hanji-ink` |
| 별점 | 주홍 별(`text-brand-red`, 다크 면 `text-brand-red-dark`) · 빈 별은 같은 색 `opacity-25`. 후기 0건은 별 대신 "후기 아직 없음"(0.0 금지) |
| 지표 줄 | 실측만 — 답변 완료 수·응답률/응답 시간·평점. 없는 값은 `—` 로 두고 지표처럼 꾸미지 않는다 |
| 필터 칩 | 자격 유형 → 상담 분야 → 지역·정렬 세 줄. 선택 = `chip-active`(잉크). 다중 선택(전문 분야 편집)은 `chip-check` / `chip-check-active` |
| 참여 유도 띠 | `bg-brand-hanji` + `text-brand-hanji-ink`(슬로건 띠와 같은 면), CTA 만 나우블루 |
| 네이비 위 보조 버튼 | `brand-photo-chip`(한지 14% 면) — "전문가로 참여"·"견적 요청"·"공개 프로필 보기" |
| 답변 대기 강조 | 카드 왼쪽 `border-l-[3px] border-l-brand-red`(주홍 = 지금 할 일) |

### 0-2. 온점 모션 언어 (961 · 브랜드 모션 시스템 v1.0 + 인터랙션 라이브러리 v2.0)

모든 모션이 온점(주홍 점) 하나에서 나온다. 로딩·저장·분석·알림이 같은 점이 형태만 바꿔 말하므로
사용자는 배우지 않아도 "주홍 점 = 지금 무슨 일이 일어나는 중"을 익힌다. 토큰은 `--njn-pop`(탭·선택)
· `--njn-out`(등장·호버) · `--njn-dur-*`. 새 애니메이션은 반드시 globals.css 하단 reduced-motion 블록에 등록.

| 자리 | 규칙 · 컴포넌트 |
|---|---|
| 로딩 5종 | 호흡 `.njn-dot--breathe`(인라인) · 궤도 `<OrbitLoader>`(전체화면·대표) · 파동 `<WaveLoader>`(목록) · 링 `<RingLoader>`(버튼 안) · 바 `<BarLoader>`(패널 상단). 상단 페이지 전환 바는 주홍. Tailwind `animate-spin` 금지 |
| 버튼 4상태 | `<ActionButton state>` — 기본 → 잉크(한지색 리플, `.tap-ripple`) → 진행(`.is-busy` 흐린 블루 + 링) → 완료(`.is-done` 네이비 + 체크 그리기) / 실패(`.is-error` 주홍 + 흔들림). `disabled:opacity-*` 금지 |
| 토스트 | 네이비 면 + 한지 글자 + 앞의 숨쉬는 온점. 파괴적 동작은 `showToast(msg, { label: "되돌리기", onClick })` |
| 모먼트 | 네이비 카드 위 온점 심볼 **도장**(0.7s pop) → 제목 → 부제 → 세리프 슬로건. `kind: "welcome"`(로그인) · `"celebrate"`(파문 2겹 + 조각 22개 + 한지 알약, 구독) |
| 빈 화면 | 한지 + 숨쉬는 온점 + 제목 끝 주홍 마침표(`EmptyState` light) |
| 지도 마커 | 사람이 찍은 자리(임장노트·모임 장소) = 브랜드 핀 `brandPin: true`(네이비 핀 + 한지 처마 + 주홍 온점), 선택 시 파문 1회 |
| FAB · 토글 · 관심 · 단계 | `.njn-fab`(네이비 + 2.6s 주홍 파문) · `<Switch>`(켜지면 손잡이가 온점) · `.njn-burst`(하트 파문) · `<Stepper>`(온점이 선을 타고 채워짐) |
| 호버(데스크톱만) | 카드 `.njn-card-bar` 주홍 밑줄 · 사진 위 `.njn-glass` 한지 알약 · 프리미엄 카드 `tiltHandlers()` · 핵심 CTA 하나 `<MagneticLink>`. 한 화면 2종까지 |
| 숫자 | `<CountUp>` 900ms ease-out³ · 온도 게이지 1.1s `--njn-out`. 서버 HTML 은 항상 최종값 |
| AI 진행 | `.run-panel` — 읽은 데이터는 실측과 함께 체크, 마지막 단계만 온점이 숨쉰다. 가짜 진행률 금지 |
| 스플래시 | `<BrandSplash>` — 홈 화면 설치 앱(standalone) 세션당 1회, 1.36s(처마 → 온점 → 이름) |
| 공유 카드 | `/og-image` = 명함 앞면(한지 + 심볼 + 워드마크 + NAEJIP NOW), `/api/og` = 뒷면(네이비 + 슬로건 주홍 온점) |
| 응용(962) | 탭바 현재 탭 = 온점(바뀌면 한 번 튐) · 기록 탭 = 네이비 원 + 주홍 파문 · 알림 배지 주홍 + 파문 · 읽기 진행 바 주홍 · 티커 앞머리 "지금" 온점 칩 · 단지 상세 히어로 네이비 + 워터마크 + 시세 캡션 온점 · 직접 방문 = 도장(`.njn-stamp`) · 활발한 동네 칩 한지 + 온점 · `::selection` 한지 · 404 숨쉬는 온점 · 푸터 잠금 + 슬로건 · 온보딩 첫 줄 슬로건 띠 · 로딩 화면 "지금 불러오는 중" 힌트 · 설치 앱 당겨서 새로고침(온점 물방울) · 메일 머리띠(한지 + 워드마크 + 온점) · PDF 리포트 머리띠 · 매니페스트 스플래시 네이비 |

## 1. 컬러 토큰

CSS 변수(`:root`)가 `@theme inline`을 통해 Tailwind 유틸(`text-primary`, `bg-surface`, `border-line` 등)로 노출된다.

| 토큰 (CSS 변수) | 값 | Tailwind 유틸 | 용도 |
|---|---|---|---|
| `--primary` | `#1d4fd8` | `text-primary` `bg-primary` | 브랜드 파랑 · 링크 · 하락 delta |
| `--primary-strong` | `#16389c` | (hover용, 유틸 없음) | primary hover |
| `--primary-soft` | `#edf2fe` | `bg-primary-soft` | soft 버튼·배너 bg |
| `--ink` | `#191f28` | `text-ink` `bg-ink` | 제목 · 활성 칩 · 툴팁 bg |
| `--danger` | `#d64545` | `text-danger` | 위험 · **상승 delta** |
| `--danger-soft` | `#fbeaea` | `bg-danger-soft` | 위험 bg |
| `--success` / `--success-soft` / `--success-border` | `#1a7f4e` / `#e7f5ee` / rgba(26,127,78,.35) | `text-success` `bg-success-soft` | 성공 상태 3토큰 |
| `--warning` / `--warning-soft` / `--warning-border` | `#946200` / `#fdf3dd` / rgba(148,98,0,.35) | `text-warning` `bg-warning-soft` | 주의 상태 3토큰 |
| `--text-1` | `#333d4b` | `text-text-1` | 본문 |
| `--text-2` | `#6b7684` | `text-text-2` | 보조 |
| `--text-3` | `#8b95a1` | `text-text-3` | 3차 · 브레드크럼 |
| `--bg` | `#f7f9fc` | `bg-bg` | 페이지 배경 |
| `--surface` | `#ffffff` | `bg-surface` | 카드 배경 |
| `--border` / `--border-strong` | `#e9edf3` / `#dbe2ec` | `border-line` / `border-line-strong` | 보더 |
| `--divider` | `#f0f3f8` | `border-divider` | 구분선 단일색 |
| `--disabled-bg` / `--disabled-text` | `#eef1f6` / `#b0b8c1` | — | 비활성 (opacity 금지) |
| `--dim` / `--dim-coach` | rgba(25,31,40,.5) / .7 | — | 딤 단일값 · 코치마크만 .7 |
| `--ai-panel` | rgba(25,31,40,.96) | — | AI 다크 패널 bg |
| `--ai-accent` | `#7ea2ff` | `text-ai-accent` | 다크 위 강조 파랑 |
| `--ai-text` / `--ai-muted` | `#e2e8f2` / `#9aa6b8` | `text-ai-text` `text-ai-muted` | 다크 패널 본문/보조 |

상태색 대비 규칙: soft bg 위 text 대비 4.5:1 유지, 텍스트에 bg색 직접 사용 금지.

## 2. 타이포 램프 (7단, 15a · 957 개정)

폰트: 애플 기기 = 시스템 폰트(SF Pro KR 등), 그 외 = Pretendard 폴백 (`--font-sans`).

| 유틸 | 모바일 | md↑ | lh | 비고 |
|---|---|---|---|---|
| `.t-display` | 24px | 28px | 1.3 | ls -1% · weight 800 · 홈·허브 헤드라인 |
| `.t-title` | 19px | 21px | 1.35 | 화면 제목 (PageShell `title`·`TownPageHead` 와 동일 스펙) |
| `.t-section` | 15px | 15px | 1.4 | 카드 제목 |
| `.t-body` | 13px | 13px | 1.6 | 본문 · 최대 34자/행 |
| `.t-sub` | 12px | 12px | 1.5 | 보조 — 957 에서 11→12 (모바일 실측: 11px 한글은 획이 뭉개졌다) |
| `.t-caption` | 10px | 10px | 1.5 | ls +1% · 캡션·각주·출처 — 957 에서 9→10 |
| `.t-num` | (상속) | | 1.2 | 큰 숫자(가격): 자간 -1% + `tabular-nums` + 800 |

허용 픽셀은 `scripts/check-type-ramp.mjs` 의 `RAMP = {10,12,13,15,19,21,24,28}` 한 곳이 정한다 —
임의 `text-[Npx]`·`text-sm/base/lg/xl/3xl` 는 빌드 게이트가 잡는다(기존 예외는 `type-ramp-baseline.json`).
텍스트 오버플로는 `.clamp-2`(제목 2줄) / `.truncate-1`(목록 1줄).

### 2-1. 좁은 칸 자동 적응 (963)

글이 세로로 길어져 카드가 늘어나는 사고는 거의 항상 **뷰포트 기준 분기(`sm:`·`md:`)를
좁은 칸 안에서 쓴 것**이 원인이다. 화면은 1,290px 인데 그 글이 놓인 사이드바는 340px 이라,
`sm:grid-cols-3` 이 참이 되어 한 칸에 한글 4~5자만 들어간다.

| 도구 | 무엇 | 언제 |
|---|---|---|
| `.fit` | 그 칸을 컨테이너 질의 기준으로(`container-type: inline-size`) | 사이드바·그리드 셀처럼 **좁아질 수 있는 상자**에 |
| `.t-fit` | 칸이 340px/220px 밑으로 내려가면 **램프 안에서 한 단씩** 축소 + 자간 -1~2% + `text-wrap: pretty` | 램프 클래스와 함께 (`t-body t-fit`) |
| `.fit-pair` | 칸이 420px 이상일 때만 좌우 2열(+가운데 화살표), 좁으면 위아래로 쌓기 | "입력 → 결과" 같은 두 칸 비교 |

`AIPanel` 본문은 964 에서 `.fit t-body t-fit` 이 기본값이 됐다 — 같은 패널이 사이드바(340px)에
놓이든 본문 전폭(1,200px)에 놓이든 저절로 같은 밀도로 읽힌다. 새 패널을 만들 때 따로 할 일은 없다.

규칙: **좁은 칸에서 글자 크기를 손으로 낮추지 않는다.** `text-[11px]` 같은 임의값을 쓰는
대신 `.fit` + `.t-fit` 을 붙인다 — 램프(10/12/13/15/19/21/24/28)를 벗어나지 않으므로
`check:type-ramp` 가 그대로 통과하고, 칸이 넓어지면 저절로 원래 크기로 돌아온다.
캡션(10px)은 램프 맨 아래라 크기를 더 내리지 않고 자간만 조인다.

점검(964): `npm run check:narrow-text` — 빌드 후 `next start -p 3100` 을 띄운 상태에서
주요 8개 경로 × 데스크톱/모바일 두 폭을 훑어, **줄당 8자 미만이 3줄 이상 이어지는** 블록을
찾는다. 눈으로 보기 전에 숫자로 잡으려는 것이라 빌드 체인에는 넣지 않았다(서버가 필요).
서버가 없으면 조용히 통과한다.

## 3. 간격 (8pt 스케일, 15a)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--sp-inline` | 8px | 인라인 |
| `--sp-el` | 12px | 요소 간 |
| `--sp-card-in` | 16px | 카드 내부 |
| `--sp-screen` | 20px | 화면 패딩 |
| `--sp-card-gap` | 24px | 카드 사이 |
| `--sp-section` | 32px | 섹션 사이 |

카드 패딩 3종(11~24px 혼재 정리): `--pad-compact` 14px(`.card-pad-sm`) / `--pad-card` 18px(`.card-pad`) / `--pad-hero` 22px(`.card-pad-lg`).

라디우스 관례: 칩 999 / 버튼 10~14(높이 비례: 52→14, 40→11, 32→9) / 카드 14~20 / 시트 24~28.

## 4. 그림자 (3단, 15b)

| 토큰 | 값 | 용도 |
|---|---|---|
| (플랫) | 보더만 | 본문 카드 기본 (`.card`) |
| `--shadow-sm` | 0 4px 14px rgba(16,28,54,.08) | 호버(`.card-hover:hover`) · 드롭다운 |
| `--shadow-lg` | 0 12px 32px rgba(16,28,54,.14) | 모달 · 플로팅 · 토스트 |
| `--shadow-cta` | 0 6px 18px rgba(29,79,216,.28) | CTA 전용(`.btn-cta`) |

하위호환 별칭: `--shadow-card` `--shadow-glass` = sm, `--shadow-float` = lg. 보더+그림자 동시 사용 금지(글래스 제외).

## 5. 모션 토큰 (19e)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--dur-xs` | 120ms | 탭 피드백 · 닫힘 · 스켈레톤 크로스페이드 |
| `--dur-sm` | 200ms | 모달 등장 · 헤더 숨김 · UI 상태 전환 |
| `--dur-md` | 300ms | 공유 요소 전환 · 성공 체크 |
| `--dur-lg` | 600ms | 차트 draw-in · 게이지 · 딥링크 펄스 |
| `--ease-out` | cubic-bezier(.2,.8,.2,1) | 등장·전환 기본 |
| `--ease-inout` | cubic-bezier(.45,0,.25,1) | 왕복·모프·패럴랙스 |
| `--stagger` | 40ms | 목록 스태거 간격 |

별칭: `--dur-tap`=xs, `--dur-ui`=sm, `--dur-page`=md. `prefers-reduced-motion`이면 등장 애니메이션은 150ms 페이드로 축소, 펄스/셰이크/스켈레톤/transform 피드백은 제거된다 (globals.css가 자동 처리 — 개별 대응 불필요).

### 모션 유틸

| 유틸 | 동작 | 규칙 |
|---|---|---|
| `.rise-in` ~ `.rise-in-6` | 아래→위 등장 (300ms) · 40ms 스태거 | 목록 스태거는 **최대 8개** · 스크롤 유입분은 즉시 표시 |
| `.modal-in` | scale .96→1 (200ms) | 바운스 금지 · 닫힘은 120ms |
| `.sheet-in` | 아래에서 슬라이드 (300ms) | 바텀시트 |
| `.pulse-once` | 배경 파랑 펄스 1회 (600ms) | 딥링크 착지 강조 |
| `.shake` | 좌우 4px 2회 (240ms) | 입력 에러 |
| `.alert-in` | 위에서 슬라이드+정지 (200ms) | 위험 경고 — 페이드 금지 |
| `.fade-in` | 페이드 (120ms) | 스켈레톤→콘텐츠 크로스페이드 |
| `.skeleton` | 시머 루프 | 로딩 플레이스홀더 |

### 라이브 모션 (2026-07)

"화면이 살아 있다"는 감각을 담당하는 두 번째 층. 등장 연출(`.rise-in-*`)이 **로드 직후**를 맡는다면, 이쪽은 **이동·대기·성사**의 순간을 맡는다.

| 유틸 / 속성 | 동작 | 규칙 |
|---|---|---|
| `.page-enter` | `<body>` 페이드 0.45→1 (`--dur-page`) | `PageTransition` 이 경로 변경 시 자동으로 붙였다 뗀다 — **직접 쓰지 않는다** |
| `.nav-progress` + `.nav-progress-bar` | 상단 2.5px 브랜드 그라데이션 진행바 | `NavigationProgress` 전용. 링크에 `data-no-progress="true"` 를 주면 그 링크는 제외 |
| `data-reveal=""` | 화면에 들어올 때 14px 위로 + 페이드 (520ms) | **속성 하나로 켠다** — 서버 컴포넌트에서도 import 없이 사용. 첫 화면 아래 블록에만 |
| `.tap-ripple` | `:active` 시 가운데서 퍼지는 파문 (420ms) | CSS 전용(JS 없음). `Button` 에 이미 포함 |
| `.pending-spin` | 720ms 회전 루프 | 버튼 안 스피너 — `<Button loading>` 이 자동 표시 |
| `.pending-bar` | 좌→우 왕복 인디케이터 | 진행률을 모를 때만. 아는 경우엔 실제 퍼센트 바를 쓴다 |
| `.moment-*` | 링 그리기 → 체크 → 잔물결 (약 1.5초) | `useMoment().showMoment()` 로만 재생. 마크업 직접 작성 금지 |

지켜야 할 것 네 가지:

1. **같은 요소에 `rise-in-*` 과 `data-reveal` 을 함께 걸지 않는다.** 둘 다 `animation` 단축 속성을 써서 뒤에 선언된 쪽이 앞을 지운다.
2. **본문 전환에 `transform`·`filter` 를 쓰지 않는다.** 자손 `position: fixed`(하단 탭바)의 컨테이닝 블록이 만들어져 긴 페이지에서 탭바가 화면 밖으로 밀린다. 페이지 전환이 불투명도만 쓰는 이유다.
3. **`fill-mode: both` 로 끝나는 키프레임의 마지막 프레임에 `translateY(0)` 을 두지 않는다.** `transform: none` 으로 끝내야 한다 — 이동량 0인 transform 도 컨테이닝 블록을 만든다(#227).
4. **새 모션 클래스를 추가하면 globals.css 의 `prefers-reduced-motion` 블록에 같이 적는다.** 빠뜨린 클래스는 그대로 움직인다.

`showMoment()` 는 저장·로그인·가입·결제 완료·신청 접수처럼 **결과가 확정된 순간**에만 부른다. "알아 두세요" 는 `useToast()` 쪽이다. 그리고 확정되지 않은 상태(결제 웹훅 대기, 심사 전)에 성공 장면을 띄우지 않는다 — 연출이 화면의 문구보다 앞서 말하면 그건 잘못된 정보다.

## 6. 유틸 클래스 카탈로그

### 서피스

| 유틸 | 설명 | 규칙 |
|---|---|---|
| `.glass` | 반투명 + blur 22px | **헤더·탭바·플로팅 전용** · backdrop-filter 미지원 시 자동 불투명 폴백 |
| `.glass-strong` | 더 진한 글래스 + `--shadow-lg` | 탭바·플로팅 시트 |
| `.card` | 불투명 서피스 + 보더 + r16 | 본문 카드 기본 · 그림자 없음(플랫) |
| `.card-hover` | hover 시 -2px 리프트 + sm 그림자 | 클릭 가능한 카드에만 |
| `.ai-panel` | 잉크 다크 패널 r16 | AI 결과 전용 — 가급적 `AIPanel` 컴포넌트 사용 |
| `.ai-chip` | 파랑 "AI" 정사각 뱃지 | AIPanel 헤더용 |
| `.scrim` | 이미지 위 텍스트 스크림 | 하단 62% 고정 그라데이션 |

### 버튼 (스타일 × 사이즈 조합)

| 유틸 | 위계 | 비고 |
|---|---|---|
| `.btn-primary` | 1순위 채움 | **화면당 1개** (파랑 다이어트) |
| `.btn-cta` | primary + CTA 그림자 | `.btn-primary`와 함께 사용 |
| `.btn-outline` | 2순위 보조 | 1.5px primary 보더 |
| `.btn-secondary` | 보조 (surface+보더) | |
| `.btn-soft` | soft 파랑 bg | |
| `.btn-ghost` | 3순위 · 목록 내 | bg색만 |
| `.btn-lg` / `.btn-md` / `.btn-sm` | 사이즈: 52/40/32px | 라디우스 14/11/9 (높이 비례) |
| `.icon-btn` | 아이콘 버튼 40px 정사각 고정 | 모바일 히트 44px 확보 |

disabled는 클래스 무관 공통: `--disabled-bg` + `--disabled-text`, 그림자·transform 제거.

### 칩 (15c — 역할별 모양 분리)

| 유틸 | 모양 | 역할 |
|---|---|---|
| `.chip` / `.chip-active` | 풀라운드 999 · 활성 = **잉크** bg | 필터 칩(단일선택) — 활성색에 파랑 금지 |
| `.chip-soft` | 풀라운드 · soft 파랑 | 강조 칩 |
| `.chip-check` / `.chip-check-active` | r9 + 체크 · 활성 = 파랑 틴트 | 다중선택 칩 |
| `.chip-tag` | r6 · bg색 | 태그 — **비인터랙티브** |

### 입력 (15c)

| 유틸 | 설명 |
|---|---|
| `.input` | 기본: r9 · focus 시 1.5px primary 보더 + 3px 링 |
| `.input-error` / `.input-success` | 에러 1.5px danger / 성공 success 보더 |
| `.input-msg` | 에러 문구 예약 공간 min-height 16px (레이아웃 점프 방지) |

### 상태 배지·배너·기타 (15b·15d)

| 유틸 | 설명 | 규칙 |
|---|---|---|
| `.state-success/-warning/-danger` | soft bg + 상태색 텍스트 배지 | |
| `.state-*-line` | 보더형 배지 | |
| `.banner-info/-warning/-danger` | r12 배너 | 정보·프로모 = 항상 ✕ 닫기 / 안전 경고 = 닫기 없음 |
| `.toast` / `.toast-action` | 잉크 토스트 r12 | 탭바 위 12px · 3초 · 동시 1개 · 액션 링크 최대 1개 |
| `.tooltip` | 잉크 툴팁 | 최대 2줄 · 링크·버튼 포함 금지 |
| `.divider` | 1px `--divider` | 밀집 목록(설정·표)에만 · 카드 안 이중 구분 금지 |
| `.table-num` / `.table-row` / `.table-zebra` | 숫자 우측정렬(tabular) · 행 구분 · 얼룩말 | 행 높이 36(컴팩트)/44(기본) · 얼룩말은 8행 이상일 때만 |
| `.delta-up` / `.delta-down` / `.delta-flat` | 상승 red / 하락 blue / 보합 회색 | 시세 관례 — 뒤집기 금지 |
| `.safe-top` / `.safe-bottom` | 세이프에어리어 패딩 | 카메라섬·홈 인디케이터 |
| `.tabbar-autohide` | 입력 포커스 시 탭바 숨김 | TabBar nav에 부여됨 |

## 7. 공용 컴포넌트 (`app/components/`)

모두 `@/app/components/...` 별칭 또는 상대경로로 import. **공유 파일이므로 수정 금지, 사용만.**

| 컴포넌트 | Props | 설명 |
|---|---|---|
| `PageShell` | `children` · `title?: string` · `breadcrumb?: string` · `wide?: boolean`(기본 false) | 글래스 헤더 + 본문 컨테이너(max-w 1240 / wide 1400) + 모바일 탭바. title은 `.t-title` 스펙 + `.rise-in`으로 렌더 |
| `Header` | 없음 (client) | 글래스 플로팅 GNB. 데스크탑 메뉴(홈·임장노트·지도·AI 분석·동네이야기)+검색+CTA, 모바일 로고+아이콘. PageShell이 포함하므로 직접 쓸 일 거의 없음 |
| `TabBar` | 없음 (client) | 모바일 하단 글래스 탭바 (`md:hidden`). IA: 홈·발견(/discover)·노트(＋ 중앙)·지도·마이. 키보드 열림 시 자동 숨김 |
| `AIPanel` | `title: string` · `children` · `className?` | AI 결과 잉크 다크 패널 — AI 칩 + 제목 + 본문(`--ai-text`). AI 결과는 반드시 이 컴포넌트로 |
| `Logo` / `HouseMark` | `size?: number`(기본 21) | 브랜드 로고(집 마크 + "내집나우") / 마크 단독 |
| `TopScoutBadge` | `className?` | ◈ 탑 임장러 배지 — 최상위 활동 배지, **구매 불가** |
| `HoloAvatar` (TopScoutBadge.tsx) | `size?: number`(기본 52) · `label?: string` | 홀로그램 conic 링 아바타 |

```tsx
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { TopScoutBadge, HoloAvatar } from "@/app/components/TopScoutBadge";

<PageShell title="AI 분석" breadcrumb="홈 › 분석">
  <AIPanel title="AI 시세 요약">전세가율이 3개월 연속…</AIPanel>
</PageShell>
```

## 8. 기타 전역 규칙

- 서버 컴포넌트 기본, 상호작용 필요 시에만 `"use client"`.
- 포커스 링: 전역 `:focus-visible` 2px primary · 오프셋 2px (별도 지정 불필요).
- 배경 앰비언스: body에 그라데이션 블롭 2장 고정(blur 부하 최소화) — 페이지에서 추가 블롭 금지.
- 이미지 실사용 금지 — 그라데이션 플레이스홀더 div + 라벨. 광고 슬롯은 항상 "AD" 라벨.
- 다크 모드는 v1.1로 연기 — 구현 금지.
