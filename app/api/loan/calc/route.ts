/**
 * POST /api/loan/calc
 * 대출 상환액 계산 API
 *
 * Body: { price, down?, ltv?, annualRate?, years?, method? }
 * Response: { loanAmount, allowedLoan, approved, monthlyPayment, totalInterest, schedule? }
 *
 * 서버사이드 계산 — 파트너 앱·외부 연동용. 내부 UI는 client-side ComplexLoanWidget 사용.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "edge";

function calcEqualTotal(p: number, r: number, n: number) {
  if (r === 0) return { monthly: p / n, totalInterest: 0 };
  const monthly = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return { monthly: Math.round(monthly), totalInterest: Math.round(monthly * n - p) };
}

function calcEqualPrincipal(p: number, r: number, n: number) {
  const pPerMonth = p / n;
  const firstInterest = p * r;
  const totalInterest = Math.round((r * p * (n + 1)) / 2);
  return {
    monthly: Math.round(pPerMonth + firstInterest),
    lastMonthly: Math.round(pPerMonth + pPerMonth * r),
    totalInterest,
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const price     = Number(body.price) || 0;
  const down      = Number(body.down ?? 0);
  const ltv       = Number(body.ltv ?? 70);
  const annualRate = Number(body.annualRate ?? 4.5);
  const years     = Number(body.years ?? 30);
  const method    = String(body.method ?? "annuity"); // annuity | equal-principal

  if (!price || price <= 0) {
    return NextResponse.json({ error: "price required" }, { status: 400 });
  }

  const loanAmount   = Math.max(0, price - down);
  const allowedLoan  = Math.floor(price * (ltv / 100));
  const approved     = loanAmount <= allowedLoan;
  const monthlyRate  = annualRate / 100 / 12;
  const months       = years * 12;

  let monthlyPayment: number;
  let totalInterest: number;

  if (method === "equal-principal") {
    const res = calcEqualPrincipal(loanAmount, monthlyRate, months);
    monthlyPayment = res.monthly;
    totalInterest  = res.totalInterest;
  } else {
    const res = calcEqualTotal(loanAmount, monthlyRate, months);
    monthlyPayment = res.monthly;
    totalInterest  = res.totalInterest;
  }

  // 보유세 간이 추정 (1주택 기준)
  const officialPrice = price * 0.6;
  const propertyTax   = Math.round(Math.min(officialPrice * 0.0025, officialPrice * 0.004));
  const compTax       = officialPrice > 1_100_000_000
    ? Math.round((officialPrice - 1_100_000_000) * 0.006)
    : 0;

  return NextResponse.json(
    {
      loanAmount,
      allowedLoan,
      approved,
      ltvUsed: Math.round((loanAmount / price) * 100),
      monthlyPayment,
      totalInterest,
      totalRepayment: loanAmount + totalInterest,
      tax: { propertyTax, compTax, note: "공시가 = 매매가×60% 가정, 1주택 간이 추정" },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
