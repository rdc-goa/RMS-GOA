import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/admin';
import { getSecureDocumentUrl } from '@/services/storage-service';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  try {
    const params = await props.params;
    const { path } = params;
    const fullPath = path.join('/');
    
    // 1. Get Session from Cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized: No session cookie found.' }, { status: 401 });
    }

    // 2. Verify Session
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifySessionCookie(sessionToken, true);
    } catch (authError) {
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired session.' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // 3. Get Secure URL from Service (checks permissions internally)
    const result = await getSecureDocumentUrl(fullPath, userId);

    if (result.success && result.url) {
      // Redirect to the Secure GCS Signed URL
      return NextResponse.redirect(result.url);
    } else {
      return NextResponse.json({ error: result.error || 'Access Denied' }, { status: 403 });
    }
  } catch (error: any) {
    console.error('Document Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
