
import { NextRequest, NextResponse } from 'next/server';

// This API route is deprecated and no longer in use.
// User and institute data is now managed via staffdata.xlsx and the get-staff-data API route.
// This file is kept to prevent build errors until all dependencies are removed, but it serves no function.

export async function GET(request: NextRequest) {
    return NextResponse.json({ success: false, error: 'This API route is deprecated.' }, { status: 410 });
}
