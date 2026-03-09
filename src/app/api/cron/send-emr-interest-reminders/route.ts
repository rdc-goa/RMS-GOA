
import { NextResponse, type NextRequest } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import { sendEmail } from '@/lib/email';
import type { FundingCall, EmrInterest } from '@/types';
import { addDays, format } from 'date-fns';
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
    const twoDaysFromNow = addDays(new Date(), 2);
    const targetDateString = format(twoDaysFromNow, 'yyyy-MM-dd');

    const callsRef = collection(db, 'fundingCalls');
    const q = query(
      callsRef,
      where('interestDeadline', '>=', `${targetDateString}T00:00:00`),
      where('interestDeadline', '<=', `${targetDateString}T23:59:59`)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('EMR Interest Reminder Cron: No interest registration deadlines in 2 days.');
      return NextResponse.json({ success: true, message: 'No reminders to send.' });
    }
    
    let emailsSentCount = 0;

    for (const callDoc of querySnapshot.docs) {
        const call = { id: callDoc.id, ...callDoc.data() } as FundingCall;
        
        const interestsRef = collection(db, 'emrInterests');
        const interestsQuery = query(interestsRef, where('callId', '==', call.id));
        const interestsSnapshot = await getDocs(interestsQuery);

        const recipients = interestsSnapshot.docs
            .map(doc => doc.data() as EmrInterest)
            .filter(interest => !interest.pptUrl && interest.userEmail)
            .map(interest => interest.userEmail!);

        if (recipients.length > 0) {
            const emailHtml = `
                <div style="background-color:#121212; color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
                  <h2 style="color:#ffffff;">Reminder: Presentation Submission Required</h2>
                  <p style="color:#cccccc;">
                    This is a reminder regarding the EMR funding call, "<strong style="color:#ffffff;">${call.title}</strong>".
                  </p>
                  <p style="color:#cccccc;">
                    The deadline to register interest is in two days. Please note that uploading your presentation (PPT) is mandatory to be considered for an evaluation and presentation slot.
                  </p>
                  <p style="color:#cccccc;">If you have not already done so, please upload your presentation on the R&D Portal at your earliest convenience.</p>
                  <p style="text-align:center; margin-top:25px;">
                      <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/emr-calendar" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                          Go to EMR Calendar
                      </a>
                  </p>
                  <p style="margin-top:30px; color:#aaaaaa;">For any queries, please write a reply to this mail.</p>
                  <p style="margin-top:10px; color:#aaaaaa;">Thank you,</p>
                  <p style="color:#aaaaaa;">Research & Development Cell Team</p>
                  <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
                  <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
                      This is a system generated automatic email.
                  </p>
                </div>
            `;
            
            await sendEmail({
              bcc: recipients.join(','),
              to: process.env.RDC_EMAIL || 'helpdesk.rdc@paruluniversity.ac.in', // A nominal "to" address is needed
              subject: `Reminder: Presentation Submission for EMR Call "${call.title}"`,
              html: emailHtml,
              from: 'default'
            });
            emailsSentCount += recipients.length;
        }
    }

    console.log(`EMR Interest Reminder Cron: Sent reminders to ${emailsSentCount} applicants.`);
    return NextResponse.json({ success: true, message: `Sent reminders to ${emailsSentCount} applicants.` });
  } catch (error: any) {
    console.error('Error in EMR interest reminder cron job:', error);
    return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
  }
}
