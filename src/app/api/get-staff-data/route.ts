import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/logger';
import { adminAuth } from '@/lib/admin';
import { getStaffDataAction } from '@/lib/staff-service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const start = performance.now();
  
  // --- Security: Authenticate Request ---
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Missing or invalid token.' }, { status: 401 });
  }
  
  const token = authHeader.split('Bearer ')[1];
  try {
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Auth Error (get-staff-data):", error);
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid authentication session.' }, { status: 401 });
  }

  // --- Security: Rate Limiting ---
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const rateLimitKey = `rl_get_staff_${ip}`;
  const rateLimit = await checkRateLimit(rateLimitKey, { points: 30, duration: 300 });

  if (!rateLimit.success) {
    return NextResponse.json({ 
        success: false, 
        error: 'Too many requests. Please try again later.' 
    }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const misId = searchParams.get('misId');
  const userEmailForFileCheck = searchParams.get('userEmailForFileCheck');
  const fetchAll = searchParams.get('fetchAll');

  if (!email && !misId) {
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  try {
    const allFoundRecords = await getStaffDataAction({
        email: email || undefined,
        misId: misId || undefined,
        userEmailForFileCheck: userEmailForFileCheck || undefined,
        fetchAll: !!fetchAll
    });

    const latency_ms = performance.now() - start;

    if (allFoundRecords.length > 0) {
        await logEvent('APPLICATION', 'API Request successful', {
        metadata: { endpoint: '/api/get-staff-data', method: 'GET', statusCode: 200, latency_ms, email, misId },
        status: 'info'
        });
        return NextResponse.json({ success: true, data: allFoundRecords }, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
            }
        });
    } else {
        return NextResponse.json({ success: true, data: [], message: `User not found in the staff data file.` });
    }
  } catch (error: any) {
    console.error("Error in get-staff-data route:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
