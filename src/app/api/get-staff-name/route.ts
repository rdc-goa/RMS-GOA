import { NextRequest, NextResponse } from 'next/server';
import { getFacultyByEmail } from '@/services/umsService';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const profile = await getFacultyByEmail(email);

    if (!profile) {
      return NextResponse.json({ success: true, name: null });
    }

    return NextResponse.json({ success: true, name: profile.name || null });
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
