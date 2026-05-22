
import { type NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, adminStorage } from "@/lib/admin";

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {} as Record<string, any>,
      debug: {} as Record<string, any>,
    };

    // Debug environment variables
    results.debug.environment = {
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      hasDatabaseUrl: !!process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    };


    // Test Service Account Variable
    if (results.debug.environment.hasProjectId && results.debug.environment.hasClientEmail && results.debug.environment.hasPrivateKey) {
      results.tests.serviceAccount = {
        status: "success",
        message: "All required Firebase Admin environment variables are present.",
      };
    } else {
      results.tests.serviceAccount = {
        status: "error",
        message: "One or more required Firebase Admin environment variables (NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing.",
      };
    }

    // Test Firestore connection
    try {
      const testCollection = adminDb.collection("_health_check");
      await testCollection.doc("write_test").set({ timestamp: new Date() });
      const docSnapshot = await testCollection.doc("write_test").get();
      const canRead = docSnapshot.exists;
      await testCollection.doc("write_test").delete();

      results.tests.firestore = {
        status: "success",
        message: "Firestore connection successful - can read and write.",
        canRead,
        canWrite: true,
      };
    } catch (error: any) {
      results.tests.firestore = {
        status: "error",
        message: `Firestore error: ${error.message}`,
        details: error.stack,
        canRead: false,
        canWrite: false,
      };
    }

    // Test Firebase Auth
    try {
      await adminAuth.listUsers(1); // Test an actual API call
      results.tests.auth = {
        status: "success",
        message: "Firebase Auth connection successful.",
        canListUsers: true,
      };
    } catch (error: any) {
      results.tests.auth = {
        status: "error",
        message: `Firebase Auth error: ${error.message}`,
        details: error.stack,
        canListUsers: false,
      };
    }

    // Test Firebase Storage
    try {
      const bucket = adminStorage.bucket();
      const [exists] = await bucket.exists();
      results.tests.storage = {
        status: "success",
        message: "Firebase Storage connection successful.",
        bucketExists: exists,
        bucketName: bucket.name,
      };
    } catch (error: any) {
      results.tests.storage = {
        status: "error",
        message: `Firebase Storage error: ${error.message}`,
        details: error.stack,
        bucketExists: false,
      };
    }

    // Test Firebase Realtime Database
    try {
      const { adminRtdb } = await import("@/lib/admin");
      const testRef = adminRtdb.ref("_health_check/write_test");
      await testRef.set({ timestamp: Date.now() });
      const snapshot = await testRef.get();
      const canRead = snapshot.exists();
      await testRef.remove();

      results.tests.rtdb = {
        status: "success",
        message: "Realtime Database connection successful - can read and write.",
        canRead,
        canWrite: true,
      };
    } catch (error: any) {
      results.tests.rtdb = {
        status: "error",
        message: `Realtime Database error: ${error.message}`,
        details: error.stack,
        canRead: false,
        canWrite: false,
      };
    }


    // Overall status
    const hasErrors = Object.values(results.tests).some((test) => test.status === "error");
    const overallStatus = hasErrors ? "error" : "success";
    const overallMessage = hasErrors ? "Some Firebase services have issues." : "All Firebase services are working correctly.";

    return NextResponse.json({
      ...results,
      overallStatus,
      message: overallMessage,
    });

  } catch (error: any) {
    console.error("Firebase health check API failed catastrophically:", error);
    return NextResponse.json(
      {
        error: "Failed to run Firebase health check API",
        details: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
