import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/admin";
import { submitIncentiveClaim } from "@/app/actions";
import { validateApiToken } from "@/lib/check-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {

    const authHeader = req.headers.get("authorization");
    const authResult = await validateApiToken(authHeader);
    
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { uid, user: decodedToken } = authResult;
    const userRole = (decodedToken as any).role || 'faculty';

    let body: any;
    
    body = await req.json();

    const claimData = body?.claimData;
    const claimIdToUpdate = body?.claimIdToUpdate as string | undefined;

    if (!claimData) {
      return NextResponse.json({ error: "Missing claimData" }, { status: 400 });
    }

    const result = await submitIncentiveClaim(
      claimData, 
      claimIdToUpdate, 
      { authenticated: true, uid, role: userRole, user: decodedToken as any }
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, claimId: result.claimId });
  } catch (error: any) {
    console.error("Error processing incentive claim:", error);
    return NextResponse.json({ error: error?.message || "Failed to submit claim" }, { status: 500 });
  }
}
