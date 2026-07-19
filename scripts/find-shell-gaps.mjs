/**
 * Lists app/page.tsx files for mobile-route-shell rollout checks.
 * Run from package root: `node scripts/find-shell-gaps.mjs`
 *
 * - "delegates" = WriteChrome / FigmaStub etc. (padding lives in shared components)
 * - "no shell" = neither MobileRouteShell nor known delegates — candidates for shell or review
 * - skipped: redirect-only pages (no JSX return), root app/page.tsx with NativeLanding
 */
import fs from "node:fs";
import path from "node:path";

const appDir = path.join(process.cwd(), "app");

/** `redirect` / `permanentRedirect` only — no JSX return (화면 없음). */
function isRedirectOnlySource(t) {
  if (!/\bredirect\s*\(/.test(t) && !/\bpermanentRedirect\s*\(/.test(t)) return false;
  if (/return\s*\(?\s*</.test(t)) return false;
  return true;
}

function isRootNativeLandingHome(rel, t) {
  return rel.replace(/\\/g, "/") === "page.tsx" && /\bNativeLanding\b/.test(t);
}

function walk(d, files = []) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name === "page.tsx") files.push(p);
  }
  return files.sort();
}

const pages = walk(appDir);
const gaps = [];
const noShell = [];
const delegates = [];
const skippedShell = [];

for (const file of pages) {
  const rel = path.relative(path.join(process.cwd(), "app"), file);
  const relPosix = rel.replace(/\\/g, "/");
  const t = fs.readFileSync(file, "utf8");
  const inAdmin = rel.startsWith(`admin${path.sep}`);
  const hasShell =
    t.includes("mobile-route-shell") || t.includes("MobileRouteShell");

  const delegatesLayout =
    /\bWriteChrome\b/.test(t) ||
    /\bFigmaStub\b/.test(t);

  const skipReason = !hasShell && !inAdmin
    ? isRedirectOnlySource(t)
      ? "redirect-only"
      : isRootNativeLandingHome(rel, t)
        ? "root-native-landing"
        : null
    : null;
  if (skipReason) skippedShell.push(`${relPosix} (${skipReason})`);

  if (!inAdmin && !hasShell && delegatesLayout) {
    delegates.push(relPosix);
  } else if (!inAdmin && !hasShell && !delegatesLayout && !skipReason) {
    noShell.push(relPosix);
  }

  const manualOuterShell =
    !hasShell &&
    !inAdmin &&
    (/<(?:main|div)[^>]*className="[^"]*\bmx-auto[^"]*px-/.test(t) ||
      /<main[^>]*className="[^"]*\bpx-[34]/.test(t));

  if (manualOuterShell) {
    gaps.push(relPosix);
  }
}

console.log("=== Layout delegated (WriteChrome / FigmaStub, no page-level shell) ===");
for (const g of delegates) console.log(g);
console.error("delegated count:", delegates.length);

console.log("\n=== Skipped (redirect-only / root NativeLanding — no page shell expected) ===");
for (const g of skippedShell) console.log(g);
console.error("skipped count:", skippedShell.length);

console.log("\n=== Non-admin page.tsx without MobileRouteShell (review / stub routes) ===");
for (const g of noShell) console.log(g);
console.error("no-shell count:", noShell.length);

console.log("\n=== Likely gaps (manual mx-auto + px on outer, no shell) ===");
for (const g of gaps) console.log(g);
console.error("gap count:", gaps.length);

const paddedNoShell = [];
for (const file of pages) {
  const rel = path.relative(path.join(process.cwd(), "app"), file);
  const t = fs.readFileSync(file, "utf8");
  const inAdmin = rel.startsWith(`admin${path.sep}`);
  const hasShell =
    t.includes("mobile-route-shell") || t.includes("MobileRouteShell");
  if (inAdmin || hasShell) continue;
  if (
    /\bmx-auto\b/.test(t) &&
    /\b(p|px|py|pt|pb)-/.test(t) &&
    (/\bmax-w-/.test(t) || /\bflex-1\b/.test(t))
  ) {
    paddedNoShell.push(rel.replace(/\\/g, "/"));
  }
}

console.log("\n=== No shell but has mx-auto + padding + max-w or flex-1 ===");
for (const g of paddedNoShell) console.log(g);
console.error("padded-no-shell count:", paddedNoShell.length);
