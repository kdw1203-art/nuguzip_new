export type AppPlan = "free" | "pro" | "expert" | "enterprise";

export function normalizePlan(v: string | undefined | null): AppPlan {
  const s = String(v ?? "").toLowerCase();
  if (s === "pro" || s === "expert" || s === "enterprise") return s;
  return "free";
}
