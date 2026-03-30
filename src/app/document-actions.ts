
'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation, IncentiveClaim, SystemSettings, ApprovalStage } from '@/types';
import { FieldValue } from 'firebase-admin/firestore';
import { format, parseISO, differenceInDays } from 'date-fns';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { getSystemSettings } from '@/app/actions';
import { generateBookIncentiveForm } from '@/app/incentive-actions';
import { generateMembershipIncentiveForm } from '@/app/membership-actions';
import { generatePatentIncentiveForm } from '@/app/patent-actions';
import { generateConferenceIncentiveForm } from '@/app/conference-actions';
import { generateResearchPaperIncentiveForm } from '@/app/research-paper-actions';
import { isEligibleForFinancialDisbursement } from '@/lib/incentive-eligibility';


async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.");
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    await adminDb.collection('logs').add(logEntry);
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error);
    console.error("Original Log Entry:", { level, message, context });
  }
}

function getInstituteAcronym(name?: string): string {
    if (!name) return '';

    const acronymMap: { [key: string]: string } = {
        'Parul Institute of Ayurved and Research': 'PIAR (Ayu.)',
        'Parul Institute of Architecture & Research': 'PIAR (Arc.)',
        'Parul Institute of Ayurved': 'PIA (Ayu.)',
        'Parul Institute of Arts': 'PIA (Art.)',
        'Parul Institute of Pharmacy': 'PIP (Pharma)',
        'Parul Institute of Physiotherapy': 'PIP (Physio)',
    };

    if (acronymMap[name]) {
        return acronymMap[name];
    }

    const ignoreWords = ['of', 'and', '&', 'the', 'in'];
    return name
        .split(' ')
        .filter(word => !ignoreWords.includes(word.toLowerCase()))
        .map(word => word.charAt(0))
        .join('')
        .toUpperCase();
      if (!isEligibleForFinancialDisbursement(claim)) {
        console.warn(`Skipping office noting for non-disbursement-eligible claim: ${claimId}`);
        return null;
      }
}


export async function generateRecommendationForm(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return { success: false, error: 'Project not found.' };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    
    const piUserRef = adminDb.collection('users').doc(project.pi_uid);
    const piUserSnap = await piUserRef.get();
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null;

    let coPi1User: User | null = null;
    if (project.coPiDetails && project.coPiDetails.length > 0 && project.coPiDetails[0].uid) {
        const coPi1UserRef = adminDb.collection('users').doc(project.coPiDetails[0].uid!);
        const coPi1UserSnap = await coPi1UserRef.get();
        if (coPi1UserSnap.exists) {
            coPi1User = coPi1UserSnap.data() as User;
        }
    }

    const evaluationsRef = projectRef.collection('evaluations');
    const evaluationsSnap = await evaluationsRef.get();
    const evaluations = evaluationsSnap.docs.map(doc => doc.data() as Evaluation);
    
    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_RECOMMENDATION;

    if (!templateUrl) {
      return { success: false, error: 'IMR Recommendation template URL is not configured in system settings.' };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
      return { success: false, error: 'Recommendation form template not found on the server.' };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const recommendationText = evaluations.map(e => {
        return `${e.evaluatorName} (${e.recommendation}):\n${e.comments}`;
    }).join('\n\n');

    const coPiData: { [key: string]: string } = {};
    const coPiNames = project.coPiDetails?.map((c) => c.name) || [];
    for (let i = 0; i < 4; i++) {
      coPiData[`co-pi${i + 1}`] = coPiNames[i] || 'N/A';
    }

    const phaseData: { [key: string]: string } = {};
    let totalAmount = project.grant?.totalAmount || 0;
    const projectPhases = project.grant?.phases || project.phases || [];
    for (let i = 0; i < 4; i++) {
      if (projectPhases[i]) {
        phaseData[`phase${i + 1}_amount`] = projectPhases[i].amount.toLocaleString("en-IN");
      } else {
        phaseData[`phase${i + 1}_amount`] = "N/A";
      }
    }
    
    let duration = project.projectDuration || 'N/A';
    if (project.projectStartDate && project.projectEndDate) {
        try {
            const start = parseISO(project.projectStartDate);
            const end = parseISO(project.projectEndDate);
            const days = differenceInDays(end, start);
            const years = Math.round(days / 365.25);
            duration = `${years} Year${years !== 1 ? 's' : ''}`;
        } catch (e) {
            console.error("Error calculating duration:", e);
        }
    }


    const data = {
        pi_name: project.pi || 'N/A',
        pi_designation: piUser?.designation || 'N/A',
        pi_institute: piUser?.institute || project.institute || 'N/A',
        pi_phone: project.pi_phoneNumber || piUser?.phoneNumber || "N/A",
        pi_email: project.pi_email || "N/A",
        ...coPiData,
        copi_designation: coPi1User?.designation || 'N/A', 
        copi_department: coPi1User?.department || 'N/A',
        submission_date: project.submissionDate ? new Date(project.submissionDate).toLocaleDateString() : 'N/A',
        project_title: project.title || 'N/A',
        project_duration: duration,
        faculty: piUser?.faculty || project.faculty || 'N/A',
        institute: piUser?.institute || project.institute || 'N/A',
        grant_amount: project.grant?.totalAmount.toLocaleString('en-IN') || 'N/A',
        evaluator_comments: recommendationText || 'No evaluations submitted yet.',
        ...phaseData,
        total_amount: totalAmount.toLocaleString('en-IN'),
        presentation_date: project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), 'dd-MM-yyyy') : 'N/A',
        presentation_time: project.meetingDetails?.time || 'N/A',
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      if (error.properties?.errors) {
        console.error("Template errors:", JSON.stringify(error.properties.errors));
      }
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating recommendation form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}

async function generateSingleOfficeNoting(claimId: string): Promise<{ fileName: string, content: Buffer } | null> {
    try {
        const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
        const claimSnap = await claimRef.get();
        if (!claimSnap.exists) return null;

        const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
        
        let result: { success: boolean; fileData?: string; error?: string };

        switch (claim.claimType) {
            case 'Research Papers':
                result = await generateResearchPaperIncentiveForm(claimId);
                break;
            case 'Books':
                result = await generateBookIncentiveForm(claimId);
                break;
            case 'Membership of Professional Bodies':
                result = await generateMembershipIncentiveForm(claimId);
                break;
            case 'Patents':
                result = await generatePatentIncentiveForm(claimId);
                break;
            case 'Conference Presentations':
                result = await generateConferenceIncentiveForm(claimId);
                break;
            default:
                console.warn(`No specific office noting generator found for claim type: ${claim.claimType}. Claim ID: ${claimId}`);
                return null;
        }

        if (result.success && result.fileData) {
            const safeUserName = (claim.userName || 'user').replace(/[\/\?<>\\:\*\|":]/g, '_');
            const safeClaimId = (claim.claimId || claim.id.substring(0, 5)).replace(/[\/\?<>\\:\*\|":]/g, '-');
            const fileName = `Office_Noting_${safeUserName}_${safeClaimId}.docx`;
            return { fileName, content: Buffer.from(result.fileData, 'base64') };
        } else {
            console.error(`Failed to generate specific noting for claim ${claimId} of type ${claim.claimType}:`, result.error);
            return null;
        }
    } catch (error) {
        console.error(`Error generating noting for claim ${claimId}:`, error);
        return null;
    }
}


export async function generateOfficeNotingsZip(claimIds: string[]): Promise<{ success: boolean; fileData?: string; error?: string }> {
    try {
        const generationPromises = claimIds.map(claimId => generateSingleOfficeNoting(claimId));
        const results = await Promise.all(generationPromises);

        const successfulDocs = results.filter((result): result is { fileName: string; content: Buffer } => result !== null);

        if (successfulDocs.length === 0) {
            return { success: false, error: 'Could not generate any of the requested documents.' };
        }

        const zip = new JSZip();
        successfulDocs.forEach(doc => {
            zip.file(doc.fileName, doc.content);
        });

        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
        const base64 = zipContent.toString('base64');

        await logActivity('INFO', 'Generated office notings ZIP', { count: successfulDocs.length });
        return { success: true, fileData: base64 };

    } catch (error: any) {
        console.error('Error generating office notings ZIP:', error);
        await logActivity('ERROR', 'Failed to generate office notings ZIP', { error: error.message });
        return { success: false, error: error.message || 'Failed to generate ZIP file.' };
    }
}

export async function generateOfficeNotingForClaim(claimId: string): Promise<{ success: boolean; fileData?: string; fileName?: string; error?: string }> {
    try {
        const result = await generateSingleOfficeNoting(claimId);
        if (!result) {
            return { success: false, error: 'Failed to generate the document.' };
        }
        const base64 = result.content.toString('base64');
        return { success: true, fileData: base64, fileName: result.fileName };
    } catch (error: any) {
        console.error(`Error generating single noting for claim ${claimId}:`, error);
        await logActivity('ERROR', 'Failed to generate single office noting', { claimId, error: error.message });
        return { success: false, error: error.message || 'Failed to generate the form.' };
    }
}

// This parser is needed to handle both single `{}` and double `{{}}` braces in the same template.
const angularParser = (tag: string) => {
    // This will be used for tags like `{{name}}`
    if (tag.startsWith('{{') && tag.endsWith('}}')) {
        const innerTag = tag.substring(2, tag.length - 2);
        return {
            get: (scope: any) => scope[innerTag]
        };
    }
    
    // This is the default parser for tags like `{name}`
    return {
        get: (scope: any) => scope[tag]
    };
};


  export async function generateInstallmentOfficeNoting(
    projectId: string,
    phaseData: { installmentRefNumber: string; amount: number; }
  ) {
    try {
      const projectSnap = await adminDb.collection('projects').doc(projectId).get();
      if (!projectSnap.exists) return { success: false, error: "Project not found." };
      const project = projectSnap.data() as Project;

      const settings = await getSystemSettings();
      const templateUrl = settings.templateUrls?.IMR_INSTALLMENT_NOTING;

      if (!templateUrl) {
        return { success: false, error: 'IMR Installment Noting template URL is not configured in system settings.' };
      }

      const content = await getTemplateContentFromUrl(templateUrl);
      if (!content) {
          throw new Error('Template not found.');
      }

      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          parser: angularParser,
          nullGetter: () => "N/A",
      });

      const phases = project.grant?.phases || [];
      const nextPhaseIndex = phases.findIndex(p => p.amount === phaseData.amount && (p.status === 'Pending Disbursement' || !p.status));
      
      let previousPhase;
      let previousPhaseNumber = 0;
      if (nextPhaseIndex > 0) {
        previousPhase = phases[nextPhaseIndex - 1];
        previousPhaseNumber = nextPhaseIndex;
      } else {
        const lastSubmittedOrCompletedPhase = [...phases].reverse().find(p => p.status === 'Utilization Submitted' || p.status === 'Completed');
        if (lastSubmittedOrCompletedPhase) {
          previousPhase = lastSubmittedOrCompletedPhase;
          previousPhaseNumber = phases.indexOf(lastSubmittedOrCompletedPhase) + 1;
        } else {
          // Fallback to the first phase if nothing else is found.
          // This might not be perfect, but it prevents a crash.
          previousPhase = phases[0];
          previousPhaseNumber = 1;
        }
      }

      const data = {
        Instalment_Reference: phaseData.installmentRefNumber || 'N/A',
        date: format(new Date(), 'dd/MM/yyyy'),
        PI_name: project.pi || 'N/A',
        sanction_reference: project.grant?.sanctionNumber || 'N/A',
        date_sanction: project.grant?.phases?.[0]?.disbursementDate ? format(parseISO(project.grant.phases[0].disbursementDate), 'dd/MM/yyyy') : 'N/A',
        total_sanction: project.grant?.totalAmount?.toLocaleString('en-IN') || 'N/A',
        phase_number: (await import('number-to-words')).toWords(previousPhaseNumber),
        previous_phase_amount: previousPhase?.amount?.toLocaleString('en-IN') || 'N/A',
        previous_phase_award_date: previousPhase?.disbursementDate ? format(parseISO(previousPhase.disbursementDate), 'dd/MM/yyyy') : 'N/A',
        midterm_review_date: project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), 'dd/MM/yyyy') : 'N/A',
        next_phase_number: (await import('number-to-words')).toWords(previousPhaseNumber + 1),
        next_phase_amount: phaseData.amount?.toLocaleString('en-IN') || 'N/A',
      };

      doc.render(data);
      const buf = doc.getZip().generate({ type: 'nodebuffer' });
      return { success: true, fileData: buf.toString('base64') };

    } catch (error: any) {
      console.error("Error generating installment office noting:", error);
      if (error.properties?.errors) {
        console.error("Template errors:", JSON.stringify(error.properties.errors, null, 2));
      }
      return { success: false, error: error.message };
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

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_OFFICE_NOTING;

    if (!templateUrl) {
      return { success: false, error: 'IMR Office Noting template URL is not configured.' };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
        return { success: false, error: "Office Notings form template not found on the server." };
    }

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

export async function generateSanctionOrder(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    const piUserRef = adminDb.collection("users").doc(project.pi_uid);
    const piUserSnap = await piUserRef.get();
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null;
    
    const coPiUsers = new Map<string, User>();
    if (project.coPiUids && project.coPiUids.length > 0) {
        const coPiSnapshot = await adminDb.collection('users').where('__name__', 'in', project.coPiUids).get();
        coPiSnapshot.forEach(doc => coPiUsers.set(doc.id, doc.data() as User));
    }

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.IMR_SANCTION_ORDER;
    if (!templateUrl) {
      return { success: false, error: "IMR Sanction Order template URL is not configured." };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
      return { success: false, error: "Sanction order template could not be loaded." };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    
    let duration = project.projectDuration || 'N/A';
    if (project.projectStartDate && project.projectEndDate) {
        try {
            const start = parseISO(project.projectStartDate);
            const end = parseISO(project.projectEndDate);
            const days = differenceInDays(end, start);
            const years = Math.round(days / 365.25);
            duration = `${years} Year${years !== 1 ? 's' : ''}`;
        } catch (e) {
            console.error("Error calculating duration for sanction order:", e);
        }
    }

    const templateData: { [key: string]: any } = {
        Overall_sanction: project.grant?.sanctionNumber || 'N/A',
        date: format(new Date(), 'dd.MM.yyyy'),
        total_amount: project.grant?.totalAmount?.toLocaleString('en-IN') || 'N/A',
        Project_title: project.title,
        pi_name: project.pi,
        pi_institute: piUser?.institute || 'N/A',
        pi_designation: piUser?.designation || 'N/A',
        project_duration: duration,
        phase1_amount: project.grant?.phases?.[0]?.amount.toLocaleString('en-IN') || 'N/A',
    };

    for(let i=0; i<3; i++) {
        const coPiDetails = project.coPiDetails?.[i];
        const coPiUser = coPiDetails?.uid ? coPiUsers.get(coPiDetails.uid) : null;
        templateData[`copi${i+1}_name`] = coPiDetails?.name || '';
        templateData[`copi${i+1}_institute`] = coPiUser?.institute || '';
    }

    doc.setData(templateData);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      if (error.properties?.errors) {
        console.error("Template errors:", JSON.stringify(error.properties.errors));
      }
      return { success: false, error: 'Failed to render the sanction order template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating sanction order:', error);
    await logActivity('ERROR', 'Failed to generate sanction order', { projectId, error: error.message });
    return { success: false, error: error.message || 'Failed to generate the sanction order.' };
  }
}
