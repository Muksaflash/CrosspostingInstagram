
"use server";

import { auth } from "@/auth";
import { firestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type SocialNetwork } from "@/lib/types";
import { type InstagramPost } from "@/lib/instagram";

type FetchPostResult =
  | { ok: true; post: InstagramPost }
  | { ok: false; code: string; message: string };

type FetchPostFailure = Extract<FetchPostResult, { ok: false }>;

type AdaptPostTextNetwork = {
  name?: string;
  platform?: string;
  pmpChannelId?: string | number;
};

function toFetchPostError(error: unknown): FetchPostFailure {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("link not found") || lower.includes("download link not found")) {
    return { ok: false, code: "INSTAGRAM_LINK_NOT_FOUND", message };
  }
  if (lower.includes("empty response") || lower.includes("empty array response")) {
    return { ok: false, code: "INSTAGRAM_EMPTY_RESPONSE", message };
  }
  if (lower.includes("rapidapi error")) {
    return { ok: false, code: "INSTAGRAM_API_ERROR", message };
  }
  if (lower.includes("invalid instagram link")) {
    return { ok: false, code: "INVALID_INSTAGRAM_LINK", message };
  }
  if (lower.includes("rapidapi_key not configured")) {
    return { ok: false, code: "RAPIDAPI_NOT_CONFIGURED", message };
  }
  if (lower.includes("unauthorized")) {
    return { ok: false, code: "UNAUTHORIZED", message };
  }

  return { ok: false, code: "FETCH_POST_FAILED", message };
}

async function getCurrentUserDataKey(): Promise<string | null> {
  const session = await auth();
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
      console.error("Firestore Error (getCurrentUserDataKey):", e);
    }
  }

  return sessionEmail || null;
}

async function getRequestAuditMetadata() {
  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for") || "";
    return {
      ip: forwardedFor.split(",")[0]?.trim() || h.get("x-real-ip") || "",
      userAgent: h.get("user-agent") || "",
      referer: h.get("referer") || "",
    };
  } catch {
    return { ip: "", userAgent: "", referer: "" };
  }
}

function summarizeSettingValue(key: string, value: unknown) {
  const raw = value === undefined || value === null ? "" : String(value);
  const sensitive = /(KEY|TOKEN|SECRET)/i.test(key);
  const tooLong = raw.length > 500;

  return {
    present: raw.length > 0,
    length: raw.length,
    redacted: sensitive,
    truncated: !sensitive && tooLong,
    value: sensitive ? "" : raw.slice(0, 500),
  };
}

async function getActorAuditData() {
  const session = await auth();
  const meta = await getRequestAuditMetadata();
  return {
    actorEmail: session?.user?.email || "",
    actorUserId: session?.user?.id || "",
    ...meta,
  };
}

export async function getUserSettings() {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) return null;

  try {
    const snapshot = await firestore
      .collection("users")
      .doc(userDataKey)
      .collection("settings")
      .get();

    const settings: Record<string, string> = {};
    snapshot.forEach((doc) => {
      settings[doc.id] = doc.data().value;
    });

    return settings;
  } catch (e) {
    console.error("Firestore Error (getUserSettings):", e);
    return null;
  }
}

export async function saveUserSetting(key: string, value: string) {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) throw new Error("Unauthorized");

  try {
    const settingRef = firestore
      .collection("users")
      .doc(userDataKey)
      .collection("settings")
      .doc(key);
    const previous = await settingRef.get();
    const previousValue = previous.exists ? previous.data()?.value : "";
    const auditData = await getActorAuditData();
    const batch = firestore.batch();

    batch.set(settingRef, { value });
    batch.set(
      firestore
        .collection("users")
        .doc(userDataKey)
        .collection("settingAudit")
        .doc(),
      {
        settingKey: key,
        action: "save_setting",
        previousValue: summarizeSettingValue(key, previousValue),
        newValue: summarizeSettingValue(key, value),
        changedAt: FieldValue.serverTimestamp(),
        changedAtMs: Date.now(),
        ...auditData,
      }
    );

    await batch.commit();

    revalidatePath("/");
  } catch (e) {
    console.error("Firestore Error (saveUserSetting):", e);
  }
}

export async function setAutoPostEnabledSetting(enabled: boolean) {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) throw new Error("Unauthorized");

  const settingsRef = firestore
    .collection("users")
    .doc(userDataKey)
    .collection("settings");
  const keys = [
    "AUTO_POST_ENABLED",
    "AUTO_POST_ENABLED_SINCE",
    "AUTO_POST_WATERMARK_AT",
    "AUTO_POST_ENABLED_AT",
  ];

  try {
    const snapshots = await Promise.all(keys.map((key) => settingsRef.doc(key).get()));
    const previousValues: Record<string, string> = {};
    snapshots.forEach((snapshot, index) => {
      previousValues[keys[index]] = snapshot.exists ? String(snapshot.data()?.value || "") : "";
    });

    const now = Date.now();
    const nowStr = String(now);
    const batch = firestore.batch();
    const setSetting = (key: string, value: string) => {
      batch.set(settingsRef.doc(key), { value });
    };

    setSetting("AUTO_POST_ENABLED", enabled ? "true" : "false");
    if (enabled) {
      setSetting("AUTO_POST_ENABLED_SINCE", nowStr);
      setSetting("AUTO_POST_WATERMARK_AT", nowStr);
      // Legacy field kept in sync so an old revision/rollback still behaves safely.
      setSetting("AUTO_POST_ENABLED_AT", nowStr);
      batch.delete(
        firestore
          .collection("users")
          .doc(userDataKey)
          .collection("cache")
          .doc("autoPostBaseline")
      );
    } else {
      setSetting("AUTO_POST_DISABLED_AT", nowStr);
      setSetting("AUTO_POST_ENABLED_AT", "");
    }

    const auditData = await getActorAuditData();
    batch.set(
      firestore
        .collection("users")
        .doc(userDataKey)
        .collection("settingAudit")
        .doc(),
      {
        settingKey: "AUTO_POST_ENABLED",
        action: enabled ? "enable_auto_post" : "disable_auto_post",
        previousValues: Object.fromEntries(
          Object.entries(previousValues).map(([key, value]) => [key, summarizeSettingValue(key, value)])
        ),
        newValues: {
          AUTO_POST_ENABLED: summarizeSettingValue("AUTO_POST_ENABLED", enabled ? "true" : "false"),
          AUTO_POST_ENABLED_SINCE: summarizeSettingValue(
            "AUTO_POST_ENABLED_SINCE",
            enabled ? nowStr : previousValues.AUTO_POST_ENABLED_SINCE
          ),
          AUTO_POST_WATERMARK_AT: summarizeSettingValue(
            "AUTO_POST_WATERMARK_AT",
            enabled ? nowStr : previousValues.AUTO_POST_WATERMARK_AT
          ),
        },
        changedAt: FieldValue.serverTimestamp(),
        changedAtMs: now,
        ...auditData,
      }
    );

    await batch.commit();
    revalidatePath("/");

    return {
      enabled,
      enabledSince: enabled ? nowStr : (previousValues.AUTO_POST_ENABLED_SINCE || previousValues.AUTO_POST_ENABLED_AT || ""),
    };
  } catch (e) {
    console.error("Firestore Error (setAutoPostEnabledSetting):", e);
    throw e;
  }
}

export async function getSocialNetworks() {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) return [];

  try {
    const snapshot = await firestore
      .collection("users")
      .doc(userDataKey)
      .collection("socialNetworks")
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        _docId: doc.id,
        name: data.name || doc.id,
        ...data,
      } as SocialNetwork;
    });
  } catch (e) {
    console.error("Firestore Error (getSocialNetworks):", e);
    return []; // Fallback empty array so Dashboard doesn't crash
  }
}

export async function saveSocialNetwork(
  docId: string,
  data: Record<string, any>
) {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) throw new Error("Unauthorized");

  // Ensure docId is a string
  const safeDocId = String(docId);

  try {
    await firestore
      .collection("users")
      .doc(userDataKey)
      .collection("socialNetworks")
      .doc(safeDocId)
      .set(data, { merge: true });

    revalidatePath("/");
  } catch (e) {
    console.error("Firestore Error (saveSocialNetwork):", e);
  }
}

export async function fetchLatestPost(link?: string): Promise<FetchPostResult> {
  try {
    const userDataKey = await getCurrentUserDataKey();
    if (!userDataKey) throw new Error("Unauthorized");

    const settings = await getUserSettings();
    const rapidApiKey = settings?.RAPIDAPI_KEY;
    if (!rapidApiKey) throw new Error("RAPIDAPI_KEY not configured in settings");

    let postResult: InstagramPost | null = null;
    let quota;
    if (link) {
      const { getInstagramPostByShortcode } = await import("@/lib/instagram");
       const match = link.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_\-]+)/i);
       const shortcode = match?.[1];
      if (!shortcode) throw new Error(`Invalid Instagram link: Could not find shortcode in ${link}`);
      const fetchRes = await getInstagramPostByShortcode(shortcode, rapidApiKey);
      postResult = fetchRes.post;
      quota = fetchRes.quota;
    } else {
       const { getLatestInstagramPost } = await import("@/lib/instagram");
      const usernameUrl = settings?.INSTAGRAM_URL || "https://instagram.com/username";
      const fetchRes = await getLatestInstagramPost(usernameUrl, rapidApiKey);
      postResult = fetchRes.post;
      quota = fetchRes.quota;
    }

    // Persist the fetched post so it survives hot reloads
    if (userDataKey) {
      try {
        if (quota) {
          const lastUpdated = Date.now();
          const resetEpochMs = quota.resetSeconds > 0 ? (lastUpdated + quota.resetSeconds * 1000) : 0;
          await firestore
            .collection("users")
            .doc(userDataKey)
            .collection("cache")
            .doc("instagramQuota")
            .set({ limit: quota.limit, remaining: quota.remaining, resetEpochMs, lastUpdated, resetSeconds: quota.resetSeconds });
        }
        if (postResult) {
          await firestore
            .collection("users")
            .doc(userDataKey)
            .collection("cache")
            .doc("lastPost")
            .set(postResult);
        }
      } catch (e) {
        console.error("Failed to cache post or quota:", e);
      }
    }

    if (!postResult) throw new Error("Empty response from Instagram API");
    return { ok: true, post: postResult };
  } catch (error) {
    const result = toFetchPostError(error);
    if (result.code === "INSTAGRAM_LINK_NOT_FOUND" || result.code === "INSTAGRAM_EMPTY_RESPONSE") {
      console.log(`Fetch latest Instagram post skipped: ${result.code} - ${result.message}`);
    } else {
      console.error("Fetch latest Instagram post failed:", error);
    }
    return result;
  }
}

export async function getLastPost() {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) return null;

  try {
    const doc = await firestore
      .collection("users")
      .doc(userDataKey)
      .collection("cache")
      .doc("lastPost")
      .get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error("Failed to get cached post:", e);
    return null;
  }
}

export async function getAutoPostedTracker(email: string): Promise<string[]> {
  try {
    const doc = await firestore
      .collection("users")
      .doc(email)
      .collection("cache")
      .doc("autoPosted")
      .get();

    if (doc.exists) {
      const data = doc.data();
      return Array.isArray(data?.postKeys) ? data.postKeys : [];
    }
  } catch (e) {
    console.error("Failed to get autoPosted tracker:", e);
  }
  return [];
}

export async function addPostToTracker(email: string, postKey: string) {
  try {
    const docRef = firestore
      .collection("users")
      .doc(email)
      .collection("cache")
      .doc("autoPosted");

    const doc = await docRef.get();
    let postKeys = [];
    if (doc.exists) {
      postKeys = doc.data()?.postKeys || [];
    }

    // Only keep last 100 to avoid document size issues over time
    postKeys = [postKey, ...postKeys].slice(0, 100);

    await docRef.set({ postKeys });
  } catch (e) {
    console.error("Failed to add post to tracker:", e);
  }
}

export async function adaptPostText(
  text: string,
  prompt: string,
  mainPrompt: string,
  model: string,
  network?: AdaptPostTextNetwork
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  
  const settings = await getUserSettings();
  const openAiKey = settings?.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("OPENAI_API_KEY not configured in settings");

  const { adaptText } = await import("@/lib/openai");
  const adapted = await adaptText(text, prompt, mainPrompt, model, openAiKey);

  if (!network) {
    return {
      ...adapted,
      shortened: false,
    };
  }

  const { ensurePublicationTextLimits } = await import("@/lib/publishingText");
  const limited = await ensurePublicationTextLimits({
    network,
    title: adapted.title,
    content: adapted.text,
    openAiKey,
    model,
    logContext: `${session.user.email || session.user.id || "user"} ${network.name || network.platform || "network"} after adaptation`,
  });

  return {
    title: limited.title,
    text: limited.content,
    shortened: limited.shortened,
    platform: limited.platform,
    platformLabel: limited.platformLabel,
  };
}

export async function deleteSocialNetwork(docId: string) {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) throw new Error("Unauthorized");

  try {
    await firestore
      .collection("users")
      .doc(userDataKey)
      .collection("socialNetworks")
      .doc(docId)
      .delete();

    revalidatePath("/");
  } catch (e) {
    console.error("Firestore Error (deleteSocialNetwork):", e);
  }
}

export async function publishPost(mediaUrls: string[], caption: string, accounts: number[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const settings = await getUserSettings();
  const token = settings?.POSTMYPOST_TOKEN;
  if (!token) throw new Error("POSTMYPOST_TOKEN not configured in settings");

  const { uploadMediaUrlsToPostMyPost, createPublication } = await import("@/lib/postmypost");
  
  const projectIdStr = settings?.POSTMYPOST_PROJECT_ID;
  if (!projectIdStr) throw new Error("POSTMYPOST_PROJECT_ID not configured in settings");
  const projectId = parseInt(projectIdStr, 10);

  const fileIds = await uploadMediaUrlsToPostMyPost(mediaUrls, token, projectId);

  // GAS used publication_status: 5 (Published?)
  const params = {
    project_id: projectId, 
    account_ids: accounts,
    content: caption,
    file_ids: fileIds,
    publication_status: 5 
  };

  return await createPublication(params, token);
}

function formatResetDate(resetEpochMs: number): string {
  if (!resetEpochMs) return "";
  const resetDate = new Date(resetEpochMs);
  const day = String(resetDate.getDate()).padStart(2, '0');
  const month = String(resetDate.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

function calculateCloudinaryRefreshDate(regDateStr: string): string {
  if (!regDateStr) return "";
  const regDate = new Date(regDateStr);
  if (isNaN(regDate.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - regDate.getTime();
  const periodMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  const periodsPassed = Math.floor(diffMs / periodMs);
  const nextReset = new Date(regDate.getTime() + (periodsPassed + 1) * periodMs);

  const day = String(nextReset.getDate()).padStart(2, '0');
  const month = String(nextReset.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

export async function getQuotas() {
  const userDataKey = await getCurrentUserDataKey();
  if (!userDataKey) throw new Error("Unauthorized");

  const settings = await getUserSettings();

  const metrics: any = {
    instagram: null,
    slideshow: null,
    instagramRefreshDate: null,
    slideshowRefreshDate: null
  };

  try {
    if (settings?.RAPIDAPI_KEY) {
      const doc = await firestore
        .collection("users")
        .doc(userDataKey)
        .collection("cache")
        .doc("instagramQuota")
        .get();

      if (doc.exists) {
        const quotaData = doc.data() as any;
        metrics.instagram = { limit: quotaData.limit, remaining: quotaData.remaining };
        if (quotaData.resetEpochMs > 0) {
          metrics.instagramRefreshDate = formatResetDate(quotaData.resetEpochMs);
        }
      }
    }
  } catch (e) {
    console.error("Failed to get Instagram quota:", e);
  }

  try {
    if (settings?.CLOUDINARY_CLOUD_NAME && settings?.CLOUDINARY_API_KEY && settings?.CLOUDINARY_API_SECRET) {
      const { getCloudinaryUsage } = await import("@/lib/cloudinary");
      metrics.slideshow = await getCloudinaryUsage({
        cloudName: settings.CLOUDINARY_CLOUD_NAME,
        apiKey: settings.CLOUDINARY_API_KEY,
        apiSecret: settings.CLOUDINARY_API_SECRET
      });
      // 30-дневный цикл от даты регистрации
      if (settings?.CLOUDINARY_REG_DATE) {
        metrics.slideshowRefreshDate = calculateCloudinaryRefreshDate(settings.CLOUDINARY_REG_DATE as string);
      }
    }
  } catch (e) {
    console.error("Failed to get Cloudinary usage:", e);
  }

  return metrics;
}
