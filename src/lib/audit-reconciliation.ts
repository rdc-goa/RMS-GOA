import { adminDb, adminRtdb } from './admin';
import { getAllClaimsCombinedAdmin } from './incentive-data-admin';

export interface AuditReconciliationResult {
  success: boolean;
  totalActualEvents: number;
  totalDiscrepancies: number;
  reconstructedEvents: number;
  accuracy: number;
  error?: string;
}

/**
 * Reconciles the transition history stored inside RTDB arpsSubmissions 
 * against the WORKFLOW logs recorded in Firestore system_logs.
 * Computes the Audit Reconstruction Accuracy (ARA) metric for the paper.
 */
export async function reconcileAuditTrail(): Promise<AuditReconciliationResult> {
  try {
    // 1. Fetch ARPS Submissions from Realtime Database
    const arpsSnap = await adminDb.collection('arpsSubmissions').get();
    const arpsSubmissions: any[] = arpsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch Projects from Firestore
    const projectsSnap = await adminDb.collection('projects').get();
    const projects = projectsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));

    // 3. Fetch Incentive Claims from both Firestore and Realtime Database
    const claims = await getAllClaimsCombinedAdmin();

    // 4. Fetch EMR Interests from Firestore
    const emrSnap = await adminDb.collection('emrInterests').get();
    const emrInterests = emrSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));

    // 5. Fetch Equipment Bookings from Realtime Database
    const bookingsSnap = await adminRtdb.ref('equipmentBookings').get();
    const bookings: any[] = [];
    if (bookingsSnap.exists()) {
      Object.entries(bookingsSnap.val()).forEach(([key, val]: any) => {
        bookings.push({ id: key, ...val });
      });
    }

    // 6. Fetch all WORKFLOW logs
    const source = process.env.NEXT_PUBLIC_LOGS_SOURCE || 'firestore';
    const logCountsBySubmission: Record<string, number> = {};

    if (source === 'firestore') {
      const logsSnap = await adminDb.collection('system_logs')
        .where('category', '==', 'WORKFLOW')
        .get();
      logsSnap.forEach((doc: any) => {
        const data = doc.data();
        const subId = data.metadata?.submissionId;
        if (subId) {
          logCountsBySubmission[subId] = (logCountsBySubmission[subId] || 0) + 1;
        }
      });
    } else {
      const rtdbSnap = await adminRtdb.ref('system_logs').get();
      if (rtdbSnap.exists()) {
        Object.values(rtdbSnap.val()).forEach((log: any) => {
          if (log.category === 'WORKFLOW') {
            const subId = log.metadata?.submissionId;
            if (subId) {
              logCountsBySubmission[subId] = (logCountsBySubmission[subId] || 0) + 1;
            }
          }
        });
      }
    }

    let totalActualEvents = 0;
    let totalDiscrepancies = 0;

    // --- RECONCILE ACTIONS ---

    // A. ARPS Submissions
    for (const sub of arpsSubmissions) {
      const history = sub.history || [];
      const historyLength = history.length;
      totalActualEvents += historyLength;

      const systemLogCount = logCountsBySubmission[sub.submissionId] || logCountsBySubmission[sub.id] || 0;
      const discrepancy = Math.abs(historyLength - systemLogCount);
      totalDiscrepancies += discrepancy;
    }

    // B. Projects
    for (const project of projects) {
      const systemLogCount = logCountsBySubmission[project.id] || 0;
      // Fallback: If no history array exists, assume ground truth events match log count (or 1 if status is not Draft, otherwise 0)
      const historyLength = project.history ? project.history.length : (systemLogCount || (project.status && project.status !== 'Draft' ? 1 : 0));
      totalActualEvents += historyLength;

      const discrepancy = Math.abs(historyLength - systemLogCount);
      totalDiscrepancies += discrepancy;
    }

    // C. Incentive Claims
    for (const claim of claims as any[]) {
      const systemLogCount = logCountsBySubmission[claim.id] || 0;
      const historyLength = claim.history ? claim.history.length : (systemLogCount || (claim.status && claim.status !== 'Draft' ? 1 : 0));
      totalActualEvents += historyLength;

      const discrepancy = Math.abs(historyLength - systemLogCount);
      totalDiscrepancies += discrepancy;
    }

    // D. EMR Interests
    for (const emr of emrInterests) {
      const systemLogCount = logCountsBySubmission[emr.id] || 0;
      const historyLength = emr.history ? emr.history.length : (systemLogCount || (emr.status && emr.status !== 'Registered' ? 1 : 0));
      totalActualEvents += historyLength;

      const discrepancy = Math.abs(historyLength - systemLogCount);
      totalDiscrepancies += discrepancy;
    }

    // E. Equipment Bookings
    for (const booking of bookings) {
      const systemLogCount = logCountsBySubmission[booking.id] || 0;
      const historyLength = booking.history ? booking.history.length : (systemLogCount || (booking.status && booking.status !== 'Pending' ? 1 : 0));
      totalActualEvents += historyLength;

      const discrepancy = Math.abs(historyLength - systemLogCount);
      totalDiscrepancies += discrepancy;
    }

    const reconstructedEvents = Math.max(0, totalActualEvents - totalDiscrepancies);
    const accuracy = totalActualEvents > 0 ? (reconstructedEvents / totalActualEvents) : 1.0;

    return {
      success: true,
      totalActualEvents,
      totalDiscrepancies,
      reconstructedEvents,
      accuracy: parseFloat(accuracy.toFixed(4))
    };
  } catch (error: any) {
    console.error('Audit reconciliation engine failed:', error);
    return {
      success: false,
      totalActualEvents: 0,
      totalDiscrepancies: 0,
      reconstructedEvents: 0,
      accuracy: 0.0,
      error: error.message || String(error)
    };
  }
}
