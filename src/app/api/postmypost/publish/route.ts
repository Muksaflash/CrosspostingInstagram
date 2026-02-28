import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSettings } from "@/app/actions";
import { uploadMediaUrlsToPostMyPost, createPublication } from "@/lib/postmypost";
import { createCloudinarySlideshowUrl } from "@/lib/cloudinary";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const { networks, mediaUrls, originalCaption, postAt } = body;

    const settings = await getUserSettings();
    const token = settings?.POSTMYPOST_TOKEN;
    const projectId = Number(settings?.POSTMYPOST_PROJECT_ID);

    if (!token || !projectId) {
      return new NextResponse("PostMyPost Token or Project ID not configured", { status: 400 });
    }

    if (!networks || !networks.length) {
      return new NextResponse("No networks provided", { status: 400 });
    }
    if (!mediaUrls || !mediaUrls.length) {
      return new NextResponse("No media provided", { status: 400 });
    }

    const hasVideo = mediaUrls.some((u: string) => /\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
    const hasImage = mediaUrls.some((u: string) => !/\.(mp4|mov|avi|webm)(?:\?|$)/i.test(u));
    const isSingleVideo = mediaUrls.length === 1 && hasVideo;
    const isMixed = hasVideo && hasImage;

    // Cache uploaded file IDs to avoid duplicate work
    let fileIdsOriginal: string[] | null = null;
    let fileIdsSlideshow: string[] | null = null;

    const accountIds: string[] = [];
    const details: any[] = [];

    for (const net of networks) {
      const pubSettings = net.publishingSettings || {};
      
      // Filter logic
      const filter = pubSettings.contentFilter || 'none';
      if (filter === 'only_reels' && !isSingleVideo) continue;
      if (filter === 'exclude_reels' && isSingleVideo) continue;

      // Slideshow Mode
      const mode = pubSettings.slideshowMode || 'auto';
      let useSlideshow = false;
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
            cloudName: settings.CLOUDINARY_CLOUD_NAME,
            apiKey: settings.CLOUDINARY_API_KEY,
            apiSecret: settings.CLOUDINARY_API_SECRET
          };
          if (!cloudinaryConf.cloudName || !cloudinaryConf.apiKey || !cloudinaryConf.apiSecret) {
            throw new Error(`Cloudinary settings missing for slideshow generation (required for ${net.name})`);
          }
          const slideUrl = await createCloudinarySlideshowUrl(mediaUrls, cloudinaryConf);
          fileIdsSlideshow = await uploadMediaUrlsToPostMyPost([slideUrl], token, projectId);
        }
        currentFileIds = fileIdsSlideshow;
      } else {
        if (!fileIdsOriginal) {
          fileIdsOriginal = await uploadMediaUrlsToPostMyPost(mediaUrls, token, projectId);
        }
        currentFileIds = fileIdsOriginal;
      }

      accountIds.push(net.accountId);

      const pubType = Number(pubSettings.publicationType || 1);
      
      const detail: any = {
        account_id: net.accountId,
        publication_type: pubType,
        content: net.adaptedText || originalCaption || '',
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

    if (details.length === 0) {
      return new NextResponse("All networks were skipped due to content filters", { status: 400 });
    }

    const payload: any = {
      project_id: projectId,
      account_ids: accountIds,
      publication_status: 5,
      post_at: postAt || new Date().toISOString(),
      details: details
    };

    console.log("Publishing payload:", JSON.stringify(payload, null, 2));

    const pubRes = await createPublication(payload, token);
    return NextResponse.json(pubRes);

  } catch (error: any) {
    console.error("Publish Error Root Cause:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
