import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

if (!getApps().length) {
  const serviceAccount = require(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS!));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function checkAll() {
  // List ALL collections in users
  const usersSnap = await db.collection('users').get();
  console.log(`\n=== All User Documents ===`);
  for (const doc of usersSnap.docs) {
    console.log(`\nDoc ID: "${doc.id}"`);
    console.log(`  Data:`, JSON.stringify(doc.data()).substring(0, 200));
    
    // Check sub-collections
    const subCollections = await doc.ref.listCollections();
    for (const sub of subCollections) {
      console.log(`  Sub-collection: ${sub.id}`);
      const subDocs = await sub.get();
      subDocs.forEach(subDoc => {
        console.log(`    - ${subDoc.id}: ${JSON.stringify(subDoc.data()).substring(0, 200)}`);
      });
    }
  }
}

checkAll().catch(console.error);
