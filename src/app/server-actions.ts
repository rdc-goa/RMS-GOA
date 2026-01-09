
'use server'

import { adminDb, adminStorage } from "@/lib/admin"
import { FieldValue } from "firebase-admin/firestore"
import admin from "firebase-admin"
import type {
  Project,
  IncentiveClaim,
  User,
  GrantDetails,
  GrantPhase,
  Transaction,
  EmrInterest,
  FundingCall,
  EmrEvaluation,
  ResearchPaper,
  SystemSettings,
  LoginOtp,
  CoPiDetails,
  Author,
} from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import fs from "fs"
import path from "path"
import { addDays, setHours, setMinutes, setSeconds, isToday, format, parseISO, addHours } from "date-fns"
import { formatInTimeZone, toDate } from "date-fns-tz"
import type * as z from "zod"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import { awardInitialGrant, addGrantPhase, updatePhaseStatus } from "./grant-actions"
import { generateSanctionOrder } from "./document-actions"
import { put } from '@vercel/blob';

// --- Centralized Logging Service ---
export async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
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

export { awardInitialGrant, addGrantPhase, updatePhaseStatus, generateSanctionOrder };

export async function deleteImrProject(
  projectId: string,
  reason: string,
  deletedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project

    // --- Clean up subcollections ---
    const evaluationsRef = projectRef.collection("evaluations")
    const evaluationsSnap = await evaluationsRef.get()
    const batch = adminDb.batch()
    evaluationsSnap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()

    // --- Clean up associated files in Storage ---
    const bucket = adminStorage.bucket()
    const prefix = `projects/${projectId}/`
    await bucket.deleteFiles({ prefix })

    // --- Delete the main project document ---
    await projectRef.delete()

    // --- Notify the PI ---
    if (project.pi_email) {
      const emailHtml = `
        <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${project.pi},</p>
            <p style="color:#e0e0e0;">
                This is to inform you that your IMR project submission, "<strong style="color:#ffffff;">${project.title}</strong>," has been deleted from the portal by an administrator.
            </p>
            <div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;">
                <h4 style="color:#ffffff; margin-top:0;">Reason for Deletion:</h4>
                <p style="color:#e0e0e0; white-space: pre-wrap;">${reason}</p>
            </div>
            <p style="color:#e0e0e0; margin-top:20px;">
                If you believe this is an error or have any questions, please contact the RDC office.
            </p>
            ${EMAIL_STYLES.footer}
        </div>`

      await sendEmailUtility({
        to: project.pi_email,
        subject: `Regarding Your IMR Project Submission: ${project.title}`,
        html: emailHtml,
        from: "default",
      })
    }
    
    await logActivity("INFO", "IMR project deleted", { projectId, title: project.title, deletedBy, reason });
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting IMR project:", error)
    await logActivity("ERROR", "Failed to delete IMR project", {
      projectId,
      deletedBy,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Could not delete project." }
  }
}

export async function checkPatentUniqueness(title: string, applicationNumber: string, currentClaimId?: string): Promise<{ isUnique: boolean; message?: string }> {
    try {
        const claimsRef = adminDb.collection('incentiveClaims');
        
        const titleQuery = claimsRef.where('patentTitle', '==', title);
        const appNumberQuery = claimsRef.where('patentApplicationNumber', '==', applicationNumber);

        const [titleSnapshot, appNumberSnapshot] = await Promise.all([
            titleQuery.get(),
            appNumberQuery.get()
        ]);
        
        const conflictingTitle = titleSnapshot.docs.find(doc => doc.id !== currentClaimId);
        if (conflictingTitle) {
            return { isUnique: false, message: `A claim with the title "${title}" already exists.` };
        }

        const conflictingAppNumber = appNumberSnapshot.docs.find(doc => doc.id !== currentClaimId);
        if (conflictingAppNumber) {
            return { isUnique: false, message: `A claim with the application number "${applicationNumber}" already exists.` };
        }

        return { isUnique: true };
    } catch (error: any) {
        console.error("Error checking patent uniqueness:", error);
        await logActivity('ERROR', 'Failed to check patent uniqueness', { title, applicationNumber, error: error.message });
        // Fail open to avoid blocking users due to server errors, but log it.
        return { isUnique: true }; 
    }
}

export async function bulkGrantModuleAccess(
  userIds: string[],
  modules: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !modules || modules.length === 0) {
      return { success: false, error: "User IDs and at least one module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayUnion(...modules),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access granted", { userIds, modules })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkGrantModuleAccess:", error)
    await logActivity("ERROR", "Failed to grant bulk module access", {
      userIds,
      modules,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update user permissions." }
  }
}

export async function bulkRevokeModuleAccess(
  userIds: string[],
  modules: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !modules || modules.length === 0) {
      return { success: false, error: "User IDs and at least one module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayRemove(...modules),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access revoked", { userIds, modules })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkRevokeModuleAccess:", error)
    await logActivity("ERROR", "Failed to revoke bulk module access", {
      userIds,
      modules,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update user permissions." }
  }
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

export async function getAllUsers(): Promise<User[]> {
  try {
    const usersRef = adminDb.collection("users")
    const snapshot = await usersRef.get()
    const users: User[] = []
    snapshot.forEach((doc) => {
      users.push({ uid: doc.id, ...(doc.data() as User) })
    })
    return users
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
  }
}

const EMAIL_STYLES = {
  background: `
  style="
    background-color:#0f2027;
    background-image:
      radial-gradient(at 5% 95%, hsla(0,70%,40%,0.25) 0px, transparent 50%),
      radial-gradient(at 95% 95%, hsla(0,80%,50%,0.25) 0px, transparent 50%),
      linear-gradient(135deg, #0f2027,rgb(67, 32, 32));
    background-attachment:fixed;
    color:#ffffff;
    font-family:Arial, sans-serif;
    padding:20px;
    border-radius:8px;
  "
`,
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://lhdlkrfbkon55i6u.public.blob.vercel-storage.com/Pu%20Goa%20White.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}

export async function sendEmail(options: { to: string; subject: string; html: string; from: "default" | "rdc", bcc?: string, cc?: string }) {
  return await sendEmailUtility(options)
}

// --- 2FA & System Settings ---
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const settingsRef = adminDb.collection("system").doc("settings")
    const settingsSnap = await settingsRef.get()
    if (settingsSnap.exists) {
      return settingsSnap.data() as SystemSettings
    }
    // Default settings if none are found
    return { is2faEnabled: false, authMethods: { email: true, google: true}, allowedDomains: [], croAssignments: [] }
  } catch (error) {
    console.error("Error fetching system settings:", error)
    // Return default settings on error to ensure app functionality
    return { is2faEnabled: false, authMethods: { email: true, google: true}, allowedDomains: [], croAssignments: [] }
  }
}

export async function updateSystemSettings(settings: SystemSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsRef = adminDb.collection("system").doc("settings")
    await settingsRef.set(settings, { merge: true })
    await logActivity("INFO", "System settings updated", { newSettings: settings })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating system settings:", error)
    await logActivity("ERROR", "Failed to update system settings", { error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to update settings." }
  }
}

export async function resizeImage(file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(blob => {
          if (!blob) {
            return reject(new Error('Canvas to Blob conversion failed'));
          }
          const resizedFile = new File([blob], file.name, {
            type: `image/${file.type.split('/')[1] || 'jpeg'}`,
            lastModified: Date.now(),
          });
          resolve(resizedFile);
        }, `image/${file.type.split('/')[1] || 'jpeg'}`, quality);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
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
    if (!match || match.length < 3) throw new Error("Invalid data URL format.");
    const mimeType = match[1];
    const base64Data = match[2];
    if (!mimeType || !base64Data) throw new Error("Could not extract file data from data URL.");
    
    const buffer = Buffer.from(base64Data, "base64");

    await file.save(buffer, { metadata: { contentType: mimeType } });
    await file.makePublic();
    const publicUrl = file.publicUrl();
    console.log(`File uploaded to Firebase Storage: ${publicUrl}`);
    return { success: true, url: publicUrl };
  } catch (firebaseError: any) {
    console.warn(`Firebase Storage upload failed: ${firebaseError.message}. Falling back to Vercel Blob.`);
    await logActivity("WARNING", "Firebase upload failed, falling back to Vercel Blob", { path, error: firebaseError.message });

    try {
      const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL for Vercel fallback.");
      const buffer = Buffer.from(match[2], 'base64');
      
      const blob = await put(path, buffer, {
        access: 'public',
        contentType: match[1],
      });
      console.log(`File uploaded to Vercel Blob: ${blob.url}`);
      return { success: true, url: blob.url };
    } catch (vercelError: any) {
      console.error("Vercel Blob fallback upload failed:", vercelError);
      await logActivity("ERROR", "File upload failed on both Firebase and Vercel Blob", { path, firebaseError: firebaseError.message, vercelError: vercelError.message });
      return { success: false, error: `Upload failed on both services. Vercel: ${vercelError.message}` };
    }
  }
}


export async function notifyAdminsOnProjectSubmission(projectId: string, projectTitle: string, piName: string) {
  try {
    const adminRoles = ["admin", "Super-admin", "CRO"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
      console.log("No admin users found to notify.")
      return { success: true, message: "No admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `New Project Submitted: "${projectTitle}" by ${piName}`

    adminUsersSnapshot.forEach((userDocSnapshot) => {
      // userDocSnapshot.id is the UID of the admin user
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDocSnapshot.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "New project submission notification sent to admins", { projectId, projectTitle })
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins:", error)
    await logActivity("ERROR", "Failed to notify admins on project submission", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function notifySuperAdminsOnEvaluation(projectId: string, projectName: string, evaluatorName: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify.")
      return { success: true, message: "No Super-admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `Evaluation submitted for "${projectName}" by ${evaluatorName}`

    superAdminUsersSnapshot.forEach((userDocSnapshot) => {
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDocSnapshot.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "Evaluation submission notification sent to super-admins", {
      projectId,
      projectName,
      evaluatorName,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying Super-admins:", error)
    await logActivity("ERROR", "Failed to notify super-admins on evaluation", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify Super-admins." }
  }
}

export async function notifyAdminsOnCompletionRequest(projectId: string, projectTitle: string, piName: string) {
  try {
    const settings = await getSystemSettings();
    
    // Send email notification only to the designated email address, if it exists
    if (settings.utilizationNotificationEmail) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear Administrator,</p>
                <p style="color:#e0e0e0;">This is to inform you that the Principal Investigator, <strong>${piName}</strong>, has submitted their utilization report for the project titled:</p>
                <p style="color:#ffffff; font-size: 1.1em; text-align: center; margin: 15px 0;"><strong>"${projectTitle}"</strong></p>
                <p style="color:#e0e0e0;">They are now requesting the disbursement of the next grant phase. Please visit the project details page on the portal to review the utilization and add the next phase.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        await sendEmailUtility({
            to: settings.utilizationNotificationEmail,
            subject: `Action Required: Next Grant Phase Request for Project: ${projectTitle}`,
            html: emailHtml,
            from: 'default'
        });
        await logActivity("INFO", "Utilization report notification sent to designated email", { projectId, projectTitle, notifiedEmail: settings.utilizationNotificationEmail });
    } else {
        await logActivity("WARNING", "Utilization report submitted, but no notification email is configured in system settings.", { projectId, projectTitle });
    }

    // Send in-app notifications to all admins and super-admins
    const adminRoles = ["admin", "Super-admin"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
      console.log("No admin users found to notify for completion request.")
      return { success: true, message: "No admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `Project Completion Requested: "${projectTitle}" by ${piName}`

    adminUsersSnapshot.forEach((userDoc) => {
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDoc.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "Completion request in-app notification sent to admins", { projectId, projectTitle })
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins on completion request:", error)
    await logActivity("ERROR", "Failed to notify admins on completion request", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function checkMisIdExists(
  misId: string,
  currentUid: string,
  campus: string,
): Promise<{ exists: boolean }> {
  try {
    if (!misId || typeof misId !== "string" || misId.trim() === "" || !campus) {
      return { exists: false }
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId).where("campus", "==", campus)
    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    if (foundUserDoc.id === currentUid) {
      // The only user with this MIS ID and campus is the current user.
      return { exists: false }
    }

    // A different user is already the HOD for this department/institute.
    return { exists: true }
  } catch (error: any) {
    console.error("Error checking MIS ID uniqueness:", error)
    await logActivity("ERROR", "Failed to check MIS ID existence", {
      misId,
      campus,
      error: error.message,
      stack: error.stack,
    })
    // Rethrow to let the client know something went wrong with the check.
    throw new Error("Failed to verify MIS ID due to a server error. Please try again.")
  }
}

export async function checkHODUniqueness(
  department: string,
  institute: string,
  currentUid: string,
): Promise<{ exists: boolean }> {
  try {
    if (!department || !institute) {
      return { exists: false } // Cannot check if required fields are missing
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef
      .where("designation", "==", "HOD")
      .where("department", "==", department)
      .where("institute", "==", institute)

    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    // If the found HOD is the same as the user being updated, it's not a conflict.
    if (foundUserDoc.id === currentUid) {
      return { exists: false }
    }

    // A different user is already the HOD for this department/institute.
    return { exists: true }
  } catch (error: any) {
    console.error("Error checking HOD uniqueness:", error)
    await logActivity("ERROR", "Failed to check HOD uniqueness", {
      department,
      institute,
      error: error.message,
      stack: error.stack,
    })
    // Rethrow to ensure the client-side operation fails and informs the user.
    throw new Error("A server error occurred while verifying the HOD designation. Please try again.")
  }
}

export async function fetchOrcidData(orcidId: string): Promise<{
  success: boolean
  data?: { name: string }
  error?: string
}> {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    return { success: false, error: "Invalid ORCID iD format." }
  }

  const orcidApiUrl = `https://pub.orcid.org/v3.0/${orcidId}`

  try {
    const response = await fetch(orcidApiUrl, {
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "ORCID iD not found." }
      }
      const errorText = await response.text()
      return { success: false, error: `ORCID API Error: ${response.statusText} - ${errorText}` }
    }

    const data = await response.json()

    const givenName = data.person.name["given-names"]?.value || ""
    const familyName = data.person.name["family-name"]?.value || ""
    const fullName = `${givenName} ${familyName}`.trim()

    if (!fullName) {
      return { success: false, error: "Could not extract name from ORCID profile." }
    }

    return {
      success: true,
      data: {
        name: fullName,
      },
    }
  } catch (error: any) {
    console.error("Error calling ORCID API:", error)
    await logActivity("ERROR", "Failed to fetch ORCID data", { orcidId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "An unexpected error occurred while fetching ORCID data." }
  }
}

export async function linkHistoricalData(
  userData: Partial<User> & { uid: string; email: string },
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { uid, email, institute, department, phoneNumber } = userData
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const projectsRef = adminDb.collection("projects")
    const q = projectsRef.where("pi_email", "==", email).where("pi_uid", "in", ["", null])

    const projectsSnapshot = await q.get()

    if (projectsSnapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    projectsSnapshot.forEach((projectDoc) => {
      const updateData: { [key: string]: any } = { pi_uid: uid }
      if (institute) updateData.institute = institute
      if (department) updateData.departmentName = department
      if (phoneNumber) updateData.pi_phoneNumber = phoneNumber

      batch.update(projectDoc.ref, updateData)
    })

    await batch.commit()

    await logActivity("INFO", "Linked historical data for new user", {
      uid,
      email,
      count: projectsSnapshot.size,
    })

    return { success: true, count: projectsSnapshot.size }
  } catch (error: any) {
    console.error("Error linking historical project data:", error)
    await logActivity("ERROR", "Failed to link historical data", {
      uid: userData.uid,
      email: userData.email,
      error: error.message,
      stack: error.stack,
    })
    return {
      success: false,
      count: 0,
      error: error.message || "Failed to link historical data.",
    }
  }
}

export async function linkEmrInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("userEmail", "==", lowercasedEmail).where("userId", "in", ["", null])

    const snapshot = await q.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    snapshot.forEach((doc) => {
      batch.update(doc.ref, { userId: uid })
    })

    await batch.commit()

    await logActivity("INFO", "Linked historical EMR interests to new user", { uid, email, count: snapshot.size })
    return { success: true, count: snapshot.size }
  } catch (error: any) {
    console.error("Error linking EMR interests:", error)
    await logActivity("ERROR", "Failed to link EMR interests", { uid, email, error: error.message, stack: error.stack })
    return { success: false, count: 0, error: "Failed to link EMR interests." }
  }
}

export async function linkEmrCoPiInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")

    const q = interestsRef.where("coPiEmails", "array-contains", lowercasedEmail)
    const snapshot = await q.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false

      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        // Find the Co-PI entry that matches the new user's email and doesn't have a UID yet.
        if (coPi.email.toLowerCase() === lowercasedEmail && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })

      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, {
          coPiDetails: updatedCoPiDetails,
          coPiUids: updatedCoPiUids,
        })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      await logActivity("INFO", "Linked EMR Co-PI interests to new user by email", { uid, email, count: updatedCount })
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking EMR Co-PI interests by email:", error)
    await logActivity("ERROR", "Failed to link EMR Co-PI interests by email", {
      uid,
      email,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests." }
  }
}

export async function linkEmrInterestsByMisId(
  uid: string,
  misId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!uid || !misId) {
    return { success: false, count: 0, error: "User UID and MIS ID are required." }
  }

  try {
    const interestsRef = adminDb.collection("emrInterests")
    const snapshot = await interestsRef.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false

      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        if (coPi.misId === misId && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })

      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, {
          coPiDetails: updatedCoPiDetails,
          coPiUids: updatedCoPiUids,
        })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      await logActivity("INFO", "Linked EMR Co-PI interests to new user by MIS ID", { uid, misId, count: updatedCount })
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking EMR Co-PI interests by MIS ID:", error)
    await logActivity("ERROR", "Failed to link EMR Co-PI interests by MIS ID", {
      uid,
      misId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests by MIS ID." }
  }
}

export async function updateProjectWithRevision(
  projectId: string,
  revisedProposalUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !revisedProposalUrl) {
      return { success: false, error: "Project ID and revised proposal URL are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)

    await projectRef.update({
      revisedProposalUrl: revisedProposalUrl,
      revisionSubmissionDate: new Date().toISOString(),
      status: "Under Review",
    })

    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found after update." }
    }
    const project = projectSnap.data() as Project

    // Notify admins
    const adminRoles = ["admin", "Super-admin", "CRO"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (!adminUsersSnapshot.empty) {
      const batch = adminDb.batch()
      const notificationTitle = `Revision Submitted for "${project.title}" by ${project.pi}`

      adminUsersSnapshot.forEach((userDoc) => {
        const notificationRef = adminDb.collection("notifications").doc()
        batch.set(notificationRef, {
          uid: userDoc.id,
          projectId: projectId,
          title: notificationTitle,
          createdAt: new Date().toISOString(),
          isRead: false,
        })
      })

      await batch.commit()
    }

    await logActivity("INFO", "Project revision submitted", { projectId, title: project.title, piUid: project.pi_uid })
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting project revision:", error)
    await logActivity("ERROR", "Failed to submit project revision", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to submit revision." }
  }
}

export async function updateProjectDuration(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !startDate || !endDate) {
      return { success: false, error: "Project ID, start date, and end date are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.update({
      projectStartDate: startDate,
      projectEndDate: endDate,
    })
    await logActivity("INFO", "Project duration updated", { projectId, startDate, endDate })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project duration:", error)
    await logActivity("ERROR", "Failed to update project duration", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update project duration." }
  }
}

export async function updateProjectEvaluators(
  projectId: string,
  evaluatorUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !evaluatorUids) {
      return { success: false, error: "Project ID and evaluator UIDs are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists || !projectSnap.data()?.meetingDetails) {
      return { success: false, error: "Project or its meeting details not found." }
    }
    await projectRef.update({
      "meetingDetails.assignedEvaluators": evaluatorUids,
    })
    await logActivity("INFO", "Project evaluators updated", { projectId, evaluatorUids })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project evaluators:", error)
    await logActivity("ERROR", "Failed to update project evaluators", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update project evaluators." }
  }
}

export async function isEmailDomainAllowed(
  email: string,
): Promise<{ allowed: boolean; isCro: boolean; croFaculty?: string; croCampus?: string; isIqac: boolean }> {
  try {
    const settings = await getSystemSettings()
    const allowedDomains = settings.allowedDomains || ["@paruluniversity.ac.in", "@goa.paruluniversity.ac.in"]
    const croAssignments = settings.croAssignments || []
    const iqacEmail = settings.iqacEmail || ""

    // Special case for primary super admin
    if (email === "rathipranav07@gmail.com" || email === "vicepresident_86@paruluniversity.ac.in") {
      return { allowed: true, isCro: false, isIqac: false }
    }

    const isIqac = iqacEmail.toLowerCase() === email.toLowerCase()
    if (isIqac) {
      return { allowed: true, isCro: false, isIqac: true }
    }

    const isAllowed = allowedDomains.some((domain) => email.endsWith(domain))
    const croAssignment = croAssignments.find((c) => c.email.toLowerCase() === email.toLowerCase())

    if (croAssignment) {
      return { allowed: true, isCro: true, croFaculty: croAssignment.faculty, croCampus: croAssignment.campus, isIqac: false }
    }

    return { allowed: isAllowed, isCro: false, isIqac: false }
  } catch (error) {
    console.error("Error checking email domain:", error)
    // Default to original domains on error
    const defaultAllowed = email.endsWith("@paruluniversity.ac.in") || email.endsWith("@goa.paruluniversity.ac.in")
    return { allowed: defaultAllowed, isCro: false, isIqac: false }
  }
}

export async function updateCoInvestigators(
  projectId: string,
  coPiUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId) {
      return { success: false, error: "Project ID is required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project
    const existingCoPis = project.coPiUids || []

    await projectRef.update({
      coPiUids: coPiUids,
    })

    const newCoPis = coPiUids.filter((uid) => !existingCoPis.includes(uid))

    if (newCoPis.length > 0) {
      const usersRef = adminDb.collection("users")
      const usersQuery = usersRef.where(admin.firestore.FieldPath.documentId(), "in", newCoPis)
      const newCoPiDocs = await usersQuery.get()

      const batch = adminDb.batch()

      for (const userDoc of newCoPiDocs.docs) {
        const coPi = userDoc.data() as User

        // In-app notification
        const notificationRef = adminDb.collection("notifications").doc()
        batch.set(notificationRef, {
          uid: coPi.uid,
          projectId: projectId,
          title: `You have been added as a Co-PI to the IMR project: "${project.title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })

        // Email notification
        if (coPi.email) {
          const emailHtml = `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${coPi.name},</p>
              <p style="color:#e0e0e0;">You have been added as a Co-PI to the IMR project titled "<strong style="color:#ffffff;">${project.title}</strong>" by ${project.pi}.</p>
              <p style="color:#e0e0e0;">You can view the project details on the PU Goa Research Projects Portal</p>
              ${EMAIL_STYLES.footer}
            </div>`
          await sendEmailUtility({
            to: coPi.email,
            subject: `You've been added to an IMR Project`,
            html: emailHtml,
            from: "default",
          })
        }
      }
      await batch.commit()
    }
    await logActivity("INFO", "Co-investigators updated", { projectId, coPiUids })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating Co-PIs:", error)
    await logActivity("ERROR", "Failed to update co-investigators", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update Co-PIs." }
  }
}

export async function updateUserTutorialStatus(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid) {
      return { success: false, error: "User ID is required." }
    }
    const userRef = adminDb.collection("users").doc(uid)
    await userRef.update({ hasCompletedTutorial: true })
    await logActivity("INFO", "User completed tutorial", { uid })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating tutorial status:", error)
    await logActivity("ERROR", "Failed to update user tutorial status", {
      uid,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update tutorial status." }
  }
}

export async function fetchEvaluatorProjectsForUser(
  evaluatorUid: string,
  piUid: string,
): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  try {
    const projectsRef = adminDb.collection("projects")
    const q = projectsRef
      .where("pi_uid", "==", piUid)
      .where("meetingDetails.assignedEvaluators", "array-contains", evaluatorUid)

    const snapshot = await q.get()
    const projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Project)

    const projectsForToday = projects.filter(
      (p) => p.meetingDetails?.date && isToday(new Date(p.meetingDetails.date.replace(/-/g, "/"))),
    )

    return { success: true, projects: projectsForToday }
  } catch (error: any) {
    console.error("Error fetching projects for evaluator/pi combo:", error)
    return { success: false, error: error.message || "Failed to fetch projects." }
  }
}

export async function saveSidebarOrder(uid: string, newOrder: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid || !newOrder) {
      return { success: false, error: 'User ID and new order are required.' };
    }
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ sidebarOrder: newOrder });
    await logActivity('INFO', 'User sidebar order saved', { uid });
    return { success: true };
  } catch (error: any) {
    console.error('Error saving sidebar order:', error);
    await logActivity('ERROR', 'Failed to save sidebar order', { uid, error: error.message, stack: error.stack });
    return { success: false, error: 'Failed to save sidebar order.' };
  }
}

export async function markImrAttendance(
  meetingProjects: { projectId: string; piUid: string }[],
  absentPiUids: string[],
  absentEvaluatorUids: string[],
  meetingIdentifier?: { date: string; time: string; venue: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = adminDb.batch();
    const projectsRef = adminDb.collection("projects");
    let allMeetingProjects = [...meetingProjects];

    // If triggered from a single project detail page, find all other projects in the same meeting
    if (meetingIdentifier) {
        const q = projectsRef
            .where('meetingDetails.date', '==', meetingIdentifier.date)
            .where('meetingDetails.time', '==', meetingIdentifier.time)
            .where('meetingDetails.venue', '==', meetingIdentifier.venue);
        
        const meetingSnapshot = await q.get();
        allMeetingProjects = meetingSnapshot.docs.map(doc => ({
            projectId: doc.id,
            piUid: doc.data().pi_uid,
        }));
    }

    const presentProjects = allMeetingProjects.filter(p => !absentPiUids.includes(p.piUid));

    // Update absent applicants
    for (const piUid of absentPiUids) {
      const absentProject = allMeetingProjects.find(p => p.piUid === piUid);
      if (absentProject) {
        const projectRef = projectsRef.doc(absentProject.projectId);
        batch.update(projectRef, {
          wasAbsent: true,
        });
      }
    }

    // Update present projects with evaluator absences
    if (absentEvaluatorUids.length > 0) {
      for (const project of presentProjects) {
        const projectRef = projectsRef.doc(project.projectId);
        batch.update(projectRef, {
          'meetingDetails.absentEvaluators': FieldValue.arrayUnion(...absentEvaluatorUids)
        });
      }
    }

    await batch.commit();
    await logActivity('INFO', 'IMR meeting attendance marked', { 
      totalProjects: allMeetingProjects.length,
      absentPiUids, 
      absentEvaluatorUids 
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error marking IMR attendance:", error);
    await logActivity('ERROR', 'Failed to mark IMR attendance', {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: "Failed to update attendance." };
  }
}

// Re-export addTransaction so it's available to client components through the main actions file
export async function addTransaction(
    ...args: Parameters<typeof import('./grant-actions').addTransaction>
): Promise<ReturnType<typeof import('./grant-actions').addTransaction>> {
    const { addTransaction: originalAddTransaction } = await import('./grant-actions');
    return originalAddTransaction(...args);
}

export async function deleteTransaction(
    ...args: Parameters<typeof import('./grant-actions').deleteTransaction>
): Promise<ReturnType<typeof import('./grant-actions').deleteTransaction>> {
    const { deleteTransaction: originalDeleteTransaction } = await import('./grant-actions');
    return originalDeleteTransaction(...args);
}

export async function notifySuperAdminsOnNewUser(userName: string, role: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get();
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify for new user.");
      return;
    }

    const batch = adminDb.batch();
    const notificationTitle = `New ${role} signed up: ${userName}`;

    superAdminUsersSnapshot.forEach((userDoc) => {
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: userDoc.id,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    });

    await batch.commit();
    await logActivity("INFO", "New user notification sent to super-admins", { userName, role });
  } catch (error: any) {
    console.error("Error notifying Super-admins about new user:", error);
    await logActivity("ERROR", "Failed to notify super-admins on new user", {
      userName,
      role,
      error: error.message,
      stack: error.stack,
    });
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

export async function linkPapersToNewUser(uid: string, email: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        if (!uid || !email) {
            return { success: false, count: 0, error: 'User UID and Email are required.' };
        }
        
        const lowercasedEmail = email.toLowerCase();
        const papersRef = adminDb.collection('papers');
        const q = papersRef.where('authorEmails', 'array-contains', lowercasedEmail);
        const snapshot = await q.get();

        if (snapshot.empty) {
            return { success: true, count: 0 };
        }

        const batch = adminDb.batch();
        let updatedCount = 0;

        snapshot.forEach(doc => {
            const paper = doc.data() as ResearchPaper;
            let needsUpdate = false;

            const updatedAuthors = paper.authors.map(author => {
                if (author.email.toLowerCase() === lowercasedEmail && !author.uid) {
                    needsUpdate = true;
                    return { ...author, uid: uid };
                }
                return author;
            });
            
            if (needsUpdate) {
                const updatedAuthorUids = [...new Set([...paper.authorUids, uid])];
                batch.update(doc.ref, { 
                    authors: updatedAuthors,
                    authorUids: updatedAuthorUids,
                });
                updatedCount++;
            }
        });
        
        if (updatedCount > 0) {
            await batch.commit();
            await logActivity('INFO', 'Linked existing papers to new user', { uid, email, count: updatedCount });
        }

        return { success: true, count: updatedCount };

    } catch (error: any) {
        console.error("Error linking papers to new user:", error);
        await logActivity('ERROR', 'Failed to link papers to new user', { uid, email, error: error.message });
        return { success: false, count: 0, error: 'Failed to link papers.' };
    }
}

export async function sendLoginOtp(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const domainCheck = await isEmailDomainAllowed(email);
    if (!domainCheck.allowed) {
      return { success: false, error: "This email domain is not permitted to log in." };
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    
    const otpRef = adminDb.collection('loginOtps').doc(email.toLowerCase());
    await otpRef.set({ email: email.toLowerCase(), otp, expiresAt });
    
    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff; font-size: 16px;">Hello,</p>
        <p style="color:#e0e0e0;">Your One-Time Password (OTP) for the PU Goa Research Projects Portal is:</p>
        <div style="font-size: 28px; font-weight: bold; color: #ffffff; text-align: center; letter-spacing: 5px; margin: 25px 0; padding: 15px; background-color: rgba(255, 255, 255, 0.1); border-radius: 8px;">
          ${otp}
        </div>
        <p style="color:#e0e0e0;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `;

    await sendEmailUtility({
      to: email,
      subject: 'Your Login OTP for PU Goa Research Portal',
      html: emailHtml,
      from: 'default'
    });

    await logActivity('INFO', 'Login OTP sent', { email });
    return { success: true };
  } catch (error: any) {
    console.error('Error sending login OTP:', error);
    await logActivity('ERROR', 'Failed to send login OTP', { email, error: error.message });
    return { success: false, error: 'Failed to send OTP. Please try again.' };
  }
}

export async function verifyLoginOtp(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const otpRef = adminDb.collection('loginOtps').doc(email.toLowerCase());
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return { success: false, error: 'OTP not found or expired. Please try again.' };
    }

    const otpData = otpSnap.data() as LoginOtp;
    
    if (otpData.expiresAt < Date.now()) {
      await otpRef.delete();
      return { success: false, error: 'OTP has expired. Please try again.' };
    }

    if (otpData.otp !== otp) {
      return { success: false, error: 'Invalid OTP.' };
    }
    
    // OTP is valid, delete it so it can't be reused
    await otpRef.delete();
    
    return { success: true };
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return { success: false, error: 'An unexpected error occurred during verification.' };
  }
}

export async function saveProjectSubmission(
  projectId: string,
  projectData: Omit<Project, "id">,
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.set(projectData, { merge: true })

    // Notify admins only on final submission, not on saving drafts
    if (projectData.status === "Submitted") {
      await notifyAdminsOnProjectSubmission(projectId, projectData.title, projectData.pi)
    }

    await logActivity("INFO", `Project ${projectData.status}`, { projectId, title: projectData.title })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving project submission:", error)
    await logActivity("ERROR", "Failed to save project submission", {
      projectId,
      title: projectData.title,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to save project." }
  }
}

export async function getEvaluationPrompts(project: { title: string; abstract: string }): Promise<{ success: boolean; prompts: { guidance: string }; error?: string }> {
    // This function can be replaced with a call to a GenAI model in the future.
    // For now, it returns a static, detailed prompt.
    const staticGuidance = `
        Based on the project's title and abstract, please evaluate the following aspects:
        1.  **Relevance & Significance:** How important is the research problem? Does it address a current gap in knowledge or a societal need?
        2.  **Methodology:** Is the proposed research design and methodology sound? Are the methods appropriate for the research questions?
        3.  **Feasibility:** Is the project feasible within the proposed timeline and budget? Are the required resources and expertise available?
        4.  **Innovation:** Does the project propose a novel approach or idea? What is the potential for generating new knowledge or intellectual property?
        5.  **Outcomes & Impact:** Are the expected outcomes clearly defined? What is the potential impact of this research on the field and beyond?
    `;
    return { success: true, prompts: { guidance: staticGuidance } };
}

export async function updateProjectStatus(
  projectId: string,
  newStatus: Project["status"],
  comments?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const updateData: { status: string; [key: string]: any } = { status: newStatus }

    if (comments) {
      if (newStatus === "Revision Needed") {
        updateData.revisionComments = comments
      } else if (newStatus === "Not Recommended") {
        updateData.rejectionComments = comments
      }
    }

    await projectRef.update(updateData)
    await logActivity("INFO", "Project status updated", { projectId, newStatus })

    // Notify the PI
    const projectSnap = await projectRef.get()
    if (projectSnap.exists) {
      const project = projectSnap.data() as Project
      const notification = {
        uid: project.pi_uid,
        projectId: projectId,
        title: `Your project "${project.title}" status has been updated to: ${newStatus}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      }
      await adminDb.collection("notifications").add(notification)

      if (project.pi_email) {
        let emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${project.pi},</p>
                <p style="color:#e0e0e0;">The status of your IMR project, "<strong style="color:#ffffff;">${project.title}</strong>," has been updated to <strong style="color:#ffffff;">${newStatus}</strong>.</p>
                ${comments ? `<div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;"><h4 style="color:#ffffff; margin-top:0;">Committee Comments:</h4><p style="color:#e0e0e0; white-space: pre-wrap;">${comments}</p></div>` : ""}
                <p style="color:#e0e0e0; margin-top:20px;">Please visit the portal for more details.</p>
                ${EMAIL_STYLES.footer}
            </div>`

        await sendEmailUtility({
          to: project.pi_email,
          subject: `Status Update for Your IMR Project: ${project.title}`,
          html: emailHtml,
          from: "default",
        })
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating project status:", error)
    await logActivity("ERROR", "Failed to update project status", {
      projectId,
      newStatus,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update status." }
  }
}

export async function updateIncentiveClaimStatus(
  claimId: string,
  newStatus: IncentiveClaim["status"],
): Promise<{ success: boolean; error?: string }> {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    await claimRef.update({ status: newStatus })
    await logActivity("INFO", "Incentive claim status updated", { claimId, newStatus })

    // Notify the user
    const claimSnap = await claimRef.get()
    if (claimSnap.exists) {
      const claim = claimSnap.data() as IncentiveClaim
      const notification = {
        uid: claim.uid,
        title: `Your incentive claim for "${claim.paperTitle}" has been updated to: ${newStatus}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      }
      await adminDb.collection("notifications").add(notification)

      if (claim.userEmail) {
        await sendEmailUtility({
          to: claim.userEmail,
          subject: `Update on Your Incentive Claim`,
          html: `<p>Dear ${claim.userName},</p><p>The status of your incentive claim for "${claim.paperTitle}" has been updated to <strong>${newStatus}</strong>.</p><p>Please check the portal for more details.</p>`,
          from: "default",
        })
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating incentive claim status:", error)
    await logActivity("ERROR", "Failed to update incentive claim status", {
      claimId,
      newStatus,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update status." }
  }
}

export async function bulkUploadProjects(
  projects: any[]
): Promise<{ 
    success: boolean; 
    data: {
        successfulCount: number;
        failures: { projectTitle: string; piName: string; error: string }[];
    };
    error?: string; 
}> {
  let successfulCount = 0;
  const failures: { projectTitle: string; piName: string; error: string }[] = [];
  const projectsRef = adminDb.collection('projects');
  
  for (const p of projects) {
      try {
          const newProject: Partial<Project> = {
              title: p.project_title,
              pi: p.Name_of_staff,
              pi_email: p.pi_email.toLowerCase(),
              status: p.status,
              submissionDate: p.sanction_date,
              isBulkUploaded: true,
              faculty: p.Faculty,
              institute: p.Institute,
              departmentName: p.Department,
              grant: {
                  totalAmount: Number(p.grant_amount) || 0,
                  sanctionNumber: p.sanction_number,
                  status: 'Completed',
                  phases: []
              }
          };
          await projectsRef.add(newProject);
          successfulCount++;
      } catch (error: any) {
          failures.push({ projectTitle: p.project_title, piName: p.Name_of_staff, error: error.message });
      }
  }

  await logActivity('INFO', 'Bulk IMR project upload completed', { successfulCount, failureCount: failures.length });
  if (failures.length > 0) {
      await logActivity('WARNING', 'Some IMR projects failed during bulk upload', { failures });
  }

  return { success: true, data: { successfulCount, failures } };
}

export async function deleteBulkProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();

        if (!projectSnap.exists) {
            return { success: false, error: 'Project not found.' };
        }

        const project = projectSnap.data() as Project;
        if (!project.isBulkUploaded) {
            return { success: false, error: 'This action is only for bulk-uploaded projects.' };
        }

        await projectRef.delete();
        await logActivity('INFO', 'Bulk-uploaded project deleted', { projectId, title: project.title });
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting bulk project:', error);
        await logActivity('ERROR', 'Failed to delete bulk project', { projectId, error: error.message });
        return { success: false, error: 'Could not delete the project.' };
    }
}

export async function scheduleMeeting(
    projects: { id: string; pi_uid: string; title: string; pi_email?: string; }[],
    meetingDetails: {
      date: string
      time: string
      venue: string
      evaluatorUids: string[]
    },
    isMidTermReview: boolean = false,
  ): Promise<{ success: boolean; error?: string }> {
    const { date, time, venue, evaluatorUids } = meetingDetails
  
    if (!evaluatorUids || evaluatorUids.length === 0) {
      return { success: false, error: "An evaluation committee must be assigned." }
    }
  
    const timeZone = "Asia/Kolkata"
    const batch = adminDb.batch()
    const emailPromises = []
  
    const meetingDateTimeString = `${date}T${time}:00`
  
    for (const project of projects) {
      const projectRef = adminDb.collection("projects").doc(project.id)
      const updateData: { status: string; meetingDetails: any, hasHadMidTermReview?: boolean } = {
        status: "Under Review",
        meetingDetails: { date, time, venue, assignedEvaluators: evaluatorUids },
      };

      if (isMidTermReview) {
          updateData.hasHadMidTermReview = true;
      }
  
      batch.update(projectRef, updateData)
  
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: project.pi_uid,
        projectId: project.id,
        title: `Your ${isMidTermReview ? 'Mid-term Review' : 'IMR'} Meeting is Scheduled: "${project.title}"`,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
  
      const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${project.pi},</p>
              <p style="color:#e0e0e0;">
                  An ${isMidTermReview ? 'IMR mid-term review meeting' : 'IMR evaluation meeting'} has been scheduled for your project, "<strong style="color:#ffffff;">${project.title}</strong>".
              </p>
              <p><strong style="color:#ffffff;">Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
              <p><strong style="color:#ffffff;">Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
              <p><strong style="color:#ffffff;">Venue:</strong> ${venue}</p>
              <p style="color:#cccccc; margin-top: 15px;">Please be prepared for your presentation. Good luck!</p>
              ${EMAIL_STYLES.footer}
          </div>
      `
  
      if (project.pi_email) {
        emailPromises.push(
          sendEmailUtility({
            to: project.pi_email,
            subject: `IMR ${isMidTermReview ? 'Mid-term Review' : 'Evaluation'} Meeting Scheduled: ${project.title}`,
            html: emailHtml,
            from: 'default'
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
            title: `You've been assigned to an IMR ${isMidTermReview ? 'mid-term review' : 'evaluation'} committee`,
            createdAt: new Date().toISOString(),
            isRead: false,
          })
  
          if (evaluator.email) {
            emailPromises.push(
              sendEmailUtility({
                to: evaluator.email,
                subject: `IMR ${isMidTermReview ? 'Mid-term Review' : 'Evaluation'} Assignment`,
                html: `
                  <div ${EMAIL_STYLES.background}>
                      ${EMAIL_STYLES.logo}
                      <p style="color:#ffffff;">Dear Evaluator,</p>
                      <p style="color:#e0e0e0;">You have been assigned to an IMR ${isMidTermReview ? 'mid-term review' : 'evaluation'} committee.</p>
                      <p><strong style="color:#ffffff;">Date:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")}</p>
                      <p><strong style="color:#ffffff;">Time:</strong> ${formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")}</p>
                      <p><strong style="color:#ffffff;">Venue:</strong> ${venue}</p>
                      <p style="color:#cccccc; margin-top: 15px;">Please review the assigned projects on the PU Goa Research Projects Portal.</p>
                      ${EMAIL_STYLES.footer}
                  </div>
                `,
                from: 'default'
              }),
            )
          }
        }
      }
    }
  
    try {
      await batch.commit()
      await Promise.all(emailPromises)
      await logActivity("INFO", `IMR ${isMidTermReview ? 'mid-term' : ''} meeting scheduled`, { projectIds: projects.map(p => p.id), meetingDate: date, evaluatorCount: evaluatorUids.length });
      return { success: true }
    } catch (error: any) {
      console.error("Error committing batch or sending emails:", error)
      await logActivity("ERROR", `Failed to schedule IMR ${isMidTermReview ? 'mid-term' : ''} meeting`, { error: error.message });
      return { success: false, error: "Failed to update project statuses or send notifications." }
    }
}

export async function sendErrorEmail(
    data: {
        error: { name: string; message: string; stack?: string },
        context?: any,
        user: { name: string; email: string; phoneNumber: string } | null
    }
): Promise<{ success: boolean }> {
    const { error, context, user } = data;
    const to = process.env.HELPDESK_EMAIL || 'helpdesk.rdc@paruluniversity.ac.in';

    const userHtml = user
        ? `<h3>User Details:</h3>
           <ul>
             <li><b>Name:</b> ${user.name}</li>
             <li><b>Email:</b> ${user.email}</li>
             <li><b>Phone:</b> ${user.phoneNumber}</li>
           </ul>`
        : '<h3>User Details:</h3><p>User was not logged in or could not be identified.</p>';

    const contextHtml = context
        ? `<h3>Error Context:</h3><pre style="background-color:#333; color: #f0f0f0; padding:10px; border-radius:4px; white-space: pre-wrap; word-wrap: break-word;"><code>${JSON.stringify(context, null, 2)}</code></pre>`
        : '';
        
    const emailHtml = `
      <html>
        <body style="font-family: sans-serif; background-color: #f4f4f4; padding: 20px;">
          <div style="max-width: 800px; margin: auto; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
            <h1 style="color: #d9534f;">An Application Error Occurred</h1>
            <p>An error was automatically caught by the system. Please find the details below.</p>
            
            ${userHtml}
            
            <h3>Error Details:</h3>
            <p><b>Name:</b> ${error.name}</p>
            <p><b>Message:</b> ${error.message}</p>
            
            ${contextHtml}
            
            <h3>Stack Trace:</h3>
            <pre style="background-color:#333; color: #f0f0f0; padding:10px; border-radius:4px; white-space: pre-wrap; word-wrap: break-word;"><code>${error.stack || 'No stack trace available'}</code></pre>
          </div>
        </body>
      </html>`;
      
    try {
        await sendEmailUtility({
            to,
            subject: `[RDC Portal Error] - ${error.name}: ${error.message}`,
            html: emailHtml,
            from: 'default',
        });
        console.log(`Error report email sent successfully to ${to}.`);
        return { success: true };
    } catch (emailError: any) {
        console.error('FATAL: Failed to send error report email:', emailError);
        return { success: false };
    }
}
    

    