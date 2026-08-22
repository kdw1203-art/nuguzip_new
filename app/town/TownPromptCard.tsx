import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/* [3차] 오늘의 동네 글감 — 커뮤니티에 유저 글이 0인 근본 원인은 "쓸 이유가
 * 없어서"다. 매일 다른 질문 하나를 걸고, 누르면 글쓰기 화면에 제목이 미리
 * 채워진다(?topic=). 날짜 기반 결정적 로테이션이라 서버 렌더(ISR)와 충돌 없다.
 * 첫 글 적립(+50P, 일 2회)은 원장 규칙(post_written)이 지급·상한을 방어한다. */

const PROMPTS: string[] = [
  "우리 동네에서 요즘 공사 중인 곳, 어디가 제일 궁금하세요?",
  "이사 오고 나서야 알게 된 우리 동네 장단점 하나씩만 알려주세요",
  "우리 동네 전세 시세, 체감상 오르고 있나요 내리고 있나요?",
  "동네 중개사무소 다녀오신 분 — 최근 분위기 어땠나요?",
  "아이 키우기엔 우리 동네 어떤가요? 학교·학원 이야기 환영",
  "우리 동네에서 밤 산책하기 좋은 코스 추천해 주세요",
  "재건축·재개발 소문, 우리 동네에도 있나요? 들은 이야기 공유해요",
  "출퇴근 교통 솔직 후기 — 지하철·버스·주차 어디가 제일 아쉽나요?",
  "우리 동네 신축 vs 구축, 실거주 만족도는 어느 쪽이 높을까요?",
  "관리비 이야기 — 우리 단지 관리비, 적정하다고 느끼시나요?",
  "동네 상권 변화 — 최근 새로 생긴 가게, 없어진 가게 있나요?",
  "이 동네로 이사 올 친구에게 딱 한 가지 조언한다면?",
  "우리 동네 소음·치안, 실제로 살아 보니 어떤가요?",
  "장 보러 어디 가세요? 동네 마트·시장 가성비 비교해요",
];

function kstDayIndex(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return Math.floor(kst.getTime() / 86_400_000);
}

export function TownPromptCard() {
  const prompt = PROMPTS[kstDayIndex() % PROMPTS.length];
  return (
    <div className="rise-in card mb-4 flex flex-wrap items-center gap-3 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary">
          <Icon name="notebook-pen" size={13} />
          오늘의 동네 글감
        </span>
        <span className="text-[14px] font-bold leading-[1.5] text-ink">{prompt}</span>
      </div>
      <Link
        href={`/town/write?topic=${encodeURIComponent(prompt)}`}
        className="btn-cta shrink-0 rounded-full px-4 py-2 text-[12.5px] font-extrabold no-underline tap-ripple"
      >
        답글 쓰기 +50P
      </Link>
    </div>
  );
}
