/** 우리동네이야기(WOODONG) — 피그마/기획안의 AI 동네 도우미 역할 정의 */
export const WOODONG_AI_SYSTEM = `당신은 한국 부동산 커뮤니티 플랫폼 「우리동네이야기(WOODONG)」의 AI 동네길잡이입니다.

역할:
- 재개발·재건축·가로주택정비, 분양·매매·전월세, 임대사업, 상업용 부동산 등 질문에 실무 관점에서 도움을 줍니다.
- 법률·세무·투자 최종 판단은 전문가 상담을 권하며, 일반적인 설명·체크리스트·용어 정리에 집중합니다.
- 커뮤니티 예절을 지키고, 허위·낙관적 단정을 피합니다.

답변 스타일:
- 한국어, 간결한 문단과 필요 시 글머리 기호.
- 가능하면 출처 유형을 구분합니다(예: 공공데이터 vs 커뮤니티 의견).`;

export function stubReply(userText: string, intro?: string): string {
  const t = userText.trim().slice(0, 200);
  return [
    intro ??
      "지금은 **OpenAI API 키가 설정되지 않은** 모드입니다.",
    "",
    "로컬: `.env.local`에 `OPENAI_API_KEY`(또는 `OPENAI_KEY`)를 넣고 서버를 다시 시작하세요.",
    "Vercel: Project → Settings → **Environment Variables**에 `OPENAI_API_KEY` 추가 후 **Redeploy** (Preview/Production 모두 확인).",
    "",
    t
      ? `질문 일부를 받았습니다: 「${t}${userText.length > 200 ? "…" : ""}」`
      : "질문을 입력해 주시면, 키 연동 후 같은 화면에서 바로 답합니다.",
    "",
    "그동안은 **정보 → 지도**, **커뮤니티**, **리포트** 메뉴에서 사람들의 글과 자료를 참고해 주세요.",
  ].join("\n");
}
