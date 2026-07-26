/**
 * PostgREST/Postgres 오류를 **사실 단위로** 가르는 분류기.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * 화면 여러 곳이 오류 메시지에 `"schema cache"` 라는 문자열이 들어 있는지로
 * "테이블이 없다"를 판정하고 있었다. 그런데 프로덕션에서 압도적으로 많이 나오는
 * 오류가 하필 이것이다:
 *
 *   PGRST002 — Could not query the database for the schema cache. Retrying.
 *
 * 이건 테이블이 없다는 뜻이 **아니다**. PostgREST 가 DB 가 밀려서 스키마 캐시를
 * 못 읽은 것뿐이고, 메시지에 적힌 "Retrying." 그대로 잠시 뒤면 같은 요청이
 * 성공한다. 그런데 문자열만 보고 판정하면 이 일시적인 장애가
 *
 *   - 웹 바이탈 수집에서는 `reason: "table_missing"` (= "그 테이블 원래 없어요"),
 *   - 회원가입에서는 "스키마 편차구나" 하고 **다른 인증 백엔드로 우회**
 *
 * 로 둔갑한다. 특히 두 번째는 위험하다 — DB 가 몇 초 밀린 사이에 가입한 사람만
 * app_users 가 아닌 Supabase Auth 쪽에 만들어져, 계정 저장소가 갈라진다.
 *
 * 일시적인 것과 구조적인 것은 다른 사실이고, 다른 대응이 필요하다:
 *   - 일시적(PGRST002) → 재시도하거나, 못 준다고 답한다(503).
 *   - 구조적(테이블/컬럼 없음) → 우회 경로나 마이그레이션이 답이다.
 *
 * ── 코드 목록 ───────────────────────────────────────────────────────────────
 * PostgREST 는 자체 오류에 `PGRST***` 코드를, DB 가 돌려준 오류에는 Postgres
 * SQLSTATE 를 그대로 싣는다. 그래서 둘 다 본다.
 */

/** 인자로 받는 최소 형태 — supabase-js 의 PostgrestError 와 호환된다. */
export type PgErrorLike = { code?: string | null; message?: string | null };

/**
 * 일시적: PostgREST 가 스키마 캐시를 못 읽었다. DB 가 밀리는 중이라는 뜻이고,
 * 잠시 뒤 같은 요청은 성공한다. 절대 "없음"으로 바꾸면 안 되는 상태.
 */
export function isTransientSchemaCacheError(err: PgErrorLike | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST002") return true;
  /* 코드가 안 실린 경로(게이트웨이가 본문만 흘리는 경우 등)를 위한 보조 판정.
     PGRST205("Could not find the table ...")와 섞이지 않도록 문구를 좁게 잡는다. */
  return /could not query the database for the schema cache/i.test(err.message ?? "");
}

/**
 * 구조적: 그 테이블이 정말 없다.
 *   - 42P01  Postgres undefined_table
 *   - PGRST205  Could not find the table '...' in the schema cache
 *   - PGRST106  스키마가 노출 목록(search path)에 없다
 */
export function isMissingTableError(err: PgErrorLike | null | undefined): boolean {
  if (!err) return false;
  if (isTransientSchemaCacheError(err)) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST106") return true;
  return /could not find the table|relation .* does not exist/i.test(err.message ?? "");
}

/**
 * 구조적: 그 컬럼이 없다(마이그레이션이 덜 반영된 DB).
 *   - 42703  Postgres undefined_column
 *   - PGRST204  Could not find the '...' column of '...' in the schema cache
 */
export function isMissingColumnError(err: PgErrorLike | null | undefined): boolean {
  if (!err) return false;
  if (isTransientSchemaCacheError(err)) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const m = err.message ?? "";
  return /could not find the .* column|column .* does not exist/i.test(m);
}
