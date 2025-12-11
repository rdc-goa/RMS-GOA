
'use server';

import { adminDb } from '@/lib/admin';
import type { Project } from '@/types';
import { logActivity } from '@/app/server-actions'; // logActivity can stay in the main server-actions file

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
