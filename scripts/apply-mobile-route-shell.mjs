/**
 * One-shot codemod: replace <main className="mx-auto … px-…"> with MobileRouteShell.
 * Run: node scripts/apply-mobile-route-shell.mjs
 */
import fs from "node:fs";
import path from "node:path";

const appDir = path.join(process.cwd(), "app");

/** Longer patterns first (no substring collisions among these). */
const OPEN_REPLACEMENTS = [
  [
    '<main className="mx-auto flex h-[calc(100dvh-10rem)] max-w-5xl gap-4 px-4 py-4 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl" className="flex h-[calc(100dvh-10rem)] gap-4">',
  ],
  [
    '<main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">',
    '<MobileRouteShell as="main" maxClassName="max-w-xl" className="flex min-h-[60vh] flex-col items-center justify-center text-center">',
  ],
  [
    '<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-md" className="flex w-full flex-1 flex-col justify-center">',
  ],
  [
    '<main className="mx-auto flex max-w-lg flex-1 flex-col items-center px-4 py-16 text-center">',
    '<MobileRouteShell as="main" maxClassName="max-w-lg" className="flex flex-1 flex-col items-center text-center">',
  ],
  [
    '<main className="mx-auto min-h-[80vh] w-full max-w-6xl bg-slate-50/70 px-3 py-5 sm:px-6 sm:py-8">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl" className="min-h-[80vh] w-full bg-slate-50/70">',
  ],
  [
    '<main className="mx-auto max-w-6xl flex-1 px-3 py-6 sm:px-6 sm:py-10">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">',
    '<MobileRouteShell as="main" maxClassName="max-w-3xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-6xl flex-1 bg-slate-50/60 px-4 py-8 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl" className="flex-1 bg-slate-50/60">',
  ],
  [
    '<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl">',
  ],
  [
    '<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-3xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-2xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-2xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-xl" className="flex-1 text-center">',
  ],
  [
    '<main className="mx-auto max-w-2xl flex-1 px-4 py-16 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-2xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto max-w-md flex-1 px-4 py-16 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-md" className="flex-1">',
  ],
  [
    '<main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl">',
  ],
  [
    '<main className="mx-auto max-w-5xl px-4 py-8">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl">',
  ],
  [
    '<main className="mx-auto max-w-6xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl">',
  ],
  [
    '<main className="mx-auto max-w-6xl px-4 py-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-6xl">',
  ],
  [
    '<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-5xl">',
  ],
  [
    '<main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl">',
  ],
  [
    '<main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl">',
  ],
  [
    '<main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-4xl">',
  ],
  [
    '<main className="mx-auto max-w-3xl flex-1 px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-3xl" className="flex-1">',
  ],
  [
    '<main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-3xl">',
  ],
  [
    '<main className="mx-auto max-w-xl px-4 py-6 sm:px-6">',
    '<MobileRouteShell as="main" maxClassName="max-w-xl">',
  ],
  [
    '<main className="mx-auto max-w-lg space-y-4 p-8">',
    '<MobileRouteShell as="main" maxClassName="max-w-lg" className="space-y-4">',
  ],
  [
    '<main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">',
    '<main className="space-y-6">',
  ],
];

const IMPORT_LINE = `import { MobileRouteShell } from "@/components/layout/mobile-route-shell";\n`;

function ensureImport(src) {
  if (src.includes("mobile-route-shell")) return src;
  if (src.startsWith('"use client"')) {
    const nl = src.indexOf("\n");
    return src.slice(0, nl + 1) + IMPORT_LINE + src.slice(nl + 1);
  }
  return IMPORT_LINE + src;
}

function transformContent(src) {
  let out = src;
  let changed = false;
  for (const [from, to] of OPEN_REPLACEMENTS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      changed = true;
    }
  }
  if (!changed) return { out: src, changed: false };

  if (out.includes("<MobileRouteShell")) {
    out = ensureImport(out);
    /** No leftover `<main` → every `</main>` belonged to a converted shell. */
    if (!/<main\b/.test(out)) {
      out = out.replace(/<\/main>/g, "</MobileRouteShell>");
    }
  }
  return { out, changed: true };
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".tsx")) files.push(p);
  }
  return files;
}

let n = 0;
for (const file of walk(appDir)) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("MobileRouteShell") && !src.includes('<main className="mx-auto')) {
    continue;
  }
  const { out, changed } = transformContent(src);
  if (changed && out !== src) {
    fs.writeFileSync(file, out);
    n++;
    console.log("updated", rel);
  }
}
console.error("files modified:", n);
