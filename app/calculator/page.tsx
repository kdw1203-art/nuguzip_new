import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import { CalculatorClient } from "./calculator-client";

/* P2-4: 금리 실연동 — /api/finance/mortgage-rates 가 쓰는 lib 함수를 서버에서 직접
   호출해 클라이언트 계산기에 주입. 실데이터 실패 시 폴백 표 + "예시" 배지. */

export const revalidate = 21600; // 6h — 공시 금리 캐시 주기와 동일

export default async function CalculatorPage() {
  const mortgage = await getMortgageRates();
  return <CalculatorClient mortgage={mortgage} />;
}
