import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import { getSystemSettings } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const lowercasedEmail = email.toLowerCase();
    
    // Server-side validation against allowed domains
    const settings = await getSystemSettings();
    const allowedDomains = settings.allowedDomains || ['@paruluniversity.ac.in', '@goa.paruluniversity.ac.in'];
    const isDomainAllowed = allowedDomains.some(domain => lowercasedEmail.endsWith(domain));
    const isSpecialCase = lowercasedEmail === 'rathipranav07@gmail.com';

    if (!isDomainAllowed && !isSpecialCase) {
      return NextResponse.json({ 
        success: false, 
        exists: false, 
        error: 'Only emails from allowed university domains can sign up.' 
      }, { status: 403 });
    }
    
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', lowercasedEmail));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      return NextResponse.json({ 
        success: true, 
        exists: true, 
        user: { uid: userDoc.id, name: userData.name, email: userData.email } 
      });
    } else {
      return NextResponse.json({ success: true, exists: false, user: null });
    }
  } catch (error: any) {
    console.error("Error in check-user-exists API:", error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
