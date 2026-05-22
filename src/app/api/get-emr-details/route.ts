import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { FundingCall } from '@/types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // or restrict this in production
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  // Handle preflight OPTIONS requests
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');

    if (callId) {
      const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
      if (!callDoc.exists) {
        return NextResponse.json(
          { success: false, error: 'Funding call not found' },
          { status: 404, headers: corsHeaders }
        );
      }
      const callData = callDoc.data() as FundingCall;

      const filteredCall = {
        id: callDoc.id,
        title: callData.title,
        agency: callData.agency,
        callType: callData.callType,
        applyDeadline: callData.applyDeadline,
        interestDeadline: callData.interestDeadline,
        attachments: callData.attachments,
      };

      return NextResponse.json(
        { success: true, data: { call: filteredCall } },
        { 
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          }
        }
      );
    } else {
      const callsSnapshot = await adminDb
        .collection('fundingCalls')
        .orderBy('interestDeadline', 'desc')
        .get();

      const calls = callsSnapshot.docs.map((doc) => {
        const callData = doc.data() as FundingCall;
        return {
          id: doc.id,
          title: callData.title,
          agency: callData.agency,
          callType: callData.callType,
          applyDeadline: callData.applyDeadline,
          interestDeadline: callData.interestDeadline,
          attachments: callData.attachments,
        };
      });

      return NextResponse.json(
        { success: true, data: { calls } },
        { 
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          }
        }
      );
    }
  } catch (error: any) {
    console.error('Error fetching EMR details:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { callId } = body;

    if (callId) {
      const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
      if (!callDoc.exists) {
        return NextResponse.json(
          { success: false, error: 'Funding call not found' },
          { status: 404, headers: corsHeaders }
        );
      }
      const callData = callDoc.data() as FundingCall;

      const filteredCall = {
        id: callDoc.id,
        title: callData.title,
        agency: callData.agency,
        callType: callData.callType,
        applyDeadline: callData.applyDeadline,
        interestDeadline: callData.interestDeadline,
        attachments: callData.attachments,
      };

      return NextResponse.json(
        { success: true, data: { call: filteredCall } },
        { 
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          }
        }
      );
    } else {
      const callsSnapshot = await adminDb
        .collection('fundingCalls')
        .orderBy('interestDeadline', 'desc')
        .get();

      const calls = callsSnapshot.docs.map((doc) => {
        const callData = doc.data() as FundingCall;
        return {
          id: doc.id,
          title: callData.title,
          agency: callData.agency,
          callType: callData.callType,
          applyDeadline: callData.applyDeadline,
          interestDeadline: callData.interestDeadline,
          attachments: callData.attachments,
        };
      });

      return NextResponse.json(
        { success: true, data: { calls } },
        { headers: corsHeaders }
      );
    }
  } catch (error: any) {
    console.error('Error fetching EMR details:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}