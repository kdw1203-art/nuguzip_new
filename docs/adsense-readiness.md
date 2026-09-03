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

## 신청 절차 (때가 되면)
1. 사장님: adsense.google.com 가입 → 사이트 추가(naezipnow.com) → 코드 스니펫 발급
2. Claude: 스니펫을 AdSlot 인프라에 연결(자리 이미 있음) + ads.txt 배치 → 배포
3. 심사 대기(수일~2주) — 그동안 하우스 광고 유지
4. 승인 후: 광고 밀도 정책(콘텐츠 대비 과밀 금지)은 AdSlot 정책 코드가 이미 준수
