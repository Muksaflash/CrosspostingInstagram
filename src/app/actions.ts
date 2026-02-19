
"use server";

import { auth } from "@/auth";
import { firestore } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";

export async function getUserSettings() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const snapshot = await firestore
    .collection("users")
    .doc(session.user.id)
    .collection("settings")
    .get();

  const settings: Record<string, string> = {};
  snapshot.forEach((doc) => {
    settings[doc.id] = doc.data().value;
  });

  return settings;
}

export async function saveUserSetting(key: string, value: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await firestore
    .collection("users")
    .doc(session.user.id)
    .collection("settings")
    .doc(key)
    .set({ value });
  
  revalidatePath("/");
}

export async function getSocialNetworks() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const snapshot = await firestore
    .collection("users")
    .doc(session.user.id)
    .collection("socialNetworks")
    .get();

  return snapshot.docs.map((doc) => ({
    name: doc.id,
    ...doc.data(),
  }));
}

export async function saveSocialNetwork(name: string, data: { enabled: boolean; model: string; prompt: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await firestore
    .collection("users")
    .doc(session.user.id)
    .collection("socialNetworks")
    .doc(name)
    .set(data, { merge: true });

  revalidatePath("/");
}

export async function fetchLatestPost(link?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (link) {
     const { getInstagramPostByShortcode } = await import("@/lib/instagram");
     // Simple extraction
     const match = link.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_\-]+)/i);
     const shortcode = match?.[1];
     if (!shortcode) throw new Error("Invalid Instagram link");
     return await getInstagramPostByShortcode(shortcode);
  } else {
     const { getLatestInstagramPost } = await import("@/lib/instagram");
     // TODO: Get username from settings
     const usernameUrl = "https://instagram.com/username"; 
     return await getLatestInstagramPost(usernameUrl);
  }
}

export async function adaptPostText(text: string, prompt: string, model: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  
  const { adaptText } = await import("@/lib/openai");
  return await adaptText(text, prompt, model);
}

export async function publishPost(mediaUrls: string[], caption: string, accounts: number[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { uploadMediaToPostMyPost, createPublication } = await import("@/lib/postmypost");
  
  const fileIds = [];
  for (const url of mediaUrls) {
     const fileId = await uploadMediaToPostMyPost({ url });
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

  return await createPublication(params);
}

