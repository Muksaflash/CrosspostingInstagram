import { NextResponse } from "next/server";
import { firestore } from "@/lib/firebase-admin";
import { safeCompare } from "@/lib/security";
import { cleanupOldCloudinaryAssets } from "@/lib/cloudinary";

export const maxDuration = 300; // Allow 5 mins for cron execution if on Vercel Pro
export const dynamic = 'force-dynamic'; // Ensure it's not cached

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // Secure the endpoint so only we can trigger it
    if (!safeCompare(secret, process.env.CRON_SECRET)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const usersSnapshot = await firestore.collection("users").get();
    let totalUsersProcessed = 0;
    let totalImagesDeleted = 0;
    let totalVideosDeleted = 0;

    for (const userDoc of usersSnapshot.docs) {
      const email = userDoc.id;
      
      // Get user settings
      const settingsSnapshot = await userDoc.ref.collection("settings").get();
      const settings: Record<string, string> = {};
      settingsSnapshot.forEach(doc => {
        settings[doc.id] = doc.data().value;
      });

      const cloudName = settings["CLOUDINARY_CLOUD_NAME"] || process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = settings["CLOUDINARY_API_KEY"] || process.env.CLOUDINARY_API_KEY;
      const apiSecret = settings["CLOUDINARY_API_SECRET"] || process.env.CLOUDINARY_API_SECRET;

      // Skip users without Cloudinary configured
      if (!cloudName || !apiKey || !apiSecret) {
        continue;
      }

      totalUsersProcessed++;
      console.log(`Starting Cloudinary cleanup for user ${email}`);

      try {
        const conf = { cloudName, apiKey, apiSecret };
        // Delete assets older than 24 hours
        const { deletedImages, deletedVideos } = await cleanupOldCloudinaryAssets(conf, 24);
        
        totalImagesDeleted += deletedImages;
        totalVideosDeleted += deletedVideos;
        
        console.log(`Finished cleanup for ${email}: Deleted ${deletedImages} images, ${deletedVideos} videos`);
      } catch (err: any) {
        console.error(`Error cleaning up Cloudinary for ${email}:`, err.message);
      }
    }

    return NextResponse.json({ 
      status: "success", 
      message: `Processed ${totalUsersProcessed} users. Deleted ${totalImagesDeleted} images and ${totalVideosDeleted} videos.` 
    });

  } catch (error: any) {
    console.error("Cron Cleanup Root Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
