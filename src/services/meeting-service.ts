'use server';

import { adminDb } from "@/lib/admin"
import { FieldValue } from "firebase-admin/firestore"
import { User, Project } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { format, addHours, parseISO, isToday } from "date-fns"
import { formatInTimeZone, toDate } from "date-fns-tz"
import { logEvent } from "@/lib/logger"
import { logActivity, EMAIL_STYLES } from "./utils"

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; pi: string; title: string; pi_email?: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[]; mode: 'Online' | 'Offline' },
  isMidTermReview: boolean = false,
) {
  try {
    const batch = adminDb.batch();
    const emailPromises: Promise<any>[] = [];
    const timeZone = "Asia/Kolkata"
    const meetingDateTimeString = `${meetingDetails.date}T${meetingDetails.time}:00`

    const meetingDate = toDate(meetingDateTimeString, { timeZone });
    const dtstamp = formatInTimeZone(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");

    const newMeetingDetails = {
      date: meetingDetails.date,
      time: meetingDetails.time,
      venue: meetingDetails.venue,
      mode: meetingDetails.mode,
      assignedEvaluators: meetingDetails.evaluatorUids,
    };

    const allUsersToNotify = new Map<string, User>();
    const rescheduleMap = new Map<string, boolean>();

    for (const projectData of projectsToSchedule) {
      const projectRef = adminDb.collection("projects").doc(projectData.id)
      const projectSnap = await projectRef.get();
      const existingProject = projectSnap.exists ? projectSnap.data() as Project : null;
      const isReschedule = !!existingProject?.meetingDetails;
      rescheduleMap.set(projectData.id, isReschedule);

      const updateData: any = { meetingDetails: newMeetingDetails };
      updateData.wasAbsent = false;
      if (isReschedule && existingProject?.meetingDetails) {
        updateData.pastMeetings = FieldValue.arrayUnion({
          ...existingProject.meetingDetails,
          wasAbsent: !!existingProject.wasAbsent,
          status: "Rescheduled"
        });
      }
      if (isMidTermReview) {
        updateData.hasHadMidTermReview = true;
      } else {
        updateData.status = "Under Review";
      }

      batch.update(projectRef, updateData);

      if (projectData.pi_uid) {
        const piSnap = await adminDb.collection("users").doc(projectData.pi_uid).get();
        if (piSnap.exists) allUsersToNotify.set(projectData.pi_uid, piSnap.data() as User);
      }

      if (isReschedule && existingProject?.meetingDetails?.assignedEvaluators) {
        for (const uid of existingProject.meetingDetails.assignedEvaluators) {
          if (!allUsersToNotify.has(uid) && uid) {
            const userSnap = await adminDb.collection("users").doc(uid).get();
            if (userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
          }
        }
      }
      for (const uid of meetingDetails.evaluatorUids) {
        if (!allUsersToNotify.has(uid) && uid) {
          const userSnap = await adminDb.collection("users").doc(uid).get();
          if (userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
        }
      }
      if (projectData.pi_email) {
        const isReschedule = rescheduleMap.get(projectData.id);
        const subject = `${isMidTermReview ? 'IMR Mid-Term' : 'IMR'} Review Meeting ${isReschedule ? 'Rescheduled' : 'Scheduled'}: ${projectData.title}`;

        const piEmailHtml = `
          <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <h2 style="color: #ffffff; text-align: center;">Review Meeting ${isReschedule ? 'Rescheduled' : 'Scheduled'}</h2>
            <p style="color: #ffffff;">Dear ${projectData.pi},</p>
            <p style="color: #e0e0e0;">A review meeting has been ${isReschedule ? 'rescheduled' : 'scheduled'} for your project: <strong style="color: #ffffff;">${projectData.title}</strong>.  Please ensure you carry a pendrive containing your presentation (PPT) for the session.</p>
            <div style="background-color: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 5px; margin: 20px 0; color: #ffffff;">
              <p><strong>Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
              <p><strong>Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
              <p><strong>Venue:</strong> ${meetingDetails.venue}</p>
              <p><strong>Mode:</strong> ${meetingDetails.mode}</p>
            </div>
            <p style="color: #e0e0e0;">Please ensure you are prepared for the presentation. You can view your project details on the <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectData.id}" style="color: #64b5f6;">R&D Portal</a>.</p>
            ${EMAIL_STYLES.footer}
          </div>
        `;

        const icalContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//ParulUniversity//RDC-Portal//EN',
          'METHOD:REQUEST',
          'BEGIN:VEVENT',
          `UID:${projectData.id}@paruluniversity.ac.in`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${formatInTimeZone(meetingDate, 'UTC', "yyyyMMdd'T'HHmmss'Z'")}`,
          `DTEND:${formatInTimeZone(addHours(meetingDate, 1), 'UTC', "yyyyMMdd'T'HHmmss'Z'")}`,
          `SUMMARY:${isMidTermReview ? 'Mid-Term' : 'IMR'} Review: ${projectData.title}`,
          `DESCRIPTION:Your review meeting for '${projectData.title}' has been scheduled.`,
          `LOCATION:${meetingDetails.venue}`,
          `ORGANIZER;CN=RDC Parul University Goa:mailto:${process.env.GMAIL_USER}`,
          `ATTENDEE;CN=${projectData.pi};RSVP=TRUE:mailto:${projectData.pi_email}`,
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

        emailPromises.push(sendEmailUtility({
          to: projectData.pi_email,
          subject: subject,
          html: piEmailHtml,
          from: 'default',
          category: 'IMR',
          icalEvent: {
            filename: 'invite.ics',
            method: 'REQUEST',
            content: icalContent
          }
        }));
      }
    }

    // Notify Evaluators
    const projectListHtml = projectsToSchedule.map(p => `<li><a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${p.id}" style="color: #64b5f6; text-decoration: underline;">${p.title}</a> (PI: ${p.pi})</li>`).join('');
    const startTimeUTC = formatInTimeZone(meetingDate, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    const endTimeUTC = formatInTimeZone(addHours(meetingDate, 1), 'UTC', "yyyyMMdd'T'HHmmss'Z'");

    for (const evaluatorUid of meetingDetails.evaluatorUids) {
      const evaluator = allUsersToNotify.get(evaluatorUid);
      if (evaluator && evaluator.email) {
        const evaluatorEmailHtml = `
          <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <h2 style="color: #ffffff; text-align: center;">Review Assignment</h2>
            <p style="color: #ffffff;">Dear ${evaluator.name},</p>
            <p style="color: #e0e0e0;">You have been assigned as an evaluator for the following review meeting:</p>
            <div style="background-color: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 5px; margin: 20px 0; color: #ffffff;">
              <p><strong>Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
              <p><strong>Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
              <p><strong>Venue:</strong> ${meetingDetails.venue}</p>
              <p><strong>Mode:</strong> ${meetingDetails.mode}</p>
            </div>
            <p style="color: #ffffff;"><strong>Projects to Review:</strong></p>
            <ul style="color: #e0e0e0;">
              ${projectListHtml}
            </ul>
            <p style="color: #e0e0e0;">Please review these proposals on the <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="color: #64b5f6;">Evaluator Dashboard</a>.</p>
            ${EMAIL_STYLES.footer}
          </div>
        `;

        const icalContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//ParulUniversity//RDC-Portal//EN',
          'METHOD:REQUEST',
          'BEGIN:VEVENT',
          `UID:eval-${meetingDetails.date}-${evaluatorUid}@paruluniversity.ac.in`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${startTimeUTC}`,
          `DTEND:${endTimeUTC}`,
          `SUMMARY:IMR Evaluation Meeting`,
          `DESCRIPTION:You are assigned to evaluate ${projectsToSchedule.length} project(s).`,
          `LOCATION:${meetingDetails.venue}`,
          `ORGANIZER;CN=RDC Parul University Goa:mailto:${process.env.GMAIL_USER}`,
          `ATTENDEE;CN=${evaluator.name};RSVP=TRUE:mailto:${evaluator.email}`,
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

        emailPromises.push(sendEmailUtility({
          to: evaluator.email,
          subject: `IMR Review Assignment: ${formatInTimeZone(meetingDateTimeString, timeZone, "MMM d")}`,
          html: evaluatorEmailHtml,
          from: 'default',
          category: 'IMR',
          icalEvent: {
            filename: 'invite.ics',
            method: 'REQUEST',
            content: icalContent
          }
        }));
      }
    }

    await batch.commit();

    let emailFailureWarning = "";
    try {
      if (emailPromises.length === 0) {
        emailFailureWarning = "No recipients found for email notification.";
      } else {
        const emailResults = await Promise.all(emailPromises);
        const failedEmails = emailResults.filter(r => !r.success);

        if (failedEmails.length > 0) {
          const errorMsg = failedEmails[0].error || "Unknown email error";
          emailFailureWarning = `Email notifications failed for ${failedEmails.length} recipient(s): ${errorMsg}`;
          console.warn(emailFailureWarning);
        }
      }
    } catch (e: any) {
      emailFailureWarning = `Failed to send email notifications: ${e.message || e}`;
      console.error(emailFailureWarning);
    }
    await logActivity("INFO", "Review meeting scheduled", { projectIds: projectsToSchedule.map((p) => p.id), meetingDate: meetingDetails.date })
    await logEvent('WORKFLOW', 'Review meeting scheduled', {
      metadata: { projectIds: projectsToSchedule.map((p) => p.id), meetingDate: meetingDetails.date, venue: meetingDetails.venue },
      user: { uid: '', email: '', role: 'admin' },
      status: 'success'
    });
    return { success: true, warning: emailFailureWarning || undefined };
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
    await logActivity("ERROR", "Failed to schedule IMR meeting", { error: error.message })
    return { success: false, error: error.message || "Failed to schedule meeting." }
  }
}
