import { NextResponse } from "next/server";
import { firestore } from "@/lib/firebase-admin";
import { safeCompare } from "@/lib/security";
import { getRecentInstagramPosts, type InstagramPost } from "@/lib/instagram";
import { type SocialNetwork } from "@/lib/types";
import { adaptText } from "@/lib/openai";
import { uploadMediaUrlsToPostMyPost, createPublication } from "@/lib/postmypost";
import { createCloudinarySlideshowUrl } from "@/lib/cloudinary";
import { getAutoPostedTracker, addPostToTracker } from "@/app/actions";

export const maxDuration = 300; // Allow 5 mins for cron execution if on Vercel Pro
export const dynamic = 'force-dynamic'; // Ensure it's not cached

/**
 * Checks if a post is eligible for auto-posting.
 */
function isPostEligible(post: InstagramPost, enabledAtTime: number, trackers: string[]): boolean {
  const postTimeMs = post.takenAt * 1000;
  if (postTimeMs < enabledAtTime) return false;
  if (trackers.includes(post.postKey)) return false;
  return true;
}

/**
 * Comparator to sort posts from oldest to newest.
 */
function comparePostsByTakenAt(a: InstagramPost, b: InstagramPost): number {
  return a.takenAt - b.takenAt;
}

/**
 * Maps a Firestore document to a SocialNetwork object.
 */
function mapDocToSocialNetwork(doc: any): SocialNetwork {
  return {
    _docId: doc.id,
    ...doc.data()
  } as SocialNetwork;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // Secure the endpoint so only we can trigger it
    if (!safeCompare(secret, process.env.CRON_SECRET)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const usersSnapshot = await firestore.collection("users").get();

    // Optimization: Fetch all settings at once to avoid N+1 queries
    const allSettingsSnapshot = await firestore.collectionGroup("settings").get();
    const settingsByEmail: Record<string, Record<string, string>> = {};

    allSettingsSnapshot.docs.forEach(doc => {
      // The path is users/{email}/settings/{settingId}
      // doc.ref.parent is the 'settings' collection
      // doc.ref.parent.parent is the user document
      const userDocRef = doc.ref.parent.parent;
      if (userDocRef && userDocRef.parent.id === "users") {
        const email = userDocRef.id;
        if (email && email.includes('@')) {
          if (!settingsByEmail[email]) {
            settingsByEmail[email] = {};
          }
          settingsByEmail[email][doc.id] = doc.data().value;
        }
      }
    });

    let totalProcessed = 0;
    let totalPublished = 0;
    const processedEmails = new Set<string>();

    for (const userDoc of usersSnapshot.docs) {
      // NextAuth stores users with auto-generated doc IDs, but the dashboard
      // saves settings/socialNetworks under users/{email}. We need to read the
      // email from the user document data and use it to look up everything.
      const userData = userDoc.data();
      const email = userData?.email || userDoc.id;
      if (!email || !email.includes('@')) {
        continue; // Skip documents that aren't real user records
      }
      if (processedEmails.has(email)) continue; // Avoid processing same user twice
      processedEmails.add(email);

      // Settings are retrieved from the pre-fetched map
      const settings = settingsByEmail[email] || {};

      // Check if auto-posting is actually enabled for this user
      const autoPostEnabledAtStr = settings["AUTO_POST_ENABLED_AT"];
      if (!autoPostEnabledAtStr) {
        continue; // Auto-posting is turned off
      }

      const enabledAtTime = parseInt(autoPostEnabledAtStr, 10);
      if (isNaN(enabledAtTime)) continue;

      const instagramUrl = settings["INSTAGRAM_URL"];
      const rapidApiKey = settings["RAPIDAPI_KEY"];
      const postMyPostToken = settings["POSTMYPOST_TOKEN"];
      const ppmProjectId = Number(settings["POSTMYPOST_PROJECT_ID"]);
      const openAiKey = settings["OPENAI_API_KEY"];
      const openAiModel = settings["OPENAI_MODEL"] || "gpt-5.2";
      const mainPrompt = settings["MAIN_PROMPT"] || "";

      if (!instagramUrl || !rapidApiKey || !postMyPostToken || !ppmProjectId || !openAiKey) {
        console.warn(`User ${email} is missing required API keys for auto-posting.`);
        continue;
      }

      totalProcessed++;

      // Fetch recent posts
      let fetchedData;
      try {
        fetchedData = await getRecentInstagramPosts(instagramUrl, rapidApiKey);
      } catch (err: any) {
        console.error(`Error fetching Instagram for ${email}:`, err.message);
        continue;
      }

      // Save RapidAPI quota
      try {
        const lastUpdated = Date.now();
        const resetEpochMs = fetchedData.quota.resetSeconds > 0 ? (lastUpdated + fetchedData.quota.resetSeconds * 1000) : 0;
        await firestore
          .collection("users")
          .doc(email)
          .collection("cache")
          .doc("instagramQuota")
          .set({
            limit: fetchedData.quota.limit,
            remaining: fetchedData.quota.remaining,
            resetEpochMs,
            lastUpdated,
            resetSeconds: fetchedData.quota.resetSeconds
          });
      } catch (e) {
        console.error(`Failed to cache quota for ${email}:`, e);
      }

      // Filter eligible posts
      const trackers = await getAutoPostedTracker(email);
      const eligiblePosts = fetchedData.posts.filter((post: InstagramPost) =>
        isPostEligible(post, enabledAtTime, trackers)
      );

      if (eligiblePosts.length === 0) continue;

      // We should post them from oldest to newest (to preserve chronological order if multiple are missed)
      eligiblePosts.sort(comparePostsByTakenAt);

      // Get user's social networks (also stored under users/{email})
      const networksSnapshot = await firestore.collection("users").doc(email).collection("socialNetworks").get();
      const userNetworks = networksSnapshot.docs.map(mapDocToSocialNetwork);

      const activeNetworks = userNetworks.filter(n => n.enabled && n.prompt && n.name.toLowerCase() !== "instagram");
      if (activeNetworks.length === 0) continue;

      for (const post of eligiblePosts) {
        console.log(`Auto-posting postKey ${post.postKey} for user ${email}`);
        totalPublished++;
        
        // --- 1. Adapt text for each active network --- //
        const adaptedNetworks = [];
        for (const net of activeNetworks) {
          try {
            const adapted = await adaptText(post.caption, net.prompt, mainPrompt, openAiModel, openAiKey);
            adaptedNetworks.push({
              ...net,
              adaptedTitle: adapted.title,
              adaptedText: adapted.text
            });
          } catch (e: any) {
            console.error(`Error adapting text for ${net.name} (${email}):`, e.message);
          }
        }

        if (adaptedNetworks.length === 0) continue;

        // --- 2. Publish to PostMyPost logic (similar to route.ts) --- //
        const mediaUrls = post.mediaUrls;
        const hasVideo = mediaUrls.some((u: string) => /\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
        const hasImage = mediaUrls.some((u: string) => !/\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
        const isSingleVideo = mediaUrls.length === 1 && hasVideo;
        const isMixed = hasVideo && hasImage;

        let fileIdsOriginal: string[] | null = null;
        let fileIdsSlideshow: string[] | null = null;
        const accountIds: string[] = [];
        const details: any[] = [];

        for (const net of adaptedNetworks) {
          const pubSettings = net.publishingSettings || {};

          const isSingleImage = !hasVideo && mediaUrls.length === 1;
          const isPhotoCarousel = !hasVideo && mediaUrls.length > 1;

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

          let useSlideshow = false;
          let mode = pubSettings.slideshowMode || 'auto';

          const isAuto = !Array.isArray(mode) && mode !== 'never' && mode !== 'always';

          if (isAuto) {
            const platform = (net.platform || net.name).toLowerCase();
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

          let currentFileIds: string[] = [];
          if (useSlideshow) {
             if (!fileIdsSlideshow) {
                const cloudinaryConf = {
                  cloudName: settings["CLOUDINARY_CLOUD_NAME"],
                  apiKey: settings["CLOUDINARY_API_KEY"],
                  apiSecret: settings["CLOUDINARY_API_SECRET"]
                };
                if (!cloudinaryConf.cloudName || !cloudinaryConf.apiKey || !cloudinaryConf.apiSecret) {
                  console.warn(`Cloudinary settings missing for ${net.name} (${email})`);
                  continue;
                }
               try {
                  const slideUrl = await createCloudinarySlideshowUrl(mediaUrls, cloudinaryConf);
                  fileIdsSlideshow = await uploadMediaUrlsToPostMyPost([slideUrl], postMyPostToken, ppmProjectId);
                } catch (slideErr: any) {
                  console.error(`Slideshow creation failed for ${net.name} (${email}):`, slideErr.message);
                  // Fall back to original media for this network
                  if (!fileIdsOriginal) {
                    fileIdsOriginal = await uploadMediaUrlsToPostMyPost(mediaUrls, postMyPostToken, ppmProjectId);
                  }
                currentFileIds = fileIdsOriginal;
              }
            }
            if (fileIdsSlideshow) currentFileIds = fileIdsSlideshow;
            else if (!currentFileIds.length) {
              // Slideshow failed and fallback wasn't set
              if (!fileIdsOriginal) {
                fileIdsOriginal = await uploadMediaUrlsToPostMyPost(mediaUrls, postMyPostToken, ppmProjectId);
              }
              currentFileIds = fileIdsOriginal;
            }
          } else {
             if (!fileIdsOriginal) {
                fileIdsOriginal = await uploadMediaUrlsToPostMyPost(mediaUrls, postMyPostToken, ppmProjectId);
             }
             currentFileIds = fileIdsOriginal;
          }

          accountIds.push(net.accountId);
          const pubType = Number(pubSettings.publicationType || 1);
          
          const detail: any = {
            account_id: net.accountId,
            publication_type: pubType,
            content: net.adaptedText || post.caption || '',
            file_ids: currentFileIds
          };

          if (net.adaptedTitle) detail.title = net.adaptedTitle;
          const effectivePinLink = pubSettings.pinterestLink || settings["PINTEREST_LINK"] || '';
          if (effectivePinLink && (net.platform || net.name).toLowerCase().includes('pinterest')) {
            detail.link = effectivePinLink;
          }
          if ((net.platform || net.name).toLowerCase().includes('tiktok')) {
            detail.tiktok_privacy_status = pubSettings.tiktokPrivacyStatus ?? 1;
            detail.tiktok_comment = pubSettings.tiktokComment ?? true;
            detail.tiktok_duet = pubSettings.tiktokDuet ?? true;
            detail.tiktok_stitch = pubSettings.tiktokStitch ?? true;
          }

          details.push(detail);
        }

        if (details.length === 0) continue;

        // Post to PostMyPost
        const payload: any = {
          project_id: ppmProjectId,
          account_ids: accountIds,
          publication_status: 5,
          post_at: new Date().toISOString(),
          details: details
        };

        try {
          await createPublication(payload, postMyPostToken);
          // Mark as posted permanently
          await addPostToTracker(email, post.postKey);
          console.log(`Successfully auto-posted ${post.postKey} to PMP. Tracker updated.`);

          // Update UI state so the user can see what was auto-posted
          try {
            // Update lastPost
            await firestore
              .collection("users")
              .doc(email)
              .collection("cache")
              .doc("lastPost")
              .set(post);

            // Update social networks with the adapted text
            const batch = firestore.batch();
            for (const net of adaptedNetworks) {
              if (net._docId) {
                const netRef = firestore
                  .collection("users")
                  .doc(email)
                  .collection("socialNetworks")
                  .doc(net._docId);
                batch.update(netRef, {
                  adaptedText: net.adaptedText || "",
                  adaptedTitle: net.adaptedTitle || ""
                });
              }
            }
            await batch.commit();
            console.log(`Successfully updated UI state for auto-posted post ${post.postKey}`);
          } catch (uiErr: any) {
            console.error(`Failed to update UI state for ${post.postKey}:`, uiErr.message);
          }
        } catch (err: any) {
             console.error(`Failed to publish ${post.postKey} to PMP:`, err.message);
        }
      }
    }

    return NextResponse.json({ 
      status: "success", 
      message: `Processed ${totalProcessed} users. Published ${totalPublished} posts.` 
    });

  } catch (error: any) {
    console.error("Cron Auto-Post Root Error:", error);
    return new NextResponse(error.message || "Internal Server Error", { status: 500 });
  }
}
