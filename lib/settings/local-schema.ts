/** 브라우저 `localStorage` 에만 저장되는 앱 설정 (서버 동기화 없음). */

export const APP_LOCAL_SETTINGS_KEY = "woodong-app-settings-v1";

export type AppLocalSettings = {
  emailCommentReplies: boolean;
  emailServiceUpdates: boolean;
  emailWeeklyDigest: boolean;
  compactLists: boolean;
  hideOnboardingPopup: boolean;
};

export const defaultAppLocalSettings: AppLocalSettings = {
  emailCommentReplies: true,
  emailServiceUpdates: true,
  emailWeeklyDigest: false,
  compactLists: false,
  hideOnboardingPopup: false,
};

export function mergeAppLocalSettings(raw: unknown): AppLocalSettings {
  if (!raw || typeof raw !== "object") {
    return { ...defaultAppLocalSettings };
  }
  const o = raw as Record<string, unknown>;
  return {
    emailCommentReplies:
      typeof o.emailCommentReplies === "boolean"
        ? o.emailCommentReplies
        : defaultAppLocalSettings.emailCommentReplies,
    emailServiceUpdates:
      typeof o.emailServiceUpdates === "boolean"
        ? o.emailServiceUpdates
        : defaultAppLocalSettings.emailServiceUpdates,
    emailWeeklyDigest:
      typeof o.emailWeeklyDigest === "boolean"
        ? o.emailWeeklyDigest
        : defaultAppLocalSettings.emailWeeklyDigest,
    compactLists:
      typeof o.compactLists === "boolean"
        ? o.compactLists
        : defaultAppLocalSettings.compactLists,
    hideOnboardingPopup:
      typeof o.hideOnboardingPopup === "boolean"
        ? o.hideOnboardingPopup
        : defaultAppLocalSettings.hideOnboardingPopup,
  };
}
