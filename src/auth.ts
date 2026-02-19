
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { firestore } from "@/lib/firebase-admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  adapter: FirestoreAdapter(firestore),
  session: {
    strategy: "jwt", // Firestore Adapter usually works with database sessions, but JWT is often easier for serverless if adapter supports it. 
    // Adapters usually enforcing database strategy. Let's stick to default (database) if adapter is used, or JWT if we want stateless.
    // Cloud Run is stateless, but Firestore is external db. Database sessions are fine.
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
