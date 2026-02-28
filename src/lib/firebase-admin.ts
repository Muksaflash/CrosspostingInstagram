
import admin from 'firebase-admin';

if (!admin.apps.length) {
  let credential = admin.credential.applicationDefault();
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
  }
  admin.initializeApp({
    credential,
  });
}

export const firestore = admin.firestore();
export const auth = admin.auth();
