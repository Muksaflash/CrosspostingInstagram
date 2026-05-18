
import admin from 'firebase-admin';

function getCredential() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey && !process.env.K_SERVICE) {
    try {
      return admin.credential.cert(JSON.parse(serviceAccountKey));
    } catch (e) {
      console.warn("Invalid FIREBASE_SERVICE_ACCOUNT_KEY, falling back to application default credentials:", e);
    }
  }

  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getCredential(),
  });
}

export const firestore = admin.firestore();
export const auth = admin.auth();
