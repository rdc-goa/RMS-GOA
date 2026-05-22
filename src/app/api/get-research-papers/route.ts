import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/admin';
import type { ResearchPaper } from '@/types';

export async function GET(request: NextRequest) {
    try {
        // --- Security: Authenticate Request ---
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized: Missing or invalid token.' }, { status: 401 });
        }
        
        const token = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (error) {
            console.error("Auth Error (get-research-papers):", error);
            return NextResponse.json({ success: false, error: 'Unauthorized: Invalid authentication session.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const userUid = searchParams.get('userUid');

        if (!userUid) {
            return NextResponse.json({ success: false, error: 'User UID is a required parameter.' }, { status: 400 });
        }

        // --- Security: Authorize Request ---
        // Only the owner of the UID or an administrator/CRO can access these records.
        const isOwner = decodedToken.uid === userUid;
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        const userData = userDoc.data();
        const isAdmin = userData?.role === 'admin' || userData?.role === 'Super-admin' || userData?.role === 'CRO';

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ success: false, error: 'Forbidden: You do not have permission to view these records.' }, { status: 403 });
        }

        const papersRef = adminDb.collection("papers");

        // The correct and efficient way to query for this is to use an 'array-contains' query
        // on a dedicated array of author UIDs.
        const papersQuery = papersRef.where('authorUids', 'array-contains', userUid);
        
        const snapshot = await papersQuery.get();
        
        const papers = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ResearchPaper))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({ success: true, papers });

    } catch (error: any) {
        console.error("Exception in GET /api/get-research-papers:", error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
