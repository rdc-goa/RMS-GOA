
'use server';

import { adminDb, adminStorage } from "@/lib/admin";
import type { EmrInterest, User, CoPiDetails, FundingCall, EmrEvaluation } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import path from 'path';
import { sendEmail as sendEmailUtility } from "@/lib/email";
import { formatInTimeZone, toDate } from "date-fns-tz";
import type * as z from 'zod';
import { addDays, setHours, setMinutes, setSeconds, addHours, format } from "date-fns";
import * as XLSX from 'xlsx';

// --- Centralized Logging Service ---
type LogLevel = "INFO" | "WARNING" | "ERROR"

async function logActivity(level: LogLevel, message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.")
      return
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    }
    await adminDb.collection("logs").add(logEntry)
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error)
    console.error("Original Log Entry:", { level, message, context });
  }
}

const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}

// Function to convert Excel serial date number to JS Date
function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  const date_info = new Date(utc_value * 1000)

  const fractional_day = serial - Math.floor(serial) + 0.0000001

  let total_seconds = Math.floor(86400 * fractional_day)

  const seconds = total_seconds % 60

  total_seconds -= seconds

  const hours = Math.floor(total_seconds / (60 * 60))
  const minutes = Math.floor(total_seconds / 60) % 60

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds)
}


export async function getEmrInterests(callId: string): Promise<EmrInterest[]> {
  try {
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("callId", "==", callId)
    const snapshot = await q.get()
    const interests: EmrInterest[] = []
    snapshot.forEach((doc) => {
      interests.push({ id: doc.id, ...(doc.data() as EmrInterest) })
    })
    return interests
  } catch (error) {
    console.error("Error fetching EMR interests:", error)
    return []
  }
}

export async function uploadFileToServer(
  fileDataUrl: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!fileDataUrl || typeof fileDataUrl !== "string") {
      throw new Error("Invalid file data URL provided.");
    }

    const bucket = adminStorage.bucket();
    const file = bucket.file(path);

    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match || match.length < 3) {
      throw new Error("Invalid data URL format.");
    }

    const mimeType = match[1];
    const base64Data = match[2];

    if (!mimeType || !base64Data) {
      throw new Error("Could not extract file data from data URL.");
    }

    const buffer = Buffer.from(base64Data, "base64");

    // The modern, correct way to upload and get a public URL
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    // Make the file public
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = file.publicUrl();

    console.log(`File uploaded successfully to ${path}, URL: ${publicUrl}`);

    return { success: true, url: publicUrl };

  } catch (error: any) {
    console.error("Error uploading file via admin:", error);
    await logActivity("ERROR", "File upload failed", { path, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to upload file." };
  }
}


export async function registerEmrInterest(
  callId: string,
  user: User,
  coPis: CoPiDetails[] = [],
  registeredByAdmin?: { adminUid: string, adminName: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!user || !user.uid) {
      return {
        success: false,
        error: "User data is missing or invalid.",
      }
    }

    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("callId", "==", callId).where("userId", "==", user.uid)
    const docSnap = await q.get()
    if (!docSnap.empty) {
      return { success: false, error: "This user has already registered interest for this call." }
    }

    const allInterestsForCallQuery = interestsRef.where("callId", "==", callId)
    const allInterestsSnapshot = await allInterestsForCallQuery.get()
    const isFirstInterest = allInterestsSnapshot.empty

    await adminDb.runTransaction(async (transaction) => {
      const counterRef = adminDb.collection("counters").doc("emrInterest")
      const counterDoc = await transaction.get(counterRef)

      let newCount = 1
      if (counterDoc.exists && counterDoc.data()?.current) {
        newCount = counterDoc.data()!.current + 1
      }
      transaction.set(counterRef, { current: newCount }, { merge: true })

      const interestId = `RDC/EMR/INTEREST/${String(newCount).padStart(5, "0")}`

      const newInterestDoc: Omit<EmrInterest, "id"> = {
        interestId: interestId,
        callId: callId,
        userId: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        department: user.department || "N/A",
        registeredAt: new Date().toISOString(),
        status: "Registered",
        coPiDetails: coPis,
        coPiUids: coPis.map((p) => p.uid).filter(Boolean) as string[],
        coPiNames: coPis.map((p) => p.name),
        coPiEmails: coPis.map((p) => p.email.toLowerCase()),
      }
      
      if (registeredByAdmin) {
        newInterestDoc.adminRemarks = `Registered on behalf of the user by ${registeredByAdmin.adminName}.`;
      }

      const interestRef = adminDb.collection("emrInterests").doc()
      transaction.set(interestRef, newInterestDoc)
    })

    const callSnap = await adminDb.collection("fundingCalls").doc(callId).get()
    const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "an EMR call"

    if (isFirstInterest) {
      const adminRoles = ["admin", "Super-admin"]
      const usersRef = adminDb.collection("users")
      const adminQueryRef = usersRef.where("role", "in", adminRoles)
      const adminUsersSnapshot = await adminQueryRef.get()

      if (!adminUsersSnapshot.empty) {
        const batch = adminDb.batch()
        const notificationTitle = `First registration for "${callTitle}". Time to schedule a meeting.`
        adminUsersSnapshot.forEach((userDoc) => {
          const notificationRef = adminDb.collection("notifications").doc()
          batch.set(notificationRef, {
            uid: userDoc.id,
            title: notificationTitle,
            projectId: callId, // Link notification to the call
            createdAt: new Date().toISOString(),
            isRead: false,
          })
        })
        await batch.commit()
      }
    }
    
    // Notify the user who was registered, especially if done by an admin.
    if (user.email) {
      let emailHtml: string;
      if (registeredByAdmin) {
        emailHtml = `<div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${user.name},</p>
            <p style="color:#e0e0e0;">This is to inform you that ${registeredByAdmin.adminName} has registered your interest on your behalf for the EMR funding call: "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
            <p style="color:#e0e0e0;">You can view this application in the "My EMR Applications" section on the EMR Calendar page of the portal.</p>
            ${EMAIL_STYLES.footer}
        </div>`;
      } else {
        emailHtml = `<div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${user.name},</p>
            <p style="color:#e0e0e0;">Your interest for the EMR funding call "<strong style="color:#ffffff;">${callTitle}</strong>" has been successfully registered.</p>
            ${EMAIL_STYLES.footer}
        </div>`;
      }
      await sendEmailUtility({
        to: user.email,
        subject: `Your EMR Interest Registration for: ${callTitle}`,
        html: emailHtml,
        from: 'default'
      });
    }


    if (coPis && coPis.length > 0) {
      const usersRef = adminDb.collection("users")
      const coPiUids = coPis.map((p) => p.uid).filter(Boolean) as string[]

      if (coPiUids.length > 0) {
        const usersQuery = usersRef.where(adminDb.firestore.FieldPath.documentId(), "in", coPiUids)
        const coPiDocs = await usersQuery.get()
        const batch = adminDb.batch()

        for (const userDoc of coPiDocs.docs) {
          const coPi = userDoc.data() as User
          const notificationRef = adminDb.collection("notifications").doc()
          batch.set(notificationRef, {
            uid: coPi.uid,
            title: `You've been added as a Co-PI for the EMR call: "${callTitle}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
          })

          if (coPi.email) {
            await sendEmailUtility({
              to: coPi.email,
              subject: `You've been added to an EMR Application `,
              html: `
                            <div ${EMAIL_STYLES.background}>
                                ${EMAIL_STYLES.logo}
                                <p style="color:#ffffff;">Dear ${coPi.name},</p>
                                <p style="color:#e0e0e0;">You have been added as a Co-PI by ${user.name} for the EMR funding opportunity titled "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
                                 ${EMAIL_STYLES.footer}
                            </div>`,
              from: "default",
            })
          }
        }
        await batch.commit()
      }
    }

    await logActivity("INFO", "EMR interest registered", { callId, userId: user.uid, byAdmin: registeredByAdmin?.adminName })
    return { success: true }
  } catch (error: any) {
    console.error("Error registering EMR interest:", error)
    await logActivity("ERROR", "Failed to register EMR interest", {
      callId,
      userId: user.uid,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to register interest." }
  }
}

export async function scheduleEmrMeeting(
  callId: string,
  meetingDetails: { date: string; time: string; venue: string; pptDeadline: string; evaluatorUids: string[], mode: 'Online' | 'Offline' },
  applicantUids: string[],
) {
  try {
    const { date, time, venue, pptDeadline, evaluatorUids, mode } = meetingDetails
    const timeZone = "Asia/Kolkata"

    if (!evaluatorUids || evaluatorUids.length === 0) {
      return { success: false, error: "An evaluation committee must be assigned." }
    }

    const callRef = adminDb.collection("fundingCalls").doc(callId)
    const callSnap = await callRef.get()
    if (!callSnap.exists) {
      return { success: false, error: "Funding call not found." }
    }
    const call = callSnap.data() as FundingCall

    const batch = adminDb.batch()
    const emailPromises = []

    const meetingDateTimeString = `${date}T${time}:00`
    const pptDeadlineString = pptDeadline

    const subjectOnlineIndicator = mode === 'Online' ? ' (Online)' : '';

    const meetingDate = toDate(meetingDateTimeString, { timeZone });
    
    // Format for ICS
    const startTimeUTC = format(meetingDate, "yyyyMMdd'T'HHmmss'Z'");
    const endTimeUTC = format(addHours(meetingDate, 1), "yyyyMMdd'T'HHmmss'Z'");
    const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");


    for (const userId of applicantUids) {
      const interestsRef = adminDb.collection("emrInterests")
      const q = interestsRef.where("callId", "==", callId).where("userId", "==", userId)
      const interestSnapshot = await q.get()

      if (interestSnapshot.empty) continue

      const interestDoc = interestSnapshot.docs[0]
      const interestRef = interestDoc.ref
      const interest = interestDoc.data() as EmrInterest

      batch.update(interestRef, {
        meetingSlot: { date, time, pptDeadline },
        status: "Evaluation Pending",
        assignedEvaluators: evaluatorUids,
        // clear absence flag if previously marked absent
        wasAbsent: false,
      })

      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: interest.userId,
        title: `Your EMR Presentation for "${call.title}" has been scheduled.`,
        createdAt: new Date().toISOString(),
        isRead: false,
      })

      const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color: #ffffff;">Dear ${interest.userName},</p>
              <p style="color: #e0e0e0;">
                  A presentation slot has been scheduled for you for the EMR funding opportunity, "<strong style="color: #ffffff;">${call.title}</strong>".
              </p>
              <p><strong style="color: #ffffff;">Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
              <p><strong style="color: #ffffff;">${mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                ${mode === 'Online' ? `<a href="${venue}" style="color: #64b5f6; text-decoration: underline;">${venue}</a>` : venue}
              </p>
              <p style="color: #e0e0e0; margin-top: 15px;">
                Please upload your presentation on the portal by <strong style="color:#ffffff;">${formatInTimeZone(pptDeadlineString, timeZone, "PPpp (z)")}</strong>.
              </p>
              ${EMAIL_STYLES.footer}
          </div>
      `
      
      const icalContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//ParulUniversity//RDC-Portal//EN',
          'METHOD:REQUEST',
          'BEGIN:VEVENT',
          `UID:${interest.id}@paruluniversity.ac.in`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${startTimeUTC}`,
          `DTEND:${endTimeUTC}`,
          `SUMMARY:EMR Presentation: ${call.title}`,
          `DESCRIPTION:Your presentation for the EMR funding call titled '${call.title}' has been scheduled.`,
          `LOCATION:${venue}`,
          `ORGANIZER;CN=RDC Parul University:mailto:${process.env.GMAIL_USER || 'helpdesk.rdc@paruluniversity.ac.in'}`,
          `ATTENDEE;CN=${interest.userName};RSVP=TRUE:mailto:${interest.userEmail}`,
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

      if (interest.userEmail) {
        emailPromises.push(
          sendEmailUtility({
            to: interest.userEmail,
            subject: `Your EMR Presentation Slot for: ${call.title}${subjectOnlineIndicator}`,
            html: emailHtml,
            from: "default",
            icalEvent: {
              filename: 'invite.ics',
              method: 'REQUEST',
              content: icalContent
            }
          }),
        )
      }
    }

    // Notify evaluators once
    if (evaluatorUids && evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()))

      for (const evaluatorDoc of evaluatorDocs) {
        if (evaluatorDoc.exists) {
          const evaluator = evaluatorDoc.data() as User

          const evaluatorNotificationRef = adminDb.collection("notifications").doc()
          batch.set(evaluatorNotificationRef, {
            uid: evaluator.uid,
            title: `You've been assigned to an EMR evaluation meeting for "${call.title}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
          })
          
          if (evaluator.email) {
            const emailHtml = `
              <div ${EMAIL_STYLES.background}>
                  ${EMAIL_STYLES.logo}
                  <p style="color: #ffffff;">Dear Evaluator,</p>
                  <p style="color: #e0e0e0;">You have been assigned to an EMR evaluation committee.</p>
                  <p><strong style="color: #ffffff;">Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
                  <p><strong style="color: #ffffff;">Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
                  <p><strong style="color: #ffffff;">${mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                      ${mode === 'Online' ? `<a href="${venue}" style="color: #64b5f6; text-decoration: underline;">${venue}</a>` : venue}
                  </p>
                  <p style="color: #cccccc; margin-top: 15px;">Please review the assigned presentations on the PU Research Projects Portal.</p>
                  ${EMAIL_STYLES.footer}
              </div>
            `;

            const icalContent = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//ParulUniversity//RDC-Portal//EN',
              'METHOD:REQUEST',
              'BEGIN:VEVENT',
              `UID:emr-meeting-${call.id}-${evaluator.uid}@paruluniversity.ac.in`,
              `DTSTAMP:${dtstamp}`,
              `DTSTART:${startTimeUTC}`,
              `DTEND:${endTimeUTC}`,
              `SUMMARY:EMR Evaluation Meeting: ${call.title}`,
              `DESCRIPTION:Evaluation meeting for EMR call: ${call.title}.`,
              `LOCATION:${venue}`,
              `ORGANIZER;CN=RDC Parul University:mailto:${process.env.GMAIL_USER || 'helpdesk.rdc@paruluniversity.ac.in'}`,
              `ATTENDEE;CN=${evaluator.name};RSVP=TRUE:mailto:${evaluator.email}`,
              'END:VEVENT',
              'END:VCALENDAR'
            ].join('\r\n');

            emailPromises.push(
              sendEmailUtility({
                to: evaluator.email,
                subject: `EMR Evaluation Assignment: ${call.title}${subjectOnlineIndicator}`,
                html: emailHtml,
                from: "default",
                icalEvent: {
                  filename: 'invite.ics',
                  method: 'REQUEST',
                  content: icalContent,
                }
              }),
            )
          }
        }
      }
    }

    await batch.commit()
    await Promise.all(emailPromises)
    await logActivity("INFO", "EMR meeting scheduled", { callId, applicantUids, meetingDate: meetingDetails.date })

    return { success: true }
  } catch (error: any) {
    console.error("Error scheduling EMR meeting:", error)
    await logActivity("ERROR", "Failed to schedule EMR meeting", { callId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to schedule EMR meeting." }
  }
}

export async function uploadEmrPpt(
  interestId: string,
  pptDataUrl: string,
  originalFileName: string,
  user: User,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." };
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId);
    const interestSnap = await interestRef.get();
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." };
    }
    const interest = interestSnap.data() as EmrInterest;
    
    const fileExtension = path.extname(originalFileName);
    const standardizedName = `emr_${user.name.replace(/\s+/g, "_")}${fileExtension}`;
    const filePath = `emr-presentations/${interest.callId}/${interest.userId}/${standardizedName}`;
    const result = await uploadFileToServer(pptDataUrl, filePath);

    if (!result.success || !result.url) {
      throw new Error(result.error || "PPT upload failed.");
    }

    await interestRef.update({
      pptUrl: result.url,
      pptSubmissionDate: new Date().toISOString(),
      status: "PPT Submitted",
    });

    if (adminName && interest.userEmail) {
        const callSnap = await adminDb.collection('fundingCalls').doc(interest.callId).get();
        const callTitle = callSnap.exists() ? (callSnap.data() as FundingCall).title : 'your EMR application';
        
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${interest.userName},</p>
                <p style="color:#e0e0e0;">This is to inform you that an administrator, <strong>${adminName}</strong>, has uploaded a presentation on your behalf for the EMR call: "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
                <p style="color:#e0e0e0;">The uploaded presentation is attached to this email for your reference.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        
        await sendEmailUtility({
            to: interest.userEmail,
            subject: `Presentation Uploaded for EMR Call: ${callTitle}`,
            html: emailHtml,
            from: 'default',
            attachments: [{
                filename: originalFileName,
                path: result.url,
            }]
        });
    }

    await logActivity("INFO", "EMR presentation uploaded", { interestId, userId: interest.userId, byAdmin: adminName });
    return { success: true };
  } catch (error: any) {
    console.error("Error uploading EMR presentation:", error);
    await logActivity("ERROR", "Failed to upload EMR presentation", {
      interestId,
      error: error.message,
      stack: error.stack,
    });
    return { success: false, error: error.message || "Failed to upload presentation." };
  }
}

export async function removeEmrPpt(interestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) {
      return { success: false, error: "Interest ID is required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    if (interest.pptUrl) {
      const bucket = adminStorage.bucket()
      const url = new URL(interest.pptUrl)
      const filePath = decodeURIComponent(url.pathname.substring(url.pathname.indexOf("/o/") + 3))

      try {
        await bucket.file(filePath).delete()
        console.log(`Deleted file from Storage: ${filePath}`)
      } catch (storageError: any) {
        // If the file doesn't exist, we can ignore the error and proceed.
        if (storageError.code !== 404) {
          throw storageError
        }
        console.warn(`Storage file not found during deletion, but proceeding: ${filePath}`)
      }
    }

    await interestRef.update({
      pptUrl: FieldValue.delete(),
      pptSubmissionDate: FieldValue.delete(),
    })
    await logActivity("INFO", "EMR presentation removed", { interestId, userId: interest.userId })
    return { success: true }
  } catch (error: any) {
    console.error("Error removing EMR presentation:", error)
    await logActivity("ERROR", "Failed to remove EMR presentation", {
      interestId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to remove presentation." }
  }
}

export async function withdrawEmrInterest(interestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) {
      return { success: false, error: "Interest ID is required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()

    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    // If a presentation was uploaded, delete it from storage first.
    if (interest.pptUrl) {
      await removeEmrPpt(interest.id)
    }

    // Delete the interest document from Firestore.
    await interestRef.delete()
    await logActivity("INFO", "User withdrew EMR interest", {
      interestId,
      userId: interest.userId,
      callId: interest.callId,
    })
    return { success: true }
  } catch (error: any) {
    const interestSnap = await adminDb.collection("emrInterests").doc(interestId).get()
    const interest = interestSnap.exists ? (interestSnap.data() as EmrInterest) : null
    await logActivity("ERROR", "Failed to withdraw EMR interest", {
      interestId,
      userId: interest?.userId,
      callId: interest?.callId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to withdraw interest." }
  }
}

export async function deleteEmrInterest(
  interestId: string,
  remarks: string,
  adminName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) return { success: false, error: "Interest ID is required." }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) return { success: false, error: "Interest registration not found." }

    const interest = interestSnap.data() as EmrInterest
    const callRef = adminDb.collection("fundingCalls").doc(interest.callId)
    const callSnap = await callRef.get()
    const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "an EMR call"

    // Withdraw interest to also handle file deletion
    await withdrawEmrInterest(interestId)

    // Notify the user
    const notification = {
      uid: interest.userId,
      title: `Your EMR registration for "${callTitle}" was removed.`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (interest.userEmail) {
      await sendEmailUtility({
        to: interest.userEmail,
        subject: `Update on your EMR Interest for: ${callTitle}`,
        html: `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <p style="color:#ffffff;">Dear ${interest.userName},</p>
                        <p style="color:#e0e0e0;">Your registration of interest for the EMR funding call, "<strong style="color:#ffffff;">${callTitle}</strong>," has been removed by the administration.</p>
                        <div style="margin-top: 20px; padding: 15px; border: 1px solid #4f5b62; border-radius: 6px; background-color:#2c3e50;">
                            <h4 style="color:#ffffff; margin-top: 0;">Remarks from ${adminName}:</h4>
                            <p style="color:#e0e0e0;">${remarks}</p>
                        </div>
                        <p style="color:#e0e0e0;">If you have any questions, please contact the RDC helpdesk.</p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `,
        from: "default",
      })
    }
    await logActivity("INFO", "Admin deleted EMR interest", {
      interestId,
      userId: interest.userId,
      callId: interest.callId,
      adminName,
      remarks,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting EMR interest:", error)
    await logActivity("ERROR", "Failed to delete EMR interest", {
      interestId,
      adminName,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to delete interest." }
  }
}

export async function addEmrEvaluation(
  interestId: string,
  evaluator: User,
  evaluationData: { recommendation: EmrEvaluation["recommendation"]; comments: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const evaluationRef = adminDb
      .collection("emrInterests")
      .doc(interestId)
      .collection("evaluations")
      .doc(evaluator.uid)

    const newEvaluation: EmrEvaluation = {
      evaluatorUid: evaluator.uid,
      evaluatorName: evaluator.name,
      evaluationDate: new Date().toISOString(),
      ...evaluationData,
    }

    await evaluationRef.set(newEvaluation, { merge: true });

    const interestRef = adminDb.collection("emrInterests").doc(interestId);
    await interestRef.update({
        evaluatedBy: FieldValue.arrayUnion(evaluator.uid)
    });

    await logActivity("INFO", "EMR evaluation added", { interestId, evaluatorUid: evaluator.uid })

    // Notify Super Admins
    const interestSnap = await adminDb.collection("emrInterests").doc(interestId).get()
    if (interestSnap.exists) {
      const interest = interestSnap.data() as EmrInterest
      const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
      if (!superAdminUsersSnapshot.empty) {
        const batch = adminDb.batch()
        const notificationTitle = `EMR evaluation submitted for ${interest.userName} by ${evaluator.name}`
        superAdminUsersSnapshot.forEach((userDoc) => {
          const notificationRef = adminDb.collection("notifications").doc()
          batch.set(notificationRef, {
            uid: userDoc.id,
            title: notificationTitle,
            createdAt: new Date().toISOString(),
            isRead: false,
          })
        })
        await batch.commit()
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error adding EMR evaluation:", error)
    await logActivity("ERROR", "Failed to add EMR evaluation", {
      interestId,
      evaluatorUid: evaluator.uid,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to submit evaluation." }
  }
}

export async function createFundingCall(
  callData: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    const newCallDocRef = adminDb.collection("fundingCalls").doc()
    const attachments: { name: string; url: string }[] = []

    if (callData.attachments && callData.attachments.length > 0) {
      for (const attachment of callData.attachments) {
        const path = `emr-attachments/${newCallDocRef.id}/${attachment.name}`
        const result = await uploadFileToServer(attachment.dataUrl, path)
        if (result.success && result.url) {
          attachments.push({ name: attachment.name, url: result.url })
        } else {
          throw new Error(`Failed to upload attachment: ${attachment.name}`)
        }
      }
    }

    // Transaction to generate a new sequential ID
    const newCallData = await adminDb.runTransaction(async (transaction) => {
      const counterRef = adminDb.collection("counters").doc("emrCall")
      const counterDoc = await transaction.get(counterRef)

      let newCount = 1
      if (counterDoc.exists && counterDoc.data()?.current) {
        newCount = counterDoc.data()!.current + 1
      }
      transaction.set(counterRef, { current: newCount }, { merge: true })

      const callIdentifier = `RDC/EMR/CALL/${String(newCount).padStart(5, "0")}`

      const newCall: Omit<FundingCall, "id"> = {
        callIdentifier: callIdentifier,
        title: callData.title,
        agency: callData.agency,
        description: callData.description,
        callType: callData.callType,
        applyDeadline: callData.applyDeadline.toISOString(),
        interestDeadline: callData.interestDeadline.toISOString(),
        detailsUrl: callData.detailsUrl,
        attachments: attachments,
        createdAt: new Date().toISOString(),
        createdBy: "Super-admin",
        status: "Open",
        isAnnounced: callData.notifyAllStaff,
      }

      transaction.set(newCallDocRef, newCall)
      return { id: newCallDocRef.id, ...newCall }
    })

    if (callData.notifyAllStaff) {
      await announceEmrCall(newCallData.id)
    }
    await logActivity("INFO", "New funding call created", { callId: newCallData.id, title: newCallData.title })

    return { success: true }
  } catch (error: any) {
    console.error("Error creating funding call:", error)
    await logActivity("ERROR", "Failed to create funding call", {
      title: callData.title,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to create funding call." }
  }
}

export async function announceEmrCall(callId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const vadodaraEmail = process.env.ALL_STAFF_EMAIL_VADODARA;

    if (!vadodaraEmail) {
      return {
        success: false,
        error: "Staff email address is not configured on the server. Please add ALL_STAFF_EMAIL_VADODARA to the .env file.",
      }
    }

    const callRef = adminDb.collection("fundingCalls").doc(callId)
    const callSnap = await callRef.get()

    if (!callSnap.exists) {
      return { success: false, error: "Funding call not found." }
    }
    const call = callSnap.data() as FundingCall
    const timeZone = "Asia/Kolkata"

    const emailAttachments = (call.attachments || []).map((att) => ({ filename: att.name, path: att.url }))

    let emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color: #ffffff; text-align: center;">New Funding Opportunity: ${call.title}</h2>
        <p style="color:#e0e0e0;">A new funding call from <strong style="color:#ffffff;">${call.agency}</strong> has been posted on the PU Research Projects Portal.</p>
        <div style="padding: 15px; border: 1px solid #4f5b62; border-radius: 8px; margin-top: 20px; background-color:#2c3e50;">
          <div style="color:#e0e0e0;" class="prose prose-sm">${call.description || "No description provided."}</div>
          <p style="color:#e0e0e0;"><strong>Register Interest By:</strong> ${formatInTimeZone(call.interestDeadline, timeZone, "PPpp (z)")}</p>
          <p style="color:#e0e0e0;"><strong>Agency Deadline:</strong> ${formatInTimeZone(call.applyDeadline, timeZone, "PP (z)")}</p>
        </div>
    `

    if (emailAttachments.length > 0) {
      emailHtml += `<p style="color:#e0e0e0; margin-top: 20px;">Please find the relevant documents attached to this email.</p>`
    }

    emailHtml += `
        <p style="margin-top: 20px; text-align: center; display: flex; justify-content: center; align-items: center; gap: 10px;">
          <a href="https://rndprojects.paruluniversity.ac.in/login" style="background-color: #64B5F6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
            View Full Details on the Portal
          </a>
    `

    if (call.detailsUrl) {
      emailHtml += `
          <a href="${call.detailsUrl}" style="background-color: transparent; border: 1px solid #64B5F6; color: #64B5F6; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
            Learn More on Funding Agency Website
          </a>
      `
    }

    emailHtml += `
        </p>
         ${EMAIL_STYLES.footer}
      </div>
    `

    await sendEmailUtility({
      to: vadodaraEmail,
      subject: `New Funding Call: ${call.title}`,
      from: "rdc",
      attachments: emailAttachments,
      html: emailHtml,
    })

    // Mark the call as announced
    await callRef.update({ isAnnounced: true })
    await logActivity("INFO", "EMR call announced", { callId, title: call.title })

    return { success: true }
  } catch (error: any) {
    console.error("Error announcing EMR call:", error)
    await logActivity("ERROR", "Failed to announce EMR call", { callId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to send announcement." }
  }
}

export async function updateEmrStatus(
  interestId: string,
  status: EmrInterest["status"],
  adminRemarks?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const updateData: { [key: string]: any } = { status }

    if (adminRemarks) {
      updateData.adminRemarks = adminRemarks
    }

    if (status === "Endorsement Signed") {
      updateData.endorsementSignedAt = new Date().toISOString()
    }
    if (status === "Submitted to Agency") {
      updateData.submittedToAgencyAt = new Date().toISOString()
    }

    await interestRef.update(updateData)
    const interestSnap = await interestRef.get()
    const interest = interestSnap.data() as EmrInterest
    await logActivity("INFO", "EMR interest status updated", { interestId, userId: interest.userId, newStatus: status })

    // Notify user
    if (interestSnap.exists) {
      const notification = {
        uid: interest.userId,
        title: `Your EMR application status has been updated to: ${status}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      }
      await adminDb.collection("notifications").add(notification)

      if (interest.userEmail) {
        let emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${interest.userName},</p>
                <p style="color:#e0e0e0;">The status of your EMR application has been updated to <strong style="color:#ffffff;">${status}</strong>.</p>
                ${adminRemarks ? `<div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;"><h4 style="color:#ffffff; margin-top:0;">Admin Remarks:</h4><p style="color:#e0e0e0;">${adminRemarks}</p></div>` : ""}
        `

        if (status === "Recommended") {
          emailHtml += `<p style="color:#e0e0e0; margin-top:15px;">Congratulations! Your application has been recommended. The next step is to submit your endorsement form, which you can do from the EMR Calendar page on the portal.</p>`
        }

        if (status === "Endorsement Signed") {
          emailHtml += `<p style="color:#e0e0e0; margin-top:15px;">Your endorsement letter has been signed and is ready for collection from the RDC office. You may now submit your proposal to the funding agency. Once submitted, please log the Agency Reference Number and Acknowledgement on the portal.</p>`
        }

        if (status === "Revision Needed") {
          const callSnap = await adminDb.collection("fundingCalls").doc(interest.callId).get()
          if (callSnap.exists) {
            const call = callSnap.data() as FundingCall
            if (call.meetingDetails?.date) {
                const meetingDateTime = new Date(call.meetingDetails.date.replace(/-/g, '/')); // Safer date parsing
                const deadline = setSeconds(setMinutes(setHours(addDays(meetingDateTime, 3), 17), 0), 0); // 3 days after meeting at 5:00 PM
                emailHtml += `<p style="color:#e0e0e0; margin-top:15px;">Please submit your revised presentation on the portal by <strong style="color:#ffffff;">${formatInTimeZone(deadline, "Asia/Kolkata", "PPpp (z)")}</strong>.</p>`
            }
          }
        }

        emailHtml += `<p style="color:#e0e0e0;">Please check the portal for more details.</p>${EMAIL_STYLES.footer}</div>`

        await sendEmailUtility({
          to: interest.userEmail,
          subject: `Update on your EMR Application`,
          html: emailHtml,
          from: "default",
        })
      }
    }
    return { success: true }
  } catch (error: any) {
    console.error("Error updating EMR status:", error)
    await logActivity("ERROR", "Failed to update EMR status", {
      interestId,
      status,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update status." }
  }
}

export async function uploadRevisedEmrPpt(
  interestId: string,
  pptDataUrl: string,
  originalFileName: string,
  user: User,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." };
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId);
    const interestSnap = await interestRef.get();
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." };
    }
    const interest = interestSnap.data() as EmrInterest;
    
    const fileExtension = path.extname(originalFileName);
    const standardizedName = `${user.name.replace(/\s+/g, "_")}_revised_${new Date().getTime()}${fileExtension}`;
    const filePath = `emr-presentations/${interest.callId}/${interest.userId}/${standardizedName}`;
    const result = await uploadFileToServer(pptDataUrl, filePath);

    if (!result.success || !result.url) {
      throw new Error(result.error || "Revised PPT upload failed.");
    }

    await interestRef.update({
      revisedPptUrl: result.url,
      status: "Revision Submitted",
    });

    if (adminName && interest.userEmail) {
      const callSnap = await adminDb.collection('fundingCalls').doc(interest.callId).get();
      const callTitle = callSnap.exists() ? (callSnap.data() as FundingCall).title : 'your EMR application';
      
      const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${interest.userName},</p>
              <p style="color:#e0e0e0;">This is to inform you that an administrator, <strong>${adminName}</strong>, has uploaded a revised presentation on your behalf for the EMR call: "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
              <p style="color:#e0e0e0;">The uploaded file is attached to this email for your reference.</p>
              ${EMAIL_STYLES.footer}
          </div>
      `;
      
      await sendEmailUtility({
          to: interest.userEmail,
          subject: `Revised Presentation Uploaded for EMR Call: ${callTitle}`,
          html: emailHtml,
          from: 'default',
          attachments: [{
              filename: originalFileName,
              path: result.url,
          }]
      });
    }

    await logActivity("INFO", "Revised EMR presentation uploaded", { interestId, userId: interest.userId, byAdmin: adminName });
    return { success: true };
  } catch (error: any) {
    console.error("Error uploading revised EMR presentation:", error);
    await logActivity("ERROR", "Failed to upload revised EMR presentation", {
      interestId,
      error: error.message,
      stack: error.stack,
    });
    return { success: false, error: error.message || "Failed to upload presentation." };
  }
}

export async function uploadEndorsementForm(
  interestId: string,
  endorsementUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !endorsementUrl) {
      return { success: false, error: "Interest ID and endorsement form URL are required." }
    }
    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    await interestRef.update({
      endorsementFormUrl: endorsementUrl,
      status: "Endorsement Submitted",
    })
    const interestSnap = await interestRef.get()
    const interest = interestSnap.data() as EmrInterest
    await logActivity("INFO", "EMR endorsement form uploaded", { interestId, userId: interest.userId })
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting endorsement form:", error)
    await logActivity("ERROR", "Failed to upload EMR endorsement form", {
      interestId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to submit endorsement form." }
  }
}

export async function submitToAgency(
  interestId: string,
  referenceNumber: string,
  acknowledgementUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !referenceNumber) {
      return { success: false, error: "Interest ID and reference number are required." }
    }
    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const updateData: { [key: string]: any } = {
      agencyReferenceNumber: referenceNumber,
      status: "Submitted to Agency",
      submittedToAgencyAt: new Date().toISOString(),
    }
    if (acknowledgementUrl) {
      updateData.agencyAcknowledgementUrl = acknowledgementUrl
    }
    await interestRef.update(updateData)
    const interestSnap = await interestRef.get()
    const interest = interestSnap.data() as EmrInterest
    await logActivity("INFO", "EMR application submitted to agency", {
      interestId,
      userId: interest.userId,
      referenceNumber,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting to agency:", error)
    await logActivity("ERROR", "Failed to log EMR submission to agency", {
      interestId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to log submission to agency." }
  }
}

type EmrUploadData = {
  "Name of the Project": string
  Scheme?: string
  "Funding Agency": string
  "Total Amount": number
  "PI Name": string
  "PI Email": string
  "Duration of Project": string
  sanction_date?: string | number | Date
  [key: string]: any
}

export async function bulkUploadEmrProjects(projectsData: EmrUploadData[]): Promise<{
  success: boolean
  data: {
    successfulCount: number
    failures: { projectTitle: string; piName: string; error: string }[]
    linkedUserCount: number
  }
  error?: string
}> {
  let successfulCount = 0
  const failures: { projectTitle: string; piName: string; error: string }[] = []
  const linkedUserIds = new Set<string>()

  const allEmails = new Set<string>()
  projectsData.forEach((row) => {
    if (row["PI Email"]) {
      allEmails.add(row["PI Email"].toLowerCase())
    }
    Object.keys(row).forEach((key) => {
      if (key.toLowerCase().startsWith("co-pi") && row[key]) {
        allEmails.add(String(row[key]).toLowerCase())
      }
    })
  })

  const usersRef = adminDb.collection("users")
  const userChunks: string[][] = []
  const emailsArray = Array.from(allEmails)
  for (let i = 0; i < emailsArray.length; i += 30) {
    userChunks.push(emailsArray.slice(i, i + 30))
  }

  const usersMap = new Map<string, { uid: string; name: string; faculty: string; department: string }>()
  for (const chunk of userChunks) {
    if (chunk.length === 0) continue
    const userQuery = await usersRef.where("email", "in", chunk).get()
    userQuery.forEach((doc) => {
      const userData = doc.data() as User
      usersMap.set(userData.email.toLowerCase(), {
        uid: doc.id,
        name: userData.name,
        faculty: userData.faculty || "N/A",
        department: userData.department || "N/A",
      })
    })
  }

  for (const row of projectsData) {
    const projectTitle = row["Name of the Project"] || `${row["Scheme"] || "General"} - ${row["Funding Agency"]}`
    const piEmail = row["PI Email"]?.toLowerCase()

    try {
      const piInfo = usersMap.get(piEmail)

      const coPiEmails = Object.keys(row)
        .filter((key) => key.toLowerCase().startsWith("co-pi"))
        .map((key) => String(row[key]).toLowerCase())
        .filter((email) => email)

      const coPiUids = coPiEmails.map((email) => usersMap.get(email)?.uid).filter((uid): uid is string => !!uid)
      const coPiNames = coPiEmails.map((email) => usersMap.get(email)?.name || email).filter(Boolean)

      const coPiDetails: CoPiDetails[] = coPiEmails.map((email) => {
        const user = usersMap.get(email)
        return {
          email,
          name: user?.name || email.split("@")[0],
          uid: user?.uid || null,
        }
      })

      const interestDoc: Omit<EmrInterest, "id"> = {
        callId: "BULK_UPLOADED",
        callTitle: projectTitle,
        userId: piInfo?.uid || "",
        userName: piInfo?.name || row["PI Name"],
        userEmail: piEmail || "",
        faculty: piInfo?.faculty || "N/A",
        department: piInfo?.department || "N/A",
        registeredAt: new Date().toISOString(),
        status: "Sanctioned",
        coPiDetails: coPiDetails,
        coPiUids,
        coPiNames,
        coPiEmails,
        agency: row["Funding Agency"],
        durationAmount: `Amount: ${row["Total Amount"]?.toLocaleString("en-IN")} | Duration: ${row["Duration of Project"]}`,
        isBulkUploaded: true,
        isOpenToPi: false,
      }

      if (row.sanction_date) {
        if (row.sanction_date instanceof Date) {
          interestDoc.sanctionDate = row.sanction_date.toISOString()
        } else if (typeof row.sanction_date === "number") {
          interestDoc.sanctionDate = excelDateToJSDate(row.sanction_date).toISOString()
        } else if (typeof row.sanction_date === "string") {
          const parsedDate = new Date(row.sanction_date.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1"))
          if (!isNaN(parsedDate.getTime())) {
            interestDoc.sanctionDate = parsedDate.toISOString()
          }
        }
      }

      await adminDb.collection("emrInterests").add(interestDoc)
      successfulCount++
      if (piInfo?.uid) {
        linkedUserIds.add(piInfo.uid)
      }
    } catch (error: any) {
      failures.push({ projectTitle, piName: row["PI Name"], error: error.message || "An unknown error occurred." })
    }
  }

  await logActivity("INFO", "Bulk EMR upload completed", {
    successfulCount,
    failureCount: failures.length,
    linkedUserCount: linkedUserIds.size,
  })
  if (failures.length > 0) {
    await logActivity("WARNING", "Some EMR projects failed during bulk upload", { failures })
  }

  return { success: true, data: { successfulCount, failures, linkedUserCount: linkedUserIds.size } }
}

export async function updateEmrInterestCoPis(
  interestId: string,
  coPis: CoPiDetails[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    const existingCoPiUids = new Set(interest.coPiUids || [])
    const newCoPiUids = new Set(coPis.map((c) => c.uid).filter((uid): uid is string => !!uid))

    // Find newly added Co-PIs
    const addedUids = [...newCoPiUids].filter((uid) => !existingCoPiUids.has(uid))

    // Update the document
    await interestRef.update({
      coPiDetails: coPis,
      coPiUids: Array.from(newCoPiUids),
      coPiNames: coPis.map((c) => c.name),
      coPiEmails: coPis.map((c) => c.email.toLowerCase()),
    })

    // Send notifications to newly added Co-PIs
    if (addedUids.length > 0) {
      const usersRef = adminDb.collection("users")
      const usersQuery = usersRef.where(adminDb.firestore.FieldPath.documentId(), "in", addedUids)
      const newCoPiDocs = await usersQuery.get()
      const batch = adminDb.batch()

      for (const userDoc of newCoPiDocs.docs) {
        const coPi = userDoc.data() as User
        const notificationRef = adminDb.collection("notifications").doc()
        batch.set(notificationRef, {
          uid: coPi.uid,
          title: `You've been added as a Co-PI to the EMR project: "${interest.callTitle}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })

        if (coPi.email) {
          await sendEmailUtility({
            to: coPi.email,
            subject: `You've been added to an EMR Project`,
            html: `
                            <div ${EMAIL_STYLES.background}>
                                ${EMAIL_STYLES.logo}
                                <p style="color:#ffffff;">Dear ${coPi.name},</p>
                                <p style="color:#e0e0e0;">You have been added as a Co-PI by ${interest.userName} for the EMR project titled "<strong style="color:#ffffff;">${interest.callTitle}</strong>".</p>
                                ${EMAIL_STYLES.footer}
                            </div>`,
            from: "default",
          })
        }
      }
      await batch.commit()
    }

    await logActivity("INFO", "EMR interest Co-PIs updated", { interestId, added: addedUids.length })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating EMR interest Co-PIs:", error)
    await logActivity("ERROR", "Failed to update EMR Co-PIs", { interestId, error: error.message, stack: error.stack })
    return { success: false, error: "Failed to update Co-PIs." }
  }
}

export async function updateEmrInterestDetails(
    interestId: string,
    updates: Partial<EmrInterest>
): Promise<{ success: boolean; error?: string }> {
    try {
        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        await interestRef.update(updates);
        await logActivity('INFO', 'EMR interest details updated', { interestId, updates });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating EMR interest details:", error);
        await logActivity('ERROR', 'Failed to update EMR interest details', {
            interestId,
            error: error.message,
            stack: error.stack
        });
        return { success: false, error: 'Failed to update details.' };
    }
}

export async function signAndUploadEndorsement(interestId: string, signedEndorsementDataUrl: string, fileName: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!interestId || !signedEndorsementDataUrl) {
            return { success: false, error: "Interest ID and signed endorsement form URL are required." };
        }
        
        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const interestSnap = await interestRef.get();
        if (!interestSnap.exists) {
            return { success: false, error: "Interest registration not found." };
        }
        const interest = interestSnap.data() as EmrInterest;
        
        const path = `emr-endorsements/${interest.callId}/${interest.userId}/signed_${fileName}`;
        const uploadResult = await uploadFileToServer(signedEndorsementDataUrl, path);

        if (!uploadResult.success || !uploadResult.url) {
            throw new Error(uploadResult.error || "Failed to upload signed endorsement form.");
        }
        
        await interestRef.update({
            signedEndorsementUrl: uploadResult.url,
            status: 'Endorsement Signed',
            endorsementSignedAt: new Date().toISOString()
        });
        
        await logActivity('INFO', 'EMR endorsement form signed and uploaded', { interestId, userId: interest.userId });
        
        if (interest.userEmail) {
            // Fetch the call title to ensure it's in the email
            const callRef = adminDb.collection("fundingCalls").doc(interest.callId);
            const callSnap = await callRef.get();
            const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : interest.callTitle || 'N/A';

            const emailHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${interest.userName},</p>
                    <p style="color:#e0e0e0;">Your endorsement form for the EMR call "<strong style="color:#ffffff;">${callTitle}</strong>" has been signed and uploaded by the RDC.</p>
                    <p style="color:#e0e0e0;">You can now proceed to submit the application to the funding agency. Once submitted, please log the submission details on the portal.</p>
                    <p style="color:#cccccc;">The signed document is attached for your records and can also be viewed in your EMR application details on the portal.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;
            await sendEmailUtility({
                to: interest.userEmail,
                cc: interest.coPiEmails?.join(','),
                subject: `Your EMR Endorsement Form is Ready`,
                html: emailHtml,
                from: 'default',
                attachments: [{
                    filename: `Signed_Endorsement_${interest.userName.replace(/\s/g, '_')}.pdf`,
                    path: uploadResult.url
                }]
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error signing endorsement form:", error);
        await logActivity('ERROR', 'Failed to sign and upload EMR endorsement form', {
            interestId,
            error: error.message,
            stack: error.stack
        });
        return { success: false, error: 'Failed to sign and upload endorsement form.' };
    }
}

export async function updateEmrFinalStatus(interestId: string, status: 'Sanctioned' | 'Not Sanctioned', proofDataUrl: string, fileName: string): Promise<{ success: boolean, error?: string }> {
    try {
        if (!interestId || !status || !proofDataUrl) {
            return { success: false, error: "Interest ID, status, and proof are required." };
        }

        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const interestSnap = await interestRef.get();
        if (!interestSnap.exists) {
            return { success: false, error: "Interest registration not found." };
        }
        const interest = interestSnap.data() as EmrInterest;

        // Upload proof
        const path = `emr-final-proofs/${interest.callId}/${interest.userId}/${fileName}`;
        const uploadResult = await uploadFileToServer(proofDataUrl, path);
        if (!uploadResult.success || !uploadResult.url) {
            throw new Error(uploadResult.error || "Failed to upload final proof.");
        }

        // Update interest document
        await interestRef.update({
            status,
            finalProofUrl: uploadResult.url,
        });

        // Notify Super Admins
        const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get();
        if (!superAdminUsersSnapshot.empty) {
            const batch = adminDb.batch();
            const notificationTitle = `EMR final status for ${interest.userName} updated to: ${status}`;
            superAdminUsersSnapshot.forEach(userDoc => {
                const notificationRef = adminDb.collection("notifications").doc();
                batch.set(notificationRef, {
                    uid: userDoc.id,
                    title: notificationTitle,
                    createdAt: new Date().toISOString(),
                    isRead: false
                });
            });
            await batch.commit();
        }

        await logActivity('INFO', 'EMR final status updated', { interestId, userId: interest.userId, newStatus: status });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating EMR final status:", error);
        await logActivity('ERROR', 'Failed to update EMR final status', {
            interestId,
            status,
            error: error.message,
            stack: error.stack
        });
        return { success: false, error: 'Failed to update final status.' };
    }
}

export async function markEmrAttendance(callId: string, absentApplicantIds: string[], absentEvaluatorUids: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const batch = adminDb.batch();

        // Handle absent applicants
        for (const interestId of absentApplicantIds) {
            const interestRef = adminDb.collection('emrInterests').doc(interestId);
            batch.update(interestRef, {
                status: 'Awaiting Rescheduling',
                wasAbsent: true,
                adminRemarks: 'Marked as absent from the evaluation meeting.',
                meetingSlot: FieldValue.delete(), // Remove the meeting slot to allow rescheduling
            });
        }
        
        // Handle absent evaluators
        if (absentEvaluatorUids.length > 0) {
            const callRef = adminDb.collection('fundingCalls').doc(callId);
            batch.update(callRef, {
                'meetingDetails.absentEvaluators': FieldValue.arrayUnion(...absentEvaluatorUids)
            });
        }

        await batch.commit();
        await logActivity('INFO', 'EMR meeting attendance marked', { callId, absentApplicantIds, absentEvaluatorUids });
        return { success: true };
    } catch (error: any) {
        console.error("Error marking EMR attendance:", error);
        await logActivity('ERROR', 'Failed to mark EMR attendance', {
            callId,
            error: error.message,
            stack: error.stack
        });
        return { success: false, error: "Failed to update attendance." };
    }
}

export async function sendPptReminderEmails(callId: string): Promise<{ success: boolean, sentCount: number, error?: string }> {
  try {
    const callRef = adminDb.collection("fundingCalls").doc(callId);
    const callSnap = await callRef.get();
    if (!callSnap.exists) {
        return { success: false, sentCount: 0, error: "Funding call not found." };
    }
    const call = callSnap.data() as FundingCall;

    const interestsRef = adminDb.collection("emrInterests");
    const q = query(
      interestsRef,
      where('callId', '==', callId),
      where('status', '==', 'Evaluation Pending'), // Check for interests that are scheduled
      where('pptUrl', '==', null) // Only select those who haven't uploaded
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { success: true, sentCount: 0, error: 'All applicants have already uploaded their presentations.' };
    }

    const reminderPromises = snapshot.docs.map(doc => {
      const interest = doc.data() as EmrInterest;
      if (interest.userEmail && interest.meetingSlot) {
        const deadline = new Date(interest.meetingSlot.pptDeadline);
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
              <p style="color:#ffffff;">Dear ${interest.userName},</p>
              <p style="color:#cccccc;">
                This is a friendly reminder to upload your presentation for the EMR funding call, "<strong style="color:#ffffff;">${call.title}</strong>".
              </p>
              <p><strong style="color:#ffffff;">Your submission deadline is ${formatInTimeZone(deadline, 'Asia/Kolkata', 'PPpp (z)')}.</strong></p>
              <p style="color:#cccccc;">Please upload your presentation from the EMR Calendar page on the portal as soon as possible.</p>
              ${EMAIL_STYLES.footer}
            </div>
        `;
        return sendEmailUtility({
          to: interest.userEmail,
          subject: `Reminder: EMR Presentation Submission for "${call.title}"`,
          html: emailHtml,
          from: 'default'
        });
      }
      return Promise.resolve();
    });

    await Promise.all(reminderPromises);

    await logActivity("INFO", `Sent ${reminderPromises.length} manual PPT reminders`, { callId });
    return { success: true, sentCount: reminderPromises.length };

  } catch (error: any) {
    console.error('Error sending manual PPT reminders:', error);
    await logActivity("ERROR", 'Failed to send manual PPT reminders', { callId, error: error.message, stack: error.stack });
    return { success: false, sentCount: 0, error: 'Failed to send reminders.' };
  }
}
    
export async function addSanctionedEmrProject(data: {
    pi: { uid: string, name: string, email: string };
    coPis: CoPiDetails[];
    title: string;
    agency: string;
    sanctionDate?: Date;
    durationAmount: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const piUserSnap = await adminDb.collection('users').doc(data.pi.uid).get();
        if (!piUserSnap.exists) {
            return { success: false, error: "Principal Investigator not found." };
        }
        const piUser = piUserSnap.data() as User;

        const newInterestDoc: Omit<EmrInterest, "id"> = {
            callId: "ADMIN_ADDED",
            callTitle: data.title,
            agency: data.agency,
            userId: data.pi.uid,
            userName: data.pi.name,
            userEmail: data.pi.email,
            faculty: piUser.faculty || 'N/A',
            department: piUser.department || 'N/A',
            registeredAt: new Date().toISOString(),
            status: "Sanctioned",
            durationAmount: data.durationAmount,
            sanctionDate: data.sanctionDate?.toISOString(),
            coPiDetails: data.coPis,
            coPiUids: data.coPis.map(p => p.uid).filter((uid): uid is string => !!uid),
            coPiNames: data.coPis.map(p => p.name),
            coPiEmails: data.coPis.map(p => p.email),
            isBulkUploaded: true, 
            isOpenToPi: true, 
        };

        const docRef = await adminDb.collection("emrInterests").add(newInterestDoc);
        
        // Notify PI
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${data.pi.name},</p>
                <p style="color:#e0e0e0;">An administrator has added your sanctioned Extramural Research (EMR) project, "<strong style="color:#ffffff;">${data.title}</strong>," to the R&D Portal.</p>
                <p style="color:#e0e0e0; font-weight: bold; margin-top: 20px;">You are requested to kindly upload the sanction proof of the project to the portal as per your earliest convenience.</p>
                <p style="text-align:center; margin-top:25px;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/my-projects" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Go to My Projects
                    </a>
                </p>
                ${EMAIL_STYLES.footer}
            </div>
        `;

        await sendEmailUtility({
            to: data.pi.email,
            subject: `Your EMR Project "${data.title}" has been Added to the R&D Portal`,
            html: emailHtml,
            from: 'default',
        });
        
        await logActivity('INFO', 'Admin manually added sanctioned EMR project', { projectId: docRef.id, title: data.title });

        return { success: true };
    } catch (error: any) {
        console.error("Error adding sanctioned EMR project:", error);
        await logActivity('ERROR', 'Failed to add sanctioned EMR project', { error: error.message });
        return { success: false, error: 'Failed to add the project.' };
    }
}






    

    










