#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "command failed").trim());
  }
  return (result.stdout || "").trim();
}

function parseRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    if (line.toLowerCase().includes("local | remote")) continue;
    if (/^-{3,}/.test(line.replace(/\s/g, ""))) continue;
    const parts = line.split("|").map((x) => x.trim());
    if (parts.length < 3) continue;
    const [local, remote, time] = parts;
    if (!local && !remote) continue;
    rows.push({ local, remote, time });
  }
  return rows;
}

try {
  const output = run("npx", ["supabase@latest", "migration", "list", "--linked"]);
  const rows = parseRows(output);
  if (rows.length === 0) {
    console.error("[migration-drift] no migration rows were parsed.");
    process.exit(1);
  }

  const drift = rows.filter((r) => r.local && !r.remote);
  const remoteOnly = rows.filter((r) => !r.local && r.remote);
  if (drift.length === 0 && remoteOnly.length === 0) {
    console.log("[migration-drift] ok: local and remote history are aligned.");
    process.exit(0);
  }

  if (drift.length > 0) {
    console.error("[migration-drift] local-only migrations detected:");
    for (const row of drift) {
      console.error(` - ${row.local}`);
    }
  }
  if (remoteOnly.length > 0) {
    console.error("[migration-drift] remote-only migrations detected:");
    for (const row of remoteOnly) {
      console.error(` - ${row.remote}`);
    }
  }
  process.exit(1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[migration-drift] failed:", message);
  process.exit(1);
}
