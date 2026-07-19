import type { PlanTier } from "@/components/ui-kit";

export type PdfBranding = {
  tier: PlanTier;
  authorLabel?: string;
  showProBadge: boolean;
  footerLine: string;
};

export function pdfBrandingForPlan(plan: string | null | undefined, authorLabel?: string): PdfBranding {
  const tier = (
    plan === "enterprise"
      ? "enterprise"
      : plan === "expert"
        ? "expert"
        : plan === "pro"
          ? "pro"
          : "basic"
  ) as PlanTier;
  if (tier === "enterprise") {
    return {
      tier,
      authorLabel,
      showProBadge: true,
      footerLine: authorLabel
        ? `${authorLabel} · Nuguzip EXPERT · B2B 리포트`
        : "Nuguzip EXPERT · 팀·법인 브랜드 리포트",
    };
  }
  if (tier === "expert") {
    return {
      tier,
      authorLabel,
      showProBadge: true,
      footerLine: authorLabel
        ? `${authorLabel} · Nuguzip PRO 리포트 · AI 추정 포함`
        : "Nuguzip PRO · 전문가 브랜드 임장 리포트",
    };
  }
  if (tier === "pro") {
    return {
      tier,
      authorLabel,
      showProBadge: true,
      footerLine: "Nuguzip PLUS · PRO 임장 리포트",
    };
  }
  return {
    tier,
    authorLabel,
    showProBadge: false,
    footerLine: "Nuguzip · 참고용 임장 리포트",
  };
}
