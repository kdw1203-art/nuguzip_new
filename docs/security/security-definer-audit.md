# SECURITY DEFINER 함수 전수 점검 (I002)

점검일: 2026-09-01 · 대상: 운영 DB 실측(pg_proc) · 결론: **search_path 수리 0건, 권한 회수 6건**

## 왜 점검했나

SECURITY DEFINER 함수는 호출자가 아니라 **정의자(owner) 권한으로** 돈다. 두 가지가 어긋나면 사고가 된다.

1. `search_path` 미고정 — 호출자가 자기 스키마에 동명 객체를 심어 정의자 권한을 탈취하는 고전 경로.
2. EXECUTE 과다 부여 — 함수 내용은 안전해도, 부를 수 있는 롤이 넓으면 공격 표면이 넓다.

## 실측 결과

### ① search_path 고정 — 전원 통과

| 스키마 | SECURITY DEFINER 수 | search_path 고정 |
| --- | --- | --- |
| public | 45 | 45 (100%) |
| ops | 29 | 29 (100%) |
| private | 1 | 1 (100%) |

수리할 것이 없었다. (일부는 `statement_timeout`·`work_mem` 까지 함수 단위로 고정 — 신고가 RPC 25s, rent_yield 600s 등.)

### ② EXECUTE 권한 — 6건 위생 회수, 2건 설계 유지, 나머지 정상

- **회수(2026-09-01 적용)**: `map_complex_attrs` · `map_filter_facets` · `market_region_names` · `popular_complexes` · `search_complexes_preview` · `search_regions` 의 **PUBLIC** EXECUTE. 여섯 모두 anon·authenticated 명시 GRANT 가 따로 있어 기능 변화가 없고(회수 직후 anon 롤 실행 검증), 미래의 임의 롤까지 포함하는 PUBLIC 만 걷었다.
- **설계 유지(잠금)**: `get_automation_script` · `ingest_daily_news` 의 anon EXECUTE — 비밀값(p_secret) 대조로 막는 자동화 통로. 권한을 새로 주는 일은 하지 않는다.
- **의도적 미변경**: `is_admin_request` 의 PUBLIC EXECUTE — RLS 정책 평가 경로에서 호출된다. 걷으면 anon 조회가 있는 표의 정책 평가가 깨질 수 있어 손대지 않는다(정책 평가는 호출 롤로 실행되므로 anon 에도 EXECUTE 가 필요).
- ops 스키마 함수들의 PUBLIC EXECUTE 잔재는 **스키마 USAGE 가 postgres·service_role 뿐이라 불활성**(anon/authenticated 는 ops 에 접근 자체가 불가, PostgREST 미노출). 회수 실익이 없어 기록만 남긴다.

### ③ 참고 관찰 (변경 없음)

- `private` 스키마에 anon/authenticated USAGE 가 있으나 PostgREST 미노출 스키마라 REST 로 닿을 수 없고, 유일한 함수는 트리거 함수(직접 호출 불가)다. 향후 private 에 객체를 늘릴 때는 이 USAGE 를 먼저 재검토할 것.
- 서비스 롤 전용 함수들(경보 RPC 3종, point_ledger_* 등)은 전부 `postgres,service_role` 로 좁게 잠겨 있음을 확인.

## 다음 점검 요령

```sql
-- 미고정 search_path 탐지 (0행이어야 정상)
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prosecdef and coalesce(array_to_string(p.proconfig,''),'') not like '%search_path%'
  and n.nspname not in ('pg_catalog','information_schema','extensions','vault','pgsodium');
```

새 SECURITY DEFINER 함수를 만들 때의 규약: `set search_path = <필요 스키마만>` 을 반드시 붙이고, EXECUTE 는 `revoke ... from public, anon, authenticated` 후 필요한 롤에만 grant 한다(기존 마이그레이션들의 패턴 그대로).
