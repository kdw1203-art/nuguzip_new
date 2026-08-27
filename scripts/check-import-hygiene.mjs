/* [OPT-30] 임포트 위생 검사 — optimizePackageImports 를 무력화하는 패턴 차단.
   ① `import * as X from "lucide-react"` — 배럴 전체가 번들에 들어간다.
   ② 한 파일에서 lucide 아이콘 40개 초과 — 컴포넌트 분리 신호.

   [2026-08-27] 윈도우에서 못 돌던 것 수리.
   예전에는 파일 찾기를 셸에 맡겼다:
       execSync('grep -rl "lucide-react" app components lib --include=*.tsx ...')
   grep 은 윈도우에 없다. 그래서 이 게이트는 리눅스(CI·Vercel)에서만 돌고
   개발자 PC(윈도우)에서는 `'grep'은(는) 내부 또는 외부 명령이 아닙니다`로
   빌드를 통째로 멈춰 세웠다 — 검사가 아니라 크래시였다.
   외부 명령 없이 node 만으로 같은 일을 한다(결과 동일, 플랫폼 무관). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "coverage"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // 없는 디렉터리는 조용히 건너뛴다(grep 의 `|| true` 와 같은 태도)
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r))).filter((f) =>
  readFileSync(f, "utf8").includes("lucide-react"),
);

const bad = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  if (/import\s*\*\s*as\s+\w+\s+from\s+["']lucide-react["']/.test(s)) {
    bad.push(`${f}: import * as ... from "lucide-react" (배럴 전체 임포트 금지)`);
  }
  const m = s.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/s);
  if (m) {
    const count = m[1].split(",").map((x) => x.trim()).filter(Boolean).length;
    if (count > 40) bad.push(`${f}: lucide 아이콘 ${count}개 — 컴포넌트 분리 검토`);
  }
}
if (bad.length) {
  console.error("✗ 임포트 위생 위반:\n" + bad.map((b) => "  " + b).join("\n"));
  process.exit(1);
}
console.log(`✓ 임포트 위생 통과 — lucide 사용 파일 ${files.length}개 점검`);
