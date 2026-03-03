import { NextResponse } from "next/server";
import { firestore } from "@/lib/firebase-admin";
import { getRecentInstagramPosts } from "@/lib/instagram";
import { adaptText } from "@/lib/openai";
import { uploadMediaUrlsToPostMyPost, createPublication } from "@/lib/postmypost";
import { createCloudinarySlideshowUrl } from "@/lib/cloudinary";
import { getAutoPostedTracker, addPostToTracker } from "@/app/actions";

export const maxDuration = 300; // Allow 5 mins for cron execution if on Vercel Pro
export const dynamic = 'force-dynamic'; // Ensure it's not cached

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // Secure the endpoint so only we can trigger it
    if (secret !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const usersSnapshot = await firestore.collection("users").get();
    let totalProcessed = 0;
    let totalPublished = 0;

    for (const userDoc of usersSnapshot.docs) {
      const email = userDoc.id;
      
      // Get user settings
      const settingsSnapshot = await userDoc.ref.collection("settings").get();
      const settings: Record<string, string> = {};
      settingsSnapshot.forEach(doc => {
        settings[doc.id] = doc.data().value;
      });

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
      let recentPosts;
      try {
        recentPosts = await getRecentInstagramPosts(instagramUrl, rapidApiKey);
      } catch (err: any) {
        console.error(`Error fetching Instagram for ${email}:`, err.message);
        continue;
      }

      // Filter eligible posts
      const trackers = await getAutoPostedTracker(email);
      const eligiblePosts = recentPosts.filter(post => {
        // Must be taken AFTER the toggle was turned on
        // Note: Instagram takenAt is in seconds usually. If we save Date.now() in JS (ms), we need to compare properly.
        // Let's assume Instagram takenAt is in UNIX seconds. Date.now() is in ms.
        const postTimeMs = post.takenAt * 1000;
        if (postTimeMs < enabledAtTime) return false;

        // Must not be already posted
        if (trackers.includes(post.postKey)) return false;

        return true;
      });

      if (eligiblePosts.length === 0) continue;

      // We should post them from oldest to newest (to preserve chronological order if multiple are missed)
      eligiblePosts.sort((a, b) => a.takenAt - b.takenAt);

      // Get user's social networks
      const networksSnapshot = await userDoc.ref.collection("socialNetworks").get();
      const userNetworks = networksSnapshot.docs.map(doc => ({
        _docId: doc.id,
        ...doc.data()
      })) as any[];

      const activeNetworks = userNetworks.filter(n => n.enabled && n.prompt && n.name.toLowerCase() !== 'instagram');
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
          const filter = pubSettings.contentFilter || 'none';
          if (filter === 'only_reels' && !isSingleVideo) continue;
          if (filter === 'exclude_reels' && isSingleVideo) continue;

          let useSlideshow = false;
          const mode = pubSettings.slideshowMode || 'auto';
          if (mode === 'always') useSlideshow = true;
          else if (mode === 'auto') {
            const platform = (net.platform || net.name).toLowerCase();
            if (['reddit', 'tiktok', 'reels', 'youtube'].some(p => platform.includes(p))) {
              if (mediaUrls.length > 1) useSlideshow = true;
            } else if (['linkedin', 'pinterest'].some(p => platform.includes(p))) {
              if (isMixed && mediaUrls.length > 1) useSlideshow = true;
            }
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
                const slideUrl = await createCloudinarySlideshowUrl(mediaUrls, cloudinaryConf);
                fileIdsSlideshow = await uploadMediaUrlsToPostMyPost([slideUrl], postMyPostToken, ppmProjectId);
             }
             currentFileIds = fileIdsSlideshow;
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
          if (pubSettings.pinterestLink && (net.platform || net.name).toLowerCase().includes('pinterest')) {
             detail.link = pubSettings.pinterestLink;
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
