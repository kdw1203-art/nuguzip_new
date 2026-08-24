/* [OPT-30] 임포트 위생 검사 — optimizePackageImports 를 무력화하는 패턴 차단.
   ① `import * as X from "lucide-react"` — 배럴 전체가 번들에 들어간다.
   ② 한 파일에서 lucide 아이콘 40개 초과 — 컴포넌트 분리 신호. */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync('grep -rl "lucide-react" app components lib --include=*.tsx --include=*.ts || true', {
  encoding: "utf8",
}).split("\n").filter(Boolean);

let bad = [];
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
