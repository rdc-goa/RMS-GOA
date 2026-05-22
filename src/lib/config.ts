
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getFunctions, type Functions } from 'firebase/functions';
import { getAnalytics, type Analytics } from 'firebase/analytics';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
let authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

if (!authDomain && projectId) {
    authDomain = `${projectId}.firebaseapp.com`;
}

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : undefined),
    projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

export const isFirebaseInitialized = !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
);

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let db_rtdb: Database;
let functions: Functions;
let storage: FirebaseStorage;
let analytics: Analytics | undefined;

function initializeFirebase() {
    if (!isFirebaseInitialized) {
        console.warn(
            'Firebase client initialization skipped. Missing required environment variables (NEXT_PUBLIC_FIREBASE_...). The app will show a configuration guide.'
        );
        // Assign dummy objects to prevent crashes on import
        app = {} as FirebaseApp;
        auth = {} as Auth;
        db = {} as Firestore;
        db_rtdb = {} as Database;
        functions = {} as Functions;
        analytics = undefined;
        return;
    }

    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);


    auth = getAuth(app);
    db = getFirestore(app);
    db_rtdb = getDatabase(app);
    functions = getFunctions(app);
    storage = getStorage(app);
    if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
        analytics = getAnalytics(app);
    }
}

// Call initialization once
initializeFirebase();

export { app, auth, db, db_rtdb, functions, storage, analytics };

