'use server';

import { adminDb, adminStorage } from "@/lib/admin"
import type { Project, GrantPhase, GrantDetails, Transaction } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { logActivity, EMAIL_STYLES } from "./utils"
import { getSystemSettings } from "./system-service"
import { checkAuth } from "@/lib/check-auth"

export async function awardInitialGrant(
    projectId: string,
    grantData: { 
      sanctionNumber: string; 
      totalAmount: number; 
      phases: { name: string; amount: number;}[];
    },
    pi: { uid: string; name: string; email?: string; campus?: string },
    projectTitle: string
): Promise<{ success: boolean; error?: string, updatedProject?: Project }> {
    try {
        if (!grantData.phases || grantData.phases.length === 0) {
            return { success: false, error: "At least one grant phase must be defined." };
        }

        const projectRef = adminDb.collection('projects').doc(projectId);

        const newPhases: GrantPhase[] = grantData.phases.map((phase, index) => ({
            id: new Date().toISOString() + `-${index}`,
            name: phase.name,
            amount: phase.amount,
            status: "Pending Disbursement",
            transactions: [],
        }));

        const newGrant: GrantDetails = {
            totalAmount: grantData.totalAmount,
            sanctionNumber: grantData.sanctionNumber,
            status: "Awarded",
            phases: newPhases,
        };

        await projectRef.update({ grant: newGrant, status: 'In Progress', sanctionDate: new Date().toISOString() });

        const notification = {
            uid: pi.uid,
            title: `Congratulations! Your project "${projectTitle}" has been awarded a grant.`,
            projectId: projectId,
            createdAt: new Date().toISOString(),
            isRead: false,
        };
        await adminDb.collection('notifications').add(notification);

        if (pi.email) {
            const firstPhase = newPhases[0];
            const emailHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <h2 style="color: #ffffff;">Congratulations, ${pi.name}!</h2>
                    <p style="color:#e0e0e0;">We are pleased to inform you that your Intramural Research (IMR) project, <strong>"${projectTitle}"</strong>, has been sanctioned and a grant has been awarded.</p>
                    <h3 style="color:#ffffff;">Grant Details:</h3>
                    <ul style="color:#e0e0e0; list-style-type: none; padding-left: 0;">
                        <li><strong>Project Sanction Number:</strong> ${newGrant.sanctionNumber}</li>
                        <li><strong>Total Sanctioned Amount:</strong> ₹${newGrant.totalAmount.toLocaleString('en-IN')}</li>
                        <li><strong>Phase 1 Amount:</strong> ₹${firstPhase.amount.toLocaleString('en-IN')}</li>
                    </ul>
                    <p style="color:#e0e0e0;">The first phase amount will be disbursed to your registered bank account shortly. You can now log your project expenses through the grant management section on the portal.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;

            let ccEmails = process.env.RDC_EMAIL;
            if (pi.campus === 'Goa') {
                ccEmails += ', rdc@goa.paruluniversity.ac.in';
            }

            await sendEmailUtility({
                to: pi.email,
                cc: ccEmails,
                subject: `Grant Awarded for Your IMR Project: ${projectTitle}`,
                html: emailHtml,
                from: 'default'
            });
        }
        
        await logActivity('INFO', 'Initial grant awarded', { projectId, sanctionNumber: grantData.sanctionNumber });
        
        const updatedProjectSnap = await projectRef.get();
        return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
    } catch (error: any) {
        console.error("Error awarding grant:", error);
        return { success: false, error: error.message };
    }
}

export async function addGrantPhase(
  projectId: string,
  phaseData: { installmentRefNumber: string; amount: number; },
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required to add phases." };

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) return { success: false, error: "Project not found." }

    const project = projectSnap.data() as Project
    if (!project.grant) return { success: false, error: "Project does not have grant details." }
    
    const nextPhaseNumber = (project.grant.phases?.length || 0) + 1;
    if (nextPhaseNumber > 5) return { success: false, error: "Maximum of 5 phases can be added." };
    const phaseName = `Phase ${nextPhaseNumber}`;

    const newPhase: GrantPhase = {
      id: new Date().toISOString(),
      name: phaseName,
      amount: phaseData.amount,
      installmentRefNumber: phaseData.installmentRefNumber,
      status: "Pending Disbursement",
      transactions: [],
    }

    const updatedPhases = [...(project.grant.phases || []), newPhase]
    const updatedGrant: GrantDetails = { ...project.grant, phases: updatedPhases }

    await projectRef.update({ grant: updatedGrant })
    await logActivity("INFO", "Grant phase added", { projectId, phaseName })

    await adminDb.collection("notifications").add({
      uid: project.pi_uid,
      projectId: projectId,
      title: `A new grant phase "${phaseName}" has been added to your project "${project.title}".`,
      createdAt: new Date().toISOString(),
      isRead: false,
    })

    if (project.pi_email) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${project.pi},</p>
                <p style="color:#e0e0e0;">A new grant phase has been sanctioned for your project, <strong>"${project.title}"</strong>.</p>
                <h3 style="color:#ffffff;">Phase Details:</h3>
                <ul style="color:#e0e0e0; list-style-type: none; padding-left: 0;">
                    <li><strong>Phase Name:</strong> ${newPhase.name}</li>
                    <li><strong>Installment Ref. No:</strong> ${newPhase.installmentRefNumber}</li>
                    <li><strong>Amount:</strong> ₹${newPhase.amount.toLocaleString('en-IN')}</li>
                </ul>
                <p style="color:#e0e0e0;">This amount will be disbursed to your account shortly.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        await sendEmailUtility({
            to: project.pi_email,
            subject: `New Grant Phase Sanctioned for: ${project.title}`,
            html: emailHtml,
            from: 'default'
        });
    }

    const updatedProjectSnap = await projectRef.get();
    return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addTransaction(
  projectId: string,
  phaseId: string,
  transactionData: {
    dateOfTransaction: string;
    amount: number;
    vendorName: string;
    isGstRegistered: boolean;
    gstNumber?: string;
    description?: string;
    invoiceUrl?: string;
    isDraft?: boolean;
  }
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };

    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) return { success: false, error: "Project not found." };
    const project = projectSnap.data() as Project;
    if (!project.grant) return { success: false, error: "No grant details." };

    const phaseIndex = project.grant.phases.findIndex((p) => p.id === phaseId);
    if (phaseIndex === -1) return { success: false, error: "Phase not found." };

    const newTransaction: Transaction = {
      id: new Date().toISOString() + Math.random(),
      phaseId: phaseId,
      dateOfTransaction: transactionData.dateOfTransaction,
      amount: transactionData.amount,
      vendorName: transactionData.vendorName,
      isGstRegistered: transactionData.isGstRegistered,
      gstNumber: transactionData.gstNumber,
      description: transactionData.description || "",
      invoiceUrl: transactionData.invoiceUrl || undefined,
      isDraft: transactionData.isDraft ?? false,
    };

    const updatedPhases = [...project.grant.phases];
    updatedPhases[phaseIndex] = {
      ...updatedPhases[phaseIndex],
      transactions: [...(updatedPhases[phaseIndex].transactions || []), newTransaction],
    };

    await projectRef.update({ 'grant.phases': updatedPhases });
    await logActivity("INFO", "Grant transaction added", { projectId, phaseId });
    
    const updatedProjectSnap = await projectRef.get();
    return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteTransaction(
    projectId: string, 
    phaseId: string, 
    transactionId: string
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
    try {
        const session = await checkAuth();
        if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };

        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (!projectSnap.exists) return { success: false, error: "Project not found." };

        const project = projectSnap.data() as Project;
        if (!project.grant || !project.grant.phases) return { success: false, error: "No grant." };

        let transactionToDelete: Transaction | undefined;
        const updatedPhases = project.grant.phases.map(phase => {
            if (phase.id === phaseId) {
                if (phase.status === 'Utilization Submitted' || phase.status === 'Completed') {
                    throw new Error("Phase is locked.");
                }
                const newTransactions = phase.transactions?.filter(t => {
                    if (t.id === transactionId) {
                        transactionToDelete = t;
                        return false;
                    }
                    return true;
                });
                return { ...phase, transactions: newTransactions };
            }
            return phase;
        });

        if (!transactionToDelete) return { success: false, error: "Not found." };

        await projectRef.update({ 'grant.phases': updatedPhases });
        
        if (transactionToDelete.invoiceUrl) {
            try {
                const bucket = adminStorage.bucket();
                const url = new URL(transactionToDelete.invoiceUrl);
                const filePath = decodeURIComponent(url.pathname.substring(url.pathname.indexOf('/o/') + 3));
                await bucket.file(filePath).delete();
            } catch (storageError) {
                console.warn("Storage delete failed", storageError);
            }
        }

        await logActivity('INFO', 'Grant transaction deleted', { projectId, phaseId });
        const updatedProjectSnap = await projectRef.get();
        return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateTransaction(
  projectId: string,
  phaseId: string,
  transactionId: string,
  transactionData: {
    dateOfTransaction: string;
    amount: number;
    vendorName: string;
    isGstRegistered: boolean;
    gstNumber?: string;
    description?: string;
    invoiceUrl?: string;
    isDraft?: boolean;
  }
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };

    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return { success: false, error: "Not found." };

    const project = projectSnap.data() as Project;
    if (!project.grant) return { success: false, error: "No grant." };

    const phaseIndex = project.grant.phases.findIndex((p) => p.id === phaseId);
    if (phaseIndex === -1) return { success: false, error: "Phase not found." };

    const phase = project.grant.phases[phaseIndex];
    if (phase.status === 'Utilization Submitted' || phase.status === 'Completed') throw new Error("Locked.");
    
    const transactionIndex = phase.transactions?.findIndex((t) => t.id === transactionId);
    if (!phase.transactions || transactionIndex === undefined || transactionIndex === -1) return { success: false, error: "Transaction not found." };
    const transactions = phase.transactions;

    const updatedTransaction = {
      ...transactions[transactionIndex],
      ...transactionData,
      isDraft: transactionData.isDraft ?? transactions[transactionIndex].isDraft
    };

    const updatedPhases = [...project.grant.phases];
    const updatedTransactions = [...transactions];
    updatedTransactions[transactionIndex] = updatedTransaction;
    updatedPhases[phaseIndex] = { ...phase, transactions: updatedTransactions };

    await projectRef.update({ 'grant.phases': updatedPhases });
    await logActivity("INFO", "Grant transaction updated", { projectId, phaseId });
    const updatedProjectSnap = await projectRef.get();
    return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePhaseStatus(
  projectId: string,
  phaseId: string,
  newStatus: GrantPhase["status"],
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin'] });
    if (!session.authenticated) return { success: false, error: "Session expired. Please refresh the page and try again." };
    if (!session.authorized) return { success: false, error: "Unauthorized. Admin access required to update phase status." };

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) return { success: false, error: "Not found." }

    const project = projectSnap.data() as Project
    if (!project.grant) return { success: false, error: "No grant." }

    const phaseIndex = project.grant.phases.findIndex((p) => p.id === phaseId)
    if (phaseIndex === -1) return { success: false, error: "Phase not found." }

    const updatedPhases = project.grant.phases.map((phase) => {
      if (phase.id === phaseId) {
        const updatedPhase: GrantPhase = { ...phase, status: newStatus }
        if (newStatus === "Disbursed" && !phase.disbursementDate) updatedPhase.disbursementDate = new Date().toISOString()
        if (newStatus === "Utilization Submitted") updatedPhase.utilizationSubmissionDate = new Date().toISOString()
        return updatedPhase
      }
      return phase
    })

    const updateData: any = { 'grant.phases': updatedPhases };
    if (newStatus === "Disbursed" && phaseIndex === 0 && !project.seedMoneyReceivedDate) updateData.seedMoneyReceivedDate = new Date().toISOString()
    
    await projectRef.update(updateData);
    await logActivity("INFO", "Grant phase status updated", { projectId, phaseId, newStatus })

    await adminDb.collection("notifications").add({
      uid: project.pi_uid,
      projectId: projectId,
      title: `Grant phase "${updatedPhases[phaseIndex].name}" was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    })

    if (newStatus === "Utilization Submitted") {
      const settings = await getSystemSettings();
      const adminRoles = ["Super-admin", "admin"];
      const adminUsersSnapshot = await adminDb.collection("users").where("role", "in", adminRoles).get();

      const batch = adminDb.batch()
      adminUsersSnapshot.forEach((userDoc) => {
        batch.set(adminDb.collection("notifications").doc(), {
          uid: userDoc.id,
          projectId,
          title: `${project.pi} submitted utilization for "${project.title}".`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })
      });
      await batch.commit();

      if (settings.utilizationNotificationEmail) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear Administrator,</p>
                <p style="color:#e0e0e0;">Utilization report submitted for ${project.title}.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        await sendEmailUtility({
            to: settings.utilizationNotificationEmail,
            subject: `Utilization Submitted: ${project.title}`,
            html: emailHtml,
            from: 'default'
        });
      }
    }

    const updatedProjectSnap = await projectRef.get();
    return { success: true, updatedProject: { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
