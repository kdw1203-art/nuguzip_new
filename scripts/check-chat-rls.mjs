#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function run(args) {
  const res = spawnSync("npx", ["supabase@latest", ...args], {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || "command failed").trim());
  }
  return res.stdout || "";
}

const query = `
with required_tables as (
  select unnest(array[
    'chat_rooms',
    'chat_room_members',
    'chat_messages',
    'chat_attachments',
    'chat_reports',
    'chat_blocks',
    'chat_presence'
  ]) as table_name
),
required_policies as (
  select unnest(array[
    'chat_rooms_member_read',
    'chat_rooms_owner_manage',
    'chat_rooms_create',
    'chat_room_members_self_read',
    'chat_room_members_self_insert',
    'chat_room_members_self_update',
    'chat_messages_member_read',
    'chat_messages_member_insert',
    'chat_messages_sender_delete',
    'chat_attachments_member_read',
    'chat_attachments_member_insert',
    'chat_reports_self_create',
    'chat_reports_self_read',
    'chat_blocks_self_manage',
    'chat_presence_self_manage',
    'chat_reports_admin_read',
    'chat_reports_admin_update'
  ]) as policy_name
)
select
  (select count(*) from required_tables rt where to_regclass('public.' || rt.table_name) is not null) as table_ok_count,
  (select count(*) from required_tables) as table_expected_count,
  (select count(*) from pg_policies p join required_policies rp on rp.policy_name = p.policyname where p.schemaname='public') as policy_ok_count,
  (select count(*) from required_policies) as policy_expected_count;
`;

try {
  const sqlPath = join(tmpdir(), `chat-rls-check-${Date.now()}.sql`);
  writeFileSync(sqlPath, query.trim(), "utf8");
  const output = run(["db", "query", "--linked", "--output", "json", "--file", sqlPath]);
  unlinkSync(sqlPath);
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("json payload not found");
  const payload = JSON.parse(output.slice(start, end + 1));
  const row = payload.rows?.[0];
  if (!row) throw new Error("empty result");

  const tableOk = Number(row.table_ok_count ?? 0);
  const tableExpected = Number(row.table_expected_count ?? 0);
  const policyOk = Number(row.policy_ok_count ?? 0);
  const policyExpected = Number(row.policy_expected_count ?? 0);

  if (tableOk !== tableExpected || policyOk !== policyExpected) {
    console.error(
      `[chat-rls] mismatch: tables ${tableOk}/${tableExpected}, policies ${policyOk}/${policyExpected}`,
    );
    process.exit(1);
  }
  console.log(
    `[chat-rls] ok: tables ${tableOk}/${tableExpected}, policies ${policyOk}/${policyExpected}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[chat-rls] failed:", message);
  process.exit(1);
}
