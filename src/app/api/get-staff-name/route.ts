import { NextRequest, NextResponse } from 'next/server';
import { getStaffDataAction } from '@/lib/staff-service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    // Auth-gate: Check for valid Bearer token [CRIT-05]
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token || token !== process.env.MIS_API_KEY) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting [CRIT-04]
    const rateLimit = await checkRateLimit(`api-staff-name-${email}`);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    // Use the centralized caching service instead of manual Excel parsing
    const staffRecords = await getStaffDataAction({ email });

    if (staffRecords.length > 0) {
      return NextResponse.json({ success: true, name: staffRecords[0].name });
    } else {
      return NextResponse.json({ success: true, name: null });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
