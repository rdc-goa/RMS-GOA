"use server";

import { adminDb, adminRtdb } from '@/lib/admin';
import { FieldValue, type Query } from 'firebase-admin/firestore';
import type { User, ArpsSubmission, ArpsSubmissionHistory } from '@/types';
import { parseISO } from 'date-fns';
import { GovernanceLogger } from '@/lib/governance-logger';
import { DEFAULT_POLICY_RULES } from '@/lib/arps-defaults';
import { getDefaultModulesForRole } from '@/lib/modules';
import { sendEmail } from '@/lib/email';

const getYearVariations = (yr: string): string[] => {
  const variations = [yr];
  const parts = yr.split('-');
  if (parts.length === 2) {
    const start = parts[0];
    const end = parts[1];
    if (end.length === 2) {
      variations.push(`${start}-20${end}`);
    } else if (end.length === 4 && end.startsWith('20')) {
      variations.push(`${start}-${end.substring(2)}`);
    }
  }
  return Array.from(new Set(variations));
};

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
    const docRef = adminDb.collection('system').doc('arpsPolicyRules');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const fsRules = docSnap.data();
      const mergedRules = deepMerge(DEFAULT_POLICY_RULES, fsRules);
      return { success: true, rules: mergedRules };
    } else {
      // Initialize with defaults if empty
      await docRef.set(DEFAULT_POLICY_RULES);
      return { success: true, rules: DEFAULT_POLICY_RULES };
    }
  } catch (error: any) {
    console.error('Error fetching policy rules from Firestore:', error);
    return { success: true, rules: DEFAULT_POLICY_RULES }; // fallback to local defaults to avoid crashes
  }
}

export async function updatePolicyRules(rules: any) {
  try {
    const docRef = adminDb.collection('system').doc('arpsPolicyRules');
    await docRef.set(rules);
    return { success: true, message: 'Policy rules updated successfully.' };
  } catch (error: any) {
    console.error('Error updating policy rules in Firestore:', error);
    return { success: false, error: error.message || 'Failed to update policy rules.' };
  }
}

// --- Active Cycles Management ---
export async function getArpsEvaluationCycles() {
  try {
    const docRef = adminDb.collection('system').doc('arpsEvaluationCycles');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return { success: true, cycles: docSnap.data() };
    } else {
      const currentYear = new Date().getFullYear();
      const defaultCycles = {
        [`${currentYear - 1}-${currentYear}`]: { status: 'active', finalized: false }
      };
      await docRef.set(defaultCycles);
      return { success: true, cycles: defaultCycles };
    }
  } catch (error: any) {
    console.error('Error fetching ARPS cycles from Firestore:', error);
    return { success: true, cycles: {} };
  }
}

export async function updateArpsEvaluationCycle(year: string, data: any) {
  try {
    const docRef = adminDb.collection('system').doc('arpsEvaluationCycles');
    await docRef.set({ [year]: data }, { merge: true });
    return { success: true, message: 'Evaluation cycle updated.' };
  } catch (error: any) {
    console.error('Error updating evaluation cycle in Firestore:', error);
    return { success: false, error: error.message || 'Failed to update cycle.' };
  }
}

async function updateArpsPendingCount(change: 'increment' | 'decrement') {
  try {
    const pendingRef = adminDb.collection('system').doc('pendingCounts');
    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(pendingRef);
      const data = docSnap.exists ? docSnap.data() : { arps: 0, equipmentBookings: 0 };
      const val = data?.arps || 0;
      const newVal = (change === 'increment') ? val + 1 : Math.max(0, val - 1);
      transaction.set(pendingRef, { ...data, arps: newVal });
    });
  } catch (err) {
    console.error('Error updating Firestore ARPS pending count:', err);
  }
}

async function updateArpsStats(oldStatus: string | null, newStatus: string | null) {
  if (oldStatus === newStatus) return;
  try {
    const statsRef = adminDb.collection('system').doc('arpsStats');
    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(statsRef);
      const stats = (docSnap.exists ? docSnap.data() : null) || {
        Submitted: 0,
        "Under Review": 0,
        Approved: 0,
        Rejected: 0,
        "Resubmission Required": 0,
        Draft: 0,
        Locked: 0,
        Finalized: 0
      };
      if (oldStatus && stats[oldStatus] !== undefined) {
        stats[oldStatus] = Math.max(0, (stats[oldStatus] || 1) - 1);
      }
      if (newStatus && stats[newStatus] !== undefined) {
        stats[newStatus] = (stats[newStatus] || 0) + 1;
      }
      transaction.set(statsRef, stats);
    });
  } catch (err) {
    console.error('Error updating Firestore ARPS stats counter:', err);
  }
}

// --- Standalone ARPS Submissions Firestore CRUD Actions ---

export async function submitArpsSubmission(data: Partial<ArpsSubmission>) {
  try {
    const { uid, submissionType, academicYear } = data;
    if (!uid || !submissionType || !academicYear) {
      return { success: false, error: 'Missing mandatory fields (uid, submissionType, academicYear)' };
    }

    // Check if the deadline has passed (unless manual override is enabled for the user)
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const isManualArpsEnabled = userSnap.exists && !!userSnap.data()?.manualArpsEnabled;

    if (!isManualArpsEnabled) {
      const cyclesResult = await getArpsEvaluationCycles();
      const cycles = (cyclesResult && cyclesResult.success && cyclesResult.cycles) ? cyclesResult.cycles : {};
      const cycleData = cycles[academicYear] || cycles[getYearVariations(academicYear).find(y => y !== academicYear) || ''];
      if (cycleData) {
        const isExpired = cycleData.finalDate && new Date() > new Date(cycleData.finalDate);
        const isFrozen = cycleData.status === 'frozen';
        if (isExpired || isFrozen) {
          try {
            const { logEvent } = await import('@/lib/logger');
            await logEvent('WORKFLOW', 'State transition blocked: None -> Draft (Deadline passed)', {
              user: { uid, email: data.userEmail || '', role: 'faculty' },
              status: 'warning',
              metadata: { action: 'CREATE_SUBMISSION', from: 'None', to: 'Draft', reason: 'Window closed' }
            });
          } catch (e) { }
          return { success: false, error: 'The submission window for this academic year has closed.' };
        }
      }
    }

    // Fetch all for academic year to handle duplicates and counting
    const submissionsSnap = await adminDb.collection('arpsSubmissions')
      .where('academicYear', 'in', getYearVariations(academicYear))
      .get();

    let submissionsForYear: any[] = [];
    if (submissionsSnap.size > 0) {
      submissionsSnap.docs.forEach(doc => {
        submissionsForYear.push({ id: doc.id, ...doc.data() });
      });
    }

    // Auto DOI / Patent number unique verification within arpsSubmissions for this academic year (only block if submitted by the same user)
    if (submissionType === 'publication' && data.doi) {
      const normalizedDoi = data.doi.trim().toLowerCase();
      const activeDuplicates = submissionsForYear.filter(sub =>
        sub.submissionType === 'publication' &&
        sub.doi?.trim().toLowerCase() === normalizedDoi &&
        sub.uid === uid &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );
      if (activeDuplicates.length > 0) {
        try {
          const { logEvent } = await import('@/lib/logger');
          await logEvent('WORKFLOW', 'State transition blocked: None -> Draft (Duplicate DOI)', {
            user: { uid, email: data.userEmail || '', role: 'faculty' },
            status: 'warning',
            metadata: { action: 'CREATE_SUBMISSION', from: 'None', to: 'Draft', reason: 'Duplicate DOI' }
          });
        } catch (e) { }
        return { success: false, error: `You have already submitted a publication with DOI "${data.doi}" for this academic year.` };
      }
    }

    if (submissionType === 'patent' && data.patentNumber) {
      const patentNum = data.patentNumber;
      const activeDuplicates = submissionsForYear.filter(sub =>
        sub.submissionType === 'patent' &&
        sub.patentNumber?.trim() === patentNum.trim() &&
        sub.uid === uid &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );
      if (activeDuplicates.length > 0) {
        try {
          const { logEvent } = await import('@/lib/logger');
          await logEvent('WORKFLOW', 'State transition blocked: None -> Draft (Duplicate Patent)', {
            user: { uid, email: data.userEmail || '', role: 'faculty' },
            status: 'warning',
            metadata: { action: 'CREATE_SUBMISSION', from: 'None', to: 'Draft', reason: 'Duplicate Patent' }
          });
        } catch (e) { }
        return { success: false, error: `You have already submitted a patent with number "${data.patentNumber}" for this academic year.` };
      }
    }

    // Generate Human-Readable ID sequence
    const typeSubmissions = submissionsForYear.filter(sub => sub.submissionType === submissionType);
    const sequenceNum = String(typeSubmissions.length + 1).padStart(4, '0');
    const typeAbbr = submissionType.substring(0, 3).toUpperCase();
    const submissionId = `RDC/ARPS/${academicYear}/${typeAbbr}/${sequenceNum}`;

    const newDocRef = adminDb.collection('arpsSubmissions').doc();
    const id = newDocRef.id;
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

    await newDocRef.set(finalData);
    await updateArpsStats(null, finalData.status);
    if (finalData.status === 'Submitted') {
      await updateArpsPendingCount('increment');
    }

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', `State transition completed: None -> ${finalData.status}`, {
        user: { uid: finalData.uid, email: finalData.userEmail || '', role: 'faculty' },
        metadata: { action: 'CREATE_SUBMISSION', from: 'None', to: finalData.status, submissionId: finalData.id }
      });
    } catch (e) { }

    return { success: true, id, submissionId };
  } catch (error: any) {
    console.error('Error submitting ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to submit.' };
  }
}

export async function updateArpsSubmission(id: string, data: Partial<ArpsSubmission>) {
  try {
    const docRef = adminDb.collection('arpsSubmissions').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return { success: false, error: 'Submission not found' };
    }

    const currentData = snap.data() as ArpsSubmission;
    if (currentData.status === 'Locked' || currentData.status === 'Finalized' || currentData.status === 'Approved') {
      try {
        const { logEvent } = await import('@/lib/logger');
        await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> Updated (Locked)`, {
          user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
          status: 'warning',
          metadata: { action: 'UPDATE_SUBMISSION', from: currentData.status, to: 'Updated', reason: 'Locked/approved' }
        });
      } catch (e) { }
      return { success: false, error: 'Submission is approved, locked or finalized and cannot be modified.' };
    }

    const academicYear = data.academicYear || currentData.academicYear;

    // Check if deadline has passed, block edits unless it's a requested revision or manual override is enabled
    const userSnap = await adminDb.collection('users').doc(currentData.uid).get();
    const isManualArpsEnabled = userSnap.exists && !!userSnap.data()?.manualArpsEnabled;

    if (!isManualArpsEnabled) {
      const cyclesResult = await getArpsEvaluationCycles();
      const cycles = (cyclesResult && cyclesResult.success && cyclesResult.cycles) ? cyclesResult.cycles : {};
      const cycleData = cycles[academicYear] || cycles[getYearVariations(academicYear).find(y => y !== academicYear) || ''];
      if (cycleData) {
        const isExpired = cycleData.finalDate && new Date() > new Date(cycleData.finalDate);
        const isFrozen = cycleData.status === 'frozen';
        if (isExpired || isFrozen) {
          if (currentData.status !== 'Resubmission Required') {
            try {
              const { logEvent } = await import('@/lib/logger');
              await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> Updated (Deadline passed)`, {
                user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
                status: 'warning',
                metadata: { action: 'UPDATE_SUBMISSION', from: currentData.status, to: 'Updated', reason: 'Window closed' }
              });
            } catch (e) { }
            return { success: false, error: 'The submission window is closed. Only applications requested for revision can be edited.' };
          }
        }
      }
    }
    // Fetch all for academic year to handle duplicates
    let submissionsForYear: any[] = [];
    if (data.doi || data.patentNumber) {
      const submissionsSnap = await adminDb.collection('arpsSubmissions')
        .where('academicYear', 'in', getYearVariations(academicYear))
        .get();
      if (submissionsSnap.size > 0) {
        submissionsSnap.docs.forEach(doc => {
          if (doc.id !== id) {
            submissionsForYear.push({ id: doc.id, ...doc.data() });
          }
        });
      }
    }

    if (currentData.submissionType === 'publication' && data.doi && data.doi !== currentData.doi) {
      const normalizedDoi = data.doi.trim().toLowerCase();
      const activeDuplicates = submissionsForYear.filter(sub =>
        sub.submissionType === 'publication' &&
        sub.doi?.trim().toLowerCase() === normalizedDoi &&
        sub.uid === currentData.uid &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );

      if (activeDuplicates.length > 0) {
        try {
          const { logEvent } = await import('@/lib/logger');
          await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> Updated (Duplicate DOI)`, {
            user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
            status: 'warning',
            metadata: { action: 'UPDATE_SUBMISSION', from: currentData.status, to: 'Updated', reason: 'Duplicate DOI' }
          });
        } catch (e) { }
        return { success: false, error: `You have already submitted a publication with DOI "${data.doi}" for this academic year.` };
      }
    }

    if (currentData.submissionType === 'patent' && data.patentNumber && data.patentNumber !== currentData.patentNumber) {
      const patentNum = data.patentNumber;
      const activeDuplicates = submissionsForYear.filter(sub =>
        sub.submissionType === 'patent' &&
        sub.patentNumber?.trim() === patentNum.trim() &&
        sub.uid === currentData.uid &&
        sub.status !== 'Draft' && sub.status !== 'Rejected'
      );

      if (activeDuplicates.length > 0) {
        try {
          const { logEvent } = await import('@/lib/logger');
          await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> Updated (Duplicate Patent)`, {
            user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
            status: 'warning',
            metadata: { action: 'UPDATE_SUBMISSION', from: currentData.status, to: 'Updated', reason: 'Duplicate Patent' }
          });
        } catch (e) { }
        return { success: false, error: `You have already submitted a patent with number "${data.patentNumber}" for this academic year.` };
      }
    }

    const newHistory: ArpsSubmissionHistory = {
      timestamp: new Date().toISOString(),
      user: data.userName || currentData.userName,
      action: data.status === 'Submitted' ? 'Submitted for review' : 'Updated draft'
    };

    const history = [...(currentData.history || []), newHistory];

    const oldStatus = currentData.status;
    const newStatus = data.status || oldStatus;

    await docRef.update({
      ...data,
      history,
      submissionDate: new Date().toISOString()
    });

    await updateArpsStats(oldStatus, newStatus);

    if (oldStatus !== 'Submitted' && newStatus === 'Submitted') {
      await updateArpsPendingCount('increment');
    } else if (oldStatus === 'Submitted' && newStatus !== 'Submitted') {
      await updateArpsPendingCount('decrement');
    }

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', `State transition completed: ${oldStatus} -> ${newStatus}`, {
        user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
        metadata: { action: 'UPDATE_SUBMISSION', from: oldStatus, to: newStatus, submissionId: currentData.id }
      });
    } catch (e) { }

    return { success: true, message: 'Submission updated successfully.' };
  } catch (error: any) {
    console.error('Error updating ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to update.' };
  }
}

export async function deleteArpsSubmission(id: string) {
  try {
    const docRef = adminDb.collection('arpsSubmissions').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return { success: false, error: 'Submission not found' };
    }
    const currentData = snap.data() as ArpsSubmission;
    if (currentData.status === 'Approved') {
      try {
        const { logEvent } = await import('@/lib/logger');
        await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> Deleted (Finalized)`, {
          user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
          status: 'warning',
          metadata: { action: 'DELETE_SUBMISSION', from: currentData.status, to: 'Deleted', reason: 'Approved submissions cannot be deleted' }
        });
      } catch (e) { }
      return { success: false, error: 'Approved submissions cannot be deleted.' };
    }
    await docRef.delete();
    await updateArpsStats(currentData.status, null);
    if (currentData.status === 'Submitted') {
      await updateArpsPendingCount('decrement');
    }
    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', `State transition completed: ${currentData.status} -> Deleted`, {
        user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'faculty' },
        metadata: { action: 'DELETE_SUBMISSION', from: currentData.status, to: 'Deleted', submissionId: currentData.id }
      });
    } catch (e) { }
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
    const docRef = adminDb.collection('arpsSubmissions').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return { success: false, error: 'Submission not found' };
    }

    const currentData = snap.data() as ArpsSubmission;
    if (currentData.status === 'Approved' || currentData.status === 'Rejected') {
      try {
        const { logEvent } = await import('@/lib/logger');
        await logEvent('WORKFLOW', `State transition blocked: ${currentData.status} -> ${status}`, {
          user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'reviewer' },
          status: 'warning',
          metadata: { action: 'REVIEW_SUBMISSION', from: currentData.status, to: status, reason: 'Already finalized' }
        });
      } catch (e) { }
      return { success: false, error: 'Finalized submissions cannot be reviewed again.' };
    }

    const historyEntry: ArpsSubmissionHistory = {
      timestamp: new Date().toISOString(),
      user: reviewerName,
      action: `Reviewed and set status to ${status}`,
      remarks
    };

    const history = [...(currentData.history || []), historyEntry];

    // Explicitly preserve all critical fields during update to prevent data loss
    await docRef.update({
      status,
      remarks,
      verifiedFields,
      history,
      // Explicitly include critical fields to ensure they're preserved
      uid: currentData.uid,
      academicYear: currentData.academicYear,
      submissionType: currentData.submissionType,
      submissionDate: currentData.submissionDate
    });

    await updateArpsStats(currentData.status, status);

    if (currentData.status === 'Submitted') {
      await updateArpsPendingCount('decrement');
    }

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', `State transition completed: ${currentData.status} -> ${status}`, {
        user: { uid: currentData.uid, email: currentData.userEmail || '', role: 'reviewer' },
        metadata: { action: 'REVIEW_SUBMISSION', from: currentData.status, to: status, submissionId: currentData.id }
      });
    } catch (e) { }

    // In-app Notification
    const reviewTypeLabel = currentData.submissionType.charAt(0).toUpperCase() + currentData.submissionType.slice(1);
    let notifTitle = '';
    let notifContent = '';
    if (status === 'Approved') {
      notifTitle = `✅ ${reviewTypeLabel} Submission Approved`;
      notifContent = `Your ARPS ${reviewTypeLabel} submission (ID: ${currentData.submissionId}) for academic year ${currentData.academicYear} has been approved and will be counted in your ARPS score.${remarks ? ` Reviewer note: "${remarks}"` : ''}`;
    } else if (status === 'Rejected') {
      notifTitle = `❌ ${reviewTypeLabel} Submission Rejected`;
      notifContent = `Your ARPS ${reviewTypeLabel} submission (ID: ${currentData.submissionId}) for academic year ${currentData.academicYear} has been rejected and will not be counted in your ARPS score. Reviewer remarks: "${remarks}"`;
    } else {
      notifTitle = `⚠️ Revision Required — ${reviewTypeLabel} Submission`;
      notifContent = `Your ARPS ${reviewTypeLabel} submission (ID: ${currentData.submissionId}) for academic year ${currentData.academicYear} requires revision before it can be approved. Please log in to review and correct the submission. Reviewer remarks: "${remarks}"`;
    }
    await createNotification(currentData.uid, notifTitle, notifContent);

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
            <p>Click on the link below to login to the R&D Portal:</p>
            <a href="https://rndprojects.paruluniversity.ac.in/dashboard/arps-submission" style="display: inline-block; margin-top: 15px; padding: 10px 20px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 5px;">Login to R&D Portal</a>
            <p>If you wish to communicate any comments to the reviewer, please reply to this mail</p>
            <br/>
            <p>Best Regards,</p>
            <p>RDC Team, Parul University</p>
          </div>
        `;
        await sendEmail({
          to: currentData.userEmail,
          subject: `Action Required: ARPS Revision Requested (${currentData.submissionId})`,
          html: emailHtml,
          from: 'default'
        });
      } catch (err) {
        console.error("Failed to send revision email", err);
      }
    }

    if (status === 'Approved' && currentData.userEmail) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <p>Dear ${currentData.userName},</p>
            <p>Your ARPS submission <strong>${currentData.submissionId}</strong> has been approved.</p>
            ${remarks ? `<p><strong>Reviewer Remarks:</strong></p>
            <blockquote style="border-left: 4px solid #10b981; margin-left: 0; padding-left: 15px; color: #555; background-color: #ecfdf5; padding: 10px; border-radius: 0 4px 4px 0;">
              ${remarks}
            </blockquote>` : ''}
            <br/>
            <p>Best Regards,</p>
            <p>RDC Team, Parul University</p>
          </div>
        `;
        await sendEmail({
          to: currentData.userEmail,
          subject: `ARPS Submission Approved (${currentData.submissionId})`,
          html: emailHtml,
          from: 'default'
        });
      } catch (err) {
        console.error("Failed to send approval email", err);
      }
    }

    return { success: true, message: `Submission reviewed successfully and set to ${status}.` };
  } catch (error: any) {
    console.error('Error reviewing ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to review.' };
  }
}

export async function sendBulkArpsRevisionReminders(
  reminders: {
    uid: string;
    userEmail: string;
    userName: string;
    claims: {
      submissionId: string;
      submissionType: string;
      title: string;
      remarks: string;
    }[];
  }[]
) {
  try {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const reminder of reminders) {
      if (!reminder.userEmail || reminder.claims.length === 0) continue;

      const claimsHtmlList = reminder.claims.map(claim => {
        const typeLabel = claim.submissionType.charAt(0).toUpperCase() + claim.submissionType.slice(1);
        return `
          <div style="margin-bottom: 15px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; background-color: #f8fafc;">
            <div style="font-weight: bold; color: #1e293b; margin-bottom: 4px; font-size: 14px;">
              ${claim.submissionId} (${typeLabel})
            </div>
            <div style="font-size: 13px; color: #475569; margin-bottom: 6px;">
              <strong>Title/Details:</strong> ${claim.title}
            </div>
            <div style="font-size: 13px; color: #b45309; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px; border-radius: 0 4px 4px 0; margin-top: 4px;">
              <strong>Required Revision / Remarks:</strong> ${claim.remarks || 'No remarks provided.'}
            </div>
          </div>
        `;
      }).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <p>Dear ${reminder.userName},</p>
          <p>This is a reminder that you have <strong>${reminder.claims.length}</strong> ARPS claim${reminder.claims.length > 1 ? 's' : ''} requiring revision and resubmission.</p>
          
          <div style="margin-top: 15px; margin-bottom: 15px;">
            ${claimsHtmlList}
          </div>

          <p>Please log in to the R&D Portal to make the necessary corrections and resubmit your application.</p>
          <p>Click on the link below to login to the R&D Portal:</p>
          <a href="https://rndprojects.paruluniversity.ac.in/dashboard/arps-submission" style="display: inline-block; margin-top: 15px; padding: 10px 20px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to R&D Portal</a>
          <p>If you wish to communicate any comments to the reviewer, please reply to this mail.</p>
          <br/>
          <p>Best Regards,</p>
          <p>RDC Team, Parul University</p>
        </div>
      `;

      const res = await sendEmail({
        to: reminder.userEmail,
        subject: `URGENT: Action Required: Reminder to Revise ARPS Submissions (${reminder.claims.length} Pending)`,
        html: emailHtml,
        from: 'default'
      });

      if (res.success) {
        successCount++;
        // Create an in-app notification
        const notifTitle = `⚠️ Reminder: Revision Required for ${reminder.claims.length} Submissions`;
        const notifContent = `You have ${reminder.claims.length} ARPS submission(s) requiring revision. Please log in to make corrections. Details: ${reminder.claims.map(c => c.submissionId).join(', ')}`;
        await createNotification(reminder.uid, notifTitle, notifContent);
      } else {
        failureCount++;
        errors.push(`Failed for ${reminder.userName} (${reminder.userEmail}): ${res.error}`);
      }
    }

    return {
      success: true,
      successCount,
      failureCount,
      errors
    };
  } catch (error: any) {
    console.error('Error sending bulk reminders:', error);
    return { success: false, error: error.message || 'Failed to send bulk reminders.' };
  }
}

export async function getArpsSubmissions(
  filters?: {
    uid?: string;
    status?: string;
    submissionType?: string;
    academicYear?: string;
    searchTerm?: string;
  },
  limitCount?: number
) {
  try {
    const actualLimit = limitCount ?? (filters?.uid ? 1000 : 30);
    let query: Query = adminDb.collection('arpsSubmissions');

    if (filters?.uid) {
      query = query.where('uid', '==', filters.uid);
    }
    if (filters?.status && filters.status !== 'all') {
      query = query.where('status', '==', filters.status);
    }
    if (filters?.submissionType && filters.submissionType !== 'all') {
      const dbType = filters.submissionType === 'emr' ? 'EMR' : filters.submissionType.toLowerCase();
      query = query.where('submissionType', '==', dbType);
    }
    if (filters?.academicYear) {
      const years = getYearVariations(filters.academicYear);
      query = query.where('academicYear', 'in', years);
    }

    const snap = await query.get();
    let submissions: ArpsSubmission[] = [];
    snap.docs.forEach(doc => {
      submissions.push({ id: doc.id, ...doc.data() } as ArpsSubmission);
    });

    // Apply remaining search filter in memory
    if (filters?.searchTerm && filters.searchTerm.trim() !== '') {
      const queryStr = filters.searchTerm.toLowerCase();
      submissions = submissions.filter(sub => {
        if (sub.submissionType === 'other') return false;
        return (
          sub.submissionId?.toLowerCase().includes(queryStr) ||
          sub.userName?.toLowerCase().includes(queryStr) ||
          sub.userEmail?.toLowerCase().includes(queryStr) ||
          (sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || '')
            .toLowerCase()
            .includes(queryStr)
        );
      });
    }

    // Sort by submissionDate desc
    submissions.sort((a, b) => {
      return new Date(b.submissionDate || 0).getTime() - new Date(a.submissionDate || 0).getTime();
    });

    const hasMore = submissions.length > actualLimit;

    // Take only the requested actualLimit (unless searching)
    if (!filters?.searchTerm) {
      submissions = submissions.slice(0, actualLimit);
    }

    // Get accurate count from the collection dynamically
    const statuses = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Resubmission Required'];
    const stats: Record<string, number> = {};
    await Promise.all(statuses.map(async (status) => {
      const snap = await adminDb.collection('arpsSubmissions').where('status', '==', status).select().get();
      stats[status] = snap.size;
    }));

    return { success: true, submissions, stats, hasMore };
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
    const loadedRules = (rulesResult && rulesResult.success && rulesResult.rules) ? rulesResult.rules : {};
    const rules = {
      ...DEFAULT_POLICY_RULES,
      ...loadedRules,
      publications: { ...DEFAULT_POLICY_RULES.publications, ...(loadedRules.publications || {}) },
      patents: { ...DEFAULT_POLICY_RULES.patents, ...(loadedRules.patents || {}) },
      weightage: { ...DEFAULT_POLICY_RULES.weightage, ...(loadedRules.weightage || {}) },
      caps: { ...DEFAULT_POLICY_RULES.caps, ...(loadedRules.caps || {}) },
      increments: { ...DEFAULT_POLICY_RULES.increments, ...(loadedRules.increments || {}) },
      activities: { ...DEFAULT_POLICY_RULES.activities, ...(loadedRules.activities || {}) },
      consultancy: { ...DEFAULT_POLICY_RULES.consultancy, ...(loadedRules.consultancy || {}) },
      emr: { ...DEFAULT_POLICY_RULES.emr, ...(loadedRules.emr || {}) }
    };

    // Load active cycle details
    const cyclesResult = await getArpsEvaluationCycles();
    const cycles = (cyclesResult && cyclesResult.success && cyclesResult.cycles) ? cyclesResult.cycles : {};
    const cycle = cycles[academicYearStr] || cycles[getYearVariations(academicYearStr).find(y => y !== academicYearStr) || ''] || { status: 'active', finalized: false };

    // Fetch user details
    const userSnap = await adminDb.collection('users').doc(userId).get();
    const userData = userSnap.data() as User;
    if (!userData) {
      return { success: false, error: 'User details not found.' };
    }

    // Fetch ONLY APPROVED submissions for the academic year in the isolated database
    const submissionsSnap = await adminDb.collection('arpsSubmissions')
      .where('uid', '==', userId)
      .get();

    let submissions: ArpsSubmission[] = [];
    let allUserSubmissions: ArpsSubmission[] = [];

    const queryYears = getYearVariations(academicYearStr);

    if (submissionsSnap.size > 0) {
      submissionsSnap.docs.forEach(doc => {
        const val = doc.data();
        allUserSubmissions.push({ id: doc.id, ...val } as ArpsSubmission);
        // Debug: log each submission's status and academicYear for verification
        const matchesYear = queryYears.includes(val.academicYear);
        if (val.status === 'Approved' && matchesYear) {
          submissions.push({ id: doc.id, ...val } as ArpsSubmission);
        }
      });
    }

    // Logging for debugging - helps identify why points aren't showing
    if (submissions.length === 0 && allUserSubmissions.length > 0) {
      console.log(`[ARPS_DEBUG] User ${userId} has submissions but none approved for ${academicYearStr} (variations: ${queryYears.join(', ')}):`,
        allUserSubmissions.map(s => ({ id: s.id, status: s.status, year: s.academicYear }))
      );
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
        base = rules.publications?.[quart] ?? DEFAULT_POLICY_RULES.publications?.[quart as 'q1' | 'q2' | 'q3' | 'q4'] ?? 10;

        if (pub.articleType === 'Original Research') {
          multiplier = rules.publications?.originalResearchMultiplier ?? DEFAULT_POLICY_RULES.publications.originalResearchMultiplier ?? 1.0;
        } else if (pub.articleType === 'Review') {
          multiplier = (quart === 'q1' || quart === 'q2')
            ? (rules.publications?.reviewQ1Q2Multiplier ?? DEFAULT_POLICY_RULES.publications.reviewQ1Q2Multiplier ?? 1.0)
            : (rules.publications?.reviewQ3Q4Multiplier ?? DEFAULT_POLICY_RULES.publications.reviewQ3Q4Multiplier ?? 0.8);
        } else if (pub.articleType === 'Case Report' || pub.articleType === 'Short Survey') {
          multiplier = rules.publications?.caseReportMultiplier ?? DEFAULT_POLICY_RULES.publications.caseReportMultiplier ?? 0.9;
        }

        const role = pub.authorPosition;
        if (role === 'Single Author') {
          authorMultiplier = rules.publications?.singleAuthorMultiplier ?? DEFAULT_POLICY_RULES.publications.singleAuthorMultiplier ?? 1.0;
        } else if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author') {
          authorMultiplier = rules.publications?.firstCorrespondingMultiplier ?? DEFAULT_POLICY_RULES.publications.firstCorrespondingMultiplier ?? 0.7;
        } else if (role === 'Co-Author') {
          const order = pub.authorOrder || 2;
          if (order <= 5) {
            authorMultiplier = rules.publications?.coAuthorUpTo5Multiplier ?? DEFAULT_POLICY_RULES.publications.coAuthorUpTo5Multiplier ?? 0.3;
          } else {
            authorMultiplier = rules.publications?.coAuthor6OnwardsMultiplier ?? DEFAULT_POLICY_RULES.publications.coAuthor6OnwardsMultiplier ?? 0.1;
          }
          if (pub.isSinglePuAuthorWithExternal) {
            authorMultiplier = rules.publications?.singlePuCoAuthorWithExternalMultiplier ?? DEFAULT_POLICY_RULES.publications.singlePuCoAuthorWithExternalMultiplier ?? 0.8;
          }
        }
        detailsText = `Journal (${pub.journalClassification}, Role: ${pub.authorPosition})`;
      } else if (pub.publicationType === 'Book Chapter') {
        base = rules.publications?.bookChapterBase ?? DEFAULT_POLICY_RULES.publications.bookChapterBase ?? 6;
        const role = pub.authorPosition;
        if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author' || role === 'Single Author') {
          authorMultiplier = rules.publications?.firstCorrespondingMultiplier ?? DEFAULT_POLICY_RULES.publications.firstCorrespondingMultiplier ?? 0.7;
        } else {
          authorMultiplier = rules.publications?.coAuthorUpTo5Multiplier ?? DEFAULT_POLICY_RULES.publications.coAuthorUpTo5Multiplier ?? 0.3;
        }
        detailsText = `Book Chapter`;
      } else if (pub.publicationType === 'Book Editor') {
        // Points divided among total number of editors
        base = rules.publications?.bookEditorBase ?? DEFAULT_POLICY_RULES.publications.bookEditorBase ?? 18;
        const editors = pub.totalAuthors || 1;
        base = base / editors;
        authorMultiplier = 1.0;
        detailsText = `Book Editor (Divided by ${editors})`;
      } else if (pub.publicationType === 'Conference Proceedings') {
        base = rules.publications?.conferenceProceedingsBase ?? DEFAULT_POLICY_RULES.publications.conferenceProceedingsBase ?? 3;
        const role = pub.authorPosition;
        if (role === 'First Author' || role === 'Corresponding Author' || role === 'First & Corresponding Author' || role === 'Single Author') {
          authorMultiplier = rules.publications?.firstCorrespondingMultiplier ?? DEFAULT_POLICY_RULES.publications.firstCorrespondingMultiplier ?? 0.7;
        } else {
          authorMultiplier = rules.publications?.coAuthorUpTo5Multiplier ?? DEFAULT_POLICY_RULES.publications.coAuthorUpTo5Multiplier ?? 0.3;
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
        articleType: pub.articleType || '',
        journalClassification: pub.journalClassification || '',
        authorPosition: pub.authorPosition || 'N/A',
        details: detailsText,
        calculation: { base, multiplier, authorMultiplier },
        score: round(score),
        proofUrls: pub.proofUrls || []
      });
    }

    // B. Patents Scoring
    const patents = submissions.filter(s => s.submissionType === 'patent');
    let rawPatentScore = 0;
    const contributingPatents: any[] = [];

    for (const pat of patents) {
      let base = 0;
      if (pat.patentCategory === 'Published') {
        base = rules.patents?.publishedBase ?? DEFAULT_POLICY_RULES.patents.publishedBase ?? 10;
      } else if (pat.patentCategory === 'Granted India') {
        base = rules.patents?.grantedIndiaBase ?? DEFAULT_POLICY_RULES.patents.grantedIndiaBase ?? 50;
      } else if (pat.patentCategory === 'Granted International') {
        base = rules.patents?.grantedInternationalBase ?? DEFAULT_POLICY_RULES.patents.grantedInternationalBase ?? 75;
      }

      let appMultiplier = 0.0;
      if (pat.isPuSoleApplicant) {
        appMultiplier = rules.patents?.puSoleApplicantMultiplier ?? DEFAULT_POLICY_RULES.patents.puSoleApplicantMultiplier ?? 1.0;
      } else if (pat.isPuJointApplicant) {
        appMultiplier = rules.patents?.coApplicantMultiplier ?? DEFAULT_POLICY_RULES.patents.coApplicantMultiplier ?? 0.8;
      }

      const score = base * appMultiplier;
      rawPatentScore += score;
      contributingPatents.push({
        id: pat.id,
        submissionId: pat.submissionId,
        title: pat.patentTitle || 'Untitled Patent',
        category: pat.patentCategory,
        calculation: { base, appMultiplier },
        score: round(score),
        proofUrls: pat.proofUrls || []
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
      const slabs = (rules.consultancy?.slabs && Array.isArray(rules.consultancy.slabs)) ? rules.consultancy.slabs : DEFAULT_POLICY_RULES.consultancy.slabs;
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
        const basePoints = rules.consultancy?.baseAbove500k ?? DEFAULT_POLICY_RULES.consultancy.baseAbove500k ?? 50;
        const extraRevenue = revenue - 500000;
        const extraSlabStep = rules.consultancy?.extraSlabStep ?? DEFAULT_POLICY_RULES.consultancy.extraSlabStep ?? 50000;
        const extraSlabs = Math.floor(extraRevenue / extraSlabStep);
        const extraSlabPoints = rules.consultancy?.extraSlabPoints ?? DEFAULT_POLICY_RULES.consultancy.extraSlabPoints ?? 10;
        score = basePoints + (extraSlabs * extraSlabPoints);
      }

      rawConsultancyScore += score;
      contributingConsultancy.push({
        id: cons.id,
        submissionId: cons.submissionId,
        title: cons.consultancyTitle || 'Untitled Consultancy',
        revenue,
        score: round(score),
        proofUrls: cons.proofUrls || []
      });
    }

    // D. EMR Scoring
    const emrSubmissions = submissions.filter(s => s.submissionType === 'EMR' || s.submissionType === 'emr');
    let rawEmrScore = 0;
    const contributingEmr: any[] = [];

    for (const emr of emrSubmissions) {
      const amount = emr.sanctionAmount || 0;
      const isSanctioned = emr.projectStatus === 'Sanctioned';
      const role = emr.role || 'Team Member';
      let score = 0;

      const rawTiers = isSanctioned ? rules.emr?.sanctioned : rules.emr?.ongoing;
      const defaultTiers = isSanctioned ? DEFAULT_POLICY_RULES.emr.sanctioned : DEFAULT_POLICY_RULES.emr.ongoing;
      const tiers = (rawTiers && Array.isArray(rawTiers)) ? rawTiers : defaultTiers;

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
        score: round(score),
        proofUrls: emr.proofUrls || []
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
        const rate = isIndia
          ? (rules.activities?.conferencePresentationIndia ?? DEFAULT_POLICY_RULES.activities.conferencePresentationIndia ?? 1)
          : (rules.activities?.conferencePresentationOutsideIndia ?? DEFAULT_POLICY_RULES.activities.conferencePresentationOutsideIndia ?? 2);
        score = (act.eventDurationDays || 1) * rate;
        subcat = 'conference_presentation';
      } else if (act.activityCategory === 'Convener') {
        score = rules.activities?.convener ?? DEFAULT_POLICY_RULES.activities.convener ?? 5;
        subcat = 'convener';
      } else if (act.activityCategory === 'Coordinator') {
        score = rules.activities?.coordinator ?? DEFAULT_POLICY_RULES.activities.coordinator ?? 2;
        subcat = 'coordinator';
      } else if (act.activityCategory === 'Expert talk') {
        const isPu = act.location === 'In PU';
        score = isPu
          ? (rules.activities?.expertTalkInPu ?? DEFAULT_POLICY_RULES.activities.expertTalkInPu ?? 2)
          : (rules.activities?.expertTalkOutsidePu ?? DEFAULT_POLICY_RULES.activities.expertTalkOutsidePu ?? 5);
        subcat = 'expert_talk';
      } else if (act.activityCategory === 'Participation') {
        const isPu = act.location === 'In PU';
        score = isPu
          ? (rules.activities?.participationInPu ?? DEFAULT_POLICY_RULES.activities.participationInPu ?? 1)
          : (rules.activities?.participationOutsidePu ?? DEFAULT_POLICY_RULES.activities.participationOutsidePu ?? 2);
        subcat = 'participation';
      } else if (act.activityCategory === 'Membership') {
        score = act.membershipType === 'Lifetime' ? 0 : (rules.activities?.membership ?? DEFAULT_POLICY_RULES.activities.membership ?? 2);
        subcat = 'membership';
      } else if (act.activityCategory === 'EMR team member') {
        score = rules.activities?.emrTeamMember ?? DEFAULT_POLICY_RULES.activities.emrTeamMember ?? 2;
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
          rawScore: score,
          proofUrls: act.proofUrls || []
        });
      }
    }

    // Score students
    for (const stud of students) {
      let score = 0;
      let subcat = '';

      if (stud.program === 'PhD') {
        if (stud.studentStatus === 'Completed') {
          score = rules.activities?.phdCompleted ?? DEFAULT_POLICY_RULES.activities.phdCompleted ?? 20;
          subcat = 'students_phd_completed';
        } else {
          score = rules.activities?.phdOngoing ?? DEFAULT_POLICY_RULES.activities.phdOngoing ?? 10;
          subcat = 'students_phd_ongoing';
        }
      } else if (stud.program === 'PG Dissertation') {
        if (stud.studentStatus === 'Completed') {
          score = rules.activities?.pgCompleted ?? DEFAULT_POLICY_RULES.activities.pgCompleted ?? 10;
          subcat = 'students_pg_completed';
        } else {
          score = rules.activities?.pgOngoing ?? DEFAULT_POLICY_RULES.activities.pgOngoing ?? 5;
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
          rawScore: score,
          proofUrls: stud.proofUrls || [],
          allotmentDetails: stud.allotmentDetails || 'N/A',
          status: stud.studentStatus || 'N/A'
        });
      }
    }

    // F. Other Details (custom paragraph & description) - does not require admin verification
    const otherSubs = allUserSubmissions.filter(s => s.submissionType === 'other' && queryYears.includes(s.academicYear) && (s.status === 'Submitted' || s.status === 'Approved'));
    const otherDetails = otherSubs.map(s => ({
      id: s.id,
      submissionId: s.submissionId || 'N/A',
      details: s.details || 'N/A'
    }));

    // Apply caps per subcategory (10.0 points maximum cap per subcategory)
    let rawResearchActivitiesScore = 0;
    const cappedActivitySubtotals: Record<string, number> = {};
    const capMax = rules.activities?.subcategoryCap ?? DEFAULT_POLICY_RULES.activities.subcategoryCap ?? 10;

    Object.keys(subcategoryRawScores).forEach(key => {
      const val = subcategoryRawScores[key];
      const cappedVal = Math.min(val, capMax);
      cappedActivitySubtotals[key] = cappedVal;
      rawResearchActivitiesScore += cappedVal;
    });

    const uncappedResearchActivitiesRaw = activityDetails.reduce((sum, c) => sum + c.rawScore, 0);

    // --- Final Capping & Weightages Calculations ---
    const weightages = {
      publication: rules.weightage?.publication ?? DEFAULT_POLICY_RULES.weightage.publication ?? 0.80,
      patent: rules.weightage?.patent ?? DEFAULT_POLICY_RULES.weightage.patent ?? 0.05,
      consultancy: rules.weightage?.consultancy ?? DEFAULT_POLICY_RULES.weightage.consultancy ?? 0.05,
      researchActivities: rules.weightage?.researchActivities ?? DEFAULT_POLICY_RULES.weightage.researchActivities ?? 0.05,
      emr: rules.weightage?.emr ?? DEFAULT_POLICY_RULES.weightage.emr ?? 0.05
    };

    const caps = {
      publication: rules.caps?.publication ?? DEFAULT_POLICY_RULES.caps.publication ?? 80,
      patent: rules.caps?.patent ?? DEFAULT_POLICY_RULES.caps.patent ?? 5,
      consultancy: rules.caps?.consultancy ?? DEFAULT_POLICY_RULES.caps.consultancy ?? 5,
      researchActivities: rules.caps?.researchActivities ?? DEFAULT_POLICY_RULES.caps.researchActivities ?? 5,
      emr: rules.caps?.emr ?? DEFAULT_POLICY_RULES.caps.emr ?? 5
    };

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
        } else {
          const otherYr = getYearVariations(academicYearStr).find(y => y !== academicYearStr);
          if (otherYr) {
            const altRef = adminRtdb.ref(`/arpsOverrides/${otherYr}/${userId}`);
            const altSnap = await altRef.get();
            if (altSnap.exists()) {
              overrides = altSnap.val();
            }
          }
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
    const incRules = {
      factor: rules.increments?.factor ?? DEFAULT_POLICY_RULES.increments.factor ?? 100,
      fixedDME: rules.increments?.fixedDME ?? DEFAULT_POLICY_RULES.increments.fixedDME ?? 5000,
      fixedME: rules.increments?.fixedME ?? DEFAULT_POLICY_RULES.increments.fixedME ?? 10000,
      fixedEE: rules.increments?.fixedEE ?? DEFAULT_POLICY_RULES.increments.fixedEE ?? 15000,
      fixedSEE: rules.increments?.fixedSEE ?? DEFAULT_POLICY_RULES.increments.fixedSEE ?? 25000
    };
    let fixedAmount = incRules.fixedDME;
    if (grade === 'SEE') fixedAmount = incRules.fixedSEE;
    else if (grade === 'EE') fixedAmount = incRules.fixedEE;
    else if (grade === 'ME') fixedAmount = incRules.fixedME;

    const totalRawScore = round(rawPubScore + rawPatentScore + rawConsultancyScore + uncappedResearchActivitiesRaw + rawEmrScore);
    const annualIncrement = round(fixedAmount + (totalRawScore * incRules.factor));

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
          raw: round(uncappedResearchActivitiesRaw),
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
        otherDetails,
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
    return { success: false, error: `Failed to calculate ARPS score: ${error.message || String(error)}` };
  }
}

// Generate statistical report for Super Admin using pre-saved scores (no auto-recalculate on load)
export async function generateArpsStatisticsReport(academicYearStr: string) {
  try {

    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    const allUsers = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    })) as any[];

    // Filter eligible faculty users (faculty, CRO, Super-admin) who also have access to ARPS Submission
    const eligibleUsers = allUsers.filter(u => {
      const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin' || u.role === 'admin');
      if (!isEligibleRole) return false;
      const userModules = (u.allowedModules && Array.isArray(u.allowedModules)) ? u.allowedModules : getDefaultModulesForRole(u.role, u.designation);
      return Array.isArray(userModules) && userModules.includes('arps-submission');
    });

    const statistics = eligibleUsers.map((user) => {
      const savedScores = user.arpsScores || {};
      const savedData = savedScores[academicYearStr] || {
        totalArps: 0,
        grade: 'DME',
        annualIncrement: 0,
        publicationsCount: 0,
        patentsCount: 0,
        emrCount: 0,
        consultancyCount: 0,
        activitiesCount: 0,
        rawScore: null,
        weightedScore: null,
        publicationsRaw: null,
        patentsRaw: null,
        emrRaw: null,
        consultancyRaw: null,
        activitiesRaw: null
      };

      return {
        uid: user.uid,
        name: user.name || 'N/A',
        email: user.email || 'N/A',
        campus: user.campus || 'N/A',
        misId: user.misId || 'N/A',
        department: user.department || 'N/A',
        institute: user.institute || 'N/A',
        totalArps: savedData.totalArps || 0,
        grade: savedData.grade || 'DME',
        annualIncrement: savedData.annualIncrement || 0,
        publicationsCount: savedData.publicationsCount || 0,
        patentsCount: savedData.patentsCount || 0,
        emrCount: savedData.emrCount || 0,
        consultancyCount: savedData.consultancyCount || 0,
        activitiesCount: savedData.activitiesCount || 0,
        rawScore: savedData.rawScore ?? null,
        weightedScore: savedData.weightedScore ?? null,
        publicationsRaw: savedData.publicationsRaw ?? null,
        patentsRaw: savedData.patentsRaw ?? null,
        emrRaw: savedData.emrRaw ?? null,
        consultancyRaw: savedData.consultancyRaw ?? null,
        activitiesRaw: savedData.activitiesRaw ?? null,
        lastUpdated: savedData.updatedAt || null,
        presentationUrl: savedData.presentationUrl || null,
        presentationName: savedData.presentationName || null,
        presentationUploadedAt: savedData.presentationUploadedAt || null,
        hIndex: user.hIndex,
        i10Index: user.i10Index,
        citationCount: user.citationCount,
        manualArpsEnabled: user.manualArpsEnabled || false,
        manualArpsHistory: user.manualArpsHistory || []
      };
    });

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

// Recalculates and saves final ARPS score in Firestore for a user
export async function refreshArpsForUserAction(userId: string, academicYearStr: string) {
  try {
    const calc = await calculateArpsForUser(userId, academicYearStr) as any;
    if (calc.success && calc.data) {
      const data = calc.data;
      const scoreData = {
        totalArps: data.totalArps,
        grade: data.grade,
        annualIncrement: data.increment.annualIncrement,
        publicationsCount: data.publications.contributingClaims.length,
        patentsCount: data.patents.contributingClaims.length,
        emrCount: data.emr.contributingProjects.length,
        consultancyCount: data.consultancy.contributingClaims.length,
        activitiesCount: data.researchActivities.contributingClaims.length,
        rawScore: round(data.publications.raw + data.patents.raw + data.consultancy.raw + data.researchActivities.raw + data.emr.raw),
        weightedScore: round(data.publications.weighted + data.patents.weighted + data.consultancy.weighted + data.researchActivities.weighted + data.emr.weighted),
        publicationsRaw: round(data.publications.raw),
        patentsRaw: round(data.patents.raw),
        emrRaw: round(data.emr.raw),
        consultancyRaw: round(data.consultancy.raw),
        activitiesRaw: round(data.researchActivities.raw),
        updatedAt: new Date().toISOString()
      };

      // Save to user's document in Firestore
      await adminDb.collection('users').doc(userId).update({
        [`arpsScores.${academicYearStr}`]: scoreData
      });

      return { success: true, data: scoreData };
    }
    return { success: false, error: calc.error || 'Failed to calculate score.' };
  } catch (error: any) {
    console.error(`Error refreshing ARPS for user ${userId}:`, error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

// Recalculates and saves final ARPS scores in Firestore for all eligible users
export async function refreshArpsForAllUsersAction(academicYearStr: string) {
  try {
    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    const allUsers = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    })) as any[];

    // Filter eligible faculty users (faculty, CRO, Super-admin) who also have access to ARPS Submission
    const eligibleUsers = allUsers.filter(u => {
      const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin' || u.role === 'admin');
      if (!isEligibleRole) return false;
      const userModules = (u.allowedModules && Array.isArray(u.allowedModules)) ? u.allowedModules : getDefaultModulesForRole(u.role, u.designation);
      return Array.isArray(userModules) && userModules.includes('arps-submission');
    });

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Calculate sequentially or in safe chunks to prevent overwhelming Firestore/RTDB
    const chunkSize = 10;
    for (let i = 0; i < eligibleUsers.length; i += chunkSize) {
      const chunk = eligibleUsers.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (user) => {
          try {
            const calc = await calculateArpsForUser(user.uid, academicYearStr) as any;
            if (calc.success && calc.data) {
              const data = calc.data;
              const scoreData = {
                totalArps: data.totalArps,
                grade: data.grade,
                annualIncrement: data.increment.annualIncrement,
                publicationsCount: data.publications.contributingClaims.length,
                patentsCount: data.patents.contributingClaims.length,
                emrCount: data.emr.contributingProjects.length,
                consultancyCount: data.consultancy.contributingClaims.length,
                activitiesCount: data.researchActivities.contributingClaims.length,
                rawScore: round(data.publications.raw + data.patents.raw + data.consultancy.raw + data.researchActivities.raw + data.emr.raw),
                weightedScore: round(data.publications.weighted + data.patents.weighted + data.consultancy.weighted + data.researchActivities.weighted + data.emr.weighted),
                publicationsRaw: round(data.publications.raw),
                patentsRaw: round(data.patents.raw),
                emrRaw: round(data.emr.raw),
                consultancyRaw: round(data.consultancy.raw),
                activitiesRaw: round(data.researchActivities.raw),
                updatedAt: new Date().toISOString()
              };

              await adminDb.collection('users').doc(user.uid).update({
                [`arpsScores.${academicYearStr}`]: scoreData
              });
              successCount++;
            } else {
              failureCount++;
              errors.push(`Failed for ${user.name || user.uid}: ${calc.error || 'Unknown calculation error'}`);
            }
          } catch (err: any) {
            failureCount++;
            errors.push(`Error for ${user.name || user.uid}: ${err.message || String(err)}`);
          }
        })
      );
    }

    return {
      success: true,
      successCount,
      failureCount,
      errors
    };
  } catch (error: any) {
    console.error('Error refreshing ARPS for all users:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
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

    return { success: true, message: 'ARPS score override saved successfully.' };
  } catch (error: any) {
    console.error('Error saving ARPS override:', error);
    return { success: false, error: error.message || 'Failed to save score override.' };
  }
}

export async function deleteArpsOverride(userId: string, academicYearStr: string) {
  try {
    const years = getYearVariations(academicYearStr);
    await Promise.all(years.map(y => adminRtdb.ref(`/arpsOverrides/${y}/${userId}`).remove()));
    return { success: true, message: 'ARPS score override cleared successfully.' };
  } catch (error: any) {
    console.error('Error clearing ARPS override:', error);
    return { success: false, error: error.message || 'Failed to clear score override.' };
  }
}

export async function toggleManualArpsSubmissionAction(userId: string, enabled: boolean, changedBy: string) {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const historyItem = {
      enabled,
      timestamp: new Date().toISOString(),
      changedBy
    };
    await userRef.update({
      manualArpsEnabled: enabled,
      manualArpsHistory: FieldValue.arrayUnion(historyItem)
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error toggling manual ARPS submission:', error);
    return { success: false, error: error.message || 'Failed to update.' };
  }
}

export async function getAllApprovedPublicationsForYear(academicYearStr: string) {
  try {
    const years = getYearVariations(academicYearStr);
    const snap = await adminDb.collection('arpsSubmissions')
      .where('submissionType', '==', 'publication')
      .where('status', '==', 'Approved')
      .where('academicYear', 'in', years)
      .get();

    const publications = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { success: true, publications };
  } catch (error: any) {
    console.error('Error fetching approved publications:', error);
    return { success: false, error: error.message || 'Failed to fetch approved publications.' };
  }
}

export async function uploadArpsPresentationAction(userId: string, academicYearStr: string, url: string, name: string) {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { success: false, error: 'User not found.' };
    }
    const userData = userSnap.data() || {};
    const arpsScores = userData.arpsScores || {};
    const yearScore = arpsScores[academicYearStr] || {
      totalArps: 0,
      grade: 'DME',
      annualIncrement: 0,
      publicationsCount: 0,
      patentsCount: 0,
      emrCount: 0,
      consultancyCount: 0,
      activitiesCount: 0,
      rawScore: null,
      weightedScore: null
    };

    yearScore.presentationUrl = url;
    yearScore.presentationName = name;
    yearScore.presentationUploadedAt = new Date().toISOString();

    await userRef.update({
      [`arpsScores.${academicYearStr}`]: yearScore
    });

    return { success: true, message: 'Presentation saved successfully.' };
  } catch (error: any) {
    console.error('Error saving presentation:', error);
    return { success: false, error: error.message || 'Failed to save presentation.' };
  }
}

export async function deleteArpsPresentationAction(userId: string, academicYearStr: string) {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { success: false, error: 'User not found.' };
    }
    const userData = userSnap.data() || {};
    const arpsScores = userData.arpsScores || {};
    const yearScore = arpsScores[academicYearStr] || {};

    delete yearScore.presentationUrl;
    delete yearScore.presentationName;
    delete yearScore.presentationUploadedAt;

    await userRef.update({
      [`arpsScores.${academicYearStr}`]: yearScore
    });

    return { success: true, message: 'Presentation removed successfully.' };
  } catch (error: any) {
    console.error('Error removing presentation:', error);
    return { success: false, error: error.message || 'Failed to remove presentation.' };
  }
}
