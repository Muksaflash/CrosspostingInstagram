
"use server";

import { auth } from "@/auth";
import { firestore } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";

export async function getUserSettings() {
  const session = await auth();
  if (!session?.user?.email) return null;

  try {
    const snapshot = await firestore
      .collection("users")
      .doc(session.user.email)
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
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");

  try {
    await firestore
      .collection("users")
      .doc(session.user.email)
      .collection("settings")
      .doc(key)
      .set({ value });

    revalidatePath("/");
  } catch (e) {
    console.error("Firestore Error (saveUserSetting):", e);
  }
}

export async function getSocialNetworks() {
  const session = await auth();
  if (!session?.user?.email) return [];

  try {
    const snapshot = await firestore
      .collection("users")
      .doc(session.user.email)
      .collection("socialNetworks")
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        _docId: doc.id,
        name: data.name || doc.id,
        ...data,
      };
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
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");

  // Ensure docId is a string
  const safeDocId = String(docId);

  try {
    await firestore
      .collection("users")
      .doc(session.user.email)
      .collection("socialNetworks")
      .doc(safeDocId)
      .set(data, { merge: true });

    revalidatePath("/");
  } catch (e) {
    console.error("Firestore Error (saveSocialNetwork):", e);
  }
}

export async function fetchLatestPost(link?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const settings = await getUserSettings();
  const rapidApiKey = settings?.RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error("RAPIDAPI_KEY not configured in settings");

  let result;
  if (link) {
    const { getInstagramPostByShortcode } = await import("@/lib/instagram");
     const match = link.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_\-]+)/i);
     const shortcode = match?.[1];
    if (!shortcode) throw new Error(`Invalid Instagram link: Could not find shortcode in ${link}`);
    result = await getInstagramPostByShortcode(shortcode, rapidApiKey);
  } else {
     const { getLatestInstagramPost } = await import("@/lib/instagram");
    const usernameUrl = settings?.INSTAGRAM_URL || "https://instagram.com/username";
    result = await getLatestInstagramPost(usernameUrl, rapidApiKey);
  }

  // Persist the fetched post so it survives hot reloads
  if (result && session.user.email) {
    try {
      await firestore
        .collection("users")
        .doc(session.user.email)
        .collection("cache")
        .doc("lastPost")
        .set(result);
    } catch (e) {
      console.error("Failed to cache last post:", e);
    }
  }

  return result;
}

export async function getLastPost() {
  const session = await auth();
  if (!session?.user?.email) return null;

  try {
    const doc = await firestore
      .collection("users")
      .doc(session.user.email)
      .collection("cache")
      .doc("lastPost")
      .get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error("Failed to get cached post:", e);
    return null;
  }
}

export async function adaptPostText(text: string, prompt: string, mainPrompt: string, model: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  
  const settings = await getUserSettings();
  const openAiKey = settings?.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("OPENAI_API_KEY not configured in settings");

  const { adaptText } = await import("@/lib/openai");
  return await adaptText(text, prompt, mainPrompt, model, openAiKey);
}

export async function deleteSocialNetwork(docId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");

  try {
    await firestore
      .collection("users")
      .doc(session.user.email)
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

  const { uploadMediaToPostMyPost, createPublication } = await import("@/lib/postmypost");
  
  const fileIds = [];
  for (const url of mediaUrls) {
    const fileId = await uploadMediaToPostMyPost({ url }, token, 320499);
     fileIds.push(fileId);
  }

  // GAS used publication_status: 5 (Published?)
  const params = {
    project_id: 320499, 
    account_ids: accounts,
    content: caption,
    file_ids: fileIds,
    publication_status: 5 
  };

  return await createPublication(params, token);
}

function calculateNextRefreshDate(billingDay: number): string {
  if (!billingDay || billingDay < 1 || billingDay > 31) return "";
  const now = new Date();

  let refreshDate = new Date(now.getFullYear(), now.getMonth(), billingDay);
  if (now > refreshDate) {
    refreshDate = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
  }

  return refreshDate.toLocaleDateString("ru-RU", { day: '2-digit', month: '2-digit' });
}

export async function getQuotas() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const settings = await getUserSettings();

  const metrics: any = {
    instagram: null,
    slideshow: null,
    instagramRefreshDate: null,
    slideshowRefreshDate: null
  };

  try {
    if (settings?.RAPIDAPI_KEY) {
      const { getInstagramQuota } = await import("@/lib/instagram");
      metrics.instagram = await getInstagramQuota(settings.RAPIDAPI_KEY);
      if (settings?.RAPIDAPI_BILLING_DAY) {
        metrics.instagramRefreshDate = calculateNextRefreshDate(Number(settings.RAPIDAPI_BILLING_DAY));
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
      if (settings?.CLOUDINARY_BILLING_DAY) {
        metrics.slideshowRefreshDate = calculateNextRefreshDate(Number(settings.CLOUDINARY_BILLING_DAY));
      }
    }
  } catch (e) {
    console.error("Failed to get Cloudinary usage:", e);
  }

  return metrics;
}
