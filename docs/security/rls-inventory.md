# RLS 인벤토리 — 표별 행수준 보안 상태와 의도

> [I001] 2026-08-31 운영 DB 실측 생성. Supabase 어드바이저가 "RLS enabled, no
> policy" 79건을 알리는데, 이 목록만 봐서는 **의도(서비스 롤 전용)**인지
> **누락(정책을 깜빡함)**인지 구분할 수 없다. 이 문서가 그 구분을 기록한다.
> 새 표를 만들 때는 아래 세 범주 중 하나로 자기 자리를 적을 것.

## 판정 원칙

- **정책 있음** — 브라우저(anon/authenticated)가 직접 읽거나 쓰는 표.
  정책이 곧 권한 명세다.
- **RLS on · 정책 0 (서비스 롤 전용)** — 서버 코드만 service_role 로 접근.
  RLS 가 켜져 있고 정책이 없으므로 anon/authenticated 는 **기본 거부**된다.
  이것은 잠긴 상태이며, 어드바이저 INFO 는 "정책을 붙이라"가 아니라
  "의도인지 확인하라"로 읽는다 — 의도임을 여기 기록한다.
- **ops 스키마 (RLS off 다수)** — PostgREST `exposed schemas` 에 포함되지 않는
  운영 전용 스키마. REST 로 노출되지 않으므로 RLS 의 방어 대상 자체가 아니다.
  단, **ops 를 exposed schemas 에 추가하는 순간 이 전제가 깨진다** — 그 변경을
  하려면 이 문서를 먼저 갱신할 것.

## 요약 (2026-08-31 실측)

| 범주 | 표 수 | 상태 |
|---|---|---|
| public · 정책 있음 | 67 | 정상 — 정책이 권한 명세 |
| public · RLS on + 정책 0 | 79 | 잠김(기본 거부) — 서비스 롤 전용 의도 확인됨 |
| ops · RLS off | 18 | REST 미노출 전제 — 노출 설정 변경 금지 |
| ops · RLS on + 정책 0 | 2 | 잠김 (error_log · alert_email_log) |

## 서비스 롤 전용(정책 0) 중 민감도 높은 표 — 특별히 그대로 둘 것

이 표들은 브라우저 정책을 **절대 추가하지 않는다**. 클라이언트가 읽을 이유가
없고, 잘못 연 정책 하나가 곧 유출이다.

- `automation_secrets` · `automation_scripts` — 자동화 시크릿(권한 GRANT 금지
  결정과 같은 계열, 2026-08 잠금)
- `password_reset_tokens` · `toss_login_tokens` — 인증 토큰
- `payment_audit_logs` · `iap_receipts` · `billing_subscriptions` · `point_ledger` — 결제·정산 원장
- `user_consents` · `user_policy_consents` — 법적 증빙(동의 기록)
- `push_subscriptions` — 엔드포인트가 곧 발송 권한
- `admin_audit_log` — 관리자 행위 기록
- `page_view_events` · `web_vitals` · `platform_activity_events` — 텔레메트리 원본(개인 식별 가능 조합)

## 다음 점검 (분기 1회)

1. 이 문서와 실제 DB 를 대조: `pg_tables` × `pg_policies` (생성 쿼리는 아래).
2. 새로 생긴 "정책 0" 표가 위 세 범주 중 어디인지 적기.
3. PostgREST exposed schemas 에 ops 가 없는지 확인.

```sql
select schemaname||'.'||tablename as t,
       (select count(*) from pg_policies p
         where p.schemaname=c.schemaname and p.tablename=c.tablename) as policies,
       rowsecurity as rls
from pg_tables c
where schemaname in ('public','ops')
order by 1;
```
