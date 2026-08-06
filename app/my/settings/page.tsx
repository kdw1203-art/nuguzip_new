import { SettingsClient, type NotifyChannels } from "./SettingsClient";
import { isEmailConfigured } from "@/lib/email/send";
import { isWebPushConfigured } from "@/lib/push/vapid";
import { isNcpSensConfigured } from "@/lib/ncp/sens-sms";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/**
 * 설정 화면의 서버 껍데기 — **지금 실제로 보낼 수 있는 채널만** 아래로 넘긴다.
 *
 * 판정 기준은 각 발송 코드가 쓰는 조건과 **같은 조건**이어야 한다. 여기서 따로
 * env 이름을 적지 않고 발송 쪽 헬퍼를 그대로 부르는 이유가 그것이다. 조건이 갈라지면
 * 설정에는 토글이 있는데 발송기는 건너뛰는 상태가 다시 생긴다 — 지금 고치는 그 버그다.
 *
 * /login 과 같은 이유로 `force-dynamic` 을 쓰지 않는다: 여기서 읽는 env 는 배포 시점에
 * 굳고, Vercel 에서 키를 넣으면 어차피 재배포해야 반영된다. 정적으로 두는 편이
 * 함수 호출을 아낀다.
 */
/* 최적화 10 — 홈과 같은 제목을 달고 있던 화면(analysis/cycle/page.tsx 주석 참고).
   로그인한 사람의 개인 설정 화면이라 검색 결과에 있을 이유가 없다 —
   눌러도 로그인 벽으로 떨어지는 죽은 링크가 된다. 제목 + noIndex. */
export const metadata = buildPageMetadata({
  /* 화면의 제목(PageShell title="설정")과 같은 말을 쓴다 — 탭에 적힌 이름과
     화면에 적힌 이름이 다르면 그것도 결국 틀린 안내다. */
  title: "설정",
  description: "이메일·푸시·문자 알림 수신 여부를 설정합니다.",
  path: "/my/settings",
  noIndex: true,
});

export default function SettingsPage() {
  const channels: NotifyChannels = {
    email: isEmailConfigured(),
    push: isWebPushConfigured(),
    sms: isNcpSensConfigured(),
  };

  return <SettingsClient channels={channels} />;
}
