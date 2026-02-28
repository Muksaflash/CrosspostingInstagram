const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} catch (e) {
  console.log("Could not load .env.local:", e.message);
}

// Ensure credentials path is set correctly
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set in .env.local!");
  process.exit(1);
}

console.log("Using credentials from:", process.env.GOOGLE_APPLICATION_CREDENTIALS);

try {
  admin.initializeApp({
    credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  });
  
  const db = admin.firestore();
  
  async function testFirestore() {
    console.log("Checking Firestore API...");
    try {
      const collections = await db.listCollections();
      console.log("\n✅ SUCCESS: Firestore API is ENABLED and reachable!");
      console.log(`Found ${collections.length} collections.`);
    } catch (e) {
      console.error("\n❌ ERROR: Firestore API check failed!");
      if (e.message.includes('PERMISSION_DENIED') || e.code === 7) {
        console.error("The API is definitely still DISABLED. Please wait a few more minutes or check the Google Cloud Console.");
      } else {
        console.error("Details:", e.message);
      }
    }
  }
  
  testFirestore();
} catch (e) {
  console.error("Failed to initialize Firebase Admin:", e.message);
}
