/**
 * node:test 용 모듈 해석 훅 (테스트 전용, 앱 빌드와 무관).
 *
 * 왜: 유닛 테스트는 소스를 그대로(타입 스트리핑) 불러오는데, 소스는 두 가지를
 * 쓴다 — (1) tsconfig 의 `@/` 별칭, (2) 확장자 없는 상대 import. Node ESM 은 둘
 * 다 기본으로 못 푼다. 이 훅이 그 둘을 실제 파일 경로로 바꿔 준다:
 *   @/x         → <프로젝트루트>/x(.ts|.tsx|/index.ts)
 *   ./x, ../x   → 확장자(.ts|.tsx) 보충
 *
 * 로직을 복제하지 않고 앱 소스를 그대로 테스트하기 위한 최소 장치다.
 * 사용: node --import ./tests/unit/register.mjs --test "tests/unit/*.test.ts"
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolve-hook.mjs", pathToFileURL("./tests/unit/"));
