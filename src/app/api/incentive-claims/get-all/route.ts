import { NextRequest, NextResponse } from "next/server";
import { fetchAllClaimsAction } from "@/app/actions";
import { validateApiToken } from "@/lib/check-auth";
import { User } from "@/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const authResult = await validateApiToken(authHeader);
    
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { user: decodedToken } = authResult;
    const user = decodedToken as User;

    const claims = await fetchAllClaimsAction(user);

    return NextResponse.json(
      { success: true, claims },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching incentive claims:", error);
    return NextResponse.json({ error: "Failed to fetch claims" }, { status: 500 });
  }
}
