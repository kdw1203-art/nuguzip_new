import { ChatRoom } from "./ChatRoom";

/* 시안 8p — 모임 그룹 채팅방 · 모바일 (+ 10c 채팅방 메뉴) */

export default async function TownGroupChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  return <ChatRoom />;
}
