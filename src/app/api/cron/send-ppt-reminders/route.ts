
import { NextResponse, type NextRequest } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import { sendEmail } from '@/lib/email';
import type { EmrInterest, FundingCall } from '@/types';
import { addDays, format, startOfDay, endOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export async function GET(request: NextRequest) {
  // Secure the endpoint for production
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('X-Appengine-Cron') !== 'true'
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const timeZone = 'Asia/Kolkata';
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStart = startOfDay(tomorrow).toISOString();
    const tomorrowEnd = endOfDay(tomorrow).toISOString();

    const interestsRef = collection(db, 'emrInterests');
    const q = query(
      interestsRef,
      where('meetingSlot.pptDeadline', '>=', tomorrowStart),
      where('meetingSlot.pptDeadline', '<=', tomorrowEnd),
      where('pptUrl', '==', null) // Only get those who haven't uploaded
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('PPT Reminder Cron: No PPT deadlines for tomorrow or all are submitted.');
      return NextResponse.json({ success: true, message: 'No reminders to send.' });
    }
    
    // Fetch call details for email content
    const callIds = [...new Set(querySnapshot.docs.map(doc => doc.data().callId))];
    const callsRef = collection(db, 'fundingCalls');
    const callsQuery = query(callsRef, where('__name__', 'in', callIds));
    const callsSnapshot = await getDocs(callsQuery);
    const callsMap = new Map(callsSnapshot.docs.map(doc => [doc.id, doc.data() as FundingCall]));

    const reminderPromises = querySnapshot.docs.map(doc => {
      const interest = { id: doc.id, ...doc.data() } as EmrInterest;
      const call = callsMap.get(interest.callId);

      if (interest.userEmail && interest.meetingSlot && call) {
        const deadline = new Date(interest.meetingSlot.pptDeadline);
        const emailHtml = `
            <div style="background-color:#121212; color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
              <p style="color:#ffffff;">Dear ${interest.userName},</p>
              <p style="color:#cccccc;">
                This is a friendly reminder to upload your presentation for the EMR funding call, "<strong style="color:#ffffff;">${call.title}</strong>".
              </p>
              <p><strong style="color:#ffffff;">Your submission deadline is tomorrow, ${formatInTimeZone(deadline, timeZone, 'PPpp (z)')}.</strong></p>
              <p style="color:#cccccc;">Please upload your presentation from the EMR Calendar page on the portal as soon as possible.</p>
              <p style="margin-top:30px; color:#aaaaaa;">Thank you,</p>
              <p style="color:#aaaaaa;">Research & Development Cell Team</p>
            </div>
        `;
        return sendEmail({
          to: interest.userEmail,
          subject: `Reminder: EMR Presentation Submission for "${call.title}"`,
          html: emailHtml,
          from: 'default'
        });
      }
      return Promise.resolve();
    });

    await Promise.all(reminderPromises);

    console.log(`PPT Reminder Cron: Sent ${reminderPromises.length} reminders.`);
    return NextResponse.json({ success: true, message: `Sent ${reminderPromises.length} reminders.` });
  } catch (error: any) {
    console.error('Error in PPT reminder cron job:', error);
    return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
  }
}
