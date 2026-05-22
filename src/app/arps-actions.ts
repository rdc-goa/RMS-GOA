"use server";

import { adminDb, adminRtdb } from '@/lib/admin';
import type { User, ArpsSubmission, ArpsSubmissionHistory } from '@/types';
import { parseISO } from 'date-fns';
import { GovernanceLogger } from '@/lib/governance-logger';
import { DEFAULT_POLICY_RULES } from '@/lib/arps-defaults';
import { getDefaultModulesForRole } from '@/lib/modules';
import { sendEmail } from '@/lib/email';

// DEFAULT_POLICY_RULES is provided by src/lib/arps-defaults (non-server module)

// --- Deep Merge Utility ---
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) {
    return source;
  }
  if (typeof source !== 'object' || source === null) {
    return target;
  }
  const output = { ...target };
  Object.keys(source).forEach(key => {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!(key in target)) {
        Object.assign(output, { [key]: source[key] });
      } else {
        output[key] = deepMerge(target[key], source[key]);
      }
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

export async function getPolicyRules() {
  try {
    const dbRef = adminRtdb.ref('/arpsPolicyRules');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
      const rtdbRules = snapshot.val();
      const mergedRules = deepMerge(DEFAULT_POLICY_RULES, rtdbRules);
      return { success: true, rules: mergedRules };
    } else {
      // Initialize with defaults if empty
      await dbRef.set(DEFAULT_POLICY_RULES);
      return { success: true, rules: DEFAULT_POLICY_RULES };
    }
  } catch (error: any) {
    console.error('Error fetching policy rules from RTDB:', error);
    return { success: true, rules: DEFAULT_POLICY_RULES }; // fallback to local defaults to avoid crashes
  }
}

export async function updatePolicyRules(rules: any) {
  try {
    const dbRef = adminRtdb.ref('/arpsPolicyRules');
    await dbRef.set(rules);
    return { success: true, message: 'Policy rules updated successfully.' };
  } catch (error: any) {
    console.error('Error updating policy rules in RTDB:', error);
    return { success: false, error: error.message || 'Failed to update policy rules.' };
  }
}

// --- Active Cycles Management ---
export async function getArpsEvaluationCycles() {
  try {
    const dbRef = adminRtdb.ref('/arpsEvaluationCycles');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
      return { success: true, cycles: snapshot.val() };
    } else {
      const currentYear = new Date().getFullYear();
      const defaultCycles = {
        [`${currentYear - 1}-${currentYear}`]: { status: 'active', finalized: false }
      };
      await dbRef.set(defaultCycles);
      return { success: true, cycles: defaultCycles };
    }
  } catch (error: any) {
    console.error('Error fetching ARPS cycles:', error);
    return { success: true, cycles: {} };
  }
}

export async function updateArpsEvaluationCycle(year: string, data: any) {
  try {
    const dbRef = adminRtdb.ref(`/arpsEvaluationCycles/${year}`);
    await dbRef.set(data);
    return { success: true, message: 'Evaluation cycle updated.' };
  } catch (error: any) {
    console.error('Error updating evaluation cycle:', error);
    return { success: false, error: error.message || 'Failed to update cycle.' };
  }
}

// --- Standalone ARPS Submissions Firestore CRUD Actions ---

export async function submitArpsSubmission(data: Partial<ArpsSubmission>) {
  try {
    const { uid, submissionType, academicYear } = data;
    if (!uid || !submissionType || !academicYear) {
      return { success: false, error: 'Missing mandatory fields (uid, submissionType, academicYear)' };
    }

    // Check if the deadline has passed
    const cycleRef = adminRtdb.ref(`/arpsEvaluationCycles/${academicYear}`);
    const cycleSnap = await cycleRef.get();
    if (cycleSnap.exists()) {
      const cycleData = cycleSnap.val();
      if (cycleData.finalDate && new Date() > new Date(cycleData.finalDate)) {
        return { success: false, error: 'The submission window for this academic year has closed.' };
      }
    }

    // Fetch all for academic year to handle duplicates and counting
    const submissionsSnap = await adminRtdb.ref('arpsSubmissions')
      .orderByChild('academicYear')
      .equalTo(academicYear)
      .get();
    
    let submissionsForYear: any[] = [];
    if (submissionsSnap.exists()) {
      submissionsSnap.forEach(child => {
        submissionsForYear.push({ id: child.key, ...child.val() });
      });
    }

    // Auto DOI / Patent number unique verification within arpsSubmissions for this academic year
    if (submissionType === 'publication' && data.doi) {
      const normalizedDoi = data.doi.trim().toLowerCase();
      const activeDuplicates = submissionsForYear.filter(sub => 
        sub.submissionType === 'publication' && 
        sub.doi?.trim().toLowerCase() === normalizedDoi &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );
      if (activeDuplicates.length > 0) {
        return { success: false, error: `A publication with DOI "${data.doi}" has already been submitted for this academic year.` };
      }
    }

    if (submissionType === 'patent' && data.patentNumber) {
      const activeDuplicates = submissionsForYear.filter(sub => 
        sub.submissionType === 'patent' && 
        sub.patentNumber?.trim() === data.patentNumber.trim() &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );
      if (activeDuplicates.length > 0) {
        return { success: false, error: `A patent with number "${data.patentNumber}" has already been submitted for this academic year.` };
      }
    }

    // Generate Human-Readable ID sequence
    const typeSubmissions = submissionsForYear.filter(sub => sub.submissionType === submissionType);
    const sequenceNum = String(typeSubmissions.length + 1).padStart(4, '0');
    const typeAbbr = submissionType.substring(0, 3).toUpperCase();
    const submissionId = `RDC/ARPS/${academicYear}/${typeAbbr}/${sequenceNum}`;

    const newRef = adminRtdb.ref('arpsSubmissions').push();
    const id = newRef.key!;
    const history: ArpsSubmissionHistory[] = [{
      timestamp: new Date().toISOString(),
      user: data.userName || 'Faculty',
      action: 'Created submission as draft'
    }];

    const finalData: ArpsSubmission = {
      id,
      uid: data.uid!,
      userName: data.userName || 'N/A',
      userEmail: data.userEmail || 'N/A',
      faculty: data.faculty || 'N/A',
      submissionId,
      status: data.status || 'Draft',
      submissionDate: new Date().toISOString(),
      academicYear,
      submissionType,
      history,
      proofUrls: data.proofUrls || [],
      verifiedFields: {},
      ...data
    } as ArpsSubmission;

    await newRef.set(finalData);

    // In-app Notification creation helper
    await createNotification(uid, `Submission Saved`, `Your ARPS ${submissionType} submission "${submissionId}" has been saved as ${data.status}.`);

    return { success: true, id, submissionId };
  } catch (error: any) {
    console.error('Error submitting ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to submit.' };
  }
}

export async function updateArpsSubmission(id: string, data: Partial<ArpsSubmission>) {
  try {
    const docRef = adminRtdb.ref(`arpsSubmissions/${id}`);
    const snap = await docRef.get();
    if (!snap.exists()) {
      return { success: false, error: 'Submission not found' };
    }

    const currentData = snap.val() as ArpsSubmission;
    if (currentData.status === 'Locked' || currentData.status === 'Finalized' || currentData.status === 'Approved') {
      return { success: false, error: 'Submission is approved, locked or finalized and cannot be modified.' };
    }

    const academicYear = data.academicYear || currentData.academicYear;

    // Check if deadline has passed, block edits unless it's a requested revision
    const cycleRef = adminRtdb.ref(`/arpsEvaluationCycles/${academicYear}`);
    const cycleSnap = await cycleRef.get();
    if (cycleSnap.exists()) {
      const cycleData = cycleSnap.val();
      if (cycleData.finalDate && new Date() > new Date(cycleData.finalDate)) {
        if (currentData.status !== 'Resubmission Required' && currentData.status !== 'Returned for Correction') {
          return { success: false, error: 'The submission window is closed. Only applications requested for revision can be edited.' };
        }
      }
    }
    // Fetch all for academic year to handle duplicates
    let submissionsForYear: any[] = [];
    if (data.doi || data.patentNumber) {
        const submissionsSnap = await adminRtdb.ref('arpsSubmissions')
          .orderByChild('academicYear')
          .equalTo(academicYear)
          .get();
        if (submissionsSnap.exists()) {
          submissionsSnap.forEach(child => {
            if (child.key !== id) {
              submissionsForYear.push({ id: child.key, ...child.val() });
            }
          });
        }
    }

    if (currentData.submissionType === 'publication' && data.doi && data.doi !== currentData.doi) {
      const normalizedDoi = data.doi.trim().toLowerCase();
      const activeDuplicates = submissionsForYear.filter(sub => 
        sub.submissionType === 'publication' && 
        sub.doi?.trim().toLowerCase() === normalizedDoi &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );

      if (activeDuplicates.length > 0) {
        return { success: false, error: `A publication with DOI "${data.doi}" has already been submitted for this academic year.` };
      }
    }

    if (currentData.submissionType === 'patent' && data.patentNumber && data.patentNumber !== currentData.patentNumber) {
      const activeDuplicates = submissionsForYear.filter(sub => 
        sub.submissionType === 'patent' && 
        sub.patentNumber?.trim() === data.patentNumber.trim() &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );

      if (activeDuplicates.length > 0) {
        return { success: false, error: `A patent with number "${data.patentNumber}" has already been submitted for this academic year.` };
      }
    }

    const newHistory: ArpsSubmissionHistory = {
      timestamp: new Date().toISOString(),
      user: data.userName || currentData.userName,
      action: data.status === 'Submitted' ? 'Submitted for review' : 'Updated draft'
    };

    const history = [...(currentData.history || []), newHistory];

    await docRef.update({
      ...data,
      history,
      submissionDate: new Date().toISOString()
    });

    if (data.status === 'Submitted') {
      await createNotification(currentData.uid, 'Submission Submitted', `Your ARPS submission "${currentData.submissionId}" was successfully submitted for Review.`);
    }

    return { success: true, message: 'Submission updated successfully.' };
  } catch (error: any) {
    console.error('Error updating ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to update.' };
  }
}

export async function deleteArpsSubmission(id: string) {
  try {
    const docRef = adminRtdb.ref(`arpsSubmissions/${id}`);
    const snap = await docRef.get();
    if (!snap.exists()) {
      return { success: false, error: 'Submission not found' };
    }
    const currentData = snap.val() as ArpsSubmission;
    if (currentData.status !== 'Draft') {
      return { success: false, error: 'Only draft submissions can be deleted.' };
    }
    await docRef.remove();
    return { success: true, message: 'Submission deleted.' };
  } catch (error: any) {
    console.error('Error deleting ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to delete.' };
  }
}

export async function reviewArpsSubmission(
  id: string,
  status: 'Approved' | 'Rejected' | 'Resubmission Required',
  remarks: string,
  reviewerName: string,
  verifiedFields: Record<string, boolean> = {}
) {
  try {
    const docRef = adminRtdb.ref(`arpsSubmissions/${id}`);
    const snap = await docRef.get();
    if (!snap.exists()) {
      return { success: false, error: 'Submission not found' };
    }

    const currentData = snap.val() as ArpsSubmission;
    const historyEntry: ArpsSubmissionHistory = {
      timestamp: new Date().toISOString(),
      user: reviewerName,
      action: `Reviewed and set status to ${status}`,
      remarks
    };

    const history = [...(currentData.history || []), historyEntry];

    await docRef.update({
      status,
      remarks,
      verifiedFields,
      history
    });

    // In-app Notification
    await createNotification(
      currentData.uid,
      `ARPS Submission ${status}`,
      `Your ARPS submission "${currentData.submissionId}" has been marked as ${status}. Reviewer Remarks: "${remarks}"`
    );

    if (status === 'Resubmission Required' && currentData.userEmail) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <p>Dear ${currentData.userName},</p>
            <p>Your ARPS submission <strong>${currentData.submissionId}</strong> has been reviewed and requires revision.</p>
            <p><strong>Reviewer Remarks:</strong></p>
            <blockquote style="border-left: 4px solid #f59e0b; margin-left: 0; padding-left: 15px; color: #555; background-color: #fef3c7; padding: 10px; border-radius: 0 4px 4px 0;">
              ${remarks}
            </blockquote>
            <p>Please log in to the R&D Portal to make the necessary corrections and resubmit your application.</p>
            <br/>
            <p>Best Regards,</p>
            <p>RDC Team, Parul University Goa</p>
          </div>
        `;
        await sendEmail({
          to: currentData.userEmail,
          subject: `Action Required: ARPS Revision Requested (${currentData.submissionId})`,
          html: emailHtml,
          from: 'rdc'
        });
      } catch (err) {
        console.error("Failed to send revision email", err);
      }
    }

    return { success: true, message: `Submission reviewed successfully and set to ${status}.` };
  } catch (error: any) {
    console.error('Error reviewing ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to review.' };
  }
}

export async function getArpsSubmissions(filters?: {
  uid?: string;
  status?: string;
  submissionType?: string;
  academicYear?: string;
}) {
  try {
    const snap = await adminRtdb.ref('arpsSubmissions').get();
    let submissions: ArpsSubmission[] = [];
    if (snap.exists()) {
      snap.forEach(child => {
        submissions.push({ id: child.key, ...child.val() } as ArpsSubmission);
      });
    }

    if (filters) {
      if (filters.uid) submissions = submissions.filter(s => s.uid === filters.uid);
      if (filters.status) submissions = submissions.filter(s => s.status === filters.status);
      if (filters.submissionType) submissions = submissions.filter(s => s.submissionType === filters.submissionType);
      if (filters.academicYear) submissions = submissions.filter(s => s.academicYear === filters.academicYear);
    }
    
    // Sort by submissionDate desc
    submissions.sort((a, b) => {
        return new Date(b.submissionDate || 0).getTime() - new Date(a.submissionDate || 0).getTime();
    });

    return { success: true, submissions };
  } catch (error: any) {
    console.error('Error fetching submissions:', error);
    return { success: false, error: error.message || 'Failed to fetch.' };
  }
}

// --- Dynamic Score Calculation Engine ---

const round = (n: number) => Math.round(n * 100) / 100;

export async function calculateArpsForUser(userId: string, academicYearStr: string, superAdminCustomOverrides?: any) {
  try {

    // Load rules dynamically from RTDB
    const rulesResult = await getPolicyRules();
    const rules = rulesResult.rules;

    // Load active cycle details
    const cyclesResult = await getArpsEvaluationCycles();
    const cycle = cyclesResult.cycles[academicYearStr] || { status: 'active', finalized: false };

    // Fetch user details
    const userSnap = await adminDb.collection('users').doc(userId).get();
    const userData = userSnap.data() as User;
    if (!userData) {
      return { success: false, error: 'User details not found.' };
    }

    // Fetch ONLY APPROVED submissions for the academic year in the isolated database
    const submissionsSnap = await adminRtdb.ref('arpsSubmissions')
      .orderByChild('uid')
      .equalTo(userId)
      .get();

    let submissions: ArpsSubmission[] = [];
    if (submissionsSnap.exists()) {
      submissionsSnap.forEach(child => {
        const val = child.val();
        if (val.status === 'Approved' && val.academicYear === academicYearStr) {
          submissions.push({ id: child.key, ...val } as ArpsSubmission);
        }
      });
    }

    // A. Publication Component Scoring
    const publications = submissions.filter(s => s.submissionType === 'publication');
    let rawPubScore = 0;
    let pubCount = 0;
    const contributingPubs: any[] = [];

    for (const pub of publications) {
      pubCount++;
      let base = 0;
      let multiplier = 1.0;
      let authorMultiplier = 1.0;
      let detailsText = '';

      if (pub.publicationType === 'Journal') {
        const quart = (pub.journalClassification || 'Q4').toLowerCase();
        base = rules.publications[quart] || 10;

        if (pub.articleType === 'Original Research') {
          multiplier = rules.publications.originalResearchMultiplier;
        } else if (pub.articleType === 'Review') {
          multiplier = (quart === 'q1' || quart === 'q2')
            ? rules.publications.reviewQ1Q2Multiplier
            : rules.publications.reviewQ3Q4Multiplier;
        } else if (pub.articleType === 'Case Report' || pub.articleType === 'Short Survey') {
          multiplier = rules.publications.caseReportMultiplier;
        }

        const role = pub.authorPosition;
        if (role === 'Single Author') {
          authorMultiplier = rules.publications.singleAuthorMultiplier;
        } else if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author') {
          authorMultiplier = rules.publications.firstCorrespondingMultiplier;
        } else if (role === 'Co-Author') {
          const order = pub.authorOrder || 2;
          if (order <= 5) {
            authorMultiplier = rules.publications.coAuthorUpTo5Multiplier;
          } else {
            authorMultiplier = rules.publications.coAuthor6OnwardsMultiplier;
          }
          if (pub.isSinglePuAuthorWithExternal) {
            authorMultiplier = rules.publications.singlePuCoAuthorWithExternalMultiplier;
          }
        }
        detailsText = `Journal (${pub.journalClassification}, Role: ${pub.authorPosition})`;
      } else if (pub.publicationType === 'Book Chapter') {
        base = rules.publications.bookChapterBase;
        const role = pub.authorPosition;
        if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author' || role === 'Single Author') {
          authorMultiplier = rules.publications.firstCorrespondingMultiplier;
        } else {
          authorMultiplier = rules.publications.coAuthorUpTo5Multiplier;
        }
        detailsText = `Book Chapter`;
      } else if (pub.publicationType === 'Book Editor') {
        // Points divided among total number of editors
        base = rules.publications.bookEditorBase;
        const editors = pub.totalAuthors || 1;
        base = base / editors;
        authorMultiplier = 1.0;
        detailsText = `Book Editor (Divided by ${editors})`;
      } else if (pub.publicationType === 'Conference Proceedings') {
        base = rules.publications.conferenceProceedingsBase;
        const role = pub.authorPosition;
        if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author' || role === 'Single Author') {
          authorMultiplier = rules.publications.firstCorrespondingMultiplier;
        } else {
          authorMultiplier = rules.publications.coAuthorUpTo5Multiplier;
        }
        detailsText = `Conference Proceedings`;
      }

      const score = (base * multiplier) * authorMultiplier;
      rawPubScore += score;
      contributingPubs.push({
        id: pub.id,
        submissionId: pub.submissionId,
        title: pub.paperTitle || 'Untitled',
        type: pub.publicationType,
        details: detailsText,
        calculation: { base, multiplier, authorMultiplier },
        score: round(score)
      });
    }

    // B. Patents Scoring
    const patents = submissions.filter(s => s.submissionType === 'patent');
    let rawPatentScore = 0;
    const contributingPatents: any[] = [];

    for (const pat of patents) {
      let base = 0;
      if (pat.patentCategory === 'Published') {
        base = rules.patents.publishedBase;
      } else if (pat.patentCategory === 'Granted India') {
        base = rules.patents.grantedIndiaBase;
      } else if (pat.patentCategory === 'Granted International') {
        base = rules.patents.grantedInternationalBase;
      }

      let appMultiplier = 0.0;
      if (pat.isPuSoleApplicant) {
        appMultiplier = rules.patents.puSoleApplicantMultiplier;
      } else if (pat.isPuJointApplicant) {
        appMultiplier = rules.patents.coApplicantMultiplier;
      }

      const score = base * appMultiplier;
      rawPatentScore += score;
      contributingPatents.push({
        id: pat.id,
        submissionId: pat.submissionId,
        title: pat.patentTitle || 'Untitled Patent',
        category: pat.patentCategory,
        calculation: { base, appMultiplier },
        score: round(score)
      });
    }

    // C. Consultancy Scoring
    const consultancies = submissions.filter(s => s.submissionType === 'consultancy');
    let rawConsultancyScore = 0;
    const contributingConsultancy: any[] = [];

    for (const cons of consultancies) {
      const revenue = cons.revenueAmount || 0;
      let score = 0;

      // Calculate slab score
      const slabs = rules.consultancy.slabs;
      let matchedSlab = false;
      for (const slab of slabs) {
        if (revenue >= slab.min && revenue < slab.max) {
          score = slab.points;
          matchedSlab = true;
          break;
        }
      }

      if (!matchedSlab && revenue >= 500000) {
        // Base above 500k + extra slab points
        const basePoints = rules.consultancy.baseAbove500k;
        const extraRevenue = revenue - 500000;
        const extraSlabs = Math.floor(extraRevenue / rules.consultancy.extraSlabStep);
        score = basePoints + (extraSlabs * rules.consultancy.extraSlabPoints);
      }

      rawConsultancyScore += score;
      contributingConsultancy.push({
        id: cons.id,
        submissionId: cons.submissionId,
        title: cons.consultancyTitle || 'Untitled Consultancy',
        revenue,
        score: round(score)
      });
    }

    // D. EMR Scoring
    const emrSubmissions = submissions.filter(s => s.submissionType === 'EMR');
    let rawEmrScore = 0;
    const contributingEmr: any[] = [];

    for (const emr of emrSubmissions) {
      const amount = emr.sanctionAmount || 0;
      const isSanctioned = emr.projectStatus === 'Sanctioned';
      const role = emr.role || 'Team Member';
      let score = 0;

      const tiers = isSanctioned ? rules.emr.sanctioned : rules.emr.ongoing;

      for (const tier of tiers) {
        if (amount >= tier.min && amount < tier.max) {
          if (role === 'PI') {
            score = tier.pi;
          } else if (role === 'Co-PI') {
            score = tier.copi;
          }
          break;
        }
      }

      rawEmrScore += score;
      contributingEmr.push({
        id: emr.id,
        submissionId: emr.submissionId,
        title: emr.projectTitle || 'Untitled EMR',
        role,
        status: emr.projectStatus,
        amount,
        score: round(score)
      });
    }

    // E. Research Activities (Academic Activities + Students Guided)
    const activities = submissions.filter(s => s.submissionType === 'activity');
    const students = submissions.filter(s => s.submissionType === 'student');

    // Category raw score groupings for capping (10 pts cap per subcategory)
    const subcategoryRawScores: Record<string, number> = {
      conference_presentation: 0,
      convener: 0,
      coordinator: 0,
      expert_talk: 0,
      participation: 0,
      membership: 0,
      emr_team_member: 0,
      students_phd_completed: 0,
      students_phd_ongoing: 0,
      students_pg_completed: 0,
      students_pg_ongoing: 0
    };

    const activityDetails: any[] = [];

    // Score activities
    for (const act of activities) {
      let score = 0;
      let subcat = '';

      if (act.activityCategory === 'Conference presentation') {
        const isIndia = act.location === 'In PU' || act.location === 'Outside PU';
        const rate = isIndia ? rules.activities.conferencePresentationIndia : rules.activities.conferencePresentationOutsideIndia;
        score = (act.eventDurationDays || 1) * rate;
        subcat = 'conference_presentation';
      } else if (act.activityCategory === 'Convener') {
        score = rules.activities.convener;
        subcat = 'convener';
      } else if (act.activityCategory === 'Coordinator') {
        score = rules.activities.coordinator;
        subcat = 'coordinator';
      } else if (act.activityCategory === 'Expert talk') {
        const isPu = act.location === 'In PU';
        score = isPu ? rules.activities.expertTalkInPu : rules.activities.expertTalkOutsidePu;
        subcat = 'expert_talk';
      } else if (act.activityCategory === 'Participation') {
        const isPu = act.location === 'In PU';
        score = isPu ? rules.activities.participationInPu : rules.activities.participationOutsidePu;
        subcat = 'participation';
      } else if (act.activityCategory === 'Membership') {
        score = rules.activities.membership;
        subcat = 'membership';
      } else if (act.activityCategory === 'EMR team member') {
        score = rules.activities.emrTeamMember;
        subcat = 'emr_team_member';
      }

      if (subcat) {
        subcategoryRawScores[subcat] += score;
        activityDetails.push({
          id: act.id,
          submissionId: act.submissionId,
          type: 'activity',
          name: act.eventName || 'Academic Activity',
          category: act.activityCategory,
          subcat,
          rawScore: score
        });
      }
    }

    // Score students
    for (const stud of students) {
      let score = 0;
      let subcat = '';

      if (stud.program === 'PhD') {
        if (stud.studentStatus === 'Completed') {
          score = rules.activities.phdCompleted;
          subcat = 'students_phd_completed';
        } else {
          score = rules.activities.phdOngoing;
          subcat = 'students_phd_ongoing';
        }
      } else if (stud.program === 'PG Dissertation') {
        if (stud.studentStatus === 'Completed') {
          score = rules.activities.pgCompleted;
          subcat = 'students_pg_completed';
        } else {
          score = rules.activities.pgOngoing;
          subcat = 'students_pg_ongoing';
        }
      }

      if (subcat) {
        subcategoryRawScores[subcat] += score;
        activityDetails.push({
          id: stud.id,
          submissionId: stud.submissionId,
          type: 'student',
          name: stud.studentName || 'Student Guidance',
          category: stud.program,
          subcat,
          rawScore: score
        });
      }
    }

    // Apply caps per subcategory (10.0 points maximum cap per subcategory)
    let rawResearchActivitiesScore = 0;
    const cappedActivitySubtotals: Record<string, number> = {};
    const capMax = rules.activities.subcategoryCap || 10;

    Object.keys(subcategoryRawScores).forEach(key => {
      const val = subcategoryRawScores[key];
      const cappedVal = Math.min(val, capMax);
      cappedActivitySubtotals[key] = cappedVal;
      rawResearchActivitiesScore += cappedVal;
    });

    // --- Final Capping & Weightages Calculations ---
    const weightages = rules.weightage;
    const caps = rules.caps;

    let weightedPub = rawPubScore * weightages.publication;
    let weightedPatent = rawPatentScore * weightages.patent;
    let weightedConsultancy = rawConsultancyScore * weightages.consultancy;
    let weightedResearchActivities = rawResearchActivitiesScore * weightages.researchActivities;
    let weightedEmr = rawEmrScore * weightages.emr;

    let finalPubScore = Math.min(weightedPub, caps.publication);
    let finalPatentScore = Math.min(weightedPatent, caps.patent);
    let finalConsultancyScore = Math.min(weightedConsultancy, caps.consultancy);
    let finalResearchActivitiesScore = Math.min(weightedResearchActivities, caps.researchActivities);
    let finalEmrScore = Math.min(weightedEmr, caps.emr);

    let totalArps = round(finalPubScore + finalPatentScore + finalConsultancyScore + finalResearchActivitiesScore + finalEmrScore);

    // Fetch override if not explicitly provided
    let overrides = superAdminCustomOverrides;
    if (!overrides) {
      try {
        const overrideRef = adminRtdb.ref(`/arpsOverrides/${academicYearStr}/${userId}`);
        const overrideSnap = await overrideRef.get();
        if (overrideSnap.exists()) {
          overrides = overrideSnap.val();
        }
      } catch (err) {
        console.error('Error fetching ARPS override:', err);
      }
    }

    // Apply Super Admin Custom Override score if present
    if (overrides && typeof overrides.totalArps === 'number') {
      totalArps = overrides.totalArps;
    }

    // Determine Increment Category Grade
    // <30 DME, 30-50 ME, 50-80 EE, 80-100 SEE
    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE';
    else if (totalArps >= 50) grade = 'EE';
    else if (totalArps >= 30) grade = 'ME';

    // Increment Salary Calculation
    const incRules = rules.increments;
    let fixedAmount = incRules.fixedDME;
    if (grade === 'SEE') fixedAmount = incRules.fixedSEE;
    else if (grade === 'EE') fixedAmount = incRules.fixedEE;
    else if (grade === 'ME') fixedAmount = incRules.fixedME;

    const annualIncrement = round(fixedAmount + (totalArps * incRules.factor));

    const finalCalculatedData = {
      success: true,
      data: {
        academicYear: academicYearStr,
        publications: {
          raw: round(rawPubScore),
          weighted: round(weightedPub),
          final: round(finalPubScore),
          contributingClaims: contributingPubs.map(c => ({ claim: c, score: c.score, calculation: c.calculation }))
        },
        patents: {
          raw: round(rawPatentScore),
          weighted: round(weightedPatent),
          final: round(finalPatentScore),
          contributingClaims: contributingPatents.map(c => ({ claim: c, score: c.score, calculation: c.calculation }))
        },
        consultancy: {
          raw: round(rawConsultancyScore),
          weighted: round(weightedConsultancy),
          final: round(finalConsultancyScore),
          contributingClaims: contributingConsultancy.map(c => ({ claim: c, score: c.score, calculation: {} }))
        },
        researchActivities: {
          raw: round(rawResearchActivitiesScore),
          weighted: round(weightedResearchActivities),
          final: round(finalResearchActivitiesScore),
          contributingClaims: activityDetails.map(c => ({ claim: c, score: c.rawScore, calculation: {} })),
          subtotals: subcategoryRawScores,
          cappedSubtotals: cappedActivitySubtotals
        },
        emr: {
          raw: round(rawEmrScore),
          weighted: round(weightedEmr),
          final: round(finalEmrScore),
          contributingProjects: contributingEmr.map(c => ({ project: c, score: c.score, calculation: {} }))
        },
        totalArps,
        grade,
        increment: {
          fixedAmount,
          factor: incRules.factor,
          annualIncrement
        },
        cycleStatus: cycle.status,
        cycleFinalized: cycle.finalized,
        authorCounts: {
          firstCorrespondingAuthor: contributingPubs.filter(c => c.details.includes('First Author') || c.details.includes('Corresponding')).length,
          coAuthor: contributingPubs.filter(c => c.details.includes('Co-Author')).length
        }
      }
    };

    // Policy Traceability Logging
    await GovernanceLogger.logPolicyTrace({
      policyName: 'ARPS_ENTERPRISE_Isolated',
      entityId: userId,
      inputs: { userId, academicYear: academicYearStr },
      outputs: { totalArps, grade, annualIncrement },
      logicVersion: '3.0.0'
    });

    return finalCalculatedData;

  } catch (error: any) {
    console.error('Error calculating isolated ARPS:', error);
    return { success: false, error: 'Failed to calculate ARPS score.' };
  }
}

// Generate statistical report for Super Admin
export async function generateArpsStatisticsReport(academicYearStr: string) {
  try {

    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    const allUsers = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    })) as User[];

    // Filter eligible faculty users (faculty, CRO, Super-admin) who also have access to ARPS Submission
    const eligibleUsers = allUsers.filter(u => {
      const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin');
      if (!isEligibleRole) return false;
      const userModules = (u.allowedModules && Array.isArray(u.allowedModules)) ? u.allowedModules : getDefaultModulesForRole(u.role, u.designation);
      return Array.isArray(userModules) && userModules.includes('arps-submission');
    });

    const statistics = await Promise.all(
      eligibleUsers.map(async (user) => {
        try {
          const calc = await calculateArpsForUser(user.uid, academicYearStr);
          if (calc.success && calc.data) {
            const data = calc.data;
            return {
              uid: user.uid,
              name: user.name || 'N/A',
              misId: user.misId || 'N/A',
              department: user.department || 'N/A',
              totalArps: data.totalArps,
              grade: data.grade,
              annualIncrement: data.increment.annualIncrement,
              publicationsCount: data.publications.contributingClaims.length,
              patentsCount: data.patents.contributingClaims.length,
              emrCount: data.emr.contributingProjects.length,
              consultancyCount: data.consultancy.contributingClaims.length,
              activitiesCount: data.researchActivities.contributingClaims.length
            };
          }
        } catch (e) {
          console.error(`Error calculating stats for user ${user.uid}:`, e);
        }
        return {
          uid: user.uid,
          name: user.name || 'N/A',
          misId: user.misId || 'N/A',
          department: user.department || 'N/A',
          totalArps: 0,
          grade: 'DME',
          annualIncrement: 0,
          publicationsCount: 0,
          patentsCount: 0,
          emrCount: 0,
          consultancyCount: 0,
          activitiesCount: 0
        };
      })
    );

    // Sort by name
    statistics.sort((a, b) => a.name.localeCompare(b.name));

    const yearParts = academicYearStr.split('-');
    const startYear = parseInt(yearParts[0], 10);
    const endYear = startYear + 1;

    return {
      success: true,
      data: statistics,
      yearRange: {
        startDate: `01/06/${startYear}`,
        endDate: `31/05/${endYear}`
      }
    };
  } catch (error: any) {
    console.error('Error generating statistics report:', error);
    return { success: false, error: 'Failed to generate ARPS statistics report.' };
  }
}

// --- Internal Helper: Create In-app Notification ---
async function createNotification(uid: string, title: string, content: string) {
  try {
    const notifRef = adminDb.collection('notifications').doc();
    await notifRef.set({
      id: notifRef.id,
      uid,
      title,
      content,
      createdAt: new Date().toISOString(),
      isRead: false,
      type: 'default'
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// --- Super Admin Score Overrides ---
export async function saveArpsOverride(userId: string, academicYearStr: string, totalArps: number) {
  try {
    const overrideRef = adminRtdb.ref(`/arpsOverrides/${academicYearStr}/${userId}`);
    await overrideRef.set({ totalArps, updatedAt: new Date().toISOString() });

    // In-app Notification for override update
    await createNotification(
      userId,
      `ARPS Score Override Applied`,
      `A Super Admin has updated your final ARPS score for cycle ${academicYearStr} to ${totalArps}.`
    );

    return { success: true, message: 'ARPS score override saved successfully.' };
  } catch (error: any) {
    console.error('Error saving ARPS override:', error);
    return { success: false, error: error.message || 'Failed to save score override.' };
  }
}

export async function deleteArpsOverride(userId: string, academicYearStr: string) {
  try {
    const overrideRef = adminRtdb.ref(`/arpsOverrides/${academicYearStr}/${userId}`);
    await overrideRef.remove();

    await createNotification(
      userId,
      `ARPS Override Cleared`,
      `Your ARPS score override has been cleared. The score is now recalculated based on verified entries.`
    );

    return { success: true, message: 'ARPS score override cleared successfully.' };
  } catch (error: any) {
    console.error('Error clearing ARPS override:', error);
    return { success: false, error: error.message || 'Failed to clear score override.' };
  }
}
