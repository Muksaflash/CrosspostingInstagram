
import NextAuth from "next-auth";

import { FirestoreAdapter } from "@auth/firebase-adapter";
import { firestore } from "@/lib/firebase-admin";
import authConfig from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: FirestoreAdapter(firestore),
  session: { strategy: "jwt" }, // FirestoreAdapter + JWT to support Middleware check
});
