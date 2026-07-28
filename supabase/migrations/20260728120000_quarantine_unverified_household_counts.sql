/*
 * 상세 조회가 실패한 단지의 "세대수"를 집계에서 뺀다 (2026-07-28). [적용 완료]
 *
 * ── 무엇이 잘못됐나 ─────────────────────────────────────────────────────────
 * 국토부 단지 상세(K-apt) 백필은 결과를 metadata 에 적으면서 성공 여부를
 * detailStatus 로 함께 남긴다. 그런데 householdCount 는 **실패한 경우에도**
 * 값이 채워져 들어왔다. 그 값은 세대수가 아니다.
 *
 * 실측(19,884행):
 *   detailStatus='ok'    19,315행 · 중앙값   437 · 최댓값 12,330 · 6,000 초과   6건
 *   detailStatus='miss'     569행 · 중앙값 4,840 · 최댓값 41,680 · 6,000 초과 203건
 *
 * miss 쪽 예: "신방동 초원그린타운아파트 41,680세대"(동 16개 → 동당 2,605세대),
 * "엑스포아파트 39,580세대"(동 51개). 있을 수 없는 값이다. 국내 최대 단지가
 * 올림픽파크포레온 12,032세대다 — ok 쪽 최댓값이 정확히 그 값이라, ok 는
 * 믿을 수 있고 miss 는 다른 숫자가 섞여 들어왔다고 보는 게 맞다.
 *
 * 이 값들은 complex_tx_stats.households 로 흘러가 지도 단지 패널·단지 홈에
 * 표시되고, 지도 상세 필터의 "세대수 규모" 슬라이더 판정에도 쓰인다.
 * 즉 화면에 틀린 숫자가 나가고, 그 숫자로 필터까지 걸리고 있었다.
 *
 * ── 왜 지우지 않고 옮기는가 ────────────────────────────────────────────────
 * 원본을 지우면 나중에 "이 값이 대체 무엇이었나"를 되짚을 수 없다. 집계가 읽는
 * 키(householdCount)에서만 빼고 householdCountUnverified 로 보존한다.
 * detailFetchedAt 은 그대로 둔다 — miss 는 API 에 상세가 없다는 뜻이라 다시
 * 불러도 대개 또 없다. 매 실행마다 같은 569건을 다시 두드리게 만들지 않는다.
 *
 * ── 효과 (다음 refresh_market_aggregates() 이후) ───────────────────────────
 *   세대수를 아는 단지 4,019 → 6,481개
 *   표시되는 최댓값 31,440 → 12,032 (실제 최대 단지와 일치)
 *
 * 근본 해결은 백필 쪽에서 miss 일 때 householdCount 를 아예 쓰지 않는 것이다.
 * 이 마이그레이션은 이미 들어온 값을 정리할 뿐이다.
 */
update apartment_complexes
set metadata = (metadata - 'householdCount')
             || jsonb_build_object('householdCountUnverified', metadata->'householdCount')
where source_key = 'k-apt-basic'
  and metadata->>'detailStatus' = 'miss'
  and (metadata ? 'householdCount');
