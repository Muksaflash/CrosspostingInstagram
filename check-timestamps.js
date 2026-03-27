const admin = require('firebase-admin');

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\muksa\\OneDrive\\Документы\\Coding secrets\\crosspostinginstagram-d4615bf69351.json";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    projectId: "crosspostinginstagram"
  });
}
const db = admin.firestore();

async function check() {
  const users = await db.collection("users").get();
  for (const doc of users.docs) {
    const email = doc.id;
    if (!email.includes("@")) continue;

    const settings = await db.collection("users").doc(email).collection("settings").get();
    let autoPostAt = null;
    settings.forEach(s => {
      if (s.id === "AUTO_POST_ENABLED_AT") autoPostAt = s.data().value;
    });

    if (autoPostAt) {
      console.log(`User ${email} has AUTO_POST_ENABLED_AT = ${autoPostAt} (${new Date(parseInt(autoPostAt)).toISOString()})`);
      
      const lastPost = await db.collection("users").doc(email).collection("cache").doc("lastPost").get();
      if (lastPost.exists) {
        const data = lastPost.data();
        const postTime = data.takenAt * 1000;
        console.log(`Latest cached post takenAt = ${postTime} (${new Date(postTime).toISOString()})`);
        
        if (postTime < parseInt(autoPostAt)) {
          console.log(`=> Post is OLDER than enabled time. It will be ignored!`);
        } else {
          console.log(`=> Post is NEWER than enabled time. It should be eligible!`);
          
          const trackers = await db.collection("users").doc(email).collection("cache").doc("autoPosted").get();
          const keys = trackers.exists ? trackers.data().postKeys || [] : [];
          console.log(`PostKeys tracked:`, keys);
          if (keys.includes(data.postKey)) {
             console.log(`=> But it's already in the tracker!`);
          }
        }
      } else {
        console.log(`No latest post cache found.`);
      }
    } else {
      console.log(`User ${email} DOES NOT have AUTO_POST_ENABLED_AT set.`);
    }
  }
}

check().catch(console.error).then(() => process.exit(0));
