export type TextLengthUnit = "characters" | "utf8Bytes" | "utf16";

export interface PlatformTextLimits {
  platform: string;
  label: string;
  contentMax?: number;
  contentUnit?: TextLengthUnit;
  titleMax?: number;
  titleUnit?: TextLengthUnit;
}

export interface PlatformTextNetwork {
  name?: string;
  platform?: string;
  pmpChannelId?: string | number;
}

export interface TextOverflow {
  contentLength?: number;
  contentMax?: number;
  contentUnit?: TextLengthUnit;
  titleLength?: number;
  titleMax?: number;
  titleUnit?: TextLengthUnit;
}

const PMP_CHANNEL_PLATFORM: Record<string, string> = {
  "1": "instagram",
  "2": "vk",
  "6": "telegram",
  "7": "pinterest",
  "8": "linkedin",
  "9": "tiktok",
  "14": "reddit",
  "16": "youtube",
  "17": "threads",
};

const PLATFORM_LIMITS: Record<string, PlatformTextLimits> = {
  instagram: { platform: "instagram", label: "Instagram", contentMax: 2200 },
  facebook: { platform: "facebook", label: "Facebook", contentMax: 5000 },
  vk: { platform: "vk", label: "VK", contentMax: 16000 },
  youtube: {
    platform: "youtube",
    label: "YouTube",
    contentMax: 5000,
    contentUnit: "utf8Bytes",
    titleMax: 100,
  },
  pinterest: {
    platform: "pinterest",
    label: "Pinterest",
    contentMax: 500,
    titleMax: 100,
  },
  threads: { platform: "threads", label: "Threads", contentMax: 500 },
  linkedin: { platform: "linkedin", label: "LinkedIn", contentMax: 3000 },
  reddit: { platform: "reddit", label: "Reddit", contentMax: 40000, titleMax: 300 },
  telegram: { platform: "telegram", label: "Telegram", contentMax: 1024 },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    contentMax: 2200,
    contentUnit: "utf16",
  },
  x: { platform: "x", label: "X", contentMax: 280 },
};

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function normalizePlatformKey(network: PlatformTextNetwork): string {
  const channelPlatform = network.pmpChannelId === undefined || network.pmpChannelId === null
    ? ""
    : PMP_CHANNEL_PLATFORM[String(network.pmpChannelId)];
  if (channelPlatform) return channelPlatform;

  const source = `${network.platform || ""} ${network.name || ""}`.toLowerCase();
  if (includesAny(source, ["pinterest", "pin", "pinteres"])) return "pinterest";
  if (includesAny(source, ["threads"])) return "threads";
  if (includesAny(source, ["linkedin", "linked in"])) return "linkedin";
  if (includesAny(source, ["telegram", "tg"])) return "telegram";
  if (includesAny(source, ["tiktok", "tik tok"])) return "tiktok";
  if (includesAny(source, ["youtube", "you tube", "shorts"])) return "youtube";
  if (includesAny(source, ["instagram"])) return "instagram";
  if (includesAny(source, ["facebook", "meta"])) return "facebook";
  if (includesAny(source, ["vkontakte", "vk"])) return "vk";
  if (includesAny(source, ["reddit"])) return "reddit";
  if (includesAny(source, ["twitter", " x ", "x.com"])) return "x";
  return "";
}

export function getPlatformTextLimits(network: PlatformTextNetwork): PlatformTextLimits | null {
  const key = normalizePlatformKey(network);
  return key ? PLATFORM_LIMITS[key] || null : null;
}

export function measureTextLength(value: string, unit: TextLengthUnit = "characters"): number {
  if (unit === "utf8Bytes") return Buffer.byteLength(value, "utf8");
  if (unit === "utf16") return value.length;
  return Array.from(value).length;
}

export function getTextOverflow(
  content: string,
  title: string,
  limits: PlatformTextLimits
): TextOverflow | null {
  const overflow: TextOverflow = {};
  const contentUnit = limits.contentUnit || "characters";
  const titleUnit = limits.titleUnit || "characters";

  if (limits.contentMax !== undefined) {
    const contentLength = measureTextLength(content, contentUnit);
    if (contentLength > limits.contentMax) {
      overflow.contentLength = contentLength;
      overflow.contentMax = limits.contentMax;
      overflow.contentUnit = contentUnit;
    }
  }

  if (limits.titleMax !== undefined && title) {
    const titleLength = measureTextLength(title, titleUnit);
    if (titleLength > limits.titleMax) {
      overflow.titleLength = titleLength;
      overflow.titleMax = limits.titleMax;
      overflow.titleUnit = titleUnit;
    }
  }

  return Object.keys(overflow).length ? overflow : null;
}

export function trimTextToLimit(value: string, max: number, unit: TextLengthUnit = "characters"): string {
  if (measureTextLength(value, unit) <= max) return value;
  if (max <= 0) return "";

  const suffix = max > 3 ? "..." : "";
  const target = Math.max(0, max - measureTextLength(suffix, unit));
  let current = "";

  for (const char of Array.from(value)) {
    const next = current + char;
    if (measureTextLength(next, unit) > target) break;
    current = next;
  }

  let trimmed = current.trimEnd();
  const boundary = Math.max(
    trimmed.lastIndexOf(" "),
    trimmed.lastIndexOf("\n"),
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf(","),
    trimmed.lastIndexOf(";"),
    trimmed.lastIndexOf(":"),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?")
  );

  if (boundary > Math.floor(target * 0.7)) {
    trimmed = trimmed.slice(0, boundary).trimEnd();
  }

  let result = `${trimmed}${suffix}`;
  while (measureTextLength(result, unit) > max && result.length > 0) {
    result = result.slice(0, -1).trimEnd();
  }
  return result;
}

export function enforceTextLimits(
  content: string,
  title: string,
  limits: PlatformTextLimits
): { content: string; title: string } {
  const contentUnit = limits.contentUnit || "characters";
  const titleUnit = limits.titleUnit || "characters";

  return {
    content: limits.contentMax === undefined
      ? content
      : trimTextToLimit(content, limits.contentMax, contentUnit),
    title: limits.titleMax === undefined
      ? title
      : trimTextToLimit(title, limits.titleMax, titleUnit),
  };
}

export function formatOverflow(overflow: TextOverflow): string {
  const parts: string[] = [];
  if (overflow.contentLength !== undefined) {
    parts.push(`content ${overflow.contentLength}/${overflow.contentMax} ${overflow.contentUnit || "characters"}`);
  }
  if (overflow.titleLength !== undefined) {
    parts.push(`title ${overflow.titleLength}/${overflow.titleMax} ${overflow.titleUnit || "characters"}`);
  }
  return parts.join(", ");
}
