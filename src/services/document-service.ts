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

    // Fetch Co-PI details including designations and departments
    const coPiUsers = await Promise.all(
      (project.coPiDetails || []).map(async (copi) => {
        if (copi.uid) {
          const uSnap = await adminDb.collection("users").doc(copi.uid).get();
          if (uSnap.exists) {
            const userData = uSnap.data() as User;
            return {
              ...copi,
              designation: userData.designation || 'N/A',
              institute: userData.institute || 'N/A',
              department: userData.department || 'N/A'
            };
          }
        }
        return { ...copi, designation: 'N/A', institute: 'N/A', department: 'N/A' };
      })
    );

    const coPiData: { [key: string]: string } = {};
    for (let i = 0; i < 4; i++) {
      const coPi = coPiUsers[i] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };
      coPiData[`co-pi${i + 1}`] = coPi.name || "N/A";
      coPiData[`co-pi${i + 1}-designation`] = coPi.designation || "N/A";
      coPiData[`co-pi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`co_pi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`copi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`co-pi${i + 1}-institute`] = coPi.institute || "N/A";
      coPiData[`co-pi${i + 1}_institute`] = coPi.institute || "N/A";
      coPiData[`co_pi${i + 1}_institute`] = coPi.institute || "N/A";
      coPiData[`copi${i + 1}_institute`] = coPi.institute || "N/A";
    }

    const coPi1 = coPiUsers[0] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };

    // Get phase-wise budgets from project.phases or project.grant.phases
    const phases = project.phases || project.grant?.phases || [];
    let totalAmount = 0;
    const phaseData: { [key: string]: string } = {};
    for (let i = 0; i < 4; i++) {
      if (phases[i]) {
        phaseData[`phase${i + 1}_amount`] = phases[i].amount.toLocaleString('en-IN');
        totalAmount += phases[i].amount;
      } else {
        phaseData[`phase${i + 1}_amount`] = 'N/A';
      }
    }
    const finalTotalAmount = totalAmount > 0 
      ? totalAmount.toLocaleString('en-IN') 
      : (project.grant?.totalAmount ? project.grant.totalAmount.toLocaleString('en-IN') : 'N/A');

    const data = {
      pi_name: project.pi || 'N/A',
      pi_designation: piUser?.designation || 'N/A',
      pi_department: piUser?.department || project.departmentName || 'N/A',
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
      ...coPiData,
      copi_designation: coPi1.designation || 'N/A',
      copi_department: coPi1.department || 'N/A',
      ...phaseData,
      total_amount: finalTotalAmount,
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

    // Fetch Co-PI details including designations
    const coPiUsers = await Promise.all(
      (project.coPiDetails || []).map(async (copi) => {
        if (copi.uid) {
          const uSnap = await adminDb.collection("users").doc(copi.uid).get();
          if (uSnap.exists) {
            const userData = uSnap.data() as User;
            return {
              ...copi,
              designation: userData.designation || 'N/A',
              institute: userData.institute || 'N/A',
              department: userData.department || 'N/A'
            };
          }
        }
        return { ...copi, designation: 'N/A', institute: 'N/A', department: 'N/A' };
      })
    );

    const coPiData: { [key: string]: string } = {};
    for (let i = 0; i < 4; i++) {
      const coPi = coPiUsers[i] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };
      coPiData[`co-pi${i + 1}`] = coPi.name || "N/A";
      coPiData[`co-pi${i + 1}-designation`] = coPi.designation || "N/A";
      coPiData[`co-pi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`co_pi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`copi${i + 1}_designation`] = coPi.designation || "N/A";
      coPiData[`co-pi${i + 1}-institute`] = coPi.institute || "N/A";
      coPiData[`co-pi${i + 1}_institute`] = coPi.institute || "N/A";
      coPiData[`co_pi${i + 1}_institute`] = coPi.institute || "N/A";
      coPiData[`copi${i + 1}_institute`] = coPi.institute || "N/A";
    }

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

    // Fetch Co-PI details including designations
    const coPiUsers = await Promise.all(
      (project.coPiDetails || []).map(async (copi) => {
        if (copi.uid) {
          const uSnap = await adminDb.collection("users").doc(copi.uid).get();
          if (uSnap.exists) {
            const userData = uSnap.data() as User;
            return {
              ...copi,
              designation: userData.designation || 'N/A',
              institute: userData.institute || 'N/A',
              department: userData.department || 'N/A'
            };
          }
        }
        return { ...copi, designation: 'N/A', institute: 'N/A', department: 'N/A' };
      })
    );

    const coPi1 = coPiUsers[0] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };
    const coPi2 = coPiUsers[1] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };
    const coPi3 = coPiUsers[2] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };
    const coPi4 = coPiUsers[3] || { name: 'N/A', designation: 'N/A', institute: 'N/A', department: 'N/A' };

    const templateData = {
      Overall_sanction: project.grant?.sanctionNumber || 'N/A',
      date: format(new Date(), 'dd.MM.yyyy'),
      total_amount: project.grant?.totalAmount?.toLocaleString('en-IN') || 'N/A',
      Project_title: project.title,
      pi_name: project.pi,
      pi_institute: piUser?.institute || 'N/A',
      pi_designation: piUser?.designation || 'N/A',
      phase1_amount: project.grant?.phases?.[0]?.amount.toLocaleString('en-IN') || 'N/A',
      project_duration: duration,
      duration: duration,
      projectDuration: duration,

      // Singular / First Co-PI
      co_pi_name: coPi1.name || 'N/A',
      co_pi_designation: coPi1.designation || 'N/A',
      co_pi_institute: coPi1.institute || 'N/A',
      co_pi_dept: coPi1.department || 'N/A',
      copi_name: coPi1.name || 'N/A',
      copi_designation: coPi1.designation || 'N/A',
      copi_institute: coPi1.institute || 'N/A',

      // Numbered Co-PIs (hyphenated)
      'co-pi1': coPi1.name || 'N/A',
      'co-pi1-designation': coPi1.designation || 'N/A',
      'co-pi1-institute': coPi1.institute || 'N/A',
      'co-pi2': coPi2.name || 'N/A',
      'co-pi2-designation': coPi2.designation || 'N/A',
      'co-pi2-institute': coPi2.institute || 'N/A',
      'co-pi3': coPi3.name || 'N/A',
      'co-pi3-designation': coPi3.designation || 'N/A',
      'co-pi3-institute': coPi3.institute || 'N/A',
      'co-pi4': coPi4.name || 'N/A',
      'co-pi4-designation': coPi4.designation || 'N/A',
      'co-pi4-institute': coPi4.institute || 'N/A',

      // Numbered Co-PIs (underscored)
      co_pi1_name: coPi1.name || 'N/A',
      co_pi1_designation: coPi1.designation || 'N/A',
      co_pi1_institute: coPi1.institute || 'N/A',
      co_pi2_name: coPi2.name || 'N/A',
      co_pi2_designation: coPi2.designation || 'N/A',
      co_pi2_institute: coPi2.institute || 'N/A',
      co_pi3_name: coPi3.name || 'N/A',
      co_pi3_designation: coPi3.designation || 'N/A',
      co_pi3_institute: coPi3.institute || 'N/A',
      co_pi4_name: coPi4.name || 'N/A',
      co_pi4_designation: coPi4.designation || 'N/A',
      co_pi4_institute: coPi4.institute || 'N/A',

      // Numbered Co-PIs (copi1_name style)
      copi1_name: coPi1.name || 'N/A',
      copi1_designation: coPi1.designation || 'N/A',
      copi1_institute: coPi1.institute || 'N/A',
      copi2_name: coPi2.name || 'N/A',
      copi2_designation: coPi2.designation || 'N/A',
      copi2_institute: coPi2.institute || 'N/A',
      copi3_name: coPi3.name || 'N/A',
      copi3_designation: coPi3.designation || 'N/A',
      copi3_institute: coPi3.institute || 'N/A',
      copi4_name: coPi4.name || 'N/A',
      copi4_designation: coPi4.designation || 'N/A',
      copi4_institute: coPi4.institute || 'N/A',
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
    
    let templateKey: string = 'INCENTIVE_OFFICE_NOTING';
    if (claim.claimType === 'Research Papers') templateKey = 'OFFICE_NOTING_RESEARCH_PAPER';
    else if (claim.claimType === 'Patents') templateKey = 'OFFICE_NOTING_PATENT';
    else if (claim.claimType === 'Conference Presentations') templateKey = 'OFFICE_NOTING_CONFERENCE';
    else if (claim.claimType === 'Books') templateKey = 'OFFICE_NOTING_BOOK';
    else if (claim.claimType === 'Membership of Professional Bodies') templateKey = 'OFFICE_NOTING_MEMBERSHIP';
    else if (claim.claimType === 'Seed Money for APC') templateKey = 'OFFICE_NOTING_APC';
    else if (claim.claimType === 'EMR Sanction Project') templateKey = 'OFFICE_NOTING_EMR';
    else if (claim.claimType === 'Award') templateKey = 'OFFICE_NOTING_AWARD';
    else if (claim.claimType === 'Workshop/FDP/Training') templateKey = 'OFFICE_NOTING_WORKSHOP';

    const urls = (settings.templateUrls || {}) as Record<string, string | undefined>;
    let templateUrl = urls[templateKey];

    // If not explicitly configured, try a case-insensitive key search
    if (!templateUrl && settings.templateUrls) {
      const urls = settings.templateUrls as Record<string, string | undefined>;
      const foundKey = Object.keys(urls).find(k => k.toLowerCase() === (templateKey || '').toLowerCase());
      if (foundKey) templateUrl = urls[foundKey];

      // If still not found, try matching by claim type keywords (e.g. 'research', 'patent')
      if (!templateUrl && claim.claimType) {
        const claimWords = (claim.claimType || '').toLowerCase().split(/\s+/).filter(Boolean);
        const fuzzyKey = Object.keys(urls).find(k => claimWords.some(w => k.toLowerCase().includes(w)));
        if (fuzzyKey) templateUrl = urls[fuzzyKey];
      }
    }

    // Final fallback to the generic incentive office noting template
    if (!templateUrl) {
      templateUrl = settings.templateUrls?.INCENTIVE_OFFICE_NOTING;
    }

    // Normalize and validate
    if (!templateUrl || (typeof templateUrl === 'string' && templateUrl.trim() === '')) {
      console.error('Office noting template lookup failed. Available templateUrls:', settings.templateUrls);
      return { success: false, error: `Incentive Office Noting template URL not configured for ${claim.claimType || 'this category'}.` };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) throw new Error('Template not found.');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });

    const approval1 = claim.approvals?.find(a => a?.stage === 1);
    const approval2 = claim.approvals?.find(a => a?.stage === 2);
    const approval3 = claim.approvals?.find(a => a?.stage === 3);

    const checklistFields = [
      'designation',
      'publicationType',
      'journalName',
      'locale',
      'indexType',
      'journalClassification',
      'authorRoleAndPosition',
      'totalInternalAuthors',
      'printIssn',
      'publicationProofUrls',
      'isPuNameInPublication',
      'publicationMonth'
    ];

    const approvalData: { [key: string]: string } = {};
    checklistFields.forEach((field, index) => {
      const c_num = index + 1;
      approvalData[`a1_c${c_num}`] = approval1?.verifiedFields?.[field] ? '✓' : '';
      approvalData[`a2_c${c_num}`] = approval2?.verifiedFields?.[field] ? '✓' : '';
    });

    const data = {
      name: claim.userName || user?.name || 'N/A',
      designation: user?.designation || 'N/A',
      department: user?.department || 'N/A',
      institute: user?.institute || 'N/A',
      claim_type: claim.claimType || 'N/A',
      claim_id: claim.claimId || 'N/A',
      amount: claim.finalApprovedAmount?.toLocaleString('en-IN') || '0',
      date: format(new Date(), 'dd/MM/yyyy'),
      title: claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.apcPaperTitle || claim.conferencePaperTitle || 'N/A',
      typeofpublication: claim.publicationType || 'N/A',
      journal_name: claim.journalName || claim.apcJournalDetails || 'N/A',
      locale: claim.locale || claim.patentLocale || claim.conferenceType || 'N/A',
      indexed: claim.indexType?.toUpperCase() || (claim.apcIndexingStatus ? claim.apcIndexingStatus.map(s => (s === 'Others' || s === 'Other') && claim.apcOtherIndexingStatus ? `${s} (${claim.apcOtherIndexingStatus})` : s).join(', ') : 'N/A'),
      q_rating: claim.journalClassification || claim.apcQRating || 'N/A',
      author_position: claim.authorPosition || 'N/A',
      total_authors: (claim.authors || []).filter(a => !a.isExternal).length?.toString() || '0',
      print_issn: claim.printIssn || claim.apcIssnNo || 'N/A',
      e_issn: claim.electronicIssn || 'N/A',
      publish_month: claim.publicationMonth || 'N/A',
      publish_year: claim.publicationYear || 'N/A',
      role: claim.authorType || 'N/A',
      apc_student_names: claim.apcStudentNames || '',
      apc_student_count: claim.apcTotalStudentAuthors || 0,
      ...approvalData,
      approver1_comments: approval1?.comments || '',
      approver1_amount: approval1?.approvedAmount?.toLocaleString('en-IN') || '',
      approver2_comments: approval2?.comments || '',
      approver2_amount: approval2?.approvedAmount?.toLocaleString('en-IN') || '',
      approver3_comments: approval3?.needsSpecialIntervention ? (approval3?.specialInterventionRemarks || '') : (approval3?.comments || ''),
      approver3_amount: approval3 ? (
        approval3.needsSpecialIntervention
          ? (approval3.specialInterventionSuggestedAmount ?? 0)
          : (approval3.approvedAmount ?? 0)
      ).toLocaleString('en-IN') : '',
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
