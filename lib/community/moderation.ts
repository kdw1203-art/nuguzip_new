const DEFAULT_BANNED_WORDS = [
  "욕설",
  "혐오",
  "불법",
  "도박",
  "마약",
  "성매매",
];

function bannedWords(): string[] {
  const env = process.env.COMMUNITY_BANNED_WORDS?.trim();
  if (!env) return DEFAULT_BANNED_WORDS;
  return env
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

export function findBlockedWord(text: string): string | null {
  const low = text.toLowerCase();
  for (const w of bannedWords()) {
    if (low.includes(w)) return w;
  }
  return null;
}

