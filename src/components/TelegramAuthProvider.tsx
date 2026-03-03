"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Loader2, LogIn, CheckCircle2, RefreshCw } from "lucide-react";

type Phase = "detecting" | "link_prompt" | "waiting_for_link" | "retrying" | "authenticated";

export default function TelegramAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status, update: updateSession } = useSession();
  const pathname = usePathname();
  const [isTelegram, setIsTelegram] = useState(false);
  const [phase, setPhase] = useState<Phase>("detecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // Try to sign in with Telegram initData
  const attemptTelegramSignIn = useCallback(async () => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return false;

    try {
      const res = await signIn("telegram", {
        initData: tg.initData,
        redirect: false,
      });
      if (res?.ok && !res.error) {
        // Successfully authenticated — force session refresh
        await updateSession();

        if (pathname === "/login") {
          window.location.href = "/";
        }

        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [updateSession, pathname]);

  // Initial detection & auto-login attempt
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.Telegram?.WebApp?.initData
    ) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      setIsTelegram(true);

      if (status === "unauthenticated") {
        attemptTelegramSignIn().then((ok) => {
          if (!ok) {
            setPhase("link_prompt");
          }
        });
      }
    } else if (status !== "loading") {
      setPhase("link_prompt"); // not in TG, pass through
    }
  }, [status, attemptTelegramSignIn]);

  // Listen for visibility change (user returns from external browser)
  useEffect(() => {
    if (phase !== "waiting_for_link") return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      retryCountRef.current = 0;
      setPhase("retrying");
      setErrorMsg(null);

      // Poll a few times with delay — linking might not have propagated yet
      const tryWithRetry = async (): Promise<boolean> => {
        while (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const ok = await attemptTelegramSignIn();
          if (ok) return true;
          // Wait before next attempt (increasing delay)
          await new Promise((r) => setTimeout(r, 1500 * retryCountRef.current));
        }
        return false;
      };

      const linked = await tryWithRetry();
      if (!linked) {
        setPhase("link_prompt");
        setErrorMsg("Аккаунт ещё не привязан. Попробуйте снова.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [phase, attemptTelegramSignIn]);

  // Handle "Link via Google" click
  const handleGoogleLink = async () => {
    try {
      setErrorMsg(null);
      const tg = window.Telegram.WebApp;

      const res = await fetch("/api/telegram/link-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });

      if (!res.ok) {
        throw new Error("Не удалось начать привязку");
      }

      const { url } = await res.json();

      // Switch to waiting phase BEFORE opening external browser
      setPhase("waiting_for_link");

      // Open the external browser for Google login
      tg.openLink(url);
    } catch (err: any) {
      console.error("Link error:", err);
      setErrorMsg(err.message || "Произошла ошибка");
      setPhase("link_prompt");
    }
  };

  // --- RENDER ---

  // Already authenticated
  if (session?.user) {
    return <>{children}</>;
  }

  // Loading session
  if (status === "loading" || phase === "detecting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Not in Telegram — pass through to standard auth
  if (!isTelegram) {
    return <>{children}</>;
  }

  // Phase: Retrying after return from browser
  if (phase === "retrying") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Проверяем привязку...
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Попытка {retryCountRef.current} из {maxRetries}
          </p>
        </div>
      </div>
    );
  }

  // Phase: Waiting for user to complete linking in external browser
  if (phase === "waiting_for_link") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mb-6">
            <RefreshCw className="w-8 h-8 text-yellow-600 dark:text-yellow-400 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            Завершите вход в браузере
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
            Мы открыли браузер для входа через Google. После завершения вернитесь сюда — мы автоматически подхватим вашу привязку.
          </p>
          <button
            onClick={async () => {
              setPhase("retrying");
              const ok = await attemptTelegramSignIn();
              if (!ok) {
                setPhase("link_prompt");
                setErrorMsg("Аккаунт ещё не привязан. Попробуйте снова.");
              }
            }}
            className="w-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-zinc-700 flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            Я завершил вход, проверить
          </button>
        </div>
      </div>
    );
  }

  // Phase: Show initial "Link via Google" prompt
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow rounded-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Добро пожаловать!
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          Для начала работы нужно привязать ваш Telegram к Google-аккаунту.
          Это делается один раз.
        </p>

        <button
          onClick={handleGoogleLink}
          className="w-full bg-black text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-800 flex items-center justify-center gap-2 transition-colors"
        >
          <LogIn className="w-5 h-5" />
          Войти через Google
        </button>

        {errorMsg && (
          <p className="mt-4 text-sm text-red-500">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
