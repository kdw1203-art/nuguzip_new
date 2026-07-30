# 커뮤니티 모더레이션 운영 룰

코드 기준: `lib/admin/moderation-policy.ts`, 큐 UI: `/admin/moderation`.

## 파이프라인

1. **게시** — 커뮤니티·모임·댓글 UGC 생성  
2. **자동 필터** — 금칙어·패턴·신고 누적  
3. **위험 신호** — 허위·사기·명예훼손 키워드  
4. **임시 블라인드** — 검토 전 피드 제외  
5. **운영 큐** — `/admin/moderation` 에서 open/pending 처리  
6. **승인 / 수정 요청 / 반려·제재** — `app_users.is_banned` 로 계정 제재

신고 상태 매핑: `reportStatusToStage()` (`open|pending` → 검토 큐, `reviewed|sent` → 승인, `dismissed` → 반려).

## SLA (초안 — 오너 확정 전)

| 단계 | 목표 |
|------|------|
| open 신고 1차 확인 | 영업일 1일 이내 |
| 블라인드 해제/확정 | 영업일 2일 이내 |
| 계정 제재 에스컬레이션 | 법적·안전 이슈는 즉시 |

수치는 오너 확인 후 공개 약관/헬프에 반영.

## 운영 체크

- [ ] `/admin/moderation` 일일 오픈 건수 확인 (`/admin/ops` 신고 대기 카드)
- [ ] 반복 신고 동일 작성자 → `is_banned` 검토
- [ ] 장애 시 [`incident-template.md`](./incident-template.md) 사용
