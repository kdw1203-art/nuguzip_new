# 애드센스 신청 준비 점검표

> [개선 #30] 지금 신청하면 반려 가능성이 높다 — 기준을 채우고 한 번에 통과한다.
> (2026-08-22 실측 기준)

## 현재 상태 (실측)
| 항목 | 승인에 필요한 수준 | 현재 | 판정 |
|---|---|---|---|
| 자체 콘텐츠 | 수십 편의 실질 콘텐츠 | 자체 요약 뉴스 330+ / 노트 18 | △ (뉴스는 인정 가변) |
| 트래픽 | 일 수십~수백 방문 권장 | 일 1~13 세션 | ✗ |
| 필수 페이지 | 소개·연락처·개인정보처리방침 | 전부 있음 | ✓ |
| 사이트 완성도 | 빈 화면·죽은 링크 없음 | 카테고리 정비 완료 | ✓ |
| 광고 슬롯 코드 | 정책 준수 배치 | AdSlot 인프라 완비(하우스 광고 가동) | ✓ |

## 신청 시점 기준 (이 두 지표를 넘기면 신청)
- 일 방문 **50 세션 이상 2주 연속** (Web Analytics 로 측정 — 로드맵 #50)
- 공개 임장노트 **30편 이상** (시드 스프린트 #16 완료 시 충족)

## 2026-09-03 — 코드 삽입 완료 (소유자 신청 진행)

소유자가 애드센스에 naezipnow.com 을 추가하고 스니펫(`ca-pub-6291134577962996`)을 전달했다.
사이트 연결 확인 세 방식을 전부 갖춰 두었다 — 어느 것을 골라도 통과한다.

| 방식 | 위치 | 확인 |
|---|---|---|
| 코드 스니펫 | `app/layout.tsx` `<head>` — 공식 `<script async src=…adsbygoogle.js?client=…>` 그대로, 모든 페이지 정적 HTML | `curl -s https://naezipnow.com \| grep adsbygoogle` |
| ads.txt | `app/ads.txt/route.ts` → `google.com, pub-6291134577962996, DIRECT, f08c47fec0942fa0` | https://naezipnow.com/ads.txt |
| 메타 태그 | `metadata.other["google-adsense-account"]` | 페이지 소스 `<meta name="google-adsense-account">` |

광고 **요청**은 `adsbygoogle.pauseAdRequests=1` 로 잠근 채 시작하고, `AdSenseLoader` 가
제외 경로(`/payment`·`/my`·`/subscription`·`/map` …)와 광고 없는 플랜(pro/expert/enterprise)
판정을 마친 뒤에만 푼다. 스크립트는 어디에나 있지만 광고는 정책이 허용하는 자리에만 나온다.
심사 중 빈 슬롯은 하우스 광고(`lib/ads/house-ads.ts`)가 채운다.

## 광고 공간 (961 · 2026-09-03 소유자 요청 "광고를 넣을 수 있는 공간")

한 자리에 두 층: **애드센스 유닛**(승인·채움 시) 위에 **대체 카드**(어드민 배너 → 하우스 광고).
CSS 가 `<ins data-ad-status>` 를 읽어 채워지면 대체 카드를, 안 채워지면 빈 유닛을 숨긴다 —
심사 중에도 빈 상자가 남지 않는다. 컴포넌트: `app/components/ads/AdZone.tsx`.

| 공간(placement) | 어디 | env(전용 단위 ID) |
|---|---|---|
| `home_feed` | 홈 피드 6번째 카드 아래 · 홈 하단 | `NEXT_PUBLIC_ADSENSE_SLOT_HOME_FEED` |
| `community_feed` | 동네이야기 피드(8번째마다) · 공매 · 입주 · 청약 · Q&A 목록 | `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED` |
| `report_free_body` | 리포트 본문 안 | `NEXT_PUBLIC_ADSENSE_SLOT_REPORT_BODY` |
| `article_end` | 임장노트 · 가이드 · 용어 상세 글 끝 | `NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_END` (지정 시 인아티클 fluid) |
| `page_bottom` | 지역 · 실거래 · 분석 허브 · Q&A 상세 · 뉴스 목록 맨 아래 | `NEXT_PUBLIC_ADSENSE_SLOT_PAGE_BOTTOM` |
| `sidebar` | 데스크톱 오른쪽 열(단지 상세 · 뉴스 상세 · 홈 · 실거래 · 리포트) | `NEXT_PUBLIC_ADSENSE_SLOT_WEB` |

env 를 안 넣으면 전부 공용 디스플레이 단위(`9196083291`)로 나간다. 애드센스에서 공간별 광고
단위를 만들면 Vercel 환경변수에 위 이름으로 넣고 재배포 — 코드 수정 없음.

배치 원칙: 도구의 입력·결과 사이 금지, 한 화면 최대 2곳, 고정·팝업 금지, 항상 "광고" 라벨,
제외 경로(`/payment`·`/my`·`/subscription`·`/map`·`/notes/new`·`/agent` …)와 프로 이상 플랜은 전부 미노출.

## 신청 절차 (때가 되면)
1. 사장님: adsense.google.com 가입 → 사이트 추가(naezipnow.com) → 코드 스니펫 발급
2. Claude: 스니펫을 AdSlot 인프라에 연결(자리 이미 있음) + ads.txt 배치 → 배포
3. 심사 대기(수일~2주) — 그동안 하우스 광고 유지
4. 승인 후: 광고 밀도 정책(콘텐츠 대비 과밀 금지)은 AdSlot 정책 코드가 이미 준수
