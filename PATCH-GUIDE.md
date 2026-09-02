# 내집나우 최적화 패치 — 적용 가이드

작성: 2026-08-05 · 대상: `nuguzip-homepage` (Next.js App Router, Vercel)

이 번들은 **새로 추가만 하면 되는 파일**과, **기존 파일에 가할 정확한 편집**으로 나뉩니다.
새 파일은 그대로 복사하면 되고, 기존 파일 편집은 아래 지시대로 하시면 됩니다.

---

## 0. 먼저 — 현재 상태 실측 (배포 전 기준선)

```bash
node scripts/audit-sitemap-canonical.mjs --n 120 --map complexes
```

2026-08-05 프로덕션 실측 결과:

```
총 25,746개 / 표본 120
canonical 불일치 : 36 (30%)  → 추정 영향 약 7,700개 URL
noindex          : 0
canonical 없음   : 0
비200 응답       : 0
```

pairs(709) · regions(61) · tx(1,617) 는 불일치 0%로 **정상**입니다.
문제는 `sitemap-complexes.xml` 하나입니다.

이 스크립트는 CI 게이트로도 쓸 수 있습니다 (불일치 있으면 exit 1).

---

## 1. 새로 추가할 파일 (그대로 복사)

| 파일 | 역할 |
|---|---|
| `lib/seo/complex-url.ts` | 단지 URL 단일 진실 공급원. 사이트맵·canonical·내부링크가 전부 이걸 씀 |
| `components/seo/FaqJsonLd.tsx` | FAQPage / Article JSON-LD. 네이버 AI 브리핑 인용 겨냥 |
| `scripts/audit-sitemap-canonical.mjs` | 사이트맵↔canonical 정합성 감사 |
| `supabase/migrations/20260805_harden_public_rpcs.sql` | anon 노출 RPC 하드닝 — **TIER 1 은 프로덕션 적용 완료** |

> **이미 적용된 것 (2026-08-05):**
> `set_automation_script` 를 PUBLIC 에서 회수 (임의 스크립트 주입 경로 차단) +
> `complex_tx_stats_base` 머티리얼라이즈드 뷰의 anon 직접 조회 차단.
> 적용 후 `search_complexes_preview` 정상, 주요 페이지 5개 전부 200 확인.
> `is_admin_request()` 는 RLS 정책 30건 이상이 호출하므로 **의도적으로 제외**했습니다.
> 저장소의 SQL 파일은 기록용 사본입니다.

---

## 2. 기존 파일 편집

### 2-1. 사이트맵 — `app/sitemap-complexes.xml/route.ts` (또는 동등 위치)

**핵심**: URL 문자열을 직접 만들지 말고 `complexUrl()`만 호출하도록 바꿉니다.
이것 하나로 불일치가 구조적으로 불가능해집니다.

```diff
+ import { complexUrl, shouldIndexComplex } from '@/lib/seo/complex-url'

  const { data } = await supabaseAdmin
    .from('apartment_complexes')
-   .select('id, name, address')
+   .select('id, external_id, source_key, name, address')
    ...

- const urls = data.map((c) => `https://nuguzip.com/complex/${encodeId(c)}`)
+ const urls = data
+   .filter(shouldIndexComplex)              // ← 2-3 선별 색인과 짝을 이룸
+   .map((c) => complexUrl({
+     kaptCode: c.source_key === 'k-apt-basic' ? c.external_id : null,
+     legacyId: c.id,
+     regionName: c.region_name ?? null,
+     complexName: c.name ?? null,
+   }))
```

> **DB 메모**: `apartment_complexes.source_key` 가 `'k-apt-basic'` 인 행
> **22,080개**만 `external_id` 가 K-apt 코드(`A10019979` 형태)입니다.
> 나머지 `reb-name-alias`(8,905) · `reb-complex-id`(8,799) 는 코드가 없으므로
> `kaptCode: null` 로 넘기면 `complexPath()` 가 알아서 legacyId 경로를 씁니다.
> 실제 컬럼 매핑은 사이트맵 코드가 지금 쓰고 있는 소스에 맞춰 조정하십시오.

### 2-2. canonical — `app/complex/[id]/page.tsx` 의 `generateMetadata`

**같은 함수를 씁니다.** 이게 핵심입니다.

```diff
+ import { complexUrl, shouldIndexComplex } from '@/lib/seo/complex-url'

  export async function generateMetadata({ params }) {
    const c = await getComplex(params.id)
+   const url = complexUrl({
+     kaptCode: c.kapt_code ?? null,
+     legacyId: c.id,
+     regionName: c.region_name ?? null,
+     complexName: c.name ?? null,
+   })
    return {
      title: ...,
      description: ...,
-     alternates: { canonical: `https://nuguzip.com/complex/kapt.${c.kapt_code}` },
+     alternates: { canonical: url },
+     openGraph: { url },
+     robots: shouldIndexComplex(c)
+       ? { index: true, follow: true }
+       : { index: false, follow: true },   // 링크는 따라가되 색인 제외
    }
  }
```

### 2-3. 선별 색인 — 왜 2.5만 개를 다 올리면 안 되는가

현재 자동 생성 : 사람이 쓴 콘텐츠 비율이 **25,746 : 22 (0.08%)** 입니다.
2026년 3월 코어 업데이트 이후 구글의 *scaled content abuse* 정책이 정확히
이 프로파일을 겨냥합니다. 실제로 상당수 단지 페이지가
"시세 준비 중 · 실거래 수집 중 · 노트 0 · 매물 등록 대기" 상태입니다.

`shouldIndexComplex()` 기준: **실거래 3건 이상 OR 노트 1건 이상 OR Q&A 1건 이상.**
노트나 Q&A가 붙는 순간 자동으로 색인 대상으로 승격되므로,
**UGC 가 색인을 여는 열쇠**가 되어 노트 작성 인센티브와도 맞물립니다.

1차 제출 목표: **2,000~5,000개**.

### 2-4. 기존 URL 301 흡수 — ⚠️ 2-1/2-2 배포 1주 후에 켜기

canonical을 먼저 맞추고, 구글이 새 표준을 인지한 뒤에 리다이렉트를 켜는 것이
안전한 순서입니다. 한 번에 다 바꾸면 문제가 생겼을 때 원인 분리가 어렵습니다.

```ts
// app/complex/[id]/page.tsx 상단
import { permanentRedirect } from 'next/navigation'
import { complexPath } from '@/lib/seo/complex-url'

const canonical = complexPath({ ... })
const current = `/complex/${params.id}`
if (decodeURIComponent(current) !== decodeURIComponent(canonical)) {
  permanentRedirect(canonical)   // 308
}
```

### 2-5. TTFB — DB 쪽은 이미 처리했습니다

> **적용 완료 (2026-08-05)**: `supabase/migrations/20260805_query_performance_indexes.sql`
> pg_stat_statements 상위 쿼리를 EXPLAIN (ANALYZE, BUFFERS) 로 뜯어 인덱스 3개를 추가했습니다.
>
> | 쿼리 | Before | After | 배수 |
> |---|---|---|---|
> | 단지 상세 kaptCode 조회 (1,354회/평균 33.3ms) | 7.61ms · 버퍼 5,700 | **0.077ms · 버퍼 3** | ~100× |
> | 지도 거래량 상위 단지 (68회/평균 76.2ms) | 64.2ms · seq scan 32,275행 | **0.24ms · Index Only** | ~264× |
> | 지역 실거래 목록 (591회/평균 ~148ms) | 94.6ms · 힙 블록 1,873 | **6.36ms · Heap Fetches 0** | ~15× |
>
> 프로덕션 TTFB 실측: 단지 페이지 1.0~1.6s → **0.28~0.29s**.
> 인덱스 총 41MB 추가 (DB 1,084MB → 1,126MB), 전부 `CREATE INDEX CONCURRENTLY` 무중단.

아래는 아직 남은 **앱 쪽** TTFB 작업입니다.

### 2-5b. 캐시 헤더 — `app/complex/[id]/page.tsx` + `next.config.js`

실사용자 Core Web Vitals(최근 14일) 실측:
LCP·CLS·INP는 **양호**한데 TTFB만 `good 1,877 / 개선필요 2,041 / poor 229`
= **45%만 양호**입니다. 크롤러에게 TTFB는 곧 크롤 예산입니다.

응답 헤더가 `cache-control: public, max-age=0, must-revalidate` 라
`x-vercel-cache: HIT` 인데도 매 요청이 재검증을 돕니다.

```ts
// app/complex/[id]/page.tsx
export const revalidate = 1800          // 현재 x-nextjs-stale-time: 300 → 30분으로 상향
export const dynamic = 'force-static'
```

```js
// next.config.js
async headers() {
  return [{
    source: '/complex/:path*',
    headers: [{
      key: 'Cache-Control',
      value: 'public, s-maxage=1800, stale-while-revalidate=86400',
    }],
  }]
}
```

### 2-6. 가입 퍼널 — `app/signup/page.tsx`

이벤트 실측: `signup_step_1` **18** → `signup_step_3` **2** → `signup_complete` **1**
(**완주율 5.6%**, step_1→step_3 구간에서 89% 이탈).
`onboarding_tour_skip` 7 vs `complete` 4 (스킵률 64%).

현재 가입 화면이 요구하는 것: 페르소나 선택 → 관심지역 최대 3곳 →
이메일·비밀번호·비밀번호 확인 → 동의 3종. **한 번에 너무 많습니다.**
로그인 화면 카피("구글 계정으로 3초면 시작할 수 있어요")와도 어긋납니다.

권장 구조:

1. **1단계 = 구글 원클릭 단독.** 이메일 가입은 "다른 방법으로 가입" 뒤로 접기
2. **페르소나·관심지역은 가입 후로 이동** — 첫 노트를 쓸 때나 홈에서 물어보기
3. 마케팅 수신·위치정보 동의는 **필요한 순간에** 요청 (지금은 선택 체크지만 인지 부하)
4. `soft_signup_prompt_view` 가 30일간 **1건**뿐 — 소프트 가입 유도가 사실상
   노출되지 않고 있습니다. 노트 임시저장 후 이탈 시점에 트리거되는지 확인 필요

목표: 완주율 5.6% → **25%+**

### 2-7. 뉴스 상세 — 언론사 이미지 제거

`/town/news/[id]` 가 `img8.yna.co.kr`(연합뉴스) 이미지를 표시 중입니다.
보도사진은 기사와 **별개의 독립 저작물**이라 인용 항변이 가장 어렵습니다.
이미지 표시를 중단하고 제목 + 언론사명 + 원문 직링크 구조로 바꾸십시오.

> 잘하신 것: 뉴스 페이지에 이미 `robots: noindex, follow` 가 걸려 있어
> 중복 콘텐츠 리스크는 차단돼 있습니다.

### 2-8. FAQ 스키마 적용 대상

`components/seo/FaqJsonLd.tsx` 를 아래에 붙입니다.

- `/glossary/*` (56개 — 이미 있는 자산)
- `/guides/regulations`, `/guides/contract`, `/methodology`
- 신규 정보성 페이지: **임장 체크리스트 / 임장이란 / 임장 갈 때 확인할 것 / 갭투자 계산법**

규칙 3가지 (안 지키면 스키마만 넣어도 효과 없음):
1. **첫 문단에 직답**을 배치. 배경 설명은 뒤로
2. 화면에 실제로 보이는 Q&A 와 스키마 내용이 **일치**해야 함
3. **발행일·수정일 노출**. 신선도 가중이 큼

---

## 3. 코드 밖에서 이번 주에 해야 할 것

### 측정 (지금 전부 꺼져 있음)

- [ ] **Vercel Web Analytics 활성화** — 현재 비활성(API 404). 유입 측정 자체가 안 되는 상태
- [ ] `analytics_events` · `user_onboarding` · `feature_usage_events` · `reengagement_log`
      전부 **0행**. 테이블은 있는데 기록 배선이 안 돼 있습니다
- [ ] `seo_index_coverage` 가동 — GSC 사이트맵별 색인률 주간 기록
- [ ] GSC 에서 "대체 페이지(적절한 표준 태그 있음)" 개수 확인 → 패치 후 감소하는지 추적

### AI 비용 방어

`feature_trial_usage` · `consume_feature_quota` · `plan_entitlements` 가 이미
있습니다. **배선만 확인**하십시오. 비로그인은 IP+일 단위 상한, 로그인 무료는
월 상한. 이게 없으면 트래픽이 늘어난 날 OpenAI 청구서로 알게 됩니다.

### 법적 (트래픽 늘리기 전)

- [ ] 통신판매업 신고 완료 → 푸터 "신고 진행 중" 을 실제 번호로 교체
- [ ] `/dev-deals` 총사업비 0.3~0.9% 성사 수수료 → **부동산 전문 변호사 자문**
      (무등록 중개업: 3년 이하 징역 또는 3천만원 이하 벌금)
- [ ] 개인정보처리방침 CPO 성명·연락처 "미정" 해소 (5분)
- [ ] 민간 데이터 적재 여부 감사 — 특히 `public_property_records` 코멘트의 KB시세
- [ ] `navigator.geolocation` 결과가 서버로 전송되는지 확인 → 전송 시 위치기반서비스사업 신고
- [ ] AdSense **지금 신청 금지** (고유 콘텐츠 0.08%, 거절 이력이 재신청에 불리)

---

## 4. 배포 순서 (권장)

```
1일차  lib/seo/complex-url.ts 추가 → 사이트맵·canonical 일원화 (URL_STYLE='code')
       → 배포 → node scripts/audit-sitemap-canonical.mjs 로 불일치 0 확인
       → GSC 에 sitemap-complexes.xml 재제출
2일차  선별 색인(shouldIndexComplex) 적용 → 제출 URL 2,000~5,000개로 축소
3일차  Supabase TIER 1 마이그레이션 + Vercel Web Analytics 활성화
1주차말 TTFB 캐시 헤더 · 가입 퍼널 단순화
2주차  301 리다이렉트 활성화 (1일차 변경이 안정된 것 확인 후)
       FAQ 스키마 + 정보성 페이지
```

---

## 5. 검증

```bash
# 사이트맵 정합성 (불일치 0 이어야 통과)
node scripts/audit-sitemap-canonical.mjs --n 120 --map complexes

# 로컬 빌드 대상으로도 가능
node scripts/audit-sitemap-canonical.mjs --origin http://localhost:3000 --n 20

# 배포 후 개별 확인
curl -s https://nuguzip.com/complex/kapt.A10027336 | grep -o '<link rel="canonical"[^>]*'
curl -s https://nuguzip.com/sitemap-complexes.xml | grep -c '<loc>'
curl -s https://nuguzip.com/sitemap-complexes.xml | grep -c 'kapt\.'   # 0 → 대부분으로 바뀌어야 정상
```

CI 에 물리려면:

```yaml
- run: node scripts/audit-sitemap-canonical.mjs --origin ${{ env.PREVIEW_URL }} --n 40
```
