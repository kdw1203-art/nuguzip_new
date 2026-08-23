# 백업·복구 리허설 절차 — 분기 1회

> [개선 #45] 검증 안 된 백업은 백업이 아니다. 분기마다 30분. (2026-08-22 작성)

## 1. 백업 설정 확인 (사장님, 5분 — 분기 1회)
Supabase 대시보드 → 프로젝트 → Database → Backups:
- Daily backups 목록에 **최근 7일치가 있는지** 확인 (무료 플랜 7일 보관)
- 스크린샷 한 장을 남긴다 (확인 기록)
- Pro 플랜 전환 시 PITR(시점 복구) 활성을 검토 — 실수 삭제 복구의 최선

## 2. 복구 리허설 (Claude 주도, 25분 — 분기 1회)
운영 DB 를 건드리지 않고 복구 가능성만 검증한다:
1. Claude 가 핵심 표(profiles·inspection_notes·board_posts·point_ledger·
   billing_subscriptions) 행수·최신행 스냅샷을 기록
2. Supabase Backups 에서 가장 최근 백업의 "Restore to new project" 가능 여부 확인
   (실제 복구는 하지 않는다 — 새 프로젝트 생성은 비용·혼선. 버튼과 백업 무결성만)
3. 마이그레이션 재현성 검증: 저장소의 supabase/migrations 전체가
   check-migration-ledger 를 통과하는지 = 스키마는 저장소만으로 재구축 가능
4. 결과를 주간 브리핑에 한 줄 기록

## 3. 실제 장애 시 (그날의 절차)
1. 증상 기록(시각·화면·오류) → 2. Supabase Status 확인 → 3. 최근 백업으로
   Restore (Supabase 지원 문서 절차) → 4. 복구 후 Claude 가 행수 대조 검증

## 4. 논리 백업 (보조 보험 — 무료 플랜 7일 보관의 바깥)
`node ./scripts/backup-critical-tables.mjs` — 재수집 불가 자산 12표(profiles·
inspection_notes·board_posts·comments·point_ledger·billing·payments·템플릿·
저장검색·관심단지·전문가·신고)를 `backups/YYYY-MM-DD/*.json` + manifest(행수)로
내려받는다. 시세·뉴스 원문 등 재수집 가능 데이터는 대상이 아니다.
backups/ 는 .gitignore — 커밋 금지, 로컬 PC나 별도 드라이브에 보관.

---

## 리허설 기록

### 1회차 — 2026-08-23 ([#149], Claude 수행)
- **① 핵심 표 스냅샷 (실측)**: profiles 14 · inspection_notes 19 · board_posts 722 ·
  point_ledger 1 · billing_subscriptions 0 · payments 4 · public 스키마 표 181개.
  최신 행: profile 08-16, note 08-22, post 08-22 — 스냅샷과 서비스 화면 수치 일치 확인.
- **② 스키마 재현성 (실측)**: `check-migration-ledger` **PASS**
  (원장 207행 · 파일 137개 · 원장 생성 객체 280개 중 파일 정의 202 + known_unmirrored 78 —
  전수 설명됨). 스키마는 저장소 + 원장만으로 재구축 가능한 상태.
- **③ 논리 백업 경로 (신규)**: backup-critical-tables.mjs 작성·문법 검증.
  실행은 서비스 키가 있는 오너 PC에서 — 아래 오너 액션.
- **④ 대시보드 백업 확인 (👤 오너, 5분 — 미수행)**: Supabase 대시보드 → Database →
  Backups 에서 최근 7일 일일 백업 존재 확인 + 스크린샷. 이 확인이 끝나야 1회차 완결.
  (MCP 로는 백업 목록을 읽을 수 없어 이 단계만 사람 손이 필요하다.)
- 다음 리허설 예정: 2026-11 (분기 1회).
