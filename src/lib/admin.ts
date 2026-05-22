// import admin from "firebase-admin";

// // This new structure ensures Firebase Admin is initialized only when one of its services is first accessed.
// // This is safer for Next.js and provides better error handling.

// let app: admin.app.App | null = null;
// let initAttempted = false;

// function ensureAdminInitialized() {
//   if (initAttempted) return; // Only attempt to initialize once
//   initAttempted = true;

//   // If another part of the code initialized an app, use it.
//   if (admin.apps.length > 0 && admin.apps[0]) {
//     app = admin.apps[0];

//     // If the re-used app doesn't have a databaseURL, we might need to warn
//     if (!app.options.databaseURL && process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL) {
//       console.warn("Firebase Admin SDK re-used existing instance, but it lacks a databaseURL. RTDB calls may fail.");
//     } else {
//       console.log("Firebase Admin SDK re-used existing instance.");
//     }
//     return;
//   }

//   const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
//   const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
//   const privateKey = process.env.FIREBASE_PRIVATE_KEY;
//   const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

//   // Check if all required environment variables are present.
//   if (!projectId || !clientEmail || !privateKey || !storageBucket) {
//     // Log a clear error to the server console instead of throwing.
//     // This prevents the entire server from crashing on startup if env vars are missing.
//     console.error(
//       "Firebase Admin SDK initialization skipped. This is expected during client-side rendering, but if you see this error on your server during a server-side action, it means required environment variables are missing. \n" +
//         "Please ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET are set. \n" +
//         "For local development, use a .env.local file. For production, set these in your hosting provider's environment variable settings."
//     );
//     return; // Exit without initializing, app remains null
//   }

//   try {
//     const formattedPrivateKey = privateKey
//       .replace(/\\n/g, "\n")
//       .split("\n")
//       .map((line) => line.trim())
//       .join("\n")
//       .replace(/^"|"$/g, "");

//     app = admin.initializeApp({
//       credential: admin.credential.cert({
//         projectId: projectId,
//         clientEmail: clientEmail,
//         privateKey: formattedPrivateKey,
//       }),
//       storageBucket,
//       databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
//     });
//   } catch (error: any) {


//     console.error(
//       "Firebase Admin SDK initialization error. Check service account credentials.",
//       error.message
//     );
//     // Don't re-throw, app will remain null
//   }
// }

// // A helper function to safely get a service, throwing an error only when the service is accessed.
// function getService<T>(serviceGetter: () => T): T {
//   ensureAdminInitialized();
//   if (!app) {
//     throw new Error(
//       "Firebase Admin SDK is not initialized. Check server logs for configuration errors. This usually means the required server-side environment variables (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing from your hosting environment. If running locally, ensure they are in a .env.local file and that you have restarted the development server."
//     );
//   }
//   return serviceGetter();
// }

// // We use a Proxy to create lazy-loaded exports.
// // This means getService() is only called when you access a property
// // on adminAuth, adminDb, or adminStorage for the first time.
// export const adminAuth = new Proxy({} as admin.auth.Auth, {
//   get(target, prop) {
//     const service = getService(() => admin.auth());
//     const value = Reflect.get(service, prop);
//     return typeof value === "function" ? value.bind(service) : value;
//   },
// });

// export const adminDb = new Proxy({} as admin.firestore.Firestore, {
//   get(target, prop) {
//     const service = getService(() => admin.firestore());
//     const value = Reflect.get(service, prop);
//     return typeof value === "function" ? value.bind(service) : value;
//   },
// });

// export const adminRtdb = new Proxy({} as admin.database.Database, {
//     get(target, prop) {
//       const service = getService(() => {
//         const db = admin.database();
//         if (!app?.options.databaseURL) {
//             throw new Error("Firebase Realtime Database accessed but NEXT_PUBLIC_FIREBASE_DATABASE_URL is missing from environment variables.");
//         }
//         return db;
//       });
//       const value = Reflect.get(service, prop);
//       return typeof value === "function" ? value.bind(service) : value;
//     },
// });

// export const adminStorage = new Proxy({} as admin.storage.Storage, {
//   get(target, prop) {
//     const service = getService(() => admin.storage());
//     const value = Reflect.get(service, prop);
//     return typeof value === "function" ? value.bind(service) : value;
//   },
// });




import admin from "firebase-admin";

let app: admin.app.App | null = null;
let initAttempted = false;

function ensureAdminInitialized() {
  if (initAttempted) return;
  initAttempted = true;

  if (admin.apps.length > 0) {
    app = admin.apps[0];
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Firebase Admin init skipped: missing required env vars");
    return;
  }

  try {
    const formattedPrivateKey = privateKey
      .replace(/\\n/g, "\n")
      .replace(/^"|"$/g, "");

    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: formattedPrivateKey,
      }),
      ...(storageBucket ? { storageBucket } : {}),
      ...(databaseURL ? { databaseURL } : {}),
    });
  } catch (error: any) {
    console.error("Firebase Admin init error:", error);
  }
}

function getService<T>(getter: () => T): T {
  ensureAdminInitialized();
  if (!app) {
    throw new Error("Firebase Admin not initialized. Check env vars.");
  }
  return getter();
}

export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get(_, prop) {
    const service = getService(() => admin.auth());
    const value = Reflect.get(service, prop);
    return typeof value === "function" ? value.bind(service) : value;
  },
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(_, prop) {
    const service = getService(() => admin.firestore());
    const value = Reflect.get(service, prop);
    return typeof value === "function" ? value.bind(service) : value;
  },
});

export const adminRtdb = new Proxy({} as admin.database.Database, {
  get(_, prop) {
    const service = getService(() => {
      const dbUrl = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
      if (!dbUrl) {
        throw new Error("Missing FIREBASE_DATABASE_URL");
      }
      return admin.database();
    });
    const value = Reflect.get(service, prop);
    return typeof value === "function" ? value.bind(service) : value;
  },
});

export const adminStorage = new Proxy({} as admin.storage.Storage, {
  get(_, prop) {
    const service = getService(() => admin.storage());
    const value = Reflect.get(service, prop);
    return typeof value === "function" ? value.bind(service) : value;
  },
});