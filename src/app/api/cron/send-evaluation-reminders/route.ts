
import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/admin';
import { getSystemSettings } from '@/app/actions';
import { sendEmail } from '@/lib/email';
import type { Project, User } from '@/types';
import { addDays, subDays, format } from 'date-fns';
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
    const settings = await getSystemSettings();
    const evaluationDays = settings.imrEvaluationDays ?? 0;
    const timeZone = 'Asia/Kolkata';

    // We send the reminder 1 day before the evaluation window closes.
    // If evaluationDays is 0, the deadline is the meeting day, so no reminder is possible with a daily cron.
    if (evaluationDays < 1) {
        console.log(`IMR Evaluation Reminder Cron: No reminders sent as evaluation window is less than 1 day.`);
        return NextResponse.json({ success: true, message: 'Evaluation window is 0 days, no reminders sent.' });
    }

    // The reminder goes out on `meetingDate + evaluationDays - 1`.
    // So, we look for meetings where `meetingDate = today - (evaluationDays - 1)`.
    const reminderOffsetDays = evaluationDays - 1;
    const targetMeetingDate = subDays(new Date(), reminderOffsetDays);
    const targetMeetingDateString = format(targetMeetingDate, 'yyyy-MM-dd');
    
    console.log(`IMR Evaluation Reminder Cron: Looking for meetings on ${targetMeetingDateString} to send reminders.`);

    const projectsSnapshot = await adminDb.collection('projects')
      .where('status', '==', 'Under Review')
      .where('meetingDetails.date', '==', targetMeetingDateString)
      .get();

    if (projectsSnapshot.empty) {
      console.log(`IMR Evaluation Reminder Cron: No meetings found for ${targetMeetingDateString}. No reminders to send.`);
      return NextResponse.json({ success: true, message: 'No reminders to send.' });
    }

    let sentCount = 0;

    for (const doc of projectsSnapshot.docs) {
      const project = { id: doc.id, ...doc.data() } as Project;
      const assignedEvaluators = project.meetingDetails?.assignedEvaluators || [];
      const evaluatedBy = project.evaluatedBy || [];

      if (!project.meetingDetails) continue;

      const pendingEvaluatorUids = assignedEvaluators.filter(
        uid => !evaluatedBy.includes(uid)
      );

      if (pendingEvaluatorUids.length === 0) {
        continue;
      }
      
      const usersRef = adminDb.collection('users');
      // Firestore 'in' queries are limited to 30 values. If there are more, we need to chunk.
      const MAX_IN_QUERY_SIZE = 30;
      for (let i = 0; i < pendingEvaluatorUids.length; i += MAX_IN_QUERY_SIZE) {
          const chunk = pendingEvaluatorUids.slice(i, i + MAX_IN_QUERY_SIZE);
          const evaluatorsSnapshot = await usersRef.where('__name__', 'in', chunk).get();

          for (const userDoc of evaluatorsSnapshot.docs) {
            const evaluator = userDoc.data() as User;

            if (evaluator.email) {
                const meetingDateTimeString = `${project.meetingDetails!.date}T${project.meetingDetails!.time}:00`;
                const deadline = addDays(new Date(project.meetingDetails!.date.replace(/-/g, '/')), evaluationDays);

                const emailHtml = `
                    <div style="background-color:#121212; color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
                      <div style="text-align:center; margin-bottom:20px;">
                        <img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC-PU Logo" style="max-width:300px; height:auto;" />
                      </div>

                      <h2 style="color: #ffca28;">Urgent Reminder</h2>
                      <p style="color:#ffffff;">Dear ${evaluator.name},</p>

                      <p style="color:#cccccc;">
                        This is an urgent reminder that the evaluation window for the IMR project "<strong style="color:#ffffff;">${project.title}</strong>" is closing tomorrow.
                      </p>

                      <p><strong style="color:#ffffff;">Project PI:</strong> ${project.pi}</p>
                      <p><strong style="color:#ffffff;">Meeting Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, 'MMMM d, yyyy')}</p>
                      <p><strong style="color:#ffffff;">Evaluation Deadline:</strong> ${formatInTimeZone(deadline, timeZone, 'PPpp (z)')}</p>
                      
                      <p style="color:#cccccc; margin-top: 15px;">
                        Please submit your evaluation on the portal as soon as possible. Your feedback is crucial for the decision-making process.
                      </p>
                      
                      <p style="text-align:center; margin-top:25px;">
                        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="background-color: #ff8f00; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Go to Evaluation Queue
                        </a>
                      </p>

                      <p style="margin-top:30px; color:#aaaaaa;">Thank you for your prompt attention to this matter,</p>
                      <p style="color:#aaaaaa;">Research & Development Cell Team</p>
                    </div>
                  `;

                await sendEmail({
                    to: evaluator.email,
                    subject: `URGENT: IMR Evaluation window closing tomorrow for "${project.title}"`,
                    html: emailHtml,
                    from: 'default'
                });
                sentCount++;
            }
          }
      }
    }

    console.log(`IMR Evaluation Reminder Cron: Sent ${sentCount} reminders.`);
    return NextResponse.json({ success: true, message: `Sent ${sentCount} reminders.` });
  } catch (error: any) {
    console.error('Error in IMR evaluation reminder cron job:', error);
    return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
  }
}
