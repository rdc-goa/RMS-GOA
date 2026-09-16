'use server';

import { adminDb, adminStorage } from "@/lib/admin";
import { SpecialCfp, CfpSubmission } from "@/types";
import { checkAuth } from "@/lib/check-auth";
import { logActivity, EMAIL_STYLES, validateUploadedFile } from "./utils";
import { logEvent } from "@/lib/logger";
import { sendEmail as sendEmailUtility } from "@/lib/email";
import { isCfpDeadlinePast } from "@/lib/utils";
import crypto from "crypto";

// Helper to verify if the user has admin/cro access OR manage-cfp-submissions module access
async function verifyManageCfpAccess(session: any): Promise<boolean> {
  if (session.authorized) return true;
  if (!session.uid) return false;
  try {
    const userDoc = await adminDb.collection("users").doc(session.uid).get();
    if (userDoc.exists) {
      const allowedModules = userDoc.data()?.allowedModules || [];
      return allowedModules.includes("manage-cfp-submissions");
    }
  } catch (error) {
    console.error("Error verifying manage-cfp-submissions access:", error);
  }
  return false;
}

// Create or update a Special Call for Proposals
export async function saveSpecialCfp(
  cfpId: string,
  cfpData: Omit<SpecialCfp, "id">
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) {
      return { success: false, error: "Session expired. Please log in again." };
    }
    if (!(await verifyManageCfpAccess(session))) {
      return { success: false, error: "Unauthorized. Admin access required." };
    }

    const cfpRef = adminDb.collection("specialCfps").doc(cfpId);
    
    // Generate sequential ID if not exists
    let finalCfpData = { ...cfpData };
    if (!cfpData.callIdentifier) {
      const counterRef = adminDb.collection("system").doc("cfpCounter");
      await adminDb.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextNum = 1;
        if (counterDoc.exists) {
          nextNum = (counterDoc.data()?.count || 0) + 1;
        }
        transaction.set(counterRef, { count: nextNum }, { merge: true });
        finalCfpData.callIdentifier = `RDC/CFP/${new Date().getFullYear()}/${String(nextNum).padStart(4, "0")}`;
      });
    }

    await cfpRef.set(finalCfpData, { merge: true });
    await logActivity("INFO", `Announced Special CFP: ${cfpData.title}`, { cfpId });
    return { success: true };
  } catch (error: any) {
    console.error("Error saving special CFP:", error);
    return { success: false, error: error.message || "Failed to save call announcement." };
  }
}

// Delete Special CFP
export async function deleteSpecialCfp(
  cfpId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    await adminDb.collection("specialCfps").doc(cfpId).delete();
    await logActivity("INFO", `Deleted Special CFP: ${cfpId}`, { cfpId });
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting CFP:", error);
    return { success: false, error: error.message };
  }
}

// Save proposal submission
export async function saveCfpSubmission(
  submissionId: string,
  submissionData: Omit<CfpSubmission, "id">
): Promise<{ success: boolean; error?: string; submissionId?: string }> {
  try {
    if (submissionData.coPiDetails && submissionData.coPiDetails.length > 3) {
      return { success: false, error: "You can submit a maximum of 3 Co-PIs." };
    }

    if (submissionData.cfpId) {
      const cfpDoc = await adminDb.collection("specialCfps").doc(submissionData.cfpId).get();
      if (cfpDoc.exists) {
        const cfpData = cfpDoc.data() as SpecialCfp;
        const deadlinePassed = isCfpDeadlinePast(cfpData?.applyDeadline, cfpData?.status);
        if (deadlinePassed) {
          const submissionRef = adminDb.collection("cfpSubmissions").doc(submissionId);
          const existingDoc = await submissionRef.get();
          const existingData = existingDoc.exists ? existingDoc.data() : null;
          const existingStatus = existingData?.status;
          const allowEditAfterDeadline = existingData?.allowEditAfterDeadline;

          if (existingStatus === "Draft" && allowEditAfterDeadline === true) {
            // Allow editing of this draft even though deadline has passed
          } else if (!existingDoc.exists || existingStatus !== "Revision Needed") {
            return {
              success: false,
              error: "The application deadline for this Call for Proposals has passed and new submissions are no longer accepted."
            };
          }
        }
      }
    }

    const submissionRef = adminDb.collection("cfpSubmissions").doc(submissionId);
    let finalData = { ...submissionData };

    const existingDoc = await submissionRef.get();
    const isTransitioningToSubmitted = submissionData.status === "Submitted" && (!existingDoc.exists || existingDoc.data()?.status !== "Submitted");

    if (!submissionData.submissionId) {
      const counterRef = adminDb.collection("system").doc("cfpSubmissionCounter");
      await adminDb.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextNum = 1;
        if (counterDoc.exists) {
          nextNum = (counterDoc.data()?.count || 0) + 1;
        }
        transaction.set(counterRef, { count: nextNum }, { merge: true });
        finalData.submissionId = `RDC/CFP/SUB/${new Date().getFullYear()}/${String(nextNum).padStart(4, "0")}`;
      });
    }

    if (submissionData.status === "Submitted" && !submissionData.submissionDate) {
      finalData.submissionDate = new Date().toISOString();
    }

    await submissionRef.set(finalData, { merge: true });
    await logActivity("INFO", `CFP Proposal ${submissionData.status}: ${submissionData.title}`, { submissionId });

    if (isTransitioningToSubmitted && finalData.piEmail) {
      try {
        const coPiDetails = finalData.coPiDetails || [];
        const sdgGoals = finalData.sdgGoals || [];

        const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#333333;">Dear <strong>${finalData.piName}</strong>,</p>
              <p style="color:#555555;">We are pleased to inform you that your research proposal has been successfully submitted to the <strong>${finalData.cfpTitle}</strong>.</p>
              
              <div style="background: #f8f9fa; border: 1px solid #eeeeee; border-left: 4px solid #1a73e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #2c3e50; margin-top: 0; font-size: 16px;">Proposal Identification</h3>
                  <p style="color: #555555; margin: 5px 0;"><strong>Submission ID:</strong> <span style="font-family: monospace; background: #f1f3f4; padding: 2px 6px; border-radius: 4px; color: #b06000; border: 1px solid #dddddd;">${finalData.submissionId}</span></p>
                  <p style="color: #555555; margin: 5px 0;"><strong>Project Title:</strong> ${finalData.title}</p>
                  <p style="color: #555555; margin: 5px 0;"><strong>Category / Type:</strong> ${finalData.projectType}</p>
                  <p style="color: #555555; margin: 5px 0;"><strong>Submission Date:</strong> ${finalData.submissionDate ? new Date(finalData.submissionDate).toLocaleString() : new Date().toLocaleString()}</p>
              </div>

              <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Principal Investigator (PI) Info</h3>
                  <ul style="color: #555555; list-style: none; padding: 0; margin: 0;">
                      <li><strong>Name:</strong> ${finalData.piName}</li>
                      <li><strong>Email:</strong> ${finalData.piEmail}</li>
                      <li><strong>Phone:</strong> ${finalData.piPhone}</li>
                      <li><strong>Institution:</strong> ${finalData.piOrganization} ${finalData.piFaculty ? `(${finalData.piFaculty})` : ''}</li>
                      ${finalData.piDepartment ? `<li><strong>Department:</strong> ${finalData.piDepartment}</li>` : ''}
                      ${finalData.piCvUrl ? `<li><strong>CV File:</strong> <a href="${finalData.piCvUrl}" style="color: #1a73e8; text-decoration: underline;">View / Download CV</a></li>` : ''}
                  </ul>
              </div>

              ${coPiDetails.length > 0 ? `
              <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Co-Investigators</h3>
                  ${coPiDetails.map((copi: any, i: number) => `
                      <div style="border-bottom: 1px solid #eeeeee; padding-bottom: 8px; margin-bottom: 8px; ${i === coPiDetails.length - 1 ? 'border-bottom:none; margin-bottom:0; padding-bottom:0;' : ''}">
                          <p style="color:#2c3e50; margin:0 0 4px 0;"><strong>${copi.name}</strong></p>
                          <p style="color:#555555; margin:0; font-size:12px;">Email: ${copi.email} | Org: ${copi.organization}</p>
                          ${copi.cvUrl ? `<p style="color:#555555; margin:4px 0 0 0; font-size:12px;">CV: <a href="${copi.cvUrl}" style="color: #1a73e8; text-decoration: underline;">View CV</a></p>` : ''}
                      </div>
                  `).join('')}
              </div>
              ` : ''}

              ${finalData.studentInfo ? `
              <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Student Team Info</h3>
                  <p style="color: #555555; margin: 0; font-size: 13px; white-space: pre-wrap;">${finalData.studentInfo}</p>
              </div>
              ` : ''}

              <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Project Brief & Files</h3>
                  <p style="color: #555555; margin: 5px 0 15px 0; font-size: 13px; line-height: 1.5;"><strong>Abstract:</strong><br/>${finalData.abstract}</p>
                  <p style="color: #555555; margin: 5px 0 15px 0; font-size: 13px; line-height: 1.5;"><strong>Expected Outcomes & Outlay:</strong><br/>${finalData.expectedOutcomes}</p>
                  
                  ${sdgGoals.length > 0 ? `<p style="color: #555555; margin: 5px 0 10px 0; font-size: 13px;"><strong>UN SDGs:</strong> ${sdgGoals.join(', ')}</p>` : ''}

                  <p style="color: #555555; margin: 5px 0;"><strong>Proposal Documents:</strong></p>
                  <ul style="color: #555555; padding-left: 20px; margin: 5px 0;">
                      ${finalData.proposalUrl ? `<li><a href="${finalData.proposalUrl}" style="color: #1a73e8; text-decoration: underline;">Project Proposal PDF</a></li>` : ''}
                      ${finalData.ethicsUrl ? `<li><a href="${finalData.ethicsUrl}" style="color: #1a73e8; text-decoration: underline;">Ethics Approval PDF</a></li>` : ''}
                  </ul>
              </div>

              <p style="color:#555555;">Our team will review your submission and contact you regarding the evaluation/presentation schedule.</p>
              
              ${EMAIL_STYLES.footer}
          </div>
        `;

        await sendEmailUtility({
          to: finalData.piEmail,
          subject: `Proposal Submission Confirmation: ${finalData.title}`,
          html: emailHtml,
          from: 'default',
          category: 'Other'
        });

        // Send confirmation email to Co-PIs as well
        if (coPiDetails.length > 0) {
          for (const copi of coPiDetails) {
            if (copi.email) {
              const copiEmailHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#333333;">Dear <strong>${copi.name}</strong>,</p>
                    <p style="color:#555555;">We are pleased to inform you that you have been added as a <strong>Co-Investigator (Co-PI)</strong> for a research proposal successfully submitted by <strong>${finalData.piName}</strong> to the <strong>${finalData.cfpTitle}</strong>.</p>
                    
                    <div style="background: #f8f9fa; border: 1px solid #eeeeee; border-left: 4px solid #1a73e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #2c3e50; margin-top: 0; font-size: 16px;">Proposal Identification</h3>
                        <p style="color: #555555; margin: 5px 0;"><strong>Submission ID:</strong> <span style="font-family: monospace; background: #f1f3f4; padding: 2px 6px; border-radius: 4px; color: #b06000; border: 1px solid #dddddd;">${finalData.submissionId}</span></p>
                        <p style="color: #555555; margin: 5px 0;"><strong>Project Title:</strong> ${finalData.title}</p>
                        <p style="color: #555555; margin: 5px 0;"><strong>Category / Type:</strong> ${finalData.projectType}</p>
                        <p style="color: #555555; margin: 5px 0;"><strong>Submission Date:</strong> ${finalData.submissionDate ? new Date(finalData.submissionDate).toLocaleString() : new Date().toLocaleString()}</p>
                    </div>

                    <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Principal Investigator (PI) Info</h3>
                        <ul style="color: #555555; list-style: none; padding: 0; margin: 0;">
                            <li><strong>Name:</strong> ${finalData.piName}</li>
                            <li><strong>Email:</strong> ${finalData.piEmail}</li>
                            <li><strong>Phone:</strong> ${finalData.piPhone}</li>
                            <li><strong>Institution:</strong> ${finalData.piOrganization} ${finalData.piFaculty ? `(${finalData.piFaculty})` : ''}</li>
                            ${finalData.piDepartment ? `<li><strong>Department:</strong> ${finalData.piDepartment}</li>` : ''}
                        </ul>
                    </div>

                    <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Co-Investigators Details</h3>
                        ${coPiDetails.map((c: any, idx: number) => `
                            <div style="border-bottom: 1px solid #eeeeee; padding-bottom: 8px; margin-bottom: 8px; ${idx === coPiDetails.length - 1 ? 'border-bottom:none; margin-bottom:0; padding-bottom:0;' : ''}">
                                <p style="color:#2c3e50; margin:0 0 4px 0;"><strong>${c.name}</strong> ${c.email === copi.email ? '<span style="color:#1a73e8; font-size:11px;">(You)</span>' : ''}</p>
                                <p style="color:#555555; margin:0; font-size:12px;">Email: ${c.email} | Org: ${c.organization}</p>
                            </div>
                        `).join('')}
                    </div>

                    <div style="background: #f8f9fa; border: 1px solid #eeeeee; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #2c3e50; margin-top: 0; font-size: 15px;">Project Brief & Files</h3>
                        <p style="color: #555555; margin: 5px 0 15px 0; font-size: 13px; line-height: 1.5;"><strong>Abstract:</strong><br/>${finalData.abstract}</p>
                        <p style="color: #555555; margin: 5px 0 15px 0; font-size: 13px; line-height: 1.5;"><strong>Expected Outcomes:</strong><br/>${finalData.expectedOutcomes}</p>
                        ${finalData.proposalUrl ? `<p style="color: #555555; margin: 5px 0;"><strong>Proposal PDF:</strong> <a href="${finalData.proposalUrl}" style="color: #1a73e8; text-decoration: underline;">View / Download Proposal Document</a></p>` : ''}
                    </div>

                    <p style="color:#555555;">Our team will review the submission and contact the project investigators regarding the next steps.</p>
                    
                    ${EMAIL_STYLES.footer}
                </div>
              `;

              await sendEmailUtility({
                to: copi.email,
                subject: `Added as Co-Investigator: ${finalData.title}`,
                html: copiEmailHtml,
                from: 'default',
                category: 'Other'
              });
            }
          }
        }
      } catch (emailErr) {
        console.error("Failed to send submission confirmation email:", emailErr);
      }
    }
    return { success: true, submissionId: finalData.submissionId || submissionId };
  } catch (error: any) {
    console.error("Error saving CFP submission:", error);
    return { success: false, error: error.message || "Failed to submit proposal." };
  }
}

/**
 * Server action to securely upload public proposal documents for Call for Proposals
 */
export async function uploadPublicCfpFileAction(formData: FormData): Promise<{
  success: boolean;
  url?: string;
  fileName?: string;
  path?: string;
  error?: string;
}> {
  try {
    const file = formData.get("file") as File | null;
    const cfpId = (formData.get("cfpId") as string | null) || "general";

    if (!file) {
      return { success: false, error: "No file provided." };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: "File size exceeds 10MB limit." };
    }

    const fileMime = (file.type || "").toLowerCase().trim();
    const sanitizedCfpId = cfpId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 80);
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-_]/g, "_").replace(/\.{2,}/g, ".");
    const storagePath = `cfp-submissions/${sanitizedCfpId}/${Date.now()}-${sanitizedFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validateUploadedFile(buffer, fileMime || "application/pdf", storagePath);
    if (!validation.valid) {
      return { success: false, error: validation.error || "File content validation failed." };
    }

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);
    const downloadToken = crypto.randomUUID();

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || "application/octet-stream",
        metadata: {
          originalName: file.name,
          cfpId: sanitizedCfpId,
          firebaseStorageDownloadTokens: downloadToken,
          uploadedAt: new Date().toISOString(),
        }
      }
    });

    const bucketName = bucket.name;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    return {
      success: true,
      url: downloadUrl,
      fileName: file.name,
      path: storagePath
    };
  } catch (error: any) {
    console.error("Error in uploadPublicCfpFileAction:", error);
    return { success: false, error: error.message || "Failed to upload file." };
  }
}

// Update submission status
export async function updateCfpSubmissionStatus(
  submissionId: string,
  newStatus: CfpSubmission["status"],
  remarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin", "cro"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    const submissionRef = adminDb.collection("cfpSubmissions").doc(submissionId);
    const updateData: { [key: string]: any } = { status: newStatus };
    if (remarks) {
      updateData.remarks = remarks;
    }

    await submissionRef.update(updateData);
    await logActivity("INFO", `CFP submission status updated to ${newStatus}`, { submissionId });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating CFP submission status:", error);
    return { success: false, error: error.message || "Failed to update status." };
  }
}

// Allow/disallow edits for a draft submission after deadline
export async function toggleCfpDraftEditPermission(
  submissionId: string,
  allow: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    const submissionRef = adminDb.collection("cfpSubmissions").doc(submissionId);
    await submissionRef.update({
      allowEditAfterDeadline: allow
    });
    await logActivity("INFO", `CFP draft edit permission ${allow ? 'granted' : 'revoked'} after deadline`, { submissionId });
    return { success: true };
  } catch (error: any) {
    console.error("Error toggling CFP draft edit permission:", error);
    return { success: false, error: error.message || "Failed to update permission." };
  }
}

// Fetch all announced CFPs (Admin/User helper)
export async function getAllSpecialCfps(): Promise<SpecialCfp[]> {
  try {
    const snapshot = await adminDb.collection("specialCfps").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialCfp));
  } catch (error) {
    console.error("Error fetching special CFPs:", error);
    return [];
  }
}

// Fetch proposals for the logged-in PI
export async function getCfpSubmissionsForUser(piEmail: string): Promise<CfpSubmission[]> {
  try {
    const snapshot = await adminDb.collection("cfpSubmissions")
      .where("piEmail", "==", piEmail)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
  } catch (error) {
    console.error("Error fetching user CFP submissions:", error);
    return [];
  }
}

// Fetch all proposals (Admin view)
export async function getAllCfpSubmissions(): Promise<CfpSubmission[]> {
  try {
    const snapshot = await adminDb.collection("cfpSubmissions").orderBy("submissionDate", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
  } catch (error) {
    console.error("Error fetching all CFP submissions:", error);
    return [];
  }
}

// Schedule review meeting for CFP submissions
export async function scheduleCfpMeeting(
  submissionsToSchedule: { id: string; pi: string; title: string; piEmail: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[]; mode: 'Online' | 'Offline' }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    const batch = adminDb.batch();
    const newMeetingDetails = {
      date: meetingDetails.date,
      time: meetingDetails.time,
      venue: meetingDetails.venue,
      mode: meetingDetails.mode,
      assignedEvaluators: meetingDetails.evaluatorUids,
    };

    for (const sub of submissionsToSchedule) {
      const ref = adminDb.collection("cfpSubmissions").doc(sub.id);
      batch.update(ref, {
        meetingDetails: newMeetingDetails,
        wasAbsent: false,
        status: "Under Review"
      });
    }

    await batch.commit();
    await logActivity("INFO", "Scheduled review meeting for CFP proposals", { count: submissionsToSchedule.length });
    return { success: true };
  } catch (error: any) {
    console.error("Error scheduling CFP meeting:", error);
    return { success: false, error: error.message || "Failed to schedule meeting." };
  }
}

// Mark CFP attendance (PI / Evaluators)
export async function markCfpAttendance(
  meetingSubmissions: { id: string; piEmail: string }[],
  absentPiEmails: string[],
  absentEvaluatorUids: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin", "cro"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    const batch = adminDb.batch();
    const submissionsRef = adminDb.collection("cfpSubmissions");

    for (const sub of meetingSubmissions) {
      const ref = submissionsRef.doc(sub.id);
      const isPiAbsent = absentPiEmails.includes(sub.piEmail);

      if (isPiAbsent) {
        // Reset slot and restore to Submitted status
        batch.update(ref, {
          wasAbsent: true,
          status: "Submitted",
          meetingDetails: null
        });
      } else if (absentEvaluatorUids.length > 0) {
        // Add absent evaluators to evaluation meeting metadata
        const docSnap = await ref.get();
        if (docSnap.exists) {
          const currentMeeting = docSnap.data()?.meetingDetails || {};
          const currentAbsents = currentMeeting.absentEvaluators || [];
          const updatedAbsents = Array.from(new Set([...currentAbsents, ...absentEvaluatorUids]));
          batch.update(ref, {
            "meetingDetails.absentEvaluators": updatedAbsents
          });
        }
      }
    }

    await batch.commit();
    await logActivity("INFO", "Marked CFP meeting attendance successfully");
    return { success: true };
  } catch (error: any) {
    console.error("Error marking CFP attendance:", error);
    return { success: false, error: error.message };
  }
}

// Submit CFP Evaluation
export async function submitCfpEvaluation(
  submissionId: string,
  evaluatorUid: string,
  evaluatorName: string,
  recommendation: "Recommended" | "Not Recommended" | "Revision Is Needed",
  comments: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["Evaluator", "admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };

    const ref = adminDb.collection("cfpSubmissions").doc(submissionId);
    const docSnap = await ref.get();
    if (!docSnap.exists) return { success: false, error: "Submission not found." };

    const sub = docSnap.data() as CfpSubmission;
    const evaluatedBy = Array.from(new Set([...(sub.evaluatedBy || []), evaluatorUid]));

    const evaluationRef = ref.collection("evaluations").doc(evaluatorUid);
    await evaluationRef.set({
      evaluatorUid,
      evaluatorName,
      evaluationDate: new Date().toISOString(),
      recommendation,
      comments
    });

    let newStatus = sub.status;
    if (recommendation === "Recommended") newStatus = "Recommended";
    else if (recommendation === "Not Recommended") newStatus = "Not Recommended";
    else if (recommendation === "Revision Is Needed") newStatus = "Revision Needed";

    await ref.update({
      evaluatedBy,
      status: newStatus,
      remarks: comments
    });

    await logActivity("INFO", `CFP Proposal Evaluated: ${sub.title}`, { submissionId, evaluatorName });
    return { success: true };
  } catch (error: any) {
    console.error("Error submitting CFP evaluation:", error);
    return { success: false, error: error.message };
  }
}

// Update CFP Project Duration (start/end dates)
export async function updateCfpDuration(
  submissionId: string,
  startDate: string,
  endDate: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ["admin", "super-admin", "Super-admin"] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!(await verifyManageCfpAccess(session))) return { success: false, error: "Unauthorized." };

    await adminDb.collection("cfpSubmissions").doc(submissionId).update({
      projectStartDate: startDate,
      projectEndDate: endDate
    });

    await logActivity("INFO", "CFP Project duration timeline updated", { submissionId });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating CFP duration:", error);
    return { success: false, error: error.message };
  }
}

// Update CFP Grant Details ( installment disbursements & tracking)
export async function updateCfpGrant(
  submissionId: string,
  grantData: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Session expired." };

    await adminDb.collection("cfpSubmissions").doc(submissionId).update({
      grant: grantData
    });

    await logActivity("INFO", "CFP Project grant details updated", { submissionId });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating CFP grant:", error);
    return { success: false, error: error.message };
  }
}

// PI Submits Revised CFP Proposal
export async function submitCfpRevision(
  submissionId: string,
  revisedProposalUrl: string,
  comments?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Session expired." };

    await adminDb.collection("cfpSubmissions").doc(submissionId).update({
      revisedProposalUrl,
      revisionSubmissionDate: new Date().toISOString(),
      status: "Revision Submitted",
      revisionComments: comments || ""
    });

    await logActivity("INFO", "CFP Proposal revision submitted", { submissionId });
    return { success: true };
  } catch (error: any) {
    console.error("Error submitting CFP revision:", error);
    return { success: false, error: error.message };
  }
}
