# 누구집 디자인 시스템 (#50)

> 근거 소스: `app/globals.css` (단일 소스). 이 문서는 요약본이며, 값이 다르면 항상 `globals.css`가 우선한다.
> 스택: Next.js App Router + Tailwind v4 (`@theme inline`으로 CSS 변수 → Tailwind 색 토큰 매핑).

## 핵심 규칙 (요약)

| 규칙 | 내용 |
|---|---|
| 파랑 다이어트 | 채움 `.btn-primary`는 **화면당 1개**. 보조는 `.btn-outline`, 3순위·목록 내는 `.btn-ghost`. 필터 칩 활성색은 파랑이 아니라 **잉크**(`.chip-active`) |
| 시세 관례 | **상승 = red**(`.delta-up`, `#d64545`) / **하락 = blue**(`.delta-down`, `#1d4fd8`) / 보합 `.delta-flat`. 국내 시세 관례이므로 절대 뒤집지 않는다 |
| AI 잉크 패널 | AI 분석 결과는 항상 잉크 다크 패널(`.ai-panel`, `AIPanel` 컴포넌트)로 표시. 다크 위 파랑은 `--ai-accent`(#7ea2ff)만 사용 — `#1d4fd8` 직접 사용 금지(대비 부족) |
| 글래스 제한 | `.glass` `.glass-strong`은 **헤더·탭바·플로팅 요소 전용**. 본문 카드는 불투명 `.card` |
| 그림자 | 3단만: 플랫(보더만, 본문 카드) / `--shadow-sm`(호버·드롭다운) / `--shadow-lg`(모달·플로팅). **보더+그림자 동시 사용 금지**(글래스 제외) |
| 모션 | `--dur-xs/sm/md/lg` 4단 + 이징 2종(`--ease-out`, `--ease-inout`)만 사용. 커스텀 duration/easing 값 금지 |
| 상태색 | 상태 텍스트에 soft(bg)색 직접 사용 금지 — bg/border/text 3토큰 세트로만 (`--success*` `--warning*` `--danger*`) |
| disabled | `opacity` 금지 — `--disabled-bg`(#eef1f6) + `--disabled-text`(#b0b8c1) |
| 국문 조판 | `word-break: keep-all` 전면 적용(body), 자간 -1% |

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

## 2. 타이포 램프 (7단, 15a)

폰트: 애플 기기 = 시스템 폰트(SF Pro KR 등), 그 외 = Pretendard 폴백 (`--font-sans`).

| 유틸 | 크기 | lh | 비고 |
|---|---|---|---|
| `.t-display` | 28px | 1.3 | ls -1% · weight 800 · 홈 헤드라인 |
| `.t-title` | 21px | 1.35 | 화면 제목 (PageShell `title`과 동일 스펙) |
| `.t-section` | 15px | 1.4 | 카드 제목 |
| `.t-body` | 13px | 1.6 | 본문 · 최대 34자/행 |
| `.t-sub` | 11px | 1.5 | 보조 |
| `.t-caption` | 9px | 1.5 | ls +1% · 캡션·각주·출처 |
| `.t-num` | (상속) | 1.2 | 큰 숫자(가격): 자간 -1% + `tabular-nums` + 800 |

10/12/14/16px 등 임의 크기 혼용 금지 — 램프로 스냅. 텍스트 오버플로는 `.clamp-2`(제목 2줄) / `.truncate-1`(목록 1줄).

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
| `Logo` / `HouseMark` | `size?: number`(기본 21) | 브랜드 로고(집 마크 + "누구집") / 마크 단독 |
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
