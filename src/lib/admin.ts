import admin from "firebase-admin";

// This new structure ensures Firebase Admin is initialized only when one of its services is first accessed.
// This is safer for Next.js and provides better error handling.

let app: admin.app.App | null = null;
let initAttempted = false;

function ensureAdminInitialized() {
  if (initAttempted) return; // Only attempt to initialize once
  initAttempted = true;

  // If another part of the code initialized an app, use it.
  if (admin.apps.length > 0 && admin.apps[0]) {
    app = admin.apps[0];
    console.log("Firebase Admin SDK re-used existing instance.");
    return;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  // Check if all required environment variables are present.
  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    // Log a clear error to the server console instead of throwing.
    // This prevents the entire server from crashing on startup if env vars are missing.
    console.error(
      "Firebase Admin SDK initialization skipped. This is expected during client-side rendering, but if you see this error on your server during a server-side action, it means required environment variables are missing. \n" +
        "Please ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET are set. \n" +
        "For local development, use a .env.local file. For production, set these in your hosting provider's environment variable settings."
    );
    return; // Exit without initializing, app remains null
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
      storageBucket,
    });
  } catch (error: any) {
    console.error(
      "Firebase Admin SDK initialization error. Check service account credentials.",
      error.message
    );
    // Don't re-throw, app will remain null
  }
}

// A helper function to safely get a service, throwing an error only when the service is accessed.
function getService<T>(serviceGetter: () => T): T {
  ensureAdminInitialized();
  if (!app) {
    throw new Error(
      "Firebase Admin SDK is not initialized. Check server logs for configuration errors. This usually means the required server-side environment variables (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing from your hosting environment. If running locally, ensure they are in a .env.local file and that you have restarted the development server."
    );
  }
  return serviceGetter();
}

// We use a Proxy to create lazy-loaded exports.
// This means getService() is only called when you access a property
// on adminAuth, adminDb, or adminStorage for the first time.
export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get(target, prop) {
    const service = getService(() => admin.auth());
    return Reflect.get(service, prop);
  },
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(target, prop) {
    const service = getService(() => admin.firestore());
    return Reflect.get(service, prop);
  },
});

export const adminStorage = new Proxy({} as admin.storage.Storage, {
  get(target, prop) {
    const service = getService(() => admin.storage());
    return Reflect.get(service, prop);
  },
});
