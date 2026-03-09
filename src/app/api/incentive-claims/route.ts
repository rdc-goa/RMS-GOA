import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { submitIncentiveClaim } from "@/app/incentive-approval-actions";

function ensureFirebaseAdminInitialized() {
  if (getApps().length) return;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured");
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    ensureFirebaseAdminInitialized();

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    let body: any;
    
    body = await req.json();

    const claimData = body?.claimData;
    const claimIdToUpdate = body?.claimIdToUpdate as string | undefined;

    if (!claimData) {
      return NextResponse.json({ error: "Missing claimData" }, { status: 400 });
    }

    const result = await submitIncentiveClaim(claimData, claimIdToUpdate);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, claimId: result.claimId });
  } catch (error: any) {
    console.error("Error processing incentive claim:", error);
    return NextResponse.json({ error: error?.message || "Failed to submit claim" }, { status: 500 });
  }
}
