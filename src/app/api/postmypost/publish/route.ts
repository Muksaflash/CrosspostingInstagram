import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSettings } from "@/app/actions";
import { uploadMediaUrlsToPostMyPost, uploadFileToPostMyPost, createPublication, getPostMyPostAccounts } from "@/lib/postmypost";
import { createSlideshowFile, type SlideshowFile } from "@/lib/slideshow";
import { getPublicationTextLimitViolation } from "@/lib/publishingText";
import { resolveInstagramAudioSafeMediaUrls } from "@/lib/instagram";
import { firestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import crypto from "crypto";

export const runtime = "nodejs";

type PublishNetwork = {
  accountId?: string | number;
  name?: string;
  platform?: string;
  pmpChannelId?: string | number;
  adaptedText?: string;
  adaptedTitle?: string;
  publishingSettings?: {
    slideshowMode?: "auto" | "always" | "never" | string[];
    contentFilter?: "none" | "only_reels" | "exclude_reels" | string[];
    publicationType?: number | string;
    tiktokPrivacyStatus?: number;
    tiktokComment?: boolean;
    tiktokDuet?: boolean;
    tiktokStitch?: boolean;
    pinterestLink?: string;
  };
};

type PublicationCandidate = {
  net: PublishNetwork;
  accountId: string;
  accountIdValue: string | number;
  baseLockId: string;
  lockId: string;
  lockRef: DocumentReference;
  forcedDuplicate?: boolean;
  forceAttemptId?: string;
};

type AuthSession = {
  user?: {
    email?: string | null;
    id?: string | null;
  };
} | null;

class PublishRouteError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizePostIdentity(postKey: unknown, postUrl: unknown, mediaUrls: string[]): string {
  const key = typeof postKey === "string" ? postKey.trim() : "";
  if (key) return `postKey:${key}`;

  const url = typeof postUrl === "string" ? postUrl.trim() : "";
  if (url) return `postUrl:${url}`;

  return `media:${sha256(JSON.stringify(mediaUrls || []))}`;
}

async function resolveAudioSafeMediaUrls(
  mediaUrls: string[],
  settings: Record<string, string> | undefined,
  postKey: unknown,
  postUrl: unknown
): Promise<string[]> {
  try {
    return await resolveInstagramAudioSafeMediaUrls({
      mediaUrls,
      rapidApiKey: settings?.RAPIDAPI_KEY,
      postKey,
      postUrl,
    });
  } catch (error) {
    console.error("Failed to resolve audio-safe Instagram media before publish:", error);
    throw new PublishRouteError(
      "INSTAGRAM_VIDEO_AUDIO_UNSAFE",
      "Instagram returned a video-only media file. Please fetch the post again or try later.",
      400
    );
  }
}

async function getSessionUserDataKey(session: AuthSession): Promise<string | null> {
  const sessionEmail = session?.user?.email;
  const userId = session?.user?.id;

  if (userId) {
    try {
      const userDoc = await firestore.collection("users").doc(userId).get();
      const canonicalEmail = userDoc.data()?.email;
      if (typeof canonicalEmail === "string" && canonicalEmail.includes("@")) {
        return canonicalEmail;
      }
    } catch (e) {
      console.error("Firestore Error (publish getSessionUserDataKey):", e);
    }
  }

  return sessionEmail || null;
}

async function claimPublicationLocks(candidates: PublicationCandidate[]) {
  return firestore.runTransaction(async (tx) => {
    const claimed: PublicationCandidate[] = [];
    const skippedDuplicates: Array<{ accountId: string; networkName: string; status: string }> = [];

    const snapshots = await Promise.all(candidates.map((candidate) => tx.get(candidate.lockRef)));

    snapshots.forEach((snapshot, index) => {
      const candidate = candidates[index];
      const data = snapshot.exists ? snapshot.data() : null;
      const status = typeof data?.status === "string" ? data.status : "";

      if (status === "pending" || status === "published") {
        skippedDuplicates.push({
          accountId: candidate.accountId,
          networkName: candidate.net?.name || candidate.accountId,
          status,
        });
        return;
      }

      const lockData: Record<string, unknown> = {
        accountId: candidate.accountId,
        networkName: candidate.net?.name || "",
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (candidate.forcedDuplicate) {
        lockData.forcedDuplicate = true;
        lockData.originalLockId = candidate.baseLockId;
        lockData.forceAttemptId = candidate.forceAttemptId || "";
      }

      tx.set(candidate.lockRef, lockData);
      claimed.push(candidate);
    });

    return { claimed, skippedDuplicates };
  });
}

async function markPublicationLocks(
  candidates: PublicationCandidate[],
  status: "published" | "failed",
  extra: Record<string, unknown> = {}
) {
  if (!candidates.length) return;

  const batch = firestore.batch();
  for (const candidate of candidates) {
    batch.set(
      candidate.lockRef,
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        ...extra,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

export async function POST(req: Request) {
  let claimedLocks: PublicationCandidate[] = [];
  let publicationAttemptStarted = false;

  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json() as {
      networks?: PublishNetwork[];
      mediaUrls?: string[];
      originalCaption?: string;
      postAt?: string;
      postKey?: unknown;
      postUrl?: unknown;
      forceDuplicate?: boolean;
      forceAttemptId?: unknown;
    };
    const { networks, originalCaption, postAt, postKey, postUrl } = body;
    let mediaUrls = body.mediaUrls;
    const forceDuplicate = body.forceDuplicate === true;
    const rawForceAttemptId = typeof body.forceAttemptId === "string" ? body.forceAttemptId.trim() : "";
    const forceAttemptId = forceDuplicate
      ? (rawForceAttemptId ? rawForceAttemptId.slice(0, 128) : crypto.randomUUID())
      : "";

    const settings = await getUserSettings();
    const token = settings?.POSTMYPOST_TOKEN;
    const projectId = Number(settings?.POSTMYPOST_PROJECT_ID);
    const userDataKey = await getSessionUserDataKey(session);

    if (!token || !projectId) {
      return new NextResponse("PostMyPost Token or Project ID not configured", { status: 400 });
    }
    if (!userDataKey) {
      return new NextResponse("Unable to resolve current user", { status: 401 });
    }

    if (!networks || !networks.length) {
      return new NextResponse("No networks provided", { status: 400 });
    }
    if (!mediaUrls || !mediaUrls.length) {
      return new NextResponse("No media provided", { status: 400 });
    }
    mediaUrls = await resolveAudioSafeMediaUrls(mediaUrls, settings, postKey, postUrl);

    const hasVideo = mediaUrls.some((u: string) => /\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
    const hasImage = mediaUrls.some((u: string) => !/\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
    const isSingleVideo = mediaUrls.length === 1 && hasVideo;
    const isMixed = hasVideo && hasImage;

    // Cache uploaded file IDs to avoid duplicate work
    let fileIdsOriginal: string[] | null = null;
    let fileIdsSlideshow: string[] | null = null;

    const accountIds: Array<string | number> = [];
    const details: Array<Record<string, unknown>> = [];
    const candidates: PublicationCandidate[] = [];
    const duplicateAccountIds = new Set<string>();
    const seenAccountIds = new Set<string>();
    const postIdentity = normalizePostIdentity(postKey, postUrl, mediaUrls);
    const skippedUnavailableAccounts: Array<{ accountId: string; networkName: string; status: string }> = [];
    let availableAccountIds: Set<string> | null = null;
    const pmpAccountsById = new Map<string, { channel_id?: string | number; chanel_id?: string | number }>();

    try {
      const pmpAccounts = await getPostMyPostAccounts(token, projectId);
      availableAccountIds = new Set(pmpAccounts.map((account) => String(account.id)));
      for (const account of pmpAccounts) {
        pmpAccountsById.set(String(account.id), account);
      }
    } catch (accountErr) {
      console.error("Failed to validate PMP accounts before publish:", accountErr);
    }

    for (const net of networks) {
      const rawAccountId = net.accountId;
      const accountId = rawAccountId === undefined || rawAccountId === null ? "" : String(rawAccountId).trim();
      if (!accountId) continue;
      if (availableAccountIds && !availableAccountIds.has(accountId)) {
        skippedUnavailableAccounts.push({
          accountId,
          networkName: net.name || accountId,
          status: "unavailable_in_postmypost",
        });
        continue;
      }

      const accountIdValue = rawAccountId === undefined || rawAccountId === null ? accountId : rawAccountId;
      if (seenAccountIds.has(accountId)) {
        duplicateAccountIds.add(accountId);
        continue;
      }
      seenAccountIds.add(accountId);

      const pubSettings = net.publishingSettings || {};
      
      const isSingleImage = !hasVideo && mediaUrls.length === 1;
      const isPhotoCarousel = !hasVideo && mediaUrls.length > 1;

      // Filter logic
      let filters = pubSettings.contentFilter || 'none';
      if (!Array.isArray(filters)) {
        if (filters === 'only_reels') filters = ['single_video'];
        else if (filters === 'exclude_reels') filters = ['single_image', 'carousel', 'mixed_carousel'];
        else filters = ['single_image', 'single_video', 'carousel', 'mixed_carousel'];
      }

      if (isSingleVideo && !filters.includes('single_video')) continue;
      if (isSingleImage && !filters.includes('single_image')) continue;
      if (isPhotoCarousel && !filters.includes('carousel')) continue;
      if (isMixed && !filters.includes('mixed_carousel')) continue;

      const baseLockId = sha256(JSON.stringify([userDataKey, projectId, accountId, postIdentity]));
      const lockId = forceDuplicate
        ? sha256(JSON.stringify([userDataKey, projectId, accountId, postIdentity, "force", forceAttemptId]))
        : baseLockId;
      candidates.push({
        net,
        accountId,
        accountIdValue,
        baseLockId,
        lockId,
        lockRef: firestore
          .collection("users")
          .doc(userDataKey)
          .collection("publicationLocks")
          .doc(lockId),
        forcedDuplicate: forceDuplicate || undefined,
        forceAttemptId: forceDuplicate ? forceAttemptId : undefined,
      });
    }

    if (candidates.length === 0) {
      return new NextResponse("All networks were skipped due to content filters or missing accounts", { status: 400 });
    }

    const { claimed, skippedDuplicates } = await claimPublicationLocks(candidates);
    claimedLocks = claimed;

    for (const accountId of duplicateAccountIds) {
      skippedDuplicates.push({
        accountId,
        networkName: accountId,
        status: "duplicate_in_request",
      });
    }
    skippedDuplicates.push(...skippedUnavailableAccounts);

    if (claimed.length === 0) {
      return NextResponse.json({
        status: "skipped",
        message: "This post was already published to the selected accounts.",
        skippedDuplicates,
      });
    }

    for (const candidate of claimed) {
      const net = candidate.net;
      const pmpAccount = pmpAccountsById.get(candidate.accountId);
      const pmpChannelId = net.pmpChannelId ?? pmpAccount?.channel_id ?? pmpAccount?.chanel_id;
      const violation = getPublicationTextLimitViolation({
        network: {
          name: net.name,
          platform: net.platform,
          pmpChannelId,
        },
        title: net.adaptedTitle || "",
        content: net.adaptedText || originalCaption || "",
      });

      if (violation) {
        throw new PublishRouteError(
          "TEXT_LIMIT_EXCEEDED",
          `Text for ${violation.platformLabel} exceeds platform limits: ${violation.summary}.`,
          400,
          {
            platform: violation.platform,
            platformLabel: violation.platformLabel,
            contentLength: violation.overflow.contentLength,
            contentMax: violation.overflow.contentMax,
            titleLength: violation.overflow.titleLength,
            titleMax: violation.overflow.titleMax,
            summary: violation.summary,
            networkName: net.name || candidate.accountId,
          }
        );
      }
    }

    for (const candidate of claimed) {
      const net = candidate.net;
      const pubSettings = net.publishingSettings || {};
      const platform = (net.platform || net.name || '').toLowerCase();
      const isTikTok = platform.includes('tiktok');

      const isSingleImage = !hasVideo && mediaUrls.length === 1;
      const isPhotoCarousel = !hasVideo && mediaUrls.length > 1;

      // Slideshow Mode
      let mode = pubSettings.slideshowMode || 'auto';
      let useSlideshow = false;

      const isAuto = !Array.isArray(mode) && mode !== 'never' && mode !== 'always';

      if (isAuto) {
        if (['reddit', 'tiktok', 'reels', 'youtube'].some(p => platform.includes(p))) {
          if (mediaUrls.length > 1) useSlideshow = true;
        } else if (['linkedin', 'pinterest'].some(p => platform.includes(p))) {
           if (isMixed && mediaUrls.length > 1) useSlideshow = true;
        }
      } else {
        if (!Array.isArray(mode)) {
          if (mode === 'always') mode = ['mixed_carousel', 'photo_carousel', 'single_image'];
          else mode = []; // never
        }

        if (isMixed && mode.includes('mixed_carousel')) useSlideshow = true;
        if (isPhotoCarousel && mode.includes('photo_carousel')) useSlideshow = true;
        if (isSingleImage && mode.includes('single_image')) useSlideshow = true;
      }

      // TikTok must receive exactly one video. Never send image/carousel file_ids to it.
      if (isTikTok && !isSingleVideo) {
        useSlideshow = true;
      }

      let currentFileIds: string[] = [];
      if (useSlideshow) {
        if (!fileIdsSlideshow) {
          let slideshowFile: SlideshowFile | null = null;
          try {
            slideshowFile = await createSlideshowFile(mediaUrls);
            const fileId = await uploadFileToPostMyPost(slideshowFile.filePath, token, projectId, slideshowFile.fileName);
            fileIdsSlideshow = [fileId];
          } catch (slideErr: unknown) {
            const message = slideErr instanceof Error ? slideErr.message : String(slideErr);
            console.error(`Slideshow creation failed for ${net.name || candidate.accountId}:`, message);
            throw new PublishRouteError(
              "SLIDESHOW_CREATION_FAILED",
              "Slideshow creation failed",
              502
            );
          } finally {
            await slideshowFile?.cleanup();
          }
        }
        currentFileIds = fileIdsSlideshow;
      } else {
        if (!fileIdsOriginal) {
          fileIdsOriginal = await uploadMediaUrlsToPostMyPost(mediaUrls, token, projectId);
        }
        currentFileIds = fileIdsOriginal;
      }

      if (isTikTok && currentFileIds.length !== 1) {
        throw new PublishRouteError(
          "TIKTOK_REQUIRES_SINGLE_VIDEO",
          "TikTok publication requires exactly one video file.",
          400,
          {
            networkName: net.name || candidate.accountId,
            fileCount: currentFileIds.length,
          }
        );
      }

      accountIds.push(candidate.accountIdValue);

      const pubType = Number(pubSettings.publicationType || 1);
      const title = net.adaptedTitle || "";
      const content = net.adaptedText || originalCaption || "";
      
      const detail: Record<string, unknown> = {
        account_id: candidate.accountIdValue,
        publication_type: pubType,
        content,
        file_ids: currentFileIds
      };

      if (title) detail.title = title;
      
      const effectivePinLink = pubSettings.pinterestLink || settings?.PINTEREST_LINK || '';
      if (effectivePinLink && (net.platform || net.name || '').toLowerCase().includes('pinterest')) {
        detail.link = effectivePinLink;
      }

      if (isTikTok) {
        detail.tiktok_privacy_status = pubSettings.tiktokPrivacyStatus ?? 1;
        detail.tiktok_comment = pubSettings.tiktokComment ?? true;
        detail.tiktok_duet = pubSettings.tiktokDuet ?? true;
        detail.tiktok_stitch = pubSettings.tiktokStitch ?? true;
      }

      details.push(detail);
    }

    if (details.length === 0) {
      await markPublicationLocks(claimedLocks, "failed", {
        failureReason: "All claimed networks were skipped while building details",
      });
      return new NextResponse("All networks were skipped due to content filters", { status: 400 });
    }

    const payload: Record<string, unknown> = {
      project_id: projectId,
      account_ids: accountIds,
      publication_status: 5,
      post_at: postAt || new Date().toISOString(),
      details: details
    };

    publicationAttemptStarted = true;
    const pubRes = await createPublication(payload, token);
    await markPublicationLocks(claimedLocks, "published", {
      postIdentity,
      postKey: typeof postKey === "string" ? postKey : "",
      postUrl: typeof postUrl === "string" ? postUrl : "",
      publicationId: pubRes?.id || pubRes?.data?.id || "",
    });

    return NextResponse.json({
      ...pubRes,
      skippedDuplicates,
      forcedDuplicate: forceDuplicate || undefined,
      publishedAccounts: claimed.map((candidate) => ({
        accountId: candidate.accountId,
        networkName: candidate.net?.name || candidate.accountId,
      })),
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (claimedLocks.length) {
      await markPublicationLocks(claimedLocks, "failed", {
        failureReason: errorMessage,
        publicationAttemptStarted,
      }).catch((lockErr) => console.error("Failed to update publication locks:", lockErr));
    }
    console.error("Publish Error Root Cause:", error);
    if (error instanceof PublishRouteError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        { status: error.status }
      );
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
