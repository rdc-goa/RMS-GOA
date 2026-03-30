

import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/admin';
import { sendEmail } from '@/lib/email';
import type { Project, User, EmrInterest, FundingCall } from '@/types';
import { subDays, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const timeZone = 'Asia/Kolkata';

const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://lhdlkrfbkon55i6u.public.blob.vercel-storage.com/Pu%20Goa%20White.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
};


// Helper function to find pending evaluators and send emails
async function processAndRemind(
    items: (Project | EmrInterest)[],
    itemType: 'IMR' | 'EMR',
    usersMap: Map<string, User>,
    allCallsMap?: Map<string, FundingCall>
) {
    let remindersSent = 0;

    for (const item of items) {
        const meetingDetails = itemType === 'IMR' ? (item as Project).meetingDetails : (item as EmrInterest).meetingSlot;
        if (!meetingDetails) continue;

        const assignedEvaluators = itemType === 'IMR'
            ? (item as Project).meetingDetails?.assignedEvaluators || []
            : (item as EmrInterest).assignedEvaluators || [];
        
        const evaluatedBy = (item as Project | EmrInterest).evaluatedBy || [];
        
        let absentEvaluatorsForEmr: string[] = [];
        if (itemType === 'EMR' && allCallsMap) {
             const call = allCallsMap.get((item as EmrInterest).callId);
             if (call) {
                 absentEvaluatorsForEmr = call.meetingDetails?.absentEvaluators || [];
             }
        }
        
        const finalAbsentEvaluators = itemType === 'IMR'
            ? (item as Project).meetingDetails?.absentEvaluators || []
            : absentEvaluatorsForEmr;


        const pendingEvaluatorUids = assignedEvaluators.filter(
            uid => !evaluatedBy.includes(uid) && !finalAbsentEvaluators.includes(uid)
        );

        if (pendingEvaluatorUids.length === 0) {
            continue;
        }

        const projectName = itemType === 'IMR' ? (item as Project).title : (item as EmrInterest).callTitle;
        const piName = itemType === 'IMR' ? (item as Project).pi : (item as EmrInterest).userName;
        const meetingDate = formatInTimeZone(meetingDetails.date, timeZone, 'PPP');
        
        for (const uid of pendingEvaluatorUids) {
            const evaluator = usersMap.get(uid);
            if (evaluator?.email) {
                const emailHtml = `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <h2 style="color:#ffffff;">Gentle Reminder: Evaluation Submission</h2>
                        <p style="color:#cccccc;">Dear ${evaluator.name},</p>
                        <p style="color:#cccccc;">
                            This is a friendly reminder to submit your evaluation for the following ${itemType} project which was held on ${meetingDate}:
                        </p>
                        <div style="padding: 15px; border: 1px solid #4f5b62; border-radius: 8px; margin-top: 20px; background-color:#2c3e50;">
                            <p style="color:#e0e0e0;"><strong>Project:</strong> ${projectName}</p>
                            <p style="color:#e0e0e0;"><strong>Principal Investigator:</strong> ${piName}</p>
                        </div>
                        <p style="color:#cccccc; margin-top: 20px;">
                            Please complete the evaluation at your earliest convenience from the "Evaluation Queue" on the R&D Portal. Your timely feedback is greatly appreciated.
                        </p>
                        <p style="text-align:center; margin-top:25px;">
                            <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Go to Evaluation Queue
                            </a>
                        </p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `;

                await sendEmail({
                    to: evaluator.email,
                    subject: `Reminder: Please Submit Your ${itemType} Evaluation for "${projectName}"`,
                    html: emailHtml,
                    from: 'default'
                });
                remindersSent++;
            }
        }
    }
    return remindersSent;
}

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === 'production' && request.headers.get('X-Appengine-Cron') !== 'true') {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const fiveDaysAgo = format(subDays(new Date(), 5), 'yyyy-MM-dd');
        const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        const targetDates = [fiveDaysAgo, sevenDaysAgo];

        const usersSnapshot = await adminDb.collection('users').get();
        const usersMap = new Map<string, User>(usersSnapshot.docs.map(doc => [doc.id, doc.data() as User]));

        let totalRemindersSent = 0;

        // --- Process IMR Projects ---
        const imrSnapshot = await adminDb.collection('projects')
            .where('status', '==', 'Under Review')
            .where('meetingDetails.date', 'in', targetDates)
            .get();
        
        const imrProjectsToProcess = imrSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Project))
            .filter(p => p.hasHadMidTermReview !== true); // Exclude mid-term reviews

        totalRemindersSent += await processAndRemind(imrProjectsToProcess, 'IMR', usersMap);
        
        // --- Process EMR Projects ---
        const emrSnapshot = await adminDb.collection('emrInterests')
            .where('status', '==', 'Evaluation Pending')
            .where('meetingSlot.date', 'in', targetDates)
            .get();

        const emrInterestsToProcess = emrSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
        
        if (emrInterestsToProcess.length > 0) {
            const callIds = [...new Set(emrInterestsToProcess.map(i => i.callId))];
            const callsSnapshot = await adminDb.collection('fundingCalls').where('__name__', 'in', callIds).get();
            const allCallsMap = new Map<string, FundingCall>(callsSnapshot.docs.map(doc => [doc.id, doc.data() as FundingCall]));
            totalRemindersSent += await processAndRemind(emrInterestsToProcess, 'EMR', usersMap, allCallsMap);
        }

        console.log(`Post-Evaluation Reminder Cron: Sent ${totalRemindersSent} reminders in total.`);
        return NextResponse.json({ success: true, message: `Sent ${totalRemindersSent} reminders.` });
    } catch (error: any) {
        console.error('Error in post-evaluation reminder cron job:', error);
        return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
    }
}
