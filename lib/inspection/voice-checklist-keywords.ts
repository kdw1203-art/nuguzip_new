/** 음성 메모 키워드 → 체크리스트 항목 id 매핑 */
const VOICE_CHECKLIST_KEYWORDS: Array<{ pattern: RegExp; checkId: string; label: string }> = [
  { pattern: /소음|층간|시끄|소리/, checkId: "ci_l1", label: "층간·외부 소음 체감 확인" },
  { pattern: /주차/, checkId: "c7", label: "주차공간 확인" },
  { pattern: /학교|학군|초등/, checkId: "c11", label: "초등학교 도보 통학" },
  { pattern: /지하철|역|교통/, checkId: "c1", label: "지하철역 도보 10분 이내" },
  { pattern: /곰팡|누수|하자/, checkId: "ci_r1", label: "옵션·하자·누수 확인" },
  { pattern: /재건축|재개발|GTX|개발/, checkId: "c18", label: "재건축·재개발 예정/진행" },
];

export function checklistHintsFromVoice(text: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (const { pattern, checkId, label } of VOICE_CHECKLIST_KEYWORDS) {
    if (pattern.test(text) && !seen.has(checkId)) {
      seen.add(checkId);
      out.push({ id: checkId, label });
    }
  }
  return out;
}
