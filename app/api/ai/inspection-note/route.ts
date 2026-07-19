import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import {

  getInspectionPublicContext,

  parseDistrict,

  type InspectionIntent,

} from "@/lib/inspection/public-data-context";

import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";

import { callLlmChat, type LlmMessage } from "@/lib/ai/llm-provider";

import { isOpenAiConfigured } from "@/lib/ai/env-keys";



export const runtime = "nodejs";



type In = {

  intent?: InspectionIntent;

  memo?: string;

  checklist?: Record<string, unknown>;

  region?: string;

  district?: string;

  aptName?: string;

};



type NoteOut = {

  summary: string;

  pros: string[];

  cons: string[];

  risk_flags: string[];

  next_actions: string[];

  evidence_refs: Array<Record<string, unknown>>;

};



function linesFromMemo(memo: string): string[] {

  return memo

    .split(/\n+/)

    .map((s) => s.trim())

    .filter((s) => s.length >= 4);

}



function buildRuleBasedOut(input: {

  memo: string;

  intent: InspectionIntent;

  district: string;

  aptName?: string;

  ctx: Awaited<ReturnType<typeof getInspectionPublicContext>>;

}): NoteOut {

  const { memo, intent, ctx } = input;

  const memoLines = linesFromMemo(memo);

  const pros: string[] = [];

  const cons: string[] = [];

  const risk_flags: string[] = [];

  const next_actions: string[] = [];



  if (ctx?.weatherHint) pros.push(`날씨: ${ctx.weatherHint}`);

  if (ctx?.airQualityHint?.match(/나쁨|매우|주의/)) {

    cons.push(`대기질: ${ctx.airQualityHint}`);

    next_actions.push("창문·환기·미세먼지 상태 재확인");

  }



  for (const p of ctx?.plans ?? []) {

    if (p.planId.includes("molit-apt")) {

      pros.push(`${p.title}: ${p.summary}`);

    }

    if (p.planId === "molit-building-registry" && p.items.length) {

      pros.push(`건축물대장: ${p.summary}`);

    }

    if (p.planId === "public-facility-open" && p.items.length) {

      pros.push(`주변 시설: ${p.summary}`);

    }

    if (p.planId === "commercial-district") {

      cons.push(`상권·유동: ${p.summary}`);

      next_actions.push("야간·주말 소음·유동 확인");

    }

    if (p.planId === "parking-standard") {

      next_actions.push("주차 난이도·방문 주차 확인");

    }

  }



  for (const hint of ctx?.checklistHints ?? []) {

    if (!next_actions.includes(hint)) next_actions.push(hint);

  }



  for (const line of memoLines.slice(0, 6)) {

    if (/좋|양호|만족|괜찮|충분/.test(line) && pros.length < 8) pros.push(line.slice(0, 120));

    if (/나쁨|불편|소음|걱정|리스크|주의|혼잡/.test(line) && cons.length < 8) cons.push(line.slice(0, 120));

    if (/확인|재방|비교|점검|필요/.test(line) && next_actions.length < 8) next_actions.push(line.slice(0, 100));

  }



  if (!pros.length) pros.push("교통·생활권은 현장 메모 기준으로 추가 확인 권장");

  if (!cons.length) cons.push("소음·관리비·주차 등 미기재 항목 추가 점검 필요");

  if (!risk_flags.length && cons.length) risk_flags.push("현장 변수·공급 이벤트 확인");

  if (!next_actions.length) {

    next_actions.push("평일·주말 시간대 재방문", "인접 단지 1~2곳 비교", "관리비·하자 이력 확인");

  }



  const evidence_refs = (ctx?.plans ?? []).map((p) => ({

    planId: p.planId,

    metric: p.title,

    value: p.summary,

    source: "public-data-national",

    mode: p.mode,

    date: p.fetchedAt.slice(0, 10),

    intent,

    district: ctx?.district,

  }));



  if (memo.length > 0) {

    evidence_refs.push({

      planId: "user-memo",

      metric: "memo_length",

      value: String(memo.length),

      source: "user_input",

      mode: "live",

      date: new Date().toISOString().slice(0, 10),

      intent,

      district: ctx?.district,

    });

  }



  const summaryParts = [

    ctx?.district ? `${ctx.district} 임장` : "임장",

    memoLines[0]?.slice(0, 80),

    ctx?.plans.find((p) => p.planId.includes("molit-apt"))?.summary,

  ].filter(Boolean);



  return {

    summary:

      summaryParts.join(" · ").slice(0, 240) ||

      "현장 확인 결과, 공공데이터·메모를 바탕으로 추가 확인이 권장됩니다.",

    pros: pros.slice(0, 6),

    cons: cons.slice(0, 6),

    risk_flags: risk_flags.slice(0, 4),

    next_actions: next_actions.slice(0, 6),

    evidence_refs,

  };

}



async function maybePolishWithLlm(base: NoteOut, memo: string, intent: InspectionIntent): Promise<NoteOut> {

  if (process.env.INSPECTION_NOTE_LLM === "0") return base;

  if (!isOpenAiConfigured()) return base;



  const option = getModelOption(defaultModelIdFromEnv());

  if (!option) return base;



  const messages: LlmMessage[] = [

    {

      role: "system",

      content:

        "임장노트 초안을 다듬습니다. JSON만 반환하세요. 키: summary, pros, cons, risk_flags, next_actions (배열). evidence_refs는 수정하지 마세요. 과장·투자 권유 금지.",

    },

    {

      role: "user",

      content: JSON.stringify({ intent, memo: memo.slice(0, 4000), draft: base }, null, 2),

    },

  ];



  const result = await callLlmChat(option, messages);

  if (!result.ok) return base;



  try {

    const raw = result.text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

    const parsed = JSON.parse(raw) as Partial<NoteOut>;

    return {

      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 280) : base.summary,

      pros: Array.isArray(parsed.pros) ? parsed.pros.map(String).slice(0, 6) : base.pros,

      cons: Array.isArray(parsed.cons) ? parsed.cons.map(String).slice(0, 6) : base.cons,

      risk_flags: Array.isArray(parsed.risk_flags)

        ? parsed.risk_flags.map(String).slice(0, 4)

        : base.risk_flags,

      next_actions: Array.isArray(parsed.next_actions)

        ? parsed.next_actions.map(String).slice(0, 6)

        : base.next_actions,

      evidence_refs: base.evidence_refs,

    };

  } catch {

    return base;

  }

}



export async function POST(req: NextRequest) {

  let body: In;

  try {

    body = (await req.json()) as In;

  } catch {

    return NextResponse.json({ error: "invalid json" }, { status: 400 });

  }



  const memo = String(body.memo ?? "");

  const intent = body.intent ?? "실거주";

  const district = parseDistrict(body.district ?? body.region ?? "");

  const aptName = body.aptName?.trim() || undefined;



  const ctx = district

    ? await getInspectionPublicContext({ district, aptName, intent })

    : null;



  const base = buildRuleBasedOut({ memo, intent, district, aptName, ctx });

  const out = await maybePolishWithLlm(base, memo, intent);



  return NextResponse.json(out);

}

