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
