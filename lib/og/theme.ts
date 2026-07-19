/**
 * OG ImageResponse 용 공용 테마.
 * Tailwind 클래스(`from-*` `to-*`) 를 CSS gradient 색 쌍으로 변환합니다.
 */

const PAIRS: Record<string, [string, string]> = {
  "from-blue-500 to-indigo-600": ["#3b82f6", "#4f46e5"],
  "from-emerald-500 to-teal-600": ["#10b981", "#0d9488"],
  "from-purple-500 to-pink-600": ["#a855f7", "#db2777"],
  "from-amber-500 to-orange-600": ["#f59e0b", "#ea580c"],
  "from-rose-500 to-red-600": ["#f43f5e", "#dc2626"],
  "from-cyan-500 to-blue-600": ["#06b6d4", "#2563eb"],
};

export function gradientToCss(klass?: string): string {
  const pair = (klass && PAIRS[klass]) || ["#3182f6", "#1d4ed8"];
  return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;
