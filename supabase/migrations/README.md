# supabase/migrations — 마이그레이션 규약

## 정본은 원격 DB에 있습니다

이 프로젝트는 오랫동안 마이그레이션을 **원격 Supabase에 직접 적용**해 왔습니다.
적용 이력은 전부 운영 DB의 `supabase_migrations.schema_migrations` 테이블에 있고,
각 행은 실행된 SQL 원문(`statements`)까지 그대로 보관합니다.

- 2026-07-24 기준 **96건** 적용 (`002` ~ `20260724212021`), SQL 원문 합계 약 23만 자
- 그동안 이 디렉터리는 **존재하지 않았습니다** — 그래서 `npm run db:apply`(인자 없음)와
  `scripts/check-migration-drift.mjs` 가 읽을 대상이 없었습니다. 그 구멍을 메우는 게 이 문서입니다.

따라서 **로컬 `.sql` 파일이 정본이 아닙니다.** 원격이 정본이고, 로컬 파일은 그 사본입니다.
로컬에 파일이 없다고 해서 원격에 적용되지 않은 게 아닙니다 (그 반대도 마찬가지).

## 파일 이름 규약

```
supabase/migrations/<version>_<name>.sql
```

- `<version>` — UTC 타임스탬프 `YYYYMMDDHHMMSS` (예: `20260724212021`)
- `<name>` — 소문자 스네이크케이스로 무엇을 바꾸는지 (예: `owner_verifications_listing_link`)
- 초기 이력은 `002` ~ `045` 처럼 3자리 일련번호를 씁니다. 새 파일은 타임스탬프로만 만드세요.

`<version>` 은 `schema_migrations.version` 과 **정확히 같아야** 드리프트 점검이 맞습니다.

## 새 마이그레이션 작성 규칙

1. **가산만(additive)** — 컬럼/테이블/인덱스 추가는 되지만, 운영 데이터를 지우는
   `drop table` · `drop column` · `truncate` 는 넣지 않습니다.
2. **재실행 안전(idempotent)** — `create table if not exists`,
   `add column if not exists`, `create index if not exists`,
   제약조건은 `do $$ ... if not exists (select 1 from pg_constraint where conname = ...) ... $$`.
3. **RLS를 켠 채로 둡니다** — 새 테이블은 `enable row level security` 와 정책을 같은 파일에서 함께.
4. 왜 바꾸는지 한국어 주석을 맨 위에 남깁니다.
5. **넓은 감사용 jsonb 컬럼은 `set statistics 0` 으로 시작합니다.** 원본 응답을
   통째로 담아 두기만 하고 `where` 절에서 쓰지 않는 컬럼(예:
   `market_transactions.raw`, avg_width 570) 이야기입니다. 이런 컬럼을 기본값인
   `statistics -1` 로 두면 autovacuum ANALYZE 가 표본을 뜨느라 CPU 를 통째로
   태웁니다 — 2026-07-26 에 실제로 `computing statistics` 한 단계에서 8,600초를
   썼고, 그동안 모든 조회가 밀렸습니다(원인·복구는
   `20260726160000_market_transactions_raw_statistics_off.sql` 참고).
   통계가 필요 없는 컬럼이니 처음부터 0 으로 만들고, 나중에 그 컬럼으로
   필터링할 일이 생기면 그때 `set statistics -1` 로 되돌립니다.

   ```sql
   alter table public.<t> alter column <wide_jsonb> set statistics 0;
   ```

   기준: 행 수가 10만 이상이고, `pg_stats.avg_width` 가 300 이상이며, 코드
   어디에서도 그 컬럼을 조건으로 쓰지 않는 경우. 세 가지가 모두 맞을 때만
   해당합니다 — `apartment_complexes.metadata` 처럼 `metadata->detailFetchedAt`
   를 조건으로 쓰는 컬럼은 대상이 아닙니다.

## 전체 이력을 파일로 펼치기

원격 96건을 이 디렉터리에 내려받으려면:

```bash
npm run db:migrations:export          # 없는 파일만 생성
npm run db:migrations:export -- --force   # 기존 파일도 덮어씀
```

> ⚠️ 내려받은 뒤 **`npm run db:apply` 를 인자 없이 실행하지 마세요.**
> 인자가 없으면 이 디렉터리의 모든 파일을 이름순으로 재적용하는데, 과거 마이그레이션 상당수는
> 재실행 안전하지 않아 이미 적용된 운영 DB를 망가뜨립니다.
> 개별 적용은 항상 파일명을 지정하세요: `npm run db:apply 20260724212021_owner_verifications_listing_link.sql`

## 드리프트 점검

```bash
node ./scripts/check-migration-drift.mjs
```

`supabase migration list --linked` 를 쓰므로 Supabase CLI 로그인 + 프로젝트 링크(DB 비밀번호)가
필요합니다. 링크 없이 원격 이력만 보려면 SQL로 직접 조회하세요:

```sql
select version, name, created_at
from supabase_migrations.schema_migrations
order by version;
```

## 스키마 문서 재생성

컬럼 인벤토리(`supabase/SCHEMA.md`)는 운영 DB에서 다시 뽑습니다:

```bash
npm run db:schema:doc
```

## 적용된 마이그레이션 96건 (2026-07-24 기준)

```
002  app_users_role
003  post_likes
004  posts_meta
005  app_users_plan
006  posts_notify_email
007  content_reports
008  notification_outbox
009  profiles_and_market
010  web_vitals
011  admin_enhancements
012  payments_bookmarks
013  meetings_inspection
014  ai_analysis_presets
015  user_inbox_expert_owner
016  extended_backend
017  push_subscriptions
018  user_consents
019  banned_words_and_password_reset
020  banners
021  reports_author_email
022  group_members
023  audit_security
024  uploads
025  public_data_cache
026  follows
027  complex_reviews
028  watchlist
029  avatar_url
030  attendance_points
031  auth_bootstrap_hardening
032  ai_runs_platform_split
033  sprint3_retention_quality
034  platform_activity_events
035  strategy_funnel_waid
036  chat_full_scope
037  chat_realtime_publication
038  admin_business_dashboards
039  inspection_metadata_ai_snapshot
040  personalization_insights
041  group_members_align
042  chat_rooms_realtime_publication
043  identity_verification
044  market_data
045  complex_engagement
20260502  open_beta_gate
20260621121742  community_board_news_bootstrap
20260621121821  community_board_news_bootstrap_followup
20260621125930  posts_automation_metadata
20260623013122  create_engagement_events_20260623
20260623013224  create_public_data_cache_20260623
20260623021023  fix_public_inspection_note_publish_20260623
20260623021355  fix_inspection_notes_author_type_default_20260623
20260623042813  add_map_related_experts_and_region_phase
20260623043029  add_region_phase_to_public_data_cache
20260629233445  modernize_chat_rooms_for_inquiry_flow
20260630085902  add_payment_order_verification_flag
20260704042254  add_map_metric_snapshots
20260704042410  fix_map_metric_refresh_level_alias
20260704042539  optimize_map_metric_refresh_sources
20260704042649  wrap_map_metric_refresh_params
20260705213342  add_app_read_path_indexes
20260719223216  sec_01_function_search_path
20260719223229  sec_02_definer_views_lockdown
20260719223238  sec_03_user_points_insert_policy
20260719223337  sec_04_revoke_function_execute
20260719223351  sec_05_storage_bucket_listing
20260719223858  add_profiles_handle
20260719233713  harden_internal_function_grants
20260720092905  create_listings
20260720094202  create_public_property_records
20260720095312  public_property_records_indexes
20260720101952  create_apartment_supply
20260720114831  create_housing_price_index
20260720114920  drop_housing_price_index_empty
20260720120602  create_onbid_auctions
20260720124107  listings_map_and_points
20260721022825  rec20_listings_reviews_watchlist_columns
20260721022839  rec20_referral_and_court_auctions
20260721022902  dev_deals_brokerage_tables
20260722044948  wave3_saved_searches
20260722045003  wave3_note_templates
20260722045011  wave3_complex_qna
20260722064751  redevelopment_projects
20260722100026  search_complexes_over_apartment_complexes
20260722125126  user_personalization
20260723041621  notif_prefs_sms_channel
20260723201802  complex_geocode_cache
20260723202033  complexes_needing_geocode_fn
20260724034012  trade_complex_total_fn
20260724035344  listing_inquiry_leads
20260724041738  expert_consultations_consult_type_widen
20260724061313  user_recent_complexes
20260724100029  expert_fraud_events
20260724133437  expert_verification_requests_widen_intake_columns
20260724133914  listings_add_deleted_at_soft_delete
20260724212021  owner_verifications_listing_link
```

이 목록은 사람이 관리하지 않습니다. 최신 목록은 위 SQL로 직접 확인하세요.
