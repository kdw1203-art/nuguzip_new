# RLS 전수 감사 리포트 (#72)

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
