# 인스타 릴스 · 유튜브 쇼츠 자동 업로드 — 후속 절차 (2026-08-13)

구조는 배포돼 있습니다. 이 문서의 절차(모두 소유자 계정 권한 필요)를 마치면
관리자 API 로 큐에 넣은 영상이 15분 주기로 자동 발행됩니다.

## 파이프라인 개요

```
[영상 업로드]                [큐 등록]                    [자동 집행 — 15분마다]
Supabase Storage      →   POST /api/admin/social-uploads   →   pg_cron → /api/cron/social-upload-drain
social-videos 버킷         (관리자 로그인 상태)                  ├─ Instagram Graph API (릴스 발행)
(공개 URL 확보)                                                └─ YouTube Data API (쇼츠 업로드)
```

- 큐·상태 원장: `public.social_uploads` (서비스롤 전용 · 대상별 상태 분리 — IG 성공/YT 실패
  같은 반쪽 성공이 그대로 보이고, 재시도는 실패한 쪽만 다시 집행)
- 자격 증명이 없으면 행은 `queued` 로 대기하며 사유가 기록됩니다 — env 를 채우는 즉시
  다음 크론이 이어서 집행합니다. 재시도 상한 5회.

---

## A. 인스타그램 (Meta) — 30~60분 + 앱 심사 대기

1. **계정 전환·연결**: 인스타그램 계정을 **프로페셔널(비즈니스/크리에이터)** 로 전환하고,
   운영할 **페이스북 페이지와 연결**합니다 (IG 앱 → 설정 → 계정 유형 및 도구).
2. **메타 개발자 앱 생성**: https://developers.facebook.com → 앱 만들기 → 유형 "비즈니스".
3. **Instagram API 추가**: 앱 대시보드 → 제품 추가 → **Instagram** ("Instagram API with
   Facebook Login" 구성) 선택.
4. **권한**: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` 을
   요청 목록에 추가. **앱 검수(App Review)** 를 제출해야 본인 외 계정 없이도 라이브
   모드 발행이 됩니다 — 개발 모드에서는 앱 역할(관리자/테스터)에 추가된 본인 계정으로
   먼저 전부 테스트할 수 있으니, 검수 전에 1건 테스트 발행을 권합니다.
5. **장기 토큰 발급**:
   - 그래프 API 탐색기(https://developers.facebook.com/tools/explorer)에서 위 권한으로
     사용자 토큰 발급 → `GET /me/accounts` 로 페이지 확인 →
     `GET /{page-id}?fields=instagram_business_account` 으로 **IG 사용자 ID** 확보.
   - 단기 토큰을 장기 토큰(60일)으로 교환:
     `GET /oauth/access_token?grant_type=fb_exchange_token&client_id={앱ID}&client_secret={앱시크릿}&fb_exchange_token={단기토큰}`
   - ⚠️ 장기 토큰은 **60일 만료**입니다. 만료 전 같은 방법으로 갱신해야 하며, 만료되면
     큐가 `queued` 로 쌓이고 오류 사유에 토큰 문제가 기록됩니다.
6. **Vercel 환경변수** (Production):
   - `META_IG_USER_ID` = 5에서 확보한 IG 사용자 ID (숫자)
   - `META_IG_ACCESS_TOKEN` = 장기 토큰

## B. 유튜브 (Google) — 30분 + (필요 시) OAuth 동의화면 검증

1. **Google Cloud 프로젝트**: https://console.cloud.google.com → 프로젝트 생성 →
   **YouTube Data API v3** 사용 설정.
2. **OAuth 동의 화면**: 유형 "외부", 범위에 `https://www.googleapis.com/auth/youtube.upload`
   추가. 테스트 사용자에 채널 소유 구글 계정을 추가하면 검증 없이 바로 사용 가능
   (테스트 모드 리프레시 토큰은 7일 만료 — **게시 상태로 전환**해야 무기한).
3. **OAuth 클라이언트 ID**: 사용자 인증 정보 → OAuth 클라이언트 ID → 유형 "웹 애플리케이션",
   승인된 리디렉션 URI 에 `https://developers.google.com/oauthplayground` 추가.
4. **리프레시 토큰 발급** (1회): https://developers.google.com/oauthplayground →
   우측 톱니 → "Use your own OAuth credentials" 체크 → 클라이언트 ID/시크릿 입력 →
   Step1 에서 `https://www.googleapis.com/auth/youtube.upload` 입력·Authorize
   (**채널 소유 계정**으로 로그인) → Step2 "Exchange authorization code for tokens" →
   **Refresh token** 복사.
5. **Vercel 환경변수** (Production):
   - `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
6. **쿼터**: videos.insert 는 1,600유닛/건, 기본 일 10,000유닛 → **하루 최대 6건**.
   초과분은 "쿼터 초과" 사유로 대기했다가 다음 날 자동 재시도됩니다.

## C. 크론 시크릿 (1회, 2분)

드레인 크론(pg_cron)이 앱을 호출할 때 쓸 시크릿을 DB vault 에 넣습니다.
Supabase 대시보드 → SQL Editor 에서 (값은 Vercel 의 `CRON_SECRET` 과 동일하게):

```sql
select vault.create_secret('<CRON_SECRET 값>', 'cron_secret');
```

넣기 전까지 드레인 크론은 아무것도 하지 않습니다(호출해도 403이므로 시도 자체를 생략).

## D. 운영 방법

1. **영상 준비**: 9:16 세로 MP4 권장 (릴스 ≤90초, 쇼츠 ≤3분 — 둘 다 올리려면 ≤90초).
2. **영상 업로드**: Supabase 대시보드 → Storage → `social-videos` 버킷(이미 생성됨, 공개)
   → 업로드 → 파일의 공개 URL 복사.
3. **큐 등록**: 관리자로 로그인한 브라우저 콘솔 또는 curl 로:

```
POST https://naezipnow.com/api/admin/social-uploads
{ "videoUrl": "<공개 URL>", "title": "8월 2주차 시장 브리핑",
  "caption": "이번 주 실거래 하이라이트", "hashtags": ["부동산", "임장", "실거래가"],
  "scheduledAt": "2026-08-14T09:00:00+09:00",
  "targets": { "instagram": true, "youtube": true } }
```

4. **확인**: `GET /api/admin/social-uploads` 로 상태(대상별)·오류 사유·발행 ID 확인.
   scheduledAt 이 지나면 15분 내에 집행됩니다.

## E. 주의 (사실 우선)

- **수익 문구 금지 방침은 소셜에도 적용됩니다** — 캡션·제목에 수익 보장·확정 수익
  표현을 쓰지 마세요. 사이트 방침("영구 미기재")과 소셜 콘텐츠가 어긋나면
  그 자체가 허위 고지가 됩니다.
- 시세·분석 수치를 영상에 넣을 때는 기준 시점을 화면에 표기하세요(사이트와 동일 원칙).
- 토스 심사 기간 중에도 이 파이프라인은 안전합니다 — 사이트의 상품·사업자정보·결제
  표면을 건드리지 않는 별도 운영 채널입니다.

## F. 완전 자동 모드 — 임장노트·홍보 영상 자동 생성 (2026-08-13 추가)

D 의 수동 등록 없이도 **매일 11:00 KST** 에 소재가 자동으로 만들어져 큐에 들어갑니다:

1. **임장노트 영상**: 공개(is_public) + 운영자 본인 작성 노트 중 아직 발행 안 된 것을
   최신순으로 1건 골라, 표지(지역·단지) → 현장 요약 → 체감 점수 바 → naezipnow.com CTA
   4프레임 슬라이드 영상(약 13초, 1080×1920 H.264+AAC)으로 렌더링합니다.
   - 다른 이용자의 노트는 자동화하지 않습니다(저작권·동의 문제). 소재 확대를 원하면
     노트 작성 시 "소셜 공유 동의" 옵션을 붙이는 것이 다음 단계입니다.
2. **홍보 영상**: 노트가 소진되면 3종 로테이션(실거래 지도 · AI 노트 정리 · 시장 온도).
   수치는 그날 DB 실측값이고 기준시점이 화면에 박힙니다. 수익 보장류 표현은 금지어
   검사가 큐 등록 전에 차단합니다(영구 미기재 방침의 소셜 확장).
3. **중복 방지는 DB 가 합니다**: (source_kind, source_ref) 부분 유니크 인덱스 —
   코드가 재실행돼도 같은 노트/같은 날 홍보가 두 번 올라갈 수 없습니다.
4. 생성만 자동일 뿐 발행 경로는 동일합니다 — A·B·C 절차가 끝나야 실제 발행됩니다.
   C(vault 시크릿)만 등록해도 생성·큐 적재까지는 돌기 시작하고, 발행은 A·B 완료 시점부터.

수동 등록(D)도 계속 됩니다 — 직접 만든 영상은 D 방식으로 올리면 됩니다.

## G. 완료된 확장 (2026-08-14)

- ✅ 관리자 화면: /admin/social — 상태표·수동 등록·즉시 실행 버튼.
- ✅ 노트 작성자 "소셜 공유 동의" 옵션: 공개 노트 저장 시 선택 체크박스.
  동의한 이용자 노트도 자동 소재 대상에 포함되며(공개 + 동의 필수),
  노트 수정에서 체크 해제 = 동의 철회(이후 소재 선정 제외). 운영자 본인
  노트는 종전대로 동의 없이 소재가 됩니다.
