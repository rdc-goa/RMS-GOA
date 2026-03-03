
'use server';

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
import { addDays, setHours, setMinutes, setSeconds, isToday, format, parseISO, addHours, subDays } from "date-fns"
import { formatInTimeZone, toDate } from "date-fns-tz"
import type * as z from "zod"
import { awardInitialGrant, addGrantPhase, updatePhaseStatus } from "./grant-actions"
import { generateSanctionOrder } from "./document-actions"

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
    console.error("Original Log Entry:", { level, message, context })
  }
}

// --- Google Drive Upload Logic ---
async function uploadToDrive(buffer: Buffer, fileName: string, mimeType: string, filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
        const { google } = await import('googleapis');
        const { Readable } = await import('stream');

        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!clientEmail || !privateKey) {
            throw new Error('Google Drive API credentials are not configured on the server.');
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // --- Find or create the main folder ---
        let parentFolderId: string | undefined;
        const mainFolderName = 'R&D Portal Incentive Proofs';
        
        // 1. Check Firestore for the stored folder ID
        const settings = await getSystemSettings();
        parentFolderId = settings.driveParentFolderId;

        // 2. If not in Firestore, search or create on Drive
        if (!parentFolderId) {
            const folderRes = await drive.files.list({
                q: `mimeType='application/vnd.google-apps.folder' and name='${mainFolderName}' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            if (folderRes.data.files && folderRes.data.files.length > 0) {
                parentFolderId = folderRes.data.files[0].id!;
            } else {
                const fileMetadata = {
                    name: mainFolderName,
                    mimeType: 'application/vnd.google-apps.folder',
                };
                const newFolder = await drive.files.create({
                    resource: fileMetadata,
                    fields: 'id',
                });
                parentFolderId = newFolder.data.id!;
            }
            
            // 3. If we found or created it, save the ID to Firestore for next time
            if (parentFolderId) {
                await updateSystemSettings({ ...settings, driveParentFolderId: parentFolderId });
            }
        }
        
        if (!parentFolderId) {
            throw new Error("Could not find or create the parent folder in Google Drive.");
        }

        // 4. Upload the file
        const fileMetadata = {
            name: fileName,
            parents: [parentFolderId],
        };
        const media = {
            mimeType: mimeType,
            body: Readable.from(buffer),
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
        });
        
        const fileId = file.data.id;
        if (!fileId) {
            throw new Error("File upload to Google Drive failed, no file ID returned.");
        }

        // 5. Make the file publicly readable
        await drive.permissions.create({
            fileId: fileId,
            resource: {
                role: 'reader',
                type: 'anyone',
            },
        });
        
        const webViewLink = file.data.webViewLink;

        if (!webViewLink) {
            throw new Error("Could not retrieve a shareable link for the uploaded file.");
        }

        return { success: true, url: webViewLink };
    } catch (error: any) {
        console.error("Google Drive upload error:", error);
        await logActivity('ERROR', 'Google Drive upload failed', { path: filePath, error: error.message });
        return { success: false, error: `Google Drive upload failed: ${error.message}.` };
    }
}


export { awardInitialGrant, addGrantPhase, updatePhaseStatus, generateSanctionOrder };

export async function sendErrorEmail(
  errorDetails: { message: string; digest?: string },
  user: User | null
): Promise<{ success: boolean }> {
  try {
    const to = process.env.HELPDESK_EMAIL || "helpdesk.rdc@paruluniversity.ac.in";
    const subject = `RDC Portal Error Report: ${errorDetails.message.substring(0, 50)}...`;
    
    let userHtml = '<p>No user was logged in, or user details could not be retrieved.</p>';
    if (user) {
        userHtml = `
            <h3 style="color:#ffffff;">User Details:</h3>
            <ul>
                <li><strong>Name:</strong> ${user.name || 'N/A'}</li>
                <li><strong>Email:</strong> ${user.email || 'N/A'}</li>
                <li><strong>Role:</strong> ${user.role || 'N/A'}</li>
                <li><strong>Phone:</strong> ${user.phoneNumber || 'N/A'}</li>
            </ul>
        `;
    }

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #d32f2f;">R&D Portal Error Report</h2>
            <p>An automated error report was generated by the system.</p>
            
            <div style="background-color: #fbe9e7; border: 1px solid #ffcdd2; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <h3 style="color:#c62828; margin-top:0;">Error Message:</h3>
                <p style="font-family: monospace; background: #fff3e0; padding: 10px; border-radius: 4px;">${errorDetails.message}</p>
                ${errorDetails.digest ? `<p><strong>Digest (for server log lookup):</strong> ${errorDetails.digest}</p>` : ''}
            </div>

             <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 15px; border-radius: 5px;">
                ${userHtml}
            </div>
            
            <p style="margin-top: 20px; font-size: 0.9em; color: #555;">This is an automated email. Please investigate the issue based on the provided details.</p>
        </div>
    `;
    
    await sendEmailUtility({
        to,
        subject,
        html: emailHtml,
        from: 'default'
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send error report email:", error);
    // Don't re-throw, as this is a background logging action
    return { success: false };
  }
}

export async function adminUploadProposal(
  projectId: string,
  proposalDataUrl: string,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = `projects/${projectId}/proposal/${fileName}`;
    const uploadResult = await uploadFileToServer(proposalDataUrl, filePath);

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || "Proposal upload failed.");
    }

    const projectRef = adminDb.collection("projects").doc(projectId);
    await projectRef.update({
      proposalUrl: uploadResult.url,
    });

    await logActivity("INFO", "Admin uploaded proposal to draft project", { projectId });
    return { success: true };
  } catch (error: any) {
    console.error("Error in adminUploadProposal:", error);
    await logActivity("ERROR", "Failed to upload proposal as admin", {
      projectId,
      error: error.message,
    });
    return { success: false, error: "Failed to upload proposal." };
  }
}

export async function getStorageUsage(): Promise<{ success: boolean; totalSizeMB?: number; error?: string }> {
  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles();
    
    let totalSizeBytes = 0;
    files.forEach(file => {
      totalSizeBytes += parseInt(file.metadata.size as string, 10);
    });

    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    return { success: true, totalSizeMB: parseFloat(totalSizeMB.toFixed(2)) };
  } catch (error: any) {
    console.error("Error calculating storage usage:", error);
    await logActivity('ERROR', 'Failed to calculate storage usage', { error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Could not calculate storage usage.' };
  }
}


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
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !moduleId) {
      return { success: false, error: "User IDs and a module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayUnion(moduleId),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access granted", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkGrantModuleAccess:", error)
    await logActivity("ERROR", "Failed to grant bulk module access", {
      userIds,
      moduleId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update user permissions." }
  }
}

export async function bulkRevokeModuleAccess(
  userIds: string[],
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !moduleId) {
      return { success: false, error: "User IDs and a module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayRemove(moduleId),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access revoked", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkRevokeModuleAccess:", error)
    await logActivity("ERROR", "Failed to revoke bulk module access", {
      userIds,
      moduleId,
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

export async function sendEmail(options: { to: string; subject: string; html: string; from: "default" | "rdc", icalEvent?: any }) {
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
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
  } catch (error) {
    console.error("Error fetching system settings:", error)
    // Return default settings on error to ensure app functionality
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
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

export async function uploadApproverSignature(
  stage: 2 | 3 | 4,
  signatureDataUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const path = `system/signatures/approver_stage_${stage}_signature.png`;
    const uploadResult = await uploadFileToServer(signatureDataUrl, path);

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || "Signature upload failed.");
    }
    
    const settings = await getSystemSettings();
    const currentApprovers = settings.incentiveApprovers || [];
    const approverIndex = currentApprovers.findIndex(a => a.stage === stage);
    
    if (approverIndex !== -1) {
      currentApprovers[approverIndex].signatureUrl = uploadResult.url;
    } else {
      // This case should ideally not happen if an approver email is set, but handle it defensively.
      const newApprover = { stage, email: '', signatureUrl: uploadResult.url };
      currentApprovers.push(newApprover);
      currentApprovers.sort((a,b) => a.stage - b.stage);
    }
    
    await updateSystemSettings({ ...settings, incentiveApprovers: currentApprovers });
    
    await logActivity('INFO', `Approver signature for stage ${stage} updated.`);
    return { success: true, url: uploadResult.url };

  } catch (error: any) {
    console.error(`Error uploading signature for stage ${stage}:`, error);
    await logActivity('ERROR', 'Failed to upload approver signature', { stage, error: error.message });
    return { success: false, error: error.message || 'Server error during upload.' };
  }
}


export async function sendLoginOtp(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes from now

    const otpData: LoginOtp = { email, otp, expiresAt }
    await adminDb.collection("loginOtps").doc(email).set(otpData)

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff; text-align:center; font-size:18px;">Your Verification Code</p>
        <p style="color:#e0e0e0; text-align:center;">Please use the following code to complete your login. This code will expire in 10 minutes.</p>
        <div style="text-align:center; margin: 20px 0;">
            <p style="background-color:#2c3e50; color:#ffffff; display:inline-block; padding: 10px 20px; font-size:24px; letter-spacing: 5px; border-radius: 5px;">
                ${otp}
            </p>
        </div>
        ${EMAIL_STYLES.footer}
      </div>
    `

    await sendEmailUtility({
      to: email,
      subject: "Your Login Verification Code for PU Research Projects Portal",
      html: emailHtml,
      from: "default",
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error sending OTP:", error)
    return { success: false, error: "Failed to send OTP email." }
  }
}

export async function verifyLoginOtp(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const otpRef = adminDb.collection("loginOtps").doc(email)
    const otpSnap = await otpRef.get()

    if (!otpSnap.exists) {
      return { success: false, error: "Invalid or expired OTP. Please try again." }
    }

    const otpData = otpSnap.data() as LoginOtp

    if (otpData.otp !== otp) {
      return { success: false, error: "The OTP you entered is incorrect." }
    }

    if (Date.now() > otpData.expiresAt) {
      await otpRef.delete() // Clean up expired OTP
      return { success: false, error: "Your OTP has expired. Please log in again to receive a new one." }
    }

    await otpRef.delete() // OTP is valid and used, so delete it
    return { success: true }
  } catch (error: any) {
    console.error("Error verifying OTP:", error)
    return { success: false, error: "An unexpected error occurred during verification." }
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

export async function linkPapersToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User ID and email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const papersRef = adminDb.collection("papers")

    // This is the correct way to query for a value within an array.
    const papersQuery = papersRef.where("authorEmails", "array-contains", lowercasedEmail)

    const snapshot = await papersQuery.get()
    if (snapshot.empty) {
      console.log(`No papers found to link for new user: ${email}`)
      return { success: true, count: 0 }
    }

    console.log(`Found ${snapshot.docs.length} papers to link for new user: ${email}`)

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const paper = doc.data() as ResearchPaper
      let needsUpdate = false

      const updatedAuthors = paper.authors.map((author) => {
        // Find the author entry that matches the new user's email and doesn't have a UID yet.
        if (author.email.toLowerCase() === lowercasedEmail && !author.uid) {
          needsUpdate = true
          return { ...author, uid: uid, isExternal: false } // Update UID and mark as internal
        }
        return author
      })

      if (needsUpdate) {
        const paperRef = doc.ref
        // Add the new UID to the authorUids array for future queries.
        const updatedAuthorUids = [...new Set([...(paper.authorUids || []), uid])]
        batch.update(paperRef, { authors: updatedAuthors, authorUids: updatedAuthorUids })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      console.log(`Successfully committed updates for ${updatedCount} papers for user ${email}.`)
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking papers to new user:", error)
    await logActivity("ERROR", "Failed to link papers to new user", {
      uid,
      email,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: error.message || "Failed to link papers." }
  }
}

export async function updateProjectStatus(projectId: string, newStatus: Project["status"], comments?: string) {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project

    const updateData: { [key: string]: any } = { status: newStatus }
    if (comments) {
      if (newStatus === "Revision Needed") {
        updateData.revisionComments = comments
      } else if (newStatus === "Not Recommended") {
        updateData.rejectionComments = comments
      }
    }

    await projectRef.update(updateData)
    await logActivity("INFO", "Project status updated", { projectId, newStatus, piUid: project.pi_uid })

    const notification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `Your project "${project.title}" status was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    let emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff;">Dear ${project.pi},</p>
        <p style="color:#e0e0e0;">
          The status of your project, "<strong style="color:#ffffff;">${project.title}</strong>" has been updated to 
          <strong style="color:#ffca28;">${newStatus}</strong>.
        </p>
    `

    if (comments) {
      const reasonTitle = newStatus === 'Revision Needed' ? "Evaluator's Comments for Revision:" : "Reason for Decision:";
      emailHtml += `
          <div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;">
            <h4 style="color:#ffffff; margin-top:0;">${reasonTitle}</h4>
            <p style="color:#e0e0e0; white-space: pre-wrap;">${comments}</p>
          </div>
        `
      if (newStatus === 'Revision Needed') {
         emailHtml += `<p style="color:#e0e0e0; margin-top:20px;">Please submit the revised proposal from your project details page on the portal.</p>`
      }
    }

    emailHtml += `
      <p style="color:#e0e0e_0;">
        You can view your project details on the 
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectId}" style="color:#64b5f6; text-decoration:underline;">
          PU Research Projects Portal
        </a>.
      </p>
      ${EMAIL_STYLES.footer}
    </div>`

    if (project.pi_email) {
      await sendEmailUtility({
        to: project.pi_email,
        subject: `Project Status Update: ${project.title}`,
        html: emailHtml,
        from: "default",
      })
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


export async function updateIncentiveClaimStatus(claimId: string, newStatus: IncentiveClaim["status"]) {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    const claimSnap = await claimRef.get()

    if (!claimSnap.exists) {
      return { success: false, error: "Incentive claim not found." }
    }
    const claim = claimSnap.data() as IncentiveClaim

    await claimRef.update({ status: newStatus })
    await logActivity("INFO", "Incentive claim status updated", { claimId, newStatus, userId: claim.uid })

    const claimTitle =
      claim.paperTitle ||
      claim.patentTitle ||
      claim.conferencePaperTitle ||
      claim.publicationTitle ||
      claim.professionalBodyName ||
      claim.apcPaperTitle ||
      "Your Claim"

    const notification = {
      uid: claim.uid,
      projectId: claimId,
      title: `Your incentive claim for "${claimTitle}" was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (claim.userEmail) {
      await sendEmailUtility({
        to: claim.userEmail,
        subject: `Incentive Claim Status Update: ${newStatus}`,
        html: `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${claim.userName},</p>
                <p style="color:#e0e0e0;">
                  The status of your incentive claim for 
                  "<strong style="color:#ffffff;">${claimTitle}</strong>" has been updated to 
                  <strong style="color:${newStatus === "Accepted" ? "#00e676" : newStatus === "Rejected" ? "#ff5252" : "#ffca28"};">
                    ${newStatus}
                  </strong>.
                </p>
                <p style="color:#e0e0e0;">
                  You can view your claims on the 
                  <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/incentive-claim" style="color:#64b5f6; text-decoration:underline;">
                 PU Research Projects Portal             
                  </a>.
                </p>
                ${EMAIL_STYLES.footer}
            </div>
            `,
        from: "default",
      })
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

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; pi: string; title: string; pi_email?: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[]; mode: 'Online' | 'Offline' },
  isMidTermReview: boolean = false,
) {
  try {
    const batch = adminDb.batch()
    const timeZone = "Asia/Kolkata"
    const meetingDateTimeString = `${meetingDetails.date}T${meetingDetails.time}:00`

    const meetingDate = toDate(meetingDateTimeString, { timeZone });
    const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

    const newMeetingDetails = {
        date: meetingDetails.date,
        time: meetingDetails.time,
        venue: meetingDetails.venue,
        mode: meetingDetails.mode,
        assignedEvaluators: meetingDetails.evaluatorUids,
    };

    const allUsersToNotify = new Map<string, User>();
    const rescheduleMap = new Map<string, boolean>();

    // Prepare notifications for all projects
    for (const projectData of projectsToSchedule) {
      const projectRef = adminDb.collection("projects").doc(projectData.id)
      const projectSnap = await projectRef.get();
      const existingProject = projectSnap.exists ? projectSnap.data() as Project : null;
      const isReschedule = !!existingProject?.meetingDetails;
      rescheduleMap.set(projectData.id, isReschedule);

      const updateData: any = { meetingDetails: newMeetingDetails };
      if (isMidTermReview) {
        updateData.hasHadMidTermReview = true;
      } else {
        updateData.status = "Under Review";
      }

      batch.update(projectRef, updateData);

      // Collect users to notify
      if (projectData.pi_uid) {
        const piSnap = await adminDb.collection("users").doc(projectData.pi_uid).get();
        if(piSnap.exists) allUsersToNotify.set(projectData.pi_uid, piSnap.data() as User);
      }

      if (isReschedule && existingProject?.meetingDetails?.assignedEvaluators) {
          for(const uid of existingProject.meetingDetails.assignedEvaluators) {
              if(!allUsersToNotify.has(uid) && uid) {
                  const userSnap = await adminDb.collection("users").doc(uid).get();
                  if(userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
              }
          }
      }
      for(const uid of meetingDetails.evaluatorUids) {
          if(!allUsersToNotify.has(uid) && uid) {
              const userSnap = await adminDb.collection("users").doc(uid).get();
              if(userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
          }
      }
    }
    
    await batch.commit(); // Commit all project updates first

    // Send notifications to registered users
    for (const [uid, user] of allUsersToNotify.entries()) {
        const isPI = projectsToSchedule.some(p => p.pi_uid === uid);
        
        const project = projectsToSchedule.find(p => p.pi_uid === uid) || projectsToSchedule[0]; // Get relevant project
        const isReschedule = rescheduleMap.get(project.id) || false;

        const meetingType = isMidTermReview ? "IMR Mid-term Review Meeting" : "IMR Evaluation Meeting";
        const subjectPrefix = isReschedule ? `RESCHEDULED: ${meetingType}` : meetingType;
        
        const formattedDate = formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy");
        const formattedTime = formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)");
        
        const projectTitles = projectsToSchedule.map(p => `<li style="color: #cccccc;">${p.title}</li>`).join("");
        
        let subject = '';
        let htmlContent = '';

        if (isPI) {
            subject = `${subjectPrefix} for Your Project: ${project.title}`;
            htmlContent = `
                <div ${EMAIL_STYLES.background}>
                  ${EMAIL_STYLES.logo}
                  <p style="color: #ffffff;">Dear Researcher,</p>
                  <p style="color: #e0e0e0;">
                    An <strong style="color: #ffffff;">${meetingType}</strong> has been ${isReschedule ? 'rescheduled' : 'scheduled'} for your project, 
                    "<strong style="color: #ffffff;">${project.title}</strong>".
                  </p>
                   ${isReschedule ? `<p style="color: #ffcdd2;">Please note the updated time/date.</p>` : ''}
                  <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                  <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                  <p><strong style="color: #ffffff;">${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                    ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
                  </p>
                  <p style="color: #cccccc; margin-top: 15px;">
                    You can view more details on the 
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${project.id}" style="color: #64b5f6; text-decoration: underline;">
                      PU Research Projects Portal
                    </a>.
                  </p>
                  ${EMAIL_STYLES.footer}
                </div>
              `;
        } else { // Is an evaluator
            subject = `IMR Evaluation Assignment (${isMidTermReview ? 'Mid-term' : 'New Submission'}) ${isReschedule ? '- RESCHEDULED' : ''}`;
             htmlContent = `
                  <div ${EMAIL_STYLES.background}>
                      ${EMAIL_STYLES.logo}
                      <p style="color: #ffffff;">Dear ${user.name},</p>
                      <p style="color: #e0e0e0;">
                          You have been assigned to an <strong style="color:#ffffff;">${meetingType}</strong> committee. ${isReschedule ? 'Please note the schedule has been updated.' : 'You are requested to be present.'}
                      </p>
                      <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                      <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                      <p><strong style="color: #ffffff;">
                        ${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}
                      </strong> 
                        ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
                      </p>
                      <p style="color: #e0e0e0;">The following projects are scheduled for your review:</p>
                      <ul style="list-style-type: none; padding-left: 0;">
                          ${projectTitles}
                      </ul>
                      <p style="color: #cccccc; margin-top: 15px;">
                          You can access your evaluation queue on the
                          <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="color: #64b5f6; text-decoration: underline;">
                           PU Research Projects Portal
                          </a>.
                      </p>
                      ${EMAIL_STYLES.footer}
                  </div>
              `;
        }

        if(user.email) {
            const startTimeUTC = format(meetingDate, "yyyyMMdd'T'HHmmss'Z'");
            const endTimeUTC = format(addHours(meetingDate, 1), "yyyyMMdd'T'HHmmss'Z'");

            const icalContent = [
                'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ParulUniversity//RDC-Portal//EN',
                'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${project.id}@paruluniversity.ac.in`, `DTSTAMP:${dtstamp}`,
                `DTSTART:${startTimeUTC}`, `DTEND:${endTimeUTC}`, `SUMMARY:${subject}`,
                `DESCRIPTION:A meeting for the IMR project '${project.title}' has been scheduled.`,
                `LOCATION:${meetingDetails.venue}`, `ORGANIZER;CN=RDC Parul University:mailto:${process.env.GMAIL_USER || 'helpdesk.rdc@paruluniversity.ac.in'}`,
                `ATTENDEE;CN=${user.name};RSVP=TRUE:mailto:${user.email}`, 'END:VEVENT', 'END:VCALENDAR'
            ].join('\r\n');

            await sendEmailUtility({
              to: user.email,
              subject,
              html: htmlContent,
              from: "default",
              icalEvent: {
                filename: 'invite.ics',
                method: 'REQUEST',
                content: icalContent
              }
            });
        }
    }
    
    // Handle unregistered PIs
    const unregisteredPis = projectsToSchedule.filter(p => !p.pi_uid && p.pi_email);
    for (const projectData of unregisteredPis) {
        const isReschedule = rescheduleMap.get(projectData.id) || false;
        const meetingType = isMidTermReview ? "IMR Mid-term Review Meeting" : "IMR Evaluation Meeting";
        const subjectPrefix = isReschedule ? `RESCHEDULED: ${meetingType}` : meetingType;
        const subject = `${subjectPrefix} for Your Project: ${projectData.title}`;

        const formattedDate = formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy");
        const formattedTime = formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)");
        
        const htmlContent = `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color: #ffffff;">Dear ${projectData.pi},</p>
              <p style="color: #e0e0e0;">
                An <strong style="color: #ffffff;">${meetingType}</strong> has been ${isReschedule ? 'rescheduled' : 'scheduled'} for your project, 
                "<strong style="color: #ffffff;">${projectData.title}</strong>".
              </p>
               ${isReschedule ? `<p style="color: #ffcdd2;">Please note the updated time/date.</p>` : ''}
              <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
              <p><strong style="color: #ffffff;">${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
              </p>
              <p style="color: #cccccc; margin-top: 15px;">
                You can view more details on the 
                <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectData.id}" style="color: #64b5f6; text-decoration: underline;">
                  PU Research Projects Portal
                </a> once you sign up.
              </p>
              ${EMAIL_STYLES.footer}
            </div>
          `;
            
        await sendEmailUtility({
            to: projectData.pi_email!,
            subject,
            html: htmlContent,
            from: "default"
        });
    }

    await logActivity("INFO", `IMR ${isMidTermReview ? 'mid-term review' : ''} meeting scheduled/rescheduled`, {
      projectIds: projectsToSchedule.map((p) => p.id),
      meetingDate: meetingDetails.date,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
    await logActivity("ERROR", "Failed to schedule IMR meeting", { error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to schedule meeting." }
  }
}

export async function uploadFileToServer(
  fileDataUrl: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { put } = await import('@vercel/blob');

    if (!fileDataUrl || typeof fileDataUrl !== "string") {
      throw new Error("Invalid file data URL provided.");
    }
    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid data URL format.");
    }
    const buffer = Buffer.from(match[2], 'base64');
    const mimeType = match[1];
    const fileName = path.split('/').pop() || 'uploaded-file';

    // If the path is for an incentive proof, use Google Drive
    if (path.startsWith('incentive-proofs/')) {
        console.log(`Uploading incentive proof to Google Drive: ${fileName}`);
        const driveResult = await uploadToDrive(buffer, fileName, mimeType, path);
        if (driveResult.success) {
            return driveResult;
        }
        // If Drive upload fails, log it and fall through to the default (Firebase) method.
        const errorMessage = `Google Drive upload failed. Falling back to default storage for ${path}. Error: ${driveResult.error}`;
        console.warn(errorMessage);
        await logActivity("WARNING", "Google Drive upload failed; falling back to default storage", { path, driveError: driveResult.error });
    }

    // Try Firebase first
    try {
        const bucket = adminStorage.bucket();
        const file = bucket.file(path);
        await file.save(buffer, { metadata: { contentType: mimeType } });
        await file.makePublic();
        const publicUrl = file.publicUrl();
        console.log(`File uploaded to Firebase Storage at ${path}`);
        return { success: true, url: publicUrl };
    } catch (firebaseError: any) {
        console.warn("Firebase upload failed, falling back to Vercel Blob:", firebaseError.message);
        await logActivity("WARNING", "Firebase upload failed, falling back to Vercel Blob", { path, error: firebaseError.message });
        
        // Fallback to Vercel Blob
        try {
            const blob = await put(path, buffer, {
                access: 'public',
                contentType: mimeType,
                token: process.env.RDC_READ_WRITE_TOKEN,
            });
            console.log(`File uploaded to Vercel Blob: ${blob.url}`);
            return { success: true, url: blob.url };
        } catch (blobError: any) {
            console.error("FATAL: Both Firebase and Vercel Blob uploads failed:", blobError.message);
            await logActivity("ERROR", "Vercel Blob upload failed after Firebase failure", { path, error: blobError.message });
            return { success: false, error: blobError.message || "Both Firebase and Vercel Blob uploads failed." };
        }
    }
  } catch (error: any) {
      console.error("Unhandled error in uploadFileToServer:", error.message);
      return { success: false, error: error.message || "An unexpected error occurred during file upload." };
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

    // A different user with the same MIS ID and campus exists.
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
              <p style="color:#e0e0e0;">You can view the project details on the PU Research Projects Portal</p>
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

export async function generateOfficeNotingForm(
  projectId: string,
  formData: {
    projectDuration: string
    phases: { name: string; amount: number }[]
  },
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;
    const fs = (await import("fs")).default;
    const path = (await import("path")).default;

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project

    const piUserRef = adminDb.collection("users").doc(project.pi_uid)
    const piUserSnap = await piUserRef.get()
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null

    let coPi1User: User | null = null
    if (project.coPiDetails && project.coPiDetails.length > 0 && project.coPiDetails[0].uid) {
      const coPi1UserRef = adminDb.collection("users").doc(project.coPiDetails[0].uid!)
      const coPi1UserSnap = await coPi1UserRef.get()
      if (coPi1UserSnap.exists) {
        coPi1User = coPi1UserSnap.data() as User
      }
    }

    const templatePath = path.join(process.cwd(), "src", "templates", "IMR_OFFICE_NOTING_TEMPLATE.docx")
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: "Office Notings form template not found on the server." }
    }
    const content = fs.readFileSync(templatePath)

    const zip = new PizZip(content)

    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

    const coPiData: { [key: string]: string } = {};
    const coPiNames = project.coPiDetails?.map((c) => c.name) || []
    for (let i = 0; i < 4; i++) {
      coPiData[`co-pi${i + 1}`] = coPiNames[i] || "N/A"
    }

    const phaseData: { [key: string]: string } = {};
    let totalAmount = 0
    for (let i = 0; i < 4; i++) {
      if (formData.phases[i]) {
        phaseData[`phase${i + 1}_amount`] = formData.phases[i].amount.toLocaleString("en-IN")
        totalAmount += formData.phases[i].amount
      } else {
        phaseData[`phase${i + 1}_amount`] = "N/A"
      }
    }

    const data = {
      pi_name: project.pi || "N/A",
      pi_designation: piUser?.designation || "N/A",
      pi_department: `${piUser?.designation || "N/A"}, ${piUser?.department || "N/A"}`,
      pi_phone: project.pi_phoneNumber || piUser?.phoneNumber || "N/A",
      pi_email: project.pi_email || "N/A",
      ...coPiData,
      copi_designation: `${coPi1User?.designation || "N/A"}, ${coPi1User?.department || "N/A"}`,
      project_title: project.title || "N/A",
      project_duration: formData.projectDuration || "N/A",
      ...phaseData,
      total_amount: totalAmount.toLocaleString("en-IN"),
      presentation_date: project.meetingDetails?.date
        ? format(parseISO(project.meetingDetails.date), "dd/MM/yyyy")
        : "N/A",
      presentation_time: project.meetingDetails?.time || "N/A",
      date: format(new Date(), 'dd/MM/yyyy'),
    }

    doc.setData(data)

    try {
      doc.render()
    } catch (error: any) {
      console.error("Docxtemplater render error:", error)
      if (error.properties && error.properties.errors) {
        console.error("Template errors:", JSON.stringify(error.properties.errors))
      }
      return { success: false, error: "Failed to render the document template." }
    }

    const buf = doc.getZip().generate({ type: "nodebuffer" })
    const base64 = buf.toString("base64")

    if (project.status === "Recommended") {
      await projectRef.update({
        projectDuration: formData.projectDuration,
        phases: formData.phases,
      })
    }

    return { success: true, fileData: base64 }
  } catch (error: any) {
    console.error("Error generating office notings form:", error)
    await logActivity("ERROR", "Failed to generate office notings form", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to generate the form." }
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
          status: "Submitted", // Reset status to allow rescheduling
          meetingDetails: FieldValue.delete(), // Clear meeting details
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

export async function sendGlobalEvaluationReminders(adminName: string): Promise<{ success: boolean; sentCount: number; error?: string }> {
    try {
        const projectsRef = adminDb.collection('projects');
        const q = projectsRef.where('status', '==', 'Under Review');
        const projectsSnapshot = await q.get();

        if (projectsSnapshot.empty) {
            return { success: true, sentCount: 0, error: "No projects are currently under review." };
        }

        const projectsToReview = projectsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Project))
            .filter(project => {
                if (!project.meetingDetails?.date) {
                    return true; // Should not happen for "Under Review" projects, but as a safeguard.
                }
                const meetingDate = parseISO(project.meetingDetails.date);
                // Exclude projects with meetings scheduled for today to avoid sending nuisance reminders.
                return !isToday(meetingDate);
            });
            
        if (projectsToReview.length === 0) {
            return { success: true, sentCount: 0, error: "No projects with past meetings need reminders." };
        }

        const pendingEvaluationsMap = new Map<string, { evaluator: User, projects: Project[] }>();

        // Get all potential evaluators in one go to minimize reads
        const allPotentialEvaluatorUids = [...new Set(projectsToReview.flatMap(p => p.meetingDetails?.assignedEvaluators || []))];
        if (allPotentialEvaluatorUids.length === 0) {
            return { success: true, sentCount: 0 };
        }
        
        // Firestore 'in' query has a limit of 30 elements, so we need to chunk it.
        const usersRef = adminDb.collection('users');
        const evaluatorsMap = new Map<string, User>();
        const chunkSize = 30;
        for (let i = 0; i < allPotentialEvaluatorUids.length; i += chunkSize) {
            const chunk = allPotentialEvaluatorUids.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;
            const evaluatorsSnapshot = await usersRef.where('__name__', 'in', chunk).get();
            evaluatorsSnapshot.forEach(doc => evaluatorsMap.set(doc.id, doc.data() as User));
        }

        // Determine pending evaluations for each evaluator across all projects
        for (const project of projectsToReview) {
            const assigned = project.meetingDetails?.assignedEvaluators || [];
            const evaluated = project.evaluatedBy || [];

            for (const evaluatorUid of assigned) {
                if (!evaluated.includes(evaluatorUid)) {
                    const evaluator = evaluatorsMap.get(evaluatorUid);
                    if (evaluator) {
                        if (!pendingEvaluationsMap.has(evaluatorUid)) {
                            pendingEvaluationsMap.set(evaluatorUid, { evaluator, projects: [] });
                        }
                        pendingEvaluationsMap.get(evaluatorUid)!.projects.push(project);
                    }
                }
            }
        }
        
        let emailsSentCount = 0;
        const emailPromises = [];

        // Send grouped emails
        for (const { evaluator, projects } of pendingEvaluationsMap.values()) {
            if (evaluator.email && projects.length > 0) {
                const projectListHtml = projects.map(p => 
                    `<li style="color: #cccccc;">
                        <strong>${p.title}</strong> (PI: ${p.pi}) - Meeting on ${format(parseISO(p.meetingDetails!.date), 'PPP')}
                    </li>`
                ).join('');
                
                const emailHtml = `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <h2 style="color:#ffffff;">Gentle Reminder: Pending IMR Evaluations</h2>
                        <p style="color:#cccccc;">Dear ${evaluator.name},</p>
                        <p style="color:#cccccc;">
                            This is a friendly reminder to please submit your evaluation for the following IMR project(s):
                        </p>
                        <ul style="padding-left: 20px;">
                            ${projectListHtml}
                        </ul>
                        <p style="color:#cccccc;">
                            Please complete the evaluations at your earliest convenience from the "Evaluation Queue" on the R&D Portal. Your timely feedback is greatly appreciated.
                        </p>
                        <p style="text-align:center; margin-top:25px;">
                            <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Go to Evaluation Queue
                            </a>
                        </p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `;
                
                emailPromises.push(sendEmailUtility({
                    to: evaluator.email,
                    subject: `Reminder: You have ${projects.length} pending IMR evaluations`,
                    html: emailHtml,
                    from: 'default'
                }));
                emailsSentCount++;
            }
        }
        
        await Promise.all(emailPromises);
        await logActivity('INFO', `${adminName} sent ${emailsSentCount} global IMR evaluation reminders`, { sentCount: emailsSentCount });
        
        return { success: true, sentCount: emailsSentCount };
    } catch (error: any) {
        console.error('Error sending global IMR evaluation reminders:', error);
        await logActivity('ERROR', 'Failed to send global IMR evaluation reminders', { error: error.message });
        return { success: false, sentCount: 0, error: error.message || 'An unknown server error occurred.' };
    }
}


export async function addTransaction(
  ...args: Parameters<typeof import('./grant-actions').addTransaction>
): ReturnType<typeof import('./grant-actions').addTransaction> {
    const { addTransaction: originalAddTransaction } = await import('./grant-actions');
    return originalAddTransaction(...args);
}

export async function deleteTransaction(
  ...args: Parameters<typeof import('./grant-actions').deleteTransaction>
): ReturnType<typeof import('./grant-actions').deleteTransaction> {
    const { deleteTransaction: originalDeleteTransaction } = await import('./grant-actions');
    return originalDeleteTransaction(...args);
}

export async function updateTransaction(
  ...args: Parameters<typeof import('./grant-actions').updateTransaction>
): ReturnType<typeof import('./grant-actions').updateTransaction> {
    const { updateTransaction: originalUpdateTransaction } = await import('./grant-actions');
    return originalUpdateTransaction(...args);
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

type ProjectData = {
  pi_email: string;
  project_title: string;
  status: string;
  grant_amount: number;
  sanction_date: string;
  Name_of_staff: string;
  Faculty: string;
  Institute: string;
  sanction_number: string;
  Department?: string;
};

// Function to convert Excel serial date number to JS Date
function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);

  const fractional_day = serial - Math.floor(serial) + 0.0000001;

  let total_seconds = Math.floor(86400 * fractional_day);

  const seconds = total_seconds % 60;
  total_seconds -= seconds;

  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

export async function bulkUploadProjects(
  projectsData: ProjectData[]
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

  for (const row of projectsData) {
    try {
      const {
        pi_email,
        project_title,
        status,
        grant_amount,
        sanction_date,
        Name_of_staff,
        Faculty,
        Institute,
        sanction_number,
        Department,
      } = row;

      if (!pi_email || !project_title || !status) {
        failures.push({ projectTitle: project_title || 'Unknown', piName: Name_of_staff || 'Unknown', error: 'Missing required data (email, title, or status).' });
        continue;
      }

      let submissionDate: Date;
      if (sanction_date instanceof Date) {
        submissionDate = sanction_date;
      } else if (typeof sanction_date === 'number') {
        submissionDate = excelDateToJSDate(sanction_date);
      } else {
        submissionDate = new Date();
      }

      const grant: GrantDetails = {
        totalAmount: grant_amount || 0,
        sanctionNumber: sanction_number || '',
        status: grant_amount > 0 ? 'Awarded' : 'Pending',
        phases: grant_amount > 0 ? [{
            id: new Date().toISOString(),
            name: "Phase 1",
            amount: grant_amount,
            status: "Disbursed",
            disbursementDate: submissionDate.toISOString(),
            transactions: []
        }] : []
      };

      const project: Omit<Project, 'id'> = {
        title: project_title,
        pi: Name_of_staff,
        pi_email: pi_email,
        faculty: Faculty,
        institute: Institute,
        departmentName: Department || '',
        submissionDate: submissionDate.toISOString(),
        status: status as Project['status'],
        type: 'Unidisciplinary',
        abstract: 'Historical project data uploaded via bulk process.',
        timelineAndOutcomes: 'Historically uploaded data.',
        pi_uid: '',
        isBulkUploaded: true,
        grant: status !== 'Not Recommended' ? grant : undefined,
      };

      await adminDb.collection('projects').add(project);
      successfulCount++;
    } catch (error: any) {
      failures.push({ projectTitle: row.project_title, piName: row.Name_of_staff, error: error.message || 'An unknown error occurred.' });
    }
  }

  await logActivity('INFO', 'Bulk project upload completed', { successfulCount, failureCount: failures.length });
  if (failures.length > 0) {
    await logActivity('WARNING', 'Some projects failed during bulk upload', { failures });
  }

  return { success: true, data: { successfulCount, failures } };
}

export async function notifyForRecruitmentApproval(jobTitle: string, postedBy: string): Promise<{ success: boolean; error?: string }> {
  try {
    const usersRef = adminDb.collection("users");
    const q = usersRef.where("allowedModules", "array-contains", "recruitment-approvals");

    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
      console.log("No users with recruitment approval permissions found.");
      return { success: true };
    }

    const batch = adminDb.batch();
    const emailPromises = [];

    for (const doc of querySnapshot.docs) {
      const user = doc.data() as User;

      // In-app notification
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: user.uid,
        title: `New Job Posting: "${jobTitle}" by ${postedBy} is awaiting approval.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        projectId: '/dashboard/recruitment-approvals', // Link to the approvals page
      });

      // Email notification
      if (user.email) {
        const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${user.name},</p>
              <p style="color:#e0e0e0;">
                  A new job posting, "<strong style="color:#ffffff;">${jobTitle}</strong>," submitted by ${postedBy}, is awaiting your approval.
              </p>
              <p style="text-align:center; margin-top:25px;">
                  <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/recruitment-approvals" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      Review Posting
                  </a>
              </p>
              ${EMAIL_STYLES.footer}
          </div>
        `;
        emailPromises.push(
          sendEmailUtility({
            to: user.email,
            subject: `Action Required: New Job Posting for Approval`,
            html: emailHtml,
            from: "default",
          })
        );
      }
    }

    await batch.commit();
    await Promise.all(emailPromises);
    
    await logActivity("INFO", `Notified ${querySnapshot.size} admins for recruitment approval`, { jobTitle, postedBy });
    return { success: true };
  } catch (error: any) {
    console.error("Error notifying for recruitment approval:", error);
    await logActivity("ERROR", "Failed to notify for recruitment approval", { jobTitle, error: error.message });
    return { success: false, error: error.message || "Failed to send notifications." };
  }
}
    
