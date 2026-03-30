
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { User } from '@/types';

/**
 * This route returns a short list of users matching a name or MIS ID.
 *
 * The previous implementation fell back to an Excel sheet search when Firestore results were
 * insufficient. That Excel-based lookup has been removed in favor of using the UMS API.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const misId = searchParams.get('misId');

    if ((!name || name.trim().length < 2) && (!misId || misId.trim().length < 2)) {
      return NextResponse.json({ success: true, users: [] });
    }

    const lowercasedName = name?.toLowerCase() || '';
    const lowercasedMisId = misId?.toLowerCase() || '';

    const usersRef = adminDb.collection('users');
    const querySnapshot = await usersRef.orderBy('name').get();

    const allUsers = querySnapshot.docs.map((doc) => {
      const userData = doc.data() as User;
      return {
        uid: doc.id,
        name: userData.name,
        email: userData.email,
        misId: userData.misId || 'N/A',
      };
    });

    let filteredUsers = allUsers;
    if (lowercasedName) {
      filteredUsers = filteredUsers
        .filter((user) => user.name.toLowerCase().includes(lowercasedName))
        .slice(0, 10);
    } else if (lowercasedMisId) {
      filteredUsers = filteredUsers
        .filter((user) => user.misId && user.misId.toLowerCase().includes(lowercasedMisId))
        .slice(0, 10);
    }

    return NextResponse.json({ success: true, users: filteredUsers });
  } catch (error: any) {
    console.error('Error finding users by name:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
