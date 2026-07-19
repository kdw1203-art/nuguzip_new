import { PageShell } from "../../components/PageShell";
import { CreatorClient } from "./creator-client";

/* 시안 22e — 크리에이터 대시보드 · 성장 보상 + 23c "탑 임장러 현황" 탭 */

export default function CreatorDashboardPage() {
  return (
    <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
      <CreatorClient />
    </PageShell>
  );
}
