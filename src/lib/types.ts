export interface PublishingSettings {
  slideshowMode?: "auto" | "always" | "never" | string[];
  contentFilter?: "none" | "only_reels" | "exclude_reels" | string[];
  publicationType?: number;
  tiktokPrivacyStatus?: number;
  tiktokComment?: boolean;
  tiktokDuet?: boolean;
  tiktokStitch?: boolean;
  pinterestLink?: string;
}

export interface SocialNetwork {
  _docId?: string; // Stable ID from Firestore
  name: string;
  enabled: boolean;
  model: string;
  prompt: string;
  accountId?: string; // Newly added for PostMyPost integration
  platform?: string; // E.g., 'telegram', 'vkontakte'
  pmpChannelId?: string | number;
  adaptedText?: string;
  adaptedTitle?: string;
  textLimitAdjusted?: boolean;
  textLimitPlatform?: string;
  status?: "idle" | "loading" | "rewriting" | "publishing" | "success" | "error";
  errorMsg?: string;
  publishingSettings?: PublishingSettings;
}
