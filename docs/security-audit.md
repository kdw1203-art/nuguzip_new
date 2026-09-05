# RLS 전수 감사 리포트 (#72)

## ⚠️ 2026-07-27 정정 — 아래 2026-07-19 리포트는 **부정확하다(superseded)**

출시 전 재감사(2026-07-27) 결과, 이 문서의 다음 주장이 사실이 아님을 확인했다.
원문은 기록으로 남겨 두되(삭제하지 않는다), 판단의 근거로는 쓰지 말 것.

### 정정 1 — "치명(ERROR) 등급 발견 0건" (§요약, 7행)

사실이 아니다. 2026-07-27 감사에서 치명 등급이 여러 건 나왔다. 그중 하나는 데이터가
아니라 **사람에 대한 것**이었다: `profiles` 의 정책이 anon 에게 전체 행 SELECT 를
허용하고 있어, 로그인조차 하지 않은 누구든 publishable 키 하나로 **전 회원의 이메일·
전화번호·주소**를 내려받을 수 있었다. 공개 키는 설계상 공개돼 있으므로(웹 번들에 들어
있다) 이건 이론이 아니라 그냥 열려 있는 상태였다.

### 정정 2 — "EXECUTE 회수 완료" (§2, 21–22행 / §적용된 변경, 38행)

`rls_auto_enable` · `sync_meeting_member_count` · `notify_post_comment` 의 실행 권한이
회수됐다고 적혀 있지만, **회수되지 않았다.** 해당 마이그레이션이 이렇게 썼기 때문이다:

```sql
revoke execute on function public.rls_auto_enable() from anon, authenticated;
```

PostgreSQL 은 함수를 만들 때 기본으로 `GRANT EXECUTE ... TO PUBLIC` 을 준다. `anon` 과
`authenticated` 는 그 권한을 개별로 받은 적이 없고 **PUBLIC 의 구성원으로서** 갖고
있었다. 없는 권한을 회수하는 문장은 아무 일도 하지 않고 조용히 성공한다 — 에러도
경고도 없다. 그래서 "적용됨" 이라고 적힌 채 실제로는 그대로 열려 있었다.
고치려면 `from public` 이 반드시 함께 있어야 한다:

```sql
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
```

이 실수가 다시 나지 않도록 `scripts/check-migration-grants.mjs` 에 정적 검사를 넣었다
(`revoke ... on function` 의 대상 목록에 `public` 이 없으면 CI 실패). 배포 워크플로의
`Migration grant lint` 단계에서 돈다.

### 2026-07-27 적용 마이그레이션

| 마이그레이션 | 내용 |
|---|---|
| `sec_revoke_public_execute_on_security_definer_fns` | SECURITY DEFINER 함수들의 기본 PUBLIC EXECUTE 회수 (`from public` 포함) |
| `sec_profiles_pii_lockdown` | `profiles` 의 anon 전체 읽기 정책 제거 — 이메일·전화번호·주소 노출 차단 |
| `sec_policy_and_privilege_hardening` | 남은 과다 정책·권한 정리 |
| `sec_consume_feature_quota_advisory_lock` | `consume_feature_quota` 경합(할당량 초과 사용) 차단 — advisory lock |

### 미해결로 남긴 것 — `xlsx`

`xlsx@0.18.5` (devDependencies) 에는 프로토타입 오염·ReDoS 권고가 있고 **패치된 릴리스가
없다**(배포처가 npm 레지스트리를 떠났다). 지금은 개발 의존성이고 사용자 입력 스프레드시트를
파싱하지 않아 노출면이 없어 그대로 둔다.
TODO: 런타임 경로에서 스프레드시트를 다루게 되는 순간 `exceljs`(이미 dependencies 에 있다)로
옮기거나 `xlsx` 를 제거할 것. 이 조건이 바뀌면 그건 더 이상 "미해결로 둘 수 있는" 상태가 아니다.

---

_(이하 원문 — 2026-07-19 시점의 기록. 위 정정을 먼저 읽을 것.)_

감사일: 2026-07-19 · 대상: Supabase 프로젝트 `pbhiskvwpwwhtkmnhkbm` (프로덕션) · 도구: Supabase Security Advisor + pg_policy 직접 조회

## 요약

전체 113개 public 테이블 **모두 RLS 활성화** 상태. 치명(ERROR) 등급 발견 0건. WARN 31건·INFO 44건을 검토했고, 안전하게 적용 가능한 보완 1건(내부 함수 권한 회수)을 적용했다.

## 발견 사항과 판정

### 1. RLS 활성 + 정책 없음 — 44개 테이블 (INFO)

`admin_audit_log`, `password_reset_tokens`, `payment_audit_logs`, `stripe_webhook_events`, `push_subscriptions`, `user_consents`, `web_vitals` 등 44개.

**판정: 의도된 안전한 상태(변경 없음).** RLS가 켜져 있고 정책이 없으면 anon/authenticated 키로는 **전면 차단(deny-all)** 이며, 서버(Service Role)만 접근 가능하다. 이 앱은 해당 테이블들을 전부 서버 라우트(Service Role)로만 읽고 쓰므로 이것이 가장 안전한 자세다. 정책을 추가하면 오히려 접근이 넓어진다.

### 2. SECURITY DEFINER 함수의 anon/authenticated 실행 권한 — 16개 함수 (WARN)

분류 결과:

- **RLS 정책 내부에서 사용 중 → 권한 유지 필수**: `is_admin`, `is_admin_request`, `is_inspection_note_owner`, `has_paid_tier`, `is_chat_room_member` (pg_policy 스캔으로 content_reports·inspection_notes·chat_rooms 등 다수 정책에서 호출 확인. 실행 권한을 회수하면 해당 정책 평가가 깨짐)
- **트리거/내부 전용 → 권한 회수 적용됨**: `rls_auto_enable`, `sync_meeting_member_count`, `notify_post_comment` — 클라이언트 RPC 호출 없음(코드베이스 전수 grep), RLS 정책 미사용 확인. 트리거는 소유자 권한으로 실행되므로 동작 영향 없음. 마이그레이션 `harden_internal_function_grants` 로 anon·authenticated EXECUTE 회수 완료.
- **서버 전용 호출이지만 공개 이름 → 관찰 유지**: `increment_board_post_view`, `increment_complex_view`, `increment_report_views`, `increment_report_downloads`, `get_public_app_stats`, `get_public_posts_feed`, `consume_feature_quota`, `get_app_stats` — 현재 앱은 전부 Service Role로만 호출하지만, 구 앱/외부 도구가 anon으로 호출할 가능성을 배제하기 어려워 이번에는 회수하지 않음. 남용 시 영향은 조회수 부풀리기 수준. 차후 구 코드 폐기가 확정되면 회수 권장.

### 3. `vector` 확장이 public 스키마에 설치 (WARN)

**판정: 변경 없음.** 확장 이동은 의존 객체(note_embeddings) 재작성이 필요한 파괴적 작업. 위험 대비 이득이 작아 보류.

### 4. Leaked Password Protection 비활성 (WARN) — 👤 사용자 액션

Supabase 대시보드 → Authentication → Passwords 에서 "Leaked password protection" 활성화 필요 (HaveIBeenPwned 대조). API로 원격 설정 불가.
참고: https://supabase.com/docs/guides/auth/password-security

## 적용된 변경

| 변경 | 방식 | 위험도 |
|---|---|---|
| `rls_auto_enable`·`sync_meeting_member_count`·`notify_post_comment` 의 anon/authenticated EXECUTE 회수 | 마이그레이션 `harden_internal_function_grants` | 없음(트리거 동작 무영향, 정책 미사용 확인) |

## 재검 방법

Security Advisor 재실행(대시보드 → Advisors → Security) 또는 MCP `get_advisors(type: security)`. DDL 변경 후에는 반드시 재실행.

---

## 965 (2026-09-05) — 회원가입·로그인 재점검

- **비밀번호 재설정(Supabase Auth 경로)이 막혀 있었다**: 복구 링크가 `/auth/confirm` 을
  거치며 해시 토큰을 버려 `/reset-password` 가 4초 뒤 "링크가 유효하지 않습니다" 를
  그렸다. 해시를 들고 넘기고, 세션이 이미 있으면 폼을 연다.
- **재설정이 옛 비밀번호를 무효화하지 않았다**: 자체 토큰 경로가 `app_users.password_hash`
  만 바꿔, 로그인이 bcrypt→Supabase Auth 순으로 둘 다 시도하므로 새 비밀번호도 옛
  비밀번호도 됐다. 이제 Supabase Auth 비밀번호를 먼저 바꾼다(미인증이면 인증 처리).
- **미인증 계정 재가입이 비밀번호를 덮어썼다**(이메일 소유 증명 없이) → 재발송만.
- **`is_banned` 를 로그인 어디서도 보지 않았다** → `signIn` 콜백 거부 + 세션 갱신 시
  로그아웃(관리자 허용 목록은 예외).
- 이메일 미인증을 `CredentialsSignin` 하위 클래스(`code: email_not_confirmed`)로 전달 —
  화면이 "비밀번호가 틀렸다" 대신 재발송 버튼을 보여 준다. Auth.js `pages` 지정으로
  영문 기본 오류·로그아웃 화면 제거(`/login?error=…`, `/logout`).
- 회원탈퇴 앱 내 기능(`/api/me/delete-account`, `account_deletion_requests`) — SOP 는
  docs/ops/privacy-requests.md.
- `plan_expires_at`·`is_banned` 를 읽는 시점에 적용(`lib/auth/profile-rules.ts`, 단위검증).
- Auth 사용자 조회의 1,000명 상한(listUsers 5페이지) 제거 — `app_users.supabase_user_id`
  + `public.auth_user_id_by_email()`(service_role 전용).
