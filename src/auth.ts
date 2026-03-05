import NextAuth from "next-auth";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { firestore } from "@/lib/firebase-admin";
import { authConfig } from "./auth.config";
import CredentialsProvider from "next-auth/providers/credentials";
import { validateTelegramData } from "@/lib/telegram";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    CredentialsProvider({
      id: "telegram",
      name: "Telegram",
      credentials: {
        initData: { label: "Telegram Init Data", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.initData || typeof credentials.initData !== "string") {
          return null;
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          console.error("Missing TELEGRAM_BOT_TOKEN");
          return null;
        }

        const isValid = await validateTelegramData(credentials.initData, botToken);
        if (!isValid) {
          console.error("Invalid Telegram data signature");
          return null;
        }

        const urlParams = new URLSearchParams(credentials.initData);
        const userStr = urlParams.get("user");
        if (!userStr) return null;

        try {
          const tgUser = JSON.parse(userStr);
          const telegramId = tgUser.id.toString();

          // Search Firestore for a user with this telegramId
          const usersRef = firestore.collection("users");
          const snapshot = await usersRef.where("telegramId", "==", telegramId).limit(1).get();

          if (snapshot.empty) {
            // User has not linked their Google account yet
            return null;
          }

          const userDoc = snapshot.docs[0];
          const userData = userDoc.data();

          return {
            id: userDoc.id,
            name: userData.name || null,
            email: userData.email || null,
            image: userData.image || null,
          };
        } catch (e) {
          console.error("Error authorizing Telegram user:", e);
          return null;
        }
      }
    })
  ],
  adapter: FirestoreAdapter(firestore),
  session: { strategy: "jwt" },
});
