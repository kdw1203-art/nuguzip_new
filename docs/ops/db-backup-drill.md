# DB 백업·복구 리허설

실복구는 Supabase Dashboard(Pro PITR)에서 오너가 수행. 이 문서는 체크리스트다.

## 사전

- [ ] Supabase 프로젝트 Pro 이상 + PITR/일일 백업 확인  
- [ ] `SUPABASE_DB_DIRECT_URL` 로컬 ops 보관(비밀 저장소)  
- [ ] 복구 대상은 **별도 branch/프로젝트** 우선 (프로덕션 직접 restore 금지)

## 리허설 단계

1. Dashboard → Database → Backups 에서 최근 백업 시각 기록  
2. “Restore to a new project” 또는 branch 로 복원  
3. 복원 DB에서 스모크:
   - `select count(*) from app_users;`
   - `select count(*) from inspection_notes;`
   - 앱을 임시 env로 연결 시 `GET /api/health` (또는 동등 health) 200  
4. 소요 시간·담당자·이슈를 아래에 기록  
5. 임시 프로젝트 삭제

## 리허설 기록 (오너 기입)

| 일시 | 담당 | 백업 시점 | 복원 대상 | 소요 | 결과 |
|------|------|-----------|-----------|------|------|
| _TBD_ | | | | | |

완료 후 `lib/open-beta/checklist.ts` 의 `db-backup-drill` 을 `done` 으로 갱신.
