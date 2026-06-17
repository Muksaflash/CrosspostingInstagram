import { shortenContentToLimits } from "@/lib/openai";
import {
  enforceTextLimits,
  formatOverflow,
  getPlatformTextLimits,
  getTextOverflow,
  type PlatformTextNetwork,
  type TextOverflow,
} from "@/lib/platformTextLimits";

export interface EnsurePublicationTextInput {
  network: PlatformTextNetwork;
  title: string;
  content: string;
  openAiKey?: string;
  model?: string;
  logContext?: string;
}

export interface EnsurePublicationTextResult {
  title: string;
  content: string;
  platform?: string;
  platformLabel?: string;
  shortened: boolean;
}

export interface PublicationTextLimitViolation {
  platform: string;
  platformLabel: string;
  overflow: TextOverflow;
  summary: string;
}

function limitLabel(max: number | undefined, unit: string | undefined): string | undefined {
  if (max === undefined) return undefined;
  if (unit === "utf8Bytes") return `${max} UTF-8 bytes`;
  if (unit === "utf16") return `${max} UTF-16 units`;
  return `${max} characters`;
}

export function getPublicationTextLimitViolation(
  input: Pick<EnsurePublicationTextInput, "network" | "title" | "content">
): PublicationTextLimitViolation | null {
  const limits = getPlatformTextLimits(input.network);
  if (!limits) return null;

  const overflow = getTextOverflow(input.content, input.title, limits);
  if (!overflow) return null;

  return {
    platform: limits.platform,
    platformLabel: limits.label,
    overflow,
    summary: formatOverflow(overflow),
  };
}

export async function ensurePublicationTextLimits(
  input: EnsurePublicationTextInput
): Promise<EnsurePublicationTextResult> {
  const limits = getPlatformTextLimits(input.network);
  if (!limits) {
    return {
      title: input.title,
      content: input.content,
      shortened: false,
    };
  }

  const overflow = getTextOverflow(input.content, input.title, limits);
  if (!overflow) {
    return {
      title: input.title,
      content: input.content,
      platform: limits.platform,
      platformLabel: limits.label,
      shortened: false,
    };
  }

  const context = input.logContext ? ` (${input.logContext})` : "";
  console.log(`Text exceeds ${limits.label} limits${context}: ${formatOverflow(overflow)}. Shortening.`);

  let title = input.title;
  let content = input.content;

  if (input.openAiKey) {
    try {
      const shortened = await shortenContentToLimits({
        title,
        text: content,
        platformLabel: limits.label,
        titleLimit: limitLabel(limits.titleMax, limits.titleUnit),
        contentLimit: limitLabel(limits.contentMax, limits.contentUnit),
        model: input.model || "gpt-5.4",
        apiKey: input.openAiKey,
      });
      title = shortened.title || title;
      content = shortened.text || content;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to shorten text for ${limits.label}${context}:`, message);
    }
  } else {
    console.warn(`OpenAI key missing; using deterministic trimming for ${limits.label}${context}.`);
  }

  const enforced = enforceTextLimits(content, title, limits);
  const finalOverflow = getTextOverflow(enforced.content, enforced.title, limits);
  if (finalOverflow) {
    console.error(`Text is still over ${limits.label} limits after enforcement${context}: ${formatOverflow(finalOverflow)}`);
  }

  return {
    title: enforced.title,
    content: enforced.content,
    platform: limits.platform,
    platformLabel: limits.label,
    shortened: true,
  };
}
