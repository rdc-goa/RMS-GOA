'use server';

import { adminDb } from "@/lib/admin"
import { User, Project } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { parseISO, isToday } from "date-fns"
import { logActivity, EMAIL_STYLES } from "./utils"

export async function sendEmail(options: { to: string; subject: string; html: string; from: "default" | "rdc", icalEvent?: any, category?: 'IMR' | 'EMR' | 'Incentive' | 'Other' }) {
  return await sendEmailUtility(options)
}

export async function reportErrorToHelpdesk(
  error: { message: string, stack?: string },
  pageUrl: string,
  user: User | null,
  userAction?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const to = "helpdesk.rdc@paruluniversity.ac.in";
    const subject = `CRITICAL: RDC Portal System Error - ${error.message.substring(0, 50)}`;

    const indexLinkMatch = error.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
    const indexLink = indexLinkMatch ? indexLinkMatch[0] : null;

    let userHtml = '<p style="color:#e0e0e0;">Guest / Not logged in</p>';
    if (user) {
      userHtml = `
            <ul style="color:#e0e0e0; list-style: none; padding: 0; margin-top: 5px;">
                <li><strong>Name:</strong> ${user.name || 'N/A'}</li>
                <li><strong>Email:</strong> ${user.email || 'N/A'}</li>
                <li><strong>MIS ID:</strong> ${user.misId || 'N/A'}</li>
                <li><strong>Role:</strong> ${user.role || 'N/A'}</li>
                <li><strong>Campus:</strong> ${user.campus || 'N/A'}</li>
            </ul>
        `;
    }

    const emailHtml = `
        <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <h2 style="color: #ff5252; text-align: center; border-bottom: 2px solid #ff5252; padding-bottom: 10px;">System Error Report</h2>
            
            <div style="margin-top: 20px; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px;">
                <h3 style="color: #ffca28; margin-top: 0;">Error Message</h3>
                <p style="color: #ffffff; font-family: monospace; background: #1a2a33; padding: 15px; border-radius: 4px; border-left: 4px solid #ff5252; overflow-x: auto; margin-bottom: 0;">
                    ${error.message}
                </p>
                ${indexLink ? `
                <div style="margin-top: 15px; padding: 15px; background: #1b5e20; border-radius: 4px; border: 1px solid #4caf50;">
                    <p style="color: #ffffff; margin: 0 0 5px 0;"><strong>Required Index Action:</strong></p>
                    <a href="${indexLink}" style="color: #81c784; text-decoration: underline; word-break: break-all;">${indexLink}</a>
                </div>` : ''}
            </div>

            <div style="margin-top: 20px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px;">
                <h3 style="color: #64b5f6; margin-top: 0;">Contextual Information</h3>
                <p style="color: #e0e0e0; margin-bottom: 5px;"><strong>Page URL:</strong> <a href="${pageUrl}" style="color: #64b5f6;">${pageUrl}</a></p>
                ${userAction ? `<p style="color: #e0e0e0; margin-bottom: 10px;"><strong>What user was doing:</strong> ${userAction}</p>` : ''}
                
                <div style="border-top: 1px solid #4f5b62; padding-top: 10px; margin-top: 10px;">
                    <h4 style="color: #64b5f6; margin: 0 0 5px 0;">User Information</h4>
                    ${userHtml}
                </div>
            </div>

            ${error.stack ? `
            <div style="margin-top: 20px;">
                <details style="color: #b0bec5; cursor: pointer;">
                    <summary style="padding: 5px; background: rgba(255,255,255,0.05); border-radius: 4px;">View Technical Stack Trace</summary>
                    <pre style="font-size: 11px; color: #90a4ae; background: #000; padding: 10px; margin-top: 10px; overflow: auto; max-height: 300px; border-radius: 4px;">${error.stack}</pre>
                </details>
            </div>` : ''}

            ${EMAIL_STYLES.footer}
        </div>
    `;

    await sendEmailUtility({
      to,
      subject,
      html: emailHtml,
      from: 'default'
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to report system error:", err);
    return { success: false, error: err.message };
  }
}

export async function sendErrorEmail(
  errorDetails: { message: string; digest?: string },
  user: User | null,
  pageUrl?: string
): Promise<{ success: boolean }> {
  try {
    const to = process.env.HELPDESK_EMAIL || process.env.GMAIL_USER || "helpdesk.rdc@paruluniversity.ac.in";
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
                <h3 style="color:#c62828; margin-top:0;">Error Details:</h3>
                <p style="font-family: monospace; background: #fff3e0; padding: 10px; border-radius: 4px;">${errorDetails.message}</p>
                ${pageUrl ? `<p><strong>Page URL:</strong> <a href="${pageUrl}">${pageUrl}</a></p>` : ''}
                ${errorDetails.digest ? `<p><strong>Digest:</strong> ${errorDetails.digest}</p>` : ''}
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
    return { success: false };
  }
}

export async function notifyAdminsOnProjectSubmission(projectId: string, projectTitle: string, piName: string) {
  try {
    const adminRoles = ["admin", "Super-admin", "CRO"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
      return { success: true, message: "No admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `New Project Submitted: "${projectTitle}" by ${piName}`

    adminUsersSnapshot.forEach((userDocSnapshot) => {
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
    })
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function notifySuperAdminsOnEvaluation(projectId: string, projectName: string, evaluatorName: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
    if (superAdminUsersSnapshot.empty) {
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
    })
    return { success: false, error: error.message || "Failed to notify Super-admins." }
  }
}

export async function notifyAdminsOnCompletionRequest(projectId: string, projectTitle: string, piName: string) {
  try {
    // This function requires getSystemSettings, which might be in system-service.
    // For now, I'll extract it here.
    const settingsRef = adminDb.collection("system").doc("settings")
    const settingsSnap = await settingsRef.get()
    const settings = settingsSnap.data() || {};

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
        from: 'default',
        category: 'IMR'
      });
      await logActivity("INFO", "Utilization report notification sent to designated email", { projectId, projectTitle, notifiedEmail: settings.utilizationNotificationEmail });
    }

    const adminRoles = ["admin", "Super-admin"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
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
    })
    return { success: false, error: error.message || "Failed to notify admins." }
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
        if (!project.meetingDetails?.date) return true;
        const meetingDate = parseISO(project.meetingDetails.date);
        return !isToday(meetingDate);
      });

    if (projectsToReview.length === 0) {
      return { success: true, sentCount: 0, error: "No projects with past meetings need reminders." };
    }

    const pendingEvaluationsMap = new Map<string, { evaluator: User, projects: Project[] }>();
    const allPotentialEvaluatorUids = [...new Set(projectsToReview.flatMap(p => (p.meetingDetails?.assignedEvaluators || []).filter(Boolean)))];
    
    if (allPotentialEvaluatorUids.length === 0) return { success: true, sentCount: 0 };

    const usersRef = adminDb.collection('users');
    const evaluatorsMap = new Map<string, User>();
    const chunkSize = 30;
    for (let i = 0; i < allPotentialEvaluatorUids.length; i += chunkSize) {
      const chunk = allPotentialEvaluatorUids.slice(i, i + chunkSize);
      const evaluatorsSnapshot = await usersRef.where('__name__', 'in', chunk).get();
      evaluatorsSnapshot.forEach(doc => evaluatorsMap.set(doc.id, doc.data() as User));
    }

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
    for (const [evaluatorUid, data] of pendingEvaluationsMap.entries()) {
        const { evaluator, projects } = data;
        if (!evaluator.email) continue;

        const projectsListHtml = projects.map(p => `<li>${p.title} (PI: ${p.pi})</li>`).join('');
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${evaluator.name},</p>
                <p style="color:#e0e0e0;">This is a friendly reminder from ${adminName} regarding pending evaluations for the following IMR project(s):</p>
                <ul style="color:#ffffff;">
                    ${projectsListHtml}
                </ul>
                <p style="color:#e0e0e0;">Please log in to the PU Research Projects Portal to submit your evaluation reports at your earliest convenience.</p>
                <p style="text-align:center; margin-top:25px;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/pending-reviews" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Go to Pending Reviews
                    </a>
                </p>
                ${EMAIL_STYLES.footer}
            </div>
        `;

        await sendEmailUtility({
            to: evaluator.email,
            subject: `Reminder: Pending IMR Project Evaluations`,
            html: emailHtml,
            from: 'default',
            category: 'IMR'
        });
        emailsSentCount++;
    }

    await logActivity('INFO', `Global evaluation reminders sent by ${adminName}`, { emailsSent: emailsSentCount });
    return { success: true, sentCount: emailsSentCount };

  } catch (error: any) {
    console.error("Error sending global evaluation reminders:", error);
    return { success: false, sentCount: 0, error: "Failed to send reminders." };
  }
}

export async function notifyForRecruitmentApproval(jobTitle: string, postedBy: string): Promise<{ success: boolean; error?: string }> {
  try {
    const usersRef = adminDb.collection("users");
    const q = usersRef.where("allowedModules", "array-contains", "recruitment-approvals");

    const querySnapshot = await q.get();
    if (querySnapshot.empty) return { success: true };

    const batch = adminDb.batch();
    const emailPromises = [];

    for (const doc of querySnapshot.docs) {
      const user = doc.data() as User;
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: user.uid,
        title: `New Job Posting: "${jobTitle}" by ${postedBy} is awaiting approval.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        projectId: '/dashboard/recruitment-approvals',
      });

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
        emailPromises.push(sendEmailUtility({ to: user.email, subject: `Action Required: New Job Posting for Approval`, html: emailHtml, from: "default", category: 'IMR' }));
      }
    }

    await batch.commit();
    await Promise.all(emailPromises);
    await logActivity("INFO", `Notified ${querySnapshot.size} admins for recruitment approval`, { jobTitle, postedBy });
    return { success: true };
  } catch (error: any) {
    console.error("Error notifying for recruitment approval:", error);
    return { success: false, error: error.message };
  }
}
