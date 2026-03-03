import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { firestore } from "@/lib/firebase-admin";

export default async function TelegramLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth();
  
  const tokenParams = await searchParams;
  const token = typeof tokenParams.token === "string" ? tokenParams.token : undefined;

  // We need a token to proceed
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-6 text-center">
          <h2 className="text-2xl font-semibold text-red-600 mb-2">Invalid Link</h2>
          <p className="text-gray-600 dark:text-gray-300">
            This link is invalid or expired. Please return to Telegram and try again.
          </p>
        </div>
      </div>
    );
  }

  // If not logged in, force Google Login then come back here
  if (!session?.user) {
    redirect(`/api/auth/signin?callbackUrl=/tg-link?token=${token}`);
  }

  const userId = session.user.id;
  if (!userId) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-6 text-center">
          <h2 className="text-2xl font-semibold text-red-600 mb-2">Account Error</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Could not retrieve your user profile. Please try logging in again.
          </p>
        </div>
      </div>
    );
  }

  // 1. Find the token in Firestore
  let telegramId: string | null = null;
  try {
    const tokenDocRef = firestore.collection("telegramLinkTokens").doc(token);
    const tokenDoc = await tokenDocRef.get();

    if (!tokenDoc.exists) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
            <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-red-600 mb-2">Link Expired</h2>
              <p className="text-gray-600 dark:text-gray-300">
                This link has expired or was already used. Please start over from Telegram.
              </p>
            </div>
          </div>
        );
    }

    const data = tokenDoc.data();
    if (!data) throw new Error("Token data missing");
    
    // Check expiry
    if (new Date(data.expiresAt) < new Date()) {
        await tokenDocRef.delete(); // cleanup
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
            <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-6 text-center">
              <h2 className="text-2xl font-semibold text-red-600 mb-2">Link Expired</h2>
              <p className="text-gray-600 dark:text-gray-300">
                This link has expired. Please start over from Telegram.
              </p>
            </div>
          </div>
        );
    }

    telegramId = data.telegramId;
    
    // Cleanup token successfully used
    await tokenDocRef.delete();
    
    if (!telegramId) throw new Error("No Telegram ID in token");
    
    // 2. Link the telegram ID to the user document in the "users" collection
    const userDocRef = firestore.collection("users").doc(userId);
    await userDocRef.set({ telegramId }, { merge: true });

  } catch (error) {
    console.error("Error linking account:", error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-6 text-center">
          <h2 className="text-2xl font-semibold text-red-600 mb-2">System Error</h2>
          <p className="text-gray-600 dark:text-gray-300">
            We ran into an error while linking your account.
          </p>
        </div>
      </div>
    );
  }

  // Success UI
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Account Linked Successfully
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Your Telegram account is now connected to your Google profile. 
          You can close this browser window and return to Telegram.
        </p>
        
        {/* Simple deep link back to TG bots usually fails gracefully in non-mobile, so providing a clear manual instruction is best fallback */}
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          Please close this page.
        </p>
      </div>
    </div>
  );
}
