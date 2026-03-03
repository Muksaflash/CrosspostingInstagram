"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Loader2, LogIn } from "lucide-react";

export default function TelegramAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const [isTelegram, setIsTelegram] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check if we are inside Telegram Mini App
    if (
      typeof window !== "undefined" &&
      window.Telegram &&
      window.Telegram.WebApp &&
      window.Telegram.WebApp.initData
    ) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      setIsTelegram(true);

      // Attempt automatic sign-in if unauthenticated
      if (status === "unauthenticated" && !isLinking) {
        signIn("telegram", {
          initData: tg.initData,
          redirect: false,
        }).then((res) => {
          if (res?.error) {
            // Means the account is not linked yet
            console.log("Telegram auth failed, account likely not linked");
          }
        }).catch(err => {
             console.error("Auto signin error:", err);
        });
      }
    }
  }, [status, isLinking]);

  const handleGoogleLink = async () => {
    try {
      setIsLinking(true);
      setErrorMsg(null);
      const tg = window.Telegram.WebApp;
      
      const res = await fetch("/api/telegram/link-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });

      if (!res.ok) {
        throw new Error("Failed to initialize link");
      }

      const { url } = await res.json();
      
      // Open the external browser for Google login
      tg.openLink(url);
      
      // We don't eagerly flip isLinking to false because they are now in an external browser. 
      // They will return here and refresh, or we can provide a manual refresh button.
    } catch (err: any) {
      console.error("Link error:", err);
      setErrorMsg(err.message || "Failed to start linking process");
      setIsLinking(false);
    }
  };

  // 1. Still loading from Auth
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // 2. Authenticated (either via normal Google or automatic Telegram Link)
  if (session?.user) {
    return <>{children}</>;
  }

  // 3. Not authenticated, BUT we are in Telegram -> show Link UI
  if (isTelegram) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-6">
             <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
             </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Welcome to PostMyPost Bot
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            To use this Mini App, you need to link your Telegram account with your Google profile. 
            This is a one-time secure process.
          </p>
          
          <button
            onClick={handleGoogleLink}
            disabled={isLinking}
            className="w-full bg-black text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {isLinking ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {isLinking ? "Opening Browser..." : "Link via Google"}
          </button>
          
          {isLinking && (
             <button
               onClick={() => window.location.reload()}
               className="mt-6 text-sm text-blue-600 underline hover:text-blue-800"
             >
                I have already linked it, refresh page
             </button>
          )}

          {errorMsg && (
            <p className="mt-4 text-sm text-red-500">
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 4. Not authenticated, and NOT in Telegram -> show standard behavior
  // In a normal app, we might redirect to /api/auth/signin here, 
  // or let the specific pages handle it. Assuming `children` handles standard unauthed state (or redirect).
  return <>{children}</>;
}
