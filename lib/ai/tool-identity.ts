/**
 * AI 분석 도구 12종의 시그니처(색·아이콘·메트릭·use case·라이브 위젯) 단일 진실 소스.
 * Hero·LivePreviewPanel·ResultSignatureCard·Digest 등 모든 UI가 여기서 색·라벨을 가져온다.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Compass,
  FileSearch,
  GitCompare,
  LineChart,
  PieChart,
  TrendingUp,
} from "lucide-react";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type SignatureWidgetKind =
  | "radar"
  | "lineChart"
  | "routeMap"
  | "signalGauge"
  | "boxPlot"
  | "compareGrid"
  | "rateCounter"
  | "gapMeter"
  | "indicatorChips"
  | "checklistProgress"
  | "assetDonut"
  | "clauseCounter";

export type ToolIdentity = {
  id: AiAnalysisToolId;
  title: string;
  tagline: string;
  /** Tailwind 가능한 brand 색상 (hex). */
  accentColor: string;
  /** "from-... to-..." Tailwind 그라데이션 토큰. */
  accentGradient: string;
  /** 우측 페이드 / 결과 카드 액센트 보조 색. */
  accentSoftBg: string;
  /** Lucide 아이콘. */
  icon: LucideIcon;
  /** 결과 핵심 메트릭 라벨 (예: "투자 점수"). */
  metricLabel: string;
  /** 결과 메트릭 단위 (예: "점", "원"). */
  metricUnit: string;
  /** 도구 한 줄 use case. */
  useCase: string;
  /** 우측 라이브 패널의 시그니처 위젯 종류. */
  signatureWidget: SignatureWidgetKind;
  /** 사용 팁(2~3줄). */
  tips: string[];
};

const FALLBACK: ToolIdentity = {
  id: "ai-diagnosis",
  title: "AI 분석",
  tagline: "조건을 입력하면 AI가 정리해 드립니다",
  accentColor: "#3182f6",
  accentGradient: "from-[#3182f6] to-[#1b64da]",
  accentSoftBg: "bg-[#eef4ff]",
  icon: BarChart3,
  metricLabel: "결과",
  metricUnit: "",
  useCase: "관심 지역·단지에 대한 AI 분석",
  signatureWidget: "radar",
  tips: ["조건을 정확히 입력할수록 정확도가 높아져요."],
};

export const TOOL_IDENTITIES: Record<AiAnalysisToolId, ToolIdentity> = {
  "ai-diagnosis": {
    id: "ai-diagnosis",
    title: "AI 투자 진단",
    tagline: "주소·단지 조건으로 종합 스코어와 코멘트",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: BarChart3,
    metricLabel: "투자 점수",
    metricUnit: "점",
    useCase: "단지·지역의 종합 매수 매력도와 약점 정리",
    signatureWidget: "radar",
    tips: [
      "구·동까지 정확히 입력하면 인근 비교가 자동으로 붙어요.",
      "면적·시세를 함께 적으면 점수 분산이 줄어듭니다.",
    ],
  },
  "ai-prediction": {
    id: "ai-prediction",
    title: "시세 예측 AI",
    tagline: "1~5년 매매·전세·월세 시나리오",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: LineChart,
    metricLabel: "예측 가격",
    metricUnit: "만원",
    useCase: "단지의 향후 1~5년 매매·전세 가격 시나리오 비교",
    signatureWidget: "lineChart",
    tips: [
      "단지가 명확할수록 시나리오 분산이 줄어듭니다.",
      "베이스·낙관·비관 3개 시나리오로 보여 드려요.",
    ],
  },
  "ai-risk": {
    id: "ai-risk",
    title: "리스크 분석",
    tagline: "권리·역세권·공급·환경 리스크 진단",
    accentColor: "#f04452",
    accentGradient: "from-[#f04452] to-[#f87171]",
    accentSoftBg: "bg-[#fef2f2]",
    icon: AlertTriangle,
    metricLabel: "리스크 등급",
    metricUnit: "",
    useCase: "단지 보유·매수 전 잠재 리스크 점검",
    signatureWidget: "boxPlot",
    tips: [
      "보유 의향이면 단지+동까지 정확히 적어주세요.",
      "환경·교통·권리 4축으로 분포가 나옵니다.",
    ],
  },
  "ai-compare": {
    id: "ai-compare",
    title: "AI 비교 분석",
    tagline: "단지 2~3개를 한 화면에서 비교",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: GitCompare,
    metricLabel: "비교 등수",
    metricUnit: "",
    useCase: "임장 후보 단지의 가성비·교통·학군을 한 표로 정리",
    signatureWidget: "compareGrid",
    tips: [
      "단지 2~3개를 입력하면 표가 가장 잘 그려져요.",
      "동일 면적 기준으로 정규화해서 비교합니다.",
    ],
  },
  "ai-inspection": {
    id: "ai-inspection",
    title: "맞춤 임장 추천",
    tagline: "성향·조건 기반 임장 동선 추천",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Compass,
    metricLabel: "추천 단지",
    metricUnit: "곳",
    useCase: "내 우선순위에 맞는 임장 동선 자동 설계",
    signatureWidget: "routeMap",
    tips: [
      "예산·평형·우선순위를 입력하면 동선 카드가 자동 생성돼요.",
      "임장노트로 바로 이어 보낼 수 있습니다.",
    ],
  },
  "my-checklist": {
    id: "my-checklist",
    title: "투자 체크리스트",
    tagline: "내 기준으로 매수 전 체크포인트 점검",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: ClipboardCheck,
    metricLabel: "완료 항목",
    metricUnit: "개",
    useCase: "임장·매수 전 자기 점검을 시각화",
    signatureWidget: "checklistProgress",
    tips: [
      "체크 항목을 다 채울수록 점수가 채워집니다.",
      "임장노트와 자동 연동돼요.",
    ],
  },
  "ai-portfolio": {
    id: "ai-portfolio",
    title: "포트폴리오 분석",
    tagline: "현재 자산 분포·리밸런싱 제안",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: PieChart,
    metricLabel: "다각화 점수",
    metricUnit: "점",
    useCase: "보유 자산의 비중·집중도·리밸런싱 제안",
    signatureWidget: "assetDonut",
    tips: [
      "보유 자산을 입력할수록 도넛 차트가 완성됩니다.",
      "현금 비중 가이드도 함께 제시돼요.",
    ],
  },
  "ai-timing": {
    id: "ai-timing",
    title: "AI 매수 타이밍",
    tagline: "구별 시그널·거래량 추세",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Clock,
    metricLabel: "매수 시그널",
    metricUnit: "",
    useCase: "거래량·심리 변화로 매수 타이밍 진단",
    signatureWidget: "signalGauge",
    tips: [
      "구·동 단위로 빠르게 신호를 봅니다.",
      "관망 개월수를 함께 입력하면 알림 추천이 좋아져요.",
    ],
  },
  "ai-simulator": {
    id: "ai-simulator",
    title: "수익률 시뮬레이터",
    tagline: "매수가·대출·임대료로 수익률 시뮬",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: TrendingUp,
    metricLabel: "연 수익률",
    metricUnit: "%",
    useCase: "매수·대출·임대 시나리오의 IRR·세후 수익률 계산",
    signatureWidget: "rateCounter",
    tips: [
      "대출비율·금리를 정확히 입력하면 정확도가 올라가요.",
      "세후·세전 수익률을 함께 보여 드려요.",
    ],
  },
  "ai-gap": {
    id: "ai-gap",
    title: "갭투자 분석기",
    tagline: "전세가율·갭·회전 가능성 진단",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Activity,
    metricLabel: "갭 비율",
    metricUnit: "%",
    useCase: "단지의 매매·전세 갭과 회전 리스크 진단",
    signatureWidget: "gapMeter",
    tips: [
      "단지·평형이 정확할수록 갭 추정이 정확해져요.",
      "전세가율·갭 추세를 함께 보여 드립니다.",
    ],
  },
  "ai-economy": {
    id: "ai-economy",
    title: "경제지표 모니터",
    tagline: "금리·환율·공급 지표 한눈에",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: BarChart3,
    metricLabel: "지표 신호",
    metricUnit: "",
    useCase: "거시지표가 부동산에 주는 신호를 한 표로 요약",
    signatureWidget: "indicatorChips",
    tips: [
      "관심 지표를 골라두면 매월 자동 업데이트돼요.",
      "지표 변화 임계치 알림과 연동 가능합니다.",
    ],
  },
  "contract-risk": {
    id: "contract-risk",
    title: "계약 리스크 점검",
    tagline: "임대차·매매 계약 조항 위험 진단",
    accentColor: "#f04452",
    accentGradient: "from-[#f04452] to-[#f87171]",
    accentSoftBg: "bg-[#fef2f2]",
    icon: FileSearch,
    metricLabel: "위험 조항",
    metricUnit: "건",
    useCase: "계약서 조항별 위험도와 협상 포인트 진단",
    signatureWidget: "clauseCounter",
    tips: [
      "조항을 그대로 붙여넣으면 AI가 항목별로 분류합니다.",
      "협상이 필요한 조항을 자동으로 강조해 드려요.",
    ],
  },
};

/** 잘못된 toolId 대응. */
export function getToolIdentity(toolId: AiAnalysisToolId | string): ToolIdentity {
  const t = TOOL_IDENTITIES[toolId as AiAnalysisToolId];
  return t ?? FALLBACK;
}

/** brief 아이콘 (lucide) re-export — 외부에서 import 편의. */
export { Briefcase, CheckSquare };
