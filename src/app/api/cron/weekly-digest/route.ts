'use server';

import { adminDb } from '@/lib/admin';
import { sendEmail } from '@/lib/email';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

const EMAIL_RECIPIENT = 'rdc@goa.paruluniversity.ac.in';
const EMAIL_STYLES = {
  background: 'style=\"background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;\"',
  logo: '<div style=\"text-align:center; margin-bottom:20px;\"><img src=\"https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png\" alt=\"RDC Logo\" style=\"max-width:300px; height:auto;\" /></div>',
  footer: '<p style=\"color:#b0bec5; margin-top: 30px;\">Best Regards,<br>Research & Development Cell Team,<br>Parul University Goa</p><p style=\"font-size:10px; color:#999999;\">This is automated. Report issues to helpdesk.</p>'
};

export async function POST() {
  try {
    // Week: Mon-Sun UTC
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const weekStartISO = weekStart.toISOString();
    const weekEndISO = weekEnd.toISOString();

    // IMR Submissions (week)
    const imrSubsSnap = await adminDb.collection('projects')
      .where('submissionDate', '>=', weekStartISO)
      .where('status', '==', 'Submitted').get();
    const imrSubs = imrSubsSnap.size;

    // IMR Evaluations (approx: updated this week w/ evaluations)
    const imrEvalsSnap = await adminDb.collection('projects')
      .where('updatedAt', '>=', weekStartISO)
      .where('evaluations', '!=', null).limit(100).get();
    const imrEvals = imrEvalsSnap.size;

    // IMR Meetings (date this week)
    const imrMeetsSnap = await adminDb.collection('projects')
      .where('meetingDetails.date', '>=', weekStart.toISOString().split('T')[0])
      .where('meetingDetails.date', '<=', weekEnd.toISOString().split('T')[0]).get();
    const imrMeets = imrMeetsSnap.size;

    // EMR Interests (week)
    const emrIntSnap = await adminDb.collection('emrInterests')
      .where('registeredAt', '>=', weekStartISO).get();
    const emrInterests = emrIntSnap.size;

    // EMR PPTs Pending
    const emrPendSnap = await adminDb.collection('emrInterests')
      .where('status', '==', 'Evaluation Pending')
      .where('pptUrl', '==', null).get();
    const emrPptPending = emrPendSnap.size;

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color:#ffffff;">RDC Weekly Digest (${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd')})</h2>
        <table style="width:100%; border-collapse:collapse; margin:20px 0;">
          <tr><td style="padding:10px; background:#2c3e50; color:#e0e0e0;"><strong>IMR Submissions</strong></td><td style="padding:10px; background:#34495e;">${imrSubs}</td></tr>
          <tr><td style="padding:10px; background:#2c3e50; color:#e0e0e0;"><strong>IMR Evaluations</strong></td><td style="padding:10px; background:#34495e;">${imrEvals}</td></tr>
          <tr><td style="padding:10px; background:#2c3e50; color:#e0e0e0;"><strong>IMR Meetings</strong></td><td style="padding:10px; background:#34495e;">${imrMeets}</td></tr>
          <tr><td style="padding:10px; background:#2c3e50; color:#e0e0e0;"><strong>EMR Interests</strong></td><td style="padding:10px; background:#34495e;">${emrInterests}</td></tr>
          <tr><td style="padding:10px; background:#2c3e50; color:#e0e0e0;"><strong>EMR PPT Pending</strong></td><td style="padding:10px; background:#34495e; color:${emrPptPending > 0 ? '#ff5252' : '#00e676'};">${emrPptPending}</td></tr>
        </table>
        <p style="color:#e0e0e0;">Dashboard: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://rndprojects.paruluniversity.ac.in'}/dashboard</p>
        ${EMAIL_STYLES.footer}
      </div>`;

    await sendEmail({
      to: EMAIL_RECIPIENT,
      subject: `RDC Weekly Digest: ${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd')}`,
      html: emailHtml,
      from: 'default'
    });

    console.log('Digest sent:', { imrSubs, imrEvals, imrMeets, emrInterests, emrPptPending });
    return Response.json({ success: true, metrics: { imrSubs, imrEvals, imrMeets, emrInterests, emrPptPending } });
  } catch (error: any) {
    console.error('Weekly digest cron failed:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
