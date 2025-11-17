import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json'; // path to your Firebase JSON

console.log("Initialzed");

// Only initialize once
if (!admin.apps.length) {
    console.log("Initialzed");

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
}

export default admin;
