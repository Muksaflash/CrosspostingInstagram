
import Google from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import { validateTelegramData } from "./app/api/telegram/link-init/route";
import { firestore } from "./lib/firebase-admin";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
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
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
          token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    }
  }
};
