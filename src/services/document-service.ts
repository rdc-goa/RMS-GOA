'use server';

import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation, IncentiveClaim } from '@/types';
import { getIncentiveClaimByIdCombined } from '@/lib/incentive-data-admin';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getSystemSettings } from './system-service';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { logActivity } from './utils';
import { checkAuth } from '@/lib/check-auth';

export async function generateRecommendationForm(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin'] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!session.authorized) return { success: false, error: "Unauthorized." };

    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;

    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return { success: false, error: 'Project not found.' };
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    const piUserRef = adminDb.collection('users').doc(project.pi_uid);
    const piUserSnap = await piUserRef.get();
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null;

    const evaluationsRef = projectRef.collection('evaluations');
    const evaluationsSnap = await evaluationsRef.get();
    const evaluations = evaluationsSnap.docs.map(doc => doc.data() as Evaluation);

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_RECOMMENDATION;
    if (!templateUrl) return { success: false, error: 'Template URL not configured.' };

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) return { success: false, error: 'Template not found.' };

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const recommendationText = evaluations.map(e => `${e.evaluatorName} (${e.recommendation}): ${e.comments}`).join('\n\n');

    let duration = project.projectDuration || 'N/A';
    if (project.projectStartDate && project.projectEndDate) {
      try {
        const start = parseISO(project.projectStartDate);
        const end = parseISO(project.projectEndDate);
        const days = differenceInDays(end, start);
        const years = Math.round(days / 365.25);
        duration = `${years} Year${years !== 1 ? 's' : ''}`;
      } catch (e) {}
    }

    const data = {
      pi_name: project.pi || 'N/A',
      pi_designation: piUser?.designation || 'N/A',
      pi_institute: piUser?.institute || project.institute || 'N/A',
      pi_phone: project.pi_phoneNumber || piUser?.phoneNumber || "N/A",
      pi_email: project.pi_email || "N/A",
      project_title: project.title || 'N/A',
      project_duration: duration,
      faculty: piUser?.faculty || project.faculty || 'N/A',
      institute: piUser?.institute || project.institute || 'N/A',
      grant_amount: project.grant?.totalAmount.toLocaleString('en-IN') || 'N/A',
      evaluator_comments: recommendationText || 'No evaluations submitted yet.',
      presentation_date: project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), 'dd-MM-yyyy') : 'N/A',
      presentation_time: project.meetingDetails?.time || 'N/A',
    };

    doc.setData(data);
    doc.render();

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    return { success: true, fileData: buf.toString('base64') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function generateOfficeNotingForm(
  projectId: string,
  formData: { projectDuration: string; phases: { name: string; amount: number }[] }
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) return { success: false, error: "Project not found." }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project

    const piUserRef = adminDb.collection("users").doc(project.pi_uid)
    const piUserSnap = await piUserRef.get()
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_OFFICE_NOTING;
    if (!templateUrl) return { success: false, error: 'IMR Office Noting template URL not configured.' };

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) return { success: false, error: "Template not found." };

    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

    const coPiData: { [key: string]: string } = {};
    const coPiNames = project.coPiDetails?.map((c) => c.name) || []
    for (let i = 0; i < 4; i++) coPiData[`co-pi${i + 1}`] = coPiNames[i] || "N/A"

    let totalAmount = 0
    const phaseData: { [key: string]: string } = {};
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
      project_title: project.title || "N/A",
      project_duration: formData.projectDuration || "N/A",
      ...phaseData,
      total_amount: totalAmount.toLocaleString("en-IN"),
      presentation_date: project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), "dd/MM/yyyy") : "N/A",
      presentation_time: project.meetingDetails?.time || "N/A",
      date: format(new Date(), 'dd/MM/yyyy'),
    }

    doc.setData(data)
    doc.render()

    const buf = doc.getZip().generate({ type: "nodebuffer" })
    const base64 = buf.toString("base64")

    if (project.status === "Recommended") {
      await projectRef.update({ projectDuration: formData.projectDuration, phases: formData.phases })
    }

    return { success: true, fileData: base64 }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function generateSanctionOrder(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;

    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return { success: false, error: "Project not found." };
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    const piUserRef = adminDb.collection("users").doc(project.pi_uid);
    const piUserSnap = await piUserRef.get();
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null;

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_SANCTION_ORDER;
    if (!templateUrl) return { success: false, error: "Template URL not configured." };

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) return { success: false, error: "Template not found." };

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const templateData = {
      Overall_sanction: project.grant?.sanctionNumber || 'N/A',
      date: format(new Date(), 'dd.MM.yyyy'),
      total_amount: project.grant?.totalAmount?.toLocaleString('en-IN') || 'N/A',
      Project_title: project.title,
      pi_name: project.pi,
      pi_institute: piUser?.institute || 'N/A',
      pi_designation: piUser?.designation || 'N/A',
      phase1_amount: project.grant?.phases?.[0]?.amount.toLocaleString('en-IN') || 'N/A',
    };

    doc.setData(templateData);
    doc.render();

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    return { success: true, fileData: buf.toString('base64') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function generateInstallmentOfficeNoting(
  projectId: string,
  phaseData: { installmentRefNumber: string; amount: number; }
) {
  try {
    const session = await checkAuth({ role: ['admin', 'super-admin'] });
    if (!session.authenticated) return { success: false, error: "Session expired." };
    if (!session.authorized) return { success: false, error: "Unauthorized." };

    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;

    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return { success: false, error: "Project not found." };
    const project = projectSnap.data() as Project;

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_INSTALLMENT_NOTING;
    if (!templateUrl) return { success: false, error: 'Template URL not configured.' };

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) throw new Error('Template not found.');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const phases = project.grant?.phases || [];
    const nextPhaseIndex = phases.findIndex(p => p.amount === phaseData.amount && (p.status === 'Pending Disbursement' || !p.status));
    const previousPhase = nextPhaseIndex > 0 ? phases[nextPhaseIndex - 1] : phases[0];

    const data = {
      Instalment_Reference: phaseData.installmentRefNumber || 'N/A',
      date: format(new Date(), 'dd/MM/yyyy'),
      PI_name: project.pi || 'N/A',
      sanction_reference: project.grant?.sanctionNumber || 'N/A',
      total_sanction: project.grant?.totalAmount?.toLocaleString('en-IN') || 'N/A',
      previous_phase_amount: previousPhase?.amount?.toLocaleString('en-IN') || 'N/A',
      next_phase_amount: phaseData.amount?.toLocaleString('en-IN') || 'N/A',
    };

    doc.render(data);
    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    return { success: true, fileData: buf.toString('base64') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function generateOfficeNotingForClaim(claimId: string): Promise<{ success: boolean; fileData?: string; fileName?: string; error?: string }> {
  try {
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;

    const claim = await getIncentiveClaimByIdCombined(claimId);
    if (!claim) return { success: false, error: "Claim not found." };

    const userSnap = await adminDb.collection('users').doc(claim.uid).get();
    const user = userSnap.exists ? (userSnap.data() as User) : null;

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.INCENTIVE_OFFICE_NOTING;
    if (!templateUrl) return { success: false, error: 'Incentive Office Noting template URL not configured.' };

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) throw new Error('Template not found.');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const data = {
      name: claim.userName || user?.name || 'N/A',
      designation: user?.designation || 'N/A',
      department: user?.department || 'N/A',
      institute: user?.institute || 'N/A',
      claim_type: claim.claimType || 'N/A',
      claim_id: claim.claimId || 'N/A',
      amount: claim.finalApprovedAmount?.toLocaleString('en-IN') || '0',
      date: format(new Date(), 'dd/MM/yyyy'),
      title: claim.paperTitle || claim.publicationTitle || claim.patentTitle || 'N/A',
    };

    doc.render(data);
    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    return { success: true, fileData: buf.toString('base64') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function generateOfficeNotingsZip(claimIds: string[]): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const claimId of claimIds) {
      const result = await generateOfficeNotingForClaim(claimId);
      if (result.success && result.fileData) {
        // We'll need the claim ID or something unique for the filename
        const claim = await getIncentiveClaimByIdCombined(claimId);
        if (!claim) continue;
        const fileName = `${claim.claimId?.replace(/\//g, '_') || claimId}.docx`;
        zip.file(fileName, Buffer.from(result.fileData, 'base64'));
      }
    }

    const content = await zip.generateAsync({ type: "nodebuffer" });
    return { success: true, fileData: content.toString('base64') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
