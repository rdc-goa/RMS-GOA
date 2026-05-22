'use server';

import { adminDb, adminStorage } from "@/lib/admin"
import { firestore } from "firebase-admin"
import { Project, CoPiDetails, User, EmrInterest } from "@/types"
import admin from "firebase-admin"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { isToday } from "date-fns"
import { logEvent } from "@/lib/logger"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logActivity, EMAIL_STYLES } from "./utils"
import { checkAuth } from "@/lib/check-auth"

export async function deleteImrProject(
  projectId: string,
  reason: string,
  deletedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required." };

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
        category: 'IMR',
      })
    }

    await logActivity("INFO", "IMR project deleted", { projectId, title: project.title, deletedBy, reason });
    await logEvent('AUDIT', 'IMR project deleted by admin', {
      metadata: { projectId, title: project.title, reason },
      user: { uid: deletedBy, email: '', role: 'admin' },
      status: 'warning'
    });
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting IMR project:", error)
    await logActivity("ERROR", "Failed to delete IMR project", {
      projectId,
      error: error.message
    })
    return { success: false, error: error.message || "Failed to delete project." }
  }
}

export async function saveProjectSubmission(
  projectId: string,
  projectData: Omit<Project, "id">,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Unauthorized." };

    const projectRef = adminDb.collection("projects").doc(projectId)

    const dataToSave = { ...projectData };
    if (projectData.status === "Submitted" && !projectData.submissionDate) {
      dataToSave.submissionDate = new Date().toISOString();
    }

    await projectRef.set(dataToSave, { merge: true })

    await logActivity("INFO", `Project ${projectData.status}`, { projectId, title: projectData.title })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving project submission:", error)
    await logActivity("ERROR", "Failed to save project submission", {
      projectId,
      title: projectData.title,
      error: error.message,
    })
    return { success: false, error: error.message || "Failed to save project." }
  }
}

export async function updateProjectStatus(projectId: string, newStatus: Project["status"], comments?: string) {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page. If the issue persists, log out and log back in." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required." };

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

    await GovernanceLogger.logEntityChange(
      projectId,
      'PROJECT',
      'SYSTEM_ADMIN',
      project,
      { ...project, ...updateData }
    );

    await logActivity("INFO", "Project status updated", { projectId, newStatus, piUid: project.pi_uid })
    await logEvent('WORKFLOW', 'Project status updated', {
      metadata: { projectId, newStatus, title: project.title, comments },
      user: { uid: project.pi_uid, email: project.pi_email || '', role: 'faculty' },
      status: newStatus.includes('Recommended') || newStatus === 'Sanctioned' ? 'success' : 'info'
    });

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
      const reasonTitle = newStatus === 'Revision Needed' ? "Comments for Revision:" : "Reason for Decision:";
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
      <p style="color:#e0e0e0;">
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
        category: 'IMR',
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating project status:", error)
    await logActivity("ERROR", "Failed to update project status", { projectId, newStatus, error: error.message })
    return { success: false, error: "Failed to update status." }
  }
}

export async function updateProjectWithRevision(
  projectId: string,
  revisedProposalUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Unauthorized." };

    if (!projectId || !revisedProposalUrl) {
      return { success: false, error: "Project ID and revised proposal URL are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)

    await projectRef.update({
      revisedProposalUrl: revisedProposalUrl,
      revisionSubmissionDate: new Date().toISOString(),
      status: "Revision Submitted",
    })

    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found after update." }
    }
    const project = projectSnap.data() as Project

    await logActivity("INFO", "Project revision submitted", { projectId, title: project.title, piUid: project.pi_uid })
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting project revision:", error)
    await logActivity("ERROR", "Failed to submit project revision", {
      projectId,
      error: error.message,
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
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required." };

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
    })
    return { success: false, error: "Failed to update project duration." }
  }
}

export async function updateProjectEvaluators(
  projectId: string,
  evaluatorUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required." };

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
    })
    return { success: false, error: "Failed to update project evaluators." }
  }
}

export async function markImrAttendance(
  meetingProjects: { projectId: string; piUid: string }[],
  absentPiUids: string[],
  absentEvaluatorUids: string[],
  meetingIdentifier?: { date: string; time: string; venue: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page. If the issue persists, log out and log back in." };
    if (!session.authorized) return { success: false, error: `Unauthorized: Your role '${session.role || 'unknown'}' does not have permission to mark attendance. Required: admin, Super-admin, or CRO.` };

    const batch = adminDb.batch();
    const projectsRef = adminDb.collection("projects");
    let allMeetingProjects = [...meetingProjects];

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

    for (const piUid of absentPiUids) {
      const absentProject = allMeetingProjects.find(p => p.piUid === piUid);
      if (absentProject) {
        const projectRef = projectsRef.doc(absentProject.projectId);
        batch.update(projectRef, {
          wasAbsent: true,
          status: "Submitted",
          meetingDetails: firestore.FieldValue.delete(),
        });
      }
    }

    if (absentEvaluatorUids.length > 0) {
      for (const project of presentProjects) {
        const projectRef = projectsRef.doc(project.projectId);
        batch.update(projectRef, {
          'meetingDetails.absentEvaluators': firestore.FieldValue.arrayUnion(...absentEvaluatorUids)
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
    });
    // Return the actual error message so the admin can see what went wrong
    return { success: false, error: error.message || "Failed to update attendance. Please try again." };
  }
}

export async function fetchEvaluatorProjectsForUser(
  evaluatorUid: string,
  piUid: string,
): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated || session.uid !== evaluatorUid) return { success: false, error: "Unauthorized." };

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

export async function updateCoInvestigators(
  projectId: string,
  coPiUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Unauthorized." };

    if (!projectId) return { success: false, error: "Project ID is required." }

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) return { success: false, error: "Project not found." }

    const project = projectSnap.data() as Project
    const existingCoPis = project.coPiUids || []
    const filteredCoPiUids = (coPiUids || []).filter((uid): uid is string => !!uid);

    let coPiDetails: CoPiDetails[] = [];
    let coPiEmails: string[] = [];
    let coPiNames: string[] = [];

    if (filteredCoPiUids.length > 0) {
      const usersSnapshot = await adminDb.collection("users").where(admin.firestore.FieldPath.documentId(), "in", filteredCoPiUids).get();
      const userMap = new Map<string, User>();
      usersSnapshot.forEach(doc => userMap.set(doc.id, { uid: doc.id, ...doc.data() } as User));

      for (const uid of filteredCoPiUids) {
        const u = userMap.get(uid);
        if (u) {
          coPiDetails.push({
            uid: u.uid,
            name: u.name,
            email: u.email,
            misId: u.misId,
            organization: u.institute || 'Parul University Goa',
            isExternal: false
          });
          coPiEmails.push(u.email.toLowerCase());
          coPiNames.push(u.name);
        }
      }
    }

    await projectRef.update({
      coPiUids: filteredCoPiUids,
      coPiDetails: coPiDetails,
      coPiEmails: coPiEmails,
      coPiNames: coPiNames
    })

    const newCoPis = filteredCoPiUids.filter((uid) => !existingCoPis.includes(uid))
    if (newCoPis.length > 0) {
      const batch = adminDb.batch()
      for (const uid of newCoPis) {
        const coPi = coPiDetails.find(d => d.uid === uid);
        if (!coPi) continue;

        batch.set(adminDb.collection("notifications").doc(), {
          uid: uid,
          projectId: projectId,
          title: `Added as Co-PI to: "${project.title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })

        if (coPi.email) {
          const emailHtml = `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${coPi.name},</p>
              <p style="color:#e0e0e0;">You have been added as a Co-PI to "${project.title}" by ${project.pi}.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectId}" style="background-color: #64B5F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Project</a>
              </div>
              ${EMAIL_STYLES.footer}
            </div>`

          await sendEmailUtility({
            to: coPi.email,
            subject: `Added to IMR Project`,
            html: emailHtml,
            from: "default",
            category: 'IMR'
          })
        }
      }
      await batch.commit()
    }

    await logActivity("INFO", "Co-investigators updated", { projectId, coPiCount: filteredCoPiUids.length })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to update Co-PIs." }
  }
}

export async function getEmrInterests(callId: string): Promise<EmrInterest[]> {
  try {
    const snapshot = await adminDb.collection("emrInterests").where("callId", "==", callId).get()
    const interests: EmrInterest[] = []
    snapshot.forEach((doc) => {
      interests.push({ ...doc.data() as EmrInterest, id: doc.id });
    })
    return interests
  } catch (error) {
    console.error("Error fetching EMR interests:", error)
    return []
  }
}

export async function adminUploadProposal(
  projectId: string,
  fileDataUrl: string,
  fileName: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin', 'cro'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required." };

    const { uploadFileToServer } = await import("./storage-service")
    const path = `projects/${projectId}/${fileName}`
    const uploadResult = await uploadFileToServer(fileDataUrl, path)

    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error }
    }

    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.update({
      proposalUrl: uploadResult.url,
      status: "Submitted",
      updatedAt: new Date().toISOString(),
    })

    await logActivity("INFO", "Admin uploaded project proposal", { projectId, fileName })
    return { success: true, url: uploadResult.url }
  } catch (error: any) {
    console.error("Error in adminUploadProposal:", error)
    return { success: false, error: error.message || "Failed to upload proposal." }
  }
}
