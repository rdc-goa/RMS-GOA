import { NextRequest, NextResponse } from 'next/server';
import { reportErrorToHelpdesk } from '@/services/notification-service';

export async function POST(request: NextRequest) {
  try {
    const { error, pageUrl, user, userAction } = await request.json();
    
    if (!error || !error.message) {
      return NextResponse.json({ success: false, error: 'Error details with a message are required' }, { status: 400 });
    }

    const result = await reportErrorToHelpdesk(error, pageUrl, user, userAction);
    
    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error in report-error API:", error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
