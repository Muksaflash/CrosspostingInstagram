const admin = require('firebase-admin');

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\muksa\\OneDrive\\Документы\\Coding secrets\\crosspostinginstagram-d4615bf69351.json";

try {
  admin.initializeApp({
    credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  });

  admin.firestore().listCollections()
    .then(() => console.log('✅ FIRESTORE RABOTAET! API ENABLED.'))
    .catch(e => {
        if (e.message.includes('PERMISSION_DENIED') || e.code === 7) {
            console.log('❌ FIRESTORE DISABLED: ' + e.message);
        } else {
            console.log('❌ OTHER ERROR: ' + e.message);
        }
    });
} catch(e) {
  console.log('INIT ERROR: ' + e.message);
}
