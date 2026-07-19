/** Kakao.Share.sendDefault feed 템플릿 */
export function buildKakaoFeedShare(input: {
  title: string;
  description: string;
  shareUrl: string;
  imageUrl?: string;
}): Record<string, unknown> {
  const imageUrl =
    input.imageUrl?.trim() ||
    `${typeof window !== "undefined" ? window.location.origin : ""}/og-image`;

  return {
    objectType: "feed",
    content: {
      title: input.title.slice(0, 200),
      description: input.description.slice(0, 200),
      imageUrl,
      link: {
        mobileWebUrl: input.shareUrl,
        webUrl: input.shareUrl,
      },
    },
    buttons: [
      {
        title: "앱에서 보기",
        link: {
          mobileWebUrl: input.shareUrl,
          webUrl: input.shareUrl,
        },
      },
    ],
  };
}
