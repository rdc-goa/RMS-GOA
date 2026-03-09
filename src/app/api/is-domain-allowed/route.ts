
import { NextRequest, NextResponse } from 'next/server';
import { isEmailDomainAllowed } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, allowed: false, error: 'Email is required' }, { status: 400 });
    }

    const lowercasedEmail = email.toLowerCase();
    
    const result = await isEmailDomainAllowed(lowercasedEmail);

    if (result.allowed) {
      return NextResponse.json({ success: true, allowed: true });
    } else {
      return NextResponse.json({ 
        success: true, 
        allowed: false, 
        error: 'Only emails from allowed university domains can sign up or reset passwords.' 
      }, { status: 200 }); // Return 200 OK but with allowed: false
    }
    
  } catch (error: any) {
    console.error("Error in is-domain-allowed API:", error);
    return NextResponse.json({ success: false, allowed: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

    