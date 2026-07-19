import { promises as fs } from "fs";
import path from "path";
import type { GroupMeetup } from "@/lib/types/group";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "groups.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalize(g: unknown): GroupMeetup {
  const x = g as Partial<GroupMeetup>;
  return {
    id: String(x.id ?? ""),
    title: String(x.title ?? ""),
    description: String(x.description ?? ""),
    city: String(x.city ?? "서울특별시"),
    district: String(x.district ?? ""),
    hostLabel: String(x.hostLabel ?? "주최자"),
    meetType: String(x.meetType ?? "스터디"),
    maxMembers: Number(x.maxMembers ?? 30),
    memberCount: Number(x.memberCount ?? 1),
    nextAt: x.nextAt ? String(x.nextAt) : null,
    tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
    createdAt: String(x.createdAt ?? new Date().toISOString()),
  };
}

export async function readGroupsFile(): Promise<GroupMeetup[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const j: unknown = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.map(normalize);
  } catch {
    return [];
  }
}

async function writeAll(groups: GroupMeetup[]) {
  await ensureDataDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(groups, null, 2), "utf-8");
}

export async function prependGroupFile(g: GroupMeetup): Promise<void> {
  const all = await readGroupsFile();
  all.unshift(g);
  await writeAll(all);
}

export async function getGroupFile(id: string): Promise<GroupMeetup | null> {
  const all = await readGroupsFile();
  return all.find((x) => x.id === id) ?? null;
}
