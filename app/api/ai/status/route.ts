import { NextResponse } from "next/server";
import {
  getOpenAiModel,
  isAnthropicConfigured,
  isOpenAiConfigured,
} from "@/lib/ai/env-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 키 값은 노출하지 않고, 클라이언트에서 배너 표시용으로만 사용 */
export async function GET() {
  return NextResponse.json({
    openai: {
      configured: isOpenAiConfigured(),
      model: getOpenAiModel(),
    },
    anthropic: {
      configured: isAnthropicConfigured(),
    },
    /** OpenAI·Anthropic 중 하나라도 있으면 외부 LLM 호출 가능 */
    anyLlmConfigured: isOpenAiConfigured() || isAnthropicConfigured(),
  });
}
