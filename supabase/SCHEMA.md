# 내집나우 데이터베이스 스키마 (생성된 참조 문서)

> **이 파일은 손으로 쓰지 않습니다.** `node scripts/generate-schema-doc.mjs` 가 운영 DB에서 직접 뽑아
> 덮어씁니다. 사람이 편집하면 다음 생성 때 지워집니다.

- 대상 프로젝트: Supabase `pbhiskvwpwwhtkmnhkbm`
- 생성 시각: **2026-07-24 (UTC)** — 이 시점의 운영 DB 실측값
- 규모: 테이블 **133**개 / 컬럼 **1,529**개 / 뷰 4개 / 함수 158개
- RLS: **133개 테이블 전부 활성**, 정책 149개
- 확장: `pg_stat_statements`, `pgcrypto`, `postgis`, `supabase_vault`, `uuid-ossp`, `vector`
- 적용된 마이그레이션: **96개** (`002` ~ `20260724212021`)

## 이 문서의 지위 — 진실의 원천이 아니다

스키마의 진실의 원천은 **운영 DB에 적용된 96개 마이그레이션**(`supabase_migrations.schema_migrations`)
입니다. 이 문서는 그 결과를 읽기 쉽게 뽑아 놓은 **스냅샷**이고, 실행 가능한 DDL이 아닙니다.
DB를 재구성해야 한다면 `supabase/migrations/README.md` 의 복원 절차를 따르세요.

## 왜 이 파일이 생겼나 (F9)

이 자리에는 원래 `supabase/schema.sql` 이 있었습니다. 163줄에 테이블 10개를 선언했는데,
2026-07-24 운영 DB와 대조한 결과:

- 선언된 10개 중 **8개가 운영 DB에 존재하지 않았습니다** —
  `ai_reports`, `alert_rules`, `comments`, `compare_lists`, `complexes`, `notes`, `notifications`, `trades`
- 실재하는 2개(`posts`, `profiles`)도 컬럼 구성이 전혀 달랐습니다
  (선언된 `profiles.nickname`·`age_band` 등은 실제로 없고, 실제 `profiles` 는 24컬럼)
- 실제로 쓰이는 `listings`·`inspection_notes`·`market_transactions` 등 **123개 테이블이 통째로 누락**

즉 그 파일을 읽고 데이터 모델을 파악하려던 사람은 전부 틀린 그림을 얻었습니다.
사실이 아닌 문서는 없는 것만 못하므로 삭제하고, 실측 기반의 이 문서로 대체했습니다.

## 표기법

```
### 테이블명 (컬럼수, RLS)
  컬럼명 타입 [NOT NULL] [PK] [->참조테이블]
```

`->X` 는 그 컬럼에 걸린 단일 컬럼 외래키의 대상 테이블입니다.
복합키 외래키, CHECK 제약, 인덱스, 트리거, 정책 본문은 이 문서에 담지 않습니다
(운영 DB에서 직접 조회하세요 — 쿼리는 `supabase/migrations/README.md` 참고).

---

### admin_audit_log (9 cols, RLS)
  id uuid NOT NULL PK
  actor_email text NOT NULL
  actor_role text NOT NULL
  action text NOT NULL
  target_type text
  target_id text
  note text
  metadata jsonb NOT NULL
  created_at timestamp with time zone NOT NULL

### admin_audit_logs (7 cols, RLS)
  id uuid NOT NULL PK
  actor_id uuid ->profiles
  action text NOT NULL
  target_type text
  target_id text
  metadata jsonb NOT NULL
  created_at timestamp with time zone NOT NULL

### ai_analysis_jobs (13 cols, RLS)
  id uuid NOT NULL PK
  note_id uuid NOT NULL ->inspection_notes
  user_id uuid NOT NULL ->profiles
  status text NOT NULL
  content_hash text NOT NULL
  model_version text
  prompt_version text NOT NULL
  error_message text
  report_id uuid ->inspection_ai_reports
  started_at timestamp with time zone
  finished_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### ai_analysis_presets (15 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  tool text NOT NULL
  title text NOT NULL
  objective jsonb NOT NULL
  subjective_memo text NOT NULL
  last_result_excerpt text
  last_model_id text
  last_source text
  last_run_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  objective_hash text
  pinned boolean NOT NULL
  pinned_at timestamp with time zone

### ai_analysis_runs (14 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  preset_id uuid ->ai_analysis_presets
  tool text NOT NULL
  input_snapshot jsonb NOT NULL
  model_id text
  source text
  markdown text NOT NULL
  created_at timestamp with time zone NOT NULL
  platform text NOT NULL
  structured_summary jsonb
  public_context_snapshot jsonb
  district_id text
  complex_id text

### analytics_events (8 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid ->profiles
  anonymous_id text
  event_name text NOT NULL
  route text
  referrer text
  payload jsonb NOT NULL
  created_at timestamp with time zone NOT NULL

### apartment_complexes (8 cols, RLS)
  id uuid NOT NULL PK
  source_key text
  external_id text
  name text NOT NULL
  address text
  lawd_cd text
  metadata jsonb NOT NULL
  updated_at timestamp with time zone NOT NULL

### apartment_supply (9 cols, RLS)
  id bigint NOT NULL PK
  move_in_ym text NOT NULL
  region text
  biz_type text
  address text
  apt_name text
  households integer
  source text
  created_at timestamp with time zone

### apartments (11 cols, RLS)
  id bigint NOT NULL PK
  source text NOT NULL
  source_id text NOT NULL
  name text NOT NULL
  lat double precision NOT NULL
  lng double precision NOT NULL
  price text
  region text
  updated_at timestamp with time zone NOT NULL
  geom geography(Point,4326)
  metadata jsonb NOT NULL

### app_users (26 cols, RLS)
  id uuid NOT NULL PK
  email text NOT NULL
  password_hash text NOT NULL
  name text
  role text NOT NULL
  created_at timestamp with time zone NOT NULL
  plan text NOT NULL
  marketing_agreed boolean NOT NULL
  location_agreed boolean NOT NULL
  consent_updated_at timestamp with time zone
  is_banned boolean NOT NULL
  ban_until timestamp with time zone
  ban_reason text
  avatar_url text
  updated_at timestamp with time zone NOT NULL
  signup_source text
  signup_campaign text
  onboarding_progress jsonb
  onboarding_completed_at timestamp with time zone
  persona text
  primary_region text
  intent_horizon text
  personalization jsonb
  identity_verified boolean NOT NULL
  identity_verified_at timestamp with time zone
  identity_provider text

### audit_logs (8 cols, RLS)
  id uuid NOT NULL PK
  actor_email text NOT NULL
  action text NOT NULL
  target_type text NOT NULL
  target_id text
  detail jsonb
  ip text
  created_at timestamp with time zone

### b2b_inquiries (7 cols, RLS)
  id uuid NOT NULL PK
  partner_id uuid ->business_partners
  title text NOT NULL
  body_md text
  status text NOT NULL
  due_at timestamp with time zone
  created_at timestamp with time zone NOT NULL

### banned_word_hits (8 cols, RLS)
  id uuid NOT NULL PK
  word text NOT NULL
  surface text
  post_id uuid
  comment_id uuid
  author_label text
  created_at timestamp with time zone NOT NULL
  word_id uuid

### banned_words (7 cols, RLS)
  id uuid NOT NULL PK
  word text NOT NULL
  severity text NOT NULL
  category text
  notes text
  created_by text
  created_at timestamp with time zone NOT NULL

### banners (18 cols, RLS)
  id uuid NOT NULL PK
  title text NOT NULL
  subtitle text
  cta_label text
  cta_url text
  image_url text
  bg_from text NOT NULL
  bg_to text NOT NULL
  text_color text NOT NULL
  placement text NOT NULL
  is_active boolean NOT NULL
  priority integer NOT NULL
  starts_at timestamp with time zone
  ends_at timestamp with time zone
  target_plan text
  created_by text
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### board_comment_reactions (4 cols, RLS)
  comment_id uuid NOT NULL PK ->board_comments
  user_id uuid NOT NULL PK ->profiles
  reaction text NOT NULL
  created_at timestamp with time zone NOT NULL

### board_comments (7 cols, RLS)
  id uuid NOT NULL PK
  post_id uuid NOT NULL ->board_posts
  author_id uuid NOT NULL ->profiles
  content text NOT NULL
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  parent_id uuid ->board_comments

### board_posts (25 cols, RLS)
  id uuid NOT NULL PK
  author_id uuid NOT NULL ->profiles
  board_type text NOT NULL
  category text
  region text
  title text NOT NULL
  content text NOT NULL
  tags jsonb NOT NULL
  ai_summary text
  ai_keywords jsonb NOT NULL
  price_label text
  address text
  latitude double precision
  longitude double precision
  image_url text
  source_url text
  source_name text
  source_published_at timestamp with time zone
  external_key text
  is_automated boolean NOT NULL
  automation_meta jsonb NOT NULL
  is_published boolean NOT NULL
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  region_phase text

### bookmarks (7 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  target_type text NOT NULL
  target_id text NOT NULL
  label text
  note text
  created_at timestamp with time zone NOT NULL

### building_register_snapshots (6 cols, RLS)
  id uuid NOT NULL PK
  building_key text NOT NULL
  source_key text NOT NULL
  reference_date date
  collected_at timestamp with time zone NOT NULL
  payload jsonb NOT NULL

### business_partners (11 cols, RLS)
  id uuid NOT NULL PK
  name text NOT NULL
  partner_type text NOT NULL
  contact text
  contract_status text NOT NULL
  deal_size_krw bigint
  owner_email text
  notes_md text
  last_contacted_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### chat_attachments (7 cols, RLS)
  id uuid NOT NULL PK
  message_id uuid NOT NULL ->chat_messages
  file_url text NOT NULL
  file_path text
  mime text
  size_bytes bigint NOT NULL
  created_at timestamp with time zone NOT NULL

### chat_blocks (5 cols, RLS)
  id uuid NOT NULL PK
  blocker_email text NOT NULL
  blocked_email text NOT NULL
  reason text
  created_at timestamp with time zone NOT NULL

### chat_messages (10 cols, RLS)
  id uuid NOT NULL PK
  room_id uuid NOT NULL ->chat_rooms
  sender_email text NOT NULL
  body text
  message_type text NOT NULL
  search_vector tsvector
  deleted_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  author_id uuid ->profiles
  content text

### chat_presence (5 cols, RLS)
  user_email text NOT NULL PK
  room_id uuid ->chat_rooms
  is_online boolean NOT NULL
  last_seen_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### chat_reports (10 cols, RLS)
  id uuid NOT NULL PK
  room_id uuid ->chat_rooms
  message_id uuid ->chat_messages
  reporter_email text NOT NULL
  target_email text
  reason text NOT NULL
  status text NOT NULL
  handled_by_email text
  handled_at timestamp with time zone
  created_at timestamp with time zone NOT NULL

### chat_room_members (11 cols, RLS)
  id uuid NOT NULL PK
  room_id uuid NOT NULL ->chat_rooms
  user_email text NOT NULL
  role text NOT NULL
  muted boolean NOT NULL
  joined_at timestamp with time zone NOT NULL
  left_at timestamp with time zone
  last_read_message_id uuid
  user_id uuid ->profiles
  last_read_at timestamp with time zone
  archived_at timestamp with time zone

### chat_rooms (18 cols, RLS)
  id uuid NOT NULL PK
  room_type text NOT NULL
  title text
  status text NOT NULL
  created_by_email text NOT NULL
  expert_id uuid ->expert_profiles
  meeting_id uuid ->meetings
  metadata jsonb NOT NULL
  last_message_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  owner_id uuid ->profiles
  region text
  topic text
  description text
  notice text
  is_public boolean NOT NULL
  is_active boolean NOT NULL

### complex_answers (8 cols, RLS)
  id uuid NOT NULL PK
  question_id uuid NOT NULL ->complex_questions
  author_email text NOT NULL
  body text NOT NULL
  is_accepted boolean NOT NULL
  helpful_count integer NOT NULL
  is_sample boolean NOT NULL
  created_at timestamp with time zone NOT NULL

### complex_engagement (3 cols, RLS)
  complex_id text NOT NULL PK
  view_count bigint NOT NULL
  updated_at timestamp with time zone NOT NULL

### complex_geocode (8 cols, RLS)
  region_name text NOT NULL PK
  complex_name text NOT NULL PK
  query text
  lat double precision
  lng double precision
  status text NOT NULL
  trade_count integer
  geocoded_at timestamp with time zone NOT NULL

### complex_questions (16 cols, RLS)
  id uuid NOT NULL PK
  complex_id text
  complex_name text
  region text
  author_email text NOT NULL
  title text NOT NULL
  body text
  tags text[] NOT NULL
  bounty_points integer NOT NULL
  status text NOT NULL
  answer_count integer NOT NULL
  view_count integer NOT NULL
  accepted_answer_id uuid
  is_sample boolean NOT NULL
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### complex_review_helpful (4 cols, RLS)
  id uuid NOT NULL PK
  review_id uuid NOT NULL
  voter_email text NOT NULL
  created_at timestamp with time zone NOT NULL

### complex_reviews (16 cols, RLS)
  id uuid NOT NULL PK
  complex_id text NOT NULL
  complex_name text NOT NULL
  author_email text NOT NULL
  noise_score smallint
  parking_score smallint
  mgmt_score smallint
  neighbor_score smallint
  transport_score smallint
  comment text
  created_at timestamp with time zone
  updated_at timestamp with time zone
  helpful_count integer NOT NULL
  is_resident boolean NOT NULL
  is_visit_verified boolean NOT NULL
  resident_period text

### content_reports (17 cols, RLS)
  id uuid NOT NULL PK
  post_id uuid ->posts
  comment_id text
  reporter_email text
  reason text NOT NULL
  status text NOT NULL
  admin_note text
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  report_category text
  reporter_id uuid ->profiles
  target_type text
  target_post_id uuid ->board_posts
  target_comment_id uuid ->board_comments
  target_note_id uuid ->inspection_notes
  handled_by uuid ->profiles
  handled_at timestamp with time zone

### court_auctions (21 cols, RLS)
  id bigint NOT NULL PK
  external_key text
  case_no text
  item_no text
  name text
  usage text
  sido text
  sigungu text
  address text
  appraisal_krw bigint
  min_bid_krw bigint
  min_bid_text text
  bid_date text
  fail_count integer
  status text
  court_name text
  source text NOT NULL
  thumb_url text
  detail_url text
  is_sample boolean NOT NULL
  updated_at timestamp with time zone NOT NULL

### dev_deals (25 cols, RLS)
  id uuid NOT NULL PK
  owner_email text NOT NULL
  title text NOT NULL
  deal_type text
  region text
  address text
  land_area_m2 numeric
  gross_floor_area_m2 numeric
  units integer
  total_cost_krw bigint
  needed_partners text[] NOT NULL
  budget_text text
  summary text
  description text
  contact_name text
  contact_masked text
  contact_email text
  contact_phone text
  status text NOT NULL
  is_verified boolean NOT NULL
  is_sample boolean NOT NULL
  view_count integer NOT NULL
  inquiry_count integer NOT NULL
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL

### dev_inquiries (9 cols, RLS)
  id uuid NOT NULL PK
  deal_id uuid NOT NULL
  from_email text NOT NULL
  from_company text
  partner_type text
  message text
  proposed_terms text
  status text NOT NULL
  created_at timestamp with time zone NOT NULL

### dev_partners (13 cols, RLS)
  id uuid NOT NULL PK
  owner_email text NOT NULL
  company_name text NOT NULL
  partner_type text
  specialties text[] NOT NULL
  region text
  intro text
  portfolio_url text
  contact_email text
  contact_phone text
  is_verified boolean NOT NULL
  is_sample boolean NOT NULL
  created_at timestamp with time zone NOT NULL

### etl_runs (13 cols, RLS)
  id uuid NOT NULL PK
  run_key text NOT NULL
  source text NOT NULL
  scope text NOT NULL
  status text NOT NULL
  started_at timestamp with time zone NOT NULL
  finished_at timestamp with time zone
  inserted_count integer NOT NULL
  updated_count integer NOT NULL
  error_count integer NOT NULL
  error_log jsonb NOT NULL
  params jsonb NOT NULL
  created_at timestamp with time zone NOT NULL

### expert_consultations (13 cols, RLS)
  id uuid NOT NULL PK
  expert_id uuid NOT NULL ->expert_profiles
  requester_email text NOT NULL
  requester_label text
  message text NOT NULL
  contact_info text
  consult_type text NOT NULL
  status text NOT NULL
  reply_message text
  replied_at timestamp with time zone
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  preferred_time text

### expert_fraud_events (7 cols, RLS)
  id uuid NOT NULL PK
  expert_id uuid
  user_email text NOT NULL
  event_type text NOT NULL
  severity text NOT NULL
  context jsonb NOT NULL
  created_at timestamp with time zone NOT NULL

### expert_profiles (26 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid ->app_users
  name text NOT NULL
  title text NOT NULL
  category text NOT NULL
  regions text[] NOT NULL
  specialties text[] NOT NULL
  introduction text
  consultation_fee integer NOT NULL
  report_fee integer NOT NULL
  rating numeric(3,2) NOT NULL
  reviews integer NOT NULL
  consultations integer NOT NULL
  experience text
  response_rate integer NOT NULL
  response_time text
  is_verified boolean NOT NULL
  is_premium boolean NOT NULL
  badge text
  gradient text
  created_at timestamp with time zone NOT NULL
  updated_at timestamp with time zone NOT NULL
  owner_email text
  broker_registration_no text
  verification_checked_at timestamp with time zone
  verification_note text

### expert_verification_requests (31 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid ->app_users
  applicant_email text NOT NULL
  display_name text NOT NULL
  specialty text NOT NULL
  regions text[] NOT NULL
  certifications text[] NOT NULL
  years_experience integer NOT NULL
  intro text
  status text NOT NULL
  reviewer_email text
  review_note text
  created_at timestamp with time zone NOT NULL
  reviewed_at timestamp with time zone
  expert_type text
  phone text
  organization text
  cert_number text
  cert_number_normalized text
  document_urls text[] NOT NULL
  business_reg_no text
  payout_account_holder text
  payout_account_last4 text
  identity_verified boolean NOT NULL
  fraud_flags jsonb NOT NULL
  workflow_stage text NOT NULL
  source_verification_url text
  source_verified_at timestamp with time zone
  interview_completed_at timestamp with time zone
  next_revalidation_at timestamp with time zone
  terms_agreed_at timestamp with time zone

### feature_trial_usage (4 cols, RLS)
  author_email text NOT NULL PK
  compare_trials_used integer NOT NULL
  share_trials_used integer NOT NULL
  updated_at timestamp with time zone NOT NULL

### feature_usage_events (8 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid NOT NULL ->profiles
  feature_key text NOT NULL
  resource_id text
  amount integer NOT NULL
  usage_period date NOT NULL
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL

### finance_cash_balance (3 cols, RLS)
  month text NOT NULL PK
  balance_krw bigint NOT NULL
  updated_at timestamptz NOT NULL

### finance_entries (8 cols, RLS)
  id uuid NOT NULL PK
  month text NOT NULL
  kind text NOT NULL
  category text NOT NULL
  amount_krw bigint NOT NULL
  memo text
  created_by text
  created_at timestamptz NOT NULL

### group_members (10 cols, RLS)
  id uuid NOT NULL PK
  meeting_id uuid NOT NULL ->meetings
  user_email text NOT NULL
  user_label text
  status text NOT NULL
  joined_at timestamptz NOT NULL
  left_at timestamptz
  user_name text
  message text
  updated_at timestamptz

### iap_receipts (8 cols, RLS)
  id uuid NOT NULL PK
  platform text NOT NULL
  transaction_key text NOT NULL
  product_id text NOT NULL
  user_email text NOT NULL
  expires_at timestamptz
  raw jsonb
  created_at timestamptz NOT NULL

### inspection_ai_jobs (12 cols, RLS)
  id uuid NOT NULL PK
  session_id uuid ->inspection_sessions
  author_email text NOT NULL
  job_type text NOT NULL
  status text NOT NULL
  input jsonb NOT NULL
  output jsonb
  error text
  model_version text
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  completed_at timestamptz

### inspection_ai_reports (26 cols, RLS)
  id uuid NOT NULL PK
  note_id uuid NOT NULL ->inspection_notes
  model text
  headline text
  summary text
  strengths jsonb NOT NULL
  risks jsonb NOT NULL
  follow_ups jsonb NOT NULL
  keywords jsonb NOT NULL
  scores jsonb NOT NULL
  verdict text
  map_focus_region text
  map_focus_reason text
  recommended_action text
  raw_result jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  structured_report jsonb NOT NULL
  confidence jsonb NOT NULL
  evidence_items jsonb NOT NULL
  model_version text
  prompt_version text
  strategy_type text
  risk_level text
  disclaimer text
  one_line_conclusion text

### inspection_ai_usage (5 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  yyyymm text NOT NULL
  report_count integer NOT NULL
  created_at timestamptz NOT NULL

### inspection_note_photos (8 cols, RLS)
  id uuid NOT NULL PK
  note_id uuid NOT NULL ->inspection_notes
  image_url text NOT NULL
  caption text
  tags jsonb NOT NULL
  sort_order integer NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### inspection_notes (55 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  author_label text
  title text NOT NULL
  region text NOT NULL
  apt_name text
  visit_date date NOT NULL
  weather text
  transportation text
  summary text
  score_location integer NOT NULL
  score_school integer NOT NULL
  score_transport integer NOT NULL
  score_facility integer NOT NULL
  score_future integer NOT NULL
  checklist jsonb NOT NULL
  sections jsonb NOT NULL
  photos ARRAY NOT NULL
  ai_analysis jsonb
  is_public boolean NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  slug text
  body_md text
  author_type text NOT NULL
  metadata jsonb NOT NULL
  intent text NOT NULL
  user_id uuid ->profiles
  property_name text
  budget_label text
  tags jsonb NOT NULL
  photo_notes text
  voice_notes text
  check_items jsonb NOT NULL
  risk_notes text
  verdict text
  status text NOT NULL
  analysis_requested_at timestamptz
  analyzed_at timestamptz
  published_at timestamptz
  public_summary text
  public_risks text
  cover_image_url text
  visit_at timestamptz
  address_road text
  address_jibun text
  latitude float8
  longitude float8
  bjd_code text
  sido text
  sigungu text
  dong text
  persona text NOT NULL
  analysis_content_hash text
  check_detail jsonb NOT NULL

### inspection_schedules (14 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  author_label text
  title text NOT NULL
  region text NOT NULL
  apt_name text
  scheduled_at timestamptz NOT NULL
  duration_min integer NOT NULL
  memo text
  checklist jsonb NOT NULL
  status text NOT NULL
  note_id uuid ->inspection_notes
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### inspection_session_media (12 cols, RLS)
  id uuid NOT NULL PK
  session_id uuid NOT NULL ->inspection_sessions
  media_type text NOT NULL
  storage_path text
  public_url text
  mime text
  size_bytes bigint
  exif jsonb NOT NULL
  transcript jsonb
  image_tags jsonb
  upload_status text NOT NULL
  created_at timestamptz NOT NULL

### inspection_sessions (21 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  author_label text
  complex_id text
  region text NOT NULL
  apt_name text
  mode text NOT NULL
  status text NOT NULL
  privacy_class text NOT NULL
  geo_lat float8
  geo_lng float8
  geo_precision text
  started_at timestamptz NOT NULL
  ended_at timestamptz
  capture jsonb NOT NULL
  structured_report jsonb
  report_version integer NOT NULL
  note_id uuid ->inspection_notes
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### inspection_share_links (9 cols, RLS)
  id uuid NOT NULL PK
  session_id uuid ->inspection_sessions
  note_id uuid ->inspection_notes
  token text NOT NULL
  author_email text NOT NULL
  expires_at timestamptz
  download_count integer NOT NULL
  max_downloads integer
  created_at timestamptz NOT NULL

### ir_documents (9 cols, RLS)
  id uuid NOT NULL PK
  version text NOT NULL
  title text NOT NULL
  summary_md text
  file_path text
  is_published boolean NOT NULL
  created_by text
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### ir_downloads_log (5 cols, RLS)
  id uuid NOT NULL PK
  document_id uuid ->ir_documents
  accessed_by text
  accessed_at timestamptz NOT NULL
  ip_hash text

### ir_investor_access (5 cols, RLS)
  id uuid NOT NULL PK
  email text NOT NULL
  role text NOT NULL
  granted_by text
  granted_at timestamptz NOT NULL

### kv_store_99a854cb (2 cols, RLS)
  key text NOT NULL PK
  value jsonb NOT NULL

### legal_regions (13 cols, RLS)
  lawd_cd text NOT NULL PK
  sido text NOT NULL
  sigungu text NOT NULL
  display_name text NOT NULL
  scope text NOT NULL
  lat numeric
  lng numeric
  enabled boolean NOT NULL
  priority integer NOT NULL
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  region_phase text

### listing_inquiry (12 cols, RLS)
  id uuid NOT NULL PK
  listing_id uuid NOT NULL ->listings
  listing_owner_email text NOT NULL
  complex_name text
  region_name text
  inquirer_email text
  inquirer_label text
  contact text
  message text NOT NULL
  status text NOT NULL
  created_at timestamptz NOT NULL
  read_at timestamptz

### listings (32 cols, RLS)
  id uuid NOT NULL PK
  author_email text NOT NULL
  author_label text
  source text NOT NULL
  listing_type text NOT NULL
  complex_name text NOT NULL
  region_name text
  address text
  price_krw bigint
  deposit_krw bigint
  monthly_krw bigint
  area_m2 numeric
  floor integer
  description text
  contact text
  status text NOT NULL
  reject_reason text
  created_at timestamptz
  updated_at timestamptz
  lat float8
  lng float8
  thumbnail_url text
  photos jsonb
  view_count integer
  boost_until timestamptz
  owner_verified boolean
  refreshed_at timestamptz
  report_count integer NOT NULL
  is_hidden boolean NOT NULL
  flag_reason text
  is_duplicate boolean NOT NULL
  deleted_at timestamptz

### map_events (6 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid ->profiles
  place_id text
  event_name text NOT NULL
  payload jsonb NOT NULL
  created_at timestamptz NOT NULL

### map_metric_refresh_runs (10 cols, RLS)
  run_key text NOT NULL PK
  target_date date NOT NULL
  status text NOT NULL
  dry_run boolean NOT NULL
  started_at timestamptz NOT NULL
  finished_at timestamptz
  inserted_count integer NOT NULL
  error_count integer NOT NULL
  error_log jsonb NOT NULL
  metadata jsonb NOT NULL

### map_metric_snapshots (20 cols, RLS)
  metric_date date NOT NULL PK
  level text NOT NULL PK
  metric_key text NOT NULL PK
  name text NOT NULL
  region_code text NOT NULL
  lat float8 NOT NULL
  lng float8 NOT NULL
  complex_count integer NOT NULL
  listing_count integer NOT NULL
  trade_count integer NOT NULL
  rent_count integer NOT NULL
  avg_deal_amount_krw bigint
  avg_deposit_krw bigint
  avg_price_per_pyeong_krw bigint
  trend text NOT NULL
  trend_delta_pct numeric
  source text NOT NULL
  metadata jsonb NOT NULL
  stale_after timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### map_related_experts (24 cols, RLS)
  id uuid NOT NULL PK
  external_key text NOT NULL
  expert_type text NOT NULL
  name text NOT NULL
  category text
  region text
  region_phase text
  address text
  road_address text
  phone text
  latitude float8
  longitude float8
  place_url text
  source_name text
  source_url text
  source_external_id text
  source_published_at timestamptz
  tags jsonb NOT NULL
  summary text
  is_active boolean NOT NULL
  collected_at timestamptz NOT NULL
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### market_complex_price (15 cols, RLS)
  id bigint NOT NULL PK
  source text NOT NULL
  complex_id text NOT NULL
  name text NOT NULL
  region_id text
  lat float8
  lng float8
  area_m2 float8
  sale_lower float8
  sale_general float8
  sale_upper float8
  jeonse_lower float8
  jeonse_general float8
  jeonse_upper float8
  updated_at timestamptz NOT NULL

### market_ingest_log (8 cols, RLS)
  id bigint NOT NULL PK
  source text NOT NULL
  dataset text NOT NULL
  origin text NOT NULL
  rows integer NOT NULL
  status text NOT NULL
  message text
  created_at timestamptz NOT NULL

### market_lifestyle_indicators (9 cols, RLS)
  source text NOT NULL PK
  region_code text NOT NULL PK
  region_name text NOT NULL
  indicator_type text NOT NULL PK
  period text NOT NULL PK
  value numeric
  unit text
  raw jsonb NOT NULL
  updated_at timestamptz NOT NULL

### market_price_indices (9 cols, RLS)
  source text NOT NULL PK
  region_code text NOT NULL PK
  region_name text NOT NULL
  index_type text NOT NULL PK
  month text NOT NULL PK
  value numeric
  trend text NOT NULL
  raw jsonb NOT NULL
  updated_at timestamptz NOT NULL

### market_region_monthly (16 cols, RLS)
  region_code text NOT NULL PK ->legal_regions
  region_name text NOT NULL
  deal_type text NOT NULL PK
  property_type text NOT NULL PK
  month text NOT NULL PK
  transaction_count integer NOT NULL
  avg_deal_amount_krw bigint
  avg_deposit_krw bigint
  avg_monthly_rent_krw bigint
  avg_price_per_pyeong_krw bigint
  trend text NOT NULL
  trend_delta_pct numeric
  source text NOT NULL
  metadata jsonb NOT NULL
  updated_at timestamptz NOT NULL
  region_phase text

### market_region_price (16 cols, RLS)
  id bigint NOT NULL PK
  source text NOT NULL
  region_id text NOT NULL
  region_name text NOT NULL
  property_type text NOT NULL
  period text NOT NULL
  avg_sale float8
  median_sale float8
  per_m2_sale float8
  avg_jeonse float8
  jeonse_ratio float8
  sale_change float8
  trade_count float8
  buy_superiority float8
  jeonse_supply float8
  updated_at timestamptz NOT NULL

### market_region_series (12 cols, RLS)
  id bigint NOT NULL PK
  source text NOT NULL
  region_id text NOT NULL
  region_name text NOT NULL
  level text NOT NULL
  property_type text NOT NULL
  metric text NOT NULL
  period_type text NOT NULL
  period date NOT NULL
  value float8 NOT NULL
  dataset_date date
  updated_at timestamptz NOT NULL

### market_request_proposals (7 cols, RLS)
  id uuid NOT NULL PK
  request_id text NOT NULL
  proposer_email text NOT NULL
  message text
  status text NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### market_requests (14 cols, RLS)
  id uuid NOT NULL PK
  requester_email text NOT NULL
  requester_label text NOT NULL
  title text NOT NULL
  description text NOT NULL
  request_type text NOT NULL
  city text NOT NULL
  district text NOT NULL
  budget_min integer
  budget_max integer
  due_date date
  status text NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### market_transactions (22 cols, RLS)
  id uuid NOT NULL PK
  external_key text NOT NULL
  source text NOT NULL
  transaction_type text NOT NULL
  property_type text NOT NULL
  region_code text NOT NULL ->legal_regions
  region_name text NOT NULL
  complex_name text
  address text
  contract_ym text NOT NULL
  contract_day integer
  deal_amount_krw bigint
  deposit_krw bigint
  monthly_rent_krw bigint
  area_m2 numeric
  floor integer
  build_year integer
  price_per_pyeong_krw bigint
  raw jsonb NOT NULL
  collected_at timestamptz NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### meeting_requests (13 cols, RLS)
  id uuid NOT NULL PK
  organizer_email text NOT NULL
  title text NOT NULL
  description text
  region text NOT NULL
  scheduled_at timestamptz
  capacity integer NOT NULL
  is_public boolean NOT NULL
  status text NOT NULL
  reviewer_email text
  review_note text
  created_at timestamptz NOT NULL
  reviewed_at timestamptz

### meetings (19 cols, RLS)
  id uuid NOT NULL PK
  organizer_email text NOT NULL
  organizer_label text
  title text NOT NULL
  description text
  region text NOT NULL
  category text
  scheduled_at timestamptz
  max_members integer NOT NULL
  current_members integer NOT NULL
  fee integer NOT NULL
  is_public boolean NOT NULL
  is_premium boolean NOT NULL
  tags ARRAY NOT NULL
  checklist ARRAY NOT NULL
  gradient text
  status text NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### membership_plans (14 cols, RLS)
  id text NOT NULL PK
  name text NOT NULL
  description text
  billing_cycle text NOT NULL
  tier_code text NOT NULL
  price_krw integer NOT NULL
  is_active boolean NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  period_months integer NOT NULL
  monthly_equivalent_krw integer NOT NULL
  discount_rate_label text NOT NULL
  feature_summary jsonb NOT NULL
  commission_policy jsonb NOT NULL

### note_embeddings (12 cols, RLS)
  note_id uuid NOT NULL PK ->inspection_notes
  user_id uuid NOT NULL
  content_hash text NOT NULL
  embedding USER-DEFINED
  region text
  property_name text
  address_road text
  verdict text
  risk_notes text
  check_items jsonb NOT NULL
  report_summary text
  updated_at timestamptz NOT NULL

### note_templates (13 cols, RLS)
  id uuid NOT NULL PK
  author_email text
  title text NOT NULL
  description text
  category text NOT NULL
  sections jsonb NOT NULL
  tags ARRAY NOT NULL
  use_count integer NOT NULL
  is_official boolean NOT NULL
  is_public boolean NOT NULL
  is_sample boolean NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### notices (8 cols, RLS)
  id uuid NOT NULL PK
  title text NOT NULL
  body text NOT NULL
  category text NOT NULL
  pinned boolean NOT NULL
  published_at timestamptz
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### notification_outbox (9 cols, RLS)
  id uuid NOT NULL PK
  channel text NOT NULL
  to_email text NOT NULL
  subject text NOT NULL
  body text NOT NULL
  metadata jsonb NOT NULL
  status text NOT NULL
  created_at timestamptz NOT NULL
  sent_at timestamptz

### notification_preferences (14 cols, RLS)
  user_email text NOT NULL PK
  email_comments boolean NOT NULL
  email_likes boolean NOT NULL
  email_meeting boolean NOT NULL
  email_expert boolean NOT NULL
  email_marketing boolean NOT NULL
  push_comments boolean NOT NULL
  push_likes boolean NOT NULL
  push_meeting boolean NOT NULL
  push_expert boolean NOT NULL
  updated_at timestamptz NOT NULL
  alert_phone text
  sms_price_alerts boolean NOT NULL
  sms_consent_at timestamptz

### okr_key_results (7 cols, RLS)
  id uuid NOT NULL PK
  objective_id uuid NOT NULL ->okr_objectives
  title text NOT NULL
  target_value numeric NOT NULL
  current_value numeric NOT NULL
  unit text
  updated_at timestamptz NOT NULL

### okr_objectives (6 cols, RLS)
  id uuid NOT NULL PK
  quarter text NOT NULL
  title text NOT NULL
  owner_email text
  description text
  created_at timestamptz NOT NULL

### onbid_auctions (24 cols, RLS)
  id bigint NOT NULL PK
  external_key text NOT NULL
  cltr_mng_no text
  pbct_cdtn_no text
  onbid_cltrno text
  pbct_no text
  name text
  prpt_div text
  usage_mcls text
  usage_scls text
  sido text
  sigungu text
  emd text
  appraisal_krw bigint
  min_bid_krw bigint
  min_bid_text text
  land_sqms numeric
  bld_sqms numeric
  bid_begin text
  bid_end text
  status text
  thumb_url text
  source text
  updated_at timestamptz

### open_beta_tasks (9 cols, RLS)
  id text NOT NULL PK
  title text NOT NULL
  priority text NOT NULL
  status text NOT NULL
  owner text
  due_date date
  note text
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### owner_verifications (15 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid ->profiles
  property_address text NOT NULL
  complex_name text NOT NULL
  region text NOT NULL
  document_paths jsonb NOT NULL
  note text NOT NULL
  status text NOT NULL
  admin_note text NOT NULL
  reviewed_by uuid ->profiles
  reviewed_at timestamptz
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  listing_id uuid ->listings
  applicant_email text NOT NULL

### partnership_inquiries (9 cols, RLS)
  id uuid NOT NULL PK
  inquiry_type text NOT NULL
  company text NOT NULL
  name text NOT NULL
  email text NOT NULL
  phone text NOT NULL
  message text NOT NULL
  status text NOT NULL
  created_at timestamptz NOT NULL

### password_reset_tokens (6 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  token text NOT NULL
  expires_at timestamptz NOT NULL
  used boolean NOT NULL
  created_at timestamptz NOT NULL

### payment_audit_logs (5 cols, RLS)
  id uuid NOT NULL PK
  event_type text NOT NULL
  order_id text
  payload jsonb NOT NULL
  created_at timestamptz NOT NULL

### payment_orders (19 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid NOT NULL ->profiles
  plan_id text ->membership_plans
  provider text NOT NULL
  provider_order_id text NOT NULL
  payment_key text
  amount_krw integer NOT NULL
  status text NOT NULL
  approved_at timestamptz
  failure_code text
  failure_message text
  raw_response jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  verified_before_payment boolean NOT NULL
  period_months integer
  starts_at timestamptz
  ends_at timestamptz
  subscription_id uuid

### payments (17 cols, RLS)
  id uuid NOT NULL PK
  order_id text NOT NULL
  user_email text
  plan text NOT NULL
  billing text NOT NULL
  amount integer NOT NULL
  currency text NOT NULL
  status text NOT NULL
  provider text NOT NULL
  provider_payment_key text
  method text
  receipt_url text
  metadata jsonb NOT NULL
  requested_at timestamptz NOT NULL
  paid_at timestamptz
  failed_at timestamptz
  cancelled_at timestamptz

### plan_entitlements (11 cols, RLS)
  id uuid NOT NULL PK
  tier_code text NOT NULL
  feature_key text NOT NULL
  limit_kind text NOT NULL
  quota_count integer
  quota_period text NOT NULL
  enabled boolean NOT NULL
  description text NOT NULL
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### platform_activity_events (9 cols, RLS)
  id uuid NOT NULL PK
  platform text NOT NULL
  user_email text
  event_name text NOT NULL
  source text
  campaign text
  path text
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL

### point_ledger (8 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  delta integer NOT NULL
  reason text NOT NULL
  ref_id text
  balance integer NOT NULL
  created_at timestamptz NOT NULL
  expires_at timestamptz

### policy_versions (7 cols, RLS)
  id uuid NOT NULL PK
  kind text NOT NULL
  version text NOT NULL
  effective_date date NOT NULL
  summary text NOT NULL
  content_md text NOT NULL
  created_at timestamptz NOT NULL

### post_likes (4 cols, RLS)
  id uuid NOT NULL PK
  post_id uuid NOT NULL ->posts
  user_key text NOT NULL
  created_at timestamptz NOT NULL

### posts (26 cols, RLS)
  id uuid NOT NULL PK
  author_label text NOT NULL
  category text NOT NULL
  city text NOT NULL
  district text NOT NULL
  title text NOT NULL
  body text NOT NULL
  tags ARRAY NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  like_count integer NOT NULL
  comment_count integer NOT NULL
  view_count integer NOT NULL
  comments jsonb NOT NULL
  related_site text
  visibility text NOT NULL
  notify_comments boolean NOT NULL
  notify_email text
  ugc_post_type text
  author_email text
  source_url text
  source_name text
  source_published_at timestamptz
  external_key text
  is_automated boolean NOT NULL
  automation_meta jsonb NOT NULL

### profiles (24 cols, RLS)
  id uuid NOT NULL PK
  email text
  full_name text NOT NULL
  phone text NOT NULL
  company_name text NOT NULL
  bio text NOT NULL
  role text NOT NULL
  preferred_board text NOT NULL
  interest_tags jsonb NOT NULL
  verification_status text NOT NULL
  terms_accepted_at timestamptz
  marketing_opt_in boolean NOT NULL
  membership_tier text NOT NULL
  membership_expires_at timestamptz
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  settings jsonb NOT NULL
  road_address text NOT NULL
  jibun_address text NOT NULL
  address_detail text NOT NULL
  region text NOT NULL
  onboarding_step text NOT NULL
  owner_verification_status text NOT NULL
  handle text

### public_data_cache (6 cols, RLS)
  id uuid NOT NULL PK
  source text NOT NULL
  cache_key text NOT NULL
  payload jsonb NOT NULL
  fetched_at timestamptz
  expires_at timestamptz NOT NULL

### public_data_snapshots (6 cols, RLS)
  id uuid NOT NULL PK
  source_key text NOT NULL
  subject_key text NOT NULL
  reference_date date
  collected_at timestamptz NOT NULL
  payload jsonb NOT NULL

### public_data_sources (6 cols, RLS)
  id uuid NOT NULL PK
  source_key text NOT NULL
  source_name text NOT NULL
  status text NOT NULL
  metadata jsonb NOT NULL
  updated_at timestamptz NOT NULL

### public_property_records (16 cols, RLS)
  id bigint NOT NULL PK
  dataset text NOT NULL
  complex_name text
  region_name text
  address text
  record_date date
  period text
  area_m2 numeric
  price_low_krw bigint
  price_high_krw bigint
  deposit_krw bigint
  monthly_rent_krw bigint
  floor text
  metadata jsonb NOT NULL
  source_file text
  created_at timestamptz NOT NULL

### push_subscriptions (10 cols, RLS)
  id uuid NOT NULL PK
  user_email text
  endpoint text NOT NULL
  p256dh text NOT NULL
  auth text NOT NULL
  user_agent text
  created_at timestamptz NOT NULL
  last_used_at timestamptz
  requires_login boolean NOT NULL
  event_types ARRAY NOT NULL

### redevelopment_projects (16 cols, RLS)
  id text NOT NULL PK
  name text NOT NULL
  type_key text NOT NULL
  stage_key text NOT NULL
  sido text NOT NULL
  sigungu text NOT NULL
  address text
  lat float8 NOT NULL
  lng float8 NOT NULL
  households integer
  summary text
  source text
  source_url text
  is_sample boolean NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### referral_codes (3 cols, RLS)
  user_email text NOT NULL PK
  code text NOT NULL
  created_at timestamptz NOT NULL

### referral_redemptions (5 cols, RLS)
  id uuid NOT NULL PK
  code text NOT NULL
  referrer_email text NOT NULL
  referee_email text NOT NULL
  created_at timestamptz NOT NULL

### report_purchases (6 cols, RLS)
  id uuid NOT NULL PK
  report_id uuid NOT NULL ->reports
  user_email text NOT NULL
  amount integer NOT NULL
  payment_id text
  purchased_at timestamptz NOT NULL

### reports (21 cols, RLS)
  id uuid NOT NULL PK
  author_id uuid ->expert_profiles
  title text NOT NULL
  subtitle text
  category text NOT NULL
  region text
  price integer NOT NULL
  original_price integer NOT NULL
  tags ARRAY NOT NULL
  table_of_contents ARRAY NOT NULL
  preview_content text
  rating numeric NOT NULL
  reviews integer NOT NULL
  downloads integer NOT NULL
  views integer NOT NULL
  pages integer NOT NULL
  is_premium boolean NOT NULL
  gradient text
  published_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  author_label text

### roadmap_milestones (7 cols, RLS)
  id uuid NOT NULL PK
  quarter text NOT NULL
  title text NOT NULL
  status text NOT NULL
  launched_at timestamptz
  retro_md text
  created_at timestamptz NOT NULL

### saved_places (12 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid NOT NULL ->profiles
  title text NOT NULL
  region text
  address text
  lat float8
  lng float8
  source text NOT NULL
  payload jsonb NOT NULL
  status text NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### saved_searches (12 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  label text NOT NULL
  query text
  scope text NOT NULL
  filters jsonb NOT NULL
  alert_enabled boolean NOT NULL
  last_checked_at timestamptz
  last_match_count integer NOT NULL
  is_sample boolean NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### stripe_webhook_events (2 cols, RLS)
  event_id text NOT NULL PK
  received_at timestamptz NOT NULL

### uploads (8 cols, RLS)
  id uuid NOT NULL PK
  uploader_email text NOT NULL
  bucket text NOT NULL
  path text NOT NULL
  url text
  size_bytes bigint
  mime text
  created_at timestamptz

### user_attendance (5 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  date date NOT NULL
  streak integer NOT NULL
  created_at timestamptz

### user_blocks (5 cols, RLS)
  id uuid NOT NULL PK
  blocker_id uuid NOT NULL ->profiles
  blocked_id uuid NOT NULL ->profiles
  reason text
  created_at timestamptz NOT NULL

### user_consents (15 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  terms_agreed boolean NOT NULL
  privacy_agreed boolean NOT NULL
  age_confirmed boolean NOT NULL
  marketing_agreed boolean NOT NULL
  location_agreed boolean NOT NULL
  terms_version text NOT NULL
  privacy_version text NOT NULL
  ip_address text
  user_agent text
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  field_capture_agreed boolean NOT NULL
  field_capture_version text

### user_follows (3 cols, RLS)
  follower_email text NOT NULL PK
  followed_email text NOT NULL PK
  created_at timestamptz

### user_inbox_notifications (7 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  title text NOT NULL
  body text NOT NULL
  action_url text
  read_at timestamptz
  created_at timestamptz NOT NULL

### user_onboarding (6 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  completed_steps ARRAY NOT NULL
  completed_at timestamptz
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### user_personalization (3 cols, RLS)
  email text NOT NULL PK
  personalization jsonb NOT NULL
  updated_at timestamptz NOT NULL

### user_points (5 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  delta integer NOT NULL
  reason text NOT NULL
  created_at timestamptz

### user_policy_consents (5 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  kind text NOT NULL
  version text NOT NULL
  agreed_at timestamptz NOT NULL

### user_preferences (6 cols, RLS)
  author_email text NOT NULL PK
  persona text
  priorities jsonb NOT NULL
  holding_years integer
  risk_tolerance integer
  updated_at timestamptz NOT NULL

### user_recent_complexes (5 cols, RLS)
  user_email text NOT NULL PK
  complex_id text NOT NULL PK
  name text NOT NULL
  region text
  viewed_at timestamptz NOT NULL

### user_subscriptions (18 cols, RLS)
  id uuid NOT NULL PK
  user_id uuid NOT NULL ->profiles
  plan_id text ->membership_plans
  tier_code text NOT NULL
  status text NOT NULL
  provider text NOT NULL
  provider_order_id text
  payment_order_id uuid ->payment_orders
  period_months integer NOT NULL
  starts_at timestamptz NOT NULL
  current_period_start timestamptz NOT NULL
  current_period_end timestamptz NOT NULL
  renews_at timestamptz
  cancel_at_period_end boolean NOT NULL
  canceled_at timestamptz
  metadata jsonb NOT NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL

### user_watchlist (9 cols, RLS)
  id uuid NOT NULL PK
  user_email text NOT NULL
  complex_id text NOT NULL
  complex_name text NOT NULL
  alert_price_min bigint
  alert_price_max bigint
  created_at timestamptz
  last_price_krw bigint
  last_notified_at timestamptz

### web_vitals (8 cols, RLS)
  id uuid NOT NULL PK
  metric text NOT NULL
  value numeric NOT NULL
  rating text
  path text
  user_agent text
  nav_type text
  created_at timestamptz NOT NULL
